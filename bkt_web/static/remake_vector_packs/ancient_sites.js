// remake_vector_packs/ancient_sites.js — Ancient Sites & Wonders (R6)
// 9 rigs: machu_picchu, angkor_temple, petra_facade, nazca_geoglyph, terracotta_warriors,
//         antikythera_mechanism, gobekli_pillar, underground_city, ancient_library_scroll
// 3 backgrounds: andes_terraces, jungle_temple, rock_canyon
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

  // Helpers for landscape extension (B4 standard)
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
  // 1. MACHU_PICCHU (Incan stone citadel and mountain terraces)
  // center: [0, -50], top: [0, -95], peak: [15, -92]
  // =============================================================
  function drawMachuPicchu(ctx, s, t) {
    ctx.save();
    // Backdrop mountain peak: Huayna Picchu towering behind
    drawPoly(ctx, [
      [-10, -35], [12, -94], [26, -92], [42, -50], [42, -20]
    ], '#334e38', INK, 1.4);
    // Ridge shadow facet
    drawPoly(ctx, [
      [12, -94], [26, -92], [42, -50], [22, -45]
    ], '#1e3324', null);

    // Distant Andean mist ribbon
    path(ctx, 'M -25 -52 Q 0 -60 25 -54 Q 40 -50 35 -44 Q 10 -48 -20 -44 Z', 'rgba(241, 245, 249, 0.65)', null);

    // Lower & upper agricultural stone terraces (stepped)
    const terraces = [
      { y: -12, h: 10, wL: -44, wR: 44, col: '#78716c', grass: '#4d7c0f' },
      { y: -24, h: 11, wL: -40, wR: 38, col: '#64748b', grass: '#5c9213' },
      { y: -36, h: 11, wL: -36, wR: 32, col: '#71717a', grass: '#65a30d' },
      { y: -48, h: 11, wL: -30, wR: 20, col: '#52525b', grass: '#4d7c0f' }
    ];
    for (const ter of terraces) {
      // Retaining stone wall
      drawPoly(ctx, [
        [ter.wL, ter.y], [ter.wR, ter.y],
        [ter.wR - 2, ter.y + ter.h], [ter.wL + 2, ter.y + ter.h]
      ], ter.col, INK, 1.2);
      // Stone masonry block seams
      for (let x = ter.wL + 6; x < ter.wR - 4; x += 10) {
        line(ctx, [[x, ter.y], [x + 1, ter.y + ter.h]], '#27272a', 0.8);
      }
      // Green grassy flat terrace surface
      path(ctx, `M ${ter.wL} ${ter.y} L ${ter.wR} ${ter.y} L ${ter.wR - 3} ${ter.y + 3} L ${ter.wL + 3} ${ter.y + 3} Z`, ter.grass, null);
    }

    // Classic Incan stone buildings with trapezoidal gables
    // Building 1 (main temple left)
    drawPoly(ctx, [
      [-28, -48], [-12, -48], [-12, -62], [-20, -74], [-28, -62]
    ], '#a8a29e', INK, 1.2);
    // Thatched golden roof
    drawPoly(ctx, [
      [-30, -61], [-20, -76], [-10, -61]
    ], '#d97706', INK, 1.2);
    // Trapezoidal Incan door
    drawPoly(ctx, [
      [-22, -48], [-18, -48], [-19, -58], [-21, -58]
    ], '#292524', null);

    // Building 2 (right chamber)
    drawPoly(ctx, [
      [-8, -36], [12, -36], [12, -50], [2, -60], [-8, -50]
    ], '#94a3b8', INK, 1.2);
    drawPoly(ctx, [
      [-10, -49], [2, -62], [14, -49]
    ], '#b45309', INK, 1.2);
    // Trapezoidal window
    drawPoly(ctx, [
      [-1, -42], [5, -42], [4, -48], [0, -48]
    ], '#1e293b', null);

    // Intihuatana sundial stone pedestal on upper terrace
    drawPoly(ctx, [
      [-6, -48], [4, -48], [2, -58], [-4, -58]
    ], '#78716c', INK, 1.0);
    drawPoly(ctx, [
      [-2, -58], [2, -58], [1, -66], [-1, -66]
    ], '#57534e', INK, 0.9);

    // Base stone foundation
    line(ctx, [[-45, 0], [45, 0]], INK, 1.6);
    ctx.restore();
  }

  // =============================================================
  // 2. ANGKOR_TEMPLE (Khmer sandstone sanctuary with lotus towers)
  // center: [0, -52], top: [0, -95]
  // =============================================================
  function drawAngkorTemple(ctx, s, t) {
    ctx.save();
    const stone = '#78716c';
    const stoneDark = '#44403c';
    const stoneLight = '#a8a29e';

    // Base platform: tiered sandstone terraces
    drawPoly(ctx, [
      [-42, 0], [42, 0], [38, -12], [-38, -12]
    ], stone, INK, 1.4);
    drawPoly(ctx, [
      [-36, -12], [36, -12], [32, -24], [-32, -24]
    ], stoneDark, INK, 1.4);

    // Grand central staircase and carved entry pavilion
    drawPoly(ctx, [
      [-10, 0], [10, 0], [8, -24], [-8, -24]
    ], stoneLight, INK, 1.2);
    for (let sy = -3; sy >= -21; sy -= 5) {
      line(ctx, [[-9, sy], [9, sy]], stoneDark, 1.0);
    }
    // Dark portal entrance
    drawPoly(ctx, [
      [-5, -12], [5, -12], [5, -24], [0, -28], [-5, -24]
    ], '#1c1917', null);

    // Left and right gallery wings with balustrade columns
    for (const [gx1, gx2] of [[-34, -14], [14, 34]]) {
      drawPoly(ctx, [
        [gx1, -24], [gx2, -24], [gx2, -38], [gx1, -38]
      ], stone, INK, 1.2);
      // Miniature pillars
      for (let px = gx1 + 4; px <= gx2 - 4; px += 5) {
        line(ctx, [[px, -24], [px, -36]], stoneDark, 1.6);
      }
      // Gallery cornice roof
      drawPoly(ctx, [
        [gx1 - 2, -38], [gx2 + 2, -38], [gx2 - 1, -44], [gx1 + 1, -44]
      ], stoneLight, INK, 1.0);
    }

    // Helper: draw tiered Khmer lotus-bud tower (prasat)
    function drawPrasat(cx, cyBase, wBase, hTotal, finialY) {
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const u = i / steps;
        const y0 = cyBase - u * hTotal;
        const y1 = cyBase - (i + 1) / steps * hTotal;
        const w0 = wBase * (1 - u * 0.45);
        const w1 = wBase * (1 - (i + 1) / steps * 0.45);
        drawPoly(ctx, [
          [cx - w0, y0], [cx + w0, y0],
          [cx + w1, y1], [cx - w1, y1]
        ], (i % 2 === 0) ? stone : stoneDark, INK, 1.0);
        // Stepped lotus petal reliefs
        ellipse(ctx, cx, y1, w1 * 0.8, 2.2, stoneLight, null);
      }
      // Lotus bud crown and needle finial
      ellipse(ctx, cx, cyBase - hTotal - 3, wBase * 0.35, 5, stoneLight, INK, 1.0);
      drawPoly(ctx, [
        [cx - 2, cyBase - hTotal - 3], [cx + 2, cyBase - hTotal - 3],
        [cx, finialY]
      ], stoneDark, INK, 1.0);
    }

    // Flanking towers (left & right)
    drawPrasat(-26, -38, 9, 26, -68);
    drawPrasat(26, -38, 9, 26, -68);

    // Intermediate towers
    drawPrasat(-13, -40, 8, 30, -74);
    drawPrasat(13, -40, 8, 30, -74);

    // Central Sanctuary Tower (towering above all)
    drawPoly(ctx, [
      [-14, -24], [14, -24], [12, -44], [-12, -44]
    ], stoneDark, INK, 1.2);
    drawPrasat(0, -44, 15, 46, -95);

    // Bas-relief decorative bands
    line(ctx, [[-30, -6], [30, -6]], '#292524', 1.0);
    ctx.restore();
  }

  // =============================================================
  // 3. PETRA_FACADE (Al-Khazneh Treasury carved into rose cliff)
  // center: [0, -54], top: [0, -95]
  // =============================================================
  function drawPetraFacade(ctx, s, t) {
    ctx.save();
    const rockWall = '#9a3412';
    const roseSand = '#ea580c';
    const sandstone = '#f97316';
    const highlight = '#fed7aa';
    const shadow = '#431407';

    // Natural canyon cliff framing left and right
    drawPoly(ctx, [
      [-44, 0], [-34, 0], [-32, -50], [-38, -94], [-44, -94]
    ], rockWall, INK, 1.4);
    drawPoly(ctx, [
      [34, 0], [44, 0], [44, -94], [38, -94], [32, -50]
    ], rockWall, INK, 1.4);

    // Recessed carved facade body
    drawPoly(ctx, [
      [-34, 0], [34, 0], [32, -90], [-32, -90]
    ], roseSand, INK, 1.2);

    // Lower Level: 6 classical Corinthian columns on plinths
    drawPoly(ctx, [
      [-32, 0], [32, 0], [31, -6], [-31, -6]
    ], shadow, INK, 1.0);
    const cols = [-27, -17, -7, 7, 17, 27];
    for (const cx of cols) {
      // Column shaft
      drawPoly(ctx, [
        [cx - 2.2, -6], [cx + 2.2, -6],
        [cx + 1.8, -44], [cx - 1.8, -44]
      ], sandstone, INK, 0.8);
      // Capital
      ellipse(ctx, cx, -45, 3.2, 2.0, highlight, INK, 0.8);
    }

    // Grand entrance portal in center
    drawPoly(ctx, [
      [-6, -6], [6, -6], [6, -34], [0, -38], [-6, -34]
    ], shadow, INK, 1.2);
    // Classical architrave & pediment above lower columns
    drawPoly(ctx, [
      [-32, -46], [32, -46], [30, -52], [-30, -52]
    ], sandstone, INK, 1.0);
    drawPoly(ctx, [
      [-28, -52], [28, -52], [0, -64]
    ], sandstone, INK, 1.2);
    // Inner pediment relief
    ellipse(ctx, 0, -56, 3, 3, highlight, null);

    // Upper Level: Tholos (round central temple) and broken pediment sides
    drawPoly(ctx, [
      [-30, -54], [-12, -54], [-12, -80], [-30, -68]
    ], roseSand, INK, 1.0);
    drawPoly(ctx, [
      [12, -54], [30, -54], [30, -68], [12, -80]
    ], roseSand, INK, 1.0);

    // Central circular Tholos pavilion with columns
    drawPoly(ctx, [
      [-9, -54], [9, -54], [8, -80], [-8, -80]
    ], sandstone, INK, 1.0);
    for (const tx of [-6, 0, 6]) {
      line(ctx, [[tx, -54], [tx, -78]], highlight, 1.4);
    }
    // Tholos conical dome roof
    drawPoly(ctx, [
      [-10, -80], [10, -80], [0, -91]
    ], sandstone, INK, 1.0);

    // Iconic giant funerary urn on top of the Tholos
    ellipse(ctx, 0, -92, 3.6, 3.2, highlight, INK, 1.0);
    drawPoly(ctx, [
      [-2, -92], [2, -92], [0, -95]
    ], highlight, INK, 0.8);

    // Weathering rock fissures
    path(ctx, 'M -33 -20 Q -30 -35 -34 -55', null, shadow, 1.0);
    path(ctx, 'M 33 -25 Q 31 -45 35 -65', null, shadow, 1.0);
    ctx.restore();
  }

  // =============================================================
  // 4. NAZCA_GEOGLYPH (Desert hummingbird line drawing from above)
  // center: [0, -50], top: [0, -94], beak: [0, -94]
  // =============================================================
  function drawNazcaGeoglyph(ctx, s, t) {
    ctx.save();
    // Desert soil background plate (red-brown weathered desert pavement)
    const desertPlate = [
      [-44, -8], [44, -8], [42, -92], [-42, -92]
    ];
    drawPoly(ctx, desertPlate, '#7c2d12', INK, 1.4);

    // Desert texture pebbles and gravel
    for (let i = 0; i < 12; i++) {
      const px = -35 + ((i * 17) % 70);
      const py = -85 + ((i * 13) % 72);
      ellipse(ctx, px, py, 2.2, 1.5, '#451a03', null);
    }

    // Excavated trench line color (light yellowish-white subsoil)
    const lineCol = '#fef08a';
    const trenchW = 2.4;

    // Ancient trapezoidal geometric survey runway lines in background
    ctx.save();
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.4)';
    ctx.lineWidth = 1.2;
    line(ctx, [[-40, -15], [38, -85]], 'rgba(254, 240, 138, 0.35)', 1.0);
    line(ctx, [[-35, -80], [40, -25]], 'rgba(254, 240, 138, 0.35)', 1.0);
    ctx.restore();

    // Hummingbird geoglyph: continuous ceremonial single line path!
    // Long straight needle beak reaching up to y=-94
    line(ctx, [[0, -68], [0, -94]], lineCol, trenchW);

    // Head and eye circle
    ellipse(ctx, 0, -65, 4.5, 4.0, null, lineCol, trenchW);
    ellipse(ctx, 0, -65, 1.2, 1.2, lineCol, null);

    // Neck and plump body
    drawPoly(ctx, [
      [-5, -61], [5, -61], [7, -42], [-7, -42]
    ], '#991b1b', lineCol, trenchW);

    // Left geometric wing with distinct feather fingers
    const wingL = [
      [-6, -56], [-22, -64], [-38, -68], [-42, -58],
      [-36, -54], [-40, -48], [-32, -46], [-36, -40],
      [-26, -42], [-6, -46]
    ];
    drawPoly(ctx, wingL, '#991b1b', lineCol, trenchW);

    // Right geometric wing
    const wingR = [
      [6, -56], [22, -64], [38, -68], [42, -58],
      [36, -54], [40, -48], [32, -46], [36, -40],
      [26, -42], [6, -46]
    ];
    drawPoly(ctx, wingR, '#991b1b', lineCol, trenchW);

    // Fanned tail with geometric rays down to y=-10
    const tailPts = [
      [-6, -42], [-18, -12], [-8, -10],
      [0, -14], [8, -10], [18, -12], [6, -42]
    ];
    drawPoly(ctx, tailPts, '#991b1b', lineCol, trenchW);
    line(ctx, [[0, -42], [0, -14]], lineCol, 1.8);
    line(ctx, [[-3, -42], [-9, -12]], lineCol, 1.6);
    line(ctx, [[3, -42], [9, -12]], lineCol, 1.6);

    ctx.restore();
  }

  // =============================================================
  // 5. TERRACOTTA_WARRIORS (Rank of 3 ancient terracotta clay soldiers)
  // center: [0, -50], top: [0, -88], head_c: [0, -82]
  // =============================================================
  function drawTerracottaWarriors(ctx, s, t) {
    ctx.save();
    const clay = '#a8a29e';
    const clayDark = '#57534e';
    const clayLight = '#d6d3d1';
    const bronze = '#78716c';

    // Helper: draw single terracotta warrior statue
    function drawWarrior(cx, scale, headY, isOfficer) {
      ctx.save();
      ctx.translate(cx, 0);
      ctx.scale(scale, scale);

      // Base plinth
      drawPoly(ctx, [
        [-12, 0], [12, 0], [10, -6], [-10, -6]
      ], clayDark, INK, 1.0);

      // Legs / greaves and square-toed boots
      drawPoly(ctx, [
        [-8, -6], [-2, -6], [-2, -26], [-8, -26]
      ], clay, INK, 1.0);
      drawPoly(ctx, [
        [2, -6], [8, -6], [8, -26], [2, -26]
      ], clay, INK, 1.0);

      // Tunic skirt and armored plate panels
      drawPoly(ctx, [
        [-11, -24], [11, -24], [13, -42], [-13, -42]
      ], clayDark, INK, 1.0);
      // Rectangular armor plates with bronze rivets
      for (let y = -28; y >= -38; y -= 5) {
        line(ctx, [[-10, y], [10, y]], '#292524', 0.8);
        for (let x = -8; x <= 8; x += 4) {
          ellipse(ctx, x, y - 2.5, 0.6, 0.6, clayLight, null);
        }
      }

      // Torso & chest armor cuirass
      drawPoly(ctx, [
        [-12, -42], [12, -42], [10, -64], [-10, -64]
      ], clay, INK, 1.2);
      // Crossed armor straps and neck scarf
      line(ctx, [[-9, -63], [9, -43]], clayDark, 1.2);
      line(ctx, [[9, -63], [-9, -43]], clayDark, 1.2);

      // Arms clasped in front / holding stance
      drawPoly(ctx, [
        [-11, -62], [-14, -46], [-6, -44], [-4, -58]
      ], clay, INK, 1.0);
      drawPoly(ctx, [
        [11, -62], [14, -46], [6, -44], [4, -58]
      ], clay, INK, 1.0);
      ellipse(ctx, 0, -45, 5, 4, clayLight, INK, 0.8);

      // Proud dignified head
      ellipse(ctx, 0, headY, 6.5, 8.0, clayLight, INK, 1.2);
      // Traditional topknot hair bun (offset right for classic Qin style)
      if (isOfficer) {
        // Officer pheasant-tail cap
        drawPoly(ctx, [
          [-5, headY - 8], [5, headY - 8], [3, headY - 15], [-3, headY - 15]
        ], bronze, INK, 1.0);
      } else {
        ellipse(ctx, 3, headY - 9, 3.2, 3.2, clayDark, INK, 1.0);
      }
      // Eyes, moustache, dignified mouth
      line(ctx, [[-4, headY - 1], [-1, headY - 1]], clayDark, 1.2);
      line(ctx, [[1, headY - 1], [4, headY - 1]], clayDark, 1.2);
      path(ctx, `M -3 ${headY + 3} Q 0 ${headY + 5} 3 ${headY + 3}`, null, clayDark, 1.2);

      ctx.restore();
    }

    // Left warrior (standing slightly behind)
    drawWarrior(-24, 0.88, -72, false);
    // Right warrior (standing slightly behind)
    drawWarrior(24, 0.88, -72, false);
    // Central officer (tallest, commanding rank)
    drawWarrior(0, 1.0, -78, true);

    ctx.restore();
  }

  // =============================================================
  // 6. ANTIKYTHERA_MECHANISM (Ancient Greek bronze gear computer)
  // center: [0, -50], top: [0, -94], dial: [0, -50]
  // =============================================================
  function drawAntikytheraMechanism(ctx, s, t) {
    ctx.save();
    const wood = '#451a03';
    const bronze = '#b45309';
    const brass = '#f59e0b';
    const verdigris = '#0d9488';
    const corroded = '#134e4a';

    // Wooden casing with corroded bronze corner brackets
    drawPoly(ctx, [
      [-36, -8], [36, -8], [34, -92], [-34, -92]
    ], wood, INK, 1.4);
    // Corner bronze mounting brackets
    for (const [bx, by] of [[-34, -10], [34, -10], [32, -90], [-32, -90]]) {
      drawPoly(ctx, [
        [bx - 4, by], [bx + 4, by], [bx + 4, by - 8], [bx - 4, by - 8]
      ], verdigris, INK, 1.0);
    }

    // Recessed circular astrological calendar dial plate
    const cx = 0, cy = -50;
    ellipse(ctx, cx, cy, 30, 30, corroded, INK, 1.4);
    ellipse(ctx, cx, cy, 27, 27, bronze, null);
    ellipse(ctx, cx, cy, 24, 24, '#1f2937', INK, 1.0);

    // Zodiac and calendar concentric circular tracks
    ellipse(ctx, cx, cy, 21, 21, null, verdigris, 1.0);
    ellipse(ctx, cx, cy, 14, 14, null, brass, 1.0);
    for (let a = 0; a < TAU; a += TAU / 12) {
      const x1 = cx + Math.cos(a) * 21;
      const y1 = cy + Math.sin(a) * 21;
      const x2 = cx + Math.cos(a) * 24;
      const y2 = cy + Math.sin(a) * 24;
      line(ctx, [[x1, y1], [x2, y2]], brass, 1.0);
    }

    // Interlocking precision bronze brass gearwheels!
    const rotSpeed = t * 0.4;
    function drawGear(gx, gy, r, teeth, rot, col) {
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(rot);
      // Central gear hub
      ellipse(ctx, 0, 0, r * 0.82, r * 0.82, col, INK, 1.0);
      // Triangular gear teeth around rim
      for (let i = 0; i < teeth; i++) {
        const ang = (i / teeth) * TAU;
        const tx = Math.cos(ang) * r;
        const ty = Math.sin(ang) * r;
        const tx2 = Math.cos(ang + TAU / (teeth * 2)) * (r + 2.5);
        const ty2 = Math.sin(ang + TAU / (teeth * 2)) * (r + 2.5);
        line(ctx, [[tx, ty], [tx2, ty2]], col, 1.8);
      }
      // Spoke cutouts
      for (let j = 0; j < 4; j++) {
        const sa = j * (TAU / 4);
        ellipse(ctx, Math.cos(sa) * r * 0.48, Math.sin(sa) * r * 0.48, r * 0.18, r * 0.18, '#111827', null);
      }
      ellipse(ctx, 0, 0, r * 0.22, r * 0.22, '#fef3c7', INK, 0.8);
      ctx.restore();
    }

    // Main 64-tooth Sun driving gear in center
    drawGear(cx, cy, 17, 24, rotSpeed, brass);
    // Epicyclic planetary gearing offset
    drawGear(cx - 10, cy - 8, 9, 14, -rotSpeed * 1.8, verdigris);
    drawGear(cx + 11, cy + 7, 8, 12, rotSpeed * 2.2, bronze);
    drawGear(cx - 8, cy + 11, 7, 10, -rotSpeed * 2.5, brass);

    // Celestial pointer needles (Sun and Moon spheres on pointers)
    const pAng1 = rotSpeed * 0.8;
    line(ctx, [[cx, cy], [cx + Math.cos(pAng1) * 22, cy + Math.sin(pAng1) * 22]], '#fef08a', 1.8);
    ellipse(ctx, cx + Math.cos(pAng1) * 22, cy + Math.sin(pAng1) * 22, 2.5, 2.5, '#f59e0b', INK, 0.8);

    const pAng2 = -rotSpeed * 1.2;
    line(ctx, [[cx, cy], [cx + Math.cos(pAng2) * 18, cy + Math.sin(pAng2) * 18]], '#e0e7ff', 1.6);
    ellipse(ctx, cx + Math.cos(pAng2) * 18, cy + Math.sin(pAng2) * 18, 2.0, 2.0, '#cbd5e1', INK, 0.6);

    // Turning crank handle on right side
    drawPoly(ctx, [
      [36, -52], [42, -52], [42, -48], [36, -48]
    ], bronze, INK, 1.0);
    drawPoly(ctx, [
      [40, -48], [44, -48], [44, -30], [40, -30]
    ], brass, INK, 1.0);
    ellipse(ctx, 42, -30, 2.5, 2.5, wood, INK, 0.8);

    ctx.restore();
  }

  // =============================================================
  // 7. GOBEKLI_PILLAR (Göbekli Tepe carved T-shaped megalith)
  // center: [0, -50], top: [0, -94], cap_l: [-32, -85], cap_r: [32, -85]
  // =============================================================
  function drawGobekliPillar(ctx, s, t) {
    ctx.save();
    const stone = '#d6d3d1';
    const stoneDark = '#78716c';
    const shadow = '#44403c';
    const reliefCol = '#57534e';

    // Massive carved megalithic socket stone base
    drawPoly(ctx, [
      [-36, 0], [36, 0], [30, -14], [-30, -14]
    ], stoneDark, INK, 1.4);
    ellipse(ctx, 0, -14, 28, 6, stone, INK, 1.2);

    // Vertical pillar shaft (representing stylized human torso)
    drawPoly(ctx, [
      [-16, -14], [16, -14], [14, -76], [-14, -76]
    ], stone, INK, 1.4);
    // Shadow side of shaft
    drawPoly(ctx, [
      [6, -14], [16, -14], [14, -76], [6, -76]
    ], stoneDark, null);

    // Massive horizontal T-capstone crossbeam
    drawPoly(ctx, [
      [-34, -76], [34, -76], [32, -94], [-32, -94]
    ], stone, INK, 1.4);
    // Capstone top flat facet
    drawPoly(ctx, [
      [-32, -94], [32, -94], [28, -96], [-28, -96]
    ], '#e7e5e4', INK, 1.0);
    // Underside shadow of capstone
    line(ctx, [[-33, -76], [33, -76]], shadow, 2.0);

    // Carved low-relief totems along shaft (Göbekli Tepe archaeology):
    // 1. Leaping wild fox silhouette in center relief
    const foxPts = [
      [-5, -45], [0, -49], [6, -47], [10, -42],
      [7, -39], [2, -43], [-3, -40]
    ];
    drawPoly(ctx, foxPts, reliefCol, null);
    // Fox tail
    path(ctx, 'M -5 -45 Q -10 -48 -11 -42', null, reliefCol, 1.8);

    // 2. Crane / vulture bird totem above fox
    path(ctx, 'M -6 -62 Q 0 -66 7 -60', null, reliefCol, 1.6);
    ellipse(ctx, 7, -60, 2.2, 1.8, reliefCol, null);
    line(ctx, [[0, -64], [-2, -56]], reliefCol, 1.4);

    // 3. Stylized human arms reaching around toward front
    // Left arm running down side
    line(ctx, [[-13, -68], [-13, -32]], reliefCol, 2.2);
    line(ctx, [[-13, -32], [-2, -26]], reliefCol, 2.2);
    // Right arm running down side
    line(ctx, [[13, -68], [13, -32]], reliefCol, 2.2);
    line(ctx, [[13, -32], [2, -26]], reliefCol, 2.2);

    // 4. Carved ceremonial belt and loincloth buckle at base
    drawPoly(ctx, [
      [-13, -22], [13, -22], [13, -27], [-13, -27]
    ], reliefCol, INK, 1.0);
    // H-shaped buckle motif
    line(ctx, [[-3, -22], [-3, -27]], '#292524', 1.4);
    line(ctx, [[3, -22], [3, -27]], '#292524', 1.4);
    line(ctx, [[-3, -24.5], [3, -24.5]], '#292524', 1.4);

    ctx.restore();
  }

  // =============================================================
  // 8. UNDERGROUND_CITY (Derinkuyu multi-level cutaway chambers)
  // center: [0, -50], top: [0, -94], stone_door: [-24, -26]
  // =============================================================
  function drawUndergroundCity(ctx, s, t) {
    ctx.save();
    const rock = '#78716c';
    const darkTuff = '#292524';
    const chamberFill = '#1c1917';
    const lightGlow = '#d97706';

    // Outer bedrock bounding cutaway block
    drawPoly(ctx, [
      [-42, 0], [42, 0], [42, -94], [-42, -94]
    ], rock, INK, 1.4);
    // Geological stratigraphy grain
    line(ctx, [[-40, -32], [40, -32]], darkTuff, 1.0);
    line(ctx, [[-40, -64], [40, -64]], darkTuff, 1.0);

    // Level 1: Upper living quarters & arched passage
    drawPoly(ctx, [
      [-36, -68], [-10, -68], [-10, -88], [-23, -92], [-36, -88]
    ], chamberFill, INK, 1.0);
    // Small oil lamp glowing
    ellipse(ctx, -23, -78, 3, 2, lightGlow, null);
    ellipse(ctx, -23, -80, 1.5, 2.5, '#fef08a', null);

    // Central ventilation air shaft descending through all floors
    drawPoly(ctx, [
      [22, -4], [30, -4], [30, -92], [22, -92]
    ], chamberFill, INK, 1.0);
    for (let vy = -12; vy >= -84; vy -= 10) {
      line(ctx, [[23, vy], [29, vy]], '#57534e', 1.0);
    }

    // Level 2: Middle storehouse, wine press & grain bins
    drawPoly(ctx, [
      [-14, -36], [16, -36], [16, -58], [-14, -58]
    ], chamberFill, INK, 1.0);
    // Clay storage amphoras in chamber
    for (const ax of [-8, 0, 8]) {
      drawPoly(ctx, [
        [ax - 3, -37], [ax + 3, -37], [ax + 4, -46], [ax - 4, -46]
      ], '#ea580c', INK, 0.8);
      ellipse(ctx, ax, -47, 2, 1, '#ea580c', null);
    }

    // Connecting stair tunnels between chambers
    drawPoly(ctx, [
      [-16, -58], [-8, -58], [-10, -68], [-18, -68]
    ], chamberFill, null);
    drawPoly(ctx, [
      [4, -36], [12, -36], [10, -18], [2, -18]
    ], chamberFill, null);

    // Level 3: Deep water cistern & refuge hall
    drawPoly(ctx, [
      [-36, -8], [16, -8], [16, -26], [-36, -26]
    ], chamberFill, INK, 1.0);
    // Water basin
    drawPoly(ctx, [
      [-10, -8], [12, -8], [12, -14], [-10, -14]
    ], '#0284c7', null);

    // Iconic giant rolling millstone security door (Derinkuyu rolling disc)
    // Rolled into tunnel socket to block invaders!
    ellipse(ctx, -24, -26, 12, 12, '#a8a29e', INK, 1.4);
    ellipse(ctx, -24, -26, 9, 9, '#78716c', null);
    // Center axle hole
    ellipse(ctx, -24, -26, 3, 3, '#1c1917', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // 9. ANCIENT_LIBRARY_SCROLL (Library of Alexandria scroll archive)
  // center: [0, -48], top: [0, -92], scroll_open: [0, -32]
  // =============================================================
  function drawAncientLibraryScroll(ctx, s, t) {
    ctx.save();
    const cedarWood = '#78350f';
    const darkWood = '#451a03';
    const papyrus = '#fef3c7';
    const agedPapyrus = '#fde68a';
    const bronze = '#b45309';

    // Carved wooden pigeonhole scroll rack cabinet
    drawPoly(ctx, [
      [-36, 0], [36, 0], [36, -88], [-36, -88]
    ], cedarWood, INK, 1.4);
    // Ornate cornice moulding on top
    drawPoly(ctx, [
      [-38, -88], [38, -88], [36, -92], [-36, -92]
    ], darkWood, INK, 1.0);

    // Shelving pigeonholes (6 niches)
    const niches = [
      [-32, -84, -4, -62], [4, -84, 32, -62],
      [-32, -58, -4, -38], [4, -58, 32, -38]
    ];
    for (const [x1, y1, x2, y2] of niches) {
      drawPoly(ctx, [
        [x1, y1], [x2, y1], [x2, y2], [x1, y2]
      ], darkWood, INK, 1.0);
      // Rolled papyrus scrolls stored inside niche
      for (let sy = y2 + 5; sy < y1 - 3; sy += 6) {
        // Scroll roll cylinder
        drawPoly(ctx, [
          [x1 + 3, sy], [x2 - 5, sy], [x2 - 5, sy + 4], [x1 + 3, sy + 4]
        ], papyrus, INK, 0.8);
        // Wooden scroll end knob (umbilicus)
        ellipse(ctx, x2 - 4, sy + 2, 2, 2, bronze, null);
        // Hanging papyrus index label tag (sillyboi)
        line(ctx, [[x1 + 10, sy + 4], [x1 + 12, sy + 10]], '#991b1b', 1.0);
        ellipse(ctx, x1 + 12, sy + 10, 2, 1.5, papyrus, INK, 0.6);
      }
    }

    // Lower reading plinth / table
    drawPoly(ctx, [
      [-36, 0], [36, 0], [34, -36], [-34, -36]
    ], cedarWood, INK, 1.2);

    // Main unrolled papyrus scroll laid open for study
    const sL = -28, sR = 28, sY = -28;
    // Curled left roll
    ellipse(ctx, sL, sY, 4, 12, agedPapyrus, INK, 1.0);
    // Curled right roll
    ellipse(ctx, sR, sY, 4, 12, agedPapyrus, INK, 1.0);
    // Unrolled sheet span
    drawPoly(ctx, [
      [sL, sY - 11], [sR, sY - 11], [sR, sY + 11], [sL, sY + 11]
    ], papyrus, INK, 1.0);

    // Ancient geometric diagrams and astronomical constellations on scroll
    // Triangle inscribed in circle (Euclid geometry)
    ellipse(ctx, -12, sY, 7, 7, null, '#1e293b', 1.0);
    drawPoly(ctx, [
      [-12, sY - 7], [-6, sY + 5], [-18, sY + 5]
    ], null, '#b91c1c', 1.0);

    // Constellation stars linked by lines (Alexandrian astronomy)
    const starPts = [
      [6, sY - 6], [14, sY - 8], [22, sY - 4], [16, sY + 4], [8, sY + 5]
    ];
    for (let i = 0; i < starPts.length - 1; i++) {
      line(ctx, [starPts[i], starPts[i + 1]], '#3b82f6', 0.8);
    }
    for (const [sx, sy] of starPts) {
      ellipse(ctx, sx, sy, 1.2, 1.2, '#b45309', null);
    }

    // Turned ivory/wood scroll weights keeping sheet flat
    ellipse(ctx, 0, sY - 9, 3, 2, bronze, INK, 0.6);
    ellipse(ctx, 0, sY + 9, 3, 2, bronze, INK, 0.6);

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS (3)
  // 1. andes_terraces
  // 2. jungle_temple
  // 3. rock_canyon
  // All ground_y: 810, 7 weathers, day/night, ZERO text.
  // =============================================================

  function drawAndesTerraces(ctx, settings, t) {
    ctx.save();
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // High Andean sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.6);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.6, '#1e1b4b');
      sky.addColorStop(1, '#312e81');
    } else {
      sky.addColorStop(0, '#0284c7');
      sky.addColorStop(0.5, '#38bdf8');
      sky.addColorStop(1, '#bae6fd');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    // Far backdrop: Snow-capped jagged Andean peaks
    const peakCol = isNight ? '#0f172a' : '#334155';
    const snowCol = isNight ? '#94a3b8' : '#f8fafc';
    drawPoly(ctx, [
      [X0, groundY * 0.55],
      [80, groundY * 0.22], [160, groundY * 0.45],
      [288, groundY * 0.18], [420, groundY * 0.42],
      [520, groundY * 0.25], [X1, groundY * 0.55]
    ], peakCol, null);

    // Snow caps on main peaks
    drawPoly(ctx, [[55, groundY * 0.27], [80, groundY * 0.22], [105, groundY * 0.28], [80, groundY * 0.32]], snowCol, null);
    drawPoly(ctx, [[258, groundY * 0.23], [288, groundY * 0.18], [320, groundY * 0.24], [288, groundY * 0.30]], snowCol, null);
    drawPoly(ctx, [[495, groundY * 0.30], [520, groundY * 0.25], [545, groundY * 0.31], [520, groundY * 0.35]], snowCol, null);

    // Landscape wings peaks
    scatterExt(ext, 280, 'andes_peak', (x, r, i) => {
      const py = groundY * (0.16 + r * 0.12);
      drawPoly(ctx, [[x - 120, groundY * 0.55], [x, py], [x + 120, groundY * 0.55]], peakCol, null);
      drawPoly(ctx, [[x - 30, py + 30], [x, py], [x + 30, py + 30], [x, py + 40]], snowCol, null);
    });

    // Drifting Andean cloud mist ribbons
    for (let my = groundY * 0.4; my <= groundY * 0.52; my += 35) {
      path(ctx, `M ${X0} ${my} Q 200 ${my - 20} 380 ${my + 10} Q 500 ${my - 15} ${X1} ${my}`, null, isNight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(255, 255, 255, 0.55)', 16);
    }

    // Midground cascading green mountain terraces
    const slopeBase = groundY - 120;
    const slopeCol = isNight ? '#064e3b' : '#15803d';
    const wallCol = isNight ? '#1e293b' : '#64748b';
    const grassTop = isNight ? '#047857' : '#22c55e';

    for (let ty = groundY * 0.52; ty <= slopeBase; ty += 40) {
      drawPoly(ctx, [
        [X0, ty + 25], [X1, ty + 25], [X1, ty], [X0, ty]
      ], wallCol, null);
      ctx.fillStyle = grassTop;
      ctx.fillRect(X0, ty, X1 - X0, 8);
    }

    // Forefront plateau ground: broad stone terrace (from slopeBase down to 1024)
    const terrGround = ctx.createLinearGradient(0, slopeBase, 0, 1024);
    terrGround.addColorStop(0, isNight ? '#1e293b' : '#4d7c0f');
    terrGround.addColorStop(0.3, isNight ? '#0f172a' : '#3f6212');
    terrGround.addColorStop(1, isNight ? '#020617' : '#1e3a8a');
    ctx.fillStyle = terrGround;
    ctx.fillRect(X0, slopeBase, X1 - X0, 1024 - slopeBase);

    // Stone paving blocks on foreground terrace
    for (let px = 30; px <= 540; px += 65) {
      ellipse(ctx, px, groundY + 40, 26, 12, isNight ? '#1e293b' : '#78716c', INK, 1.2);
    }
    tileExt(ext, 30, 65, 540, (x) => {
      ellipse(ctx, x, groundY + 40, 26, 12, isNight ? '#1e293b' : '#78716c', INK, 1.2);
    });

    // Incan carved boundary monoliths in landscape extension
    scatterExt(ext, 220, 'andes_monolith', (x, r, i) => {
      drawPoly(ctx, [
        [x - 16, groundY], [x + 16, groundY],
        [x + 12, groundY - 70 - r * 30], [x - 12, groundY - 70 - r * 30]
      ], isNight ? '#1e293b' : '#64748b', INK, 1.4);
      ellipse(ctx, x, groundY - 70 - r * 30, 10, 4, isNight ? '#334155' : '#94a3b8', null);
    });

    ctx.restore();
  }

  function drawJungleTemple(ctx, settings, t) {
    ctx.save();
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Tropical rainforest sky canopy
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.55);
    if (isNight) {
      sky.addColorStop(0, '#022c22');
      sky.addColorStop(0.7, '#064e3b');
      sky.addColorStop(1, '#065f46');
    } else {
      sky.addColorStop(0, '#047857');
      sky.addColorStop(0.6, '#10b981');
      sky.addColorStop(1, '#fef08a');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    // Ancient ruined temple towers silhouette in deep jungle
    const templeSilhouette = isNight ? '#022c22' : '#064e3b';
    drawPoly(ctx, [
      [100, groundY - 140], [140, groundY - 320], [180, groundY - 140]
    ], templeSilhouette, null);
    drawPoly(ctx, [
      [250, groundY - 140], [290, groundY - 380], [330, groundY - 140]
    ], templeSilhouette, null);
    drawPoly(ctx, [
      [400, groundY - 140], [440, groundY - 300], [480, groundY - 140]
    ], templeSilhouette, null);

    // Landscape wings temple ruins
    scatterExt(ext, 250, 'jungle_ruin', (x, r, i) => {
      const th = 260 + r * 100;
      drawPoly(ctx, [
        [x - 40, groundY - 140], [x, groundY - 140 - th], [x + 40, groundY - 140]
      ], templeSilhouette, null);
    });

    // Dense tropical tree canopy and giant banyan branches
    for (let cx = X0 - 50; cx <= X1 + 50; cx += 110) {
      ellipse(ctx, cx, groundY * 0.35, 75, 45, isNight ? '#064e3b' : '#047857', null);
      ellipse(ctx, cx + 45, groundY * 0.42, 60, 35, isNight ? '#022c22' : '#065f46', null);
    }

    // Midground carved stone gallery wall covered in moss and giant roots
    const wallY = groundY - 100;
    drawPoly(ctx, [
      [X0, wallY], [X1, wallY], [X1, groundY - 40], [X0, groundY - 40]
    ], isNight ? '#1c1917' : '#44403c', INK, 1.4);
    // Moss patches
    for (let mx = 40; mx <= 520; mx += 80) {
      ellipse(ctx, mx, wallY + 25, 25, 12, isNight ? '#064e3b' : '#15803d', null);
    }
    tileExt(ext, 40, 80, 520, (x) => {
      ellipse(ctx, x, wallY + 25, 25, 12, isNight ? '#064e3b' : '#15803d', null);
    });

    // Giant winding strangler fig / banyan roots crawling down wall
    path(ctx, `M 80 ${wallY - 30} Q 110 ${wallY + 20} 95 ${groundY}`, null, '#78350f', 8);
    path(ctx, `M 460 ${wallY - 30} Q 430 ${wallY + 20} 445 ${groundY}`, null, '#78350f', 9);
    scatterExt(ext, 200, 'banyan_root', (x, r, i) => {
      path(ctx, `M ${x} ${wallY - 40} Q ${x + 25 * (r - 0.5)} ${wallY + 30} ${x + 10} ${groundY}`, null, '#78350f', 8);
    });

    // Foreground stone temple courtyard (from groundY - 40 to 1024)
    const ground = ctx.createLinearGradient(0, groundY - 40, 0, 1024);
    ground.addColorStop(0, isNight ? '#1e293b' : '#57534e');
    ground.addColorStop(0.5, isNight ? '#0f172a' : '#292524');
    ground.addColorStop(1, isNight ? '#020617' : '#1c1917');
    ctx.fillStyle = ground;
    ctx.fillRect(X0, groundY - 40, X1 - X0, 1024 - (groundY - 40));

    // Cracked ancient flagstones and broad tropical ferns on ground
    for (let fx = 45; fx <= 530; fx += 75) {
      // Flagstone
      drawPoly(ctx, [
        [fx - 30, groundY + 35], [fx + 30, groundY + 35],
        [fx + 25, groundY + 70], [fx - 25, groundY + 70]
      ], isNight ? '#1c1917' : '#78716c', INK, 1.0);
      // Tropical fern clump
      for (let j = 0; j < 5; j++) {
        const fa = -Math.PI * 0.8 + j * Math.PI * 0.15;
        path(ctx, `M ${fx} ${groundY + 20} Q ${fx + Math.cos(fa) * 35} ${groundY + 20 + Math.sin(fa) * 25} ${fx + Math.cos(fa) * 50} ${groundY + 20 + Math.sin(fa) * 15}`, null, isNight ? '#064e3b' : '#16a34a', 3);
      }
    }
    tileExt(ext, 45, 75, 530, (x) => {
      drawPoly(ctx, [
        [x - 30, groundY + 35], [x + 30, groundY + 35],
        [x + 25, groundY + 70], [x - 25, groundY + 70]
      ], isNight ? '#1c1917' : '#78716c', INK, 1.0);
      for (let j = 0; j < 5; j++) {
        const fa = -Math.PI * 0.8 + j * Math.PI * 0.15;
        path(ctx, `M ${x} ${groundY + 20} Q ${x + Math.cos(fa) * 35} ${groundY + 20 + Math.sin(fa) * 25} ${x + Math.cos(fa) * 50} ${groundY + 20 + Math.sin(fa) * 15}`, null, isNight ? '#064e3b' : '#16a34a', 3);
      }
    });

    ctx.restore();
  }

  function drawRockCanyon(ctx, settings, t) {
    ctx.save();
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Narrow desert canyon sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.55);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(0.7, '#1e1b4b');
      sky.addColorStop(1, '#431407');
    } else {
      sky.addColorStop(0, '#0284c7');
      sky.addColorStop(0.6, '#38bdf8');
      sky.addColorStop(1, '#fed7aa');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    // Distant narrow canyon opening gorge (Siq)
    drawPoly(ctx, [
      [220, groundY * 0.55], [260, groundY * 0.3],
      [316, groundY * 0.3], [356, groundY * 0.55]
    ], isNight ? '#1e1b4b' : '#fdba74', null);

    // Towering sheer sandstone cliff walls (left & right)
    const cliffDark = isNight ? '#451a03' : '#9a3412';
    const cliffLight = isNight ? '#7c2d12' : '#ea580c';
    const cliffOchre = isNight ? '#292524' : '#c2410c';

    // Left massive canyon wall
    drawPoly(ctx, [
      [X0, groundY - 40], [220, groundY - 40],
      [200, groundY * 0.45], [170, groundY * 0.25],
      [80, 0], [X0, 0]
    ], cliffDark, INK, 1.6);

    // Right massive canyon wall
    drawPoly(ctx, [
      [356, groundY - 40], [X1, groundY - 40],
      [X1, 0], [496, 0],
      [406, groundY * 0.25], [376, groundY * 0.45]
    ], cliffLight, INK, 1.6);

    // Geological rock strata bands across canyon walls
    const strataY = [groundY * 0.15, groundY * 0.28, groundY * 0.42, groundY * 0.56, groundY * 0.70];
    for (const sy of strataY) {
      path(ctx, `M ${X0} ${sy} Q 100 ${sy + 20} 210 ${sy - 15}`, null, cliffOchre, 4.0);
      path(ctx, `M 365 ${sy - 10} Q 460 ${sy + 25} ${X1} ${sy}`, null, cliffDark, 4.0);
    }

    // Dry canyon riverbed floor (from groundY - 40 to 1024)
    const canyonFloor = ctx.createLinearGradient(0, groundY - 40, 0, 1024);
    canyonFloor.addColorStop(0, isNight ? '#451a03' : '#d97706');
    canyonFloor.addColorStop(0.5, isNight ? '#292524' : '#b45309');
    canyonFloor.addColorStop(1, isNight ? '#1c1917' : '#78350f');
    ctx.fillStyle = canyonFloor;
    ctx.fillRect(X0, groundY - 40, X1 - X0, 1024 - (groundY - 40));

    // Smooth weathered canyon boulders and gravel
    const boulders = [
      [80, groundY + 25, 24, 14],
      [170, groundY + 50, 32, 18],
      [288, groundY + 30, 20, 12],
      [390, groundY + 60, 36, 20],
      [500, groundY + 35, 28, 15]
    ];
    for (const [bx, by, bw, bh] of boulders) {
      ellipse(ctx, bx, by, bw, bh, isNight ? '#292524' : '#78350f', INK, 1.2);
      ellipse(ctx, bx - bw * 0.2, by - bh * 0.2, bw * 0.5, bh * 0.4, isNight ? '#57534e' : '#b45309', null);
    }
    scatterExt(ext, 130, 'canyon_rock', (x, r, i) => {
      const rw = 20 + r * 16, rh = 12 + r * 8, ry = groundY + 25 + r * 45;
      ellipse(ctx, x, ry, rw, rh, isNight ? '#292524' : '#78350f', INK, 1.2);
      ellipse(ctx, x - rw * 0.2, ry - rh * 0.2, rw * 0.5, rh * 0.4, isNight ? '#57534e' : '#b45309', null);
    });

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION (RemakeVector.register)
  // =============================================================
  const ANCIENT_SITES_RIGS = {
    machu_picchu: {
      draw(ctx, s, t) { drawMachuPicchu(ctx, s, t); }
    },
    angkor_temple: {
      draw(ctx, s, t) { drawAngkorTemple(ctx, s, t); }
    },
    petra_facade: {
      draw(ctx, s, t) { drawPetraFacade(ctx, s, t); }
    },
    nazca_geoglyph: {
      draw(ctx, s, t) { drawNazcaGeoglyph(ctx, s, t); }
    },
    terracotta_warriors: {
      draw(ctx, s, t) { drawTerracottaWarriors(ctx, s, t); }
    },
    antikythera_mechanism: {
      draw(ctx, s, t) { drawAntikytheraMechanism(ctx, s, t); }
    },
    gobekli_pillar: {
      draw(ctx, s, t) { drawGobekliPillar(ctx, s, t); }
    },
    underground_city: {
      draw(ctx, s, t) { drawUndergroundCity(ctx, s, t); }
    },
    ancient_library_scroll: {
      draw(ctx, s, t) { drawAncientLibraryScroll(ctx, s, t); }
    }
  };

  const ANCIENT_SITES_BACKGROUNDS = {
    andes_terraces: {
      label: 'Ruộng bậc thang dãy Andes hùng vĩ',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawAndesTerraces(ctx, settings, t); }
    },
    jungle_temple: {
      label: 'Đền cổ trong rừng rậm nhiệt đới',
      theme: 'farm',
      ground_y: 810,
      draw(ctx, settings, t) { drawJungleTemple(ctx, settings, t); }
    },
    rock_canyon: {
      label: 'Hẻm núi đá sa thạch đỏ',
      theme: 'farm',
      ground_y: 810,
      draw(ctx, settings, t) { drawRockCanyon(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: ANCIENT_SITES_RIGS,
    backgrounds: ANCIENT_SITES_BACKGROUNDS
  });

})();
