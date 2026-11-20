import { configureApi } from "./services/api.js?v=3";
import { state } from "./state/app-state.js?v=3";
import { initNavigation, showScreen, updateAccount } from "./components/navigation.js?v=3";
import { createAuthFeature } from "./features/auth/auth.js?v=3";
import { createLibraryFeature } from "./features/videos/library.js?v=3";
import { createPlayer } from "./features/videos/player.js?v=3";
import { createWorkspaceFeature } from "./features/videos/workspace.js?v=3";
import { createWorkspaceLayout } from "./features/videos/workspace-layout.js?v=3";
import { createIngestFeature } from "./features/videos/ingest.js?v=3";
import { createSearchFeature } from "./features/search/search.js?v=3";
import { createChatFeature } from "./features/chat/chat.js?v=3";
import { createShareDialog } from "./features/videos/share.js?v=3";

const token = window.location.pathname.match(/^\/share\/([^/]+)\/?$/)?.[1]
  ?? new URLSearchParams(window.location.search).get("share");
state.share.active = token !== null;
state.share.token = token;

let authFeature;
let workspace;
configureApi({
  apiBase: () => state.share.active ? window.location.origin : state.auth.apiBase,
  accessToken: () => state.share.active ? null : state.auth.token,
  unauthorized: () => authFeature && authFeature.signOut(false),
});

// Strict readiness gate: the player may only request a token/stream for the currently
// selected video once the workspace state machine has confirmed its media is servable.
const player = createPlayer({
  canLoad: videoId =>
    Boolean(videoId) &&
    state.workspace.selectedVideoId === videoId &&
    !state.share.error && !state.workspace.mediaDeferred,
  onUnavailable: () => workspace.sharedUnavailable(),
  onMediaNotReady: videoId => workspace && workspace.handleMediaNotReady(videoId),
});

let library;
let chat;
const findVideo = videoId => library.findVideo(videoId);
workspace = createWorkspaceFeature({
  player,
  refreshVideos: () => library && library.refreshVideos(),
  findVideo,
  resetChat: () => chat && chat.reset(),
});
chat = createChatFeature({ workspace });
const search = createSearchFeature({ player, workspace, findVideo });
const layout = createWorkspaceLayout({ workspace, resetChat: () => chat.reset() });

if (state.share.active) {
  document.getElementById("appShell").classList.add("shared-mode");
  document.getElementById("splash").remove();
  document.querySelector("#searchResults strong").textContent = "Search this video";
  showScreen("workspace", { focus: true });
  workspace.openSharedVideo(token);
  window.addEventListener("pageshow", event => {
    if (event.persisted) window.location.reload();
  });
} else {
  startOwnerApp();
}

function startOwnerApp() {
  const share = createShareDialog();
  document.getElementById("workspaceShareBtn").addEventListener("click", () => share.open(state.workspace.selectedVideoId));
  library = createLibraryFeature({
    openShare: share.open,
    openWorkspace: focusTarget => workspace.openWorkspace(focusTarget),
    openVideo: video => workspace.openVideoInWorkspace(video),
  });
  const ingest = createIngestFeature({ workspace, refreshVideos: () => library.refreshVideos() });
  authFeature = createAuthFeature({
    onAuthenticated: () => library.enterHome(),
    onSignedOut: () => {
      share.close();
      chat.reset();
      workspace.reset();
      search.reset();
      ingest.reset();
      player.reset();
      state.library.items = [];
      state.library.loaded = false;
      state.library.loading = false;
      state.library.error = null;
      state.library.requestId += 1;
      layout.reset();
    },
  });

  function navigate(screenId, focusTarget) {
    if (screenId === "home") {
      showScreen("home", { focus: true });
      library.refreshVideos();
      return;
    }
    if (screenId === "workspace") {
      workspace.openWorkspace(focusTarget);
    }
  }

  initNavigation({
    onNavigate: screenId => navigate(screenId),
    onSearch: () => navigate("workspace", "search"),
  });

  /* Short startup transition; session persistence remains the original localStorage contract. */
  const splash = document.getElementById("splash");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    if (splash) splash.classList.add("leaving");
    window.setTimeout(() => {
      if (splash) splash.remove();
      updateAccount();
      if (state.auth.token) library.enterHome();
      else showScreen("signin", { focus: true });
    }, prefersReducedMotion ? 0 : 170);
  }, prefersReducedMotion ? 0 : 150);
}
