// remake_vector_packs/ocean.js — Giai đoạn U: Đại dương (ocean)
// 9 rigs: sea_turtle, jellyfish, octopus, whale, seal, coral, seaweed, anglerfish, plastic_bag
// 3 backgrounds: coral_reef, beach_cleanup, deep_sea (ground_y: 810, 7 weathers, day/night, ZERO text)

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
    mixColor,
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
  // 1. SEA TURTLE (Rùa biển)
  // center: [0, -32], top: [0, -52], head: [45, -35]
  // Bounding box: x in [-50, 55], y in [-56, 0] >= -100
  // =============================================================
  function drawSeaTurtle(ctx, s, t) {
    const swim = clamp(s.swim !== undefined ? s.swim : 1);
    const wave = Math.sin((t || 0) * 3) * 0.18 * swim;
    const flipperWave = Math.sin((t || 0) * 3.5) * 0.35 * swim;

    ctx.save();
    ctx.translate(0, -30);
    ctx.rotate(wave * 0.5);

    // Hind flipper far
    ctx.save();
    ctx.translate(-28, 12);
    ctx.rotate(-0.2 - wave);
    drawPoly(ctx, [[0, 0], [-18, 6], [-22, 14], [-6, 12]], '#0d9488', INK, 1.4);
    ctx.restore();

    // Foreflipper far
    ctx.save();
    ctx.translate(16, 8);
    ctx.rotate(-flipperWave - 0.3);
    drawPoly(ctx, [[0, 0], [12, 18], [4, 32], [-14, 24], [-6, 6]], '#0f766e', INK, 1.6);
    ctx.restore();

    // Carapace (Mai rùa biển thuôn dài dẹp)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 20, -0.05, 0, TAU);
    ctx.fillStyle = '#14b8a6';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Carapace scutes (hoa văn vảy mai đối xứng hình lục giác)
    const scuteColor = '#0f766e';
    drawPoly(ctx, [[-10, -6], [0, -10], [10, -6], [10, 6], [0, 10], [-10, 6]], scuteColor, '#0d9488', 1.2);
    drawPoly(ctx, [[10, -6], [22, -8], [28, 0], [22, 8], [10, 6]], null, '#0d9488', 1.2);
    drawPoly(ctx, [[-10, -6], [-22, -8], [-28, 0], [-22, 8], [-10, 6]], null, '#0d9488', 1.2);
    ctx.restore();

    // Neck and Head
    ctx.save();
    ctx.translate(34, -4);
    ctx.rotate(wave * 0.4);
    // Neck
    drawPoly(ctx, [[-8, -6], [6, -4], [6, 6], [-8, 8]], '#14b8a6', INK, 1.6);
    // Head oval
    ellipse(ctx, 10, -1, 14, 10, '#2dd4bf', INK, 1.8);
    // Beak
    drawPoly(ctx, [[18, -4], [25, 0], [18, 4]], '#14b8a6', INK, 1.4);
    // Eye
    ellipse(ctx, 12, -4, 3.2, 3.2, '#ffffff', null);
    ellipse(ctx, 13, -4, 1.8, 1.8, '#0f172a', null);
    ellipse(ctx, 14, -5, 0.7, 0.7, '#ffffff', null);
    ctx.restore();

    // Hind flipper near
    ctx.save();
    ctx.translate(-24, 14);
    ctx.rotate(0.3 + wave);
    drawPoly(ctx, [[0, 0], [-16, 8], [-20, 16], [-4, 14]], '#14b8a6', INK, 1.6);
    ctx.restore();

    // Foreflipper near (Chèo bơi lớn mặt trước)
    ctx.save();
    ctx.translate(18, 10);
    ctx.rotate(flipperWave + 0.2);
    drawPoly(ctx, [[0, 0], [16, 20], [8, 36], [-12, 28], [-4, 8]], '#2dd4bf', INK, 2.0);
    // Scute lines on flipper
    line(ctx, 4, 10, 2, 26, '#0f766e', 1.2);
    line(ctx, 9, 14, 7, 28, '#0f766e', 1.2);
    ctx.restore();

    // Little tail
    drawPoly(ctx, [[-34, 0], [-42, 2], [-35, 4]], '#0f766e', INK, 1.4);

    ctx.restore();
  }

  // =============================================================
  // 2. JELLYFISH (Sứa biển)
  // center: [0, -42], top: [0, -75]
  // Bounding box: x in [-32, 32], y in [-76, 0] >= -100
  // =============================================================
  function drawJellyfish(ctx, s, t) {
    const pulse = Math.sin((t || 0) * 2.6) * 0.08;
    const glow = clamp(s.glow !== undefined ? s.glow : 0.8);

    ctx.save();
    ctx.translate(0, -35);

    // Glowing aura behind
    if (glow > 0.1) {
      ctx.save();
      ctx.globalAlpha = 0.22 * glow;
      ellipse(ctx, 0, -18, 36 * (1 + pulse), 28 * (1 - pulse), '#38bdf8', null);
      ctx.restore();
    }

    // Trailing soft wavy tentacles (8 xúc tu lượn sóng theo t)
    const tentacleCount = 7;
    for (let i = 0; i < tentacleCount; i++) {
      const tx = (i - (tentacleCount - 1) / 2) * 6.5;
      const phase = i * 0.7;
      ctx.beginPath();
      ctx.moveTo(tx, -4);
      const cp1x = tx + Math.sin((t || 0) * 3 + phase) * 8;
      const cp1y = 12;
      const cp2x = tx - Math.sin((t || 0) * 3 + phase) * 9;
      const cp2y = 26;
      const endx = tx + Math.sin((t || 0) * 3.5 + phase) * 7;
      const endy = 35;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endx, endy);
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(168, 85, 247, 0.75)' : 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = i === 3 ? 2.6 : 1.8;
      ctx.stroke();
    }

    // Central oral arms (Rèm miệng bồng bềnh bên trong)
    ctx.save();
    ctx.fillStyle = 'rgba(232, 121, 249, 0.55)';
    ctx.beginPath();
    ctx.moveTo(-10, -5);
    ctx.quadraticCurveTo(-14 + Math.sin((t || 0) * 3) * 4, 14, -6, 25);
    ctx.quadraticCurveTo(0, 18, 0, -5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.quadraticCurveTo(14 + Math.sin((t || 0) * 3 + 1) * 4, 14, 6, 25);
    ctx.quadraticCurveTo(10, 18, 10, -5);
    ctx.fill();
    ctx.restore();

    // Translucent umbrella bell (Mũ nấm sứa)
    ctx.save();
    const bellW = 28 * (1 + pulse);
    const bellH = 22 * (1 - pulse);
    ctx.beginPath();
    ctx.arc(0, -12, bellW, Math.PI, 0, false);
    // Wavy scalloped rim at bottom
    ctx.bezierCurveTo(bellW * 0.6, -10, bellW * 0.4, -6, 0, -6);
    ctx.bezierCurveTo(-bellW * 0.4, -6, -bellW * 0.6, -10, -bellW, -12);
    ctx.closePath();

    // Radial gradient for bell
    const grad = ctx.createRadialGradient(0, -18, 4, 0, -12, bellW);
    grad.addColorStop(0, 'rgba(240, 171, 252, 0.85)');
    grad.addColorStop(0.6, 'rgba(192, 132, 252, 0.65)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.5)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(216, 180, 254, 0.9)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Internal bioluminescent radial lines
    for (let a = -0.7; a <= 0.71; a += 0.35) {
      const rx = Math.sin(a) * (bellW - 4);
      const ry = -12 - Math.cos(a) * (bellH - 4);
      line(ctx, 0, -14, rx, ry, 'rgba(255, 255, 255, 0.55)', 1.2);
    }
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 3. OCTOPUS (Bạch tuộc 8 xúc tu)
  // center: [0, -32], top: [0, -65]
  // Bounding box: x in [-42, 42], y in [-68, 0] >= -100
  // =============================================================
  function drawOctopus(ctx, s, t) {
    const wave = Math.sin((t || 0) * 2.8) * 0.08;
    const bodyBase = '#f43f5e';
    const bodyDark = tone(bodyBase, -0.22);
    const suctionColor = '#fecdd3';

    ctx.save();
    ctx.translate(0, -25);

    // 8 undulating tentacles (4 far, 4 near)
    const tentacleAngles = [-1.3, -0.9, -0.5, -0.15, 0.15, 0.5, 0.9, 1.3];

    // Far tentacles (4 tentacles)
    for (let i = 0; i < 4; i++) {
      const idx = i < 2 ? i : 7 - (i - 2);
      const angle = tentacleAngles[idx];
      const ph = idx * 0.8;
      ctx.save();
      ctx.translate(Math.sin(angle) * 10, 4);
      ctx.rotate(angle * 0.5 + Math.sin((t || 0) * 3 + ph) * 0.25);
      // Tentacle path
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const c1x = Math.sin(angle) * 18;
      const c1y = 12 + Math.sin((t || 0) * 3.2 + ph) * 4;
      const c2x = Math.sin(angle) * 28 + Math.cos(angle) * 8;
      const c2y = 20;
      ctx.quadraticCurveTo(c1x, c1y, c2x, c2y);
      ctx.strokeStyle = bodyDark;
      ctx.lineWidth = 5.2;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // Near tentacles (4 central/front tentacles with suction cups)
    for (let i = 2; i < 6; i++) {
      const angle = tentacleAngles[i];
      const ph = i * 0.85;
      ctx.save();
      ctx.translate(Math.sin(angle) * 12, 6);
      ctx.rotate(angle * 0.4 + Math.sin((t || 0) * 3.4 + ph) * 0.28);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      const c1x = Math.sin(angle) * 16;
      const c1y = 14;
      const c2x = Math.sin(angle) * 26 + (i % 2 === 0 ? -6 : 6);
      const c2y = 22;
      ctx.quadraticCurveTo(c1x, c1y, c2x, c2y);
      ctx.strokeStyle = bodyBase;
      ctx.lineWidth = 6.0;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Suction cups
      ellipse(ctx, c1x * 0.7, c1y * 0.7, 2.2, 2.2, suctionColor, INK, 0.8);
      ellipse(ctx, c2x * 0.8, c2y * 0.8, 1.8, 1.8, suctionColor, INK, 0.8);
      ctx.restore();
    }

    // Bulbous Head / Mantle
    ctx.save();
    ctx.translate(0, -12);
    ctx.rotate(wave * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, -12, 22, 26, 0, 0, TAU);
    ctx.fillStyle = bodyBase;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Cute skin spots
    ellipse(ctx, -8, -24, 3, 2, bodyDark, null);
    ellipse(ctx, 7, -22, 4, 2.5, bodyDark, null);
    ellipse(ctx, 0, -30, 3.5, 2, bodyDark, null);

    // Big intelligent cartoon eyes
    ellipse(ctx, -11, -4, 6.5, 7.5, '#ffffff', INK, 1.6);
    ellipse(ctx, 11, -4, 6.5, 7.5, '#ffffff', INK, 1.6);
    // Dark pupils with shine
    ellipse(ctx, -10, -4, 3.2, 4.0, '#0f172a', null);
    ellipse(ctx, 10, -4, 3.2, 4.0, '#0f172a', null);
    ellipse(ctx, -8.5, -6, 1.4, 1.4, '#ffffff', null);
    ellipse(ctx, 11.5, -6, 1.4, 1.4, '#ffffff', null);

    // Friendly little smile
    ctx.beginPath();
    ctx.arc(0, 4, 4.5, 0.2, Math.PI - 0.2, false);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 4. WHALE (Cá voi xanh khổng lồ có vòi phun spout)
  // center: [0, -35], blowhole: [15, -48], spout: 0..1
  // Base at y=0, whale height spans to y=-54, spout up to y=-88 >= -100
  // =============================================================
  function drawWhale(ctx, s, t) {
    const spout = clamp(s.spout !== undefined ? s.spout : 0);
    const swim = clamp(s.swim !== undefined ? s.swim : 1);
    const bodyWave = Math.sin((t || 0) * 2.2) * 0.05 * swim;
    const tailWave = Math.sin((t || 0) * 2.2 - 1.0) * 0.12 * swim;

    ctx.save();
    ctx.translate(0, -28);
    ctx.rotate(bodyWave);

    // Spout water fountain (Vòi phun nước từ lỗ thở)
    if (spout > 0.02) {
      ctx.save();
      ctx.translate(14, -20);
      const sprayH = 36 * spout;
      ctx.save();
      ctx.globalAlpha = 0.8 * spout;

      // Central water column
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.quadraticCurveTo(-4, -sprayH * 0.5, -12, -sprayH);
      ctx.quadraticCurveTo(-2, -sprayH * 0.8, 0, 0);
      ctx.quadraticCurveTo(2, -sprayH * 0.8, 12, -sprayH);
      ctx.quadraticCurveTo(4, -sprayH * 0.5, 2, 0);
      ctx.closePath();
      ctx.fillStyle = '#7dd3fc';
      ctx.fill();

      // Droplets arc
      for (let d = -2; d <= 2; d++) {
        const dx = d * 6 + Math.sin((t || 0) * 8 + d) * 3;
        const dy = -sprayH + Math.abs(d) * 4;
        ellipse(ctx, dx, dy, 2.4, 2.4, '#e0f2fe', '#38bdf8', 0.8);
      }
      ctx.restore();
      ctx.restore();
    }

    // Far pectoral fin
    ctx.save();
    ctx.translate(18, 4);
    ctx.rotate(0.3 + bodyWave);
    drawPoly(ctx, [[0, 0], [14, 18], [8, 22], [-6, 6]], '#0284c7', INK, 1.4);
    ctx.restore();

    // Tail stalk & Flukes
    ctx.save();
    ctx.translate(-42, 2);
    ctx.rotate(tailWave);
    // Tail stock
    drawPoly(ctx, [[12, -8], [-14, -2], [-14, 4], [12, 10]], '#0369a1', INK, 1.8);
    // Flukes (Đuôi cá voi hình bán nguyệt rộng)
    ctx.beginPath();
    ctx.moveTo(-14, 1);
    ctx.quadraticCurveTo(-22, -18, -32, -16);
    ctx.quadraticCurveTo(-24, 0, -18, 1);
    ctx.quadraticCurveTo(-24, 2, -32, 18);
    ctx.quadraticCurveTo(-22, 20, -14, 1);
    ctx.closePath();
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // Giant Body (Thân cá voi)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(48, -4);
    // Head curve
    ctx.bezierCurveTo(46, -18, 26, -22, 10, -22);
    // Back to tail
    ctx.bezierCurveTo(-14, -22, -32, -14, -45, 0);
    // Underbelly
    ctx.bezierCurveTo(-30, 18, 10, 22, 40, 12);
    ctx.bezierCurveTo(48, 8, 52, 2, 48, -4);
    ctx.closePath();
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Belly Pleated Grooves (Vạch bụng cá voi)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(38, 10);
    ctx.bezierCurveTo(12, 20, -20, 16, -34, 4);
    ctx.quadraticCurveTo(-10, 8, 38, 10);
    ctx.fillStyle = '#bae6fd';
    ctx.fill();
    // Pleat lines
    for (let p = 0; p < 4; p++) {
      const py = 6 + p * 3;
      line(ctx, -24 + p * 5, py, 32 - p * 3, py + 2, '#7dd3fc', 1.2);
    }
    ctx.restore();

    // Eye
    ellipse(ctx, 36, -6, 3.5, 3.5, '#ffffff', INK, 1.2);
    ellipse(ctx, 37, -6, 2.0, 2.0, '#0f172a', null);
    ellipse(ctx, 38, -7, 0.7, 0.7, '#ffffff', null);

    // Gentle smile
    ctx.beginPath();
    ctx.arc(38, 2, 8, 0.2, 0.9, false);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Blowhole
    ellipse(ctx, 14, -21, 3.5, 1.5, '#0369a1', INK, 1.0);

    // Near pectoral fin
    ctx.save();
    ctx.translate(12, 6);
    ctx.rotate(0.2 - bodyWave * 2);
    drawPoly(ctx, [[0, 0], [18, 22], [10, 28], [-8, 8]], '#38bdf8', INK, 2.0);
    ctx.restore();

    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 5. SEAL (Hải cẩu dễ thương)
  // center: [0, -25], head: [28, -35], top: [0, -48]
  // Bounding box: x in [-42, 42], y in [-48, 0] >= -100
  // =============================================================
  function drawSeal(ctx, s, t) {
    const wave = Math.sin((t || 0) * 2.5) * 0.06;
    const bodyBase = '#94a3b8';
    const bodyLight = '#cbd5e1';
    const bodyDark = tone(bodyBase, -0.25);

    ctx.save();
    ctx.translate(0, -22);
    ctx.rotate(wave);

    // Hind flippers (Chân chèo sau cụp lại như đuôi cá)
    ctx.save();
    ctx.translate(-30, 8);
    ctx.rotate(-0.15 + wave);
    drawPoly(ctx, [[0, -4], [-16, -6], [-18, 2], [-4, 6]], bodyDark, INK, 1.4);
    drawPoly(ctx, [[0, 0], [-14, 6], [-12, 14], [2, 6]], bodyBase, INK, 1.4);
    ctx.restore();

    // Far flipper
    ctx.save();
    ctx.translate(10, 10);
    ctx.rotate(0.2);
    drawPoly(ctx, [[0, 0], [12, 14], [4, 18], [-4, 4]], bodyDark, INK, 1.4);
    ctx.restore();

    // Plump curved body
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(26, -14);
    // Neck to head
    ctx.quadraticCurveTo(20, -24, 6, -22);
    // Back to tail
    ctx.bezierCurveTo(-14, -20, -28, -4, -32, 6);
    // Belly curve
    ctx.quadraticCurveTo(-15, 18, 12, 16);
    ctx.quadraticCurveTo(24, 14, 26, -14);
    ctx.closePath();
    ctx.fillStyle = bodyBase;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Pale chest/belly patch
    ctx.beginPath();
    ctx.ellipse(8, 6, 14, 8, 0.2, 0, TAU);
    ctx.fillStyle = bodyLight;
    ctx.fill();

    // Cute fur spots
    ellipse(ctx, -8, -8, 2, 1.5, bodyDark, null);
    ellipse(ctx, -14, -2, 2.5, 1.8, bodyDark, null);
    ellipse(ctx, 0, -12, 2, 1.4, bodyDark, null);
    ctx.restore();

    // Head
    ctx.save();
    ctx.translate(24, -14);
    // Round skull
    ellipse(ctx, 0, -4, 12, 10, bodyBase, INK, 1.8);
    // Snout / muzzle
    ellipse(ctx, 8, 0, 7, 5, bodyLight, INK, 1.4);
    // Dark nose
    ellipse(ctx, 12, -2, 2.5, 2.0, '#0f172a', null);

    // Big black glossy seal eyes
    ellipse(ctx, 2, -6, 4.0, 4.5, '#0f172a', null);
    ellipse(ctx, 3.5, -7.5, 1.5, 1.5, '#ffffff', null);

    // Whiskers
    line(ctx, 8, 1, 18, 2, '#475569', 1.0);
    line(ctx, 8, 3, 17, 6, '#475569', 1.0);
    line(ctx, 8, -1, 16, -3, '#475569', 1.0);
    ctx.restore();

    // Near flipper (Chân chèo trước)
    ctx.save();
    ctx.translate(14, 8);
    ctx.rotate(-0.1 + wave * 2);
    drawPoly(ctx, [[0, 0], [14, 12], [8, 18], [-4, 6]], bodyBase, INK, 1.8);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 6. CORAL (San hô rực rỡ với bleached: 0 -> 1)
  // center: [0, -38], top: [0, -75]
  // 0: saturated colors, 1: bleached off-white/pale
  // Bounding box: x in [-38, 38], y in [-76, 0] >= -100
  // =============================================================
  function drawCoral(ctx, s, t) {
    const bleached = clamp(s.bleached !== undefined ? s.bleached : 0);

    ctx.save();
    ctx.translate(0, 0);

    // Rocky coral base
    drawPoly(ctx, [[-36, 0], [-32, -14], [-12, -18], [14, -16], [34, -12], [38, 0]], '#64748b', INK, 1.8);

    // Coral colors interpolated by bleached parameter
    // Branch 1: Staghorn Pink/Orange -> bleached white
    const c1 = mixColor('#f43f5e', '#e2e8f0', bleached);
    const c1_dark = mixColor('#be123c', '#cbd5e1', bleached);

    // Branch 2: Purple/Turquoise -> bleached grey
    const c2 = mixColor('#a855f7', '#e2e8f0', bleached);
    const c2_dark = mixColor('#7e22ce', '#cbd5e1', bleached);

    // Branch 3: Yellow/Orange -> bleached beige
    const c3 = mixColor('#f59e0b', '#f1f5f9', bleached);
    const c3_dark = mixColor('#b45309', '#cbd5e1', bleached);

    function drawBranch(bx, by, w, h, ang, fill, stroke) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, 0);
      ctx.quadraticCurveTo(-w * 0.6, -h * 0.6, -w * 0.3, -h);
      ctx.quadraticCurveTo(0, -h - 4, w * 0.3, -h);
      ctx.quadraticCurveTo(w * 0.6, -h * 0.6, w * 0.5, 0);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Polyps / pores
      ellipse(ctx, 0, -h * 0.4, w * 0.25, w * 0.2, stroke, null);
      ellipse(ctx, 0, -h * 0.75, w * 0.25, w * 0.2, stroke, null);
      ctx.restore();
    }

    // Left fan coral cluster
    drawBranch(-24, -12, 10, 42, -0.35, c1, c1_dark);
    drawBranch(-14, -16, 9, 52, -0.18, c1, c1_dark);
    drawBranch(-28, -14, 7, 30, -0.55, c1, c1_dark);

    // Center tall staghorn cluster
    drawBranch(0, -18, 12, 58, 0.05, c2, c2_dark);
    drawBranch(-4, -40, 7, 24, -0.3, c2, c2_dark);
    drawBranch(6, -38, 7, 26, 0.35, c2, c2_dark);

    // Right brain/tubular coral cluster
    drawBranch(16, -16, 11, 46, 0.22, c3, c3_dark);
    drawBranch(26, -12, 9, 36, 0.42, c3, c3_dark);

    // Delicate sea fan mesh on side
    ctx.save();
    ctx.translate(22, -28);
    ctx.rotate(0.25);
    ctx.beginPath();
    ctx.ellipse(0, -10, 12, 16, 0, 0, TAU);
    ctx.fillStyle = mixColor('rgba(236, 72, 153, 0.4)', 'rgba(226, 232, 240, 0.3)', bleached);
    ctx.fill();
    ctx.strokeStyle = mixColor('#ec4899', '#cbd5e1', bleached);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 7. SEAWEED (Tảo biển lay động)
  // center: [0, -42], top: [0, -82]
  // Bounding box: x in [-25, 25], y in [-84, 0] >= -100
  // =============================================================
  function drawSeaweed(ctx, s, t) {
    const wave = Math.sin((t || 0) * 2.2);

    ctx.save();
    ctx.translate(0, 0);

    // Base holdfast
    drawPoly(ctx, [[-16, 0], [-10, -6], [10, -6], [16, 0]], '#334155', INK, 1.4);

    // Draw undulating kelp blade
    function drawKelpFrond(startX, h, phase, width, color) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startX, -4);
      let curX = startX;
      let curY = -4;
      const steps = 5;
      const stepH = h / steps;
      for (let i = 1; i <= steps; i++) {
        const nextY = -4 - i * stepH;
        const wX = startX + Math.sin((t || 0) * 2.4 + phase + i * 0.7) * (i * 3.5);
        ctx.quadraticCurveTo(curX + (wX - curX) * 0.5, (curY + nextY) * 0.5, wX, nextY);
        curX = wX;
        curY = nextY;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Gas bladder bulbs
      ellipse(ctx, startX + Math.sin((t || 0) * 2.4 + phase + 1.4) * 6, -h * 0.45, 3.5, 4.5, '#22c55e', INK, 1.0);
      ellipse(ctx, startX + Math.sin((t || 0) * 2.4 + phase + 2.8) * 10, -h * 0.75, 3.0, 4.0, '#22c55e', INK, 1.0);
      ctx.restore();
    }

    // 3 swaying fronds
    drawKelpFrond(-8, 64, 0.4, 5.0, '#15803d');
    drawKelpFrond(0, 78, 1.2, 6.0, '#16a34a');
    drawKelpFrond(8, 68, 2.0, 5.2, '#15803d');

    ctx.restore();
  }

  // =============================================================
  // 8. ANGLERFISH (Cá vây chân lồng đèn đáy biển)
  // center: [0, -32], esca: [32, -62], lit: 0..1
  // Bounding box: x in [-42, 42], y in [-68, 0] >= -100
  // =============================================================
  function drawAnglerfish(ctx, s, t) {
    const lit = clamp(s.lit !== undefined ? s.lit : 1);
    const bodyBase = '#334155';
    const bodyDark = '#1e293b';

    ctx.save();
    ctx.translate(0, -28);

    // Glowing esca lure (Đèn phát sáng ở đầu râu)
    const escaX = 28;
    const escaY = -32;

    if (lit > 0.05) {
      ctx.save();
      ctx.globalAlpha = 0.45 * lit;
      ellipse(ctx, escaX, escaY, 18 * lit, 18 * lit, '#38bdf8', null);
      ctx.globalAlpha = 0.7 * lit;
      ellipse(ctx, escaX, escaY, 9 * lit, 9 * lit, '#67e8f9', null);
      ctx.restore();
    }

    // Illicium stalk (Cần câu cong về phía trước)
    ctx.beginPath();
    ctx.moveTo(8, -16);
    ctx.bezierCurveTo(12, -34, 22, -36, escaX, escaY);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Esca bulb
    ellipse(ctx, escaX, escaY, 3.8, 3.8, lit > 0.5 ? '#e0f2fe' : '#94a3b8', INK, 1.2);

    // Tail fin
    ctx.save();
    ctx.translate(-32, 0);
    drawPoly(ctx, [[0, -4], [-14, -14], [-12, 0], [-14, 14], [0, 4]], bodyDark, INK, 1.4);
    ctx.restore();

    // Globular round deep-sea body
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 20, 0, 0, TAU);
    ctx.fillStyle = bodyBase;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Gaping toothy jaw
    ctx.beginPath();
    ctx.moveTo(10, 4);
    ctx.lineTo(24, 6);
    ctx.lineTo(16, 16);
    ctx.lineTo(6, 14);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Needle-sharp translucent teeth
    const teeth = [[12, 4, 14, 10], [16, 5, 18, 12], [20, 6, 21, 13], [12, 14, 13, 8], [17, 15, 18, 9]];
    for (const [x1, y1, x2, y2] of teeth) {
      line(ctx, x1, y1, x2, y2, '#f8fafc', 1.4);
    }

    // Milky deep-sea eye
    ellipse(ctx, 14, -8, 4.0, 4.0, '#94a3b8', INK, 1.2);
    ellipse(ctx, 14, -8, 2.0, 2.0, '#475569', null);

    // Spiky dorsal ridge
    for (let r = 0; r < 3; r++) {
      const rx = -12 + r * 8;
      drawPoly(ctx, [[rx - 2, -18], [rx, -24], [rx + 2, -18]], '#475569', INK, 1.0);
    }
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 9. PLASTIC BAG (Túi nilon trôi trong đại dương)
  // center: [0, -22], grip: [0, -22], top: [0, -42]
  // Bounding box: x in [-22, 22], y in [-44, 0] >= -100
  // =============================================================
  function drawPlasticBag(ctx, s, t) {
    const wave = Math.sin((t || 0) * 2.8) * 0.12;

    ctx.save();
    ctx.scale(1.6, 1.6);
    ctx.translate(0, -20);
    ctx.rotate(wave);

    // Translucent crinkled plastic bag
    ctx.save();
    ctx.globalAlpha = 0.72;

    // Bag main body
    ctx.beginPath();
    ctx.moveTo(-16, -8);
    // Crinkly side
    ctx.bezierCurveTo(-22, 2, -18, 14, -14, 18);
    ctx.bezierCurveTo(-4, 20, 6, 20, 14, 18);
    ctx.bezierCurveTo(18, 14, 22, 2, 16, -8);
    // Top opening
    ctx.bezierCurveTo(8, -6, -8, -6, -16, -8);
    ctx.closePath();
    ctx.fillStyle = '#f1f5f9';
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Handles loop
    ctx.beginPath();
    // Left handle
    ctx.moveTo(-15, -8);
    ctx.quadraticCurveTo(-16, -20, -10, -20);
    ctx.quadraticCurveTo(-6, -14, -6, -8);
    // Right handle
    ctx.moveTo(6, -8);
    ctx.quadraticCurveTo(6, -14, 10, -20);
    ctx.quadraticCurveTo(16, -20, 15, -8);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Crinkle creases
    line(ctx, -10, 0, 2, 8, 'rgba(148, 163, 184, 0.65)', 1.2);
    line(ctx, 4, -2, -6, 12, 'rgba(148, 163, 184, 0.65)', 1.2);
    line(ctx, -8, 6, 8, 14, 'rgba(148, 163, 184, 0.65)', 1.2);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================

  // Khổ ngang (B4): hai dải mở rộng [x0, 0) và [576, x1); khổ dọc trả về rỗng nên pixel dọc không đổi.
  function extRanges(x0, x1) {
    const out = [];
    if (x0 < 0) out.push([x0, 0]);
    if (x1 > 576) out.push([576, x1]);
    return out;
  }
  // Nối tiếp hoạ tiết lặp (start, step; vòng gốc dừng ở origEnd) sang hai dải mở rộng.
  function tileExt(ext, start, step, origEnd, fn) {
    for (const [a, b] of ext) {
      if (a < 0) { for (let x = start - step; x > a - step; x -= step) fn(x); }
      else { let x = start; while (x <= origEnd) x += step; for (; x < b + step; x += step) fn(x); }
    }
  }
  // Rải vật tất định trên dải mở rộng: bước step ± 30 %, seed theo toạ độ.
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

  // BACKGROUNDS
  // =============================================================

  // 1. CORAL REEF (Dưới nước, rạn san hô, tia nắng)
  function drawCoralReefBg(ctx, settings, t) {
    ctx.save();
    const w = 576;
    const h = 1024;
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Ocean depth gradient
    const waterGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      waterGrad.addColorStop(0, '#020617');
      waterGrad.addColorStop(0.5, '#0f172a');
      waterGrad.addColorStop(1, '#022c22');
    } else {
      waterGrad.addColorStop(0, '#38bdf8');
      waterGrad.addColorStop(0.3, '#0284c7');
      waterGrad.addColorStop(0.7, '#0f766e');
      waterGrad.addColorStop(1, '#115e59');
    }
    ctx.fillStyle = waterGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Sunbeams filtering from ocean surface (Tia nắng chiếu xiên qua nước)
    if (!isNight && settings.weather !== 'storm') {
      ctx.save();
      ctx.globalAlpha = 0.16;
      for (let i = 0; i < 5; i++) {
        const sx = 80 + i * 100;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + 80, 0);
        ctx.lineTo(sx + 160, groundY);
        ctx.lineTo(sx + 40, groundY);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      tileExt(ext, 80, 100, 480, (sx) => {
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + 80, 0); ctx.lineTo(sx + 160, groundY); ctx.lineTo(sx + 40, groundY); ctx.closePath();
        ctx.fillStyle = '#ffffff'; ctx.fill();
      });
      ctx.restore();
    }

    // Floating bubbles
    ctx.save();
    for (let b = 0; b < 12; b++) {
      const bx = (b * 47 + (t || 0) * 15) % w;
      const by = (b * 68 - (t || 0) * 35) % groundY;
      const actualY = by < 0 ? groundY + by : by;
      ctx.beginPath();
      ctx.arc(bx, actualY, 3 + (b % 4), 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // Distant coral reef silhouettes
    ctx.save();
    ctx.fillStyle = isNight ? '#064e3b' : '#042f2e';
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= w; x += 40) {
      const rh = 60 + Math.sin(x * 0.04) * 35;
      ctx.lineTo(x, groundY - rh);
    }
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();
    for (const [ea, eb] of ext) {
      ctx.beginPath();
      ctx.moveTo(ea, groundY);
      for (let x = ea; x <= eb; x += 40) ctx.lineTo(x, groundY - (60 + Math.sin(x * 0.04) * 35));
      ctx.lineTo(eb, groundY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Khổ ngang: bọt nước, san hô nhiều màu, đá và rong ở hai bên
    scatterExt(ext, 40, 'reef_bubble', (x, r, i) => {
      const by = ((r * groundY) - (t || 0) * 35 * (0.6 + r)) % groundY;
      ctx.beginPath(); ctx.arc(x + Math.sin((t || 0) + i) * 8, by < 0 ? groundY + by : by, 3 + (i % 4), 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 1; ctx.stroke();
    });
    scatterExt(ext, 110, 'reef_coral', (x, r, i) => {
      const cols = isNight ? ['#9d174d', '#6b21a8', '#9a3412', '#155e75'] : ['#f472b6', '#a855f7', '#fb923c', '#22d3ee', '#facc15'];
      const col = cols[(i + Math.floor(r * 5)) % cols.length];
      const k = Math.floor(RemakeVector.kit.seeded(`coralk:${Math.round(x)}`) * 4);
      ctx.save();
      if (k === 0) {
        for (const [dx, hh] of [[-14, 50], [0, 80], [14, 60]]) { ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, groundY); ctx.quadraticCurveTo(x + dx * 0.5, groundY - hh * 0.6, x + dx * 1.6, groundY - hh * (0.8 + r * 0.5)); ctx.stroke(); }
      } else if (k === 1) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, groundY - 22, 34 + r * 12, 26 + r * 8, 0, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2; for (let j = -2; j <= 2; j++) { ctx.beginPath(); ctx.arc(x, groundY - 10, 10 + Math.abs(j) * 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      } else if (k === 2) {
        ctx.strokeStyle = isNight ? '#065f46' : '#16a34a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        for (let j = 0; j < 3; j++) { const sw = Math.sin((t || 0) * 1.5 + j + r * 5) * 10; ctx.beginPath(); ctx.moveTo(x + j * 10 - 10, groundY); ctx.quadraticCurveTo(x + j * 10 - 10 + sw, groundY - 70, x + j * 10 - 10 - sw, groundY - 130 - r * 40); ctx.stroke(); }
      } else {
        ctx.fillStyle = isNight ? '#334155' : '#78716c'; ctx.beginPath(); ctx.ellipse(x, groundY - 10, 40 + r * 20, 22, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = col; for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(x - 20 + j * 20, groundY - 28 - (j % 2) * 8, 7, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    });

    // Seabed sand (Đáy cát vàng)
    const sandGrad = ctx.createLinearGradient(0, groundY, 0, h);
    sandGrad.addColorStop(0, isNight ? '#1e293b' : '#fef08a');
    sandGrad.addColorStop(0.2, isNight ? '#0f172a' : '#fde047');
    sandGrad.addColorStop(1, isNight ? '#020617' : '#ca8a04');
    ctx.fillStyle = sandGrad;
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    // Sand ripples
    ctx.strokeStyle = isNight ? '#334155' : '#eab308';
    ctx.lineWidth = 1.5;
    for (let y = groundY + 25; y < h; y += 45) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 50) {
        ctx.quadraticCurveTo(x + 25, y + Math.sin(x * 0.05) * 6, x + 50, y);
      }
      ctx.stroke();
      for (const [ea, eb] of ext) {
        ctx.beginPath();
        ctx.moveTo(ea, y);
        for (let x = ea; x < eb; x += 50) ctx.quadraticCurveTo(x + 25, y + Math.sin(x * 0.05) * 6, x + 50, y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // 2. BEACH CLEANUP (Bãi biển, sóng vỗ, cát vàng)
  function drawBeachCleanupBg(ctx, settings, t) {
    ctx.save();
    const w = 576;
    const h = 1024;
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 420);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(1, '#1e293b');
    } else {
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(0.7, '#bae6fd');
      skyGrad.addColorStop(1, '#fef08a');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(X0, 0, X1 - X0, 420);

    // Ocean horizon
    const seaGrad = ctx.createLinearGradient(0, 420, 0, 680);
    seaGrad.addColorStop(0, isNight ? '#0f172a' : '#0284c7');
    seaGrad.addColorStop(1, isNight ? '#022c22' : '#0d9488');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(X0, 420, X1 - X0, 260);
    // Khổ ngang: thuyền buồm xa, mũi đất và hải đăng nhỏ ở chân trời
    scatterExt(ext, 330, 'beach_far', (x, r, i) => {
      if (i % 2 === 0) {
        const bx = x + Math.sin((t || 0) * 0.3 + r * 6) * 10;
        ctx.fillStyle = isNight ? '#334155' : '#ffffff';
        ctx.beginPath(); ctx.moveTo(bx, 470); ctx.lineTo(bx, 430 - r * 15); ctx.lineTo(bx + 22, 470); ctx.closePath(); ctx.fill();
        ctx.fillStyle = isNight ? '#1e293b' : '#7c2d12'; ctx.fillRect(bx - 14, 470, 40, 7);
      } else {
        ctx.fillStyle = isNight ? '#14532d' : '#4d7c0f';
        ctx.beginPath(); ctx.moveTo(x - 110, 424); ctx.quadraticCurveTo(x - 20, 380 - r * 30, x + 90, 424); ctx.closePath(); ctx.fill();
        ctx.fillStyle = isNight ? '#e2e8f0' : '#f8fafc'; ctx.fillRect(x + 10, 372 - r * 30, 10, 34);
        ctx.fillStyle = '#ef4444'; ctx.fillRect(x + 10, 384 - r * 30, 10, 6);
        ctx.fillStyle = isNight ? '#fde047' : '#475569'; ctx.fillRect(x + 9, 364 - r * 30, 12, 8);
      }
    });

    // Gentle surf foam breaking
    const waveY = 660 + Math.sin((t || 0) * 1.8) * 15;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, waveY);
    for (let x = 0; x <= w; x += 60) {
      ctx.quadraticCurveTo(x + 30, waveY + 8, x + 60, waveY);
    }
    ctx.lineTo(w, groundY);
    ctx.lineTo(0, groundY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();
    for (const [ea, eb] of ext) {
      ctx.beginPath();
      ctx.moveTo(ea, waveY);
      for (let x = ea; x < eb; x += 60) ctx.quadraticCurveTo(x + 30, waveY + 8, x + 60, waveY);
      ctx.lineTo(eb, groundY); ctx.lineTo(ea, groundY); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Beach Sand (Bãi cát rộng)
    const sandGrad = ctx.createLinearGradient(0, 680, 0, h);
    sandGrad.addColorStop(0, isNight ? '#334155' : '#fef08a');
    sandGrad.addColorStop(0.4, isNight ? '#1e293b' : '#fde047');
    sandGrad.addColorStop(1, isNight ? '#0f172a' : '#eab308');
    ctx.fillStyle = sandGrad;
    ctx.fillRect(X0, 680, X1 - X0, h - 680);

    // Coastal dunes at back
    ctx.fillStyle = isNight ? '#1e293b' : '#ca8a04';
    ctx.beginPath();
    ctx.moveTo(0, 680);
    ctx.quadraticCurveTo(150, 640, 300, 670);
    ctx.quadraticCurveTo(450, 650, w, 680);
    ctx.lineTo(w, 710);
    ctx.lineTo(0, 710);
    ctx.closePath();
    ctx.fill();
    for (const [ea, eb] of ext) {
      ctx.beginPath(); ctx.moveTo(ea, 680);
      for (let x = ea; x < eb; x += 300) ctx.quadraticCurveTo(x + 150, 650 + RemakeVector.kit.seeded(`dune:${Math.round(x)}`) * 25, Math.min(eb, x + 300), 680);
      ctx.lineTo(eb, 710); ctx.lineTo(ea, 710); ctx.closePath(); ctx.fill();
    }
    // Khổ ngang: cây dừa, đá, vỏ sò, sao biển trên bãi cát
    scatterExt(ext, 190, 'beach', (x, r, i) => {
      const k = i % 3;
      if (k === 0) {
        ctx.strokeStyle = isNight ? '#44403c' : '#92400e'; ctx.lineWidth = 12; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, groundY - 10); ctx.quadraticCurveTo(x + 30, groundY - 160, x + 10 + r * 30, groundY - 300); ctx.stroke();
        ctx.strokeStyle = isNight ? '#14532d' : '#16a34a'; ctx.lineWidth = 9;
        const tx = x + 10 + r * 30, ty = groundY - 300;
        for (let j = 0; j < 5; j++) { const a = -Math.PI + j * Math.PI / 4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a) * 50, ty - 30, tx + Math.cos(a) * 90, ty + 20 + Math.abs(Math.sin(a)) * 10); ctx.stroke(); }
      } else if (k === 1) {
        ctx.fillStyle = isNight ? '#334155' : '#a8a29e'; ctx.beginPath(); ctx.ellipse(x, groundY - 8, 34 + r * 20, 20, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = isNight ? '#475569' : '#d6d3d1'; ctx.beginPath(); ctx.ellipse(x + 30, groundY - 4, 16, 10, 0, Math.PI, 0); ctx.fill();
      } else {
        ctx.fillStyle = '#fb923c';
        ctx.beginPath(); for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + j * Math.PI / 5, rr = j % 2 ? 6 : 14; ctx.lineTo(x + Math.cos(a) * rr, groundY + 40 + r * 60 + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fbcfe8'; ctx.beginPath(); ctx.ellipse(x + 50, groundY + 90 - r * 30, 10, 8, 0, Math.PI, 0); ctx.fill();
      }
    });

    ctx.restore();
  }

  // 3. DEEP SEA (Tối, hạt phù du marine snow)
  function drawDeepSeaBg(ctx, settings, t) {
    ctx.save();
    const w = 576;
    const h = 1024;
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;

    // Abyssal gradient
    const deepGrad = ctx.createLinearGradient(0, 0, 0, h);
    deepGrad.addColorStop(0, '#030712');
    deepGrad.addColorStop(0.4, '#0b1329');
    deepGrad.addColorStop(0.8, '#031726');
    deepGrad.addColorStop(1, '#020b14');
    ctx.fillStyle = deepGrad;
    ctx.fillRect(X0, 0, X1 - X0, h);

    // Drifting marine snow (Hạt phù du phát quang mờ)
    ctx.save();
    for (let i = 0; i < 35; i++) {
      const px = (i * 29 + Math.sin((t || 0) * 0.8 + i) * 15) % w;
      const py = (i * 37 + (t || 0) * 12) % h;
      const r = (i % 3) * 0.9 + 1.1;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, TAU);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(103, 232, 249, 0.45)' : 'rgba(255, 255, 255, 0.35)';
      ctx.fill();
    }
    scatterExt(ext, 30, 'snow', (x, r, i) => {
      ctx.beginPath();
      ctx.arc(x + Math.sin((t || 0) * 0.8 + i) * 15, (r * h + (t || 0) * 12) % h, (i % 3) * 0.9 + 1.1, 0, TAU);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(103, 232, 249, 0.45)' : 'rgba(255, 255, 255, 0.35)';
      ctx.fill();
    });
    ctx.restore();

    // Rocky trench floor
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(120, groundY - 18);
    ctx.lineTo(260, groundY + 12);
    ctx.lineTo(410, groundY - 24);
    ctx.lineTo(w, groundY);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    // Khổ ngang: đáy đá lởm chởm, ống khói thuỷ nhiệt toả bọt, giun ống phát sáng
    for (const [ea, eb] of ext) {
      ctx.beginPath(); ctx.moveTo(ea, h); ctx.lineTo(ea, groundY);
      for (let x = ea; x < eb; x += 140) ctx.lineTo(Math.min(eb, x + 140), groundY + (RemakeVector.kit.seeded(`trench:${Math.round(x)}`) - 0.6) * 44);
      ctx.lineTo(eb, h); ctx.closePath(); ctx.fill();
    }
    scatterExt(ext, 260, 'vent', (x, r, i) => {
      if (i % 2 === 0) {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath(); ctx.moveTo(x - 30, groundY + 6); ctx.lineTo(x - 12, groundY - 90 - r * 50); ctx.lineTo(x + 12, groundY - 90 - r * 50); ctx.lineTo(x + 30, groundY + 6); ctx.closePath(); ctx.fill();
        for (let j = 0; j < 4; j++) {
          const py = groundY - 100 - r * 50 - (((t || 0) * 30 + j * 30) % 120);
          ctx.beginPath(); ctx.arc(x + Math.sin((t || 0) * 2 + j) * 8, py, 6 + j * 2, 0, TAU);
          ctx.fillStyle = 'rgba(148, 163, 184, 0.18)'; ctx.fill();
        }
      } else {
        for (let j = 0; j < 4; j++) {
          const tx = x - 24 + j * 16, th = 40 + RemakeVector.kit.seeded(`tube:${Math.round(x)}:${j}`) * 40;
          ctx.fillStyle = '#e2e8f0'; ctx.fillRect(tx - 3, groundY - th, 6, th);
          ctx.beginPath(); ctx.arc(tx, groundY - th, 7, 0, TAU); ctx.fillStyle = 'rgba(244, 63, 94, 0.75)'; ctx.fill();
        }
      }
    });

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION (RemakeVector.register)
  // =============================================================
  const OCEAN_RIGS = {
    sea_turtle: { draw(ctx, s, t) { drawSeaTurtle(ctx, s, t); } },
    jellyfish: { draw(ctx, s, t) { drawJellyfish(ctx, s, t); } },
    octopus: { draw(ctx, s, t) { drawOctopus(ctx, s, t); } },
    whale: { draw(ctx, s, t) { drawWhale(ctx, s, t); } },
    seal: { draw(ctx, s, t) { drawSeal(ctx, s, t); } },
    coral: { draw(ctx, s, t) { drawCoral(ctx, s, t); } },
    seaweed: { draw(ctx, s, t) { drawSeaweed(ctx, s, t); } },
    anglerfish: { draw(ctx, s, t) { drawAnglerfish(ctx, s, t); } },
    plastic_bag: { draw(ctx, s, t) { drawPlasticBag(ctx, s, t); } }
  };

  const OCEAN_BACKGROUNDS = {
    coral_reef: {
      label: 'Rạn san hô dưới nước',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawCoralReefBg(ctx, settings, t); }
    },
    beach_cleanup: {
      label: 'Bãi biển dọn rác',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawBeachCleanupBg(ctx, settings, t); }
    },
    deep_sea: {
      label: 'Đáy đại dương sâu',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawDeepSeaBg(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: OCEAN_RIGS,
    backgrounds: OCEAN_BACKGROUNDS
  });

})();
