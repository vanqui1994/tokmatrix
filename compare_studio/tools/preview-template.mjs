#!/usr/bin/env node
// Fill tools/template/index.html with stand-in content so it can be opened in a
// browser. The template alone is not viewable: its {{TOKEN}} placeholders sit
// inside the <script>, so a raw open throws before anything paints.
//
//   node tools/preview-template.mjs > preview.html
//
// The studio serves this at /api/template and drives the (paused) timeline from
// the parent page, which is why nothing here injects playback code: the preview
// must stay byte-identical to what a real video gets, apart from its content.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { captionHtml } from "./build-composition.mjs";
import { computeTiming, gapsFor } from "./retime.mjs";
import { getCountryTheme, formatPaletteCss } from "./themes/index.mjs";
import { getSurvivalConfig } from "./survival-languages.mjs";
import { CURATED_MYSTERIES, MYSTERY_LANG_META } from "./mystery-configs.mjs";
import { generateMysteryHtml } from "./create-mystery-video.mjs";
import { VOX_LANG_META, CURATED_VOX_TOPICS } from "./vox-configs.mjs";
import { generateVoxHtml } from "./create-vox-video.mjs";
import { NEWSPAPER_LANG_META, CURATED_NEWSPAPER_TOPICS } from "./newspaper-configs.mjs";
import { generateNewspaperHtml } from "./create-newspaper-video.mjs";
import { KINETIC_LANG_META, CURATED_KINETIC_TOPICS } from "./kinetic-configs.mjs";
import { generateKineticHtml } from "./create-kinetic-video.mjs";
import { WILDLIFE_LANG_META, CURATED_WILDLIFE_TOPICS } from "./wildlife-configs.mjs";
import { generateWildlifeHtml } from "./create-wildlife-video.mjs";
import { CURATED_FOLKLORE, FOLKLORE_LANG_META } from "./folklore-configs.mjs";
import { generateFolkloreHtml, computeFolkloreTiming } from "./create-folklore-video.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(__dirname, "template", "index.html");

// 7-Act Screenplay (20 beats, 65s - 70s):
// Pacing matches a full comparison cut so the preview shows true rhythm.
const DURATIONS = [
  1.5, 1.5, 2.0, // Act 1: Hook (1-3)
  2.4, 2.6, 2.8, // Act 2: Side A Deep-Dive (4-6)
  2.4, 2.6, 2.8, // Act 3: Side B Deep-Dive (7-9)
  2.5, 2.5, 2.5, // Act 4: Head-to-Head Clash (10-12)
  3.0, 3.2,      // Act 5: Real-World Case Study (13-14)
  2.8, 2.8, 3.0, // Act 6: Analogy & Summary (15-17)
  3.0, 2.8, 2.5, // Act 7: Mnemonic, Verdict & Viral CTA (18-20)
];

const BEATS = [
  "hook", "hook", "question",
  "side A", "side A", "side A",
  "side B", "side B", "side B",
  "compare", "compare", "compare",
  "case study", "case study",
  "analogy", "analogy", "summary",
  "rule", "payoff", "cta"
];

const CAPTIONS = [
  "This is [[Side A]].",
  "This is [[Side B]].",
  "Same surface look, but which one do you actually need?",
  "Side A is the *EXPEDIENT* and lightweight choice.",
  "Its design prioritizes *SPEED* and instant response.",
  "It skips heavy handshakes to send data *IMMEDIATELY.*",
  "Side B is built for strict *INTEGRITY* instead.",
  "Every single byte must be checked and *CONFIRMED.*",
  "If a packet drops, it stops to *RETRANSMIT.*",
  "Side A chooses raw *VELOCITY* over perfection.",
  "Side B demands absolute *RELIABILITY* over speed.",
  "Two opposing philosophies for two different missions.",
  "Think of a live video call — glitches are fine, but delays *RUIN* it.",
  "Now think of a bank transaction — a single lost digit is *FATAL.*",
  "Side A is like a *POSTCARD* tossed into the wind.",
  "Side B is like a *REGISTERED* courier with signature required.",
  "Speed versus guaranteed delivery: that is the core battle.",
  "Remember this: live stream uses A, bank vault uses B.",
  "Pick the right tool, and your architecture never falters.",
  "Which one does your current project rely on? Comment below!",
];

