// Remake Vector Engine Pack: Trellis Vines & Pergolas (Giai đoạn C)
// Cây leo giàn, quả leo giàn, đạo cụ giàn và hình nền vườn giàn / nhà kính
(function() {
  'use strict';
  if (!globalThis.RemakeVector) throw new Error('RemakeVector core engine must be loaded before engine packs.');
  const { kit, register } = globalThis.RemakeVector;
  const {
    INK, tone, volume, cylinder, limb, leaf, blade, ellipse, path, line,
    withCut, hash, clamp, smooth, FRUIT_BODIES, FRUIT_SEEDS, FRUIT_LIMBS
  } = kit;
  const TAU = Math.PI * 2;

  // -------------------------------------------------------------
  // 1. MÀU VÀ NỘI SUY MÀU CHÍN CHO CÁC LOẠI QUẢ LEO GIÀN MỚI
  // -------------------------------------------------------------
  const TRELLIS_FRUIT_COLORS = {
    cucumber: [[142, 196, 92], [66, 150, 60], [38, 114, 42]],
    bitter_melon: [[156, 204, 102], [82, 168, 64], [52, 136, 46]],
    luffa: [[138, 192, 90], [68, 152, 58], [42, 118, 44]],
    bottle_gourd: [[178, 222, 148], [160, 214, 134], [142, 202, 120]],
    winter_melon: [[132, 186, 96], [62, 142, 68], [34, 98, 48]],
    passion_fruit: [[136, 184, 88], [168, 112, 142], [68, 28, 64]],
    chayote: [[168, 220, 138], [146, 208, 118], [128, 196, 104]],
    long_bean: [[132, 190, 88], [74, 156, 56], [54, 134, 44]],
    kiwi: [[152, 188, 108], [142, 116, 74], [108, 76, 44]],
  };

  function fruitRipenColor(fruitId, g) {
    const stops = TRELLIS_FRUIT_COLORS[fruitId] || [[120, 180, 70], [220, 180, 60], [220, 60, 50]];
    const scaled = clamp(g) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    const u = scaled - i;
    const r = Math.round(stops[i][0] + (stops[i + 1][0] - stops[i][0]) * u);
    const gCol = Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * u);
    const b = Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * u);
    return `rgb(${r},${gCol},${b})`;
  }

  // -------------------------------------------------------------
  // 2. VẼ 8 RIG QUẢ LEO GIÀN MỚI (NHÓM FRUIT: CÓ MẶT & TAY CHÂN ĐỨNG RIÊNG)
  // -------------------------------------------------------------

  // 2.1 CUCUMBER (Dưa leo)
  function drawCucumberBody(ctx, s, body, t) {
    const col = s.style.body || fruitRipenColor('cucumber', s.growth ?? 1);
    // Trụ dài hơi cong hình quả dưa, thon nhỏ ở 2 đầu
    const d = 'M -9 -84 C 6 -86 12 -74 13 -50 C 14 -26 12 -2 -2 0 C -12 0 -15 -18 -15 -44 C -15 -68 -14 -82 -9 -84 Z';
    path(ctx, d, volume(ctx, 0, -42, 16, 44, col, .28, -.25), INK, 2.2);
    // Sọc gân nhạt dọc thân
    ctx.save(); ctx.globalAlpha *= .35;
    for (const sx of [-7, -1, 5]) {
      path(ctx, `M ${sx} -80 Q ${sx + 2} -42 ${sx * 0.7} -4`, null, tone(col, .25), 1.4);
    }
    // Gai sần li ti đặc trưng của dưa leo
    for (let i = 0; i < 14; i++) {
      const gx = -9 + (i * 7) % 20, gy = -76 + i * 5.2;
      ellipse(ctx, gx, gy, 1.2, 1.2, tone(col, -.35), null);
      line(ctx, [[gx, gy], [gx + (i % 2 ? 1.5 : -1.5), gy - 1.2]], '#ebf7dc', 0.8);
    }
    ctx.restore();
    // Vệt sáng bóng
    ellipse(ctx, -6, -62, 3, 16, 'rgba(255,255,255,.35)', null, 1, 0.1);
    // Cuống dưa và đài hoa khô ở đáy
    path(ctx, 'M -3 -84 L -1 -94 L 3 -94 L 1 -84 Z', cylinder(ctx, -3, 3, '#356e2c'), INK, 1.4);
    path(ctx, 'M -2 -1 L 0 4 L 2 -1 Z', '#b89a38', INK, 1);
  }
  function drawCucumberSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 4, -40, 6, 32, tone(flesh, .12), null);
    for (let i = 0; i < 9; i++) {
      ellipse(ctx, side * 4 + ((i % 2) ? 1.5 : -1.5), -70 + i * 7.5, 1.3, 2.8, '#eaf8dc', null, 1, side * 0.15);
    }
  }

  // 2.2 BITTER MELON (Khổ qua / Mướp đắng)
  function drawBitterMelonBody(ctx, s, body, t) {
    const col = s.style.body || fruitRipenColor('bitter_melon', s.growth ?? 1);
    // Dáng thoi nhọn hai đầu, phần giữa phình to
    const d = 'M 0 -86 C 18 -80 20 -54 18 -40 C 16 -18 10 -4 0 0 C -10 -4 -16 -18 -18 -40 C -20 -54 -18 -80 0 -86 Z';
    path(ctx, d, volume(ctx, 0, -42, 20, 44, col, .3, -.25), INK, 2.2);
    // Các u nốt sần sùi và vân gồ ghề đặc trưng
    ctx.save();
    for (let i = 0; i < 18; i++) {
      const ux = Math.sin(i * 1.8) * 12;
      const uy = -78 + i * 4.4;
      ellipse(ctx, ux, uy, 3.2, 2.4, volume(ctx, ux, uy, 3.2, 2.4, tone(col, .18), .3, -.25), tone(col, -.3), 1);
    }
    ctx.restore();
    ellipse(ctx, -7, -60, 3.5, 14, 'rgba(255,255,255,.3)', null, 1, 0.1);
    path(ctx, 'M -2 -86 L 0 -95 L 3 -94 L 1 -86 Z', cylinder(ctx, -2, 3, '#326827'), INK, 1.4);
  }
  function drawBitterMelonSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 5, -42, 8, 30, '#f8faf2', null);
    for (let i = 0; i < 5; i++) {
      ellipse(ctx, side * 5, -62 + i * 10, 3.5, 4.5, '#78542c', INK, 1);
    }
  }

  // 2.3 LUFFA (Mướp hương)
  function drawLuffaBody(ctx, s, body, t) {
    const col = s.style.body || fruitRipenColor('luffa', s.growth ?? 1);
    // Quả thuôn dài hơi thắt ở trên, nở dần đều ở dưới
    const d = 'M -7 -88 C 8 -90 11 -70 12 -46 C 13 -20 15 -2 0 0 C -15 -2 -13 -20 -12 -46 C -11 -70 -8 -90 -7 -88 Z';
    path(ctx, d, volume(ctx, 0, -44, 15, 46, col, .28, -.25), INK, 2.2);
    // 8-10 gân dọc màu xanh thẫm
    ctx.save(); ctx.globalAlpha *= .5;
    for (const gx of [-9, -5, -1, 3, 7, 10]) {
      line(ctx, [[gx * 0.7, -84], [gx, -44], [gx * 0.8, -2]], tone(col, -.35), 1.4);
    }
    ctx.restore();
    ellipse(ctx, -5, -65, 2.5, 15, 'rgba(255,255,255,.35)', null, 1, 0.08);
    // Cuống dài dẻo dai
    path(ctx, 'M -2 -88 Q -1 -98 4 -102', null, INK, 4.2);
    path(ctx, 'M -2 -88 Q -1 -98 4 -102', null, '#36722d', 2.4);
  }
  function drawLuffaSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 4, -44, 7, 34, '#f2f6ee', null);
    for (let i = 0; i < 7; i++) {
      ellipse(ctx, side * 4 + ((i % 2) ? 1.5 : -1.5), -72 + i * 9, 2.2, 3.2, '#282828', null);
    }
  }

  // 2.4 BOTTLE GOURD (Bầu hồ lô)
  function drawBottleGourdBody(ctx, s, body, t) {
    const col = s.style.body || fruitRipenColor('bottle_gourd', s.growth ?? 1);
    // Dáng bầu hồ lô kinh điển: eo thắt ở giữa, bầu dưới to hơn bầu trên
    const d = 'M 0 -86 C 16 -86 20 -72 16 -58 C 12 -48 8 -46 12 -40 C 24 -32 30 -18 24 -6 C 18 4 -18 4 -24 -6 C -30 -18 -24 -32 -12 -40 C -8 -46 -12 -48 -16 -58 C -20 -72 -16 -86 0 -86 Z';
    path(ctx, d, volume(ctx, 0, -42, 28, 46, col, .32, -.2), INK, 2.2);
    // Đốm sáng mịn màng
    ellipse(ctx, -8, -68, 4, 8, 'rgba(255,255,255,.45)', null, 1, 0.2);
    ellipse(ctx, -12, -22, 6, 12, 'rgba(255,255,255,.35)', null, 1, 0.2);
    // Cuống gỗ cong nhẹ
    path(ctx, 'M 0 -86 Q -2 -96 5 -102', null, INK, 4.6);
    path(ctx, 'M 0 -86 Q -2 -96 5 -102', null, '#5e8248', 2.8);
  }
  function drawBottleGourdSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 5, -60, 6, 10, '#ffffff', null);
    ellipse(ctx, side * 7, -22, 10, 16, '#ffffff', null);
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, side * 7 + ((i % 2) ? 2 : -2), -32 + i * 7, 2.2, 3.4, '#c8bca2', null);
    }
  }

  // 2.5 WINTER MELON (Bí đao)
  function drawWinterMelonBody(ctx, s, body, t) {
    const col = s.style.body || fruitRipenColor('winter_melon', s.growth ?? 1);
    // Hình trụ mập tròn đầy đặn
    const d = 'M -22 -84 C -4 -88 4 -88 22 -84 C 28 -72 29 -20 22 -4 C 12 2 -12 2 -22 -4 C -29 -20 -28 -72 -22 -84 Z';
    path(ctx, d, volume(ctx, 0, -44, 28, 44, col, .28, -.25), INK, 2.4);
    // Phấn trắng mờ phủ bên ngoài vỏ (đặc trưng bí đao già)
    ctx.save();
    ellipse(ctx, 0, -44, 24, 40, volume(ctx, 0, -44, 24, 40, 'rgba(240, 252, 246, 0.42)', .3, -.15), null);
    ctx.restore();
    ellipse(ctx, -12, -64, 5, 14, 'rgba(255,255,255,.5)', null, 1, 0.15);
    // Cuống to dày có khía
    path(ctx, 'M -4 -86 L -2 -96 L 4 -96 L 2 -86 Z', cylinder(ctx, -4, 4, '#265624'), INK, 1.8);
  }
  function drawWinterMelonSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 8, -44, 12, 32, '#f8faf4', null);
    for (let i = 0; i < 6; i++) {
      ellipse(ctx, side * 8 + ((i % 2) ? 2 : -2), -64 + i * 8, 2, 3.2, '#d6c8a8', null);
    }
  }

  // 2.6 PASSION FRUIT (Chanh dây)
  function drawPassionFruitBody(ctx, s, body, t) {
    const col = s.style.body || fruitRipenColor('passion_fruit', s.growth ?? 1);
    // Quả hình trứng tròn trịa, vỏ bóng tím sẫm
    ellipse(ctx, 0, -44, 26, 32, volume(ctx, 0, -44, 26, 32, col, .35, -.3), INK, 2.2);
    // Chấm li ti nhạt
    ctx.save(); ctx.globalAlpha *= .3;
    for (let i = 0; i < 14; i++) {
      const px = Math.sin(i * 2.3) * 18, py = -44 + Math.cos(i * 1.9) * 22;
      ellipse(ctx, px, py, 1, 1, '#f2d8ec', null);
    }
    ctx.restore();
    ellipse(ctx, -8, -60, 4.5, 10, 'rgba(255,255,255,.55)', null, 1, 0.35);
    // Đài hoa 3 lá noãn nhỏ ở cuống
    path(ctx, 'M -6 -76 Q 0 -80 6 -76 L 0 -72 Z', volume(ctx, 0, -75, 6, 3, '#4a7c36'), INK, 1.2);
    path(ctx, 'M 0 -76 L 0 -86', null, INK, 4.2);
    path(ctx, 'M 0 -76 L 0 -86', null, '#4a7c36', 2.6);
  }
  function drawPassionFruitSeeds(ctx, s, side, flesh) {
    // Vỏ dày (tím ngoài, trắng trong), ruột vàng cam óng ả có hạt đen
    ellipse(ctx, side * 6, -44, 16, 22, '#f6e4a0', INK, 1.2);
    for (let i = 0; i < 8; i++) {
      const sx = side * 6 + Math.sin(i * 1.8) * 8;
      const sy = -44 + Math.cos(i * 1.5) * 12;
      ellipse(ctx, sx, sy, 3, 4, volume(ctx, sx, sy, 3, 4, '#f59e0b'), null);
      ellipse(ctx, sx, sy, 1.4, 2, '#18120e', null);
    }
  }

  // 2.7 CHAYOTE (Su su)
  function drawChayoteBody(ctx, s, body, t) {
    const col = s.style.body || fruitRipenColor('chayote', s.growth ?? 1);
    // Quả hình lê có rãnh dọc, đáy nhăn lõm nhẹ
    const d = 'M 0 -82 C 14 -82 22 -62 24 -40 C 26 -16 16 0 2 2 C -4 0 -8 0 -12 2 C -22 0 -26 -16 -24 -40 C -22 -62 -14 -82 0 -82 Z';
    path(ctx, d, volume(ctx, 0, -40, 24, 44, col, .3, -.22), INK, 2.2);
    // Các đường rãnh khía dọc đặc trưng
    ctx.save(); ctx.globalAlpha *= .35;
    for (const rx of [-12, -4, 4, 12]) {
      path(ctx, `M ${rx * 0.4} -78 Q ${rx * 1.1} -38 ${rx * 0.8} 0`, null, tone(col, -.3), 1.6);
    }
    ctx.restore();
    ellipse(ctx, -8, -58, 4, 12, 'rgba(255,255,255,.45)', null, 1, 0.2);
    path(ctx, 'M -2 -82 L 0 -92 L 3 -91 L 1 -82 Z', cylinder(ctx, -2, 3, '#467e38'), INK, 1.4);
  }
  function drawChayoteSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 6, -34, 7, 12, '#eef8e4', INK, 1);
    ellipse(ctx, side * 6, -34, 4.5, 8, '#d4ecc0', null);
  }

  // 2.8 LONG BEAN (Đậu đũa)
  function drawLongBeanBody(ctx, s, body, t) {
    const col = s.style.body || fruitRipenColor('long_bean', s.growth ?? 1);
    // Chùm 2-3 quả đậu đũa dài thon mềm mại đung đưa
    const drawPod = (dx, angle) => {
      ctx.save();
      ctx.translate(dx, -92);
      ctx.rotate(angle);
      const d = 'M -2 0 Q 3 32 -2 60 Q -5 78 0 94 L 2 94 Q -2 78 1 60 Q 6 32 1 0 Z';
      path(ctx, d, volume(ctx, 0, 46, 4, 46, col, .3, -.25), INK, 1.8);
      // Nốt phồng hạt đậu dọc quả
      for (let i = 1; i <= 6; i++) {
        ellipse(ctx, 0, i * 13, 1.8, 3.2, tone(col, .2), null);
      }
      ctx.restore();
    };
    drawPod(-4, -0.04);
    drawPod(2, 0.05);
    drawPod(-1, 0.01);
    // Đầu cuống gắn chung
    ellipse(ctx, -1, -93, 4, 3, volume(ctx, -1, -93, 4, 3, '#386a2c'), INK, 1.2);
    path(ctx, 'M -1 -94 L 0 -102', null, INK, 3.8);
    path(ctx, 'M -1 -94 L 0 -102', null, '#386a2c', 2.2);
  }
  function drawLongBeanSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 3, -40, 3, 20, '#eaf6de', null);
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, side * 3, -52 + i * 8, 1.5, 2.5, '#427830', null);
    }
  }

  // 2.9 KIWI (Bổ sung quả kiwi dùng cho kiwi_vine và Giai đoạn D)
  function drawKiwiBody(ctx, s, body, t) {
    const col = s.style.body || fruitRipenColor('kiwi', s.growth ?? 1);
    ellipse(ctx, 0, -42, 22, 28, volume(ctx, 0, -42, 22, 28, col, .25, -.3), INK, 2.2);
    // Lông tơ nâu li ti
    ctx.save(); ctx.globalAlpha *= .35;
    for (let i = 0; i < 24; i++) {
      const kx = Math.sin(i * 1.7) * 18, ky = -42 + Math.cos(i * 1.3) * 22;
      line(ctx, [[kx, ky], [kx + 1, ky - 1.5]], '#483018', 0.9);
    }
    ctx.restore();
    ellipse(ctx, -6, -56, 4, 8, 'rgba(255,255,255,.3)', null, 1, 0.2);
    ellipse(ctx, 0, -70, 3.5, 2, '#483018', INK, 1);
  }
  function drawKiwiSeeds(ctx, s, side, flesh) {
    // Ruột xanh ngọc, tâm trắng, vòng hạt đen
    ellipse(ctx, side * 5, -42, 14, 18, '#58b63a', INK, 1.2);
    ellipse(ctx, side * 5, -42, 4, 7, '#f4faee', null);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      ellipse(ctx, side * 5 + Math.cos(a) * 7.5, -42 + Math.sin(a) * 11, 1, 1.6, '#181818', null, 1, a);
    }
  }

  // -------------------------------------------------------------
  // 3. ĐẠO CỤ GIÀN LEO (§4.1: TRELLIS_A, TRELLIS_NET, PERGOLA)
  // -------------------------------------------------------------

  function drawBambooPole(ctx, x0, y0, x1, y1, width, color) {
    line(ctx, [[x0, y0], [x1, y1]], INK, width + 1.8);
    line(ctx, [[x0, y0], [x1, y1]], color, width);
    // Các đốt tre (nodes)
    const len = Math.hypot(x1 - x0, y1 - y0);
    const numNodes = Math.max(2, Math.floor(len / 22));
    for (let i = 1; i < numNodes; i++) {
      const u = i / numNodes;
      const nx = x0 + (x1 - x0) * u, ny = y0 + (y1 - y0) * u;
      ellipse(ctx, nx, ny, width * 0.7, 1.8, '#6e6232', INK, 0.8);
    }
  }

  // 3.1 TRELLIS_A (Giàn chữ A bằng tre)
  function drawTrellisA(ctx, s, t) {
    const bamboo = '#c8bc78';
    // Hai thanh tre xiên tạo khung chữ A
    drawBambooPole(ctx, -36, 0, 0, -96, 6.5, bamboo);
    drawBambooPole(ctx, 36, 0, 0, -96, 6.5, bamboo);
    // 4 thanh ngang liên kết
    for (const [w, y] of [[58, -22], [44, -44], [30, -66], [16, -88]]) {
      drawBambooPole(ctx, -w / 2, y, w / 2, y, 4.8, tone(bamboo, .08));
      // Mối buộc dây thừng tại các khớp
      ellipse(ctx, -w / 2, y, 3.2, 3.2, '#7a623a', INK, 0.8);
      ellipse(ctx, w / 2, y, 3.2, 3.2, '#7a623a', INK, 0.8);
    }
    // Mối buộc đỉnh chữ A
    ellipse(ctx, 0, -96, 4.5, 4.5, '#7a623a', INK, 1);
  }

  // 3.2 TRELLIS_NET (Lưới đứng)
  function drawTrellisNet(ctx, s, t) {
    const wood = '#a47e52';
    // Hai cột đứng hai bên
    drawBambooPole(ctx, -34, 0, -34, -96, 6, wood);
    drawBambooPole(ctx, 34, 0, 34, -96, 6, wood);
    // Thanh xà ngang đỉnh
    drawBambooPole(ctx, -38, -95, 38, -95, 5.2, tone(wood, .15));
    // Lưới mắt cáo (diamond net)
    ctx.save();
    ctx.strokeStyle = '#8ab296';
    ctx.lineWidth = 1.3;
    const cols = 5, rows = 6;
    for (let r = 0; r <= rows; r++) {
      const y = -10 - r * 14;
      line(ctx, [[-33, y], [33, y]], '#98bfa4', 0.9);
    }
    for (let c = -2; c <= 2; c++) {
      const x = c * 13;
      line(ctx, [[x, -94], [x, 0]], '#98bfa4', 0.9);
    }
    // Dây chéo tạo ô lưới
    for (let i = -3; i <= 3; i++) {
      line(ctx, [[i * 16 - 20, 0], [i * 16 + 20, -94]], '#7ea88a', 0.8);
      line(ctx, [[i * 16 + 20, 0], [i * 16 - 20, -94]], '#7ea88a', 0.8);
    }
    ctx.restore();
  }

  // 3.3 PERGOLA (Giàn ngang trên đầu)
  function drawPergola(ctx, s, t) {
    const wood = '#8e6c46';
    // Hai trụ đứng đỡ giàn
    drawBambooPole(ctx, -38, 0, -38, -82, 7.5, wood);
    drawBambooPole(ctx, 38, 0, 38, -82, 7.5, wood);
    // Chân đế cột
    ellipse(ctx, -38, 0, 6, 2.5, tone(wood, -.3), INK, 1.2);
    ellipse(ctx, 38, 0, 6, 2.5, tone(wood, -.3), INK, 1.2);
    // Thanh dầm ngang chính
    drawBambooPole(ctx, -46, -82, 46, -82, 6.8, tone(wood, .18));
    // 5 thanh rui/mè ngang vắt qua đỉnh tạo trần giàn
    for (let i = -2; i <= 2; i++) {
      const rx = i * 18;
      path(ctx, `M ${rx - 4} -88 L ${rx + 4} -88 L ${rx + 4} -80 L ${rx - 4} -80 Z`, volume(ctx, rx, -84, 4, 4, tone(wood, .25)), INK, 1.2);
      line(ctx, [[rx - 5, -88], [rx + 5, -88]], tone(wood, .4), 1);
    }
  }

  // -------------------------------------------------------------
  // 4. TEMPLATE DRAVVINE (§4.2: GIÀN VẼ LUÔN TRONG RIG, DÂY LEO, HOA & QUẢ)
  // -------------------------------------------------------------

  const VINE_SPECS = {
    cucumber_vine: {
      support: 'trellis_a', fruit: 'cucumber', fruitScale: 0.26,
      leaf: 'lobed3', leafColor: '#4c9238',
      blossom: { color: '#f8d438', center: '#d48818', type: 'cucurbit' },
      slots: [[-24, -36], [22, -34], [-16, -58], [14, -56], [-8, -78], [8, -76]]
    },
    bitter_melon_vine: {
      support: 'trellis_a', fruit: 'bitter_melon', fruitScale: 0.28,
      leaf: 'palmate', leafColor: '#448c34',
      blossom: { color: '#fae048', center: '#c87814', type: 'cucurbit' },
      slots: [[-22, -38], [24, -36], [-14, -60], [16, -58], [-8, -80], [6, -78]]
    },
    luffa_vine: {
      support: 'pergola', fruit: 'luffa', fruitScale: 0.28,
      leaf: 'palmate', leafColor: '#428834',
      blossom: { color: '#f6d232', center: '#c27c16', type: 'cucurbit' },
      slots: [[-28, -62], [-12, -64], [8, -62], [26, -64], [-2, -68], [18, -68]]
    },
    bottle_gourd_vine: {
      support: 'pergola', fruit: 'bottle_gourd', fruitScale: 0.26,
      leaf: 'heart', leafColor: '#529640',
      blossom: { color: '#ffffff', center: '#e2cf44', type: 'cucurbit' },
      slots: [[-26, -64], [-8, -66], [12, -64], [28, -66], [-18, -70], [20, -70]]
    },
    winter_melon_vine: {
      support: 'pergola', fruit: 'winter_melon', fruitScale: 0.28,
      leaf: 'lobed3', leafColor: '#3c8230',
      blossom: { color: '#f6d636', center: '#cb7a16', type: 'cucurbit' },
      slots: [[-24, -66], [-4, -68], [18, -66], [30, -68], [-14, -72]]
    },
    passion_fruit_vine: {
      support: 'pergola', fruit: 'passion_fruit', fruitScale: 0.25,
      leaf: 'lobed3', leafColor: '#3e8432',
      blossom: { color: '#e8d4ec', center: '#6e2468', type: 'passion' },
      slots: [[-28, -70], [-14, -72], [4, -70], [22, -72], [-6, -74], [14, -74]]
    },
    chayote_vine: {
      support: 'trellis_a', fruit: 'chayote', fruitScale: 0.26,
      leaf: 'heart', leafColor: '#5aa244',
      blossom: { color: '#fcf6a8', center: '#c8a826', type: 'cucurbit' },
      slots: [[-24, -40], [22, -38], [-16, -62], [14, -60], [-6, -80], [8, -78]]
    },
    long_bean_vine: {
      support: 'trellis_net', fruit: 'long_bean', fruitScale: 0.25,
      leaf: 'trifoliate', leafColor: '#468e36',
      blossom: { color: '#d8bce8', center: '#723488', type: 'bean' },
      slots: [[-20, -42], [-6, -54], [10, -46], [22, -58], [-12, -72], [14, -74]]
    },
    grape_vine: {
      support: 'pergola', fruit: 'grape', fruitScale: 0.32,
      leaf: 'palmate', leafColor: '#4a8c36',
      blossom: { color: '#d8ecd0', center: '#a2cc8e', type: 'cucurbit' },
      slots: [[-26, -68], [-10, -70], [8, -68], [24, -70], [-2, -74], [16, -74]]
    },
    kiwi_vine: {
      support: 'pergola', fruit: 'kiwi', fruitScale: 0.27,
      leaf: 'heart', leafColor: '#488a38',
      blossom: { color: '#fffdf0', center: '#d4aa38', type: 'cucurbit' },
      slots: [[-28, -72], [-12, -74], [6, -72], [22, -74], [-4, -76], [14, -76]]
    },
  };

  // Vẽ lá theo từng kiểu hình học: palmate, heart, lobed3, trifoliate
  function drawVineLeaf(ctx, x, y, size, angle, type, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(size, size);
    if (type === 'heart') {
      const d = 'M 0 0 C -18 -12 -28 -28 -14 -42 C -4 -48 0 -36 0 -30 C 0 -36 4 -48 14 -42 C 28 -28 18 -12 0 0 Z';
      path(ctx, d, volume(ctx, 0, -22, 18, 22, color, .28, -.25), INK, 1.4);
      line(ctx, [[0, 0], [0, -32]], tone(color, -.3), 1);
    } else if (type === 'palmate') {
      const d = 'M 0 0 L -8 -16 L -24 -20 L -14 -32 L -18 -48 L 0 -38 L 18 -48 L 14 -32 L 24 -20 L 8 -16 Z';
      path(ctx, d, volume(ctx, 0, -24, 22, 24, color, .25, -.25), INK, 1.4);
      line(ctx, [[0, 0], [0, -36]], tone(color, -.35), 1.2);
    } else if (type === 'trifoliate') {
      // 3 lá chét
      for (const [la, ls] of [[-0.4, 0.85], [0, 1.0], [0.4, 0.85]]) {
        ctx.save(); ctx.rotate(la);
        ellipse(ctx, 0, -22 * ls, 8 * ls, 14 * ls, volume(ctx, 0, -22 * ls, 8 * ls, 14 * ls, color, .25, -.2), INK, 1.1);
        ctx.restore();
      }
      line(ctx, [[0, 0], [0, -18]], tone(color, -.3), 1.2);
    } else {
      // lobed3
      const d = 'M 0 0 C -12 -10 -22 -22 -18 -34 C -12 -42 -2 -34 0 -28 C 2 -34 12 -42 18 -34 C 22 -22 12 -10 0 0 Z';
      path(ctx, d, volume(ctx, 0, -20, 16, 20, color, .28, -.2), INK, 1.4);
      line(ctx, [[0, 0], [0, -30]], tone(color, -.3), 1);
    }
    ctx.restore();
  }

  // Vẽ hoa nở rộ ở giai đoạn growth 0.35 - 0.55
  function drawVineBlossom(ctx, x, y, size, blossom) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    const { color, center, type } = blossom;
    if (type === 'passion') {
      // Hoa chanh dây lộng lẫy: cánh trắng tím xòe, nhị hoa hình đĩa
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ellipse(ctx, Math.cos(a) * 9, Math.sin(a) * 9, 3.5, 6, volume(ctx, Math.cos(a) * 9, Math.sin(a) * 9, 3.5, 6, color), INK, 0.8, a);
      }
      // Vòng tua tím quanh tâm
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        line(ctx, [[0, 0], [Math.cos(a) * 7, Math.sin(a) * 7]], '#6e2468', 1);
      }
      ellipse(ctx, 0, 0, 3.5, 3.5, center, INK, 0.8);
    } else if (type === 'bean') {
      // Hoa đậu hình cánh bướm
      ellipse(ctx, 0, -4, 6, 7, volume(ctx, 0, -4, 6, 7, color), INK, 0.8);
      ellipse(ctx, -3, 2, 4, 5, volume(ctx, -3, 2, 4, 5, tone(color, -.1)), INK, 0.8);
      ellipse(ctx, 3, 2, 4, 5, volume(ctx, 3, 2, 4, 5, tone(color, -.1)), INK, 0.8);
      ellipse(ctx, 0, 0, 2, 2.5, center, null);
    } else {
      // Hoa họ bầu bí (5 cánh xòe)
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * TAU;
        ellipse(ctx, Math.cos(a) * 6, Math.sin(a) * 6, 4, 6, volume(ctx, Math.cos(a) * 6, Math.sin(a) * 6, 4, 6, color), INK, 0.8, a);
      }
      ellipse(ctx, 0, 0, 3, 3, center, INK, 0.8);
    }
    ctx.restore();
  }

  // Tua cuốn xoắn ốc bám giàn (tendril)
  function drawTendril(ctx, x, y, angle, length) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = '#4e9236';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i < 20; i++) {
      const rad = 2 + i * 0.3;
      const th = i * 0.45;
      ctx.lineTo(i * 1.1 + Math.cos(th) * rad, Math.sin(th) * rad);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawFruitTreeVine(ctx, s, t, spec) {
    const g = clamp(s.growth ?? 1);
    const wind = (s.wind || 0) * 0.12;

    // 1. VẼ GIÀN TRONG RIG (không bao giờ lệch khỏi dây leo)
    if (spec.support === 'trellis_a') drawTrellisA(ctx, s, t);
    else if (spec.support === 'trellis_net') drawTrellisNet(ctx, s, t);
    else if (spec.support === 'pergola') drawPergola(ctx, s, t);

    // 2. DÂY LEO VÀ TUA CUỐN BÒ THEO ĐỘ TĂNG TRƯỞNG
    if (g > 0.05) {
      ctx.save();
      const vineCol = '#428832';
      // Các đường dây leo chính
      const vinePaths = spec.support === 'trellis_a'
        ? [
            [[-32, 0], [-26, -24], [-18, -48], [-8, -72], [0, -94]],
            [[32, 0], [26, -24], [18, -48], [8, -72], [0, -94]],
            [[-16, -44], [-2, -44], [14, -44]],
            [[-24, -22], [0, -22], [24, -22]]
          ]
        : spec.support === 'trellis_net'
        ? [
            [[-28, 0], [-22, -32], [-14, -62], [-4, -92]],
            [[28, 0], [20, -30], [12, -60], [2, -92]],
            [[-20, -32], [0, -48], [18, -64], [-6, -84]],
            [[16, -24], [-4, -54], [14, -76]]
          ]
        : [
            // pergola: leo từ hai cột lên trần và vắt ngang
            [[-38, 0], [-38, -35], [-36, -65], [-34, -82], [-18, -84], [0, -84]],
            [[38, 0], [38, -35], [36, -65], [34, -82], [18, -84], [0, -84]],
            [[-30, -84], [-10, -84], [10, -84], [30, -84]],
            [[-24, -86], [4, -86], [28, -86]]
          ];

      const maxSegs = Math.max(1, Math.floor(g * 4.2));
      for (let pIdx = 0; pIdx < Math.min(vinePaths.length, maxSegs); pIdx++) {
        const pts = vinePaths[pIdx];
        const numPts = Math.max(2, Math.floor(pts.length * Math.min(1, g * 1.3)));
        const drawnPts = pts.slice(0, numPts);
        for (let i = 0; i < drawnPts.length - 1; i++) {
          const [x0, y0] = drawnPts[i], [x1, y1] = drawnPts[i + 1];
          const sway = Math.sin(t * 2 + i + pIdx) * wind * 8;
          line(ctx, [[x0, y0], [x1 + sway, y1]], INK, 4.2);
          line(ctx, [[x0, y0], [x1 + sway, y1]], vineCol, 2.6);

          // Lá mọc so le dọc thân cây leo
          if (g > 0.15) {
            const mx = (x0 + x1) * 0.5 + sway, my = (y0 + y1) * 0.5;
            const lSize = (0.28 + g * 0.32) * ((i % 2) ? 1.05 : 0.9);
            const lAngle = (i % 2 ? 0.7 : -0.7) + Math.sin(t * 3 + i) * (0.05 + wind);
            drawVineLeaf(ctx, mx, my, lSize, lAngle, spec.leaf, spec.leafColor);
          }

          // Tua cuốn xoắn ốc bám vào cọc giàn
          if (g > 0.25 && (i % 2 === 0)) {
            drawTendril(ctx, x1 + sway, y1, (i % 2 ? 0.4 : -0.4), 16);
          }
        }
      }

      // 3. HOA NỞ Ở GIAI ĐOẠN SINH TRƯỞNG (growth 0.32 - 0.65)
      if (g >= 0.32 && g <= 0.68) {
        const bloomFactor = smooth(clamp(1 - Math.abs(g - 0.48) / 0.18, 0, 1));
        const bSize = 0.55 * bloomFactor;
        const blossomSlots = spec.slots.slice(0, 4);
        for (let i = 0; i < blossomSlots.length; i++) {
          const [bx, by] = blossomSlots[i];
          drawVineBlossom(ctx, bx, by + 4, bSize, spec.blossom);
        }
      }

      // 4. QUẢ TREO DÙNG FRUIT_BODIES, DÀI DẦN THEO GROWTH, SỐ QUẢ THEO POSE FRUITS
      if (g >= 0.45) {
        const fruitDrawer = FRUIT_BODIES[spec.fruit];
        if (fruitDrawer) {
          const numFruits = typeof s.fruits === 'number' ? Math.max(0, Math.floor(s.fruits)) : spec.slots.length;
          // Cùng công thức với farm_trees (remake_vector.tree_fruit_placement dựa vào đây): tâm thân quả tại fruit_N.
          const fruitScale = (spec.fruitScale || 0.28) * (0.5 + 0.5 * clamp((g - 0.45) / 0.55));
          const half = 50 * fruitScale;
          for (let i = 0; i < Math.min(numFruits, spec.slots.length); i++) {
            const [sx, sy] = spec.slots[i];
            const fruitSway = Math.sin(t * 2.2 + i * 1.4) * (0.03 + wind * 1.2);
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(fruitSway);
            // Cuống treo từ giàn xuống mép trên của quả
            line(ctx, [[0, -half - 6], [0, -half + 1]], INK, 3.2);
            line(ctx, [[0, -half - 6], [0, -half + 1]], '#3c7a2c', 1.8);
            ctx.scale(fruitScale, fruitScale);
            ctx.translate(0, 50);
            // Vẽ quả theo đúng FRUIT_BODIES của thư viện
            const fruitState = {
              asset: spec.fruit,
              growth: g,
              slice: 0,
              damage: 0,
              style: s.style || {},
              faceEnabled: false,
              attached: true,
            };
            fruitDrawer(ctx, fruitState, fruitRipenColor(spec.fruit, g), t);
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }
  }

  // -------------------------------------------------------------
  // 5. 2 HÌNH NỀN MỚI CHO GIAI ĐOẠN C: TRELLIS_GARDEN & GREENHOUSE
  // -------------------------------------------------------------

  const BACKGROUNDS = {
    trellis_garden: {
      label: 'Vườn giàn leo đồng quê (Trellis Garden)',
      theme: 'garden',
      ground_y: 810,
      draw(ctx, settings, t, kit) {
        const isNight = settings.time === 'night' || settings.time_of_day === 'night';
        const W = 576, H = 1024, GY = 810;
        // Bầu trời
        const skyGrad = ctx.createLinearGradient(0, 0, 0, GY);
        if (isNight) {
          skyGrad.addColorStop(0, '#0c1626');
          skyGrad.addColorStop(0.65, '#162842');
          skyGrad.addColorStop(1, '#243a58');
        } else {
          skyGrad.addColorStop(0, '#7ec2f0');
          skyGrad.addColorStop(0.55, '#b8e4f8');
          skyGrad.addColorStop(1, '#eaf7ff');
        }
        ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, GY);

        if (isNight) {
          // Trăng khuyết và sao đêm
          ellipse(ctx, 470, 160, 24, 24, '#fbf4d0', null);
          ellipse(ctx, 460, 154, 22, 22, '#162842', null);
          for (let i = 0; i < 28; i++) {
            const sx = (i * 47) % W, sy = (i * 31) % 360;
            ellipse(ctx, sx, sy, (i % 3 === 0 ? 1.5 : 1), (i % 3 === 0 ? 1.5 : 1), 'rgba(255,255,255,.8)', null);
          }
        } else {
          // Mây trắng trôi nhẹ nhàng
          for (const [cx, cy, cr] of [[120, 180, 48], [160, 170, 56], [210, 184, 42], [410, 220, 50], [460, 210, 60]]) {
            ellipse(ctx, cx, cy, cr, cr * 0.55, 'rgba(255,255,255,.75)', null);
          }
          // Chim én bay xa
          for (const [bx, by] of [[280, 140], [315, 128], [340, 146]]) {
            path(ctx, `M ${bx - 8} ${by + 3} Q ${bx - 4} ${by - 4} ${bx} ${by} Q ${bx + 4} ${by - 4} ${bx + 8} ${by + 3}`, null, '#3c5a78', 1.5);
          }
        }

        // Đồi xa và rặng cây mờ
        const hillGrad = ctx.createLinearGradient(0, 400, 0, GY);
        hillGrad.addColorStop(0, isNight ? '#16263a' : '#8ab89a');
        hillGrad.addColorStop(1, isNight ? '#1e382b' : '#5a8e6e');
        path(ctx, `M 0 540 Q 140 480 290 530 Q 440 580 576 510 L 576 ${GY} L 0 ${GY} Z`, hillGrad, null);

        // Các dãy giàn leo phía xa (phối cảnh có chiều sâu)
        ctx.save(); ctx.globalAlpha *= isNight ? 0.35 : 0.45;
        for (let i = 0; i < 5; i++) {
          const gx = 60 + i * 110, gy = 620 + (i % 2) * 15;
          line(ctx, [[gx - 20, gy], [gx, gy - 65], [gx + 20, gy]], isNight ? '#223832' : '#4a6e50', 2.8);
          line(ctx, [[gx - 14, gy - 25], [gx + 14, gy - 25]], isNight ? '#223832' : '#4a6e50', 2);
          line(ctx, [[gx - 8, gy - 45], [gx + 8, gy - 45]], isNight ? '#223832' : '#4a6e50', 2);
        }
        ctx.restore();

        // Hàng rào tre mộc mạc ở cự ly trung cảnh
        for (let i = 0; i < 18; i++) {
          const fx = i * 34, fy = 710;
          line(ctx, [[fx, fy + 70], [fx, fy]], isNight ? '#223428' : '#8c7848', 3.4);
        }
        line(ctx, [[0, 740], [W, 740]], isNight ? '#1c2c22' : '#7a683a', 2.8);
        line(ctx, [[0, 770], [W, 770]], isNight ? '#1c2c22' : '#7a683a', 2.8);

        // Mặt đất vườn và luống đất trồng
        const gGrad = ctx.createLinearGradient(0, GY - 40, 0, H);
        if (isNight) {
          gGrad.addColorStop(0, '#1c2820');
          gGrad.addColorStop(0.3, '#142018');
          gGrad.addColorStop(1, '#0c140e');
        } else {
          gGrad.addColorStop(0, '#588842');
          gGrad.addColorStop(0.2, '#6a4d32');
          gGrad.addColorStop(1, '#483422');
        }
        ctx.fillStyle = gGrad; ctx.fillRect(0, GY, W, H - GY);

        // Bụi cỏ rải rác chân giàn
        for (let i = 0; i < 12; i++) {
          const cx = 20 + i * 48;
          ctx.save(); ctx.translate(cx, GY);  // blade() luôn mọc từ y = 0
          blade(ctx, 0, [-6, -14], isNight ? '#1e3828' : '#76aa4c');
          blade(ctx, 4, [8, -16], isNight ? '#244030' : '#88bc5a');
          ctx.restore();
        }
      }
    },

    greenhouse: {
      label: 'Nhà kính nông nghiệp hiện đại (Greenhouse)',
      theme: 'farm',
      ground_y: 810,
      draw(ctx, settings, t, kit) {
        const isNight = settings.time === 'night' || settings.time_of_day === 'night';
        const W = 576, H = 1024, GY = 810;

        // Bầu trời ngoài lớp màng nhà kính khuếch tán
        const skyGrad = ctx.createLinearGradient(0, 0, 0, GY);
        if (isNight) {
          skyGrad.addColorStop(0, '#0a121c');
          skyGrad.addColorStop(1, '#14202e');
        } else {
          skyGrad.addColorStop(0, '#eaf4fc');
          skyGrad.addColorStop(0.5, '#d4e8f8');
          skyGrad.addColorStop(1, '#f2f8fc');
        }
        ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, GY);

        // Các vòm khung thép của nhà kính phối cảnh sâu
        const steelColor = isNight ? '#243444' : '#88a2ba';
        ctx.save();
        for (let arch = 0; arch < 4; arch++) {
          const scale = 0.55 + arch * 0.15;
          const topY = 120 + arch * 45;
          ctx.lineWidth = 2.4 + arch * 0.8;
          ctx.strokeStyle = steelColor;
          ctx.beginPath();
          ctx.moveTo(W / 2 - 260 * scale, GY);
          ctx.bezierCurveTo(W / 2 - 250 * scale, topY, W / 2 + 250 * scale, topY, W / 2 + 260 * scale, GY);
          ctx.stroke();
        }
        // Các thanh xà ngang chịu lực của nhà kính
        for (const y of [220, 360, 520, 680]) {
          line(ctx, [[0, y], [W, y]], steelColor, 1.6);
        }
        // Quạt thông gió lớn ở vách kính sau
        ellipse(ctx, W / 2, 280, 42, 42, isNight ? '#16222e' : '#c4d8e6', steelColor, 2);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI + (t * 2);
          line(ctx, [[W / 2 - Math.cos(a) * 36, 280 - Math.sin(a) * 36], [W / 2 + Math.cos(a) * 36, 280 + Math.sin(a) * 36]], steelColor, 2.2);
        }

        // Đường ống tưới nhỏ giọt treo ngang trên đầu
        line(ctx, [[0, 460], [W, 460]], isNight ? '#121c24' : '#3c4a54', 2.8);
        for (let i = 0; i < 9; i++) {
          const nx = 35 + i * 60;
          line(ctx, [[nx, 460], [nx, 474]], '#26343e', 1.8);
          // Hạt sương tưới nhỏ giọt
          if (!isNight) ellipse(ctx, nx, 478, 1.5, 2, 'rgba(160,220,255,.7)', null);
        }

        // Đèn LED chiếu sáng sinh học ban đêm
        if (isNight) {
          ctx.globalAlpha = 0.45;
          for (let i = 0; i < 5; i++) {
            const lx = 60 + i * 110;
            const coneGrad = ctx.createRadialGradient(lx, 460, 4, lx, 650, 180);
            coneGrad.addColorStop(0, 'rgba(255, 140, 220, 0.6)');
            coneGrad.addColorStop(1, 'rgba(255, 140, 220, 0)');
            ctx.fillStyle = coneGrad;
            ctx.beginPath();
            ctx.moveTo(lx - 20, 460); ctx.lineTo(lx + 20, 460);
            ctx.lineTo(lx + 90, 780); ctx.lineTo(lx - 90, 780);
            ctx.fill();
          }
          ctx.globalAlpha = 1.0;
        }
        ctx.restore();

        // Mặt đất nhà kính: luống đất cao và lối đi trung tâm
        const groundGrad = ctx.createLinearGradient(0, GY, 0, H);
        if (isNight) {
          groundGrad.addColorStop(0, '#1a2218');
          groundGrad.addColorStop(1, '#0e1410');
        } else {
          groundGrad.addColorStop(0, '#4e3824');
          groundGrad.addColorStop(0.3, '#3c2818');
          groundGrad.addColorStop(1, '#2c1e12');
        }
        ctx.fillStyle = groundGrad; ctx.fillRect(0, GY, W, H - GY);

        // Lối đi bê tông trung tâm
        const pathGrad = ctx.createLinearGradient(0, GY, 0, H);
        pathGrad.addColorStop(0, isNight ? '#242c34' : '#9ca8b2');
        pathGrad.addColorStop(1, isNight ? '#161c22' : '#7a8690');
        path(ctx, `M ${W / 2 - 50} ${GY} L ${W / 2 + 50} ${GY} L ${W / 2 + 110} ${H} L ${W / 2 - 110} ${H} Z`, pathGrad, steelColor, 1.4);
      }
    }
  };

  // -------------------------------------------------------------
  // 6. ĐĂNG KÝ VÀO HỆ THỐNG QUA REMAKEVECTOR.REGISTER
  // -------------------------------------------------------------

  const RIGS = {
    // 3 Đạo cụ giàn
    trellis_a: { group: 'prop', draw: drawTrellisA },
    trellis_net: { group: 'prop', draw: drawTrellisNet },
    pergola: { group: 'prop', draw: drawPergola },

    // 8 Quả leo giàn mới (nhóm fruit: tự có mặt & tay chân khi đứng riêng)
    cucumber: { group: 'fruit', draw: drawCucumberBody, spec: { hip: 8, hipY: -6, arm: 18, armY: -50 , limbColor: '#3f6f2a' }, seeds: drawCucumberSeeds },
    bitter_melon: { group: 'fruit', draw: drawBitterMelonBody, spec: { hip: 8, hipY: -6, arm: 18, armY: -48 , limbColor: '#4f7a32' }, seeds: drawBitterMelonSeeds },
    luffa: { group: 'fruit', draw: drawLuffaBody, spec: { hip: 8, hipY: -6, arm: 16, armY: -54 , limbColor: '#4f6f2e' }, seeds: drawLuffaSeeds },
    bottle_gourd: { group: 'fruit', draw: drawBottleGourdBody, spec: { hip: 12, hipY: -6, arm: 24, armY: -46 , limbColor: '#5f7f3a' }, seeds: drawBottleGourdSeeds },
    winter_melon: { group: 'fruit', draw: drawWinterMelonBody, spec: { hip: 14, hipY: -6, arm: 28, armY: -45 , limbColor: '#4f6f4a' }, seeds: drawWinterMelonSeeds },
    passion_fruit: { group: 'fruit', draw: drawPassionFruitBody, spec: { hip: 10, hipY: -6, arm: 26, armY: -44 , limbColor: '#4a2a4a' }, seeds: drawPassionFruitSeeds },
    chayote: { group: 'fruit', draw: drawChayoteBody, spec: { hip: 10, hipY: -6, arm: 22, armY: -44 , limbColor: '#6f8a3a' }, seeds: drawChayoteSeeds },
    long_bean: { group: 'fruit', draw: drawLongBeanBody, spec: { hip: 6, hipY: -8, arm: 14, armY: -48 , limbColor: '#4a7a2a' }, seeds: drawLongBeanSeeds },

    // Quả kiwi dùng cho kiwi_vine (và sẵn sàng cho Giai đoạn D)
    kiwi: { group: 'fruit', draw: drawKiwiBody, spec: { hip: 10, hipY: -6, arm: 24, armY: -44 , limbColor: '#6a5030' }, seeds: drawKiwiSeeds },

    // 10 Cây leo giàn
    cucumber_vine: { group: 'plant', draw: (ctx, s, t) => drawFruitTreeVine(ctx, s, t, VINE_SPECS.cucumber_vine), spec: VINE_SPECS.cucumber_vine },
    bitter_melon_vine: { group: 'plant', draw: (ctx, s, t) => drawFruitTreeVine(ctx, s, t, VINE_SPECS.bitter_melon_vine), spec: VINE_SPECS.bitter_melon_vine },
    luffa_vine: { group: 'plant', draw: (ctx, s, t) => drawFruitTreeVine(ctx, s, t, VINE_SPECS.luffa_vine), spec: VINE_SPECS.luffa_vine },
    bottle_gourd_vine: { group: 'plant', draw: (ctx, s, t) => drawFruitTreeVine(ctx, s, t, VINE_SPECS.bottle_gourd_vine), spec: VINE_SPECS.bottle_gourd_vine },
    winter_melon_vine: { group: 'plant', draw: (ctx, s, t) => drawFruitTreeVine(ctx, s, t, VINE_SPECS.winter_melon_vine), spec: VINE_SPECS.winter_melon_vine },
    passion_fruit_vine: { group: 'plant', draw: (ctx, s, t) => drawFruitTreeVine(ctx, s, t, VINE_SPECS.passion_fruit_vine), spec: VINE_SPECS.passion_fruit_vine },
    chayote_vine: { group: 'plant', draw: (ctx, s, t) => drawFruitTreeVine(ctx, s, t, VINE_SPECS.chayote_vine), spec: VINE_SPECS.chayote_vine },
    long_bean_vine: { group: 'plant', draw: (ctx, s, t) => drawFruitTreeVine(ctx, s, t, VINE_SPECS.long_bean_vine), spec: VINE_SPECS.long_bean_vine },
    grape_vine: { group: 'plant', draw: (ctx, s, t) => drawFruitTreeVine(ctx, s, t, VINE_SPECS.grape_vine), spec: VINE_SPECS.grape_vine },
    kiwi_vine: { group: 'plant', draw: (ctx, s, t) => drawFruitTreeVine(ctx, s, t, VINE_SPECS.kiwi_vine), spec: VINE_SPECS.kiwi_vine },
  };

  register({
    rigs: RIGS,
    backgrounds: BACKGROUNDS,
  });
})();
