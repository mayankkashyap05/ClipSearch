import { api } from "../../services/api.js";
import { showToast } from "../../components/feedback.js";

export function createIngestFeature({ workspace, refreshVideos }) {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const pickedFileLabel = document.getElementById("pickedFile");
  const errorBox = document.getElementById("ingestError");
  const submitButton = document.getElementById("submitVideo");
  const form = document.getElementById("uploadForm");
  const urlInput = document.getElementById("videoUrl");
  let pickedFile = null;

  function showError(message) {
    errorBox.textContent = message;
  }

  function clearError() {
    errorBox.textContent = "";
  }

  function setPickedFile(file) {
    pickedFile = file || null;
    pickedFileLabel.textContent = pickedFile ? pickedFile.name : "";
    if (pickedFile) clearError();
  }

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

  form.addEventListener("submit", async event => {
    event.preventDefault();
    clearError();
    const url = urlInput.value.trim();
    submitButton.disabled = true;
    submitButton.classList.add("btn-loading");
    submitButton.setAttribute("aria-busy", "true");
    form.setAttribute("aria-busy", "true");

    try {
      let data;
      const title = pickedFile ? pickedFile.name : url;
      if (pickedFile) {
        data = await api.uploadVideo(pickedFile);
      } else if (url) {
        data = await api.ingestVideoFromUrl(url);
      } else {
        showError("Choose a file or paste a video URL first.");
        return;
      }

      setPickedFile(null);
      fileInput.value = "";
      urlInput.value = "";
      workspace.beginProcessing(data.job_id, data.video_id, title || data.video_id);
      showToast("success", "Processing has started.");
      refreshVideos();
    } catch (error) {
      showError(error.message || "Upload failed. Please try again.");
    } finally {
      submitButton.disabled = false;
      submitButton.classList.remove("btn-loading");
      submitButton.removeAttribute("aria-busy");
      form.removeAttribute("aria-busy");
    }
  });

  function reset() {
    pickedFile = null;
    pickedFileLabel.textContent = "";
    fileInput.value = "";
    urlInput.value = "";
    clearError();
    submitButton.disabled = false;
    submitButton.classList.remove("btn-loading");
    submitButton.removeAttribute("aria-busy");
    form.removeAttribute("aria-busy");
  }

  return { reset, showError, clearError };
}
