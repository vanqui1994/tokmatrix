import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import tierlist, { candidateRange } from "../matrix/render/engines/tierlist.mjs";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";
import { buildNativeVideoProject } from "../matrix/render/native-engine-adapter.mjs";

// 12 cảnh tiếng Đức, thời lượng đo (không đều), có khe nhỏ giữa các cảnh.
export const GERMAN_LINES = [
  "Welche Legende ist wirklich SSS?",
  "Das Voynich-Manuskript verwirrt Kryptografen seit mehr als einhundert Jahren ununterbrochen.",
  "Trotz modernster Computeranalyse bleibt jede einzelne Seite bis heute vollständig unlesbar.",
  "Die Dyatlov-Pass-Tragödie hinterließ neun tote Wanderer im eisigen Uralgebirge.",
  "Lawinentheorien erklären vieles, aber nicht die rätselhaften Strahlungswerte an der Kleidung.",
  "Die Mary Celeste trieb verlassen über den Atlantik, Ladung und Vorräte unberührt.",
  "Keine Spur von Kampf, nur ein fehlendes Rettungsboot und viele offene Fragen.",
  "Das Wow-Signal dauerte zweiundsiebzig Sekunden und wurde niemals wieder empfangen.",
  "Astronomen suchen seitdem vergeblich, deshalb verdient dieses Signal eindeutig die Spitze.",
  "Der Tunguska-Asteroid verwüstete zweitausend Quadratkilometer sibirischen Waldes ohne Einschlagkrater.",
  "Wissenschaftlich weitgehend erklärt, deshalb landet Tunguska ganz unten in unserer Rangliste.",
  "Welche Platzierung hättest du gewählt? Schreib es in die Kommentare!",
];
export const GERMAN_DURATIONS = [1.9, 4.6, 4.3, 4.1, 4.9, 4.2, 3.8, 4.0, 4.7, 4.4, 4.5, 3.6];

function timedScenes(lines = GERMAN_LINES, durations = GERMAN_DURATIONS) {
  let t = 0;
  return lines.map((line, i) => {
    const scene = { scene_index: i + 1, line, visual_intent: `Dramatic documentary visual ${i + 1}`, start_seconds: Number(t.toFixed(3)), duration_seconds: durations[i] };
    t += durations[i] + 0.15;
    return scene;
  });
}

function channelFor(language) {
  const channel = structuredClone(resolveChannelsForTopic("unsolved_mysteries", 1)[0]);
  const inner = channel.resolved_config.channel;
  inner.publishing = { ...(inner.publishing || {}), language };
  return channel;
}

/** Dựng thư mục project Matrix đã chuẩn bị (VO + ảnh IMAGE_AI mỗi cảnh). `media` cho phép dùng file thật. */
export function createTierlistFixture(root, { channel = channelFor("de"), scenes = timedScenes(), media = {}, extras } = {}) {
  const projectDir = path.join(root, "prepared-tierlist");
  const videoDir = path.join(root, "output-tierlist");
  fs.mkdirSync(path.join(projectDir, "assets", "audio"), { recursive: true });
  if (media.bgm) fs.copyFileSync(media.bgm, path.join(projectDir, "assets", "audio", "bgm.mp3"));
  else fs.writeFileSync(path.join(projectDir, "assets", "audio", "bgm.mp3"), "prepared background music");
  const prepared = scenes.map((scene) => {
    const index = scene.scene_index;
    const sceneDir = path.join(projectDir, "scenes", `scene_${String(index).padStart(2, "0")}`);
    fs.mkdirSync(sceneDir, { recursive: true });
    const narrationPath = path.join(sceneDir, "narration.mp3");
    const assetPath = path.join(sceneDir, "visual.jpg");
    if (media.vo) fs.copyFileSync(media.vo(index), narrationPath);
    else fs.writeFileSync(narrationPath, `spoken line ${index}`);
    if (media.image) fs.copyFileSync(media.image(index), assetPath);
    else fs.writeFileSync(assetPath, `visual scene ${index}`);
    return {
      ...scene,
      narration_path: path.relative(projectDir, narrationPath),
      asset_type: "IMAGE_AI",
      asset_source: "antigravity",
      asset_status: "READY",
      asset_path: path.relative(projectDir, assetPath),
    };
  });
  const end = Math.max(...prepared.map((scene) => scene.start_seconds + scene.duration_seconds));
  const script = { title: "Die 5 größten ungelösten Rätsel der Geschichte im Ranking", scenes: prepared };
  if (extras) script.engine_extras = { engine: "tierlist", source: "llm", data: extras };
  const job = {
    job_id: "tierlist-job", batch_id: "batch-test", channel_id: channel.channel_id,
    engine_type: "tierlist", video_slug: "tierlist-matrix-test", created_at: 1,
  };
  const manifest = {
    topic: { title: "Ungelöste Rätsel" },
    script,
    angle: { angle_id: "angle_01", hook: "Welche Legende ist SSS?" },
    blueprint: { blueprint_id: "ranking" },
    channel,
    scenes: prepared,
    audio: {
      duration_seconds: end,
      bgm_segments: [{ start: 0, duration: Math.ceil(end + 1.2), mediaStart: 0, volume: 0.12, isBoost: false }],
      sfx_cues: [],
    },
  };
  return { projectDir, videoDir, job, manifest };
}

