#!/usr/bin/env node
// Build a video's index.html from tools/template/index.html + a spec.
//
//   node tools/build-composition.mjs <slug> spec.json
//
// The template is the frozen 3-zone layout (DESIGN.md): palette, fonts, cat MC,
// timeline and helpers all live there. Only content is injected — labels, the
// two card icons, 12 captions, and the audio/timing block.
//
// Caption markup contract (so the spec stays plain text):
//   [[RAM]]  -> topic name, sage ink  — only the two hook lines use this
//   *FAST,*  -> keyword, terracotta ink — the "difference" words
// Punctuation goes INSIDE the marker (`*FAST,*`), because .kw carries 8px of
// side margin and a comma left outside opens an ugly gap.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeTiming, gapsFor, readDurations } from "./retime.mjs";
import { getCountryTheme, formatPaletteCss } from "./themes/index.mjs";
import { detectSfxCues, computeDuckedBgmSegments, generateCinemaAudioHtml, copyCinemaSfxFiles } from "./auto-sfx.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(__dirname, "template", "index.html");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** [[name]] and *keyword* -> the two .kw variants the palette defines. */
export function captionHtml(text, n) {
  let i = 0;
  const out = esc(text)
    .replace(/\[\[(.+?)\]\]/g, (_, w) =>
      `<span data-hf-id="hf-k${n}${i++}" class="kw" style="color: var(--accent-sage-ink)">${w}</span>`)
    .replace(/\*(.+?)\*/g, (_, w) => `<span data-hf-id="hf-k${n}${i++}" class="kw">${w}</span>`);
  return `          <div data-hf-id="hf-c${String(n).padStart(2, "0")}" class="caption-line" id="line-${n}"><span data-hf-id="hf-t${String(n).padStart(2, "0")}" class="caption-line-text">${out}</span></div>`;
}

/** An icon is either inline SVG or an uploaded image; both get .icon-art. */
function iconHtml(icon, side) {
  if (!icon) return `            <!-- ${side} icon chưa có -->`;
  if (icon.type === "image") {
    const alt = esc(icon.alt ?? "");
    return `            <img data-hf-id="hf-ic-${side}" class="icon-art" src="${esc(icon.src)}" alt="${alt}" />`;
  }
  let svg = String(icon.svg ?? "").trim();
  if (!svg.startsWith("<svg")) throw new Error(`icon ${side}: cần thẻ <svg> hoặc type "image"`);
  // The template owns sizing, so drop width/height — but ONLY on the opening
  // <svg> tag. A blanket replace also strips them from child <rect>s, which
  // silently renders an empty icon.
  svg = svg.replace(/^<svg[^>]*>/, (open) =>
    open
      .replace(/\s(width|height)="[^"]*"/g, "")
      .replace(/^<svg/, `<svg data-hf-id="hf-ic-${side}" class="icon-art"`),
  );
  return svg
    .split("\n")
    .map((l) => "            " + l.trim())
    .join("\n");
}

