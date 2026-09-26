#!/usr/bin/env node
// Automated image search and download for comparison cards.
// Sources:
//   1. Real photography: Wikipedia / Wikimedia Commons API (free, high-res, authentic).
//   2. AI generation: Pollinations AI (Flux / SD, free, cinematic).
//
// Usage:
//   node tools/find-image.mjs "Kimono" --out kimono.jpg
//   node tools/find-image.mjs "Yukata" --ai --out yukata.jpg
//   node tools/find-image.mjs "Matcha" --list
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) AutoCompare/1.0";

/**
 * Searches Wikipedia for high-quality, authentic real-world photos.
 */
export async function searchWikiImages(query, limit = 4) {
  const clean = query.trim();
  if (!clean) return [];

  const results = [];
  const seenUrls = new Set();

  // Try 1: Exact title match first
  try {
    const exactUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|pageterms&pithumbsize=960&titles=${encodeURIComponent(clean)}&redirects=1`;
    const res = await fetch(exactUrl, { headers: { "User-Agent": USER_AGENT } });
    if (res.ok) {
      const data = await res.json();
      const pages = Object.values(data.query?.pages || {});
      for (const p of pages) {
        if (p.thumbnail?.source && !seenUrls.has(p.thumbnail.source)) {
          seenUrls.add(p.thumbnail.source);
          results.push({
            title: p.title,
            description: p.terms?.description?.[0] || "Ảnh bách khoa Wikipedia",
            url: p.thumbnail.source,
            width: p.thumbnail.width,
            height: p.thumbnail.height,
            source: "wikipedia",
          });
        }
      }
    }
  } catch (err) {
    // ignore and continue to search
  }

  // Try 2: General keyword search
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|pageterms&pithumbsize=960&generator=search&gsrsearch=${encodeURIComponent(clean)}&gsrlimit=${limit}`;
    const res = await fetch(searchUrl, { headers: { "User-Agent": USER_AGENT } });
    if (res.ok) {
      const data = await res.json();
      const pages = Object.values(data.query?.pages || {});
      for (const p of pages) {
        if (p.thumbnail?.source && !seenUrls.has(p.thumbnail.source)) {
          seenUrls.add(p.thumbnail.source);
          results.push({
            title: p.title,
            description: p.terms?.description?.[0] || "Ảnh Wikimedia",
            url: p.thumbnail.source,
            width: p.thumbnail.width,
            height: p.thumbnail.height,
            source: "wikipedia",
          });
        }
      }
    }
  } catch (err) {
    // ignore
  }

  // Try 3: Wikimedia Commons search if still empty
  if (results.length === 0) {
    try {
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(clean)}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url|mime&iiurlwidth=960`;
      const res = await fetch(commonsUrl, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) {
        const data = await res.json();
        const pages = Object.values(data.query?.pages || {});
        for (const p of pages) {
          const info = p.imageinfo?.[0];
          const imgUrl = info?.thumburl || info?.url;
          if (imgUrl && !seenUrls.has(imgUrl)) {
            seenUrls.add(imgUrl);
            results.push({
              title: p.title?.replace(/^File:/, "") || clean,
              description: "Wikimedia Commons",
              url: imgUrl,
              source: "commons",
            });
          }
        }
      }
    } catch (err) {
      // ignore
    }
  }

  return results;
}

/**
 * Prompt ảnh AI cho một khái niệm. Ảnh AI chỉ được sinh qua hàng đợi Antigravity
 * (tools/antigravity-images.mjs) — module này không còn dựng URL Pollinations.
 */
export function aiImagePrompt(concept, context = "") {
  return `A clear, high-detail studio photograph of ${concept}${context ? `, ${context}` : ""}, vibrant colors, sharp focus, clean warm aesthetic, centered subject, no text, no watermark`;
}

/**
 * Ảnh tốt nhất cho một khái niệm: ảnh thật Wikipedia/Commons trước. Không có ảnh thật
 * (hoặc preferAi) thì trả về yêu cầu xin ảnh Antigravity `{ antigravity: true, prompt }`
 * để nơi gọi đưa vào hàng đợi.
 */
export async function findBestImage(concept, { preferAi = false, context = "" } = {}) {
  if (!preferAi) {
    const wikiImages = await searchWikiImages(concept, 3);
    if (wikiImages.length > 0) return wikiImages[0];
  }
  return {
    antigravity: true,
    prompt: aiImagePrompt(concept, context),
    source: "antigravity",
    title: concept,
    description: preferAi ? "Ảnh AI (Antigravity)" : "Không có ảnh thật — xin ảnh AI qua Antigravity",
  };
}

/**
 * Downloads an image from an HTTP/HTTPS URL and saves it to destPath.
 */
export async function downloadImage(url, destPath, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to download image from ${url}: HTTP ${res.status}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buffer);
    return { path: destPath, bytes: buffer.length };
  } finally {
    clearTimeout(timer);
  }
}

// ──────────────────────────── CLI EXECUTION ────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flag = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i > -1 ? argv[i + 1] : def;
  };
  const has = (name) => argv.includes(`--${name}`);

  const query = argv.filter((a) => !a.startsWith("--"))[0];
  if (!query) {
    console.log("Usage: node tools/find-image.mjs <query> [--out file.jpg] [--ai] [--list]");
    process.exit(1);
  }

  if (has("list")) {
    console.log(`🔍 Tìm ảnh cho: "${query}"...`);
    const results = await searchWikiImages(query, 5);
    console.log(`Tìm thấy ${results.length} ảnh:\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. [${r.source}] ${r.title} (${r.description})`);
      console.log(`   ↳ ${r.url}\n`);
    });
    console.log(`✨ Prompt ảnh AI (xin qua Antigravity): ${aiImagePrompt(query)}\n`);
    process.exit(0);
  }

  const out = flag("out");
  const preferAi = has("ai");

  console.log(`🔍 Đang lấy ảnh cho "${query}" (${preferAi ? "AI qua Antigravity" : "Wikipedia/Commons"})...`);
  const best = await findBestImage(query, { preferAi });
  if (best.antigravity) {
    console.log(`→ Không có ảnh thật; prompt Antigravity: ${best.prompt}`);
    process.exit(0);
  }
  console.log(`✓ Đã chọn ảnh: ${best.title} (${best.source})`);
  console.log(`  ↳ URL: ${best.url}`);

  if (out) {
    await downloadImage(best.url, out);
    console.log(`💾 Đã lưu vào: ${out}`);
  }
}
