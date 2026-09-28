// remake_vector_packs/tools_ext.js — Giai đoạn J: Đồ dùng cầm tay mở rộng & 16 Động tác dùng chung mới
// Cung cấp các dụng cụ thợ, việc nhà, khoa học, an toàn, đồ chơi, lịch sử và đạo cụ pictogram.
// Cung cấp 16 action hooks: drive, ride, build, haul, carry_together, row, sweep, cook, dress,
// take_cover, evacuate, sort, invent, launch, float, paint.

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
  // 1. CẤU HÌNH VÀ HÀM VẼ CÁC ĐỒ DÙNG MỚI (TOOLS_EXT)
  // -------------------------------------------------------------
  const TOOL_SPECS = {
    // THỢ
    hammer: { label: 'Búa thợ', width: 22, height: 32, tip_anchor: 'head', topics: ['inventions', 'jobs'] },
    saw: { label: 'Cưa tay', width: 34, height: 26, tip_anchor: 'blade', topics: ['inventions', 'jobs'] },
    chisel: { label: 'Đục gỗ', width: 14, height: 28, tip_anchor: 'tip', topics: ['inventions', 'ancient'] },
    trowel: { label: 'Bay thợ xây', width: 20, height: 28, tip_anchor: 'blade', topics: ['jobs', 'ancient'] },
    pickaxe: { label: 'Cuốc chim', width: 30, height: 36, tip_anchor: 'head', topics: ['jobs', 'us_culture'] },
    rope: { label: 'Cuộn dây thừng', width: 26, height: 26, tip_anchor: 'tip', topics: ['ancient', 'medieval'] },
    ladder: { label: 'Thang gỗ', width: 24, height: 80, tip_anchor: 'top', topics: ['jobs', 'safety'] },

    // VIỆC NHÀ
    broom: { label: 'Chổi quét', width: 24, height: 65, tip_anchor: 'bristles', topics: ['jobs', 'recycling'] },
    dustpan: { label: 'Hót rác', width: 26, height: 30, tip_anchor: 'blade', topics: ['recycling', 'school'] },
    rice_paddle: { label: 'Vá xới cơm', width: 16, height: 30, tip_anchor: 'tip', topics: ['food', 'jp_culture'] },
    chopsticks: { label: 'Đôi đũa', width: 10, height: 32, tip_anchor: 'tip', topics: ['food', 'kr_culture'] },
    fork: { label: 'Nĩa ăn', width: 12, height: 32, tip_anchor: 'tip', topics: ['food', 'de_culture'] },
    whisk: { label: 'Cây đánh trứng', width: 16, height: 34, tip_anchor: 'head', topics: ['food', 'jobs'] },
    frying_pan: { label: 'Chảo rán', width: 44, height: 26, tip_anchor: 'cup', topics: ['food', 'jobs'] },
    ladle: { label: 'Muôi múc canh', width: 20, height: 42, tip_anchor: 'cup', topics: ['food', 'jobs'] },

    // HỌC & KHÁM PHÁ
    magnifier: { label: 'Kính lúp', width: 22, height: 36, tip_anchor: 'lens', topics: ['nature', 'mysteries'] },
    telescope: { label: 'Kính viễn vọng', width: 45, height: 28, tip_anchor: 'lens', topics: ['space', 'inventions'] },
    compass: { label: 'La bàn bỏ túi', width: 22, height: 26, tip_anchor: 'head', topics: ['ocean', 'inventions'] },
    map_blank: { label: 'Bản đồ cuộn', width: 32, height: 36, tip_anchor: 'surface', topics: ['mysteries', 'inventions'] },
    paint_brush: { label: 'Cọ vẽ màu', width: 12, height: 34, tip_anchor: 'bristles', topics: ['ancient', 'school'] },
    quill: { label: 'Bút lông ngỗng', width: 14, height: 38, tip_anchor: 'tip', topics: ['inventions', 'history'] },
    calligraphy_brush: { label: 'Bút lông thư pháp', width: 12, height: 40, tip_anchor: 'bristles', topics: ['kr_culture', 'jp_culture'] },

    // AN TOÀN
    flashlight: { label: 'Đèn pin cầm tay', width: 18, height: 30, tip_anchor: 'lens', topics: ['safety', 'disaster'] },
    fire_extinguisher: { label: 'Bình chữa cháy mini', width: 20, height: 42, tip_anchor: 'nozzle', topics: ['safety', 'jobs'] },
    whistle: { label: 'Còi cứu hộ', width: 16, height: 20, tip_anchor: 'tip', topics: ['safety', 'disaster'] },
    umbrella: { label: 'Cây dù che mưa', width: 48, height: 60, tip_anchor: 'canopy', topics: ['safety', 'nature'] },

    // CHƠI & LỄ HỘI
    kite: { label: 'Cánh diều', width: 44, height: 48, tip_anchor: 'tail', topics: ['kr_culture', 'festivals'] },
    ball: { label: 'Quả bóng da', width: 26, height: 26, tip_anchor: 'top', topics: ['school', 'festivals'] },
    jump_rope: { label: 'Dây nhảy', width: 36, height: 40, tip_anchor: 'rope', topics: ['school', 'safety'] },
    lantern_star: { label: 'Đèn lồng ngôi sao', width: 34, height: 48, tip_anchor: 'light', topics: ['festivals', 'de_culture'] },

    // LỊCH SỬ & ĐẠO CỤ
    gold_pan: { label: 'Chảo đãi vàng', width: 38, height: 16, tip_anchor: 'cup', topics: ['us_culture', 'ancient'] },
    wooden_shield: { label: 'Khiên gỗ tròn', width: 34, height: 34, tip_anchor: 'shield', topics: ['medieval', 'fables'] },
    toy_sword: { label: 'Thanh kiếm gỗ tập', width: 14, height: 45, tip_anchor: 'tip', topics: ['medieval', 'fables'] },
    printing_press: { label: 'Máy in chữ rời Gutenberg', width: 55, height: 75, tip_anchor: 'press', topics: ['inventions', 'de_culture'] },
    early_bulb: { label: 'Bóng đèn Edison đầu tiên', width: 22, height: 38, tip_anchor: 'bulb', topics: ['inventions', 'us_culture'] },

    // PICTOGRAM PROPS
    sign_post: { label: 'Biển báo cột', width: 34, height: 80, tip_anchor: 'sign', topics: ['safety', 'school'] },
    pictogram_card: { label: 'Thẻ biểu tượng học tập', width: 32, height: 42, tip_anchor: 'surface', topics: ['school', 'safety'] },
    screen: { label: 'Màn hình hiển thị biểu tượng', width: 55, height: 40, tip_anchor: 'screen', topics: ['space', 'safety'] }
  };

  function drawExtendedTool(ctx, s, t, id) {
    ctx.save();
    if (id === 'hammer') {
      line(ctx, [[0, 0], [0, -26]], '#78350f', 3.0); // Cán gỗ
      drawPoly(ctx, [[-8, -24], [10, -24], [10, -32], [-8, -32]], '#64748b', INK, 1.2); // Đầu búa
    } else if (id === 'saw') {
      drawPoly(ctx, [[-14, 0], [16, -18], [16, -26], [-14, -14]], '#94a3b8', INK, 1.2);
      ellipse(ctx, -14, -6, 5, 8, '#78350f', INK, 1.2); // Tay nắm
    } else if (id === 'trowel') {
      line(ctx, [[0, 0], [0, -12]], '#78350f', 2.5);
      path(ctx, `M -10 -12 L 10 -12 L 0 -28 Z`, '#94a3b8', INK, 1.2); // Lưỡi bay hình tam giác
    } else if (id === 'broom') {
      line(ctx, [[0, 0], [0, -62]], '#ca8a04', 3.0); // Cán chổi
      path(ctx, `M -12 0 L 12 0 L 6 -16 L -6 -16 Z`, '#eab308', INK, 1.4); // Rơm chổi
    } else if (id === 'ladle') {
      line(ctx, [[0, 0], [0, -36]], '#94a3b8', 2.5);
      ellipse(ctx, 0, -38, 8, 5, '#64748b', INK, 1.2);
    } else if (id === 'magnifier') {
      line(ctx, [[0, 0], [0, -18]], '#78350f', 3.0);
      ellipse(ctx, 0, -27, 8, 8, '#38bdf8', '#475569', 2.0);
    } else if (id === 'flashlight') {
      taper(ctx, 0, -2, 0, -24, 6, 7, '#1e293b', INK, 1.2);
      ellipse(ctx, 0, -26, 8, 4, '#fef08a', INK, 1.2);
    } else if (id === 'fire_extinguisher') {
      taper(ctx, 0, -4, 0, -32, 8, 8, '#ef4444', INK, 1.4);
      line(ctx, [[0, -36], [6, -38], [6, -28]], '#0f172a', 2.0);
    } else if (id === 'umbrella') {
      line(ctx, [[0, 0], [0, -56]], '#475569', 2.5); // Cán dù
      path(ctx, `M -24 -46 Q 0 -65 24 -46 Z`, '#0284c7', INK, 1.6); // Vòm dù
    } else if (id === 'wooden_shield') {
      ellipse(ctx, 0, -17, 16, 16, '#78350f', INK, 1.8);
      ellipse(ctx, 0, -17, 6, 6, '#b45309', INK, 1.2);
    } else if (id === 'toy_sword') {
      line(ctx, [[0, 0], [0, -12]], '#78350f', 3.0); // Chuôi
      line(ctx, [[-6, -12], [6, -12]], '#ca8a04', 2.5); // Chắn tay
      line(ctx, [[0, -12], [0, -42]], '#fef08a', 4.0); // Lưỡi gỗ
    } else if (id === 'printing_press') {
      // Máy in Gutenberg
      drawPoly(ctx, [[-24, 0], [24, 0], [24, -72], [-24, -72]], '#451a03', INK, 2.0);
      line(ctx, [[-18, -45], [18, -45]], '#0f172a', 4.0);
      ellipse(ctx, 0, -55, 10, 4, '#a8a29e', INK, 1.2); // Trục ép
    } else if (id === 'early_bulb') {
      ellipse(ctx, 0, -26, 9, 11, 'rgba(254, 240, 138, 0.85)', '#ca8a04', 1.4);
      taper(ctx, 0, -6, 0, -14, 5, 5, '#78716c', INK, 1.2);
      path(ctx, `M -3 -24 Q 0 -30 3 -24`, null, '#ef4444', 1.4); // Dây tóc
    } else if (id === 'sign_post') {
      // Cột biển báo
      line(ctx, [[0, 0], [0, -78]], '#64748b', 3.5);
      // Biển báo bát giác hoặc tam giác
      if (RemakeVector.kit.PICTOGRAMS) {
        RemakeVector.kit.PICTOGRAMS.traffic(ctx, 0, -62, 28, 'stop_hand');
      }
    } else if (id === 'pictogram_card') {
      drawPoly(ctx, [[-15, 0], [15, 0], [15, -40], [-15, -40]], '#ffffff', INK, 1.4);
      if (RemakeVector.kit.PICTOGRAMS) {
        RemakeVector.kit.PICTOGRAMS.recycling(ctx, 0, -20, 20, 'recycle_arrows');
      }
    } else if (id === 'screen') {
      drawPoly(ctx, [[-26, 0], [26, 0], [26, -38], [-26, -38]], '#0f172a', INK, 1.8);
      drawPoly(ctx, [[-22, -4], [22, -4], [22, -34], [-22, -34]], '#0369a1', null);
      if (RemakeVector.kit.PICTOGRAMS) {
        RemakeVector.kit.PICTOGRAMS.emergency(ctx, 0, -19, 18, 'running_exit');
      }
    } else if (EXTRA_DRAWERS[id]) {
      EXTRA_DRAWERS[id](ctx, s, t);
    } else {
      // Không bao giờ vẽ một que mặc định: rig chưa có hình là lỗi (test render mọi rig của catalog).
      throw new Error(`tools_ext: chưa có hình vẽ cho ${id}`);
    }
    ctx.restore();
  }

  const WOOD = '#92400e', STEEL = '#94a3b8', DARK = '#1e293b';
  // Hình vẽ các đồ dùng còn lại. Anchor tay cầm / đầu làm việc khai ở TOOL_ANCHORS, khớp với hình.
  const EXTRA_DRAWERS = {
    chisel(ctx) { taper(ctx, 0, 0, 0, -14, 3.4, 3, WOOD, INK, 1.2); path(ctx, 'M -3 -14 L 3 -14 L 3 -17 L -3 -17 Z', '#57534e', INK, 1); path(ctx, 'M -2.4 -17 L 2.4 -17 L 2 -27 L -2 -27 Z', STEEL, INK, 1.1); line(ctx, [[-2, -27], [2, -27]], '#e2e8f0', 1.4); },
    pickaxe(ctx) { line(ctx, [[0, 0], [0, -33]], INK, 4.4); line(ctx, [[0, 0], [0, -33]], WOOD, 2.8); path(ctx, 'M -17 -27 Q 0 -40 17 -27 L 14 -30 Q 0 -45 -14 -30 Z', STEEL, INK, 1.3); },
    rope(ctx) { for (const r of [12, 9, 6]) ellipse(ctx, 0, -14, r, r * 0.9, null, '#a16207', 3.2); for (const r of [12, 9, 6]) ellipse(ctx, 0, -14, r, r * 0.9, null, '#d6b77a', 1.6); path(ctx, 'M 10 -8 Q 14 -4 12 0', null, '#a16207', 3.2); path(ctx, 'M 10 -8 Q 14 -4 12 0', null, '#d6b77a', 1.6); },
    ladder(ctx) { for (const x of [-9, 9]) { line(ctx, [[x, 0], [x, -78]], INK, 4.2); line(ctx, [[x, 0], [x, -78]], '#b45309', 2.6); } for (let y = -8; y > -78; y -= 10) { line(ctx, [[-9, y], [9, y]], INK, 3.4); line(ctx, [[-9, y], [9, y]], '#d97706', 2); } },
    dustpan(ctx) { path(ctx, 'M -13 0 L 13 0 L 10 -12 L -10 -12 Z', '#0ea5e9', INK, 1.3); line(ctx, [[-12, -1], [12, -1]], '#e0f2fe', 1.2); line(ctx, [[0, -12], [0, -29]], INK, 3.6); line(ctx, [[0, -12], [0, -29]], '#0284c7', 2.2); },
    rice_paddle(ctx) { taper(ctx, 0, 0, 0, -18, 2, 2.6, '#e7d7a8', INK, 1.1); ellipse(ctx, 0, -24, 6, 7.5, '#f5ebd0', INK, 1.2); },
    chopsticks(ctx) { taper(ctx, -2, 0, -0.5, -31, 1.3, 0.6, '#b45309', INK, 0.8); taper(ctx, 2, 0, 0.5, -31, 1.3, 0.6, '#b45309', INK, 0.8); line(ctx, [[-2.2, -3], [2.2, -3]], '#dc2626', 1.4); },
    fork(ctx) { taper(ctx, 0, 0, 0, -19, 2.4, 1.6, STEEL, INK, 1); path(ctx, 'M -4.5 -19 L 4.5 -19 L 4.5 -23 L -4.5 -23 Z', STEEL, INK, 1); for (const x of [-4, -1.4, 1.4, 4]) line(ctx, [[x, -23], [x, -31]], STEEL, 1.4); },
    whisk(ctx) { taper(ctx, 0, 0, 0, -14, 2.8, 2.6, '#dc2626', INK, 1.1); for (const rx of [2.5, 5, 7]) ellipse(ctx, 0, -24, rx, 10, null, STEEL, 1.1); },
    frying_pan(ctx) { taper(ctx, 0, 0, 0, -8, 2.4, 2.4, DARK, INK, 1); ellipse(ctx, 0, -17, 13, 9.5, '#334155', INK, 1.4); ellipse(ctx, 0, -17.5, 10.5, 7.5, '#1e293b', null); ellipse(ctx, -3, -20, 3, 1.6, 'rgba(255,255,255,0.18)', null); },
    telescope(ctx) { taper(ctx, -18, -6, 18, -24, 3, 5.2, '#1d4ed8', INK, 1.3); for (const k of [0.3, 0.62]) { const x = -18 + 36 * k, y = -6 - 18 * k; ellipse(ctx, x, y, 2, 4.6, '#eab308', INK, 0.8, 1.1); } ellipse(ctx, 18.5, -24.3, 2.2, 5.4, '#bae6fd', INK, 1, 1.1); },
    compass(ctx) { ellipse(ctx, 0, -26, 3, 2.4, null, '#ca8a04', 1.6); ellipse(ctx, 0, -14, 11, 11, '#eab308', INK, 1.4); ellipse(ctx, 0, -14, 8.4, 8.4, '#f8fafc', INK, 1); path(ctx, 'M 0 -21 L 2 -14 L -2 -14 Z', '#dc2626', null); path(ctx, 'M 0 -7 L 2 -14 L -2 -14 Z', '#2563eb', null); ellipse(ctx, 0, -14, 1.3, 1.3, INK, null); },
    // Bản đồ không chữ, không biên giới thật: đảo, đường nét đứt và dấu X.
    map_blank(ctx) { path(ctx, 'M -14 -4 L 14 -4 L 14 -32 L -14 -32 Z', '#fef3c7', INK, 1.2); for (const y of [-32, -4]) ellipse(ctx, 0, y, 15, 2.6, '#fde68a', INK, 1.1); path(ctx, 'M -10 -24 Q -4 -30 2 -25 Q 6 -20 0 -16 Q -8 -14 -10 -24 Z', '#86efac', '#15803d', 0.9); path(ctx, 'M 2 -12 Q 6 -8 10 -12', null, '#0ea5e9', 1); path(ctx, 'M -8 -10 L -2 -13 L 4 -9', null, '#b91c1c', 1); line(ctx, [[7, -26], [11, -22]], '#b91c1c', 1.5); line(ctx, [[11, -26], [7, -22]], '#b91c1c', 1.5); },
    paint_brush(ctx) { taper(ctx, 0, 0, 0, -24, 1.6, 2.4, '#dc2626', INK, 1); path(ctx, 'M -2.6 -24 L 2.6 -24 L 2.6 -27 L -2.6 -27 Z', STEEL, INK, 0.9); path(ctx, 'M -2.6 -27 Q -3 -31 0 -34 Q 3 -31 2.6 -27 Z', '#2563eb', INK, 0.9); },
    quill(ctx) { line(ctx, [[0, 0], [2, -38]], '#78716c', 1.2); path(ctx, 'M 1.4 -10 Q -8 -22 1.8 -38 Q 10 -24 1.4 -10 Z', '#f8fafc', INK, 1); path(ctx, 'M 1.8 -14 L 5 -18 M 1.8 -20 L 6 -24 M 2 -26 L 5.5 -30 M 1.6 -18 L -2.5 -22 M 1.8 -24 L -2.8 -28', null, '#cbd5e1', 0.8); path(ctx, 'M -0.8 0 L 0.8 0 L 0.6 -4 L -0.6 -4 Z', DARK, null); },
    calligraphy_brush(ctx) { taper(ctx, 0, -8, 0, -40, 2, 2.2, '#a3a36a', INK, 1); for (const y of [-18, -28]) line(ctx, [[-2, y], [2, y]], '#65653a', 1); path(ctx, 'M -2.4 -8 Q -3 -3 0 1 Q 3 -3 2.4 -8 Z', DARK, INK, 0.8); },
    whistle(ctx) { ellipse(ctx, 0, -26, 3, 2.4, null, '#dc2626', 1.4); line(ctx, [[0, -24], [2, -14]], '#dc2626', 1.2); path(ctx, 'M -3 -14 L 7 -14 Q 11 -14 11 -8 Q 11 -2 5 -2 L -3 -2 Z', '#f97316', INK, 1.2); path(ctx, 'M -11 -12 L -3 -12 L -3 -6 L -11 -6 Z', '#f97316', INK, 1.1); ellipse(ctx, 5, -8, 2.4, 2.4, DARK, null); },
    kite(ctx, s, t) { const sway = Math.sin((t || 0) * 3) * 2; path(ctx, 'M 0 -48 L 12 -30 L 0 -12 L -12 -30 Z', '#ef4444', INK, 1.4); path(ctx, 'M 0 -48 L 12 -30 L 0 -30 Z', '#facc15', null); path(ctx, 'M 0 -30 L -12 -30 L 0 -12 Z', '#facc15', null); line(ctx, [[0, -48], [0, -12]], INK, 1); line(ctx, [[-12, -30], [12, -30]], INK, 1); path(ctx, `M 0 -12 Q ${4 + sway} -8 ${-1 - sway} -5 Q ${5 + sway} -3 4 0`, null, '#475569', 1.1); for (const [x, y] of [[2, -9], [1, -4]]) path(ctx, `M ${x - 2.5} ${y - 1.5} L ${x + 2.5} ${y + 1.5} M ${x - 2.5} ${y + 1.5} L ${x + 2.5} ${y - 1.5}`, null, '#2563eb', 1.4); },
    ball(ctx) { ellipse(ctx, 0, -13, 12.5, 12.5, '#f8fafc', INK, 1.4); path(ctx, 'M 0 -18 L 4.6 -14.6 L 2.8 -9.2 L -2.8 -9.2 L -4.6 -14.6 Z', DARK, null); for (const [x1, y1, x2, y2] of [[0, -18, 0, -25], [4.6, -14.6, 11, -17], [2.8, -9.2, 7, -3.6], [-2.8, -9.2, -7, -3.6], [-4.6, -14.6, -11, -17]]) line(ctx, [[x1, y1], [x2, y2]], DARK, 1); },
    jump_rope(ctx) { path(ctx, 'M -14 -6 Q -18 -40 0 -39 Q 18 -40 14 -6', null, '#ec4899', 1.6); for (const x of [-14, 14]) path(ctx, `M ${x - 2} -8 L ${x + 2} -8 L ${x + 1.6} 0 L ${x - 1.6} 0 Z`, '#f59e0b', INK, 1); },
    // Đèn lồng ngôi sao (rước đèn Thánh Martin, Trung thu): que cầm + đèn hình sao phát sáng.
    lantern_star(ctx, s, t) { line(ctx, [[0, 0], [0, -22]], INK, 3.4); line(ctx, [[0, 0], [0, -22]], WOOD, 2); line(ctx, [[0, -22], [0, -20]], '#475569', 1); const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 5.2 : 12, a = -Math.PI / 2 + i * Math.PI / 5; pts.push(`${(Math.cos(a) * r).toFixed(2)} ${(-32 + Math.sin(a) * r).toFixed(2)}`); } ellipse(ctx, 0, -32, 15, 15, `rgba(253, 224, 71, ${0.18 + 0.06 * Math.sin((t || 0) * 4)})`, null); path(ctx, `M ${pts.join(' L ')} Z`, '#fde047', '#ca8a04', 1.3); ellipse(ctx, 0, -32, 3.2, 3.2, '#fff7d6', null); },
    gold_pan(ctx) { path(ctx, 'M -18 -12 L 18 -12 L 12 -2 L -12 -2 Z', '#78716c', INK, 1.3); ellipse(ctx, 0, -12, 18, 3, '#a8a29e', INK, 1.1); ellipse(ctx, 0, -11.5, 13, 2, '#7dd3fc', null); for (const [x, y] of [[-4, -11.5], [2, -12], [6, -11]]) ellipse(ctx, x, y, 1.4, 1, '#facc15', INK, 0.5); },
  };
  // Anchor khớp với hình (thay cho anchor theo tỉ lệ chiều cao): grip = chỗ tay cầm, còn lại = đầu làm việc.
  const TOOL_ANCHORS = {
    chisel: { grip: [0, -8], tip: [0, -27] }, pickaxe: { grip: [0, -8], head: [15, -30] }, rope: { grip: [0, -25], tip: [12, 0] },
    ladder: { grip: [-9, -40], top: [0, -78] }, dustpan: { grip: [0, -27], blade: [0, -1] }, rice_paddle: { grip: [0, -6], tip: [0, -28] },
    chopsticks: { grip: [0, -6], tip: [0, -31] }, fork: { grip: [0, -7], tip: [0, -31] }, whisk: { grip: [0, -6], head: [0, -32] },
    frying_pan: { grip: [0, -3], cup: [0, -17] }, telescope: { grip: [-6, -13], lens: [18.5, -24.3] }, compass: { grip: [0, -14], head: [0, -14] },
    map_blank: { grip: [-14, -18], surface: [0, -18] }, paint_brush: { grip: [0, -9], bristles: [0, -33] }, quill: { grip: [1, -9], tip: [0, 0] },
    calligraphy_brush: { grip: [0, -28], bristles: [0, 0] }, whistle: { grip: [4, -8], tip: [-11, -9] }, kite: { grip: [0, -12], tail: [4, 0] },
    ball: { grip: [0, -13], top: [0, -25.5] }, jump_rope: { grip: [-14, -4], rope: [0, -39] }, lantern_star: { grip: [0, -6], light: [0, -32] },
    gold_pan: { grip: [-17, -11], cup: [0, -10] },
  };

  // -------------------------------------------------------------
  // 2. 16 ACTION HOOKS DÙNG CHUNG CỦA GIAI ĐOẠN J
  // -------------------------------------------------------------
  const ACTION_HOOKS = {
    // 1. DRIVE: Xe chạy, bánh lăn theo s.vx
    drive(a, states, t, p, u, amount, cat, active) {
      const v = states[a.actor];
      if (v) {
        v.vx = v.vx || 1.2;
        v.moving = true;
      }
    },

    // 2. RIDE: Nhân vật ngồi trên ghế xe hoặc lưng con vật
    ride(a, states, t, p, u, amount, cat, active) {
      const rider = states[a.actor];
      const vehicle = states[a.target];
      if (rider && vehicle) {
        rider.sit = 1.0;
        const seatName = a.seat || 'seat_1';
        const seatPt = RemakeVector.worldAnchor(cat, vehicle, seatName);
        const hipLocal = cat.assets[rider.asset]?.anchors?.hip || [0, -22];
        const scale = (rider.height || 100) / 100;
        rider.x = seatPt.x - hipLocal[0] * scale * (rider.flip ? -1 : 1);
        rider.y = seatPt.y - hipLocal[1] * scale;
      }
    },

    // 3. BUILD: Công trình growth tăng 0->1, thợ vung búa chạm mép
    build(a, states, t, p, u, amount, cat, active) {
      const builder = states[a.actor];
      const building = states[a.target];
      if (building) {
        building.growth = clamp(p);
      }
      if (builder) {
        builder.hand_r_x = 24 + Math.sin(t * 12) * 8;
        builder.hand_r_y = -35 + Math.cos(t * 12) * 6;
      }
    },

    // 4. HAUL: Kéo vật nặng bằng dây
    haul(a, states, t, p, u, amount, cat, active) {
      const puller = states[a.actor];
      const heavyObj = states[a.target];
      if (puller && heavyObj) {
        puller.lean = -0.4;
        heavyObj.x += p * 35;
      }
    },

    // 5. CARRY_TOGETHER: 2 người khiêng một vật
    carry_together(a, states, t, p, u, amount, cat, active) {
      const p1 = states[a.actor];
      const p2 = states[a.helper];
      const obj = states[a.target];
      if (p1 && obj) {
        if (p2) {
          obj.x = (p1.x + p2.x) * 0.5;
          obj.y = Math.min(p1.y, p2.y) - 20;
        } else {
          obj.x = p1.x + 30;
          obj.y = p1.y - 15;
        }
      }
    },

    // 6. ROW: Chèo thuyền
    row(a, states, t, p, u, amount, cat, active) {
      const rower = states[a.actor];
      if (rower) {
        rower.hand_r_x = 20 + Math.sin(t * 4) * 14;
        rower.hand_r_y = -25 + Math.cos(t * 4) * 10;
        rower.hand_l_x = -20 + Math.sin(t * 4) * 14;
        rower.hand_l_y = -25 + Math.cos(t * 4) * 10;
      }
    },


    // 8. COOK: Nấu ăn khuấy nồi súp
    cook(a, states, t, p, u, amount, cat, active) {
      const chef = states[a.actor];
      const pot = states[a.target];
      if (chef) {
        chef.hand_r_x = 18 + Math.cos(t * 6) * 8;
        chef.hand_r_y = -30 + Math.sin(t * 6) * 4;
      }
      if (pot) {
        pot.cooked = clamp(p);
      }
    },

    // 9. DRESS: Đổi trang phục
    dress(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (actor && a.outfit) {
        if (p > 0.5) actor.outfit = a.outfit;
      }
    },

    // 10. TAKE_COVER: Chui gầm bàn tránh động đất
    take_cover(a, states, t, p, u, amount, cat, active) {
      // Chui vào gầm bàn (anchor `under`), ngồi co, cúi người, hai tay ôm đầu. Không dời y: story phải chọn bàn đủ
      // cao so với nhân vật (test: đỉnh đầu thấp hơn mặt bàn suốt khoảng che).
      const actor = states[a.actor], table = states[a.target];
      if (!actor || !table) return;
      const k = smooth(clamp(p / 0.25));
      const under = RemakeVector.worldAnchor(cat, table, 'under');
      actor.x = mix(actor.x, under.x, k);
      actor.sit = Math.max(actor.sit || 0, k);
      actor.lean = mix(actor.lean || 0, 0.35, k);
      const head = RemakeVector.worldAnchor(cat, actor, 'head_top');
      for (const [side, dx] of [['hand_l', -6], ['hand_r', 6]]) {
        const local = RemakeVector.worldToLocal(actor, { x: head.x + dx * actor.height / 100, y: head.y + 6 * actor.height / 100 });
        actor[`${side}_x`] = mix(actor[`${side}_x`] ?? local[0], local[0], k);
        actor[`${side}_y`] = mix(actor[`${side}_y`] ?? local[1], local[1], k);
      }
    },

    // 11. EVACUATE: Sơ tán khẩn cấp
    evacuate(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (actor) {
        actor.vx = 2.0;
        actor.walk = 1.0;
        actor.stride = t * 14;
      }
    },

    // 12. SORT: Bỏ rác vào thùng
    sort(a, states, t, p, u, amount, cat, active) {
      const item = states[a.actor];
      const bin = states[a.target];
      if (item && bin) {
        const binOpen = RemakeVector.worldAnchor(cat, bin, 'opening');
        const itemGripLocal = cat.assets[item.asset]?.anchors?.grip || [0, 0];
        const scale = (item.height || 100) / 100;
        const targetX = binOpen.x - itemGripLocal[0] * scale * (item.flip ? -1 : 1);
        const targetY = binOpen.y - itemGripLocal[1] * scale;
        if (p <= 0.7) {
          const frac = p / 0.7;
          item.x += (targetX - item.x) * frac;
          item.y += (targetY - item.y) * frac;
        } else {
          item.x = targetX;
          item.y = targetY;
          item.opacity = 0;
          bin.fill = clamp((bin.fill || 0) + 0.2);
        }
      }
    },

    // 13. INVENT: Phát minh, bóng đèn sáng
    invent(a, states, t, p, u, amount, cat, active) {
      const inventor = states[a.actor];
      const item = states[a.target];
      if (inventor) {
        inventor.glow = 1.0;
      }
      if (item) {
        item.growth = clamp(p);
      }
    },

    // 14. LAUNCH: Phóng tên lửa
    launch(a, states, t, p, u, amount, cat, active) {
      const rocket = states[a.actor];
      if (rocket) {
        rocket.launch = true;
        rocket.y -= Math.pow(p, 2) * 250;
      }
    },

    // 15. FLOAT: Lơ lửng không trọng lực
    float(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (actor) {
        actor.y += Math.sin(t * 2) * 12;
        actor.rotation = (actor.rotation || 0) + Math.sin(t * 1.5) * 8;
      }
    },

    // 16. PAINT: Vẽ tranh
    paint(a, states, t, p, u, amount, cat, active) {
      const painter = states[a.actor];
      const surface = states[a.target];
      if (painter) {
        painter.hand_r_x = 25 + Math.sin(t * 8) * 8;
        painter.hand_r_y = -35 + Math.cos(t * 8) * 8;
        if (surface) {
          const surfPt = RemakeVector.worldAnchor(cat, surface, 'surface');
          const brushPt = RemakeVector.worldAnchor(cat, painter, 'hand_r');
          const dx = surfPt.x - brushPt.x;
          painter.x += dx * 0.5;
        }
      }
    }
  };

  // -------------------------------------------------------------
  // 3. ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  const toolRigs = {};
  for (const [id, spec] of Object.entries(TOOL_SPECS)) {
    const anchors = {
      root: [0, 0],
      top: [0, -spec.height],
      surface: [0, -spec.height * 0.5],
      grip: [0, -spec.height * 0.25]
    };
    if (spec.tip_anchor) {
      anchors[spec.tip_anchor] = [0, -spec.height * 0.9];
    }
    Object.assign(anchors, TOOL_ANCHORS[id] || {});

    toolRigs[id] = {
      group: 'tool',
      spec,
      anchors,
      draw(ctx, s, t, cat, kit) {
        drawExtendedTool(ctx, s, t, id);
      }
    };
  }

  RemakeVector.kit.TOOL_SPECS = TOOL_SPECS;
  RemakeVector.kit.TOOL_ANCHORS = TOOL_ANCHORS;

  RemakeVector.register({
    rigs: toolRigs,
    actionHooks: ACTION_HOOKS
  });

})();
