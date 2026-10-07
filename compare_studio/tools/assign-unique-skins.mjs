#!/usr/bin/env node
// "1 skin = 1 acc" (owner 07/10): mỗi tài khoản giữ MỘT engine và MỘT bố cục (variant + composition) mà không tài khoản nào
// khác cùng nước dùng. Ghép tài khoản ↔ bố cục bằng ghép cặp chi phí nhỏ nhất theo nước (engine hợp niche hơn, engine kênh
// đang dùng và variant đang có rẻ hơn), rồi chọn DNA còn lại xa nhất với các acc cùng nước + cùng engine (luật ≥ 4 trục).
// Compare là engine theo đề tài: acc nhận compare đi đường variant_id (topic từ pack versus của variant), chỉ khi pack của
// variant phục vụ niche + ngôn ngữ của acc. Kênh vector giữ riêng vector (DNA cast riêng trong vector_dna.json).
// Dry-run mặc định; --apply ghi YAML (+1 config_version). Chạy khi Autopilot tạm dừng, rồi matrix_config.sync_channel_configs.
//
//   node tools/assign-unique-skins.mjs [--json plan.json] [--apply]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";
import { listVariants, isAutoAssignable } from "../matrix/render/variants/index.mjs";
import { SKIN_AXES, STRUCTURAL_AXES, skinCandidates, skinDistance, skinViolations } from "../matrix/render/variants/skins.mjs";
import { NICHE_VARIANTS, KEEP_ONLY_VARIANTS } from "./assign-skins.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANNEL_DIR = path.join(ROOT, "config/channels");
const LANGS = ["de", "en", "ko", "ja"];
const ENGINES = ["mystery", "newspaper", "vox", "folklore", "kinetic", "science", "tierlist", "survival", "chalk", "wildlife"];

const hash = (...parts) => crypto.createHash("sha256").update(parts.join("|")).digest().readUInt32BE(0) / 2 ** 32;

function loadMatrix() {
  const doc = YAML.parse(fs.readFileSync(path.join(ROOT, "config/compatibility_matrix.yaml"), "utf8"));
  return { min: doc.minimum_score, scores: Object.fromEntries(doc.niches.map((n) => [n.id, n.scores])) };
}

function loadPacks() {
  const dir = path.join(ROOT, "config/topic_packs");
  return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".yaml"))
    .map((f) => YAML.parse(fs.readFileSync(path.join(dir, f), "utf8"))).map((p) => [p.id, p]));
}

export function loadAccounts(dir = CHANNEL_DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort().map((name) => {
    const file = path.join(dir, name);
    const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
    const data = doc.toJS() || {};
    return { file, doc, data, channel_id: data.channel_id, niche: data.niche_id, lang: String(data.publishing?.language || "").slice(0, 2) };
  }).filter((a) => LANGS.includes(a.lang));
}

/** Mọi bố cục (variant × composition) một acc có thể nhận, kèm chi phí. */
function slotsFor(account, variants, matrix, packs) {
  const creative = account.data.creative || {};
  const current = new Set(creative.preferred_engines || []);
  const scores = matrix.scores[account.niche] || {};
  const owned = new Set([creative.variant_id, ...Object.values(creative.skins || {}).map((s) => s?.variant_id)].filter(Boolean));
  const out = [];
  for (const v of variants) {
    if (!v.compatibility.countries.includes(account.lang)) continue;
    let score = scores[v.engine] ?? 0;
    if (v.engine === "compare") {
      const servesNiche = Object.keys(v.contentProfile?.topicPacks || {}).some((id) => {
        const pack = packs[id];
        return pack?.niches?.includes(account.niche) && (!pack.languages || pack.languages.includes(account.lang));
      });
      if (!servesNiche) continue;
      // Owner 07/10: compare là skin riêng của acc niche hợp → ưu tiên lấp hết bố cục compare (chi phí thấp nhất).
      score = 1;
    } else {
      if (!ENGINES.includes(v.engine) || score < matrix.min) continue;
      const nicheList = NICHE_VARIANTS[v.engine];
      const pinned = (KEEP_ONLY_VARIANTS[v.engine] || []).includes(v.id) && owned.has(v.id);
      if (nicheList && !pinned && !(nicheList[account.niche] || []).includes(v.id)) continue;
      if (!isAutoAssignable(v) && !pinned) continue;
    }
    for (const composition of Object.keys(v.visualProfile.compositions)) {
      const cost = (1 - score) * 10 + (current.has(v.engine) || v.engine === "compare" ? 0 : 4) + (owned.has(v.id) ? -1 : 0)
        + (pinnedBonus(v, owned)) + hash(account.channel_id, v.id, composition) * 0.5;
      out.push({ key: `${v.id}#${composition}`, variant: v, composition, cost });
    }
  }
  return out;
}
const pinnedBonus = (v, owned) => (Object.values(KEEP_ONLY_VARIANTS).flat().includes(v.id) && owned.has(v.id) ? -20 : 0);

