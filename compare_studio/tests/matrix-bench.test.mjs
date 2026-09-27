// tools/bench-variants.mjs (WS-G): chọn variant để đo và dựng báo cáo; phần render thật chạy trên VPS.
import assert from "node:assert/strict";
import test from "node:test";
import { benchVariants, reportMarkdown } from "../tools/bench-variants.mjs";

test("bench takes the first N active variants of every engine, deterministically", () => {
  const picked = benchVariants({ perEngine: 2 });
  const engines = [...new Set(picked.map((v) => v.engine))];
  assert.ok(engines.length >= 10);
  for (const engine of engines) {
    const ids = picked.filter((v) => v.engine === engine).map((v) => v.id);
    assert.ok(ids.length >= 1 && ids.length <= 2, engine);
    assert.deepEqual(ids, [...ids].sort(), engine);
  }
  assert.deepEqual(benchVariants({ perEngine: 2 }).map((v) => v.id), picked.map((v) => v.id));
  assert.deepEqual(benchVariants({ variant: "vox/data-card" }).map((v) => v.id), ["vox/data-card"]);
  assert.ok(picked.every((v) => v.status === "active"));
});

test("bench report lists every render, failures included, and the slot memory estimate", () => {
  const rows = [
    { engine: "vox", variant: "vox/data-card", composition: "stat_top", duration: 31, seconds: 120, cpuSeconds: 110, peakMb: 1300, mb: 1.6, aiImages: 6, ttsSeconds: 28, ok: true },
    { engine: "chalk", variant: "chalk/atlas", composition: "scroll_plate", duration: 31, seconds: 5, cpuSeconds: 2, peakMb: 200, mb: 0, aiImages: 0, ttsSeconds: 28, ok: false, code: 1, error: "boom" },
  ];
  const md = reportMarkdown({ rows, slots: 2, encodeArgs: ["--crf", "20"], hfVersion: "0.7.58", lang: "de", host: "vps", date: new Date("2026-09-27T00:00:00Z") });
  assert.match(md, /^# Bench render variant — 2026-09-27/u);
  assert.match(md, /\| vox \| vox\/data-card \| stat_top \| 31 \| 120\.0 \|/u);
  assert.match(md, /lỗi 1: boom/u);
  assert.match(md, /1\/2 render ok/u);
  assert.match(md, /2 slot song song ≈ 2\.5 GB/u);
});
