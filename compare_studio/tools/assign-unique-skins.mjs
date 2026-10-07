#!/usr/bin/env node
// "1 skin = 1 acc" (owner 07/10): mỗi tài khoản giữ MỘT engine và MỘT bố cục (variant + composition) mà không tài khoản nào
// khác cùng nước dùng. Ghép tài khoản ↔ bố cục bằng ghép cặp chi phí nhỏ nhất theo nước (engine hợp niche hơn, engine kênh
// đang dùng và variant đang có rẻ hơn), rồi chọn DNA còn lại xa nhất với các acc cùng nước + cùng engine (luật ≥ 4 trục).
// Compare là engine theo đề tài: acc nhận compare đi đường variant_id (topic từ pack versus của variant), chỉ khi pack của
// variant phục vụ niche + ngôn ngữ của acc. Kênh vector giữ riêng vector (DNA cast riêng trong vector_dna.json).
// Dry-run mặc định; --apply ghi YAML (+1 config_version). Chạy khi Autopilot tạm dừng, rồi matrix_config.sync_channel_configs.
//
//   node tools/assign-unique-skins.mjs [--global [--accounts list.txt]] [--json plan.json] [--apply]
//   --global: một bố cục cho đúng MỘT tài khoản trên mọi nước (owner 07/10), chỉ các kênh trong config/unique_skin_accounts.txt.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";
import { listVariants, isAutoAssignable } from "../matrix/render/variants/index.mjs";
import { SKIN_AXES, STRUCTURAL_AXES, skinCandidates, skinDistance, skinPairOk, skinViolations } from "../matrix/render/variants/skins.mjs";
import { NICHE_VARIANTS, KEEP_ONLY_VARIANTS } from "./assign-skins.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANNEL_DIR = path.join(ROOT, "config/channels");
const LANGS = ["de", "en", "ko", "ja"];
const ENGINES = ["mystery", "newspaper", "vox", "folklore", "kinetic", "science", "tierlist", "survival", "chalk", "wildlife"];

/** Danh sách kênh của chế độ --global (mặc định): kênh gắn tài khoản TikTok, trừ tài khoản remake. */
export const ACCOUNTS_FILE = path.join(ROOT, "config/unique_skin_accounts.txt");
export function readAccounts(file = ACCOUNTS_FILE) {
  return new Set(fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/u)[0]));
}

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

/**
 * `only` = danh sách channel_id được gán (tài khoản TikTok đang map trong Autopilot, trừ tài khoản remake); `global` =
 * một bố cục chỉ thuộc MỘT tài khoản trên mọi nước (owner 07/10), thay vì một tài khoản mỗi nước.
 */
