import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { backoffMs, generateGeminiJson, retryAfterMs } from "../matrix/story/gemini-json.mjs";
import { FileTokenBucket } from "../matrix/story/rate-limiter.mjs";

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key";
const LIMITER_URL = new URL("../matrix/story/rate-limiter.mjs", import.meta.url).href;

function reply(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}
const success = (value) => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });

function harness(responses) {
  const calls = [];
  const waits = [];
  const limiter = { acquired: 0, cooldowns: [], acquire: async () => { limiter.acquired += 1; }, cooldown: async (ms) => { limiter.cooldowns.push(ms); } };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const run = (options = {}) => generateGeminiJson({
    systemPrompt: "s", userPrompt: "u", fetchImpl, limiter, sleep: async (ms) => { waits.push(ms); },
    random: () => 0.5, models: ["model-a", "model-b"], ...options,
  });
  return { calls, waits, limiter, run };
}

test("client errors are not retried and never switch models", async () => {
  const h = harness([reply(400, { error: { message: "bad request" } })]);
  await assert.rejects(h.run(), (error) => error.status === 400 && !error.retryable);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.waits, []);
});

test("5xx, network errors and invalid JSON retry with backoff, then succeed", async () => {
  const h = harness([
    reply(503, "overloaded"),
    new TypeError("fetch failed"),
    reply(200, { candidates: [{ content: { parts: [{ text: "{not json" }] } }] }),
    success({ ok: true }),
  ]);
  assert.deepEqual(await h.run(), { ok: true });
  assert.equal(h.calls.length, 4);
  assert.deepEqual(h.waits, [1000, 2000, 4000]);  // full jitter với random=0.5
  assert.equal(h.limiter.acquired, 4);
});

test("429 honours Retry-After and pauses every process through the shared limiter", async () => {
  const h = harness([reply(429, "quota", { "retry-after": "17" }), success({ ok: 1 })]);
  assert.deepEqual(await h.run(), { ok: 1 });
  assert.deepEqual(h.limiter.cooldowns, [17000]);
  assert.deepEqual(h.waits, [17000]);
});

test("a missing model falls through to the next model without waiting", async () => {
  const h = harness([reply(404, "model not found"), success({ from: "b" })]);
  assert.deepEqual(await h.run(), { from: "b" });
  assert.match(h.calls[0].url, /model-a/);
  assert.match(h.calls[1].url, /model-b/);
  assert.deepEqual(h.waits, []);
});

test("exhausted retries on one model move to the fallback model", async () => {
  const h = harness([reply(503, "x"), reply(503, "x"), success({ from: "b" })]);
  assert.deepEqual(await h.run({ maxAttempts: 2 }), { from: "b" });
  assert.equal(h.calls.length, 3);
});

test("safety blocks are permanent", async () => {
  const h = harness([reply(200, { promptFeedback: { blockReason: "SAFETY" } })]);
  await assert.rejects(h.run(), /blocked/);
  assert.equal(h.calls.length, 1);
});

test("responseSchema is sent in generationConfig when given", async () => {
  const h = harness([success({}), success({})]);
  await h.run({ responseSchema: { type: "OBJECT", properties: { a: { type: "STRING" } } } });
  await h.run();
  assert.deepEqual(JSON.parse(h.calls[0].init.body).generationConfig.responseSchema.properties.a, { type: "STRING" });
  assert.equal("responseSchema" in JSON.parse(h.calls[1].init.body).generationConfig, false);
});

test("the API key travels in a header, not the URL", async () => {
  const h = harness([success({})]);
  await h.run();
  assert.doesNotMatch(h.calls[0].url, /key=/);
  assert.equal(h.calls[0].init.headers["x-goog-api-key"], process.env.GEMINI_API_KEY);
});

test("retry delay parsing and backoff bounds", () => {
  assert.equal(retryAfterMs(new Headers({ "retry-after": "3" }), ""), 3000);
  assert.equal(retryAfterMs(new Headers(), '{"error":{"details":[{"retryDelay":"12.5s"}]}}'), 12500);
  assert.equal(retryAfterMs(new Headers(), "nothing"), null);
  assert.equal(backoffMs(10, { random: () => 1 }), 60000);
  assert.equal(backoffMs(1, { random: () => 0 }), 0);
});

test("file token bucket enforces RPM and shares cooldowns between instances", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-bucket-"));
  try {
    let clock = 1_000_000;
    const options = { statePath: path.join(dir, "rate.json"), rpm: 2, tpm: 10_000, now: () => clock };
    const a = new FileTokenBucket(options);
    const b = new FileTokenBucket(options);           // như một process khác đọc cùng file
    assert.equal(await a.tryAcquire(100), 0);
    assert.equal(await b.tryAcquire(100), 0);
    assert.equal(await a.tryAcquire(100), 30000);     // hết 2 request/phút → chờ 30 s
    clock += 30000;
    assert.equal(await b.tryAcquire(100), 0);
    await b.cooldown(5000);
    clock += 60000;
    assert.equal(await a.tryAcquire(100), 0);
    await a.cooldown(10000);
    assert.equal(await b.tryAcquire(100), 10000);
    assert.equal(await a.tryAcquire(20_000), 10000);  // yêu cầu vượt TPM bị kẹp lại, không treo mãi
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("separate OS processes share one bucket", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-bucket-proc-"));
  const statePath = path.join(dir, "rate.json");
  const script = `
    const { FileTokenBucket } = await import(${JSON.stringify(LIMITER_URL)});
    const bucket = new FileTokenBucket({ statePath: ${JSON.stringify(statePath)}, rpm: 600, tpm: 1e9 });
    const granted = [];
    for (let i = 0; i < 20; i += 1) { if ((await bucket.tryAcquire(1)) === 0) granted.push(i); }
    console.log(granted.length);
  `;
  try {
    // Còn 45 lượt: 3 process × 20 lần thử chỉ được cấp đúng phần còn lại + phần hồi trong lúc chạy.
    fs.writeFileSync(statePath, JSON.stringify({ requests: 45, tokens: 1e9, blocked_until: 0, updated_at: Date.now() }));
    const run = () => promisify(execFile)(process.execPath, ["--input-type=module", "-e", script]);
    const started = Date.now();
    const results = await Promise.all([run(), run(), run()]);
    const refilled = Math.ceil(((Date.now() - started) / 60_000) * 600);  // 10 lượt/giây hồi lại
    const granted = results.reduce((sum, { stdout }) => sum + Number(stdout.trim()), 0);
    assert.ok(granted >= 45 && granted <= 45 + refilled, `granted ${granted}, allowed ≤ ${45 + refilled}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
