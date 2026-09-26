import assert from "node:assert/strict";
import test from "node:test";
import { estimateLineDurationSeconds, generateScript, removeCjkSpaces } from "../matrix/story/script-generator.mjs";

test("Japanese lines lose word-separating spaces the LLM inserted", () => {
  assert.equal(removeCjkSpaces("海は 塩の 塊に ならない。"), "海は塩の塊にならない。");
  assert.equal(removeCjkSpaces("毎年 約 40億トンもの 鉱物塩が 川から 海へ"), "毎年約40億トンもの鉱物塩が川から海へ");
  assert.equal(removeCjkSpaces("NASA の 探査機"), "NASA の探査機");
});

test("CJK duration estimate counts characters, not spaces", () => {
  const spaced = estimateLineDurationSeconds("河川は 40億年もの 長い 間 塩分を 海水へと 流し 続けている。");
  const joined = estimateLineDurationSeconds("河川は40億年もの長い間塩分を海水へと流し続けている。");
  assert.ok(joined > 3, `joined estimate too short: ${joined}`);
  assert.ok(Math.abs(spaced - joined) < 1.2, `${spaced} vs ${joined}`);
  assert.ok(estimateLineDurationSeconds("海は塩の塊にならない。") < 2.8);
});

test("Japanese script prompt measures characters and forbids spaces; output is cleaned", async () => {
  let prompt = "";
  const outline = { scene_count: 2, beats: [{ beat_id: "hook", purpose: "hook", scene_count: 1 }, { beat_id: "body", purpose: "body", scene_count: 1 }] };
  const provider = async ({ userPrompt }) => {
      prompt = userPrompt;
      return { title: "海が 塩の 塊に ならない 理由", scenes: [
        { beat_id: "hook", line: "海は 塩の 塊に ならない。", visual_intent: "ocean" },
        { beat_id: "body", line: "河川は 塩分を 海水へと 流し 続けている。", visual_intent: "river" },
      ] };
  };
  const script = await generateScript({
    topic: "Why the ocean is salty", provider, language: "ja", outline,
    angle: { angle_id: "a1", angle: "x", hook: "y", evidence_set: ["e"], narrative_structure: ["n"] },
    channel: { channel_id: "ocean_mysteries_04", publishing: { language: "ja" }, audio: { voice_speed: 1 } },
  });
  assert.match(prompt, /characters per scene/);
  assert.match(prompt, /NO spaces between words/);
  assert.doesNotMatch(prompt, /8 to 12 words/);
  assert.equal(script.title, "海が塩の塊にならない理由");
  assert.equal(script.scenes[0].line, "海は塩の塊にならない。");
  assert.equal(script.scenes[1].line, "河川は塩分を海水へと流し続けている。");
});
