// tools/auto-sfx.mjs
// Cinema Soundscape Engine:
// 1. Multi-language Semantic Keyword Detection across 6 languages
// 2. Audio Pacing Guard & Priority Arbiter
// 3. HyperFrames Multi-track SFX HTML Tag Generator
// 4. Smart Audio Ducking Segment Calculator (Dynamic BGM Volume Modulation)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SFX_CATALOG, SOUNDSCAPE_PRESETS } from "./soundscapes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SHARED_SFX_DIR = path.join(REPO_ROOT, "shared", "audio", "sfx");

// Multi-language keyword semantic dictionary
const KEYWORD_MAP = {
  deep_boom: [
    // vi
    "bùng nổ", "sụp đổ", "chấn động", "khủng khiếp", "thảm họa", "phá sản", "bi kịch", "cú sốc", "chết người", "sụp", "tiêu vong", "chôn vùi",
    // en
    "boom", "explosion", "disaster", "collapse", "catastrophe", "shock", "bankrupt", "shattering", "crisis", "fatal", "tragic", "obliterate",
    // de
    "katastrophe", "zusammenbruch", "schock", "bankrott", "krise", "explosion", "untergang",
    // fr
    "catastrophe", "effondrement", "choc", "faillite", "crise", "explosion", "tragique",
    // ja
    "大惨事", "崩壊", "破産", "ショック", "危機", "爆発", "破滅",
    // ko
    "재앙", "붕괴", "파산", "충격", "위기", "폭발", "파멸"
  ],
  sub_drop: [
    // vi
    "đột phá", "bản chất", "bí quyết", "quy luật", "tư duy", "chân lý", "sự thật", "tỉnh thức", "vượt trội", "sức mạnh", "ma lực",
    // en
    "breakthrough", "essence", "secret", "reality", "truth", "mindset", "unstoppable", "awakening", "ultimate", "power", "fatal flaw",
    // de
    "durchbruch", "wahrheit", "geheimnis", "essenz", "macht",
    // fr
    "percée", "vérité", "secret", "essence", "pouvoir",
    // ja
    "突破", "真実", "本質", "秘密", "力",
    // ko
    "돌파", "진실", "본질", "비밀", "힘"
  ],
  alarm: [
    // vi
    "nguy hiểm", "cảnh báo", "tử vong", "bức xạ", "nhiễm độc", "báo động", "khẩn cấp", "chết", "nguy kịch", "liều cao", "chết người",
    // en
    "danger", "warning", "lethal", "radiation", "toxic", "emergency", "fatal", "critical", "deadly", "hazard", "poison", "alert",
    // de
    "gefahr", "warnung", "tödlich", "strahlung", "notfall", "giftig",
    // fr
    "danger", "alerte", "mortel", "radiation", "urgence", "toxique",
    // ja
    "危険", "警告", "致死", "放射線", "緊急", "毒",
    // ko
    "위험", "경고", "치명", "방사선", "비상", "독성"
  ],
  heartbeat: [
    // vi
    "nhịp tim", "nghẹt thở", "hồi hộp", "căng thẳng", "nín thở", "sợ hãi", "chờ đợi", "từng giây", "tim đập", "rùng mình",
    // en
    "heartbeat", "breathless", "tension", "suspense", "fear", "countdown", "seconds", "pulse", "hold breath", "anxiety",
    // de
    "herzschlag", "spannung", "angst", "puls", "atemnot",
    // fr
    "battement", "tension", "peur", "pouls", "angoisse",
    // ja
    "鼓動", "心拍", "緊張", "カウントダウン", "恐怖",
    // ko
    "심장", "긴장", "공포", "카운트다운", "불안"
  ],
  camera_shutter: [
    // vi
    "hồ sơ", "tài liệu", "bằng chứng", "chụp lại", "hiện trường", "manh mối", "bí mật", "chứng cứ", "giải mật", "hình ảnh",
    // en
    "document", "evidence", "proof", "photo", "secret", "clue", "classified", "file", "scene", "uncover", "snapshot",
    // de
    "dokument", "beweis", "foto", "geheim", "akte", "hinweis",
    // fr
    "document", "preuve", "photo", "secret", "dossier", "indice",
    // ja
    "文書", "証拠", "写真", "機密", "ファイル", "手がかり",
    // ko
    "문서", "증거", "사진", "비밀", "기밀", "단서"
  ],
  typewriter: [
    // vi
    "ghi chép", "báo cáo", "dòng lệnh", "thống kê", "phán quyết", "điều tra", "nhật ký", "ghi nhận", "bản tin",
    // en
    "type", "report", "stats", "verdict", "investigate", "log", "record", "data", "chronicle", "typewriter",
    // de
    "bericht", "statistik", "protokoll", "daten", "ermittlung",
    // fr
    "rapport", "statistique", "registre", "données", "enquête",
    // ja
    "記録", "報告", "統計", "データ", "調査",
    // ko
    "기록", "보고", "통계", "데이터", "조사"
  ],
  glitch: [
    // vi
    "hack", "ma trận", "thuật toán", "dopamine", "lỗi", "hệ thống", "tê liệt", "quá tải", "vi mạch", "ảo giác", "điện thoại", "lướt",
    // en
    "hack", "matrix", "algorithm", "dopamine", "glitch", "system", "overload", "paralyze", "circuit", "digital", "phone", "scroll",
    // de
    "matrix", "algorithmus", "dopamin", "fehler", "system", "überlastung",
    // fr
    "matrice", "algorithme", "dopamine", "erreur", "système", "surcharge",
    // ja
    "ハック", "マトリックス", "アルゴリズム", "ドーパミン", "システム", "エラー",
    // ko
    "해킹", "매트릭스", "알고리즘", "도파민", "시스템", "오류"
  ],
  cash_register: [
    // vi
    "tiền", "tỷ đô", "triệu đô", "lợi nhuận", "doanh thu", "giàu có", "thâu tóm", "cổ phiếu", "đô la", "chi phí", "lừa đảo", "giá trị",
    // en
    "money", "billion", "million", "profit", "revenue", "dollar", "wealth", "stock", "cost", "scam", "cash", "worth", "invest",
    // de
    "geld", "milliarden", "profit", "umsatz", "dollar", "aktie", "vermögen",
    // fr
    "argent", "milliard", "profit", "revenu", "dollar", "action", "richesse",
    // ja
    "お金", "十億", "利益", "売上", "ドル", "株", "富",
    // ko
    "돈", "십억", "이익", "매출", "달러", "주식", "부자"
  ],
  ding: [
    // vi
    "chú ý", "lưu ý", "quy tắc", "nhớ kỹ", "mấu chốt", "bài học", "nguyên tắc", "cốt lõi", "bí mật",
    // en
    "rule", "tip", "key", "remember", "note", "lesson", "principle", "golden rule", "essential",
    // de
    "regel", "tipp", "wichtig", "lektion", "prinzip",
    // fr
    "règle", "conseil", "clé", "leçon", "principe",
    // ja
    "ルール", "ポイント", "教訓", "原則", "重要",
    // ko
    "규칙", "팁", "포인트", "원칙", "핵심"
  ],
  chime: [
    // vi
    "kết luận", "chiến thắng", "thành công", "kết quả", "chân lý", "lời khuyên", "hoàn hảo", "lựa chọn",
    // en
    "verdict", "winner", "victory", "success", "result", "payoff", "conclusion", "perfect", "choice",
    // de
    "urteil", "sieger", "erfolg", "ergebnis", "gewinner",
    // fr
    "verdict", "gagnant", "succès", "résultat", "victoire",
    // ja
    "結論", "勝利", "成功", "結果", "勝者",
    // ko
    "결론", "승리", "성공", "결과", "승자"
  ],
};

