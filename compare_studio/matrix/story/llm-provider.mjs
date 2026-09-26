import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeBridgeProvider } from "./bridge-provider.mjs";
import { generateGeminiJson } from "./gemini-json.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** MATRIX_LLM_PROVIDER lấy từ biến môi trường, hoặc compare_studio/.env. */
export function configuredProviderName() {
  if (process.env.MATRIX_LLM_PROVIDER) return process.env.MATRIX_LLM_PROVIDER.trim().toLowerCase();
  try {
    const match = fs.readFileSync(path.join(COMPARE_DIR, ".env"), "utf8").match(/^MATRIX_LLM_PROVIDER=(.+)$/mu);
    if (match) return match[1].trim().replace(/^['"]|['"]$/gu, "").toLowerCase();
  } catch { /* không có .env */ }
  return "gemini";
}

/**
 * gemini — gọi Gemini API (mặc định);
 * bridge — giao cho agent Antigravity qua Hàng Đợi Kịch Bản (không tốn quota API);
 * auto   — Gemini trước, hết quota/lỗi tạm thời thì chuyển sang bridge.
 */
export function selectProvider(name = configuredProviderName(), { gemini = generateGeminiJson, bridge = makeBridgeProvider() } = {}) {
  if (name === "bridge") return bridge;
  if (name === "auto") {
    return async (request) => {
      try {
        return await gemini({ ...request, maxAttempts: 2 });
      } catch (error) {
        if (!error?.retryable && error?.status !== 429) throw error;
        return bridge(request);
      }
    };
  }
  if (name !== "gemini") throw new Error(`MATRIX_LLM_PROVIDER không hợp lệ: ${name} (gemini | bridge | auto)`);
  return gemini;
}

let selected;
/** Provider mặc định của angle/kịch bản, chọn một lần theo cấu hình. */
export async function defaultLlmProvider(request) {
  selected ||= selectProvider();
  return selected(request);
}
