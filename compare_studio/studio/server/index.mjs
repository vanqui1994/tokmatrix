// Compare Studio — local control panel for the videos/ series.
// Plain Node http, no framework: the repo stays dependency-light and this only
// ever runs on localhost.
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { renderTemplatePreview, renderSurvivalTemplatePreview, renderScienceTemplatePreview, renderMysteryTemplatePreview, renderVoxTemplatePreview, renderNewspaperTemplatePreview, renderKineticTemplatePreview, renderChalkTemplatePreview, renderTierListTemplatePreview, renderWildlifeTemplatePreview } from "../../tools/preview-template.mjs";
import { listCategories, listTopics, generateTopic } from "../../tools/generate-topic.mjs";
import { generateSurvivalTopic } from "../../tools/generate-survival-topic.mjs";
import { generateMysteryTopic, suggestMysteryTopics } from "../../tools/generate-mystery-topic.mjs";
import { createMysteryVideo } from "../../tools/create-mystery-video.mjs";
import { generateVoxTopic, suggestVoxTopics } from "../../tools/generate-vox-topic.mjs";
import { createVoxVideo } from "../../tools/create-vox-video.mjs";
import { generateNewspaperTopic, suggestNewspaperTopics } from "../../tools/generate-newspaper-topic.mjs";
import { createNewspaperVideo } from "../../tools/create-newspaper-video.mjs";
import { generateKineticTopic, suggestKineticTopics } from "../../tools/generate-kinetic-topic.mjs";
import { createKineticVideo } from "../../tools/create-kinetic-video.mjs";
import { generateChalkTopic, suggestChalkTopics } from "../../tools/generate-chalk-topic.mjs";
import { createChalkVideo } from "../../tools/create-chalk-video.mjs";
import { CHALK_LANG_META, CURATED_CHALK_TOPICS } from "../../tools/chalk-configs.mjs";
import { generateTierListTopic, suggestTierListTopics } from "../../tools/generate-tierlist-topic.mjs";
import { createTierListVideo } from "../../tools/create-tierlist-video.mjs";
import { TIER_DEFINITIONS, TIERLIST_LANG_META, CURATED_TIERLIST_TOPICS } from "../../tools/tierlist-configs.mjs";
import { generateWildlifeTopic, suggestWildlifeTopics } from "../../tools/generate-wildlife-topic.mjs";
import { createWildlifeVideo } from "../../tools/create-wildlife-video.mjs";
import { WILDLIFE_LANG_META, CURATED_WILDLIFE_TOPICS } from "../../tools/wildlife-configs.mjs";
import { listScienceCategories, listScienceTopics, getScienceTopic, generateAiScienceTopic } from "../../tools/generate-science-topic.mjs";
import { searchWikiImages, getAiImageUrl } from "../../tools/find-image.mjs";
import { COUNTRIES, synthesizeAudio } from "../../tools/voices.mjs";
import { THEMES, getCountryTheme } from "../../tools/themes/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const VIDEOS_DIR = path.join(REPO_ROOT, "videos");
const DIST = path.join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT || 4321);

// Only these tasks may be spawned, and a slug must resolve to a real folder
// under videos/ (except create, which creates it).
const TASKS = { check: "check", render: "render", vo: null, fit: null, create: null, batch_global: null };

const runs = new Map(); // id -> { slug, task, lines[], done, code, subs:Set }

const read = async (p) => {
  try {
    return await fsp.readFile(p, "utf8");
  } catch {
    return null;
  }
};
const readJSON = async (p) => {
  const t = await read(p);
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};

