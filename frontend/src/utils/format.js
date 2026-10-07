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

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return "0 min";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  if (minutes > 0) {
    return `${minutes} min`;
  }
  return `${secs} sec`;
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
  const labels = {
    completed: "Indexed",
    processing: "Processing",
    pending: "Queued",
    failed: "Failed",
    unknown: "Status",
  };
  return labels[status] || labels.unknown;
}

export function parseChapters(value) {
  if (!value) return [];
  try {
    const chapters = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(chapters)) return [];
    return chapters.map((ch, idx) => {
      if (typeof ch === "string") {
        return { start: 0, title: ch, index: idx + 1 };
      }
      return {
        start: Number(ch.start || ch.timestamp || 0),
        title: ch.title || ch.text || `Chapter ${idx + 1}`,
        index: idx + 1,
      };
    }).sort((a, b) => a.start - b.start);
  } catch (_error) {
    return [];
  }
}

export function highlightMatch(text, query) {
  if (!text) return "";
  const safeText = escapeHtml(text);
  if (!query || !query.trim()) return safeText;
  const safeQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${safeQuery})`, "gi");
  return safeText.replace(regex, '<mark class="highlight">$1</mark>');
}
