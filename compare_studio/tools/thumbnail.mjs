#!/usr/bin/env node
// tools/thumbnail.mjs
// Generates an authentic 1080x1920 (9:16) vector SVG Cover Poster / Thumbnail
// for TikTok, YouTube Shorts, and Instagram Reels, extracted directly from
// the video's index.html and assets. Also supports extracting 1080x1920 video
// frame snapshots from rendered MP4s via ffmpeg.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { THEMES, getCountryTheme } from "./themes/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const VIDEOS_DIR = path.join(REPO_ROOT, "videos");

/**
 * Extracts all relevant metadata, styling, cards, and icons from the video's index.html & spec.json.
 */
export function parseVideoInfo(slug) {
  const dir = path.join(VIDEOS_DIR, slug);
  if (!fs.existsSync(dir)) throw new Error(`Không tìm thấy video "${slug}"`);

  let spec = null;
  const specPath = path.join(dir, "spec.json");
  if (fs.existsSync(specPath)) {
    try {
      spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    } catch {}
  }

  const htmlPath = path.join(dir, "index.html");
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";

  // 1. Language detection: <html lang="de">
  const langMatch = html.match(/<html[^>]+lang=["']([a-z]{2,5})["']/i);
  const lang = spec?.lang || langMatch?.[1] || "en";
  const theme = getCountryTheme(lang);

  // 2. Palette: Read CSS variables from :root or fallback to theme
  const palette = { ...theme.palette };
  const rootMatch = html.match(/:root\s*\{([^}]+)\}/);
  if (rootMatch) {
    for (const line of rootMatch[1].split(";")) {
      const parts = line.split(":");
      if (parts.length >= 2) {
        const k = parts[0].trim();
        const v = parts.slice(1).join(":").trim();
        if (k.startsWith("--")) palette[k] = v;
      }
    }
  }

  // 3. Card Labels
  const leftLabelMatch = html.match(/id=["']card-left["'][\s\S]*?class=["']card-label["']>([^<]+)<\/div>/i);
  const rightLabelMatch = html.match(/id=["']card-right["'][\s\S]*?class=["']card-label["']>([^<]+)<\/div>/i);
  const labelLeft = (spec?.labelLeft || leftLabelMatch?.[1] || slug.split("-vs-")[0] || "SIDE A").trim();
  const labelRight = (spec?.labelRight || rightLabelMatch?.[1] || slug.split("-vs-")[1] || "SIDE B").trim();

  // 4. Icons / Artwork extraction from #card-left and #card-right
  const leftIconBlock = html.match(/id=["']card-left["'][\s\S]*?class=["']card-icon["']>([\s\S]*?)<\/div>\s*<div[^>]*class=["']card-label["']/i)?.[1] || "";
  let iconLeft = parseIconBlock(leftIconBlock, dir, spec?.iconLeft, palette["--accent-sage"], palette["--accent-sage-ink"], labelLeft);

  const rightIconBlock = html.match(/id=["']card-right["'][\s\S]*?class=["']card-icon["']>([\s\S]*?)<\/div>\s*<div[^>]*class=["']card-label["']/i)?.[1] || "";
  let iconRight = parseIconBlock(rightIconBlock, dir, spec?.iconRight, palette["--accent-terra"], palette["--accent-terra-ink"], labelRight);

  // 5. Hook / Question Line extraction
  const line3Match = html.match(/id=["']line-3["'][\s\S]*?class=["']caption-line-text["']>([\s\S]*?)<\/span><\/div>/i);
  const line4Match = html.match(/id=["']line-4["'][\s\S]*?class=["']caption-line-text["']>([\s\S]*?)<\/span><\/div>/i);
  const line1Match = html.match(/id=["']line-1["'][\s\S]*?class=["']caption-line-text["']>([\s\S]*?)<\/span><\/div>/i);
  const rawHook = line3Match?.[1] || line4Match?.[1] || line1Match?.[1] || "";
  const hookLine = rawHook.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

  // 6. Eyebrow channel tag
  const eyebrowMatch = html.match(/id=["']eyebrow["']>([^<]+)<\/div>/i);
  const eyebrow = eyebrowMatch?.[1]?.trim() || "THE_DUY";

  return { dir, slug, lang, theme, palette, labelLeft, labelRight, iconLeft, iconRight, hookLine, eyebrow, html, spec };
}

function parseIconBlock(block, videoDir, specIcon, fallbackColor, fallbackInk, label) {
  // 1. Check for inline SVG
  const svgMatch = block.match(/<svg[^>]*viewBox=["']([^"']+)["'][^>]*>([\s\S]*?)<\/svg>/i);
  if (svgMatch) {
    return { type: "svg", viewBox: svgMatch[1], inner: svgMatch[2].trim() };
  }

  // 2. Check for <img>
  const imgMatch = block.match(/<img[^>]*src=["']([^"']+)["']/i);
  if (imgMatch) {
    const imgRel = imgMatch[1];
    const imgFile = path.resolve(videoDir, imgRel);
    if (fs.existsSync(imgFile)) {
      const ext = path.extname(imgFile).slice(1).toLowerCase();
      const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : "image/jpeg";
      const b64 = fs.readFileSync(imgFile).toString("base64");
      return { type: "img", dataUri: `data:${mime};base64,${b64}` };
    }
  }

  // 3. Check specIcon svg
  if (specIcon?.svg) {
    const match = specIcon.svg.match(/<svg[^>]*viewBox=["']([^"']+)["'][^>]*>([\s\S]*?)<\/svg>/i);
    if (match) {
      return { type: "svg", viewBox: match[1], inner: match[2].trim() };
    }
  }

  // 4. Fallback: Clean geometric emblem
  return {
    type: "fallback",
    inner: `<circle cx="130" cy="130" r="85" fill="${fallbackColor}" opacity="0.95"/><text x="130" y="155" font-family="system-ui, sans-serif" font-size="75" font-weight="900" fill="${fallbackInk}" text-anchor="middle">${label[0] || "?"}</text>`,
    viewBox: "0 0 260 260",
  };
}

/**
 * Renders an authentic, vector SVG illustration of the country's mascot character.
 */
function renderMascotIllustration(lang, p) {
  if (lang === "de") {
    // 🇩🇪 Dachshund Otto (Floppy ears, sausage snout, amber glasses, red bowtie)
    return `
    <g id="mascot-dachshund" transform="translate(0, 30)">
      <!-- Tail -->
      <path d="M-90,130 Q-120,70 -95,25 Q-80,5 -65,30" fill="none" stroke="${p["--fur"]}" stroke-width="16" stroke-linecap="round"/>
      <!-- Legs -->
      <ellipse cx="-45" cy="145" rx="26" ry="14" fill="#3B2114"/>
      <ellipse cx="45" cy="145" rx="26" ry="14" fill="#3B2114"/>
      <!-- Body -->
      <path d="M-60,15 L60,15 Q90,75 85,135 Q85,155 0,155 Q-85,155 -85,135 Q-90,75 -60,15 Z" fill="${p["--fur"]}"/>
      <ellipse cx="0" cy="95" rx="38" ry="46" fill="#6E4531" opacity="0.65"/>
      <!-- Arms -->
      <rect x="-85" y="45" width="22" height="75" rx="11" fill="${p["--fur"]}" transform="rotate(15 -85 45)"/>
      <rect x="65" y="45" width="22" height="75" rx="11" fill="${p["--fur"]}" transform="rotate(-15 65 45)"/>
      <!-- Head -->
      <ellipse cx="0" cy="-22" rx="64" ry="52" fill="${p["--fur"]}"/>
      <!-- Floppy Dachshund Ears -->
      <ellipse cx="-68" cy="10" rx="18" ry="56" transform="rotate(-18 -68 10)" fill="#3E2417"/>
      <ellipse cx="68" cy="10" rx="18" ry="56" transform="rotate(18 68 10)" fill="#3E2417"/>
      <!-- Muzzle -->
      <ellipse cx="0" cy="-4" rx="36" ry="26" fill="#6E4531"/>
      <!-- Nose -->
      <path d="M-12,-12 L12,-12 Q0,-1 -12,-12 Z" fill="#1C120C"/>
      <!-- Eyes & Pupils -->
      <circle cx="-26" cy="-26" r="6" fill="#1C120C"/>
      <circle cx="26" cy="-26" r="6" fill="#1C120C"/>
      <!-- Spectacles (Bavarian Amber Gold) -->
      <circle cx="-26" cy="-24" r="19" fill="none" stroke="${p["--gold"]}" stroke-width="4.5"/>
      <circle cx="26" cy="-24" r="19" fill="none" stroke="${p["--gold"]}" stroke-width="4.5"/>
      <line x1="-7" y1="-24" x2="7" y2="-24" stroke="${p["--gold"]}" stroke-width="4.5"/>
      <!-- Red Bavarian Bowtie -->
      <polygon points="-26,34 -6,26 -6,42" fill="#C24A3F"/>
      <polygon points="26,34 6,26 6,42" fill="#C24A3F"/>
      <circle cx="0" cy="34" r="7" fill="#9C2418"/>
    </g>`;
  }

  if (lang === "vi") {
    // 🇻🇳 Mèo Mun Professor (Black cat, sage round glasses, cream whiskers, pink ear notch)
    return `
    <g id="mascot-cat" transform="translate(0, 30)">
      <!-- Tail sweeping left -->
      <path d="M-75,135 Q-130,70 -105,30 Q-90,10 -75,32" fill="none" stroke="${p["--fur"]}" stroke-width="15" stroke-linecap="round"/>
      <!-- Legs -->
      <ellipse cx="-45" cy="145" rx="26" ry="14" fill="#1A1815"/>
      <ellipse cx="45" cy="145" rx="26" ry="14" fill="#1A1815"/>
      <!-- Body -->
      <path d="M-55,15 L55,15 Q85,75 80,135 Q80,155 0,155 Q-80,155 -80,135 Q-85,75 -55,15 Z" fill="${p["--fur"]}"/>
      <!-- Arms -->
      <rect x="-80" y="45" width="22" height="75" rx="11" fill="${p["--fur"]}" transform="rotate(15 -80 45)"/>
      <rect x="60" y="45" width="22" height="75" rx="11" fill="${p["--fur"]}" transform="rotate(-15 60 45)"/>
      <!-- Head -->
      <ellipse cx="0" cy="-22" rx="62" ry="50" fill="${p["--fur"]}"/>
      <!-- Pointed Ears -->
      <polygon points="-52,-32 -65,-80 -25,-50" fill="${p["--fur"]}"/>
      <polygon points="-48,-36 -58,-70 -28,-49" fill="#F0E5D0"/>
      <polygon points="52,-32 65,-80 25,-50" fill="${p["--fur"]}"/>
      <polygon points="48,-36 58,-70 28,-49" fill="#F0E5D0"/>
      <!-- Eyes with cream sclera -->
      <ellipse cx="-24" cy="-22" rx="13" ry="14" fill="#FBF4DD"/>
      <circle cx="-22" cy="-22" r="6" fill="#1A1815"/>
      <ellipse cx="24" cy="-22" rx="13" ry="14" fill="#FBF4DD"/>
      <circle cx="22" cy="-22" r="6" fill="#1A1815"/>
      <!-- Round Sage Glasses -->
      <circle cx="-24" cy="-22" r="20" fill="none" stroke="${p["--accent-sage"]}" stroke-width="4.5"/>
      <circle cx="24" cy="-22" r="20" fill="none" stroke="${p["--accent-sage"]}" stroke-width="4.5"/>
      <line x1="-4" y1="-22" x2="4" y2="-22" stroke="${p["--accent-sage"]}" stroke-width="4.5"/>
      <!-- Triangle nose -->
      <polygon points="-5,-8 5,-8 0,-2" fill="#FBF4DD"/>
      <!-- Classic Whiskers -->
      <line x1="-32" y1="-8" x2="-75" y2="-12" stroke="#FBF4DD" stroke-width="2.5" opacity="0.85"/>
      <line x1="-32" y1="-3" x2="-78" y2="-2" stroke="#FBF4DD" stroke-width="2.5" opacity="0.85"/>
      <line x1="-32" y1="2" x2="-72" y2="8" stroke="#FBF4DD" stroke-width="2.5" opacity="0.85"/>
      <line x1="32" y1="-8" x2="75" y2="-12" stroke="#FBF4DD" stroke-width="2.5" opacity="0.85"/>
      <line x1="32" y1="-3" x2="78" y2="-2" stroke="#FBF4DD" stroke-width="2.5" opacity="0.85"/>
      <line x1="32" y1="2" x2="72" y2="8" stroke="#FBF4DD" stroke-width="2.5" opacity="0.85"/>
    </g>`;
  }

  if (lang === "ko") {
    // 🇰🇷 K-Tiger Horangi (Tiger ears, forehead stripes, emerald glasses, rosy cheeks)
    return `
    <g id="mascot-tiger" transform="translate(0, 30)">
      <!-- Body -->
      <path d="M-55,15 L55,15 Q85,75 80,135 Q80,155 0,155 Q-80,155 -80,135 Q-85,75 -55,15 Z" fill="${p["--fur"]}"/>
      <ellipse cx="0" cy="95" rx="38" ry="46" fill="#F7E6D0" opacity="0.85"/>
      <!-- Head -->
      <ellipse cx="0" cy="-22" rx="64" ry="52" fill="${p["--fur"]}"/>
      <!-- Tiger Ears -->
      <circle cx="-54" cy="-56" r="22" fill="${p["--fur"]}"/>
      <circle cx="-54" cy="-56" r="13" fill="#3D2115"/>
      <circle cx="54" cy="-56" r="22" fill="${p["--fur"]}"/>
      <circle cx="54" cy="-56" r="13" fill="#3D2115"/>
      <!-- Forehead '王' Stripes -->
      <line x1="-18" y1="-56" x2="18" y2="-56" stroke="#3D2115" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="-12" y1="-46" x2="12" y2="-46" stroke="#3D2115" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="0" y1="-62" x2="0" y2="-40" stroke="#3D2115" stroke-width="4.5" stroke-linecap="round"/>
      <!-- Rosy Cheeks -->
      <circle cx="-42" cy="-8" r="12" fill="#E26D5C" opacity="0.5"/>
      <circle cx="42" cy="-8" r="12" fill="#E26D5C" opacity="0.5"/>
      <!-- Eyes -->
      <circle cx="-25" cy="-22" r="7" fill="#1C1814"/>
      <circle cx="25" cy="-22" r="7" fill="#1C1814"/>
      <!-- Jade Spectacles -->
      <circle cx="-25" cy="-20" r="19" fill="none" stroke="${p["--accent-sage"]}" stroke-width="4.5"/>
      <circle cx="25" cy="-20" r="19" fill="none" stroke="${p["--accent-sage"]}" stroke-width="4.5"/>
      <line x1="-6" y1="-20" x2="6" y2="-20" stroke="${p["--accent-sage"]}" stroke-width="4.5"/>
      <polygon points="-8,-4 8,-4 0,3" fill="#3D2115"/>
    </g>`;
  }

  if (lang === "ja") {
    // 🇯🇵 Shiba Inu Hachi (Pointed ears, white cheek urajiro, white eyebrow dots, red bandana)
    return `
    <g id="mascot-shiba" transform="translate(0, 30)">
      <!-- Body -->
      <path d="M-55,15 L55,15 Q85,75 80,135 Q80,155 0,155 Q-80,155 -80,135 Q-85,75 -55,15 Z" fill="${p["--fur"]}"/>
      <ellipse cx="0" cy="95" rx="36" ry="46" fill="#FFF4E6"/>
      <!-- Head -->
      <ellipse cx="0" cy="-22" rx="64" ry="52" fill="${p["--fur"]}"/>
      <!-- Pointed Shiba Ears -->
      <polygon points="-48,-36 -62,-80 -22,-52" fill="${p["--fur"]}"/>
      <polygon points="-44,-40 -54,-72 -26,-52" fill="#FFF4E6"/>
      <polygon points="48,-36 62,-80 22,-52" fill="${p["--fur"]}"/>
      <polygon points="44,-40 54,-72 26,-52" fill="#FFF4E6"/>
      <!-- White Urajiro Cheeks -->
      <ellipse cx="-32" cy="-8" rx="26" ry="24" fill="#FFF4E6"/>
      <ellipse cx="32" cy="-8" rx="26" ry="24" fill="#FFF4E6"/>
      <!-- White Eyebrow Dots -->
      <circle cx="-25" cy="-44" r="7" fill="#FFF4E6"/>
      <circle cx="25" cy="-44" r="7" fill="#FFF4E6"/>
      <!-- Eyes -->
      <ellipse cx="-25" cy="-24" rx="6" ry="7" fill="#1C1814"/>
      <ellipse cx="25" cy="-24" rx="6" ry="7" fill="#1C1814"/>
      <!-- Black Button Nose -->
      <ellipse cx="0" cy="-10" rx="9" ry="7" fill="#1C1814"/>
      <!-- Red Torii Bandana -->
      <polygon points="-38,24 38,24 0,55" fill="#C84B31"/>
      <circle cx="0" cy="24" r="7" fill="#FFFFFF"/>
    </g>`;
  }

  if (lang === "fr") {
    // 🇫🇷 Gallic Rooster Pierre (Triple-crested comb, golden beak, red wattle, bistro collar)
    return `
    <g id="mascot-rooster" transform="translate(0, 30)">
      <!-- Body -->
      <path d="M-50,20 L50,20 Q80,80 75,140 Q75,160 0,160 Q-75,160 -75,140 Q-80,80 -50,20 Z" fill="${p["--fur"]}"/>
      <!-- Head -->
      <circle cx="0" cy="-20" r="50" fill="${p["--fur"]}"/>
      <!-- Triple-crested Red Bordeaux Comb -->
      <circle cx="-26" cy="-70" r="16" fill="#8B1E1E"/>
      <circle cx="0" cy="-80" r="20" fill="#A82828"/>
      <circle cx="26" cy="-70" r="16" fill="#8B1E1E"/>
      <!-- Golden Beak -->
      <polygon points="12,-16 42,-8 12,0" fill="${p["--gold"]}"/>
      <!-- Red Wattle -->
      <ellipse cx="12" cy="14" rx="10" ry="18" fill="#A82828"/>
      <!-- Eyes & Monocle / Spectacle -->
      <circle cx="-16" cy="-22" r="7" fill="#1E293B"/>
      <circle cx="-16" cy="-22" r="18" fill="none" stroke="${p["--gold"]}" stroke-width="4"/>
      <!-- Bistro Navy Neckerchief -->
      <polygon points="-30,30 30,30 0,54" fill="#1E293B"/>
    </g>`;
  }

  // Default / 🇺🇸 Wise Owl Barnaby (Tufted ears, large inquisitive eyes, spectacles, sharp beak)
  return `
  <g id="mascot-owl" transform="translate(0, 30)">
    <!-- Body -->
    <path d="M-55,15 L55,15 Q85,75 80,135 Q80,155 0,155 Q-80,155 -80,135 Q-85,75 -55,15 Z" fill="${p["--fur"]}"/>
    <!-- Scalloped Chest Feathers -->
    <path d="M-28,75 Q0,95 28,75 M-32,95 Q0,115 32,95 M-24,115 Q0,135 24,115" fill="none" stroke="#D49B24" stroke-width="3" opacity="0.65"/>
    <!-- Head -->
    <ellipse cx="0" cy="-22" rx="64" ry="52" fill="${p["--fur"]}"/>
    <!-- Tufted Ear Horns -->
    <polygon points="-52,-40 -70,-80 -32,-56" fill="${p["--fur"]}"/>
    <polygon points="52,-40 70,-80 32,-56" fill="${p["--fur"]}"/>
    <!-- Large Round Spectacles framing Eyes -->
    <circle cx="-25" cy="-20" r="22" fill="#FFF9ED"/>
    <circle cx="25" cy="-20" r="22" fill="#FFF9ED"/>
    <circle cx="-22" cy="-20" r="9" fill="#1C1814"/>
    <circle cx="22" cy="-20" r="9" fill="#1C1814"/>
    <circle cx="-25" cy="-20" r="22" fill="none" stroke="${p["--gold"]}" stroke-width="4.5"/>
    <circle cx="25" cy="-20" r="22" fill="none" stroke="${p["--gold"]}" stroke-width="4.5"/>
    <line x1="-3" y1="-20" x2="3" y2="-20" stroke="${p["--gold"]}" stroke-width="4.5"/>
    <!-- Golden Sharp Beak -->
    <polygon points="-7,-4 7,-4 0,14" fill="${p["--gold"]}"/>
  </g>`;
}

/**
 * Generates the full 1080x1920 SVG cover thumbnail matching the video's layout and content.
 */
export function generateThumbnailSvg(slug) {
  const info = parseVideoInfo(slug);
  const { lang, theme, palette: p, labelLeft, labelRight, iconLeft, iconRight, hookLine, eyebrow } = info;

  // Localized Subtitles
  const subtitleMap = {
    vi: "SO SÁNH KIẾN THỨC · 60 GIÂY HIỂU NGAY",
    en: "KNOWLEDGE BATTLE · LEARN IN 60 SECONDS",
    de: "WISSENS-DUELL · IN 60 SEKUNDEN VERSTEHEN",
    fr: "DUEL DU SAVOIR · COMPRENDRE EN 60 SECONDES",
    ja: "知識バトル · 60秒でスッキリ解説！",
    ko: "지식 배틀 · 60초 만에 완벽 정리!",
  };
  const subtitle = subtitleMap[lang] || subtitleMap.en;

  // Localized Hook Banner
  const hookBannerMap = {
    vi: "KHÁC NHAU THẾ NÀO?",
    en: "WHAT IS THE DIFFERENCE?",
    de: "WAS IST DER UNTERSCHIED?",
    fr: "QUELLE EST LA DIFFÉRENCE ?",
    ja: "違い、分かりますか？",
    ko: "어떤 차이가 있을까?",
  };
  const hookBanner = hookBannerMap[lang] || hookBannerMap.en;

  // Dialogue line for speech bubble (Uses the video's actual hook if available!)
  const bubbleText = hookLine || hookBanner;

  // Card Left Graphic render
  let leftGraphic = "";
  if (iconLeft.type === "img") {
    leftGraphic = `<image href="${iconLeft.dataUri}" x="40" y="55" width="340" height="340" preserveAspectRatio="xMidYMid slice" clip-path="url(#cardInnerClip)"/>`;
  } else {
    leftGraphic = `
    <svg viewBox="${iconLeft.viewBox}" x="50" y="65" width="320" height="320">
      ${iconLeft.inner}
    </svg>`;
  }

  // Card Right Graphic render
  let rightGraphic = "";
  if (iconRight.type === "img") {
    rightGraphic = `<image href="${iconRight.dataUri}" x="40" y="55" width="340" height="340" preserveAspectRatio="xMidYMid slice" clip-path="url(#cardInnerClip)"/>`;
  } else {
    rightGraphic = `
    <svg viewBox="${iconRight.viewBox}" x="50" y="65" width="320" height="320">
      ${iconRight.inner}
    </svg>`;
  }

  // Generate CSS variables string for :root inside SVG so all referenced vars work
  const cssVars = Object.entries(p)
    .map(([k, v]) => `${k}: ${v};`)
    .join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
  <defs>
    <style>
      :root {
        ${cssVars}
      }
      .bold { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Be Vietnam Pro", sans-serif; font-weight: 900; }
      .semi { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "JetBrains Mono", sans-serif; font-weight: 700; }
      .medium { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-weight: 600; }
    </style>
    <!-- Background Gradients & Ambient Glows -->
    <radialGradient id="glowTop" cx="50%" cy="15%" r="45%">
      <stop offset="0%" stop-color="${p["--glow-top"]}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${p["--bg"]}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowBottom" cx="50%" cy="85%" r="50%">
      <stop offset="0%" stop-color="${p["--glow-bottom"]}" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="${p["--bg"]}" stop-opacity="0"/>
    </radialGradient>
    <!-- Drop Shadows -->
    <filter id="cardShadow" x="-10%" y="-10%" width="125%" height="130%">
      <feDropShadow dx="0" dy="20" stdDeviation="28" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
    <filter id="goldGlow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="6" stdDeviation="18" flood-color="${p["--gold"]}" flood-opacity="0.7"/>
    </filter>
    <!-- Card Inner Clip -->
    <clipPath id="cardInnerClip">
      <rect x="30" y="30" width="360" height="400" rx="24"/>
    </clipPath>
  </defs>

  <!-- Background Base & Ambient Glows -->
  <rect width="1080" height="1920" fill="${p["--bg"]}"/>
  <rect width="1080" height="1920" fill="url(#glowTop)"/>
  <rect width="1080" height="1920" fill="url(#glowBottom)"/>

  <!-- Top Eyebrow Channel Tag -->
  <g transform="translate(540, 130)">
    <rect x="-240" y="-32" width="480" height="64" rx="32" fill="${p["--panel"]}" stroke="${p["--panel-edge"]}" stroke-width="2.5"/>
    <text x="0" y="8" class="semi" font-size="22" fill="${p["--gold"]}" letter-spacing="3" text-anchor="middle">
      ${eyebrow ? eyebrow.toUpperCase() : subtitle}
    </text>
  </g>

  <!-- Main Viral Hook Headline -->
  <g transform="translate(540, 275)">
    <!-- Title with Gold Outer Glow & Dark Outline -->
    <text x="0" y="0" class="bold" font-size="82" fill="${p["--gold"]}" text-anchor="middle" filter="url(#goldGlow)">
      ${labelLeft} vs ${labelRight}
    </text>
    <text x="0" y="0" class="bold" font-size="82" fill="#FFFFFF" stroke="${p["--panel"]}" stroke-width="9" paint-order="stroke fill" text-anchor="middle">
      ${labelLeft} vs ${labelRight}
    </text>

    <!-- Hook sub-banner badge -->
    <rect x="-220" y="42" width="440" height="54" rx="15" fill="${p["--accent-terra"]}"/>
    <text x="0" y="78" class="bold" font-size="28" fill="${p["--accent-terra-ink"]}" letter-spacing="2" text-anchor="middle">
      ${hookBanner}
    </text>
  </g>

  <!-- ================= BATTLE ZONE: TWO REAL CARDS ================= -->
  <!-- Left Card (Side A) -->
  <g transform="translate(90, 460)" filter="url(#cardShadow)">
    <rect width="420" height="640" rx="36" fill="${p["--panel"]}" stroke="${p["--panel-edge"]}" stroke-width="5"/>
    <rect x="25" y="25" width="370" height="420" rx="26" fill="#000000" opacity="0.3"/>
    <!-- Real Icon / Artwork -->
    ${leftGraphic}
    <!-- Label Banner -->
    <rect x="35" y="485" width="350" height="96" rx="20" fill="${p["--accent-sage"]}"/>
    <text x="210" y="550" class="bold" font-size="44" fill="${p["--accent-sage-ink"]}" text-anchor="middle">
      ${labelLeft}
    </text>
  </g>

  <!-- Right Card (Side B) -->
  <g transform="translate(570, 460)" filter="url(#cardShadow)">
    <rect width="420" height="640" rx="36" fill="${p["--panel"]}" stroke="${p["--panel-edge-dim"]}" stroke-width="4"/>
    <rect x="25" y="25" width="370" height="420" rx="26" fill="#000000" opacity="0.3"/>
    <!-- Real Icon / Artwork -->
    ${rightGraphic}
    <!-- Label Banner -->
    <rect x="35" y="485" width="350" height="96" rx="20" fill="${p["--accent-terra"]}"/>
    <text x="210" y="550" class="bold" font-size="44" fill="${p["--accent-terra-ink"]}" text-anchor="middle">
      ${labelRight}
    </text>
  </g>

  <!-- Central VS Badge (Attached at seam) -->
  <g transform="translate(540, 780)" filter="url(#goldGlow)">
    <circle cx="0" cy="0" r="76" fill="${p["--panel"]}" stroke="${p["--gold"]}" stroke-width="7"/>
    <circle cx="0" cy="0" r="62" fill="${p["--gold"]}"/>
    <text x="0" y="16" class="bold" font-size="46" fill="#1C1814" text-anchor="middle" font-style="italic">
      VS
    </text>
  </g>

  <!-- ================= MIDDLE ZONE: HOOK SPEECH BUBBLE ================= -->
  <g transform="translate(540, 1220)" filter="url(#cardShadow)">
    <rect x="-420" y="-55" width="840" height="110" rx="28" fill="${p["--panel"]}" stroke="${p["--panel-edge"]}" stroke-width="3"/>
    <polygon points="0,55 -22,76 22,55" fill="${p["--panel"]}"/>
    <text x="0" y="12" class="semi" font-size="34" fill="${p["--fg-on-panel"]}" text-anchor="middle">
      "${bubbleText.length > 42 ? bubbleText.slice(0, 40) + '...' : bubbleText}"
    </text>
  </g>

  <!-- ================= BOTTOM ZONE: AUTHENTIC 2D MASCOT ================= -->
  <g transform="translate(540, 1490)">
    <!-- Stage Platform Shadow -->
    <ellipse cx="0" cy="180" rx="280" ry="45" fill="${p["--panel"]}" opacity="0.5"/>
    <circle cx="0" cy="65" r="145" fill="${p["--panel"]}" stroke="${p["--panel-edge"]}" stroke-width="4"/>
    <circle cx="0" cy="65" r="132" fill="${p["--bg"]}" opacity="0.45"/>

    <!-- Authentic 2D Vector Mascot Character -->
    ${renderMascotIllustration(lang, p)}

    <!-- Mascot Tag Badge -->
    <g transform="translate(0, 235)">
      <rect x="-210" y="-22" width="420" height="52" rx="16" fill="${p["--gold"]}"/>
      <text x="0" y="12" class="bold" font-size="22" fill="#1C1814" letter-spacing="1" text-anchor="middle">
        ${theme.flag} ${theme.mascotName} · ${theme.country}
      </text>
    </g>
  </g>

  <!-- Bottom CTA Footer Bar -->
  <rect x="0" y="1860" width="1080" height="60" fill="${p["--panel"]}"/>
  <text x="540" y="1898" class="semi" font-size="20" fill="${p["--gold"]}" text-anchor="middle" letter-spacing="4">
    SO SÁNH KIẾN THỨC · TAP TO WATCH
  </text>
</svg>`;
}

/**
 * Finds the latest rendered MP4 for the given slug.
 */
export function getLatestRenderPath(slug) {
  const rendersDir = path.join(VIDEOS_DIR, slug, "renders");
  if (!fs.existsSync(rendersDir)) return null;
  const files = fs.readdirSync(rendersDir).filter((f) => f.endsWith(".mp4"));
  if (!files.length) return null;
  files.sort((a, b) => {
    const statA = fs.statSync(path.join(rendersDir, a));
    const statB = fs.statSync(path.join(rendersDir, b));
    return statB.mtimeMs - statA.mtimeMs;
  });
  return path.join(rendersDir, files[0]);
}

/**
 * Extracts a crystal-clear 1080x1920 JPG frame from the rendered MP4 at timeSec.
 */
export function extractVideoFrame(slug, timeSec = 5.0) {
  const dir = path.join(VIDEOS_DIR, slug);
  const mp4 = getLatestRenderPath(slug);
  if (!mp4) throw new Error(`Video "${slug}" chưa có bản render MP4 nào để trích xuất frame.`);

  const outJpg = path.join(dir, "cover-frame.jpg");
  const timeFormatted = `00:00:0${Math.max(1, Math.min(9, Math.floor(timeSec)))}.000`;

  execFileSync("ffmpeg", [
    "-y",
    "-ss", timeFormatted,
    "-i", mp4,
    "-vframes", "1",
    "-q:v", "2",
    outJpg,
  ], { stdio: "ignore" });

  if (!fs.existsSync(outJpg)) throw new Error("Không thể xuất ảnh từ video với ffmpeg.");
  return outJpg;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Dùng: node tools/thumbnail.mjs <slug> [--frame]");
    process.exit(1);
  }

  const isFrame = process.argv.includes("--frame");
  if (isFrame) {
    try {
      const out = extractVideoFrame(slug);
      console.log(`Đã trích xuất khung hình video thật 1080x1920: ${out}`);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  } else {
    const svg = generateThumbnailSvg(slug);
    const outPath = path.join(VIDEOS_DIR, slug, "thumbnail.svg");
    fs.writeFileSync(outPath, svg, "utf8");
    console.log(`Đã xuất ảnh bìa vector SVG 1080x1920: ${outPath}`);
  }
}
