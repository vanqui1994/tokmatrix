// remake_vector_packs/us_culture.js — Giai đoạn S: Gói văn hoá Mỹ (plan §28).
// 14 rigs: bison, bear, prairie_dog, raccoon, salmon, jack_o_lantern, harvest_basket,
//          lemonade_stand, mailbox, fire_hydrant, liberty_statue_generic, railroad_track,
//          moon_footprint, seismometer.
// 6 backgrounds: suburb_backyard, national_park, wild_west_town, launch_pad, pumpkin_patch, moon_surface.
// (all ground_y: 810, 7 weathers, day/night, ZERO text, ZERO flags, ZERO logos).
// 1 deterministic fireworks effect (function of t, fixed seed, zero flags).
// 1 action hook: carve (khắc đèn bí ngô).

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
    INK,
    TAU,
    clamp,
    smooth,
    mix
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
  // ANIMALS (5 rigs: bison, bear, prairie_dog, raccoon, salmon)
  // =============================================================

  // 1. BISON (Bò rừng bizon Bắc Mỹ)
  function drawBison(ctx, s, t) {
    ctx.save();
    const walk = s.walk || 0, stride = s.stride || 0;
    const darkMantle = s.style?.mantle || '#3e2723';
    const bodyCoat = s.style?.body || '#5d4037';
    const hoofCol = '#1c1917';
    const hornCol = '#262626';

    const bob = Math.sin(stride * 2) * walk * 3;
    ctx.translate(0, bob);

    // Chân sau (bên xa)
    const legRearFar = Math.sin(stride + Math.PI) * walk * 12;
    path(ctx, `M 30 -35 L ${26 + legRearFar} -4 L ${24 + legRearFar} 0 L ${34 + legRearFar} 0 L ${36 + legRearFar} -4 L 38 -35 Z`, tone(bodyCoat, -0.15), INK, 1.2);
    // Chân trước (bên xa)
    const legFrontFar = Math.sin(stride) * walk * 14;
    path(ctx, `M -24 -38 L ${-26 + legFrontFar} -4 L ${-28 + legFrontFar} 0 L ${-18 + legFrontFar} 0 L ${-18 + legFrontFar} -4 L -14 -38 Z`, tone(darkMantle, -0.15), INK, 1.4);

    // Đuôi ngắn có chùm lông sẫm
    const tailWag = Math.sin(t * 3) * 6;
    path(ctx, `M 46 -48 Q ${52 + tailWag} -40 ${50 + tailWag} -32`, null, bodyCoat, 2.5);
    ellipse(ctx, 50 + tailWag, -30, 4, 6, darkMantle, INK, 1.0, -0.2);

    // Thân sau & mông
    path(ctx, 'M 8 -65 Q 36 -62 48 -46 Q 44 -28 32 -32 L 6 -34 Z', bodyCoat, INK, 1.4);

    // Bướu lưng gồ cao dũng mãnh & bờm vai trước xù lông rậm rạp
    path(ctx, 'M -34 -50 Q -38 -78 -12 -78 Q 8 -76 12 -62 L 6 -32 Q -18 -30 -34 -38 Z', darkMantle, INK, 1.6);
    // Các vệt gợn lông bờm bướu
    for (let i = -24; i <= 0; i += 6) {
      path(ctx, `M ${i} -74 Q ${i - 3} -64 ${i - 1} -56`, null, tone(darkMantle, 0.2), 1.2);
    }

    // Chân sau (bên gần)
    const legRearNear = Math.sin(stride) * walk * 12;
    path(ctx, `M 22 -35 L ${20 + legRearNear} -4 L ${18 + legRearNear} 0 L ${28 + legRearNear} 0 L ${30 + legRearNear} -4 L 30 -35 Z`, bodyCoat, INK, 1.3);
    path(ctx, `M ${18 + legRearNear} -4 L ${28 + legRearNear} -4 L ${28 + legRearNear} 0 L ${18 + legRearNear} 0 Z`, hoofCol, null);

    // Chân trước (bên gần) có túm lông rậm ở đầu gối
    const legFrontNear = Math.sin(stride + Math.PI) * walk * 14;
    path(ctx, `M -16 -38 Q -20 -20 ${-18 + legFrontNear} -4 L ${-20 + legFrontNear} 0 L ${-10 + legFrontNear} 0 L ${-10 + legFrontNear} -4 Q -8 -20 -6 -38 Z`, darkMantle, INK, 1.5);
    path(ctx, `M ${-20 + legFrontNear} -4 L ${-10 + legFrontNear} -4 L ${-10 + legFrontNear} 0 L ${-20 + legFrontNear} 0 Z`, hoofCol, null);

    // ĐẦU & SỪNG (Head & curved horns)
    const headDown = s.head_down ? 10 : 0;
    const hx = -38, hy = -55 + headDown;
    ctx.save();
    ctx.translate(hx, hy);

    // Đầu xù lông
    ellipse(ctx, 0, 0, 15, 14, darkMantle, INK, 1.6);
    // Chòm râu cằm dài (Beard)
    path(ctx, 'M -8 10 Q -12 24 -16 26 Q -6 20 0 12 Z', darkMantle, INK, 1.2);

    // Mõm đen sẫm
    ellipse(ctx, -10, 4, 7, 6, tone(darkMantle, -0.2), INK, 1.2);
    ellipse(ctx, -12, 4, 1.8, 1.4, '#171717', null); // Lỗ mũi

    // Mắt nhỏ sẫm màu
    ellipse(ctx, -4, -2, 2.4, 2.4, '#171717', null);
    ellipse(ctx, -4.5, -2.5, 0.8, 0.8, '#ffffff', null);

    // Tai nhỏ vểnh
    path(ctx, 'M 6 -4 Q 14 -8 12 -14 Q 4 -10 2 -6 Z', darkMantle, INK, 1.0);

    // Cặp sừng cong vút màu đen tuyền hướng lên trên
    path(ctx, 'M -2 -10 Q -4 -22 -14 -20 Q -4 -16 2 -8 Z', hornCol, INK, 1.2);

    ctx.restore();
    ctx.restore();
  }

  // 2. BEAR (Gấu đen Bắc Mỹ thân thiện)
  function drawBear(ctx, s, t) {
    ctx.save();
    const walk = s.walk || 0, stride = s.stride || 0;
    const furCol = s.style?.fur || '#27272a';
    const muzzleCol = '#e2bc8a';
    const noseCol = '#171717';

    // Dáng đi lắc lư dễ thương
    const waddle = Math.sin(stride) * walk * 0.08;
    ctx.rotate(waddle);

    // Chân sau
    for (const side of [-1, 1]) {
      const lx = side * 16;
      const legWalk = Math.sin(stride + (side > 0 ? 0 : Math.PI)) * walk * 8;
      path(ctx, `M ${lx - 8} -22 L ${lx - 9 + legWalk} -3 L ${lx - 12 + legWalk} 0 L ${lx + 10 + legWalk} 0 L ${lx + 7 + legWalk} -3 L ${lx + 8} -22 Z`, furCol, INK, 1.4);
    }

    // Thân hình quả lê mập mạp, ấm áp
    path(ctx, 'M -24 -24 Q -28 -56 -14 -60 L 14 -60 Q 28 -56 24 -24 Q 22 -6 0 -6 Q -22 -6 -24 -24 Z', furCol, INK, 1.6);
    // Vạt ngực/bụng sáng màu nhẹ nhàng
    ellipse(ctx, 0, -28, 12, 16, tone(furCol, 0.2), null);

    // Hai tay mũm mĩm ở hai bên
    for (const side of [-1, 1]) {
      const ax = side * 22;
      const armSwing = Math.sin(t * 4 + side) * 3;
      ellipse(ctx, ax, -35 + armSwing, 6, 12, furCol, INK, 1.3, side * 0.2);
    }

    // ĐẦU TRÒN DỄ THƯƠNG
    const hx = 0, hy = -68;
    // Hai tai tròn xoe
    for (const side of [-1, 1]) {
      ellipse(ctx, hx + side * 18, hy - 10, 6, 6, furCol, INK, 1.3);
      ellipse(ctx, hx + side * 18, hy - 10, 3.5, 3.5, '#f472b6', null); // Lòng tai hồng
    }

    // Đầu tròn
    ellipse(ctx, hx, hy, 17, 15, furCol, INK, 1.6);

    // Mõm tròn màu sáng
    ellipse(ctx, hx, hy + 5, 8, 6.5, muzzleCol, INK, 1.2);
    // Mũi đen to tròn bóng bẩy
    ellipse(ctx, hx, hy + 2, 4, 3, noseCol, null);
    ellipse(ctx, hx - 1, hy + 1.2, 1.2, 0.9, '#ffffff', null);
    // Nụ cười thân thiện
    path(ctx, `M ${hx - 4} ${hy + 7} Q ${hx} ${hy + 10} ${hx + 4} ${hy + 7}`, null, INK, 1.4);

    // Mắt tròn to long lanh
    for (const side of [-1, 1]) {
      ellipse(ctx, hx + side * 6, hy - 3, 3, 3.5, '#171717', null);
      ellipse(ctx, hx + side * 5.2, hy - 4.2, 1.2, 1.2, '#ffffff', null);
    }

    ctx.restore();
  }

  // 3. PRAIRIE_DOG (Sóc thảo nguyên đứng cảnh giác)
  function drawPrairieDog(ctx, s, t) {
    ctx.save();
    const coat = s.style?.coat || '#d99b58';
    const belly = '#fef3c7';

    // Đuôi ngắn ngoe nguẩy nhẹ
    const tailWag = Math.sin(t * 6) * 3;
    path(ctx, `M -10 -14 Q -16 -10 ${-18 + tailWag} -8`, null, coat, 4);
    ellipse(ctx, -18 + tailWag, -8, 2.5, 3, '#3e2723', null); // Chóp đuôi đen

    // Bàn chân sau bám đất
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 7, -2, 5, 2.5, coat, INK, 1.1);
    }

    // Thân hình đứng thẳng
    path(ctx, 'M -9 -8 Q -13 -26 -8 -40 L 8 -40 Q 13 -26 9 -8 Z', coat, INK, 1.4);
    // Bụng kem sáng
    path(ctx, 'M -5 -8 Q -7 -24 -4 -36 L 4 -36 Q 7 -24 5 -8 Z', belly, null);

    // Đôi tay nhỏ xíu ôm trước ngực
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 6, -28, 3, 5, coat, INK, 1.1, -side * 0.4);
    }

    // ĐẦU TRÒN
    const hy = -48;
    // Tai nhỏ
    ellipse(ctx, -8, hy - 4, 2.5, 2.5, coat, INK, 0.9);
    ellipse(ctx, 8, hy - 4, 2.5, 2.5, coat, INK, 0.9);
    // Mặt tròn
    ellipse(ctx, 0, hy, 9, 8, coat, INK, 1.4);
    // Má sáng
    ellipse(ctx, 0, hy + 3, 6, 4, belly, null);
    // Mũi nhỏ & miệng
    ellipse(ctx, 0, hy + 1.5, 1.5, 1.1, '#3e2723', null);
    line(ctx, [[0, hy + 2.5], [0, hy + 4.5]], '#3e2723', 0.8);
    // Mắt to đen láy
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 4.5, hy - 1, 2.2, 2.5, '#171717', null);
      ellipse(ctx, side * 4 + 0.5, hy - 2, 0.8, 0.8, '#ffffff', null);
    }

    ctx.restore();
  }

  // 4. RACCOON (Gấu mèo Bắc Mỹ)
  function drawRaccoon(ctx, s, t) {
    ctx.save();
    const coat = s.style?.coat || '#64748b';
    const darkCol = '#1e293b';

    // ĐUÔI XÙ CÓ CÁC KHOANH TRÒN ĐẶC TRƯNG
    const tailSway = Math.sin(t * 3) * 4;
    ctx.save();
    ctx.translate(22, -26);
    ctx.rotate(0.3 + tailSway * 0.05);
    ellipse(ctx, 16, 0, 16, 7, coat, INK, 1.3);
    // 4 vòng sọc đen
    for (const x of [6, 13, 20, 27]) {
      path(ctx, `M ${x} -6 L ${x + 3} -6 L ${x + 3} 6 L ${x} 6 Z`, darkCol, null);
    }
    ctx.restore();

    // 4 chân nhỏ
    for (const x of [-16, -6, 8, 18]) {
      path(ctx, `M ${x - 3} -14 L ${x - 4} -2 L ${x - 6} 0 L ${x + 2} 0 L ${x + 1} -2 L ${x + 2} -14 Z`, darkCol, INK, 1.1);
    }

    // Thân mình gù tròn
    ellipse(ctx, 0, -22, 20, 13, coat, INK, 1.4);

    // ĐẦU & MẶT NẠ KẺ CƯỚP (Bandit mask)
    const hx = -18, hy = -36;
    ctx.save();
    ctx.translate(hx, hy);

    // Hai tai nhọn có viền trắng
    for (const side of [-1, 1]) {
      path(ctx, `M ${side * 8} -6 L ${side * 12} -14 L ${side * 4} -12 Z`, coat, INK, 1.1);
      path(ctx, `M ${side * 8} -6 L ${side * 10} -12 L ${side * 5} -11 Z`, '#ffffff', null);
    }

    // Đầu hình nón
    ellipse(ctx, 0, 0, 11, 9, '#f8fafc', INK, 1.3);

    // Mặt nạ đen ngang hai mắt
    path(ctx, 'M -10 -2 Q 0 -5 10 -2 L 10 3 Q 0 1 -10 3 Z', darkCol, null);

    // Mắt sáng trong mặt nạ
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 5, 0, 2, 2.5, '#fef08a', null);
      ellipse(ctx, side * 5, 0, 1.3, 2, '#000000', null);
      ellipse(ctx, side * 4.6, -0.8, 0.6, 0.6, '#ffffff', null);
    }

    // Mõm trắng nhọn & mũi đen
    path(ctx, 'M -4 3 L 4 3 L 0 8 Z', '#ffffff', null);
    ellipse(ctx, 0, 7, 1.8, 1.3, '#000000', null);

    ctx.restore();
    ctx.restore();
  }

  // 5. SALMON (Cá hồi hoang dã uốn lượn)
  function drawSalmon(ctx, s, t) {
    ctx.save();
    const flex = Math.sin(t * 8) * 4;

    // Vây đuôi xòe chẻ đôi
    path(ctx, `M 32 ${-18 + flex * 0.7} L 46 ${-26 + flex} L 40 ${-18 + flex} L 46 ${-10 + flex} Z`, '#e11d48', INK, 1.2);

    // Thân cá hình thoi khí động học
    path(ctx, `M -38 -18 Q -10 -30 20 ${-22 + flex * 0.4} L 32 ${-18 + flex * 0.7} L 20 ${-14 + flex * 0.4} Q -10 -6 -38 -18 Z`, '#fda4af', INK, 1.4);

    // Lưng màu xanh xám thép có đốm
    path(ctx, `M -38 -18 Q -10 -30 20 ${-22 + flex * 0.4} L 20 ${-18 + flex * 0.4} Q -10 -22 -38 -18 Z`, '#475569', null);
    // Vệt hồng cá hồi đậm đặc trưng ở lườn
    path(ctx, `M -28 -18 Q -4 -17 18 ${-18 + flex * 0.4}`, null, '#f43f5e', 3.5);
    // Bụng bạc ánh kim
    path(ctx, `M -32 -16 Q -10 -8 18 ${-15 + flex * 0.4}`, null, '#f8fafc', 2.0);

    // Đốm đen lưng
    for (let x = -18; x <= 12; x += 6) {
      ellipse(ctx, x, -22 + (x % 4), 0.8, 0.8, '#1e293b', null);
    }

    // Vây lưng
    path(ctx, 'M -8 -26 L 4 -32 L 6 -24 Z', '#e11d48', INK, 1.0);
    // Vây mỡ nhỏ gần đuôi
    ellipse(ctx, 16, -21 + flex * 0.4, 2, 1.2, '#be123c', null, 0.3);
    // Vây ngực & vây bụng
    path(ctx, 'M -20 -12 L -14 -7 L -16 -12 Z', '#fb7185', INK, 0.9);

    // Mắt cá
    ellipse(ctx, -28, -20, 2.5, 2.5, '#fef08a', INK, 0.8);
    ellipse(ctx, -28, -20, 1.3, 1.3, '#000000', null);

    ctx.restore();
  }

  // =============================================================
  // PROPS & OBJECTS (9 rigs)
  // =============================================================

  // 6. JACK_O_LANTERN (Đèn lồng bí ngô Halloween)
  function drawJackOLantern(ctx, s, t) {
    ctx.save();
    const lit = clamp(s.lit !== undefined ? s.lit : (s.cutaway !== undefined ? s.cutaway : 0), 0, 1);
    const orangeCol = '#ea580c';

    // Cuống bí ngô xanh cong queo
    path(ctx, 'M -2 -48 Q -4 -56 4 -54 Q 1 -50 2 -48 Z', '#15803d', INK, 1.2);

    // Các múi bí ngô tròn đầy
    const lobes = [-16, 16, -9, 9, 0];
    for (const x of lobes) {
      const w = x === 0 ? 13 : 11;
      ellipse(ctx, x, -26, w, 20, volumeGradient(ctx, x, -26, w, 20, orangeCol), INK, 1.4);
    }

    // MẶT KHẮC (Mắt tam giác, mũi tam giác, miệng răng cưa)
    const flicker = lit > 0 ? (0.85 + Math.sin(t * 18) * 0.15) : 0;
    const glowFill = lit > 0 ? `rgba(254, 240, 138, ${0.9 * flicker})` : '#381604';
    const innerShadow = lit > 0 ? '#f59e0b' : '#1c0a02';

    // Mắt trái
    drawPoly(ctx, [[-15, -34], [-6, -34], [-11, -26]], glowFill, innerShadow, 1.2);
    // Mắt phải
    drawPoly(ctx, [[6, -34], [15, -34], [11, -26]], glowFill, innerShadow, 1.2);
    // Mũi tam giác
    drawPoly(ctx, [[-3, -26], [3, -26], [0, -21]], glowFill, innerShadow, 1.0);

    // Miệng răng cưa cười tươi
    const mouthPts = [
      [-14, -18], [-9, -15], [-6, -18], [-2, -15],
      [2, -15], [6, -18], [9, -15], [14, -18],
      [11, -11], [6, -13], [3, -10], [-3, -10],
      [-6, -13], [-11, -11]
    ];
    drawPoly(ctx, mouthPts, glowFill, innerShadow, 1.2);

    // Ánh lửa bập bùng nếu thắp nến
    if (lit > 0) {
      ctx.save();
      ctx.globalAlpha = 0.4 * flicker;
      ellipse(ctx, 0, -22, 18, 12, '#fde047', null);
      ctx.restore();
    }

    ctx.restore();
  }

  function volumeGradient(ctx, cx, cy, rx, ry, col) {
    return cylinder(ctx, cx - rx, cx + rx, col);
  }

  // 7. HARVEST_BASKET (Giỏ thu hoạch đan mây có quai)
  function drawHarvestBasket(ctx, s, t) {
    ctx.save();
    const fill = clamp(s.fill !== undefined ? s.fill : 0, 0, 1);
    const basketCol = '#b45309';
    const darkWeave = '#78350f';

    // Nông sản thu hoạch bên trong (nếu fill > 0)
    if (fill > 0) {
      ctx.save();
      // Quả bí ngô nhỏ bên trong
      ellipse(ctx, -8, -32, 10, 8, '#f97316', INK, 1.0);
      path(ctx, 'M -8 -40 L -7 -36', '#15803d', INK, 1.2);
      // Bắp ngô vàng rực
      path(ctx, 'M 4 -36 L 14 -28 L 8 -24 Z', '#facc15', INK, 1.0);
      path(ctx, 'M 14 -28 L 18 -32', '#65a30d', INK, 1.2); // Vỏ ngô xanh
      // Quả táo đỏ
      ellipse(ctx, 0, -28, 6, 6, '#dc2626', INK, 1.0);
      ctx.restore();
    }

    // Quai xách uốn cong hình bán nguyệt vươn cao
    path(ctx, 'M -20 -24 Q -22 -52 0 -50 Q 22 -52 20 -24', null, '#d97706', 4.5);
    path(ctx, 'M -20 -24 Q -22 -52 0 -50 Q 22 -52 20 -24', null, darkWeave, 1.2);

    // Thân giỏ mây hình thang vát đáy
    path(ctx, 'M -22 -28 L 22 -28 L 16 -2 L -16 -2 Z', cylinder(ctx, -22, 22, basketCol), INK, 1.5);

    // Các nan đan mây đan chéo
    for (let x = -18; x <= 18; x += 7) {
      line(ctx, [[x, -28], [x * 0.75, -2]], darkWeave, 1.2);
    }
    for (let y = -22; y <= -6; y += 6) {
      const w = 20 - Math.abs(y + 15) * 0.3;
      line(ctx, [[-w, y], [w, y]], tone(basketCol, 0.2), 1.4);
    }

    // Vành miệng giỏ gia cố dày dặn
    ellipse(ctx, 0, -28, 23, 4.5, '#d97706', INK, 1.4);

    ctx.restore();
  }

  // 8. LEMONADE_STAND (Quầy nước chanh gỗ)
  function drawLemonadeStand(ctx, s, t) {
    ctx.save();
    const woodCol = '#d97706';
    const darkWood = '#78350f';

    // 1. Thùng gỗ làm thân quầy
    path(ctx, 'M -34 -48 L 34 -48 L 32 0 L -32 0 Z', cylinder(ctx, -34, 34, woodCol), INK, 1.6);
    // Các đường ghép thanh gỗ dọc
    for (const x of [-22, -11, 0, 11, 22]) {
      line(ctx, [[x, -48], [x * 0.95, 0]], darkWood, 1.2);
    }
    // Hai thanh nẹp ngang cố định
    for (const y of [-40, -10]) {
      line(ctx, [[-33, y], [33, y]], tone(woodCol, -0.15), 3.5);
    }

    // Biểu tượng lát chanh trang trí mặt trước (KHÔNG chữ viết!)
    ellipse(ctx, 0, -25, 10, 10, '#facc15', INK, 1.3);
    ellipse(ctx, 0, -25, 8, 8, '#fef08a', null);
    for (let i = 0; i < 6; i++) {
      const ang = (i * TAU) / 6;
      line(ctx, [[0, -25], [Math.cos(ang) * 7.5, -25 + Math.sin(ang) * 7.5]], '#facc15', 1.2);
    }

    // Mặt bàn quầy rộng
    path(ctx, 'M -38 -52 L 38 -52 L 36 -46 L -36 -46 Z', tone(woodCol, 0.15), INK, 1.4);

    // Bình nước chanh thủy tinh trên quầy
    ctx.save();
    const px = -18, py = -58;
    ellipse(ctx, px, py, 6, 7, 'rgba(125, 211, 252, 0.65)', INK, 1.0);
    // Nước chanh vàng sóng sánh bên trong
    ellipse(ctx, px, py + 2, 4.5, 4, '#fde047', null);
    // Quai bình & nắp
    path(ctx, `M ${px - 6} ${py - 3} Q ${px - 10} ${py} ${px - 5} ${py + 4}`, null, INK, 1.2);
    ellipse(ctx, px, py - 7, 3, 1, '#64748b', INK, 0.8);
    ctx.restore();

    // 2 chiếc cốc trên bàn
    for (const cx of [14, 22]) {
      path(ctx, `M ${cx - 3} ${py + 2} L ${cx + 3} ${py + 2} L ${cx + 2.5} ${py + 8} L ${cx - 2.5} ${py + 8} Z`, '#f8fafc', INK, 0.8);
      line(ctx, [[cx, py + 2], [cx + 2, py - 2]], '#ef4444', 1.0); // Ống hút
    }

    // Hai cột gỗ đỡ mái che
    for (const sx of [-30, 30]) {
      path(ctx, `M ${sx - 1.5} -90 L ${sx + 1.5} -90 L ${sx + 1.5} -50 L ${sx - 1.5} -50 Z`, darkWood, INK, 1.0);
    }

    // MÁI BẠT SỌC VÀNG TRẮNG CÓ RÈM LƯỢN SÓNG (Awning)
    path(ctx, 'M -38 -88 L 38 -88 L 42 -96 L -42 -96 Z', '#facc15', INK, 1.4);
    // Các dải sọc trắng
    for (const sx of [-28, -8, 12, 32]) {
      drawPoly(ctx, [[sx, -88], [sx + 9, -88], [sx + 10, -96], [sx + 1, -96]], '#f8fafc', null);
    }
    // Rèm lượn sóng viền mái
    for (let x = -36; x <= 36; x += 12) {
      ellipse(ctx, x, -87, 6, 2.5, '#facc15', INK, 1.0);
    }

    ctx.restore();
  }

  // 9. MAILBOX (Hộp thư kiểu Mỹ)
  function drawMailbox(ctx, s, t) {
    ctx.save();
    const flagUp = clamp(s.flag_up !== undefined ? s.flag_up : 0, 0, 1);
    const postCol = '#78350f';
    const metalCol = '#1e293b';

    // Trụ gỗ vuông cắm xuống đất
    path(ctx, 'M -4 -70 L 4 -70 L 4 0 L -4 0 Z', postCol, INK, 1.4);
    // Thanh giằng chéo đỡ
    path(ctx, 'M -4 -45 L 12 -68 L 15 -68 L -4 -38 Z', postCol, null);

    // Tấm đế gỗ đỡ hòm thư
    path(ctx, 'M -18 -72 L 20 -72 L 20 -68 L -18 -68 Z', tone(postCol, 0.2), INK, 1.2);

    // THÂN HỘP THƯ KIM LOẠI ĐỈNH VÒM
    // Thân ống nằm ngang
    path(ctx, 'M -16 -90 L 14 -90 L 14 -72 L -16 -72 Z', cylinder(ctx, -16, 14, metalCol), INK, 1.4);
    // Đáy sau khum tròn
    ellipse(ctx, -16, -81, 4, 9, metalCol, INK, 1.2);

    // CỬA TRƯỚC HÌNH VÒM CÓ TAY CẦM
    ellipse(ctx, 14, -81, 4.5, 9, tone(metalCol, 0.15), INK, 1.3);
    ellipse(ctx, 16, -81, 1.5, 2, '#eab308', null); // Khóa / chốt kéo

    // LÁ CỜ ĐỎ BÁO THƯ (Signal flag)
    const flagAng = mix(0, -Math.PI / 2, flagUp);
    ctx.save();
    ctx.translate(-10, -78);
    ctx.rotate(flagAng);
    line(ctx, [[0, 0], [14, 0]], '#dc2626', 2.0);
    path(ctx, 'M 14 -4 L 20 -4 L 20 4 L 14 4 Z', '#dc2626', INK, 0.8);
    ctx.restore();

    ctx.restore();
  }

  // 10. FIRE_HYDRANT (Trụ nước cứu hoả)
  function drawFireHydrant(ctx, s, t) {
    ctx.save();
    const redCol = '#dc2626';
    const ironCol = '#1c1917';

    // Bích đế sắt bắt bu-lông xuống đất
    path(ctx, 'M -16 -8 L 16 -8 L 18 0 L -18 0 Z', ironCol, INK, 1.4);
    for (const bx of [-12, -4, 4, 12]) {
      ellipse(ctx, bx, -4, 1.5, 1.5, '#78716c', null);
    }

    // Thân trụ hình trụ đứng đúc gờ nổi
    path(ctx, 'M -12 -58 L 12 -58 L 14 -8 L -14 -8 Z', cylinder(ctx, -12, 12, redCol), INK, 1.6);
    // Vòng gờ giữa
    path(ctx, 'M -13 -44 L 13 -44 L 13 -32 L -13 -32 Z', tone(redCol, 0.1), INK, 1.2);

    // Hai họng vòi phụ ở hai bên có nắp xích
    for (const side of [-1, 1]) {
      const nx = side * 15;
      path(ctx, `M ${side * 12} -41 L ${nx} -41 L ${nx} -35 L ${side * 12} -35 Z`, ironCol, INK, 1.2);
      ellipse(ctx, nx, -38, 2, 4, '#ca8a04', INK, 1.0);
      // Dây xích sắt giữ nắp
      path(ctx, `M ${nx} -35 Q ${side * 10} -30 ${side * 6} -32`, null, '#78716c', 1.0);
    }

    // Họng xả chính lớn ở mặt trước
    ellipse(ctx, 0, -38, 5, 5, ironCol, INK, 1.2);
    ellipse(ctx, 0, -38, 3.5, 3.5, '#ca8a04', INK, 1.0);

    // Nắp vòm trên đỉnh (Bonnet)
    ellipse(ctx, 0, -58, 13, 4, redCol, INK, 1.2);
    path(ctx, 'M -11 -58 Q 0 -68 11 -58 Z', tone(redCol, 0.15), INK, 1.4);
    // Đai ốc ngũ giác mở nước trên đỉnh
    path(ctx, 'M -3 -68 L 3 -68 L 2.5 -63 L -2.5 -63 Z', '#ca8a04', INK, 1.0);

    ctx.restore();
  }

  // 11. LIBERTY_STATUE_GENERIC (Tượng ngọn đuốc tự do chung chung)
  function drawLibertyStatueGeneric(ctx, s, t) {
    ctx.save();
    const growth = clamp(s.growth !== undefined ? s.growth : 1.0, 0, 1);
    const patina = '#10b981';
    const darkPatina = '#047857';
    const stoneCol = '#78716c';

    // 1. Bệ đá nhiều tầng kiểu cổ điển
    path(ctx, 'M -32 0 L 32 0 L 28 -8 L -28 -8 Z', tone(stoneCol, -0.2), INK, 1.4);
    path(ctx, 'M -26 -8 L 26 -8 L 22 -22 L -22 -22 Z', cylinder(ctx, -26, 26, stoneCol), INK, 1.4);
    path(ctx, 'M -24 -22 L 24 -22 L 24 -25 L -24 -25 Z', tone(stoneCol, 0.2), INK, 1.2);

    if (growth <= 0.1) {
      ctx.restore();
      return;
    }

    // Chiều cao tượng nâng lên theo growth
    const statueScale = clamp((growth - 0.1) / 0.9, 0, 1);
    ctx.save();
    ctx.translate(0, -25);
    ctx.scale(1, statueScale);

    // 2. Thân tượng khoác áo choàng xếp nếp La Mã
    path(ctx, 'M -16 0 L 16 0 L 12 -42 L -12 -42 Z', cylinder(ctx, -16, 16, patina), INK, 1.6);
    // Nếp gấp áo choàng
    for (let i = -10; i <= 10; i += 5) {
      path(ctx, `M ${i} 0 Q ${i * 0.7} -22 ${i * 0.5} -40`, null, darkPatina, 1.2);
    }

    // 3. Tay trái ôm tấm bảng (tablet)
    path(ctx, 'M -18 -36 L -11 -34 L -9 -46 L -16 -48 Z', '#6ee7b7', INK, 1.1);

    // 4. Cổ & Đầu đội vương miện 7 tia hào quang
    ellipse(ctx, 0, -49, 6.5, 7.5, patina, INK, 1.2);
    // Vương miện
    path(ctx, 'M -7 -52 Q 0 -54 7 -52', null, darkPatina, 2.0);
    // 7 tia hào quang nhọn tỏa ra
    for (let r = 0; r < 7; r++) {
      const ang = -Math.PI * 0.85 + (r * Math.PI * 0.7) / 6;
      line(ctx, [[Math.cos(ang) * 6, -51 + Math.sin(ang) * 6], [Math.cos(ang) * 11, -51 + Math.sin(ang) * 11]], darkPatina, 1.5);
    }

    // 5. Tay phải vươn cao giơ ngọn đuốc
    path(ctx, 'M 8 -40 L 15 -58 L 18 -57 L 11 -39 Z', patina, INK, 1.2);
    // Cán đuốc & bát đuốc
    path(ctx, 'M 14 -58 L 18 -66 L 19 -66 L 15 -58 Z', darkPatina, INK, 1.0);
    path(ctx, 'M 15 -66 L 21 -66 L 20 -69 L 16 -69 Z', '#ca8a04', INK, 1.0);
    // Ngọn lửa vàng rực bập bùng
    const flameFlicker = Math.sin(t * 10) * 1.5;
    path(ctx, `M 16 -69 Q 13 -74 ${18 + flameFlicker} -80 Q 23 -73 20 -69 Z`, '#facc15', INK, 1.0);
    ellipse(ctx, 18, -72, 1.8, 3, '#fef08a', null);

    ctx.restore();
    ctx.restore();
  }

  // 12. RAILROAD_TRACK (Đoạn ray xe lửa)
  function drawRailroadTrack(ctx, s, t) {
    ctx.save();
    const growth = clamp(s.growth !== undefined ? s.growth : 1.0, 0, 1);
    const ballastCol = '#78716c';
    const sleeperCol = '#451a03';
    const steelCol = '#94a3b8';

    const maxW = 58;
    const curW = maxW * growth;

    // Nền đá dăm (Ballast)
    path(ctx, `M ${-curW} 0 L ${curW} 0 L ${curW * 0.95} -4 L ${-curW * 0.95} -4 Z`, ballastCol, null);

    // Các thanh tà vẹt gỗ (Sleepers)
    const numTies = Math.floor(11 * growth);
    for (let i = 0; i <= numTies; i++) {
      const tx = -maxW + (i / 11) * (maxW * 2);
      if (Math.abs(tx) > curW) continue;
      path(ctx, `M ${tx - 2.5} 0 L ${tx + 2.5} 0 L ${tx + 2} -6 L ${tx - 2} -6 Z`, sleeperCol, INK, 0.8);
    }

    // Hai dải ray thép song song sáng loáng
    if (growth > 0.05) {
      // Ray dưới
      path(ctx, `M ${-curW} -4 L ${curW} -4`, null, steelCol, 3.2);
      path(ctx, `M ${-curW} -5 L ${curW} -5`, null, '#f8fafc', 1.2);
      // Ray trên
      path(ctx, `M ${-curW * 0.95} -10 L ${curW * 0.95} -10`, null, steelCol, 3.2);
      path(ctx, `M ${-curW * 0.95} -11 L ${curW * 0.95} -11`, null, '#f8fafc', 1.2);
    }

    ctx.restore();
  }

  // 13. MOON_FOOTPRINT (Dấu chân trên Mặt Trăng)
  function drawMoonFootprint(ctx, s, t) {
    ctx.save();
    const soilCol = '#374151';
    const shadowCol = '#1f2937';
    const rimCol = '#9ca3af';

    // Rãnh hõm của vết ủng du hành vũ trụ
    ellipse(ctx, 0, -34, 18, 33, shadowCol, null);
    ellipse(ctx, 0, -34, 17, 32, soilCol, null);

    // Gờ mép sáng xung quanh do bụi mặt trăng bị nén
    path(ctx, 'M -17 -34 Q -18 -66 0 -66 Q 18 -66 17 -34', null, rimCol, 1.4);

    // Các rãnh khía ngang đế giày chống trượt (Tread ribs)
    for (let y = -58; y <= -24; y += 5.5) {
      const w = 15 - Math.abs(y + 40) * 0.35;
      line(ctx, [[-w, y], [w, y]], shadowCol, 2.5);
      line(ctx, [[-w, y - 0.5], [w, y - 0.5]], rimCol, 0.8);
    }

    // Khối gót giày riêng biệt phía dưới
    line(ctx, [[-11, -16], [11, -16]], shadowCol, 4.0);
    line(ctx, [[-10, -8], [10, -8]], shadowCol, 3.5);

    ctx.restore();
  }

  // 14. SEISMOMETER (Thiết bị đo địa chấn Mặt Trăng)
  function drawSeismometer(ctx, s, t) {
    ctx.save();
    const goldFoil = '#eab308';
    const darkGold = '#a16207';
    const solarBlue = '#1e3a8a';
    const metalCol = '#cbd5e1';

    // Khối trạm trung tâm bọc màng vàng phản quang (Kapton foil)
    path(ctx, 'M -16 0 L 16 0 L 14 -16 L -14 -16 Z', cylinder(ctx, -16, 16, goldFoil), INK, 1.3);
    // Nếp nhăn màng cách nhiệt vàng
    for (const x of [-9, -2, 5, 11]) {
      line(ctx, [[x, 0], [x * 0.85, -16]], darkGold, 1.0);
    }

    // Hai cánh pin mặt trời mở ra hai bên
    for (const side of [-1, 1]) {
      const px = side * 14;
      path(ctx, `M ${px} -4 L ${px + side * 22} -4 L ${px + side * 20} -14 L ${px} -12 Z`, solarBlue, INK, 1.2);
      // Lưới tế bào quang điện
      line(ctx, [[px + side * 10, -4], [px + side * 10, -13]], '#38bdf8', 1.0);
      line(ctx, [[px + side * 2, -8], [px + side * 20, -8]], '#38bdf8', 0.8);
    }

    // Ống cảm biến trung tâm
    path(ctx, 'M -6 -16 L 6 -16 L 5 -26 L -5 -26 Z', metalCol, INK, 1.1);

    // Chảo ăng-ten parabol hướng lên vũ trụ
    path(ctx, 'M -10 -30 Q 0 -34 10 -30 Q 0 -26 -10 -30', goldFoil, INK, 1.2);
    line(ctx, [[0, -26], [0, -32]], metalCol, 1.5);
    ellipse(ctx, 0, -33, 1.5, 1.5, '#ef4444', null);

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS (6 backgrounds, ground_y: 810, 7 weathers, day/night)
  // =============================================================

  // 1. SUBURB_BACKYARD (Sân sau khu ngoại ô Mỹ)
  function drawSuburbBackyard(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.7);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(1, '#1e1b4b');
    } else {
      sky.addColorStop(0, '#7dd3fc');
      sky.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY);

    // Mây trắng ban ngày hoặc trăng sao ban đêm
    if (isNight) {
      ctx.fillStyle = '#ffffff';
      for (const [sx, sy] of [[80, 100], [160, 60], [250, 120], [380, 80], [480, 140]]) {
        ctx.fillRect(sx, sy, 2, 2);
      }
      ellipse(ctx, 460, 120, 22, 22, '#fef08a', null);
      ellipse(ctx, 452, 116, 20, 20, '#1e1b4b', null);
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ellipse(ctx, 140, 150, 60, 20, null); ctx.fill();
      ellipse(ctx, 380, 180, 75, 24, null); ctx.fill();
    }

    // Đường chân trời xa: rặng cây phong và mái nhà ngoại ô
    const horizonCol = isNight ? '#0f172a' : '#94a3b8';
    path(ctx, `M 0 620 Q 140 590 280 615 T 576 605 L 576 ${groundY} L 0 ${groundY} Z`, horizonCol, null);

    // Mái ngói tam giác của nhà hàng xóm phía xa
    const roofCol = isNight ? '#1e293b' : '#b91c1c';
    drawPoly(ctx, [[80, 620], [140, 560], [200, 620]], roofCol, null);
    drawPoly(ctx, [[360, 615], [430, 550], [500, 615]], isNight ? '#1e293b' : '#334155', null);

    // HÀNG RÀO GỖ TRẮNG ĐẶC TRƯNG NGOẠI Ô (Picket fence)
    const fenceY = groundY - 110;
    const picketCol = isNight ? '#64748b' : '#f8fafc';
    const fenceShadow = isNight ? '#334155' : '#cbd5e1';

    // Hai thanh xà ngang của hàng rào
    line(ctx, [[0, fenceY + 25], [576, fenceY + 25]], fenceShadow, 5);
    line(ctx, [[0, fenceY + 65], [576, fenceY + 65]], fenceShadow, 5);

    // Các thanh cọc rào có đầu nhọn
    for (let x = 12; x < 576; x += 22) {
      path(ctx, `M ${x - 6} ${fenceY + 80} L ${x - 6} ${fenceY} L ${x} ${fenceY - 8} L ${x + 6} ${fenceY} L ${x + 6} ${fenceY + 80} Z`, picketCol, INK, 1.0);
    }

    // Bụi hoa cẩm tú cầu & cây bụi xanh dọc chân rào
    const bushCol = isNight ? '#064e3b' : '#15803d';
    for (let x = 30; x < 576; x += 90) {
      ellipse(ctx, x, fenceY + 75, 45, 22, bushCol, null);
      if (!isNight) {
        ellipse(ctx, x - 10, fenceY + 70, 6, 6, '#f472b6', null);
        ellipse(ctx, x + 15, fenceY + 72, 7, 7, '#60a5fa', null);
      }
    }

    // THẢM CỎ XANH MƯỢT SÂN SAU ĐẾN ground_y
    const lawnCol = isNight ? '#022c22' : '#22c55e';
    path(ctx, `M 0 ${groundY - 30} L 576 ${groundY - 30} L 576 1024 L 0 1024 Z`, lawnCol, null);
    line(ctx, [[0, groundY], [576, groundY]], isNight ? '#064e3b' : '#16a34a', 2.5);

    ctx.restore();
  }

  // 2. NATIONAL_PARK (Vườn quốc gia hẻm núi đá đỏ và thác nước)
  function drawNationalPark(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.6);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(1, '#1e1b4b');
    } else {
      sky.addColorStop(0, '#38bdf8');
      sky.addColorStop(1, '#fef08a'); // Ánh vàng rực rỡ hoàng hôn hoặc ban mai
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY);

    if (isNight) {
      ctx.fillStyle = '#ffffff';
      for (const [sx, sy] of [[70, 80], [180, 50], [280, 110], [420, 60], [510, 130]]) {
        ctx.fillRect(sx, sy, 2, 2);
      }
    }

    // 1. Rặng núi đá đỏ / Grand Canyon sa thạch phía xa
    const mesaFar = isNight ? '#1e1b4b' : '#c2410c';
    path(ctx, `M 0 540 L 90 440 L 220 440 L 260 520 L 360 410 L 480 410 L 576 500 L 576 ${groundY} L 0 ${groundY} Z`, mesaFar, null);

    // 2. Vách núi đá hoa cương cao sừng sững bên trái
    const rockLeft = isNight ? '#0f172a' : '#7c2d12';
    path(ctx, `M 0 320 Q 70 340 100 450 Q 140 560 160 700 L 0 720 Z`, rockLeft, INK, 1.4);
    // Các tầng địa chất vân đá nằm ngang
    for (let y = 380; y <= 660; y += 40) {
      line(ctx, [[0, y], [140 - (y - 380) * 0.1, y + 10]], isNight ? '#1e293b' : '#9a3412', 3);
    }

    // 3. Thác nước trắng xóa đổ từ khe núi đá xuống dòng suối
    const fallX = 320;
    const waterCol = isNight ? '#38bdf8' : '#e0f2fe';
    // Dòng thác trắng
    path(ctx, `M ${fallX - 8} 440 L ${fallX + 8} 440 L ${fallX + 16} 680 L ${fallX - 16} 680 Z`, waterCol, null);
    // Bọt nước bắn tung tóe ở chân thác
    ellipse(ctx, fallX, 680, 36, 12, 'rgba(255, 255, 255, 0.75)', null);

    // Rừng thông kim bao quanh vách đá
    const pineCol = isNight ? '#022c22' : '#14532d';
    for (const [px, py, ph] of [[180, 640, 50], [210, 660, 40], [420, 630, 60], [460, 650, 45], [490, 670, 35]]) {
      drawPoly(ctx, [[px, py - ph], [px - ph * 0.35, py], [px + ph * 0.35, py]], pineCol, null);
    }

    // 4. Dòng suối biếc uốn lượn
    const riverCol = isNight ? '#0369a1' : '#06b6d4';
    path(ctx, `M 240 680 Q 300 710 400 720 L 576 740 L 576 ${groundY - 40} L 280 ${groundY - 40} Z`, riverCol, null);

    // 5. Bờ suối sỏi đá & mặt đất tự nhiên tại ground_y
    const groundCol = isNight ? '#1c1917' : '#78716c';
    path(ctx, `M 0 ${groundY - 50} L 576 ${groundY - 50} L 576 1024 L 0 1024 Z`, groundCol, null);
    // Vài hòn đá tảng trên bờ
    for (const [rx, ry] of [[80, groundY - 15], [140, groundY - 8], [440, groundY - 20], [510, groundY - 12]]) {
      ellipse(ctx, rx, ry, 16, 9, tone(groundCol, -0.2), INK, 1.2);
    }
    line(ctx, [[0, groundY], [576, groundY]], isNight ? '#292524' : '#57534e', 2.5);

    ctx.restore();
  }

  // 3. WILD_WEST_TOWN (Thị trấn miền Tây hoang dã)
  function drawWildWestTown(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời sa mạc hoàng hôn vàng cam ấm áp
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(1, '#2e1065');
    } else {
      sky.addColorStop(0, '#f97316');
      sky.addColorStop(1, '#fde047');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY);

    // Ngọn núi sa thạch đỉnh bằng (Mesa) phía xa
    const mesaCol = isNight ? '#1e1b4b' : '#9a3412';
    drawPoly(ctx, [[40, 560], [90, 480], [210, 480], [260, 560]], mesaCol, null);
    drawPoly(ctx, [[380, 570], [420, 500], [520, 500], [560, 570]], mesaCol, null);

    // Cây xương rồng saguaro khổng lồ vươn cành
    const cactusCol = isNight ? '#064e3b' : '#14532d';
    line(ctx, [[60, 560], [60, 490]], cactusCol, 7);
    line(ctx, [[48, 520], [60, 520]], cactusCol, 5);
    line(ctx, [[48, 520], [48, 505]], cactusCol, 5);
    line(ctx, [[60, 530], [72, 530]], cactusCol, 5);
    line(ctx, [[72, 530], [72, 510]], cactusCol, 5);

    // DÃY NHÀ GỖ MẶT TIỀN MIỀN TÂY (False-front wooden buildings)
    // Nhà bên trái
    const woodB1 = isNight ? '#1e293b' : '#78350f';
    drawPoly(ctx, [[10, 740], [10, 560], [170, 560], [170, 740]], woodB1, INK, 1.4);
    // Lan can nóc nhà giả mặt tiền
    drawPoly(ctx, [[5, 560], [175, 560], [175, 545], [5, 545]], tone(woodB1, 0.2), INK, 1.2);
    // Mái hiên gỗ che vỉa hè
    path(ctx, 'M 5 630 L 175 630 L 180 645 L 0 645 Z', tone(woodB1, -0.15), INK, 1.2);
    for (const px of [15, 90, 165]) line(ctx, [[px, 645], [px, 755]], '#451a03', 3.5);

    // Nhà bên phải
    const woodB2 = isNight ? '#1c1917' : '#92400e';
    drawPoly(ctx, [[400, 740], [400, 580], [565, 580], [565, 740]], woodB2, INK, 1.4);
    drawPoly(ctx, [[395, 580], [570, 580], [570, 565], [395, 565]], tone(woodB2, 0.2), INK, 1.2);
    // Cửa sổ & cửa ra vào
    drawPoly(ctx, [[430, 610], [470, 610], [470, 650], [430, 650]], isNight ? '#fef08a' : '#f8fafc', INK, 1.0);

    // VỈA HÈ LÁT GỖ (Wooden boardwalk)
    const boardwalkCol = isNight ? '#292524' : '#b45309';
    path(ctx, 'M 0 740 L 180 740 L 185 765 L 0 765 Z', boardwalkCol, INK, 1.3);
    path(ctx, 'M 390 740 L 576 740 L 576 765 L 385 765 Z', boardwalkCol, INK, 1.3);
    // Cọc buộc ngựa (Hitching rail)
    line(ctx, [[195, 750], [240, 750]], '#451a03', 4);
    line(ctx, [[200, 750], [200, 775]], '#451a03', 3);
    line(ctx, [[235, 750], [235, 775]], '#451a03', 3);

    // ĐƯỜNG ĐẤT BỤI MIỀN TÂY Ở GIỮA ĐẾN ground_y
    const dirtCol = isNight ? '#262626' : '#d97706';
    path(ctx, `M 0 765 L 576 765 L 576 1024 L 0 1024 Z`, cylinder(ctx, 0, 576, dirtCol), null);
    line(ctx, [[0, groundY], [576, groundY]], isNight ? '#1c1917' : '#92400e', 2.5);

    // Bụi cây lăn (Tumbleweed)
    ellipse(ctx, 290, groundY - 14, 14, 14, null, isNight ? '#44403c' : '#a8a29e', 1.4);

    ctx.restore();
  }

  // 4. LAUNCH_PAD (Bệ phóng tên lửa bờ biển)
  function drawLaunchPad(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời rộng mở của bờ biển Florida
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.7);
    if (isNight) {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(1, '#0f172a');
    } else {
      sky.addColorStop(0, '#0284c7');
      sky.addColorStop(1, '#bae6fd');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY);

    if (isNight) {
      ctx.fillStyle = '#ffffff';
      for (const [sx, sy] of [[90, 80], [200, 60], [310, 110], [440, 70], [530, 120]]) {
        ctx.fillRect(sx, sy, 2, 2);
      }
    }

    // Bờ biển xa xăm & đại dương xanh
    const oceanCol = isNight ? '#082f49' : '#0284c7';
    path(ctx, `M 0 640 L 576 640 L 576 680 L 0 680 Z`, oceanCol, null);

    // THÁP PHỤC VỤ PHÓNG (Launch Umbilical Tower - giàn thép giằng chéo đỏ cam)
    const towerX = 140;
    const towerCol = isNight ? '#7f1d1d' : '#dc2626';
    const towerW = 54;
    // Cột trụ đứng 2 bên
    line(ctx, [[towerX - towerW / 2, 220], [towerX - towerW / 2, 730]], towerCol, 5);
    line(ctx, [[towerX + towerW / 2, 220], [towerX + towerW / 2, 730]], towerCol, 5);
    // Các dầm ngang & thanh giằng chéo chữ X
    for (let y = 240; y <= 710; y += 45) {
      line(ctx, [[towerX - towerW / 2, y], [towerX + towerW / 2, y]], towerCol, 2.5);
      line(ctx, [[towerX - towerW / 2, y], [towerX + towerW / 2, y + 45]], towerCol, 1.8);
      line(ctx, [[towerX + towerW / 2, y], [towerX - towerW / 2, y + 45]], towerCol, 1.8);
    }
    // Cột thu lôi vút cao trên đỉnh tháp
    line(ctx, [[towerX, 220], [towerX, 150]], '#94a3b8', 2.5);

    // Cần xoay tiếp nhiên liệu (Swing arms) vươn sang phải
    for (const ay of [320, 440, 560]) {
      path(ctx, `M ${towerX + towerW / 2} ${ay} L ${towerX + towerW / 2 + 55} ${ay + 5} L ${towerX + towerW / 2 + 55} ${ay + 18} L ${towerX + towerW / 2} ${ay + 14} Z`, '#64748b', INK, 1.2);
    }

    // BỆ BÊ TÔNG ĐỠ TÊN LỬA & MƯƠNG THOÁT KHÍ (Flame trench / launch mount)
    const concrete = isNight ? '#334155' : '#94a3b8';
    path(ctx, `M 80 730 L 480 730 L 510 780 L 50 780 Z`, cylinder(ctx, 50, 510, concrete), INK, 1.6);
    // Họng mương thoát khói lửa ở giữa
    path(ctx, 'M 210 730 L 350 730 L 370 780 L 190 780 Z', '#1e293b', INK, 1.4);

    // ĐÈN CẢNH BÁO CAO ĐỘ (Warning lights)
    ellipse(ctx, towerX, 148, 3, 3, '#ef4444', null);
    ellipse(ctx, towerX - towerW / 2, 220, 2.5, 2.5, '#ef4444', null);

    // MẶT SÀN BÊ TÔNG CHỊU LỰC TẠI ground_y
    const padCol = isNight ? '#1e293b' : '#64748b';
    path(ctx, `M 0 780 L 576 780 L 576 1024 L 0 1024 Z`, padCol, null);
    line(ctx, [[0, groundY], [576, groundY]], isNight ? '#0f172a' : '#475569', 3.0);

    ctx.restore();
  }

  // 5. PUMPKIN_PATCH (Cánh đồng bí ngô mùa thu)
  function drawPumpkinPatch(ctx, settings, t) {
    ctx.save();
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Bầu trời mùa thu
    const sky = ctx.createLinearGradient(0, 0, 0, groundY * 0.65);
    if (isNight) {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(1, '#311042'); // Đêm lễ hội hơi tím huyền ảo
    } else {
      sky.addColorStop(0, '#38bdf8');
      sky.addColorStop(1, '#fed7aa'); // Chiều thu êm ả
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 576, groundY);

    if (isNight) {
      // Trăng tròn mùa thu to lớn (Harvest Moon)
      ellipse(ctx, 430, 160, 36, 36, '#fef08a', null);
      ctx.fillStyle = '#ffffff';
      for (const [sx, sy] of [[60, 90], [170, 70], [280, 130], [360, 80], [520, 110]]) {
        ctx.fillRect(sx, sy, 2, 2);
      }
    }

    // Những đồi cỏ úa & hàng cây thu lá đỏ vàng đằng xa
    const hillCol = isNight ? '#1c1917' : '#ca8a04';
    path(ctx, `M 0 600 Q 150 560 300 590 T 576 575 L 576 ${groundY} L 0 ${groundY} Z`, hillCol, null);

    // Cây mùa thu lá cam đỏ
    for (const [tx, ty, r, c] of [[80, 560, 32, '#dc2626'], [140, 570, 26, '#ea580c'], [480, 550, 38, '#b45309']]) {
      ellipse(ctx, tx, ty, r, r * 1.1, isNight ? '#451a03' : c, null);
    }

    // Kho thóc đỏ (Red barn) xa xa
    const barnCol = isNight ? '#450a0a' : '#b91c1c';
    drawPoly(ctx, [[320, 580], [350, 550], [380, 580]], barnCol, null);
    drawPoly(ctx, [[320, 580], [380, 580], [380, 605], [320, 605]], barnCol, null);

    // Cuộn rơm tròn (Hay bales)
    const hayCol = isNight ? '#713f12' : '#facc15';
    ellipse(ctx, 110, 660, 24, 16, hayCol, INK, 1.2);
    ellipse(ctx, 96, 660, 10, 16, tone(hayCol, -0.15), INK, 1.2);

    // MẶT ĐẤT CANH TÁC NÂU MÀU MỠ TẠI ground_y
    const soilCol = isNight ? '#271c19' : '#78350f';
    path(ctx, `M 0 680 L 576 680 L 576 1024 L 0 1024 Z`, soilCol, null);

    // Dây leo bí ngô xanh ngoằn ngoèo & lá bí ngô xòe rộng
    const vineCol = isNight ? '#064e3b' : '#15803d';
    path(ctx, 'M 40 730 Q 120 700 220 740 T 420 720 T 560 750', null, vineCol, 3.5);
    for (const [vx, vy] of [[70, 720], [160, 725], [260, 735], [360, 715], [470, 740]]) {
      ellipse(ctx, vx, vy, 10, 8, vineCol, null, 0.4);
      // Quả bí ngô nằm rải rác trên cánh đồng
      ellipse(ctx, vx + 14, vy + 4, 12, 10, isNight ? '#9a3412' : '#f97316', INK, 1.0);
    }

    line(ctx, [[0, groundY], [576, groundY]], isNight ? '#1c1917' : '#451a03', 2.5);

    ctx.restore();
  }

  // 6. MOON_SURFACE (Bề mặt Mặt Trăng với hố thiên thạch & Trái Đất)
  function drawMoonSurface(ctx, settings, t) {
    ctx.save();
    const groundY = (settings && settings.ground_y) || 810;

    // Không gian vũ trụ đen sâu thẳm
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, 576, groundY);

    // Hàng ngàn vì sao lấp lánh (tất định theo vị trí)
    ctx.fillStyle = '#ffffff';
    const stars = [
      [40, 80], [90, 160], [140, 60], [210, 130], [260, 75],
      [310, 180], [360, 95], [450, 70], [510, 140], [540, 50],
      [75, 260], [160, 320], [240, 280], [330, 360], [480, 290]
    ];
    for (const [sx, sy] of stars) {
      ctx.fillRect(sx, sy, 1.8, 1.8);
    }

    // TRÁI ĐẤT XANH HY VỌNG (Blue Marble / Earthrise)
    const ex = 430, ey = 180, er = 40;
    // Bầu khí quyển phát sáng dịu
    ctx.save();
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 18;
    ellipse(ctx, ex, ey, er, er, '#0284c7', null);
    ctx.restore();
    // Các mảng lục địa xanh lá & mây trắng xoáy lượn
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, TAU);
    ctx.clip();
    // Lục địa
    ellipse(ctx, ex - 12, ey - 6, 18, 14, '#15803d', null, 0.4);
    ellipse(ctx, ex + 10, ey + 12, 16, 12, '#166534', null, -0.2);
    // Dải mây trắng
    path(ctx, `M ${ex - 35} ${ey - 10} Q ${ex} ${ey - 25} ${ex + 35} ${ey - 15}`, null, 'rgba(255, 255, 255, 0.85)', 4.5);
    path(ctx, `M ${ex - 30} ${ey + 15} Q ${ex + 5} ${ey + 2} ${ex + 32} ${ey + 10}`, null, 'rgba(255, 255, 255, 0.85)', 5.0);
    // Vùng tối đêm của Trái Đất (bán nguyệt)
    path(ctx, `M ${ex} ${ey - er} A ${er} ${er} 0 0 1 ${ex} ${ey + er} A ${er * 0.4} ${er} 0 0 1 ${ex} ${ey - er}`, 'rgba(2, 6, 23, 0.65)', null);
    ctx.restore();

    // RẶNG ĐỒI MẶT TRĂNG KHUM KHUM GỒ GHỀ (Lunar horizon)
    const moonGrey = '#4b5563';
    path(ctx, `M 0 640 Q 120 610 260 635 T 576 620 L 576 ${groundY} L 0 ${groundY} Z`, moonGrey, null);
    path(ctx, `M 0 680 Q 180 655 360 675 T 576 660 L 576 ${groundY} L 0 ${groundY} Z`, '#6b7280', null);

    // MẶT ĐẤT BỤI MẶT TRĂNG (Lunar regolith) TẠI ground_y
    path(ctx, `M 0 710 L 576 710 L 576 1024 L 0 1024 Z`, '#9ca3af', null);

    // CÁC HỐ THIÊN THẠCH (Craters) VỚI GỜ NỔI VÀ BÓNG TỐI SÂU
    const craters = [
      [120, 740, 36, 12],
      [340, 735, 45, 14],
      [490, 755, 28, 9],
      [220, 770, 55, 16],
      [80, groundY + 15, 60, 18],
      [420, groundY + 20, 50, 15]
    ];
    for (const [cx, cy, rx, ry] of craters) {
      // Đáy hố bóng tối sâu
      ellipse(ctx, cx, cy, rx, ry, '#4b5563', null);
      ellipse(ctx, cx + rx * 0.2, cy, rx * 0.7, ry * 0.75, '#1f2937', null);
      // Gờ sáng đón ánh sáng ở vành hố
      path(ctx, `M ${cx - rx} ${cy} Q ${cx} ${cy - ry * 1.3} ${cx + rx} ${cy}`, null, '#e5e7eb', 2.0);
    }

    // Những tảng đá thiên thạch rải rác
    for (const [bx, by, br] of [[180, 725, 6], [290, 745, 8], [470, 730, 5], [530, 760, 9]]) {
      ellipse(ctx, bx, by, br, br * 0.75, '#374151', INK, 1.0);
      ellipse(ctx, bx - 1, by - 1, br * 0.5, br * 0.35, '#d1d5db', null);
    }

    line(ctx, [[0, groundY], [576, groundY]], '#6b7280', 2.5);

    ctx.restore();
  }

  // =============================================================
  // DETERMINISTIC FIREWORKS EFFECT (Hiệu ứng pháo hoa tất định)
  // =============================================================

  function fireworksEffect(ctx, snapshot, cat, kit) {
    if (!snapshot) return;
    const hasAction = snapshot.actions && snapshot.actions.some(a => a.active && a.type === 'fireworks');
    const hasScene = snapshot.scene && snapshot.scene.fireworks;
    const hasState = Object.values(snapshot.states || {}).some(s => s && s.fireworks);
    if (!hasAction && !hasScene && !hasState) return;

    ctx.save();
    const t = snapshot.t || 0;

    // 3 loạt chùm pháo hoa ở các vị trí khác nhau, hoàn toàn tất định theo thời gian
    const bursts = [
      { seed: 101, cx: 160, cy: 280, period: 1.8, offset: 0.1, colors: ['#f43f5e', '#fbbf24', '#ffffff'] },
      { seed: 202, cx: 320, cy: 210, period: 2.1, offset: 0.7, colors: ['#38bdf8', '#a855f7', '#ffffff'] },
      { seed: 303, cx: 440, cy: 260, period: 1.9, offset: 1.3, colors: ['#34d399', '#fde047', '#ffffff'] },
    ];

    for (const b of bursts) {
      const cycleTime = (t + b.offset) % b.period;
      const progress = cycleTime / b.period; // 0..1

      if (progress < 0.28) {
        // Giai đoạn 1: Đạn pháo bay vút lên từ dưới đất
        const u = progress / 0.28;
        const trailY = mix(750, b.cy, smooth(u));
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(b.cx, trailY, 2.8, 0, TAU);
        ctx.fill();
        // Vệt khói sáng kéo sau
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(b.cx, trailY + 12);
        ctx.lineTo(b.cx, trailY);
        ctx.stroke();
      } else {
        // Giai đoạn 2: Pháo hoa nổ tung tỏa ra các tia lấp lánh
        const expProg = (progress - 0.28) / 0.72; // 0..1
        const alpha = Math.max(0, 1 - expProg * expProg);
        const maxR = 68 * smooth(expProg);
        const numRays = 16;

        for (let i = 0; i < numRays; i++) {
          const ang = (i * TAU) / numRays + Math.sin(b.seed + i) * 0.12;
          const r = maxR * (0.8 + 0.2 * Math.sin(b.seed * 3 + i * 5));
          const drop = expProg * expProg * 16; // Trọng lực rơi
          const px = b.cx + Math.cos(ang) * r;
          const py = b.cy + Math.sin(ang) * r + drop;
          const col = b.colors[i % b.colors.length];

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1, 2.6 * (1 - expProg * 0.75)), 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  // =============================================================
  // ACTION HOOKS (carve)
  // =============================================================

  const US_CULTURE_ACTION_HOOKS = {
    carve(a, states, t, p, u, amount, cat, active) {
      const target = states[a.target];
      if (!target) return;
      // Trạng thái cutaway và lit của bí ngô tăng dần theo p
      target.cutaway = p;
      target.lit = p;

      const actor = states[a.actor];
      if (!actor) return;
      // IK tay của nhân vật đưa qua lại thao tác khắc
      const surf = RemakeVector.worldAnchor(cat, target, 'surface') || RemakeVector.worldAnchor(cat, target, 'mouth') || { x: target.x, y: target.y - 25 };
      const cutMotion = Math.sin(t * 14) * 5;
      const local = RemakeVector.worldToLocal(actor, { x: surf.x + cutMotion, y: surf.y });
      const rest = RemakeVector.localAnchor(cat, actor, 'hand_r') || [18, -25];
      actor.hand_r_x = mix(rest[0], local[0], amount);
      actor.hand_r_y = mix(rest[1], local[1], amount);
    }
  };

  // =============================================================
  // REGISTRATION (RemakeVector.register)
  // =============================================================

  const US_CULTURE_RIGS = {
    bison: {
      draw(ctx, s, t) { drawBison(ctx, s, t); }
    },
    bear: {
      draw(ctx, s, t) { drawBear(ctx, s, t); }
    },
    prairie_dog: {
      draw(ctx, s, t) { drawPrairieDog(ctx, s, t); }
    },
    raccoon: {
      draw(ctx, s, t) { drawRaccoon(ctx, s, t); }
    },
    salmon: {
      draw(ctx, s, t) { drawSalmon(ctx, s, t); }
    },
    jack_o_lantern: {
      draw(ctx, s, t) { drawJackOLantern(ctx, s, t); }
    },
    harvest_basket: {
      draw(ctx, s, t) { drawHarvestBasket(ctx, s, t); }
    },
    lemonade_stand: {
      draw(ctx, s, t) { drawLemonadeStand(ctx, s, t); }
    },
    mailbox: {
      draw(ctx, s, t) { drawMailbox(ctx, s, t); }
    },
    fire_hydrant: {
      draw(ctx, s, t) { drawFireHydrant(ctx, s, t); }
    },
    liberty_statue_generic: {
      draw(ctx, s, t) { drawLibertyStatueGeneric(ctx, s, t); }
    },
    railroad_track: {
      draw(ctx, s, t) { drawRailroadTrack(ctx, s, t); }
    },
    moon_footprint: {
      draw(ctx, s, t) { drawMoonFootprint(ctx, s, t); }
    },
    seismometer: {
      draw(ctx, s, t) { drawSeismometer(ctx, s, t); }
    }
  };

  const US_CULTURE_BACKGROUNDS = {
    suburb_backyard: {
      label: 'Sân sau khu ngoại ô Mỹ',
      theme: 'home',
      ground_y: 810,
      draw(ctx, settings, t) { drawSuburbBackyard(ctx, settings, t); }
    },
    national_park: {
      label: 'Vườn quốc gia hẻm núi và thác nước',
      theme: 'nature',
      ground_y: 810,
      draw(ctx, settings, t) { drawNationalPark(ctx, settings, t); }
    },
    wild_west_town: {
      label: 'Thị trấn miền Tây hoang dã',
      theme: 'home',
      ground_y: 810,
      draw(ctx, settings, t) { drawWildWestTown(ctx, settings, t); }
    },
    launch_pad: {
      label: 'Bệ phóng tên lửa bờ biển',
      theme: 'space',
      ground_y: 810,
      draw(ctx, settings, t) { drawLaunchPad(ctx, settings, t); }
    },
    pumpkin_patch: {
      label: 'Cánh đồng bí ngô mùa thu',
      theme: 'farm',
      ground_y: 810,
      draw(ctx, settings, t) { drawPumpkinPatch(ctx, settings, t); }
    },
    moon_surface: {
      label: 'Bề mặt Mặt Trăng với hố thiên thạch',
      theme: 'space',
      ground_y: 810,
      draw(ctx, settings, t) { drawMoonSurface(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    backgrounds: US_CULTURE_BACKGROUNDS,
    rigs: US_CULTURE_RIGS,
    effects: [fireworksEffect],
    actionHooks: US_CULTURE_ACTION_HOOKS
  });

})();
