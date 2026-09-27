#!/usr/bin/env node
// Tải nhạc nền CC0 của config/music/cc0_catalog.json vào shared/audio/cc0/<id>.mp3 (gitignored).
//
// - Tất định + idempotent: file đã có và đúng sha256 thì bỏ qua; chạy lại bao nhiêu lần cũng được.
// - Mỗi bài thử lần lượt download_urls (bản gốc qua Wayback Machine trước, mirror sau); chỉ nhận file đúng
//   bytes + sha256 của catalog, ghi qua file tạm .part rồi rename, nên không bao giờ để lại file dở.
// - Trên VPS chạy bằng user tokmatrix để file thuộc tokmatrix:tokmatrix:
//     sudo -u tokmatrix node /opt/tokmatrix/compare_studio/tools/fetch-cc0-music.mjs
//
//   node tools/fetch-cc0-music.mjs [--check] [--only id1,id2] [--dir <folder>] [--catalog <json>] [--jobs 3]
// Thoát ≠ 0 khi còn bài thiếu/sai (--check: chỉ kiểm tra, không tải). `accept-encoding: identity`: archive.org
// trả 500 cho header nén mặc định của fetch() trong Node.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_PATH, MUSIC_DIR, catalogProblems, loadCatalog, trackFile } from "../matrix/creative/music-catalog.mjs";

const USER_AGENT = "tokmatrix-cc0-music-fetch/1.0 (+CC0 background music; contact: repo owner)";

function args(argv) {
  const out = { check: false, dir: MUSIC_DIR, catalog: CATALOG_PATH, jobs: 3, only: null, timeoutMs: 240_000 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--check") out.check = true;
    else if (key === "--dir") out.dir = argv[++i];
    else if (key === "--catalog") out.catalog = argv[++i];
    else if (key === "--jobs") out.jobs = Math.max(1, Number(argv[++i]) || 1);
    else if (key === "--only") out.only = new Set(String(argv[++i]).split(",").filter(Boolean));
    else if (key === "--timeout") out.timeoutMs = Number(argv[++i]) * 1000;
    else throw new Error(`unknown argument ${key}`);
  }
  return out;
}

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

function fileMatches(file, track) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size !== track.bytes) return false;
  return sha256(fs.readFileSync(file)) === track.sha256;
}

async function download(url, timeoutMs, fetchImpl) {
  const response = await fetchImpl(url, { headers: { "user-agent": USER_AGENT, "accept-encoding": "identity" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Một bài: ok (đã có) | fetched | missing (--check) | failed. */
export async function fetchTrack(track, { dir = MUSIC_DIR, check = false, timeoutMs = 240_000, fetchImpl = fetch } = {}) {
  const file = trackFile(track, dir);
  if (fileMatches(file, track)) return { id: track.id, status: "ok", file };
  if (check) return { id: track.id, status: fs.existsSync(file) ? "mismatch" : "missing", file };
  const errors = [];
  for (const url of track.download_urls) {
    try {
      const body = await download(url, timeoutMs, fetchImpl);
      const actual = sha256(body);
      if (body.length !== track.bytes || actual !== track.sha256) {
        errors.push(`${url}: got ${body.length} bytes sha256 ${actual.slice(0, 12)}…`);
        continue;
      }
      await fs.promises.mkdir(dir, { recursive: true });
      const part = path.join(dir, `.${track.id}.${process.pid}.part`);
      await fs.promises.writeFile(part, body);
      await fs.promises.rename(part, file);
      return { id: track.id, status: "fetched", file, url };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  return { id: track.id, status: "failed", file, errors };
}

export async function fetchAll({ catalog, dir = MUSIC_DIR, check = false, jobs = 3, only = null, timeoutMs, fetchImpl, log = () => {} } = {}) {
  const problems = catalogProblems(catalog);
  if (problems.length) throw new Error(`invalid music catalog:\n${problems.join("\n")}`);
  const queue = catalog.tracks.filter((track) => !only || only.has(track.id));
  const results = [];
  const worker = async () => {
    while (queue.length) {
      const track = queue.shift();
      const result = await fetchTrack(track, { dir, check, timeoutMs, fetchImpl });
      log(`${result.status.padEnd(8)} ${track.id}${result.errors ? `\n  ${result.errors.join("\n  ")}` : ""}`);
      results.push(result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length || 1) }, worker));
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

export async function main(argv = process.argv.slice(2)) {
  const opts = args(argv);
  const catalog = loadCatalog(opts.catalog);
  const results = await fetchAll({ ...opts, catalog, log: (line) => console.log(line) });
  const bad = results.filter((row) => !["ok", "fetched"].includes(row.status));
  const count = (status) => results.filter((row) => row.status === status).length;
  console.log(`${results.length} track(s): ok=${count("ok")} fetched=${count("fetched")} missing/failed=${bad.length} → ${opts.dir}`);
  if (bad.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
