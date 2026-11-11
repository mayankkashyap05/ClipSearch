export function showToast(type, message) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;

  const toast = document.createElement("div");
  const isError = type === "error";
  toast.className = "toast " + (isError ? "error" : "success");
  toast.setAttribute("role", isError ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = isError ? "!" : "✓";
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(icon, text);
  stack.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("leaving");
    window.setTimeout(() => toast.remove(), 160);
  }, 3600);
}

export function setConnectionStatus(connected, message, title = message) {
  document.querySelectorAll(".connection-status").forEach(status => {
    const dot = status.querySelector(".dot");
    const label = status.querySelector(".connection-label");
    if (dot) {
      dot.classList.toggle("connected", connected === true);
      dot.classList.toggle("off", connected === false);
    }
    if (label) label.textContent = message;
    status.title = title || message;
    status.setAttribute("aria-label", title || message);
  });
}
