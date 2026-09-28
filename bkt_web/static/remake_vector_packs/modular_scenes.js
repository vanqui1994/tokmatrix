// remake_vector_packs/modular_scenes.js — Giai đoạn J: Hình nền lắp ghép theo locale (drawStreet, drawInterior)
// Cung cấp 2 hình nền lắp ghép: "street" và "interior" hỗ trợ 5 locale: de, us, kr, jp, neutral.
// ground_y: 810, hỗ trợ chế độ ngày/đêm, zero-text (không chứa chữ).

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
  // 1. HÌNH NỀN ĐƯỜNG PHỐ: drawStreet()
  // -------------------------------------------------------------
  function drawStreet(ctx, settings, t) {
    const isNight = settings.time === 'night';
    const locale = settings.locale || 'neutral';
    const groundY = 810;

    // 1.1 BẦU TRỜ
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY * 0.6);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(1, '#0f172a');
    } else {
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 576, groundY);

    if (isNight) {
      // Sao đêm lấp lánh tất định
      for (let si = 0; si < 20; si++) {
        const sx = (hash('street_star_x_' + si) % 550) + 13;
        const sy = (hash('street_star_y_' + si) % 250) + 20;
        ellipse(ctx, sx, sy, 1.2, 1.2, '#f8fafc', null);
      }
    }

    // 1.2 DÃY NHÀ PHÍA XA THEO LOCALE (FAR BUILDINGS)
    if (locale === 'de') {
      // Dãy nhà phố cổ Đức mái tam giác nhọn cao
      for (let i = 0; i < 4; i++) {
        const hx = i * 145 - 20;
        const hw = 140;
        const hh = 320 + (i % 2) * 50;
        const wallCol = isNight ? '#1e293b' : (i % 2 === 0 ? '#fef08a' : '#fecaca');
        drawPoly(ctx, [[hx, groundY * 0.65], [hx + hw, groundY * 0.65], [hx + hw, groundY * 0.65 - hh * 0.6], [hx, groundY * 0.65 - hh * 0.6]], wallCol, INK, 1.6);
        // Mái ngói nhọn dốc đứng
        drawPoly(ctx, [[hx - 6, groundY * 0.65 - hh * 0.6], [hx + hw + 6, groundY * 0.65 - hh * 0.6], [hx + hw * 0.5, groundY * 0.65 - hh]], isNight ? '#0f172a' : '#b91c1c', INK, 1.8);
      }
    } else if (locale === 'kr') {
      // Chung cư cao tầng hiện đại phía sau + mái ngói cong Hanok phía trước
      for (let i = 0; i < 3; i++) {
        const ax = i * 180 + 10;
        drawPoly(ctx, [[ax, groundY * 0.65], [ax + 120, groundY * 0.65], [ax + 120, 180], [ax, 180]], isNight ? '#0f172a' : '#e2e8f0', INK, 1.4);
      }
      // Mái ngói Hanok
      path(ctx, `M 60 ${groundY * 0.65} Q 288 ${groundY * 0.65 - 80} 516 ${groundY * 0.65}`, null, isNight ? '#1e293b' : '#334155', 8.0);
    } else if (locale === 'jp') {
      // Phố có mái che Shotengai & biển hiệu hình ảnh
      drawPoly(ctx, [[0, groundY * 0.65], [576, groundY * 0.65], [576, groundY * 0.5], [0, groundY * 0.5]], isNight ? '#0f172a' : '#cbd5e1', INK, 1.5);
      // Đèn lồng đỏ treo dưới mái
      for (let lx = 60; lx <= 520; lx += 90) {
        ellipse(ctx, lx, groundY * 0.55, 10, 14, '#ef4444', INK, 1.2);
      }
    } else if (locale === 'us') {
      // Khu ngoại ô nhà gỗ siding thấp thoáng sau rặng cây
      for (let i = 0; i < 3; i++) {
        const ux = i * 200 - 30;
        drawPoly(ctx, [[ux, groundY * 0.65], [ux + 160, groundY * 0.65], [ux + 160, groundY * 0.65 - 180], [ux, groundY * 0.65 - 180]], isNight ? '#1e293b' : '#f8fafc', INK, 1.5);
        drawPoly(ctx, [[ux - 8, groundY * 0.65 - 180], [ux + 168, groundY * 0.65 - 180], [ux + 80, groundY * 0.65 - 240]], isNight ? '#0f172a' : '#475569', INK, 1.8);
      }
    } else {
      // Phố hiện đại trung tính
      for (let i = 0; i < 4; i++) {
        const bx = i * 150 - 20;
        drawPoly(ctx, [[bx, groundY * 0.65], [bx + 130, groundY * 0.65], [bx + 130, 220 + (i % 2) * 60], [bx, 220 + (i % 2) * 60]], isNight ? '#1e293b' : '#e2e8f0', INK, 1.5);
      }
    }

    // 1.3 MẶT ĐƯỜNG & VỈA HÈ (GROUND & SIDEWALK)
    const groundGrad = ctx.createLinearGradient(0, groundY * 0.65, 0, 1024);
    if (isNight) {
      groundGrad.addColorStop(0, '#1e293b');
      groundGrad.addColorStop(1, '#0f172a');
    } else {
      groundGrad.addColorStop(0, '#94a3b8');
      groundGrad.addColorStop(1, '#64748b');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY * 0.65, 576, 1024 - groundY * 0.65);

    // Vỉa hè lát gạch
    drawPoly(ctx, [[0, groundY - 60], [576, groundY - 60], [576, groundY], [0, groundY]], isNight ? '#334155' : '#cbd5e1', INK, 1.8);
    for (let vx = 0; vx <= 576; vx += 45) {
      line(ctx, [[vx, groundY - 60], [vx, groundY]], isNight ? '#1e293b' : '#94a3b8', 1.2);
    }

    // Vạch qua đường cho người đi bộ (Crosswalk)
    for (let cx = 120; cx <= 456; cx += 42) {
      drawPoly(ctx, [[cx, groundY + 15], [cx + 26, groundY + 15], [cx + 26, groundY + 85], [cx, groundY + 85]], '#f8fafc', null);
    }

    // Cột đèn đường chiếu sáng
    line(ctx, [[75, groundY - 60], [75, groundY - 220]], '#475569', 5.0);
    path(ctx, `M 75 ${groundY - 220} Q 95 ${groundY - 240} 115 ${groundY - 220}`, null, '#475569', 4.0);
    ellipse(ctx, 115, groundY - 215, 12, 7, isNight ? '#fef08a' : '#e2e8f0', INK, 1.5);
    if (isNight) {
      // Vùng sáng đèn rọi xuống
      ctx.fillStyle = 'rgba(254, 240, 138, 0.15)';
      path(ctx, `M 115 ${groundY - 215} L 35 ${groundY} L 245 ${groundY} Z`, 'rgba(254, 240, 138, 0.15)', null);
    }
  }

  // -------------------------------------------------------------
  // 2. HÌNH NỀN TRONG NHÀ: drawInterior()
  // -------------------------------------------------------------
  function drawInterior(ctx, settings, t) {
    const isNight = settings.time === 'night';
    const locale = settings.locale || 'neutral';
    const groundY = 810;

    // 2.1 TƯỜNG PHÒNG
    const wallColor = isNight ? '#1e293b' : (locale === 'kr' ? '#fef3c7' : (locale === 'jp' ? '#fdf6e2' : '#f8fafc'));
    ctx.fillStyle = wallColor;
    ctx.fillRect(0, 0, 576, groundY);

    // 2.2 SÀN NHÀ THEO LOCALE
    if (locale === 'jp') {
      // Chiếu cói Tatami viền đen
      drawPoly(ctx, [[0, groundY], [576, groundY], [576, 1024], [0, 1024]], isNight ? '#713f12' : '#d97706', INK, 2.0);
      for (let tx = 0; tx <= 576; tx += 144) {
        line(ctx, [[tx, groundY], [tx, 1024]], '#1e293b', 4.0); // Nẹp viền đen tatami
      }
    } else if (locale === 'kr') {
      // Sàn sưởi Ondol gạch men vàng bóng
      drawPoly(ctx, [[0, groundY], [576, groundY], [576, 1024], [0, 1024]], isNight ? '#854d0e' : '#f59e0b', INK, 2.0);
      for (let ox = 0; ox <= 576; ox += 96) {
        line(ctx, [[ox, groundY], [ox, 1024]], '#b45309', 1.5);
      }
    } else if (locale === 'us') {
      // Thảm trải sàn màu kem / be
      ctx.fillStyle = isNight ? '#334155' : '#e2e8f0';
      ctx.fillRect(0, groundY, 576, 1024 - groundY);
      line(ctx, [[0, groundY], [576, groundY]], '#94a3b8', 2.0);
    } else {
      // Sàn ván gỗ tự nhiên (de / neutral)
      drawPoly(ctx, [[0, groundY], [576, groundY], [576, 1024], [0, 1024]], isNight ? '#451a03' : '#b45309', INK, 2.0);
      for (let px = 0; px <= 576; px += 64) {
        line(ctx, [[px, groundY], [px, 1024]], isNight ? '#292524' : '#78350f', 1.5);
      }
    }

    // 2.3 CỬA SỔ LỚN NHÌN RA NGOÀI TRỜI
    const winX = 148, winY = 220, winW = 280, winH = 240;
    // Cảnh bên ngoài cửa sổ
    ctx.fillStyle = isNight ? '#020617' : '#bae6fd';
    ctx.fillRect(winX, winY, winW, winH);

    if (!isNight) {
      // Mây trôi ngoài cửa sổ
      ellipse(ctx, winX + 80, winY + 60, 35, 18, '#ffffff', null);
      ellipse(ctx, winX + 180, winY + 85, 45, 22, '#ffffff', null);
    } else {
      // Trăng tròn ban đêm
      ellipse(ctx, winX + 200, winY + 65, 22, 22, '#fef08a', null);
    }

    // Khung cửa sổ
    if (locale === 'jp' || locale === 'kr') {
      // Khung cửa kéo Shoji / Hanji ô vuông
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3.0;
      ctx.strokeRect(winX, winY, winW, winH);
      for (let gx = winX + 35; gx < winX + winW; gx += 35) line(ctx, [[gx, winY], [gx, winY + winH]], '#78350f', 1.5);
      for (let gy = winY + 40; gy < winY + winH; gy += 40) line(ctx, [[winX, gy], [winX + winW, gy]], '#78350f', 1.5);
    } else {
      // Khung cửa kính hiện đại chữ thập
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 4.0;
      ctx.strokeRect(winX, winY, winW, winH);
      line(ctx, [[winX + winW * 0.5, winY], [winX + winW * 0.5, winY + winH]], '#475569', 3.0);
      line(ctx, [[winX, winY + winH * 0.45], [winX + winW, winY + winH * 0.45]], '#475569', 3.0);
    }

    // Đèn trần treo giữa phòng
    line(ctx, [[288, 0], [288, 85]], '#334155', 2.0);
    path(ctx, `M 268 85 L 308 85 L 318 115 L 258 115 Z`, isNight ? '#fef08a' : '#e2e8f0', INK, 1.6);
    if (isNight) {
      ellipse(ctx, 288, 115, 30, 8, 'rgba(254, 240, 138, 0.85)', null);
    }
  }

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  RemakeVector.register({
    backgrounds: {
      street: {
        label: 'Đường phố lắp ghép theo locale',
        theme: 'street',
        ground_y: 810,
        draw(ctx, settings, t, kit) {
          drawStreet(ctx, settings, t);
        }
      },
      interior: {
        label: 'Phòng trong nhà theo locale',
        theme: 'home',
        ground_y: 810,
        draw(ctx, settings, t, kit) {
          drawInterior(ctx, settings, t);
        }
      }
    }
  });

})();
