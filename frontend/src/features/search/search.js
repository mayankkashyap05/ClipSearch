import { api } from "../../services/api.js";
import { state } from "../../state/app-state.js";
import { showToast } from "../../components/feedback.js";
import { escapeHtml, formatSpokenTime, formatTime } from "../../utils/format.js";

export function createSearchFeature({ player, workspace, library }) {
  const form = document.getElementById("searchForm");
  const input = document.getElementById("searchInput");
  const button = document.getElementById("searchBtn");
  const resultsBox = document.getElementById("searchResults");

  function setActiveResult(index) {
    state.workspace.activeResultIndex = index;
    resultsBox.querySelectorAll(".result-item").forEach(item => {
      const active = Number(item.dataset.index) === index;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });
  }

  function syncActiveResultWithPlayhead() {
    const videoId = state.player.videoId;
    if (!videoId || !state.workspace.searchResults.length || player.getElement().seeking) return;
    const now = player.getElement().currentTime;
    let best = -1;
    let bestTime = -Infinity;
    state.workspace.searchResults.forEach((result, index) => {
      const resultVideo = result.video_id || state.workspace.scopedVideoId;
      if (resultVideo !== videoId) return;
      const timestamp = Number(result.timestamp);
      if (Number.isFinite(timestamp) && timestamp <= now + 0.25 && timestamp > bestTime) {
        best = index;
        bestTime = timestamp;
      }
    });
    if (best !== -1 && best !== state.workspace.activeResultIndex) setActiveResult(best);
  }

  async function runSearch(event) {
    if (event) event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      resultsBox.innerHTML = '<div class="results-empty"><strong>Enter a search to get started</strong><p>Try a topic, phrase, person, or visual detail from one of your recordings.</p></div>';
      input.focus();
      return;
    }

    const requestId = ++state.workspace.searchRequestId;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    resultsBox.setAttribute("aria-busy", "true");
    resultsBox.innerHTML = '<div class="results-empty" role="status"><strong>Searching your library…</strong><p>Looking for relevant moments.</p></div>';

    try {
      const data = await api.searchVideos(query, 8, state.workspace.scopedVideoId);
      if (requestId !== state.workspace.searchRequestId) return;
      const results = Array.isArray(data.results) ? data.results : [];
      state.workspace.searchResults = results;
      state.workspace.activeResultIndex = -1;
      if (!results.length) {
        const clearScopeAction = state.workspace.scopedVideoId
          ? '<button class="btn btn-quiet" type="button" data-clear-search-scope>Search all videos</button>'
          : "";
        resultsBox.innerHTML = `<div class="results-empty"><strong>No matches found</strong><p>Nothing matched “${escapeHtml(query)}”. Try another phrase${state.workspace.scopedVideoId ? " or search your full library" : ""}.</p>${clearScopeAction}</div>`;
        return;
      }

      const unknownVideo = results.find(result => result.video_id && !videoTitleFor(result.video_id));
      if (unknownVideo) await library.findVideo(unknownVideo.video_id);
      if (requestId !== state.workspace.searchRequestId) return;

      const showVideoName = !state.workspace.scopedVideoId;
      resultsBox.innerHTML = results.map((result, index) => {
        const resultVideoId = result.video_id || state.workspace.scopedVideoId || "";
        const title = videoTitleFor(resultVideoId) || (showVideoName ? "Unknown video" : state.workspace.scopedVideoTitle) || "video";
        const label = "Play " + title + " from " + formatSpokenTime(result.timestamp);
        return `
          <button class="result-item" type="button" data-index="${index}" data-video-id="${escapeHtml(resultVideoId)}" data-timestamp="${escapeHtml(result.timestamp)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
            <div class="result-meta">
              <span class="result-time"><svg class="icon play-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>${formatTime(result.timestamp)}</span>
              <span class="result-type">${escapeHtml(result.type || "moment")}</span>
              ${showVideoName ? `<span class="result-video">${escapeHtml(title)}</span>` : ""}
            </div>
            <p class="result-text">${escapeHtml(result.text)}</p>
          </button>`;
      }).join("");
    } catch (error) {
      if (requestId !== state.workspace.searchRequestId) return;
      resultsBox.innerHTML = `<div class="results-empty" role="alert"><strong>Search couldn’t finish</strong><p>${escapeHtml(error.message)}. Please try again.</p><button class="btn btn-secondary" type="button" data-retry-search>Try again</button></div>`;
    } finally {
      if (requestId === state.workspace.searchRequestId) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        resultsBox.setAttribute("aria-busy", "false");
      }
    }
  }

  function videoTitleFor(videoId) {
    const item = state.library.items.find(video => video.video_id === videoId);
    return item ? item.filename : null;
  }

  async function playSearchResult(result, index) {
    const requestId = ++state.player.seekRequestId;
    const timestamp = Number(result.timestamp);
    if (!Number.isFinite(timestamp)) {
      showToast("error", "This result has no usable timestamp.");
      return;
    }
    const videoId = result.video_id || state.workspace.scopedVideoId || state.workspace.selectedVideoId;
    if (!videoId) {
      showToast("error", "The source video could not be opened.");
      return;
    }
    setActiveResult(index);

    try {
      if (state.workspace.selectedVideoId !== videoId || state.player.videoId !== videoId) {
        const videoItem = await library.findVideo(videoId);
        if (requestId !== state.player.seekRequestId) return;
        if (!videoItem) throw new Error("The source video could not be opened.");
        workspace.openSearchResultVideo(videoItem);
      }
      await player.loadVideo(videoId);
      if (requestId !== state.player.seekRequestId) return;
      const played = await player.seekTo(timestamp);
      if (requestId !== state.player.seekRequestId) return;
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
    } catch (error) {
      if (error.message === "superseded" || requestId !== state.player.seekRequestId) return;
      player.setPlayerState("error", player.friendlyPlaybackError(error));
    }
  }

  form.addEventListener("submit", runSearch);
  resultsBox.addEventListener("click", event => {
    const retry = event.target.closest("[data-retry-search]");
    if (retry) {
      runSearch();
      return;
    }
    const clearScope = event.target.closest("[data-clear-search-scope]");
    if (clearScope) {
      workspace.setScope(null, null);
      runSearch();
      return;
    }
    const resultButton = event.target.closest("button.result-item");
    if (!resultButton) return;
    const result = state.workspace.searchResults[Number(resultButton.dataset.index)];
    if (result) playSearchResult(result, Number(resultButton.dataset.index));
  });
  resultsBox.addEventListener("keydown", event => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...resultsBox.querySelectorAll(".result-item")];
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement);
    const next = current < 0
      ? (event.key === "ArrowDown" ? 0 : items.length - 1)
      : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next].focus();
    setActiveResult(next);
  });

  player.setOnPlayheadChange(syncActiveResultWithPlayhead);

  function reset() {
    state.workspace.searchResults = [];
    state.workspace.activeResultIndex = -1;
    state.workspace.searchRequestId += 1;
    resultsBox.innerHTML = '<div class="results-empty"><strong>Search across your library</strong><p>Results include timestamps, so you can jump straight to the moment that matters.</p></div>';
    resultsBox.setAttribute("aria-busy", "false");
    button.disabled = false;
    button.removeAttribute("aria-busy");
    input.value = "";
  }

  return { runSearch, playSearchResult, syncActiveResultWithPlayhead, reset };
}
