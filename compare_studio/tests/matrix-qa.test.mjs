import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeMatrixDb, registerTopic, searchRegistry } from "../matrix/orchestrator/job-manager.mjs";
import { checkScriptSimilarity, scriptHash } from "../matrix/qa/similarity-check.mjs";
import { checkScriptQuality } from "../matrix/qa/script-qa.mjs";
import { evaluateAndRegisterScript } from "../matrix/qa/content-registry.mjs";

const channel = {
  channel_id: "mystery_01",
  niche_id: "unsolved_mysteries",
  audio: { voice_speed: 1 },
  story: { target_duration_seconds: 52 },
};
const cleanScript = {
  title: "Một hồ sơ chưa khép lại",
  scenes: [
    { line: "Vì sao tín hiệu cuối cùng xuất hiện ở đúng thời điểm ấy?", visual_intent: "A dated archive map" , estimated_duration_seconds: 2.5 },
    { line: "Các bản ghi công khai cho thấy ba mốc thời gian không trùng khớp.", visual_intent: "Three evidence cards", estimated_duration_seconds: 4 },
  ],
};

test("similarity pipeline rejects exact hashes and uses versioned niche thresholds", async () => {
  const text = "Một kịch bản có dữ kiện và cách kể riêng.";
  const exact = await checkScriptSimilarity(text, {
    nicheId: "unsolved_mysteries",
    registry: [{ content_id: "prior", full_script: text, script_hash: scriptHash(text) }],
  });
  assert.equal(exact.decision, "REJECT");
  assert.equal(exact.reason, "exact_hash");

  const policy = await checkScriptSimilarity("Nội dung hoàn toàn khác chủ đề và cách diễn đạt.", {
    nicheId: "deep_space", registry: [],
  });
  assert.equal(policy.decision, "PASS");
  assert.equal(policy.threshold, 0.62);
  assert.deepEqual(policy.thresholds, { lexical: 0.3, tfidf: 0.62, embedding: 0.9 });
  assert.equal(policy.policy_version, 2);
});

test("similarity rejection can use TF-IDF/Jaccard shortlist and optional embedding cosine", async () => {
  const script = "The vessel crossed the dark ocean before the final radio signal vanished from the northern route.";
  const near = "The vessel crossed the dark ocean before the final radio signal disappeared from the northern route.";
  let embeddedText = "";
  const result = await checkScriptSimilarity(script, {
    nicheId: "unsolved_mysteries",
    registry: [{ content_id: "near", full_script: near, embedding_vector: [1, 0] }],
    embeddingProvider: async (text) => { embeddedText = text; return [1, 0]; },
  });
  assert.equal(result.decision, "REJECT");
  assert.equal(result.embedding_checked, true);
  assert.equal(embeddedText, script);
});

test("script QA gates length, opening hook and configured safety phrases", () => {
  const pass = checkScriptQuality({ script: cleanScript, channel });
  assert.equal(pass.status, "PASS");
  const fail = checkScriptQuality({
    script: { scenes: [{ line: "Chữa khỏi mọi bệnh chỉ với một mẹo.", visual_intent: "Claim card", estimated_duration_seconds: 4 }] },
    channel,
  });
  assert.equal(fail.status, "FAIL");
  assert.equal(fail.checks.hook_window, false);
  assert.equal(fail.checks.safety, false);
  const tooLong = checkScriptQuality({
    script: { scenes: [
      { line: "Opening hook", visual_intent: "Title", duration: 2 },
      { line: "Long narration", visual_intent: "Evidence", duration: 30 },
      { line: "More narration", visual_intent: "Payoff", duration: 30 },
    ] },
    channel,
  });
  assert.equal(tooLong.checks.max_duration, false);
});

test("registry integration never stores scripts that fail either QA gate", async () => {
  let writes = 0;
  const rejected = await evaluateAndRegisterScript({
    script: cleanScript,
    channel,
    topicId: "topic-1",
    engineType: "mystery",
    angle: { title: "A new angle", hook: "Opening hook" },
    blueprintId: "mystery_reveal",
    registry: [{ content_id: "near", full_script: cleanScript.scenes.map((scene) => scene.line).join(" "), script_hash: scriptHash(cleanScript) }],
    registryWriter: async () => { writes += 1; },
  });
  assert.equal(rejected.registered, false);
  assert.equal(writes, 0);

  let registeredEntry;
  const accepted = await evaluateAndRegisterScript({
    script: cleanScript,
    channel,
    topicId: "topic-1",
    engineType: "mystery",
    angle: { title: "A distinct angle", hook: "A focused opening question" },
    blueprintId: "mystery_reveal",
    registry: [],
    registryWriter: async ({ entry }) => { registeredEntry = entry; },
  });
  assert.equal(accepted.registered, true);
  assert.equal(registeredEntry.similarity_decision, "PASS");
  assert.equal(registeredEntry.script_qa_status, "PASS");
  assert.equal(registeredEntry.similarity_policy_version, 2);
});

