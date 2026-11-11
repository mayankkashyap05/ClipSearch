import { state } from "../state/app-state.js";

const TOPBAR_LABELS = { home: "LIBRARY", workspace: "VIDEO WORKSPACE", live: "LIVE SESSIONS" };

export function showScreen(screenId, options = {}) {
  const signin = document.getElementById("signin");
  const appShell = document.getElementById("appShell");
  const viewport = document.getElementById("pageViewport");

  if (screenId === "signin") {
    signin.classList.add("active");
    appShell.classList.remove("active");
    state.ui.screen = "signin";
  } else {
    const page = document.getElementById(screenId);
    if (!page || !page.classList.contains("app-page")) return;
    signin.classList.remove("active");
    appShell.classList.add("active");
    document.querySelectorAll(".app-page").forEach(item => item.classList.toggle("active", item === page));
    state.ui.screen = screenId;
    const label = document.getElementById("topbarLabel");
    if (label) label.textContent = TOPBAR_LABELS[screenId] || "WORKSPACE";
    updateNavigation(screenId);
    if (viewport) viewport.scrollTop = 0;
  }

  if (options.focus) {
    const focusTarget = screenId === "signin"
      ? document.getElementById("authEmail")
      : document.querySelector(`#${screenId} .page-title`);
    if (focusTarget) requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
  }
}

function updateNavigation(screenId) {
  document.querySelectorAll("[data-screen-target]").forEach(button => {
    const active = button.dataset.screenTarget === screenId;
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

export function initNavigation({ onNavigate, onSearch }) {
  document.querySelectorAll("[data-screen-target]").forEach(button => {
    button.addEventListener("click", () => onNavigate(button.dataset.screenTarget));
  });
  document.getElementById("topbarSearch").addEventListener("click", onSearch);
}

export function updateAccount() {
  const email = state.auth.email || "Your account";
  const initials = state.auth.email ? state.auth.email.trim().charAt(0).toUpperCase() : "A";
  document.querySelectorAll("[data-user-email]").forEach(element => { element.textContent = email; });
  document.querySelectorAll("[data-user-initials]").forEach(element => { element.textContent = initials; });
}
