// remake_vector_packs/vehicles.js — Giai đoạn J: Họ vật thể Phương tiện giao thông (drawVehicle)
// Hỗ trợ xe đường bộ, đường sắt, đường thuỷ, trên không và vũ trụ.
// Đầy đủ bánh xe quay theo s.vx, nhún lò xo, ghế ngồi seat_1..seat_n, door, hitch.

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
  // CẤU HÌNH CÁC DÒNG XE (VEHICLE SPECS)
  // -------------------------------------------------------------
  const VEHICLE_SPECS = {
    bicycle: {
      label: 'Xe đạp',
      category: 'road',
      width: 80, height: 50,
      color: '#0284c7',
      wheels: [[-28, 15, 14], [28, 15, 14]],
      seats: [[-6, -28]],  // yên xe (vẽ ở y −28 trước khi nhấc)
      hitch: [35, -5],
      topics: ['safety', 'jobs']
    },
    car: {
      label: 'Xe ô tô con',
      category: 'road',
      width: 110, height: 52,
      color: '#e11d48',
      wheels: [[-34, 15, 13], [34, 15, 13]],
      seats: [[-10, -28], [15, -28]],
      topics: ['jobs', 'safety']
    },
    school_bus: {
      label: 'Xe buýt trường học',
      category: 'road',
      width: 140, height: 68,
      color: '#eab308', // Vàng tiêu chuẩn
      locale_colors: { de: '#f8fafc', us: '#eab308', jp: '#fef08a', kr: '#facc15' },
      wheels: [[-46, 16, 15], [46, 16, 15]],
      seats: [[-35, -36], [-10, -36], [15, -36]],
      topics: ['school', 'safety']
    },
    city_bus: {
      label: 'Xe buýt thành phố',
      category: 'road',
      width: 146, height: 72,
      color: '#2563eb',
      wheels: [[-48, 16, 15], [48, 16, 15]],
      seats: [[-35, -38], [-10, -38], [18, -38]],
      topics: ['jobs', 'recycling']
    },
    fire_truck: {
      label: 'Xe cứu hoả',
      category: 'road',
      width: 140, height: 75,
      color: '#dc2626',
      wheels: [[-46, 17, 16], [46, 17, 16]],
      seats: [[25, -42]],
      topics: ['safety', 'jobs']
    },
    ambulance: {
      label: 'Xe cứu thương',
      category: 'road',
      width: 130, height: 68,
      color: '#ffffff',
      wheels: [[-40, 16, 14], [40, 16, 14]],
      seats: [[20, -36]],
      topics: ['safety', 'jobs']
    },
    police_car: {
      label: 'Xe cảnh sát tuần tra',
      category: 'road',
      width: 115, height: 55,
      color: '#1e293b',
      wheels: [[-35, 15, 13], [35, 15, 13]],
      seats: [[-8, -30], [16, -30]],
      topics: ['safety', 'jobs']
    },
    tractor: {
      label: 'Máy kéo nông nghiệp',
      category: 'road',
      width: 100, height: 75,
      color: '#16a34a',
      wheels: [[-26, 25, 23], [34, 14, 12]],
      seats: [[-8, -48]],
      hitch: [-48, 12],
      topics: ['farm', 'jobs']
    },
    excavator: {
      label: 'Máy xúc đào',
      category: 'road',
      width: 120, height: 80,
      color: '#eab308',
      tracks: true,
      wheels: [[-32, 12, 11], [0, 12, 11], [32, 12, 11]],
      seats: [[-12, -45]],
      topics: ['jobs', 'ancient']
    },
    dump_truck: {
      label: 'Xe tải ben',
      category: 'road',
      width: 135, height: 75,
      color: '#f97316',
      wheels: [[-42, 17, 16], [42, 17, 16]],
      seats: [[32, -42]],
      topics: ['jobs', 'recycling']
    },
    horse_cart: {
      label: 'Xe ngựa kéo',
      category: 'vintage',
      width: 100, height: 50,
      color: '#78350f',
      wheels: [[-18, 18, 17], [22, 18, 17]],
      seats: [[10, -28]],
      hitch: [52, 6],
      topics: ['ancient', 'medieval']
    },
    covered_wagon: {
      label: 'Xe ngựa thùng có bạt',
      category: 'vintage',
      width: 120, height: 80,
      color: '#f8fafc',
      wheels: [[-36, 20, 19], [34, 18, 16]],
      seats: [[28, -34]],
      hitch: [58, 6],
      topics: ['us_culture', 'history']
    },
    motorcar_1886: {
      label: 'Xe ô tô ba bánh 1886 (Benz)',
      category: 'vintage',
      width: 90, height: 60,
      color: '#1c1917',
      wheels: [[-24, 22, 21], [28, 14, 13]],
      seats: [[-4, -42]],
      topics: ['inventions', 'de_culture']
    },
    steam_train: {
      label: 'Tàu hoả hơi nước',
      category: 'rail',
      width: 150, height: 85,
      color: '#0f172a',
      wheels: [[-40, 20, 19], [-8, 20, 19], [24, 20, 19], [52, 12, 11]],
      seats: [[-42, -54]],
      topics: ['inventions', 'history']
    },
    high_speed_train: {
      label: 'Tàu cao tốc khí động học',
      category: 'rail',
      width: 160, height: 65,
      color: '#f8fafc',
      wheels: [[-50, 12, 11], [-30, 12, 11], [30, 12, 11], [50, 12, 11]],
      seats: [[-20, -32], [20, -32]],
      topics: ['inventions', 'jp_culture']
    },
    tram: {
      label: 'Tàu điện đường phố',
      category: 'rail',
      width: 135, height: 75,
      color: '#eab308',
      wheels: [[-40, 12, 11], [40, 12, 11]],
      seats: [[-20, -34], [20, -34]],
      topics: ['de_culture', 'recycling']
    },
    sailing_ship: {
      label: 'Thuyền buồm lớn',
      category: 'water',
      width: 140, height: 120,
      color: '#78350f',
      wheels: [],
      seats: [[-10, -40], [20, -40]],
      topics: ['ocean', 'history']
    },
    longship: {
      label: 'Thuyền rồng Viking',
      category: 'water',
      width: 145, height: 85,
      color: '#57534e',
      wheels: [],
      seats: [[-20, -25], [0, -25], [20, -25]],
      topics: ['medieval', 'ocean']
    },
    turtle_ship: {
      label: 'Thuyền rùa Geobukseon',
      category: 'water',
      width: 140, height: 80,
      color: '#44403c',
      wheels: [],
      seats: [[0, -30]],
      topics: ['kr_culture', 'ocean']
    },
    biplane_1903: {
      label: 'Máy bay cánh kép 1903',
      category: 'air',
      width: 130, height: 65,
      color: '#fef08a',
      wheels: [[-20, 10, 8], [20, 10, 8]],
      seats: [[0, -28]],
      topics: ['inventions', 'us_culture']
    },
    hot_air_balloon: {
      label: 'Khinh khí cầu',
      category: 'air',
      width: 110, height: 150,
      color: '#ef4444',
      wheels: [],
      seats: [[-10, -22], [10, -22]],
      topics: ['inventions', 'festivals']
    },
    rocket: {
      label: 'Tên lửa không gian',
      category: 'air',
      width: 60, height: 160,
      color: '#ffffff',
      wheels: [],
      seats: [[0, -120]],
      topics: ['space', 'inventions']
    },
    lunar_lander: {
      label: 'Mô-đun đổ bộ mặt trăng',
      category: 'air',
      width: 100, height: 95,
      color: '#eab308',
      wheels: [],
      seats: [[0, -50]],
      topics: ['space', 'us_culture']
    }
  };

  // Khoảng từ gốc tới điểm chạm đất của hình vẽ (đáy bánh, đáy xích, chân đế). Hình vẽ gốc đặt thân ở y≈0
  // và bánh xe BÊN DƯỚI gốc, nên drawVehicle nhấc cả xe lên đúng khoảng này để bánh chạm ground_y.
  // Tàu thuyền giữ 0: thân tàu chìm dưới mặt nước như thật.
  const GROUND_OFFSET = { rocket: 15, lunar_lander: 14, hot_air_balloon: 4 };
  function groundOffset(spec, id) {
    if (spec.category === 'water') return 0;
    if (id in GROUND_OFFSET) return GROUND_OFFSET[id];
    if (spec.tracks) return 18;
    return Math.max(0, ...(spec.wheels || []).map(([, wy, wr]) => wy + wr));
  }

  // -------------------------------------------------------------
  // HÀM VẼ CHÍNH: drawVehicle()
  // -------------------------------------------------------------
  function drawVehicle(ctx, s, t, spec, cat, kit) {
    const vx = s.vx || 0;
    const susp = Math.sin(t * 12) * Math.min(2.0, Math.abs(vx) * 3);
    const roll = t * vx * 18;
    const baseCol = (s.style && s.style.body) || (spec.locale_colors && spec.locale_colors[s.locale || 'neutral']) || spec.color || '#2563eb';

    const id = s.asset;
    ctx.save();
    ctx.translate(0, susp - groundOffset(spec, id));

    // A. VẼ BÁNH XE HOẶC BĂNG XÍCH
    if (spec.tracks) {
      // Băng xích máy xúc
      drawPoly(ctx, [[-45, 0], [45, 0], [38, 18], [-38, 18]], '#1e293b', INK, 1.6);
      for (let tx = -32; tx <= 32; tx += 16) {
        ellipse(ctx, tx, 9, 6, 6, '#475569', INK, 1.2);
      }
    } else if (spec.wheels && spec.wheels.length > 0) {
      for (let i = 0; i < spec.wheels.length; i++) {
        const [wx, wy, wr] = spec.wheels[i];
        ctx.save();
        ctx.translate(wx, 0);
        // Lốp cao su
        ellipse(ctx, 0, wy, wr, wr, '#0f172a', INK, 1.6);
        // Vành mâm xe
        ellipse(ctx, 0, wy, wr * 0.55, wr * 0.55, '#cbd5e1', INK, 1.2);
        // Nan hoa xoay theo vận tốc
        ctx.save();
        ctx.translate(0, wy);
        ctx.rotate(roll);
        for (let a = 0; a < 4; a++) {
          ctx.rotate(Math.PI / 4);
          line(ctx, [[-wr * 0.45, 0], [wr * 0.45, 0]], '#64748b', 1.0);
        }
        ctx.restore();
        ctx.restore();
      }
    }

    // B. VẼ THÂN XE RIÊNG THEO TỪNG LOẠI
    if (id === 'bicycle') {
      // Khung xe đạp tam giác thanh mảnh
      line(ctx, [[-28, 15], [0, 15], [-6, -26], [-28, 15]], baseCol, 2.5);
      line(ctx, [[0, 15], [20, -32], [28, 15]], baseCol, 2.5);
      // Ghi đông và yên xe
      line(ctx, [[18, -32], [24, -36]], '#1e293b', 3.0);
      ellipse(ctx, -6, -28, 6, 2.5, '#0f172a', null);
    } else if (id === 'car') {
      // Ô tô con mui kín
      path(ctx, `M -50 8 L -48 -10 Q -40 -16 -24 -16 L -16 -38 Q 0 -44 20 -38 L 36 -16 Q 48 -16 52 -10 L 50 8 Z`, baseCol, INK, 2.0);
      // Cửa sổ
      path(ctx, `M -12 -34 L 14 -34 L 28 -18 L -18 -18 Z`, 'rgba(125, 211, 252, 0.55)', INK, 1.2);
      // Đèn pha
      ellipse(ctx, 48, -4, 3, 5, '#fef08a', INK, 1.0);
    } else if (id === 'school_bus' || id === 'city_bus') {
      // Xe buýt lớn hình hộp chữ nhật bo góc
      path(ctx, `M -65 8 L -65 -48 Q -60 -58 -45 -58 L 50 -58 Q 66 -58 66 -35 L 66 8 Z`, baseCol, INK, 2.2);
      // Dãy cửa sổ kính
      for (let bx = -50; bx <= 35; bx += 22) {
        path(ctx, `M ${bx} -48 L ${bx + 16} -48 L ${bx + 16} -28 L ${bx} -28 Z`, 'rgba(186, 230, 253, 0.55)', INK, 1.2);
      }
      // Dải sọc bên hông
      line(ctx, [[-64, -14], [65, -14]], '#1e293b', 2.0);
    } else if (id === 'fire_truck') {
      // Xe cứu hoả đỏ có thang
      path(ctx, `M -64 8 L -64 -46 L 20 -46 L 20 -54 Q 30 -58 56 -54 L 62 -28 L 62 8 Z`, baseCol, INK, 2.2);
      // Thang xếp màu bạc trên nóc
      line(ctx, [[-58, -52], [14, -52]], '#cbd5e1', 3.5);
      line(ctx, [[-58, -48], [14, -48]], '#cbd5e1', 3.5);
      // Còi đèn xoay chớp
      ellipse(ctx, 36, -58, 4, 6, Math.sin(t * 15) > 0 ? '#38bdf8' : '#ef4444', INK, 1.0);
    } else if (id === 'ambulance') {
      // Xe cứu thương trắng có dấu cộng xanh y tế
      path(ctx, `M -60 8 L -60 -52 Q -45 -54 25 -54 L 56 -30 L 56 8 Z`, baseCol, INK, 2.0);
      path(ctx, `M 22 -46 L 46 -30 L 16 -30 Z`, '#38bdf8', INK, 1.0);
      // Dấu cộng xanh y tế (KHÔNG ĐƯỢC DÙNG ĐỎ)
      RemakeVector.kit.PICTOGRAMS.first_aid(ctx, -18, -25, 18, 'cross');
      // Đèn nóc
      ellipse(ctx, 0, -58, 5, 4, '#38bdf8', INK, 1.0);
    } else if (id === 'police_car') {
      // Xe cảnh sát
      path(ctx, `M -52 8 L -48 -12 Q -38 -18 -22 -18 L -14 -40 Q 4 -44 24 -40 L 38 -18 Q 48 -18 52 -10 L 50 8 Z`, baseCol, INK, 2.0);
      path(ctx, `M -10 -36 L 18 -36 L 30 -20 L -16 -20 Z`, '#e2e8f0', INK, 1.0);
      // Đèn chớp xanh đỏ trên nóc
      ellipse(ctx, 2, -43, 6, 3, '#38bdf8', INK, 1.0);
    } else if (id === 'tractor') {
      // Cabin và mũi máy kéo
      path(ctx, `M -36 12 L -36 -52 L 2 -52 L 2 -24 L 44 -24 L 44 8 Z`, baseCol, INK, 2.2);
      // Ống khói
      line(ctx, [[28, -24], [28, -50]], '#0f172a', 3.0);
      ellipse(ctx, -14, -38, 12, 10, 'rgba(186, 230, 253, 0.55)', INK, 1.2);
    } else if (id === 'excavator') {
      // Thân máy xúc & cần gầu đào
      path(ctx, `M -35 0 L -35 -48 L 10 -48 L 16 -10 L 25 0 Z`, baseCol, INK, 2.0);
      ellipse(ctx, -10, -32, 12, 12, 'rgba(186, 230, 253, 0.55)', INK, 1.2);
      // Cần cẩu gấp khúc
      const armSwing = Math.sin(t * 3) * 0.2;
      ctx.save();
      ctx.translate(14, -20);
      ctx.rotate(-0.6 + armSwing);
      line(ctx, [[0, 0], [35, -20]], '#facc15', 6.0);
      ctx.translate(35, -20);
      ctx.rotate(1.2 - armSwing * 1.5);
      line(ctx, [[0, 0], [30, 20]], '#facc15', 5.0);
      // Gầu xúc
      ctx.translate(30, 20);
      drawPoly(ctx, [[0, 0], [18, 5], [14, 22], [-4, 18]], '#334155', INK, 1.5);
      ctx.restore();
    } else if (id === 'dump_truck') {
      // Cabin và thùng ben lật
      path(ctx, `M 15 8 L 15 -48 L 52 -48 L 58 -20 L 58 8 Z`, '#3b82f6', INK, 2.0);
      // Thùng xe (nghiêng khi s.open > 0)
      const tilt = (s.open || 0) * -0.4;
      ctx.save();
      ctx.translate(-50, 4);
      ctx.rotate(tilt);
      drawPoly(ctx, [[0, 0], [60, 0], [65, -38], [0, -38]], baseCol, INK, 2.0);
      ctx.restore();
    } else if (id === 'horse_cart' || id === 'covered_wagon') {
      // Thùng gỗ xe ngựa
      drawPoly(ctx, [[-45, 6], [45, 6], [48, -20], [-45, -20]], '#854d0e', INK, 2.0);
      if (id === 'covered_wagon') {
        // Mái vòm bạt trắng
        path(ctx, `M -45 -20 Q -48 -68 0 -72 Q 48 -68 46 -20 Z`, '#f8fafc', INK, 2.0);
      }
    } else if (id === 'motorcar_1886') {
      // Xe ba bánh đời đầu (1886, dáng chung): khung ống, ghế băng bọc da, cần lái, động cơ và bánh đà phía sau.
      line(ctx, [[-32, 20], [30, 12]], '#1e293b', 3.2);
      line(ctx, [[28, 14], [18, -8]], '#1e293b', 2.4);
      drawPoly(ctx, [[-36, 16], [-22, 16], [-22, 0], [-36, 0]], '#57534e', INK, 1.4);
      ellipse(ctx, -29, 18, 9, 3, '#78716c', INK, 1.2);
      path(ctx, 'M -24 -2 L 6 -2 L 6 -10 L -24 -10 Z', '#7c2d12', INK, 1.4);
      path(ctx, 'M -24 -10 L -26 -30 Q -20 -32 -18 -28 L -18 -10 Z', '#7c2d12', INK, 1.4);
      line(ctx, [[6, -6], [16, -30]], '#1e293b', 2.2);
      line(ctx, [[12, -31], [20, -29]], '#1e293b', 2.4);
      ellipse(ctx, -2, 4, 3, 3, '#eab308', INK, 1);
    } else if (id === 'steam_train') {
      // Đầu máy hơi nước
      taper(ctx, -22, -28, 48, -28, 18, 18, '#1e293b', INK, 2.0);
      drawPoly(ctx, [[-62, 10], [-62, -62], [-22, -62], [-22, 10]], baseCol, INK, 2.0);
      // Ống khói phía trước
      taper(ctx, 52, -36, 52, -56, 5, 7, '#0f172a', INK, 1.6);
      // Khói hơi nước bay theo t
      for (let si = 0; si < 3; si++) {
        const puffX = 52 - (t * 40 + si * 25) % 90;
        const puffY = -70 - si * 12;
        ellipse(ctx, puffX, puffY, 10 + si * 4, 8 + si * 3, 'rgba(241, 245, 249, 0.65)', null);
      }
    } else if (id === 'high_speed_train') {
      // Mũi tàu vuốt nhọn
      path(ctx, `M -75 5 L -75 -44 L 20 -44 Q 65 -44 78 5 Z`, baseCol, INK, 2.0);
      path(ctx, `M -70 -34 L 40 -34 Q 55 -34 65 -22 L -70 -22 Z`, '#0284c7', null);
    } else if (id === 'tram') {
      // Tàu điện: thân hai màu, dãy cửa sổ, cửa gấp, mái và cần tiếp điện.
      path(ctx, 'M -62 8 L -62 -44 Q -62 -54 -52 -54 L 52 -54 Q 62 -54 62 -44 L 62 8 Z', baseCol, INK, 2.0);
      path(ctx, 'M -62 -12 L 62 -12 L 62 8 L -62 8 Z', tone(baseCol, -0.25), INK, 1.4);
      for (let x = -54; x <= 36; x += 18) path(ctx, `M ${x} -46 L ${x + 14} -46 L ${x + 14} -24 L ${x} -24 Z`, 'rgba(186, 230, 253, 0.55)', INK, 1.1);
      path(ctx, 'M 44 -46 L 56 -46 L 56 6 L 44 6 Z', '#e2e8f0', INK, 1.2);
      line(ctx, [[50, -46], [50, 6]], INK, 1);
      path(ctx, 'M -40 -54 L 40 -54 L 36 -60 L -36 -60 Z', '#475569', INK, 1.2);
      line(ctx, [[-10, -60], [4, -80], [16, -60]], '#334155', 2.0);
      line(ctx, [[-6, -80], [14, -80]], '#334155', 2.5);
      ellipse(ctx, 60, -6, 2.5, 3.5, '#fef08a', INK, 0.8);
    } else if (id === 'sailing_ship' || id === 'longship' || id === 'turtle_ship') {
      // Thuyền vỏ gỗ
      path(ctx, `M -65 -15 Q -50 18 0 20 Q 50 18 68 -15 L -65 -15 Z`, baseCol, INK, 2.2);
      if (id === 'sailing_ship') {
        // Cột buồm và cánh buồm no gió
        line(ctx, [[0, -15], [0, -95]], '#451a03', 4.0);
        path(ctx, `M -25 -25 Q 5 -20 25 -25 L 20 -85 Q 0 -80 -20 -85 Z`, '#f8fafc', INK, 1.8);
      } else if (id === 'longship') {
        // Thuyền dài Viking: mũi và đuôi cong cao, hàng khiên tròn, mái chèo, buồm vuông kẻ sọc.
        path(ctx, 'M 60 -15 Q 74 -30 70 -52 Q 64 -60 58 -52 Q 64 -44 60 -34 Z', baseCol, INK, 2);
        path(ctx, 'M -60 -15 Q -74 -30 -70 -48 Q -66 -54 -62 -48 Q -66 -38 -58 -30 Z', baseCol, INK, 2);
        ellipse(ctx, 64, -52, 3, 2.4, '#fef3c7', INK, 0.8);
        for (let x = -44; x <= 44; x += 22) line(ctx, [[x + 4, -10], [x - 8, 16]], '#78350f', 2.2);
        for (let x = -48; x <= 48; x += 12) ellipse(ctx, x, -17, 5.5, 5.5, (x / 12) % 2 ? '#b91c1c' : '#facc15', INK, 1.1);
        line(ctx, [[0, -20], [0, -92]], '#451a03', 3.5);
        line(ctx, [[-30, -86], [30, -86]], '#451a03', 2.5);
        path(ctx, 'M -28 -86 L 28 -86 Q 32 -60 28 -34 L -28 -34 Q -32 -60 -28 -86 Z', '#f8fafc', INK, 1.6);
        for (const x of [-18, -6, 6, 18]) path(ctx, `M ${x - 4} -86 L ${x + 4} -86 L ${x + 4} -34 L ${x - 4} -34 Z`, '#dc2626', null);
      } else if (id === 'turtle_ship') {
        // Mai rùa có gai sắt
        path(ctx, `M -55 -15 Q 0 -45 55 -15 Z`, '#292524', INK, 2.0);
        // Đầu rồng phun khói
        path(ctx, `M 55 -15 Q 68 -22 68 -36`, null, '#15803d', 4.0);
      }
    } else if (id === 'biplane_1903') {
      // Máy bay hai tầng cánh
      taper(ctx, -32, -18, 32, -18, 8, 5, '#ca8a04', INK, 1.8);
      line(ctx, [[-55, -34], [55, -34]], '#fef08a', 4.0);
      line(ctx, [[-55, -8], [55, -8]], '#fef08a', 4.0);
      // Cánh quạt quay t
      ctx.save();
      ctx.translate(35, -18);
      ctx.rotate(t * 35);
      line(ctx, [[0, -18], [0, 18]], '#78350f', 3.0);
      ctx.restore();
    } else if (id === 'garbage_truck') {
      // Xe rác: cabin phía trước (trái) + thùng nén rác lớn phía sau; màu theo locale.
      path(ctx, 'M -72 10 L -72 -44 Q -70 -54 -58 -54 L -40 -54 L -34 -30 L -34 10 Z', baseCol, INK, 2.0);
      path(ctx, 'M -66 -46 L -44 -46 L -40 -32 L -66 -32 Z', 'rgba(186, 230, 253, 0.55)', INK, 1.2);
      path(ctx, 'M -32 10 L -32 -64 Q -32 -72 -24 -72 L 62 -72 Q 72 -72 72 -62 L 72 10 Z', tone(baseCol, 0.12), INK, 2.2);
      for (let x = -22; x <= 60; x += 14) line(ctx, [[x, -66], [x, 4]], tone(baseCol, -0.2), 1.2);
      path(ctx, 'M -76 10 L 76 10 L 76 16 L -76 16 Z', '#334155', INK, 1.4);
      ellipse(ctx, -71, -8, 2.5, 4, '#fef08a', INK, 0.8);
    } else if (id === 'hot_air_balloon') {
      // Quả cầu khí nóng
      path(ctx, `M 0 -130 Q -45 -130 -42 -75 Q -38 -40 -15 -30 L 15 -30 Q 38 -40 42 -75 Q 45 -130 0 -130 Z`, baseCol, INK, 2.2);
      // Dây cáp và giỏ mây
      line(ctx, [[-12, -30], [-10, -10]], '#78350f', 1.5);
      line(ctx, [[12, -30], [10, -10]], '#78350f', 1.5);
      drawPoly(ctx, [[-12, -10], [12, -10], [10, 4], [-10, 4]], '#b45309', INK, 1.6);
    } else if (id === 'rocket') {
      // Tên lửa
      path(ctx, `M -16 10 L -16 -95 Q 0 -145 16 -95 L 16 10 Z`, baseCol, INK, 2.2);
      // Vây đuôi
      path(ctx, `M -16 -10 L -30 15 L -16 10 Z`, '#ef4444', INK, 1.4);
      path(ctx, `M 16 -10 L 30 15 L 16 10 Z`, '#ef4444', INK, 1.4);
      // Cửa sổ tròn
      ellipse(ctx, 0, -80, 6, 6, '#38bdf8', INK, 1.4);
      // Lửa phản lực nếu phóng
      if (s.launch || s.flying) {
        path(ctx, `M -10 10 Q 0 38 10 10 Z`, '#facc15', null);
      }
    } else if (id === 'lunar_lander') {
      // Mô đun đổ bộ mặt trăng chân nhện
      drawPoly(ctx, [[-24, -20], [24, -20], [18, -55], [-18, -55]], baseCol, INK, 2.0);
      // 4 chân hạ cánh
      line(ctx, [[-20, -20], [-42, 12]], '#94a3b8', 2.5);
      line(ctx, [[20, -20], [42, 12]], '#94a3b8', 2.5);
      ellipse(ctx, -42, 12, 6, 2, '#475569', null);
      ellipse(ctx, 42, 12, 6, 2, '#475569', null);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  const vehicleRigs = {};
  for (const [id, spec] of Object.entries(VEHICLE_SPECS)) {
    const anchors = {
      root: [0, 0],
      top: [0, -spec.height],
      surface: [0, -spec.height * 0.5],
      door: [spec.width * 0.15, -spec.height * 0.35],
      grip: [spec.width * 0.3, -spec.height * 0.4]
    };
    if (spec.seats) {
      spec.seats.forEach((pos, idx) => {
        anchors[`seat_${idx + 1}`] = pos;
      });
    }
    if (spec.wheels) {
      spec.wheels.forEach((w, idx) => {
        anchors[`wheel_${idx + 1}`] = [w[0], w[1]];
      });
    }
    if (spec.hitch) {
      anchors.hitch = spec.hitch;
    }
    const lift = groundOffset(spec, id);
    for (const [name, pt] of Object.entries(anchors)) if (name !== 'root') anchors[name] = [pt[0], pt[1] - lift];

    vehicleRigs[id] = {
      group: 'vehicle',
      spec,
      anchors,
      draw(ctx, s, t, cat, kit) {
        drawVehicle(ctx, s, t, spec, cat, kit);
      }
    };
  }

  RemakeVector.kit.VEHICLE_SPECS = VEHICLE_SPECS;
  RemakeVector.kit.drawVehicle = drawVehicle;
  RemakeVector.kit.vehicleGroundOffset = groundOffset;
  RemakeVector.kit.VEHICLE_ANCHORS = Object.fromEntries(Object.entries(vehicleRigs).map(([id, r]) => [id, r.anchors]));

  RemakeVector.register({
    rigs: vehicleRigs
  });

})();
