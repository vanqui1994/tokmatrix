// Node.js integration module for CapCut TTS (Text-to-Speech) and STT (Speech-to-Text).
// Wraps tools/capcut-cli.py and provides transparent fallback to Edge TTS.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CLI_PATH = path.join(__dirname, "capcut-cli.py");
const VOICE_JSON_PATH = path.join(__dirname, "capcut_tts_api", "Voice.json");

let _catalogCache = null;

/**
 * Load CapCut voices catalog from Voice.json
 */
export function getCapCutCatalog() {
  if (_catalogCache) return _catalogCache;
  try {
    if (fs.existsSync(VOICE_JSON_PATH)) {
      _catalogCache = JSON.parse(fs.readFileSync(VOICE_JSON_PATH, "utf8"));
      return _catalogCache;
    }
  } catch (err) {
    console.warn("[CapCut TTS] Could not load Voice.json:", err.message);
  }
  return [];
}

/**
 * Check if a given voice ID belongs to CapCut
 */
export function isCapCutVoice(voiceId) {
  if (!voiceId || typeof voiceId !== "string") return false;
  // Edge TTS voices follow pattern: xx-XX-NameNeural (e.g. vi-VN-NamMinhNeural)
  if (voiceId.endsWith("Neural")) return false;
  // Common CapCut voice prefixes
  if (
    voiceId.startsWith("BV") ||
    voiceId.startsWith("multi_") ||
    voiceId.startsWith("vi_") ||
    voiceId.startsWith("DiT_") ||
    voiceId.startsWith("ICL_") ||
    voiceId.startsWith("en_") ||
    voiceId.startsWith("id_")
  ) {
    return true;
  }
  // Check catalog
  const catalog = getCapCutCatalog();
  return catalog.some(
    (v) => v.voice_type === voiceId || v.display_name === voiceId || v.resource_id === voiceId
  );
}

/**
 * Synthesize speech using CapCut API via Python CLI bridge.
 * @param {Object} opts
 * @param {string} opts.text - Text to speak
 * @param {string} opts.voice - CapCut voice_type or display name (e.g. 'BV421_vivn_streaming')
 * @param {string} opts.outPath - Output .mp3 file path
 * @param {number|string} [opts.rate=1.0] - Speech rate (0.5 to 2.0)
 * @param {number} [opts.timeout=35] - Timeout in seconds
 * @returns {Promise<{ success: boolean, duration: number, bytes: number, voice: string, out: string }>}
 */
export async function synthesizeCapCut(opts) {
  const { text, voice, outPath, rate = "1.0", timeout = 35 } = opts;
  if (!text || !text.trim()) throw new Error("text is required for synthesizeCapCut");
  if (!outPath) throw new Error("outPath is required for synthesizeCapCut");

  const targetVoice = voice || "BV421_vivn_streaming";
  const absOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  const args = [
    CLI_PATH,
    "tts",
    "--text",
    text,
    "--voice",
    targetVoice,
    "--rate",
    String(rate),
    "--out",
    absOut,
    "--timeout",
    String(timeout),
  ];

  const { stdout, stderr } = await execFileAsync("python3", args, {
    cwd: REPO_ROOT,
    timeout: (timeout + 10) * 1000,
  });

  try {
    const res = JSON.parse(stdout.trim());
    if (!res.success) throw new Error(res.error || "CapCut TTS failed");
    return res;
  } catch (err) {
    if (stderr && stderr.includes("CapCut")) {
      throw new Error(`CapCut TTS error: ${stderr.trim()}`);
    }
    throw err;
  }
}

/**
 * Transcribe media file to subtitles using CapCut STT.
 * @param {string} filePath - Path to audio/video file
 * @param {string} [lang="vi-VN"] - Audio language
 * @param {string} [outPath] - Optional JSON output path
 */
export async function transcribeCapCut(filePath, lang = "vi-VN", outPath = null) {
  const absFile = path.resolve(filePath);
  if (!fs.existsSync(absFile)) throw new Error(`File not found: ${absFile}`);

  const args = [CLI_PATH, "stt", "--file", absFile, "--lang", lang];
  if (outPath) {
    args.push("--out", path.resolve(outPath));
  }

  const { stdout } = await execFileAsync("python3", args, {
    cwd: REPO_ROOT,
    timeout: 150 * 1000,
  });

  return JSON.parse(stdout.trim());
}

/**
 * Get curated CapCut voices for UI & generation
 */
export function getCuratedCapCutVoices(langCode = "vi") {
  const catalog = getCapCutCatalog();
  const normalized = (langCode || "vi").toLowerCase().split("-")[0];

  const langMap = {
    vi: "vi-VN",
    en: "en-US",
    de: "de-DE",
    fr: "fr-FR",
    ja: "ja-JP",
    ko: "ko-KR",
    es: "es-ES",
    th: "th-TH",
    id: "id-ID",
    zh: "zh-CN",
  };

  const targetLang = langMap[normalized] || "vi-VN";
  return catalog
    .filter((v) => (v.lang && v.lang.toLowerCase() === targetLang.toLowerCase()) || (v.lan && v.lan.toLowerCase() === normalized))
    .map((v) => ({
      id: v.voice_type,
      name: `${v.display_name} (CapCut)`,
      provider: "capcut",
      gender: v.display_name.toLowerCase().includes("nữ") || v.display_name.toLowerCase().includes("cô") || v.display_name.toLowerCase().includes("gái") || v.display_name.toLowerCase().includes("female") ? "female" : "male",
      desc: `CapCut 🎬 · ${v.display_name}`,
      resourceId: v.resource_id,
    }));
}
