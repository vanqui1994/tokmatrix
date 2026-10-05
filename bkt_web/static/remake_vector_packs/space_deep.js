// remake_vector_packs/space_deep.js — Giai đoạn Làm giàu: Không gian sâu & Thảm hoạ vũ trụ (space_deep)
// 10 rigs: black_hole, neutron_star, spiral_galaxy, nebula, space_telescope, space_probe, pluto, asteroid, shooting_star, exoplanet_lava
// 2 backgrounds: deep_space_view, observatory_night (ground_y: 810, 7 weathers, day/night, ZERO text)

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('RemakeVector core engine must be loaded before engine packs.');
  }

  const {
    path,
    line: kitLine,
    ellipse,
    cylinder,
    taper,
    tone,
    volume,
    mixColor,
    INK,
    TAU,
    clamp,
    smooth,
    mix,
    hash
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

  // Khổ ngang: dải mở rộng [x0, 0) và [576, x1)
  function extRanges(x0, x1) {
    const out = [];
    if (x0 < 0) out.push([x0, 0]);
    if (x1 > 576) out.push([576, x1]);
    return out;
  }

  function scatterExt(ext, step, key, fn) {
    for (const [a, b] of ext) {
      let i = 0;
      for (let x = a + step * 0.5; x < b - step * 0.3; i++) {
        const r = RemakeVector.kit.seeded(`${key}:${Math.round(x)}`);
        fn(x, r, i);
        x += step * (0.7 + r * 0.6);
      }
    }
  }

  // =============================================================
  // 1. BLACK HOLE (Hố đen với đĩa bồi tụ siêu sáng & photon ring)
  // center: [0, -50], Bounding box: x in [-48, 48], y in [-94, -6]
  // =============================================================
  function drawBlackHole(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    const pulse = 1.0 + 0.04 * Math.sin(t * 2.0);

    // 1. Quầng sáng thấu kính hấp dẫn xa (Gravitational lensing halo)
    const glow = ctx.createRadialGradient(cx, cy, 14, cx, cy, 48 * pulse);
    glow.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
    glow.addColorStop(0.35, 'rgba(249, 115, 22, 0.35)');
    glow.addColorStop(0.7, 'rgba(194, 65, 12, 0.15)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ellipse(ctx, cx, cy, 48 * pulse, 36 * pulse, glow, null);

    // 2. Vành đĩa bồi tụ phía sau (Accretion disk - back half arching over black hole)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy - 8, 44, 20, 0, Math.PI, 0);
    ctx.lineWidth = 14;
    const backGrad = ctx.createLinearGradient(cx - 44, cy, cx + 44, cy);
    backGrad.addColorStop(0, '#fde047');
    backGrad.addColorStop(0.4, '#ea580c');
    backGrad.addColorStop(1, '#9a3412');
    ctx.strokeStyle = backGrad;
    ctx.stroke();
    ctx.restore();

    // 3. Vòng photon mỏng cực sáng (Photon sphere ring)
    ellipse(ctx, cx, cy, 22, 22, null, '#fef08a', 2.0);

    // 4. Chân trời sự kiện (Event horizon - hố đen thuần khiết)
    ellipse(ctx, cx, cy, 20, 20, '#030712', '#000000', 1.5);

    // 5. Đĩa bồi tụ phía trước (Accretion disk - front half crossing foreground)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 46, 15, -0.05, 0, Math.PI);
    ctx.lineWidth = 15;
    const frontGrad = ctx.createLinearGradient(cx - 46, cy, cx + 46, cy);
    // Doppler beaming: bên tiếp cận (trái) sáng xanh-vàng hơn, bên lùi (phải) đỏ-cam đậm
    frontGrad.addColorStop(0, '#fef9c3');
    frontGrad.addColorStop(0.2, '#facc15');
    frontGrad.addColorStop(0.5, '#f97316');
    frontGrad.addColorStop(0.85, '#dc2626');
    frontGrad.addColorStop(1, '#7f1d1d');
    ctx.strokeStyle = frontGrad;
    ctx.stroke();

    // Dải bụi xoáy sáng bên trong đĩa bồi tụ
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy + 4, 38, 9, -0.05, 0.1, Math.PI - 0.1);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.stroke();
    ctx.restore();

    // Tia phản lực cực tương đối tính nhỏ (Relativistic jet wisps)
    line(ctx, [[cx, cy - 24], [cx, cy - 44]], 'rgba(147, 197, 253, 0.65)', 2.5);
    line(ctx, [[cx, cy + 24], [cx, cy + 44]], 'rgba(147, 197, 253, 0.65)', 2.5);

    ctx.restore();
  }

  // =============================================================
  // 2. NEUTRON STAR (Sao neutron siêu đặc, chùm tia pulsar & từ trường)
  // center: [0, -50], Bounding box: x in [-46, 46], y in [-95, -5]
  // =============================================================
  function drawNeutronStar(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    const spin = t * 4.0;

    // 1. Chùm tia bức xạ vô tuyến lưỡng cực (Relativistic pulsar jets)
    const jetAngle = 0.45;
    const jLen = 42;
    for (const dir of [-1, 1]) {
      const jx = cx + dir * Math.sin(jetAngle) * jLen;
      const jy = cy + dir * -Math.cos(jetAngle) * jLen;
      const coneGrad = ctx.createLinearGradient(cx, cy, jx, jy);
      coneGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      coneGrad.addColorStop(0.3, 'rgba(56, 189, 248, 0.7)');
      coneGrad.addColorStop(0.7, 'rgba(99, 102, 241, 0.35)');
      coneGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');

      // Chùm nón loe ra
      const nx = -Math.cos(jetAngle) * 11;
      const ny = -Math.sin(jetAngle) * 11;
      drawPoly(ctx, [
        [cx, cy],
        [jx + nx, jy + ny],
        [jx - nx, jy - ny]
      ], coneGrad, null);
    }

    // 2. Các cung từ trường xoắn (Magnetosphere loops)
    ctx.save();
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.5)';
    ctx.lineWidth = 1.4;
    for (let r = 24; r <= 38; r += 12) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.45, 0.45 + Math.sin(spin * 0.3) * 0.05, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Quầng sáng hào quang năng lượng
    const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, 32);
    halo.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    halo.addColorStop(0.3, 'rgba(56, 189, 248, 0.6)');
    halo.addColorStop(0.7, 'rgba(79, 70, 229, 0.2)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ellipse(ctx, cx, cy, 32, 32, halo, null);

    // 4. Lõi sao neutron siêu đặc (bán kính nhỏ, xanh trắng chói lọi)
    const coreGrad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 14);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.4, '#a5f3fc');
    coreGrad.addColorStop(0.75, '#38bdf8');
    coreGrad.addColorStop(1, '#1e40af');
    ellipse(ctx, cx, cy, 14, 14, coreGrad, '#ffffff', 1.5);

    // Tia chớp sáng 4 cánh ngay tâm
    const flareLen = 8 + Math.sin(spin * 2) * 3;
    line(ctx, [[cx - flareLen, cy], [cx + flareLen, cy]], '#ffffff', 2.0);
    line(ctx, [[cx, cy - flareLen], [cx, cy + flareLen]], '#ffffff', 2.0);

    ctx.restore();
  }

  // =============================================================
  // 3. SPIRAL GALAXY (Thiên hà xoắn ốc với lõi vàng & 2 cánh tay sao)
  // center: [0, -50], Bounding box: x in [-46, 46], y in [-88, -12]
  // =============================================================
  function drawSpiralGalaxy(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    const rot = t * 0.2;

    // 1. Quầng đĩa thiên hà nền mờ (Diffuse galactic disk)
    const diskGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 45);
    diskGrad.addColorStop(0, 'rgba(254, 240, 138, 0.4)');
    diskGrad.addColorStop(0.35, 'rgba(147, 197, 253, 0.25)');
    diskGrad.addColorStop(0.7, 'rgba(168, 85, 247, 0.15)');
    diskGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = diskGrad;
    ellipse(ctx, cx, cy, 45, 26, diskGrad, null);

    // 2. Hai nhánh xoắn ốc chứa bụi khí và cụm sao trẻ
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35 + rot * 0.1);

    for (let arm = 0; arm < 2; arm++) {
      const armOffset = arm * Math.PI;
      ctx.beginPath();
      for (let th = 0; th <= 4.2; th += 0.15) {
        const rad = 6 + th * 7.5;
        const angle = th + armOffset;
        const px = rad * Math.cos(angle);
        const py = (rad * 0.52) * Math.sin(angle);
        if (th === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.lineWidth = 6;
      ctx.strokeStyle = arm === 0 ? 'rgba(96, 165, 250, 0.65)' : 'rgba(192, 132, 252, 0.65)';
      ctx.stroke();

      // Điểm xuyết các đám tinh vân màu hồng và cụm sao sáng dọc theo cánh tay
      for (let th = 1.0; th <= 4.0; th += 0.45) {
        const rad = 6 + th * 7.5;
        const angle = th + armOffset;
        const px = rad * Math.cos(angle);
        const py = (rad * 0.52) * Math.sin(angle);
        const starSize = 1.0 + (th % 0.9);
        ellipse(ctx, px, py, starSize, starSize, '#f472b6', null);
        ellipse(ctx, px + 2, py - 1, starSize * 0.8, starSize * 0.8, '#ffffff', null);
      }
    }
    ctx.restore();

    // 3. Vết bụi tối chắn sáng (Dust lanes)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35 + rot * 0.1);
    ctx.strokeStyle = 'rgba(67, 20, 7, 0.4)';
    ctx.lineWidth = 1.8;
    for (let arm = 0; arm < 2; arm++) {
      const armOffset = arm * Math.PI + 0.25;
      ctx.beginPath();
      for (let th = 0.8; th <= 3.2; th += 0.2) {
        const rad = 7 + th * 6.8;
        const angle = th + armOffset;
        const px = rad * Math.cos(angle);
        const py = (rad * 0.52) * Math.sin(angle);
        if (th === 0.8) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();

    // 4. Lõi thiên hà phình sáng ấm (Galactic bulge / nucleus)
    const core = ctx.createRadialGradient(cx, cy, 2, cx, cy, 14);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.3, '#fef08a');
    core.addColorStop(0.65, '#f59e0b');
    core.addColorStop(1, 'rgba(217, 119, 6, 0)');
    ellipse(ctx, cx, cy, 14, 9, core, null);

    ctx.restore();
  }

  // =============================================================
  // 4. NEBULA (Tinh vân vũ trụ bồng bềnh đa tầng phát sáng)
  // center: [0, -50], Bounding box: x in [-46, 46], y in [-92, -8]
  // =============================================================
  function drawNebula(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    const wave = Math.sin(t * 0.8) * 2.0;

    // Tinh vân gồm nhiều đám khí bụi đa sắc đan xen
    const clouds = [
      { x: cx - 12, y: cy + 6, rx: 32, ry: 24, col: 'rgba(219, 39, 119, 0.45)' }, // hồng tươi
      { x: cx + 14, y: cy - 8, rx: 30, ry: 26, col: 'rgba(6, 182, 212, 0.42)' },  // ngọc lam
      { x: cx - 6, y: cy - 18, rx: 28, ry: 20, col: 'rgba(147, 51, 234, 0.45)' }, // tím sẫm
      { x: cx + 8, y: cy + 12, rx: 26, ry: 18, col: 'rgba(245, 158, 11, 0.40)' }, // hổ phách
      { x: cx, y: cy, rx: 36, ry: 26, col: 'rgba(59, 130, 246, 0.35)' }           // xanh dương
    ];

    for (const c of clouds) {
      const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, c.rx);
      g.addColorStop(0, c.col);
      g.addColorStop(0.6, c.col.replace(/[\d\.]+\)$/, '0.2)'));
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ellipse(ctx, c.x, c.y, c.rx, c.ry, g, null);
    }

    // Các cột bụi khí sừng sững (Pillars of Creation silhouettes)
    path(ctx, `M ${cx - 24} ${cy + 28} Q ${cx - 22} ${cy + 4} ${cx - 16} ${cy - 12 + wave} Q ${cx - 10} ${cy - 22} ${cx - 6} ${cy - 14} Q ${cx - 2} ${cy + 6} ${cx - 8} ${cy + 28} Z`, 'rgba(51, 17, 73, 0.65)', null);
    path(ctx, `M ${cx} ${cy + 28} Q ${cx + 4} ${cy + 10} ${cx + 10} ${cy - 6 - wave} Q ${cx + 16} ${cy - 16} ${cx + 20} ${cy - 6} Q ${cx + 22} ${cy + 12} ${cx + 18} ${cy + 28} Z`, 'rgba(31, 38, 73, 0.60)', null);

    // Điểm xuyết các ngôi sao sơ sinh lấp lánh trong mây bụi
    const stars = [
      { x: cx - 18, y: cy - 20, r: 2.2, col: '#fef08a' },
      { x: cx + 18, y: cy + 8, r: 1.8, col: '#67e8f9' },
      { x: cx - 4, y: cy - 8, r: 2.6, col: '#ffffff' },
      { x: cx + 12, y: cy - 24, r: 1.6, col: '#f472b6' },
      { x: cx - 22, y: cy + 14, r: 1.5, col: '#93c5fd' },
      { x: cx + 24, y: cy - 10, r: 2.0, col: '#fef08a' }
    ];
    for (const st of stars) {
      ellipse(ctx, st.x, st.y, st.r, st.r, st.col, null);
      line(ctx, [[st.x - st.r * 2, st.y], [st.x + st.r * 2, st.y]], st.col, 0.8);
      line(ctx, [[st.x, st.y - st.r * 2], [st.x, st.y + st.r * 2]], st.col, 0.8);
    }

    ctx.restore();
  }

  // =============================================================
  // 5. SPACE TELESCOPE (Kính viễn vọng không gian chung, gương lục giác, lá chắn nhiệt)
  // center: [0, -50], Bounding box: x in [-46, 46], y in [-92, -8]
  // =============================================================
  function drawSpaceTelescope(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;

    // 1. Cánh tấm pin mặt trời hai bên (Solar arrays left & right)
    for (const dir of [-1, 1]) {
      const bx = cx + dir * 30;
      // Khung cánh
      drawPoly(ctx, [
        [cx + dir * 16, cy - 8],
        [bx + dir * 14, cy - 14],
        [bx + dir * 14, cy + 14],
        [cx + dir * 16, cy + 8]
      ], '#1e3a8a', INK, 1.2);

      // Các ô quang điện xanh đậm
      for (let i = 0; i < 3; i++) {
        const ox = cx + dir * (20 + i * 7.5);
        line(ctx, [[ox, cy - 10], [ox, cy + 10]], '#60a5fa', 1.0);
      }
      line(ctx, [[cx + dir * 16, cy], [bx + dir * 14, cy]], '#93c5fd', 1.0);
    }

    // 2. Màng chắn nhiệt đa lớp kiểu cánh buồm (Multi-layer Sunshield)
    drawPoly(ctx, [
      [cx - 42, cy + 16],
      [cx, cy + 8],
      [cx + 42, cy + 16],
      [cx + 34, cy + 28],
      [cx, cy + 34],
      [cx - 34, cy + 28]
    ], '#cbd5e1', INK, 1.4);

    drawPoly(ctx, [
      [cx - 36, cy + 20],
      [cx, cy + 14],
      [cx + 36, cy + 20],
      [cx + 28, cy + 30],
      [cx, cy + 36],
      [cx - 28, cy + 30]
    ], '#94a3b8', INK, 1.2);

    // Thân tàu vũ trụ trung tâm (Spacecraft bus)
    drawPoly(ctx, [
      [cx - 10, cy + 6],
      [cx + 10, cy + 6],
      [cx + 8, cy + 20],
      [cx - 8, cy + 20]
    ], '#475569', INK, 1.2);

    // 3. Cụm gương chính lục giác mạ vàng (Gold hexagonal segmented mirror array)
    const hexRadius = 14;
    ctx.save();
    // Khung gương
    ellipse(ctx, cx, cy - 16, hexRadius + 3, hexRadius + 3, '#1e293b', INK, 1.4);
    // Gương vàng
    ellipse(ctx, cx, cy - 16, hexRadius, hexRadius, '#eab308', null);

    // Lưới gương phân đoạn
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 1.0;
    for (let a = 0; a < 6; a++) {
      const ang = a * Math.PI / 3;
      line(ctx, [[cx, cy - 16], [cx + Math.cos(ang) * hexRadius, cy - 16 + Math.sin(ang) * hexRadius]], '#ca8a04', 1.0);
    }
    // Gương phụ ở tâm
    ellipse(ctx, cx, cy - 16, 3.5, 3.5, '#1e293b', '#ca8a04', 0.8);

    // Chân đỡ 3 chạc giữ gương phụ (Secondary mirror support struts)
    line(ctx, [[cx - 12, cy - 6], [cx, cy - 36]], '#64748b', 1.4);
    line(ctx, [[cx + 12, cy - 6], [cx, cy - 36]], '#64748b', 1.4);
    line(ctx, [[cx, cy - 28], [cx, cy - 36]], '#64748b', 1.4);
    // Gương phụ nhỏ trên đỉnh
    ellipse(ctx, cx, cy - 36, 4, 3, '#facc15', INK, 1.0);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 6. SPACE PROBE (Tàu thăm dò Voyager-style, chảo ăng-ten, đĩa vàng)
  // center: [0, -50], Bounding box: x in [-46, 46], y in [-92, -8]
  // =============================================================
  function drawSpaceProbe(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;

    // 1. Cần máy phát nhiệt điện đồng vị phóng xạ RTG vươn sang trái
    line(ctx, [[cx - 8, cy + 4], [cx - 36, cy + 18]], '#64748b', 2.0);
    // Các khối tản nhiệt RTG
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.roundRect(cx - 48, cy + 14, 12, 8, 2);
    ctx.fill();
    ctx.stroke();
    line(ctx, [[cx - 46, cy + 16], [cx - 46, cy + 24]], '#94a3b8', 1.0);
    line(ctx, [[cx - 38, cy + 16], [cx - 38, cy + 24]], '#94a3b8', 1.0);

    // 2. Cần từ kế vươn dài sang phải (Magnetometer boom)
    line(ctx, [[cx + 8, cy + 4], [cx + 42, cy - 12]], '#64748b', 1.6);
    ellipse(ctx, cx + 42, cy - 12, 3.5, 3.5, '#475569', INK, 1.0);

    // 3. Thân máy trung tâm 10 cạnh bọc màng vàng (Instrument bus)
    drawPoly(ctx, [
      [cx - 14, cy - 2],
      [cx + 14, cy - 2],
      [cx + 18, cy + 14],
      [cx + 12, cy + 24],
      [cx - 12, cy + 24],
      [cx - 18, cy + 14]
    ], '#d97706', INK, 1.4);

    // Đĩa vàng danh tiếng (Golden Record - KHÔNG CHỮ, chỉ có rãnh âm thanh trừu tượng)
    ellipse(ctx, cx - 2, cy + 11, 7, 7, '#facc15', '#b45309', 1.2);
    ellipse(ctx, cx - 2, cy + 11, 4.5, 4.5, null, '#ca8a04', 0.8);
    ellipse(ctx, cx - 2, cy + 11, 2, 2, '#78350f', null);

    // 4. Chảo ăng-ten parabol lớn màu trắng ngà (High-Gain Dish Antenna)
    // Mặt sau chảo
    ctx.beginPath();
    ctx.ellipse(cx, cy - 16, 32, 14, 0, 0, TAU);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Lòng chảo có chiều sâu bóng đổ
    const dishInner = ctx.createRadialGradient(cx, cy - 16, 2, cx, cy - 16, 28);
    dishInner.addColorStop(0, '#e2e8f0');
    dishInner.addColorStop(0.7, '#f1f5f9');
    dishInner.addColorStop(1, '#cbd5e1');
    ellipse(ctx, cx, cy - 16, 28, 11, dishInner, '#94a3b8', 1.0);

    // Bộ thu sóng ở tâm chảo vươn ra (Feed horn & tripod)
    line(ctx, [[cx - 12, cy - 15], [cx, cy - 32]], '#475569', 1.2);
    line(ctx, [[cx + 12, cy - 15], [cx, cy - 32]], '#475569', 1.2);
    line(ctx, [[cx, cy - 8], [cx, cy - 32]], '#475569', 1.2);
    ellipse(ctx, cx, cy - 32, 3, 4, '#1e293b', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // 7. PLUTO (Sao Diêm Vương với trái tim băng Tombaugh Regio)
  // center: [0, -50], Bounding box: x in [-32, 32], y in [-80, -20]
  // =============================================================
  function drawPluto(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    const r = 24;

    // 1. Hào quang khí quyển xanh mờ (Atmospheric blue haze)
    const haze = ctx.createRadialGradient(cx, cy, r - 2, cx, cy, r + 5);
    haze.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
    haze.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ellipse(ctx, cx, cy, r + 5, r + 5, haze, null);

    // 2. Thân hành tinh với lớp nền màu nâu đỏ tholin
    const surfGrad = ctx.createRadialGradient(cx - 7, cy - 7, 3, cx, cy, r);
    surfGrad.addColorStop(0, '#d97706');
    surfGrad.addColorStop(0.5, '#b45309');
    surfGrad.addColorStop(0.85, '#78350f');
    surfGrad.addColorStop(1, '#451a03');
    ellipse(ctx, cx, cy, r, r, surfGrad, INK, 1.6);

    // 3. Vùng đồng bằng băng hình trái tim nổi tiếng (Tombaugh Regio)
    // Cánh trái tim bên trái
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - 4);
    ctx.bezierCurveTo(cx - 2, cy - 14, cx - 14, cy - 12, cx - 14, cy - 2);
    ctx.bezierCurveTo(cx - 14, cy + 6, cx - 2, cy + 12, cx + 4, cy + 16);
    // Cánh trái tim bên phải
    ctx.bezierCurveTo(cx + 10, cy + 12, cx + 18, cy + 6, cx + 18, cy - 2);
    ctx.bezierCurveTo(cx + 18, cy - 12, cx + 10, cy - 14, cx + 4, cy - 4);
    ctx.closePath();
    ctx.fillStyle = '#fef3c7';
    ctx.fill();
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // Rãnh nứt nitơ băng bên trong trái tim
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.4)';
    ctx.lineWidth = 0.8;
    line(ctx, [[cx - 6, cy - 2], [cx + 2, cy + 6]], null);
    line(ctx, [[cx + 2, cy + 6], [cx + 10, cy + 2]], null);
    ctx.restore();

    // Một vài miệng hố va chạm nhỏ vùng cực
    ellipse(ctx, cx - 12, cy - 14, 2.5, 1.8, '#451a03', '#9a3412', 0.8);
    ellipse(ctx, cx + 12, cy - 15, 2.0, 1.5, '#451a03', '#9a3412', 0.8);

    ctx.restore();
  }

  // =============================================================
  // 8. ASTEROID (Tiểu hành tinh đá gồ ghề với miệng hố va chạm)
  // center: [0, -50], Bounding box: x in [-44, 44], y in [-90, -10]
  // =============================================================
  function drawAsteroid(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    const wobble = Math.sin(t * 1.2) * 0.05;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wobble);

    // Hình thể đá đa giác gồ ghề bất đối xứng
    const pts = [
      [-36, -14],
      [-28, -32],
      [-8, -36],
      [16, -34],
      [34, -20],
      [38, 4],
      [26, 26],
      [8, 34],
      [-18, 30],
      [-34, 16],
      [-38, 2]
    ];

    // Đổ bóng bề mặt đá
    const rockGrad = ctx.createRadialGradient(-10, -12, 6, 0, 0, 42);
    rockGrad.addColorStop(0, '#94a3b8');
    rockGrad.addColorStop(0.45, '#64748b');
    rockGrad.addColorStop(0.8, '#334155');
    rockGrad.addColorStop(1, '#1e293b');

    drawPoly(ctx, pts, rockGrad, INK, 1.8);

    // Các diện vát địa chất (Facet ridges)
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    line(ctx, [[-28, -32], [-10, -8]], null);
    line(ctx, [[-10, -8], [16, -34]], null);
    line(ctx, [[-10, -8], [26, 26]], null);
    line(ctx, [[-10, -8], [-18, 30]], null);

    // Các hố va chạm (Impact craters)
    const craters = [
      { x: -16, y: -16, rx: 8, ry: 6 },
      { x: 12, y: -6, rx: 11, ry: 8 },
      { x: -8, y: 14, rx: 7, ry: 5 },
      { x: 20, y: 16, rx: 5, ry: 4 },
      { x: 14, y: -24, rx: 4, ry: 3 }
    ];
    for (const cr of craters) {
      // Vành hố sáng đón ánh sáng từ góc trên trái
      ellipse(ctx, cr.x - 0.5, cr.y - 0.5, cr.rx + 0.8, cr.ry + 0.8, null, '#cbd5e1', 1.0);
      // Lòng hố tối bóng đổ
      ellipse(ctx, cr.x, cr.y, cr.rx, cr.ry, '#1e293b', '#0f172a', 1.2);
      // Đáy hố sâu
      ellipse(ctx, cr.x + 1, cr.y + 0.8, cr.rx * 0.5, cr.ry * 0.5, '#090d16', null);
    }

    ctx.restore();
    ctx.restore();
  }

  // =============================================================
  // 9. SHOOTING STAR (Sao băng rực sáng với đuôi plasma ion hoá)
  // center: [0, -50], Bounding box: x in [-45, 45], y in [-88, -12]
  // =============================================================
  function drawShootingStar(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    // Hướng bay chéo từ trên-trái xuống dưới-phải
    const hx = cx + 22, hy = cy + 18;  // đầu sao băng
    const tx = cx - 38, ty = cy - 32;  // chóp đuôi

    // 1. Dải plasma đuôi ngoài cùng (Outer ionized trail)
    const trailGrad = ctx.createLinearGradient(tx, ty, hx, hy);
    trailGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    trailGrad.addColorStop(0.3, 'rgba(56, 189, 248, 0.35)');
    trailGrad.addColorStop(0.65, 'rgba(249, 115, 22, 0.6)');
    trailGrad.addColorStop(0.9, 'rgba(254, 240, 138, 0.9)');
    trailGrad.addColorStop(1, '#ffffff');

    // Hình nón đuôi loe rộng
    drawPoly(ctx, [
      [tx, ty],
      [hx - 6, hy - 14],
      [hx + 6, hy + 4],
      [hx - 4, hy + 12]
    ], trailGrad, null);

    // 2. Lõi plasma cháy sáng bên trong
    const innerGrad = ctx.createLinearGradient(cx - 15, cy - 12, hx, hy);
    innerGrad.addColorStop(0, 'rgba(254, 240, 138, 0)');
    innerGrad.addColorStop(0.6, 'rgba(254, 240, 138, 0.8)');
    innerGrad.addColorStop(1, '#ffffff');

    drawPoly(ctx, [
      [cx - 15, cy - 12],
      [hx - 2, hy - 6],
      [hx + 4, hy + 2],
      [hx - 2, hy + 6]
    ], innerGrad, null);

    // 3. Mảnh vụn tàn lửa lấp lánh dọc theo đuôi (Sparkles)
    for (let i = 0; i < 7; i++) {
      const u = (i + 1) / 8;
      const sx = mix(tx, hx, u) + Math.sin(t * 8 + i) * 3;
      const sy = mix(ty, hy, u) + Math.cos(t * 8 + i) * 3;
      ellipse(ctx, sx, sy, 1.2 + (i % 2) * 0.8, 1.2 + (i % 2) * 0.8, '#fef08a', null);
    }

    // 4. Đầu thiên thạch cháy chói lọi (Incandescent fireball head)
    ellipse(ctx, hx, hy, 9, 9, 'rgba(249, 115, 22, 0.4)', null);
    ellipse(ctx, hx, hy, 6, 6, '#fef08a', '#ea580c', 1.0);
    ellipse(ctx, hx, hy, 3.5, 3.5, '#ffffff', null);

    // Tia chớp 4 cánh ở tâm đầu sao băng
    line(ctx, [[hx - 8, hy], [hx + 8, hy]], '#ffffff', 1.5);
    line(ctx, [[hx, hy - 8], [hx, hy + 8]], '#ffffff', 1.5);

    ctx.restore();
  }

  // =============================================================
  // 10. EXOPLANET LAVA (Hành tinh dung nham rực lửa kiểu 55 Cancri e)
  // center: [0, -50], Bounding box: x in [-33, 33], y in [-79, -21]
  // =============================================================
  function drawExoplanetLava(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    const r = 25;

    // 1. Quầng hào quang nhiệt đối lưu (Thermal atmospheric glow)
    const heatGlow = ctx.createRadialGradient(cx, cy, r - 2, cx, cy, r + 6);
    heatGlow.addColorStop(0, 'rgba(239, 68, 68, 0.45)');
    heatGlow.addColorStop(0.6, 'rgba(249, 115, 22, 0.2)');
    heatGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ellipse(ctx, cx, cy, r + 6, r + 6, heatGlow, null);

    // 2. Bề mặt hành tinh đá bazan tối màu
    const crust = ctx.createRadialGradient(cx - 7, cy - 7, 4, cx, cy, r);
    crust.addColorStop(0, '#292524');
    crust.addColorStop(0.65, '#1c1917');
    crust.addColorStop(1, '#0c0a09');
    ellipse(ctx, cx, cy, r, r, crust, INK, 1.8);

    // 3. Mạng lưới rãnh nứt dung nham nóng đỏ rực rỡ (Molten lava fissures)
    ctx.save();
    const lavaGrad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    lavaGrad.addColorStop(0, '#fde047');
    lavaGrad.addColorStop(0.4, '#ea580c');
    lavaGrad.addColorStop(0.8, '#dc2626');
    lavaGrad.addColorStop(1, '#991b1b');

    // Rãnh magma chính uốn quanh bề mặt
    path(ctx, `M ${cx - 20} ${cy - 8} Q ${cx - 8} ${cy - 4} ${cx} ${cy - 12} Q ${cx + 10} ${cy - 16} ${cx + 21} ${cy - 6}`, null, lavaGrad, 2.5);
    path(ctx, `M ${cx - 14} ${cy + 10} Q ${cx - 2} ${cy + 14} ${cx + 8} ${cy + 6} Q ${cx + 16} ${cy + 12} ${cx + 20} ${cy + 16}`, null, lavaGrad, 2.0);
    path(ctx, `M ${cx - 4} ${cy - 12} Q ${cx - 2} ${cy - 2} ${cx + 8} ${cy + 6}`, null, lavaGrad, 1.8);

    // Lõi rãnh nứt sáng rực màu vàng-trắng
    path(ctx, `M ${cx - 18} ${cy - 8} Q ${cx - 8} ${cy - 4} ${cx} ${cy - 12} Q ${cx + 10} ${cy - 16} ${cx + 19} ${cy - 6}`, null, '#fef9c3', 1.0);
    path(ctx, `M ${cx - 12} ${cy + 10} Q ${cx - 2} ${cy + 14} ${cx + 8} ${cy + 6}`, null, '#fef9c3', 0.8);

    // Hồ dung nham tròn sôi sục
    ellipse(ctx, cx - 10, cy + 4, 4, 3, '#f97316', '#fef08a', 0.8);
    ellipse(ctx, cx + 12, cy - 4, 5, 3.5, '#ea580c', '#fef08a', 0.8);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // BACKGROUND 1: deep_space_view (Vũ trụ sâu thẳm, tinh vân, dải ngân hà)
  // =============================================================
  function drawDeepSpaceView(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // 1. Nền không gian thâm sâu bất tận
    const cosmos = ctx.createLinearGradient(0, 0, 0, 1024);
    if (isNight) {
      cosmos.addColorStop(0, '#020617');
      cosmos.addColorStop(0.5, '#030712');
      cosmos.addColorStop(1, '#050b1e');
    } else {
      cosmos.addColorStop(0, '#030712');
      cosmos.addColorStop(0.5, '#080d28');
      cosmos.addColorStop(1, '#11183c');
    }
    ctx.fillStyle = cosmos;
    ctx.fillRect(X0, 0, X1 - X0, 1024);

    // 2. Các dải tinh vân vũ trụ khổng lồ vắt ngang khung hình
    const neb1 = ctx.createRadialGradient(220, 360, 20, 220, 360, 260);
    neb1.addColorStop(0, 'rgba(168, 85, 247, 0.22)');
    neb1.addColorStop(0.5, 'rgba(59, 130, 246, 0.14)');
    neb1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = neb1;
    ctx.fillRect(X0, 100, X1 - X0, 520);

    const neb2 = ctx.createRadialGradient(420, 680, 20, 420, 680, 220);
    neb2.addColorStop(0, 'rgba(236, 72, 153, 0.18)');
    neb2.addColorStop(0.6, 'rgba(99, 102, 241, 0.10)');
    neb2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = neb2;
    ctx.fillRect(X0, 460, X1 - X0, 440);

    // 3. Mạng lưới 80 ngôi sao trung tâm (576px chính)
    for (let i = 0; i < 80; i++) {
      const sx = ((i * 157 + 31) % 556) + 10;
      const sy = ((i * 251 + 17) % 980) + 15;
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.6 + i * 2.3));
      const starR = (i % 7 === 0) ? 2.2 : (i % 3 === 0 ? 1.4 : 0.9);

      ctx.save();
      ctx.globalAlpha = twinkle;
      ellipse(ctx, sx, sy, starR, starR, '#ffffff', null);
      if (i % 12 === 0) {
        line(ctx, [[sx - 4.5, sy], [sx + 4.5, sy]], '#93c5fd', 0.8);
        line(ctx, [[sx, sy - 4.5], [sx, sy + 4.5]], '#93c5fd', 0.8);
      }
      ctx.restore();
    }

    // 4. Khổ ngang: rải sao, cụm thiên hà xa và tinh vân mở rộng
    scatterExt(ext, 30, 'deep_star', (x, r, i) => {
      const sy = 15 + r * 970;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.6 + i * 2.3));
      const sr = (i % 6 === 0) ? 2.2 : (i % 3 === 0 ? 1.4 : 0.9);
      ellipse(ctx, x, sy, sr, sr, '#ffffff', null);
      if (i % 10 === 0) {
        line(ctx, [[x - 4, sy], [x + 4, sy]], '#93c5fd', 0.8);
        line(ctx, [[x, sy - 4], [x, sy + 4]], '#93c5fd', 0.8);
      }
      ctx.restore();
    });

    scatterExt(ext, 180, 'deep_nebula', (x, r, i) => {
      const ny = 200 + r * 500;
      const g = ctx.createRadialGradient(x, ny, 10, x, ny, 120);
      g.addColorStop(0, i % 2 === 0 ? 'rgba(147, 51, 234, 0.22)' : 'rgba(6, 182, 212, 0.20)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ellipse(ctx, x, ny, 130, 80, g, null);
    });

    // 5. Đường chân trời quy ước không gian ở ground_y (dải khí phát quang nhẹ)
    const horizonGlow = ctx.createLinearGradient(0, groundY - 15, 0, groundY + 15);
    horizonGlow.addColorStop(0, 'rgba(56, 189, 248, 0)');
    horizonGlow.addColorStop(0.5, 'rgba(56, 189, 248, 0.18)');
    horizonGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(X0, groundY - 15, X1 - X0, 30);

    ctx.restore();
  }

  // =============================================================
  // BACKGROUND 2: observatory_night (Đài quan sát đỉnh núi ban đêm)
  // =============================================================
  function drawObservatoryNight(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;
    const weather = (settings && settings.weather) || 'clear';

    // 1. Bầu trời đêm trên đỉnh núi (hoặc hoàng hôn ráng chiều nếu day)
    const sky = ctx.createLinearGradient(0, 0, 0, groundY - 180);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.65, '#0f172a');
      sky.addColorStop(1, '#1e1b4b');
    } else {
      sky.addColorStop(0, '#0f172a');
      sky.addColorStop(0.5, '#1e293b');
      sky.addColorStop(1, '#475569');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, groundY - 180);

    // Dải Ngân Hà rực rỡ vắt chéo bầu trời
    const mw = ctx.createLinearGradient(100, 0, 480, groundY - 200);
    mw.addColorStop(0, 'rgba(147, 197, 253, 0.15)');
    mw.addColorStop(0.4, 'rgba(192, 132, 252, 0.22)');
    mw.addColorStop(0.7, 'rgba(244, 114, 182, 0.12)');
    mw.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = mw;
    ctx.fillRect(X0, 0, X1 - X0, groundY - 200);

    // Mạng lưới sao đêm
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 163 + 23) % 556) + 10;
      const sy = ((i * 197 + 11) % (groundY - 240)) + 15;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i * 2.1));
      ctx.save();
      ctx.globalAlpha = tw;
      ellipse(ctx, sx, sy, i % 5 === 0 ? 2.0 : 1.1, i % 5 === 0 ? 2.0 : 1.1, '#ffffff', null);
      ctx.restore();
    }
    // Sao khổ ngang
    scatterExt(ext, 36, 'obs_star', (x, r, i) => {
      const sy = 15 + r * (groundY - 250);
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i * 2.1));
      ellipse(ctx, x, sy, i % 5 === 0 ? 2.0 : 1.1, i % 5 === 0 ? 2.0 : 1.1, '#ffffff', null);
      ctx.restore();
    });

    // 2. Dãy núi xa sừng sững ở hậu cảnh (Distant mountain peaks)
    const peakColor = isNight ? '#090d16' : '#1e293b';
    drawPoly(ctx, [
      [0, groundY - 140],
      [110, groundY - 260],
      [240, groundY - 180],
      [380, groundY - 300],
      [520, groundY - 200],
      [576, groundY - 230],
      [576, groundY - 60],
      [0, groundY - 60]
    ], peakColor, null);

    // Núi xa khổ ngang
    for (const [ea, eb] of ext) {
      drawPoly(ctx, [
        [ea, groundY - 160],
        [ea + (eb - ea) * 0.35, groundY - 270],
        [ea + (eb - ea) * 0.7, groundY - 190],
        [eb, groundY - 240],
        [eb, groundY - 60],
        [ea, groundY - 60]
      ], peakColor, null);
    }

    // 3. Cao nguyên đá đỉnh núi (Foreground ridge at ground_y: 810)
    const ridgeGrad = ctx.createLinearGradient(0, groundY - 120, 0, 1024);
    ridgeGrad.addColorStop(0, isNight ? '#1e293b' : '#334155');
    ridgeGrad.addColorStop(0.4, isNight ? '#0f172a' : '#1e293b');
    ridgeGrad.addColorStop(1, isNight ? '#020617' : '#0f172a');
    ctx.fillStyle = ridgeGrad;
    ctx.fillRect(X0, groundY - 120, X1 - X0, 1024 - (groundY - 120));

    // Đường viền đá gồ ghề
    line(ctx, [[X0, groundY - 120], [X1, groundY - 120]], isNight ? '#334155' : '#475569', 2.0);

    // 4. Toà nhà đài thiên văn vòm tròn chính (Main Observatory Dome)
    const domeX = 180, domeBaseY = groundY - 120;
    // Thân trụ tròn bên dưới
    ctx.fillStyle = isNight ? '#475569' : '#cbd5e1';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.rect(domeX - 35, domeBaseY - 70, 70, 70);
    ctx.fill();
    ctx.stroke();

    // Cửa ra vào trạm
    drawPoly(ctx, [
      [domeX - 10, domeBaseY],
      [domeX + 10, domeBaseY],
      [domeX + 10, domeBaseY - 28],
      [domeX - 10, domeBaseY - 28]
    ], '#0f172a', INK, 1.2);

    // Mái vòm bán cầu phía trên (Hemispherical dome)
    ctx.beginPath();
    ctx.arc(domeX, domeBaseY - 70, 52, Math.PI, 0);
    ctx.fillStyle = isNight ? '#64748b' : '#e2e8f0';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Khe mở quan sát bầu trời (Observation shutter slit)
    drawPoly(ctx, [
      [domeX - 7, domeBaseY - 122],
      [domeX + 7, domeBaseY - 122],
      [domeX + 9, domeBaseY - 70],
      [domeX - 9, domeBaseY - 70]
    ], '#090d16', INK, 1.4);
    // Kính thiên văn nhô ra khỏi khe cửa
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.rect(domeX - 3, domeBaseY - 104, 8, 16);
    ctx.fill();
    ctx.stroke();

    // Đài vòm phụ nhỏ hơn bên phải (Secondary smaller dome)
    const sDomeX = 420;
    ctx.fillStyle = isNight ? '#334155' : '#94a3b8';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.rect(sDomeX - 23, domeBaseY - 40, 46, 40);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(sDomeX, domeBaseY - 40, 32, Math.PI, 0);
    ctx.fillStyle = isNight ? '#475569' : '#cbd5e1';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Cột ăng-ten liên lạc với đèn báo đỏ nhấp nháy
    const antX = 310;
    line(ctx, [[antX, domeBaseY], [antX, domeBaseY - 110]], '#94a3b8', 2.0);
    line(ctx, [[antX - 12, domeBaseY - 90], [antX + 12, domeBaseY - 90]], '#94a3b8', 1.4);
    line(ctx, [[antX - 8, domeBaseY - 70], [antX + 8, domeBaseY - 70]], '#94a3b8', 1.4);
    // Đèn đỏ nhấp nháy đỉnh tháp
    const beacon = (Math.sin(t * 3.0) > 0);
    ellipse(ctx, antX, domeBaseY - 112, 3, 3, beacon ? '#ef4444' : '#7f1d1d', null);

    // 5. Khổ ngang: thêm trạm đo gió, mái vòm phụ xa, mỏm đá
    scatterExt(ext, 200, 'obs_equip', (x, r, i) => {
      const by = groundY - 120;
      if (i % 2 === 0) {
        // Mái vòm nhỏ xa
        ctx.fillStyle = isNight ? '#334155' : '#94a3b8';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.rect(x - 18, by - 30, 36, 30);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, by - 30, 24, Math.PI, 0);
        ctx.fillStyle = isNight ? '#475569' : '#cbd5e1';
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.stroke();
      } else {
        // Tháp trạm thời tiết đỉnh núi
        line(ctx, [[x, by], [x, by - 80]], '#64748b', 2.0);
        ellipse(ctx, x, by - 82, 4, 4, '#f59e0b', INK, 1.0);
        line(ctx, [[x - 10, by - 60], [x + 10, by - 60]], '#64748b', 1.2);
      }
    });

    // Mặt đất quy ước ground_y
    line(ctx, [[X0, groundY], [X1, groundY]], 'rgba(148, 163, 184, 0.25)', 1.0);

    ctx.restore();
  }

  // =============================================================
  // REGISTRY
  // =============================================================
  const SPACE_DEEP_RIGS = {
    black_hole: { draw(ctx, s, t) { drawBlackHole(ctx, s, t); } },
    neutron_star: { draw(ctx, s, t) { drawNeutronStar(ctx, s, t); } },
    spiral_galaxy: { draw(ctx, s, t) { drawSpiralGalaxy(ctx, s, t); } },
    nebula: { draw(ctx, s, t) { drawNebula(ctx, s, t); } },
    space_telescope: { draw(ctx, s, t) { drawSpaceTelescope(ctx, s, t); } },
    space_probe: { draw(ctx, s, t) { drawSpaceProbe(ctx, s, t); } },
    pluto: { draw(ctx, s, t) { drawPluto(ctx, s, t); } },
    asteroid: { draw(ctx, s, t) { drawAsteroid(ctx, s, t); } },
    shooting_star: { draw(ctx, s, t) { drawShootingStar(ctx, s, t); } },
    exoplanet_lava: { draw(ctx, s, t) { drawExoplanetLava(ctx, s, t); } }
  };

  const SPACE_DEEP_BACKGROUNDS = {
    deep_space_view: {
      label: 'Deep space cosmic view',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawDeepSpaceView(ctx, settings, t); }
    },
    observatory_night: {
      label: 'Mountaintop astronomical observatory',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawObservatoryNight(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: SPACE_DEEP_RIGS,
    backgrounds: SPACE_DEEP_BACKGROUNDS
  });

})();
