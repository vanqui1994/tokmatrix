// Clip stock (Pexels/Pixabay) cho cảnh của variant "stock-first" (assetProfile.stockVideo, docs/MATRIX_VARIANT_SYSTEM_V2.md
// mục 9.3: wildlife savanna/deep-ocean/trail-cam/nature-doc/migration/field-guide). Chỉ chạy khi TOKMATRIX_STOCK_VIDEO=1.
// Tìm + tải + ledger sở hữu (một clip chỉ thuộc MỘT acc TikTok, kể cả cùng footage ở provider khác, mỗi lần dùng một đoạn
// chưa dùng) đều nằm ở Python `python3 -m bkt_web.stock_video scene`; file này chỉ dựng câu tìm tiếng Anh, gọi CLI và cắt
// đoạn đã nhận thành MP4 câm 1080×1920 + ảnh poster (khung cuối của đoạn) để render. Không bao giờ lấy từ TikTok/YouTube.
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const STOCK_SOURCE = "stock_video";
export const STOCK_FPS = 24;
const MIN_SEGMENT = 5;
const MAX_SEGMENT = 20;

export function stockVideoEnabled(env = process.env) {
  return ["1", "true", "on", "yes"].includes(String(env.TOKMATRIX_STOCK_VIDEO || "0").trim().toLowerCase());
}

// --- Câu tìm (tiếng Anh) ------------------------------------------------------------------------------------------
const STOP = new Set(("a an the of in on at to for from by with and or but is are was were be been being this that these those "
  + "it its as into over under up down out about after before while during than then so very just only also too its their "
  + "our your his her them they we you i he she who whom which what when where why how not no yes can could will would "
  + "should may might must do does did done has have had show shows showing shot close closeup view scene footage camera "
  + "image photo picture frame visual cinematic dramatic documentary style shown seen real realistic slow motion wide").split(/\s+/u));
// Từ chức năng tiếng Đức/Pháp/Tây Ban Nha/Việt: visual_intent viết bằng ngôn ngữ khác thì không dùng làm câu tìm.
const NON_ENGLISH = /\b(der|die|das|und|mit|ein|eine|nicht|ist|auf|le|la|les|des|une|est|dans|avec|el|los|las|con|una|por|của|và|một)\b/iu;

function englishText(text) {
  const value = String(text || "").trim();
  return Boolean(value) && /^[\x20-\x7E]+$/u.test(value) && !NON_ENGLISH.test(value);
}

function keywords(text, max) {
  const words = String(text || "").toLowerCase().replace(/[^a-z0-9\s-]/gu, " ").split(/\s+/u)
    .filter((word) => word.length > 2 && !STOP.has(word) && !/^\d+$/u.test(word));
  return [...new Set(words)].slice(0, max).join(" ");
}

/** 1–3 câu tìm tiếng Anh cho cảnh: ý hình của cảnh (nếu là tiếng Anh), rồi chủ đề (topic tiếng Anh), rồi tên loài. */
export function stockQueries({ scene, manifest } = {}) {
  const out = [];
  if (englishText(scene?.visual_intent)) out.push(keywords(scene.visual_intent, 5));
  const topic = manifest?.topic?.title || manifest?.topic;
  if (englishText(topic)) {
    out.push(keywords(topic, 4));
    out.push(keywords(topic, 2));
  }
  const name = manifest?.script?.engine_extras?.data?.common_name;
  if (englishText(name)) out.push(keywords(name, 3));
  return [...new Set(out.filter((query) => query.length >= 3))].slice(0, 3);
}

/** Độ dài đoạn clip xin cho cảnh: ước lượng lời đọc + đệm (cửa sổ cảnh thật đo từ TTS sau bước này). */
export function stockSegmentLength(scene) {
  const estimate = Number(scene?.estimated_duration_seconds ?? scene?.duration_seconds);
  const base = Number.isFinite(estimate) && estimate > 0 ? estimate * 1.3 + 1.5 : 7;
  return Math.min(MAX_SEGMENT, Math.max(MIN_SEGMENT, Math.ceil(base)));
}

// --- Gọi Python ---------------------------------------------------------------------------------------------------
function pythonBin(env = process.env) {
  if (env.TOKMATRIX_PYTHON) return env.TOKMATRIX_PYTHON;
  const venv = path.join(REPO_ROOT, "venv/bin/python");
  return existsSync(venv) ? venv : "python3";
}

/**
 * Hỏi `bkt_web.stock_video scene` một clip cho cảnh. Trả `{ ok: true, clip }` (clip thô đã tải vào `out`, đã ghi ledger cho
 * acc của kênh) hoặc `{ ok: false, reason }`. Lỗi tiến trình → `{ ok: false, reason: "error: …" }` (cảnh dùng ảnh AI).
 */
