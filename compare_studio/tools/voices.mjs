// Shared language and TTS voice definitions for the series.
// Supports both Microsoft Edge TTS and CapCut API TTS (viral TikTok voices).
// Supports: vi, en, de, fr, ja, ko, es, zh (male & female voices).

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { EdgeTTS } from "edge-tts-universal";
import { synthesizeCapCut, isCapCutVoice } from "./capcut-tts.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const COUNTRIES = [
  {
    code: "vi",
    country: "Việt Nam",
    flag: "🇻🇳",
    langName: "Tiếng Việt",
    defaultVoice: "vi-VN-NamMinhNeural",
    voices: [
      // Edge TTS Neural
      { id: "vi-VN-NamMinhNeural", name: "Nam Minh", provider: "edge", gender: "male", desc: "Nam · Chuẩn Hà Nội, truyền cảm" },
      { id: "vi-VN-HoaiMyNeural", name: "Hoài My", provider: "edge", gender: "female", desc: "Nữ · Nhẹ nhàng, tự nhiên" },

      // CapCut Viral Voices
      { id: "BV421_vivn_streaming", name: "Nhỏ Ngọt Ngào (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Nữ ngọt ngào, viral TikTok" },
      { id: "BV074_streaming", name: "Cô Gái Hoạt Ngôn (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Nữ hoạt ngôn, kể chuyện cuốn hút" },
      { id: "BV075_streaming", name: "Thanh Niên Tự Tin (CapCut)", provider: "capcut", gender: "male", desc: "CapCut 🎬 · Nam hiện đại, tự tin, năng động" },
      { id: "multi_male_felipe_uranus_bigtts", name: "Giọng Nam Trầm (CapCut)", provider: "capcut", gender: "male", desc: "CapCut 🎬 · Nam trầm ấm, hồ sơ tài liệu" },
      { id: "multi_female_richgirl_uranus_bigtts", name: "Review Phim (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Nữ review phim TikTok hot" },
      { id: "multi_female_quanweinv_uranus_bigtts", name: "Bản Tin Nữ (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Nữ phát thanh viên tin tức" },
      { id: "BV074_streaming_dsp", name: "Giọng Bé (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Hoạt hình trẻ em, dễ thương", narration: false },
      { id: "vi_female_huong", name: "Giọng Nữ Phổ Thông (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Nữ phổ thông, rõ ràng" },
      { id: "BV075_streaming_demon_dsp", name: "Kenny Đại Đế (CapCut)", provider: "capcut", gender: "male", desc: "CapCut 🎬 · Nam hài hước, hiệu ứng biến giọng", narration: false },
      { id: "BV075_streaming_robot_dsp", name: "Robot VN (CapCut)", provider: "capcut", gender: "male", desc: "CapCut 🎬 · Giọng robot công nghệ", narration: false },
    ],
  },
  {
    code: "en",
    country: "Hoa Kỳ / Toàn cầu",
    flag: "🇺🇸",
    langName: "English (US)",
    defaultVoice: "en-US-AndrewNeural",
    voices: [
      // Edge TTS Neural
      { id: "en-US-AndrewNeural", name: "Andrew", provider: "edge", gender: "male", desc: "Male · Warm, confident narrator" },
      { id: "en-US-AvaNeural", name: "Ava", provider: "edge", gender: "female", desc: "Female · Natural, engaging voice" },
      { id: "en-US-BrianNeural", name: "Brian", provider: "edge", gender: "male", desc: "Male · Casual, approachable" },
      { id: "en-US-EmmaNeural", name: "Emma", provider: "edge", gender: "female", desc: "Female · Cheerful, clear" },
      { id: "en-US-ChristopherNeural", name: "Christopher", provider: "edge", gender: "male", desc: "Male · Authoritative documentary" },
      { id: "en-US-EricNeural", name: "Eric", provider: "edge", gender: "male", desc: "Male · Rational, calm" },
      { id: "en-US-GuyNeural", name: "Guy", provider: "edge", gender: "male", desc: "Male · Passionate newscaster" },
      { id: "en-US-JennyNeural", name: "Jenny", provider: "edge", gender: "female", desc: "Female · Friendly, considerate" },
      { id: "en-US-MichelleNeural", name: "Michelle", provider: "edge", gender: "female", desc: "Female · Pleasant, steady" },
      { id: "en-US-RogerNeural", name: "Roger", provider: "edge", gender: "male", desc: "Male · Lively storyteller" },
      { id: "en-US-SteffanNeural", name: "Steffan", provider: "edge", gender: "male", desc: "Male · Measured explainer" },
      { id: "en-US-AriaNeural", name: "Aria", provider: "edge", gender: "female", desc: "Female · Confident, positive" },

      // CapCut Viral Voices
      { id: "BV510_streaming", name: "English Narrator (CapCut)", provider: "capcut", gender: "male", desc: "CapCut 🎬 · Clear explainer & essay" },
      { id: "en_female_emotional_moon_bigtts", name: "Emotional Storyteller (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Expressive cinematic drama" },
      { id: "en_female_janeamber_mars_bigtts", name: "Janeamber (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Warm corporate podcast" },
      { id: "en_us_006", name: "EN US 2 (CapCut)", provider: "capcut", gender: "male", desc: "CapCut 🎬 · Energetic & commercial" },
      { id: "en_us_002", name: "EN US (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Natural TikTok voice" },
    ],
  },
  {
    code: "de",
    country: "Đức (Deutschland)",
    flag: "🇩🇪",
    langName: "Deutsch",
    defaultVoice: "de-DE-ConradNeural",
    voices: [
      { id: "de-DE-ConradNeural", name: "Conrad", provider: "edge", gender: "male", desc: "Männlich · Klar und sachlich" },
      { id: "de-DE-KatjaNeural", name: "Katja", provider: "edge", gender: "female", desc: "Weiblich · Freundlich und lebendig" },
      { id: "de-DE-AmalaNeural", name: "Amala", provider: "edge", gender: "female", desc: "Weiblich · Warm und ruhig" },
      { id: "de-DE-KillianNeural", name: "Killian", provider: "edge", gender: "male", desc: "Männlich · Jung und direkt" },
      { id: "de-DE-FlorianMultilingualNeural", name: "Florian", provider: "edge", gender: "male", desc: "Männlich · Erzähler, natürlich" },
      { id: "de-DE-SeraphinaMultilingualNeural", name: "Seraphina", provider: "edge", gender: "female", desc: "Weiblich · Erzählerin, ausdrucksvoll" },
      { id: "DiT_de_male_koubo", name: "Koubo (CapCut)", provider: "capcut", gender: "male", desc: "CapCut 🎬 · Männlich, natürlich" },
      { id: "DiT_de_female_qingsong", name: "Sanfte Führerin (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Weiblich, sanft" },
    ],
  },
  {
    code: "fr",
    country: "Pháp (France)",
    flag: "🇫🇷",
    langName: "Français",
    defaultVoice: "fr-FR-HenriNeural",
    voices: [
      { id: "fr-FR-HenriNeural", name: "Henri", provider: "edge", gender: "male", desc: "Masculin · Posé et expressif" },
      { id: "fr-FR-DeniseNeural", name: "Denise", provider: "edge", gender: "female", desc: "Féminin · Élégant et mélodieux" },
      { id: "DiT_fr_female_soothing", name: "Douce (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · Féminin, douce et chaleureuse" },
      { id: "DiT_fr_male_wit", name: "Wit (CapCut)", provider: "capcut", gender: "male", desc: "CapCut 🎬 · Masculin, vivant et dynamique" },
    ],
  },
  {
    code: "ja",
    country: "Nhật Bản (日本)",
    flag: "🇯🇵",
    langName: "日本語",
    defaultVoice: "ja-JP-KeitaNeural",
    voices: [
      { id: "ja-JP-KeitaNeural", name: "Keita (啓太)", provider: "edge", gender: "male", desc: "男性 · 明瞭で落ち着いた語り" },
      { id: "ja-JP-NanamiNeural", name: "Nanami (七海)", provider: "edge", gender: "female", desc: "女性 · 明るく親しみやすい" },
      { id: "ICL_ja_female_zhiyu", name: "Lovely Idol (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · 女性, アイドル風・可愛い", narration: false },
      { id: "ICL_jp_male_wutiaowu", name: "クールな青年 (CapCut)", provider: "capcut", gender: "male", desc: "CapCut 🎬 · 男性, アニメ風クール", narration: false },
      { id: "ICL_ja_male_xinggan", name: "Xinggan (CapCut)", provider: "capcut", gender: "male", desc: "CapCut 🎬 · 男性, 低音ドキュメンタリー" },
      { id: "ICL_ja_female_narrator", name: "Narrator (CapCut)", provider: "capcut", gender: "female", desc: "CapCut 🎬 · 女性, ナレーション" },
    ],
  },
  {
    code: "ko",
    country: "Hàn Quốc (대한민국)",
    flag: "🇰🇷",
    langName: "한국어",
    defaultVoice: "ko-KR-InJoonNeural",
    voices: [
      { id: "ko-KR-InJoonNeural", name: "InJoon (인준)", provider: "edge", gender: "male", desc: "남성 · 신뢰감 있는 또렷한 목소리" },
      { id: "ko-KR-SunHiNeural", name: "SunHi (선희)", provider: "edge", gender: "female", desc: "여성 · 밝고 자연스러운 음성" },
      { id: "ko-KR-HyunsuMultilingualNeural", name: "Hyunsu (현수)", provider: "edge", gender: "male", desc: "남성 · 차분한 내레이션" },
    ],
  },
];

