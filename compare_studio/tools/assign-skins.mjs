#!/usr/bin/env node
// Gán "bộ da" cố định cho mọi kênh dùng một engine (docs/PLAN_compare_per_country.md mục 2, lớp 2).
// Mặc định chỉ in bảng (dry-run). --apply ghi creative.skins.<engine> vào YAML kênh và tăng config_version +1
// (matrix_config.sync_channel_configs từ chối config đổi mà giữ nguyên version).
// Kênh đã có bộ da hợp lệ được giữ nguyên; chạy lại chỉ gán cho kênh mới. Chỉ chạy khi Autopilot đang tạm dừng.
//
//   node tools/assign-skins.mjs --variant newspaper/front-page [--niches a,b] [--apply] [--json <plan.json>]
//   node tools/assign-skins.mjs --by-niche survival [--niches a,b] [--apply]   (variant theo niche, NICHE_VARIANTS)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { getVariant } from "../matrix/render/variants/index.mjs";
import { SKIN_AXES, assignSkins, skinViolations } from "../matrix/render/variants/skins.mjs";

const CHANNEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config/channels");

/**
 * Engine có nhiều variant: variant nào hợp niche nào (--by-niche <engine>). Bộ da chỉ đổi hình (topic vẫn theo niche),
 * nên mỗi niche liệt kê các variant có đề tài/brief gần nó (topic pack của variant), variant hợp nhất đứng đầu:
 * - survival: ocean_mysteries → deep-sea (survival_deep_ocean) + extreme-cold (biển sâu lạnh tối);
 *   deep_space → space-exposure (survival_space) + lab-exposure (bức xạ vũ trụ);
 *   medical_anomalies / forbidden_experiments → lab-exposure (radiation/toxic) + no-sleep (deprivation);
 *   extreme_survival → endurance, extreme-cold, extreme-heat, no-sleep, deep-sea (các pack liệt kê extreme_survival);
 *   mega_catastrophes → extreme-heat, extreme-cold, lab-exposure (heat/cold/radiation/toxic);
 *   military_arsenal → endurance, extreme-heat, extreme-cold (giới hạn thể lực người lính, sa mạc, mùa đông);
 *   extreme_wildlife → endurance, extreme-cold, extreme-heat, deep-sea (động vật sống sót nơi cực hạn).
 * Kênh mới nhận variant của niche đang ít kênh nhất CÙNG NƯỚC (hoà → thứ tự danh sách): một variant chỉ chứa được vài
 * acc/nước mà vẫn đạt luật khác biệt (2 layout × vài tone), nên phải rải đều theo nước.
 */
export const NICHE_VARIANTS = Object.freeze({
  survival: Object.freeze({
    ocean_mysteries: ["survival/deep-sea", "survival/extreme-cold"],
    deep_space: ["survival/space-exposure", "survival/lab-exposure"],
    medical_anomalies: ["survival/lab-exposure", "survival/no-sleep"],
    forbidden_experiments: ["survival/lab-exposure", "survival/no-sleep"],
    extreme_survival: ["survival/endurance", "survival/extreme-cold", "survival/extreme-heat", "survival/no-sleep", "survival/deep-sea"],
    mega_catastrophes: ["survival/extreme-heat", "survival/extreme-cold", "survival/lab-exposure"],
    military_arsenal: ["survival/endurance", "survival/extreme-heat", "survival/extreme-cold"],
    extreme_wildlife: ["survival/endurance", "survival/extreme-cold", "survival/extreme-heat", "survival/deep-sea"],
  }),
});

function args(argv) {
  const out = { apply: false, dir: CHANNEL_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--variant") out.variant = argv[++i];
    else if (key === "--by-niche") out.byNiche = argv[++i];
    else if (key === "--niches") out.niches = argv[++i].split(",").map((niche) => niche.trim()).filter(Boolean);
    else if (key === "--apply") out.apply = true;
    else if (key === "--json") out.json = argv[++i];
    else if (key === "--dir") out.dir = argv[++i];
    else throw new Error(`unknown argument ${key}`);
  }
  if (!out.variant === !out.byNiche) throw new Error("exactly one of --variant <engine/slug> or --by-niche <engine> is required");
  return out;
}

export function loadChannels(dir, engine) {
  return fs.readdirSync(dir).filter((name) => /\.ya?ml$/u.test(name)).sort().map((name) => {
    const file = path.join(dir, name);
    const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
    const data = doc.toJS();
    return { file, doc, data };
  // Kênh có creative.variant_id do Creative DNA V2 quản lý (layout + engine chốt trong plan đã duyệt): không gán bộ da.
  }).filter(({ data }) => !data.creative?.variant_id && data.creative?.preferred_engines?.includes(engine)).map((item) => ({
    ...item, channel_id: item.data.channel_id, lang: item.data.publishing?.language, niche: item.data.niche_id, skin: item.data.creative?.skins?.[engine],
  }));
}

const inNiches = (niches) => (channel) => !niches?.length || niches.includes(channel.niche);

export function planSkins({ dir = CHANNEL_DIR, variantId, niches }) {
  const variant = getVariant(variantId, { allowReference: false });
  if (!variant) throw new Error(`variant ${variantId} is unknown or not active`);
  const channels = loadChannels(dir, variant.engine).filter(inNiches(niches));
  const { rows, violations } = assignSkins(channels, variant);
  return { variant, engine: variant.engine, channels, rows: rows.map((row) => ({ ...row, variant_id: variant.id })), violations };
}

