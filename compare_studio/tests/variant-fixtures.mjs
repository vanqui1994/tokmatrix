// Fixture dự án Matrix đã chuẩn bị (giọng + ảnh mỗi cảnh) cho engine mystery — dùng cho test hệ variant
// (đường legacy và đường variant phải dùng CÙNG đầu vào để so HTML).
import fs from "node:fs";
import path from "node:path";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";

// Thời lượng đo từ TTS, không đều nhau (không bao giờ chia đều).
export const LINES = {
  de: [
    "Im Winter 1959 verschwanden neun erfahrene Wanderer im Uralgebirge.",
    "Die Rettungsmannschaft fand ihr Zelt von innen aufgeschlitzt.",
    "Fußspuren führten barfuß in die eisige Dunkelheit hinab.",
    "Donaufahrtsschifffahrtsgesellschaftskapitän-Tagebücher erwähnen nichts davon.",
    "Einige Leichen hatten schwere innere Verletzungen ohne äußere Wunden.",
    "Bis heute streiten Ermittler über Lawine, Infraschall oder Militärtests.",
    "Was trieb neun Menschen barfuß in den Schnee? Schreib deine Theorie in die Kommentare.",
  ],
  ja: [
    "一九五九年の冬、ウラル山脈で九人の登山者が消えた。",
    "救助隊が見つけたテントは内側から切り裂かれていた。",
    "足跡は裸足のまま、凍える闇へと続いていた。",
    "一部の遺体には外傷のない深刻な内部損傷があった。",
    "雪崩か、超低周波か、軍事実験か、今も議論が続く。",
    "なぜ九人は裸足で雪の中へ出たのか。あなたの説をコメントで。",
  ],
  ko: [
    "1959년 겨울, 우랄 산맥에서 아홉 명의 등산객이 사라졌다.",
    "구조대가 찾은 텐트는 안쪽에서 찢겨 있었다.",
    "발자국은 맨발로 얼어붙은 어둠 속으로 이어졌다.",
    "일부 시신에는 외상 없이 심각한 내부 손상이 있었다.",
    "눈사태인가, 초저주파인가, 군사 실험인가, 논쟁은 계속된다.",
    "아홉 명은 왜 맨발로 눈 속에 나갔을까? 댓글로 알려 주세요.",
  ],
  en: [
    "In the winter of 1959, nine experienced hikers vanished in the Ural Mountains.",
    "Rescuers found their tent slashed open from the inside.",
    "Footprints led barefoot into the freezing dark.",
    "Some bodies had severe internal injuries with no external wounds.",
    "Avalanche, infrasound or a military test? Investigators still disagree.",
    "Why did nine people walk barefoot into the snow? Tell us your theory.",
  ],
};
const DURATIONS = [4.6, 3.9, 3.4, 5.8, 4.4, 5.1, 4.7];
export const TITLES = {
  de: "Das Rätsel am Djatlow-Pass", ja: "ディアトロフ峠の謎", ko: "댜틀로프 고개의 미스터리", en: "The Dyatlov Pass Mystery",
};

export function scenesFor(lang) {
  let start = 0.3;
  return LINES[lang].map((line, i) => {
    const scene = {
      scene_index: i + 1, beat_id: `b${i + 1}`, line, visual_intent: `Mountain night scene ${i + 1}`,
      start_seconds: Number(start.toFixed(2)), duration_seconds: DURATIONS[i],
    };
    start += DURATIONS[i] + 0.3;
    return scene;
  });
}

// PNG 1×1 hợp lệ (ảnh AI giả lập của hàng đợi).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/** creative: undefined → kênh legacy; { variant_id, dna } → kênh có variant. */
export function createMysteryFixture(root, { lang = "de", creative, slug = "mystery-variant-test", jobId = "variant-job" } = {}) {
  const projectDir = path.join(root, `prepared-${slug}`);
  const videoDir = path.join(root, `output-${slug}`);
  fs.mkdirSync(path.join(projectDir, "assets", "audio"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "assets", "audio", "bgm.mp3"), "prepared background music");
  const scenes = scenesFor(lang).map((scene) => {
    const sceneDir = path.join(projectDir, "scenes", `scene_${String(scene.scene_index).padStart(2, "0")}`);
    fs.mkdirSync(sceneDir, { recursive: true });
    fs.writeFileSync(path.join(sceneDir, "narration.mp3"), `spoken line ${scene.scene_index}`);
    fs.writeFileSync(path.join(sceneDir, "image.png"), PNG);
    return {
      ...scene,
      narration_path: path.relative(projectDir, path.join(sceneDir, "narration.mp3")),
      asset_type: "IMAGE_AI", asset_source: "antigravity", asset_status: "READY",
      asset_path: path.relative(projectDir, path.join(sceneDir, "image.png")),
    };
  });
  const channel = structuredClone(resolveChannelsForTopic("unsolved_mysteries", 1)[0]);
  const inner = channel.resolved_config?.channel || channel.channel || channel;
  inner.publishing = { ...(inner.publishing || {}), language: lang };
  if (creative) {
    inner.creative = { ...inner.creative, preferred_engines: ["mystery"], ...creative };
  }
  channel.engine_type = "mystery";
  const job = { job_id: jobId, batch_id: "batch-test", channel_id: channel.channel_id, engine_type: "mystery", video_slug: slug, created_at: 1 };
  const end = scenes.at(-1).start_seconds + scenes.at(-1).duration_seconds;
  const manifest = {
    topic: { title: TITLES[lang] }, script: { title: TITLES[lang], scenes },
    angle: { angle_id: "angle_01", hook: LINES[lang][0] }, blueprint: { blueprint_id: "mystery_reveal" },
    channel, scenes, audio: { duration_seconds: end, bgm_segments: [], sfx_cues: [] },
  };
  return { projectDir, videoDir, job, manifest };
}
