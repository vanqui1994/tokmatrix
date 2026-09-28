// remake_vector_packs/furniture.js — Giai đoạn J: Họ vật thể Đồ nội thất (drawFurniture)
// Cung cấp 9 đồ nội thất: desk, chair, table, low_table, kotatsu, bed, shelf, bookcase, workbench.
// Hỗ trợ anchor "under" (chui gầm bàn tránh động đất / take_cover) và "seat" (ngồi ghế).

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
  // CẤU HÌNH ĐỒ NỘI THẤT (FURNITURE SPECS)
  // -------------------------------------------------------------
  const FURNITURE_SPECS = {
    desk: {
      label: 'Bàn học/bàn làm việc',
      width: 75, height: 55,
      color: '#d97706',
      under: [0, -18],
      topics: ['school', 'safety']
    },
    chair: {
      label: 'Ghế ngồi tựa',
      width: 38, height: 60,
      color: '#b45309',
      seat: [0, -26],
      topics: ['school', 'jobs']
    },
    table: {
      label: 'Bàn ăn lớn',
      width: 90, height: 55,
      color: '#92400e',
      under: [0, -20],
      topics: ['home', 'safety']
    },
    low_table: {
      label: 'Bàn thấp ngồi bệt',
      width: 70, height: 32,
      color: '#a16207',
      under: [0, -10],
      topics: ['kr_culture', 'jp_culture']
    },
    kotatsu: {
      label: 'Bàn sưởi Kotatsu',
      width: 80, height: 38,
      color: '#b91c1c',
      under: [0, -12],
      topics: ['jp_culture', 'home']
    },
    bed: {
      label: 'Giường ngủ',
      width: 95, height: 45,
      color: '#38bdf8',
      seat: [0, -24],
      topics: ['home', 'safety']
    },
    shelf: {
      label: 'Kệ gỗ để đồ',
      width: 65, height: 90,
      color: '#78350f',
      topics: ['home', 'jobs']
    },
    bookcase: {
      label: 'Tủ sách nhiều tầng',
      width: 70, height: 105,
      color: '#451a03',
      topics: ['school', 'inventions']
    },
    workbench: {
      label: 'Bàn thợ thủ công',
      width: 85, height: 60,
      color: '#57534e',
      under: [0, -20],
      topics: ['inventions', 'jobs']
    }
  };

  // -------------------------------------------------------------
  // HÀM VẼ CHÍNH: drawFurniture()
  // -------------------------------------------------------------
  function drawFurniture(ctx, s, t, spec, cat, kit) {
    const baseCol = (s.style && s.style.body) || spec.color || '#92400e';
    const id = s.asset;

    ctx.save();

    if (id === 'desk' || id === 'table' || id === 'workbench') {
      // Bàn bốn chân, mặt bàn dày, gầm trống
      const w = spec.width;
      const h = spec.height;
      // 4 chân bàn
      line(ctx, [[-w * 0.44, 0], [-w * 0.44, -h + 8]], '#451a03', 4.5);
      line(ctx, [[w * 0.44, 0], [w * 0.44, -h + 8]], '#451a03', 4.5);
      line(ctx, [[-w * 0.35, -2], [-w * 0.35, -h + 8]], '#78350f', 3.5);
      line(ctx, [[w * 0.35, -2], [w * 0.35, -h + 8]], '#78350f', 3.5);
      // Mặt bàn phẳng dày
      drawPoly(ctx, [[-w * 0.5, -h + 8], [w * 0.5, -h + 8], [w * 0.5, -h], [-w * 0.5, -h]], baseCol, INK, 2.0);

      if (id === 'desk') {
        // Hộc ngăn kéo
        drawPoly(ctx, [[w * 0.15, -h + 8], [w * 0.44, -h + 8], [w * 0.44, -h + 24], [w * 0.15, -h + 24]], tone(baseCol, -0.15), INK, 1.4);
        ellipse(ctx, w * 0.3, -h + 16, 2.5, 2.5, '#facc15', null); // Tay nắm
      } else if (id === 'workbench') {
        // Ê-tô kim loại gắn mép trái
        drawPoly(ctx, [[-w * 0.48, -h], [-w * 0.38, -h], [-w * 0.38, -h - 12], [-w * 0.48, -h - 12]], '#64748b', INK, 1.4);
      }

    } else if (id === 'chair') {
      // Ghế tựa học sinh
      const w = spec.width;
      // 4 chân ghế
      line(ctx, [[-w * 0.4, 0], [-w * 0.4, -26]], '#451a03', 3.5);
      line(ctx, [[w * 0.4, 0], [w * 0.4, -26]], '#451a03', 3.5);
      // Mặt ghế ngồi
      drawPoly(ctx, [[-w * 0.45, -26], [w * 0.45, -26], [w * 0.45, -30], [-w * 0.45, -30]], baseCol, INK, 1.6);
      // Lưng tựa
      line(ctx, [[-w * 0.38, -30], [-w * 0.38, -58]], '#451a03', 3.5);
      line(ctx, [[w * 0.38, -30], [w * 0.38, -58]], '#451a03', 3.5);
      drawPoly(ctx, [[-w * 0.42, -50], [w * 0.42, -50], [w * 0.42, -58], [-w * 0.42, -58]], baseCol, INK, 1.4);

    } else if (id === 'low_table') {
      // Bàn thấp ngồi bệt kiểu Hàn / Nhật
      const w = spec.width;
      line(ctx, [[-w * 0.42, 0], [-w * 0.42, -26]], '#78350f', 4.0);
      line(ctx, [[w * 0.42, 0], [w * 0.42, -26]], '#78350f', 4.0);
      drawPoly(ctx, [[-w * 0.5, -26], [w * 0.5, -26], [w * 0.5, -32], [-w * 0.5, -32]], baseCol, INK, 1.8);

    } else if (id === 'kotatsu') {
      // Bàn sưởi Kotatsu Nhật Bản có chăn phủ
      const w = spec.width;
      // Chăn bông đỏ cam phủ bốn phía
      path(ctx, `M ${-w * 0.48} 0 Q ${-w * 0.52} -28 ${-w * 0.38} -30 L ${w * 0.38} -30 Q ${w * 0.52} -28 ${w * 0.48} 0 Z`, baseCol, INK, 2.0);
      for (const k of [-0.2, 0, 0.2]) path(ctx, `M ${w * k} -29 Q ${w * (k + 0.03)} -14 ${w * k} 0`, null, tone(baseCol, -0.25), 1.2);  // nếp chăn
      // Mặt bàn gỗ bóng trên nóc chăn
      drawPoly(ctx, [[-w * 0.42, -30], [w * 0.42, -30], [w * 0.42, -37], [-w * 0.42, -37]], '#d97706', INK, 1.8);

    } else if (id === 'bed') {
      // Giường ngủ có đệm & gối
      const w = spec.width;
      // Khung gỗ chân giường
      drawPoly(ctx, [[-w * 0.48, 0], [w * 0.48, 0], [w * 0.48, -12], [-w * 0.48, -12]], '#78350f', INK, 1.8);
      // Đầu giường cao
      drawPoly(ctx, [[-w * 0.5, 0], [-w * 0.42, 0], [-w * 0.42, -44], [-w * 0.5, -44]], '#451a03', INK, 1.8);
      // Đệm và chăn màu xanh
      drawPoly(ctx, [[-w * 0.42, -12], [w * 0.48, -12], [w * 0.48, -26], [-w * 0.42, -26]], baseCol, INK, 1.6);
      // Gối trắng
      ellipse(ctx, -w * 0.28, -28, 12, 6, '#f8fafc', INK, 1.2);

    } else if (id === 'shelf' || id === 'bookcase') {
      // Tủ kệ gỗ nhiều tầng
      const w = spec.width;
      const h = spec.height;
      drawPoly(ctx, [[-w * 0.48, 0], [w * 0.48, 0], [w * 0.48, -h], [-w * 0.48, -h]], baseCol, INK, 2.2);

      // Các đợt kệ ngang
      const numShelves = id === 'bookcase' ? 4 : 3;
      for (let si = 1; si < numShelves; si++) {
        const sy = -h * (si / numShelves);
        line(ctx, [[-w * 0.46, sy], [w * 0.46, sy]], tone(baseCol, -0.25), 2.5);

        if (id === 'bookcase') {
          // Gáy sách nhiều màu sắc xếp ngay ngắn trên kệ
          const bookColors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7'];
          for (let bi = 0; bi < 6; bi++) {
            const bx = -w * 0.42 + bi * 8;
            const bh = 14 + (bi % 3) * 3;
            drawPoly(ctx, [[bx, sy], [bx + 6, sy], [bx + 6, sy - bh], [bx, sy - bh]], bookColors[bi % bookColors.length], null);
          }
        }
      }
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  const furnitureRigs = {};
  for (const [id, spec] of Object.entries(FURNITURE_SPECS)) {
    const anchors = {
      root: [0, 0],
      top: [0, -spec.height],
      surface: [0, -spec.height * 0.5],
      grip: [spec.width * 0.4, -spec.height * 0.5]
    };
    if (spec.under) anchors.under = spec.under;
    if (spec.seat) anchors.seat = spec.seat;

    furnitureRigs[id] = {
      group: 'furniture',
      spec,
      anchors,
      draw(ctx, s, t, cat, kit) {
        drawFurniture(ctx, s, t, spec, cat, kit);
      }
    };
  }

  RemakeVector.kit.FURNITURE_SPECS = FURNITURE_SPECS;
  RemakeVector.kit.drawFurniture = drawFurniture;

  RemakeVector.register({
    rigs: furnitureRigs
  });

})();