/** A generic picture glyph, so the icon slot reads as a filled slot. */
const placeholderIcon = (side) => `<svg data-hf-id="hf-ic-${side}" class="icon-art" viewBox="0 0 260 260">
  <rect x="14" y="30" width="232" height="200" rx="18" fill="var(--fg-on-panel)" opacity="0.16" />
  <circle cx="82" cy="94" r="24" fill="var(--gold)" />
  <path d="M40 208 L108 126 L152 176 L188 144 L226 208 Z" fill="var(--accent-sage)" />
</svg>`;

export function renderTemplatePreview(lang = "en") {
  const { start, root } = computeTiming(DURATIONS, gapsFor(20));
  const theme = getCountryTheme(lang);
  const paletteCss = formatPaletteCss(theme.palette);

  const vo =
    "      const VO = {\n" +
    DURATIONS.map((d, i) => `        ${i + 1}: { start: ${start[i]}, dur: ${d} },\n`).join("") +
    "      };";

  const html = fs
    .readFileSync(TEMPLATE, "utf8")
    .replace("{{TITLE}}", "Template preview")
    .replace("{{LANG}}", String(lang).replace(/[^a-z-]/gi, "") || "en")
    .replace("{{LABEL_LEFT}}", "SIDE A")
    .replace("{{LABEL_RIGHT}}", "SIDE B")
    .replace("{{ICON_LEFT}}", placeholderIcon("left"))
    .replace("{{ICON_RIGHT}}", placeholderIcon("right"))
    .replace("{{THEME_PALETTE}}", paletteCss)
    .replace("{{MASCOT_CSS}}", theme.mascotCss)
    .replace("{{MASCOT_HTML}}", theme.mascotHtml)
    .replace("{{CAPTIONS}}", CAPTIONS.map((c, i) => captionHtml(c, i + 1)).join("\n"))
    // No <audio>: the files do not exist, and 20 failed requests would be the
    // loudest thing in the console of a page meant for reviewing layout.
    .replace("{{BGM_AUDIO}}", "      <!-- preview: không gắn bgm audio -->")
    .replace("{{SFX_AUDIO}}", "      <!-- preview: không gắn sfx audio -->")
    .replace("{{AUDIO}}", "      <!-- preview: không gắn audio -->")
    .replace("{{VO}}", vo)
    .replaceAll("{{ROOT}}", String(root));

  const left = html.match(/\{\{[A-Z_]+\}\}/g);
  if (left) throw new Error(`token chưa thay hết: ${[...new Set(left)].join(", ")}`);
  // timing đi kèm để studio dựng nút nhảy tới từng nhịp
  const timing = DURATIONS.map((d, i) => ({
    n: i + 1,
    start: start[i],
    dur: d,
    beat: BEATS[i],
    caption: CAPTIONS[i],
  }));
  return { html, root, timing };
}

