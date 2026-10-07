import { state } from "../state/app-state.js";

export function createShortcutsModal() {
  const backdrop = document.getElementById("shortcutsModal");
  const closeBtn = document.getElementById("btnCloseShortcuts");

  function open() {
    if (!backdrop) return;
    backdrop.hidden = false;
    state.workspace.shortcutsOpen = true;
  }

  function close() {
    if (!backdrop) return;
    backdrop.hidden = true;
    state.workspace.shortcutsOpen = false;
  }

  function toggle() {
    if (state.workspace.shortcutsOpen) close();
    else open();
  }

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (backdrop) {
    backdrop.addEventListener("click", e => {
      if (e.target === backdrop) close();
    });
  }

  return {
    open,
    close,
    toggle,
  };
}
