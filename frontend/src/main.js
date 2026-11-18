import { configureApi } from "./services/api.js";
import { state } from "./state/app-state.js";
import { initNavigation, showScreen, updateAccount } from "./components/navigation.js";
import { createAuthFeature } from "./features/auth/auth.js";
import { createLibraryFeature } from "./features/videos/library.js";
import { createPlayer } from "./features/videos/player.js";
import { createWorkspaceFeature } from "./features/videos/workspace.js";
import { createWorkspaceLayout } from "./features/videos/workspace-layout.js";
import { createIngestFeature } from "./features/videos/ingest.js";
import { createSearchFeature } from "./features/search/search.js";
import { createChatFeature } from "./features/chat/chat.js";

let authFeature;
configureApi({
  apiBase: () => state.auth.apiBase,
  accessToken: () => state.auth.token,
  unauthorized: () => authFeature && authFeature.signOut(false),
});

// The player may never request a stream for a video whose media is still being produced.
const player = createPlayer({
  canLoad: videoId => !(state.workspace.mediaDeferred && state.workspace.selectedVideoId === videoId),
});
const chat = createChatFeature({ player });
let library;
const workspace = createWorkspaceFeature({
  player,
  refreshVideos: () => library && library.refreshVideos(),
  resetChat: () => chat.reset(),
});
library = createLibraryFeature({
  openWorkspace: focusTarget => workspace.openWorkspace(focusTarget),
  openVideo: video => workspace.openVideoInWorkspace(video),
});
const search = createSearchFeature({ player, workspace, library });
const ingest = createIngestFeature({ workspace, refreshVideos: () => library.refreshVideos() });
const layout = createWorkspaceLayout({ workspace, resetChat: () => chat.reset() });

authFeature = createAuthFeature({
  onAuthenticated: () => library.enterHome(),
  onSignedOut: () => {
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