import assert from "node:assert/strict";
import test from "node:test";
import { generateVoxHtml } from "../tools/create-vox-video.mjs";

test("the last vox scene covers the 1.2 s tail so the video never ends on black frames", () => {
  const beats = [0, 1, 2].map((i) => ({ start: i * 5, duration: 4.6, line: `L${i}`, act: "a", headline: "H", cameraMove: "static", shotSize: "WIDE", label: "x" }));
  const totalDuration = Math.ceil(10 + 4.6 + 1.2);
  const html = generateVoxHtml({ slug: "vox-tail", cfg: { topicTitle: "T", watermark: "W" }, meta: {}, timedBeats: beats, totalDuration });
  const scenes = [...html.matchAll(/id="scene-(\d+)" class="vox-scene clip"[^>]*data-start="([\d.]+)" data-duration="([\d.]+)"/g)]
    .map((m) => ({ index: Number(m[1]), start: Number(m[2]), end: Number(m[2]) + Number(m[3]) }));
  assert.equal(scenes.length, 3);
  assert.equal(scenes.at(-1).end, totalDuration);
  // Các cảnh trước vẫn giữ đúng thời lượng câu đọc.
  assert.equal(scenes[1].end, 9.6);
});
