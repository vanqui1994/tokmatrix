// Remake Vector Engine Pack: Sea Monsters (6 thuỷ quái cấp SS: leviathan, drake, behemoth, crystal_whale, magma, megalodon)
// Tách khỏi lõi engine: gói chỉ thêm rig qua RemakeVector.register, vẽ bằng bộ hàm RemakeVector.kit.
(function () {
  'use strict';
  if (!globalThis.RemakeVector) throw new Error('RemakeVector core engine must be loaded before engine packs.');
  const { kit, register } = globalThis.RemakeVector;
  const { INK, tone, volume, ellipse, path, clamp, hash, mix, celHatch, H } = kit;

  // Thủy quái Leviathan / Bạo vương bò sát biển (Croc Leviathan Kaiju)
  function drawSeaLeviathan(ctx, s, t) {
    const rise = clamp(s.rise !== undefined ? s.rise : 1);
    const rage = clamp(s.rage || 0);
    const jaw = clamp(s.jaw || 0);
    const phase = (hash(s.id) % 7);

    // Bảng màu sắc bám sát 100% hình mẫu:
    const bodyBase = s.style?.body || '#5e2a78';
    const bodyDark = tone(bodyBase, -0.32);
    const bodyLight = tone(bodyBase, 0.28);
    const bellyBase = s.style?.belly || '#a8e7d7';
    const bellyDark = tone(bellyBase, -0.22);
    const bellyLight = tone(bellyBase, 0.35);
    const cyanGlow = s.style?.accent || '#5ef2ff';
    const cyanIce = '#b8f8fd';
    const cyanDark = '#25b4c7';
    const sailColor = s.style?.sail || '#8f408d';
    const toothColor = '#ffffff';
    const clawColor = '#faf5d5';
    const clawShade = '#d4cca0';
    const mouthFlesh = '#381222';
    const tongueColor = '#9e2949';
    const ridgeScale = '#f3eed2';

    // Nhịp bơi và uốn lượn hình sin (Undulation & Swimming motion)
    const swimSpeed = 3.2;
    const bodyBob = Math.sin((t || 0) * 2.2 + phase) * 2.5;
    const bodyPitch = Math.sin((t || 0) * 2.2 + phase) * 0.04;
    const flipperAngle = Math.sin((t || 0) * 2.8 + phase) * 0.16;
    const tailWhip = (s.tentacle || 0) * 24;
    const tailWave1 = Math.sin((t || 0) * swimSpeed - 1.0 + phase) * 5 + tailWhip * 0.5;
    const tailWave2 = Math.sin((t || 0) * swimSpeed - 1.8 + phase) * 10 + tailWhip;
    const sailWave = Math.sin((t || 0) * 3.5 + phase) * 1.5;
    const shake = rage > 0.1 ? (Math.sin((t || 0) * 45) * rage * 0.6) : 0;

    ctx.save();
    // Căn chỉnh trục X lệch -10 để cân đối đầu và đuôi hoàn hảo quanh gốc
    ctx.translate(-10 + shake, (1 - rise) * 58 + bodyBob);
    ctx.rotate(bodyPitch);

    // 1. SÓNG RẼ NƯỚC NỀN
    if (rise > 0.05) {
      ctx.save();
      ctx.globalAlpha *= 0.35 + 0.15 * Math.sin((t || 0) * 2.5);
      ellipse(ctx, 16, -6, 75, 8, 'rgba(110, 235, 255, 0.22)', 'rgba(60, 200, 240, 0.4)', 1.2);
      ellipse(ctx, -14, -4, 46, 5.5, 'rgba(175, 248, 255, 0.3)', null);
      ctx.restore();
    }

    // 2. CHI TRƯỚC PHÍA XA (Far Forelimb)
    ctx.save();
    ctx.translate(-22, -33);
    ctx.rotate(Math.sin((t || 0) * 2.8 + phase + Math.PI) * 0.16);
    path(ctx, 'M -2 -2 C -10 6 -17 18 -14 26 C -11 31 -3 30 4 23 C 9 15 7 5 -2 -2 Z', bodyDark, INK, 1.4);
    for (let i = 0; i < 3; i++) {
      const mx = -13 + i * 5, my = 26 + i * 2;
      path(ctx, `M ${mx} ${my} L ${mx - 4} ${my + 6} L ${mx + 3} ${my + 3} Z`, clawShade, INK, 0.8);
    }
    ctx.restore();

    // 3. CHI SAU PHÍA XA (Far Hindlimb)
    ctx.save();
    ctx.translate(26, -24);
    ctx.rotate(Math.sin((t || 0) * 2.8 + phase + Math.PI * 0.7) * 0.12);
    path(ctx, 'M 0 0 C 8 4 16 13 18 20 C 13 24 7 22 2 16 C -2 11 -2 4 0 0 Z', tone(bodyDark, -0.15), INK, 1.2);
    for (let i = 0; i < 3; i++) {
      const mx = 11 + i * 3, my = 19 + i * 1.5;
      path(ctx, `M ${mx} ${my} L ${mx + 2} ${my + 5} L ${mx - 2} ${my + 3} Z`, clawShade, INK, 0.6);
    }
    ctx.restore();

    // 4. VÂY BUỒM LƯNG KHỔNG LỒ & GAI BĂNG CYAN
    ctx.save();
    ctx.translate(0, sailWave);
    const sailD = 'M -16 -62 C -15 -74 -10 -90 -3 -96 C 6 -98 16 -88 24 -68 C 12 -65 2 -63 -16 -62 Z';
    path(ctx, sailD, volume(ctx, -2, -80, 24, 30, sailColor, 0.35, -0.25), INK, 1.6);
    path(ctx, 'M -14 -63 Q -10 -80 -4 -94', null, bodyDark, 2.2);
    path(ctx, 'M -3 -63 Q 2 -82 5 -96', null, bodyDark, 2.2);
    path(ctx, 'M 8 -64 Q 13 -78 16 -88', null, bodyDark, 2.0);
    path(ctx, 'M 18 -66 Q 22 -75 24 -79', null, bodyDark, 1.8);

    ctx.save();
    ctx.globalAlpha *= 0.45;
    path(ctx, 'M -12 -72 Q -7 -80 -3 -88', null, tone(sailColor, 0.4), 1.2);
    path(ctx, 'M 0 -70 Q 5 -78 9 -86', null, tone(sailColor, 0.4), 1.2);
    path(ctx, 'M 10 -68 Q 14 -74 18 -80', null, tone(sailColor, 0.4), 1.2);
    ctx.restore();

    if (rage > 0.05) {
      ctx.save();
      ctx.shadowColor = cyanGlow;
      ctx.shadowBlur = 10 + 16 * rage;
    }
    const crystal1 = 'M -8 -91 L -4 -102 L 0 -93 L -2 -88 Z';
    path(ctx, crystal1, volume(ctx, -4, -96, 6, 10, cyanGlow, 0.45, -0.2), INK, 1.4);
    path(ctx, 'M -4 -102 L -3 -92', null, cyanIce, 1.2);

    const crystal2 = 'M -1 -93 L 5 -100 L 9 -91 L 3 -87 Z';
    path(ctx, crystal2, volume(ctx, 4, -94, 6, 9, cyanGlow, 0.45, -0.2), INK, 1.4);
    path(ctx, 'M 5 -100 L 4 -90', null, cyanIce, 1.2);

    const crystal3 = 'M 8 -89 L 16 -94 L 18 -85 L 12 -82 Z';
    path(ctx, crystal3, volume(ctx, 14, -88, 6, 8, cyanGlow, 0.45, -0.2), INK, 1.2);

    const crystal0 = 'M -15 -80 L -12 -91 L -7 -83 Z';
    path(ctx, crystal0, volume(ctx, -11, -86, 5, 7, cyanGlow, 0.45, -0.2), INK, 1.2);
    if (rage > 0.05) ctx.restore();
    ctx.restore();

    // 5. ĐUÔI KHỔNG LỒ (Vát dẹt mái chèo tuyết ngọc)
    ctx.save();
    const t0x = 26, t0y = -36;
    const t1x = 48 + tailWave1 * 0.3, t1y = -32 + tailWave1 * 0.6;
    const t2x = 68 + tailWave2 * 0.4, t2y = -26 + tailWave2;
    const tipX = 88 + tailWave2 * 0.6, tipY = -18 + tailWave2 * 1.3;

    // Nửa dưới & chóp đuôi: Xanh băng tuyết ngọc phát sáng
    const tailBellyGrad = ctx.createLinearGradient(t0x, -22, tipX, tipY);
    tailBellyGrad.addColorStop(0, bellyBase);
    tailBellyGrad.addColorStop(0.35, '#70ebf8');
    tailBellyGrad.addColorStop(1, cyanIce);

    // Nửa trên sống đuôi: Tím giáp vảy
    const tailDorsalGrad = ctx.createLinearGradient(t0x, -36, tipX, tipY);
    tailDorsalGrad.addColorStop(0, bodyBase);
    tailDorsalGrad.addColorStop(0.65, tone(bodyBase, -0.15));
    tailDorsalGrad.addColorStop(1, '#53a8be');

    ctx.beginPath();
    ctx.moveTo(t0x, t0y);
    ctx.bezierCurveTo(t1x - 4, t1y - 8, t2x - 4, t2y - 6, tipX, tipY);
    ctx.bezierCurveTo(t2x + 2, t2y + 8, t1x + 2, t1y + 12, t0x, -20);
    ctx.closePath();
    ctx.fillStyle = tailBellyGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(t0x, t0y);
    ctx.bezierCurveTo(t1x - 4, t1y - 8, t2x - 4, t2y - 6, tipX, tipY);
    ctx.bezierCurveTo(t2x - 2, t2y - 1, t1x - 2, t1y - 2, t0x, -27);
    ctx.closePath();
    ctx.fillStyle = tailDorsalGrad;
    ctx.fill();
    ctx.restore();

    // Màng vây đuôi cá sấu biển (Caudal Fin)
    ctx.save();
    ctx.globalAlpha *= 0.82;
    const caudalFin = `M ${t2x} ${t2y - 5} C ${t2x + 10} ${t2y - 14} ${tipX + 6} ${tipY - 8} ${tipX + 14} ${tipY} C ${tipX + 6} ${tipY + 10} ${t2x + 8} ${t2y + 12} ${t2x} ${t2y + 4} Z`;
    path(ctx, caudalFin, volume(ctx, tipX, tipY, 16, 14, cyanGlow, 0.4, -0.2), INK, 1.2);
    path(ctx, `M ${t2x + 3} ${t2y} L ${tipX + 12} ${tipY}`, null, cyanIce, 1.4);
    ctx.restore();

    // Dãy gai lưng đuôi sắc lẹm
    if (rage > 0.05) {
      ctx.save();
      ctx.shadowColor = cyanGlow;
      ctx.shadowBlur = 8 + 12 * rage;
    }
    const spinePts = [
      [32, -39, 4, 8.5, -0.2],
      [42, -36, 4.2, 9, -0.15],
      [52, -33, 3.8, 8, -0.1],
      [62, -29, 3.6, 7, -0.05],
      [71, -25, 3.0, 6, 0],
      [80, -21, 2.6, 5, 0.05],
    ];
    for (const [bx, by, w, h, ang] of spinePts) {
      const prog = (bx - 28) / 54;
      const swayOffset = tailWave1 * (1 - prog) + tailWave2 * prog;
      const sx = bx + swayOffset * 0.35, sy = by + swayOffset * 0.7;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang + 0.35);
      path(ctx, `M ${-w / 2} 0 L ${w * 0.2} ${-h} L ${w / 2} 0 Z`, volume(ctx, 0, -h / 2, w, h, cyanGlow, 0.5, -0.2), INK, 1.1);
      path(ctx, `M 0 0 L ${w * 0.2} ${-h}`, null, cyanIce, 0.9);
      ctx.restore();
    }
    if (rage > 0.05) ctx.restore();

    // Vảy chữ V ngọc mint trên thân đuôi
    ctx.save();
    ctx.globalAlpha *= 0.55;
    for (let i = 0; i < 4; i++) {
      const vx = 38 + i * 10, vy = -26 + i * 2.2;
      path(ctx, `M ${vx - 4} ${vy - 3} L ${vx + 2} ${vy} L ${vx - 4} ${vy + 3}`, null, tone(bellyDark, 0.2), 1.2);
    }
    ctx.restore();
    ctx.restore();

    // 6. CHI SAU PHÍA GẦN (Near Hindlimb)
    ctx.save();
    ctx.translate(22, -24);
    ctx.rotate(Math.sin((t || 0) * 2.8 + phase) * 0.12);
    path(ctx, 'M -8 -6 C 0 -10 14 -4 16 6 C 18 16 12 24 2 24 C -6 24 -14 14 -12 4 C -10 -2 -9 -5 -8 -6 Z', volume(ctx, 4, 6, 14, 16, bodyBase, 0.3, -0.3), INK, 1.5);
    for (let i = 0; i < 4; i++) {
      const cx = -6 + i * 5, cy = 23 + (i % 2) * 2;
      path(ctx, `M ${cx - 2} ${cy} L ${cx} ${cy + 7} L ${cx + 3} ${cy} Z`, clawColor, INK, 1.0);
    }
    ctx.restore();

    // 7. THÂN CHÍNH (Main Torso)
    const torsoD = 'M -28 -46 C -24 -60 -12 -70 8 -70 C 24 -70 34 -58 32 -36 C 30 -22 16 -16 -4 -16 C -20 -16 -32 -26 -28 -46 Z';
    path(ctx, torsoD, volume(ctx, 4, -46, 32, 28, bodyBase, 0.35, -0.3), INK, 2.0);
    path(ctx, 'M -18 -48 C -14 -60 -2 -64 8 -62', null, bodyLight, 3.2);
    path(ctx, 'M -10 -38 C -4 -48 6 -52 18 -48', null, bodyLight, 2.8);

    // Yếm bụng ngọc mint sáng
    const bellyD = 'M -32 -42 C -24 -38 -12 -28 -2 -22 C 8 -18 20 -18 28 -26 C 24 -16 10 -13 -4 -13 C -18 -13 -30 -22 -34 -32 C -36 -38 -34 -41 -32 -42 Z';
    path(ctx, bellyD, volume(ctx, -4, -22, 28, 14, bellyBase, 0.35, -0.2), INK, 1.6);

    ctx.save();
    ctx.globalAlpha *= 0.65;
    path(ctx, 'M -30 -38 C -22 -32 -12 -24 -4 -18 C 6 -15 16 -16 22 -22', null, bellyDark, 1.5);
    path(ctx, 'M -28 -34 C -20 -28 -10 -20 -2 -15 C 6 -13 14 -14 20 -19', null, bellyDark, 1.4);
    path(ctx, 'M -26 -30 C -18 -24 -8 -17 0 -13', null, bellyDark, 1.2);
    ctx.restore();

    // Dải răng cưa vảy gai ngà phân cách ngọc-tím
    ctx.save();
    const scutes = [
      [-24, -36, -0.4],
      [-16, -28, -0.2],
      [-8, -22, 0.0],
      [0, -18, 0.15],
      [8, -17, 0.3],
      [16, -18, 0.45],
      [23, -22, 0.6]
    ];
    for (const [sx, sy, rot] of scutes) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rot);
      path(ctx, 'M -3 0 L 0 -5 L 3 0 Z', ridgeScale, INK, 0.9);
      ctx.restore();
    }
    ctx.restore();

    // Vết nứt hoa văn tia sét cyan neon trên bả vai
    if (rage > 0.05) {
      ctx.save();
      ctx.shadowColor = cyanGlow;
      ctx.shadowBlur = 8 + 14 * rage;
    }
    ctx.save();
    ctx.translate(-8, -48);
    path(ctx, 'M -4 2 L 0 -4 L 4 -1 L 7 -8', null, cyanGlow, 2.2);
    path(ctx, 'M 0 -4 L -3 -9', null, cyanGlow, 1.8);
    path(ctx, 'M 0 -4 L 3 -1', null, cyanIce, 1.2);
    ctx.restore();
    if (rage > 0.05) ctx.restore();

    // 8. CHI TRƯỚC KHỔNG LỒ PHÍA GẦN (Near Forelimb)
    ctx.save();
    ctx.translate(-18, -36);
    ctx.rotate(flipperAngle);

    const armD = 'M -8 -8 C 6 -12 18 -4 20 6 C 22 16 16 28 6 34 C -4 38 -14 34 -18 24 C -22 14 -16 -2 -8 -8 Z';
    path(ctx, armD, volume(ctx, 2, 12, 18, 22, bodyBase, 0.4, -0.3), INK, 2.0);
    path(ctx, 'M -6 4 C 0 0 10 6 12 16', null, bodyLight, 3.0);
    path(ctx, 'M -10 16 C -6 12 4 16 6 26', null, bodyLight, 2.6);

    path(ctx, 'M -18 16 L -24 20 L -17 24 Z', ridgeScale, INK, 1.1);
    path(ctx, 'M -16 22 L -22 27 L -14 28 Z', ridgeScale, INK, 1.0);

    if (rage > 0.05) {
      ctx.save();
      ctx.shadowColor = cyanGlow;
      ctx.shadowBlur = 8 + 12 * rage;
    }
    path(ctx, 'M -4 14 L 0 8 L 4 12 L 8 6', null, cyanGlow, 2.2);
    path(ctx, 'M 0 8 L 4 12', null, cyanIce, 1.2);
    if (rage > 0.05) ctx.restore();

    const foreClaws = [
      [-12, 32, -0.3],
      [-5, 36, -0.1],
      [2, 36, 0.1],
      [9, 33, 0.35]
    ];
    for (const [cx, cy, crot] of foreClaws) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(crot);
      path(ctx, 'M -3 0 C -3 5 -1 10 2 12 C 1 7 3 4 3 0 Z', clawColor, INK, 1.2);
      path(ctx, 'M 0 0 L 1 10', null, clawShade, 0.8);
      ctx.restore();
    }
    ctx.restore();

    // 9. CỔ VÀ ĐẦU CÁ SẤU (Head, Snout, Eye & Articulated Jaws)
    ctx.save();
    ctx.translate(-26, -44);

    const neckD = 'M 4 -18 C -6 -18 -16 -12 -22 -4 C -20 12 -12 20 2 18 C 6 10 8 0 4 -18 Z';
    path(ctx, neckD, volume(ctx, -8, 0, 14, 18, bellyBase, 0.3, -0.2), INK, 1.8);
    for (let i = 0; i < 3; i++) {
      const gx = -6 + i * 5, gy = -18 + i * 2;
      path(ctx, `M ${gx - 2} ${gy} L ${gx} ${gy - 5} L ${gx + 2} ${gy} Z`, ridgeScale, INK, 0.8);
    }

    const snoutD = 'M -4 -16 C -12 -16 -24 -10 -30 -3 C -32 2 -26 6 -20 6 C -12 6 -4 2 2 -4 C 4 -12 2 -16 -4 -16 Z';
    path(ctx, snoutD, volume(ctx, -14, -6, 18, 12, bodyBase, 0.35, -0.3), INK, 1.8);
    path(ctx, 'M -18 -8 C -14 -12 -8 -12 -2 -8', null, bodyDark, 3.0);
    path(ctx, 'M -30 -2 C -24 3 -16 4 -8 4', null, bellyBase, 2.2);
    ellipse(ctx, -28, -4, 1.2, 1.0, bodyDark, null);

    for (let i = 0; i < 7; i++) {
      const tx = -27 + i * 3.6, ty = 2.5 - Math.sin(i * 0.45) * 1.5;
      path(ctx, `M ${tx - 1.4} ${ty} L ${tx} ${ty + 4.5} L ${tx + 1.4} ${ty} Z`, toothColor, INK, 0.7);
    }

    const eyeX = -14, eyeY = -7;
    ellipse(ctx, eyeX, eyeY, 4.5, 4.0, '#1a0c24', INK, 1.4);
    const irisColor = rage > 0.3 ? cyanGlow : '#ffe066';
    ellipse(ctx, eyeX, eyeY, 3.4, 3.0, irisColor, null);
    const lx = clamp(s.look_x || 0, -1, 1) * 1.4;
    const ly = clamp(s.look_y || 0, -1, 1) * 1.0;
    const pupilW = rage > 0.4 ? 1.0 : 1.6;
    ellipse(ctx, eyeX + lx, eyeY + ly, pupilW, 2.8, '#100615', null);
    ellipse(ctx, eyeX - 1.0, eyeY - 1.0, 0.9, 0.9, '#ffffff', null);
    path(ctx, `M ${eyeX - 4.8} ${eyeY - 2.8} Q ${eyeX} ${eyeY - 4.5} ${eyeX + 4.8} ${eyeY - 2.0}`, null, bodyDark, 2.4);

    // HÀM DƯỚI HÁ GẦM
    ctx.save();
    ctx.translate(-8, 2);
    const jawAngle = jaw * 0.52 + (rage > 0.4 ? 0.12 : 0);
    ctx.rotate(jawAngle);

    if (jaw > 0.05 || rage > 0.4) {
      const mouthInterior = 'M -2 0 L -18 -6 L -18 3 Z';
      path(ctx, mouthInterior, mouthFlesh, null);
      const tongueVibe = Math.sin((t || 0) * 22) * jaw * 1.5;
      ellipse(ctx, -10, 0 + tongueVibe, 5, 2.5, tongueColor, null);
    }

    const jawD = 'M 0 0 C -8 3 -16 3 -22 0 C -20 5 -14 7 -6 6 C -2 5 0 2 0 0 Z';
    path(ctx, jawD, volume(ctx, -10, 3, 12, 4, bellyBase, 0.35, -0.2), INK, 1.4);

    for (let i = 0; i < 6; i++) {
      const bx = -20 + i * 3.4, by = 0.5;
      path(ctx, `M ${bx - 1.2} ${by} L ${bx} ${by - 4.2} L ${bx + 1.2} ${by} Z`, toothColor, INK, 0.7);
    }
    ctx.restore();
    ctx.restore();

    // 10. HIỆU ỨNG RAGE
    if (rage > 0.08) {
      ctx.save();
      ctx.globalAlpha *= 0.4 + 0.5 * rage;
      for (let i = 0; i < 7; i++) {
        const sx = Math.sin(i * 1.9 + (t || 0) * 4) * 55 + 10;
        const sy = -55 + Math.cos(i * 2.3 + (t || 0) * 3.5) * 35;
        const sr = 1.8 + Math.sin(i * 3 + (t || 0) * 6) * 1.2;
        ellipse(ctx, sx, sy, sr, sr, cyanIce, null);
      }
      ctx.restore();
    }

    // 11. BỌT NƯỚC & WET
    if (s.wet > 0) {
      ctx.save();
      ctx.globalAlpha *= 0.65;
      for (let i = 0; i < 6; i++) {
        const wx = -35 + i * 18 + (i % 2) * 5;
        const wy = -18 + ((t || 0) * 14 + i * 7) % 24;
        ellipse(ctx, wx, wy, 1.3, 2.6, '#bfe8f2', null);
      }
      ctx.restore();
    }

    if (rise > 0.1) {
      ctx.save();
      ctx.globalAlpha *= 0.65 + 0.25 * Math.sin((t || 0) * 3.2);
      path(ctx, 'M -38 -6 Q -20 -12 0 -7 Q 20 -11 40 -8', null, 'rgba(255, 255, 255, 0.85)', 1.6);
      ellipse(ctx, -22, -6, 12, 3, 'rgba(255, 255, 255, 0.7)', null);
      ellipse(ctx, 12, -7, 16, 3.5, 'rgba(255, 255, 255, 0.7)', null);
      ctx.restore();
    }

    celHatch(ctx, s, [-56, -104, 156, 106], '#1c0d28', 18);
    ctx.restore();
  }

  // 1. Thủy quái Hải Long (Bioluminescent Serpent Drake)
  function drawSeaDrake(ctx, s, t) {
    const rise = clamp(s.rise !== undefined ? s.rise : 1);
    const rage = clamp(s.rage || 0);
    const jaw = clamp(s.jaw || 0);
    const phase = (hash(s.id) % 7);

    const bodyDark = s.style?.body || '#221936';
    const cyanColor = s.style?.accent || '#22d3ee';
    const fireGold = '#ffd60a';
    const fireOrange = '#ff7b00';
    const firePurple = '#c026d3';

    const bodyBob = Math.sin((t || 0) * 2.5 + phase) * 2.5;
    const bodyPitch = Math.sin((t || 0) * 2.5 + phase) * 0.05;
    const tailWhip = (s.tentacle || 0) * 24;
    const wave1 = Math.sin((t || 0) * 3.5 - 1.0 + phase) * 6 + tailWhip * 0.4;
    const wave2 = Math.sin((t || 0) * 3.5 - 2.0 + phase) * 12 + tailWhip * 0.8;
    const wave3 = Math.sin((t || 0) * 3.5 - 3.0 + phase) * 18 + tailWhip * 1.2;

    ctx.save();
    ctx.translate(-10, (1 - rise) * 58 + bodyBob);
    ctx.rotate(bodyPitch);

    // Water ripple
    if (rise > 0.05) {
      ctx.save(); ctx.globalAlpha *= 0.3;
      ellipse(ctx, 10, -6, 76, 7, 'rgba(34, 211, 238, 0.25)', null);
      ctx.restore();
    }

    // Horns on head (drawn behind)
    ctx.save();
    ctx.translate(-14, -62);
    path(ctx, 'M 0 0 C -6 -16 -16 -26 -28 -28 C -16 -20 -6 -10 0 0 Z', cyanColor, INK, 1.4);
    path(ctx, 'M 4 2 C 10 -10 20 -16 28 -18 C 18 -12 8 -6 4 2 Z', tone(cyanColor, -0.2), INK, 1.2);
    ctx.restore();

    // Serpentine Tail (continuous bezier from body x=16 to x=86)
    const t0x = 16, t0y = -36;
    const t1x = 42 + wave1 * 0.35, t1y = -32 + wave1 * 0.6;
    const t2x = 64 + wave2 * 0.45, t2y = -26 + wave2;
    const tipX = 86 + wave3 * 0.5, tipY = -20 + wave3;

    ctx.beginPath();
    ctx.moveTo(t0x, t0y);
    ctx.bezierCurveTo(t1x, t1y - 4, t2x, t2y - 3, tipX, tipY);
    ctx.bezierCurveTo(t2x + 2, t2y + 6, t1x + 2, t1y + 8, t0x, -22);
    ctx.closePath();
    ctx.fillStyle = volume(ctx, 50, -28, 42, 14, bodyDark, 0.3, -0.3);
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();

    // Dorsal spine finlets on tail
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      const sx = mix(t0x + 8, tipX - 4, u);
      const sy = mix(t0y, tipY, u) - 3;
      path(ctx, `M ${sx - 3} ${sy} L ${sx} ${sy - 7} L ${sx + 3} ${sy} Z`, cyanColor, INK, 0.9);
    }

    // Crescent scythe tail fin
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(wave3 * 0.03);
    const scytheD = 'M 0 0 C 8 -14 12 -28 6 -36 C 18 -24 22 -8 14 0 C 22 8 18 24 6 36 C 12 28 8 14 0 0 Z';
    path(ctx, scytheD, '#1a1424', INK, 1.4);
    path(ctx, 'M 5 -28 C 8 -16 8 16 5 28', null, cyanColor, 1.4);
    ctx.restore();

    // Serpentine Torso
    const torsoD = 'M -32 -42 C -24 -56 -8 -64 12 -64 C 26 -64 34 -52 30 -34 C 26 -18 10 -14 -6 -14 C -22 -14 -32 -26 -32 -42 Z';
    path(ctx, torsoD, volume(ctx, 0, -40, 32, 26, bodyDark, 0.3, -0.3), INK, 1.8);

    // Glowing Bioluminescent Fire/Magma Belly
    if (rage > 0.05) { ctx.save(); ctx.shadowColor = fireGold; ctx.shadowBlur = 12 + 16 * rage; }
    const flameBelly = 'M -28 -34 C -16 -28 -4 -20 8 -16 C 18 -14 26 -16 28 -20 C 22 -12 8 -10 -4 -10 C -18 -10 -26 -18 -28 -34 Z';
    path(ctx, flameBelly, fireOrange, INK, 1.2);
    path(ctx, 'M -24 -30 Q -12 -22 0 -16 Q 10 -14 20 -18', null, firePurple, 3.2);
    path(ctx, 'M -20 -28 Q -8 -20 4 -14', null, fireGold, 2.0);
    if (rage > 0.05) ctx.restore();

    // Slender Dragon Foreleg reaching down
    ctx.save();
    ctx.translate(-12, -26);
    ctx.rotate(Math.sin((t || 0) * 2.8 + phase) * 0.16);
    path(ctx, 'M -4 -6 C 4 -10 12 -4 14 6 C 16 16 8 28 0 34 C -8 36 -12 28 -10 16 Z', volume(ctx, 2, 10, 14, 22, cyanColor, 0.35, -0.25), INK, 1.6);
    for (let i = 0; i < 3; i++) {
      const cx = -6 + i * 5, cy = 32 + (i % 2) * 2;
      path(ctx, `M ${cx - 2} ${cy} L ${cx} ${cy + 8} L ${cx + 3} ${cy} Z`, fireGold, INK, 1.0);
    }
    ctx.restore();

    // Head and Crocodilian Snout
    ctx.save();
    ctx.translate(-26, -42);
    path(ctx, 'M 4 -16 C -6 -28 -14 -34 -26 -38 C -14 -30 -4 -24 4 -16 Z', firePurple, INK, 1.4);
    path(ctx, 'M 6 -14 C 0 -24 -6 -30 -16 -34', null, cyanColor, 1.2);

    const snoutD = 'M -2 -14 C -14 -16 -26 -10 -36 -2 C -38 4 -30 8 -20 6 C -10 6 -2 2 4 -4 Z';
    path(ctx, snoutD, volume(ctx, -16, -4, 20, 10, bodyDark, 0.35, -0.25), INK, 1.6);
    path(ctx, 'M -36 -2 C -38 2 -32 5 -26 4', null, cyanColor, 2.2);

    // Eye
    ellipse(ctx, -14, -6, 4.0, 3.2, '#180a22', INK, 1.2);
    ellipse(ctx, -14, -6, 2.8, 2.2, fireGold, null);
    ellipse(ctx, -14 + clamp(s.look_x || 0, -1, 1), -6 + clamp(s.look_y || 0, -1, 1), 1.3, 2.0, '#100615', null);

    // Upper Teeth
    for (let i = 0; i < 6; i++) {
      const tx = -32 + i * 4.4, ty = 3;
      path(ctx, `M ${tx - 1.2} ${ty} L ${tx} ${ty + 4} L ${tx + 1.2} ${ty} Z`, fireGold, INK, 0.7);
    }

    // Lower Jaw (opens with jaw slider)
    ctx.save();
    ctx.translate(-8, 3);
    ctx.rotate(jaw * 0.58 + (rage > 0.4 ? 0.14 : 0));
    if (jaw > 0.05 || rage > 0.4) {
      path(ctx, 'M -2 0 L -22 -4 L -20 3 Z', '#4a1532', null);
      ellipse(ctx, -12, 0, 5, 2.4, fireOrange, null);
    }
    path(ctx, 'M 0 0 C -12 3 -20 2 -26 -1 C -22 5 -14 6 -4 5 Z', cyanColor, INK, 1.2);
    for (let i = 0; i < 5; i++) {
      const bx = -24 + i * 4.2, by = 0;
      path(ctx, `M ${bx - 1} ${by} L ${bx} ${by - 3.8} L ${bx + 1} ${by} Z`, fireGold, INK, 0.6);
    }
    ctx.restore();
    ctx.restore();

    celHatch(ctx, s, [-56, -96, 154, 98], '#1c152a', 15);
    ctx.restore();
  }

  // 2. Thủy quái Cự Giáp (Armored Spiky Behemoth)
  function drawSeaBehemoth(ctx, s, t) {
    const rise = clamp(s.rise !== undefined ? s.rise : 1);
    const rage = clamp(s.rage || 0);
    const jaw = clamp(s.jaw || 0);
    const phase = (hash(s.id) % 7);

    const bodyDark = s.style?.body || '#2a1638';
    const spikeGold = '#fbbf24';
    const bellyLight = '#f1f5f9';
    const spineOrange = '#ea580c';

    const bodyBob = Math.sin((t || 0) * 2.0 + phase) * 2.0;
    const tailWhip = (s.tentacle || 0) * 20;
    const wave1 = Math.sin((t || 0) * 2.8 - 1.0 + phase) * 5 + tailWhip * 0.4;
    const wave2 = Math.sin((t || 0) * 2.8 - 2.0 + phase) * 9 + tailWhip * 0.8;

    ctx.save();
    ctx.translate(-8, (1 - rise) * 58 + bodyBob);

    // Continuous Armored Tail Stem
    const t0x = 24, t0y = -36;
    const t1x = 48 + wave1 * 0.35, t1y = -32 + wave1 * 0.6;
    const tipX = 72 + wave2 * 0.45, tipY = -24 + wave2;

    ctx.beginPath();
    ctx.moveTo(t0x, t0y);
    ctx.bezierCurveTo(t1x, t1y - 6, tipX - 6, tipY - 4, tipX, tipY);
    ctx.bezierCurveTo(tipX - 4, tipY + 8, t1x + 2, t1y + 10, t0x, -18);
    ctx.closePath();
    ctx.fillStyle = volume(ctx, 46, -26, 30, 20, bodyDark, 0.35, -0.3);
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();

    // Spikes along tail stem
    for (let i = 0; i < 3; i++) {
      const u = (i + 1) / 4;
      const sx = mix(t0x + 4, tipX - 4, u);
      const sy = mix(t0y, tipY, u) - 3;
      path(ctx, `M ${sx - 3} ${sy} L ${sx} ${sy - 8} L ${sx + 3} ${sy} Z`, spikeGold, INK, 1.0);
      path(ctx, `M ${sx - 2} ${sy + 12} L ${sx} ${sy + 18} L ${sx + 2} ${sy + 12} Z`, spikeGold, INK, 0.9);
    }

    // Spiky Crescent Fluke
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(wave2 * 0.04);
    const flukeD = 'M 0 -6 C 14 -18 24 -16 28 -6 C 20 2 20 8 28 18 C 20 20 12 16 0 6 Z';
    path(ctx, flukeD, volume(ctx, 14, 0, 16, 18, bodyDark, 0.35, -0.3), INK, 1.6);
    path(ctx, 'M 28 -6 L 36 -12 L 27 -1 Z', spikeGold, INK, 1.0);
    path(ctx, 'M 28 18 L 36 24 L 27 13 Z', spikeGold, INK, 1.0);
    ctx.restore();

    // Dorsal Carapace Spine and Fins
    path(ctx, 'M -8 -64 C -6 -80 2 -90 14 -94 C 18 -84 22 -74 26 -62 Z', volume(ctx, 8, -78, 18, 18, bodyDark, 0.3, -0.2), INK, 1.8);
    path(ctx, 'M 14 -94 L 17 -102 L 20 -90 Z', spikeGold, INK, 1.1);

    // Torso Carapace
    const torsoD = 'M -34 -44 C -28 -64 -6 -72 18 -70 C 38 -68 50 -52 46 -30 C 42 -12 22 -4 -6 -4 C -28 -4 -38 -22 -34 -44 Z';
    path(ctx, torsoD, volume(ctx, 6, -38, 44, 34, bodyDark, 0.35, -0.3), INK, 2.2);

    // Golden Armor Spikes on dorsal plates
    const spikes = [[-20, -60], [-6, -68], [8, -70], [22, -66], [36, -56]];
    for (const [sx, sy] of spikes) {
      path(ctx, `M ${sx - 4} ${sy} L ${sx} ${sy - 11} L ${sx + 4} ${sy} Z`, spikeGold, INK, 1.2);
    }

    // Puffy White/Grey Underbelly
    const bellyD = 'M -32 -34 C -18 -26 -2 -14 18 -14 C 32 -14 42 -22 40 -30 C 36 -10 18 -2 -4 -2 C -24 -2 -32 -16 -32 -34 Z';
    path(ctx, bellyD, volume(ctx, 4, -14, 38, 18, bellyLight, 0.2, -0.2), INK, 1.6);

    // Flank Spines (Orange/Yellow Thorn Spikes pointing down & back)
    for (let i = 0; i < 5; i++) {
      const gx = -16 + i * 11, gy = -12 + (i % 2) * 3;
      path(ctx, `M ${gx} ${gy} L ${gx + 4} ${gy + 10} L ${gx - 3} ${gy + 7} Z`, spineOrange, INK, 1.0);
      path(ctx, `M ${gx + 1} ${gy + 3} L ${gx + 3} ${gy + 8} L ${gx} ${gy + 6} Z`, spikeGold, null);
    }

    // Chunky Armored Pectoral Fin
    ctx.save();
    ctx.translate(-14, -24);
    path(ctx, 'M -6 -4 C 6 -8 18 0 18 12 C 18 22 8 30 0 30 C -8 30 -14 20 -12 8 Z', volume(ctx, 2, 8, 14, 18, bodyDark, 0.3, -0.3), INK, 1.8);
    path(ctx, 'M -2 26 L 2 35 L 6 26 Z', spikeGold, INK, 1.0);
    path(ctx, 'M 4 23 L 8 31 L 11 23 Z', spikeGold, INK, 0.9);
    ctx.restore();

    // Armored Head with Red Eyes and Saber Teeth
    ctx.save();
    ctx.translate(-26, -42);
    const snoutD = 'M 0 -14 C -14 -16 -26 -8 -30 0 C -30 8 -22 12 -10 10 C 0 8 6 0 6 -8 Z';
    path(ctx, snoutD, volume(ctx, -14, -4, 18, 12, bodyDark, 0.35, -0.3), INK, 1.8);

    // Red Menacing Eye
    ellipse(ctx, -14, -6, 4.4, 3.8, '#ef4444', INK, 1.2);
    ellipse(ctx, -14, -6, 1.4, 2.6, '#1a0000', null);
    if (rage > 0.05) {
      ctx.save(); ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10 + 14 * rage;
      ellipse(ctx, -14, -6, 2.0, 2.0, '#ff8888', null);
      ctx.restore();
    }

    // SABER TEETH (Long curved fangs pointing down past the jaw)
    path(ctx, 'M -22 -2 L -25 14 L -20 2 Z', '#ffffff', INK, 1.1);
    path(ctx, 'M -16 -1 L -18 10 L -14 1 Z', '#ffffff', INK, 0.9);

    // Lower Jaw
    ctx.save();
    ctx.translate(-6, 4);
    ctx.rotate(jaw * 0.52 + (rage > 0.4 ? 0.14 : 0));
    path(ctx, 'M 0 0 C -10 4 -18 3 -22 0 C -18 6 -10 8 -2 6 Z', bellyLight, INK, 1.4);
    for (let i = 0; i < 4; i++) {
      const bx = -18 + i * 4, by = 1;
      path(ctx, `M ${bx - 1} ${by} L ${bx} ${by - 4} L ${bx + 1} ${by} Z`, '#ffffff', INK, 0.6);
    }
    ctx.restore();
    ctx.restore();

    celHatch(ctx, s, [-56, -102, 150, 104], '#1f1028', 16);
    ctx.restore();
  }

  // 3. Thủy quái Kình Tinh Thể (Mystic Crystal Whale)
  function drawSeaCrystalWhale(ctx, s, t) {
    const rise = clamp(s.rise !== undefined ? s.rise : 1);
    const rage = clamp(s.rage || 0);
    const jaw = clamp(s.jaw || 0);
    const phase = (hash(s.id) % 7);

    const bodyBlue = s.style?.body || '#1d4ed8';
    const crystalCyan = '#67e8f9';
    const crystalPink = '#ec4899';
    const crystalWhite = '#ffffff';
    const bellyWhite = '#f8fafc';

    const bodyBob = Math.sin((t || 0) * 2.2 + phase) * 3.0;
    const flipperWave = Math.sin((t || 0) * 2.4 + phase) * 0.22;
    const tailWhip = (s.tentacle || 0) * 22;
    const wave1 = Math.sin((t || 0) * 3.0 - 1.0 + phase) * 6 + tailWhip * 0.4;
    const wave2 = Math.sin((t || 0) * 3.0 - 2.0 + phase) * 11 + tailWhip * 0.8;

    ctx.save();
    ctx.translate(-8, (1 - rise) * 58 + bodyBob);

    // Continuous Whale Tail Peduncle
    const t0x = 22, t0y = -34;
    const t1x = 46 + wave1 * 0.35, t1y = -30 + wave1 * 0.6;
    const tipX = 72 + wave2 * 0.45, tipY = -22 + wave2;

    ctx.beginPath();
    ctx.moveTo(t0x, t0y);
    ctx.bezierCurveTo(t1x, t1y - 5, tipX - 4, tipY - 4, tipX, tipY);
    ctx.bezierCurveTo(tipX - 2, tipY + 6, t1x + 2, t1y + 8, t0x, -18);
    ctx.closePath();
    ctx.fillStyle = volume(ctx, 46, -24, 32, 18, bodyBlue, 0.35, -0.3);
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();

    // Crystal Shards on Tail Peduncle
    path(ctx, `M ${tipX - 14} ${tipY - 5} L ${tipX - 10} ${tipY - 14} L ${tipX - 6} ${tipY - 4} Z`, crystalPink, INK, 0.9);
    path(ctx, `M ${tipX - 8} ${tipY - 4} L ${tipX - 4} ${tipY - 11} L ${tipX} ${tipY - 3} Z`, crystalCyan, INK, 0.9);

    // Crystal-Tipped Tail Fluke
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(wave2 * 0.04);
    const flukeD = 'M 0 -6 C 12 -18 24 -16 28 -4 C 20 2 20 8 28 16 C 24 24 12 20 0 6 Z';
    path(ctx, flukeD, volume(ctx, 14, 0, 16, 18, bodyBlue, 0.35, -0.3), INK, 1.6);
    path(ctx, 'M 26 -6 L 34 -12 L 26 -1 Z', crystalPink, INK, 0.9);
    path(ctx, 'M 26 14 L 34 20 L 26 8 Z', crystalCyan, INK, 0.9);
    path(ctx, 'M 20 -1 L 28 0 L 20 3 Z', crystalWhite, INK, 0.8);
    ctx.restore();

    // Magnificent Crystal Cluster on Back (Spines shooting up)
    if (rage > 0.05) { ctx.save(); ctx.shadowColor = crystalCyan; ctx.shadowBlur = 12 + 16 * rage; }
    // Back crystal spires (layered)
    path(ctx, 'M -8 -64 L -4 -94 L 4 -66 Z', crystalPink, INK, 1.3);
    path(ctx, 'M 2 -66 L 8 -104 L 14 -64 Z', crystalWhite, INK, 1.4);
    path(ctx, 'M 12 -64 L 18 -92 L 24 -60 Z', crystalCyan, INK, 1.2);
    path(ctx, 'M -18 -58 L -14 -82 L -8 -60 Z', crystalCyan, INK, 1.2);
    path(ctx, 'M 22 -60 L 28 -80 L 32 -54 Z', crystalPink, INK, 1.1);

    // Inner facet lines
    path(ctx, 'M 8 -104 L 6 -66', null, crystalCyan, 1.2);
    path(ctx, 'M -4 -94 L -3 -64', null, '#ffffff', 1.0);
    if (rage > 0.05) ctx.restore();

    // Torso (Whale streamlined body)
    const torsoD = 'M -34 -40 C -26 -60 -4 -68 18 -66 C 36 -64 48 -50 44 -28 C 40 -12 20 -8 -4 -8 C -26 -8 -36 -22 -34 -40 Z';
    path(ctx, torsoD, volume(ctx, 6, -36, 42, 32, bodyBlue, 0.35, -0.3), INK, 2.0);

    // Glowing Lateral Rune Filigree / Crystal Scales
    for (let i = 0; i < 4; i++) {
      const rx = -14 + i * 12, ry = -34 + (i % 2) * 2;
      path(ctx, `M ${rx - 3} ${ry} L ${rx} ${ry - 4} L ${rx + 3} ${ry} L ${rx} ${ry + 4} Z`, crystalCyan, INK, 0.8);
    }

    // Belly (White/Cyan whale underbelly)
    const bellyD = 'M -32 -32 C -18 -24 0 -14 20 -14 C 32 -14 40 -20 38 -26 C 32 -8 16 -4 -4 -4 C -20 -4 -28 -16 -32 -32 Z';
    path(ctx, bellyD, volume(ctx, 4, -12, 36, 16, bellyWhite, 0.2, -0.2), INK, 1.5);

    // Wing-like Pectoral Flipper (Cobalt to Pink to White)
    ctx.save();
    ctx.translate(-14, -24);
    ctx.rotate(flipperWave);
    const flipperD = 'M -6 -4 C 4 -12 20 -6 26 10 C 30 26 24 38 10 44 C -4 46 -12 34 -10 14 Z';
    path(ctx, flipperD, volume(ctx, 8, 18, 20, 26, crystalPink, 0.35, -0.25), INK, 1.8);
    path(ctx, 'M 4 40 L 10 50 L 16 38 Z', crystalWhite, INK, 1.0);
    path(ctx, 'M -2 18 C 6 22 14 28 12 38', null, crystalCyan, 1.4);
    ctx.restore();

    // Whale Head with Crest
    ctx.save();
    ctx.translate(-26, -38);
    path(ctx, 'M 2 -16 C -6 -24 -14 -28 -22 -30 C -12 -22 -4 -18 2 -16 Z', crystalPink, INK, 1.2);
    const headD = 'M 0 -14 C -14 -16 -28 -6 -32 2 C -30 10 -20 12 -8 10 C 0 8 6 0 6 -8 Z';
    path(ctx, headD, volume(ctx, -14, -4, 18, 12, bodyBlue, 0.35, -0.3), INK, 1.8);

    // Eye
    ellipse(ctx, -14, -4, 3.8, 3.2, '#1e1b4b', INK, 1.2);
    ellipse(ctx, -14, -4, 2.4, 2.0, crystalCyan, null);

    // Teeth & Mouth
    ctx.save();
    ctx.translate(-6, 4);
    ctx.rotate(jaw * 0.5 + (rage > 0.4 ? 0.12 : 0));
    path(ctx, 'M 0 0 C -12 4 -20 2 -24 -1 C -20 6 -12 8 -2 6 Z', bellyWhite, INK, 1.4);
    for (let i = 0; i < 6; i++) {
      const bx = -22 + i * 3.8, by = 0;
      path(ctx, `M ${bx - 1} ${by} L ${bx} ${by - 3.6} L ${bx + 1} ${by} Z`, crystalWhite, INK, 0.6);
    }
    ctx.restore();
    ctx.restore();

    celHatch(ctx, s, [-56, -98, 152, 100], '#122659', 15);
    ctx.restore();
  }

  // 4. Thủy quái Nham Thạch (Volcanic Magma Juggernaut)
  function drawSeaMagma(ctx, s, t) {
    const rise = clamp(s.rise !== undefined ? s.rise : 1);
    const rage = clamp(s.rage || 0);
    const jaw = clamp(s.jaw || 0);
    const phase = (hash(s.id) % 7);

    const bodyBasalt = s.style?.body || '#374151';
    const magmaRed = '#ff3b00';
    const magmaOrange = '#ff7a00';
    const magmaYellow = '#ffcc00';

    const bodyBob = Math.sin((t || 0) * 2.4 + phase) * 2.6;
    const armWave = Math.sin((t || 0) * 2.6 + phase) * 0.18;
    const tailWhip = (s.tentacle || 0) * 22;
    const wave1 = Math.sin((t || 0) * 3.0 - 1.0 + phase) * 6 + tailWhip * 0.4;
    const wave2 = Math.sin((t || 0) * 3.0 - 2.0 + phase) * 10 + tailWhip * 0.8;

    ctx.save();
    ctx.translate(-10, (1 - rise) * 58 + bodyBob);

    // Continuous Muscular Basalt Tail Stem
    const t0x = 22, t0y = -34;
    const t1x = 46 + wave1 * 0.35, t1y = -28 + wave1 * 0.6;
    const tipX = 70 + wave2 * 0.45, tipY = -22 + wave2;

    ctx.beginPath();
    ctx.moveTo(t0x, t0y);
    ctx.bezierCurveTo(t1x, t1y - 5, tipX - 4, tipY - 4, tipX, tipY);
    ctx.bezierCurveTo(tipX - 2, tipY + 6, t1x + 2, t1y + 8, t0x, -18);
    ctx.closePath();
    ctx.fillStyle = volume(ctx, 46, -24, 30, 18, bodyBasalt, 0.35, -0.3);
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();

    // Magma Caudal Fin (Glowing Molten Tips)
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(wave2 * 0.04);
    const finD = 'M 0 -6 C 12 -14 20 -10 26 -2 C 18 4 18 8 26 14 C 18 20 12 16 0 6 Z';
    path(ctx, finD, magmaOrange, INK, 1.5);
    path(ctx, 'M 4 -2 L 20 -1 L 8 4 Z', magmaRed, null);
    path(ctx, 'M 2 -1 L 12 -1 L 4 2 Z', magmaYellow, null);
    ctx.restore();

    // Basalt Dorsal Fin & Spines
    path(ctx, 'M -4 -64 C -2 -78 6 -88 14 -90 C 14 -78 18 -70 22 -62 Z', volume(ctx, 6, -76, 16, 16, bodyBasalt, 0.3, -0.3), INK, 1.8);
    for (let i = 0; i < 4; i++) {
      const bx = 16 + i * 10, by = -62 + i * 6;
      path(ctx, `M ${bx - 2} ${by} L ${bx} ${by - 5} L ${bx + 2} ${by} Z`, tone(bodyBasalt, -0.2), INK, 0.9);
    }

    // Heavy Muscular Torso
    const torsoD = 'M -32 -42 C -24 -60 -6 -68 14 -66 C 34 -64 46 -50 42 -28 C 38 -12 18 -8 -4 -8 C -24 -8 -34 -24 -32 -42 Z';
    path(ctx, torsoD, volume(ctx, 4, -38, 40, 32, bodyBasalt, 0.35, -0.3), INK, 2.0);

    // Glowing Lava Fissures / Molten Magma Belly
    if (rage > 0.05) { ctx.save(); ctx.shadowColor = magmaRed; ctx.shadowBlur = 12 + 16 * rage; }
    const magmaChest = 'M -28 -34 C -16 -26 0 -18 16 -18 C 26 -18 34 -24 32 -30 C 26 -12 12 -6 -6 -6 C -20 -6 -28 -18 -28 -34 Z';
    path(ctx, magmaChest, magmaOrange, INK, 1.4);
    path(ctx, 'M -22 -28 Q -10 -20 2 -14 Q 12 -12 22 -16', null, magmaRed, 3.4);
    path(ctx, 'M -18 -26 Q -6 -18 6 -12', null, magmaYellow, 2.0);
    if (rage > 0.05) ctx.restore();

    // Powerful Muscular Arm & Forearm (Gorilla/Reptile Bicep with glowing lava)
    ctx.save();
    ctx.translate(-14, -28);
    ctx.rotate(armWave);
    // Bicep/Deltoid
    path(ctx, 'M -8 -8 C 6 -12 18 -4 20 6 C 22 16 16 32 4 38 C -6 42 -14 34 -16 20 Z', volume(ctx, 4, 12, 18, 24, bodyBasalt, 0.35, -0.3), INK, 2.0);
    // Lava veins on forearm
    path(ctx, 'M -2 10 L 4 20 L -2 30', null, magmaOrange, 2.6);
    path(ctx, 'M 0 14 L 3 20 L 0 26', null, magmaYellow, 1.4);
    // Claws
    for (let i = 0; i < 3; i++) {
      const cx = -6 + i * 6, cy = 36 + (i % 2) * 2;
      path(ctx, `M ${cx - 2} ${cy} L ${cx} ${cy + 8} L ${cx + 3} ${cy} Z`, '#faf5d5', INK, 1.0);
    }
    ctx.restore();

    // Basalt Reptilian Head
    ctx.save();
    ctx.translate(-26, -40);
    const headD = 'M 0 -14 C -12 -16 -26 -8 -30 0 C -30 8 -22 12 -10 10 C 0 8 6 0 6 -8 Z';
    path(ctx, headD, volume(ctx, -14, -4, 18, 12, bodyBasalt, 0.35, -0.3), INK, 1.8);

    // Glowing Demonic Yellow Eye
    ellipse(ctx, -14, -5, 4.0, 3.4, magmaYellow, INK, 1.2);
    ellipse(ctx, -14, -5, 1.4, 2.2, '#180800', null);

    // Wicked Toothy Grin & Lower Jaw
    ctx.save();
    ctx.translate(-6, 4);
    ctx.rotate(jaw * 0.52 + (rage > 0.4 ? 0.12 : 0));
    path(ctx, 'M 0 0 C -10 3 -18 2 -22 -1 C -18 6 -10 8 -2 6 Z', magmaOrange, INK, 1.4);
    for (let i = 0; i < 6; i++) {
      const bx = -20 + i * 3.6, by = 0;
      path(ctx, `M ${bx - 1} ${by} L ${bx} ${by - 3.8} L ${bx + 1} ${by} Z`, '#ffffff', INK, 0.6);
    }
    ctx.restore();
    ctx.restore();

    celHatch(ctx, s, [-56, -96, 150, 98], '#1c1626', 15);
    ctx.restore();
  }

  // 5. Thủy quái Megalodon (Crystal Armored Shark)
  function drawSeaMegalodon(ctx, s, t) {
    const rise = clamp(s.rise !== undefined ? s.rise : 1);
    const rage = clamp(s.rage || 0);
    const jaw = clamp(s.jaw || 0);
    const phase = (hash(s.id) % 7);

    const bodyDark = s.style?.body || '#24123a';
    const cyanScale = '#06b6d4';
    const turquoiseScale = '#0891b2';
    const bellyCyan = '#22d3ee';

    const bodyBob = Math.sin((t || 0) * 2.8 + phase) * 2.2;
    const bodyPitch = Math.sin((t || 0) * 2.8 + phase) * 0.05;
    const tailWhip = (s.tentacle || 0) * 22;
    const wave1 = Math.sin((t || 0) * 3.8 - 1.0 + phase) * 6 + tailWhip * 0.4;
    const wave2 = Math.sin((t || 0) * 3.8 - 2.0 + phase) * 11 + tailWhip * 0.8;

    ctx.save();
    ctx.translate(-10, (1 - rise) * 58 + bodyBob);
    ctx.rotate(bodyPitch);

    // Continuous Shark Tail Stem
    const t0x = 22, t0y = -34;
    const t1x = 46 + wave1 * 0.35, t1y = -28 + wave1 * 0.6;
    const tipX = 72 + wave2 * 0.45, tipY = -22 + wave2;

    ctx.beginPath();
    ctx.moveTo(t0x, t0y);
    ctx.bezierCurveTo(t1x, t1y - 5, tipX - 4, tipY - 4, tipX, tipY);
    ctx.bezierCurveTo(tipX - 2, tipY + 6, t1x + 2, t1y + 8, t0x, -18);
    ctx.closePath();
    ctx.fillStyle = volume(ctx, 46, -24, 32, 18, bodyDark, 0.35, -0.3);
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();

    // Spiky Crescent Shark Caudal Fin
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(wave2 * 0.04);
    const tailFinD = 'M 0 -4 C 12 -18 22 -30 28 -36 C 20 -20 18 -6 20 0 C 18 6 20 20 28 36 C 22 30 12 18 0 4 Z';
    path(ctx, tailFinD, volume(ctx, 14, 0, 16, 28, bodyDark, 0.35, -0.3), INK, 1.8);
    path(ctx, 'M 24 -30 L 18 -4 L 24 30', null, cyanScale, 1.5);
    ctx.restore();

    // Towering Scythe / Greatsword Dorsal Fin
    if (rage > 0.05) { ctx.save(); ctx.shadowColor = cyanScale; ctx.shadowBlur = 12 + 16 * rage; }
    path(ctx, 'M -4 -64 C 2 -80 8 -96 14 -102 C 16 -88 20 -74 26 -62 Z', volume(ctx, 8, -82, 18, 22, bodyDark, 0.4, -0.3), INK, 2.0);
    path(ctx, 'M 12 -98 L 10 -72', null, cyanScale, 1.6);
    path(ctx, 'M 8 -90 L 4 -76', null, turquoiseScale, 1.2);
    if (rage > 0.05) ctx.restore();

    // Aerodynamic Shark Torso
    const torsoD = 'M -36 -42 C -26 -60 -8 -68 16 -66 C 36 -64 48 -50 44 -28 C 40 -12 20 -8 -4 -8 C -26 -8 -38 -24 -36 -42 Z';
    path(ctx, torsoD, volume(ctx, 4, -38, 42, 32, bodyDark, 0.35, -0.3), INK, 2.0);

    // Faceted Diamond / Chevron Armor Scales
    const scales = [[-12, -48], [4, -50], [18, -46], [-4, -36], [10, -34], [24, -30]];
    for (let i = 0; i < scales.length; i++) {
      const [sx, sy] = scales[i];
      const sc = i % 2 === 0 ? cyanScale : turquoiseScale;
      path(ctx, `M ${sx} ${sy - 5} L ${sx + 5} ${sy} L ${sx} ${sy + 5} L ${sx - 5} ${sy} Z`, sc, INK, 0.8);
    }

    // Glowing Cyan Gill Slits
    for (let i = 0; i < 4; i++) {
      const gx = -16 + i * 5, gy = -32;
      path(ctx, `M ${gx} ${gy - 8} Q ${gx + 2} ${gy} ${gx} ${gy + 8}`, null, bellyCyan, 1.4);
    }

    // Turquoise Lower Belly
    const bellyD = 'M -34 -32 C -18 -24 0 -14 20 -14 C 32 -14 40 -20 38 -26 C 32 -8 16 -4 -4 -4 C -22 -4 -30 -16 -34 -32 Z';
    path(ctx, bellyD, volume(ctx, 4, -12, 38, 16, bellyCyan, 0.2, -0.2), INK, 1.6);

    // Sweeping Blade Pectoral Fin
    ctx.save();
    ctx.translate(-14, -22);
    ctx.rotate(Math.sin((t || 0) * 2.8 + phase) * 0.15);
    const finBlade = 'M -8 -4 C 4 -10 16 -4 20 8 C 24 22 18 36 6 42 C -4 44 -12 32 -10 12 Z';
    path(ctx, finBlade, volume(ctx, 6, 16, 18, 24, bodyDark, 0.35, -0.3), INK, 1.8);
    path(ctx, 'M 4 10 L 10 32', null, cyanScale, 1.6);
    ctx.restore();

    // Shark Head with Hooked Snout
    ctx.save();
    ctx.translate(-28, -40);
    const snoutD = 'M 0 -14 C -14 -16 -28 -8 -34 0 C -34 6 -26 10 -14 8 C -2 6 6 -2 6 -8 Z';
    path(ctx, snoutD, volume(ctx, -16, -4, 20, 12, bodyDark, 0.35, -0.3), INK, 1.8);

    // Eye
    ellipse(ctx, -16, -5, 3.8, 3.2, '#180a26', INK, 1.2);
    ellipse(ctx, -16, -5, 2.2, 2.0, bellyCyan, null);

    // Saw Teeth Rows
    for (let i = 0; i < 7; i++) {
      const tx = -30 + i * 4.0, ty = 2.5;
      path(ctx, `M ${tx - 1.2} ${ty} L ${tx} ${ty + 4.2} L ${tx + 1.2} ${ty} Z`, '#ffffff', INK, 0.6);
    }

    // Hooked Cyan Lower Jaw
    ctx.save();
    ctx.translate(-6, 3);
    ctx.rotate(jaw * 0.55 + (rage > 0.4 ? 0.14 : 0));
    path(ctx, 'M 0 0 C -10 3 -18 2 -24 -1 C -20 6 -12 7 -4 5 Z', bellyCyan, INK, 1.4);
    for (let i = 0; i < 6; i++) {
      const bx = -22 + i * 3.8, by = 0;
      path(ctx, `M ${bx - 1.2} ${by} L ${bx} ${by - 4.0} L ${bx + 1.2} ${by} Z`, '#ffffff', INK, 0.6);
    }
    ctx.restore();
    ctx.restore();

    celHatch(ctx, s, [-58, -104, 156, 106], '#140c26', 16);
    ctx.restore();
  }

  const drawers = { sea_monster_leviathan: drawSeaLeviathan, sea_monster_drake: drawSeaDrake, sea_monster_behemoth: drawSeaBehemoth, sea_monster_crystal_whale: drawSeaCrystalWhale, sea_monster_magma: drawSeaMagma, sea_monster_megalodon: drawSeaMegalodon };
  const rigs = {};
  for (const [id, draw] of Object.entries(drawers)) rigs[id] = { group: 'monster', drawActor: (ctx, s, t) => draw(ctx, s, t) };
  register({ rigs });
})();
