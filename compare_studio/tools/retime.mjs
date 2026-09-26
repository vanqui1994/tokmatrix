#!/usr/bin/env node
// Retime a video's composition from the real VO durations.
//
//   node tools/retime.mjs <slug> [--json]
//
// Reads assets/vo/durations.json, recomputes every start time with the series
// timing formula, and rewrites index.html in place: the <audio> data-start /
// data-duration attributes, the VO object, ROOT_DURATION, and the root/scene
// data-duration.
//
// Gap policy (DESIGN.md / create-video step 4): gaps are FIXED pacing, never a
// lever for total length. For a 12-line script they are 0.32s inside a beat and
// 0.42s across a beat boundary. For any other line count the existing gaps are
// read back out of index.html so an older cut keeps its own pacing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const LEAD_IN = 0.55; // first line starts here
const OUTRO_HOLD = 1.5; // dwell after the final CTA / payoff line
const CAP_BUFFER = 0.25; // caption stays this long after its audio ends

// 20-line 7-act beat map: index n -> gap between line n and n+1
const SAME_BEAT_20 = new Set([1, 3, 5, 6, 7, 10, 11, 12, 14, 15, 16, 18, 19]);
const gapFor20 = (n) => (SAME_BEAT_20.has(n) ? 0.30 : 0.40);

// 12-line legacy beat map: index n -> gap between line n and n+1
const SAME_BEAT_12 = new Set([1, 4, 5, 7, 8, 10]);
const gapFor12 = (n) => (SAME_BEAT_12.has(n) ? 0.32 : 0.42);

export function readDurations(dir) {
  const p = path.join(dir, "assets", "vo", "durations.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const keys = Object.keys(raw).filter((k) => /^line-\d+$/.test(k));
  keys.sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  return keys.map((k) => Math.round(raw[k] * 1000) / 1000);
}

/** Gaps currently baked into index.html, so non-12-line cuts keep their pacing. */
function existingGaps(html, count) {
  const vo = {};
  for (const m of html.matchAll(/(\d+): \{ start: ([\d.]+), dur: ([\d.]+) \}/g))
    vo[Number(m[1])] = { start: Number(m[2]), dur: Number(m[3]) };
  const gaps = [];
  for (let n = 1; n < count; n++) {
    const a = vo[n];
    const b = vo[n + 1];
    if (!a || !b) return null;
    gaps.push(Math.round((b.start - (a.start + a.dur)) * 100) / 100);
  }
  return gaps;
}

export function computeTiming(durations, gaps) {
  const start = [];
  let t = LEAD_IN;
  for (let i = 0; i < durations.length; i++) {
    start.push(Math.round(t * 1000) / 1000);
    t += durations[i] + (gaps[i] ?? 0);
  }
  const last = durations.length - 1;
  const root = Math.round((start[last] + durations[last] + OUTRO_HOLD) * 10) / 10;
  return { start, root };
}

export function gapsFor(count, html) {
  if (count === 20) return Array.from({ length: 19 }, (_, i) => gapFor20(i + 1));
  if (count === 12) return Array.from({ length: 11 }, (_, i) => gapFor12(i + 1));
  const found = html ? existingGaps(html, count) : null;
  if (found) return found;
  // last resort: alternate the two canonical gaps
  return Array.from({ length: count - 1 }, (_, i) => (i % 2 ? 0.40 : 0.30));
}

export function retime(slug) {
  const dir = path.join(REPO_ROOT, "videos", slug);
  const htmlPath = path.join(dir, "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");
  const dur = readDurations(dir);
  const gaps = gapsFor(dur.length, html);
  const { start, root } = computeTiming(dur, gaps);

  for (let i = 0; i < dur.length; i++) {
    const n = i + 1;
    const re = new RegExp(
      `(id="vo-${n}" src="assets/vo/line-${n}\\.mp3" data-start=")[\\d.]+(" data-duration=")[\\d.]+(")`,
    );
    if (!re.test(html)) throw new Error(`không tìm thấy thẻ <audio> cho dòng ${n}`);
    html = html.replace(re, `$1${start[i]}$2${dur[i]}$3`);
  }

  const voBlock =
    "      const VO = {\n" +
    dur.map((d, i) => `        ${i + 1}: { start: ${start[i]}, dur: ${d} },\n`).join("") +
    "      };";
  html = html.replace(/ {6}const VO = \{[\s\S]*?\n {6}\};/, voBlock);
  html = html.replace(/const ROOT_DURATION = [\d.]+;/, `const ROOT_DURATION = ${root};`);
  html = html.replace(/data-height="1920" data-duration="[\d.]+"/, `data-height="1920" data-duration="${root}"`);
  html = html.replace(
    /id="scene" class="clip" data-start="0" data-duration="[\d.]+"/,
    `id="scene" class="clip" data-start="0" data-duration="${root}"`,
  );
  html = html.replace(
    /(id="bgm"[^>]*data-duration=")[^"]*(")/,
    `$1${root}$2`,
  );

  fs.writeFileSync(htmlPath, html);
  return {
    slug,
    lines: dur.length,
    root,
    speech: Math.round(dur.reduce((a, b) => a + b, 0) * 1000) / 1000,
    capOut: start.map((s, i) => Math.round((s + dur[i] + CAP_BUFFER) * 1000) / 1000),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("dùng: node tools/retime.mjs <slug> [--json]");
    process.exit(1);
  }
  const out = retime(slug);
  if (process.argv.includes("--json")) console.log(JSON.stringify(out));
  else console.log(`${out.slug}: ${out.lines} dòng, lời đọc ${out.speech}s, ROOT_DURATION = ${out.root}s`);
}
