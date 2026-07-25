// Shared helpers used across views.

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// Local-timezone-safe "YYYY-MM-DD", unlike Date#toISOString() which
// converts to UTC first and can land on the wrong calendar day for
// timezones ahead of UTC (e.g. UTC+8) in the early morning hours.
export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Local-timezone-safe "YYYY-MM".
export function localMonthStr(date = new Date()) {
  return localDateStr(date).slice(0, 7);
}
