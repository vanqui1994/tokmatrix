// Bước 7 docs/PLAN_compare_per_country.md: mỗi ngôn ngữ dùng hết giọng kể chuyện, không giọng nào chiếm quá phần chia đều.
import assert from "node:assert/strict";
import test from "node:test";
import { assignVoices, narrationPool, planVoices, voiceSpread } from "../tools/assign-voices.mjs";
import { getVoice } from "../tools/voices.mjs";

test("repo channel configs already use every narration voice of their language, evenly", () => {
  const { rows } = planVoices();
  assert.deepEqual(rows.filter((row) => row.status !== "kept").map((row) => row.channel_id), []);
  for (const [lang, spread] of Object.entries(voiceSpread(rows))) {
    const pool = narrationPool(lang);
    const total = Object.values(spread).reduce((a, b) => a + b, 0);
    const cap = Math.ceil(total / pool.length);
    if (total >= pool.length) assert.deepEqual(Object.keys(spread).sort(), [...pool].sort(), `${lang} leaves voices unused`);
    for (const [voice, count] of Object.entries(spread)) {
      assert.ok(count <= cap, `${lang} ${voice} has ${count} accounts (cap ${cap})`);
      assert.equal(getVoice(voice)?.lang, lang);
      assert.notEqual(getVoice(voice)?.narration, false, `${voice} is an effect voice`);
    }
  }
});

test("assignment is deterministic, keeps balanced voices and spreads one niche over different voices", () => {
  const channels = Array.from({ length: 24 }, (_, i) => ({ channel_id: `c${String(i).padStart(2, "0")}`, lang: "de", niche: `n${i % 3}`, voice: "de-DE-ConradNeural" }));
  const first = assignVoices(channels);
  assert.deepEqual(assignVoices(channels), first);
  const pool = narrationPool("de");
  const perNiche = {};
  for (const row of first) (perNiche[row.niche] ||= new Set()).add(row.voice);
  for (const voices of Object.values(perNiche)) assert.equal(voices.size, pool.length);
  const again = assignVoices(first.map((row) => ({ ...row, voice: row.voice })));
  assert.ok(again.every((row) => row.status === "kept"));
});