/** Ghép chi phí nhỏ nhất (đường tăng ngắn nhất, Bellman-Ford trên đồ thị dư). Trả map acc → slot hoặc null. */
export function minCostMatch(accounts, edgesOf) {
  const slotIds = [...new Set(accounts.flatMap((a) => edgesOf(a).map((e) => e.key)))].sort();
  const slotIdx = new Map(slotIds.map((k, i) => [k, i]));
  const n = accounts.length;
  const edges = accounts.map((a) => edgesOf(a).map((e) => ({ ...e, s: slotIdx.get(e.key) })));
  const matchA = new Array(n).fill(-1);       // acc → edge index
  const ownerS = new Array(slotIds.length).fill(-1);  // slot → acc
  for (let start = 0; start < n; start += 1) {
    // Khoảng cách tới từng slot từ acc `start` qua đường xen kẽ.
    const dist = new Array(slotIds.length).fill(Infinity);
    const prev = new Array(slotIds.length).fill(null);
    for (const e of edges[start]) if (e.cost < dist[e.s]) { dist[e.s] = e.cost; prev[e.s] = { acc: start, e }; }
    for (let iter = 0; iter < n + 2; iter += 1) {
      let changed = false;
      for (let s = 0; s < slotIds.length; s += 1) {
        const owner = ownerS[s];
        if (owner < 0 || dist[s] === Infinity) continue;
        const back = dist[s] - edges[owner][matchA[owner]].cost;
        for (const e of edges[owner]) {
          if (e.s === s) continue;
          const d = back + e.cost;
          if (d < dist[e.s] - 1e-9) { dist[e.s] = d; prev[e.s] = { acc: owner, e }; changed = true; }
        }
      }
      if (!changed) break;
    }
    let best = -1;
    for (let s = 0; s < slotIds.length; s += 1) if (ownerS[s] < 0 && dist[s] < Infinity && (best < 0 || dist[s] < dist[best])) best = s;
    if (best < 0) continue;
    let s = best;
    const seen = new Set();
    while (s >= 0 && !seen.has(s)) {
      seen.add(s);
      const { acc, e } = prev[s];
      const old = matchA[acc] >= 0 ? edges[acc][matchA[acc]].s : -1;
      matchA[acc] = edges[acc].indexOf(e);
      ownerS[s] = acc;
      if (acc === start) break;
      s = old;
    }
  }
  return accounts.map((a, i) => (matchA[i] >= 0 ? edges[i][matchA[i]] : null));
}

function pickDna(account, variant, composition, taken) {
  let best = null;
  for (const dna of skinCandidates(variant)) {
    if (dna.composition !== composition) continue;
    let min = Infinity;
    let sum = 0;
    for (const other of taken) {
      const d = skinDistance(dna, other);
      const score = STRUCTURAL_AXES.some((axis) => dna[axis] !== other[axis]) ? d : d - SKIN_AXES.length;
      min = Math.min(min, score);
      sum += d;
    }
    const tie = hash(account.channel_id, variant.id, SKIN_AXES.map((a) => dna[a]).join("/"));
    if (!best || min > best.min || (min === best.min && (sum > best.sum || (sum === best.sum && tie < best.tie)))) best = { dna, min, sum, tie };
  }
  return best.dna;
}

