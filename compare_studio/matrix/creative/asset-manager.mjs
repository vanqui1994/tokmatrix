import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI_IMAGE_SOURCES, ensureAntigravityImages, readImageState } from "../../tools/antigravity-images.mjs";
import { recordSceneArtifact } from "../orchestrator/job-manager.mjs";
import { renderNativeArtifact } from "./native-artifact-renderer.mjs";
import { directSceneVisuals } from "./visual-director.mjs";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VISUAL_ARTIFACT_TYPE = {
  IMAGE_AI: "image", CANVAS: "canvas", SVG: "svg", TEXT: "text",
  MAP: "map", CHART: "chart", EXISTING_ASSET: "existing_asset",
};

function sceneList(manifest) {
  return manifest?.storyboard?.scenes || manifest?.scenes;
}

async function assertExistingAsset(scene, baseDir) {
  const filePath = existingAssetPath(scene, baseDir);
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) throw new Error(`EXISTING_ASSET file is missing or empty for scene ${scene.scene_index}`);
  return filePath;
}

function existingAssetPath(scene, baseDir) {
  if (!scene.asset_path) throw new Error(`scene ${scene.scene_index} requires asset_path for EXISTING_ASSET`);
  return path.isAbsolute(scene.asset_path) ? scene.asset_path : path.resolve(baseDir, scene.asset_path);
}

export async function prepareSceneAssets({
  jobId,
  manifest,
  channel,
  engineType,
  projectDir = path.join(PROJECT_DIR, "projects", jobId),
  baseDir = PROJECT_DIR,
  timeoutMin = 0,
  imageGenerator = ensureAntigravityImages,
  imageStateReader = readImageState,
  artifactRenderer = renderNativeArtifact,
  recordArtifact = recordSceneArtifact,
  dbPath,
  log = () => {},
} = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(jobId || "")) throw new Error("jobId must be a safe path component");
  const scenes = sceneList(manifest);
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error("storyboard manifest must contain at least one scene");
  const visuals = directSceneVisuals({ scenes, channel, engineType });
  const needsRenderer = visuals.some((scene) => !["IMAGE_AI", "EXISTING_ASSET"].includes(scene.asset_type));
  if (needsRenderer && typeof artifactRenderer !== "function") {
    throw new Error("non-image scenes require an explicit artifactRenderer; no AI-image fallback is allowed");
  }
  const existingAssets = new Map();
  for (const scene of visuals.filter((item) => item.asset_type === "EXISTING_ASSET")) {
    existingAssets.set(scene.scene_index, await assertExistingAsset(scene, baseDir));
  }
  await fs.mkdir(projectDir, { recursive: true });
  const imageItems = visuals.filter((scene) => scene.asset_type === "IMAGE_AI").map((scene) => ({
    key: `scene-${String(scene.scene_index).padStart(2, "0")}-image`,
    prompt: scene.image_prompt,
    negative: scene.negative_prompt,
    aspect: "9:16",
    dest: `scenes/scene_${String(scene.scene_index).padStart(2, "0")}/image.png`,
  }));
  const imageStatus = imageItems.length
    ? await imageGenerator({ dir: projectDir, slug: jobId, items: imageItems, timeoutMin, label: `Matrix ${jobId}`, log })
    : { ready: [], pending: [] };
  const readyImageKeys = new Set(imageStatus.ready || []);
  const updatedScenes = [];
  const pending = [];
  const registeredArtifacts = [];

  for (const scene of visuals) {
    const sceneIndex = scene.scene_index;
    const required = scene.required_artifacts;
    const visualType = VISUAL_ARTIFACT_TYPE[scene.asset_type];
    if (!required.includes(visualType)) throw new Error(`scene ${sceneIndex} is missing its visual artifact type ${visualType}`);
    const readyTypes = new Set();
    if (scene.asset_type === "IMAGE_AI") {
      const key = `scene-${String(sceneIndex).padStart(2, "0")}-image`;
      const item = imageItems.find((candidate) => candidate.key === key);
      const filePath = path.join(projectDir, item.dest);
      scene.asset_path = item.dest;
      if (readyImageKeys.has(key)) {
        const source = imageStateReader(projectDir).items?.[key]?.source;
        if (!AI_IMAGE_SOURCES.includes(source)) throw new Error(`IMAGE_AI asset ${key} is ready from ${source || "unknown source"}, not the AI image queue`);
        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat?.isFile() || stat.size === 0) throw new Error(`Antigravity marked ${key} ready but its file is missing`);
        const record = await recordArtifact({
          job_id: jobId, scene_index: sceneIndex, artifact_type: "image", file_path: filePath, dbPath,
        });
        registeredArtifacts.push(record);
        readyTypes.add("image");
        scene.asset_source = source;
      } else {
        pending.push({ scene_index: sceneIndex, asset_type: scene.asset_type, key, file_path: filePath });
        scene.asset_source = "pending";
      }
    } else {
      const output = scene.asset_type === "EXISTING_ASSET"
        ? { artifacts: [{ artifact_type: visualType, file_path: existingAssets.get(sceneIndex) }] }
        : await artifactRenderer({ scene, assetType: scene.asset_type, requiredArtifactTypes: [visualType], projectDir, channel, engineType });
      const artifacts = Array.isArray(output) ? output : output?.artifacts || [output];
      const artifact = artifacts.find((item) => item?.artifact_type === visualType);
      if (!artifact?.file_path) throw new Error(`artifact renderer omitted ${visualType} for scene ${sceneIndex}`);
      const artifactPath = path.isAbsolute(artifact.file_path) ? artifact.file_path : path.resolve(projectDir, artifact.file_path);
      scene.asset_path = path.relative(projectDir, artifactPath) || artifactPath;
      const record = await recordArtifact({
        job_id: jobId, scene_index: sceneIndex, artifact_type: visualType,
        file_path: artifactPath,
        checksum: artifact.checksum, dbPath,
      });
      registeredArtifacts.push(record);
      readyTypes.add(visualType);
      scene.asset_source = scene.asset_type === "EXISTING_ASSET" ? "existing_asset" : "native_renderer";
    }
    const visualReady = readyTypes.has(visualType);
    scene.asset_status = visualReady ? "READY" : "PENDING";
    if (!visualReady && scene.asset_type !== "IMAGE_AI") {
      pending.push({ scene_index: sceneIndex, asset_type: scene.asset_type, missing_artifacts: [visualType] });
    }
    updatedScenes.push(scene);
  }

  const updatedManifest = structuredClone(manifest);
  if (Array.isArray(updatedManifest.storyboard?.scenes)) updatedManifest.storyboard.scenes = updatedScenes;
  else updatedManifest.scenes = updatedScenes;
  updatedManifest.asset_pipeline = {
    version: 1,
    providers: { IMAGE_AI: "antigravity_queue", native: "engine_adapter" },
    scene_count: updatedScenes.length,
    pending_count: pending.length,
  };
  return {
    manifest: updatedManifest,
    ready: updatedScenes.filter((scene) => scene.asset_status === "READY").map((scene) => scene.scene_index),
    pending,
    artifacts: registeredArtifacts,
    project_dir: projectDir,
  };
}
