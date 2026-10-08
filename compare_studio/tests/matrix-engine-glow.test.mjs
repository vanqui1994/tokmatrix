import test from "node:test";
import assert from "node:assert/strict";
import glow, { POSES, FACES, PROPS, skinFor, layoutScene } from "../matrix/render/engines/glow.mjs";
import { extendedEngine } from "../matrix/render/engines/index.mjs";
import { RENDERABLE_ENGINES } from "../matrix/render/native-engine-adapter.mjs";

const LINES = [
  "Five signs someone secretly likes you.",
  "They remember tiny details you mentioned weeks ago.",
  "Their feet point toward you, even when their face looks away.",
  "They get a little nervous around you.",
  "Follow for more quiet psychology.",
];

function ctx(lang = "en", extras = null, channelId = "dark_psychology_t1") {
  let t = 0;
  const scenes = LINES.map((line, i) => {
    const duration = 3.4 + (i % 2);
    const scene = { scene_index: i + 1, index: i + 1, id: `scene-${i + 1}`, start: t, duration, line, visual_intent: line, voSrc: `assets/vo/glow-${i + 1}.mp3` };
    t += duration + 0.3;
    return scene;
  });
  return {
    slug: "glow-test", title: "Secret crush", lang, channel: { channel_id: channelId, niche_id: "dark_psychology", publishing: { language: lang } },
    manifest: {}, totalDuration: Math.ceil(t + 1), extras: extras ?? glow.extras.fallback(scenes), sfxCues: [], bgmSegments: [], cinemaAudioHtml: "",
    common: { lang, topicTitle: "Secret crush", fullScriptHtml: "", watermark: "@test" }, scenes,
  };
}

test("glow is a ready TEXT engine, registered and renderable", () => {
  assert.equal(extendedEngine("glow"), glow);
  assert.equal(glow.assetType, "TEXT");
  assert.ok(RENDERABLE_ENGINES.includes("glow"));
});

test("extras: prompt keeps the narration, validation catches bad values, fallback is valid and deterministic", () => {
  const prompt = glow.extras.prompt({ script: { scenes: LINES.map((line) => ({ line })) }, topic: "Crush", language: "de" });
  assert.match(prompt, /do NOT rewrite/);
  const scenes = LINES.map((line) => ({ line }));
  const fb = glow.extras.fallback(scenes);
  assert.deepEqual(glow.extras.validate(fb, scenes), []);
  assert.deepEqual(glow.extras.fallback(scenes), fb);
  assert.equal(fb.scenes.at(-1).pose_a, "wave");
  const bad = structuredClone(fb);
  bad.scenes[0].cast = "trio";
  bad.scenes[1].pose_a = "dance";
  bad.scenes[2].props = ["heart", "music", "phone"];
  bad.scenes[3].title_main = "A VERY LONG TITLE THAT DOES NOT FIT";
  assert.equal(glow.extras.validate(bad, scenes).length, 4);
  const cjk = glow.extras.fallback([{ line: "好きな人の前で緊張してしまう理由" }]);
  assert.ok(!/\s/u.test(cjk.scenes[0].title_main));
});

test("skin per channel is fixed and differs across channels", () => {
  assert.deepEqual(skinFor("a1"), skinFor("a1"));
  const skins = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(skinFor(`ch_${i}`))));
  assert.ok(skins.size > 20);
});

test("layout keeps figures and props inside the stage", () => {
  for (const cast of ["duo", "solo_f", "solo_m"]) {
    const { figs, props } = layoutScene({ cast, pose_a: "wave", face_a: "smile", pose_b: "laugh", face_b: "happy", props: ["heart", "speech"] }, 1);
    for (const f of figs) assert.ok(f.x >= 0 && f.x + 200 * f.s <= 1080, `${cast} figure out of frame`);
    for (const p of props) assert.ok(p.x > 60 && p.x < 1020 && p.y > 60, `${cast} prop out of frame`);
  }
  assert.ok(Object.keys(POSES).length >= 10 && Object.keys(FACES).length >= 5 && Object.keys(PROPS).length >= 15);
});

test("buildHtml: one clip per scene, audio per line, finite seekable timeline, deterministic, refuses vi", async () => {
  const a = await glow.buildHtml(ctx());
  const b = await glow.buildHtml(ctx());
  assert.equal(a.html, b.html);
  assert.equal((a.html.match(/class="clip scene"/gu) || []).length, LINES.length);
  assert.equal((a.html.match(/<audio id="vo-/gu) || []).length, LINES.length);
  assert.match(a.html, /window\.__timelines\["glow-test"\]/u);
  assert.doesNotMatch(a.html, /repeat:\s*-1/u);
  assert.doesNotMatch(a.html, /https?:\/\/(?!www\.w3\.org)/u);
  assert.equal(a.cfg.storyboard_source, "llm");
  const fallbackUsed = await glow.buildHtml(ctx("en", { scenes: [] }));
  assert.equal(fallbackUsed.cfg.storyboard_source, "fallback");
  const other = await glow.buildHtml(ctx("en", null, "other_channel"));
  assert.notEqual(other.cfg.skin.palette + other.cfg.skin.title + other.cfg.skin.caption, a.cfg.skin.palette + a.cfg.skin.title + a.cfg.skin.caption);
  await assert.rejects(glow.buildHtml(ctx("vi")), /de\/en\/ko\/ja/u);
});
