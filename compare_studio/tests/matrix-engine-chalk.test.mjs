import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import chalk, { MAPS, LIMITS } from "../matrix/render/engines/chalk.mjs";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";
import { buildNativeVideoProject } from "../matrix/render/native-engine-adapter.mjs";

// 12 Szenen, Matrix-typisch lang (Deutsch), Szene 1 ist ein kurzer Hook.
export const GERMAN_LINES = [
  "Russlands vergessene Insel.",
  "Kaliningrad liegt eingeklemmt zwischen Polen und Litauen, direkt an der Ostsee.",
  "Bis 1945 hieß die Stadt Königsberg und gehörte zu Ostpreußen.",
  "Nach dem Zweiten Weltkrieg annektierte die Sowjetunion das gesamte nördliche Gebiet.",
  "Mit dem Zerfall der Sowjetunion wurde die Region plötzlich zur Exklave.",
  "Heute trennen über dreihundert Kilometer fremdes Territorium sie vom russischen Mutterland.",
  "Die Suwałki-Lücke gilt als verwundbarster Korridor der gesamten NATO-Ostflanke.",
  "Moskau stationierte dort Iskander-Raketen mit einer Reichweite von fünfhundert Kilometern.",
  "Die Baltische Flotte nutzt den eisfreien Hafen Baltijsk das ganze Jahr.",
  "Für Transitreisende gelten seit Jahrzehnten komplizierte Sonderregeln und Visaabkommen.",
  "Wirtschaftlich hängt die Exklave stark von Importen über die Ostsee ab.",
  "Deshalb bleibt Kaliningrad einer der angespanntesten Orte ganz Europas.",
];
export const GERMAN_DURATIONS = [2.1, 4.6, 4.1, 4.9, 4.4, 5.2, 4.8, 5.1, 4.3, 5.0, 4.2, 4.5];

export function timedScenes(lines = GERMAN_LINES, durations = GERMAN_DURATIONS) {
  let start = 0;
  return lines.map((line, index) => {
    const scene = {
      scene_index: index + 1, beat_id: `b${index + 1}`, line, visual_intent: `Chalk map beat ${index + 1}`,
      start_seconds: Number(start.toFixed(2)), duration_seconds: durations[index],
    };
    start += durations[index] + 0.35;
    return scene;
  });
}

/** Projekt wie nach ASSET_QA: VO pro Szene, TEXT-Artefakt pro Szene, BGM. `audio(filePath, seconds)` schreibt die MP3. */
export function createChalkFixture(root, { lines = GERMAN_LINES, durations = GERMAN_DURATIONS, extras = null, audio = null, slug = "chalk-matrix-test" } = {}) {
  const channel = resolveChannelsForTopic("geopolitics_maps", 10)[0];
  const projectDir = path.join(root, "prepared-chalk");
  const videoDir = path.join(root, "output-chalk");
  fs.mkdirSync(path.join(projectDir, "assets", "audio"), { recursive: true });
  const bgm = path.join(projectDir, "assets", "audio", "bgm.mp3");
  if (audio) audio(bgm, Math.ceil(durations.reduce((a, b) => a + b + 0.35, 0)) + 2);
  else fs.writeFileSync(bgm, "prepared background music");
  const scenes = timedScenes(lines, durations).map((scene) => {
    const sceneDir = path.join(projectDir, "scenes", `scene_${String(scene.scene_index).padStart(2, "0")}`);
    fs.mkdirSync(sceneDir, { recursive: true });
    const narrationPath = path.join(sceneDir, "narration.mp3");
    const assetPath = path.join(sceneDir, "text-scene.txt");
    if (audio) audio(narrationPath, scene.duration_seconds);
    else fs.writeFileSync(narrationPath, `spoken line ${scene.scene_index}`);
    fs.writeFileSync(assetPath, `${scene.line}\n`);
    return {
      ...scene,
      narration_path: path.relative(projectDir, narrationPath),
      asset_type: chalk.assetType,
      asset_source: "native_renderer",
      asset_status: "READY",
      asset_path: path.relative(projectDir, assetPath),
    };
  });
  const total = scenes.at(-1).start_seconds + scenes.at(-1).duration_seconds;
  const job = {
    job_id: "chalk-job", batch_id: "batch-test", channel_id: channel.channel_id,
    engine_type: "chalk", video_slug: slug, created_at: 1,
  };
  const script = { title: "Kaliningrad: Russlands Exklave mitten in der EU", scenes };
  if (extras) script.engine_extras = { engine: "chalk", source: "llm", data: extras };
  const manifest = {
    topic: { title: "Why Kaliningrad is separated from Russia" },
    script,
    angle: { angle_id: "angle_01", hook: "Russlands vergessene Insel" },
    blueprint: { blueprint_id: "explainer" },
    channel,
    scenes,
    audio: { duration_seconds: total, bgm_segments: [], sfx_cues: [] },
  };
  return { projectDir, videoDir, job, manifest, channel };
}

