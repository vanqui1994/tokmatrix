// Gói Rau Củ & Cây Trồng Trong Đất (vegetables)
// Phiên bản: 1.0.0
// Giai đoạn E: 15 củ/bông đã thu hoạch (nhóm vegetable), 18 cây trong đất (nhóm plant),
// 1 hình nền luống rau vegetable_rows.

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('vegetables pack: RemakeVector core engine chưa được nạp.');
  }

  const {
    INK, tone, volume, cylinder, limb, mitten, leaf, blade,
    ellipse, path, line, withCut, hash, clamp, smooth,
    FRUIT_BODIES, FRUIT_SEEDS, FRUIT_LIMBS, BACKGROUNDS
  } = RemakeVector.kit;

  const TAU = Math.PI * 2;

  // -------------------------------------------------------------
  // 1. BẢNG MÀU SINH TRƯỞNG & CHÍN CHO 15 RAU CỦ THU HOẠCH
  // -------------------------------------------------------------
  const VEG_COLORS = {
    kohlrabi: [[175, 218, 140], [160, 210, 130], [185, 225, 155]],         // xanh nhạt -> xanh cốm -> xanh ngọc su hào
    potato: [[195, 175, 125], [210, 180, 120], [182, 145, 92]],            // vàng non -> đất nhạt -> nâu đất chín
    sweet_potato: [[192, 140, 130], [186, 75, 95], [152, 45, 72]],         // nâu hồng -> đỏ hồng -> tím đỏ đậm
    cassava: [[156, 130, 98], [128, 96, 68], [98, 70, 48]],                 // gỗ sáng -> vỏ nâu xám -> vỏ nâu sẫm
    taro: [[164, 150, 140], [145, 130, 120], [122, 105, 96]],              // xám sáng -> xám nâu -> nâu xám khoai môn
    radish: [[198, 222, 160], [236, 242, 230], [246, 248, 252]],           // xanh đọt -> trắng ngà -> trắng tinh khiết
    beet: [[182, 60, 85], [160, 32, 62], [122, 18, 44]],                   // hồng đỏ -> đỏ thẫm -> đỏ tím củ dền
    onion: [[198, 212, 145], [228, 182, 105], [210, 142, 64]],             // xanh trắng -> vàng rơm -> vàng đồng vỏ hành
    garlic: [[196, 210, 168], [240, 238, 230], [248, 246, 242]],           // xanh nhạt -> trắng ngà -> trắng giấy viền tím nhạt
    ginger: [[212, 192, 140], [206, 172, 108], [186, 146, 88]],            // vàng nhạt -> vàng gừng -> vàng nâu ấm
    cauliflower: [[180, 212, 150], [236, 232, 210], [248, 246, 236]],      // xanh lá -> kem nhạt -> trắng ngà bông cải
    broccoli: [[138, 186, 92], [68, 142, 58], [42, 115, 46]],              // xanh non -> xanh bông -> xanh đậm súp lơ
    okra: [[158, 204, 98], [112, 178, 64], [82, 152, 52]],                 // xanh đọt -> xanh mướt -> xanh đậm đậu bắp
    chili: [[142, 195, 88], [235, 130, 45], [218, 36, 32]],                // xanh non -> cam đỏ -> đỏ tươi ớt chỉ thiên
    mushroom: [[228, 224, 212], [212, 190, 165], [178, 142, 112]],        // trắng ngà -> kem nâu -> nâu caramel nấm rơm
  };

  function vegRipenColor(id, g) {
    const stops = VEG_COLORS[id] || [[160, 190, 120], [200, 180, 100], [180, 120, 70]];
    const scaled = clamp(g) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    const u = scaled - i;
    const r = Math.round(stops[i][0] + (stops[i + 1][0] - stops[i][0]) * u);
    const gCol = Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * u);
    const b = Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * u);
    return `rgb(${r},${gCol},${b})`;
  }

  // -------------------------------------------------------------
  // 2. VẼ THÂN VÀ RUỘT (SEEDS) CHO 15 RAU CỦ ĐÃ THU HOẠCH
  // -------------------------------------------------------------

  // 2.1 KOHLRABI (Su hào)
  function drawKohlrabiBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('kohlrabi', s.growth ?? 1);
    // Củ tròn hơi dẹt đáy, cuống lá vươn lên từ vai củ
    ellipse(ctx, 0, -38, 28, 26, volume(ctx, 4, -38, 28, 26, col, .35, -.25), INK, 2.2);
    // Vệt sáng căng tròn
    ellipse(ctx, -10, -48, 6, 10, 'rgba(255,255,255,.45)', null, 1, .25);
    // Các cuống lá bị cắt ngắn hoặc vươn cao trên vai củ
    const stems = [[-14, -60, -0.4], [-4, -66, -0.1], [8, -65, 0.2], [16, -58, 0.45]];
    for (const [sx, sy, ang] of stems) {
      path(ctx, `M ${sx * 0.5} -56 Q ${sx * 0.75} ${sy} ${sx} ${sy - 6}`, null, INK, 3.8);
      path(ctx, `M ${sx * 0.5} -56 Q ${sx * 0.75} ${sy} ${sx} ${sy - 6}`, null, '#6fa844', 2.2);
      leaf(ctx, sx, sy - 8, 0.42, ang, '#62a038');
    }
    // Rễ đuôi nhỏ ở đáy
    path(ctx, 'M 0 -12 Q 1 -4 3 2', null, INK, 2.8);
    path(ctx, 'M 0 -12 Q 1 -4 3 2', null, '#7fa856', 1.6);
  }
  function drawKohlrabiSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -38, 14, 23, '#ffffff', null);
    // Vòng ruột giòn mọng nước
    ellipse(ctx, side * 6, -38, 9, 16, '#f4fbf0', null);
    path(ctx, `M ${side * 4} -50 Q ${side * 9} -38 ${side * 5} -26`, null, '#d8eec8', 1.2);
  }

  // 2.2 POTATO (Khoai tây)
  function drawPotatoBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('potato', s.growth ?? 1);
    // Củ bầu dục tròn trịa tự nhiên
    const d = 'M 0 -72 C 24 -72 32 -54 32 -38 C 32 -18 20 0 0 0 C -20 0 -32 -18 -32 -38 C -32 -54 -24 -72 0 -72 Z';
    path(ctx, d, volume(ctx, 4, -36, 30, 36, col, .35, -.25), INK, 2.2);
    // Mắt củ khoai tây (dimples) bố trí ở hai bên và đỉnh để không bị mặt che
    ctx.save();
    const eyes = [[-18, -54], [18, -52], [-20, -28], [20, -26], [-8, -64], [8, -62]];
    for (const [ex, ey] of eyes) {
      ellipse(ctx, ex, ey, 2.8, 1.4, tone(col, -.35), null, 1, 0.15);
      path(ctx, `M ${ex - 3} ${ey + 1} Q ${ex} ${ey - 1.5} ${ex + 3} ${ey + 1}`, null, tone(col, -.5), 1.1);
    }
    ctx.restore();
    ellipse(ctx, -10, -50, 5, 12, 'rgba(255,255,255,.35)', null, 1, .2);
  }
  function drawPotatoSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -36, 14, 25, '#fff9db', null);
    // Lớp bột vàng nhạt và vòng lõi
    ellipse(ctx, side * 6, -36, 9, 18, '#fff3bd', null);
    ellipse(ctx, side * 5, -36, 4, 10, '#faeb9e', null);
  }

  // 2.3 SWEET POTATO (Khoai lang)
  function drawSweetPotatoBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('sweet_potato', s.growth ?? 1);
    // Thon dài thuôn hai đầu, uốn nhẹ duyên dáng
    const d = 'M 0 -82 C 16 -76 26 -56 26 -38 C 26 -16 14 -2 0 2 C -14 -2 -26 -16 -26 -38 C -26 -56 -16 -76 0 -82 Z';
    path(ctx, d, volume(ctx, 4, -40, 26, 42, col, .35, -.25), INK, 2.2);
    // Gân vỏ ngang mờ mịn
    ctx.save(); ctx.globalAlpha *= .35;
    for (let i = 0; i < 6; i++) {
      const y = -65 + i * 11, w = 18 - Math.abs(i - 2.5) * 3;
      line(ctx, [[-w, y], [w * .6, y + 1.5]], tone(col, -.4), 1.2);
    }
    ctx.restore();
    ellipse(ctx, -8, -52, 4.5, 15, 'rgba(255,255,255,.4)', null, 1, .15);
  }
  function drawSweetPotatoSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -40, 13, 27, '#fca448', null);
    // Ruột khoai vàng cam ngọt lịm
    ellipse(ctx, side * 6, -40, 8, 20, '#ffbe6b', null);
    path(ctx, `M ${side * 5} -52 Q ${side * 8} -40 ${side * 5} -28`, null, '#f48824', 1.4);
  }

  // 2.4 CASSAVA (Khoai mì / sắn)
  function drawCassavaBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('cassava', s.growth ?? 1);
    // Củ trụ dài, vỏ gỗ xù xì, vuốt nhọn đáy
    const d = 'M 0 -86 C 14 -84 18 -60 18 -38 C 18 -16 10 0 0 4 C -10 0 -18 -16 -18 -38 C -18 -60 -14 -84 0 -86 Z';
    path(ctx, d, volume(ctx, 3, -42, 18, 44, col, .35, -.25), INK, 2.2);
    // Vết nứt vỏ gỗ đặc trưng
    ctx.save(); ctx.globalAlpha *= .5;
    for (let i = 0; i < 7; i++) {
      const y = -72 + i * 11, w = 14 - Math.abs(i - 3) * 2;
      line(ctx, [[-w, y], [-w * .2, y + 1]], '#3e2a1c', 1.4);
      line(ctx, [[w * .2, y + 2], [w, y + 1]], '#3e2a1c', 1.4);
    }
    ctx.restore();
    ellipse(ctx, -6, -56, 3, 14, 'rgba(255,255,255,.3)', null, 1, .1);
  }
  function drawCassavaSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 6, -42, 10, 28, '#ffffff', null);
    // Lõi sợi trắng và chấm tâm gỗ
    ellipse(ctx, side * 5, -42, 6, 20, '#f5f5f5', null);
    ellipse(ctx, side * 5, -42, 1.2, 1.8, '#4a3220', null);
  }

  // 2.5 TARO (Khoai môn)
  function drawTaroBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('taro', s.growth ?? 1);
    // Củ hình trứng/thùng, nhiều ngấn vòng ngang
    ellipse(ctx, 0, -40, 26, 34, volume(ctx, 4, -40, 26, 34, col, .35, -.25), INK, 2.2);
    // Ngấn vòng ngang đặc trưng của khoai môn
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const y = -62 + i * 8.5, rx = 23 - Math.abs(i - 2.5) * 3;
      path(ctx, `M ${-rx} ${y} Q 0 ${y + 3} ${rx} ${y}`, null, tone(col, -.35), 1.6);
    }
    // Lông xơ nâu mịn
    for (const [fx, fy] of [[-18, -48], [17, -42], [-16, -30], [18, -55]]) {
      line(ctx, [[fx, fy], [fx + (fx > 0 ? 4 : -4), fy + 3]], '#4e3c32', 1.1);
    }
    ctx.restore();
    ellipse(ctx, -9, -52, 4.5, 12, 'rgba(255,255,255,.35)', null, 1, .2);
  }
  function drawTaroSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -40, 13, 23, '#f8f4f6', null);
    // Đốm sợi tím li ti đặc trưng
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const px = side * (3 + (i * 3.7) % 8), py = -54 + (i * 2.9) % 28;
      ellipse(ctx, px, py, 1.1, 1.8, '#7e4d82', null, 1, 0.4);
    }
    ctx.restore();
  }

  // 2.6 RADISH (Củ cải trắng)
  function drawRadishBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('radish', s.growth ?? 1);
    // Củ dài thuôn, trắng muốt, cổ xanh non
    const d = 'M 0 -84 C 15 -84 18 -60 16 -34 C 14 -12 6 2 0 6 C -6 2 -14 -12 -16 -34 C -18 -60 -15 -84 0 -84 Z';
    path(ctx, d, volume(ctx, 3, -40, 18, 44, col, .3, -.25), INK, 2.2);
    // Vùng cổ xanh đọt
    ctx.save();
    ellipse(ctx, 0, -80, 14, 5.5, volume(ctx, 0, -80, 14, 5.5, '#b8e282', .3, -.2), null);
    ctx.restore();
    // Vệt bóng sáng trắng trong suốt
    ellipse(ctx, -6, -52, 3.8, 18, 'rgba(255,255,255,.6)', null, 1, .1);
    // Lá nhỏ ở đỉnh
    leaf(ctx, -4, -86, 0.45, -0.6, '#569e34');
    leaf(ctx, 5, -87, 0.5, 0.5, '#569e34');
  }
  function drawRadishSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 6, -42, 10, 28, '#ffffff', null);
    // Tia nước trong veo tỏa ra từ tâm
    ellipse(ctx, side * 5, -42, 6, 20, '#f0f6fa', null);
    for (let i = -3; i <= 3; i++) {
      line(ctx, [[side * 5, -42], [side * 5 + i * 2, -42 + i * 6]], '#d6eaf4', 1.1);
    }
  }

  // 2.7 BEET (Củ dền)
  function drawBeetBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('beet', s.growth ?? 1);
    // Củ tròn đỏ tía có rễ đuôi nhọn
    ellipse(ctx, 0, -38, 26, 26, volume(ctx, 4, -38, 26, 26, col, .35, -.25), INK, 2.2);
    // Rễ đuôi ngoằn ngoèo
    path(ctx, 'M 0 -12 Q 2 -2 1 6 Q 0 12 -2 18', null, INK, 3.2);
    path(ctx, 'M 0 -12 Q 2 -2 1 6 Q 0 12 -2 18', null, col, 1.8);
    // Cuống lá đỏ tía ở đỉnh
    path(ctx, 'M -5 -62 L -8 -74', null, INK, 3.6); path(ctx, 'M -5 -62 L -8 -74', null, '#a62446', 2.2);
    path(ctx, 'M 4 -62 L 7 -76', null, INK, 3.6); path(ctx, 'M 4 -62 L 7 -76', null, '#a62446', 2.2);
    leaf(ctx, -9, -76, 0.45, -0.5, '#488c38');
    leaf(ctx, 9, -78, 0.48, 0.4, '#488c38');
    ellipse(ctx, -9, -48, 4.5, 10, 'rgba(255,255,255,.4)', null, 1, .2);
  }
  function drawBeetSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -38, 13, 20, '#9e183a', null);
    // Vòng tròn đồng tâm đỏ tía đậm nhạt
    ellipse(ctx, side * 6, -38, 10, 16, '#c42850', null);
    ellipse(ctx, side * 6, -38, 7, 12, '#881230', null);
    ellipse(ctx, side * 6, -38, 4, 7, '#d6345e', null);
  }

  // 2.8 ONION (Hành tây)
  function drawOnionBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('onion', s.growth ?? 1);
    // Củ tròn vai, chóp thắt nhọn, rễ nhỏ ở đáy
    const d = 'M 0 -76 C 10 -76 28 -56 28 -36 C 28 -14 16 0 0 0 C -16 0 -28 -14 -28 -36 C -28 -56 -10 -76 0 -76 Z';
    path(ctx, d, volume(ctx, 4, -36, 28, 38, col, .35, -.25), INK, 2.2);
    // Gân sọc dọc vỏ lụa vàng đồng
    ctx.save(); ctx.globalAlpha *= .45;
    for (let i = -3; i <= 3; i++) {
      const u = i / 3;
      path(ctx, `M 0 -74 Q ${u * 32} -36 ${u * 14} -2`, null, tone(col, -.35), 1.2);
    }
    ctx.restore();
    // Chóp cuống khô ở đỉnh
    path(ctx, 'M 0 -74 L 0 -84', null, INK, 3.8); path(ctx, 'M 0 -74 L 0 -84', null, '#ab7232', 2.2);
    ellipse(ctx, -9, -48, 4.5, 12, 'rgba(255,255,255,.45)', null, 1, .25);
  }
  function drawOnionSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -36, 14, 24, '#fdfbf0', null);
    // Các lớp bẹ đồng tâm mọng nước
    for (let r = 4; r >= 1; r--) {
      ellipse(ctx, side * 6, -36, r * 3, r * 5, r % 2 ? '#ebf6e6' : '#ffffff', tone('#a8d298', -.1), 1.1);
    }
  }

  // 2.9 GARLIC (Tỏi)
  function drawGarlicBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('garlic', s.growth ?? 1);
    // Củ chia múi rõ rệt, thắt cổ nhọn
    ctx.save();
    // Các tép tỏi xếp tròn
    for (const sx of [-16, 16, -9, 9, 0]) {
      const w = sx === 0 ? 14 : 11, h = sx === 0 ? 28 : 25;
      ellipse(ctx, sx, -34, w, h, volume(ctx, sx + 2, -34, w, h, col, .3, -.2), INK, 1.8);
    }
    ctx.restore();
    // Chóp cuống khô
    path(ctx, 'M 0 -60 L 0 -74', null, INK, 3.8); path(ctx, 'M 0 -60 L 0 -74', null, '#d8caa8', 2.2);
    // Vệt phớt tím nhẹ trên vỏ lụa
    ctx.save(); ctx.globalAlpha *= .3;
    ellipse(ctx, 6, -42, 6, 12, '#ab68a8', null, 1, 0.2);
    ctx.restore();
  }
  function drawGarlicSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -34, 13, 21, '#ffffff', null);
    // Các múi tỏi cắt ngang hình trăng khuyết
    for (let i = 0; i < 4; i++) {
      const y = -46 + i * 8;
      ellipse(ctx, side * (5 + (i % 2) * 2), y, 4.5, 3.5, '#fefdee', '#d8ceb0', 1);
    }
  }

  // 2.10 GINGER (Gừng)
  function drawGingerBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('ginger', s.growth ?? 1);
    // Thân củ nhánh gồ ghề: củ mẹ ở giữa, hai nhánh con chìa sang hai bên
    ctx.save();
    // Nhánh trái
    ellipse(ctx, -18, -44, 11, 14, volume(ctx, -16, -44, 11, 14, col, .3, -.2), INK, 1.8, -0.3);
    // Nhánh phải
    ellipse(ctx, 18, -38, 12, 16, volume(ctx, 20, -38, 12, 16, col, .3, -.2), INK, 1.8, 0.35);
    // Củ chính giữa
    ellipse(ctx, 0, -36, 16, 24, volume(ctx, 2, -36, 16, 24, col, .35, -.25), INK, 2.2);
    // Các ngấn củ gừng đặc trưng ở từng nhánh
    for (const [gx, gy, gr] of [[0, -48, 12], [0, -36, 15], [0, -24, 13], [-18, -48, 8], [-18, -40, 9], [18, -42, 10], [18, -32, 10]]) {
      path(ctx, `M ${gx - gr} ${gy} Q ${gx} ${gy + 2} ${gx + gr} ${gy}`, null, tone(col, -.38), 1.4);
    }
    ctx.restore();
    ellipse(ctx, -4, -46, 3.5, 10, 'rgba(255,255,255,.35)', null, 1, .15);
  }
  function drawGingerSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -36, 14, 22, '#fff1a8', null);
    // Lõi xơ vàng cay nồng
    ellipse(ctx, side * 6, -36, 9, 16, '#fae478', null);
    path(ctx, `M ${side * 4} -46 Q ${side * 8} -36 ${side * 5} -26`, null, '#d4ba48', 1.2);
  }

  // 2.11 CAULIFLOWER (Súp lơ trắng)
  function drawCauliflowerBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('cauliflower', s.growth ?? 1);
    // Lá bao xanh ở đáy
    ctx.save();
    for (const [lx, ly, rot] of [[-18, -26, -0.6], [18, -26, 0.6], [-10, -18, -0.3], [10, -18, 0.3]]) {
      leaf(ctx, lx, ly, 0.65, rot, '#589e3a');
    }
    ctx.restore();
    // Bông súp lơ cuộn từng cụm bồng bềnh
    const curds = [[0, -42, 24, 20], [-14, -48, 12, 12], [14, -48, 12, 12], [0, -56, 13, 11], [-16, -34, 11, 11], [16, -34, 11, 11]];
    for (const [cx, cy, rx, ry] of curds) {
      ellipse(ctx, cx, cy, rx, ry, volume(ctx, cx + 2, cy, rx, ry, col, .35, -.2), INK, 1.8);
      // Kết cấu hạt lấm tấm nhẹ
      ellipse(ctx, cx - 2, cy - 2, rx * 0.7, ry * 0.7, tone(col, .1), null);
    }
    ellipse(ctx, -8, -50, 4, 8, 'rgba(255,255,255,.5)', null, 1, .2);
  }
  function drawCauliflowerSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -40, 14, 22, '#fbf8ee', null);
    // Cuống trắng phân nhánh lên các chùm hoa
    path(ctx, `M ${side * 3} -20 L ${side * 5} -38 L ${side * 2} -50`, null, '#d8e8cc', 3.2);
    path(ctx, `M ${side * 5} -38 L ${side * 9} -46`, null, '#d8e8cc', 2.2);
  }

  // 2.12 BROCCOLI (Súp lơ xanh)
  function drawBroccoliBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('broccoli', s.growth ?? 1);
    // Thân cọng xanh nhạt ở gốc
    path(ctx, 'M -8 -10 L -6 -32 L 6 -32 L 8 -10 Z', volume(ctx, 0, -20, 10, 12, '#88c872'), INK, 1.8);
    // Tán bông xanh lục sẫm chia chùm tròn trịa
    const clusters = [[0, -44, 24, 18], [-14, -48, 13, 12], [14, -48, 13, 12], [0, -58, 14, 11], [-16, -36, 11, 11], [16, -36, 11, 11]];
    for (const [cx, cy, rx, ry] of clusters) {
      ellipse(ctx, cx, cy, rx, ry, volume(ctx, cx + 2, cy, rx, ry, col, .4, -.2), INK, 1.8);
      // Hạt li ti đầu bông
      ellipse(ctx, cx - 2, cy - 2, rx * 0.75, ry * 0.75, tone(col, .12), null);
    }
    // Lá nhỏ ở gốc cuống
    leaf(ctx, -9, -24, 0.45, -0.7, '#4e9a38');
    leaf(ctx, 9, -24, 0.45, 0.7, '#4e9a38');
  }
  function drawBroccoliSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -42, 14, 22, '#52a644', null);
    // Nhánh cọng xanh nhạt tỏa lên
    path(ctx, `M ${side * 3} -22 L ${side * 5} -38 L ${side * 2} -52`, null, '#a6e290', 3.4);
    path(ctx, `M ${side * 5} -38 L ${side * 9} -48`, null, '#a6e290', 2.4);
  }

  // 2.13 OKRA (Đậu bắp)
  function drawOkraBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('okra', s.growth ?? 1);
    // Quả 5 khía thon dài, chóp nhọn, đài ở cuống
    const d = 'M 0 -84 C 11 -84 14 -58 12 -30 C 10 -10 4 2 0 6 C -4 2 -10 -10 -12 -30 C -14 -58 -11 -84 0 -84 Z';
    path(ctx, d, volume(ctx, 2, -38, 14, 44, col, .35, -.25), INK, 2.2);
    // Các đường khía múi dọc thân
    ctx.save();
    for (const side of [-1, 1]) {
      path(ctx, `M ${side * 2} -82 Q ${side * 8} -36 0 4`, null, tone(col, -.28), 1.4);
    }
    ctx.restore();
    // Đài và cuống xanh
    path(ctx, 'M -8 -82 L 8 -82 L 0 -88 Z', volume(ctx, 0, -84, 8, 4, '#4a8e32'), INK, 1.4);
    path(ctx, 'M 0 -86 L 0 -94', null, INK, 4); path(ctx, 'M 0 -86 L 0 -94', null, '#589e3a', 2.2);
    ellipse(ctx, -4, -50, 2.5, 14, 'rgba(255,255,255,.45)', null, 1, .1);
  }
  function drawOkraSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 5, -40, 8, 28, '#70be52', null);
    // Hạt đậu bắp tròn xếp dọc ruột
    for (let i = 0; i < 5; i++) {
      const y = -56 + i * 8;
      ellipse(ctx, side * 4.5, y, 2.4, 2.4, '#fafbf0', '#4a8e32', 0.8);
    }
  }

  // 2.14 CHILI (Ớt chỉ thiên)
  function drawChiliBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('chili', s.growth ?? 1);
    // Thon nhỏ, đỏ tươi, hơi cong duyên dáng (khác hẳn ớt chuông pepper to bè)
    const d = 'M -2 -80 C 8 -80 12 -58 9 -32 C 7 -10 3 0 0 4 C -3 0 -5 -12 -5 -34 C -6 -60 -4 -80 -2 -80 Z';
    path(ctx, d, volume(ctx, 2, -38, 10, 42, col, .35, -.25), INK, 2.2);
    // Vệt sáng bóng loáng căng mọng
    ellipse(ctx, -2, -50, 2, 15, 'rgba(255,255,255,.6)', null, 1, .12);
    // Tai đài xanh 5 răng cưa và cuống cong dài
    let cap = 'M -6 -78';
    for (let i = 0; i <= 4; i++) cap += ` L ${-6 + i * 3} ${i % 2 ? -72 : -80}`;
    path(ctx, cap + ' Z', '#469634', INK, 1.2);
    path(ctx, 'M 0 -80 Q 2 -92 10 -98', null, INK, 4.2);
    path(ctx, 'M 0 -80 Q 2 -92 10 -98', null, '#58a83e', 2.4);
  }
  function drawChiliSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 4.5, -40, 6, 26, '#c42020', null);
    // Ruột rỗng và các hạt ớt vàng nhỏ li ti
    for (let i = 0; i < 4; i++) {
      const y = -52 + i * 8;
      ellipse(ctx, side * 4, y, 1.6, 2.2, '#fff4b8', '#8a1818', 0.6);
    }
  }

  // 2.15 MUSHROOM (Nấm rơm)
  function drawMushroomBody(ctx, s, body, t) {
    const col = s.style?.body || vegRipenColor('mushroom', s.growth ?? 1);
    // Chân nấm mập trắng ngà
    path(ctx, 'M -8 -8 C -10 -24 -7 -40 -6 -48 L 6 -48 C 7 -40 10 -24 8 -8 Z', volume(ctx, 0, -28, 9, 20, '#fbf8ee'), INK, 2);
    // Mũ nấm hình chuông / vòm tròn che rủ
    const d = 'M 0 -72 C 24 -72 30 -58 26 -44 C 20 -44 14 -42 0 -42 C -14 -42 -20 -44 -26 -44 C -30 -58 -24 -72 0 -72 Z';
    path(ctx, d, volume(ctx, 3, -56, 28, 18, col, .35, -.25), INK, 2.2);
    ellipse(ctx, -8, -62, 5, 6, 'rgba(255,255,255,.45)', null, 1, .3);
  }
  function drawMushroomSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 6, -32, 10, 24, '#ffffff', null);
    // Mặt cắt nấm với các tia mang nấm nâu dưới mũ
    path(ctx, `M ${side * 2} -42 L ${side * 10} -44`, null, '#5a3824', 2.2);
    for (let i = 0; i < 5; i++) {
      const x = side * (3 + i * 1.5);
      line(ctx, [[x, -43], [x, -48]], '#82563a', 1.1);
    }
  }

  // -------------------------------------------------------------
  // 3. THÔNG SỐ TAY CHÂN CHO 15 RAU CỦ (FRUIT_LIMBS)
  // -------------------------------------------------------------
  const VEG_LIMBS = {
    kohlrabi: { hip: 14, hipY: -6, arm: 28, armY: -38 , limbColor: '#6f9a3a' },
    potato: { hip: 15, hipY: -6, arm: 28, armY: -36 , limbColor: '#7a5a34' },
    sweet_potato: { hip: 12, hipY: -6, arm: 25, armY: -38 , limbColor: '#7d3346' },
    cassava: { hip: 11, hipY: -6, arm: 22, armY: -42 , limbColor: '#5b4028' },
    taro: { hip: 14, hipY: -6, arm: 26, armY: -36 , limbColor: '#5d4d44' },
    radish: { hip: 12, hipY: -6, arm: 22, armY: -46 , limbColor: '#7da04c' },
    beet: { hip: 14, hipY: -6, arm: 26, armY: -36 , limbColor: '#6d1f33' },
    onion: { hip: 15, hipY: -6, arm: 27, armY: -36 , limbColor: '#9a6a2a' },
    garlic: { hip: 14, hipY: -6, arm: 25, armY: -36 , limbColor: '#8e8e78' },
    ginger: { hip: 16, hipY: -6, arm: 30, armY: -34 , limbColor: '#8a6a3a' },
    cauliflower: { hip: 16, hipY: -6, arm: 32, armY: -38 , limbColor: '#5f8f3c' },
    broccoli: { hip: 14, hipY: -6, arm: 30, armY: -40 , limbColor: '#3f6f2a' },
    okra: { hip: 10, hipY: -6, arm: 18, armY: -46 , limbColor: '#4f7a2e' },
    chili: { hip: 9, hipY: -6, arm: 17, armY: -45 , limbColor: '#8e1f1f' },
    mushroom: { hip: 12, hipY: -6, arm: 24, armY: -32 , limbColor: '#8a6f55' },
  };

  // -------------------------------------------------------------
  // 4. TEMPLATE CHUNG CHO CÂY TRỒNG TRONG ĐẤT: drawRootCrop
  // -------------------------------------------------------------

  // Hệ số co của phần trên mặt đất (plantPoint trong lõi):
  // y < 0 co theo (0.7 + 0.3 * g) * (1 - 0.68 * bend); x co theo (1 + bend * 0.25).
  function plantScale(s) {
    const bend = s.bend || 0, g = clamp(s.growth ?? 1);
    return [1 + bend * 0.25, (0.7 + 0.3 * g) * (1 - 0.68 * bend)];
  }

  function drawRootCrop(ctx, s, t, spec) {
    const g = clamp(s.growth ?? 1);
    const seed = hash(s.id);
    const shown = clamp(Math.max(s.roots || 0, s.cutaway || 0, (s.lift || 0) / 40));

    // A. PHẦN TRÊN MẶT ĐẤT (y <= 0)
    // Tự động co giãn theo growthScale giống hệt plantPoint
    ctx.save();
    const [xs, ys] = plantScale(s);
    ctx.scale(xs, ys);

    const leafColor = s.style?.leaf || spec.leafColor || '#4e9a38';
    const lType = spec.leafType;

    if (g < 0.25) {
      // Giai đoạn cây con: mầm non mọc thẳng với 2 lá mầm nhỏ xinh
      const p = g / 0.25;
      const sh = -10 - p * 22;
      path(ctx, `M 0 0 Q 1 ${sh * 0.5} 0 ${sh}`, null, INK, 3.2);
      path(ctx, `M 0 0 Q 1 ${sh * 0.5} 0 ${sh}`, null, '#6eb248', 1.8);
      leaf(ctx, -5, sh + 4, 0.35 + p * 0.15, -0.8, leafColor);
      leaf(ctx, 5, sh + 4, 0.35 + p * 0.15, 0.8, leafColor);
    } else {
      // Cây trưởng thành: vẽ theo từng kiểu lá spec.leafType (luôn giữ toạ độ y <= 0)
      if (lType === 'kohlrabi_sprout') {
        // Củ su hào nằm trên mặt đất
        const cy = spec.tuberY; // e.g. -22
        ellipse(ctx, 0, cy, 26, 24, volume(ctx, 4, cy, 26, 24, spec.tuberColor, .35, -.25), INK, 2.2);
        // Các cuống lá mọc tủa lên từ củ
        for (let i = 0; i < 5; i++) {
          const ang = -1.1 + i * 0.55;
          const tx = Math.cos(ang - Math.PI / 2) * 36, ty = cy - 14 + Math.sin(ang - Math.PI / 2) * 38;
          path(ctx, `M 0 ${cy - 8} Q ${tx * 0.4} ${cy - 24} ${tx} ${ty}`, null, INK, 3.6);
          path(ctx, `M 0 ${cy - 8} Q ${tx * 0.4} ${cy - 24} ${tx} ${ty}`, null, '#6cb042', 2.2);
          leaf(ctx, tx, ty, 0.55, ang, leafColor);
        }
      } else if (lType === 'brassica_leaves') {
        const cy = spec.tuberY;
        if (spec.tuber === 'curd' && spec.head === 'broccoli') {
          // Bông cải xanh: thân mập nhạt màu mọc từ đất, lá tách ra ở gốc, bông nhiều nụ trên đỉnh thân
          for (const [side, lx, ly] of [[-1, -30, -30], [1, 30, -28], [-1, -22, -12], [1, 22, -10]]) {
            path(ctx, `M 0 -4 Q ${lx * 0.5} ${ly + 6} ${lx} ${ly}`, null, INK, 3.4);
            path(ctx, `M 0 -4 Q ${lx * 0.5} ${ly + 6} ${lx} ${ly}`, null, '#8cc06a', 2.0);
            leaf(ctx, lx, ly, 0.6, side * 1.0, leafColor);
          }
          path(ctx, `M -7 0 L -6 ${cy + 12} L 6 ${cy + 12} L 7 0 Z`, cylinder(ctx, -7, 7, '#9ccf78'), INK, 1.8);
          const florets = [[-15, cy + 4, 9], [15, cy + 4, 9], [-8, cy - 8, 10], [8, cy - 8, 10], [0, cy + 2, 11], [0, cy - 16, 8], [-18, cy - 6, 7], [18, cy - 6, 7]];
          for (const [fx, fy, r] of florets) ellipse(ctx, fx, fy, r, r * 0.9, volume(ctx, fx, fy, r, r * 0.9, spec.tuberColor, .35, -.3), INK, 1.4);
          for (const [fx, fy, r] of florets) for (let k = 0; k < 3; k++) ellipse(ctx, fx + Math.cos(k * 2.1) * r * 0.45, fy + Math.sin(k * 2.1) * r * 0.4, 1.4, 1.4, tone(spec.tuberColor, -.25), null);
        } else {
          // Súp lơ trắng: bông nằm thấp, lá bao to mọc từ gốc vươn cao hai bên và ôm phía trước
          for (const side of [-1, 1]) for (const [lx, ly, s] of [[34, cy - 22, 0.95], [26, cy - 34, 0.8]]) {
            path(ctx, `M ${side * 4} -2 Q ${side * lx * 0.8} ${cy + 10} ${side * lx} ${ly}`, null, INK, 4.2);
            path(ctx, `M ${side * 4} -2 Q ${side * lx * 0.8} ${cy + 10} ${side * lx} ${ly}`, null, '#b7d99a', 2.6);
            leaf(ctx, side * lx, ly, s, side * 0.35, leafColor);
          }
          const curd = [[-12, cy + 2, 11], [12, cy + 2, 11], [0, cy - 6, 13], [-6, cy + 8, 9], [6, cy + 8, 9], [-16, cy - 6, 8], [16, cy - 6, 8]];
          for (const [fx, fy, r] of curd) ellipse(ctx, fx, fy, r, r * 0.85, volume(ctx, fx, fy, r, r * 0.85, spec.tuberColor, .3, -.18), INK, 1.3);
          // Lá bao phía trước che đáy bông
          for (const side of [-1, 1]) path(ctx, `M ${side * 2} -1 Q ${side * 30} ${cy + 22} ${side * 28} ${cy + 6} Q ${side * 16} ${cy + 16} ${side * 2} -1 Z`, volume(ctx, side * 18, cy + 14, 14, 10, leafColor), INK, 1.6);
        }
      } else if (lType === 'compound' || lType === 'potato_leaf') {
        // Lá khoai tây / khoai lang: nhiều nhánh lá kép tỏa ra từ thân gốc
        for (let i = 0; i < 7; i++) {
          const ang = -1.2 + i * 0.4;
          const len = 34 + (i % 3) * 10;
          const tx = Math.cos(ang - Math.PI / 2) * len, ty = -6 + Math.sin(ang - Math.PI / 2) * len;
          path(ctx, `M 0 0 Q ${tx * 0.4} ${ty * 0.6} ${tx} ${ty}`, null, INK, 3.4);
          path(ctx, `M 0 0 Q ${tx * 0.4} ${ty * 0.6} ${tx} ${ty}`, null, '#4fa036', 2.0);
          leaf(ctx, tx, ty, 0.6, ang, leafColor);
          leaf(ctx, tx * 0.6, ty * 0.6, 0.45, ang + (i % 2 ? 0.4 : -0.4), leafColor);
        }
      } else if (lType === 'palmate') {
        // Khoai mì: thân cao, lá xòe hình chân vịt 5-7 thuỳ
        path(ctx, 'M 0 0 L 0 -55', null, INK, 4.4);
        path(ctx, 'M 0 0 L 0 -55', null, '#7e5a3c', 2.6);
        for (let i = 0; i < 5; i++) {
          const ang = -1.2 + i * 0.6;
          const tx = Math.cos(ang - Math.PI / 2) * 28, ty = -55 + Math.sin(ang - Math.PI / 2) * 28;
          line(ctx, [[0, -55], [tx, ty]], INK, 2.8);
          line(ctx, [[0, -55], [tx, ty]], '#4e9a34', 1.6);
          leaf(ctx, tx, ty, 0.55, ang, leafColor);
        }
      } else if (lType === 'elephant_ear' || lType === 'heart_vine') {
        // Khoai môn: cuống dài lá to hình tim/tai voi
        for (let i = 0; i < 5; i++) {
          const ang = -0.9 + i * 0.45;
          const len = 42 + (i % 2) * 14;
          const tx = Math.cos(ang - Math.PI / 2) * len, ty = -4 + Math.sin(ang - Math.PI / 2) * len;
          path(ctx, `M 0 0 Q ${tx * 0.3} ${ty * 0.7} ${tx} ${ty}`, null, INK, 3.8);
          path(ctx, `M 0 0 Q ${tx * 0.3} ${ty * 0.7} ${tx} ${ty}`, null, '#549c36', 2.2);
          leaf(ctx, tx, ty, 0.85, ang, leafColor);
        }
      } else if (lType === 'frilly' || lType === 'beet_leaf') {
        // Củ cải, củ dền: chùm lá xoăn khía mọc thành hoa thị từ cổ rễ
        for (let i = 0; i < 6; i++) {
          const ang = -1.1 + i * 0.44;
          const tx = Math.cos(ang - Math.PI / 2) * 36, ty = -4 + Math.sin(ang - Math.PI / 2) * 44;
          path(ctx, `M 0 0 Q ${tx * 0.5} ${ty * 0.6} ${tx} ${ty}`, null, INK, 3.4);
          path(ctx, `M 0 0 Q ${tx * 0.5} ${ty * 0.6} ${tx} ${ty}`, null, spec.veinColor || '#529e36', 2.0);
          leaf(ctx, tx, ty, 0.65, ang, leafColor);
          leaf(ctx, tx * 0.65, ty * 0.65, 0.48, ang + (i % 2 ? 0.3 : -0.3), leafColor);
        }
      } else if (lType === 'strappy') {
        // Hành củ: lá ống to, xanh xám, ngọn cong rủ ra ngoài; cổ củ phồng nhẹ trên đất
        ellipse(ctx, 0, -5, 7, 6, volume(ctx, 0, -5, 7, 6, '#d9b98a'), INK, 1.3);
        for (let i = -2; i <= 2; i++) {
          const h = -52 - (2 - Math.abs(i)) * 8, tipX = i * 14 + (i === 0 ? 6 : 0), tipY = h + Math.abs(i) * 10;
          path(ctx, `M ${i * 2} -8 Q ${i * 3} ${h * 0.6} ${i * 6} ${h} Q ${tipX * 0.8} ${h - 6} ${tipX} ${tipY}`, null, INK, 4.6);
          path(ctx, `M ${i * 2} -8 Q ${i * 3} ${h * 0.6} ${i * 6} ${h} Q ${tipX * 0.8} ${h - 6} ${tipX} ${tipY}`, null, leafColor, 3.0);
        }
      } else if (lType === 'flat_strappy') {
        // Tỏi: lá dẹt bản rộng, xoè chữ V so le hai bên thân giả
        path(ctx, 'M -3 0 L -2 -20 L 2 -20 L 3 0 Z', cylinder(ctx, -3, 3, '#e8e4d0'), INK, 1.2);
        for (let k = 0; k < 6; k++) {
          const side = k % 2 ? 1 : -1, by = -8 - k * 6, len = 34 - k * 2;
          const tip = [side * (18 + k * 2), by - len];
          path(ctx, `M 0 ${by} Q ${side * 6} ${by - len * 0.5} ${tip[0]} ${tip[1]} Q ${side * 2} ${by - len * 0.45} 0 ${by - 4} Z`, volume(ctx, tip[0] / 2, by - len / 2, 6, len / 2, tone(leafColor, (k % 3) * 0.05)), INK, 1.2);
        }
      } else if (lType === 'spring_onion_cluster') {
        // Hành lá: bó nhiều cọng mảnh thẳng xanh tươi, phần thân trắng lộ trên đất
        for (let i = -4; i <= 4; i++) {
          const x0 = i * 2.2, h = -58 - (4 - Math.abs(i)) * 3;
          path(ctx, `M ${x0} 0 L ${x0} -14`, null, INK, 3.4);
          path(ctx, `M ${x0} 0 L ${x0} -14`, null, '#f4f4ea', 2.0);
          path(ctx, `M ${x0} -14 Q ${x0 + i * 0.5} ${h * 0.6} ${x0 + i * 2.4} ${h}`, null, INK, 3.0);
          path(ctx, `M ${x0} -14 Q ${x0 + i * 0.5} ${h * 0.6} ${x0 + i * 2.4} ${h}`, null, leafColor, 1.8);
        }

      } else if (lType === 'ginger_spear') {
        // Gừng: thân mảnh nhiều lá mũi mác so le
        for (const side of [-1, 1]) {
          const bx = side * 6;
          path(ctx, `M 0 0 Q ${bx} -25 ${side * 14} -52`, null, INK, 3.6);
          path(ctx, `M 0 0 Q ${bx} -25 ${side * 14} -52`, null, '#549c36', 2.2);
          for (let k = 0; k < 4; k++) {
            const ly = -16 - k * 10, lx = bx + (k % 2 ? -4 : 4);
            leaf(ctx, lx, ly, 0.45, side * 0.7, leafColor);
          }
        }
      } else if (lType === 'rosette_crinkled') {
        // Xà lách: hoa thị lá xoăn mở, thấp, xanh nhạt, tim non ở giữa
        for (let i = 0; i < 11; i++) {
          const a = -Math.PI + (i + 0.5) * (Math.PI / 11);
          const len = 34 + (i % 3) * 6, lx = Math.cos(a) * len, ly = Math.min(-3, Math.sin(a) * len * 0.9 - 6);
          let d = `M 0 -3`;
          for (let k = 0; k <= 6; k++) {
            const u = k / 6, w = Math.sin(u * Math.PI) * 12 + (k % 2 ? 3 : 0);
            const px = lx * u - Math.sin(a) * w, py = Math.min(0, (ly + 3) * u - 3 + Math.cos(a) * w);
            d += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
          }
          d += ` L ${lx.toFixed(1)} ${ly.toFixed(1)}`;
          for (let k = 6; k >= 0; k--) {
            const u = k / 6, w = Math.sin(u * Math.PI) * 12 + (k % 2 ? 3 : 0);
            const px = lx * u + Math.sin(a) * w, py = Math.min(0, (ly + 3) * u - 3 - Math.cos(a) * w);
            d += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
          }
          path(ctx, d + ' Z', volume(ctx, lx * 0.5, ly * 0.5 - 4, 16, 12, tone(leafColor, (i % 3) * 0.05), .35, -.2), INK, 1.3);
          line(ctx, [[0, -3], [lx * 0.8, ly * 0.8]], '#d6f0b8', 1.2);
        }
        ellipse(ctx, 0, -18, 14, 15, volume(ctx, 0, -18, 14, 15, tone(leafColor, 0.25), .4, -.1), INK, 1.4);
      } else if (lType === 'napa_head') {
        // Cải thảo: bắp dài dựng đứng, bẹ trắng gân rõ, ngọn lá xanh xoăn
        const cy = spec.tuberY, rx = 17, ry = 30;
        ellipse(ctx, 0, cy, rx, ry, volume(ctx, 0, cy, rx, ry, '#eef6d8', .35, -.15), INK, 2.0);
        for (const x of [-9, 0, 9]) path(ctx, `M ${x * 0.6} ${cy + ry - 2} Q ${x} ${cy} ${x * 1.1} ${cy - ry + 10}`, null, '#ffffff', 2.4);
        path(ctx, `M -16 ${cy - ry + 12} Q -8 ${cy - ry - 8} 0 ${cy - ry + 2} Q 8 ${cy - ry - 8} 16 ${cy - ry + 12} Q 10 ${cy - ry + 20} 0 ${cy - ry + 14} Q -10 ${cy - ry + 20} -16 ${cy - ry + 12} Z`, volume(ctx, 0, cy - ry + 6, 16, 10, leafColor), INK, 1.6);
        for (const side of [-1, 1]) path(ctx, `M ${side * 4} 0 Q ${side * 26} ${cy + 6} ${side * 20} ${cy - 18} Q ${side * 12} ${cy} ${side * 4} 0 Z`, volume(ctx, side * 16, cy, 10, 18, tone(leafColor, -0.08)), INK, 1.5);
      } else if (lType === 'mustard_leaf') {
        // Cải bẹ xanh: lá to đứng thẳng, xanh đậm, mép xoăn, cuống bẹ nhạt
        for (let i = 0; i < 5; i++) {
          const a = -0.75 + i * 0.375, len = 50 + (i === 2 ? 10 : 0) - Math.abs(i - 2) * 4;
          ctx.save(); ctx.rotate(a);
          let d = 'M -3 -2';
          for (let k = 1; k <= 7; k++) d += ` L ${(-4 - Math.sin(k / 7 * Math.PI) * 12 - (k % 2 ? 2 : 0)).toFixed(1)} ${(-k / 7 * len).toFixed(1)}`;
          for (let k = 7; k >= 1; k--) d += ` L ${(4 + Math.sin(k / 7 * Math.PI) * 12 + (k % 2 ? 2 : 0)).toFixed(1)} ${(-k / 7 * len).toFixed(1)}`;
          path(ctx, d + ' L 3 -2 Z', volume(ctx, 0, -len / 2, 14, len / 2, tone(leafColor, -0.12 + (i % 2) * 0.06), .3, -.25), INK, 1.4);
          line(ctx, [[0, -2], [0, -len * 0.9]], '#d7ecc0', 2.2);
          ctx.restore();
        }
      } else if (lType === 'hollow_vine') {
        // Rau muống: nhiều cọng mềm vươn cao với lá hình mũi tên
        for (let i = -3; i <= 3; i++) {
          const tx = i * 11, ty = -42 - Math.abs(i) * 5;
          path(ctx, `M ${i * 2} 0 Q ${tx * 0.4} ${ty * 0.5} ${tx} ${ty}`, null, INK, 3.2);
          path(ctx, `M ${i * 2} 0 Q ${tx * 0.4} ${ty * 0.5} ${tx} ${ty}`, null, '#58ac3c', 1.8);
          leaf(ctx, tx, ty, 0.5, (i > 0 ? 0.4 : -0.4), leafColor);
        }
      } else if (lType === 'giant_frilly') {
        // Củ cải khổng lồ: tán lá cực lớn xòe rộng, vai củ to đội ngay mặt đất
        for (let i = 0; i < 9; i++) {
          const ang = -1.25 + i * 0.31;
          const len = 50 + (i % 3) * 12;
          const tx = Math.cos(ang - Math.PI / 2) * len, ty = -8 + Math.sin(ang - Math.PI / 2) * len;
          path(ctx, `M 0 -6 Q ${tx * 0.4} ${ty * 0.6} ${tx} ${ty}`, null, INK, 4.4);
          path(ctx, `M 0 -6 Q ${tx * 0.4} ${ty * 0.6} ${tx} ${ty}`, null, '#4da834', 2.8);
          leaf(ctx, tx, ty, 0.85, ang, leafColor);
          leaf(ctx, tx * 0.6, ty * 0.6, 0.65, ang + (i % 2 ? 0.35 : -0.35), leafColor);
        }
      }
    }
    ctx.restore();

    // B. PHẦN DƯỚI MẶT ĐẤT (y > 0)
    // CHỈ VẼ khi shown > 0 (roots > 0 hoặc cutaway > 0).
    // Ở roots=0 và cutaway=0, TUYỆT ĐỐI không gọi lệnh vẽ nào ở vùng y > 4!
    if (shown > 0.001) {
      ctx.save();
      ctx.globalAlpha *= shown;

      if (spec.underground) {
        // Củ nằm dưới mặt đất: tâm củ đúng tại spec.tuberY (y > 0), không co theo growth
        const cy = spec.tuberY;
        const tw = spec.tuberWidth * (0.5 + 0.5 * g);
        const th = spec.tuberHeight * (0.5 + 0.5 * g);
        const tShape = spec.tuber;
        const tCol = spec.tuberColor;

        if (tShape === 'spindle') {
          // Khoai lang / khoai mì: củ thoi thuôn dài
          ellipse(ctx, 0, cy, tw, th, volume(ctx, 3, cy, tw, th, tCol, .35, -.25), INK, 2.0);
          // Rễ đuôi nhỏ bên dưới củ
          path(ctx, `M 0 ${cy + th} Q 2 ${cy + th + 10} -1 ${cy + th + 16}`, null, INK, 2.2);
          path(ctx, `M 0 ${cy + th} Q 2 ${cy + th + 10} -1 ${cy + th + 16}`, null, tone(tCol, -.2), 1.2);
        } else if (tShape === 'round' || tShape === 'layered_bulb') {
          // Củ tròn / củ dền / hành tỏi
          ellipse(ctx, 0, cy, tw, th, volume(ctx, 3, cy, tw, th, tCol, .35, -.25), INK, 2.0);
          // Rễ chùm đáy củ
          for (let r = -2; r <= 2; r++) {
            line(ctx, [[r * 4, cy + th * 0.9], [r * 7, cy + th * 0.9 + 12]], '#d4c898', 1.2);
          }
        } else if (tShape === 'tapered') {
          // Củ cải trắng / củ cải khổng lồ: củ thuôn vuốt dài đối xứng quanh cy = spec.tuberY
          const topY = cy - th, botY = cy + th;
          const d = `M 0 ${topY} C ${tw} ${topY + th * 0.25} ${tw * 0.85} ${cy} ${tw * 0.3} ${botY} C 0 ${botY + 6} 0 ${botY + 6} 0 ${botY + 6} C 0 ${botY + 6} -${tw * 0.3} ${botY} -${tw * 0.85} ${cy} C -${tw} ${topY + th * 0.25} 0 ${topY} 0 ${topY} Z`;
          path(ctx, d, volume(ctx, 3, cy, tw, th, tCol, .3, -.2), INK, 2.0);
          path(ctx, `M 0 ${botY + 4} Q 2 ${botY + 12} 0 ${botY + 20}`, null, '#d8e6c8', 1.4);
        } else if (tShape === 'knobby') {
          // Gừng: củ nhánh gồ ghề dưới đất đối xứng quanh cy
          ellipse(ctx, 0, cy, tw, th, volume(ctx, 2, cy, tw, th, tCol, .35, -.25), INK, 2.0);
          ellipse(ctx, -tw * 0.6, cy - 4, tw * 0.5, th * 0.6, volume(ctx, -tw * 0.6, cy - 4, tw * 0.5, th * 0.6, tCol), INK, 1.6);
          ellipse(ctx, tw * 0.6, cy + 2, tw * 0.55, th * 0.65, volume(ctx, tw * 0.6, cy + 2, tw * 0.55, th * 0.65, tCol), INK, 1.6);
        } else {
          // Oval (khoai tây)
          ellipse(ctx, 0, cy, tw, th, volume(ctx, 3, cy, tw, th, tCol, .35, -.25), INK, 2.0);
          for (const [dx, dy] of [[-tw * 0.7, cy + 4], [tw * 0.7, cy - 2]]) {
            ellipse(ctx, dx, dy, tw * 0.55, th * 0.6, volume(ctx, dx, dy, tw * 0.55, th * 0.6, tCol), INK, 1.6);
          }
        }
      } else {
        // Cây có củ trên đất hoặc rau lá: khi bật roots thì vẽ chùm rễ chùm tơ dưới đất (y > 4)
        for (let i = -3; i <= 3; i++) {
          const rx = i * 8, rlen = 16 + (3 - Math.abs(i)) * 6;
          line(ctx, [[0, 0], [rx * 1.2, rlen]], '#e2d8a8', 1.4);
        }
      }

      ctx.restore();
    }
  }

  // -------------------------------------------------------------
  // 5. THÔNG SỐ VÀ RIG CỦA 18 CÂY TRỒNG TRONG ĐẤT
  // -------------------------------------------------------------
  const ROOT_CROP_SPECS = {
    kohlrabi_plant: {
      underground: false, tuber: 'round', tuberColor: '#9ec87a', tuberY: -22,
      tuberWidth: 26, tuberHeight: 24, leafType: 'kohlrabi_sprout', leafColor: '#589e3a'
    },
    potato_plant: {
      underground: true, tuber: 'oval', tuberColor: '#c89f5e', tuberY: 24,
      tuberWidth: 20, tuberHeight: 14, leafType: 'potato_leaf', leafColor: '#428834'
    },
    sweet_potato_plant: {
      underground: true, tuber: 'spindle', tuberColor: '#a4344e', tuberY: 26,
      tuberWidth: 18, tuberHeight: 32, leafType: 'heart_vine', leafColor: '#549c36'
    },
    cassava_plant: {
      underground: true, tuber: 'spindle', tuberColor: '#6a4830', tuberY: 28,
      tuberWidth: 14, tuberHeight: 36, leafType: 'palmate', leafColor: '#3f8430'
    },
    taro_plant: {
      underground: true, tuber: 'round', tuberColor: '#786458', tuberY: 24,
      tuberWidth: 22, tuberHeight: 26, leafType: 'elephant_ear', leafColor: '#489638'
    },
    radish_plant: {
      underground: true, tuber: 'tapered', tuberColor: '#f2f5f8', tuberY: 24,
      tuberWidth: 16, tuberHeight: 34, leafType: 'frilly', leafColor: '#4ea036'
    },
    beet_plant: {
      underground: true, tuber: 'round', tuberColor: '#861e38', tuberY: 20,
      tuberWidth: 22, tuberHeight: 22, leafType: 'beet_leaf', leafColor: '#387830', veinColor: '#a42442'
    },
    onion_plant: {
      underground: true, tuber: 'layered_bulb', tuberColor: '#d48e3e', tuberY: 18,
      tuberWidth: 20, tuberHeight: 18, leafType: 'strappy', leafColor: '#4f8a6a'
    },
    garlic_plant: {
      underground: true, tuber: 'layered_bulb', tuberColor: '#f0eedc', tuberY: 18,
      tuberWidth: 18, tuberHeight: 18, leafType: 'flat_strappy', leafColor: '#7aa076'
    },
    ginger_plant: {
      underground: true, tuber: 'knobby', tuberColor: '#c49e5c', tuberY: 20,
      tuberWidth: 26, tuberHeight: 16, leafType: 'ginger_spear', leafColor: '#3e8832'
    },
    cauliflower_plant: {
      underground: false, tuber: 'curd', tuberColor: '#faf6ea', tuberY: -32,
      tuberWidth: 28, tuberHeight: 22, leafType: 'brassica_leaves', leafColor: '#4c9240'
    },
    broccoli_plant: {
      underground: false, tuber: 'curd', head: 'broccoli', tuberColor: '#3c8434', tuberY: -34,
      tuberWidth: 28, tuberHeight: 24, leafType: 'brassica_leaves', leafColor: '#488c3c'
    },
    lettuce: {
      underground: false, tuber: 'leafy_only', tuberColor: '#6ab446', tuberY: -16,
      tuberWidth: 28, tuberHeight: 20, leafType: 'rosette_crinkled', leafColor: '#8fd05a'
    },
    napa_cabbage: {
      underground: false, tuber: 'leafy_only', tuberColor: '#a4db82', tuberY: -26,
      tuberWidth: 24, tuberHeight: 34, leafType: 'napa_head', leafColor: '#74be50'
    },
    water_spinach: {
      underground: false, tuber: 'leafy_only', tuberColor: '#52a63e', tuberY: -20,
      tuberWidth: 24, tuberHeight: 28, leafType: 'hollow_vine', leafColor: '#52a63e'
    },
    mustard_greens: {
      underground: false, tuber: 'leafy_only', tuberColor: '#4fa436', tuberY: -22,
      tuberWidth: 26, tuberHeight: 30, leafType: 'mustard_leaf', leafColor: '#3a8a2e'
    },
    spring_onion: {
      underground: false, tuber: 'leafy_only', tuberColor: '#fbfbf2', tuberY: -14,
      tuberWidth: 12, tuberHeight: 18, leafType: 'spring_onion_cluster', leafColor: '#5cb83c'
    },
    giant_radish: {
      underground: true, tuber: 'tapered', tuberColor: '#f4f6fa', tuberY: 30,
      tuberWidth: 34, tuberHeight: 52, leafType: 'giant_frilly', leafColor: '#4aa234'
    }
  };

  // -------------------------------------------------------------
  // 6. HÌNH NỀN vegetable_rows (Theme: garden, ground_y: 810)
  // -------------------------------------------------------------
  function drawVegetableRows(ctx, settings, t, kit) {
    const W = 576, H = 1024, GY = 810;
    const isNight = settings.time === 'night';
    const isRain = settings.weather === 'rain' || settings.weather === 'storm';

    // Bầu trời nông trại
    const sky = ctx.createLinearGradient(0, 0, 0, GY);
    if (isNight) {
      sky.addColorStop(0, '#101626');
      sky.addColorStop(0.7, '#1e2638');
      sky.addColorStop(1, '#2c3548');
    } else if (isRain) {
      sky.addColorStop(0, '#8898a4');
      sky.addColorStop(0.7, '#9eb0be');
      sky.addColorStop(1, '#b6c6d0');
    } else {
      sky.addColorStop(0, '#78c6e6');
      sky.addColorStop(0.5, '#a4def2');
      sky.addColorStop(0.85, '#d8f2fa');
      sky.addColorStop(1, '#fcedc8');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GY);

    // Mặt trời / mặt trăng
    if (isNight) {
      ellipse(ctx, 450, 140, 26, 26, '#fcedc0', null);
      ellipse(ctx, 458, 134, 22, 22, '#1e2638', null);
    } else if (!isRain) {
      ellipse(ctx, 420, 160, 48, 48, 'rgba(255, 230, 140, 0.35)', null);
      ellipse(ctx, 420, 160, 26, 26, '#fff4b8', '#f8d050', 2);
    }

    // Mây trôi nhẹ
    ctx.save();
    const cloudCol = isNight ? 'rgba(40, 52, 74, 0.6)' : isRain ? 'rgba(140, 155, 165, 0.7)' : 'rgba(255, 255, 255, 0.85)';
    for (const [cx, cy, cr] of [[120, 180, 42], [160, 172, 54], [210, 182, 38], [340, 230, 36], [380, 220, 46], [420, 232, 32]]) {
      ellipse(ctx, cx, cy, cr, cr * 0.6, cloudCol, null);
    }
    ctx.restore();

    // Dãy đồi xa xôi và hàng cây rừng mờ ở chân trời
    const hillCol = isNight ? '#1c2836' : isRain ? '#6e828a' : '#88b694';
    path(ctx, `M 0 660 Q 140 620 290 650 Q 430 610 576 640 L 576 ${GY} L 0 ${GY} Z`, hillCol, null);
    const treeLineCol = isNight ? '#14202c' : isRain ? '#5a6e76' : '#568a62';
    path(ctx, `M 0 710 Q 120 680 250 705 Q 400 670 576 695 L 576 ${GY} L 0 ${GY} Z`, treeLineCol, null);

    // Hàng rào gỗ mờ ở ranh giới vườn
    ctx.save();
    const fenceCol = isNight ? '#2a3442' : '#8a6e50';
    line(ctx, [[0, 725], [576, 725]], fenceCol, 2.2);
    for (let i = 0; i < 18; i++) {
      const fx = 15 + i * 32;
      line(ctx, [[fx, 735], [fx, 715]], fenceCol, 2.4);
    }
    ctx.restore();

    // Mặt đất nền luống rau (từ GY 810 xuống đáy H 1024)
    const groundGrad = ctx.createLinearGradient(0, 720, 0, H);
    if (isNight) {
      groundGrad.addColorStop(0, '#22282e');
      groundGrad.addColorStop(0.3, '#1c2226');
      groundGrad.addColorStop(1, '#14181a');
    } else {
      groundGrad.addColorStop(0, '#785e42');
      groundGrad.addColorStop(0.3, '#5c442c');
      groundGrad.addColorStop(1, '#44321e');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, 720, W, H - 720);

    // CÁC LUỐNG RAU THẲNG HÀNG THEO PHỐI CẢNH (Linear Perspective Vegetable Beds)
    // Tâm tụ phối cảnh (vanishing point) ở giữa chân trời: VP = [288, 710]
    const VP = [288, 710];
    const beds = [
      { bx0: -60, bx1: 40, col: isNight ? '#1e241c' : '#427830', ridgeCol: isNight ? '#283024' : '#528e3a' },
      { bx0: 60, bx1: 170, col: isNight ? '#222a1e' : '#4a8234', ridgeCol: isNight ? '#2c3626' : '#5ea042' },
      { bx0: 190, bx1: 290, col: isNight ? '#242c20' : '#4e8a38', ridgeCol: isNight ? '#303a28' : '#64a846' },
      { bx0: 310, bx1: 410, col: isNight ? '#242c20' : '#4e8a38', ridgeCol: isNight ? '#303a28' : '#64a846' },
      { bx0: 430, bx1: 540, col: isNight ? '#222a1e' : '#4a8234', ridgeCol: isNight ? '#2c3626' : '#5ea042' },
      { bx0: 560, bx1: 660, col: isNight ? '#1e241c' : '#427830', ridgeCol: isNight ? '#283024' : '#528e3a' },
    ];

    ctx.save();
    for (const b of beds) {
      // Đất luống vun cao theo phối cảnh
      const pBed = `M ${VP[0]} ${VP[1]} L ${b.bx0} 1030 L ${b.bx1} 1030 Z`;
      path(ctx, pBed, isNight ? '#1c201a' : '#483624', null);

      // Sườn luống đổ bóng rãnh
      line(ctx, [[VP[0], VP[1]], [b.bx0, 1030]], isNight ? '#141814' : '#342618', 2.6);

      // Dãy cây xanh mọc thành hàng thẳng tắp dọc theo sống luống
      const midX = (b.bx0 + b.bx1) * 0.5;
      const count = 16;
      for (let k = 0; k < count; k++) {
        const u = (k + 1) / (count + 1);
        const y = VP[1] + (1030 - VP[1]) * u;
        const x = VP[0] + (midX - VP[0]) * u;
        const r = 2.5 + u * 13;
        ellipse(ctx, x, y - r * 0.6, r, r * 0.7, b.ridgeCol, null);
        ellipse(ctx, x - r * 0.25, y - r * 0.7, r * 0.6, r * 0.45, tone(b.ridgeCol, 0.15), null);
      }
    }
    ctx.restore();

    // Rãnh đất ẩm lối đi giữa các luống
    ctx.save(); ctx.globalAlpha *= 0.25;
    for (let i = 0; i < 7; i++) {
      const x = i * 95;
      line(ctx, [[VP[0], VP[1]], [x, 1030]], '#1a1208', 2);
    }
    ctx.restore();
  }

  // -------------------------------------------------------------
  // 7. TỔNG HỢP DANH SÁCH RIG VÀ ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  const rigs = {};

  // 7.1 Đăng ký 15 củ/bông đã thu hoạch (nhóm vegetable)
  rigs.kohlrabi = { group: 'vegetable', draw: drawKohlrabiBody, spec: VEG_LIMBS.kohlrabi, seeds: drawKohlrabiSeeds };
  rigs.potato = { group: 'vegetable', draw: drawPotatoBody, spec: VEG_LIMBS.potato, seeds: drawPotatoSeeds };
  rigs.sweet_potato = { group: 'vegetable', draw: drawSweetPotatoBody, spec: VEG_LIMBS.sweet_potato, seeds: drawSweetPotatoSeeds };
  rigs.cassava = { group: 'vegetable', draw: drawCassavaBody, spec: VEG_LIMBS.cassava, seeds: drawCassavaSeeds };
  rigs.taro = { group: 'vegetable', draw: drawTaroBody, spec: VEG_LIMBS.taro, seeds: drawTaroSeeds };
  rigs.radish = { group: 'vegetable', draw: drawRadishBody, spec: VEG_LIMBS.radish, seeds: drawRadishSeeds };
  rigs.beet = { group: 'vegetable', draw: drawBeetBody, spec: VEG_LIMBS.beet, seeds: drawBeetSeeds };
  rigs.onion = { group: 'vegetable', draw: drawOnionBody, spec: VEG_LIMBS.onion, seeds: drawOnionSeeds };
  rigs.garlic = { group: 'vegetable', draw: drawGarlicBody, spec: VEG_LIMBS.garlic, seeds: drawGarlicSeeds };
  rigs.ginger = { group: 'vegetable', draw: drawGingerBody, spec: VEG_LIMBS.ginger, seeds: drawGingerSeeds };
  rigs.cauliflower = { group: 'vegetable', draw: drawCauliflowerBody, spec: VEG_LIMBS.cauliflower, seeds: drawCauliflowerSeeds };
  rigs.broccoli = { group: 'vegetable', draw: drawBroccoliBody, spec: VEG_LIMBS.broccoli, seeds: drawBroccoliSeeds };
  rigs.okra = { group: 'vegetable', draw: drawOkraBody, spec: VEG_LIMBS.okra, seeds: drawOkraSeeds };
  rigs.chili = { group: 'vegetable', draw: drawChiliBody, spec: VEG_LIMBS.chili, seeds: drawChiliSeeds };
  rigs.mushroom = { group: 'vegetable', draw: drawMushroomBody, spec: VEG_LIMBS.mushroom, seeds: drawMushroomSeeds };

  // 7.2 Đăng ký 18 cây trồng trong đất (nhóm plant)
  for (const [id, spec] of Object.entries(ROOT_CROP_SPECS)) {
    rigs[id] = {
      group: 'plant',
      draw: (ctx, s, t) => drawRootCrop(ctx, s, t, spec),
      spec
    };
  }

  // 7.3 Gọi RemakeVector.register
  RemakeVector.register({
    rigs,
    backgrounds: {
      vegetable_rows: {
        label: 'Luống rau',
        theme: 'garden',
        ground_y: 810,
        draw: drawVegetableRows
      }
    }
  });

})();
