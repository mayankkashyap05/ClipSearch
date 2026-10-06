import { api } from "../../services/api.js";
import { state } from "../../state/app-state.js";
import { setConnectionStatus } from "../../components/feedback.js";
import { showScreen } from "../../components/navigation.js";
import { escapeHtml, formatCreatedAt, videoStatus, videoStatusLabel } from "../../utils/format.js";

const VIDEO_ICON = '<svg class="icon" aria-hidden="true"><use href="#icon-video"></use></svg>';
const ERROR_ICON = '<svg class="icon" aria-hidden="true"><path d="M12 8v4m0 4h.01"/><circle cx="12" cy="12" r="9"/></svg>';

export function createLibraryFeature({ openWorkspace, openVideo }) {
  const list = document.getElementById("videoList");

  function enterHome() {
    const username = state.auth.email ? state.auth.email.split("@")[0] : null;
    document.getElementById("homeGreeting").textContent = "Your video library";
    document.getElementById("homeSubtitle").textContent = username
      ? `Welcome back, ${username}. Your indexed moments are ready when you are.`
      : "Every recording, ready to search and revisit.";
    showScreen("home", { focus: true });
    refreshVideos();
  }

  function renderLoadingRows() {
    return Array.from({ length: 3 }, () => `
      <div class="video-row video-row-skeleton" aria-hidden="true">
        <span class="video-thumb skeleton"></span>
        <span class="video-meta"><span class="skeleton skeleton-title skeleton-line"></span><span class="skeleton skeleton-sub skeleton-line"></span></span>
        <span class="skeleton skeleton-pill"></span>
      </div>`).join("");
  }

  function renderVideos() {
    const videos = state.library.items;
    const total = videos.length;
    const processing = videos.filter(video => video.status === "processing" || video.status === "pending").length;
    const complete = videos.filter(video => video.status === "completed").length;
    document.getElementById("statTotal").textContent = state.library.loaded ? String(total) : "—";
    document.getElementById("statProcessing").textContent = state.library.loaded ? String(processing) : "—";
    document.getElementById("statComplete").textContent = state.library.loaded ? String(complete) : "—";
    list.setAttribute("aria-busy", String(state.library.loading));
    list.classList.toggle("is-loading", state.library.loading);
    document.getElementById("libraryCount").textContent = state.library.loaded
      ? `${total} ${total === 1 ? "video" : "videos"}`
      : "";

    if (state.library.loading && !state.library.loaded) {
      list.innerHTML = renderLoadingRows();
      return;
    }
    if (state.library.error && !state.library.loaded) {
      list.innerHTML = `
        <div class="empty-state" role="group" aria-label="Unable to load your library">
          <span class="empty-state-icon">${ERROR_ICON}</span>
          <strong>We couldn’t load your library</strong>
          <p>${escapeHtml(state.library.error)}</p>
          <button class="btn btn-secondary" type="button" data-retry-videos>Try again</button>
        </div>`;
      return;
    }

    if (!total) {
      if (state.library.error) {
        list.innerHTML = `
          <div class="library-error" role="status"><span>Couldn’t confirm your latest library state.</span><button class="btn btn-secondary" type="button" data-retry-videos>Retry</button></div>
          <div class="empty-state"><strong>No videos in the last successful refresh</strong><p>Reconnect to check for recent additions.</p></div>`;
      } else {
        list.innerHTML = `
          <div class="empty-state">
            <span class="empty-state-icon">${VIDEO_ICON}</span>
            <strong>No videos yet</strong>
            <p>Add a video to build your searchable library. Once processing is complete, you can search its transcript and visual moments.</p>
            <button class="btn btn-secondary" type="button" data-go-upload>Add your first video</button>
          </div>`;
      }
      return;
    }

    const refreshNotice = state.library.error ? `
      <div class="library-error" role="status"><span>Couldn’t refresh your library. Your last results are still shown.</span><button class="btn btn-secondary" type="button" data-retry-videos>Retry</button></div>` : "";
    list.innerHTML = refreshNotice + videos.map(video => {
      const status = videoStatus(video.status);
      const stage = video.current_stage ? String(video.current_stage).replace(/[_-]+/g, " ") : "";
      const created = formatCreatedAt(video.created_at);
      const subline = [stage && status !== "completed" ? stage : "", created].filter(Boolean).join(" · ");
      const title = video.filename || video.video_id || "Untitled video";
      return `
        <button class="video-row" type="button" data-video-id="${escapeHtml(video.video_id)}" aria-label="Open ${escapeHtml(title)}">
          <span class="video-thumb" aria-hidden="true">${VIDEO_ICON}</span>
          <span class="video-meta"><span class="video-title">${escapeHtml(title)}</span><span class="video-sub">${escapeHtml(subline || "Added to your library")}</span></span>
          <span class="status-pill ${status}">${videoStatusLabel(status)}</span>
        </button>`;
    }).join("");
  }

  async function refreshVideos() {
    const requestId = ++state.library.requestId;
    state.library.loading = true;
    state.library.error = null;
    setConnectionStatus(null, "Connecting", "Connecting to " + state.auth.apiBase);
    if (!state.library.loaded) renderVideos();

    try {
      const data = await api.listVideos();
      if (requestId !== state.library.requestId) return;
      state.library.items = Array.isArray(data.videos) ? data.videos : [];
      state.library.loaded = true;
      state.library.error = null;
      setConnectionStatus(true, "Connected", "Connected to " + state.auth.apiBase.replace(/^https?:\/\//, ""));
    } catch (error) {
      if (requestId !== state.library.requestId) return;
      state.library.error = error.message || "Check your connection and try again.";
      setConnectionStatus(false, "Unavailable", state.library.error);
    } finally {
      if (requestId === state.library.requestId) {
        state.library.loading = false;
        renderVideos();
      }
    }
  }

  async function findVideo(videoId) {
    let video = state.library.items.find(item => item.video_id === videoId);
    if (!video) {
      try {
        const data = await api.listVideos();
        state.library.items = Array.isArray(data.videos) ? data.videos : state.library.items;
        state.library.loaded = true;
        video = state.library.items.find(item => item.video_id === videoId);
      } catch (_error) {
        return null;
      }
    }
    return video || null;
  }

  list.addEventListener("click", event => {
    const retry = event.target.closest("[data-retry-videos]");
    if (retry) {
      refreshVideos();
      return;
    }
    const upload = event.target.closest("[data-go-upload]");
    if (upload) {
      openWorkspace("upload");
      return;
    }
    const row = event.target.closest("[data-video-id]");
    if (row) {
      const video = state.library.items.find(item => item.video_id === row.dataset.videoId);
      if (video) openVideo(video);
    }
  });

  return { enterHome, refreshVideos, renderVideos, findVideo };
}
