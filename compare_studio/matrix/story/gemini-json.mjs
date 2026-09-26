import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileTokenBucket, unlimited } from "./rate-limiter.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENV_KEYS = new Set(["GEMINI_API_KEY", "GEMINI_KEY", "GEMNINI_KEY"]);
// 408/429/5xx và lỗi mạng: thử lại có backoff. 400/401/403: sai request/khoá → thử lại vô ích.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 4;
const OUTPUT_TOKEN_BUDGET = 2048;

function loadGeminiKeyFromEnvFile() {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (ENV_KEYS.has(key) && !process.env[key]) {
      process.env[key] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

function getApiKey() {
  const existing = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GEMNINI_KEY;
  if (existing) return existing;
  loadGeminiKeyFromEnvFile();
  return process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GEMNINI_KEY;
}

export class GeminiError extends Error {
  constructor(message, { status = null, retryable = false, retryAfterMs = null, model = null } = {}) {
    super(message);
    Object.assign(this, { name: "GeminiError", status, retryable, retryAfterMs, model });
  }
}

/** Full-jitter exponential backoff: các worker không cùng thử lại một lúc. */
export function backoffMs(attempt, { baseMs = 2_000, capMs = 60_000, random = Math.random } = {}) {
  return Math.round(random() * Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1)));
}

/** Retry-After (giây hoặc HTTP-date) hoặc RetryInfo.retryDelay ("12s") trong body lỗi của Gemini. */
export function retryAfterMs(headers, bodyText, now = Date.now()) {
  const header = headers?.get?.("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  const match = String(bodyText || "").match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/u);
  return match ? Number(match[1]) * 1000 : null;
}

let sharedLimiter;
/** Hạn mức dùng chung mọi process: MATRIX_GEMINI_RPM / MATRIX_GEMINI_TPM (RPM=0 tắt limiter). */
export function defaultLimiter() {
  if (sharedLimiter) return sharedLimiter;
  const rpm = Number(process.env.MATRIX_GEMINI_RPM ?? 60);
  const tpm = Number(process.env.MATRIX_GEMINI_TPM ?? 1_000_000);
  sharedLimiter = rpm > 0 && tpm > 0
    ? new FileTokenBucket({
      statePath: process.env.MATRIX_GEMINI_RATE_FILE || path.join(REPO_ROOT, ".runtime", "gemini-rate.json"),
      rpm, tpm,
    })
    : unlimited;
  return sharedLimiter;
}

function estimateTokens(text) {
  return Math.ceil(text.length / 3) + OUTPUT_TOKEN_BUDGET;
}

function parseJsonText(payload, model) {
  const candidate = payload?.candidates?.[0];
  const blocked = payload?.promptFeedback?.blockReason || (candidate?.finishReason === "SAFETY" ? "SAFETY" : null);
  if (blocked) throw new GeminiError(`Gemini ${model} blocked the request (${blocked})`, { model });
  const text = candidate?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new GeminiError(`Gemini ${model} returned no JSON content`, { retryable: true, model });
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/u);
  try {
    return JSON.parse(fenced ? fenced[1].trim() : text);
  } catch (error) {
    throw new GeminiError(`Gemini ${model} returned invalid JSON: ${error.message}`, { retryable: true, model });
  }
}

async function callModel(model, { apiKey, prompt, temperature, timeoutMs, fetchImpl, responseSchema }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      // Khoá trong header thay vì query string để không lọt vào log/URL.
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // responseSchema (tập con OpenAPI của Gemini) ép model trả đúng cấu trúc ngay từ đầu.
        generationConfig: { responseMimeType: "application/json", temperature, ...(responseSchema ? { responseSchema } : {}) },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new GeminiError(`Gemini ${model} request failed: ${error.message}`, { retryable: true, model });
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GeminiError(`Gemini ${model} returned HTTP ${response.status}: ${body.slice(0, 200)}`, {
      status: response.status,
      retryable: RETRYABLE_STATUS.has(response.status),
      retryAfterMs: retryAfterMs(response.headers, body),
      model,
    });
  }
  return parseJsonText(await response.json(), model);
}

export async function generateGeminiJson({
  systemPrompt,
  userPrompt,
  temperature = 0.7,
  responseSchema,
  timeoutMs = 45_000,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  models,
  fetchImpl = fetch,
  limiter = defaultLimiter(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
} = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Gemini API key is not configured; provide a provider or configure GEMINI_API_KEY");
  const defaultModel = process.env.MATRIX_GEMINI_MODEL || "gemini-3.6-flash";
  const candidates = (models || [defaultModel, "gemini-3.5-flash"]).filter((m, i, arr) => m && arr.indexOf(m) === i);
  const prompt = `${systemPrompt}\n\n${userPrompt}`;
  const tokens = estimateTokens(prompt);

  let lastError = null;
  for (const model of candidates) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await limiter.acquire(tokens);
      try {
        return await callModel(model, { apiKey, prompt, temperature, timeoutMs, fetchImpl, responseSchema });
      } catch (error) {
        lastError = error;
        if (error.status === 404) break;          // model không có/đã ngừng → thử model kế tiếp
        if (error.status === 400 && responseSchema && /schema/iu.test(error.message)) {
          responseSchema = undefined;               // API không nhận schema này → gọi lại không kèm schema
          attempt -= 1;
          continue;
        }
        if (!error.retryable) throw error;        // 400/401/403/bị chặn: không thử lại, không đổi model
        const wait = Math.max(error.retryAfterMs ?? 0, backoffMs(attempt, { random }));
        if (error.status === 429) await limiter.cooldown(wait);   // mọi process cùng nghỉ
        if (attempt < maxAttempts) await sleep(wait);
      }
    }
  }
  throw lastError || new Error("Gemini generation failed across all candidate models");
}
