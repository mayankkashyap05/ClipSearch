import { api } from "../../services/api.js";
import { state } from "../../state/app-state.js";
import { showToast } from "../../components/feedback.js";
import { showScreen } from "../../components/navigation.js";
import { parseChapters } from "../../utils/format.js";

import { createWorkspaceHeader } from "./header.js";
import { createTimeline } from "./timeline.js";
import { createSearchPanel } from "./panels/search-panel.js";
import { createTranscriptPanel } from "./panels/transcript-panel.js";
import { createChatPanel } from "./panels/chat-panel.js";
import { createChaptersPanel } from "./panels/chapters-panel.js";
import { createOverviewPanel } from "./panels/overview-panel.js";
import { createIngestDrawer } from "./panels/ingest-drawer.js";
import { createShortcutsModal } from "../../components/shortcuts-modal.js";

const STAGE_ORDER = ["downloading", "preprocessing", "transcribing", "diarizing", "captioning", "summarizing", "indexing", "done"];
const STAGE_LABELS = {
  downloading: "Downloading",
  preprocessing: "Preprocessing",
  transcribing: "Transcription",
  diarizing: "Speaker Diarization",
  captioning: "Visual Captioning",
  summarizing: "Summarizing",
  indexing: "Indexing",
  done: "Completed",
};
const PROCESSING_STAGES = new Set(["pending", "processing"]);

