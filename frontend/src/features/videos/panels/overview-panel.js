import { state } from "../../../state/app-state.js";
import { escapeHtml, formatCreatedAt, formatDuration, formatTime, videoStatus, videoStatusLabel } from "../../../utils/format.js";
import { showToast } from "../../../components/feedback.js";

export function createOverviewPanel() {
  const summaryEl = document.getElementById("centerSummary");
  const metaDuration = document.getElementById("metaDuration");
  const metaStatus = document.getElementById("metaStatus");
  const metaMomentsCount = document.getElementById("metaMomentsCount");
  const metaDate = document.getElementById("metaDate");
  const metaVideoId = document.getElementById("metaVideoId");
  const metaJobId = document.getElementById("metaJobId");
  const metaFilename = document.getElementById("metaFilename");
  const metaStage = document.getElementById("metaStage");
  const disclosure = document.getElementById("techDetailsDisclosure");

  function render({ video, job, duration, momentsCount }) {
    if (!video) {
      if (summaryEl) summaryEl.textContent = "Select a video to view its overview and summary.";
      if (metaDuration) metaDuration.textContent = "—";
      if (metaStatus) metaStatus.textContent = "—";
      if (metaMomentsCount) metaMomentsCount.textContent = "—";
      if (metaDate) metaDate.textContent = "—";
      if (metaVideoId) metaVideoId.textContent = "—";
      if (metaJobId) metaJobId.textContent = "—";
      if (metaFilename) metaFilename.textContent = "—";
      if (metaStage) metaStage.textContent = "—";
      return;
    }

    const rawStatus = (job && job.status) || video.status || "pending";
    const status = videoStatus(rawStatus);
    const summaryText = (job && job.summary) || video.summary;

    if (summaryEl) {
      if (summaryText) {
        summaryEl.textContent = summaryText;
      } else if (job && job.error_message) {
        summaryEl.textContent = `Processing error: ${job.error_message}`;
      } else if (status === "processing" || status === "pending") {
        summaryEl.textContent = "Video is currently processing. The summary will be generated as soon as transcription and analysis are complete.";
      } else {
        summaryEl.textContent = "No summary recorded for this video.";
      }
    }

    const dur = duration || state.player.duration || 0;
    if (metaDuration) {
      metaDuration.textContent = dur > 0 ? formatDuration(dur) : (status === "completed" ? "Indexed" : "—");
    }

    if (metaStatus) {
      metaStatus.textContent = videoStatusLabel(status);
    }

    if (metaMomentsCount) {
      metaMomentsCount.textContent = momentsCount > 0 ? `${momentsCount} moments` : (state.workspace.moments.length ? `${state.workspace.moments.length} moments` : "—");
    }

    if (metaDate) {
      metaDate.textContent = formatCreatedAt(video.created_at) || "—";
    }

    if (metaVideoId) metaVideoId.textContent = video.video_id || "—";
    if (metaJobId) metaJobId.textContent = (job && job.id) || video.job_id || "—";
    if (metaFilename) metaFilename.textContent = video.filename || video.video_id || "—";
    if (metaStage) {
      const stage = (job && job.current_stage) || video.current_stage || (status === "completed" ? "done" : "queued");
      metaStage.textContent = stage.replace(/[_-]+/g, " ");
    }
  }

  // Copy meta buttons
  document.querySelectorAll("[data-copy-target]").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.copyTarget;
      const el = document.getElementById(targetId);
      if (el && el.textContent && el.textContent !== "—") {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(el.textContent).then(() => {
            showToast("success", "Copied to clipboard");
          });
        }
      }
    });
  });

  function reset() {
    render({ video: null });
  }

  return {
    render,
    reset,
  };
}