export function renderSurvivalTemplatePreview(langOrCfg = "en") {
  const repoRoot = path.resolve(__dirname, "..");
  const filePath = path.join(repoRoot, "videos", "survival-without-organs", "index.html");
  let html = fs.readFileSync(filePath, "utf8");
  const cfg = typeof langOrCfg === "object" && langOrCfg !== null ? langOrCfg : getSurvivalConfig(langOrCfg);
  const lang = cfg.lang || (typeof langOrCfg === "string" ? langOrCfg : "en");

  html = html.replace("<head>", `<head>\n    <base href="/videos/survival-without-organs/">`);

  // Localize Header Eyebrow & Title
  html = html.replace(
    /<div class="eyebrow-pill">[\s\S]*?<\/div>/,
    `<div class="eyebrow-pill">\n            <span class="pulse-dot"></span>\n            ${cfg.eyebrow}\n          </div>`
  );
  html = html.replace(
    /<h1 class="main-title">[\s\S]*?<\/h1>/,
    `<h1 class="main-title">${cfg.title}</h1>`
  );

  // Localize Meme Header Badge
  html = html.replace(
    /<div class="meme-header-badge">[\s\S]*?<\/div>/,
    `<div class="meme-header-badge">${cfg.reactionLabel}</div>`
  );

  // Localize Survival Badge Label
  html = html.replace(
    /<span class="survival-label">[\s\S]*?<\/span>/,
    `<span class="survival-label">${cfg.survivalLabel}</span>`
  );

  // Localize initial DOM values
  html = html.replace(
    /<div id="tier-tag">[\s\S]*?<\/div>/,
    `<div id="tier-tag">${cfg.levelPrefix} 1/10</div>`
  );
  html = html.replace(
    /<div id="organ-title" class="organ-title">[\s\S]*?<\/div>/,
    `<div id="organ-title" class="organ-title">${cfg.tiers[0].title}</div>`
  );
  html = html.replace(
    /<div id="organ-desc" class="organ-desc">[\s\S]*?<\/div>/,
    `<div id="organ-desc" class="organ-desc">${cfg.tiers[0].desc}</div>`
  );
  html = html.replace(
    /<span id="survival-value" class="survival-value">[\s\S]*?<\/span>/,
    `<span id="survival-value" class="survival-value">${cfg.tiers[0].survival}</span>`
  );
  html = html.replace(
    /<div id="caption-text" class="caption-text">[\s\S]*?<\/div>/,
    `<div id="caption-text" class="caption-text">${cfg.prologueSpoken}</div>`
  );

  // Check if custom visuals (images or SVGs) are provided
  const hasCustomImages = cfg.tiers.some((t) => !!t.image || !!t.imageUrl);
  const hasCustomSvgs = cfg.tiers.some((t) => !!t.iconSvg);
  const hasCustomVisuals = hasCustomImages || hasCustomSvgs;
  const firstTargetId = hasCustomVisuals ? "#tier-target-1" : "#organ-appendix";

  if (hasCustomVisuals) {
    const visualElements = cfg.tiers
      .map(
        (t, idx) => {
          if (t.image || t.imageUrl) {
            const imgSrc = t.image || t.imageUrl;
            return `            <div id="tier-target-${idx + 1}" class="organ-target">
              <img class="tier-graphic-img" src="${imgSrc}" alt="${t.title}" />
            </div>`;
          }
          if (t.iconSvg) {
            return `            <div id="tier-target-${idx + 1}" class="organ-target" style="display: flex; align-items: center; justify-content: center; width: 220px; height: 220px;">
              ${t.iconSvg}
            </div>`;
          }
          return `            <div id="tier-target-${idx + 1}" class="organ-target">
              <img class="tier-graphic-img" src="assets/images/tier-${idx + 1}.jpg" alt="${t.title}" />
            </div>`;
        }
      )
      .join("\n");
    html = html.replace(
      /<div class="organ-visual-container">[\s\S]*?<\/div>\s*<div class="organ-info">/,
      `<div class="organ-visual-container">\n${visualElements}\n          </div>\n          <div class="organ-info">`
    );
    html = html.replace(
      /tl\.set\("#organ-appendix", \{ opacity: 0\.4, scale: 0\.9 \}, 0\);/,
      `tl.set("${firstTargetId}", { opacity: 0.4, scale: 0.9 }, 0);`
    );
    html = html.replace(
      /tl\.to\("#organ-appendix", \{ opacity: 0, duration: 0\.2 \}, t\.start\);/,
      `tl.to("${firstTargetId}", { opacity: 0, duration: 0.2 }, t.start);`
    );

    // Update CSS for image visual card and glowing border
    html = html.replace(
      /\.organ-target \{[\s\S]*?\}/,
      `.organ-visual-container {
        position: relative;
        width: 360px;
        height: 360px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .organ-target {
        position: absolute;
        width: 350px;
        height: 350px;
        border-radius: 24px;
        overflow: hidden;
        border: 2px solid rgba(255, 255, 255, 0.25);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
        opacity: 0;
        transform: scale(0.85);
        will-change: transform, opacity;
      }
      .tier-graphic-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }`
    );

    html = html.replace(
      /badge\.style\.boxShadow = `0 0 30px \$\{t\.glowColor\}`;/,
      `badge.style.boxShadow = \`0 0 30px \${t.glowColor}\`;
          const targetCard = document.querySelector(t.organId);
          if (targetCard) {
            targetCard.style.borderColor = t.color;
            targetCard.style.boxShadow = \`0 0 35px \${t.glowColor}, 0 20px 50px rgba(0, 0, 0, 0.8)\`;
          }`
    );
  }

  // Localize TIERS data in script
  const tierStaticData = [
    { start: 4.2, organId: "#organ-appendix", memeId: "#meme-phase-1", progress: "10%", color: "#00FF88", glowColor: "rgba(0, 255, 136, 0.3)" },
    { start: 9.7, organId: "#organ-gallbladder", memeId: "#meme-phase-2", progress: "20%", color: "#00FF88", glowColor: "rgba(0, 255, 136, 0.3)" },
    { start: 15.2, organId: "#organ-single-kidney", memeId: "#meme-phase-3", progress: "30%", color: "#00F0FF", glowColor: "rgba(0, 240, 255, 0.3)" },
    { start: 20.7, organId: "#organ-spleen", memeId: "#meme-phase-4", progress: "40%", color: "#FFB800", glowColor: "rgba(255, 184, 0, 0.35)" },
    { start: 26.2, organId: "#organ-stomach", memeId: "#meme-phase-5", progress: "50%", color: "#FF7700", glowColor: "rgba(255, 119, 0, 0.35)" },
    { start: 31.7, organId: "#organ-single-lung", memeId: "#meme-phase-6", progress: "60%", color: "#FF5500", glowColor: "rgba(255, 85, 0, 0.4)" },
    { start: 37.2, organId: "#organ-both-kidneys", memeId: "#meme-phase-7", progress: "70%", color: "#FF003C", glowColor: "rgba(255, 0, 60, 0.45)" },
    { start: 42.7, organId: "#organ-liver", memeId: "#meme-phase-8", progress: "80%", color: "#FF003C", glowColor: "rgba(255, 0, 60, 0.5)" },
    { start: 48.2, organId: "#organ-heart", memeId: "#meme-phase-9", progress: "90%", color: "#B91C1C", glowColor: "rgba(185, 28, 28, 0.6)" },
    { start: 53.7, organId: "#organ-brain", memeId: "#meme-phase-10", progress: "100%", color: "#9D00FF", glowColor: "rgba(157, 0, 255, 0.65)" }
  ];

  const localizedTiers = cfg.tiers.map((t, idx) => ({
    id: t.id,
    start: tierStaticData[idx].start,
    organId: hasCustomSvgs ? `#tier-target-${idx + 1}` : tierStaticData[idx].organId,
    memeId: tierStaticData[idx].memeId,
    tierText: `${cfg.levelPrefix} ${t.id}/10`,
    progress: tierStaticData[idx].progress,
    title: t.title,
    desc: t.desc,
    survival: t.survival,
    color: tierStaticData[idx].color,
    glowColor: tierStaticData[idx].glowColor,
    caption: t.caption
  }));

  html = html.replace(
    /const TIERS = \[[\s\S]*?\n\s*\];/,
    `const TIERS = ${JSON.stringify(localizedTiers, null, 8)};`
  );

  // Replace prologue call
  html = html.replace(
    /document\.getElementById\("caption-text"\)\.innerHTML = "How long could you actually[\s\S]*?document\.getElementById\("meter-fill"\)\.style\.width = "5%";/g,
    `document.getElementById("caption-text").innerHTML = ${JSON.stringify(cfg.prologueText)};\n        document.getElementById("tier-tag").textContent = ${JSON.stringify(cfg.prologueTag)};\n        document.getElementById("meter-fill").style.width = "5%";`
  );

  // Replace CTA call
  html = html.replace(
    /document\.getElementById\("tier-tag"\)\.textContent = "FINAL CTA"[\s\S]*?document\.getElementById\("caption-text"\)\.innerHTML = "Which survival limit shocked you the most\?[\s\S]*?";/g,
    `document.getElementById("tier-tag").textContent = ${JSON.stringify(cfg.finalTag)};
        document.getElementById("meter-fill").style.width = "100%";
        document.getElementById("organ-title").textContent = ${JSON.stringify(cfg.ctaTitle)};
        document.getElementById("organ-desc").textContent = ${JSON.stringify(cfg.ctaDesc)};
        
        const valEl = document.getElementById("survival-value");
        valEl.textContent = ${JSON.stringify(cfg.ctaValue)};
        valEl.style.color = "#00F0FF";

        const badge = document.getElementById("survival-badge");
        badge.style.borderColor = "#00F0FF";
        badge.style.boxShadow = "0 0 35px rgba(0, 240, 255, 0.4)";

        document.getElementById("caption-text").innerHTML = ${JSON.stringify(cfg.ctaText)};`
  );

  // Build localized timing beats (65s total)
  const timing = [
    { n: 1, start: 0.0, dur: 4.2, beat: "hook", caption: `${cfg.prologueTag}: ${cfg.prologueSpoken}` },
    ...cfg.tiers.map((t, idx) => {
      const starts = [4.2, 9.7, 15.2, 20.7, 26.2, 31.7, 37.2, 42.7, 48.2, 53.7];
      const durs = [5.5, 5.5, 5.5, 5.5, 5.5, 5.5, 5.5, 5.5, 5.5, 5.5];
      const beats = ["side A", "side A", "side A", "side B", "side B", "side B", "compare", "compare", "rule", "payoff"];
      return {
        n: idx + 2,
        start: starts[idx],
        dur: durs[idx],
        beat: beats[idx],
        caption: t.caption,
      };
    }),
    { n: 12, start: 59.2, dur: 5.8, beat: "cta", caption: `${cfg.finalTag}: ${cfg.ctaSpoken}` }
  ];

  return { html, root: 65, timing };
}

