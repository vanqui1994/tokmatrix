#!/usr/bin/env node
// Chạy `hyperframes check` trên preview của mọi variant × composition × ngôn ngữ × 2 DNA mẫu (a/b), song song.
// Lỗi kiểu text_occluded / content_overlap / contrast chỉ lộ ra ở check thật (lint của kit không bắt được), nên mọi thay đổi
// ở variants/ phải qua lệnh này trước khi merge (docs/PLAN_VARIANT_V2_COMPLETION.md WS-H).
//
//   node tools/check-previews.mjs --out /tmp/cp [--engine e] [--variant id] [--langs en,de,ja,ko,vi] [--jobs 4] [--hf 0.7.58]
//   node tools/check-previews.mjs --out /tmp/cp --reuse          # chỉ check lại preview đã dựng (manifest.json có sẵn)
//   HYPERFRAMES_BIN=/path/to/hyperframes node tools/check-previews.mjs …  # dùng bản cài sẵn thay vì npx
//
// Ghi <out>/check-report.json: { hyperframes, total, passed, failed: [{slug, structure, lang, dna, findings[]}], by_structure }.
// Thoát 1 khi có preview lỗi.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main as buildPreviews } from "./preview-variants.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Phiên bản HyperFrames mà project Matrix gọi khi render (native-engine-adapter.mjs) — check phải cùng phiên bản đó. */
export function productionHyperframesVersion() {
  const source = fs.readFileSync(path.join(COMPARE_DIR, "matrix", "render", "native-engine-adapter.mjs"), "utf8");
  const match = source.match(/check: "npx --yes hyperframes@([0-9A-Za-z.-]+) check"/u);
  if (!match) throw new Error("cannot find the hyperframes check version in native-engine-adapter.mjs");
  return match[1];
}

function args(argv) {
  const out = { langs: ["en", "de", "ja", "ko", "vi"], jobs: Math.max(1, Math.floor(os.cpus().length)), reuse: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--out") out.out = argv[++i];
    else if (key === "--engine") out.engine = argv[++i];
    else if (key === "--variant") out.variant = argv[++i];
    else if (key === "--langs") out.langs = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "--jobs") out.jobs = Math.max(1, Number(argv[++i]));
    else if (key === "--hf") out.hf = argv[++i];
    else if (key === "--reuse") out.reuse = true;
    else throw new Error(`unknown argument ${key}`);
  }
  if (!out.out) throw new Error("--out <dir> is required");
  return out;
}

/** Các dòng lỗi (✗) của output `hyperframes check`, bỏ mã màu và khoảng trắng thừa. */
export function parseCheckOutput(text) {
  const clean = String(text).replace(/\u001b\[[0-9;]*m/gu, "");
  const passed = /Check passed/u.test(clean);
  const findings = clean.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("✗")).map((line) => line.slice(1).trim());
  return { passed: passed && !findings.length, findings };
}

function checkOne(dir, version) {
  return new Promise((resolve) => {
    // HYPERFRAMES_BIN = lệnh hyperframes cài sẵn (vd. máy không cài được qua npx); mặc định npx đúng phiên bản.
    const [cmd, ...pre] = process.env.HYPERFRAMES_BIN ? process.env.HYPERFRAMES_BIN.split(" ") : ["npx", "--yes", `hyperframes@${version}`];
    const child = spawn(cmd, [...pre, "check"], { cwd: dir, env: process.env });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 300_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const parsed = parseCheckOutput(output);
      resolve({ ...parsed, passed: parsed.passed && code === 0, exitCode: code });
    });
  });
}

async function pool(items, jobs, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = args(argv);
  const version = opts.hf || productionHyperframesVersion();
  const manifestPath = path.join(opts.out, "manifest.json");
  if (!opts.reuse) {
    const buildArgs = ["--out", opts.out, "--langs", opts.langs.join(",")];
    if (opts.engine) buildArgs.push("--engine", opts.engine);
    if (opts.variant) buildArgs.push("--variant", opts.variant);
    await buildPreviews(buildArgs);
  }
  const { entries } = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let done = 0;
  const results = await pool(entries, opts.jobs, async (entry) => {
    const result = await checkOne(entry.dir, version);
    done += 1;
    if (!result.passed) process.stderr.write(`FAIL ${entry.slug}\n${result.findings.slice(0, 3).map((f) => `  ✗ ${f}`).join("\n")}\n`);
    if (done % 50 === 0) process.stderr.write(`… ${done}/${entries.length}\n`);
    return { entry, result };
  });
  const failed = results.filter(({ result }) => !result.passed).map(({ entry, result }) => ({
    slug: entry.slug,
    structure: `${entry.labels.variant}#${entry.labels.composition}`,
    lang: entry.labels.country,
    dna: entry.slug.split("-").at(-1),
    exit_code: result.exitCode,
    findings: result.findings,
  }));
  const byStructure = {};
  for (const row of failed) byStructure[row.structure] = (byStructure[row.structure] || 0) + 1;
  const report = { hyperframes: version, total: entries.length, passed: entries.length - failed.length, failed, by_structure: byStructure };
  fs.writeFileSync(path.join(opts.out, "check-report.json"), `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify({ hyperframes: version, total: report.total, passed: report.passed, failed: failed.length, by_structure: byStructure }));
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((report) => process.exit(report.failed.length ? 1 : 0)).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(2);
  });
}
