#!/usr/bin/env node
// Một câu → file audio bằng giọng của tài khoản (Edge "*Neural" hoặc CapCut), cho bkt_web/muse_remake.py.
//   echo '{"text":"…","voice":"de-DE-ConradNeural","out":"/tmp/a.mp3","speed":1.02,"lang":"de"}' | node tools/tts-line.mjs
// In một dòng JSON {"ok":true,"duration":s,"voice":…,"provider":…}. Giọng lỗi → giọng mặc định CÙNG ngôn ngữ
// (không rơi sang giọng tiếng Việt như synthesizeAudio).
import { getDefaultVoice, probeDuration, synthesizeEdge } from "./voices.mjs";
import { isCapCutVoice, synthesizeCapCut } from "./capcut-tts.mjs";

const input = JSON.parse(await new Promise((resolve) => { let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => resolve(s)); }));
const { text, voice, out, speed = 1, lang = "en" } = input;
const pct = `${Math.round((Number(speed) - 1) * 100) >= 0 ? "+" : ""}${Math.round((Number(speed) - 1) * 100)}%`;

async function speak(v) {
  if (isCapCutVoice(v)) await synthesizeCapCut({ text, voice: v, outPath: out, rate: String(speed) });
  else await synthesizeEdge({ text, voice: v, outPath: out, rate: pct });
  return v;
}

try {
  let used, provider;
  try {
    used = await speak(voice);
    provider = isCapCutVoice(voice) ? "capcut" : "edge";
  } catch (err) {
    console.error(`[tts-line] ${voice}: ${err.message}; dùng giọng mặc định ${lang}`);
    used = await speak(getDefaultVoice(lang));
    provider = "edge";
  }
  console.log(JSON.stringify({ ok: true, duration: await probeDuration(out), voice: used, provider }));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exitCode = 1;
}
