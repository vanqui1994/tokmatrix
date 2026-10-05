// remake_vector_packs/modular_scenes.js — Giai đoạn J: Hình nền lắp ghép theo locale (drawStreet, drawInterior)
// Cung cấp 2 hình nền lắp ghép: "street" và "interior" hỗ trợ 5 locale: de, us, kr, jp, neutral.
// ground_y: 810, hỗ trợ chế độ ngày/đêm, zero-text (không chứa chữ).
// Khổ ngang (plan docs/PLAN_vector_widescreen.md §4): bề rộng lấy từ kit.frameW(settings); phần 0–576 vẽ
// y hệt khổ dọc, phần mở rộng thêm nhà / đèn / cây / cửa sổ / cửa bằng kit.spread (tất định).

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') throw new Error('RemakeVector core engine must be loaded before engine packs.');

  const { path, line, ellipse, cylinder, taper, volume, tone, limb, mitten, INK, TAU, clamp, hash, smooth, mix, frameW, spread, tileX, seeded, PANEL } = RemakeVector.kit;

  function drawPoly(ctx, pts, fill, stroke, width = 1) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  // Cột đèn đường (cột ở x, tay đèn vươn sang phải 40 px) — dùng cho cột gốc và các cột ở phần mở rộng.
  function streetLamp(ctx, x, groundY, isNight) {
    line(ctx, [[x, groundY - 60], [x, groundY - 220]], '#475569', 5.0);
    path(ctx, `M ${x} ${groundY - 220} Q ${x + 20} ${groundY - 240} ${x + 40} ${groundY - 220}`, null, '#475569', 4.0);
    ellipse(ctx, x + 40, groundY - 215, 12, 7, isNight ? '#fef08a' : '#e2e8f0', INK, 1.5);
    if (isNight) {
      // Vùng sáng đèn rọi xuống
      ctx.fillStyle = 'rgba(254, 240, 138, 0.15)';
      path(ctx, `M ${x + 40} ${groundY - 215} L ${x - 40} ${groundY} L ${x + 170} ${groundY} Z`, 'rgba(254, 240, 138, 0.15)', null);
    }
  }
  // Cây trong bồn trên vỉa hè (chỉ ở phần mở rộng của khổ ngang).
  function sidewalkTree(ctx, x, groundY, isNight, k) {
    const crown = isNight ? '#1f3d2c' : '#4f9a4a', dark = isNight ? '#173022' : '#3c7d3a';
    path(ctx, `M ${x - 6} ${groundY - 40} L ${x - 4} ${groundY - 150 * k} L ${x + 4} ${groundY - 150 * k} L ${x + 6} ${groundY - 40} Z`, isNight ? '#3a2a1e' : '#7a5232', INK, 1.4);
    for (const [dx, dy, r] of [[-30, 150, 34], [30, 154, 36], [0, 190, 42]]) ellipse(ctx, x + dx * k, groundY - dy * k, r * k, r * .86 * k, dark, INK, 1.4);
    ellipse(ctx, x - 8 * k, groundY - 196 * k, 18 * k, 14 * k, crown, null);
    drawPoly(ctx, [[x - 26, groundY - 40], [x + 26, groundY - 40], [x + 22, groundY - 18], [x - 22, groundY - 18]], isNight ? '#334155' : '#94a3b8', INK, 1.4);
  }

  // -------------------------------------------------------------
  // 1. HÌNH NỀN ĐƯỜNG PHỐ: drawStreet()
  // -------------------------------------------------------------
  function drawStreet(ctx, settings, t) {
    const isNight = settings.time === 'night';
    const locale = settings.locale || 'neutral';
    const groundY = 810;
    const w = frameW(settings), ext = Math.max(0, w - PANEL);

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
    ctx.fillRect(0, 0, w, groundY);

    if (isNight) {
      // Sao đêm lấp lánh tất định (mỗi ô 576 px một bộ seed; ô 0 y hệt khổ dọc)
      tileX(w, PANEL, (ox, p) => {
        for (let si = 0; si < 20; si++) {
          const key = p ? `${p}_${si}` : si;
          const sx = ox + (hash('street_star_x_' + key) % 550) + 13;
          const sy = (hash('street_star_y_' + key) % 250) + 20;
          ellipse(ctx, sx, sy, 1.2, 1.2, '#f8fafc', null);
        }
      });
    }

    // 1.2 DÃY NHÀ PHÍA XA THEO LOCALE (FAR BUILDINGS)
    // Khổ ngang: số nhà = số gốc + số nhà phủ phần mở rộng; nhà thêm có độ cao / màu theo seed chỉ số.
    if (locale === 'de') {
      // Dãy nhà phố cổ Đức mái tam giác nhọn cao
      const walls = ['#fef08a', '#fecaca', '#bfdbfe', '#d9f99d', '#fed7aa'];
      for (let i = 0; i < 4 + Math.ceil(ext / 145); i++) {
        const hx = i * 145 - 20;
        const hw = 140;
        const hh = i < 4 ? 320 + (i % 2) * 50 : 300 + Math.round(seeded('st-de-h:' + i) * 100);
        const wallCol = isNight ? '#1e293b' : (i < 4 ? (i % 2 === 0 ? '#fef08a' : '#fecaca') : walls[Math.floor(seeded('st-de-c:' + i) * walls.length)]);
        drawPoly(ctx, [[hx, groundY * 0.65], [hx + hw, groundY * 0.65], [hx + hw, groundY * 0.65 - hh * 0.6], [hx, groundY * 0.65 - hh * 0.6]], wallCol, INK, 1.6);
        // Mái ngói nhọn dốc đứng
        drawPoly(ctx, [[hx - 6, groundY * 0.65 - hh * 0.6], [hx + hw + 6, groundY * 0.65 - hh * 0.6], [hx + hw * 0.5, groundY * 0.65 - hh]], isNight ? '#0f172a' : '#b91c1c', INK, 1.8);
      }
    } else if (locale === 'kr') {
      // Chung cư cao tầng hiện đại phía sau + mái ngói cong Hanok phía trước
      for (let i = 0; i < 3 + Math.ceil(ext / 180); i++) {
        const ax = i * 180 + 10;
        const top = i < 3 ? 180 : 150 + Math.round(seeded('st-kr-h:' + i) * 90);
        drawPoly(ctx, [[ax, groundY * 0.65], [ax + 120, groundY * 0.65], [ax + 120, top], [ax, top]], isNight ? '#0f172a' : '#e2e8f0', INK, 1.4);
      }
      // Mái ngói Hanok
      path(ctx, `M 60 ${groundY * 0.65} Q 288 ${groundY * 0.65 - 80} 516 ${groundY * 0.65}`, null, isNight ? '#1e293b' : '#334155', 8.0);
      spread(Math.round(ext / 520), ext, 230, 'st-kr-roof').forEach((x0, i) => {
        const x = PANEL + x0, half = 170 + seeded('st-kr-rw:' + i) * 40;
        path(ctx, `M ${x - half} ${groundY * 0.65} Q ${x} ${groundY * 0.65 - 70} ${x + half} ${groundY * 0.65}`, null, isNight ? '#1e293b' : '#334155', 8.0);
      });
    } else if (locale === 'jp') {
      // Phố có mái che Shotengai & biển hiệu hình ảnh
      drawPoly(ctx, [[0, groundY * 0.65], [w, groundY * 0.65], [w, groundY * 0.5], [0, groundY * 0.5]], isNight ? '#0f172a' : '#cbd5e1', INK, 1.5);
      // Đèn lồng đỏ treo dưới mái
      for (let lx = 60; lx <= w - 56; lx += 90) {
        ellipse(ctx, lx, groundY * 0.55, 10, 14, '#ef4444', INK, 1.2);
      }
      // Khổ ngang: rèm cửa hàng (noren, không chữ) dưới mái che ở phần mở rộng
      spread(Math.round(ext / 300), ext, 110, 'st-jp-noren').forEach((x0, i) => {
        const x = PANEL + x0, col = ['#1e3a8a', '#991b1b', '#3f6212'][i % 3];
        for (let k = 0; k < 3; k++) drawPoly(ctx, [[x - 45 + k * 31, groundY * 0.65], [x - 17 + k * 31, groundY * 0.65], [x - 17 + k * 31, groundY * 0.65 + 70], [x - 45 + k * 31, groundY * 0.65 + 70]], isNight ? tone(col, -.3) : col, INK, 1.2);
        ellipse(ctx, x, groundY * 0.65 + 34, 10, 10, '#f8fafc', null);
      });
    } else if (locale === 'us') {
      // Khu ngoại ô nhà gỗ siding thấp thoáng sau rặng cây
      const sidings = ['#f8fafc', '#dbeafe', '#fef3c7', '#dcfce7'];
      for (let i = 0; i < 3 + Math.ceil(ext / 200); i++) {
        const ux = i * 200 - 30;
        const uh = i < 3 ? 180 : 160 + Math.round(seeded('st-us-h:' + i) * 40);
        const siding = isNight ? '#1e293b' : (i < 3 ? '#f8fafc' : sidings[Math.floor(seeded('st-us-c:' + i) * sidings.length)]);
        drawPoly(ctx, [[ux, groundY * 0.65], [ux + 160, groundY * 0.65], [ux + 160, groundY * 0.65 - uh], [ux, groundY * 0.65 - uh]], siding, INK, 1.5);
        drawPoly(ctx, [[ux - 8, groundY * 0.65 - uh], [ux + 168, groundY * 0.65 - uh], [ux + 80, groundY * 0.65 - uh - 60]], isNight ? '#0f172a' : '#475569', INK, 1.8);
      }
    } else {
      // Phố hiện đại trung tính
      for (let i = 0; i < 4 + Math.ceil(ext / 150); i++) {
        const bx = i * 150 - 20;
        const top = i < 4 ? 220 + (i % 2) * 60 : 180 + Math.round(seeded('st-n-h:' + i) * 120);
        drawPoly(ctx, [[bx, groundY * 0.65], [bx + 130, groundY * 0.65], [bx + 130, top], [bx, top]], isNight ? '#1e293b' : '#e2e8f0', INK, 1.5);
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
    ctx.fillRect(0, groundY * 0.65, w, 1024 - groundY * 0.65);

    // Vỉa hè lát gạch
    drawPoly(ctx, [[0, groundY - 60], [w, groundY - 60], [w, groundY], [0, groundY]], isNight ? '#334155' : '#cbd5e1', INK, 1.8);
    for (let vx = 0; vx <= w; vx += 45) {
      line(ctx, [[vx, groundY - 60], [vx, groundY]], isNight ? '#1e293b' : '#94a3b8', 1.2);
    }

    // Vạch qua đường cho người đi bộ (Crosswalk)
    for (let cx = 120; cx <= 456; cx += 42) {
      drawPoly(ctx, [[cx, groundY + 15], [cx + 26, groundY + 15], [cx + 26, groundY + 85], [cx, groundY + 85]], '#f8fafc', null);
    }

    // Cột đèn đường chiếu sáng
    streetLamp(ctx, 75, groundY, isNight);
    // Khổ ngang: vạch giữa đường đứt khúc, cột đèn và cây trong bồn xen kẽ trên vỉa hè ở phần mở rộng
    if (ext > 0) {
      tileX(w, 120, x => drawPoly(ctx, [[x, groundY + 102], [x + 60, groundY + 102], [x + 60, groundY + 110], [x, groundY + 110]], isNight ? '#a8a29e' : '#f8fafc', null), PANEL + 30);
      spread(Math.round(ext / 210), ext, 80, 'st-furniture').forEach((x0, i) => {
        if (i % 2 === 0) streetLamp(ctx, PANEL + x0, groundY, isNight);
        else sidewalkTree(ctx, PANEL + x0, groundY, isNight, .9 + seeded('st-tree-k:' + i) * .25);
      });
    }
  }

  // Cửa sổ lớn nhìn ra ngoài trời (cửa sổ gốc và cửa sổ thêm ở phần mở rộng dùng chung).
  function drawWindow(ctx, winX, winY, winW, winH, isNight, locale) {
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
  }
  // Đèn trần treo (đèn gốc ở giữa khung dọc; khổ ngang thêm đèn trên cửa sổ mới).
  function ceilingLamp(ctx, x, isNight) {
    line(ctx, [[x, 0], [x, 85]], '#334155', 2.0);
    path(ctx, `M ${x - 20} 85 L ${x + 20} 85 L ${x + 30} 115 L ${x - 30} 115 Z`, isNight ? '#fef08a' : '#e2e8f0', INK, 1.6);
    if (isNight) {
      ellipse(ctx, x, 115, 30, 8, 'rgba(254, 240, 138, 0.85)', null);
    }
  }
  // Cửa ra vào (jp/kr: cửa kéo ô giấy; còn lại: cửa gỗ có tay nắm) — chỉ ở phần mở rộng.
  function drawDoor(ctx, x, groundY, isNight, locale) {
    const x0 = x - 62, top = groundY - 300;
    if (locale === 'jp' || locale === 'kr') {
      drawPoly(ctx, [[x0, top], [x0 + 124, top], [x0 + 124, groundY], [x0, groundY]], isNight ? '#3f3a2e' : '#fdf6e2', '#78350f', 3.0);
      for (let gx = x0 + 31; gx < x0 + 124; gx += 31) line(ctx, [[gx, top], [gx, groundY]], '#78350f', 1.5);
      for (let gy = top + 50; gy < groundY; gy += 50) line(ctx, [[x0, gy], [x0 + 124, gy]], '#78350f', 1.5);
    } else {
      drawPoly(ctx, [[x0 - 8, top - 8], [x0 + 132, top - 8], [x0 + 132, groundY], [x0 - 8, groundY]], isNight ? '#334155' : '#cbd5e1', INK, 1.6);
      drawPoly(ctx, [[x0, top], [x0 + 124, top], [x0 + 124, groundY], [x0, groundY]], isNight ? '#422006' : '#92400e', INK, 2.0);
      for (const [y0, y1] of [[top + 20, top + 130], [top + 160, groundY - 24]]) drawPoly(ctx, [[x0 + 16, y0], [x0 + 108, y0], [x0 + 108, y1], [x0 + 16, y1]], null, isNight ? '#2a1404' : '#78350f', 2.0);
      ellipse(ctx, x0 + 104, groundY - 150, 6, 6, '#eab308', INK, 1.2);
    }
  }
  // Tranh phong cảnh trừu tượng (không chữ) và chậu cây đặt sàn — chỉ ở phần mở rộng.
  function drawPictureAndPlant(ctx, x, groundY, isNight) {
    drawPoly(ctx, [[x - 80, 230], [x + 80, 230], [x + 80, 350], [x - 80, 350]], isNight ? '#1e293b' : '#e0f2fe', '#78350f', 5.0);
    drawPoly(ctx, [[x - 76, 346], [x - 30, 280], [x + 6, 318], [x + 34, 290], [x + 76, 346]], isNight ? '#14532d' : '#4ade80', null);
    ellipse(ctx, x + 44, 262, 12, 12, isNight ? '#fef08a' : '#fbbf24', null);
    const potX = x + 150;
    for (let k = 0; k < 5; k++) path(ctx, `M ${potX} ${groundY - 60} Q ${potX - 40 + k * 20} ${groundY - 130} ${potX - 50 + k * 25} ${groundY - 160 + (k % 2) * 25}`, null, isNight ? '#166534' : '#22c55e', 6);
    drawPoly(ctx, [[potX - 30, groundY - 60], [potX + 30, groundY - 60], [potX + 22, groundY], [potX - 22, groundY]], isNight ? '#7c2d12' : '#c2410c', INK, 1.6);
  }

  // -------------------------------------------------------------
  // 2. HÌNH NỀN TRONG NHÀ: drawInterior()
  // -------------------------------------------------------------
  function drawInterior(ctx, settings, t) {
    const isNight = settings.time === 'night';
    const locale = settings.locale || 'neutral';
    const groundY = 810;
    const w = frameW(settings), ext = Math.max(0, w - PANEL);

    // 2.1 TƯỜNG PHÒNG
    const wallColor = isNight ? '#1e293b' : (locale === 'kr' ? '#fef3c7' : (locale === 'jp' ? '#fdf6e2' : '#f8fafc'));
    ctx.fillStyle = wallColor;
    ctx.fillRect(0, 0, w, groundY);

    // 2.2 SÀN NHÀ THEO LOCALE
    if (locale === 'jp') {
      // Chiếu cói Tatami viền đen
      drawPoly(ctx, [[0, groundY], [w, groundY], [w, 1024], [0, 1024]], isNight ? '#713f12' : '#d97706', INK, 2.0);
      for (let tx = 0; tx <= w; tx += 144) {
        line(ctx, [[tx, groundY], [tx, 1024]], '#1e293b', 4.0); // Nẹp viền đen tatami
      }
    } else if (locale === 'kr') {
      // Sàn sưởi Ondol gạch men vàng bóng
      drawPoly(ctx, [[0, groundY], [w, groundY], [w, 1024], [0, 1024]], isNight ? '#854d0e' : '#f59e0b', INK, 2.0);
      for (let ox = 0; ox <= w; ox += 96) {
        line(ctx, [[ox, groundY], [ox, 1024]], '#b45309', 1.5);
      }
    } else if (locale === 'us') {
      // Thảm trải sàn màu kem / be
      ctx.fillStyle = isNight ? '#334155' : '#e2e8f0';
      ctx.fillRect(0, groundY, w, 1024 - groundY);
      line(ctx, [[0, groundY], [w, groundY]], '#94a3b8', 2.0);
    } else {
      // Sàn ván gỗ tự nhiên (de / neutral)
      drawPoly(ctx, [[0, groundY], [w, groundY], [w, 1024], [0, 1024]], isNight ? '#451a03' : '#b45309', INK, 2.0);
      for (let px = 0; px <= w; px += 64) {
        line(ctx, [[px, groundY], [px, 1024]], isNight ? '#292524' : '#78350f', 1.5);
      }
    }

    // 2.3 CỬA SỔ LỚN NHÌN RA NGOÀI TRỜI
    drawWindow(ctx, 148, 220, 280, 240, isNight, locale);

    // Đèn trần treo giữa phòng
    ceilingLamp(ctx, 288, isNight);

    // Khổ ngang: phần mở rộng có cửa ra vào, cửa sổ thứ hai (kèm đèn trần) và tranh + chậu cây.
    if (ext >= 600) {
      const [doorX, windowX, pictureX] = spread(3, ext, 150, 'interior-ext').map(x => PANEL + x);
      drawDoor(ctx, doorX, groundY, isNight, locale);
      drawWindow(ctx, windowX - 120, 220, 240, 240, isNight, locale);
      ceilingLamp(ctx, windowX, isNight);
      drawPictureAndPlant(ctx, pictureX - 60, groundY, isNight);
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
