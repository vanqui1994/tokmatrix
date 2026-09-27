#!/usr/bin/env node
// Đo hiệu năng render variant (docs/PLAN_VARIANT_V2_COMPLETION.md WS-G). Chạy trên VPS, đúng cấu hình production:
// render bằng hyperframes bản production với renderEncodeArgs() (MATRIX_RENDER_FPS/QUALITY/CRF) và song song tối đa
// renderSlotCount() (MATRIX_RENDER_SLOTS). Mỗi engine lấy N variant active đầu tiên (theo id), 1 composition, 1 ngôn ngữ.
// Preview dùng ảnh giữ chỗ và giọng im lặng, nên số đo là phần render của layout (không gồm TTS/ảnh AI); số ảnh AI và
// giây TTS mà một video thật cần được ghi theo costProfile để ước lượng.
//
//   node tools/bench-variants.mjs --out /tmp/bench [--per-engine 2] [--lang de] [--engine vox] [--report docs/creative_dna/bench-<date>.md]
//   (deploy/bench_variants.sh chạy lệnh này với user tokmatrix trên VPS)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listVariants } from "../matrix/render/variants/index.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { renderEncodeArgs } from "../matrix/render/native-engine-adapter.mjs";
import { renderSlotCount } from "../matrix/render/render-slots.mjs";
import { buildPreview } from "./preview-variants.mjs";
import { productionHyperframesVersion } from "./check-previews.mjs";

function args(argv) {
  const out = { perEngine: 2, lang: "de", report: null };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--out") out.out = argv[++i];
    else if (key === "--per-engine") out.perEngine = Math.max(1, Number(argv[++i]));
    else if (key === "--lang") out.lang = argv[++i];
    else if (key === "--engine") out.engine = argv[++i];
    else if (key === "--variant") out.variant = argv[++i];
    else if (key === "--report") out.report = argv[++i];
    else throw new Error(`unknown argument ${key}`);
  }
  if (!out.out) throw new Error("--out <dir> is required");
  return out;
}

/** Variant được đo: N variant active đầu tiên mỗi engine (bỏ bộ da mỗi acc chỉ khi engine còn variant khác). */
export function benchVariants({ perEngine = 2, engine, variant } = {}) {
  const active = listVariants().filter((v) => v.status === "active" && (!engine || v.engine === engine) && (!variant || v.id === variant));
  const byEngine = new Map();
  for (const v of [...active].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!byEngine.has(v.engine)) byEngine.set(v.engine, []);
    byEngine.get(v.engine).push(v);
  }
  return [...byEngine.values()].flatMap((list) => list.slice(0, perEngine));
}

// Tổng RSS + CPU của cả cây tiến trình (npx → hyperframes → Chrome/ffmpeg) đọc từ /proc; 0 nếu không phải Linux.
function treeStats(rootPid) {
  const children = new Map();
  let procs = [];
  try {
    procs = fs.readdirSync("/proc").filter((name) => /^\d+$/u.test(name));
  } catch {
    return { rssKb: 0, cpuTicks: 0 };
  }
  const stats = new Map();
  for (const pid of procs) {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const ppid = Number(fields[1]);
      const cpuTicks = Number(fields[11]) + Number(fields[12]) + Number(fields[13]) + Number(fields[14]);
      const rssKb = Number(fields[21]) * 4; // rss tính bằng trang 4 KiB
      stats.set(Number(pid), { cpuTicks, rssKb });
      if (!children.has(ppid)) children.set(ppid, []);
      children.get(ppid).push(Number(pid));
    } catch { /* tiến trình vừa thoát */ }
  }
  let rssKb = 0;
  let cpuTicks = 0;
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    const s = stats.get(pid);
    if (s) { rssKb += s.rssKb; cpuTicks += s.cpuTicks; }
    stack.push(...(children.get(pid) || []));
  }
  return { rssKb, cpuTicks };
}

function renderOne({ dir, slug, hfVersion }) {
  const output = path.join(dir, "renders", `${slug}.mp4`);
  const [cmd, ...pre] = process.env.HYPERFRAMES_BIN ? process.env.HYPERFRAMES_BIN.split(" ") : ["npx", "--yes", `hyperframes@${hfVersion}`];
  const argv = [...pre, "render", dir, "--output", output, ...renderEncodeArgs(), "--quiet"];
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(cmd, argv, { cwd: dir, stdio: ["ignore", "ignore", "pipe"] });
    let peakKb = 0;
    let lastCpu = 0;
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    const timer = setInterval(() => {
      const s = treeStats(child.pid);
      peakKb = Math.max(peakKb, s.rssKb);
      lastCpu = Math.max(lastCpu, s.cpuTicks);
    }, 500);
    child.on("close", (code) => {
      clearInterval(timer);
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const size = fs.existsSync(output) ? fs.statSync(output).size : 0;
      resolve({ ok: code === 0 && size > 0, code, seconds, peakMb: peakKb / 1024, cpuSeconds: lastCpu / 100, mb: size / 1048576, error: code === 0 ? "" : stderr.trim().split("\n").slice(-3).join(" ") });
    });
  });
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