export function planUniqueSkins({ dir = CHANNEL_DIR, only = null, global = false } = {}) {
  const variants = listVariants().filter((v) => v.status === "active");
  const matrix = loadMatrix();
  const packs = loadPacks();
  const all = loadAccounts(dir);
  const accounts = all.filter((a) => !only || only.has(a.channel_id));
  const isVector = (a) => (a.data.creative?.preferred_engines || []).includes("vector");
  const storedSkin = (a, engine) => (engine === "compare" ? (a.data.creative?.dna ? { variant_id: a.data.creative.variant_id, dna: a.data.creative.dna } : null) : a.data.creative?.skins?.[engine]);
  const taken = {};  // "<nước>:<engine>" → DNA đã gán (luật ≥ 4 trục của validator tính theo nước + engine)
  // Giữ DNA đang lưu nếu đúng bố cục và còn đạt luật với các acc đã gán; không thì chọn DNA mới.
  const settle = (a, variant, composition) => {
    const bucket = `${a.lang}:${variant.engine}`;
    taken[bucket] ||= [];
    const stored = storedSkin(a, variant.engine);
    const keep = stored?.variant_id === variant.id && stored.dna?.composition === composition
      && taken[bucket].every((other) => skinPairOk(stored.dna, other));
    const dna = keep ? stored.dna : pickDna(a, variant, composition, taken[bucket]);
    taken[bucket].push(dna);
    return { dna, keep };
  };
  const rows = [];
  const placed = new Set();
  for (const lang of global ? ["*"] : LANGS) {
    const inLang = (a) => lang === "*" || a.lang === lang;
    // Kênh có tài khoản TikTok đứng trước: ghép tăng dần không bao giờ bỏ một kênh đã ghép, nên kênh ngoài danh sách
    // (chưa gắn tài khoản) chỉ lấy bố cục còn trống.
    const pool = global && only ? all : accounts;
    const group = pool.filter((a) => inLang(a) && !isVector(a))
      .sort((a, b) => Number(!only?.has(a.channel_id)) - Number(!only?.has(b.channel_id)));
    for (const a of accounts.filter((x) => inLang(x) && isVector(x))) {
      rows.push({ channel_id: a.channel_id, country: a.lang, niche: a.niche, engine: "vector", variant_id: null, composition: null, dna: null, status: "vector" });
    }
    const cache = new Map(group.map((a) => [a.channel_id, slotsFor(a, variants, matrix, packs)]));
    const match = minCostMatch(group, (a) => cache.get(a.channel_id));
    group.forEach((a, i) => {
      const slot = match[i];
      if (!slot) {
        if (only && !only.has(a.channel_id)) return;  // kênh ngoài danh sách hết chỗ: xử lý ở vòng "ngoài danh sách" dưới
        rows.push({ channel_id: a.channel_id, country: a.lang, niche: a.niche, engine: null, status: "no_slot" });
        return;
      }
      const engine = slot.variant.engine;
      const { dna, keep } = settle(a, slot.variant, slot.composition);
      const was = a.data.creative || {};
      const same = keep && (was.preferred_engines || []).length === 1 && was.preferred_engines[0] === engine;
      rows.push({ channel_id: a.channel_id, country: a.lang, niche: a.niche, engine, variant_id: slot.variant.id, composition: slot.composition, dna, status: same ? "same" : "change" });
      placed.add(a.channel_id);
    });
  }
  // Kênh ngoài danh sách (chưa gắn tài khoản TikTok, hoặc tài khoản remake) không còn bố cục trống: bỏ skin (đường
  // legacy) để không kênh nào giữ bố cục của tài khoản đang đăng (owner 07/10: "tách ra những cái 2 tài khoản").
  // Kênh compare chỉ chạy qua variant_id → về engine có điểm cao nhất của niche. Gắn tài khoản sau → chạy lại tool.
  if (only) {
    for (const a of all.filter((x) => !only.has(x.channel_id) && !isVector(x) && !placed.has(x.channel_id))) {
      const c = a.data.creative || {};
      const engines = c.preferred_engines || [];
      const has = Boolean(c.skins && Object.keys(c.skins).length) || Boolean(c.variant_id);
      const scores = matrix.scores[a.niche] || {};
      const engine = engines[0] === "compare" ? ENGINES.filter((e) => (scores[e] ?? 0) >= matrix.min).sort((x, y) => scores[y] - scores[x])[0] : engines[0];
      rows.push({ channel_id: a.channel_id, country: a.lang, niche: a.niche, engine, variant_id: null, composition: null, dna: null, status: has ? "unskin" : "same", outside: true });
    }
  }
  const violations = [];
  for (const lang of LANGS) for (const engine of [...ENGINES, "compare"]) {
    violations.push(...skinViolations(rows.filter((r) => r.country === lang && r.engine === engine && r.dna)).map((v) => ({ ...v, engine })));
  }
  const keys = rows.filter((r) => r.variant_id && !r.outside).map((r) => `${global ? "*" : r.country}:${r.variant_id}#${r.composition}`);
  const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
  return { accounts: all, rows, violations, duplicates };
}

export function applyUniqueSkins({ accounts, rows }) {
  const byId = new Map(accounts.map((a) => [a.channel_id, a]));
  const written = [];
  for (const row of rows) {
    if (row.status === "same" || row.status === "no_slot" || row.status === "outside") continue;
    const { file, doc } = byId.get(row.channel_id);
    if (row.status === "unskin") {
      doc.setIn(["creative", "preferred_engines"], doc.createNode([row.engine]));
      for (const key of ["skins", "variant_id", "dna"]) doc.deleteIn(["creative", key]);
    } else if (row.engine === "vector") {
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
  // --accounts <file>: một channel_id mỗi dòng (cột đầu), vd `sqlite3 autopilot.db "select matrix_channel_id from autopilot_channel_map"`.
  const accAt = argv.indexOf("--accounts");
  const global = argv.includes("--global");
  const only = accAt >= 0 ? readAccounts(argv[accAt + 1]) : global ? readAccounts(ACCOUNTS_FILE) : null;
  const plan = planUniqueSkins({ only, global });
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
