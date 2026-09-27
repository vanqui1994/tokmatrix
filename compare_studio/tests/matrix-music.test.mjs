// Nhạc nền CC0 theo tài khoản: catalog (giấy phép/schema), chia pool tất định, lỗi khi thiếu file, kênh cũ không đổi.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  ALLOWED_LICENSES, CATALOG_PATH, MIN_TRACK_SECONDS, catalogProblems, loadCatalog, pickPoolTrack, resolveBgmSource,
} from "../matrix/creative/music-catalog.mjs";
import { NICHE_MOODS, applyMusic, assignMusic, eligibleTracks, musicSpread, planMusic } from "../tools/assign-music.mjs";
import { fetchAll } from "../tools/fetch-cc0-music.mjs";
import { orchestrateAudioForJob } from "../matrix/creative/audio-orchestrator.mjs";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";
import { validateConfigs } from "../tools/matrix-config-validator.mjs";
import { SOUNDSCAPE_PRESETS } from "../tools/soundscapes.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = loadCatalog(CATALOG_PATH);

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeTrack(id, body, extra = {}) {
  return {
    id, title: id, author: "Tester", source: "freepd", source_url: "https://example.org/page", original_url: "https://example.org/a.mp3",
    download_urls: ["https://example.org/a.mp3"], license: "CC0-1.0", license_url: ALLOWED_LICENSES["CC0-1.0"],
    license_evidence: "https://example.org/legal", sha256: crypto.createHash("sha256").update(body).digest("hex"),
    bytes: Buffer.byteLength(body), duration_seconds: 120, moods: ["mysterious"], ...extra,
  };
}

function fakeCatalog(tracks) {
  return { catalog_version: 1, sources: { freepd: { license: "CC0-1.0" } }, tracks };
}

test("CC0 catalog: every track is CC0 with author, source, licence evidence, sha256 and ≥ 95 s", () => {
  assert.deepEqual(catalogProblems(catalog), []);
  assert.ok(catalog.tracks.length >= 40, `only ${catalog.tracks.length} tracks`);
  for (const track of catalog.tracks) {
    assert.equal(track.license, "CC0-1.0", track.id);
    assert.equal(track.license_url, "https://creativecommons.org/publicdomain/zero/1.0/");
    assert.ok(track.author && track.title && track.source_url && track.license_evidence, track.id);
    assert.match(track.sha256, /^[0-9a-f]{64}$/u);
    assert.ok(track.duration_seconds >= MIN_TRACK_SECONDS, track.id);
    assert.ok(track.download_urls.every((url) => url.startsWith("https://")), track.id);
  }
  // Không có bài nào trong thư viện Kevin MacLeod CC-BY cũ (shared/audio/bgm) lọt vào catalog CC0.
  const legacy = new Set(fs.readdirSync(path.join(COMPARE_DIR, "shared", "audio", "bgm"))
    .map((name) => crypto.createHash("sha256").update(fs.readFileSync(path.join(COMPARE_DIR, "shared", "audio", "bgm", name))).digest("hex")));
  assert.ok(catalog.tracks.every((track) => !legacy.has(track.sha256)));
  // Mọi niche có đủ bài hợp mood để các acc cùng niche không phải dùng chung.
  for (const niche of Object.keys(NICHE_MOODS)) {
    assert.ok(eligibleTracks({ niche }, catalog.tracks).length >= 20, niche);
  }
});

