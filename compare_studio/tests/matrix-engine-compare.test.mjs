import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";
import { buildNativeVideoProject } from "../matrix/render/native-engine-adapter.mjs";
import { extendedEngine } from "../matrix/render/engines/index.mjs";
import compare, { sceneRoles, splitSubjects } from "../matrix/render/engines/compare.mjs";

// 12 cảnh tiếng Đức, thời lượng đo từ TTS (không đều nhau), cảnh 1 là hook ngắn.
export const GERMAN_TITLE = "Krähe vs. Rabe: Wer ist wirklich klüger?";
export const GERMAN_LINES = [
  "Krähe oder Rabe?",
  "Beide gehören zu den Rabenvögeln, doch sie unterscheiden sich deutlich voneinander.",
  "Runde eins, Größe: Der Kolkrabe wird bis zu fünfundsechzig Zentimeter lang.",
  "Die Aaskrähe bleibt mit rund fünfzig Zentimetern spürbar kleiner und leichter.",
  "Runde zwei, Stimme: Raben rufen tief und krächzend, Krähen eher hell und kratzig.",
  "Runde drei, Schwanzform: Beim Raben keilförmig, bei der Krähe gerade abgeschnitten.",
  "Runde vier, Intelligenz: Beide lösen mehrstufige Rätsel und benutzen Werkzeuge geschickt.",
  "Runde fünf, Stadtleben: Krähen erobern Innenstädte, Raben meiden meist den Menschen.",
  "Runde sechs, Lebensdauer: Wilde Raben erreichen häufig über zwanzig Lebensjahre.",
  "Krähen werden in freier Wildbahn meistens nur zehn bis fünfzehn Jahre alt.",
  "Unterm Strich gewinnt der Rabe knapp, aber die Krähe ist der bessere Stadtbewohner.",
  "Wer ist dein Favorit? Schreib es in die Kommentare und folge für mehr!",
];
export const GERMAN_DURATIONS = [1.6, 4.9, 4.4, 4.2, 5.1, 4.6, 5.3, 4.8, 4.1, 4.3, 5.2, 4.0];

export const GERMAN_EXTRAS = {
  subject_a: { name: "Krähe", tag: "Corvus corone" },
  subject_b: { name: "Rabe", tag: "Corvus corax" },
  rounds: [
    { criterion: "Wer ist klüger?", value_a: "", value_b: "", score_a: 0, score_b: 0, winner: "NONE" },
    { criterion: "Zwei Rabenvögel", value_a: "", value_b: "", score_a: 0, score_b: 0, winner: "NONE" },
    { criterion: "Körpergröße", value_a: "ca. 50 cm", value_b: "bis 65 cm", score_a: 6, score_b: 9, winner: "B" },
    { criterion: "Körpergröße", value_a: "kleiner und leichter", value_b: "größer", score_a: 6, score_b: 9, winner: "B" },
    { criterion: "Stimme", value_a: "hell und kratzig", value_b: "tief und krächzend", score_a: 5, score_b: 5, winner: "TIE" },
    { criterion: "Schwanzform", value_a: "gerade abgeschnitten", value_b: "keilförmig", score_a: 5, score_b: 5, winner: "TIE" },
    { criterion: "Intelligenz und Werkzeuggebrauch", value_a: "löst mehrstufige Rätsel", value_b: "löst mehrstufige Rätsel", score_a: 9, score_b: 9, winner: "TIE" },
    { criterion: "Leben in der Stadt", value_a: "erobert Innenstädte", value_b: "meidet den Menschen", score_a: 9, score_b: 3, winner: "A" },
    { criterion: "Lebensdauer in freier Wildbahn", value_a: "", value_b: "über 20 Jahre", score_a: 0, score_b: 0, winner: "NONE" },
    { criterion: "Lebensdauer", value_a: "10–15 Jahre", value_b: "über 20 Jahre", score_a: 5, score_b: 8, winner: "B" },
    { criterion: "Endergebnis: Rabe knapp vorn", value_a: "bester Stadtbewohner", value_b: "Gesamtsieger", score_a: 7, score_b: 8, winner: "B" },
    { criterion: "Dein Favorit?", value_a: "", value_b: "", score_a: 0, score_b: 0, winner: "NONE" },
  ],
};

export function germanScenes() {
  let start = 0.2;
  return GERMAN_LINES.map((line, i) => {
    const scene = {
      scene_index: i + 1,
      beat_id: `b${i + 1}`,
      line,
      visual_intent: `Vergleich Krähe und Rabe, Szene ${i + 1}`,
      start_seconds: Number(start.toFixed(2)),
      duration_seconds: GERMAN_DURATIONS[i],
    };
    start += GERMAN_DURATIONS[i] + 0.35;
    return scene;
  });
}

