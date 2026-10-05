// remake_vector_packs/farm_fun.js — Giai đoạn G: Nông trại vui nhộn & hiệu ứng hài hước
// Động tác biểu cảm (emote), dizzy, celebrate, shiver, sweat, run_away, bounce, tug, grow_fast
// 2 hình nền mới: farmyard_barn (chuồng trại/đống rơm) và village_market (chợ quê truyền thống)

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('farm_fun pack: RemakeVector core engine chưa được nạp.');
  }

  const { path, line, ellipse, INK, TAU, clamp, hash, smooth, mix, frameW, frameSpan, spread, tileX, seeded, PANEL } = RemakeVector.kit;
  const HANDED = new Set(['human', 'chibi']);

  // tug: điểm người/thú phía sau nắm vào (người/chibi: thắt lưng, thú: đuôi).
  function grabPoint(cat, s) {
    const anchors = cat.assets[s.asset].anchors;
    const name = ['waist', 'hip', 'tail', 'back'].find(n => anchors[n]) || 'root';
    return RemakeVector.worldAnchor(cat, s, name);
  }
  // Đặt một người kéo vào chuỗi: người/chibi đứng cách điểm nắm một tầm tay và IK hai tay tới đó;
  // thú không có tay thì ngậm bằng miệng: xoay thân (≤ 35°) cho miệng ngang tầm, trượt ngang cho miệng chạm,
  // phần còn thiếu thì nhấc cả thân (treo lủng lẳng như chú chuột níu đuôi mèo).
  function joinChain(cat, s, grab, dir) {
    const group = cat.assets[s.asset].group;
    if (HANDED.has(group)) {
      s.x = grab.x + dir * s.height * (group === 'chibi' ? .2 : .26);
      for (const side of ['hand_l', 'hand_r']) {
        const local = RemakeVector.worldToLocal(s, { x: grab.x, y: grab.y + (side === 'hand_l' ? -2 : 2) });
        s[`${side}_x`] = local[0]; s[`${side}_y`] = local[1];
      }
      return;
    }
    const mouth = cat.assets[s.asset].anchors.mouth ? 'mouth' : 'face';
    let best = s.rotation || 0, gap = Infinity;
    for (let r = -35; r <= 35; r += 1) {
      const q = RemakeVector.worldAnchor(cat, { ...s, rotation: (s.rotation || 0) + r }, mouth);
      if (Math.abs(q.y - grab.y) < gap) { gap = Math.abs(q.y - grab.y); best = (s.rotation || 0) + r; }
    }
    s.rotation = best;
    const q = RemakeVector.worldAnchor(cat, s, mouth);
    s.x += grab.x - q.x; s.y += grab.y - q.y;
  }

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

  // Đồi cỏ tiếp nối phần mở rộng của khổ ngang (từ x0 tới w), đỉnh đồi tất định theo seed.
  function extendHills(ctx, x0, y0, w, base, color, seed, lo, hi) {
    if (w <= x0) return;
    let d = `M ${x0} ${y0}`, x = x0;
    for (let i = 0; x < w; i++) {
      const seg = 240 + seeded(`${seed}:w${i}`) * 120, nx = x + seg, peak = lo + seeded(`${seed}:h${i}`) * (hi - lo);
      d += ` Q ${x + seg * .5} ${peak - 34} ${nx} ${peak}`;
      x = nx;
    }
    path(ctx, `${d} L ${x} ${base} L ${x0} ${base} Z`, color, null);
  }

  // Các vật thêm ở phần mở rộng của sân chuồng (khổ ngang).
  function drawSilo(ctx, cx, isNight) {
    const body = isNight ? '#4a4844' : '#c4bcae', band = isNight ? '#35332f' : '#9c9486', dome = isNight ? '#3c454c' : '#8d9aa4';
    path(ctx, `M ${cx - 46} 812 L ${cx - 46} 470 L ${cx + 46} 470 L ${cx + 46} 812 Z`, body, INK, 2.2);
    for (let y = 510; y < 800; y += 46) line(ctx, [[cx - 46, y], [cx + 46, y]], band, 2.2);
    path(ctx, `M ${cx - 50} 472 Q ${cx} 400 ${cx + 50} 472 Z`, dome, INK, 2.2);
    path(ctx, `M ${cx - 10} 560 L ${cx + 10} 560 L ${cx + 10} 600 L ${cx - 10} 600 Z`, isNight ? '#22201c' : '#6a6458', INK, 1.4);
    line(ctx, [[cx + 30, 470], [cx + 30, 812]], band, 3);
    for (let y = 490; y < 800; y += 22) line(ctx, [[cx + 24, y], [cx + 36, y]], band, 2);
  }
  function drawCoop(ctx, cx, isNight) {
    const wall = isNight ? '#3a2a20' : '#d9a066', roof = isNight ? '#2c2a2e' : '#5d6670', trim = isNight ? '#5a4a3a' : '#f3e6cf';
    for (const dx of [-58, 58]) line(ctx, [[cx + dx, 760], [cx + dx, 812]], isNight ? '#2a1c12' : '#6b4526', 6);
    path(ctx, `M ${cx - 70} 760 L ${cx + 70} 760 L ${cx + 70} 655 L ${cx - 70} 655 Z`, wall, INK, 2.0);
    for (let x = cx - 50; x < cx + 70; x += 20) line(ctx, [[x, 655], [x, 760]], isNight ? '#2c1f17' : '#c48a52', 1.2);
    path(ctx, `M ${cx - 84} 660 L ${cx} 600 L ${cx + 84} 660 Z`, roof, INK, 2.2);
    path(ctx, `M ${cx - 18} 760 L ${cx - 18} 712 Q ${cx} 696 ${cx + 18} 712 L ${cx + 18} 760 Z`, '#2a1a10', INK, 1.4);
    path(ctx, `M ${cx - 16} 760 L ${cx + 16} 760 L ${cx + 40} 812 L ${cx + 10} 812 Z`, isNight ? '#4a3626' : '#a8754a', INK, 1.2);
    ellipse(ctx, cx + 42, 690, 13, 11, trim, INK, 1.4);
    line(ctx, [[cx + 29, 690], [cx + 55, 690]], INK, 1.2);
    line(ctx, [[cx + 42, 679], [cx + 42, 701]], INK, 1.2);
  }
  function drawYardTree(ctx, cx, isNight) {
    path(ctx, `M ${cx - 12} 812 Q ${cx - 6} 700 ${cx - 9} 600 L ${cx + 9} 600 Q ${cx + 6} 700 ${cx + 12} 812 Z`, isNight ? '#2a1c12' : '#6b4526', INK, 1.8);
    const dark = isNight ? '#173020' : '#3f7e3a', light = isNight ? '#1f3d28' : '#5aa04a';
    for (const [dx, dy, r] of [[-48, 570, 46], [46, 566, 48], [-20, 520, 52], [28, 512, 50], [0, 470, 46]]) ellipse(ctx, cx + dx, dy, r, r * .86, dark, INK, 1.6);
    for (const [dx, dy, r] of [[-26, 540, 26], [22, 500, 24], [-4, 470, 20]]) ellipse(ctx, cx + dx, dy, r, r * .8, light, null);
  }
  function drawStrawStack(ctx, cx, s, isNight) {
    const strawBase = isNight ? '#685020' : '#e2ab34', strawHigh = isNight ? '#886c30' : '#f8cd56';
    ellipse(ctx, cx, 810 - 40 * s, 75 * s, 45 * s, strawBase, INK, 2.0);
    ellipse(ctx, cx, 810 - 90 * s, 60 * s, 38 * s, strawBase, INK, 1.8);
    ellipse(ctx, cx, 810 - 145 * s, 42 * s, 32 * s, strawHigh, INK, 1.8);
    line(ctx, [[cx, 810 - 215 * s], [cx, 810 - 150 * s]], isNight ? '#2e1c0e' : '#6d421e', 3.0);
  }

  function drawFarmyardBarn(ctx, s, t) {
    const isNight = s.time === 'night';
    const { x0, x1, w } = frameSpan(s);
    const extRight = Math.max(0, x1 - PANEL), extLeft = Math.max(0, -x0);
    const skyTop = isNight ? '#0b1626' : '#92c5e8';
    const skyBot = isNight ? '#162842' : '#d2e9f7';
    const grad = ctx.createLinearGradient(0, 0, 0, 810);
    grad.addColorStop(0, skyTop);
    grad.addColorStop(1, skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(Math.min(0, x0), 0, Math.max(PANEL, x1) - Math.min(0, x0), 810);

    if (isNight) {
      // Các ngôi sao đêm lấp lánh (mỗi ô 576 px một bộ seed riêng; ô 0 y hệt khổ dọc)
      ctx.fillStyle = '#ffffff';
      tileX([x0, x1], PANEL, (ox, p) => {
        for (let i = 0; i < 24; i++) {
          const key = p ? `${p}_${i}` : i;
          const sx = ox + (hash('star_x_' + key) % 560) + 8;
          const sy = (hash('star_y_' + key) % 360) + 20;
          const sr = 0.8 + ((hash('star_r_' + key) % 15) / 10);
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, TAU);
          ctx.fill();
        }
      });
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
      // Khổ ngang: thêm mây trôi ở phần mở rộng (độ cao, cỡ theo chỉ số)
      if (extLeft > 0) spread(Math.round(extLeft / 400), extLeft, 100, 'barn-cloud-l').forEach((x0_rel, i) => {
        const cx = x0 + ((x0_rel + t * 8) % (extLeft + 160)) - 80, cy = 90 + seeded('barn-cloud-ly:' + i) * 70, k = .8 + seeded('barn-cloud-ls:' + i) * .5;
        ellipse(ctx, cx, cy, 48 * k, 22 * k, 'rgba(255, 255, 255, 0.75)', null);
        ellipse(ctx, cx + 32 * k, cy - 10 * k, 36 * k, 26 * k, 'rgba(255, 255, 255, 0.8)', null);
        ellipse(ctx, cx - 28 * k, cy + 4 * k, 32 * k, 18 * k, 'rgba(255, 255, 255, 0.7)', null);
      });
      spread(Math.round(extRight / 400), extRight, 100, 'barn-cloud').forEach((x0_rel, i) => {
        const cx = PANEL + ((x0_rel + t * 8) % (extRight + 160)) - 80, cy = 90 + seeded('barn-cloud-y:' + i) * 70, k = .8 + seeded('barn-cloud-s:' + i) * .5;
        ellipse(ctx, cx, cy, 48 * k, 22 * k, 'rgba(255, 255, 255, 0.75)', null);
        ellipse(ctx, cx + 32 * k, cy - 10 * k, 36 * k, 26 * k, 'rgba(255, 255, 255, 0.8)', null);
        ellipse(ctx, cx - 28 * k, cy + 4 * k, 32 * k, 18 * k, 'rgba(255, 255, 255, 0.7)', null);
      });
      ctx.restore();
    }

    // Đồi cỏ xa chân trời
    const hillCol = isNight ? '#163220' : '#72aa5c';
    path(ctx, 'M 0 540 Q 140 480 320 520 Q 460 550 576 500 L 576 810 L 0 810 Z', hillCol, null);
    extendHills(ctx, PANEL, 500, x1, 810, hillCol, 'barn-hill', 470, 545);
    if (extLeft > 0) extendHills(ctx, x0, 540, 0, 810, hillCol, 'barn-hill-l', 470, 545);

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

    // Khổ ngang: phần mở rộng phải có si-lô chứa thóc, chuồng gà kèm đống rơm nhỏ, và cây lớn.
    if (extRight >= 600) {
      const [siloX, coopX, treeX] = spread(3, extRight, 170, 'barn-yard').map(x => PANEL + x);
      drawSilo(ctx, siloX, isNight);
      drawYardTree(ctx, treeX, isNight);
      drawStrawStack(ctx, coopX + 150, .62, isNight);
      drawCoop(ctx, coopX, isNight);
      if (isNight) {
        ctx.save();
        const halo = ctx.createRadialGradient(coopX - 40, 640, 4, coopX - 40, 640, 55);
        halo.addColorStop(0, 'rgba(255, 200, 80, 0.7)');
        halo.addColorStop(1, 'rgba(255, 180, 50, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(coopX - 40, 640, 55, 0, TAU);
        ctx.fill();
        ctx.restore();
        ellipse(ctx, coopX - 40, 640, 5, 8, '#ffe27a', INK, 1.2);
      }
    }
    // Khổ ngang: phần mở rộng trái có cây lớn và đống rơm nhỏ
    if (extLeft >= 500) {
      drawYardTree(ctx, x0 + 160, isNight);
      drawStrawStack(ctx, x0 + 360, .75, isNight);
    }

    // Hàng rào gỗ (wooden fence) ngang sân
    const fenceCol = isNight ? '#3a2416' : '#8c5d3a';
    line(ctx, [[320, 710], [x1, 710]], fenceCol, 4.0);
    line(ctx, [[320, 750], [x1, 750]], fenceCol, 4.0);
    for (let fx = 350; fx <= x1 - 16; fx += 55) {
      path(ctx, `M ${fx - 4} 680 L ${fx} 668 L ${fx + 4} 680 L ${fx + 4} 790 L ${fx - 4} 790 Z`, fenceCol, INK, 1.4);
    }
    if (extLeft > 0) {
      line(ctx, [[x0, 710], [40, 710]], fenceCol, 4.0);
      line(ctx, [[x0, 750], [40, 750]], fenceCol, 4.0);
      for (let fx = 40 - 55; fx >= x0 + 16; fx -= 55) {
        path(ctx, `M ${fx - 4} 680 L ${fx} 668 L ${fx + 4} 680 L ${fx + 4} 790 L ${fx - 4} 790 Z`, fenceCol, INK, 1.4);
      }
    }

    // Mặt đất nông trại (ground_y: 810)
    const groundCol = isNight ? '#1e140d' : '#5a3d24';
    ctx.fillStyle = groundCol;
    ctx.fillRect(Math.min(0, x0), 810, Math.max(PANEL, x1) - Math.min(0, x0), 214);
    line(ctx, [[Math.min(0, x0), 810], [Math.max(PANEL, x1), 810]], INK, 2.4);

    // Các búi cỏ xanh điểm xuyết trước sân (khổ ngang: thêm búi rải tất định ở hai phần mở rộng)
    const grassCol = isNight ? '#1f381e' : '#4d8a38';
    for (const gx of [40, 150, 270, 390, 520, ...spread(Math.round(extRight / 120), extRight, 30, 'barn-grass').map(x => PANEL + x), ...(extLeft > 0 ? spread(Math.round(extLeft / 120), extLeft, 30, 'barn-grass-l').map(x => x0 + x) : [])]) {
      path(ctx, `M ${gx - 10} 810 Q ${gx - 6} 796 ${gx - 14} 792 Q ${gx - 2} 802 ${gx} 810 Q ${gx + 5} 794 ${gx + 12} 790 Q ${gx + 4} 802 ${gx + 10} 810 Z`, grassCol, null);
    }
  }

  // Chợ quê khổ ngang: mỗi dù ở phần mở rộng có màu, độ nghiêng và hàng hoá riêng (theo chỉ số dù).
  const MARKET_UMBRELLAS = [
    { day: ['#7b46b8', '#f3ead8'], night: ['#3a2450', '#cfc6b2'], lean: 10, y: 520, r: 118, goods: 'eggplant' },
    { day: ['#e8892c', '#fbe6a2'], night: ['#5a3410', '#8a7a52'], lean: -12, y: 505, r: 126, goods: 'orange' },
    { day: ['#2f7fd0', '#f6f0e0'], night: ['#1a2e48', '#c9c2b0'], lean: 8, y: 530, r: 112, goods: 'cabbage' },
  ];
  function marketUmbrella(ctx, x, spec, bambooCol, isNight) {
    const [outer, inner] = isNight ? spec.night : spec.day, y = spec.y, r = spec.r;
    line(ctx, [[x, y], [x + spec.lean, 810]], bambooCol, 5.0);
    path(ctx, `M ${x - r} ${y + 34} Q ${x} ${y - 66} ${x + r} ${y + 34} Z`, outer, INK, 2.2);
    path(ctx, `M ${x - r * .4} ${y + 32} Q ${x} ${y - 66} ${x + r * .4} ${y + 32} Z`, inner, INK, 1.8);
    path(ctx, `M ${x - r} ${y + 34} Q ${x - r * .5} ${y + 44} ${x} ${y + 34} Q ${x + r * .5} ${y + 44} ${x + r} ${y + 34}`, null, INK, 2.0);
  }
  function marketStall(ctx, x, goods, bambooCol) {
    path(ctx, `M ${x - 95} 715 L ${x + 95} 715 L ${x + 86} 735 L ${x - 86} 735 Z`, bambooCol, INK, 2.0);
    line(ctx, [[x - 76, 735], [x - 86, 810]], bambooCol, 4.0);
    line(ctx, [[x + 76, 735], [x + 86, 810]], bambooCol, 4.0);
    ellipse(ctx, x - 30, 710, 34, 13, '#9c7b44', INK, 1.6);
    ellipse(ctx, x + 42, 710, 26, 11, '#9c7b44', INK, 1.6);
    if (goods === 'eggplant') {
      for (const [dx, rot] of [[-44, -.5], [-30, .3], [-16, -.2]]) ellipse(ctx, x + dx, 700, 6, 12, '#5b2a7a', INK, 1.0, rot);
      for (const dx of [34, 48]) ellipse(ctx, x + dx, 702, 7, 7, '#e8c13a', INK, 1.0);
    } else if (goods === 'orange') {
      for (const [dx, dy] of [[-42, 702], [-28, 700], [-14, 703], [-34, 692], [-20, 691]]) ellipse(ctx, x + dx, dy, 7, 7, '#f08a24', INK, 1.0);
      for (const dx of [34, 48]) ellipse(ctx, x + dx, 702, 7, 6, '#a8cf4a', INK, 1.0);
    } else {
      for (const dx of [-42, -22]) ellipse(ctx, x + dx, 699, 12, 10, '#6fb24e', INK, 1.2);
      for (const dx of [36, 48]) ellipse(ctx, x + dx, 702, 5, 9, '#d64a3a', INK, 1.0, .4);
    }
  }

  function drawVillageMarket(ctx, s, t) {
    const isNight = s.time === 'night';
    const { x0, x1, w } = frameSpan(s);
    const extRight = Math.max(0, x1 - PANEL), extLeft = Math.max(0, -x0);
    const umbrellaXs = extRight >= 600 ? spread(MARKET_UMBRELLAS.length, extRight, 170, 'vm-umb').map(x => PANEL + x) : [];
    const skyTop = isNight ? '#0e1828' : '#8fc3e8';
    const skyBot = isNight ? '#1e2e42' : '#f0e2ca';
    const grad = ctx.createLinearGradient(0, 0, 0, 810);
    grad.addColorStop(0, skyTop);
    grad.addColorStop(1, skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(Math.min(0, x0), 0, Math.max(PANEL, x1) - Math.min(0, x0), 810);

    if (isNight) {
      // Bầu trời đêm chợ quê (mỗi ô 576 px một bộ seed; ô 0 y hệt khổ dọc)
      ctx.fillStyle = '#ffffff';
      tileX([x0, x1], PANEL, (ox, p) => {
        for (let i = 0; i < 20; i++) {
          const key = p ? `${p}_${i}` : i;
          const sx = ox + (hash('vm_star_x_' + key) % 560) + 8;
          const sy = (hash('vm_star_y_' + key) % 320) + 20;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.0, 0, TAU);
          ctx.fill();
        }
      });
    }

    // Hàng tre làng và mái ngói rêu phong xa xăm
    const farCol = isNight ? '#152418' : '#609252';
    path(ctx, 'M 0 570 Q 120 530 260 560 Q 420 530 576 565 L 576 810 L 0 810 Z', farCol, null);
    extendHills(ctx, PANEL, 565, x1, 810, farCol, 'vm-hill', 545, 580);
    if (extLeft > 0) extendHills(ctx, x0, 570, 0, 810, farCol, 'vm-hill-l', 545, 580);

    // Mái ngói cong truyền thống mờ ở phía sau
    const roofCol = isNight ? '#2a1a16' : '#9c4c36';
    path(ctx, 'M 40 540 Q 140 520 240 540 L 230 565 L 50 565 Z', roofCol, INK, 1.4);
    path(ctx, 'M 340 545 Q 440 525 540 545 L 530 570 L 350 570 Z', roofCol, INK, 1.4);
    spread(Math.round(extRight / 300), extRight, 110, 'vm-roof').forEach((x0_rel, i) => {
      const x = PANEL + x0_rel, y = 538 + seeded('vm-roof-y:' + i) * 14, half = 80 + seeded('vm-roof-w:' + i) * 30;
      path(ctx, `M ${x - half} ${y} Q ${x} ${y - 20} ${x + half} ${y} L ${x + half - 10} ${y + 25} L ${x - half + 10} ${y + 25} Z`, roofCol, INK, 1.4);
    });
    if (extLeft > 0) spread(Math.round(extLeft / 300), extLeft, 110, 'vm-roof-l').forEach((x0_rel, i) => {
      const x = x0 + x0_rel, y = 538 + seeded('vm-roof-ly:' + i) * 14, half = 80 + seeded('vm-roof-lw:' + i) * 30;
      path(ctx, `M ${x - half} ${y} Q ${x} ${y - 20} ${x + half} ${y} L ${x + half - 10} ${y + 25} L ${x - half + 10} ${y + 25} Z`, roofCol, INK, 1.4);
    });

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

    // Khổ ngang: ba dù mới (tím / cam / lam) kèm sạp bán cà tím, cam, bắp cải ở phần mở rộng.
    umbrellaXs.forEach((x, i) => {
      ctx.save();
      marketUmbrella(ctx, x, MARKET_UMBRELLAS[i], bambooCol, isNight);
      ctx.restore();
      marketStall(ctx, x + MARKET_UMBRELLAS[i].lean * .5, MARKET_UMBRELLAS[i].goods, bambooCol);
    });

    // Khổ ngang: sạp dù bên trái nếu có mở rộng trái
    const leftUmbrellaXs = extLeft >= 500 ? spread(2, extLeft, 140, 'vm-umb-l').map(x => x0 + x) : [];
    if (extLeft >= 500) {
      const leftUmbrellas = [
        { col: '#2563eb', cap: '#38bdf8', lean: -8, y: 535, goods: 'cabbage' },
        { col: '#d97706', cap: '#fde047', lean: 10, y: 525, goods: 'orange' }
      ];
      leftUmbrellaXs.forEach((x, i) => {
        ctx.save();
        marketUmbrella(ctx, x, leftUmbrellas[i], bambooCol, isNight);
        ctx.restore();
        marketStall(ctx, x + leftUmbrellas[i].lean * .5, leftUmbrellas[i].goods, bambooCol);
      });
    }

    // Dây cờ đuôi nheo ngũ sắc giăng ngang phía trên (mỗi ô 576 px một dây; màu cờ lệch theo chỉ số ô)
    const flagColors = ['#e54338', '#f2be34', '#3894e6', '#4ca842', '#e65cc2'];
    tileX([x0, x1], PANEL, (ox, p) => {
      path(ctx, `M ${ox} 360 Q ${ox + PANEL / 2} 420 ${ox + PANEL} 360`, null, INK, 1.4);
      for (let f = 0; f < 10; f++) {
        const fx = ox + 35 + f * 55;
        const sag = Math.sin(((fx - ox) / PANEL) * Math.PI) * 40;
        const fy = 360 + sag;
        const col = flagColors[(f + Math.abs(p) * 2) % flagColors.length];
        path(ctx, `M ${fx - 14} ${fy} L ${fx + 14} ${fy} L ${fx} ${fy + 28} Z`, col, INK, 1.2);
      }
    });

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
      const allLanterns = [
        [150, 520], [430, 520],
        ...umbrellaXs.map((x, i) => [x, MARKET_UMBRELLAS[i].y + 10]),
        ...leftUmbrellaXs.map((x, i) => [x, (i === 0 ? 535 : 525) + 10])
      ];
      for (const [lx, ly] of allLanterns) {
        ctx.save();
        const halo = ctx.createRadialGradient(lx, ly, 4, lx, ly, 55);
        halo.addColorStop(0, 'rgba(255, 215, 90, 0.75)');
        halo.addColorStop(1, 'rgba(255, 180, 50, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(lx, ly, 55, 0, TAU);
        ctx.fill();
        ellipse(ctx, lx, ly, 9, 12, '#ff4a38', INK, 1.4);
        ellipse(ctx, lx, ly, 4, 6, '#fff090', null);
        ctx.restore();
      }
    }

    // Mặt đất chợ quê (ground_y: 810) - gạch lát / đất nện màu ấm
    const groundCol = isNight ? '#1e1814' : '#645446';
    ctx.fillStyle = groundCol;
    ctx.fillRect(Math.min(0, x0), 810, Math.max(PANEL, x1) - Math.min(0, x0), 214);
    line(ctx, [[Math.min(0, x0), 810], [Math.max(PANEL, x1), 810]], INK, 2.4);

    // Vài vân đá lát sàn chợ (mỗi ô 576 px một bộ seed; ô 0 y hệt khổ dọc)
    const stoneCol = isNight ? '#2a221c' : '#7c6c5c';
    tileX([x0, x1], PANEL, (ox, p) => {
      for (let i = 0; i < 12; i++) {
        const key = p ? `${p}_${i}` : i;
        const px = ox + (hash('stone_x_' + key) % 520) + 20;
        const py = 825 + (hash('stone_y_' + key) % 170);
        ellipse(ctx, px, py, 14, 6, stoneCol, null);
      }
    });
  }

  // =========================================================================
  // 2. ACTION HOOKS: tug, bounce, run_away, grow_fast, shiver, sweat, dizzy, celebrate, emote
  // =========================================================================

  const farmFunActionHooks = {
    // 2.1 Kéo co (tug): actor nắm `grip` của củ, mỗi helper nắm người/thú đứng trước (grabPoint) suốt
    // lúc kéo; cả đoàn ngả ra sau đồng pha, củ rung và nhú vai lên. Đến pop_at củ bật khỏi đất, cả đoàn
    // buông tay và ngã ngửa. pop_at = end nghĩa là kéo không nổi. Sau end (hold) giữ nguyên trạng thái cuối.
    tug(a, states, t, p, u, amount, cat, active) {
      const radish = states[a.target], ids = [a.actor, ...(a.helpers || [])].filter(id => states[id]);
      if (!radish || !ids.length) return;
      const popAt = a.pop_at ?? a.start + (a.end - a.start) * 0.72;
      const now = Math.min(t, a.end), dir = Math.sign(states[ids[0]].x - radish.x) || 1;
      if (now < popAt || popAt >= a.end) {
        const ramp = smooth(clamp((now - a.start) / .4)), heave = Math.max(0, Math.sin((now - a.start) * 4.2)) * ramp;
        radish.x += Math.sin(now * 36) * 2.2 * heave;
        radish.lift = 12 * heave * amount;
        radish.y -= radish.lift;
        radish.expression = 'worried';
        let grab = RemakeVector.worldAnchor(cat, radish, a.target_anchor || 'grip');
        for (const id of ids) {
          const s = states[id];
          if (HANDED.has(cat.assets[s.asset].group)) s.rotation = (s.rotation || 0) + dir * (8 + 10 * heave) * ramp;
          if (s.faceEnabled !== false) s.expression = 'worried';
          joinChain(cat, s, grab, dir);
          grab = grabPoint(cat, s);
        }
        return;
      }
      const popP = smooth(clamp((now - popAt) / Math.max(0.3, (a.end - popAt) * 0.4)));
      radish.lift = (a.lift_amount ?? 170) * popP;
      radish.y -= radish.lift;
      radish.rotation = (radish.rotation || 0) - dir * 14 * popP;
      radish.expression = 'surprised';
      for (const id of ids) {
        const s = states[id];
        s.rotation = (s.rotation || 0) + dir * 55 * popP;
        s.x += dir * 36 * popP;
        if (s.faceEnabled !== false) s.expression = 'surprised';
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
      const s = states[a.actor];
      if (!s) return;
      const dir = s.flip ? -1 : 1;
      s.x += dir * p * 220 * amount;  // hold: sau end vẫn đứng ở chỗ đã chạy tới
      if (!active) return;
      s.running_away = true;
      s.rotation = (s.rotation || 0) + dir * 14;
      s.y -= Math.abs(Math.sin(p * Math.PI * 10)) * 14;
    },

    // 2.4 Lớn nhanh như thổi kèm lấp lánh (grow_fast)
    grow_fast(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const tgt = states[a.target || a.actor];
      if (tgt) tgt.growing_fast = true;  // growth do kênh `growth` của catalog tua tới 1
    },

    // 2.5 Run rẩy vì lạnh (shiver)
    shiver(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) s.shiver = Math.max(s.shiver || 0, 1);
    },

    // 2.6 Toát mồ hôi vì nóng hoặc hoảng sợ (sweat)
    sweat(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) s.sweat = Math.max(s.sweat || 0, 1);
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
    const { path, line, ellipse, INK, TAU, clamp, hash, frameW } = kit;

    // 3.1 Ăn mừng pháo hoa giấy kim tuyến (celebrate confetti) — rải theo bề rộng khổ của snapshot
    const hasCelebrate = snapshot.actions.some(a => a.active && a.type === 'celebrate') ||
                         Object.values(snapshot.states).some(s => s.celebrating || s.celebrate);
    if (hasCelebrate) {
      ctx.save();
      const colors = ['#f44336', '#e91e63', '#9c27b0', '#2196f3', '#4caf50', '#ffeb3b', '#ff9800', '#00bcd4'];
      const W = frameW(snapshot);
      for (let i = 0; i < Math.round(48 * W / PANEL); i++) {
        const xSeed = (hash('confetti_x_' + i) % W);
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

      // (A2) Mồ hôi (sweat: nắng nóng / hoảng) và run cầm cập (shiver: tuyết) quanh mặt
      if ((s.sweat || 0) > .05 || (s.shiver || 0) > .05) {
        const faceName = cat.assets[s.asset].anchors.face ? 'face' : 'top';
        const f = RemakeVector.worldAnchor(cat, s, faceName), r = s.height * .16;
        ctx.save();
        if ((s.sweat || 0) > .05) {
          ctx.globalAlpha = clamp(s.sweat);
          for (let i = 0; i < 2; i++) {
            const k = ((snapshot.t * .9 + i * .5) % 1), dx = (i ? 1 : -1) * r * .9, dy = -r * .4 + k * r * .9;
            path(ctx, `M ${f.x + dx} ${f.y + dy - 7} C ${f.x + dx + 5} ${f.y + dy - 1} ${f.x + dx + 4} ${f.y + dy + 5} ${f.x + dx} ${f.y + dy + 5} C ${f.x + dx - 4} ${f.y + dy + 5} ${f.x + dx - 5} ${f.y + dy - 1} ${f.x + dx} ${f.y + dy - 7} Z`, '#8fdcf6', INK, 1.1);
          }
        }
        if ((s.shiver || 0) > .05) {
          ctx.globalAlpha = clamp(s.shiver);
          const j = Math.sin(snapshot.t * 42) * 2;
          for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
            const x = f.x + side * (r * 1.15 + i * 5) + j, y = f.y - 8 + i * 8;
            line(ctx, [[x, y - 5], [x + side * 3, y], [x, y + 5]], '#7aaee0', 1.6);
          }
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
