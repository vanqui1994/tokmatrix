// Remake Vector Engine Pack: Inventions & Early Life (Giai đoạn O)
// Lịch sử phát minh, đời sống xưa và nay.
(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('inventions pack: RemakeVector core engine chưa được nạp.');
  }

  const {
    INK, TAU, tone, volume, taper, limb, mitten, leaf, blade,
    ellipse, path, line, withCut, hash, clamp, smooth, mix
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

  // -------------------------------------------------------------
  // 1. DRAISINE 1817 (Xe đạp gỗ không bàn đạp - Laufmaschine)
  // -------------------------------------------------------------
  function drawDraisine1817(ctx, s, t) {
    ctx.save();
    // Bánh xe chạm đất: r = 18, trục y = -18 -> đáy ở y = 0
    const vx = s.vx || 0;
    const roll = t * (vx || 1.2) * 16;
    const woodDark = '#78350f', woodMid = '#92400e', ironCol = '#1e293b', brassCol = '#ca8a04';

    // Hai bánh xe gỗ (trước và sau)
    for (const [wx, wy] of [[-32, -18], [32, -18]]) {
      // Vành sắt ngoài bọc bánh
      ellipse(ctx, wx, wy, 18, 18, null, ironCol, 2.2);
      // Vành gỗ trong
      ellipse(ctx, wx, wy, 16.5, 16.5, null, woodDark, 1.8);
      // 8 nan hoa gỗ xoay theo chuyển động
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(roll);
      for (let a = 0; a < 4; a++) {
        ctx.rotate(Math.PI / 4);
        line(ctx, [[-15, 0], [15, 0]], woodDark, 1.4);
      }
      // Trục moay-ơ đồng thau
      ellipse(ctx, 0, 0, 4.5, 4.5, brassCol, INK, 1.0);
      ellipse(ctx, 0, 0, 2, 2, ironCol, null);
      ctx.restore();
    }

    // Khung sườn gỗ nguyên khối uốn cong nối 2 trục bánh
    path(ctx, `M -32 -18 Q -10 -34 14 -32 L 24 -36`, null, INK, 4.8);
    path(ctx, `M -32 -18 Q -10 -34 14 -32 L 24 -36`, woodMid, null, 3.2);

    // Càng trước giữ bánh trước
    line(ctx, [[32, -18], [24, -36]], INK, 3.4);
    line(ctx, [[32, -18], [24, -36]], woodMid, 2.0);

    // Trục cổ lái và tay lái chữ T
    line(ctx, [[24, -36], [22, -44]], ironCol, 2.5);
    line(ctx, [[16, -44], [28, -44]], woodDark, 3.0);
    // Miếng đệm tỳ tay / tỳ ngực bọc da đỏ bordeaux
    drawPoly(ctx, [[16, -42], [28, -42], [26, -38], [18, -38]], '#991b1b', INK, 1.0);

    // Yên da đệm ở giữa (seat_1 ở [0, -32])
    path(ctx, `M -8 -30 Q 0 -34 8 -30 Q 4 -28 -8 -28 Z`, '#451a03', INK, 1.4);
    // Cọc đỡ yên nối xuống dầm
    line(ctx, [[0, -28], [0, -24]], ironCol, 2.2);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 2. PHONOGRAPH (Máy hát loa kèn)
  // -------------------------------------------------------------
  function drawPhonograph(ctx, s, t) {
    ctx.save();
    const woodDark = '#451a03', woodMid = '#78350f', brassMain = '#eab308', brassDark = '#ca8a04', goldLight = '#fef08a';

    // Thùng máy bằng gỗ sồi/óc chó: đáy chạm y = 0
    drawPoly(ctx, [[-22, 0], [22, 0], [20, -4], [-20, -4]], woodDark, INK, 1.2); // Chân đế giật cấp
    drawPoly(ctx, [[-20, -4], [20, -4], [20, -22], [-20, -22]], woodMid, INK, 1.6); // Thân thùng
    drawPoly(ctx, [[-22, -22], [22, -22], [22, -25], [-22, -25]], woodDark, INK, 1.4); // Nắp trên gờ nổi

    // Tay quay bằng đồng bên hông phải
    line(ctx, [[20, -14], [26, -14]], brassDark, 2.0);
    line(ctx, [[26, -14], [26, -8]], woodDark, 2.4);

    // Mâm quay và đĩa than đen
    const playing = (s.playing || 0);
    const spin = t * (playing > 0 ? 14 : 0);
    ellipse(ctx, 0, -26, 18, 4.5, '#cbd5e1', INK, 1.0); // Mâm kim loại
    ellipse(ctx, 0, -27, 17, 4.0, '#0f172a', INK, 1.4); // Đĩa than đen bóng
    ellipse(ctx, 0, -27, 6, 1.5, brassMain, null); // Nhãn đĩa giữa
    ellipse(ctx, 0, -27, 1.5, 0.6, '#0f172a', null); // Lỗ trục

    // Phản quang xoay trên đĩa than khi quay
    if (playing > 0) {
      ctx.save();
      ctx.translate(0, -27);
      ctx.scale(1, 0.25);
      ctx.rotate(spin);
      line(ctx, [[-15, 0], [15, 0]], 'rgba(255, 255, 255, 0.25)', 2.0);
      ctx.restore();
    }

    // Cần máy và đầu kim tỳ đĩa
    path(ctx, `M -14 -25 Q -18 -34 -6 -32 Q 0 -30 -4 -28`, null, '#475569', 2.0);
    ellipse(ctx, -4, -28, 2, 1.5, '#94a3b8', INK, 0.8); // Hộp màng rung đầu kim

    // Loa kèn lớn bằng đồng thau loe rộng
    // Cổ loa uốn từ sau lên
    path(ctx, `M -14 -28 C -14 -42 -2 -42 4 -46`, null, brassDark, 3.6);
    // Thân phễu loa kèn loe rộng sang phải và hướng lên
    ctx.save();
    ctx.translate(4, -46);
    ctx.rotate(0.35); // Nghiêng miệng loa lên góc ~20 độ
    // Vẽ thân loa hình nón loe
    drawPoly(ctx, [[0, -3], [0, 3], [22, 14], [22, -14]], brassDark, INK, 1.4);
    drawPoly(ctx, [[1, -2], [1, 2], [21, 13], [21, -13]], brassMain, null);
    // Miệng loa kèn uốn hình cánh hoa buổi sớm (morning glory)
    ellipse(ctx, 22, 0, 4.5, 14, brassMain, INK, 1.5);
    ellipse(ctx, 22, 0, 2.5, 11, brassDark, null);
    // Gân nổi cánh hoa loa kèn
    for (let r = -10; r <= 10; r += 5) {
      line(ctx, [[4, 0], [22, r]], goldLight, 1.0);
    }
    ctx.restore();

    // Nốt nhạc bay ra khi đang phát (playing > 0) - tất định, không text
    if (playing > 0.05) {
      const pAmt = clamp(playing, 0, 1);
      for (let i = 0; i < 3; i++) {
        const cycle = ((t * 1.6 + i * 0.333) % 1.0);
        const nx = 22 + cycle * 22 + Math.sin(cycle * TAU) * 5;
        const ny = -56 - cycle * 34;
        const alpha = Math.sin(cycle * Math.PI) * pAmt;
        if (alpha > 0.02) {
          ctx.save();
          const noteCol = `rgba(30, 41, 59, ${alpha.toFixed(2)})`;
          ellipse(ctx, nx, ny, 3, 2.2, noteCol, null);
          line(ctx, [[nx + 2.5, ny], [nx + 2.5, ny - 9]], noteCol, 1.4);
          line(ctx, [[nx + 2.5, ny - 9], [nx + 6.5, ny - 7.5]], noteCol, 1.6);
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 3. EARLY TELEPHONE (Điện thoại để bàn đời đầu)
  // -------------------------------------------------------------
  function drawEarlyTelephone(ctx, s, t) {
    ctx.save();
    const darkMetal = '#0f172a', brassCol = '#ca8a04', nickelCol = '#94a3b8';

    // Đế tròn nặng: chạm y = 0
    ellipse(ctx, 0, -3, 14, 3.5, darkMetal, INK, 1.4);
    ellipse(ctx, 0, -5, 12, 3.0, brassCol, INK, 1.0);
    ellipse(ctx, 0, -7, 9, 2.2, darkMetal, INK, 1.2);

    // Cột trụ đứng thân nến (candlestick stem)
    taper(ctx, 0, -7, 0, -34, 3.2, 2.8, darkMetal, INK, 1.2);
    // Vòng ren đồng trang trí
    line(ctx, [[-3, -16], [3, -16]], brassCol, 1.6);
    line(ctx, [[-2.8, -26], [2.8, -26]], brassCol, 1.6);

    // Đầu ống nói (mouthpiece) xoay nghiêng
    path(ctx, `M -2 -34 L -8 -36 L -10 -40 L -2 -38 Z`, darkMetal, INK, 1.2);
    ellipse(ctx, -10, -40, 2.5, 4.5, darkMetal, INK, 1.2, 0.4); // Phễu nói

    // Giá đỡ ống nghe (switch hook) hình chạc chữ U
    path(ctx, `M 2 -32 L 12 -32 L 14 -35 M 12 -32 L 14 -29`, null, nickelCol, 2.2);

    // Dây xoắn nối ống nghe vào đế
    path(ctx, `M 4 -6 Q 16 -12 10 -20 Q 18 -24 15 -26`, null, '#334155', 1.4);

    // Ống nghe cầm tay hình nón (earpiece receiver)
    // Grip tại [15, -26], earpiece tại [15, -38]
    taper(ctx, 15, -20, 15, -34, 3.5, 4.2, darkMetal, INK, 1.2);
    ellipse(ctx, 15, -36, 6, 2.5, darkMetal, INK, 1.2); // Loa áp tai
    ellipse(ctx, 15, -18, 2.8, 1.5, brassCol, INK, 1.0); // Đuôi cắm dây

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 4. MOVABLE TYPE TRAY (Khay chữ rời Gutenberg)
  // -------------------------------------------------------------
  function drawMovableTypeTray(ctx, s, t) {
    ctx.save();
    const woodRim = '#78350f', woodInner = '#92400e', leadType = '#64748b', leadFace = '#cbd5e1';

    // Khay gỗ chữ nhật: chạm y = 0
    drawPoly(ctx, [[-24, 0], [24, 0], [24, -20], [-24, -20]], woodRim, INK, 1.6);
    drawPoly(ctx, [[-22, -2], [22, -2], [22, -18], [-22, -18]], woodInner, null);

    // Các thanh ngăn gỗ chia ô (grid 4 cột x 3 hàng)
    for (let x = -11; x <= 11; x += 11) {
      line(ctx, [[x, -2], [x, -18]], woodRim, 1.2);
    }
    for (let y = -7; y >= -13; y -= 5) {
      line(ctx, [[-22, y], [22, y]], woodRim, 1.2);
    }

    // Các con chữ rời bằng kim loại xếp trong từng ô (hình khối trừu tượng, zero Latin text)
    for (let cx = -18; cx <= 18; cx += 11) {
      for (let cy = -4.5; cy >= -15.5; cy -= 5) {
        // Thỏi chì chữ nhật nhỏ
        drawPoly(ctx, [[cx - 3.5, cy + 1.8], [cx + 3.5, cy + 1.8], [cx + 3.5, cy - 1.8], [cx - 3.5, cy - 1.8]], leadType, null);
        // Ký hiệu khắc nổi trừu tượng (chấm, vạch, góc)
        const glyphKind = (Math.abs(Math.round(cx * 7 + cy * 13)) % 4);
        if (glyphKind === 0) {
          line(ctx, [[cx - 2, cy], [cx + 2, cy]], leadFace, 1.0);
        } else if (glyphKind === 1) {
          ellipse(ctx, cx, cy, 1.2, 1.2, leadFace, null);
        } else if (glyphKind === 2) {
          line(ctx, [[cx - 1.5, cy - 1], [cx + 1.5, cy + 1]], leadFace, 0.9);
        } else {
          drawPoly(ctx, [[cx - 1.5, cy - 1], [cx + 1.5, cy - 1], [cx, cy + 1]], leadFace, null);
        }
      }
    }

    // Hai tay cầm đồng bên hông
    path(ctx, `M -24 -6 Q -27 -10 -24 -14`, null, '#ca8a04', 1.8);
    path(ctx, `M 24 -6 Q 27 -10 24 -14`, null, '#ca8a04', 1.8);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 5. WATER CLOCK (Đồng hồ nước Clepsydra)
  // -------------------------------------------------------------
  function drawWaterClock(ctx, s, t) {
    ctx.save();
    const woodDark = '#78350f', bronzeCol = '#0d9488', waterCol = '#0284c7', floatVal = clamp(s.fill ?? s.level ?? 0.5);

    // Chân giá đỡ bằng gỗ chạm y = 0
    drawPoly(ctx, [[-16, 0], [-10, 0], [-12, -20], [-18, -20]], woodDark, INK, 1.2);
    drawPoly(ctx, [[16, 0], [10, 0], [12, -20], [18, -20]], woodDark, INK, 1.2);
    line(ctx, [[-16, -10], [16, -10]], woodDark, 2.0); // Giằng ngang

    // Bình hứng nước phía dưới (trụ gốm/đồng trong suốt có vạch chia)
    drawPoly(ctx, [[-11, -8], [11, -8], [11, -28], [-11, -28]], '#e2e8f0', INK, 1.4);
    // Nước dâng trong bình dưới theo floatVal
    const waterH = 18 * floatVal;
    drawPoly(ctx, [[-10, -9], [10, -9], [10, -9 - waterH], [-10, -9 - waterH]], waterCol, null);
    // Vạch đo thời gian trên thân bình
    for (let vy = -12; vy >= -26; vy -= 4) {
      line(ctx, [[-10, vy], [-6, vy]], '#475569', 1.0);
    }

    // Phao nổi và thanh đo chỉ giờ vươn lên
    const floatY = -9 - waterH;
    ellipse(ctx, 0, floatY, 8, 2.2, '#ca8a04', INK, 1.0); // Đĩa phao nổi
    line(ctx, [[0, floatY], [0, floatY - 26]], '#b45309', 1.8); // Cọc đo giờ
    ellipse(ctx, 0, floatY - 26, 3, 2, '#ef4444', INK, 0.8); // Đỉnh chỉ thị

    // Bình chứa nước phía trên với vòi rỉ giọt nước
    path(ctx, `M -16 -42 L 16 -42 L 13 -58 L -13 -58 Z`, bronzeCol, INK, 1.6);
    ellipse(ctx, 0, -58, 13, 3.5, '#14b8a6', INK, 1.2); // Miệng bình trên
    // Vòi rỉ nước nhỏ giọt đều đặn
    path(ctx, `M 12 -44 Q 18 -42 16 -38`, null, '#0f766e', 1.8);
    // Giọt nước rơi
    const dropY = -36 + ((t * 4) % 1.0) * 16;
    ellipse(ctx, 16, dropY, 1.5, 2.2, '#38bdf8', null);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 6. RAIN GAUGE (Dụng cụ đo mưa Cheugugi)
  // -------------------------------------------------------------
  function drawRainGauge(ctx, s, t) {
    ctx.save();
    const stoneDark = '#475569', stoneMid = '#64748b', bronzeTube = '#047857', bronzeLip = '#10b981';

    // Bệ đá vuông giật cấp: chạm y = 0
    drawPoly(ctx, [[-16, 0], [16, 0], [14, -6], [-14, -6]], stoneDark, INK, 1.4);
    drawPoly(ctx, [[-14, -6], [14, -6], [12, -14], [-12, -14]], stoneMid, INK, 1.4);
    // Gờ lõm giữ đáy ống đo
    drawPoly(ctx, [[-8, -14], [8, -14], [8, -16], [-8, -16]], stoneDark, INK, 1.0);

    // Ống kim loại hình trụ hứng nước mưa (Cheugugi bằng đồng)
    drawPoly(ctx, [[-6.5, -16], [6.5, -16], [6.5, -46], [-6.5, -46]], bronzeTube, INK, 1.6);
    // Các vòng đai khớp nối ống hình trụ
    line(ctx, [[-6.5, -26], [6.5, -26]], bronzeLip, 1.4);
    line(ctx, [[-6.5, -36], [6.5, -36]], bronzeLip, 1.4);
    // Miệng vành loe hứng nước mưa
    ellipse(ctx, 0, -46, 7.5, 2.4, bronzeLip, INK, 1.4);
    ellipse(ctx, 0, -46, 5.5, 1.6, '#064e3b', null);

    // Thước đo bằng đồng / gỗ cắm trong ống nhô lên
    const fillVal = clamp(s.fill ?? s.level ?? 0.4);
    line(ctx, [[0, -46], [0, -52]], '#ca8a04', 1.8);
    // Các vạch khắc trên thước đo nhô ra
    line(ctx, [[-1.5, -48], [1.5, -48]], '#fef08a', 0.8);
    line(ctx, [[-1.5, -50], [1.5, -50]], '#fef08a', 0.8);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 7. EYEGLASSES EARLY (Kính mắt gọng tròn xưa)
  // -------------------------------------------------------------
  function drawEyeglassesEarly(ctx, s, t) {
    ctx.save();
    const frameCol = '#b45309', lensGlass = 'rgba(186, 230, 253, 0.65)';

    // Hai tròng kính tròn trong suốt viền đồng
    for (const lx of [-9, 9]) {
      ellipse(ctx, lx, -8, 6.5, 6.5, lensGlass, frameCol, 1.4);
      // Vệt phản quang ánh sáng trên mặt kính
      path(ctx, `M ${lx - 3} -11 Q ${lx} -13 ${lx + 3} -11`, null, '#ffffff', 1.0);
    }
    // Cầu nối chữ C uốn cong giữa hai mắt kính
    path(ctx, `M -2.5 -8 Q 0 -11 2.5 -8`, null, frameCol, 1.6);

    // Gọng kính thanh mảnh kéo dài hai bên
    line(ctx, [[-15.5, -8], [-20, -7]], frameCol, 1.2);
    line(ctx, [[15.5, -8], [20, -7]], frameCol, 1.2);
    // Móc ngoắc tai uốn tròn ở đuôi
    ellipse(ctx, -20.5, -6, 1.2, 1.2, null, frameCol, 1.0);
    ellipse(ctx, 20.5, -6, 1.2, 1.2, null, frameCol, 1.0);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 8. TOOTHBRUSH EARLY (Bàn chải răng lông tự nhiên xưa)
  // -------------------------------------------------------------
  function drawToothbrushEarly(ctx, s, t) {
    ctx.save();
    const boneHandle = '#e2d9c2', boneDark = '#c5ba9d', bristleCol = '#d4b886';

    // Cán xương/gỗ tiện tay, chạm y = 0
    taper(ctx, 0, 0, 0, -42, 2.8, 3.4, boneHandle, INK, 1.2);
    // Lỗ xâu dây ở đuôi cán
    ellipse(ctx, 0, -4, 1.2, 1.8, '#78716c', null);

    // Đầu cắm lông bàn chải: từ y = -42 đến -52
    drawPoly(ctx, [[-3, -42], [3, -42], [3, -52], [-3, -52]], boneDark, INK, 1.0);
    // Chùm lông tự nhiên (lông heo rừng/ngựa chải răng)
    for (const by of [-44, -47, -50]) {
      line(ctx, [[-3, by], [-8, by]], bristleCol, 1.8);
      line(ctx, [[3, by], [8, by]], bristleCol, 1.8);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 9. PAPER SHEET STACK (Xấp giấy thủ công)
  // -------------------------------------------------------------
  function drawPaperSheetStack(ctx, s, t) {
    ctx.save();
    const paperLight = '#fffbeb', paperMid = '#fef3c7', paperEdge = '#fde68a';
    const growth = clamp(s.growth ?? s.fill ?? 1.0);
    const stackH = 6 + 12 * growth; // Chiều cao xấp giấy dâng theo growth

    // Các lớp giấy chồng lên nhau, mép sợi sờn tự nhiên: chạm y = 0
    drawPoly(ctx, [[-18, 0], [18, 0], [18, -stackH], [-18, -stackH]], paperMid, INK, 1.4);
    // Vân mép giấy sờn
    for (let y = -2; y >= -stackH + 2; y -= 3) {
      line(ctx, [[-17.5, y], [17.5, y]], paperEdge, 1.0);
    }
    // Tờ giấy trên cùng sáng màu ngà
    drawPoly(ctx, [[-17.5, -stackH], [17.5, -stackH], [17, -stackH - 2], [-17, -stackH - 2]], paperLight, INK, 1.0);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 10. COIN STACK (Chồng tiền xu trơn)
  // -------------------------------------------------------------
  function drawCoinStack(ctx, s, t) {
    ctx.save();
    const bronzeTone = '#ca8a04', goldTone = '#eab308', silverTone = '#cbd5e1';

    // 5 đồng xu dẹt xếp chồng lệch nhẹ tự nhiên: chạm y = 0
    const offsets = [0, 1.2, -0.8, 1.0, -0.5];
    for (let i = 0; i < 5; i++) {
      const cy = -2.5 - i * 4.2;
      const cx = offsets[i];
      const col = (i % 2 === 0) ? bronzeTone : silverTone;
      // Cạnh đồng xu
      drawPoly(ctx, [[cx - 12, cy + 2], [cx + 12, cy + 2], [cx + 12, cy - 1.5], [cx - 12, cy - 1.5]], tone(col, -0.2), INK, 1.0);
      // Mặt trên đồng xu hình oval
      ellipse(ctx, cx, cy - 1.5, 12, 3.2, col, INK, 1.1);
      // Vành hoa văn đồng tâm nổi (không mặt người, không biểu tượng quốc gia)
      ellipse(ctx, cx, cy - 1.5, 9, 2.2, null, tone(col, 0.25), 1.0);
      ellipse(ctx, cx, cy - 1.5, 3, 1.0, tone(col, -0.3), null);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 11. WORKBENCH CLUTTER (Bàn thợ phát minh)
  // -------------------------------------------------------------
  function drawWorkbenchClutter(ctx, s, t) {
    ctx.save();
    const woodDark = '#451a03', woodMid = '#78350f', metalCol = '#94a3b8', brassCol = '#ca8a04';

    // 4 chân bàn dày dặn: chạm y = 0
    drawPoly(ctx, [[-30, 0], [-24, 0], [-24, -44], [-30, -44]], woodDark, INK, 1.4);
    drawPoly(ctx, [[24, 0], [30, 0], [30, -44], [24, -44]], woodDark, INK, 1.4);
    // Thanh giằng ngang chữ H
    line(ctx, [[-26, -14], [26, -14]], woodDark, 3.0);

    // Hộc tủ / ngăn kéo bàn có núm đồng
    drawPoly(ctx, [[-24, -30], [24, -30], [24, -44], [-24, -44]], woodMid, INK, 1.4);
    ellipse(ctx, 0, -37, 2, 2, brassCol, INK, 0.8);

    // Mặt bàn gỗ sồi dày dặn: đỉnh ở y = -50
    drawPoly(ctx, [[-34, -44], [34, -44], [34, -50], [-34, -50]], woodDark, INK, 1.6);
    drawPoly(ctx, [[-33, -50], [33, -50], [31, -52], [-31, -52]], woodMid, INK, 1.0);

    // Đồ nghề trên mặt bàn (clutter):
    // Cuộn bản vẽ giấy da mở hé bên trái
    path(ctx, `M -28 -52 Q -20 -55 -12 -52`, null, '#fef3c7', 2.6);
    // Bánh răng kim loại đồng thau
    ellipse(ctx, 2, -54, 4.5, 4.5, brassCol, INK, 1.0);
    ellipse(ctx, 2, -54, 1.5, 1.5, woodDark, null);
    // Chai lọ thủy tinh nhỏ bên phải
    drawPoly(ctx, [[18, -52], [24, -52], [23, -60], [19, -60]], '#38bdf8', INK, 1.0);
    line(ctx, [[21, -60], [21, -63]], '#0284c7', 1.4);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 12. SMARTPHONE (Điện thoại thông minh hiện đại)
  // -------------------------------------------------------------
  function drawSmartphone(ctx, s, t) {
    ctx.save();
    // Thân điện thoại hình chữ nhật bo góc: chạm y = 0, cao 36
    drawPoly(ctx, [[-10, 0], [10, 0], [10, -36], [-10, -36]], '#1e293b', INK, 1.4);
    // Màn hình cảm ứng tối bóng
    drawPoly(ctx, [[-8.5, -2], [8.5, -2], [8.5, -34], [-8.5, -34]], '#0f172a', null);
    // Khe loa thoại và camera trước
    line(ctx, [[-2, -35], [2, -35]], '#64748b', 1.0);
    ellipse(ctx, 5, -35, 0.8, 0.8, '#475569', null);
    // Các ô biểu tượng ứng dụng trừu tượng (app tiles)
    for (const [ix, iy, col] of [[-5, -8, '#38bdf8'], [0, -8, '#22c55e'], [5, -8, '#f59e0b'],
                                  [-5, -16, '#ef4444'], [0, -16, '#a855f7'], [5, -16, '#06b6d4']]) {
      drawPoly(ctx, [[ix - 1.6, iy], [ix + 1.6, iy], [ix + 1.6, iy - 3.2], [ix - 1.6, iy - 3.2]], col, null);
    }
    ctx.restore();
  }

  // -------------------------------------------------------------
  // 13. LED BULB (Bóng đèn LED tròn hiện đại)
  // -------------------------------------------------------------
  function drawLedBulb(ctx, s, t) {
    ctx.save();
    // Đui xoáy nhôm bạc: chạm y = 0
    drawPoly(ctx, [[-4.5, 0], [4.5, 0], [4.5, -8], [-4.5, -8]], '#94a3b8', INK, 1.0);
    for (const y of [-2, -4, -6]) line(ctx, [[-4.5, y], [4.5, y]], '#cbd5e1', 1.0);
    // Đế tản nhiệt nhựa trắng
    drawPoly(ctx, [[-6, -8], [6, -8], [9, -18], [-9, -18]], '#f8fafc', INK, 1.2);
    // Vòm bóng LED bán cầu phát sáng mờ
    ellipse(ctx, 0, -26, 11, 11, '#fef9c3', INK, 1.4);
    ellipse(ctx, 0, -26, 8, 8, '#ffffff', null);
    ctx.restore();
  }

  // -------------------------------------------------------------
  // 14. HÌNH NỀN: WORKSHOP 1900 & OLD TOWN 1900
  // -------------------------------------------------------------
  function drawWorkshop1900(ctx, settings, t) {
    const isNight = settings.time === 'night';
    const groundY = 810;

    // A. Bầu trời qua cửa sổ lớn
    ctx.fillStyle = isNight ? '#090d16' : '#94a3b8';
    ctx.fillRect(0, 0, 576, groundY);

    // B. Tường xưởng gạch mộc màu đỏ đất / ban đêm xám than
    const wallCol = isNight ? '#1e293b' : '#7c2d12';
    const brickLine = isNight ? '#0f172a' : '#9a3412';
    ctx.fillStyle = wallCol;
    ctx.fillRect(0, 0, 576, groundY * 0.72);

    // Các mạch vữa gạch đều đặn
    for (let y = 30; y < groundY * 0.72; y += 22) {
      line(ctx, [[0, y], [576, y]], brickLine, 1.2);
    }

    // C. Cửa sổ công nghiệp vòm tròn lớn đón ánh sáng
    const winX = 148, winY = 90, winW = 280, winH = 360;
    // Lòng cửa sổ nhìn ra ngoài
    ctx.fillStyle = isNight ? '#0f172a' : '#e0f2fe';
    drawPoly(ctx, [[winX, winY + winH], [winX + winW, winY + winH], [winX + winW, winY + 60], [winX, winY + 60]], ctx.fillStyle, null);
    // Vòm cong cửa sổ
    path(ctx, `M ${winX} ${winY + 60} Q ${winX + winW * 0.5} ${winY - 20} ${winX + winW} ${winY + 60} Z`, ctx.fillStyle, null);

    // Khung sắt đen chia nhiều ô kính nhỏ
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3.6;
    ctx.strokeRect(winX, winY + 60, winW, winH - 60);
    path(ctx, `M ${winX} ${winY + 60} Q ${winX + winW * 0.5} ${winY - 20} ${winX + winW} ${winY + 60}`, null, '#1e293b', 3.6);
    // Thanh nan cửa sổ
    for (let gx = winX + 70; gx < winX + winW; gx += 70) {
      line(ctx, [[gx, winY + 30], [gx, winY + winH]], '#1e293b', 2.0);
    }
    for (let gy = winY + 120; gy < winY + winH; gy += 60) {
      line(ctx, [[winX, gy], [winX + winW, gy]], '#1e293b', 2.0);
    }

    // D. Dầm xà gỗ ngang trần nhà
    drawPoly(ctx, [[0, 0], [576, 0], [576, 40], [0, 40]], '#451a03', INK, 1.8);
    for (let x = 60; x <= 520; x += 110) {
      ellipse(ctx, x, 20, 3, 3, '#ca8a04', INK, 1.0); // Đinh tán đồng
    }

    // Đèn chụp sắt tráng men treo giữa trần xưởng
    line(ctx, [[288, 40], [288, 120]], '#0f172a', 2.2); // Dây cáp
    drawPoly(ctx, [[264, 120], [312, 120], [328, 142], [248, 142]], isNight ? '#166534' : '#15803d', INK, 1.6);
    ellipse(ctx, 288, 144, 18, 6, isNight ? '#fef08a' : '#fef9c3', null);
    if (isNight) {
      ellipse(ctx, 288, 150, 45, 12, 'rgba(254, 240, 138, 0.45)', null);
    }

    // E. Sàn gỗ ván dày mộc mạc: từ groundY * 0.72 đến 1024
    const floorGrad = ctx.createLinearGradient(0, groundY * 0.72, 0, 1024);
    floorGrad.addColorStop(0, isNight ? '#27170a' : '#78350f');
    floorGrad.addColorStop(1, isNight ? '#150c05' : '#451a03');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, groundY * 0.72, 576, 1024 - groundY * 0.72);

    // Mạch ván sàn chạy ngang
    for (let fy = groundY * 0.72; fy < 1024; fy += 45) {
      line(ctx, [[0, fy], [576, fy]], isNight ? '#150c05' : '#3e1a05', 1.6);
    }
  }

  function drawOldTown1900(ctx, settings, t) {
    const isNight = settings.time === 'night';
    const groundY = 810;

    // A. Bầu trời phố cổ
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY * 0.6);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(1, '#0f172a');
    } else {
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 576, groundY);

    if (isNight) {
      // Sao đêm lấp lánh tất định
      for (let si = 0; si < 22; si++) {
        const sx = (hash('old_town_star_x_' + si) % 550) + 13;
        const sy = (hash('old_town_star_y_' + si) % 220) + 15;
        ellipse(ctx, sx, sy, 1.2, 1.2, '#f8fafc', null);
      }
    }

    // B. Dãy nhà phố cổ châu Âu thế kỷ 19 phía sau
    for (let i = 0; i < 4; i++) {
      const hx = i * 148 - 15;
      const hw = 144;
      const hh = 330 + (i % 2) * 45;
      const wallCol = isNight ? '#1e293b' : (i % 2 === 0 ? '#fef08a' : '#fed7aa');
      const roofCol = isNight ? '#0f172a' : (i % 2 === 0 ? '#991b1b' : '#7f1d1d');
      // Thân nhà
      drawPoly(ctx, [[hx, groundY * 0.66], [hx + hw, groundY * 0.66], [hx + hw, groundY * 0.66 - hh * 0.62], [hx, groundY * 0.66 - hh * 0.62]], wallCol, INK, 1.5);
      // Mái dốc đứng và ống khói
      drawPoly(ctx, [[hx - 6, groundY * 0.66 - hh * 0.62], [hx + hw + 6, groundY * 0.66 - hh * 0.62], [hx + hw * 0.5, groundY * 0.66 - hh]], roofCol, INK, 1.8);
      drawPoly(ctx, [[hx + hw * 0.7, groundY * 0.66 - hh * 0.9], [hx + hw * 0.85, groundY * 0.66 - hh * 0.9], [hx + hw * 0.85, groundY * 0.66 - hh * 0.65], [hx + hw * 0.7, groundY * 0.66 - hh * 0.65]], '#451a03', INK, 1.2);
    }

    // C. Mặt đường đá cuội (cobblestone) và vỉa hè
    const groundGrad = ctx.createLinearGradient(0, groundY * 0.66, 0, 1024);
    groundGrad.addColorStop(0, isNight ? '#1e293b' : '#64748b');
    groundGrad.addColorStop(1, isNight ? '#0f172a' : '#475569');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY * 0.66, 576, 1024 - groundY * 0.66);

    // Hoa văn các viên đá cuội bo tròn lát đường
    for (let row = 0; row < 10; row++) {
      const ry = groundY * 0.72 + row * 28;
      const xOffset = (row % 2) * 16;
      for (let rx = xOffset; rx < 576; rx += 32) {
        ellipse(ctx, rx, ry, 12, 6, isNight ? '#0f172a' : '#94a3b8', null);
      }
    }

    // D. Đèn đường khí đốt / đèn đường sắt rèn cổ điển
    const lampX = 490, lampBaseY = groundY;
    line(ctx, [[lampX, lampBaseY], [lampX, lampBaseY - 140]], '#0f172a', 3.6); // Trụ sắt
    // Tay uốn sắt rèn đỡ đèn
    path(ctx, `M ${lampX} ${lampBaseY - 130} Q ${lampX - 16} ${lampBaseY - 145} ${lampX} ${lampBaseY - 150}`, null, '#0f172a', 2.2);
    // Lồng đèn lục giác
    drawPoly(ctx, [[lampX - 12, lampBaseY - 150], [lampX + 12, lampBaseY - 150], [lampX + 8, lampBaseY - 175], [lampX - 8, lampBaseY - 175]], isNight ? '#fef08a' : '#f8fafc', INK, 1.6);
    if (isNight) {
      ellipse(ctx, lampX, lampBaseY - 162, 28, 18, 'rgba(254, 240, 138, 0.45)', null);
    }
  }

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  const INVENTIONS_RIGS = {
    draisine_1817: {
      draw(ctx, s, t) { drawDraisine1817(ctx, s, t); }
    },
    phonograph: {
      draw(ctx, s, t) { drawPhonograph(ctx, s, t); }
    },
    early_telephone: {
      draw(ctx, s, t) { drawEarlyTelephone(ctx, s, t); }
    },
    movable_type_tray: {
      draw(ctx, s, t) { drawMovableTypeTray(ctx, s, t); }
    },
    water_clock: {
      draw(ctx, s, t) { drawWaterClock(ctx, s, t); }
    },
    rain_gauge: {
      draw(ctx, s, t) { drawRainGauge(ctx, s, t); }
    },
    eyeglasses_early: {
      draw(ctx, s, t) { drawEyeglassesEarly(ctx, s, t); }
    },
    toothbrush_early: {
      draw(ctx, s, t) { drawToothbrushEarly(ctx, s, t); }
    },
    paper_sheet_stack: {
      draw(ctx, s, t) { drawPaperSheetStack(ctx, s, t); }
    },
    coin_stack: {
      draw(ctx, s, t) { drawCoinStack(ctx, s, t); }
    },
    workbench_clutter: {
      draw(ctx, s, t) { drawWorkbenchClutter(ctx, s, t); }
    },
    smartphone: {
      draw(ctx, s, t) { drawSmartphone(ctx, s, t); }
    },
    led_bulb: {
      draw(ctx, s, t) { drawLedBulb(ctx, s, t); }
    }
  };

  const INVENTIONS_BACKGROUNDS = {
    workshop_1900: {
      label: 'Xưởng phát minh năm 1900',
      theme: 'home',
      ground_y: 810,
      draw(ctx, settings, t) { drawWorkshop1900(ctx, settings, t); }
    },
    old_town_1900: {
      label: 'Phố cổ năm 1900',
      theme: 'street',
      ground_y: 810,
      draw(ctx, settings, t) { drawOldTown1900(ctx, settings, t); }
    }
  };

  const INVENTIONS_ACTIONS = {
    pull_lever(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor], target = states[a.target];
      if (!actor || !target) return;
      const targetAnchor = a.target_anchor || 'press';
      const pt = RemakeVector.worldAnchor(cat, target, targetAnchor);
      const heave = Math.sin(p * Math.PI) * 6;
      const local = RemakeVector.worldToLocal(actor, { x: pt.x, y: pt.y + heave });
      actor.hand_r_x = local[0];
      actor.hand_r_y = local[1];
      if (a.paper && states[a.paper]) {
        states[a.paper].growth = Math.max(states[a.paper].growth || 0, mix(0.1, 1.0, u));
      }
    }
  };

  RemakeVector.register({
    rigs: INVENTIONS_RIGS,
    backgrounds: INVENTIONS_BACKGROUNDS,
    actionHooks: INVENTIONS_ACTIONS
  });

})();
