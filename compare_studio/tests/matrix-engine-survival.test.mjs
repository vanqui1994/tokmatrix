import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";
import { buildNativeVideoProject } from "../matrix/render/native-engine-adapter.mjs";
import survival, { facePhase, sceneRoles } from "../matrix/render/engines/survival.mjs";

// 12 cảnh tiếng Đức, thời lượng đo từ TTS (không đều nhau), cảnh 1 là hook ngắn.
export const GERMAN_LINES = [
  "Wie lange überlebst du das?",
  "Stufe eins: Du verpasst ein Frühstück und dein Magen knurrt laut.",
  "Nach vierundzwanzig Stunden ohne Essen sinkt der Blutzuckerspiegel spürbar ab.",
  "Nach drei Tagen verbrennt dein Körper Fettreserven und bildet Ketonkörper.",
  "Eine Woche ohne Nahrung: Muskelgewebe wird zur Energiegewinnung abgebaut.",
  "Nach zwei Wochen schwächelt das Immunsystem und Infektionen häufen sich.",
  "Drei Wochen: Herzmuskelzellen leiden, Elektrolytstörungen werden lebensgefährlich.",
  "Nach vier Wochen versagen Organe, das Gehirn arbeitet nur noch eingeschränkt.",
  "Sechs Wochen: Selbst Hungerstreikende erreichten hier ihre absolute Belastungsgrenze.",
  "Nach etwa zwei Monaten ist das Überleben ohne Nahrung praktisch ausgeschlossen.",
  "Wasser entscheidet alles: ohne Trinken endet es schon nach wenigen Tagen.",
  "Welche Stufe hat dich überrascht? Folge für mehr Überlebensfakten!",
];
export const GERMAN_DURATIONS = [1.9, 4.1, 4.6, 4.4, 4.8, 4.3, 5.2, 4.7, 4.9, 4.5, 4.2, 3.8];

