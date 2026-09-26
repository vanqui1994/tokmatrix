import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkVideoOutput } from "../tools/video-qa.mjs";

test("video QA accepts a valid vertical video and reports measured output", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-video-qa-"));
  const video = path.join(dir, "render.mp4");
  fs.writeFileSync(video, "mock mp4 bytes");
  try {
    const result = await checkVideoOutput(video, {
      probe: async () => ({ duration_seconds: 52, width: 1080, height: 1920, has_video: true, has_audio: true }),
      detectBlack: async () => [],
      audioMeter: async () => ({ max_volume_db: -1, mean_volume_db: -16 }),
    });
    assert.equal(result.passed, true);
    assert.equal(result.metrics.duration_seconds, 52);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("video QA rejects silent, black and non-vertical render output", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-video-qa-bad-"));
  const video = path.join(dir, "render.mp4");
  fs.writeFileSync(video, "mock mp4 bytes");
  try {
    const result = await checkVideoOutput(video, {
      probe: async () => ({ duration_seconds: 52, width: 1920, height: 1080, has_video: true, has_audio: true }),
      detectBlack: async () => [{ start: 1, end: 2, duration: 1 }],
      audioMeter: async () => ({ max_volume_db: Number.NEGATIVE_INFINITY, mean_volume_db: Number.NEGATIVE_INFINITY }),
    });
    assert.equal(result.passed, false);
    assert.equal(result.errors.length, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Matrix video QA accepts TikTok-length videos up to 90 s", async () => {
  const { checkMatrixVideo } = await import("../matrix/render/native-engine-adapter.mjs");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-qa-"));
  const video = path.join(dir, "v.mp4");
  fs.writeFileSync(video, "x");
  const fake = (seconds) => ({
    probe: async () => ({ duration_seconds: seconds, width: 1080, height: 1920, has_video: true, has_audio: true }),
    detectBlack: async () => [], audioMeter: async () => ({ max_volume_db: -1, mean_volume_db: -16 }),
  });
  try {
    assert.equal((await checkMatrixVideo(video, fake(72))).passed, true);   // tiếng Đức đo được 67–74 s
    assert.equal((await checkMatrixVideo(video, fake(95))).passed, false);
    assert.equal((await checkMatrixVideo(video, fake(20))).passed, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
