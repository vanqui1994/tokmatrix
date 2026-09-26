// Remake Vector Engine Pack: Wildlife Savanna (Động vật hoang dã Savanna & Châu Phi)
// Rigs: elephant, hippo, crocodile, gorilla, cheetah, hyena, giraffe, meerkat, warthog
(function() {
  'use strict';
  if (!globalThis.RemakeVector) throw new Error('RemakeVector core engine must be loaded before engine packs.');
  const { kit, register } = globalThis.RemakeVector;
  const { INK, tone, volume, cylinder, limb, ellipse, path, line, withCut, hash, clamp, smooth } = kit;
  const TAU = Math.PI * 2;

  // Helper: vẽ mắt hoạt hình biểu cảm với highlight và chớp mắt
  function drawEye(ctx, x, y, r, blink, dirX = 1, irisColor = '#2b231d') {
    if (blink > 0.7) {
      // Nhắm mắt / chớp mắt
      path(ctx, `M ${x - r} ${y} Q ${x} ${y + r * 0.8} ${x + r} ${y}`, null, INK, 1.6);
      return;
    }
    const h = r * (1 - blink * 0.8);
    // Tròng trắng
    ellipse(ctx, x, y, r, h, '#ffffff', INK, 1.2);
    // Con ngươi
    const pupilX = x + dirX * (r * 0.25);
    ellipse(ctx, pupilX, y, r * 0.55, h * 0.55, irisColor, null);
    ellipse(ctx, pupilX, y, r * 0.32, h * 0.32, '#111111', null);
    // Đốm sáng
    ellipse(ctx, pupilX - r * 0.18, y - h * 0.18, r * 0.2, h * 0.2, '#ffffff', null);
  }

  // Helper: chân bốn chân tổng quát có khớp gối, cổ chân và bàn chân tiếp xúc mặt đất
  function drawSavannaLeg(ctx, lx, near, phaseOff, walk, stride, spec) {
    const phase = stride + phaseOff;
    const swing = -Math.sin(phase) * walk * (spec.strideDist || 14);
    const lift = Math.max(0, -Math.cos(phase)) * walk * (spec.liftHeight || 8);
    const topY = spec.legTop || -36;
    const len = spec.legLen || 36;
    const w = spec.legWidth || 8;
    const col = near ? spec.color : tone(spec.color, -0.22);

    const footX = lx + swing;
    const footY = -lift; // mặt đất là y = 0
    const kneeX = lx * 0.7 + footX * 0.3 + (spec.kneeBend || 0);
    const kneeY = topY + len * 0.52 - lift * 0.3;

    // Chi vẽ bằng limb mượt
    limb(ctx, [[lx, topY], [kneeX, kneeY], [footX, footY - (spec.footH || 4)]], col, w);

    // Móng / Bàn chân
    if (spec.footType === 'hoof') {
      const hoofCol = spec.hoofColor || '#222222';
      path(ctx, `M ${footX - w * 0.55} ${footY - 4} L ${footX + w * 0.65} ${footY - 4} L ${footX + w * 0.5} ${footY} L ${footX - w * 0.5} ${footY} Z`, hoofCol, INK, 1);
    } else if (spec.footType === 'elephant') {
      ellipse(ctx, footX, footY - 3, w * 0.75, 4.5, col, INK, 1.2);
      // Móng tròn xám nhạt
      for (let i = -1; i <= 1; i++) {
        ellipse(ctx, footX + i * (w * 0.4), footY - 1.5, 2.2, 1.8, '#e0e2e6', INK, 0.8);
      }
    } else if (spec.footType === 'claw') {
      ellipse(ctx, footX, footY - 2.5, w * 0.6, 3.5, col, INK, 1.1);
      for (let i = -1; i <= 1; i++) {
        line(ctx, [[footX + i * 3.5, footY - 2], [footX + i * 4.5 + 3, footY]], '#1b1b1b', 1.8);
      }
    } else if (spec.footType === 'paw') {
      ellipse(ctx, footX + 1, footY - 2.5, w * 0.65, 3.5, col, INK, 1.1);
    }
  }

  // 1. ELEPHANT (Voi Châu Phi)
  function drawElephant(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, down = s.head_down || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#747c87';
    const bellyCol = tone(bodyCol, -0.15);
    const earTwitch = Math.sin(t * 2.5) * 0.08;
    const trunkSway = Math.sin(t * 3 + stride * 2) * 8 * (1 + walk * 0.8);

    ctx.save();
    // 2 chân xa
    const legSpec = { color: bodyCol, legTop: -40, legLen: 40, legWidth: 15, footType: 'elephant', strideDist: 12, liftHeight: 7 };
    drawSavannaLeg(ctx, -38, 0, 0, walk, stride, legSpec);
    drawSavannaLeg(ctx, 32, 0, Math.PI, walk, stride, legSpec);

    // Đuôi nhỏ có túm lông
    const tailWave = Math.sin(t * 4 + stride) * 6;
    path(ctx, `M -60 -56 Q -72 -42 ${-70 + tailWave} -26`, null, INK, 3.5);
    path(ctx, `M -60 -56 Q -72 -42 ${-70 + tailWave} -26`, null, bodyCol, 2);
    ellipse(ctx, -70 + tailWave, -24, 4, 7, '#2b2a29', INK, 1);

    // Thân voi lớn đồ sộ
    path(ctx, 'M -62 -55 C -66 -88 -30 -94 10 -90 C 44 -86 52 -62 50 -44 C 48 -32 20 -28 -12 -28 C -44 -28 -60 -34 -62 -55 Z', volume(ctx, -5, -62, 58, 34, bodyCol, 0.3, -0.2), INK, 2.4);
    // Bụng mềm
    path(ctx, 'M -46 -34 C -14 -26 18 -26 42 -38 C 42 -32 20 -28 -12 -28 C -36 -28 -46 -30 -46 -34 Z', bellyCol, null);

    // Nếp nhăn da hông
    for (let i = -1; i <= 2; i++) {
      path(ctx, `M ${i * 14 - 10} -70 Q ${i * 14 - 6} -50 ${i * 14 - 12} -36`, null, tone(bodyCol, -0.16), 1.2);
    }

    // 2 chân gần
    drawSavannaLeg(ctx, -26, 1, Math.PI, walk, stride, legSpec);
    drawSavannaLeg(ctx, 42, 1, 0, walk, stride, legSpec);

    // Đầu & Vòi & Ngà
    ctx.save();
    const pivot = [36, -66];
    ctx.translate(pivot[0], pivot[1]);
    ctx.rotate(down * 0.8);
    ctx.translate(-pivot[0], -pivot[1]);

    // Ngà xa
    path(ctx, 'M 54 -48 C 68 -48 78 -40 82 -24 C 78 -28 70 -34 52 -42 Z', volume(ctx, 68, -36, 14, 12, '#f6f4e8'), INK, 1.2);

    // Khối đầu voi
    ellipse(ctx, 48, -68, 22, 24, volume(ctx, 48, -68, 22, 24, bodyCol), INK, 2);
    // Gù trán
    ellipse(ctx, 42, -84, 14, 10, volume(ctx, 42, -84, 14, 10, bodyCol), INK, 1.5);

    // Mắt
    drawEye(ctx, 52, -72, 4.5, s.blink || 0, 1, '#4a3b2c');

    // Miệng dưới
    if (mouth > 0.1) {
      path(ctx, `M 46 -48 Q 54 ${-44 + mouth * 10} 58 -46`, '#883a42', INK, 1.4);
    }

    // Ngà gần
    path(ctx, 'M 58 -46 C 74 -46 86 -36 90 -18 C 85 -24 76 -30 56 -38 Z', volume(ctx, 74, -32, 16, 14, '#fffdf2'), INK, 1.4);

    // Vòi voi dài uốn lượn linh hoạt
    const tipX = 66 + trunkSway + (down ? 10 : 0);
    const tipY = -6 + (down ? 18 : 0);
    const midX = 64 + trunkSway * 0.4;
    const midY = -34;
    limb(ctx, [[54, -54], [midX, midY], [tipX, tipY]], bodyCol, 13);
    limb(ctx, [[midX, midY], [tipX, tipY], [tipX + 6, tipY - 4]], bodyCol, 8);
    ellipse(ctx, tipX + 5, tipY - 3, 4, 3.5, tone(bodyCol, -0.2), INK, 1);
    // Lỗ vòi
    ellipse(ctx, tipX + 7, tipY - 3, 1.5, 2, '#222222', null);

    // Nếp nhăn trên vòi
    for (let j = 1; j <= 5; j++) {
      const u = j / 6;
      const rx = 54 + (tipX - 54) * u;
      const ry = -54 + (tipY - (-54)) * u;
      line(ctx, [[rx - 4, ry], [rx + 4, ry - 1]], tone(bodyCol, -0.2), 1.2);
    }

    // Tai to hình quạt Châu Phi (đặc trưng vẫy nhẹ)
    ctx.save();
    ctx.translate(32, -74);
    ctx.rotate(earTwitch - 0.1);
    path(ctx, 'M 0 0 C -18 -18 -34 -6 -32 24 C -30 46 -10 56 6 42 C 16 32 12 10 0 0 Z', volume(ctx, -14, 18, 20, 28, bodyCol), INK, 2);
    // Lòng tai hồng tím nhạt
    path(ctx, 'M -4 4 C -16 -8 -26 2 -24 24 C -22 38 -8 44 2 34 C 8 26 6 12 -4 4 Z', '#b88992', null);
    ctx.restore();

    ctx.restore();
    ctx.restore();
  }

  // 2. HIPPO (Hà mã)
  function drawHippo(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#6a6370';
    const bellyCol = '#b68393'; // bụng hồng hào đặc trưng hà mã

    ctx.save();
    const legSpec = { color: bodyCol, legTop: -26, legLen: 26, legWidth: 14, footType: 'claw', strideDist: 10, liftHeight: 6 };
    // Chân xa
    drawSavannaLeg(ctx, -36, 0, 0, walk, stride, legSpec);
    drawSavannaLeg(ctx, 24, 0, Math.PI, walk, stride, legSpec);

    // Đuôi ngắn dẹp
    path(ctx, 'M -56 -44 Q -68 -38 -64 -28 Q -58 -36 -54 -40 Z', bodyCol, INK, 1.2);

    // Thân thùng tròn béo
    path(ctx, 'M -56 -48 C -60 -76 -20 -82 18 -78 C 46 -74 54 -52 50 -36 C 46 -20 18 -16 -12 -16 C -40 -16 -54 -24 -56 -48 Z', volume(ctx, -2, -50, 54, 32, bodyCol), INK, 2.2);
    // Vùng bụng hồng
    ellipse(ctx, 0, -22, 38, 12, bellyCol, null);

    // Chân gần
    drawSavannaLeg(ctx, -22, 1, Math.PI, walk, stride, legSpec);
    drawSavannaLeg(ctx, 36, 1, 0, walk, stride, legSpec);

    // Đầu & Mõm vuông to lớn
    ctx.save();
    const hp = [30, -52];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.7);
    ctx.translate(-hp[0], -hp[1]);

    // Hộp sọ
    ellipse(ctx, 40, -58, 18, 18, volume(ctx, 40, -58, 18, 18, bodyCol), INK, 2);

    // Tai nhỏ vẫy nhanh
    const earWag = Math.sin(t * 8) * 0.15;
    for (const [ex, ey] of [[30, -74], [42, -75]]) {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(earWag);
      ellipse(ctx, 0, 0, 5, 7, bodyCol, INK, 1.2);
      ellipse(ctx, 0, 0, 3, 4.5, '#d49aa8', null);
      ctx.restore();
    }

    // Mắt nhỏ nhô cao trên đỉnh đầu (thích nghi ngâm nước)
    drawEye(ctx, 44, -66, 4, s.blink || 0, 1, '#3b2f25');

    // Hàm mở rộng đặc trưng hà mã khi mouth > 0
    if (mouth > 0.05) {
      const openAng = mouth * 0.6;
      // Hàm dưới hạ xuống
      ctx.save();
      ctx.translate(46, -42);
      ctx.rotate(openAng);
      path(ctx, 'M 0 0 C 14 0 28 4 32 10 C 26 18 10 16 -2 10 Z', volume(ctx, 16, 8, 16, 8, bodyCol), INK, 1.8);
      // Răng nanh to nhô ra ở hàm dưới
      path(ctx, 'M 24 2 L 26 -8 L 29 2 Z', '#fdfbf0', INK, 1);
      path(ctx, 'M 16 3 L 17 -4 L 19 3 Z', '#fdfbf0', INK, 1);
      // Vòm họng đỏ
      ellipse(ctx, 10, 6, 8, 4, '#8a2b36', null);
      ctx.restore();
    }

    // Mõm trên phồng to hình khối chữ nhật
    path(ctx, 'M 36 -54 C 44 -58 64 -58 72 -50 C 78 -44 76 -36 68 -36 C 54 -36 42 -42 36 -54 Z', volume(ctx, 56, -46, 20, 12, bodyCol), INK, 2);
    // Đệm môi hồng & nốt ria mép
    ellipse(ctx, 64, -42, 10, 7, tone(bodyCol, 0.1), INK, 1.2);
    // Lỗ mũi nhô cao
    ellipse(ctx, 66, -52, 3.5, 4.5, tone(bodyCol, -0.25), INK, 1);
    ellipse(ctx, 67, -52, 2, 2.8, '#1b1416', null);

    ctx.restore();
    ctx.restore();
  }

  // 3. CROCODILE (Cá sấu)
  function drawCrocodile(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#4e633d';
    const bellyCol = '#b2c088';
    const scuteCol = tone(bodyCol, -0.3);

    ctx.save();
    // Đuôi dài khỏe gợn sóng ngang
    const tailWave = Math.sin(t * 3.5 + stride) * 8 * (0.4 + walk * 0.8);
    // Gai đuôi
    for (let i = 0; i < 7; i++) {
      const u = i / 6;
      const tx = -40 - u * 50;
      const ty = -24 + u * 12 + Math.sin(tailWave * 0.1 + i) * 3;
      path(ctx, `M ${tx} ${ty} L ${tx - 4} ${ty - 10} L ${tx + 4} ${ty - 2} Z`, scuteCol, INK, 0.8);
    }
    // Bản đuôi chính
    path(ctx, `M -36 -28 C -60 -26 -78 -20 ${-94 + tailWave} -10 C -82 -4 -58 -10 -36 -14 Z`, volume(ctx, -65, -18, 30, 10, bodyCol), INK, 1.8);

    // Chân bò sát xòe rộng (chân xa)
    const crocLeg = (lx, near, off) => {
      const ph = stride + off;
      const sw = -Math.sin(ph) * walk * 12;
      const col = near ? bodyCol : tone(bodyCol, -0.2);
      const fx = lx + sw, fy = 0;
      limb(ctx, [[lx, -16], [lx + (near ? 6 : -6), -12], [fx, fy - 2]], col, 7);
      // Móng vuốt xòe
      for (let c = -1; c <= 1; c++) {
        line(ctx, [[fx + c * 3, fy - 2], [fx + c * 5 + 3, fy]], '#1f2418', 1.8);
      }
    };
    crocLeg(-28, 0, 0);
    crocLeg(26, 0, Math.PI);

    // Thân cá sấu dẹp dài sát đất
    path(ctx, 'M -40 -26 C -44 -38 -10 -40 24 -36 C 44 -32 48 -20 44 -12 C 34 -4 -6 -6 -32 -10 C -40 -12 -42 -18 -40 -26 Z', volume(ctx, -4, -22, 44, 16, bodyCol), INK, 2);
    // Bụng vàng nhạt có sọc vảy
    path(ctx, 'M -32 -10 C -6 -6 28 -8 40 -14 C 36 -6 4 -4 -28 -6 Z', bellyCol, null);

    // Hàng gai vảy cứng lưng cá sấu
    for (let j = 0; j < 8; j++) {
      const sx = -32 + j * 9;
      const sy = -28 - (j > 2 && j < 6 ? 4 : 0);
      path(ctx, `M ${sx} ${sy} L ${sx + 4} ${sy - 6} L ${sx + 8} ${sy} Z`, scuteCol, INK, 1);
    }

    // Chân gần
    crocLeg(-18, 1, Math.PI);
    crocLeg(36, 1, 0);

    // Đầu & Mõm dài răng nhọn
    ctx.save();
    const jawOpen = mouth * 0.55;

    // Hàm dưới
    ctx.save();
    ctx.translate(40, -16);
    ctx.rotate(jawOpen);
    path(ctx, 'M 0 0 L 46 -2 C 48 3 44 6 36 6 L 0 4 Z', volume(ctx, 22, 2, 22, 4, bodyCol), INK, 1.4);
    // Răng hàm dưới chĩa lên
    for (let r = 8; r < 42; r += 7) {
      path(ctx, `M ${r} 0 L ${r + 2} -4 L ${r + 4} 0 Z`, '#fbfbf0', null);
    }
    ctx.restore();

    // Hàm trên & Mắt gồ
    ellipse(ctx, 42, -26, 10, 8, volume(ctx, 42, -26, 10, 8, bodyCol), INK, 1.6);
    // Mắt vàng bò sát
    drawEye(ctx, 44, -30, 4, s.blink || 0, 1, '#bfa820');

    // Mõm trên
    path(ctx, 'M 38 -24 C 52 -26 76 -22 84 -18 C 86 -14 80 -12 70 -12 L 38 -14 Z', volume(ctx, 60, -20, 24, 7, bodyCol), INK, 1.6);
    // Lỗ mũi gồ ở chóp mõm
    ellipse(ctx, 81, -20, 2.5, 2, tone(bodyCol, -0.3), INK, 0.8);
    // Răng hàm trên cắm xuống xen kẽ
    for (let t_idx = 12; t_idx < 40; t_idx += 6) {
      path(ctx, `M ${40 + t_idx} -14 L ${42 + t_idx} -9 L ${44 + t_idx} -14 Z`, '#ffffff', null);
    }

    ctx.restore();
    ctx.restore();
  }

  // 4. GORILLA (Khỉ đột)
  function drawGorilla(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#313338';
    const skinCol = '#1f2024';
    const chestCol = '#42454c';
    const silverback = s.silverback ?? true;

    ctx.save();
    // Chân sau ngắn cong gập (chân xa)
    const hindLeg = (lx, near, off) => {
      const ph = stride + off;
      const sw = -Math.sin(ph) * walk * 8;
      const col = near ? bodyCol : tone(bodyCol, -0.2);
      limb(ctx, [[lx, -30], [lx - 6 + sw * 0.4, -14], [lx + sw, -2]], col, 11);
      ellipse(ctx, lx + sw + 2, -2, 7, 3, skinCol, INK, 1);
    };
    hindLeg(-32, 0, 0);

    // Tay trước dài vạm vỡ chống khớp ngón tay (knuckle-walk) (tay xa)
    const foreArm = (ax, near, off) => {
      const ph = stride + off;
      const sw = -Math.sin(ph) * walk * 12;
      const col = near ? bodyCol : tone(bodyCol, -0.18);
      const kx = ax + sw;
      limb(ctx, [[ax, -48], [ax + 10, -24], [kx, -3]], col, 13);
      // Nắm đấm chống đất
      ellipse(ctx, kx + 1, -2.5, 6.5, 4.5, skinCol, INK, 1.2);
    };
    foreArm(22, 0, Math.PI);

    // Lưng & Mông dốc đặc trưng
    path(ctx, 'M -42 -28 C -48 -54 -24 -70 12 -74 C 36 -72 44 -56 38 -38 C 30 -22 -4 -20 -36 -20 Z', volume(ctx, -6, -50, 42, 28, bodyCol), INK, 2.2);

    // Yên bạc sau lưng (Silverback)
    if (silverback) {
      path(ctx, 'M -34 -38 C -36 -58 -16 -66 4 -66 C 14 -56 8 -42 -10 -36 Z', volume(ctx, -14, -52, 22, 16, '#969ba6', 0.2, -0.1), null);
    }

    // Cơ ngực vạm vỡ
    ellipse(ctx, 16, -52, 16, 18, volume(ctx, 16, -52, 16, 18, chestCol), INK, 1.4);
    // Rãnh ngực
    line(ctx, [[16, -64], [16, -42]], tone(chestCol, -0.3), 1.5);
    ellipse(ctx, 10, -52, 5, 4, tone(chestCol, 0.15), null);
    ellipse(ctx, 22, -52, 5, 4, tone(chestCol, 0.15), null);

    // Chân gần & Tay gần
    hindLeg(-18, 1, Math.PI);
    foreArm(34, 1, 0);

    // Cổ ngắn & Đầu to gồ
    ctx.save();
    const hx = 28, hy = -76;
    // Gờ xương đỉnh đầu (Sagittal crest)
    path(ctx, 'M 16 -76 C 18 -92 36 -94 44 -86 C 52 -78 50 -64 42 -62 C 30 -62 18 -66 16 -76 Z', volume(ctx, 30, -80, 16, 16, bodyCol), INK, 1.8);

    // Mặt không lông màu xám đen bóng
    path(ctx, 'M 28 -82 C 40 -82 46 -76 46 -68 C 46 -58 36 -56 26 -58 C 22 -66 22 -78 28 -82 Z', volume(ctx, 34, -70, 12, 14, skinCol), INK, 1.4);

    // Gờ mày nhô cao dữ dội
    path(ctx, 'M 24 -78 Q 36 -82 46 -76', null, INK, 3.2);

    // Mắt sâu trầm ngâm
    drawEye(ctx, 32, -74, 3.5, s.blink || 0, 1, '#b07030');

    // Mũi tẹt rộng hai lỗ mũi to
    ellipse(ctx, 38, -68, 5, 3.5, tone(skinCol, -0.2), INK, 1);
    ellipse(ctx, 36.5, -68, 1.5, 2, '#0a0a0c', null);
    ellipse(ctx, 39.5, -68, 1.5, 2, '#0a0a0c', null);

    // Miệng / Gầm
    if (mouth > 0.1) {
      path(ctx, `M 28 -62 Q 36 ${-54 + mouth * 12} 44 -62`, '#78262e', INK, 1.6);
      // Răng nanh khỉ đột
      path(ctx, 'M 32 -62 L 33 -58 L 35 -62 Z', '#f4f4ea', null);
      path(ctx, 'M 39 -62 L 41 -58 L 42 -62 Z', '#f4f4ea', null);
    } else {
      path(ctx, 'M 30 -62 Q 36 -59 42 -62', null, INK, 1.6);
    }

    // Tai nhỏ sát đầu
    ellipse(ctx, 18, -74, 3.5, 4.5, skinCol, INK, 1);

    ctx.restore();
    ctx.restore();
  }

  // 5. CHEETAH (Báo săn đốm)
  function drawCheetah(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#e5a84b';
    const bellyCol = '#fff6e4';
    const spotCol = '#1f1a14';

    ctx.save();
    // Chân dài thanh mảnh (chân xa)
    const catLeg = { color: bodyCol, legTop: -36, legLen: 36, legWidth: 6, footType: 'paw', strideDist: 18, liftHeight: 9 };
    drawSavannaLeg(ctx, -32, 0, 0, walk, stride, catLeg);
    drawSavannaLeg(ctx, 22, 0, Math.PI, walk, stride, catLeg);

    // Đuôi dài làm bánh lái khi rượt đuổi tốc độ
    const tailWhip = Math.sin(t * 5 + stride * 2) * 10;
    ctx.save();
    path(ctx, `M -44 -44 Q -68 -52 ${-76 + tailWhip} -24`, null, INK, 5.5);
    path(ctx, `M -44 -44 Q -68 -52 ${-76 + tailWhip} -24`, null, bodyCol, 4);
    // Vòng tròn đen đuôi và chóp đuôi trắng
    ellipse(ctx, -76 + tailWhip, -24, 3.5, 3.5, '#ffffff', INK, 0.8);
    ctx.restore();

    // Thân thon ngực sâu, eo ót khí động học
    path(ctx, 'M -46 -42 C -48 -62 -22 -66 12 -64 C 34 -62 42 -48 38 -36 C 30 -28 16 -30 2 -38 C -14 -44 -34 -44 -46 -42 Z', volume(ctx, -6, -50, 44, 20, bodyCol), INK, 1.8);
    // Bụng trắng sáng
    path(ctx, 'M -32 -40 C -12 -42 12 -38 28 -34 C 22 -30 8 -32 -10 -36 Z', bellyCol, null);

    // Đốm đen đặc trưng báo săn rải rác
    const spots = [[-34, -54], [-24, -58], [-12, -56], [0, -58], [14, -56], [24, -48], [-28, -46], [-16, -48], [4, -48], [-6, -42]];
    for (const [sx, sy] of spots) {
      ellipse(ctx, sx, sy, 2.2, 2.2, spotCol, null);
    }

    // Chân gần
    drawSavannaLeg(ctx, -20, 1, Math.PI, walk, stride, catLeg);
    drawSavannaLeg(ctx, 32, 1, 0, walk, stride, catLeg);

    // Đầu nhỏ tròn
    ctx.save();
    const hp = [28, -58];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.7);
    ctx.translate(-hp[0], -hp[1]);

    ellipse(ctx, 38, -66, 12, 11, volume(ctx, 38, -66, 12, 11, bodyCol), INK, 1.6);
    // Mõm trắng
    ellipse(ctx, 45, -63, 6, 5, bellyCol, INK, 1);
    // Mũi đen nhỏ
    ellipse(ctx, 49, -65, 2, 1.5, spotCol, null);

    // Dải "giọt lệ đen" đặc trưng từ khóe mắt xuống khóe miệng
    path(ctx, 'M 40 -67 Q 44 -64 45 -60', null, spotCol, 1.8);

    // Mắt màu hổ phách sắc bén
    drawEye(ctx, 40, -68, 3.8, s.blink || 0, 1, '#d49018');

    // Miệng
    if (mouth > 0.1) {
      path(ctx, `M 42 -61 Q 46 ${-55 + mouth * 8} 50 -61`, '#a8323e', INK, 1.2);
    } else {
      path(ctx, 'M 43 -61 Q 46 -59 48 -61', null, INK, 1.2);
    }

    // Tai tròn có đốm đen sau lưng tai
    ellipse(ctx, 30, -75, 4, 4.5, spotCol, INK, 1);
    ellipse(ctx, 31, -74, 2.5, 3, '#fbe3bf', null);

    ctx.restore();
    ctx.restore();
  }

  // 6. HYENA (Linh cẩu đốm)
  function drawHyena(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#bfa075';
    const muzzleCol = '#382e25';
    const spotCol = '#4e3b2c';

    ctx.save();
    // Chân trước dài, chân sau thấp dốc
    const frontLeg = { color: bodyCol, legTop: -36, legLen: 36, legWidth: 7, footType: 'claw', strideDist: 14, liftHeight: 8 };
    const backLeg = { color: bodyCol, legTop: -28, legLen: 28, legWidth: 7, footType: 'claw', strideDist: 12, liftHeight: 7 };
    drawSavannaLeg(ctx, -32, 0, 0, walk, stride, backLeg);
    drawSavannaLeg(ctx, 22, 0, Math.PI, walk, stride, frontLeg);

    // Đuôi ngắn xù rủ xuống
    path(ctx, 'M -46 -36 Q -58 -30 -56 -18 Q -50 -26 -44 -32 Z', volume(ctx, -52, -26, 8, 12, '#382e25'), INK, 1.2);

    // Thân dốc: vai gồ rất cao, mông thấp
    path(ctx, 'M -44 -34 C -48 -50 -18 -68 18 -66 C 36 -64 40 -48 34 -34 C 24 -24 -2 -24 -32 -26 Z', volume(ctx, -4, -48, 40, 24, bodyCol), INK, 2);

    // Bờm lông dựng đứng từ gáy dọc theo lưng
    for (let i = -1; i < 5; i++) {
      const mx = 6 + i * 6;
      const my = -66 + (i > 2 ? (i - 2) * 5 : 0);
      path(ctx, `M ${mx} ${my} L ${mx - 3} ${my - 8} L ${mx + 3} ${my} Z`, '#382e25', null);
    }

    // Đốm nâu sẫm trên thân
    for (const [sx, sy] of [[-30, -40], [-20, -48], [-8, -44], [6, -52], [-14, -36], [16, -44], [0, -38]]) {
      ellipse(ctx, sx, sy, 2.8, 3.2, spotCol, null);
    }

    // Chân gần
    drawSavannaLeg(ctx, -20, 1, Math.PI, walk, stride, backLeg);
    drawSavannaLeg(ctx, 32, 1, 0, walk, stride, frontLeg);

    // Cổ dày khỏe & Đầu mõm đen cười toe toét (nụ cười linh cẩu)
    ctx.save();
    const hp = [24, -58];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.7);
    ctx.translate(-hp[0], -hp[1]);

    // Hộp sọ
    ellipse(ctx, 36, -66, 14, 13, volume(ctx, 36, -66, 14, 13, bodyCol), INK, 1.8);
    // Mõm đen thui gồ ghề
    ellipse(ctx, 46, -62, 8, 6.5, volume(ctx, 46, -62, 8, 6.5, muzzleCol), INK, 1.2);
    // Mũi to
    ellipse(ctx, 51, -64, 2.5, 2, '#111111', null);

    // Mắt xếch ranh mãnh
    drawEye(ctx, 36, -70, 3.8, s.blink || 0, 1, '#d88c20');

    // Nụ cười ngoác miệng linh cẩu đặc trưng
    if (mouth > 0.1) {
      path(ctx, `M 40 -60 Q 46 ${-50 + mouth * 12} 52 -60`, '#942b36', INK, 1.4);
      // Răng nanh sắc nhọn
      path(ctx, 'M 43 -60 L 44 -56 L 46 -60 Z', '#fffaea', null);
      path(ctx, 'M 48 -60 L 49 -56 L 51 -60 Z', '#fffaea', null);
    } else {
      path(ctx, 'M 38 -60 Q 44 -55 50 -61', null, INK, 1.6);
    }

    // Tai tròn lớn vểnh đứng
    ellipse(ctx, 28, -78, 5.5, 7.5, volume(ctx, 28, -78, 5.5, 7.5, '#4e3b2c'), INK, 1.2);
    ellipse(ctx, 29, -77, 3.5, 5, '#caa880', null);

    ctx.restore();
    ctx.restore();
  }

  // 7. GIRAFFE (Hươu cao cổ)
  function drawGiraffe(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, down = s.head_down || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#f4deb3';
    const patchCol = '#9e521e';

    ctx.save();
    // Chân dài lênh khênh
    const giraffeLeg = { color: bodyCol, legTop: -46, legLen: 46, legWidth: 7, footType: 'hoof', hoofColor: '#281c14', strideDist: 16, liftHeight: 10 };
    drawSavannaLeg(ctx, -32, 0, 0, walk, stride, giraffeLeg);
    drawSavannaLeg(ctx, 24, 0, Math.PI, walk, stride, giraffeLeg);

    // Đuôi mảnh có túm lông đen dài
    const tailWag = Math.sin(t * 3.5) * 4;
    line(ctx, [[-40, -56], [-52, -42], [-50 + tailWag, -22]], bodyCol, 2.5);
    ellipse(ctx, -50 + tailWag, -20, 3.5, 6, '#281c14', INK, 0.8);

    // Thân ngắn dốc xuống từ vai
    path(ctx, 'M -42 -54 C -44 -74 -12 -78 20 -72 C 34 -68 36 -54 30 -44 C 18 -38 -8 -38 -34 -42 Z', volume(ctx, -6, -58, 38, 20, bodyCol), INK, 2);

    // Mảng đốm đa giác trên thân
    const bodyPatches = [
      'M -32 -62 L -22 -64 L -20 -54 L -30 -52 Z',
      'M -16 -66 L -2 -68 L 0 -56 L -14 -54 Z',
      'M 4 -68 L 18 -66 L 16 -54 L 2 -54 Z',
      'M -24 -50 L -12 -50 L -14 -42 L -26 -44 Z',
      'M -8 -50 L 8 -50 L 6 -42 L -6 -42 Z'
    ];
    for (const d of bodyPatches) path(ctx, d, patchCol, null);

    // Chân gần
    drawSavannaLeg(ctx, -18, 1, Math.PI, walk, stride, giraffeLeg);
    drawSavannaLeg(ctx, 34, 1, 0, walk, stride, giraffeLeg);

    // CỔ SIÊU DÀI VƯƠN CAO LÊN TỚI y = -135
    ctx.save();
    const neckPivot = [22, -68];
    ctx.translate(neckPivot[0], neckPivot[1]);
    ctx.rotate(down * 0.9); // Cúi đầu uống nước / ăn cỏ
    ctx.translate(-neckPivot[0], -neckPivot[1]);

    // Khối cổ dài vươn chéo
    path(ctx, 'M 14 -70 L 30 -130 L 42 -128 L 28 -68 Z', volume(ctx, 28, -98, 16, 36, bodyCol), INK, 2);
    // Bờm ngắn dọc gáy cổ
    for (let b = 0; b < 10; b++) {
      const u = b / 9;
      const bx = 14 + (30 - 14) * u;
      const by = -70 + (-130 - (-70)) * u;
      path(ctx, `M ${bx} ${by} L ${bx - 4} ${by + 2} L ${bx} ${by + 6} Z`, patchCol, null);
    }
    // Các mảng đốm dọc cổ
    for (let p = 1; p <= 6; p++) {
      const u = p / 7;
      const px = 18 + (34 - 18) * u;
      const py = -70 + (-126 - (-70)) * u;
      ellipse(ctx, px, py, 4.5, 4, patchCol, null, 0, 0.4);
    }

    // Đầu nhỏ thuôn
    const hx = 36, hy = -134;
    ellipse(ctx, hx, hy, 9, 10, volume(ctx, hx, hy, 9, 10, bodyCol), INK, 1.4);
    // Mõm xám tro kéo dài
    ellipse(ctx, hx + 9, hy + 3, 6, 4.5, '#78685e', INK, 1);
    ellipse(ctx, hx + 12, hy + 2, 1.5, 1.2, '#1f1a16', null);

    // Mắt to có hàng mi dài
    drawEye(ctx, hx + 3, hy - 2, 3.5, s.blink || 0, 1, '#3b2416');

    // 2 sừng nhỏ có chỏm lông đen ở chóp (Ossicones)
    line(ctx, [[hx - 2, hy - 8], [hx - 4, hy - 17]], bodyCol, 2.5);
    ellipse(ctx, hx - 4, hy - 18, 2.5, 2.5, '#281c14', null);
    line(ctx, [[hx + 3, hy - 8], [hx + 3, hy - 18]], bodyCol, 2.5);
    ellipse(ctx, hx + 3, hy - 19, 2.5, 2.5, '#281c14', null);

    // Tai vểnh ngang
    ellipse(ctx, hx - 6, hy - 4, 5, 2.5, bodyCol, INK, 0.8, -0.3);

    // Lưỡi dài màu tím đen nếu mở miệng
    if (mouth > 0.1) {
      path(ctx, `M ${hx + 10} ${hy + 4} Q ${hx + 20} ${hy + 10} ${hx + 16} ${hy + 14}`, null, '#382f42', 2.8);
    }

    ctx.restore();
    ctx.restore();
  }

  // 8. MEERKAT (Chồn đất Meerkat đứng canh gác)
  function drawMeerkat(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#c8aa84';
    const bellyCol = '#eedbc0';
    const maskCol = '#2b231d';

    ctx.save();
    // Đuôi thanh mảnh chống đất tạo thế kiềng 3 chân (Tripod)
    const tailWiggle = Math.sin(t * 2) * 2;
    path(ctx, `M -10 -16 Q -22 -10 ${-26 + tailWiggle} 0`, null, INK, 4.5);
    path(ctx, `M -10 -16 Q -22 -10 ${-26 + tailWiggle} 0`, null, bodyCol, 3);
    // Chóp đuôi đen
    ellipse(ctx, -26 + tailWiggle, 0, 3, 2, maskCol, null);

    // Hai chân sau đứng thẳng trên bàn chân
    for (const [lx, off] of [[-6, 0], [6, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 4;
      limb(ctx, [[lx, -18], [lx, -8], [lx + 4 + sw, 0]], bodyCol, 5);
      // Móng vuốt đào đất
      line(ctx, [[lx + 2 + sw, 0], [lx + 8 + sw, 0]], '#1b1b1b', 1.5);
    }

    // Thân đứng thẳng hình giọt nước
    path(ctx, 'M -14 -18 C -16 -40 -12 -54 0 -56 C 12 -54 16 -40 14 -18 C 12 -4 -12 -4 -14 -18 Z', volume(ctx, 0, -34, 16, 26, bodyCol), INK, 1.8);
    // Bụng sáng màu
    ellipse(ctx, 2, -28, 9, 18, bellyCol, null);

    // Các sọc ngang mờ trên lưng
    for (let i = 0; i < 4; i++) {
      line(ctx, [[-10, -42 + i * 6], [-4, -42 + i * 6]], tone(bodyCol, -0.2), 1.5);
    }

    // Hai tay trước ôm trước ngực canh gác
    const armTwitch = Math.sin(t * 3) * 1.5;
    limb(ctx, [[-2, -44], [6, -38], [8 + armTwitch, -32]], bodyCol, 4.5);
    // Móng tay nhỏ
    line(ctx, [[8 + armTwitch, -32], [11 + armTwitch, -30]], maskCol, 1.5);

    // Đầu xoay qua lại quan sát xung quanh (Sentinel scan)
    const scanAng = Math.sin(t * 2.2) * 0.18;
    ctx.save();
    ctx.translate(0, -56);
    ctx.rotate(scanAng);

    ellipse(ctx, 0, 0, 10, 11, volume(ctx, 0, 0, 10, 11, bodyCol), INK, 1.5);
    // Mõm nhọn sáng màu
    ellipse(ctx, 6, 2, 5, 4, bellyCol, INK, 0.8);
    // Mũi đen nhỏ
    ellipse(ctx, 9, 1, 1.8, 1.4, maskCol, null);

    // Quầng mắt đen đặc trưng chống chói nắng mặt trời
    ellipse(ctx, 3, -2, 4.2, 4, maskCol, null);
    drawEye(ctx, 3, -2, 3.2, s.blink || 0, 1, '#1b1b1b');

    // Tai đen nhỏ hình bán nguyệt
    ellipse(ctx, -8, -3, 3, 4, maskCol, INK, 0.8);

    if (mouth > 0.1) {
      ellipse(ctx, 7, 4, 2, 2.5, '#882b32', null);
    }

    ctx.restore();
    ctx.restore();
  }

  // 9. WARTHOG (Lợn rừng Châu Phi)
  function drawWarthog(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#725e51';
    const tuskCol = '#fffbe8';

    ctx.save();
    // Chân mảnh có móng guốc nhỏ
    const warthogLeg = { color: bodyCol, legTop: -28, legLen: 28, legWidth: 7, footType: 'hoof', hoofColor: '#201a16', strideDist: 12, liftHeight: 8 };
    drawSavannaLeg(ctx, -30, 0, 0, walk, stride, warthogLeg);
    drawSavannaLeg(ctx, 22, 0, Math.PI, walk, stride, warthogLeg);

    // Đuôi mỏng dựng đứng khi chạy (Antenna tail đặc trưng lợn rừng)
    const tailFlag = Math.sin(t * 8) * 3;
    line(ctx, [[-40, -42], [-46, -60], [-44 + tailFlag, -72]], bodyCol, 2);
    ellipse(ctx, -44 + tailFlag, -74, 3, 5, '#1b1816', null);

    // Thân lợn rừng chắc nịch
    path(ctx, 'M -42 -40 C -44 -64 -14 -68 18 -64 C 36 -60 40 -46 36 -32 C 26 -20 -2 -20 -34 -22 Z', volume(ctx, -4, -46, 40, 24, bodyCol), INK, 2);

    // Bờm lông gai dài dựng đứng từ đỉnh đầu dọc lưng
    for (let i = 0; i < 7; i++) {
      const bx = -24 + i * 8;
      const by = -64 + (i > 3 ? (i - 3) * 3 : 0);
      path(ctx, `M ${bx} ${by} L ${bx - 2} ${by - 12} L ${bx + 4} ${by} Z`, '#2a221c', null);
    }

    // Chân gần
    drawSavannaLeg(ctx, -18, 1, Math.PI, walk, stride, warthogLeg);
    drawSavannaLeg(ctx, 32, 1, 0, walk, stride, warthogLeg);

    // Đầu & Mõm rộng & Ngà cong vút
    ctx.save();
    const hp = [24, -50];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.7);
    ctx.translate(-hp[0], -hp[1]);

    // Đầu lợn
    ellipse(ctx, 36, -56, 16, 14, volume(ctx, 36, -56, 16, 14, bodyCol), INK, 1.8);

    // Cục bướu da (Warts) dưới mắt
    ellipse(ctx, 38, -50, 4, 3, tone(bodyCol, -0.2), INK, 0.8);
    ellipse(ctx, 46, -46, 3, 2.5, tone(bodyCol, -0.2), INK, 0.8);

    // Mắt nhỏ
    drawEye(ctx, 36, -60, 3.2, s.blink || 0, 1, '#2e1e14');

    // Mõm phẳng hình đĩa
    ellipse(ctx, 52, -48, 8, 6.5, volume(ctx, 52, -48, 8, 6.5, tone(bodyCol, -0.15)), INK, 1.4);
    ellipse(ctx, 51, -48, 2, 2.5, '#19120e', null);
    ellipse(ctx, 54, -48, 2, 2.5, '#19120e', null);

    // Cặp ngà cong lớn ngoạn mục ở hai bên mép (uốn cong lên trên)
    path(ctx, 'M 44 -48 C 54 -46 64 -56 62 -70 C 58 -66 52 -52 42 -46 Z', volume(ctx, 54, -58, 10, 14, tuskCol), INK, 1.2);
    // Ngà dưới nhọn nhỏ
    path(ctx, 'M 46 -44 L 54 -50 L 48 -42 Z', tuskCol, INK, 0.8);

    // Tai nhọn có túm lông ở chóp
    path(ctx, 'M 26 -64 L 20 -76 L 32 -70 Z', bodyCol, INK, 1);
    line(ctx, [[20, -76], [18, -82]], '#1b1816', 1.5);

    if (mouth > 0.1) {
      ellipse(ctx, 46, -42, 4, 3, '#78232a', null);
    }

    ctx.restore();
    ctx.restore();
  }

  // Đăng ký toàn bộ 9 rig Savanna vào RemakeVector
  const rigs = {
    elephant: { group: 'animal', draw: drawElephant },
    hippo: { group: 'animal', draw: drawHippo },
    crocodile: { group: 'animal', draw: drawCrocodile },
    gorilla: { group: 'animal', draw: drawGorilla },
    cheetah: { group: 'animal', draw: drawCheetah },
    hyena: { group: 'animal', draw: drawHyena },
    giraffe: { group: 'animal', draw: drawGiraffe },
    meerkat: { group: 'animal', draw: drawMeerkat },
    warthog: { group: 'animal', draw: drawWarthog }
  };

  register({ rigs });
})();
