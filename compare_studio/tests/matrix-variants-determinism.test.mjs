// Determinism QA (docs/PLAN_VARIANT_V2_COMPLETION.md WS-H4): cùng script + asset + variant + DNA → cùng khung hình.
// Dựng preview hai lần (hai thư mục khác nhau) và chụp khung ở 0.2 / 0.5 / 0.8 thời lượng bằng seek không tuyến tính của
// HyperFrames; hai lần phải giống từng byte. Chậm (Chromium thật) nên chỉ chạy khi MATRIX_SLOW_TESTS=1.
//
//   MATRIX_SLOW_TESTS=1 node --test tests/matrix-variants-determinism.test.mjs
//   (HYPERFRAMES_BIN=… để dùng bản cài sẵn thay vì npx hyperframes@0.8.75)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getVariant } from "../matrix/render/variants/index.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { buildPreview } from "../tools/preview-variants.mjs";

const SLOW = process.env.MATRIX_SLOW_TESTS === "1";
// Một variant mỗi kiểu dựng: ảnh + khung (mystery), bản đồ SVG (chalk), dữ liệu so sánh (compare), báo (front-page, bộ da).
const CASES = [["mystery/cctv", "de"], ["chalk/atlas", "ja"], ["compare/boxing-ring", "ko"], ["newspaper/front-page", "vi"]];

function hyperframes() {
  const bin = process.env.HYPERFRAMES_BIN;
  return bin ? bin.split(" ") : ["npx", "--yes", "hyperframes@0.8.75"];
}

function snapshotHashes(dir, times) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "det-shots-"));
  const [cmd, ...pre] = hyperframes();
  execFileSync(cmd, [...pre, "snapshot", dir, "--at", times.join(","), "--no-end", "--describe", "false", "--no-browser-gpu", "-o", out], { stdio: "pipe", timeout: 300_000 });
  return fs.readdirSync(out).filter((f) => f.endsWith(".png")).sort()
    .map((f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(out, f))).digest("hex"));
}

for (const [id, lang] of CASES) {
  test(`${id} (${lang}) renders the same frames twice`, { skip: !SLOW && "set MATRIX_SLOW_TESTS=1" }, async () => {
    const variant = getVariant(id);
    const composition = Object.keys(variant.visualProfile.compositions)[0];
    const dna = defaultDna(variant, composition);
    const build = async () => buildPreview({ variant, composition, lang, dna, dnaTag: "a", outDir: fs.mkdtempSync(path.join(os.tmpdir(), "det-")) });
    const [first, second] = [await build(), await build()];
    assert.equal(fs.readFileSync(path.join(first.dir, "index.html"), "utf8"), fs.readFileSync(path.join(second.dir, "index.html"), "utf8"));
    const times = [0.2, 0.5, 0.8].map((p) => (first.duration * p).toFixed(2));
    const a = snapshotHashes(first.dir, times);
    const b = snapshotHashes(second.dir, times);
    assert.equal(a.length, times.length);
    assert.deepEqual(a, b);
  });
}
