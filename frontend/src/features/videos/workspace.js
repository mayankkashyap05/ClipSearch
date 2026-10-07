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
const PROCESSING_STAGES = new Set(["pending", "processing"]);

export function createWorkspaceFeature({ player, refreshVideos, resetChat }) {
  const centerEmpty = document.getElementById("centerEmpty");
  const centerContent = document.getElementById("centerContent");
  const signalPath = document.getElementById("signalPath");
  const ingestError = document.getElementById("ingestError");

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

  function renderSignalSteps(currentStage, failed, completed) {
    const container = document.getElementById("signalSteps");
    const currentIndex = STAGE_ORDER.indexOf(currentStage);
    container.innerHTML = STAGE_ORDER.map((stage, index) => {
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

  function setProcessingCaption(status) {
    const caption = document.querySelector(".signal-caption");
    if (!caption) return;
    caption.textContent = status === "pending"
      ? "Queued — waiting for processing to begin."
      : "Your video will be searchable when indexing is complete.";
  }

  function stopJobPolling() {
    if (state.workspace.jobPollTimer) window.clearInterval(state.workspace.jobPollTimer);
    state.workspace.jobPollTimer = null;
    state.workspace.activeJobId = null;
  }

  function startPollingJob(jobId, videoId, title) {
    if (state.workspace.jobPollTimer) window.clearInterval(state.workspace.jobPollTimer);
    state.workspace.activeJobId = jobId;
    signalPath.hidden = false;
    let polling = false;

    const poll = async () => {
      if (polling || state.workspace.activeJobId !== jobId) return;
      polling = true;
      try {
        const job = await api.getJob(jobId);
        if (state.workspace.activeJobId !== jobId) return;
        const failed = job.status === "failed";
        const completed = job.status === "completed";
        renderSignalSteps(job.current_stage, failed, completed);
        setProcessingCaption(job.status);

        if (completed || failed) {
          if (state.workspace.jobPollTimer) window.clearInterval(state.workspace.jobPollTimer);
          state.workspace.jobPollTimer = null;
          refreshVideos();
          if (state.workspace.selectedVideoId === videoId && state.ui.screen === "workspace") {
            showCenterForVideo({
              video_id: job.video_id,
              filename: title || job.video_id,
              summary: job.summary,
              chapters: job.chapters,
              status: job.status,
              error_message: job.error_message,
            });
            if (failed) {
              showIngestError(job.error_message
                ? "Processing failed: " + job.error_message
                : "Processing failed. You can try adding the video again.");
            } else {
              clearIngestError();
              showToast("success", "Your video is indexed and ready to search.");
            }
          }
        }
      } catch (_error) {
        if (state.workspace.activeJobId === jobId) {
          if (state.workspace.jobPollTimer) window.clearInterval(state.workspace.jobPollTimer);
          state.workspace.jobPollTimer = null;
          if (state.ui.screen === "workspace") {
            showIngestError("Could not refresh processing status. Check your connection and reopen the video to try again.");
          }
        }
      } finally {
        polling = false;
      }
    };

    poll();
    state.workspace.jobPollTimer = window.setInterval(poll, 3000);
  }

  function beginProcessing(jobId, videoId, title) {
    signalPath.hidden = false;
    state.workspace.activeJobId = jobId;
    if (videoId) setScope(videoId, title);
    setProcessingCaption("processing");
    showCenterForVideo({
      video_id: videoId,
      filename: title,
      status: "processing",
      summary: "Processing has started. Your summary and chapters will appear here when it’s ready.",
    });
    renderSignalSteps("downloading", false, false);
    startPollingJob(jobId, videoId, title);
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
      showCenterForVideo(video);
      if (PROCESSING_STAGES.has(String(video.status || "").toLowerCase())) {
        startPollingJob(video.job_id, video.video_id, video.filename);
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
      });
    } catch (_error) {
      if (state.workspace.selectedVideoId === video.video_id && state.ui.screen === "workspace") {
        showToast("error", "Couldn’t load the latest video details. Reopen the video to retry.");
      }
    }
  }

  function showCenterForVideo(video) {
    if (video.video_id) {
      state.workspace.selectedVideoId = video.video_id;
      player.ensureVideoLoaded(video);
    }
    centerEmpty.hidden = true;
    centerContent.classList.add("show");
    document.getElementById("centerTitle").textContent = video.filename || video.video_id || "Video";
    document.getElementById("centerSummary").textContent = video.summary || (video.error_message
      ? "Processing failed: " + video.error_message
      : video.status === "failed"
        ? "Processing did not complete. Try adding this video again if you still need it indexed."
        : "No summary yet — this video may still be processing.");

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
