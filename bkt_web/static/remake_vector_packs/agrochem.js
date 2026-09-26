// remake_vector_packs/agrochem.js - Gói phân bón, hoá chất bảo vệ thực vật & an toàn nông nghiệp (Giai đoạn F)
// Phục vụ giáo dục an toàn lao động: đồ bảo hộ, khoá hoá chất, không phun khi gió, rửa sạch nông sản.
// Biểu tượng nguy hiểm dùng hình thoi GHS tối giản, không chữ, không nhãn hiệu thương mại.
(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('agrochem pack: RemakeVector core engine chưa được nạp.');
  }

  const {
    ellipse, path, line, leaf, volume, cylinder, tone, mix, clamp, smooth, hash, rotate, INK
  } = RemakeVector.kit;

  // -------------------------------------------------------------
  // HELPER: Biểu tượng GHS hình thoi đỏ cảnh báo (Không chữ)
  // -------------------------------------------------------------
  function drawGhsDiamond(ctx, cx, cy, size, symbol = 'skull') {
    ctx.save();
    ctx.translate(cx, cy);
    // Hình thoi viền đỏ nền trắng/vàng
    const d = size;
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ellipse(ctx, 0, 0, d * 0.7, d * 0.7, '#ffffff', '#d62424', 2.2);
    ctx.restore();

    // Biểu tượng bên trong hình thoi (chỉ hình đồ họa, không có chữ)
    if (symbol === 'skull') {
      // Đầu lâu xương chéo
      ellipse(ctx, 0, -d * 0.16, d * 0.28, d * 0.25, '#1e2422', null);
      // Hốc mắt & mũi
      ellipse(ctx, -d * 0.1, -d * 0.16, d * 0.07, d * 0.08, '#ffffff', null);
      ellipse(ctx, d * 0.1, -d * 0.16, d * 0.07, d * 0.08, '#ffffff', null);
      // Hàm răng
      path(ctx, `M ${-d * 0.12} ${-d * 0.02} L ${d * 0.12} ${-d * 0.02} L ${d * 0.08} ${d * 0.12} L ${-d * 0.08} ${d * 0.12} Z`, '#1e2422', null);
      // Xương chéo
      line(ctx, [[-d * 0.28, d * 0.24], [d * 0.28, -d * 0.24]], '#1e2422', 1.8);
      line(ctx, [[-d * 0.28, -d * 0.24], [d * 0.28, d * 0.24]], '#1e2422', 1.8);
    } else if (symbol === 'aquatic') {
      // Cá chết phơi bụng & cây khô (nguy hại môi trường thuỷ sinh)
      path(ctx, `M ${-d * 0.24} ${d * 0.1} Q ${-d * 0.05} ${d * 0.2} ${d * 0.2} ${d * 0.06}`, null, '#1e2422', 1.6);
      ellipse(ctx, 0, d * 0.08, d * 0.18, d * 0.09, '#1e2422', null, 0.2);
      ellipse(ctx, -d * 0.1, d * 0.06, d * 0.04, d * 0.04, '#ffffff', null); // Mắt cá
      // Cây khô
      line(ctx, [[d * 0.12, -d * 0.22], [d * 0.12, d * 0.08]], '#1e2422', 1.8);
      line(ctx, [[d * 0.12, -d * 0.1], [d * 0.24, -d * 0.18]], '#1e2422', 1.4);
      line(ctx, [[d * 0.12, -d * 0.04], [0, -d * 0.12]], '#1e2422', 1.4);
    } else {
      // Dấu chấm than (cảnh báo nguy hiểm chung)
      ellipse(ctx, 0, -d * 0.1, d * 0.07, d * 0.18, '#1e2422', null);
      ellipse(ctx, 0, d * 0.2, d * 0.07, d * 0.07, '#1e2422', null);
    }
    ctx.restore();
  }

  // -------------------------------------------------------------
  // 1. ĐẠO CỤ PHÂN BÓN & HOÁ CHẤT
  // -------------------------------------------------------------

  // 1.1 Bao phân bón (fertilizer_sack)
  function drawFertilizerSack(ctx, s, t) {
    const fill = clamp(s.fill ?? 0.85);
    const bodyCol = s.style?.body || '#e8e0d0';
    const h = -68 * (0.6 + 0.4 * fill);
    const w = 32 + 6 * fill;

    // Bóng đổ đáy bao
    ctx.save();
    ctx.globalAlpha *= 0.3;
    ellipse(ctx, 0, 0, w * 0.95, 8, '#322618', null);
    ctx.restore();

    // Thân bao tải may vải đay
    const d = `M ${-w * 0.9} 0 C ${-w * 1.05} ${h * 0.4} ${-w * 0.95} ${h * 0.85} ${-w * 0.7} ${h} L ${w * 0.7} ${h} C ${w * 0.95} ${h * 0.85} ${w * 1.05} ${h * 0.4} ${w * 0.9} 0 Z`;
    path(ctx, d, cylinder(ctx, -w, w, bodyCol), INK, 2.2);

    // Đường chỉ may gập miệng bao ở đỉnh
    path(ctx, `M ${-w * 0.72} ${h} Q 0 ${h - 4} ${w * 0.72} ${h}`, null, '#6d5438', 2.0);
    for (let i = -4; i <= 4; i++) {
      const sx = i * (w * 0.14);
      line(ctx, [[sx - 2, h - 3], [sx + 2, h + 3]], '#4a3824', 1.3);
    }

    // Nếp gấp thân bao
    for (let k = 1; k <= 3; k++) {
      const fy = h * (0.25 * k);
      path(ctx, `M ${-w * 0.7} ${fy} Q 0 ${fy + 5} ${w * 0.7} ${fy}`, null, tone(bodyCol, -0.15), 1.2);
    }

    // Nhãn NPK: 3 chấm tròn màu đặc trưng (Đỏ - Xanh lá - Xanh dương), không chữ
    const ly = h * 0.5;
    ellipse(ctx, 0, ly, w * 0.6, 12, '#ffffff', tone(bodyCol, -0.25), 1.1);
    ellipse(ctx, -12, ly, 5, 5, '#e03a3a', INK, 1.1); // N (Đạm - Đỏ)
    ellipse(ctx, 0, ly, 5, 5, '#3ca43c', INK, 1.1);  // P (Lân - Xanh lá)
    ellipse(ctx, 12, ly, 5, 5, '#3a72e0', INK, 1.1); // K (Kali - Xanh dương)
  }

  // 1.2 Đống ủ phân hữu cơ (compost_heap)
  function drawCompostHeap(ctx, s, t) {
    const col = s.style?.body || '#4e3b2c';
    // Đống ủ hình gò đất hữu cơ
    const d = 'M -55 0 C -60 -18 -38 -44 0 -48 C 38 -44 60 -18 55 0 Z';
    path(ctx, d, volume(ctx, 0, -25, 55, 30, col, 0.25, -0.3), INK, 2.2);

    // Mảnh lá mục và rơm vụn trên bề mặt
    for (const [lx, ly, rot, c] of [
      [-32, -14, 0.5, '#789a42'], [28, -12, -0.6, '#866c3c'], [-14, -32, 1.1, '#628a38'],
      [18, -28, -0.8, '#a2884c'], [0, -20, 0.2, '#5e7c32'], [-26, -24, -0.4, '#8a7246']
    ]) {
      leaf(ctx, lx, ly, 0.38, rot, c);
    }

    // Làn hơi hữu cơ bốc lên nhẹ nhàng theo t
    ctx.save();
    ctx.globalAlpha *= 0.45;
    for (let i = -1; i <= 1; i++) {
      const ph = ((t * 1.2 + i * 1.3) % 2) / 2;
      const vy = -48 - ph * 32, vx = i * 18 + Math.sin(t * 2 + i) * 6;
      path(ctx, `M ${vx - 4} ${vy} Q ${vx + 6} ${vy - 8} ${vx} ${vy - 16}`, null, '#f0eae0', 1.8 * (1 - ph));
    }
    ctx.restore();
  }

  // 1.3 Đống phân chuồng (manure_pile)
  function drawManurePile(ctx, s, t) {
    const col = s.style?.body || '#3c2c1e';
    // Đống phân chuồng sẫm màu
    const d = 'M -46 0 C -52 -16 -32 -38 0 -42 C 32 -38 52 -16 46 0 Z';
    path(ctx, d, volume(ctx, 0, -20, 46, 26, col, 0.3, -0.35), INK, 2.2);
    // Vệt bóng ẩm ướt
    ellipse(ctx, -10, -28, 14, 6, 'rgba(255,255,255,0.18)', null, 1, -0.2);

    // Ruồi vo ve quanh đống phân khi s.flies > 0 hoặc mặc định
    const flies = s.flies !== undefined ? s.flies : 1;
    if (flies > 0.05) {
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const ang = t * 3.5 + i * (Math.PI / 2);
        const fx = Math.cos(ang) * (26 + i * 6), fy = -42 + Math.sin(ang * 1.5) * 14;
        ellipse(ctx, fx, fy, 2.2, 1.8, '#181410', null); // Thân ruồi
        // Cánh mỏng trắng
        ellipse(ctx, fx - 1.2, fy - 2, 1.6, 2.4, 'rgba(235,245,255,0.7)', null, 1, -0.4);
        ellipse(ctx, fx + 1.2, fy - 2, 1.6, 2.4, 'rgba(235,245,255,0.7)', null, 1, 0.4);
      }
      ctx.restore();
    }
  }

  // 1.4 Thùng ủ rác hữu cơ (compost_bin)
  function drawCompostBin(ctx, s, t) {
    const col = s.style?.body || '#44784a';
    const cutaway = clamp(s.cutaway || 0);

    // Thùng composite/nhựa xanh có khe thông khí
    const d = 'M -30 0 L -34 -72 L 34 -72 L 30 0 Z';
    path(ctx, d, cylinder(ctx, -34, 34, col), INK, 2.2);

    // Nắp thùng ở trên
    ellipse(ctx, 0, -74, 38, 7, volume(ctx, 0, -74, 38, 7, tone(col, 0.15)), INK, 2.0);
    // Tay nắm nắp
    path(ctx, 'M -8 -76 Q 0 -82 8 -76', null, INK, 3.2);

    if (cutaway > 0.01) {
      // Khi cutaway > 0: mở mặt cắt bên trong thùng lộ các tầng phân hủy
      ctx.save();
      ctx.globalAlpha *= cutaway;
      ctx.save();
      ctx.clip(new Path2D('M -24 -6 L -27 -64 L 27 -64 L 24 -6 Z'));
      // Lớp 1: Đất mùn đen đáy thùng
      ellipse(ctx, 0, -14, 30, 16, '#281c14', null);
      // Lớp 2: Rau củ xanh đang phân hủy
      ellipse(ctx, 0, -32, 30, 15, '#5c7834', null);
      // Lớp 3: Rơm lá khô lớp trên
      ellipse(ctx, 0, -50, 30, 15, '#927646', null);
      ctx.restore();
      // Khung viền mặt cắt
      path(ctx, 'M -24 -6 L -27 -64 L 27 -64 L 24 -6 Z', null, '#d8c49e', 1.8);
      ctx.restore();
    } else {
      // Khe thông khí ngoài thùng
      for (let y = -54; y <= -18; y += 12) {
        line(ctx, [[-18, y], [18, y]], '#1f3e24', 2.4);
      }
    }
  }

  // 1.5 Nắm hạt phân viên (granules)
  function drawGranules(ctx, s, t) {
    const col = s.style?.body || '#5894b8';
    // Cụm các hạt tròn NPK/vi sinh nhỏ
    ctx.save();
    for (let i = 0; i < 18; i++) {
      const gx = -16 + (i * 7.7) % 32, gy = -8 - ((i * 5.3) % 18);
      const r = 2.4 + (i % 3) * 0.8;
      const c = i % 3 === 0 ? col : i % 3 === 1 ? '#e0d8b8' : '#72b662';
      ellipse(ctx, gx, gy, r, r * 0.9, volume(ctx, gx - 1, gy - 1, r, r, c), INK, 1.1);
    }
    ctx.restore();
  }

  // 1.6 Chai thuốc bảo vệ thực vật (pesticide_bottle)
  function drawPesticideBottle(ctx, s, t) {
    const col = s.style?.body || '#f4f6fa';
    // Thân chai nhựa đục
    const d = 'M -18 0 C -20 -18 -20 -44 -18 -56 L -10 -64 L -10 -74 L 10 -74 L 10 -64 L 18 -56 C 20 -44 20 -18 18 0 Z';
    path(ctx, d, cylinder(ctx, -18, 18, col), INK, 2.2);

    // Nắp vặn an toàn ren màu đỏ
    path(ctx, 'M -11 -74 L 11 -74 L 11 -84 L -11 -84 Z', volume(ctx, 0, -79, 11, 5, '#d62a2a'), INK, 1.8);
    for (let i = -2; i <= 2; i++) {
      line(ctx, [[i * 3.5, -83], [i * 3.5, -75]], '#8c1616', 1.0);
    }

    // Nhãn chai hình thoi đỏ cảnh báo GHS (Không chữ)
    drawGhsDiamond(ctx, 0, -32, 16, 'skull');
  }

  // 1.7 Bình phun thuốc đeo lưng (backpack_sprayer)
  function drawBackpackSprayer(ctx, s, t) {
    const col = s.style?.body || '#f2cb38'; // Thân vàng công nghiệp

    // Quai đeo lưng 2 bên (vòng qua vai người)
    path(ctx, 'M -24 -70 C -34 -40 -34 -10 -22 0', null, INK, 4.4);
    path(ctx, 'M -24 -70 C -34 -40 -34 -10 -22 0', null, '#2d3844', 2.6);
    path(ctx, 'M 24 -70 C 34 -40 34 -10 22 0', null, INK, 4.4);
    path(ctx, 'M 24 -70 C 34 -40 34 -10 22 0', null, '#2d3844', 2.6);

    // Thân bình chữ nhật bo góc
    const d = 'M -22 0 L -24 -72 Q 0 -76 24 -72 L 22 0 Z';
    path(ctx, d, cylinder(ctx, -24, 24, col), INK, 2.4);

    // Nắp rót trên đỉnh bình
    ellipse(ctx, 0, -74, 14, 5, volume(ctx, 0, -74, 14, 5, '#2e3a46'), INK, 1.8);

    // Cần bơm bên hông
    line(ctx, [[-26, -40], [-26, -10]], '#4a5664', 3.0);
    ellipse(ctx, -26, -10, 4, 4, '#1e242c', null);

    // Ống dẫn mềm đen từ đáy bình nối sang cần phun
    path(ctx, 'M 18 -8 Q 36 -4 34 -30 Q 32 -54 44 -58', null, INK, 4.6);
    path(ctx, 'M 18 -8 Q 36 -4 34 -30 Q 32 -54 44 -58', null, '#28323c', 2.6);

    // Cần xịt kim loại dài hướng về phía trước
    const wand = 'M 44 -58 L 74 -78';
    path(ctx, wand, null, INK, 3.4);
    path(ctx, wand, null, '#d4dcde', 1.8);
    // Đầu vòi phun sương (nozzle)
    ellipse(ctx, 75, -79, 4, 3, '#c23828', INK, 1.2, -0.6);
  }

  // 1.8 Can hoá chất (jerrycan)
  function drawJerrycan(ctx, s, t) {
    const col = s.style?.body || '#2a6cb8'; // Can xanh lam công nghiệp
    // Thân can hình hộp vát góc
    const d = 'M -22 0 L -24 -60 L -18 -66 L 18 -66 L 24 -60 L 22 0 Z';
    path(ctx, d, cylinder(ctx, -24, 24, col), INK, 2.2);

    // Gân chịu lực chữ X dập nổi trên thân
    line(ctx, [[-15, -12], [15, -48]], tone(col, -0.2), 2.0);
    line(ctx, [[-15, -48], [15, -12]], tone(col, -0.2), 2.0);

    // 3 tay cầm trên đỉnh can đặc trưng
    path(ctx, 'M -12 -66 L -12 -76 L 12 -76 L 12 -66', null, INK, 3.6);
    path(ctx, 'M -12 -66 L -12 -76 L 12 -76 L 12 -66', null, tone(col, 0.15), 2.0);

    // Nắp rót lệch một bên có ren vặn
    path(ctx, 'M -16 -66 L -16 -73 L -8 -73 L -8 -66 Z', '#e43228', INK, 1.4);

    // Nhãn hình thoi cảnh báo GHS
    drawGhsDiamond(ctx, 0, -30, 14, 'aquatic');
  }

  // 1.9 Tủ khoá hoá chất an toàn (chem_cabinet)
  function drawChemCabinet(ctx, s, t) {
    const col = s.style?.body || '#dfa832'; // Tủ sắt vàng chuyên dụng
    const open = clamp(s.open ?? 0);

    // Khung tủ chính
    const d = 'M -40 0 L -40 -96 L 40 -96 L 40 0 Z';
    path(ctx, d, volume(ctx, 0, -48, 40, 48, col, 0.2, -0.25), INK, 2.4);

    if (open > 0.05) {
      // Khi tủ mở: lộ 2 đợt kệ bên trong với chai lọ an toàn
      ctx.save();
      // Ngăn trong sẫm màu
      path(ctx, 'M -36 -4 L -36 -92 L 36 -92 L 36 -4 Z', '#3a3224', INK, 1.8);
      // Đợt kệ giữa
      line(ctx, [[-36, -48], [36, -48]], '#8c7644', 3.0);
      // Kệ 1: 2 chai lọ nhỏ
      ellipse(ctx, -18, -24, 7, 18, '#ffffff', INK, 1.2);
      ellipse(ctx, 16, -24, 8, 16, '#2a6cb8', INK, 1.2);
      // Kệ 2: 1 can hoá chất nhỏ
      path(ctx, 'M -20 -52 L -20 -72 L -6 -72 L -6 -52 Z', '#d82828', INK, 1.2);
      ctx.restore();

      // Cánh cửa mở hé sang 2 bên
      const dw = 38 * (1 - open * 0.85);
      path(ctx, `M -40 0 L -40 -96 L ${-40 + dw} -94 L ${-40 + dw} -2 Z`, col, INK, 1.8);
      path(ctx, `M 40 0 L 40 -96 L ${40 - dw} -94 L ${40 - dw} -2 Z`, col, INK, 1.8);
    } else {
      // Khi tủ đóng: khe cửa giữa & ổ khoá an toàn
      line(ctx, [[0, -96], [0, 0]], INK, 2.0);
      // Biển cảnh báo hình thoi nguy hiểm trên cánh cửa
      drawGhsDiamond(ctx, -18, -60, 16, 'skull');
      drawGhsDiamond(ctx, 18, -60, 16, 'aquatic');

      // Ổ khoá an toàn màu đồng ở giữa 2 cánh cửa
      ellipse(ctx, 0, -46, 7, 7, '#d49e34', INK, 1.6);
      path(ctx, 'M -4 -46 L -4 -53 Q 0 -57 4 -53 L 4 -46', null, '#545e68', 2.0);
    }
  }

  // 1.10 Đồ bảo hộ: Găng tay cao su (ppe_gloves)
  function drawPpeGloves(ctx, s, t) {
    const col = s.style?.body || '#ea7224'; // Cam bảo hộ dày dặn
    // Đôi găng tay cao su chống hoá chất
    for (const side of [-1, 1]) {
      const gx = side * 14;
      const d = `M ${gx - 8} 0 L ${gx - 10} -32 Q ${gx} -36 ${gx + 10} -32 L ${gx + 8} 0 Z`;
      path(ctx, d, cylinder(ctx, gx - 10, gx + 10, col), INK, 2.0);
      // Cổ găng tay viền cuốn chống tràn
      ellipse(ctx, gx, 0, 8, 3.5, tone(col, 0.2), INK, 1.2);
    }
  }

  // 1.11 Đồ bảo hộ: Mặt nạ phòng độc than hoạt tính (ppe_mask)
  function drawPpeMask(ctx, s, t) {
    // Khẩu trang phòng độc nửa mặt (che mũi và miệng)
    const col = s.style?.body || '#36424e';

    // Thân chụp mũi miệng hình tam giác vòm
    const d = 'M 0 -22 C -18 -20 -22 -6 -20 8 C -14 16 14 16 20 8 C 22 -6 18 -20 0 -22 Z';
    path(ctx, d, volume(ctx, 0, 0, 20, 16, col, 0.3, -0.3), INK, 2.2);

    // 2 bầu lọc tròn than hoạt tính 2 bên má (cartridges)
    for (const side of [-1, 1]) {
      const bx = side * 18, by = 2;
      ellipse(ctx, bx, by, 9, 9, volume(ctx, bx, by, 9, 9, '#728292'), INK, 1.8);
      ellipse(ctx, bx, by, 5, 5, '#222c34', null);
    }
    // Van thở một chiều ở giữa cằm
    ellipse(ctx, 0, 8, 6, 6, '#182028', INK, 1.2);

    // Dây chun đeo vòng qua gáy
    line(ctx, [[-20, -10], [-34, -4]], '#222830', 2.6);
    line(ctx, [[20, -10], [34, -4]], '#222830', 2.6);
  }

  // 1.12 Đồ bảo hộ: Kính bảo hộ kín (ppe_goggles)
  function drawPpeGoggles(ctx, s, t) {
    // Kính bảo hộ ôm sát hốc mắt
    const frameCol = s.style?.body || '#4478a8';
    // Dây chun đeo sau đầu
    line(ctx, [[-30, 0], [-42, 2]], '#1e2834', 3.0);
    line(ctx, [[30, 0], [42, 2]], '#1e2834', 3.0);

    // Viền khung kính bảo hộ
    const frame = 'M 0 -6 C -12 -14 -32 -14 -32 0 C -32 14 -12 14 0 6 C 12 14 32 14 32 0 C 32 -14 12 -14 0 -6 Z';
    path(ctx, frame, frameCol, INK, 2.4);

    // Tròng kính trong suốt phản chiếu ánh sáng xanh ngọc
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 17, 0, 12, 9, 'rgba(215, 245, 255, 0.75)', INK, 1.4);
      // Vệt sáng chéo trên kính
      line(ctx, [[side * 17 - 5, -5], [side * 17 + 5, 5]], 'rgba(255, 255, 255, 0.85)', 2.0);
    }
  }

  // 1.13 Đồ bảo hộ: Ủng cao su (ppe_boots)
  function drawPpeBoots(ctx, s, t) {
    const col = s.style?.body || '#d69e24'; // Ủng vàng chống thấm
    for (const side of [-1, 1]) {
      const bx = side * 14;
      // Cổ ủng & bàn chân
      const d = `M ${bx - 7} 0 L ${bx - 8} -44 L ${bx + 8} -44 L ${bx + 7} -6 C ${bx + 14} -6 ${bx + 20} 0 ${bx + 16} 5 L ${bx - 7} 5 Z`;
      path(ctx, d, cylinder(ctx, bx - 8, bx + 16, col), INK, 2.0);
      // Đế ủng cao su đen có rãnh
      line(ctx, [[bx - 7, 4], [bx + 16, 4]], '#1e242c', 3.2);
    }
  }

  // 1.14 Biển cảnh báo an toàn hình thoi (warning_sign)
  function drawWarningSign(ctx, s, t) {
    // Cọc cắm đất bằng kim loại
    line(ctx, [[0, 0], [0, -80]], INK, 4.4);
    line(ctx, [[0, 0], [0, -80]], '#7c8894', 2.6);

    // Biển hình thoi cảnh báo ở đỉnh cọc
    drawGhsDiamond(ctx, 0, -80, 28, 'skull');
  }

  // 1.15 Chậu rửa rau quả (rinse_basin)
  function drawRinseBasin(ctx, s, t) {
    const col = s.style?.body || '#d8e4ea'; // Inox sáng bóng
    // Đáy chậu & thành chậu
    const d = 'M -44 0 C -48 -14 -42 -28 -38 -34 L 38 -34 C 42 -28 48 -14 44 0 Z';
    path(ctx, d, cylinder(ctx, -44, 44, col), INK, 2.2);

    // Mặt nước trong veo bên trong chậu
    ellipse(ctx, 0, -32, 38, 10, 'rgba(88, 180, 230, 0.7)', tone(col, -0.2), 1.6);

    // Gợn sóng & bóng nước lăn tăn
    ctx.save();
    for (let i = -2; i <= 2; i++) {
      const bx = i * 13 + Math.sin(t * 2 + i) * 3, by = -32 + Math.cos(t * 2 + i) * 2;
      ellipse(ctx, bx, by, 3.2, 2.0, 'rgba(255, 255, 255, 0.65)', null);
    }
    ctx.restore();
  }

  // -------------------------------------------------------------
  // 2. STATE VÀ HIỆU ỨNG: TOXIC & CONTAMINATED & SPRAY_DRIFT
  // -------------------------------------------------------------

  // Hiệu ứng hạt sương độc hại và nước ô nhiễm
  function agrochemCustomEffects(ctx, snapshot, cat, kit) {
    const { ellipse, line, path } = kit;
    const t = snapshot.t;

    // A. Hiệu ứng sương độc quanh đối tượng có s.toxic > 0
    for (const [id, s] of Object.entries(snapshot.states)) {
      const toxic = s.toxic || 0;
      if (toxic > 0.05) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, toxic * 0.85);
        const w = (s.height || 100) * 0.45;
        // Làn sương khói độc ngả xanh vàng quanh nhân vật
        for (let i = 0; i < 7; i++) {
          const ph = ((t * 1.5 + i * 0.8) % 2) / 2;
          const sx = s.x + Math.sin(i * 3 + t * 2) * w * 0.7;
          const sy = s.y - (s.height || 100) * (0.2 + ph * 0.7);
          const r = 6 + ph * 14;
          ellipse(ctx, sx, sy, r, r * 0.8, 'rgba(164, 212, 66, 0.28)', null);
        }
        ctx.restore();
      }
    }

    // B. Hiệu ứng động tác spray_drift: sương phun trôi theo hướng s.wind
    for (const a of snapshot.live || []) {
      if (a.type === 'spray_drift') {
        const actor = snapshot.states[a.actor];
        if (!actor) continue;
        const nozzle = RemakeVector.worldAnchor(cat, actor, a.actor_anchor || 'nozzle');
        const wind = snapshot.wind || 0;
        const windDir = actor.flip ? -1 : 1;
        const driftX = wind * 140 * windDir;

        ctx.save();
        for (let i = 0; i < 28; i++) {
          const age = ((t - a.start) * 2.8 - i / 28);
          if (age < 0) continue;
          const u = age % 1;
          const px = nozzle.x + (u * 120 * (actor.flip ? -1 : 1)) + (u * u * driftX) + Math.sin(i * 11) * u * 20;
          const py = nozzle.y + (u * 40) + Math.cos(i * 7) * u * 15;
          const r = 2.5 + u * 10;
          ellipse(ctx, px, py, r, r, 'rgba(180, 224, 76, 0.35)', null);
        }
        ctx.restore();
      } else if (a.type === 'pour') {
        // Động tác rót (dòng chảy mềm)
        const actor = snapshot.states[a.actor];
        const target = snapshot.states[a.target];
        if (!actor || !target) continue;
        const from = RemakeVector.worldAnchor(cat, actor, a.actor_anchor || 'spout');
        const to = RemakeVector.worldAnchor(cat, target, a.target_anchor || 'rim');
        ctx.save();
        for (let i = 0; i < 14; i++) {
          const age = ((t - a.start) * 3 - i / 14);
          if (age < 0) continue;
          const u = age % 1;
          const x = mix(from.x, to.x, u) + Math.sin(i * 5) * 2;
          const y = mix(from.y, to.y, u * u);
          ellipse(ctx, x, y, 3, 5, 'rgba(100, 185, 235, 0.75)', null);
        }
        ctx.restore();
      } else if (a.type === 'scatter') {
        // Động tác rải hạt phân bón theo cung parabol
        const actor = snapshot.states[a.actor];
        const target = snapshot.states[a.target];
        if (!actor || !target) continue;
        const from = RemakeVector.worldAnchor(cat, actor, a.actor_anchor || 'palm');
        const to = RemakeVector.worldAnchor(cat, target, a.target_anchor || 'soil');
        ctx.save();
        for (let i = 0; i < 20; i++) {
          const age = ((t - a.start) * 2.2 - i / 20);
          if (age < 0) continue;
          const u = age % 1;
          const arcY = -Math.sin(u * Math.PI) * 55;
          const x = mix(from.x, to.x, u) + (i % 5 - 2) * 6;
          const y = mix(from.y, to.y, u) + arcY;
          ellipse(ctx, x, y, 2.5, 2.5, i % 2 ? '#62b2e4' : '#e4d6a8', null);
        }
        ctx.restore();
      } else if (a.type === 'wash_produce') {
        // Động tác rửa rau: bọt xà phòng & tia nước sạch
        const target = snapshot.states[a.target];
        if (!target) continue;
        ctx.save();
        for (let i = 0; i < 12; i++) {
          const ang = t * 4 + i * (Math.PI / 6);
          const bx = target.x + Math.cos(ang) * 28, by = target.y + Math.sin(ang) * 16;
          ellipse(ctx, bx, by, 3.5, 3.5, 'rgba(255,255,255,0.7)', 'rgba(80,180,240,0.6)', 1.0);
        }
        ctx.restore();
      }
    }
  }

  // Action hook xử lý cập nhật trạng thái động tác
  const agrochemActionHooks = {
    spray_drift(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (actor) {
        actor.spray = smooth(u);
      }
      // Khi sương trôi chạm vào target, kích hoạt toxic trên target
      const target = states[a.target];
      if (target && active) {
        target.toxic = clamp((target.toxic || 0) + 0.5 * amount * smooth(clamp(p * 2)));
      }
    },
    pour(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (actor) {
        actor.rotation = (actor.rotation || 0) + (actor.flip ? 45 : -45) * smooth(u);
      }
      const target = states[a.target];
      if (target && active) {
        target.fill = clamp((target.fill || 0) + 0.3 * amount * p);
      }
    },
    scatter(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (actor && actor.arm !== undefined) {
        actor.arm = Math.sin(p * Math.PI) * 0.8;
      }
      const target = states[a.target];
      if (target && active) {
        target.nutrients = clamp((target.nutrients || 0) + 0.4 * amount * p);
      }
    },
    wash_produce(a, states, t, p, u, amount, cat, active) {
      const target = states[a.target];
      if (target && active) {
        target.wet = 1.0;
        // Giải độc và làm sạch
        if (target.toxic) target.toxic = Math.max(0, target.toxic - 0.6 * p);
        if (target.dirty) target.dirty = Math.max(0, target.dirty - 0.8 * p);
      }
    },
    wilt(a, states, t, p, u, amount, cat, active) {
      const target = states[a.target];
      if (target && active) {
        target.damage = clamp((target.damage || 0) + 0.6 * smooth(p));
        target.bend = (target.bend || 0) + 0.35 * smooth(p);
      }
    },
    perk_up(a, states, t, p, u, amount, cat, active) {
      const target = states[a.target];
      if (target && active) {
        target.damage = Math.max(0, (target.damage || 0) - 0.7 * smooth(p));
        target.bend = Math.max(0, (target.bend || 0) - 0.4 * smooth(p));
      }
    }
  };

  // -------------------------------------------------------------
  // 3. HÌNH NỀN: farm_warehouse & kitchen (Theme: farm, home)
  // -------------------------------------------------------------

  // 3.1 Nhà kho nông trại (farm_warehouse)
  function drawFarmWarehouse(ctx, settings, t, kit) {
    const W = 576, H = 1024, GY = 810;
    const isNight = settings.time === 'night';

    // Bầu tường kho gỗ / tôn công nghiệp sáng sủa
    const wall = ctx.createLinearGradient(0, 0, 0, GY);
    if (isNight) {
      wall.addColorStop(0, '#121820');
      wall.addColorStop(1, '#1e2632');
    } else {
      wall.addColorStop(0, '#d8dfd4');
      wall.addColorStop(0.7, '#c2ccc0');
      wall.addColorStop(1, '#a8b6a6');
    }
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, GY);

    // Các dầm gỗ chịu lực của nhà kho
    for (let x = 72; x < W; x += 144) {
      ctx.fillStyle = isNight ? '#161c24' : '#6d5a42';
      ctx.fillRect(x - 8, 0, 16, GY);
    }
    // Dầm ngang
    ctx.fillStyle = isNight ? '#1a222c' : '#7c664c';
    ctx.fillRect(0, 180, W, 20);
    ctx.fillRect(0, 420, W, 20);

    // Cửa sổ lấy sáng ở trên vách
    const winX = 216, winY = 60, winW = 144, winH = 90;
    ctx.fillStyle = isNight ? '#0b1016' : '#eaf6fa';
    ctx.fillRect(winX, winY, winW, winH);
    ctx.strokeStyle = isNight ? '#222e3c' : '#4a3c2a';
    ctx.lineWidth = 4;
    ctx.strokeRect(winX, winY, winW, winH);
    // Khung chữ thập cửa sổ
    ctx.beginPath();
    ctx.moveTo(winX + winW / 2, winY); ctx.lineTo(winX + winW / 2, winY + winH);
    ctx.moveTo(winX, winY + winH / 2); ctx.lineTo(winX + winW, winY + winH / 2);
    ctx.stroke();

    // Vệt nắng chiếu xiên từ cửa sổ (nếu ban ngày)
    if (!isNight) {
      ctx.save();
      const sunbeam = ctx.createLinearGradient(winX, winY, 120, GY);
      sunbeam.addColorStop(0, 'rgba(255, 255, 240, 0.35)');
      sunbeam.addColorStop(1, 'rgba(255, 255, 240, 0.02)');
      ctx.fillStyle = sunbeam;
      ctx.beginPath();
      ctx.moveTo(winX, winY);
      ctx.lineTo(winX + winW, winY);
      ctx.lineTo(W * 0.7, GY);
      ctx.lineTo(W * 0.1, GY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Sàn bê tông phẳng chịu tải
    const floor = ctx.createLinearGradient(0, GY, 0, H);
    if (isNight) {
      floor.addColorStop(0, '#1a2028');
      floor.addColorStop(1, '#0e1218');
    } else {
      floor.addColorStop(0, '#788480');
      floor.addColorStop(0.3, '#62706c');
      floor.addColorStop(1, '#4e5a56');
    }
    ctx.fillStyle = floor;
    ctx.fillRect(0, GY, W, H - GY);
    // Vạch chỉ giới an toàn màu vàng đen ở mép sàn
    for (let x = 0; x < W; x += 40) {
      ctx.fillStyle = (x / 40) % 2 === 0 ? '#d4a824' : '#1e2428';
      ctx.fillRect(x, GY, 40, 6);
    }
  }

  // 3.2 Gian bếp gia đình (kitchen)
  function drawKitchen(ctx, settings, t, kit) {
    const W = 576, H = 1024, GY = 810;
    const isNight = settings.time === 'night';

    // Tường bếp lát gạch men màu kem ấm cúng
    const wall = ctx.createLinearGradient(0, 0, 0, GY);
    if (isNight) {
      wall.addColorStop(0, '#161c22');
      wall.addColorStop(1, '#222a34');
    } else {
      wall.addColorStop(0, '#f8f4ec');
      wall.addColorStop(1, '#e8e2d4');
    }
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, GY);

    // Kẻ lưới gạch men tường bếp
    ctx.strokeStyle = isNight ? '#2a3440' : '#dad2c2';
    ctx.lineWidth = 1;
    for (let y = 100; y < GY - 160; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 100); ctx.lineTo(x, GY - 160); ctx.stroke();
    }

    // Cửa sổ nhìn ra vườn cây
    const winX = 144, winY = 80, winW = 288, winH = 180;
    ctx.fillStyle = isNight ? '#0a1420' : '#7cb884'; // Ngoài vườn cây
    ctx.fillRect(winX, winY, winW, winH);
    if (!isNight) {
      // Vòm lá xanh ngoài cửa sổ
      ctx.fillStyle = '#5c9c64';
      ctx.beginPath();
      ctx.arc(winX + 60, winY + 60, 45, 0, Math.PI * 2);
      ctx.arc(winX + 220, winY + 80, 55, 0, Math.PI * 2);
      ctx.fill();
    }
    // Khung cửa sổ gỗ màu trắng
    ctx.strokeStyle = isNight ? '#2a3442' : '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(winX, winY, winW, winH);

    // Mặt bàn bếp (kitchen counter)
    const counterY = GY - 160;
    const counterH = 160;
    ctx.fillStyle = isNight ? '#1c222a' : '#dfdbd4'; // Đá hoa cương bếp
    ctx.fillRect(0, counterY, W, 24);
    ctx.fillStyle = isNight ? '#141820' : '#c8c2b8';
    ctx.fillRect(0, counterY + 24, W, counterH - 24);

    // Bồn rửa chén bát inox bên góc trái bàn bếp
    ctx.fillStyle = isNight ? '#202832' : '#a8b6be';
    ctx.fillRect(40, counterY + 4, 180, 16);
    // Vòi nước inox uốn cong
    ctx.strokeStyle = isNight ? '#485664' : '#ccd8de';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(130, counterY + 4);
    ctx.lineTo(130, counterY - 45);
    ctx.arc(115, counterY - 45, 15, 0, Math.PI, true);
    ctx.lineTo(100, counterY - 30);
    ctx.stroke();

    // Sàn nhà lát gạch vuông
    const floor = ctx.createLinearGradient(0, GY, 0, H);
    if (isNight) {
      floor.addColorStop(0, '#181e26');
      floor.addColorStop(1, '#0e1218');
    } else {
      floor.addColorStop(0, '#d4c4b2');
      floor.addColorStop(1, '#bca894');
    }
    ctx.fillStyle = floor;
    ctx.fillRect(0, GY, W, H - GY);
  }

  // -------------------------------------------------------------
  // 4. ĐĂNG KÝ VÀO RemakeVector
  // -------------------------------------------------------------
  const rigs = {
    fertilizer_sack: { group: 'prop', draw: drawFertilizerSack },
    compost_heap: { group: 'prop', draw: drawCompostHeap },
    manure_pile: { group: 'prop', draw: drawManurePile },
    compost_bin: { group: 'prop', draw: drawCompostBin },
    granules: { group: 'prop', draw: drawGranules },
    pesticide_bottle: { group: 'prop', draw: drawPesticideBottle },
    backpack_sprayer: { group: 'tool', draw: drawBackpackSprayer },
    jerrycan: { group: 'prop', draw: drawJerrycan },
    chem_cabinet: { group: 'prop', draw: drawChemCabinet },
    ppe_gloves: { group: 'prop', draw: drawPpeGloves },
    ppe_mask: { group: 'prop', draw: drawPpeMask },
    ppe_goggles: { group: 'prop', draw: drawPpeGoggles },
    ppe_boots: { group: 'prop', draw: drawPpeBoots },
    warning_sign: { group: 'prop', draw: drawWarningSign },
    rinse_basin: { group: 'prop', draw: drawRinseBasin }
  };

  const backgrounds = {
    farm_warehouse: {
      label: 'Nhà kho trang trại',
      theme: 'farm',
      ground_y: 810,
      draw: drawFarmWarehouse
    },
    kitchen: {
      label: 'Gian bếp gia đình',
      theme: 'home',
      ground_y: 810,
      draw: drawKitchen
    }
  };

  RemakeVector.register({
    rigs,
    backgrounds,
    effects: [agrochemCustomEffects],
    actionHooks: agrochemActionHooks
  });
})();

