// Khối dùng chung cho renderer variant: cửa sổ cảnh, thẻ đếm cảnh, linh vật nước.
// Chỉ là mảnh ghép — bố cục (vị trí, kích thước) luôn do composition của variant truyền vào.
import { escapeHtml } from "./primitives.mjs";

// Cảnh trước kéo dài thêm OVERLAP giây sau khi cảnh sau bắt đầu, trên hai track xen kẽ, để khung đúng lúc chuyển cảnh
// không bao giờ trống (clip kết thúc ở t và clip bắt đầu ở t có thể cùng không hiện tại đúng khung t).
export const SCENE_OVERLAP = 0.1;

/** Cửa sổ hiển thị mỗi cảnh: cảnh 1 từ 0, cảnh cuối tới hết video; track xen kẽ baseTrack / baseTrack+1. */
export function sceneWindows(scenes, totalDuration, baseTrack = 3) {
  return scenes.map((scene, i) => {
    const start = i === 0 ? 0 : scene.start;
    const end = i < scenes.length - 1 ? Math.min(scenes[i + 1].start + SCENE_OVERLAP, totalDuration) : totalDuration;
    return { ...scene, visualStart: start, visualDuration: Number((end - start).toFixed(3)), track: baseTrack + (i % 2) };
  });
}

/** [left, top, width, height] → CSS. */
export function box([left, top, width, height]) {
  return `left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
}

export function counterLabel(index, total) {
  return `${String(index).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
}

/** Cụm từ ngắn (≤ maxChars) từ đầu câu, dùng cho chữ lớn/punchline. */
export function shortPhrase(line, maxChars = 24) {
  const text = String(line || "").replace(/[.!?…,;:。！？、]+$/u, "");
  const words = text.split(/\s+/u).filter(Boolean);
  // Chữ Nhật/Trung không có dấu cách: không cắt giữa từ — lấy vế đầu tới dấu 、/， nếu đủ dài, không thì cả câu.
  if (words.length <= 1) {
    const clause = text.split(/[、，]/u)[0];
    return [...clause].length >= 5 ? clause : text;
  }
  const picked = [];
  for (const word of words) {
    if (picked.length && [...picked, word].join(" ").length > maxChars) break;
    picked.push(word);
  }
  return picked.join(" ");
}

// --- Linh vật nước (tools/themes: Otto / Barnaby / Hachi / Horangi …) -------------------------------------------
// HTML/CSS gốc của theme đặt #avatar-host tuyệt đối cho layout compare (top:1280px, opacity 0) — ở đây ghi đè vị trí,
// cỡ và cho hiện. Id bên trong (#tail, #eye-left…) là cố định nên mỗi tài liệu chỉ có MỘT linh vật.

/** HTML linh vật (tĩnh, không phải .clip) đặt ở `place = { left, top, scale, flip }`. */
export function mascotHtml(theme, place) {
  if (!theme.mascot?.html) return "";
  return `<div id="avatar-host" data-mascot="${escapeHtml(theme.mascot.name || "")}">${theme.mascot.html}</div>`;
}

export function mascotCss(theme, { left, top, scale = 1, flip = false }) {
  if (!theme.mascot?.css) return "";
  const transform = `scale(${flip ? -scale : scale},${scale})`;
  return `${theme.mascot.css}
#avatar-host{top:${top}px!important;left:${left}px!important;opacity:1!important;transform:${transform};transform-origin:50% 100%;pointer-events:none;z-index:6}`;
}

/** Nhún nhẹ ở đầu mỗi cảnh (tween tính sẵn, tất định). Animate phần tử con, không animate .clip. */
export function mascotTweens(theme, scenes) {
  if (!theme.mascot?.html) return [];
  return scenes.flatMap((scene) => [
    { method: "to", target: "#avatar-head", vars: { rotation: scene.index % 2 ? -6 : 6, duration: 0.18, ease: "power2.out" }, at: Number(scene.visualStart.toFixed(3)) },
    { method: "to", target: "#avatar-head", vars: { rotation: 0, duration: 0.35, ease: "power2.inOut" }, at: Number((scene.visualStart + 0.18).toFixed(3)) },
    { method: "fromTo", target: "#avatar-body", from: { scaleY: 0.94 }, vars: { scaleY: 1, duration: 0.3, ease: "back.out(2)", immediateRender: false }, at: Number(scene.visualStart.toFixed(3)) },
  ]);
}