/**
 * Render Mystery template preview (28s documentary format)
 */
export function renderMysteryTemplatePreview(lang = "vi") {
  const meta = MYSTERY_LANG_META[lang] || MYSTERY_LANG_META.vi;
  const cfg = CURATED_MYSTERIES["mystery-bermuda-triangle-" + lang] || CURATED_MYSTERIES["mystery-bermuda-triangle-vi"];

  const starts = [0.5, 8.2, 16.0, 24.0, 32.2, 40.4, 48.5, 56.7];
  const durs = [7.2, 7.2, 7.4, 7.5, 7.5, 7.4, 7.5, 7.3];
  const totalDuration = 65;

  const timedScenes = (cfg.scenes || []).map((sc, i) => ({
    ...sc,
    index: i + 1,
    start: starts[i] || 0.5 + i * 8.0,
    duration: durs[i] || 7.2,
    voSrc: `assets/vo/scene-${i + 1}.mp3`,
    imgSrc: `assets/images/scene-${i + 1}.jpg`
  }));

  const html = generateMysteryHtml({
    slug: "mystery-preview",
    cfg,
    meta,
    timedScenes,
    totalDuration
  });

  const timing = timedScenes.map((sc, i) => ({
    n: i + 1,
    start: sc.start,
    dur: sc.duration,
    beat: i === 0 ? "hook" : i < 3 ? "investigation" : i < 6 ? "crisis" : "unsolved enigma",
    caption: sc.line
  }));

  return { html, root: totalDuration, timing };
}