async function listSlugs() {
  const entries = await fsp.readdir(VIDEOS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

const safeSlug = (slug) => typeof slug === "string" && /^[a-z0-9-]+$/i.test(slug);

function frontmatter(md) {
  if (!md || !md.startsWith("---")) return {};
  const end = md.indexOf("\n---", 3);
  if (end < 0) return {};
  const out = {};
  for (const line of md.slice(4, end).split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

async function latestRender(dir) {
  try {
    const files = (await fsp.readdir(dir)).filter((f) => f.endsWith(".mp4"));
    if (!files.length) return null;
    const stats = await Promise.all(
      files.map(async (f) => ({ f, s: await fsp.stat(path.join(dir, f)) })),
    );
    stats.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
    return { name: stats[0].f, size: stats[0].s.size, mtime: stats[0].s.mtimeMs };
  } catch {
    return null;
  }
}

async function videoSummary(slug) {
  const dir = path.join(VIDEOS_DIR, slug);
  const [brief, vo, html, durationsAssets, durationsScripts, meta] = await Promise.all([
    read(path.join(dir, "BRIEF.md")),
    read(path.join(dir, "scripts", "generate-vo.mjs")),
    read(path.join(dir, "index.html")),
    readJSON(path.join(dir, "assets", "vo", "durations.json")),
    readJSON(path.join(dir, "scripts", "durations.json")),
    readJSON(path.join(dir, "meta.json")),
  ]);
  const fm = frontmatter(brief);
  const langMatch = html?.match(/<html[^>]+lang=["']([a-z]{2,5})["']/i);
  const lang = vo?.match(/const VIDEO_LANG = "([a-z]{2})"/)?.[1] ?? langMatch?.[1] ?? fm.language ?? meta?.lang ?? meta?.mysteryConfig?.lang ?? "?";
  const duration = Number(meta?.duration ?? html?.match(/const (?:ROOT|TOTAL)_DURATION = ([\d.]+);/)?.[1] ?? (durationsScripts?.rootDuration ?? 0));
  const render = await latestRender(path.join(dir, "renders"));

  let createdAt = meta?.createdAt;
  if (!createdAt) {
    try {
      const st = await fsp.stat(dir);
      createdAt = (st.birthtime?.getTime() ? st.birthtime : st.mtime).toISOString();
    } catch {}
  }

  let linesCount = 0;
  if (durationsAssets && typeof durationsAssets === "object") {
    linesCount = Object.keys(durationsAssets).length;
  } else if (durationsScripts?.results?.length) {
    linesCount = durationsScripts.results.length;
  } else if (meta?.mysteryConfig?.scenes?.length) {
    linesCount = meta.mysteryConfig.scenes.length;
  } else if (meta?.voxConfig?.beats?.length) {
    linesCount = meta.voxConfig.beats.length;
  } else if (meta?.newspaperConfig?.acts?.length) {
    linesCount = meta.newspaperConfig.acts.length;
  } else if (meta?.kineticConfig?.beats?.length) {
    linesCount = meta.kineticConfig.beats.length;
  } else if (meta?.survivalConfig?.tiers?.length) {
    linesCount = meta.survivalConfig.tiers.length + 2;
  } else if (meta?.scienceConfig?.dialogues?.length) {
    linesCount = meta.scienceConfig.dialogues.length;
  } else if (meta?.tierListConfig?.items?.length) {
    linesCount = meta.tierListConfig.items.length;
  } else if (meta?.chalkConfig?.scenes?.length) {
    linesCount = meta.chalkConfig.scenes.length;
  } else if (meta?.wildlifeConfig?.scenes?.length) {
    linesCount = meta.wildlifeConfig.scenes.length;
  } else {
    const itemsMatch = html?.match(/const ITEMS = (\[[\s\S]*?\]);/);
    if (itemsMatch) {
      try { linesCount = JSON.parse(itemsMatch[1]).length; } catch {}
    }
    if (!linesCount) {
      const scenesMatch = html?.match(/const SCENES = (\[[\s\S]*?\]);/);
      if (scenesMatch) {
        try { linesCount = JSON.parse(scenesMatch[1]).length; } catch {}
      }
    }
    if (!linesCount) {
      const dlgMatch = html?.match(/const DIALOGUES = (\[[\s\S]*?\]);/);
      if (dlgMatch) {
        try { linesCount = JSON.parse(dlgMatch[1]).length; } catch {}
      }
    }
    if (!linesCount && CURATED_TIERLIST_TOPICS[slug]?.items?.length) {
      linesCount = CURATED_TIERLIST_TOPICS[slug].items.length;
    }
    if (!linesCount && CURATED_CHALK_TOPICS[slug]?.scenes?.length) {
      linesCount = CURATED_CHALK_TOPICS[slug].scenes.length;
    }
    if (!linesCount && CURATED_WILDLIFE_TOPICS[slug]?.scenes?.length) {
      linesCount = CURATED_WILDLIFE_TOPICS[slug].scenes.length;
    }
  }

  return {
    slug,
    title: meta?.name || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    lang,
    duration,
    lines: linesCount,
    message: fm.message ?? "",
    hasRender: Boolean(render),
    render,
    hasSnapshot: fs.existsSync(path.join(dir, "snapshots", "contact-sheet.jpg")),
    createdAt: createdAt || new Date().toISOString(),
  };
}

const BEATS_20 = [
  "hook", "hook",
  "stakes", "question",
  "side A (def)", "side A (mech)", "side A (power)", "side A (flaw)",
  "bridge",
  "side B (def)", "side B (sol)", "side B (power)", "side B (tradeoff)",
  "round 1", "round 2", "round 3", "summary",
  "golden rule", "payoff", "cta"
];
const BEATS_12 = ["hook", "hook", "question", "side A", "side A", "side A", "side B", "side B", "side B", "compare", "compare", "payoff"];

async function videoDetail(slug) {
  const dir = path.join(VIDEOS_DIR, slug);
  const summary = await videoSummary(slug);
  const [vo, html, durationsAssets, durationsScripts, brief, specRaw, metaJSON] = await Promise.all([
    read(path.join(dir, "scripts", "generate-vo.mjs")),
    read(path.join(dir, "index.html")),
    readJSON(path.join(dir, "assets", "vo", "durations.json")),
    readJSON(path.join(dir, "scripts", "durations.json")),
    read(path.join(dir, "BRIEF.md")),
    readJSON(path.join(dir, "spec.json")),
    readJSON(path.join(dir, "meta.json")),
  ]);

  const durations = durationsAssets || (durationsScripts?.results ? Object.fromEntries(durationsScripts.results.map((r, i) => [`line-${i + 1}`, r.dur])) : durationsScripts);
  let spec = specRaw || (metaJSON?.type || metaJSON?.mysteryConfig || metaJSON?.scienceConfig || metaJSON?.survivalConfig ? { ...metaJSON } : null);

  // narration text exactly as handed to the TTS provider
  const spoken = {};
  if (vo) {
    const voLineRegex = /(?:id|["']id["'])\s*:\s*["']line-(\d+)["'][\s\S]*?(?:text|["']text["'])\s*:\s*["']([\s\S]*?)["']\s*\}/g;
    for (const m of vo.matchAll(voLineRegex)) {
      spoken[Number(m[1])] = m[2].replace(/\\"/g, '"').replace(/\\n/g, " ");
    }
  }

  // Check if this is a survival video
  const isSurvival = spec?.type === "survival" ||
    metaJSON?.type === "survival" ||
    Boolean(spec?.survivalConfig) ||
    Boolean(metaJSON?.survivalConfig) ||
    slug.startsWith("survival-") ||
    Boolean(html?.includes("scanner-card"));
  if (isSurvival) {
    let cfg = spec?.survivalConfig || metaJSON?.survivalConfig;
    if (!cfg || !cfg.tiers) {
      try {
        const tiersMatch = html?.match(/const TIERS = (\[[\s\S]*?\]);/);
        const parsedTiers = tiersMatch ? JSON.parse(tiersMatch[1]) : [];
        cfg = {
          lang: summary.lang,
          slug,
          tiers: parsedTiers,
          prologueSpoken: spoken[1] || "",
          prologueText: spoken[1] || "",
          ctaSpoken: spoken[12] || "",
          ctaText: spoken[12] || "",
          ...(cfg || {}),
        };
      } catch (err) {
        cfg = { lang: summary.lang, slug, tiers: [], ...(cfg || {}) };
      }
    }
    const tiers = cfg.tiers || [];
    const script = [
      {
        n: 1,
        spoken: spoken[1] ?? cfg.prologueSpoken ?? "",
        caption: cfg.prologueText ?? cfg.prologueSpoken ?? spoken[1] ?? "",
        start: 0.2,
        dur: durations?.["line-1"] ?? 3.48,
        beat: "Lời mở đầu (Hook)",
        image: null,
      },
      ...tiers.map((t, idx) => {
        const n = idx + 2;
        const tierId = idx + 1;
        const imgRel = `assets/images/tier-${tierId}.jpg`;
        const hasImg = fs.existsSync(path.join(dir, imgRel));
        return {
          n,
          tierId,
          spoken: spoken[n] ?? t.caption ?? "",
          caption: t.caption ?? spoken[n] ?? "",
          start: 4.2 + idx * 5.5,
          dur: durations?.[`line-${n}`] ?? 4.69,
          beat: `Cấp ${tierId}/10: ${t.title || ""}`,
          title: t.title || "",
          desc: t.desc || "",
          survival: t.survival || "",
          image: hasImg ? `/videos/${slug}/${imgRel}` : null,
          imagePrompt: t.imagePrompt || `A detailed 3D cinematic rendering of ${t.title || ""}, ${t.desc || ""}`,
        };
      }),
      {
        n: 12,
        spoken: spoken[12] ?? cfg.ctaSpoken ?? "",
        caption: cfg.ctaText ?? cfg.ctaSpoken ?? spoken[12] ?? "",
        start: 59.2,
        dur: durations?.["line-12"] ?? 4.3,
        beat: "Lời kết (Outro / CTA)",
        image: null,
      },
    ];
    if (!spec) spec = { type: "survival", slug, survivalConfig: cfg, ...(metaJSON || {}) };
    else if (!spec.survivalConfig) spec.survivalConfig = cfg;
    return { ...summary, script, spec, brief: brief ?? "" };
  }

  // Check if this is a Tier List Ranking video
  const isTierList = spec?.type === "tierlist" ||
    metaJSON?.type === "tierlist" ||
    metaJSON?.template === "tierlist" ||
    slug.startsWith("tierlist-") ||
    Boolean(spec?.tierListConfig) ||
    Boolean(metaJSON?.tierListConfig) ||
    Boolean(html?.includes("const ITEMS ="));

  if (isTierList) {
    const curated = CURATED_TIERLIST_TOPICS[slug];
    let cfg = spec?.tierListConfig || metaJSON?.tierListConfig || curated || {};
    let items = cfg.items || specRaw?.items || [];
    if (!items.length && html) {
      try {
        const itemsMatch = html.match(/const ITEMS = (\[[\s\S]*?\]);/);
        if (itemsMatch) items = JSON.parse(itemsMatch[1]);
      } catch (err) {}
    }
    if (curated?.items?.length) {
      if (!items.length) {
        items = curated.items;
      } else {
        items = items.map((it, idx) => {
          const c = curated.items[idx] || curated.items.find((x) => x.id === it.id || x.name === it.name) || {};
          return { ...c, ...it };
        });
      }
    }

    const script = items.map((it, idx) => {
      const n = idx + 1;
      const imgRel = `assets/images/item-${n}-icon.jpg`;
      const showcaseRel = `assets/images/item-${n}-showcase.jpg`;
      const hasIcon = fs.existsSync(path.join(dir, imgRel));
      const hasShowcase = fs.existsSync(path.join(dir, showcaseRel));
      const chosenImg = hasIcon ? imgRel : hasShowcase ? showcaseRel : null;

      const spokenText = it.spoken || [it.hook, it.review, it.verdict].filter(Boolean).join(" ");
      const captionText = it.caption || `${it.name || ''} — Bậc ${it.tier || '?'}: ${it.verdict || it.review || ''}`;
      const startSec = it.itemStart ?? it.start ?? (idx * 14.0);
      const durSec = it.duration ?? (it.itemEnd ? Math.max(2, it.itemEnd - startSec) : 14.0);

      return {
        n,
        sceneId: n,
        tierId: it.tier,
        tier: it.tier,
        spoken: spokenText,
        caption: captionText,
        hook: it.hook || "",
        review: it.review || "",
        verdict: it.verdict || "",
        start: startSec,
        dur: durSec,
        beat: `Bậc ${it.tier || '?'}: ${it.name || `Ứng viên ${n}`}`,
        title: it.name || `Ứng viên ${n}`,
        desc: `Bậc: ${it.tier || '?'} — ${it.subtitle || ''}`,
        image: chosenImg ? `/videos/${slug}/${chosenImg}` : null,
      };
    });

    if (!spec) {
      spec = {
        type: "tierlist",
        slug,
        tierListConfig: { ...cfg, items },
        items,
        ...(specRaw || {}),
        ...(metaJSON || {}),
      };
    } else {
      if (!spec.tierListConfig) spec.tierListConfig = { ...cfg, items };
      if (!spec.items) spec.items = items;
    }
    return { ...summary, lines: script.length, script, spec, brief: brief ?? "" };
  }

  // Check if this is a Chalkboard Map video
  const isChalk = !isTierList && (spec?.type === "chalk" ||
    metaJSON?.type === "chalk" ||
    metaJSON?.template === "chalk" ||
    slug.startsWith("chalk-") ||
    Boolean(spec?.chalkConfig) ||
    Boolean(metaJSON?.chalkConfig) ||
    Boolean(html?.includes("chalk-card")) ||
    Boolean(html?.includes("const SCENES =")));

  if (isChalk) {
    const curated = CURATED_CHALK_TOPICS[slug];
    let cfg = spec?.chalkConfig || metaJSON?.chalkConfig || curated || {};
    let scenes = cfg.scenes || specRaw?.scenes || [];
    if (!scenes.length && html) {
      try {
        const scenesMatch = html.match(/const SCENES = (\[[\s\S]*?\]);/);
        if (scenesMatch) scenes = JSON.parse(scenesMatch[1]);
      } catch (err) {}
    }
    if (curated?.scenes?.length && !scenes.length) {
      scenes = curated.scenes;
    }

    const script = scenes.map((sc, idx) => {
      const n = idx + 1;
      const mapKey = sc.map || "master";
      const imgRel = `assets/images/map-${mapKey}.jpg`;
      const hasImg = fs.existsSync(path.join(dir, imgRel));
      return {
        n,
        sceneId: n,
        spoken: sc.line || "",
        caption: sc.line || "",
        start: specRaw?.startTimes?.[idx] ?? sc.start ?? (idx * 7.5),
        dur: specRaw?.durations?.[idx] ?? sc.dur ?? 7.0,
        beat: `Cảnh ${n}: ${sc.header || `Bản đồ ${mapKey}`}`,
        title: sc.header || `Cảnh ${n}`,
        header: sc.header || "",
        badge: sc.badge || "",
        sfx: sc.sfx || "",
        desc: `Bản đồ: ${mapKey}`,
        image: hasImg ? `/videos/${slug}/${imgRel}` : null,
      };
    });
    if (!spec) {
      spec = {
        type: "chalk",
        slug,
        chalkConfig: { ...cfg, scenes },
        scenes,
        ...(specRaw || {}),
        ...(metaJSON || {}),
      };
    } else {
      if (!spec.chalkConfig) spec.chalkConfig = { ...cfg, scenes };
      if (!spec.scenes) spec.scenes = scenes;
    }
    return { ...summary, lines: script.length, script, spec, brief: brief ?? "" };
  }

  // Check if this is an AI Wildlife Documentary video
  const isWildlife = !isTierList && !isChalk && (
    spec?.type === "wildlife" ||
    metaJSON?.type === "wildlife" ||
    metaJSON?.template === "wildlife" ||
    slug.startsWith("wildlife-") ||
    slug.startsWith("dong-vat-") ||
    Boolean(spec?.wildlifeConfig) ||
    Boolean(metaJSON?.wildlifeConfig) ||
    Boolean(html?.includes("viewfinder-grid")) ||
    Boolean(html?.includes("tactical-stats-hud"))
  );

  if (isWildlife) {
    const curated = CURATED_WILDLIFE_TOPICS[slug];
    let cfg = spec?.wildlifeConfig || metaJSON?.wildlifeConfig || curated || {};
    let scenes = cfg.scenes || specRaw?.scenes || [];
    if (!scenes.length && html) {
      try {
        const scenesMatch = html.match(/const SCENES = (\[[\s\S]*?\]);/);
        if (scenesMatch) scenes = JSON.parse(scenesMatch[1]);
      } catch (err) {}
    }
    if (curated?.scenes?.length && !scenes.length) {
      scenes = curated.scenes;
    }

    const script = scenes.map((sc, idx) => {
      const n = idx + 1;
      const imgRel = sc.imgSrc || `assets/images/scene-${n}.jpg`;
      const hasImg = fs.existsSync(path.join(dir, imgRel)) || fs.existsSync(path.join(dir, imgRel.replace(/\.jpg$/, ".svg")));
      const finalImg = fs.existsSync(path.join(dir, imgRel)) ? imgRel : imgRel.replace(/\.jpg$/, ".svg");
      return {
        n,
        sceneId: n,
        spoken: sc.line || "",
        caption: sc.line || "",
        start: sc.start ?? (idx * 8.0),
        dur: sc.duration ?? sc.dur ?? 7.5,
        beat: sc.badge || `Cảnh ${n}: Thông Số Sinh Tồn`,
        title: sc.badge || `Cảnh ${n}`,
        badge: sc.badge || "",
        telemetry: sc.telemetry || "",
        highlightWords: sc.highlightWords || [],
        visualPrompt: sc.visualPrompt || "",
        desc: sc.telemetry || "Chỉ số sinh tồn",
        image: hasImg ? `/videos/${slug}/${finalImg}` : null,
      };
    });
    if (!spec) {
      spec = {
        type: "wildlife",
        slug,
        title: cfg.topicTitle || "Thế Giới Động Vật",
        latinName: cfg.latinName || "",
        habitat: cfg.habitat || "",
        stats: cfg.stats || {},
        wildlifeConfig: { ...cfg, scenes },
        scenes,
        ...(specRaw || {}),
        ...(metaJSON || {}),
      };
    } else {
      if (!spec.wildlifeConfig) spec.wildlifeConfig = { ...cfg, scenes };
      if (!spec.scenes) spec.scenes = scenes;
    }
    return { ...summary, lines: script.length, script, spec, brief: brief ?? "" };
  }

  // Check if this is a mystery video
  const isMystery = !isChalk && !isWildlife && (spec?.type === "mystery" ||
    metaJSON?.type === "mystery" ||
    Boolean(spec?.mysteryConfig) ||
    Boolean(metaJSON?.mysteryConfig) ||
    slug.startsWith("mystery-") ||
    slug.startsWith("bi-an-") ||
    Boolean(html?.includes("story-card")) ||
    Boolean(html?.includes("const SCENES =")));
  if (isMystery) {
    let cfg = spec?.mysteryConfig || metaJSON?.mysteryConfig || {};
    let scenes = cfg.scenes || [];
    if (!scenes.length) {
      try {
        const scenesMatch = html?.match(/const SCENES = (\[[\s\S]*?\]);\s*(?:const TOTAL_DURATION|<\/script>|window\.__timelines)/);
        scenes = scenesMatch ? JSON.parse(scenesMatch[1]) : [];
        cfg = {
          lang: summary.lang,
          slug,
          scenes,
          ...(cfg || {}),
        };
      } catch {
        scenes = [];
      }
    }
    const script = scenes.map((sc, idx) => {
      const n = idx + 1;
      const sceneId = n;
      const imgRel = sc.imgSrc || `assets/images/scene-${n}.jpg`;
      const hasImg = fs.existsSync(path.join(dir, imgRel)) ||
        fs.existsSync(path.join(dir, imgRel.replace(/\.jpg$/, ".png"))) ||
        fs.existsSync(path.join(dir, imgRel.replace(/\.jpg$/, ".svg")));
      return {
        n,
        sceneId,
        spoken: sc.line || "",
        caption: sc.line || "",
        start: sc.start ?? (0.5 + idx * 6.5),
        dur: sc.duration ?? 6,
        beat: `Cảnh ${n}: ${sc.telemetry || `Phân cảnh ${n}`}`,
        title: `Phân cảnh ${n}`,
        desc: sc.telemetry || "",
        telemetry: sc.telemetry || "",
        image: hasImg ? `/videos/${slug}/${imgRel}` : `/videos/${slug}/assets/images/scene-${n}.jpg`,
        imagePrompt: sc.imagePrompt || `Cinematic documentary shot of ${sc.line || ""}, 8k photorealistic`,
      };
    });
    if (!spec) spec = { type: "mystery", slug, mysteryConfig: { ...cfg, scenes }, ...(metaJSON || {}) };
    else if (!spec.mysteryConfig) spec.mysteryConfig = { ...cfg, scenes };
    return { ...summary, script, spec, brief: brief ?? "" };
  }

  // Check if this is a science video
  const isScience = spec?.type === "science" ||
    metaJSON?.type === "science" ||
    Boolean(spec?.scienceConfig) ||
    Boolean(metaJSON?.scienceConfig) ||
    slug.startsWith("science-") ||
    Boolean(html?.includes("const DIALOGUES =")) ||
    Boolean(brief?.includes("anthropomorphic-science"));
  if (isScience) {
    let dialogues = spec?.scienceConfig?.dialogues || metaJSON?.scienceConfig?.dialogues;
    if (!dialogues || !dialogues.length) {
      if (durationsScripts?.results?.length) {
        dialogues = durationsScripts.results;
      } else {
        try {
          const dlgMatch = html?.match(/const DIALOGUES = (\[[\s\S]*?\]);\s*(?:const ROOT_DURATION|tl\.)/);
          dialogues = dlgMatch ? JSON.parse(dlgMatch[1]) : [];
        } catch {
          dialogues = [];
        }
      }
    }
    const charImageMap = {
      charA: "assets/characters/char-a.png",
      charB: "assets/characters/char-b.png",
      narrator: "assets/characters/stomp-boot.png",
    };
    const script = (dialogues || []).map((d, idx) => {
      const n = idx + 1;
      const speakerKey = d.speaker || "narrator";
      const speakerTitle = speakerKey === "charA"
        ? "Nhân vật A"
        : speakerKey === "charB"
        ? "Nhân vật B"
        : "Người dẫn chuyện / Bác Nông Dân";
      const imgRel = charImageMap[speakerKey];
      const hasImg = imgRel && fs.existsSync(path.join(dir, imgRel));
      return {
        n,
        dialogueId: n,
        speaker: speakerKey,
        emotion: d.emotion || "",
        spoken: d.text || "",
        caption: d.text || "",
        start: d.start ?? null,
        dur: d.dur ?? null,
        beat: `${speakerTitle}${d.emotion ? ` • ${d.emotion}` : ""}`,
        title: speakerTitle,
        desc: d.emotion ? `Biểu cảm: ${d.emotion}` : "",
        image: hasImg ? `/videos/${slug}/${imgRel}` : null,
      };
    });
    if (!spec) spec = { type: "science", slug, scienceConfig: { dialogues }, ...(metaJSON || {}) };
    else if (!spec.scienceConfig) spec.scienceConfig = { dialogues };
    return { ...summary, script, spec, brief: brief ?? "" };
  }

  // Check if this is a Vox Motion Collage video
  const isVox = spec?.type === "vox" ||
    metaJSON?.template === "vox" ||
    metaJSON?.category === "vox-collage" ||
    slug.startsWith("vox-") ||
    Boolean(html?.includes("vox-collage")) ||
    Boolean(html?.includes("const BEATS ="));
  if (isVox) {
    let cfg = spec?.voxConfig || metaJSON?.voxConfig || {};
    let beats = cfg.beats || [];
    if (!beats.length) {
      try {
        const beatsMatch = html?.match(/const BEATS = (\[[\s\S]*?\]);\s*(?:const TOTAL_DURATION|<\/script>|window\.__timelines)/);
        beats = beatsMatch ? JSON.parse(beatsMatch[1]) : [];
      } catch {
        beats = [];
      }
    }
    const script = beats.map((bt, idx) => {
      const n = idx + 1;
      const imgRel = `assets/images/sticker-${n}.jpg`;
      const hasImg = fs.existsSync(path.join(dir, imgRel)) ||
        fs.existsSync(path.join(dir, imgRel.replace(/\.jpg$/, ".svg")));
      return {
        n,
        spoken: bt.line || "",
        caption: bt.line || "",
        start: bt.start ?? (0.5 + idx * 8.0),
        dur: bt.duration ?? 8.0,
        beat: `Hồi ${n}: ${bt.name || bt.label || `Sticker ${n}`}`,
        title: bt.label || bt.name || `Sticker ${n}`,
        desc: bt.marker || bt.note || "",
        image: hasImg ? `/videos/${slug}/${imgRel}` : null,
      };
    });
    if (!spec) spec = { type: "vox", slug, voxConfig: { ...cfg, beats }, ...(metaJSON || {}) };
    else if (!spec.voxConfig) spec.voxConfig = { ...cfg, beats };
    return { ...summary, script, spec, brief: brief ?? "" };
  }

  // Check if this is a Retro Newspaper video
  const isNewspaper = spec?.type === "newspaper" ||
    metaJSON?.template === "newspaper" ||
    metaJSON?.category === "retro-newspaper" ||
    slug.startsWith("newspaper-") ||
    Boolean(html?.includes("newsprint-bg")) ||
    Boolean(html?.includes("const ACTS ="));
  if (isNewspaper) {
    let cfg = spec?.newspaperConfig || metaJSON?.newspaperConfig || {};
    let acts = cfg.acts || [];
    if (!acts.length) {
      try {
        const actsMatch = html?.match(/const ACTS = (\[[\s\S]*?\]);\s*(?:const TOTAL_DURATION|<\/script>|window\.__timelines)/);
        acts = actsMatch ? JSON.parse(actsMatch[1]) : [];
      } catch {
        acts = [];
      }
    }
    const script = acts.map((act, idx) => {
      const n = idx + 1;
      const imgRel = `assets/images/act-${n}.jpg`;
      const hasImg = fs.existsSync(path.join(dir, imgRel)) ||
        fs.existsSync(path.join(dir, imgRel.replace(/\.jpg$/, ".svg")));
      return {
        n,
        spoken: act.line || "",
        caption: act.line || "",
        start: act.start ?? (0.5 + idx * 8.0),
        dur: act.duration ?? 8.0,
        beat: `Hồi ${n}: ${act.headline || `Tư liệu ${n}`}`,
        title: act.headline || `Tư liệu ${n}`,
        desc: act.stamp ? `Con dấu: ${act.stamp}` : "",
        image: hasImg ? `/videos/${slug}/${imgRel}` : null,
      };
    });
    if (!spec) spec = { type: "newspaper", slug, newspaperConfig: { ...cfg, acts }, ...(metaJSON || {}) };
    else if (!spec.newspaperConfig) spec.newspaperConfig = { ...cfg, acts };
    return { ...summary, script, spec, brief: brief ?? "" };
  }

  // Check if this is a Dark Cyber Kinetic video
  const isKinetic = spec?.type === "kinetic" ||
    metaJSON?.template === "kinetic" ||
    metaJSON?.category === "dark-cyber-kinetic" ||
    slug.startsWith("kinetic-") ||
    Boolean(html?.includes("cyber-ambient-bg")) ||
    Boolean(html?.includes("wireframe-wrap"));
  if (isKinetic) {
    let cfg = spec?.kineticConfig || metaJSON?.kineticConfig || {};
    let beats = cfg.beats || [];
    if (!beats.length) {
      try {
        const beatsMatch = html?.match(/const BEATS = (\[[\s\S]*?\]);\s*(?:const TOTAL_DURATION|<\/script>|window\.__timelines)/);
        beats = beatsMatch ? JSON.parse(beatsMatch[1]) : [];
      } catch {
        beats = [];
      }
    }
    const script = beats.map((bt, idx) => {
      const n = idx + 1;
      return {
        n,
        spoken: bt.line || "",
        caption: bt.line || "",
        start: bt.start ?? (0.5 + idx * 7.5),
        dur: bt.duration ?? 7.5,
        beat: `Nhịp ${n}: ${bt.punchline || `Giao thức ${n}`}`,
        title: bt.punchline || `Giao thức ${n}`,
        desc: bt.metricValue ? `Chỉ số: ${bt.metricValue} (${bt.metricLabel || ''})` : "",
        image: null,
      };
    });
    if (!spec) spec = { type: "kinetic", slug, kineticConfig: { ...cfg, beats }, ...(metaJSON || {}) };
    else if (!spec.kineticConfig) spec.kineticConfig = { ...cfg, beats };
    return { ...summary, script, spec, brief: brief ?? "" };
  }

  // Otherwise comparison video
  const captions = {};
  for (const m of html?.matchAll(/id="line-(\d+)"><span[^>]*>(.*?)<\/span><\/div>/gs) ?? [])
    captions[Number(m[1])] = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const timing = {};
  for (const m of html?.matchAll(/(\d+): \{ start: ([\d.]+), dur: ([\d.]+) \}/g) ?? [])
    timing[Number(m[1])] = { start: Number(m[2]), dur: Number(m[3]) };

  const count = Math.max(Object.keys(spoken).length, Object.keys(captions).length, spec?.captions?.length ?? 0);
  const leftImgRel = fs.existsSync(path.join(dir, "assets", "icons", "left.png"))
    ? "assets/icons/left.png"
    : fs.existsSync(path.join(dir, "assets", "icons", "left.jpg"))
    ? "assets/icons/left.jpg"
    : null;
  const rightImgRel = fs.existsSync(path.join(dir, "assets", "icons", "right.png"))
    ? "assets/icons/right.png"
    : fs.existsSync(path.join(dir, "assets", "icons", "right.jpg"))
    ? "assets/icons/right.jpg"
    : null;

  const script = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const beat = count === 20 ? BEATS_20[i] : count === 12 ? BEATS_12[i] : `line ${n}`;
    const isSideA = beat.toLowerCase().includes("side a");
    const isSideB = beat.toLowerCase().includes("side b");
    const image = isSideA && leftImgRel ? `/videos/${slug}/${leftImgRel}` : isSideB && rightImgRel ? `/videos/${slug}/${rightImgRel}` : null;
    return {
      n,
      spoken: spoken[n] ?? spec?.spoken?.[i] ?? "",
      caption: captions[n] ?? spec?.captions?.[i] ?? spoken[n] ?? "",
      start: timing[n]?.start ?? null,
      dur: timing[n]?.dur ?? durations?.[`line-${n}`] ?? null,
      beat,
      image,
      side: isSideA ? "left" : isSideB ? "right" : null,
    };
  });
  return { ...summary, script, spec, brief: brief ?? "" };
}

function sendJSON(res, code, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, { "content-type": "application/json", "content-length": buf.length });
  res.end(buf);
}

function serveFile(req, res, file, type) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    res.writeHead(404).end("not found");
    return;
  }

  let start = 0;
  let end = stat.size - 1;
  let partial = false;
  const range = req.headers.range;
  if (range) {
    // Một range hỏng hoặc trỏ ra ngoài file phải trả 416, không được để
    // createReadStream ném sau khi header đã gửi. Chuyện này xảy ra thật khi
    // render đè lên file MP4 mà trình duyệt đang phát: nó xin tiếp offset của
    // file cũ, đã dài hơn file mới.
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    const s0 = m?.[1] ? Number(m[1]) : 0;
    const e0 = m?.[2] ? Number(m[2]) : stat.size - 1;
    if (!m || !Number.isFinite(s0) || !Number.isFinite(e0) || s0 > e0 || s0 >= stat.size) {
      res.writeHead(416, { "content-range": `bytes */${stat.size}` }).end();
      return;
    }
    start = s0;
    end = Math.min(e0, stat.size - 1);
    partial = true;
  }

  res.writeHead(partial ? 206 : 200, {
    "content-type": type,
    "content-length": end - start + 1,
    "accept-ranges": "bytes",
    ...(partial ? { "content-range": `bytes ${start}-${end}/${stat.size}` } : {}),
  });

  const stream = fs.createReadStream(file, { start, end });
  // File có thể bị xoá giữa chừng (render mới ghi đè). Kết thúc kết nối, đừng
  // để lỗi nổi lên thành uncaught exception.
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

function startRun(slug, task, opts = {}) {
  const id = randomUUID();
  const cwd = path.join(VIDEOS_DIR, slug);
  const run = { id, slug, task, lines: [], done: false, code: null, subs: new Set(), startedAt: Date.now() };
  runs.set(id, run);

  let tempSpecPath = null;
  if (task === "create") {
    tempSpecPath = path.join(REPO_ROOT, "tools", `.tmp-spec-${id}.json`);
    fs.writeFileSync(tempSpecPath, JSON.stringify(opts.spec || {}, null, 2));
  }

  // `fit` and `create` run from the repo root
  const [cmd, args, wd] =
    task === "vo"
      ? ["node", ["scripts/generate-vo.mjs"], cwd]
      : task === "batch_global"
        ? [
            "node",
            [
              "tools/batch-global.mjs",
              opts.topic,
              ...(opts.target ? ["--target", String(opts.target)] : []),
              ...(opts.render ? ["--render"] : []),
            ],
            REPO_ROOT,
          ]
        : task === "fit"
        ? [
            "sh",
            [
              "-c",
              `node tools/fit-duration.mjs ${slug} ${opts.target}` +
                (opts.render ? ` && cd videos/${slug} && npm run render` : ""),
            ],
            REPO_ROOT,
          ]
        : task === "create"
          ? [
              "node",
              opts.spec?.type === "survival"
                ? [
                    "tools/create-survival-video.mjs",
                    "--spec",
                    tempSpecPath,
                    "--lang", opts.spec.lang || "vi",
                    "--slug", slug,
                    ...(opts.spec?.voice ? ["--voice", opts.spec.voice] : []),
                    ...(opts.render ? ["--render"] : []),
                  ]
                : opts.spec?.type === "mystery"
                ? [
                    "-e",
                    `import { createMysteryVideo } from './tools/create-mystery-video.mjs'; import fs from 'fs'; const spec = JSON.parse(fs.readFileSync('${tempSpecPath}', 'utf8')); await createMysteryVideo({ spec, slug: '${slug}', lang: spec.lang || 'vi', render: ${Boolean(opts.render)} });`,
                  ]
                : opts.spec?.type === "vox"
                ? [
                    "-e",
                    `import { createVoxVideo } from './tools/create-vox-video.mjs'; import fs from 'fs'; const spec = JSON.parse(fs.readFileSync('${tempSpecPath}', 'utf8')); await createVoxVideo({ spec, slug: '${slug}', lang: spec.lang || 'vi', render: ${Boolean(opts.render)} });`,
                  ]
                : opts.spec?.type === "newspaper"
                ? [
                    "-e",
                    `import { createNewspaperVideo } from './tools/create-newspaper-video.mjs'; import fs from 'fs'; const spec = JSON.parse(fs.readFileSync('${tempSpecPath}', 'utf8')); await createNewspaperVideo({ spec, slug: '${slug}', lang: spec.lang || 'vi', render: ${Boolean(opts.render)} });`,
                  ]
                : opts.spec?.type === "kinetic"
                ? [
                    "-e",
                    `import { createKineticVideo } from './tools/create-kinetic-video.mjs'; import fs from 'fs'; const spec = JSON.parse(fs.readFileSync('${tempSpecPath}', 'utf8')); await createKineticVideo({ spec, slug: '${slug}', lang: spec.lang || 'vi', render: ${Boolean(opts.render)} });`,
                  ]
                : opts.spec?.type === "science"
                ? [
                    "-e",
                    `import { createScienceVideo } from './tools/create-science-video.mjs'; import fs from 'fs'; const spec = JSON.parse(fs.readFileSync('${tempSpecPath}', 'utf8')); await createScienceVideo({ spec, slug: '${slug}', lang: spec.lang || 'vi', render: ${Boolean(opts.render)} });`,
                  ]
                : opts.spec?.type === "chalk"
                ? [
                    "-e",
                    `import { createChalkVideo } from './tools/create-chalk-video.mjs'; import fs from 'fs'; const spec = JSON.parse(fs.readFileSync('${tempSpecPath}', 'utf8')); await createChalkVideo({ presetSlug: '${slug}', prompt: spec.prompt || spec.topicTitle || spec.title, voice: spec.voice, render: ${Boolean(opts.render)} });`,
                  ]
                : opts.spec?.type === "tierlist"
                ? [
                    "-e",
                    `import { createTierListVideo } from './tools/create-tierlist-video.mjs'; import fs from 'fs'; const spec = JSON.parse(fs.readFileSync('${tempSpecPath}', 'utf8')); await createTierListVideo({ slug: '${slug}', prompt: spec.prompt || spec.topicTitle || spec.title, voice: spec.voice, render: ${Boolean(opts.render)} });`,
                  ]
                : opts.spec?.type === "wildlife"
                ? [
                    "-e",
                    `import { createWildlifeVideo } from './tools/create-wildlife-video.mjs'; import fs from 'fs'; const spec = JSON.parse(fs.readFileSync('${tempSpecPath}', 'utf8')); await createWildlifeVideo({ spec, slug: '${slug}', lang: spec.lang || 'vi', render: ${Boolean(opts.render)} });`,
                  ]
                : [
                    "tools/create-video.mjs",
                    "--spec",
                    tempSpecPath,
                    ...(opts.target ? ["--target", String(opts.target)] : []),
                    ...(opts.render ? ["--render"] : []),
                  ],
              REPO_ROOT,
            ]
        : ["npm", ["run", TASKS[task]], cwd];
  const child = spawn(cmd, args, { cwd: wd, env: { ...process.env, FORCE_COLOR: "0" } });
  run.child = child;

  const push = (chunk, stream) => {
    for (const raw of chunk.toString().split(/\r?\n/)) {
      const line = raw.replace(ANSI, "");
      if (!line.trim()) continue;
      const entry = { t: Date.now(), stream, line };
      run.lines.push(entry);
      if (run.lines.length > 2000) run.lines.shift();
      for (const sub of run.subs) sub.write(`data: ${JSON.stringify(entry)}\n\n`);
    }
  };
  child.stdout.on("data", (c) => push(c, "out"));
  child.stderr.on("data", (c) => push(c, "err"));
  child.on("close", (code) => {
    if (tempSpecPath && fs.existsSync(tempSpecPath)) {
      try {
        fs.unlinkSync(tempSpecPath);
      } catch {}
    }
    run.done = true;
    run.code = code;
    for (const sub of run.subs) {
      sub.write(`event: done\ndata: ${JSON.stringify({ code })}\n\n`);
      sub.end();
    }
    run.subs.clear();
  });
  return run;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  try {
    // Topic suggestions & automatic generation
    if (p === "/api/topics") {
      const cat = url.searchParams.get("category");
      const query = url.searchParams.get("query");
      const lang = url.searchParams.get("lang") || "en";
      return sendJSON(res, 200, {
        categories: listCategories(),
        topics: listTopics({ category: cat, query, lang }),
      });
    }

    if (p === "/api/topics/generate" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const spec = await generateTopic(body2);
        return sendJSON(res, 200, spec);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/survival/generate" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const result = await generateSurvivalTopic(body2);
        return sendJSON(res, 200, result);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/science/topics") {
      return sendJSON(res, 200, {
        categories: listScienceCategories(),
        topics: listScienceTopics(),
      });
    }

    if (p === "/api/science/generate" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        let result;
        if (body2.id) {
          result = getScienceTopic(body2.id, body2.lang || "vi");
        } else {
          result = await generateAiScienceTopic(body2.prompt, body2.lang || "vi");
        }
        return sendJSON(res, 200, result);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/mystery/generate" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const result = await generateMysteryTopic(body2);
        return sendJSON(res, 200, result);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/mystery/suggest-topics" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const topics = await suggestMysteryTopics({
          lang: body2.lang || "vi",
          count: body2.count || 10,
        });
        return sendJSON(res, 200, { topics });
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/vox/generate" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const result = await generateVoxTopic(body2);
        return sendJSON(res, 200, result);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/vox/suggest-topics" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const topics = await suggestVoxTopics({
          lang: body2.lang || "vi",
          count: body2.count || 10,
        });
        return sendJSON(res, 200, { topics });
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/newspaper/generate" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const result = await generateNewspaperTopic(body2);
        return sendJSON(res, 200, result);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/newspaper/suggest-topics" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const topics = await suggestNewspaperTopics({
          lang: body2.lang || "vi",
          count: body2.count || 10,
        });
        return sendJSON(res, 200, { topics });
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/kinetic/generate" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const result = await generateKineticTopic(body2);
        return sendJSON(res, 200, result);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/kinetic/suggest-topics" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const topics = await suggestKineticTopics({
          lang: body2.lang || "vi",
          count: body2.count || 10,
        });
        return sendJSON(res, 200, { topics });
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/chalk/generate" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const result = await generateChalkTopic(body2);
        return sendJSON(res, 200, result);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/chalk/suggest-topics" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const topics = await suggestChalkTopics({
          lang: body2.lang || "vi",
          count: body2.count || 10,
        });
        return sendJSON(res, 200, { topics });
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/tierlist/generate" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const result = await generateTierListTopic(body2);
        return sendJSON(res, 200, result);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/tierlist/suggest-topics" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const topics = await suggestTierListTopics({
          lang: body2.lang || "vi",
          count: body2.count || 8,
        });
        return sendJSON(res, 200, { topics });
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/wildlife/generate" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const result = await generateWildlifeTopic(body2);
        return sendJSON(res, 200, result);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (p === "/api/wildlife/suggest-topics" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      try {
        const topics = await suggestWildlifeTopics({
          lang: body2.lang || "vi",
          count: body2.count || 8,
        });
        return sendJSON(res, 200, { topics });
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    // Image search for concept cards (real Wikipedia photos + AI generated)
    if (p === "/api/images/search") {
      const q = url.searchParams.get("q") || "";
      const mode = url.searchParams.get("mode") || "all";
      if (!q) return sendJSON(res, 400, { error: "Thiếu query param 'q'" });
      try {
        const results = [];
        if (mode === "real" || mode === "all") {
          const wiki = await searchWikiImages(q, 4);
          results.push(...wiki);
        }
        if (mode === "ai" || mode === "all" || results.length === 0) {
          results.push({
            title: `Ảnh AI: ${q}`,
            description: "Pollinations Flux (Cinematic)",
            url: getAiImageUrl(q),
            source: "pollinations",
          });
        }
        return sendJSON(res, 200, { images: results });
      } catch (e) {
        return sendJSON(res, 500, { error: e.message });
      }
    }

    // Supported countries and voices
    if (p === "/api/voices") {
      return sendJSON(res, 200, { countries: COUNTRIES });
    }

    // Voice preview endpoint (synthesizes short speech sample with caching)
    if (p === "/api/tts/preview") {
      try {
        const voice = url.searchParams.get("voice") || "BV421_vivn_streaming";
        const lang = url.searchParams.get("lang") || "vi";
        const customText = url.searchParams.get("text");

        const sampleTexts = {
          vi: "Xin chào! Đây là bản nghe thử giọng đọc cho video của bạn.",
          en: "Hello! This is a voice preview for your upcoming video.",
          de: "Hallo! Dies ist eine Hörprobe für deine Videonarration.",
          fr: "Bonjour! Ceci est un aperçu vocal pour la narration de votre vidéo.",
          ja: "こんにちは！これは動画ナレーションの音声プレビューです。",
          ko: "안녕하세요! 동영상 내레이션을 위한 음성 미리듣기입니다.",
        };
        const text = customText || sampleTexts[lang] || sampleTexts.vi;

        const cacheKey = `${voice}_${lang}_${Buffer.from(text).toString("base64url").slice(0, 16)}`;
        const cacheDir = path.join(REPO_ROOT, "tools", ".cache", "voice-previews");
        fs.mkdirSync(cacheDir, { recursive: true });
        const cacheFile = path.join(cacheDir, `${cacheKey}.mp3`);

        if (!fs.existsSync(cacheFile)) {
          await synthesizeAudio({
            text,
            voice,
            outPath: cacheFile,
            rate: "1.0",
            lang,
          });
        }

        if (fs.existsSync(cacheFile)) {
          return serveFile(req, res, cacheFile, "audio/mpeg");
        } else {
          return sendJSON(res, 500, { error: "Không thể tạo file nghe thử audio" });
        }
      } catch (err) {
        console.error("[TTS Preview] Error:", err);
        return sendJSON(res, 500, { error: err.message });
      }
    }

    // Supported country themes and mascots
    if (p === "/api/themes") {
      const list = Object.values(THEMES).map((t) => ({
        code: t.code,
        country: t.country,
        flag: t.flag,
        mascotName: t.mascotName,
        mascotDesc: t.mascotDesc,
        palette: t.palette,
      }));
      return sendJSON(res, 200, { themes: list });
    }

    // Bản xem thử của template (so sánh, survival, science, chalk, tierlist...)
    if (p === "/api/template" || p === "/api/template/preview") {
      const type = url.searchParams.get("type") || "compare";
      const lang = url.searchParams.get("lang") || "vi";
      const { html, root } =
        type === "survival"
          ? renderSurvivalTemplatePreview(lang)
          : type === "mystery"
          ? renderMysteryTemplatePreview(lang)
          : type === "science"
          ? renderScienceTemplatePreview(lang)
          : type === "vox"
          ? renderVoxTemplatePreview(lang)
          : type === "newspaper"
          ? renderNewspaperTemplatePreview(lang)
          : type === "kinetic"
          ? renderKineticTemplatePreview(lang)
          : type === "chalk"
          ? renderChalkTemplatePreview(lang)
          : type === "tierlist"
          ? renderTierListTemplatePreview(lang)
          : type === "wildlife"
          ? renderWildlifeTemplatePreview(lang)
          : renderTemplatePreview(lang);
      const buf = Buffer.from(html);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": buf.length,
        "cache-control": "no-store",
        "x-root-duration": String(root),
      });
      return res.end(buf);
    }

    if (p === "/api/template/timing") {
      const type = url.searchParams.get("type") || "compare";
      const lang = url.searchParams.get("lang") || "vi";
      const { root, timing } =
        type === "survival"
          ? renderSurvivalTemplatePreview(lang)
          : type === "mystery"
          ? renderMysteryTemplatePreview(lang)
          : type === "science"
          ? renderScienceTemplatePreview(lang)
          : type === "vox"
          ? renderVoxTemplatePreview(lang)
          : type === "newspaper"
          ? renderNewspaperTemplatePreview(lang)
          : type === "kinetic"
          ? renderKineticTemplatePreview(lang)
          : type === "chalk"
          ? renderChalkTemplatePreview(lang)
          : type === "tierlist"
          ? renderTierListTemplatePreview(lang)
          : type === "wildlife"
          ? renderWildlifeTemplatePreview(lang)
          : renderTemplatePreview(lang);
      return sendJSON(res, 200, { root, timing });
    }

    if (p === "/api/videos") {
      const slugs = await listSlugs();
      const list = await Promise.all(slugs.map(videoSummary));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return sendJSON(res, 200, list);
    }

    let m = p.match(/^\/api\/videos\/([^/]+)$/);
    if (m && safeSlug(m[1])) return sendJSON(res, 200, await videoDetail(m[1]));

    m = p.match(/^\/api\/videos\/([^/]+)\/render$/);
    if (m && safeSlug(m[1])) {
      const dir = path.join(VIDEOS_DIR, m[1], "renders");
      const latest = await latestRender(dir);
      if (!latest) return sendJSON(res, 404, { error: "chưa render" });
      return serveFile(req, res, path.join(dir, latest.name), "video/mp4");
    }

    // Cinema Soundscape: SFX Catalog
    if (p === "/api/audio/sfx" && req.method === "GET") {
      const { SFX_CATALOG } = await import("../../tools/soundscapes.mjs");
      return sendJSON(res, 200, {
        sfx: Object.values(SFX_CATALOG),
      });
    }

    // Cinema Soundscape: Presets
    if (p === "/api/audio/presets" && req.method === "GET") {
      const { SOUNDSCAPE_PRESETS } = await import("../../tools/soundscapes.mjs");
      return sendJSON(res, 200, {
        presets: SOUNDSCAPE_PRESETS,
      });
    }

    // Cinema Soundscape: Auto-Detect SFX & Ducking
    if (p === "/api/audio/detect-sfx" && req.method === "POST") {
      try {
        let raw = "";
        for await (const c of req) raw += c;
        const body = JSON.parse(raw || "{}");
        const { detectSfxCues, computeDuckedBgmSegments } = await import("../../tools/auto-sfx.mjs");
        const items = body.items || (body.lines || []).map((l, idx) => ({
          start: typeof l === "string" ? idx * 4 : (l.start ?? idx * 4),
          dur: typeof l === "string" ? 3.5 : (l.dur ?? l.duration ?? 3.5),
          text: typeof l === "string" ? l : (l.text || l.caption || ""),
        }));
        const archetype = body.archetype || body.style || "compare";
        const totalDuration = body.totalDuration || (items.length > 0 ? (items[items.length - 1].start + items[items.length - 1].dur + 2) : 60);

        const cues = detectSfxCues({
          archetype,
          items,
          totalDuration,
        });
        const duckingSegments = computeDuckedBgmSegments({
          totalDuration,
          voiceIntervals: items.map((it) => ({ start: it.start, dur: it.dur || 3.0 })),
          ambientVol: body.ambientVol ?? 0.12,
          boostVol: body.boostVol ?? 0.28,
        });
        return sendJSON(res, 200, {
          cues,
          duckingSegments,
          totalCues: cues.length,
        });
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
    }

    // Stream BGM audio for preview soundboard
    m = p.match(/^\/api\/audio\/bgm\/([^/]+)$/);
    if (m) {
      const track = m[1].replace(/\.mp3$/, "");
      const file = path.join(REPO_ROOT, "shared", "audio", "bgm", `${track}.mp3`);
      if (fs.existsSync(file)) return serveFile(req, res, file, "audio/mpeg");
      return sendJSON(res, 404, { error: "Không tìm thấy file BGM" });
    }

    // Stream SFX audio for preview soundboard
    m = p.match(/^\/api\/audio\/sfx\/([^/]+)$/);
    if (m) {
      const effect = m[1].replace(/\.mp3$/, "");
      const file = path.join(REPO_ROOT, "shared", "audio", "sfx", `${effect}.mp3`);
      if (fs.existsSync(file)) return serveFile(req, res, file, "audio/mpeg");
      return sendJSON(res, 404, { error: "Không tìm thấy file SFX" });
    }

    // Publishing kit (viral titles, SEO description, hashtags)
    m = p.match(/^\/api\/videos\/([^/]+)\/publishing-kit$/);
    if (m && safeSlug(m[1])) {
      const { generatePublishingKit } = await import("../../tools/publishing-kit.mjs");
      try {
        const kit = generatePublishingKit(m[1]);
        return sendJSON(res, 200, kit);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    // Cover / Thumbnail (Real Video Frame Snapshot 1080x1920)
    m = p.match(/^\/api\/videos\/([^/]+)\/thumbnail$/);
    if (m && safeSlug(m[1])) {
      const slug = m[1];
      const type = url.searchParams.get("type") || "frame";
      const { generateThumbnailSvg, extractVideoFrame } = await import("../../tools/thumbnail.mjs");

      if (type === "frame" || type !== "svg") {
        try {
          const dir = path.join(VIDEOS_DIR, slug);
          let framePath = path.join(dir, "cover-frame.jpg");
          if (!fs.existsSync(framePath)) {
            try {
              framePath = extractVideoFrame(slug, 5.0);
            } catch {
              const snap = path.join(dir, "snapshots", "contact-sheet.jpg");
              if (fs.existsSync(snap)) framePath = snap;
            }
          }
          if (fs.existsSync(framePath)) {
            const buf = fs.readFileSync(framePath);
            res.writeHead(200, {
              "content-type": "image/jpeg",
              "content-length": buf.length,
              "cache-control": "no-cache",
            });
            return res.end(buf);
          }
          return sendJSON(res, 404, { error: "Chưa có ảnh bìa video — hãy render video trước." });
        } catch (e) {
          return sendJSON(res, 404, { error: e.message });
        }
      }

      try {
        const svg = generateThumbnailSvg(slug);
        const buf = Buffer.from(svg, "utf8");
        res.writeHead(200, {
          "content-type": "image/svg+xml; charset=utf-8",
          "content-length": buf.length,
          "cache-control": "no-cache",
        });
        return res.end(buf);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    // Direct MP4 download
    m = p.match(/^\/api\/videos\/([^/]+)\/download$/);
    if (m && safeSlug(m[1])) {
      const dir = path.join(VIDEOS_DIR, m[1], "renders");
      const latest = await latestRender(dir);
      if (!latest) return sendJSON(res, 404, { error: "chưa có bản render mp4 để tải" });
      const filePath = path.join(dir, latest.name);
      res.setHeader("Content-Disposition", `attachment; filename="${m[1]}.mp4"`);
      return serveFile(req, res, filePath, "video/mp4");
    }

    // Live In-Studio Script & Beat Editor
    m = p.match(/^\/api\/videos\/([^/]+)\/edit-script$/);
    if (m && safeSlug(m[1]) && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const { captions, tiersData, scenesData, dialoguesData } = JSON.parse(body || "{}");
      if (!Array.isArray(captions) || captions.length === 0) {
        return sendJSON(res, 400, { error: "Danh sách câu kịch bản không hợp lệ (không được để trống)" });
      }
      const slug = m[1];
      const dir = path.join(VIDEOS_DIR, slug);
      const specPath = path.join(dir, "spec.json");
      const metaPath = path.join(dir, "meta.json");
      let metaObj = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : null;
      let spec = fs.existsSync(specPath) ? JSON.parse(fs.readFileSync(specPath, "utf8")) : (metaObj ? { ...metaObj } : {});

      const isSurvival = spec.type === "survival" || Boolean(spec.survivalConfig) || metaObj?.type === "survival";
      const isMystery = spec.type === "mystery" || Boolean(spec.mysteryConfig) || metaObj?.type === "mystery" || slug.startsWith("mystery-") || slug.startsWith("bi-an-");
      const isScience = spec.type === "science" || Boolean(spec.scienceConfig) || metaObj?.type === "science" || slug.startsWith("science-");
      const isTierList = spec.type === "tierlist" || Boolean(spec.tierListConfig) || metaObj?.type === "tierlist" || metaObj?.template === "tierlist" || slug.startsWith("tierlist-");
      const isChalk = spec.type === "chalk" || Boolean(spec.chalkConfig) || metaObj?.type === "chalk" || metaObj?.template === "chalk" || slug.startsWith("chalk-");
      const isWildlife = spec.type === "wildlife" || Boolean(spec.wildlifeConfig) || metaObj?.type === "wildlife" || metaObj?.template === "wildlife" || slug.startsWith("wildlife-");

      if (isSurvival) {
        if (!spec.survivalConfig) spec.survivalConfig = metaObj?.survivalConfig || {};
        const cfg = spec.survivalConfig;
        if (captions[0]) {
          cfg.prologueSpoken = captions[0];
          cfg.prologueText = captions[0];
        }
        if (cfg.tiers && Array.isArray(cfg.tiers)) {
          for (let i = 0; i < cfg.tiers.length; i++) {
            if (captions[i + 1]) {
              cfg.tiers[i].caption = captions[i + 1];
            }
            if (tiersData?.[i]) {
              if (tiersData[i].title) cfg.tiers[i].title = tiersData[i].title;
              if (tiersData[i].desc) cfg.tiers[i].desc = tiersData[i].desc;
              if (tiersData[i].survival) cfg.tiers[i].survival = tiersData[i].survival;
            }
          }
        }
        if (captions[11]) {
          cfg.ctaSpoken = captions[11];
          cfg.ctaText = captions[11];
        }
        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), "utf8");

        // Cập nhật LINES trong scripts/generate-vo.mjs
        const voPath = path.join(dir, "scripts", "generate-vo.mjs");
        if (fs.existsSync(voPath)) {
          let voSrc = fs.readFileSync(voPath, "utf8");
          const linesData = [
            { id: "line-1", text: cfg.prologueSpoken },
            ...cfg.tiers.map((t, idx) => ({ id: `line-${idx + 2}`, text: t.caption })),
            { id: "line-12", text: cfg.ctaSpoken },
          ];
          const linesStr = "const LINES = " + JSON.stringify(linesData, null, 2) + ";";
          voSrc = voSrc.replace(/const LINES = \[[\s\S]*?\n\];/, linesStr);
          fs.writeFileSync(voPath, voSrc, "utf8");
        }

        // Cập nhật index.html TIERS caption
        const htmlPath = path.join(dir, "index.html");
        if (fs.existsSync(htmlPath)) {
          let htmlSrc = fs.readFileSync(htmlPath, "utf8");
          cfg.tiers.forEach((t, idx) => {
            const regex = new RegExp(`("id":\\s*${idx + 1}[\\s\\S]*?"caption":\\s*")[^"]*(")`);
            htmlSrc = htmlSrc.replace(regex, `$1${t.caption.replace(/"/g, '\\"')}$2`);
          });
          htmlSrc = htmlSrc.replace(
            /<div id="caption-text" class="caption-text">[\s\S]*?<\/div>/,
            `<div id="caption-text" class="caption-text">${cfg.prologueText || cfg.prologueSpoken}</div>`
          );
          fs.writeFileSync(htmlPath, htmlSrc, "utf8");
        }

        return sendJSON(res, 200, { ok: true, slug, root: 65 });
      }

      if (isMystery) {
        if (!spec.mysteryConfig) spec.mysteryConfig = metaObj?.mysteryConfig || {};
        const cfg = spec.mysteryConfig;
        if (!cfg.scenes || !cfg.scenes.length) {
          const htmlPath = path.join(dir, "index.html");
          if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, "utf8");
            const scMatch = html.match(/const SCENES = (\[[\s\S]*?\]);\s*(?:const TOTAL_DURATION|<\/script>|window\.__timelines)/);
            if (scMatch) {
              try { cfg.scenes = JSON.parse(scMatch[1]); } catch {}
            }
          }
        }
        cfg.scenes = cfg.scenes || [];
        for (let i = 0; i < captions.length; i++) {
          if (!cfg.scenes[i]) {
            cfg.scenes[i] = { id: `scene-${i + 1}`, index: i + 1, telemetry: "", line: captions[i] };
          } else {
            cfg.scenes[i].line = captions[i];
          }
          if (scenesData?.[i]?.telemetry) {
            cfg.scenes[i].telemetry = scenesData[i].telemetry;
          }
        }

        spec.type = "mystery";
        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), "utf8");

        if (metaObj) {
          metaObj.type = "mystery";
          metaObj.mysteryConfig = cfg;
          fs.writeFileSync(metaPath, JSON.stringify(metaObj, null, 2), "utf8");
        }

        // Cập nhật index.html
        const htmlPath = path.join(dir, "index.html");
        if (fs.existsSync(htmlPath)) {
          let htmlSrc = fs.readFileSync(htmlPath, "utf8");
          const scenesStr = "const SCENES = " + JSON.stringify(cfg.scenes, null, 2) + ";";
          htmlSrc = htmlSrc.replace(/const SCENES = \[[\s\S]*?\];\s*(?:const TOTAL_DURATION|window\.__timelines)/, scenesStr + "\n    ");
          fs.writeFileSync(htmlPath, htmlSrc, "utf8");
        }

        // Cập nhật scripts/generate-vo.mjs nếu có
        const voPath = path.join(dir, "scripts", "generate-vo.mjs");
        if (fs.existsSync(voPath)) {
          let voSrc = fs.readFileSync(voPath, "utf8");
          if (voSrc.includes("const LINES =")) {
            const linesData = cfg.scenes.map((sc, idx) => ({
              id: `line-${idx + 1}`,
              scene: idx + 1,
              text: sc.line,
            }));
            const linesStr = "const LINES = " + JSON.stringify(linesData, null, 2) + ";";
            voSrc = voSrc.replace(/const LINES = \[[\s\S]*?\n\];/, linesStr);
            fs.writeFileSync(voPath, voSrc, "utf8");
          }
        }

        const totalDur = metaObj?.duration || cfg.totalDuration || 29;
        return sendJSON(res, 200, { ok: true, slug, root: totalDur });
      }

      if (isScience) {
        if (!spec.scienceConfig) spec.scienceConfig = metaObj?.scienceConfig || {};
        const cfg = spec.scienceConfig;
        if (!cfg.dialogues || !cfg.dialogues.length) {
          const durPath = path.join(dir, "scripts", "durations.json");
          if (fs.existsSync(durPath)) {
            try {
              const durJson = JSON.parse(fs.readFileSync(durPath, "utf8"));
              if (durJson?.results) cfg.dialogues = durJson.results;
            } catch {}
          }
        }
        if (!cfg.dialogues || !cfg.dialogues.length) {
          const htmlPath = path.join(dir, "index.html");
          if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, "utf8");
            const dlgMatch = html.match(/const DIALOGUES = (\[[\s\S]*?\]);\s*(?:const ROOT_DURATION|tl\.)/);
            if (dlgMatch) {
              try { cfg.dialogues = JSON.parse(dlgMatch[1]); } catch {}
            }
          }
        }
        cfg.dialogues = cfg.dialogues || [];
        for (let i = 0; i < captions.length; i++) {
          if (!cfg.dialogues[i]) {
            cfg.dialogues[i] = {
              speaker: dialoguesData?.[i]?.speaker || "narrator",
              text: captions[i],
              emotion: dialoguesData?.[i]?.emotion || "explain",
            };
          } else {
            cfg.dialogues[i].text = captions[i];
            if (dialoguesData?.[i]?.speaker) cfg.dialogues[i].speaker = dialoguesData[i].speaker;
            if (dialoguesData?.[i]?.emotion) cfg.dialogues[i].emotion = dialoguesData[i].emotion;
          }
        }

        spec.type = "science";
        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), "utf8");

        if (metaObj) {
          metaObj.type = "science";
          metaObj.scienceConfig = cfg;
          fs.writeFileSync(metaPath, JSON.stringify(metaObj, null, 2), "utf8");
        }

        // Cập nhật index.html
        const htmlPath = path.join(dir, "index.html");
        if (fs.existsSync(htmlPath)) {
          let htmlSrc = fs.readFileSync(htmlPath, "utf8");
          const dlgStr = "const DIALOGUES = " + JSON.stringify(cfg.dialogues, null, 2) + ";";
          htmlSrc = htmlSrc.replace(/const DIALOGUES = \[[\s\S]*?\];\s*(?:const ROOT_DURATION|tl\.)/, dlgStr + "\n      ");
          fs.writeFileSync(htmlPath, htmlSrc, "utf8");
        }

        // Cập nhật scripts/generate-vo.mjs
        const voPath = path.join(dir, "scripts", "generate-vo.mjs");
        if (fs.existsSync(voPath)) {
          let voSrc = fs.readFileSync(voPath, "utf8");
          const simpleDlgs = cfg.dialogues.map((d) => ({
            speaker: d.speaker,
            text: d.text,
            emotion: d.emotion || "",
            dur: d.dur || 2.0,
          }));
          const dlgStr = "const DIALOGUES = " + JSON.stringify(simpleDlgs, null, 2) + ";";
          voSrc = voSrc.replace(/const DIALOGUES = \[[\s\S]*?\n\];/, dlgStr);
          fs.writeFileSync(voPath, voSrc, "utf8");
        }

        // Cập nhật scripts/durations.json nếu có
        const durPath = path.join(dir, "scripts", "durations.json");
        if (fs.existsSync(durPath)) {
          try {
            const durJson = JSON.parse(fs.readFileSync(durPath, "utf8"));
            if (durJson?.results) {
              for (let i = 0; i < cfg.dialogues.length; i++) {
                if (durJson.results[i]) {
                  durJson.results[i].text = cfg.dialogues[i].text;
                  if (cfg.dialogues[i].speaker) durJson.results[i].speaker = cfg.dialogues[i].speaker;
                  if (cfg.dialogues[i].emotion) durJson.results[i].emotion = cfg.dialogues[i].emotion;
                }
              }
              fs.writeFileSync(durPath, JSON.stringify(durJson, null, 2), "utf8");
            }
          } catch {}
        }

        const rootDur = metaObj?.duration || 44;
        return sendJSON(res, 200, { ok: true, slug, root: rootDur });
      }

      if (isTierList) {
        if (!spec.tierListConfig) spec.tierListConfig = metaObj?.tierListConfig || CURATED_TIERLIST_TOPICS[slug] || {};
        const cfg = spec.tierListConfig;
        if (!cfg.items || !cfg.items.length) {
          const htmlPath = path.join(dir, "index.html");
          if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, "utf8");
            const itMatch = html.match(/const ITEMS = (\[[\s\S]*?\]);/);
            if (itMatch) {
              try { cfg.items = JSON.parse(itMatch[1]); } catch {}
            }
          }
        }
        cfg.items = cfg.items || [];
        for (let i = 0; i < captions.length; i++) {
          if (cfg.items[i]) {
            cfg.items[i].caption = captions[i];
            cfg.items[i].spoken = captions[i];
          }
        }
        spec.type = "tierlist";
        spec.items = cfg.items;
        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), "utf8");
        if (metaObj) {
          metaObj.tierListConfig = cfg;
          fs.writeFileSync(metaPath, JSON.stringify(metaObj, null, 2), "utf8");
        }
        const rootDur = metaObj?.totalDuration || metaObj?.duration || 65;
        return sendJSON(res, 200, { ok: true, slug, root: rootDur });
      }

      if (isChalk) {
        if (!spec.chalkConfig) spec.chalkConfig = metaObj?.chalkConfig || CURATED_CHALK_TOPICS[slug] || {};
        const cfg = spec.chalkConfig;
        if (!cfg.scenes || !cfg.scenes.length) {
          const htmlPath = path.join(dir, "index.html");
          if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, "utf8");
            const scMatch = html.match(/const SCENES = (\[[\s\S]*?\]);/);
            if (scMatch) {
              try { cfg.scenes = JSON.parse(scMatch[1]); } catch {}
            }
          }
        }
        cfg.scenes = cfg.scenes || [];
        for (let i = 0; i < captions.length; i++) {
          if (cfg.scenes[i]) {
            cfg.scenes[i].line = captions[i];
          }
        }
        spec.type = "chalk";
        spec.scenes = cfg.scenes;
        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), "utf8");
        if (metaObj) {
          metaObj.chalkConfig = cfg;
          fs.writeFileSync(metaPath, JSON.stringify(metaObj, null, 2), "utf8");
        }
        const rootDur = metaObj?.totalDuration || metaObj?.duration || 60;
        return sendJSON(res, 200, { ok: true, slug, root: rootDur });
      }

      if (isWildlife) {
        if (!spec.wildlifeConfig) spec.wildlifeConfig = metaObj?.wildlifeConfig || CURATED_WILDLIFE_TOPICS[slug] || {};
        const cfg = spec.wildlifeConfig;
        if (!cfg.scenes || !cfg.scenes.length) {
          const htmlPath = path.join(dir, "index.html");
          if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, "utf8");
            const scMatch = html.match(/const SCENES = (\[[\s\S]*?\]);/);
            if (scMatch) {
              try { cfg.scenes = JSON.parse(scMatch[1]); } catch {}
            }
          }
        }
        cfg.scenes = cfg.scenes || [];
        for (let i = 0; i < captions.length; i++) {
          if (cfg.scenes[i]) {
            cfg.scenes[i].line = captions[i];
          }
          if (scenesData?.[i]?.telemetry && cfg.scenes[i]) {
            cfg.scenes[i].telemetry = scenesData[i].telemetry;
          }
        }
        spec.type = "wildlife";
        spec.scenes = cfg.scenes;
        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), "utf8");
        if (metaObj) {
          metaObj.wildlifeConfig = cfg;
          fs.writeFileSync(metaPath, JSON.stringify(metaObj, null, 2), "utf8");
        }
        const rootDur = metaObj?.totalDuration || metaObj?.duration || 52;
        return sendJSON(res, 200, { ok: true, slug, root: rootDur });
      }

      // Comparison video
      spec.captions = captions;
      spec.spoken = captions.map((c) => c.replace(/\[\[(.*?)\]\]/g, "$1").replace(/\*(.*?)\*/g, "$1").trim());
      fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), "utf8");

      // Cập nhật LINES trong scripts/generate-vo.mjs
      const voPath = path.join(dir, "scripts", "generate-vo.mjs");
      if (fs.existsSync(voPath)) {
        let voSrc = fs.readFileSync(voPath, "utf8");
        const linesStr = "const LINES = [\n" +
          spec.spoken.map((t, i) => `  { id: "line-${i + 1}", text: ${JSON.stringify(t)} },\n`).join("") +
          "];";
        voSrc = voSrc.replace(/const LINES = \[[\s\S]*?\n\];/, linesStr);
        fs.writeFileSync(voPath, voSrc, "utf8");
      }

      // Re-build composition & retime
      const { buildComposition } = await import("../../tools/build-composition.mjs");
      const { retime } = await import("../../tools/retime.mjs");
      buildComposition(slug, spec);
      const ret = retime(slug);
      return sendJSON(res, 200, { ok: true, slug, root: ret.root });
    }

    // Change or upload image for tier or comparison side
    m = p.match(/^\/api\/videos\/([^/]+)\/change-image$/);
    if (m && safeSlug(m[1]) && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const { target, type, data, url, prompt } = JSON.parse(body || "{}");
      if (!target) return sendJSON(res, 400, { error: "Thiếu target (ví dụ: tier-1, tier-2, left, right)" });

      const slug = m[1];
      const dir = path.join(VIDEOS_DIR, slug);
      let destDir = path.join(dir, "assets", "images");
      let destFile = path.join(destDir, `${target}.jpg`);
      if (target === "left" || target === "right") {
        destDir = path.join(dir, "assets", "icons");
        destFile = path.join(destDir, `${target}.png`);
      }
      fs.mkdirSync(destDir, { recursive: true });

      try {
        if (type === "upload") {
          if (!data) return sendJSON(res, 400, { error: "Thiếu dữ liệu ảnh upload" });
          const base64Data = data.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          fs.writeFileSync(destFile, buffer);
        } else if (type === "url") {
          if (!url) return sendJSON(res, 400, { error: "Thiếu URL ảnh" });
          const imgRes = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
          if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          fs.writeFileSync(destFile, buffer);
        } else if (type === "ai") {
          const aiPrompt = prompt || `A clear, high-detail 3D cinematic rendering of ${target}, 8k resolution, centered`;
          const isVertical = target.startsWith("scene-") || target.startsWith("tier-");
          const targetRatio = isVertical ? "9:16" : "1:1";
          let saved = false;

          // 1. Try unified BKT AI generator first (registers into AI Studio Gallery + Antigravity ecosystem)
          try {
            const bktRes = await fetch("http://127.0.0.1:8080/api/ai-images/generate-instant", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: aiPrompt,
                aspect_ratio: targetRatio,
                model: "flux"
              }),
              signal: AbortSignal.timeout(15000)
            });
            if (bktRes.ok) {
              const bktData = await bktRes.json();
              if (bktData?.image?.url) {
                const imgFetch = await fetch(`http://127.0.0.1:8080${bktData.image.url}`);
                if (imgFetch.ok) {
                  const buffer = Buffer.from(await imgFetch.arrayBuffer());
                  fs.writeFileSync(destFile, buffer);
                  saved = true;
                }
              }
            }
          } catch (_) {}

          // 2. Fallback to direct fetch if BKT local service is not responding
          if (!saved) {
            const seed = Math.floor(Math.random() * 100000);
            const width = isVertical ? 1080 : 768;
            const height = isVertical ? 1920 : 768;
            const aiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiPrompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
            const imgRes = await fetch(aiUrl, { headers: { "User-Agent": USER_AGENT } });
            if (!imgRes.ok) throw new Error(`Pollinations AI HTTP ${imgRes.status}`);
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(destFile, buffer);
          }
        } else {
          return sendJSON(res, 400, { error: "Loại hành động không hợp lệ" });
        }

        const relPath = path.relative(dir, destFile).replace(/\\/g, "/");
        return sendJSON(res, 200, {
          ok: true,
          slug,
          target,
          imageUrl: `/videos/${slug}/${relPath}?t=${Date.now()}`,
        });
      } catch (err) {
        return sendJSON(res, 500, { error: `Lỗi đổi hình ảnh: ${err.message || err}` });
      }
    }

    m = p.match(/^\/api\/videos\/([^/]+)\/snapshot$/);
    if (m && safeSlug(m[1]))
      return serveFile(req, res, path.join(VIDEOS_DIR, m[1], "snapshots", "contact-sheet.jpg"), "image/jpeg");

    if (p === "/api/runs" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const body2 = JSON.parse(body || "{}");
      const { slug, task, target, render, spec, topic } = body2;
      if (!(task in TASKS))
        return sendJSON(res, 400, { error: "task không hợp lệ" });
      if (task !== "batch_global" && !safeSlug(slug))
        return sendJSON(res, 400, { error: "slug không hợp lệ" });
      if (task === "batch_global" && !topic)
        return sendJSON(res, 400, { error: "cần topic để tạo batch toàn cầu" });
      if (task === "fit" && !(Number.isFinite(target) && target >= 8 && target <= 180))
        return sendJSON(res, 400, { error: "thời lượng mục tiêu phải nằm trong 8-180 giây" });
      if (task !== "create" && task !== "batch_global" && !fs.existsSync(path.join(VIDEOS_DIR, slug)))
        return sendJSON(res, 404, { error: "không có video này" });
      if (task === "create" && fs.existsSync(path.join(VIDEOS_DIR, slug)))
        return sendJSON(res, 409, { error: `video '${slug}' đã tồn tại — hãy chọn slug khác` });
      if (task === "create" && !spec)
        return sendJSON(res, 400, { error: "cần spec để tạo video mới" });
      const busy = [...runs.values()].find((r) => (slug ? r.slug === slug : r.task === task) && !r.done);
      if (busy) return sendJSON(res, 409, { error: `đang chạy '${busy.task}'`, id: busy.id });
      const run = startRun(slug || "batch-global", task, { target, render: Boolean(render), spec, topic });
      return sendJSON(res, 201, { id: run.id, slug: slug || "batch-global", task });
    }

    m = p.match(/^\/api\/runs\/([^/]+)\/stream$/);
    if (m) {
      const run = runs.get(m[1]);
      if (!run) return sendJSON(res, 404, { error: "run không tồn tại" });
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      for (const entry of run.lines) res.write(`data: ${JSON.stringify(entry)}\n\n`);
      if (run.done) {
        res.write(`event: done\ndata: ${JSON.stringify({ code: run.code })}\n\n`);
        return res.end();
      }
      run.subs.add(res);
      req.on("close", () => run.subs.delete(res));
      return;
    }

    m = p.match(/^\/api\/runs\/([^/]+)\/stop$/);
    if (m && req.method === "POST") {
      const run = runs.get(m[1]);
      if (!run || run.done) return sendJSON(res, 404, { error: "không có run đang chạy" });
      run.child?.kill("SIGTERM");
      return sendJSON(res, 200, { stopped: true });
    }

    // Static assets inside videos/<slug>/...
    m = p.match(/^\/videos\/([^/]+)(?:\/(.*))?$/);
    if (m && safeSlug(m[1])) {
      const sub = !m[2] || m[2] === "" ? "index.html" : m[2];
      const filePath = path.join(VIDEOS_DIR, m[1], sub);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const types = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".mp3": "audio/mpeg",
          ".mp4": "video/mp4",
          ".woff2": "font/woff2",
        };
        return serveFile(req, res, filePath, types[ext] ?? "application/octet-stream");
      }
    }

    if (p.startsWith("/api/")) return sendJSON(res, 404, { error: "not found" });

    // built frontend
    const file = p === "/" ? "index.html" : p.slice(1);
    const abs = path.join(DIST, file);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".png": "image/png",
        ".woff2": "font/woff2",
      };
      return serveFile(req, res, abs, types[path.extname(abs)] ?? "application/octet-stream");
    }
    if (fs.existsSync(path.join(DIST, "index.html")))
      return serveFile(req, res, path.join(DIST, "index.html"), "text/html; charset=utf-8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<p>Chưa build frontend. Chạy <code>npm run build</code> trong studio/.</p>");
  } catch (err) {
    // Nếu response đã bắt đầu (file đang stream, SSE đang mở) thì không còn
    // header nào để ghi — cố ghi là ném tiếp và giết luôn tiến trình.
    console.error(`[${req.method} ${p}]`, err?.message ?? err);
    if (res.headersSent) return res.destroy();
    sendJSON(res, 500, { error: String(err?.message ?? err) });
  }
});

// Lưới an toàn cuối: một request lỗi không được phép hạ cả studio.
server.on("clientError", (_err, socket) => socket.destroy());
process.on("uncaughtException", (err) => console.error("[uncaught]", err));

// Engine này không có xác thực: nó chỉ được gọi qua proxy của bkt_web. Bind
// mặc định nghe trên mọi interface nên chỉ còn tường lửa che, tắt UFW một lần
// là phơi thẳng ra Internet. HOST đổi được cho trường hợp chạy trong container.
server.listen(PORT, process.env.HOST || "127.0.0.1", () => {
  console.log(`Compare Studio  →  http://localhost:${PORT}`);
  console.log(`repo: ${REPO_ROOT}`);
});
