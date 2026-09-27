import assert from "node:assert/strict";
import test from "node:test";
import { PROSODY_GRID, assignProsody, planProsody, prosodySpread } from "../tools/assign-prosody.mjs";

test("accounts sharing a voice never share speed+pitch (up to 16 per voice), deterministic and stable", () => {
  const channels = Array.from({ length: 20 }, (_, i) => ({ channel_id: `c${String(i).padStart(2, "0")}`, lang: "ko", voice: "v", speed: 1.02, pitch: -1 }));
  const first = assignProsody(channels);
  assert.deepEqual(assignProsody(channels), first);
  const cells = new Map();
  for (const row of first) cells.set(`${row.speed}|${row.pitch}`, (cells.get(`${row.speed}|${row.pitch}`) || 0) + 1);
  assert.equal(cells.size, PROSODY_GRID.length); // 20 acc > 16 ô → mọi ô được dùng, mỗi ô ≤ 2
  assert.ok([...cells.values()].every((n) => n <= 2));
  const again = assignProsody(first.map((row) => ({ ...row, speed: row.speed, pitch: row.pitch })));
  assert.ok(again.every((row) => row.status === "kept"));
  for (const row of first) assert.ok(row.speed >= 0.95 && row.speed <= 1.05 && row.pitch >= -2 && row.pitch <= 1);
});

test("repo channel configs already give every voice group distinct speed+pitch", () => {
  const { rows } = planProsody();
  assert.ok(rows.every((row) => row.status === "kept"), "run node tools/assign-prosody.mjs --apply");
  for (const [group, v] of Object.entries(prosodySpread(rows))) assert.equal(v.distinct, Math.min(v.accounts, PROSODY_GRID.length), group);
});
