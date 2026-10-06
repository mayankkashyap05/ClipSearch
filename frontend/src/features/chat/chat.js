import { api } from "../../services/api.js";
import { state } from "../../state/app-state.js";
import { showToast } from "../../components/feedback.js";
import { formatTime } from "../../utils/format.js";

export function createChatFeature({ player }) {
  const input = document.getElementById("chatInput");
  const button = document.getElementById("chatBtn");
  const form = document.getElementById("chatForm");
  const messages = document.getElementById("chatMessages");

  function appendMessage(role, text, extraClass = "") {
    const empty = document.getElementById("chatEmpty");
    if (empty) empty.remove();
    const message = document.createElement("div");
    message.className = "chat-msg " + role + (extraClass ? " " + extraClass : "");
    message.textContent = text;
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  }

  function appendAnswer(answer, sources = [], videoId) {
    const empty = document.getElementById("chatEmpty");
    if (empty) empty.remove();
    const message = document.createElement("div");
    message.className = "chat-msg answer";
    const answerText = document.createElement("div");
    answerText.textContent = answer == null ? "" : String(answer);
    message.appendChild(answerText);

    if (sources.length) {
      const sourceList = document.createElement("div");
      sourceList.className = "chat-sources";
      const label = document.createElement("span");
      label.textContent = "Sources";
      sourceList.appendChild(label);
      sources.forEach(source => {
        const timestamp = Number(source.timestamp);
        if (!Number.isFinite(timestamp)) return;
        const sourceType = source.type || "source";
        const sourceButton = document.createElement("button");
        sourceButton.className = "chat-source";
        sourceButton.type = "button";
        sourceButton.dataset.chatTimestamp = String(timestamp);
        sourceButton.dataset.videoId = videoId || "";
        sourceButton.dataset.sourceType = String(sourceType);
        sourceButton.textContent = `${formatTime(timestamp)} · ${sourceType}`;
        sourceButton.setAttribute("aria-label", `Jump to ${sourceType} source at ${formatTime(timestamp)}`);
        sourceButton.title = source.text ? String(source.text) : `Jump to ${formatTime(timestamp)}`;
        sourceList.appendChild(sourceButton);
      });
      if (sourceList.children.length > 1) message.appendChild(sourceList);
    }

    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  }

  async function jumpToSource(timestamp, videoId) {
    if (!videoId) return;
    try {
      await player.loadVideo(videoId, state.workspace.scopedVideoTitle);
      const played = await player.seekTo(timestamp);
      const label = formatTime(player.getElement().currentTime);
      state.player.jumpedAt = Date.now();
      if (played) {
        player.setPlayerState("ready", "Playing from " + label);
        player.showResumeButton(false);
      } else {
        player.setPlayerState("ready", "Jumped to " + label + " · press Play to continue");
        player.showResumeButton(true);
      }
      player.reveal();
    } catch (error) {
      player.setPlayerState("error", player.friendlyPlaybackError(error));
      showToast("error", "Couldn’t open that source moment. Try selecting the video again.");
    }
  }

  async function submitQuestion(event) {
    if (event) event.preventDefault();
    const question = input.value.trim();
    const videoId = state.workspace.scopedVideoId;
    if (!question || !videoId || state.chat.pending) return;

    appendMessage("question", question);
    input.value = "";
    state.chat.pending = true;
    const requestId = ++state.chat.requestId;
    button.disabled = true;
    input.disabled = true;
    button.classList.add("btn-loading");
    button.setAttribute("aria-busy", "true");
    const pending = appendMessage("answer", "Looking through the indexed moments…", "pending");

    try {
      const data = await api.askAboutVideo(videoId, question);
      if (requestId !== state.chat.requestId) return;
      pending.remove();
      appendAnswer(data.answer, Array.isArray(data.sources) ? data.sources : [], videoId);
    } catch (error) {
      if (requestId !== state.chat.requestId) return;
      pending.remove();
      appendMessage("answer", `I couldn’t get an answer: ${error.message}. You can ask again.`, "error");
    } finally {
      if (requestId === state.chat.requestId) {
        state.chat.pending = false;
        button.classList.remove("btn-loading");
        button.removeAttribute("aria-busy");
        button.disabled = !state.workspace.scopedVideoId;
        input.disabled = !state.workspace.scopedVideoId;
        if (state.workspace.scopedVideoId) input.focus();
      }
    }
  }

  form.addEventListener("submit", submitQuestion);
  messages.addEventListener("click", event => {
    const source = event.target.closest("[data-chat-timestamp]");
    if (source) jumpToSource(Number(source.dataset.chatTimestamp), source.dataset.videoId);
  });

  function reset() {
    state.chat.requestId += 1;
    state.chat.pending = false;
    messages.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "chat-empty";
    empty.id = "chatEmpty";
    empty.textContent = "Questions and sourced answers will appear here.";
    messages.appendChild(empty);
    button.classList.remove("btn-loading");
    button.removeAttribute("aria-busy");
    button.disabled = !state.workspace.scopedVideoId;
    input.disabled = !state.workspace.scopedVideoId;
  }

  return { reset, submitQuestion };
}
