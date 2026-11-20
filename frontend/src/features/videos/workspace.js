import { api } from "../../services/api.js?v=3";
import { state } from "../../state/app-state.js?v=3";
import { showToast } from "../../components/feedback.js";
import { showScreen } from "../../components/navigation.js?v=3";
import { escapeHtml, formatTime, parseChapters } from "../../utils/format.js";

// ───────────── Backend status / stage contract ─────────────
// Mirrors app/db/models.py (JobStatus) and app/workers/tasks.py (_run_pipeline).
const JOB_STATUS = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
});

// Stages during which the media file is NOT yet guaranteed servable (null/empty stage is also treated as downloading).
const DOWNLOAD_STAGES = Object.freeze([
  "downloading",
  "queued",
  "pending",
  "fetching",
  "merging",
  "saving",
]);

export const CENTER_STATE = Object.freeze({
  IDLE: "IDLE",
  LOADING: "LOADING",
  PLAYABLE: "PLAYABLE",
  PLAYABLE_DONE: "PLAYABLE_DONE",
  FAILED: "FAILED",
});

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

// Polling: no overall timeout; stops only on a terminal backend status or repeated network errors.
const POLL_FAST_MS = 1500;
const POLL_NORMAL_MS = 3000;
const POLL_RETRY_MAX_MS = 15000;
const POLL_MAX_CONSECUTIVE_ERRORS = 20;
const SLOW_DOWNLOAD_HINT_MS = 90 * 1000;

const DEFAULT_CAPTION = "Your video will be searchable when indexing is complete.";
const URL_DOWNLOAD_CAPTION = "Fetching your video from its source. Long videos can take a few minutes.";
const PLAYABLE_PROCESSING_CAPTION = "Your video is ready to watch while search indexing finishes in the background.";
const SLOW_DOWNLOAD_CAPTION = "Still downloading. Large videos can take several minutes. Keep this tab open and we'll continue automatically.";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isDownloadStage(stage) {
  const value = normalize(stage);
  if (!value) return true; // null/empty stage before worker advances past download
  return DOWNLOAD_STAGES.includes(value);
}

/**
 * Single source of truth mapping a live job payload into the center-panel state machine.
 */
function classifyJob(status, stage, download) {
  const st = normalize(status);
  const stageStr = normalize(stage);
  const hasActiveDownload = Boolean(download);

  if (st === JOB_STATUS.COMPLETED) {
    return { centerState: CENTER_STATE.PLAYABLE_DONE, mediaAvailable: true, keepPolling: false };
  }

  if (st === JOB_STATUS.FAILED) {
    const failedPostDownload = Boolean(stageStr) && !isDownloadStage(stageStr) && !hasActiveDownload;
    return { centerState: CENTER_STATE.FAILED, mediaAvailable: failedPostDownload, keepPolling: false };
  }

  if (st === JOB_STATUS.PENDING || hasActiveDownload || isDownloadStage(stageStr)) {
    return { centerState: CENTER_STATE.LOADING, mediaAvailable: false, keepPolling: true };
  }

  // Any non-download stage while processing (preprocessing, transcribing, diarizing,
  // captioning, summarizing, indexing, embedding, etc.) means download has finished.
  if (st === JOB_STATUS.PROCESSING && stageStr) {
    return { centerState: CENTER_STATE.PLAYABLE, mediaAvailable: true, keepPolling: true };
  }

  // Defensive fallback for unknown non-terminal statuses: keep loader up and keep polling.
  return { centerState: CENTER_STATE.LOADING, mediaAvailable: false, keepPolling: true };
}