export function germanScenes() {
  let start = 0.2;
  return GERMAN_LINES.map((line, i) => {
    const scene = {
      scene_index: i + 1,
      beat_id: `b${i + 1}`,
      line,
      visual_intent: `Überlebensstufe ${i + 1}`,
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
  channel.engine_type = "survival";
  return channel;
}

/** Fixture dự án Matrix đã chuẩn bị (giọng mỗi cảnh + artifact TEXT) cho engine survival. */
export function createSurvivalFixture(root, { writeAudio } = {}) {
  const projectDir = path.join(root, "prepared-survival");
  const videoDir = path.join(root, "output-survival");
  fs.mkdirSync(path.join(projectDir, "assets", "audio"), { recursive: true });
  const bgm = path.join(projectDir, "assets", "audio", "bgm.mp3");
  if (writeAudio) writeAudio(bgm, 62); else fs.writeFileSync(bgm, "prepared background music");
  const scenes = germanScenes().map((scene) => {
    const index = scene.scene_index;
    const sceneDir = path.join(projectDir, "scenes", `scene_${String(index).padStart(2, "0")}`);
    fs.mkdirSync(sceneDir, { recursive: true });
    const narrationPath = path.join(sceneDir, "narration.mp3");
    const assetPath = path.join(sceneDir, "text-scene.txt");
    if (writeAudio) writeAudio(narrationPath, scene.duration_seconds); else fs.writeFileSync(narrationPath, `spoken line ${index}`);
    fs.writeFileSync(assetPath, `${scene.line}\n`);
    return {
      ...scene,
      narration_path: path.relative(projectDir, narrationPath),
      asset_type: survival.assetType,
      asset_source: "native_renderer",
      asset_status: "READY",
      asset_path: path.relative(projectDir, assetPath),
    };
  });
  const end = scenes.at(-1).start_seconds + scenes.at(-1).duration_seconds;
  const channel = germanChannel();
  const job = {
    job_id: "survival-job", batch_id: "batch-test", channel_id: channel.channel_id,
    engine_type: "survival", video_slug: "survival-matrix-test", created_at: 1,
  };
  const title = "Wie lange überlebt der Mensch ohne Nahrung?";
  const manifest = {
    topic: { title },
    script: { title, scenes, engine_extras: { engine: "survival", source: "fallback", data: survival.extras.fallback(scenes, { title, language: "de" }) } },
    angle: { angle_id: "angle_01", hook: "Wie lange überlebst du das?" },
    blueprint: { blueprint_id: "escalation" },
    channel,
    scenes,
    audio: {
      duration_seconds: end,
      bgm_segments: [{ start: 0, duration: Math.ceil(end + 1.2), mediaStart: 0, volume: 0.12, isBoost: false }],
      sfx_cues: [],
    },
  };
  return { projectDir, videoDir, job, manifest };
}

test("survival module implements the extended engine contract without AI images", () => {
  assert.equal(survival.id, "survival");
  assert.equal(survival.pending, undefined);
  assert.equal(survival.configKey, "survivalConfig");
  assert.equal(survival.voPrefix, "line");
  assert.equal(survival.assetType, "TEXT");
  assert.equal(survival.compositionId("abc"), "abc");
  for (const key of ["schema", "prompt", "validate", "fallback"]) assert.equal(typeof survival.extras[key], "function");
  const schema = survival.extras.schema(12);
  assert.equal(schema.type, "OBJECT");
  assert.equal(schema.properties.levels.minItems, 12);
  assert.equal(schema.properties.levels.maxItems, 12);
  assert.deepEqual(schema.required, ["eyebrow", "metric_labels", "levels"]);
  assert.deepEqual(sceneRoles(4), ["prologue", "level", "level", "outro"]);
  assert.equal(facePhase(1), 1);
  assert.equal(facePhase(10), 9);  // phase-10 (hình treo cổ) không bao giờ dùng
});

test("fallback extras are valid and deterministic for 8–16 scenes, prompt keeps narration", () => {
  const scenes = germanScenes();
  const a = survival.extras.fallback(scenes, { title: "Ohne Nahrung", language: "de" });
  const b = survival.extras.fallback(structuredClone(scenes), { title: "Ohne Nahrung", language: "de" });
  assert.deepEqual(a, b);
  assert.deepEqual(survival.extras.validate(a, scenes), []);
  assert.deepEqual(a.metric_labels, ["GESUNDHEIT", "ENERGIE", "VERSTAND"]);
  const levels = a.levels.slice(1, -1);
  assert.equal(levels[0].severity, 1);
  assert.equal(levels.at(-1).severity, 10);
  assert.ok(levels.every((level, i) => !i || level.severity >= levels[i - 1].severity));
  assert.ok(a.levels.every((level) => level.label.length <= 48 && level.status.length <= 24));
  for (const count of [8, 9, 13, 16]) {
    const many = Array.from({ length: count }, (_, i) => ({ scene_index: i + 1, line: `Line number ${i + 1}, with a clause.`, visual_intent: "x" }));
    for (const lang of ["en", "vi", "ja", "xx"]) {
      const data = survival.extras.fallback(many, { title: "T", language: lang });
      assert.deepEqual(survival.extras.validate(data, many), [], `${count} ${lang}`);
    }
  }
  const prompt = survival.extras.prompt({ script: { title: "Ohne Nahrung", scenes }, topic: "Ohne Nahrung", language: "de" });
  for (const line of GERMAN_LINES) assert.ok(prompt.includes(line));
  assert.match(prompt, /\[LEVEL 10\]/);
  assert.match(prompt, /\[OUTRO\]/);
});

test("validate reports concrete problems", () => {
  const scenes = germanScenes();
  const data = survival.extras.fallback(scenes, { title: "T", language: "de" });
  data.levels[5].severity = 1;  // bậc giảm
  data.levels[2].metrics = [120, 5, 5];
  data.levels[3].label = "x".repeat(80);
  data.metric_labels = ["A", "<b>"];
  data.levels.pop();
  const errors = survival.extras.validate(data, scenes);
  assert.ok(errors.some((e) => /metric_labels must have exactly 3/.test(e)));
  assert.ok(errors.some((e) => /levels must have exactly 12/.test(e)));
  const fixed = survival.extras.fallback(scenes, { title: "T", language: "de" });
  fixed.levels[5].severity = 1;
  fixed.levels[2].metrics = [120, 5, 5];
  fixed.levels[3].label = "x".repeat(80);
  fixed.eyebrow = "";
  const more = survival.extras.validate(fixed, scenes);
  assert.ok(more.some((e) => /levels\[5\]\.severity 1 must not be lower/.test(e)));
  assert.ok(more.some((e) => /levels\[2\]\.metrics/.test(e)));
  assert.ok(more.some((e) => /levels\[3\]\.label must be at most 48/.test(e)));
  assert.ok(more.some((e) => /eyebrow is empty/.test(e)));
  assert.deepEqual(survival.extras.validate(null, scenes), ["response must be an object"]);
});

test("buildNativeVideoProject builds a seekable survival project from the German 12-scene fixture", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-survival-"));
  try {
    const fixture = createSurvivalFixture(root);
    const result = await buildNativeVideoProject(fixture);
    const html = fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8");
    const meta = JSON.parse(fs.readFileSync(path.join(result.video_dir, "meta.json"), "utf8"));
    assert.ok(html.includes(`data-composition-id="${survival.compositionId(fixture.job.video_slug)}"`));
    assert.equal(meta.type, "survival");
    assert.equal(meta.lang, "de");
    assert.ok(meta.survivalConfig);
    assert.equal(meta.survivalConfig.levels.length, 12);
    for (let i = 1; i <= 12; i += 1) {
      const scene = fixture.manifest.scenes[i - 1];
      assert.ok(html.includes(`src="assets/vo/line-${i}.mp3" data-start="${scene.start_seconds}" data-duration="${scene.duration_seconds}"`), `VO ${i} keeps measured timing`);
      assert.ok(fs.existsSync(path.join(result.video_dir, "assets", "vo", `line-${i}.mp3`)));
    }
    assert.ok(html.includes("assets/audio/bgm.mp3"));
    assert.ok(html.includes("STUFE 10/10"));
    assert.ok(html.includes("PROLOG") && html.includes("FINALE"));
    assert.ok(html.includes("gsap.timeline({ paused: true })"));
    assert.ok(!/requestAnimationFrame|setInterval|Math\.random|Date\.now/.test(html));
    assert.ok(!html.includes("phase-10.png"));
    for (let phase = 1; phase <= 9; phase += 1) assert.ok(fs.existsSync(path.join(result.video_dir, "assets", "mrincredible", `phase-${phase}.png`)));
    assert.equal(result.duration_seconds, Math.ceil(fixture.manifest.scenes.at(-1).start_seconds + fixture.manifest.scenes.at(-1).duration_seconds + 1.2));
    assert.ok(html.includes(`data-duration="${result.duration_seconds}"`));
    // chạy lại cùng job → cùng HTML (xác định)
    await buildNativeVideoProject(fixture);
    assert.equal(fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8"), html);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildHtml falls back to derived extras and rejects missing timing", async () => {
  const scenes = germanScenes().slice(0, 8).map((scene, i) => ({
    ...scene, index: i + 1, id: `scene-${i + 1}`, start: scene.start_seconds, duration: scene.duration_seconds, voSrc: `assets/vo/line-${i + 1}.mp3`,
  }));
  const total = Math.ceil(scenes.at(-1).start + scenes.at(-1).duration + 1.2);
  const ctx = {
    slug: "s", title: "T <x>", lang: "en", totalDuration: total, extras: null, bgmSegments: [], cinemaAudioHtml: "",
    common: { lang: "en", topicTitle: "T &lt;x&gt;", fullScriptHtml: "", watermark: "W" }, scenes,
  };
  const { html, cfg } = await survival.buildHtml(ctx);
  assert.ok(html.includes("LEVEL 6/6"));
  assert.ok(html.includes('id="bgm"'));  // không có bgm_segments → vẫn có nhạc nền
  assert.equal(cfg.levels.length, 8);
  await assert.rejects(survival.buildHtml({ ...ctx, scenes: [{ ...scenes[0], start: Number.NaN }] }), /measured timing/);
});
