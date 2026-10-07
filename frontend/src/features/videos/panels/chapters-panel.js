import { state } from "../../../state/app-state.js";
import { escapeHtml, formatTime, parseChapters } from "../../../utils/format.js";

export function createChaptersPanel({ player, onChapterSelect }) {
  const container = document.getElementById("centerChapters");
  const badge = document.getElementById("chaptersBadge");
  const contextTag = document.getElementById("contextTag");
  const contextDesc = document.getElementById("contextDesc");
  const contextPill = document.getElementById("contextPill");

  let chaptersList = [];

  function updateBadge(count) {
    if (!badge) return;
    if (count > 0) {
      badge.textContent = String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function renderChapters(chaptersData) {
    chaptersList = parseChapters(chaptersData);
    updateBadge(chaptersList.length);

    if (!container) return;

    if (!chaptersList.length) {
      container.innerHTML = `
        <div class="pane-empty-placeholder">
          <span class="placeholder-icon"><svg class="icon" aria-hidden="true"><use href="#icon-chapters"></use></svg></span>
          <h4>No chapters detected</h4>
          <p>Chapters are automatically generated to mark topic changes when recordings are processed.</p>
        </div>`;
      if (contextTag) contextTag.textContent = "Video";
      if (contextDesc) contextDesc.textContent = state.workspace.currentVideo ? state.workspace.currentVideo.filename : "Playback";
      return;
    }

    container.innerHTML = chaptersList.map((ch, idx) => {
      const start = Number(ch.start) || 0;
      return `
        <button class="chapter-card" type="button" data-index="${idx}" data-start="${start}" title="Jump to ${escapeHtml(ch.title)} (${formatTime(start)})">
          <div class="chapter-card-left">
            <span class="chapter-num">${idx + 1}</span>
            <div class="chapter-info">
              <span class="chapter-title">${escapeHtml(ch.title)}</span>
              <span class="chapter-start-time">${formatTime(start)}</span>
            </div>
          </div>
          <svg class="icon chapter-play-icon" aria-hidden="true"><use href="#icon-play"></use></svg>
        </button>`;
    }).join("");
  }

  function syncActiveChapter(currentTime) {
    if (!chaptersList.length) return;

    let activeIdx = -1;
    for (let i = 0; i < chaptersList.length; i++) {
      const ch = chaptersList[i];
      const nextCh = chaptersList[i + 1];
      if (currentTime >= ch.start - 0.5 && (!nextCh || currentTime < nextCh.start)) {
        activeIdx = i;
        break;
      }
    }

    if (activeIdx !== state.workspace.activeChapterIndex) {
      state.workspace.activeChapterIndex = activeIdx;
      if (container) {
        container.querySelectorAll(".chapter-card").forEach((card, idx) => {
          card.classList.toggle("active-chapter", idx === activeIdx);
        });
      }

      if (activeIdx >= 0 && chaptersList[activeIdx]) {
        const cur = chaptersList[activeIdx];
        if (contextTag) contextTag.textContent = `Ch ${activeIdx + 1}`;
        if (contextDesc) contextDesc.textContent = cur.title;
      }
    }
  }

  if (container) {
    container.addEventListener("click", e => {
      const card = e.target.closest(".chapter-card");
      if (!card) return;
      const start = Number(card.dataset.start);
      if (Number.isFinite(start)) {
        player.seekTo(start);
        if (onChapterSelect) onChapterSelect(start);
      }
    });
  }

  player.onPlayheadChange(syncActiveChapter);

  function reset() {
    chaptersList = [];
    state.workspace.activeChapterIndex = -1;
    updateBadge(0);
    if (container) {
      container.innerHTML = `
        <div class="pane-empty-placeholder">
          <span class="placeholder-icon"><svg class="icon" aria-hidden="true"><use href="#icon-chapters"></use></svg></span>
          <h4>No chapters detected</h4>
          <p>Chapters are automatically generated when recordings are processed.</p>
        </div>`;
    }
    if (contextTag) contextTag.textContent = "Video";
    if (contextDesc) contextDesc.textContent = "Playback";
  }

  return {
    renderChapters,
    getChapters() { return chaptersList; },
    reset,
  };
}
