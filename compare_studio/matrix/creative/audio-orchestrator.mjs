import crypto from "node:crypto";
import fs from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { synthesizeCapCut } from "../../tools/capcut-tts.mjs";
import { applyVoiceFx, fxKeyPart, isVoiceFx } from "./voice-fx.mjs";
import { applyVoiceClone, cloneKeyPart, cloneProblems } from "./voice-clone.mjs";
import { computeDuckedBgmSegments, copyCinemaSfxFiles, detectSfxCues, generateCinemaAudioHtml } from "../../tools/auto-sfx.mjs";
import { probeDuration, getVoice, synthesizeEdge } from "../../tools/voices.mjs";
import { SFX_CATALOG, SOUNDSCAPE_PRESETS } from "../../tools/soundscapes.mjs";
import { listSceneArtifacts, recordSceneArtifact } from "../orchestrator/job-manager.mjs";

const execFileAsync = promisify(execFile);
const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHARED_AUDIO_DIR = path.join(COMPARE_DIR, "shared", "audio");
const DENSITY_GAP = { low: 3, medium: 1.8, high: 1.1 };

function channelData(channel) {
  return channel?.resolved_config?.channel || channel?.channel || channel;
}

function getSoundscape(channel) {
  const resolved = channel?.resolved_config?.soundscape || channel?.soundscape;
  const id = resolved?.id || channelData(channel)?.audio?.soundscape_id;
  const preset = resolved || (id && SOUNDSCAPE_PRESETS[id] ? { id, ...SOUNDSCAPE_PRESETS[id] } : null);
  if (!preset?.defaultBgm) throw new Error(`Channel has no valid soundscape preset: ${id || "missing"}`);
  return preset;
}

function sceneList(manifest) {
  return manifest?.storyboard?.scenes || manifest?.scenes;
}

function audioRenderKey(line, voice, rate, pitch, role, fx = "none", clone = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({ version: 1, line, voice: voice.id, rate, pitch, provider: voice.provider, role, ...fxKeyPart(fx), ...clone })).digest("hex");
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function applyPitchShift(sourcePath, outputPath, pitch) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", sourcePath,
  ]);
  const sampleRate = Number.parseInt(stdout.trim(), 10);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("ffprobe did not report an audio sample rate for pitch processing");
  const factor = 2 ** (pitch / 12);
  const shiftedRate = Math.round(sampleRate * factor);
  const tempo = Number((1 / factor).toFixed(8));
  const filter = `asetrate=${shiftedRate},aresample=${sampleRate},atempo=${tempo}`;
  await execFileAsync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", sourcePath, "-vn", "-af", filter,
    "-codec:a", "libmp3lame", "-q:a", "2", "-map_metadata", "-1", outputPath,
  ]);
}

export function createVoiceSynthesizer({ edgeProvider = synthesizeEdge, capcutProvider = synthesizeCapCut, pitchProcessor = applyPitchShift, fxProcessor = applyVoiceFx, cloneProcessor = applyVoiceClone } = {}) {
  return async function synthesizeConfiguredVoice({ text, voice, rate, pitch, fx = "none", clone = null, outPath }) {
    // TTS → clone (đổi âm sắc) → pitch → fx; mỗi bước ghi file mới (không ghi đè file đang đọc), bước cuối ghi outPath.
    const steps = [];
    if (clone && clone !== "none") steps.push(["cloned", (src, out) => cloneProcessor(src, out, clone)]);
    if (pitch) steps.push(["pitched", (src, out) => pitchProcessor(src, out, pitch)]);
    if (fx && fx !== "none") steps.push(["fx", (src, out) => fxProcessor(src, out, fx)]);
    const rawPath = steps.length ? `${outPath}.raw.mp3` : outPath;
    const temps = new Set([rawPath, ...steps.slice(0, -1).map(([name]) => `${outPath}.${name}.mp3`)].filter((file) => file !== outPath));
    const cleanup = async () => {
      for (const file of temps) await fs.promises.rm(file, { force: true });
    };
    try {
      if (voice.provider === "edge") {
        await edgeProvider({ text, voice: voice.id, outPath: rawPath, rate });
      } else if (voice.provider === "capcut") {
        await capcutProvider({ text, voice: voice.id, outPath: rawPath, rate: String(rate) });
      } else {
        throw new Error(`unsupported TTS provider ${voice.provider}`);
      }
      let current = rawPath;
      for (const [index, [name, run]] of steps.entries()) {
        const next = index === steps.length - 1 ? outPath : `${outPath}.${name}.mp3`;
        await run(current, next);
        current = next;
      }
    } catch (error) {
      await cleanup();
      throw error;
    }
    await cleanup();
  };
}

