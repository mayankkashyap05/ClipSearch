import { api, apiUrl } from "../../services/api.js";
import { state } from "../../state/app-state.js";
import { formatTime } from "../../utils/format.js";

const PLAYBACK_TOKEN_REFRESH_MS = 45 * 60 * 1000; // Tokens expire after 60 mins

export function createPlayer() {
  const video = document.getElementById("videoPlayer");
  const shell = document.getElementById("playerShell");
  const overlayText = document.getElementById("playerOverlayText");
  const resumeButton = document.getElementById("playerResume");
  const playerToast = document.getElementById("playerToast");
  const bigPlayBtn = document.getElementById("playerBigPlayBtn");

  // Bottom toolbar elements
  const btnPlayPause = document.getElementById("btnPlayPause");
  const btnReplay10 = document.getElementById("btnReplay10");
  const btnForward10 = document.getElementById("btnForward10");
  const btnMuteToggle = document.getElementById("btnMuteToggle");
  const volumeSlider = document.getElementById("volumeSlider");
  const timeCurrent = document.getElementById("timeCurrent");
  const timeDuration = document.getElementById("timeDuration");
  const btnSpeedSelector = document.getElementById("btnSpeedSelector");
  const speedLabel = document.getElementById("speedLabel");
  const speedDropdown = document.getElementById("speedDropdown");
  const btnFullscreen = document.getElementById("btnFullscreen");

  let playheadCallbacks = [];
  let durationCallbacks = [];
  let stateCallbacks = [];
  let toastTimer = null;

  function setPlayerState(name, message) {
    if (shell) shell.dataset.state = name;
    if (["loading", "error", "idle"].includes(name) && overlayText) {
      overlayText.textContent = message || "";
    }
    state.player.isPlaying = name === "playing";
    updatePlayPauseUI();
    stateCallbacks.forEach(cb => cb(name, message));
  }

  function showToast(message, durationMs = 2400) {
    if (!playerToast) return;
    if (toastTimer) window.clearTimeout(toastTimer);
    playerToast.textContent = message;
    playerToast.classList.add("visible");
    toastTimer = window.setTimeout(() => {
      playerToast.classList.remove("visible");
    }, durationMs);
  }

  function showResumeButton(show) {
    if (resumeButton) resumeButton.hidden = !show;
  }

  function updatePlayPauseUI() {
    const isPaused = video.paused || video.ended;
    if (shell) shell.classList.toggle("is-paused", isPaused);
    if (btnPlayPause) {
      btnPlayPause.setAttribute("aria-label", isPaused ? "Play" : "Pause");
      btnPlayPause.title = isPaused ? "Play (Space)" : "Pause (Space)";
      btnPlayPause.classList.toggle("playing", !isPaused);
    }
  }

  function updateTimeDisplay() {
    const current = video.currentTime || 0;
    const dur = video.duration || 0;
    state.player.currentTime = current;
    state.player.duration = dur;

    if (timeCurrent) timeCurrent.textContent = formatTime(current);
    if (timeDuration) timeDuration.textContent = formatTime(dur);
  }

  function updateVolumeUI() {
    const isMuted = video.muted || video.volume === 0;
    state.player.muted = isMuted;
    state.player.volume = video.volume;

    if (btnMuteToggle) {
      btnMuteToggle.classList.toggle("is-muted", isMuted);
      btnMuteToggle.setAttribute("aria-label", isMuted ? "Unmute" : "Mute");
    }
    if (volumeSlider) {
      volumeSlider.value = isMuted ? 0 : video.volume;
    }
  }

  function togglePlay() {
    if (shell && shell.dataset.state === "loading") return;
    if (video.paused || video.ended) {
      video.play().catch(() => {
        showResumeButton(true);
      });
    } else {
      video.pause();
    }
  }

  function seekRelative(seconds) {
    if (!video.duration) return;
    const target = Math.min(Math.max(0, video.currentTime + seconds), video.duration);
    video.currentTime = target;
    const sign = seconds > 0 ? "+" : "";
    showToast(`${sign}${seconds}s (${formatTime(target)})`);
  }

  function setPlaybackRate(rate) {
    video.playbackRate = rate;
    state.player.playbackRate = rate;
    if (speedLabel) speedLabel.textContent = `${rate.toFixed( rate % 1 === 0 ? 1 : 2 )}×`;
    if (speedDropdown) {
      speedDropdown.querySelectorAll(".speed-option").forEach(opt => {
        opt.classList.toggle("active", Number(opt.dataset.speed) === rate);
      });
      speedDropdown.hidden = true;
    }
    showToast(`Speed ${rate}×`);
  }

  function setVolume(vol) {
    video.volume = Math.min(Math.max(0, vol), 1);
    video.muted = video.volume === 0;
    updateVolumeUI();
  }

  function toggleMute() {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 0.5;
    }
    updateVolumeUI();
    showToast(video.muted ? "Muted" : `Volume ${Math.round(video.volume * 100)}%`);
  }

  function toggleFullscreen() {
    const target = shell || video;
    if (!document.fullscreenElement) {
      if (target.requestFullscreen) {
        target.requestFullscreen().catch(() => {});
      } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  function waitForMetadata(element) {
    if (element.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
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

  function loadVideo(videoId, title) {
    const player = state.player;
    const tokenIsFresh = Date.now() - player.tokenIssuedAt < PLAYBACK_TOKEN_REFRESH_MS;
    if (player.videoId === videoId && player.loadPromise && tokenIsFresh) {
      return player.loadPromise;
    }

    player.videoId = videoId;
    player.title = title || "video";
    player.retried = false;
    showResumeButton(false);
    setPlayerState("loading", "Loading video stream…");

    const promise = (async () => {
      const data = await api.getPlaybackToken(videoId);
      const streamUrl = apiUrl(data.stream_url);
      if (player.videoId !== videoId || player.loadPromise !== promise) {
        throw new Error("superseded");
      }
      player.streamUrl = streamUrl;
      player.tokenIssuedAt = Date.now();
      video.src = streamUrl;
      video.load();
      await waitForMetadata(video);
      if (player.videoId !== videoId || player.loadPromise !== promise) {
        throw new Error("superseded");
      }
      setPlayerState("ready", `Ready · ${formatTime(video.duration)}`);
      updateTimeDisplay();
      durationCallbacks.forEach(cb => cb(video.duration));
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
    if (/still being prepared/i.test(message)) {
      return "The video file is still being prepared. Try again in a moment.";
    }
    if (/not found|no longer/i.test(message)) {
      return "This video is no longer available.";
    }
    if (/Session expired/i.test(message)) {
      return message;
    }
    return "This video could not be played. Try reopening the video.";
  }

  async function seekTo(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value)) throw new Error("Invalid timestamp");
    const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
    const target = Math.min(Math.max(value, 0), max);
    video.currentTime = target;
    showToast(`Jumped to ${formatTime(target)}`);

    try {
      await video.play();
      showResumeButton(false);
      return true;
    } catch (_error) {
      showResumeButton(true);
      return false;
    }
  }

  function ensureVideoLoaded(videoItem) {
    if (!videoItem || !videoItem.video_id) return;
    const player = state.player;
    if (player.videoId === videoItem.video_id && player.loadPromise) return;
    loadVideo(videoItem.video_id, videoItem.filename).catch(() => {});
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
    updateTimeDisplay();
  }

  // Event Listeners
  if (btnPlayPause) btnPlayPause.addEventListener("click", togglePlay);
  if (bigPlayBtn) bigPlayBtn.addEventListener("click", togglePlay);
  if (btnReplay10) btnReplay10.addEventListener("click", () => seekRelative(-10));
  if (btnForward10) btnForward10.addEventListener("click", () => seekRelative(10));
  if (btnMuteToggle) btnMuteToggle.addEventListener("click", toggleMute);
  if (volumeSlider) {
    volumeSlider.addEventListener("input", e => setVolume(Number(e.target.value)));
  }
  if (btnSpeedSelector) {
    btnSpeedSelector.addEventListener("click", e => {
      e.stopPropagation();
      const isHidden = speedDropdown.hidden;
      speedDropdown.hidden = !isHidden;
      btnSpeedSelector.setAttribute("aria-expanded", String(isHidden));
    });
  }
  if (speedDropdown) {
    speedDropdown.addEventListener("click", e => {
      const opt = e.target.closest(".speed-option");
      if (opt) setPlaybackRate(Number(opt.dataset.speed));
    });
  }
  document.addEventListener("click", () => {
    if (speedDropdown && !speedDropdown.hidden) {
      speedDropdown.hidden = true;
      if (btnSpeedSelector) btnSpeedSelector.setAttribute("aria-expanded", "false");
    }
  });

  if (btnFullscreen) btnFullscreen.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    const isFs = Boolean(document.fullscreenElement);
    if (shell) shell.classList.toggle("is-fullscreen", isFs);
    if (btnFullscreen) btnFullscreen.classList.toggle("active", isFs);
  });

  if (resumeButton) {
    resumeButton.addEventListener("click", async () => {
      try {
        await video.play();
        showResumeButton(false);
      } catch (_e) {}
    });
  }

  // HTML5 Video Events
  video.addEventListener("play", () => {
    setPlayerState("playing");
    updatePlayPauseUI();
  });
  video.addEventListener("playing", () => {
    setPlayerState("playing");
    updatePlayPauseUI();
  });
  video.addEventListener("pause", () => {
    setPlayerState("ready");
    updatePlayPauseUI();
  });
  video.addEventListener("waiting", () => {
    if (shell.dataset.state === "ready") {
      // transient buffering
    }
  });
  video.addEventListener("ended", () => {
    setPlayerState("ready");
    updatePlayPauseUI();
    showToast("Playback completed");
  });
  video.addEventListener("durationchange", () => {
    updateTimeDisplay();
    durationCallbacks.forEach(cb => cb(video.duration));
  });
  video.addEventListener("timeupdate", () => {
    updateTimeDisplay();
    playheadCallbacks.forEach(cb => cb(video.currentTime, video.duration));
  });
  video.addEventListener("error", () => {
    const player = state.player;
    if (!player.videoId || !video.getAttribute("src")) return;
    if (!player.retried && Date.now() - player.tokenIssuedAt > PLAYBACK_TOKEN_REFRESH_MS) {
      const resumeAt = video.currentTime;
      player.retried = true;
      player.tokenIssuedAt = 0;
      loadVideo(player.videoId, player.title).then(() => {
        video.currentTime = resumeAt;
      }).catch(() => {});
      return;
    }
    player.loadPromise = null;
    setPlayerState("error", "This video could not be played. Try reopening the video.");
  });

  return {
    loadVideo,
    ensureVideoLoaded,
    seekTo,
    seekRelative,
    togglePlay,
    setPlaybackRate,
    setVolume,
    toggleMute,
    toggleFullscreen,
    reset,
    reveal,
    setPlayerState,
    showResumeButton,
    showToast,
    onPlayheadChange(cb) { playheadCallbacks.push(cb); },
    onDurationChange(cb) { durationCallbacks.push(cb); },
    onStateChange(cb) { stateCallbacks.push(cb); },
    getElement() { return video; },
    friendlyPlaybackError,
  };
}
