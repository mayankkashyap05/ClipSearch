import { configureApi } from "./services/api.js";
import { state } from "./state/app-state.js";
import { initNavigation, showScreen, updateAccount } from "./components/navigation.js";
import { createAuthFeature } from "./features/auth/auth.js";
import { createLibraryFeature } from "./features/videos/library.js";
import { createPlayer } from "./features/videos/player.js";
import { createWorkspaceFeature } from "./features/videos/workspace.js";
import { createIngestFeature } from "./features/videos/ingest.js";
import { createSearchFeature } from "./features/search/search.js";
import { createChatFeature } from "./features/chat/chat.js";
import { createLiveFeature } from "./features/live/live.js";

let authFeature;
configureApi({
  apiBase: () => state.auth.apiBase,
  accessToken: () => state.auth.token,
  unauthorized: () => authFeature && authFeature.signOut(false),
});

const player = createPlayer();
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
const live = createLiveFeature();

authFeature = createAuthFeature({
  onAuthenticated: () => library.enterHome(),
  onSignedOut: () => {
    chat.reset();
    workspace.reset();
    search.reset();
    ingest.reset();
    player.reset();
    live.reset();
    state.library.items = [];
    state.library.loaded = false;
    state.library.loading = false;
    state.library.error = null;
    state.library.requestId += 1;
  },
});

function navigate(screenId, focusTarget) {
  if (state.ui.screen === "live" && screenId !== "live") live.deactivate();
  if (screenId === "home") {
    showScreen("home", { focus: true });
    library.refreshVideos();
    return;
  }
  if (screenId === "workspace") {
    workspace.openWorkspace(focusTarget);
    return;
  }
  if (screenId === "live") {
    showScreen("live", { focus: true });
    live.activate();
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