/**
 * Render Science / Anthropomorphic Science Animation template preview
 */
export function renderScienceTemplatePreview(lang = "vi") {
  const repoRoot = path.resolve(__dirname, "..");
  const filePath = path.join(repoRoot, "videos", "science-peanut-vi", "index.html");
  let html = fs.readFileSync(filePath, "utf8");
  html = html.replace("<head>", `<head>\n    <base href="/videos/science-peanut-vi/">`);
  if (!html.includes('window.__timelines["main"]')) {
    html = html.replace(
      'window.__timelines["science-peanut-vi"] = tl;',
      'window.__timelines["science-peanut-vi"] = tl;\n      window.__timelines["main"] = tl;'
    );
  }

  const durationsPath = path.join(repoRoot, "videos", "science-peanut-vi", "scripts", "durations.json");
  let timing = [];
  let root = 43.7;
  if (fs.existsSync(durationsPath)) {
    const data = JSON.parse(fs.readFileSync(durationsPath, "utf8"));
    root = data.rootDuration;
    timing = (data.results || []).map((d, i) => ({
      n: i + 1,
      start: d.start,
      dur: d.dur,
      beat: d.speaker === "charA" ? "side A" : d.speaker === "charB" ? "side B" : "payoff",
      caption: `${d.speaker}: ${d.text}`,
    }));
  }

  return { html, root, timing };
}

/**
 * Render Vox Motion Collage template preview
 */