test("tierlist module implements the extended-engine contract", () => {
  assert.equal(tierlist.id, "tierlist");
  assert.equal(tierlist.pending, undefined);
  assert.equal(tierlist.configKey, "tierListConfig");
  assert.equal(tierlist.assetType, "IMAGE_AI");
  assert.equal(tierlist.imageName(3, ".jpg"), "assets/images/scene-3.jpg");
  assert.equal(tierlist.compositionId("abc"), "abc");
  for (const fn of ["schema", "prompt", "validate", "fallback"]) assert.equal(typeof tierlist.extras[fn], "function");
  const schema = tierlist.extras.schema(12);
  assert.equal(schema.type, "OBJECT");
  assert.deepEqual(schema.required, ["headline", "items"]);
  assert.equal(schema.properties.items.maxItems, 7);
  assert.deepEqual(schema.properties.items.items.properties.tier.enum, ["SSS", "S", "A", "B", "C", "D"]);
  const prompt = tierlist.extras.prompt({ script: { title: "T", scenes: timedScenes() }, topic: "Rätsel", language: "de", channel: { name: "Kanal" } });
  assert.match(prompt, /Scenes 2–11/);
  assert.match(prompt, /Welche Legende/);
});

test("fallback extras are valid and deterministic for every scene count 8–16", () => {
  for (let count = 2; count <= 16; count += 1) {
    const scenes = timedScenes(GERMAN_LINES.concat(GERMAN_LINES).slice(0, count), GERMAN_DURATIONS.concat(GERMAN_DURATIONS).slice(0, count));
    const a = tierlist.extras.fallback(scenes, { title: "Titel", language: "de" });
    const b = tierlist.extras.fallback(scenes, { title: "Titel", language: "de" });
    assert.deepEqual(a, b);
    assert.deepEqual(tierlist.extras.validate(a, scenes), [], `count ${count}`);
    const range = candidateRange(count);
    assert.equal(a.items[0].first_scene, 2);
    assert.equal(a.items.at(-1).last_scene, range.last);
    if (count >= 8) assert.ok(a.items.length >= 3);
  }
  const fb = tierlist.extras.fallback(timedScenes(), { title: "Titel", language: "de" });
  assert.equal(fb.items.length, 5);
  assert.equal(fb.items.at(-1).tier, "SSS");
  assert.equal(fb.items[0].tier, "D");
  assert.equal(fb.headline, "WER VERDIENT SSS?");
});

test("validate reports precise coverage, tier and length errors", () => {
  const scenes = timedScenes();
  const good = tierlist.extras.fallback(scenes, { language: "de" });
  const gap = structuredClone(good);
  gap.items[1].first_scene += 1;
  assert.ok(tierlist.extras.validate(gap, scenes).some((e) => /items\[1\]\.first_scene must be/.test(e)));
  const short = structuredClone(good);
  short.items.at(-1).last_scene -= 1;
  assert.ok(tierlist.extras.validate(short, scenes).some((e) => /must end at scene 11/.test(e)));
  const bad = structuredClone(good);
  bad.items[0].tier = "Z";
  bad.items[0].name = "x".repeat(40);
  bad.items[0].subtitle = "<b>no</b>";
  const errors = tierlist.extras.validate(bad, scenes);
  assert.ok(errors.some((e) => /tier must be one of/.test(e)));
  assert.ok(errors.some((e) => /name is longer/.test(e)));
  assert.ok(errors.some((e) => /markup/.test(e)));
  const wide = structuredClone(good);
  wide.items = [{ ...good.items[0], first_scene: 2, last_scene: 11 }];
  assert.ok(tierlist.extras.validate(wide, scenes).some((e) => /more than 4 scenes|2–7 contenders/.test(e)));
  assert.deepEqual(tierlist.extras.validate(null, scenes), ["extras must be an object"]);
});

