import { state } from "../../state/app-state.js";
import { escapeHtml, videoStatus, videoStatusLabel } from "../../utils/format.js";

const VIDEO_ICON = '<svg class="icon" aria-hidden="true"><use href="#icon-video"></use></svg>';

function submitForm(form) {
  if (form.requestSubmit) form.requestSubmit();
  else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

/*
 * Presentation-only behavior for the workspace: add-video drawer, Search/Ask tabs,
 * search-scope switch, suggested questions, and quick-open list.
 * It reads existing state and calls existing workspace APIs; it adds no endpoints.
 */
export function createWorkspaceLayout({ workspace, resetChat }) {
  const $ = id => document.getElementById(id);

  const ingestPanel = $("ingestPanel");
  const ingestToggle = $("toggleIngest");
  const signalPath = $("signalPath");
  const tabs = [$("railTabSearch"), $("railTabAsk")];
  const panes = { search: $("railPaneSearch"), ask: $("railPaneAsk") };
  const scopeSwitch = $("scopeSwitch");
  const scopeOptions = [...scopeSwitch.querySelectorAll("[data-scope]")];
  const scopeHint = $("scopeHint");
  const searchForm = $("searchForm");
  const searchInput = $("searchInput");
  const chatForm = $("chatForm");
  const chatInput = $("chatInput");
  const suggestions = $("chatSuggestions");
  const recentBlock = $("recentBlock");
  const recentList = $("recentVideos");
  let chatVideoId = null;

  /* ---------- Add-video drawer ---------- */
  function setIngestOpen(open, { focus = false } = {}) {
    ingestPanel.hidden = !open;
    ingestToggle.setAttribute("aria-expanded", String(open));
    ingestToggle.classList.toggle("is-open", open);
    if (open && focus) requestAnimationFrame(() => $("dropZone").focus());
  }

  ingestToggle.addEventListener("click", () => setIngestOpen(ingestPanel.hidden, { focus: ingestPanel.hidden }));
  $("closeIngest").addEventListener("click", () => {
    setIngestOpen(false);
    ingestToggle.focus();
  });

  /* Entry points elsewhere in the app that should reveal the drawer / search tab.
     Delegated listeners run synchronously, before workspace.js's rAF focus calls. */
  document.addEventListener("click", event => {
    if (event.target.closest("#goUpload, [data-go-upload]")) setIngestOpen(true);
    if (event.target.closest("[data-open-ingest]")) setIngestOpen(true, { focus: true });
    if (event.target.closest("#goSearch, #topbarSearch")) setTab("search");
  });

  // Collapse the drawer when processing begins so the progress strip takes over.
  new MutationObserver(() => { if (!signalPath.hidden) setIngestOpen(false); })
    .observe(signalPath, { attributes: true, attributeFilter: ["hidden"] });

  /* ---------- Search / Ask tabs ---------- */
  function setTab(name) {
    Object.entries(panes).forEach(([key, pane]) => { pane.hidden = key !== name; });
    tabs.forEach(tab => {
      const active = tab.dataset.railTab === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setTab(tab.dataset.railTab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0
        : event.key === "End" ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      setTab(tabs[next].dataset.railTab);
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (state.ui.screen !== "workspace") return;
    if (event.target.closest && event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    setTab("search");
    searchInput.focus();
  });

  /* ---------- Search scope switch ---------- */
  function syncScope() {
    const scopedId = state.workspace.scopedVideoId;
    const selectedId = state.workspace.selectedVideoId;
    scopeOptions.forEach(option => {
      const isVideo = option.dataset.scope === "video";
      const active = isVideo ? !!scopedId : !scopedId;
      option.classList.toggle("active", active);
      option.setAttribute("aria-pressed", String(active));
      if (isVideo) option.disabled = !selectedId;
    });
    scopeHint.textContent = scopedId
      ? `Searching only “${state.workspace.scopedVideoTitle || scopedId}”.`
      : "Searching every indexed video.";
    // Keep the conversation in step with the video it belongs to.
    if (scopedId && scopedId !== chatVideoId) {
      chatVideoId = scopedId;
      resetChat();
    }
  }

  scopeSwitch.addEventListener("click", event => {
    const option = event.target.closest("[data-scope]");
    if (!option || option.disabled) return;
    if (option.dataset.scope === "all") {
      workspace.setScope(null, null);
    } else {
      const id = state.workspace.selectedVideoId;
      if (!id) return;
      const item = state.library.items.find(video => video.video_id === id);
      workspace.setScope(id, item ? item.filename : $("centerTitle").textContent);
    }
    syncScope();
    if (searchInput.value.trim()) submitForm(searchForm);
  });

  const scopeObserver = new MutationObserver(syncScope);
  scopeObserver.observe($("scopeChip"), { attributes: true, attributeFilter: ["class"] });
  scopeObserver.observe($("scopeChipLabel"), { childList: true, characterData: true, subtree: true });
  scopeObserver.observe($("centerTitle"), { childList: true, characterData: true, subtree: true });

  /* ---------- Suggested questions ---------- */
  function syncChat() {
    suggestions.hidden = chatInput.disabled || !$("chatEmpty");
  }

  suggestions.addEventListener("click", event => {
    const chip = event.target.closest("[data-prompt]");
    if (!chip || chatInput.disabled) return;
    chatInput.value = chip.dataset.prompt;
    submitForm(chatForm);
  });

  const chatObserver = new MutationObserver(syncChat);
  chatObserver.observe(chatInput, { attributes: true, attributeFilter: ["disabled"] });
  chatObserver.observe($("chatMessages"), { childList: true });

  /* ---------- Quick-open list in the empty state ---------- */
  function renderRecents() {
    const items = state.library.items.slice(0, 4);
    recentBlock.hidden = items.length === 0;
    recentList.innerHTML = items.map(video => {
      const status = videoStatus(video.status);
      const title = video.filename || video.video_id || "Untitled video";
      return `<button class="recent-item" type="button" data-recent-video="${escapeHtml(video.video_id)}">
        <span class="recent-thumb" aria-hidden="true">${VIDEO_ICON}</span>
        <span class="recent-title">${escapeHtml(title)}</span>
        <span class="status-pill ${status}">${videoStatusLabel(status)}</span>
      </button>`;
    }).join("");
  }

  recentList.addEventListener("click", event => {
    const row = event.target.closest("[data-recent-video]");
    if (!row) return;
    const video = state.library.items.find(item => item.video_id === row.dataset.recentVideo);
    if (video) workspace.openVideoInWorkspace(video);
  });

  // library.js rewrites this label on every refresh, which is our cue to re-render.
  new MutationObserver(renderRecents).observe($("libraryCount"), { childList: true, characterData: true, subtree: true });

  function reset() {
    setIngestOpen(false);
    setTab("search");
    chatVideoId = null;
    signalPath.style.setProperty("--progress", "0");
    syncScope();
    syncChat();
    renderRecents();
  }

  syncScope();
  syncChat();
  renderRecents();

  return { reset, setTab, setIngestOpen };
}