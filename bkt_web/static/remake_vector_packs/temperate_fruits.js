// Gói Trái Cây Xứ Lạnh & Cây Ăn Quả Ôn Đới (temperate_fruits)
// Phiên bản: 1.0.0
// Cung cấp 9 quả xứ lạnh (FRUIT_BODIES + FRUIT_SEEDS + FRUIT_LIMBS),
// 2 hình nền cao nguyên / vườn tuyết.

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('temperate_fruits pack: RemakeVector core engine chưa được nạp.');
  }

  const {
    INK, tone, volume, cylinder, limb, mitten, leaf, blade,
    ellipse, path, line, withCut, hash, clamp, smooth,
    FRUIT_BODIES, FRUIT_SEEDS, FRUIT_LIMBS
  } = RemakeVector.kit;

  // -------------------------------------------------------------
  // 1. BẢNG MÀU CHÍN TỰ NHIÊN CHO TRÁI CÂY XỨ LẠNH
  // -------------------------------------------------------------
  const FRUIT_COLORS = {
    pear: [[175, 210, 110], [225, 220, 105], [238, 205, 78]],            // xanh cốm -> vàng chanh -> vàng mật
    peach: [[205, 222, 130], [248, 196, 120], [242, 92, 114]],           // xanh nõn -> vàng mơ -> má hồng đào
    plum: [[138, 178, 102], [186, 74, 112], [82, 38, 88]],               // xanh -> đỏ tím -> tím sẫm phủ phấn
    cherry: [[218, 210, 120], [236, 102, 88], [198, 24, 48]],            // vàng nhạt -> đỏ tươi -> đỏ ruby thẫm
    persimmon: [[160, 198, 92], [246, 168, 64], [238, 92, 36]],          // xanh -> vàng cam -> đỏ cam rực
    blueberry: [[168, 202, 130], [148, 112, 172], [44, 52, 98]],         // xanh non -> tím nhạt -> xanh chàm sẫm
    raspberry: [[196, 216, 136], [242, 128, 142], [206, 32, 68]],        // xanh nhạt -> hồng đỏ -> đỏ thẫm
    apricot: [[188, 216, 122], [246, 208, 96], [244, 154, 56]],          // xanh cốm -> vàng mơ -> cam ấm
    pomegranate: [[170, 204, 118], [228, 142, 98], [194, 46, 56]],       // xanh vàng -> hồng cam -> đỏ thẫm
  };

  function fruitRipenColor(fruitId, g) {
    const stops = FRUIT_COLORS[fruitId] || [[120, 180, 70], [220, 180, 60], [220, 60, 50]];
    const scaled = clamp(g) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    const u = scaled - i;
    const r = Math.round(stops[i][0] + (stops[i + 1][0] - stops[i][0]) * u);
    const gCol = Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * u);
    const b = Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * u);
    return `rgb(${r},${gCol},${b})`;
  }

  // -------------------------------------------------------------
  // 2. VẼ THÂN VÀ RUỘT (SEEDS) CHO 9 QUẢ XỨ LẠNH
  // -------------------------------------------------------------

  // 2.1 PEAR (Quả Lê)
  // Thon nhỏ ở phần cổ, phình to tròn ở đáy, da lấm tấm chấm li ti
  function drawPearBody(ctx, s, body, t) {
    const col = s.style?.body || fruitRipenColor('pear', s.growth ?? 1);
    const d = 'M 0 -84 C 14 -84 18 -66 22 -44 C 28 -20 32 4 0 4 C -32 4 -28 -20 -22 -44 C -18 -66 -14 -84 0 -84 Z';
    path(ctx, d, volume(ctx, 0, -40, 28, 44, col, .35, -.25), INK, 2.2);
    // Tàn nhang li ti đặc trưng của vỏ lê
    ctx.save(); ctx.globalAlpha *= .3;
    for (let i = 0; i < 16; i++) {
      const px = Math.sin(i * 3.7) * 20, py = -40 + Math.cos(i * 2.3) * 32;
      ellipse(ctx, px, py, 0.9, 0.9, '#5a4820', null);
    }
    ctx.restore();
    ellipse(ctx, -8, -60, 4, 12, 'rgba(255,255,255,.45)', null, 1, 0.2);
    // Cuống gỗ cong nhẹ
    path(ctx, 'M 0 -84 Q 2 -96 8 -102', null, INK, 4.4);
    path(ctx, 'M 0 -84 Q 2 -96 8 -102', null, '#58442c', 2.6);
  }
  function drawPearSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -35, 9, 24, '#fbf8ee', null);
    // Hạt lê nâu ở phần đáy
    ellipse(ctx, side * 6, -26, 2.5, 4.2, '#382618', null, 1, side * 0.2);
    ellipse(ctx, side * 8, -36, 2.2, 3.8, '#382618', null, 1, -side * 0.15);
  }

  // 2.2 PEACH (Quả Đào)
  // Quả tròn phúng phính có rãnh khía lõm má, đầu hơi nhọn, má ửng hồng
  function drawPeachBody(ctx, s, body, t) {
    const col = s.style?.body || fruitRipenColor('peach', s.growth ?? 1);
    // Dáng quả đào với rãnh lõm ở má và chóp nhọn mềm
    const d = 'M 0 -86 C 18 -86 32 -70 32 -42 C 32 -14 18 2 2 4 C 0 4 -2 4 -2 4 C -18 2 -32 -14 -32 -42 C -32 -70 -18 -86 0 -86 Z';
    path(ctx, d, volume(ctx, 4, -40, 30, 44, col, .35, -.25), INK, 2.2);
    // Vết rãnh má lõm mềm mại dọc thân
    path(ctx, 'M 0 -84 Q -4 -42 0 4', null, tone(col, -.28), 1.8);
    // Vùng ửng hồng rực rỡ bên má
    ctx.save();
    ellipse(ctx, 10, -36, 18, 24, volume(ctx, 12, -36, 18, 24, '#f04e6c', .4, -.2), null);
    ctx.restore();
    // Vệt sáng mềm mượt lông tơ
    ellipse(ctx, -10, -56, 5, 14, 'rgba(255,255,255,.5)', null, 1, 0.2);
    // Cuống ngắn có lá xanh
    path(ctx, 'M 0 -84 L 0 -92', null, INK, 4.2);
    path(ctx, 'M 0 -84 L 0 -92', null, '#547834', 2.4);
    leaf(ctx, 6, -88, 0.65, 0.4, '#4a8228');
  }
  function drawPeachSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 8, -40, 16, 28, '#fffae8', null);
    // Hạt đào to sần sùi ở giữa
    const hx = side * 7, hy = -40;
    ellipse(ctx, hx, hy, 8, 14, '#6a2c1a', INK, 1.2);
    line(ctx, [[hx - 3, hy - 8], [hx + 3, hy + 8]], '#441a10', 1.4);
    line(ctx, [[hx + 4, hy - 6], [hx - 2, hy + 6]], '#441a10', 1.4);
  }

  // 2.3 PLUM (Quả Mận Hậu / Mận Tím)
  // Tròn hơi dẹt hình tim, rãnh dọc mờ, vỏ tím đen phủ phấn trắng mờ
  function drawPlumBody(ctx, s, body, t) {
    const col = s.style?.body || fruitRipenColor('plum', s.growth ?? 1);
    const d = 'M 0 -82 C 16 -82 28 -68 28 -44 C 28 -18 16 0 0 2 C -16 0 -28 -18 -28 -44 C -28 -68 -16 -82 0 -82 Z';
    path(ctx, d, volume(ctx, 0, -42, 28, 42, col, .38, -.3), INK, 2.2);
    // Rãnh khía lõm nhẹ
    path(ctx, 'M 0 -80 Q -2 -42 0 0', null, tone(col, -.35), 1.5);
    // Lớp phấn trắng mịn màng (bloom)
    ctx.save();
    ellipse(ctx, 0, -42, 24, 38, volume(ctx, 0, -42, 24, 38, 'rgba(235, 230, 245, 0.35)', .3, -.1), null);
    ctx.restore();
    ellipse(ctx, -10, -58, 4.5, 12, 'rgba(255,255,255,.55)', null, 1, 0.2);
    // Cuống thanh mảnh
    path(ctx, 'M 0 -82 Q -2 -94 3 -100', null, INK, 3.8);
    path(ctx, 'M 0 -82 Q -2 -94 3 -100', null, '#5e7244', 2.2);
  }
  function drawPlumSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 8, -42, 14, 26, '#f6c86a', null);
    // Hạt mận dẹp nhọn
    ellipse(ctx, side * 7, -42, 5, 10, '#844a28', null, 1, side * 0.1);
  }

  // 2.4 CHERRY (Anh Đào)
  // Cặp hai quả căng mọng chung một cuống dài chữ V uốn lượn
  function drawCherryBody(ctx, s, body, t) {
    const col = s.style?.body || fruitRipenColor('cherry', s.growth ?? 1);
    // Quả bên trái (nhỏ hơn một chút)
    ellipse(ctx, -15, -34, 15, 16, volume(ctx, -17, -36, 15, 16, col, .4, -.3), INK, 2.0);
    ellipse(ctx, -19, -42, 3, 6, 'rgba(255,255,255,.65)', null, 1, 0.3);
    // Quả bên phải (quả chính, to hơn, nơi neo mặt và tay chân)
    ellipse(ctx, 12, -30, 18, 19, volume(ctx, 10, -32, 18, 19, col, .4, -.3), INK, 2.2);
    ellipse(ctx, 7, -40, 4, 8, 'rgba(255,255,255,.7)', null, 1, 0.3);

    // Vết lõm cuống ở mỗi quả
    path(ctx, 'M -18 -49 Q -15 -47 -12 -49', null, tone(col, -.4), 1.6);
    path(ctx, 'M 8 -47 Q 12 -45 16 -47', null, tone(col, -.4), 1.6);

    // Cuống đôi chữ V uốn lượn nối về mấu chung ở đỉnh (anchor grip ở [0, -88])
    path(ctx, 'M -15 -48 C -14 -64 -6 -76 0 -88', null, INK, 3.8);
    path(ctx, 'M -15 -48 C -14 -64 -6 -76 0 -88', null, '#58883a', 2.2);
    path(ctx, 'M 12 -46 C 10 -64 4 -76 0 -88', null, INK, 3.8);
    path(ctx, 'M 12 -46 C 10 -64 4 -76 0 -88', null, '#58883a', 2.2);

    // Mấu cuống và chiếc lá xanh xinh xắn
    ellipse(ctx, 0, -88, 3.5, 3, '#3e6628', INK, 1.2);
    leaf(ctx, 6, -92, 0.6, 0.65, '#4e8c32');
  }
  function drawCherrySeeds(ctx, s, side, flesh) {
    // Ruột đỏ mọng nước của quả chính
    ellipse(ctx, side * 7, -30, 11, 13, '#c2243a', null);
    // Hạt tròn nhỏ màu be
    ellipse(ctx, side * 6, -30, 4, 4.5, '#e8d2b2', INK, 1.0);
  }

  // 2.5 PERSIMMON (Quả Hồng)
  // Quả vuông tròn đỏ cam căng mọng, có 4 cánh lá đài vuông úp ngược trên cuống
  function drawPersimmonBody(ctx, s, body, t) {
    const col = s.style?.body || fruitRipenColor('persimmon', s.growth ?? 1);
    // Dáng quả hồng hơi vuông cạnh, tròn múp
    const d = 'M -24 -72 C -10 -76 10 -76 24 -72 C 32 -56 32 -26 24 -6 C 12 2 -12 2 -24 -6 C -32 -26 -32 -56 -24 -72 Z';
    path(ctx, d, volume(ctx, 0, -38, 28, 38, col, .38, -.25), INK, 2.2);
    ellipse(ctx, -10, -56, 5, 12, 'rgba(255,255,255,.5)', null, 1, 0.2);

    // 4 cánh lá đài to vuông đặc trưng (calyx) úp trên đỉnh quả
    ctx.save();
    for (const [lx, ly, rot] of [[-14, -72, -0.4], [14, -72, 0.4], [-6, -75, -0.1], [6, -75, 0.1]]) {
      path(ctx, `M ${lx - 6} ${ly} Q ${lx} ${ly - 10} ${lx + 6} ${ly} Z`, volume(ctx, lx, ly - 4, 7, 6, '#3a622a'), INK, 1.4);
    }
    ctx.restore();
    // Cuống gỗ ngắn chắc nịch
    path(ctx, 'M 0 -75 L 0 -86', null, INK, 4.4);
    path(ctx, 'M 0 -75 L 0 -86', null, '#4e3822', 2.6);
  }
  function drawPersimmonSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 8, -38, 16, 26, '#f68e2c', null);
    // Hạt dẹp màu nâu xếp hình cánh hoa
    ellipse(ctx, side * 7, -46, 2.5, 6, '#4a2612', null, 1, side * 0.3);
    ellipse(ctx, side * 9, -32, 2.5, 6, '#4a2612', null, 1, -side * 0.25);
  }

  // 2.6 BLUEBERRY (Việt Quất)
  // Chùm 3 quả mọng tròn màu xanh chàm phủ phấn, đỉnh có đài vương miện răng cưa
  function drawBlueberryBody(ctx, s, body, t) {
    const col = s.style?.body || fruitRipenColor('blueberry', s.growth ?? 1);
    // Quả phụ bên trái
    ellipse(ctx, -16, -26, 13, 13, volume(ctx, -18, -28, 13, 13, tone(col, -.1), .35, -.3), INK, 1.8);
    // Quả phụ phía trên
    ellipse(ctx, -4, -48, 12, 12, volume(ctx, -6, -50, 12, 12, tone(col, -.15), .35, -.3), INK, 1.8);
    // Quả chính (ở giữa bên phải, to nhất, nơi đặt mặt và tay chân)
    ellipse(ctx, 8, -28, 19, 19, volume(ctx, 6, -30, 19, 19, col, .38, -.3), INK, 2.2);

    // Lớp phấn trắng lam (bloom) mờ phủ trên quả chính
    ctx.save();
    ellipse(ctx, 8, -28, 16, 16, volume(ctx, 8, -28, 16, 16, 'rgba(180, 205, 235, 0.32)', .3, -.15), null);
    ctx.restore();
    ellipse(ctx, 3, -38, 4, 7, 'rgba(255,255,255,.55)', null, 1, 0.25);

    // Đài hoa hình vương miện ngôi sao 5 cạnh ở đỉnh quả chính
    const cx = 8, cy = -46;
    path(ctx, `M ${cx - 7} ${cy + 2} L ${cx - 4} ${cy - 4} L ${cx} ${cy - 1} L ${cx + 4} ${cy - 4} L ${cx + 7} ${cy + 2} Z`, '#182038', INK, 1.2);
    ellipse(ctx, cx, cy, 3, 2, '#0c1220', null);

    // Cuống xanh nhỏ nối các quả
    line(ctx, [[-4, -58], [0, -68]], '#4a7238', 2.0);
    line(ctx, [[-16, -38], [-4, -58]], '#4a7238', 1.8);
    line(ctx, [[8, -46], [0, -68]], '#4a7238', 1.8);
    ellipse(ctx, 0, -68, 2.5, 2, '#385628', INK, 1.0);
  }
  function drawBlueberrySeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -28, 12, 12, '#644e7e', null);
    for (let i = 0; i < 5; i++) {
      const sx = side * 7 + Math.sin(i * 1.5) * 5, sy = -28 + Math.cos(i * 1.5) * 5;
      ellipse(ctx, sx, sy, 1.2, 1.2, '#baa294', null);
    }
  }

  // 2.7 RASPBERRY (Mâm Xôi / Phúc Bồn Tử)
  // Cấu tạo từ hàng chục múi hạt mọng tròn nhỏ kết tụ hình nón vòm
  function drawRaspberryBody(ctx, s, body, t) {
    const col = s.style?.body || fruitRipenColor('raspberry', s.growth ?? 1);
    // Vùng nền thân hình nón vòm
    const d = 'M 0 -80 C 18 -80 26 -64 26 -38 C 26 -12 16 0 0 2 C -16 0 -26 -12 -26 -38 C -26 -64 -18 -80 0 -80 Z';
    path(ctx, d, tone(col, -.2), INK, 2.0);

    // Các múi hạt mọng tròn (drupelets) xếp so le
    const rows = [
      { y: -72, count: 5, r: 5.5, span: 16 },
      { y: -58, count: 6, r: 6.2, span: 22 },
      { y: -44, count: 6, r: 6.8, span: 24 },
      { y: -30, count: 5, r: 6.4, span: 20 },
      { y: -16, count: 4, r: 5.8, span: 15 },
      { y: -4, count: 2, r: 5.0, span: 7 },
    ];
    for (const row of rows) {
      for (let j = 0; j < row.count; j++) {
        const u = row.count > 1 ? (j / (row.count - 1) - 0.5) : 0;
        const dx = u * row.span * 2;
        ellipse(ctx, dx, row.y, row.r, row.r, volume(ctx, dx - 1, row.y - 2, row.r, row.r, col, .38, -.25), INK, 1.1);
        ellipse(ctx, dx - row.r * 0.3, row.y - row.r * 0.3, row.r * 0.35, row.r * 0.35, 'rgba(255,255,255,.55)', null);
      }
    }
    // Đài lá xanh ở cuống đỉnh
    for (let i = -2; i <= 2; i++) {
      leaf(ctx, i * 6, -82, 0.45, i * 0.3, '#4a7e32');
    }
    path(ctx, 'M 0 -82 L 0 -92', null, INK, 4.0);
    path(ctx, 'M 0 -82 L 0 -92', null, '#4a7e32', 2.4);
  }
  function drawRaspberrySeeds(ctx, s, side, flesh) {
    // Ruột rỗng ở đáy hình nón đặc trưng của quả mâm xôi
    ellipse(ctx, side * 6, -38, 10, 22, '#f6c4cc', null);
    ellipse(ctx, 0, -42, 6, 16, '#ba1e3e', null);
  }

  // 2.8 APRICOT (Quả Mơ)
  // Tròn nhỏ màu vàng cam ấm áp, rãnh má nông mềm mại, má phớt hồng
  function drawApricotBody(ctx, s, body, t) {
    const col = s.style?.body || fruitRipenColor('apricot', s.growth ?? 1);
    const d = 'M 0 -82 C 16 -82 28 -68 28 -42 C 28 -16 16 0 0 2 C -16 0 -28 -16 -28 -42 C -28 -68 -16 -82 0 -82 Z';
    path(ctx, d, volume(ctx, 0, -40, 28, 42, col, .35, -.25), INK, 2.2);
    // Rãnh má dọc thân
    path(ctx, 'M 0 -80 Q -3 -42 0 0', null, tone(col, -.25), 1.6);
    // Vùng ửng hồng cam dịu dàng
    ctx.save();
    ellipse(ctx, 10, -38, 14, 20, volume(ctx, 10, -38, 14, 20, '#f27848', .3, -.2), null);
    ctx.restore();
    ellipse(ctx, -8, -56, 4, 12, 'rgba(255,255,255,.5)', null, 1, 0.2);
    // Cuống ngắn có lá xanh
    path(ctx, 'M 0 -82 L 0 -90', null, INK, 3.8);
    path(ctx, 'M 0 -82 L 0 -90', null, '#627c38', 2.2);
    leaf(ctx, 5, -86, 0.5, 0.5, '#4e8c32');
  }
  function drawApricotSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 7, -40, 13, 24, '#fde8aa', null);
    // Hạt mơ róc ruột trơn láng
    ellipse(ctx, side * 6, -40, 6, 11, '#7a3e1a', null, 1, side * 0.1);
  }

  // 2.9 POMEGRANATE (Quả Lựu)
  // Quả tròn vỏ dày màu đỏ hồng thẫm, đỉnh có vương miện răng cưa cứng cáp
  function drawPomegranateBody(ctx, s, body, t) {
    const col = s.style?.body || fruitRipenColor('pomegranate', s.growth ?? 1);
    // Thân quả lựu tròn căng mọng
    ellipse(ctx, 0, -40, 28, 28, volume(ctx, 0, -40, 28, 28, col, .38, -.28), INK, 2.4);
    ellipse(ctx, -10, -54, 5, 12, 'rgba(255,255,255,.55)', null, 1, 0.3);

    // Đài hoa hình vương miện 6 răng cưa nhọn vươn cao ở đỉnh quả
    const crown = 'M -9 -68 L -11 -82 L -6 -76 L 0 -84 L 6 -76 L 11 -82 L 9 -68 Z';
    path(ctx, crown, volume(ctx, 0, -75, 11, 8, tone(col, -.15)), INK, 1.8);
    ellipse(ctx, 0, -68, 5, 2.5, '#44141a', null);

    // Cuống gỗ ngắn
    path(ctx, 'M 0 -84 L 0 -92', null, INK, 4.0);
    path(ctx, 'M 0 -84 L 0 -92', null, '#583e28', 2.4);
  }
  function drawPomegranateSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 8, -40, 18, 22, '#fffaee', null);
    // Các hạt lựu đỏ ruby lấp lánh xếp thành từng cụm ngăn vách
    ctx.save();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const hx = side * 4 + c * 4, hy = -50 + r * 7 + (c % 2) * 2;
        ellipse(ctx, hx, hy, 2.2, 2.8, volume(ctx, hx, hy, 2.2, 2.8, '#c41832'), INK, 0.6);
        ellipse(ctx, hx - 0.6, hy - 0.8, 0.8, 0.8, '#ffffff', null);
      }
    }
    ctx.restore();
  }

  // 4 cây ôn đới (persimmon/peach/pear/cherry_tree) nằm trong farm_trees.js để dùng chung template
  // drawFruitTree (co theo growth giống anchor, cỡ/tâm quả khớp remake_vector.tree_fruit_placement).

  // -------------------------------------------------------------
  // 4. 2 HÌNH NỀN GIAI ĐOẠN D: HIGHLAND_FARM & SNOWY_ORCHARD
  // -------------------------------------------------------------
  const BACKGROUNDS = {
    highland_farm: {
      label: 'Nông trại cao nguyên Đà Lạt (Highland Farm)',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t, kit) {
        const isNight = settings.time === 'night' || settings.time_of_day === 'night';
        const W = 576, H = 1024, GY = 810;

        // Bầu trời cao nguyên trong trẻo
        const skyGrad = ctx.createLinearGradient(0, 0, 0, GY);
        if (isNight) {
          skyGrad.addColorStop(0, '#0a1424');
          skyGrad.addColorStop(0.6, '#142640');
          skyGrad.addColorStop(1, '#203a58');
        } else {
          skyGrad.addColorStop(0, '#68b4e8');
          skyGrad.addColorStop(0.5, '#a4daf6');
          skyGrad.addColorStop(1, '#e2f4fd');
        }
        ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, GY);

        if (isNight) {
          // Trăng cao nguyên vằng vặc & bầu trời đầy sao
          ellipse(ctx, 450, 140, 24, 24, '#fdf7d6', null);
          ellipse(ctx, 442, 134, 22, 22, '#142640', null);
          for (let i = 0; i < 32; i++) {
            const sx = (i * 53) % W, sy = (i * 37) % 380;
            ellipse(ctx, sx, sy, (i % 3 === 0 ? 1.5 : 1), (i % 3 === 0 ? 1.5 : 1), 'rgba(255,255,255,.85)', null);
          }
        } else {
          // Mây trắng bồng bềnh
          for (const [cx, cy, cr] of [[130, 160, 52], [180, 150, 60], [230, 165, 46], [420, 200, 56], [470, 190, 64]]) {
            ellipse(ctx, cx, cy, cr, cr * 0.55, 'rgba(255,255,255,.8)', null);
          }
        }

        // Dãy núi trùng điệp phía xa (Langbiang)
        ctx.fillStyle = isNight ? '#122030' : '#72a498';
        path(ctx, `M 0 520 Q 140 440 300 500 Q 450 430 576 490 L 576 ${GY} L 0 ${GY} Z`, ctx.fillStyle, null);
        ctx.fillStyle = isNight ? '#182b3a' : '#568c7e';
        path(ctx, `M 0 570 Q 180 500 360 550 Q 480 520 576 560 L 576 ${GY} L 0 ${GY} Z`, ctx.fillStyle, null);

        // Dải sương mù lam trắng lãng đãng thung lũng (đặc trưng Đà Lạt)
        ctx.save();
        for (let i = 0; i < 4; i++) {
          const sy = 560 + i * 22;
          const sGrad = ctx.createLinearGradient(0, sy - 15, 0, sy + 15);
          sGrad.addColorStop(0, 'rgba(255,255,255,0)');
          sGrad.addColorStop(0.5, isNight ? 'rgba(160,190,220,0.18)' : 'rgba(255,255,255,0.45)');
          sGrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sGrad;
          ctx.fillRect(0, sy - 15, W, 30);
        }
        ctx.restore();

        // Rừng thông ba lá nhấp nhô sườn đồi
        ctx.save();
        for (let i = 0; i < 9; i++) {
          const px = 30 + i * 65, py = 640 + (i % 3) * 12;
          const pCol = isNight ? '#163024' : '#325e42';
          line(ctx, [[px, py + 40], [px, py]], pCol, 2.8);
          for (let l = 0; l < 4; l++) {
            const ty = py + l * 8, tw = 18 - l * 3.5;
            path(ctx, `M ${px - tw} ${ty + 8} L ${px} ${ty} L ${px + tw} ${ty + 8} Z`, pCol, null);
          }
        }
        ctx.restore();

        // Ngôi nhà gỗ mái ngói dốc xa xa góc phải (kiểu biệt thự cổ Đà Lạt)
        ctx.save();
        const hx = 420, hy = 690;
        // Tường gỗ
        path(ctx, `M ${hx} ${hy} L ${hx + 64} ${hy} L ${hx + 64} ${hy + 40} L ${hx} ${hy + 40} Z`, isNight ? '#2a221a' : '#7a5a3a', INK, 1.8);
        // Mái ngói tam giác dốc
        path(ctx, `M ${hx - 6} ${hy} L ${hx + 32} ${hy - 26} L ${hx + 70} ${hy} Z`, isNight ? '#401e18' : '#a24632', INK, 2.0);
        // Ô cửa sổ nhỏ (ban đêm phát sáng vàng ấm cúng)
        ellipse(ctx, hx + 32, hy + 18, 8, 10, isNight ? '#fde872' : '#d2e8f8', INK, 1.2);
        if (isNight) {
          // Ánh sáng hắt ra từ cửa sổ
          ellipse(ctx, hx + 32, hy + 18, 16, 18, 'rgba(253, 232, 114, 0.25)', null);
        }
        ctx.restore();

        // Mặt đất đất đỏ bazan màu mỡ cao nguyên
        const gGrad = ctx.createLinearGradient(0, GY - 30, 0, H);
        if (isNight) {
          gGrad.addColorStop(0, '#221814');
          gGrad.addColorStop(0.3, '#1a120e');
          gGrad.addColorStop(1, '#0e0a08');
        } else {
          gGrad.addColorStop(0, '#5a8242'); // lớp cỏ xanh mướt
          gGrad.addColorStop(0.18, '#82442c'); // đất đỏ bazan
          gGrad.addColorStop(1, '#562b1a');
        }
        ctx.fillStyle = gGrad; ctx.fillRect(0, GY, W, H - GY);

        // Hàng rào gỗ mộc đơn sơ trước vườn
        for (let i = 0; i < 16; i++) {
          const fx = 15 + i * 36, fy = 730;
          line(ctx, [[fx, fy + 50], [fx, fy]], isNight ? '#28201a' : '#8c6e4e', 3.0);
        }
        line(ctx, [[0, 750], [W, 750]], isNight ? '#221a14' : '#7c5e40', 2.4);
      }
    },

    snowy_orchard: {
      label: 'Vườn cây xứ lạnh tuyết phủ (Snowy Orchard)',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t, kit) {
        const isNight = settings.time === 'night' || settings.time_of_day === 'night';
        const W = 576, H = 1024, GY = 810;

        // Bầu trời mùa đông lạnh buốt
        const skyGrad = ctx.createLinearGradient(0, 0, 0, GY);
        if (isNight) {
          skyGrad.addColorStop(0, '#0c1220');
          skyGrad.addColorStop(0.65, '#182034');
          skyGrad.addColorStop(1, '#28344e');
        } else {
          skyGrad.addColorStop(0, '#bcced8');
          skyGrad.addColorStop(0.6, '#d8e4ea');
          skyGrad.addColorStop(1, '#eaf2f6');
        }
        ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, GY);

        if (isNight) {
          // Trăng đông băng giá
          ellipse(ctx, 460, 130, 22, 22, '#eef6fc', null);
          ellipse(ctx, 452, 124, 20, 20, '#182034', null);
        }

        // Những dãy núi tuyết hùng vĩ xa mờ trong sương
        ctx.fillStyle = isNight ? '#1a2436' : '#9cb4c2';
        path(ctx, `M 0 540 Q 150 460 300 520 Q 440 450 576 510 L 576 ${GY} L 0 ${GY} Z`, ctx.fillStyle, null);
        // Đỉnh núi tuyết trắng
        ctx.fillStyle = isNight ? '#2c3e56' : '#eaf4f8';
        path(ctx, 'M 100 486 L 150 460 L 200 480 Z', ctx.fillStyle, null);
        path(ctx, 'M 390 478 L 440 450 L 490 474 Z', ctx.fillStyle, null);

        // Hàng cây trụi lá mùa đông ở trung cảnh phủ tuyết
        ctx.save();
        for (let i = 0; i < 7; i++) {
          const tx = 40 + i * 85, ty = 660 + (i % 2) * 15;
          const tCol = isNight ? '#1e2838' : '#52606e';
          // Thân và cành cây khẳng khiu
          line(ctx, [[tx, ty + 60], [tx, ty]], tCol, 3.4);
          line(ctx, [[tx, ty + 30], [tx - 18, ty + 10]], tCol, 2.2);
          line(ctx, [[tx, ty + 20], [tx + 18, ty - 2]], tCol, 2.0);
          line(ctx, [[tx - 18, ty + 10], [tx - 26, ty - 4]], tCol, 1.6);
          // Tuyết đọng trên cành
          const snowCol = isNight ? '#b4c8d8' : '#ffffff';
          line(ctx, [[tx - 20, ty + 9], [tx, ty + 28]], snowCol, 2.0);
          line(ctx, [[tx, ty + 18], [tx + 19, ty - 3]], snowCol, 2.0);
        }
        ctx.restore();

        // Lớp tuyết dày mịn bao phủ mặt đất
        const snowGroundGrad = ctx.createLinearGradient(0, GY - 10, 0, H);
        if (isNight) {
          snowGroundGrad.addColorStop(0, '#32465e');
          snowGroundGrad.addColorStop(0.3, '#223244');
          snowGroundGrad.addColorStop(1, '#162230');
        } else {
          snowGroundGrad.addColorStop(0, '#f2f8fc');
          snowGroundGrad.addColorStop(0.2, '#e0edf4');
          snowGroundGrad.addColorStop(1, '#c8dce6');
        }
        ctx.fillStyle = snowGroundGrad; ctx.fillRect(0, GY, W, H - GY);

        // Những gợn tuyết đọng lượn sóng mềm mại
        ctx.save();
        ctx.fillStyle = isNight ? '#405672' : '#ffffff';
        for (let i = 0; i < 6; i++) {
          const gx = i * 105, gy = GY + 14 + (i % 3) * 12;
          ellipse(ctx, gx, gy, 46, 7, ctx.fillStyle, null);
        }
        ctx.restore();

        // Bông tuyết lất phất rơi khắp không gian
        ctx.save();
        for (let i = 0; i < 48; i++) {
          const fx = (i * 43 + Math.sin(t + i) * 12) % W;
          const fy = (i * 29 + t * 45) % GY;
          const fr = (i % 4 === 0) ? 2.4 : 1.4;
          ellipse(ctx, fx, fy, fr, fr, isNight ? 'rgba(210, 230, 255, 0.75)' : 'rgba(255, 255, 255, 0.85)', null);
        }
        ctx.restore();
      }
    }
  };

  // -------------------------------------------------------------
  // 5. ĐĂNG KÝ VỚI CORE VECTOR ENGINE
  // -------------------------------------------------------------
  RemakeVector.register({
    rigs: {
      // 9 quả xứ lạnh (nhóm fruit: drawFruit lo limb, squash, slice)
      pear: { group: 'fruit', draw: drawPearBody, spec: { hip: 12, hipY: -4, arm: 22, armY: -46 , limbColor: '#8f8a3a' }, seeds: drawPearSeeds },
      peach: { group: 'fruit', draw: drawPeachBody, spec: { hip: 14, hipY: -4, arm: 26, armY: -44 , limbColor: '#b0506a' }, seeds: drawPeachSeeds },
      plum: { group: 'fruit', draw: drawPlumBody, spec: { hip: 13, hipY: -4, arm: 24, armY: -44 , limbColor: '#4a2a52' }, seeds: drawPlumSeeds },
      cherry: { group: 'fruit', draw: drawCherryBody, spec: { hip: 12, hipY: -8, arm: 24, armY: -34 , limbColor: '#7a1a2a' }, seeds: drawCherrySeeds },
      persimmon: { group: 'fruit', draw: drawPersimmonBody, spec: { hip: 15, hipY: -4, arm: 25, armY: -42 , limbColor: '#a8481e' }, seeds: drawPersimmonSeeds },
      blueberry: { group: 'fruit', draw: drawBlueberryBody, spec: { hip: 11, hipY: -6, arm: 22, armY: -32 , limbColor: '#2e3560' }, seeds: drawBlueberrySeeds },
      raspberry: { group: 'fruit', draw: drawRaspberryBody, spec: { hip: 13, hipY: -4, arm: 24, armY: -42 , limbColor: '#8a1a3a' }, seeds: drawRaspberrySeeds },
      apricot: { group: 'fruit', draw: drawApricotBody, spec: { hip: 12, hipY: -4, arm: 23, armY: -42 , limbColor: '#b0682a' }, seeds: drawApricotSeeds },
      pomegranate: { group: 'fruit', draw: drawPomegranateBody, spec: { hip: 15, hipY: -4, arm: 26, armY: -44 , limbColor: '#7a1e28' }, seeds: drawPomegranateSeeds },
    },
    backgrounds: BACKGROUNDS,
  });

})();