test("CC0 catalog validator rejects CC-BY, missing author, short tracks, bad hashes and unknown moods", () => {
  const good = fakeTrack("freepd-good", "x");
  assert.deepEqual(catalogProblems(fakeCatalog([good])), []);
  const cases = [
    [{ license: "CC-BY-4.0" }, /not CC0\/public domain/u],
    [{ author: "" }, /author is required/u],
    [{ duration_seconds: 42 }, /duration_seconds/u],
    [{ sha256: "abc" }, /sha256/u],
    [{ moods: ["happy_hardcore"] }, /moods/u],
    [{ download_urls: ["http://insecure.example/a.mp3"] }, /download_urls/u],
    [{ license_url: "https://creativecommons.org/licenses/by/4.0/" }, /license_url/u],
  ];
  for (const [patch, pattern] of cases) {
    const errors = catalogProblems(fakeCatalog([{ ...good, ...patch }]));
    assert.ok(errors.some((error) => pattern.test(error)), `${JSON.stringify(patch)} → ${errors.join("; ")}`);
  }
  assert.ok(catalogProblems(fakeCatalog([good, { ...good }])).some((error) => /duplicate id/u.test(error)));
});

function syntheticChannels() {
  const out = [];
  for (const [lang, perNiche] of [["de", 7], ["en", 3], ["ja", 1]]) {
    for (const niche of ["unsolved_mysteries", "deep_space", "military_arsenal", "tech_ai_future"]) {
      for (let i = 1; i <= perNiche; i += 1) out.push({ channel_id: `${lang}_${niche}_${String(i).padStart(2, "0")}`, lang, niche, soundscape: "mystery" });
    }
  }
  return out;
}

test("music assignment is deterministic, spreads tracks per country and keeps accounts of a niche apart", () => {
  const channels = syntheticChannels();
  const rows = assignMusic(channels, catalog.tracks, { poolSize: 2 });
  assert.deepEqual(assignMusic([...channels].reverse(), catalog.tracks, { poolSize: 2 }), rows);
  assert.ok(rows.every((row) => row.status === "new" && row.pool.length === 2 && new Set(row.pool).size === 2));
  for (const row of rows) {
    const eligible = eligibleTracks(row, catalog.tracks);
    assert.ok(row.pool.every((track) => eligible.includes(track)), `${row.channel_id} got a track outside its moods`);
  }
  // Trong một (nước, niche) không bài nào lặp khi đủ bài hợp mood.
  const perNiche = new Map();
  for (const row of rows) for (const track of row.pool) {
    const key = `${row.lang}|${row.niche}|${track}`;
    perNiche.set(key, (perNiche.get(key) || 0) + 1);
  }
  assert.ok([...perNiche.values()].every((n) => n === 1));
  // Mỗi bài ≤ ceil(slot của nước / số bài) — với 28 kênh de × 2 = 56 slot / 57 bài → mỗi bài ≤ 1… 2.
  for (const [lang, counts] of Object.entries(musicSpread(rows))) {
    const slots = rows.filter((row) => row.lang === lang).length * 2;
    const cap = Math.ceil(slots / catalog.tracks.length);
    assert.ok(Math.max(...Object.values(counts)) <= Math.max(cap, 2), `${lang}: ${JSON.stringify(counts)}`);
  }
  // Chạy lại trên pool đã ghi: không đổi gì.
  const applied = channels.map((channel) => ({ ...channel, pool: rows.find((row) => row.channel_id === channel.channel_id).pool }));
  const again = assignMusic(applied, catalog.tracks, { poolSize: 2 });
  assert.ok(again.every((row) => row.status === "kept"));
  assert.deepEqual(again.map((row) => row.pool), rows.map((row) => row.pool));
  // Pool có bài đã rời catalog → chỉ kênh đó được chia lại.
  applied[0] = { ...applied[0], pool: ["freepd-gone", applied[0].pool[1]] };
  const repaired = assignMusic(applied, catalog.tracks, { poolSize: 2 });
  assert.deepEqual(repaired.filter((row) => row.status === "new").map((row) => row.channel_id), [applied[0].channel_id]);
});

