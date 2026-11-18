import { api } from "../../services/api.js";
import { state } from "../../state/app-state.js";
import { showToast } from "../../components/feedback.js";
import { showScreen } from "../../components/navigation.js";
import { escapeHtml, parseChapters } from "../../utils/format.js";

const STAGE_ORDER = ["downloading", "preprocessing", "transcribing", "diarizing", "captioning", "summarizing", "indexing", "done"];
const STAGE_LABELS = {
  downloading: "Downloading",
  preprocessing: "Preprocessing",
  transcribing: "Transcription",
  diarizing: "Speaker diarization",
  captioning: "Visual captioning",
  summarizing: "Summarizing",
  indexing: "Indexing",
  done: "Complete",
};
const STAGE_ACTIVITY = {
  preprocessing: "Extracting audio and keyframes…",
  transcribing: "Transcribing speech. Longer videos take a while.",
  diarizing: "Working out who is speaking…",
  captioning: "Describing key visual moments…",
  summarizing: "Writing the summary and chapters…",
  indexing: "Indexing everything for search…",
};
const PROCESSING_STAGES = new Set(["pending", "processing"]);
// While a job is in one of these stages the media file may not exist yet.
const MEDIA_PENDING_STAGES = new Set(["pending", "downloading"]);

// Polling. There is deliberately NO overall timeout: a job keeps being tracked
// until the server reports completed/failed. Only repeated network errors stop it.
const POLL_FAST_MS = 1500;           // while a download is reporting progress
const POLL_NORMAL_MS = 3000;
const POLL_RETRY_MAX_MS = 15000;     // backoff ceiling after failed requests
const POLL_MAX_CONSECUTIVE_ERRORS = 20;
const SLOW_DOWNLOAD_HINT_MS = 90 * 1000;

const DEFAULT_CAPTION = "Your video will be searchable when indexing is complete.";
const URL_DOWNLOAD_CAPTION = "Fetching your video from its source. Long videos can take a few minutes.";
const SLOW_DOWNLOAD_CAPTION = "Still downloading. Large videos can take several minutes. Keep this tab open and we'll continue automatically.";

