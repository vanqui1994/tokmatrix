// remake_vector_packs/farm_fun.js — Giai đoạn G: Nông trại vui nhộn & hiệu ứng hài hước
// Động tác biểu cảm (emote), dizzy, celebrate, shiver, sweat, run_away, bounce, tug, grow_fast
// 2 hình nền mới: farmyard_barn (chuồng trại/đống rơm) và village_market (chợ quê truyền thống)

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      // Node.js module loading stub
    }
    return;
  }

  const { path, line, ellipse, cylinder, volume, tone, INK, TAU, clamp, hash } = RemakeVector.kit;

  function drawPolygon(ctx, pts, fill, stroke, width = 1) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  // =========================================================================
  // 1. HÌNH NỀN MỚI: farmyard_barn và village_market (chuẩn ground_y: 810)
  // =========================================================================

  function drawFarmyardBarn(ctx, s, t) {
    const isNight = s.time === 'night';
    const skyTop = isNight ? '#0b1626' : '#92c5e8';
    const skyBot = isNight ? '#162842' : '#d2e9f7';
    const grad = ctx.createLinearGradient(0, 0, 0, 810);
    grad.addColorStop(0, skyTop);
    grad.addColorStop(1, skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 576, 810);

    if (isNight) {
      // Các ngôi sao đêm lấp lánh
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 24; i++) {
        const sx = (hash('star_x_' + i) % 560) + 8;
        const sy = (hash('star_y_' + i) % 360) + 20;
        const sr = 0.8 + ((hash('star_r_' + i) % 15) / 10);
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, TAU);
        ctx.fill();
      }
      // Vầng trăng lưỡi liềm vàng ấm
      ctx.save();
      ellipse(ctx, 480, 110, 22, 22, '#fceda4', null);
      ellipse(ctx, 472, 105, 19, 19, skyTop, null);
      ctx.restore();
    } else {
      // Đám mây trắng lững lờ trôi ban ngày
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      const cloudX = ((t * 8) % 700) - 100;
      ellipse(ctx, cloudX, 120, 48, 22, 'rgba(255, 255, 255, 0.75)', null);
      ellipse(ctx, cloudX + 32, 110, 36, 26, 'rgba(255, 255, 255, 0.8)', null);
      ellipse(ctx, cloudX - 28, 124, 32, 18, 'rgba(255, 255, 255, 0.7)', null);
      ctx.restore();
    }

    // Đồi cỏ xa chân trời
    const hillCol = isNight ? '#163220' : '#72aa5c';
    path(ctx, 'M 0 540 Q 140 480 320 520 Q 460 550 576 500 L 576 810 L 0 810 Z', hillCol, null);

    // Chuồng trại gỗ (Barn) mộc mạc phía trái / trung tâm
    const barnWall = isNight ? '#2a1b14' : '#684228';
    const barnRoof = isNight ? '#421c16' : '#a63a2c';
    const barnPlank = isNight ? '#1c120d' : '#4d2e18';

    // Thân nhà kho gỗ
    path(ctx, 'M 40 460 L 330 460 L 330 810 L 40 810 Z', barnWall, INK, 2.2);
    // Ván gỗ ghép dọc
    for (let x = 70; x < 330; x += 30) {
      line(ctx, [[x, 460], [x, 810]], barnPlank, 1.4);
    }
    // Mái dốc chuồng đỏ đất nung
    path(ctx, 'M 20 465 L 185 360 L 350 465 L 340 480 L 185 385 L 30 480 Z', barnRoof, INK, 2.4);

    // Cửa chuồng lớn chữ X
    path(ctx, 'M 90 560 L 230 560 L 230 810 L 90 810 Z', isNight ? '#1a110d' : '#3e2415', INK, 2.0);
    // Thanh giằng chữ X màu kem
    line(ctx, [[90, 560], [230, 810]], '#e2d4be', 3.0);
    line(ctx, [[90, 810], [230, 560]], '#e2d4be', 3.0);
    line(ctx, [[90, 560], [230, 560]], '#e2d4be', 2.5);
    line(ctx, [[90, 810], [230, 810]], '#e2d4be', 2.5);
    line(ctx, [[90, 560], [90, 810]], '#e2d4be', 2.5);
    line(ctx, [[230, 560], [230, 810]], '#e2d4be', 2.5);

    // Cửa sổ gác xép rơm trên cao
    path(ctx, 'M 160 415 Q 185 395 210 415 L 210 450 L 160 450 Z', '#22140c', INK, 1.8);
    // Vài cọng rơm vàng nhô ra từ cửa gác xép
    line(ctx, [[170, 450], [165, 462]], '#e8b938', 2.2);
    line(ctx, [[185, 450], [188, 466]], '#f4cb48', 2.2);
    line(ctx, [[200, 450], [205, 460]], '#dfae30', 2.2);

    // Đèn bão chuồng trại
    if (isNight) {
      // Vầng sáng vàng ấm toả ra
      ctx.save();
      const halo = ctx.createRadialGradient(250, 520, 4, 250, 520, 60);
      halo.addColorStop(0, 'rgba(255, 200, 80, 0.7)');
      halo.addColorStop(1, 'rgba(255, 180, 50, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(250, 520, 60, 0, TAU);
      ctx.fill();
      ctx.restore();
      ellipse(ctx, 250, 520, 5, 8, '#ffe27a', INK, 1.2);
    }

    // Đống rơm vàng truyền thống (straw_stack) ở phía phải
    const strawBase = isNight ? '#685020' : '#e2ab34';
    const strawHigh = isNight ? '#886c30' : '#f8cd56';
    // Đống rơm hình chóp vòm nhiều tầng
    ellipse(ctx, 460, 770, 75, 45, strawBase, INK, 2.0);
    ellipse(ctx, 460, 720, 60, 38, strawBase, INK, 1.8);
    ellipse(ctx, 460, 665, 42, 32, strawHigh, INK, 1.8);
    // Cọc tre chống tâm đống rơm
    line(ctx, [[460, 595], [460, 660]], isNight ? '#2e1c0e' : '#6d421e', 3.0);
    // Nét rơm sợi tả khối
    for (let r = 0; r < 9; r++) {
      const rx = 410 + (hash('str_x_' + r) % 100);
      const ry = 680 + (hash('str_y_' + r) % 90);
      line(ctx, [[rx, ry], [rx + (hash('str_d_' + r) % 14) - 7, ry + 12]], isNight ? '#4e3814' : '#caa028', 1.6);
    }

    // Hàng rào gỗ (wooden fence) ngang sân
    const fenceCol = isNight ? '#3a2416' : '#8c5d3a';
    line(ctx, [[320, 710], [576, 710]], fenceCol, 4.0);
    line(ctx, [[320, 750], [576, 750]], fenceCol, 4.0);
    for (let fx = 350; fx <= 560; fx += 55) {
      path(ctx, `M ${fx - 4} 680 L ${fx} 668 L ${fx + 4} 680 L ${fx + 4} 790 L ${fx - 4} 790 Z`, fenceCol, INK, 1.4);
    }

    // Mặt đất nông trại (ground_y: 810)
    const groundCol = isNight ? '#1e140d' : '#5a3d24';
    ctx.fillStyle = groundCol;
    ctx.fillRect(0, 810, 576, 214);
    line(ctx, [[0, 810], [576, 810]], INK, 2.4);

    // Các búi cỏ xanh điểm xuyết trước sân
    const grassCol = isNight ? '#1f381e' : '#4d8a38';
    for (const gx of [40, 150, 270, 390, 520]) {
      path(ctx, `M ${gx - 10} 810 Q ${gx - 6} 796 ${gx - 14} 792 Q ${gx - 2} 802 ${gx} 810 Q ${gx + 5} 794 ${gx + 12} 790 Q ${gx + 4} 802 ${gx + 10} 810 Z`, grassCol, null);
    }
  }

  function drawVillageMarket(ctx, s, t) {
    const isNight = s.time === 'night';
    const skyTop = isNight ? '#0e1828' : '#8fc3e8';
    const skyBot = isNight ? '#1e2e42' : '#f0e2ca';
    const grad = ctx.createLinearGradient(0, 0, 0, 810);
    grad.addColorStop(0, skyTop);
    grad.addColorStop(1, skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 576, 810);

    if (isNight) {
      // Bầu trời đêm chợ quê
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 20; i++) {
        const sx = (hash('vm_star_x_' + i) % 560) + 8;
        const sy = (hash('vm_star_y_' + i) % 320) + 20;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.0, 0, TAU);
        ctx.fill();
      }
    }

    // Hàng tre làng và mái ngói rêu phong xa xăm
    const farCol = isNight ? '#152418' : '#609252';
    path(ctx, 'M 0 570 Q 120 530 260 560 Q 420 530 576 565 L 576 810 L 0 810 Z', farCol, null);

    // Mái ngói cong truyền thống mờ ở phía sau
    const roofCol = isNight ? '#2a1a16' : '#9c4c36';
    path(ctx, 'M 40 540 Q 140 520 240 540 L 230 565 L 50 565 Z', roofCol, INK, 1.4);
    path(ctx, 'M 340 545 Q 440 525 540 545 L 530 570 L 350 570 Z', roofCol, INK, 1.4);

    // Cột tre và khung sạp chợ
    const bambooCol = isNight ? '#38321e' : '#c4aa64';
    const bambooNode = isNight ? '#242012' : '#8a7238';

    // Dù che nắng ngũ sắc bên trái (Ô dù chợ quê rực rỡ, không chữ)
    ctx.save();
    // Chóp dù nghiêng
    const umbrellaX1 = 150, umbrellaY1 = 510;
    // Cán dù tre nghiêng
    line(ctx, [[umbrellaX1, umbrellaY1], [umbrellaX1 + 10, 810]], bambooCol, 5.0);
    // Vòm dù xoè rộng
    const r1 = 125;
    path(ctx, `M ${umbrellaX1 - r1} ${umbrellaY1 + 35} Q ${umbrellaX1} ${umbrellaY1 - 70} ${umbrellaX1 + r1} ${umbrellaY1 + 35} Z`, isNight ? '#5a2420' : '#d84638', INK, 2.2);
    // Các dải múi dù sọc trắng kem xen kẽ
    path(ctx, `M ${umbrellaX1 - 50} ${umbrellaY1 + 33} Q ${umbrellaX1} ${umbrellaY1 - 70} ${umbrellaX1 + 50} ${umbrellaY1 + 33} Z`, isNight ? '#ded3be' : '#f8f1e2', INK, 1.8);
    path(ctx, `M ${umbrellaX1 - 20} ${umbrellaY1 + 31} Q ${umbrellaX1} ${umbrellaY1 - 70} ${umbrellaX1 + 20} ${umbrellaY1 + 31} Z`, isNight ? '#5a2420' : '#d84638', INK, 1.8);
    // Rèm dù lượn sóng
    path(ctx, `M ${umbrellaX1 - r1} ${umbrellaY1 + 35} Q ${umbrellaX1 - 60} ${umbrellaY1 + 45} ${umbrellaX1} ${umbrellaY1 + 35} Q ${umbrellaX1 + 60} ${umbrellaY1 + 45} ${umbrellaX1 + r1} ${umbrellaY1 + 35}`, null, INK, 2.0);
    ctx.restore();

    // Dù che bên phải (Màu lam ngọc / vàng kem)
    ctx.save();
    const umbrellaX2 = 430, umbrellaY2 = 530;
    line(ctx, [[umbrellaX2, umbrellaY2], [umbrellaX2 - 12, 810]], bambooCol, 5.0);
    const r2 = 115;
    path(ctx, `M ${umbrellaX2 - r2} ${umbrellaY2 + 32} Q ${umbrellaX2} ${umbrellaY2 - 60} ${umbrellaX2 + r2} ${umbrellaY2 + 32} Z`, isNight ? '#1a3c3c' : '#289288', INK, 2.2);
    path(ctx, `M ${umbrellaX2 - 45} ${umbrellaY2 + 30} Q ${umbrellaX2} ${umbrellaY2 - 60} ${umbrellaX2 + 45} ${umbrellaY2 + 30} Z`, isNight ? '#826e22' : '#f0cb46', INK, 1.8);
    ctx.restore();

    // Sạp tre bán hàng nông sản (bàn tre)
    // Sạp trái
    path(ctx, 'M 50 710 L 250 710 L 240 730 L 60 730 Z', bambooCol, INK, 2.0);
    line(ctx, [[70, 730], [60, 810]], bambooCol, 4.0);
    line(ctx, [[230, 730], [240, 810]], bambooCol, 4.0);
    // Sạp phải
    path(ctx, 'M 330 720 L 520 720 L 510 740 L 340 740 Z', bambooCol, INK, 2.0);
    line(ctx, [[350, 740], [340, 810]], bambooCol, 4.0);
    line(ctx, [[500, 740], [510, 810]], bambooCol, 4.0);

    // Dây cờ đuôi nheo ngũ sắc giăng ngang phía trên
    const flagY = 380;
    path(ctx, 'M 0 360 Q 288 420 576 360', null, INK, 1.4);
    const flagColors = ['#e54338', '#f2be34', '#3894e6', '#4ca842', '#e65cc2'];
    for (let f = 0; f < 10; f++) {
      const fx = 35 + f * 55;
      const sag = Math.sin((fx / 576) * Math.PI) * 40;
      const fy = 360 + sag;
      const col = flagColors[f % flagColors.length];
      path(ctx, `M ${fx - 14} ${fy} L ${fx + 14} ${fy} L ${fx} ${fy + 28} Z`, col, INK, 1.2);
    }

    // Các rổ tre, thúng tre đựng hoa quả rực rỡ trên sạp & mặt đất (Không chữ)
    // Rổ dưa hấu / bí đỏ trên sạp trái
    ellipse(ctx, 110, 705, 32, 14, '#9c7b44', INK, 1.6);
    ellipse(ctx, 102, 696, 12, 10, '#36883e', INK, 1.2);
    ellipse(ctx, 120, 694, 13, 11, '#e47822', INK, 1.2);

    // Rổ cà chua / táo trên sạp phải
    ellipse(ctx, 420, 715, 30, 13, '#9c7b44', INK, 1.6);
    ellipse(ctx, 412, 706, 9, 9, '#dc362c', INK, 1.0);
    ellipse(ctx, 426, 705, 9, 9, '#e44438', INK, 1.0);

    // Chùm ngô và tỏi khô treo lủng lẳng dưới mép dù
    for (let c = 0; c < 3; c++) {
      ellipse(ctx, 230 + c * 10, 545 + c * 4, 4, 9, '#f2ca38', INK, 1.0, 0.2);
      ellipse(ctx, 335 + c * 8, 560 + c * 3, 5, 6, '#f4f0e6', INK, 1.0);
    }

    // Đèn lồng treo ban đêm toả sáng
    if (isNight) {
      for (const lx of [150, 430]) {
        ctx.save();
        const halo = ctx.createRadialGradient(lx, 520, 4, lx, 520, 55);
        halo.addColorStop(0, 'rgba(255, 215, 90, 0.75)');
        halo.addColorStop(1, 'rgba(255, 180, 50, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(lx, 520, 55, 0, TAU);
        ctx.fill();
        ellipse(ctx, lx, 520, 9, 12, '#ff4a38', INK, 1.4);
        ellipse(ctx, lx, 520, 4, 6, '#fff090', null);
        ctx.restore();
      }
    }

    // Mặt đất chợ quê (ground_y: 810) - gạch lát / đất nện màu ấm
    const groundCol = isNight ? '#1e1814' : '#645446';
    ctx.fillStyle = groundCol;
    ctx.fillRect(0, 810, 576, 214);
    line(ctx, [[0, 810], [576, 810]], INK, 2.4);

    // Vài vân đá lát sàn chợ
    const stoneCol = isNight ? '#2a221c' : '#7c6c5c';
    for (let i = 0; i < 12; i++) {
      const px = (hash('stone_x_' + i) % 520) + 20;
      const py = 825 + (hash('stone_y_' + i) % 170);
      ellipse(ctx, px, py, 14, 6, stoneCol, null);
    }
  }

  // =========================================================================
  // 2. ACTION HOOKS: tug, bounce, run_away, grow_fast, shiver, sweat, dizzy, celebrate, emote
  // =========================================================================

  const farmFunActionHooks = {
    // 2.1 Kéo co tập thể (tug) nhổ củ khổng lồ
    tug(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const popAt = a.pop_at != null ? a.pop_at : (a.start + (a.end - a.start) * 0.72);
      const pullers = [a.actor, ...(a.helpers || [])];

      if (t < popAt) {
        // Giai đoạn gồng mình kéo: giật lùi nhịp nhàng đồng pha
        const cycle = (t - a.start) * 4.2;
        const heave = Math.sin(cycle);
        const lean = -14 - Math.max(0, heave) * 12; // Nghiêng người ra sau dồn lực
        const heaveX = -Math.max(0, heave) * 16;   // Giật lùi ra sau

        for (const pid of pullers) {
          const s = states[pid];
          if (!s) continue;
          s.rotation = (s.rotation || 0) + (s.flip ? -lean : lean);
          s.x += (s.flip ? -heaveX : heaveX);
          s.expression = 'worried';
        }

        // Củ cải đích rung rinh quằn quại trong lòng đất
        const tgt = states[a.target];
        if (tgt) {
          tgt.x += Math.sin(t * 36) * 2.2;
          tgt.expression = 'worried';
        }
      } else {
        // Giai đoạn CỦ BẬT LÊN (POP) và CẢ ĐOÀN NGÃ NGỬA VUI NHỘN
        const tAfter = t - popAt;
        const popDuration = Math.max(0.3, (a.end - popAt) * 0.4);
        const popP = Math.min(1, tAfter / popDuration);

        // Củ cải vọt mạnh lên khỏi mặt đất
        const tgt = states[a.target];
        if (tgt) {
          const jumpH = (a.lift_amount || 170) * Math.sin(popP * Math.PI * 0.5);
          tgt.lift = (tgt.lift || 0) + jumpH;
          tgt.rotation = (tgt.rotation || 0) + 16 * popP;
          tgt.expression = 'surprised';
        }

        // Cả đoàn ngã ngửa ra đất
        const fallAngle = -46 * popP;
        const fallY = 46 * popP;
        const fallX = -34 * popP;

        for (const pid of pullers) {
          const s = states[pid];
          if (!s) continue;
          s.rotation = (s.rotation || 0) + (s.flip ? -fallAngle : fallAngle);
          s.y += fallY;
          s.x += (s.flip ? -fallX : fallX);
          s.expression = 'surprised';
        }
      }
    },

    // 2.2 Nhún nhảy theo nhịp (bounce)
    bounce(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.y -= Math.abs(Math.sin(p * Math.PI * 6)) * 26;
        s.rotation = (s.rotation || 0) + Math.sin(p * Math.PI * 6) * 7;
      }
    },

    // 2.3 Chạy thục mạng tóe khói bụi (run_away)
    run_away(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.running_away = true;
        const dir = s.flip ? -1 : 1;
        s.x += dir * p * 220;
        s.rotation = (s.rotation || 0) + (s.flip ? 14 : -14);
        s.y -= Math.abs(Math.sin(p * Math.PI * 10)) * 14;
      }
    },

    // 2.4 Lớn nhanh như thổi kèm lấp lánh (grow_fast)
    grow_fast(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const tgt = states[a.target || a.actor];
      if (tgt) {
        tgt.growth = Math.min(1.0, Math.max(0.1, p * 1.25));
        tgt.growing_fast = true;
      }
    },

    // 2.5 Run rẩy vì lạnh (shiver)
    shiver(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.x += Math.sin(t * 42) * 3.2;
      }
    },

    // 2.6 Toát mồ hôi vì nóng hoặc hoảng sợ (sweat)
    sweat(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.sweating = true;
      }
    },

    // 2.7 Choáng váng sao xoay (dizzy)
    dizzy(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.dizzy = true;
        s.expression = 'dizzy';
      }
    },

    // 2.8 Ăn mừng pháo hoa giấy (celebrate)
    celebrate(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.celebrating = true;
        s.expression = 'happy';
      }
    },

    // 2.9 Bong bóng biểu cảm hoạt hình (emote)
    emote(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.emote = a.emote || a.symbol || 'heart';
      }
    },
  };

  // =========================================================================
  // 3. HIỆU ỨNG HÌNH ẢNH (CUSTOM EFFECTS): Confetti, Emote Bubble, Dizzy Stars, Dust, Sparkles
  // =========================================================================

  function farmFunCustomEffects(ctx, snapshot, cat, kit) {
    const { path, line, ellipse, INK, TAU, clamp, hash } = kit;

    // 3.1 Ăn mừng pháo hoa giấy kim tuyến (celebrate confetti)
    const hasCelebrate = snapshot.actions.some(a => a.active && a.type === 'celebrate') ||
                         Object.values(snapshot.states).some(s => s.celebrating || s.celebrate);
    if (hasCelebrate) {
      ctx.save();
      const colors = ['#f44336', '#e91e63', '#9c27b0', '#2196f3', '#4caf50', '#ffeb3b', '#ff9800', '#00bcd4'];
      for (let i = 0; i < 48; i++) {
        const xSeed = (hash('confetti_x_' + i) % 576);
        const speed = 120 + (hash('confetti_s_' + i) % 90);
        const y = (((snapshot.t * speed + hash('confetti_y_' + i) % 1024) % 1100) - 50);
        const sway = Math.sin(snapshot.t * 3.5 + i * 1.2) * 24;
        const col = colors[i % colors.length];
        const rot = snapshot.t * 4 + i;
        const w = 9 + (i % 6);
        const h = 5 + (i % 5);

        ctx.save();
        ctx.translate(xSeed + sway, y);
        ctx.rotate(rot);
        ctx.fillStyle = col;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
      ctx.restore();
    }

    // 3.2 Hiệu ứng trên từng nhân vật: emote, dizzy, sweat, dust, sparkles
    for (const [id, s] of Object.entries(snapshot.states)) {
      if (!s || s.opacity <= 0.01) continue;

      // (A) Bong bóng biểu cảm hoạt hình (emote)
      const emoteType = s.emote || snapshot.actions.find(a => a.active && a.actor === id && a.type === 'emote')?.emote;
      if (emoteType) {
        ctx.save();
        const topPos = RemakeVector.worldAnchor(cat, s, 'top') || { x: s.x, y: s.y - s.height };
        const bx = topPos.x, by = topPos.y - 42;

        // Nhún nảy nhẹ theo thời gian
        const bounceY = Math.sin(snapshot.t * 8) * 3;

        // Bong bóng thoại trắng bo tròn
        path(ctx, `M ${bx - 24} ${by + bounceY} Q ${bx - 24} ${by - 24 + bounceY} ${bx} ${by - 24 + bounceY} Q ${bx + 24} ${by - 24 + bounceY} ${bx + 24} ${by + bounceY} Q ${bx + 24} ${by + 20 + bounceY} ${bx + 6} ${by + 20 + bounceY} L ${bx} ${by + 30 + bounceY} L ${bx - 2} ${by + 20 + bounceY} Q ${bx - 24} ${by + 20 + bounceY} ${bx - 24} ${by + bounceY} Z`, '#ffffff', INK, 2.0);

        // Biểu tượng bên trong
        if (emoteType === 'heart') {
          // Trái tim đập nhịp
          const pulse = 1 + Math.sin(snapshot.t * 10) * 0.15;
          ctx.save();
          ctx.translate(bx, by - 2 + bounceY);
          ctx.scale(pulse, pulse);
          path(ctx, 'M 0 -2 C -2 -8 -11 -8 -11 -2 C -11 4 0 10 0 12 C 0 10 11 4 11 -2 C 11 -8 2 -8 0 -2 Z', '#e92634', null);
          ctx.restore();
        } else if (emoteType === '?' || emoteType === 'question') {
          // Dấu chấm hỏi vàng cong
          ctx.save();
          ctx.translate(bx, by - 2 + bounceY);
          path(ctx, 'M -5 -9 C -5 -15 6 -15 6 -8 C 6 -3 0 -2 0 3', null, '#d49e18', 3.4);
          ellipse(ctx, 0, 8, 2.5, 2.5, '#d49e18', null);
          ctx.restore();
        } else if (emoteType === '!' || emoteType === 'exclamation') {
          // Dấu chấm than đỏ giật nảy
          ctx.save();
          ctx.translate(bx, by - 2 + bounceY);
          line(ctx, [[0, -11], [0, 3]], '#d42828', 4.0);
          ellipse(ctx, 0, 8, 2.6, 2.6, '#d42828', null);
          ctx.restore();
        } else if (emoteType === 'zzz' || emoteType === 'sleep') {
          // Ba chữ Z trôi nổi
          ctx.save();
          ctx.translate(bx, by + bounceY);
          path(ctx, 'M -7 -8 L -1 -8 L -7 -2 L -1 -2', null, '#6d3ebd', 2.0);
          path(ctx, 'M 2 -4 L 6 -4 L 2 0 L 6 0', null, '#8b5ce8', 1.8);
          path(ctx, 'M -2 4 L 3 4 L -2 9 L 3 9', null, '#a886f4', 1.5);
          ctx.restore();
        } else if (emoteType === 'angry') {
          // Ký hiệu 4 cung tức giận (anime rage)
          ctx.save();
          ctx.translate(bx, by - 2 + bounceY);
          for (let rot = 0; rot < 4; rot++) {
            ctx.save();
            ctx.rotate(rot * Math.PI / 2);
            path(ctx, 'M 3 3 L 8 3 Q 8 8 3 8 Z', '#dc2828', INK, 1.2);
            ctx.restore();
          }
          ctx.restore();
        } else if (emoteType === 'music') {
          // Nốt nhạc nhún nhảy
          ctx.save();
          ctx.translate(bx, by - 2 + bounceY);
          ellipse(ctx, -5, 6, 4, 3, '#2a70d8', null, -0.3);
          ellipse(ctx, 5, 3, 4, 3, '#2a70d8', null, -0.3);
          line(ctx, [[-2, 6], [-2, -8]], '#2a70d8', 2.2);
          line(ctx, [[8, 3], [8, -11]], '#2a70d8', 2.2);
          line(ctx, [[-2, -8], [8, -11]], '#2a70d8', 3.0);
          ctx.restore();
        } else if (emoteType === 'idea') {
          // Bóng đèn ý tưởng vàng sáng
          ctx.save();
          ctx.translate(bx, by - 2 + bounceY);
          ellipse(ctx, 0, -4, 9, 9, '#f4ca28', INK, 1.4);
          path(ctx, 'M -4 4 L 4 4 L 3 8 L -3 8 Z', '#929aa4', INK, 1.2);
          // Tia sáng toả
          for (let a = 0; a < 6; a++) {
            const rad = a * TAU / 6;
            line(ctx, [[Math.cos(rad) * 11, Math.sin(rad) * 11 - 4], [Math.cos(rad) * 16, Math.sin(rad) * 16 - 4]], '#eab81c', 1.8);
          }
          ctx.restore();
        } else if (emoteType === 'sweat') {
          // Giọt mồ hôi xanh ngọc
          ctx.save();
          ctx.translate(bx, by - 2 + bounceY);
          path(ctx, 'M 0 -9 C 5 -3 7 4 3 8 C -1 11 -8 8 -8 3 C -8 -2 0 -9 0 -9 Z', '#4ac4ec', INK, 1.4);
          ellipse(ctx, -3, 3, 2, 3, '#ffffff', null, -0.3);
          ctx.restore();
        }
        ctx.restore();
      }

      // (B) Sao xoay quanh đầu (dizzy stars)
      if (s.dizzy || snapshot.actions.some(a => a.active && a.actor === id && a.type === 'dizzy')) {
        ctx.save();
        const topPos = RemakeVector.worldAnchor(cat, s, 'top') || { x: s.x, y: s.y - s.height };
        const cx = topPos.x, cy = topPos.y - 12;
        const starCount = 3;
        for (let i = 0; i < starCount; i++) {
          const ang = snapshot.t * 5 + i * (TAU / starCount);
          const sx = cx + Math.cos(ang) * 26;
          const sy = cy + Math.sin(ang) * 9;
          // Vẽ ngôi sao 5 cánh vàng óng
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(snapshot.t * 3 + i);
          const pts = [];
          for (let p = 0; p < 10; p++) {
            const r = p % 2 === 0 ? 7 : 3.2;
            const a = p * Math.PI / 5;
            pts.push([Math.cos(a) * r, Math.sin(a) * r]);
          }
          drawPolygon(ctx, pts, '#f6cb32', INK, 1.2);
          ctx.restore();
        }
        ctx.restore();
      }

      // (C) Chạy thục mạng tóe khói bụi (run_away dust)
      if (s.running_away || snapshot.actions.some(a => a.active && a.actor === id && a.type === 'run_away')) {
        ctx.save();
        const rootPos = RemakeVector.worldAnchor(cat, s, 'root') || { x: s.x, y: s.y };
        const dir = s.flip ? 1 : -1; // Bụi bay ngược hướng chạy
        for (let c = 0; c < 3; c++) {
          const age = ((snapshot.t * 4 + c * 0.33) % 1);
          const dx = dir * (15 + age * 40 + c * 10);
          const dy = -age * 18 - 4;
          const r = 5 + age * 16;
          ctx.globalAlpha = (1 - age) * 0.7;
          ellipse(ctx, rootPos.x + dx, rootPos.y + dy, r, r * 0.75, '#e4dcd2', '#baaca0', 1.0);
        }
        ctx.restore();
      }

      // (D) Lớn nhanh lấp lánh (grow_fast sparkles)
      if (s.growing_fast || snapshot.actions.some(a => a.active && (a.target === id || a.actor === id) && a.type === 'grow_fast')) {
        ctx.save();
        const cx = s.x, cy = s.y - s.height * 0.5;
        for (let sp = 0; sp < 4; sp++) {
          const age = ((snapshot.t * 3 + sp * 0.25) % 1);
          const ang = sp * (TAU / 4) + snapshot.t * 2;
          const dist = 30 + age * 45;
          const sx = cx + Math.cos(ang) * dist;
          const sy = cy + Math.sin(ang) * dist * 0.8;
          ctx.globalAlpha = Math.sin(age * Math.PI);
          // Ngôi sao lấp lánh 4 tia
          line(ctx, [[sx - 9, sy], [sx + 9, sy]], '#ffd740', 2.0);
          line(ctx, [[sx, sy - 9], [sx, sy + 9]], '#ffd740', 2.0);
          ellipse(ctx, sx, sy, 3, 3, '#ffffff', null);
        }
        ctx.restore();
      }
    }
  }

  // =========================================================================
  // 4. ĐĂNG KÝ VÀO REMAKE VECTOR ENGINE QUA RemakeVector.register
  // =========================================================================

  RemakeVector.register({
    backgrounds: {
      farmyard_barn: {
        label: 'Sân chuồng nông trại',
        theme: 'farm',
        ground_y: 810,
        draw: drawFarmyardBarn,
      },
      village_market: {
        label: 'Chợ quê truyền thống',
        theme: 'market',
        ground_y: 810,
        draw: drawVillageMarket,
      },
    },
    effects: farmFunCustomEffects,
    actionHooks: farmFunActionHooks,
  });

})();