/**
 * Gán bộ da theo niche (NICHE_VARIANTS[engine]): mỗi kênh một variant của niche, DNA chọn xa nhất với MỌI bộ da cùng
 * engine + cùng nước (kể cả variant khác), nên luật khác biệt của validator vẫn đúng trên cả engine. Tất định.
 */
export function planNicheSkins({ dir = CHANNEL_DIR, engine, niches, nicheVariants = NICHE_VARIANTS[engine] }) {
  if (!nicheVariants) throw new Error(`no niche → variant map for engine ${engine}`);
  const variants = new Map();
  for (const id of new Set(Object.values(nicheVariants).flat())) {
    const variant = getVariant(id, { allowReference: false });
    if (!variant || variant.engine !== engine) throw new Error(`variant ${id} is unknown, inactive or not ${engine}`);
    variants.set(id, variant);
  }
  const all = loadChannels(dir, engine).sort((a, b) => a.channel_id.localeCompare(b.channel_id));
  const channels = all.filter(inNiches(niches));
  const planned = new Set(channels.map((channel) => channel.channel_id));
  const country = (channel) => String(channel.lang || "").slice(0, 2);
  // Bộ da cố định ngoài kế hoạch (niche bị lọc) vẫn tính khoảng cách.
  const fixed = all.filter((channel) => !planned.has(channel.channel_id) && channel.skin?.dna)
    .map((channel) => ({ channel_id: channel.channel_id, country: country(channel), dna: channel.skin.dna }));
  // Chọn variant: giữ variant hiện có nếu nằm trong danh sách của niche; kênh mới → variant ít kênh nhất cùng nước.
  const counts = new Map();
  const choice = new Map();
  const rows = [];
  const bump = (key, id) => { if (!counts.has(key)) counts.set(key, new Map()); counts.get(key).set(id, (counts.get(key).get(id) || 0) + 1); };
  for (const channel of all) {
    const list = nicheVariants[channel.niche];
    const keep = planned.has(channel.channel_id) ? list?.includes(channel.skin?.variant_id) : Boolean(channel.skin?.dna);
    if (!keep) continue;
    if (planned.has(channel.channel_id)) choice.set(channel.channel_id, channel.skin.variant_id);
    bump(country(channel), channel.skin.variant_id);
  }
  for (const channel of channels) {
    const list = nicheVariants[channel.niche];
    if (!list) { rows.push({ channel_id: channel.channel_id, country: country(channel), status: "unmapped_niche", dna: null, variant_id: null }); continue; }
    if (choice.has(channel.channel_id)) continue;
    const used = counts.get(country(channel)) || new Map();
    const id = list.reduce((best, next) => ((used.get(next) || 0) < (used.get(best) || 0) ? next : best), list[0]);
    choice.set(channel.channel_id, id);
    bump(country(channel), id);
  }
  // Bộ da đang giữ (đúng variant) cũng là cố định cho các variant khác.
  for (const channel of channels) {
    if (channel.skin?.dna && channel.skin.variant_id === choice.get(channel.channel_id)) fixed.push({ channel_id: channel.channel_id, country: country(channel), dna: channel.skin.dna });
  }
  const assigned = [];
  for (const [id, variant] of variants) {
    const group = channels.filter((channel) => choice.get(channel.channel_id) === id);
    if (!group.length) continue;
    const result = assignSkins(group, variant, { others: [...fixed, ...assigned] });
    for (const row of result.rows) {
      rows.push({ ...row, variant_id: row.dna ? id : null });
      if (row.dna && row.status !== "kept") assigned.push({ channel_id: row.channel_id, country: row.country, dna: row.dna });
    }
  }
  rows.sort((a, b) => a.channel_id.localeCompare(b.channel_id));
  const outside = fixed.filter((row) => !planned.has(row.channel_id));
  return { engine, channels, rows, violations: skinViolations([...rows.filter((row) => row.dna), ...outside]) };
}

export function applySkins({ variant, engine = variant.engine, channels, rows }) {
  const byId = new Map(channels.map((channel) => [channel.channel_id, channel]));
  const written = [];
  for (const row of rows) {
    if (!row.dna || row.status === "kept") continue;
    const { file, doc } = byId.get(row.channel_id);
    doc.setIn(["creative", "skins", engine], doc.createNode({ variant_id: row.variant_id || variant.id, dna: row.dna }));
    doc.set("config_version", Number(doc.get("config_version") || 1) + 1);
    fs.writeFileSync(file, doc.toString({ lineWidth: 0, indentSeq: false }));
    written.push(file);
  }
  return written;
}

function table(rows) {
  const header = ["CHANNEL", "COUNTRY", "STATUS", "VARIANT", ...SKIN_AXES.map((axis) => axis.toUpperCase())];
  const lines = rows.map((row) => [row.channel_id, row.country, row.status, String(row.variant_id ?? "-"), ...SKIN_AXES.map((axis) => String(row.dna?.[axis] ?? "-"))]);
  const widths = header.map((_, i) => Math.max(header[i].length, ...lines.map((line) => line[i].length)));
  return [header, ...lines].map((line) => line.map((cell, i) => cell.padEnd(widths[i])).join("  ")).join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const opts = args(argv);
  const plan = opts.byNiche
    ? planNicheSkins({ dir: opts.dir, engine: opts.byNiche, niches: opts.niches })
    : planSkins({ dir: opts.dir, variantId: opts.variant, niches: opts.niches });
  console.log(table(plan.rows));
  if (opts.json) fs.writeFileSync(opts.json, `${JSON.stringify({ engine: plan.engine, variant: plan.variant?.id ?? null, rows: plan.rows, violations: plan.violations }, null, 2)}\n`);
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
