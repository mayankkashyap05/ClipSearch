import json
import subprocess
from pathlib import Path

from app.config import PROCESSED_DIR, KEYFRAME_INTERVAL_SECONDS


class MediaProcessingError(RuntimeError):
    """ffmpeg/ffprobe problem; the message is readable enough to show in the UI."""


def _run(cmd, what):
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except FileNotFoundError:
        raise MediaProcessingError("ffmpeg is not installed or not on PATH.") from None
    except subprocess.CalledProcessError as exc:
        # Windows reports negative exit codes as unsigned 32-bit values
        code = exc.returncode - 2**32 if exc.returncode > 2**31 else exc.returncode
        stderr = (exc.stderr or b"").decode("utf-8", errors="replace")
        tail = " | ".join(line.strip() for line in stderr.strip().splitlines()[-4:])
        raise MediaProcessingError(
            f"{what} failed (ffmpeg exit {code}): {tail or 'no details'}"
        ) from exc


def probe_media(path):
    """Return {"has_audio", "has_video", "duration"}.
    Values are None if ffprobe is unavailable or fails."""
    unknown = {"has_audio": None, "has_video": None, "duration": None}
    try:
        res = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-print_format", "json",
                "-show_streams", "-show_format",
                str(path),
            ],
            check=True,
            capture_output=True,
        )
        data = json.loads(res.stdout.decode("utf-8", errors="replace") or "{}")
    except (FileNotFoundError, subprocess.CalledProcessError, json.JSONDecodeError):
        return unknown

    streams = data.get("streams", [])
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    has_video = any(
        s.get("codec_type") == "video"
        and not (s.get("disposition") or {}).get("attached_pic")
        for s in streams
    )
    try:
        duration = float((data.get("format") or {}).get("duration"))
    except (TypeError, ValueError):
        duration = None

    return {"has_audio": has_audio, "has_video": has_video, "duration": duration}


def extract_audio(video_path):
    """Extract 16 kHz mono WAV for Whisper. If the file has no audio stream,
    write a silent WAV so the rest of the pipeline still completes."""
    video_path = Path(video_path)
    out_dir = Path(PROCESSED_DIR) / video_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "audio.wav"

    info = probe_media(video_path)

    if info["has_audio"] is False:
        _run(
            [
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
                "-t", str(info["duration"] or 1.0),
                "-acodec", "pcm_s16le",
                str(out_path),
            ],
            "Silent audio generation",
        )
    else:
        _run(
            [
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(video_path),
                "-map", "0:a:0",
                "-vn", "-ac", "1", "-ar", "16000",
                "-acodec", "pcm_s16le",
                str(out_path),
            ],
            "Audio extraction",
        )
    return str(out_path)


def extract_keyframes(video_path, interval=KEYFRAME_INTERVAL_SECONDS):
    """Extract one JPEG every `interval` seconds.
    Returns [{"timestamp": float, "path": str}, ...]; [] for audio-only media."""
    video_path = Path(video_path)

    if probe_media(video_path)["has_video"] is False:
        return []

    out_dir = Path(PROCESSED_DIR) / video_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    for old in out_dir.glob("frame_*.jpg"):
        old.unlink(missing_ok=True)

    _run(
        [
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(video_path),
            "-vf", f"fps=1/{interval}",
            "-q:v", "2",
            str(out_dir / "frame_%04d.jpg"),
        ],
        "Keyframe extraction",
    )

    frames = sorted(out_dir.glob("frame_*.jpg"))
    return [{"timestamp": i * interval, "path": str(p)} for i, p in enumerate(frames)]


if __name__ == "__main__":
    import sys

    target = sys.argv[1]
    print(probe_media(target))
    print(extract_audio(target))
    print(len(extract_keyframes(target)), "keyframes")