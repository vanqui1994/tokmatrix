// Procedural Random Torn Paper Engine for Vox AI Motion Graphics.
// Generates randomized, mathematically complementary torn-paper shard polygons,
// white fibrous tear-lips, washi tape placements, and dynamic GSAP assembly timelines.

export const TEAR_PATTERNS = [
  "HORIZONTAL_2",
  "HORIZONTAL_3",
  "DIAGONAL_DOWN",
  "DIAGONAL_UP",
  "VERTICAL_2",
  "DIAGONAL_3",
];

export const TAPE_VARIANTS = ["washi-yellow", "washi-kraft", "washi-red"];

/**
 * Creates a simple deterministic PRNG from a seed or random value.
 */
export function createPRNG(seed) {
  let s = typeof seed === "number" ? Math.floor(seed) : Math.floor(Math.random() * 1000000000);
  if (s <= 0) s = 123456789;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function randomRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function pickRandom(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Generates a realistic jagged paper tear line between (x0, y0) and (x1, y1) in 0..100 percentage.
 * Returns array of {x, y} points.
 */
export function generateJaggedSeam(rng, x0, y0, x1, y1, segments = 16, maxJitter = 3.5) {
  const points = [];
  points.push({ x: Number(x0.toFixed(2)), y: Number(y0.toFixed(2)) });

  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  // Unit normal vector perpendicular to the line
  const nx = -dy / len;
  const ny = dx / len;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    // Primary tooth jitter (alternating teeth + organic paper grain)
    const toothSign = i % 2 === 0 ? 1 : -1;
    const toothMag = randomRange(rng, 0.4, 1.0) * maxJitter;
    const noise = (rng() - 0.5) * (maxJitter * 0.6);
    const totalJitter = toothSign * toothMag + noise;

    let px = x0 + dx * t + nx * totalJitter;
    let py = y0 + dy * t + ny * totalJitter;

    // Clamp inside frame
    px = Math.max(0, Math.min(100, px));
    py = Math.max(0, Math.min(100, py));

    points.push({ x: Number(px.toFixed(2)), y: Number(py.toFixed(2)) });
  }

  points.push({ x: Number(x1.toFixed(2)), y: Number(y1.toFixed(2)) });
  return points;
}

/**
 * Converts array of {x, y} to CSS polygon string: polygon(x1% y1%, x2% y2%, ...)
 */
export function pointsToPolygon(points) {
  return `polygon(${points.map((p) => `${p.x}% ${p.y}%`).join(", ")})`;
}

/**
 * Generates a full random procedural tear system for a scene/beat.
 * @param {Object} opts - { seed, pattern, beatIndex, imgSrc, headline }
 */
export function generateBeatTearSystem(opts = {}) {
  const rng = createPRNG(opts.seed || Math.floor(Math.random() * 9999999));
  const pattern = opts.pattern || pickRandom(rng, TEAR_PATTERNS);
  const beatIndex = opts.beatIndex || 1;
  const imgSrc = opts.imgSrc || "assets/images/beat_1.jpg";
  const headline = opts.headline || `HỒ SƠ #${beatIndex}`;

  const shards = [];
  const tapes = [];
  const animations = [];

  if (pattern === "HORIZONTAL_2") {
    // Single jagged tear dividing top and bottom (~42% - 58%)
    const splitY0 = randomRange(rng, 42, 58);
    const splitY1 = randomRange(rng, 42, 58);
    const seam = generateJaggedSeam(rng, 0, splitY0, 100, splitY1, 18, 3.8);

    // Shard 1: Top piece
    const seamReverse = [...seam].reverse();
    const polyTop = [{ x: 0, y: 0 }, { x: 100, y: 0 }, ...seamReverse];

    // Shard 2: Bottom piece
    const polyBot = [...seam, { x: 100, y: 100 }, { x: 0, y: 100 }];

    shards.push({
      id: `shard-${beatIndex}a`,
      wrapId: `shard-${beatIndex}a-wrap`,
      zIndex: 13,
      polygon: pointsToPolygon(polyTop),
      hasLip: true,
      lipTransform: "translateY(6px)",
      imgSrc,
    });

    shards.push({
      id: `shard-${beatIndex}b`,
      wrapId: `shard-${beatIndex}b-wrap`,
      zIndex: 12,
      polygon: pointsToPolygon(polyBot),
      hasLip: false,
      imgSrc,
    });

    // Washi tapes across seam
    const tape1T = randomRange(rng, 0.22, 0.35);
    const tape2T = randomRange(rng, 0.65, 0.82);
    const p1 = seam[Math.floor(seam.length * tape1T)];
    const p2 = seam[Math.floor(seam.length * tape2T)];

    tapes.push({
      id: `tape-${beatIndex}a`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p1.y / 100) * 1920 - 20),
      left: Math.round((p1.x / 100) * 1080 - 110),
      width: Math.round(randomRange(rng, 220, 260)),
      rotation: Math.round(randomRange(rng, -18, -4)),
    });

    tapes.push({
      id: `tape-${beatIndex}b`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p2.y / 100) * 1920 - 20),
      left: Math.round((p2.x / 100) * 1080 - 110),
      width: Math.round(randomRange(rng, 220, 260)),
      rotation: Math.round(randomRange(rng, 4, 18)),
    });

    animations.push({
      target: `#shard-${beatIndex}a-wrap`,
      from: { y: -750, rotation: Math.round(randomRange(rng, -18, 18)), scale: 1.25, opacity: 0 },
      to: { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.65, ease: "back.out(1.4)" },
      delay: 0.08,
    });

    animations.push({
      target: `#shard-${beatIndex}b-wrap`,
      from: { y: 750, rotation: Math.round(randomRange(rng, -15, 15)), scale: 1.2, opacity: 0 },
      to: { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.62, ease: "back.out(1.4)" },
      delay: 0.24,
    });
  } else if (pattern === "HORIZONTAL_3") {
    // 3 Slabs: Top (~30-36%), Mid (~63-69%), Bot
    const seam1Y0 = randomRange(rng, 30, 36);
    const seam1Y1 = randomRange(rng, 30, 36);
    const seam1 = generateJaggedSeam(rng, 0, seam1Y0, 100, seam1Y1, 16, 3.2);

    const seam2Y0 = randomRange(rng, 63, 69);
    const seam2Y1 = randomRange(rng, 63, 69);
    const seam2 = generateJaggedSeam(rng, 0, seam2Y0, 100, seam2Y1, 16, 3.2);

    const seam1Rev = [...seam1].reverse();
    const polyTop = [{ x: 0, y: 0 }, { x: 100, y: 0 }, ...seam1Rev];

    const seam2Rev = [...seam2].reverse();
    const polyMid = [...seam1, ...seam2Rev];

    const polyBot = [...seam2, { x: 100, y: 100 }, { x: 0, y: 100 }];

    shards.push({
      id: `shard-${beatIndex}a`,
      wrapId: `shard-${beatIndex}a-wrap`,
      zIndex: 13,
      polygon: pointsToPolygon(polyTop),
      hasLip: true,
      lipTransform: "translateY(6px)",
      imgSrc,
    });

    shards.push({
      id: `shard-${beatIndex}b`,
      wrapId: `shard-${beatIndex}b-wrap`,
      zIndex: 12,
      polygon: pointsToPolygon(polyMid),
      hasLip: true,
      lipTransform: "translateY(6px)",
      imgSrc,
    });

    shards.push({
      id: `shard-${beatIndex}c`,
      wrapId: `shard-${beatIndex}c-wrap`,
      zIndex: 11,
      polygon: pointsToPolygon(polyBot),
      hasLip: false,
      imgSrc,
    });

    const p1 = seam1[Math.floor(seam1.length * randomRange(rng, 0.15, 0.35))];
    const p2 = seam2[Math.floor(seam2.length * randomRange(rng, 0.65, 0.85))];

    tapes.push({
      id: `tape-${beatIndex}a`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p1.y / 100) * 1920 - 20),
      left: Math.round((p1.x / 100) * 1080 - 110),
      width: Math.round(randomRange(rng, 230, 270)),
      rotation: Math.round(randomRange(rng, -15, -4)),
    });

    tapes.push({
      id: `tape-${beatIndex}b`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p2.y / 100) * 1920 - 20),
      left: Math.round((p2.x / 100) * 1080 - 110),
      width: Math.round(randomRange(rng, 230, 270)),
      rotation: Math.round(randomRange(rng, 5, 16)),
    });

    animations.push({
      target: `#shard-${beatIndex}a-wrap`,
      from: { y: -700, rotation: Math.round(randomRange(rng, -16, 16)), scale: 1.25, opacity: 0 },
      to: { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.65, ease: "back.out(1.4)" },
      delay: 0.08,
    });

    const flySideX = rng() > 0.5 ? 800 : -800;
    animations.push({
      target: `#shard-${beatIndex}b-wrap`,
      from: { x: flySideX, rotation: Math.round(randomRange(rng, -12, 12)), scale: 1.2, opacity: 0 },
      to: { x: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.62, ease: "back.out(1.5)" },
      delay: 0.22,
    });

    animations.push({
      target: `#shard-${beatIndex}c-wrap`,
      from: { y: 700, rotation: Math.round(randomRange(rng, -12, 12)), scale: 1.15, opacity: 0 },
      to: { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.3)" },
      delay: 0.34,
    });
  } else if (pattern === "DIAGONAL_DOWN") {
    // Diagonal slash top-left to bottom-right
    const yLeft = randomRange(rng, 24, 38);
    const yRight = randomRange(rng, 62, 76);
    const seam = generateJaggedSeam(rng, 0, yLeft, 100, yRight, 20, 3.5);

    // Shard A: Top-Right piece
    const seamRev = [...seam].reverse();
    const polyTopRight = [{ x: 0, y: 0 }, { x: 100, y: 0 }, ...seamRev];

    // Shard B: Bottom-Left piece
    const polyBotLeft = [...seam, { x: 100, y: 100 }, { x: 0, y: 100 }];

    shards.push({
      id: `shard-${beatIndex}a`,
      wrapId: `shard-${beatIndex}a-wrap`,
      zIndex: 13,
      polygon: pointsToPolygon(polyTopRight),
      hasLip: true,
      lipTransform: "translate(4px, 4px)",
      imgSrc,
    });

    shards.push({
      id: `shard-${beatIndex}b`,
      wrapId: `shard-${beatIndex}b-wrap`,
      zIndex: 12,
      polygon: pointsToPolygon(polyBotLeft),
      hasLip: false,
      imgSrc,
    });

    const p1 = seam[Math.floor(seam.length * 0.3)];
    const p2 = seam[Math.floor(seam.length * 0.7)];

    tapes.push({
      id: `tape-${beatIndex}a`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p1.y / 100) * 1920 - 20),
      left: Math.round((p1.x / 100) * 1080 - 110),
      width: 240,
      rotation: Math.round(randomRange(rng, -35, -20)),
    });

    tapes.push({
      id: `tape-${beatIndex}b`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p2.y / 100) * 1920 - 20),
      left: Math.round((p2.x / 100) * 1080 - 110),
      width: 250,
      rotation: Math.round(randomRange(rng, -30, -15)),
    });

    animations.push({
      target: `#shard-${beatIndex}a-wrap`,
      from: { x: 600, y: -600, rotation: Math.round(randomRange(rng, 10, 24)), scale: 1.25, opacity: 0 },
      to: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.65, ease: "back.out(1.4)" },
      delay: 0.08,
    });

    animations.push({
      target: `#shard-${beatIndex}b-wrap`,
      from: { x: -600, y: 600, rotation: Math.round(randomRange(rng, -24, -10)), scale: 1.2, opacity: 0 },
      to: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.65, ease: "back.out(1.4)" },
      delay: 0.22,
    });
  } else if (pattern === "DIAGONAL_UP") {
    // Diagonal slash bottom-left to top-right
    const yLeft = randomRange(rng, 62, 76);
    const yRight = randomRange(rng, 24, 38);
    const seam = generateJaggedSeam(rng, 0, yLeft, 100, yRight, 20, 3.5);

    // Piece above the seam: (0, 0) -> (100, 0) -> (100, yRight) -> seam in reverse -> (0, yLeft)
    const seamRev = [...seam].reverse();
    const polyTop = [{ x: 0, y: 0 }, { x: 100, y: 0 }, ...seamRev];

    // Piece below the seam: (0, yLeft) -> seam -> (100, yRight) -> (100, 100) -> (0, 100)
    const polyBot = [...seam, { x: 100, y: 100 }, { x: 0, y: 100 }];

    shards.push({
      id: `shard-${beatIndex}a`,
      wrapId: `shard-${beatIndex}a-wrap`,
      zIndex: 13,
      polygon: pointsToPolygon(polyTop),
      hasLip: true,
      lipTransform: "translate(-4px, 4px)",
      imgSrc,
    });

    shards.push({
      id: `shard-${beatIndex}b`,
      wrapId: `shard-${beatIndex}b-wrap`,
      zIndex: 12,
      polygon: pointsToPolygon(polyBot),
      hasLip: false,
      imgSrc,
    });

    const p1 = seam[Math.floor(seam.length * 0.35)];
    const p2 = seam[Math.floor(seam.length * 0.68)];

    tapes.push({
      id: `tape-${beatIndex}a`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p1.y / 100) * 1920 - 20),
      left: Math.round((p1.x / 100) * 1080 - 110),
      width: 240,
      rotation: Math.round(randomRange(rng, 20, 35)),
    });

    tapes.push({
      id: `tape-${beatIndex}b`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p2.y / 100) * 1920 - 20),
      left: Math.round((p2.x / 100) * 1080 - 110),
      width: 250,
      rotation: Math.round(randomRange(rng, 18, 32)),
    });

    animations.push({
      target: `#shard-${beatIndex}a-wrap`,
      from: { x: 650, y: -650, rotation: Math.round(randomRange(rng, -22, -10)), scale: 1.25, opacity: 0 },
      to: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.65, ease: "back.out(1.4)" },
      delay: 0.08,
    });

    animations.push({
      target: `#shard-${beatIndex}b-wrap`,
      from: { x: -650, y: 650, rotation: Math.round(randomRange(rng, 10, 22)), scale: 1.2, opacity: 0 },
      to: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.65, ease: "back.out(1.4)" },
      delay: 0.22,
    });
  } else if (pattern === "VERTICAL_2") {
    // Vertical jagged rip dividing left and right halves
    const xTop = randomRange(rng, 42, 58);
    const xBot = randomRange(rng, 42, 58);
    const seam = generateJaggedSeam(rng, xTop, 0, xBot, 100, 20, 3.8);

    // Shard A: Left piece (0,0) -> (xTop, 0) -> seam -> (xBot, 100) -> (0, 100)
    const polyLeft = [{ x: 0, y: 0 }, ...seam, { x: 0, y: 100 }];

    // Shard B: Right piece (100, 0) -> (100, 100) -> (xBot, 100) -> seamRev -> (xTop, 0)
    const seamRev = [...seam].reverse();
    const polyRight = [{ x: 100, y: 0 }, { x: 100, y: 100 }, ...seamRev];

    shards.push({
      id: `shard-${beatIndex}a`,
      wrapId: `shard-${beatIndex}a-wrap`,
      zIndex: 13,
      polygon: pointsToPolygon(polyLeft),
      hasLip: true,
      lipTransform: "translateX(6px)",
      imgSrc,
    });

    shards.push({
      id: `shard-${beatIndex}b`,
      wrapId: `shard-${beatIndex}b-wrap`,
      zIndex: 12,
      polygon: pointsToPolygon(polyRight),
      hasLip: false,
      imgSrc,
    });

    const p1 = seam[Math.floor(seam.length * 0.3)];
    const p2 = seam[Math.floor(seam.length * 0.7)];

    tapes.push({
      id: `tape-${beatIndex}a`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p1.y / 100) * 1920 - 20),
      left: Math.round((p1.x / 100) * 1080 - 110),
      width: 250,
      rotation: Math.round(randomRange(rng, -12, 12)),
    });

    tapes.push({
      id: `tape-${beatIndex}b`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p2.y / 100) * 1920 - 20),
      left: Math.round((p2.x / 100) * 1080 - 110),
      width: 240,
      rotation: Math.round(randomRange(rng, -14, 14)),
    });

    animations.push({
      target: `#shard-${beatIndex}a-wrap`,
      from: { x: -800, rotation: Math.round(randomRange(rng, -18, -6)), scale: 1.2, opacity: 0 },
      to: { x: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.65, ease: "back.out(1.4)" },
      delay: 0.08,
    });

    animations.push({
      target: `#shard-${beatIndex}b-wrap`,
      from: { x: 800, rotation: Math.round(randomRange(rng, 6, 18)), scale: 1.2, opacity: 0 },
      to: { x: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.65, ease: "back.out(1.4)" },
      delay: 0.22,
    });
  } else {
    // DIAGONAL_3: 3 diagonal slabs
    const seam1 = generateJaggedSeam(rng, 0, randomRange(rng, 24, 32), 100, randomRange(rng, 48, 56), 18, 3.0);
    const seam2 = generateJaggedSeam(rng, 0, randomRange(rng, 58, 66), 100, randomRange(rng, 80, 88), 18, 3.0);

    const seam1Rev = [...seam1].reverse();
    const polyTop = [{ x: 0, y: 0 }, { x: 100, y: 0 }, ...seam1Rev];

    const seam2Rev = [...seam2].reverse();
    const polyMid = [...seam1, ...seam2Rev];

    const polyBot = [...seam2, { x: 100, y: 100 }, { x: 0, y: 100 }];

    shards.push({
      id: `shard-${beatIndex}a`,
      wrapId: `shard-${beatIndex}a-wrap`,
      zIndex: 13,
      polygon: pointsToPolygon(polyTop),
      hasLip: true,
      lipTransform: "translate(4px, 4px)",
      imgSrc,
    });

    shards.push({
      id: `shard-${beatIndex}b`,
      wrapId: `shard-${beatIndex}b-wrap`,
      zIndex: 12,
      polygon: pointsToPolygon(polyMid),
      hasLip: true,
      lipTransform: "translate(4px, 4px)",
      imgSrc,
    });

    shards.push({
      id: `shard-${beatIndex}c`,
      wrapId: `shard-${beatIndex}c-wrap`,
      zIndex: 11,
      polygon: pointsToPolygon(polyBot),
      hasLip: false,
      imgSrc,
    });

    const p1 = seam1[Math.floor(seam1.length * 0.3)];
    const p2 = seam2[Math.floor(seam2.length * 0.7)];

    tapes.push({
      id: `tape-${beatIndex}a`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p1.y / 100) * 1920 - 20),
      left: Math.round((p1.x / 100) * 1080 - 110),
      width: 250,
      rotation: Math.round(randomRange(rng, -32, -18)),
    });

    tapes.push({
      id: `tape-${beatIndex}b`,
      variant: pickRandom(rng, TAPE_VARIANTS),
      top: Math.round((p2.y / 100) * 1920 - 20),
      left: Math.round((p2.x / 100) * 1080 - 110),
      width: 260,
      rotation: Math.round(randomRange(rng, -30, -16)),
    });

    animations.push({
      target: `#shard-${beatIndex}a-wrap`,
      from: { x: 500, y: -500, rotation: Math.round(randomRange(rng, 8, 20)), scale: 1.25, opacity: 0 },
      to: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.65, ease: "back.out(1.4)" },
      delay: 0.08,
    });

    animations.push({
      target: `#shard-${beatIndex}b-wrap`,
      from: { x: -600, y: 300, rotation: Math.round(randomRange(rng, -16, 16)), scale: 1.2, opacity: 0 },
      to: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.62, ease: "back.out(1.5)" },
      delay: 0.22,
    });

    animations.push({
      target: `#shard-${beatIndex}c-wrap`,
      from: { y: 600, rotation: Math.round(randomRange(rng, -12, 12)), scale: 1.15, opacity: 0 },
      to: { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.3)" },
      delay: 0.34,
    });
  }

  // Stamp badge placed randomly on one of the upper or middle quadrants
  const stampTop = Math.round(randomRange(rng, 620, 840));
  const stampLeft = Math.round(randomRange(rng, 90, 220));
  const stampRot = Math.round(randomRange(rng, -9, 8));

  const stamp = {
    id: `stamp-${beatIndex}`,
    top: stampTop,
    left: stampLeft,
    rotation: stampRot,
    text: `★ ${headline.toUpperCase()}`,
  };

  return {
    pattern,
    shards,
    tapes,
    stamp,
    animations,
  };
}

