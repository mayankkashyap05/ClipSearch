export const DEFAULT_API_BASE = window.location.origin;

export const state = {
  share: { active: false, token: null, video: null, error: null },
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
    selectedJobId: null,
    centerState: "IDLE", // "IDLE" | "LOADING" | "PLAYABLE" | "PLAYABLE_DONE" | "FAILED"
    // True while the selected video's media is not servable (pending/downloading,
    // verifying live job, or failed during download). The player must not request a stream.
    mediaDeferred: false,
    jobPollTimer: null,
    activeJobId: null,
    activePollEpoch: 0,
    centerEpoch: 0,
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
    state: "idle", // "idle" | "loading" | "ready" | "error"
    seekRequestId: 0,
    retried: false,
    autoRetries: 0,
    jumpedAt: 0,
  },
  chat: { pending: false, requestId: 0 },
  ui: { screen: "signin" },
};