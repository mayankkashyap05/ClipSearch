import { api, apiUrl } from "../../services/api.js";
import { state } from "../../state/app-state.js";
import { formatTime } from "../../utils/format.js";

const PLAYBACK_TOKEN_REFRESH_MS = 45 * 60 * 1000; // Backend playback tokens expire after 60 minutes.

export function createPlayer() {
  const video = document.getElementById("videoPlayer");
  const shell = document.getElementById("playerShell");
  const status = document.getElementById("playerStatus");
  const overlayText = document.getElementById("playerOverlayText");
  const resumeButton = document.getElementById("playerResume");
  let onPlayheadChange = () => {};

  function setPlayerState(name, message) {
    shell.dataset.state = name;
    if (["loading", "error", "idle"].includes(name)) overlayText.textContent = message || "";
    if (message != null) status.textContent = message;
  }

  function showResumeButton(show) {
    resumeButton.hidden = !show;
  }

  function videoTitleFor(videoId) {
    const item = state.library.items.find(videoItem => videoItem.video_id === videoId);
    return item ? item.filename : null;
  }

  async function getVideoStreamUrl(videoId) {
    const data = await api.getPlaybackToken(videoId);
    return apiUrl(data.stream_url);
  }

  function waitForMetadata(element) {
    if (element.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      // "emptied" and "abort" can fire while a newer source replaces this one;
      // only metadata or a genuine media error resolves/rejects the load.
      const cleanup = () => {
        element.removeEventListener("loadedmetadata", onLoaded);
        element.removeEventListener("error", onError);
      };
      const onLoaded = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error("This video could not be loaded.")); };
      element.addEventListener("loadedmetadata", onLoaded);
      element.addEventListener("error", onError);
    });
  }

  function reset() {
    const player = state.player;
    player.seekRequestId += 1;
    player.videoId = null;
    player.title = null;
    player.streamUrl = null;
    player.tokenIssuedAt = 0;
    player.loadPromise = null;
    player.retried = false;
    player.jumpedAt = 0;
    video.pause();
    video.removeAttribute("src");
    video.load();
    showResumeButton(false);
    setPlayerState("idle", "Select a video to play.");
  }

  function loadVideo(videoId, title) {
    const player = state.player;
    const tokenIsFresh = Date.now() - player.tokenIssuedAt < PLAYBACK_TOKEN_REFRESH_MS;
    if (player.videoId === videoId && player.loadPromise && tokenIsFresh) return player.loadPromise;

    player.videoId = videoId;
    player.title = title || videoTitleFor(videoId) || "video";
    player.retried = false;
    showResumeButton(false);
    setPlayerState("loading", "Loading video…");

    const promise = (async () => {
      const streamUrl = await getVideoStreamUrl(videoId);
      if (player.videoId !== videoId || player.loadPromise !== promise) throw new Error("superseded");
      player.streamUrl = streamUrl;
      player.tokenIssuedAt = Date.now();
      video.src = streamUrl;
      video.load();
      await waitForMetadata(video);
      if (player.videoId !== videoId || player.loadPromise !== promise) throw new Error("superseded");
      setPlayerState("ready", "Ready · " + formatTime(video.duration));
    })();

    player.loadPromise = promise;
    promise.catch(error => {
      if (error.message === "superseded") return;
      if (player.loadPromise === promise) {
        player.loadPromise = null;
        setPlayerState("error", friendlyPlaybackError(error));
      }
    });
    return promise;
  }

  function friendlyPlaybackError(error) {
    const message = String(error && error.message || "");
    if (/still being prepared/i.test(message)) return "The video file is still being prepared. Try again in a moment.";
    if (/not found|no longer/i.test(message)) return "This video is no longer available.";
    if (/Session expired/i.test(message)) return message;
    return "This video could not be played. Try reopening the video.";
  }

  function clampTimestamp(timestamp, duration) {
    const value = Number(timestamp);
    if (!Number.isFinite(value)) return null;
    const max = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
    return Math.min(Math.max(value, 0), max);
  }

  async function seekTo(timestamp) {
    const target = clampTimestamp(timestamp, video.duration);
    if (target == null) throw new Error("Invalid timestamp");
    video.currentTime = target;
    try {
      await video.play();
      return true;
    } catch (_error) {
      return false;
    }
  }

  function ensureVideoLoaded(videoItem) {
    if (!videoItem || !videoItem.video_id) return;
    const player = state.player;
    if (player.videoId === videoItem.video_id && player.loadPromise) return;
    loadVideo(videoItem.video_id, videoItem.filename).catch(() => {
      // The player presents the loading/playback error inline.
    });
  }

  function reveal() {
    const narrow = window.matchMedia("(max-width: 900px)").matches;
    if (narrow) {
      shell.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const rect = shell.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      shell.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function recentlyJumped() {
    return Date.now() - state.player.jumpedAt < 4000;
  }

  resumeButton.addEventListener("click", async () => {
    try {
      await video.play();
      showResumeButton(false);
    } catch (_error) {
      setPlayerState("ready", "Playback was blocked by the browser. Use the player controls.");
    }
  });

  video.addEventListener("waiting", () => {
    if (shell.dataset.state === "ready" && !recentlyJumped()) status.textContent = "Buffering…";
  });
  video.addEventListener("playing", () => {
    if (shell.dataset.state !== "ready") return;
    showResumeButton(false);
    if (!recentlyJumped()) status.textContent = "Playing · " + formatTime(video.currentTime) + " / " + formatTime(video.duration);
  });
  video.addEventListener("pause", () => {
    if (shell.dataset.state === "ready" && !video.ended) status.textContent = "Paused at " + formatTime(video.currentTime);
  });
  video.addEventListener("ended", () => {
    if (shell.dataset.state === "ready") status.textContent = "Finished · " + formatTime(video.duration);
  });
  video.addEventListener("timeupdate", () => onPlayheadChange(video.currentTime));
  video.addEventListener("error", () => {
    const player = state.player;
    if (!player.videoId || !video.getAttribute("src")) return;
    // Refresh an old video-bound token once, preserving the current playhead.
    if (!player.retried && Date.now() - player.tokenIssuedAt > PLAYBACK_TOKEN_REFRESH_MS) {
      const resumeAt = video.currentTime;
      player.retried = true;
      player.tokenIssuedAt = 0;
      loadVideo(player.videoId, player.title).then(() => { video.currentTime = resumeAt; }).catch(() => {});
      return;
    }
    player.loadPromise = null;
    setPlayerState("error", "This video could not be played. Try reopening the video.");
  });

  return {
    loadVideo,
    ensureVideoLoaded,
    seekTo,
    reset,
    reveal,
    setPlayerState,
    showResumeButton,
    setOnPlayheadChange(callback) { onPlayheadChange = callback || (() => {}); },
    getElement() { return video; },
    friendlyPlaybackError,
  };
}
