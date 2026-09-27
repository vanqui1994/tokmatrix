import assert from "node:assert/strict";
import test from "node:test";
import { allowedEngines, blockedEngines, fallbackEngine, isComparativeTopic, pickEngine, priorityEngines, resolveChannelsForTopic, topicEngine } from "../matrix/planner/template-selector.mjs";

const channel = (preferred, compat) => ({
  resolved_config: {
    channel: { creative: { preferred_engines: preferred } },
    compatibility: { engines: compat.map(([id, score]) => ({ id, score })) },
  },
});
const renderable = ["mystery", "survival", "kinetic", "vox"];

test("priority engine wins over preferred order when the channel lists it", () => {
  const ch = channel(["mystery", "vox", "survival"], [["mystery", 1], ["vox", 0.9], ["survival", 0.8]]);
  assert.equal(pickEngine(ch, renderable, []).id, "mystery");
  assert.equal(pickEngine(ch, renderable, ["survival"]).id, "survival");
});

test("priority never forces an engine the channel does not list", () => {
  const ch = channel(["mystery", "vox"], [["mystery", 1], ["vox", 0.9], ["survival", 0.99]]);
  assert.equal(pickEngine(ch, renderable, ["survival"]).id, "mystery");
});

test("priority list is read from MATRIX_PRIORITY_ENGINES", () => {
  assert.deepEqual(priorityEngines({ MATRIX_PRIORITY_ENGINES: " Survival, chalk ," }), ["survival", "chalk"]);
  assert.deepEqual(priorityEngines({}), []);
});

test("an A-vs-B topic turns every channel of a compare-enabled niche into compare, other topics never", () => {
  assert.equal(isComparativeTopic("Lion vs Tiger: which big cat is stronger"), true);
  assert.equal(isComparativeTopic("How the Enigma machine was broken"), false);
  // Kênh có creative.variant_id (Creative DNA V2) khoá engine của variant: đề tài "A vs B" không ép nó sang compare.
  const resolved = (niche, topic) => resolveChannelsForTopic(niche, 50, { topic });
  const legacy = (list) => list.filter((c) => !c.resolved_config.channel.creative.variant_id);
  const engines = (niche, topic) => new Set(legacy(resolved(niche, topic)).map((c) => c.engine_type));
  assert.deepEqual([...engines("military_arsenal", "F-22 Raptor vs Su-57: which stealth fighter is better")], ["compare"]);
  for (const c of resolved("military_arsenal", "F-22 Raptor vs Su-57").filter((c) => c.resolved_config.channel.creative.variant_id)) {
    assert.equal(c.engine_type, c.resolved_config.channel.creative.preferred_engines[0], c.channel_id);
  }
  assert.equal(engines("military_arsenal", "How the Enigma machine was broken").has("compare"), false);
  assert.equal(engines("folklore_legends", "Vampire vs Werewolf").has("compare"), false);   // niche không cho phép
});

test("topicEngine needs compare renderable and a niche compare score >= 0.5", () => {
  const ch = { niche_id: "space" };
  assert.equal(topicEngine(ch, "A vs B", ["vox"], { space: 0.5 }), null);
  assert.equal(topicEngine(ch, "A vs B", ["vox", "compare"], { space: 0.5 }).id, "compare");
  assert.equal(topicEngine(ch, "A vs B", ["vox", "compare"], { space: 0.2 }), null);
});

test("compare scores stay below minimum_score so channel config hashes do not change", async () => {
  const { validateConfigs } = await import("../tools/matrix-config-validator.mjs");
  const matrix = validateConfigs({}).documents.compatibility_matrix[0].data;
  for (const niche of matrix.niches) assert.ok(niche.scores.compare < matrix.minimum_score, niche.id);
});

test("blocked engines (MATRIX_BLOCKED_ENGINES) are never picked nor used as fallback", () => {
  const env = { MATRIX_BLOCKED_ENGINES: "science, Kinetic" };
  assert.deepEqual(blockedEngines(env), ["science", "kinetic"]);
  assert.ok(!allowedEngines(env).includes("science") && !allowedEngines(env).includes("kinetic"));
  assert.ok(allowedEngines(env).includes("vox"));
  assert.equal(fallbackEngine(env), "vox");
  assert.equal(fallbackEngine({}), "kinetic");
  const previous = process.env.MATRIX_BLOCKED_ENGINES;
  process.env.MATRIX_BLOCKED_ENGINES = "science,kinetic";
  try {
    for (const niche of ["dark_psychology", "extreme_wildlife", "deep_space", "philosophy_paradox"]) {
      for (const ch of resolveChannelsForTopic(niche, 20)) assert.ok(!["science", "kinetic"].includes(ch.engine_type), `${ch.channel_id} → ${ch.engine_type}`);
    }
  } finally {
    if (previous === undefined) delete process.env.MATRIX_BLOCKED_ENGINES; else process.env.MATRIX_BLOCKED_ENGINES = previous;
  }
});
