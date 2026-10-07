import { api } from "../../../services/api.js";
import { state } from "../../../state/app-state.js";
import { formatTime } from "../../../utils/format.js";
import { showToast } from "../../../components/feedback.js";

export function createChatPanel({ player }) {
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const button = document.getElementById("chatBtn");
  const messagesBox = document.getElementById("chatMessages");
  const startersBar = document.getElementById("chatStartersBar");

  function appendQuestion(text) {
    const empty = document.getElementById("chatEmpty");
    if (empty) empty.remove();
    const msg = document.createElement("div");
    msg.className = "chat-bubble question";
    msg.textContent = text;
    messagesBox.appendChild(msg);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    return msg;
  }

  function appendAnswer(answer, sources = [], videoId) {
    const empty = document.getElementById("chatEmpty");
    if (empty) empty.remove();
    const msg = document.createElement("div");
    msg.className = "chat-bubble answer";

    const textEl = document.createElement("div");
    textEl.className = "chat-answer-text";
    textEl.textContent = answer == null ? "" : String(answer);
    msg.appendChild(textEl);

    if (sources && sources.length > 0) {
      const sourcesWrap = document.createElement("div");
      sourcesWrap.className = "chat-sources-group";
      const lbl = document.createElement("span");
      lbl.className = "chat-sources-label";
      lbl.textContent = "Referenced Moments:";
      sourcesWrap.appendChild(lbl);

      sources.forEach(src => {
        const ts = Number(src.timestamp);
        if (!Number.isFinite(ts)) return;
        const type = src.type || "speech";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `chat-source-chip ${type}`;
        btn.dataset.timestamp = String(ts);
        btn.dataset.videoId = videoId || state.workspace.selectedVideoId || "";
        btn.title = src.text ? String(src.text) : `Jump to ${formatTime(ts)}`;
        btn.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-play"></use></svg><span>${formatTime(ts)} · ${type}</span>`;
        sourcesWrap.appendChild(btn);
      });

      if (sourcesWrap.children.length > 1) {
        msg.appendChild(sourcesWrap);
      }
    }

    messagesBox.appendChild(msg);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    return msg;
  }

  async function submitQuestion(questionText) {
    const question = typeof questionText === "string" ? questionText.trim() : (input ? input.value.trim() : "");
    const videoId = state.workspace.selectedVideoId;

    if (!videoId) {
      showToast("error", "Select a video before asking questions.");
      return;
    }
    if (!question || state.chat.pending) return;

    appendQuestion(question);
    if (input) input.value = "";
    state.chat.pending = true;
    const reqId = ++state.chat.requestId;

    if (button) {
      button.disabled = true;
      button.classList.add("btn-loading");
    }
    if (input) input.disabled = true;

    // Loading bubble
    const pendingMsg = document.createElement("div");
    pendingMsg.className = "chat-bubble answer pending";
    pendingMsg.innerHTML = '<span class="player-spinner" aria-hidden="true"></span><span>Analyzing video moments…</span>';
    messagesBox.appendChild(pendingMsg);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    try {
      const data = await api.askAboutVideo(videoId, question);
      if (reqId !== state.chat.requestId) return;
      pendingMsg.remove();
      appendAnswer(data.answer, Array.isArray(data.sources) ? data.sources : [], videoId);
    } catch (error) {
      if (reqId !== state.chat.requestId) return;
      pendingMsg.remove();
      const errorMsg = document.createElement("div");
      errorMsg.className = "chat-bubble answer error";
      errorMsg.textContent = `Could not retrieve answer: ${error.message}`;
      messagesBox.appendChild(errorMsg);
    } finally {
      if (reqId === state.chat.requestId) {
        state.chat.pending = false;
        if (button) {
          button.disabled = false;
          button.classList.remove("btn-loading");
        }
        if (input) {
          input.disabled = false;
          input.focus();
        }
      }
    }
  }

  // Events
  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      submitQuestion();
    });
  }

  if (startersBar) {
    startersBar.addEventListener("click", e => {
      const chip = e.target.closest(".starter-chip");
      if (chip && chip.dataset.question) {
        submitQuestion(chip.dataset.question);
      }
    });
  }

  if (messagesBox) {
    messagesBox.addEventListener("click", e => {
      const sourceBtn = e.target.closest("[data-timestamp]");
      if (sourceBtn) {
        const ts = Number(sourceBtn.dataset.timestamp);
        if (Number.isFinite(ts)) {
          player.seekTo(ts);
        }
      }
    });
  }

  function reset() {
    state.chat.requestId += 1;
    state.chat.pending = false;
    if (messagesBox) {
      messagesBox.innerHTML = `
        <div class="chat-welcome-card" id="chatEmpty">
          <span class="chat-welcome-icon"><svg class="icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg></span>
          <h4>Interrogate this recording</h4>
          <p>Ask questions grounded directly in the video's transcript and visual scene descriptions. Answers include clickable timestamps.</p>
        </div>`;
    }
    if (button) {
      button.disabled = false;
      button.classList.remove("btn-loading");
    }
    if (input) {
      input.disabled = false;
      input.value = "";
    }
  }

  return {
    submitQuestion,
    reset,
  };
}
