#!/usr/bin/env node
// Dữ liệu cho trang /static/skins.html: mọi engine → variant → composition (bố cục) + số tài khoản đang dùng mỗi skin theo
// nước (creative.skins.<engine> và creative.variant_id trong YAML kênh; chỉ de/en/ko/ja — kênh vi không gắn tài khoản).
//   node tools/skins-page-data.mjs [--out ../bkt_web/static/skins_data.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";
import { listVariants } from "../matrix/render/variants/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHANNELS = path.resolve(HERE, "../config/channels");
const LANGS = ["de", "en", "ko", "ja"];

export function buildSkinsData(channelDir = CHANNELS) {
  const usage = {};  // variant id → {de: n, …}
  const engineChannels = {};  // engine → số kênh (de/en/ko/ja) liệt kê engine trong preferred_engines
  for (const file of fs.readdirSync(channelDir).filter((f) => f.endsWith(".yaml")).sort()) {
    const data = YAML.parse(fs.readFileSync(path.join(channelDir, file), "utf8")) || {};
    const lang = String(data.publishing?.language || "").slice(0, 2);
    if (!LANGS.includes(lang)) continue;
    const creative = data.creative || {};
    for (const engine of creative.preferred_engines || []) engineChannels[engine] = (engineChannels[engine] || 0) + 1;
    const ids = [creative.variant_id, ...Object.values(creative.skins || {}).map((s) => s?.variant_id)].filter(Boolean);
    for (const id of new Set(ids)) {
      usage[id] ||= Object.fromEntries(LANGS.map((l) => [l, 0]));
      usage[id][lang] += 1;
    }
  }
  const engines = {};
  for (const v of listVariants()) {
    const compositions = Object.entries(v.visualProfile?.compositions || {}).map(([id, c]) => ({ id, describe: c.describe || "", axes: c.axes || {} }));
    (engines[v.engine] ||= { engine: v.engine, channels: engineChannels[v.engine] || 0, variants: [] }).variants.push({
      id: v.id, name: v.name_vi || v.id, status: v.status, auto_assign: v.autoAssign !== false,
      asset: v.assetProfile?.type || "", compositions,
      usage: usage[v.id] || Object.fromEntries(LANGS.map((l) => [l, 0])),
    });
  }
  const list = Object.values(engines).sort((a, b) => a.engine.localeCompare(b.engine));
  for (const e of list) e.variants.sort((a, b) => a.id.localeCompare(b.id));
  const sum = (f) => list.reduce((n, e) => n + f(e), 0);
  return {
    generated_at: new Date().toISOString(),
    totals: {
      engines: list.length,
      variants: sum((e) => e.variants.length),
      compositions: sum((e) => e.variants.reduce((n, v) => n + v.compositions.length, 0)),
      variants_in_use: sum((e) => e.variants.filter((v) => Object.values(v.usage).some(Boolean)).length),
    },
    engines: list,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--out");
  const out = i > 0 ? process.argv[i + 1] : path.resolve(HERE, "../../bkt_web/static/skins_data.json");
  const data = buildSkinsData();
  fs.writeFileSync(out, `${JSON.stringify(data, null, 1)}\n`);
  console.log(JSON.stringify({ out, ...data.totals }));
}
