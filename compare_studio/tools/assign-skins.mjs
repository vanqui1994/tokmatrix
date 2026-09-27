#!/usr/bin/env node
// Gán "bộ da" cố định cho mọi kênh dùng một engine (docs/PLAN_compare_per_country.md mục 2, lớp 2).
// Mặc định chỉ in bảng (dry-run). --apply ghi creative.skins.<engine> vào YAML kênh và tăng config_version +1
// (matrix_config.sync_channel_configs từ chối config đổi mà giữ nguyên version).
// Kênh đã có bộ da hợp lệ được giữ nguyên; chạy lại chỉ gán cho kênh mới. Chỉ chạy khi Autopilot đang tạm dừng.
//
//   node tools/assign-skins.mjs --variant newspaper/front-page [--apply] [--json <plan.json>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { getVariant } from "../matrix/render/variants/index.mjs";
import { SKIN_AXES, assignSkins } from "../matrix/render/variants/skins.mjs";

const CHANNEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config/channels");

function args(argv) {
  const out = { apply: false, dir: CHANNEL_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--variant") out.variant = argv[++i];
    else if (key === "--apply") out.apply = true;
    else if (key === "--json") out.json = argv[++i];
    else if (key === "--dir") out.dir = argv[++i];
    else throw new Error(`unknown argument ${key}`);
  }
  if (!out.variant) throw new Error("--variant <engine/slug> is required");
  return out;
}

export function loadChannels(dir, engine) {
  return fs.readdirSync(dir).filter((name) => /\.ya?ml$/u.test(name)).sort().map((name) => {
    const file = path.join(dir, name);
    const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
    const data = doc.toJS();
    return { file, doc, data };
  }).filter(({ data }) => data.creative?.preferred_engines?.includes(engine)).map((item) => ({
    ...item, channel_id: item.data.channel_id, lang: item.data.publishing?.language, skin: item.data.creative?.skins?.[engine],
  }));
}

export function planSkins({ dir = CHANNEL_DIR, variantId }) {
  const variant = getVariant(variantId, { allowReference: false });
  if (!variant) throw new Error(`variant ${variantId} is unknown or not active`);
  const channels = loadChannels(dir, variant.engine);
  const { rows, violations } = assignSkins(channels, variant);
  return { variant, channels, rows, violations };
}

export function applySkins({ variant, channels, rows }) {
  const byId = new Map(channels.map((channel) => [channel.channel_id, channel]));
  const written = [];
  for (const row of rows) {
    if (!row.dna || row.status === "kept") continue;
    const { file, doc } = byId.get(row.channel_id);
    doc.setIn(["creative", "skins", variant.engine], doc.createNode({ variant_id: variant.id, dna: row.dna }));
    doc.set("config_version", Number(doc.get("config_version") || 1) + 1);
    fs.writeFileSync(file, doc.toString({ lineWidth: 0, indentSeq: false }));
    written.push(file);
  }
  return written;
}

function table(rows) {
  const header = ["CHANNEL", "COUNTRY", "STATUS", ...SKIN_AXES.map((axis) => axis.toUpperCase())];
  const lines = rows.map((row) => [row.channel_id, row.country, row.status, ...SKIN_AXES.map((axis) => String(row.dna?.[axis] ?? "-"))]);
  const widths = header.map((_, i) => Math.max(header[i].length, ...lines.map((line) => line[i].length)));
  return [header, ...lines].map((line) => line.map((cell, i) => cell.padEnd(widths[i])).join("  ")).join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const opts = args(argv);
  const plan = planSkins({ dir: opts.dir, variantId: opts.variant });
  console.log(table(plan.rows));
  if (opts.json) fs.writeFileSync(opts.json, `${JSON.stringify({ variant: plan.variant.id, rows: plan.rows, violations: plan.violations }, null, 2)}\n`);
  if (plan.violations.length) {
    console.error(`${plan.violations.length} same-country pair(s) break the skin rule, e.g. ${JSON.stringify(plan.violations[0])}`);
    process.exitCode = 1;
    return;
  }
  if (!opts.apply) { console.log(`dry-run: ${plan.rows.filter((row) => row.status !== "kept").length} channel(s) would change (use --apply)`); return; }
  const written = applySkins(plan);
  console.log(`wrote ${written.length} channel config(s)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); } catch (error) { console.error(`[assign-skins] ${error.message}`); process.exitCode = 1; }
}