const LLM_EXTRAS = {
  headline: "Welches Rätsel verdient SSS?",
  items: [
    { name: "Voynich-Manuskript", subtitle: "Unlesbar seit über hundert Jahren", tier: "A", first_scene: 2, last_scene: 3 },
    { name: "Dyatlov-Pass", subtitle: "Neun Tote im Ural", tier: "S", first_scene: 4, last_scene: 5 },
    { name: "Mary Celeste", subtitle: "Das verlassene Geisterschiff", tier: "B", first_scene: 6, last_scene: 7 },
    { name: "Wow-Signal", subtitle: "72 Sekunden aus dem All", tier: "SSS", first_scene: 8, last_scene: 9 },
    { name: "Tunguska-Ereignis", subtitle: "Explosion ohne Krater", tier: "D", first_scene: 10, last_scene: 11 },
  ],
};

test("buildNativeVideoProject assembles a tierlist project from measured scenes, VO and images", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-tierlist-"));
  try {
    const fixture = createTierlistFixture(root, { extras: LLM_EXTRAS });
    const result = await buildNativeVideoProject(fixture);
    const html = fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8");
    const meta = JSON.parse(fs.readFileSync(path.join(result.video_dir, "meta.json"), "utf8"));
    assert.ok(html.includes(`data-composition-id="${tierlist.compositionId(fixture.job.video_slug)}"`));
    assert.ok(html.includes("gsap.timeline({ paused: true })"));
    assert.ok(html.includes("assets/audio/bgm.mp3"));
    for (let i = 1; i <= 12; i += 1) {
      assert.ok(html.includes(`src="assets/vo/line-${i}.mp3"`), `VO ${i}`);
      assert.ok(html.includes(`assets/images/scene-${i}.jpg`), `image ${i}`);
      assert.ok(fs.existsSync(path.join(result.video_dir, "assets", "vo", `line-${i}.mp3`)));
      assert.ok(fs.existsSync(path.join(result.video_dir, "assets", "images", `scene-${i}.jpg`)));
    }
    // Thời gian đo được giữ nguyên.
    for (const scene of fixture.manifest.scenes) {
      assert.ok(html.includes(`id="vo-${scene.scene_index}" class="clip" src="assets/vo/line-${scene.scene_index}.mp3" data-start="${scene.start_seconds}" data-duration="${scene.duration_seconds}"`));
    }
    assert.ok(fs.existsSync(path.join(result.video_dir, "assets", "audio", "tierlist", "sub_drop.mp3")));
    assert.ok(html.includes("Voynich-Manuskript") && html.includes("Wow-Signal"));
    assert.equal(meta.type, "tierlist");
    assert.ok(meta.tierListConfig);
    assert.equal(meta.tierListConfig.items.length, 5);
    assert.equal(meta.tierListConfig.items[3].tier, "SSS");
    assert.equal(meta.tierListConfig.outroScene, 12);
    assert.equal(meta.duration, Math.ceil(fixture.manifest.scenes.at(-1).start_seconds + fixture.manifest.scenes.at(-1).duration_seconds + 1.2));
    assert.ok(html.includes("ENDGÜLTIGE RANGLISTE"));
    // Deterministisch: zweiter Build erzeugt identisches HTML.
    await buildNativeVideoProject(fixture);
    assert.equal(fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8"), html);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("without stored extras the build uses the deterministic fallback", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-tierlist-fb-"));
  try {
    const fixture = createTierlistFixture(root);
    const result = await buildNativeVideoProject(fixture);
    const meta = JSON.parse(fs.readFileSync(path.join(result.video_dir, "meta.json"), "utf8"));
    assert.equal(meta.tierListConfig.headline, "WER VERDIENT SSS?");
    assert.equal(meta.tierListConfig.items.length, 5);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("invalid stored extras fail loudly instead of rendering a broken board", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-tierlist-bad-"));
  try {
    const broken = structuredClone(LLM_EXTRAS);
    broken.items.pop();
    const fixture = createTierlistFixture(root, { extras: broken });
    await assert.rejects(() => buildNativeVideoProject(fixture), /tierlist extras invalid/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("auto-sfx cues and tierlist whooshes never share a media id", async () => {
  const { duplicateMediaIds } = await import("../matrix/render/native-engine-adapter.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-tierlist-ids-"));
  try {
    const fixture = createTierlistFixture(root, { extras: LLM_EXTRAS });
    // Auto-SFX đặt id theo mẫu sfx-<tên>-<n>; engine tierlist cũng có whoosh ở item 1.
    fixture.manifest.audio.sfx_cues = [{ id: "sfx-whoosh-1", sfxId: "whoosh", start: 0.05, duration: 1.75, volume: 0.45, track: 11, reason: "Opening Hook Swipe" }];
    const result = await buildNativeVideoProject(fixture);
    const html = fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8");
    assert.deepEqual(duplicateMediaIds(html), []);
    assert.ok(html.includes('id="sfx-whoosh-1"') && html.includes('id="tier-whoosh-1"'));
    assert.deepEqual(duplicateMediaIds('<audio id="a"></audio><audio id="a"></audio><img id="b">'), ["a"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
