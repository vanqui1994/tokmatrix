// remake_vector_packs/mysteries.js — Giai đoạn U: Bí ẩn lịch sử và khảo cổ (mysteries)
// 5 rigs: moai_generic, standing_stones, sunken_ship, atlantis_ruins, excavation_grid
// 3 backgrounds: easter_island_generic, stone_circle_field, ruins_underwater (ground_y: 810, 7 weathers, day/night, ZERO text)

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

  // =============================================================
  // 1. MOAI GENERIC (Tượng đầu đá chung chung)
  // center: [0, -40], top: [0, -78], hitch: [0, -15], chin: [16, -22]
  // Base at y=0, Bounding box: x in [-26, 26], y in [-80, 0] >= -100
  // Strict §31: cartoon chung chung, không biểu tượng tôn giáo, không chữ
  // =============================================================
  function drawMoaiGeneric(ctx, s, t) {
    const stoneBase = '#78716c';
    const stoneDark = '#57534e';
    const stoneLight = '#a8a29e';

    ctx.save();
    ctx.translate(0, 0);

    // Monolithic basalt bust contour
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    // Left side / back of head
    ctx.lineTo(-20, -18);
    ctx.lineTo(-22, -45);
    ctx.lineTo(-18, -72);
    // Flat top head
    ctx.lineTo(-4, -78);
    ctx.lineTo(12, -76);
    // Brow ridge
    ctx.lineTo(16, -64);
    // Nose jutting out
    ctx.lineTo(14, -54);
    ctx.lineTo(24, -46);
    ctx.lineTo(14, -40);
    // Upper lip and chin jut
    ctx.lineTo(13, -32);
    ctx.lineTo(20, -22);
    ctx.lineTo(12, -14);
    // Neck to chest base
    ctx.lineTo(16, 0);
    ctx.closePath();
    ctx.fillStyle = stoneBase;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Deep-set eye socket shadow
    drawPoly(ctx, [[2, -62], [14, -62], [10, -55], [0, -55]], stoneDark, INK, 1.2);

    // Long angular nose ridge
    line(ctx, 4, -60, 22, -47, stoneLight, 1.8);
    line(ctx, 22, -47, 14, -42, stoneDark, 1.6);
    // Nostril plane
    drawPoly(ctx, [[14, -44], [18, -46], [14, -41]], stoneDark, null);

    // Firm horizontal mouth slit
    line(ctx, 4, -32, 16, -30, stoneDark, 2.0);

    // Jutting angular chin plane
    drawPoly(ctx, [[8, -26], [18, -22], [12, -16], [4, -18]], stoneLight, INK, 1.2);

    // Long stylized ear on side
    drawPoly(ctx, [[-12, -58], [-6, -56], [-8, -34], [-14, -36]], stoneDark, INK, 1.4);

    // Weathered basalt texture cracks
    line(ctx, -10, -68, -4, -62, stoneDark, 1.0);
    line(ctx, -14, -28, -6, -24, stoneDark, 1.0);
    line(ctx, 2, -14, 8, -4, stoneDark, 1.0);

    // Hitch anchor peg / rope notch at base for hauling
    ellipse(ctx, 0, -15, 3.5, 3.5, stoneDark, INK, 1.2);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 2. STANDING STONES (Vòng đá dựng cự thạch)
  // center: [0, -40], top: [0, -78], opening: [0, -35]
  // Base at y=0, Bounding box: x in [-38, 38], y in [-80, 0] >= -100
  // =============================================================
  function drawStandingStones(ctx, s, t) {
    const stoneBase = '#64748b';
    const stoneDark = '#475569';
    const stoneLight = '#94a3b8';

    ctx.save();
    ctx.translate(0, 0);

    // Base earth mound
    drawPoly(ctx, [[-40, 0], [-34, -6], [34, -6], [40, 0]], '#334155', INK, 1.6);

    // Left upright pillar (Cột đứng trái)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-32, -6);
    ctx.lineTo(-30, -64);
    ctx.lineTo(-18, -64);
    ctx.lineTo(-16, -6);
    ctx.closePath();
    ctx.fillStyle = stoneBase;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();
    // Shading on pillar
    line(ctx, -20, -62, -18, -8, stoneDark, 2.2);
    // Moss patches
    ellipse(ctx, -24, -22, 4, 6, '#4d7c0f', null);
    ellipse(ctx, -26, -42, 3, 5, '#4d7c0f', null);
    ctx.restore();

    // Right upright pillar (Cột đứng phải)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(16, -6);
    ctx.lineTo(18, -64);
    ctx.lineTo(30, -64);
    ctx.lineTo(32, -6);
    ctx.closePath();
    ctx.fillStyle = stoneBase;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();
    // Highlights & shading
    line(ctx, 20, -62, 18, -8, stoneLight, 1.8);
    ellipse(ctx, 24, -18, 4, 7, '#4d7c0f', null);
    ellipse(ctx, 22, -48, 3, 5, '#4d7c0f', null);
    ctx.restore();

    // Horizontal Lintel stone slab resting on top (Phiến đá ngang đặt lên đỉnh)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-36, -64);
    ctx.lineTo(-34, -76);
    ctx.lineTo(34, -76);
    ctx.lineTo(36, -64);
    ctx.closePath();
    ctx.fillStyle = stoneLight;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // Lintel shadow under
    line(ctx, -33, -65, 33, -65, stoneDark, 2.0);
    // Weathering cracks
    line(ctx, -12, -74, -8, -66, stoneDark, 1.0);
    line(ctx, 10, -75, 14, -68, stoneDark, 1.0);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 3. SUNKEN SHIP (Xác tàu gỗ chìm nghiêng cổ đại)
  // center: [0, -35], top: [0, -75]
  // Base at y=0, Bounding box: x in [-48, 48], y in [-76, 0] >= -100
  // Strict §31: ZERO skeletons, ZERO human remains
  // =============================================================
  function drawSunkenShip(ctx, s, t) {
    const woodBase = '#78350f';
    const woodDark = '#451a03';
    const woodPale = '#92400e';

    ctx.save();
    ctx.translate(0, 0);

    // Seabed sand mound half-burying the hull
    drawPoly(ctx, [[-50, 0], [-42, -12], [42, -12], [50, 0]], '#d97706', INK, 1.6);

    // Tilted ship hull
    ctx.save();
    ctx.rotate(-0.12);
    ctx.translate(0, -6);

    // Main hull contour
    ctx.beginPath();
    ctx.moveTo(-42, -14);
    ctx.quadraticCurveTo(-45, -28, -36, -34);
    ctx.lineTo(34, -30);
    ctx.quadraticCurveTo(46, -26, 44, -12);
    ctx.quadraticCurveTo(0, -2, -42, -14);
    ctx.closePath();
    ctx.fillStyle = woodBase;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Wooden planks (Các đường ván thuyền gỗ)
    line(ctx, -38, -26, 38, -24, woodDark, 1.6);
    line(ctx, -34, -20, 36, -18, woodDark, 1.6);
    line(ctx, -30, -14, 34, -12, woodDark, 1.6);

    // Broken wooden mast tilting
    ctx.save();
    ctx.translate(-8, -32);
    ctx.rotate(0.24);
    drawPoly(ctx, [[-3, 0], [-2, -38], [2, -38], [3, 0]], woodPale, INK, 1.6);
    // Broken jagged top of mast
    drawPoly(ctx, [[-2, -38], [0, -42], [1, -39], [2, -38]], woodPale, INK, 1.2);
    // Crossbeam yardarm
    drawPoly(ctx, [[-16, -26], [16, -24], [15, -22], [-15, -24]], woodDark, INK, 1.4);
    ctx.restore();

    // Seaweed draping over deck & mast (Rong rêu bám quanh mạn thuyền)
    function drawWeedDrape(wx, wy, h) {
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 4 + Math.sin((t || 0) * 2) * 3, wy + h * 0.5, wx, wy + h);
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    drawWeedDrape(-28, -32, 18);
    drawWeedDrape(-22, -33, 14);
    drawWeedDrape(18, -28, 16);
    drawWeedDrape(28, -27, 20);

    // Starfish & barnacles on hull (Sao biển & hà bám)
    ellipse(ctx, -14, -22, 3, 3, '#ea580c', INK, 1.0);
    ellipse(ctx, 8, -24, 2.5, 2.5, '#f1f5f9', INK, 0.8);
    ellipse(ctx, 14, -22, 2.0, 2.0, '#f1f5f9', INK, 0.8);

    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 4. ATLANTIS RUINS (Tàn tích cột đá Hy Lạp chìm dưới nước)
  // center: [0, -40], top: [0, -78]
  // Base at y=0, Bounding box: x in [-38, 38], y in [-80, 0] >= -100
  // =============================================================
  function drawAtlantisRuins(ctx, s, t) {
    const marbleBase = '#cbd5e1';
    const marbleDark = '#94a3b8';
    const marbleLight = '#f8fafc';

    ctx.save();
    ctx.translate(0, 0);

    // Classical stone stylobate steps at base
    drawPoly(ctx, [[-38, 0], [-36, -8], [36, -8], [38, 0]], marbleDark, INK, 1.8);
    drawPoly(ctx, [[-32, -8], [-30, -14], [30, -14], [32, -8]], marbleBase, INK, 1.6);

    // Left fluted column
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-24, -14);
    ctx.lineTo(-22, -64);
    ctx.lineTo(-12, -64);
    ctx.lineTo(-10, -14);
    ctx.closePath();
    ctx.fillStyle = marbleLight;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // Fluting grooves (Rãnh cột cổ điển)
    line(ctx, -19, -62, -18, -16, marbleDark, 1.2);
    line(ctx, -15, -62, -14, -16, marbleDark, 1.2);
    // Ionic capital scroll
    ellipse(ctx, -17, -66, 8, 3.5, marbleBase, INK, 1.4);
    ctx.restore();

    // Right broken column
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(10, -14);
    ctx.lineTo(12, -44);
    // Broken jagged top
    ctx.lineTo(16, -48);
    ctx.lineTo(20, -43);
    ctx.lineTo(24, -14);
    ctx.closePath();
    ctx.fillStyle = marbleBase;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    line(ctx, 15, -42, 15, -16, marbleDark, 1.2);
    line(ctx, 19, -42, 20, -16, marbleDark, 1.2);
    ctx.restore();

    // Fallen shattered column drum resting on steps
    ctx.save();
    ctx.translate(22, -18);
    ctx.rotate(0.35);
    drawPoly(ctx, [[-8, -6], [8, -6], [8, 6], [-8, 6]], marbleLight, INK, 1.6);
    ctx.restore();

    // Broken architrave / pediment slab across left column
    ctx.save();
    ctx.translate(-14, -70);
    ctx.rotate(-0.08);
    drawPoly(ctx, [[-18, -6], [16, -6], [14, 6], [-20, 6]], marbleLight, INK, 1.8);
    ctx.restore();

    // Aquatic moss & seaweed clinging to stones
    ellipse(ctx, -20, -28, 5, 8, '#0d9488', null);
    ellipse(ctx, 18, -24, 4, 7, '#0d9488', null);
    ellipse(ctx, 0, -11, 8, 4, '#0d9488', null);

    ctx.restore();
  }

  // =============================================================
  // 5. EXCAVATION GRID (Lưới dây đo đạc khảo cổ)
  // center: [0, -20], top: [0, -38]
  // Base at y=0, Bounding box: x in [-42, 42], y in [-40, 0] >= -100
  // =============================================================
  function drawExcavationGrid(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Trench pit ground
    drawPoly(ctx, [[-42, 0], [-38, -6], [38, -6], [42, 0]], '#78350f', INK, 1.4);

    // Wooden survey corner stakes
    const stakeX = [-36, -12, 12, 36];
    for (const sx of stakeX) {
      // Stake stick
      drawPoly(ctx, [[sx - 2, 0], [sx - 2, -32], [sx + 2, -32], [sx + 2, 0]], '#d97706', INK, 1.2);
      // Red/white survey marker bands on stake
      drawPoly(ctx, [[sx - 2, -26], [sx - 2, -30], [sx + 2, -30], [sx + 2, -26]], '#dc2626', null);
      drawPoly(ctx, [[sx - 2, -16], [sx - 2, -20], [sx + 2, -20], [sx + 2, -16]], '#dc2626', null);
    }

    // Taut white horizontal string grid lines (Dây tiêu chuẩn căng ngang)
    line(ctx, -36, -28, 36, -28, '#ffffff', 1.6);
    line(ctx, -36, -18, 36, -18, '#ffffff', 1.6);

    // Level bubble indicator on string
    ellipse(ctx, 0, -28, 6, 3, '#facc15', INK, 1.0);
    ellipse(ctx, 0, -28, 1.5, 1.5, '#ffffff', null);

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS
  // =============================================================

  // 1. EASTER ISLAND GENERIC (Đồi cỏ, biển xa, không chữ)
  function drawEasterIslandBg(ctx, settings, t) {
    ctx.save();
    const w = 576;
    const h = 1024;
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 480);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(1, '#1e293b');
    } else {
      skyGrad.addColorStop(0, '#0284c7');
      skyGrad.addColorStop(0.6, '#7dd3fc');
      skyGrad.addColorStop(1, '#fed7aa');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, 480);

    // Open Pacific Ocean horizon
    const seaGrad = ctx.createLinearGradient(0, 480, 0, 640);
    seaGrad.addColorStop(0, isNight ? '#0f172a' : '#0369a1');
    seaGrad.addColorStop(1, isNight ? '#1e293b' : '#0ea5e9');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 480, w, 160);

    // Distant volcanic caldera cone
    ctx.fillStyle = isNight ? '#1e293b' : '#65a30d';
    ctx.beginPath();
    ctx.moveTo(120, 640);
    ctx.lineTo(240, 520);
    ctx.lineTo(340, 535);
    ctx.lineTo(440, 640);
    ctx.closePath();
    ctx.fill();

    // Rolling green volcanic grassy hills
    const hillGrad = ctx.createLinearGradient(0, 600, 0, groundY);
    hillGrad.addColorStop(0, isNight ? '#064e3b' : '#84cc16');
    hillGrad.addColorStop(1, isNight ? '#022c22' : '#4d7c0f');
    ctx.fillStyle = hillGrad;
    ctx.beginPath();
    ctx.moveTo(0, 620);
    ctx.quadraticCurveTo(160, 580, 320, 630);
    ctx.quadraticCurveTo(460, 600, w, 635);
    ctx.lineTo(w, groundY);
    ctx.lineTo(0, groundY);
    ctx.closePath();
    ctx.fill();

    // Fore meadow (Cỏ xanh phía trước)
    const meadowGrad = ctx.createLinearGradient(0, groundY, 0, h);
    meadowGrad.addColorStop(0, isNight ? '#022c22' : '#65a30d');
    meadowGrad.addColorStop(1, isNight ? '#064e3b' : '#3f6212');
    ctx.fillStyle = meadowGrad;
    ctx.fillRect(0, groundY, w, h - groundY);

    // Wind blown grass tufts
    ctx.strokeStyle = isNight ? '#065f46' : '#a3e635';
    ctx.lineWidth = 1.4;
    for (let x = 30; x < w; x += 45) {
      const gy = groundY + 15 + ((x * 17) % 120);
      const sway = Math.sin((t || 0) * 3 + x) * 4;
      line(ctx, x, gy, x + sway - 3, gy - 12, null, 1.4);
      line(ctx, x + 4, gy, x + sway + 3, gy - 14, null, 1.4);
    }

    ctx.restore();
  }

  // 2. STONE CIRCLE FIELD (Cánh đồng cự thạch huyền bí)
  function drawStoneCircleFieldBg(ctx, settings, t) {
    ctx.save();
    const w = 576;
    const h = 1024;
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Moody atmospheric sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 520);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(0.7, '#1e1b4b');
      skyGrad.addColorStop(1, '#312e81');
    } else {
      skyGrad.addColorStop(0, '#475569');
      skyGrad.addColorStop(0.5, '#94a3b8');
      skyGrad.addColorStop(1, '#cbd5e1');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, 520);

    // Distant silhouette standing stones on horizon
    ctx.fillStyle = isNight ? '#0f172a' : '#64748b';
    ctx.fillRect(80, 520, 14, 30);
    ctx.fillRect(110, 525, 12, 25);
    ctx.fillRect(380, 518, 16, 32);
    ctx.fillRect(410, 522, 14, 28);

    // Rolling misty hills
    ctx.fillStyle = isNight ? '#14532d' : '#4d7c0f';
    ctx.beginPath();
    ctx.moveTo(0, 540);
    ctx.bezierCurveTo(140, 500, 340, 560, w, 530);
    ctx.lineTo(w, groundY);
    ctx.lineTo(0, groundY);
    ctx.closePath();
    ctx.fill();

    // Low ground mist (Sương mù là là mặt đất)
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(200, 560, 160, 20, 0, 0, TAU);
    ctx.ellipse(420, 570, 140, 18, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Foreground grassy soil
    const foreGrad = ctx.createLinearGradient(0, groundY, 0, h);
    foreGrad.addColorStop(0, isNight ? '#052e16' : '#3f6212');
    foreGrad.addColorStop(1, isNight ? '#022c22' : '#1a2e05');
    ctx.fillStyle = foreGrad;
    ctx.fillRect(0, groundY, w, h - groundY);

    ctx.restore();
  }

  // 3. RUINS UNDERWATER (Tàn tích đền thờ dưới đáy biển)
  function drawRuinsUnderwaterBg(ctx, settings, t) {
    ctx.save();
    const w = 576;
    const h = 1024;
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Deep aquamarine / cyan water gradient
    const waterGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      waterGrad.addColorStop(0, '#020617');
      waterGrad.addColorStop(0.6, '#0f172a');
      waterGrad.addColorStop(1, '#064e3b');
    } else {
      waterGrad.addColorStop(0, '#0284c7');
      waterGrad.addColorStop(0.5, '#0d9488');
      waterGrad.addColorStop(1, '#115e59');
    }
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, w, groundY);

    // Ancient sunken stone pavement floor (Nền đá cổ lát dưới đáy biển)
    const floorGrad = ctx.createLinearGradient(0, groundY, 0, h);
    floorGrad.addColorStop(0, isNight ? '#1e293b' : '#334155');
    floorGrad.addColorStop(1, isNight ? '#0f172a' : '#1e293b');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, groundY, w, h - groundY);

    // Paving slab stone grid lines
    ctx.strokeStyle = isNight ? '#334155' : '#475569';
    ctx.lineWidth = 1.6;
    for (let y = groundY + 20; y < h; y += 40) {
      line(ctx, 0, y, w, y, null, 1.6);
    }
    for (let x = 40; x < w; x += 80) {
      line(ctx, x, groundY, x, h, null, 1.6);
    }

    // Distant sunken pillars silhouettes
    ctx.save();
    ctx.fillStyle = isNight ? '#022c22' : '#042f2e';
    ctx.globalAlpha = 0.35;
    ctx.fillRect(60, groundY - 140, 22, 140);
    ctx.fillRect(160, groundY - 110, 20, 110);
    ctx.fillRect(380, groundY - 150, 24, 150);
    ctx.fillRect(480, groundY - 120, 20, 120);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION (RemakeVector.register)
  // =============================================================
  const MYSTERIES_RIGS = {
    sunken_ship: { draw(ctx, s, t) { drawSunkenShip(ctx, s, t); } },
    atlantis_ruins: { draw(ctx, s, t) { drawAtlantisRuins(ctx, s, t); } },
    excavation_grid: { draw(ctx, s, t) { drawExcavationGrid(ctx, s, t); } }
  };

  const MYSTERIES_BACKGROUNDS = {
    easter_island_generic: {
      label: 'Đồi cỏ đảo Phục Sinh chung chung',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawEasterIslandBg(ctx, settings, t); }
    },
    stone_circle_field: {
      label: 'Cánh đồng cự thạch Stonehenge',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawStoneCircleFieldBg(ctx, settings, t); }
    },
    ruins_underwater: {
      label: 'Tàn tích Atlantis dưới đáy biển',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawRuinsUnderwaterBg(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: MYSTERIES_RIGS,
    backgrounds: MYSTERIES_BACKGROUNDS
  });

})();
