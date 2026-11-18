export const DEFAULT_API_BASE = window.location.origin;

export const state = {
  auth: {
    apiBase: localStorage.getItem("clipsearch_api_base") || DEFAULT_API_BASE,
    token: localStorage.getItem("clipsearch_token") || null,
    email: localStorage.getItem("clipsearch_email") || null,
    mode: "login",
  },
  library: {
    items: [],
    loaded: false,
    loading: false,
    error: null,
    requestId: 0,
  },
  workspace: {
    scopedVideoId: null,
    scopedVideoTitle: null,
    selectedVideoId: null,
    // True while the selected video's media is not ready (job still running, or the
    // download failed). The player must not request a stream while this is set.
    mediaDeferred: false,
    jobPollTimer: null,
    activeJobId: null,
    searchResults: [],
    activeResultIndex: -1,
    searchRequestId: 0,
  },
  player: {
    videoId: null,
    title: null,
    streamUrl: null,
    tokenIssuedAt: 0,
    loadPromise: null,
    seekRequestId: 0,
    retried: false,
    autoRetries: 0,
    jumpedAt: 0,
  },
  chat: { pending: false, requestId: 0 },
  ui: { screen: "signin" },
};