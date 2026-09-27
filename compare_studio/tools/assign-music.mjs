#!/usr/bin/env node
// Chia nhạc nền CC0 (config/music/cc0_catalog.json) cho từng kênh Matrix: mỗi kênh một pool nhỏ, ổn định
// (`audio.bgm_pool`), để ~200 acc không cùng dùng vài bài Kevin MacLeod (26/09: một bài nằm trong 138 video).
//
// Luật (tất định, chạy lại không đổi gì):
//   - bài hợp lệ cho kênh = bài có ít nhất một mood của niche (NICHE_MOODS); niche lạ → mood của soundscape.
//   - nhóm theo ngôn ngữ (= nước), slot = số kênh × --pool-size. Mỗi bài cố gắng ≤ ceil(slot / số bài catalog) kênh
//     trong ngôn ngữ (phần chia đều); khi mood không cho phép thì ≤ ceil(slot / số bài hợp lệ của kênh); trong một
//     niche của ngôn ngữ đó ≤ ceil(slot của niche / số bài hợp lệ).
//   - kênh giữ pool hiện tại nếu đủ --pool-size bài, mọi bài còn trong catalog, còn hợp mood và chưa vượt hai trần
//     trên; không thì lấy lần lượt bài ít dùng nhất trong niche, rồi trong ngôn ngữ, rồi toàn bộ, hoà thì theo
//     sha256(channel_id + track).
// Mặc định chỉ in bảng (dry-run). --apply ghi audio.bgm_pool và tăng config_version +1. Chỉ chạy khi Autopilot tạm
// dừng, rồi `matrix_config.sync_channel_configs`. Kênh không có bgm_pool vẫn dùng BGM cũ của soundscape.
//
//   node tools/assign-music.mjs [--lang de] [--pool-size 2] [--apply] [--json]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { CATALOG_PATH, catalogProblems, loadCatalog } from "../matrix/creative/music-catalog.mjs";

const CHANNEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config/channels");
export const DEFAULT_POOL_SIZE = 2;

// Mood hợp với nội dung của niche (engine đổi theo video, niche thì cố định theo acc).
export const NICHE_MOODS = Object.freeze({
  ancient_mythology: ["mysterious", "epic", "documentary"],
  dark_psychology: ["dark", "tense", "mysterious", "dark_ambient"],
  deep_space: ["mysterious", "calm", "dark_ambient", "electronic", "documentary"],
  economy_empires: ["documentary", "upbeat", "tense", "electronic"],
  extreme_survival: ["tense", "action", "epic", "dark"],
  extreme_wildlife: ["documentary", "tense", "epic", "action"],
  folklore_legends: ["mysterious", "dark", "dark_ambient"],
  forbidden_experiments: ["dark", "tense", "mysterious", "electronic"],
  geopolitics_maps: ["tense", "documentary", "epic"],
  infamous_figures: ["dark", "tense", "documentary"],
  lost_civilizations: ["mysterious", "epic", "documentary"],
  medical_anomalies: ["mysterious", "documentary", "tense", "calm"],
  mega_catastrophes: ["tense", "epic", "dark", "action"],
  military_arsenal: ["action", "epic", "tense"],
  ocean_mysteries: ["mysterious", "calm", "dark_ambient"],
  philosophy_paradox: ["calm", "mysterious", "documentary"],
  tech_ai_future: ["electronic", "upbeat", "documentary", "tense"],
  unsolved_mysteries: ["mysterious", "dark", "tense", "dark_ambient"],
});
// Dự phòng khi niche không có trong bảng trên.
export const SOUNDSCAPE_MOODS = Object.freeze({
  compare: ["upbeat", "playful", "documentary", "electronic"],
  survival: ["tense", "action", "dark", "epic"],
  science: ["documentary", "calm", "upbeat", "electronic"],
  mystery: ["mysterious", "dark_ambient", "tense", "dark"],
  vox: ["playful", "upbeat", "documentary"],
  newspaper: ["mysterious", "documentary", "tense"],
  kinetic: ["electronic", "tense", "action", "dark"],
});

function args(argv) {
  const out = { apply: false, json: false, dir: CHANNEL_DIR, catalog: CATALOG_PATH, poolSize: DEFAULT_POOL_SIZE };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--lang") out.lang = argv[++i];
    else if (key === "--apply") out.apply = true;
    else if (key === "--json") out.json = true;
    else if (key === "--dir") out.dir = argv[++i];
    else if (key === "--catalog") out.catalog = argv[++i];
    else if (key === "--pool-size") out.poolSize = Number(argv[++i]);
    else throw new Error(`unknown argument ${key}`);
  }
  if (!Number.isInteger(out.poolSize) || out.poolSize < 1 || out.poolSize > 6) throw new Error("--pool-size must be 1..6");
  return out;
}

