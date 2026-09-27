// Nhạc nền CC0 theo từng tài khoản (config/music/cc0_catalog.json, AGENTS.md "CC0 background music").
//
// - Catalog trong git chỉ có metadata (tên, tác giả, nguồn, giấy phép, sha256, thời lượng, mood); file mp3 tải về
//   bằng `node tools/fetch-cc0-music.mjs` vào shared/audio/cc0/ (gitignored, đổi bằng MATRIX_CC0_MUSIC_DIR).
// - Kênh có `audio.bgm_pool: [track id]` → mỗi video lấy MỘT bài trong pool, tất định theo seed (job_id).
//   File thiếu / sha256 sai → lỗi rõ ràng, KHÔNG BAO GIỜ quay về bài dùng chung của soundscape.
// - Kênh không có bgm_pool → đường cũ y hệt: shared/audio/bgm/<soundscape.defaultBgm>.mp3.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CATALOG_PATH = path.join(COMPARE_DIR, "config", "music", "cc0_catalog.json");
export const MUSIC_DIR = process.env.MATRIX_CC0_MUSIC_DIR || path.join(COMPARE_DIR, "shared", "audio", "cc0");
export const LEGACY_BGM_DIR = path.join(COMPARE_DIR, "shared", "audio", "bgm");

// Chỉ nhận giấy phép "không cần ghi công, dùng thương mại": CC0 hoặc tuyên bố public domain rõ ràng.
export const ALLOWED_LICENSES = Object.freeze({
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "PDM-1.0": "https://creativecommons.org/publicdomain/mark/1.0/",
});
export const MOODS = Object.freeze(["tense", "dark", "action", "epic", "mysterious", "dark_ambient", "documentary", "calm", "upbeat", "playful", "electronic"]);
// Video Matrix dài tối đa 90 s và BGM không lặp (computeDuckedBgmSegments dùng mediaStart = thời điểm trên timeline).
export const MIN_TRACK_SECONDS = 95;
export const TRACK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/u;

const cache = new Map();

/** Đọc catalog (cache theo đường dẫn + mtime). */
export function loadCatalog(file = CATALOG_PATH) {
  const stat = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.catalog;
  const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
  cache.set(file, { mtimeMs: stat.mtimeMs, catalog });
  return catalog;
}

/** Lỗi schema/giấy phép của catalog (rỗng = hợp lệ). */
export function catalogProblems(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== "object") return ["catalog is not an object"];
  if (!Number.isInteger(catalog.catalog_version) || catalog.catalog_version < 1) errors.push("catalog_version must be a positive integer");
  const sources = catalog.sources || {};
  if (!Array.isArray(catalog.tracks) || !catalog.tracks.length) return [...errors, "tracks must be a non-empty array"];
  const ids = new Set();
  const hashes = new Set();
  for (const [index, track] of catalog.tracks.entries()) {
    const where = `tracks[${index}] ${track?.id || ""}`.trim();
    if (!TRACK_ID_PATTERN.test(String(track?.id || ""))) errors.push(`${where}: id must match ${TRACK_ID_PATTERN}`);
    if (ids.has(track.id)) errors.push(`${where}: duplicate id`);
    ids.add(track.id);
    for (const key of ["title", "author", "source", "source_url", "license", "license_url", "license_evidence"]) {
      if (typeof track[key] !== "string" || !track[key].trim()) errors.push(`${where}: ${key} is required`);
    }
    if (!sources[track.source]) errors.push(`${where}: source ${track.source} is not described in catalog.sources`);
    if (!ALLOWED_LICENSES[track.license]) errors.push(`${where}: license ${track.license} is not CC0/public domain`);
    else if (track.license_url !== ALLOWED_LICENSES[track.license]) errors.push(`${where}: license_url must be ${ALLOWED_LICENSES[track.license]}`);
    if (!/^[0-9a-f]{64}$/u.test(String(track.sha256 || ""))) errors.push(`${where}: sha256 must be 64 hex characters`);
    else if (hashes.has(track.sha256)) errors.push(`${where}: same file as another track`);
    hashes.add(track.sha256);
    if (!Number.isInteger(track.bytes) || track.bytes <= 0) errors.push(`${where}: bytes must be a positive integer`);
    if (!(Number(track.duration_seconds) >= MIN_TRACK_SECONDS)) errors.push(`${where}: duration_seconds must be ≥ ${MIN_TRACK_SECONDS} (BGM is not looped)`);
    if (!Array.isArray(track.download_urls) || !track.download_urls.length || track.download_urls.some((url) => !/^https:\/\//u.test(url))) {
      errors.push(`${where}: download_urls must be a non-empty list of https URLs`);
    }
    if (!Array.isArray(track.moods) || !track.moods.length || track.moods.some((mood) => !MOODS.includes(mood))) {
      errors.push(`${where}: moods must be a non-empty subset of ${MOODS.join("|")}`);
    }
  }
  return errors;
}

export function trackMap(catalog = loadCatalog()) {
  return new Map(catalog.tracks.map((track) => [track.id, track]));
}

export function trackFile(track, dir = MUSIC_DIR) {
  return path.join(dir, `${track.id}.mp3`);
}

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Bài của video trong pool: tất định theo seed (job_id), video khác nhau của cùng kênh xoay trong pool. */
export function pickPoolTrack(pool, seed) {
  if (!Array.isArray(pool) || !pool.length) throw new Error("bgm_pool is empty");
  const n = Number.parseInt(crypto.createHash("sha256").update(`bgm|${seed}`).digest("hex").slice(0, 12), 16);
  return pool[n % pool.length];
}

/** Thông tin bài ghi vào manifest.audio / meta.json để công cụ similarity/fingerprint thấy được. */
export function trackRecord(track) {
  return {
    id: track.id, title: track.title, author: track.author, source: track.source, source_url: track.source_url,
    license: track.license, sha256: track.sha256,
  };
}

/**
 * Chọn file BGM cho một video.
 * - audio.bgm_pool có bài → { path, track } của bài trong pool; thiếu file / sai sha256 / id lạ → throw.
 * - không có pool → { path: shared/audio/bgm/<defaultBgm>.mp3, track: null } (đường cũ).
 */
export function resolveBgmSource({ audio, soundscape, seed, catalogPath = CATALOG_PATH, musicDir = MUSIC_DIR, legacyDir = LEGACY_BGM_DIR } = {}) {
  const pool = audio?.bgm_pool;
  if (!Array.isArray(pool) || !pool.length) {
    return { path: path.join(legacyDir, `${soundscape.defaultBgm}.mp3`), track: null };
  }
  if (!seed) throw new Error("a seed (job id) is required to pick a track from bgm_pool");
  const tracks = trackMap(loadCatalog(catalogPath));
  const unknown = pool.filter((id) => !tracks.has(id));
  if (unknown.length) throw new Error(`bgm_pool has track(s) not in ${path.basename(catalogPath)}: ${unknown.join(", ")}`);
  const track = tracks.get(pickPoolTrack(pool, seed));
  const file = trackFile(track, musicDir);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size === 0) {
    throw new Error(`assigned CC0 BGM track ${track.id} is missing: ${file} (run: node tools/fetch-cc0-music.mjs)`);
  }
  const actual = sha256File(file);
  if (actual !== track.sha256) {
    throw new Error(`assigned CC0 BGM track ${track.id} has sha256 ${actual}, catalog expects ${track.sha256}: ${file} (rerun node tools/fetch-cc0-music.mjs)`);
  }
  return { path: file, track };
}
