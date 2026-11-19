import { api, apiUrl } from "../../services/api.js";
import { state } from "../../state/app-state.js";
import { formatTime } from "../../utils/format.js";

const PLAYBACK_TOKEN_REFRESH_MS = 45 * 60 * 1000; // Backend playback tokens expire after 60 minutes.

// Automatic backoff retry schedule for post-download readiness gaps (e.g. file copy,
// Windows AV lock, or brief 409/5xx). Total window: ~39 seconds across 8 retries.
const RETRY_BACKOFF_MS = Object.freeze([1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000]);

function createCodedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPermanentHttpError(error) {
  const status = error && error.status;
  return status === 401 || status === 403 || status === 404;
}

/**
 * @param {{ canLoad?: (videoId: string) => boolean }} [options]
 *   canLoad is a readiness gate. While it returns false for a video, the player will
 *   not request a playback token or touch the <video> element for that video.
 */
export function createPlayer({ canLoad = () => true } = {}) {
  const video = document.getElementById("videoPlayer");
  const shell = document.getElementById("playerShell");
  const status = document.getElementById("playerStatus");
  const overlayText = document.getElementById("playerOverlayText");
  const resumeButton = document.getElementById("playerResume");

  let onPlayheadChange = () => {};
  let loadEpoch = 0;
  let retryTimer = null;
  let cancelRetrySleep = null;
  let cancelMetadataWait = null;

  function setPlayerState(name, message) {
    state.player.state = name;
    shell.dataset.state = name;
    if (name === "ready") {
      // Explicitly clear any stale error text when transitioning to ready.
      overlayText.textContent = "";
    } else if (["loading", "error", "idle"].includes(name)) {
      overlayText.textContent = message || "";
    }
    if (message != null) status.textContent = message;
  }

  function showResumeButton(show) {
    resumeButton.hidden = !show;
  }

  function videoTitleFor(videoId) {
    const item = state.library.items.find(videoItem => videoItem.video_id === videoId);
    return item ? item.filename : null;
  }

  function abortPendingMetadataWait() {
    if (cancelMetadataWait) {
      const cancel = cancelMetadataWait;
      cancelMetadataWait = null;
      cancel();
    }
  }

  function cancelAutoRetry() {
    if (retryTimer) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (cancelRetrySleep) {
      const cancel = cancelRetrySleep;
      cancelRetrySleep = null;
      cancel();
    }
  }

  function detachMediaElement() {
    state.player.streamUrl = null;
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  async function getVideoStreamUrl(videoId) {
    const data = await api.getPlaybackToken(videoId);
    return apiUrl(data.stream_url);
  }

  function waitForMetadata(element, epoch) {
    abortPendingMetadataWait();
    return new Promise((resolve, reject) => {
      if (epoch !== loadEpoch) {
        reject(createCodedError("superseded", "SUPERSEDED"));
        return;
      }
      if (element.readyState >= 1) {
        resolve();
        return;
      }

      let settled = false;
      const cleanup = () => {
        element.removeEventListener("loadedmetadata", onLoaded);
        element.removeEventListener("error", onError);
        if (cancelMetadataWait === onCancel) cancelMetadataWait = null;
      };
      const onLoaded = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (epoch !== loadEpoch) reject(createCodedError("superseded", "SUPERSEDED"));
        else resolve();
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (epoch !== loadEpoch) reject(createCodedError("superseded", "SUPERSEDED"));
        else reject(createCodedError("This video could not be loaded.", "MEDIA_LOAD_ERROR"));
      };
      const onCancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(createCodedError("superseded", "SUPERSEDED"));
      };

      cancelMetadataWait = onCancel;
      element.addEventListener("loadedmetadata", onLoaded);
      element.addEventListener("error", onError);
    });
  }

  function sleepForEpoch(ms, epoch) {
    cancelAutoRetry();
    return new Promise((resolve, reject) => {
      if (epoch !== loadEpoch) {
        reject(createCodedError("superseded", "SUPERSEDED"));
        return;
      }
      let settled = false;
      cancelRetrySleep = () => {
        if (settled) return;
        settled = true;
        reject(createCodedError("superseded", "SUPERSEDED"));
      };
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        cancelRetrySleep = null;
        if (settled) return;
        settled = true;
        if (epoch !== loadEpoch) reject(createCodedError("superseded", "SUPERSEDED"));
        else resolve();
      }, ms);
    });
  }

  function reset() {
    const player = state.player;
    // Incrementing loadEpoch invalidates all in-flight token fetches, metadata waits,
    // retry timers, and queued media error events.
    loadEpoch += 1;
    cancelAutoRetry();
    abortPendingMetadataWait();
    player.seekRequestId += 1;
    player.videoId = null;
    player.title = null;
    player.streamUrl = null;
    player.tokenIssuedAt = 0;
    player.loadPromise = null;
    player.retried = false;
    player.autoRetries = 0;
    player.jumpedAt = 0;
    detachMediaElement();
    showResumeButton(false);
    overlayText.textContent = "";
    setPlayerState("idle", "Select a video to play.");
  }

  function loadVideo(videoId, title, options = {}) {
    const player = state.player;
    const force = Boolean(options.force);

    // Strict readiness gate: never fetch a token or touch <video> while deferred.
    if (!canLoad(videoId)) {
      return Promise.reject(createCodedError("The video file is still being prepared.", "DEFERRED"));
    }

    const tokenIsFresh = Date.now() - player.tokenIssuedAt < PLAYBACK_TOKEN_REFRESH_MS;
    if (
      !force &&
      player.videoId === videoId &&
      player.loadPromise &&
      player.state !== "error" &&
      tokenIsFresh
    ) {
      return player.loadPromise;
    }

    // Start a clean load epoch: cancel pending retries/waits, reset retry counter,
    // and detach any old src BEFORE awaiting the network token request.
    const epoch = ++loadEpoch;
    cancelAutoRetry();
    abortPendingMetadataWait();
    detachMediaElement();

    player.videoId = videoId;
    player.title = title || videoTitleFor(videoId) || "video";
    player.tokenIssuedAt = 0;
    player.retried = false;
    player.autoRetries = 0;
    showResumeButton(false);
    setPlayerState("loading", "Loading video…");

    const promise = (async () => {
      let lastError = null;

      for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt += 1) {
        if (epoch !== loadEpoch) throw createCodedError("superseded", "SUPERSEDED");
        if (!canLoad(videoId)) {
          reset();
          throw createCodedError("The video file is still being prepared.", "DEFERRED");
        }

        if (attempt > 0) {
          setPlayerState("loading", "Preparing your video for playback… retrying");
        }

        try {
          const streamUrl = await getVideoStreamUrl(videoId);
          if (epoch !== loadEpoch) throw createCodedError("superseded", "SUPERSEDED");
          if (!canLoad(videoId)) {
            reset();
            throw createCodedError("The video file is still being prepared.", "DEFERRED");
          }

          player.streamUrl = streamUrl;
          player.tokenIssuedAt = Date.now();
          video.src = streamUrl;
          video.load();
          await waitForMetadata(video, epoch);

          if (epoch !== loadEpoch) throw createCodedError("superseded", "SUPERSEDED");
          player.autoRetries = 0;
          const durationLabel = Number.isFinite(video.duration) && video.duration > 0
            ? "Ready · " + formatTime(video.duration)
            : "Ready";
          setPlayerState("ready", durationLabel);
          return;
        } catch (error) {
          if (error && (error.code === "SUPERSEDED" || error.code === "DEFERRED")) throw error;
          if (epoch !== loadEpoch) throw createCodedError("superseded", "SUPERSEDED");
          if (!canLoad(videoId)) {
            reset();
            throw createCodedError("The video file is still being prepared.", "DEFERRED");
          }

          lastError = error;
          detachMediaElement();

          if (isPermanentHttpError(error) || attempt >= RETRY_BACKOFF_MS.length) {
            break;
          }

          player.autoRetries = attempt + 1;
          setPlayerState("loading", "Still preparing your video… retrying");
          await sleepForEpoch(RETRY_BACKOFF_MS[attempt], epoch);
        }
      }

      if (epoch !== loadEpoch) throw createCodedError("superseded", "SUPERSEDED");
      player.loadPromise = null;
      const finalError = lastError || new Error("This video could not be played.");
      setPlayerState("error", friendlyPlaybackError(finalError));
      throw finalError;
    })();

    player.loadPromise = promise;
    promise.catch(error => {
      // Prevent unhandled rejection noise for internal callers while keeping the rejection
      // observable to callers that await loadVideo().
      if (player.loadPromise === promise && error && error.code !== "SUPERSEDED") {
        player.loadPromise = null;
      }
    });
    return promise;
  }

  function friendlyPlaybackError(error) {
    const message = String((error && error.message) || "");
    if (/still being prepared/i.test(message)) return "The video file is still being prepared. Try again in a moment.";
    if (/not found|no longer/i.test(message) || (error && error.status === 404)) return "This video is no longer available.";
    if (/Session expired/i.test(message) || (error && error.status === 401)) return "Session expired. Please sign in again.";
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

  function ensureVideoLoaded(videoItem, options = {}) {
    if (!videoItem || !videoItem.video_id) return;
    if (!canLoad(videoItem.video_id)) return;
    const player = state.player;
    const force = Boolean(options.force);
    const tokenIsFresh = Date.now() - player.tokenIssuedAt < PLAYBACK_TOKEN_REFRESH_MS;
    if (
      !force &&
      player.videoId === videoItem.video_id &&
      player.loadPromise &&
      player.state !== "error" &&
      tokenIsFresh
    ) {
      return;
    }
    loadVideo(videoItem.video_id, videoItem.filename, { force: force || player.state === "error" }).catch(() => {
      // Inline player state already reflects loading or terminal failure.
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
    if (state.player.state === "ready" && !recentlyJumped()) status.textContent = "Buffering…";
  });
  video.addEventListener("playing", () => {
    if (state.player.state !== "ready") return;
    showResumeButton(false);
    if (!recentlyJumped()) status.textContent = "Playing · " + formatTime(video.currentTime) + " / " + formatTime(video.duration);
  });
  video.addEventListener("pause", () => {
    if (state.player.state === "ready" && !video.ended) status.textContent = "Paused at " + formatTime(video.currentTime);
  });
  video.addEventListener("ended", () => {
    if (state.player.state === "ready") status.textContent = "Finished · " + formatTime(video.duration);
  });
  video.addEventListener("timeupdate", () => onPlayheadChange(video.currentTime));

  // Initial-load errors are owned exclusively by waitForMetadata() inside loadVideo().
  // This listener handles mid-playback failures only (e.g. expired playback token or network drop).
  video.addEventListener("error", () => {
    const player = state.player;
    if (player.state !== "ready") return;
    if (!player.videoId || !player.streamUrl) return;
    if (video.getAttribute("src") !== player.streamUrl) return;

    if (!canLoad(player.videoId)) {
      reset();
      return;
    }

    const videoId = player.videoId;
    const title = player.title;
    const resumeAt = video.currentTime;
    const errorEpoch = loadEpoch;

    // Reload with full automatic backoff retry and restore playhead on recovery.
    loadVideo(videoId, title, { force: true })
      .then(() => {
        if (state.player.videoId === videoId && resumeAt > 0 && Number.isFinite(video.duration)) {
          video.currentTime = Math.min(resumeAt, video.duration);
        }
      })
      .catch(() => {
        if (errorEpoch !== loadEpoch) return;
      });
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