export function renderVoxTemplatePreview(lang = "vi") {
  const meta = VOX_LANG_META[lang] || VOX_LANG_META.vi;
  const cfg = CURATED_VOX_TOPICS[`vox-sample-coffee-${lang}`] || CURATED_VOX_TOPICS["vox-sample-coffee-vi"];

  const starts = [0.5, 9.2, 18.0, 27.2, 36.5, 46.0];
  const durs = [8.2, 8.3, 8.7, 8.8, 9.0, 8.5];
  const totalDuration = 56;

  const timedBeats = (cfg.beats || []).map((bt, i) => ({
    ...bt,
    index: i + 1,
    start: starts[i] || 0.5 + i * 8.5,
    duration: durs[i] || 8.2,
    voSrc: `assets/vo/beat-${i + 1}.mp3`,
    imgSrc: `assets/images/sticker-${i + 1}.jpg`
  }));

  const html = generateVoxHtml({
    slug: "vox-preview",
    cfg,
    meta,
    timedBeats,
    totalDuration
  });

  const timing = timedBeats.map((bt, i) => ({
    n: i + 1,
    start: bt.start,
    dur: bt.duration,
    beat: bt.headline || bt.name || `beat-${i + 1}`,
    caption: bt.line
  }));

  return { html, root: totalDuration, timing };
}

/**
 * Render Retro Newspaper & Dossier Investigation template preview
 */
export function renderNewspaperTemplatePreview(lang = "vi") {
  const meta = NEWSPAPER_LANG_META[lang] || NEWSPAPER_LANG_META.vi;
  const cfg = CURATED_NEWSPAPER_TOPICS[`newspaper-sample-enron-${lang}`] || CURATED_NEWSPAPER_TOPICS["newspaper-sample-enron-vi"];

  const starts = [0.5, 9.2, 18.0, 27.2, 36.5, 46.0];
  const durs = [8.2, 8.3, 8.7, 8.8, 9.0, 8.5];
  const totalDuration = 56;

  const timedActs = (cfg.acts || []).map((act, i) => ({
    ...act,
    index: i + 1,
    start: starts[i] || 0.5 + i * 8.5,
    duration: durs[i] || 8.2,
    voSrc: `assets/vo/act-${i + 1}.mp3`,
    imgSrc: `assets/images/act-${i + 1}.jpg`
  }));

  const html = generateNewspaperHtml({
    slug: "newspaper-preview",
    cfg,
    meta,
    timedActs,
    totalDuration
  });

  const timing = timedActs.map((act, i) => ({
    n: i + 1,
    start: act.start,
    dur: act.duration,
    beat: act.headline || `act-${i + 1}`,
    caption: act.line
  }));

  return { html, root: totalDuration, timing };
}

/**
 * Render Dark Cyber Minimalist & Kinetic Typography template preview
 */
export function renderKineticTemplatePreview(lang = "vi") {
  const meta = KINETIC_LANG_META[lang] || KINETIC_LANG_META.vi;
  const cfg = CURATED_KINETIC_TOPICS[`kinetic-sample-dopamine-${lang}`] || CURATED_KINETIC_TOPICS["kinetic-sample-dopamine-vi"];

  const starts = [0.5, 8.5, 16.5, 24.5, 32.5, 40.5];
  const durs = [7.5, 7.5, 7.5, 7.5, 7.5, 7.5];
  const totalDuration = 50;

  const timedBeats = (cfg.beats || []).map((bt, i) => ({
    ...bt,
    index: i + 1,
    start: starts[i] || 0.5 + i * 8.0,
    duration: durs[i] || 7.5,
    voSrc: null
  }));

  const html = generateKineticHtml({
    slug: "kinetic-preview",
    cfg,
    meta,
    timedBeats,
    totalDuration
  });

  const timing = timedBeats.map((bt, i) => ({
    n: i + 1,
    start: bt.start,
    dur: bt.duration,
    beat: bt.punchline || `beat-${i + 1}`,
    caption: bt.line
  }));

  return { html, root: totalDuration, timing };
}

/**
 * Render Chalkboard Geopolitical Map template preview (>60s)
 */
