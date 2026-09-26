import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import wildlife, { IUCN_CODES } from "../matrix/render/engines/wildlife.mjs";
import { extendedEngine } from "../matrix/render/engines/index.mjs";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";
import { buildNativeVideoProject } from "../matrix/render/native-engine-adapter.mjs";

// 12 cảnh tiếng Đức (dài hơn nội dung mẫu), thời lượng đo không đều, có khe nhỏ giữa các cảnh.
export const GERMAN_LINES = [
  "Der klügste Jäger des Ozeans?",
  "Orcas jagen in Familienverbänden und stimmen ihre Angriffe mit erstaunlicher Präzision ab.",
  "Jede Gruppe besitzt eigene Rufe, die Forscher als regelrechte Dialekte bezeichnen.",
  "In der Antarktis erzeugen sie gemeinsam Wellen, die Robben von Eisschollen spülen.",
  "Vor Argentinien stranden sie absichtlich am Strand, um junge Seelöwen zu packen.",
  "Mütter bringen ihren Kälbern diese riskante Technik über viele Jahre geduldig bei.",
  "Selbst Weiße Haie fliehen, sobald eine Orca-Gruppe in ihrem Revier auftaucht.",
  "Mit Geschwindigkeiten über fünfzig Kilometern pro Stunde entkommt ihnen kaum eine Beute.",
  "Ihr Gehirn wiegt mehr als fünf Kilogramm und verarbeitet Emotionen besonders intensiv.",
  "Trotzdem bedrohen Lärm, Schadstoffe und Überfischung viele Populationen weltweit.",
  "Manche Gruppen vor Europa haben seit Jahrzehnten kein einziges Kalb mehr aufgezogen.",
  "Würdest du einem Orca in freier Wildbahn begegnen wollen? Schreib es in die Kommentare!",
];
export const GERMAN_DURATIONS = [1.9, 4.6, 4.3, 4.1, 4.9, 4.2, 3.8, 4.4, 4.7, 4.4, 4.5, 3.6];

export function timedScenes(lines = GERMAN_LINES, durations = GERMAN_DURATIONS) {
  let t = 0;
  return lines.map((line, i) => {
    const scene = { scene_index: i + 1, line, visual_intent: `Wildlife documentary shot ${i + 1}`, start_seconds: Number(t.toFixed(3)), duration_seconds: durations[i] };
    t += durations[i] + 0.15;
    return scene;
  });
}

export const GERMAN_EXTRAS = {
  common_name: "Schwertwal (Orca)",
  latin_name: "Orcinus orca",
  habitat: "Alle Ozeane, von Arktis bis Antarktis",
  iucn_status: "DD",
  stats: [
    { label: "GESCHWINDIGKEIT", value: "56 km/h", level: 80 },
    { label: "GEHIRNMASSE", value: "5–6 kg", level: 92 },
    { label: "GRUPPENGRÖSSE", value: "5–30 Tiere", level: 70 },
    { label: "LEBENSDAUER", value: "50–90 Jahre", level: 85 },
  ],
  callouts: [
    { scene: 2, text: "JAGD IM FAMILIENVERBAND" },
    { scene: 4, text: "WELLENJAGD · ANTARKTIS" },
    { scene: 10, text: "BEDROHUNG DURCH DEN MENSCHEN" },
  ],
};

export function channelFor(language) {
  const channel = structuredClone(resolveChannelsForTopic("unsolved_mysteries", 1)[0]);
  const inner = channel.resolved_config?.channel || channel.channel || channel;
  inner.publishing = { ...(inner.publishing || {}), language };
  return channel;
}