export function reportMarkdown({ rows, slots, encodeArgs, hfVersion, lang, host = os.hostname(), date = new Date() }) {
  const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "—");
  const lines = [
    `# Bench render variant — ${date.toISOString().slice(0, 10)}`,
    "",
    `Máy: \`${host}\` · ${os.cpus().length} CPU · ${(os.totalmem() / 1073741824).toFixed(1)} GB RAM · hyperframes ${hfVersion} · ` +
      `slots ${slots} · \`${encodeArgs.join(" ")}\` · ngôn ngữ ${lang}.`,
    "Preview (ảnh giữ chỗ, giọng im lặng): số đo là phần render layout. Ảnh AI và giây TTS của video thật lấy từ costProfile / độ dài.",
    "",
    "| Engine | Variant | Composition | Video (s) | Render (s) | CPU (s) | RAM đỉnh (MB) | MP4 (MB) | Ảnh AI | TTS (s) | Kết quả |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.engine} | ${r.variant} | ${r.composition} | ${fmt(r.duration, 0)} | ${fmt(r.seconds)} | ${fmt(r.cpuSeconds)} | ` +
      `${fmt(r.peakMb, 0)} | ${fmt(r.mb, 2)} | ${r.aiImages} | ${fmt(r.ttsSeconds, 0)} | ${r.ok ? "ok" : `lỗi ${r.code}: ${r.error}`} |`),
    "",
  ];
  const ok = rows.filter((r) => r.ok);
  if (ok.length) {
    const peak = Math.max(...ok.map((r) => r.peakMb));
    lines.push(`Tổng: ${ok.length}/${rows.length} render ok · trung bình ${fmt(ok.reduce((a, r) => a + r.seconds, 0) / ok.length)} s/video · ` +
      `RAM đỉnh một render ${fmt(peak, 0)} MB · ${slots} slot song song ≈ ${fmt((peak * slots) / 1024, 1)} GB.`);
    lines.push("Không tăng MATRIX_RENDER_SLOTS nếu RAM đỉnh × slots > 70% MemoryHigh của tokmatrix-web.service.");
  }
  return `${lines.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = args(argv);
  const hfVersion = productionHyperframesVersion();
  const slots = renderSlotCount();
  const encodeArgs = renderEncodeArgs();
  fs.mkdirSync(opts.out, { recursive: true });
  const targets = benchVariants(opts);
  const built = [];
  for (const variant of targets) {
    const composition = Object.keys(variant.visualProfile.compositions)[0];
    const preview = await buildPreview({ variant, composition, lang: opts.lang, dna: defaultDna(variant, composition), dnaTag: "bench", outDir: opts.out });
    built.push({ variant, composition, preview });
  }
  const rows = await pool(built, slots, async ({ variant, composition, preview }) => {
    const result = await renderOne({ dir: preview.dir, slug: preview.slug, hfVersion });
    const scenes = preview.scene_durations.length;
    const row = {
      engine: variant.engine, variant: variant.id, composition, duration: preview.duration, ...result,
      aiImages: Math.round((variant.costProfile?.aiImagesPerScene || 0) * scenes),
      ttsSeconds: preview.scene_durations.reduce((a, b) => a + b, 0),
    };
    console.error(`${row.ok ? "ok " : "ERR"} ${variant.id} ${row.seconds.toFixed(1)} s ${row.peakMb.toFixed(0)} MB`);
    return row;
  });
  const markdown = reportMarkdown({ rows, slots, encodeArgs, hfVersion, lang: opts.lang });
  const report = opts.report || path.join(opts.out, "bench.md");
  fs.mkdirSync(path.dirname(path.resolve(report)), { recursive: true });
  fs.writeFileSync(report, markdown);
  fs.writeFileSync(path.join(opts.out, "bench.json"), JSON.stringify(rows, null, 1));
  console.log(JSON.stringify({ report, renders: rows.length, ok: rows.filter((r) => r.ok).length }));
  return rows.every((r) => r.ok) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (error) => { console.error(error); process.exit(1); });
}

