#!/usr/bin/env node
// tools/batch-global.mjs
// 1-Click Global Multi-Language Batch Video Generator.
// Generates 6 fully localized videos (vi, en, de, fr, ja, ko) for a given topic.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateTopic } from "./generate-topic.mjs";
import { createVideo } from "./create-video.mjs";
import { COUNTRIES } from "./voices.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const VIDEOS_DIR = path.join(REPO_ROOT, "videos");

const ALL_LANGS = ["vi", "en", "de", "fr", "ja", "ko"];

export async function runBatchGlobal(baseTopic, { target = 68, render = false, log = console.log } = {}) {
  if (!baseTopic || typeof baseTopic !== "string") {
    throw new Error("Cần cung cấp chủ đề so sánh (baseTopic)");
  }

  const baseSlug = baseTopic
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  log(`[batch] Bắt đầu tạo đồng loạt 6 quốc gia cho chủ đề: "${baseTopic}" (base slug: ${baseSlug})`);
  log(`[batch] Các quốc gia mục tiêu: ${ALL_LANGS.join(", ")}`);

  const results = [];

  for (let idx = 0; idx < ALL_LANGS.length; idx++) {
    const lang = ALL_LANGS[idx];
    const countryInfo = COUNTRIES.find((c) => c.code === lang) || { name: lang, flag: "" };
    const slug = `${baseSlug}-${lang}`;
    log(`\n======================================================`);
    log(`[batch] [${idx + 1}/${ALL_LANGS.length}] ${countryInfo.flag} Quốc gia: ${countryInfo.name} (${lang.toUpperCase()}) → slug: ${slug}`);
    log(`======================================================`);

    // Check if video already exists
    const dir = path.join(VIDEOS_DIR, slug);
    if (fs.existsSync(dir)) {
      log(`[batch] [bỏ qua] videos/${slug} đã tồn tại`);
      results.push({ lang, slug, status: "skipped", message: "Đã tồn tại" });
      continue;
    }

    try {
      log(`[batch] 1. Sinh kịch bản 20 câu chuẩn 7 Hồi bằng tiếng ${countryInfo.name}...`);
      const spec = await generateTopic({ query: baseTopic, lang });
      spec.slug = slug;
      spec.lang = lang;

      log(`[batch] 2. Dựng video và sinh audio (${spec.labelLeft} vs ${spec.labelRight})...`);
      const out = await createVideo({
        ...spec,
        slug,
        lang,
        target,
        render,
        log,
      });

      log(`[batch] ✓ Hoàn tất thành công videos/${slug}`);
      results.push({ lang, slug, status: "success", title: spec.title });
    } catch (err) {
      log(`[batch] ✖ Lỗi khi tạo videos/${slug}: ${err.message}`);
      results.push({ lang, slug, status: "error", error: err.message });
    }
  }

  log(`\n======================================================`);
  log(`[batch] Tổng kết 1-Click Global Batch:`);
  for (const r of results) {
    log(`- ${r.lang.toUpperCase()} (${r.slug}): ${r.status.toUpperCase()}`);
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const topic = process.argv[2];
  if (!topic) {
    console.error("Dùng: node tools/batch-global.mjs \"Chủ đề so sánh\" [--target 68] [--render]");
    process.exit(1);
  }
  const target = process.argv.includes("--target")
    ? Number(process.argv[process.argv.indexOf("--target") + 1])
    : 68;
  const render = process.argv.includes("--render");
  await runBatchGlobal(topic, { target, render });
}
