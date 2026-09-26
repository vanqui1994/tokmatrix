// Cầu gọi một lần (one-shot) từ backend Python bkt_web/compare_native.py vào các
// thư viện JS của series (sinh chủ đề, preview template, giọng đọc, theme, SFX…).
//
// Thay cho máy chủ HTTP studio/server/index.mjs cũ: không còn tiến trình Node chạy
// thường trực trên cổng 4321, không còn proxy. Mỗi lời gọi là một tiến trình:
//
//   echo '{"lang":"vi"}' | node tools/studio-bridge.mjs <op>
//
// stdin: JSON tham số. stdout: đúng MỘT dòng JSON {ok, result} hoặc {ok:false, error}.
// Mọi console.log của thư viện bị đẩy sang stderr để stdout chỉ chứa kết quả.
console.log = (...a) => console.error(...a);
console.info = (...a) => console.error(...a);

const TEMPLATE_PREVIEWS = {
  compare: "renderTemplatePreview",
  survival: "renderSurvivalTemplatePreview",
  mystery: "renderMysteryTemplatePreview",
  science: "renderScienceTemplatePreview",
  vox: "renderVoxTemplatePreview",
  newspaper: "renderNewspaperTemplatePreview",
  kinetic: "renderKineticTemplatePreview",
  chalk: "renderChalkTemplatePreview",
  tierlist: "renderTierListTemplatePreview",
  wildlife: "renderWildlifeTemplatePreview",
  folklore: "renderFolkloreTemplatePreview",
};

// style -> [module, generate fn, suggest fn, số gợi ý mặc định]
const STYLE_GENERATORS = {
  survival: ["./generate-survival-topic.mjs", "generateSurvivalTopic", null, 10],
  mystery: ["./generate-mystery-topic.mjs", "generateMysteryTopic", "suggestMysteryTopics", 10],
  vox: ["./generate-vox-topic.mjs", "generateVoxTopic", "suggestVoxTopics", 10],
  newspaper: ["./generate-newspaper-topic.mjs", "generateNewspaperTopic", "suggestNewspaperTopics", 10],
  kinetic: ["./generate-kinetic-topic.mjs", "generateKineticTopic", "suggestKineticTopics", 10],
  chalk: ["./generate-chalk-topic.mjs", "generateChalkTopic", "suggestChalkTopics", 10],
  tierlist: ["./generate-tierlist-topic.mjs", "generateTierListTopic", "suggestTierListTopics", 8],
  wildlife: ["./generate-wildlife-topic.mjs", "generateWildlifeTopic", "suggestWildlifeTopics", 8],
  folklore: ["./generate-folklore-topic.mjs", "generateFolkloreTopic", "suggestFolkloreTopics", 8],
};

async function renderPreview(type, lang) {
  const mod = await import("./preview-template.mjs");
  const fn = mod[TEMPLATE_PREVIEWS[type] || TEMPLATE_PREVIEWS.compare];
  return fn(lang || "vi");
}

