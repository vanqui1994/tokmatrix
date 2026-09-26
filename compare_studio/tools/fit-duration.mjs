#!/usr/bin/env node
// Make a video land on a target duration.
//
//   node tools/fit-duration.mjs <slug> <seconds> [--tolerance 0.3] [--max-rounds 3] [--dry]
//
// The only legal lever is TTS speed. DESIGN.md forbids stretching the gaps to
// pad length (it breaks the fast-cut pacing), and rewriting the script is a
// content decision, not something a tool should do on its own. So:
//
//   1. total = LEAD_IN + sum(speech) + sum(gaps) + OUTRO_HOLD
//   2. gaps / lead-in / outro are fixed, so the speech budget is
//      target - overhead
//   3. speech scales roughly inversely with speaking rate, so
//      newSpeed = currentSpeed * (currentSpeech / speechBudget)
//   4. regenerate the VO at that speed, retime, measure, repeat if still off
//
// TTS rate is not perfectly linear, hence the measure-and-correct loop.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeTiming, gapsFor, readDurations, retime } from "./retime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const LEAD_IN = 0.55;
const OUTRO_HOLD = 1.3;
// Outside this range Edge TTS starts to sound wrong: sped-up gabble or a drawl.
const SPEED_MIN = 0.85;
const SPEED_MAX = 1.5;

