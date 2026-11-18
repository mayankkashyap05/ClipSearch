"""
Pipeline stage: URL-based video download.
Downloads a video from a URL (YouTube, direct MP4 link, or most platforms
yt-dlp supports) so it can be processed the same way as an uploaded file.

Failures are raised as VideoDownloadError, whose message is safe to show to
end users (friendly summary + the exact yt-dlp error).
"""
import shutil
import re
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urlsplit

import yt_dlp
from yt_dlp.utils import YoutubeDLError

MAX_URL_LENGTH = 2048
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
_ERROR_PREFIX_RE = re.compile(r"^\s*ERROR:\s*", re.IGNORECASE)

ProgressCallback = Callable[[dict], None]
InfoCallback = Callable[[dict], None]


class VideoDownloadError(Exception):
    """A download problem with a message that can be shown directly in the UI."""

    def __init__(self, user_message: str, technical: Optional[str] = None):
        super().__init__(user_message)
        self.user_message = user_message
        self.technical = technical or user_message


# Order matters: first match wins.
_FRIENDLY_ERRORS = [
    (("private video",), "This video is private."),
    (("not a bot",), "The video site is asking for human verification, so the download was blocked. Try again later, or download the file yourself and upload it."),
    (("confirm your age", "age-restricted", "age restricted"), "This video is age-restricted and can't be downloaded without signing in."),
    (("members-only", "members only", "join this channel"), "This video is only available to channel members."),
    (("not available in your country", "blocked it in your country", "geo restricted", "geo-restricted"), "This video isn't available in the server's region."),
    (("video unavailable", "this video is not available", "has been removed", "no longer available", "has been terminated"), "This video is unavailable. It may have been removed or made private."),
    (("unsupported url",), "That link isn't a video page we can download from."),
    (("is not a valid url",), "That doesn't look like a valid video link."),
    (("http error 429", "too many requests"), "The video site is rate-limiting us. Wait a few minutes and try again."),
    (("premieres in", "will begin in", "live event"), "This video is a scheduled premiere or live event that hasn't started yet."),
    (("ffmpeg", "ffprobe"), "ffmpeg isn't available on the server, so the video couldn't be assembled."),
    (("unable to download webpage", "name or service not known", "getaddrinfo", "timed out",
      "temporary failure in name resolution", "connection reset", "network is unreachable"),
     "Couldn't reach the video site. Check the link and the server's internet connection, then try again."),
]


def validate_video_url(url: str) -> str:
    """Return the cleaned URL or raise VideoDownloadError with a user-facing reason."""
    cleaned = (url or "").strip()
    if not cleaned:
        raise VideoDownloadError("Paste a video URL first.")
    if len(cleaned) > MAX_URL_LENGTH:
        raise VideoDownloadError("That link is too long to be a video URL.")
    if any(ch.isspace() for ch in cleaned):
        raise VideoDownloadError("That link contains spaces. Copy the full address from your browser's address bar.")
    try:
        parts = urlsplit(cleaned)
    except ValueError:
        raise VideoDownloadError("That doesn't look like a valid URL.")
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        raise VideoDownloadError("Enter a full http(s) video link, e.g. https://www.youtube.com/watch?v=…")
    return cleaned


def _clean_error_text(exc: BaseException) -> str:
    text = _ANSI_RE.sub("", str(exc))
    text = _ERROR_PREFIX_RE.sub("", text.strip())
    text = " ".join(text.split())
    return text if len(text) <= 300 else text[:297] + "…"


def _to_download_error(exc: BaseException) -> VideoDownloadError:
    detail = _clean_error_text(exc) or exc.__class__.__name__
    lowered = detail.lower()
    for needles, friendly in _FRIENDLY_ERRORS:
        if any(n in lowered for n in needles):
            return VideoDownloadError(f"{friendly} (yt-dlp: {detail})", technical=detail)
    return VideoDownloadError(detail, technical=detail)  # unknown: surface the exact error


def _ensure_single_downloadable_video(info: Optional[dict]) -> None:
    if not info:
        raise VideoDownloadError("No video was found at that link.")
    if info.get("_type") in ("playlist", "multi_video"):
        raise VideoDownloadError("That link points to a playlist or channel. Paste the link to a single video instead.")
    live_status = info.get("live_status")
    if info.get("is_live") or live_status == "is_live":
        # Without this check a live stream would "download" forever and block the worker.
        raise VideoDownloadError("That's a live stream, which can't be processed until the broadcast ends. Try again once it has finished.")
    if live_status == "is_upcoming":
        raise VideoDownloadError("This video hasn't started yet (upcoming premiere or scheduled stream).")
    if live_status == "post_live":
        raise VideoDownloadError("This live stream just ended and is still being processed by the platform. Try again in a little while.")