function setText(element, text) {
  // Only touch the DOM when text changes (avoids needless screen-reader chatter).
  if (element && element.textContent !== text) element.textContent = text;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function computeProgress(stage, completed, downloadPercent) {
  if (completed) return 1;
  const index = STAGE_ORDER.indexOf(stage);
  if (index < 0) return 0;
  const fraction = stage === "downloading" && downloadPercent != null ? downloadPercent / 100 : 0;
  return Math.min((index + fraction) / (STAGE_ORDER.length - 1), 1);
}

function describeDownloadProgress(download, elapsedText) {
  const parts = [];
  if (download.percent != null) parts.push(`${Math.floor(download.percent)}%`);
  if (download.downloaded_bytes) {
    const done = formatBytes(download.downloaded_bytes);
    parts.push(download.total_bytes ? `${done} of ${formatBytes(download.total_bytes)}` : done);
  }
  if (download.speed) parts.push(`${formatBytes(download.speed)}/s`);
  if (download.eta != null && download.eta > 0) parts.push(`~${formatClock(download.eta)} left`);
  parts.push(`${elapsedText} elapsed`);
  return parts.join(" · ");
}

function placeholderConfig({ failed = false, fromUrl = false } = {}) {
  if (failed) {
    return {
      state: "failed",
      title: "Couldn’t fetch this video",
      text: "The download didn’t finish. See the details below.",
    };
  }
  return {
    state: "loading",
    title: fromUrl ? "Fetching your video from its source…" : "Getting your video ready…",
    text: "The player will appear as soon as the file is available.",
  };
}

export function createWorkspaceFeature({ player, refreshVideos, resetChat }) {
  const centerEmpty = document.getElementById("centerEmpty");
  const centerContent = document.getElementById("centerContent");
  const signalPath = document.getElementById("signalPath");
  const ingestError = document.getElementById("ingestError");
  const signalSteps = document.getElementById("signalSteps");
  const signalCaption = signalPath.querySelector(".signal-caption");
  const signalStatus = document.getElementById("signalStatus");
  const signalStatusText = document.getElementById("signalStatusText");
  const signalStatusDetail = document.getElementById("signalStatusDetail");
  const mediaPending = document.getElementById("mediaPending");
  const mediaPendingTitle = document.getElementById("mediaPendingTitle");
  const mediaPendingText = document.getElementById("mediaPendingText");
  const playerShell = document.getElementById("playerShell");
  const videoPlayer = document.getElementById("videoPlayer");

  let lastStepsKey = null;
  let pollNow = null;

  // Add this listener to close the active workspace session if deleted
  window.addEventListener("videoDeleted", event => {
    if (state.workspace.selectedVideoId === event.detail.videoId) {
      reset();
    }
  });

  function openWorkspace(focusTarget) {
    showScreen("workspace", { focus: !focusTarget });
    if (focusTarget === "upload") requestAnimationFrame(() => document.getElementById("dropZone").focus());
    if (focusTarget === "search") requestAnimationFrame(() => document.getElementById("searchInput").focus());
  }

  function clearIngestError() {
    ingestError.textContent = "";
  }

  function showIngestError(message) {
    ingestError.textContent = message;
  }

  function setScope(videoId, title) {
    state.workspace.scopedVideoId = videoId || null;
    state.workspace.scopedVideoTitle = videoId ? (title || videoId) : null;
    const chip = document.getElementById("scopeChip");
    const chatInput = document.getElementById("chatInput");
    const chatButton = document.getElementById("chatBtn");
    const disabledNote = document.getElementById("chatDisabledNote");
    const chatContext = document.getElementById("chatContext");

    if (videoId) {
      chip.classList.add("show");
      document.getElementById("scopeChipLabel").textContent = "Video: " + (title || videoId);
      chatInput.disabled = state.chat.pending;
      chatButton.disabled = state.chat.pending;
      chatInput.placeholder = "Ask about this video…";
      disabledNote.hidden = true;
      chatContext.hidden = false;
      chatContext.textContent = title || videoId;
    } else {
      chip.classList.remove("show");
      chatInput.disabled = true;
      chatButton.disabled = true;
      chatInput.placeholder = "Select a video first…";
      disabledNote.hidden = false;
      chatContext.hidden = true;
      chatContext.textContent = "";
    }
  }

  // ───────────── Signal path (progress UI) ─────────────

  function renderSignalSteps(currentStage, failed, completed) {
    // Only rebuild when something structural changes; rebuilding every poll
    // would restart the pulse animation and flicker.
    const key = `${currentStage}|${failed}|${completed}`;
    if (key === lastStepsKey) return;
    lastStepsKey = key;

    const currentIndex = STAGE_ORDER.indexOf(currentStage);
    signalSteps.innerHTML = STAGE_ORDER.map((stage, index) => {
      let className = "";
      let mark = "";
      let time = "";
      if (failed && index === Math.max(currentIndex, 0)) {
        className = "failed";
        mark = "×";
        time = "Failed";
      } else if (completed || (currentIndex >= 0 && index < currentIndex)) {
        className = "done";
        mark = "✓";
        time = "Done";
      } else if (currentIndex === index) {
        className = "active";
        mark = "·";
        time = "Running";
      }
      return `<div class="signal-step ${className}"><span class="step-check" aria-hidden="true">${mark}</span><span class="signal-step-label">${STAGE_LABELS[stage]}</span><span class="signal-step-time">${time}</span></div>`;
    }).join("");
  }

  function paintSignal(view) {
    renderSignalSteps(view.stage, view.failed, view.completed);
    if (view.stepLabel) setText(signalSteps.querySelector(".signal-step.active .signal-step-time"), view.stepLabel);
    signalPath.style.setProperty("--progress", String(view.progress));
    signalPath.dataset.state = view.failed ? "failed" : view.completed ? "done" : "running";
    signalPath.dataset.waiting = view.waiting ? "true" : "false";
    setText(signalCaption, view.caption);
    signalStatus.hidden = !view.statusText;
    setText(signalStatusText, view.statusText || "");
    setText(signalStatusDetail, view.statusDetail || "");
  }

  function paintInitial(run, stageHint) {
    lastStepsKey = null;
    const stage = STAGE_ORDER.includes(stageHint) ? stageHint : "downloading";
    const downloading = stage === "downloading";
    paintSignal({
      stage,
      failed: false,
      completed: false,
      waiting: downloading,
      progress: computeProgress(stage, false, null),
      stepLabel: downloading ? (run.isUrlSource ? "Connecting…" : "Starting…") : "Running",
      statusText: downloading
        ? (run.isUrlSource ? "Contacting the video source…" : "Starting…")
        : (STAGE_ACTIVITY[stage] || "Working…"),
      statusDetail: "",
      caption: run.isUrlSource ? URL_DOWNLOAD_CAPTION : DEFAULT_CAPTION,
    });
  }

  /** Turn a /jobs/{id} payload into everything the signal path needs to show. */
  function describeJob(job, run) {
    const failed = job.status === "failed";
    const completed = job.status === "completed";
    const pending = job.status === "pending";
    const stage = pending ? "downloading" : (job.current_stage || "downloading");
    const view = {
      stage, failed, completed,
      waiting: false,
      progress: computeProgress(stage, completed, null),
      stepLabel: "Running",
      statusText: "",
      statusDetail: "",
      caption: DEFAULT_CAPTION,
    };

    if (failed) {
      view.caption = "Processing stopped.";
      return view;
    }
    if (completed) {
      view.caption = "Complete. Your video is searchable.";
      return view;
    }

    const elapsedMs = Date.now() - run.stageSince;
    const elapsed = formatClock(elapsedMs / 1000);

    if (pending) {
      view.waiting = true;
      view.stepLabel = "Queued";
      view.caption = "Queued. Waiting for processing to begin.";
      view.statusText = "Waiting for a free processing slot…";
      view.statusDetail = `${elapsed} elapsed`;
      return view;
    }

    if (stage !== "downloading") {
      view.statusText = STAGE_ACTIVITY[stage] || "Working…";
      view.statusDetail = `${elapsed} in this step`;
      return view;
    }

    // ── Downloading stage ──
    const download = job.download || null;
    if (!download && !run.isUrlSource) {
      view.waiting = true;
      view.statusText = "Preparing your video…";
      view.statusDetail = `${elapsed} elapsed`;
      return view;
    }

    view.caption = URL_DOWNLOAD_CAPTION;
    // No `download` object while we know it's a URL job = the brief gap between saving and the next stage.
    const phase = download ? download.phase : "saving";
    switch (phase) {
      case "downloading": {
        const percent = download.percent;
        if (percent != null) {
          view.progress = computeProgress(stage, false, percent);
          view.stepLabel = `${Math.floor(percent)}%`;
        } else {
          view.waiting = true;
          view.stepLabel = "Fetching…";
        }
        view.statusText = "Downloading from source…";
        view.statusDetail = describeDownloadProgress(download, elapsed);
        if (elapsedMs > SLOW_DOWNLOAD_HINT_MS) view.caption = SLOW_DOWNLOAD_CAPTION;
        break;
      }
      case "merging":
        view.waiting = true;
        view.stepLabel = "Finishing…";
        view.statusText = "Download complete. Combining audio and video…";
        view.statusDetail = `${elapsed} elapsed`;
        break;
      case "saving":
        view.waiting = true;
        view.stepLabel = "Saving…";
        view.statusText = "Saving the video to your library…";
        view.statusDetail = `${elapsed} elapsed`;
        break;
      default: // "starting"
        view.waiting = true;
        view.stepLabel = "Connecting…";
        view.statusText = "Contacting the video source…";
        view.statusDetail = `${elapsed} elapsed`;
    }
    return view;
  }

  // ───────────── Media placeholder (no player until the file exists) ─────────────

  function setMediaPlaceholder(config) {
    if (!mediaPending) return;
    if (!config) {
      mediaPending.hidden = true;
      if (playerShell) playerShell.hidden = false;
      return;
    }
    mediaPending.hidden = false;
    mediaPending.dataset.state = config.state;
    setText(mediaPendingTitle, config.title);
    setText(mediaPendingText, config.text);
    if (playerShell) playerShell.hidden = true;
  }

  function pausePlayback() {
    // A previously selected video must not keep playing behind the placeholder.
    if (videoPlayer && typeof videoPlayer.pause === "function") videoPlayer.pause();
  }

  function releaseDeferredPlayer(run) {
    run.playerDeferred = false;
    setMediaPlaceholder(null);
    if (state.workspace.selectedVideoId === run.videoId && state.ui.screen === "workspace") {
      player.ensureVideoLoaded({ ...run.video, video_id: run.videoId, filename: run.title });
    }
  }

  // ───────────── Polling ─────────────

  function clearPollTimer() {
    if (state.workspace.jobPollTimer) window.clearTimeout(state.workspace.jobPollTimer);
    state.workspace.jobPollTimer = null;
  }

  function stopJobPolling() {
    clearPollTimer();
    state.workspace.activeJobId = null;
    pollNow = null;
  }

  function adoptServerTitle(job, run) {
    // The backend swaps the raw URL for the video's real title once it knows it.
    if (!job.filename || job.filename === run.title) return;
    run.title = job.filename;
    if (state.workspace.selectedVideoId === run.videoId) {
      document.getElementById("centerTitle").textContent = run.title;
    }
    if (state.workspace.scopedVideoId === run.videoId) setScope(run.videoId, run.title);
  }

  /** Returns true when the job reached a terminal state (stop polling). */
  function handleJobUpdate(job, run) {
    const failed = job.status === "failed";
    const completed = job.status === "completed";
    const pending = job.status === "pending";
    const stageKey = pending ? "pending" : (job.current_stage || "downloading");

    if (run.stageKey !== stageKey) {
      run.stageKey = stageKey;
      run.stageSince = Date.now();
    }
    if (job.download) run.isUrlSource = true;
    adoptServerTitle(job, run);
    paintSignal(describeJob(job, run));

    if (!failed && !completed) {
      if (run.playerDeferred) {
        if (MEDIA_PENDING_STAGES.has(stageKey)) {
          setMediaPlaceholder(placeholderConfig({ fromUrl: run.isUrlSource }));
        } else {
          releaseDeferredPlayer(run); // file is stored; the player can load it now
        }
      }
      return false;
    }

    refreshVideos();
    const viewing = state.workspace.selectedVideoId === run.videoId && state.ui.screen === "workspace";
    const downloadFailed = failed && run.isUrlSource && MEDIA_PENDING_STAGES.has(stageKey);

    if (viewing) {
      showCenterForVideo({
        video_id: job.video_id,
        filename: run.title || job.video_id,
        summary: job.summary,
        chapters: job.chapters,
        status: job.status,
        error_message: job.error_message,
        defer_player: downloadFailed, // no media exists, so don't try to play it
        from_url: run.isUrlSource,
      });
      if (failed) {
        const prefix = downloadFailed ? "Download failed: " : "Processing failed: ";
        showIngestError(job.error_message
          ? prefix + job.error_message
          : downloadFailed
            ? "Download failed. Check the link and try again."
            : "Processing failed. You can try adding the video again.");
      } else {
        clearIngestError();
        showToast("success", "Your video is indexed and ready to search.");
      }
    } else if (failed) {
      showToast("error", downloadFailed ? "A video download failed." : "Video processing failed.");
    }
    return true;
  }

  function startPollingJob(jobId, videoId, title, options = {}) {
    stopJobPolling();
    state.workspace.activeJobId = jobId;
    signalPath.hidden = false;

    const run = {
      jobId,
      videoId,
      title,
      video: options.video || { video_id: videoId, filename: title },
      isUrlSource: options.source === "url",
      playerDeferred: Boolean(options.deferPlayer),
      stageKey: null,
      stageSince: Date.now(),
      errors: 0,
    };
    const isCurrent = () => state.workspace.activeJobId === jobId;
    let inFlight = false;

    paintInitial(run, options.video && options.video.current_stage);

    const poll = async () => {
      if (inFlight || !isCurrent()) return;
      inFlight = true;
      clearPollTimer();
      let keepPolling = true;
      let nextDelay = POLL_NORMAL_MS;
      try {
        const job = await api.getJob(jobId);
        if (!isCurrent()) return;
        run.errors = 0;
        keepPolling = !handleJobUpdate(job, run);
        if (job.download) nextDelay = POLL_FAST_MS;
      } catch (error) {
        if (!isCurrent()) return;
        run.errors += 1;
        const status = error && error.status;
        const permanent = status === 401 || status === 403 || status === 404;
        if (permanent || run.errors >= POLL_MAX_CONSECUTIVE_ERRORS) {
          keepPolling = false;
          signalStatus.hidden = false;
          setText(signalStatusText, "Stopped checking for updates.");
          setText(signalStatusDetail, "");
          if (state.ui.screen === "workspace") {
            showIngestError(permanent
              ? "This processing job is no longer available. Refresh your library to check its status."
              : "We lost contact with the server. The job may still be running. Reopen the video from your library to resume tracking it.");
          }
        } else {
          // Transient failure (wifi blip, laptop sleep, server busy): stay on the
          // loading screen and retry with backoff instead of giving up.
          nextDelay = Math.min(POLL_NORMAL_MS * 1.5 ** run.errors, POLL_RETRY_MAX_MS);
          signalStatus.hidden = false;
          setText(signalStatusText, "Connection interrupted. Retrying…");
          setText(signalStatusDetail, `attempt ${run.errors}`);
        }
      } finally {
        inFlight = false;
        if (!keepPolling) pollNow = null;
        if (keepPolling && isCurrent()) {
          state.workspace.jobPollTimer = window.setTimeout(poll, nextDelay);
        }
      }
    };

    pollNow = () => {
      if (!inFlight && isCurrent()) poll();
    };
    poll();
  }

  // Browsers throttle timers in background tabs; catch up the moment the tab is visible again.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && pollNow) pollNow();
  });

  // ───────────── Entry points ─────────────

  function beginProcessing(jobId, videoId, title, options = {}) {
    const fromUrl = options.source === "url";
    clearIngestError();
    signalPath.hidden = false;
    if (videoId) setScope(videoId, title);
    showCenterForVideo({
      video_id: videoId,
      filename: title,
      status: "processing",
      defer_player: fromUrl,   // URL videos have no file until the download finishes
      from_url: fromUrl,
      summary: fromUrl
        ? "Fetching your video from its source. Your summary and chapters will appear here once it’s processed."
        : "Processing has started. Your summary and chapters will appear here when it’s ready.",
    });
    signalPath.scrollIntoView({ block: "nearest", behavior: "smooth" });
    startPollingJob(jobId, videoId, title, {
      source: options.source,
      deferPlayer: fromUrl,
      video: { video_id: videoId, filename: title, current_stage: "downloading" },
    });
  }

  function openVideoInWorkspace(video) {
    stopJobPolling();
    openWorkspace();
    setScope(video.video_id, video.filename);
    resetChat();
    showVideoInCenter(video);
  }

  function openSearchResultVideo(video) {
    showScreen("workspace");
    showVideoInCenter(video);
  }

  function showVideoInCenter(video) {
    if (!video || !video.video_id) return;
    state.workspace.selectedVideoId = video.video_id;
    if (video.job_id) {
      const status = String(video.status || "").toLowerCase();
      const stage = String(video.current_stage || "").toLowerCase();
      const processing = PROCESSING_STAGES.has(status);
      const waitingForMedia = processing && (!stage || MEDIA_PENDING_STAGES.has(stage));
      const mediaMissing = status === "failed" && stage === "downloading";

      showCenterForVideo({ ...video, defer_player: waitingForMedia || mediaMissing });
      if (processing) {
        startPollingJob(video.job_id, video.video_id, video.filename, { video, deferPlayer: waitingForMedia });
      } else {
        stopJobPolling();
        loadFinalJobDetails(video);
      }
    } else {
      centerEmpty.hidden = false;
      centerContent.classList.remove("show");
    }
  }

  async function loadFinalJobDetails(video) {
    try {
      const job = await api.getJob(video.job_id);
      if (state.workspace.selectedVideoId !== video.video_id) return;
      showCenterForVideo({
        ...video,
        summary: job.summary || video.summary,
        chapters: job.chapters,
        status: job.status,
        error_message: job.error_message,
        defer_player: job.status === "failed" && job.current_stage === "downloading",
      });
    } catch (_error) {
      if (state.workspace.selectedVideoId === video.video_id && state.ui.screen === "workspace") {
        showToast("error", "Couldn’t load the latest video details. Reopen the video to retry.");
      }
    }
  }

  function showCenterForVideo(video) {
    if (video.video_id) state.workspace.selectedVideoId = video.video_id;

    if (video.defer_player) {
      pausePlayback();
      setMediaPlaceholder(placeholderConfig({ failed: video.status === "failed", fromUrl: Boolean(video.from_url) }));
    } else {
      setMediaPlaceholder(null);
      if (video.video_id) player.ensureVideoLoaded(video);
    }

    centerEmpty.hidden = true;
    centerContent.classList.add("show");
    document.getElementById("centerTitle").textContent = video.filename || video.video_id || "Video";
    document.getElementById("centerSummary").textContent = video.summary || (video.error_message
      ? "Processing failed: " + video.error_message
      : video.status === "failed"
        ? "Processing did not complete. Try adding this video again if you still need it indexed."
        : "No summary yet. This video may still be processing.");

    const chaptersLabel = document.getElementById("chaptersLabel");
    const chaptersDivider = document.getElementById("chaptersDivider");
    const chaptersContainer = document.getElementById("centerChapters");
    const chapters = parseChapters(video.chapters);
    chaptersLabel.hidden = chapters.length === 0;
    chaptersDivider.hidden = chapters.length === 0;
    chaptersContainer.innerHTML = chapters.map((chapter, index) => {
      const label = chapter && (chapter.title || chapter.text) || JSON.stringify(chapter) || "Chapter";
      return `<div class="chapter-item"><span class="chapter-marker" aria-hidden="true">${index + 1}</span><span>${escapeHtml(label)}</span></div>`;
    }).join("");
  }

  document.getElementById("clearScope").addEventListener("click", () => setScope(null, null));
  document.getElementById("backToHome").addEventListener("click", () => {
    showScreen("home", { focus: true });
    refreshVideos();
  });
  document.getElementById("seeAllBtn").addEventListener("click", () => openWorkspace());
  document.getElementById("goUpload").addEventListener("click", () => openWorkspace("upload"));
  document.getElementById("goSearch").addEventListener("click", () => openWorkspace("search"));
  document.querySelectorAll("[data-open-library]").forEach(button => {
    button.addEventListener("click", () => {
      showScreen("home", { focus: true });
      refreshVideos();
    });
  });

  function reset() {
    stopJobPolling();
    state.workspace.scopedVideoId = null;
    state.workspace.scopedVideoTitle = null;
    state.workspace.selectedVideoId = null;
    signalPath.hidden = true;
    lastStepsKey = null;
    setMediaPlaceholder(null);
    clearIngestError();
    centerEmpty.hidden = false;
    centerContent.classList.remove("show");
    document.getElementById("centerTitle").textContent = "—";
    document.getElementById("centerSummary").textContent = "";
    document.getElementById("centerChapters").innerHTML = "";
    document.getElementById("chaptersLabel").hidden = true;
    document.getElementById("chaptersDivider").hidden = true;
    setScope(null, null);
  }

  return {
    openWorkspace,
    openVideoInWorkspace,
    openSearchResultVideo,
    showVideoInCenter,
    showCenterForVideo,
    beginProcessing,
    startPollingJob,
    stopJobPolling,
    setScope,
    showIngestError,
    clearIngestError,
    reset,
  };
}