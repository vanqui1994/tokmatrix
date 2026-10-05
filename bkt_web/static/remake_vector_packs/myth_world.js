// remake_vector_packs/myth_world.js — Thần thoại thế giới (R5: ancient_mythology & folklore_legends)
// 18 rigs: chibi_deity_greek, chibi_deity_norse, chibi_deity_egypt, chibi_deity_jp, chibi_deity_kr,
//          world_tree_yggdrasil, thunder_hammer, scale_of_truth, myth_labyrinth, wooden_horse_trojan,
//          yamata_serpent, pandora_jar, sun_barge, prometheus_torch, icarus_wings, golden_lyre,
//          sisyphus_boulder, myth_dragon
// 5 backgrounds: olympus_clouds, asgard_bridge, duat_river, takamagahara, underworld_river
// (ground_y: 810, 7 weathers, day/night, ZERO text, full widescreen support with frameSpan)

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('RemakeVector core engine must be loaded before engine packs.');
  }

  const {
    path,
    line: kitLine,
    ellipse,
    taper,
    tone,
    volume,
    mixColor,
    INK,
    TAU,
    clamp,
    smooth,
    mix,
    hash
  } = RemakeVector.kit;

  function line(ctx, a, b, c, d, e, f) {
    if (Array.isArray(a)) return kitLine(ctx, a, b, c);
    return kitLine(ctx, [[a, b], [c, d]], e, f);
  }

  function drawPoly(ctx, pts, fill, stroke, width = 1) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  function drawColumn(ctx, cx, yBottom, rx, h, fill, stroke, width = 1) {
    drawPoly(ctx, [[cx - rx, yBottom - h], [cx + rx, yBottom - h], [cx + rx, yBottom], [cx - rx, yBottom]], fill, stroke, width);
    if (rx > 2) {
      ellipse(ctx, cx, yBottom - h, rx, Math.min(rx * 0.4, 6), fill, stroke, width);
      ellipse(ctx, cx, yBottom, rx, Math.min(rx * 0.4, 6), fill, stroke, width);
    }
  }

  function drawAnimeEye(ctx, x, y, rx, ry, irisCol = '#1e293b') {
    ellipse(ctx, x, y, rx, ry, '#ffffff', INK, 1.2);
    ellipse(ctx, x, y, rx * 0.65, ry * 0.75, irisCol, null);
    ellipse(ctx, x, y + ry * 0.1, rx * 0.35, ry * 0.45, '#0f172a', null);
    ellipse(ctx, x - rx * 0.22, y - ry * 0.25, rx * 0.26, ry * 0.26, '#ffffff', null);
    ellipse(ctx, x + rx * 0.22, y + ry * 0.2, rx * 0.14, ry * 0.14, '#ffffff', null);
  }

  // =============================================================
  // 1. CHIBI DEITY GREEK (Thần Hy Lạp: Apollo / Zeus chibi dễ thương)
  // Bounding box: x in [-25, 25], y in [-88, 0]
  // =============================================================
  function drawChibiDeityGreek(ctx, s, t) {
    ctx.save();
    const bob = Math.sin((t || 0) * 2.5) * 1.5;
    ctx.translate(0, bob);

    // Divine golden halo aura behind head
    const haloGrad = ctx.createRadialGradient(0, -62, 10, 0, -62, 25);
    haloGrad.addColorStop(0, 'rgba(254, 240, 138, 0.7)');
    haloGrad.addColorStop(0.7, 'rgba(250, 204, 21, 0.35)');
    haloGrad.addColorStop(1, 'rgba(234, 179, 8, 0)');
    ellipse(ctx, 0, -62, 25, 25, haloGrad, null);
    for (let a = 0; a < 8; a++) {
      const ang = a * (Math.PI / 4) + (t || 0) * 0.3;
      const lx = Math.cos(ang) * 23, ly = -62 + Math.sin(ang) * 23;
      line(ctx, [[lx * 0.7, -62 + (ly + 62) * 0.7], [lx, ly]], '#facc15', 1.4);
    }

    // Sandals on feet
    ellipse(ctx, -7, -2, 5, 2.5, '#78350f', INK, 1.0);
    ellipse(ctx, 7, -2, 5, 2.5, '#78350f', INK, 1.0);

    // White chiton tunic draped with crimson himation / sash
    drawPoly(ctx, [[-12, -45], [12, -45], [16, -4], [-16, -4]], '#f8fafc', INK, 1.5);
    // Gold meander trim at bottom
    line(ctx, [[-15, -6], [15, -6]], '#eab308', 1.8);
    // Crimson sash draped diagonally
    path(ctx, 'M -12 -45 Q 0 -30 14 -12 L 8 -4 Q -2 -22 -14 -42 Z', '#dc2626', INK, 1.2);
    // Gold belt at waist
    line(ctx, [[-13, -28], [13, -28]], '#eab308', 2.0);

    // Arms with golden bracelets
    drawPoly(ctx, [[-12, -42], [-20, -32], [-18, -30], [-10, -38]], '#fed7aa', INK, 1.2);
    ellipse(ctx, -20, -31, 2.5, 2.5, '#eab308', null);
    drawPoly(ctx, [[12, -42], [20, -32], [18, -30], [10, -38]], '#fed7aa', INK, 1.2);
    ellipse(ctx, 20, -31, 2.5, 2.5, '#eab308', null);
    // Holding a small olive sprig with golden leaves in right hand
    line(ctx, [[19, -32], [24, -40]], '#15803d', 1.2);
    ellipse(ctx, 23, -41, 3, 1.8, '#eab308', null, 0, 0.4);

    // Head
    ellipse(ctx, 0, -62, 16, 14, '#fed7aa', INK, 1.5);

    // Golden wavy hair curls
    path(ctx, 'M -16 -62 Q -18 -74 0 -75 Q 18 -74 16 -62 Q 18 -55 14 -50 Q 8 -52 6 -60 Q -6 -60 -8 -52 Q -14 -50 -16 -62 Z', '#f59e0b', INK, 1.4);
    // Curls on sides
    ellipse(ctx, -14, -58, 4, 6, '#f59e0b', INK, 1.0);
    ellipse(ctx, 14, -58, 4, 6, '#f59e0b', INK, 1.0);

    // Laurel wreath of emerald leaves
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const lx = sx * (6 + i * 2.8), ly = -73 + i * 2.2;
        ellipse(ctx, lx, ly, 3.2, 1.6, '#16a34a', INK, 0.8, sx * 0.4);
      }
    }
    ellipse(ctx, 0, -74, 2.5, 2.5, '#facc15', null);

    // Anime Eyes & Face
    drawAnimeEye(ctx, -6, -63, 3.6, 4.4, '#0284c7');
    drawAnimeEye(ctx, 6, -63, 3.6, 4.4, '#0284c7');
    ellipse(ctx, -9, -58, 3, 1.8, 'rgba(244, 63, 94, 0.45)', null);
    ellipse(ctx, 9, -58, 3, 1.8, 'rgba(244, 63, 94, 0.45)', null);
    path(ctx, 'M -3 -57 Q 0 -54 3 -57', null, INK, 1.4);

    ctx.restore();
  }

  // =============================================================
  // 2. CHIBI DEITY NORSE (Thần Bắc Âu: Odin / Thor chibi dễ thương)
  // Bounding box: x in [-27, 27], y in [-92, 0]
  // =============================================================
  function drawChibiDeityNorse(ctx, s, t) {
    ctx.save();
    const bob = Math.sin((t || 0) * 2.2) * 1.5;
    ctx.translate(0, bob);

    // Fur-trimmed teal cloak behind
    drawPoly(ctx, [[-16, -48], [16, -48], [22, -2], [-22, -2]], '#0f766e', INK, 1.5);
    // Fur mantle hem
    ellipse(ctx, 0, -2, 23, 4, '#e2e8f0', INK, 1.2);

    // Boots
    drawPoly(ctx, [[-10, -10], [-5, -10], [-5, -2], [-12, -2]], '#78350f', INK, 1.2);
    drawPoly(ctx, [[5, -10], [10, -10], [12, -2], [5, -2]], '#78350f', INK, 1.2);

    // Tunic & bronze cuirass
    drawPoly(ctx, [[-12, -45], [12, -45], [14, -12], [-14, -12]], '#1e293b', INK, 1.4);
    drawPoly(ctx, [[-9, -42], [9, -42], [8, -25], [-8, -25]], '#b45309', INK, 1.2);
    // Rune medallion
    ellipse(ctx, 0, -32, 4, 4, '#f59e0b', INK, 1.0);
    // Fur collar around neck
    ellipse(ctx, 0, -46, 17, 6, '#cbd5e1', INK, 1.2);

    // Arms
    drawPoly(ctx, [[-13, -42], [-20, -32], [-17, -29], [-10, -38]], '#fed7aa', INK, 1.2);
    drawPoly(ctx, [[13, -42], [20, -32], [17, -29], [10, -38]], '#fed7aa', INK, 1.2);

    // Head
    ellipse(ctx, 0, -60, 15, 13, '#fed7aa', INK, 1.5);

    // Braided blond/grey beard
    drawPoly(ctx, [[-10, -56], [10, -56], [5, -42], [0, -36], [-5, -42]], '#fcd34d', INK, 1.2);
    ellipse(ctx, 0, -39, 3, 2, '#94a3b8', null); // beard ring

    // Winged Viking helmet
    drawPoly(ctx, [[-15, -64], [15, -64], [13, -74], [0, -78], [-13, -74]], '#64748b', INK, 1.5);
    line(ctx, [[-15, -64], [15, -64]], '#d97706', 2.0);
    // Curved golden feather wings on helmet reaching y = -92
    for (const sx of [-1, 1]) {
      path(ctx, `M ${sx * 10} -70 Q ${sx * 22} -82 ${sx * 18} -92 Q ${sx * 12} -80 ${sx * 8} -74 Z`, '#fbbf24', INK, 1.2);
      line(ctx, [[sx * 12, -74], [sx * 16, -88]], '#d97706', 1.0);
    }

    // Eyes: one eye friendly open blue, one eye wink/wise patch
    drawAnimeEye(ctx, 6, -61, 3.4, 4.0, '#0284c7');
    path(ctx, 'M -8 -60 Q -5 -57 -2 -60', null, INK, 1.8);
    line(ctx, [[-12, -67], [-1, -54]], '#334155', 1.2);

    ctx.restore();
  }

  // =============================================================
  // 3. CHIBI DEITY EGYPT (Thần Ai Cập: Ra / Anubis chibi đáng yêu)
  // Bounding box: x in [-25, 25], y in [-94, 0]
  // =============================================================
  function drawChibiDeityEgypt(ctx, s, t) {
    ctx.save();
    const bob = Math.sin((t || 0) * 2.3) * 1.5;
    ctx.translate(0, bob);

    // Golden solar disk crown with lotus horns reaching y = -94
    path(ctx, 'M -12 -72 Q -18 -84 -12 -93 Q -15 -80 -6 -73 Z', '#eab308', INK, 1.2);
    path(ctx, 'M 12 -72 Q 18 -84 12 -93 Q 15 -80 6 -73 Z', '#eab308', INK, 1.2);
    // Brilliant glowing solar disk
    ellipse(ctx, 0, -82, 10, 10, '#ef4444', INK, 1.5);
    ellipse(ctx, 0, -82, 7.5, 7.5, '#facc15', null);

    // Sandals
    ellipse(ctx, -7, -2, 5, 2, '#d97706', INK, 1.0);
    ellipse(ctx, 7, -2, 5, 2.5, '#d97706', INK, 1.0);

    // White pleated shendyt kilt with gold ceremonial sash
    drawPoly(ctx, [[-12, -40], [12, -40], [15, -6], [-15, -6]], '#f8fafc', INK, 1.4);
    // Golden central sash
    drawPoly(ctx, [[-4, -40], [4, -40], [5, -4], [-5, -4]], '#eab308', INK, 1.2);
    line(ctx, [[-13, -38], [13, -38]], '#b45309', 2.0); // belt

    // Broad wesekh collar of turquoise and gold concentric rows
    drawPoly(ctx, [[-15, -46], [15, -46], [12, -36], [-12, -36]], '#06b6d4', INK, 1.2);
    line(ctx, [[-14, -42], [14, -42]], '#f59e0b', 1.6);
    line(ctx, [[-12, -38], [12, -38]], '#0891b2', 1.4);

    // Arms
    drawPoly(ctx, [[-12, -42], [-20, -32], [-18, -30], [-10, -38]], '#fed7aa', INK, 1.2);
    drawPoly(ctx, [[12, -42], [20, -32], [18, -30], [10, -38]], '#fed7aa', INK, 1.2);

    // Striped nemes headdress flaring behind head
    path(ctx, 'M -14 -64 L -22 -44 L -14 -42 L -8 -50 Z', '#1e3a8a', INK, 1.2);
    path(ctx, 'M 14 -64 L 22 -44 L 14 -42 L 8 -50 Z', '#1e3a8a', INK, 1.2);
    line(ctx, [[-20, -48], [-14, -46]], '#eab308', 1.8);
    line(ctx, [[20, -48], [14, -46]], '#eab308', 1.8);

    // Head
    ellipse(ctx, 0, -60, 15, 13, '#fed7aa', INK, 1.5);
    // Nemes crown over forehead
    path(ctx, 'M -14 -64 Q 0 -72 14 -64 Q 12 -74 0 -75 Q -12 -74 -14 -64 Z', '#1e3a8a', INK, 1.2);
    line(ctx, [[-14, -64], [14, -64]], '#eab308', 2.0);

    // Kohl-lined almond eyes
    for (const sx of [-1, 1]) {
      const ex = sx * 6, ey = -60;
      ellipse(ctx, ex, ey, 3.6, 4.0, '#ffffff', INK, 1.2);
      ellipse(ctx, ex, ey, 2.2, 2.8, '#78350f', null);
      ellipse(ctx, ex + sx * 0.5, ey - 0.5, 1.0, 1.0, '#ffffff', null);
      line(ctx, [[ex + sx * 3.5, ey], [ex + sx * 6.5, ey - 0.8]], INK, 1.5);
    }
    ellipse(ctx, -8, -55, 3, 1.6, 'rgba(244, 63, 94, 0.4)', null);
    ellipse(ctx, 8, -55, 3, 1.6, 'rgba(244, 63, 94, 0.4)', null);
    path(ctx, 'M -3 -54 Q 0 -51 3 -54', null, INK, 1.4);

    ctx.restore();
  }

  // =============================================================
  // 4. CHIBI DEITY JAPAN (Thần Nhật Bản: Amaterasu chibi dễ thương)
  // Bounding box: x in [-26, 26], y in [-90, 0]
  // =============================================================
  function drawChibiDeityJp(ctx, s, t) {
    ctx.save();
    const bob = Math.sin((t || 0) * 2.4) * 1.5;
    ctx.translate(0, bob);

    // Solar halo radiating golden beams behind head
    const halo = ctx.createRadialGradient(0, -62, 10, 0, -62, 26);
    halo.addColorStop(0, 'rgba(254, 215, 170, 0.8)');
    halo.addColorStop(0.7, 'rgba(239, 68, 68, 0.35)');
    halo.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ellipse(ctx, 0, -62, 26, 26, halo, null);
    for (let i = 0; i < 8; i++) {
      const a = i * (Math.PI / 4) + (t || 0) * 0.2;
      line(ctx, [[Math.cos(a) * 16, -62 + Math.sin(a) * 16], [Math.cos(a) * 25, -62 + Math.sin(a) * 25]], '#ef4444', 1.5);
    }

    // Zori sandals
    ellipse(ctx, -6, -2, 4.5, 2, '#78350f', INK, 1.0);
    ellipse(ctx, 6, -2, 4.5, 2, '#78350f', INK, 1.0);

    // Crimson hakama skirt
    drawPoly(ctx, [[-13, -34], [13, -34], [16, -4], [-16, -4]], '#dc2626', INK, 1.5);
    line(ctx, [[0, -34], [0, -4]], '#b91c1c', 1.2); // hakama pleat

    // White ceremonial kimono robe with wide sleeves
    drawPoly(ctx, [[-12, -48], [12, -48], [14, -32], [-14, -32]], '#f8fafc', INK, 1.4);
    line(ctx, [[-10, -48], [4, -34]], '#dc2626', 1.6);
    line(ctx, [[10, -48], [-4, -34]], '#dc2626', 1.6);

    // Magatama curved comma jewel necklace
    for (let m = -2; m <= 2; m++) {
      ellipse(ctx, m * 4.5, -36 + Math.abs(m) * 1.2, 2.2, 1.6, '#10b981', INK, 0.8, m * 0.3);
    }

    // Wide flowing kimono sleeves
    path(ctx, 'M -12 -46 L -24 -36 L -20 -24 L -10 -34 Z', '#f8fafc', INK, 1.4);
    path(ctx, 'M 12 -46 L 24 -36 L 20 -24 L 10 -34 Z', '#f8fafc', INK, 1.4);
    line(ctx, [[-24, -34], [-20, -24]], '#dc2626', 1.2);
    line(ctx, [[24, -34], [20, -24]], '#dc2626', 1.2);

    // Head
    ellipse(ctx, 0, -62, 16, 14, '#fed7aa', INK, 1.5);

    // Flowing dark hime-cut hair reaching down to y = -45
    path(ctx, 'M -16 -62 Q -18 -76 0 -77 Q 18 -76 16 -62 L 18 -44 L 14 -46 L 14 -58 Q 0 -63 -14 -58 L -14 -46 L -18 -44 Z', '#1e1b4b', INK, 1.5);
    path(ctx, 'M -14 -66 Q 0 -70 14 -66 L 12 -62 Q 0 -64 -12 -62 Z', '#1e1b4b', null);
    ellipse(ctx, 12, -73, 3, 3, '#f59e0b', INK, 1.0);
    line(ctx, [[12, -73], [16, -65]], '#dc2626', 1.2);

    // Large shiny anime eyes
    drawAnimeEye(ctx, -6, -63, 3.6, 4.4, '#831843');
    drawAnimeEye(ctx, 6, -63, 3.6, 4.4, '#831843');
    ellipse(ctx, -9, -58, 3, 1.8, 'rgba(244, 63, 94, 0.5)', null);
    ellipse(ctx, 9, -58, 3, 1.8, 'rgba(244, 63, 94, 0.5)', null);
    path(ctx, 'M -3 -57 Q 0 -54 3 -57', null, INK, 1.4);

    ctx.restore();
  }

  // =============================================================
  // 5. CHIBI DEITY KOREA (Thần Hàn Quốc: Dangun / Hwanung chibi dễ thương)
  // Bounding box: x in [-25, 25], y in [-92, 0]
  // =============================================================
  function drawChibiDeityKr(ctx, s, t) {
    ctx.save();
    const bob = Math.sin((t || 0) * 2.3) * 1.5;
    ctx.translate(0, bob);

    // Dark shoes
    ellipse(ctx, -7, -2, 5, 2.5, '#1e293b', INK, 1.0);
    ellipse(ctx, 7, -2, 5, 2.5, '#1e293b', INK, 1.0);

    // Royal blue & white silk durumagi robe
    drawPoly(ctx, [[-13, -44], [13, -44], [17, -4], [-17, -4]], '#1d4ed8', INK, 1.5);
    ellipse(ctx, 0, -4, 15, 3, '#f8fafc', INK, 1.0);
    line(ctx, [[-14, -30], [14, -30]], '#dc2626', 2.2);
    ellipse(ctx, 0, -28, 3.2, 2.5, '#10b981', INK, 1.0);
    line(ctx, [[0, -28], [0, -20]], '#dc2626', 1.4);

    // Crossed collar (dongjeong) in crisp white
    line(ctx, [[-11, -44], [4, -30]], '#f8fafc', 2.2);
    line(ctx, [[11, -44], [-4, -30]], '#f8fafc', 2.2);

    // Flowing blue sleeves
    path(ctx, 'M -12 -42 L -22 -32 L -19 -22 L -10 -32 Z', '#1d4ed8', INK, 1.3);
    path(ctx, 'M 12 -42 L 22 -32 L 19 -22 L 10 -32 Z', '#1d4ed8', INK, 1.3);

    // Head
    ellipse(ctx, 0, -60, 15, 13, '#fed7aa', INK, 1.5);

    // Golden openwork heavenly crown (geumgwan) reaching up to y = -92
    drawPoly(ctx, [[-12, -66], [12, -66], [10, -74], [-10, -74]], '#f59e0b', INK, 1.4);
    line(ctx, [[-8, -74], [-8, -90]], '#f59e0b', 2.0);
    line(ctx, [[0, -74], [0, -92]], '#f59e0b', 2.4);
    line(ctx, [[8, -74], [8, -90]], '#f59e0b', 2.0);
    line(ctx, [[-10, -82], [-6, -82]], '#f59e0b', 1.6);
    line(ctx, [[-3, -84], [3, -84]], '#f59e0b', 1.8);
    line(ctx, [[6, -82], [10, -82]], '#f59e0b', 1.6);
    ellipse(ctx, -10, -68, 2, 3, '#10b981', null);
    ellipse(ctx, 10, -68, 2, 3, '#10b981', null);

    // Eyes & friendly expression
    drawAnimeEye(ctx, -6, -60, 3.4, 4.0, '#1e293b');
    drawAnimeEye(ctx, 6, -60, 3.4, 4.0, '#1e293b');
    ellipse(ctx, -8, -55, 3, 1.8, 'rgba(244, 63, 94, 0.45)', null);
    ellipse(ctx, 8, -55, 3, 1.8, 'rgba(244, 63, 94, 0.45)', null);
    path(ctx, 'M -3 -54 Q 0 -51 3 -54', null, INK, 1.4);

    ctx.restore();
  }

  // =============================================================
  // 6. WORLD TREE YGGDRASIL (Cây thế giới Yggdrasil thần thoại)
  // Bounding box: x in [-35, 35], y in [-96, 0]
  // =============================================================
  function drawWorldTreeYggdrasil(ctx, s, t) {
    ctx.save();

    // 3 Twisting root arches spreading into the ground
    drawPoly(ctx, [[-14, -28], [-32, -4], [-22, 0], [-8, -14]], '#57534e', INK, 1.5);
    drawPoly(ctx, [[14, -28], [32, -4], [22, 0], [8, -14]], '#57534e', INK, 1.5);
    drawPoly(ctx, [[-6, -20], [0, 0], [6, -20]], '#78716c', INK, 1.2);

    // Trunk with glowing runic sap channels
    drawPoly(ctx, [[-12, -45], [12, -45], [14, -25], [-14, -25]], '#44403c', INK, 1.6);
    line(ctx, [[-6, -42], [-10, -22], [-22, -2]], '#22d3ee', 1.8);
    line(ctx, [[4, -44], [8, -24], [20, -2]], '#22d3ee', 1.8);
    line(ctx, [[0, -45], [0, -15]], '#67e8f9', 1.4);

    // Branches branching into canopy
    line(ctx, [[-10, -45], [-24, -60]], '#44403c', 3.5);
    line(ctx, [[10, -45], [24, -60]], '#44403c', 3.5);
    line(ctx, [[0, -45], [0, -68]], '#44403c', 3.5);

    // Lush three-tiered glowing canopy (y in [-96, -48])
    ellipse(ctx, -18, -55, 16, 12, '#047857', INK, 1.5);
    ellipse(ctx, 18, -55, 16, 12, '#047857', INK, 1.5);
    ellipse(ctx, 0, -58, 22, 14, '#059669', INK, 1.5);

    ellipse(ctx, -12, -72, 14, 11, '#10b981', INK, 1.4);
    ellipse(ctx, 12, -72, 14, 11, '#10b981', INK, 1.4);
    ellipse(ctx, 0, -74, 18, 13, '#34d399', INK, 1.5);

    ellipse(ctx, 0, -86, 14, 10, '#6ee7b7', INK, 1.4);

    // Starlight orbs & aurora leaves glowing in the branches
    const glowPhase = (t || 0) * 2;
    for (let i = 0; i < 7; i++) {
      const gx = Math.sin(i * 1.7 + glowPhase) * 20;
      const gy = -72 + Math.cos(i * 2.1 + glowPhase) * 16;
      ellipse(ctx, gx, gy, 2.5, 2.5, '#fef08a', null);
    }

    ctx.restore();
  }

  // =============================================================
  // 7. THUNDER HAMMER (Búa sấm Mjölnir của Thor)
  // Bounding box: x in [-25, 25], y in [-82, 0]
  // =============================================================
  function drawThunderHammer(ctx, s, t) {
    ctx.save();
    const floatBob = Math.sin((t || 0) * 3) * 2;
    ctx.translate(0, floatBob);

    // Pommel loop at base
    ellipse(ctx, 0, -4, 4, 4, '#94a3b8', INK, 1.2);
    // Leather wrapped handle
    drawPoly(ctx, [[-4, -50], [4, -50], [3, -6], [-3, -6]], '#78350f', INK, 1.4);
    for (let y = -46; y < -8; y += 7) {
      line(ctx, [[-3.5, y], [3.5, y + 3]], '#d97706', 1.2);
      line(ctx, [[3.5, y], [-3.5, y + 3]], '#d97706', 1.2);
    }

    // Heavy beveled stone hammer head (y in [-82, -50], x in [-24, 24])
    drawPoly(ctx, [[-22, -52], [22, -52], [24, -58], [24, -76], [22, -82], [-22, -82], [-24, -76], [-24, -58]], '#475569', INK, 1.8);
    drawPoly(ctx, [[-20, -55], [20, -55], [21, -78], [-21, -78]], '#64748b', null);
    path(ctx, 'M -14 -67 L -6 -61 L 0 -67 L 6 -61 L 14 -67 L 6 -73 L 0 -67 L -6 -73 Z', null, '#38bdf8', 1.8);

    // Blue-white electric lightning sparks
    const spark = Math.sin((t || 0) * 12);
    if (spark > -0.2) {
      for (const [sx, sy] of [[-24, -67], [24, -67], [-18, -82], [18, -82]]) {
        line(ctx, [[sx, sy], [sx + (spark > 0 ? 5 : -5), sy - 5], [sx + (spark > 0 ? 3 : -3), sy - 10]], '#e0f2fe', 1.6);
      }
    }

    ctx.restore();
  }

  // =============================================================
  // 8. SCALE OF TRUTH (Cán cân chân lý Maat của Ai Cập)
  // Bounding box: x in [-30, 30], y in [-90, 0]
  // =============================================================
  function drawScaleOfTruth(ctx, s, t) {
    ctx.save();
    const sway = Math.sin((t || 0) * 1.8) * 3;

    // Golden pedestal base
    ellipse(ctx, 0, -2, 18, 5, '#eab308', INK, 1.5);
    drawPoly(ctx, [[-12, -2], [12, -2], [4, -18], [-4, -18]], '#ca8a04', INK, 1.4);

    // Central golden pillar
    drawColumn(ctx, 0, -18, 3, 54, '#eab308', INK, 1.4);
    // Lotus capital at top (y = -90)
    drawPoly(ctx, [[-8, -84], [8, -84], [6, -72], [-6, -72]], '#ca8a04', INK, 1.2);
    ellipse(ctx, 0, -88, 3.5, 3.5, '#facc15', INK, 1.2);

    // Balanced crossbeam tilting gently by sway
    ctx.save();
    ctx.translate(0, -78);
    ctx.rotate(sway * 0.008);
    line(ctx, [[-26, 0], [26, 0]], '#eab308', 2.8);
    ellipse(ctx, 0, 0, 3, 3, '#b45309', null);

    // Left pan: holds Ostrich Feather of Maat
    ctx.save();
    ctx.translate(-24, 0);
    line(ctx, [[0, 0], [-6, 38]], '#b45309', 1.0);
    line(ctx, [[0, 0], [6, 38]], '#b45309', 1.0);
    ellipse(ctx, 0, 38, 9, 3, '#ca8a04', INK, 1.2);
    path(ctx, 'M 0 36 Q -5 24 -1 16 Q 4 24 0 36 Z', '#f8fafc', '#38bdf8', 1.2);
    line(ctx, [[0, 36], [-0.5, 17]], '#38bdf8', 1.0);
    ctx.restore();

    // Right pan: holds Ruby Heart
    ctx.save();
    ctx.translate(24, 0);
    line(ctx, [[0, 0], [-6, 38]], '#b45309', 1.0);
    line(ctx, [[0, 0], [6, 38]], '#b45309', 1.0);
    ellipse(ctx, 0, 38, 9, 3, '#ca8a04', INK, 1.2);
    path(ctx, 'M 0 36 C -8 30 -6 20 0 24 C 6 20 8 30 0 36 Z', '#ef4444', INK, 1.2);
    ellipse(ctx, -2, 26, 1.5, 2.5, '#fca5a5', null, 0, -0.3);
    ctx.restore();

    ctx.restore(); // crossbeam
    ctx.restore();
  }

  // =============================================================
  // 9. MYTH LABYRINTH (Mê cung đảo Crete thần thoại)
  // Bounding box: x in [-36, 36], y in [-75, 0]
  // =============================================================
  function drawMythLabyrinth(ctx, s, t) {
    ctx.save();

    // Base mound
    ellipse(ctx, 0, -4, 36, 12, '#78716c', INK, 1.4);

    // Isometric circular labyrinth concentric stone walls
    const rings = [
      { rx: 34, ry: 16, y: -16, h: 8, col: '#a8a29e' },
      { rx: 25, ry: 12, y: -28, h: 9, col: '#d6d3d1' },
      { rx: 16, ry: 8,  y: -40, h: 9, col: '#e7e5e4' },
      { rx: 8,  ry: 4,  y: -52, h: 8, col: '#f5f5f4' }
    ];

    for (const r of rings) {
      drawPoly(ctx, [[-r.rx, r.y], [r.rx, r.y], [r.rx, r.y - r.h], [-r.rx, r.y - r.h]], r.col, INK, 1.4);
      ellipse(ctx, 0, r.y - r.h, r.rx, r.ry, tone(r.col, 0.1), INK, 1.2);
    }

    // Entrance stone archway at front
    drawPoly(ctx, [[-6, -14], [-6, -26], [6, -26], [6, -14]], '#78716c', INK, 1.5);
    drawPoly(ctx, [[-3, -14], [-3, -22], [3, -22], [3, -14]], '#1c1917', null);
    ellipse(ctx, -5, -23, 1.8, 2.5, '#f59e0b', null);
    ellipse(ctx, 5, -23, 1.8, 2.5, '#f59e0b', null);

    // Central altar at core (y = -62)
    drawColumn(ctx, 0, -60, 4, 6, '#ca8a04', INK, 1.0);
    ellipse(ctx, 0, -66, 4, 2, '#facc15', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // 10. WOODEN HORSE TROJAN (Ngựa gỗ thành Troy)
  // Bounding box: x in [-38, 36], y in [-92, 0]
  // =============================================================
  function drawWoodenHorseTrojan(ctx, s, t) {
    ctx.save();

    // Wheeled timber platform (y in [-14, 0])
    drawPoly(ctx, [[-34, -14], [34, -14], [34, -8], [-34, -8]], '#92400e', INK, 1.6);
    for (const wx of [-24, -8, 8, 24]) {
      ellipse(ctx, wx, -4, 4.5, 4.5, '#78350f', INK, 1.4);
      ellipse(ctx, wx, -4, 2, 2, '#d97706', null);
    }

    // Sturdy wooden legs
    drawPoly(ctx, [[-26, -14], [-20, -14], [-18, -44], [-24, -44]], '#b45309', INK, 1.4);
    drawPoly(ctx, [[-16, -14], [-10, -14], [-12, -44], [-18, -44]], '#92400e', INK, 1.2);
    drawPoly(ctx, [[10, -14], [16, -14], [18, -44], [12, -44]], '#b45309', INK, 1.4);
    drawPoly(ctx, [[20, -14], [26, -14], [24, -44], [18, -44]], '#92400e', INK, 1.2);

    // Barrel wooden chest (y in [-62, -42], x in [-26, 22])
    drawPoly(ctx, [[-26, -60], [18, -62], [22, -44], [-24, -44]], '#b45309', INK, 1.8);
    for (let px = -20; px <= 14; px += 6) {
      line(ctx, [[px, -60], [px, -44]], '#78350f', 1.0);
    }
    line(ctx, [[-25, -57], [20, -57]], '#1e293b', 1.4);
    line(ctx, [[-24, -47], [21, -47]], '#1e293b', 1.4);

    // Trapdoor hatch on flank
    drawPoly(ctx, [[-8, -56], [4, -56], [4, -48], [-8, -48]], '#78350f', INK, 1.2);
    ellipse(ctx, 2, -52, 1, 1, '#1e293b', null);

    // Wooden horse neck and carved head (reaching y = -92)
    drawPoly(ctx, [[14, -60], [22, -74], [20, -88], [12, -88], [8, -62]], '#b45309', INK, 1.6);
    drawPoly(ctx, [[12, -88], [24, -86], [28, -78], [18, -74], [14, -78]], '#d97706', INK, 1.6);
    ellipse(ctx, 18, -82, 1.8, 1.8, '#1e293b', null);
    drawPoly(ctx, [[12, -88], [10, -92], [15, -88]], '#b45309', INK, 1.2);
    for (let m = 0; m < 4; m++) {
      drawPoly(ctx, [[8 - m * 2, -84 + m * 6], [13 - m * 2, -84 + m * 6], [11 - m * 2, -80 + m * 6]], '#78350f', INK, 1.0);
    }

    // Tail of timber strips
    path(ctx, 'M -26 -56 Q -34 -48 -32 -32', null, '#78350f', 2.5);

    ctx.restore();
  }

  // =============================================================
  // 11. YAMATA SERPENT (Rắn tám đầu Yamata no Orochi bản đáng yêu)
  // Bounding box: x in [-38, 38], y in [-88, 0]
  // =============================================================
  function drawYamataSerpent(ctx, s, t) {
    ctx.save();

    // Coiled green serpent body at base
    ellipse(ctx, 0, -12, 32, 12, '#047857', INK, 1.8);
    ellipse(ctx, 0, -8, 24, 7, '#fef08a', null);
    path(ctx, 'M 28 -10 Q 36 -14 34 -24 Q 30 -22 26 -16', '#047857', INK, 1.4);

    const heads = [
      { x: -30, y: -72, ang: -0.4 },
      { x: -22, y: -80, ang: -0.25 },
      { x: -12, y: -85, ang: -0.1 },
      { x: -4,  y: -88, ang: 0.0 },
      { x: 4,   y: -88, ang: 0.0 },
      { x: 12,  y: -85, ang: 0.1 },
      { x: 22,  y: -80, ang: 0.25 },
      { x: 30,  y: -72, ang: 0.4 }
    ];

    for (let i = 0; i < heads.length; i++) {
      const h = heads[i];
      const nw = Math.sin((t || 0) * 2.5 + i * 0.8) * 1.5;
      const hx = h.x + nw, hy = h.y;

      ctx.beginPath();
      ctx.moveTo(hx * 0.4, -14);
      ctx.quadraticCurveTo(hx * 0.7, hy * 0.5, hx, hy + 4);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 5.0;
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.0;
      ctx.stroke();

      ellipse(ctx, hx, hy, 7, 6, '#10b981', INK, 1.4);
      ellipse(ctx, hx + (h.ang * 3), hy + 2, 4, 3, '#fef08a', null);
      ellipse(ctx, hx + (h.ang * 2), hy - 1, 2.0, 2.0, '#0f172a', null);
      ellipse(ctx, hx + (h.ang * 2) - 0.5, hy - 1.5, 0.8, 0.8, '#ffffff', null);
      line(ctx, [[hx, hy - 5], [hx + (h.ang * 2), hy - 8]], '#f59e0b', 1.2);
    }

    ctx.restore();
  }

  // =============================================================
  // 12. PANDORA JAR (Chiếc bình Pandora - Pithos Hy Lạp thần thoại)
  // Bounding box: x in [-25, 25], y in [-85, 0]
  // =============================================================
  function drawPandoraJar(ctx, s, t) {
    ctx.save();

    // Terracotta amphora foot
    ellipse(ctx, 0, -3, 12, 4, '#c2410c', INK, 1.5);
    drawColumn(ctx, 0, -2, 6, 8, '#ea580c', INK, 1.4);

    // Swelling rounded terracotta jar body (y in [-55, -10])
    drawPoly(ctx, [[-8, -10], [8, -10], [22, -32], [14, -55], [-14, -55], [-22, -32]], '#ea580c', INK, 1.8);
    line(ctx, [[-20, -30], [20, -30]], '#1c1917', 2.0);
    line(ctx, [[-21, -34], [21, -34]], '#f97316', 1.4);

    // Jar neck and rim
    drawColumn(ctx, 0, -54, 9, 8, '#c2410c', INK, 1.5);
    ellipse(ctx, 0, -62, 13, 4, '#9a3412', INK, 1.4);

    // Twin looped amphora handles
    path(ctx, 'M -14 -54 Q -24 -46 -18 -36', null, '#9a3412', 3.0);
    path(ctx, 'M 14 -54 Q 24 -46 18 -36', null, '#9a3412', 3.0);

    // Cracked stone lid tilted ajar
    ctx.save();
    ctx.translate(2, -64);
    ctx.rotate(0.22);
    ellipse(ctx, 0, 0, 14, 4.5, '#78716c', INK, 1.4);
    ellipse(ctx, 0, -3, 3, 3, '#a8a29e', INK, 1.0);
    ctx.restore();

    // Cosmic swirling purple and cyan mist leaking out reaching y = -85
    const mistPhase = (t || 0) * 3;
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const u = ((mistPhase * 0.4 + i * 0.2) % 1.0);
      const mx = Math.sin(u * 5 + i) * (10 + u * 12);
      const my = mix(-64, -84, u);
      const mr = 3 + u * 5;
      const mcol = i % 2 === 0 ? 'rgba(168, 85, 247, 0.45)' : 'rgba(56, 189, 248, 0.45)';
      ellipse(ctx, mx, my, mr, mr * 0.8, mcol, null);
    }
    ellipse(ctx, 4, -82, 2.5, 2.5, '#fde047', null);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 13. SUN BARGE (Thuyền mặt trời của thần Ra)
  // Bounding box: x in [-41, 41], y in [-80, 0]
  // =============================================================
  function drawSunBarge(ctx, s, t) {
    ctx.save();
    const bob = Math.sin((t || 0) * 2.5) * 2;
    ctx.translate(0, bob);

    ctx.beginPath();
    ctx.moveTo(-38, -55);
    ctx.quadraticCurveTo(-34, -12, -20, -4);
    ctx.lineTo(20, -4);
    ctx.quadraticCurveTo(34, -12, 38, -55);
    ctx.quadraticCurveTo(32, -25, 18, -16);
    ctx.lineTo(-18, -16);
    ctx.quadraticCurveTo(-32, -25, -38, -55);
    ctx.closePath();
    ctx.fillStyle = '#eab308';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ellipse(ctx, -38, -56, 4, 3, '#06b6d4', INK, 1.0);
    ellipse(ctx, 38, -56, 4, 3, '#06b6d4', INK, 1.0);

    line(ctx, [[-26, -12], [26, -12]], '#ca8a04', 1.5);
    line(ctx, [[-20, -7], [20, -7]], '#ca8a04', 1.5);

    drawPoly(ctx, [[-16, -38], [16, -38], [14, -16], [-14, -16]], '#ca8a04', INK, 1.4);
    line(ctx, [[-12, -38], [-12, -16]], '#eab308', 2.0);
    line(ctx, [[12, -38], [12, -16]], '#eab308', 2.0);

    const sunGlow = ctx.createRadialGradient(0, -58, 6, 0, -58, 20);
    sunGlow.addColorStop(0, '#fef08a');
    sunGlow.addColorStop(0.5, '#ef4444');
    sunGlow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ellipse(ctx, 0, -58, 20, 20, sunGlow, null);
    ellipse(ctx, 0, -58, 11, 11, '#ef4444', INK, 1.6);
    ellipse(ctx, 0, -58, 8, 8, '#facc15', null);

    line(ctx, [[-28, -20], [-40, 2]], '#78350f', 2.2);
    ellipse(ctx, -40, 2, 3, 5, '#78350f', INK, 1.0, 0, 0.4);

    line(ctx, [[-30, -2], [30, -2]], 'rgba(56, 189, 248, 0.65)', 1.5);

    ctx.restore();
  }

  // =============================================================
  // 14. PROMETHEUS TORCH (Đuốc Prometheus mang ngọn lửa thiêng)
  // Bounding box: x in [-21, 21], y in [-92, 0]
  // =============================================================
  function drawPrometheusTorch(ctx, s, t) {
    ctx.save();

    drawColumn(ctx, 0, -2, 4, 24, '#b45309', INK, 1.4);
    ellipse(ctx, 0, -22, 5, 2, '#d97706', INK, 1.0);
    ellipse(ctx, 0, -10, 5, 2, '#d97706', INK, 1.0);
    ellipse(ctx, 0, -2, 4, 4, '#78350f', INK, 1.0);

    // Wide brazier bowl (y in [-48, -25])
    drawPoly(ctx, [[-15, -48], [15, -48], [6, -26], [-6, -26]], '#d97706', INK, 1.6);
    ellipse(ctx, 0, -48, 15, 5, '#f59e0b', INK, 1.4);

    // Blazing sacred flame reaching y = -92
    const fPhase = (t || 0) * 5;
    const f1 = Math.sin(fPhase) * 2;
    const f2 = Math.cos(fPhase * 1.3) * 2;

    path(ctx, `M -14 -48 Q -16 -68 ${f1} -90 Q 16 -68 14 -48 Z`, '#ef4444', INK, 1.4);
    path(ctx, `M -10 -48 Q -10 -64 ${f2} -82 Q 10 -64 10 -48 Z`, '#f97316', null);
    path(ctx, `M -6 -48 Q -5 -60 ${f1 * 0.5} -72 Q 5 -60 6 -48 Z`, '#fde047', null);
    ellipse(ctx, 0, -52, 4, 6, '#ffffff', null);

    for (let i = 0; i < 4; i++) {
      const u = ((fPhase * 0.2 + i * 0.3) % 1.0);
      const sx = Math.sin(u * 6 + i) * 8;
      const sy = mix(-75, -92, u);
      ellipse(ctx, sx, sy, 1.2, 1.2, '#fef08a', null);
    }

    ctx.restore();
  }

  // =============================================================
  // 15. ICARUS WINGS (Đôi cánh lông vũ sáp của Icarus)
  // Bounding box: x in [-38, 38], y in [-85, 0]
  // =============================================================
  function drawIcarusWings(ctx, s, t) {
    ctx.save();
    const flap = Math.sin((t || 0) * 3) * 3;
    const yOff = Math.sin((t || 0) * 2) * 2;
    ctx.translate(0, -35 + yOff);

    ellipse(ctx, 0, 0, 7, 9, '#78350f', INK, 1.4);
    ellipse(ctx, 0, 0, 3.5, 3.5, '#d97706', INK, 1.0);

    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.rotate(sx * flap * 0.015);

      path(ctx, `M ${sx * 6} -6 Q ${sx * 22} -18 ${sx * 36} -32`, null, '#f59e0b', 3.5);

      for (let f = 0; f < 5; f++) {
        const u = f / 4;
        const fx = sx * mix(12, 36, u);
        const fy = mix(-18, -48, u);
        const tipX = sx * mix(18, 38, u);
        const tipY = mix(10, -25, u);
        path(ctx, `M ${fx} ${fy} Q ${tipX} ${tipY - 6} ${tipX} ${tipY} Q ${fx - sx * 4} ${tipY - 8} ${fx} ${fy}`, '#f8fafc', INK, 1.0);
      }

      for (let f = 0; f < 4; f++) {
        const u = f / 3;
        const fx = sx * mix(8, 28, u);
        const fy = mix(-12, -38, u);
        const tipX = sx * mix(14, 28, u);
        const tipY = mix(2, -18, u);
        path(ctx, `M ${fx} ${fy} Q ${tipX} ${tipY - 4} ${tipX} ${tipY} Q ${fx - sx * 3} ${tipY - 6} ${fx} ${fy}`, '#fef08a', INK, 0.9);
      }

      for (let f = 0; f < 3; f++) {
        ellipse(ctx, sx * (10 + f * 6), -10 - f * 6, 6, 3.5, '#fde047', INK, 0.8, sx * 0.5);
      }

      ctx.restore();
    }

    const dFeatherY = ((t || 0) * 14) % 30 - 10;
    ellipse(ctx, 16 + Math.sin(t || 0) * 3, dFeatherY, 3, 1.2, '#f8fafc', null, 0, 0.6);

    ctx.restore();
  }

  // =============================================================
  // 16. GOLDEN LYRE (Cây đàn lyre vàng của Orpheus & Apollo)
  // Bounding box: x in [-26, 26], y in [-86, 0]
  // =============================================================
  function drawGoldenLyre(ctx, s, t) {
    ctx.save();
    const bob = Math.sin((t || 0) * 2.2) * 1.5;
    ctx.translate(0, bob);

    drawPoly(ctx, [[-16, -38], [16, -38], [18, -12], [10, -4], [-10, -4], [-18, -12]], '#d97706', INK, 1.8);
    ellipse(ctx, 0, -22, 6, 6, '#78350f', INK, 1.2);
    ellipse(ctx, 0, -22, 3, 3, '#f59e0b', null);

    path(ctx, 'M -14 -38 C -26 -52 -26 -72 -18 -82 L -12 -82 C -20 -72 -20 -52 -10 -38 Z', '#f59e0b', INK, 1.5);
    path(ctx, 'M 14 -38 C 26 -52 26 -72 18 -82 L 12 -82 C 20 -72 20 -52 10 -38 Z', '#f59e0b', INK, 1.5);

    drawPoly(ctx, [[-16, -84], [16, -84], [16, -79], [-16, -79]], '#eab308', INK, 1.4);
    ellipse(ctx, -18, -82, 3, 3, '#ca8a04', INK, 1.0);
    ellipse(ctx, 18, -82, 3, 3, '#ca8a04', INK, 1.0);

    for (let i = 0; i < 7; i++) {
      const sx = mix(-11, 11, i / 6);
      line(ctx, [[sx, -80], [sx * 0.7, -38]], '#f8fafc', 1.0);
    }

    const mPhase = (t || 0) * 2;
    ellipse(ctx, 18 + Math.sin(mPhase) * 3, -65 + Math.cos(mPhase) * 4, 2, 2, '#fde047', null);
    ellipse(ctx, -16 + Math.cos(mPhase) * 3, -70 + Math.sin(mPhase) * 4, 1.5, 1.5, '#fde047', null);

    ctx.restore();
  }

  // =============================================================
  // 17. SISYPHUS BOULDER (Tảng đá Sisyphus lăn vô tận)
  // Bounding box: x in [-37, 37], y in [-84, 0]
  // =============================================================
  function drawSisyphusBoulder(ctx, s, t) {
    ctx.save();

    ellipse(ctx, 0, -3, 35, 6, 'rgba(120, 113, 108, 0.45)', null);
    ellipse(ctx, -26, -4, 4, 2.5, '#78350f', INK, 0.8);
    ellipse(ctx, 24, -4, 5, 3, '#57534e', INK, 0.8);

    drawPoly(ctx, [
      [-30, -22], [-35, -42], [-28, -66], [-12, -80],
      [12, -84], [28, -74], [35, -50], [33, -26],
      [20, -8], [-4, -4], [-24, -8]
    ], '#57534e', INK, 2.0);

    drawPoly(ctx, [[-28, -66], [-12, -80], [4, -65], [-14, -50]], '#78350f', null);
    drawPoly(ctx, [[-12, -80], [12, -84], [20, -68], [4, -65]], '#a8a29e', null);
    drawPoly(ctx, [[12, -84], [28, -74], [26, -52], [20, -68]], '#78350f', null);
    drawPoly(ctx, [[-4, -4], [20, -8], [16, -30], [-10, -32]], '#44403c', null);

    ellipse(ctx, -16, -28, 8, 5, '#15803d', null, 0, 0.3);
    ellipse(ctx, 14, -42, 6, 4, '#166534', null, 0, -0.4);
    line(ctx, [[-8, -70], [-2, -50], [4, -44]], '#1c1917', 1.4);
    line(ctx, [[12, -60], [18, -48]], '#1c1917', 1.2);

    ctx.restore();
  }

  // =============================================================
  // 18. MYTH DRAGON (Rồng thần thoại phương Đông & Tây bản đáng yêu)
  // Bounding box: x in [-38, 38], y in [-90, 0]
  // =============================================================
  function drawMythDragon(ctx, s, t) {
    ctx.save();
    const bob = Math.sin((t || 0) * 2.5) * 1.5;
    ctx.translate(0, bob);

    path(ctx, 'M -14 -24 Q -32 -20 -35 -34 Q -38 -20 -28 -10 Q -20 -8 -12 -12', '#b91c1c', INK, 1.4);
    drawPoly(ctx, [[-35, -34], [-38, -42], [-30, -38]], '#f59e0b', INK, 1.2);

    const wFlap = Math.sin((t || 0) * 4) * 3;
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.translate(sx * 10, -48);
      ctx.rotate(sx * wFlap * 0.015);
      path(ctx, `M 0 0 Q ${sx * 16} -28 ${sx * 28} -24 Q ${sx * 22} -8 ${sx * 16} 2 Q ${sx * 8} -2 0 0 Z`, '#dc2626', INK, 1.4);
      path(ctx, `M 0 0 Q ${sx * 16} -26 ${sx * 26} -22 Q ${sx * 18} -8 ${sx * 12} 0 Z`, '#f87171', null);
      ctx.restore();
    }

    ellipse(ctx, -9, -3, 6, 3.5, '#991b1b', INK, 1.2);
    ellipse(ctx, 9, -3, 6, 3.5, '#991b1b', INK, 1.2);

    ellipse(ctx, 0, -32, 18, 24, '#dc2626', INK, 1.8);
    ellipse(ctx, 0, -30, 11, 19, '#fef08a', INK, 1.2);
    line(ctx, [[-8, -38], [8, -38]], '#ca8a04', 1.2);
    line(ctx, [[-9, -30], [9, -30]], '#ca8a04', 1.2);
    line(ctx, [[-8, -22], [8, -22]], '#ca8a04', 1.2);

    ellipse(ctx, 0, -68, 17, 14, '#dc2626', INK, 1.6);
    ellipse(ctx, 0, -63, 12, 8, '#ef4444', INK, 1.2);
    ellipse(ctx, -3, -64, 1.5, 1.5, '#7f1d1d', null);
    ellipse(ctx, 3, -64, 1.5, 1.5, '#7f1d1d', null);
    drawPoly(ctx, [[-2, -59], [0, -56], [2, -59]], '#ffffff', INK, 0.8);

    drawAnimeEye(ctx, -7, -70, 3.8, 4.4, '#047857');
    drawAnimeEye(ctx, 7, -70, 3.8, 4.4, '#047857');

    path(ctx, 'M -8 -78 Q -16 -88 -12 -90 Q -8 -85 -4 -78 Z', '#f59e0b', INK, 1.2);
    path(ctx, 'M 8 -78 Q 16 -88 12 -90 Q 8 -85 4 -78 Z', '#f59e0b', INK, 1.2);

    const sPhase = (t || 0) * 3;
    ellipse(ctx, 5 + Math.sin(sPhase) * 2, -60 - (sPhase % 1) * 8, 1.8, 1.8, 'rgba(251, 146, 60, 0.65)', null);

    ctx.restore();
  }


  // =============================================================
  // BACKGROUNDS
  // 5 Backgrounds: olympus_clouds, asgard_bridge, duat_river, takamagahara, underworld_river
  // ground_y: 810, 7 weathers, day/night, ZERO text, full frameSpan support
  // =============================================================

  function extRanges(x0, x1) {
    const out = [];
    if (x0 < 0) out.push([x0, 0]);
    if (x1 > 576) out.push([576, x1]);
    return out;
  }

  function scatterExt(ext, step, key, fn) {
    for (const [a, b] of ext) {
      let i = 0;
      for (let x = a + step * 0.5; x < b - step * 0.3; i++) {
        const r = RemakeVector.kit.seeded(`${key}:${Math.round(x)}`);
        fn(x, r, i);
        x += step * (0.7 + r * 0.6);
      }
    }
  }

  // 1. OLYMPUS CLOUDS (Đỉnh Olympus bồng bềnh mây)
  function drawOlympusClouds(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Sky gradient: golden sunset / dawn or celestial violet night
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.75);
    if (isNight) {
      sky.addColorStop(0, '#0f172a');
      sky.addColorStop(0.5, '#1e1b4b');
      sky.addColorStop(1, '#312e81');
    } else {
      sky.addColorStop(0, '#38bdf8');
      sky.addColorStop(0.5, '#fed7aa');
      sky.addColorStop(1, '#fde68a');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    if (isNight) {
      ellipse(ctx, 420, 120, 24, 24, '#fef08a', null);
      ellipse(ctx, 430, 116, 22, 22, '#1e1b4b', null);
      for (let i = 0; i < 20; i++) {
        const sx = X0 + ((i * 137 + 50) % (X1 - X0));
        const sy = (i * 73 + 30) % 350;
        ellipse(ctx, sx, sy, 1.5, 1.5, '#ffffff', null);
      }
    } else {
      const sun = ctx.createRadialGradient(288, 140, 10, 288, 140, 90);
      sun.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
      sun.addColorStop(0.5, 'rgba(250, 204, 21, 0.4)');
      sun.addColorStop(1, 'rgba(234, 179, 8, 0)');
      ellipse(ctx, 288, 140, 90, 90, sun, null);
    }

    for (let x = X0 - 50; x < X1 + 100; x += 180) {
      const ph = 120 + Math.sin(x * 0.05) * 40;
      drawPoly(ctx, [[x - 110, groundY * 0.65], [x, groundY * 0.65 - ph], [x + 110, groundY * 0.65]], isNight ? '#1e1b4b' : '#c084fc', null);
      drawPoly(ctx, [[x - 30, groundY * 0.65 - ph * 0.7], [x, groundY * 0.65 - ph], [x + 30, groundY * 0.65 - ph * 0.7]], isNight ? '#312e81' : '#f8fafc', null);
    }

    // Main Greek Classical Temple Colonnade (x in 60..516)
    drawPoly(ctx, [[80, groundY - 140], [288, groundY - 210], [496, groundY - 140]], isNight ? '#334155' : '#f8fafc', INK, 1.8);
    drawPoly(ctx, [[100, groundY - 144], [288, groundY - 200], [476, groundY - 144]], isNight ? '#1e293b' : '#e2e8f0', null);
    drawPoly(ctx, [[78, groundY - 130], [498, groundY - 130], [498, groundY - 142], [78, groundY - 142]], isNight ? '#475569' : '#f1f5f9', INK, 1.5);

    for (let c = 120; c <= 456; c += 56) {
      drawColumn(ctx, c, groundY - 50, 9, 80, isNight ? '#334155' : '#f8fafc', INK, 1.4);
      ellipse(ctx, c, groundY - 128, 12, 4, isNight ? '#475569' : '#e2e8f0', INK, 1.2);
      ellipse(ctx, c, groundY - 50, 12, 4, isNight ? '#475569' : '#e2e8f0', INK, 1.2);
    }
    drawPoly(ctx, [[58, groundY - 26], [518, groundY - 26], [518, groundY - 40], [58, groundY - 40]], isNight ? '#1e293b' : '#e2e8f0', INK, 1.6);
    drawPoly(ctx, [[43, groundY - 8], [533, groundY - 8], [533, groundY - 24], [43, groundY - 24]], isNight ? '#0f172a' : '#cbd5e1', INK, 1.6);

    const cloudFill = ctx.createLinearGradient(0, groundY - 50, 0, 1024);
    if (isNight) {
      cloudFill.addColorStop(0, '#1e293b');
      cloudFill.addColorStop(0.5, '#0f172a');
      cloudFill.addColorStop(1, '#020617');
    } else {
      cloudFill.addColorStop(0, '#f8fafc');
      cloudFill.addColorStop(0.5, '#e2e8f0');
      cloudFill.addColorStop(1, '#cbd5e1');
    }
    ctx.fillStyle = cloudFill;
    ctx.fillRect(X0, groundY - 40, X1 - X0, 1024 - (groundY - 40));

    for (let cx = X0 - 30; cx <= X1 + 60; cx += 45) {
      const r = 28 + Math.sin(cx * 0.1) * 8;
      ellipse(ctx, cx, groundY - 35, r, r * 0.65, isNight ? '#334155' : '#ffffff', null);
    }

    scatterExt(ext, 280, 'olympus_ext', (x, r, i) => {
      if (i % 2 === 0) {
        drawColumn(ctx, x, groundY - 50, 42, 60, isNight ? '#334155' : '#f8fafc', INK, 1.4);
        ellipse(ctx, x, groundY - 110, 44, 18, isNight ? '#475569' : '#e2e8f0', INK, 1.4);
        drawPoly(ctx, [[x - 40, groundY - 110], [x, groundY - 150], [x + 40, groundY - 110]], isNight ? '#1e293b' : '#cbd5e1', INK, 1.4);
      } else {
        drawColumn(ctx, x, groundY - 40, 14, 30, isNight ? '#334155' : '#e2e8f0', INK, 1.2);
        ellipse(ctx, x, groundY - 75, 12, 16, '#eab308', INK, 1.2);
      }
    });

    ctx.restore();
  }

  // 2. ASGARD BRIDGE (Cầu vồng Bifrost tới Asgard)
  function drawAsgardBridge(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.7);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.5, '#0f172a');
      sky.addColorStop(1, '#1e1b4b');
    } else {
      // Ban ngày: trời xanh sáng trên Asgard, cực quang mờ, không sao.
      sky.addColorStop(0, '#3b82f6');
      sky.addColorStop(0.55, '#93c5fd');
      sky.addColorStop(1, '#e0e7ff');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    for (let i = 0; i < (isNight ? 30 : 0); i++) {
      const sx = X0 + ((i * 127 + 40) % (X1 - X0));
      const sy = (i * 61 + 20) % 360;
      ellipse(ctx, sx, sy, 1.4, 1.4, '#ffffff', null);
    }

    const aWave = Math.sin((t || 0) * 1.5) * 15;
    ctx.save();
    path(ctx, `M ${X0} 140 Q ${(X0 + X1) * 0.3} ${100 + aWave} ${(X0 + X1) * 0.5} 150 Q ${(X0 + X1) * 0.8} ${190 - aWave} ${X1} 130`, null, 'rgba(52, 211, 153, 0.45)', 24);
    path(ctx, `M ${X0} 170 Q ${(X0 + X1) * 0.35} ${130 - aWave} ${(X0 + X1) * 0.55} 170 Q ${(X0 + X1) * 0.75} ${210 + aWave} ${X1} 160`, null, 'rgba(168, 85, 247, 0.35)', 18);
    ctx.restore();

    for (let x = X0; x <= X1; x += 110) {
      const th = 80 + Math.sin(x * 0.1) * 35;
      drawColumn(ctx, x, groundY - 60, 22, th, '#b45309', INK, 1.4);
      drawPoly(ctx, [[x - 22, groundY - 60 - th], [x, groundY - 60 - th - 38], [x + 22, groundY - 60 - th]], '#f59e0b', INK, 1.4);
      ellipse(ctx, x, groundY - 60 - th - 40, 3, 3, '#fde047', null);
    }

    const rainbowColors = [
      '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6'
    ];
    const bridgeY = groundY - 50;
    const bandH = 14;
    for (let c = 0; c < rainbowColors.length; c++) {
      ctx.fillStyle = rainbowColors[c];
      ctx.fillRect(X0, bridgeY + c * bandH, X1 - X0, bandH + 1);
    }
    const baseGrad = ctx.createLinearGradient(0, bridgeY + 7 * bandH, 0, 1024);
    baseGrad.addColorStop(0, '#4338ca');
    baseGrad.addColorStop(1, '#020617');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(X0, bridgeY + 7 * bandH, X1 - X0, 1024 - (bridgeY + 7 * bandH));

    for (let bx = X0 - 10; bx <= X1 + 20; bx += 48) {
      drawColumn(ctx, bx, bridgeY, 6, 22, '#e0e7ff', INK, 1.2);
      ellipse(ctx, bx, bridgeY - 22, 5, 5, '#a5b4fc', null);
    }

    scatterExt(ext, 260, 'asgard_ext', (x, r, i) => {
      drawColumn(ctx, x, bridgeY, 14, 85, '#6366f1', INK, 1.4);
      drawPoly(ctx, [[x - 14, bridgeY - 85], [x, bridgeY - 120], [x + 14, bridgeY - 85]], '#a5b4fc', INK, 1.2);
      ellipse(ctx, x, bridgeY - 122, 4, 4, '#ffffff', null);
    });

    ctx.restore();
  }

  // 3. DUAT RIVER (Dòng sông Duat cõi âm Ai Cập)
  function drawDuatRiver(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.7);
    sky.addColorStop(0, '#020617');
    sky.addColorStop(0.6, '#0f172a');
    sky.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    for (let i = 0; i < 24; i++) {
      const sx = X0 + ((i * 139 + 30) % (X1 - X0));
      const sy = (i * 67 + 25) % 360;
      ellipse(ctx, sx, sy, 1.5, 1.5, '#fde047', null);
    }
    ellipse(ctx, 430, 110, 28, 28, '#fef08a', null);
    ellipse(ctx, 430, 110, 34, 34, 'rgba(254, 240, 138, 0.25)', null);

    drawPoly(ctx, [[60, groundY - 60], [160, groundY - 160], [260, groundY - 60]], '#78350f', INK, 1.4);
    drawPoly(ctx, [[320, groundY - 60], [440, groundY - 180], [540, groundY - 60]], '#78350f', INK, 1.4);
    drawColumn(ctx, 290, groundY - 60, 8, 120, '#b45309', INK, 1.4);
    drawPoly(ctx, [[282, groundY - 180], [290, groundY - 200], [298, groundY - 180]], '#f59e0b', INK, 1.2);

    const water = ctx.createLinearGradient(0, groundY - 60, 0, 1024);
    water.addColorStop(0, '#0c4a6e');
    water.addColorStop(0.4, '#075985');
    water.addColorStop(1, '#020617');
    ctx.fillStyle = water;
    ctx.fillRect(X0, groundY - 60, X1 - X0, 1024 - (groundY - 60));

    const rPhase = (t || 0) * 2;
    for (let ry = groundY - 40; ry < 1000; ry += 35) {
      for (let rx = X0 + 20; rx < X1 - 20; rx += 90) {
        const rw = 25 + Math.sin(rx + ry + rPhase) * 10;
        line(ctx, [[rx, ry], [rx + rw, ry]], 'rgba(254, 240, 138, 0.45)', 1.5);
      }
    }

    for (let px = X0 - 20; px <= X1 + 40; px += 32) {
      const ph = 55 + Math.sin(px * 0.2) * 20;
      line(ctx, [[px, groundY - 40], [px, groundY - 40 - ph]], '#047857', 2.0);
      ellipse(ctx, px, groundY - 40 - ph, 7, 4, '#10b981', null, 0, 0.4);
    }

    scatterExt(ext, 270, 'duat_ext', (x, r, i) => {
      drawPoly(ctx, [[x - 35, groundY - 60], [x - 28, groundY - 150], [x + 28, groundY - 150], [x + 35, groundY - 60]], '#78350f', INK, 1.5);
      drawPoly(ctx, [[x - 12, groundY - 60], [x - 10, groundY - 110], [x + 10, groundY - 110], [x + 12, groundY - 60]], '#020617', null);
      drawColumn(ctx, x + 45, groundY - 60, 5, 80, '#451a03', null);
      for (let a = 0; a < 6; a++) {
        const ang = a * (Math.PI / 3);
        line(ctx, [[x + 45, groundY - 140], [x + 45 + Math.cos(ang) * 26, groundY - 140 + Math.sin(ang) * 16]], '#047857', 2.2);
      }
    });

    ctx.restore();
  }

  // 4. TAKAMAGAHARA (Cao Thiên Nguyên Takamagahara)
  function drawTakamagahara(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.7);
    if (isNight) {
      sky.addColorStop(0, '#09090b');
      sky.addColorStop(0.5, '#18181b');
      sky.addColorStop(1, '#27272a');
    } else {
      sky.addColorStop(0, '#fbcfe8');
      sky.addColorStop(0.4, '#fef08a');
      sky.addColorStop(1, '#fed7aa');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    for (let x = X0 + 20; x <= X1; x += 180) {
      const iy = groundY * 0.45 + Math.sin(x * 0.08) * 30;
      ellipse(ctx, x, iy, 55, 18, isNight ? '#27272a' : '#15803d', INK, 1.2);
      ellipse(ctx, x - 15, iy - 22, 24, 16, '#f472b6', null);
      ellipse(ctx, x + 15, iy - 20, 20, 14, '#fbcfe8', null);
    }

    drawPoly(ctx, [[380, groundY - 50], [420, groundY - 170], [530, groundY - 160], [550, groundY - 50]], '#52525b', INK, 1.4);
    drawPoly(ctx, [[430, groundY - 50], [445, groundY - 120], [485, groundY - 120], [500, groundY - 50]], '#fef08a', null);

    const toriiCol = '#dc2626';
    drawColumn(ctx, 130, groundY - 50, 8, 120, toriiCol, INK, 1.4);
    drawColumn(ctx, 230, groundY - 50, 8, 120, toriiCol, INK, 1.4);
    drawPoly(ctx, [[100, groundY - 180], [260, groundY - 180], [266, groundY - 170], [94, groundY - 170]], toriiCol, INK, 1.5);
    drawPoly(ctx, [[110, groundY - 155], [250, groundY - 155], [250, groundY - 147], [110, groundY - 147]], toriiCol, INK, 1.4);
    path(ctx, 'M 130 -148 Q 180 -138 230 -148', null, '#d97706', 3.0);
    for (const sx of [150, 180, 210]) {
      drawPoly(ctx, [[sx - 3, groundY - 146], [sx + 3, groundY - 146], [sx + 4, groundY - 132], [sx, groundY - 128]], '#f8fafc', INK, 1.0);
    }

    const terrace = ctx.createLinearGradient(0, groundY - 50, 0, 1024);
    terrace.addColorStop(0, isNight ? '#27272a' : '#16a34a');
    terrace.addColorStop(0.5, isNight ? '#18181b' : '#15803d');
    terrace.addColorStop(1, isNight ? '#09090b' : '#166534');
    ctx.fillStyle = terrace;
    ctx.fillRect(X0, groundY - 50, X1 - X0, 1024 - (groundY - 50));

    const petalPhase = (t || 0) * 2;
    for (let p = 0; p < 15; p++) {
      const px = X0 + ((p * 83 + petalPhase * 25) % (X1 - X0));
      const py = (p * 59 + petalPhase * 20) % (groundY - 50);
      ellipse(ctx, px, py, 3, 2, '#f472b6', null, 0, 0.4);
    }

    scatterExt(ext, 250, 'takamaga_ext', (x, r, i) => {
      drawColumn(ctx, x, groundY - 50, 6, 45, '#a1a1aa', INK, 1.2);
      drawPoly(ctx, [[x - 12, groundY - 95], [x + 12, groundY - 95], [x + 8, groundY - 110], [x - 8, groundY - 110]], '#71717a', INK, 1.2);
      ellipse(ctx, x, groundY - 102, 3, 3, '#fde047', null);
      drawPoly(ctx, [[x - 16, groundY - 110], [x + 16, groundY - 110], [x, groundY - 124]], '#52525b', INK, 1.2);
    });

    ctx.restore();
  }

  // 5. UNDERWORLD RIVER (Dòng sông Styx cõi âm Hy Lạp)
  function drawUnderworldRiver(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    const cave = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    cave.addColorStop(0, '#020617');
    cave.addColorStop(0.5, '#0f172a');
    cave.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = cave;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    for (let x = X0 + 20; x <= X1; x += 55) {
      const sh = 40 + Math.sin(x * 0.15) * 25;
      drawPoly(ctx, [[x - 8, 0], [x, sh], [x + 8, 0]], '#0891b2', INK, 1.2);
      ellipse(ctx, x, sh + 2, 2.5, 2.5, '#22d3ee', null);
    }

    drawPoly(ctx, [[40, groundY - 60], [160, groundY - 210], [280, groundY - 60]], '#0f172a', INK, 1.6);
    drawPoly(ctx, [[340, groundY - 60], [450, groundY - 190], [560, groundY - 60]], '#0f172a', INK, 1.6);

    const water = ctx.createLinearGradient(0, groundY - 60, 0, 1024);
    water.addColorStop(0, '#042f2e');
    water.addColorStop(0.4, '#115e59');
    water.addColorStop(1, '#020617');
    ctx.fillStyle = water;
    ctx.fillRect(X0, groundY - 60, X1 - X0, 1024 - (groundY - 60));

    const wPhase = (t || 0) * 2.5;
    for (let w = 0; w < 8; w++) {
      const wx = 80 + w * 65 + Math.sin(wPhase + w * 1.5) * 15;
      const wy = groundY - 30 + Math.cos(wPhase * 0.8 + w) * 12;
      ellipse(ctx, wx, wy, 8, 8, 'rgba(34, 211, 238, 0.35)', null);
      ellipse(ctx, wx, wy, 4, 4, '#a5f3fc', null);
      ellipse(ctx, wx, wy, 1.5, 1.5, '#ffffff', null);
    }

    drawPoly(ctx, [[X0 + 20, groundY - 50], [240, groundY - 50], [220, groundY - 10], [X0 + 20, groundY - 10]], '#334155', INK, 1.6);
    drawColumn(ctx, 210, groundY - 50, 7, 24, '#1e293b', INK, 1.2);
    ellipse(ctx, 210, groundY - 78, 6, 8, '#0891b2', INK, 1.2);
    ellipse(ctx, 210, groundY - 78, 3, 3, '#67e8f9', null);

    scatterExt(ext, 260, 'styx_ext', (x, r, i) => {
      drawPoly(ctx, [[x - 16, groundY - 50], [x - 8, groundY - 120], [x, groundY - 50]], '#06b6d4', INK, 1.2);
      drawPoly(ctx, [[x - 4, groundY - 50], [x + 6, groundY - 140], [x + 14, groundY - 50]], '#22d3ee', INK, 1.2);
      drawPoly(ctx, [[x + 8, groundY - 50], [x + 18, groundY - 100], [x + 24, groundY - 50]], '#0891b2', INK, 1.2);
    });

    ctx.restore();
  }


  // =============================================================
  // REGISTRATION
  // =============================================================

  const MYTH_RIGS = {
    chibi_deity_greek: { draw(ctx, s, t) { drawChibiDeityGreek(ctx, s, t); } },
    chibi_deity_norse: { draw(ctx, s, t) { drawChibiDeityNorse(ctx, s, t); } },
    chibi_deity_egypt: { draw(ctx, s, t) { drawChibiDeityEgypt(ctx, s, t); } },
    chibi_deity_jp:    { draw(ctx, s, t) { drawChibiDeityJp(ctx, s, t); } },
    chibi_deity_kr:    { draw(ctx, s, t) { drawChibiDeityKr(ctx, s, t); } },
    world_tree_yggdrasil: { draw(ctx, s, t) { drawWorldTreeYggdrasil(ctx, s, t); } },
    thunder_hammer:    { draw(ctx, s, t) { drawThunderHammer(ctx, s, t); } },
    scale_of_truth:    { draw(ctx, s, t) { drawScaleOfTruth(ctx, s, t); } },
    myth_labyrinth:    { draw(ctx, s, t) { drawMythLabyrinth(ctx, s, t); } },
    wooden_horse_trojan: { draw(ctx, s, t) { drawWoodenHorseTrojan(ctx, s, t); } },
    yamata_serpent:    { draw(ctx, s, t) { drawYamataSerpent(ctx, s, t); } },
    pandora_jar:       { draw(ctx, s, t) { drawPandoraJar(ctx, s, t); } },
    sun_barge:         { draw(ctx, s, t) { drawSunBarge(ctx, s, t); } },
    prometheus_torch:  { draw(ctx, s, t) { drawPrometheusTorch(ctx, s, t); } },
    icarus_wings:      { draw(ctx, s, t) { drawIcarusWings(ctx, s, t); } },
    golden_lyre:       { draw(ctx, s, t) { drawGoldenLyre(ctx, s, t); } },
    sisyphus_boulder:  { draw(ctx, s, t) { drawSisyphusBoulder(ctx, s, t); } },
    myth_dragon:       { draw(ctx, s, t) { drawMythDragon(ctx, s, t); } }
  };

  const MYTH_BACKGROUNDS = {
    olympus_clouds: {
      label: 'Đỉnh Olympus bồng bềnh mây',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawOlympusClouds(ctx, settings, t); }
    },
    asgard_bridge: {
      label: 'Cầu vồng Bifrost tới Asgard',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawAsgardBridge(ctx, settings, t); }
    },
    duat_river: {
      label: 'Dòng sông Duat cõi âm Ai Cập',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawDuatRiver(ctx, settings, t); }
    },
    takamagahara: {
      label: 'Cao Thiên Nguyên Takamagahara',
      theme: 'garden',
      ground_y: 810,
      draw(ctx, settings, t) { drawTakamagahara(ctx, settings, t); }
    },
    underworld_river: {
      label: 'Dòng sông Styx cõi âm Hy Lạp',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawUnderworldRiver(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: MYTH_RIGS,
    backgrounds: MYTH_BACKGROUNDS
  });

})();
