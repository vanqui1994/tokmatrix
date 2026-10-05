// Remake Vector Engine Pack: German Culture & Grimm Fairy Tales (Giai đoạn P)
// Rigs: schultuete, advent_wreath, christmas_tree_decor, gingerbread_house, market_stall, cuckoo_clock, fox, owl, deer, wolf, stork, wild_boar
// Backgrounds: black_forest_village, christmas_market, allotment_garden, alpine_meadow
(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('de_culture pack: RemakeVector core engine chưa được nạp.');
  }

  const {
    INK, TAU, tone, volume, taper, limb, mitten, leaf, blade,
    ellipse, path, line, withCut, hash, clamp, smooth, mix,
    PANEL, frameW, frameSpan, spread, tileX, seeded
  } = RemakeVector.kit;

  function drawPoly(ctx, pts, fill, stroke, width = 1) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke && width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, fill, stroke, width = 1) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x4, y4);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke && width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  function drawEye(ctx, x, y, r, blink, dirX = 1, irisColor = '#2b231d') {
    if (blink > 0.7) {
      path(ctx, `M ${x - r} ${y} Q ${x} ${y + r * 0.8} ${x + r} ${y}`, null, INK, 1.6);
      return;
    }
    const h = r * (1 - blink * 0.8);
    ellipse(ctx, x, y, r, h, '#ffffff', INK, 1.2);
    const pupilX = x + dirX * (r * 0.25);
    ellipse(ctx, pupilX, y, r * 0.55, h * 0.55, irisColor, null);
    ellipse(ctx, pupilX, y, r * 0.32, h * 0.32, '#111111', null);
    ellipse(ctx, pupilX - r * 0.18, y - h * 0.18, r * 0.2, h * 0.2, '#ffffff', null);
  }

  // -------------------------------------------------------------
  // 1. SCHULTUETE (Túi quà hình nón ngày đầu đi học)
  // -------------------------------------------------------------
  function drawSchultuete(ctx, s, t) {
    ctx.save();
    const coneCol = s.style?.cone || '#2563eb';
    const accentCol = s.style?.accent || '#f59e0b';
    const ribbonCol = '#ef4444';

    // Thân nón giấy carton: chóp nhọn chạm đất tại (0, 0), loe dần lên y = -62
    // Vẽ thân nón
    drawPoly(ctx, [[0, 0], [17, -62], [-17, -62]], coneCol, INK, 1.6);

    // Các dải hoa văn trang trí hình xoắn ốc / ziczac tươi vui
    path(ctx, `M ${-6} -22 L ${6} -22`, null, accentCol, 3.0);
    path(ctx, `M ${-11} -40 L ${11} -40`, null, '#ec4899', 3.4);
    path(ctx, `M ${-15} -54 L ${15} -54`, null, accentCol, 3.4);

    // Những ngôi sao nhỏ / chấm bi trang trí trên thân nón
    ellipse(ctx, 0, -32, 2.5, 2.5, '#ffffff', null);
    ellipse(ctx, -5, -48, 2, 2, '#ffffff', null);
    ellipse(ctx, 5, -48, 2, 2, '#ffffff', null);

    // Vành nẹp viền miệng nón
    ellipse(ctx, 0, -62, 17.5, 3.5, tone(coneCol, -0.2), INK, 1.2);

    // Giấy nhún (crepe paper) phồng xòe ở phần miệng túi quà từ y = -62 lên y = -82
    const crepeCol = '#fbcfe8';
    path(ctx, `M -17 -62 C -24 -70 -12 -84 0 -84 C 12 -84 24 -70 17 -62 Z`, crepeCol, INK, 1.4);
    // Nếp gấp giấy nhún
    for (let i = -3; i <= 3; i++) {
      line(ctx, [[i * 4.5, -62], [i * 3.5, -82]], '#f472b6', 1.0);
    }

    // Nơ ruy băng satin thắt chặt quanh cổ túi quà tại y = -62
    ellipse(ctx, 0, -62, 5, 4, ribbonCol, INK, 1.0);
    // Cánh nơ hai bên
    path(ctx, `M -4 -62 C -14 -68 -14 -56 -4 -62 Z`, ribbonCol, INK, 1.2);
    path(ctx, `M 4 -62 C 14 -68 14 -56 4 -62 Z`, ribbonCol, INK, 1.2);
    // Dải ruy băng rủ xuống
    path(ctx, `M -2 -60 Q -8 -48 -6 -38`, null, ribbonCol, 2.2);
    path(ctx, `M 2 -60 Q 8 -48 6 -38`, null, ribbonCol, 2.2);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 2. ADVENT_WREATH (Vòng lá thông 4 nến Adventskranz)
  // -------------------------------------------------------------
  function drawAdventWreath(ctx, s, t) {
    ctx.save();
    const pineDark = '#14532d', pineMid = '#166534', pineLight = '#22c55e';
    const ribbonCol = '#dc2626';
    const litCount = Math.round(clamp(s.lit ?? 4, 0, 4));

    // Đĩa chân đế kim loại mạ vàng
    ellipse(ctx, 0, -8, 36, 10, '#ca8a04', INK, 1.2);

    // Vành lá thông tết tròn hình xuyến
    ellipse(ctx, 0, -18, 34, 13, pineDark, INK, 1.6);
    ellipse(ctx, 0, -18, 32, 11, pineMid, null);
    ellipse(ctx, 0, -18, 14, 5, pineDark, INK, 1.0); // Lỗ tròn giữa vòng lá

    // Các túm kim thông xòe tự nhiên quanh vòng lá
    for (let a = 0; a < TAU; a += 0.28) {
      const rx = Math.cos(a) * 33, ry = -18 + Math.sin(a) * 12;
      const tx = rx + Math.cos(a) * 4, ty = ry + Math.sin(a) * 2;
      line(ctx, [[rx, ry], [tx, ty]], pineLight, 1.5);
    }

    // 4 nơ ruy băng đỏ thắt trang trí quanh vòng lá
    for (const [bx, by] of [[-30, -18], [0, -7], [30, -18], [0, -29]]) {
      ellipse(ctx, bx, by, 3.5, 3, ribbonCol, INK, 0.8);
      path(ctx, `M ${bx - 2} ${by} L ${bx - 6} ${by - 3} L ${bx - 2} ${by - 1} Z`, ribbonCol, null);
      path(ctx, `M ${bx + 2} ${by} L ${bx + 6} ${by - 3} L ${bx + 2} ${by - 1} Z`, ribbonCol, null);
    }

    // 4 ngọn nến trụ đứng trang trọng trên đế tròn
    const candleCoords = [
      [-24, -36, 24, 0], // Cây 1
      [-8, -42, 28, 1],  // Cây 2
      [8, -42, 28, 2],   // Cây 3
      [24, -36, 24, 3]   // Cây 4
    ];

    for (const [cx, cy, ch, idx] of candleCoords) {
      const baseTopY = cy + ch;
      // Chân đỡ nến mạ đồng
      ellipse(ctx, cx, baseTopY - 14, 5.5, 2.2, '#eab308', INK, 0.8);
      // Thân nến màu ngà đỏ sẫm truyền thống
      const cBody = idx % 2 === 0 ? '#b91c1c' : '#fef3c7';
      drawPoly(ctx, [[cx - 4, baseTopY - 14], [cx + 4, baseTopY - 14], [cx + 4, cy], [cx - 4, cy]], cBody, INK, 1.2);
      ellipse(ctx, cx, cy, 4, 1.8, tone(cBody, 0.15), INK, 0.8);

      // Bấc nến
      line(ctx, [[cx, cy], [cx, cy - 4]], '#1e293b', 1.2);

      // Ngọn lửa nến nếu cây nến này được thắp sáng (litCount > idx)
      if (litCount > idx) {
        const flicker = Math.sin(t * 8 + idx * 2.1) * 0.8;
        const fy = cy - 6;
        // Quầng sáng ấm áp
        ellipse(ctx, cx, fy - 4, 16, 16, 'rgba(254, 240, 138, 0.35)', null);
        // Ngọn lửa hình giọt nước ngoài
        path(ctx, `M ${cx - 3.5} ${fy} C ${cx - 4} ${fy - 6} ${cx + flicker} ${fy - 12} ${cx} ${fy - 14} C ${cx - flicker} ${fy - 12} ${cx + 4} ${fy - 6} ${cx + 3.5} ${fy} Z`, '#f59e0b', null);
        // Tim lửa trắng ấm
        ellipse(ctx, cx, fy - 3, 1.8, 3.5, '#ffffff', null);
      }
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 3. CHRISTMAS_TREE_DECOR (Cây thông Giáng sinh trang trí)
  // -------------------------------------------------------------
  function drawChristmasTreeDecor(ctx, s, t) {
    ctx.save();
    const treeGreen = '#166534', greenMid = '#15803d', greenLight = '#22c55e';
    const goldCol = '#eab308', redCol = '#dc2626', blueCol = '#2563eb';
    const lit = (s.lit ?? 1) > 0.1;

    // Chân đế gỗ chữ thập
    drawPoly(ctx, [[-16, 0], [16, 0], [14, -6], [-14, -6]], '#78350f', INK, 1.2);
    // Gốc thân cây gỗ nâu
    drawPoly(ctx, [[-6, -6], [6, -6], [5, -18], [-5, -18]], '#451a03', INK, 1.4);

    // 4 tầng tán thông xếp lớp từ dưới lên
    // Tầng 1 (đáy): width ~64
    path(ctx, `M 0 -44 L 32 -16 Q 22 -22 14 -18 Q 0 -24 -14 -18 Q -22 -22 -32 -16 Z`, treeGreen, INK, 1.6);
    // Tầng 2: width ~50
    path(ctx, `M 0 -62 L 25 -38 Q 16 -44 10 -40 Q 0 -46 -10 -40 Q -16 -44 -25 -38 Z`, greenMid, INK, 1.6);
    // Tầng 3: width ~36
    path(ctx, `M 0 -78 L 18 -56 Q 12 -62 6 -58 Q 0 -64 -6 -58 Q -12 -62 -18 -56 Z`, treeGreen, INK, 1.6);
    // Tầng 4 (chóp): width ~22
    path(ctx, `M 0 -92 L 12 -72 Q 6 -78 0 -74 Q -6 -78 -12 -72 Z`, greenLight, INK, 1.6);

    // Dây kim tuyến vàng lượn sóng quanh tán cây
    path(ctx, `M -24 -22 Q 0 -14 24 -24`, null, goldCol, 2.2);
    path(ctx, `M -18 -44 Q 0 -36 18 -46`, null, goldCol, 2.2);
    path(ctx, `M -12 -62 Q 0 -56 12 -64`, null, goldCol, 2.0);

    // Các quả cầu noel thủy tinh nhiều màu rực rỡ
    const baubles = [
      [-22, -20, redCol], [0, -16, goldCol], [22, -22, blueCol],
      [-14, -42, goldCol], [12, -40, redCol], [-2, -46, blueCol],
      [-10, -60, redCol], [8, -58, goldCol], [0, -74, redCol]
    ];
    for (const [bx, by, col] of baubles) {
      ellipse(ctx, bx, by, 3.5, 3.5, col, INK, 0.8);
      ellipse(ctx, bx - 1, by - 1, 1, 1, '#ffffff', null);
      if (lit) {
        ellipse(ctx, bx, by, 6, 6, 'rgba(254, 240, 138, 0.25)', null);
      }
    }

    // Đèn hạt sáng nhỏ lấp lánh
    if (lit) {
      for (let i = 0; i < 12; i++) {
        const lx = Math.sin(i * 1.7) * (20 - i * 1.5);
        const ly = -24 - i * 5;
        const tw = Math.sin(t * 6 + i) > 0;
        ellipse(ctx, lx, ly, tw ? 2.5 : 1.5, tw ? 2.5 : 1.5, '#fef08a', null);
      }
    }

    // Ngôi sao vàng 5 cánh trên đỉnh cây thông tại (0, -96)
    ctx.save();
    ctx.translate(0, -96);
    if (lit) {
      ellipse(ctx, 0, 0, 18, 18, 'rgba(254, 240, 138, 0.45)', null);
    }
    const starPts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 9 : 3.8;
      const a = -Math.PI / 2 + i * (TAU / 10);
      starPts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    drawPoly(ctx, starPts, goldCol, '#b45309', 1.4);
    ellipse(ctx, 0, 0, 2, 2, '#fffbeb', null);
    ctx.restore();

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 4. GINGERBREAD_HOUSE (Nhà bánh gừng Lebkuchenhaus)
  // -------------------------------------------------------------
  function drawGingerbreadHouse(ctx, s, t) {
    ctx.save();
    const breadCol = '#78350f', breadShade = '#451a03';
    const icingCol = '#f8fafc', candyRed = '#dc2626', candyGreen = '#16a34a';

    // Thân nhà bánh gừng: đế chạm y = 0
    drawPoly(ctx, [[-36, 0], [36, 0], [36, -50], [-36, -50]], breadCol, INK, 1.8);
    // Đầu hồi tam giác
    drawPoly(ctx, [[-38, -50], [38, -50], [0, -82]], breadCol, INK, 1.8);

    // Mái ngói bánh gừng phủ lớp kem đường tuyết trắng lượn sóng
    // Cánh mái trái
    path(ctx, `M -42 -48 L 0 -84 L 2 -84 L -38 -46 Z`, icingCol, INK, 1.2);
    // Cánh mái phải
    path(ctx, `M 42 -48 L 0 -84 L -2 -84 L 38 -46 Z`, icingCol, INK, 1.2);
    // Lớp kem đường rủ viền mép mái
    for (let x = -36; x <= 36; x += 8) {
      ellipse(ctx, x, -48, 4.5, 4.5, icingCol, null);
    }

    // Ống khói bánh quế bên phải
    drawPoly(ctx, [[14, -68], [24, -68], [24, -86], [14, -78]], '#d97706', INK, 1.2);
    ellipse(ctx, 19, -86, 5.5, 2.5, icingCol, INK, 1.0);

    // Cửa ra vào hình vòm bằng bánh gừng với kẹo gậy hai bên
    path(ctx, `M -10 0 L -10 -22 C -10 -30 10 -30 10 -22 L 10 0 Z`, breadShade, INK, 1.4);
    // Kẹo gậy cột cửa
    line(ctx, [[-12, 0], [-12, -22]], candyRed, 2.5);
    line(ctx, [[12, 0], [12, -22]], candyRed, 2.5);
    // Núm cửa kẹo tròn
    ellipse(ctx, 6, -14, 2, 2, '#fbbf24', null);

    // Cửa sổ bánh quy hình trái tim ở đầu hồi
    path(ctx, `M 0 -64 C -6 -70 -12 -64 -6 -58 L 0 -52 L 6 -58 C 12 -64 6 -70 0 -64 Z`, '#fef08a', INK, 1.2);

    // Các viên kẹo dẻo gôm màu đính trên tường nhà
    const candies = [[-24, -14, candyRed], [-24, -32, candyGreen], [24, -14, candyGreen], [24, -32, candyRed]];
    for (const [cx, cy, col] of candies) {
      ellipse(ctx, cx, cy, 3.5, 3.5, col, INK, 0.8);
      ellipse(ctx, cx - 1, cy - 1, 1, 1, '#ffffff', null);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 5. MARKET_STALL (Quầy chợ Giáng sinh Marktstand)
  // -------------------------------------------------------------
  function drawMarketStall(ctx, s, t) {
    ctx.save();
    const woodDark = '#451a03', woodMid = '#78350f', woodLight = '#b45309';
    const awningRed = '#dc2626', awningWhite = '#f8fafc';

    // Thùng quầy gỗ dưới chân chạm y = 0 lên y = -32
    drawPoly(ctx, [[-40, 0], [40, 0], [38, -32], [-38, -32]], woodMid, INK, 1.6);
    // Ván gỗ ghép dọc
    for (let x = -30; x <= 30; x += 10) {
      line(ctx, [[x, 0], [x, -32]], woodDark, 1.2);
    }
    // Mặt bàn quầy gỗ nhô ra gờ nổi
    drawPoly(ctx, [[-42, -32], [42, -32], [42, -36], [-42, -36]], woodLight, INK, 1.4);

    // Hai cột gỗ đỡ mái hiên hai bên
    drawPoly(ctx, [[-38, -36], [-32, -36], [-32, -66], [-38, -66]], woodDark, INK, 1.2);
    drawPoly(ctx, [[32, -36], [38, -36], [38, -66], [32, -66]], woodDark, INK, 1.2);

    // Kệ hàng phía sau trưng bày đồ
    line(ctx, [[-32, -48], [32, -48]], woodLight, 2.5);
    // Vài món đồ nhỏ trừu tượng trên kệ (ngôi sao, hộp quà gỗ)
    ellipse(ctx, -18, -52, 4, 4, '#eab308', INK, 0.8);
    drawPoly(ctx, [[-4, -48], [4, -48], [4, -56], [-4, -56]], '#dc2626', INK, 0.8);
    ellipse(ctx, 18, -52, 4, 4, '#38bdf8', INK, 0.8);

    // Mái bạt sọc đỏ trắng sặc sỡ nhô vát nghiêng
    const awWidth = 92;
    drawPoly(ctx, [[-46, -66], [46, -66], [40, -82], [-40, -82]], woodDark, INK, 1.6);
    // Sọc bạt
    for (let i = 0; i < 9; i++) {
      const u1 = -46 + i * 10.2, u2 = u1 + 5.1;
      const v1 = -40 + i * 8.8, v2 = v1 + 4.4;
      quad(ctx, u1, -66, u2, -66, v1, -82, v2, -82, i % 2 === 0 ? awningRed : awningWhite, null);
    }
    // Rèm lượn sóng viền mái hiên
    for (let x = -44; x <= 44; x += 8) {
      ellipse(ctx, x, -66, 4.5, 3.5, awningWhite, INK, 0.8);
    }

    // Dây đèn bóng tròn treo dưới mái hiên
    for (let x = -32; x <= 32; x += 16) {
      ellipse(ctx, x, -63, 2.8, 3.5, '#fef08a', INK, 0.8);
      ellipse(ctx, x, -63, 6, 6, 'rgba(254, 240, 138, 0.35)', null);
    }

    // Dây cành thông xanh trang trí mặt trước bàn quầy
    path(ctx, `M -36 -34 Q 0 -26 36 -34`, null, '#15803d', 2.4);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 6. CUCKOO_CLOCK (Đồng hồ cúc cu Rừng Đen Kuckucksuhr)
  // -------------------------------------------------------------
  function drawCuckooClock(ctx, s, t) {
    ctx.save();
    const woodDark = '#3d200e', woodMid = '#633314', woodLight = '#9a4e1e', goldCol = '#ca8a04';
    const isOpen = (s.open ?? 0) > 0.1;

    // Hai quả tạ hình quả thông bằng đồng treo lủng lẳng dưới đáy
    line(ctx, [[-10, -22], [-10, -6]], '#78716c', 1.0);
    ellipse(ctx, -10, -6, 3.5, 6, goldCol, INK, 1.0);
    line(ctx, [[10, -22], [10, -8]], '#78716c', 1.0);
    ellipse(ctx, 10, -8, 3.5, 6, goldCol, INK, 1.0);

    // Con lắc quả lắc gỗ đung đưa ở giữa
    const pendSw = Math.sin(t * 3.5) * 6;
    line(ctx, [[0, -22], [pendSw, -14]], woodDark, 1.4);
    ellipse(ctx, pendSw, -14, 5, 5, woodLight, INK, 1.0);

    // Thùng đồng hồ hình ngôi nhà gỗ Rừng Đen chạm khắc
    drawPoly(ctx, [[-20, -22], [20, -22], [18, -64], [-18, -64]], woodMid, INK, 1.6);
    // Mái ngói chạm hoa văn lá cây dốc nhọn
    drawPoly(ctx, [[-26, -62], [26, -62], [0, -84]], woodDark, INK, 1.8);
    drawPoly(ctx, [[-24, -64], [24, -64], [0, -82]], woodLight, null);

    // Mặt đồng hồ tròn ở giữa
    ellipse(ctx, 0, -44, 13, 13, '#1c1917', INK, 1.4);
    ellipse(ctx, 0, -44, 11, 11, woodDark, null);
    // Các vạch giờ tròn nhỏ màu vàng
    for (let a = 0; a < TAU; a += TAU / 12) {
      ellipse(ctx, Math.cos(a) * 8.5, -44 + Math.sin(a) * 8.5, 0.9, 0.9, goldCol, null);
    }
    // Kim đồng hồ bằng đồng
    line(ctx, [[0, -44], [0, -50]], goldCol, 1.6);
    line(ctx, [[0, -44], [4, -44]], goldCol, 1.6);

    // Cửa sổ gác mái nơi chim cúc cu thò ra
    drawPoly(ctx, [[-8, -66], [8, -66], [8, -76], [-8, -76]], '#18181b', INK, 1.0);

    if (isOpen) {
      // Cánh cửa mở hai bên
      path(ctx, `M -8 -66 L -14 -68 L -14 -78 L -8 -76 Z`, woodLight, INK, 0.8);
      path(ctx, `M 8 -66 L 14 -68 L 14 -78 L 8 -76 Z`, woodLight, INK, 0.8);
      // Chú chim cúc cu gỗ nhỏ xinh thò ra phía trước
      ellipse(ctx, 0, -71, 4.5, 3.5, '#0284c7', INK, 0.8);
      // Mỏ vàng mở hót
      path(ctx, `M 4 -71 L 8 -72 L 4 -70 Z`, '#f59e0b', null);
      // Cánh vẫy
      ellipse(ctx, -2, -73, 2.5, 1.5, '#38bdf8', null);
    } else {
      // Hai cánh cửa gỗ đóng kín
      drawPoly(ctx, [[-7, -67], [0, -67], [0, -75], [-7, -75]], woodLight, INK, 0.8);
      drawPoly(ctx, [[0, -67], [7, -67], [7, -75], [0, -75]], woodLight, INK, 0.8);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 7. FOX (Cáo đỏ châu Âu)
  // -------------------------------------------------------------
  function drawFox(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const bodyCol = s.style?.body || '#c2410c';
    const bellyCol = '#fff7ed';
    const darkCol = '#1c1917';

    ctx.save();
    // 4 chân mảnh khảnh có "tất đen" ở cẳng chân
    // 2 chân xa (near = 0)
    for (const [lx, off] of [[-18, 0], [16, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 8;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 6;
      const fx = lx + sw, fy = -lift;
      limb(ctx, [[lx, -24], [fx, fy]], tone(bodyCol, -0.2), 5.0);
      limb(ctx, [[lx * 0.4 + fx * 0.6, -10], [fx, fy]], darkCol, 4.5);
      ellipse(ctx, fx + 1, fy - 1, 3.5, 2, darkCol, null);
    }

    // Đuôi xù dài đặc trưng cong vút lên với chóp đuôi trắng
    const tailWag = Math.sin(t * 4 + stride) * 0.15;
    ctx.save();
    ctx.translate(-26, -26);
    ctx.rotate(0.35 + tailWag);
    // Thân đuôi cam đỏ
    path(ctx, `M 0 0 C -18 -4 -30 -18 -26 -28 C -22 -34 -10 -24 0 -12 Z`, bodyCol, INK, 1.4);
    // Chóp đuôi trắng muốt
    path(ctx, `M -26 -28 C -30 -32 -20 -38 -14 -32 C -18 -30 -22 -28 -26 -28 Z`, bellyCol, INK, 1.0);
    ctx.restore();

    // Thân cáo thuôn mềm mại
    ellipse(ctx, 0, -28, 26, 15, volume(ctx, 0, -28, 26, 15, bodyCol), INK, 1.8);
    // Bụng và yếm ngực lông trắng
    path(ctx, `M -10 -16 C 4 -16 18 -22 22 -32 C 16 -36 4 -28 -10 -22 Z`, bellyCol, null);

    // 2 chân gần (near = 1)
    for (const [lx, off] of [[-10, Math.PI], [22, 0]]) {
      const sw = -Math.sin(stride + off) * walk * 8;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 6;
      const fx = lx + sw, fy = -lift;
      limb(ctx, [[lx, -24], [fx, fy]], bodyCol, 5.5);
      limb(ctx, [[lx * 0.4 + fx * 0.6, -10], [fx, fy]], darkCol, 5.0);
      ellipse(ctx, fx + 1, fy - 1, 4, 2.2, darkCol, null);
    }

    // Đầu cáo tam giác thanh tú
    ctx.save();
    const hx = 26, hy = -44;
    // Cổ nối thân
    limb(ctx, [[14, -32], [hx, hy]], bodyCol, 14);
    path(ctx, `M ${hx - 10} ${hy - 8} Q ${hx + 18} ${hy - 2} ${hx + 24} ${hy} Q ${hx + 14} ${hy + 6} ${hx - 8} ${hy + 6} Z`, bodyCol, INK, 1.5);
    // Má và cằm trắng
    path(ctx, `M ${hx - 4} ${hy + 6} Q ${hx + 14} ${hy + 6} ${hx + 24} ${hy} Q ${hx + 10} ${hy + 1} ${hx - 2} ${hy + 2} Z`, bellyCol, null);

    // Mũi nhọn đen
    ellipse(ctx, hx + 24, hy, 2.2, 2, darkCol, null);

    // Tai nhọn dựng đứng tam giác viền đen
    drawPoly(ctx, [[hx - 2, hy - 6], [hx + 6, hy - 20], [hx + 8, hy - 6]], darkCol, INK, 1.2);
    drawPoly(ctx, [[hx, hy - 6], [hx + 5, hy - 17], [hx + 7, hy - 6]], bellyCol, null);

    // Mắt xếch thông minh
    drawEye(ctx, hx + 8, hy - 3, 3, s.blink || 0, 1, '#b45309');

    ctx.restore();
    ctx.restore();
  }

  // -------------------------------------------------------------
  // 8. OWL (Cú mèo Rừng Đen)
  // -------------------------------------------------------------
  function drawOwl(ctx, s, t) {
    const blink = s.blink || 0;
    const furMain = s.style?.body || '#78350f';
    const furBuff = '#fed7aa';

    ctx.save();
    // Đôi móng vuốt chim cong quặp đậu tại y = 0
    ellipse(ctx, -8, -2, 4.5, 2.5, '#d97706', INK, 1.0);
    ellipse(ctx, 8, -2, 4.5, 2.5, '#d97706', INK, 1.0);

    // Thân cú hình bầu dục đứng múp míp
    ellipse(ctx, 0, -38, 22, 34, volume(ctx, 0, -38, 22, 34, furMain), INK, 1.8);
    // Bụng lông sáng có vân đốm hình chữ V
    ellipse(ctx, 0, -34, 14, 22, furBuff, INK, 1.2);
    for (let y = -46; y <= -20; y += 7) {
      path(ctx, `M -6 ${y} L 0 ${y + 3} L 6 ${y}`, null, furMain, 1.4);
    }

    // Đôi cánh khép hai bên thân
    path(ctx, `M -16 -60 C -28 -48 -26 -22 -14 -12 Z`, tone(furMain, -0.15), INK, 1.4);
    path(ctx, `M 16 -60 C 28 -48 26 -22 14 -12 Z`, tone(furMain, -0.15), INK, 1.4);

    // Đầu to tròn với đĩa mặt đặc trưng (facial disc)
    const hy = -56;
    ellipse(ctx, 0, hy, 21, 17, volume(ctx, 0, hy, 21, 17, furMain), INK, 1.8);

    // Hai vòng đĩa mặt lông nhạt quanh mắt
    ellipse(ctx, -9, hy, 8.5, 10, furBuff, INK, 1.0);
    ellipse(ctx, 9, hy, 8.5, 10, furBuff, INK, 1.0);

    // Hai túm lông tai nhọn (ear tufts) vểnh lên
    path(ctx, `M -15 ${hy - 8} L -18 ${hy - 22} L -8 ${hy - 12} Z`, furMain, INK, 1.2);
    path(ctx, `M 15 ${hy - 8} L 18 ${hy - 22} L 8 ${hy - 12} Z`, furMain, INK, 1.2);

    // Đôi mắt tròn xoe màu vàng hổ phách to tròn
    drawEye(ctx, -9, hy, 5.2, blink, 1, '#f59e0b');
    drawEye(ctx, 9, hy, 5.2, blink, 1, '#f59e0b');

    // Mỏ khoằm nhỏ màu sừng kẹp giữa hai mắt
    path(ctx, `M -2.5 ${hy - 1} Q 0 ${hy + 7} 0 ${hy + 9} Q 0 ${hy + 7} 2.5 ${hy - 1} Z`, '#451a03', INK, 1.0);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 9. DEER (Hươu/Nai rừng)
  // -------------------------------------------------------------
  function drawDeer(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const bodyCol = s.style?.body || '#9a3412';
    const bellyCol = '#ffedd5';
    const hoofCol = '#292524';

    ctx.save();
    // 4 chân thon dài thanh mảnh: 2 chân xa (near = 0)
    for (const [lx, off] of [[-24, 0], [20, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 10;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 8;
      const fx = lx + sw, fy = -lift;
      const kx = lx * 0.6 + fx * 0.4;
      limb(ctx, [[lx, -44], [kx, -22], [fx, fy]], tone(bodyCol, -0.2), 4.5);
      drawPoly(ctx, [[fx - 2.5, fy - 4], [fx + 2.5, fy - 4], [fx + 2, fy], [fx - 2, fy]], hoofCol, INK, 0.8);
    }

    // Đuôi nhỏ ngắn vểnh nhẹ
    path(ctx, `M -34 -48 Q -44 -56 -40 -44 Z`, bodyCol, INK, 1.2);
    ellipse(ctx, -40, -48, 2.5, 4, bellyCol, null);

    // Thân hươu thon thả gọn gàng
    ellipse(ctx, -4, -48, 32, 18, volume(ctx, -4, -48, 32, 18, bodyCol), INK, 1.8);
    // Bụng sáng màu
    ellipse(ctx, -4, -42, 22, 8, bellyCol, null);

    // Vài đốm trắng li ti trên lưng hươu
    for (const [dx, dy] of [[-18, -54], [-10, -56], [-2, -54], [6, -56]]) {
      ellipse(ctx, dx, dy, 1.6, 1.6, '#ffffff', null);
    }

    // 2 chân gần (near = 1)
    for (const [lx, off] of [[-16, Math.PI], [28, 0]]) {
      const sw = -Math.sin(stride + off) * walk * 10;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 8;
      const fx = lx + sw, fy = -lift;
      const kx = lx * 0.6 + fx * 0.4;
      limb(ctx, [[lx, -44], [kx, -22], [fx, fy]], bodyCol, 5.0);
      drawPoly(ctx, [[fx - 2.5, fy - 4], [fx + 2.5, fy - 4], [fx + 2, fy], [fx - 2, fy]], hoofCol, INK, 0.8);
    }

    // Cổ dài thanh thoát vươn cao
    const hx = 34, hy = -86;
    limb(ctx, [[18, -52], [hx - 6, hy + 12]], bodyCol, 12);
    // Đầu hươu
    ellipse(ctx, hx, hy, 12, 8.5, volume(ctx, hx, hy, 12, 8.5, bodyCol), INK, 1.5);
    // Mõm thon
    path(ctx, `M ${hx + 4} ${hy - 4} Q ${hx + 18} ${hy} ${hx + 18} ${hy + 3} Q ${hx + 10} ${hy + 8} ${hx + 2} ${hy + 6} Z`, bodyCol, INK, 1.2);
    ellipse(ctx, hx + 18, hy + 2, 2.2, 2.2, hoofCol, null);

    // Mắt đen tròn hiền lành
    drawEye(ctx, hx + 4, hy - 2, 3.2, s.blink || 0, 1, '#1c1917');

    // Tai lá thon dài
    ellipse(ctx, hx - 8, hy - 8, 4, 9, bodyCol, INK, 1.0, -0.4);
    ellipse(ctx, hx - 8, hy - 8, 2, 6, bellyCol, null, -0.4);

    // Gạc hươu phân nhánh uy nghi
    ctx.save();
    const antlerCol = '#e7e5e4';
    // Gạc nhánh trái
    path(ctx, `M ${hx - 2} ${hy - 6} Q ${hx - 8} ${hy - 24} ${hx - 12} ${hy - 38}`, null, antlerCol, 2.8);
    line(ctx, [[hx - 6, hy - 18], [hx + 2, hy - 26]], antlerCol, 2.0);
    line(ctx, [[hx - 10, hy - 28], [hx - 18, hy - 32]], antlerCol, 2.0);
    // Gạc nhánh phải
    path(ctx, `M ${hx + 2} ${hy - 6} Q ${hx + 8} ${hy - 26} ${hx + 6} ${hy - 40}`, null, antlerCol, 2.8);
    line(ctx, [[hx + 5, hy - 18], [hx + 14, hy - 24]], antlerCol, 2.0);
    line(ctx, [[hx + 7, hy - 28], [hx + 16, hy - 34]], antlerCol, 2.0);
    ctx.restore();

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 10. WOLF (Chó sói xám thân thiện)
  // -------------------------------------------------------------
  function drawWolf(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const bodyCol = s.style?.body || '#64748b';
    const darkFur = '#334155';
    const lightFur = '#e2e8f0';

    ctx.save();
    // 4 chân sói mạnh mẽ: 2 chân xa (near = 0)
    for (const [lx, off] of [[-20, 0], [18, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 9;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 7;
      const fx = lx + sw, fy = -lift;
      limb(ctx, [[lx, -32], [fx, fy]], tone(bodyCol, -0.2), 6.5);
      ellipse(ctx, fx + 1, fy - 1.5, 4.5, 2.5, darkFur, null);
    }

    // Đuôi sói xù rủ xuống
    const tailSw = Math.sin(t * 3) * 0.1;
    path(ctx, `M -30 -34 Q ${-46 + tailSw * 8} -28 ${-44 + tailSw * 8} -14`, null, darkFur, 5.0);
    ellipse(ctx, -44 + tailSw * 8, -12, 4.5, 7, darkFur, null);

    // Thân sói cơ bắp với bờm lưng dốc
    ellipse(ctx, 0, -36, 30, 18, volume(ctx, 0, -36, 30, 18, bodyCol), INK, 1.8);
    // Bụng sáng màu
    path(ctx, `M -14 -22 Q 4 -22 18 -30 Q 8 -26 -14 -22 Z`, lightFur, null);

    // Bờm lông vai xù xì màu sẫm
    for (let i = -1; i <= 3; i++) {
      const mx = i * 7, my = -46 + Math.abs(i) * 2;
      path(ctx, `M ${mx - 4} ${my} L ${mx} ${my - 6} L ${mx + 4} ${my} Z`, darkFur, null);
    }

    // 2 chân gần (near = 1)
    for (const [lx, off] of [[-12, Math.PI], [24, 0]]) {
      const sw = -Math.sin(stride + off) * walk * 9;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 7;
      const fx = lx + sw, fy = -lift;
      limb(ctx, [[lx, -32], [fx, fy]], bodyCol, 7.0);
      ellipse(ctx, fx + 1, fy - 1.5, 5, 3, darkFur, null);
    }

    // Cổ và đầu sói
    const hx = 28, hy = -56;
    limb(ctx, [[14, -40], [hx, hy]], bodyCol, 16);
    // Đầu tam giác
    ellipse(ctx, hx, hy, 14, 12, volume(ctx, hx, hy, 14, 12, bodyCol), INK, 1.6);
    // Mõm dài màu sáng
    path(ctx, `M ${hx + 4} ${hy - 5} Q ${hx + 20} ${hy} ${hx + 22} ${hy + 2} Q ${hx + 12} ${hy + 7} ${hx + 2} ${hy + 5} Z`, lightFur, INK, 1.2);
    ellipse(ctx, hx + 22, hy + 2, 2.5, 2.5, '#0f172a', null);

    // Tai sói hình tam giác dựng đứng
    drawPoly(ctx, [[hx - 4, hy - 8], [hx + 2, hy - 24], [hx + 7, hy - 8]], darkFur, INK, 1.2);
    drawPoly(ctx, [[hx - 2, hy - 8], [hx + 2, hy - 20], [hx + 5, hy - 8]], lightFur, null);

    // Mắt hổ phách thông minh, hiền hậu
    drawEye(ctx, hx + 6, hy - 3, 3.2, s.blink || 0, 1, '#d97706');

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 11. STORK (Cò trắng châu Âu)
  // -------------------------------------------------------------
  function drawStork(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const redCol = '#dc2626';

    ctx.save();
    // Đôi chân khẳng khiu màu đỏ san hô: 2 chân chạm y = 0
    for (const [lx, off] of [[-6, 0], [8, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 8;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 8;
      const fx = lx + sw, fy = -lift;
      const kx = lx * 0.7 + fx * 0.3;
      // Khớp gối và cẳng chân
      limb(ctx, [[lx, -38], [kx, -18], [fx, fy]], redCol, 3.0);
      // 3 ngón chân xòe bám đất
      line(ctx, [[fx, fy], [fx + 6, fy]], redCol, 1.8);
      line(ctx, [[fx, fy], [fx - 4, fy]], redCol, 1.6);
      line(ctx, [[fx, fy], [fx + 4, fy - 2]], redCol, 1.6);
    }

    // Đuôi lông cánh đen bóng ở phía sau thân
    path(ctx, `M -14 -46 L -28 -40 L -22 -52 Z`, '#0f172a', INK, 1.2);

    // Thân cò hình trứng trắng tinh
    ellipse(ctx, 0, -48, 18, 14, '#ffffff', INK, 1.6);
    // Cánh khép với viền lông đen đặc trưng
    path(ctx, `M -8 -58 C 8 -58 14 -44 4 -38 C -6 -36 -16 -44 -8 -58 Z`, '#ffffff', INK, 1.2);
    path(ctx, `M -4 -42 L -18 -42 L -12 -38 Z`, '#0f172a', null);

    // Cổ dài uốn cong thanh nhã
    const hx = 22, hy = -86;
    path(ctx, `M 8 -56 Q 18 -68 18 -82 L ${hx} ${hy}`, null, '#ffffff', 8.5);
    path(ctx, `M 8 -56 Q 18 -68 18 -82 L ${hx} ${hy}`, null, INK, 1.2);

    // Đầu cò nhỏ
    ellipse(ctx, hx, hy, 7, 6, '#ffffff', INK, 1.2);

    // Mắt tròn đen có viền đỏ
    ellipse(ctx, hx + 1, hy - 1, 2, 2, '#0f172a', null);

    // Mỏ thẳng nhọn dài màu đỏ san hô đặc trưng
    drawPoly(ctx, [[hx + 5, hy - 2], [hx + 28, hy - 1], [hx + 5, hy + 2]], redCol, INK, 1.2);
    line(ctx, [[hx + 5, hy], [hx + 26, hy]], '#991b1b', 0.8);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 12. WILD_BOAR (Heo rừng)
  // -------------------------------------------------------------
  function drawWildBoar(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const bodyCol = s.style?.body || '#451a03';
    const darkMane = '#1c1917';
    const hoofCol = '#1f2937';

    ctx.save();
    // 4 chân ngắn to khỏe: 2 chân xa (near = 0)
    for (const [lx, off] of [[-18, 0], [16, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 6;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 5;
      const fx = lx + sw, fy = -lift;
      limb(ctx, [[lx, -24], [fx, fy]], tone(bodyCol, -0.2), 7.0);
      drawPoly(ctx, [[fx - 3, fy - 3], [fx + 3, fy - 3], [fx + 2.5, fy], [fx - 2.5, fy]], hoofCol, INK, 0.8);
    }

    // Đuôi ngắn có chùm lông ở chóp
    path(ctx, `M -26 -32 Q -36 -28 -34 -18`, null, bodyCol, 2.5);
    ellipse(ctx, -34, -16, 2.5, 4, darkMane, null);

    // Thân heo rừng vạm vỡ: vai gồ cao hơn mông
    path(ctx, `M -26 -26 C -30 -44 -12 -54 8 -56 C 24 -56 30 -44 26 -26 C 24 -16 6 -16 -8 -16 C -18 -16 -24 -20 -26 -26 Z`, volume(ctx, 2, -36, 28, 20, bodyCol), INK, 1.8);

    // Bờm lông cứng sẫm màu chạy dọc từ đỉnh đầu qua vai
    for (let x = -8; x <= 22; x += 5) {
      const my = -54 + Math.sin((x - 8) * 0.1) * 2;
      path(ctx, `M ${x - 3} ${my} L ${x} ${my - 8} L ${x + 3} ${my} Z`, darkMane, null);
    }

    // 2 chân gần (near = 1)
    for (const [lx, off] of [[-10, Math.PI], [24, 0]]) {
      const sw = -Math.sin(stride + off) * walk * 6;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 5;
      const fx = lx + sw, fy = -lift;
      limb(ctx, [[lx, -24], [fx, fy]], bodyCol, 7.5);
      drawPoly(ctx, [[fx - 3, fy - 3], [fx + 3, fy - 3], [fx + 2.5, fy], [fx - 2.5, fy]], hoofCol, INK, 0.8);
    }

    // Đầu hình nêm vát nhọn chắc nịch
    const hx = 24, hy = -42;
    path(ctx, `M ${hx - 6} ${hy - 12} Q ${hx + 18} ${hy - 2} ${hx + 24} ${hy} Q ${hx + 16} ${hy + 10} ${hx - 4} ${hy + 8} Z`, bodyCol, INK, 1.6);

    // Mõm tròn bọc sụn
    ellipse(ctx, hx + 24, hy + 2, 4.5, 6, '#292524', INK, 1.2);
    // Hai lỗ mũi
    ellipse(ctx, hx + 24, hy + 0.5, 1.2, 1.8, '#111827', null);
    ellipse(ctx, hx + 24, hy + 3.5, 1.2, 1.8, '#111827', null);

    // Răng nanh trắng nhọn chìa ngược lên từ hàm dưới
    path(ctx, `M ${hx + 16} ${hy + 6} Q ${hx + 19} ${hy - 1} ${hx + 20} ${hy - 4} Q ${hx + 17} ${hy + 2} ${hx + 14} ${hy + 6} Z`, '#f8fafc', INK, 0.8);

    // Tai nhỏ phủ lông
    ellipse(ctx, hx - 2, hy - 12, 4, 7, darkMane, INK, 1.0, -0.3);

    // Mắt nhỏ hạt tiêu
    drawEye(ctx, hx + 6, hy - 4, 2.5, s.blink || 0, 1, '#1c1917');

    ctx.restore();
  }

  // -------------------------------------------------------------
  // HÌNH NỀN GIAI ĐOẠN P (4 HÌNH NỀN)
  // -------------------------------------------------------------

  // 1. BLACK_FOREST_VILLAGE (Làng Rừng Đen nhà khung gỗ)
  function drawBlackForestVillage(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings.night || settings.time === 'night');
    const groundY = settings.ground_y || 810;

    // Bầu trời
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(1, '#0f172a');
    } else {
      sky.addColorStop(0, '#7dd3fc');
      sky.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(x0, 0, x1 - x0, groundY * 0.65);

    // Trăng sao đêm
    if (isNight) {
      ellipse(ctx, 480, 120, 24, 24, '#fef08a', null);
      ellipse(ctx, 472, 116, 22, 22, '#020617', null);
      for (let i = 0; i < 24; i++) {
        ellipse(ctx, (i * 73) % 560 + 10, (i * 47) % 220 + 20, 1.2, 1.2, '#ffffff', null);
      }
      if (x0 < 0) {
        for (let i = 0; i < 24; i++) {
          const sx = x0 + ((i * 73) % Math.abs(x0));
          ellipse(ctx, sx, (i * 47) % 220 + 20, 1.2, 1.2, '#ffffff', null);
        }
      }
      if (x1 > PANEL) {
        for (let i = 0; i < 24; i++) {
          const sx = PANEL + ((i * 73) % (x1 - PANEL));
          ellipse(ctx, sx, (i * 47) % 220 + 20, 1.2, 1.2, '#ffffff', null);
        }
      }
    }

    // Dãy núi và rừng thông Rừng Đen (Schwarzwald) bạt ngàn phía xa
    const pineFar = isNight ? '#061717' : '#14382e';
    const pineMid = isNight ? '#0b2621' : '#1c4d3e';

    // Lớp thông xa
    if (x0 < -20) {
      for (let x = -38; x >= x0 - 18; x -= 18) {
        const ph = 120 + Math.sin(x * 0.02) * 35;
        drawPoly(ctx, [[x - 14, groundY * 0.62], [x + 14, groundY * 0.62], [x, groundY * 0.62 - ph]], pineFar, null);
      }
    }
    for (let x = -20; x <= 600; x += 18) {
      const ph = 120 + Math.sin(x * 0.02) * 35;
      drawPoly(ctx, [[x - 14, groundY * 0.62], [x + 14, groundY * 0.62], [x, groundY * 0.62 - ph]], pineFar, null);
    }
    if (x1 > 600) {
      for (let x = 618; x <= x1 + 18; x += 18) {
        const ph = 120 + Math.sin(x * 0.02) * 35;
        drawPoly(ctx, [[x - 14, groundY * 0.62], [x + 14, groundY * 0.62], [x, groundY * 0.62 - ph]], pineFar, null);
      }
    }

    // Lớp thông trung
    if (x0 < -10) {
      for (let x = -36; x >= x0 - 26; x -= 26) {
        const ph = 90 + Math.cos(x * 0.03) * 25;
        drawPoly(ctx, [[x - 18, groundY * 0.65], [x + 18, groundY * 0.65], [x, groundY * 0.65 - ph]], pineMid, null);
      }
    }
    for (let x = -10; x <= 590; x += 26) {
      const ph = 90 + Math.cos(x * 0.03) * 25;
      drawPoly(ctx, [[x - 18, groundY * 0.65], [x + 18, groundY * 0.65], [x, groundY * 0.65 - ph]], pineMid, null);
    }
    if (x1 > 590) {
      for (let x = 616; x <= x1 + 26; x += 26) {
        const ph = 90 + Math.cos(x * 0.03) * 25;
        drawPoly(ctx, [[x - 18, groundY * 0.65], [x + 18, groundY * 0.65], [x, groundY * 0.65 - ph]], pineMid, null);
      }
    }

    // Dãy nhà khung gỗ lộ (Fachwerkhaus) truyền thống nước Đức
    const drawHouse = (hx, i) => {
      const hw = 165;
      const hh = 300 + (Math.abs(i) % 2) * 30;
      const wallBaseY = groundY * 0.65;
      const wallTopY = wallBaseY - hh * 0.58;
      const roofPeakY = wallBaseY - hh;
      const plasterCol = isNight ? '#1e293b' : '#fefce8';
      const beamCol = isNight ? '#0f172a' : '#3d200e';
      const roofCol = isNight ? '#090d16' : (Math.abs(i) % 3 === 1 ? '#854d0e' : '#991b1b');

      // Tường vách thạch cao trắng ngà
      drawPoly(ctx, [[hx, wallBaseY], [hx + hw, wallBaseY], [hx + hw, wallTopY], [hx, wallTopY]], plasterCol, INK, 1.5);
      // Đầu hồi nhà tam giác
      drawPoly(ctx, [[hx - 6, wallTopY], [hx + hw + 6, wallTopY], [hx + hw * 0.5, roofPeakY]], roofCol, INK, 2.0);

      // Khung dầm gỗ sồi đen lộ (Fachwerk beams): thanh ngang, thanh đứng và chữ X chéo
      line(ctx, [[hx, wallBaseY], [hx + hw, wallBaseY]], beamCol, 3.5);
      line(ctx, [[hx, wallTopY], [hx + hw, wallTopY]], beamCol, 3.5);
      line(ctx, [[hx + hw * 0.5, wallBaseY], [hx + hw * 0.5, wallTopY]], beamCol, 3.0);
      line(ctx, [[hx, wallBaseY], [hx + hw * 0.5, wallTopY]], beamCol, 2.5);
      line(ctx, [[hx + hw * 0.5, wallBaseY], [hx, wallTopY]], beamCol, 2.5);
      line(ctx, [[hx + hw * 0.5, wallBaseY], [hx + hw, wallTopY]], beamCol, 2.5);
      line(ctx, [[hx + hw, wallBaseY], [hx + hw * 0.5, wallTopY]], beamCol, 2.5);

      // Cửa sổ chia ô kính ấm cúng
      const winY = (wallBaseY + wallTopY) * 0.5;
      for (const wx of [hx + hw * 0.25, hx + hw * 0.75]) {
        drawPoly(ctx, [[wx - 14, winY - 12], [wx + 14, winY - 12], [wx + 14, winY + 12], [wx - 14, winY + 12]], isNight ? '#fef08a' : '#e0f2fe', INK, 1.2);
        line(ctx, [[wx, winY - 12], [wx, winY + 12]], beamCol, 1.2);
        line(ctx, [[wx - 14, winY], [wx + 14, winY]], beamCol, 1.2);
      }
    };

    if (x0 < 0) {
      for (let hx = 15 - 190, idx = -1; hx + 165 >= x0; hx -= 190, idx--) {
        drawHouse(hx, idx);
      }
    }
    for (let i = 0; i < 3; i++) {
      drawHouse(i * 190 + 15, i);
    }
    if (x1 > PANEL) {
      for (let hx = 15 + 3 * 190, idx = 3; hx <= x1; hx += 190, idx++) {
        drawHouse(hx, idx);
      }
    }

    // Mặt đường lát đá cuội và lối đi làng quê
    const ground = ctx.createLinearGradient(0, groundY * 0.65, 0, 1024);
    ground.addColorStop(0, isNight ? '#1e293b' : '#78716c');
    ground.addColorStop(1, isNight ? '#0f172a' : '#57534e');
    ctx.fillStyle = ground;
    ctx.fillRect(x0, groundY * 0.65, x1 - x0, 1024 - groundY * 0.65);

    // Họa tiết đá cuội tròn lát đường
    for (let r = 0; r < 12; r++) {
      const ry = groundY * 0.68 + r * 28;
      const xOff = (r % 2) * 16;
      if (x0 < 0) {
        for (let rx = xOff - 32; rx >= x0; rx -= 32) {
          ellipse(ctx, rx, ry, 13, 6, isNight ? '#0f172a' : '#a8a29e', null);
        }
      }
      for (let rx = xOff; rx < 576; rx += 32) {
        ellipse(ctx, rx, ry, 13, 6, isNight ? '#0f172a' : '#a8a29e', null);
      }
      if (x1 > 576) {
        for (let rx = xOff + Math.ceil((576 - xOff) / 32) * 32; rx <= x1; rx += 32) {
          ellipse(ctx, rx, ry, 13, 6, isNight ? '#0f172a' : '#a8a29e', null);
        }
      }
    }
  }

  // 2. CHRISTMAS_MARKET (Chợ Giáng sinh lung linh)
  function drawChristmasMarket(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings.night || settings.time === 'night');
    const groundY = settings.ground_y || 810;

    // Trời đêm xanh tím đậm ấm cúng
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.62);
    sky.addColorStop(0, isNight ? '#090d16' : '#1e1b4b');
    sky.addColorStop(1, isNight ? '#1e1b4b' : '#312e81');
    ctx.fillStyle = sky;
    ctx.fillRect(x0, 0, x1 - x0, groundY * 0.62);

    // Bụi tuyết rơi nhẹ lấp lánh trong đêm
    for (let i = 0; i < 36; i++) {
      const sx = (i * 43 + t * 15) % 576;
      const sy = (i * 29 + t * 45) % (groundY * 0.6);
      ellipse(ctx, sx, sy, 1.5, 1.5, '#ffffff', null);
    }
    if (x0 < 0) {
      for (let i = 0; i < 36; i++) {
        const sx = x0 + ((i * 43 + t * 15) % Math.abs(x0));
        const sy = (i * 29 + t * 45) % (groundY * 0.6);
        ellipse(ctx, sx, sy, 1.5, 1.5, '#ffffff', null);
      }
    }
    if (x1 > PANEL) {
      for (let i = 0; i < 36; i++) {
        const sx = PANEL + ((i * 43 + t * 15) % (x1 - PANEL));
        const sy = (i * 29 + t * 45) % (groundY * 0.6);
        ellipse(ctx, sx, sy, 1.5, 1.5, '#ffffff', null);
      }
    }

    // Bóng toà thị chính / nhà thờ cổ kính phía sau mờ ảo
    const townHall = '#0f172a';
    if (x0 < 0) {
      drawPoly(ctx, [[x0, groundY * 0.62], [100, groundY * 0.62], [100, 180], [x0, 180]], '#0c1220', null);
      drawPoly(ctx, [[x0 + 40, 180], [x0 + 80, 180], [x0 + 60, 40]], '#0c1220', null);
    }
    drawPoly(ctx, [[140, groundY * 0.62], [436, groundY * 0.62], [436, 140], [288, 60], [140, 140]], townHall, null);
    // Tháp chuông nhọn
    drawPoly(ctx, [[264, 60], [312, 60], [288, -20]], townHall, null);
    if (x1 > PANEL) {
      drawPoly(ctx, [[PANEL, groundY * 0.62], [x1, groundY * 0.62], [x1, 190], [PANEL, 190]], '#0c1220', null);
      drawPoly(ctx, [[x1 - 80, 190], [x1 - 40, 190], [x1 - 60, 50]], '#0c1220', null);
    }

    // Hàng quầy gỗ chợ Giáng sinh giăng hàng ngang
    const drawStall = (sx) => {
      const sw = 135;
      const baseTopY = groundY * 0.62 - 110;
      // Thùng quầy gỗ
      drawPoly(ctx, [[sx, groundY * 0.62], [sx + sw, groundY * 0.62], [sx + sw, baseTopY + 35], [sx, baseTopY + 35]], '#451a03', INK, 1.4);
      // Mái bạt sọc đỏ trắng
      drawPoly(ctx, [[sx - 4, baseTopY + 35], [sx + sw + 4, baseTopY + 35], [sx + sw * 0.5, baseTopY]], '#7f1d1d', INK, 1.6);
      // Rèm lượn sóng viền mái
      for (let x = sx; x <= sx + sw; x += 10) {
        ellipse(ctx, x, baseTopY + 35, 4, 3, '#fef2f2', null);
      }
    };

    if (x0 < 0) {
      for (let sx = 5 - 145; sx + 135 >= x0; sx -= 145) {
        drawStall(sx);
      }
    }
    for (let i = 0; i < 4; i++) {
      drawStall(i * 145 + 5);
    }
    if (x1 > PANEL) {
      for (let sx = 5 + 4 * 145; sx <= x1; sx += 145) {
        drawStall(sx);
      }
    }

    // Các dây đèn vàng ấm áp giăng ngang bầu trời giữa các quầy
    path(ctx, `M 0 180 Q 288 260 576 180`, null, '#78716c', 1.2);
    path(ctx, `M 0 240 Q 288 320 576 240`, null, '#78716c', 1.2);
    for (let i = 0; i < 18; i++) {
      const u = i / 17;
      const lx = u * 576;
      const ly = 180 + Math.sin(u * Math.PI) * 80;
      ellipse(ctx, lx, ly, 3.5, 4.5, '#fef08a', null);
      ellipse(ctx, lx, ly, 10, 10, 'rgba(254, 240, 138, 0.35)', null);
    }
    if (x0 < 0) {
      path(ctx, `M ${x0} 180 Q ${x0 * 0.5} 240 0 180`, null, '#78716c', 1.2);
      for (let i = 0; i < 8; i++) {
        const u = i / 7;
        const lx = x0 + u * (-x0);
        const ly = 180 + Math.sin(u * Math.PI) * 60;
        ellipse(ctx, lx, ly, 3.5, 4.5, '#fef08a', null);
        ellipse(ctx, lx, ly, 10, 10, 'rgba(254, 240, 138, 0.35)', null);
      }
    }
    if (x1 > PANEL) {
      path(ctx, `M ${PANEL} 180 Q ${(PANEL + x1) * 0.5} 240 ${x1} 180`, null, '#78716c', 1.2);
      for (let i = 0; i < 8; i++) {
        const u = i / 7;
        const lx = PANEL + u * (x1 - PANEL);
        const ly = 180 + Math.sin(u * Math.PI) * 60;
        ellipse(ctx, lx, ly, 3.5, 4.5, '#fef08a', null);
        ellipse(ctx, lx, ly, 10, 10, 'rgba(254, 240, 138, 0.35)', null);
      }
    }

    // Mặt đất tuyết phủ trên đá cuội ấm áp
    const ground = ctx.createLinearGradient(0, groundY * 0.62, 0, 1024);
    ground.addColorStop(0, '#334155');
    ground.addColorStop(1, '#1e293b');
    ctx.fillStyle = ground;
    ctx.fillRect(x0, groundY * 0.62, x1 - x0, 1024 - groundY * 0.62);

    // Mảng tuyết trắng xốp đọng lại thành gờ
    if (x0 < 0) {
      ellipse(ctx, x0 + 120, groundY * 0.75, 140, 16, '#cbd5e1', null);
    }
    ellipse(ctx, 288, groundY * 0.7, 240, 18, '#e2e8f0', null);
    ellipse(ctx, 160, groundY * 0.85, 180, 16, '#cbd5e1', null);
    ellipse(ctx, 420, groundY * 0.88, 160, 15, '#cbd5e1', null);
    if (x1 > PANEL) {
      ellipse(ctx, PANEL + 140, groundY * 0.78, 150, 16, '#cbd5e1', null);
    }
  }

  // 3. ALLOTMENT_GARDEN (Vườn thuê Schrebergarten Đức)
  function drawAllotmentGarden(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings.night || settings.time === 'night');
    const groundY = settings.ground_y || 810;

    // Trời xanh ngắt
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(1, '#0f172a');
    } else {
      sky.addColorStop(0, '#60a5fa');
      sky.addColorStop(1, '#dbeafe');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(x0, 0, x1 - x0, groundY * 0.65);

    // Đám mây trắng xốp
    if (!isNight) {
      if (x0 < -120) {
        ellipse(ctx, x0 + 140, 110, 50, 22, '#ffffff', null);
      }
      ellipse(ctx, 140, 100, 55, 24, '#ffffff', null);
      ellipse(ctx, 175, 90, 40, 22, '#ffffff', null);
      ellipse(ctx, 420, 140, 65, 26, '#ffffff', null);
      if (x1 > PANEL + 120) {
        ellipse(ctx, PANEL + 140, 120, 55, 24, '#ffffff', null);
      }
    }

    // Hàng rào cây xanh và tán cây ăn quả xa xa
    if (x0 < -20) {
      for (let x = -65; x >= x0 - 40; x -= 45) {
        ellipse(ctx, x, groundY * 0.64, 38, 48, isNight ? '#064e3b' : '#15803d', null);
      }
    }
    for (let x = -20; x <= 600; x += 45) {
      ellipse(ctx, x, groundY * 0.64, 38, 48, isNight ? '#064e3b' : '#15803d', null);
    }
    if (x1 > 600) {
      for (let x = 645; x <= x1 + 40; x += 45) {
        ellipse(ctx, x, groundY * 0.64, 38, 48, isNight ? '#064e3b' : '#15803d', null);
      }
    }

    // Nhà chòi vườn gỗ nhỏ (Gartenlaube) xinh xắn bên phải
    const shedX = 350, shedW = 190, shedBaseY = groundY * 0.66, shedH = 180;
    const woodCol = isNight ? '#1e293b' : '#15803d'; // Sơn xanh lá truyền thống
    const roofCol = isNight ? '#0f172a' : '#7f1d1d';

    drawPoly(ctx, [[shedX, shedBaseY], [shedX + shedW, shedBaseY], [shedX + shedW, shedBaseY - shedH * 0.6], [shedX, shedBaseY - shedH * 0.6]], woodCol, INK, 1.6);
    drawPoly(ctx, [[shedX - 10, shedBaseY - shedH * 0.6], [shedX + shedW + 10, shedBaseY - shedH * 0.6], [shedX + shedW * 0.5, shedBaseY - shedH]], roofCol, INK, 1.8);
    // Cửa sổ có chậu hoa nhỏ
    drawPoly(ctx, [[shedX + 40, shedBaseY - 65], [shedX + 80, shedBaseY - 65], [shedX + 80, shedBaseY - 30], [shedX + 40, shedBaseY - 30]], isNight ? '#fef08a' : '#ffffff', INK, 1.2);
    // Hộp hoa dưới bậu cửa
    drawPoly(ctx, [[shedX + 36, shedBaseY - 30], [shedX + 84, shedBaseY - 30], [shedX + 80, shedBaseY - 22], [shedX + 40, shedBaseY - 22]], '#78350f', INK, 1.0);
    for (let fx = shedX + 44; fx <= shedX + 76; fx += 8) {
      ellipse(ctx, fx, shedBaseY - 32, 3, 3, '#ef4444', null);
    }

    // Hàng rào cọc gỗ trắng thấp (Jägerzaun / Picket fence)
    const drawPicket = (x) => {
      path(ctx, `M ${x - 3} ${groundY * 0.66} L ${x - 3} ${groundY * 0.66 - 28} L ${x} ${groundY * 0.66 - 32} L ${x + 3} ${groundY * 0.66 - 28} L ${x + 3} ${groundY * 0.66} Z`, '#f8fafc', INK, 1.0);
    };

    if (x0 < 0) {
      line(ctx, [[x0, groundY * 0.66], [0, groundY * 0.66]], '#a8a29e', 2.0);
      for (let x = 10 - 18; x >= x0; x -= 18) {
        drawPicket(x);
      }
    }
    line(ctx, [[0, groundY * 0.66], [shedX, groundY * 0.66]], '#a8a29e', 2.0);
    for (let x = 10; x < shedX; x += 18) {
      drawPicket(x);
    }
    if (x1 > PANEL) {
      line(ctx, [[shedX + shedW, groundY * 0.66], [x1, groundY * 0.66]], '#a8a29e', 2.0);
      for (let x = shedX + shedW + 18; x <= x1; x += 18) {
        drawPicket(x);
      }
    }

    // Mặt đất vườn màu mỡ: luống đất trồng rau màu nâu sẫm
    const ground = ctx.createLinearGradient(0, groundY * 0.66, 0, 1024);
    ground.addColorStop(0, isNight ? '#1e293b' : '#451a03');
    ground.addColorStop(1, isNight ? '#0f172a' : '#291102');
    ctx.fillStyle = ground;
    ctx.fillRect(x0, groundY * 0.66, x1 - x0, 1024 - groundY * 0.66);

    // Luống trồng rau với viền gỗ nâng cao (raised garden bed)
    if (x0 < -180) {
      drawPoly(ctx, [[x0 + 40, groundY * 0.78], [-20, groundY * 0.78], [-40, groundY * 0.93], [x0 + 60, groundY * 0.93]], isNight ? '#1e293b' : '#542305', INK, 1.4);
    }
    drawPoly(ctx, [[40, groundY * 0.76], [536, groundY * 0.76], [516, groundY * 0.95], [60, groundY * 0.95]], isNight ? '#1e293b' : '#542305', INK, 1.4);
    // Luống đất vun gờ
    for (let r = 0; r < 3; r++) {
      const ly = groundY * 0.8 + r * 35;
      ellipse(ctx, 288, ly, 220, 10, isNight ? '#0f172a' : '#3d1802', null);
    }
    if (x1 > PANEL + 180) {
      drawPoly(ctx, [[PANEL + 20, groundY * 0.78], [x1 - 40, groundY * 0.78], [x1 - 60, groundY * 0.93], [PANEL + 40, groundY * 0.93]], isNight ? '#1e293b' : '#542305', INK, 1.4);
    }
  }

  // 4. ALPINE_MEADOW (Đồng cỏ núi cao Alpine thanh bình)
  function drawAlpineMeadow(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings.night || settings.time === 'night');
    const groundY = settings.ground_y || 810;

    // Trời xanh cao nguyên trong vắt
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.55);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(1, '#0f172a');
    } else {
      sky.addColorStop(0, '#38bdf8');
      sky.addColorStop(1, '#bae6fd');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(x0, 0, x1 - x0, groundY * 0.55);

    // Những đỉnh núi tuyết dãy Alps hùng vĩ cao chót vót phía chân trời
    const mountainRock = isNight ? '#1e293b' : '#64748b';
    const snowCol = '#f8fafc';

    if (x0 < 0) {
      drawPoly(ctx, [[x0 - 50, groundY * 0.55], [60, groundY * 0.55], [x0 * 0.5, 80]], mountainRock, null);
      drawPoly(ctx, [[x0 * 0.5 - 30, 150], [x0 * 0.5 + 30, 150], [x0 * 0.5, 80]], snowCol, null);
    }
    // Đỉnh 1 (trái)
    drawPoly(ctx, [[-40, groundY * 0.55], [160, groundY * 0.55], [60, 90]], mountainRock, null);
    drawPoly(ctx, [[30, 160], [90, 160], [60, 90]], snowCol, null);
    // Đỉnh 2 (giữa - cao nhất)
    drawPoly(ctx, [[80, groundY * 0.55], [380, groundY * 0.55], [230, 50]], mountainRock, null);
    drawPoly(ctx, [[180, 140], [280, 140], [230, 50]], snowCol, null);
    // Đỉnh 3 (phải)
    drawPoly(ctx, [[280, groundY * 0.55], [590, groundY * 0.55], [440, 110]], mountainRock, null);
    drawPoly(ctx, [[390, 175], [490, 175], [440, 110]], snowCol, null);
    if (x1 > PANEL) {
      drawPoly(ctx, [[500, groundY * 0.55], [x1 + 60, groundY * 0.55], [PANEL + (x1 - PANEL) * 0.5, 75]], mountainRock, null);
      drawPoly(ctx, [[PANEL + (x1 - PANEL) * 0.5 - 35, 145], [PANEL + (x1 - PANEL) * 0.5 + 35, 145], [PANEL + (x1 - PANEL) * 0.5, 75]], snowCol, null);
    }

    // Đồng cỏ dốc màu xanh ngọc bích trải dài
    const pasture = ctx.createLinearGradient(0, groundY * 0.55, 0, 1024);
    pasture.addColorStop(0, isNight ? '#064e3b' : '#15803d');
    pasture.addColorStop(1, isNight ? '#022c22' : '#166534');
    ctx.fillStyle = pasture;
    ctx.fillRect(x0, groundY * 0.55, x1 - x0, 1024 - groundY * 0.55);

    // Những đợt đồi cỏ nhấp nhô
    if (x0 < -40) {
      path(ctx, `M ${x0} ${groundY * 0.55} Q ${(x0 - 40) * 0.5} ${groundY * 0.58} -40 ${groundY * 0.55} L -40 1024 L ${x0} 1024 Z`, isNight ? '#065f46' : '#16a34a', null);
    }
    path(ctx, `M -40 ${groundY * 0.55} Q 180 ${groundY * 0.5} 360 ${groundY * 0.58} Q 480 ${groundY * 0.62} 600 ${groundY * 0.55} L 600 1024 L -40 1024 Z`, isNight ? '#065f46' : '#16a34a', null);
    if (x1 > 600) {
      path(ctx, `M 600 ${groundY * 0.55} Q ${(600 + x1) * 0.5} ${groundY * 0.58} ${x1} ${groundY * 0.55} L ${x1} 1024 L 600 1024 Z`, isNight ? '#065f46' : '#16a34a', null);
    }

    // Ngôi nhà gỗ trên núi (Alpine Almhütte / Chalet) xa xa trên sườn đồi
    const hutX = 70, hutY = groundY * 0.56;
    drawPoly(ctx, [[hutX, hutY], [hutX + 50, hutY], [hutX + 50, hutY - 26], [hutX, hutY - 26]], '#451a03', null);
    drawPoly(ctx, [[hutX - 5, hutY - 26], [hutX + 55, hutY - 26], [hutX + 25, hutY - 42]], '#78350f', null);

    // Hàng rào gỗ thanh giằng chéo (rustic post and rail fence)
    if (x0 < 0) {
      line(ctx, [[x0, groundY * 0.74], [0, groundY * 0.74]], '#78350f', 3.0);
      line(ctx, [[x0, groundY * 0.78], [0, groundY * 0.78]], '#78350f', 3.0);
      for (let x = 30 - 75; x >= x0; x -= 75) {
        line(ctx, [[x, groundY * 0.82], [x, groundY * 0.68]], '#451a03', 4.5);
      }
    }
    line(ctx, [[0, groundY * 0.74], [576, groundY * 0.72]], '#78350f', 3.0);
    line(ctx, [[0, groundY * 0.78], [576, groundY * 0.76]], '#78350f', 3.0);
    for (let x = 30; x < 576; x += 75) {
      line(ctx, [[x, groundY * 0.82], [x, groundY * 0.68]], '#451a03', 4.5);
    }
    if (x1 > 576) {
      line(ctx, [[576, groundY * 0.72], [x1, groundY * 0.72]], '#78350f', 3.0);
      line(ctx, [[576, groundY * 0.76], [x1, groundY * 0.76]], '#78350f', 3.0);
      for (let x = 30 + 8 * 75; x <= x1; x += 75) {
        line(ctx, [[x, groundY * 0.82], [x, groundY * 0.68]], '#451a03', 4.5);
      }
    }

    // Những cụm hoa dại vùng núi Alps (hoa gentian xanh biếc, hoa nhung tuyết edelweiss trắng)
    if (x0 < 0) {
      const leftFlowers = [
        [x0 + 60, groundY * 0.84, '#2563eb'], [x0 + 140, groundY * 0.88, '#ffffff'], [x0 + 210, groundY * 0.85, '#fde047']
      ];
      for (const [fx, fy, col] of leftFlowers) {
        ellipse(ctx, fx, fy, 3.5, 3.5, col, null);
        ellipse(ctx, fx, fy, 1.2, 1.2, '#f59e0b', null);
      }
    }
    const flowers = [
      [40, groundY * 0.84, '#2563eb'], [120, groundY * 0.89, '#fde047'], [190, groundY * 0.82, '#ffffff'],
      [270, groundY * 0.87, '#2563eb'], [340, groundY * 0.83, '#ffffff'], [420, groundY * 0.88, '#fde047'],
      [490, groundY * 0.85, '#2563eb'], [530, groundY * 0.9, '#ffffff']
    ];
    for (const [fx, fy, col] of flowers) {
      ellipse(ctx, fx, fy, 3.5, 3.5, col, null);
      ellipse(ctx, fx, fy, 1.2, 1.2, '#f59e0b', null);
    }
    if (x1 > PANEL) {
      const rightFlowers = [
        [PANEL + 60, groundY * 0.86, '#ffffff'], [PANEL + 130, groundY * 0.83, '#2563eb'], [PANEL + 200, groundY * 0.89, '#fde047']
      ];
      for (const [fx, fy, col] of rightFlowers) {
        ellipse(ctx, fx, fy, 3.5, 3.5, col, null);
        ellipse(ctx, fx, fy, 1.2, 1.2, '#f59e0b', null);
      }
    }
  }

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  const DE_CULTURE_RIGS = {
    schultuete: {
      draw(ctx, s, t) { drawSchultuete(ctx, s, t); }
    },
    advent_wreath: {
      draw(ctx, s, t) { drawAdventWreath(ctx, s, t); }
    },
    christmas_tree_decor: {
      draw(ctx, s, t) { drawChristmasTreeDecor(ctx, s, t); }
    },
    gingerbread_house: {
      draw(ctx, s, t) { drawGingerbreadHouse(ctx, s, t); }
    },
    market_stall: {
      draw(ctx, s, t) { drawMarketStall(ctx, s, t); }
    },
    cuckoo_clock: {
      draw(ctx, s, t) { drawCuckooClock(ctx, s, t); }
    },
    fox: {
      draw(ctx, s, t) { drawFox(ctx, s, t); }
    },
    owl: {
      draw(ctx, s, t) { drawOwl(ctx, s, t); }
    },
    deer: {
      draw(ctx, s, t) { drawDeer(ctx, s, t); }
    },
    wolf: {
      draw(ctx, s, t) { drawWolf(ctx, s, t); }
    },
    stork: {
      draw(ctx, s, t) { drawStork(ctx, s, t); }
    },
    wild_boar: {
      draw(ctx, s, t) { drawWildBoar(ctx, s, t); }
    }
  };

  const DE_CULTURE_BACKGROUNDS = {
    black_forest_village: {
      label: 'Làng Rừng Đen',
      theme: 'home',
      ground_y: 810,
      draw(ctx, settings, t) { drawBlackForestVillage(ctx, settings, t); }
    },
    christmas_market: {
      label: 'Chợ Giáng sinh',
      theme: 'market',
      ground_y: 810,
      draw(ctx, settings, t) { drawChristmasMarket(ctx, settings, t); }
    },
    allotment_garden: {
      label: 'Vườn thuê Schrebergarten',
      theme: 'garden',
      ground_y: 810,
      draw(ctx, settings, t) { drawAllotmentGarden(ctx, settings, t); }
    },
    alpine_meadow: {
      label: 'Đồng cỏ Alpine',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawAlpineMeadow(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: DE_CULTURE_RIGS,
    backgrounds: DE_CULTURE_BACKGROUNDS
  });

})();
