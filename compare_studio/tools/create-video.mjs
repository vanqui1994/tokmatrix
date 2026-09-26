#!/usr/bin/env node
// End-to-end: a 12-line script in, a checked (optionally rendered) video out.
//
//   node tools/create-video.mjs script.txt --left "Crow" --right "Raven" \
//        [--lang en] [--target 36] [--render] [--slug crow-vs-raven]
//        [--icon-left art.svg] [--icon-right photo.png]
//   node tools/create-video.mjs --form form.json   (what the studio passes)
//   node tools/create-video.mjs --spec spec.json   (a spec you already built)
//
// Steps: spec -> scaffold -> write LINES -> npm install -> VO -> composition ->
// retime -> optional fit-to-duration -> check -> optional render.
//
// Nothing here calls a paid API. The script is written by a human (or by Claude
// in chat, then pasted); the icons are SVG you paste or an image you pick.
//
// Everything each step needs already exists as its own tool, so this file is
// orchestration only — no timing maths, no HTML templating.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildComposition } from "./build-composition.mjs";
import { ensureAntigravityImages } from "./antigravity-images.mjs";
import { retime } from "./retime.mjs";
import { fitDuration } from "./fit-duration.mjs";
import { buildSpec } from "./parse-script.mjs";
import { findBestImage, downloadImage } from "./find-image.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

