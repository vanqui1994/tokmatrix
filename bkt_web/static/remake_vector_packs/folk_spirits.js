// remake_vector_packs/folk_spirits.js — Folklore Spirits & Legends (R7)
// 10 rigs: kitsune, gumiho, dokkaebi, yuki_onna, krampus_folk, clay_golem,
//          will_o_wisp, selkie, rubezahl_spirit, welsh_red_dragon
// 3 backgrounds: misty_forest_night, rhine_cliff, korean_mountain_night
// All ground_y: 810, 7 weathers, day/night, full widescreen frameSpan, ZERO text.

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('RemakeVector core engine must be loaded before engine packs.');
  }

  const {
    path,
    line,
    ellipse,
    drawPoly,
    tone,
    volume,
    mixColor,
    INK,
    TAU,
    clamp,
    smooth,
    mix,
    hash,
    seeded,
    frameSpan
  } = RemakeVector.kit;

  function extRanges(x0, x1) {
    const out = [];
    if (x0 < 0) out.push([x0, 0]);
    if (x1 > 576) out.push([576, x1]);
    return out;
  }
  function tileExt(ext, start, step, origEnd, fn) {
    for (const [a, b] of ext) {
      if (a < 0) { for (let x = start - step; x > a - step; x -= step) fn(x); }
      else { let x = start; while (x <= origEnd) x += step; for (; x < b + step; x += step) fn(x); }
    }
  }
  function scatterExt(ext, step, key, fn) {
    for (const [a, b] of ext) {
      let i = 0;
      for (let x = a + step * 0.5; x < b - step * 0.3; i++) {
        const r = seeded(`${key}:${Math.round(x)}`);
        fn(x, r, i);
        x += step * (0.7 + r * 0.6);
      }
    }
  }

  // =============================================================
  // 1. KITSUNE (Japanese multi-tailed magical fox spirit)
  // center: [0, -45], top: [0, -88], head: [0, -62], orb: [28, -68]
  // =============================================================
  function drawKitsune(ctx, s, t) {
    ctx.save();
    const white = '#f8fafc';
    const cream = '#f1f5f9';
    const innerEar = '#f43f5e';
    const goldTip = '#fbbf24';
    const redMark = '#dc2626';

    // 9 Fluffy tails fanning out like a radiant crown behind
    for (let i = 0; i < 9; i++) {
      const ang = -Math.PI * 0.85 + (i / 8) * Math.PI * 0.7;
      const tailLen = 38 + ((i === 4) ? 8 : (4 - Math.abs(i - 4)) * 3);
      const tx = Math.cos(ang) * tailLen;
      const ty = -38 + Math.sin(ang) * tailLen * 0.85;

      // Bushy tail segment
      ellipse(ctx, tx * 0.6, ty * 0.6 + 6, 8, 14, cream, INK, 1.0);
      ellipse(ctx, tx, ty, 6, 10, white, INK, 1.0);
      // Golden spiritual tip
      ellipse(ctx, tx * 1.05, ty * 1.05, 3.5, 5, goldTip, null);
    }

    // Hind legs and paws sitting gracefully
    ellipse(ctx, -14, -12, 9, 12, cream, INK, 1.2);
    ellipse(ctx, 14, -12, 9, 12, cream, INK, 1.2);
    ellipse(ctx, -10, -3, 6, 4, white, INK, 1.0);
    ellipse(ctx, 10, -3, 6, 4, white, INK, 1.0);

    // Sleek white torso
    drawPoly(ctx, [
      [-12, -14], [12, -14], [8, -50], [-8, -50]
    ], white, INK, 1.2);
    // Fluffy chest bib ruff
    path(ctx, 'M -8 -38 Q 0 -24 8 -38 Q 4 -48 -8 -48 Z', '#ffffff', null);

    // Front slender paws
    drawPoly(ctx, [
      [-7, -36], [-3, -36], [-4, -4], [-8, -4]
    ], white, INK, 1.0);
    drawPoly(ctx, [
      [3, -36], [7, -36], [8, -4], [4, -4]
    ], white, INK, 1.0);

    // Elegant fox head
    const hy = -62;
    drawPoly(ctx, [
      [-13, hy], [13, hy], [0, hy + 14]
    ], white, INK, 1.2);
    ellipse(ctx, 0, hy - 4, 11, 9, white, INK, 1.2);

    // Tall pointed alert ears
    drawPoly(ctx, [
      [-11, hy - 6], [-4, hy - 10], [-8, hy - 24]
    ], white, INK, 1.2);
    drawPoly(ctx, [
      [-9, hy - 8], [-5, hy - 11], [-8, hy - 21]
    ], innerEar, null);

    drawPoly(ctx, [
      [4, hy - 10], [11, hy - 6], [8, hy - 24]
    ], white, INK, 1.2);
    drawPoly(ctx, [
      [5, hy - 11], [9, hy - 8], [8, hy - 21]
    ], innerEar, null);

    // Red shrine kitsune face markings (traditional kumadori curves)
    path(ctx, `M -9 ${hy - 2} Q -4 ${hy - 8} 0 ${hy - 2} Q 4 ${hy - 8} 9 ${hy - 2}`, null, redMark, 1.4);
    ellipse(ctx, 0, hy - 8, 1.5, 2.5, redMark, null);

    // Gentle dark expressive fox eyes & nose
    ellipse(ctx, -5, hy + 2, 2.0, 1.2, '#0f172a', null);
    ellipse(ctx, 5, hy + 2, 2.0, 1.2, '#0f172a', null);
    ellipse(ctx, 0, hy + 12, 2.0, 1.5, '#0f172a', null);

    // Whiskers
    line(ctx, [[-7, hy + 8], [-17, hy + 6]], '#64748b', 0.8);
    line(ctx, [[-7, hy + 10], [-16, hy + 11]], '#64748b', 0.8);
    line(ctx, [[7, hy + 8], [17, hy + 6]], '#64748b', 0.8);
    line(ctx, [[7, hy + 10], [16, hy + 11]], '#64748b', 0.8);

    // Floating magical cyan spirit flame orb (kitsune-bi)
    const orbY = -68 + Math.sin(t * 3.5) * 4;
    ellipse(ctx, 28, orbY, 6, 8, 'rgba(56, 189, 248, 0.4)', null);
    ellipse(ctx, 28, orbY, 4, 6, '#38bdf8', null);
    ellipse(ctx, 28, orbY, 2, 3, '#f0fdf4', null);

    ctx.restore();
  }

  // =============================================================
  // 2. GUMIHO (Cute Korean nine-tailed fox with glowing marble)
  // center: [0, -45], top: [0, -88], head: [0, -60], bead: [0, -32]
  // =============================================================
  function drawGumiho(ctx, s, t) {
    ctx.save();
    const pearlWhite = '#fdf4ff';
    const softPink = '#f472b6';
    const deepPink = '#db2777';
    const jade = '#10b981';
    const jadeGlow = '#6ee7b7';

    // 9 Cloud-like curled tails with pastel pink tips
    for (let i = 0; i < 9; i++) {
      const ang = -Math.PI * 0.85 + (i / 8) * Math.PI * 0.7;
      const wave = Math.sin(t * 2.5 + i * 0.5) * 3;
      const tx = Math.cos(ang) * (36 + wave);
      const ty = -38 + Math.sin(ang) * (32 + wave);

      // Tail clouds
      ellipse(ctx, tx * 0.6, ty * 0.6 + 5, 8, 12, pearlWhite, INK, 1.0);
      ellipse(ctx, tx, ty, 6, 9, pearlWhite, INK, 1.0);
      ellipse(ctx, tx * 1.08, ty * 1.08, 4, 4, softPink, null);
    }

    // Plump cute sitting hind legs
    ellipse(ctx, -14, -12, 10, 11, pearlWhite, INK, 1.2);
    ellipse(ctx, 14, -12, 10, 11, pearlWhite, INK, 1.2);
    ellipse(ctx, -9, -3, 6, 4, pearlWhite, INK, 1.0);
    ellipse(ctx, 9, -3, 6, 4, pearlWhite, INK, 1.0);

    // Chubby torso
    ellipse(ctx, 0, -32, 14, 18, pearlWhite, INK, 1.2);
    // Soft pink belly patch
    ellipse(ctx, 0, -28, 9, 12, '#fae8ff', null);

    // Front paws holding glowing jade marble
    drawPoly(ctx, [
      [-10, -38], [-4, -38], [-3, -30], [-8, -30]
    ], pearlWhite, INK, 1.0);
    drawPoly(ctx, [
      [10, -38], [4, -38], [3, -30], [8, -30]
    ], pearlWhite, INK, 1.0);

    // Glowing magical jade yeowoo-guseul (fox marble)
    const marblePulse = 1.0 + Math.sin(t * 4.0) * 0.15;
    ellipse(ctx, 0, -32, 7 * marblePulse, 7 * marblePulse, 'rgba(16, 185, 129, 0.35)', null);
    ellipse(ctx, 0, -32, 4.5, 4.5, jade, INK, 0.8);
    ellipse(ctx, -1.2, -33.5, 1.5, 1.5, '#ecfdf5', null);

    // Traditional Korean silk norigae pendant hanging on neck
    line(ctx, [[0, -46], [0, -40]], deepPink, 1.6);
    ellipse(ctx, 0, -40, 2.5, 2.5, '#f59e0b', INK, 0.6);
    line(ctx, [[0, -40], [-2, -34]], deepPink, 1.2);
    line(ctx, [[0, -40], [2, -34]], deepPink, 1.2);

    // Adorable round fox head
    const hy = -60;
    ellipse(ctx, 0, hy, 13, 11, pearlWhite, INK, 1.2);
    // Cheek tufts
    drawPoly(ctx, [[-13, hy], [-18, hy + 2], [-11, hy + 6]], pearlWhite, INK, 0.8);
    drawPoly(ctx, [[13, hy], [18, hy + 2], [11, hy + 6]], pearlWhite, INK, 0.8);

    // Big fluffy rounded ears
    drawPoly(ctx, [
      [-12, hy - 4], [-4, hy - 8], [-9, hy - 22]
    ], pearlWhite, INK, 1.2);
    drawPoly(ctx, [
      [-10, hy - 6], [-5, hy - 9], [-9, hy - 19]
    ], softPink, null);

    drawPoly(ctx, [
      [4, hy - 8], [12, hy - 4], [9, hy - 22]
    ], pearlWhite, INK, 1.2);
    drawPoly(ctx, [
      [5, hy - 9], [10, hy - 6], [9, hy - 19]
    ], softPink, null);

    // Huge sparkling dark anime-style eyes
    ellipse(ctx, -5, hy, 3.2, 4.2, '#1e1b4b', null);
    ellipse(ctx, -4.2, hy - 1.5, 1.2, 1.5, '#ffffff', null);
    ellipse(ctx, -5.5, hy + 1.5, 0.8, 0.8, '#ffffff', null);

    ellipse(ctx, 5, hy, 3.2, 4.2, '#1e1b4b', null);
    ellipse(ctx, 5.8, hy - 1.5, 1.2, 1.5, '#ffffff', null);
    ellipse(ctx, 4.5, hy + 1.5, 0.8, 0.8, '#ffffff', null);

    // Blushing pink cheeks
    ellipse(ctx, -9, hy + 4, 3, 2, 'rgba(244, 114, 182, 0.6)', null);
    ellipse(ctx, 9, hy + 4, 3, 2, 'rgba(244, 114, 182, 0.6)', null);

    // Cute tiny nose and sweet mouth
    ellipse(ctx, 0, hy + 4, 1.2, 1.0, deepPink, null);
    path(ctx, `M -2 ${hy + 6} Q 0 ${hy + 8} 2 ${hy + 6}`, null, INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // 3. DOKKAEBI (Friendly Korean goblin with spiked club)
  // center: [0, -45], top: [0, -90], horn: [0, -88], club: [26, -48]
  // =============================================================
  function drawDokkaebi(ctx, s, t) {
    ctx.save();
    const skin = '#38bdf8';
    const skinDark = '#0284c7';
    const gold = '#f59e0b';
    const hornCol = '#fbbf24';
    const vest = '#dc2626';
    const wood = '#78350f';

    // Sturdy legs and straw sandals (jipsin)
    drawPoly(ctx, [
      [-10, 0], [-2, 0], [-3, -16], [-9, -16]
    ], skin, INK, 1.2);
    drawPoly(ctx, [
      [2, 0], [10, 0], [9, -16], [3, -16]
    ], skin, INK, 1.2);
    // Straw sandal cords
    line(ctx, [[-10, -2], [-2, -2]], '#d97706', 1.6);
    line(ctx, [[2, -2], [10, -2]], '#d97706', 1.6);

    // Traditional baggy Korean baji trousers
    drawPoly(ctx, [
      [-14, -14], [14, -14], [12, -34], [-12, -34]
    ], '#ffffff', INK, 1.2);

    // Torso with bright red vest
    drawPoly(ctx, [
      [-13, -32], [13, -32], [11, -54], [-11, -54]
    ], vest, INK, 1.4);
    // Golden cloud trim on vest
    line(ctx, [[-11, -54], [0, -36]], gold, 2.0);
    line(ctx, [[11, -54], [0, -36]], gold, 2.0);

    // Left arm resting on hip
    drawPoly(ctx, [
      [-12, -52], [-18, -40], [-13, -32], [-9, -44]
    ], skin, INK, 1.0);
    ellipse(ctx, -13, -32, 3.5, 3.5, skin, INK, 0.8);

    // Right arm holding magical spiked club up
    drawPoly(ctx, [
      [11, -52], [20, -44], [23, -34], [16, -34]
    ], skin, INK, 1.0);
    ellipse(ctx, 20, -35, 4, 4, skin, INK, 0.8);

    // Magical Dokkaebi Bangmangi (wooden studded club that conjures gold!)
    ctx.save();
    ctx.translate(24, -46);
    ctx.rotate(-0.25);
    // Club handle & head
    drawPoly(ctx, [
      [-3, 16], [3, 16], [6, -38], [-6, -38]
    ], wood, INK, 1.4);
    ellipse(ctx, 0, -38, 6, 4, wood, INK, 1.0);
    // Rounded gold studs on club
    const studs = [
      [-4, -30], [4, -30], [0, -24],
      [-5, -16], [5, -16], [0, -10]
    ];
    for (const [sx, sy] of studs) {
      ellipse(ctx, sx, sy, 2.2, 2.2, gold, INK, 0.6);
    }
    // Lucky golden spark stars
    ellipse(ctx, 6, -44, 2, 2, '#fef08a', null);
    ellipse(ctx, -8, -32, 1.5, 1.5, '#fef08a', null);
    ctx.restore();

    // Big friendly round head
    const hy = -62;
    ellipse(ctx, 0, hy, 16, 14, skin, INK, 1.4);

    // Single cute golden horn on forehead
    drawPoly(ctx, [
      [-4, hy - 12], [4, hy - 12], [0, -88]
    ], hornCol, INK, 1.2);
    line(ctx, [[-3, hy - 16], [3, hy - 16]], gold, 1.0);
    line(ctx, [[-2, hy - 20], [2, hy - 20]], gold, 1.0);

    // Bushy cartoon eyebrows
    path(ctx, `M -10 ${hy - 6} Q -6 ${hy - 11} -2 ${hy - 6}`, null, '#1e293b', 2.8);
    path(ctx, `M 2 ${hy - 6} Q 6 ${hy - 11} 10 ${hy - 6}`, null, '#1e293b', 2.8);

    // Big happy round eyes
    ellipse(ctx, -6, hy - 1, 3.5, 4.0, '#ffffff', INK, 1.0);
    ellipse(ctx, -6, hy - 1, 2.0, 2.5, '#0f172a', null);
    ellipse(ctx, 6, hy - 1, 3.5, 4.0, '#ffffff', INK, 1.0);
    ellipse(ctx, 6, hy - 1, 2.0, 2.5, '#0f172a', null);

    // Rosy blushing cheeks
    ellipse(ctx, -10, hy + 5, 3.5, 2.2, '#f472b6', null);
    ellipse(ctx, 10, hy + 5, 3.5, 2.2, '#f472b6', null);

    // Broad friendly grinning mouth with single cute snaggle tooth!
    drawPoly(ctx, [
      [-8, hy + 4], [8, hy + 4], [0, hy + 12]
    ], '#991b1b', INK, 1.2);
    // Cute single white tooth
    drawPoly(ctx, [
      [-4, hy + 4], [-1, hy + 4], [-2.5, hy + 8]
    ], '#ffffff', null);

    ctx.restore();
  }

  // =============================================================
  // 4. YUKI_ONNA (Gentle child-friendly snow maiden spirit)
  // center: [0, -46], top: [0, -92], head: [0, -66]
  // =============================================================
  function drawYukiOnna(ctx, s, t) {
    ctx.save();
    const white = '#f8fafc';
    const iceBlue = '#bae6fd';
    const darkHair = '#0f172a';
    const sash = '#38bdf8';

    // Floating ethereal hem (no feet: floating gracefully above ground!)
    const hemWave = Math.sin(t * 3.0) * 3;
    drawPoly(ctx, [
      [-16, -6], [16, -6], [22, -18 + hemWave],
      [14, -46], [-14, -46], [-22, -18 - hemWave]
    ], white, INK, 1.2);
    // Lower hem ice-blue ombre gradient
    path(ctx, `M -16 -6 Q 0 ${-2 + hemWave} 16 -6 L 22 ${-18 + hemWave} L -22 ${-18 - hemWave} Z`, iceBlue, null);

    // Flowing layered kimono sleeves
    drawPoly(ctx, [
      [-13, -56], [-24, -40], [-26, -24], [-12, -42]
    ], white, INK, 1.0);
    drawPoly(ctx, [
      [13, -56], [24, -40], [26, -24], [12, -42]
    ], white, INK, 1.0);
    // Pale hands tucked gently in sleeves
    ellipse(ctx, 0, -38, 4, 3, '#f1f5f9', INK, 0.8);

    // Torso with crossed kimono collar and sky-blue obi sash
    drawPoly(ctx, [
      [-11, -44], [11, -44], [9, -58], [-9, -58]
    ], white, INK, 1.0);
    // Obi sash with snowflake crest
    drawPoly(ctx, [
      [-11, -38], [11, -38], [10, -46], [-10, -46]
    ], sash, INK, 1.0);
    ellipse(ctx, 0, -42, 3, 3, white, null);

    // Cross-collar neckline
    line(ctx, [[-8, -58], [2, -46]], iceBlue, 1.4);
    line(ctx, [[8, -58], [-2, -46]], iceBlue, 1.4);

    // Flowing midnight-blue mist hair behind head
    const hy = -66;
    drawPoly(ctx, [
      [-14, hy - 4], [14, hy - 4], [18, -32], [-18, -32]
    ], darkHair, null);

    // Serene pale face
    ellipse(ctx, 0, hy, 11, 10, '#f8fafc', INK, 1.2);

    // Hair bangs framing face
    drawPoly(ctx, [
      [-12, hy - 6], [12, hy - 6], [14, hy + 2],
      [10, hy - 4], [0, hy - 2], [-10, hy - 4], [-14, hy + 2]
    ], darkHair, null);
    // Topknot hair bun with ice comb
    ellipse(ctx, 0, hy - 14, 6, 6, darkHair, INK, 1.0);
    line(ctx, [[-6, hy - 16], [6, hy - 16]], iceBlue, 2.0);

    // Peaceful smiling eyes (gentle curved arcs)
    path(ctx, `M -6 ${hy} Q -3 ${hy - 2} 0 ${hy}`, null, '#1e293b', 1.8);
    path(ctx, `M 0 ${hy} Q 3 ${hy - 2} 6 ${hy}`, null, '#1e293b', 1.8);

    // Soft winter blush & gentle smiling mouth
    ellipse(ctx, -7, hy + 4, 2.5, 1.5, 'rgba(186, 230, 253, 0.8)', null);
    ellipse(ctx, 7, hy + 4, 2.5, 1.5, 'rgba(186, 230, 253, 0.8)', null);
    path(ctx, `M -2 ${hy + 5} Q 0 ${hy + 7} 2 ${hy + 5}`, null, '#f43f5e', 1.2);

    // Swirling spiral of delicate twinkling snowflakes around her
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU + t * 2.0;
      const r = 26 + (i % 3) * 6;
      const sx = Math.cos(ang) * r;
      const sy = -45 + Math.sin(ang) * (r * 0.6);
      // 6-pointed snowflake
      line(ctx, [[sx - 3, sy], [sx + 3, sy]], '#e0f2fe', 1.2);
      line(ctx, [[sx, sy - 3], [sx, sy + 3]], '#e0f2fe', 1.2);
      ellipse(ctx, sx, sy, 1.0, 1.0, '#ffffff', null);
    }

    ctx.restore();
  }

  // =============================================================
  // 5. KRAMPUS_FOLK (Cute, goofy storybook Alpine winter spirit)
  // center: [0, -46], top: [0, -95], head: [0, -62], horn_l: [-22, -92]
  // =============================================================
  function drawKrampusFolk(ctx, s, t) {
    ctx.save();
    const fur = '#57534e';
    const furDark = '#292524';
    const horn = '#78350f';
    const gold = '#f59e0b';
    const tongue = '#ef4444';

    // Cloven hooves / sturdy feet
    drawPoly(ctx, [
      [-12, 0], [-4, 0], [-5, -12], [-11, -12]
    ], furDark, INK, 1.2);
    drawPoly(ctx, [
      [4, 0], [12, 0], [11, -12], [5, -12]
    ], furDark, INK, 1.2);
    // Split hoof mark
    line(ctx, [[-8, 0], [-8, -6]], '#1c1917', 1.4);
    line(ctx, [[8, 0], [8, -6]], '#1c1917', 1.4);

    // Shaggy woolly legs and body
    drawPoly(ctx, [
      [-16, -10], [16, -10], [14, -46], [-14, -46]
    ], fur, INK, 1.4);
    // Shaggy fur tufts
    for (let fy = -16; fy >= -40; fy -= 8) {
      path(ctx, `M -14 ${fy} Q -9 ${fy + 4} -4 ${fy} Q 1 ${fy + 4} 6 ${fy} Q 11 ${fy + 4} 14 ${fy}`, null, furDark, 1.2);
    }

    // Leather belt with golden brass jingle bells around waist
    drawPoly(ctx, [
      [-14, -26], [14, -26], [14, -31], [-14, -31]
    ], '#1c1917', INK, 1.0);
    for (const bx of [-8, 0, 8]) {
      ellipse(ctx, bx, -28.5, 3.2, 3.2, gold, INK, 0.8);
      line(ctx, [[bx - 2, -28.5], [bx + 2, -28.5]], '#78350f', 0.8);
    }

    // Left arm holding birch twigs bundle (rute)
    drawPoly(ctx, [
      [-13, -44], [-24, -36], [-22, -28], [-11, -38]
    ], fur, INK, 1.0);
    ellipse(ctx, -22, -28, 3.5, 3.5, furDark, INK, 0.8);

    // Little bundle of birch twigs (festive toy broom, completely harmless!)
    ctx.save();
    ctx.translate(-24, -36);
    ctx.rotate(-0.3);
    for (let i = -3; i <= 3; i++) {
      line(ctx, [[0, 8], [i * 3, -18]], '#78350f', 1.4);
    }
    // Festive red ribbon tie
    ellipse(ctx, 0, -4, 4, 2, '#dc2626', null);
    ctx.restore();

    // Right arm waving cheerfully
    drawPoly(ctx, [
      [13, -44], [22, -40], [24, -30], [14, -34]
    ], fur, INK, 1.0);
    ellipse(ctx, 24, -30, 3.5, 3.5, furDark, INK, 0.8);

    // Shaggy head
    const hy = -62;
    ellipse(ctx, 0, hy, 14, 13, fur, INK, 1.4);
    // Chin beard tuft
    drawPoly(ctx, [
      [-6, hy + 10], [6, hy + 10], [0, hy + 19]
    ], furDark, INK, 1.0);

    // Two big curved wooden ram / goat horns decorated with red ribbons
    // Left horn curving back and up to y=-92
    drawPoly(ctx, [
      [-8, hy - 8], [-18, hy - 16], [-22, -92], [-14, -90], [-6, hy - 11]
    ], horn, INK, 1.4);
    line(ctx, [[-10, hy - 14], [-16, hy - 20]], '#451a03', 1.0);
    ellipse(ctx, -20, -88, 3, 2, '#dc2626', null);

    // Right horn curving back and up
    drawPoly(ctx, [
      [6, hy - 11], [14, -90], [22, -92], [18, hy - 16], [8, hy - 8]
    ], horn, INK, 1.4);
    line(ctx, [[10, hy - 14], [16, hy - 20]], '#451a03', 1.0);
    ellipse(ctx, 20, -88, 3, 2, '#dc2626', null);

    // Big friendly derpy cartoon eyes
    ellipse(ctx, -5, hy - 3, 4.0, 4.5, '#ffffff', INK, 1.0);
    ellipse(ctx, -4, hy - 3, 2.2, 2.2, '#0f172a', null);
    ellipse(ctx, 5, hy - 3, 4.0, 4.5, '#ffffff', INK, 1.0);
    ellipse(ctx, 6, hy - 3, 2.2, 2.2, '#0f172a', null);

    // Mischievous grinning mouth with long comical red tongue sticking out!
    drawPoly(ctx, [
      [-7, hy + 4], [7, hy + 4], [0, hy + 10]
    ], '#1c1917', INK, 1.0);
    // Comical curly red tongue hanging down
    path(ctx, `M -3 ${hy + 6} Q 0 ${hy + 16} 4 ${hy + 18} Q 6 ${hy + 18} 3 ${hy + 12} Q 1 ${hy + 8} 3 ${hy + 6}`, tongue, INK, 0.8);

    ctx.restore();
  }

  // =============================================================
  // 6. CLAY_GOLEM (Friendly Prague clay and river-stone guardian)
  // center: [0, -50], top: [0, -94], rune: [0, -78], fist_l: [-34, -35]
  // =============================================================
  function drawClayGolem(ctx, s, t) {
    ctx.save();
    const clay = '#a8a29e';
    const clayDark = '#57534e';
    const clayLight = '#d6d3d1';
    const moss = '#15803d';
    const runeGold = '#facc15';

    // Sturdy rounded clay boulder feet
    ellipse(ctx, -14, -6, 12, 8, clayDark, INK, 1.4);
    ellipse(ctx, 14, -6, 12, 8, clayDark, INK, 1.4);

    // Sturdy tree-trunk stone legs
    drawPoly(ctx, [
      [-18, -10], [-8, -10], [-9, -32], [-19, -32]
    ], clay, INK, 1.2);
    drawPoly(ctx, [
      [8, -10], [18, -10], [19, -32], [9, -32]
    ], clay, INK, 1.2);

    // Broad rounded river-clay torso
    drawPoly(ctx, [
      [-22, -30], [22, -30], [26, -66], [-26, -66]
    ], clay, INK, 1.6);
    // Clay brickwork / stone seams
    line(ctx, [[-18, -42], [18, -42]], clayDark, 1.4);
    line(ctx, [[-20, -54], [20, -54]], clayDark, 1.4);
    line(ctx, [[0, -42], [0, -54]], clayDark, 1.4);
    line(ctx, [[-10, -30], [-10, -42]], clayDark, 1.4);
    line(ctx, [[10, -30], [10, -42]], clayDark, 1.4);

    // Moss patches growing on clay seams
    ellipse(ctx, -16, -42, 4, 2, moss, null);
    ellipse(ctx, 14, -54, 5, 2.5, moss, null);

    // Massive protective rounded shoulders
    ellipse(ctx, -26, -62, 10, 9, clayDark, INK, 1.2);
    ellipse(ctx, 26, -62, 10, 9, clayDark, INK, 1.2);
    ellipse(ctx, -26, -66, 6, 3, moss, null);

    // Powerful friendly resting arms & stone fists
    drawPoly(ctx, [
      [-30, -58], [-22, -58], [-24, -36], [-32, -36]
    ], clay, INK, 1.2);
    ellipse(ctx, -28, -34, 7, 7, clayLight, INK, 1.2);

    drawPoly(ctx, [
      [22, -58], [30, -58], [32, -36], [24, -36]
    ], clay, INK, 1.2);
    ellipse(ctx, 28, -34, 7, 7, clayLight, INK, 1.2);

    // Solid rectangular rounded stone head
    const hy = -74;
    drawPoly(ctx, [
      [-14, hy - 14], [14, hy - 14], [12, hy + 10], [-12, hy + 10]
    ], clay, INK, 1.6);

    // Glowing magical Hebrew rune etched on forehead (EMET: truth / life)
    const runeGlow = 1.0 + Math.sin(t * 3.0) * 0.2;
    ellipse(ctx, 0, hy - 6, 6 * runeGlow, 4 * runeGlow, 'rgba(250, 204, 21, 0.35)', null);
    // Abstracted triple rune marks (symbolic, zero real religious text)
    line(ctx, [[-4, hy - 8], [-4, hy - 3]], runeGold, 2.0);
    line(ctx, [[0, hy - 9], [0, hy - 3]], runeGold, 2.0);
    line(ctx, [[4, hy - 8], [4, hy - 3]], runeGold, 2.0);
    line(ctx, [[-5, hy - 3], [5, hy - 3]], runeGold, 1.8);

    // Round friendly glowing golden eyes
    ellipse(ctx, -6, hy + 1, 3.2, 3.2, runeGold, INK, 1.0);
    ellipse(ctx, -5.5, hy + 0.5, 1.2, 1.2, '#ffffff', null);
    ellipse(ctx, 6, hy + 1, 3.2, 3.2, runeGold, INK, 1.0);
    ellipse(ctx, 5.5, hy + 0.5, 1.2, 1.2, '#ffffff', null);

    // Carved stone mouth slit (friendly slight smile)
    path(ctx, `M -5 ${hy + 6} Q 0 ${hy + 8} 5 ${hy + 6}`, null, clayDark, 2.0);

    ctx.restore();
  }

  // =============================================================
  // 7. WILL_O_WISP (Trio of friendly floating luminous spirit lights)
  // center: [0, -48], top: [0, -90], float: true
  // =============================================================
  function drawWillOWisp(ctx, s, t) {
    ctx.save();
    // Subtle breathing floating movement
    const floatY = Math.sin(t * 2.8) * 5;

    // Helper: draw luminous spirit light orb
    function drawWispOrb(ox, oy, size, colMain, colGlow) {
      ctx.save();
      ctx.translate(ox, oy + floatY);

      // Outer translucent flame halo
      const flameH = size * (1.6 + Math.sin(t * 4.0 + ox) * 0.2);
      path(ctx, `M ${-size * 1.4} 0 Q 0 ${-flameH} ${size * 1.4} 0 Q 0 ${size * 1.2} ${-size * 1.4} 0 Z`, colGlow, null);

      // Inner glowing core
      ellipse(ctx, 0, 0, size, size * 0.9, colMain, null);
      // Bright white soul heart
      ellipse(ctx, 0, -size * 0.15, size * 0.45, size * 0.45, '#ffffff', null);

      // Friendly twinkling fairy spark eyes
      ellipse(ctx, -size * 0.25, -size * 0.2, 1.0, 1.5, '#0f172a', null);
      ellipse(ctx, size * 0.25, -size * 0.2, 1.0, 1.5, '#0f172a', null);
      path(ctx, `M ${-size * 0.15} ${size * 0.1} Q 0 ${size * 0.25} ${size * 0.15} ${size * 0.1}`, null, '#0f172a', 0.8);

      ctx.restore();
    }

    // Trailing golden and cyan fairy dust sparks
    for (let i = 0; i < 9; i++) {
      const u = ((t * 1.5 + i * 0.14) % 1.0);
      const px = -25 + (i * 7);
      const py = -20 - u * 50 + Math.sin(t * 3.0 + i) * 6;
      ellipse(ctx, px, py, 1.5 * (1 - u), 1.5 * (1 - u), '#fef08a', null);
    }

    // Orb 1: Friendly cyan central leader orb (largest)
    drawWispOrb(0, -50, 14, '#38bdf8', 'rgba(56, 189, 248, 0.4)');
    // Orb 2: Playful emerald-green companion left
    drawWispOrb(-22, -35, 10, '#34d399', 'rgba(52, 211, 153, 0.35)');
    // Orb 3: Warm golden follower right
    drawWispOrb(22, -60, 9, '#fbbf24', 'rgba(251, 191, 36, 0.35)');

    ctx.restore();
  }

  // =============================================================
  // 8. SELKIE (Celtic transforming seal spirit with shimmering pelt)
  // center: [0, -42], top: [0, -84], head: [0, -60]
  // =============================================================
  function drawSelkie(ctx, s, t) {
    ctx.save();
    const sealGrey = '#94a3b8';
    const sealDark = '#475569';
    const sealLight = '#e2e8f0';
    const seaSilk = '#a7f3d0';

    // Coastal rock pedestal and ocean foam
    ellipse(ctx, 0, -4, 34, 10, '#334155', INK, 1.4);
    ellipse(ctx, -14, -8, 8, 4, '#1e293b', null);
    // Foam bubbles
    for (let bx = -28; bx <= 28; bx += 8) {
      ellipse(ctx, bx, -1, 3.5, 2.0, '#f8fafc', null);
    }

    // Spotted plump grey seal body sitting upright
    ellipse(ctx, 0, -32, 18, 26, sealGrey, INK, 1.4);
    // Lighter cream chest & belly
    ellipse(ctx, 0, -28, 12, 18, sealLight, null);
    // Natural seal spots
    const spots = [[-8, -36], [6, -42], [-5, -22], [7, -26], [0, -16]];
    for (const [sx, sy] of spots) {
      ellipse(ctx, sx, sy, 2.0, 1.4, sealDark, null);
    }

    // Rear seal flippers curled gracefully on rock
    drawPoly(ctx, [
      [-12, -8], [-24, -2], [-18, -14]
    ], sealDark, INK, 1.0);
    drawPoly(ctx, [
      [12, -8], [24, -2], [18, -14]
    ], sealDark, INK, 1.0);

    // Front flipper paws
    ellipse(ctx, -14, -22, 6, 11, sealGrey, INK, 1.0);
    ellipse(ctx, 14, -22, 6, 11, sealGrey, INK, 1.0);

    // Shimmering translucent sea-silk mantle / pelt draped over shoulders
    path(ctx, 'M -16 -44 Q 0 -52 16 -44 Q 22 -30 14 -16 Q 0 -22 -14 -16 Q -22 -30 -16 -44 Z', 'rgba(167, 243, 208, 0.45)', '#059669', 1.0);
    // Iridescent pearl shell clasp at throat
    ellipse(ctx, 0, -44, 3, 3, '#fef08a', INK, 0.6);

    // Adorable round seal head
    const hy = -60;
    ellipse(ctx, 0, hy, 14, 13, sealGrey, INK, 1.4);
    // Sweet cream muzzle
    ellipse(ctx, -4, hy + 4, 5, 4, sealLight, INK, 0.8);
    ellipse(ctx, 4, hy + 4, 5, 4, sealLight, INK, 0.8);

    // Soulful large dark seal eyes
    ellipse(ctx, -6, hy - 1, 4.0, 4.5, '#0f172a', null);
    ellipse(ctx, -5, hy - 2.5, 1.6, 1.6, '#ffffff', null);
    ellipse(ctx, 6, hy - 1, 4.0, 4.5, '#0f172a', null);
    ellipse(ctx, 7, hy - 2.5, 1.6, 1.6, '#ffffff', null);

    // Cute black nose and smiling seal mouth
    drawPoly(ctx, [
      [-2, hy + 2], [2, hy + 2], [0, hy + 4]
    ], '#0f172a', null);
    path(ctx, `M -3 ${hy + 6} Q 0 ${hy + 8} 3 ${hy + 6}`, null, '#0f172a', 1.0);

    // Long graceful seal whiskers
    line(ctx, [[-6, hy + 4], [-18, hy + 2]], '#e2e8f0', 1.0);
    line(ctx, [[-6, hy + 6], [-16, hy + 8]], '#e2e8f0', 1.0);
    line(ctx, [[6, hy + 4], [18, hy + 2]], '#e2e8f0', 1.0);
    line(ctx, [[6, hy + 6], [16, hy + 8]], '#e2e8f0', 1.0);

    ctx.restore();
  }

  // =============================================================
  // 9. RUBEZAHL_SPIRIT (Gentle German/Bohemian mountain spirit)
  // center: [0, -50], top: [0, -96], staff_top: [30, -92]
  // =============================================================
  function drawRubezahlSpirit(ctx, s, t) {
    ctx.save();
    const cloak = '#15803d';
    const cloakDark = '#14532d';
    const wood = '#78350f';
    const beard = '#e2e8f0';
    const skin = '#fed7aa';
    const lanternGold = '#f59e0b';

    // Sturdy leather mountain boots
    drawPoly(ctx, [
      [-12, 0], [-3, 0], [-4, -12], [-11, -12]
    ], '#451a03', INK, 1.2);
    drawPoly(ctx, [
      [3, 0], [12, 0], [11, -12], [4, -12]
    ], '#451a03', INK, 1.2);

    // Long warm woolen mountain cloak
    drawPoly(ctx, [
      [-18, -10], [18, -10], [14, -58], [-14, -58]
    ], cloak, INK, 1.4);
    // Cloak fold shadows
    path(ctx, 'M 0 -58 L -3 -10', null, cloakDark, 1.6);
    path(ctx, 'M 8 -58 L 10 -10', null, cloakDark, 1.6);

    // Gnarled wooden walking staff in right hand
    line(ctx, [[28, 0], [28, -94]], wood, 3.2);
    ellipse(ctx, 28, -94, 3, 3, '#92400e', INK, 0.8);

    // Warm glowing lantern hanging from crook of staff
    line(ctx, [[28, -82], [32, -74]], '#475569', 1.2);
    drawPoly(ctx, [
      [28, -74], [36, -74], [34, -58], [30, -58]
    ], lanternGold, INK, 1.0);
    ellipse(ctx, 32, -66, 3, 3, '#fef08a', null);

    // Right arm holding staff
    drawPoly(ctx, [
      [12, -54], [24, -50], [28, -48], [14, -42]
    ], cloak, INK, 1.0);
    ellipse(ctx, 28, -48, 3.5, 3.5, skin, INK, 0.8);

    // Left arm wrapped inside cloak
    drawPoly(ctx, [
      [-12, -54], [-18, -44], [-12, -38]
    ], cloak, INK, 1.0);

    // Wise, kind grandfather head
    const hy = -68;
    ellipse(ctx, 0, hy, 11, 10, skin, INK, 1.2);

    // Huge flowing silver-grey mossy beard down to y=-40
    drawPoly(ctx, [
      [-11, hy + 2], [11, hy + 2],
      [14, -48], [0, -38], [-14, -48]
    ], beard, INK, 1.2);
    // Beard flow strands
    line(ctx, [[-5, hy + 6], [-6, -42]], '#cbd5e1', 1.2);
    line(ctx, [[0, hy + 6], [0, -40]], '#cbd5e1', 1.2);
    line(ctx, [[5, hy + 6], [6, -42]], '#cbd5e1', 1.2);

    // Tall pointed forest-green mountain hat with turned brim
    drawPoly(ctx, [
      [-16, hy - 4], [16, hy - 4], [0, -96]
    ], cloakDark, INK, 1.4);
    ellipse(ctx, 0, hy - 4, 16, 4, cloak, INK, 1.0);
    // Pinecone and oak leaf on hat band
    ellipse(ctx, -8, hy - 7, 3, 4, '#78350f', INK, 0.6);
    ellipse(ctx, -11, hy - 9, 3, 2, '#65a30d', null);

    // Kind twinkling blue eyes & rosy cheeks
    ellipse(ctx, -4, hy - 2, 2.0, 2.2, '#0284c7', null);
    ellipse(ctx, 4, hy - 2, 2.0, 2.2, '#0284c7', null);
    ellipse(ctx, -7, hy + 2, 2.5, 1.5, '#f87171', null);
    ellipse(ctx, 7, hy + 2, 2.5, 1.5, '#f87171', null);

    // Big friendly bulbous nose
    ellipse(ctx, 0, hy + 1, 3.2, 2.6, '#fca5a5', INK, 0.8);

    ctx.restore();
  }

  // =============================================================
  // 10. WELSH_RED_DRAGON (Cute Welsh red dragon, zero flag/crest)
  // center: [0, -48], top: [0, -92], head: [0, -68], wing_l: [-38, -65]
  // =============================================================
  function drawWelshRedDragon(ctx, s, t) {
    ctx.save();
    const rubyRed = '#dc2626';
    const deepRed = '#991b1b';
    const underbelly = '#fde047';
    const wingMembrane = '#ef4444';
    const goldHorn = '#fbbf24';

    // Powerful sturdy dragon feet with claws
    drawPoly(ctx, [
      [-14, 0], [-4, 0], [-6, -14], [-13, -14]
    ], rubyRed, INK, 1.2);
    drawPoly(ctx, [
      [4, 0], [14, 0], [13, -14], [6, -14]
    ], rubyRed, INK, 1.2);
    // Claws
    for (const cx of [-12, -8, -4, 4, 8, 12]) {
      line(ctx, [[cx, 0], [cx, -4]], '#1e293b', 1.4);
    }

    // Long serpentine tail curling right with spade-arrow tip!
    path(ctx, 'M 10 -16 Q 30 -12 36 -24 Q 40 -34 32 -38', null, rubyRed, 6.0);
    // Arrow spade tail tip
    drawPoly(ctx, [
      [32, -38], [42, -36], [36, -26]
    ], deepRed, INK, 1.0);

    // Chubby noble dragon body
    ellipse(ctx, 0, -32, 17, 24, rubyRed, INK, 1.4);

    // Golden-yellow ribbed underbelly plates
    drawPoly(ctx, [
      [-9, -16], [9, -16], [7, -46], [-7, -46]
    ], underbelly, INK, 1.0);
    for (let by = -20; by >= -42; by -= 5) {
      line(ctx, [[-8, by], [8, by]], '#ca8a04', 1.2);
    }

    // Triangular back spines down the spine
    const spines = [[-2, -54], [0, -48], [2, -42], [4, -36], [6, -30]];
    for (const [sx, sy] of spines) {
      drawPoly(ctx, [
        [sx - 2, sy], [sx + 2, sy], [sx, sy - 5]
      ], goldHorn, INK, 0.8);
    }

    // Cute spread bat-like dragon wings (left and right)
    const wingFlap = Math.sin(t * 3.5) * 4;
    // Left wing
    const wL = [
      [-12, -48], [-28, -62 - wingFlap], [-42, -66 - wingFlap],
      [-36, -48], [-28, -40], [-12, -42]
    ];
    drawPoly(ctx, wL, wingMembrane, INK, 1.2);
    line(ctx, [[-12, -48], [-42, -66 - wingFlap]], deepRed, 2.0);
    line(ctx, [[-28, -62 - wingFlap], [-36, -48]], deepRed, 1.4);

    // Right wing
    const wR = [
      [12, -48], [28, -62 - wingFlap], [42, -66 - wingFlap],
      [36, -48], [28, -40], [12, -42]
    ];
    drawPoly(ctx, wR, wingMembrane, INK, 1.2);
    line(ctx, [[12, -48], [42, -66 - wingFlap]], deepRed, 2.0);
    line(ctx, [[28, -62 - wingFlap], [36, -48]], deepRed, 1.4);

    // Cute dragon head and curved snout
    const hy = -68;
    drawPoly(ctx, [
      [-10, hy - 4], [10, hy - 4], [14, hy + 10], [-6, hy + 12]
    ], rubyRed, INK, 1.4);

    // Two small golden swept-back horns
    drawPoly(ctx, [
      [-8, hy - 4], [-2, hy - 6], [-12, -90]
    ], goldHorn, INK, 1.0);
    drawPoly(ctx, [
      [2, hy - 6], [8, hy - 4], [12, -90]
    ], goldHorn, INK, 1.0);

    // Friendly expressive golden dragon eye
    ellipse(ctx, 4, hy + 1, 3.5, 4.0, '#fef08a', INK, 1.0);
    ellipse(ctx, 4, hy + 1, 1.8, 3.2, '#0f172a', null);
    ellipse(ctx, 3, hy - 0.5, 1.0, 1.0, '#ffffff', null);

    // Cute dragon snout nostril and tiny puff of friendly smoke ring
    ellipse(ctx, 12, hy + 6, 1.2, 1.2, '#451a03', null);
    ellipse(ctx, 18, hy + 2, 2.5, 2.0, 'rgba(148, 163, 184, 0.45)', null);

    // Happy smiling jaw
    path(ctx, `M 0 ${hy + 11} Q 8 ${hy + 14} 14 ${hy + 10}`, null, INK, 1.2);

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS (3)
  // 1. misty_forest_night
  // 2. rhine_cliff
  // 3. korean_mountain_night
  // All ground_y: 810, 7 weathers, day/night, ZERO text.
  // =============================================================

  function drawMistyForestNight(ctx, settings, t) {
    ctx.save();
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Deep enchanted misty night sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.6);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(0.6, '#0f172a');
      sky.addColorStop(1, '#064e3b');
    } else {
      sky.addColorStop(0, '#0f766e');
      sky.addColorStop(0.6, '#14b8a6');
      sky.addColorStop(1, '#ccfbf1');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    // Full moon shining through forest mist
    ellipse(ctx, 288, groundY * 0.22, 34, 34, isNight ? '#fef08a' : '#ffffff', null);
    ellipse(ctx, 288, groundY * 0.22, 48, 48, isNight ? 'rgba(254, 240, 138, 0.2)' : 'rgba(255, 255, 255, 0.25)', null);

    // Distant layered tree silhouettes fading into mist
    const treeFar = isNight ? '#064e3b' : '#0d9488';
    for (let tx = X0 - 40; tx <= X1 + 40; tx += 90) {
      ellipse(ctx, tx, groundY * 0.42, 60, 45, treeFar, null);
    }
    // Drifting forest mist ribbons
    for (let my = groundY * 0.38; my <= groundY * 0.56; my += 35) {
      path(ctx, `M ${X0} ${my} Q 200 ${my + 15} 380 ${my - 15} Q 500 ${my + 10} ${X1} ${my}`, null, isNight ? 'rgba(148, 163, 184, 0.25)' : 'rgba(204, 251, 241, 0.45)', 20);
    }

    // Midground ancient gnarled oak trees with mossy branches
    const oakCol = isNight ? '#022c22' : '#047857';
    const trunkCol = isNight ? '#1c1917' : '#451a03';

    // Massive ancient oak trunks
    drawPoly(ctx, [
      [90, groundY - 40], [130, groundY - 40],
      [118, groundY * 0.35], [96, groundY * 0.35]
    ], trunkCol, null);
    ellipse(ctx, 110, groundY * 0.35, 70, 45, oakCol, null);

    drawPoly(ctx, [
      [430, groundY - 40], [470, groundY - 40],
      [456, groundY * 0.38], [436, groundY * 0.38]
    ], trunkCol, null);
    ellipse(ctx, 450, groundY * 0.38, 65, 40, oakCol, null);

    // Landscape wings gnarled trees
    scatterExt(ext, 240, 'misty_oak', (x, r, i) => {
      drawPoly(ctx, [
        [x - 18, groundY - 40], [x + 18, groundY - 40],
        [x + 12, groundY * 0.36], [x - 12, groundY * 0.36]
      ], trunkCol, null);
      ellipse(ctx, x, groundY * 0.36, 60 + r * 20, 40, oakCol, null);
    });

    // Dark enchanted mossy forest floor (from groundY - 40 to 1024)
    const forestFloor = ctx.createLinearGradient(0, groundY - 40, 0, 1024);
    forestFloor.addColorStop(0, isNight ? '#064e3b' : '#15803d');
    forestFloor.addColorStop(0.4, isNight ? '#022c22' : '#14532d');
    forestFloor.addColorStop(1, isNight ? '#020617' : '#052e16');
    ctx.fillStyle = forestFloor;
    ctx.fillRect(X0, groundY - 40, X1 - X0, 1024 - (groundY - 40));

    // Twisting tree root knuckles, glowing mushrooms and fireflies
    for (let rx = 50; rx <= 520; rx += 80) {
      // Root knuckle
      path(ctx, `M ${rx - 25} ${groundY + 20} Q ${rx} ${groundY - 10} ${rx + 25} ${groundY + 20}`, null, trunkCol, 7);
      // Glowing luminescent forest mushrooms
      ellipse(ctx, rx + 14, groundY + 12, 3.5, 2.5, '#38bdf8', null);
      line(ctx, [[rx + 14, groundY + 12], [rx + 14, groundY + 18]], '#e2e8f0', 1.2);
    }
    tileExt(ext, 50, 80, 520, (x) => {
      path(ctx, `M ${x - 25} ${groundY + 20} Q ${x} ${groundY - 10} ${x + 25} ${groundY + 20}`, null, trunkCol, 7);
      ellipse(ctx, x + 14, groundY + 12, 3.5, 2.5, '#38bdf8', null);
      line(ctx, [[x + 14, groundY + 12], [x + 14, groundY + 18]], '#e2e8f0', 1.2);
    });

    // Twinkling fireflies
    for (let i = 0; i < 14; i++) {
      const fx = X0 + ((i * 127) % (X1 - X0));
      const fy = groundY - 100 + ((i * 43) % 180);
      ellipse(ctx, fx, fy, 2.0, 2.0, isNight ? '#fef08a' : '#ffffff', null);
    }

    ctx.restore();
  }

  function drawRhineCliff(ctx, settings, t) {
    ctx.save();
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Romantic Rhine river valley sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.55);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.6, '#172554');
      sky.addColorStop(1, '#3b0764');
    } else {
      sky.addColorStop(0, '#0284c7');
      sky.addColorStop(0.5, '#38bdf8');
      sky.addColorStop(1, '#fed7aa');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    // Famous steep Loreley slate rock cliff towering over river bend
    const cliffCol = isNight ? '#1e293b' : '#475569';
    const cliffHighlight = isNight ? '#334155' : '#64748b';
    drawPoly(ctx, [
      [310, groundY - 120], [380, groundY * 0.18],
      [480, groundY * 0.15], [540, groundY - 120]
    ], cliffCol, null);
    drawPoly(ctx, [
      [380, groundY * 0.18], [420, groundY * 0.16],
      [440, groundY - 120], [360, groundY - 120]
    ], cliffHighlight, null);

    // Medieval castle ruin tower silhouette perched on far cliff
    drawPoly(ctx, [
      [440, groundY * 0.16], [455, groundY * 0.16],
      [455, groundY * 0.11], [440, groundY * 0.11]
    ], isNight ? '#0f172a' : '#1e293b', null);
    // Battlements
    line(ctx, [[438, groundY * 0.11], [457, groundY * 0.11]], isNight ? '#0f172a' : '#1e293b', 2.0);

    // Landscape wings river cliffs
    scatterExt(ext, 260, 'rhine_crag', (x, r, i) => {
      drawPoly(ctx, [
        [x - 80, groundY - 120], [x, groundY * (0.16 + r * 0.1)],
        [x + 80, groundY - 120]
      ], cliffCol, null);
    });

    // Terraced Rhine vineyards climbing the hillsides
    const vineCol = isNight ? '#064e3b' : '#15803d';
    for (let vy = groundY * 0.38; vy <= groundY - 140; vy += 25) {
      line(ctx, [[320, vy], [520, vy]], isNight ? '#334155' : '#94a3b8', 1.4);
      ellipse(ctx, 420, vy - 4, 80, 5, vineCol, null);
    }

    // Winding Rhine river surface reflecting moonlight
    const river = ctx.createLinearGradient(0, groundY - 140, 0, groundY - 40);
    river.addColorStop(0, isNight ? '#0f172a' : '#0284c7');
    river.addColorStop(0.5, isNight ? '#1e3a8a' : '#38bdf8');
    river.addColorStop(1, isNight ? '#0c4a6e' : '#bae6fd');
    ctx.fillStyle = river;
    ctx.fillRect(X0, groundY - 140, X1 - X0, 100);

    // Moonlight water ripples on river
    for (let wx = X0 + 30; wx <= X1 - 30; wx += 60) {
      line(ctx, [[wx, groundY - 90], [wx + 30, groundY - 90]], isNight ? '#e0f2fe' : '#ffffff', 1.2);
      line(ctx, [[wx - 20, groundY - 70], [wx + 10, groundY - 70]], isNight ? '#bae6fd' : '#ffffff', 1.2);
    }

    // Riverside cobblestone promenade / rocky bank (from groundY - 40 to 1024)
    const bank = ctx.createLinearGradient(0, groundY - 40, 0, 1024);
    bank.addColorStop(0, isNight ? '#1e293b' : '#64748b');
    bank.addColorStop(0.4, isNight ? '#0f172a' : '#475569');
    bank.addColorStop(1, isNight ? '#020617' : '#334155');
    ctx.fillStyle = bank;
    ctx.fillRect(X0, groundY - 40, X1 - X0, 1024 - (groundY - 40));

    // Cobblestone paving and wooden boat mooring bollards
    for (let cx = 35; cx <= 540; cx += 70) {
      ellipse(ctx, cx, groundY + 40, 28, 14, isNight ? '#0f172a' : '#94a3b8', INK, 1.0);
    }
    tileExt(ext, 35, 70, 540, (x) => {
      ellipse(ctx, x, groundY + 40, 28, 14, isNight ? '#0f172a' : '#94a3b8', INK, 1.0);
    });

    // Wooden riverbank bollards
    for (const bx of [90, 288, 480]) {
      drawPoly(ctx, [
        [bx - 5, groundY - 35], [bx + 5, groundY - 35],
        [bx + 4, groundY - 5], [bx - 4, groundY - 5]
      ], '#78350f', INK, 1.2);
      ellipse(ctx, bx, groundY - 35, 5, 2.5, '#92400e', null);
    }
    scatterExt(ext, 180, 'rhine_bollard', (x, r, i) => {
      drawPoly(ctx, [
        [x - 5, groundY - 35], [x + 5, groundY - 35],
        [x + 4, groundY - 5], [x - 4, groundY - 5]
      ], '#78350f', INK, 1.2);
      ellipse(ctx, x, groundY - 35, 5, 2.5, '#92400e', null);
    });

    ctx.restore();
  }

  function drawKoreanMountainNight(ctx, settings, t) {
    ctx.save();
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Deep Asian ink-wash indigo night sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.6);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.5, '#0f172a');
      sky.addColorStop(1, '#1e1b4b');
    } else {
      sky.addColorStop(0, '#0369a1');
      sky.addColorStop(0.6, '#38bdf8');
      sky.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    // Luminous full moon with traditional flowing cloud ribbons
    ellipse(ctx, 160, groundY * 0.22, 32, 32, isNight ? '#fef08a' : '#ffffff', null);
    ellipse(ctx, 160, groundY * 0.22, 45, 45, isNight ? 'rgba(254, 240, 138, 0.2)' : 'rgba(255, 255, 255, 0.25)', null);
    // Flowing cloud ribbon across moon
    path(ctx, `M 80 ${groundY * 0.24} Q 160 ${groundY * 0.21} 240 ${groundY * 0.26}`, null, isNight ? 'rgba(226, 232, 240, 0.35)' : 'rgba(255, 255, 255, 0.6)', 5.0);

    // Far backdrop: Jagged granite peaks (Seoraksan style) in layered ink-wash tones
    const cragDark = isNight ? '#0f172a' : '#334155';
    const cragMid = isNight ? '#1e293b' : '#64748b';
    drawPoly(ctx, [
      [X0, groundY * 0.55],
      [70, groundY * 0.22], [140, groundY * 0.44],
      [270, groundY * 0.16], [380, groundY * 0.42],
      [490, groundY * 0.24], [X1, groundY * 0.55]
    ], cragDark, null);

    drawPoly(ctx, [
      [X0, groundY * 0.55],
      [180, groundY * 0.28], [240, groundY * 0.46],
      [360, groundY * 0.26], [440, groundY * 0.48], [X1, groundY * 0.55]
    ], cragMid, null);

    // Landscape wings peaks
    scatterExt(ext, 260, 'kr_crag', (x, r, i) => {
      drawPoly(ctx, [
        [x - 110, groundY * 0.55],
        [x, groundY * (0.16 + r * 0.12)],
        [x + 110, groundY * 0.55]
      ], cragDark, null);
    });

    // Sea of night clouds rolling below the peaks
    for (let my = groundY * 0.44; my <= groundY * 0.56; my += 30) {
      path(ctx, `M ${X0} ${my} Q 200 ${my + 20} 380 ${my - 15} Q 500 ${my + 10} ${X1} ${my}`, null, isNight ? 'rgba(148, 163, 184, 0.3)' : 'rgba(255, 255, 255, 0.5)', 18);
    }

    // Weathered, twisted Korean red pine trees (sonamu) clinging to rock ledges
    function drawSonamu(tx, ty, scale, flip) {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(flip ? -scale : scale, scale);
      // Gnarled red-brown trunk curving dramatically
      path(ctx, 'M 0 0 Q 25 -40 10 -80 Q -5 -110 15 -140', null, '#78350f', 9);
      // Pine needle cloud clusters
      const clusters = [[15, -140], [30, -125], [-5, -100], [25, -75]];
      for (const [cx, cy] of clusters) {
        ellipse(ctx, cx, cy, 26, 14, isNight ? '#064e3b' : '#15803d', null);
        ellipse(ctx, cx - 4, cy - 3, 20, 10, isNight ? '#047857' : '#22c55e', null);
      }
      ctx.restore();
    }

    drawSonamu(90, groundY - 40, 0.85, false);
    drawSonamu(480, groundY - 40, 0.95, true);
    scatterExt(ext, 220, 'sonamu_tree', (x, r, i) => {
      drawSonamu(x, groundY - 40, 0.75 + r * 0.25, i % 2 === 1);
    });

    // Rugged granite summit plateau ground (from groundY - 40 to 1024)
    const plateau = ctx.createLinearGradient(0, groundY - 40, 0, 1024);
    plateau.addColorStop(0, isNight ? '#1e293b' : '#78716c');
    plateau.addColorStop(0.4, isNight ? '#0f172a' : '#57534e');
    plateau.addColorStop(1, isNight ? '#020617' : '#292524');
    ctx.fillStyle = plateau;
    ctx.fillRect(X0, groundY - 40, X1 - X0, 1024 - (groundY - 40));

    // Granite slabs and traditional Korean prayer cairns (doltap - stacks of balancing pebbles)
    for (let gx = 45; gx <= 530; gx += 85) {
      ellipse(ctx, gx, groundY + 35, 32, 14, isNight ? '#1e293b' : '#a8a29e', INK, 1.2);
    }
    tileExt(ext, 45, 85, 530, (x) => {
      ellipse(ctx, x, groundY + 35, 32, 14, isNight ? '#1e293b' : '#a8a29e', INK, 1.2);
    });

    // Doltap prayer stone cairns (neat stacks of stones on summit)
    function drawDoltap(dx, dy) {
      ellipse(ctx, dx, dy, 14, 6, isNight ? '#334155' : '#78716c', INK, 1.0);
      ellipse(ctx, dx, dy - 5, 11, 5, isNight ? '#475569' : '#a8a29e', INK, 1.0);
      ellipse(ctx, dx, dy - 9, 8, 4, isNight ? '#64748b' : '#d6d3d1', INK, 0.8);
      ellipse(ctx, dx, dy - 13, 5, 3, isNight ? '#94a3b8' : '#f5f5f4', INK, 0.8);
    }
    drawDoltap(220, groundY + 25);
    drawDoltap(340, groundY + 45);
    scatterExt(ext, 190, 'kr_doltap', (x, r, i) => {
      drawDoltap(x, groundY + 25 + r * 30);
    });

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION (RemakeVector.register)
  // =============================================================
  const FOLK_SPIRITS_RIGS = {
    kitsune: {
      draw(ctx, s, t) { drawKitsune(ctx, s, t); }
    },
    gumiho: {
      draw(ctx, s, t) { drawGumiho(ctx, s, t); }
    },
    dokkaebi: {
      draw(ctx, s, t) { drawDokkaebi(ctx, s, t); }
    },
    yuki_onna: {
      draw(ctx, s, t) { drawYukiOnna(ctx, s, t); }
    },
    krampus_folk: {
      draw(ctx, s, t) { drawKrampusFolk(ctx, s, t); }
    },
    clay_golem: {
      draw(ctx, s, t) { drawClayGolem(ctx, s, t); }
    },
    will_o_wisp: {
      draw(ctx, s, t) { drawWillOWisp(ctx, s, t); }
    },
    selkie: {
      draw(ctx, s, t) { drawSelkie(ctx, s, t); }
    },
    rubezahl_spirit: {
      draw(ctx, s, t) { drawRubezahlSpirit(ctx, s, t); }
    },
    welsh_red_dragon: {
      draw(ctx, s, t) { drawWelshRedDragon(ctx, s, t); }
    }
  };

  const FOLK_SPIRITS_BACKGROUNDS = {
    misty_forest_night: {
      label: 'Rừng sương mù đêm huyền bí',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawMistyForestNight(ctx, settings, t); }
    },
    rhine_cliff: {
      label: 'Vách đá sông Rhine huyền thoại',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawRhineCliff(ctx, settings, t); }
    },
    korean_mountain_night: {
      label: 'Đỉnh núi Hàn Quốc trăng thanh gió mát',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawKoreanMountainNight(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: FOLK_SPIRITS_RIGS,
    backgrounds: FOLK_SPIRITS_BACKGROUNDS
  });

})();