const SFX_PRIORITY = {
  deep_boom: 10,
  alarm: 9,
  sub_drop: 8,
  cash_register: 7,
  glitch: 7,
  camera_shutter: 6,
  heartbeat: 6,
  typewriter: 5,
  ding: 5,
  chime: 5,
  whoosh: 4,
  pop: 3,
  click: 2,
};

/**
 * Scans text, captions, or structured acts/beats to automatically detect SFX cues.
 *
 * @param {Object} opts
 * @param {string} [opts.archetype] Style archetype (compare, survival, science, mystery, vox, newspaper, kinetic)
 * @param {Array<{start: number, dur: number, text?: string, caption?: string, title?: string}>} opts.items Timed items
 * @param {number} [opts.totalDuration] Total video duration in seconds
 * @returns {Array<{id: string, sfxId: string, start: number, duration: number, volume: number, track: number, reason: string}>}
 */
export function detectSfxCues(opts = {}) {
  const archetype = opts.archetype || "compare";
  const preset = SOUNDSCAPE_PRESETS[archetype] || SOUNDSCAPE_PRESETS.compare;
  const items = opts.items || [];
  const minGap = preset.pacingMinGap || 1.8;

  const rawCues = [];

  // 1. Initial Hook cue at t = 0.05s
  if (archetype === "newspaper") {
    rawCues.push({ sfxId: "camera_shutter", time: 0.1, reason: "Newspaper Breaking Dossier Reveal" });
  } else if (archetype === "kinetic") {
    rawCues.push({ sfxId: "sub_drop", time: 0.1, reason: "Cyber Kinetic OLED Hook Drop" });
  } else if (archetype === "mystery") {
    rawCues.push({ sfxId: "deep_boom", time: 0.1, reason: "Mystery Opening Suspense Boom" });
  } else if (archetype === "survival") {
    rawCues.push({ sfxId: "whoosh", time: 0.05, reason: "Survival Tier Escalation Start" });
  } else {
    rawCues.push({ sfxId: "whoosh", time: 0.05, reason: "Opening Hook Swipe" });
  }

  // 2. Scan each item/beat for semantic keywords and structural transitions
  items.forEach((item, index) => {
    const startTime = typeof item.start === "number" ? item.start : index * 4.0;
    const textContent = `${item.text || ""} ${item.caption || ""} ${item.title || ""}`.toLowerCase();

    // Act / Scene transition whoosh
    if (index > 0 && index % 2 === 0 && (archetype === "vox" || archetype === "newspaper" || archetype === "compare")) {
      rawCues.push({ sfxId: "whoosh", time: Math.max(0.1, startTime - 0.2), reason: `Scene transition act #${index + 1}` });
    }

    // Keyword matching
    for (const [sfxId, keywords] of Object.entries(KEYWORD_MAP)) {
      for (const kw of keywords) {
        if (textContent.includes(kw)) {
          rawCues.push({
            sfxId,
            time: Number((startTime + 0.15).toFixed(3)),
            reason: `Matched keyword "${kw}" in beat #${index + 1}`,
          });
          break; // Stop after first match for this sfxId in this item
        }
      }
    }

    // Archetype structural cues
    if (archetype === "newspaper") {
      // Rubber stamp hit on middle and climax
      if (index === Math.floor(items.length / 2)) {
        rawCues.push({ sfxId: "deep_boom", time: Number((startTime + 0.3).toFixed(3)), reason: "TOP SECRET Stamp Thud" });
      } else if (index === items.length - 1) {
        rawCues.push({ sfxId: "typewriter", time: Number((startTime + 0.2).toFixed(3)), reason: "Final Investigative Verdict" });
      }
    } else if (archetype === "survival") {
      // Danger heartbeat & alarm at higher tiers
      if (index >= 7 && index < items.length - 1) {
        rawCues.push({ sfxId: "heartbeat", time: Number((startTime + 0.2).toFixed(3)), reason: "Lethal Threshold Tension" });
      } else if (index === items.length - 1) {
        rawCues.push({ sfxId: "alarm", time: Number((startTime + 0.1).toFixed(3)), reason: "Tier 10 Catastrophic Alert" });
      }
    } else if (archetype === "kinetic") {
      // Glitch & sub drops
      if (index % 3 === 0 && index > 0) {
        rawCues.push({ sfxId: "glitch", time: Number((startTime + 0.1).toFixed(3)), reason: "Cyber Kinetic Signal Glitch" });
      }
    } else if (archetype === "vox") {
      // Highlighter pop & camera shutter
      if (index === 1 || index === 3) {
        rawCues.push({ sfxId: "pop", time: Number((startTime + 0.2).toFixed(3)), reason: "Vox Sticker & Tag Pop" });
      }
    }
  });

  // Final Payoff Chime near end
  if (items.length > 0) {
    const lastItem = items[items.length - 1];
    const lastTime = typeof lastItem.start === "number" ? lastItem.start : 60;
    rawCues.push({ sfxId: "chime", time: Number((lastTime + 0.2).toFixed(3)), reason: "Final Climax & Verdict Payoff" });
  }

  // 3. Audio Pacing Guard: Sort by timestamp, filter out overlapping / rapid-fire SFX
  rawCues.sort((a, b) => a.time - b.time);

  const filteredCues = [];
  let lastTime = -999;
  let trackCounter = 10;

  for (const cue of rawCues) {
    const sfxMeta = SFX_CATALOG[cue.sfxId] || SFX_CATALOG.pop;
    const gap = cue.time - lastTime;

    // If too close, keep only if higher priority
    if (gap < minGap && filteredCues.length > 0) {
      const prevCue = filteredCues[filteredCues.length - 1];
      const prevPrio = SFX_PRIORITY[prevCue.sfxId] || 1;
      const currPrio = SFX_PRIORITY[cue.sfxId] || 1;

      if (currPrio > prevPrio && gap >= 0.6) {
        // Allow if different categories (e.g. whoosh + impact)
        // Alternate tracks between 10 and 11
        trackCounter = trackCounter === 10 ? 11 : 10;
        filteredCues.push({
          id: `sfx-${cue.sfxId}-${filteredCues.length + 1}`,
          sfxId: cue.sfxId,
          start: cue.time,
          duration: sfxMeta.duration,
          volume: sfxMeta.defaultVolume,
          track: trackCounter,
          reason: cue.reason,
        });
        lastTime = cue.time;
      }
      continue;
    }

    trackCounter = trackCounter === 10 ? 11 : 10;
    filteredCues.push({
      id: `sfx-${cue.sfxId}-${filteredCues.length + 1}`,
      sfxId: cue.sfxId,
      start: cue.time,
      duration: sfxMeta.duration,
      volume: sfxMeta.defaultVolume,
      track: trackCounter,
      reason: cue.reason,
    });
    lastTime = cue.time;
  }

  return filteredCues;
}

