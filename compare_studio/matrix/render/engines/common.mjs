// Tiện ích dùng chung cho module engine mở rộng.
export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

/** Chuỗi một dòng, bỏ ký tự điều khiển, cắt theo số ký tự (không cắt giữa từ nếu được). */
export function shortText(value, maxChars = 60) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > maxChars * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.!?-]+$/u, "")}…`;
}

export const STRING = { type: "STRING" };
export const INTEGER = { type: "INTEGER" };
export const NUMBER = { type: "NUMBER" };
