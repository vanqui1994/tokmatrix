// Remake Vector Engine Pack: Japanese Culture & Folklore (Giai đoạn Q)
// Rigs (12): koinobori, tanabata_bamboo, bamboo, paper_lantern_jp, school_bag_randoseru, train_ticket_gate,
//            pheasant, crab, tanuki, crane, koi, snow_monkey
// Backgrounds (5): edo_town, jp_school, train_platform, shrine_generic, onsen_snow
(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('jp_culture pack: RemakeVector core engine chưa được nạp.');
  }

  const {
    INK, TAU, tone, volume, taper, cylinder, limb, mitten, leaf, blade,
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
  // 1. KOINOBORI (Cờ cá chép bay theo gió trên cột)
  // -------------------------------------------------------------
  function drawKoinobori(ctx, s, t) {
    ctx.save();
    const wind = clamp(s.wind ?? 0, 0, 1);
    const timeVal = t ?? 0;

    // Cột tre/gỗ cao từ gốc (0, 0) lên y = -260
    drawPoly(ctx, [[-2.5, 0], [2.5, 0], [2.5, -260], [-2.5, -260]], cylinder(ctx, -2.5, 2.5, '#854d0e'), INK, 1.2);
    // Các đốt tre trên thân cột
    for (let y = -40; y >= -240; y -= 45) {
      ellipse(ctx, 0, y, 3.5, 1.5, '#a16207', INK, 0.8);
    }

    // Đỉnh cột: Chong chóng xoay Yaguruma màu vàng kim
    const topY = -260;
    ellipse(ctx, 0, topY, 6, 6, '#f59e0b', INK, 1.2);
    ellipse(ctx, 0, topY, 3, 3, '#fbbf24', null);

    // Cánh chong chóng xoay 8 nan hoa
    const spin = timeVal * (3 + wind * 12);
    for (let i = 0; i < 8; i++) {
      const ang = spin + (i * Math.PI) / 4;
      const rx = Math.cos(ang) * 14, ry = Math.sin(ang) * 14;
      line(ctx, [[0, topY], [rx, topY + ry]], '#d97706', 1.6);
      ellipse(ctx, rx, topY + ry, 2.5, 2.5, '#fbbf24', INK, 0.6);
    }

    // Dải ngũ sắc Fukinagashi ở dưới chong chóng
    const fukY = -242;
    const fukColors = ['#3b82f6', '#ef4444', '#eab308', '#22c55e', '#a855f7'];
    line(ctx, [[0, fukY], [10, fukY]], '#cbd5e1', 1.2);
    for (let c = 0; c < 5; c++) {
      const col = fukColors[c];
      const streamY = fukY + (c - 2) * 2.5;
      const lift = wind * 14 - (1 - wind) * 16;
      const w1 = Math.sin(timeVal * (6 + wind * 8) + c * 0.7) * (2 + wind * 7);
      const w2 = Math.sin(timeVal * (6 + wind * 8) + c * 0.7 + 1.2) * (3 + wind * 10);
      path(
        ctx,
        `M 10 ${streamY} Q ${25} ${streamY - lift * 0.4 + w1} ${45} ${streamY - lift + w2}`,
        null,
        col,
        2.2
      );
    }

    // Hàm vẽ một cá chép koinobori
    function drawCarp(attachY, len, h, bodyCol, accentCol, phaseOff) {
      const lift = wind * 16 - (1 - wind) * 18;
      const freq = 6 + wind * 8;
      const w1 = Math.sin(timeVal * freq + phaseOff) * (2 + wind * 6);
      const w2 = Math.sin(timeVal * freq + phaseOff + 1.1) * (3 + wind * 9);
      const w3 = Math.sin(timeVal * freq + phaseOff + 2.2) * (4 + wind * 13);

      const mouthX = 10, mouthY = attachY;
      // Dây buộc từ cột ra miệng cá
      line(ctx, [[0, attachY], [mouthX, mouthY - h * 0.4]], '#94a3b8', 1.0);
      line(ctx, [[0, attachY], [mouthX, mouthY + h * 0.4]], '#94a3b8', 1.0);

      // Miệng cá hình vành tròn mở to đón gió
      ellipse(ctx, mouthX, mouthY, 2.5, h * 0.45, '#1e293b', INK, 1.2);

      // Thân cá uốn lượn theo sóng gió
      const midX = mouthX + len * 0.5;
      const midY = mouthY - lift * 0.45 + w1;
      const tailBaseX = mouthX + len * 0.85;
      const tailBaseY = mouthY - lift * 0.85 + w2;
      const tailTipX = mouthX + len;
      const tailTipY = mouthY - lift + w3;

      // Đường viền thân cá
      const upperPath = `M ${mouthX} ${mouthY - h * 0.4} Q ${midX} ${midY - h * 0.5} ${tailBaseX} ${tailBaseY - h * 0.25} L ${tailTipX} ${tailTipY - h * 0.55} L ${tailBaseX + 4} ${tailBaseY} L ${tailTipX} ${tailTipY + h * 0.55} L ${tailBaseX} ${tailBaseY + h * 0.25} Q ${midX} ${midY + h * 0.5} ${mouthX} ${mouthY + h * 0.4} Z`;
      path(ctx, upperPath, bodyCol, INK, 1.4);

      // Vây lưng
      path(ctx, `M ${midX - 10} ${midY - h * 0.5} Q ${midX} ${midY - h * 0.8} ${midX + 10} ${midY - h * 0.4}`, bodyCol, INK, 1.0);
      // Vây ngực
      path(ctx, `M ${mouthX + 12} ${mouthY + h * 0.2} Q ${mouthX + 18} ${mouthY + h * 0.5} ${mouthX + 22} ${mouthY + h * 0.2}`, accentCol, INK, 0.8);

      // Mắt cá chép
      ellipse(ctx, mouthX + 8, mouthY - h * 0.05, 3.5, 3.5, '#ffffff', INK, 0.8);
      ellipse(ctx, mouthX + 8.5, mouthY - h * 0.05, 2, 2, '#0f172a', null);

      // Vảy cá hình vòm uốn lượn đẹp mắt
      for (let col = 0; col < 3; col++) {
        const sx = mouthX + 16 + col * (len * 0.2);
        const sy = midY + (col - 1) * (lift * 0.15) + (col === 1 ? w1 * 0.5 : 0);
        path(ctx, `M ${sx} ${sy - h * 0.28} Q ${sx + 6} ${sy} ${sx} ${sy + h * 0.28}`, null, accentCol, 1.6);
      }
    }

    // 1. Cá bố (Magoi - Đen lớn nhất)
    drawCarp(-210, 68, 24, '#1e293b', '#fbbf24', 0.0);
    // 2. Cá mẹ (Higoi - Đỏ tươi vừa)
    drawCarp(-155, 54, 19, '#dc2626', '#fee2e2', 0.8);
    // 3. Cá con (Koidomo - Xanh lam nhỏ)
    drawCarp(-110, 42, 15, '#0284c7', '#e0f2fe', 1.6);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 2. TANABATA_BAMBOO (Cành tre Tanabata treo dải giấy tanzaku)
  // -------------------------------------------------------------
  function drawTanabataBamboo(ctx, s, t) {
    ctx.save();
    const timeVal = t ?? 0;

    // Thân cành tre xanh mướt uốn cong duyên dáng từ (0, 0) lên y = -240
    const sway = Math.sin(timeVal * 1.5) * 4;
    path(ctx, `M 0 0 Q ${10 + sway * 0.3} -120 ${12 + sway} -240`, null, '#15803d', 6.0);
    path(ctx, `M 0 0 Q ${10 + sway * 0.3} -120 ${12 + sway} -240`, null, INK, 1.2);

    // Các đốt tre
    for (let y = -30; y >= -220; y -= 35) {
      const frac = -y / 240;
      const x = frac * 12 + sway * frac;
      ellipse(ctx, x, y, 4.5, 2.0, '#4ade80', INK, 0.8);
    }

    // Các nhánh tre tỏa ra hai bên
    const branches = [
      { x1: 2, y1: -70, x2: -35, y2: -95, leafDir: -1 },
      { x1: 5, y1: -115, x2: 42, y2: -140, leafDir: 1 },
      { x1: 7, y1: -155, x2: -38, y2: -175, leafDir: -1 },
      { x1: 10, y1: -195, x2: 25, y2: -190, leafDir: 1 }
    ];

    branches.forEach(b => {
      path(ctx, `M ${b.x1} ${b.y1} Q ${(b.x1 + b.x2) * 0.5} ${b.y2 + 8} ${b.x2} ${b.y2}`, null, '#16a34a', 2.4);
      // Chùm lá tre thuôn nhọn
      for (let i = -1; i <= 1; i++) {
        const lx = b.x2 + i * 8, ly = b.y2 + Math.abs(i) * 5;
        path(
          ctx,
          `M ${b.x2} ${b.y2} Q ${lx} ${ly - 8} ${lx + b.leafDir * 18} ${ly + 6} Q ${lx + b.leafDir * 8} ${ly + 2} ${b.x2} ${b.y2}`,
          '#22c55e',
          INK,
          0.8
        );
      }
    });

    // Dải giấy ước Tanzaku nhiều màu trơn (không chữ) treo đung đưa
    const tanzakus = [
      { x: -35, y: -95, col: '#f472b6', phase: 0.0, w: 10, h: 32 },   // Hồng (branch_1)
      { x: 42, y: -140, col: '#38bdf8', phase: 1.2, w: 10, h: 30 },   // Xanh da trời (branch_2)
      { x: 25, y: -190, col: '#facc15', phase: 2.3, w: 9, h: 28 },    // Vàng (branch_3)
      { x: -38, y: -175, col: '#4ade80', phase: 0.8, w: 9, h: 26 },   // Xanh lá
      { x: 18, y: -120, col: '#c084fc', phase: 1.8, w: 10, h: 30 }    // Tím nhạt
    ];

    tanzakus.forEach(tz => {
      const swing = Math.sin(timeVal * 2.2 + tz.phase) * 3.5;
      // Dây treo màu trắng
      line(ctx, [[tz.x, tz.y], [tz.x + swing * 0.3, tz.y + 10]], '#e2e8f0', 1.0);
      // Mảnh giấy tanzaku hình chữ nhật
      const jx = tz.x + swing * 0.3, jy = tz.y + 10;
      ctx.save();
      ctx.translate(jx, jy);
      ctx.rotate((swing * Math.PI) / 180);
      drawPoly(
        ctx,
        [[-tz.w * 0.5, 0], [tz.w * 0.5, 0], [tz.w * 0.5, tz.h], [-tz.w * 0.5, tz.h]],
        tz.col,
        INK,
        1.0
      );
      // Lỗ xỏ dây nhỏ ở đầu
      ellipse(ctx, 0, 3, 1.2, 1.2, '#ffffff', null);
      ctx.restore();
    });

    // Trang trí dây xích giấy origami ngũ sắc
    const chainCol = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6'];
    for (let k = 0; k < 4; k++) {
      ellipse(ctx, -15 + k * 4, -135 + k * 6, 3.5, 5, null, chainCol[k], 1.5);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 3. BAMBOO (Bụi thân tre - cây trồng & Kaguya)
  // -------------------------------------------------------------
  function drawBamboo(ctx, s, t) {
    ctx.save();
    const lit = clamp(s.lit ?? 0, 0, 1);
    const growth = clamp(s.growth ?? 1, 0.2, 1);
    const timeVal = t ?? 0;

    // 3 thân tre thẳng tắp vươn lên
    const culms = [
      { x: -18, h: 220 * growth, w: 8, col: '#16a34a' },
      { x: 0, h: 250 * growth, w: 10, col: '#15803d' },
      { x: 18, h: 200 * growth, w: 7.5, col: '#16a34a' }
    ];

    culms.forEach(c => {
      // Thân ống tre
      drawPoly(ctx, [[c.x - c.w * 0.5, 0], [c.x + c.w * 0.5, 0], [c.x + c.w * 0.5, -c.h], [c.x - c.w * 0.5, -c.h]], cylinder(ctx, c.x - c.w * 0.5, c.x + c.w * 0.5, c.col), INK, 1.2);
      // Các mắt tre (nodes)
      for (let y = -30; y >= -c.h + 20; y -= 40) {
        ellipse(ctx, c.x, y, c.w * 0.65, 2.2, '#86efac', INK, 0.8);
      }
    });

    // Lá tre xòe trên các ngọn
    culms.forEach(c => {
      for (let side of [-1, 1]) {
        const bx = c.x + side * (c.w * 0.5), by = -c.h * 0.85;
        path(ctx, `M ${bx} ${by} Q ${bx + side * 15} ${by - 12} ${bx + side * 28} ${by - 4}`, null, '#15803d', 1.8);
        for (let i = 0; i < 3; i++) {
          const lx = bx + side * (12 + i * 7), ly = by - 8 + i * 3;
          path(
            ctx,
            `M ${lx} ${ly} Q ${lx + side * 12} ${ly - 6} ${lx + side * 22} ${ly + 2} Q ${lx + side * 10} ${ly + 4} ${lx} ${ly}`,
            '#22c55e',
            INK,
            0.6
          );
        }
      }
    });

    // Hiệu ứng phát sáng cổ tích Kaguya trong ống tre giữa
    if (lit > 0.05) {
      const hollowY = -70 * growth;
      // Khuyết sáng trong thân tre
      ellipse(ctx, 0, hollowY, 4.5, 14, '#fef08a', null);
      // Ánh hào quang tỏa ra
      const grad = ctx.createRadialGradient(0, hollowY, 2, 0, hollowY, 32 * lit);
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
      grad.addColorStop(0.5, 'rgba(250, 204, 21, 0.5)');
      grad.addColorStop(1, 'rgba(250, 204, 21, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, hollowY, 32 * lit, 0, TAU);
      ctx.fill();

      // Đốm sáng lung linh bay lên
      for (let p = 0; p < 4; p++) {
        const py = hollowY - 8 - ((timeVal * 25 + p * 12) % 35);
        const px = Math.sin(timeVal * 3 + p) * 10;
        ellipse(ctx, px, py, 1.8, 1.8, '#ffffff', null);
      }
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 4. PAPER_LANTERN_JP (Đèn lồng giấy Chōchin truyền thống)
  // -------------------------------------------------------------
  function drawPaperLanternJp(ctx, s, t) {
    ctx.save();
    const lit = clamp(s.lit ?? 0, 0, 1);
    const bodyCol = s.style?.body || '#dc2626';

    // Quai xách kim loại phía trên từ y = -60 lên y = -72
    path(ctx, `M -9 -60 Q 0 -72 9 -60`, null, '#475569', 2.0);
    // Móc treo nhỏ tại grip
    ellipse(ctx, 0, -72, 2.5, 2.5, '#334155', null);

    // Cổ vành gỗ trên màu đen bóng
    ellipse(ctx, 0, -58, 16, 4.5, '#18181b', INK, 1.2);

    // Thân đèn lồng hình bầu dục phồng
    const lBody = `M -16 -58 C -26 -40 -26 -16 -14 -10 C -6 -7 6 -7 14 -10 C 26 -16 26 -40 16 -58 Z`;
    path(ctx, lBody, bodyCol, INK, 1.6);

    // Các nan tre tròn ôm quanh thân đèn (ribs)
    const ribs = [-48, -38, -28, -18];
    ribs.forEach(ry => {
      const rx = 18 - Math.abs(ry + 33) * 0.4;
      path(ctx, `M ${-rx} ${ry} Q 0 ${ry + 3.5} ${rx} ${ry}`, null, tone(bodyCol, -0.3), 1.4);
    });

    // Khi đèn được thắp sáng (lit > 0)
    if (lit > 0.05) {
      const grad = ctx.createRadialGradient(0, -34, 4, 0, -34, 22);
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
      grad.addColorStop(0.6, 'rgba(245, 158, 11, 0.55)');
      grad.addColorStop(1, 'rgba(220, 38, 38, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, -34, 20, 22, 0, 0, TAU);
      ctx.fill();
    }

    // Cổ vành gỗ dưới màu đen bóng
    ellipse(ctx, 0, -10, 14, 4, '#18181b', INK, 1.2);

    // Dải tua rua đỏ (tassel) rủ xuống đất y = 0
    line(ctx, [[0, -10], [0, -3]], '#7f1d1d', 3.0);
    ellipse(ctx, 0, -3, 3, 2, '#f59e0b', null);
    path(ctx, `M -3.5 -3 L -4.5 0 L 4.5 0 L 3.5 -3 Z`, '#dc2626', INK, 0.8);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 5. SCHOOL_BAG_RANDOSERU (Cặp sách học sinh tiểu học Randoseru)
  // -------------------------------------------------------------
  function drawSchoolBagRandoseru(ctx, s, t) {
    ctx.save();
    const bagCol = s.style?.body || '#991b1b'; // Đỏ thắm truyền thống
    const trimCol = '#b91c1c';

    // Thân cặp hình hộp cứng chữ nhật bo góc đứng từ y = 0 lên y = -52
    const w = 42, h = 52;
    drawPoly(
      ctx,
      [[-w * 0.5, -h], [w * 0.5, -h], [w * 0.5, 0], [-w * 0.5, 0]],
      bagCol,
      INK,
      1.6
    );

    // Nắp cặp lớn (Kabuse) phủ qua mặt trước bo tròn đẹp mắt
    path(
      ctx,
      `M ${-w * 0.5 - 1} ${-h + 4} Q 0 ${-h - 2} ${w * 0.5 + 1} ${-h + 4} L ${w * 0.5 + 1} -12 Q 0 -8 ${-w * 0.5 - 1} -12 Z`,
      trimCol,
      INK,
      1.4
    );

    // Đường viền phản quang màu vàng chanh an toàn
    path(ctx, `M ${-w * 0.5 + 2} -14 Q 0 -10 ${w * 0.5 - 2} -14`, null, '#facc15', 2.0);

    // Khóa kim loại tự động ở đáy (Lock tsumami)
    drawPoly(ctx, [[-6, -8], [6, -8], [6, -2], [-6, -2]], '#e2e8f0', INK, 1.0);
    ellipse(ctx, 0, -5, 2.5, 2, '#475569', null);

    // Móc treo kim loại hình chữ D hai bên hông (D-ring)
    path(ctx, `M ${-w * 0.5} -28 Q ${-w * 0.5 - 4} -28 ${-w * 0.5 - 4} -24 Q ${-w * 0.5 - 4} -20 ${-w * 0.5} -20`, null, '#cbd5e1', 2.0);
    path(ctx, `M ${w * 0.5} -28 Q ${w * 0.5 + 4} -28 ${w * 0.5 + 4} -24 Q ${w * 0.5 + 4} -20 ${w * 0.5} -20`, null, '#cbd5e1', 2.0);

    // Quai xách da nhỏ trên nóc cặp
    path(ctx, `M -9 -h Q 0 ${-h - 6} 9 -h`, null, tone(bagCol, -0.3), 3.0);
    path(ctx, `M -9 -h Q 0 ${-h - 6} 9 -h`, null, INK, 1.0);

    // Dây đeo vai đệm dày êm ái
    path(ctx, `M -14 -42 Q -22 -26 -14 -8`, null, tone(bagCol, -0.4), 4.0);
    path(ctx, `M 14 -42 Q 22 -26 14 -8`, null, tone(bagCol, -0.4), 4.0);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 6. TRAIN_TICKET_GATE (Cổng soát vé tự động nhà ga)
  // -------------------------------------------------------------
  function drawTrainTicketGate(ctx, s, t) {
    ctx.save();
    const w = 58, h = 90;

    // Thân trụ inox bo tròn đứng trên nền y = 0
    const steelGrad = ctx.createLinearGradient(-w * 0.5, 0, w * 0.5, 0);
    steelGrad.addColorStop(0, '#94a3b8');
    steelGrad.addColorStop(0.3, '#f1f5f9');
    steelGrad.addColorStop(0.7, '#cbd5e1');
    steelGrad.addColorStop(1, '#64748b');

    drawPoly(
      ctx,
      [[-w * 0.5, 0], [w * 0.5, 0], [w * 0.5, -h + 8], [w * 0.5 - 6, -h], [-w * 0.5 + 6, -h], [-w * 0.5, -h + 8]],
      steelGrad,
      INK,
      1.6
    );

    // Rãnh phân cách kỹ thuật
    line(ctx, [[-w * 0.5, -45], [w * 0.5, -45]], '#475569', 1.0);

    // Mặt nghiêng đặt cảm biến chạm thẻ IC ở góc trên
    drawPoly(ctx, [[2, -h + 3], [w * 0.5 - 4, -h + 3], [w * 0.5 - 2, -h + 16], [4, -h + 16]], '#1e293b', INK, 1.0);
    // Vùng chạm thẻ IC tròn sáng màu xanh dương
    ellipse(ctx, 14, -h + 9.5, 6, 4, '#0284c7', null);
    // Biểu tượng sóng không dây phát sáng
    path(ctx, `M 12 ${-h + 8} Q 14 ${-h + 6.5} 16 ${-h + 8}`, null, '#e0f2fe', 1.2);

    // Màn hình chỉ dẫn LED (Mũi tên xanh lá đi tới - ZERO text)
    drawPoly(ctx, [[-w * 0.5 + 4, -h + 3], [-2, -h + 3], [-2, -h + 16], [-w * 0.5 + 4, -h + 16]], '#0f172a', INK, 1.0);
    // Mũi tên xanh lá sáng
    path(ctx, `M -14 ${-h + 13} L -8 ${-h + 6} L -8 ${-h + 9} L -4 ${-h + 9} L -4 ${-h + 13} Z`, '#22c55e', null);

    // Cánh cửa gạt an toàn cao su màu xanh lam
    const flapOpen = clamp(s.open ?? 0, 0, 1);
    const flapW = 22 * (1 - flapOpen * 0.85);
    drawPoly(
      ctx,
      [[-w * 0.5, -60], [-w * 0.5 - flapW, -56], [-w * 0.5 - flapW, -34], [-w * 0.5, -38]],
      '#0284c7',
      INK,
      1.2
    );

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 7. PHEASANT (Chim trĩ xanh Kiji - Gà lôi Momotarō)
  // -------------------------------------------------------------
  function drawPheasant(ctx, s, t) {
    ctx.save();
    const walk = s.walk ?? 0, stride = s.stride ?? 0;
    const bodyCol = '#047857'; // Xanh ngọc lục bảo óng ánh

    // Đôi chân gà lôi: 2 chân bước chạm y = 0
    for (const [lx, off] of [[-4, 0], [10, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 8;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 7;
      const fx = lx + sw, fy = -lift;
      const kx = lx * 0.7 + fx * 0.3;
      limb(ctx, [[lx, -30], [kx, -14], [fx, fy]], '#ca8a04', 2.8);
      // 3 ngón trước xòe và cựa sau
      line(ctx, [[fx, fy], [fx + 7, fy]], '#a16207', 1.6);
      line(ctx, [[fx, fy], [fx - 5, fy - 2]], '#a16207', 1.4);
      line(ctx, [[fx, fy], [fx + 5, fy - 3]], '#a16207', 1.4);
    }

    // Chiếc đuôi dài sọc ngang đặc trưng vuốt dài ra phía sau
    const tailPts = [
      [-16, -42], [-45, -34], [-82, -18], [-80, -12], [-42, -28], [-12, -34]
    ];
    drawPoly(ctx, tailPts, '#78350f', INK, 1.4);
    // Các vạch sọc ngang trên lông đuôi
    for (let tx = -24; tx >= -72; tx -= 10) {
      const ty = -38 - (tx + 16) * 0.38;
      line(ctx, [[tx, ty - 3], [tx + 2, ty + 3]], '#fef08a', 1.6);
    }

    // Thân chim hình thoi tròn đầy đặn
    ellipse(ctx, 4, -40, 22, 16, bodyCol, INK, 1.6);
    // Cánh khép với hoa văn vỏ sò màu nâu đồng
    path(
      ctx,
      `M -6 -50 C 12 -52 18 -40 8 -32 C -2 -28 -14 -36 -6 -50 Z`,
      '#92400e',
      INK,
      1.2
    );
    for (let i = 0; i < 3; i++) {
      path(ctx, `M ${-2 + i * 4} -44 Q ${2 + i * 4} -38 ${-2 + i * 4} -34`, null, '#fef08a', 1.2);
    }

    // Cổ chim trĩ uốn cong kiêu hãnh
    const hx = 24, hy = -70;
    path(ctx, `M 14 -48 Q 20 -58 ${hx} ${hy}`, null, '#065f46', 9.0);
    path(ctx, `M 14 -48 Q 20 -58 ${hx} ${hy}`, null, INK, 1.2);

    // Vành cổ màu trắng sáng
    path(ctx, `M 18 -56 Q 22 -55 24 -57`, null, '#ffffff', 2.2);

    // Đầu chim trĩ
    ellipse(ctx, hx, hy, 8, 7, '#064e3b', INK, 1.2);

    // Mảng da đỏ tươi quanh mắt (wattles)
    ellipse(ctx, hx + 1, hy - 1, 5, 4.5, '#dc2626', null);

    // Mắt tròn vàng với con ngươi đen
    ellipse(ctx, hx + 1, hy - 1, 2, 2, '#fef08a', null);
    ellipse(ctx, hx + 1.2, hy - 1, 1.2, 1.2, '#0f172a', null);

    // Mỏ chim nhọn màu sừng vàng
    drawPoly(ctx, [[hx + 6, hy - 2], [hx + 15, hy], [hx + 6, hy + 2]], '#facc15', INK, 1.0);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 8. CRAB (Cua Sawagani đỏ tươi lém lỉnh)
  // -------------------------------------------------------------
  function drawCrab(ctx, s, t) {
    ctx.save();
    const walk = s.walk ?? 0, stride = s.stride ?? 0;
    const crabCol = s.style?.body || '#ef4444';

    // 3 đôi chân bò hai bên chạm đất y = 0
    for (let side of [-1, 1]) {
      for (let leg = 0; leg < 3; leg++) {
        const lx = side * (12 + leg * 9);
        const off = leg * 1.0 + (side === 1 ? Math.PI : 0);
        const sw = -Math.sin(stride + off) * walk * 4;
        const lift = Math.max(0, -Math.cos(stride + off)) * walk * 4;
        const footX = side * (26 + leg * 12) + sw;
        const footY = -lift;
        const kneeX = side * (22 + leg * 8);
        const kneeY = -24 - leg * 2;
        limb(ctx, [[lx, -24], [kneeX, kneeY], [footX, footY]], tone(crabCol, -0.15), 3.0);
      }
    }

    // Hai chiếc càng lớn giơ cao đầy tự tin
    for (let side of [-1, 1]) {
      const armBaseX = side * 16, armBaseY = -32;
      const elbowX = side * 34, elbowY = -48;
      const clawX = side * 42, clawY = -45;
      limb(ctx, [[armBaseX, armBaseY], [elbowX, elbowY], [clawX, clawY]], crabCol, 5.0);

      // Bàn kẹp càng cua gồm 2 ngàm đóng mở
      const pinch = clamp(s.open ?? 0.3, 0, 1) * 6;
      // Ngàm cố định
      path(
        ctx,
        `M ${clawX} ${clawY} Q ${clawX + side * 14} ${clawY - 14} ${clawX + side * 4} ${clawY - 20} Q ${clawX + side * 2} ${clawY - 10} ${clawX} ${clawY}`,
        crabCol,
        INK,
        1.2
      );
      // Ngàm di động
      path(
        ctx,
        `M ${clawX} ${clawY} Q ${clawX + side * 12 + side * pinch} ${clawY + 6} ${clawX + side * 2} ${clawY + 12} Q ${clawX} ${clawY + 4} ${clawX} ${clawY}`,
        tone(crabCol, 0.1),
        INK,
        1.2
      );
    }

    // Mai cua tròn dẹt gợn sóng màu đỏ cam bóng
    ellipse(ctx, 0, -28, 24, 16, crabCol, INK, 1.8);
    // Vết lồi gân mai tự nhiên
    path(ctx, `M -10 -32 Q 0 -36 10 -32`, null, tone(crabCol, -0.25), 1.6);
    path(ctx, `M -14 -24 Q 0 -20 14 -24`, null, tone(crabCol, 0.2), 1.4);

    // Hai mắt cuống thò lên cao ngộ nghĩnh
    for (let side of [-1, 1]) {
      const sx = side * 7;
      line(ctx, [[sx, -36], [sx, -48]], crabCol, 2.5);
      ellipse(ctx, sx, -50, 4.5, 4.5, '#ffffff', INK, 1.2);
      ellipse(ctx, sx + side * 0.8, -50, 2.5, 2.5, '#0f172a', null);
      ellipse(ctx, sx + side * 0.4, -51.5, 1.0, 1.0, '#ffffff', null);
    }

    // Miệng cua nhỏ xinh chúm chím
    path(ctx, `M -4 -22 Q 0 -19 4 -22`, null, INK, 1.4);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 9. TANUKI (Gấu mèo dân gian Nhật Bản - BAKE-DANUKI, TỰ THIẾT KẾ)
  // -------------------------------------------------------------
  function drawTanuki(ctx, s, t) {
    ctx.save();
    const walk = s.walk ?? 0, stride = s.stride ?? 0;
    const bodyCol = s.style?.body || '#78350f'; // Lông nâu sẫm
    const bellyCol = '#fef3c7'; // Bụng tròn màu kem
    const maskCol = '#292524'; // Mặt nạ mắt đen

    // Đôi chân ngắn mũm mĩm đứng vững tại y = 0
    for (const [lx, off] of [[-18, 0], [18, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 6;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 5;
      const fx = lx + sw, fy = -lift;
      limb(ctx, [[lx, -35], [fx, fy]], tone(bodyCol, -0.2), 12.0);
      ellipse(ctx, fx, fy - 2, 7, 3.5, '#1c1917', INK, 1.0);
    }

    // Chiếc đuôi xù to lớn có sọc cong phía sau
    const tailPts = `M -28 -55 Q -65 -50 -58 -25 Q -52 -10 -30 -35 Z`;
    path(ctx, tailPts, bodyCol, INK, 1.6);
    // Vòng sọc đen trên đuôi
    path(ctx, `M -45 -48 Q -55 -35 -40 -26`, null, maskCol, 4.0);

    // Thân hình quả lê béo tròn đáng yêu
    ellipse(ctx, 0, -68, 42, 46, bodyCol, INK, 1.8);

    // Cái bụng tròn xoe màu kem (bụng trống Pompoko dân gian)
    ellipse(ctx, 0, -62, 28, 30, bellyCol, INK, 1.2);

    // Hai tay ngắn múp míp
    for (let side of [-1, 1]) {
      const hx = side * 36, hy = -72;
      limb(ctx, [[side * 28, -88], [hx, hy]], bodyCol, 9.0);
      ellipse(ctx, hx, hy, 5, 5, '#1c1917', INK, 1.0);
    }

    // Đầu gấu mèo tròn trịa
    const headY = -115;
    ellipse(ctx, 0, headY, 32, 26, bodyCol, INK, 1.8);

    // Hai tai tròn có viền lông trắng bên trong
    for (let side of [-1, 1]) {
      const ex = side * 22, ey = headY - 22;
      ellipse(ctx, ex, ey, 9, 8, bodyCol, INK, 1.2);
      ellipse(ctx, ex, ey, 5, 5, '#ffffff', null);
    }

    // Mặt nạ lông đen hai bên mắt đặc trưng
    ellipse(ctx, -12, headY, 9, 7.5, maskCol, null);
    ellipse(ctx, 12, headY, 9, 7.5, maskCol, null);

    // Đôi mắt to tròn long lanh thân thiện
    drawEye(ctx, -12, headY, 4.5, s.blink ?? 0, 1, '#451a03');
    drawEye(ctx, 12, headY, 4.5, s.blink ?? 0, 1, '#451a03');

    // Mõm tròn màu kem, mũi đen và miệng cười
    ellipse(ctx, 0, headY + 8, 11, 8, bellyCol, INK, 0.8);
    ellipse(ctx, 0, headY + 5, 3.5, 2.5, '#18181b', null);
    path(ctx, `M -4 ${headY + 10} Q 0 ${headY + 13} 4 ${headY + 10}`, null, INK, 1.4);

    // Chiếc lá xanh nhỏ cài nghiêng trên đầu (biểu tượng phép biến hóa dân gian)
    const leafY = headY - 25;
    path(
      ctx,
      `M -2 ${leafY + 6} Q 6 ${leafY - 6} 14 ${leafY - 2} Q 8 ${leafY + 10} -2 ${leafY + 6}`,
      '#22c55e',
      INK,
      1.0
    );
    line(ctx, [[-2, leafY + 6], [12, leafY - 1]], '#15803d', 0.8);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 10. CRANE (Sếu đầu đỏ Tancho / Tsuru thanh nhã)
  // -------------------------------------------------------------
  function drawCrane(ctx, s, t) {
    ctx.save();
    ctx.scale(0.8, 0.8);  // hình gốc cao ~125 đơn vị: thu về trong khung 100 (anchor catalog đã nhân 0.8)
    const walk = s.walk ?? 0, stride = s.stride ?? 0;
    const legCol = '#334155';

    // Đôi chân dài khẳng khiu như chiếc cà kheo chạm đất y = 0
    for (const [lx, off] of [[-8, 0], [10, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 8;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 8;
      const fx = lx + sw, fy = -lift;
      const kx = lx * 0.7 + fx * 0.3;
      limb(ctx, [[lx, -90], [kx, -45], [fx, fy]], legCol, 3.2);
      // 3 ngón chân xòe bám đất
      line(ctx, [[fx, fy], [fx + 9, fy]], legCol, 1.8);
      line(ctx, [[fx, fy], [fx - 6, fy]], legCol, 1.4);
      line(ctx, [[fx, fy], [fx + 6, fy - 3]], legCol, 1.4);
    }

    // Đuôi chùm lông đen tuyền óng ả phía sau
    const tailFeathers = `M -20 -115 Q -48 -105 -52 -82 Q -35 -92 -15 -102 Z`;
    path(ctx, tailFeathers, '#0f172a', INK, 1.2);

    // Thân sếu hình bầu dục trắng như tuyết
    ellipse(ctx, 4, -118, 26, 18, '#ffffff', INK, 1.8);

    // Cổ dài chữ S kiêu hãnh vươn cao
    const hx = 24, hy = -198;
    path(ctx, `M 14 -130 Q 32 -155 18 -180 L ${hx} ${hy}`, null, '#ffffff', 8.5);
    path(ctx, `M 14 -130 Q 32 -155 18 -180 L ${hx} ${hy}`, null, INK, 1.2);

    // Vệt đen ở cổ họng sếu
    path(ctx, `M 22 -186 Q 26 -175 22 -162`, null, '#0f172a', 4.5);

    // Đầu sếu nhỏ gọn trắng muốt
    ellipse(ctx, hx, hy, 9, 7.5, '#ffffff', INK, 1.2);

    // Mào đỏ son rực rỡ trên đỉnh đầu (Crown của Tancho)
    ellipse(ctx, hx - 1, hy - 7, 5, 2.8, '#dc2626', null);

    // Mắt sếu đen có vành trắng
    ellipse(ctx, hx + 2, hy - 1, 2.2, 2.2, '#0f172a', null);
    ellipse(ctx, hx + 1.5, hy - 1.5, 0.8, 0.8, '#ffffff', null);

    // Mỏ dài nhọn màu sừng xanh xám
    drawPoly(ctx, [[hx + 7, hy - 2], [hx + 32, hy], [hx + 7, hy + 2]], '#84cc16', INK, 1.0);
    line(ctx, [[hx + 7, hy], [hx + 30, hy]], '#4d7c0f', 0.8);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 11. KOI (Cá chép Nishikigoi bơi uyển chuyển)
  // -------------------------------------------------------------
  function drawKoi(ctx, s, t) {
    ctx.save();
    const timeVal = t ?? 0;
    const speed = clamp(Math.abs(s.vx ?? 0) / 60, 0, 1);
    const rate = 5 * (1 + speed * 0.8);
    const wig = Math.sin(timeVal * rate + (hash(s.id ?? 'koi') % 10));

    // Đuôi xòe bơi quẫy nước mềm mại
    const tailX = -55 + wig * 6, tailY = -48 + wig * 4;
    const tailShape = `M -36 -48 Q -48 ${-54 + wig * 5} ${tailX} ${tailY - 14} Q -46 -48 ${tailX} ${tailY + 14} Q -48 ${-42 + wig * 5} -36 -48 Z`;
    path(ctx, tailShape, '#ffffff', INK, 1.4);
    for (let dy of [-8, 0, 8]) {
      line(ctx, [[-38, -48], [tailX + 4, tailY + dy]], '#f87171', 1.0);
    }

    // Vây lưng dài mềm uốn theo sóng
    path(ctx, `M -18 -68 Q 0 ${-76 - wig * 3} 18 -66 Z`, '#ffffff', INK, 1.2);
    // Vây bụng
    path(ctx, `M -6 -28 Q 6 -20 14 -28 Z`, '#ffffff', INK, 1.0);

    // Thân cá chép hình thoi thuôn màu trắng sứ
    const bodyShape = `M 42 -48 Q 36 -68 6 -68 Q -24 -68 -38 -48 Q -24 -28 6 -28 Q 36 -28 42 -48 Z`;
    path(ctx, bodyShape, '#f8fafc', INK, 1.8);

    // Các mảng khoang đỏ Kohaku (Danmoyo) rực rỡ đặc trưng
    ctx.save();
    ctx.clip(new Path2D(bodyShape));
    ellipse(ctx, 22, -48, 12, 10, '#dc2626', null);
    ellipse(ctx, 0, -56, 16, 8, '#dc2626', null);
    ellipse(ctx, -18, -46, 11, 7, '#dc2626', null);
    // Chấm đen Sumi điểm xuyết tinh tế
    ellipse(ctx, -6, -42, 5, 4, '#1e293b', null);
    ellipse(ctx, 12, -40, 4, 3, '#1e293b', null);
    ctx.restore();

    // Vây ngực lớn hình cánh quạt bơi lượn
    const pecY = -40 + wig * 3;
    path(ctx, `M 14 -44 Q 4 ${pecY} 2 ${pecY + 8} Q 12 ${pecY + 4} 18 -42 Z`, '#ffffff', INK, 1.0);

    // Mắt cá chép
    ellipse(ctx, 32, -54, 3, 3, '#ffffff', INK, 0.8);
    ellipse(ctx, 33, -54, 1.8, 1.8, '#0f172a', null);

    // Râu cá (barbels) ở mép miệng
    path(ctx, `M 40 -46 Q 46 -44 48 -40`, null, '#cbd5e1', 1.4);
    path(ctx, `M 40 -50 Q 46 -52 48 -56`, null, '#cbd5e1', 1.4);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 12. SNOW_MONKEY (Khỉ tuyết Nhật Bản Nihonzaru mặt đỏ)
  // -------------------------------------------------------------
  function drawSnowMonkey(ctx, s, t) {
    ctx.save();
    const walk = s.walk ?? 0, stride = s.stride ?? 0;
    const furCol = s.style?.body || '#a8a29e'; // Lông dày xám ấm
    const faceCol = '#f43f5e'; // Mặt đỏ hồng đặc trưng khỉ tuyết

    // Đôi chân ngồi/đứng vững trên nền tuyết y = 0
    for (const [lx, off] of [[-18, 0], [18, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 5;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 4;
      const fx = lx + sw, fy = -lift;
      limb(ctx, [[lx, -35], [fx, fy]], tone(furCol, -0.2), 11.0);
      ellipse(ctx, fx, fy - 2, 7, 3.5, '#fb7185', INK, 1.0);
    }

    // Đuôi lông ngắn cụt ngủn
    path(ctx, `M -24 -48 Q -34 -45 -30 -36`, null, furCol, 5.0);

    // Thân khỉ phủ lớp lông xù dày chống rét
    ellipse(ctx, 0, -62, 34, 38, furCol, INK, 1.8);
    // Bụng lông sáng màu
    ellipse(ctx, 0, -58, 20, 24, tone(furCol, 0.2), null);

    // Đôi tay phủ lông với bàn tay hồng hào
    for (let side of [-1, 1]) {
      const hx = side * 28, hy = -52;
      limb(ctx, [[side * 22, -80], [hx, hy]], furCol, 8.0);
      ellipse(ctx, hx, hy, 5, 4.5, '#fb7185', INK, 0.8);
    }

    // Đầu khỉ tròn trịa với bờm lông xù bao quanh
    const headY = -95;
    ellipse(ctx, 0, headY, 28, 25, furCol, INK, 1.8);
    // Viền lông xù trắng quanh mặt
    for (let i = -3; i <= 3; i++) {
      ellipse(ctx, i * 7, headY + 12, 6, 6, tone(furCol, 0.25), null);
    }

    // Mặt đỏ hồng không lông hình trái tim/bầu dục
    ellipse(ctx, 0, headY, 18, 16, faceCol, INK, 1.2);

    // Đôi mắt nâu tròn thông minh, biểu cảm sâu lắng
    drawEye(ctx, -7, headY - 2, 3.5, s.blink ?? 0, 1, '#451a03');
    drawEye(ctx, 7, headY - 2, 3.5, s.blink ?? 0, 1, '#451a03');

    // Mũi tẹt và miệng khỉ
    ellipse(ctx, -2, headY + 5, 1.2, 1.5, '#9f1239', null);
    ellipse(ctx, 2, headY + 5, 1.2, 1.5, '#9f1239', null);
    path(ctx, `M -4 ${headY + 10} Q 0 ${headY + 12} 4 ${headY + 10}`, null, INK, 1.2);

    // Đôi tai hồng hai bên đầu
    ellipse(ctx, -20, headY, 4.5, 6, faceCol, INK, 0.8);
    ellipse(ctx, 20, headY, 4.5, 6, faceCol, INK, 0.8);

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS (5 hình nền chuẩn ground_y: 810, 7 weathers, day/night, ZERO text)
  // =============================================================

  // 1. EDO_TOWN (Phố cổ Edo truyền thống)
  function drawEdoTown(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings.night || settings.time === 'night');
    const groundY = settings.ground_y || 810;

    // Bầu trời
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(1, '#1e1b4b');
    } else {
      sky.addColorStop(0, '#7dd3fc');
      sky.addColorStop(1, '#fef9c3');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(x0, 0, x1 - x0, groundY * 0.65);

    // Mặt trăng đêm / Mặt trời ngày
    if (isNight) {
      ellipse(ctx, 460, 120, 24, 24, '#fef08a', null);
      ellipse(ctx, 470, 116, 20, 20, '#030712', null);
      // Sao đêm lấp lánh
      for (let s of [[80, 80], [180, 110], [290, 70], [380, 140], [120, 160]]) {
        ellipse(ctx, s[0], s[1], 1.5, 1.5, '#ffffff', null);
      }
      if (x0 < 0) {
        for (let s of [[x0 + 60, 90], [x0 + 140, 130], [x0 + 220, 70]]) {
          ellipse(ctx, s[0], s[1], 1.5, 1.5, '#ffffff', null);
        }
      }
      if (x1 > PANEL) {
        for (let s of [[PANEL + 60, 80], [PANEL + 150, 120], [PANEL + 230, 95]]) {
          ellipse(ctx, s[0], s[1], 1.5, 1.5, '#ffffff', null);
        }
      }
    } else {
      ellipse(ctx, 480, 100, 32, 32, '#fbbf24', null);
      ellipse(ctx, 480, 100, 26, 26, '#fef08a', null);
    }

    // Núi Phú Sĩ xa xa với chóp tuyết trắng xóa
    const fujiBaseY = groundY * 0.65;
    const fujiColor = isNight ? '#1e1b4b' : '#64748b';
    drawPoly(ctx, [[140, fujiBaseY], [440, fujiBaseY], [290, fujiBaseY - 180]], fujiColor, null);
    // Chóp nón tuyết trắng đỉnh núi
    drawPoly(ctx, [[260, fujiBaseY - 144], [320, fujiBaseY - 144], [290, fujiBaseY - 180]], '#f8fafc', null);

    // Dãy nhà cổ Machiya thời Edo hai bên phố
    const houseBaseY = groundY * 0.65;
    const wallCol = isNight ? '#1f2937' : '#f5f5f4';
    const timberCol = isNight ? '#111827' : '#3d2314';
    const tileCol = isNight ? '#0f172a' : '#334155';

    // Nhà mở rộng bên trái
    if (x0 < 0) {
      for (let hx = -240; hx + 240 > x0; hx -= 240) {
        drawPoly(ctx, [[hx, houseBaseY], [hx + 240, houseBaseY], [hx + 240, houseBaseY - 180], [hx, houseBaseY - 180]], wallCol, INK, 1.4);
        for (let x = hx; x <= hx + 240; x += 60) {
          line(ctx, [[x, houseBaseY], [x, houseBaseY - 180]], timberCol, 4.0);
        }
        line(ctx, [[hx, houseBaseY - 90], [hx + 240, houseBaseY - 90]], timberCol, 4.0);
        for (let x = hx + 15; x < hx + 220; x += 15) {
          line(ctx, [[x, houseBaseY], [x, houseBaseY - 80]], timberCol, 1.2);
        }
        drawPoly(ctx, [[hx - 15, houseBaseY - 170], [hx + 255, houseBaseY - 170], [hx + 245, houseBaseY - 215], [hx - 5, houseBaseY - 215]], tileCol, INK, 1.8);
      }
    }

    // Nhà 1 bên trái (x: 0 -> 240)
    drawPoly(ctx, [[0, houseBaseY], [240, houseBaseY], [240, houseBaseY - 180], [0, houseBaseY - 180]], wallCol, INK, 1.4);
    // Cột và xà gỗ timber post
    for (let x = 0; x <= 240; x += 60) {
      line(ctx, [[x, houseBaseY], [x, houseBaseY - 180]], timberCol, 4.0);
    }
    line(ctx, [[0, houseBaseY - 90], [240, houseBaseY - 90]], timberCol, 4.0);
    // Cửa trượt nan gỗ Koshi tầng 1
    for (let x = 15; x < 220; x += 15) {
      line(ctx, [[x, houseBaseY], [x, houseBaseY - 80]], timberCol, 1.2);
    }
    // Mái ngói Kawara dốc với đầu hồi uốn cong
    drawPoly(ctx, [[-15, houseBaseY - 170], [255, houseBaseY - 170], [245, houseBaseY - 215], [-5, houseBaseY - 215]], tileCol, INK, 1.8);
    // Rèm Noren xanh chàm treo trước cửa (mon hình sóng tròn - ZERO text)
    drawPoly(ctx, [[70, houseBaseY - 85], [170, houseBaseY - 85], [170, houseBaseY - 55], [70, houseBaseY - 55]], '#1e3a8a', INK, 1.0);
    ellipse(ctx, 120, houseBaseY - 70, 7, 7, '#ffffff', null);
    ellipse(ctx, 120, houseBaseY - 70, 4.5, 4.5, '#1e3a8a', null);

    // Nhà 2 bên phải (x: 290 -> 576)
    drawPoly(ctx, [[290, houseBaseY], [576, houseBaseY], [576, houseBaseY - 190], [290, houseBaseY - 190]], wallCol, INK, 1.4);
    for (let x = 290; x <= 576; x += 65) {
      line(ctx, [[x, houseBaseY], [x, houseBaseY - 190]], timberCol, 4.0);
    }
    line(ctx, [[290, houseBaseY - 95], [576, houseBaseY - 95]], timberCol, 4.0);
    drawPoly(ctx, [[275, houseBaseY - 180], [590, houseBaseY - 180], [580, houseBaseY - 225], [285, houseBaseY - 225]], tileCol, INK, 1.8);
    // Đèn lồng đỏ treo dưới mái hiên nhà phải
    ellipse(ctx, 360, houseBaseY - 150, 10, 14, '#dc2626', INK, 1.0);
    if (isNight) ellipse(ctx, 360, houseBaseY - 150, 6, 8, '#fef08a', null);

    // Nhà mở rộng bên phải
    if (x1 > PANEL) {
      for (let hx = 576; hx < x1; hx += 240) {
        drawPoly(ctx, [[hx, houseBaseY], [hx + 240, houseBaseY], [hx + 240, houseBaseY - 190], [hx, houseBaseY - 190]], wallCol, INK, 1.4);
        for (let x = hx; x <= hx + 240; x += 60) {
          line(ctx, [[x, houseBaseY], [x, houseBaseY - 190]], timberCol, 4.0);
        }
        line(ctx, [[hx, houseBaseY - 95], [hx + 240, houseBaseY - 95]], timberCol, 4.0);
        drawPoly(ctx, [[hx - 15, houseBaseY - 180], [hx + 255, houseBaseY - 180], [hx + 245, houseBaseY - 225], [hx - 5, houseBaseY - 225]], tileCol, INK, 1.8);
      }
    }

    // Mặt đường phố lát đá cuội / đất nện trải dài tới đáy khung
    const street = ctx.createLinearGradient(0, houseBaseY, 0, 1024);
    street.addColorStop(0, isNight ? '#1e293b' : '#78716c');
    street.addColorStop(1, isNight ? '#0f172a' : '#57534e');
    ctx.fillStyle = street;
    ctx.fillRect(x0, houseBaseY, x1 - x0, 1024 - houseBaseY);

    // Rãnh thoát nước lát đá hai bên đường
    line(ctx, [[x0, houseBaseY + 15], [x1, houseBaseY + 15]], isNight ? '#0f172a' : '#44403c', 2.0);
  }

  // 2. JP_SCHOOL (Lớp học Nhật Bản với sàn gỗ & bảng đen)
  function drawJpSchool(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings.night || settings.time === 'night');
    const groundY = settings.ground_y || 810;
    const dirty = clamp(settings.dirty ?? 0, 0, 1);

    // Tường lớp học màu be ấm áp
    const wallCol = isNight ? '#1f2937' : '#fef9c3';
    ctx.fillStyle = wallCol;
    ctx.fillRect(x0, 0, x1 - x0, groundY * 0.68);

    // Cửa sổ mở rộng bên trái
    const winSky = isNight ? '#020617' : '#38bdf8';
    if (x0 < -150) {
      for (let wx = -140; wx >= x0 + 120; wx -= 150) {
        ctx.fillStyle = winSky;
        ctx.fillRect(wx - 120, 60, 120, groundY * 0.58);
        if (!isNight) {
          ellipse(ctx, wx - 80, groundY * 0.45, 45, 55, '#16a34a', null);
        }
        for (let y = 60; y <= groundY * 0.58 + 60; y += 70) {
          line(ctx, [[wx - 120, y], [wx, y]], '#92400e', 2.5);
        }
        line(ctx, [[wx - 60, 60], [wx - 60, groundY * 0.58 + 60]], '#92400e', 2.5);
      }
    }

    // Cửa sổ kính lớn nhìn ra sân trường bên trái (x: 0 -> 140)
    ctx.fillStyle = winSky;
    ctx.fillRect(10, 60, 120, groundY * 0.58);
    // Cây xanh ngoài cửa sổ
    if (!isNight) {
      ellipse(ctx, 40, groundY * 0.45, 45, 55, '#16a34a', null);
      ellipse(ctx, 90, groundY * 0.4, 40, 50, '#22c55e', null);
    }
    // Khung cửa sổ gỗ
    for (let y = 60; y <= groundY * 0.58 + 60; y += 70) {
      line(ctx, [[10, y], [130, y]], '#92400e', 2.5);
    }
    line(ctx, [[70, 60], [70, groundY * 0.58 + 60]], '#92400e', 2.5);

    // Bảng đen gỗ lớn ở giữa lớp (Chalkboard - ZERO text)
    const boardX = 160, boardW = 390, boardH = 200, boardY = 120;
    drawPoly(ctx, [[boardX, boardY], [boardX + boardW, boardY], [boardX + boardW, boardY + boardH], [boardX, boardY + boardH]], '#14532d', INK, 3.0);
    // Khung viền gỗ bảng
    drawPoly(ctx, [[boardX - 6, boardY - 6], [boardX + boardW + 6, boardY - 6], [boardX + boardW + 6, boardY + boardH + 6], [boardX - 6, boardY + boardH + 6]], null, '#78350f', 5.0);
    // Khay phấn và phấn màu bên dưới
    drawPoly(ctx, [[boardX, boardY + boardH + 6], [boardX + boardW, boardY + boardH + 6], [boardX + boardW, boardY + boardH + 16], [boardX, boardY + boardH + 16]], '#a16207', INK, 1.2);
    ellipse(ctx, boardX + 40, boardY + boardH + 10, 8, 3, '#ffffff', null);
    ellipse(ctx, boardX + 65, boardY + boardH + 10, 8, 3, '#facc15', null);
    // Khăn lau bảng (eraser)
    drawPoly(ctx, [[boardX + 110, boardY + boardH + 4], [boardX + 135, boardY + boardH + 4], [boardX + 135, boardY + boardH + 12], [boardX + 110, boardY + boardH + 12]], '#1e3a8a', INK, 1.0);

    // Hình vẽ phấn ngộ nghĩnh trên bảng (Ngôi sao, hoa, mặt trời - ZERO text)
    path(ctx, `M ${boardX + 60} ${boardY + 60} L ${boardX + 75} ${boardY + 60} L ${boardX + 80} ${boardY + 45} L ${boardX + 85} ${boardY + 60} L ${boardX + 100} ${boardY + 60} L ${boardX + 88} ${boardY + 70} L ${boardX + 93} ${boardY + 85} L ${boardX + 80} ${boardY + 75} L ${boardX + 67} ${boardY + 85} L ${boardX + 72} ${boardY + 70} Z`, null, '#fef08a', 1.6);
    ellipse(ctx, boardX + 220, boardY + 90, 22, 22, null, '#ffffff', 2.0);
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      line(ctx, [[boardX + 220 + Math.cos(ang) * 26, boardY + 90 + Math.sin(ang) * 26], [boardX + 220 + Math.cos(ang) * 34, boardY + 90 + Math.sin(ang) * 34]], '#ffffff', 1.8);
    }

    // Đồng hồ treo tường tròn chỉ 3:00 (giờ dọn dẹp)
    ellipse(ctx, 350, 60, 24, 24, '#ffffff', INK, 2.0);
    ellipse(ctx, 350, 60, 2, 2, '#0f172a', null);
    line(ctx, [[350, 60], [350, 44]], '#0f172a', 2.2); // Kim phút chỉ số 12
    line(ctx, [[350, 60], [362, 60]], '#dc2626', 2.0); // Kim giờ chỉ số 3

    // Kệ tủ lớp học bên phải (lockers / cubbies)
    if (x1 > PANEL + 60) {
      const kx = 590, kw = Math.min(220, x1 - 600), ky = 160, kh = groundY * 0.68 - 160;
      drawPoly(ctx, [[kx, ky], [kx + kw, ky], [kx + kw, ky + kh], [kx, ky + kh]], '#92400e', INK, 2.0);
      for (let y = ky + 40; y < ky + kh; y += 45) {
        line(ctx, [[kx, y], [kx + kw, y]], '#78350f', 1.5);
      }
      for (let x = kx + 55; x < kx + kw; x += 55) {
        line(ctx, [[x, ky], [x, ky + kh]], '#78350f', 1.5);
      }
    }

    // Sàn gỗ sáng bóng chạy dài từ groundY * 0.68 xuống đáy màn hình
    const floor = ctx.createLinearGradient(0, groundY * 0.68, 0, 1024);
    floor.addColorStop(0, isNight ? '#331800' : '#d97706');
    floor.addColorStop(1, isNight ? '#1f0d00' : '#b45309');
    ctx.fillStyle = floor;
    ctx.fillRect(x0, groundY * 0.68, x1 - x0, 1024 - groundY * 0.68);

    // Các đường nối ván sàn gỗ ngang
    for (let y = groundY * 0.72; y <= 1024; y += 45) {
      line(ctx, [[x0, y], [x1, y]], isNight ? '#1f0d00' : '#92400e', 1.5);
    }

    // Vết bụi bẩn trên sàn (khi dirty > 0)
    if (dirty > 0.02) {
      ctx.save();
      ctx.globalAlpha = dirty * 0.75;
      const dustSpots = [
        [180, groundY * 0.78], [240, groundY * 0.85], [320, groundY * 0.76],
        [410, groundY * 0.88], [150, groundY * 0.92], [280, groundY * 0.94],
        [360, groundY * 0.82], [460, groundY * 0.80]
      ];
      dustSpots.forEach(pt => {
        ellipse(ctx, pt[0], pt[1], 8, 3.5, '#78350f', null);
        ellipse(ctx, pt[0] + 4, pt[1] - 1, 4, 2, '#451a03', null);
      });
      ctx.restore();
    }
  }

  // 3. TRAIN_PLATFORM (Sân ga tàu điện hiện đại)
  function drawTrainPlatform(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings.night || settings.time === 'night');
    const groundY = settings.ground_y || 810;

    // Bầu trời trên sân ga
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(1, '#0f172a');
    } else {
      sky.addColorStop(0, '#60a5fa');
      sky.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(x0, 0, x1 - x0, groundY * 0.65);

    // Mái che sân ga bằng thép dạng cantilever (x: x0 -> 420)
    drawPoly(ctx, [[x0, 0], [420, 0], [380, 160], [x0, 180]], '#334155', INK, 2.0);
    // Dầm đỡ thép chữ I
    if (x0 < 0) {
      for (let x = 60 - 100; x >= x0; x -= 100) {
        line(ctx, [[x, 0], [x - 20, 170]], '#475569', 5.0);
        ellipse(ctx, x - 20, 170, 12, 4, '#f8fafc', null);
      }
    }
    for (let x = 60; x <= 360; x += 100) {
      line(ctx, [[x, 0], [x - 20, 170]], '#475569', 5.0);
      ellipse(ctx, x - 20, 170, 12, 4, '#f8fafc', null); // Đèn LED trần
    }

    // Biển chỉ dẫn sân ga treo trên mái (Biểu tượng tàu & mũi tên - ZERO text)
    drawPoly(ctx, [[140, 140], [280, 140], [280, 195], [140, 195]], '#0284c7', INK, 1.6);
    // Biểu tượng tàu điện nhỏ màu trắng
    drawPoly(ctx, [[160, 155], [185, 155], [185, 180], [160, 180]], '#ffffff', null);
    ellipse(ctx, 166, 175, 2, 2, '#0284c7', null);
    ellipse(ctx, 179, 175, 2, 2, '#0284c7', null);
    // Mũi tên chỉ hướng trắng
    path(ctx, `M 220 167 L 245 167 M 238 160 L 245 167 L 238 174`, null, '#ffffff', 3.0);

    // Đường ray xe lửa và sỏi đá ở bên phải (x: 440 -> x1)
    ctx.fillStyle = '#64748b';
    ctx.fillRect(440, groundY * 0.65, Math.max(136, x1 - 440), 1024 - groundY * 0.65);
    // Thanh ray thép
    line(ctx, [[470, groundY * 0.65], [470, 1024]], '#cbd5e1', 5.0);
    line(ctx, [[530, groundY * 0.65], [530, 1024]], '#cbd5e1', 5.0);
    if (x1 > PANEL) {
      for (let rx = 590; rx + 60 <= x1; rx += 120) {
        line(ctx, [[rx, groundY * 0.65], [rx, 1024]], '#cbd5e1', 5.0);
        line(ctx, [[rx + 60, groundY * 0.65], [rx + 60, 1024]], '#cbd5e1', 5.0);
      }
    }
    // Tà vẹt gỗ
    for (let y = groundY * 0.68; y <= 1024; y += 38) {
      drawPoly(ctx, [[455, y], [545, y], [545, y + 14], [455, y + 14]], '#334155', null);
      if (x1 > PANEL) {
        for (let rx = 590; rx + 60 <= x1; rx += 120) {
          drawPoly(ctx, [[rx - 15, y], [rx + 75, y], [rx + 75, y + 14], [rx - 15, y + 14]], '#334155', null);
        }
      }
    }

    // Nền sân ga bê tông phẳng nhẵn (x: x0 -> 440)
    const platGrad = ctx.createLinearGradient(0, groundY * 0.65, 0, 1024);
    platGrad.addColorStop(0, isNight ? '#1e293b' : '#94a3b8');
    platGrad.addColorStop(1, isNight ? '#0f172a' : '#64748b');
    ctx.fillStyle = platGrad;
    ctx.fillRect(x0, groundY * 0.65, 440 - x0, 1024 - groundY * 0.65);

    // Gạch xúc giác màu vàng cảnh báo cho người khiếm thị (Braille tiles)
    for (let y = groundY * 0.66; y <= 1024; y += 22) {
      drawPoly(ctx, [[405, y], [430, y], [430, y + 18], [405, y + 18]], '#eab308', INK, 0.8);
      // Chấm bi nổi trên gạch vàng
      ellipse(ctx, 412, y + 9, 1.5, 1.5, '#ca8a04', null);
      ellipse(ctx, 423, y + 9, 1.5, 1.5, '#ca8a04', null);
    }

    // Hàng rào chắn an toàn sân ga (Platform screen door posts)
    for (let y = groundY * 0.72; y <= 1024; y += 120) {
      drawPoly(ctx, [[429, y - 60], [435, y - 60], [435, y], [429, y]], cylinder(ctx, 429, 435, '#cbd5e1'), INK, 1.0);
      line(ctx, [[435, y - 50], [435, y - 10]], '#38bdf8', 3.0); // Kính chắn an toàn
    }
  }

  // 4. SHRINE_GENERIC (Khuôn viên đền cổng Torii giữa rừng thông)
  function drawShrineGeneric(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings.night || settings.time === 'night');
    const groundY = settings.ground_y || 810;

    // Bầu trời thanh bình
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(1, '#0c4a6e');
    } else {
      sky.addColorStop(0, '#38bdf8');
      sky.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(x0, 0, x1 - x0, groundY * 0.65);

    // Mặt trăng đêm / mây ngày
    if (isNight) {
      ellipse(ctx, 440, 110, 26, 26, '#fef08a', null);
      ellipse(ctx, 440, 110, 22, 22, '#fef9c3', null);
      for (let s of [[90, 70], [170, 100], [280, 80], [360, 130]]) {
        ellipse(ctx, s[0], s[1], 1.5, 1.5, '#ffffff', null);
      }
      if (x0 < 0) {
        for (let s of [[x0 + 70, 80], [x0 + 160, 120]]) {
          ellipse(ctx, s[0], s[1], 1.5, 1.5, '#ffffff', null);
        }
      }
      if (x1 > PANEL) {
        for (let s of [[PANEL + 80, 75], [PANEL + 180, 115]]) {
          ellipse(ctx, s[0], s[1], 1.5, 1.5, '#ffffff', null);
        }
      }
    } else {
      ellipse(ctx, 120, 100, 60, 24, '#ffffff', null);
      ellipse(ctx, 160, 90, 45, 20, '#ffffff', null);
    }

    // Rừng thông & tùng bách (Cryptomeria) xanh ngát phía sau
    const treeCol = isNight ? '#064e3b' : '#047857';
    if (x0 < -20) {
      for (let x = -75; x >= x0 - 55; x -= 55) {
        drawPoly(ctx, [[x, groundY * 0.66], [x + 50, groundY * 0.66], [x + 25, groundY * 0.66 - 160]], treeCol, null);
      }
    }
    for (let x = -20; x <= 600; x += 55) {
      drawPoly(ctx, [[x, groundY * 0.66], [x + 50, groundY * 0.66], [x + 25, groundY * 0.66 - 160]], treeCol, null);
    }
    if (x1 > 600) {
      for (let x = 635; x <= x1 + 55; x += 55) {
        drawPoly(ctx, [[x, groundY * 0.66], [x + 50, groundY * 0.66], [x + 25, groundY * 0.66 - 160]], treeCol, null);
      }
    }

    // Mái điện gỗ xa xa thấp thoáng giữa rừng
    const roofY = groundY * 0.66 - 120;
    path(ctx, `M 200 ${roofY} Q 288 ${roofY - 35} 376 ${roofY}`, null, '#78350f', 8.0);

    // Cổng Torii lớn màu đỏ son ở trung tâm sân đền
    const toriiCol = '#dc2626';
    const topLintelCol = '#1e293b'; // Xà nóc Kasagi màu đen
    const tBaseY = groundY * 0.66;

    // 2 cột trụ tròn vững chãi
    drawPoly(ctx, [[130, tBaseY], [148, tBaseY], [148, tBaseY - 220], [130, tBaseY - 220]], cylinder(ctx, 130, 148, toriiCol), INK, 1.4);
    drawPoly(ctx, [[410, tBaseY], [428, tBaseY], [428, tBaseY - 220], [410, tBaseY - 220]], cylinder(ctx, 410, 428, toriiCol), INK, 1.4);
    // Chân cột đế đen
    drawPoly(ctx, [[126, tBaseY], [152, tBaseY], [152, tBaseY - 18], [126, tBaseY - 18]], cylinder(ctx, 126, 152, '#18181b'), INK, 1.2);
    drawPoly(ctx, [[406, tBaseY], [432, tBaseY], [432, tBaseY - 18], [406, tBaseY - 18]], cylinder(ctx, 406, 432, '#18181b'), INK, 1.2);

    // Xà ngang dưới (Nuki)
    drawPoly(ctx, [[100, tBaseY - 170], [458, tBaseY - 170], [458, tBaseY - 152], [100, tBaseY - 152]], toriiCol, INK, 1.4);
    // Trụ đỡ giữa (Gakuzuka)
    drawPoly(ctx, [[279, tBaseY - 220], [297, tBaseY - 220], [297, tBaseY - 170], [279, tBaseY - 170]], toriiCol, INK, 1.0);

    // Xà ngang trên cùng (Kasagi & Shimaki) cong vút kiêu hãnh
    path(
      ctx,
      `M 70 ${tBaseY - 225} Q 288 ${tBaseY - 245} 488 ${tBaseY - 225} L 498 ${tBaseY - 240} Q 288 ${tBaseY - 265} 60 ${tBaseY - 240} Z`,
      topLintelCol,
      INK,
      1.8
    );

    // Mặt đất sỏi đá khuôn viên đền (Sando)
    const ground = ctx.createLinearGradient(0, tBaseY, 0, 1024);
    ground.addColorStop(0, isNight ? '#1e293b' : '#a8a29e');
    ground.addColorStop(1, isNight ? '#0f172a' : '#78716c');
    ctx.fillStyle = ground;
    ctx.fillRect(x0, tBaseY, x1 - x0, 1024 - tBaseY);

    // Con đường đá lát trung tâm bước vào đền
    drawPoly(ctx, [[210, tBaseY], [366, tBaseY], [430, 1024], [146, 1024]], isNight ? '#334155' : '#d6d3d1', INK, 1.0);

    // Đèn lồng đá Ishidoro hai bên lối đi
    const drawIshidoro = (lx) => {
      const ly = tBaseY + 60;
      drawPoly(ctx, [[lx - 7, ly], [lx + 7, ly], [lx + 7, ly - 70], [lx - 7, ly - 70]], cylinder(ctx, lx - 7, lx + 7, '#94a3b8'), INK, 1.0); // Cột đá
      drawPoly(ctx, [[lx - 16, ly - 70], [lx + 16, ly - 70], [lx + 12, ly - 90], [lx - 12, ly - 90]], isNight ? '#fef08a' : '#f8fafc', INK, 1.0); // Hốc đèn
      drawPoly(ctx, [[lx - 22, ly - 90], [lx + 22, ly - 90], [lx, ly - 105]], '#475569', INK, 1.0); // Mái che đá
    };

    if (x0 < 0) {
      drawIshidoro(x0 + 100);
    }
    for (let lx of [90, 480]) {
      drawIshidoro(lx);
    }
    if (x1 > PANEL) {
      drawIshidoro(PANEL + 160);
    }
  }

  // 5. ONSEN_SNOW (Suối nước nóng Rotenburo ngập tuyết trắng)
  function drawOnsenSnow(ctx, settings, t) {
    const span = frameSpan(settings);
    const x0 = span.x0, x1 = span.x1;
    const isNight = Boolean(settings.night || settings.time === 'night');
    const groundY = settings.ground_y || 810;
    const timeVal = t ?? 0;

    // Bầu trời mùa đông mờ sương tuyết
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(1, '#1e293b');
    } else {
      sky.addColorStop(0, '#93c5fd');
      sky.addColorStop(1, '#f1f5f9');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(x0, 0, x1 - x0, groundY * 0.65);

    // Núi tuyết chập chùng xa xa
    const mtColor = isNight ? '#0f172a' : '#cbd5e1';
    if (x0 < -20) {
      drawPoly(ctx, [[x0 - 50, groundY * 0.65], [100, groundY * 0.65], [x0 * 0.5, groundY * 0.65 - 160]], mtColor, null);
    }
    drawPoly(ctx, [[-20, groundY * 0.65], [260, groundY * 0.65], [120, groundY * 0.65 - 150]], mtColor, null);
    drawPoly(ctx, [[200, groundY * 0.65], [596, groundY * 0.65], [410, groundY * 0.65 - 180]], mtColor, null);
    if (x1 > 596) {
      drawPoly(ctx, [[500, groundY * 0.65], [x1 + 60, groundY * 0.65], [PANEL + (x1 - PANEL) * 0.5, groundY * 0.65 - 170]], mtColor, null);
    }

    // Rặng thông tuyết phủ trắng ngọn
    const drawSnowTree = (x) => {
      drawPoly(ctx, [[x, groundY * 0.66], [x + 40, groundY * 0.66], [x + 20, groundY * 0.66 - 110]], '#064e3b', null);
      // Mũ tuyết trắng trên chóp thông
      drawPoly(ctx, [[x + 10, groundY * 0.66 - 80], [x + 30, groundY * 0.66 - 80], [x + 20, groundY * 0.66 - 110]], '#ffffff', null);
    };

    if (x0 < 0) {
      for (let x = 10 - 48; x >= x0 - 20; x -= 48) {
        drawSnowTree(x);
      }
    }
    for (let x = 10; x <= 560; x += 48) {
      drawSnowTree(x);
    }
    if (x1 > 576) {
      for (let x = 10 + 12 * 48; x <= x1 + 20; x += 48) {
        drawSnowTree(x);
      }
    }

    // Mặt đất đá suối phủ tuyết dày
    const ground = ctx.createLinearGradient(0, groundY * 0.66, 0, 1024);
    ground.addColorStop(0, '#e2e8f0');
    ground.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = ground;
    ctx.fillRect(x0, groundY * 0.66, x1 - x0, 1024 - groundY * 0.66);

    // Hồ suối khoáng nóng lộ thiên (Rotenburo) hình oval tự nhiên
    const poolX = 288, poolY = groundY * 0.85, poolRx = 230, poolRy = 90;
    // Bờ đá tảng tự nhiên bao quanh hồ
    for (let a = 0; a < 16; a++) {
      const ang = (a * Math.PI) / 8;
      const bx = poolX + Math.cos(ang) * (poolRx + 12);
      const by = poolY + Math.sin(ang) * (poolRy + 10);
      ellipse(ctx, bx, by, 22, 14, '#475569', INK, 1.2);
      // Tuyết đọng trên đỉnh đá
      ellipse(ctx, bx, by - 6, 18, 7, '#ffffff', null);
    }

    // Làn nước khoáng xanh ngọc lam ấm áp
    const water = ctx.createRadialGradient(poolX, poolY, 20, poolX, poolY, poolRx);
    water.addColorStop(0, '#22d3ee');
    water.addColorStop(0.7, '#0891b2');
    water.addColorStop(1, '#0e7490');
    ellipse(ctx, poolX, poolY, poolRx, poolRy, water, INK, 1.6);

    // Làn hơi nước bốc lên nghi ngút (Steam)
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let i = 0; i < 6; i++) {
      const sx = poolX - 140 + i * 55 + Math.sin(timeVal * 2 + i) * 12;
      const sy = poolY - 20 - ((timeVal * 30 + i * 25) % 90);
      ctx.beginPath();
      ctx.arc(sx, sy, 18 + i * 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Xô gỗ ngâm suối nước nóng (Hinoki Oke) trên tảng đá bên phải
    const okeX = 460, okeY = poolY - 35;
    drawPoly(ctx, [[okeX - 10, okeY], [okeX + 10, okeY], [okeX + 10, okeY - 14], [okeX - 10, okeY - 14]], cylinder(ctx, okeX - 10, okeX + 10, '#d97706'), INK, 1.0);
    ellipse(ctx, okeX, okeY - 14, 10, 3, '#fef3c7', INK, 0.8);
    line(ctx, [[okeX - 10, okeY - 4], [okeX + 10, okeY - 4]], '#1e293b', 1.0); // Đai kim loại
  }

  // =============================================================
  // REGISTRATION (RemakeVector.register)
  // =============================================================
  const JP_CULTURE_RIGS = {
    koinobori: {
      draw(ctx, s, t) { drawKoinobori(ctx, s, t); }
    },
    tanabata_bamboo: {
      draw(ctx, s, t) { drawTanabataBamboo(ctx, s, t); }
    },
    bamboo: {
      draw(ctx, s, t) { drawBamboo(ctx, s, t); }
    },
    paper_lantern_jp: {
      draw(ctx, s, t) { drawPaperLanternJp(ctx, s, t); }
    },
    school_bag_randoseru: {
      draw(ctx, s, t) { drawSchoolBagRandoseru(ctx, s, t); }
    },
    train_ticket_gate: {
      draw(ctx, s, t) { drawTrainTicketGate(ctx, s, t); }
    },
    pheasant: {
      draw(ctx, s, t) { drawPheasant(ctx, s, t); }
    },
    crab: {
      draw(ctx, s, t) { drawCrab(ctx, s, t); }
    },
    tanuki: {
      draw(ctx, s, t) { drawTanuki(ctx, s, t); }
    },
    crane: {
      draw(ctx, s, t) { drawCrane(ctx, s, t); }
    },
    koi: {
      draw(ctx, s, t) { drawKoi(ctx, s, t); }
    },
    snow_monkey: {
      draw(ctx, s, t) { drawSnowMonkey(ctx, s, t); }
    }
  };

  const JP_CULTURE_BACKGROUNDS = {
    edo_town: {
      label: 'Phố cổ Edo',
      theme: 'home',
      ground_y: 810,
      draw(ctx, settings, t) { drawEdoTown(ctx, settings, t); }
    },
    jp_school: {
      label: 'Lớp học trường Nhật',
      theme: 'school',
      ground_y: 810,
      draw(ctx, settings, t) { drawJpSchool(ctx, settings, t); }
    },
    train_platform: {
      label: 'Sân ga tàu điện',
      theme: 'station',
      ground_y: 810,
      draw(ctx, settings, t) { drawTrainPlatform(ctx, settings, t); }
    },
    shrine_generic: {
      label: 'Khuôn viên đền Nhật',
      theme: 'garden',
      ground_y: 810,
      draw(ctx, settings, t) { drawShrineGeneric(ctx, settings, t); }
    },
    onsen_snow: {
      label: 'Suối nước nóng tuyết Onsen',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawOnsenSnow(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: JP_CULTURE_RIGS,
    backgrounds: JP_CULTURE_BACKGROUNDS
  });

})();