export function renderChalkTemplatePreview(lang = "vi") {
  const repoRoot = path.resolve(__dirname, "..");
  const samplePath = path.join(repoRoot, "videos", "chalk-us-iran-vi", "index.html");
  let html = "";
  if (fs.existsSync(samplePath)) {
    html = fs.readFileSync(samplePath, "utf8");
    // Ensure relative paths resolve to /videos/chalk-us-iran-vi/
    if (!html.includes("<base ")) {
      html = html.replace("<head>", '<head>\n  <base href="/videos/chalk-us-iran-vi/">');
    }
  }

  const timing = [
    { n: 1, start: 1.0, dur: 6.62, beat: "U.S. vs Iran", caption: "Hơn bốn thập kỷ qua, mối quan hệ giữa Mỹ và Iran luôn được xem là thùng thuốc súng nguy hiểm nhất..." },
    { n: 2, start: 8.07, dur: 8.06, beat: "ĐỊA HÌNH PHÁO ĐÀI", caption: "Nằm tại trái tim Trung Đông, Iran sở hữu diện tích rộng gấp ba lần nước Pháp..." },
    { n: 3, start: 16.58, dur: 6.38, beat: "EO BIỂN HORMUZ", caption: "Nhưng vũ khí chiến lược đáng sợ nhất của Iran không chỉ là tên lửa, mà chính là Eo biển Hormuz..." },
    { n: 4, start: 23.41, dur: 8.78, beat: "20% DẦU MỎ TOÀN CẦU", caption: "Tại điểm hẹp nhất, eo biển này chỉ rộng khoảng 33 cây số..." },
    { n: 5, start: 32.64, dur: 7.61, beat: "CĂN CỨ VÂY QUANH", caption: "Để kiềm chế ảnh hưởng của Tehran, quân đội Mỹ đã thiết lập mạng lưới hàng chục căn cứ quân sự..." },
    { n: 6, start: 40.70, dur: 6.82, beat: "TRỤC KHÁNG CỰ", caption: "Đáp lại, Iran xây dựng mạng lưới các lực lượng ủy nhiệm xuyên suốt Trung Đông..." },
    { n: 7, start: 47.97, dur: 7.80, beat: "KHỦNG HOẢNG TOÀN CẦU", caption: "Nếu một cuộc xung đột toàn diện nổ ra và eo biển Hormuz bị đóng cửa..." },
    { n: 8, start: 56.22, dur: 5.28, beat: "ĐỊA LÝ ĐỘC TÔN", caption: "Chính vị trí địa lý độc tôn đã biến Iran trở thành một cường quốc không thể bị khuất phục..." }
  ];

  return { html, root: 64, timing };
}

/**
 * Render Tier List Ranking template preview (>60s)
 */
export function renderTierListTemplatePreview(lang = "vi") {
  const repoRoot = path.resolve(__dirname, "..");
  const samplePath = path.join(repoRoot, "videos", "tierlist-idle-games-vi", "index.html");
  let html = "";
  if (fs.existsSync(samplePath)) {
    html = fs.readFileSync(samplePath, "utf8");
    // Ensure relative paths resolve to /videos/tierlist-idle-games-vi/
    if (!html.includes("<base ")) {
      html = html.replace("<head>", '<head>\n  <base href="/videos/tierlist-idle-games-vi/">');
    }
  }

  const timing = [
    { n: 1, start: 1.8, dur: 9.5, beat: "ỨNG VIÊN #1: Cooking Stickman", caption: "Mở đầu bảng xếp hạng là Cooking Stickman, tựa game làm bếp quen thuộc..." },
    { n: 2, start: 12.0, dur: 8.8, beat: "ỨNG VIÊN #2: Supermarket Sim", caption: "Ứng viên số hai là Supermarket Simulator 3D..." },
    { n: 3, start: 21.5, dur: 9.2, beat: "ỨNG VIÊN #3: Monkey Mart", caption: "Vị trí thứ ba thuộc về chú khỉ bán hàng lừng danh Monkey Mart..." },
    { n: 4, start: 31.5, dur: 9.0, beat: "ỨNG VIÊN #4: Cat Snack Bar", caption: "Tiếp theo là siêu phẩm chữa lành Cat Snack Bar..." },
    { n: 5, start: 41.2, dur: 10.5, beat: "ỨNG VIÊN #5: My Perfect Hotel", caption: "Và trùm cuối bảng xếp hạng hôm nay, My Perfect Hotel!" }
  ];

  return { html, root: 55, timing };
}

