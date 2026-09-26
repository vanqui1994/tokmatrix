import assert from "node:assert/strict";
import test from "node:test";
import { attachEngineExtras, engineNeedsExtras } from "../matrix/story/engine-extras.mjs";
import { EXTENDED_ENGINES } from "../matrix/render/engines/index.mjs";
import { RENDERABLE_ENGINES } from "../matrix/render/native-engine-adapter.mjs";

function script(count = 12) {
  return {
    title: "Die rätselhaftesten Schiffe der Geschichte",
    topic: "Geisterschiffe",
    scenes: Array.from({ length: count }, (_, i) => ({
      scene_index: i + 1, beat_id: `b${i + 1}`,
      line: i === 0 ? "Wer verschwand hier?" : `Szene ${i + 1} erzählt von einem Schiff ohne Besatzung und offenen Fragen.`,
      visual_intent: `Visual ${i + 1}`,
    })),
  };
}

test("legacy engines never get extras and the script object is untouched", async () => {
  const original = script();
  for (const engine of ["mystery", "kinetic", "science"]) {
    assert.equal(engineNeedsExtras(engine), false);
    const result = await attachEngineExtras({ engineType: engine, script: original, provider: () => { throw new Error("must not call"); } });
    assert.equal(result, original);
  }
});

test("ready extended engines are renderable; LLM extras are stored, failures use the deterministic fallback", async () => {
  const ready = Object.values(EXTENDED_ENGINES).filter((engine) => !engine.pending);
  assert.ok(ready.length >= 1);
  for (const engine of ready) {
    assert.ok(RENDERABLE_ENGINES.includes(engine.id), `${engine.id} should be renderable`);
    const base = script();
    const fallback = engine.extras.fallback(base.scenes, { title: base.title, language: "de" });
    const viaLlm = await attachEngineExtras({ engineType: engine.id, script: base, language: "de", provider: async () => fallback });
    assert.equal(viaLlm.engine_extras.engine, engine.id);
    assert.equal(viaLlm.engine_extras.source, "llm");
    assert.deepEqual(viaLlm.scenes, base.scenes, "narration must not change");
    const logs = [];
    const viaFallback = await attachEngineExtras({
      engineType: engine.id, script: base, language: "de", log: (m) => logs.push(m),
      provider: async () => { throw new Error("quota"); },
    });
    assert.equal(viaFallback.engine_extras.source, "fallback");
    assert.deepEqual(viaFallback.engine_extras.data, fallback);
    assert.match(logs[0], /quota/);
    // Đã có extras thì không gọi lại LLM.
    const again = await attachEngineExtras({ engineType: engine.id, script: viaLlm, provider: () => { throw new Error("must not call"); } });
    assert.equal(again, viaLlm);
  }
});
