// remake_vector_packs/deep_ocean.js — Nhóm R4: Biển sâu & Đại dương bí ẩn (deep_ocean)
// 9 rigs: giant_squid, sperm_whale, bathyscaphe, research_submarine, hydrothermal_vent,
//         tube_worms, sunken_liner, rogue_wave, bioluminescent_fish_swarm
// 3 backgrounds: trench_floor, hydrothermal_field, stormy_sea (ground_y: 810, 7 weathers, day/night, ZERO text)
// Lưu ý riêng C: tàu khách chìm không tên, không người; không máu me; không vũ khí; không vẽ chữ lên canvas.

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('RemakeVector core engine must be loaded before engine packs.');
  }

  const {
    path,
    line: kitLine,
    ellipse,
    taper,
    cylinder,
    tone,
    volume,
    limb,
    mitten,
    INK,
    TAU,
    clamp,
    smooth,
    mix,
    mixColor,
    hash,
    seeded,
    frameSpan
  } = RemakeVector.kit;

  function line(ctx, a, b, c, d, e, f) {
    if (Array.isArray(a)) return kitLine(ctx, a, b, c);
    return kitLine(ctx, [[a, b], [c, d]], e, f);
  }

  function drawPoly(ctx, pts, fill, stroke, width = 1) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  // Widescreen helpers
  function extRanges(x0, x1) {
    const out = [];
    if (x0 < 0) out.push([x0, 0]);
    if (x1 > 576) out.push([576, x1]);
    return out;
  }

  function tileExt(ext, start, step, origEnd, fn) {
    for (const [a, b] of ext) {
      if (a < 0) { for (let x = start - step; x > a - step; x -= step) fn(x); }
      else { let x = start; while (x <= origEnd) x += step; for (; x < b + step; x += step) fn(x); }
    }
  }

  function scatterExt(ext, step, key, fn) {
    for (const [a, b] of ext) {
      let i = 0;
      for (let x = a + step * 0.5; x < b - step * 0.3; i++) {
        const r = seeded(`${key}:${Math.round(x)}`);
        fn(x, r, i);
        x += step * (0.7 + r * 0.6);
      }
    }
  }

  // =========================================================================
  // 1. GIANT SQUID (Mực khổng lồ)
  // center: [0, -50], top: [0, -96], root: [0, 0]
  // Bounding box: x in [-34, 34], y in [-96, 0]
  // =========================================================================
  function drawGiantSquid(ctx, s, t) {
    const time = t || 0;
    const wave = Math.sin(time * 2.2);
    const waveFast = Math.sin(time * 3.5);

    ctx.save();
    ctx.translate(0, -2);

    // 1. Mantle (Thân nón thuôn nhọn)
    ctx.save();
    // Vây tam giác hai bên đỉnh thân
    ctx.beginPath();
    ctx.moveTo(0, -90);
    ctx.quadraticCurveTo(-32, -80, -28, -66);
    ctx.quadraticCurveTo(-14, -70, 0, -64);
    ctx.quadraticCurveTo(14, -70, 28, -66);
    ctx.quadraticCurveTo(32, -80, 0, -90);
    ctx.fillStyle = '#991b1b';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Thân chính hình thuôn nón
    ctx.beginPath();
    ctx.moveTo(0, -91);
    ctx.quadraticCurveTo(-20, -75, -18, -48);
    ctx.lineTo(18, -48);
    ctx.quadraticCurveTo(20, -75, 0, -91);
    ctx.closePath();
    const mantleGrad = ctx.createLinearGradient(-18, -48, 18, -48);
    mantleGrad.addColorStop(0, '#7f1d1d');
    mantleGrad.addColorStop(0.35, '#dc2626');
    mantleGrad.addColorStop(0.7, '#b91c1c');
    mantleGrad.addColorStop(1, '#991b1b');
    ctx.fillStyle = mantleGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Đốm tế bào sắc tố phát quang dọc thân
    ctx.fillStyle = 'rgba(254, 202, 202, 0.4)';
    for (let row = -85; row <= -55; row += 8) {
      const rx = (Math.abs(row + 95) / 50) * 12;
      ellipse(ctx, -rx * 0.4, row, 1.8, 2.4, 'rgba(254, 202, 202, 0.5)', null);
      ellipse(ctx, rx * 0.4, row + 3, 2.0, 2.0, 'rgba(254, 202, 202, 0.5)', null);
    }
    ctx.restore();

    // 2. Collar & Siphon (Cổ và ống hút nước)
    ctx.beginPath();
    ctx.ellipse(0, -48, 17, 4.5, 0, 0, TAU);
    ctx.fillStyle = '#991b1b';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 3. Head & Giant Saucer Eye (Đầu & mắt đĩa khổng lồ)
    ctx.save();
    ellipse(ctx, 0, -42, 16, 8, '#b91c1c', INK, 1.8);
    // Mắt khổng lồ biển sâu (bên trái và phải)
    for (const [ex, ey] of [[-10, -43], [10, -43]]) {
      // Viền phát quang
      ellipse(ctx, ex, ey, 5.2, 5.2, '#fef08a', INK, 1.4);
      // Con ngươi đen huyền bí
      ellipse(ctx, ex + 0.5, ey, 3.2, 3.2, '#0f172a', null);
      // Đốm phản chiếu ánh sáng biển sâu
      ellipse(ctx, ex - 1, ey - 1.2, 1.2, 1.2, '#ffffff', null);
    }
    ctx.restore();

    // 4. Arms (8 xúc tua ngắn uốn lượn)
    ctx.save();
    const armColors = ['#991b1b', '#b91c1c', '#dc2626'];
    for (let a = -3; a <= 4; a++) {
      if (a === 0) continue;
      const armIdx = a + 3;
      const baseAx = a * 4.2;
      const armW = Math.sin(time * 2.4 + armIdx * 0.8) * 6;
      ctx.beginPath();
      ctx.moveTo(baseAx, -38);
      ctx.quadraticCurveTo(baseAx + armW * 0.6, -24, baseAx * 1.3 + armW, -10);
      ctx.strokeStyle = armColors[armIdx % armColors.length];
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.9;
      ctx.stroke();

      // Giác hút nhỏ màu trắng ngà
      const sx = baseAx * 1.1 + armW * 0.7;
      ellipse(ctx, sx - 1, -22, 1.3, 1.3, '#fef2f2', null);
      ellipse(ctx, sx + 1, -15, 1.3, 1.3, '#fef2f2', null);
    }
    ctx.restore();

    // 5. Long Feeding Tentacles (2 xúc tua săn mồi vươn dài tới đáy y = 0)
    for (const side of [-1, 1]) {
      ctx.save();
      const tW = Math.sin(time * 1.8 + side * 1.2) * 8;
      const startX = side * 8;
      ctx.beginPath();
      ctx.moveTo(startX, -38);
      ctx.bezierCurveTo(startX + side * 14 + tW, -25, startX + side * 4 - tW, -14, side * 10 + tW, -3);
      ctx.strokeStyle = '#b91c1c';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Đầu chùy (tentacular club) phình rộng với hàng giác hút
      ctx.save();
      ctx.translate(side * 10 + tW, -3);
      ctx.rotate(side * 0.15 + waveFast * 0.1);
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 2.5, side * 0.3, 0, TAU);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Giác hút và móc sừng nhỏ
      ellipse(ctx, -2, -1, 1.2, 1.2, '#fef2f2', null);
      ellipse(ctx, 1, 0, 1.2, 1.2, '#fef2f2', null);
      ellipse(ctx, 3, 1, 1.0, 1.0, '#fef2f2', null);
      ctx.restore();

      ctx.restore();
    }

    ctx.restore();
  }

  // =========================================================================
  // 2. SPERM WHALE (Cá nhà táng)
  // center: [0, -45], top: [0, -78], head: [35, -50], tail: [-52, -50]
  // Bounding box: x in [-56, 52], y in [-78, -10]
  // =========================================================================
  function drawSpermWhale(ctx, s, t) {
    const time = t || 0;
    const swim = Math.sin(time * 2.0);
    const tailWave = Math.sin(time * 2.5);

    ctx.save();
    ctx.translate(0, 0);

    // 1. Tail Flukes (Đuôi cá dạng quạt tam giác lớn)
    ctx.save();
    ctx.translate(-48, -48);
    ctx.rotate(tailWave * 0.2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-14, -18, -12, -26);
    ctx.quadraticCurveTo(-4, -16, 0, -4);
    ctx.quadraticCurveTo(4, -16, 12, -26);
    ctx.quadraticCurveTo(14, -18, 0, 0);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // 2. Main Body (Thân lớn đồ sộ, đầu vuông đặc trưng)
    ctx.save();
    ctx.beginPath();
    // Đỉnh đầu vuông phẳng phía trước (spermaceti organ)
    ctx.moveTo(48, -72);
    ctx.quadraticCurveTo(52, -60, 50, -42);
    // Hàm trên
    ctx.lineTo(44, -38);
    ctx.lineTo(12, -38);
    // Bụng uốn lượn về cuống đuôi
    ctx.quadraticCurveTo(-10, -36, -32, -44);
    ctx.lineTo(-48, -46);
    // Cuống đuôi lên lưng
    ctx.lineTo(-48, -50);
    // Gờ u lưng (dorsal knuckles/hump)
    ctx.quadraticCurveTo(-38, -54, -28, -56);
    ctx.quadraticCurveTo(-22, -60, -14, -58);
    ctx.quadraticCurveTo(-8, -62, 0, -60);
    // Lưng phẳng dốc về đỉnh đầu
    ctx.quadraticCurveTo(24, -68, 48, -72);
    ctx.closePath();

    const bodyGrad = ctx.createLinearGradient(0, -75, 0, -35);
    bodyGrad.addColorStop(0, '#334155');
    bodyGrad.addColorStop(0.65, '#1e293b');
    bodyGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Lỗ thở (Blowhole) lệch sang bên trái mũi
    ctx.beginPath();
    ctx.ellipse(45, -72, 3, 1.2, 0.2, 0, TAU);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    // Vết sẹo giác hút mực khổng lồ (vết xước trắng đặc trưng của cá nhà táng già)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(36, -54, 3.5, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(28, -48, 2.5, 0, TAU);
    ctx.stroke();
    line(ctx, 32, -62, 42, -58, 'rgba(255, 255, 255, 0.4)', 1.0);
    line(ctx, 22, -52, 16, -46, 'rgba(255, 255, 255, 0.35)', 1.0);
    ctx.restore();

    // 3. Narrow Underslung Lower Jaw (Hàm dưới hẹp có răng ngà)
    ctx.beginPath();
    ctx.moveTo(42, -37);
    ctx.lineTo(12, -37);
    ctx.lineTo(12, -32);
    ctx.lineTo(40, -32);
    ctx.quadraticCurveTo(43, -33, 42, -37);
    ctx.closePath();
    ctx.fillStyle = '#475569';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Răng trắng ngà ở hàm dưới
    for (let tx = 16; tx <= 38; tx += 4) {
      line(ctx, tx, -35, tx + 1, -38, '#f8fafc', 1.3);
    }

    // Mắt nhỏ trầm tĩnh sâu thẳm
    ellipse(ctx, 16, -46, 3.2, 3.2, '#f8fafc', INK, 1.0);
    ellipse(ctx, 17, -46, 1.8, 1.8, '#0f172a', null);
    ellipse(ctx, 16.5, -47, 0.8, 0.8, '#ffffff', null);

    // 4. Pectoral Flipper (Vây ngực mái chèo)
    ctx.save();
    ctx.translate(6, -38);
    ctx.rotate(-0.2 + swim * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 4, 10, 5, 0.4, 0, TAU);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
    ctx.restore();
  }

  // =========================================================================
  // 3. BATHYSCAPHE (Tàu lặn sâu vỏ cầu áp suất)
  // center: [0, -45], top: [0, -90], sphere: [0, -30], light: [18, -32]
  // Bounding box: x in [-48, 48], y in [-88, 0]
  // =========================================================================
  function drawBathyscaphe(ctx, s, t) {
    const time = t || 0;
    const bob = Math.sin(time * 1.5) * 2.0;

    ctx.save();
    ctx.translate(0, bob);

    // 1. Phao nổi trên (Flotation hull hình thuôn dài chứa chất nổi nhẹ)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-44, -86, 88, 34, 14);
    const floatGrad = ctx.createLinearGradient(0, -86, 0, -52);
    floatGrad.addColorStop(0, '#f8fafc');
    floatGrad.addColorStop(0.5, '#ea580c');
    floatGrad.addColorStop(1, '#9a3412');
    ctx.fillStyle = floatGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Các đai thép chịu lực bọc quanh phao
    for (const bx of [-28, -6, 16, 34]) {
      line(ctx, bx, -86, bx, -52, '#334155', 2.0);
    }
    // Móc cẩu trung tâm trên nóc
    ctx.beginPath();
    ctx.arc(0, -88, 5, Math.PI, 0);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // 2. Chân giá đỡ & Cánh quạt đẩy phía sau
    line(ctx, -14, -52, -10, -44, '#334155', 3.5);
    line(ctx, 14, -52, 10, -44, '#334155', 3.5);

    // Cánh quạt đẩy (Stern thruster)
    ctx.save();
    ctx.translate(-44, -58);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 8, 0, 0, TAU);
    ctx.fillStyle = '#64748b';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    line(ctx, -2, -6, -8, 6, '#334155', 2.2);
    line(ctx, -2, 6, -8, -6, '#334155', 2.2);
    ctx.restore();

    // 3. Khoang cầu thép áp suất nặng (Heavy Steel Crew Sphere)
    ctx.save();
    ctx.translate(0, -28);

    // Vỏ cầu thép dày
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    const sphereGrad = ctx.createRadialGradient(-6, -6, 2, 0, 0, 22);
    sphereGrad.addColorStop(0, '#94a3b8');
    sphereGrad.addColorStop(0.4, '#475569');
    sphereGrad.addColorStop(0.85, '#334155');
    sphereGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = sphereGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Cửa kính nón quan sát thạch anh dày chịu áp suất (Quartz Viewport)
    ctx.beginPath();
    ctx.arc(12, 0, 6.5, 0, TAU);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Ánh sáng ấm từ trong cabin thám hiểm
    ctx.beginPath();
    ctx.arc(12, 0, 4.2, 0, TAU);
    ctx.fillStyle = '#fef08a';
    ctx.fill();

    // Đèn pha rọi đáy biển (Deep searchlight)
    ctx.save();
    ctx.translate(18, -4);
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(6, -5);
    ctx.lineTo(6, 5);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Vệt sáng đèn rọi loang trong nước tối
    ctx.beginPath();
    ctx.moveTo(6, -5);
    ctx.lineTo(42, -18);
    ctx.lineTo(46, 16);
    ctx.lineTo(6, 5);
    ctx.closePath();
    const beamGrad = ctx.createLinearGradient(6, 0, 46, 0);
    beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
    beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = beamGrad;
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // 4. Đế tiếp đất / Chân đáp đáy biển (Landing skids & ballast)
    line(ctx, -18, -10, -22, -2, '#334155', 3.0);
    line(ctx, 18, -10, 22, -2, '#334155', 3.0);
    line(ctx, -28, -2, 28, -2, '#1e293b', 4.0);

    ctx.restore();
  }

  // =========================================================================
  // 4. RESEARCH SUBMARINE (Tàu ngầm nghiên cứu khoa học)
  // center: [0, -45], top: [0, -88], viewport: [36, -36], claw: [46, -10]
  // Bounding box: x in [-48, 52], y in [-86, 0]
  // =========================================================================
  function drawResearchSubmarine(ctx, s, t) {
    const time = t || 0;
    const wave = Math.sin(time * 1.8) * 1.8;

    ctx.save();
    ctx.translate(0, wave);

    // 1. Conning tower / Sensor sail trên nóc
    ctx.beginPath();
    ctx.roundRect(-8, -84, 20, 18, 4);
    ctx.fillStyle = '#eab308';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Ăng-ten và đèn chớp tín hiệu
    line(ctx, 2, -84, 2, -92, '#64748b', 1.8);
    ellipse(ctx, 2, -93, 2, 2, '#ef4444', null);

    // 2. Thân tàu ngầm khí động học (Streamlined scientific hull)
    ctx.beginPath();
    ctx.moveTo(32, -66);
    ctx.quadraticCurveTo(46, -54, 46, -38);
    ctx.quadraticCurveTo(44, -22, 28, -18);
    ctx.lineTo(-36, -18);
    ctx.quadraticCurveTo(-46, -26, -46, -42);
    ctx.quadraticCurveTo(-46, -58, -32, -66);
    ctx.closePath();

    const subGrad = ctx.createLinearGradient(0, -68, 0, -18);
    subGrad.addColorStop(0, '#fef08a');
    subGrad.addColorStop(0.35, '#eab308');
    subGrad.addColorStop(0.8, '#ca8a04');
    subGrad.addColorStop(1, '#854d0e');
    ctx.fillStyle = subGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Vạch trang trí khoa học màu trắng & xám
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-32, -38, 56, 6);

    // 3. Cửa vòm kính quan sát trong suốt phía trước (Observation dome)
    ctx.beginPath();
    ctx.arc(32, -38, 14, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Bảng điều khiển vi tính phát quang bên trong
    ellipse(ctx, 30, -36, 4, 3, '#0284c7', null);
    ellipse(ctx, 32, -34, 1.5, 1.5, '#4ade80', null);

    // Đèn LED chiếu sáng công suất lớn trên mui
    ellipse(ctx, 36, -60, 4, 3, '#fef08a', INK, 1.2);
    // Vệt sáng rọi về trước
    ctx.beginPath();
    ctx.moveTo(40, -60);
    ctx.lineTo(80, -75);
    ctx.lineTo(85, -45);
    ctx.closePath();
    const lightGrad = ctx.createLinearGradient(40, -60, 85, -60);
    lightGrad.addColorStop(0, 'rgba(254, 240, 138, 0.5)');
    lightGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = lightGrad;
    ctx.fill();

    // 4. Tay gắp robot thao tác mẫu vật (Manipulator robotic arm)
    ctx.save();
    ctx.translate(32, -18);
    line(ctx, 0, 0, 8, 4, '#475569', 3.0);
    line(ctx, 8, 4, 14, 12, '#334155', 2.5);
    // Khớp gắp
    ellipse(ctx, 14, 12, 2.5, 2.5, '#64748b', INK, 1.0);
    // 2 ngón kẹp cơ khí
    line(ctx, 14, 12, 19, 9, '#e2e8f0', 1.8);
    line(ctx, 14, 12, 19, 15, '#e2e8f0', 1.8);
    ctx.restore();

    // 5. Cánh quạt ống đẩy kép phía sau (Ducted thrusters)
    ctx.save();
    ctx.translate(-44, -42);
    ctx.beginPath();
    ctx.roundRect(-4, -10, 8, 20, 3);
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    line(ctx, -8, -6, -2, -6, '#64748b', 2.0);
    line(ctx, -8, 6, -2, 6, '#64748b', 2.0);
    ctx.restore();

    // 6. Chân đáp ống titan (Titanium landing skids)
    line(ctx, -20, -18, -24, -4, '#475569', 2.8);
    line(ctx, 14, -18, 12, -4, '#475569', 2.8);
    line(ctx, -32, -4, 24, -4, '#1e293b', 3.5);

    ctx.restore();
  }

  // =========================================================================
  // 5. HYDROTHERMAL VENT (Miệng phun thuỷ nhiệt / Ống khói đen)
  // center: [0, -45], top: [0, -96], chimney_top: [0, -68]
  // Bounding box: x in [-40, 40], y in [-96, 0]
  // =========================================================================
  function drawHydrothermalVent(ctx, s, t) {
    const time = t || 0;

    ctx.save();
    ctx.translate(0, 0);

    // 1. Cột khói khoáng đen cuồn cuộn bốc lên từ miệng (Billowing mineral plume)
    ctx.save();
    for (let puff = 0; puff < 5; puff++) {
      const puffTime = (time * 1.8 + puff * 0.7) % 3.0;
      const puffY = -68 - puffTime * 9.5;
      const puffX = Math.sin(time * 2.2 + puff) * (4 + puffTime * 3);
      const puffR = 6 + puffTime * 4.5;
      const alpha = Math.max(0, 1 - puffTime / 3.0) * 0.85;

      ctx.beginPath();
      ctx.arc(puffX, puffY, puffR, 0, TAU);
      ctx.fillStyle = `rgba(15, 23, 42, ${alpha})`;
      ctx.fill();
    }
    ctx.restore();

    // 2. Chân đế đá bazan núi lửa (Volcanic basalt base)
    drawPoly(ctx, [
      [-38, 0], [-34, -14], [-22, -22], [-14, -40], [-10, -68],
      [10, -68], [16, -38], [26, -20], [36, -12], [38, 0]
    ], '#1e293b', INK, 2.2);

    // 3. Tinh thể khoáng sản & khe nứt phát nhiệt (Mineral crusting & geothermal glow)
    // Các vỉa quặng lưu huỳnh vàng & đồng đỏ bám quanh ống khói
    drawPoly(ctx, [[-12, -35], [-4, -38], [-6, -26], [-16, -24]], '#b45309', '#78350f', 1.0);
    drawPoly(ctx, [[6, -42], [14, -40], [12, -28], [4, -32]], '#ca8a04', '#854d0e', 1.0);
    drawPoly(ctx, [[-8, -55], [0, -58], [2, -48], [-6, -46]], '#ea580c', '#9a3412', 1.0);

    // Ánh sáng nhiệt màu cam/vàng tỏa ra từ khe nứt bên trong
    ctx.save();
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4, -66);
    ctx.lineTo(2, -54);
    ctx.lineTo(-2, -42);
    ctx.lineTo(4, -30);
    ctx.stroke();
    // Đốm sáng nhiệt tại miệng ống
    ellipse(ctx, 0, -68, 6, 2.5, '#ea580c', '#facc15', 1.2);
    ctx.restore();

    ctx.restore();
  }

  // =========================================================================
  // 6. TUBE WORMS (Cụm giun ống biển sâu Riftia)
  // center: [0, -45], top: [0, -88], base: [0, 0]
  // Bounding box: x in [-44, 44], y in [-88, 0]
  // =========================================================================
  function drawTubeWorms(ctx, s, t) {
    const time = t || 0;

    ctx.save();
    ctx.translate(0, 0);

    // 1. Đế đá khoáng sản đen nơi bám rễ
    drawPoly(ctx, [
      [-42, 0], [-38, -12], [-20, -16], [0, -14], [22, -18], [40, -10], [42, 0]
    ], '#1e293b', INK, 2.0);

    // 2. Các ống chitin trắng dựng đứng (White chitinous tubes)
    // 6 ống giun với các góc uốn tự nhiên
    const tubes = [
      { bx: -26, tx: -30, h: 48, plumeR: 9, angle: -0.15 },
      { bx: -14, tx: -16, h: 62, plumeR: 10, angle: -0.08 },
      { bx: -3, tx: -2, h: 70, plumeR: 11, angle: 0.04 },
      { bx: 8, tx: 10, h: 58, plumeR: 10, angle: 0.12 },
      { bx: 20, tx: 25, h: 65, plumeR: 10, angle: 0.18 },
      { bx: 30, tx: 34, h: 46, plumeR: 8, angle: 0.22 }
    ];

    for (let i = 0; i < tubes.length; i++) {
      const tb = tubes[i];
      const plumeWave = Math.sin(time * 2.5 + i * 1.1) * 2.5;

      // Ống trắng ngà
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tb.bx - 4.5, -8);
      ctx.quadraticCurveTo((tb.bx + tb.tx) / 2 - 4.5, -tb.h / 2, tb.tx - 3.5, -tb.h);
      ctx.lineTo(tb.tx + 3.5, -tb.h);
      ctx.quadraticCurveTo((tb.bx + tb.tx) / 2 + 4.5, -tb.h / 2, tb.bx + 4.5, -8);
      ctx.closePath();

      const tubeGrad = ctx.createLinearGradient(tb.bx - 4, 0, tb.bx + 4, 0);
      tubeGrad.addColorStop(0, '#cbd5e1');
      tubeGrad.addColorStop(0.5, '#f8fafc');
      tubeGrad.addColorStop(1, '#94a3b8');
      ctx.fillStyle = tubeGrad;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Vòng ngấn vỏ ống
      line(ctx, tb.bx - 3.5, -tb.h * 0.35, tb.bx + 3.5, -tb.h * 0.35, '#94a3b8', 1.0);
      line(ctx, tb.tx - 3.0, -tb.h * 0.7, tb.tx + 3.0, -tb.h * 0.7, '#94a3b8', 1.0);

      // Chùm lông tơ màu đỏ tươi rực rỡ (Crimson Branchial Plumes)
      ctx.save();
      ctx.translate(tb.tx + plumeWave * 0.4, -tb.h);
      ctx.rotate(tb.angle + plumeWave * 0.05);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-tb.plumeR * 0.8, -tb.plumeR * 0.6, -tb.plumeR * 0.4, -tb.plumeR * 1.3);
      ctx.quadraticCurveTo(0, -tb.plumeR * 1.5, tb.plumeR * 0.4, -tb.plumeR * 1.3);
      ctx.quadraticCurveTo(tb.plumeR * 0.8, -tb.plumeR * 0.6, 0, 0);
      ctx.closePath();

      const plumeGrad = ctx.createLinearGradient(0, -tb.plumeR * 1.5, 0, 0);
      plumeGrad.addColorStop(0, '#f43f5e');
      plumeGrad.addColorStop(0.5, '#e11d48');
      plumeGrad.addColorStop(1, '#9f1239');
      ctx.fillStyle = plumeGrad;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Tơ mang li ti bên trong chùm đỏ
      for (const px of [-3, 0, 3]) {
        line(ctx, 0, -2, px, -tb.plumeR * 1.1, '#fecdd3', 1.0);
      }
      ctx.restore();

      ctx.restore();
    }

    ctx.restore();
  }

  // =========================================================================
  // 7. SUNKEN LINER (Xác tàu khách chìm bí ẩn trên đáy biển)
  // KHÔNG TÊN, KHÔNG NGƯỜI, KHÔNG CHỮ
  // center: [0, -40], top: [0, -84], bow: [45, -35], stern: [-45, -45]
  // Bounding box: x in [-50, 50], y in [-84, 0]
  // =========================================================================
  function drawSunkenLiner(ctx, s, t) {
    ctx.save();
    // Tàu nghiêng nhẹ ~6 độ trên đáy biển bùn sâu
    ctx.translate(0, 0);
    ctx.rotate(0.06);

    // 1. Thân tàu thép khổng lồ (Grand Iron Hull)
    ctx.beginPath();
    ctx.moveTo(46, -34);  // Mũi tàu (Bow)
    ctx.quadraticCurveTo(42, -18, 38, -4);
    ctx.lineTo(-44, -4);  // Đáy lườn tàu
    ctx.lineTo(-48, -38); // Đuôi tàu (Stern)
    ctx.quadraticCurveTo(-10, -36, 46, -34); // Đường boong chính
    ctx.closePath();

    const hullGrad = ctx.createLinearGradient(0, -38, 0, -4);
    hullGrad.addColorStop(0, '#334155');
    hullGrad.addColorStop(0.5, '#1e293b');
    hullGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = hullGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Rỉ sét và mảng bám rong biển đại dương (Rusticles & green patina)
    ctx.fillStyle = '#065f46';
    for (const rx of [-36, -18, 4, 24, 38]) {
      ctx.beginPath();
      ctx.moveTo(rx, -34);
      ctx.lineTo(rx - 2, -22);
      ctx.lineTo(rx + 2, -22);
      ctx.closePath();
      ctx.fill();
    }

    // Các lỗ cửa sổ mạn tròn (Portholes) dọc thân
    for (let px = -38; px <= 36; px += 8) {
      ellipse(ctx, px, -20, 2.0, 2.0, '#0284c7', INK, 1.0);
    }

    // 2. Cấu trúc thượng tầng & Boong chỉ huy (Bridge Superstructure)
    drawPoly(ctx, [
      [-22, -36], [-20, -56], [16, -54], [18, -36]
    ], '#475569', INK, 1.8);

    // Lan can boong dạo
    line(ctx, -24, -38, 22, -37, '#94a3b8', 1.2);
    for (let lx = -22; lx <= 20; lx += 6) {
      line(ctx, lx, -38, lx, -35, '#94a3b8', 1.0);
    }

    // Cửa sổ buồng lái boong chỉ huy
    for (let wx = -14; wx <= 10; wx += 6) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(wx, -52, 4, 3);
    }

    // 3. Ống khói nghiêng & gãy (Tilted & crumpled funnels)
    // Ống khói 1 (còn đứng)
    ctx.save();
    ctx.translate(-8, -56);
    ctx.rotate(0.12);
    ctx.beginPath();
    ctx.roundRect(-5, -26, 10, 26, 2);
    ctx.fillStyle = '#b45309';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Vành đen trên đỉnh ống khói (không có chữ)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-5, -26, 10, 7);
    ctx.restore();

    // Ống khói 2 (nghiêng gãy rạp)
    ctx.save();
    ctx.translate(8, -54);
    ctx.rotate(0.35);
    ctx.beginPath();
    ctx.roundRect(-4.5, -22, 9, 22, 2);
    ctx.fillStyle = '#9a3412';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-4.5, -22, 9, 6);
    ctx.restore();

    // 4. Mỏ neo sắt khổng lồ thả xuống đáy
    ctx.save();
    ctx.translate(40, -10);
    line(ctx, 0, -20, 0, 8, '#475569', 2.0); // Dây xích neo
    // Thân và lưỡi neo
    ctx.beginPath();
    ctx.arc(0, 6, 6, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    line(ctx, -5, 0, 5, 0, '#334155', 2.0);
    ctx.restore();

    ctx.restore();
  }

  // =========================================================================
  // 8. ROGUE WAVE (Sóng dữ / Bức tường nước khổng lồ)
  // center: [0, -45], top: [15, -94], crest: [18, -88]
  // Bounding box: x in [-48, 46], y in [-94, 0]
  // =========================================================================
  function drawRogueWave(ctx, s, t) {
    const time = t || 0;
    const churn = Math.sin(time * 3.0) * 2.0;

    ctx.save();
    ctx.translate(0, 0);

    // 1. Thân sóng khổng lồ cuồn cuộn dâng cao (Massive curved water wall)
    ctx.beginPath();
    ctx.moveTo(-46, 0);
    ctx.quadraticCurveTo(-38, -22, -24, -45);
    ctx.quadraticCurveTo(-10, -70, 16, -78); // Đỉnh sóng (Crest)
    // Mép sóng cuộn gập xuống (Curling lip)
    ctx.quadraticCurveTo(28, -74, 34, -64);
    ctx.quadraticCurveTo(22, -60, 14, -66);
    // Bụng xoáy cuốn vào lòng sóng
    ctx.quadraticCurveTo(-2, -45, 10, -18);
    ctx.lineTo(44, 0);
    ctx.closePath();

    const waveGrad = ctx.createLinearGradient(-30, -78, 20, 0);
    waveGrad.addColorStop(0, '#0284c7');
    waveGrad.addColorStop(0.3, '#0369a1');
    waveGrad.addColorStop(0.7, '#075985');
    waveGrad.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = waveGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 2. Các vệt bọt nước và gân sóng thủy động học
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.6;
    for (let c = -20; c <= 15; c += 8) {
      ctx.beginPath();
      ctx.moveTo(c - 15, 0);
      ctx.quadraticCurveTo(c - 5, -30, c + 10, -58);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Đỉnh sóng vỡ bọt trắng xóa (White frothing foam & spray)
    ctx.save();
    ctx.translate(16 + churn * 0.5, -78);
    for (let f = 0; f < 7; f++) {
      const fx = (f - 3) * 6;
      const fy = Math.sin(time * 4.0 + f) * 2.5;
      ellipse(ctx, fx, fy, 5.0, 4.0, '#ffffff', 'rgba(186, 230, 253, 0.7)', 1.2);
    }
    // Giọt nước bắn tung tóe theo gió bão
    for (let d = 0; d < 8; d++) {
      const dx = 12 + Math.sin(d * 3.3 + time * 3) * 14;
      const dy = -4 + Math.cos(d * 2.7 + time * 3) * 8;
      ellipse(ctx, dx, dy, 1.6, 1.6, '#ffffff', null);
    }
    ctx.restore();

    // Bọt nước sục sôi dưới chân sóng
    for (let bx = -42; bx <= 40; bx += 9) {
      const by = -2 + Math.sin(bx + time * 4) * 2;
      ellipse(ctx, bx, by, 5, 2.5, '#f0f9ff', '#bae6fd', 0.8);
    }

    ctx.restore();
  }

  // =========================================================================
  // 9. BIOLUMINESCENT FISH SWARM (Đàn cá phát sáng biển sâu)
  // center: [0, -45], top: [20, -86], lead: [38, -65]
  // Bounding box: x in [-46, 46], y in [-86, -6]
  // =========================================================================
  function drawBioluminescentFishSwarm(ctx, s, t) {
    const time = t || 0;

    ctx.save();
    ctx.translate(0, 0);

    // 14 chú cá nhỏ bơi theo đàn xoáy hình chữ S
    const fishList = [
      { x: -36, y: -22, size: 7.0, phase: 0.2 },
      { x: -28, y: -32, size: 7.5, phase: 0.6 },
      { x: -20, y: -26, size: 6.8, phase: 1.0 },
      { x: -16, y: -42, size: 8.0, phase: 1.4 },
      { x: -8,  y: -36, size: 7.2, phase: 1.8 },
      { x: -2,  y: -52, size: 8.5, phase: 2.2 },
      { x: 6,   y: -46, size: 7.8, phase: 2.6 },
      { x: 14,  y: -62, size: 8.2, phase: 3.0 },
      { x: 22,  y: -54, size: 7.5, phase: 3.4 },
      { x: 28,  y: -70, size: 8.8, phase: 3.8 },
      { x: 36,  y: -65, size: 8.0, phase: 4.2 },
      { x: 20,  y: -82, size: 7.2, phase: 4.6 },
      { x: 4,   y: -74, size: 6.5, phase: 5.0 },
      { x: -12, y: -64, size: 7.0, phase: 5.4 }
    ];

    for (let i = 0; i < fishList.length; i++) {
      const f = fishList[i];
      const swimX = Math.sin(time * 2.8 + f.phase) * 3.5;
      const swimY = Math.cos(time * 2.4 + f.phase) * 2.5;
      const posX = f.x + swimX;
      const posY = f.y + swimY;

      ctx.save();
      ctx.translate(posX, posY);

      // Quầng hào quang phát quang xanh ngọc (Bioluminescent glow halo)
      const glowR = f.size * 2.4;
      const glowGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, glowR);
      glowGrad.addColorStop(0, 'rgba(56, 189, 248, 0.65)');
      glowGrad.addColorStop(0.5, 'rgba(45, 212, 191, 0.35)');
      glowGrad.addColorStop(1, 'rgba(45, 212, 191, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, glowR, 0, TAU);
      ctx.fill();

      // Thân cá thuôn dẹp
      ctx.beginPath();
      ctx.ellipse(0, 0, f.size, f.size * 0.45, 0.2, 0, TAU);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      // Đuôi vây cá
      ctx.beginPath();
      ctx.moveTo(-f.size * 0.8, 0);
      ctx.lineTo(-f.size * 1.5, -f.size * 0.5);
      ctx.lineTo(-f.size * 1.5, f.size * 0.5);
      ctx.closePath();
      ctx.fillStyle = '#2dd4bf';
      ctx.fill();

      // Các điểm cơ quan phát quang (Photophores) dọc lườn bụng
      for (const px of [-f.size * 0.4, 0, f.size * 0.4]) {
        ellipse(ctx, px, f.size * 0.2, 1.2, 1.2, '#fef08a', null);
      }
      // Mắt cá
      ellipse(ctx, f.size * 0.5, -f.size * 0.1, 1.3, 1.3, '#38bdf8', null);

      ctx.restore();
    }

    ctx.restore();
  }

  // =========================================================================
  // BACKGROUNDS
  // 1. TRENCH FLOOR (Đáy rãnh Mariana siêu sâu)
  // 2. HYDROTHERMAL FIELD (Cánh đồng thuỷ nhiệt đáy đại dương)
  // 3. STORMY SEA (Biển bão tố gầm thét)
  // =========================================================================

  // 1. TRENCH FLOOR
  function drawTrenchFloorBg(ctx, settings, t) {
    ctx.save();
    const w = 576;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';
    const time = t || 0;

    // Nước đại dương sâu thẳm: gradient từ đêm đen sâu tới xanh lam thẳm
    const waterGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      waterGrad.addColorStop(0, '#010409');
      waterGrad.addColorStop(0.6, '#020a17');
      waterGrad.addColorStop(1, '#051329');
    } else {
      waterGrad.addColorStop(0, '#030712');
      waterGrad.addColorStop(0.5, '#07162c');
      waterGrad.addColorStop(1, '#0c2340');
    }
    ctx.fillStyle = waterGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Vách đá rãnh vực dựng đứng hai bên hẻm núi (Mariana Trench vertical cliff walls)
    ctx.save();
    ctx.fillStyle = '#030712';
    // Vách bên trái
    ctx.beginPath();
    ctx.moveTo(X0, 0);
    ctx.lineTo(80, 0);
    ctx.quadraticCurveTo(120, groundY * 0.4, 90, groundY * 0.7);
    ctx.lineTo(130, groundY);
    ctx.lineTo(X0, groundY);
    ctx.closePath();
    ctx.fill();

    // Vách bên phải
    ctx.beginPath();
    ctx.moveTo(X1, 0);
    ctx.lineTo(X1 - 90, 0);
    ctx.quadraticCurveTo(w - 110, groundY * 0.35, w - 80, groundY * 0.65);
    ctx.lineTo(w - 120, groundY);
    ctx.lineTo(X1, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Đáy bùn cát biển sâu (Benthic abyssal sediment plain)
    ctx.save();
    const sedGrad = ctx.createLinearGradient(0, groundY - 120, 0, 1024);
    sedGrad.addColorStop(0, '#0a192f');
    sedGrad.addColorStop(0.4, '#0f2442');
    sedGrad.addColorStop(1, '#051121');
    ctx.fillStyle = sedGrad;
    ctx.fillRect(X0, groundY - 60, X1 - X0, 1024 - (groundY - 60));

    // Đường gờ địa hình đáy rãnh
    ctx.beginPath();
    ctx.moveTo(X0, groundY);
    for (let x = X0; x <= X1; x += 40) {
      const ry = groundY - 10 + Math.sin(x * 0.03) * 8;
      ctx.lineTo(x, ry);
    }
    ctx.lineTo(X1, 1024);
    ctx.lineTo(X0, 1024);
    ctx.closePath();
    ctx.fillStyle = '#07162c';
    ctx.fill();
    ctx.restore();

    // Tuyết biển rơi chậm (Marine snow particles drifting down)
    ctx.save();
    for (let p = 0; p < 35; p++) {
      const px = (p * 59 + time * 8) % (w - 40) + 20;
      const py = (p * 47 + time * 18) % groundY;
      const pr = 1.5 + (p % 3) * 0.8;
      ellipse(ctx, px, py, pr, pr, 'rgba(224, 242, 254, 0.45)', null);
    }
    ctx.restore();

    // Khổ ngang: mở rộng vách đá lởm chởm, mỏm đá ngầm và sinh vật phát sáng hai bên
    scatterExt(ext, 90, 'trench_rock', (x, r, i) => {
      ctx.save();
      const rh = 70 + r * 60;
      ctx.beginPath();
      ctx.moveTo(x - 30, groundY);
      ctx.lineTo(x, groundY - rh);
      ctx.lineTo(x + 35, groundY);
      ctx.closePath();
      ctx.fillStyle = '#020617';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Đốm san hô/hải quỳ phát quang trên mỏm đá
      ellipse(ctx, x, groundY - rh + 4, 3, 3, '#38bdf8', null);
      ellipse(ctx, x - 10, groundY - rh * 0.5, 2.5, 2.5, '#2dd4bf', null);
      ctx.restore();
    });

    scatterExt(ext, 45, 'trench_snow', (x, r, i) => {
      const by = ((r * groundY) + time * 16) % groundY;
      ellipse(ctx, x, by, 2.0, 2.0, 'rgba(224, 242, 254, 0.5)', null);
    });

    ctx.restore();
  }

  // 2. HYDROTHERMAL FIELD
  function drawHydrothermalFieldBg(ctx, settings, t) {
    ctx.save();
    const w = 576;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';
    const time = t || 0;

    // Nước đại dương sâu gần đáy núi lửa
    const waterGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    waterGrad.addColorStop(0, '#020617');
    waterGrad.addColorStop(0.55, '#0f172a');
    waterGrad.addColorStop(0.85, '#1e1b4b');
    waterGrad.addColorStop(1, '#2e1065');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Đáy biển dung nham bazan (Volcanic basalt ocean crust)
    const crustGrad = ctx.createLinearGradient(0, groundY - 40, 0, 1024);
    crustGrad.addColorStop(0, '#1c1917');
    crustGrad.addColorStop(0.5, '#0c0a09');
    crustGrad.addColorStop(1, '#000000');
    ctx.fillStyle = crustGrad;
    ctx.fillRect(X0, groundY - 40, X1 - X0, 1024 - (groundY - 40));

    // Khe nứt địa nhiệt rực sáng cam đỏ (Geothermal fissures with magma glow)
    ctx.save();
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(80, groundY + 20);
    ctx.lineTo(160, groundY + 5);
    ctx.lineTo(240, groundY + 35);
    ctx.lineTo(340, groundY + 10);
    ctx.lineTo(460, groundY + 40);
    ctx.stroke();
    // Vùng sáng vàng trung tâm khe nứt
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(82, groundY + 20);
    ctx.lineTo(160, groundY + 5);
    ctx.lineTo(240, groundY + 35);
    ctx.lineTo(340, groundY + 10);
    ctx.lineTo(458, groundY + 40);
    ctx.stroke();
    ctx.restore();

    // Các cột ống khói thuỷ nhiệt xa xăm (Distant hydrothermal chimneys)
    const chimneys = [
      { x: 120, h: 140, w: 28 },
      { x: 260, h: 170, w: 34 },
      { x: 420, h: 130, w: 26 }
    ];

    for (const c of chimneys) {
      // Ống khói đá bazan
      ctx.beginPath();
      ctx.moveTo(c.x - c.w / 2, groundY);
      ctx.lineTo(c.x - c.w * 0.35, groundY - c.h);
      ctx.lineTo(c.x + c.w * 0.35, groundY - c.h);
      ctx.lineTo(c.x + c.w / 2, groundY);
      ctx.closePath();
      ctx.fillStyle = '#292524';
      ctx.fill();
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Khói khoáng bốc lên từ đỉnh
      for (let p = 0; p < 4; p++) {
        const py = groundY - c.h - ((time * 25 + p * 28) % 110);
        const px = c.x + Math.sin(time * 2 + p) * 8;
        const pr = 8 + ((time * 25 + p * 28) % 110) * 0.18;
        ellipse(ctx, px, py, pr, pr * 0.8, 'rgba(15, 23, 42, 0.75)', null);
      }
    }

    // Khổ ngang: mở rộng thêm ống khói, cụm giun ống và khe nứt nhiệt
    scatterExt(ext, 120, 'vent_field', (x, r, i) => {
      const chH = 110 + r * 60;
      const chW = 24 + r * 12;
      // Ống khói phụ
      ctx.beginPath();
      ctx.moveTo(x - chW / 2, groundY);
      ctx.lineTo(x - chW * 0.3, groundY - chH);
      ctx.lineTo(x + chW * 0.3, groundY - chH);
      ctx.lineTo(x + chW / 2, groundY);
      ctx.closePath();
      ctx.fillStyle = '#292524';
      ctx.fill();
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Khói bốc
      ellipse(ctx, x, groundY - chH - 15, 12, 10, 'rgba(15, 23, 42, 0.7)', null);
      ellipse(ctx, x + 4, groundY - chH - 35, 16, 12, 'rgba(15, 23, 42, 0.5)', null);

      // Khe nứt nhiệt rực sáng
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 25, groundY + 15);
      ctx.lineTo(x + 25, groundY + 20);
      ctx.stroke();
    });

    ctx.restore();
  }

  // 3. STORMY SEA
  function drawStormySeaBg(ctx, settings, t) {
    ctx.save();
    const w = 576;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';
    const time = t || 0;

    // Bầu trời bão tố cuồn cuộn mây xám tím (Storm tempest sky)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(0.5, '#0f172a');
      skyGrad.addColorStop(1, '#1e1b4b');
    } else {
      skyGrad.addColorStop(0, '#0f172a');
      skyGrad.addColorStop(0.4, '#1e293b');
      skyGrad.addColorStop(0.7, '#334155');
      skyGrad.addColorStop(1, '#1e1b4b');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Chớp sấm sét xa xa giữa tầng mây (Distant lightning flash)
    if (Math.sin(time * 3.5) > 0.85) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#e0e7ff';
      ctx.fillRect(X0, 0, X1 - X0, groundY * 0.6);
      ctx.restore();
    }

    // Các tầng mây bão đen trĩu nặng
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(X0, 0);
    for (let x = X0; x <= X1; x += 60) {
      const my = 120 + Math.sin(x * 0.02 + time) * 35;
      ctx.lineTo(x, my);
    }
    ctx.lineTo(X1, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Đại dương gầm thét dữ dội tại ground_y (Violent churning ocean water)
    const seaGrad = ctx.createLinearGradient(0, groundY - 60, 0, 1024);
    seaGrad.addColorStop(0, '#0369a1');
    seaGrad.addColorStop(0.3, '#075985');
    seaGrad.addColorStop(0.7, '#0c4a6e');
    seaGrad.addColorStop(1, '#082f49');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(X0, groundY - 40, X1 - X0, 1024 - (groundY - 40));

    // Các ngọn sóng nhấp nhô dữ dội ở mặt biển (Choppy ocean swells with whitecaps)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(X0, groundY);
    for (let x = X0; x <= X1; x += 32) {
      const waveY = groundY - 20 + Math.sin(x * 0.04 + time * 3.0) * 16;
      ctx.lineTo(x, waveY);
    }
    ctx.lineTo(X1, 1024);
    ctx.lineTo(X0, 1024);
    ctx.closePath();
    ctx.fillStyle = '#075985';
    ctx.fill();

    // Đỉnh sóng bọt trắng xóa (Whitecaps)
    for (let x = X0; x <= X1; x += 48) {
      const cy = groundY - 20 + Math.sin(x * 0.04 + time * 3.0) * 16;
      ellipse(ctx, x, cy, 9, 3.5, '#ffffff', '#bae6fd', 0.8);
    }
    ctx.restore();

    // Mưa gió quất xiên ngang mặt biển (Wind-blown rain streaks)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.2;
    for (let r = 0; r < 40; r++) {
      const rx = (r * 63 + time * 80) % w;
      const ry = (r * 41 + time * 120) % groundY;
      line(ctx, rx, ry, rx + 14, ry + 24);
    }
    ctx.restore();

    // Khổ ngang: mở rộng thêm sóng thần cuộn trào và bọt biển tung trắng
    scatterExt(ext, 80, 'storm_swell', (x, r, i) => {
      const swY = groundY - 24 + Math.sin(x * 0.03 + time * 3) * 18;
      ellipse(ctx, x, swY, 14, 5, '#ffffff', '#bae6fd', 1.0);
      line(ctx, x - 10, swY - 20, x + 12, swY + 15, 'rgba(255, 255, 255, 0.4)', 1.2);
    });

    ctx.restore();
  }

  // =========================================================================
  // RIG & BACKGROUND REGISTRATION
  // =========================================================================
  const DEEP_OCEAN_RIGS = {
    giant_squid: { draw(ctx, s, t) { drawGiantSquid(ctx, s, t); } },
    sperm_whale: { draw(ctx, s, t) { drawSpermWhale(ctx, s, t); } },
    bathyscaphe: { draw(ctx, s, t) { drawBathyscaphe(ctx, s, t); } },
    research_submarine: { draw(ctx, s, t) { drawResearchSubmarine(ctx, s, t); } },
    hydrothermal_vent: { draw(ctx, s, t) { drawHydrothermalVent(ctx, s, t); } },
    tube_worms: { draw(ctx, s, t) { drawTubeWorms(ctx, s, t); } },
    sunken_liner: { draw(ctx, s, t) { drawSunkenLiner(ctx, s, t); } },
    rogue_wave: { draw(ctx, s, t) { drawRogueWave(ctx, s, t); } },
    bioluminescent_fish_swarm: { draw(ctx, s, t) { drawBioluminescentFishSwarm(ctx, s, t); } }
  };

  const DEEP_OCEAN_BACKGROUNDS = {
    trench_floor: {
      label: 'Đáy rãnh Mariana siêu sâu',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawTrenchFloorBg(ctx, settings, t); }
    },
    hydrothermal_field: {
      label: 'Cánh đồng thuỷ nhiệt đáy biển',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawHydrothermalFieldBg(ctx, settings, t); }
    },
    stormy_sea: {
      label: 'Biển bão tố gầm thét',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawStormySeaBg(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: DEEP_OCEAN_RIGS,
    backgrounds: DEEP_OCEAN_BACKGROUNDS
  });

})();
