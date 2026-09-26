import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Số render được chạy cùng lúc trên cả máy: MATRIX_RENDER_SLOTS, mặc định nửa số CPU (tối thiểu 1). */
export function renderSlotCount() {
  const configured = Number(process.env.MATRIX_RENDER_SLOTS);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return Math.max(1, Math.floor(os.cpus().length / 2));
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";  // tiến trình còn sống nhưng thuộc user khác
  }
}

function tryTake(file) {
  try {
    const fd = fs.openSync(file, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  // Slot của tiến trình đã chết (bị kill khi restart) → gỡ rồi thử lại một lần.
  const owner = Number(fs.readFileSync(file, "utf8").trim() || 0);
  if (!alive(owner)) {
    fs.rmSync(file, { force: true });
    return tryTake(file);
  }
  return false;
}

/**
 * Chạy `task` khi giữ được một slot render dùng chung cho mọi batch-matrix trên máy.
 *
 * Nhiều batch × nhiều worker có thể cùng tới bước render; không giới hạn thì Chrome + ffmpeg chồng
 * nhau làm máy quá tải và mọi video đều chậm. Các bước khác (kịch bản, ảnh, TTS) không bị giới hạn.
 */
export async function withRenderSlot(task, {
  dir = process.env.MATRIX_RENDER_SLOT_DIR || path.join(COMPARE_DIR, ".runtime", "render-slots"),
  slots = renderSlotCount(),
  pollMs = 5_000,
  sleep = sleepMs,
  onWait = () => {},
} = {}) {
  fs.mkdirSync(dir, { recursive: true });
  let file = null;
  for (let waited = 0; !file; waited += 1) {
    for (let index = 0; index < slots && !file; index += 1) {
      const candidate = path.join(dir, `slot-${index}.lock`);
      if (tryTake(candidate)) file = candidate;
    }
    if (!file) {
      if (waited === 0) onWait();
      await sleep(pollMs + Math.floor(Math.random() * 1000));
    }
  }
  try {
    return await task();
  } finally {
    try {
      if (Number(fs.readFileSync(file, "utf8").trim()) === process.pid) fs.rmSync(file, { force: true });
    } catch { /* đã bị gỡ */ }
  }
}