export async function requestStockClip({ channelId, queries, out, minDuration, segmentLength, exclude = [], runner = execFileAsync, env = process.env }) {
  const args = ["-m", "bkt_web.stock_video", "scene", "--channel", String(channelId || ""), "--out", out,
    "--min-duration", String(minDuration), "--segment-length", String(segmentLength)];
  for (const query of queries) args.push("--query", query);
  for (const key of exclude) args.push("--exclude", key);
  try {
    const { stdout } = await runner(pythonBin(env), args, {
      cwd: REPO_ROOT, timeout: 600_000, maxBuffer: 4 << 20,
      env: { ...env, PYTHONPATH: [REPO_ROOT, env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
    });
    const line = String(stdout || "").trim().split(/\r?\n/u).filter(Boolean).at(-1) || "{}";
    const result = JSON.parse(line);
    if (result.ok && result.clip) return { ok: true, clip: result.clip };
    return { ok: false, reason: result.reason || "no_clip" };
  } catch (error) {
    return { ok: false, reason: `error: ${String(error.message || error).split("\n")[0].slice(0, 200)}` };
  }
}

// --- Cắt đoạn + poster --------------------------------------------------------------------------------------------
async function probeDuration(file) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  const value = Number(String(stdout).trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`ffprobe found no duration in ${file}`);
  return Number(value.toFixed(3));
}

/**
 * Cắt đúng đoạn ledger đã cấp ([start, end] của clip gốc) thành MP4 H.264 câm 1080×1920 (cover crop), và poster JPG là khung
 * cuối của đoạn (hiện dưới video: nếu cảnh dài hơn đoạn thì hình dừng ở khung cuối, không đen).
 */
export async function materializeStockClip({ raw, segment, clipPath, posterPath }) {
  const [start, end] = segment.map(Number);
  const length = Number((end - start).toFixed(3));
  if (!(length > 0)) throw new Error(`invalid stock segment ${segment}`);
  await fs.mkdir(path.dirname(clipPath), { recursive: true });
  const vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p";
  await execFileAsync("ffmpeg", ["-v", "error", "-y", "-ss", String(start), "-i", raw, "-t", String(length), "-an", "-sn", "-dn",
    "-vf", vf, "-r", String(STOCK_FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "1",
    "-movflags", "+faststart", "-map_metadata", "-1", clipPath]);
  await execFileAsync("ffmpeg", ["-v", "error", "-y", "-sseof", "-0.25", "-i", clipPath, "-frames:v", "1", "-q:v", "2", posterPath]);
  return { duration: await probeDuration(clipPath) };
}

export async function sha256File(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

/**
 * Clip cho một cảnh: gọi CLI, cắt đoạn, xoá bản thô. Trả metadata ghi vào scene.stock hoặc `{ miss: reason }`.
 * `stockProvider` / `materialize` được thay trong test (không mạng, không ffmpeg).
 */
export async function fetchSceneStock({
  scene, manifest, channelId, sceneDir, projectDir, exclude = [],
  stockProvider = requestStockClip, materialize = materializeStockClip,
}) {
  const queries = stockQueries({ scene, manifest });
  if (!queries.length) return { miss: "no_english_query" };
  const segmentLength = stockSegmentLength(scene);
  await fs.mkdir(sceneDir, { recursive: true });
  const raw = path.join(sceneDir, "stock-raw.mp4");
  const response = await stockProvider({ channelId, queries, out: raw, minDuration: segmentLength, segmentLength, exclude });
  if (!response?.ok) return { miss: response?.reason || "no_clip", queries };
  const clip = response.clip;
  const clipPath = path.join(sceneDir, "stock.mp4");
  const posterPath = path.join(sceneDir, "stock-poster.jpg");
  const { duration } = await materialize({ raw: clip.path || raw, segment: clip.segment, clipPath, posterPath });
  await fs.rm(clip.path || raw, { force: true });
  return {
    stock: {
      provider: clip.provider, provider_clip_id: String(clip.provider_clip_id), canonical_url: clip.canonical_url || "",
      license: clip.license || "", author: clip.author || "", source_sha256: clip.sha256 || "",
      segment: clip.segment, source_duration: clip.clip_duration ?? clip.duration ?? null, query: clip.query || queries[0],
      account: clip.account ?? null, duration,
      clip_path: path.relative(projectDir, clipPath), file_sha256: await sha256File(clipPath),
      poster_path: path.relative(projectDir, posterPath),
    },
  };
}
