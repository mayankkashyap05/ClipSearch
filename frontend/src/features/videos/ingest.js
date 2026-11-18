import { api } from "../../services/api.js";
import { showToast } from "../../components/feedback.js";

const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be",
]);

/** Returns a problem description for obviously-wrong YouTube links, or null. */
function checkYouTubeUrl(parsed, host) {
  const path = parsed.pathname.replace(/\/+$/, "");
  if (host === "youtu.be") {
    return /^\/[\w-]{6,}$/.test(path) ? null : "That youtu.be link is missing its video ID.";
  }
  if (path === "/watch") {
    return parsed.searchParams.get("v")
      ? null
      : "That YouTube link doesn't point to a video (no ?v=… part). Open the video and copy its address.";
  }
  if (/^\/(shorts|live|embed|v)\/[\w-]{6,}/.test(path)) return null;
  if (path === "/playlist") return "That's a playlist link. Open a single video and copy its link.";
  if (path === "") return "That's the YouTube home page. Open a video and copy its link.";
  if (/^\/(@|channel\/|c\/|user\/)/.test(path)) return "That's a channel link. Open a single video and copy its link.";
  return null; // anything else: let the server decide
}

/** Basic client-side URL validation. Returns { url } or { error }. */
function checkVideoUrl(raw) {
  let value = raw.trim();
  if (!value) return { error: "Paste a video URL first." };
  if (/\s/.test(value)) return { error: "That link contains spaces. Copy the full address from your browser's address bar." };

  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    // "javascript:", "mailto:", ... are never valid; "youtube.com/watch?v=…" just lacks a scheme.
    if (/^[a-z][a-z\d+.-]*:(?!\d)/i.test(value)) return { error: "Only http(s) video links are supported." };
    value = "https://" + value;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    return { error: "That doesn't look like a valid URL." };
  }
  if (!/^https?:$/.test(parsed.protocol)) return { error: "Only http(s) video links are supported." };

  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".")) return { error: "That doesn't look like a valid web address." };

  if (YOUTUBE_HOSTS.has(host)) {
    const problem = checkYouTubeUrl(parsed, host);
    if (problem) return { error: problem };
  }
  return { url: parsed.href };
}

function describeSubmitError(error, isFile) {
  if (error instanceof TypeError) return "Couldn't reach the server. Check your connection and try again.";
  const message = error && error.message;
  if (message) return message;
  return isFile ? "Upload failed. Please try again." : "Couldn't start processing that link. Please try again.";
}

export function createIngestFeature({ workspace, refreshVideos }) {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const pickedFileLabel = document.getElementById("pickedFile");
  const errorBox = document.getElementById("ingestError");
  const submitButton = document.getElementById("submitVideo");
  const form = document.getElementById("uploadForm");
  const urlInput = document.getElementById("videoUrl");
  let pickedFile = null;
  let submitting = false;
  let urlErrorShown = false;

  function showError(message) {
    errorBox.textContent = message;
  }

  function clearError() {
    errorBox.textContent = "";
    urlErrorShown = false;
    urlInput.removeAttribute("aria-invalid");
  }

  function showUrlError(message) {
    showError(message);
    urlErrorShown = true;
    urlInput.setAttribute("aria-invalid", "true");
    urlInput.focus();
  }

  function setPickedFile(file) {
    pickedFile = file || null;
    pickedFileLabel.textContent = pickedFile ? pickedFile.name : "";
    if (pickedFile) clearError();
  }

  urlInput.addEventListener("input", () => {
    if (urlErrorShown) clearError();
  });

  dropZone.addEventListener("click", event => {
    if (event.target === fileInput) return;
    fileInput.click();
  });
  dropZone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("drag");
  });
  dropZone.addEventListener("dragleave", event => {
    if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("drag");
  });
  dropZone.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("drag");
    if (event.dataTransfer && event.dataTransfer.files.length) setPickedFile(event.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) setPickedFile(fileInput.files[0]);
  });
  document.getElementById("browseLink").addEventListener("click", event => {
    event.stopPropagation();
    fileInput.click();
  });

  function setBusy(busy) {
    submitting = busy;
    submitButton.disabled = busy;
    submitButton.classList.toggle("btn-loading", busy);
    if (busy) {
      submitButton.setAttribute("aria-busy", "true");
      form.setAttribute("aria-busy", "true");
    } else {
      submitButton.removeAttribute("aria-busy");
      form.removeAttribute("aria-busy");
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitting) return;
    clearError();

    const isFile = Boolean(pickedFile);
    let url = "";

    // Validate BEFORE going into the busy state so bad input never flashes a spinner.
    if (!isFile) {
      if (!urlInput.value.trim()) {
        showError("Choose a file or paste a video URL first.");
        return;
      }
      const check = checkVideoUrl(urlInput.value);
      if (check.error) {
        showUrlError(check.error);
        return;
      }
      url = check.url;
    }

    setBusy(true);
    try {
      const title = isFile ? pickedFile.name : url;
      const data = isFile
        ? await api.uploadVideo(pickedFile)
        : await api.ingestVideoFromUrl(url);

      setPickedFile(null);
      fileInput.value = "";
      urlInput.value = "";

      // Straight into the progress view, same path as a file upload.
      workspace.beginProcessing(data.job_id, data.video_id, title || data.video_id, {
        source: isFile ? "file" : "url",
      });
      showToast("success", isFile
        ? "Processing has started."
        : "Fetching your video from its source…");
      refreshVideos();
    } catch (error) {
      showError(describeSubmitError(error, isFile));
    } finally {
      setBusy(false);
    }
  });

  function reset() {
    pickedFile = null;
    pickedFileLabel.textContent = "";
    fileInput.value = "";
    urlInput.value = "";
    clearError();
    setBusy(false);
  }

  return { reset, showError, clearError };
}