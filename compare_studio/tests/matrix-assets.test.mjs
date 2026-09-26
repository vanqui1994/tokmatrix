import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkSceneAssets } from "../matrix/qa/asset-qa.mjs";

test("asset QA follows typed manifest requirements instead of requiring 12 AI images", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-assets-"));
  try {
    const chart = path.join(dir, "scene-1.svg");
    const title = path.join(dir, "scene-2.txt");
    fs.writeFileSync(chart, "<svg viewBox='0 0 1 1'></svg>");
    fs.writeFileSync(title, "Title card");
    const manifest = { scenes: [
      { scene_index: 1, asset_type: "CHART", required_artifacts: ["chart"] },
      { scene_index: 2, asset_type: "TEXT", required_artifacts: ["text"] },
      { scene_index: 3, asset_type: "IMAGE_AI", required_artifacts: ["image"] },
    ] };
    const result = await checkSceneAssets({
      manifest,
      artifacts: [
        { scene_index: 1, artifact_type: "chart", file_path: chart, checksum: crypto.createHash("sha256").update(fs.readFileSync(chart)).digest("hex"), status: "READY" },
        { scene_index: 2, artifact_type: "text", file_path: title, checksum: crypto.createHash("sha256").update(fs.readFileSync(title)).digest("hex"), status: "READY" },
      ],
      baseDir: dir,
    });
    assert.equal(result.passed, false);
    assert.equal(result.scene_count, 3);
    assert.equal(result.accepted_artifacts.length, 2);
    assert.deepEqual(result.issues.map((issue) => issue.code), ["ARTIFACT_MISSING"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AI image QA requires Antigravity provenance and vertical resolution", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-image-qa-"));
  try {
    const image = path.join(dir, "scene-1.jpg");
    fs.writeFileSync(image, "test image bytes");
    const checksum = crypto.createHash("sha256").update(fs.readFileSync(image)).digest("hex");
    const input = {
      manifest: { scenes: [{ scene_index: 1, asset_type: "IMAGE_AI", asset_source: "antigravity", required_artifacts: ["image"] }] },
      artifacts: [{ scene_index: 1, artifact_type: "image", file_path: image, checksum, status: "READY" }],
      imageInspector: async () => ({ width: 768, height: 1365 }),
    };
    assert.equal((await checkSceneAssets(input)).passed, true);
    const wrongRatio = await checkSceneAssets({ ...input, imageInspector: async () => ({ width: 1280, height: 720 }) });
    assert.equal(wrongRatio.issues[0].code, "ARTIFACT_INVALID");
    const wrongSource = await checkSceneAssets({
      ...input,
      manifest: { scenes: [{ scene_index: 1, asset_type: "IMAGE_AI", asset_source: "placeholder", required_artifacts: ["image"] }] },
    });
    assert.equal(wrongSource.issues[0].code, "ARTIFACT_INVALID");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
