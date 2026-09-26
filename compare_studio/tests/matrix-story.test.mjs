import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateAngles } from "../matrix/planner/angle-generator.mjs";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";
import { buildBlueprintOutline } from "../matrix/story/blueprint-engine.mjs";
import { estimateLineDurationSeconds, generateScript } from "../matrix/story/script-generator.mjs";
import { checkScriptQuality } from "../matrix/qa/script-qa.mjs";

const configDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config");
const angleFixtures = Array.from({ length: 10 }, (_, index) => ({
  title: `Angle ${index + 1}`,
  angle: `Central perspective ${index + 1}`,
  hook: `Opening hook ${index + 1}`,
  evidence_set: [`Evidence source family ${index + 1}`],
  narrative_structure: [`Narrative order ${index + 1}`, "context", `payoff ${index + 1}`],
  hook_type: `hook_${index + 1}`,
}));

test("angle generator produces up to ten distinct angle, hook, evidence and structure sets without network access", async () => {
  let receivedPrompt = "";
  const angles = await generateAngles("Bí ẩn Tam giác quỷ Bermuda", {
    maxCount: 10,
    provider: async ({ userPrompt }) => {
      receivedPrompt = userPrompt;
      return { angles: angleFixtures };
    },
  });
  assert.equal(angles.length, 10);
  assert.equal(new Set(angles.map((item) => item.angle)).size, 10);
  assert.equal(new Set(angles.map((item) => item.hook)).size, 10);
  assert.match(receivedPrompt, /separate known facts from hypotheses/i);
  await assert.rejects(() => generateAngles("test", {
    provider: async () => ({ angles: [angleFixtures[0], angleFixtures[0]] }),
  }), /duplicates/);
});

test("template selector respects niche compatibility across ten configured channels", () => {
  const mystery = resolveChannelsForTopic("unsolved_mysteries", 10, { configDir });
  const space = resolveChannelsForTopic("deep_space", 10, { configDir });
  assert.equal(mystery.length, 10);
  assert.equal(space.length, 10);
  assert.equal(new Set(mystery.map((item) => item.channel_id)).size, 10);
  assert.ok(mystery.every((item) => item.niche_id === "unsolved_mysteries" && item.compatibility_score >= 0.55));
  assert.ok(space.every((item) => item.niche_id === "deep_space" && item.compatibility_score >= 0.55));
  assert.ok(new Set(space.map((item) => item.channel_id)).size === 10);
});

test("blueprint story plan allocates requested beats and estimates each line independently", async () => {
  const blueprint = fs.readFileSync(path.join(configDir, "blueprints", "science_explainer.yaml"), "utf8");
  assert.match(blueprint, /blueprint_id: science_explainer/);
  const channel = resolveChannelsForTopic("deep_space", 1, { configDir })[0].resolved_config.channel;
  const angle = angleFixtures[0];
  angle.angle_id = "angle_01";
  const outline = buildBlueprintOutline({
    blueprint: {
      blueprint_id: "science_explainer",
      name: "Science Explainer",
      beats: [
        { id: "impossible_question", purpose: "Question the assumption" },
        { id: "scale_comparison", purpose: "Make scale tangible" },
        { id: "underlying_mechanism", purpose: "Explain the cause" },
        { id: "cosmic_consequence", purpose: "Show the consequence" },
        { id: "mind_blown_fact", purpose: "End on a grounded fact" },
      ],
    },
    angle,
    targetDurationSeconds: 52,
    pacingBeats: channel.story.pacing_beats,
  });
  assert.equal(outline.beats.reduce((sum, beat) => sum + beat.scene_count, 0), 12);
  assert.ok(new Set(outline.beats.map((beat) => beat.scene_count)).size > 1);

  const script = await generateScript({
    topic: "Black holes",
    angle,
    channel: { ...channel, channel_id: "space_01", config_version: 1, publishing: { language: "vi" } },
    outline,
    provider: async () => ({
      title: "Một góc nhìn về hố đen",
      scenes: Array.from({ length: 12 }, (_, index) => ({
        line: index === 0 ? "Vì sao ánh sáng không thoát?" : index % 2 ? "Một câu ngắn để giải thích cơ chế." : "Một câu dài hơn để dẫn dắt bằng chứng và hệ quả khoa học.",
        visual_intent: `Original visual for scene ${index + 1}`,
      })),
    }),
  });
  assert.equal(script.scenes.length, 12);
  assert.ok(script.scenes.every((scene) => scene.estimated_duration_seconds > 0));
  assert.ok(script.scenes[0].estimated_duration_seconds <= 3);
  assert.equal(checkScriptQuality({ script, channel: { ...channel, channel_id: "space_01" } }).status, "PASS");
  assert.ok(new Set(script.scenes.map((scene) => scene.estimated_duration_seconds)).size > 1);
  assert.notEqual(estimateLineDurationSeconds("Một câu dài hơn nhiều để kể rõ cơ chế khoa học."), estimateLineDurationSeconds("Câu ngắn."));
});

