// Remake Vector Engine Pack: Ancient Dinosaurs (Khủng long & Thú cổ đại)
// Rigs: trex, triceratops, pterodactyl, ancient_lizard
(function() {
  'use strict';
  if (!globalThis.RemakeVector) throw new Error('RemakeVector core engine must be loaded before engine packs.');
  const { kit, register } = globalThis.RemakeVector;
  const { INK, tone, volume, cylinder, limb, ellipse, path, line, withCut, hash, clamp, smooth } = kit;

  function drawEye(ctx, x, y, r, blink, dirX = 1, irisColor = '#e5a822') {
    if (blink > 0.7) {
      path(ctx, `M ${x - r} ${y} Q ${x} ${y + r * 0.8} ${x + r} ${y}`, null, INK, 1.6);
      return;
    }
    const h = r * (1 - blink * 0.8);
    ellipse(ctx, x, y, r, h, '#ffffff', INK, 1.2);
    const pupilX = x + dirX * (r * 0.25);
    ellipse(ctx, pupilX, y, r * 0.55, h * 0.55, irisColor, null);
    // Đồng tử dẹp hình mắt bò sát / khủng long
    ellipse(ctx, pupilX, y, r * 0.22, h * 0.45, '#111111', null);
    ellipse(ctx, pupilX - r * 0.18, y - h * 0.18, r * 0.2, h * 0.2, '#ffffff', null);
  }

  // 1. T-REX (Khủng long bạo chúa Tyrannosaurus Rex)
  function drawTRex(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#5a6844';
    const bellyCol = '#b8c49a';
    const stripeCol = tone(bodyCol, -0.28);

    ctx.save();
    // ĐUÔI DÀI NẶNG GIỮ THĂNG BẰNG
    const tailSway = Math.sin(t * 3 + stride) * 8 * (0.5 + walk * 0.6);
    path(ctx, `M -24 -46 C -50 -54 -80 -46 ${-100 + tailSway} -36 C -82 -30 -54 -36 -24 -36 Z`, volume(ctx, -60, -42, 38, 12, bodyCol), INK, 2);

    // Chân biped xa
    const bipedLeg = (off, near) => {
      const ph = stride + off;
      const sw = -Math.sin(ph) * walk * 16;
      const lift = Math.max(0, -Math.cos(ph)) * walk * 10;
      const col = near ? bodyCol : tone(bodyCol, -0.25);
      const fx = 4 + sw, fy = -lift;
      // Đùi to vạm vỡ
      ellipse(ctx, -2, -42, 14, 18, volume(ctx, -2, -42, 14, 18, col), INK, 1.6, 0.2);
      // Bắp chân & Cổ chân
      limb(ctx, [[-2, -34], [fx - 6, -18], [fx, fy - 4]], col, 9);
      // Bàn chân 3 móng vuốt khủng long
      path(ctx, `M ${fx - 6} ${fy - 3} L ${fx + 10} ${fy} L ${fx + 2} ${fy - 6} Z`, col, INK, 1.2);
      for (const [mx, my] of [[fx + 6, fy], [fx + 10, fy - 1], [fx + 8, fy + 1]]) {
        line(ctx, [[mx, my - 2], [mx + 4, my]], '#1a1a1a', 2.2);
      }
    };
    bipedLeg(0, 0);

    // Thân khủng long lực lưỡng
    path(ctx, 'M -26 -44 C -30 -66 4 -72 32 -60 C 44 -52 46 -38 34 -32 C 16 -24 -8 -26 -26 -44 Z', volume(ctx, 4, -48, 34, 22, bodyCol), INK, 2.2);
    // Bụng sáng màu
    path(ctx, 'M -18 -38 C 2 -30 24 -30 32 -34 C 28 -26 12 -24 -14 -32 Z', bellyCol, null);

    // Sọc vằn da khủng long
    for (let i = 0; i < 5; i++) {
      const sx = -14 + i * 9;
      path(ctx, `M ${sx} -66 Q ${sx + 3} -52 ${sx + 1} -40`, null, stripeCol, 2.5);
    }

    // Chân biped gần
    bipedLeg(Math.PI, 1);

    // TAY TRƯỚC TÍ HON ĐẶC TRƯNG T-REX (Hai ngón vuốt)
    limb(ctx, [[28, -52], [34, -46], [38, -42]], bodyCol, 4.5);
    line(ctx, [[38, -42], [42, -41]], '#1a1a1a', 1.8);
    line(ctx, [[38, -42], [41, -44]], '#1a1a1a', 1.8);

    // ĐẦU HỘP SỌ KHỔNG LỒ & HÀM RĂNG SẮC NHỌN
    ctx.save();
    const hx = 36, hy = -68;
    const roar = mouth * 0.7; // há mõm gầm

    // Hàm dưới
    ctx.save();
    ctx.translate(hx + 8, hy + 18);
    ctx.rotate(roar);
    path(ctx, 'M 0 0 L 32 -2 C 34 3 32 8 24 8 L 0 6 Z', volume(ctx, 16, 3, 16, 5, bodyCol), INK, 1.6);
    // Răng hàm dưới
    for (let r = 8; r < 30; r += 5) {
      path(ctx, `M ${r} 0 L ${r + 2} -5 L ${r + 4} 0 Z`, '#fbfbf2', null);
    }
    // Vòm miệng đỏ sẫm
    ellipse(ctx, 12, 2, 8, 3, '#781c24', null);
    ctx.restore();

    // Hộp sọ & Hàm trên
    path(ctx, `M ${hx - 8} ${hy + 12} C ${hx - 10} ${hy - 14} ${hx + 14} ${hy - 20} ${hx + 38} ${hy - 8} C ${hx + 46} ${hy - 2} ${hx + 44} ${hy + 8} ${hx + 38} ${hy + 12} L ${hx} ${hy + 14} Z`, volume(ctx, hx + 16, hy, 26, 16, bodyCol), INK, 2);

    // Hốc mũi & Hốc mắt sâu
    ellipse(ctx, hx + 36, hy + 2, 3, 2, tone(bodyCol, -0.3), null);

    // Gờ xương mày dữ tợn
    path(ctx, `M ${hx + 10} ${hy - 10} Q ${hx + 20} ${hy - 14} ${hx + 26} ${hy - 8}`, null, INK, 3.2);

    // Mắt rồng hổ phách
    drawEye(ctx, hx + 18, hy - 6, 4.2, s.blink || 0, 1, '#f0a820');

    // RĂNG HÀM TRÊN NHỌN HOẮT SẮC BÉN
    for (let r = 10; r < 36; r += 5) {
      path(ctx, `M ${hx + r} ${hy + 13} L ${hx + r + 2} ${hy + 19} L ${hx + r + 4} ${hy + 13} Z`, '#ffffff', null);
    }

    ctx.restore();
    ctx.restore();
  }

  // 2. TRICERATOPS (Khủng long ba sừng)
  function drawTriceratops(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#74624b';
    const frillCol = '#9e7e59';
    const hornCol = '#fffce8';

    ctx.save();
    // 4 chân trụ như cột đình
    const triLeg = (lx, near, off) => {
      const ph = stride + off;
      const sw = -Math.sin(ph) * walk * 12;
      const lift = Math.max(0, -Math.cos(ph)) * walk * 7;
      const col = near ? bodyCol : tone(bodyCol, -0.22);
      const fx = lx + sw, fy = -lift;
      limb(ctx, [[lx, -28], [lx, -14], [fx, fy - 3]], col, 11);
      // Móng chân to
      ellipse(ctx, fx + 1, fy - 2, 7, 4, '#241e18', INK, 1);
    };
    triLeg(-32, 0, 0);
    triLeg(24, 0, Math.PI);

    // Đuôi nặng nề
    const tailWag = Math.sin(t * 3) * 6;
    path(ctx, `M -44 -40 C -64 -44 -82 -32 ${-92 + tailWag} -18 C -78 -20 -58 -28 -44 -30 Z`, volume(ctx, -68, -30, 24, 12, bodyCol), INK, 1.8);

    // Thân khổng lồ bọc giáp
    path(ctx, 'M -46 -42 C -48 -68 -14 -72 24 -68 C 44 -64 48 -48 42 -32 C 30 -22 2 -22 -32 -24 Z', volume(ctx, -2, -48, 46, 26, bodyCol), INK, 2.2);

    triLeg(-18, 1, Math.PI);
    triLeg(36, 1, 0);

    // ĐẦU CÓ KHIÊN CỔ KHỔNG LỒ & 3 SỪNG
    ctx.save();
    const hp = [28, -52];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.7);
    ctx.translate(-hp[0], -hp[1]);

    // TẤM KHIÊN CỔ (Bony Frill) TO LỚN HÌNH QUẠT
    path(ctx, 'M 18 -52 C 10 -84 28 -104 54 -96 C 68 -90 64 -66 52 -52 Z', volume(ctx, 38, -78, 26, 26, frillCol), INK, 2);
    // Gai viền quanh khiên
    for (let k = 0; k < 6; k++) {
      const u = k / 5;
      const fx = 16 + u * 42;
      const fy = -72 - Math.sin(u * Math.PI) * 26;
      ellipse(ctx, fx, fy, 3, 4, hornCol, INK, 0.8, 0.4);
    }
    // Họa tiết hoa văn đốm trên khiên cổ
    ellipse(ctx, 36, -80, 7, 10, tone(frillCol, -0.2), null, 0, 0.4);

    // Hộp sọ đầu
    ellipse(ctx, 42, -56, 16, 14, volume(ctx, 42, -56, 16, 14, bodyCol), INK, 1.8);

    // Mỏ vẹt cứng (Parrot beak)
    path(ctx, 'M 54 -52 C 64 -50 72 -42 70 -34 C 64 -34 58 -38 52 -44 Z', volume(ctx, 62, -42, 10, 8, '#2b231c'), INK, 1.4);

    // Mắt
    drawEye(ctx, 40, -62, 3.8, s.blink || 0, 1, '#d89c20');

    // SỪNG MŨI NHỎ
    path(ctx, 'M 58 -54 L 66 -66 L 63 -52 Z', volume(ctx, 62, -58, 4, 8, hornCol), INK, 1.2);

    // HAI SỪNG TRÁN KHỔNG LỒ CHĨA THẲNG VỀ PHÍA TRƯỚC
    path(ctx, 'M 36 -68 C 48 -82 72 -88 88 -82 C 74 -78 52 -74 44 -64 Z', volume(ctx, 64, -80, 26, 10, hornCol), INK, 1.5);
    path(ctx, 'M 42 -66 C 54 -80 78 -86 94 -80 C 80 -76 58 -72 50 -62 Z', volume(ctx, 70, -78, 26, 10, hornCol), INK, 1.5);

    ctx.restore();
    ctx.restore();
  }

  // 3. PTERODACTYL (Thằn lằn bay)
  function drawPterodactyl(ctx, s, t) {
    const flying = Boolean(s.flying ?? false);
    const bodyCol = s.style?.body || '#7c5442';
    const wingCol = '#d48a60';
    const beakCol = '#e8a832';
    const crestCol = '#b83424';

    ctx.save();
    const flap = flying ? Math.sin(t * 12) * 0.45 : 0;

    // Cánh màng da leathery khổng lồ
    if (flying) {
      // Cánh vỗ trên trời
      ctx.save();
      ctx.translate(0, -48);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.rotate(side * (0.3 + flap));
        // Xương ngón tay cánh dài
        path(ctx, `M 0 0 Q ${side * 40} -30 ${side * 80} -10 Q ${side * 50} 30 0 10 Z`, volume(ctx, side * 40, 0, 40, 20, wingCol), INK, 1.8);
        line(ctx, [[0, 0], [side * 40, -26], [side * 80, -10]], bodyCol, 3.5);
        ctx.restore();
      }
      ctx.restore();
    } else {
      // Đang đậu trên mặt đất với cánh gập lại
      // Chân sau bám đất
      limb(ctx, [[-12, -18], [-12, -2]], bodyCol, 5);
      ellipse(ctx, -10, 0, 4, 2, '#1a1a1a', null);
      limb(ctx, [[8, -18], [8, -2]], bodyCol, 5);
      ellipse(ctx, 10, 0, 4, 2, '#1a1a1a', null);

      // Đứng bốn chân như thằn lằn bay thật: cánh màng gập dọc sườn, khớp cổ tay chống đất.
      const step = -Math.sin(s.stride || 0) * (s.walk || 0) * 4;
      path(ctx, `M 2 -46 L ${16 + step} -12 L -14 -26 Q -8 -40 2 -46 Z`, volume(ctx, 2, -28, 16, 16, wingCol), INK, 1.5);
      path(ctx, `M 0 -40 Q 6 -30 ${12 + step} -16`, null, tone(wingCol, -.25), 1.2);
      limb(ctx, [[2, -46], [16 + step, -12], [19 + step, -2]], bodyCol, 4.5);
      path(ctx, `M ${15 + step} -3 L ${24 + step} -1 L ${15 + step} 0 Z`, '#1a1a1a', null);
    }

    // Thân thon nhỏ
    ellipse(ctx, 0, -38, 14, 18, volume(ctx, 0, -38, 14, 18, bodyCol), INK, 1.6);

    // CỔ DÀI & ĐẦU CÓ MÀO NHỌN DÀI RA SAU & MỎ NHỌN HOẮT
    ctx.save();
    const hx = 18, hy = -58;
    limb(ctx, [[6, -46], [hx, hy]], bodyCol, 7);

    // MÀO ĐẦU DÀI MÀU ĐỎ VUỐT NGƯỢC RA PHÍA SAU
    path(ctx, `M ${hx} ${hy - 4} C ${hx - 16} ${hy - 16} ${hx - 36} ${hy - 24} ${hx - 42} ${hy - 28} C ${hx - 26} ${hy - 18} ${hx - 10} ${hy - 10} ${hx} ${hy - 4} Z`, volume(ctx, hx - 20, hy - 16, 22, 12, crestCol), INK, 1.4);

    // Đầu
    ellipse(ctx, hx, hy, 7, 6, volume(ctx, hx, hy, 7, 6, bodyCol), INK, 1.2);

    // Mỏ dài nhọn hoắt như cây giáo
    path(ctx, `M ${hx + 4} ${hy - 3} L ${hx + 38} ${hy + 4} L ${hx + 4} ${hy + 6} Z`, volume(ctx, hx + 20, hy + 2, 18, 5, beakCol), INK, 1.5);

    // Mắt chim săn mồi
    drawEye(ctx, hx + 3, hy - 2, 2.8, s.blink || 0, 1, '#1b1b1b');

    ctx.restore();
    ctx.restore();
  }

  // 4. ANCIENT LIZARD (Thằn lằn buồm Dimetrodon)
  function drawAncientLizard(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#7a422b';
    const sailCol = '#d94b26';
    const spineCol = '#f2bc3d';

    ctx.save();
    // Đuôi dài bò sát sát đất
    const tailWave = Math.sin(t * 3 + stride) * 8;
    path(ctx, `M -34 -20 C -60 -18 -82 -12 ${-100 + tailWave} -4 C -80 -2 -56 -10 -34 -12 Z`, volume(ctx, -68, -14, 34, 8, bodyCol), INK, 1.6);

    // 4 chân bò sát choãi ngang (Sprawling gait)
    const lizardLeg = (lx, near, off) => {
      const ph = stride + off;
      const sw = -Math.sin(ph) * walk * 12;
      const col = near ? bodyCol : tone(bodyCol, -0.2);
      const fx = lx + sw, fy = 0;
      limb(ctx, [[lx, -16], [lx + (near ? 8 : -8), -10], [fx, fy - 2]], col, 7.5);
      for (let c = -1; c <= 1; c++) {
        line(ctx, [[fx + c * 3, fy - 2], [fx + c * 5 + 3, fy]], '#1a1a1a', 1.8);
      }
    };
    lizardLeg(-24, 0, 0);
    lizardLeg(22, 0, Math.PI);

    // CÁNH BUỒM KHỔNG LỒ TRÊN LƯNG (NEURAL SPINE SAIL)
    // Các nan xương gai nhô cao hình cánh buồm
    const sailPoints = [];
    const spineCount = 14;
    for (let i = 0; i < spineCount; i++) {
      const u = i / (spineCount - 1);
      const sx = -28 + u * 56;
      // Chiều cao buồm cao nhất ở giữa (y lên tới -78)
      const h = Math.sin(u * Math.PI) * 58 + 12;
      sailPoints.push([sx, -18 - h]);
    }

    // Màng da cánh buồm
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-28, -20);
    for (const [px, py] of sailPoints) ctx.lineTo(px, py);
    ctx.lineTo(28, -20);
    ctx.closePath();
    ctx.fillStyle = volume(ctx, 0, -48, 30, 30, sailCol);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Các nan gai xương màu vàng
    for (const [px, py] of sailPoints) {
      line(ctx, [[px, -20], [px, py - 3]], spineCol, 2);
    }
    // Họa tiết đốm tròn trên cánh buồm
    for (let d = 2; d < spineCount - 2; d += 2) {
      const p = sailPoints[d];
      ellipse(ctx, p[0], p[1] + 20, 4, 6, '#f8d468', null);
    }
    ctx.restore();

    // Thân bò sát
    path(ctx, 'M -34 -20 C -36 -32 -6 -34 26 -30 C 40 -28 42 -18 36 -12 C 26 -6 -4 -6 -28 -10 Z', volume(ctx, 0, -20, 36, 12, bodyCol), INK, 2);

    lizardLeg(-14, 1, Math.PI);
    lizardLeg(32, 1, 0);

    // ĐẦU THẰN LẰN CỔ ĐẠI VỚI RĂNG NAI SẮC NHỌN
    ctx.save();
    const hx = 36, hy = -22;
    ellipse(ctx, hx, hy, 14, 11, volume(ctx, hx, hy, 14, 11, bodyCol), INK, 1.6);

    // Mõm dài răng nhọn
    path(ctx, `M ${hx + 6} ${hy - 6} L ${hx + 24} ${hy} L ${hx + 6} ${hy + 6} Z`, volume(ctx, hx + 14, hy, 10, 6, bodyCol), INK, 1.4);

    // Răng nanh nhọn
    for (let r = 8; r < 20; r += 4) {
      path(ctx, `M ${hx + r} ${hy + 4} L ${hx + r + 1} ${hy + 8} L ${hx + r + 3} ${hy + 4} Z`, '#ffffff', null);
    }

    // Mắt
    drawEye(ctx, hx + 4, hy - 4, 3.2, s.blink || 0, 1, '#d8aa20');

    ctx.restore();
    ctx.restore();
  }

  // Đăng ký 4 rig Khủng long vào RemakeVector
  const rigs = {
    trex: { group: 'animal', draw: drawTRex },
    triceratops: { group: 'animal', draw: drawTriceratops },
    pterodactyl: { group: 'animal', draw: drawPterodactyl },
    ancient_lizard: { group: 'animal', draw: drawAncientLizard }
  };

  register({ rigs });
})();
