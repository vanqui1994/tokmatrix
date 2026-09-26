import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, listSceneArtifacts, updateSceneMask } from "./job-manager.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");

function requiredTypes(scene) {
  const requirements = scene.required_artifacts || scene.artifacts || [];
  return [...new Set(requirements.map((item) => typeof item === "string" ? item : item.artifact_type || item.type).filter(Boolean))];
}

function fileDigest(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function isValidArtifact(artifact, baseDir) {
  if (artifact.status !== "READY" || !/^[a-f0-9]{64}$/i.test(artifact.checksum || "")) return false;
  const filePath = path.isAbsolute(artifact.file_path)
    ? artifact.file_path
    : path.resolve(baseDir, artifact.file_path);
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() && stat.size > 0 && (await fileDigest(filePath)) === artifact.checksum.toLowerCase();
  } catch {
    return false;
  }
}

export async function planSceneResume({ manifest, artifacts = [], baseDir = PROJECT_ROOT } = {}) {
  const scenes = manifest?.storyboard?.scenes || manifest?.scenes;
  if (!Array.isArray(scenes)) throw new Error("Job manifest must contain a scenes array");

  const indexes = scenes.map((scene, offset) => Number(scene.scene_index ?? offset + 1));
  if (indexes.some((index) => !Number.isInteger(index) || index < 1) || new Set(indexes).size !== indexes.length) {
    throw new Error("Manifest scene_index values must be unique positive integers");
  }
  const artifactResults = await Promise.all(artifacts.map(async (artifact) => ({
    artifact,
    valid: await isValidArtifact(artifact, baseDir),
  })));
  const validByScene = new Map();
  for (const { artifact, valid } of artifactResults) {
    if (!valid) continue;
    const types = validByScene.get(Number(artifact.scene_index)) || new Set();
    types.add(artifact.artifact_type);
    validByScene.set(Number(artifact.scene_index), types);
  }

  const completedScenes = [];
  const pendingScenes = [];
  const mask = [];
  for (let offset = 0; offset < scenes.length; offset += 1) {
    const scene = scenes[offset];
    const index = indexes[offset];
    const required = requiredTypes(scene);
    const available = validByScene.get(index) || new Set();
    const complete = required.length > 0 && required.every((type) => available.has(type));
    mask.push(complete ? 1 : 0);
    (complete ? completedScenes : pendingScenes).push(index);
  }

  return {
    completedScenes,
    pendingScenes,
    resumeFromSceneIndex: pendingScenes[0] ?? null,
    reusableArtifacts: artifactResults.filter(({ valid }) => valid).map(({ artifact }) => artifact),
    invalidArtifacts: artifactResults.filter(({ valid }) => !valid).map(({ artifact }) => artifact),
    completedScenesMask: mask,
  };
}

export async function getSceneResumePlan(jobId, { dbPath, baseDir = PROJECT_ROOT } = {}) {
  const job = await getJob({ job_id: jobId, dbPath });
  if (!job) throw new Error(`job not found: ${jobId}`);
  const artifacts = await listSceneArtifacts({ job_id: jobId, dbPath });
  const plan = await planSceneResume({ manifest: job.manifest, artifacts, baseDir });
  if (plan.completedScenesMask.length !== job.total_scenes) {
    throw new Error(`manifest has ${plan.completedScenesMask.length} scenes but job expects ${job.total_scenes}`);
  }
  await updateSceneMask({ job_id: jobId, mask: plan.completedScenesMask, dbPath });
  return plan;
}