export const KALININGRAD_EXTRAS = {
  map_type: "theater",
  zone_labels: [
    { zone: "north", label: "OSTSEE-KÜSTE" }, { zone: "west", label: "POLEN" }, { zone: "east", label: "LITAUEN" },
    { zone: "center", label: "KALININGRAD" }, { zone: "south", label: "BELARUS" }, { zone: "southeast", label: "RUSSLAND" },
  ],
  scenes: GERMAN_LINES.map((line, i) => ({
    scene_index: i + 1,
    headline: ["Die vergessene Insel", "Eingeklemmt an der Ostsee", "Einst Königsberg", "Sowjetische Annexion", "Plötzlich Exklave",
      "300 km Abstand", "Die Suwałki-Lücke", "Iskander-Raketen", "Baltische Flotte", "Transit-Sonderregeln", "Abhängig von Importen", "Europas Pulverfass"][i],
    camera: i === 0 || i === 11 ? "wide" : "close",
    highlights: [{ region: "center", color: i % 3 === 0 ? "red" : i % 3 === 1 ? "yellow" : "cyan", label: "KALININGRAD" }],
    arrows: i === 5 ? [{ from: "southeast", to: "center", color: "white", curve: "left", label: "300 KM TRANSIT" }]
      : i === 7 ? [{ from: "center", to: "west", color: "red", curve: "right", label: "500 KM REICHWEITE" }, { from: "center", to: "east", color: "red", curve: "left", label: "" }]
        : [],
    markers: i === 8 ? [{ at: "sea-west", kind: "pin", label: "BALTIJSK" }] : i === 6 ? [{ at: "south", kind: "x", label: "SUWAŁKI" }] : [],
  })),
};

test("schema, prompt and validate describe only geometry the template can draw", () => {
  const scenes = timedScenes();
  const schema = chalk.extras.schema(scenes.length);
  assert.equal(schema.properties.scenes.minItems, 12);
  assert.equal(schema.properties.scenes.maxItems, 12);
  assert.deepEqual(schema.properties.map_type.enum, Object.keys(MAPS));
  const prompt = chalk.extras.prompt({ script: { title: "T", scenes }, topic: "Kaliningrad", language: "de" });
  for (const id of ["middle-east", "theater", "iran", "strait-of-hormuz", "southeast", "edge-north"]) assert.ok(prompt.includes(id), id);
  assert.deepEqual(chalk.extras.validate(KALININGRAD_EXTRAS, scenes), []);

  const broken = structuredClone(KALININGRAD_EXTRAS);
  broken.scenes[1].highlights[0].region = "poland";
  broken.scenes[2].arrows = [{ from: "center", to: "atlantis", color: "white", curve: "left", label: "" }];
  broken.scenes[3].headline = "x".repeat(LIMITS.headline + 5);
  broken.scenes[4] = { ...broken.scenes[4], highlights: [], arrows: [], markers: [] };
  const errors = chalk.extras.validate(broken, scenes);
  assert.ok(errors.some((e) => e.includes('"poland"')), errors.join("\n"));
  assert.ok(errors.some((e) => e.includes('"atlantis"')));
  assert.ok(errors.some((e) => e.includes("scenes[3].headline")));
  assert.ok(errors.some((e) => e.includes("scenes[4] needs at least one")));
  assert.match(chalk.extras.validate({ ...KALININGRAD_EXTRAS, map_type: "europe" }, scenes)[0], /map_type must be one of/);
  // Region ids of one map are not valid on the other.
  const wrongMap = structuredClone(KALININGRAD_EXTRAS);
  wrongMap.map_type = "middle-east";
  delete wrongMap.zone_labels;
  assert.ok(chalk.extras.validate(wrongMap, scenes).some((e) => e.includes('"center" is not a region of middle-east')));
  assert.ok(chalk.extras.validate({ ...KALININGRAD_EXTRAS, scenes: KALININGRAD_EXTRAS.scenes.slice(1) }, scenes).some((e) => e.includes("exactly 12")));
});