export function buildComposition(slug, spec) {
  const dir = path.join(REPO_ROOT, "videos", slug);
  if (!fs.existsSync(dir)) throw new Error(`không có thư mục videos/${slug}`);

  const captions = spec.captions ?? [];
  const count = captions.length;
  if (count < 8 || count > 30)
    throw new Error(`số lượng caption không hợp lệ (${count}), cần từ 8 đến 30 dòng (chuẩn 20 dòng cho 65-70s, hoặc 12 dòng cũ)`);

  const durations = readDurations(dir);
  if (durations.length !== count)
    throw new Error(`durations.json có ${durations.length} dòng, nhưng kịch bản có ${count} dòng — chạy scripts/generate-vo.mjs trước`);
  const { start, root } = computeTiming(durations, gapsFor(count));

  const audio = durations
    .map((d, i) => {
      const n = i + 1;
      return `      <audio data-hf-id="hf-a${String(n).padStart(2, "0")}" id="vo-${n}" src="assets/vo/line-${n}.mp3" data-start="${start[i]}" data-duration="${d}" data-track-index="20"></audio>`;
    })
    .join("\n");

  const vo =
    "      const VO = {\n" +
    durations.map((d, i) => `        ${i + 1}: { start: ${start[i]}, dur: ${d} },\n`).join("") +
    "      };";

  const lang = spec.lang ?? "en";
  const theme = getCountryTheme(lang);
  const paletteCss = formatPaletteCss(theme.palette);

  const bgmTrack = spec.bgmTrack ?? "monkeys-spinning";
  const bgmVolume = Number.isFinite(spec.bgmVolume) ? Number(spec.bgmVolume) : 0.18;
  const enableSfx = spec.enableSfx !== false;

  const audioDir = path.join(dir, "assets", "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  let bgmHtml = "";
  if (bgmTrack && bgmTrack !== "none") {
    const srcBgm = path.join(REPO_ROOT, "shared", "audio", "bgm", `${bgmTrack}.mp3`);
    if (fs.existsSync(srcBgm)) {
      fs.copyFileSync(srcBgm, path.join(audioDir, "bgm.mp3"));
      const bgmSegments = computeDuckedBgmSegments({
        totalDuration: root,
        voiceIntervals: captions.map((c, i) => ({ start: start[i], dur: durations[i] })),
        ambientVol: bgmVolume,
        boostVol: Math.min(0.4, Number((bgmVolume * 1.8).toFixed(2))),
      });
      bgmHtml = [
        `      <!-- 🎵 Cinema Soundscape: Smart Ducked BGM (Track 30) -->`,
        ...bgmSegments.map(
          (seg, idx) =>
            `      <audio id="bgm-seg-${idx + 1}" class="clip" src="assets/audio/bgm.mp3" data-start="${seg.start}" data-duration="${seg.duration}" data-media-start="${seg.mediaStart}" data-track-index="30" data-volume="${seg.volume}"></audio>`
        ),
      ].join("\n");
    } else {
      console.warn(`[warn] không tìm thấy BGM: ${srcBgm}`);
    }
  }

  let sfxHtml = "";
  if (enableSfx) {
    const sfxCues = detectSfxCues({
      archetype: "compare",
      items: captions.map((c, i) => ({ start: start[i], dur: durations[i], text: c })),
      totalDuration: root,
    });
    copyCinemaSfxFiles(dir, sfxCues);
    sfxHtml = [
      `      <!-- 💥 Cinema Soundscape: Auto-SFX Multi-Track Cues (Track 10-11) -->`,
      ...sfxCues.map(
        (c) =>
          `      <audio id="${c.id}" class="clip" src="assets/audio/sfx/${c.sfxId}.mp3" data-start="${c.start}" data-duration="${c.duration}" data-track-index="${c.track}" data-volume="${c.volume}"></audio> <!-- ${c.reason} -->`
      ),
    ].join("\n");
  }

  const html = fs
    .readFileSync(TEMPLATE, "utf8")
    .replace("{{TITLE}}", esc(spec.title ?? `Knowledge Compare — ${spec.labelLeft} vs ${spec.labelRight}`))
    .replace("{{LANG}}", esc(lang))
    .replace("{{LABEL_LEFT}}", esc(spec.labelLeft))
    .replace("{{LABEL_RIGHT}}", esc(spec.labelRight))
    .replace("{{ICON_LEFT}}", iconHtml(spec.iconLeft, "left"))
    .replace("{{ICON_RIGHT}}", iconHtml(spec.iconRight, "right"))
    .replace("{{THEME_PALETTE}}", paletteCss)
    .replace("{{MASCOT_CSS}}", theme.mascotCss)
    .replace("{{MASCOT_HTML}}", theme.mascotHtml)
    .replace("{{CAPTIONS}}", captions.map((c, i) => captionHtml(c, i + 1)).join("\n"))
    .replace("{{BGM_AUDIO}}", bgmHtml)
    .replace("{{SFX_AUDIO}}", sfxHtml)
    .replace("{{AUDIO}}", audio)
    .replace("{{VO}}", vo)
    .replaceAll("{{ROOT}}", String(root));

  const left = html.match(/\{\{[A-Z_]+\}\}/g);
  if (left) throw new Error(`token chưa thay hết: ${[...new Set(left)].join(", ")}`);

  fs.writeFileSync(path.join(dir, "index.html"), html);
  return { slug, root, lines: 12 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, specPath] = process.argv.slice(2);
  if (!slug || !specPath) {
    console.error("dùng: node tools/build-composition.mjs <slug> <spec.json>");
    process.exit(1);
  }
  const out = buildComposition(slug, JSON.parse(fs.readFileSync(specPath, "utf8")));
  console.log(`${out.slug}: dựng xong index.html, ROOT_DURATION = ${out.root}s`);
}
