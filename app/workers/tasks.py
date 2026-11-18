"""
Video processing pipeline, run in a background thread pool inside the API
process (replaces Celery + Redis). Tasks keep a `.delay(...)` method so the
API code calling `process_video_task.delay(...)` is unchanged.

WORKER_THREADS (env, default 1): how many videos process at once. Keep at 1
unless you have lots of RAM -- Whisper/BLIP/pyannote are memory-hungry.
"""
import os
import json
import shutil
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.config import TEMP_DIR
from app.db.database import SessionLocal
from app.db.models import ProcessingJob, JobStatus, Video
from app.storage.s3_storage import download_file, upload_file
from app.core.preprocessing import extract_audio, extract_keyframes
from app.core.transcription import transcribe
from app.core.vision import caption_keyframes
from app.core.summary import generate_summary
from app.core.qdrant_indexing import index_video
from app.core.diarization import diarize
from app.core.merge_speakers import merge_transcript_with_speakers
from app.core.url_download import download_video_from_url, VideoDownloadError

PIPELINE_DIR = TEMP_DIR / "video_processing"

_executor = ThreadPoolExecutor(max_workers=int(os.environ.get("WORKER_THREADS", "1")))

# --- Live download progress (in-memory; the worker runs inside the API process) ---
_download_progress: dict[str, dict] = {}
_progress_lock = threading.Lock()


def _set_download_progress(job_id: str, **fields):
    with _progress_lock:
        entry = _download_progress.setdefault(job_id, {
            "phase": "starting", "percent": None, "downloaded_bytes": None,
            "total_bytes": None, "speed": None, "eta": None,
        })
        entry.update(fields)


def get_download_progress(job_id: str):
    """Snapshot of a URL job's download progress, or None if it isn't downloading."""
    with _progress_lock:
        entry = _download_progress.get(job_id)
        return dict(entry) if entry else None


def _clear_download_progress(job_id: str):
    with _progress_lock:
        _download_progress.pop(job_id, None)


def _log_failure(fut):
    exc = fut.exception()
    if exc:
        print("Background task failed:")
        traceback.print_exception(type(exc), exc, exc.__traceback__)


def background_task(fn):
    """Give fn a Celery-style .delay() that runs it on the thread pool."""
    def delay(*args, **kwargs):
        fut = _executor.submit(fn, *args, **kwargs)
        fut.add_done_callback(_log_failure)
        return fut
    fn.delay = delay
    return fn


def _update_job(db, job_id: str, **fields):
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if job:
        for key, value in fields.items():
            setattr(job, key, value)
        db.commit()


def _error_text(e: Exception) -> str:
    """Readable, length-capped error message for the UI."""
    return (str(e) or e.__class__.__name__)[:500]


def fail_interrupted_jobs():
    """
    Call once at API startup. Jobs run on in-process threads, so any job still
    PENDING/PROCESSING when the server boots is dead. Marking it failed gives
    the frontend a terminal state instead of polling forever.
    """
    db = SessionLocal()
    try:
        stale = db.query(ProcessingJob).filter(
            ProcessingJob.status.in_([JobStatus.PENDING, JobStatus.PROCESSING])
        ).all()
        for job in stale:
            job.status = JobStatus.FAILED
            job.error_message = "Processing was interrupted by a server restart. Please add the video again."
        db.commit()
    finally:
        db.close()


