// remake_vector_packs/medieval.js — Giai đoạn N: Trung cổ, hiệp sĩ, Viking (medieval)
// 9 rigs: well, anvil, forge, horseshoe, spinning_wheel, wool_basket, banner_plain, star_compass_viking, viking_longhouse
// 3 backgrounds: castle_yard, medieval_village, viking_fjord (all ground_y: 810, 7 weathers, day/night, ZERO text)
// 1 action hook: hammer_anvil (thợ rèn gõ búa xuống mặt đe)

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('RemakeVector core engine must be loaded before engine packs.');
  }

  const {
    path,
    line,
    ellipse,
    cylinder,
    taper,
    tone,
    INK,
    TAU,
    clamp,
    smooth,
    mix
  } = RemakeVector.kit;

  function drawPoly(ctx, pts, fill, stroke, width = 1) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  function toolOffset(cat, actor, tool, anchorName) {
    const lr = tool.rotation || 0, rot = actor.rotation || 0;
    const d = RemakeVector.kit.rotate(tool.x * (actor.flip ? -1 : 1), tool.y, rot);
    const probe = { ...tool, x: d[0], y: d[1], rotation: rot + (actor.flip ? -lr : lr), flip: Boolean(actor.flip) !== Boolean(tool.flip) };
    return RemakeVector.worldAnchor(cat, probe, anchorName);
  }

  // =============================================================
  // 1. WELL (Giếng nước đá trung cổ có tời và gầu)
  // width: 68, height: 92, y: [-92, 0]
  // =============================================================
  function drawWell(ctx, s, t) {
    ctx.save();
    const lift = clamp(s.lift ?? 1.0, 0, 1);
    const stoneCol = '#64748b';
    const darkStone = '#475569';
    const timberCol = '#78350f';
    const darkTimber = '#451a03';

    // 1. Tang giếng đá tròn (từ y=-36 đến y=0)
    // Mặt ngoài tang đá
    drawPoly(ctx, [[-30, 0], [30, 0], [30, -36], [-30, -36]], stoneCol, INK, 1.4);
    // Các hàng đá hộc ghép vòng cung
    for (let y = -8; y >= -32; y -= 8) {
      line(ctx, [[-30, y], [30, y]], darkStone, 1.0);
    }
    for (let row = 0; row < 4; row++) {
      const yMid = -4 - row * 8;
      const offset = (row % 2) * 8;
      for (let x = -24 + offset; x < 28; x += 16) {
        line(ctx, [[x, yMid + 4], [x, yMid - 4]], darkStone, 0.9);
      }
    }

    // Miệng giếng hình bầu dục nhìn nghiêng (opening)
    ellipse(ctx, 0, -36, 30, 10, '#334155', INK, 1.4);
    // Lòng giếng sâu thẳm có nước xanh biếc
    ellipse(ctx, 0, -36, 24, 7, '#0f172a', null);
    ellipse(ctx, 0, -35, 20, 5, '#0284c7', null);

    // 2. Hai cột gỗ chịu lực hai bên đỡ mái (từ y=-36 lên y=-78)
    drawPoly(ctx, [[-26, -34], [-20, -34], [-20, -78], [-26, -78]], cylinder(ctx, -26, -20, timberCol), INK, 1.2);
    drawPoly(ctx, [[20, -34], [26, -34], [26, -78], [20, -78]], cylinder(ctx, 20, 26, timberCol), INK, 1.2);

    // Xà ngang kết nối hai cột
    drawPoly(ctx, [[-28, -74], [28, -74], [28, -79], [-28, -79]], timberCol, INK, 1.2);

    // 3. Trục tời gỗ (windlass axle) ở giữa y=-60
    drawPoly(ctx, [[-20, -58], [20, -58], [20, -64], [-20, -64]], cylinder(ctx, -20, 20, '#a16207'), INK, 1.0);
    // Cuộn dây thừng quấn quanh trục
    drawPoly(ctx, [[-7, -57], [7, -57], [7, -65], [-7, -65]], '#d97706', INK, 0.9);
    for (let x = -6; x <= 6; x += 3) {
      line(ctx, [[x, -57], [x, -65]], '#78350f', 0.8);
    }

    // Tay quay bằng sắt bên phải
    line(ctx, [[20, -61], [30, -61], [30, -53], [34, -53]], '#1e293b', 2.0);
    ellipse(ctx, 34, -53, 2, 2, '#475569', null);

    // 4. Dây thừng thòng xuống gầu nước
    // Khi lift=1: gầu ở y=-40 (ngay miệng giếng), khi lift=0: gầu hạ sâu xuống y=-18 (trong lòng giếng)
    const bucketY = mix(-18, -40, lift);
    line(ctx, [[0, -61], [0, bucketY - 12]], '#d97706', 1.4);

    // Gầu gỗ (bucket) có quai sắt
    // Quai xách sắt hình bán nguyệt
    path(ctx, `M -8 ${bucketY} Q 0 ${bucketY - 12} 8 ${bucketY}`, null, '#1e293b', 1.4);
    // Thân thùng gỗ
    drawPoly(ctx, [[-9, bucketY], [9, bucketY], [7, bucketY + 14], [-7, bucketY + 14]], '#b45309', INK, 1.2);
    // Đai sắt thùng
    line(ctx, [[-8.5, bucketY + 4], [8.5, bucketY + 4]], '#334155', 1.0);
    line(ctx, [[-7.5, bucketY + 10], [7.5, bucketY + 10]], '#334155', 1.0);
    // Nước trong gầu
    ellipse(ctx, 0, bucketY + 1, 8, 3, '#38bdf8', null);

    // 5. Mái ngói che giếng (gable roof: y từ -76 lên đỉnh -92)
    // Tam giác hồi mái gỗ
    drawPoly(ctx, [[-30, -78], [30, -78], [0, -90]], darkTimber, INK, 1.2);
    // Mái ngói ván dốc
    drawPoly(ctx, [[-34, -76], [2, -92], [0, -92], [-32, -76]], '#991b1b', INK, 1.4);
    drawPoly(ctx, [[34, -76], [-2, -92], [0, -92], [32, -76]], '#b91c1c', INK, 1.4);
    // Nóc bờ mái
    line(ctx, [[-34, -76], [0, -92]], '#fef2f2', 1.0);
    line(ctx, [[34, -76], [0, -92]], '#fef2f2', 1.0);

    ctx.restore();
  }

  // =============================================================
  // 2. ANVIL (Đe thợ rèn bằng thép đúc trên bệ gỗ sồi)
  // width: 88, height: 52, y: [-52, 0]
  // =============================================================
  function drawAnvil(ctx, s, t) {
    ctx.save();
    const steelTop = '#64748b';
    const steelBody = '#334155';
    const steelDark = '#1e293b';
    const woodBase = '#78350f';
    const darkWood = '#451a03';

    // 1. Khối đế gỗ sồi to tròn vững chắc (từ y=-22 đến y=0)
    drawPoly(ctx, [[-26, 0], [26, 0], [24, -22], [-24, -22]], cylinder(ctx, -26, 26, woodBase), INK, 1.4);
    // Vòng đai sắt gia cố đế gỗ
    drawPoly(ctx, [[-25, -10], [25, -10], [24.5, -14], [-24.5, -14]], '#334155', INK, 1.0);
    // Các đường vân gỗ dọc
    for (let x = -18; x <= 18; x += 9) {
      line(ctx, [[x, -2], [x, -20]], darkWood, 0.8);
    }

    // 2. Chân đế đe kim loại xoè rộng (từ y=-22 đến y=-30)
    drawPoly(ctx, [[-22, -22], [22, -22], [14, -30], [-14, -30]], steelDark, INK, 1.2);

    // 3. Eo thắt thân đe (waist: từ y=-30 đến y=-44)
    drawPoly(ctx, [[-14, -30], [14, -30], [16, -44], [-16, -44]], cylinder(ctx, -16, 16, steelBody), INK, 1.2);

    // 4. Khối đe trên cùng:
    // Mũi nhọn đe (horn/bick) bên trái: thon dần từ x=-16 về x=-42 ở y=-48
    path(
      ctx,
      `M -16 -44 L -42 -49 Q -40 -51 -16 -50 Z`,
      cylinder(ctx, -42, -16, steelTop),
      INK,
      1.2
    );

    // Mặt đe chính phẳng nhẵn bóng loáng (striking face / surface): x: [-16, 26], y: -50
    drawPoly(ctx, [[-16, -44], [36, -44], [38, -50], [-16, -50]], steelBody, INK, 1.2);
    // Mặt phẳng trên cùng (bóng thép sáng)
    drawPoly(ctx, [[-40, -50], [38, -50], [36, -52], [-38, -52]], steelTop, INK, 1.0);

    // Đuôi đe (heel) bên phải: vươn ra x=38, có lỗ đục (hardy hole)
    ellipse(ctx, 24, -51, 2.5, 1.5, '#0f172a', null);

    ctx.restore();
  }

  // =============================================================
  // 3. FORGE (Lò rèn đá vòm truyền thống có lửa cháy)
  // width: 84, height: 96, y: [-96, 0]
  // =============================================================
  function drawForge(ctx, s, t) {
    ctx.save();
    const lit = clamp(s.lit ?? 1.0, 0, 1);
    const stoneCol = '#475569';
    const darkStone = '#334155';
    const brickCol = '#78350f';

    // 1. Bệ xây đá lò rèn (hearth: x: [-38, 38], y: [-40, 0])
    drawPoly(ctx, [[-38, 0], [38, 0], [38, -40], [-38, -40]], stoneCol, INK, 1.4);
    // Vân gạch đá bệ lò
    for (let y = -10; y >= -35; y -= 10) {
      line(ctx, [[-38, y], [38, y]], darkStone, 1.0);
    }
    for (let row = 0; row < 4; row++) {
      const yMid = -5 - row * 10;
      const off = (row % 2) * 12;
      for (let x = -30 + off; x < 36; x += 24) {
        line(ctx, [[x, yMid + 5], [x, yMid - 5]], darkStone, 0.9);
      }
    }

    // Mặt bệ đặt than rèn (y=-40)
    drawPoly(ctx, [[-40, -40], [40, -40], [36, -44], [-36, -44]], '#1e293b', INK, 1.2);

    // 2. Vòm lò rèn và ống khói đá phía trên (y: [-44, -96])
    // Thân ống khói vươn cao
    drawPoly(ctx, [[-22, -44], [22, -44], [16, -96], [-16, -96]], darkStone, INK, 1.4);
    // Vành gờ miệng ống khói
    drawPoly(ctx, [[-18, -92], [18, -92], [18, -96], [-18, -96]], stoneCol, INK, 1.2);

    // Hốc vòm đốt than lửa (firepot / hearth opening)
    path(
      ctx,
      `M -24 -42 L -24 -62 A 24 24 0 0 1 24 -62 L 24 -42 Z`,
      '#0f172a',
      INK,
      1.4
    );

    // 3. Lửa than hồng và ngọn lửa rực sáng theo s.lit
    if (lit > 0.03) {
      ctx.save();
      ctx.globalAlpha = lit;

      // Quầng sáng rực tỏa ra xung quanh miệng lò
      const glow = ctx.createRadialGradient(0, -50, 4, 0, -50, 36);
      glow.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
      glow.addColorStop(0.4, 'rgba(249, 115, 22, 0.6)');
      glow.addColorStop(0.8, 'rgba(220, 38, 38, 0.2)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, -50, 36, 0, TAU);
      ctx.fill();

      // Than hồng rực đáy lò
      ellipse(ctx, 0, -44, 18, 5, '#ea580c', null);
      ellipse(ctx, 0, -44, 12, 3, '#fde047', null);

      // Ngọn lửa nhảy múa (flickering flame tongues)
      const f1 = Math.sin(t * 14) * 3;
      const f2 = Math.cos(t * 16) * 3;
      const f3 = Math.sin(t * 18 + 1) * 2;

      // Lớp lửa đỏ ngoài
      path(
        ctx,
        `M -14 -44 Q -10 -58 ${-4 + f1} -68 Q 2 -56 8 -64 Q 14 -54 14 -44 Z`,
        '#dc2626',
        null
      );
      // Lớp lửa cam giữa
      path(
        ctx,
        `M -10 -44 Q -6 -54 ${0 + f2} -64 Q 6 -52 10 -44 Z`,
        '#f97316',
        null
      );
      // Lõi lửa vàng rực sáng
      path(
        ctx,
        `M -6 -44 Q -2 -50 ${f3} -58 Q 4 -48 6 -44 Z`,
        '#fef08a',
        null
      );

      // Các tia lửa bay lên ống khói (sparks)
      for (let i = 0; i < 4; i++) {
        const sx = Math.sin(t * 10 + i * 2) * 8;
        const sy = -65 - ((t * 30 + i * 15) % 25);
        ellipse(ctx, sx, sy, 1.2, 1.2, '#fef08a', null);
      }

      ctx.restore();
    } else {
      // Than nguội đen khi tắt lò
      ellipse(ctx, 0, -44, 16, 4, '#292524', null);
    }

    ctx.restore();
  }

  // =============================================================
  // 4. HORSESHOE (Móng ngựa rèn chữ U truyền thống)
  // width: 44, height: 48, y: [-48, 0]
  // =============================================================
  function drawHorseshoe(ctx, s, t) {
    ctx.save();
    const hot = clamp(s.hot ?? 0, 0, 1);
    const ironCol = hot > 0.3 ? mix('#475569', '#f97316', hot) : '#475569';
    const darkIron = hot > 0.3 ? mix('#1e293b', '#c2410c', hot) : '#1e293b';
    const highlight = hot > 0.3 ? mix('#94a3b8', '#fde047', hot) : '#94a3b8';

    // Nếu móng ngựa nóng đỏ: quầng sáng nhiệt
    if (hot > 0.25) {
      ctx.save();
      ctx.globalAlpha = hot * 0.6;
      ellipse(ctx, 0, -25, 26, 28, '#ea580c', null);
      ctx.restore();
    }

    // Vẽ thân móng hình vành móng ngựa chữ U dày dặn
    // Cung ngoài (outer arc) và cung trong (inner arc)
    ctx.beginPath();
    // Mũi móng (toe): x=0, y=-48
    // Nhánh trái từ gót móng x=-18, y=-6 qua sườn móng lên mũi móng
    ctx.moveTo(-18, -6);
    ctx.bezierCurveTo(-24, -20, -22, -44, 0, -48);
    ctx.bezierCurveTo(22, -44, 24, -20, 18, -6);
    // Gót móng phải (heel right)
    ctx.lineTo(12, -6);
    // Cung trong
    ctx.bezierCurveTo(15, -18, 14, -36, 0, -38);
    ctx.bezierCurveTo(-14, -36, -15, -18, -12, -6);
    ctx.closePath();

    ctx.fillStyle = ironCol;
    ctx.fill();
    ctx.strokeStyle = darkIron;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Rãnh móng (fuller groove) và các lỗ đinh móng (nail holes)
    for (const side of [-1, 1]) {
      // 3 lỗ đinh móng mỗi bên
      for (const [nx, ny] of [[side * 17, -14], [side * 18, -26], [side * 14, -38]]) {
        ellipse(ctx, nx, ny, 1.8, 2.5, darkIron, null);
        if (hot > 0.3) {
          ellipse(ctx, nx, ny, 1.0, 1.5, '#fef08a', null);
        }
      }
    }

    // Mấu mũi móng ngựa (toe clip)
    drawPoly(ctx, [[-4, -48], [4, -48], [0, -51]], highlight, darkIron, 0.8);

    // Mấu gót móng hai bên (calkins)
    drawPoly(ctx, [[-19, -6], [-11, -6], [-11, -2], [-19, -2]], highlight, darkIron, 0.8);
    drawPoly(ctx, [[11, -6], [19, -6], [19, -2], [11, -2]], highlight, darkIron, 0.8);

    ctx.restore();
  }

  // =============================================================
  // 5. SPINNING_WHEEL (Xa quay sợi gỗ cổ điển)
  // width: 84, height: 86, y: [-86, 0]
  // =============================================================
  function drawSpinningWheel(ctx, s, t) {
    ctx.save();
    const woodCol = '#92400e';
    const darkWood = '#451a03';
    const lightWood = '#d97706';
    const spin = (s.spin ?? 0) * TAU + (s.spinning ? t * 8 : 0);

    // 1. Chân đế gỗ nghiêng vững chãi (3 chân tiện chạm đất y=0)
    // Chân trái, giữa, phải
    line(ctx, [[-30, -18], [-34, 0]], woodCol, 3.0);
    line(ctx, [[-6, -18], [-8, 0]], woodCol, 3.0);
    line(ctx, [[24, -20], [28, 0]], woodCol, 3.0);
    // Bàn đế gỗ vát nghiêng
    drawPoly(ctx, [[-34, -18], [28, -22], [28, -26], [-34, -22]], cylinder(ctx, -34, 28, woodCol), INK, 1.2);

    // Bàn đạp chân (treadle) ở đáy
    line(ctx, [[-16, -6], [4, -6]], '#78350f', 2.0);

    // 2. Hai cột tiện đỡ trục bánh xe lớn bên trái (từ y=-22 lên tâm y=-54)
    line(ctx, [[-18, -22], [-18, -54]], darkWood, 3.5);
    line(ctx, [[-14, -22], [-14, -54]], woodCol, 3.5);

    // 3. Bánh xe quay sợi lớn (Drive wheel, r=26, tâm tại x=-16, y=-54)
    const wx = -16, wy = -54, wr = 26;
    // Vành gỗ ngoài
    ellipse(ctx, wx, wy, wr, wr, null, woodCol, 2.5);
    ellipse(ctx, wx, wy, wr - 3, wr - 3, null, darkWood, 1.0);
    // Trục bánh xe tròn
    ellipse(ctx, wx, wy, 4.5, 4.5, '#451a03', INK, 1.0);

    // 8 nan hoa gỗ tiện xoay tròn theo spin
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(spin);
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const x2 = Math.cos(ang) * (wr - 3);
      const y2 = Math.sin(ang) * (wr - 3);
      line(ctx, [[0, 0], [x2, y2]], lightWood, 1.4);
      // Nốt tiện tròn giữa nan hoa
      const mx = Math.cos(ang) * (wr * 0.5);
      const my = Math.sin(ang) * (wr * 0.5);
      ellipse(ctx, mx, my, 1.5, 1.5, darkWood, null);
    }
    ctx.restore();

    // 4. Khung giữ cụm con suốt bên phải (Maiden posts & Mother-of-all)
    const sx = 22, sy = -46;
    drawPoly(ctx, [[sx - 4, -24], [sx + 4, -24], [sx + 3, -56], [sx - 3, -56]], cylinder(ctx, sx - 4, sx + 4, woodCol), INK, 1.2);

    // Con suốt cuộn len (spindle & bobbin)
    drawPoly(ctx, [[sx - 10, sy - 4], [sx + 10, sy - 4], [sx + 10, sy + 4], [-10 + sx, sy + 4]], '#fef3c7', INK, 1.0);
    // Sợi len cuộn dày quanh con suốt
    ellipse(ctx, sx, sy, 8, 5, '#fef9c3', null);
    // Đầu suốt kim loại nhọn (spindle tip) vươn ra phải
    line(ctx, [[sx + 10, sy], [sx + 18, sy]], '#64748b', 1.8);

    // Dây curoa truyền động (drive band) nối vành bánh xe lớn sang puli con suốt
    line(ctx, [[wx, wy - wr], [sx, sy - 4]], '#d97706', 0.9);
    line(ctx, [[wx, wy + wr], [sx, sy + 4]], '#d97706', 0.9);

    ctx.restore();
  }

  // =============================================================
  // 6. WOOL_BASKET (Giỏ mây đan tròn đựng đầy cuộn len)
  // width: 54, height: 48, y: [-48, 0]
  // =============================================================
  function drawWoolBasket(ctx, s, t) {
    ctx.save();
    const caneLight = '#d97706';
    const caneDark = '#b45309';
    const caneDeep = '#78350f';

    // 1. Quai xách giỏ mây uốn cong vòm (crest at y=-48)
    path(ctx, `M -22 -32 Q 0 -52 22 -32`, null, caneDeep, 3.0);
    path(ctx, `M -22 -32 Q 0 -52 22 -32`, null, caneLight, 1.8);

    // 2. Thân giỏ mây đan hình bát tròn (từ y=-32 đến đáy y=0)
    drawPoly(ctx, [[-26, -32], [26, -32], [18, 0], [-18, 0]], caneDark, INK, 1.4);
    // Đáy giỏ
    ellipse(ctx, 0, 0, 18, 4, caneDeep, null);
    // Các đường đan mây ngang & dọc đan nong mốt
    for (let y = -8; y >= -28; y -= 7) {
      line(ctx, [[-20 - (y / -32) * 5, y], [20 + (y / -32) * 5, y]], caneDeep, 1.1);
    }
    for (let x = -20; x <= 20; x += 7) {
      line(ctx, [[x * 0.7, 0], [x, -32]], caneLight, 1.0);
    }
    // Vành miệng giỏ đan xoắn
    ellipse(ctx, 0, -32, 26, 6, caneLight, INK, 1.4);
    ellipse(ctx, 0, -32, 23, 4.5, caneDeep, null);

    // 3. Các cuộn len tròn bồng bềnh xếp đầy trong giỏ
    // Cuộn kem
    ellipse(ctx, -10, -34, 11, 10, '#fef3c7', INK, 1.0);
    // Cuộn xanh lam
    ellipse(ctx, 10, -35, 12, 10.5, '#93c5fd', INK, 1.0);
    // Cuộn đỏ ấm ở giữa
    ellipse(ctx, 0, -39, 11, 10, '#f43f5e', INK, 1.0);
    // Cuộn xanh lá sage góc phải
    ellipse(ctx, 14, -32, 9, 8, '#86efac', INK, 0.9);

    // Que đan bằng gỗ cắm xiên qua cuộn len
    line(ctx, [[-16, -46], [16, -26]], '#e2e8f0', 2.0);
    ellipse(ctx, -16, -46, 2.5, 2.5, '#b45309', null);

    ctx.restore();
  }

  // =============================================================
  // 7. BANNER_PLAIN (Cờ đuôi nheo cán giáo trung cổ màu trơn)
  // width: 56, height: 98, y: [-98, 0]
  // =============================================================
  function drawBannerPlain(ctx, s, t) {
    ctx.save();
    const wind = s.wind ?? 0;
    const wave = Math.sin(t * 5) * (2.5 + wind * 6);
    const wave2 = Math.cos(t * 6) * (3 + wind * 8);

    // 1. Cán giáo / cột cờ bằng gỗ tiện (pole: từ y=0 lên y=-96)
    line(ctx, [[0, 0], [0, -96]], '#78350f', 3.5);
    line(ctx, [[0, 0], [0, -96]], '#b45309', 1.8);
    // Khâu đồng bịt đế cờ
    drawPoly(ctx, [[-2, 0], [2, 0], [2, -6], [-2, -6]], '#ca8a04', INK, 0.8);

    // Ngọn giáo đồng trang trí trên đỉnh cờ (spearhead finial: y=-98)
    drawPoly(ctx, [[-3, -94], [3, -94], [0, -98]], '#eab308', INK, 1.0);

    // 2. Lá cờ đuôi nheo (gonfalon pennon) xẻ đuôi én bay phấp phới sang phải
    // Màu sắc chia hai nửa hình học vương giả: trên đỏ thẫm (#dc2626), dưới vàng kim (#eab308) - ZERO logo/emblem (§31)
    const yTop = -90, yBot = -54;

    // Nửa trên màu đỏ thẫm
    path(
      ctx,
      `M 0 ${yTop} Q 24 ${yTop - 2 + wave} 50 ${yTop + 6 + wave2} L 36 ${yTop + 18 + wave} L 0 ${yTop + 18} Z`,
      '#dc2626',
      INK,
      1.2
    );

    // Nửa dưới màu vàng kim hoàng gia
    path(
      ctx,
      `M 0 ${yTop + 18} L 36 ${yTop + 18 + wave} L 48 ${yBot + wave2} Q 22 ${yBot - 3 + wave} 0 ${yBot} Z`,
      '#eab308',
      INK,
      1.2
    );

    // Vòng khuyên da/kim loại buộc cờ vào cán
    for (let y = yTop; y <= yBot; y += 12) {
      ellipse(ctx, 0, y, 2.5, 2.5, '#ca8a04', INK, 0.8);
    }

    ctx.restore();
  }

  // =============================================================
  // 8. STAR_COMPASS_VIKING (Đĩa định hướng mặt trời/sao Viking)
  // width: 50, height: 50, y: [-50, 0]
  // =============================================================
  function drawStarCompassViking(ctx, s, t) {
    ctx.save();
    const woodBase = '#78350f';
    const darkWood = '#451a03';
    const lightWood = '#d97706';

    // Tâm đĩa tại x=0, y=-25, bán kính r=24 (y: [-49, -1])
    const cx = 0, cy = -25, r = 23;

    // Quai cầm da có chốt tán ở đáy (y: [-6, 0])
    drawPoly(ctx, [[-4, -5], [4, -5], [3, 0], [-3, 0]], '#292524', INK, 0.8);

    // Đĩa gỗ sồi tròn dày có vân tiện bậc
    ellipse(ctx, cx, cy, r, r, cylinder(ctx, cx - r, cx + r, woodBase), INK, 1.4);
    ellipse(ctx, cx, cy, r - 3, r - 3, null, darkWood, 1.0);
    ellipse(ctx, cx, cy, r - 5, r - 5, lightWood, null);

    // 16 vạch chia phương hướng hình học khắc quanh chu vi đĩa (ZERO chữ rune thật §31)
    for (let i = 0; i < 16; i++) {
      const ang = (i * Math.PI) / 8;
      const isMajor = i % 4 === 0;
      const len = isMajor ? 6.5 : 3.5;
      const x1 = cx + Math.cos(ang) * (r - 5);
      const y1 = cy + Math.sin(ang) * (r - 5);
      const x2 = cx + Math.cos(ang) * (r - 5 - len);
      const y2 = cy + Math.sin(ang) * (r - 5 - len);
      line(ctx, [[x1, y1], [x2, y2]], darkWood, isMajor ? 1.6 : 1.0);
    }

    // Vòng tròn trung tâm
    ellipse(ctx, cx, cy, 7, 7, darkWood, INK, 1.0);

    // Kim gnomon hình nón ở tâm đổ bóng (shadow pin)
    drawPoly(ctx, [[cx - 2.5, cy], [cx + 2.5, cy], [cx, cy - 6]], '#fef08a', darkWood, 0.8);

    ctx.restore();
  }

  // =============================================================
  // 9. VIKING_LONGHOUSE (Nhà dài Viking tường gỗ cong mái phủ cỏ xanh)
  // width: 160, height: 94, y: [-94, 0]
  // =============================================================
  function drawVikingLonghouse(ctx, s, t) {
    ctx.save();
    const growth = clamp(s.growth ?? 1.0, 0, 1);
    const timberWall = '#3f2a1a';
    const darkTimber = '#292524';
    const grassGreen = '#15803d';
    const deepGrass = '#166534';
    const earthCol = '#78350f';

    // 1. Nền móng đá và tường gỗ cong hình thân thuyền Viking (từ y=-36 đến y=0)
    // Móng đá kè chân
    drawPoly(ctx, [[-78, 0], [78, 0], [74, -8], [-74, -8]], '#57534e', INK, 1.2);

    // Thân tường gỗ vát cong
    const wallH = 34 * growth;
    drawPoly(ctx, [[-74, -8], [74, -8], [70, -8 - wallH], [-70, -8 - wallH]], cylinder(ctx, -74, 74, timberWall), INK, 1.4);
    // Các hàng súc gỗ ghép ngang
    for (let y = -14; y >= -8 - wallH; y -= 7) {
      line(ctx, [[-72, y], [72, y]], darkTimber, 1.0);
    }

    // Cửa ra vào gỗ ở trung tâm
    drawPoly(ctx, [[-12, -8], [12, -8], [12, -8 - wallH * 0.75], [-12, -8 - wallH * 0.75]], '#1c1917', INK, 1.2);
    // Bản lề sắt cửa
    line(ctx, [[-10, -14], [-2, -14]], '#78716c', 1.2);
    line(ctx, [[-10, -26], [-2, -26]], '#78716c', 1.2);

    // 2. Mái dốc phủ cỏ xanh (Turf roof: y từ -38 lên đỉnh y=-92) khi growth > 0.3
    if (growth > 0.3) {
      const roofProgress = (growth - 0.3) / 0.7;
      const roofTop = mix(-42, -84, roofProgress);

      // Lớp đất nâu dưới lớp cỏ
      path(
        ctx,
        `M -80 -40 Q 0 ${roofTop + 6} 80 -40 L 76 ${roofTop} Q 0 ${roofTop - 2} -76 ${roofTop} Z`,
        earthCol,
        null
      );

      // Thảm cỏ xanh dày phủ trên mái
      path(
        ctx,
        `M -82 -42 Q 0 ${roofTop + 4} 82 -42 L 78 ${roofTop} Q 0 ${roofTop - 4} -78 ${roofTop} Z`,
        cylinder(ctx, -82, 82, grassGreen),
        INK,
        1.6
      );

      // Lớp cỏ gợn sóng tự nhiên
      for (let x = -70; x <= 70; x += 14) {
        const hBlade = 3 + Math.sin(x * 0.3) * 2;
        const yBase = mix(-42, roofTop, 1 - Math.abs(x) / 85);
        line(ctx, [[x, yBase], [x + 2, yBase - hBlade]], deepGrass, 1.2);
      }

      // 3. Đầu hồi gỗ chạm khắc hình đầu rồng Viking vươn cao hai bên nóc mái
      for (const side of [-1, 1]) {
        const hx = side * 76;
        path(
          ctx,
          `M ${hx} ${roofTop + 14} Q ${hx + side * 8} ${roofTop} ${hx + side * 10} ${roofTop - 10} Q ${hx + side * 6} ${roofTop - 14} ${hx} ${roofTop - 2} Z`,
          darkTimber,
          INK,
          1.2
        );
      }

      // Lỗ thoát khói (smoke hole) ở giữa nóc
      ellipse(ctx, 0, roofTop - 1, 9, 3.5, '#1c1917', INK, 1.0);
    }

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS (3 hình nền chuẩn ground_y: 810, 7 weathers, day/night, ZERO text)
  // =============================================================

  // 1. CASTLE_YARD (Sân trong lâu đài thời trung cổ)
  function drawCastleYard(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(1, '#1e1b4b');
    } else {
      sky.addColorStop(0, '#60a5fa');
      sky.addColorStop(0.7, '#bae6fd');
      sky.addColorStop(1, '#fef9c3');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY * 0.65);

    // Trăng đêm / Mây ngày
    if (isNight) {
      ellipse(ctx, 450, 110, 24, 24, '#fef08a', null);
      ellipse(ctx, 460, 106, 20, 20, '#030712', null);
      for (const s of [[80, 70], [170, 110], [280, 80], [360, 130], [120, 150]]) {
        ellipse(ctx, s[0], s[1], 1.5, 1.5, '#ffffff', null);
      }
    } else {
      ellipse(ctx, 140, 90, 50, 20, '#ffffff', null);
      ellipse(ctx, 180, 80, 40, 18, '#ffffff', null);
    }

    // Tường thành đá hùng vĩ phía sau (Curtain wall & Battlements)
    const wallBaseY = groundY * 0.65;
    const stoneCol = isNight ? '#1e293b' : '#94a3b8';
    const darkStone = isNight ? '#0f172a' : '#64748b';

    // Bức tường thành chính ngang qua sân
    drawPoly(ctx, [[0, wallBaseY], [576, wallBaseY], [576, wallBaseY - 180], [0, wallBaseY - 180]], stoneCol, INK, 1.6);
    // Hàng đá ghép trên tường
    for (let y = wallBaseY - 20; y > wallBaseY - 170; y -= 22) {
      line(ctx, [[0, y], [576, y]], darkStone, 1.0);
    }
    // Răng cưa chiến luỹ (crenels & merlons) trên đỉnh tường
    for (let x = 10; x < 570; x += 36) {
      drawPoly(ctx, [[x, wallBaseY - 180], [x + 22, wallBaseY - 180], [x + 22, wallBaseY - 198], [x, wallBaseY - 198]], stoneCol, INK, 1.2);
    }

    // Cổng vòm thành lớn ở giữa (Gatehouse portcullis)
    const gw = 70, gh = 110;
    path(
      ctx,
      `M ${288 - gw} ${wallBaseY} L ${288 - gw} ${wallBaseY - gh + gw} A ${gw} ${gw} 0 0 1 ${288 + gw} ${wallBaseY - gh + gw} L ${288 + gw} ${wallBaseY} Z`,
      isNight ? '#090d16' : '#1c1917',
      INK,
      2.0
    );
    // Cửa lưới sắt kéo (portcullis lattice)
    for (let x = 288 - gw + 14; x < 288 + gw; x += 16) {
      line(ctx, [[x, wallBaseY - gh * 0.9], [x, wallBaseY - 10]], '#57534e', 2.0);
    }
    for (let y = wallBaseY - gh * 0.8; y < wallBaseY; y += 18) {
      line(ctx, [[288 - gw + 8, y], [288 + gw - 8, y]], '#57534e', 2.0);
    }

    // Hai tháp canh tròn hai bên cổng
    for (const tx of [70, 506]) {
      drawPoly(ctx, [[tx - 36, wallBaseY], [tx + 36, wallBaseY], [tx + 32, wallBaseY - 220], [tx - 32, wallBaseY - 220]], cylinder(ctx, tx - 36, tx + 36, stoneCol), INK, 1.6);
      // Mái chóp nón ngói đỏ
      drawPoly(ctx, [[tx - 38, wallBaseY - 220], [tx + 38, wallBaseY - 220], [tx, wallBaseY - 275]], isNight ? '#7f1d1d' : '#b91c1c', INK, 1.4);
      // Cờ đuôi nheo cắm trên đỉnh tháp
      line(ctx, [[tx, wallBaseY - 275], [tx, wallBaseY - 295]], '#334155', 1.8);
      path(ctx, `M ${tx} ${wallBaseY - 295} L ${tx + 22} ${wallBaseY - 288} L ${tx} ${wallBaseY - 281} Z`, '#eab308', INK, 0.9);
      // Lỗ châu mai hẹp (arrow slits)
      for (const ay of [wallBaseY - 80, wallBaseY - 140]) {
        drawPoly(ctx, [[tx - 2, ay], [tx + 2, ay], [tx + 2, ay - 16], [tx - 2, ay - 16]], '#0f172a', null);
      }
    }

    // Sân trong lâu đài lát đá phiến phẳng sạch sẽ (Cobblestone courtyard: từ wallBaseY xuống 1024)
    const ground = ctx.createLinearGradient(0, wallBaseY, 0, 1024);
    ground.addColorStop(0, isNight ? '#1e293b' : '#cbd5e1');
    ground.addColorStop(1, isNight ? '#0f172a' : '#94a3b8');
    ctx.fillStyle = ground;
    ctx.fillRect(0, wallBaseY, 576, 1024 - wallBaseY);

    // Các đường mạch đá lát sân
    for (let y = wallBaseY + 24; y < 1024; y += 40) {
      line(ctx, [[0, y], [576, y]], isNight ? '#0f172a' : '#64748b', 1.0);
    }

    ctx.restore();
  }

  // 2. MEDIEVAL_VILLAGE (Làng trung cổ châu Âu mái tranh và nhà khung gỗ)
  function drawMedievalVillage(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời nông thôn thanh bình
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(1, '#0f172a');
    } else {
      sky.addColorStop(0, '#38bdf8');
      sky.addColorStop(0.7, '#bae6fd');
      sky.addColorStop(1, '#fef3c7');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY * 0.65);

    if (isNight) {
      ellipse(ctx, 470, 100, 24, 24, '#fef08a', null);
    } else {
      ellipse(ctx, 480, 90, 30, 30, '#fbbf24', null);
    }

    // Đồi cỏ xanh uốn lượn phía xa
    const hillCol = isNight ? '#064e3b' : '#15803d';
    path(ctx, `M 0 ${groundY - 150} Q 288 ${groundY - 260} 576 ${groundY - 150} L 576 1024 L 0 1024 Z`, hillCol, null);

    // Cối xay gió nhỏ thấp thoáng trên đồi xa bên phải
    const wx = 300, wy = groundY - 205;
    drawPoly(ctx, [[wx - 10, wy], [wx + 10, wy], [wx + 7, wy - 30], [wx - 7, wy - 30]], '#d6d3d1', INK, 1.0);
    drawPoly(ctx, [[wx - 9, wy - 30], [wx + 9, wy - 30], [wx, wy - 42]], '#78350f', INK, 0.9);
    // 4 cánh cối xay gió
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 2 + t * 0.8;
      line(ctx, [[wx, wy - 32], [wx + Math.cos(ang) * 20, wy - 32 + Math.sin(ang) * 20]], '#451a03', 1.4);
    }

    // Dãy nhà khung gỗ (half-timbered houses) thời trung cổ
    const vBaseY = groundY - 130;
    const wallCol = isNight ? '#334155' : '#f5f5f4';
    const timberCol = isNight ? '#1e293b' : '#573312';
    const roofCol = isNight ? '#451a03' : '#a16207'; // Mái tranh rơm vàng nâu

    // Nhà 1 bên trái (x: 10 -> 210)
    drawPoly(ctx, [[10, vBaseY], [210, vBaseY], [210, vBaseY - 110], [10, vBaseY - 110]], wallCol, INK, 1.4);
    // Khung gỗ trang trí chữ X đặc trưng
    line(ctx, [[10, vBaseY - 55], [210, vBaseY - 55]], timberCol, 3.0);
    for (const bx of [10, 110, 210]) line(ctx, [[bx, vBaseY], [bx, vBaseY - 110]], timberCol, 3.0);
    line(ctx, [[10, vBaseY], [110, vBaseY - 55]], timberCol, 1.8);
    line(ctx, [[110, vBaseY], [10, vBaseY - 55]], timberCol, 1.8);
    // Mái ngói/tranh dốc đứng
    drawPoly(ctx, [[0, vBaseY - 105], [220, vBaseY - 105], [110, vBaseY - 175]], roofCol, INK, 1.6);

    // Nhà 2 bên phải (x: 340 -> 560)
    drawPoly(ctx, [[340, vBaseY], [560, vBaseY], [560, vBaseY - 120], [340, vBaseY - 120]], wallCol, INK, 1.4);
    line(ctx, [[340, vBaseY - 60], [560, vBaseY - 60]], timberCol, 3.0);
    for (const bx of [340, 450, 560]) line(ctx, [[bx, vBaseY], [bx, vBaseY - 120]], timberCol, 3.0);
    drawPoly(ctx, [[330, vBaseY - 115], [570, vBaseY - 115], [450, vBaseY - 185]], '#b91c1c', INK, 1.6);

    // Đường làng đất nện và cỏ hoa dại (từ vBaseY xuống đáy 1024)
    const road = ctx.createLinearGradient(0, vBaseY, 0, 1024);
    road.addColorStop(0, isNight ? '#3b2f24' : '#c8a574');
    road.addColorStop(1, isNight ? '#241c15' : '#a07b4f');
    ctx.fillStyle = road;
    ctx.fillRect(0, vBaseY, 576, 1024 - vBaseY);

    // Vệt bánh xe và sỏi trên đường đất nện
    for (const [gx, gy] of [[60, 60], [150, 110], [240, 40], [330, 150], [420, 90], [510, 170], [90, 200], [470, 30]]) ellipse(ctx, gx, vBaseY + gy, 5, 2.2, isNight ? '#1c1510' : '#8a6a44', null);
    line(ctx, [[0, vBaseY + 70], [576, vBaseY + 80]], isNight ? '#2a2119' : '#b08d5e', 2.0);

    // Hàng rào gỗ mộc mạc hai bên đường
    for (let rx = 10; rx <= 190; rx += 22) {
      line(ctx, [[rx, vBaseY + 10], [rx, vBaseY - 14]], '#78350f', 2.0);
    }
    line(ctx, [[10, vBaseY - 6], [190, vBaseY - 6]], '#78350f', 2.0);

    ctx.restore();
  }

  // 3. VIKING_FJORD (Vịnh hẹp Viking Fjord núi đá soi bóng mặt nước)
  function drawVikingFjord(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời Bắc Âu lạnh khoáng đạt
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.55);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(1, '#0f172a');
    } else {
      sky.addColorStop(0, '#67e8f9');
      sky.addColorStop(0.6, '#bae6fd');
      sky.addColorStop(1, '#f1f5f9');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY * 0.55);

    if (isNight) {
      ellipse(ctx, 460, 90, 22, 22, '#fef08a', null);
      for (const s of [[80, 60], [180, 80], [290, 50], [380, 100]]) {
        ellipse(ctx, s[0], s[1], 1.5, 1.5, '#ffffff', null);
      }
    }

    // Dãy núi đá vịnh hẹp (Fjord peaks) sừng sững dốc đứng
    const mtCol1 = isNight ? '#0f172a' : '#475569';
    const mtCol2 = isNight ? '#1e293b' : '#64748b';
    const snowCap = '#f8fafc';

    // Núi trái
    drawPoly(ctx, [[-30, groundY * 0.58], [280, groundY * 0.58], [90, groundY * 0.58 - 200]], mtCol1, null);
    drawPoly(ctx, [[55, groundY * 0.58 - 150], [125, groundY * 0.58 - 150], [90, groundY * 0.58 - 200]], snowCap, null);

    // Núi phải
    drawPoly(ctx, [[210, groundY * 0.58], [600, groundY * 0.58], [420, groundY * 0.58 - 230]], mtCol2, null);
    drawPoly(ctx, [[380, groundY * 0.58 - 170], [460, groundY * 0.58 - 170], [420, groundY * 0.58 - 230]], snowCap, null);

    // Rặng thông tùng Bắc Âu mọc ven chân vách đá
    for (let x = 10; x <= 560; x += 36) {
      drawPoly(ctx, [[x, groundY * 0.58], [x + 28, groundY * 0.58], [x + 14, groundY * 0.58 - 55]], '#064e3b', null);
    }

    // Mặt nước vịnh hẹp Fjord phẳng lặng xanh ngọc lam (từ y=groundY * 0.58 đến groundY)
    const water = ctx.createLinearGradient(0, groundY * 0.58, 0, groundY);
    water.addColorStop(0, isNight ? '#082f49' : '#0891b2');
    water.addColorStop(0.5, isNight ? '#0c4a6e' : '#0e7490');
    water.addColorStop(1, isNight ? '#082f49' : '#155e75');
    ctx.fillStyle = water;
    ctx.fillRect(0, groundY * 0.58, 576, groundY - groundY * 0.58);

    // Những gợn sóng nước lăn tăn
    for (let row = 0; row < 6; row++) {
      const yWave = groundY * 0.60 + row * 26;
      const off = Math.sin(t * 2 + row) * 10;
      for (let x = 20 + (row % 2) * 50; x < 550; x += 90) {
        path(ctx, `M ${x + off} ${yWave} Q ${x + 20 + off} ${yWave - 2} ${x + 40 + off} ${yWave}`, null, '#67e8f9', 1.0);
      }
    }

    // Giữa vịnh (open_water): nước kéo tới đáy khung, không bờ, không cầu tàu — thuyền nổi trên nước.
    if (settings && settings.open_water) {
      const deep = ctx.createLinearGradient(0, groundY, 0, 1024);
      deep.addColorStop(0, isNight ? '#082f49' : '#155e75');
      deep.addColorStop(1, isNight ? '#020617' : '#164e63');
      ctx.fillStyle = deep;
      ctx.fillRect(0, groundY, 576, 1024 - groundY);
      for (let row = 0; row < 7; row++) {
        const yWave = groundY + 14 + row * 30, off = Math.sin(t * 2 + row * 1.3) * 12;
        for (let x = (row % 2) * 45; x < 576; x += 90) path(ctx, `M ${x + off} ${yWave} Q ${x + 22 + off} ${yWave - 3} ${x + 44 + off} ${yWave}`, null, '#67e8f9', 1.2);
      }
      ctx.restore();
      return;
    }

    // Bờ đất và cầu cảng gỗ Viking (groundY đến 1024)
    const shore = ctx.createLinearGradient(0, groundY, 0, 1024);
    shore.addColorStop(0, isNight ? '#1e293b' : '#78716c');
    shore.addColorStop(1, isNight ? '#0f172a' : '#57534e');
    ctx.fillStyle = shore;
    ctx.fillRect(0, groundY, 576, 1024 - groundY);

    // Cầu tàu gỗ (wooden pier / jetty) bên trái vươn ra mép nước
    drawPoly(ctx, [[20, groundY + 80], [240, groundY + 80], [240, groundY - 30], [20, groundY - 30]], '#78350f', INK, 1.4);
    for (let y = groundY - 25; y < groundY + 80; y += 15) {
      line(ctx, [[20, y], [240, y]], '#451a03', 1.2);
    }
    // Cọc buộc thuyền (mooring bollards)
    for (const [bx, by] of [[40, groundY - 20], [140, groundY - 20], [220, groundY - 20]]) {
      drawPoly(ctx, [[bx - 4, by], [bx + 4, by], [bx + 4, by - 14], [bx - 4, by - 14]], '#292524', INK, 1.0);
    }

    ctx.restore();
  }

  // =============================================================
  // ACTION HOOKS (1 hook: hammer_anvil)
  // =============================================================
  const MEDIEVAL_ACTIONS = {
    // hammer_anvil: thợ rèn giơ búa và gõ nhịp nhàng xuống mặt đe
    // Mỗi nhịp gõ (strike contact), đầu búa (hammer.head) chạm chính xác mặt đe (anvil.surface) với khoảng cách < 12px!
    hammer_anvil(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      const target = states[a.target];
      if (!actor || !target) return;
      const tool = a.tool ? states[a.tool] : null;
      const anvilSurf = RemakeVector.worldAnchor(cat, target, 'surface');

      // Tần số gõ: 4 nhịp gõ đều đặn trong suốt action
      const beats = 4;
      const cycle = (p * beats) % 1.0;

      // Nhịp giơ búa lên và giáng xuống:
      // cycle: 0 -> 0.65 là nâng búa lên cao, 0.65 -> 0.88 là giáng nhanh xuống, 0.88 -> 1.0 là chạm mặt đe
      let lift = 0;
      if (cycle < 0.65) {
        lift = 32 * Math.sin((cycle / 0.65) * Math.PI);
      } else if (cycle < 0.88) {
        lift = 32 * (1 - (cycle - 0.65) / 0.23);
      } else {
        // Chạm mặt đe (lift = 0)
        lift = 0;
      }

      // Điểm chạm mục tiêu của đầu búa
      const dest = { x: anvilSurf.x, y: anvilSurf.y - lift };

      // IK điều khiển tay cầm búa của thợ rèn
      const toolAnchor = 'head';
      const off = tool ? toolOffset(cat, actor, tool, toolAnchor) : { x: 0, y: 0 };
      const local = RemakeVector.worldToLocal(actor, { x: dest.x - off.x, y: dest.y - off.y });
      const rest = RemakeVector.localAnchor(cat, actor, 'hand_r');
      actor.hand_r_x = mix(rest[0], local[0], amount);
      actor.hand_r_y = mix(rest[1], local[1], amount);
    }
  };

  // =============================================================
  // REGISTRATION (RemakeVector.register)
  // =============================================================
  const MEDIEVAL_RIGS = {
    well: {
      draw(ctx, s, t) { drawWell(ctx, s, t); }
    },
    anvil: {
      draw(ctx, s, t) { drawAnvil(ctx, s, t); }
    },
    forge: {
      draw(ctx, s, t) { drawForge(ctx, s, t); }
    },
    horseshoe: {
      draw(ctx, s, t) { drawHorseshoe(ctx, s, t); }
    },
    spinning_wheel: {
      draw(ctx, s, t) { drawSpinningWheel(ctx, s, t); }
    },
    wool_basket: {
      draw(ctx, s, t) { drawWoolBasket(ctx, s, t); }
    },
    banner_plain: {
      draw(ctx, s, t) { drawBannerPlain(ctx, s, t); }
    },
    star_compass_viking: {
      draw(ctx, s, t) { drawStarCompassViking(ctx, s, t); }
    },
    viking_longhouse: {
      draw(ctx, s, t) { drawVikingLonghouse(ctx, s, t); }
    }
  };

  const MEDIEVAL_BACKGROUNDS = {
    castle_yard: {
      label: 'Sân trong lâu đài trung cổ',
      theme: 'home',
      ground_y: 810,
      draw(ctx, settings, t) { drawCastleYard(ctx, settings, t); }
    },
    medieval_village: {
      label: 'Làng trung cổ châu Âu',
      theme: 'home',
      ground_y: 810,
      draw(ctx, settings, t) { drawMedievalVillage(ctx, settings, t); }
    },
    viking_fjord: {
      label: 'Vịnh hẹp Viking Fjord',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawVikingFjord(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: MEDIEVAL_RIGS,
    backgrounds: MEDIEVAL_BACKGROUNDS,
    actionHooks: MEDIEVAL_ACTIONS
  });

})();
