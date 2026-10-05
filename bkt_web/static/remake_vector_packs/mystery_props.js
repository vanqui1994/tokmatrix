/**
 * Remake Vector Pack: mystery_props
 * Pack phục vụ niche unsolved_mysteries.
 * 9 rigs: cipher_manuscript, twin_engine_plane, ghost_ship, abandoned_lighthouse,
 *         money_pit, phaistos_disk, radio_telescope, antique_compass, treasure_map.
 * 2 backgrounds: foggy_harbor, radio_telescope_field.
 */
(function(global) {
  'use strict';

  const RV = global.RemakeVector;
  if (!RV) {
    throw new Error('RemakeVector core engine must be loaded before mystery_props pack');
  }

  const { frameSpan, rgba, clamp } = RV.kit;
  const PI = Math.PI;
  const TAU = Math.PI * 2;

  // --------------------------------------------------------------------------
  // RIGS
  // --------------------------------------------------------------------------

  // 1. cipher_manuscript (bản thảo mật mã Voynich)
  function drawCipherManuscript(ctx, s) {
    ctx.save();
    // Quy chuẩn tọa độ: gốc ở chân (0, 0), tâm khoảng y = -50, đỉnh khoảng y = -90
    // Sách mở hai trang giấy da phong cách cổ
    ctx.save();
    ctx.translate(0, -50);

    // Bóng sách
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 48, 70, 10, 0, 0, TAU);
    ctx.fill();

    // Bìa da nâu sẫm phía dưới
    ctx.fillStyle = '#4a2e18';
    ctx.beginPath();
    ctx.roundRect(-68, -44, 136, 88, 5);
    ctx.fill();

    // Gáy sách uốn cong
    ctx.fillStyle = '#2c1a0e';
    ctx.fillRect(-6, -45, 12, 90);

    // Trang sách giấy da (Parchment vellum)
    const drawPage = (isLeft) => {
      ctx.save();
      const dir = isLeft ? -1 : 1;
      ctx.fillStyle = isLeft ? '#f4eedb' : '#fcf8ec';
      ctx.strokeStyle = '#d3c29f';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(dir * 2, -40);
      ctx.quadraticCurveTo(dir * 30, -43, dir * 62, -39);
      ctx.lineTo(dir * 60, 39);
      ctx.quadraticCurveTo(dir * 30, 43, dir * 2, 40);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Mép trang giấy nhiều lớp
      ctx.strokeStyle = 'rgba(180, 160, 130, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dir * 63, -37);
      ctx.lineTo(dir * 61, 41);
      ctx.stroke();

      if (isLeft) {
        // Minh họa thiên văn / thảo mộc trừu tượng ở trang trái (tuyệt đối không chữ)
        ctx.strokeStyle = '#2d5a27';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = '#4a7c36';

        // Cành cây uốn lượn
        ctx.beginPath();
        ctx.moveTo(-32, 28);
        ctx.bezierCurveTo(-25, 10, -40, -5, -30, -22);
        ctx.stroke();

        // Lá thảo mộc trừu tượng
        for (let i = 0; i < 4; i++) {
          const ly = 18 - i * 11;
          const lx = -30 + (i % 2 === 0 ? -7 : 7);
          ctx.beginPath();
          ctx.ellipse(lx, ly, 5, 2.5, (i % 2 === 0 ? -0.5 : 0.5), 0, TAU);
          ctx.fill();
        }

        // Bông hoa / biểu đồ tròn thiên văn ở ngọn
        ctx.strokeStyle = '#8b5a2b';
        ctx.fillStyle = '#d97d55';
        ctx.beginPath();
        ctx.arc(-30, -22, 6, 0, TAU);
        ctx.fill();
        ctx.stroke();

        // Vòng tròn thiên văn nhỏ
        ctx.strokeStyle = 'rgba(140, 100, 60, 0.6)';
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(-30, -22, 10, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Biểu đồ tròn đồng tâm nhỏ ở đầu trang phải
        ctx.strokeStyle = '#7c5335';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(32, -22, 8, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(32, -22, 4, 0, TAU);
        ctx.stroke();
        for (let a = 0; a < 8; a++) {
          const ang = a * (PI / 4);
          ctx.beginPath();
          ctx.moveTo(32 + Math.cos(ang) * 4, -22 + Math.sin(ang) * 4);
          ctx.lineTo(32 + Math.cos(ang) * 8, -22 + Math.sin(ang) * 8);
          ctx.stroke();
        }
      }

      // Nét glyph / ký hiệu mật mã trừu tượng uốn cong (TUYỆT ĐỐI không có chữ latin hay số)
      ctx.strokeStyle = '#433124';
      ctx.lineWidth = 1.2;
      const startLine = isLeft ? 1 : 2;
      for (let line = startLine; line < 5; line++) {
        const y = -10 + line * 11;
        const xStart = isLeft ? -52 : 12;
        const xEnd = isLeft ? -10 : 52;
        for (let gx = xStart; gx < xEnd; gx += 7) {
          ctx.beginPath();
          // Các ký hiệu glyph uốn lượn hình học: vòng lặp, móc cung, nốt móc
          const pattern = (gx + line * 3) % 4;
          if (pattern === 0) {
            ctx.arc(gx + 2, y, 2, 0, PI);
          } else if (pattern === 1) {
            ctx.moveTo(gx, y + 2);
            ctx.quadraticCurveTo(gx + 2, y - 3, gx + 4, y + 2);
          } else if (pattern === 2) {
            ctx.moveTo(gx, y);
            ctx.lineTo(gx + 4, y);
            ctx.moveTo(gx + 2, y - 2);
            ctx.lineTo(gx + 2, y + 2);
          } else {
            ctx.arc(gx + 2, y, 1.5, 0, TAU);
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    drawPage(true);
    drawPage(false);

    // Rãnh giữa hai trang
    ctx.strokeStyle = 'rgba(70, 45, 25, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(0, 42);
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  // 2. twin_engine_plane (máy bay thám hiểm 2 động cơ kiểu thập niên 1930)
  function drawTwinEnginePlane(ctx, s, t) {
    ctx.save();
    ctx.translate(0, -50);

    const propAngle = ((t || 0) * 18) % TAU;

    // Bóng dưới đất nếu hạ cánh
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 46, 75, 12, 0, 0, TAU);
    ctx.fill();

    // Thân máy bay màu bạc hợp kim nhôm Duralumin thập niên 1930
    const bodyGrad = ctx.createLinearGradient(0, -25, 0, 25);
    bodyGrad.addColorStop(0, '#e8edf2');
    bodyGrad.addColorStop(0.5, '#c5cfd9');
    bodyGrad.addColorStop(1, '#8fa0b0');

    // Cánh xa (phía trên)
    ctx.fillStyle = '#a6b4c2';
    ctx.strokeStyle = '#6e7e8e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-15, -10);
    ctx.lineTo(-25, -45);
    ctx.lineTo(5, -42);
    ctx.lineTo(15, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Động cơ cánh xa
    ctx.fillStyle = '#6e7e8e';
    ctx.beginPath();
    ctx.roundRect(0, -42, 22, 10, 3);
    ctx.fill();
    ctx.stroke();
    // Cánh quạt xa quay mờ
    ctx.strokeStyle = 'rgba(180, 200, 220, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(22, -37, 3, 14, propAngle, 0, TAU);
    ctx.stroke();

    // Đuôi chữ H kép phía sau
    ctx.fillStyle = '#9cb0c2';
    ctx.strokeStyle = '#647585';
    ctx.beginPath();
    ctx.moveTo(-50, -5);
    ctx.lineTo(-68, -25);
    ctx.lineTo(-60, -25);
    ctx.lineTo(-44, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Cánh đuôi dọc H-tail
    ctx.fillStyle = '#8396a8';
    ctx.fillRect(-70, -32, 5, 20);

    // Thân chính máy bay
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#5a6875';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(65, 0); // Mũi bo tròn
    ctx.bezierCurveTo(65, -15, 30, -18, -40, -12);
    ctx.lineTo(-65, -3);
    ctx.lineTo(-65, 3);
    ctx.lineTo(-40, 12);
    ctx.bezierCurveTo(30, 18, 65, 15, 65, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cửa sổ buồng lái kính cong vòm màu xanh lam
    ctx.fillStyle = '#3a6b8c';
    ctx.strokeStyle = '#24455c';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(42, -11);
    ctx.quadraticCurveTo(54, -7, 56, 0);
    ctx.lineTo(44, 0);
    ctx.lineTo(38, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cửa sổ tròn khoang hành khách
    ctx.fillStyle = '#4a7d9e';
    for (let wx = 22; wx >= -22; wx -= 14) {
      ctx.beginPath();
      ctx.arc(wx, -3, 3, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    // Cánh gần (phía dưới)
    ctx.fillStyle = '#b8c6d4';
    ctx.strokeStyle = '#6e7e8e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-12, 5);
    ctx.lineTo(-24, 38);
    ctx.lineTo(8, 35);
    ctx.lineTo(18, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Động cơ cánh gần
    ctx.fillStyle = '#7a8c9e';
    ctx.strokeStyle = '#4e5d6c';
    ctx.beginPath();
    ctx.roundRect(4, 25, 24, 12, 4);
    ctx.fill();
    ctx.stroke();

    // Cánh quạt gần quay
    ctx.strokeStyle = 'rgba(210, 225, 240, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(28, 31, 3, 16, propAngle + 0.8, 0, TAU);
    ctx.stroke();

    // Bánh đáp hạ cánh
    ctx.fillStyle = '#222';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 28);
    ctx.lineTo(12, 44);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, 44, 4.5, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  // 3. ghost_ship (tàu ma Mary Celeste buồm rách trong sương)
  function drawGhostShip(ctx, s, t) {
    ctx.save();
    ctx.translate(0, -50);

    const sway = Math.sin((t || 0) * 1.5) * 0.04;
    ctx.rotate(sway);

    // Làn sương ma mị bao quanh thân tàu
    const mistGrad = ctx.createLinearGradient(-80, 20, 80, 45);
    mistGrad.addColorStop(0, 'rgba(160, 200, 210, 0)');
    mistGrad.addColorStop(0.5, 'rgba(180, 220, 230, 0.45)');
    mistGrad.addColorStop(1, 'rgba(160, 200, 210, 0)');
    ctx.fillStyle = mistGrad;
    ctx.fillRect(-85, 20, 170, 28);

    // Thân tàu bằng gỗ mục phong trần
    ctx.fillStyle = '#3a2e26';
    ctx.strokeStyle = '#221a15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-65, 0); // Đuôi cao
    ctx.lineTo(-60, 26);
    ctx.quadraticCurveTo(0, 36, 60, 20); // Đáy lượn cong
    ctx.lineTo(75, 4); // Mũi nhọn
    ctx.lineTo(55, 6);
    ctx.quadraticCurveTo(0, 8, -55, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Ván gỗ thân tàu
    ctx.strokeStyle = 'rgba(20, 15, 10, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-58, 12);
    ctx.quadraticCurveTo(0, 18, 62, 10);
    ctx.moveTo(-56, 20);
    ctx.quadraticCurveTo(0, 26, 56, 16);
    ctx.stroke();

    // 3 Cột buồm
    const masts = [
      { x: -35, h: 65, sailH: 40 },
      { x: 0, h: 80, sailH: 52 },
      { x: 38, h: 70, sailH: 45 }
    ];

    masts.forEach((m, idx) => {
      // Cột buồm gỗ
      ctx.fillStyle = '#4a3b32';
      ctx.fillRect(m.x - 2, 4 - m.h, 4, m.h);

      // Cột ngang giằng buồm
      ctx.strokeStyle = '#322720';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x - 18, 10 - m.h);
      ctx.lineTo(m.x + 18, 10 - m.h);
      ctx.moveTo(m.x - 16, 22 - m.h + m.sailH * 0.5);
      ctx.lineTo(m.x + 16, 22 - m.h + m.sailH * 0.5);
      ctx.stroke();

      // Cánh buồm rách tơi tả lơ lửng
      ctx.fillStyle = 'rgba(230, 225, 210, 0.65)';
      ctx.strokeStyle = 'rgba(120, 110, 95, 0.8)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(m.x - 16, 11 - m.h);
      ctx.quadraticCurveTo(m.x + 2, 16 - m.h, m.x + 16, 11 - m.h);
      ctx.lineTo(m.x + 14, 20 - m.h + m.sailH * 0.5);
      // Mép rách răng cưa
      ctx.lineTo(m.x + 8, 16 - m.h + m.sailH * 0.5);
      ctx.lineTo(m.x + 2, 22 - m.h + m.sailH * 0.5);
      ctx.lineTo(m.x - 5, 17 - m.h + m.sailH * 0.5);
      ctx.lineTo(m.x - 14, 21 - m.h + m.sailH * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Buồm tầng dưới
      ctx.beginPath();
      ctx.moveTo(m.x - 15, 24 - m.h + m.sailH * 0.5);
      ctx.quadraticCurveTo(m.x + 2, 30 - m.h + m.sailH * 0.5, m.x + 15, 24 - m.h + m.sailH * 0.5);
      ctx.lineTo(m.x + 12, 18 - m.h + m.sailH);
      // Rách tua rua
      ctx.lineTo(m.x + 5, 13 - m.h + m.sailH);
      ctx.lineTo(m.x - 2, 19 - m.h + m.sailH);
      ctx.lineTo(m.x - 8, 14 - m.h + m.sailH);
      ctx.lineTo(m.x - 14, 18 - m.h + m.sailH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // Cột mũi hướng về phía trước
    ctx.strokeStyle = '#4a3b32';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(55, 6);
    ctx.lineTo(85, -10);
    ctx.stroke();

    // Dây neo và dây cáp đứt buông lơi
    ctx.strokeStyle = 'rgba(60, 50, 40, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(85, -10);
    ctx.quadraticCurveTo(60, 8, 38, -66);
    ctx.moveTo(38, -66);
    ctx.quadraticCurveTo(18, -40, 0, -76);
    ctx.moveTo(0, -76);
    ctx.quadraticCurveTo(-15, -45, -35, -61);
    ctx.stroke();

    ctx.restore();
  }

  // 4. abandoned_lighthouse (ngọn hải đăng hoang tàn trên vách đá)
  function drawAbandonedLighthouse(ctx, s) {
    ctx.save();
    ctx.translate(0, -50);

    // Chân vách đá dựng đứng
    ctx.fillStyle = '#4a4d52';
    ctx.strokeStyle = '#2b2e33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-50, 48);
    ctx.lineTo(-44, 25);
    ctx.lineTo(-28, 20);
    ctx.lineTo(26, 20);
    ctx.lineTo(46, 28);
    ctx.lineTo(52, 48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rêu phong và vết nứt vách đá
    ctx.fillStyle = '#3a4a35';
    ctx.fillRect(-26, 21, 50, 4);

    // Thân tháp hình nón cụt sọc đỏ trắng bạc màu
    const towerH = 75;
    const towerTopY = 20 - towerH; // -55
    const topW = 20;
    const botW = 34;

    // Các dải sọc từ dưới lên
    const stripes = [
      { y0: 20, y1: 5, color: '#9e3d36' },
      { y0: 5, y1: -10, color: '#e0ded9' },
      { y0: -10, y1: -25, color: '#8e352f' },
      { y0: -25, y1: -40, color: '#d4d1cb' },
      { y0: -40, y1: -55, color: '#82302a' }
    ];

    stripes.forEach(st => {
      const p0 = (20 - st.y0) / towerH;
      const p1 = (20 - st.y1) / towerH;
      const w0 = botW + (topW - botW) * p0;
      const w1 = botW + (topW - botW) * p1;

      ctx.fillStyle = st.color;
      ctx.beginPath();
      ctx.moveTo(-w0 * 0.5, st.y0);
      ctx.lineTo(-w1 * 0.5, st.y1);
      ctx.lineTo(w1 * 0.5, st.y1);
      ctx.lineTo(w0 * 0.5, st.y0);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#3a2a28';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Vết nứt trên thân tháp
    ctx.strokeStyle = '#2b1e1c';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-4, -5);
    ctx.lineTo(-1, -15);
    ctx.lineTo(-6, -22);
    ctx.lineTo(-2, -32);
    ctx.stroke();

    // Cửa ra vào vòm gỗ cũ kỹ dưới chân tháp
    ctx.fillStyle = '#2b231d';
    ctx.beginPath();
    ctx.roundRect(-5, 4, 10, 16, [4, 4, 0, 0]);
    ctx.fill();

    // Ban công lan can sắt quanh lầu đèn
    ctx.fillStyle = '#222';
    ctx.fillRect(-18, -57, 36, 4);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-17, -63);
    ctx.lineTo(17, -63);
    for (let lx = -16; lx <= 16; lx += 8) {
      ctx.moveTo(lx, -63);
      ctx.lineTo(lx, -57);
    }
    ctx.stroke();

    // Lồng kính đèn hải đăng (kính vỡ, tối tăm bí ẩn, không sáng đèn)
    ctx.fillStyle = '#233038';
    ctx.fillRect(-12, -75, 24, 18);
    ctx.strokeStyle = '#4a5b66';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-12, -75, 24, 18);

    // Kính vỡ góc phải
    ctx.strokeStyle = '#718896';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, -70);
    ctx.lineTo(8, -62);
    ctx.lineTo(11, -73);
    ctx.stroke();

    // Mái vòm kim loại trên đỉnh
    ctx.fillStyle = '#3a4b3d';
    ctx.strokeStyle = '#223024';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -75, 14, PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cọc thu lôi đỉnh tháp
    ctx.strokeStyle = '#1b241c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -89);
    ctx.lineTo(0, -96);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -96, 2, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  // 5. money_pit (hố kho báu đảo Oak sâu nhiều tầng giằng gỗ)
  function drawMoneyPit(ctx, s) {
    ctx.save();
    ctx.translate(0, -50);

    // Giá đỡ chữ A và ròng rọc trên mặt đất
    ctx.strokeStyle = '#5a3d28';
    ctx.lineWidth = 3.5;
    // Cột đỡ trái phải
    ctx.beginPath();
    ctx.moveTo(-32, -15);
    ctx.lineTo(0, -42);
    ctx.lineTo(32, -15);
    ctx.stroke();
    // Thanh giằng ngang
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-18, -26);
    ctx.lineTo(18, -26);
    ctx.stroke();

    // Bánh ròng rọc
    ctx.fillStyle = '#382516';
    ctx.beginPath();
    ctx.arc(0, -38, 5, 0, TAU);
    ctx.fill();

    // Dây thừng thả từ ròng rọc xuống đáy hố
    ctx.strokeStyle = '#c49a62';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(0, 42);
    ctx.stroke();

    // Mặt đất bên ngoài hố
    ctx.fillStyle = '#4a6b32'; // Lớp cỏ trên cùng
    ctx.fillRect(-58, -15, 26, 6);
    ctx.fillRect(32, -15, 26, 6);

    // Thành đất đào sâu của hố
    const pitGrad = ctx.createLinearGradient(0, -10, 0, 48);
    pitGrad.addColorStop(0, '#5a422e');
    pitGrad.addColorStop(0.5, '#3d2a1b');
    pitGrad.addColorStop(1, '#1a110a');

    ctx.fillStyle = pitGrad;
    ctx.strokeStyle = '#2d1e13';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-30, -10, 60, 58);
    ctx.fill();
    ctx.stroke();

    // Các tầng giằng gỗ sồi cách đều (Oak logs platforms bí ẩn)
    const platforms = [-2, 12, 26];
    platforms.forEach(py => {
      ctx.fillStyle = '#7a5438';
      ctx.strokeStyle = '#422c1b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-30, py, 60, 6, 2);
      ctx.fill();
      ctx.stroke();

      // Chi tiết vân thớ gỗ
      ctx.strokeStyle = '#523824';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-25, py + 3);
      ctx.lineTo(25, py + 3);
      ctx.stroke();
    });

    // Dưới đáy hố: hòm kho báu bí ẩn hoặc phiến đá khắc bí ẩn
    ctx.fillStyle = '#8a6230';
    ctx.strokeStyle = '#4a3316';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-12, 34, 24, 12, 2);
    ctx.fill();
    ctx.stroke();

    // Đai sắt bọc hòm
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-9, 34, 3, 12);
    ctx.fillRect(6, 34, 3, 12);

    // Móc dây thừng nối vào hòm
    ctx.strokeStyle = '#c49a62';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 34, 2.5, 0, TAU);
    ctx.stroke();

    ctx.restore();
  }

  // 6. phaistos_disk (đĩa đất nung Phaistos đường xoắn ốc ký hiệu cổ)
  function drawPhaistosDisk(ctx, s, t) {
    ctx.save();
    ctx.translate(0, -50);

    const rot = ((t || 0) * 0.15) % TAU;
    ctx.rotate(rot);

    // Bóng đĩa
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 44, 45, 8, 0, 0, TAU);
    ctx.fill();

    // Thân đĩa đất nung Terra Cotta
    const diskGrad = ctx.createRadialGradient(-10, -10, 5, 0, 0, 45);
    diskGrad.addColorStop(0, '#de8c62');
    diskGrad.addColorStop(0.7, '#ba6840');
    diskGrad.addColorStop(1, '#8c4320');

    ctx.fillStyle = diskGrad;
    ctx.strokeStyle = '#632c12';
    ctx.lineWidth = 2.5;

    // Vành đĩa tròn hơi gợn tự nhiên kiểu thủ công cổ đại
    ctx.beginPath();
    for (let a = 0; a < 36; a++) {
      const ang = a * (TAU / 36);
      const r = 44 + Math.sin(a * 5) * 1.2;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Đường rãnh xoắn ốc kép từ ngoài vào tâm
    ctx.strokeStyle = '#5a250e';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let t = 0; t < 18; t += 0.2) {
      const r = 38 - t * 1.8;
      if (r < 4) break;
      const x = Math.cos(t) * r;
      const y = Math.sin(t) * r;
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Các con dấu biểu tượng trừu tượng cổ dọc theo đường xoắn (không chữ hay số)
    ctx.fillStyle = '#421a08';
    ctx.strokeStyle = '#421a08';
    ctx.lineWidth = 1.2;

    const glyphRadii = [34, 28, 22, 16, 10];
    glyphRadii.forEach((gr, idx) => {
      const count = Math.max(3, Math.floor(gr * 0.28));
      for (let i = 0; i < count; i++) {
        const ang = (i * (TAU / count)) + idx * 0.7;
        const gx = Math.cos(ang) * gr;
        const gy = Math.sin(ang) * gr;

        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(ang + PI * 0.5);

        const type = (i + idx) % 5;
        if (type === 0) {
          // Biểu tượng chiếc lá / bông hoa nhỏ
          ctx.beginPath();
          ctx.ellipse(0, 0, 3, 1.8, 0, 0, TAU);
          ctx.fill();
        } else if (type === 1) {
          // Biểu tượng khiên tròn / vòng cung có chấm
          ctx.beginPath();
          ctx.arc(0, 0, 2.5, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, 0.8, 0, TAU);
          ctx.fill();
        } else if (type === 2) {
          // Biểu tượng chim hình học cách điệu
          ctx.beginPath();
          ctx.moveTo(-3, 1);
          ctx.lineTo(0, -2.5);
          ctx.lineTo(3, 1);
          ctx.stroke();
        } else if (type === 3) {
          // Biểu tượng sóng nước 3 gợn
          ctx.beginPath();
          ctx.moveTo(-3, -1);
          ctx.quadraticCurveTo(-1.5, -3, 0, -1);
          ctx.quadraticCurveTo(1.5, 1, 3, -1);
          ctx.stroke();
        } else {
          // Biểu tượng cành cây phân nhánh
          ctx.beginPath();
          ctx.moveTo(0, 3);
          ctx.lineTo(0, -3);
          ctx.moveTo(-2, 0);
          ctx.lineTo(0, -1.5);
          ctx.lineTo(2, 0);
          ctx.stroke();
        }

        ctx.restore();
      }
    });

    ctx.restore();
  }

  // 7. radio_telescope (kính thiên văn vô tuyến chảo parabol lớn)
  function drawRadioTelescope(ctx, s, t) {
    ctx.save();
    ctx.translate(0, -50);

    // Bóng dưới mặt đất
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 46, 50, 10, 0, 0, TAU);
    ctx.fill();

    // Khung kim loại bệ đỡ mắt cáo (Truss base)
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-35, 46);
    ctx.lineTo(-12, 10);
    ctx.lineTo(12, 10);
    ctx.lineTo(35, 46);
    ctx.closePath();
    ctx.stroke();

    // Giằng chéo chữ X chịu lực
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-30, 40);
    ctx.lineTo(12, 10);
    ctx.moveTo(30, 40);
    ctx.lineTo(-12, 10);
    ctx.moveTo(-20, 25);
    ctx.lineTo(20, 25);
    ctx.stroke();

    // Trục xoay cơ khí chính
    ctx.fillStyle = '#2d3748';
    ctx.beginPath();
    ctx.roundRect(-10, 2, 20, 14, 3);
    ctx.fill();

    // Chảo parabol nghiêng hướng bầu trời đêm (góc ~50 độ)
    ctx.save();
    ctx.translate(0, 2);
    ctx.rotate(-0.35); // Nghiêng nhẹ

    // Mặt sau chảo (khung xương chịu lực)
    ctx.strokeStyle = '#718096';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-45, -8);
    ctx.quadraticCurveTo(0, 8, 45, -8);
    ctx.stroke();

    // Lòng chảo parabol phản xạ màu trắng xám kim loại
    const dishGrad = ctx.createLinearGradient(-48, -25, 48, 5);
    dishGrad.addColorStop(0, '#edf2f7');
    dishGrad.addColorStop(0.5, '#cbd5e0');
    dishGrad.addColorStop(1, '#a0aec0');

    ctx.fillStyle = dishGrad;
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -18, 46, 16, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Các vòng đồng tâm trong lòng chảo
    ctx.strokeStyle = 'rgba(100, 115, 130, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, -18, 30, 10, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -18, 14, 5, 0, 0, TAU);
    ctx.stroke();

    // Chân chống chóp thu sóng (Tripod feed support)
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-35, -18);
    ctx.lineTo(0, -46);
    ctx.moveTo(35, -18);
    ctx.lineTo(0, -46);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, -46);
    ctx.stroke();

    // Chóp đầu thu sóng (Feed horn / sub-reflector)
    ctx.fillStyle = '#e53e3e';
    ctx.strokeStyle = '#9b2c2c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -46, 5, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Sóng vô tuyến nhấp nháy phát / thu tín hiệu
    const pulse = ((t || 0) * 3) % 3;
    ctx.strokeStyle = `rgba(229, 62, 62, ${0.8 - pulse * 0.25})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -46, 8 + pulse * 6, -PI * 0.8, -PI * 0.2);
    ctx.stroke();

    ctx.restore();

    ctx.restore();
  }

  // 8. antique_compass (la bàn hàng hải cổ bằng đồng thau)
  function drawAntiqueCompass(ctx, s, t) {
    ctx.save();
    ctx.translate(0, -50);

    // Bóng la bàn
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 44, 45, 9, 0, 0, TAU);
    ctx.fill();

    // Vỏ đồng thau dày ngoài cùng
    const brassGrad = ctx.createRadialGradient(-10, -10, 5, 0, 0, 46);
    brassGrad.addColorStop(0, '#f6e05e');
    brassGrad.addColorStop(0.6, '#d69e2e');
    brassGrad.addColorStop(1, '#744210');

    ctx.fillStyle = brassGrad;
    ctx.strokeStyle = '#521b05';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Vòng khuyên treo la bàn ở đỉnh
    ctx.strokeStyle = '#d69e2e';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, -44, 9, 0, TAU);
    ctx.stroke();

    // Mặt đĩa bên trong màu kem ngà giấy cổ
    ctx.fillStyle = '#fefcbf';
    ctx.strokeStyle = '#975a16';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Vạch chia độ tròn quanh viền
    ctx.strokeStyle = '#744210';
    ctx.lineWidth = 1;
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = deg * (PI / 180);
      const isMajor = deg % 45 === 0;
      const len = isMajor ? 5 : 2.5;
      const r1 = 35;
      const r2 = r1 - len;
      ctx.beginPath();
      ctx.moveTo(Math.cos(rad) * r1, Math.sin(rad) * r1);
      ctx.lineTo(Math.cos(rad) * r2, Math.sin(rad) * r2);
      ctx.stroke();
    }

    // Hoa tiêu chỉ hướng 8 cánh (8-point Compass Rose)
    const points = 8;
    for (let p = 0; p < points; p++) {
      const ang = p * (TAU / points);
      const isCardinal = p % 2 === 0;
      const len = isCardinal ? 26 : 18;
      const sideAng1 = ang - (PI / points);
      const sideAng2 = ang + (PI / points);
      const sideLen = isCardinal ? 7 : 5;

      // Nửa sáng
      ctx.fillStyle = isCardinal ? '#b7791f' : '#d69e2e';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
      ctx.lineTo(Math.cos(sideAng1) * sideLen, Math.sin(sideAng1) * sideLen);
      ctx.closePath();
      ctx.fill();

      // Nửa tối
      ctx.fillStyle = isCardinal ? '#744210' : '#975a16';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
      ctx.lineTo(Math.cos(sideAng2) * sideLen, Math.sin(sideAng2) * sideLen);
      ctx.closePath();
      ctx.fill();
    }

    // Kim từ tính dao động nhẹ xung quanh hướng Bắc
    const needleWiggle = Math.sin((t || 0) * 3) * 0.08;
    ctx.save();
    ctx.rotate(needleWiggle);

    // Mũi kim hướng Bắc (màu đỏ thắm)
    ctx.fillStyle = '#e53e3e';
    ctx.strokeStyle = '#9b2c2c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#9b2c2c';
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(-4, 0);
    ctx.lineTo(0, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mũi kim hướng Nam (màu xanh sẫm)
    ctx.fillStyle = '#3182ce';
    ctx.strokeStyle = '#2b6cb0';
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2b6cb0';
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.lineTo(-4, 0);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Ốc chốt tâm bằng đồng & đá quý
    ctx.fillStyle = '#ecc94b';
    ctx.strokeStyle = '#521b05';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e53e3e';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, TAU);
    ctx.fill();

    ctx.restore();

    // Mặt kính phản quang hình vòng cung
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 34, -PI * 0.8, -PI * 0.1);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // 9. treasure_map (bản đồ kho báu da dê cổ)
  function drawTreasureMap(ctx, s) {
    ctx.save();
    ctx.translate(0, -50);

    // Bóng bản đồ
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 44, 55, 9, 0, 0, TAU);
    ctx.fill();

    // Tờ giấy da dê mép quăn rách răng cưa
    const parchmentGrad = ctx.createLinearGradient(-50, -40, 50, 40);
    parchmentGrad.addColorStop(0, '#fefcbf');
    parchmentGrad.addColorStop(0.5, '#f6e05e');
    parchmentGrad.addColorStop(1, '#d69e2e');

    ctx.fillStyle = '#eedcb2';
    ctx.strokeStyle = '#8c6838';
    ctx.lineWidth = 2;

    ctx.beginPath();
    // Mép quăn tự nhiên 4 cạnh
    ctx.moveTo(-50, -35);
    ctx.quadraticCurveTo(-20, -38, 20, -34);
    ctx.lineTo(52, -32);
    ctx.quadraticCurveTo(48, 0, 54, 32);
    ctx.quadraticCurveTo(15, 36, -25, 33);
    ctx.lineTo(-52, 35);
    ctx.quadraticCurveTo(-47, 5, -50, -35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Nếp cuộn mép giấy 2 đầu trái phải
    ctx.fillStyle = '#caa369';
    ctx.beginPath();
    ctx.ellipse(-51, 0, 4, 34, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(52, 0, 4, 32, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Bản đồ bờ biển hòn đảo cách điệu bên trong
    ctx.fillStyle = '#dcc290';
    ctx.strokeStyle = '#7c5828';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-25, -20);
    ctx.bezierCurveTo(-5, -28, 15, -24, 25, -10);
    ctx.bezierCurveTo(32, 2, 28, 22, 12, 24);
    ctx.bezierCurveTo(-8, 26, -28, 18, -32, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rặng núi tam giác mini trên đảo
    ctx.fillStyle = '#9c7542';
    ctx.strokeStyle = '#5a3d16';
    ctx.lineWidth = 1;
    const mountains = [[-18, -6], [-10, -12], [-3, -5]];
    mountains.forEach(([mx, my]) => {
      ctx.beginPath();
      ctx.moveTo(mx - 5, my + 6);
      ctx.lineTo(mx, my);
      ctx.lineTo(mx + 5, my + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // Cây dừa mini trên đảo
    ctx.strokeStyle = '#5a3d16';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-20, 14);
    ctx.quadraticCurveTo(-18, 8, -22, 4);
    ctx.stroke();
    ctx.fillStyle = '#4a6b32';
    ctx.beginPath();
    ctx.arc(-22, 4, 3, 0, TAU);
    ctx.fill();

    // Đường nét đứt hải trình dẫn tới kho báu
    ctx.strokeStyle = '#c53030';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(-38, 22);
    ctx.quadraticCurveTo(-20, 10, -5, 12);
    ctx.quadraticCurveTo(10, 15, 18, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dấu X đỏ tươi vị trí chôn kho báu
    ctx.strokeStyle = '#e53e3e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(13, -5);
    ctx.lineTo(23, 5);
    ctx.moveTo(23, -5);
    ctx.lineTo(13, 5);
    ctx.stroke();

    // Vòng tròn hoa tiêu 4 hướng nhỏ ở góc trái trên
    ctx.strokeStyle = '#8c6838';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-34, -22, 6, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-34, -28);
    ctx.lineTo(-34, -16);
    ctx.moveTo(-40, -22);
    ctx.lineTo(-28, -22);
    ctx.stroke();

    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // BACKGROUNDS
  // --------------------------------------------------------------------------

  // Ngày/đêm theo settings.time ('day' | 'night'); hoạt ảnh theo t (giây), không theo settings.time.
  function nightOf(s) {
    return Boolean(s && (s.night || s.time === 'night' || s.timeOfDay === 'night'));
  }

  // 1. foggy_harbor (Bến cảng mờ sương: ngày = sương xám sáng, đêm = xanh than + đèn lồng)
  function drawFoggyHarbor(ctx, s, t) {
    t = t || 0;
    const f = frameSpan(s);
    const width = f.x1 - f.x0;
    const isNight = nightOf(s);
    const gy = 810;
    const waterTop = gy - 220;
    const P = isNight ? {
      sky: ['#0f1726', '#1e293b', '#334155'],
      sun: null,
      ship: 'rgba(15, 23, 42, 0.65)',
      water: ['#1e293b', '#0f172a'],
      ripple: 'rgba(255, 255, 255, 0.08)',
      pier: ['#3e2c1e', '#2a1d13', '#180f09'],
      plank: '#180f09',
      post: '#2d1e13',
      fog: 'rgba(148, 163, 184, 0.22)',
      lamp: '#f59e0b'
    } : {
      sky: ['#b8c4cf', '#d3dbe2', '#e6ebef'],
      sun: 'rgba(255, 250, 235, 0.55)',
      ship: 'rgba(100, 116, 139, 0.45)',
      water: ['#8fa3b3', '#6b8193'],
      ripple: 'rgba(255, 255, 255, 0.35)',
      pier: ['#8a6a4c', '#6e5238', '#4f3a27'],
      plank: '#4f3a27',
      post: '#5c4330',
      fog: 'rgba(241, 245, 249, 0.55)',
      lamp: '#fde68a'
    };

    // Trời phủ kín tới mặt nước (không chừa khe giữa trời và nước)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, waterTop + 4);
    skyGrad.addColorStop(0, P.sky[0]);
    skyGrad.addColorStop(0.6, P.sky[1]);
    skyGrad.addColorStop(1, P.sky[2]);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(f.x0, 0, width, waterTop + 4);

    // Mặt trời mờ sau sương (ngày) / trăng mờ (đêm)
    const discX = f.x0 + width * 0.72;
    const disc = ctx.createRadialGradient(discX, 230, 4, discX, 230, 120);
    disc.addColorStop(0, isNight ? 'rgba(226, 232, 240, 0.55)' : P.sun);
    disc.addColorStop(0.25, isNight ? 'rgba(203, 213, 225, 0.18)' : 'rgba(255, 248, 225, 0.35)');
    disc.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = disc;
    ctx.fillRect(discX - 120, 110, 240, 240);
    ctx.fillStyle = isNight ? 'rgba(241, 245, 249, 0.7)' : 'rgba(255, 253, 240, 0.8)';
    ctx.beginPath();
    ctx.arc(discX, 230, isNight ? 18 : 26, 0, TAU);
    ctx.fill();

    // Bóng tàu xa trong sương (lặp theo khổ ngang)
    ctx.fillStyle = P.ship;
    for (let sx = f.x0 + 110; sx < f.x1; sx += 300) {
      ctx.beginPath();
      ctx.moveTo(sx - 30, waterTop - 20);
      ctx.lineTo(sx + 30, waterTop - 20);
      ctx.lineTo(sx + 20, waterTop);
      ctx.lineTo(sx - 20, waterTop);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(sx - 1.5, waterTop - 90, 3, 70);
      ctx.fillRect(sx - 15, waterTop - 60, 30, 2);
    }

    // Mặt nước phủ từ waterTop tới mặt cầu tàu
    const waterGrad = ctx.createLinearGradient(0, waterTop, 0, gy + 2);
    waterGrad.addColorStop(0, P.water[0]);
    waterGrad.addColorStop(1, P.water[1]);
    ctx.fillStyle = waterGrad;
    ctx.fillRect(f.x0, waterTop, width, gy - waterTop + 2);

    ctx.strokeStyle = P.ripple;
    ctx.lineWidth = 1.5;
    for (let wy = waterTop + 20; wy < gy; wy += 22) {
      const off = Math.sin(t * 0.8 + wy * 0.05) * 12;
      ctx.beginPath();
      ctx.moveTo(f.x0, wy);
      for (let wx = f.x0; wx <= f.x1; wx += 60) {
        ctx.quadraticCurveTo(wx + 30 + off, wy - 3, wx + 60, wy);
      }
      ctx.stroke();
    }

    // Cầu tàu ván gỗ (ground_y = 810) phủ tới đáy khung
    const pierGrad = ctx.createLinearGradient(0, gy, 0, 1024);
    pierGrad.addColorStop(0, P.pier[0]);
    pierGrad.addColorStop(0.3, P.pier[1]);
    pierGrad.addColorStop(1, P.pier[2]);
    ctx.fillStyle = pierGrad;
    ctx.fillRect(f.x0, gy, width, 1024 - gy);

    ctx.strokeStyle = P.plank;
    ctx.lineWidth = 2.5;
    for (let px = f.x0; px <= f.x1; px += 45) {
      ctx.beginPath();
      ctx.moveTo(px, gy);
      ctx.lineTo(px, 1024);
      ctx.stroke();
    }

    // Cọc buộc thuyền
    for (let cx = f.x0 + 30; cx <= f.x1; cx += 160) {
      ctx.fillStyle = P.post;
      ctx.strokeStyle = P.plank;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(cx - 10, gy - 45, 20, 50, [4, 4, 0, 0]);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#9c7542';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 10, gy - 25);
      ctx.lineTo(cx + 10, gy - 25);
      ctx.moveTo(cx - 10, gy - 18);
      ctx.lineTo(cx + 10, gy - 18);
      ctx.stroke();
    }

    // Cột đèn lồng (đêm sáng rực, ngày tắt)
    const lampX = f.x0 + width * 0.85;
    ctx.fillStyle = isNight ? '#1e293b' : '#334155';
    ctx.fillRect(lampX - 3, gy - 150, 6, 150);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lampX, gy - 150);
    ctx.lineTo(lampX - 18, gy - 165);
    ctx.lineTo(lampX - 18, gy - 155);
    ctx.stroke();
    ctx.fillStyle = isNight ? P.lamp : '#cbd5e1';
    ctx.fillRect(lampX - 24, gy - 155, 12, 16);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lampX - 24, gy - 155, 12, 16);
    if (isNight) {
      const halo = ctx.createRadialGradient(lampX - 18, gy - 147, 2, lampX - 18, gy - 147, 85);
      halo.addColorStop(0, 'rgba(245, 158, 11, 0.7)');
      halo.addColorStop(0.4, 'rgba(217, 119, 6, 0.25)');
      halo.addColorStop(1, 'rgba(217, 119, 6, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(lampX - 18, gy - 147, 85, 0, TAU);
      ctx.fill();
    }

    // Dải sương trôi chậm
    for (let i = 0; i < 3; i++) {
      const fy = waterTop - 60 + i * 70;
      const drift = Math.sin(t * 0.3 + i) * 30;
      const fogGrad = ctx.createLinearGradient(0, fy, 0, fy + 90);
      fogGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      fogGrad.addColorStop(0.5, P.fog);
      fogGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = fogGrad;
      ctx.fillRect(f.x0 + drift - 40, fy, width + 80, 90);
    }
  }

  // 2. radio_telescope_field (Cánh đồng chảo thiên văn: ngày = trời xanh đồng cỏ, đêm = ngân hà)
  function drawRadioTelescopeField(ctx, s, t) {
    t = t || 0;
    const f = frameSpan(s);
    const width = f.x1 - f.x0;
    const isNight = nightOf(s);
    const gy = 810;

    // Trời phủ kín tới mặt đất
    const skyGrad = ctx.createLinearGradient(0, 0, 0, gy + 2);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(0.4, '#0a0f29');
      skyGrad.addColorStop(0.8, '#1e1b4b');
      skyGrad.addColorStop(1, '#2e1065');
    } else {
      skyGrad.addColorStop(0, '#4f9ad8');
      skyGrad.addColorStop(0.55, '#8cc3ea');
      skyGrad.addColorStop(1, '#d6ecf7');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(f.x0, 0, width, gy + 2);

    if (isNight) {
      // Dải ngân hà
      const mwGrad = ctx.createLinearGradient(f.x0, 0, f.x1, gy - 200);
      mwGrad.addColorStop(0, 'rgba(168, 85, 247, 0)');
      mwGrad.addColorStop(0.4, 'rgba(192, 132, 252, 0.18)');
      mwGrad.addColorStop(0.5, 'rgba(232, 121, 249, 0.25)');
      mwGrad.addColorStop(0.6, 'rgba(129, 140, 248, 0.18)');
      mwGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = mwGrad;
      ctx.fillRect(f.x0, 0, width, gy - 150);
      // Sao tất định
      ctx.fillStyle = '#fff';
      const count = Math.round(90 * width / 576);
      for (let i = 0; i < count; i++) {
        const sx = f.x0 + ((i * 173 + 47) % width);
        const sy = (i * 97 + 23) % (gy - 220);
        const r = (i % 3 === 0) ? 1.8 : ((i % 5 === 0) ? 1.2 : 0.8);
        ctx.globalAlpha = 0.4 + ((i * 19) % 60) * 0.01;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    } else {
      // Mặt trời và mây trắng trôi
      const sunX = f.x0 + width * 0.22;
      const sun = ctx.createRadialGradient(sunX, 150, 10, sunX, 150, 110);
      sun.addColorStop(0, 'rgba(255, 251, 220, 0.95)');
      sun.addColorStop(0.3, 'rgba(255, 244, 190, 0.45)');
      sun.addColorStop(1, 'rgba(255, 244, 190, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(sunX - 110, 40, 220, 220);
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath();
      ctx.arc(sunX, 150, 30, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      for (let cx = f.x0 + 90; cx < f.x1; cx += 260) {
        const x = cx + Math.sin(t * 0.2 + cx) * 10;
        const y = 220 + ((cx * 7) % 90);
        for (const [dx, dy, rx, ry] of [[0, 0, 46, 16], [30, -10, 30, 16], [-28, -4, 24, 12]]) {
          ctx.beginPath();
          ctx.ellipse(x + dx, y + dy, rx, ry, 0, 0, TAU);
          ctx.fill();
        }
      }
    }

    // Dãy núi xa
    ctx.fillStyle = isNight ? '#0b1120' : '#7d98ad';
    ctx.beginPath();
    ctx.moveTo(f.x0, gy + 2);
    for (let mx = f.x0; mx <= f.x1 + 100; mx += 100) {
      const mh = Math.sin((mx - f.x0) * 0.008) * 45;
      ctx.lineTo(mx, gy - 160 - mh);
    }
    ctx.lineTo(f.x1, gy + 2);
    ctx.closePath();
    ctx.fill();

    // Hàng chảo ăng-ten xa
    ctx.fillStyle = isNight ? '#0f172a' : '#e2e8f0';
    ctx.strokeStyle = isNight ? '#0f172a' : '#64748b';
    ctx.lineWidth = 1;
    for (let tx = f.x0 + 70; tx <= f.x1; tx += 170) {
      ctx.fillRect(tx - 2, gy - 170, 4, 30);
      ctx.beginPath();
      ctx.ellipse(tx, gy - 175, 14, 5, -0.4, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(tx + 4, gy - 184, 2, 8);
    }

    // Đồi trung cảnh
    ctx.fillStyle = isNight ? '#141c2e' : '#7fae5b';
    ctx.beginPath();
    ctx.moveTo(f.x0, gy - 80);
    ctx.quadraticCurveTo(f.x0 + width * 0.4, gy - 120, f.x0 + width * 0.7, gy - 70);
    ctx.quadraticCurveTo(f.x0 + width * 0.9, gy - 40, f.x1, gy - 60);
    ctx.lineTo(f.x1, gy + 2);
    ctx.lineTo(f.x0, gy + 2);
    ctx.closePath();
    ctx.fill();

    // Đồng cỏ tiền cảnh (ground_y = 810) phủ tới đáy khung
    const groundGrad = ctx.createLinearGradient(0, gy, 0, 1024);
    if (isNight) {
      groundGrad.addColorStop(0, '#111827');
      groundGrad.addColorStop(0.4, '#0b0f19');
      groundGrad.addColorStop(1, '#030712');
    } else {
      groundGrad.addColorStop(0, '#6c9a48');
      groundGrad.addColorStop(0.5, '#5a853b');
      groundGrad.addColorStop(1, '#456b2c');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(f.x0, gy, width, 1024 - gy);

    // Đường sỏi bảo trì
    ctx.fillStyle = isNight ? '#1f2937' : '#b8a98c';
    ctx.beginPath();
    ctx.moveTo(f.x1 - 120, gy);
    ctx.lineTo(f.x1, gy);
    ctx.lineTo(f.x1, 1024);
    ctx.lineTo(f.x1 - 220, 1024);
    ctx.closePath();
    ctx.fill();

    // Đèn cảnh báo đỏ nhấp nháy (chỉ ban đêm)
    if (isNight && Math.sin(t * 4) > 0) {
      ctx.fillStyle = '#ef4444';
      for (let lx = f.x0 + 80; lx <= f.x1; lx += 220) {
        ctx.beginPath();
        ctx.arc(lx, gy - 6, 2.5, 0, TAU);
        ctx.fill();
      }
    }
  }

  // --------------------------------------------------------------------------
  // REGISTRATION
  // --------------------------------------------------------------------------
  RV.register({
    rigs: {
      cipher_manuscript: { draw(ctx, s, t) { drawCipherManuscript(ctx, s, t); } },
      twin_engine_plane: { draw(ctx, s, t) { drawTwinEnginePlane(ctx, s, t); } },
      ghost_ship: { draw(ctx, s, t) { drawGhostShip(ctx, s, t); } },
      abandoned_lighthouse: { draw(ctx, s, t) { drawAbandonedLighthouse(ctx, s, t); } },
      money_pit: { draw(ctx, s, t) { drawMoneyPit(ctx, s, t); } },
      phaistos_disk: { draw(ctx, s, t) { drawPhaistosDisk(ctx, s, t); } },
      radio_telescope: { draw(ctx, s, t) { drawRadioTelescope(ctx, s, t); } },
      antique_compass: { draw(ctx, s, t) { drawAntiqueCompass(ctx, s, t); } },
      treasure_map: { draw(ctx, s, t) { drawTreasureMap(ctx, s, t); } }
    },
    backgrounds: {
      foggy_harbor: {
        label: 'Foggy Harbor Pier',
        theme: 'water',
        ground_y: 810,
        draw: drawFoggyHarbor
      },
      radio_telescope_field: {
        label: 'Radio Telescope Observatory Field',
        theme: 'highland',
        ground_y: 810,
        draw: drawRadioTelescopeField
      }
    }
  });

})(typeof window !== 'undefined' ? window : globalThis);
