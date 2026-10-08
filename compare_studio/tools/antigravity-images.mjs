#!/usr/bin/env node
// Ảnh AI cho MỌI thể loại video — chỉ qua hàng đợi Antigravity của bkt_web.
//
// Luồng: POST /api/ai-images/queue (engine=antigravity) → bridge bkt_web đẩy task vào
// inbox → agent Antigravity sinh ảnh vào outbox → bridge nhập vào Thư viện và đóng task →
// module này tải ảnh về đúng đường dẫn trong video.
//
// Không có dự phòng Pollinations. Khi Antigravity hết quota hoặc task chờ quá lâu, bkt_web
// (cf_image_fallback) có thể vẽ task bằng ImageRouter (model "imagerouter:<model>", source
// "imagerouter") hoặc Cloudflare Worker (model "cf-worker", source "cf_worker"), không nhận là Antigravity. Quá thời hạn chờ thì ảnh còn thiếu được thay bằng nền
// tối TẠM (chỉ để xem trước) và đánh dấu "đang chờ" trong videos/<slug>/images.json.
// Khi còn ảnh tạm, bkt_web khoá Render và Đăng. Chạy lại
//   node tools/antigravity-images.mjs <slug> [--timeout 45]
// sẽ lấy tiếp các ảnh Antigravity đã xong mà không tạo task trùng.
//
// Mỗi thể loại chỉ khai báo danh sách ảnh: { key, prompt, negative?, aspect, dest }.

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

export const API_BASE = (process.env.TOKMATRIX_API || `http://127.0.0.1:${process.env.TOKMATRIX_PORT || 8080}`).replace(/\/$/, "");
export const STATE_FILE = "images.json";
export const DEFAULT_NEGATIVE = "text, letters, words, watermark, logo, signature, frame border, blurry, low quality";
const POLL_MS = Number(process.env.ANTIGRAVITY_POLL_MS || 15000);
const MAX_ATTEMPTS = 3; // lần đầu + tự xin lại tối đa 2 lần khi task báo lỗi
const PLACEHOLDER_SIZE = { "1:1": "1024x1024", "9:16": "1080x1920", "16:9": "1920x1080", "4:3": "1024x768", "3:4": "768x1024" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Ảnh AI thật từ hàng đợi: Antigravity, hoặc dự phòng ImageRouter / Cloudflare Worker khi Antigravity hết quota.
export const AI_IMAGE_SOURCES = ["antigravity", "imagerouter", "cf_worker", "gemini_web"];
const SOURCE_LABELS = { antigravity: "Antigravity", imagerouter: "dự phòng ImageRouter", cf_worker: "dự phòng Cloudflare Worker", gemini_web: "dự phòng Gemini web" };
// Nguồn ảnh dùng được để render: ảnh AI ở trên, ảnh cũ đang chờ thay, ảnh người dùng tự tải lên.
export const READY_SOURCES = [...AI_IMAGE_SOURCES, "replacing", "manual"];

/** Nguồn thật của một task đã xong trong hàng đợi bkt_web. */
export const taskImageSource = (task) => {
  const model = String(task?.model || "");
  if (model === "cf-worker") return "cf_worker";
  if (model === "gemini-web") return "gemini_web";
  if (model.startsWith("imagerouter:")) return "imagerouter";
  return "antigravity";
};

// ---------------------------------------------------------------------------
// Trạng thái ảnh của một video
// ---------------------------------------------------------------------------
export function readImageState(dir) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), "utf8"));
    return data && typeof data.items === "object" ? data : { version: 1, items: {} };
  } catch {
    return { version: 1, items: {} };
  }
}

export function writeImageState(dir, state) {
  const file = path.join(dir, STATE_FILE);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, ...state, updatedAt: new Date().toISOString() }, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * Ảnh khiến video chưa render/đăng được: đang chờ lần đầu, chỉ có nền tạm, hoặc mất file.
 * Ảnh "replacing" (đang thay bằng ảnh mới) không tính — ảnh Antigravity cũ vẫn dùng được.
 */
export function pendingImages(dir) {
  const { items } = readImageState(dir);
  return Object.entries(items)
    .filter(([, it]) => !READY_SOURCES.includes(it.source) || !fs.existsSync(path.join(dir, it.dest)))
    .map(([key, it]) => ({ key, ...it }));
}

// ---------------------------------------------------------------------------
// Gọi bkt_web
// ---------------------------------------------------------------------------
async function api(method, url, body) {
  const resp = await fetch(`${API_BASE}${url}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(method === "GET" ? 20000 : 60000),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.detail || data?.error || `HTTP ${resp.status} ${url}`);
  return data;
}

async function download(url, dest) {
  const resp = await fetch(/^https?:/.test(url) ? url : `${API_BASE}${url}`, { signal: AbortSignal.timeout(120000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} khi tải ảnh`);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length < 2000) throw new Error("ảnh tải về quá nhỏ");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

