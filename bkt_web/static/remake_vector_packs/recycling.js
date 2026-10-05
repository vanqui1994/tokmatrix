// remake_vector_packs/recycling.js — Giai đoạn K: Phân loại rác và môi trường (recycling)
// Rigs: plastic_bottle, can, glass_jar, newspaper_bundle, cardboard_box, banana_peel, apple_core, battery, garbage_truck, recycling_plant
// Background: recycling_yard
// Tuân thủ: Zero-text, zero-brand, biểu tượng vector từ RemakeVector.kit.PICTOGRAMS.

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') throw new Error('RemakeVector core engine must be loaded before engine packs.');

  const {
    path, line, ellipse, cylinder, taper, volume, tone, limb, mitten,
    INK, TAU, clamp, hash, smooth, mix, celHatch, PICTOGRAMS,
    drawVehicle, drawBuilding
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

  // -------------------------------------------------------------
  // 1. RECYCLABLE OBJECT DRAWERS
  // -------------------------------------------------------------

  // 1. Chai nhựa (plastic_bottle)
  function drawPlasticBottle(ctx, s, t) {
    const sq = clamp(s.squish != null ? s.squish : (s.squash || 0), 0, 1);
    const dmg = clamp(s.damage || 0, 0, 1);
    const fil = clamp(s.fill != null ? s.fill : 0.4, 0, 1);
    const sl = clamp(s.slice || 0, 0, 1);

    ctx.save();
    // Squash nén dẹp chai và tạo nếp gấp
    const scaleY = 1 - sq * 0.55;
    const scaleX = 1 + sq * 0.4;
    ctx.scale(scaleX, scaleY);

    const baseColor = s.style?.body || '#38bdf8';
    const capColor = s.style?.cap || '#0284c7';
    const liquidColor = s.style?.liquid || '#7dd3fc';

    // Đáy và thân chai
    const w = 18;
    const h = 42;
    const shoulderY = -h + 10;
    const neckY = -h + 4;
    const topY = -h;

    // Bóng chai
    ellipse(ctx, 0, 0, w * 0.7, 3, 'rgba(0,0,0,0.18)', null);

    // Thân chai trong suốt
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.lineTo(w * 0.5, 0);
    ctx.quadraticCurveTo(w * 0.55, -h * 0.3, w * 0.5, -h * 0.6);
    ctx.lineTo(w * 0.45, shoulderY);
    ctx.lineTo(w * 0.22, neckY);
    ctx.lineTo(w * 0.22, topY);
    ctx.lineTo(-w * 0.22, topY);
    ctx.lineTo(-w * 0.22, neckY);
    ctx.lineTo(-w * 0.45, shoulderY);
    ctx.quadraticCurveTo(-w * 0.55, -h * 0.3, -w * 0.5, 0);
    ctx.closePath();

    ctx.fillStyle = baseColor;
    ctx.globalAlpha = 0.72;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = tone(baseColor, -0.25);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Nước / chất lỏng bên trong nếu có
    if (fil > 0.05 && sl < 0.5) {
      ctx.save();
      ctx.clip();
      const fillH = (h - 8) * fil;
      drawPoly(ctx, [
        [-w * 0.6, 0], [w * 0.6, 0],
        [w * 0.6, -fillH], [-w * 0.6, -fillH]
      ], liquidColor, null);
      ctx.restore();
    }

    // Các gân sọc nổi trên thân chai nhựa PET
    if (sq < 0.5) {
      line(ctx, [[-w * 0.4, -h * 0.25], [w * 0.4, -h * 0.25]], tone(baseColor, -0.15), 1.2);
      line(ctx, [[-w * 0.42, -h * 0.42], [w * 0.42, -h * 0.42]], tone(baseColor, -0.15), 1.2);
    } else {
      // Nếp nhăn khi bị dẹp
      line(ctx, [[-w * 0.4, -h * 0.2], [0, -h * 0.3], [w * 0.4, -h * 0.18]], '#0284c7', 1.8);
      line(ctx, [[-w * 0.35, -h * 0.45], [w * 0.2, -h * 0.38]], '#0284c7', 1.6);
    }

    // Vệt sáng bóng
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, -h * 0.1);
    ctx.lineTo(-w * 0.3, -h * 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Nắp chai nhựa
    drawPoly(ctx, [
      [-w * 0.24, topY], [w * 0.24, topY],
      [w * 0.24, topY - 5], [-w * 0.24, topY - 5]
    ], capColor, INK, 1.4);

    // Ký hiệu tái chế mini 3 mũi tên không chữ
    if (sq < 0.6) {
      PICTOGRAMS.recycling(ctx, 0, -h * 0.35, 9, 'recycle_arrows');
    }

    // Vết cắt đôi nếu slice
    if (sl > 0) {
      line(ctx, [[-w * 0.6, -h * 0.5], [w * 0.6, -h * 0.5]], '#ef4444', 2.0);
    }
    // Vết nứt vỡ / dơ nếu damage
    if (dmg > 0) {
      line(ctx, [[w * 0.1, -h * 0.2], [w * 0.35, -h * 0.35]], '#475569', 1.5);
    }

    ctx.restore();
  }

  // 2. Lon nhôm (can)
  function drawCan(ctx, s, t) {
    const sq = clamp(s.squish != null ? s.squish : (s.squash || 0), 0, 1);
    const dmg = clamp(s.damage || 0, 0, 1);

    ctx.save();
    const scaleY = 1 - sq * 0.65;
    const scaleX = 1 + sq * 0.35;
    ctx.scale(scaleX, scaleY);

    const bodyColor = s.style?.body || '#ef4444'; // Lon đỏ soda hoặc tuỳ biến
    const rimColor = '#cbd5e1';
    const w = 22;
    const h = 38;

    ellipse(ctx, 0, 0, w * 0.6, 3, 'rgba(0,0,0,0.2)', null);

    // Thân lon hình trụ
    path(ctx, `M ${-w * 0.5} 0 L ${w * 0.5} 0 L ${w * 0.5} ${-h} L ${-w * 0.5} ${-h} Z`, cylinder(ctx, -w * 0.5, w * 0.5, bodyColor), INK, 1.6);

    // Vành nhôm trên và dưới
    ellipse(ctx, 0, 0, w * 0.5, 2.5, rimColor, INK, 1.2);
    ellipse(ctx, 0, -h, w * 0.48, 2.8, rimColor, INK, 1.4);

    // Khoen bật nắp (tab)
    drawPoly(ctx, [
      [-3, -h - 1], [3, -h - 1],
      [4, -h + 3], [-4, -h + 3]
    ], '#94a3b8', INK, 1.0);
    ellipse(ctx, 0, -h + 1, 1.5, 1.5, '#64748b', null);

    // Vạch bóng kim loại
    ctx.beginPath();
    ctx.moveTo(-w * 0.25, -2);
    ctx.lineTo(-w * 0.25, -h + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Hoạ tiết lượn sóng hoặc sọc lon
    if (sq < 0.6) {
      path(ctx, `M ${-w * 0.45} ${-h * 0.4} Q 0 ${-h * 0.25} ${w * 0.45} ${-h * 0.4}`, null, '#ffffff', 1.8);
      path(ctx, `M ${-w * 0.45} ${-h * 0.5} Q 0 ${-h * 0.35} ${w * 0.45} ${-h * 0.5}`, null, '#facc15', 1.6);
    } else {
      // Lon bẹp rúm nếp gập kim loại
      line(ctx, [[-w * 0.45, -h * 0.3], [w * 0.1, -h * 0.5], [w * 0.45, -h * 0.35]], '#1e293b', 2.0);
      line(ctx, [[-w * 0.35, -h * 0.7], [w * 0.3, -h * 0.6]], '#1e293b', 1.8);
    }

    if (dmg > 0) {
      line(ctx, [[0, -h * 0.7], [w * 0.3, -h * 0.8]], '#475569', 1.4);
    }

    ctx.restore();
  }

  // 3. Hũ thủy tinh (glass_jar)
  function drawGlassJar(ctx, s, t) {
    const dmg = clamp(s.damage || 0, 0, 1);
    const fil = clamp(s.fill != null ? s.fill : 0.5, 0, 1);

    ctx.save();
    const w = 26;
    const h = 36;
    const lidColor = s.style?.lid || '#d97706';
    const glassColor = '#a7f3d0';

    ellipse(ctx, 0, 0, w * 0.65, 3.5, 'rgba(0,0,0,0.2)', null);

    // Thân hũ thuỷ tinh trong suốt
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.lineTo(w * 0.5, 0);
    ctx.quadraticCurveTo(w * 0.52, -h * 0.5, w * 0.45, -h + 7);
    ctx.lineTo(w * 0.38, -h + 3);
    ctx.lineTo(-w * 0.38, -h + 3);
    ctx.lineTo(-w * 0.45, -h + 7);
    ctx.quadraticCurveTo(-w * 0.52, -h * 0.5, -w * 0.5, 0);
    ctx.closePath();

    ctx.fillStyle = glassColor;
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Mứt / hạt / chất lỏng bên trong hũ
    if (fil > 0.05) {
      ctx.save();
      ctx.clip();
      const fillH = (h - 10) * fil;
      drawPoly(ctx, [
        [-w * 0.6, 0], [w * 0.6, 0],
        [w * 0.6, -fillH], [-w * 0.6, -fillH]
      ], s.style?.liquid || '#f59e0b', null);
      ctx.restore();
    }

    // Nắp hũ kim loại có rãnh xoay
    drawPoly(ctx, [
      [-w * 0.42, -h + 3], [w * 0.42, -h + 3],
      [w * 0.42, -h - 3], [-w * 0.42, -h - 3]
    ], lidColor, INK, 1.4);
    line(ctx, [[-w * 0.42, -h], [w * 0.42, -h]], tone(lidColor, -0.2), 1.0);

    // Ánh thuỷ tinh
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, -4);
    ctx.lineTo(-w * 0.35, -h + 9);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Nứt nếu damage
    if (dmg > 0) {
      line(ctx, [[-2, -h * 0.6], [5, -h * 0.4], [10, -h * 0.45]], '#065f46', 1.8);
      line(ctx, [[5, -h * 0.4], [4, -h * 0.2]], '#065f46', 1.6);
    }

    ctx.restore();
  }

  // 4. Bó báo cũ buộc dây (newspaper_bundle) — Không chữ, nét mô phỏng
  function drawNewspaperBundle(ctx, s, t) {
    const dmg = clamp(s.damage || 0, 0, 1);
    ctx.save();
    const w = 38;
    const h = 28;
    const paperColor = '#f8fafc';
    const shadowColor = '#e2e8f0';
    const ropeColor = '#b45309';

    ellipse(ctx, 0, 0, w * 0.6, 4, 'rgba(0,0,0,0.18)', null);

    // Các lớp báo xếp chồng
    for (let layer = 0; layer < 4; layer++) {
      const ly = -layer * (h / 4);
      const lw = w - layer * 1.5;
      drawPoly(ctx, [
        [-lw * 0.5, ly], [lw * 0.5, ly],
        [lw * 0.5, ly - 6], [-lw * 0.5, ly - 6]
      ], layer % 2 === 0 ? paperColor : shadowColor, INK, 1.2);

      // Nét mô phỏng cột báo (zero-text)
      line(ctx, [[-lw * 0.4, ly - 3], [-lw * 0.1, ly - 3]], '#94a3b8', 1.0);
      line(ctx, [[lw * 0.1, ly - 3], [lw * 0.4, ly - 3]], '#94a3b8', 1.0);
    }

    // Dây thừng buộc chữ thập (cross twine)
    line(ctx, [[0, 0], [0, -h]], ropeColor, 2.0);
    line(ctx, [[-w * 0.48, -h * 0.5], [w * 0.48, -h * 0.5]], ropeColor, 2.0);
    // Nút thắt nơ
    ellipse(ctx, 0, -h * 0.5, 3, 2.5, '#d97706', INK, 1.2);
    path(ctx, `M 0 ${-h * 0.5} Q -5 ${-h * 0.6} -7 ${-h * 0.45}`, null, ropeColor, 1.6);
    path(ctx, `M 0 ${-h * 0.5} Q 5 ${-h * 0.6} 7 ${-h * 0.45}`, null, ropeColor, 1.6);

    if (dmg > 0) {
      // Báo bị rách góc
      drawPoly(ctx, [[-w * 0.5, -h * 0.8], [-w * 0.35, -h], [-w * 0.5, -h]], '#cbd5e1', INK, 1.2);
    }

    ctx.restore();
  }

  // 5. Thùng các-tông (cardboard_box)
  function drawCardboardBox(ctx, s, t) {
    const dmg = clamp(s.damage || 0, 0, 1);
    const op = clamp(s.open != null ? s.open : 0, 0, 1);

    ctx.save();
    const w = 44;
    const h = 36;
    const boxColor = '#d97706';
    const darkBox = '#b45309';
    const tapeColor = '#f59e0b';

    ellipse(ctx, 0, 0, w * 0.65, 4, 'rgba(0,0,0,0.22)', null);

    // Thân thùng các-tông
    drawPoly(ctx, [
      [-w * 0.5, 0], [w * 0.5, 0],
      [w * 0.5, -h], [-w * 0.5, -h]
    ], boxColor, INK, 1.6);

    // Mặt hông tạo khối 3D nhẹ
    drawPoly(ctx, [
      [w * 0.25, 0], [w * 0.5, 0],
      [w * 0.5, -h], [w * 0.25, -h]
    ], darkBox, null);

    // Băng keo dán đáy và giữa thùng
    line(ctx, [[0, 0], [0, -h]], tapeColor, 4.0);
    line(ctx, [[0, 0], [0, -h]], '#b45309', 1.0);

    // Nắp mở (flaps)
    const flapAngle = op * Math.PI * 0.45;
    // Nắp trái
    ctx.save();
    ctx.translate(-w * 0.5, -h);
    ctx.rotate(-flapAngle);
    drawPoly(ctx, [[0, 0], [w * 0.5, 0], [w * 0.45, -8], [0, -8]], tone(boxColor, 0.08), INK, 1.4);
    ctx.restore();

    // Nắp phải
    ctx.save();
    ctx.translate(w * 0.5, -h);
    ctx.rotate(flapAngle);
    drawPoly(ctx, [[0, 0], [-w * 0.5, 0], [-w * 0.45, -8], [0, -8]], tone(boxColor, -0.08), INK, 1.4);
    ctx.restore();

    // Ký hiệu tái chế / mũi tên hướng lên trên bìa các-tông
    PICTOGRAMS.recycling(ctx, -w * 0.25, -h * 0.4, 11, 'recycle_arrows');

    if (dmg > 0) {
      line(ctx, [[-w * 0.3, -h * 0.2], [-w * 0.15, -h * 0.35]], '#78350f', 2.0);
    }

    ctx.restore();
  }

  // 6. Vỏ chuối (banana_peel)
  function drawBananaPeel(ctx, s, t) {
    const dmg = clamp(s.damage || 0, 0, 1);
    ctx.save();
    const w = 36;
    const h = 24;
    const peelColor = '#facc15';
    const insideColor = '#fef08a';
    const tipColor = '#78350f';

    ellipse(ctx, 0, 0, w * 0.6, 3.5, 'rgba(0,0,0,0.2)', null);

    // 4 cánh vỏ chuối xoè ra các hướng
    // Cánh trái
    path(ctx, `M 0 ${-h * 0.5} Q ${-w * 0.3} ${-h * 0.4} ${-w * 0.5} 0 Q ${-w * 0.25} ${-2} 0 0`, peelColor, INK, 1.4);
    // Cánh phải
    path(ctx, `M 0 ${-h * 0.5} Q ${w * 0.3} ${-h * 0.4} ${w * 0.5} 0 Q ${w * 0.25} ${-2} 0 0`, peelColor, INK, 1.4);
    // Cánh giữa xoè về phía trước
    path(ctx, `M -4 ${-h * 0.5} Q -8 ${-h * 0.1} -10 2 Q 0 ${-h * 0.1} 4 ${-h * 0.5}`, insideColor, INK, 1.2);
    path(ctx, `M 4 ${-h * 0.5} Q 8 ${-h * 0.1} 12 1 Q 0 ${-h * 0.1} -4 ${-h * 0.5}`, insideColor, INK, 1.2);

    // Cuống chuối ở đỉnh
    drawPoly(ctx, [
      [-3, -h * 0.5], [3, -h * 0.5],
      [2, -h], [-2, -h]
    ], tipColor, INK, 1.4);

    // Các đốm nâu hữu cơ (đặc trưng chuối chín/rác hữu cơ)
    ellipse(ctx, -w * 0.3, -3, 2, 1.2, tipColor, null);
    ellipse(ctx, w * 0.25, -4, 2.5, 1.5, tipColor, null);
    ellipse(ctx, 0, -h * 0.3, 1.8, 1.8, tipColor, null);

    ctx.restore();
  }

  // 7. Lõi táo (apple_core)
  function drawAppleCore(ctx, s, t) {
    const dmg = clamp(s.damage || 0, 0, 1);
    ctx.save();
    const w = 20;
    const h = 30;
    const skinColor = '#ef4444';
    const fleshColor = '#fef08a';
    const seedColor = '#713f12';

    ellipse(ctx, 0, 0, w * 0.6, 3, 'rgba(0,0,0,0.18)', null);

    // Thân lõi táo bị cắn lõm 2 bên
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, 0);
    ctx.lineTo(w * 0.45, 0);
    // Vết cắn bên phải
    ctx.quadraticCurveTo(w * 0.1, -h * 0.5, w * 0.45, -h);
    ctx.lineTo(-w * 0.45, -h);
    // Vết cắn bên trái
    ctx.quadraticCurveTo(-w * 0.1, -h * 0.5, -w * 0.45, 0);
    ctx.closePath();

    ctx.fillStyle = fleshColor;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Vỏ táo đỏ còn lại ở chỏm trên và chỏm dưới
    drawPoly(ctx, [
      [-w * 0.48, 0], [w * 0.48, 0],
      [w * 0.42, -5], [-w * 0.42, -5]
    ], skinColor, INK, 1.2);
    drawPoly(ctx, [
      [-w * 0.48, -h], [w * 0.48, -h],
      [w * 0.42, -h + 5], [-w * 0.42, -h + 5]
    ], skinColor, INK, 1.2);

    // Hạt táo ở giữa lõi
    ellipse(ctx, -2.5, -h * 0.5, 1.8, 2.5, seedColor, null, -0.2);
    ellipse(ctx, 2.5, -h * 0.5 + 2, 1.8, 2.5, seedColor, null, 0.2);

    // Cuống táo cong ở đỉnh
    path(ctx, `M 0 ${-h} Q -3 ${-h - 7} 2 ${-h - 10}`, null, '#78350f', 2.0);
    // Chiếc lá nhỏ ở cuống
    ellipse(ctx, 3, -h - 7, 3, 1.8, '#16a34a', null, 0.4);

    ctx.restore();
  }

  // 8. Pin cũ (battery)
  function drawBattery(ctx, s, t) {
    const dmg = clamp(s.damage || 0, 0, 1);
    const tox = clamp(s.toxic || 0, 0, 1);

    ctx.save();
    const w = 16;
    const h = 34;
    const topCapColor = '#e2e8f0';
    const bodyColor = '#10b981'; // Xanh lá pin năng lượng
    const bottomColor = '#334155';

    ellipse(ctx, 0, 0, w * 0.6, 2.5, 'rgba(0,0,0,0.25)', null);

    // Thân pin
    path(ctx, `M ${-w * 0.5} 0 L ${w * 0.5} 0 L ${w * 0.5} ${-h} L ${-w * 0.5} ${-h} Z`, cylinder(ctx, -w * 0.5, w * 0.5, bodyColor), INK, 1.6);

    // Đáy pin cực âm (-)
    drawPoly(ctx, [
      [-w * 0.5, 0], [w * 0.5, 0],
      [w * 0.5, -8], [-w * 0.5, -8]
    ], bottomColor, INK, 1.2);
    line(ctx, [[-3, -4], [3, -4]], '#ffffff', 1.5); // Dấu trừ

    // Núm cực dương (+) ở đỉnh
    drawPoly(ctx, [
      [-w * 0.25, -h], [w * 0.25, -h],
      [w * 0.25, -h - 4], [-w * 0.25, -h - 4]
    ], topCapColor, INK, 1.4);
    // Dấu cộng
    line(ctx, [[0, -h + 5], [0, -h + 11]], '#ffffff', 1.5);
    line(ctx, [[-3, -h + 8], [3, -h + 8]], '#ffffff', 1.5);

    // Vạch pin chỉ thị dung lượng (3 vạch ngang)
    line(ctx, [[-w * 0.35, -h * 0.45], [w * 0.35, -h * 0.45]], '#fef08a', 1.6);
    line(ctx, [[-w * 0.35, -h * 0.55], [w * 0.35, -h * 0.55]], '#fef08a', 1.6);

    // Biểu tượng hoá chất/chất thải nguy hại (kính bảo hộ hoặc tam giác cảnh báo mini)
    PICTOGRAMS.prohibition(ctx, 0, -h * 0.3, 8, 'warning_triangle');

    // Rò rỉ hoá chất / tia điện nếu toxic/damage
    if (tox > 0 || dmg > 0) {
      const pCount = Math.floor(tox * 4) + 1;
      for (let i = 0; i < pCount; i++) {
        const sparkX = Math.sin(t * 10 + i * 2) * 12;
        const sparkY = -h * 0.5 + Math.cos(t * 10 + i * 2) * 10;
        ellipse(ctx, sparkX, sparkY, 2, 2, '#facc15', null);
      }
      // Vệt rò rỉ dưới đáy
      ellipse(ctx, 4, 1, 4, 2, '#84cc16', null);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 2. PHƯƠNG TIỆN & CÔNG TRÌNH TÁI CHẾ
  // -------------------------------------------------------------

  // Cấu hình xe rác garbage_truck mở rộng VEHICLE_SPECS
  const GARBAGE_TRUCK_SPEC = {
    label: 'Xe chở rác',
    category: 'road',
    width: 148,
    height: 74,
    color: '#16a34a',
    locale_colors: {
      de: '#ea580c', // Đức chuộng xe cam đô thị
      us: '#16a34a', // Mỹ xanh lá cây tái chế
      jp: '#0284c7', // Nhật xe thu gom xanh dương
      kr: '#16a34a'  // Hàn xanh lá sạch
    },
    wheels: [[-48, 16, 15], [20, 16, 15], [48, 16, 15]],
    seats: [[-36, -36]],
    hitch: [72, -10],
    topics: ['recycling', 'jobs', 'safety'],
    // Chi tiết đặc thù xe rác: thùng nén ép phía sau và cơ cấu nâng thùng rác
    isGarbageTruck: true
  };

  function drawGarbageTruck(ctx, s, t, cat, kit) {
    const locale = s.locale || 'neutral';
    const spec = GARBAGE_TRUCK_SPEC;
    // Gọi hàm cơ sở drawVehicle của kit
    drawVehicle(ctx, s, t, spec, cat, kit);

    // Vẽ thêm cơ cấu đặc thù: thùng nén rác sau xe & đèn chớp cảnh báo (nhấc lên cùng thân xe như drawVehicle)
    ctx.save();
    ctx.translate(0, -RemakeVector.kit.vehicleGroundOffset(spec, 'garbage_truck'));
    const col = spec.locale_colors[locale] || spec.color;

    // Đèn chớp cảnh báo trên nóc cabin
    const blink = Math.sin(t * 12) > 0 ? '#f59e0b' : '#78350f';
    drawPoly(ctx, [[-40, -spec.height - 4], [-32, -spec.height - 4], [-32, -spec.height], [-40, -spec.height]], blink, INK, 1.2);

    // Ký hiệu tái chế lớn trên thân thùng rác
    PICTOGRAMS.recycling(ctx, 28, -spec.height * 0.5, 24, 'recycle_arrows');

    // Cần nâng thùng rác phía sau xe (hydraulic bin lift)
    const liftP = clamp(s.lift || 0, 0, 1);
    const liftArmAngle = -liftP * Math.PI * 0.45;
    ctx.save();
    ctx.translate(62, -18);
    ctx.rotate(liftArmAngle);
    drawPoly(ctx, [[0, -3], [18, -3], [18, 3], [0, 3]], '#475569', INK, 1.2);
    drawPoly(ctx, [[18, -12], [22, -12], [22, 6], [18, 6]], '#1e293b', INK, 1.2);
    ctx.restore();

    ctx.restore();
  }

  // Cấu hình nhà máy tái chế recycling_plant mở rộng BUILDING_SPECS
  const RECYCLING_PLANT_SPEC = {
    label: 'Nhà máy tái chế',
    category: 'modern',
    width: 220,
    height: 150,
    color: '#059669',
    roof: 'flat',
    roof_color: '#334155',
    door: [-50, 0],
    windows: [[-50, -85], [0, -85], [50, -85]],
    topics: ['recycling', 'jobs', 'school']
  };

  function drawRecyclingPlant(ctx, s, t, cat, kit) {
    const spec = RECYCLING_PLANT_SPEC;
    // Vẽ khối toà nhà chuẩn
    drawBuilding(ctx, s, t, spec, cat, kit);

    ctx.save();
    const cut = clamp(s.cutaway || 0, 0, 1);

    // Tấm pin mặt trời trên mái sinh thái
    for (let i = -70; i <= 70; i += 35) {
      drawPoly(ctx, [
        [i - 14, -spec.height - 8], [i + 14, -spec.height - 8],
        [i + 14, -spec.height], [i - 14, -spec.height]
      ], '#1e3a8a', INK, 1.2);
    }

    // Biểu tượng tái chế khổng lồ ở mặt tiền nhà máy
    PICTOGRAMS.recycling(ctx, 45, -spec.height * 0.6, 36, 'recycle_arrows');

    // Cửa cuốn khu giao nhận rác (bay roll-up door)
    drawPoly(ctx, [
      [20, 0], [75, 0],
      [75, -55], [20, -55]
    ], '#475569', INK, 1.6);
    // Các đường gân cửa cuốn kim loại
    for (let y = -50; y < 0; y += 8) {
      line(ctx, [[21, y], [74, y]], '#64748b', 1.2);
    }

    // Nếu cutaway > 0: Cho thấy băng chuyền phân loại bên trong nhà máy!
    if (cut > 0) {
      ctx.save();
      const cutW = 140 * cut;
      const cutH = 80 * cut;
      ctx.beginPath();
      ctx.rect(-cutW * 0.5, -110, cutW, cutH);
      ctx.clip();

      // Nền trong xưởng
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(-cutW * 0.5, -110, cutW, cutH);

      // Băng chuyền chuyển động
      drawPoly(ctx, [
        [-cutW * 0.5, -60], [cutW * 0.5, -60],
        [cutW * 0.5, -50], [-cutW * 0.5, -50]
      ], '#334155', INK, 1.4);

      // Con lăn băng chuyền
      const rollerPhase = (t * 40) % 20;
      for (let rx = -cutW * 0.5 + rollerPhase; rx < cutW * 0.5; rx += 20) {
        ellipse(ctx, rx, -55, 3, 3, '#94a3b8', null);
      }

      // Các vật thể tái chế thu nhỏ đang di chuyển trên băng chuyền
      const itemX1 = ((-50 + t * 30) % 120) - 60;
      const itemX2 = ((-20 + t * 30) % 120) - 60;
      const itemX3 = ((10 + t * 30) % 120) - 60;

      // Chai nhựa mini
      ctx.save();
      ctx.translate(itemX1, -68);
      ctx.scale(0.35, 0.35);
      drawPlasticBottle(ctx, {}, t);
      ctx.restore();

      // Lon nhôm mini
      ctx.save();
      ctx.translate(itemX2, -66);
      ctx.scale(0.35, 0.35);
      drawCan(ctx, {}, t);
      ctx.restore();

      // Thùng giấy mini
      ctx.save();
      ctx.translate(itemX3, -66);
      ctx.scale(0.3, 0.3);
      drawCardboardBox(ctx, {}, t);
      ctx.restore();

      ctx.restore();
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 3. HÌNH NỀN BÃI TÁI CHẾ VÀ PHÂN LOẠI (recycling_yard)
  // -------------------------------------------------------------

  // Khổ ngang (B4): hai dải mở rộng [x0, 0) và [576, x1); khổ dọc trả về rỗng nên pixel dọc không đổi.
  function extRanges(x0, x1) {
    const out = [];
    if (x0 < 0) out.push([x0, 0]);
    if (x1 > 576) out.push([576, x1]);
    return out;
  }
  // Nối tiếp hoạ tiết lặp (start, step; vòng gốc dừng ở origEnd) sang hai dải mở rộng.
  function tileExt(ext, start, step, origEnd, fn) {
    for (const [a, b] of ext) {
      if (a < 0) { for (let x = start - step; x > a - step; x -= step) fn(x); }
      else { let x = start; while (x <= origEnd) x += step; for (; x < b + step; x += step) fn(x); }
    }
  }
  // Rải vật tất định trên dải mở rộng: bước step ± 30 %, seed theo toạ độ.
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

  function drawRecyclingYard(ctx, s, t, opt = {}) {
    const W = 576, H = 1024;
    const groundY = 810;
    const sp = RemakeVector.kit.frameSpan(s), X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = opt.night || s.night;
    const weather = opt.weather || s.weather || 'clear';
    const season = opt.season || s.season || 'summer';

    // Bầu trời
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      sky.addColorStop(0, '#0f172a');
      sky.addColorStop(1, '#1e293b');
    } else if (weather === 'rain' || weather === 'storm') {
      sky.addColorStop(0, '#64748b');
      sky.addColorStop(1, '#94a3b8');
    } else {
      sky.addColorStop(0, '#bae6fd');
      sky.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Mây nhẹ hoặc đồi cây phía xa
    ctx.fillStyle = isNight ? '#1e293b' : '#cbd5e1';
    for (let i = 0; i < 4; i++) {
      const cx = 80 + i * 140;
      ellipse(ctx, cx, groundY - 260, 90, 45, ctx.fillStyle, null);
    }
    tileExt(ext, 80, 140, 499, (cx) => ellipse(ctx, cx, groundY - 250 - RemakeVector.kit.seeded(`ry_hill:${cx}`) * 30, 90, 45, isNight ? '#1e293b' : '#cbd5e1', null));
    // Khổ ngang: nhà xưởng tái chế, ống khói hơi nước sạch, tuabin gió phía xa
    scatterExt(ext, 330, 'ry_far', (x, r, i) => {
      if (i % 2 === 0) {
        drawPoly(ctx, [[x - 110, groundY - 120], [x + 110, groundY - 120], [x + 110, groundY - 230], [x - 110, groundY - 230]], isNight ? '#334155' : '#94a3b8', INK, 1.4);
        for (let k = 0; k < 4; k++) drawPoly(ctx, [[x - 110 + k * 55, groundY - 230], [x - 55 + k * 55, groundY - 230], [x - 82 + k * 55, groundY - 262]], isNight ? '#475569' : '#64748b', INK, 1.2);
        drawPoly(ctx, [[x + 60, groundY - 262], [x + 80, groundY - 262], [x + 80, groundY - 330], [x + 60, groundY - 330]], isNight ? '#475569' : '#cbd5e1', INK, 1.2);
        for (let k = 0; k < 3; k++) ellipse(ctx, x + 70 + k * 10, groundY - 345 - k * 18 - ((t * 10) % 12), 12 + k * 4, 9 + k * 3, 'rgba(255, 255, 255, 0.6)', null);
      } else {
        line(ctx, [[x, groundY - 120], [x, groundY - 380]], '#e2e8f0', 4);
        ctx.save(); ctx.translate(x, groundY - 380); ctx.rotate(t * 1.2 + r * 6);
        for (let k = 0; k < 3; k++) { ctx.rotate(TAU / 3); drawPoly(ctx, [[0, -3], [70, -1], [70, 1], [0, 3]], '#f8fafc', '#94a3b8', 1.0); }
        ctx.restore();
        ellipse(ctx, x, groundY - 380, 5, 5, '#94a3b8', null);
      }
    });

    // Mặt đất bê tông bãi tập kết
    const ground = ctx.createLinearGradient(0, groundY, 0, H);
    if (isNight) {
      ground.addColorStop(0, '#334155');
      ground.addColorStop(1, '#1e293b');
    } else {
      ground.addColorStop(0, '#e2e8f0');
      ground.addColorStop(1, '#cbd5e1');
    }
    ctx.fillStyle = ground;
    ctx.fillRect(X0, groundY, X1 - X0, H - groundY);

    // Đường kẻ phân làn vạch vàng an toàn
    line(ctx, [[X0, groundY], [X1, groundY]], '#475569', 2.5);
    for (let x = 20; x < W; x += 50) {
      line(ctx, [[x, groundY + 8], [x + 25, groundY + 8]], '#facc15', 3.0);
    }
    tileExt(ext, 20, 50, W - 1, (x) => line(ctx, [[x, groundY + 8], [x + 25, groundY + 8]], '#facc15', 3.0));

    // Hàng rào lưới thép phía sau bãi
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.0;
    for (let x = 0; x < W; x += 30) {
      line(ctx, [[x, groundY - 120], [x, groundY]], '#94a3b8', 1.0);
      line(ctx, [[x, groundY - 120], [x + 30, groundY]], 'rgba(148, 163, 184, 0.4)', 0.8);
      line(ctx, [[x + 30, groundY - 120], [x, groundY]], 'rgba(148, 163, 184, 0.4)', 0.8);
    }
    tileExt(ext, 0, 30, W - 1, (x) => {
      line(ctx, [[x, groundY - 120], [x, groundY]], '#94a3b8', 1.0);
      line(ctx, [[x, groundY - 120], [x + 30, groundY]], 'rgba(148, 163, 184, 0.4)', 0.8);
      line(ctx, [[x + 30, groundY - 120], [x, groundY]], 'rgba(148, 163, 184, 0.4)', 0.8);
    });
    line(ctx, [[X0, groundY - 120], [X1, groundY - 120]], '#64748b', 2.0);
    // Khổ ngang: thêm ngăn kim loại / pin, công-te-nơ, kiện giấy ép, xe nâng nhỏ
    scatterExt(ext, 190, 'ry_bay', (x, r, i) => {
      const k = i % 4;
      if (k === 0 || k === 2) {
        const pic = k === 0 ? 'can' : 'battery', col = k === 0 ? '#94a3b8' : '#ef4444';
        drawPoly(ctx, [[x - 55, groundY], [x + 55, groundY], [x + 55, groundY - 70], [x - 55, groundY - 70]], isNight ? '#1e293b' : '#f1f5f9', '#475569', 2.0);
        drawPoly(ctx, [[x - 55, groundY - 70], [x + 55, groundY - 70], [x + 55, groundY - 62], [x - 55, groundY - 62]], col, null);
        PICTOGRAMS.recycling(ctx, x, groundY - 35, 26, pic);
      } else if (k === 1) {
        const cc = ['#16a34a', '#2563eb', '#ea580c'][Math.floor(r * 3)];
        drawPoly(ctx, [[x - 70, groundY], [x + 70, groundY], [x + 76, groundY - 90], [x - 76, groundY - 90]], cc, INK, 2.0);
        for (let j = -2; j <= 2; j++) line(ctx, [[x + j * 26, groundY - 6], [x + j * 28, groundY - 84]], tone(cc, -0.25), 2);
        ellipse(ctx, x - 50, groundY, 9, 9, '#1f2937', null); ellipse(ctx, x + 50, groundY, 9, 9, '#1f2937', null);
      } else {
        for (let j = 0; j < 3; j++) drawPoly(ctx, [[x - 50 + j * 34, groundY], [x - 20 + j * 34, groundY], [x - 20 + j * 34, groundY - 40 - (j % 2) * 30], [x - 50 + j * 34, groundY - 40 - (j % 2) * 30]], j % 2 ? '#d6d3d1' : '#e7e5e4', '#78716c', 1.2);
        for (let j = 0; j < 3; j++) line(ctx, [[x - 50 + j * 34, groundY - 20], [x - 20 + j * 34, groundY - 20]], '#78716c', 1.4);
      }
    });

    // 4 khu / ngăn chứa phân loại (Bays) với biển pictogram không chữ
    const bays = [
      { x: 30, w: 110, color: '#3b82f6', label: 'paper', pic: 'paper', fill: '#f8fafc' },       // Giấy
      { x: 160, w: 110, color: '#eab308', label: 'plastic', pic: 'bottle', fill: '#38bdf8' },  // Nhựa
      { x: 290, w: 110, color: '#10b981', label: 'glass', pic: 'bottle', fill: '#a7f3d0' },    // Thuỷ tinh
      { x: 420, w: 120, color: '#84cc16', label: 'bio', pic: 'apple_core', fill: '#78350f' }   // Hữu cơ
    ];

    bays.forEach(bay => {
      // Vách ngăn bê tông
      drawPoly(ctx, [
        [bay.x, groundY], [bay.x + bay.w, groundY],
        [bay.x + bay.w, groundY - 70], [bay.x, groundY - 70]
      ], isNight ? '#1e293b' : '#f1f5f9', '#475569', 2.0);

      // Viền màu đặc trưng của loại rác ở đỉnh vách
      drawPoly(ctx, [
        [bay.x, groundY - 70], [bay.x + bay.w, groundY - 70],
        [bay.x + bay.w, groundY - 62], [bay.x, groundY - 62]
      ], bay.color, null);

      // Biển báo Pictogram chính giữa vách ngăn
      PICTOGRAMS.recycling(ctx, bay.x + bay.w * 0.5, groundY - 35, 26, bay.pic);

      // Đống phế liệu tượng trưng bên trong mỗi ngăn
      if (bay.label === 'paper') {
        // Chồng báo giấy
        drawPoly(ctx, [[bay.x + 15, groundY], [bay.x + 50, groundY], [bay.x + 45, groundY - 25], [bay.x + 20, groundY - 25]], '#ffffff', '#cbd5e1', 1.0);
        drawPoly(ctx, [[bay.x + 55, groundY], [bay.x + 95, groundY], [bay.x + 90, groundY - 35], [bay.x + 60, groundY - 35]], '#f1f5f9', '#cbd5e1', 1.0);
      } else if (bay.label === 'plastic') {
        // Kiện chai nhựa ép
        ellipse(ctx, bay.x + 35, groundY - 12, 18, 12, '#bae6fd', '#0284c7', 1.0);
        ellipse(ctx, bay.x + 75, groundY - 16, 22, 14, '#7dd3fc', '#0284c7', 1.0);
      } else if (bay.label === 'glass') {
        // Thùng chứa chai thuỷ tinh
        drawPoly(ctx, [[bay.x + 20, groundY], [bay.x + 85, groundY], [bay.x + 85, groundY - 28], [bay.x + 20, groundY - 28]], '#059669', INK, 1.2);
        ellipse(ctx, bay.x + 40, groundY - 28, 8, 4, '#a7f3d0', null);
        ellipse(ctx, bay.x + 65, groundY - 28, 8, 4, '#a7f3d0', null);
      } else if (bay.label === 'bio') {
        // Đống mùn hữu cơ
        drawPoly(ctx, [[bay.x + 15, groundY], [bay.x + 105, groundY], [bay.x + 75, groundY - 38], [bay.x + 40, groundY - 30]], '#78350f', null);
        // Nhánh cây con mọc mầm
        path(ctx, `M ${bay.x + 60} ${groundY - 35} Q ${bay.x + 55} ${groundY - 55} ${bay.x + 62} ${groundY - 65}`, null, '#16a34a', 2.0);
        ellipse(ctx, bay.x + 65, groundY - 65, 5, 3, '#22c55e', null, 0.4);
      }
    });
  }

  // -------------------------------------------------------------
  // 4. ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  const RECYCLING_RIGS = {
    plastic_bottle: {
      group: 'recycling',
      face: true,
      face_scale: 0.35,
      anchors: {
        root: [0, 0],
        top: [0, -42],
        face: [0, -22],
        mouth: [0, -18],
        grip: [0, -20]
      },
      draw(ctx, s, t) {
        drawPlasticBottle(ctx, s, t);
      }
    },
    can: {
      group: 'recycling',
      face: true,
      face_scale: 0.35,
      anchors: {
        root: [0, 0],
        top: [0, -38],
        face: [0, -20],
        mouth: [0, -16],
        grip: [0, -18]
      },
      draw(ctx, s, t) {
        drawCan(ctx, s, t);
      }
    },
    glass_jar: {
      group: 'recycling',
      face: true,
      face_scale: 0.35,
      anchors: {
        root: [0, 0],
        top: [0, -36],
        face: [0, -18],
        mouth: [0, -14],
        grip: [0, -18]
      },
      draw(ctx, s, t) {
        drawGlassJar(ctx, s, t);
      }
    },
    newspaper_bundle: {
      group: 'recycling',
      face: true,
      face_scale: 0.35,
      anchors: {
        root: [0, 0],
        top: [0, -28],
        face: [0, -14],
        mouth: [0, -10],
        grip: [0, -14]
      },
      draw(ctx, s, t) {
        drawNewspaperBundle(ctx, s, t);
      }
    },
    cardboard_box: {
      group: 'recycling',
      face: true,
      face_scale: 0.4,
      anchors: {
        root: [0, 0],
        top: [0, -36],
        face: [0, -18],
        mouth: [0, -14],
        grip: [0, -18]
      },
      draw(ctx, s, t) {
        drawCardboardBox(ctx, s, t);
      }
    },
    banana_peel: {
      group: 'recycling',
      face: true,
      face_scale: 0.32,
      anchors: {
        root: [0, 0],
        top: [0, -24],
        face: [0, -12],
        mouth: [0, -9],
        grip: [0, -12]
      },
      draw(ctx, s, t) {
        drawBananaPeel(ctx, s, t);
      }
    },
    apple_core: {
      group: 'recycling',
      face: true,
      face_scale: 0.32,
      anchors: {
        root: [0, 0],
        top: [0, -30],
        face: [0, -15],
        mouth: [0, -11],
        grip: [0, -15]
      },
      draw(ctx, s, t) {
        drawAppleCore(ctx, s, t);
      }
    },
    battery: {
      group: 'recycling',
      face: true,
      face_scale: 0.32,
      anchors: {
        root: [0, 0],
        top: [0, -34],
        face: [0, -18],
        mouth: [0, -14],
        grip: [0, -16]
      },
      draw(ctx, s, t) {
        drawBattery(ctx, s, t);
      }
    },
    garbage_truck: {
      group: 'vehicle',
      spec: GARBAGE_TRUCK_SPEC,
      anchors: {
        root: [0, 0],
        top: [0, -74],
        surface: [0, -37],
        door: [22, -26],
        grip: [44, -30],
        seat_1: [-36, -36],
        wheel_1: [-48, 16],
        wheel_2: [20, 16],
        wheel_3: [48, 16],
        hitch: [72, -10],
        bin_lift: [62, -18]
      },
      draw(ctx, s, t, cat, kit) {
        drawGarbageTruck(ctx, s, t, cat, kit);
      }
    },
    recycling_plant: {
      group: 'building',
      spec: RECYCLING_PLANT_SPEC,
      anchors: {
        root: [0, 0],
        top: [0, -150],
        surface: [0, -75],
        roof_top: [0, -150],
        door: [-50, 0],
        window_1: [-50, -85],
        window_2: [0, -85],
        window_3: [50, -85],
        conveyor: [0, -60]
      },
      draw(ctx, s, t, cat, kit) {
        drawRecyclingPlant(ctx, s, t, cat, kit);
      }
    }
  };

  RemakeVector.register({
    rigs: RECYCLING_RIGS,
    backgrounds: {
      recycling_yard: {
        label: 'Bãi phân loại tái chế',
        theme: 'urban',
        ground_y: 810,
        draw: drawRecyclingYard
      }
    }
  });

})();