export function channelMoods(channel) {
  return NICHE_MOODS[channel.niche] || SOUNDSCAPE_MOODS[channel.soundscape] || [];
}

/** Id bài hợp mood của kênh, theo thứ tự catalog. */
export function eligibleTracks(channel, tracks) {
  const moods = new Set(channelMoods(channel));
  return tracks.filter((track) => track.moods.some((mood) => moods.has(mood))).map((track) => track.id);
}

const rank = (channelId, track) => crypto.createHash("sha256").update(`${channelId}|${track}`).digest("hex");

/**
 * channels: [{ channel_id, lang, niche, soundscape, pool }] (pool = bgm_pool hiện tại hoặc undefined),
 * tracks: catalog.tracks → rows [{ channel_id, lang, niche, from, pool, status: kept|new|no_tracks }].
 */
export function assignMusic(channels, tracks, { poolSize = DEFAULT_POOL_SIZE } = {}) {
  const known = new Set(tracks.map((track) => track.id));
  const rows = [];
  const usedGlobal = new Map();
  const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  const byLang = new Map();
  for (const channel of channels) {
    if (!byLang.has(channel.lang)) byLang.set(channel.lang, []);
    byLang.get(channel.lang).push(channel);
  }
  const langs = [...byLang].sort(([a], [b]) => String(a).localeCompare(String(b)));
  const planned = [];
  for (const [lang, list] of langs) {
    const nicheSize = new Map();
    for (const channel of list) bump(nicheSize, channel.niche);
    const used = new Map();
    const usedInNiche = new Map();
    const nicheCount = (niche, track) => usedInNiche.get(`${niche}|${track}`) || 0;
    const caps = (channel, eligible) => ({
      fair: Math.ceil((list.length * poolSize) / tracks.length),
      lang: Math.ceil((list.length * poolSize) / eligible.length),
      niche: Math.ceil((nicheSize.get(channel.niche) * poolSize) / eligible.length),
    });
    const take = (channel, pool) => {
      for (const track of pool) {
        bump(used, track);
        bump(usedInNiche, `${channel.niche}|${track}`);
        bump(usedGlobal, track);
      }
    };
    const sorted = [...list].sort((a, b) => a.channel_id.localeCompare(b.channel_id));
    const pending = [];
    // Lượt 1: giữ pool hiện tại khi còn hợp lệ và chưa vượt trần.
    for (const channel of sorted) {
      const eligible = eligibleTracks(channel, tracks);
      if (eligible.length < poolSize) {
        planned.push({ channel, lang, pool: channel.pool || null, status: "no_tracks" });
        continue;
      }
      const cap = caps(channel, eligible);
      const pool = Array.isArray(channel.pool) ? channel.pool : [];
      const keep = pool.length === poolSize && new Set(pool).size === pool.length
        && pool.every((track) => known.has(track) && eligible.includes(track)
          && (used.get(track) || 0) < cap.lang && nicheCount(channel.niche, track) < cap.niche);
      if (keep) {
        take(channel, pool);
        planned.push({ channel, lang, pool: [...pool], status: "kept" });
      } else {
        pending.push({ channel, eligible });
      }
    }
    // Lượt 2: kênh còn lại lấy từng bài ít dùng nhất trong niche → ngôn ngữ → toàn bộ.
    for (const { channel, eligible } of pending) {
      const cap = caps(channel, eligible);
      const pool = [];
      for (let slot = 0; slot < poolSize; slot += 1) {
        const free = eligible.filter((track) => !pool.includes(track));
        // Ưu tiên bài còn dưới phần chia đều của cả catalog (fair), rồi dưới trần theo bài hợp mood, rồi bài chưa có
        // trong niche, cuối cùng bất kỳ bài hợp mood nào.
        const inNiche = (track) => nicheCount(channel.niche, track) < cap.niche;
        const underFair = free.filter((track) => (used.get(track) || 0) < cap.fair && inNiche(track));
        const underCap = free.filter((track) => (used.get(track) || 0) < cap.lang && inNiche(track));
        const newInNiche = free.filter(inNiche);
        const choice = [underFair, underCap, newInNiche, free].find((list) => list.length).sort((a, b) => nicheCount(channel.niche, a) - nicheCount(channel.niche, b)
          || (used.get(a) || 0) - (used.get(b) || 0)
          || (usedGlobal.get(a) || 0) - (usedGlobal.get(b) || 0)
          || rank(channel.channel_id, a).localeCompare(rank(channel.channel_id, b)))[0];
        pool.push(choice);
        bump(used, choice);
        bump(usedInNiche, `${channel.niche}|${choice}`);
        bump(usedGlobal, choice);
      }
      // Pool là tập hợp: sắp theo id để ghi YAML ổn định; cùng tập với pool cũ → vẫn "kept".
      pool.sort();
      const same = Array.isArray(channel.pool) && channel.pool.length === pool.length && [...channel.pool].sort().every((track, i) => track === pool[i]);
      planned.push({ channel, lang, pool: same ? [...channel.pool] : pool, status: same ? "kept" : "new" });
    }
  }
  for (const { channel, lang, pool, status } of planned) {
    rows.push({ channel_id: channel.channel_id, lang, niche: channel.niche, from: channel.pool || null, pool, status });
  }
  return rows.sort((a, b) => a.channel_id.localeCompare(b.channel_id));
}

