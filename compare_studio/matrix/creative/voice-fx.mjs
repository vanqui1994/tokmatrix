// Hiệu ứng giọng của Voice DNA (`audio.voice_fx`): chuỗi lọc ffmpeg CỐ ĐỊNH, không có nhiễu ngẫu nhiên → tất định.
// Đổi chuỗi lọc = tăng VOICE_FX_VERSION (khoá cache audio có fx_version, nên file cũ tự được tổng hợp lại).
// docs/MATRIX_VARIANT_SYSTEM_V2.md mục 8.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const VOICE_FX_VERSION = 1;

export const VOICE_FX = Object.freeze({
  none: null,
  // Rùng rợn: trầm hơn ~2 bán cung (giữ tốc độ), vang phòng đá ngắn, cắt tần cao cho tối giọng.
  creepy: "aresample=44100,asetrate=44100*0.89,aresample=44100,atempo=1.1236,aecho=0.8:0.7:60|120:0.28|0.16,lowpass=f=5200,acompressor=threshold=-20dB:ratio=3",
  // Thì thầm: bỏ trầm, nén mạnh, nhẹ tiếng; không thêm nhiễu hơi thở (nhiễu phải có seed — không cần ở đây).
  whisper: "highpass=f=320,lowpass=f=7000,acompressor=threshold=-26dB:ratio=6:attack=5:release=80,volume=0.9",
  // Bộ đàm/radio: dải thoại hẹp + nén + hơi méo.
  radio: "highpass=f=420,lowpass=f=3300,acompressor=threshold=-18dB:ratio=6,volume=1.35,alimiter=limit=0.9",
});

export function isVoiceFx(value) {
  return Object.prototype.hasOwnProperty.call(VOICE_FX, value);
}

/** Thêm fx vào khoá cache CHỈ khi fx ≠ none, để khoá cũ (không fx) giữ nguyên, không vô hiệu cache hàng loạt. */
export function fxKeyPart(fx) {
  const name = fx || "none";
  if (!isVoiceFx(name)) throw new Error(`unknown voice_fx ${fx}`);
  return name === "none" ? {} : { fx: name, fx_version: VOICE_FX_VERSION };
}

/** Áp fx lên một file giọng (mp3 → mp3). fx "none" không được gọi hàm này. */
export async function applyVoiceFx(sourcePath, outputPath, fx) {
  const filter = VOICE_FX[fx];
  if (!filter) throw new Error(`voice_fx ${fx} has no filter`);
  await execFileAsync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", sourcePath, "-vn", "-af", filter, "-ar", "44100",
    "-codec:a", "libmp3lame", "-q:a", "2", "-map_metadata", "-1", outputPath,
  ]);
}
