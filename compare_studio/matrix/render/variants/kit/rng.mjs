// PRNG có seed cho mọi biến thiên "ngẫu nhiên" của variant (lệch giấy, xoay polaroid, hạt nhiễu, rung máy).
// Không bao giờ dùng Math.random: cùng seed → cùng kết quả → render tái lập được.
import crypto from "node:crypto";

/** uint32 từ sha256 của các phần (nối bằng "|"). */
export function seedFrom(...parts) {
  return crypto.createHash("sha256").update(parts.map(String).join("|")).digest().readUInt32BE(0);
}

/** mulberry32: trả hàm () → số thực [0, 1). */
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Số thực trong [min, max), làm tròn `digits` chữ số để HTML ổn định giữa các máy. */
export function rngRange(rng, min, max, digits = 3) {
  return Number((min + (max - min) * rng()).toFixed(digits));
}

export function rngPick(rng, items) {
  if (!items.length) throw new Error("rngPick needs a non-empty list");
  return items[Math.floor(rng() * items.length)];
}