class _ProgressTracker:
    """Folds yt-dlp's per-stream hooks into one monotonic overall progress report."""

    def __init__(self, callback: Optional[ProgressCallback]):
        self._callback = callback
        self._files: dict[str, tuple[int, int]] = {}
        self._last_percent = 0.0

    def _emit(self, phase, percent=None, downloaded=None, total=None, speed=None, eta=None):
        if not self._callback:
            return
        try:
            self._callback({
                "phase": phase,
                "percent": percent,
                "downloaded_bytes": downloaded,
                "total_bytes": total,
                "speed": speed,
                "eta": eta,
            })
        except Exception:
            pass  # progress reporting must never break a download

    def on_download(self, d: dict) -> None:
        key = d.get("filename") or d.get("tmpfilename") or "stream"
        downloaded = d.get("downloaded_bytes") or 0
        total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
        if d.get("status") == "finished":
            total = downloaded or total
        self._files[key] = (downloaded, total)

        done = sum(v[0] for v in self._files.values())
        known_total = sum(v[1] for v in self._files.values())
        percent = None
        if known_total > 0:
            # Video and audio download as separate streams, so the known total can
            # grow mid-download. Keep the percentage from ever going backwards,
            # and hold at 99% until the file is fully merged/saved.
            percent = max(self._last_percent, min(done / known_total * 100.0, 99.0))
            self._last_percent = percent
        self._emit("downloading", percent, done or None, known_total or None, d.get("speed"), d.get("eta"))

    def on_postprocess(self, d: dict) -> None:
        if d.get("status") == "started":
            self._emit("merging")


def _locate_output(result: Optional[dict], ydl, output_dir: Path, video_id: str) -> Path:
    candidates: list[Path] = []
    for item in (result or {}).get("requested_downloads") or []:
        for key in ("filepath", "_filename", "filename"):
            if item.get(key):
                candidates.append(Path(item[key]))
    if result:
        try:
            predicted = Path(ydl.prepare_filename(result))
            candidates += [predicted, predicted.with_suffix(".mp4")]
        except Exception:
            pass
    for path in candidates:
        if path.is_file():
            return path

    leftovers = [
        p for p in output_dir.glob(f"{video_id}.*")
        if p.is_file() and p.suffix not in {".part", ".ytdl", ".temp"}
    ]
    if leftovers:
        return max(leftovers, key=lambda p: p.stat().st_size)
    raise VideoDownloadError("The download finished, but no video file was produced.")


def _js_runtime_opts() -> dict:
    """yt-dlp auto-detects Deno; if only Node is installed, enable it explicitly."""
    if shutil.which("deno"):
        return {}
    if shutil.which("node"):
        return {"js_runtimes": {"node": {}}}
    return {}

def download_video_from_url(
    url: str,
    output_dir: Path,
    video_id: str,
    on_progress: Optional[ProgressCallback] = None,
    on_info: Optional[InfoCallback] = None,
) -> Path:
    """
    Download a video from a URL and save it as <video_id>.<ext> in output_dir.
    Returns the local file path once the download (and any audio/video merge)
    is complete. Raises VideoDownloadError for anything the user should see.

    on_info(info)      -> called once metadata is known (title, duration, ...)
    on_progress(dict)  -> phase / percent / downloaded_bytes / total_bytes / speed / eta
    """
    url = validate_video_url(url)
    output_dir.mkdir(parents=True, exist_ok=True)
    tracker = _ProgressTracker(on_progress)

    ydl_opts = {
        "outtmpl": str(output_dir / f"{video_id}.%(ext)s"),
        # Prefer a pre-merged mp4; else merge best mp4 video + m4a audio;
        # then any best video+audio pair; "best" is the final single-stream fallback.
        "format": "bv*+ba/b",
        "format_sort": ["res:720", "vcodec:h264", "acodec:aac", "ext:mp4:m4a"],
        "merge_output_format": "mp4",
        # A watch?v=...&list=... link must download ONE video, not the whole playlist.
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "no_color": True,          # keeps ANSI codes out of error messages
        "socket_timeout": 30,      # a stalled connection fails instead of hanging the worker
        "retries": 5,
        "fragment_retries": 5,
        "concurrent_fragment_downloads": 4,
        "progress_hooks": [tracker.on_download],
        "postprocessor_hooks": [tracker.on_postprocess],
        **_js_runtime_opts(),
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Extract metadata first so we can reject playlists/live streams
            # before spending minutes (or forever) downloading.
            info = ydl.extract_info(url, download=False)
            _ensure_single_downloadable_video(info)
            if on_info:
                try:
                    on_info(info)
                except Exception:
                    pass
            result = ydl.process_ie_result(info, download=True)
            return _locate_output(result, ydl, output_dir, video_id)
    except VideoDownloadError:
        raise
    except YoutubeDLError as exc:
        raise _to_download_error(exc) from exc