/**
 * Computes Smart Audio Ducking intervals for Background Music (BGM).
 * During voice intervals, BGM ducks to ambientVol.
 * During pauses (>= 0.45s), BGM swells to boostVol.
 *
 * @param {Object} opts
 * @param {number} opts.totalDuration Total video duration in seconds
 * @param {Array<{start: number, dur: number}>} opts.voiceIntervals Voiceover speech intervals
 * @param {number} [opts.ambientVol=0.12] Ducked BGM volume during speech
 * @param {number} [opts.boostVol=0.28] Boosted BGM volume during pauses
 * @param {string} [opts.bgmSrc="assets/audio/bgm.mp3"] Relative path to BGM audio file
 * @returns {Array<{start: number, duration: number, mediaStart: number, volume: number, isBoost: boolean}>}
 */
export function computeDuckedBgmSegments(opts = {}) {
  const totalDuration = Number(opts.totalDuration) || 60;
  const voiceIntervals = (opts.voiceIntervals || []).map((v) => ({
    start: Math.max(0, Number(v.start)),
    end: Math.min(totalDuration, Number(v.start) + Number(v.dur)),
  }));

  const ambientVol = typeof opts.ambientVol === "number" ? opts.ambientVol : 0.12;
  const boostVol = typeof opts.boostVol === "number" ? opts.boostVol : 0.28;

  if (voiceIntervals.length === 0) {
    return [
      { start: 0, duration: totalDuration, mediaStart: 0, volume: ambientVol, isBoost: false },
    ];
  }

  // Sort voice intervals
  voiceIntervals.sort((a, b) => a.start - b.start);

  const segments = [];
  let currentTime = 0;

  for (let i = 0; i < voiceIntervals.length; i++) {
    const v = voiceIntervals[i];

    // Check for pause before speech
    if (v.start > currentTime + 0.05) {
      const pauseDur = Number((v.start - currentTime).toFixed(2));
      if (pauseDur >= 0.45) {
        segments.push({
          start: Number(currentTime.toFixed(2)),
          duration: pauseDur,
          mediaStart: Number(currentTime.toFixed(2)),
          volume: boostVol,
          isBoost: true,
        });
      } else if (pauseDur > 0) {
        segments.push({
          start: Number(currentTime.toFixed(2)),
          duration: pauseDur,
          mediaStart: Number(currentTime.toFixed(2)),
          volume: ambientVol,
          isBoost: false,
        });
      }
      currentTime = Number((currentTime + pauseDur).toFixed(2));
    }

    // Voice speaking duration
    const actualEnd = Math.max(currentTime + 0.1, v.end);
    const speakDur = Number((actualEnd - currentTime).toFixed(2));
    if (speakDur > 0) {
      segments.push({
        start: Number(currentTime.toFixed(2)),
        duration: speakDur,
        mediaStart: Number(currentTime.toFixed(2)),
        volume: ambientVol,
        isBoost: false,
      });
      currentTime = Number((currentTime + speakDur).toFixed(2));
    }
  }

  // Tail pause until totalDuration
  if (currentTime < totalDuration - 0.05) {
    const tailDur = Number((totalDuration - currentTime).toFixed(2));
    segments.push({
      start: Number(currentTime.toFixed(2)),
      duration: tailDur,
      mediaStart: Number(currentTime.toFixed(2)),
      volume: tailDur >= 0.8 ? boostVol : ambientVol,
      isBoost: tailDur >= 0.8,
    });
  }

  return segments;
}

