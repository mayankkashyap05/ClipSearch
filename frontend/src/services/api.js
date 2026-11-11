/*
 * Browser-only transport layer. Endpoint paths, HTTP methods, query names,
 * payload keys, auth headers, and playback-token URLs mirror app/api/main.py.
 */
let getApiBase = () => window.location.origin;
let getAccessToken = () => null;
let onUnauthorized = () => {};

export function configureApi({ apiBase, accessToken, unauthorized } = {}) {
  if (apiBase) getApiBase = apiBase;
  if (accessToken) getAccessToken = accessToken;
  if (unauthorized) onUnauthorized = unauthorized;
}

export function apiUrl(path) {
  const base = String(getApiBase() || window.location.origin).replace(/\/+$/, "");
  if (base === window.location.origin) return path;
  return base + path;
}

async function request(path, options = {}) {
  const { auth = true, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  const token = auth ? getAccessToken() : null;
  if (token) headers.set("Authorization", "Bearer " + token);

  const response = await fetch(apiUrl(path), { ...fetchOptions, headers });
  if (response.status === 401 && auth) {
    onUnauthorized();
    throw new Error("Session expired. Please sign in again.");
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.clone().json();
      if (body && body.detail) detail = body.detail;
    } catch (_error) {
      // Retain the HTTP status message for non-JSON error responses.
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response;
}

async function requestJson(path, options) {
  const response = await request(path, options);
  try {
    return await response.json();
  } catch (_error) {
    throw new Error("The server returned an unreadable response. Please try again.");
  }
}

function jsonBody(value) {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) };
}

export const api = {
  authenticate(mode, credentials) {
    const path = mode === "signup" ? "/auth/signup" : "/auth/login";
    return requestJson(path, {
      method: "POST",
      auth: false,
      ...jsonBody({ email: credentials.email, password: credentials.password }),
    });
  },

  listVideos() {
    return requestJson("/videos");
  },

  getJob(jobId) {
    return requestJson("/jobs/" + encodeURIComponent(jobId));
  },

  uploadVideo(file) {
    const form = new FormData();
    form.append("file", file);
    return requestJson("/videos", { method: "POST", body: form });
  },

  ingestVideoFromUrl(url) {
    return requestJson("/videos/from-url?url=" + encodeURIComponent(url), { method: "POST" });
  },

  getPlaybackToken(videoId) {
    return requestJson("/videos/" + encodeURIComponent(videoId) + "/playback-token");
  },

  searchVideos(query, limit = 8, videoId = null) {
    let path = "/search?q=" + encodeURIComponent(query) + "&limit=" + encodeURIComponent(limit);
    if (videoId) path += "&video_id=" + encodeURIComponent(videoId);
    return requestJson(path);
  },

  askAboutVideo(videoId, question) {
    const path = "/chat?video_id=" + encodeURIComponent(videoId) + "&question=" + encodeURIComponent(question);
    return requestJson(path);
  },

  listLiveSessions() {
    return requestJson("/live");
  },

  startLiveSession({ sourceUrl, language }) {
    return requestJson("/live/start", {
      method: "POST",
      ...jsonBody({ source_url: sourceUrl, language: language || null }),
    });
  },

  getLiveTranscript(sessionId) {
    return requestJson("/live/" + encodeURIComponent(sessionId) + "/transcript");
  },

  searchLiveSession(sessionId, query, limit = 8) {
    const path = "/live/" + encodeURIComponent(sessionId) + "/search?q=" + encodeURIComponent(query) + "&limit=" + encodeURIComponent(limit);
    return requestJson(path);
  },

  stopLiveSession(sessionId) {
    return requestJson("/live/" + encodeURIComponent(sessionId) + "/stop", { method: "POST" });
  },
};