const readSpeed = (dir) => {
  const src = fs.readFileSync(path.join(dir, "scripts", "generate-vo.mjs"), "utf8");
  return Number(src.match(/process\.env\.TTS_SPEED \|\| ([\d.]+)/)?.[1] ?? 1.1);
};

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "inherit", "inherit"] });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} thoát với mã ${code}`))));
  });
}

export async function fitDuration(slug, target, { tolerance = 0.3, maxRounds = 3, dry = false, log = console.log } = {}) {
  const dir = path.join(REPO_ROOT, "videos", slug);
  if (!fs.existsSync(dir)) throw new Error(`không có video '${slug}'`);

  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  let durations = readDurations(dir);
  const gaps = gapsFor(durations.length, html);
  const overhead = LEAD_IN + gaps.reduce((a, b) => a + b, 0) + OUTRO_HOLD;
  const budget = target - overhead;

  if (budget <= 0)
    throw new Error(
      `mục tiêu ${target}s nhỏ hơn phần cố định ${overhead.toFixed(2)}s (dẫn nhập + gap + giữ hình cuối)`,
    );

  let speed = readSpeed(dir);
  let speech = durations.reduce((a, b) => a + b, 0);
  let current = computeTiming(durations, gaps).root;

  log(`[fit] ${slug}: hiện ${current}s (lời đọc ${speech.toFixed(2)}s, tốc độ ${speed})`);
  log(`[fit] mục tiêu ${target}s → ngân sách lời đọc ${budget.toFixed(2)}s (phần cố định ${overhead.toFixed(2)}s)`);

  const rounds = [];
  for (let i = 1; i <= maxRounds; i++) {
    if (Math.abs(current - target) <= tolerance) break;

    const ideal = speed * (speech / budget);
    const next = Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, ideal)) * 1000) / 1000;

    if (Math.abs(next - speed) < 0.005) {
      log(`[fit] tốc độ đã kịch trần/sàn (${next}), không siết thêm được`);
      break;
    }
    log(`[fit] vòng ${i}: tốc độ ${speed} → ${next}${next !== Math.round(ideal * 1000) / 1000 ? " (đã kẹp giới hạn)" : ""}`);
    if (dry) {
      // projected, since a dry run never regenerates audio
      const projected = Math.round((overhead + speech * (speed / next)) * 10) / 10;
      const reachable = Math.abs(projected - target) <= tolerance;
      log(
        reachable
          ? `[fit] dự kiến ${projected}s ở tốc độ ${next} — ĐẠT mục tiêu (chưa ghi gì, đang --dry)`
          : `[fit] dự kiến ${projected}s ở tốc độ ${next} — KHÔNG tới ${target}s vì tốc độ đã kịch giới hạn ${SPEED_MIN}-${SPEED_MAX}. Cần thêm/bớt câu.`,
      );
      return { slug, target, projected, speed: next, ok: reachable, dry: true, rounds: [{ round: i, speed: next }] };
    }

    const projectedSpeech = speech * (speed / next);
    await run("node", ["scripts/generate-vo.mjs"], { cwd: dir, env: { ...process.env, TTS_SPEED: String(next) } });
    durations = readDurations(dir);
    speech = durations.reduce((a, b) => a + b, 0);

    // Guard: the speed model only holds when the new audio comes from the same
    // provider+voice as the baseline. If someone regenerates a cut whose mp3s
    // were made elsewhere (e.g. the old Vbee clips), the first round lands
    // nowhere near the projection — and blindly iterating would just overwrite
    // the original voiceover with a different voice. Stop and say so instead.
    const drift = Math.abs(speech - projectedSpeech) / projectedSpeech;
    if (i === 1 && drift > 0.25) {
      log(
        `[fit] DỪNG: lời đọc ra ${speech.toFixed(2)}s trong khi dự kiến ${projectedSpeech.toFixed(2)}s (lệch ${(drift * 100).toFixed(0)}%).`,
      );
      log("[fit] Nghĩa là audio gốc của video này sinh bằng provider/giọng KHÁC với cấu hình .env hiện tại,");
      log("[fit] nên công thức tốc độ không áp dụng được. Kiểm tra TTS_PROVIDER / EDGE_VOICE_* trước khi chạy lại.");
      log("[fit] Audio vừa sinh đã GHI ĐÈ bản cũ — khôi phục bằng: git checkout -- videos/<slug>/assets/vo/");
      retime(slug);
      return { slug, target, actual: computeTiming(durations, gaps).root, speed: next, ok: false, providerMismatch: true, rounds };
    }
    const out = retime(slug);
    current = out.root;
    speed = next;
    rounds.push({ round: i, speed, root: current, speech: Math.round(speech * 100) / 100 });
    log(`[fit] vòng ${i}: ra ${current}s (lệch ${(current - target).toFixed(2)}s)`);
  }

  const ok = Math.abs(current - target) <= tolerance;
  // Persist the speed that produced this cut, so a later plain `node
  // scripts/generate-vo.mjs` reproduces the same lengths instead of silently
  // reverting to 1.1.
  if (!dry && speed !== readSpeed(dir)) {
    const p = path.join(dir, "scripts", "generate-vo.mjs");
    fs.writeFileSync(
      p,
      fs.readFileSync(p, "utf8").replace(/process\.env\.TTS_SPEED \|\| [\d.]+/, `process.env.TTS_SPEED || ${speed}`),
    );
    log(`[fit] ghi tốc độ ${speed} làm mặc định cho video này`);
  }

  log(
    ok
      ? `[fit] xong: ${current}s (mục tiêu ${target}s, sai số ${Math.abs(current - target).toFixed(2)}s)`
      : `[fit] CHƯA đạt: ${current}s so với mục tiêu ${target}s. Chênh quá nhiều để chỉnh bằng tốc độ đọc — cần thêm/bớt câu trong scripts/generate-vo.mjs.`,
  );
  return { slug, target, actual: current, speed, ok, rounds };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, targetRaw] = process.argv.slice(2);
  const target = Number(targetRaw);
  if (!slug || !Number.isFinite(target)) {
    console.error("dùng: node tools/fit-duration.mjs <slug> <seconds> [--tolerance 0.3] [--max-rounds 3] [--dry]");
    process.exit(1);
  }
  const arg = (name, def) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? Number(process.argv[i + 1]) : def;
  };
  const res = await fitDuration(slug, target, {
    tolerance: arg("tolerance", 0.3),
    maxRounds: arg("max-rounds", 3),
    dry: process.argv.includes("--dry"),
  });
  process.exit(res.ok || process.argv.includes("--dry") ? 0 : 2);
}