/** Project Matrix đã chuẩn bị (VO + ảnh IMAGE_AI mỗi cảnh). `media` cho phép dùng file thật. */
export function createWildlifeFixture(root, { channel = channelFor("de"), scenes = timedScenes(), media = {}, extras } = {}) {
  const projectDir = path.join(root, "prepared-wildlife");
  const videoDir = path.join(root, "output-wildlife");
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
  const script = { title: "Warum Orcas die klügsten Jäger der Meere sind", scenes: prepared };
  if (extras) script.engine_extras = { engine: "wildlife", source: "llm", data: extras };
  const job = {
    job_id: "wildlife-job", batch_id: "batch-test", channel_id: channel.channel_id,
    engine_type: "wildlife", video_slug: "wildlife-matrix-test", created_at: 1,
  };
  const manifest = {
    topic: { title: "Orcas" },
    script,
    angle: { angle_id: "angle_01", hook: "Der klügste Jäger des Ozeans?" },
    blueprint: { blueprint_id: "documentary" },
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

test("wildlife module is registered and complete", () => {
  assert.equal(extendedEngine("wildlife"), wildlife);
  assert.equal(wildlife.pending, undefined);
  assert.equal(wildlife.assetType, "IMAGE_AI");
  assert.equal(wildlife.configKey, "wildlifeConfig");
  assert.equal(wildlife.imageName(3, ".jpg"), "assets/images/scene-3.jpg");
  assert.equal(wildlife.compositionId("abc"), "abc");
});

test("wildlife extras schema lists IUCN codes and bounds stats/callouts", () => {
  const schema = wildlife.extras.schema(12);
  assert.deepEqual(schema.properties.iucn_status.enum, IUCN_CODES);
  assert.equal(schema.properties.stats.minItems, 2);
  assert.equal(schema.properties.stats.maxItems, 4);
  assert.equal(schema.properties.callouts.maxItems, 12);
  assert.ok(schema.required.includes("iucn_status"));
  const prompt = wildlife.extras.prompt({ script: { title: "T", scenes: timedScenes() }, topic: "Orcas", language: "de" });
  assert.match(prompt, /do NOT rewrite/);
  assert.match(prompt, /12\. Würdest du/);
});

test("wildlife validate accepts good extras and rejects bad IUCN, stats, callouts and markup", () => {
  const scenes = timedScenes();
  assert.deepEqual(wildlife.extras.validate(GERMAN_EXTRAS, scenes), []);
  const bad = (patch) => wildlife.extras.validate({ ...structuredClone(GERMAN_EXTRAS), ...patch }, scenes);
  assert.ok(bad({ iucn_status: "APEX" }).some((e) => /iucn_status/.test(e)));
  assert.ok(bad({ iucn_status: "lc" }).some((e) => /iucn_status/.test(e)));
  assert.ok(bad({ stats: [GERMAN_EXTRAS.stats[0]] }).some((e) => /2–4/.test(e)));
  assert.ok(bad({ stats: [{ label: "A", value: "1", level: 101 }, { label: "B", value: "2", level: 5 }] }).some((e) => /level/.test(e)));
  assert.ok(bad({ stats: [{ label: "A", value: "1", level: 1 }, { label: "a", value: "2", level: 5 }] }).some((e) => /duplicates/.test(e)));
  assert.ok(bad({ callouts: [{ scene: 13, text: "X" }] }).some((e) => /scene must be/.test(e)));
  assert.ok(bad({ callouts: [{ scene: 2, text: "X" }, { scene: 2, text: "Y" }] }).some((e) => /already/.test(e)));
  assert.ok(bad({ common_name: "<b>Orca</b>" }).some((e) => /markup/.test(e)));
  assert.ok(bad({ latin_name: "Орка" }).some((e) => /Latin/.test(e)));
  assert.ok(bad({ common_name: "x".repeat(41) }).some((e) => /longer/.test(e)));
  assert.deepEqual(bad({ latin_name: "", habitat: "", callouts: undefined }), []);
  assert.deepEqual(wildlife.extras.validate(null, scenes), ["extras must be an object"]);
});

test("wildlife fallback is valid, deterministic and invents no facts", () => {
  const scenes = timedScenes();
  const a = wildlife.extras.fallback(scenes, { title: "Warum Orcas die klügsten Jäger der Meere sind", language: "de" });
  const b = wildlife.extras.fallback(structuredClone(scenes), { title: "Warum Orcas die klügsten Jäger der Meere sind", language: "de" });
  assert.deepEqual(a, b);
  assert.deepEqual(wildlife.extras.validate(a, scenes), []);
  assert.equal(a.iucn_status, "NE");
  assert.equal(a.latin_name, "");
  assert.equal(a.habitat, "");
  assert.deepEqual(a.stats.map((s) => s.label), ["SZENEN", "WÖRTER"]);
  assert.equal(a.stats[0].value, "12");
  for (const count of [8, 16]) {
    const lines = Array.from({ length: count }, (_, i) => `Line number ${i + 1} about a wild animal.`);
    const s = timedScenes(lines, lines.map((_, i) => 3 + (i % 3) * 0.7));
    assert.deepEqual(wildlife.extras.validate(wildlife.extras.fallback(s, { title: "", language: "xx" }), s), []);
  }
});

test("wildlife buildNativeVideoProject assembles a seekable 12-scene German project", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-wildlife-"));
  try {
    const fixture = createWildlifeFixture(root, { extras: GERMAN_EXTRAS });
    const result = await buildNativeVideoProject(fixture);
    const html = fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8");
    const meta = JSON.parse(fs.readFileSync(path.join(result.video_dir, "meta.json"), "utf8"));
    assert.ok(html.includes(`data-composition-id="${fixture.job.video_slug}"`));
    assert.ok(html.includes(`window.__timelines[${JSON.stringify(fixture.job.video_slug)}]`));
    assert.match(html, /gsap\.timeline\(\{ paused: true \}\)/);
    assert.doesNotMatch(html, /repeat:\s*-1|requestAnimationFrame|setInterval/);
    assert.ok(html.includes("assets/audio/bgm.mp3"));
    for (let i = 1; i <= 12; i += 1) {
      assert.ok(html.includes(`src="assets/vo/scene-${i}.mp3"`), `VO ${i}`);
      assert.equal((html.match(new RegExp(`src="assets/images/scene-${i}\\.jpg"`, "g")) || []).length, 1, `image ${i} once`);
      assert.ok(fs.existsSync(path.join(result.video_dir, "assets", "vo", `scene-${i}.mp3`)));
      assert.ok(fs.existsSync(path.join(result.video_dir, "assets", "images", `scene-${i}.jpg`)));
    }
    // Thời gian đo được giữ nguyên (không chia đều).
    const scenes = fixture.manifest.scenes;
    assert.ok(html.includes(`id="vo-5" class="clip" src="assets/vo/scene-5.mp3" data-start="${scenes[4].start_seconds}" data-duration="${scenes[4].duration_seconds}"`));
    assert.ok(html.includes("Orcinus orca"));
    assert.ok(html.includes("IUCN · Ungenügende Datenlage (DD)"));
    assert.ok(html.includes("JAGD IM FAMILIENVERBAND"));
    assert.ok(html.includes("SZENE 3/12"));
    assert.ok(html.includes(GERMAN_LINES[11].replace("?", "?")));
    assert.ok(fs.existsSync(path.join(result.video_dir, "assets", "audio", "wildlife", "camera_shutter.mp3")));
    assert.equal(meta.type, "wildlife");
    assert.equal(meta.duration, result.duration_seconds);
    assert.equal(meta.wildlifeConfig.latinName, "Orcinus orca");
    assert.equal(meta.wildlifeConfig.iucnStatus, "DD");
    assert.equal(meta.wildlifeConfig.scenes.length, 12);
    assert.equal(meta.wildlifeConfig.scenes[4].start, scenes[4].start_seconds);
    assert.match(html, new RegExp(`data-duration="${result.duration_seconds}"`));
    // Dựng lại cùng input → cùng HTML.
    await buildNativeVideoProject(fixture);
    assert.equal(fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8"), html);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("wildlife without LLM extras uses the deterministic fallback; invalid stored extras are refused", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-wildlife-fb-"));
  try {
    const fixture = createWildlifeFixture(root, { channel: channelFor("en") });
    const result = await buildNativeVideoProject(fixture);
    const html = fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8");
    assert.ok(html.includes("IUCN · Not Evaluated (NE)"));
    assert.ok(html.includes("UNSPECIFIED"));
    const bad = createWildlifeFixture(path.join(root, "bad"), { extras: { ...GERMAN_EXTRAS, iucn_status: "APEX" } });
    fs.mkdirSync(path.join(root, "bad"), { recursive: true });
    await assert.rejects(() => buildNativeVideoProject({ ...bad, job: { ...bad.job, job_id: "wildlife-bad", video_slug: "wildlife-bad" } }), /iucn_status/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
