import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const defaultPython = () => {
  const venvPython = path.resolve(PROJECT_ROOT, "venv/bin/python");
  if (fs.existsSync(venvPython)) return venvPython;
  return "python3";
};
const PYTHON = process.env.PYTHON || defaultPython();
const initializationByDb = new Map();

function databasePath(args) {
  const { dbPath, ...payload } = args;
  return { dbPath, payload };
}

function callPython(operation, args = {}) {
  const { dbPath, payload } = databasePath(args);
  return new Promise((resolve, reject) => {
    const pythonPath = [PROJECT_ROOT, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
    const child = spawn(PYTHON, ["-m", "bkt_web.matrix_db"], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PYTHONPATH: pythonPath },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      let response;
      try {
        response = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "{}");
      } catch {
        reject(new Error(stderr.trim() || `matrix_db.py returned invalid JSON (exit ${code})`));
        return;
      }
      if (code !== 0 || !response.ok) {
        reject(new Error(response.error || stderr.trim() || `matrix_db.py exited ${code}`));
        return;
      }
      resolve(response.result);
    });
    child.stdin.end(JSON.stringify({ ...payload, op: operation, ...(dbPath ? { db_path: dbPath } : {}) }));
  });
}

export async function initializeMatrixDb({ dbPath } = {}) {
  const key = dbPath ? path.resolve(dbPath) : "<default>";
  if (initializationByDb.has(key)) return initializationByDb.get(key);
  const pending = callPython("init", { dbPath });
  initializationByDb.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    initializationByDb.delete(key);
    throw error;
  }
}

async function ensureInitialized(dbPath) {
  return initializeMatrixDb({ dbPath });
}

async function call(operation, args = {}) {
  const { dbPath } = databasePath(args);
  if (operation === "init") return initializeMatrixDb({ dbPath });
  await ensureInitialized(dbPath);
  return callPython(operation, args);
}

export const syncChannelConfigs = (args = {}) => call("sync_channel_configs", args);
export const registerTopic = (args) => call("register_topic", args);
export const createBatch = (args) => call("create_batch", args);
export const createJob = (args) => call("create_job", args);
export const getJob = (args) => call("get_job", typeof args === "string" ? { job_id: args } : args);
export const getBatch = (args) => call("get_batch", args);
export const listBatchJobs = (args) => call("list_batch_jobs", args);
export const updateJobManifest = (args) => call("update_job_manifest", args);
export const claimNextJob = (args) => call("claim_next_job", args);
export const heartbeatJob = (args) => call("heartbeat_job", args);
export const releaseJob = (args) => call("release_job", args);
export const transitionJob = (args) => call("transition_job", args);
export const deferJob = (args) => call("defer_job", args);
export const retryJob = (args) => call("retry_job", args);
export const updateSceneMask = (args) => call("update_scene_mask", args);
export const recordSceneArtifact = (args) => call("record_scene_artifact", args);
export const listSceneArtifacts = (args) => call("list_scene_artifacts", typeof args === "string" ? { job_id: args } : args);
export const createRegistryEntry = (args) => call("create_registry_entry", args);
export const searchRegistry = (args) => call("search_registry", args);
export const recordAnalyticsSnapshot = (args) => call("record_analytics_snapshot", args);
