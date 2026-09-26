#!/usr/bin/env node
// Turn a plain-text 12-line script into the spec that build-composition.mjs eats.
// This replaces the old Claude API step: the script is written by a human (or by
// Claude in chat) and pasted in, so nothing here needs a network call or a key.
//
//   node tools/parse-script.mjs script.txt --left Crow --right Raven [--lang en]
//
// SCRIPT FORMAT — 12 non-empty lines, blank lines and `#` comments ignored.
// One line carries both jobs, because the caption markup is exactly what the
// voice must NOT read:
//
//   This is a [[Crow]].              -> spoken "This is a Crow."   caption keeps [[Crow]]
//   One caws *FLAT,* the other *CROAKS.*
//
// When the two really differ, split them with `||`:
//
//   RAM forgets everything || [[RAM]] forgets *EVERYTHING*
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

/** Caption markup off, so the TTS voice never says "star" or "bracket". */
export const stripMarkup = (s) =>
  s.replace(/\[\[(.+?)\]\]/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/\s+/g, " ").trim();

export const slugify = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function parseScript(text) {
  const rows = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (rows.length !== 12) throw new Error(`kịch bản cần đúng 12 dòng, đang có ${rows.length}`);

  return rows.map((row, i) => {
    const [a, b] = row.split("||");
    const caption = (b ?? a).trim();
    const spoken = b === undefined ? stripMarkup(a) : a.trim();
    if (!spoken || !caption) throw new Error(`dòng ${i + 1} rỗng một vế`);
    return { n: i + 1, spoken, caption };
  });
}

/** An icon slot is a file the user picked, or SVG source pasted in. */
function normaliseIcon(icon, side) {
  if (!icon) return undefined;
  if (typeof icon === "string") return { type: "file", src: icon }; // path on disk
  if (icon.type === "file" || icon.path) return { type: "file", src: icon.src ?? icon.path };
  const svg = String(icon.svg ?? "").trim();
  if (!svg) return undefined;
  if (!svg.startsWith("<svg")) throw new Error(`icon ${side}: cần bắt đầu bằng thẻ <svg>`);
  // The SVG is inlined into the composition, which must stay deterministic
  // (CLAUDE.md rule 6) — no script, no event handlers, no remote refs.
  if (/<script|\son[a-z]+\s*=|https?:\/\//i.test(svg))
    throw new Error(`icon ${side}: SVG không được chứa <script>, thuộc tính on*, hay link ra ngoài`);
  return { type: "svg", svg };
}

/** form (from the studio, or hand-written JSON) -> spec for build-composition. */
export function buildSpec(form) {
  const labelLeft = String(form.labelLeft ?? "").trim();
  const labelRight = String(form.labelRight ?? "").trim();
  if (!labelLeft || !labelRight) throw new Error("cần cả labelLeft và labelRight");

  const text = form.script ?? (form.scriptPath ? fs.readFileSync(form.scriptPath, "utf8") : "");
  const lines = parseScript(text);
  const lang = form.lang ?? "en";
  const slug = form.slug?.trim() || `${slugify(labelLeft)}-vs-${slugify(labelRight)}`;
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`slug không hợp lệ: ${slug}`);

  return {
    slug,
    lang,
    title: `Knowledge Compare — ${labelLeft} vs ${labelRight}`,
    labelLeft,
    labelRight,
    message: (form.message ?? "").trim() || `${labelLeft} vs ${labelRight}`,
    captions: lines.map((l) => l.caption),
    spoken: lines.map((l) => l.spoken),
    iconLeft: normaliseIcon(form.iconLeft, "left"),
    iconRight: normaliseIcon(form.iconRight, "right"),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flag = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i > -1 ? argv[i + 1] : def;
  };
  const file = argv.find((x) => !x.startsWith("--") && !argv[argv.indexOf(x) - 1]?.startsWith("--"));
  if (!file || !flag("left") || !flag("right")) {
    console.error('dùng: node tools/parse-script.mjs script.txt --left "Crow" --right "Raven" [--lang en] [--out spec.json]');
    process.exit(1);
  }
  const spec = buildSpec({
    scriptPath: file,
    labelLeft: flag("left"),
    labelRight: flag("right"),
    lang: flag("lang", "en"),
    slug: flag("slug"),
    message: flag("message"),
  });
  const out = flag("out", path.join(REPO_ROOT, `spec-${spec.slug}.json`));
  fs.writeFileSync(out, JSON.stringify(spec, null, 2));
  console.log(out);
}
