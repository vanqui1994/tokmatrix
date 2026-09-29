// remake_vector_packs/space.js — Giai đoạn T: Vũ trụ và thiên văn (space)
// 6 rigs: planet, sun, moon, comet, satellite, space_station
// 2 backgrounds: space_orbit, mars_surface (ground_y: 810, 7 weathers, day/night, ZERO text)

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('RemakeVector core engine must be loaded before engine packs.');
  }

  const {
    path,
    line,
    ellipse,
    cylinder,
    taper,
    tone,
    volume,
    INK,
    TAU,
    clamp,
    smooth,
    mix,
    hash
  } = RemakeVector.kit;

  function drawPoly(ctx, pts, fill, stroke, width = 1) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  // =============================================================
  // 1. PLANET (8 hành tinh qua MỘT rig duy nhất + spec)
  // center: [0, -50], y luôn trong [-94, -6]
  // =============================================================
  const PLANET_SPECS = {
    mercury: {
      radius: 22,
      label: 'Sao Thuỷ',
      color: '#94a3b8',
      darkColor: '#64748b',
      lightColor: '#cbd5e1',
      hasRings: false
    },
    venus: {
      radius: 30,
      label: 'Sao Kim',
      color: '#f59e0b',
      darkColor: '#d97706',
      lightColor: '#fef3c7',
      hasRings: false
    },
    earth: {
      radius: 32,
      label: 'Trái Đất',
      color: '#0284c7',
      darkColor: '#0369a1',
      lightColor: '#ffffff',
      hasRings: false
    },
    mars: {
      radius: 26,
      label: 'Sao Hoả',
      color: '#ea580c',
      darkColor: '#9a3412',
      lightColor: '#f8fafc',
      hasRings: false
    },
    jupiter: {
      radius: 44,
      label: 'Sao Mộc',
      color: '#d97706',
      darkColor: '#78350f',
      lightColor: '#fef3c7',
      hasRings: false
    },
    saturn: {
      radius: 34,
      label: 'Sao Thổ',
      color: '#fde68a',
      darkColor: '#b45309',
      lightColor: '#fffbeb',
      hasRings: true,
      ringTilt: 0.32
    },
    uranus: {
      radius: 30,
      label: 'Sao Thiên Vương',
      color: '#38bdf8',
      darkColor: '#0284c7',
      lightColor: '#e0f2fe',
      hasRings: true,
      ringTilt: 1.45
    },
    neptune: {
      radius: 30,
      label: 'Sao Hải Vương',
      color: '#1d4ed8',
      darkColor: '#1e3a8a',
      lightColor: '#93c5fd',
      hasRings: false
    }
  };

  function drawPlanet(ctx, s, t) {
    ctx.save();
    const variant = s.variant || s.planet || 'earth';
    const spec = PLANET_SPECS[variant];
    if (!spec) {
      throw new Error(`RemakeVector.space: Hành tinh không xác định: ${variant}`);
    }

    const cx = 0, cy = -50;
    const r = spec.radius;

    // Vành đai phía sau (nếu có, vẽ trước thân hành tinh)
    if (spec.hasRings) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spec.ringTilt);
      // Nửa vòng phía sau (y < 0)
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.85, r * 0.48, 0, Math.PI, TAU);
      ctx.strokeStyle = variant === 'saturn' ? 'rgba(245, 158, 11, 0.6)' : 'rgba(186, 230, 253, 0.55)';
      ctx.lineWidth = r * 0.28;
      ctx.stroke();
      // Rãnh Cassini / vạch mảnh
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.82, r * 0.46, 0, Math.PI, TAU);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.0;
      ctx.stroke();
      ctx.restore();
    }

    // Thân cầu hành tinh với hiệu ứng khối cầu volume
    ctx.save();
    // Tạo clip hình cầu để các chi tiết bề mặt không tràn ra ngoài
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();

    // Nền hình cầu có bóng 3D
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    grad.addColorStop(0, spec.lightColor);
    grad.addColorStop(0.35, spec.color);
    grad.addColorStop(1, spec.darkColor);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // Vẽ chi tiết đặc trưng cho từng hành tinh
    if (variant === 'mercury') {
      // Hố va chạm mặt trăng/sao thuỷ
      ellipse(ctx, cx - 8, cy - 6, 4, 3.5, '#64748b', INK, 0.8);
      ellipse(ctx, cx + 9, cy + 5, 5, 4, '#64748b', INK, 0.8);
      ellipse(ctx, cx - 4, cy + 10, 3, 2.5, '#64748b', INK, 0.8);
      ellipse(ctx, cx + 5, cy - 11, 2.5, 2, '#475569', null);
    } else if (variant === 'venus') {
      // Dải mây axit sulfuric cuộn vàng nhạt
      for (let yOff = -r + 8; yOff <= r - 8; yOff += 10) {
        path(ctx, `M ${cx - r} ${cy + yOff} Q ${cx} ${cy + yOff - 6} ${cx + r} ${cy + yOff + 4}`, null, 'rgba(254, 243, 199, 0.6)', 3.2);
        path(ctx, `M ${cx - r} ${cy + yOff + 4} Q ${cx} ${cy + yOff + 8} ${cx + r} ${cy + yOff}`, null, 'rgba(217, 119, 6, 0.4)', 2.0);
      }
    } else if (variant === 'earth') {
      // Lục địa xanh lá cây/nâu trên đại dương xanh
      path(ctx, `M ${cx - 10} ${cy - 16} Q ${cx - 2} ${cy - 24} ${cx + 12} ${cy - 12} Q ${cx + 15} ${cy + 6} ${cx + 4} ${cy + 18} Q ${cx - 6} ${cy + 22} ${cx - 12} ${cy + 4} Z`, '#16a34a', INK, 0.8);
      path(ctx, `M ${cx - 24} ${cy - 14} Q ${cx - 18} ${cy - 20} ${cx - 16} ${cy - 8} Q ${cx - 22} ${cy + 8} ${cx - 26} ${cy + 16} Z`, '#15803d', INK, 0.8);
      ellipse(ctx, cx + 18, cy - 8, 4, 2.5, '#16a34a', null);
      path(ctx, `M ${cx - 28} ${cy - 8} Q ${cx} ${cy - 16} ${cx + 26} ${cy - 4}`, null, 'rgba(255, 255, 255, 0.73)', 3.5);
      path(ctx, `M ${cx - 22} ${cy + 12} Q ${cx - 2} ${cy + 4} ${cx + 24} ${cy + 16}`, null, 'rgba(255, 255, 255, 0.67)', 3.0);
    } else if (variant === 'mars') {
      // Vùng đá núi lửa sẫm màu
      path(ctx, `M ${cx - 18} ${cy - 4} Q ${cx} ${cy - 10} ${cx + 16} ${cy - 2} Q ${cx + 8} ${cy + 12} ${cx - 12} ${cy + 8} Z`, '#7c2d12', null);
      // Chỏm băng bắc cực trắng muốt ở đỉnh
      ellipse(ctx, cx, cy - r + 3, 9, 4, '#f8fafc', INK, 0.8);
      // Vết nứt hẻm núi Valles Marineris
      path(ctx, `M ${cx - 12} ${cy + 4} Q ${cx} ${cy + 2} ${cx + 14} ${cy + 6}`, null, '#451a03', 1.8);
    } else if (variant === 'jupiter') {
      // Các dải bão khí khổng lồ song song nhiều màu
      const bands = [
        { y: -30, w: 7, col: '#78350f' },
        { y: -20, w: 8, col: '#fef3c7' },
        { y: -10, w: 6, col: '#b45309' },
        { y: 0, w: 8, col: '#fde68a' },
        { y: 10, w: 7, col: '#9a3412' },
        { y: 22, w: 8, col: '#78350f' },
        { y: 32, w: 6, col: '#fef3c7' }
      ];
      for (const b of bands) {
        path(ctx, `M ${cx - r} ${cy + b.y} Q ${cx} ${cy + b.y + 3} ${cx + r} ${cy + b.y}`, null, b.col, b.w);
      }
      // Vết Đỏ Lớn (Great Red Spot)
      ellipse(ctx, cx + 18, cy + 12, 11, 7, '#b91c1c', INK, 1.2);
      ellipse(ctx, cx + 18, cy + 12, 7, 4, '#dc2626', null);
    } else if (variant === 'saturn') {
      // Các đường vân sọc dịu mắt
      for (let yOff = -20; yOff <= 20; yOff += 8) {
        line(ctx, [[cx - r, cy + yOff], [cx + r, cy + yOff]], 'rgba(217, 119, 6, 0.33)', 2.5);
      }
    } else if (variant === 'uranus') {
      // Dải sương mù lam nhạt
      ellipse(ctx, cx, cy, r * 0.75, r * 0.75, null, 'rgba(186, 230, 253, 0.33)', 4.0);
    } else if (variant === 'neptune') {
      // Vệt xoáy bão màu lam đậm (Great Dark Spot)
      ellipse(ctx, cx - 10, cy - 8, 8, 5, '#1e3a8a', null);
      // Mây mỏng trắng ngọc
      path(ctx, `M ${cx - 16} ${cy - 12} Q ${cx} ${cy - 16} ${cx + 18} ${cy - 6}`, null, 'rgba(191, 219, 254, 0.6)', 2.0);
      path(ctx, `M ${cx - 20} ${cy + 10} Q ${cx - 2} ${cy + 6} ${cx + 20} ${cy + 12}`, null, 'rgba(191, 219, 254, 0.47)', 1.8);
    }

    ctx.restore(); // Kết thúc clip cầu

    // Viền tròn mực bao quanh hành tinh
    ellipse(ctx, cx, cy, r, r, null, INK, 1.8);

    // Vành đai phía trước (nếu có, đè lên nửa trước hành tinh)
    if (spec.hasRings) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spec.ringTilt);
      // Bóng đổ của vành đai lên hành tinh
      ctx.beginPath();
      ctx.ellipse(0, 3, r * 1.3, r * 0.2, 0, 0, Math.PI);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.fill();

      // Nửa vòng phía trước (y > 0)
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.85, r * 0.48, 0, 0, Math.PI);
      ctx.strokeStyle = variant === 'saturn' ? 'rgba(245, 158, 11, 0.8)' : 'rgba(186, 230, 253, 0.8)';
      ctx.lineWidth = r * 0.28;
      ctx.stroke();
      // Vạch viền ngoài và rãnh phân chia
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.85 + r * 0.14, (r * 0.48) + r * 0.04, 0, 0, Math.PI);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.0;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.85 - r * 0.14, (r * 0.48) - r * 0.04, 0, 0, Math.PI);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.0;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // =============================================================
  // 2. SUN (Mặt trời có tia sáng động theo t)
  // center: [0, -50], disc r: 28, tia sáng vươn tới r=38..42 (y >= -93, y <= -7)
  // =============================================================
  function drawSun(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    const coreR = 28;

    // 12 tia sáng mặt trời hình tam giác động (tua theo t)
    const numRays = 12;
    for (let i = 0; i < numRays; i++) {
      const angle = (i * TAU) / numRays + t * 0.35;
      // Chiều dài tia sáng dao động tất định, max rayLen <= 42 đảm bảo y >= -93 > -100
      const rayLen = 38 + 3.8 * Math.sin(t * 3.2 + i * 1.6);
      const halfW = 0.16; // nửa góc mở của tam giác tia sáng

      const xBase1 = cx + Math.cos(angle - halfW) * (coreR - 1);
      const yBase1 = cy + Math.sin(angle - halfW) * (coreR - 1);
      const xBase2 = cx + Math.cos(angle + halfW) * (coreR - 1);
      const yBase2 = cy + Math.sin(angle + halfW) * (coreR - 1);
      const xTip = cx + Math.cos(angle) * rayLen;
      const yTip = cy + Math.sin(angle) * rayLen;

      drawPoly(ctx, [[xBase1, yBase1], [xTip, yTip], [xBase2, yBase2]], '#f59e0b', INK, 1.2);
      // Tia sáng nhỏ lồng bên trong
      const innerTipX = cx + Math.cos(angle) * (rayLen - 4);
      const innerTipY = cy + Math.sin(angle) * (rayLen - 4);
      drawPoly(ctx, [[xBase1, yBase1], [innerTipX, innerTipY], [xBase2, yBase2]], '#fde047', null);
    }

    // Đĩa mặt trời chính (Radial gradient vàng cam chói loà)
    const grad = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, coreR);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.6, '#facc15');
    grad.addColorStop(1, '#f59e0b');

    ellipse(ctx, cx, cy, coreR, coreR, grad, INK, 2.0);

    // Vành quầng sáng mặt trời bên trong
    ellipse(ctx, cx, cy, coreR - 3.5, coreR - 3.5, null, '#fde047', 1.8);

    ctx.restore();
  }

  // =============================================================
  // 3. MOON (Mặt trăng có pha phase 0–1, vẽ bằng bóng che đúng chiều sáng)
  // center: [0, -50], disc r: 34 (y từ -85 đến -15)
  // phase: 0 (tối) -> 0.25 (bán nguyệt phải) -> 0.5 (rằm tròn) -> 0.75 (bán nguyệt trái) -> 1 (tối)
  // =============================================================
  function drawMoon(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    const r = 34;
    const phase = clamp(s.phase !== undefined ? s.phase : 0.5, 0, 1);

    // 1. Vẽ nền tối của toàn bộ đĩa trăng (vùng tối không gian)
    ellipse(ctx, cx, cy, r, r, '#0f172a', INK, 1.6);

    // Nếu phase nằm trong khoảng (0.02, 0.98): vẽ phần sáng
    if (phase > 0.02 && phase < 0.98) {
      ctx.save();
      ctx.beginPath();

      if (Math.abs(phase - 0.5) < 0.01) {
        // Trăng rằm tròn: toàn bộ đĩa trăng được chiếu sáng
        ctx.arc(cx, cy, r, 0, TAU);
      } else if (phase < 0.5) {
        // Waxing (Trăng lớn dần): Nửa bên PHẢI (x >= 0) được chiếu sáng
        ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
        const rx = Math.abs(Math.cos(phase * TAU)) * r;
        ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, phase < 0.25);
      } else {
        // Waning (Trăng khuyết dần): Nửa bên TRÁI (x <= 0) được chiếu sáng
        ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, false);
        const rx = Math.abs(Math.cos(phase * TAU)) * r;
        ctx.ellipse(cx, cy, rx, r, 0, -Math.PI / 2, Math.PI / 2, phase < 0.75);
      }
      ctx.closePath();
      ctx.clip();

      // Tô màu phần sáng của mặt trăng: vàng kem ngọc ngà ấm áp
      const moonGrad = ctx.createRadialGradient(cx - 10, cy - 10, 6, cx, cy, r);
      moonGrad.addColorStop(0, '#ffffff');
      moonGrad.addColorStop(0.4, '#fef9c3');
      moonGrad.addColorStop(1, '#fde68a');
      ctx.fillStyle = moonGrad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

      // Các hố va chạm mặt trăng (craters) màu xám vàng nhạt
      const craters = [
        [-10, -8, 6],
        [8, -12, 4.5],
        [12, 6, 7],
        [-6, 12, 5],
        [2, -2, 3.5],
        [-14, 4, 3]
      ];
      for (const [ox, oy, cr] of craters) {
        ellipse(ctx, cx + ox, cy + oy, cr, cr * 0.9, '#fef08a', 'rgba(217, 119, 6, 0.27)', 0.8);
        ellipse(ctx, cx + ox - cr * 0.2, cy + oy - cr * 0.2, cr * 0.4, cr * 0.35, 'rgba(255, 255, 255, 0.6)', null);
      }

      ctx.restore(); // Kết thúc clip vùng sáng
    }

    // Viền tròn mực sắc sảo bên ngoài
    ellipse(ctx, cx, cy, r, r, null, INK, 1.8);

    ctx.restore();
  }

  // =============================================================
  // 4. COMET (Sao chổi có đuôi bụi/băng sáng động theo t)
  // nucleus: [16, -60], tail quét về [-48, -25]
  // y luôn trong [-76, -18]
  // =============================================================
  function drawComet(ctx, s, t) {
    ctx.save();
    const nx = 16, ny = -60;

    // Đuôi bụi và ion quét dài về phía sau bên trái
    const tailEnd1 = [-48, -25];
    const tailEnd2 = [-42, -38];
    const tailEnd3 = [-36, -18];

    // Lớp đuôi ion xanh dương sáng
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(nx - 4, ny - 6);
    ctx.quadraticCurveTo(-15, -48, tailEnd2[0], tailEnd2[1]);
    ctx.lineTo(tailEnd1[0], tailEnd1[1]);
    ctx.quadraticCurveTo(-10, -40, nx - 6, ny + 4);
    ctx.closePath();
    const ionGrad = ctx.createLinearGradient(nx, ny, tailEnd1[0], tailEnd1[1]);
    ionGrad.addColorStop(0, 'rgba(56, 189, 248, 0.93)');
    ionGrad.addColorStop(0.6, 'rgba(129, 140, 248, 0.53)');
    ionGrad.addColorStop(1, 'rgba(192, 132, 252, 0)');
    ctx.fillStyle = ionGrad;
    ctx.fill();
    ctx.restore();

    // Lớp đuôi bụi vàng/trắng bạc uốn lượn
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(nx, ny + 5);
    ctx.quadraticCurveTo(-8, -35, tailEnd3[0], tailEnd3[1]);
    ctx.lineTo(tailEnd1[0], tailEnd1[1]);
    ctx.quadraticCurveTo(-18, -42, nx - 5, ny - 5);
    ctx.closePath();
    const dustGrad = ctx.createLinearGradient(nx, ny, tailEnd3[0], tailEnd3[1]);
    dustGrad.addColorStop(0, 'rgba(254, 240, 138, 0.8)');
    dustGrad.addColorStop(0.5, 'rgba(103, 232, 249, 0.4)');
    dustGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = dustGrad;
    ctx.fill();
    ctx.restore();

    // Các hạt bụi tinh thể băng lấp lánh dọc theo đuôi (hàm t tất định)
    for (let i = 0; i < 9; i++) {
      const u = ((t * 1.8 + i * 0.13) % 1.0);
      const px = mix(nx - 2, tailEnd1[0] - 5, u) + Math.sin(i * 7 + t * 4) * 4;
      const py = mix(ny, tailEnd1[1] + 2, u) + Math.cos(i * 5 + t * 3) * 3;
      const sparkleR = (1.0 - u) * 2.2;
      ellipse(ctx, px, py, sparkleR, sparkleR, '#ffffff', null);
    }

    // Hào quang đầu sao chổi (Coma)
    const comaGrad = ctx.createRadialGradient(nx, ny, 2, nx, ny, 14);
    comaGrad.addColorStop(0, '#ffffff');
    comaGrad.addColorStop(0.4, '#a5f3fc');
    comaGrad.addColorStop(0.8, 'rgba(56, 189, 248, 0.53)');
    comaGrad.addColorStop(1, 'rgba(2, 132, 199, 0)');
    ellipse(ctx, nx, ny, 14, 14, comaGrad, null);

    // Nhân sao chổi bằng đá băng đặc (Nucleus)
    drawPoly(ctx, [
      [nx - 4, ny - 5],
      [nx + 5, ny - 4],
      [nx + 6, ny + 3],
      [nx + 1, ny + 6],
      [nx - 5, ny + 4],
      [nx - 6, ny - 1]
    ], '#e0f2fe', INK, 1.2);
    // Vệt sáng chói lọi ngay tâm nhân
    ellipse(ctx, nx, ny, 3, 3, '#ffffff', null);

    ctx.restore();
  }

  // =============================================================
  // 5. SATELLITE (Vệ tinh nhân tạo viễn thông)
  // center: [0, -50], panels hai bên vươn tới x=±46, ăng-ten y=-84
  // =============================================================
  function drawSatellite(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;

    // 1. Hai cánh pin năng lượng mặt trời (Solar panels)
    drawPoly(ctx, [[-46, cy - 9], [-14, cy - 9], [-14, cy + 9], [-46, cy + 9]], '#1d4ed8', INK, 1.4);
    for (let x = -38; x <= -22; x += 8) {
      line(ctx, [[x, cy - 9], [x, cy + 9]], '#38bdf8', 1.0);
    }
    line(ctx, [[-46, cy], [-14, cy]], '#38bdf8', 1.0);

    drawPoly(ctx, [[14, cy - 9], [46, cy - 9], [46, cy + 9], [14, cy + 9]], '#1d4ed8', INK, 1.4);
    for (let x = 22; x <= 38; x += 8) {
      line(ctx, [[x, cy - 9], [x, cy + 9]], '#38bdf8', 1.0);
    }
    line(ctx, [[14, cy], [46, cy]], '#38bdf8', 1.0);

    // Trục nối cánh pin với thân vệ tinh
    line(ctx, [[-16, cy], [16, cy]], '#475569', 2.4);

    // 2. Thân vệ tinh (Satellite Bus) bọc lá vàng cách nhiệt MLI (Gold foil)
    drawPoly(ctx, [[-12, cy - 13], [12, cy - 13], [12, cy + 13], [-12, cy + 13]], '#f59e0b', INK, 1.6);
    for (let x = -8; x <= 8; x += 6) {
      line(ctx, [[x, cy - 13], [x + 4, cy + 13]], '#d97706', 0.9);
      line(ctx, [[x + 4, cy - 13], [x, cy + 13]], '#d97706', 0.9);
    }

    // 3. Ăng-ten chảo parabol viễn thông ở đỉnh
    const dishY = cy - 22; // y = -72
    line(ctx, [[0, cy - 13], [0, dishY]], '#334155', 2.0);
    path(ctx, `M -14 ${dishY} Q 0 ${dishY - 10} 14 ${dishY}`, '#e2e8f0', INK, 1.4);
    line(ctx, [[0, dishY - 5], [2, dishY - 12]], '#0284c7', 1.8);
    ellipse(ctx, 2, dishY - 12, 2.5, 2.5, '#ef4444', INK, 0.8);

    // 4. Kính cảm biến trắc tinh và động cơ đẩy ở đáy (y=-37..-33)
    drawPoly(ctx, [[-6, cy + 13], [6, cy + 13], [4, cy + 17], [-4, cy + 17]], '#334155', INK, 1.0);
    ellipse(ctx, 0, cy, 3, 3, '#38bdf8', INK, 0.8);

    ctx.restore();
  }

  // =============================================================
  // 6. SPACE_STATION (Trạm không gian quốc tế ISS)
  // center: [0, -50], core modules, cupola dome, double solar arrays
  // y trong [-74, -26]
  // =============================================================
  function drawSpaceStation(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;

    // 1. Giàn khung chịu lực chính (Main truss girder)
    line(ctx, [[-48, cy], [48, cy]], '#64748b', 3.0);
    line(ctx, [[-48, cy - 2], [48, cy - 2]], '#94a3b8', 1.2);
    for (let x = -44; x <= 44; x += 11) {
      line(ctx, [[x, cy - 4], [x + 6, cy + 4]], '#334155', 0.9);
      line(ctx, [[x + 6, cy - 4], [x, cy + 4]], '#334155', 0.9);
    }

    // 2. Bốn cụm pin mặt trời lớn hai đầu (Double Solar Arrays)
    drawPoly(ctx, [[-48, cy - 22], [-26, cy - 22], [-26, cy - 4], [-48, cy - 4]], '#b45309', INK, 1.2);
    drawPoly(ctx, [[-48, cy + 4], [-26, cy + 4], [-26, cy + 22], [-48, cy + 22]], '#b45309', INK, 1.2);
    for (let x = -42; x <= -30; x += 6) {
      line(ctx, [[x, cy - 22], [x, cy - 4]], '#f59e0b', 0.8);
      line(ctx, [[x, cy + 4], [x, cy + 22]], '#f59e0b', 0.8);
    }

    drawPoly(ctx, [[26, cy - 22], [48, cy - 22], [48, cy - 4], [26, cy - 4]], '#b45309', INK, 1.2);
    drawPoly(ctx, [[26, cy + 4], [48, cy + 4], [48, cy + 22], [26, cy + 22]], '#b45309', INK, 1.2);
    for (let x = 32; x <= 44; x += 6) {
      line(ctx, [[x, cy - 22], [x, cy - 4]], '#f59e0b', 0.8);
      line(ctx, [[x, cy + 4], [x, cy + 22]], '#f59e0b', 0.8);
    }

    // 3. Cụm module sinh hoạt và phòng thí nghiệm điều áp ở trung tâm
    drawPoly(ctx, [[-16, cy - 9], [16, cy - 9], [16, cy + 9], [-16, cy + 9]], cylinder(ctx, -16, 16, '#e2e8f0'), INK, 1.4);
    line(ctx, [[-6, cy - 9], [-6, cy + 9]], '#64748b', 1.4);
    line(ctx, [[6, cy - 9], [6, cy + 9]], '#64748b', 1.4);

    drawPoly(ctx, [[-8, cy - 18], [8, cy - 18], [8, cy - 9], [-8, cy - 9]], '#cbd5e1', INK, 1.2);
    drawPoly(ctx, [[-8, cy + 9], [8, cy + 9], [8, cy + 20], [-8, cy + 20]], '#cbd5e1', INK, 1.2);

    // Vòm quan sát Trái Đất (Cupola observatory dome) ở phía trên
    ellipse(ctx, 0, cy - 18, 5, 4, '#38bdf8', INK, 1.2);

    // Cổng ghép nối tàu vũ trụ (Docking Port) ở phía dưới vươn tới y=-28
    drawPoly(ctx, [[-5, cy + 20], [5, cy + 20], [6, cy + 24], [-6, cy + 24]], '#475569', INK, 1.2);
    ellipse(ctx, 0, cy + 24, 6, 2.5, '#1e293b', INK, 1.0);

    // Cửa sổ tròn module
    ellipse(ctx, -10, cy, 2.2, 2.2, '#0284c7', null);
    ellipse(ctx, 10, cy, 2.2, 2.2, '#0284c7', null);

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS
  // 1. SPACE_ORBIT: Quỹ đạo không gian nhìn về Trái Đất cong phía dưới
  // 2. MARS_SURFACE: Bề mặt Sao Hoả đỏ
  // Cả 2 đều ground_y: 810, 7 weathers, day/night, ZERO TEXT!
  // =============================================================

  function drawSpaceOrbit(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;
    const weather = (settings && settings.weather) || 'clear';

    // Bầu trời không gian sâu thẳm
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.7, '#070f26');
      sky.addColorStop(1, '#0f172a');
    } else {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(0.65, '#0b132b');
      sky.addColorStop(1, '#1e1b4b');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, 1024);

    // Dải tinh vân khí vũ trụ mờ ảo (Nebula glow)
    const neb = ctx.createRadialGradient(200, 260, 20, 200, 260, 220);
    neb.addColorStop(0, 'rgba(168, 85, 247, 0.18)');
    neb.addColorStop(0.5, 'rgba(59, 130, 246, 0.10)');
    neb.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, 576, groundY);

    // Mạng lưới 50 ngôi sao tất định (seed cố định theo i)
    for (let i = 0; i < 50; i++) {
      const sx = ((i * 137 + 43) % 560) + 8;
      const sy = ((i * 223 + 19) % (groundY - 140)) + 10;
      const brightness = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i * 2.1));
      const starR = i % 5 === 0 ? 2.0 : 1.2;

      ctx.save();
      ctx.globalAlpha = brightness;
      ellipse(ctx, sx, sy, starR, starR, '#ffffff', null);
      if (i % 8 === 0) {
        line(ctx, [[sx - 4, sy], [sx + 4, sy]], '#93c5fd', 0.8);
        line(ctx, [[sx, sy - 4], [sx, sy + 4]], '#93c5fd', 0.8);
      }
      ctx.restore();
    }

    // Hiệu ứng thời tiết vũ trụ
    if (weather === 'storm') {
      ctx.save();
      for (let j = 0; j < 3; j++) {
        const aGrad = ctx.createLinearGradient(0, groundY - 220 + j * 30, 0, groundY - 50);
        aGrad.addColorStop(0, 'rgba(34, 197, 94, 0)');
        aGrad.addColorStop(0.5, 'rgba(34, 197, 94, 0.28)');
        aGrad.addColorStop(0.8, 'rgba(56, 189, 248, 0.35)');
        aGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = aGrad;
        ctx.beginPath();
        ctx.moveTo(0, groundY - 180 + Math.sin(t * 2 + j) * 20);
        ctx.bezierCurveTo(180, groundY - 240 + j * 20, 380, groundY - 140 - j * 20, 576, groundY - 190);
        ctx.lineTo(576, groundY - 40);
        ctx.lineTo(0, groundY - 40);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else if (weather === 'snow' || weather === 'rain') {
      ctx.save();
      for (let k = 0; k < 12; k++) {
        const mx = ((k * 89 + t * 120) % 650) - 40;
        const my = ((k * 67 + t * 90) % 500) + 20;
        line(ctx, [[mx, my], [mx - 25, my - 18]], '#e0f2fe', 1.0);
      }
      ctx.restore();
    }

    // Đường cong vĩ đại của Trái Đất ở phía dưới (Earth Limb)
    const earthCenterX = 288, earthCenterY = 1650, earthRadius = 920;

    // 1. Quầng khí quyển phát sáng màu xanh lam mỏng manh (Atmospheric glow)
    ctx.save();
    ctx.beginPath();
    ctx.arc(earthCenterX, earthCenterY, earthRadius + 14, 0, TAU);
    const atmoGrad = ctx.createRadialGradient(earthCenterX, earthCenterY, earthRadius - 20, earthCenterX, earthCenterY, earthRadius + 16);
    atmoGrad.addColorStop(0, 'rgba(56, 189, 248, 0.53)');
    atmoGrad.addColorStop(0.7, 'rgba(2, 132, 199, 0.27)');
    atmoGrad.addColorStop(1, 'rgba(2, 132, 199, 0)');
    ctx.fillStyle = atmoGrad;
    ctx.fill();
    ctx.restore();

    // 2. Bề mặt Trái Đất cong
    ctx.save();
    ctx.beginPath();
    ctx.arc(earthCenterX, earthCenterY, earthRadius, 0, TAU);
    ctx.fillStyle = '#0369a1';
    ctx.fill();
    ctx.clip();

    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.ellipse(180, groundY - 20, 110, 45, 0.2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(390, groundY + 20, 130, 50, -0.15, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.73)';
    ctx.beginPath();
    ctx.ellipse(140, groundY - 45, 80, 18, 0.1, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(320, groundY - 35, 120, 22, -0.05, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(460, groundY - 15, 90, 20, 0.15, 0, TAU);
    ctx.fill();

    if (isNight) {
      const shadowGrad = ctx.createLinearGradient(0, groundY - 100, 576, groundY + 100);
      shadowGrad.addColorStop(0, 'rgba(2, 6, 23, 0.85)');
      shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0.2)');
      ctx.fillStyle = shadowGrad;
      ctx.fillRect(0, groundY - 120, 576, 300);
    }

    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(earthCenterX, earthCenterY, earthRadius, 0, TAU);
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function drawMarsSurface(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;
    const weather = (settings && settings.weather) || 'clear';

    // Bầu trời Sao Hoả bụi màu cam cháy / đỏ đất (hoặc tím sẫm ban đêm)
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.7);
    if (isNight) {
      sky.addColorStop(0, '#1c0804');
      sky.addColorStop(0.7, '#3b1209');
      sky.addColorStop(1, '#57180c');
    } else {
      sky.addColorStop(0, '#ea580c');
      sky.addColorStop(0.5, '#f97316');
      sky.addColorStop(1, '#fed7aa');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY * 0.7);

    // Mặt trời nhỏ màu xanh lam nhạt (đặc trưng hoàng hôn Sao Hoả do bụi phân tán ánh sáng)
    if (!isNight) {
      ellipse(ctx, 440, 140, 16, 16, '#fef08a', null);
      ellipse(ctx, 440, 140, 24, 24, 'rgba(125, 211, 252, 0.25)', null);
    } else {
      ellipse(ctx, 460, 110, 4.5, 3.5, '#cbd5e1', null);
      ellipse(ctx, 220, 160, 2.5, 2.0, '#94a3b8', null);
    }

    // Dãy vành núi miệng hố va chạm và núi lửa xa xăm (Crater rim mountains)
    const mountainCol = isNight ? '#3b1209' : '#9a3412';
    path(ctx, `M 0 ${groundY - 110} Q 110 ${groundY - 190} 220 ${groundY - 120} Q 360 ${groundY - 210} 480 ${groundY - 130} L 576 ${groundY - 150} L 576 ${groundY} L 0 ${groundY} Z`, mountainCol, null);

    // Đồi sa mạc cát đỏ tầng giữa
    const midHillCol = isNight ? '#451a03' : '#c2410c';
    path(ctx, `M 0 ${groundY - 70} Q 180 ${groundY - 130} 360 ${groundY - 60} Q 480 ${groundY - 100} 576 ${groundY - 75} L 576 ${groundY} L 0 ${groundY} Z`, midHillCol, null);

    // Bề mặt đất Sao Hoả gồ ghề đầy đá basalt (từ groundY - 50 xuống 1024)
    const marsGround = ctx.createLinearGradient(0, groundY - 50, 0, 1024);
    marsGround.addColorStop(0, isNight ? '#57180c' : '#c2410c');
    marsGround.addColorStop(0.5, isNight ? '#3b1209' : '#9a3412');
    marsGround.addColorStop(1, isNight ? '#240a05' : '#7c2d12');
    ctx.fillStyle = marsGround;
    ctx.fillRect(0, groundY - 50, 576, 1024 - (groundY - 50));

    // Các tảng đá và hố lõm sa mạc Sao Hoả
    const rocks = [
      [60, groundY + 20, 14, 8],
      [140, groundY + 50, 22, 11],
      [250, groundY + 15, 12, 7],
      [340, groundY + 65, 28, 14],
      [430, groundY + 30, 18, 9],
      [510, groundY + 55, 16, 8],
      [90, groundY + 110, 32, 16],
      [470, groundY + 120, 26, 13]
    ];
    for (const [rx, ry, rw, rh] of rocks) {
      ellipse(ctx, rx, ry, rw, rh, isNight ? '#240a05' : '#7c2d12', INK, 1.2);
      ellipse(ctx, rx - rw * 0.2, ry - rh * 0.2, rw * 0.45, rh * 0.35, isNight ? '#3b1209' : '#ea580c', null);
    }

    if (weather === 'storm' || weather === 'wind') {
      ctx.save();
      const dust = ctx.createLinearGradient(0, 0, 576, 1024);
      dust.addColorStop(0, 'rgba(234, 88, 12, 0.25)');
      dust.addColorStop(0.5, 'rgba(194, 65, 12, 0.40)');
      dust.addColorStop(1, 'rgba(124, 45, 18, 0.20)');
      ctx.fillStyle = dust;
      ctx.fillRect(0, 0, 576, 1024);
      ctx.restore();
    }

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION (RemakeVector.register)
  // =============================================================
  const SPACE_RIGS = {
    planet: {
      draw(ctx, s, t) { drawPlanet(ctx, s, t); }
    },
    sun: {
      draw(ctx, s, t) { drawSun(ctx, s, t); }
    },
    moon: {
      draw(ctx, s, t) { drawMoon(ctx, s, t); }
    },
    comet: {
      draw(ctx, s, t) { drawComet(ctx, s, t); }
    },
    satellite: {
      draw(ctx, s, t) { drawSatellite(ctx, s, t); }
    },
    space_station: {
      draw(ctx, s, t) { drawSpaceStation(ctx, s, t); }
    }
  };

  const SPACE_BACKGROUNDS = {
    space_orbit: {
      label: 'Quỹ đạo không gian nhìn về Trái Đất',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawSpaceOrbit(ctx, settings, t); }
    },
    mars_surface: {
      label: 'Bề mặt Sao Hoả đỏ',
      theme: 'farm',
      ground_y: 810,
      draw(ctx, settings, t) { drawMarsSurface(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: SPACE_RIGS,
    backgrounds: SPACE_BACKGROUNDS
  });

})();
