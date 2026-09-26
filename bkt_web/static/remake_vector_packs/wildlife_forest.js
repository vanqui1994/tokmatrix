// Remake Vector Engine Pack: Wildlife Forest (Rừng ôn đới & Thú ngộ nghĩnh)
// Rigs: koala, red_panda, donkey, pug, shiba, hedgehog, sloth, beaver, black_goat, white_goat, fluffy_sheep, squirrel, turtle
(function() {
  'use strict';
  if (!globalThis.RemakeVector) throw new Error('RemakeVector core engine must be loaded before engine packs.');
  const { kit, register } = globalThis.RemakeVector;
  const { INK, tone, volume, cylinder, limb, ellipse, path, line, withCut, hash, clamp, smooth } = kit;

  function drawEye(ctx, x, y, r, blink, dirX = 1, irisColor = '#2b231d') {
    if (blink > 0.7) {
      path(ctx, `M ${x - r} ${y} Q ${x} ${y + r * 0.8} ${x + r} ${y}`, null, INK, 1.6);
      return;
    }
    const h = r * (1 - blink * 0.8);
    ellipse(ctx, x, y, r, h, '#ffffff', INK, 1.2);
    const pupilX = x + dirX * (r * 0.25);
    ellipse(ctx, pupilX, y, r * 0.55, h * 0.55, irisColor, null);
    ellipse(ctx, pupilX, y, r * 0.32, h * 0.32, '#111111', null);
    ellipse(ctx, pupilX - r * 0.18, y - h * 0.18, r * 0.2, h * 0.2, '#ffffff', null);
  }

  function drawQuadLeg(ctx, lx, near, phaseOff, walk, stride, spec) {
    const phase = stride + phaseOff;
    const swing = -Math.sin(phase) * walk * (spec.strideDist || 12);
    const lift = Math.max(0, -Math.cos(phase)) * walk * (spec.liftHeight || 7);
    const topY = spec.legTop || -28;
    const len = spec.legLen || 28;
    const w = spec.legWidth || 6.5;
    const col = near ? spec.color : tone(spec.color, -0.2);

    const footX = lx + swing;
    const footY = -lift;
    const kneeX = lx * 0.7 + footX * 0.3 + (spec.kneeBend || 0);
    const kneeY = topY + len * 0.5 - lift * 0.25;

    limb(ctx, [[lx, topY], [kneeX, kneeY], [footX, footY - 3]], col, w);

    if (spec.footType === 'hoof') {
      path(ctx, `M ${footX - w * 0.5} ${footY - 3} L ${footX + w * 0.6} ${footY - 3} L ${footX + w * 0.45} ${footY} L ${footX - w * 0.45} ${footY} Z`, spec.hoofColor || '#222222', INK, 0.8);
    } else {
      ellipse(ctx, footX + 1, footY - 2, w * 0.65, 3, col, INK, 1);
    }
  }

  // 1. KOALA (Gấu túi)
  function drawKoala(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#94959c';
    const chestCol = '#f2f3f7';

    ctx.save();
    // Chân & Tay gấu túi có vuốt móc bám
    for (const [lx, off] of [[-18, 0], [16, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 6;
      limb(ctx, [[lx, -24], [lx + sw, -2]], tone(bodyCol, -0.15), 8);
      // Móng vuốt
      line(ctx, [[lx + sw - 2, -2], [lx + sw + 4, 0]], '#222222', 1.8);
    }

    // Thân tròn múp míp
    ellipse(ctx, 0, -32, 22, 22, volume(ctx, 0, -32, 22, 22, bodyCol), INK, 1.8);
    // Yếm ngực trắng xù
    path(ctx, 'M -8 -44 C -12 -32 -6 -20 0 -18 C 6 -20 12 -32 8 -44 Z', chestCol, null);

    // Chân gần
    for (const [lx, off] of [[-10, Math.PI], [22, 0]]) {
      const sw = -Math.sin(stride + off) * walk * 6;
      limb(ctx, [[lx, -22], [lx + sw, -2]], bodyCol, 8.5);
      line(ctx, [[lx + sw - 2, -2], [lx + sw + 4, 0]], '#222222', 2);
    }

    // Đầu tròn to đặc trưng
    ctx.save();
    const hx = 6, hy = -56;
    ellipse(ctx, hx, hy, 18, 16, volume(ctx, hx, hy, 18, 16, bodyCol), INK, 2);

    // Hai tai tròn xù lông khổng lồ
    for (const [ex, ey] of [[hx - 16, hy - 12], [hx + 16, hy - 12]]) {
      ellipse(ctx, ex, ey, 10, 10, bodyCol, INK, 1.5);
      // Lông xù trắng bên trong tai
      ellipse(ctx, ex, ey, 6, 6, chestCol, null);
      for (let i = -2; i <= 2; i++) {
        line(ctx, [[ex + i * 2, ey], [ex + i * 3.5, ey - 6]], '#ffffff', 1.2);
      }
    }

    // Mũi đen hình quả lê đặc trưng to đùng
    path(ctx, `M ${hx - 4} ${hy - 2} C ${hx - 7} ${hy + 10} ${hx + 7} ${hy + 10} ${hx + 4} ${hy - 2} C ${hx + 3} ${hy - 8} ${hx - 3} ${hy - 8} ${hx - 4} ${hy - 2} Z`, volume(ctx, hx, hy + 2, 7, 10, '#1c1c1f'), INK, 1.4);
    // Vệt bóng mũi
    ellipse(ctx, hx - 2, hy - 2, 2, 3, '#4f4f54', null);

    // Mắt tròn hạt nhãn
    drawEye(ctx, hx - 7, hy - 5, 3.5, s.blink || 0, 1, '#3b2518');
    drawEye(ctx, hx + 7, hy - 5, 3.5, s.blink || 0, 1, '#3b2518');

    if (mouth > 0.1) {
      ellipse(ctx, hx, hy + 11, 3, 3, '#882b34', null);
    }

    ctx.restore();
    ctx.restore();
  }

  // 2. RED PANDA (Gấu trúc đỏ)
  function drawRedPanda(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#c84e27';
    const bellyCol = '#1f1b18';
    const whiteCol = '#fbfbf8';

    ctx.save();
    // Chân ngắn màu đen sẫm
    const pandaLeg = { color: bellyCol, legTop: -22, legLen: 22, legWidth: 7, footType: 'paw', strideDist: 10, liftHeight: 6 };
    drawQuadLeg(ctx, -24, 0, 0, walk, stride, pandaLeg);
    drawQuadLeg(ctx, 16, 0, Math.PI, walk, stride, pandaLeg);

    // ĐUÔI XÙ TO KHỔNG LỒ CÓ CÁC VÒNG KHOANG
    const tailWag = Math.sin(t * 3.5 + stride) * 6;
    ctx.save();
    ctx.translate(-30, -30);
    ctx.rotate(-0.3 + tailWag * 0.04);
    // Khối lông đuôi
    ellipse(ctx, -26, 12, 11, 26, volume(ctx, -26, 12, 11, 26, bodyCol), INK, 1.8, 0.9);
    // Các khoang màu vàng nhạt / kem trên đuôi
    for (let r = 0; r < 5; r++) {
      const rx = -12 - r * 7;
      const ry = 2 + r * 5;
      ellipse(ctx, rx, ry, 10.5, 3.5, '#edd2ab', null, 0, 0.9);
    }
    ctx.restore();

    // Thân đỏ cam rực rỡ
    path(ctx, 'M -32 -26 C -34 -48 -10 -52 14 -50 C 28 -48 32 -36 28 -24 C 18 -16 -6 -16 -24 -18 Z', volume(ctx, -2, -36, 32, 18, bodyCol), INK, 1.8);
    // Bụng & Ngực màu đen tuyền tương phản
    path(ctx, 'M -24 -18 C -4 -16 16 -18 24 -22 C 22 -14 2 -12 -18 -14 Z', bellyCol, null);

    // Chân gần
    drawQuadLeg(ctx, -14, 1, Math.PI, walk, stride, pandaLeg);
    drawQuadLeg(ctx, 24, 1, 0, walk, stride, pandaLeg);

    // Đầu đáng yêu có vệt trắng đặc trưng
    ctx.save();
    const hp = [22, -42];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.6);
    ctx.translate(-hp[0], -hp[1]);

    ellipse(ctx, 28, -50, 15, 13, volume(ctx, 28, -50, 15, 13, bodyCol), INK, 1.8);

    // Hai tai tam giác viền trắng bên trong
    for (const [ex, ey, rot] of [[18, -62, -0.3], [34, -62, 0.3]]) {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(rot);
      path(ctx, 'M -6 4 L 0 -12 L 6 4 Z', bodyCol, INK, 1.2);
      path(ctx, 'M -3 3 L 0 -8 L 3 3 Z', whiteCol, null);
      ctx.restore();
    }

    // Má trắng và vệt lệ trắng
    ellipse(ctx, 36, -46, 7, 5, whiteCol, INK, 0.8);
    ellipse(ctx, 24, -48, 5, 4, whiteCol, null);
    // Mũi đen nhỏ
    ellipse(ctx, 40, -48, 2.5, 2, bellyCol, null);

    // Mắt tròn long lanh
    drawEye(ctx, 30, -52, 3.8, s.blink || 0, 1, '#4a2614');

    if (mouth > 0.1) {
      ellipse(ctx, 38, -44, 2.5, 2.5, '#992a34', null);
    }

    ctx.restore();
    ctx.restore();
  }

  // 3. DONKEY (Con lừa)
  function drawDonkey(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#8d8d91';
    const muzzleCol = '#f5f4ef';

    ctx.save();
    const donkeyLeg = { color: bodyCol, legTop: -32, legLen: 32, legWidth: 7, footType: 'hoof', hoofColor: '#252322', strideDist: 14, liftHeight: 8 };
    drawQuadLeg(ctx, -28, 0, 0, walk, stride, donkeyLeg);
    drawQuadLeg(ctx, 18, 0, Math.PI, walk, stride, donkeyLeg);

    // Đuôi có túm lông
    const tailWag = Math.sin(t * 4) * 5;
    line(ctx, [[-38, -46], [-48, -34], [-46 + tailWag, -18]], bodyCol, 2.5);
    ellipse(ctx, -46 + tailWag, -16, 3, 6, '#252322', null);

    // Thân
    path(ctx, 'M -40 -46 C -42 -66 -16 -68 14 -66 C 30 -64 34 -52 30 -38 C 22 -30 -4 -30 -30 -32 Z', volume(ctx, -6, -50, 38, 20, bodyCol), INK, 2);

    // Bờm đen dựng đứng từ sau tai dọc gáy
    for (let b = 0; b < 6; b++) {
      const bx = 16 + b * 4;
      const by = -66 - b * 4;
      line(ctx, [[bx, by], [bx - 4, by - 6]], '#22201f', 2.8);
    }

    // Chân gần
    drawQuadLeg(ctx, -18, 1, Math.PI, walk, stride, donkeyLeg);
    drawQuadLeg(ctx, 28, 1, 0, walk, stride, donkeyLeg);

    // Đầu & TAI LỪA SIÊU DÀI
    ctx.save();
    const hp = [22, -60];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.7);
    ctx.translate(-hp[0], -hp[1]);

    // Đầu dài
    path(ctx, 'M 16 -68 C 18 -82 32 -86 42 -80 C 54 -74 60 -56 50 -50 C 38 -46 22 -52 16 -68 Z', volume(ctx, 36, -68, 20, 18, bodyCol), INK, 1.8);

    // Mõm trắng đặc trưng của lừa
    ellipse(ctx, 52, -54, 8, 6.5, volume(ctx, 52, -54, 8, 6.5, muzzleCol), INK, 1.2);
    // Lỗ mũi đen
    ellipse(ctx, 56, -54, 2, 2.5, '#222222', null);

    // Mắt hiền lành
    drawEye(ctx, 36, -72, 4, s.blink || 0, 1, '#3b2f28');

    // HAI TAI DÀI ĐẶC TRƯNG VƯƠN CAO
    const earTwitch = Math.sin(t * 3) * 0.08;
    for (const [ex, ey, rot] of [[24, -84, -0.15 + earTwitch], [32, -84, 0.15 - earTwitch]]) {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(rot);
      // Tai lừa hình búp dài
      path(ctx, 'M -5 0 C -8 -16 -6 -32 0 -36 C 6 -32 8 -16 5 0 Z', volume(ctx, 0, -18, 7, 18, bodyCol), INK, 1.4);
      path(ctx, 'M -2 -2 C -4 -14 -3 -26 0 -28 C 3 -26 4 -14 2 -2 Z', '#dfc7bb', null);
      // Viền chóp tai đen
      ellipse(ctx, 0, -34, 3, 3, '#22201f', null);
      ctx.restore();
    }

    if (mouth > 0.1) {
      path(ctx, `M 48 -50 Q 54 ${-42 + mouth * 8} 56 -50`, '#882e37', INK, 1.2);
    }

    ctx.restore();
    ctx.restore();
  }

  // 4. PUG (Chó Pug mặt xệ)
  function drawPug(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#d6ba8e';
    const maskCol = '#2a221e';

    ctx.save();
    // Chân ngắn mũm mĩm
    const pugLeg = { color: bodyCol, legTop: -20, legLen: 20, legWidth: 7, footType: 'paw', strideDist: 10, liftHeight: 6 };
    drawQuadLeg(ctx, -22, 0, 0, walk, stride, pugLeg);
    drawQuadLeg(ctx, 16, 0, Math.PI, walk, stride, pugLeg);

    // ĐUÔI XOẮN CUỘN TRÒN TRÊN LƯNG NHƯ BÁNH QUY (Cinnamon roll tail)
    path(ctx, 'M -32 -36 C -40 -48 -28 -56 -22 -48 C -18 -42 -26 -38 -28 -44', null, INK, 4.5);
    path(ctx, 'M -32 -36 C -40 -48 -28 -56 -22 -48 C -18 -42 -26 -38 -28 -44', null, bodyCol, 3);

    // Thân tròn lẳn béo tốt
    ellipse(ctx, -2, -30, 24, 17, volume(ctx, -2, -30, 24, 17, bodyCol), INK, 1.8);

    // Chân gần
    drawQuadLeg(ctx, -12, 1, Math.PI, walk, stride, pugLeg);
    drawQuadLeg(ctx, 24, 1, 0, walk, stride, pugLeg);

    // Đầu tròn to & Mặt gãy xệ nhăn nheo
    ctx.save();
    const hx = 24, hy = -44;
    ellipse(ctx, hx, hy, 16, 15, volume(ctx, hx, hy, 16, 15, bodyCol), INK, 2);

    // Mặt nạ đen (Black mask)
    ellipse(ctx, hx + 5, hy + 2, 10, 9, volume(ctx, hx + 5, hy + 2, 10, 9, maskCol), INK, 1.4);

    // Nếp nhăn trên trán và sống mũi
    path(ctx, `M ${hx - 4} ${hy - 8} Q ${hx + 4} ${hy - 12} ${hx + 10} ${hy - 8}`, null, maskCol, 1.8);
    path(ctx, `M ${hx - 2} ${hy - 4} Q ${hx + 5} ${hy - 7} ${hx + 9} ${hy - 4}`, null, maskCol, 1.8);

    // Mũi hếch phẳng
    ellipse(ctx, hx + 11, hy + 1, 3.2, 2.5, '#111111', null);

    // Mắt to tròn đen láy lồi nhẹ (đặc trưng Pug ngây thơ)
    drawEye(ctx, hx + 2, hy - 4, 4.5, s.blink || 0, 1, '#1c1410');

    // Mép trễ xệ xuống
    path(ctx, `M ${hx + 6} ${hy + 6} Q ${hx + 10} ${hy + 10} ${hx + 14} ${hy + 6}`, null, INK, 1.6);
    if (mouth > 0.1) {
      // Lưỡi thè ra thở hổn hển
      path(ctx, `M ${hx + 9} ${hy + 7} Q ${hx + 11} ${hy + 14} ${hx + 13} ${hy + 7}`, '#f06d7d', INK, 1);
    }

    // Tai cụp nhỏ màu đen nhung
    for (const [ex, ey] of [[hx - 6, hy - 10], [hx + 6, hy - 12]]) {
      path(ctx, `M ${ex} ${ey} C ${ex - 4} ${ey + 8} ${ex + 4} ${ey + 10} ${ex + 5} ${ey + 2} Z`, maskCol, INK, 1);
    }

    ctx.restore();
    ctx.restore();
  }

  // 5. SHIBA (Chó Shiba Inu)
  function drawShiba(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#d97d36';
    const urajiro = '#fcfbf7'; // lông trắng đặc trưng má, ngực, bụng của Shiba

    ctx.save();
    // Chân thanh thoát
    const shibaLeg = { color: bodyCol, legTop: -28, legLen: 28, legWidth: 6.5, footType: 'paw', strideDist: 14, liftHeight: 8 };
    drawQuadLeg(ctx, -24, 0, 0, walk, stride, shibaLeg);
    drawQuadLeg(ctx, 16, 0, Math.PI, walk, stride, shibaLeg);

    // Đuôi cuộn cong xù trên lưng
    path(ctx, 'M -30 -38 C -42 -54 -26 -64 -18 -52 C -14 -46 -22 -44 -26 -48', null, INK, 5.5);
    path(ctx, 'M -30 -38 C -42 -54 -26 -64 -18 -52 C -14 -46 -22 -44 -26 -48', null, bodyCol, 4);
    // Bụng đuôi màu trắng
    ellipse(ctx, -22, -54, 4, 3, urajiro, null);

    // Thân cân đối
    path(ctx, 'M -32 -36 C -34 -56 -10 -58 16 -54 C 28 -52 30 -40 26 -28 C 18 -20 -4 -20 -24 -22 Z', volume(ctx, -4, -40, 32, 20, bodyCol), INK, 1.8);
    // Yếm ngực trắng Urajiro
    path(ctx, 'M 4 -28 C 14 -22 26 -26 28 -38 C 24 -46 16 -44 10 -34 Z', urajiro, null);

    // Chân gần (vớ trắng ở bàn chân)
    drawQuadLeg(ctx, -14, 1, Math.PI, walk, stride, shibaLeg);
    drawQuadLeg(ctx, 24, 1, 0, walk, stride, shibaLeg);

    // Đầu chó Shiba vui tươi
    ctx.save();
    const hp = [20, -50];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.6);
    ctx.translate(-hp[0], -hp[1]);

    ellipse(ctx, 28, -58, 14, 13, volume(ctx, 28, -58, 14, 13, bodyCol), INK, 1.8);

    // Má bánh bao trắng phúng phính (Urajiro)
    ellipse(ctx, 34, -54, 8, 6, urajiro, INK, 0.8);
    // Chấm lông mày trắng đặc trưng
    ellipse(ctx, 26, -64, 1.8, 1.8, urajiro, null);
    ellipse(ctx, 33, -64, 1.8, 1.8, urajiro, null);

    // Mắt hạnh nhân xếch nhẹ
    drawEye(ctx, 30, -60, 3.8, s.blink || 0, 1, '#3b2014');

    // Mũi đen nhỏ
    ellipse(ctx, 40, -56, 2.5, 2, '#181210', null);

    // Nụ cười rạng rỡ của Shiba
    if (mouth > 0.1) {
      path(ctx, `M 34 -52 Q 38 ${-44 + mouth * 10} 42 -52`, '#f2687c', INK, 1.2);
    } else {
      path(ctx, 'M 35 -52 Q 38 -49 41 -52', null, INK, 1.4);
    }

    // Tai tam giác đứng vểnh hướng về trước
    for (const [ex, ey, rot] of [[20, -70, -0.2], [32, -70, 0.2]]) {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(rot);
      path(ctx, 'M -5 2 L 0 -13 L 5 2 Z', volume(ctx, 0, -5, 5, 8, bodyCol), INK, 1.2);
      path(ctx, 'M -3 1 L 0 -9 L 3 1 Z', '#fce8d5', null);
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }

  // 6. HEDGEHOG (Nhím gai)
  function drawHedgehog(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const skinCol = '#f2ceb3';
    const spineCol = '#4e3b2b';
    const tipCol = '#dfccba';

    ctx.save();
    // 4 chân ngắn xíu
    for (const [lx, off] of [[-14, 0], [12, Math.PI], [-6, Math.PI], [18, 0]]) {
      const sw = -Math.sin(stride + off) * walk * 4;
      limb(ctx, [[lx, -8], [lx + sw, 0]], skinCol, 4);
    }

    // Thân tròn phủ kín gai nhọn
    // Khối thịt dưới bụng
    ellipse(ctx, 0, -14, 22, 12, skinCol, INK, 1);

    // Mảng gai dày đặc hình giọt nước
    path(ctx, 'M -22 -14 C -26 -34 6 -36 20 -20 C 18 -10 -4 -8 -22 -14 Z', volume(ctx, -2, -22, 22, 14, spineCol), INK, 1.6);

    // Các gai nhọn tua tủa đan xen
    for (let i = 0; i < 20; i++) {
      const u = i / 19;
      const ang = Math.PI * 0.9 - u * Math.PI * 0.95;
      const r = 20 + (i % 3) * 2;
      const gx = -2 + Math.cos(ang) * r;
      const gy = -14 - Math.sin(ang) * r;
      const tx = gx + Math.cos(ang) * 6;
      const ty = gy - Math.sin(ang) * 6;
      path(ctx, `M ${gx - 2} ${gy} L ${tx} ${ty} L ${gx + 2} ${gy} Z`, spineCol, null);
      ellipse(ctx, tx, ty, 1.2, 1.2, tipCol, null);
    }

    // Mặt nhọn dễ thương nhô ra phía trước
    ctx.save();
    const hx = 18, hy = -14;
    path(ctx, `M ${hx - 4} ${hy - 8} Q ${hx + 12} ${hy - 2} ${hx + 14} ${hy} Q ${hx + 10} ${hy + 4} ${hx - 4} ${hy + 4} Z`, skinCol, INK, 1.2);

    // Mũi hạt tiêu đen bóng
    ellipse(ctx, hx + 14, hy, 2, 1.8, '#1f1614', null);
    // Ria mép
    const twitch = Math.sin(t * 8) * 0.8;
    line(ctx, [[hx + 10, hy - 1], [hx + 18, hy - 4 + twitch]], '#555555', 0.8);
    line(ctx, [[hx + 10, hy + 1], [hx + 18, hy + 4 - twitch]], '#555555', 0.8);

    // Mắt tròn xoe
    drawEye(ctx, hx + 4, hy - 3, 2.8, s.blink || 0, 1, '#1b1410');

    // Tai tròn nhỏ
    ellipse(ctx, hx - 2, hy - 6, 3, 3.5, skinCol, INK, 0.8);

    ctx.restore();
    ctx.restore();
  }

  // 7. SLOTH (Con lười)
  function drawSloth(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const bodyCol = s.style?.body || '#857c70';
    const faceCol = '#dfdacb';
    const maskCol = '#42372c';

    ctx.save();
    // Chân & Tay có 3 móng vuốt móc cong siêu dài
    const drawSlothLimb = (ax, ay, near, off) => {
      const sw = -Math.sin(stride * 0.5 + off) * walk * 6; // cử động chậm chạp
      const col = near ? bodyCol : tone(bodyCol, -0.2);
      const fx = ax + sw, fy = 0;
      limb(ctx, [[ax, ay], [ax + (near ? 6 : -4), ay + 14], [fx, fy - 4]], col, 8);
      // 3 móng vuốt cong hình lưỡi liềm
      for (let c = -1; c <= 1; c++) {
        path(ctx, `M ${fx + c * 3} ${fy - 4} Q ${fx + c * 4 + 4} ${fy} ${fx + c * 3 + 2} ${fy + 2}`, null, '#ded9cf', 1.8);
      }
    };
    drawSlothLimb(-22, -26, 0, 0);
    drawSlothLimb(18, -26, 0, Math.PI);

    // Thân lông xù rủ xuống
    path(ctx, 'M -30 -24 C -34 -44 -6 -48 18 -44 C 28 -42 32 -30 26 -20 C 14 -12 -8 -12 -26 -14 Z', volume(ctx, -4, -34, 32, 18, bodyCol), INK, 1.8);

    // Chân gần
    drawSlothLimb(-12, -24, 1, Math.PI);
    drawSlothLimb(26, -24, 1, 0);

    // Khuôn mặt lười tươi cười ngái ngủ
    ctx.save();
    const hx = 22, hy = -42;
    ellipse(ctx, hx, hy, 12, 12, volume(ctx, hx, hy, 12, 12, bodyCol), INK, 1.6);
    // Vùng mặt trắng kem
    ellipse(ctx, hx + 3, hy + 1, 8.5, 8, faceCol, INK, 0.8);

    // Dải sọc mắt nâu sẫm kéo dài ra sau
    path(ctx, `M ${hx - 1} ${hy} L ${hx + 8} ${hy - 2}`, null, maskCol, 3.5);

    // Mắt lim dim buồn ngủ
    drawEye(ctx, hx + 3, hy - 1, 2.5, (s.blink || 0) + 0.3, 1, '#2c1e14');

    // Mũi & Nụ cười mỉm bất diệt
    ellipse(ctx, hx + 7, hy + 2, 2.2, 1.8, '#1f1610', null);
    path(ctx, `M ${hx + 4} ${hy + 5} Q ${hx + 7} ${hy + 7} ${hx + 10} ${hy + 5}`, null, INK, 1.4);

    ctx.restore();
    ctx.restore();
  }

  // 8. BEAVER (Hải ly)
  function drawBeaver(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#6a4327';
    const bellyCol = '#8e613f';
    const tailCol = '#2a1f18';

    ctx.save();
    // ĐUÔI BẢN DẸP HÌNH MÁI CHÈO CÓ VÂN VẢY Ô CỜ
    const tailWag = Math.sin(t * 3) * 4;
    ctx.save();
    ctx.translate(-28, -18);
    ctx.rotate(-0.1 + tailWag * 0.03);
    ellipse(ctx, -24, 6, 12, 26, volume(ctx, -24, 6, 12, 26, tailCol), INK, 1.6, 1.2);
    // Vân ca-rô trên đuôi
    for (let k = -2; k <= 2; k++) {
      line(ctx, [[-32 + k * 4, -4], [-16 + k * 4, 16]], '#18120e', 1);
      line(ctx, [[-16 + k * 4, -4], [-32 + k * 4, 16]], '#18120e', 1);
    }
    ctx.restore();

    // Chân sau có màng bơi
    const beaverLeg = { color: bodyCol, legTop: -20, legLen: 20, legWidth: 8, footType: 'claw', strideDist: 10, liftHeight: 6 };
    drawQuadLeg(ctx, -18, 0, 0, walk, stride, beaverLeg);
    drawQuadLeg(ctx, 16, 0, Math.PI, walk, stride, beaverLeg);

    // Thân béo tròn
    ellipse(ctx, 0, -28, 26, 18, volume(ctx, 0, -28, 26, 18, bodyCol), INK, 2);
    ellipse(ctx, 4, -24, 18, 12, bellyCol, null);

    // Chân gần
    drawQuadLeg(ctx, -8, 1, Math.PI, walk, stride, beaverLeg);
    drawQuadLeg(ctx, 24, 1, 0, walk, stride, beaverLeg);

    // Đầu & RĂNG CỬA MÀU CAM TO TƯỚNG (Gặm gỗ)
    ctx.save();
    const hp = [20, -38];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.6);
    ctx.translate(-hp[0], -hp[1]);

    ellipse(ctx, 26, -44, 14, 13, volume(ctx, 26, -44, 14, 13, bodyCol), INK, 1.8);

    // Mõm phồng
    ellipse(ctx, 34, -40, 7, 6, bellyCol, INK, 1);
    ellipse(ctx, 38, -42, 2.5, 2, '#18120e', null);

    // CẶP RĂNG CỬA CAM ĐẶC TRƯNG CHẮC KHỎE
    path(ctx, 'M 33 -36 L 33 -30 L 36 -30 L 36 -36 Z', '#e87820', INK, 0.8);
    path(ctx, 'M 36.5 -36 L 36.5 -30 L 39.5 -30 L 39.5 -36 Z', '#e87820', INK, 0.8);

    // Mắt đen tròn
    drawEye(ctx, 28, -46, 3.2, s.blink || 0, 1, '#241a14');

    // Tai tròn nhỏ
    ellipse(ctx, 18, -52, 3.5, 4, bodyCol, INK, 0.8);

    ctx.restore();
    ctx.restore();
  }

  // 9. BLACK GOAT (Dê đen)
  function drawBlackGoat(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#242528';
    const hornCol = '#63625f';

    ctx.save();
    const goatLeg = { color: bodyCol, legTop: -30, legLen: 30, legWidth: 6, footType: 'hoof', hoofColor: '#111111', strideDist: 14, liftHeight: 8 };
    drawQuadLeg(ctx, -26, 0, 0, walk, stride, goatLeg);
    drawQuadLeg(ctx, 16, 0, Math.PI, walk, stride, goatLeg);

    // Đuôi ngắn vểnh
    const tailTwitch = Math.sin(t * 6) * 3;
    path(ctx, `M -34 -44 L -42 ${-48 + tailTwitch} L -38 -40 Z`, bodyCol, INK, 1);

    // Thân đen bóng
    path(ctx, 'M -36 -42 C -38 -62 -14 -64 12 -62 C 26 -60 30 -48 26 -34 C 18 -26 -2 -26 -26 -28 Z', volume(ctx, -4, -46, 34, 20, bodyCol, 0.3, -0.2), INK, 1.8);

    // Chân gần
    drawQuadLeg(ctx, -16, 1, Math.PI, walk, stride, goatLeg);
    drawQuadLeg(ctx, 26, 1, 0, walk, stride, goatLeg);

    // Đầu & Sừng cong dài & Chòm râu dê (Goatee)
    ctx.save();
    const hp = [20, -56];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.7);
    ctx.translate(-hp[0], -hp[1]);

    ellipse(ctx, 28, -64, 12, 11, volume(ctx, 28, -64, 12, 11, bodyCol), INK, 1.6);
    ellipse(ctx, 36, -60, 6, 5, tone(bodyCol, 0.2), INK, 0.8);

    // Chòm râu dê dưới cằm
    path(ctx, 'M 32 -56 L 30 -44 L 36 -56 Z', bodyCol, INK, 1);

    // Mắt dê con ngươi ngang màu vàng hổ phách
    drawEye(ctx, 28, -66, 3.5, s.blink || 0, 1, '#d8aa28');

    // Cặp sừng cong vuốt ngược ra sau có ngấn
    path(ctx, 'M 22 -72 C 14 -88 2 -96 -6 -92 C 8 -90 18 -82 26 -70 Z', volume(ctx, 8, -84, 16, 14, hornCol), INK, 1.4);
    for (let r = 0; r < 4; r++) {
      const rx = 18 - r * 6, ry = -74 - r * 5;
      line(ctx, [[rx - 2, ry], [rx + 2, ry + 2]], '#1a1918', 1.2);
    }

    // Tai cụp ngang
    ellipse(ctx, 16, -66, 6, 3, bodyCol, INK, 0.8, -0.2);

    ctx.restore();
    ctx.restore();
  }

  // 10. WHITE GOAT (Dê núi trắng)
  function drawWhiteGoat(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#fbfaf6';
    const hornCol = '#b8a892';

    ctx.save();
    const goatLeg = { color: bodyCol, legTop: -30, legLen: 30, legWidth: 6, footType: 'hoof', hoofColor: '#3a322c', strideDist: 14, liftHeight: 8 };
    drawQuadLeg(ctx, -26, 0, 0, walk, stride, goatLeg);
    drawQuadLeg(ctx, 16, 0, Math.PI, walk, stride, goatLeg);

    path(ctx, 'M -34 -44 L -42 -48 L -38 -40 Z', bodyCol, INK, 1);

    // Thân trắng
    path(ctx, 'M -36 -42 C -38 -62 -14 -64 12 -62 C 26 -60 30 -48 26 -34 C 18 -26 -2 -26 -26 -28 Z', volume(ctx, -4, -46, 34, 20, bodyCol, 0.3, -0.2), INK, 1.8);

    drawQuadLeg(ctx, -16, 1, Math.PI, walk, stride, goatLeg);
    drawQuadLeg(ctx, 26, 1, 0, walk, stride, goatLeg);

    ctx.save();
    const hp = [20, -56];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.7);
    ctx.translate(-hp[0], -hp[1]);

    ellipse(ctx, 28, -64, 12, 11, volume(ctx, 28, -64, 12, 11, bodyCol), INK, 1.6);
    ellipse(ctx, 36, -60, 6, 5, '#ebe4d8', INK, 0.8);

    // Chòm râu
    path(ctx, 'M 32 -56 L 30 -44 L 36 -56 Z', bodyCol, INK, 1);

    // Mắt
    drawEye(ctx, 28, -66, 3.5, s.blink || 0, 1, '#4a3622');

    // Sừng ngấn màu be
    path(ctx, 'M 22 -72 C 14 -88 2 -96 -6 -92 C 8 -90 18 -82 26 -70 Z', volume(ctx, 8, -84, 16, 14, hornCol), INK, 1.4);
    for (let r = 0; r < 4; r++) {
      const rx = 18 - r * 6, ry = -74 - r * 5;
      line(ctx, [[rx - 2, ry], [rx + 2, ry + 2]], '#726250', 1.2);
    }

    ellipse(ctx, 16, -66, 6, 3, bodyCol, INK, 0.8, -0.2);

    ctx.restore();
    ctx.restore();
  }

  // 11. FLUFFY SHEEP (Cừu bông xoăn)
  function drawFluffySheep(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#fdfcf7';
    const skinCol = '#e8d4c8';
    const hornCol = '#d2be9e';

    ctx.save();
    // 4 chân nhỏ màu da/hồng nâu
    const sheepLeg = { color: skinCol, legTop: -24, legLen: 24, legWidth: 5.5, footType: 'hoof', hoofColor: '#28201a', strideDist: 12, liftHeight: 7 };
    drawQuadLeg(ctx, -24, 0, 0, walk, stride, sheepLeg);
    drawQuadLeg(ctx, 14, 0, Math.PI, walk, stride, sheepLeg);

    // Đuôi bông xù tròn
    ellipse(ctx, -38, -36, 6, 6, bodyCol, INK, 1);

    // THÂN BÔNG NHƯ ĐÁM MÂY BỒNG BỀNH
    const clouds = [
      [-24, -40, 14], [-12, -48, 16], [4, -48, 16], [18, -42, 15],
      [-22, -28, 13], [-8, -26, 14], [8, -26, 14], [20, -30, 13],
      [-2, -38, 18]
    ];
    for (const [cx, cy, cr] of clouds) {
      ellipse(ctx, cx, cy, cr, cr, volume(ctx, cx, cy, cr, cr, bodyCol, 0.2, -0.2), INK, 1.4);
    }

    // Chân gần
    drawQuadLeg(ctx, -14, 1, Math.PI, walk, stride, sheepLeg);
    drawQuadLeg(ctx, 24, 1, 0, walk, stride, sheepLeg);

    // Đầu & Sừng xoắn ốc (Ram horn)
    ctx.save();
    const hp = [18, -48];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.6);
    ctx.translate(-hp[0], -hp[1]);

    // Mặt trần màu da hồng
    ellipse(ctx, 28, -54, 11, 10, volume(ctx, 28, -54, 11, 10, skinCol), INK, 1.5);
    ellipse(ctx, 35, -52, 5, 4, skinCol, null);

    // Mắt cừu hiền từ
    drawEye(ctx, 27, -56, 3.2, s.blink || 0, 1, '#3b2518');

    // Mũm mĩm chỏm lông cừu trên trán
    ellipse(ctx, 24, -64, 7, 6, bodyCol, INK, 1);

    // Cặp sừng xoắn ốc tuyệt đẹp ôm sát hai bên tai
    path(ctx, 'M 20 -58 C 14 -70 4 -68 6 -56 C 8 -46 18 -48 16 -54', null, INK, 3.5);
    path(ctx, 'M 20 -58 C 14 -70 4 -68 6 -56 C 8 -46 18 -48 16 -54', null, hornCol, 2.2);

    // Tai cụp
    ellipse(ctx, 16, -54, 5, 3, skinCol, INK, 0.8, 0.3);

    ctx.restore();
    ctx.restore();
  }

  // 12. SCRAT SQUIRREL (Sóc tiền sử Scrat)
  // Sóc: ngồi nửa đứng, đuôi xù cong chữ S bám liền mông, đầu tròn liền vai, ôm hạt dẻ.
  // Thiết kế thường (mắt vừa, răng cửa nhỏ), tránh giống nhân vật sóc của phim có sẵn.
  function drawSquirrel(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#c4773b';
    const bellyCol = s.style?.accent || '#f3dcb4';
    const hop = walk * Math.abs(Math.sin(stride)) * 4;
    const sway = Math.sin(t * 2.4 + (hash(s.id || 'sq') % 7)) * 0.06;

    ctx.save();
    ctx.translate(0, -hop);
    // Đuôi: gốc nằm trong mông (-12, -16) nên không bao giờ hở khỏi thân.
    ctx.save();
    ctx.translate(-12, -16); ctx.rotate(sway);
    const tail = 'M 4 2 C -18 4 -30 -12 -26 -32 C -22 -50 -6 -58 -10 -72 C -2 -66 4 -52 -2 -38 C -6 -26 2 -14 10 -8 Z';
    path(ctx, tail, volume(ctx, -12, -34, 18, 36, bodyCol, .3, -.25), INK, 1.8);
    path(ctx, 'M -2 -4 C -18 -8 -22 -22 -18 -34 C -14 -46 -4 -52 -7 -64', null, tone(bodyCol, .35), 3.2);
    ctx.restore();

    // Chân sau (đùi + bàn chân), bước nhẹ khi đi.
    const step = -Math.sin(stride) * walk * 5;
    ellipse(ctx, -6, -14, 11, 10, volume(ctx, -6, -14, 11, 10, bodyCol), INK, 1.6);
    ellipse(ctx, 0 + step, -3, 10, 3.6, tone(bodyCol, -.15), INK, 1.3);
    // Thân và bụng.
    ellipse(ctx, 2, -26, 13, 16, volume(ctx, 2, -26, 13, 16, bodyCol), INK, 1.8, -.25);
    ellipse(ctx, 6, -24, 7.5, 11, bellyCol, null, 1, -.25);
    // Tay trước ôm hạt dẻ (anchor grip = [16, -22]).
    limb(ctx, [[8, -34], [14, -28], [15, -24]], bodyCol, 4.2);
    ellipse(ctx, 16, -21, 4.2, 5, volume(ctx, 16, -21, 4.2, 5, '#8a5a2b'), INK, 1);
    path(ctx, 'M 11.5 -24 Q 16 -28.5 20.5 -24 Z', '#5a3a1c', INK, .8);

    // Đầu liền vai: tâm (16, -42), mõm hướng phải.
    ellipse(ctx, 16, -42, 11, 10, volume(ctx, 16, -42, 11, 10, bodyCol), INK, 1.7);
    path(ctx, 'M 9 -49 L 8 -60 L 15 -51 Z', volume(ctx, 10, -54, 4, 6, bodyCol), INK, 1.2);
    path(ctx, 'M 10 -51 L 9.5 -57 L 13 -51.5 Z', '#e9a9a0', null);
    ellipse(ctx, 25, -39, 6, 4.8, bellyCol, INK, 1.2);
    ellipse(ctx, 30, -40.5, 1.8, 1.5, '#2a1d17', null);
    drawEye(ctx, 19, -45, 3.2, s.blink || 0, 1, '#3b2518');
    if (mouth > 0.1) ellipse(ctx, 26.5, -35.5, 2.2, 1.4 + mouth * 1.6, '#6b2a2a', INK, .8);
    else path(ctx, 'M 24 -36 Q 26.5 -34.5 29 -36', null, INK, 1);
    path(ctx, 'M 26 -35.5 L 26 -33 L 28 -33 L 28 -35.5', '#ffffff', INK, .6);
    ctx.restore();
  }

  // 13. TURTLE (Rùa cạn / Tortoise)
  function drawTurtle(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const shellCol = s.style?.shell || '#566042';
    const rimCol = '#c2a868';
    const skinCol = '#7a855b';

    ctx.save();
    // Đuôi rùa ngắn xíu
    path(ctx, 'M -32 -16 L -40 -14 L -32 -12 Z', skinCol, INK, 1);

    // 4 chân rùa mập mạp vững chãi
    const turtleLeg = (lx, off) => {
      const sw = -Math.sin(stride + off) * walk * 6;
      limb(ctx, [[lx, -14], [lx + sw, 0]], skinCol, 8);
      // Móng chân cùn
      for (let c = -1; c <= 1; c++) {
        ellipse(ctx, lx + sw + c * 3, 0, 1.5, 1.5, '#222222', null);
      }
    };
    turtleLeg(-22, 0);
    turtleLeg(16, Math.PI);

    // MAI RÙA GỒ CAO CÓ HOA VĂN LỤC GIÁC TUYỆT ĐẸP
    path(ctx, 'M -34 -14 C -36 -46 8 -48 24 -24 C 28 -18 26 -14 20 -12 C 4 -10 -16 -10 -34 -14 Z', volume(ctx, -4, -30, 32, 20, shellCol), INK, 2.2);

    // Viền yếm mai vàng sáng
    path(ctx, 'M -34 -14 C -14 -10 10 -10 24 -14 L 20 -10 C 6 -6 -16 -6 -32 -10 Z', rimCol, INK, 1);

    // Các mảng vảy mai (Scutes)
    const scutes = [
      'M -20 -28 L -14 -38 L -4 -38 L 0 -28 L -8 -22 Z',
      'M 0 -28 L 6 -38 L 16 -36 L 18 -26 L 8 -22 Z',
      'M -26 -18 L -20 -28 L -8 -22 L -14 -14 Z',
      'M -8 -22 L 0 -28 L 8 -22 L 2 -14 Z'
    ];
    for (const d of scutes) {
      path(ctx, d, tone(shellCol, 0.15), rimCol, 1.2);
    }

    // Chân gần
    turtleLeg(-12, Math.PI);
    turtleLeg(26, 0);

    // Cổ & Đầu rùa hiền từ
    ctx.save();
    const neckSway = Math.sin(t * 2) * 2;
    // Cổ nhăn
    limb(ctx, [[18, -18], [28 + neckSway, -22], [34 + neckSway, -26]], skinCol, 7);

    const hx = 36 + neckSway, hy = -28;
    ellipse(ctx, hx, hy, 8, 7, volume(ctx, hx, hy, 8, 7, skinCol), INK, 1.6);
    // Mắt tròn hiền từ
    drawEye(ctx, hx + 2, hy - 2, 2.8, s.blink || 0, 1, '#1e1c12');
    // Miệng rùa
    path(ctx, `M ${hx + 2} ${hy + 3} Q ${hx + 6} ${hy + 2} ${hx + 8} ${hy + 4}`, null, INK, 1.2);

    ctx.restore();
    ctx.restore();
  }

  // Đăng ký 13 rig Forest vào RemakeVector
  const rigs = {
    koala: { group: 'animal', draw: drawKoala },
    red_panda: { group: 'animal', draw: drawRedPanda },
    donkey: { group: 'animal', draw: drawDonkey },
    pug: { group: 'animal', draw: drawPug },
    shiba: { group: 'animal', draw: drawShiba },
    hedgehog: { group: 'animal', draw: drawHedgehog },
    sloth: { group: 'animal', draw: drawSloth },
    beaver: { group: 'animal', draw: drawBeaver },
    black_goat: { group: 'animal', draw: drawBlackGoat },
    white_goat: { group: 'animal', draw: drawWhiteGoat },
    fluffy_sheep: { group: 'animal', draw: drawFluffySheep },
    squirrel: { group: 'animal', draw: drawSquirrel },
    turtle: { group: 'animal', draw: drawTurtle }
  };

  register({ rigs });
})();
