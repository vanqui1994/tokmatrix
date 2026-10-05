// Remake Vector Engine Pack: Korean Culture & Folklore (Giai đoạn R)
// Rigs (9): hangul_brush_scroll, yut_sticks, jegi, gourd, low_dining_table_kr,
//           sebae_cushion, bokjumeoni, swallow, magpie
// Backgrounds (5): hanok_village, joseon_palace_generic, kr_market, kr_school, apartment_street
// Action Hooks (1): bow
(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('kr_culture pack: RemakeVector core engine chưa được nạp.');
  }

  const {
    INK, TAU, tone, volume, taper, cylinder, limb, mitten, leaf, blade,
    ellipse, path, line, withCut, hash, clamp, smooth, mix,
    PANEL, frameW, frameSpan, spread, tileX, seeded
  } = RemakeVector.kit;

  // Hai dải mở rộng của khổ ngang ([x0, 0) và [576, x1)); khổ dọc trả về rỗng.
  function extRanges(x0, x1) {
    const out = [];
    if (x0 < 0) out.push([x0, 0]);
    if (x1 > PANEL) out.push([PANEL, x1]);
    return out;
  }

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

  function drawEye(ctx, x, y, r, blink, dirX = 1, irisColor = '#18181b') {
    if (blink > 0.7) {
      path(ctx, `M ${x - r} ${y} Q ${x} ${y + r * 0.8} ${x + r} ${y}`, null, INK, 1.6);
      return;
    }
    const h = r * (1 - blink * 0.8);
    ellipse(ctx, x, y, r, h, '#ffffff', INK, 1.2);
    const pupilX = x + dirX * (r * 0.25);
    ellipse(ctx, pupilX, y, r * 0.55, h * 0.55, irisColor, null);
    ellipse(ctx, pupilX, y, r * 0.32, h * 0.32, '#09090b', null);
    ellipse(ctx, pupilX - r * 0.18, y - h * 0.18, r * 0.2, h * 0.2, '#ffffff', null);
  }

  // =============================================================
  // 1. HANGUL BRUSH SCROLL (Cuộn giấy nét cọ trừu tượng & cơ quan phát âm)
  // Tuân thủ §27 & §31: nét cọ trừu tượng, hình bộ phận phát âm (miệng, răng, lưỡi, vòm họng), KHÔNG chữ thật
  // =============================================================
  function drawHangulBrushScroll(ctx, s, t) {
    ctx.save();
    const w = 64, h = 90;

    // Dây lụa treo cuộn giấy trên đỉnh (y = -90 lên đỉnh nhọn y = -96)
    path(ctx, `M -28 -90 Q 0 -100 28 -90`, null, '#b91c1c', 1.8);
    ellipse(ctx, 0, -96, 3.5, 3.5, '#f59e0b', INK, 1.0);

    // Tấm lụa viền ngoài màu xanh lam ngọc bích (y từ -88 đến -2)
    drawPoly(ctx, [[-w * 0.5, 0], [w * 0.5, 0], [w * 0.5, -h + 2], [-w * 0.5, -h + 2]], '#0e7490', INK, 1.4);

    // Nền giấy Hanji màu vàng ngà tự nhiên ở giữa
    const gw = w - 10, gh = h - 14;
    drawPoly(ctx, [[-gw * 0.5, -5], [gw * 0.5, -5], [gw * 0.5, -gh - 5], [-gw * 0.5, -gh - 5]], '#fef9c3', INK, 1.0);

    // Vệt hoa mây chìm nhẹ trên giấy hanji
    path(ctx, `M ${-gw * 0.3} -20 Q 0 -16 ${gw * 0.3} -20`, null, '#fef08a', 2.0);
    path(ctx, `M ${-gw * 0.3} -75 Q 0 -79 ${gw * 0.3} -75`, null, '#fef08a', 2.0);

    // NÉT CỌ TRỪU TƯỢNG VÀ HÌNH BỘ PHẬN PHÁT ÂM THEO HUẤN DÂN CHÍNH ÂM (Hunminjeongeum, 1443):
    // 1. Vòm họng tròn (ㅇ) - góc trên trái
    ctx.save();
    ellipse(ctx, -13, -66, 6.5, 6.5, null, '#18181b', 2.6);
    ctx.restore();

    // 2. Răng góc nhọn (ㅅ) - góc trên phải
    path(ctx, `M 8 -59 L 14 -73 L 20 -59`, null, '#18181b', 2.8);

    // 3. Lưỡi uốn góc vuông (ㄴ) - góc dưới trái
    path(ctx, `M -18 -44 L -18 -32 L -8 -32`, null, '#18181b', 2.8);

    // 4. Miệng vuông khép mở (ㅁ) - góc dưới phải
    drawPoly(ctx, [[8, -44], [20, -44], [20, -32], [8, -32]], null, '#18181b', 2.6);

    // Nét cọ thư pháp trừu tượng uốn lượn mềm mại ở trung tâm
    path(ctx, `M -16 -50 C -4 -58 4 -42 16 -50`, null, '#27272a', 2.4);
    // Vết son triện đỏ truyền thống ở góc đáy
    drawPoly(ctx, [[11, -17], [19, -17], [19, -9], [11, -9]], '#dc2626', null);
    drawPoly(ctx, [[13, -15], [17, -15], [17, -11], [13, -11]], '#fef2f2', null);

    // Trục cuốn gỗ dưới (chạm đất y = 0)
    drawPoly(ctx, [[-w * 0.5 - 5, 0], [w * 0.5 + 5, 0], [w * 0.5 + 5, -5], [-w * 0.5 - 5, -5]], cylinder(ctx, -w * 0.5 - 5, w * 0.5 + 5, '#78350f'), INK, 1.2);
    ellipse(ctx, -w * 0.5 - 5, -2.5, 2.5, 3.5, '#451a03', INK, 1.0);
    ellipse(ctx, w * 0.5 + 5, -2.5, 2.5, 3.5, '#451a03', INK, 1.0);

    // Trục cuốn gỗ trên (y = -h)
    drawPoly(ctx, [[-w * 0.5 - 5, -h], [w * 0.5 + 5, -h], [w * 0.5 + 5, -h - 5], [-w * 0.5 - 5, -h - 5]], cylinder(ctx, -w * 0.5 - 5, w * 0.5 + 5, '#78350f'), INK, 1.2);
    ellipse(ctx, -w * 0.5 - 5, -h - 2.5, 2.5, 3.5, '#451a03', INK, 1.0);
    ellipse(ctx, w * 0.5 + 5, -h - 2.5, 2.5, 3.5, '#451a03', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // 2. YUT STICKS (Bộ 4 que gỗ trò chơi Yut Nori truyền thống)
  // 4 que gỗ: mặt phẳng gỗ sáng có khắc vạch chéo mộc, mặt khum vỏ cây nâu sẫm
  // =============================================================
  function drawYutSticks(ctx, s, t) {
    ctx.save();
    const throwAmt = clamp(s.open ?? s.tumble ?? 0);
    const configs = [
      { x: -16, tilt: -0.1 + throwAmt * -0.15, flat: true, h: 72 },
      { x: -5, tilt: -0.03, flat: false, h: 74 },
      { x: 5, tilt: 0.03, flat: true, h: 74 },
      { x: 16, tilt: 0.1 + throwAmt * 0.15, flat: false, h: 72 }
    ];

    for (let i = 0; i < configs.length; i++) {
      const c = configs[i];
      ctx.save();
      ctx.translate(c.x, 0);
      ctx.rotate(c.tilt);

      const qw = 8.5, qh = c.h;
      if (c.flat) {
        // Mặt phẳng gỗ sáng màu bạch đàn / dẻ gai
        drawPoly(ctx, [[-qw * 0.5, 0], [qw * 0.5, 0], [qw * 0.5, -qh], [-qw * 0.5, -qh]], '#fef08a', INK, 1.2);
        // Hai đầu bo cong nhẹ
        ellipse(ctx, 0, 0, qw * 0.5, 2.5, '#fde047', INK, 1.0);
        ellipse(ctx, 0, -qh, qw * 0.5, 2.5, '#fde047', INK, 1.0);
        // Các vạch chữ X khắc mộc truyền thống màu nâu đen
        for (const yFrac of [0.28, 0.5, 0.72]) {
          const cy = -qh * yFrac;
          line(ctx, [[-2.5, cy - 2.5], [2.5, cy + 2.5]], '#78350f', 1.4);
          line(ctx, [[-2.5, cy + 2.5], [2.5, cy - 2.5]], '#78350f', 1.4);
        }
      } else {
        // Mặt khum tròn vỏ cây tự nhiên màu nâu sẫm bóng
        drawPoly(ctx, [[-qw * 0.5, 0], [qw * 0.5, 0], [qw * 0.5, -qh], [-qw * 0.5, -qh]], cylinder(ctx, -qw * 0.5, qw * 0.5, '#78350f'), INK, 1.4);
        ellipse(ctx, 0, 0, qw * 0.5, 3.2, '#92400e', INK, 1.0);
        ellipse(ctx, 0, -qh, qw * 0.5, 3.2, '#92400e', INK, 1.0);
        // Gờ nổi 3D sống lưng que
        line(ctx, [[0, -qh + 6], [0, -6]], '#b45309', 1.2);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // =============================================================
  // 3. JEGI (Quả cầu đá cầu truyền thống Jegichagi)
  // Đế tròn bọc đồng xu, chùm tua rua ngũ sắc bồng bềnh
  // =============================================================
  function drawJegi(ctx, s, t) {
    ctx.save();
    const kick = clamp(s.kick ?? s.lift ?? 0);
    const flutter = Math.sin(t * 12 + kick * 4) * 0.15;

    // Chùm tua rua ngũ sắc Obangsaek vươn lên từ y = -12 tới y = -70
    const tassels = [
      { x: -10, topX: -16, col: '#ef4444', w: 3.5 },
      { x: -5, topX: -8, col: '#3b82f6', w: 3.5 },
      { x: 0, topX: flutter * 20, col: '#ffffff', w: 4.0 },
      { x: 5, topX: 8, col: '#facc15', w: 3.5 },
      { x: 10, topX: 16, col: '#10b981', w: 3.5 }
    ];

    for (const ts of tassels) {
      path(
        ctx,
        `M ${ts.x * 0.4} -12 Q ${ts.topX * 0.6 + flutter * 12} -40 ${ts.topX + flutter * 25} -70`,
        null,
        ts.col,
        ts.w
      );
    }
    // Lớp tua rua viền bóng mềm
    for (const ts of tassels) {
      path(
        ctx,
        `M ${ts.x * 0.4} -12 Q ${ts.topX * 0.6 + flutter * 12} -40 ${ts.topX + flutter * 25} -70`,
        null,
        tone(ts.col, -0.2),
        1.0
      );
    }

    // Đai buộc chỉ thắt chặt quanh miệng đế
    drawPoly(ctx, [[-6, -10], [6, -10], [5, -14], [-5, -14]], '#dc2626', INK, 1.2);
    line(ctx, [[-6, -12], [6, -12]], '#fef08a', 1.0);

    // Đế tròn bọc đồng xu (chạm đất y = 0)
    ellipse(ctx, 0, -5, 12, 5.5, '#f8fafc', INK, 1.4);
    ellipse(ctx, 0, -5, 8.5, 3.8, '#cbd5e1', null);
    // Vết thắt đáy
    path(ctx, `M -8 -5 Q 0 -2 8 -5`, null, tone('#cbd5e1', -0.3), 1.0);

    ctx.restore();
  }

  // =============================================================
  // 4. GOURD (Quả bầu hồ lô khô vàng truyền thống - Bak / 바가지)
  // Quả bầu chín vàng, eo thắt duyên dáng, cuống khô, hỗ trợ open / slice
  // =============================================================
  function drawGourd(ctx, s, t) {
    ctx.save();
    const openAmt = clamp(s.slice ?? s.open ?? 0);
    const bodyCol = s.style?.body || '#f59e0b';

    // Bầu dưới tròn to: y từ 0 đến -44, bán kính ngang 24, bán kính dọc 22
    const bcy = -22, brx = 24, bry = 22;
    ellipse(ctx, 0, bcy, brx, bry, volume(ctx, -6, bcy - 6, 8, 16, bodyCol), INK, 1.6);

    // Bầu trên nhỏ hơn: y từ -44 đến -70, bán kính ngang 17, bán kính dọc 14
    const tcy = -56, trx = 17, try_ = 14;
    ellipse(ctx, 0, tcy, trx, try_, volume(ctx, -4, tcy - 4, 6, 12, bodyCol), INK, 1.6);

    // Phần eo nối mềm mại uốn cong hai bên
    path(
      ctx,
      `M ${-trx + 2} ${tcy + 6} Q -11 -44 ${-brx + 3} ${bcy - 8} L ${brx - 3} ${bcy - 8} Q 11 -44 ${trx - 2} ${tcy + 6} Z`,
      volume(ctx, 0, -44, 10, 14, bodyCol),
      null
    );
    // Viền eo hai bên sắc nét
    path(ctx, `M ${-trx + 2} ${tcy + 6} Q -11 -44 ${-brx + 3} ${bcy - 8}`, null, INK, 1.4);
    path(ctx, `M ${trx - 2} ${tcy + 6} Q 11 -44 ${brx - 3} ${bcy - 8}`, null, INK, 1.4);

    // Vệt bóng sáng highlight nhẹ trên bề mặt vỏ bầu khô
    ellipse(ctx, -6, bcy - 4, 10, 4, tone(bodyCol, 0.25), null);
    ellipse(ctx, -4, tcy - 2, 7, 3, tone(bodyCol, 0.25), null);

    // Khi cưa mở bầu thần kỳ (Heungbu Nolbu): ánh vàng ngọc kim cương toả sáng từ đường cưa giữa
    if (openAmt > 0.05) {
      const splitW = openAmt * 8;
      path(ctx, `M 0 -68 L ${-splitW} -44 L 0 0 L ${splitW} -44 Z`, '#fef08a', '#ca8a04', 1.2);
      ellipse(ctx, 0, -35, 4 + openAmt * 6, 4 + openAmt * 6, '#ffffff', null);
    }

    // Cuống quả bầu cong tròn khô mộc ở đỉnh (y = -70 lên y = -76)
    path(ctx, `M 0 -69 Q -3 -74 -8 -76`, null, '#78350f', 3.0);
    path(ctx, `M 0 -69 Q -3 -74 -8 -76`, null, INK, 1.0);
    ellipse(ctx, 0, -69, 3.5, 1.8, '#92400e', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // 5. LOW DINING TABLE KR (Bàn ăn thấp truyền thống Hàn Quốc - Soban / 소반)
  // Mặt bàn sơn mài gờ viền nổi, 4 chân quỳ điêu khắc hình chân hổ (hojokban)
  // =============================================================
  function drawLowDiningTableKr(ctx, s, t) {
    ctx.save();
    const w = 110, h = 36;
    const woodCol = s.style?.body || '#5c2c16';
    const darkWood = '#3a1608';
    const rimCol = '#9a3412';

    // 4 chân bàn quỳ hình chân hổ (hojokban): uốn cong chữ S chạm đất y = 0
    const legLeftOuter = -w * 0.44, legLeftInner = -w * 0.30;
    const legRightOuter = w * 0.44, legRightInner = w * 0.30;

    // Chân trái phía sau & trước
    path(ctx, `M ${legLeftOuter} -30 Q ${legLeftOuter - 8} -14 ${legLeftOuter + 2} 0`, null, darkWood, 4.5);
    path(ctx, `M ${legLeftOuter} -30 Q ${legLeftOuter - 8} -14 ${legLeftOuter + 2} 0`, null, INK, 1.4);
    ellipse(ctx, legLeftOuter + 2, 0, 3.5, 1.6, darkWood, INK, 1.0); // Bàn chân đế

    path(ctx, `M ${legLeftInner} -30 Q ${legLeftInner - 6} -14 ${legLeftInner + 2} 0`, null, tone(woodCol, -0.1), 4.2);
    path(ctx, `M ${legLeftInner} -30 Q ${legLeftInner - 6} -14 ${legLeftInner + 2} 0`, null, INK, 1.2);
    ellipse(ctx, legLeftInner + 2, 0, 3.2, 1.5, darkWood, INK, 1.0);

    // Chân phải phía sau & trước
    path(ctx, `M ${legRightOuter} -30 Q ${legRightOuter + 8} -14 ${legRightOuter - 2} 0`, null, darkWood, 4.5);
    path(ctx, `M ${legRightOuter} -30 Q ${legRightOuter + 8} -14 ${legRightOuter - 2} 0`, null, INK, 1.4);
    ellipse(ctx, legRightOuter - 2, 0, 3.5, 1.6, darkWood, INK, 1.0);

    path(ctx, `M ${legRightInner} -30 Q ${legRightInner + 6} -14 ${legRightInner - 2} 0`, null, tone(woodCol, -0.1), 4.2);
    path(ctx, `M ${legRightInner} -30 Q ${legRightInner + 6} -14 ${legRightInner - 2} 0`, null, INK, 1.2);
    ellipse(ctx, legRightInner - 2, 0, 3.2, 1.5, darkWood, INK, 1.0);

    // Thanh giằng ngang chạm trổ bên dưới mặt bàn
    drawPoly(ctx, [[-w * 0.40, -18], [w * 0.40, -18], [w * 0.40, -22], [-w * 0.40, -22]], darkWood, INK, 1.2);
    // Yếm bàn chạm hoa văn mộc
    path(ctx, `M ${-w * 0.35} -28 Q 0 -22 ${w * 0.35} -28 L ${w * 0.35} -30 L ${-w * 0.35} -30 Z`, darkWood, INK, 1.0);

    // Mặt bàn gỗ sơn mài (y từ -30 đến -36): bề mặt sáng bóng, viền gờ nổi chống rơi bát
    drawPoly(ctx, [[-w * 0.5, -30], [w * 0.5, -30], [w * 0.5 - 3, -36], [-w * 0.5 + 3, -36]], woodCol, INK, 1.6);
    // Gờ viền nổi trên mép bàn
    drawPoly(ctx, [[-w * 0.5 + 2, -34], [w * 0.5 - 2, -34], [w * 0.5 - 4, -36], [-w * 0.5 + 4, -36]], rimCol, INK, 1.0);
    // Ánh phản chiếu bóng sơn mài mộc
    ellipse(ctx, 0, -33, w * 0.32, 1.4, tone(woodCol, 0.3), null);

    ctx.restore();
  }

  // =============================================================
  // 6. SEBAE CUSHION (Đệm ngồi quỳ lạy chúc Tết - Boryo / Bangseok)
  // Đệm lụa gấm đỏ thắm dày dặn, tâm hoàng kim, 4 góc đính tua rua Maedeup
  // =============================================================
  function drawSebaeCushion(ctx, s, t) {
    ctx.save();
    const w = 104, h = 22;
    const baseCol = s.style?.body || '#dc2626';

    // Thân đệm vuông phồng dày dặn chạm đất y = 0
    drawPoly(
      ctx,
      [[-w * 0.5, 0], [w * 0.5, 0], [w * 0.5 - 4, -h], [-w * 0.5 + 4, -h]],
      volume(ctx, 0, -h * 0.5, w * 0.4, h * 0.5, baseCol),
      INK,
      1.6
    );

    // Mặt trên đệm bo cong nhẹ
    ellipse(ctx, 0, -h, w * 0.46, 3.5, tone(baseCol, 0.15), INK, 1.2);

    // Miếng lụa gấm thêu vàng hoàng kim ở tâm đệm
    drawPoly(ctx, [[-w * 0.22, -h + 1], [w * 0.22, -h + 1], [w * 0.18, -h - 2], [-w * 0.18, -h - 2]], '#f59e0b', INK, 1.0);
    ellipse(ctx, 0, -h - 0.5, w * 0.12, 1.5, '#fef08a', null);

    // Đường chỉ may viền vàng óng quanh mép đệm
    path(ctx, `M ${-w * 0.48} -2 Q 0 -5 ${w * 0.48} -2`, null, '#facc15', 1.4);
    path(ctx, `M ${-w * 0.44} -h + 2 Q 0 -h - 1 ${w * 0.44} -h + 2`, null, '#facc15', 1.2);

    // 4 quả tua rua Maedeup ngũ sắc đính ở 4 góc đệm
    for (const [side, dx] of [[-1, -w * 0.48], [1, w * 0.48]]) {
      // Nút thắt hoa ngọc
      ellipse(ctx, dx, -3, 3.2, 3.2, '#f59e0b', INK, 1.0);
      // Chùm sợi tua rua buông chạm sàn
      path(ctx, `M ${dx} -2 Q ${dx + side * 4} 2 ${dx + side * 8} 0`, null, '#3b82f6', 2.0);
      path(ctx, `M ${dx} -2 Q ${dx + side * 2} 3 ${dx + side * 6} 0`, null, '#10b981', 1.8);
      path(ctx, `M ${dx} -2 Q ${dx} 3 ${dx + side * 4} 0`, null, '#facc15', 1.8);
    }

    ctx.restore();
  }

  // =============================================================
  // 7. BOKJUMEONI (Túi phúc may mắn thêu chỉ ngũ sắc - 복주머니)
  // Miệng túi bèo nhún bán nguyệt, thân chia múi ngũ sắc, nút hoa Maedeup rủ tua
  // =============================================================
  function drawBokjumeoni(ctx, s, t) {
    ctx.save();
    const w = 48, h = 68;

    // Dây treo trên đỉnh (y từ -48 vươn lên y = -66, anchor grip ở -48)
    path(ctx, `M -10 -46 Q 0 -68 10 -46`, null, '#dc2626', 1.8);
    ellipse(ctx, 0, -60, 2.5, 2.5, '#f59e0b', INK, 0.8);

    // Miệng túi xếp nếp bèo nhún hình bán nguyệt duyên dáng (y từ -40 đến -50)
    path(ctx, `M -18 -42 Q 0 -36 18 -42 Q 22 -48 16 -50 Q 0 -44 -16 -50 Q -22 -48 -18 -42 Z`, '#f8fafc', INK, 1.4);
    // Nếp gấp bèo nhún
    line(ctx, [[-9, -43], [-11, -49]], '#cbd5e1', 1.0);
    line(ctx, [[0, -39], [0, -46]], '#cbd5e1', 1.0);
    line(ctx, [[9, -43], [11, -49]], '#cbd5e1', 1.0);

    // Thân túi tròn căng phồng chia các múi ngũ sắc Obangsaek (y từ 0 đến -42)
    // Nền thân túi chính màu đỏ son
    ellipse(ctx, 0, -22, w * 0.48, 20, volume(ctx, -5, -24, 8, 14, '#dc2626'), INK, 1.6);

    // Múi màu lam ngọc bên trái
    path(ctx, `M -22 -22 Q -20 -38 -8 -40 L -6 -6 Q -18 -6 -22 -22 Z`, '#0284c7', INK, 1.0);
    // Múi màu vàng kim bên phải
    path(ctx, `M 22 -22 Q 20 -38 8 -40 L 6 -6 Q 18 -6 22 -22 Z`, '#eab308', INK, 1.0);
    // Múi màu xanh ngọc ở trung tâm
    drawPoly(ctx, [[-6, -41], [6, -41], [5, -4], [-5, -4]], '#059669', INK, 1.0);

    // Hoạ tiết tròn cát tường ở tâm túi
    ellipse(ctx, 0, -22, 6.5, 6.5, '#fef08a', INK, 1.2);
    ellipse(ctx, 0, -22, 3.2, 3.2, '#dc2626', null);

    // Dây thắt nút hoa Maedeup và 2 dải tua rua rủ xuống phía trước
    ellipse(ctx, 0, -42, 3.5, 3.5, '#dc2626', INK, 1.0);
    ellipse(ctx, -3, -42, 2.5, 2.5, '#f59e0b', null);
    ellipse(ctx, 3, -42, 2.5, 2.5, '#f59e0b', null);
    // 2 dải dây rút buông dài có quả tua
    path(ctx, `M -2 -40 Q -6 -25 -5 -12`, null, '#dc2626', 1.8);
    ellipse(ctx, -5, -10, 2.2, 3.5, '#f59e0b', INK, 0.8);

    path(ctx, `M 2 -40 Q 6 -25 5 -12`, null, '#dc2626', 1.8);
    ellipse(ctx, 5, -10, 2.2, 3.5, '#f59e0b', INK, 0.8);

    ctx.restore();
  }

  // =============================================================
  // 8. SWALLOW (Chim én - Barn swallow)
  // Thân thon, lưng xanh đen ánh lam, ức trắng, cổ đỏ, đuôi chẻ chữ V sâu dài
  // =============================================================
  function drawSwallow(ctx, s, t) {
    ctx.save();
    const flying = Boolean(s.flying);
    const flap = flying ? Math.sin(t * 30) * 0.45 : 0;
    const bodyCol = s.style?.body || '#0f172a';
    const throatCol = '#b91c1c';
    const bellyCol = '#f8fafc';

    // Đuôi chẻ đôi chữ V sâu rất dài đặc trưng của chim én (từ x=-14, y=-38 vút về x=-46, y=-10)
    path(ctx, `M -14 -36 L -46 -10 L -36 -34 L -46 -20 L -12 -42 Z`, '#020617', INK, 1.2);

    // Cánh én nhọn dài
    if (flying) {
      // Cánh dang rộng vỗ bay nhịp nhàng
      ctx.save();
      ctx.translate(-2, -42);
      ctx.rotate(flap);
      path(ctx, `M 0 0 Q 18 -32 40 -36 Q 22 -12 6 2 Z`, '#1e293b', INK, 1.4);
      ctx.restore();

      ctx.save();
      ctx.translate(-8, -44);
      ctx.rotate(-flap * 0.8);
      path(ctx, `M 0 0 Q -18 -32 -38 -34 Q -20 -12 -4 2 Z`, '#0f172a', INK, 1.4);
      ctx.restore();
    } else {
      // Cánh gập gọn gàng ôm sát lưng vút dài về phía sau
      path(ctx, `M 2 -46 Q -14 -50 -36 -24 Q -20 -34 0 -42 Z`, '#1e293b', INK, 1.2);
      // Hai chân nhỏ màu xám sừng bám đất y = 0
      line(ctx, [[-2, -26], [-3, 0]], '#64748b', 2.0);
      line(ctx, [[4, -26], [5, 0]], '#64748b', 2.0);
      line(ctx, [[-5, 0], [-1, 0]], '#475569', 1.8);
      line(ctx, [[3, 0], [7, 0]], '#475569', 1.8);
    }

    // Thân chim thon: y từ -26 đến -48
    ellipse(ctx, 0, -38, 15, 11.5, bodyCol, INK, 1.4);
    // Bụng và ức màu trắng muốt sữa
    ellipse(ctx, 4, -36, 10, 8.5, bellyCol, null);

    // Cổ họng và trán màu đỏ thắm hạt dẻ
    path(ctx, `M 8 -46 Q 16 -45 16 -52 Q 10 -55 7 -48 Z`, throatCol, null);

    // Đầu chim tròn nhỏ
    const hx = 12, hy = -50;
    ellipse(ctx, hx, hy, 7.5, 7, bodyCol, INK, 1.2);
    // Trán đỏ
    ellipse(ctx, hx + 3, hy - 2, 4, 3.2, throatCol, null);

    // Mắt đen tròn tinh anh
    drawEye(ctx, hx + 1, hy - 1, 2.2, s.blink ?? 0, 1, '#09090b');

    // Mỏ chim tam giác ngắn màu đen nhọn
    drawPoly(ctx, [[hx + 5, hy - 1.5], [hx + 13, hy], [hx + 5, hy + 1.5]], '#09090b', INK, 0.8);

    ctx.restore();
  }

  // =============================================================
  // 9. MAGPIE (Chim ác là - Oriental magpie / 까치)
  // Thân đen ánh xanh tím, bụng trắng muốt, đuôi dài bậc thang xanh ngọc, mỏ đen
  // =============================================================
  function drawMagpie(ctx, s, t) {
    ctx.save();
    const walk = s.walk ?? 0, stride = s.stride ?? 0;
    const bodyCol = s.style?.body || '#020617';
    const greenSheen = '#047857';

    // Đuôi rất dài bậc thang với ánh xanh ngọc óng ánh vểnh cao (từ x=-14, y=-52 tới x=-46, y=-30)
    for (let i = 0; i < 3; i++) {
      const offY = i * 2.5;
      path(
        ctx,
        `M -12 -50 L ${-42 - i * 3} ${-28 - offY} L ${-38 - i * 3} ${-34 - offY} L -10 -54 Z`,
        greenSheen,
        INK,
        1.2
      );
    }

    // Hai chân đen dài khỏe khoắn chạm đất y = 0
    const hop = walk * -Math.abs(Math.sin(stride * 2)) * 3;
    ctx.translate(0, hop);

    for (const [side, lx] of [[-1, -4], [1, 6]]) {
      const sw = Math.sin(stride + (side === 1 ? Math.PI : 0)) * walk * 4;
      const footX = lx + sw;
      limb(ctx, [[lx, -35], [footX, 0]], '#334155', 2.6);
      // Móng chân bám đất
      line(ctx, [[footX - 4, 0], [footX + 4, 0]], '#1e293b', 2.0);
    }

    // Thân chim lớn vững chãi (y từ -34 đến -58)
    ellipse(ctx, 0, -48, 18, 13, bodyCol, INK, 1.6);

    // Mảng vai và bụng dưới màu trắng muốt
    ellipse(ctx, 4, -45, 11, 9, '#ffffff', INK, 1.2);
    // Vệt trắng dài trên vai cánh
    path(ctx, `M -6 -56 Q 4 -54 10 -48 Q 2 -48 -6 -54 Z`, '#ffffff', null);

    // Cánh gập ôm lưng với lông bay ánh xanh ngọc bích
    path(ctx, `M -4 -58 Q -16 -56 -28 -38 Q -16 -44 2 -52 Z`, greenSheen, INK, 1.4);

    // Đầu chim ác là kiêu hãnh thông minh
    const hx = 16, hy = -64;
    ellipse(ctx, hx, hy, 8.5, 7.5, bodyCol, INK, 1.4);

    // Mắt đen viền mí sáng
    drawEye(ctx, hx + 2, hy - 1, 2.5, s.blink ?? 0, 1, '#1e293b');

    // Mỏ chim đen cứng cáp nhọn sắc
    drawPoly(ctx, [[hx + 7, hy - 2], [hx + 17, hy], [hx + 7, hy + 2]], '#09090b', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // BACKGROUND 1: HANOK VILLAGE (Làng Hanok truyền thống)
  // theme: home, ground_y: 810
  // Mái ngói cong men xám đen giwa, tường đất vàng hwangto, sân đất, vại onggi
  // =============================================================
  function drawHanokVillage(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // 1. Bầu trời
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      skyGrad.addColorStop(0, '#090d16');
      skyGrad.addColorStop(1, '#1e293b');
    } else {
      skyGrad.addColorStop(0, '#60a5fa');
      skyGrad.addColorStop(0.7, '#bae6fd');
      skyGrad.addColorStop(1, '#fef08a');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(x0, 0, x1 - x0, 1024);

    // Sao đêm & Trăng tròn
    if (isNight) {
      ellipse(ctx, 450, 140, 32, 32, '#fef08a', null);
      ellipse(ctx, 458, 134, 28, 28, '#fef9c3', null);
      for (const [sx, sy] of [[80, 90], [180, 60], [290, 110], [120, 160], [380, 80]]) {
        ellipse(ctx, sx, sy, 2.0, 2.0, '#ffffff', null);
      }
      if (x0 < 0) {
        for (const [sx, sy] of [[x0 + 60, 85], [x0 + 150, 120]]) {
          ellipse(ctx, sx, sy, 2.0, 2.0, '#ffffff', null);
        }
      }
      if (x1 > PANEL) {
        for (const [sx, sy] of [[PANEL + 60, 95], [PANEL + 160, 70]]) {
          ellipse(ctx, sx, sy, 2.0, 2.0, '#ffffff', null);
        }
      }
    }

    // 2. Dãy núi đá xa hùng vĩ (như núi Bukhansan)
    const mtCol = isNight ? '#1e293b' : '#94a3b8';
    if (x0 < -20) {
      drawPoly(ctx, [[x0 - 40, groundY * 0.65], [100, groundY * 0.65], [x0 * 0.5, groundY * 0.65 - 150]], mtCol, null);
    }
    drawPoly(ctx, [[-20, groundY * 0.65], [240, groundY * 0.65], [110, groundY * 0.65 - 140]], mtCol, null);
    drawPoly(ctx, [[180, groundY * 0.65], [596, groundY * 0.65], [380, groundY * 0.65 - 160]], mtCol, null);
    if (x1 > 596) {
      drawPoly(ctx, [[500, groundY * 0.65], [x1 + 60, groundY * 0.65], [PANEL + (x1 - PANEL) * 0.5, groundY * 0.65 - 155]], mtCol, null);
    }

    // 3. Rặng thông xanh viền chân núi
    for (let x = 10; x < 570; x += 55) {
      drawPoly(ctx, [[x, groundY * 0.66], [x + 45, groundY * 0.66], [x + 22, groundY * 0.66 - 80]], isNight ? '#064e3b' : '#047857', null);
    }
    for (const [a, b] of extRanges(x0, x1)) {
      for (let x = a - 20, i = 0; x < b; i++) {
        const r = seeded(`hanok_pine:${Math.round(x)}`);
        const tw = 34 + r * 26, th = 55 + seeded(`hanok_pine_h:${Math.round(x)}`) * 60;
        const col = isNight ? (i % 3 ? '#064e3b' : '#065f46') : (i % 3 ? '#047857' : '#15803d');
        drawPoly(ctx, [[x, groundY * 0.66], [x + tw, groundY * 0.66], [x + tw / 2, groundY * 0.66 - th]], col, null);
        x += tw * (0.55 + r * 0.5);
      }
    }

    // 4. Ngôi nhà Hanok truyền thống lớn phía sau
    const wallCol = isNight ? '#78350f' : '#d97706';
    const houseBaseY = groundY;

    // Tường nhà đất sét vàng (hwangto) kết hợp gỗ
    drawPoly(ctx, [[40, houseBaseY], [380, houseBaseY], [380, houseBaseY - 170], [40, houseBaseY - 170]], wallCol, INK, 1.4);
    // Cột gỗ chịu lực phân chia gian phòng
    for (const cx of [40, 140, 260, 380]) {
      drawPoly(ctx, [[cx - 6, houseBaseY], [cx + 6, houseBaseY], [cx + 6, houseBaseY - 170], [cx - 6, houseBaseY - 170]], cylinder(ctx, cx - 6, cx + 6, '#451a03'), INK, 1.2);
    }

    // Cửa sổ khung gỗ dán giấy Hanji hoa văn ô lưới
    for (const wx of [90, 200, 320]) {
      drawPoly(ctx, [[wx - 32, houseBaseY - 130], [wx + 32, houseBaseY - 130], [wx + 32, houseBaseY - 40], [wx - 32, houseBaseY - 40]], isNight ? '#fef08a' : '#fef9c3', INK, 1.2);
      // Thanh nan gỗ chia ô cửa
      line(ctx, [[wx, houseBaseY - 130], [[wx, houseBaseY - 40]]], '#78350f', 1.2);
      line(ctx, [[wx - 32, houseBaseY - 85], [[wx + 32, houseBaseY - 85]]], '#78350f', 1.2);
    }

    // Mái ngói đen cong giwa nhiều tầng đặc trưng Hàn Quốc (mái uốn lượn vút lên ở hai đầu)
    const tileCol = isNight ? '#0f172a' : '#334155';
    // Diềm mái cong vút
    path(
      ctx,
      `M 15 ${houseBaseY - 165} Q 210 ${houseBaseY - 155} 405 ${houseBaseY - 165} L 390 ${houseBaseY - 215} Q 210 ${houseBaseY - 200} 30 ${houseBaseY - 215} Z`,
      tileCol,
      INK,
      2.0
    );
    // Bờ nóc đắp vôi men trắng đặc trưng
    path(ctx, `M 30 ${houseBaseY - 215} Q 210 ${houseBaseY - 200} 390 ${houseBaseY - 215}`, null, '#f8fafc', 3.0);

    // Mở rộng chái nhà bên trái khi widescreen
    // Nhà hanok nhỏ tách rời + cụm vại onggi ở phần mở rộng
    const smallHanok = (hx, hw, hh) => {
      const wall = isNight ? '#e7e5e4' : '#fafaf9';
      drawPoly(ctx, [[hx - 6, houseBaseY], [hx + hw + 6, houseBaseY], [hx + hw + 6, houseBaseY - 14], [hx - 6, houseBaseY - 14]], '#a8a29e', INK, 1.2);
      drawPoly(ctx, [[hx, houseBaseY - 14], [hx + hw, houseBaseY - 14], [hx + hw, houseBaseY - hh], [hx, houseBaseY - hh]], wall, INK, 1.3);
      const bays = Math.max(2, Math.round(hw / 70));
      for (let k = 0; k <= bays; k++) {
        const cx = hx + (hw * k) / bays;
        drawPoly(ctx, [[cx - 5, houseBaseY - 14], [cx + 5, houseBaseY - 14], [cx + 5, houseBaseY - hh], [cx - 5, houseBaseY - hh]], '#78350f', INK, 1.0);
        if (k < bays) {
          const wx = cx + hw / bays / 2;
          drawPoly(ctx, [[wx - 18, houseBaseY - hh + 22], [wx + 18, houseBaseY - hh + 22], [wx + 18, houseBaseY - 30], [wx - 18, houseBaseY - 30]], isNight ? '#fde68a' : '#fef3c7', INK, 1.0);
          line(ctx, [[wx, houseBaseY - hh + 22], [wx, houseBaseY - 30]], '#78350f', 1.0);
        }
      }
      const ov = 26;
      path(ctx, `M ${hx - ov} ${houseBaseY - hh + 4} Q ${hx + hw / 2} ${houseBaseY - hh + 14} ${hx + hw + ov} ${houseBaseY - hh + 4} L ${hx + hw + ov - 14} ${houseBaseY - hh - 40} Q ${hx + hw / 2} ${houseBaseY - hh - 28} ${hx - ov + 14} ${houseBaseY - hh - 40} Z`, tileCol, INK, 1.8);
      path(ctx, `M ${hx - ov + 14} ${houseBaseY - hh - 40} Q ${hx + hw / 2} ${houseBaseY - hh - 28} ${hx + hw + ov - 14} ${houseBaseY - hh - 40}`, null, '#f8fafc', 2.4);
    };
    const onggiCluster = (ox, n) => {
      const pw = 40 + n * 34;
      drawPoly(ctx, [[ox, houseBaseY], [ox + pw, houseBaseY], [ox + pw, houseBaseY - 30], [ox, houseBaseY - 30]], isNight ? '#334155' : '#78716c', INK, 1.2);
      for (let k = 0; k < n; k++) {
        const jr = 11 + seeded(`onggi:${Math.round(ox)}:${k}`) * 9;
        const jx = ox + 28 + k * 34;
        ellipse(ctx, jx, houseBaseY - 30 - jr, jr, jr * 1.1, '#3a1608', INK, 1.2);
        ellipse(ctx, jx, houseBaseY - 30 - jr * 2.1, jr * 0.7, 3.0, '#1c0d02', INK, 1.0);
      }
      return pw;
    };
    for (const [a, b] of extRanges(x0, x1)) {
      let x = a + 40 + seeded(`hanok_start:${a}`) * 30, k = 0;
      while (x < b - 90) {
        const r = seeded(`hanok_unit:${Math.round(x)}`);
        if (k % 2 === 0) {
          const hw = Math.min(170 + r * 90, b - x - 40);
          if (hw < 120) break;
          smallHanok(x, hw, 120 + seeded(`hanok_h:${Math.round(x)}`) * 40);
          x += hw + 50 + r * 40;
        } else {
          const n = 2 + Math.floor(r * 3);
          if (x + 40 + n * 34 > b - 10) break;
          x += onggiCluster(x, n) + 40 + r * 50;
        }
        k++;
      }
    }

    // 5. Tường đá hoa văn thấp và bệ đá đựng vại onggi (Jangdokdae) bên phải
    drawPoly(ctx, [[400, houseBaseY], [576, houseBaseY], [576, houseBaseY - 60], [400, houseBaseY - 60]], isNight ? '#334155' : '#78716c', INK, 1.4);
    // Các vại onggi trang trí trên bệ sân
    for (const [jx, jy, jr] of [[440, houseBaseY - 60, 16], [490, houseBaseY - 60, 20], [545, houseBaseY - 60, 14]]) {
      ellipse(ctx, jx, jy - jr, jr, jr * 1.1, '#3a1608', INK, 1.2);
      ellipse(ctx, jx, jy - jr * 2.1, jr * 0.7, 3.0, '#1c0d02', INK, 1.0);
    }

    // Mở rộng bệ onggi bên phải khi widescreen

    // 6. Mặt sân đất nện phẳng sạch sẽ (y từ groundY đến 1024)
    const groundCol = isNight ? '#1e293b' : '#d6d3d1';
    ctx.fillStyle = groundCol;
    ctx.fillRect(x0, groundY, x1 - x0, 1024 - groundY);
    line(ctx, [[x0, groundY], [x1, groundY]], INK, 1.6);
  }

  // =============================================================
  // BACKGROUND 2: JOSEON PALACE GENERIC (Cung điện Joseon chung chung)
  // theme: garden, ground_y: 810
  // Mái ngói đen 2 tầng, xà ngang Dancheong rực rỡ, cột sơn son, sân đá phiến tam cấp
  // =============================================================
  function drawJoseonPalaceGeneric(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời uy nghiêm
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(1, '#1e1b4b');
    } else {
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(0.7, '#bae6fd');
      skyGrad.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(x0, 0, x1 - x0, 1024);

    if (isNight) {
      ellipse(ctx, 120, 140, 28, 28, '#fef08a', null);
    }

    const palaceBaseY = groundY - 30; // Bậc tam cấp cao 30px

    // Hàng cột trụ sơn son đỏ đồ sộ
    const pillarCol = '#b91c1c';
    const drawPillar = (px) => {
      drawPoly(ctx, [[px - 10, palaceBaseY], [px + 10, palaceBaseY], [px + 10, palaceBaseY - 180], [px - 10, palaceBaseY - 180]], cylinder(ctx, px - 10, px + 10, pillarCol), INK, 1.4);
      // Chân tảng đá kê cột
      drawPoly(ctx, [[px - 13, palaceBaseY], [px + 13, palaceBaseY], [px + 11, palaceBaseY - 8], [px - 11, palaceBaseY - 8]], '#cbd5e1', INK, 1.0);
    };

    if (x0 < 0) {
      for (let px = 70 - 105; px >= x0 + 15; px -= 105) {
        drawPillar(px);
      }
    }
    for (const px of [70, 170, 288, 406, 506]) {
      drawPillar(px);
    }
    if (x1 > PANEL) {
      for (let px = 506 + 105; px <= x1 - 15; px += 105) {
        drawPillar(px);
      }
    }

    // Hệ xà ngang và đấu củng sơn hoa văn Dancheong (xanh ngọc, đỏ son, trắng tuyết)
    const dancheongY = palaceBaseY - 180;
    // Băng xà ngọc bích
    if (x0 < 0) {
      drawPoly(ctx, [[x0 + 10, dancheongY], [30, dancheongY], [30, dancheongY - 14], [x0 + 10, dancheongY - 14]], '#0f766e', INK, 1.4);
      drawPoly(ctx, [[x0, dancheongY - 14], [20, dancheongY - 14], [20, dancheongY - 26], [x0, dancheongY - 26]], '#dc2626', INK, 1.4);
    }
    drawPoly(ctx, [[30, dancheongY], [546, dancheongY], [546, dancheongY - 14], [30, dancheongY - 14]], '#0f766e', INK, 1.4);
    // Băng xà đỏ son
    drawPoly(ctx, [[20, dancheongY - 14], [556, dancheongY - 14], [556, dancheongY - 26], [20, dancheongY - 26]], '#dc2626', INK, 1.4);
    if (x1 > PANEL) {
      drawPoly(ctx, [[546, dancheongY], [x1 - 10, dancheongY], [x1 - 10, dancheongY - 14], [546, dancheongY - 14]], '#0f766e', INK, 1.4);
      drawPoly(ctx, [[556, dancheongY - 14], [x1, dancheongY - 14], [x1, dancheongY - 26], [556, dancheongY - 26]], '#dc2626', INK, 1.4);
    }
    // Các hoa văn tròn Dancheong xen kẽ
    for (let x = 50; x < 540; x += 32) {
      ellipse(ctx, x, dancheongY - 7, 5, 5, '#fef08a', null);
      ellipse(ctx, x, dancheongY - 20, 5, 5, '#14b8a6', null);
    }

    // Mái ngói đen cong uy nghi tầng dưới
    const roofCol = isNight ? '#09090b' : '#1e293b';
    path(
      ctx,
      `M 0 ${dancheongY - 26} Q 288 ${dancheongY - 16} 576 ${dancheongY - 26} L 550 ${dancheongY - 70} Q 288 ${dancheongY - 55} 26 ${dancheongY - 70} Z`,
      roofCol,
      INK,
      2.0
    );
    // Gờ mái men trắng
    path(ctx, `M 26 ${dancheongY - 70} Q 288 ${dancheongY - 55} 550 ${dancheongY - 70}`, null, '#f8fafc', 3.0);

    // Mái tầng trên nhỏ hơn ở phía sau
    path(
      ctx,
      `M 80 ${dancheongY - 70} Q 288 ${dancheongY - 60} 496 ${dancheongY - 70} L 460 ${dancheongY - 110} Q 288 ${dancheongY - 98} 116 ${dancheongY - 110} Z`,
      roofCol,
      INK,
      1.8
    );
    path(ctx, `M 116 ${dancheongY - 110} Q 288 ${dancheongY - 98} 460 ${dancheongY - 110}`, null, '#f8fafc', 2.5);

    // Bậc thềm tam cấp đá hoa cương trắng dẫn lên cung điện (y từ groundY - 30 đến groundY)
    drawPoly(ctx, [[50, groundY], [526, groundY], [510, groundY - 10], [66, groundY - 10]], '#e2e8f0', INK, 1.2);
    drawPoly(ctx, [[66, groundY - 10], [510, groundY - 10], [494, groundY - 20], [82, groundY - 20]], '#f1f5f9', INK, 1.2);
    drawPoly(ctx, [[82, groundY - 20], [494, groundY - 20], [478, groundY - 30], [98, groundY - 30]], '#ffffff', INK, 1.2);

    // Sân triều đình lát đá phiến xám (groundY đến 1024)
    ctx.fillStyle = isNight ? '#1e293b' : '#cbd5e1';
    ctx.fillRect(x0, groundY, x1 - x0, 1024 - groundY);
    line(ctx, [[x0, groundY], [x1, groundY]], INK, 1.6);
    // Các đường mạch đá phiến phẳng
    for (let y = groundY + 40; y < 1024; y += 45) {
      line(ctx, [[x0, y], [x1, y]], isNight ? '#0f172a' : '#94a3b8', 1.0);
    }
  }

  // =============================================================
  // BACKGROUND 3: KR MARKET (Chợ truyền thống Hàn Quốc)
  // theme: market, ground_y: 810
  // Mái bạt che sọc màu tươi tắn, sạp sọt nông sản, vại onggi, biển hiệu icon (zero text)
  // =============================================================
  function drawKrMarket(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời hoặc vòm mái chợ
    const skyCol = isNight ? '#090d16' : '#93c5fd';
    ctx.fillStyle = skyCol;
    ctx.fillRect(x0, 0, x1 - x0, 1024);

    // Dãy bạt che sạp hàng nhiều màu sắc (cam, xanh biển, sọc vàng)
    const stallBaseY = groundY;

    // Sạp mở rộng bên trái
    if (x0 < 0) {
      drawPoly(ctx, [[x0, stallBaseY - 150], [0, stallBaseY - 150], [0, stallBaseY - 210], [x0, stallBaseY - 210]], '#16a34a', INK, 1.4);
      drawPoly(ctx, [[x0, stallBaseY], [0, stallBaseY], [0, stallBaseY - 80], [x0, stallBaseY - 80]], '#a16207', INK, 1.4);
      for (let rx = x0 + 40; rx < -20; rx += 60) {
        ellipse(ctx, rx, stallBaseY - 80, 18, 9, '#ca8a04', INK, 1.2);
      }
    }

    // Sạp bên trái: bạt cam sọc trắng
    drawPoly(ctx, [[0, stallBaseY - 150], [250, stallBaseY - 150], [230, stallBaseY - 210], [0, stallBaseY - 210]], '#ea580c', INK, 1.4);
    for (let x = 20; x < 230; x += 40) {
      drawPoly(ctx, [[x, stallBaseY - 150], [x + 20, stallBaseY - 150], [x + 18, stallBaseY - 210], [x - 2, stallBaseY - 210]], '#ffffff', null);
    }
    // Sạp hàng gỗ bên trái bày các rổ rau củ
    drawPoly(ctx, [[10, stallBaseY], [240, stallBaseY], [240, stallBaseY - 80], [10, stallBaseY - 80]], '#a16207', INK, 1.4);
    // Các rổ nan tre đựng củ cải, ớt đỏ
    for (const rx of [40, 100, 160, 210]) {
      ellipse(ctx, rx, stallBaseY - 80, 18, 9, '#ca8a04', INK, 1.2);
    }
    // Biển hiệu sạp hình quả ớt đỏ (zero text)
    drawPoly(ctx, [[70, stallBaseY - 140], [140, stallBaseY - 140], [140, stallBaseY - 105], [70, stallBaseY - 105]], '#f8fafc', INK, 1.2);
    path(ctx, `M 90 -125 Q 105 -135 120 -115`, null, '#dc2626', 4.5); // Quả ớt đỏ

    // Sạp bên phải: bạt xanh biển sọc vàng
    drawPoly(ctx, [[300, stallBaseY - 160], [576, stallBaseY - 160], [576, stallBaseY - 220], [320, stallBaseY - 220]], '#0284c7', INK, 1.4);
    for (let x = 330; x < 570; x += 45) {
      drawPoly(ctx, [[x, stallBaseY - 160], [x + 22, stallBaseY - 160], [x + 20, stallBaseY - 220], [x - 2, stallBaseY - 220]], '#fef08a', null);
    }
    drawPoly(ctx, [[310, stallBaseY], [566, stallBaseY], [566, stallBaseY - 80], [310, stallBaseY - 80]], '#78350f', INK, 1.4);
    // Các sọt đựng quả hồng vàng cam
    for (const rx of [350, 420, 490]) {
      ellipse(ctx, rx, stallBaseY - 80, 20, 10, '#ca8a04', INK, 1.2);
      ellipse(ctx, rx, stallBaseY - 86, 7, 7, '#ea580c', null);
    }
    // Biển hiệu sạp hình quả hồng cam (zero text)
    drawPoly(ctx, [[380, stallBaseY - 150], [450, stallBaseY - 150], [450, stallBaseY - 115], [380, stallBaseY - 115]], '#f8fafc', INK, 1.2);
    ellipse(ctx, 415, stallBaseY - 132, 10, 9, '#ea580c', null);
    ellipse(ctx, 415, stallBaseY - 141, 3, 2, '#15803d', null);

    // Sạp mở rộng bên phải
    if (x1 > PANEL) {
      drawPoly(ctx, [[576, stallBaseY - 160], [x1, stallBaseY - 160], [x1, stallBaseY - 220], [576, stallBaseY - 220]], '#d97706', INK, 1.4);
      drawPoly(ctx, [[576, stallBaseY], [x1, stallBaseY], [x1, stallBaseY - 80], [576, stallBaseY - 80]], '#78350f', INK, 1.4);
      for (let rx = 600; rx + 30 < x1; rx += 65) {
        ellipse(ctx, rx, stallBaseY - 80, 20, 10, '#ca8a04', INK, 1.2);
      }
    }

    // Đèn lồng giấy treo ấm cúng giữa chợ
    for (const lx of [200, 360]) {
      line(ctx, [[lx, stallBaseY - 240], [lx, stallBaseY - 190]], '#0f172a', 1.4);
      ellipse(ctx, lx, stallBaseY - 180, 14, 18, isNight ? '#fef08a' : '#ef4444', INK, 1.2);
    }

    // Lối đi chợ lát gạch sạch sẽ (groundY đến 1024)
    ctx.fillStyle = isNight ? '#1e293b' : '#e2e8f0';
    ctx.fillRect(x0, groundY, x1 - x0, 1024 - groundY);
    line(ctx, [[x0, groundY], [x1, groundY]], INK, 1.6);
  }

  // =============================================================
  // BACKGROUND 4: KR SCHOOL (Lớp học kiểu Hàn Quốc)
  // theme: school, ground_y: 810
  // Bảng xanh viền nhôm, bục giảng gỗ, cửa sổ lớn, sàn gỗ bóng, bảng tin tranh vẽ (zero text)
  // =============================================================
  function drawKrSchool(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Tường lớp học màu be ấm áp
    ctx.fillStyle = isNight ? '#334155' : '#fefce8';
    ctx.fillRect(x0, 0, x1 - x0, 1024);

    // Phần mở rộng: cửa sổ, tủ đồ, bảng tin (tranh khác nhau), chậu cây — xen kẽ, không chữ
    const schoolUnits = ['window', 'lockers', 'board', 'plant', 'window', 'board', 'lockers', 'plant'];
    const drawPic = (px, py, pw, ph, kind) => {
      drawPoly(ctx, [[px, py], [px + pw, py], [px + pw, py + ph], [px, py + ph]], '#f8fafc', INK, 1.0);
      const cx = px + pw / 2, cy = py + ph / 2;
      if (kind === 0) ellipse(ctx, cx, cy, pw * 0.2, pw * 0.2, '#f43f5e', null);
      else if (kind === 1) drawPoly(ctx, [[px + 6, py + ph - 6], [px + pw - 6, py + ph - 6], [cx, py + 8]], '#10b981', null);
      else if (kind === 2) { ellipse(ctx, px + pw * 0.3, py + ph * 0.3, 7, 7, '#facc15', null); drawPoly(ctx, [[px, py + ph], [px + pw, py + ph], [px + pw, cy + 6], [px, cy + 10]], '#38bdf8', null); }
      else { drawPoly(ctx, [[cx - 10, cy + 12], [cx + 10, cy + 12], [cx + 10, cy - 4], [cx - 10, cy - 4]], '#f97316', null); drawPoly(ctx, [[cx - 14, cy - 4], [cx + 14, cy - 4], [cx, cy - 18]], '#7c3aed', null); }
    };
    for (const [a, b] of extRanges(x0, x1)) {
      let x = a + 30, k = Math.floor(seeded(`school_start:${a}`) * 4);
      while (x < b - 60) {
        const unit = schoolUnits[k % schoolUnits.length];
        let w = 0;
        if (unit === 'window') {
          w = 120; if (x + w > b - 10) break;
          drawPoly(ctx, [[x, 160], [x + w, 160], [x + w, 420], [x, 420]], isNight ? '#0f172a' : '#bae6fd', INK, 2.0);
          line(ctx, [[x + w * 0.5, 160], [x + w * 0.5, 420]], '#64748b', 2.0);
          line(ctx, [[x, 290], [x + w, 290]], '#64748b', 2.0);
        } else if (unit === 'lockers') {
          const n = 3 + Math.floor(seeded(`lock:${Math.round(x)}`) * 3); w = n * 38; if (x + w > b - 10) break;
          for (let j = 0; j < n; j++) {
            const lx = x + j * 38, col = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6'][(j + k) % 4];
            drawPoly(ctx, [[lx, groundY], [lx + 36, groundY], [lx + 36, groundY - 170], [lx, groundY - 170]], col, INK, 1.2);
            drawPoly(ctx, [[lx + 8, groundY - 150], [lx + 28, groundY - 150], [lx + 28, groundY - 144], [lx + 8, groundY - 144]], tone(col, -0.3), null);
            ellipse(ctx, lx + 28, groundY - 90, 2.5, 2.5, INK, null);
          }
        } else if (unit === 'board') {
          w = 150; if (x + w > b - 10) break;
          drawPoly(ctx, [[x, 200], [x + w, 200], [x + w, 380], [x, 380]], '#ca8a04', INK, 2.0);
          for (let j = 0; j < 4; j++) {
            drawPic(x + 12 + (j % 2) * 68, 212 + Math.floor(j / 2) * 84, 58, 72, Math.floor(seeded(`pic:${Math.round(x)}:${j}`) * 4));
          }
        } else {
          w = 60; if (x + w > b - 10) break;
          drawPoly(ctx, [[x + 14, groundY], [x + 46, groundY], [x + 50, groundY - 40], [x + 10, groundY - 40]], '#b45309', INK, 1.2);
          for (const [dx, dy, r] of [[30, -70, 22], [16, -58, 16], [44, -60, 16]]) ellipse(ctx, x + dx, groundY + dy, r, r, '#16a34a', INK, 1.0);
        }
        x += w + 45 + seeded(`gap:${Math.round(x)}`) * 40;
        k++;
      }
    }

    // Cửa sổ lớn nhìn ra sân trường bên trái
    const winX = 20, winY = 160, winW = 120, winH = 260;
    drawPoly(ctx, [[winX, winY], [winX + winW, winY], [winX + winW, winY + winH], [winX, winY + winH]], isNight ? '#0f172a' : '#bae6fd', INK, 2.0);
    // Khung nhôm chia ô cửa sổ
    line(ctx, [[winX + winW * 0.5, winY], [winX + winW * 0.5, winY + winH]], '#64748b', 2.0);
    line(ctx, [[winX, winY + winH * 0.5], [winX + winW, winY + winH * 0.5]], '#64748b', 2.0);

    // Bảng xanh chống loá viền nhôm ở giữa tường phía trước
    const boardX = 170, boardY = 180, boardW = 280, boardH = 170;
    drawPoly(ctx, [[boardX, boardY], [boardX + boardW, boardY], [boardX + boardW, boardY + boardH], [boardX, boardY + boardH]], isNight ? '#064e3b' : '#047857', INK, 2.6);
    // Khung nhôm bao quanh bảng
    drawPoly(ctx, [[boardX - 4, boardY - 4], [boardX + boardW + 4, boardY - 4], [boardX + boardW + 4, boardY + boardH + 4], [boardX - 4, boardY + boardH + 4]], null, '#94a3b8', 3.0);
    // Khay đựng phấn phía dưới bảng
    drawPoly(ctx, [[boardX, boardY + boardH + 4], [boardX + boardW, boardY + boardH + 4], [boardX + boardW, boardY + boardH + 12], [boardX, boardY + boardH + 12]], '#64748b', INK, 1.0);
    // Miếng mút lau bảng và phấn trắng
    drawPoly(ctx, [[boardX + 30, boardY + boardH + 2], [boardX + 55, boardY + boardH + 2], [boardX + 55, boardY + boardH + 9], [boardX + 30, boardY + boardH + 9]], '#1e3a8a', null);
    drawPoly(ctx, [[boardX + 70, boardY + boardH + 5], [boardX + 85, boardY + boardH + 5], [boardX + 85, boardY + boardH + 8], [boardX + 70, boardY + boardH + 8]], '#ffffff', null);

    // Bảng tin trưng bày tranh vẽ phong cảnh hoa/núi của học sinh (zero text) bên phải
    const noticeX = 475, noticeY = 200, noticeW = 85, noticeH = 150;
    drawPoly(ctx, [[noticeX, noticeY], [noticeX + noticeW, noticeY], [noticeX + noticeW, noticeY + noticeH], [noticeX, noticeY + noticeH]], '#ca8a04', INK, 2.0);
    // Các bức tranh vẽ màu nước dán trên bảng tin
    drawPoly(ctx, [[noticeX + 10, noticeY + 15], [noticeX + 75, noticeY + 15], [noticeX + 75, noticeY + 70], [noticeX + 10, noticeY + 70]], '#f8fafc', INK, 1.0);
    ellipse(ctx, noticeX + 42, noticeY + 45, 12, 12, '#f43f5e', null); // Tranh hoa đỏ
    drawPoly(ctx, [[noticeX + 10, noticeY + 85], [noticeX + 75, noticeY + 85], [noticeX + 75, noticeY + 135], [noticeX + 10, noticeY + 135]], '#f8fafc', INK, 1.0);
    drawPoly(ctx, [[noticeX + 20, noticeY + 125], [noticeX + 65, noticeY + 125], [noticeX + 42, noticeY + 95]], '#10b981', null); // Tranh núi xanh


    // Bục giảng gỗ phía trước bảng (y từ groundY - 24 đến groundY)
    drawPoly(ctx, [[140, groundY], [480, groundY], [460, groundY - 24], [160, groundY - 24]], '#b45309', INK, 1.4);

    // Sàn gỗ lớp học màu vàng sáng (groundY đến 1024)
    ctx.fillStyle = isNight ? '#78350f' : '#fde047';
    ctx.fillRect(x0, groundY, x1 - x0, 1024 - groundY);
    line(ctx, [[x0, groundY], [x1, groundY]], INK, 1.8);
    // Vệt các tấm ván sàn gỗ
    for (let y = groundY + 35; y < 1024; y += 38) {
      line(ctx, [[x0, y], [x1, y]], tone('#fde047', -0.2), 1.2);
    }
  }

  // =============================================================
  // BACKGROUND 5: APARTMENT STREET (Phố chung cư đô thị hiện đại Hàn Quốc)
  // theme: street, ground_y: 810
  // Chung cư cao tầng hiện đại nhấp nhô, vỉa hè lát gạch sọc Seoul, hàng cây ngân hạnh, vạch đi bộ
  // =============================================================
  function drawApartmentStreet(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời đô thị
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      skyGrad.addColorStop(0, '#090d16');
      skyGrad.addColorStop(1, '#1e293b');
    } else {
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(0.8, '#bae6fd');
      skyGrad.addColorStop(1, '#f1f5f9');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(x0, 0, x1 - x0, 1024);

    if (isNight) {
      ellipse(ctx, 480, 120, 24, 24, '#fef08a', null);
    }

    // Các toà nhà chung cư cao tầng hiện đại phía xa (y từ 180 đến groundY - 140)
    const bldCols = isNight ? ['#1e293b', '#0f172a', '#334155'] : ['#cbd5e1', '#e2e8f0', '#94a3b8'];
    const drawBuilding = (b) => {
      drawPoly(ctx, [[b.x, groundY - 140], [b.x + b.w, groundY - 140], [b.x + b.w, groundY - 140 - b.h], [b.x, groundY - 140 - b.h]], b.col, INK, 1.4);
      // Các ô cửa sổ ban công nhịp nhàng
      for (let by = groundY - 140 - b.h + 30; by < groundY - 170; by += 40) {
        for (let bx = b.x + 15; bx < b.x + b.w - 20; bx += 32) {
          drawPoly(ctx, [[bx, by], [bx + 20, by], [bx + 20, by + 22], [bx, by + 22]], isNight ? '#fef08a' : '#38bdf8', null);
        }
      }
    };

    const buildings = [
      { x: 30, w: 130, h: 420, col: bldCols[0] },
      { x: 180, w: 150, h: 460, col: bldCols[1] },
      { x: 350, w: 140, h: 390, col: bldCols[2] }
    ];
    for (const b of buildings) {
      drawBuilding(b);
    }
    // Phần mở rộng: nhiều toà cao thấp khác nhau, có khe trời, cửa sổ sáng ngẫu nhiên (tất định)
    for (const [a, b] of extRanges(x0, x1)) {
      let x = a + 20;
      while (x < b - 80) {
        const r = seeded(`apt:${Math.round(x)}`);
        const w = Math.min(100 + r * 90, b - x - 10);
        const h = 260 + seeded(`apt_h:${Math.round(x)}`) * 260;
        const col = bldCols[Math.floor(r * 3) % 3];
        drawPoly(ctx, [[x, groundY - 140], [x + w, groundY - 140], [x + w, groundY - 140 - h], [x, groundY - 140 - h]], col, INK, 1.4);
        drawPoly(ctx, [[x + 8, groundY - 140 - h], [x + w - 8, groundY - 140 - h], [x + w - 8, groundY - 150 - h], [x + 8, groundY - 150 - h]], tone(col, -0.15), INK, 1.0);
        for (let by = groundY - 140 - h + 26; by < groundY - 170; by += 36) {
          for (let bx = x + 12; bx < x + w - 20; bx += 28) {
            const lit = isNight ? seeded(`win:${Math.round(bx)}:${by}`) < 0.55 : true;
            drawPoly(ctx, [[bx, by], [bx + 16, by], [bx + 16, by + 20], [bx, by + 20]], isNight ? (lit ? '#fef08a' : '#1f2937') : '#38bdf8', null);
          }
        }
        x += w + 25 + seeded(`apt_gap:${Math.round(x)}`) * 50;
      }
    }

    // Hàng cây ngân hạnh (Ginkgo) tán lá xanh / vàng rực dọc vỉa hè
    const leafCol = isNight ? '#15803d' : '#eab308'; // Vàng rực mùa thu
    const drawGinkgo = (tx) => {
      // Thân cây
      drawPoly(ctx, [[tx - 5, groundY - 140], [tx + 5, groundY - 140], [tx + 4, groundY - 260], [tx - 4, groundY - 260]], '#78350f', INK, 1.2);
      // Tán lá ngân hạnh bồng bềnh
      ellipse(ctx, tx, groundY - 290, 38, 48, leafCol, INK, 1.4);
      ellipse(ctx, tx - 18, groundY - 280, 24, 28, leafCol, null);
      ellipse(ctx, tx + 18, groundY - 280, 24, 28, leafCol, null);
    };

    for (const tx of [90, 260, 440]) {
      drawGinkgo(tx);
    }
    for (const [a, b] of extRanges(x0, x1)) {
      for (let tx = a + 90; tx < b - 40; tx += 170) drawGinkgo(tx);
    }

    // Hàng rào hoa thấp và cột đèn đường đô thị
    const drawStreetLamp = (lx) => {
      drawPoly(ctx, [[lx - 3, groundY - 140], [lx + 3, groundY - 140], [lx + 2, groundY - 320], [lx - 2, groundY - 320]], '#64748b', INK, 1.0);
      ellipse(ctx, lx, groundY - 325, 10, 6, isNight ? '#fef08a' : '#f8fafc', INK, 1.0);
    };

    for (const lx of [180, 480]) {
      drawStreetLamp(lx);
    }
    for (const [a, b] of extRanges(x0, x1)) {
      for (let lx = a + 175; lx < b - 30; lx += 340) drawStreetLamp(lx);
    }

    // Vỉa hè lát gạch sọc đỏ - xám đặc trưng Seoul (y từ groundY - 140 đến groundY)
    drawPoly(ctx, [[x0, groundY], [x1, groundY], [x1, groundY - 140], [x0, groundY - 140]], isNight ? '#334155' : '#e2e8f0', INK, 1.6);
    // Các dải gạch đỏ trang trí
    if (x0 < 0) {
      for (let x = -64; x >= x0; x -= 64) {
        drawPoly(ctx, [[x, groundY], [x + 28, groundY], [x + 28, groundY - 140], [x, groundY - 140]], isNight ? '#451a03' : '#cbd5e1', null);
      }
    }
    for (let x = 0; x < 576; x += 64) {
      drawPoly(ctx, [[x, groundY], [x + 28, groundY], [x + 28, groundY - 140], [x, groundY - 140]], isNight ? '#451a03' : '#cbd5e1', null);
    }
    if (x1 > 576) {
      for (let x = 576; x < x1; x += 64) {
        drawPoly(ctx, [[x, groundY], [x + 28, groundY], [x + 28, groundY - 140], [x, groundY - 140]], isNight ? '#451a03' : '#cbd5e1', null);
      }
    }

    // Lòng đường nhựa phẳng phiu (groundY đến 1024)
    ctx.fillStyle = isNight ? '#0f172a' : '#334155';
    ctx.fillRect(x0, groundY, x1 - x0, 1024 - groundY);
    line(ctx, [[x0, groundY], [x1, groundY]], INK, 1.8);

    for (const [a, b] of extRanges(x0, x1)) {
      for (let x = a + 20; x < b - 40; x += 120) {
        drawPoly(ctx, [[x, groundY + 120], [x + 60, groundY + 120], [x + 60, groundY + 128], [x, groundY + 128]], '#facc15', null);
      }
    }
    // Vạch kẻ đường đi bộ cho người đi bộ màu trắng nổi bật
    for (let x = 40; x < 540; x += 55) {
      drawPoly(ctx, [[x, groundY + 30], [x + 35, groundY + 30], [x + 35, groundY + 160], [x, groundY + 160]], '#f8fafc', null);
    }
  }

  // =============================================================
  // ACTION HOOKS: BOW (Cúi lạy chúc Tết - Sebae / 절)
  // motion: false, channel: null, hold: true
  // Quỳ gối, cúi gập người cung kính, hai tay đan trước trán/ngực, đầu hạ thấp y tăng >= 20px
  // =============================================================
  const KR_ACTION_HOOKS = {
    bow(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (!actor) return;

      // Hold = true: khi t >= a.end, engine gọi hook với p = 1.0 để giữ nguyên tư thế lạy
      const k = smooth(clamp(p));
      const rotSign = actor.flip ? -1 : 1;

      // Xoay thân mình cúi rạp về phía trước 32 độ quanh gốc (0, 0)
      // Khiến toạ độ y của đầu tăng >= 24 px (thấp xuống sàn một cách cung kính)
      actor.rotation = (actor.rotation || 0) + rotSign * 32 * k;

      // Quỳ gối (sit = k) và gập hông (lean = 0.4 * k)
      actor.sit = Math.max(actor.sit || 0, k);
      actor.lean = (actor.lean || 0) + 0.4 * k;

      // Hai bàn tay đan chéo cung kính đặt ngang trước trán / ngực
      actor.hand_l_x = mix(actor.hand_l_x ?? -24, -6, k);
      actor.hand_l_y = mix(actor.hand_l_y ?? -22, -42, k);
      actor.hand_r_x = mix(actor.hand_r_x ?? 24, 6, k);
      actor.hand_r_y = mix(actor.hand_r_y ?? -22, -42, k);
    }
  };

  // =============================================================
  // ĐĂNG KÝ RIGS VÀ BACKGROUNDS VÀO CORE ENGINE
  // =============================================================
  const KR_CULTURE_RIGS = {
    hangul_brush_scroll: {
      draw(ctx, s, t) { drawHangulBrushScroll(ctx, s, t); }
    },
    yut_sticks: {
      draw(ctx, s, t) { drawYutSticks(ctx, s, t); }
    },
    jegi: {
      draw(ctx, s, t) { drawJegi(ctx, s, t); }
    },
    gourd: {
      draw(ctx, s, t) { drawGourd(ctx, s, t); }
    },
    low_dining_table_kr: {
      draw(ctx, s, t) { drawLowDiningTableKr(ctx, s, t); }
    },
    sebae_cushion: {
      draw(ctx, s, t) { drawSebaeCushion(ctx, s, t); }
    },
    bokjumeoni: {
      draw(ctx, s, t) { drawBokjumeoni(ctx, s, t); }
    },
    swallow: {
      draw(ctx, s, t) { drawSwallow(ctx, s, t); }
    },
    magpie: {
      draw(ctx, s, t) { drawMagpie(ctx, s, t); }
    }
  };

  const KR_CULTURE_BACKGROUNDS = {
    hanok_village: {
      label: 'Làng Hanok truyền thống',
      theme: 'home',
      ground_y: 810,
      draw(ctx, settings, t) { drawHanokVillage(ctx, settings, t); }
    },
    joseon_palace_generic: {
      label: 'Cung điện Joseon chung chung',
      theme: 'garden',
      ground_y: 810,
      draw(ctx, settings, t) { drawJoseonPalaceGeneric(ctx, settings, t); }
    },
    kr_market: {
      label: 'Chợ truyền thống Hàn Quốc',
      theme: 'market',
      ground_y: 810,
      draw(ctx, settings, t) { drawKrMarket(ctx, settings, t); }
    },
    kr_school: {
      label: 'Lớp học kiểu Hàn Quốc',
      theme: 'school',
      ground_y: 810,
      draw(ctx, settings, t) { drawKrSchool(ctx, settings, t); }
    },
    apartment_street: {
      label: 'Phố chung cư hiện đại Hàn Quốc',
      theme: 'street',
      ground_y: 810,
      draw(ctx, settings, t) { drawApartmentStreet(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: KR_CULTURE_RIGS,
    backgrounds: KR_CULTURE_BACKGROUNDS,
    actionHooks: KR_ACTION_HOOKS
  });
})();