function setText(element, text) {
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

function placeholderConfig({ failed = false } = {}) {
  if (failed) {
    return {
      state: "failed",
      title: "Download failed",
      text: "We couldn't download this video. See the details below.",
    };
  }
  return {
    state: "loading",
    title: "Getting your video ready…",
    text: "Playback will start automatically as soon as the download finishes.",
  };
}

export function createWorkspaceFeature({ player, refreshVideos, findVideo, resetChat }) {
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
  const workspaceDeleteBtn = document.getElementById("workspaceDeleteBtn");

  let lastStepsKey = null;
  let pollNow = null;
  let pendingSeek = null; // { videoId: string, timestamp: number } | null

  window.addEventListener("videoDeleted", event => {
    if (state.workspace.selectedVideoId === event.detail.videoId) {
      reset();
    }
  });

  workspaceDeleteBtn.addEventListener("click", async () => {
    const videoId = state.workspace.selectedVideoId;
    if (state.share.active || !videoId) return;
    if (confirm("Are you sure you want to delete this video? This cannot be undone.")) {
      try {
        await api.deleteVideo(videoId);
        showToast("success", "Video deleted.");
        refreshVideos();
        reset();
      } catch (err) {
        showToast("error", err.message || "Failed to delete video.");
      }
    }
  });

  document.getElementById("centerChapters").addEventListener("click", event => {
    const chapter = event.target.closest("[data-chapter-start]");
    if (chapter) jumpToVideoMoment(state.workspace.selectedVideoId, Number(chapter.dataset.chapterStart));
  });

  function clearIngestError() {
    ingestError.textContent = "";
  }

  function showIngestError(message) {
    ingestError.textContent = message;
  }

  function setScope(videoId, title) {
    if (state.share.active && (!videoId || videoId !== state.share.video?.video_id)) return;
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
      chatInput.placeholder = "Ask a question or follow up…";
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
      caption: downloading
        ? (run.isUrlSource ? URL_DOWNLOAD_CAPTION : DEFAULT_CAPTION)
        : PLAYABLE_PROCESSING_CAPTION,
    });
  }

  function describeJob(job, run) {
    const status = normalize(job.status);
    const failed = status === JOB_STATUS.FAILED;
    const completed = status === JOB_STATUS.COMPLETED;
    const pending = status === JOB_STATUS.PENDING;
    const stage = pending ? "downloading" : (normalize(job.current_stage) || "downloading");
    const view = {
      stage,
      failed,
      completed,
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

    if (!isDownloadStage(stage)) {
      view.caption = PLAYABLE_PROCESSING_CAPTION;
      view.statusText = STAGE_ACTIVITY[stage] || `Running ${stage.replace(/[_-]+/g, " ")}…`;
      view.statusDetail = `${elapsed} in this step`;
      return view;
    }

    const download = job.download || null;
    if (!download && !run.isUrlSource) {
      view.waiting = true;
      view.statusText = "Preparing your video…";
      view.statusDetail = `${elapsed} elapsed`;
      return view;
    }

    view.caption = URL_DOWNLOAD_CAPTION;
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
      default:
        view.waiting = true;
        view.stepLabel = "Connecting…";
        view.statusText = "Contacting the video source…";
        view.statusDetail = `${elapsed} elapsed`;
    }
    return view;
  }

  // ───────────── Center-panel state machine ─────────────

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

  function deferMedia(failed) {
    state.workspace.mediaDeferred = true;
    player.reset();
    setMediaPlaceholder(placeholderConfig({ failed }));
  }

  function releaseMedia() {
    state.workspace.mediaDeferred = false;
    setMediaPlaceholder(null);
  }

  async function performSeekAndReveal(timestamp, seekRequestId = null) {
    const played = await player.seekTo(timestamp);
    if (seekRequestId != null && seekRequestId !== state.player.seekRequestId) return;
    const label = formatTime(player.getElement().currentTime);
    state.player.jumpedAt = Date.now();
    if (played) {
      player.setPlayerState("ready", "Playing from " + label);
      player.showResumeButton(false);
    } else {
      player.setPlayerState("ready", "Jumped to " + label + " · press Play to continue");
      player.showResumeButton(true);
    }
    player.reveal();
  }

  function loadPlayerForCurrentVideo(video, { force = false } = {}) {
    if (!video || !video.video_id) return;
    const videoId = video.video_id;
    const epoch = state.workspace.centerEpoch;
    const shouldForce = force || state.player.videoId !== videoId || state.player.state === "error";

    if (!shouldForce && state.player.loadPromise && (state.player.state === "ready" || state.player.state === "loading")) {
      if (pendingSeek && pendingSeek.videoId === videoId) {
        const target = pendingSeek.timestamp;
        pendingSeek = null;
        const seekId = ++state.player.seekRequestId;
        state.player.loadPromise
          .then(() => {
            if (epoch !== state.workspace.centerEpoch || state.workspace.selectedVideoId !== videoId) return;
            return performSeekAndReveal(target, seekId);
          })
          .catch(() => {});
      }
      return;
    }

    player.loadVideo(videoId, video.filename, { force: shouldForce })
      .then(() => {
        if (epoch !== state.workspace.centerEpoch || state.workspace.selectedVideoId !== videoId) return;
        if (pendingSeek && pendingSeek.videoId === videoId) {
          const target = pendingSeek.timestamp;
          pendingSeek = null;
          const seekId = ++state.player.seekRequestId;
          return performSeekAndReveal(target, seekId);
        }
      })
      .catch(() => {
        // Player displays its own inline state and schedules background recovery.
      });
  }

  function renderCenterMetadata(video, centerState, isUrlSource) {
    document.getElementById("centerTitle").textContent = video.filename || video.video_id || "Video";

    let summaryText = video.summary || "";
    if (!summaryText) {
      if (centerState === CENTER_STATE.FAILED) {
        summaryText = video.error_message
          ? "Processing failed: " + video.error_message
          : "Processing did not complete. Try adding this video again if you still need it indexed.";
      } else if (centerState === CENTER_STATE.LOADING) {
        summaryText = isUrlSource
          ? "Fetching your video from its source. Playback will begin automatically as soon as the download finishes."
          : "Preparing your video. Playback will begin automatically in a moment.";
      } else if (centerState === CENTER_STATE.PLAYABLE) {
        summaryText = "Your video is ready to watch while we finish transcribing and indexing it. Your summary and chapters will appear here automatically.";
      } else {
        summaryText = "No summary available for this video.";
      }
    }
    document.getElementById("centerSummary").textContent = summaryText;

    const chaptersLabel = document.getElementById("chaptersLabel");
    const chaptersDivider = document.getElementById("chaptersDivider");
    const chaptersContainer = document.getElementById("centerChapters");
    const chapters = parseChapters(video.chapters);
    chaptersLabel.hidden = chapters.length === 0;
    chaptersDivider.hidden = chapters.length === 0;
    chaptersContainer.innerHTML = chapters.map((chapter, index) => {
      const label = (chapter && (chapter.title || chapter.text)) || JSON.stringify(chapter) || "Chapter";
      if (Number.isFinite(chapter?.start)) {
        return `<button type="button" class="chapter-item" data-chapter-start="${chapter.start}"><span class="result-time">${formatTime(chapter.start)}</span><span>${escapeHtml(label)}</span></button>`;
      }
      return `<div class="chapter-item"><span class="chapter-marker" aria-hidden="true">${index + 1}</span><span>${escapeHtml(label)}</span></div>`;
    }).join("");
  }

  /**
   * Single state-machine transition function for the center panel.
   */
  function transitionCenter({ centerState, mediaAvailable, video = null, isUrlSource = false }) {
    const prevState = state.workspace.centerState;
    const prevVideoId = state.workspace.selectedVideoId;
    const wasDeferred = state.workspace.mediaDeferred;

    state.workspace.centerState = centerState;
    document.getElementById("workspaceShareBtn").hidden = state.share.active || centerState !== CENTER_STATE.PLAYABLE_DONE;

    if (centerState === CENTER_STATE.IDLE || !video || !video.video_id) {
      state.workspace.selectedVideoId = null;
      state.workspace.selectedJobId = null;
      state.workspace.mediaDeferred = false;
      pendingSeek = null;
      setMediaPlaceholder(null);
      player.reset();
      centerEmpty.hidden = false;
      centerContent.classList.remove("show");
      document.getElementById("centerTitle").textContent = "—";
      workspaceDeleteBtn.hidden = true;
      document.getElementById("centerSummary").textContent = "";
      document.getElementById("centerChapters").innerHTML = "";
      document.getElementById("chaptersLabel").hidden = true;
      document.getElementById("chaptersDivider").hidden = true;
      return;
    }

    state.workspace.selectedVideoId = video.video_id;
    if (video.job_id) state.workspace.selectedJobId = video.job_id;
    workspaceDeleteBtn.hidden = state.share.active;
    centerEmpty.hidden = true;
    centerContent.classList.add("show");

    const switchingVideo = prevVideoId !== video.video_id;

    if (!mediaAvailable) {
      // LOADING or download-stage FAILED: placeholder only, player completely reset & hidden.
      const isFailed = centerState === CENTER_STATE.FAILED;
      if (switchingVideo || !wasDeferred || prevState !== centerState) {
        deferMedia(isFailed);
      } else {
        setMediaPlaceholder(placeholderConfig({ failed: isFailed }));
      }
    } else {
      // PLAYABLE, PLAYABLE_DONE, or post-download FAILED: show player and load/recover cleanly.
      const becamePlayable = wasDeferred || switchingVideo || prevState === CENTER_STATE.LOADING || prevState === CENTER_STATE.IDLE;
      if (becamePlayable && centerState !== CENTER_STATE.FAILED) clearIngestError();
      releaseMedia();
      loadPlayerForCurrentVideo(video, { force: becamePlayable });
    }

    renderCenterMetadata(video, centerState, isUrlSource);
  }

  // ───────────── Polling (epoch-protected) ─────────────

  function clearPollTimer() {
    if (state.workspace.jobPollTimer) window.clearTimeout(state.workspace.jobPollTimer);
    state.workspace.jobPollTimer = null;
  }

  function stopJobPolling() {
    clearPollTimer();
    state.workspace.activeJobId = null;
    state.workspace.activePollEpoch += 1;
    pollNow = null;
  }

  function adoptServerTitle(job, run) {
    if (!job.filename || job.filename === run.title) return;
    run.title = job.filename;
    if (state.workspace.selectedVideoId === run.videoId) {
      document.getElementById("centerTitle").textContent = run.title;
    }
    if (state.workspace.scopedVideoId === run.videoId) setScope(run.videoId, run.title);
  }

  function handleJobUpdate(job, run) {
    const decision = classifyJob(job.status, job.current_stage, job.download);
    const pending = normalize(job.status) === JOB_STATUS.PENDING;
    const stageKey = pending ? "pending" : (normalize(job.current_stage) || "downloading");

    if (run.stageKey !== stageKey) {
      run.stageKey = stageKey;
      run.stageSince = Date.now();
    }
    if (job.download) run.isUrlSource = true;
    adoptServerTitle(job, run);
    paintSignal(describeJob(job, run));

    const selected = state.workspace.selectedVideoId === run.videoId;
    const mergedVideo = {
      video_id: job.video_id || run.videoId,
      filename: run.title || job.filename || job.video_id || run.videoId,
      job_id: job.job_id || run.jobId,
      status: job.status,
      current_stage: job.current_stage,
      summary: job.summary || "",
      chapters: job.chapters || null,
      error_message: job.error_message || null,
      download: job.download || null,
    };

    if (selected) {
      transitionCenter({
        centerState: decision.centerState,
        mediaAvailable: decision.mediaAvailable,
        video: mergedVideo,
        isUrlSource: run.isUrlSource,
      });
    }

    if (decision.keepPolling) {
      if (decision.centerState === CENTER_STATE.PLAYABLE && !run.refreshedAfterDownload) {
        run.refreshedAfterDownload = true;
        refreshVideos();
      }
      return { done: false, fast: decision.centerState === CENTER_STATE.LOADING };
    }

    // Terminal state: completed or failed.
    refreshVideos();
    const onWorkspace = state.ui.screen === "workspace";
    const completed = decision.centerState === CENTER_STATE.PLAYABLE_DONE;
    const mediaMissing = !decision.mediaAvailable;

    if (selected) {
      if (completed) {
        clearIngestError();
      } else {
        const prefix = mediaMissing ? "Download failed: " : "Processing failed: ";
        showIngestError(job.error_message
          ? prefix + job.error_message
          : mediaMissing
            ? "Download failed. Check the link and try again."
            : "Processing failed. You can try adding the video again.");
      }
    }

    if (completed) {
      showToast("success", "Your video is indexed and ready to search.");
    } else if (!selected || !onWorkspace) {
      showToast("error", mediaMissing ? "A video download failed." : "Video processing failed.");
    }
    return { done: true, fast: false };
  }

  function startPollingJob(jobId, videoId, title, options = {}) {
    stopJobPolling();
    const pollEpoch = ++state.workspace.activePollEpoch;
    state.workspace.activeJobId = jobId;
    signalPath.hidden = false;

    const run = {
      jobId,
      videoId,
      title,
      isUrlSource: options.source === "url" || Boolean(options.initialJob && options.initialJob.download),
      refreshedAfterDownload: false,
      stageKey: null,
      stageSince: Date.now(),
      errors: 0,
    };
    const isCurrent = () => state.workspace.activePollEpoch === pollEpoch;
    let inFlight = false;

    const scheduleNext = delay => {
      if (!isCurrent()) return;
      clearPollTimer();
      state.workspace.jobPollTimer = window.setTimeout(poll, delay);
    };

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
        const outcome = handleJobUpdate(job, run);
        keepPolling = !outcome.done;
        if (outcome.fast || job.download) nextDelay = POLL_FAST_MS;
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
          nextDelay = Math.min(POLL_NORMAL_MS * 1.5 ** run.errors, POLL_RETRY_MAX_MS);
          signalStatus.hidden = false;
          setText(signalStatusText, "Connection interrupted. Retrying…");
          setText(signalStatusDetail, `attempt ${run.errors}`);
        }
      } finally {
        inFlight = false;
        if (!keepPolling && isCurrent()) {
          pollNow = null;
          state.workspace.activeJobId = null;
        }
        if (keepPolling && isCurrent()) {
          scheduleNext(nextDelay);
        }
      }
    };

    pollNow = () => {
      if (!inFlight && isCurrent()) poll();
    };

    if (options.initialJob) {
      lastStepsKey = null;
      const outcome = handleJobUpdate(options.initialJob, run);
      if (!outcome.done && isCurrent()) {
        scheduleNext(outcome.fast || options.initialJob.download ? POLL_FAST_MS : POLL_NORMAL_MS);
      } else if (outcome.done && isCurrent()) {
        pollNow = null;
        state.workspace.activeJobId = null;
      }
    } else {
      paintInitial(run, options.initialStage);
      poll();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && pollNow) pollNow();
  });

  // ───────────── Unified entry points ─────────────

  /**
   * Single entry point for selecting/opening any existing video in the center panel.
   * Always verifies live job state via GET /jobs/{job_id} before releasing the player,
   * so stale library snapshots can never mount the player during a live download.
   */
  async function selectVideo(video, { seekTimestamp = null } = {}) {
    if (state.share.active) return { playable: false, state: state.workspace.centerState };
    if (!video || !video.video_id) {
      stopJobPolling();
      clearIngestError();
      state.workspace.centerEpoch += 1;
      transitionCenter({ centerState: CENTER_STATE.IDLE, mediaAvailable: false });
      return { playable: false, state: CENTER_STATE.IDLE };
    }

    const epoch = ++state.workspace.centerEpoch;
    stopJobPolling();
    clearIngestError();
    pendingSeek = seekTimestamp != null ? { videoId: video.video_id, timestamp: seekTimestamp } : null;

    // Never show a previous video's progress steps while verifying the newly selected video.
    signalPath.hidden = true;
    lastStepsKey = null;

    if (!video.job_id) {
      transitionCenter({ centerState: CENTER_STATE.IDLE, mediaAvailable: false });
      return { playable: false, state: CENTER_STATE.IDLE };
    }

    const snapshotStatus = normalize(video.status);
    const isLikelyUrl = /^https?:\/\//i.test(String(video.filename || ""));

    // Hold safely in LOADING (gate closed, no playback-token request) until live job confirms state.
    transitionCenter({
      centerState: CENTER_STATE.LOADING,
      mediaAvailable: false,
      video: {
        video_id: video.video_id,
        filename: video.filename || video.video_id,
        job_id: video.job_id,
        status: JOB_STATUS.PENDING,
        current_stage: "downloading",
        summary: video.summary || "",
        chapters: video.chapters || null,
      },
      isUrlSource: isLikelyUrl,
    });

    try {
      const job = await api.getJob(video.job_id);
      if (epoch !== state.workspace.centerEpoch) {
        return { playable: false, state: state.workspace.centerState };
      }

      const decision = classifyJob(job.status, job.current_stage, job.download);
      const mergedVideo = {
        video_id: job.video_id || video.video_id,
        filename: job.filename || video.filename || video.video_id,
        job_id: job.job_id || video.job_id,
        status: job.status,
        current_stage: job.current_stage,
        summary: job.summary || video.summary || "",
        chapters: job.chapters || video.chapters || null,
        error_message: job.error_message || null,
        download: job.download || null,
      };

      if (state.workspace.scopedVideoId === mergedVideo.video_id && mergedVideo.filename !== state.workspace.scopedVideoTitle) {
        setScope(mergedVideo.video_id, mergedVideo.filename);
      }

      if (decision.keepPolling) {
        // Active job (LOADING or PLAYABLE post-download): hand off to epoch-guarded poller
        // which immediately applies transitionCenter() and keeps updating progress until terminal.
        startPollingJob(video.job_id, mergedVideo.video_id, mergedVideo.filename, {
          initialJob: job,
          source: job.download ? "url" : undefined,
        });
        if (snapshotStatus === JOB_STATUS.COMPLETED) refreshVideos();
      } else {
        signalPath.hidden = true;
        transitionCenter({
          centerState: decision.centerState,
          mediaAvailable: decision.mediaAvailable,
          video: mergedVideo,
          isUrlSource: Boolean(job.download),
        });
        if (decision.centerState === CENTER_STATE.FAILED) {
          const prefix = decision.mediaAvailable ? "Processing failed: " : "Download failed: ";
          showIngestError(job.error_message
            ? prefix + job.error_message
            : decision.mediaAvailable
              ? "Processing failed. You can try adding the video again."
              : "Download failed. Check the link and try again.");
        }
      }

      return { playable: decision.mediaAvailable, state: decision.centerState };
    } catch (error) {
      if (epoch !== state.workspace.centerEpoch) {
        return { playable: false, state: state.workspace.centerState };
      }
      const status = error && error.status;
      const permanent = status === 401 || status === 403 || status === 404;
      if (!permanent) {
        // Transient network/server error: hand off to the poller so backoff retries verify live job
        // automatically instead of blindly trusting a stale snapshot or sticking on the loader.
        startPollingJob(video.job_id, video.video_id, video.filename || video.video_id, {
          source: isLikelyUrl ? "url" : undefined,
          initialStage: "downloading",
        });
        return { playable: false, state: CENTER_STATE.LOADING };
      }
      if (state.ui.screen === "workspace") {
        showToast("error", "Couldn’t load the latest video details.");
      }
      return { playable: false, state: CENTER_STATE.LOADING };
    }
  }

  function handleMediaNotReady(videoId) {
    if (!videoId || state.workspace.selectedVideoId !== videoId) return;
    if (pollNow) {
      pollNow();
      return;
    }
    const jobId = state.workspace.selectedJobId;
    if (!jobId) return;
    const item = state.library.items.find(v => v.video_id === videoId);
    selectVideo(item || {
      video_id: videoId,
      job_id: jobId,
      filename: document.getElementById("centerTitle").textContent,
    });
  }

  function beginProcessing(jobId, videoId, title, options = {}) {
    const fromUrl = options.source === "url";
    state.workspace.centerEpoch += 1;
    pendingSeek = null;
    clearIngestError();
    signalPath.hidden = false;
    if (videoId) setScope(videoId, title);

    transitionCenter({
      centerState: CENTER_STATE.LOADING,
      mediaAvailable: false,
      video: {
        video_id: videoId,
        filename: title,
        job_id: jobId,
        status: JOB_STATUS.PENDING,
        current_stage: "downloading",
        summary: "",
        chapters: null,
      },
      isUrlSource: fromUrl,
    });

    signalPath.scrollIntoView({ block: "nearest", behavior: "smooth" });
    startPollingJob(jobId, videoId, title, {
      source: options.source,
      initialStage: "downloading",
    });
  }

  function openWorkspace(focusTarget) {
    showScreen("workspace", { focus: !focusTarget });
    if (focusTarget === "upload") requestAnimationFrame(() => document.getElementById("dropZone").focus());
    if (focusTarget === "search") requestAnimationFrame(() => document.getElementById("searchInput").focus());

    // Sync live state when returning from another screen.
    if (pollNow) {
      pollNow();
    } else if (state.workspace.selectedVideoId && state.workspace.mediaDeferred && state.workspace.selectedJobId) {
      const item = state.library.items.find(v => v.video_id === state.workspace.selectedVideoId);
      selectVideo(item || {
        video_id: state.workspace.selectedVideoId,
        job_id: state.workspace.selectedJobId,
        filename: document.getElementById("centerTitle").textContent,
      });
      return;
    }

    if (
      state.workspace.selectedVideoId &&
      !state.workspace.mediaDeferred &&
      (state.player.state === "error" || state.player.state === "idle")
    ) {
      const item = state.library.items.find(v => v.video_id === state.workspace.selectedVideoId);
      loadPlayerForCurrentVideo(
        item || { video_id: state.workspace.selectedVideoId, filename: document.getElementById("centerTitle").textContent },
        { force: true }
      );
    }
  }

  function sharedUnavailable() {
    state.share.error = "unavailable";
    state.share.video = null;
    player.reset();
    document.querySelector("#workspace .studio").hidden = true;
    document.getElementById("scopeChip").hidden = true;
    document.getElementById("sharedLoading").hidden = true;
    document.getElementById("sharedErrorView").hidden = false;
    document.getElementById("sharedErrorTitle").focus();
  }

  async function openSharedVideo(token) {
    const studio = document.querySelector("#workspace .studio");
    studio.hidden = true;
    document.getElementById("sharedLoading").hidden = false;
    try {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(token)) throw new Error("Invalid link");
      const video = await api.getSharedVideo(token);
      state.share.video = video;
      setScope(video.video_id, video.filename);
      document.getElementById("sharedLoading").hidden = true;
      studio.hidden = false;
      transitionCenter({ centerState: CENTER_STATE.PLAYABLE_DONE, mediaAvailable: true, video });
    } catch {
      sharedUnavailable();
    }
  }

  function openVideoInWorkspace(video) {
    // Do NOT call openWorkspace() here — that would trigger pollNow/player recovery for the PREVIOUS video.
    showScreen("workspace", { focus: true });
    setScope(video.video_id, video.filename);
    resetChat();
    selectVideo(video);
  }

  function openSearchResultVideo(video, options = {}) {
    showScreen("workspace");
    return selectVideo(video, options);
  }

  /**
   * Unified jump handler for both Search results and Chat source citations.
   * Respects the center-panel state machine: never calls player.loadVideo() while downloading.
   */
  async function jumpToVideoMoment(videoId, timestamp, fallbackTitle) {
    const targetTime = Number(timestamp);
    if (!Number.isFinite(targetTime)) {
      showToast("error", "This result has no usable timestamp.");
      return { jumped: false, reason: "invalid_timestamp" };
    }
    if (!videoId) {
      showToast("error", "The source video could not be opened.");
      return { jumped: false, reason: "missing_video" };
    }

    const seekRequestId = ++state.player.seekRequestId;
    showScreen("workspace");

    // If this video is already selected and actively downloading, queue the seek without restarting the poller.
    if (
      state.workspace.selectedVideoId === videoId &&
      state.workspace.centerState === CENTER_STATE.LOADING &&
      pollNow
    ) {
      pendingSeek = { videoId, timestamp: targetTime };
      pollNow();
      showToast("success", "This video is still downloading — playback will jump to this moment automatically.");
      return { jumped: false, reason: CENTER_STATE.LOADING };
    }

    const alreadyPlayable =
      state.workspace.selectedVideoId === videoId &&
      !state.workspace.mediaDeferred &&
      (state.workspace.centerState === CENTER_STATE.PLAYABLE ||
        state.workspace.centerState === CENTER_STATE.PLAYABLE_DONE ||
        state.workspace.centerState === CENTER_STATE.FAILED);

    if (!alreadyPlayable && state.share.active) return { jumped: false, reason: "unavailable" };
    if (!alreadyPlayable) {
      const videoItem = await findVideo(videoId);
      if (seekRequestId !== state.player.seekRequestId) return { jumped: false, reason: "superseded" };
      if (!videoItem) {
        showToast("error", "The source video could not be opened.");
        return { jumped: false, reason: "not_found" };
      }

      const result = await selectVideo(videoItem, { seekTimestamp: targetTime });
      if (seekRequestId !== state.player.seekRequestId) return { jumped: false, reason: "superseded" };
      if (!result.playable) {
        if (result.state === CENTER_STATE.LOADING) {
          showToast("success", "This video is still downloading — playback will jump to this moment automatically.");
        }
        return { jumped: false, reason: result.state };
      }
      return { jumped: true };
    }

    // Taking the direct seek path: clear any stale queued seek so it cannot race after loadVideo().
    pendingSeek = null;

    try {
      await player.loadVideo(videoId, fallbackTitle);
      if (seekRequestId !== state.player.seekRequestId) return { jumped: false, reason: "superseded" };
      await performSeekAndReveal(targetTime, seekRequestId);
      return { jumped: true };
    } catch (error) {
      if (error && (error.code === "SUPERSEDED" || error.code === "DEFERRED")) {
        return { jumped: false, reason: error.code };
      }
      if (seekRequestId !== state.player.seekRequestId) return { jumped: false, reason: "superseded" };
      return { jumped: false, reason: "playback_error" };
    }
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
    state.workspace.centerEpoch += 1;
    stopJobPolling();
    pendingSeek = null;
    signalPath.hidden = true;
    lastStepsKey = null;
    clearIngestError();
    transitionCenter({ centerState: CENTER_STATE.IDLE, mediaAvailable: false });
    setScope(null, null);
  }

  return {
    sharedUnavailable,
    openSharedVideo,
    openWorkspace,
    openVideoInWorkspace,
    openSearchResultVideo,
    jumpToVideoMoment,
    selectVideo,
    handleMediaNotReady,
    beginProcessing,
    startPollingJob,
    stopJobPolling,
    setScope,
    showIngestError,
    clearIngestError,
    reset,
  };
}