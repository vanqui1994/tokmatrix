import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function probeVideo(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", filePath,
  ]);
  const data = JSON.parse(stdout);
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const audio = data.streams?.find((stream) => stream.codec_type === "audio");
  return {
    duration_seconds: Number(data.format?.duration),
    width: Number(video?.width),
    height: Number(video?.height),
    has_video: Boolean(video),
    has_audio: Boolean(audio),
  };
}

async function detectBlackSegments(filePath) {
  const { stderr } = await execFileAsync("ffmpeg", [
    "-hide_banner", "-i", filePath, "-vf", "blackdetect=d=0.1:pix_th=0.10", "-an", "-f", "null", "-",
  ]);
  return [...stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/gu)]
    .map((match) => ({ start: Number(match[1]), end: Number(match[2]), duration: Number(match[3]) }));
}

async function measureAudio(filePath) {
  const { stderr } = await execFileAsync("ffmpeg", ["-hide_banner", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"]);
  const max = stderr.match(/max_volume:\s*(-?inf|[-\d.]+)\s*dB/iu)?.[1];
  const mean = stderr.match(/mean_volume:\s*(-?inf|[-\d.]+)\s*dB/iu)?.[1];
  return {
    max_volume_db: max === "-inf" ? Number.NEGATIVE_INFINITY : Number(max),
    mean_volume_db: mean === "-inf" ? Number.NEGATIVE_INFINITY : Number(mean),
  };
}

export async function checkVideoOutput(filePath, {
  probe = probeVideo,
  detectBlack = detectBlackSegments,
  audioMeter = measureAudio,
  minDurationSeconds = 25,
  maxDurationSeconds = 65,
  minWidth = 720,
  minHeight = 1280,
  maxBlackSegmentSeconds = 0.5,
} = {}) {
  const resolved = path.resolve(filePath);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) {
    return { passed: false, errors: ["render output is missing or empty"], file_path: resolved };
  }
  const [metadata, blackSegments, audio] = await Promise.all([
    probe(resolved), detectBlack(resolved), audioMeter(resolved),
  ]);
  const errors = [];
  const duration = metadata.duration_seconds;
  if (!Number.isFinite(duration) || duration <= minDurationSeconds || duration >= maxDurationSeconds) {
    errors.push(`video duration must be >${minDurationSeconds}s and <${maxDurationSeconds}s`);
  }
  if (!metadata.has_video) errors.push("video stream is missing");
  if (!metadata.has_audio) errors.push("audio stream is missing");
  const ratio = metadata.width / metadata.height;
  if (metadata.width < minWidth || metadata.height < minHeight || !Number.isFinite(ratio) || Math.abs(ratio - 9 / 16) > 0.01) {
    errors.push(`video must be vertical 9:16 at ${minWidth}x${minHeight} or larger`);
  }
  const longBlackSegments = blackSegments.filter((segment) => segment.duration > maxBlackSegmentSeconds);
  if (longBlackSegments.length) errors.push("long black-frame segment detected");
  if (!Number.isFinite(audio.max_volume_db) || audio.max_volume_db >= 0) errors.push("audio is silent or clips at/above 0 dBFS");
  return {
    passed: errors.length === 0,
    errors,
    file_path: resolved,
    metrics: { ...metadata, black_segments: blackSegments, long_black_segments: longBlackSegments, ...audio, bytes: stat.size },
  };
}