const OPS = {
  async "matrix.config.resolve"({ niche_id: nicheId } = {}) {
    const { resolvePilotChannelConfigs } = await import("../matrix/config/channel-config-resolver.mjs");
    return resolvePilotChannelConfigs(nicheId ? { nicheId } : {});
  },
  async "topics.list"({ category, query, lang }) {
    const { listCategories, listTopics } = await import("./generate-topic.mjs");
    return { categories: listCategories(), topics: listTopics({ category, query, lang: lang || "en" }) };
  },
  async "topics.generate"(args) {
    const { generateTopic } = await import("./generate-topic.mjs");
    return generateTopic(args);
  },
  async "style.generate"({ style, ...args }) {
    const entry = STYLE_GENERATORS[style];
    if (!entry) throw new Error(`style không hợp lệ: ${style}`);
    const mod = await import(entry[0]);
    return mod[entry[1]](args);
  },
  async "style.suggest"({ style, lang, count }) {
    const entry = STYLE_GENERATORS[style];
    if (!entry || !entry[2]) throw new Error(`style không hỗ trợ gợi ý: ${style}`);
    const mod = await import(entry[0]);
    return { topics: await mod[entry[2]]({ lang: lang || "vi", count: count || entry[3] }) };
  },
  async "science.topics"() {
    const { listScienceCategories, listScienceTopics } = await import("./generate-science-topic.mjs");
    return { categories: listScienceCategories(), topics: listScienceTopics() };
  },
  async "science.generate"({ id, prompt, lang }) {
    const mod = await import("./generate-science-topic.mjs");
    return id ? mod.getScienceTopic(id, lang || "vi") : mod.generateAiScienceTopic(prompt, lang || "vi");
  },
  async "images.search"({ q, mode }) {
    // Chỉ tìm ảnh thật. Ảnh AI xin qua Antigravity bằng "Đổi ảnh → AI" (không có URL tức thì).
    const { searchWikiImages } = await import("./find-image.mjs");
    const images = mode === "ai" ? [] : await searchWikiImages(q, 4);
    return { images, aiNote: "Ảnh AI được sinh qua Antigravity: dùng Đổi ảnh → AI trên từng cảnh." };
  },
  async voices() {
    const { COUNTRIES } = await import("./voices.mjs");
    return { countries: COUNTRIES };
  },
  async "tts.synthesize"({ text, voice, lang, outPath }) {
    const { synthesizeAudio } = await import("./voices.mjs");
    await synthesizeAudio({ text, voice, outPath, rate: "1.0", lang });
    return { outPath };
  },
  async themes() {
    const { THEMES } = await import("./themes/index.mjs");
    return {
      themes: Object.values(THEMES).map((t) => ({
        code: t.code,
        country: t.country,
        flag: t.flag,
        mascotName: t.mascotName,
        mascotDesc: t.mascotDesc,
        palette: t.palette,
      })),
    };
  },
  async "template.preview"({ type, lang }) {
    const { html, root } = await renderPreview(type, lang);
    return { html, root };
  },
  async "template.timing"({ type, lang }) {
    const { root, timing } = await renderPreview(type, lang);
    return { root, timing };
  },
  async "audio.sfx"() {
    const { SFX_CATALOG } = await import("./soundscapes.mjs");
    return { sfx: Object.values(SFX_CATALOG) };
  },
  async "audio.presets"() {
    const { SOUNDSCAPE_PRESETS } = await import("./soundscapes.mjs");
    return { presets: SOUNDSCAPE_PRESETS };
  },
  async "audio.detect-sfx"({ archetype, items, totalDuration, ambientVol, boostVol }) {
    const { detectSfxCues, computeDuckedBgmSegments } = await import("./auto-sfx.mjs");
    const cues = detectSfxCues({ archetype, items, totalDuration });
    const duckingSegments = computeDuckedBgmSegments({
      totalDuration,
      voiceIntervals: items.map((it) => ({ start: it.start, dur: it.dur || 3.0 })),
      ambientVol,
      boostVol,
    });
    return { cues, duckingSegments, totalCues: cues.length };
  },
  async "publishing-kit"({ slug }) {
    const { generatePublishingKit } = await import("./publishing-kit.mjs");
    return generatePublishingKit(slug);
  },
  async "thumbnail.svg"({ slug }) {
    const { generateThumbnailSvg } = await import("./thumbnail.mjs");
    return { svg: generateThumbnailSvg(slug) };
  },
  async "compare.rebuild"({ slug, spec }) {
    const { buildComposition } = await import("./build-composition.mjs");
    const { retime } = await import("./retime.mjs");
    buildComposition(slug, spec);
    return retime(slug);
  },
  async "folklore.rebuild"({ slug }) {
    const { rebuildFolkloreComposition } = await import("./create-folklore-video.mjs");
    return rebuildFolkloreComposition(slug);
  },
  async curated() {
    const [{ CURATED_TIERLIST_TOPICS }, { CURATED_CHALK_TOPICS }, { CURATED_WILDLIFE_TOPICS }] = await Promise.all([
      import("./tierlist-configs.mjs"),
      import("./chalk-configs.mjs"),
      import("./wildlife-configs.mjs"),
    ]);
    return { tierlist: CURATED_TIERLIST_TOPICS, chalk: CURATED_CHALK_TOPICS, wildlife: CURATED_WILDLIFE_TOPICS };
  },
};

async function main() {
  const op = process.argv[2];
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const handler = OPS[op];
  if (!handler) throw new Error(`op không hợp lệ: ${op}`);
  const result = await handler(JSON.parse(raw || "{}"));
  process.stdout.write(JSON.stringify({ ok: true, result }) + "\n");
}

main().then(
  () => process.exit(0),
  (err) => {
    process.stdout.write(JSON.stringify({ ok: false, error: String(err?.message ?? err) }) + "\n");
    process.exit(1);
  },
);