export function createWorkspaceFeature({ player, refreshVideos, resetChat }) {
  const emptyState = document.getElementById("workspaceEmptyState");
  const processingState = document.getElementById("workspaceProcessingState");
  const studioLayout = document.getElementById("workspaceStudioLayout");
  const pipelineTrack = document.getElementById("pipelineProgressTrack");
  const processingTitle = document.getElementById("processingTitle");
  const processingCaption = document.getElementById("processingCaption");
  const emptyStateAddBtn = document.getElementById("emptyStateAddBtn");

  // Tabs
  const tabSearch = document.getElementById("tabSearch");
  const tabTranscript = document.getElementById("tabTranscript");
  const tabChat = document.getElementById("tabChat");
  const tabChapters = document.getElementById("tabChapters");
  const tabOverview = document.getElementById("tabOverview");

  const panelSearch = document.getElementById("panelSearch");
  const panelTranscript = document.getElementById("panelTranscript");
  const panelChat = document.getElementById("panelChat");
  const panelChapters = document.getElementById("panelChapters");
  const panelOverview = document.getElementById("panelOverview");

  // Sub-controllers
  const shortcutsModal = createShortcutsModal();

  const ingestDrawer = createIngestDrawer({
    onIngestSuccess: (jobId, videoId, title) => {
      beginProcessing(jobId, videoId, title);
    },
    refreshVideos,
  });

  const timeline = createTimeline({ player });

  const header = createWorkspaceHeader({
    onBack: () => {
      showScreen("home", { focus: true });
      if (refreshVideos) refreshVideos();
    },
    onOpenIngest: () => ingestDrawer.open("file"),
    onOpenShortcuts: () => shortcutsModal.open(),
    onScopeChange: scope => {
      if (scope === "library") {
        setTab("search");
      }
    },
  });

  const searchPanel = createSearchPanel({
    player,
    timeline,
    library: {
      findVideo: async id => {
        let v = state.library.items.find(item => item.video_id === id);
        if (!v) {
          try {
            const data = await api.listVideos();
            state.library.items = Array.isArray(data.videos) ? data.videos : [];
            v = state.library.items.find(item => item.video_id === id);
          } catch (_e) {}
        }
        return v;
      },
    },
    onSelectVideo: video => {
      openVideoInWorkspace(video);
    },
  });

  const transcriptPanel = createTranscriptPanel({ player });
  const chatPanel = createChatPanel({ player });
  const chaptersPanel = createChaptersPanel({
    player,
    onChapterSelect: start => {
      // Seek handled by player
    },
  });
  const overviewPanel = createOverviewPanel();

  // Tab Switching
  const tabs = [
    { id: "search", btn: tabSearch, pane: panelSearch },
    { id: "transcript", btn: tabTranscript, pane: panelTranscript },
    { id: "chat", btn: tabChat, pane: panelChat },
    { id: "chapters", btn: tabChapters, pane: panelChapters },
    { id: "overview", btn: tabOverview, pane: panelOverview },
  ];

  function setTab(tabId) {
    state.workspace.activeTab = tabId;
    tabs.forEach(t => {
      const active = t.id === tabId;
      if (t.btn) {
        t.btn.classList.toggle("active", active);
        t.btn.setAttribute("aria-selected", String(active));
      }
      if (t.pane) {
        t.pane.classList.toggle("active", active);
        t.pane.hidden = !active;
      }
    });

    if (tabId === "search") {
      requestAnimationFrame(() => searchPanel.focusInput());
    }
  }

  tabs.forEach(t => {
    if (t.btn) {
      t.btn.addEventListener("click", () => setTab(t.id));
    }
  });

  function openWorkspace(focusTarget) {
    showScreen("workspace", { focus: !focusTarget });
    if (focusTarget === "upload") {
      ingestDrawer.open("file");
    } else if (focusTarget === "search") {
      setTab("search");
      requestAnimationFrame(() => searchPanel.focusInput());
    }
  }

  function renderPipelineProgress(currentStage, isFailed, isDone) {
    if (!pipelineTrack) return;
    const curIdx = STAGE_ORDER.indexOf(currentStage);
    pipelineTrack.innerHTML = STAGE_ORDER.map((stage, idx) => {
      let cls = "pipeline-step";
      let statusIcon = `${idx + 1}`;
      if (isFailed && idx === Math.max(curIdx, 0)) {
        cls += " failed";
        statusIcon = "✕";
      } else if (isDone || (curIdx >= 0 && idx < curIdx)) {
        cls += " done";
        statusIcon = "✓";
      } else if (idx === curIdx) {
        cls += " active";
        statusIcon = "●";
      }
      return `
        <div class="${cls}">
          <span class="step-num">${statusIcon}</span>
          <span class="step-name">${STAGE_LABELS[stage]}</span>
        </div>`;
    }).join("");
  }

  function setViewMode(mode) {
    // mode: "empty" | "processing" | "studio"
    if (emptyState) emptyState.hidden = mode !== "empty";
    if (processingState) processingState.hidden = mode !== "processing";
    if (studioLayout) studioLayout.hidden = mode !== "studio";
  }

  function setScope(videoId, title) {
    state.workspace.scopedVideoId = videoId || null;
    state.workspace.scopedVideoTitle = videoId ? (title || videoId) : null;
    header.updateScopeUI();
  }

  function stopJobPolling() {
    if (state.workspace.jobPollTimer) {
      window.clearInterval(state.workspace.jobPollTimer);
      state.workspace.jobPollTimer = null;
    }
    state.workspace.activeJobId = null;
  }

  function startPollingJob(jobId, videoId, title) {
    stopJobPolling();
    state.workspace.activeJobId = jobId;
    let isPolling = false;

    const poll = async () => {
      if (isPolling || state.workspace.activeJobId !== jobId) return;
      isPolling = true;
      try {
        const job = await api.getJob(jobId);
        if (state.workspace.activeJobId !== jobId) return;

        const isFailed = job.status === "failed";
        const isDone = job.status === "completed";
        state.workspace.job = job;

        renderPipelineProgress(job.current_stage, isFailed, isDone);
        if (processingCaption) {
          processingCaption.textContent = isFailed
            ? `Processing failed: ${job.error_message || "Unknown error."}`
            : (job.status === "pending"
                ? "Queued — waiting for processing worker."
                : `Currently running: ${STAGE_LABELS[job.current_stage] || job.current_stage}…`);
        }

        if (isDone || isFailed) {
          stopJobPolling();
          if (refreshVideos) refreshVideos();

          if (state.workspace.selectedVideoId === videoId && state.ui.screen === "workspace") {
            const videoData = {
              video_id: job.video_id,
              filename: title || job.video_id,
              summary: job.summary,
              chapters: job.chapters,
              status: job.status,
              error_message: job.error_message,
              current_stage: job.current_stage,
            };

            if (isDone) {
              showVideoInStudio(videoData, job);
              showToast("success", "Video indexing complete! Ready to search and interrogate.");
            } else {
              showVideoInStudio(videoData, job);
              showToast("error", `Processing failed: ${job.error_message || "Unknown error"}`);
            }
          }
        }
      } catch (_e) {
        stopJobPolling();
      } finally {
        isPolling = false;
      }
    };

    poll();
    state.workspace.jobPollTimer = window.setInterval(poll, 3000);
  }

  function beginProcessing(jobId, videoId, title) {
    state.workspace.selectedVideoId = videoId;
    state.workspace.currentVideo = { video_id: videoId, filename: title, status: "processing" };
    setScope(videoId, title);
    setViewMode("processing");
    if (processingTitle) processingTitle.textContent = `Processing “${title}”`;
    renderPipelineProgress("downloading", false, false);
    header.update({ video: { video_id: videoId, filename: title, status: "processing" } });
    startPollingJob(jobId, videoId, title);
  }

  function openVideoInWorkspace(video) {
    if (!video || !video.video_id) return;
    stopJobPolling();
    openWorkspace();
    state.workspace.selectedVideoId = video.video_id;
    state.workspace.currentVideo = video;
    setScope(video.video_id, video.filename);
    if (resetChat) resetChat();
    chatPanel.reset();

    const isProcessing = PROCESSING_STAGES.has(String(video.status || "").toLowerCase());
    if (isProcessing && video.job_id) {
      setViewMode("processing");
      if (processingTitle) processingTitle.textContent = `Processing “${video.filename || video.video_id}”`;
      header.update({ video });
      startPollingJob(video.job_id, video.video_id, video.filename);
    } else {
      showVideoInStudio(video);
      if (video.job_id) {
        loadFinalJobDetails(video);
      }
    }
  }

  async function loadFinalJobDetails(video) {
    try {
      const job = await api.getJob(video.job_id);
      if (state.workspace.selectedVideoId !== video.video_id) return;
      state.workspace.job = job;
      const mergedVideo = {
        ...video,
        summary: job.summary || video.summary,
        chapters: job.chapters || video.chapters,
        status: job.status,
        error_message: job.error_message,
        current_stage: job.current_stage,
      };
      showVideoInStudio(mergedVideo, job);
    } catch (_e) {}
  }

  function showVideoInStudio(video, job = null) {
    setViewMode("studio");
    state.workspace.currentVideo = video;
    state.workspace.job = job;

    // Load Player
    player.ensureVideoLoaded(video);

    // Parse Chapters
    const chapters = parseChapters((job && job.chapters) || video.chapters);
    timeline.setChapters(chapters);
    chaptersPanel.renderChapters(chapters);

    // Update Header & Overview
    header.update({ video, job });
    overviewPanel.render({ video, job });

    // Load transcript moments
    transcriptPanel.loadMomentsForVideo(video.video_id, chapters);

    // If Search results exist, render them
    if (state.workspace.searchResults.length) {
      searchPanel.renderResultsList();
    }
  }

  function openSearchResultVideo(video) {
    openVideoInWorkspace(video);
  }

  // Keyboard Navigation Handling
  function handleGlobalKeyDown(e) {
    if (state.ui.screen !== "workspace") return;

    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (
      activeEl.tagName === "INPUT" ||
      activeEl.tagName === "TEXTAREA" ||
      activeEl.isContentEditable
    );

    // Esc closes modals/drawers or goes back to library
    if (e.key === "Escape") {
      if (state.workspace.shortcutsOpen) {
        shortcutsModal.close();
        return;
      }
      if (state.workspace.drawerOpen) {
        ingestDrawer.close();
        return;
      }
      if (isInputFocused) {
        activeEl.blur();
        return;
      }
      // Return to library
      showScreen("home", { focus: true });
      if (refreshVideos) refreshVideos();
      return;
    }

    // Modal is open -> let user interact with modal
    if (state.workspace.shortcutsOpen || state.workspace.drawerOpen) return;

    // Non-input shortcut handling
    if (!isInputFocused) {
      if (e.key === "/" || e.key === "s") {
        e.preventDefault();
        setTab("search");
        searchPanel.focusInput();
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        shortcutsModal.toggle();
        return;
      }

      if (e.key >= "1" && e.key <= "5") {
        const tabMap = ["search", "transcript", "chat", "chapters", "overview"];
        const targetTab = tabMap[Number(e.key) - 1];
        if (targetTab) {
          e.preventDefault();
          setTab(targetTab);
        }
        return;
      }

      // Video Controls
      if (e.key === " " || e.key === "k" || e.key === "K") {
        e.preventDefault();
        player.togglePlay();
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        player.seekRelative(-5);
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        player.seekRelative(5);
        return;
      }

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        player.seekRelative(-10);
        return;
      }

      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        player.seekRelative(10);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        player.setVolume((state.player.volume || 1) + 0.1);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        player.setVolume((state.player.volume || 1) - 0.1);
        return;
      }

      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        player.toggleMute();
        return;
      }

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        player.toggleFullscreen();
        return;
      }
    }
  }

  document.addEventListener("keydown", handleGlobalKeyDown);

  // Global Workspace Listeners
  if (emptyStateAddBtn) {
    emptyStateAddBtn.addEventListener("click", () => ingestDrawer.open("file"));
  }

  document.querySelectorAll("[data-open-library]").forEach(btn => {
    btn.addEventListener("click", () => {
      showScreen("home", { focus: true });
      if (refreshVideos) refreshVideos();
    });
  });

  const seeAllBtn = document.getElementById("seeAllBtn");
  if (seeAllBtn) seeAllBtn.addEventListener("click", () => openWorkspace());
  const goUpload = document.getElementById("goUpload");
  if (goUpload) goUpload.addEventListener("click", () => openWorkspace("upload"));
  const goSearch = document.getElementById("goSearch");
  if (goSearch) goSearch.addEventListener("click", () => openWorkspace("search"));

  function reset() {
    stopJobPolling();
    state.workspace.scopedVideoId = null;
    state.workspace.scopedVideoTitle = null;
    state.workspace.selectedVideoId = null;
    state.workspace.currentVideo = null;
    state.workspace.job = null;
    searchPanel.reset();
    transcriptPanel.reset();
    chatPanel.reset();
    chaptersPanel.reset();
    overviewPanel.reset();
    ingestDrawer.reset();
    shortcutsModal.close();
    header.update({ video: null });
    setViewMode("empty");
  }

  return {
    openWorkspace,
    openVideoInWorkspace,
    openSearchResultVideo,
    beginProcessing,
    startPollingJob,
    stopJobPolling,
    setScope,
    setTab,
    reset,
    searchPanel,
    chatPanel,
    transcriptPanel,
    chaptersPanel,
    overviewPanel,
    ingestDrawer,
  };
}
