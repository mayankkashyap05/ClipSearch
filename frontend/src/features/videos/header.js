import { state } from "../../state/app-state.js";
import { formatTime, videoStatus, videoStatusLabel } from "../../utils/format.js";
import { showToast } from "../../components/feedback.js";

export function createWorkspaceHeader({ onBack, onOpenIngest, onOpenShortcuts, onScopeChange }) {
  const backBtn = document.getElementById("backToHome");
  const titleEl = document.getElementById("centerTitle");
  const statusBadge = document.getElementById("workspaceStatusBadge");
  const statusText = document.getElementById("workspaceStatusText");
  const durationText = document.getElementById("workspaceDurationText");
  const scopeVideoBtn = document.getElementById("scopeVideoBtn");
  const scopeLibraryBtn = document.getElementById("scopeLibraryBtn");
  const shareBtn = document.getElementById("btnShareMoment");
  const shortcutsBtn = document.getElementById("btnOpenShortcuts");
  const addBtn = document.getElementById("btnOpenIngest");

  function update({ video, job, duration }) {
    if (!video) {
      if (titleEl) titleEl.textContent = "Select a video";
      if (statusBadge) {
        statusBadge.className = "workspace-status-badge unknown";
        statusText.textContent = "No video selected";
      }
      if (durationText) durationText.textContent = "00:00";
      return;
    }

    const title = video.filename || video.video_id || "Untitled Video";
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.title = title;
    }

    const rawStatus = (job && job.status) || video.status || "pending";
    const status = videoStatus(rawStatus);
    const stage = (job && job.current_stage) || video.current_stage;
    let label = videoStatusLabel(status);
    if (status === "processing" && stage) {
      label = `Processing · ${stage.replace(/[_-]+/g, " ")}`;
    }

    if (statusBadge) {
      statusBadge.className = `workspace-status-badge ${status}`;
      if (statusText) statusText.textContent = label;
    }

    const dur = duration || state.player.duration || 0;
    if (durationText) {
      durationText.textContent = dur > 0 ? formatTime(dur) : (status === "completed" ? "Ready" : "—");
    }

    updateScopeUI();
  }

  function updateScopeUI() {
    const isVideoScope = state.workspace.searchScope === "video";
    if (scopeVideoBtn) scopeVideoBtn.classList.toggle("active", isVideoScope);
    if (scopeLibraryBtn) scopeLibraryBtn.classList.toggle("active", !isVideoScope);
  }

  function copyCurrentMomentLink() {
    const currentTime = Math.floor(state.player.currentTime || 0);
    const videoId = state.workspace.selectedVideoId;
    if (!videoId) {
      showToast("error", "No active video selected.");
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("v", videoId);
    url.searchParams.set("t", String(currentTime));

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url.toString()).then(() => {
        showToast("success", `Moment link copied (${formatTime(currentTime)})`);
      }).catch(() => {
        showToast("success", `Timestamp ${formatTime(currentTime)} ready`);
      });
    } else {
      showToast("success", `Timestamp: ${formatTime(currentTime)}`);
    }
  }

  if (backBtn) backBtn.addEventListener("click", onBack);
  if (shareBtn) shareBtn.addEventListener("click", copyCurrentMomentLink);
  if (shortcutsBtn) shortcutsBtn.addEventListener("click", onOpenShortcuts);
  if (addBtn) addBtn.addEventListener("click", onOpenIngest);

  if (scopeVideoBtn) {
    scopeVideoBtn.addEventListener("click", () => {
      state.workspace.searchScope = "video";
      updateScopeUI();
      onScopeChange("video");
    });
  }
  if (scopeLibraryBtn) {
    scopeLibraryBtn.addEventListener("click", () => {
      state.workspace.searchScope = "library";
      updateScopeUI();
      onScopeChange("library");
    });
  }

  return {
    update,
    updateScopeUI,
  };
}
