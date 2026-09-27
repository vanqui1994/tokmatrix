#!/usr/bin/env node
// Chia giọng đọc cho mọi kênh (docs/PLAN_compare_per_country.md bước 7): mỗi ngôn ngữ dùng hết các giọng kể
// chuyện có trong tools/voices.mjs, không để một giọng chiếm gần hết acc (trước đây 123 acc Đức cùng Conrad).
//
// Luật (tất định, chạy lại không đổi gì):
//   - pool = giọng của ngôn ngữ trong voices.mjs, bỏ giọng hiệu ứng (`narration: false`).
//   - mỗi giọng ≤ ceil(số acc / số giọng) acc trong ngôn ngữ; trong một niche, mỗi giọng ≤ ceil(acc niche / số giọng).
//   - kênh giữ giọng hiện tại nếu giọng đó còn trong pool và chưa vượt hai trần trên; không thì lấy giọng ít dùng
//     nhất trong niche, rồi ít dùng nhất toàn ngôn ngữ, hoà thì theo sha256(channel_id + voice).
// Mặc định chỉ in bảng (dry-run). --apply ghi audio.voice_id và tăng config_version +1. Chỉ chạy khi Autopilot tạm dừng.
//
//   node tools/assign-voices.mjs [--lang de] [--apply] [--json]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { COUNTRIES } from "./voices.mjs";

const CHANNEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config/channels");

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

/** Giọng kể chuyện của một ngôn ngữ (thứ tự như trong voices.mjs). */
export function narrationPool(lang) {
  const country = COUNTRIES.find((c) => c.code === lang);
  return country ? country.voices.filter((voice) => voice.narration !== false).map((voice) => voice.id) : [];
}

const rank = (channelId, voice) => crypto.createHash("sha256").update(`${channelId}|${voice}`).digest("hex");

/** channels: [{ channel_id, lang, niche, voice }] → rows [{ channel_id, lang, niche, from, voice, status }]. */
export function assignVoices(channels) {
  const rows = [];
  const byLang = new Map();
  for (const channel of channels) {
    if (!byLang.has(channel.lang)) byLang.set(channel.lang, []);
    byLang.get(channel.lang).push(channel);
  }
  for (const [lang, list] of [...byLang].sort(([a], [b]) => String(a).localeCompare(String(b)))) {
    const pool = narrationPool(lang);
    if (!pool.length) {
      for (const channel of list) rows.push({ ...channel, from: channel.voice, status: "no_pool" });
      continue;
    }
    const cap = Math.ceil(list.length / pool.length);
    const nicheSize = new Map();
    for (const channel of list) nicheSize.set(channel.niche, (nicheSize.get(channel.niche) || 0) + 1);
    const used = new Map(pool.map((voice) => [voice, 0]));
    const usedInNiche = new Map();
    const nicheCount = (niche, voice) => usedInNiche.get(`${niche}|${voice}`) || 0;
    const take = (channel, voice, status) => {
      used.set(voice, used.get(voice) + 1);
      usedInNiche.set(`${channel.niche}|${voice}`, nicheCount(channel.niche, voice) + 1);
      rows.push({ channel_id: channel.channel_id, lang, niche: channel.niche, from: channel.voice, voice, status });
    };
    const sorted = [...list].sort((a, b) => a.channel_id.localeCompare(b.channel_id));
    const pending = [];
    // Lượt 1: giữ giọng hiện tại khi còn chỗ. Giọng mặc định cũ (Conrad…) chỉ giữ được phần chia đều của nó.
    for (const channel of sorted) {
      const nicheCap = Math.ceil(nicheSize.get(channel.niche) / pool.length);
      if (pool.includes(channel.voice) && used.get(channel.voice) < cap && nicheCount(channel.niche, channel.voice) < nicheCap) {
        take(channel, channel.voice, "kept");
      } else {
        pending.push(channel);
      }
    }
    // Lượt 2: kênh còn lại lấy giọng ít dùng nhất trong niche, rồi toàn ngôn ngữ.
    for (const channel of pending) {
      const voice = [...pool].filter((v) => used.get(v) < cap).sort((a, b) => nicheCount(channel.niche, a) - nicheCount(channel.niche, b)
        || used.get(a) - used.get(b) || rank(channel.channel_id, a).localeCompare(rank(channel.channel_id, b)))[0];
      // Niche đầy (mọi giọng còn trống đã có trong niche): lượt 2 có thể chọn lại đúng giọng cũ → vẫn là "kept".
      take(channel, voice, voice === channel.voice ? "kept" : "new");
    }
  }
  return rows.sort((a, b) => a.channel_id.localeCompare(b.channel_id));
}

export function loadVoiceChannels(dir = CHANNEL_DIR) {
  return fs.readdirSync(dir).filter((name) => /\.ya?ml$/u.test(name)).sort().map((name) => {
    const file = path.join(dir, name);
    const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
    const data = doc.toJS();
    return { file, doc, variant: data.creative?.variant_id, channel_id: data.channel_id, lang: data.publishing?.language, niche: data.niche_id, voice: data.audio?.voice_id };
  })
    // Kênh có creative.variant_id: giọng là một phần Voice DNA trong plan đã duyệt (creative_dna) → không chia lại ở đây.
    .filter((channel) => !channel.variant);
}

export function planVoices({ dir = CHANNEL_DIR, lang } = {}) {
  const channels = loadVoiceChannels(dir).filter((channel) => !lang || channel.lang === lang);
  return { channels, rows: assignVoices(channels) };
}

export function applyVoices({ channels, rows }) {
  const byId = new Map(channels.map((channel) => [channel.channel_id, channel]));
  const written = [];
  for (const row of rows) {
    if (row.status !== "new" || row.voice === row.from) continue;
    const { file, doc } = byId.get(row.channel_id);
    doc.setIn(["audio", "voice_id"], row.voice);
    doc.set("config_version", Number(doc.get("config_version") || 1) + 1);
    fs.writeFileSync(file, doc.toString({ lineWidth: 0, indentSeq: false }));
    written.push(file);
  }
  return written;
}

/** Số acc mỗi giọng theo ngôn ngữ (để in và test). */
export function voiceSpread(rows) {
  const out = {};
  for (const row of rows) {
    out[row.lang] ||= {};
    out[row.lang][row.voice] = (out[row.lang][row.voice] || 0) + 1;
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const opts = args(argv);
  const plan = planVoices(opts);
  const changes = plan.rows.filter((row) => row.status === "new" && row.voice !== row.from);
  if (opts.json) {
    console.log(JSON.stringify({ rows: plan.rows, spread: voiceSpread(plan.rows) }, null, 2));
  } else {
    for (const [lang, spread] of Object.entries(voiceSpread(plan.rows))) {
      console.log(`${lang}: ${Object.entries(spread).map(([voice, n]) => `${voice}=${n}`).join(", ")}`);
    }
  }
  if (opts.apply) console.log(`wrote ${applyVoices(plan).length} channel config(s)`);
  else console.error(`dry-run: ${changes.length} channel(s) would change voice (use --apply)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
