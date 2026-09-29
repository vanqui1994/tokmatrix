// remake_vector_packs/nature.js — Giai đoạn T: Thiên nhiên và khoa học (nature)
// 10 rigs: cloud, raindrop_chibi, rainbow, volcano, earth_cutaway, fossil, lever, pulley, ramp, wheel_axle
// 3 backgrounds: water_cycle_valley, volcano_island, dig_site (ground_y: 810, 7 weathers, day/night, ZERO text)
// Deterministic effects & action hooks: evaporate, condense

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
    mixColor,
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
  // 1. CLOUD (Mây có mặt, rain 0–1 mưa tất định, storm 0–1 sấm sét, mặt lo khi mưa)
  // center: [0, -52], y luôn trong [-76, -4]
  // =============================================================
  function drawCloud(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -52;
    const rain = clamp(s.rain !== undefined ? s.rain : 0, 0, 1);
    const storm = clamp(s.storm !== undefined ? s.storm : 0, 0, 1);
    const badWeather = Math.max(rain, storm);

    // Mặt lo khi có mưa hoặc bão
    if (badWeather > 0.05 && (!s.expression || s.expression === 'neutral')) {
      s.expression = 'worried';
    }

    // Màu đám mây chuyển từ trắng xốp sang xám chì bão giông
    const cloudFill = mixColor('#f8fafc', '#334155', badWeather);
    const cloudShadow = mixColor('#e2e8f0', '#1e293b', badWeather);

    // Đám mây gồm 5 múi tròn bồng bềnh ghép lại
    ellipse(ctx, cx, cy, 26, 20, cloudFill, null);
    ellipse(ctx, cx - 18, cy + 3, 20, 15, cloudFill, null);
    ellipse(ctx, cx + 18, cy + 3, 20, 15, cloudFill, null);
    ellipse(ctx, cx - 8, cy - 8, 18, 14, cloudFill, null);
    ellipse(ctx, cx + 10, cy - 7, 16, 13, cloudFill, null);

    // Đáy mây hơi phẳng có bóng nhẹ
    ellipse(ctx, cx, cy + 10, 32, 8, cloudShadow, null);

    // Đường viền mực uốn lượn mềm mại quanh hình mây
    path(ctx, `M ${cx - 36} ${cy + 8} Q ${cx - 38} ${cy - 8} ${cx - 24} ${cy - 14} Q ${cx - 14} ${cy - 24} ${cx + 2} ${cy - 20} Q ${cx + 20} ${cy - 22} ${cx + 28} ${cy - 8} Q ${cx + 40} ${cy + 4} ${cx + 34} ${cy + 12} Q ${cx + 18} ${cy + 18} ${cx} ${cy + 16} Q ${cx - 20} ${cy + 18} ${cx - 36} ${cy + 8}`, null, INK, 1.8);

    // Mưa rơi tất định từ đáy mây xuống y=-4
    if (rain > 0.02) {
      ctx.save();
      const dropCount = Math.floor(6 + rain * 10);
      for (let i = 0; i < dropCount; i++) {
        const u = ((t * 2.8 + i * 0.16) % 1.0);
        const rx = mix(-28, 28, (i + 0.5) / dropCount) + Math.sin(t * 4 + i) * 2;
        const ry = mix(cy + 14, -4, u);
        const dropLen = 4 + rain * 3;
        line(ctx, [[rx, ry], [rx - 1, ry + dropLen]], '#38bdf8', 1.4);
      }
      ctx.restore();
    }

    // Tia sét đánh khi storm > 0.2
    if (storm > 0.2) {
      const flash = Math.sin(t * 14 + hash(s.id || 'cloud') * 0.1);
      if (flash > 0.35) {
        ctx.save();
        const boltPts = [
          [cx + 2, cy + 14],
          [cx - 4, cy + 26],
          [cx + 3, cy + 28],
          [cx - 6, -6]
        ];
        line(ctx, boltPts, '#fef08a', 2.8);
        line(ctx, boltPts, '#ffffff', 1.4);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  // =============================================================
  // 2. RAINDROP_CHIBI (Giọt nước chibi có mặt kể vòng tuần hoàn)
  // center: [0, -35], apex y=-70, bottom y=-4
  // =============================================================
  function drawRaindropChibi(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -26;

    // Thân giọt nước hình giọt nước uốn cong mượt mà
    ctx.beginPath();
    ctx.moveTo(0, -70);
    ctx.bezierCurveTo(-8, -52, -22, -40, -22, cy);
    ctx.arc(0, cy, 22, Math.PI, 0, true);
    ctx.bezierCurveTo(22, -40, 8, -52, 0, -70);
    ctx.closePath();

    const waterGrad = ctx.createLinearGradient(0, -70, 0, -4);
    waterGrad.addColorStop(0, '#7dd3fc');
    waterGrad.addColorStop(0.4, '#38bdf8');
    waterGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = waterGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Vệt bóng sáng cong (Specular highlight)
    ctx.save();
    ctx.beginPath();
    ctx.arc(-8, cy - 2, 14, Math.PI * 0.8, Math.PI * 1.3, false);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.73)';
    ctx.lineWidth = 3.0;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Hai bàn tay nhỏ xíu hình giọt nước
    ellipse(ctx, -18, -28, 5, 4, '#38bdf8', INK, 1.2);
    ellipse(ctx, 18, -28, 5, 4, '#38bdf8', INK, 1.2);

    ctx.restore();
  }

  // =============================================================
  // 3. RAINBOW (Cầu vồng rực rỡ 7 màu, growth vẽ dần từ 0 đến 1)
  // center: [0, -44], apex y=-88, chân tại x=±88
  // =============================================================
  function drawRainbow(ctx, s, t) {
    ctx.save();
    const growth = clamp(s.growth !== undefined ? s.growth : 1.0, 0, 1);
    if (growth <= 0.001) {
      ctx.restore();
      return;
    }

    const colors = [
      '#ef4444', // Đỏ
      '#f97316', // Cam
      '#eab308', // Vàng
      '#22c55e', // Lục
      '#06b6d4', // Lam
      '#3b82f6', // Chàm
      '#a855f7'  // Tím
    ];

    const baseR = 64;
    const bandW = 3.4;
    const totalAngle = Math.PI * growth;

    ctx.save();
    ctx.globalAlpha = 0.88;

    for (let i = 0; i < colors.length; i++) {
      const r = baseR + (colors.length - 1 - i) * bandW;
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, Math.PI + totalAngle, false); // theo chiều kim đồng hồ từ trái qua đỉnh (y âm) sang phải
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = bandW + 0.3;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  }

  // =============================================================
  // 4. VOLCANO (Núi lửa: cutaway thấy macma, erupt phun trào tất định)
  // peak/crater: [0, -62], y luôn trong [-96, 0] (TUYỆT ĐỐI y >= -96)
  // =============================================================
  function drawVolcano(ctx, s, t) {
    ctx.save();
    const cutaway = clamp(s.cutaway !== undefined ? s.cutaway : 0, 0, 1);
    const erupt = clamp(s.erupt !== undefined ? s.erupt : 0, 0, 1);
    const craterY = -62;

    // 1. Thân núi lửa hình nón cụt hùng vĩ (đáy x=-45..45, miệng x=-13..13 tại y=-62)
    drawPoly(ctx, [[-45, 0], [45, 0], [13, craterY], [-13, craterY]], '#475569', INK, 1.8);

    for (let i = -30; i <= 30; i += 12) {
      line(ctx, [[i, 0], [i * 0.3, craterY]], '#334155', 1.4);
    }

    // 2. Mặt cắt địa chất trong lòng núi (Cutaway macma chamber)
    if (cutaway > 0.05) {
      ctx.save();
      ctx.globalAlpha = cutaway;

      drawPoly(ctx, [[-28, 0], [28, 0], [8, craterY], [-8, craterY]], '#1e293b', INK, 1.4);

      // Bầu macma ở đáy
      ellipse(ctx, 0, -20, 20, 14, '#b91c1c', INK, 1.2);
      ellipse(ctx, 0, -20, 15, 10, '#ea580c', null);
      ellipse(ctx, 0, -20, 8, 5, '#fef08a', null);

      // Ống dẫn macma trung tâm
      drawPoly(ctx, [[-5, -20], [5, -20], [5, craterY], [-5, craterY]], '#ea580c', INK, 1.0);
      line(ctx, [[0, -20], [0, craterY]], '#fef08a', 2.0);

      ctx.restore();
    }

    // Miệng núi lửa hình elip nhìn nghiêng (Caldera)
    ellipse(ctx, 0, craterY, 13, 5, '#1e293b', INK, 1.6);
    ellipse(ctx, 0, craterY, 10, 3.5, erupt > 0 ? '#ea580c' : '#451a03', null);

    // 3. Phun trào dung nham và khói bụi khi erupt > 0
    if (erupt > 0.02) {
      ctx.save();
      // Khói bụi núi lửa cuồn cuộn vươn lên tới y=-84, bán kính max 10.2 -> đỉnh khói y >= -94.2 > -96
      const smokeCount = Math.floor(4 + erupt * 5);
      for (let i = 0; i < smokeCount; i++) {
        const u = ((t * 1.5 + i * 0.22) % 1.0);
        const sy = mix(craterY, -84, u);
        const sx = Math.sin(t * 3.0 + i * 2.0) * (6 + u * 12);
        const sRadius = (4 + u * 8) * erupt;
        const smokeShade = i % 2 === 0 ? 'rgba(71, 85, 105, 0.8)' : 'rgba(100, 116, 139, 0.87)';
        ellipse(ctx, sx, sy, sRadius, sRadius * 0.85, smokeShade, null);
      }

      // Các tia dung nham đỏ rực bắn lên từ miệng núi (chiều cao max 12 -> y >= -74)
      for (let k = -2; k <= 2; k++) {
        const lavaH = (8 + Math.sin(t * 8 + k) * 4) * erupt;
        line(ctx, [[k * 3, craterY], [k * 5, craterY - lavaH]], '#fef08a', 2.2);
      }

      // Vệt dung nham đỏ vàng chảy tràn xuống hai sườn núi
      path(ctx, `M -6 ${craterY + 2} Q -15 -40 -26 0`, null, '#ea580c', 2.6 * erupt);
      path(ctx, `M 4 ${craterY + 2} Q 12 -35 22 0`, null, '#f97316', 2.2 * erupt);

      ctx.restore();
    }

    ctx.restore();
  }

  // =============================================================
  // 5. EARTH_CUTAWAY (Mặt cắt quả đất: vỏ, manti, lõi ngoài, lõi trong - KHÔNG CHỮ)
  // center: [0, -50], r=42 (y trong [-92, -8])
  // =============================================================
  function drawEarthCutaway(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -50;
    const rCrust = 42;
    const rMantle = 33;
    const rOuterCore = 22;
    const rInnerCore = 11;

    // 1. Quả cầu Trái Đất bên ngoài
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rCrust, 0, TAU);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.clip();

    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.ellipse(cx - 16, cy - 14, 18, 12, 0.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - 18, cy + 16, 14, 10, -0.2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 8, cy - 24, 15, 8, -0.3, 0, TAU);
    ctx.fill();

    path(ctx, `M ${cx - 36} ${cy - 8} Q ${cx - 10} ${cy - 16} ${cx + 10} ${cy - 8}`, null, 'rgba(255, 255, 255, 0.67)', 2.6);
    ctx.restore();

    ellipse(ctx, cx, cy, rCrust, rCrust, null, INK, 1.6);

    // 2. Mặt cắt góc phần tư (Quadrant cutaway từ góc 0 đến PI/2)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rCrust, cy);
    ctx.arc(cx, cy, rCrust, 0, Math.PI * 0.5, false);
    ctx.closePath();
    ctx.clip();

    // Lớp 1: Lớp Vỏ Trái Đất (Crust)
    ctx.fillStyle = '#78350f';
    ctx.fill();

    // Lớp 2: Lớp Manti (Mantle)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rMantle, cy);
    ctx.arc(cx, cy, rMantle, 0, Math.PI * 0.5, false);
    ctx.closePath();
    ctx.fillStyle = '#ea580c';
    ctx.fill();

    // Lớp 3: Lõi Ngoài (Outer core)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rOuterCore, cy);
    ctx.arc(cx, cy, rOuterCore, 0, Math.PI * 0.5, false);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.fill();

    // Lớp 4: Lõi Trong (Inner core)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rInnerCore, cy);
    ctx.arc(cx, cy, rInnerCore, 0, Math.PI * 0.5, false);
    ctx.closePath();
    ctx.fillStyle = '#fef08a';
    ctx.fill();

    line(ctx, [[cx, cy], [cx + rCrust, cy]], INK, 1.4);
    line(ctx, [[cx, cy], [cx, cy + rCrust]], INK, 1.4);
    ctx.beginPath();
    ctx.arc(cx, cy, rMantle, 0, Math.PI * 0.5, false);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.0; ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, rOuterCore, 0, Math.PI * 0.5, false);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.0; ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, rInnerCore, 0, Math.PI * 0.5, false);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.0; ctx.stroke();

    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 6. FOSSIL (Hoá thạch khủng long trong đá, exposed 0–1)
  // center: [0, -22], slab width 74, height 44 (y trong [-44, 0])
  // =============================================================
  function drawFossil(ctx, s, t) {
    ctx.save();
    const exposed = clamp(s.exposed !== undefined ? s.exposed : 1.0, 0, 1);

    // 1. Phiến đá trầm tích sa thạch (Sandstone slab)
    const slabPts = [
      [-37, 0],
      [37, 0],
      [35, -42],
      [-35, -44]
    ];
    drawPoly(ctx, slabPts, '#a8a29e', INK, 1.8);

    for (let y = -10; y >= -36; y -= 10) {
      line(ctx, [[-34, y], [34, y]], '#78716c', 1.2);
    }

    line(ctx, [[-26, -20], [-18, -26], [-12, -22]], '#57534e', 1.0);
    line(ctx, [[14, -12], [22, -18]], '#57534e', 1.0);

    // 2. Bộ xương hoá thạch khủng long
    ctx.save();
    ctx.globalAlpha = 0.2 + exposed * 0.8;

    const fx = 0, fy = -22;
    path(ctx, `M ${fx - 18} ${fy + 6} Q ${fx - 24} ${fy - 6} ${fx - 14} ${fy - 16} Q ${fx + 10} ${fy - 18} ${fx + 22} ${fy - 8} Q ${fx + 24} ${fy + 2} ${fx + 12} ${fy + 4} L ${fx - 4} ${fy + 2} Z`, '#fef3c7', INK, 1.4);

    ellipse(ctx, fx - 2, fy - 8, 5, 4, '#44403c', INK, 1.0);
    ellipse(ctx, fx + 14, fy - 5, 3, 2, '#44403c', INK, 0.8);

    path(ctx, `M ${fx - 14} ${fy + 10} Q ${fx} ${fy + 8} ${fx + 18} ${fy + 6} L ${fx + 16} ${fy + 11} L ${fx - 12} ${fy + 14} Z`, '#fef3c7', INK, 1.2);

    for (let rx = fx + 2; rx <= fx + 16; rx += 4) {
      drawPoly(ctx, [[rx, fy + 4], [rx + 2, fy + 7], [rx + 3, fy + 4]], '#ffffff', INK, 0.6);
    }

    ctx.restore();

    // 3. Lớp đất cát phủ lên hoá thạch nếu exposed < 1
    if (exposed < 0.95) {
      ctx.save();
      ctx.globalAlpha = 1.0 - exposed;
      drawPoly(ctx, slabPts, '#a8a29e', null);
      for (let i = 0; i < 18; i++) {
        const px = ((i * 37 + 11) % 60) - 30;
        const py = -((i * 19 + 7) % 36) - 4;
        ellipse(ctx, px, py, 1.8, 1.2, '#78716c', null);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  // =============================================================
  // 7. LEVER (Đòn bẩy: tấm ván + điểm tựa, tilt nghiêng hai đầu ngược chiều)
  // center: [0, -26], fulcrum at [0, -26], plank len=82 (y trong [-53, 0])
  // =============================================================
  function drawLever(ctx, s, t) {
    ctx.save();
    const tiltDeg = clamp(s.tilt !== undefined ? s.tilt : 0, -35, 35);
    const tiltRad = (tiltDeg * Math.PI) / 180;
    const fulcrumY = -26;

    // 1. Điểm tựa tam giác vững chắc bằng thép/gỗ (Fulcrum)
    drawPoly(ctx, [[-15, 0], [15, 0], [0, fulcrumY]], '#475569', INK, 1.8);
    ellipse(ctx, 0, fulcrumY, 4, 4, '#1e293b', INK, 1.2);
    ellipse(ctx, 0, fulcrumY, 1.8, 1.8, '#cbd5e1', null);

    // 2. Thanh đòn bẩy bằng gỗ cứng (Plank/Beam)
    ctx.save();
    ctx.translate(0, fulcrumY);
    ctx.rotate(tiltRad);

    const halfLen = 41;
    const beamH = 6;
    drawPoly(ctx, [
      [-halfLen, -beamH * 0.5],
      [halfLen, -beamH * 0.5],
      [halfLen, beamH * 0.5],
      [-halfLen, beamH * 0.5]
    ], cylinder(ctx, -halfLen, halfLen, '#b45309'), INK, 1.6);

    for (let x = -30; x <= 30; x += 10) {
      if (x !== 0) line(ctx, [[x, -beamH * 0.5], [x, beamH * 0.5]], '#78350f', 1.0);
    }

    drawPoly(ctx, [[-halfLen, -beamH * 0.5 - 2], [-halfLen + 5, -beamH * 0.5 - 2], [-halfLen + 5, beamH * 0.5 + 2], [-halfLen, beamH * 0.5 + 2]], '#1e293b', INK, 1.0);
    drawPoly(ctx, [[halfLen - 5, -beamH * 0.5 - 2], [halfLen, -beamH * 0.5 - 2], [halfLen, beamH * 0.5 + 2], [halfLen - 5, beamH * 0.5 + 2]], '#1e293b', INK, 1.0);

    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 8. PULLEY (Ròng rọc: giá chữ A, bánh xe, dây kéo, lift 0–1)
  // wheel: [0, -78], top y=-88, lift tăng thì tải nâng lên!
  // =============================================================
  function drawPulley(ctx, s, t) {
    ctx.save();
    const lift = clamp(s.lift !== undefined ? s.lift : 0, 0, 1);
    const wheelY = -78;
    const wheelR = 10;

    // 1. Giá đỡ khung gỗ chữ A chắc chắn
    line(ctx, [[-18, 0], [0, wheelY]], '#78350f', 3.6);
    line(ctx, [[18, 0], [0, wheelY]], '#78350f', 3.6);
    line(ctx, [[-18, 0], [0, wheelY]], INK, 1.2);
    line(ctx, [[18, 0], [0, wheelY]], INK, 1.2);
    line(ctx, [[-10, -35], [10, -35]], '#92400e', 2.8);

    // 2. Bánh xe ròng rọc có rãnh (Sheave wheel)
    ellipse(ctx, 0, wheelY, wheelR, wheelR, '#64748b', INK, 1.6);
    ellipse(ctx, 0, wheelY, wheelR - 3, wheelR - 3, '#94a3b8', null);
    ellipse(ctx, 0, wheelY, 3, 3, '#1e293b', INK, 1.0);

    // 3. Dây thừng vắt qua bánh xe ròng rọc
    // Dây bên trái: dây kéo (khi lift tăng, tay kéo giật xuống sâu hơn)
    const pullY = mix(-40, -18, lift);
    line(ctx, [[-wheelR + 1, wheelY], [-wheelR + 1, pullY]], '#d97706', 2.0);
    ellipse(ctx, -wheelR + 1, pullY, 3, 3, '#b45309', INK, 1.0);

    // Dây bên phải: mang tải trọng (khi lift tăng, tải nâng lên từ y=-20 lên y=-62)
    const loadY = mix(-20, -62, lift);
    line(ctx, [[wheelR - 1, wheelY], [wheelR - 1, loadY - 6]], '#d97706', 2.0);
    path(ctx, `M ${wheelR - 1} ${loadY - 6} L ${wheelR - 1} ${loadY} Q ${wheelR + 3} ${loadY + 4} ${wheelR - 1} ${loadY + 6}`, null, '#1e293b', 2.0);

    ctx.restore();
  }

  // =============================================================
  // 9. RAMP (Mặt phẳng nghiêng: dốc tam giác gỗ vững chãi)
  // bottom: [-40, 0], top: [38, -44], width 78 (y trong [-44, 0])
  // =============================================================
  function drawRamp(ctx, s, t) {
    ctx.save();
    const rampPts = [
      [-40, 0],
      [38, 0],
      [38, -44]
    ];
    drawPoly(ctx, rampPts, cylinder(ctx, -40, 38, '#b45309'), INK, 1.8);

    line(ctx, [[-15, 0], [-15, -14]], '#78350f', 2.0);
    line(ctx, [[12, 0], [12, -29]], '#78350f', 2.0);
    line(ctx, [[-15, -14], [12, 0]], '#78350f', 1.6);
    line(ctx, [[12, -29], [38, 0]], '#78350f', 1.6);

    for (let u = 0.15; u <= 0.85; u += 0.15) {
      const rx = mix(-40, 38, u);
      const ry = mix(0, -44, u);
      ellipse(ctx, rx, ry, 2.5, 1.4, '#78350f', null);
    }

    ctx.restore();
  }

  // =============================================================
  // 10. WHEEL_AXLE (Bánh xe và trục: máy cơ học đơn giản)
  // axle: [0, -44], wheel r=34 (y trong [-79, -10])
  // =============================================================
  function drawWheelAxle(ctx, s, t) {
    ctx.save();
    const cx = 0, cy = -44;
    const bigR = 34;
    const axleR = 10;

    // 1. Cọc chống đỡ trục từ mặt đất lên
    drawPoly(ctx, [[-8, 0], [8, 0], [6, cy], [-6, cy]], '#475569', INK, 1.6);

    // 2. Bánh xe lớn có nan hoa (Big wheel)
    ellipse(ctx, cx, cy, bigR, bigR, '#fde68a', INK, 2.0);
    ellipse(ctx, cx, cy, bigR - 4, bigR - 4, null, '#d97706', 1.4);

    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 4;
      line(ctx, [
        [cx + Math.cos(ang) * (bigR - 4), cy + Math.sin(ang) * (bigR - 4)],
        [cx - Math.cos(ang) * (bigR - 4), cy - Math.sin(ang) * (bigR - 4)]
      ], '#b45309', 1.6);
    }

    // 3. Trục tròn nhỏ ở tâm quấn dây thừng (Axle cylinder)
    ellipse(ctx, cx, cy, axleR, axleR, '#b45309', INK, 1.6);
    ellipse(ctx, cx, cy, axleR - 2.5, axleR - 2.5, '#78350f', null);

    ellipse(ctx, cx, cy, axleR * 0.7, axleR * 0.7, '#f59e0b', INK, 1.0);
    line(ctx, [[cx + axleR * 0.6, cy], [cx + axleR * 0.6, -10]], '#d97706', 2.0);

    ellipse(ctx, cx, cy, 3, 3, '#1e293b', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS
  // 1. WATER_CYCLE_VALLEY: Biển - Đồng bằng - Dãy núi tuyết - Mây trời
  // 2. VOLCANO_ISLAND: Đảo núi lửa nhiệt đới bờ đá đen giữa biển
  // 3. DIG_SITE: Hố khai quật khảo cổ nhiều tầng địa chất, lưới dây đo
  // Tất cả đều ground_y: 810, 7 weathers, day/night, ZERO TEXT!
  // =============================================================

  function drawWaterCycleValley(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời thung lũng
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.7);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(0.7, '#0f172a');
      sky.addColorStop(1, '#1e293b');
    } else {
      sky.addColorStop(0, '#38bdf8');
      sky.addColorStop(0.6, '#bae6fd');
      sky.addColorStop(1, '#fef08a');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY * 0.7);

    // no_sun: story tự đặt rig `sun` có mặt, nên tắt mặt trời vẽ sẵn để không có hai mặt trời.
    if (settings && settings.no_sun) {
      // bỏ qua
    } else if (!isNight) {
      ellipse(ctx, 90, 110, 28, 28, '#fef08a', null);
      ellipse(ctx, 90, 110, 38, 38, 'rgba(254, 240, 138, 0.25)', null);
    } else {
      ellipse(ctx, 480, 110, 22, 22, '#fef9c3', null);
    }

    // Dãy núi tuyết cao sừng sững bên phải (x từ 320 đến 576)
    const mountainCol = isNight ? '#1e293b' : '#64748b';
    const snowCol = isNight ? '#94a3b8' : '#f8fafc';

    drawPoly(ctx, [[320, groundY - 80], [450, groundY - 260], [576, groundY - 120], [576, groundY], [320, groundY]], mountainCol, null);
    drawPoly(ctx, [[450, groundY - 260], [410, groundY - 190], [435, groundY - 200], [450, groundY - 180], [470, groundY - 205], [490, groundY - 185]], snowCol, null);

    // Đồi trung du thoai thoải ở giữa (x từ 140 đến 400)
    const hillCol = isNight ? '#064e3b' : '#15803d';
    path(ctx, `M 140 ${groundY - 60} Q 260 ${groundY - 160} 400 ${groundY - 90} L 400 ${groundY} L 140 ${groundY} Z`, hillCol, null);

    // Mặt đất thung lũng xanh mướt (từ groundY - 50 xuống 1024)
    const ground = ctx.createLinearGradient(0, groundY - 50, 0, 1024);
    ground.addColorStop(0, isNight ? '#064e3b' : '#22c55e');
    ground.addColorStop(0.6, isNight ? '#022c22' : '#16a34a');
    ground.addColorStop(1, isNight ? '#0f172a' : '#15803d');
    ctx.fillStyle = ground;
    ctx.fillRect(0, groundY - 50, 576, 1024 - (groundY - 50));

    // Đại dương bên trái thung lũng (x từ 0 đến 180, nước biển biếc)
    const sea = ctx.createLinearGradient(0, groundY - 40, 0, 1024);
    sea.addColorStop(0, isNight ? '#0c4a6e' : '#0284c7');
    sea.addColorStop(1, isNight ? '#082f49' : '#0369a1');
    ctx.fillStyle = sea;
    ctx.beginPath();
    ctx.moveTo(0, groundY - 40);
    ctx.quadraticCurveTo(100, groundY - 45, 170, groundY + 30);
    ctx.quadraticCurveTo(190, groundY + 120, 150, 1024);
    ctx.lineTo(0, 1024);
    ctx.closePath();
    ctx.fill();

    // Dòng sông uốn lượn từ sườn núi tuyết chảy về biển
    ctx.save();
    path(ctx, `M 430 ${groundY - 180} Q 360 ${groundY - 80} 280 ${groundY - 10} Q 200 ${groundY + 30} 140 ${groundY + 20}`, null, isNight ? '#0284c7' : '#38bdf8', 6.0);
    path(ctx, `M 430 ${groundY - 180} Q 360 ${groundY - 80} 280 ${groundY - 10} Q 200 ${groundY + 30} 140 ${groundY + 20}`, null, 'rgba(255, 255, 255, 0.73)', 2.0);
    ctx.restore();

    line(ctx, [[0, groundY - 30], [140, groundY - 35]], 'rgba(255, 255, 255, 0.67)', 1.8);
    line(ctx, [[0, groundY + 20], [170, groundY + 30]], 'rgba(255, 255, 255, 0.53)', 1.4);

    ctx.restore();
  }

  function drawVolcanoIsland(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời biển đảo nhiệt đới
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(0.7, '#1e1b4b');
      sky.addColorStop(1, '#311042');
    } else {
      sky.addColorStop(0, '#0284c7');
      sky.addColorStop(0.6, '#38bdf8');
      sky.addColorStop(1, '#fef08a');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY * 0.65);

    // Đại dương bao quanh hòn đảo ở đường chân trời
    const sea = ctx.createLinearGradient(0, groundY - 140, 0, groundY - 40);
    sea.addColorStop(0, isNight ? '#0c4a6e' : '#0369a1');
    sea.addColorStop(1, isNight ? '#075985' : '#0284c7');
    ctx.fillStyle = sea;
    ctx.fillRect(0, groundY - 140, 576, 100);

    // Đỉnh núi lửa xa xa ở hậu cảnh
    drawPoly(ctx, [[140, groundY - 40], [288, groundY - 180], [436, groundY - 40]], isNight ? '#1e293b' : '#334155', null);
    path(ctx, `M 288 ${groundY - 180} Q 300 ${groundY - 220} 280 ${groundY - 250}`, null, 'rgba(148, 163, 184, 0.47)', 3.0);

    // Bờ đảo đá núi lửa basalt màu đen xám (từ groundY - 40 xuống 1024)
    const islandGround = ctx.createLinearGradient(0, groundY - 40, 0, 1024);
    islandGround.addColorStop(0, isNight ? '#1e293b' : '#334155');
    islandGround.addColorStop(0.3, isNight ? '#0f172a' : '#1e293b');
    islandGround.addColorStop(1, isNight ? '#020617' : '#0f172a');
    ctx.fillStyle = islandGround;
    ctx.fillRect(0, groundY - 40, 576, 1024 - (groundY - 40));

    // Thảm cây cối nhiệt đới xanh rì bên sườn đảo
    for (let x = 30; x <= 540; x += 60) {
      ellipse(ctx, x, groundY - 35, 24, 12, isNight ? '#064e3b' : '#15803d', null);
    }

    // Các tảng đá nham thạch đen gồ ghề trên bãi biển
    const basaltRocks = [
      [80, groundY + 30, 26, 14],
      [190, groundY + 50, 34, 18],
      [310, groundY + 25, 22, 12],
      [440, groundY + 60, 38, 20],
      [510, groundY + 35, 24, 13]
    ];
    for (const [rx, ry, rw, rh] of basaltRocks) {
      ellipse(ctx, rx, ry, rw, rh, '#0f172a', INK, 1.4);
      ellipse(ctx, rx - rw * 0.2, ry - rh * 0.2, rw * 0.5, rh * 0.4, '#334155', null);
    }

    ctx.restore();
  }

  function drawDigSite(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời công trường khai quật
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.5);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(1, '#1e293b');
    } else {
      sky.addColorStop(0, '#38bdf8');
      sky.addColorStop(0.7, '#bae6fd');
      sky.addColorStop(1, '#fef08a');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY * 0.5);

    // Vách tầng địa chất khai quật ở hậu cảnh
    const wallBase = groundY - 60;
    drawPoly(ctx, [[0, wallBase], [576, wallBase], [576, groundY - 240], [0, groundY - 220]], isNight ? '#451a03' : '#a8a29e', INK, 1.4);

    const strataLayers = [
      { y: groundY - 220, col: isNight ? '#2e1005' : '#c2410c' },
      { y: groundY - 180, col: isNight ? '#3b1209' : '#d97706' },
      { y: groundY - 140, col: isNight ? '#1e293b' : '#78716c' },
      { y: groundY - 100, col: isNight ? '#292524' : '#e7e5e4' }
    ];
    for (const st of strataLayers) {
      ctx.fillStyle = st.col;
      ctx.fillRect(0, st.y, 576, 35);
      line(ctx, [[0, st.y + 35], [576, st.y + 35]], isNight ? '#1c1917' : '#57534e', 1.2);
    }

    // Nền hố khai quật đất cát nện (từ wallBase xuống 1024)
    const digGround = ctx.createLinearGradient(0, wallBase, 0, 1024);
    digGround.addColorStop(0, isNight ? '#3b2514' : '#d4a373');
    digGround.addColorStop(0.5, isNight ? '#29180c' : '#c08552');
    digGround.addColorStop(1, isNight ? '#1c0f05' : '#a97142');
    ctx.fillStyle = digGround;
    ctx.fillRect(0, wallBase, 576, 1024 - wallBase);

    // Lưới dây căng ô vuông khảo sát cổ sinh học (ZERO text!)
    ctx.save();
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.8)';
    ctx.lineWidth = 1.0;

    for (let gy = wallBase + 30; gy < 1024; gy += 45) {
      line(ctx, [[20, gy], [556, gy]], 'rgba(254, 240, 138, 0.6)', 1.0);
    }
    for (let gx = 40; gx <= 540; gx += 70) {
      line(ctx, [[gx, wallBase + 10], [gx, 1000]], 'rgba(254, 240, 138, 0.6)', 1.0);
      line(ctx, [[gx, wallBase + 10], [gx, wallBase + 2]], '#78350f', 2.6);
      ellipse(ctx, gx, wallBase + 2, 2.5, 2, '#ea580c', null);
    }
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // ACTION HOOKS & DETERMINISTIC EFFECTS
  // =============================================================
  const NATURE_ACTIONS = {
    evaporate(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (!actor) return;
      if (active || a.hold) {
        actor.opacity = Math.max(0.0, 1.0 - u * 0.4);
      }
    },
    condense(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (!actor) return;
      if (active || a.hold) {
        actor.opacity = Math.min(1.0, 0.2 + u * 0.8);
      }
    }
  };

  // Hiệu ứng tất định bốc hơi nước và ngưng tụ mây
  function evaporateEffect(ctx, snapshot, cat, kit) {
    if (!snapshot || !snapshot.actions) return;
    for (const a of snapshot.actions) {
      if (!a.active) continue;
      if (a.type === 'evaporate') {
        const actor = snapshot.states[a.actor];
        if (!actor) continue;
        const pt = RemakeVector.worldAnchor(cat, actor, 'root');
        ctx.save();
        for (let i = 0; i < 8; i++) {
          const age = ((snapshot.t * 1.8 + i * 0.15) % 1.0);
          const py = pt.y - age * 70;
          const px = pt.x + Math.sin(snapshot.t * 3.5 + i * 1.8) * 16;
          const r = 2.0 + age * 2.5;
          const alpha = (1.0 - age) * 0.65;
          ctx.globalAlpha = alpha;
          ellipse(ctx, px, py, r, r, '#e0f2fe', '#38bdf8', 0.6);
        }
        ctx.restore();
      } else if (a.type === 'condense') {
        const actor = snapshot.states[a.actor];
        if (!actor) continue;
        const pt = RemakeVector.worldAnchor(cat, actor, 'center');
        ctx.save();
        for (let i = 0; i < 10; i++) {
          const age = ((snapshot.t * 2.0 + i * 0.12) % 1.0);
          const dist = (1.0 - age) * 35;
          const ang = i * (TAU / 10) + snapshot.t;
          const px = pt.x + Math.cos(ang) * dist;
          const py = pt.y + Math.sin(ang) * dist * 0.6;
          ctx.globalAlpha = age * 0.6;
          ellipse(ctx, px, py, 2.5, 2.0, '#ffffff', null);
        }
        ctx.restore();
      }
    }
  }

  // =============================================================
  // REGISTRATION (RemakeVector.register)
  // =============================================================
  const NATURE_RIGS = {
    cloud: {
      draw(ctx, s, t) { drawCloud(ctx, s, t); }
    },
    raindrop_chibi: {
      draw(ctx, s, t) { drawRaindropChibi(ctx, s, t); }
    },
    rainbow: {
      draw(ctx, s, t) { drawRainbow(ctx, s, t); }
    },
    volcano: {
      draw(ctx, s, t) { drawVolcano(ctx, s, t); }
    },
    earth_cutaway: {
      draw(ctx, s, t) { drawEarthCutaway(ctx, s, t); }
    },
    fossil: {
      draw(ctx, s, t) { drawFossil(ctx, s, t); }
    },
    lever: {
      draw(ctx, s, t) { drawLever(ctx, s, t); }
    },
    pulley: {
      draw(ctx, s, t) { drawPulley(ctx, s, t); }
    },
    ramp: {
      draw(ctx, s, t) { drawRamp(ctx, s, t); }
    },
    wheel_axle: {
      draw(ctx, s, t) { drawWheelAxle(ctx, s, t); }
    }
  };

  const NATURE_BACKGROUNDS = {
    water_cycle_valley: {
      label: 'Thung lũng vòng tuần hoàn nước',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawWaterCycleValley(ctx, settings, t); }
    },
    volcano_island: {
      label: 'Đảo núi lửa nhiệt đới',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawVolcanoIsland(ctx, settings, t); }
    },
    dig_site: {
      label: 'Hố khai quật khảo cổ và cổ sinh',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawDigSite(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: NATURE_RIGS,
    backgrounds: NATURE_BACKGROUNDS,
    actionHooks: NATURE_ACTIONS,
    effects: [evaporateEffect]
  });

})();
