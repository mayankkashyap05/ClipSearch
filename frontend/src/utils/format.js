export function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function formatTime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  if (hours) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function formatSpokenTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const parts = [];
  if (hours) parts.push(hours + (hours === 1 ? " hour" : " hours"));
  if (minutes) parts.push(minutes + (minutes === 1 ? " minute" : " minutes"));
  parts.push(remainder + (remainder === 1 ? " second" : " seconds"));
  return parts.join(" ");
}

export function formatCreatedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function videoStatus(status) {
  const value = String(status || "pending").toLowerCase();
  return ["completed", "processing", "pending", "failed"].includes(value) ? value : "unknown";
}

export function videoStatusLabel(status) {
  const labels = { completed: "Indexed", processing: "Processing", pending: "Queued", failed: "Failed", unknown: "Status" };
  return labels[status] || labels.unknown;
}

export function parseChapters(value) {
  if (!value) return [];
  try {
    const chapters = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(chapters) ? chapters : [];
  } catch (_error) {
    return [];
  }
}
