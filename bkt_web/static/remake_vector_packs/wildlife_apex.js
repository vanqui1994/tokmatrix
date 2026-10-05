// remake_vector_packs/wildlife_apex.js — Nhóm R2: Thú săn mồi đỉnh cao (wildlife_apex)
// 10 rigs: lion, tiger, jaguar, great_white_shark, killer_whale, polar_bear, rhino, peregrine_falcon, snowy_owl, komodo_dragon
// 3 backgrounds: savanna, arctic_ice, open_ocean_surface (ground_y: 810, 7 weathers, day/night, ZERO text)

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

  function drawAnimalEye(ctx, x, y, r, blink, pupilCol = '#0f172a', irisCol = '#f59e0b') {
    if (blink > 0.65) {
      path(ctx, `M ${x - r} ${y} Q ${x} ${y + r * 0.7} ${x + r} ${y}`, null, INK, 1.4);
      return;
    }
    const h = r * (1 - blink * 0.7);
    ellipse(ctx, x, y, r, h, '#ffffff', INK, 1.0);
    ellipse(ctx, x + 0.3 * r, y, r * 0.65, h * 0.65, irisCol, null);
    ellipse(ctx, x + 0.3 * r, y, r * 0.38, h * 0.38, pupilCol, null);
    ellipse(ctx, x + 0.1 * r, y - 0.2 * h, r * 0.22, h * 0.22, '#ffffff', null);
  }

  function drawQuadLeg(ctx, x, yTop, len, w, color, phase, walk) {
    const swing = Math.sin(phase) * 12 * walk;
    const lift = Math.max(0, -Math.cos(phase)) * 7 * walk;
    const footX = x + swing;
    const footY = -lift;
    const kneeX = x * 0.6 + footX * 0.4;
    const kneeY = yTop + len * 0.52 - lift * 0.3;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, yTop);
    ctx.quadraticCurveTo(kneeX - w * 0.45, kneeY, footX - w * 0.4, footY - 3);
    ctx.lineTo(footX + w * 0.4, footY - 3);
    ctx.quadraticCurveTo(kneeX + w * 0.45, kneeY, x + w * 0.5, yTop);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Bàn chân / móng đệm tròn
    ellipse(ctx, footX, footY - 2.5, w * 0.65, 3.5, color, INK, 1.1);
    for (let i = -1; i <= 1; i++) {
      line(ctx, footX + i * 2.5, footY - 2, footX + i * 3.5, footY, INK, 1.2);
    }
    ctx.restore();
  }

  // =============================================================
  // 1. LION (Sư tử, chúa tể thảo nguyên)
  // center: [0, -35], head: [28, -52], mane, proud posture
  // =============================================================
  function drawLion(ctx, s, t) {
    ctx.save();
    const walk = clamp(s.walk !== undefined ? s.walk : 0, 0, 1);
    const pace = (t || 0) * 4;
    const bob = Math.sin(pace * 2) * 2 * walk;
    const blink = Math.sin((t || 0) * 0.8) > 0.94 ? 1 : 0;

    const bodyCol = '#d97706';
    const bodyDark = '#b45309';
    const underCol = '#fef3c7';
    const maneCol = '#78350f';
    const maneLight = '#92400e';

    ctx.translate(0, bob);

    // Đuôi sư tử phe phẩy
    const tailWave = Math.sin((t || 0) * 2.5) * 0.2;
    ctx.save();
    ctx.translate(-36, -38);
    ctx.rotate(tailWave);
    path(ctx, 'M 0 0 Q -18 -8 -22 10 Q -24 22 -16 28', null, INK, 2.6);
    path(ctx, 'M 0 0 Q -18 -8 -22 10 Q -24 22 -16 28', null, bodyCol, 1.8);
    ellipse(ctx, -15, 30, 6, 7, maneCol, INK, 1.2);
    ctx.restore();

    // Chân xa
    drawQuadLeg(ctx, -26, -30, 30, 8, bodyDark, pace + Math.PI, walk);
    drawQuadLeg(ctx, 16, -30, 30, 8, bodyDark, pace, walk);

    // Thân sư tử
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-6, -34, 32, 17, 0.05, 0, TAU);
    ctx.fillStyle = bodyCol;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Bụng dưới sáng màu
    ctx.beginPath();
    ctx.ellipse(-4, -28, 22, 9, 0.04, 0, Math.PI);
    ctx.fillStyle = underCol;
    ctx.fill();
    ctx.restore();

    // Chân gần
    drawQuadLeg(ctx, -20, -32, 32, 9, bodyCol, pace, walk);
    drawQuadLeg(ctx, 22, -32, 32, 9, bodyCol, pace + Math.PI, walk);

    // Bờm sau
    ctx.save();
    ctx.translate(26, -50);
    for (let a = 0; a < TAU; a += TAU / 10) {
      const rx = Math.cos(a) * 22, ry = Math.sin(a) * 22;
      ellipse(ctx, rx, ry, 10, 10, maneCol, null);
    }
    ctx.restore();

    // Bờm trước & Đầu sư tử
    ctx.save();
    ctx.translate(26, -50);
    ellipse(ctx, 0, 0, 20, 20, maneLight, INK, 1.8);

    // Mặt sư tử
    ellipse(ctx, 6, 2, 13, 11, bodyCol, INK, 1.5);
    // Mõm
    ellipse(ctx, 13, 5, 8, 6, underCol, INK, 1.2);
    ellipse(ctx, 16, 2, 3.5, 2.5, '#1e293b', null);
    // Miệng hiền hòa
    path(ctx, 'M 14 6 Q 16 9 18 6', null, INK, 1.2);

    // Mắt
    drawAnimalEye(ctx, 8, -2, 3.2, blink, '#0f172a', '#fbbf24');

    // Tai tròn
    ellipse(ctx, -2, -14, 5, 5, bodyCol, INK, 1.3);
    ellipse(ctx, -2, -14, 2.8, 2.8, '#fef3c7', null);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 2. TIGER (Hổ, sọc vằn vương giả)
  // center: [0, -35], head: [30, -50], distinct tiger stripes
  // =============================================================
  function drawTiger(ctx, s, t) {
    ctx.save();
    const walk = clamp(s.walk !== undefined ? s.walk : 0, 0, 1);
    const pace = (t || 0) * 4;
    const bob = Math.sin(pace * 2) * 2 * walk;
    const blink = Math.sin((t || 0) * 0.9) > 0.94 ? 1 : 0;

    const tigerOrange = '#ea580c';
    const tigerDark = '#c2410c';
    const underWhite = '#fff7ed';

    ctx.translate(0, bob);

    // Đuôi hổ có sọc
    const tailWave = Math.sin((t || 0) * 2.8) * 0.22;
    ctx.save();
    ctx.translate(-36, -36);
    ctx.rotate(tailWave);
    path(ctx, 'M 0 0 Q -18 -10 -24 8 Q -26 22 -18 30', null, INK, 2.8);
    path(ctx, 'M 0 0 Q -18 -10 -24 8 Q -26 22 -18 30', null, tigerOrange, 2.0);
    // Vằn đuôi
    line(ctx, -10, -3, -7, -1, '#0f172a', 1.8);
    line(ctx, -19, 3, -15, 6, '#0f172a', 1.8);
    line(ctx, -24, 14, -20, 17, '#0f172a', 1.8);
    ellipse(ctx, -18, 30, 2.5, 3, '#0f172a', null);
    ctx.restore();

    // Chân xa
    drawQuadLeg(ctx, -26, -28, 28, 8.5, tigerDark, pace + Math.PI, walk);
    drawQuadLeg(ctx, 16, -28, 28, 8.5, tigerDark, pace, walk);

    // Thân hổ
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-4, -32, 33, 16, 0.04, 0, TAU);
    ctx.fillStyle = tigerOrange;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Bụng trắng
    ctx.beginPath();
    ctx.ellipse(-2, -26, 22, 8, 0.03, 0, Math.PI);
    ctx.fillStyle = underWhite;
    ctx.fill();

    // Sọc đen trên lưng thân hổ
    const stripes = [
      [[-24, -44], [-22, -32]],
      [[-16, -46], [-14, -30]],
      [[-8, -47], [-6, -31]],
      [[0, -47], [2, -30]],
      [[8, -46], [10, -31]],
      [[16, -44], [18, -32]]
    ];
    for (const [[x1, y1], [x2, y2]] of stripes) {
      path(ctx, `M ${x1} ${y1} Q ${(x1 + x2) * 0.5 + 2} ${(y1 + y2) * 0.5} ${x2} ${y2}`, null, '#0f172a', 2.0);
    }
    ctx.restore();

    // Chân gần
    drawQuadLeg(ctx, -20, -30, 30, 9, tigerOrange, pace, walk);
    drawQuadLeg(ctx, 22, -30, 30, 9, tigerOrange, pace + Math.PI, walk);

    // Cổ & Đầu hổ
    ctx.save();
    ctx.translate(28, -46);

    // Cổ
    path(ctx, 'M -8 10 L 6 -6 L 14 6 L 4 16 Z', tigerOrange, INK, 1.4);

    // Đầu
    ellipse(ctx, 6, -2, 15, 13, tigerOrange, INK, 1.8);
    // Má trắng phồng
    ellipse(ctx, 10, 4, 8, 7, underWhite, INK, 1.2);
    ellipse(ctx, 3, 5, 7, 6, underWhite, null);

    // Mũi đen hình tam giác
    drawPoly(ctx, [[14, 2], [18, 2], [16, 5]], '#0f172a', null);
    line(ctx, 16, 5, 16, 8, INK, 1.2);
    path(ctx, 'M 13 8 Q 16 10 19 8', null, INK, 1.2);

    // Vằn chữ Vương (王) trên trán hổ
    line(ctx, 3, -11, 9, -11, '#0f172a', 1.6);
    line(ctx, 4, -8, 8, -8, '#0f172a', 1.6);
    line(ctx, 6, -13, 6, -6, '#0f172a', 1.6);

    // Sọc bên má
    line(ctx, -1, 1, 3, 2, '#0f172a', 1.6);
    line(ctx, 0, 4, 4, 5, '#0f172a', 1.6);

    // Mắt hổ
    drawAnimalEye(ctx, 8, -4, 3.2, blink, '#0f172a', '#eab308');

    // Tai tròn có đốm trắng mặt sau
    ellipse(ctx, -2, -13, 5, 5, tigerOrange, INK, 1.2);
    ellipse(ctx, -2, -13, 2.5, 2.5, '#ffffff', null);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 3. JAGUAR (Báo đốm, cơ bắp rừng nhiệt đới)
  // center: [0, -32], head: [28, -46], rosettes pattern
  // =============================================================
  function drawJaguar(ctx, s, t) {
    ctx.save();
    const walk = clamp(s.walk !== undefined ? s.walk : 0, 0, 1);
    const pace = (t || 0) * 4.2;
    const bob = Math.sin(pace * 2) * 1.8 * walk;
    const blink = Math.sin((t || 0) * 0.85) > 0.94 ? 1 : 0;

    const jagGold = '#f59e0b';
    const jagDark = '#d97706';
    const jagCream = '#fef3c7';

    ctx.translate(0, bob);

    // Đuôi dài vằn đốm
    const tailWave = Math.sin((t || 0) * 2.6) * 0.25;
    ctx.save();
    ctx.translate(-36, -34);
    ctx.rotate(tailWave);
    path(ctx, 'M 0 0 Q -18 -8 -22 8 Q -24 22 -16 30', null, INK, 2.6);
    path(ctx, 'M 0 0 Q -18 -8 -22 8 Q -24 22 -16 30', null, jagGold, 1.8);
    ellipse(ctx, -12, 1, 1.8, 1.8, '#0f172a', null);
    ellipse(ctx, -21, 10, 1.8, 1.8, '#0f172a', null);
    ellipse(ctx, -17, 28, 2.4, 2.4, '#0f172a', null);
    ctx.restore();

    // Chân xa
    drawQuadLeg(ctx, -24, -26, 26, 8, jagDark, pace + Math.PI, walk);
    drawQuadLeg(ctx, 16, -26, 26, 8, jagDark, pace, walk);

    // Thân báo đốm
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-4, -30, 31, 15, 0.03, 0, TAU);
    ctx.fillStyle = jagGold;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Bụng sáng
    ctx.beginPath();
    ctx.ellipse(-2, -24, 20, 7, 0.03, 0, Math.PI);
    ctx.fillStyle = jagCream;
    ctx.fill();

    // Hoa văn đốm hoa mai (Rosettes: vòng tròn có chấm giữa)
    const rosettes = [
      [-20, -36], [-12, -40], [-4, -37], [6, -39], [14, -36],
      [-16, -28], [-6, -29], [4, -28], [12, -27]
    ];
    for (const [rx, ry] of rosettes) {
      ellipse(ctx, rx, ry, 3.5, 3.0, null, '#0f172a', 1.3);
      ellipse(ctx, rx, ry, 1.1, 1.0, '#0f172a', null);
    }
    ctx.restore();

    // Chân gần
    drawQuadLeg(ctx, -18, -28, 28, 8.5, jagGold, pace, walk);
    drawQuadLeg(ctx, 22, -28, 28, 8.5, jagGold, pace + Math.PI, walk);

    // Cổ & Đầu báo
    ctx.save();
    ctx.translate(26, -44);
    ellipse(ctx, 4, -1, 14, 12, jagGold, INK, 1.8);
    ellipse(ctx, 8, 4, 8, 6, jagCream, INK, 1.2);

    // Mũi & miệng
    drawPoly(ctx, [[12, 2], [16, 2], [14, 4.5]], '#0f172a', null);
    path(ctx, 'M 11 6 Q 14 8 17 6', null, INK, 1.1);

    // Đốm trên mặt
    ellipse(ctx, 1, -6, 1.2, 1.2, '#0f172a', null);
    ellipse(ctx, 4, -8, 1.2, 1.2, '#0f172a', null);
    ellipse(ctx, 1, 1, 1.2, 1.2, '#0f172a', null);

    // Mắt
    drawAnimalEye(ctx, 6, -3, 3.0, blink, '#0f172a', '#eab308');

    // Tai tròn
    ellipse(ctx, -2, -11, 4.5, 4.5, jagGold, INK, 1.2);
    ellipse(ctx, -2, -11, 2.2, 2.2, '#0f172a', null);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 4. GREAT WHITE SHARK (Cá mập trắng lớn, float: true)
  // center: [0, -36], head: [44, -36], iconic dorsal & tail fin
  // =============================================================
  function drawGreatWhiteShark(ctx, s, t) {
    ctx.save();
    const swim = clamp(s.swim !== undefined ? s.swim : 1);
    const wave = Math.sin((t || 0) * 3) * 0.14 * swim;
    const tailWave = Math.sin((t || 0) * 3.5) * 0.25 * swim;

    const sharkGrey = '#475569';
    const sharkWhite = '#f8fafc';

    ctx.translate(0, -34);
    ctx.rotate(wave * 0.3);

    // Đuôi cá mập (Caudal fin) hình lưỡi liềm
    ctx.save();
    ctx.translate(-42, 0);
    ctx.rotate(tailWave);
    drawPoly(ctx, [[0, 0], [-16, -26], [-10, 0], [-18, 22], [0, 4]], sharkGrey, INK, 1.6);
    ctx.restore();

    // Vây lưng (Dorsal fin) hình tam giác kinh điển
    drawPoly(ctx, [[-6, -14], [4, -34], [16, -12]], sharkGrey, INK, 1.8);

    // Vây bụng nhỏ & vây hậu môn
    drawPoly(ctx, [[-24, 8], [-32, 14], [-18, 10]], sharkGrey, INK, 1.2);

    // Thân cá mập hình thoi khí động học
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(48, -2); // Mũi nón nhọn
    ctx.bezierCurveTo(34, -20, 0, -22, -40, -2);
    ctx.bezierCurveTo(-20, 16, 16, 18, 48, -2);
    ctx.closePath();
    ctx.fillStyle = sharkGrey;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Bụng trắng (Countershading đặc trưng)
    ctx.beginPath();
    ctx.moveTo(46, -1);
    ctx.bezierCurveTo(32, 4, 10, 6, -38, 0);
    ctx.bezierCurveTo(-20, 15, 14, 16, 46, -1);
    ctx.closePath();
    ctx.fillStyle = sharkWhite;
    ctx.fill();

    // 5 khe mang (Gill slits)
    for (let i = 0; i < 5; i++) {
      const gx = 18 - i * 3.2;
      path(ctx, `M ${gx} -4 Q ${gx - 1} 3 ${gx} 10`, null, '#334155', 1.4);
    }

    // Mắt đen sẫm
    ellipse(ctx, 36, -7, 2.8, 2.8, '#0f172a', null);
    ellipse(ctx, 35.3, -7.8, 0.9, 0.9, '#ffffff', null);

    // Hàm răng sạch sẽ, nụ cười tinh tế (không máu!)
    path(ctx, 'M 42 3 Q 32 9 20 6', null, INK, 1.4);
    // Hàng răng trắng nhỏ xíu
    for (let rx = 38; rx > 24; rx -= 3.5) {
      drawPoly(ctx, [[rx, 4], [rx - 1.5, 7], [rx - 3, 4]], '#ffffff', null);
    }
    ctx.restore();

    // Vây ngực lớn (Pectoral fin) ở mặt gần
    ctx.save();
    ctx.translate(14, 4);
    ctx.rotate(0.3 + wave * 0.5);
    drawPoly(ctx, [[0, 0], [-10, 26], [6, 28], [12, 6]], sharkGrey, INK, 1.6);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 5. KILLER WHALE / ORCA (Cá voi sát thủ, float: true)
  // center: [0, -36], head: [46, -36], stark black-and-white
  // =============================================================
  function drawKillerWhale(ctx, s, t) {
    ctx.save();
    const swim = clamp(s.swim !== undefined ? s.swim : 1);
    const wave = Math.sin((t || 0) * 2.8) * 0.12 * swim;
    const tailWave = Math.sin((t || 0) * 3.2) * 0.22 * swim;

    const orcaBlack = '#0f172a';
    const orcaWhite = '#f8fafc';
    const orcaSaddle = '#475569';

    ctx.translate(0, -34);
    ctx.rotate(wave * 0.25);

    // Đuôi vây ngang (Fluke)
    ctx.save();
    ctx.translate(-44, 0);
    ctx.rotate(tailWave);
    drawPoly(ctx, [[0, 0], [-14, -20], [-8, 0], [-14, 20], [0, 2]], orcaBlack, INK, 1.6);
    ctx.restore();

    // Vây lưng cao thẳng đứng đặc trưng của Orca
    drawPoly(ctx, [[-6, -14], [2, -38], [12, -12]], orcaBlack, INK, 1.8);

    // Đốm yên cương xám sau vây lưng (Saddle patch)
    ellipse(ctx, -10, -10, 10, 5, orcaSaddle, null);

    // Thân đen bóng
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(48, -2);
    ctx.bezierCurveTo(36, -20, 2, -22, -42, -2);
    ctx.bezierCurveTo(-22, 18, 18, 20, 48, -2);
    ctx.closePath();
    ctx.fillStyle = orcaBlack;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Bụng trắng và vệt trắng bên hông
    ctx.beginPath();
    ctx.moveTo(46, 2);
    ctx.bezierCurveTo(34, 10, 16, 12, -4, 10);
    ctx.bezierCurveTo(-14, 14, -24, 6, -30, 10);
    ctx.bezierCurveTo(-20, 18, 14, 18, 46, 2);
    ctx.closePath();
    ctx.fillStyle = orcaWhite;
    ctx.fill();

    // Đốm mắt trắng hình bầu dục (Eye patch) đặc trưng
    ctx.save();
    ctx.translate(32, -8);
    ctx.rotate(-0.1);
    ellipse(ctx, 0, 0, 7.5, 4.0, orcaWhite, null);
    ctx.restore();

    // Mắt thật nằm ngay trước đốm trắng
    ellipse(ctx, 39, -5, 2.2, 2.2, '#1e293b', null);
    ellipse(ctx, 38.5, -5.6, 0.7, 0.7, '#ffffff', null);

    // Nụ cười thân thiện
    path(ctx, 'M 44 2 Q 38 6 30 5', null, '#ffffff', 1.2);

    // Lỗ thở (Blowhole) trên đỉnh đầu
    ellipse(ctx, 22, -18, 2.5, 1.2, '#334155', null);
    ctx.restore();

    // Vây ngực tròn hình mái chèo (Paddle-shaped pectoral flipper)
    ctx.save();
    ctx.translate(16, 4);
    ctx.rotate(0.25 + wave * 0.4);
    ellipse(ctx, -2, 14, 7, 13, orcaBlack, INK, 1.6);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 6. POLAR BEAR (Gấu Bắc Cực, khổng lồ băng tuyết)
  // center: [0, -36], head: [36, -56], cream-white thick fur
  // =============================================================
  function drawPolarBear(ctx, s, t) {
    ctx.save();
    const walk = clamp(s.walk !== undefined ? s.walk : 0, 0, 1);
    const pace = (t || 0) * 3.5;
    const bob = Math.sin(pace * 2) * 2.2 * walk;
    const blink = Math.sin((t || 0) * 0.8) > 0.94 ? 1 : 0;

    const bearFur = '#f1f5f9';
    const bearShadow = '#cbd5e1';
    const bearDark = '#94a3b8';

    ctx.translate(0, bob);

    // Đuôi cụt ngắn
    ellipse(ctx, -38, -42, 4, 4, bearFur, INK, 1.2);

    // Chân xa
    drawQuadLeg(ctx, -24, -30, 30, 10, bearDark, pace + Math.PI, walk);
    drawQuadLeg(ctx, 18, -30, 30, 10, bearDark, pace, walk);

    // Thân gấu Bắc Cực to đồ sộ
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-6, -38, 34, 20, 0.04, 0, TAU);
    ctx.fillStyle = bearFur;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Khối bóng cơ bắp vai và hông
    ctx.beginPath();
    ctx.ellipse(-14, -32, 22, 11, 0.05, 0, Math.PI);
    ctx.fillStyle = bearShadow;
    ctx.fill();
    ctx.restore();

    // Chân gần (Bàn chân to chống trượt trên băng)
    drawQuadLeg(ctx, -18, -32, 32, 11, bearFur, pace, walk);
    drawQuadLeg(ctx, 24, -32, 32, 11, bearFur, pace + Math.PI, walk);

    // Cổ dài & Đầu gấu
    ctx.save();
    ctx.translate(32, -52);

    // Cổ dày
    path(ctx, 'M -12 18 L 4 -2 L 14 12 L 2 24 Z', bearFur, INK, 1.6);

    // Đầu thuôn hình nón
    ctx.beginPath();
    ctx.moveTo(18, 4); // Mũi
    ctx.bezierCurveTo(14, -6, 2, -10, -6, -4);
    ctx.bezierCurveTo(-10, 8, 4, 16, 18, 4);
    ctx.closePath();
    ctx.fillStyle = bearFur;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Mũi đen tuyền nổi bật
    ellipse(ctx, 16, 3, 3.5, 2.8, '#0f172a', null);
    line(ctx, 16, 5, 16, 8, INK, 1.2);
    path(ctx, 'M 13 8 Q 16 10 19 8', null, INK, 1.2);

    // Mắt đen tròn
    drawAnimalEye(ctx, 6, -2, 2.8, blink, '#0f172a', '#334155');

    // Tai tròn nhỏ (thích nghi chống rét)
    ellipse(ctx, -4, -8, 3.5, 3.5, bearFur, INK, 1.3);
    ellipse(ctx, -4, -8, 1.8, 1.8, '#94a3b8', null);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 7. RHINO (Tê giác, áo giáp thảo nguyên)
  // center: [0, -36], head: [32, -50], massive horn
  // =============================================================
  function drawRhino(ctx, s, t) {
    ctx.save();
    const walk = clamp(s.walk !== undefined ? s.walk : 0, 0, 1);
    const pace = (t || 0) * 3.6;
    const bob = Math.sin(pace * 2) * 1.8 * walk;
    const blink = Math.sin((t || 0) * 0.8) > 0.94 ? 1 : 0;

    const rhinoGrey = '#64748b';
    const rhinoDark = '#475569';
    const hornCol = '#e2e8f0';

    ctx.translate(0, bob);

    // Đuôi có túm lông
    path(ctx, 'M -36 -32 Q -42 -22 -40 -12', null, INK, 2.0);
    ellipse(ctx, -40, -10, 2.5, 4, '#1e293b', null);

    // Chân xa
    drawQuadLeg(ctx, -24, -28, 28, 9.5, rhinoDark, pace + Math.PI, walk);
    drawQuadLeg(ctx, 16, -28, 28, 9.5, rhinoDark, pace, walk);

    // Thân tê giác với các nếp gấp da dày như áo giáp
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-6, -36, 32, 18, 0.03, 0, TAU);
    ctx.fillStyle = rhinoGrey;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    // Nếp gấp giáp da trên lưng và vai
    path(ctx, 'M -18 -52 Q -14 -36 -16 -20', null, rhinoDark, 2.2);
    path(ctx, 'M 8 -50 Q 12 -34 10 -20', null, rhinoDark, 2.2);
    ctx.restore();

    // Chân gần
    drawQuadLeg(ctx, -18, -30, 30, 10.5, rhinoGrey, pace, walk);
    drawQuadLeg(ctx, 22, -30, 30, 10.5, rhinoGrey, pace + Math.PI, walk);

    // Đầu & Sừng tê giác
    ctx.save();
    ctx.translate(28, -46);

    // Đầu
    drawPoly(ctx, [[-8, 12], [8, -8], [20, 0], [16, 14], [-4, 20]], rhinoGrey, INK, 1.8);

    // Sừng chính phía trước cong uy lực
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.quadraticCurveTo(24, -12, 22, -26);
    ctx.quadraticCurveTo(18, -12, 10, -2);
    ctx.closePath();
    ctx.fillStyle = hornCol;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // Sừng phụ nhỏ phía sau
    drawPoly(ctx, [[6, -4], [9, -12], [2, -6]], hornCol, INK, 1.2);

    // Mắt nhỏ
    drawAnimalEye(ctx, 4, 0, 2.5, blink, '#0f172a', '#475569');

    // Tai nhọn alert
    ellipse(ctx, -4, -10, 3.5, 6, rhinoGrey, INK, 1.2);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 8. PEREGRINE FALCON (Chim cắt, tốc độ bổ nhào 390 km/h)
  // center: [0, -35], head: [12, -58], aerodynamic raptor
  // =============================================================
  function drawPeregrineFalcon(ctx, s, t) {
    ctx.save();
    const fly = clamp(s.fly !== undefined ? s.fly : 0, 0, 1);
    const flap = Math.sin((t || 0) * 8) * 0.4 * fly;
    const blink = Math.sin((t || 0) * 0.9) > 0.94 ? 1 : 0;

    const backGrey = '#334155';
    const wingDark = '#1e293b';
    const chestBuff = '#fef3c7';
    const talonYellow = '#facc15';

    ctx.translate(0, fly ? -20 + Math.sin((t || 0) * 4) * 6 : 0);

    // Chân & móng vuốt vàng nếu đứng đất
    if (!fly) {
      line(ctx, -6, -16, -8, -2, talonYellow, 2.4);
      line(ctx, 4, -16, 6, -2, talonYellow, 2.4);
      drawPoly(ctx, [[-12, 0], [-8, -2], [-4, 0]], talonYellow, INK, 1.0);
      drawPoly(ctx, [[2, 0], [6, -2], [10, 0]], talonYellow, INK, 1.0);
    }

    // Đuôi chim cắt dài xếp gọn
    drawPoly(ctx, [[-16, -30], [-26, -10], [-18, -10], [-10, -28]], backGrey, INK, 1.4);
    // Vằn ngang đuôi
    line(ctx, -23, -15, -17, -15, '#64748b', 1.2);
    line(ctx, -21, -12, -15, -12, '#64748b', 1.2);

    // Thân chim
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -36, 16, 22, -0.2, 0, TAU);
    ctx.fillStyle = chestBuff;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Vằn ngang hình chữ V trên ngực
    for (let y = -44; y < -22; y += 4.5) {
      path(ctx, `M -4 ${y} Q 0 ${y + 2} 4 ${y}`, null, '#475569', 1.2);
    }
    ctx.restore();

    // Cánh (Khi bay thì xòe rộng khí động học, khi đứng thì khép lại)
    ctx.save();
    ctx.translate(-4, -42);
    if (fly) {
      ctx.rotate(flap);
      drawPoly(ctx, [[0, 0], [-34, -28], [-44, -10], [-12, 6]], wingDark, INK, 1.8);
      drawPoly(ctx, [[8, 0], [42, -28], [52, -10], [16, 6]], wingDark, INK, 1.8);
    } else {
      drawPoly(ctx, [[4, 0], [-18, 20], [-8, 26], [10, 8]], backGrey, INK, 1.6);
    }
    ctx.restore();

    // Đầu chim cắt có mũ trùm đen và vệt ria mép đen (Malar stripe)
    ctx.save();
    ctx.translate(8, -56);
    ellipse(ctx, 0, 0, 11, 10, backGrey, INK, 1.6);

    // Vệt đen quanh mắt và má
    path(ctx, 'M -2 0 L 4 -2 L 2 8 L -1 6 Z', '#0f172a', null);

    // Mỏ khoằm vàng với chóp xám đen
    drawPoly(ctx, [[6, -3], [14, 0], [10, 4], [6, 2]], talonYellow, INK, 1.2);
    drawPoly(ctx, [[11, -1], [14, 0], [11, 3]], '#0f172a', null);

    // Mắt to tinh tường với viền vàng
    ellipse(ctx, 2, -2, 4.0, 4.0, talonYellow, null);
    drawAnimalEye(ctx, 2, -2, 2.8, blink, '#0f172a', '#0f172a');
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 9. SNOWY OWL (Cú tuyết, kẻ săn mồi Bắc Cực bí ẩn)
  // center: [0, -36], head: [0, -56], facial disc & golden eyes
  // =============================================================
  function drawSnowyOwl(ctx, s, t) {
    ctx.save();
    const bob = Math.sin((t || 0) * 2) * 1.2;
    const blink = Math.sin((t || 0) * 0.7) > 0.94 ? 1 : 0;
    const headTurn = Math.sin((t || 0) * 1.4) * 0.08;

    const owlWhite = '#f8fafc';
    const owlGrey = '#94a3b8';
    const eyeGold = '#facc15';

    ctx.translate(0, bob);

    // Móng vuốt đen ẩn dưới lớp lông chân trắng muốt
    ellipse(ctx, -8, -3, 6, 4, owlWhite, INK, 1.2);
    ellipse(ctx, 8, -3, 6, 4, owlWhite, INK, 1.2);
    line(ctx, -10, 0, -10, 3, '#0f172a', 1.6);
    line(ctx, -7, 0, -7, 3, '#0f172a', 1.6);
    line(ctx, 6, 0, 6, 3, '#0f172a', 1.6);
    line(ctx, 9, 0, 9, 3, '#0f172a', 1.6);

    // Đuôi ngắn
    drawPoly(ctx, [[-6, -14], [0, -4], [6, -14]], owlWhite, INK, 1.2);

    // Thân tròn lông xốp
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -32, 20, 24, 0, 0, TAU);
    ctx.fillStyle = owlWhite;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Đốm lưỡi liềm nâu xám trên lông vũ
    const flecks = [
      [-10, -38], [-4, -42], [4, -40], [10, -36],
      [-12, -28], [-4, -30], [6, -28], [12, -26],
      [-8, -20], [0, -22], [8, -18]
    ];
    for (const [fx, fy] of flecks) {
      path(ctx, `M ${fx - 2} ${fy} Q ${fx} ${fy + 1.8} ${fx + 2} ${fy}`, null, owlGrey, 1.4);
    }
    ctx.restore();

    // Cánh hai bên xếp gọn ôm thân
    path(ctx, 'M -16 -44 Q -24 -30 -14 -16 Q -12 -30 -8 -40', owlWhite, INK, 1.4);
    path(ctx, 'M 16 -44 Q 24 -30 14 -16 Q 12 -30 8 -40', owlWhite, INK, 1.4);

    // Đầu cú xoay linh hoạt (Đĩa mặt tròn - Facial disc)
    ctx.save();
    ctx.translate(0, -56);
    ctx.rotate(headTurn);

    // Khối đầu tròn
    ellipse(ctx, 0, 0, 18, 16, owlWhite, INK, 1.8);

    // Hai đĩa mặt đối xứng
    ellipse(ctx, -7, 1, 8.5, 9.5, '#ffffff', '#cbd5e1', 1.2);
    ellipse(ctx, 7, 1, 8.5, 9.5, '#ffffff', '#cbd5e1', 1.2);

    // Mỏ khoằm nhỏ màu xám đen ẩn giữa hai đĩa mặt
    drawPoly(ctx, [[-2, 2], [0, 8], [2, 2]], '#1e293b', null);

    // Đôi mắt tròn to màu vàng rực rỡ đặc trưng
    if (blink > 0.6) {
      line(ctx, -11, 0, -3, 0, INK, 2.0);
      line(ctx, 3, 0, 11, 0, INK, 2.0);
    } else {
      ellipse(ctx, -7, 0, 4.5, 4.5, eyeGold, INK, 1.2);
      ellipse(ctx, -7, 0, 2.5, 2.5, '#0f172a', null);
      ellipse(ctx, -8.2, -1.2, 1.0, 1.0, '#ffffff', null);

      ellipse(ctx, 7, 0, 4.5, 4.5, eyeGold, INK, 1.2);
      ellipse(ctx, 7, 0, 2.5, 2.5, '#0f172a', null);
      ellipse(ctx, 5.8, -1.2, 1.0, 1.0, '#ffffff', null);
    }
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 10. KOMODO DRAGON (Rồng Komodo, thằn lằn khổng lồ ăn thịt)
  // center: [0, -22], head: [36, -34], heavy scaly build
  // =============================================================
  function drawKomodoDragon(ctx, s, t) {
    ctx.save();
    const walk = clamp(s.walk !== undefined ? s.walk : 0, 0, 1);
    const pace = (t || 0) * 3.8;
    const sway = Math.sin(pace) * 0.12 * walk;
    const tongueOut = Math.sin((t || 0) * 4) > 0.4;
    const blink = Math.sin((t || 0) * 0.8) > 0.94 ? 1 : 0;

    const komodoScale = '#57534e';
    const komodoDark = '#44403c';
    const komodoLight = '#78716c';

    ctx.translate(0, 0);

    // Đuôi dài khỏe uốn lượn sát đất
    const tailWave = Math.sin((t || 0) * 2.8) * 0.28;
    ctx.save();
    ctx.translate(-34, -20);
    ctx.rotate(tailWave);
    path(ctx, 'M 0 0 Q -24 -4 -38 6 Q -48 14 -36 18', null, INK, 4.0);
    path(ctx, 'M 0 0 Q -24 -4 -38 6 Q -48 14 -36 18', null, komodoScale, 3.0);
    ctx.restore();

    // Chân xa choãi ra hai bên dạng bò sát
    const legSwingFar = Math.sin(pace + Math.PI) * 8 * walk;
    drawPoly(ctx, [[-26, -18], [-28 + legSwingFar, -26], [-32 + legSwingFar, -2]], komodoDark, INK, 2.0);
    drawPoly(ctx, [[14, -18], [12 + legSwingFar, -26], [8 + legSwingFar, -2]], komodoDark, INK, 2.0);

    // Thân rồng Komodo dài, cơ bắp thấp sát đất
    ctx.save();
    ctx.rotate(sway * 0.3);
    ctx.beginPath();
    ctx.ellipse(-2, -22, 36, 12, 0.02, 0, TAU);
    ctx.fillStyle = komodoScale;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Hoa văn vảy sần sùi trên lưng
    for (let x = -28; x <= 20; x += 6) {
      ellipse(ctx, x, -27, 2.0, 1.2, komodoDark, null);
      ellipse(ctx, x + 3, -24, 2.0, 1.2, komodoLight, null);
    }
    ctx.restore();

    // Chân gần có móng vuốt cong sắc
    const legSwingNear = Math.sin(pace) * 8 * walk;
    ctx.save();
    // Chân sau
    drawPoly(ctx, [[-18, -18], [-14 + legSwingNear, -26], [-10 + legSwingNear, 0]], komodoScale, INK, 2.4);
    for (let i = -1; i <= 1; i++) line(ctx, -10 + legSwingNear + i * 2, 0, -8 + legSwingNear + i * 3, 2, '#1c1917', 1.4);
    // Chân trước
    drawPoly(ctx, [[22, -18], [26 + legSwingNear, -26], [30 + legSwingNear, 0]], komodoScale, INK, 2.4);
    for (let i = -1; i <= 1; i++) line(ctx, 30 + legSwingNear + i * 2, 0, 32 + legSwingNear + i * 3, 2, '#1c1917', 1.4);
    ctx.restore();

    // Cổ & Đầu rồng dẹt thuôn dài
    ctx.save();
    ctx.translate(32, -26);
    drawPoly(ctx, [[-6, 8], [8, -8], [22, -4], [26, 4], [10, 12], [-6, 10]], komodoScale, INK, 1.8);

    // Mũi và lỗ mũi
    ellipse(ctx, 22, -1, 1.5, 1.5, '#1c1917', null);

    // Mắt thằn lằn
    drawAnimalEye(ctx, 12, -4, 2.4, blink, '#1c1917', '#ca8a04');

    // Lưỡi chẻ màu vàng cam thò ra thụt vào (Forked yellow tongue)
    if (tongueOut) {
      ctx.save();
      ctx.translate(25, 4);
      path(ctx, 'M 0 0 L 8 0 M 8 0 L 14 -3 M 8 0 L 14 3', null, '#facc15', 1.6);
      ctx.restore();
    }
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS (ground_y: 810, 7 weathers, day/night, ZERO text)
  // 1. savanna (Thảo nguyên Savanna bao la)
  // 2. arctic_ice (Băng tuyết Bắc Cực)
  // 3. open_ocean_surface (Mặt biển đại dương bao la)
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

  // 1. SAVANNA (Thảo nguyên châu Phi với cây keo tán phẳng, đồi đất, hoàng hôn)
  function drawSavannaBg(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời Savanna
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.7);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.6, '#0f172a');
      sky.addColorStop(1, '#1e293b');
    } else {
      sky.addColorStop(0, '#f97316'); // Cam hoàng hôn
      sky.addColorStop(0.4, '#f59e0b');
      sky.addColorStop(0.8, '#fde047');
      sky.addColorStop(1, '#fef08a');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    // Mây trôi ngang thảo nguyên
    const cloudCol = isNight ? 'rgba(30, 41, 59, 0.45)' : 'rgba(254, 243, 199, 0.6)';
    for (let cx = X0 + 40; cx < X1; cx += 140) {
      const cy = 120 + Math.sin(cx * 0.05) * 40;
      ellipse(ctx, cx, cy, 55, 14, cloudCol, null);
      ellipse(ctx, cx + 18, cy - 4, 38, 12, cloudCol, null);
    }

    // Mặt trời / Mặt trăng
    if (isNight) {
      ellipse(ctx, 460, 130, 22, 22, '#fef9c3', null);
      ellipse(ctx, 460, 130, 32, 32, 'rgba(254, 249, 195, 0.2)', null);
    } else if (!settings || !settings.no_sun) {
      ellipse(ctx, 140, 180, 42, 42, '#fef08a', null);
      ellipse(ctx, 140, 180, 60, 60, 'rgba(254, 240, 138, 0.3)', null);
    }

    // Dãy đồi đá kopjes xa xa chạy dọc chân trời [X0, X1]
    const distantCol = isNight ? '#0f172a' : '#78350f';
    const midHillCol = isNight ? '#1e293b' : '#92400e';

    ctx.fillStyle = distantCol;
    ctx.beginPath();
    ctx.moveTo(X0, groundY);
    ctx.lineTo(X0, groundY - 140);
    for (let x = X0; x <= X1; x += 40) {
      const kh = 120 + Math.sin(x * 0.007) * 45 + Math.cos(x * 0.016) * 30;
      ctx.lineTo(x, groundY - kh);
    }
    ctx.lineTo(X1, groundY);
    ctx.closePath();
    ctx.fill();

    // Lớp đồi trung cận
    ctx.fillStyle = midHillCol;
    ctx.beginPath();
    ctx.moveTo(X0, groundY);
    ctx.lineTo(X0, groundY - 80);
    for (let x = X0; x <= X1; x += 50) {
      const mh = 70 + Math.sin(x * 0.01 + 1.2) * 35;
      ctx.lineTo(x, groundY - mh);
    }
    ctx.lineTo(X1, groundY);
    ctx.closePath();
    ctx.fill();

    // Cây keo tán phẳng đặc trưng (Acacia tree)
    function drawAcacia(cx, cy, scale) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      const col = isNight ? '#020617' : '#451a03';
      // Thân cây nghiêng uốn
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.quadraticCurveTo(-14, -50, -4, -80);
      ctx.lineTo(4, -80);
      ctx.quadraticCurveTo(-6, -50, 6, 0);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      // Nhánh xòe
      ctx.beginPath();
      ctx.moveTo(-4, -80);
      ctx.quadraticCurveTo(-30, -100, -50, -110);
      ctx.quadraticCurveTo(-20, -90, 0, -80);
      ctx.quadraticCurveTo(30, -95, 52, -105);
      ctx.quadraticCurveTo(20, -85, 4, -80);
      ctx.fill();
      // Tán lá phẳng ngang
      ellipse(ctx, -46, -114, 30, 8, col, null);
      ellipse(ctx, 0, -120, 42, 10, col, null);
      ellipse(ctx, 48, -110, 32, 8, col, null);
      ctx.restore();
    }

    // Vẽ cây keo chính trong vùng trung tâm 0-576
    drawAcacia(420, groundY - 20, 1.1);
    drawAcacia(120, groundY - 50, 0.7);

    // Mở rộng khổ ngang: rải cây keo và gò đá tất định
    scatterExt(ext, 240, 'acacia', (x, r) => {
      drawAcacia(x, groundY - 20, 0.75 + r * 0.4);
    });

    // Mặt đất thảo nguyên Savanna
    const groundGrad = ctx.createLinearGradient(0, groundY - 40, 0, 1024);
    if (isNight) {
      groundGrad.addColorStop(0, '#1e293b');
      groundGrad.addColorStop(1, '#0f172a');
    } else {
      groundGrad.addColorStop(0, '#ca8a04');
      groundGrad.addColorStop(0.3, '#a16207');
      groundGrad.addColorStop(1, '#713f12');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(X0, groundY - 30, X1 - X0, 1024 - (groundY - 30));

    // Bụi cỏ vàng đu đưa theo gió
    const grassCol = isNight ? '#0f172a' : '#eab308';
    ctx.strokeStyle = grassCol;
    ctx.lineWidth = 1.8;
    for (let x = X0; x < X1; x += 18) {
      const gh = 12 + Math.sin(x * 0.1) * 8;
      const sway = Math.sin((t || 0) * 3 + x * 0.05) * 4;
      line(ctx, x, groundY - 25, x + sway, groundY - 25 - gh);
      line(ctx, x + 3, groundY - 25, x + 3 + sway * 0.7, groundY - 25 - gh * 0.8);
    }

    ctx.restore();
  }

  // 2. ARCTIC_ICE (Băng trôi và sông băng Bắc Cực)
  function drawArcticIceBg(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời Bắc Cực
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.7, '#082f49');
      sky.addColorStop(1, '#0c4a6e');
    } else {
      sky.addColorStop(0, '#38bdf8');
      sky.addColorStop(0.5, '#bae6fd');
      sky.addColorStop(1, '#f0f9ff');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    // Cực quang (Aurora Borealis) ban đêm
    if (isNight) {
      ctx.save();
      for (let j = 0; j < 3; j++) {
        const waveY = 80 + j * 50;
        ctx.beginPath();
        ctx.moveTo(X0, waveY);
        for (let x = X0; x <= X1; x += 50) {
          const dy = Math.sin(x * 0.008 + (t || 0) * 0.5 + j) * 35;
          ctx.lineTo(x, waveY + dy);
        }
        ctx.strokeStyle = j === 1 ? 'rgba(34, 197, 94, 0.35)' : 'rgba(6, 182, 212, 0.3)';
        ctx.lineWidth = 28;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Dãy núi băng / tảng băng trôi xa (Icebergs)
    const bergCol = isNight ? '#0f172a' : '#e0f2fe';
    const bergShade = isNight ? '#1e293b' : '#7dd3fc';

    function drawIceberg(bx, by, w, h) {
      drawPoly(ctx, [[bx - w * 0.5, by], [bx - w * 0.1, by - h], [bx + w * 0.2, by - h * 0.9], [bx + w * 0.5, by]], bergCol, null);
      drawPoly(ctx, [[bx - w * 0.1, by - h], [bx, by], [bx + w * 0.5, by], [bx + w * 0.2, by - h * 0.9]], bergShade, null);
    }

    drawIceberg(160, groundY - 40, 160, 120);
    drawIceberg(380, groundY - 40, 220, 170);

    scatterExt(ext, 200, 'iceberg', (x, r) => {
      drawIceberg(x, groundY - 40, 140 + r * 100, 100 + r * 80);
    });

    // Mặt biển lạnh buốt giữa các tảng băng
    ctx.fillStyle = isNight ? '#020617' : '#0369a1';
    ctx.fillRect(X0, groundY - 50, X1 - X0, 30);

    // Thềm băng tuyết dày mặt đất (Ice shelf & Pack ice)
    const iceGrad = ctx.createLinearGradient(0, groundY - 30, 0, 1024);
    if (isNight) {
      iceGrad.addColorStop(0, '#38bdf8');
      iceGrad.addColorStop(0.3, '#0c4a6e');
      iceGrad.addColorStop(1, '#020617');
    } else {
      iceGrad.addColorStop(0, '#ffffff');
      iceGrad.addColorStop(0.3, '#e0f2fe');
      iceGrad.addColorStop(1, '#bae6fd');
    }
    ctx.fillStyle = iceGrad;
    ctx.fillRect(X0, groundY - 26, X1 - X0, 1024 - (groundY - 26));

    // Khe nứt băng xanh ngọc (Ice crevices)
    ctx.strokeStyle = isNight ? '#0284c7' : '#0284c7';
    ctx.lineWidth = 1.8;
    for (let x = X0 + 20; x < X1; x += 110) {
      path(ctx, `M ${x} ${groundY - 20} L ${x + 18} ${groundY + 8} L ${x + 36} ${groundY + 2}`, null, isNight ? '#0369a1' : '#38bdf8', 1.6);
    }

    ctx.restore();
  }

  // 3. OPEN_OCEAN_SURFACE (Mặt biển khơi bao la, sóng lượn vô tận)
  function drawOpenOceanSurfaceBg(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1;
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời biển khơi
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.6);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.7, '#0f172a');
      sky.addColorStop(1, '#1e293b');
    } else {
      sky.addColorStop(0, '#0284c7');
      sky.addColorStop(0.6, '#38bdf8');
      sky.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, groundY * 0.6);

    // Mây chân trời biển
    const cloudCol = isNight ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.6)';
    for (let x = X0; x < X1; x += 120) {
      ellipse(ctx, x + 40, groundY * 0.5 - 20, 60, 16, cloudCol, null);
    }

    // Các tầng sóng biển nhấp nhô
    const waveLayers = [
      { y: groundY * 0.6, speed: 1.0, amp: 8, col: isNight ? '#0c4a6e' : '#0369a1' },
      { y: groundY * 0.72, speed: 1.6, amp: 12, col: isNight ? '#075985' : '#0284c7' },
      { y: groundY * 0.86, speed: 2.2, amp: 16, col: isNight ? '#0369a1' : '#0ea5e9' },
      { y: groundY, speed: 3.0, amp: 20, col: isNight ? '#0284c7' : '#38bdf8' }
    ];

    for (const wl of waveLayers) {
      ctx.beginPath();
      ctx.moveTo(X0, 1024);
      ctx.lineTo(X0, wl.y);
      for (let x = X0; x <= X1; x += 30) {
        const sy = Math.sin(x * 0.02 + (t || 0) * wl.speed) * wl.amp;
        ctx.lineTo(x, wl.y + sy);
      }
      ctx.lineTo(X1, 1024);
      ctx.closePath();
      ctx.fillStyle = wl.col;
      ctx.fill();

      // Bọt sóng trắng trên ngọn sóng (Whitecaps)
      ctx.strokeStyle = isNight ? 'rgba(224, 242, 254, 0.35)' : 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let x = X0 + 10; x <= X1; x += 45) {
        const sy = Math.sin(x * 0.02 + (t || 0) * wl.speed) * wl.amp;
        ctx.moveTo(x - 10, wl.y + sy);
        ctx.quadraticCurveTo(x, wl.y + sy - 3, x + 10, wl.y + sy);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION
  // =============================================================
  const WILDLIFE_APEX_RIGS = {
    lion: { draw(ctx, s, t) { drawLion(ctx, s, t); } },
    tiger: { draw(ctx, s, t) { drawTiger(ctx, s, t); } },
    jaguar: { draw(ctx, s, t) { drawJaguar(ctx, s, t); } },
    great_white_shark: { draw(ctx, s, t) { drawGreatWhiteShark(ctx, s, t); } },
    killer_whale: { draw(ctx, s, t) { drawKillerWhale(ctx, s, t); } },
    polar_bear: { draw(ctx, s, t) { drawPolarBear(ctx, s, t); } },
    rhino: { draw(ctx, s, t) { drawRhino(ctx, s, t); } },
    peregrine_falcon: { draw(ctx, s, t) { drawPeregrineFalcon(ctx, s, t); } },
    snowy_owl: { draw(ctx, s, t) { drawSnowyOwl(ctx, s, t); } },
    komodo_dragon: { draw(ctx, s, t) { drawKomodoDragon(ctx, s, t); } }
  };

  const WILDLIFE_APEX_BACKGROUNDS = {
    savanna: {
      label: 'Thảo nguyên hoang dã',
      theme: 'nature',
      ground_y: 810,
      draw(ctx, settings, t) { drawSavannaBg(ctx, settings, t); }
    },
    arctic_ice: {
      label: 'Băng tuyết Bắc Cực',
      theme: 'nature',
      ground_y: 810,
      draw(ctx, settings, t) { drawArcticIceBg(ctx, settings, t); }
    },
    open_ocean_surface: {
      label: 'Mặt biển đại dương bao la',
      theme: 'water',
      ground_y: 810,
      open_water: true,
      draw(ctx, settings, t) { drawOpenOceanSurfaceBg(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: WILDLIFE_APEX_RIGS,
    backgrounds: WILDLIFE_APEX_BACKGROUNDS
  });

})();
