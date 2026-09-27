#!/usr/bin/env node
// Thử giọng CapCut ứng viên (tools/capcut_tts_api/Voice.json, chưa đăng ký trong voices.mjs) trước khi cho Voice DNA gán:
//   1. tổng hợp một câu mẫu đúng ngôn ngữ (CapCut TTS),
//   2. nhận dạng lại bằng CapCut STT với locale của ngôn ngữ đó,
//   3. pass khi file có tiếng (≥ 1.2 s) và ≥ 60% token của câu mẫu xuất hiện lại trong bản nhận dạng.
// Chạy trên máy có mạng tới CapCut (container cloud bị chặn). Không đụng config kênh.
//
//   node tools/audition-voices.mjs --langs de,ja,en [--limit 10] [--out /tmp/aud]        # chỉ báo cáo
//   node tools/audition-voices.mjs --langs de,ja,en --apply                               # ghi config/voices/capcut_auditioned.json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthesizeCapCut, transcribeCapCut } from "./capcut-tts.mjs";
import { AUDITIONED_VOICES_FILE, COUNTRIES, probeDuration } from "./voices.mjs";
import { voicesJson } from "./list-variants.mjs";

export const SAMPLE_LINES = {
  en: "Nobody knows what really happened on the mountain that night.",
  de: "Niemand weiß, was in dieser Nacht auf dem Berg wirklich geschah.",
  ja: "あの夜、山で本当に何が起きたのか、誰も知らない。",
  ko: "그날 밤 산에서 무슨 일이 있었는지 아무도 모른다.",
  fr: "Personne ne sait ce qui s'est vraiment passé cette nuit-là.",
  vi: "Không ai biết điều gì thực sự đã xảy ra trên núi đêm đó.",
};
const LOCALES = { en: "en-US", de: "de-DE", ja: "ja-JP", ko: "ko-KR", fr: "fr-FR", vi: "vi-VN" };
const CJK = /[぀-ヿ㐀-鿿가-힯]/u;

/** Token để so: CJK theo từng ký tự, còn lại theo từ (bỏ dấu câu, chữ thường). */
export function tokens(text) {
  const clean = String(text || "").toLowerCase().replace(/[\p{P}\p{S}]/gu, " ");
  return CJK.test(clean) ? [...clean.replace(/\s+/gu, "")] : clean.split(/\s+/u).filter(Boolean);
}

export function recallScore(expected, heard) {
  const want = tokens(expected);
  const got = new Set(tokens(heard));
  if (!want.length) return 0;
  return Number((want.filter((t) => got.has(t)).length / want.length).toFixed(3));
}

export function guessGender(id, name) {
  const s = `${id} ${name}`.toLowerCase();
  if (/female|girl|woman|lady|queen|nv\b|女|여/u.test(s)) return "female";
  if (/male|boy|man\b|guy|king|男|남/u.test(s)) return "male";
  return "any";
}

function transcriptText(result) {
  if (!result) return "";
  if (typeof result.text === "string") return result.text;
  const items = result.utterances || result.subtitles || result.segments || result.lines || [];
  return items.map((u) => u.text || u.content || "").join(" ");
}

function args(argv) {
  const out = { langs: ["de", "ja", "en"], limit: Infinity, apply: false, out: path.join(os.tmpdir(), "voice-audition") };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--langs") out.langs = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "--limit") out.limit = Number(argv[++i]);
    else if (key === "--out") out.out = argv[++i];
    else if (key === "--apply") out.apply = true;
    else throw new Error(`unknown argument ${key}`);
  }
  return out;
}

export async function audition(candidate, workDir, { synth = synthesizeCapCut, stt = transcribeCapCut, duration = probeDuration } = {}) {
  const line = SAMPLE_LINES[candidate.lang];
  const file = path.join(workDir, `${candidate.id}.mp3`);
  const row = { id: candidate.id, lang: candidate.lang, locale: candidate.locale, name: candidate.name, gender: guessGender(candidate.id, candidate.name) };
  try {
    await synth({ text: line, voice: candidate.id, outPath: file, rate: "1.0" });
    row.seconds = Number((await duration(file)).toFixed(2));
    const heard = transcriptText(await stt(file, LOCALES[candidate.lang]));
    row.heard = heard.slice(0, 160);
    row.recall = recallScore(line, heard);
    row.status = row.seconds >= 1.2 && row.recall >= 0.6 ? "pass" : "fail";
  } catch (error) {
    row.status = "error";
    row.error = String(error.message || error).slice(0, 200);
  }
  return row;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = args(argv);
  fs.mkdirSync(opts.out, { recursive: true });
  const supported = new Set(COUNTRIES.map((c) => c.code));
  const candidates = voicesJson().capcut_candidates.filter((c) => opts.langs.includes(c.lang) && supported.has(c.lang) && SAMPLE_LINES[c.lang]);
  const rows = [];
  for (const candidate of candidates.slice(0, opts.limit)) {
    const row = await audition(candidate, opts.out);
    rows.push(row);
    console.log(`${row.status.padEnd(5)} ${row.lang} ${row.id} ${row.recall ?? ""} ${row.error || ""}`);
  }
  const report = { generated_by: "tools/audition-voices.mjs", sample_lines: SAMPLE_LINES, voices: rows };
  fs.writeFileSync(path.join(opts.out, "audition.json"), JSON.stringify(report, null, 2));
  if (opts.apply) {
    let existing = { voices: [] };
    try { existing = JSON.parse(fs.readFileSync(AUDITIONED_VOICES_FILE, "utf8")); } catch { /* chưa có */ }
    const byId = new Map((existing.voices || []).map((v) => [v.id, v]));
    for (const row of rows) byId.set(row.id, { id: row.id, lang: row.lang, name: row.name, gender: row.gender, status: row.status, recall: row.recall ?? null });
    fs.mkdirSync(path.dirname(AUDITIONED_VOICES_FILE), { recursive: true });
    const voices = [...byId.values()].sort((a, b) => a.lang.localeCompare(b.lang) || a.id.localeCompare(b.id));
    fs.writeFileSync(AUDITIONED_VOICES_FILE, `${JSON.stringify({ generated_by: "tools/audition-voices.mjs --apply", voices }, null, 2)}\n`);
  }
  console.log(JSON.stringify({ out: opts.out, tried: rows.length, pass: rows.filter((r) => r.status === "pass").length, applied: opts.apply }));
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(`[audition-voices] ${error.message}`); process.exitCode = 1; });
}
