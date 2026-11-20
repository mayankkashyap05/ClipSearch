import { api } from "../../services/api.js?v=3";
import { state } from "../../state/app-state.js?v=3";
import { showToast } from "../../components/feedback.js";

export function createShareDialog() {
  const dialog = document.getElementById("shareModal");
  const url = document.getElementById("shareUrl");
  const status = document.getElementById("shareStatus");
  const copy = document.getElementById("copyShare");
  const openLink = document.getElementById("openShare");
  const revoke = document.getElementById("revokeShare");
  let currentId = null;
  let generation = 0;

  function cacheToken(id, token) {
    const item = state.library.items.find(video => video.video_id === id);
    if (item) item.share_token = token;
  }

  function setLink(link) {
    url.value = link;
    copy.disabled = revoke.disabled = !link;
    openLink.hidden = !link;
    if (link) openLink.href = link;
    else openLink.removeAttribute("href");
  }

  async function open(id) {
    if (dialog.open || !id || state.share.active) return;
    const request = ++generation;
    currentId = id;
    setLink("");
    status.textContent = "Getting the link…";
    dialog.showModal(); // Native focus trap, Escape dismissal and focus restoration.
    try {
      const data = await api.createShareLink(id);
      cacheToken(id, data.share_token);
      if (request !== generation || !dialog.open) return;
      setLink(window.location.origin + data.share_path);
      status.textContent = "Link is active.";
    } catch (error) {
      if (request === generation) status.textContent = error.message;
    }
  }

  copy.addEventListener("click", async () => {
    const request = generation;
    const link = url.value;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      if (!dialog.open || request !== generation) return;
      const field = document.createElement("textarea");
      field.className = "sr-only";
      field.value = link;
      dialog.append(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch { /* Offer manual copy below. */ }
      field.remove();
      if (!copied) {
        url.select();
        status.textContent = "Select and copy the link above.";
        return;
      }
      copy.focus();
    }
    if (request === generation) status.textContent = "Copied!";
  });

  revoke.addEventListener("click", async () => {
    const id = currentId;
    const request = generation;
    revoke.disabled = true;
    try {
      await api.revokeShareLink(id);
      cacheToken(id, null);
      if (request !== generation) return;
      dialog.close();
      showToast("success", "Link revoked. The video is no longer shared.");
    } catch (error) {
      if (request !== generation) return;
      revoke.disabled = false;
      status.textContent = error.message;
    }
  });
  dialog.addEventListener("close", () => {
    generation += 1;
    currentId = null;
    setLink("");
  });
  return { open, close: () => dialog.close() };
}