function run(cmd, args, cwd, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: "0" } });
    child.stdout.on("data", (c) => log(String(c).trimEnd()));
    child.stderr.on("data", (c) => log(String(c).trimEnd()));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} → mã ${code}`))));
  });
}

/** Copy or download an image into the video and return an icon spec for it. */
async function adoptImage(srcPathOrUrl, slug, side, log) {
  const dir = path.join(REPO_ROOT, "videos", slug, "assets", "icons");
  fs.mkdirSync(dir, { recursive: true });

  if (typeof srcPathOrUrl === "string" && (srcPathOrUrl.startsWith("http://") || srcPathOrUrl.startsWith("https://"))) {
    let ext = ".jpg";
    try {
      const pathname = new URL(srcPathOrUrl).pathname;
      const guessed = path.extname(pathname).toLowerCase();
      if (IMAGE_EXT.has(guessed)) ext = guessed;
    } catch {}
    const dest = path.join(dir, `${side}${ext}`);
    log(`[icon] đang tải ảnh từ web cho ${side}: ${srcPathOrUrl.slice(0, 65)}...`);
    await downloadImage(srcPathOrUrl, dest);
    log(`[icon] đã lưu ảnh ${side}: assets/icons/${side}${ext}`);
    return { type: "image", src: `assets/icons/${side}${ext}`, alt: "" };
  }

  const ext = path.extname(srcPathOrUrl).toLowerCase();
  if (!IMAGE_EXT.has(ext)) throw new Error(`ảnh ${side}: đuôi ${ext} không hỗ trợ`);
  const dest = path.join(dir, `${side}${ext}`);
  fs.copyFileSync(srcPathOrUrl, dest);
  log(`[icon] dùng ảnh bạn cung cấp cho ${side}: assets/icons/${side}${ext}`);
  return { type: "image", src: `assets/icons/${side}${ext}`, alt: "" };
}

export async function createVideo(opts) {
  const log = opts.log ?? console.log;

  let spec;
  if (opts.spoken && opts.captions) {
    spec = opts;
  } else if (opts.specPath) {
    spec = JSON.parse(fs.readFileSync(opts.specPath, "utf8"));
  } else if (opts.autoTopic) {
    const { generateTopic } = await import("./generate-topic.mjs");
    spec = await generateTopic(opts);
  } else {
    spec = buildSpec(opts);
  }

  if (opts.specPath) log(`[spec] dùng lại spec có sẵn: ${spec.slug}`);
  else log(`[spec] ${spec.labelLeft} vs ${spec.labelRight} — ${spec.captions?.length ?? 20} dòng, ${spec.lang}`);

  const lang = spec.lang ?? opts.lang ?? "en";
  const voice = spec.voice ?? opts.voice ?? null;
  const target = opts.target;
  const render = opts.render ?? false;
  // A "file" icon is a path outside the video; it gets copied in below. Pasted
  // SVG stays on the spec untouched and goes straight into the composition.
  const asPath = (flagValue, fromSpec) =>
    typeof flagValue === "string" ? flagValue : fromSpec?.type === "file" ? fromSpec.src : undefined;
  const iconLeft = asPath(opts.iconLeft, spec.iconLeft);
  const iconRight = asPath(opts.iconRight, spec.iconRight);
  const slug = opts.slug ?? spec.slug;
  const dir = path.join(REPO_ROOT, "videos", slug);
  if (fs.existsSync(dir)) throw new Error(`videos/${slug} đã tồn tại — đổi slug hoặc xoá thư mục cũ`);

  const scaffoldRel = fs.existsSync(path.join(REPO_ROOT, ".agents", "skills", "create-video", "scripts", "scaffold.mjs"))
    ? path.join(".agents", "skills", "create-video", "scripts", "scaffold.mjs")
    : path.join(".claude", "skills", "create-video", "scripts", "scaffold.mjs");

  log(`[1/7] scaffold videos/${slug}`);
  await run("node", [scaffoldRel, slug], REPO_ROOT, log);

  log("[2/7] ghi kịch bản + ngôn ngữ vào scripts/generate-vo.mjs");
  const voPath = path.join(dir, "scripts", "generate-vo.mjs");
  let voSrc = fs.readFileSync(voPath, "utf8");
  const lines =
    "const LINES = [\n" +
    spec.spoken
      .map((t, i) => `  { id: "line-${i + 1}", text: ${JSON.stringify(t)} },\n`)
      .join("") +
    "];";
  voSrc = voSrc.replace(/const LINES = \[[\s\S]*?\n\];/, lines);
  voSrc = voSrc.replace(/const VIDEO_LANG = "[a-z]{2}";/, `const VIDEO_LANG = "${lang}";`);
  if (voice) {
    voSrc = voSrc.replace(/const VOICE_NAME = ".*?";/, `const VOICE_NAME = "${voice}";`);
    log(`[vo] chọn giọng đọc: ${voice}`);
  }
  fs.writeFileSync(voPath, voSrc);

  log("[3/7] npm install");
  await run("npm", ["install", "--no-audit", "--no-fund"], dir, log).catch((e) =>
    log(`[warn] npm install: ${e.message} (bỏ qua nếu deps đã có)`),
  );

  log("[4/7] sinh voiceover");
  await run("node", ["scripts/generate-vo.mjs"], dir, log);

  log("[5/7] dựng composition");
  const autoImages = opts.images ?? opts.autoImages ?? false;
  let imagesPending = 0;
  const preferAi = opts.aiImages ?? false;

  if (autoImages) {
    log(`[icon] tự động tìm ảnh thực tế/AI cho ${spec.labelLeft} và ${spec.labelRight}...`);
    try {
      // Ảnh thật Wikipedia trước; không có thì xin Antigravity (không dùng Pollinations).
      const aiSides = [];
      for (const [side, label, given] of [["left", spec.labelLeft, iconLeft], ["right", spec.labelRight, iconRight]]) {
        if (given) continue;
        const best = await findBestImage(label, { preferAi });
        const key = side === "left" ? "iconLeft" : "iconRight";
        if (best?.antigravity) aiSides.push({ side, key, prompt: best.prompt });
        else if (best?.url) spec[key] = await adoptImage(best.url, slug, side, log);
      }
      if (aiSides.length) {
        const res = await ensureAntigravityImages({
          dir, slug, log, label: "So Sánh 2 Vật",
          timeoutMin: Number(opts.imageTimeoutMin || spec.imageTimeoutMin || 45),
          items: aiSides.map((s) => ({ key: s.side, aspect: "1:1", dest: `assets/icons/${s.side}.jpg`, prompt: s.prompt })),
        });
        for (const s of aiSides) spec[s.key] = { type: "image", src: `assets/icons/${s.side}.jpg`, alt: "" };
        imagesPending = res.pending.length;
      }
    } catch (e) {
      log(`[warn] tự động tìm ảnh gặp lỗi: ${e.message}`);
    }
  }

  if (iconLeft) {
    spec.iconLeft = await adoptImage(iconLeft, slug, "left", log);
  } else if (spec.iconLeft?.type === "image" && spec.iconLeft.src?.startsWith("http")) {
    spec.iconLeft = await adoptImage(spec.iconLeft.src, slug, "left", log);
  }

  if (iconRight) {
    spec.iconRight = await adoptImage(iconRight, slug, "right", log);
  } else if (spec.iconRight?.type === "image" && spec.iconRight.src?.startsWith("http")) {
    spec.iconRight = await adoptImage(spec.iconRight.src, slug, "right", log);
  }

  for (const side of ["Left", "Right"])
    if (!spec[`icon${side}`]) log(`[warn] chưa có icon ${side.toLowerCase()} — thẻ ảnh để trống, thêm sau vào index.html`);
  spec.lang = lang;
  if (opts.bgm !== undefined) spec.bgmTrack = opts.bgm;
  if (opts.bgmVolume !== undefined) spec.bgmVolume = Number(opts.bgmVolume);
  if (opts.sfx !== undefined) spec.enableSfx = Boolean(opts.sfx);
  if (opts.noSfx) spec.enableSfx = false;
  buildComposition(slug, spec);
  const timed = retime(slug);
  log(`[5/7] ROOT_DURATION = ${timed.root}s`);

  if (target) {
    log(`[6/7] khớp về ${target}s`);
    const fit = await fitDuration(slug, Number(target), { log });
    if (!fit.ok) log(`[warn] chưa khớp đúng ${target}s — xem gợi ý ở trên`);
  } else {
    log("[6/7] bỏ qua bước khớp thời lượng (không đặt --target)");
  }

  // BRIEF.md — the routing artifact the hyperframes workflow reads.
  fs.writeFileSync(
    path.join(dir, "BRIEF.md"),
    `---
