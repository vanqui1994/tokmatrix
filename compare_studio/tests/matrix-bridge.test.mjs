import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { makeBridgeProvider } from "../matrix/story/bridge-provider.mjs";
import { selectProvider } from "../matrix/story/llm-provider.mjs";
import { generateAngles } from "../matrix/planner/angle-generator.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const noSleep = async () => {};
const PYTHON = fs.existsSync(path.join(PROJECT_ROOT, "venv/bin/python")) ? path.join(PROJECT_ROOT, "venv/bin/python") : "python3";

function fakeQueue(statuses) {
  const calls = [];
  const call = async (payload) => {
    calls.push(payload);
    if (payload.op === "enqueue") return { task_id: "script_1" };
    if (payload.op === "fail") return { failed: true };
    return statuses.shift();
  };
  return { calls, call };
}

test("bridge provider enqueues prompt + schema and returns the agent's JSON", async () => {
  const q = fakeQueue([{ status: "pending" }, { status: "processing" }, { status: "completed", script_json: '{"angles":[1]}' }]);
  const provider = makeBridgeProvider({ call: q.call, sleep: noSleep });
  const result = await provider({ systemPrompt: "SYS", userPrompt: "Write in German (de) only", responseSchema: { type: "OBJECT" } });
  assert.deepEqual(result, { angles: [1] });
  const enqueue = q.calls[0];
  assert.equal(enqueue.video_type, "matrix");
  assert.equal(enqueue.lang, "de");
  assert.match(enqueue.prompt, /SYS[\s\S]*German[\s\S]*JSON schema bắt buộc[\s\S]*"OBJECT"/);
});

test("failed and timed-out bridge tasks raise retryable errors", async () => {
  const failed = fakeQueue([{ status: "failed", error_message: "agent trả JSON không hợp lệ" }]);
  await assert.rejects(makeBridgeProvider({ call: failed.call, sleep: noSleep })({ userPrompt: "x" }),
    (error) => error.retryable && /không hợp lệ/.test(error.message));

  let clock = 0;
  const slow = fakeQueue(Array(10).fill({ status: "processing" }));
  const provider = makeBridgeProvider({ call: slow.call, sleep: async () => { clock += 60_000; }, now: () => clock, timeoutMs: 120_000 });
  await assert.rejects(provider({ userPrompt: "x" }), /timed out/);
  assert.equal(slow.calls.at(-1).op, "fail");
});

test("auto mode falls back to the bridge only for quota/temporary Gemini errors", async () => {
  const bridge = async () => ({ from: "bridge" });
  const quota = Object.assign(new Error("429"), { status: 429, retryable: true });
  assert.deepEqual(await selectProvider("auto", { gemini: async () => { throw quota; }, bridge })({}), { from: "bridge" });
  const badRequest = Object.assign(new Error("400"), { status: 400, retryable: false });
  await assert.rejects(selectProvider("auto", { gemini: async () => { throw badRequest; }, bridge })({}), /400/);
  assert.equal(selectProvider("bridge", { gemini: null, bridge }), bridge);
  assert.throws(() => selectProvider("openai"), /không hợp lệ/);
});

test("end to end: angles written by the Antigravity agent through the real script queue", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-bridge-e2e-"));
  const db = path.join(dir, "queue.db");
  const bridgeDir = path.join(dir, "bridge");
  process.env.MATRIX_SCRIPT_QUEUE_DB = db;
  // "Agent" giả: kéo task vào inbox, đọc .md, ghi JSON vào outbox, rồi worker nhập kết quả.
  const agent = spawn(PYTHON, ["-c", `
import json, os, sys, time, pathlib
sys.path.insert(0, ${JSON.stringify(PROJECT_ROOT)})
from bkt_web import script_routes as routes, script_bridge_worker as worker
routes.DB_PATH = pathlib.Path(${JSON.stringify(db)})
deadline = time.time() + 60
while time.time() < deadline:
    if routes.DB_PATH.exists():
        worker.pull_once()
        for md in (worker._dirs()["inbox"]).glob("*.md"):
            text = md.read_text()
            assert "JSON schema" in text and "Black holes" in text
            out = worker._dirs()["outbox"] / (md.stem + ".json")
            if not out.exists():
                out.write_text(json.dumps({"angles": [{"title": "Schwarze Löcher", "angle": "Wohin geht das Licht?", "hook": "Licht verschwindet.", "evidence_set": ["EHT-Bild 2019"], "narrative_structure": ["Frage", "Beweis", "Antwort"], "hook_type": "question"}]}))
                os.utime(out, (time.time() - 5, time.time() - 5))
        if worker.import_once():
            break
    time.sleep(0.2)
`], { env: { ...process.env, TOKMATRIX_SCRIPT_BRIDGE_DIR: bridgeDir }, stdio: ["ignore", "inherit", "inherit"] });
  try {
    const angles = await generateAngles("Black holes", {
      maxCount: 1, language: "de", provider: makeBridgeProvider({ pollMs: 300, timeoutMs: 60_000 }),
    });
    assert.equal(angles[0].title, "Schwarze Löcher");
    assert.equal(angles[0].angle_id, "angle_01");
  } finally {
    agent.kill();
    delete process.env.MATRIX_SCRIPT_QUEUE_DB;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
