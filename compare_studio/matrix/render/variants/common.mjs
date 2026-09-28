// Hồ sơ dùng chung cho variant của các engine (asset/chi phí theo loại hình, cảnh "hàng xóm" cho lưới ảnh).
// Không phải core registry: chỉ là hằng số + tiện ích để các file variants/<engine>/ không chép lại.
import { frameHtml } from "./kit/frames.mjs";
import { escapeHtml } from "./kit/primitives.mjs";

export const IMAGE_ASSET = Object.freeze({ type: "IMAGE_AI", perScene: 1, aspect: "9:16", scope: "SCENE", fallback: ["reuse_account_cache", "fail"] });
export const IMAGE_COST = Object.freeze({ aiImagesPerScene: 1, stockClipsPerScene: 0, reusableAssetRatio: 0 });
// Ảnh cảnh = clip stock (Pexels/Pixabay, bkt_web.stock_video) khi TOKMATRIX_STOCK_VIDEO=1, ảnh AI khi tắt / không có clip
// (vẫn là IMAGE_AI: slot ảnh luôn có poster hoặc ảnh AI, composition không đổi). aiImagesPerScene = trường hợp xấu nhất.
export const STOCK_VIDEO_ASSET = Object.freeze({ ...IMAGE_ASSET, stockVideo: true });
export const STOCK_VIDEO_COST = Object.freeze({ aiImagesPerScene: 1, stockClipsPerScene: 1, reusableAssetRatio: 0 });
export const TEXT_ASSET = Object.freeze({ type: "TEXT", perScene: 0, aspect: "9:16", scope: "VIDEO", fallback: ["text", "fail"] });
export const SVG_ASSET = Object.freeze({ type: "SVG", perScene: 0, aspect: "9:16", scope: "VIDEO", fallback: ["svg", "fail"] });
export const NO_IMAGE_COST = Object.freeze({ aiImagesPerScene: 0, stockClipsPerScene: 0, reusableAssetRatio: 0 });

/** k cảnh khác cảnh i (lần lượt sau rồi trước), để dựng lưới ảnh phụ — chỉ dùng ảnh đã có của chính video. */
export function neighbours(scenes, i, k) {
  const out = [];
  for (let step = 1; out.length < k && step < scenes.length; step += 1) {
    const j = (i + step) % scenes.length;
    if (j !== i) out.push(scenes[j]);
  }
  return out;
}

/** Ảnh phụ (thumbnail) của cảnh khác trong một khung kit. */
export function thumbFrame(kind, { id, region, scene, rng, filter = "", label = "", sub = "" }) {
  const inner = `<img class="v-img" src="${escapeHtml(scene.imgSrc)}" alt=""${filter ? ` style="filter:${filter}"` : ""}>`;
  return frameHtml(kind, { id, region, inner, rng, label, sub });
}

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