test("real channel configs: every account gets a pool, far fewer accounts per track than the legacy BGM", () => {
  const plan = planMusic({ poolSize: 2 });
  assert.ok(plan.rows.length >= 180);
  assert.ok(plan.rows.every((row) => row.status !== "no_tracks" && row.pool.length === 2));
  const perTrack = new Map();
  for (const row of plan.rows) for (const track of row.pool) perTrack.set(track, (perTrack.get(track) || 0) + 1);
  // Trước đây một bài (carefree) phủ 101 kênh; giờ tối đa ~ ceil(237×2/57) + lệch mood.
  assert.ok(Math.max(...perTrack.values()) <= 16, `max ${Math.max(...perTrack.values())} channels on one track`);
  for (const [lang, counts] of Object.entries(musicSpread(plan.rows))) {
    const slots = plan.rows.filter((row) => row.lang === lang).length * 2;
    assert.ok(Math.max(...Object.values(counts)) <= Math.ceil(slots / catalog.tracks.length) + 2, lang);
  }
  // --lang chỉ lọc dòng, không đổi kết quả.
  const de = planMusic({ poolSize: 2, lang: "de" }).rows;
  assert.deepEqual(de, plan.rows.filter((row) => row.lang === "de"));
});

test("assign-music --apply writes audio.bgm_pool, bumps config_version once and re-runs as a no-op", () => {
  const dir = tmpdir("matrix-music-apply-");
  try {
    const source = path.join(COMPARE_DIR, "config", "channels");
    // Bản sao kênh thật nhưng bỏ bgm_pool (repo đã được gán) → mô phỏng kênh chưa có nhạc riêng.
    for (const name of fs.readdirSync(source).filter((file) => file.startsWith("deep_space_"))) {
      const doc = YAML.parseDocument(fs.readFileSync(path.join(source, name), "utf8"));
      doc.deleteIn(["audio", "bgm_pool"]);
      fs.writeFileSync(path.join(dir, name), doc.toString({ lineWidth: 0, indentSeq: false }));
    }
    const before = Object.fromEntries(fs.readdirSync(dir).map((name) => [name, YAML.parse(fs.readFileSync(path.join(dir, name), "utf8"))]));
    const written = applyMusic(planMusic({ dir }));
    assert.equal(written.length, Object.keys(before).length);
    for (const [name, old] of Object.entries(before)) {
      const now = YAML.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      assert.equal(now.config_version, old.config_version + 1);
      assert.equal(now.audio.bgm_pool.length, 2);
      assert.deepEqual({ ...now, config_version: old.config_version, audio: { ...now.audio, bgm_pool: undefined } },
        { ...old, audio: { ...old.audio, bgm_pool: undefined } });
    }
    assert.deepEqual(applyMusic(planMusic({ dir })), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveBgmSource: legacy channels keep the soundscape BGM, pool channels fail loudly on a missing/altered file", () => {
  const dir = tmpdir("matrix-music-resolve-");
  try {
    const body = "fake mp3 bytes";
    const track = fakeTrack("freepd-test-track", body);
    const catalogPath = path.join(dir, "catalog.json");
    fs.writeFileSync(catalogPath, JSON.stringify(fakeCatalog([track, fakeTrack("freepd-other", "other")])));
    const musicDir = path.join(dir, "cc0");
    const soundscape = { id: "mystery", ...SOUNDSCAPE_PRESETS.mystery };
    // Kênh cũ: đúng đường cũ, không cần catalog.
    const legacy = resolveBgmSource({ audio: { soundscape_id: "mystery" }, soundscape, seed: "job-1", catalogPath: path.join(dir, "absent.json"), musicDir });
    assert.equal(legacy.track, null);
    assert.equal(legacy.path, path.join(COMPARE_DIR, "shared", "audio", "bgm", "anxiety.mp3"));
    const audio = { bgm_pool: ["freepd-test-track"] };
    assert.throws(() => resolveBgmSource({ audio, soundscape, seed: "job-1", catalogPath, musicDir }), /freepd-test-track is missing: .*fetch-cc0-music/u);
    fs.mkdirSync(musicDir);
    fs.writeFileSync(path.join(musicDir, "freepd-test-track.mp3"), "tampered");
    assert.throws(() => resolveBgmSource({ audio, soundscape, seed: "job-1", catalogPath, musicDir }), /sha256/u);
    fs.writeFileSync(path.join(musicDir, "freepd-test-track.mp3"), body);
    const picked = resolveBgmSource({ audio, soundscape, seed: "job-1", catalogPath, musicDir });
    assert.equal(picked.track.id, "freepd-test-track");
    assert.equal(picked.path, path.join(musicDir, "freepd-test-track.mp3"));
    assert.throws(() => resolveBgmSource({ audio: { bgm_pool: ["freepd-nope"] }, soundscape, seed: "job-1", catalogPath, musicDir }), /not in catalog/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pickPoolTrack is stable per job and rotates videos of one channel across its pool", () => {
  const pool = ["a-track", "b-track", "c-track"];
  assert.equal(pickPoolTrack(pool, "job-42"), pickPoolTrack(pool, "job-42"));
  const seen = new Set(Array.from({ length: 30 }, (_, i) => pickPoolTrack(pool, `job-${i}`)));
  assert.deepEqual([...seen].sort(), pool);
  assert.throws(() => pickPoolTrack([], "job"), /empty/u);
});

async function runAudio({ channel, projectDir, musicCatalogPath, musicDir, jobId = "job-music-01" }) {
  return orchestrateAudioForJob({
    jobId, projectDir, channel, musicCatalogPath, musicDir,
    manifest: { scenes: [{ scene_index: 1, line: "Where does the light go?", visual_intent: "A dark disc" }] },
    artifactReader: async () => [],
    artifactWriter: async (args) => ({ ...args, checksum: "x", status: "READY" }),
    voiceSynthesizer: async ({ outPath }) => fs.writeFileSync(outPath, "tts"),
    durationProbe: async () => 3,
    sfxDetector: () => [],
  });
}

function withPool(base, pool) {
  const dna = base.resolved_config.channel;
  return { ...base, resolved_config: { ...base.resolved_config, channel: { ...dna, audio: { ...dna.audio, bgm_pool: pool } } } };
}

test("audio orchestration: legacy channel unchanged, pool channel copies its CC0 track and records it, missing file fails", async () => {
  const dir = tmpdir("matrix-music-audio-");
  try {
    // Kênh legacy = kênh thật bỏ bgm_pool (repo đã gán nhạc riêng cho mọi kênh).
    const base = structuredClone(resolveChannelsForTopic("deep_space", 1)[0]);
    delete base.resolved_config.channel.audio.bgm_pool;
    assert.equal(base.resolved_config.channel.audio.bgm_pool, undefined);
    const legacy = await runAudio({ channel: base, projectDir: path.join(dir, "legacy"), musicCatalogPath: path.join(dir, "absent.json"), musicDir: path.join(dir, "absent") });
    assert.equal("bgm_track" in legacy.manifest.audio, false);
    assert.equal(legacy.bgm_track, null);
    const legacySource = path.join(COMPARE_DIR, "shared", "audio", "bgm", `${base.resolved_config.soundscape.defaultBgm}.mp3`);
    assert.deepEqual(fs.readFileSync(legacy.bgm_path), fs.readFileSync(legacySource));

    const body = "cc0 music bytes";
    const catalogPath = path.join(dir, "catalog.json");
    fs.writeFileSync(catalogPath, JSON.stringify(fakeCatalog([fakeTrack("freepd-own-track", body)])));
    const musicDir = path.join(dir, "cc0");
    const channel = withPool(base, ["freepd-own-track"]);
    let synthesized = 0;
    await assert.rejects(() => orchestrateAudioForJob({
      jobId: "job-music-02", projectDir: path.join(dir, "missing"), channel, musicCatalogPath: catalogPath, musicDir,
      manifest: { scenes: [{ scene_index: 1, line: "x", visual_intent: "y" }] },
      artifactReader: async () => [], artifactWriter: async (args) => args, voiceSynthesizer: async () => { synthesized += 1; },
    }), /freepd-own-track is missing/u);
    assert.equal(synthesized, 0);
    assert.equal(fs.existsSync(path.join(dir, "missing", "assets", "audio", "bgm.mp3")), false);

    fs.mkdirSync(musicDir);
    fs.writeFileSync(path.join(musicDir, "freepd-own-track.mp3"), body);
    const own = await runAudio({ channel, projectDir: path.join(dir, "own"), musicCatalogPath: catalogPath, musicDir });
    assert.equal(fs.readFileSync(own.bgm_path, "utf8"), body);
    assert.equal(own.manifest.audio.bgm_track.id, "freepd-own-track");
    assert.equal(own.manifest.audio.bgm_track.license, "CC0-1.0");
    assert.equal(own.manifest.audio.bgm_track.sha256, crypto.createHash("sha256").update(body).digest("hex"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("config validator accepts catalog track ids in bgm_pool and rejects unknown ones", () => {
  const dir = tmpdir("matrix-music-config-");
  try {
    fs.cpSync(path.join(COMPARE_DIR, "config"), dir, { recursive: true });
    const file = path.join(dir, "channels", fs.readdirSync(path.join(dir, "channels")).find((name) => name.endsWith(".yaml")));
    const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
    doc.setIn(["audio", "bgm_pool"], doc.createNode([catalog.tracks[0].id, catalog.tracks[1].id]));
    fs.writeFileSync(file, doc.toString());
    assert.deepEqual(validateConfigs({ configDir: dir }).errors, []);
    doc.setIn(["audio", "bgm_pool"], doc.createNode(["freepd-not-a-track"]));
    fs.writeFileSync(file, doc.toString());
    assert.ok(validateConfigs({ configDir: dir }).errors.some((error) => /freepd-not-a-track is not in the CC0 music catalog/u.test(error)));
    doc.setIn(["audio", "bgm_pool"], doc.createNode(["Bad Id"]));
    fs.writeFileSync(file, doc.toString());
    assert.ok(validateConfigs({ configDir: dir }).errors.some((error) => /bgm_pool/u.test(error)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fetch-cc0-music verifies sha256, falls through to the next URL and is idempotent", async () => {
  const dir = tmpdir("matrix-music-fetch-");
  try {
    const body = "the real cc0 file";
    const track = fakeTrack("freepd-fetch-me", body, { download_urls: ["https://primary.example/a.mp3", "https://mirror.example/a.mp3"] });
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      const payload = url.includes("primary") ? "an HTML error page" : body;
      return new Response(payload, { status: 200 });
    };
    const first = await fetchAll({ catalog: fakeCatalog([track]), dir, fetchImpl });
    assert.equal(first[0].status, "fetched");
    assert.deepEqual(calls, ["https://primary.example/a.mp3", "https://mirror.example/a.mp3"]);
    assert.equal(fs.readFileSync(path.join(dir, "freepd-fetch-me.mp3"), "utf8"), body);
    assert.deepEqual(fs.readdirSync(dir), ["freepd-fetch-me.mp3"]);
    const again = await fetchAll({ catalog: fakeCatalog([track]), dir, fetchImpl });
    assert.equal(again[0].status, "ok");
    assert.equal(calls.length, 2);
    const failed = await fetchAll({ catalog: fakeCatalog([fakeTrack("freepd-broken", "x")]), dir, fetchImpl: async () => new Response("no", { status: 503 }) });
    assert.equal(failed[0].status, "failed");
    assert.equal(fs.existsSync(path.join(dir, "freepd-broken.mp3")), false);
    const check = await fetchAll({ catalog: fakeCatalog([fakeTrack("freepd-absent", "y")]), dir, check: true, fetchImpl: async () => { throw new Error("no network in --check"); } });
    assert.equal(check[0].status, "missing");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