export function loadMusicChannels(dir = CHANNEL_DIR) {
  return fs.readdirSync(dir).filter((name) => /\.ya?ml$/u.test(name)).sort().map((name) => {
    const file = path.join(dir, name);
    const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
    const data = doc.toJS();
    return {
      file, doc, channel_id: data.channel_id, lang: data.publishing?.language, niche: data.niche_id,
      soundscape: data.audio?.soundscape_id, pool: data.audio?.bgm_pool,
    };
  });
}

export function planMusic({ dir = CHANNEL_DIR, catalog = CATALOG_PATH, lang, poolSize = DEFAULT_POOL_SIZE } = {}) {
  const data = typeof catalog === "string" ? loadCatalog(catalog) : catalog;
  const problems = catalogProblems(data);
  if (problems.length) throw new Error(`invalid music catalog:\n${problems.join("\n")}`);
  const channels = loadMusicChannels(dir);
  // Luôn chia trên toàn bộ kênh (hoà điểm dùng số lần dùng toàn cục); --lang chỉ lọc dòng in/ghi,
  // nên `--lang de --apply` ghi đúng kết quả của lần chạy không --lang.
  const rows = assignMusic(channels, data.tracks, { poolSize }).filter((row) => !lang || row.lang === lang);
  return { channels, rows };
}

export function applyMusic({ channels, rows }) {
  const byId = new Map(channels.map((channel) => [channel.channel_id, channel]));
  const written = [];
  for (const row of rows) {
    if (row.status !== "new") continue;
    const { file, doc } = byId.get(row.channel_id);
    doc.setIn(["audio", "bgm_pool"], doc.createNode(row.pool));
    doc.set("config_version", Number(doc.get("config_version") || 1) + 1);
    fs.writeFileSync(file, doc.toString({ lineWidth: 0, indentSeq: false }));
    written.push(file);
  }
  return written;
}

/** Số kênh mỗi bài theo ngôn ngữ (để in và test). */
export function musicSpread(rows) {
  const out = {};
  for (const row of rows) {
    for (const track of row.pool || []) {
      out[row.lang] ||= {};
      out[row.lang][track] = (out[row.lang][track] || 0) + 1;
    }
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const opts = args(argv);
  const plan = planMusic(opts);
  const changes = plan.rows.filter((row) => row.status === "new");
  const spread = musicSpread(plan.rows);
  if (opts.json) {
    console.log(JSON.stringify({ rows: plan.rows, spread }, null, 2));
  } else {
    for (const [lang, counts] of Object.entries(spread)) {
      const values = Object.values(counts);
      const channels = plan.rows.filter((row) => row.lang === lang).length;
      console.log(`${lang}: ${channels} channel(s), ${values.length} track(s), max ${Math.max(...values)} channel(s)/track`);
      console.log(`  ${Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([track, n]) => `${track}=${n}`).join(", ")}`);
    }
    for (const row of plan.rows.filter((r) => r.status === "no_tracks")) console.log(`no_tracks ${row.channel_id} (${row.niche})`);
  }
  if (opts.apply) console.log(`wrote ${applyMusic(plan).length} channel config(s)`);
  else console.error(`dry-run: ${changes.length} channel(s) would change bgm_pool (use --apply)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
