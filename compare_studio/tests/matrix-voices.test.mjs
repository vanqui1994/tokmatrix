// Bước 7 docs/PLAN_compare_per_country.md: mỗi ngôn ngữ dùng hết giọng kể chuyện, không giọng nào chiếm quá phần chia đều.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { assignVoices, narrationPool, planVoices, voiceSpread } from "../tools/assign-voices.mjs";
import { getVoice } from "../tools/voices.mjs";

const CHANNEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config/channels");

test("repo channel configs already use every narration voice of their language, evenly", () => {
  const { rows } = planVoices();
  assert.deepEqual(rows.filter((row) => row.status !== "kept").map((row) => row.channel_id), []);
  // Kênh có creative.variant_id giữ giọng của Voice DNA (plan đã duyệt) và không nằm trong phép chia này; mỗi kênh như vậy
  // có thể để trống tối đa một giọng mà nó đã rời đi.
  const dnaChannels = {};
  for (const name of fs.readdirSync(CHANNEL_DIR).filter((f) => f.endsWith(".yaml"))) {
    const data = YAML.parse(fs.readFileSync(path.join(CHANNEL_DIR, name), "utf8"));
    if (data.creative?.variant_id) dnaChannels[data.publishing.language] = (dnaChannels[data.publishing.language] || 0) + 1;
  }
  for (const [lang, spread] of Object.entries(voiceSpread(rows))) {
    const pool = narrationPool(lang);
    const total = Object.values(spread).reduce((a, b) => a + b, 0);
    const cap = Math.ceil(total / pool.length);
    const unused = pool.filter((voice) => !spread[voice]);
    if (total >= pool.length) assert.ok(unused.length <= (dnaChannels[lang] || 0), `${lang} leaves voices unused: ${unused.join(", ")}`);
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
  // Mỗi niche (8 kênh) nhận giọng khác nhau tới khi hết giọng: min(số kênh, số giọng của ngôn ngữ).
  for (const [niche, voices] of Object.entries(perNiche)) {
    const size = first.filter((row) => row.niche === niche).length;
    assert.equal(voices.size, Math.min(size, pool.length));
  }
  const again = assignVoices(first.map((row) => ({ ...row, voice: row.voice })));
  assert.ok(again.every((row) => row.status === "kept"));
});

test("character, cloned-person and copyrighted CapCut voices never enter a narration pool", async () => {
  const { isCharacterVoice, COUNTRIES } = await import("../tools/voices.mjs");
  for (const id of ["en_male_deadpool", "ICL_jp_female_hatunemiku", "ICL_en_male_317M_BrianJW", "en_female_caroline_clone2", "ICL_en_female_ditie_dsp"]) {
    assert.ok(isCharacterVoice(id), id);
  }
  assert.ok(!isCharacterVoice("BV029_streaming"));
  for (const country of COUNTRIES) {
    for (const id of narrationPool(country.code)) assert.ok(!isCharacterVoice(id), `${country.code}: ${id} is a character voice`);
  }
});