/** Nền tối tạm đúng tỉ lệ — chỉ để xem trước, không bao giờ được render/đăng. */
export async function writePlaceholder(dest, aspect = "1:1") {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const size = PLACEHOLDER_SIZE[aspect] || PLACEHOLDER_SIZE["1:1"];
  await execFileAsync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=0x15161d:s=${size}`,
    "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", dest,
  ]);
}

async function fetchQueue() {
  const q = await api("GET", "/api/ai-images/queue?engine=antigravity");
  return new Map((q.queue || []).map((t) => [t.id, t]));
}

// ---------------------------------------------------------------------------
// API chính
// ---------------------------------------------------------------------------
/**
 * Xin (hoặc xin tiếp) ảnh Antigravity cho các item rồi chờ tối đa timeoutMin phút.
 *
 * items: [{ key, prompt, negative?, aspect, dest }]  (dest tương đối với dir)
 * Item mới được ghi vào images.json; item đã có (theo key) giữ taskId cũ, chỉ cập nhật
 * prompt khi prompt thay đổi (lúc đó xin ảnh mới).
 * Trả về { ready, pending } — danh sách key.
 */
export async function ensureAntigravityImages({ dir, slug, items = null, timeoutMin = 45, log = console.log, label = "" }) {
  const state = readImageState(dir);
  for (const it of items || []) {
    const prev = state.items[it.key];
    if (prev && prev.prompt === it.prompt && prev.dest === it.dest) continue;
    state.items[it.key] = {
      prompt: it.prompt, negative: it.negative || DEFAULT_NEGATIVE, aspect: it.aspect || "1:1", dest: it.dest,
      source: prev && prev.prompt === it.prompt ? prev.source : "pending", taskId: null, attempts: 0, error: "",
    };
  }
  writeImageState(dir, state);
  const entries = Object.entries(state.items);
  if (!entries.length) return { ready: [], pending: [] };

  const done = ([, it]) => [...AI_IMAGE_SOURCES, "manual"].includes(it.source) && fs.existsSync(path.join(dir, it.dest));
  let byId;
  try {
    byId = await fetchQueue();
  } catch (err) {
    throw new Error(`Không kết nối được hàng đợi ảnh bkt_web (${API_BASE}): ${err.message}`);
  }

  // 1. Xếp task cho ảnh chưa có (giữ task cũ nếu còn sống).
  for (const entry of entries) {
    const [key, it] = entry;
    if (done(entry)) continue;
    const task = it.taskId && byId.get(it.taskId);
    if (task && task.status !== "failed") continue;
    if (task && task.status === "failed" && it.attempts >= MAX_ATTEMPTS) continue;
    const res = await api("POST", "/api/ai-images/queue", {
      prompt: it.prompt,
      negative_prompt: it.negative || DEFAULT_NEGATIVE,
      aspect_ratio: it.aspect || "1:1",
      engine: "antigravity",
      notes: `${label || "Video"} · ${slug} · ${key}`,
    });
    it.taskId = res.task_ids?.[0] || null;
    it.attempts = (it.attempts || 0) + 1;
    it.error = "";
    if (it.source !== "placeholder") it.source = "pending";
    log(`  [IMG] ${key}: đã gửi Antigravity (task ${it.taskId}${it.attempts > 1 ? `, lần ${it.attempts}` : ""})`);
    writeImageState(dir, state);
  }

  // 2. Chờ bridge trả ảnh.
  const deadline = Date.now() + Math.max(0, timeoutMin) * 60000;
  let lastReport = 0;
  while (true) {
    try {
      byId = await fetchQueue();
    } catch {
      byId = null;
    }
    if (byId) {
      for (const entry of entries) {
        const [key, it] = entry;
        if (done(entry) || !it.taskId) continue;
        const task = byId.get(it.taskId);
        if (task?.status === "completed" && task.image_url) {
          try {
            await download(task.image_url, path.join(dir, it.dest));
            it.source = taskImageSource(task);
            it.imageFile = task.image_filename;
            it.error = "";
            log(`  ✓ ${key}: ảnh ${SOURCE_LABELS[it.source] || it.source} đã về`);
          } catch (err) {
            log(`  ⚠ ${key}: tải ảnh lỗi (${err.message}), thử lại lượt sau`);
          }
        } else if (task?.status === "failed" || !task) {
          it.error = task?.error_message || "task không còn trong hàng đợi";
          if (it.attempts < MAX_ATTEMPTS && it.prompt) {
            const res = await api("POST", "/api/ai-images/queue", {
              prompt: it.prompt, negative_prompt: it.negative || DEFAULT_NEGATIVE,
              aspect_ratio: it.aspect || "1:1", engine: "antigravity", notes: `${label || "Video"} · ${slug} · ${key} (xin lại)`,
            }).catch(() => null);
            if (res?.task_ids?.[0]) {
              it.taskId = res.task_ids[0];
              it.attempts += 1;
              log(`  ↻ ${key}: Antigravity lỗi (${it.error}) — xin lại lần ${it.attempts}`);
            }
          }
        }
      }
      writeImageState(dir, state);
    }
    const waiting = entries.filter((e) => !done(e) && e[1].taskId && !(e[1].error && e[1].attempts >= MAX_ATTEMPTS));
    if (!waiting.length || Date.now() >= deadline) break;
    if (Date.now() - lastReport > 60000) {
      const ready = entries.filter(done).length;
      log(`  … Antigravity: ${ready}/${entries.length} ảnh xong, đang chờ ${waiting.length} (còn ${Math.ceil((deadline - Date.now()) / 60000)} phút)`);
      lastReport = Date.now();
    }
    await sleep(POLL_MS);
  }

  // 3. Ảnh còn thiếu: nền tối tạm, đánh dấu đang chờ — KHÔNG thay bằng nguồn ảnh khác.
  for (const entry of entries) {
    const [key, it] = entry;
    if (done(entry)) continue;
    const dest = path.join(dir, it.dest);
    if (it.source === "replacing" && fs.existsSync(dest)) {
      log(`  ⏳ ${key}: ảnh mới chưa về — vẫn dùng ảnh Antigravity cũ`);
      continue;
    }
    if (!fs.existsSync(dest)) await writePlaceholder(dest, it.aspect);
    if (!AI_IMAGE_SOURCES.includes(it.source)) it.source = "placeholder";
    const why = it.error && it.attempts >= MAX_ATTEMPTS ? `Antigravity lỗi ${it.attempts} lần: ${it.error}` : "Antigravity chưa trả ảnh";
    log(`  ⏳ ${key}: ${why} — tạm nền tối, video chưa render/đăng được`);
  }
  writeImageState(dir, state);

  const ready = entries.filter(done).map(([k]) => k);
  const pending = entries.filter((e) => !done(e)).map(([k]) => k);
  // Ảnh Antigravity đã lỗi MAX_ATTEMPTS lần: hàng đợi sẽ không tự xin lại nữa (variant dùng chuỗi fallback của nó).
  const exhausted = entries.filter((e) => !done(e) && e[1].error && e[1].attempts >= MAX_ATTEMPTS).map(([k]) => k);
  log(`  Ảnh Antigravity: ${ready.length}/${entries.length} xong${pending.length ? `, còn chờ ${pending.length}: ${pending.join(", ")}` : ""}`);
  if (pending.length) log(`  ↻ Bấm "🎨 Ảnh Antigravity" trong Studio (hoặc chạy node tools/antigravity-images.mjs ${slug}) để lấy tiếp.`);
  return { ready, pending, exhausted };
}

/** Xin lại MỘT ảnh với prompt mới (nút "Đổi ảnh → AI" trong Studio). Không chờ. */
export async function requestReplacement({ dir, slug, key, prompt, aspect, dest, log = console.log }) {
  const state = readImageState(dir);
  const prev = state.items[key] || {};
  const res = await api("POST", "/api/ai-images/queue", {
    prompt, negative_prompt: prev.negative || DEFAULT_NEGATIVE, aspect_ratio: aspect || prev.aspect || "1:1",
    engine: "antigravity", notes: `Đổi ảnh · ${slug} · ${key}`,
  });
  state.items[key] = {
    ...prev, prompt, aspect: aspect || prev.aspect || "1:1", dest: dest || prev.dest,
    negative: prev.negative || DEFAULT_NEGATIVE, taskId: res.task_ids?.[0] || null, attempts: 1, error: "",
    // Ảnh cũ vẫn dùng được cho tới khi ảnh mới về.
    source: AI_IMAGE_SOURCES.includes(prev.source) ? "replacing" : "pending",
  };
  writeImageState(dir, state);
  log(`  [IMG] ${key}: đã gửi Antigravity (task ${state.items[key].taskId})`);
  return state.items[key];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const slug = argv.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  const opt = (name, dflt) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : dflt);
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error("Dùng: node tools/antigravity-images.mjs <slug> [--timeout 45]");
    process.exit(1);
  }
  const dir = path.join(REPO_ROOT, "videos", slug);
  if (!fs.existsSync(path.join(dir, STATE_FILE))) {
    console.log(`${slug}: không có ảnh Antigravity nào cần lấy.`);
    process.exit(0);
  }
  ensureAntigravityImages({ dir, slug, timeoutMin: Number(opt("timeout", 45)), label: "Lấy tiếp ảnh" })
    // Còn ảnh chờ không phải lỗi của tác vụ: bước render phía bkt_web tự khoá khi còn ảnh tạm.
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    });
}
