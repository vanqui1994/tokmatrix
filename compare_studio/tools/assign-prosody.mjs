#!/usr/bin/env node
// Tách các acc DÙNG CHUNG một giọng bằng tốc độ + cao độ (Voice DNA, docs/MATRIX_VARIANT_SYSTEM_V2.md mục 8).
// Số giọng thật ít hơn số acc (de 9 giọng / 125 acc, ko 3 giọng / 10 acc) nên giọng chắc chắn bị dùng lại; ít nhất
// hai acc cùng giọng không được đọc với cùng tốc độ và cao độ.
//
// Luật (tất định, chạy lại không đổi gì):
//   - lưới PROSODY_GRID = 4 tốc độ × 4 cao độ (±5% tốc độ, −2…+1 bán cung), xếp gần giá trị cũ (1.02 / −1) trước;
//   - trong một nhóm (ngôn ngữ, giọng), mỗi ô lưới ≤ ceil(số acc / 16) acc;
//   - kênh giữ (tốc độ, cao độ) hiện tại nếu nằm trên lưới và ô còn chỗ; không thì lấy ô ít dùng nhất theo thứ tự lưới.
// Mặc định chỉ in bảng (dry-run). --apply ghi audio.voice_speed / voice_pitch và tăng config_version +1.
// Chạy SAU tools/assign-voices.mjs (đổi giọng thì nhóm đổi). Chỉ chạy khi Autopilot tạm dừng.
//
//   node tools/assign-prosody.mjs [--lang ko] [--apply] [--json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const CHANNEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config/channels");
const SPEEDS = [0.96, 0.99, 1.02, 1.05];
const PITCHES = [-2, -1, 0, 1];

/** 16 ô (tốc độ, cao độ), ô gần giá trị cũ (1.02, −1) đứng trước để nhóm nhỏ chỉ đổi nhẹ. */
export const PROSODY_GRID = Object.freeze(SPEEDS.flatMap((speed) => PITCHES.map((pitch) => ({ speed, pitch })))
  .sort((a, b) => Math.abs(a.pitch + 1) - Math.abs(b.pitch + 1) || Math.abs(a.speed - 1.02) - Math.abs(b.speed - 1.02)
    || a.speed - b.speed || a.pitch - b.pitch));

const cellKey = (speed, pitch) => `${Number(speed).toFixed(2)}|${Number(pitch)}`;
const GRID_KEYS = new Set(PROSODY_GRID.map((cell) => cellKey(cell.speed, cell.pitch)));

function args(argv) {
  const out = { apply: false, json: false, dir: CHANNEL_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--lang") out.lang = argv[++i];
    else if (key === "--apply") out.apply = true;
    else if (key === "--json") out.json = true;
    else if (key === "--dir") out.dir = argv[++i];
    else throw new Error(`unknown argument ${key}`);
  }
  return out;
}

/** channels: [{ channel_id, lang, voice, speed, pitch }] → rows [{ …, from, speed, pitch, status }]. */
export function assignProsody(channels) {
  const groups = new Map();
  for (const channel of channels) {
    const key = `${channel.lang}|${channel.voice}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(channel);
  }
  const rows = [];
  for (const list of groups.values()) {
    const cap = Math.ceil(list.length / PROSODY_GRID.length);
    const used = new Map();
    const count = (key) => used.get(key) || 0;
    const take = (channel, cell, status) => {
      const key = cellKey(cell.speed, cell.pitch);
      used.set(key, count(key) + 1);
      rows.push({ channel_id: channel.channel_id, lang: channel.lang, voice: channel.voice,
        from: { speed: channel.speed, pitch: channel.pitch }, speed: cell.speed, pitch: cell.pitch, status });
    };
    const sorted = [...list].sort((a, b) => a.channel_id.localeCompare(b.channel_id));
    const pending = [];
    for (const channel of sorted) {
      const key = cellKey(channel.speed, channel.pitch);
      if (GRID_KEYS.has(key) && count(key) < cap) take(channel, { speed: Number(channel.speed), pitch: Number(channel.pitch) }, "kept");
      else pending.push(channel);
    }
    for (const channel of pending) {
      const cell = PROSODY_GRID.filter((c) => count(cellKey(c.speed, c.pitch)) < cap)
        .sort((a, b) => count(cellKey(a.speed, a.pitch)) - count(cellKey(b.speed, b.pitch)))[0];
      take(channel, cell, "new");
    }
  }
  return rows.sort((a, b) => a.channel_id.localeCompare(b.channel_id));
}

export function loadProsodyChannels(dir = CHANNEL_DIR) {
  return fs.readdirSync(dir).filter((name) => /\.ya?ml$/u.test(name)).sort().map((name) => {
    const file = path.join(dir, name);
    const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
    const data = doc.toJS();
    return { file, doc, channel_id: data.channel_id, lang: data.publishing?.language, voice: data.audio?.voice_id,
      speed: Number(data.audio?.voice_speed), pitch: Number(data.audio?.voice_pitch) };
  });
}

export function planProsody({ dir = CHANNEL_DIR, lang } = {}) {
  const channels = loadProsodyChannels(dir).filter((channel) => !lang || channel.lang === lang);
  return { channels, rows: assignProsody(channels) };
}

export function applyProsody({ channels, rows }) {
  const byId = new Map(channels.map((channel) => [channel.channel_id, channel]));
  const written = [];
  for (const row of rows) {
    if (row.status !== "new") continue;
    const { file, doc } = byId.get(row.channel_id);
    doc.setIn(["audio", "voice_speed"], row.speed);
    doc.setIn(["audio", "voice_pitch"], row.pitch);
    doc.set("config_version", Number(doc.get("config_version") || 1) + 1);
    fs.writeFileSync(file, doc.toString({ lineWidth: 0, indentSeq: false }));
    written.push(file);
  }
  return written;
}

/** Số (tốc độ, cao độ) khác nhau / số acc của mỗi nhóm giọng. */
export function prosodySpread(rows) {
  const out = {};
  for (const row of rows) {
    const key = `${row.lang}|${row.voice}`;
    out[key] ||= { accounts: 0, cells: new Set() };
    out[key].accounts += 1;
    out[key].cells.add(cellKey(row.speed, row.pitch));
  }
  return Object.fromEntries(Object.entries(out).map(([key, v]) => [key, { accounts: v.accounts, distinct: v.cells.size }]));
}

export function main(argv = process.argv.slice(2)) {
  const opts = args(argv);
  const plan = planProsody(opts);
  const changes = plan.rows.filter((row) => row.status === "new");
  if (opts.json) console.log(JSON.stringify({ rows: plan.rows, spread: prosodySpread(plan.rows) }, null, 2));
  else for (const [key, v] of Object.entries(prosodySpread(plan.rows))) console.log(`${key}: ${v.accounts} acc, ${v.distinct} kiểu đọc`);
  if (opts.apply) console.log(`wrote ${applyProsody(plan).length} channel config(s)`);
  else console.error(`dry-run: ${changes.length} channel(s) would change speed/pitch (use --apply)`);
  return plan;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`[assign-prosody] ${error.message}`);
    process.exitCode = 1;
  }
}
