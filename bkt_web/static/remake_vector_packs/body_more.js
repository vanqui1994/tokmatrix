// remake_vector_packs/body_more.js — Nhóm R12: Thế giới cơ thể bổ sung (body_more)
// 9 rigs: regenerating_liver, appendix_chibi, neuron_chibi, fingerprint, vaccine_training,
//         fever_thermometer, fracture_healing_bone, sleeping_brain, memory_cell_chibi
// 1 background: sleep_lab (ground_y: 810, 7 weathers, day/night, ZERO text)
// Lưu ý riêng C: gan/ruột thừa/dây thần kinh theo phong cách body_world (mặt chibi) và đúng vị trí giải phẫu
//                khi đặt trong body_xray; hoàn toàn không máu me; không vẽ chữ lên canvas.

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('RemakeVector core engine must be loaded before engine packs.');
  }

  const {
    path,
    line: kitLine,
    ellipse,
    taper,
    cylinder,
    tone,
    volume,
    limb,
    mitten,
    INK,
    TAU,
    clamp,
    smooth,
    mix,
    mixColor,
    hash,
    seeded,
    frameSpan
  } = RemakeVector.kit;

  function line(ctx, a, b, c, d, e, f) {
    if (Array.isArray(a)) return kitLine(ctx, a, b, c);
    return kitLine(ctx, [[a, b], [c, d]], e, f);
  }

  function drawPoly(ctx, pts, fill, stroke, width = 1) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  // Widescreen helpers
  function extRanges(x0, x1) {
    const out = [];
    if (x0 < 0) out.push([x0, 0]);
    if (x1 > 576) out.push([576, x1]);
    return out;
  }

  function tileExt(ext, start, step, origEnd, fn) {
    for (const [a, b] of ext) {
      if (a < 0) { for (let x = start - step; x > a - step; x -= step) fn(x); }
      else { let x = start; while (x <= origEnd) x += step; for (; x < b + step; x += step) fn(x); }
    }
  }

  function scatterExt(ext, step, key, fn) {
    for (const [a, b] of ext) {
      let i = 0;
      for (let x = a + step * 0.5; x < b - step * 0.3; i++) {
        const r = seeded(`${key}:${Math.round(x)}`);
        fn(x, r, i);
        x += step * (0.7 + r * 0.6);
      }
    }
  }

  // =========================================================================
  // 1. REGENERATING LIVER (Lá gan tái sinh Chibi)
  // Anatomical orientation: Right lobe on viewer's left (anatomical right side of human body)
  // center: [0, -38], face: [0, -42], top: [0, -78], root: [0, 0]
  // Bounding box: x in [-40, 40], y in [-78, 0]
  // =========================================================================
  function drawRegeneratingLiver(ctx, s, t) {
    const time = t || 0;
    const pulse = 1 + Math.sin(time * 3.0) * 0.04;

    ctx.save();
    ctx.translate(0, 0);

    // Chân chibi nhỏ đứng trên mặt đất
    ellipse(ctx, -10, -2, 5, 3, '#92400e', INK, 1.2);
    ellipse(ctx, 10, -2, 5, 3, '#92400e', INK, 1.2);

    // Thân lá gan giải phẫu (Anatomical liver body)
    // Thùy phải to hơn (ở bên trái màn hình x < 0), thùy trái thon dần (bên phải màn hình x > 0)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-34, -30);
    ctx.quadraticCurveTo(-38, -65, -16, -72); // Vòm thùy phải cao
    ctx.quadraticCurveTo(8, -70, 32, -54);    // Dốc xuống thùy trái
    ctx.quadraticCurveTo(36, -38, 28, -22);   // Đầu mút thùy trái
    ctx.quadraticCurveTo(12, -18, -4, -20);   // Khuyết túi mật (Gallbladder notch)
    ctx.quadraticCurveTo(-22, -16, -34, -30);
    ctx.closePath();

    const liverGrad = ctx.createLinearGradient(-30, -70, 20, -20);
    liverGrad.addColorStop(0, '#b45309');
    liverGrad.addColorStop(0.5, '#d97706');
    liverGrad.addColorStop(1, '#92400e');
    ctx.fillStyle = liverGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Vùng mô đang tái sinh kỳ diệu (Regenerating zone with blooming healthy cells)
    ctx.save();
    ctx.translate(22, -38);
    ctx.scale(pulse, pulse);

    // Vầng hào quang tế bào hồi phục
    const regrowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    regrowGrad.addColorStop(0, 'rgba(244, 114, 182, 0.7)');
    regrowGrad.addColorStop(0.6, 'rgba(251, 146, 60, 0.4)');
    regrowGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
    ctx.fillStyle = regrowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, TAU);
    ctx.fill();

    // Các cụm tế bào gan mới đang đâm chồi
    ellipse(ctx, -4, -3, 5, 4, '#fb7185', '#e11d48', 1.0);
    ellipse(ctx, 4, -2, 5, 4, '#f472b6', '#db2777', 1.0);
    ellipse(ctx, 0, 5, 5.5, 4.5, '#fb923c', '#ea580c', 1.0);

    // Ngôi sao lấp lánh phục hồi
    for (let st = 0; st < 3; st++) {
      const starAngle = time * 2.5 + st * (TAU / 3);
      const starDist = 10 + Math.sin(time * 3 + st) * 3;
      const sx = Math.cos(starAngle) * starDist;
      const sy = Math.sin(starAngle) * starDist;
      ellipse(ctx, sx, sy, 1.6, 1.6, '#fef08a', null);
    }
    ctx.restore();

    // Mắt Chibi to tròn long lanh kiên cường
    ctx.save();
    // Mắt trái
    ellipse(ctx, -12, -44, 4.0, 4.5, '#ffffff', INK, 1.2);
    ellipse(ctx, -11, -44, 2.5, 3.0, '#0f172a', null);
    ellipse(ctx, -12.5, -45.5, 1.2, 1.2, '#ffffff', null);
    // Mắt phải
    ellipse(ctx, 2, -44, 4.0, 4.5, '#ffffff', INK, 1.2);
    ellipse(ctx, 3, -44, 2.5, 3.0, '#0f172a', null);
    ellipse(ctx, 1.5, -45.5, 1.2, 1.2, '#ffffff', null);

    // Má hồng đào
    ellipse(ctx, -16, -38, 3.0, 1.8, 'rgba(244, 63, 94, 0.45)', null);
    ellipse(ctx, 6, -38, 3.0, 1.8, 'rgba(244, 63, 94, 0.45)', null);

    // Nụ cười tự tin
    ctx.beginPath();
    ctx.arc(-5, -38, 3.5, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // Tay mitten chibi chống nạnh vui tươi
    mitten(ctx, -32, -32, 4.2, '#b45309', -Math.PI * 0.4);
    mitten(ctx, 28, -28, 4.2, '#d97706', Math.PI * 0.4);

    ctx.restore();
    ctx.restore();
  }

  // =========================================================================
  // 2. APPENDIX CHIBI (Ruột thừa Chibi ngộ nghĩnh)
  // Anatomical position: Attached to lower right cecum (screen left in body_xray)
  // center: [0, -36], face: [0, -46], top: [0, -76], root: [0, 0]
  // Bounding box: x in [-32, 32], y in [-76, 0]
  // =========================================================================
  function drawAppendixChibi(ctx, s, t) {
    const time = t || 0;
    const wave = Math.sin(time * 2.5);

    ctx.save();
    ctx.translate(0, 0);

    // Chân đứng
    ellipse(ctx, -8, -2, 4.5, 2.8, '#ea580c', INK, 1.2);
    ellipse(ctx, 8, -2, 4.5, 2.8, '#ea580c', INK, 1.2);

    // Thân ruột thừa hình túi ngón tay uốn cong dễ thương (Vermiform tube pouch)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-16, -70);
    ctx.quadraticCurveTo(-24, -40, -18, -20);
    ctx.quadraticCurveTo(-14, -6, 0, -6);
    ctx.quadraticCurveTo(14, -6, 18, -20);
    ctx.quadraticCurveTo(22, -45, 14, -70);
    ctx.closePath();

    const appGrad = ctx.createLinearGradient(-15, -70, 15, -10);
    appGrad.addColorStop(0, '#fdba74');
    appGrad.addColorStop(0.5, '#fb923c');
    appGrad.addColorStop(1, '#f472b6');
    ctx.fillStyle = appGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Túi bảo vệ vi khuẩn có lợi (Good bacteria sanctuary pouch)
    ctx.beginPath();
    ctx.ellipse(0, -22, 11, 8, 0, 0, Math.PI);
    ctx.fillStyle = '#fbcfe8';
    ctx.fill();
    ctx.strokeStyle = '#db2777';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Chú vi khuẩn có lợi tí hon màu xanh ngọc ló đầu ra vẫy tay
    ctx.save();
    ctx.translate(0, -26 + wave * 0.8);
    ellipse(ctx, 0, 0, 5, 4.5, '#4ade80', '#15803d', 1.0);
    // Mắt tròn xoe chú vi khuẩn
    ellipse(ctx, -1.8, -1, 0.9, 0.9, '#0f172a', null);
    ellipse(ctx, 1.8, -1, 0.9, 0.9, '#0f172a', null);
    // Nụ cười tí hon
    ctx.beginPath();
    ctx.arc(0, 1, 1.2, 0, Math.PI);
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    // Mũ hướng đạo sinh / bảo hộ nhỏ trên đầu (Guardian cap with leaf emblem)
    ctx.save();
    ctx.translate(0, -68);
    drawPoly(ctx, [[-16, 0], [-10, -8], [10, -8], [16, 0]], '#16a34a', INK, 1.4);
    // Huy hiệu lá xanh
    ellipse(ctx, 0, -4, 2.5, 2.0, '#facc15', null);
    ctx.restore();

    // Khuôn mặt Chibi ruột thừa
    // Mắt cười tinh nghịch
    ellipse(ctx, -7, -46, 3.2, 3.6, '#ffffff', INK, 1.2);
    ellipse(ctx, -6.5, -46, 1.8, 2.2, '#0f172a', null);
    ellipse(ctx, -7.5, -47, 0.9, 0.9, '#ffffff', null);

    ellipse(ctx, 7, -46, 3.2, 3.6, '#ffffff', INK, 1.2);
    ellipse(ctx, 6.5, -46, 1.8, 2.2, '#0f172a', null);
    ellipse(ctx, 5.5, -47, 0.9, 0.9, '#ffffff', null);

    // Má hồng
    ellipse(ctx, -11, -41, 2.2, 1.4, 'rgba(244, 63, 94, 0.4)', null);
    ellipse(ctx, 11, -41, 2.2, 1.4, 'rgba(244, 63, 94, 0.4)', null);

    // Miệng cười mở rộng
    ctx.beginPath();
    ctx.arc(0, -41, 3.0, 0, Math.PI);
    ctx.fillStyle = '#be123c';
    ctx.fill();
    ctx.strokeStyle = '#881337';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // Tay mitten vẫy chào
    mitten(ctx, -20, -38, 3.6, '#fb923c', -Math.PI * 0.3);
    mitten(ctx, 20, -42 + wave * 2, 3.6, '#fb923c', Math.PI * 0.2);

    ctx.restore();
    ctx.restore();
  }

  // =========================================================================
  // 3. NEURON CHIBI (Tế bào thần kinh Neuron Chibi)
  // Anatomical orientation: Neural networks branching along spine and brain
  // center: [0, -48], face: [0, -56], top: [0, -90], root: [0, 0]
  // Bounding box: x in [-42, 42], y in [-90, 0]
  // =========================================================================
  function drawNeuronChibi(ctx, s, t) {
    const time = t || 0;
    const sparkPulse = (time * 3.5) % 1.0;

    ctx.save();
    ctx.translate(0, 0);

    // 1. Sợi trục thần kinh (Axon with Myelin Sheath segments)
    // Các đốt bao myelin màu xanh thiên thanh bảo vệ dẫn truyền
    const myelinNodes = [-36, -26, -16];
    for (let m = 0; m < myelinNodes.length; m++) {
      const my = myelinNodes[m];
      ctx.beginPath();
      ctx.roundRect(-7, my - 4, 14, 8, 3.5);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    // Trục axon trung tâm xuyên suốt
    line(ctx, 0, -42, 0, -10, '#0284c7', 2.8);

    // 2. Tận cùng sợi trục & Cúc synapse tỏa ra đáy (Axon Terminals & Synaptic Boutons)
    ctx.save();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.0;
    line(ctx, 0, -10, -16, -2);
    line(ctx, 0, -10, 0, -2);
    line(ctx, 0, -10, 16, -2);

    // Cúc synap phát ra tia sáng điện thần kinh
    for (const sx of [-16, 0, 16]) {
      ellipse(ctx, sx, -2, 3.2, 3.2, '#facc15', '#ca8a04', 1.0);
      // Tia chớp điện vàng
      line(ctx, sx, -2, sx + Math.sin(time * 5 + sx) * 3, -6, '#fef08a', 1.2);
    }
    ctx.restore();

    // Tia xung điện vàng đang chạy dọc thân axon
    const pulseY = -42 + sparkPulse * 34;
    ellipse(ctx, 0, pulseY, 3.5, 3.5, '#fef08a', '#eab308', 1.0);

    // 3. Thân nơron hình sao tỏa nhánh sợi nhánh (Soma with Dendrites)
    ctx.save();
    ctx.translate(0, -58);

    // Các nhánh sợi nhánh (Dendrites) tỏa ra như mái tóc tinh nghịch
    const dendrites = [
      [-32, -18], [-36, 0], [-26, 16],
      [32, -18], [36, 0], [26, 16],
      [-18, -26], [0, -30], [18, -26]
    ];
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.8;
    for (const [dx, dy] of dendrites) {
      line(ctx, 0, 0, dx, dy);
      ellipse(ctx, dx, dy, 2.5, 2.5, '#38bdf8', '#0284c7', 1.0);
    }

    // Thân tế bào chính tròn phúng phính (Soma cell body)
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, TAU);
    const somaGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, 20);
    somaGrad.addColorStop(0, '#e0f2fe');
    somaGrad.addColorStop(0.6, '#7dd3fc');
    somaGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = somaGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Mắt Chibi thông minh lanh lợi
    ellipse(ctx, -6, -2, 3.5, 4.0, '#ffffff', INK, 1.2);
    ellipse(ctx, -5.5, -2, 2.0, 2.5, '#0f172a', null);
    ellipse(ctx, -6.5, -3, 1.0, 1.0, '#ffffff', null);

    ellipse(ctx, 6, -2, 3.5, 4.0, '#ffffff', INK, 1.2);
    ellipse(ctx, 6.5, -2, 2.0, 2.5, '#0f172a', null);
    ellipse(ctx, 5.5, -3, 1.0, 1.0, '#ffffff', null);

    // Má hồng phấn
    ellipse(ctx, -10, 4, 2.4, 1.5, 'rgba(244, 63, 94, 0.4)', null);
    ellipse(ctx, 10, 4, 2.4, 1.5, 'rgba(244, 63, 94, 0.4)', null);

    // Miệng cười hoạt bát
    ctx.beginPath();
    ctx.arc(0, 3, 3.0, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();

    ctx.restore();
  }

  // =========================================================================
  // 4. FINGERPRINT (Vân tay quét sinh trắc học)
  // center: [0, -46], top: [0, -88], core: [0, -46], root: [0, 0]
  // Bounding box: x in [-40, 40], y in [-88, 0]
  // =========================================================================
  function drawFingerprint(ctx, s, t) {
    const time = t || 0;
    const scanLine = (time * 1.6) % 1.0;

    ctx.save();
    ctx.translate(0, 0);

    // 1. Đế máy quét sinh trắc học (Forensic scanner base stand)
    drawPoly(ctx, [
      [-36, 0], [-26, -10], [26, -10], [36, 0]
    ], '#1e293b', INK, 2.0);
    line(ctx, -8, -10, -8, -16, '#475569', 3.5);
    line(ctx, 8, -10, 8, -16, '#475569', 3.5);

    // 2. Khung thấu kính quét hình bầu dục (Illuminated Scanner Glass Ring)
    ctx.save();
    ctx.translate(0, -50);

    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 36, 0, 0, TAU);
    const glassGrad = ctx.createLinearGradient(0, -36, 0, 36);
    glassGrad.addColorStop(0, '#0c4a6e');
    glassGrad.addColorStop(0.5, '#082f49');
    glassGrad.addColorStop(1, '#020617');
    ctx.fillStyle = glassGrad;
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // 3. Đường vân tay xoắn ốc nghệ thuật (Authentic Dermatoglyphic Ridges)
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;

    // Vòng cung ngoài
    ctx.beginPath();
    ctx.ellipse(0, 4, 24, 27, 0, Math.PI * 0.9, Math.PI * 2.1);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 3, 19, 22, 0, Math.PI * 0.85, Math.PI * 2.15);
    ctx.stroke();

    // Vòng xoáy lõi (Core whorl)
    ctx.beginPath();
    ctx.ellipse(0, 2, 14, 16, 0, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 1, 9, 11, 0, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 6, 0, 0, TAU);
    ctx.stroke();

    // Điểm rẽ nhánh hoa văn (Bifurcations)
    line(ctx, -14, -8, -9, 2, '#38bdf8', 1.8);
    line(ctx, 14, -8, 9, 2, '#38bdf8', 1.8);
    ctx.restore();

    // 4. Tia laser quét màu lục ngọc (Scanning laser line)
    const laserY = -30 + scanLine * 60;
    ctx.save();
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.85)';
    ctx.lineWidth = 2.2;
    line(ctx, -26, laserY, 26, laserY);
    // Vệt hào quang quét
    ctx.fillStyle = 'rgba(74, 222, 128, 0.15)';
    ctx.fillRect(-26, laserY - 4, 52, 8);
    ctx.restore();

    ctx.restore();
    ctx.restore();
  }

  // =========================================================================
  // 5. VACCINE TRAINING (Đội đôi Vắc-xin & Kháng thể luyện tập)
  // center: [0, -42], top: [0, -84], vial: [-22, -42], antibody: [24, -40]
  // Bounding box: x in [-46, 46], y in [-84, 0]
  // =========================================================================
  function drawVaccineTraining(ctx, s, t) {
    const time = t || 0;
    const jump = Math.sin(time * 3.0) * 2.0;

    ctx.save();
    ctx.translate(0, 0);

    // 1. Lọ vắc-xin Chibi thân thiện (Friendly Vaccine Vial)
    ctx.save();
    ctx.translate(-20, 0);

    // Chân đứng
    ellipse(ctx, -6, -2, 4, 2.5, '#0284c7', INK, 1.0);
    ellipse(ctx, 6, -2, 4, 2.5, '#0284c7', INK, 1.0);

    // Thân lọ thủy tinh y tế
    ctx.beginPath();
    ctx.roundRect(-14, -58, 28, 54, 6);
    const vialGrad = ctx.createLinearGradient(-14, 0, 14, 0);
    vialGrad.addColorStop(0, '#e0f2fe');
    vialGrad.addColorStop(0.5, '#bae6fd');
    vialGrad.addColorStop(1, '#7dd3fc');
    ctx.fillStyle = vialGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Mực chất lỏng vắc-xin bên trong
    ctx.beginPath();
    ctx.roundRect(-12, -40, 24, 34, 4);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.fill();

    // Vạch chia độ y tế (Graduation tick marks)
    for (let vy = -36; vy <= -14; vy += 7) {
      line(ctx, -12, vy, -6, vy, '#0284c7', 1.4);
    }

    // Nút cao su niêm phong & cổ lọ
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-8, -66, 16, 8);
    ctx.strokeRect(-8, -66, 16, 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-10, -70, 20, 4);
    ctx.strokeRect(-10, -70, 20, 4);

    // Mặt Chibi quyết tâm trên thân lọ
    ellipse(ctx, -4, -32, 2.6, 3.2, '#0f172a', null);
    ellipse(ctx, -5, -33, 1.0, 1.0, '#ffffff', null);
    ellipse(ctx, 4, -32, 2.6, 3.2, '#0f172a', null);
    ellipse(ctx, 3, -33, 1.0, 1.0, '#ffffff', null);
    ellipse(ctx, -7, -27, 2.0, 1.2, 'rgba(244, 63, 94, 0.4)', null);
    ellipse(ctx, 7, -27, 2.0, 1.2, 'rgba(244, 63, 94, 0.4)', null);
    // Nụ cười mỉm tự tin
    ctx.beginPath();
    ctx.arc(0, -28, 2.4, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();

    // 2. Chú kháng thể Chibi hình chữ Y dũng cảm (Y-shaped Antibody Champion)
    ctx.save();
    ctx.translate(20, jump);

    // Chân đứng
    ellipse(ctx, -4, -2, 3.5, 2.2, '#ca8a04', INK, 1.0);
    ellipse(ctx, 4, -2, 3.5, 2.2, '#ca8a04', INK, 1.0);

    // Thân chữ Y kháng thể
    ctx.save();
    // Thân trụ dưới (Fc region)
    taper(ctx, 0, -28, 0, -4, 5, 5, '#facc15', INK, 1.8);
    // Hai nhánh trên (Fab arms) vươn lên sẵn sàng bảo vệ
    taper(ctx, -4, -28, -14, -50, 4.5, 3.8, '#facc15', INK, 1.8);
    taper(ctx, 4, -28, 14, -50, 4.5, 3.8, '#facc15', INK, 1.8);

    // Băng đô võ sĩ luyện tập màu đỏ trên trán
    line(ctx, -8, -26, 8, -26, '#ef4444', 2.8);
    line(ctx, 8, -26, 12, -22, '#ef4444', 2.0);

    // Khiên bảo vệ nhỏ có hình ngôi sao
    ctx.beginPath();
    ctx.arc(16, -34, 7, 0, TAU);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ellipse(ctx, 16, -34, 3, 3, '#fef08a', null);

    // Mặt Chibi hăng hái
    ellipse(ctx, -2, -18, 2.0, 2.6, '#0f172a', null);
    ellipse(ctx, 2, -18, 2.0, 2.6, '#0f172a', null);
    ellipse(ctx, -2.5, -19, 0.8, 0.8, '#ffffff', null);
    ellipse(ctx, 1.5, -19, 0.8, 0.8, '#ffffff', null);
    ctx.beginPath();
    ctx.arc(0, -14, 2.0, 0, Math.PI);
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 1.0;
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    ctx.restore();
  }

  // =========================================================================
  // 6. FEVER THERMOMETER (Nhiệt kế sốt Chibi)
  // center: [0, -45], top: [0, -90], bulb: [0, -18], root: [0, 0]
  // Bounding box: x in [-32, 32], y in [-90, 0]
  // =========================================================================
  function drawFeverThermometer(ctx, s, t) {
    const time = t || 0;
    const wobble = Math.sin(time * 3.5) * 1.5;

    ctx.save();
    ctx.translate(0, 0);

    // 1. Thân nhiệt kế thủy tinh thẳng đứng (Rounded Glass Stem)
    ctx.beginPath();
    ctx.roundRect(-7, -84, 14, 62, 7);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Cột thủy ngân đỏ dâng cao (High temperature mercury column)
    ctx.beginPath();
    ctx.roundRect(-3, -76, 6, 54, 3);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // Vạch đo nhiệt độ rõ nét (Tick marks - ZERO text/numbers)
    for (let ty = -74; ty <= -32; ty += 6) {
      line(ctx, 7, ty, 3, ty, '#475569', 1.4);
    }
    // Vạch cảnh báo mức sốt cao
    line(ctx, 8, -68, 2, -68, '#dc2626', 2.0);

    // 2. Bầu thủy ngân tròn phía dưới (Mercury bulb face)
    ctx.save();
    ctx.translate(0, -16);

    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, TAU);
    const bulbGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 18);
    bulbGrad.addColorStop(0, '#f87171');
    bulbGrad.addColorStop(0.6, '#ef4444');
    bulbGrad.addColorStop(1, '#b91c1c');
    ctx.fillStyle = bulbGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Mặt Chibi sốt má ửng đỏ, mắt xoắn ốc đáng yêu
    // Mắt xoắn ốc hoặc nhắm tịt vì sốt nhẹ
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    // Mắt trái
    ctx.beginPath();
    ctx.arc(-6, -2, 3, 0, TAU * 0.8);
    ctx.stroke();
    // Mắt phải
    ctx.beginPath();
    ctx.arc(6, -2, 3, 0, TAU * 0.8);
    ctx.stroke();

    // Má ửng sốt đỏ hồng
    ellipse(ctx, -10, 4, 3.2, 2.0, '#fecdd3', null);
    ellipse(ctx, 10, 4, 3.2, 2.0, '#fecdd3', null);

    // Miệng ngậm thở nhẹ
    ctx.beginPath();
    ctx.arc(0, 4, 2.2, Math.PI, 0);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // 3. Túi chườm đá hạ sốt trên đỉnh đầu (Ice pack tied on top)
    ctx.save();
    ctx.translate(0 + wobble * 0.3, -86);
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 6, 0, 0, TAU);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Nút thắt ruy băng túi chườm
    ellipse(ctx, 0, -6, 3, 3, '#f59e0b', null);
    ctx.restore();

    ctx.restore();
  }

  // =========================================================================
  // 7. FRACTURE HEALING BONE (Khúc xương gãy đang tự chữa lành)
  // center: [0, -43], top: [0, -86], cast: [0, -35], root: [0, 0]
  // Bounding box: x in [-38, 38], y in [-86, 0]
  // =========================================================================
  function drawFractureHealingBone(ctx, s, t) {
    const time = t || 0;
    const healPulse = Math.sin(time * 3.0);

    ctx.save();
    ctx.translate(0, 0);

    // Chân đứng
    ellipse(ctx, -8, -2, 5, 2.8, '#cbd5e1', INK, 1.2);
    ellipse(ctx, 8, -2, 5, 2.8, '#cbd5e1', INK, 1.2);

    // 1. Thân xương ống (Bone Shaft with rounded epiphyses)
    ctx.save();
    // Đầu trên lồi cầu (Epiphysis top)
    ellipse(ctx, -10, -78, 8, 7, '#f8fafc', INK, 1.8);
    ellipse(ctx, 10, -78, 8, 7, '#f8fafc', INK, 1.8);
    // Đầu dưới lồi cầu (Epiphysis bottom)
    ellipse(ctx, -8, -12, 7, 6, '#f8fafc', INK, 1.8);
    ellipse(ctx, 8, -12, 7, 6, '#f8fafc', INK, 1.8);

    // Trục giữa xương
    taper(ctx, 0, -74, 0, -12, 8, 8, '#f8fafc', INK, 2.0);
    ctx.restore();

    // 2. Vết nứt xương đang nối canxi vàng lấp lánh (Healing Callus & Calcium Stars)
    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-7, -42);
    ctx.lineTo(-2, -45);
    ctx.lineTo(3, -41);
    ctx.lineTo(7, -44);
    ctx.stroke();

    // Ngôi sao canxi hàn gắn
    for (let c = 0; c < 3; c++) {
      const cx = -6 + c * 6 + healPulse * 1.5;
      const cy = -43 + Math.sin(time * 3 + c) * 3;
      ellipse(ctx, cx, cy, 2.0, 2.0, '#fef08a', null);
    }
    ctx.restore();

    // 3. Bột bó thạch cao y tế bảo vệ (Protective Plaster Cast / Bandage)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-12, -50, 24, 18, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Nếp gấp băng thạch cao
    line(ctx, -12, -44, 12, -44, '#cbd5e1', 1.4);
    line(ctx, -12, -38, 12, -38, '#cbd5e1', 1.4);

    // Hình dán trái tim động viên trên bột bó (Zero text)
    ctx.save();
    ctx.translate(0, -41);
    path(ctx, 'M 0 3.5 Q -4 -0.5 -2.8 -2.8 Q -1.2 -4 0 -2 Q 1.2 -4 2.8 -2.8 Q 4 -0.5 0 3.5 Z', '#f43f5e', '#be123c', 0.8);
    ctx.restore();

    ctx.restore();

    // 4. Mặt Chibi dũng cảm, nháy mắt tươi cười ở đầu xương trên
    ctx.save();
    // Mắt trái (mở to lấp lánh)
    ellipse(ctx, -6, -64, 3.2, 3.6, '#ffffff', INK, 1.2);
    ellipse(ctx, -5.5, -64, 1.8, 2.2, '#0f172a', null);
    ellipse(ctx, -6.5, -65, 0.8, 0.8, '#ffffff', null);
    // Mắt phải (nháy mắt tự tin)
    ctx.beginPath();
    ctx.arc(6, -64, 3.0, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Nụ cười
    ctx.beginPath();
    ctx.arc(0, -58, 2.8, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Tay giơ ngón cái (Thumbs up mitten)
    mitten(ctx, 16, -56, 3.8, '#f8fafc', Math.PI * 0.15);
    ctx.restore();

    ctx.restore();
  }

  // =========================================================================
  // 8. SLEEPING BRAIN (Bộ não đang ngủ say Chibi)
  // center: [0, -42], top: [0, -86], face: [0, -42], root: [0, 0]
  // Bounding box: x in [-42, 42], y in [-86, 0]
  // =========================================================================
  function drawSleepingBrain(ctx, s, t) {
    const time = t || 0;
    const breathe = Math.sin(time * 2.0) * 1.5;

    ctx.save();
    ctx.translate(0, 0);

    // 1. Gối ngủ bồng bềnh êm ái hình đám mây (Cloud Sleeping Pillow)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -6, 34, 10, 0, 0, TAU);
    ctx.fillStyle = '#e0e7ff';
    ctx.fill();
    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // Nếp lõm gối
    line(ctx, -14, -6, 14, -6, '#c7d2fe', 1.4);
    ctx.restore();

    // 2. Thân não bộ Chibi uốn lượn (Pink Cerebrum with Gyri)
    ctx.save();
    ctx.translate(0, -38 + breathe * 0.4);

    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 22, 0, 0, TAU);
    const brainGrad = ctx.createRadialGradient(-6, -6, 2, 0, 0, 30);
    brainGrad.addColorStop(0, '#fbcfe8');
    brainGrad.addColorStop(0.6, '#f472b6');
    brainGrad.addColorStop(1, '#db2777');
    ctx.fillStyle = brainGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Các nếp nhăn hồi não (Gyri convolutions)
    ctx.save();
    ctx.strokeStyle = '#be123c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    // Bán cầu trái
    ctx.arc(-14, -6, 7, 0.4, Math.PI * 1.2);
    ctx.arc(-12, 6, 6, -0.4, Math.PI * 0.8);
    // Bán cầu phải
    ctx.arc(14, -6, 7, -0.2, Math.PI * 0.8);
    ctx.arc(12, 6, 6, 0.4, Math.PI * 1.4);
    // Rãnh giữa
    line(ctx, 0, -20, 0, -6);
    ctx.stroke();
    ctx.restore();

    // Mắt nhắm ngủ ngon lành (Sleeping curved closed eyes)
    ctx.save();
    ctx.strokeStyle = '#831843';
    ctx.lineWidth = 2.0;
    // Mắt trái
    ctx.beginPath();
    ctx.arc(-8, 0, 3.5, 0.1, Math.PI - 0.1);
    ctx.stroke();
    // Mắt phải
    ctx.beginPath();
    ctx.arc(8, 0, 3.5, 0.1, Math.PI - 0.1);
    ctx.stroke();

    // Má ửng hồng ngủ ngon
    ellipse(ctx, -14, 5, 3.0, 1.8, 'rgba(251, 113, 133, 0.55)', null);
    ellipse(ctx, 14, 5, 3.0, 1.8, 'rgba(251, 113, 133, 0.55)', null);

    // Nụ cười mỉm ngủ mơ ngọt ngào
    ctx.beginPath();
    ctx.arc(0, 5, 3.0, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // 3. Mũ ngủ đêm có quả bông tròn (Nightcap with pompom)
    ctx.save();
    ctx.translate(12, -56 + breathe * 0.4);
    ctx.rotate(0.25);
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.quadraticCurveTo(-6, -26, 12, -24);
    ctx.lineTo(16, -10);
    ctx.quadraticCurveTo(0, -6, -16, 0);
    ctx.closePath();
    ctx.fillStyle = '#6366f1';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Vành mũ kẻ sọc
    line(ctx, -14, -4, 14, -14, '#ffffff', 2.5);

    // Quả bông tròn mềm
    ellipse(ctx, 14, -24, 4.5, 4.5, '#ffffff', '#c7d2fe', 1.0);
    ctx.restore();

    // 4. Bong bóng giấc mơ bay lên (Dream bubbles - ZERO text)
    for (let b = 0; b < 3; b++) {
      const bubbleTime = (time * 1.2 + b * 0.8) % 2.5;
      const bx = -16 - b * 6 + Math.sin(time * 2 + b) * 3;
      const by = -62 - bubbleTime * 8;
      const br = 2.5 + b * 1.2;
      ellipse(ctx, bx, by, br, br, 'rgba(199, 210, 254, 0.5)', '#a5b4fc', 0.8);
    }

    ctx.restore();
  }

  // =========================================================================
  // 9. MEMORY CELL CHIBI (Tế bào nhớ miễn dịch Chibi)
  // center: [0, -40], top: [0, -82], face: [0, -46], root: [0, 0]
  // Bounding box: x in [-38, 38], y in [-82, 0]
  // =========================================================================
  function drawMemoryCellChibi(ctx, s, t) {
    const time = t || 0;
    const wave = Math.sin(time * 2.2);

    ctx.save();
    ctx.translate(0, 0);

    // Chân đứng
    ellipse(ctx, -8, -2, 4.5, 2.8, '#4338ca', INK, 1.2);
    ellipse(ctx, 8, -2, 4.5, 2.8, '#4338ca', INK, 1.2);

    // 1. Thân tế bào nhớ tròn bông mịn (Fluffy Immune Memory Cell Body)
    ctx.save();
    ctx.translate(0, -42);

    // Thụ thể bề mặt tế bào (Receptors)
    for (let a = 0; a < 10; a++) {
      const angle = a * (TAU / 10);
      const rx = Math.cos(angle) * 22;
      const ry = Math.sin(angle) * 20;
      line(ctx, rx * 0.85, ry * 0.85, rx, ry, '#818cf8', 2.0);
      ellipse(ctx, rx, ry, 2.0, 2.0, '#c7d2fe', null);
    }

    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 18, 0, 0, TAU);
    const cellGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, 22);
    cellGrad.addColorStop(0, '#e0e7ff');
    cellGrad.addColorStop(0.5, '#a5b4fc');
    cellGrad.addColorStop(1, '#6366f1');
    ctx.fillStyle = cellGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Mắt Chibi thông thái, tinh tường
    ellipse(ctx, -7, -3, 3.5, 4.0, '#ffffff', INK, 1.2);
    ellipse(ctx, -6.5, -3, 2.0, 2.6, '#0f172a', null);
    ellipse(ctx, -7.5, -4, 1.0, 1.0, '#ffffff', null);

    ellipse(ctx, 7, -3, 3.5, 4.0, '#ffffff', INK, 1.2);
    ellipse(ctx, 6.5, -3, 2.0, 2.6, '#0f172a', null);
    ellipse(ctx, 5.5, -4, 1.0, 1.0, '#ffffff', null);

    // Má hồng
    ellipse(ctx, -11, 3, 2.4, 1.5, 'rgba(244, 63, 94, 0.4)', null);
    ellipse(ctx, 11, 3, 2.4, 1.5, 'rgba(244, 63, 94, 0.4)', null);

    // Nụ cười rạng rỡ
    ctx.beginPath();
    ctx.arc(0, 2, 2.8, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = '#312e81';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();

    // 2. Chiếc ba lô / cặp hồ sơ ký ức mầm bệnh bên vai (Memory Satchel)
    ctx.save();
    ctx.translate(-22, -36);
    drawPoly(ctx, [[-6, -10], [6, -10], [8, 8], [-8, 8]], '#b45309', INK, 1.4);
    // Quai đeo chéo
    line(ctx, 6, -10, 18, -26, '#78350f', 2.0);
    // Thẻ hồ sơ hình học (Tam giác, ngôi sao)
    ellipse(ctx, 0, 0, 2.5, 2.5, '#fef08a', null);
    ctx.restore();

    // 3. Tay cầm kính lúp pha lê soi nhớ mầm bệnh
    ctx.save();
    ctx.translate(22, -38 + wave * 1.5);
    // Cán kính
    line(ctx, 0, 6, 6, 14, '#b45309', 2.5);
    // Tròng kính pha lê
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.fillStyle = 'rgba(125, 211, 252, 0.5)';
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Huy hiệu ngôi sao đã nhận diện trong kính
    ellipse(ctx, 0, 0, 2.5, 2.5, '#facc15', null);
    ctx.restore();

    ctx.restore();
  }

  // =========================================================================
  // BACKGROUND
  // SLEEP LAB (Phòng nghiên cứu giấc ngủ hiện đại)
  // =========================================================================
  function drawSleepLabBg(ctx, settings, t) {
    ctx.save();
    const w = 576;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';
    const time = t || 0;

    // Tường phòng khám giấc ngủ màu chàm tĩnh lặng (Tranquil indigo wall)
    const wallGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      wallGrad.addColorStop(0, '#020617');
      wallGrad.addColorStop(0.5, '#0f172a');
      wallGrad.addColorStop(1, '#0f172a');
    } else {
      wallGrad.addColorStop(0, '#0f172a');
      wallGrad.addColorStop(0.5, '#1e293b');
      wallGrad.addColorStop(1, '#1e293b');
    }
    ctx.fillStyle = wallGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Sàn nhà phòng khám y tế êm dịu (Clean clinic floor)
    const floorGrad = ctx.createLinearGradient(0, groundY, 0, 1024);
    floorGrad.addColorStop(0, '#334155');
    floorGrad.addColorStop(0.4, '#1e293b');
    floorGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(X0, groundY, X1 - X0, 1024 - groundY);

    // Đường len chân tường
    line(ctx, X0, groundY, X1, groundY, '#475569', 3.0);

    // Cửa sổ lớn nhìn ra bầu trời đêm yên bình (Window with starry night)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(140, 120, 296, 260, 12);
    ctx.fillStyle = '#020617';
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4.0;
    ctx.stroke();

    // Ngôi sao ngoài trời đêm
    for (let s = 0; s < 16; s++) {
      const sx = 160 + (s * 37) % 256;
      const sy = 140 + (s * 29) % 220;
      ellipse(ctx, sx, sy, 1.5, 1.5, '#fef08a', null);
    }
    // Khung chữ thập cửa sổ
    line(ctx, 288, 120, 288, 380, '#334155', 3.0);
    line(ctx, 140, 250, 436, 250, '#334155', 3.0);
    ctx.restore();

    // Giường ngủ theo dõi giấc ngủ êm ái ở trung tâm (Sleep Monitoring Bed)
    ctx.save();
    ctx.translate(288, groundY - 60);

    // Nệm giường và chăn ấm
    ctx.beginPath();
    ctx.roundRect(-120, -50, 240, 60, 10);
    ctx.fillStyle = '#475569';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Tấm chăn phủ màu xanh pastel
    ctx.beginPath();
    ctx.roundRect(-110, -35, 220, 45, 6);
    ctx.fillStyle = '#6366f1';
    ctx.fill();
    ctx.strokeStyle = '#4338ca';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Gối đầu êm ái
    ellipse(ctx, -70, -42, 28, 12, '#f8fafc', '#cbd5e1', 1.4);
    ellipse(ctx, 70, -42, 28, 12, '#f8fafc', '#cbd5e1', 1.4);

    // Chân giường kim loại
    line(ctx, -100, 10, -100, 60, '#1e293b', 4.0);
    line(ctx, 100, 10, 100, 60, '#1e293b', 4.0);
    ctx.restore();

    // Màn hình đo đa ký giấc ngủ & điện não đồ (Polysomnography EEG Screen)
    // ZERO text, ZERO numbers - chỉ sóng điện não EEG uốn lượn
    ctx.save();
    ctx.translate(80, groundY - 180);
    ctx.roundRect(-45, -35, 90, 70, 6);
    ctx.fillStyle = '#020617';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Chân giá đỡ màn hình
    line(ctx, 0, 35, 0, 120, '#475569', 3.0);
    line(ctx, -20, 120, 20, 120, '#1e293b', 4.0);

    // Các đường sóng não EEG nhấp nhô mềm mại (Alpha & Theta Waves)
    ctx.save();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let x = -38; x <= 38; x += 4) {
      const wy = -15 + Math.sin(x * 0.18 + time * 3) * 6;
      if (x === -38) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
    }
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    for (let x = -38; x <= 38; x += 4) {
      const wy = 10 + Math.sin(x * 0.12 + time * 2) * 8;
      if (x === -38) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
    }
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // Đèn ngủ đặt đầu giường với ánh sáng vàng ấm áp
    ctx.save();
    ctx.translate(480, groundY - 160);
    // Bàn kê
    ctx.fillStyle = '#334155';
    ctx.fillRect(-22, 40, 44, 100);
    // Chụp đèn
    drawPoly(ctx, [[-16, 20], [-10, 0], [10, 0], [16, 20]], '#fef08a', '#ca8a04', 1.2);
    // Ánh sáng ấm
    const lampGlow = ctx.createRadialGradient(0, 10, 2, 0, 10, 50);
    lampGlow.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
    lampGlow.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = lampGlow;
    ctx.beginPath();
    ctx.arc(0, 10, 50, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Khổ ngang: mở rộng thêm tủ thuốc y tế, rèm che và cây cảnh trong nhà
    scatterExt(ext, 140, 'sleeplab_ext', (x, r, i) => {
      // Tủ đồ y tế
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x - 30, groundY - 160, 60, 160);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.0;
      ctx.strokeRect(x - 30, groundY - 160, 60, 160);
      line(ctx, x, groundY - 160, x, groundY, '#334155', 1.5);
      ellipse(ctx, x - 6, groundY - 80, 2.5, 2.5, '#94a3b8', null);
      ellipse(ctx, x + 6, groundY - 80, 2.5, 2.5, '#94a3b8', null);
    });

    ctx.restore();
  }

  // =========================================================================
  // RIG & BACKGROUND REGISTRATION
  // =========================================================================
  const BODY_MORE_RIGS = {
    regenerating_liver: { draw(ctx, s, t) { drawRegeneratingLiver(ctx, s, t); } },
    appendix_chibi: { draw(ctx, s, t) { drawAppendixChibi(ctx, s, t); } },
    neuron_chibi: { draw(ctx, s, t) { drawNeuronChibi(ctx, s, t); } },
    fingerprint: { draw(ctx, s, t) { drawFingerprint(ctx, s, t); } },
    vaccine_training: { draw(ctx, s, t) { drawVaccineTraining(ctx, s, t); } },
    fever_thermometer: { draw(ctx, s, t) { drawFeverThermometer(ctx, s, t); } },
    fracture_healing_bone: { draw(ctx, s, t) { drawFractureHealingBone(ctx, s, t); } },
    sleeping_brain: { draw(ctx, s, t) { drawSleepingBrain(ctx, s, t); } },
    memory_cell_chibi: { draw(ctx, s, t) { drawMemoryCellChibi(ctx, s, t); } }
  };

  const BODY_MORE_BACKGROUNDS = {
    sleep_lab: {
      label: 'Phòng nghiên cứu giấc ngủ',
      theme: 'interior',
      ground_y: 810,
      draw(ctx, settings, t) { drawSleepLabBg(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: BODY_MORE_RIGS,
    backgrounds: BODY_MORE_BACKGROUNDS
  });

})();
