// Giọng clone của Voice DNA (`audio.voice_clone: <id>`): CapCut/Edge đọc lời, rồi bkt_web/voice_clone.py (OpenVoice V2
// tone color converter) đổi âm sắc sang giọng đã enroll. Lỗi convert = lỗi job, không bao giờ dùng giọng gốc thay thế.
// docs/MATRIX_VARIANT_SYSTEM_V2.md mục 8.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const VOICE_CLONE_VERSION = 1; // = CLONE_VERSION trong bkt_web/voice_clone.py
export const CLONE_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/u;

export function cloneRegistryPath() {
  const dir = process.env.TOKMATRIX_VOICE_CLONE_DIR || path.join(REPO_ROOT, "bkt_web", "storage", "voice_clones");
  return path.join(dir, "registry.json");
}

export function loadCloneRegistry(file = cloneRegistryPath()) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).voices || {};
  } catch {
    return {};
  }
}

/** Lỗi của `audio.voice_clone` với ngôn ngữ kênh; registry chỉ có trên máy đã enroll (VPS), nên thiếu registry chỉ kiểm cú pháp. */
export function cloneProblems(id, lang, registry = loadCloneRegistry()) {
  if (!id || id === "none") return [];
  if (!CLONE_ID_RE.test(String(id))) return [`audio.voice_clone "${id}" is not a valid clone id`];
  if (!Object.keys(registry).length) return [];
  const entry = registry[id];
  if (!entry) return [`audio.voice_clone "${id}" is not enrolled (python3 -m bkt_web.voice_clone list)`];
  if (lang && entry.lang && entry.lang !== lang) return [`audio.voice_clone "${id}" is enrolled for ${entry.lang}, channel publishes ${lang}`];
  if (!["owner", "licensed"].includes(entry.consent)) return [`audio.voice_clone "${id}" has no recorded consent`];
  return [];
}

/** Khoá cache: chỉ thêm khi có clone → khoá cũ giữ nguyên. Có sha của embedding: enroll lại thì tổng hợp lại. */
export function cloneKeyPart(id, registry = loadCloneRegistry()) {
  if (!id || id === "none") return {};
  const entry = registry[id];
  if (!entry) throw new Error(`voice clone ${id} is not enrolled on this machine`);
  return { clone: id, clone_version: VOICE_CLONE_VERSION, clone_se: entry.se_sha256 };
}

export async function applyVoiceClone(sourcePath, outputPath, id) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("python3", ["-m", "bkt_web.voice_clone", "convert", "--id", id, "--src", sourcePath, "--out", outputPath], {
      cwd: REPO_ROOT, timeout: 300_000, maxBuffer: 4 << 20,
    }));
  } catch (error) {
    const line = String(error.stdout || "").trim().split("\n").pop();
    let reason = error.message;
    try { reason = JSON.parse(line).error || reason; } catch { /* không phải JSON */ }
    throw new Error(`voice clone ${id} failed: ${reason}`);
  }
  const result = JSON.parse(stdout.trim().split("\n").pop());
  if (!result.success) throw new Error(`voice clone ${id} failed: ${result.error}`);
  return result;
}
