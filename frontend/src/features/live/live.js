import { api } from "../../services/api.js";
import { state } from "../../state/app-state.js";
import { showToast } from "../../components/feedback.js";
import { escapeHtml, formatTime } from "../../utils/format.js";

const SKELETON_ROWS = '<div class="live-skeleton skeleton" aria-hidden="true"></div><div class="live-skeleton skeleton" aria-hidden="true"></div>';

export function createLiveFeature() {
  const list = document.getElementById("liveSessions");
  const listCount = document.getElementById("liveSessionListCount");
  const countBadge = document.getElementById("liveCount");
  const startForm = document.getElementById("liveStartForm");
  const startButton = document.getElementById("startLiveButton");
  const errorBox = document.getElementById("liveError");
  const sourceInput = document.getElementById("liveSourceUrl");
  const languageInput = document.getElementById("liveLanguage");
  const selectedTitle = document.getElementById("liveSessionTitle");
  const selectedCaption = document.getElementById("liveSessionCaption");
  const emptyPanel = document.getElementById("liveSessionEmpty");
  const contentPanel = document.getElementById("liveSessionContent");
  const statusBadge = document.getElementById("liveSessionStatus");
  const stopButton = document.getElementById("stopLiveButton");
  const transcriptList = document.getElementById("liveTranscript");
  const transcriptCount = document.getElementById("transcriptCount");
  const searchForm = document.getElementById("liveSearchForm");
  const searchInput = document.getElementById("liveSearchInput");
  const searchButton = document.getElementById("liveSearchButton");
  const searchResults = document.getElementById("liveSearchResults");
  const refreshButton = document.getElementById("refreshLive");

  function showError(message) {
    errorBox.textContent = message;
  }

  function clearError() {
    errorBox.textContent = "";
  }

  function renderSessions() {
    const sessions = state.live.sessions;
    const total = sessions.length;
    countBadge.classList.toggle("has-sessions", total > 0);
    countBadge.querySelector("span:last-child").textContent = `${total} ${total === 1 ? "active session" : "active sessions"}`;
    listCount.textContent = state.live.listLoaded ? `${total} ${total === 1 ? "session" : "sessions"}` : "";
    list.setAttribute("aria-busy", String(state.live.listLoading));

    if (state.live.listLoading && !state.live.listLoaded) {
      list.innerHTML = SKELETON_ROWS;
      return;
    }
    if (state.live.listError && !state.live.listLoaded) {
      list.innerHTML = `<div class="live-list-error" role="status">${escapeHtml(state.live.listError)}<br /><button class="btn btn-secondary" type="button" data-refresh-live-list>Try again</button></div>`;
      return;
    }

    const error = state.live.listError
      ? `<div class="live-list-error" role="status">Couldn’t refresh sessions. Your last results are still shown. <button class="btn btn-secondary" type="button" data-refresh-live-list>Retry</button></div>`
      : "";
    if (!total) {
      list.innerHTML = error + '<div class="live-list-empty">No active sessions. Start one above to follow its transcript here.</div>';
      return;
    }

    list.innerHTML = error + sessions.map(sessionId => {
      const selected = sessionId === state.live.selectedId;
      return `
        <div class="live-session-row">
          <button class="live-session-select" type="button" data-live-session="${escapeHtml(sessionId)}" aria-current="${selected ? "true" : "false"}" aria-label="Open live session ${escapeHtml(sessionId)}">
            <span class="session-live-indicator" aria-hidden="true"></span>
            <span class="session-id">${escapeHtml(sessionId)}</span><span class="session-state">Active</span>
          </button>
          <button class="live-session-stop" type="button" data-stop-session="${escapeHtml(sessionId)}" aria-label="Stop live session ${escapeHtml(sessionId)}" title="Stop session" ${state.live.stopPending ? "disabled" : ""}>
            <svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>
          </button>
        </div>`;
    }).join("");
  }

  function renderDetails() {
    const sessionId = state.live.selectedId;
    const selected = !!sessionId;
    selectedTitle.textContent = selected ? sessionId : "Choose a live session";
    selectedCaption.textContent = selected
      ? "Transcript and indexed moments update while the session is active."
      : "Transcript and search results appear when a session is selected.";
    emptyPanel.hidden = selected;
    contentPanel.hidden = !selected;
    statusBadge.hidden = !selected;
    stopButton.hidden = !selected;
    stopButton.disabled = state.live.stopPending;
    stopButton.classList.toggle("btn-loading", state.live.stopPending);
    stopButton.setAttribute("aria-busy", String(state.live.stopPending));
    if (!selected) {
      clearTranscript();
      searchResults.innerHTML = '<p class="live-search-empty">Search results for this session will appear here.</p>';
      searchInput.value = "";
    }
  }

  function clearTranscript() {
    state.live.transcript = [];
    transcriptCount.textContent = "0 segments";
    transcriptList.setAttribute("aria-busy", "false");
    transcriptList.innerHTML = '<p class="transcript-empty" id="transcriptEmpty">Waiting for transcript segments.</p>';
  }

  function createTranscriptSegment(segment) {
    const row = document.createElement("div");
    row.className = "transcript-segment";
    const time = document.createElement("span");
    time.className = "transcript-time";
    time.textContent = formatTime(segment.start);
    const text = document.createElement("span");
    text.className = "transcript-text";
    text.textContent = segment.text == null ? "" : String(segment.text);
    row.append(time, text);
    return row;
  }

  function transcriptPrefixMatches(previous, next) {
    if (next.length < previous.length) return false;
    return previous.every((segment, index) => {
      const candidate = next[index];
      return candidate && candidate.start === segment.start && candidate.text === segment.text;
    });
  }

  function renderTranscript(segments) {
    const nearBottom = transcriptList.scrollHeight - transcriptList.scrollTop - transcriptList.clientHeight < 72;
    const previous = state.live.transcript;
    const canAppend = transcriptPrefixMatches(previous, segments);
    if (!canAppend) transcriptList.replaceChildren();
    if (!segments.length) {
      transcriptList.innerHTML = '<p class="transcript-empty" id="transcriptEmpty">Waiting for transcript segments. New moments will appear here automatically.</p>';
    } else {
      if (canAppend && previous.length === 0) transcriptList.replaceChildren();
      const startAt = canAppend ? previous.length : 0;
      for (let index = startAt; index < segments.length; index += 1) {
        transcriptList.appendChild(createTranscriptSegment(segments[index]));
      }
    }
    state.live.transcript = segments;
    transcriptCount.textContent = `${segments.length} ${segments.length === 1 ? "segment" : "segments"}`;
    transcriptList.setAttribute("aria-busy", "false");
    if (nearBottom) transcriptList.scrollTop = transcriptList.scrollHeight;
  }

  async function refreshSessions() {
    const requestId = ++state.live.listRequestId;
    const hadError = !!state.live.listError;
    let shouldRender = !state.live.listLoaded || hadError;
    state.live.listLoading = true;
    state.live.listError = null;
    if (!state.live.listLoaded) renderSessions();
    try {
      const data = await api.listLiveSessions();
      if (requestId !== state.live.listRequestId) return;
      const nextSessions = Array.isArray(data.sessions)
        ? data.sessions.filter(sessionId => typeof sessionId === "string")
        : [];
      const changed = nextSessions.length !== state.live.sessions.length
        || nextSessions.some((sessionId, index) => sessionId !== state.live.sessions[index]);
      state.live.sessions = nextSessions;
      state.live.listLoaded = true;
      state.live.listError = null;
      shouldRender = shouldRender || changed;
      if (state.live.selectedId && !state.live.sessions.includes(state.live.selectedId)) {
        state.live.selectedId = null;
        state.live.transcriptRequestId += 1;
        state.live.transcriptError = null;
        renderDetails();
        shouldRender = true;
      }
    } catch (error) {
      if (requestId !== state.live.listRequestId) return;
      state.live.listError = error.message || "Couldn’t load live sessions.";
      shouldRender = true;
    } finally {
      if (requestId === state.live.listRequestId) {
        state.live.listLoading = false;
        if (shouldRender) renderSessions();
        else list.setAttribute("aria-busy", "false");
      }
    }
  }

  async function refreshTranscript() {
    const sessionId = state.live.selectedId;
    if (!sessionId) return;
    const requestId = ++state.live.transcriptRequestId;
    transcriptList.setAttribute("aria-busy", "true");
    try {
      const data = await api.getLiveTranscript(sessionId);
      if (requestId !== state.live.transcriptRequestId || state.live.selectedId !== sessionId) return;
      const transcript = Array.isArray(data.transcript) ? data.transcript : [];
      state.live.transcriptError = null;
      renderTranscript(transcript);
      const existingError = transcriptList.querySelector(".transcript-error");
      if (existingError) existingError.remove();
    } catch (error) {
      if (requestId !== state.live.transcriptRequestId) return;
      state.live.transcriptError = error.message;
      let message = transcriptList.querySelector(".transcript-error");
      if (!message) {
        message = document.createElement("p");
        message.className = "transcript-error";
        message.setAttribute("role", "alert");
        transcriptList.prepend(message);
      }
      message.replaceChildren(document.createTextNode("Couldn’t refresh the transcript. "));
      if (state.live.transcriptError) message.appendChild(document.createTextNode(state.live.transcriptError + " "));
      const retry = document.createElement("button");
      retry.className = "btn btn-quiet";
      retry.type = "button";
      retry.dataset.retryTranscript = "true";
      retry.textContent = "Retry";
      message.appendChild(retry);
      transcriptList.setAttribute("aria-busy", "false");
    }
  }

  function selectSession(sessionId) {
    if (!sessionId) return;
    state.live.selectedId = sessionId;
    state.live.transcriptRequestId += 1;
    state.live.transcriptError = null;
    state.live.searchRequestId += 1;
    clearTranscript();
    searchResults.innerHTML = '<p class="live-search-empty">Search results for this session will appear here.</p>';
    searchResults.setAttribute("aria-busy", "false");
    searchInput.value = "";
    clearError();
    renderSessions();
    renderDetails();
    refreshTranscript();
  }

  async function startSession(event) {
    event.preventDefault();
    clearError();
    const sourceUrl = sourceInput.value.trim();
    const language = languageInput.value.trim();
    if (!sourceUrl) {
      showError("Enter a source URL to start a live session.");
      sourceInput.focus();
      return;
    }

    startButton.disabled = true;
    startButton.classList.add("btn-loading");
    startButton.setAttribute("aria-busy", "true");
    startForm.setAttribute("aria-busy", "true");
    try {
      const data = await api.startLiveSession({ sourceUrl, language });
      sourceInput.value = "";
      languageInput.value = "";
      await refreshSessions();
      if (data.session_id) selectSession(data.session_id);
      showToast("success", "Live session started.");
    } catch (error) {
      showError(error.message || "Couldn’t start the live session. Check the source URL and try again.");
    } finally {
      startButton.disabled = false;
      startButton.classList.remove("btn-loading");
      startButton.removeAttribute("aria-busy");
      startForm.removeAttribute("aria-busy");
    }
  }

  async function stopSession(sessionId) {
    if (!sessionId || state.live.stopPending) return;
    clearError();
    state.live.stopPending = true;
    renderSessions();
    renderDetails();
    try {
      await api.stopLiveSession(sessionId);
      state.live.sessions = state.live.sessions.filter(id => id !== sessionId);
      if (state.live.selectedId === sessionId) {
        state.live.selectedId = null;
        state.live.transcriptRequestId += 1;
        state.live.transcriptError = null;
      }
      showToast("success", "Live session stopped.");
      await refreshSessions();
    } catch (error) {
      showError(error.message || "Couldn’t stop the live session. Please try again.");
    } finally {
      state.live.stopPending = false;
      renderSessions();
      renderDetails();
    }
  }

  async function searchSession(event) {
    if (event) event.preventDefault();
    const query = searchInput.value.trim();
    const sessionId = state.live.selectedId;
    if (!sessionId) {
      searchResults.innerHTML = '<p class="live-search-empty">Choose an active session before searching.</p>';
      return;
    }
    if (!query) {
      searchResults.innerHTML = '<p class="live-search-empty">Enter a topic or phrase to search this session.</p>';
      searchInput.focus();
      return;
    }

    const requestId = ++state.live.searchRequestId;
    searchButton.disabled = true;
    searchButton.classList.add("btn-loading");
    searchButton.setAttribute("aria-busy", "true");
    searchResults.setAttribute("aria-busy", "true");
    searchResults.innerHTML = '<p class="live-search-empty" role="status">Searching this session…</p>';
    try {
      const data = await api.searchLiveSession(sessionId, query, 8);
      if (requestId !== state.live.searchRequestId || sessionId !== state.live.selectedId) return;
      const results = Array.isArray(data.results) ? data.results : [];
      if (!results.length) {
        searchResults.innerHTML = `<p class="live-search-empty">No matches for “${escapeHtml(query)}” in this session yet.</p>`;
        return;
      }
      searchResults.innerHTML = results.map(result => `
        <article class="live-result">
          <div class="live-result-meta"><span class="live-result-time">${formatTime(result.timestamp)}</span><span class="live-result-type">${escapeHtml(result.type || "speech")}</span></div>
          <p>${escapeHtml(result.text)}</p>
        </article>`).join("");
    } catch (error) {
      if (requestId !== state.live.searchRequestId) return;
      searchResults.innerHTML = `<div class="results-empty" role="alert"><strong>Search couldn’t finish</strong><p>${escapeHtml(error.message)}. Please try again.</p><button class="btn btn-secondary" type="button" data-retry-live-search>Try again</button></div>`;
    } finally {
      if (requestId === state.live.searchRequestId) {
        searchButton.disabled = false;
        searchButton.classList.remove("btn-loading");
        searchButton.removeAttribute("aria-busy");
        searchResults.setAttribute("aria-busy", "false");
      }
    }
  }

  async function refreshCurrentView() {
    await refreshSessions();
    await refreshTranscript();
  }

  function activate() {
    refreshSessions();
    if (state.live.timer) window.clearInterval(state.live.timer);
    state.live.timer = window.setInterval(async () => {
      if (state.ui.screen !== "live" || !state.auth.token || state.live.polling) return;
      state.live.polling = true;
      try {
        await refreshCurrentView();
      } finally {
        state.live.polling = false;
      }
    }, 5000);
  }

  function deactivate() {
    if (state.live.timer) window.clearInterval(state.live.timer);
    state.live.timer = null;
  }

  transcriptList.addEventListener("click", event => {
    if (event.target.closest("[data-retry-transcript]")) refreshTranscript();
  });
  list.addEventListener("click", event => {
    const retry = event.target.closest("[data-refresh-live-list]");
    if (retry) {
      refreshSessions();
      return;
    }
    const stop = event.target.closest("[data-stop-session]");
    if (stop) {
      stopSession(stop.dataset.stopSession);
      return;
    }
    const select = event.target.closest("[data-live-session]");
    if (select) selectSession(select.dataset.liveSession);
  });
  startForm.addEventListener("submit", startSession);
  stopButton.addEventListener("click", () => stopSession(state.live.selectedId));
  searchForm.addEventListener("submit", searchSession);
  searchResults.addEventListener("click", event => {
    const retry = event.target.closest("[data-retry-live-search]");
    if (retry) searchSession(null);
  });
  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.classList.add("btn-loading");
    refreshButton.setAttribute("aria-busy", "true");
    await refreshCurrentView();
    refreshButton.disabled = false;
    refreshButton.classList.remove("btn-loading");
    refreshButton.removeAttribute("aria-busy");
  });

  function reset() {
    deactivate();
    state.live.listRequestId += 1;
    state.live.transcriptRequestId += 1;
    state.live.searchRequestId += 1;
    state.live.sessions = [];
    state.live.selectedId = null;
    state.live.transcript = [];
    state.live.listLoading = false;
    state.live.listLoaded = false;
    state.live.listError = null;
    state.live.transcriptError = null;
    state.live.stopPending = false;
    state.live.polling = false;
    clearError();
    renderSessions();
    renderDetails();
    searchResults.innerHTML = '<p class="live-search-empty">Search results for this session will appear here.</p>';
    searchResults.setAttribute("aria-busy", "false");
    sourceInput.value = "";
    languageInput.value = "";
    startButton.disabled = false;
    startButton.classList.remove("btn-loading");
    startButton.removeAttribute("aria-busy");
    searchButton.disabled = false;
    searchButton.classList.remove("btn-loading");
    searchButton.removeAttribute("aria-busy");
    refreshButton.disabled = false;
    refreshButton.classList.remove("btn-loading");
    refreshButton.removeAttribute("aria-busy");
  }

  return { activate, deactivate, refreshSessions, reset };
}