export function planUniqueSkins({ dir = CHANNEL_DIR } = {}) {
  const variants = listVariants().filter((v) => v.status === "active");
  const matrix = loadMatrix();
  const packs = loadPacks();
  const accounts = loadAccounts(dir);
  const rows = [];
  for (const lang of LANGS) {
    const group = accounts.filter((a) => a.lang === lang && !(a.data.creative?.preferred_engines || []).includes("vector"));
    for (const a of accounts.filter((x) => x.lang === lang && (x.data.creative?.preferred_engines || []).includes("vector"))) {
      rows.push({ channel_id: a.channel_id, country: lang, niche: a.niche, engine: "vector", variant_id: null, composition: null, dna: null, status: "vector" });
    }
    const cache = new Map(group.map((a) => [a.channel_id, slotsFor(a, variants, matrix, packs)]));
    const match = minCostMatch(group, (a) => cache.get(a.channel_id));
    const taken = {};  // engine → DNA đã gán cùng nước
    group.forEach((a, i) => {
      const slot = match[i];
      if (!slot) { rows.push({ channel_id: a.channel_id, country: lang, niche: a.niche, engine: null, status: "no_slot" }); return; }
      const engine = slot.variant.engine;
      taken[engine] ||= [];
      const dna = pickDna(a, slot.variant, slot.composition, taken[engine]);
      taken[engine].push(dna);
      const was = a.data.creative || {};
      const same = (was.preferred_engines || []).length === 1 && was.preferred_engines[0] === engine
        && (engine === "compare" ? was.variant_id === slot.variant.id : was.skins?.[engine]?.variant_id === slot.variant.id)
        && (engine === "compare" ? was.dna : was.skins?.[engine]?.dna)?.composition === slot.composition;
      rows.push({ channel_id: a.channel_id, country: lang, niche: a.niche, engine, variant_id: slot.variant.id, composition: slot.composition, dna, status: same ? "same" : "change" });
    });
  }
  const violations = [];
  for (const lang of LANGS) for (const engine of [...ENGINES, "compare"]) {
    violations.push(...skinViolations(rows.filter((r) => r.country === lang && r.engine === engine && r.dna)).map((v) => ({ ...v, engine })));
  }
  const keys = rows.filter((r) => r.variant_id).map((r) => `${r.country}:${r.variant_id}#${r.composition}`);
  const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
  return { accounts, rows, violations, duplicates };
}

export function applyUniqueSkins({ accounts, rows }) {
  const byId = new Map(accounts.map((a) => [a.channel_id, a]));
  const written = [];
  for (const row of rows) {
    if (row.status === "same" || row.status === "no_slot") continue;
    const { file, doc } = byId.get(row.channel_id);
    if (row.engine === "vector") {
      if ((doc.getIn(["creative", "preferred_engines"])?.toJSON?.() || []).length === 1) continue;
      doc.setIn(["creative", "preferred_engines"], doc.createNode(["vector"]));
      doc.deleteIn(["creative", "skins"]);
    } else {
      doc.setIn(["creative", "preferred_engines"], doc.createNode([row.engine]));
      if (row.engine === "compare") {
        doc.deleteIn(["creative", "skins"]);
        doc.setIn(["creative", "variant_id"], row.variant_id);
        doc.setIn(["creative", "dna"], doc.createNode(row.dna));
      } else {
        doc.deleteIn(["creative", "variant_id"]);
        doc.deleteIn(["creative", "dna"]);
        doc.setIn(["creative", "skins"], doc.createNode({ [row.engine]: { variant_id: row.variant_id, dna: row.dna } }));
      }
    }
    doc.set("config_version", Number(doc.get("config_version") || 1) + 1);
    fs.writeFileSync(file, doc.toString({ lineWidth: 0, indentSeq: false }));
    written.push(file);
  }
  return written;
}

function summary(rows) {
  const out = {};
  for (const r of rows) {
    out[r.country] ||= {};
    const k = r.engine || "NO_SLOT";
    out[r.country][k] = (out[r.country][k] || 0) + 1;
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const plan = planUniqueSkins();
  const jsonAt = argv.indexOf("--json");
  if (jsonAt >= 0) fs.writeFileSync(argv[jsonAt + 1], `${JSON.stringify({ rows: plan.rows, violations: plan.violations, duplicates: plan.duplicates }, null, 1)}\n`);
  console.log(JSON.stringify(summary(plan.rows)));
  const missing = plan.rows.filter((r) => r.status === "no_slot");
  console.log(`changes ${plan.rows.filter((r) => r.status === "change").length}, no_slot ${missing.length} ${missing.map((r) => `${r.channel_id}(${r.niche})`).join(" ")}`);
  if (plan.violations.length || plan.duplicates.length) {
    console.error(`violations ${plan.violations.length}, duplicate layouts ${plan.duplicates.length}`, plan.violations[0] || plan.duplicates[0]);
    process.exitCode = 1;
    return;
  }
  if (!argv.includes("--apply")) { console.log("dry-run (use --apply)"); return; }
  if (missing.length) { console.error("refusing to apply while accounts have no layout"); process.exitCode = 1; return; }
  console.log(`wrote ${applyUniqueSkins(plan).length} channel config(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(`[assign-unique-skins] ${error.stack}`); process.exitCode = 1; }
}
