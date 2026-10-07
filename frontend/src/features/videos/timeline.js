import { state } from "../../state/app-state.js";
import { formatTime } from "../../utils/format.js";

export function createTimeline({ player }) {
  const container = document.getElementById("timelineContainer");
  const bar = document.getElementById("timelineBar");
  const progress = document.getElementById("timelineProgress");
  const buffer = document.getElementById("timelineBuffer");
  const playhead = document.getElementById("timelinePlayhead");
  const markersContainer = document.getElementById("timelineMarkers");
  const tooltip = document.getElementById("timelineTooltip");
  const tooltipTime = document.getElementById("tooltipTime");
  const tooltipChapter = document.getElementById("tooltipChapter");

  let isDragging = false;
  let chapters = [];
  let searchHits = [];

  function updateProgress(currentTime, duration) {
    if (isDragging) return;
    const dur = duration || state.player.duration || 0;
    const pct = dur > 0 ? Math.min(Math.max((currentTime / dur) * 100, 0), 100) : 0;
    if (progress) progress.style.width = `${pct}%`;
    if (playhead) playhead.style.left = `${pct}%`;
    if (bar) bar.setAttribute("aria-valuenow", Math.round(pct));

    // Update buffer progress if available
    const video = player.getElement();
    if (buffer && video.buffered.length > 0 && dur > 0) {
      try {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const bufPct = Math.min((bufferedEnd / dur) * 100, 100);
        buffer.style.width = `${bufPct}%`;
      } catch (_e) {}
    }
  }

  function getHoverTime(e) {
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const pos = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const dur = state.player.duration || 0;
    return { time: pos * dur, percent: pos * 100, clientX: e.clientX, rect };
  }

  function findChapterAtTime(time) {
    if (!chapters || !chapters.length) return null;
    let current = null;
    for (const ch of chapters) {
      if (ch.start <= time + 0.5) {
        current = ch;
      } else {
        break;
      }
    }
    return current;
  }

  function onPointerMove(e) {
    const { time, percent, rect } = getHoverTime(e);
    if (tooltip && time >= 0 && (state.player.duration > 0 || isDragging)) {
      tooltip.style.left = `${Math.min(Math.max(e.clientX - rect.left, 24), rect.width - 24)}px`;
      if (tooltipTime) tooltipTime.textContent = formatTime(time);
      const ch = findChapterAtTime(time);
      if (tooltipChapter) {
        tooltipChapter.textContent = ch ? ` · ${ch.title}` : "";
      }
      tooltip.classList.add("visible");
    }

    if (isDragging) {
      if (progress) progress.style.width = `${percent}%`;
      if (playhead) playhead.style.left = `${percent}%`;
    }
  }

  function onPointerLeave() {
    if (!isDragging && tooltip) {
      tooltip.classList.remove("visible");
    }
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    isDragging = true;
    bar.setPointerCapture(e.pointerId);
    const { time, percent } = getHoverTime(e);
    if (progress) progress.style.width = `${percent}%`;
    if (playhead) playhead.style.left = `${percent}%`;
    player.seekTo(time).catch(() => {});
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    const { time } = getHoverTime(e);
    player.seekTo(time).catch(() => {});
    if (tooltip) tooltip.classList.remove("visible");
  }

  function renderMarkers() {
    if (!markersContainer) return;
    markersContainer.replaceChildren();
    const dur = state.player.duration || 0;
    if (dur <= 0) return;

    // Render Chapter Ticks
    if (chapters && chapters.length > 0) {
      chapters.forEach(ch => {
        if (ch.start > 0 && ch.start < dur) {
          const pct = (ch.start / dur) * 100;
          const tick = document.createElement("div");
          tick.className = "timeline-chapter-tick";
          tick.style.left = `${pct}%`;
          tick.title = `${ch.title} (${formatTime(ch.start)})`;
          markersContainer.appendChild(tick);
        }
      });
    }

    // Render Search Hit Pips
    if (searchHits && searchHits.length > 0) {
      searchHits.forEach((hit, idx) => {
        const timestamp = Number(hit.timestamp);
        if (Number.isFinite(timestamp) && timestamp <= dur) {
          const pct = (timestamp / dur) * 100;
          const pip = document.createElement("button");
          pip.type = "button";
          pip.className = `timeline-hit-pip ${hit.type || "speech"}`;
          pip.style.left = `${pct}%`;
          pip.dataset.index = String(idx);
          pip.title = `Moment at ${formatTime(timestamp)}: ${hit.text || ""}`;
          pip.addEventListener("click", e => {
            e.stopPropagation();
            player.seekTo(timestamp);
          });
          markersContainer.appendChild(pip);
        }
      });
    }
  }

  function setChapters(newChapters) {
    chapters = Array.isArray(newChapters) ? newChapters : [];
    renderMarkers();
  }

  function setSearchHits(hits) {
    searchHits = Array.isArray(hits) ? hits : [];
    renderMarkers();
  }

  function clearSearchHits() {
    searchHits = [];
    renderMarkers();
  }

  // Bind Events
  if (bar) {
    bar.addEventListener("pointerdown", onPointerDown);
    bar.addEventListener("pointermove", onPointerMove);
    bar.addEventListener("pointerup", onPointerUp);
    bar.addEventListener("pointercancel", onPointerUp);
    bar.addEventListener("pointerleave", onPointerLeave);
  }

  player.onPlayheadChange(updateProgress);
  player.onDurationChange(() => {
    updateProgress(player.getElement().currentTime, player.getElement().duration);
    renderMarkers();
  });

  return {
    setChapters,
    setSearchHits,
    clearSearchHits,
    updateProgress,
  };
}
