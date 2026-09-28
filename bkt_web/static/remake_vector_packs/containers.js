// remake_vector_packs/containers.js — Giai đoạn J: Họ vật thể Đồ chứa (drawContainer)
// Hỗ trợ nắp mở (open 0->1), mức đầy (fill 0->1), màu thùng rác phân loại theo locale (de, us, kr, jp).
// Bao gồm 11 đồ chứa: 5 thùng rác phân loại + onggi_jar, barrel, treasure_chest, amphora, lunchbox, emergency_backpack.

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
  // CẤU HÌNH ĐỒ CHỨA (CONTAINER SPECS)
  // -------------------------------------------------------------
  const CONTAINER_SPECS = {
    bin_paper: {
      label: 'Thùng rác giấy',
      width: 44, height: 65,
      type: 'bin',
      symbol: 'paper',
      color: '#2563eb', // Mặc định xanh dương
      locale_colors: { de: '#2563eb', us: '#3b82f6', jp: '#2563eb', kr: '#facc15' },
      topics: ['recycling', 'school']
    },
    bin_plastic: {
      label: 'Thùng rác nhựa/lon',
      width: 44, height: 65,
      type: 'bin',
      symbol: 'bottle',
      color: '#eab308', // Mặc định vàng
      locale_colors: { de: '#eab308', us: '#3b82f6', jp: '#eab308', kr: '#e2e8f0' },
      topics: ['recycling', 'school']
    },
    bin_glass: {
      label: 'Thùng rác thuỷ tinh',
      width: 44, height: 65,
      type: 'bin',
      symbol: 'bottle',
      color: '#16a34a', // Mặc định xanh lá
      locale_colors: { de: '#16a34a', us: '#3b82f6', jp: '#16a34a', kr: '#f97316' },
      topics: ['recycling', 'school']
    },
    bin_bio: {
      label: 'Thùng rác hữu cơ',
      width: 44, height: 65,
      type: 'bin',
      symbol: 'apple_core',
      color: '#78350f', // Mặc định nâu
      locale_colors: { de: '#78350f', us: '#22c55e', jp: '#854d0e', kr: '#22c55e' },
      topics: ['recycling', 'farm']
    },
    bin_residual: {
      label: 'Thùng rác vô cơ còn lại',
      width: 44, height: 65,
      type: 'bin',
      symbol: 'waste',
      color: '#1e293b', // Mặc định xám đen
      locale_colors: { de: '#1e293b', us: '#0f172a', jp: '#dc2626', kr: '#f8fafc' },
      topics: ['recycling', 'home']
    },
    onggi_jar: {
      label: 'Chum vại Onggi',
      width: 50, height: 60,
      type: 'jar',
      color: '#44403c',
      topics: ['kr_culture', 'food']
    },
    barrel: {
      label: 'Thùng gỗ tròn',
      width: 46, height: 60,
      type: 'barrel',
      color: '#78350f',
      topics: ['ancient', 'medieval']
    },
    treasure_chest: {
      label: 'Rương kho báu',
      width: 58, height: 48,
      type: 'chest',
      color: '#92400e',
      topics: ['mysteries', 'ocean']
    },
    amphora: {
      label: 'Bình hai quai cổ Amphora',
      width: 42, height: 70,
      type: 'vase',
      color: '#d97706',
      topics: ['ancient', 'history']
    },
    lunchbox: {
      label: 'Hộp cơm trưa',
      width: 48, height: 28,
      type: 'box',
      color: '#0284c7',
      topics: ['school', 'jobs']
    },
    emergency_backpack: {
      label: 'Balo khẩn cấp thiên tai',
      width: 44, height: 58,
      type: 'bag',
      color: '#ea580c',
      topics: ['safety', 'disaster']
    }
  };

  // -------------------------------------------------------------
  // HÀM VẼ CHÍNH: drawContainer()
  // -------------------------------------------------------------
  function drawContainer(ctx, s, t, spec, cat, kit) {
    const open = clamp(s.open || 0);
    const fill = clamp(s.fill !== undefined ? s.fill : 0);
    const locale = s.locale || 'neutral';
    const baseCol = (s.style && s.style.body) || (spec.locale_colors && spec.locale_colors[locale]) || spec.color || '#334155';
    const id = s.asset;

    ctx.save();

    if (spec.type === 'bin') {
      // 1. THÙNG RÁC PHÂN LOẠI CÔNG CỘNG CÓ BÁNH XE
      // Bánh xe nhỏ đáy
      ellipse(ctx, -14, 2, 4, 4, '#0f172a', INK, 1.2);
      ellipse(ctx, 14, 2, 4, 4, '#0f172a', INK, 1.2);

      // Thân thùng rác vát đáy
      drawPoly(ctx, [[-16, 0], [16, 0], [20, -52], [-20, -52]], baseCol, INK, 2.0);

      // Mức đầy rác bên trong nếu mở nắp
      if (open > 0.3 && fill > 0) {
        const fillH = -50 * fill;
        drawPoly(ctx, [[-17, -4], [17, -4], [17, fillH], [-17, fillH]], '#94a3b8', null);
      }

      // Biểu tượng phân loại rác (PICTOGRAMS) trên mặt thùng
      if (spec.symbol && RemakeVector.kit.PICTOGRAMS) {
        RemakeVector.kit.PICTOGRAMS.recycling(ctx, 0, -28, 18, spec.symbol);
      }

      // Nắp thùng lật mở theo open (quay quanh bản lề góc trái)
      const lidAngle = -open * 1.6;
      ctx.save();
      ctx.translate(-21, -52);
      ctx.rotate(lidAngle);
      drawPoly(ctx, [[0, 0], [42, 0], [40, -8], [0, -8]], tone(baseCol, -0.15), INK, 1.6);
      // Tay cầm nắp
      line(ctx, [[15, -8], [27, -8]], '#f8fafc', 2.0);
      ctx.restore();

    } else if (id === 'onggi_jar') {
      // 2. CHUM SÀNH GỐM HÀN QUỐC
      ellipse(ctx, 0, -28, 22, 28, baseCol, INK, 2.2);
      // Miệng vò
      ellipse(ctx, 0, -56, 14, 5, tone(baseCol, -0.2), INK, 1.6);
      // Nắp chum (nhấc lên khi open)
      const lidY = -56 - open * 18;
      ellipse(ctx, 0, lidY, 16, 6, tone(baseCol, 0.1), INK, 1.6);
      ellipse(ctx, 0, lidY - 4, 4, 3, tone(baseCol, -0.3), INK, 1.2);

    } else if (id === 'barrel') {
      // 3. THÙNG PHUY GỖ
      taper(ctx, 0, -56, 0, 0, 18, 20, baseCol, INK, 2.0);
      // Đai kim loại bọc trên dưới
      line(ctx, [[-21, -44], [21, -44]], '#475569', 3.0);
      line(ctx, [[-21, -12], [21, -12]], '#475569', 3.0);

    } else if (id === 'treasure_chest') {
      // 4. RƯƠNG KHO BÁU
      // Thùng gỗ đáy
      drawPoly(ctx, [[-26, 0], [26, 0], [26, -26], [-26, -26]], baseCol, INK, 2.0);
      // Đai vàng đồng bo viền
      line(ctx, [[-26, -13], [26, -13]], '#eab308', 2.0);
      // Khoá đồng
      drawPoly(ctx, [[-4, -20], [4, -20], [3, -28], [-3, -28]], '#facc15', INK, 1.2);

      // Nắp rương hình bán nguyệt lật mở
      const lidRot = -open * 1.8;
      ctx.save();
      ctx.translate(-26, -26);
      ctx.rotate(lidRot);
      path(ctx, `M 0 0 L 52 0 Q 52 -18 26 -18 Q 0 -18 0 0 Z`, tone(baseCol, 0.15), INK, 2.0);
      ctx.restore();

      // Vàng bạc lấp lánh bên trong nếu mở
      if (open > 0.4) {
        ellipse(ctx, 0, -24, 18, 6, '#fef08a', null);
      }

    } else if (id === 'amphora') {
      // 5. BÌNH GỐM CỔ ĐẠI HAI QUAI
      path(ctx, `M -6 0 L 6 0 Q 18 -24 16 -45 Q 12 -65 6 -68 L -6 -68 Q -12 -65 -16 -45 Q -18 -24 -6 0 Z`, baseCol, INK, 2.0);
      ellipse(ctx, 0, -68, 7, 3, tone(baseCol, -0.2), INK, 1.2);
      // 2 quai bình cong
      path(ctx, `M -14 -42 Q -24 -55 -7 -62`, null, baseCol, 3.5);
      path(ctx, `M 14 -42 Q 24 -55 7 -62`, null, baseCol, 3.5);

    } else if (id === 'lunchbox') {
      // 6. HỘP CƠM
      drawPoly(ctx, [[-22, 0], [22, 0], [22, -18], [-22, -18]], baseCol, INK, 1.8);
      const lidY = -18 - open * 14;
      drawPoly(ctx, [[-24, lidY], [24, lidY], [22, lidY - 6], [-22, lidY - 6]], tone(baseCol, 0.2), INK, 1.6);

    } else if (id === 'emergency_backpack') {
      // 7. BALO CỨU HỘ KHẨN CẤP
      path(ctx, `M -18 0 L 18 0 Q 22 -48 0 -54 Q -22 -48 -18 0 Z`, baseCol, INK, 2.0);
      // Dải phản quang màu vàng chanh
      line(ctx, [[-16, -20], [16, -20]], '#facc15', 3.5);
      line(ctx, [[-14, -36], [14, -36]], '#facc15', 3.5);
      // Dấu cộng trắng cứu hộ
      RemakeVector.kit.PICTOGRAMS.first_aid(ctx, 0, -28, 14, 'cross');
      // Quai xách đỉnh
      path(ctx, `M -6 -52 Q 0 -60 6 -52`, null, '#1e293b', 2.0);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  const containerRigs = {};
  for (const [id, spec] of Object.entries(CONTAINER_SPECS)) {
    containerRigs[id] = {
      group: 'container',
      spec,
      anchors: {
        root: [0, 0],
        top: [0, -spec.height],
        surface: [0, -spec.height * 0.5],
        opening: [0, -spec.height * 0.9],
        lid: [0, -spec.height],
        grip: [spec.width * 0.35, -spec.height * 0.5]
      },
      draw(ctx, s, t, cat, kit) {
        drawContainer(ctx, s, t, spec, cat, kit);
      }
    };
  }

  RemakeVector.kit.CONTAINER_SPECS = CONTAINER_SPECS;
  RemakeVector.kit.drawContainer = drawContainer;

  RemakeVector.register({
    rigs: containerRigs
  });

})();
