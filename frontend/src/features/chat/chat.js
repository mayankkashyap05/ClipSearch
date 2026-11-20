import { api } from "../../services/api.js?v=3";
import { state } from "../../state/app-state.js?v=3";
import { formatTime } from "../../utils/format.js";

export function createChatFeature({ workspace }) {
  const input = document.getElementById("chatInput");
  const button = document.getElementById("chatBtn");
  const form = document.getElementById("chatForm");
  const messages = document.getElementById("chatMessages");
  let conversation = [];

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
    await workspace.jumpToVideoMoment(videoId, timestamp, state.workspace.scopedVideoTitle);
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
    const pending = appendMessage("answer", "Finding the moments that best answer that…", "pending");
    const priorConversation = conversation.slice(-6);

    try {
      const data = state.share.active
        ? await api.askSharedVideo(state.share.token, question, priorConversation)
        : await api.askAboutVideo(videoId, question, priorConversation);
      if (requestId !== state.chat.requestId) return;
      pending.remove();
      appendAnswer(data.answer, Array.isArray(data.sources) ? data.sources : [], videoId);
      conversation = [...priorConversation, { role: "user", content: question },
        { role: "assistant", content: String(data.answer == null ? "" : data.answer) }].slice(-6);
    } catch (error) {
      if (requestId !== state.chat.requestId) return;
      pending.remove();
      if (state.share.active && error.status === 404) return workspace.sharedUnavailable();
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
    conversation = [];
    messages.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "chat-empty";
    empty.id = "chatEmpty";
    empty.textContent = "Ask in your own words. You can ask a follow-up, too.";
    messages.appendChild(empty);
    button.classList.remove("btn-loading");
    button.removeAttribute("aria-busy");
    button.disabled = !state.workspace.scopedVideoId;
    input.disabled = !state.workspace.scopedVideoId;
  }

  return { reset, submitQuestion };
}