test("approved scripts persist to the niche registry and exact duplicates are rejected on the next run", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-registry-test-"));
  const dbPath = path.join(directory, "matrix_factory.db");
  try {
    await initializeMatrixDb({ dbPath });
    await registerTopic({ topic_id: "topic-1", title: "Mystery topic", niche_id: channel.niche_id, dbPath });
    execFileSync("python3", ["-c", [
      "import sqlite3,sys",
      "c=sqlite3.connect(sys.argv[1])",
      "c.execute(\"INSERT INTO channels(channel_id,niche_id,channel_name,persona_tone,preferred_voice_id,visual_style_id,created_at) VALUES('mystery_01','unsolved_mysteries','Mystery 01','investigative','vi-VN-NamMinhNeural','dark_mystery_v1',1)\")",
      "c.commit()",
      "c.close()",
    ].join(";"), dbPath]);
    const args = {
      script: cleanScript, channel, topicId: "topic-1", jobId: "job-1", engineType: "mystery",
      angle: { title: "A distinct angle", hook: "A focused opening question" },
      blueprintId: "mystery_reveal", dbPath,
    };
    const accepted = await evaluateAndRegisterScript(args);
    assert.equal(accepted.registered, true);
    const records = await searchRegistry({ niche_id: channel.niche_id, dbPath });
    assert.equal(records.length, 1);
    assert.equal(records[0].similarity_policy_version, 2);
    const retry = await evaluateAndRegisterScript(args);
    assert.equal(retry.registered, true);
    assert.equal(retry.content_id, accepted.content_id);
    const duplicate = await evaluateAndRegisterScript({ ...args, jobId: "job-2" });
    assert.equal(duplicate.registered, false);
    assert.equal(duplicate.similarity.reason, "exact_hash");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("each similarity tier is judged against its own threshold", async () => {
  const base = "Năm 1971 các nhà thiên văn phát hiện Cygnus X-1 quay quanh một ngôi sao xanh khổng lồ và phát ra tia X rất mạnh suốt nhiều thập kỷ liền.";
  const edited = base.replace("rất mạnh", "cực mạnh").replace("nhiều thập kỷ", "hàng chục năm");
  const lexical = await checkScriptSimilarity(edited, {
    nicheId: "deep_space", registry: [{ content_id: "prior", full_script: base }], threshold: 0.99,
  });
  assert.equal(lexical.decision, "REJECT");
  assert.equal(lexical.tier, "lexical");
  assert.equal(lexical.reason, "lexical_overlap");
  assert.equal(lexical.threshold, 0.3);

  const distinct = await checkScriptSimilarity("Dưới đáy đại dương có những sinh vật phát sáng chưa từng được đặt tên.", {
    nicheId: "deep_space", registry: [{ content_id: "prior", full_script: base }],
  });
  assert.equal(distinct.decision, "PASS");
  assert.ok(distinct.scores.lexical < 0.3);
});

test("embedding tier covers every stored vector but skips siblings of the same topic", async () => {
  const registry = [
    { content_id: "sibling", topic_id: "topic-a", full_script: "Một góc kể hoàn toàn khác về sao neutron.", embedding_vector: [1, 0] },
  ];
  const text = "Kịch bản mới với câu chữ riêng về vật thể đặc nhất vũ trụ.";
  const sameTopic = await checkScriptSimilarity(text, {
    nicheId: "deep_space", topicId: "topic-a", registry, embeddingProvider: async () => [1, 0],
  });
  assert.equal(sameTopic.decision, "PASS");
  assert.equal(sameTopic.embedding_checked, false);
  const otherTopic = await checkScriptSimilarity(text, {
    nicheId: "deep_space", topicId: "topic-b", registry, embeddingProvider: async () => [1, 0],
  });
  assert.equal(otherTopic.decision, "REJECT");
  assert.equal(otherTopic.reason, "semantic_paraphrase");
  assert.equal(otherTopic.match.content_id, "sibling");
});

test("concurrent registrations in one niche cannot both pass the duplicate check", async () => {
  const registry = [];
  const registryWriter = async ({ entry }) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    registry.push(entry);
  };
  const args = {
    script: cleanScript, channel, topicId: "topic-1", engineType: "mystery",
    angle: { title: "A", hook: "B" }, blueprintId: "mystery_reveal", registry, registryWriter,
  };
  const [first, second] = await Promise.all([
    evaluateAndRegisterScript({ ...args, jobId: "job-a" }),
    evaluateAndRegisterScript({ ...args, jobId: "job-b" }),
  ]);
  assert.deepEqual([first.registered, second.registered].sort(), [false, true]);
  assert.equal(registry.length, 1);
});
