import { api } from "../../../services/api.js";
import { state } from "../../../state/app-state.js";
import { showToast } from "../../../components/feedback.js";

export function createIngestDrawer({ onIngestSuccess, refreshVideos }) {
  const backdrop = document.getElementById("ingestDrawer");
  const closeBtn = document.getElementById("btnCloseIngest");
  const tabUpload = document.getElementById("tabUploadFile");
  const tabUrl = document.getElementById("tabImportUrl");
  const paneUpload = document.getElementById("paneUploadFile");
  const paneUrl = document.getElementById("paneImportUrl");
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const pickedFileLabel = document.getElementById("pickedFile");
  const errorBox = document.getElementById("ingestError");
  const submitBtn = document.getElementById("submitVideo");
  const form = document.getElementById("uploadForm");
  const urlInput = document.getElementById("videoUrl");
  const browseLink = document.getElementById("browseLink");

  let pickedFile = null;
  let activeMode = "file"; // "file" | "url"

  function open(mode = "file") {
    if (!backdrop) return;
    backdrop.hidden = false;
    state.workspace.drawerOpen = true;
    switchMode(mode);
    clearError();
  }

  function close() {
    if (!backdrop) return;
    backdrop.hidden = true;
    state.workspace.drawerOpen = false;
    clearError();
  }

  function switchMode(mode) {
    activeMode = mode;
    if (tabUpload) tabUpload.classList.toggle("active", mode === "file");
    if (tabUrl) tabUrl.classList.toggle("active", mode === "url");
    if (paneUpload) paneUpload.hidden = mode !== "file";
    if (paneUrl) paneUrl.hidden = mode !== "url";
    clearError();
  }

  function showError(msg) {
    if (errorBox) {
      errorBox.textContent = msg;
      errorBox.classList.add("visible");
    }
  }

  function clearError() {
    if (errorBox) {
      errorBox.textContent = "";
      errorBox.classList.remove("visible");
    }
  }

  function setPickedFile(file) {
    pickedFile = file || null;
    if (pickedFileLabel) {
      pickedFileLabel.textContent = pickedFile ? pickedFile.name : "";
    }
    if (pickedFile) clearError();
  }

  async function handleStartIngest() {
    clearError();
    const url = urlInput ? urlInput.value.trim() : "";

    if (activeMode === "file" && !pickedFile) {
      showError("Please select or drop a video file to upload.");
      return;
    }
    if (activeMode === "url" && !url) {
      showError("Please enter a valid video URL.");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add("btn-loading");
    }

    try {
      let data;
      const title = pickedFile ? pickedFile.name : url;
      if (activeMode === "file" && pickedFile) {
        data = await api.uploadVideo(pickedFile);
      } else if (url) {
        data = await api.ingestVideoFromUrl(url);
      }

      setPickedFile(null);
      if (fileInput) fileInput.value = "";
      if (urlInput) urlInput.value = "";
      close();

      showToast("success", "Video submitted. Processing started.");
      if (refreshVideos) refreshVideos();
      if (onIngestSuccess) {
        onIngestSuccess(data.job_id, data.video_id, title || data.video_id);
      }
    } catch (err) {
      showError(err.message || "Failed to start processing.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("btn-loading");
      }
    }
  }

  // Events
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (backdrop) {
    backdrop.addEventListener("click", e => {
      if (e.target === backdrop) close();
    });
  }

  if (tabUpload) tabUpload.addEventListener("click", () => switchMode("file"));
  if (tabUrl) tabUrl.addEventListener("click", () => switchMode("url"));

  if (dropZone && fileInput) {
    dropZone.addEventListener("click", e => {
      if (e.target !== fileInput) fileInput.click();
    });
    dropZone.addEventListener("dragover", e => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", e => {
      if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove("drag-over");
    });
    dropZone.addEventListener("drop", e => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      if (e.dataTransfer && e.dataTransfer.files.length) {
        setPickedFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length) setPickedFile(fileInput.files[0]);
    });
  }

  if (browseLink && fileInput) {
    browseLink.addEventListener("click", e => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (submitBtn) submitBtn.addEventListener("click", handleStartIngest);
  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      handleStartIngest();
    });
  }

  function reset() {
    pickedFile = null;
    if (pickedFileLabel) pickedFileLabel.textContent = "";
    if (fileInput) fileInput.value = "";
    if (urlInput) urlInput.value = "";
    clearError();
    close();
  }

  return {
    open,
    close,
    reset,
  };
}
