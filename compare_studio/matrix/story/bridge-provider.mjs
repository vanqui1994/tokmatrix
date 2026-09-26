import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pythonBin() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const venv = path.join(PROJECT_ROOT, "venv/bin/python");
  return fs.existsSync(venv) ? venv : "python3";
}

/** Gọi bkt_web.script_queue_cli (một dòng JSON vào, một dòng JSON ra). */
export function callScriptQueue(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), ["-m", "bkt_web.script_queue_cli"], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PYTHONPATH: [PROJECT_ROOT, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", () => {
      try {
        const response = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "{}");
        if (response.ok) resolve(response.result);
        else reject(new Error(response.error || stderr.trim() || "script queue call failed"));
      } catch {
        reject(new Error(stderr.trim() || `script_queue_cli returned invalid output: ${stdout.slice(0, 200)}`));
      }
    });
    const dbPath = process.env.MATRIX_SCRIPT_QUEUE_DB;  // test dùng DB tạm
    child.stdin.end(JSON.stringify(dbPath ? { ...payload, db_path: dbPath } : payload));
  });
}

function languageOf(userPrompt) {
  const match = String(userPrompt).match(/\(([a-z]{2})\) only/u);
  return match ? match[1] : "en";
}

/**
 * Provider cùng chữ ký với generateGeminiJson, nhưng giao việc cho agent Antigravity qua Hàng Đợi
 * Kịch Bản (task `matrix`) rồi chờ kết quả. Không cần API key; chậm hơn (agent chạy theo lượt).
 */
export function makeBridgeProvider({
  call = callScriptQueue,
  pollMs = Number(process.env.MATRIX_BRIDGE_POLL_MS || 10_000),
  timeoutMs = Number(process.env.MATRIX_BRIDGE_TIMEOUT_MS || 45 * 60_000),
  sleep = sleepMs,
  now = Date.now,
} = {}) {
  return async function bridgeProvider({ systemPrompt, userPrompt, responseSchema } = {}) {
    const schemaBlock = responseSchema
      ? `\n\n## JSON schema bắt buộc (kiểu viết HOA theo Gemini: OBJECT/ARRAY/STRING)\n\n${JSON.stringify(responseSchema, null, 2)}`
      : "";
    const { task_id: taskId } = await call({
      op: "enqueue",
      video_type: "matrix",
      lang: languageOf(userPrompt),
      prompt: `${systemPrompt}\n\n${userPrompt}${schemaBlock}`,
      extra_params: { response_schema: responseSchema || null, source: "ai-matrix" },
    });
    const started = now();
    for (;;) {
      await sleep(pollMs);
      const task = await call({ op: "get", task_id: taskId });
      if (task.status === "completed") {
        const script = typeof task.script_json === "string" ? JSON.parse(task.script_json) : task.script_json;
        if (!script || typeof script !== "object") throw new Error(`bridge task ${taskId} completed without JSON`);
        return script;
      }
      if (task.status === "failed") {
        const error = new Error(`bridge task ${taskId} failed: ${task.error_message || "unknown"}`);
        error.retryable = true;
        throw error;
      }
      if (now() - started > timeoutMs) {
        await call({ op: "fail", task_id: taskId, error: `Matrix hết thời gian chờ ${Math.round(timeoutMs / 60_000)} phút` }).catch(() => {});
        const error = new Error(`bridge task ${taskId} timed out after ${Math.round(timeoutMs / 60_000)} minutes`);
        error.retryable = true;
        throw error;
      }
    }
  };
}
