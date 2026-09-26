#!/usr/bin/env node
// Ảnh cho video "Tâm Linh Dân Gian" — mỗi shot một ảnh Antigravity.
//
// Chỉ khai báo danh sách ảnh; việc xin ảnh, chờ, xin lại khi lỗi và nền tạm khi quá hạn
// nằm ở tools/antigravity-images.mjs (dùng chung cho mọi thể loại). Không dùng Pollinations.
// Nguồn ảnh của từng shot được chép sang meta.json → folkloreConfig.shots[].imageSource để
// trang chi tiết Studio hiển thị.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FOLKLORE_IMAGE_STYLE, FOLKLORE_NEGATIVE_PROMPT } from "./folklore-configs.mjs";
import { ensureAntigravityImages, readImageState } from "./antigravity-images.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

export function shotImageRel(shotId) {
  return `assets/images/scene-${shotId}.jpg`;
}

export function buildShotPrompt(cfg, shot) {
  const byId = new Map((cfg.characters || []).map((c) => [c.id, c.look]));
  const cast = (shot.characters || []).filter((id) => byId.has(id)).map((id) => `${id}: ${byId.get(id)}`);
  return [
    FOLKLORE_IMAGE_STYLE,
    `Scene: ${shot.visual}`,
    cast.length ? `Characters in this scene (draw them exactly like this every time): ${cast.join("; ")}.` : "No recurring characters in this scene.",
  ].join("\n");
}

export function folkloreImageItems(cfg) {
  return (cfg.shots || []).map((shot) => ({
    key: `scene-${shot.id}`,
    prompt: buildShotPrompt(cfg, shot),
    negative: FOLKLORE_NEGATIVE_PROMPT,
    aspect: "1:1",
    dest: shotImageRel(shot.id),
  }));
}

/** Chép nguồn ảnh từ images.json sang meta.json để Studio hiển thị đúng từng shot. */
export function syncShotSources(dir, meta) {
  const { items } = readImageState(dir);
  for (const shot of meta.folkloreConfig?.shots || []) {
    const it = items[`scene-${shot.id}`];
    shot.prompt = it?.prompt || shot.prompt;
    shot.imageSource = it?.source || shot.imageSource || "pending";
    shot.imageTask = it?.taskId || shot.imageTask;
  }
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
}

/**
 * Đảm bảo mọi shot có ảnh Antigravity (hoặc nền tạm kèm trạng thái "đang chờ").
 * `engine` chỉ còn để tương thích lời gọi cũ: mọi ảnh đều đi qua Antigravity.
 */
export async function ensureFolkloreImages({ dir, meta, timeoutMin = 45, log = console.log }) {
  const slug = meta.id || path.basename(dir);
  const result = await ensureAntigravityImages({
    dir, slug, items: folkloreImageItems(meta.folkloreConfig), timeoutMin, log, label: "Tâm Linh Dân Gian",
  });
  syncShotSources(dir, meta);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const slug = argv.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  const opt = (name, dflt) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : dflt);
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error("Dùng: node tools/folklore-images.mjs <slug> [--timeout 45]");
    process.exit(1);
  }
  const dir = path.join(REPO_ROOT, "videos", slug);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  if (!meta.folkloreConfig) {
    console.error(`${slug} không phải video Tâm Linh Dân Gian`);
    process.exit(1);
  }
  ensureFolkloreImages({ dir, meta, timeoutMin: Number(opt("timeout", 45)) })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    });
}
