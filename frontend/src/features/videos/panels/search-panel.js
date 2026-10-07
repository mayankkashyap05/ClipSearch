import { api } from "../../../services/api.js";
import { state } from "../../../state/app-state.js";
import { escapeHtml, formatSpokenTime, formatTime, highlightMatch } from "../../../utils/format.js";
import { showToast } from "../../../components/feedback.js";

export function createSearchPanel({ player, timeline, library, onSelectVideo }) {
  const form = document.getElementById("searchForm");
  const input = document.getElementById("searchInput");
  const btnClear = document.getElementById("btnClearSearch");
  const btnSubmit = document.getElementById("searchBtn");
  const resultsBox = document.getElementById("searchResults");
  const filterPills = document.getElementById("searchFilterPills");
  const searchBadge = document.getElementById("searchBadge");

  let activeFilter = "all"; // "all" | "speech" | "visual"

  function updateBadge(count) {
    if (!searchBadge) return;
    if (count > 0) {
      searchBadge.textContent = String(count);
      searchBadge.hidden = false;
    } else {
      searchBadge.hidden = true;
    }
  }

  function setActiveResult(index) {
    state.workspace.activeResultIndex = index;
    if (!resultsBox) return;
    resultsBox.querySelectorAll(".result-card").forEach(item => {
      const active = Number(item.dataset.index) === index;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });
  }

  function syncActiveResultWithPlayhead(currentTime) {
    const videoId = state.player.videoId;
    if (!videoId || !state.workspace.searchResults.length || player.getElement().seeking) return;
    let best = -1;
    let bestTime = -Infinity;
    state.workspace.searchResults.forEach((result, index) => {
      const resultVideo = result.video_id || state.workspace.scopedVideoId;
      if (resultVideo !== videoId) return;
      const timestamp = Number(result.timestamp);
      if (Number.isFinite(timestamp) && timestamp <= currentTime + 0.5 && timestamp > bestTime) {
        best = index;
        bestTime = timestamp;
      }
    });
    if (best !== -1 && best !== state.workspace.activeResultIndex) {
      setActiveResult(best);
    }
  }

  function filterResults() {
    const allResults = state.workspace.searchResults || [];
    if (activeFilter === "all") return allResults;
    return allResults.filter(r => (r.type || "speech").toLowerCase() === activeFilter);
  }

  function renderResultsList() {
    if (!resultsBox) return;
    const filtered = filterResults();
    const query = input ? input.value.trim() : "";

    if (!state.workspace.searchResults.length) {
      updateBadge(0);
      timeline.clearSearchHits();
      return;
    }

    updateBadge(filtered.length);
    timeline.setSearchHits(filtered);

    if (!filtered.length) {
      resultsBox.innerHTML = `
        <div class="pane-empty-placeholder">
          <h4>No ${escapeHtml(activeFilter)} moments match</h4>
          <p>Try switching to "All Moments" or searching with a different phrase.</p>
        </div>`;
      return;
    }

    const isLibraryScope = state.workspace.searchScope === "library";
    resultsBox.innerHTML = filtered.map((result, index) => {
      const resultVideoId = result.video_id || state.workspace.scopedVideoId || "";
      const videoItem = state.library.items.find(v => v.video_id === resultVideoId);
      const title = (videoItem && videoItem.filename) || resultVideoId || "video";
      const timestamp = Number(result.timestamp) || 0;
      const label = `Play ${title} from ${formatSpokenTime(timestamp)}`;
      const type = result.type || "speech";

      return `
        <button class="result-card ${type}" type="button" data-index="${index}" data-video-id="${escapeHtml(resultVideoId)}" data-timestamp="${timestamp}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
          <div class="result-card-top">
            <span class="result-timestamp-pill">
              <svg class="icon" aria-hidden="true"><use href="#icon-play"></use></svg>
              <span>${formatTime(timestamp)}</span>
            </span>
            <span class="result-type-tag ${type}">${escapeHtml(type)}</span>
            ${isLibraryScope ? `<span class="result-video-name" title="${escapeHtml(title)}">${escapeHtml(title)}</span>` : ""}
          </div>
          <p class="result-card-body">${highlightMatch(result.text, query)}</p>
        </button>`;
    }).join("");
  }

  async function executeSearch(queryText) {
    const query = typeof queryText === "string" ? queryText.trim() : (input ? input.value.trim() : "");
    if (!query) {
      if (resultsBox) {
        resultsBox.innerHTML = `
          <div class="pane-empty-placeholder">
            <span class="placeholder-icon"><svg class="icon" aria-hidden="true"><use href="#icon-search"></use></svg></span>
            <h4>Search moments</h4>
            <p>Enter a topic, speaker phrase, or visual action to jump to matching moments.</p>
          </div>`;
      }
      if (input) input.focus();
      updateBadge(0);
      timeline.clearSearchHits();
      return;
    }

    const requestId = ++state.workspace.searchRequestId;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.classList.add("btn-loading");
    }
    if (resultsBox) {
      resultsBox.setAttribute("aria-busy", "true");
      resultsBox.innerHTML = `
        <div class="pane-loading-state" role="status">
          <span class="player-spinner" aria-hidden="true"></span>
          <span>Searching moments…</span>
        </div>`;
    }

    try {
      const scopeVideoId = state.workspace.searchScope === "video" ? state.workspace.selectedVideoId : null;
      const data = await api.searchVideos(query, 12, scopeVideoId);
      if (requestId !== state.workspace.searchRequestId) return;

      const results = Array.isArray(data.results) ? data.results : [];
      state.workspace.searchResults = results;
      state.workspace.activeResultIndex = -1;

      if (!results.length) {
        const canSearchAll = state.workspace.searchScope === "video";
        resultsBox.innerHTML = `
          <div class="pane-empty-placeholder">
            <h4>No moments found</h4>
            <p>Nothing matched “${escapeHtml(query)}” in this recording.</p>
            ${canSearchAll ? '<button class="btn btn-secondary btn-sm" type="button" data-search-all-scope>Search entire library</button>' : ""}
          </div>`;
        updateBadge(0);
        timeline.clearSearchHits();
        return;
      }

      renderResultsList();
    } catch (error) {
      if (requestId !== state.workspace.searchRequestId) return;
      resultsBox.innerHTML = `
        <div class="pane-empty-placeholder error">
          <h4>Search couldn’t finish</h4>
          <p>${escapeHtml(error.message)}</p>
          <button class="btn btn-secondary btn-sm" type="button" data-retry-search>Retry search</button>
        </div>`;
    } finally {
      if (requestId === state.workspace.searchRequestId) {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.classList.remove("btn-loading");
        }
        if (resultsBox) resultsBox.setAttribute("aria-busy", "false");
      }
    }
  }

  async function playResultMoment(result, index) {
    const timestamp = Number(result.timestamp);
    if (!Number.isFinite(timestamp)) {
      showToast("error", "No timestamp for this moment.");
      return;
    }
    setActiveResult(index);

    const videoId = result.video_id || state.workspace.selectedVideoId;
    if (videoId && videoId !== state.player.videoId && onSelectVideo) {
      const videoItem = await library.findVideo(videoId);
      if (videoItem) await onSelectVideo(videoItem);
    }

    try {
      await player.seekTo(timestamp);
      player.reveal();
    } catch (_e) {
      showToast("error", "Could not play moment.");
    }
  }

  // Events
  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      executeSearch();
    });
  }

  if (input) {
    input.addEventListener("input", () => {
      if (btnClear) btnClear.hidden = !input.value;
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      input.value = "";
      btnClear.hidden = true;
      input.focus();
      executeSearch("");
    });
  }

  if (filterPills) {
    filterPills.addEventListener("click", e => {
      const pill = e.target.closest(".filter-pill");
      if (!pill) return;
      filterPills.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      activeFilter = pill.dataset.filter || "all";
      renderResultsList();
    });
  }

  if (resultsBox) {
    resultsBox.addEventListener("click", e => {
      const retryBtn = e.target.closest("[data-retry-search]");
      if (retryBtn) {
        executeSearch();
        return;
      }
      const searchAllBtn = e.target.closest("[data-search-all-scope]");
      if (searchAllBtn) {
        state.workspace.searchScope = "library";
        const scopeLibraryBtn = document.getElementById("scopeLibraryBtn");
        const scopeVideoBtn = document.getElementById("scopeVideoBtn");
        if (scopeLibraryBtn) scopeLibraryBtn.classList.add("active");
        if (scopeVideoBtn) scopeVideoBtn.classList.remove("active");
        executeSearch();
        return;
      }
      const card = e.target.closest(".result-card");
      if (!card) return;
      const filtered = filterResults();
      const result = filtered[Number(card.dataset.index)];
      if (result) playResultMoment(result, Number(card.dataset.index));
    });

    resultsBox.addEventListener("keydown", e => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...resultsBox.querySelectorAll(".result-card")];
      if (!items.length) return;
      e.preventDefault();
      const current = items.indexOf(document.activeElement);
      const next = current < 0
        ? (e.key === "ArrowDown" ? 0 : items.length - 1)
        : (current + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next].focus();
      setActiveResult(next);
    });
  }

  player.onPlayheadChange(syncActiveResultWithPlayhead);

  function reset() {
    state.workspace.searchResults = [];
    state.workspace.activeResultIndex = -1;
    state.workspace.searchRequestId += 1;
    if (input) input.value = "";
    if (btnClear) btnClear.hidden = true;
    updateBadge(0);
    timeline.clearSearchHits();
    if (resultsBox) {
      resultsBox.innerHTML = `
        <div class="pane-empty-placeholder">
          <span class="placeholder-icon"><svg class="icon" aria-hidden="true"><use href="#icon-search"></use></svg></span>
          <h4>Search indexed moments</h4>
          <p>Type a topic, question, speaker line, or visual action to jump straight to the exact second in this recording.</p>
        </div>`;
    }
  }

  function focusInput() {
    if (input) {
      input.focus();
      input.select();
    }
  }

  return {
    executeSearch,
    reset,
    focusInput,
    renderResultsList,
  };
}
