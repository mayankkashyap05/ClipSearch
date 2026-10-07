import { api } from "../../../services/api.js";
import { state } from "../../../state/app-state.js";
import { escapeHtml, formatTime, highlightMatch } from "../../../utils/format.js";

export function createTranscriptPanel({ player }) {
  const stream = document.getElementById("transcriptStream");
  const filterInput = document.getElementById("transcriptFilterInput");
  const autoScrollBtn = document.getElementById("btnToggleAutoScroll");
  const transcriptBadge = document.getElementById("transcriptBadge");

  let moments = [];
  let userIsScrolling = false;
  let scrollTimeout = null;

  function setAutoFollow(enabled) {
    state.workspace.autoFollowTranscript = enabled;
    if (autoScrollBtn) {
      autoScrollBtn.setAttribute("aria-pressed", String(enabled));
      autoScrollBtn.classList.toggle("active", enabled);
    }
  }

  function updateBadge(count) {
    if (!transcriptBadge) return;
    if (count > 0) {
      transcriptBadge.textContent = String(count);
      transcriptBadge.hidden = false;
    } else {
      transcriptBadge.hidden = true;
    }
  }

  function parseSpeakerFromText(text) {
    if (!text) return { speaker: "Speech", body: "" };
    const match = text.match(/^([A-Za-z0-9_ -]+):\s*(.*)$/);
    if (match) {
      return { speaker: match[1], body: match[2] };
    }
    return { speaker: "Speech", body: text };
  }

  function renderTranscript() {
    if (!stream) return;
    const filterQuery = (filterInput && filterInput.value.trim()) || "";
    let visible = moments;

    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      visible = moments.filter(m => (m.text && m.text.toLowerCase().includes(q)) || formatTime(m.timestamp).includes(q));
    }

    updateBadge(moments.length);

    if (!moments.length) {
      stream.innerHTML = `
        <div class="pane-empty-placeholder">
          <span class="placeholder-icon"><svg class="icon" aria-hidden="true"><use href="#icon-transcript"></use></svg></span>
          <h4>No transcript available</h4>
          <p>Transcript segments will appear once this video has completed speech recognition processing.</p>
        </div>`;
      return;
    }

    if (!visible.length) {
      stream.innerHTML = `
        <div class="pane-empty-placeholder">
          <h4>No matching lines</h4>
          <p>No transcript segments matched “${escapeHtml(filterQuery)}”.</p>
        </div>`;
      return;
    }

    stream.innerHTML = visible.map((m, idx) => {
      const isVisual = m.type === "visual";
      const { speaker, body } = parseSpeakerFromText(m.text);
      const speakerLabel = isVisual ? "Visual Scene" : speaker;
      const content = isVisual ? m.text : body;
      const timestamp = Number(m.timestamp) || 0;

      return `
        <div class="transcript-row ${isVisual ? "visual" : "speech"}" data-index="${idx}" data-timestamp="${timestamp}">
          <button class="transcript-time-btn" type="button" data-timestamp="${timestamp}" title="Jump to ${formatTime(timestamp)}">
            <svg class="icon" aria-hidden="true"><use href="#icon-play"></use></svg>
            <span>${formatTime(timestamp)}</span>
          </button>
          <div class="transcript-content">
            <div class="transcript-speaker-tag ${isVisual ? "visual-tag" : ""}">${escapeHtml(speakerLabel)}</div>
            <p class="transcript-line">${highlightMatch(content, filterQuery)}</p>
          </div>
        </div>`;
    }).join("");
  }

  function syncActiveSegment(currentTime) {
    if (!moments.length || !stream) return;
    let activeIdx = -1;
    for (let i = 0; i < moments.length; i++) {
      const currentTs = Number(moments[i].timestamp);
      const nextTs = i + 1 < moments.length ? Number(moments[i + 1].timestamp) : Infinity;
      if (currentTime >= currentTs - 0.25 && currentTime < nextTs) {
        activeIdx = i;
        break;
      }
    }

    if (activeIdx === -1 && moments.length > 0 && currentTime >= moments[moments.length - 1].timestamp) {
      activeIdx = moments.length - 1;
    }

    if (activeIdx !== state.workspace.activeMomentIndex) {
      state.workspace.activeMomentIndex = activeIdx;
      const rows = stream.querySelectorAll(".transcript-row");
      rows.forEach(r => {
        const isCurrent = Number(r.dataset.index) === activeIdx;
        r.classList.toggle("active-moment", isCurrent);
      });

      if (state.workspace.autoFollowTranscript && !userIsScrolling && activeIdx >= 0 && rows[activeIdx]) {
        rows[activeIdx].scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  async function loadMomentsForVideo(videoId, chaptersData) {
    moments = [];
    state.workspace.moments = [];
    state.workspace.activeMomentIndex = -1;

    if (!videoId) {
      renderTranscript();
      return;
    }

    // Try fetching indexed speech & visual segments via the search endpoint
    try {
      const searchRes = await api.searchVideos("a", 50, videoId);
      if (searchRes && Array.isArray(searchRes.results)) {
        moments = searchRes.results.map(r => ({
          timestamp: Number(r.timestamp) || 0,
          text: r.text || "",
          type: r.type || "speech",
          video_id: r.video_id || videoId,
        }));
      }
    } catch (_e) {}

    // If chapters exist, merge them if no moments were found
    if (!moments.length && Array.isArray(chaptersData) && chaptersData.length) {
      moments = chaptersData.map(ch => ({
        timestamp: ch.start || 0,
        text: ch.title || "Chapter",
        type: "speech",
        video_id: videoId,
      }));
    }

    moments.sort((a, b) => a.timestamp - b.timestamp);
    state.workspace.moments = moments;
    renderTranscript();
  }

  // Event Listeners
  if (filterInput) {
    filterInput.addEventListener("input", () => {
      renderTranscript();
    });
  }

  if (autoScrollBtn) {
    autoScrollBtn.addEventListener("click", () => {
      setAutoFollow(!state.workspace.autoFollowTranscript);
    });
  }

  if (stream) {
    stream.addEventListener("scroll", () => {
      userIsScrolling = true;
      if (scrollTimeout) window.clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        userIsScrolling = false;
      }, 1500);
    });

    stream.addEventListener("click", e => {
      const timeBtn = e.target.closest("[data-timestamp]");
      if (timeBtn) {
        const ts = Number(timeBtn.dataset.timestamp);
        if (Number.isFinite(ts)) {
          player.seekTo(ts);
        }
      }
    });
  }

  player.onPlayheadChange(syncActiveSegment);

  function reset() {
    moments = [];
    state.workspace.moments = [];
    state.workspace.activeMomentIndex = -1;
    if (filterInput) filterInput.value = "";
    updateBadge(0);
    renderTranscript();
  }

  return {
    loadMomentsForVideo,
    renderTranscript,
    reset,
  };
}
