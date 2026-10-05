import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { AI_IMAGE_SOURCES } from "../../tools/antigravity-images.mjs";

const execFileAsync = promisify(execFile);
const REQUIRED_ASSET_TYPES = new Set(["IMAGE_AI", "CANVAS", "SVG", "TEXT", "MAP", "CHART", "EXISTING_ASSET"]);
const VISUAL_ARTIFACT_TYPE = {
  IMAGE_AI: "image", CANVAS: "canvas", SVG: "svg", TEXT: "text",
  MAP: "map", CHART: "chart", EXISTING_ASSET: "existing_asset",
};
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * Nguồn hợp lệ của slot ảnh IMAGE_AI: hàng đợi ảnh AI; bước fallback của variant đã ghi vào asset_fallbacks
 * ("fallback:<nguồn>", vd. cache ảnh AI của chính acc); hoặc poster của clip stock (cảnh phải có scene.stock và
 * segment_video trong required_artifacts, nên clip cũng được kiểm checksum).
 */
export function sceneImageSourceOk(scene) {
  const source = String(scene?.asset_source || "");
  if (AI_IMAGE_SOURCES.includes(source)) return true;
  if (source.startsWith("fallback:")) return true;
  if (source === "stock_video") {
    const required = (scene.required_artifacts || []).map((item) => (typeof item === "string" ? item : item.artifact_type || item.type));
    return Boolean(scene.stock?.clip_path) && required.includes("segment_video");
  }
  return false;
}

async function fileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function probeImageDimensions(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", filePath,
  ]);
  const stream = JSON.parse(stdout).streams?.[0];
  if (!stream) throw new Error("ffprobe found no image stream");
  return { width: Number(stream.width), height: Number(stream.height) };
}

export async function checkSceneAssets({ manifest, artifacts = [], baseDir = process.cwd(), imageInspector = probeImageDimensions } = {}) {
  const scenes = manifest?.storyboard?.scenes || manifest?.scenes;
  if (!Array.isArray(scenes)) throw new Error("storyboard manifest must contain scenes");
  const issues = [];
  const accepted = [];
  const byScene = new Map();
  for (const artifact of artifacts) {
    const list = byScene.get(Number(artifact.scene_index)) || [];
    list.push(artifact);
    byScene.set(Number(artifact.scene_index), list);
  }

  for (const [offset, scene] of scenes.entries()) {
    const sceneIndex = Number(scene.scene_index ?? offset + 1);
    const assetType = scene.asset_type;
    if (!REQUIRED_ASSET_TYPES.has(assetType)) {
      issues.push({ scene_index: sceneIndex, code: "ASSET_TYPE_INVALID", message: `unsupported asset_type: ${assetType}` });
      continue;
    }
    const required = Array.isArray(scene.required_artifacts) ? scene.required_artifacts.map((item) =>
      typeof item === "string" ? item : item.artifact_type || item.type,
    ).filter(Boolean) : [];
    const visualRequirement = VISUAL_ARTIFACT_TYPE[assetType];
    if (!required.includes(visualRequirement)) {
      issues.push({ scene_index: sceneIndex, code: "ASSET_REQUIREMENT_MISMATCH", artifact_type: visualRequirement });
    }
    if (!required.length) {
      issues.push({ scene_index: sceneIndex, code: "ARTIFACT_REQUIREMENTS_MISSING", message: "scene must declare required_artifacts in the manifest" });
      continue;
    }
    const sceneArtifacts = byScene.get(sceneIndex) || [];
    for (const type of required) {
      const artifact = sceneArtifacts.find((item) => item.artifact_type === type && item.status === "READY");
      if (!artifact) {
        issues.push({ scene_index: sceneIndex, code: "ARTIFACT_MISSING", artifact_type: type });
        continue;
      }
      const filePath = path.isAbsolute(artifact.file_path) ? artifact.file_path : path.resolve(baseDir, artifact.file_path);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile() || stat.size === 0) throw new Error("empty or not a file");
        if (!/^[a-f0-9]{64}$/i.test(artifact.checksum || "") || await fileHash(filePath) !== artifact.checksum.toLowerCase()) {
          throw new Error("artifact checksum is missing or does not match");
        }
        if (assetType === "IMAGE_AI" && type === "image") {
          if (!sceneImageSourceOk(scene)) throw new Error("IMAGE_AI artifact source must be the AI image queue (Antigravity or its ImageRouter/Cloudflare fallback), a recorded variant fallback or a stock clip poster");
          if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) throw new Error("IMAGE_AI artifact must be a supported image file");
          const { width, height } = await imageInspector(filePath);
          const ratio = width / height;
          if (width < 720 || height < 1280 || Math.abs(ratio - 9 / 16) > 0.01) {
            throw new Error(`IMAGE_AI artifact must be vertical 9:16 at 720x1280 or larger; got ${width}x${height}`);
          }
        }
        accepted.push({ ...artifact, scene_index: sceneIndex, file_path: filePath });
      } catch (error) {
        issues.push({ scene_index: sceneIndex, code: "ARTIFACT_INVALID", artifact_type: type, message: error.message });
      }
    }
  }
  return { passed: issues.length === 0, issues, accepted_artifacts: accepted, scene_count: scenes.length };
}