test("angle and script prompts name the channel's output language instead of a bare code", async () => {
  let anglePrompt = "";
  await generateAngles("Black holes", {
    maxCount: 1,
    language: "de",
    provider: async ({ userPrompt }) => {
      anglePrompt = userPrompt;
      return { angles: [angleFixtures[0]] };
    },
  });
  assert.match(anglePrompt, /German \(de\) only/);
  assert.doesNotMatch(anglePrompt, /Do NOT reuse/);
  await generateAngles("Black holes", {
    maxCount: 1,
    avoid: ["Hố đen nuốt ánh sáng — Ánh sáng đi đâu?", "", "Hố đen nuốt ánh sáng — Ánh sáng đi đâu?"],
    provider: async ({ userPrompt }) => {
      anglePrompt = userPrompt;
      return { angles: [angleFixtures[0]] };
    },
  });
  assert.match(anglePrompt, /Do NOT reuse or paraphrase/);
  assert.equal(anglePrompt.split("- Hố đen nuốt ánh sáng").length - 1, 1);
  await assert.rejects(() => generateAngles("Black holes", { language: "xx", provider: async () => ({ angles: [] }) }), /unsupported output language/);

  const channel = resolveChannelsForTopic("deep_space", 1, { configDir })[0].resolved_config.channel;
  const angle = { ...angleFixtures[1], angle_id: "angle_02" };
  const outline = buildBlueprintOutline({
    blueprint: { blueprint_id: "b", name: "B", beats: [{ id: "a", purpose: "Nêu câu hỏi" }, { id: "b", purpose: "Giải thích" }, { id: "c", purpose: "Kết luận" }] },
    angle, targetDurationSeconds: 30, pacingBeats: 3,
  });
  let scriptPrompt = "";
  await generateScript({
    topic: "Black holes",
    angle,
    channel: { ...channel, channel_id: "space_01", config_version: 1, publishing: { language: "de" } },
    outline,
    provider: async ({ userPrompt }) => {
      scriptPrompt = userPrompt;
      return { title: "Schwarze Löcher", scenes: outline.beats.flatMap((beat) => Array.from({ length: beat.scene_count }, () => ({ line: "Wohin verschwindet Licht?", visual_intent: "A dark disc" }))) };
    },
  });
  assert.match(scriptPrompt, /^Write a German script/);
  assert.match(scriptPrompt, /German \(de\) only/);
});

test("angle sets larger than one call are generated in rounds that avoid earlier angles", async () => {
  const { generateAngleSet } = await import("../matrix/planner/angle-generator.mjs");
  const prompts = [];
  let serial = 0;
  const make = (n) => ({
    title: `T${n}`, angle: `Angle ${n}`, hook: `Hook ${n}?`, evidence_set: [`e${n}`],
    narrative_structure: [`s${n}`, `end${n}`], hook_type: `h${n}`,
  });
  const provider = async ({ userPrompt }) => {
    prompts.push(userPrompt);
    const count = Number(userPrompt.match(/Return exactly (\d+) angles/)[1]);
    // Lượt 2 trả lại một angle trùng lượt 1 → phải bị bỏ và bù ở lượt 3.
    const items = Array.from({ length: count }, () => make(++serial));
    if (prompts.length === 2) items[0] = make(1);
    return { angles: items };
  };
  const angles = await generateAngleSet("Black holes", { count: 13, provider });
  assert.equal(angles.length, 13);
  assert.equal(new Set(angles.map((a) => a.angle)).size, 13);
  assert.deepEqual(angles.map((a) => a.angle_id).slice(-2), ["angle_12", "angle_13"]);
  assert.equal(prompts.length, 3);
  assert.match(prompts[0], /Return exactly 10 angles/);
  assert.match(prompts[1], /Return exactly 3 angles/);
  assert.match(prompts[1], /- Angle 1 — Hook 1\?/);
  await assert.rejects(generateAngleSet("x", { count: 3, provider: async () => ({ angles: [make(999)] }) }), /distinct angles/);
});

test("invalid structured output is repaired once with the exact problems, then rejected", async () => {
  const angle = { ...angleFixtures[1], angle_id: "angle_02" };
  const outline = buildBlueprintOutline({
    blueprint: { blueprint_id: "b", name: "B", beats: [{ id: "a", purpose: "Hỏi" }, { id: "b", purpose: "Giải thích" }, { id: "c", purpose: "Kết" }] },
    angle, targetDurationSeconds: 30, pacingBeats: 3,
  });
  const good = { title: "T", scenes: outline.beats.flatMap((beat) => Array.from({ length: beat.scene_count }, () => ({ beat_id: beat.beat_id, line: "Ánh sáng đi đâu?", visual_intent: "Đĩa tối" }))) };
  const calls = [];
  const channel = { channel_id: "space_01", config_version: 1, publishing: { language: "vi" } };
  const script = await generateScript({
    topic: "Hố đen", angle, channel, outline,
    provider: async (request) => {
      calls.push(request);
      return calls.length === 1 ? { title: "T", scenes: good.scenes.slice(1) } : good;
    },
  });
  assert.equal(script.scenes.length, outline.scene_count);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].responseSchema.properties.scenes.minItems, outline.scene_count);
  assert.equal(calls[1].temperature, 0);
  assert.match(calls[1].userPrompt, new RegExp(`return exactly ${outline.scene_count} scenes \\(got ${outline.scene_count - 1}\\)`));

  await assert.rejects(
    generateScript({ topic: "Hố đen", angle, channel, outline, provider: async () => ({ title: "T", scenes: [] }) }),
    /script is invalid after repair/,
  );

  let angleCalls = 0;
  const angles = await generateAngles("Hố đen", {
    maxCount: 2,
    provider: async ({ userPrompt }) => {
      angleCalls += 1;
      return angleCalls === 1
        ? { angles: [angleFixtures[0], angleFixtures[0]] }
        : (assert.match(userPrompt, /angle 2 duplicates or omits angle/), { angles: [angleFixtures[0], angleFixtures[1]] });
    },
  });
  assert.equal(angles.length, 2);
  assert.equal(angleCalls, 2);
});