workflow: general-video
flow: companion
storyboard: no
message: ${JSON.stringify(spec.message ?? `${spec.labelLeft} vs ${spec.labelRight}`)}
destination: tiktok
aspect: 1080x1920
language: ${lang}
length: 65-70s
---

## Intent

${spec.message ?? ""}

Layout, palette, fonts, motion and the cat MC come from \`../../DESIGN.md\` and are not repeated here.

## Assets

- Card icons: ${iconLeft || iconRight ? "ảnh do người dùng cung cấp trong `assets/icons/`" : "SVG inline"}.
- Voiceover: Edge TTS theo \`VIDEO_LANG = "${lang}"\`.

## Notes

- Sinh bằng \`tools/create-video.mjs\`. Kịch bản 12 dòng theo nhịp chuẩn, viết tay rồi qua \`humanizer\`.
`,
  );

  // spec.json tối thiểu để Studio / caption đăng bài nhận đúng thể loại, nhãn và ngôn ngữ.
  const specPath = path.join(dir, "spec.json");
  if (!fs.existsSync(specPath)) {
    fs.writeFileSync(specPath, JSON.stringify({
      type: "compare", slug, lang, labelLeft: spec.labelLeft, labelRight: spec.labelRight,
      title: `${spec.labelLeft} vs ${spec.labelRight}`, message: spec.message ?? "",
    }, null, 2));
  }

  log("[7/7] npm run check");
  await run("npm", ["run", "check"], dir, log);
  if (render && imagesPending) {
    log(`[7/7] Chưa render: còn ${imagesPending} ảnh chờ Antigravity. Khi ảnh về, bấm "🎨 Ảnh Antigravity" (tự render tiếp).`);
  } else if (render) {
    log("[7/7] npm run render");
    await run("npm", ["run", "render", "--", "--workers", "4", "--no-low-memory-mode"], dir, log);
  }
  log(`[xong] videos/${slug}`);
  return { slug };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flag = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i > -1 ? argv[i + 1] : def;
  };
  const positional = argv.filter((x, i) => !x.startsWith("--") && !argv[i - 1]?.startsWith("--"));

  let opts;
  if (flag("form")) {
    opts = JSON.parse(fs.readFileSync(flag("form"), "utf8"));
  } else if (flag("spec")) {
    opts = { specPath: flag("spec") };
  } else if (argv.includes("--auto-topic") || flag("topic")) {
    const { generateTopic } = await import("./generate-topic.mjs");
    opts = await generateTopic({
      category: flag("category"),
      query: flag("query") || flag("q"),
      slug: flag("slug") || flag("topic"),
      lang: flag("lang", "en"),
      ai: argv.includes("--ai"),
    });
  } else if (positional[0] && flag("left") && flag("right")) {
    opts = {
      scriptPath: positional[0],
      labelLeft: flag("left"),
      labelRight: flag("right"),
      lang: flag("lang", "en"),
      slug: flag("slug"),
      message: flag("message"),
    };
  } else {
    console.error(
      'dùng: node tools/create-video.mjs script.txt --left "Crow" --right "Raven" [--lang en] [--target 36] [--render]\n' +
        "      node tools/create-video.mjs --auto-topic [--category tech] [--target 36] [--render]\n" +
        "      node tools/create-video.mjs --form form.json\n" +
        "      node tools/create-video.mjs --spec spec.json",
    );
    process.exit(1);
  }
  await createVideo({
    ...opts,
    target: flag("target", opts.target),
    render: argv.includes("--render") || Boolean(opts.render),
    // `?? opts.x` matters: a missing flag must not blank out what the form set.
    images: argv.includes("--images") || argv.includes("--auto-images") || Boolean(opts.images),
    aiImages: argv.includes("--ai-images") || Boolean(opts.aiImages),
    voice: flag("voice") ?? opts.voice,
    iconLeft: flag("icon-left") ?? opts.iconLeft,
    iconRight: flag("icon-right") ?? opts.iconRight,
    slug: flag("slug") ?? opts.slug,
    bgm: flag("bgm", opts.bgm),
    bgmVolume: flag("bgm-volume", opts.bgmVolume),
    sfx: argv.includes("--no-sfx") ? false : opts.sfx,
  });
}
