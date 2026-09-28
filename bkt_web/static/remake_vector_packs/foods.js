// remake_vector_packs/foods.js — Giai đoạn J: Họ vật thể Món ăn (drawFood)
// Hỗ trợ hơi nóng bốc lên (steam), cắt lát (slice), chín dần (cooked 0->1), mặt chibi tuỳ chọn (face_scale).
// Bao gồm 21 món ăn truyền thống và hiện đại của de, us, jp, kr.

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
  // CẤU HÌNH MÓN ĂN (FOOD SPECS)
  // -------------------------------------------------------------
  const FOOD_SPECS = {
    bread_loaf: { label: 'Ổ bánh mì', width: 60, height: 35, hot: false, topics: ['food', 'de_culture'] },
    pretzel: { label: 'Bánh xoắn Brezel', width: 50, height: 42, hot: false, topics: ['de_culture', 'festivals'] },
    pancake_stack: { label: 'Chồng bánh kếp si-rô', width: 55, height: 45, hot: true, topics: ['food', 'us_culture'] },
    apple_pie: { label: 'Bánh pie táo', width: 60, height: 35, hot: true, topics: ['us_culture', 'festivals'] },
    roast_turkey: { label: 'Gà tây nướng nguyên con', width: 75, height: 50, hot: true, topics: ['us_culture', 'festivals'] },
    gingerbread: { label: 'Bánh quy gừng hình người', width: 45, height: 55, hot: false, topics: ['de_culture', 'festivals'] },
    easter_egg: { label: 'Trứng phục sinh hoa văn', width: 38, height: 48, hot: false, topics: ['de_culture', 'festivals'] },
    christmas_cookie: { label: 'Bánh quy quế ngôi sao', width: 42, height: 42, hot: false, topics: ['de_culture', 'festivals'] },
    hamburger: { label: 'Bánh kẹp Hamburger', width: 52, height: 46, hot: false, topics: ['food', 'us_culture'] },
    onigiri: { label: 'Cơm nắm tam giác rong biển', width: 46, height: 44, hot: false, topics: ['jp_culture', 'food'] },
    bento_box: { label: 'Hộp cơm bento', width: 70, height: 48, hot: false, topics: ['jp_culture', 'school'] },
    sushi: { label: 'Sushi cá hồi', width: 48, height: 30, hot: false, topics: ['jp_culture', 'food'] },
    ramen_bowl: { label: 'Tô mì Ramen', width: 65, height: 50, hot: true, topics: ['jp_culture', 'food'] },
    mochi: { label: 'Bánh dày Mochi', width: 44, height: 32, hot: false, topics: ['jp_culture', 'festivals'] },
    dango: { label: 'Xiên bánh Dango 3 màu', width: 28, height: 60, hot: false, topics: ['jp_culture', 'festivals'] },
    kimchi: { label: 'Đĩa Kimchi cay', width: 54, height: 32, hot: false, topics: ['kr_culture', 'food'] },
    songpyeon: { label: 'Bánh gạo Songpyeon', width: 48, height: 30, hot: false, topics: ['kr_culture', 'festivals'] },
    tteokguk: { label: 'Canh bánh gạo Tteokguk', width: 62, height: 45, hot: true, topics: ['kr_culture', 'festivals'] },
    bibimbap: { label: 'Cơm trộn Bibimbap', width: 65, height: 50, hot: true, topics: ['kr_culture', 'food'] },
    rice_bowl: { label: 'Bát cơm trắng', width: 50, height: 40, hot: true, topics: ['food', 'kr_culture'] },
    soup_pot: { label: 'Nồi súp nóng', width: 70, height: 55, hot: true, topics: ['food', 'jobs'] }
  };

  // -------------------------------------------------------------
  // HÀM VẼ CHÍNH: drawFood()
  // -------------------------------------------------------------
  function drawFood(ctx, s, t, spec, cat, kit) {
    const cooked = clamp(s.cooked !== undefined ? s.cooked : 1.0);
    const slice = clamp(s.slice || 0);
    const id = s.asset;

    ctx.save();

    // 1. VẼ MÓN ĂN THEO ID
    if (id === 'bread_loaf') {
      // Ổ bánh mì vàng nâu
      path(ctx, `M -25 -4 Q -28 -28 0 -30 Q 28 -28 25 -4 Z`, '#d97706', INK, 1.8);
      // Khía khía
      line(ctx, [[-12, -26], [-6, -10]], '#92400e', 2.0);
      line(ctx, [[6, -26], [12, -10]], '#92400e', 2.0);
    } else if (id === 'pretzel') {
      // Bánh xoắn Brezel
      path(ctx, `M -18 -18 Q -24 -36 0 -36 Q 24 -36 18 -18 Q 12 0 0 -22 Q -12 0 -18 -18`, null, '#b45309', 5.5);
      // Hạt muối trắng li ti
      ellipse(ctx, -8, -32, 1.2, 1.2, '#ffffff', null);
      ellipse(ctx, 8, -32, 1.2, 1.2, '#ffffff', null);
      ellipse(ctx, 0, -22, 1.2, 1.2, '#ffffff', null);
    } else if (id === 'pancake_stack') {
      // 3 lớp bánh kếp
      for (let i = 0; i < 3; i++) {
        const py = -8 - i * 9;
        ellipse(ctx, 0, py, 24, 7, '#f59e0b', INK, 1.4);
      }
      // Khối bơ vàng trên đỉnh
      drawPoly(ctx, [[-5, -28], [5, -28], [5, -34], [-5, -34]], '#fde047', INK, 1.0);
    } else if (id === 'apple_pie') {
      // Khay bánh pie
      drawPoly(ctx, [[-26, -4], [26, -4], [22, -24], [-22, -24]], '#b45309', INK, 1.6);
      ellipse(ctx, 0, -24, 23, 8, '#d97706', INK, 1.4);
      // Đan lưới mặt bánh
      line(ctx, [[-12, -26], [12, -22]], '#78350f', 1.6);
      line(ctx, [[-12, -22], [12, -26]], '#78350f', 1.6);
    } else if (id === 'roast_turkey') {
      // Đĩa oval
      ellipse(ctx, 0, -2, 34, 10, '#f8fafc', INK, 1.4);
      // Thân gà tây tròn nâu bóng
      ellipse(ctx, 0, -18, 22, 14, '#b45309', INK, 1.8);
      // Đùi gà
      ellipse(ctx, 16, -14, 8, 6, '#92400e', INK, 1.4);
      line(ctx, [[22, -14], [28, -12]], '#f8fafc', 3.0); // Mẩu xương
    } else if (id === 'gingerbread') {
      // Người bánh gừng
      ellipse(ctx, 0, -42, 9, 9, '#b45309', INK, 1.6); // Đầu
      ellipse(ctx, 0, -24, 11, 14, '#b45309', INK, 1.6); // Thân
      // Tay & chân
      line(ctx, [[-8, -30], [-18, -24]], '#b45309', 4.5);
      line(ctx, [[8, -30], [18, -24]], '#b45309', 4.5);
      line(ctx, [[-6, -14], [-10, -2]], '#b45309', 4.5);
      line(ctx, [[6, -14], [10, -2]], '#b45309', 4.5);
      // Nơ kem trắng
      ellipse(ctx, 0, -34, 2, 2, '#ffffff', null);
      ellipse(ctx, 0, -26, 2, 2, '#ffffff', null);
    } else if (id === 'easter_egg') {
      // Quả trứng vẽ hoa văn phục sinh
      path(ctx, `M -16 -16 Q -18 -42 0 -44 Q 18 -42 16 -16 Q 14 0 0 0 Q -14 0 -16 -16 Z`, '#38bdf8', INK, 1.8);
      // Sọc lượn sóng vàng & hồng
      path(ctx, `M -15 -24 Q -7 -28 0 -24 Q 7 -20 15 -24`, null, '#facc15', 2.5);
      path(ctx, `M -14 -12 Q -7 -16 0 -12 Q 7 -8 14 -12`, null, '#f472b6', 2.5);
    } else if (id === 'christmas_cookie') {
      // Bánh quy ngôi sao
      ctx.save();
      ctx.translate(0, -20);
      path(ctx, `M 0 -18 L 5 -5 L 18 -5 L 8 4 L 12 16 L 0 8 L -12 16 L -8 4 L -18 -5 L -5 -5 Z`, '#f59e0b', INK, 1.8);
      ctx.restore();
    } else if (id === 'hamburger') {
      // Bánh mì burger
      ellipse(ctx, 0, -6, 22, 6, '#d97706', INK, 1.4); // Đế
      drawPoly(ctx, [[-20, -12], [20, -12], [18, -8], [-18, -8]], '#78350f', null); // Thịt patty
      drawPoly(ctx, [[-22, -18], [22, -18], [19, -12], [-19, -12]], '#22c55e', null); // Xà lách
      drawPoly(ctx, [[-16, -24], [16, -24], [16, -18], [-16, -18]], '#ef4444', null); // Cà chua
      path(ctx, `M -22 -24 Q -24 -42 0 -42 Q 24 -42 22 -24 Z`, '#d97706', INK, 1.6); // Vòm mui
      // Hạt mè
      ellipse(ctx, -6, -34, 1.0, 1.5, '#fef08a', null);
      ellipse(ctx, 6, -34, 1.0, 1.5, '#fef08a', null);
    } else if (id === 'onigiri') {
      // Cơm nắm tam giác
      path(ctx, `M -18 -6 L 0 -38 L 18 -6 Q 0 0 -18 -6 Z`, '#f8fafc', INK, 1.8);
      // Rong biển nori đen dưới đáy
      drawPoly(ctx, [[-9, -6], [9, -6], [7, -18], [-7, -18]], '#1e293b', null);
    } else if (id === 'bento_box') {
      // Hộp bento sơn mài chia 4 ngăn
      drawPoly(ctx, [[-30, -4], [30, -4], [28, -36], [-28, -36]], '#1e293b', INK, 2.0);
      line(ctx, [[0, -6], [0, -34]], '#dc2626', 1.8);
      line(ctx, [[-28, -20], [28, -20]], '#dc2626', 1.8);
      // Cơm + quả mơ umeboshi
      ellipse(ctx, -14, -27, 8, 5, '#ffffff', null);
      ellipse(ctx, -14, -27, 2, 2, '#ef4444', null);
      // Trứng cuộn tamago vàng
      drawPoly(ctx, [[10, -24], [20, -24], [18, -32], [8, -32]], '#facc15', null);
    } else if (id === 'sushi') {
      // Cơm trắng hình thoi
      ellipse(ctx, 0, -10, 18, 7, '#ffffff', INK, 1.4);
      // Miếng cá hồi cam có vân mỡ trắng
      ellipse(ctx, 0, -16, 20, 8, '#f97316', INK, 1.6);
      line(ctx, [[-8, -19], [0, -13]], '#ffffff', 1.4);
      line(ctx, [[2, -19], [10, -13]], '#ffffff', 1.4);
    } else if (id === 'ramen_bowl' || id === 'tteokguk' || id === 'bibimbap' || id === 'rice_bowl') {
      // Tô bát gốm sứ
      const bowlColor = id === 'bibimbap' ? '#292524' : '#f8fafc';
      path(ctx, `M -26 -28 Q -24 0 0 2 Q 24 0 26 -28 Z`, bowlColor, INK, 2.0);
      ellipse(ctx, 0, -28, 26, 8, '#cbd5e1', INK, 1.2);

      if (id === 'ramen_bowl') {
        // Nước dùng & sợi mì vàng
        ellipse(ctx, 0, -28, 23, 7, '#d97706', null);
        // Trứng nửa quả
        ellipse(ctx, -8, -28, 5, 4, '#ffffff', null);
        ellipse(ctx, -8, -28, 2.5, 2.5, '#ea580c', null);
        // Rong biển nori
        drawPoly(ctx, [[8, -32], [18, -32], [16, -24], [6, -24]], '#1e293b', null);
      } else if (id === 'rice_bowl') {
        // Cơm trắng vun đầy
        path(ctx, `M -23 -28 Q 0 -44 23 -28 Z`, '#ffffff', INK, 1.4);
      } else if (id === 'bibimbap') {
        // Các dải rau củ quanh trứng
        ellipse(ctx, 0, -28, 23, 7, '#fef08a', null);
        ellipse(ctx, 0, -28, 4, 4, '#ea580c', null); // Lòng đỏ
      }
    } else if (id === 'mochi' || id === 'songpyeon') {
      // Bánh tròn dẻo
      ellipse(ctx, 0, -14, 18, 12, id === 'mochi' ? '#fdf2f8' : '#86efac', INK, 1.6);
    } else if (id === 'dango') {
      // Xiên tre
      line(ctx, [[0, 2], [0, -56]], '#b45309', 2.0);
      // 3 viên: xanh, trắng, hồng
      ellipse(ctx, 0, -14, 9, 8, '#86efac', INK, 1.2);
      ellipse(ctx, 0, -30, 9, 8, '#ffffff', INK, 1.2);
      ellipse(ctx, 0, -46, 9, 8, '#f472b6', INK, 1.2);
    } else if (id === 'kimchi') {
      // Đĩa rau cay đỏ
      ellipse(ctx, 0, -4, 24, 7, '#ffffff', INK, 1.4);
      path(ctx, `M -16 -8 Q -10 -24 0 -22 Q 10 -24 16 -8 Z`, '#dc2626', INK, 1.6);
    } else if (id === 'soup_pot') {
      // Nồi súp kim loại hai quai
      drawPoly(ctx, [[-26, -4], [26, -4], [28, -32], [-28, -32]], '#94a3b8', INK, 2.0);
      ellipse(ctx, 0, -32, 28, 8, '#f97316', INK, 1.4);
      // Quai nồi
      line(ctx, [[-28, -25], [-34, -25]], '#475569', 3.0);
      line(ctx, [[28, -25], [34, -25]], '#475569', 3.0);
    }

    // 2. HIỆU ỨNG HƠI NÓNG BỐC LÊN (STEAM)
    if (spec.hot) {
      for (let si = 0; si < 3; si++) {
        const steamX = (si - 1) * 12 + Math.sin(t * 3 + si) * 4;
        const steamY = -spec.height - 8 - ((t * 25 + si * 14) % 35);
        ctx.save();
        ctx.globalAlpha = clamp(1.0 - (-steamY - spec.height) / 45);
        path(ctx, `M ${steamX} ${steamY} Q ${steamX - 4} ${steamY - 6} ${steamX} ${steamY - 12} Q ${steamX + 4} ${steamY - 18} ${steamX} ${steamY - 24}`, null, '#cbd5e1', 1.4);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  const foodRigs = {};
  for (const [id, spec] of Object.entries(FOOD_SPECS)) {
    foodRigs[id] = {
      group: 'food',
      spec,
      anchors: {
        root: [0, 0],
        top: [0, -spec.height],
        surface: [0, -spec.height * 0.5],
        grip: [0, -spec.height * 0.4],
        face: [0, -spec.height * 0.5],
        mouth: [0, -spec.height * 0.4]
      },
      draw(ctx, s, t, cat, kit) {
        drawFood(ctx, s, t, spec, cat, kit);
      }
    };
  }

  RemakeVector.kit.FOOD_SPECS = FOOD_SPECS;
  RemakeVector.kit.drawFood = drawFood;

  RemakeVector.register({
    rigs: foodRigs
  });

})();