const synthesizeConfiguredVoice = createVoiceSynthesizer();

function applySfxDensity(cues, density) {
  const gap = DENSITY_GAP[density];
  if (!gap) throw new Error(`invalid sfx_density: ${density}`);
  if (density === "high") return cues;
  const accepted = [];
  for (const cue of cues) {
    const prior = accepted.at(-1);
    if (!prior || cue.start - prior.start >= gap) accepted.push(cue);
  }
  return accepted;
}

function existingNarration(artifacts, scene, key) {
  if (scene.audio_render_key !== key) return null;
  return artifacts.find((artifact) => artifact.scene_index === scene.scene_index
    && artifact.artifact_type === "narration" && artifact.status === "READY");
}

export async function orchestrateAudioForJob({
  jobId,
  manifest,
  channel,
  projectDir = path.join(COMPARE_DIR, "projects", jobId),
  dbPath,
  voiceSynthesizer = synthesizeConfiguredVoice,
  durationProbe = probeDuration,
  artifactReader = listSceneArtifacts,
  artifactWriter = recordSceneArtifact,
  pitchProcessor = applyPitchShift,
  sfxDetector = detectSfxCues,
  cloneRegistry = undefined,
  log = () => {},
} = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(jobId || "")) throw new Error("jobId must be a safe path component");
  const scenes = sceneList(manifest);
  const dna = channelData(channel);
  if (!Array.isArray(scenes) || !scenes.length || !dna?.audio?.voice_id) {
    throw new Error("storyboard scenes and Channel DNA voice settings are required");
  }
  const voice = getVoice(dna.audio.voice_id);
  if (!voice) throw new Error(`configured voice is not present in voices.mjs: ${dna.audio.voice_id}`);
  const language = dna.publishing?.language;
  if (language && voice.lang !== language) {
    throw new Error(`voice ${voice.id} speaks ${voice.lang} but channel ${dna.channel_id || ""} publishes in ${language}`);
  }
  const rate = Number(dna.audio.voice_speed);
  const pitch = Number(dna.audio.voice_pitch);
  const fx = dna.audio.voice_fx || "none";
  if (!isVoiceFx(fx)) throw new Error(`Channel DNA voice_fx ${fx} is not supported`);
  const clone = dna.audio.voice_clone && dna.audio.voice_clone !== "none" ? String(dna.audio.voice_clone) : null;
  const cloneErrors = clone ? cloneProblems(clone, language, cloneRegistry) : [];
  if (cloneErrors.length) throw new Error(cloneErrors.join("; "));
  const cloneKey = clone ? cloneKeyPart(clone, cloneRegistry) : {};
  if (!Number.isFinite(rate) || rate < 0.5 || rate > 2 || !Number.isFinite(pitch) || pitch < -12 || pitch > 12) {
    throw new Error("Channel DNA voice_speed/voice_pitch are outside supported ranges");
  }
  const soundscape = getSoundscape(channel);
  const bgmSource = path.join(SHARED_AUDIO_DIR, "bgm", `${soundscape.defaultBgm}.mp3`);
  if (!fs.existsSync(bgmSource) || fs.statSync(bgmSource).size === 0) {
    throw new Error(`configured BGM asset is missing: ${bgmSource}`);
  }
  const bgmDestination = path.join(projectDir, "assets", "audio", "bgm.mp3");
  await fs.promises.mkdir(path.dirname(bgmDestination), { recursive: true });
  await fs.promises.mkdir(projectDir, { recursive: true });
  await fs.promises.copyFile(bgmSource, bgmDestination);

  const existing = await artifactReader({ job_id: jobId, dbPath });
  const updatedScenes = [];
  const voiceArtifacts = [];
  const timedScenes = [];
  let start = 0;
  for (let offset = 0; offset < scenes.length; offset += 1) {
    const scene = { ...scenes[offset], scene_index: Number(scenes[offset].scene_index ?? offset + 1) };
    const text = String(scene.line || "").trim();
    if (!text) throw new Error(`scene ${scene.scene_index} has no narration line`);
    const role = String(scene.speaker || "narrator");
    const key = audioRenderKey(text, voice, rate, pitch, role, fx, cloneKey);
    const outputPath = path.join(projectDir, "scenes", `scene_${String(scene.scene_index).padStart(2, "0")}`, "narration.mp3");
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    let artifact = existingNarration(existing, scene, key);
    let duration = null;
    if (artifact) {
      const actualHash = await hashFile(artifact.file_path).catch(() => null);
      if (actualHash !== artifact.checksum) artifact = null;
    }
    if (artifact) {
      duration = await durationProbe(artifact.file_path);
      if (!Number.isFinite(duration) || duration <= 0) artifact = null;
    }
    if (!artifact) {
      await voiceSynthesizer({ text, voice, rate, pitch, fx, clone, role, outPath: outputPath, pitchProcessor });
      const stat = await fs.promises.stat(outputPath).catch(() => null);
      if (!stat?.isFile() || stat.size === 0) throw new Error(`TTS returned no audio for scene ${scene.scene_index}`);
      duration = await durationProbe(outputPath);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error(`ffprobe returned invalid duration for scene ${scene.scene_index}`);
      artifact = await artifactWriter({
        job_id: jobId, scene_index: scene.scene_index, artifact_type: "narration", file_path: outputPath, dbPath,
      });
    }
    const durationSeconds = Number(duration.toFixed(3));
    const timed = { ...scene, start: Number(start.toFixed(3)), duration: durationSeconds, voSrc: path.relative(projectDir, artifact.file_path) };
    timedScenes.push(timed);
    start += durationSeconds;
    scene.start_seconds = timed.start;
    scene.duration_seconds = durationSeconds;
    scene.narration_path = path.relative(projectDir, artifact.file_path);
    scene.audio_render_key = key;
    scene.required_artifacts = [...new Set([...(scene.required_artifacts || []), "narration"])];
    updatedScenes.push(scene);
    voiceArtifacts.push(artifact);
  }

  let sfxCues = applySfxDensity(sfxDetector({
    archetype: soundscape.id,
    items: timedScenes.map((scene) => ({ start: scene.start, dur: scene.duration, text: scene.line })),
    totalDuration: start,
  }), dna.audio.sfx_density);
  for (const cue of sfxCues) {
    const meta = SFX_CATALOG[cue.sfxId];
    if (!meta) throw new Error(`unknown SFX id ${cue.sfxId}`);
    const source = path.join(SHARED_AUDIO_DIR, "sfx", meta.file);
    if (!fs.existsSync(source) || fs.statSync(source).size === 0) throw new Error(`configured SFX asset is missing: ${source}`);
  }
  if (sfxCues.length) copyCinemaSfxFiles(projectDir, sfxCues);

  const bgmSegments = computeDuckedBgmSegments({
    totalDuration: start,
    voiceIntervals: timedScenes.map((scene) => ({ start: scene.start, dur: scene.duration })),
    ambientVol: soundscape.ambientVol,
    boostVol: soundscape.boostVol,
  });
  const sfxArtifacts = [];
  for (const scene of updatedScenes) {
    const end = scene.start_seconds + scene.duration_seconds;
    const cues = sfxCues.filter((cue) => cue.start >= scene.start_seconds && cue.start < end);
    if (!cues.length) continue;
    const artifactPath = path.join(projectDir, "scenes", `scene_${String(scene.scene_index).padStart(2, "0")}`, "sfx.json");
    await fs.promises.writeFile(artifactPath, JSON.stringify({ cues }, null, 2));
    const artifact = await artifactWriter({
      job_id: jobId, scene_index: scene.scene_index, artifact_type: "sfx", file_path: artifactPath, dbPath,
    });
    sfxArtifacts.push(artifact);
    scene.required_artifacts = [...new Set([...scene.required_artifacts, "sfx"])];
  }
  const updatedManifest = structuredClone(manifest);
  if (Array.isArray(updatedManifest.storyboard?.scenes)) updatedManifest.storyboard.scenes = updatedScenes;
  else updatedManifest.scenes = updatedScenes;
  updatedManifest.audio = {
    voice_id: voice.id,
    voice_provider: voice.provider,
    voice_speed: rate,
    voice_pitch: pitch,
    voice_fx: fx,
    voice_clone: clone,
    music_family: dna.audio.music_family,
    soundscape_id: soundscape.id,
    bgm: path.relative(projectDir, bgmDestination),
    bgm_segments: bgmSegments,
    sfx_cues: sfxCues,
    duration_seconds: Number(start.toFixed(3)),
  };
  const audioHtml = generateCinemaAudioHtml({
    sfxCues,
    bgmSegments,
    bgmSrc: path.relative(projectDir, bgmDestination),
    sfxDirRel: "assets/audio/sfx",
  });
  log(`Audio prepared: ${updatedScenes.length} measured voice scenes, ${sfxCues.length} SFX cues.`);
  return {
    manifest: updatedManifest,
    scenes: timedScenes,
    duration_seconds: Number(start.toFixed(3)),
    voice_artifacts: voiceArtifacts,
    sfx_artifacts: sfxArtifacts,
    bgm_path: bgmDestination,
    bgm_segments: bgmSegments,
    sfx_cues: sfxCues,
    html: audioHtml,
  };
}