def _run_pipeline(db, job_id: str, video_id: str, local_video_path: Path):
    """Shared stages: preprocess -> transcribe -> diarize -> caption -> summarize -> index."""
    _update_job(db, job_id, current_stage="preprocessing")
    audio_path = extract_audio(local_video_path)
    keyframes = extract_keyframes(local_video_path)

    _update_job(db, job_id, current_stage="transcribing")
    transcript = transcribe(audio_path, video_id)

    # Speaker labels need pyannote + a free (but gated) Hugging Face token.
    # No token (or nothing was transcribed) = skip this stage; everything else
    # works without speaker labels.
    if os.environ.get("HF_TOKEN") and transcript:
        _update_job(db, job_id, current_stage="diarizing")
        diarize(audio_path, video_id)
        transcript = merge_transcript_with_speakers(video_id)

    _update_job(db, job_id, current_stage="captioning")
    captions = caption_keyframes(keyframes, video_id)

    _update_job(db, job_id, current_stage="summarizing")
    result = generate_summary(transcript, captions, video_id)

    _update_job(db, job_id, current_stage="indexing")
    owner_video = db.query(Video).filter(Video.id == video_id).first()
    index_video(transcript, captions, video_id, owner_video.owner_id)

    _update_job(
        db, job_id,
        status=JobStatus.COMPLETED,
        current_stage="done",
        summary=result["summary"],
        chapters_json=json.dumps(result["chapters"]),
    )


@background_task
def process_video_task(job_id: str, video_id: str, storage_key: str, filename: str):
    """Pipeline for videos uploaded as a file."""
    db = SessionLocal()
    local_dir = PIPELINE_DIR / video_id
    try:
        _update_job(db, job_id, status=JobStatus.PROCESSING, current_stage="downloading")
        local_dir.mkdir(parents=True, exist_ok=True)
        local_video_path = local_dir / f"{video_id}{Path(filename).suffix}"
        download_file(storage_key, local_video_path)
        _run_pipeline(db, job_id, video_id, local_video_path)
    except Exception as e:
        db.rollback()
        _update_job(db, job_id, status=JobStatus.FAILED, error_message=_error_text(e))
        raise
    finally:
        db.close()
        shutil.rmtree(local_dir, ignore_errors=True)


def _remember_title(video_id: str, info: dict):
    """Replace the raw URL in the library with the video's real title.

    Uses its own short-lived session so a failure here can never poison the
    worker's main session, and logs instead of failing silently.
    """
    title = " ".join(str((info or {}).get("title") or "").split())
    if not title:
        return
    db = SessionLocal()
    try:
        video = db.query(Video).filter(Video.id == video_id).first()
        if video:
            video.filename = title[:200]
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"Could not save video title: {e}")
    finally:
        db.close()


@background_task
def process_video_from_url_task(job_id: str, video_id: str, video_url: str):
    """Pipeline for videos submitted as a URL."""
    db = SessionLocal()
    local_dir = PIPELINE_DIR / video_id
    try:
        _set_download_progress(job_id)  # phase="starting"; frontend sees "fetching from source"
        _update_job(db, job_id, status=JobStatus.PROCESSING, current_stage="downloading")

        local_video_path = download_video_from_url(
            video_url, local_dir, video_id,
            on_progress=lambda p: _set_download_progress(job_id, **p),
            on_info=lambda info: _remember_title(video_id, info),
        )

        # Still inside the "downloading" stage: copying into storage can also take a while.
        _set_download_progress(job_id, phase="saving", percent=100.0, speed=None, eta=None)
        storage_key = f"videos/{video_id}/{local_video_path.name}"
        upload_file(local_video_path, storage_key)
        video = db.query(Video).filter(Video.id == video_id).first()
        if video:
            video.storage_key = storage_key
            db.commit()

        _clear_download_progress(job_id)
        _run_pipeline(db, job_id, video_id, local_video_path)
    except VideoDownloadError as e:
        # Expected failure (private video, bad link, ...): surface it, no stack trace noise.
        db.rollback()
        _update_job(db, job_id, status=JobStatus.FAILED, error_message=e.user_message)
        print(f"URL download failed for {video_url}: {e.technical}")
    except Exception as e:
        db.rollback()
        _update_job(db, job_id, status=JobStatus.FAILED, error_message=_error_text(e))
        raise
    finally:
        _clear_download_progress(job_id)
        db.close()
        shutil.rmtree(local_dir, ignore_errors=True)