export const VOICE_MAP = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.defaultVoice])
);

export function getCountry(code) {
  return COUNTRIES.find((c) => c.code === (code || "").toLowerCase()) || COUNTRIES[1]; // default en
}

export function getDefaultVoice(lang) {
  return getCountry(lang).defaultVoice;
}

export function getVoice(voiceId) {
  for (const c of COUNTRIES) {
    const v = c.voices.find((x) => x.id === voiceId);
    if (v) return { ...v, lang: c.code, country: c.country, flag: c.flag };
  }
  return null;
}

/**
 * Measure mp3 duration via ffprobe
 */
export async function probeDuration(mp3Path) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    mp3Path,
  ]);
  const dur = Number.parseFloat(stdout.trim());
  if (Number.isNaN(dur)) throw new Error("ffprobe error: " + stdout);
  return dur;
}

/**
 * Synthesize speech with Edge TTS
 */
export async function synthesizeEdge(opts) {
  const { text, voice, outPath, rate = "+15%" } = opts;
  const rateStr = typeof rate === "number" ? `${rate > 1 ? "+" : ""}${Math.round((rate - 1) * 100)}%` : String(rate);

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const tts = new EdgeTTS(text, voice, { rate: rateStr.startsWith("+") || rateStr.startsWith("-") ? rateStr : `+${rateStr}` });
      const result = await tts.synthesize();
      const audioBuffer = Buffer.from(await result.audio.arrayBuffer());
      if (audioBuffer.length === 0) throw new Error("empty audio buffer");
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, audioBuffer);
      return { success: true, bytes: audioBuffer.length, provider: "edge" };
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
}