/**
 * Render AI Wildlife Documentary template preview (45-60s)
 */
export function renderWildlifeTemplatePreview(lang = "vi") {
  const repoRoot = path.resolve(__dirname, "..");
  const samplePath = path.join(repoRoot, "videos", "wildlife-orca-vi", "index.html");
  let html = "";
  if (fs.existsSync(samplePath)) {
    html = fs.readFileSync(samplePath, "utf8");
    if (!html.includes("<base ")) {
      html = html.replace("<head>", '<head>\n  <base href="/videos/wildlife-orca-vi/">');
    }
  } else {
    // Generate preview on the fly using curated Orca preset
    const cfg = CURATED_WILDLIFE_TOPICS["wildlife-orca-vi"];
    const meta = WILDLIFE_LANG_META[lang] || WILDLIFE_LANG_META.vi;
    const timedScenes = (cfg.scenes || []).map((sc, i) => ({
      ...sc,
      index: i + 1,
      start: 0.6 + i * 8.0,
      duration: 7.8,
      voSrc: `assets/vo/scene-${i + 1}.mp3`,
      imgSrc: `assets/images/scene-${i + 1}.jpg`,
    }));
    html = generateWildlifeHtml({
      slug: "wildlife-orca-vi",
      cfg,
      meta,
      timedScenes,
      totalDuration: 52,
    });
  }

  const timing = [
    { n: 1, start: 0.6, dur: 7.8, beat: "BÁ CHỦ TUYỆT ĐỐI", caption: "Trong lòng đại dương sâu thẳm, có một sinh vật không hề biết sợ hãi..." },
    { n: 2, start: 8.4, dur: 8.2, beat: "THÔNG SỐ VŨ KHÍ", caption: "Đó là Cá Voi Sát Thủ Orca. Nặng tới sáu tấn, bơi với vận tốc 56 km/h..." },
    { n: 3, start: 16.6, dur: 7.9, beat: "CHIẾN THUẬT SIÊU VIỆT", caption: "Nhưng thứ biến Orca thành cỗ máy săn mồi hoàn hảo nhất lịch sử là bộ não..." },
    { n: 4, start: 24.5, dur: 8.5, beat: "ĐÒN ĐÁNH TỬ THẦN", caption: "Chúng tạo ra những đợt sóng đồng bộ để hất hải cẩu và quạt đuôi karate chop..." },
    { n: 5, start: 33.0, dur: 8.0, beat: "DI SẢN VĂN HÓA", caption: "Mỗi bầy Orca có tiếng nói riêng và truyền thụ kỹ năng qua nhiều thế hệ..." },
    { n: 6, start: 41.0, dur: 7.5, beat: "KẾT LUẬN SINH TỒN", caption: "Bạn có dám đối đầu với kẻ thống trị thông minh nhất hành tinh này không?" }
  ];

  return { html, root: 52, timing };
}

/**
 * Tâm Linh Dân Gian — preview từ kịch bản mẫu; thời lượng mỗi câu ước theo tốc độ đọc của ngôn ngữ.
 */
export function renderFolkloreTemplatePreview(lang = "vi") {
  const cfg = CURATED_FOLKLORE[`folklore-ma-da-${lang}`] || (lang === "vi" ? CURATED_FOLKLORE["folklore-ma-da-vi"] : CURATED_FOLKLORE["folklore-sin-eater-en"]);
  const meta = FOLKLORE_LANG_META[cfg.lang] || FOLKLORE_LANG_META.vi;
  const cjk = cfg.lang === "ja" || cfg.lang === "ko";
  const durations = cfg.scenes.map((sc) => {
    const units = cjk ? sc.line.replace(/\s/g, "").length : sc.line.split(/\s+/).length;
    return Math.max(2, units / meta.wordsPerSecond);
  });
  const { timed, shotTimes, total } = computeFolkloreTiming(cfg.scenes, durations);
  const html = generateFolkloreHtml({ slug: "folklore-preview", cfg, timed, shotTimes, total });
  const timing = timed.map((sc, i) => ({
    n: i + 1,
    start: sc.start,
    dur: sc.duration,
    beat: `Shot ${sc.shot}`,
    caption: sc.line,
  }));
  return { html, root: total, timing };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(renderTemplatePreview().html);
}

