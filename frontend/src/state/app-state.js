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
    currentVideo: null,
    job: null,
    activeTab: "search", // "search" | "transcript" | "chat" | "chapters" | "overview"
    searchScope: "video", // "video" | "library"
    jobPollTimer: null,
    activeJobId: null,
    searchResults: [],
    activeResultIndex: -1,
    searchFilter: "all", // "all" | "speech" | "visual"
    searchQuery: "",
    searchRequestId: 0,
    moments: [], // timestamped transcript and visual moments
    activeMomentIndex: -1,
    momentsLoading: false,
    momentsFilter: "",
    activeChapterIndex: -1,
    autoFollowTranscript: true,
    drawerOpen: false,
    shortcutsOpen: false,
  },
  player: {
    videoId: null,
    title: null,
    streamUrl: null,
    tokenIssuedAt: 0,
    loadPromise: null,
    seekRequestId: 0,
    retried: false,
    jumpedAt: 0,
    duration: 0,
    currentTime: 0,
    playbackRate: 1,
    volume: 1,
    muted: false,
    isPlaying: false,
  },
  chat: {
    pending: false,
    requestId: 0,
    messages: [], // { role: "question" | "answer", text: string, sources: [], videoId: string }
  },
  live: {
    sessions: [],
    selectedId: null,
    transcript: [],
    listLoading: false,
    listLoaded: false,
    listError: null,
    listRequestId: 0,
    transcriptError: null,
    transcriptRequestId: 0,
    timer: null,
    polling: false,
    stopPending: false,
    searchRequestId: 0,
  },
  ui: { screen: "signin" },
};
