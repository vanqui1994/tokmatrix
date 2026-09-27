// Cache ảnh AI theo ACCOUNT (scope ACCOUNT, docs/MATRIX_VARIANT_SYSTEM_V2.md mục 9.1; PLAN_VARIANT_V2_COMPLETION WS-D2).
// Ảnh Antigravity đã về của một kênh variant được giữ lại trong thư mục RIÊNG của kênh đó; bước fallback
// `reuse_account_cache` chỉ tìm trong thư mục của chính kênh → ảnh không bao giờ sang acc khác (asset ledger vẫn chặn
// ảnh trùng giữa các acc khi đăng). Chỉ dùng lại khi cảnh cùng chủ thể (≥ 2 từ nội dung chung với cảnh cũ).
//
// Tắt bằng MATRIX_ACCOUNT_IMAGE_CACHE=0.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_CACHE_ROOT = path.join(COMPARE_DIR, ".runtime", "account-image-cache");
const MIN_SHARED_WORDS = 2;
const MAX_ENTRIES = 400; // mỗi kênh; cũ nhất bị bỏ khỏi index (file cũng xoá)
const STOPWORDS = new Set(("a an the of in on at to for from with and or but by as is are was were be been this that these those " +
  "it its into over under near far very more most less few many much some any each every one two three shot view image photo " +
  "close wide detail documentary scene showing shows seen dark light old new").split(" "));

export function cacheEnabled(env = process.env) {
  return env.MATRIX_ACCOUNT_IMAGE_CACHE !== "0";
}

/** Từ nội dung (chữ thường, bỏ từ vô nghĩa, ≥ 3 ký tự) của mô tả cảnh. */
export function subjectWords(text) {
  return [...new Set(String(text || "").toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) || [])]
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .sort();
}

function channelDir(root, channelId) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(channelId || "")) throw new Error(`unsafe channel id for account cache: ${channelId}`);
  return path.join(root, channelId);
}

async function readIndex(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, "index.json"), "utf8"));
  } catch {
    return { version: 1, entries: [] };
  }
}

async function fileSha(filePath) {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

/** Giữ một ảnh AI đã về cho kênh. Trả sha256 của ảnh. */
export async function rememberImage({ channelId, sceneText, filePath, source, root = DEFAULT_CACHE_ROOT }) {
  const dir = channelDir(root, channelId);
  await fs.mkdir(dir, { recursive: true });
  const sha = await fileSha(filePath);
  const index = await readIndex(dir);
  if (!index.entries.some((entry) => entry.sha256 === sha)) {
    await fs.copyFile(filePath, path.join(dir, `${sha}${path.extname(filePath) || ".png"}`));
    index.entries.push({ sha256: sha, file: `${sha}${path.extname(filePath) || ".png"}`, words: subjectWords(sceneText), source });
    while (index.entries.length > MAX_ENTRIES) {
      const old = index.entries.shift();
      await fs.rm(path.join(dir, old.file), { force: true });
    }
    await fs.writeFile(path.join(dir, "index.json"), `${JSON.stringify(index, null, 1)}\n`);
  }
  return sha;
}

/**
 * Ảnh cùng chủ thể trong cache của CHÍNH kênh này, hoặc null. Chọn tất định: nhiều từ chung nhất, rồi sha nhỏ nhất.
 * `exclude` = sha256 đã dùng trong video này (không lặp một ảnh hai lần trong một video).
 */
export async function findImage({ channelId, sceneText, exclude = new Set(), root = DEFAULT_CACHE_ROOT }) {
  const dir = channelDir(root, channelId);
  const words = new Set(subjectWords(sceneText));
  const index = await readIndex(dir);
  const scored = index.entries
    .filter((entry) => !exclude.has(entry.sha256))
    .map((entry) => ({ entry, shared: entry.words.filter((word) => words.has(word)).length }))
    .filter(({ shared }) => shared >= MIN_SHARED_WORDS)
    .sort((a, b) => b.shared - a.shared || a.entry.sha256.localeCompare(b.entry.sha256));
  for (const { entry } of scored) {
    const filePath = path.join(dir, entry.file);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat?.isFile() && stat.size > 0) return { file_path: filePath, sha256: entry.sha256, source: "account_cache" };
  }
  return null;
}