test("fallback is valid and deterministic for 8-16 scenes and picks the real map only for Middle East stories", () => {
  for (const count of [8, 12, 16]) {
    const lines = Array.from({ length: count }, (_, i) => GERMAN_LINES[i % GERMAN_LINES.length]);
    const scenes = timedScenes(lines, lines.map((_, i) => GERMAN_DURATIONS[i % GERMAN_DURATIONS.length]));
    const first = chalk.extras.fallback(scenes, { title: "T", language: "de" });
    assert.deepEqual(chalk.extras.validate(first, scenes), [], `count ${count}`);
    assert.deepEqual(chalk.extras.fallback(scenes, { title: "T", language: "de" }), first);
    assert.equal(first.map_type, "theater");
  }
  const gulf = timedScenes([
    "Die Straße von Hormus.", "Der Iran kontrolliert die engste Stelle der Meerenge.", "Saudi-Arabien und Katar exportieren fast ihr ganzes Öl hier durch.",
    "Die USA stationieren Flotten im Persischen Golf.", "Irak und Kuwait hängen ebenfalls vom Seeweg ab.", "Jeder Tanker braucht einen Korridor.",
    "Oman teilt die Meerenge mit dem Iran.", "Ein Konflikt würde die Ölpreise weltweit explodieren lassen.",
  ], [2, 4, 4, 4, 4, 3, 4, 4]);
  const data = chalk.extras.fallback(gulf, { language: "de" });
  assert.equal(data.map_type, "middle-east");
  assert.deepEqual(chalk.extras.validate(data, gulf), []);
  assert.equal(data.scenes[1].highlights[0].region, "iran");
  assert.ok(data.scenes[2].highlights.some((item) => item.label === "SAUDI-ARABIEN"));
  assert.ok(data.scenes[2].highlights.some((item) => item.label === "KATAR"));
});

test("buildNativeVideoProject assembles a chalk project from measured scenes (German, 12 scenes)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-chalk-"));
  try {
    const fixture = createChalkFixture(root, { extras: KALININGRAD_EXTRAS });
    const result = await buildNativeVideoProject(fixture);
    const html = fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8");
    const meta = JSON.parse(fs.readFileSync(path.join(result.video_dir, "meta.json"), "utf8"));
    assert.ok(html.includes(`data-composition-id="${chalk.compositionId(fixture.job.video_slug)}"`));
    assert.ok(html.includes(`window.__timelines["${fixture.job.video_slug}"]`));
    assert.ok(html.includes("gsap.timeline({ paused: true })"));
    assert.ok(!/repeat:\s*-1|Math\.random|Date\.now|requestAnimationFrame/u.test(html));
    assert.ok(html.includes("assets/audio/bgm.mp3"));
    fixture.manifest.scenes.forEach((scene, i) => {
      const vo = `assets/vo/${chalk.voPrefix}-${i + 1}.mp3`;
      assert.ok(html.includes(`src="${vo}" data-start="${scene.start_seconds}" data-duration="${scene.duration_seconds}"`), `VO ${i + 1} keeps measured timing`);
      assert.ok(fs.existsSync(path.join(result.video_dir, vo)));
      assert.ok(html.includes(`id="overlay-${i + 1}"`));
    });
    assert.ok(html.includes("Suwałki-Lücke") && html.includes("KALININGRAD") && html.includes("POLEN"));
    assert.equal(meta.type, "chalk");
    assert.equal(meta.chalkConfig.mapType, "theater");
    assert.equal(meta.chalkConfig.scenes.length, 12);
    assert.equal(meta.chalkConfig.scenes[3].start, fixture.manifest.scenes[3].start_seconds);
    const last = fixture.manifest.scenes.at(-1);
    assert.equal(meta.duration, Math.ceil(last.start_seconds + last.duration_seconds + 1.2));
    assert.ok(html.includes(`data-duration="${meta.duration}"`));
    assert.equal(fs.readdirSync(path.join(result.video_dir, "assets", "images")).length, 0, "no AI images");
    // Rebuild is byte-identical (deterministic layout/camera).
    await buildNativeVideoProject(fixture);
    assert.equal(fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8"), html);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildNativeVideoProject uses the deterministic fallback when the script has no chalk extras", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-chalk-fb-"));
  try {
    const fixture = createChalkFixture(root);
    const result = await buildNativeVideoProject(fixture);
    const meta = JSON.parse(fs.readFileSync(path.join(result.video_dir, "meta.json"), "utf8"));
    assert.equal(meta.chalkConfig.mapType, "theater");
    assert.ok(meta.chalkConfig.scenes.every((scene) => scene.highlights.length === 1));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildHtml rejects invalid extras instead of drawing unknown geometry", async () => {
  const scenes = timedScenes().map((scene, i) => ({ ...scene, index: i + 1, id: `scene-${i + 1}`, start: scene.start_seconds, duration: scene.duration_seconds, voSrc: `assets/vo/scene-${i + 1}.mp3` }));
  const extras = structuredClone(KALININGRAD_EXTRAS);
  extras.scenes[0].highlights[0].region = "narnia";
  await assert.rejects(() => chalk.buildHtml({
    slug: "x", lang: "de", totalDuration: 60, extras, scenes, cinemaAudioHtml: "", bgmSegments: [],
    common: { topicTitle: "T", watermark: "W", fullScriptHtml: "" },
  }), /narnia/);
});
