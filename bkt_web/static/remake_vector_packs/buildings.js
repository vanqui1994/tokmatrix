// remake_vector_packs/buildings.js — Giai đoạn J: Họ vật thể Công trình kiến trúc (drawBuilding)
// Lắp ghép mô-đun: walls (timber_frame, brick, stone, adobe, hanok, jp_wood, siding)
// và roof (gable, hip, curved_tile, thatch, flat, dome).
// Hỗ trợ growth (xây dựng dần từ móng lên cho động tác build) và cutaway (thấy tầng trong).

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') throw new Error('RemakeVector core engine must be loaded before engine packs.');

  const { path, line, ellipse, cylinder, taper, volume, tone, limb, mitten, INK, TAU, clamp, hash, smooth, mix } = RemakeVector.kit;

  function drawPoly(ctx, pts, fill, stroke, width = 1) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  // -------------------------------------------------------------
  // CẤU HÌNH CÔNG TRÌNH (BUILDING SPECS)
  // -------------------------------------------------------------
  const BUILDING_SPECS = {
    house: {
      label: 'Ngôi nhà mô-đun',
      width: 120, height: 95,
      walls: 'timber_frame',
      roof: 'gable',
      locale_walls: { de: 'timber_frame', us: 'siding', kr: 'hanok', jp: 'jp_wood', neutral: 'brick' },
      windows: [[-30, -45], [30, -45], [-30, -20], [30, -20]],
      door: [0, -18],
      chimney: true,
      topics: ['school', 'de_culture']
    },
    castle: {
      label: 'Lâu đài trung cổ',
      width: 160, height: 130,
      walls: 'stone',
      roof: 'towers',
      towers: 2,
      door: [0, -25],
      windows: [[-45, -80], [45, -80], [0, -75]],
      topics: ['medieval', 'fables']
    },
    pyramid: {
      label: 'Kim tự tháp',
      width: 160, height: 110,
      walls: 'stone',
      roof: 'pyramid',
      door: [0, -15],
      topics: ['ancient'],
      topics_exception: 'Công trình đặc thù của Ai Cập cổ đại'
    },
    temple_classic: {
      label: 'Đền cổ điển Hy Lạp/La Mã',
      width: 140, height: 90,
      walls: 'columns',
      roof: 'pediment',
      door: [0, -20],
      topics: ['ancient', 'festivals']
    },
    aqueduct: {
      label: 'Cầu dẫn nước cổ đại',
      width: 160, height: 80,
      walls: 'arches',
      roof: 'flat',
      topics: ['ancient', 'inventions']
    },
    lighthouse: {
      label: 'Ngọn hải đăng',
      width: 70, height: 140,
      walls: 'brick',
      roof: 'dome',
      lantern: true,
      door: [0, -16],
      windows: [[0, -60], [0, -95]],
      topics: ['ocean', 'safety']
    },
    windmill: {
      label: 'Cối xay gió',
      width: 90, height: 135,
      walls: 'timber_frame',
      roof: 'cone',
      sails: true,
      door: [0, -16],
      windows: [[0, -65]],
      topics: ['de_culture', 'farm']
    },
    school_building: {
      label: 'Toà nhà trường học',
      width: 150, height: 110,
      walls: 'brick',
      roof: 'gable',
      bell_tower: true,
      door: [0, -22],
      windows: [[-45, -35], [-20, -35], [20, -35], [45, -35], [-45, -65], [-20, -65], [20, -65], [45, -65]],
      topics: ['school', 'safety']
    },
    fire_station: {
      label: 'Trạm cứu hoả',
      width: 140, height: 105,
      walls: 'brick',
      roof: 'flat',
      garage_doors: true,
      door: [0, -28],
      windows: [[-35, -70], [35, -70]],
      topics: ['safety', 'jobs']
    },
    shop_front: {
      label: 'Cửa tiệm phố',
      width: 120, height: 85,
      walls: 'siding',
      roof: 'flat',
      awning: true,
      door: [25, -20],
      windows: [[-22, -24]],
      topics: ['jobs', 'food']
    },
    igloo: {
      label: 'Nhà băng Igloo',
      width: 110, height: 65,
      walls: 'ice',
      roof: 'dome',
      door: [28, -12],
      topics: ['nature', 'polar_cartoon']
    },
    stone_hut: {
      label: 'Túp lều đá thời xưa',
      width: 100, height: 80,
      walls: 'stone',
      roof: 'thatch',
      door: [0, -16],
      topics: ['ancient', 'nature']
    },
    moai_generic: {
      label: 'Tượng đá Moai bí ẩn',
      width: 65, height: 120,
      walls: 'stone',
      roof: 'flat',
      topics: ['mysteries', 'ocean']
    },
    standing_stones: {
      label: 'Vòng đá đứng cự thạch',
      width: 130, height: 85,
      walls: 'stone',
      roof: 'flat',
      topics: ['mysteries', 'ancient']
    }
  };

  // -------------------------------------------------------------
  // HÀM VẼ CÔNG TRÌNH: drawBuilding()
  // -------------------------------------------------------------
  function drawBuilding(ctx, s, t, spec, cat, kit) {
    const growth = clamp(s.growth !== undefined ? s.growth : 1.0);
    const cutaway = clamp(s.cutaway || 0);
    const w = spec.width;
    const h = spec.height;
    const id = s.asset;

    // Chiều cao dựng thực tế theo growth (xây từ móng lên)
    const curH = h * (0.15 + 0.85 * growth);

    ctx.save();

    // 1. MÓNG NHÀ
    drawPoly(ctx, [[-w * 0.52, 2], [w * 0.52, 2], [w * 0.5, -4], [-w * 0.5, -4]], '#64748b', INK, 1.4);

    if (growth < 0.25) {
      // Đang đặt gạch móng ban đầu
      for (let bx = -w * 0.45; bx <= w * 0.45; bx += 18) {
        drawPoly(ctx, [[bx, -4], [bx + 14, -4], [bx + 14, -12], [bx, -12]], '#94a3b8', INK, 1.0);
      }
      ctx.restore();
      return;
    }

    // 2. TƯỜNG (WALLS)
    const wallTop = -curH * (spec.roof === 'flat' ? 0.95 : 0.65);
    const wallL = -w * 0.45;
    const wallR = w * 0.45;

    if (id === 'moai_generic') {
      // Tượng đá Moai
      path(ctx, `M -18 0 L -18 -85 Q -16 -115 0 -115 Q 16 -115 18 -85 L 18 0 Z`, '#78716c', INK, 2.0);
      // Chân mày & mũi khoằm dài đặc trưng
      path(ctx, `M -12 -90 L 12 -90 L 8 -55 L 14 -50 L -4 -50 L 0 -55 Z`, '#57534e', INK, 1.4);
      line(ctx, [[-6, -40], [6, -40]], '#44403c', 2.0); // Miệng mím
      ctx.restore();
      return;
    }

    if (id === 'standing_stones') {
      // Cổng đá Trilithon (2 cột + 1 xà ngang)
      drawPoly(ctx, [[-45, 0], [-25, 0], [-27, -75], [-43, -75]], '#78716c', INK, 2.0);
      drawPoly(ctx, [[25, 0], [45, 0], [43, -75], [27, -75]], '#78716c', INK, 2.0);
      drawPoly(ctx, [[-52, -75], [52, -75], [50, -88], [-50, -88]], '#a8a29e', INK, 2.0);
      ctx.restore();
      return;
    }

    if (id === 'pyramid') {
      // Kim tự tháp: 8 bậc đá xếp từ đáy lên; `growth` = số bậc đã xây, đỉnh chóp vàng khi xây xong.
      const rows = 8, rowH = h / rows, built = Math.max(1, Math.round(rows * growth));
      for (let r = 0; r < built; r++) {
        const y0 = -r * rowH, y1 = -(r + 1) * rowH, half0 = w * 0.5 * (1 - r / rows), half1 = w * 0.5 * (1 - (r + 1) / rows);
        drawPoly(ctx, [[-half0, y0], [half0, y0], [half1, y1], [-half1, y1]], r % 2 ? '#e9c46a' : '#f2d27a', INK, 1.2);
        for (let bx = -half0 + 12 + (r % 2) * 6; bx < half0 - 6; bx += 14) line(ctx, [[bx, y0], [bx + (half1 - half0) * 0.1, y1]], '#c9a54a', 0.8);
      }
      if (built >= 2) drawPoly(ctx, [[-7, -rowH * 0.1], [7, -rowH * 0.1], [5, -rowH * 1.7], [-5, -rowH * 1.7]], '#5b3a1a', INK, 1.1);
      if (growth > 0.98) drawPoly(ctx, [[-w * 0.5 / rows, -h + rowH], [w * 0.5 / rows, -h + rowH], [0, -h]], '#facc15', INK, 1.2);
      ctx.restore();
      return;
    }

    if (id === 'igloo') {
      // Nhà băng: vòm nửa elip ghép khối băng, cửa hầm nhô ra phía trước.
      const R = w * 0.46, H = curH;
      path(ctx, `M ${-R} 0 A ${R} ${H} 0 0 1 ${R} 0 Z`, '#f1f5f9', INK, 2.0);
      for (let k = 1; k <= 3; k++) {
        const yy = -H * k / 4, half = R * Math.sqrt(1 - (k / 4) ** 2);
        line(ctx, [[-half, yy], [half, yy]], '#cbd5e1', 1.2);
        const yb = -H * (k - 1) / 4, halfB = R * Math.sqrt(1 - ((k - 1) / 4) ** 2);
        for (let j = -2; j <= 2; j++) { const xx = (j + (k % 2) * 0.5) * halfB * 0.34; if (Math.abs(xx) < half) line(ctx, [[xx, yb], [xx * 0.95, yy]], '#cbd5e1', 1); }
      }
      const tw = R * 0.42, th = H * 0.5;
      path(ctx, `M ${-tw} 0 L ${-tw} ${-th * 0.6} Q ${-tw} ${-th} 0 ${-th} Q ${tw} ${-th} ${tw} ${-th * 0.6} L ${tw} 0 Z`, '#e2e8f0', INK, 1.6);
      path(ctx, `M ${-tw * 0.55} 0 L ${-tw * 0.55} ${-th * 0.45} Q 0 ${-th * 0.8} ${tw * 0.55} ${-th * 0.45} L ${tw * 0.55} 0 Z`, '#1e3a5f', null);
      ctx.restore();
      return;
    }

    if (id === 'aqueduct') {
      // Cầu dẫn nước La Mã: tầng vòm lớn, tầng vòm nhỏ phía trên và máng nước; xây dần từ chân cột.
      const stone = '#e7dcc4', mortar = '#b8a98a', half = w * 0.5, spans = 3, sw = w / spans;
      const tier1 = h * 0.62, deck1 = h * 0.08, tier2 = h * 0.22, deck2 = h * 0.08;
      const drawTier = (y0, height, n, pier) => {
        const span = w / n;
        for (let i = 0; i < n; i++) {
          const x0 = -half + i * span, cx = x0 + span / 2, r = (span - pier) / 2, spring = y0 - height + r;
          path(ctx, `M ${x0} ${y0} L ${x0} ${y0 - height} L ${x0 + span} ${y0 - height} L ${x0 + span} ${y0} L ${cx + r} ${y0} L ${cx + r} ${spring} A ${r} ${r} 0 0 0 ${cx - r} ${spring} L ${cx - r} ${y0} Z`, stone, INK, 1.4);
          for (let k = -2; k <= 2; k++) { const aa = Math.PI / 2 + k * 0.45; line(ctx, [[cx + Math.cos(aa) * r, spring - Math.sin(aa) * r], [cx + Math.cos(aa) * (r + 6), spring - Math.sin(aa) * (r + 6)]], mortar, 1); }
        }
      };
      const target = h * growth;
      ctx.save();
      ctx.beginPath(); ctx.rect(-half - 4, -target - 2, w + 8, target + 6); ctx.clip();
      drawTier(0, tier1, spans, 14);
      drawPoly(ctx, [[-half - 3, -tier1], [half + 3, -tier1], [half + 3, -tier1 - deck1], [-half - 3, -tier1 - deck1]], '#d6c7a6', INK, 1.4);
      drawTier(-tier1 - deck1, tier2, spans * 2, 8);
      const topY = -tier1 - deck1 - tier2;
      drawPoly(ctx, [[-half - 3, topY], [half + 3, topY], [half + 3, topY - deck2], [-half - 3, topY - deck2]], '#d6c7a6', INK, 1.4);
      line(ctx, [[-half, topY - deck2 * 0.55], [half, topY - deck2 * 0.55]], '#38bdf8', 2);
      ctx.restore();
      ctx.restore();
      return;
    }

    if (id === 'castle') {
      // Lâu đài: tường thành răng cưa, cổng vòm có cầu treo (s.open 0–1 hạ cầu), hai tháp tròn mái nón và cờ.
      const stone = '#cbd5e1', dark = '#94a3b8', half = w * 0.5, tw = w * 0.2, wallH = curH * 0.62;
      const crenel = (x0, x1, y, size) => { for (let x = x0; x < x1 - size * 0.5; x += size * 2) drawPoly(ctx, [[x, y], [Math.min(x + size, x1), y], [Math.min(x + size, x1), y - size], [x, y - size]], stone, INK, 1.1); };
      drawPoly(ctx, [[-half + tw, 0], [half - tw, 0], [half - tw, -wallH], [-half + tw, -wallH]], stone, INK, 1.8);
      for (let y = -12; y > -wallH; y -= 12) line(ctx, [[-half + tw, y], [half - tw, y]], dark, 0.9);
      crenel(-half + tw, half - tw, -wallH, 7);
      const gw = w * 0.14, gh = wallH * 0.62;
      path(ctx, `M ${-gw} 0 L ${-gw} ${-gh + gw} A ${gw} ${gw} 0 0 1 ${gw} ${-gh + gw} L ${gw} 0 Z`, '#3f2a1a', INK, 1.4);
      for (let x = -gw + 5; x < gw; x += 6) line(ctx, [[x, -2], [x, -gh + gw * 0.4]], '#57534e', 1.2);
      const open = clamp(s.open || 0);
      if (open > 0.02) {
        // Cầu treo xoay quanh bản lề ở chân cổng: phần còn dựng che cổng thấp dần, mặt cầu hạ ra phía trước dài dần.
        const standing = gh * 0.92 * (1 - open), deck = gh * 0.5 * open;
        if (standing > 1) {
          drawPoly(ctx, [[-gw * 1.05, 0], [gw * 1.05, 0], [gw * 1.05, -standing], [-gw * 1.05, -standing]], '#92400e', INK, 1.4);
          for (let y = -8; y > -standing; y -= 8) line(ctx, [[-gw * 1.05, y], [gw * 1.05, y]], '#78350f', 0.9);
        }
        drawPoly(ctx, [[-gw, 0], [gw, 0], [gw * 1.12, deck], [-gw * 1.12, deck]], '#b45309', INK, 1.2);
        for (const side of [-1, 1]) line(ctx, [[side * gw, -gh * 0.95], [side * gw * 1.05, standing > 1 ? -standing : deck]], '#334155', 1.3);
      }
      if (growth > 0.45) for (const side of [-1, 1]) {
        const cx = side * (half - tw / 2), top = -curH;
        drawPoly(ctx, [[cx - tw / 2, 0], [cx + tw / 2, 0], [cx + tw / 2, top], [cx - tw / 2, top]], stone, INK, 1.8);
        for (let y = -12; y > top; y -= 12) line(ctx, [[cx - tw / 2, y], [cx + tw / 2, y]], dark, 0.9);
        crenel(cx - tw / 2, cx + tw / 2, top, 6);
        for (const y of [top * 0.35, top * 0.65]) path(ctx, `M ${cx - 2} ${y + 6} L ${cx - 2} ${y - 4} Q ${cx} ${y - 7} ${cx + 2} ${y - 4} L ${cx + 2} ${y + 6} Z`, '#1e293b', null);
        if (growth > 0.9) {
          drawPoly(ctx, [[cx - tw / 2 - 3, top - 6], [cx + tw / 2 + 3, top - 6], [cx, top - 6 - tw * 1.1]], side < 0 ? '#1d4ed8' : '#b91c1c', INK, 1.5);
          if (side > 0) { const fy = top - 6 - tw * 1.1; line(ctx, [[cx, fy], [cx, fy - 14]], '#475569', 1.4); const wv = Math.sin(t * 5) * 2; path(ctx, `M ${cx} ${fy - 14} Q ${cx + 6} ${fy - 16 + wv} ${cx + 12} ${fy - 13} L ${cx + 12} ${fy - 8} Q ${cx + 6} ${fy - 10 + wv} ${cx} ${fy - 8} Z`, '#facc15', INK, 0.9); }
        }
      }
      ctx.restore();
      return;
    }

    if (id === 'temple_classic') {
      // 4 cột tròn Hy Lạp
      drawPoly(ctx, [[wallL, -curH * 0.1], [wallR, -curH * 0.1], [wallR, -curH * 0.7], [wallL, -curH * 0.7]], '#f8fafc', null);
      for (let cx = -48; cx <= 48; cx += 32) {
        drawPoly(ctx, [[cx - 6, 0], [cx + 6, 0], [cx + 5, -curH * 0.7], [cx - 5, -curH * 0.7]], '#f1f5f9', INK, 1.4);
      }
      // Trán đền hình tam giác (Pediment)
      drawPoly(ctx, [[-w * 0.5, -curH * 0.7], [w * 0.5, -curH * 0.7], [0, -curH]], '#e2e8f0', INK, 2.0);
      ctx.restore();
      return;
    }

    // Tường nhà thông thường
    const wallStyle = spec.locale_walls?.[s.locale || 'neutral'] || spec.walls;
    let wallColor = '#fef08a';
    if (wallStyle === 'brick') wallColor = '#f87171';
    else if (wallStyle === 'stone') wallColor = '#cbd5e1';
    else if (wallStyle === 'hanok') wallColor = '#fef3c7';
    else if (wallStyle === 'jp_wood') wallColor = '#d97706';
    else if (wallStyle === 'timber_frame') wallColor = '#fef08a';

    drawPoly(ctx, [[wallL, -4], [wallR, -4], [wallR, wallTop], [wallL, wallTop]], wallColor, INK, 2.0);

    // Hoạ tiết khung gỗ nếu timber_frame (Đức)
    if (wallStyle === 'timber_frame') {
      line(ctx, [[wallL + 15, -4], [wallL + 15, wallTop]], '#78350f', 2.0);
      line(ctx, [[wallR - 15, -4], [wallR - 15, wallTop]], '#78350f', 2.0);
      line(ctx, [[wallL + 15, -4], [0, wallTop]], '#78350f', 1.8);
      line(ctx, [[wallR - 15, -4], [0, wallTop]], '#78350f', 1.8);
    } else if (wallStyle === 'brick') {
      // Vạch gạch ngang
      for (let by = -15; by >= wallTop; by -= 12) {
        line(ctx, [[wallL, by], [wallR, by]], '#ef4444', 1.0);
      }
    }

    // 3. MÁI NHÀ (ROOF)
    if (growth > 0.5) {
      if (spec.roof === 'gable') {
        // Mái ngói tam giác dốc
        const roofColor = (wallStyle === 'hanok' || wallStyle === 'jp_wood') ? '#334155' : '#dc2626';
        drawPoly(ctx, [[wallL - 10, wallTop], [wallR + 10, wallTop], [0, -curH]], roofColor, INK, 2.2);
      } else if (spec.roof === 'towers') {
        // Lâu đài 2 tháp có lỗ châu mai
        drawPoly(ctx, [[wallL - 10, 0], [wallL + 12, 0], [wallL + 12, -curH], [wallL - 10, -curH]], '#94a3b8', INK, 1.8);
        drawPoly(ctx, [[wallR - 12, 0], [wallR + 10, 0], [wallR + 10, -curH], [wallR - 12, -curH]], '#94a3b8', INK, 1.8);
        // Tường thành giữa
        line(ctx, [[wallL + 12, wallTop], [wallR - 12, wallTop]], '#64748b', 2.5);
      } else if (spec.roof === 'cone') {
        // Mái nón cối xay gió
        drawPoly(ctx, [[wallL - 6, wallTop], [wallR + 6, wallTop], [0, -curH]], '#b91c1c', INK, 2.0);
      } else if (spec.roof === 'dome') {
        // Hải đăng: ban công + phòng đèn kính nối thân tháp với mái vòm (trước đây mái lơ lửng trên thân).
        drawPoly(ctx, [[wallL - 6, wallTop], [wallR + 6, wallTop], [wallR + 6, wallTop - 5], [wallL - 6, wallTop - 5]], '#334155', INK, 1.4);
        drawPoly(ctx, [[-16, wallTop - 5], [16, wallTop - 5], [16, -curH + 14], [-16, -curH + 14]], '#fef9c3', INK, 1.6);
        for (const x of [-8, 0, 8]) line(ctx, [[x, wallTop - 5], [x, -curH + 14]], '#475569', 1);
        path(ctx, `M -19 ${-curH + 14} Q -18 ${-curH - 4} 0 ${-curH - 4} Q 18 ${-curH - 4} 19 ${-curH + 14} Z`, '#0284c7', INK, 1.8);
      } else if (spec.roof === 'thatch') {
        // Mái rơm rạ
        drawPoly(ctx, [[wallL - 8, wallTop], [wallR + 8, wallTop], [0, -curH]], '#ca8a04', INK, 2.0);
      }
    }

    // Cánh quạt cối xay gió (xoay theo t)
    if (spec.sails) {
      ctx.save();
      ctx.translate(0, wallTop + 10);
      ctx.rotate(t * 1.5);
      for (let s = 0; s < 4; s++) {
        ctx.rotate(Math.PI / 2);
        line(ctx, [[0, 0], [45, 0]], '#78350f', 3.0);
        drawPoly(ctx, [[10, 2], [45, 2], [42, 12], [10, 12]], '#f8fafc', INK, 1.0);
      }
      ctx.restore();
    }

    // Đèn hải đăng quét sáng theo t
    if (spec.lantern) {
      const beamAngle = t * 2.0;
      ctx.save();
      ctx.translate(0, (wallTop - 5 + (-curH + 14)) / 2);  // giữa phòng đèn
      ctx.rotate(beamAngle);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.4)';
      path(ctx, `M 0 0 L 120 -35 L 120 35 Z`, 'rgba(254, 240, 138, 0.4)', null);
      ctx.restore();
    }

    // Mái che cửa tiệm (awning)
    if (spec.awning) {
      const ay = wallTop + 35;
      drawPoly(ctx, [[wallL - 6, ay], [wallR + 6, ay], [wallR, ay + 14], [wallL, ay + 14]], '#ef4444', INK, 1.4);
      for (let ax = wallL; ax <= wallR; ax += 18) {
        drawPoly(ctx, [[ax, ay], [ax + 9, ay], [ax + 9, ay + 14], [ax, ay + 14]], '#ffffff', null);
      }
    }

    // 4. CỬA RA VÀO & CỬA SỔ
    if (spec.door) {
      const [dx, dy] = spec.door;
      drawPoly(ctx, [[dx - 8, -4], [dx + 8, -4], [dx + 8, dy], [dx - 8, dy]], '#78350f', INK, 1.4);
    }

    if (spec.windows) {
      for (const [wx, wy] of spec.windows) {
        if (wy >= wallTop + 6) {
          drawPoly(ctx, [[wx - 6, wy + 6], [wx + 6, wy + 6], [wx + 6, wy - 6], [wx - 6, wy - 6]], '#7dd3fc', INK, 1.2);
          line(ctx, [[wx, wy - 6], [wx, wy + 6]], '#0284c7', 1.0);
        }
      }
    }

    // Ống khói
    if (spec.chimney && growth > 0.8) {
      drawPoly(ctx, [[20, wallTop - 5], [30, wallTop - 5], [30, -curH + 8], [20, -curH + 8]], '#b91c1c', INK, 1.4);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  const buildingRigs = {};
  for (const [id, spec] of Object.entries(BUILDING_SPECS)) {
    const anchors = {
      root: [0, 0],
      top: [0, -spec.height],
      surface: [0, -spec.height * 0.5],
      roof_top: [0, -spec.height]
    };
    if (spec.door) anchors.door = spec.door;
    if (spec.windows) {
      spec.windows.forEach((pos, idx) => {
        anchors[`window_${idx + 1}`] = pos;
      });
    }

    buildingRigs[id] = {
      group: 'building',
      spec,
      anchors,
      draw(ctx, s, t, cat, kit) {
        drawBuilding(ctx, s, t, spec, cat, kit);
      }
    };
  }

  RemakeVector.kit.BUILDING_SPECS = BUILDING_SPECS;
  RemakeVector.kit.drawBuilding = drawBuilding;

  RemakeVector.register({
    rigs: buildingRigs
  });

})();