/**
 * Generates HyperFrames HTML <audio> elements for SFX and Ducked BGM.
 */
export function generateCinemaAudioHtml(opts = {}) {
  const cues = opts.sfxCues || [];
  const segments = opts.bgmSegments || [];
  const bgmSrc = opts.bgmSrc || "assets/audio/bgm.mp3";
  const sfxDirRel = opts.sfxDirRel || "assets/audio/sfx";

  const lines = [];

  // 1. Ducked BGM track(s)
  if (segments.length > 0) {
    lines.push(`      <!-- 🎵 Cinema Soundscape: Smart Ducked BGM (Track 1-2) -->`);
    segments.forEach((seg, i) => {
      const boostTag = seg.isBoost ? ` <!-- [BOOST] ${seg.volume} -->` : "";
      lines.push(
        `      <audio id="bgm-seg-${i + 1}" class="clip" src="${bgmSrc}" data-start="${seg.start}" data-duration="${seg.duration}" data-media-start="${seg.mediaStart}" data-track-index="${30 + (i % 2)}" data-volume="${seg.volume}"></audio>${boostTag}`
      );
    });
  }

  // 2. Auto-SFX cues
  if (cues.length > 0) {
    lines.push(`      <!-- 💥 Cinema Soundscape: Auto-SFX Multi-Track Cues (Track 10-11) -->`);
    cues.forEach((c) => {
      const file = SFX_CATALOG[c.sfxId]?.file || `${c.sfxId}.mp3`;
      lines.push(
        `      <audio id="${c.id}" class="clip" src="${sfxDirRel}/${file}" data-start="${c.start}" data-duration="${c.duration}" data-track-index="${c.track}" data-volume="${c.volume}"></audio> <!-- ${c.reason} -->`
      );
    });
  }

  return lines.join("\n");
}

/**
 * Copies all active SFX files into the target video project assets directory.
 */
export function copyCinemaSfxFiles(targetVideoDir, cues = []) {
  const sfxDestDir = path.join(targetVideoDir, "assets", "audio", "sfx");
  fs.mkdirSync(sfxDestDir, { recursive: true });

  const neededSfx = new Set(cues.map((c) => c.sfxId));
  // Default to at least the core 5 if none specified
  if (neededSfx.size === 0) {
    ["whoosh", "pop", "ding", "click", "chime"].forEach((s) => neededSfx.add(s));
  }

  for (const sfxId of neededSfx) {
    const filename = SFX_CATALOG[sfxId]?.file || `${sfxId}.mp3`;
    const src = path.join(SHARED_SFX_DIR, filename);
    const dest = path.join(sfxDestDir, filename);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      console.warn(`[Cinema SFX] Warning: Source SFX not found: ${src}`);
    }
  }
}