function germanChannel() {
  const base = resolveChannelsForTopic("unsolved_mysteries", 1)[0];
  const channel = structuredClone(base);
  const inner = channel.resolved_config?.channel || channel.channel || channel;
  inner.publishing = { ...(inner.publishing || {}), language: "de" };
  channel.engine_type = "compare";
  return channel;
}

/** Fixture dự án Matrix đã chuẩn bị (giọng mỗi cảnh + artifact SVG) cho engine compare. */
export function createCompareFixture(root, { writeAudio, extras = GERMAN_EXTRAS } = {}) {
  const projectDir = path.join(root, "prepared-compare");
  const videoDir = path.join(root, "output-compare");
  fs.mkdirSync(path.join(projectDir, "assets", "audio"), { recursive: true });
  const bgm = path.join(projectDir, "assets", "audio", "bgm.mp3");
  const scenesRaw = germanScenes();
  const end = scenesRaw.at(-1).start_seconds + scenesRaw.at(-1).duration_seconds;
  if (writeAudio) writeAudio(bgm, Math.ceil(end) + 3); else fs.writeFileSync(bgm, "prepared background music");
  const scenes = scenesRaw.map((scene) => {
    const index = scene.scene_index;
    const sceneDir = path.join(projectDir, "scenes", `scene_${String(index).padStart(2, "0")}`);
    fs.mkdirSync(sceneDir, { recursive: true });
    const narrationPath = path.join(sceneDir, "narration.mp3");
    const assetPath = path.join(sceneDir, "vector-scene.svg");
    if (writeAudio) writeAudio(narrationPath, scene.duration_seconds); else fs.writeFileSync(narrationPath, `spoken line ${index}`);
    fs.writeFileSync(assetPath, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    return {
      ...scene,
      narration_path: path.relative(projectDir, narrationPath),
      asset_type: compare.assetType,
      asset_source: "native_renderer",
      asset_status: "READY",
      asset_path: path.relative(projectDir, assetPath),
    };
  });
  const channel = germanChannel();
  const job = {
    job_id: "compare-job", batch_id: "batch-test", channel_id: channel.channel_id,
    engine_type: "compare", video_slug: "compare-matrix-test", created_at: 1,
  };
  const script = { title: GERMAN_TITLE, scenes };
  if (extras) script.engine_extras = { engine: "compare", source: "llm", data: extras };
  const manifest = {
    topic: { title: GERMAN_TITLE },
    script,
    angle: { angle_id: "angle_01", hook: "Krähe oder Rabe?" },
    blueprint: { blueprint_id: "mystery_reveal" },
    channel,
    scenes,
    audio: { duration_seconds: end, bgm_segments: [], sfx_cues: [] },
  };
  return { projectDir, videoDir, job, manifest };
}

test("compare module is registered, ready and uses no AI images", () => {
  assert.equal(extendedEngine("compare"), compare);
  assert.equal(compare.pending, undefined);
  assert.equal(compare.id, "compare");
  assert.equal(compare.configKey, "compareConfig");
  assert.equal(compare.voPrefix, "line");
  assert.notEqual(compare.assetType, "IMAGE_AI");
  assert.equal(compare.compositionId("abc"), "abc");
});

test("scene roles and subject splitting", () => {
  assert.deepEqual(sceneRoles(4), ["hook", "round", "round", "verdict"]);
  assert.deepEqual(sceneRoles(1), ["hook"]);
  assert.deepEqual(splitSubjects(GERMAN_TITLE), ["Krähe", "Rabe"]);
  assert.deepEqual(splitSubjects("So sánh Cà phê hay Trà: ai tốt hơn?"), ["Cà phê", "Trà"]);
  assert.deepEqual(splitSubjects("Tea or coffee?"), ["Tea", "coffee"]);
  assert.equal(splitSubjects("The lost city of Atlantis"), null);
});

test("schema has one round per scene and a winner enum", () => {
  const schema = compare.extras.schema(12);
  assert.equal(schema.properties.rounds.minItems, 12);
  assert.equal(schema.properties.rounds.maxItems, 12);
  assert.deepEqual(schema.properties.rounds.items.properties.winner.enum, ["A", "B", "TIE", "NONE"]);
  assert.deepEqual(schema.required, ["subject_a", "subject_b", "rounds"]);
  const prompt = compare.extras.prompt({ script: { title: GERMAN_TITLE, scenes: germanScenes() }, topic: GERMAN_TITLE, language: "de" });
  assert.match(prompt, /\[HOOK\] Krähe oder Rabe\?/);
  assert.match(prompt, /\[ROUND 10\]/);
  assert.match(prompt, /\[VERDICT\]/);
  assert.match(prompt, /do NOT rewrite/);
});

test("validate accepts good extras and names concrete problems", () => {
  const scenes = germanScenes();
  assert.deepEqual(compare.extras.validate(GERMAN_EXTRAS, scenes), []);
  const bad = structuredClone(GERMAN_EXTRAS);
  bad.subject_b.name = "krähe";
  bad.rounds[0].winner = "A";
  bad.rounds[2].winner = "A";
  bad.rounds[3].score_a = 11;
  bad.rounds[4].winner = "MAYBE";
  bad.rounds[5].criterion = "x".repeat(60);
  bad.rounds[7].value_a = "";
  bad.rounds[8].value_b = "<b>20</b>";
  const errors = compare.extras.validate(bad, scenes);
  for (const pattern of [/must differ/, /rounds\[0\]\.winner must be "NONE"/, /rounds\[2\]: winner A needs/, /rounds\[3\]\.score_a/, /rounds\[4\]\.winner must be one of/, /rounds\[5\]\.criterion must be at most/, /rounds\[7\]: a scored round needs/, /rounds\[8\]\.value_b must not contain markup/]) {
    assert.ok(errors.some((error) => pattern.test(error)), `missing error ${pattern}: ${errors.join(" | ")}`);
  }
  assert.match(compare.extras.validate({ ...GERMAN_EXTRAS, rounds: GERMAN_EXTRAS.rounds.slice(1) }, scenes).join(), /exactly 12 items/);
  assert.deepEqual(compare.extras.validate(null, scenes), ["response must be an object"]);
});

test("fallback is valid, deterministic and invents no facts", () => {
  const scenes = germanScenes();
  const first = compare.extras.fallback(scenes, { title: GERMAN_TITLE, language: "de" });
  const second = compare.extras.fallback(structuredClone(scenes), { title: GERMAN_TITLE, language: "de" });
  assert.deepEqual(first, second);
  assert.deepEqual(compare.extras.validate(first, scenes), []);
  assert.equal(first.subject_a.name, "Krähe");
  assert.equal(first.subject_b.name, "Rabe");
  assert.equal(first.rounds.length, 12);
  assert.ok(first.rounds.every((round) => round.winner === "NONE" && !round.value_a && !round.value_b && round.score_a === 0 && round.score_b === 0));
  for (const count of [8, 16]) {
    const many = Array.from({ length: count }, (_, i) => ({ scene_index: i + 1, line: `Ein Satz Nummer ${i + 1}, mit Details.`, visual_intent: "x" }));
    const data = compare.extras.fallback(many, { title: "Die verlorene Stadt", language: "de" });
    assert.deepEqual(compare.extras.validate(data, many), []);
    assert.equal(data.subject_a.name, "OPTION A");
  }
});

test("buildHtml maps a long German 12-scene script onto hook, rounds with running score and verdict", async () => {
  const scenes = germanScenes().map((scene, i) => ({
    ...scene, index: i + 1, id: `scene-${i + 1}`, start: scene.start_seconds, duration: scene.duration_seconds,
    voSrc: `assets/vo/line-${i + 1}.mp3`, imgSrc: null,
  }));
  const totalDuration = Math.ceil(scenes.at(-1).start + scenes.at(-1).duration + 1.2);
  const ctx = {
    slug: "compare-de", title: GERMAN_TITLE, lang: "de", channel: {}, manifest: {}, totalDuration, extras: GERMAN_EXTRAS,
    sfxCues: [], bgmSegments: [], cinemaAudioHtml: "",
    common: { lang: "de", topicTitle: "Krähe vs. Rabe: Wer ist wirklich klüger?", fullScriptHtml: "", watermark: "Kanal" }, scenes,
  };
  const { html, cfg } = await compare.buildHtml(ctx);
  assert.equal((await compare.buildHtml(ctx)).html, html);  // xác định
  assert.ok(html.includes('data-composition-id="compare-de"'));
  assert.ok(html.includes("window.__timelines"));
  assert.ok(html.includes("gsap.timeline({ paused: true })"));
  assert.doesNotMatch(html, /Math\.random|Date\.now|requestAnimationFrame|repeat:\s*-1|tl\.call/);
  assert.doesNotMatch(html, /<img/);
  for (let i = 1; i <= 12; i += 1) assert.ok(html.includes(`src="assets/vo/line-${i}.mp3" data-start="${scenes[i - 1].start}"`), `vo ${i}`);
  assert.ok(html.includes('src="assets/audio/bgm.mp3"'));
  assert.ok(html.includes(`data-duration="${totalDuration}"`));
  assert.equal(cfg.labelLeft, "Krähe");
  assert.equal(cfg.labelRight, "Rabe");
  assert.deepEqual(cfg.rounds.map((round) => round.role), ["hook", ...Array(10).fill("round"), "verdict"]);
  assert.deepEqual(cfg.rounds.map((round) => round.start), scenes.map((scene) => scene.start));  // thời gian đo giữ nguyên
  // Hiệp: Körpergröße (2 cảnh, 1 điểm B), Stimme/Schwanzform/Intelligenz (TIE), Stadt (A), Lebensdauer (B), Endergebnis (B).
  assert.deepEqual(cfg.finalScore, { a: 4, b: 6 });
  assert.equal(cfg.rounds[11].focus, "BOTH");
  assert.equal(cfg.rounds[2].kicker, "RUNDE 1/7");
  assert.equal(cfg.rounds[3].kicker, "RUNDE 1/7");
  assert.equal(cfg.rounds[4].kicker, "RUNDE 2/7");
  assert.equal(cfg.rounds[1].kicker, "Krähe VS Rabe");
  assert.equal(cfg.rounds[11].kicker, "URTEIL");
  assert.equal(cfg.rounds[10].focus, "B");
  assert.equal(cfg.rounds[8].focus, "B");  // NONE nhưng lời đọc chỉ nhắc Rabe (Raben)
  assert.ok(html.includes('<span class="kw-b">Rabe</span>'));
  assert.ok(html.includes("Kolkrabe wird"));  // kein Treffer mitten im Wort
  assert.ok(html.includes("<span class=\"kw-b\">Raben</span> rufen") && html.includes("den Rabenvögeln"));
  assert.equal(cfg.rounds[1].focus, "NONE");  // "Rabenvögeln" ist kein Rabe
  assert.ok(html.includes("STAND"));
  assert.ok(html.includes("SIEGER") && html.includes("REMIS"));
});

test("fallback-driven build still renders cards without a scoreboard", async () => {
  const scenes = germanScenes().map((scene, i) => ({
    ...scene, index: i + 1, id: `scene-${i + 1}`, start: scene.start_seconds, duration: scene.duration_seconds, voSrc: `assets/vo/line-${i + 1}.mp3`, imgSrc: null,
  }));
  const { html, cfg } = await compare.buildHtml({
    slug: "compare-fb", title: GERMAN_TITLE, lang: "de", totalDuration: 60, extras: null, bgmSegments: [], cinemaAudioHtml: "",
    common: { lang: "de", topicTitle: "Krähe vs. Rabe", fullScriptHtml: "", watermark: "" }, scenes,
  });
  assert.deepEqual(cfg.finalScore, { a: 0, b: 0 });
  assert.ok(html.includes('id="versus-line"'));
  assert.doesNotMatch(html, /class="score-in/);
});

test("buildNativeVideoProject assembles a compare project from prepared media", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-compare-"));
  try {
    const fixture = createCompareFixture(root);
    const result = await buildNativeVideoProject(fixture);
    const html = fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8");
    const meta = JSON.parse(fs.readFileSync(path.join(result.video_dir, "meta.json"), "utf8"));
    assert.ok(html.includes(`data-composition-id="${compare.compositionId(fixture.job.video_slug)}"`));
    for (let i = 1; i <= 12; i += 1) {
      assert.ok(html.includes(`assets/vo/line-${i}.mp3`));
      assert.ok(fs.existsSync(path.join(result.video_dir, "assets", "vo", `line-${i}.mp3`)));
    }
    assert.ok(html.includes("assets/audio/bgm.mp3"));
    assert.equal(meta.type, "compare");
    assert.equal(meta.matrix.job_id, "compare-job");
    assert.equal(meta.compareConfig.labelLeft, "Krähe");
    assert.equal(meta.compareConfig.rounds.length, 12);
    assert.ok(result.duration_seconds >= 25 && result.duration_seconds <= 90, `duration ${result.duration_seconds}`);
    // Không có ảnh AI nào được chép vào video.
    assert.deepEqual(fs.readdirSync(path.join(result.video_dir, "assets", "images")), []);
    const again = await buildNativeVideoProject(fixture);
    assert.equal(fs.readFileSync(path.join(again.video_dir, "index.html"), "utf8"), html);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