/**
 * Universal TTS Synthesizer:
 * Automatically routes to CapCut TTS or Edge TTS based on voice ID, with transparent cross-fallback.
 */
export async function synthesizeAudio(opts) {
  const { text, voice, outPath, rate = "1.0", lang = "vi" } = opts;
  const isCapCut = isCapCutVoice(voice);

  if (isCapCut) {
    try {
      const res = await synthesizeCapCut({ text, voice, outPath, rate: String(rate) });
      return { ...res, provider: "capcut" };
    } catch (capErr) {
      console.warn(`[TTS] CapCut error for voice "${voice}": ${capErr.message}. Falling back to Edge TTS...`);
      const fallbackVoice = getDefaultVoice(lang);
      const res = await synthesizeEdge({ text, voice: fallbackVoice, outPath, rate: "+15%" });
      return { ...res, fallbackFrom: voice, provider: "edge" };
    }
  } else {
    try {
      const res = await synthesizeEdge({ text, voice, outPath, rate: "+15%" });
      return { ...res, provider: "edge" };
    } catch (edgeErr) {
      console.warn(`[TTS] Edge TTS error for voice "${voice}": ${edgeErr.message}. Falling back to CapCut...`);
      const capcutFallback = "BV421_vivn_streaming";
      const res = await synthesizeCapCut({ text, voice: capcutFallback, outPath, rate: "1.0" });
      return { ...res, fallbackFrom: voice, provider: "capcut" };
    }
  }
}