/**
 * Renders the HTML markup for a beat's procedural shards.
 */
export function renderBeatShardsHtml(tearSystem) {
  const shardsHtml = tearSystem.shards
    .map((s) => {
      const lipHtml = s.hasLip
        ? `<div class="tear-lip" style="clip-path: ${s.polygon}; transform: ${s.lipTransform || "translateY(6px)"};"></div>\n`
        : "";
      return `        <div id="${s.wrapId}" class="shard-wrapper" data-layout-allow-overflow style="z-index: ${s.zIndex};">
          ${lipHtml}          <div class="poster-shard" style="background-image: url('${s.imgSrc}'); clip-path: ${s.polygon};"></div>
        </div>`;
    })
    .join("\n\n");

  const tapesHtml = tearSystem.tapes
    .map(
      (t) =>
        `        <div id="${t.id}" class="washi-tape ${t.variant}" data-layout-allow-overflow style="top: ${t.top}px; left: ${t.left}px; width: ${t.width}px; transform: rotate(${t.rotation}deg);"></div>`
    )
    .join("\n");

  const stampHtml = `        <div id="${tearSystem.stamp.id}" class="torn-stamp-badge" data-layout-allow-occlusion data-layout-allow-overlap style="top: ${tearSystem.stamp.top}px; left: ${tearSystem.stamp.left}px; transform: rotate(${tearSystem.stamp.rotation}deg);">
          ${tearSystem.stamp.text}
        </div>`;

  return `${shardsHtml}\n\n${tapesHtml}\n\n${stampHtml}`;
}
