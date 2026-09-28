// =============================================================================
// GIAI ĐOẠN L — AN TOÀN VÀ PHÒNG CHỐNG THIÊN TAI (safety, disaster)
// Plan §21 & §32: Giao thông, Cháy, Nước, Động đất, Bão lũ, Cứu hộ khẩn cấp
// Rigs: traffic_light, crosswalk, traffic_cone, smoke_detector, fire_blanket,
//       swim_ring, rescue_buoy, radio, megaphone, sandbag
// Actions: wait_signal, crawl_low
// Tuân thủ 100% Zero-text: biển báo, nhãn mác dùng RemakeVector.kit.PICTOGRAMS
// =============================================================================

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') throw new Error('RemakeVector core engine must be loaded before engine packs.');

  const {
    path, line, ellipse, cylinder, taper, volume, tone, limb, mitten,
    INK, TAU, clamp, smooth, mix, PICTOGRAMS
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

  // ---------------------------------------------------------------------------
  // 1. VẼ RIGS CHI TIẾT
  // ---------------------------------------------------------------------------

  // 1.1 ĐÈN GIAO THÔNG (traffic_light)
  function drawTrafficLight(ctx, s, t) {
    const lightState = s.light || (Math.floor(t * 0.4) % 3 === 0 ? 'red' : (Math.floor(t * 0.4) % 3 === 1 ? 'yellow' : 'green'));
    const isPedestrian = s.pedestrian || s.style?.pedestrian;

    // Cột đèn
    const poleH = 130;
    path(ctx, `M -4 0 L -4 ${-poleH} L 4 ${-poleH} L 4 0 Z`, cylinder(ctx, -4, 4, '#475569'), INK, 1.6);
    // Đế cột
    drawPoly(ctx, [[-9, 0], [9, 0], [6, -8], [-6, -8]], '#334155', INK, 1.4);

    // Hộp đèn
    const boxW = isPedestrian ? 28 : 28;
    const boxH = isPedestrian ? 54 : 76;
    const boxY = -poleH - (isPedestrian ? 4 : 8);

    ctx.save();
    ctx.translate(0, boxY);

    // Vỏ hộp kim loại bo góc có gờ vàng/đen
    drawPoly(ctx, [
      [-boxW * 0.5, 0], [boxW * 0.5, 0],
      [boxW * 0.5, boxH], [-boxW * 0.5, boxH]
    ], '#1e293b', INK, 2.0);

    // Tấm chắn nắng viền sau
    drawPoly(ctx, [
      [-boxW * 0.5 - 4, -4], [boxW * 0.5 + 4, -4],
      [boxW * 0.5 + 4, boxH + 4], [-boxW * 0.5 - 4, boxH + 4]
    ], '#0f172a', INK, 1.2);
    // Lớp sơn hộp
    drawPoly(ctx, [
      [-boxW * 0.5, 0], [boxW * 0.5, 0],
      [boxW * 0.5, boxH], [-boxW * 0.5, boxH]
    ], '#1e293b', null);

    if (isPedestrian) {
      // Đèn người đi bộ: 2 mắt (Đỏ đứng, Xanh đi)
      const redY = 15;
      const greenY = 39;

      // Nền đèn đỏ
      ellipse(ctx, 0, redY, 9, 9, lightState === 'red' ? '#450a0a' : '#1e1b4b', INK, 1.2);
      if (lightState === 'red') {
        ctx.save();
        ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 12;
        ellipse(ctx, 0, redY, 8.5, 8.5, '#ef4444', null);
        ctx.restore();
        // Hình người đứng chờ
        ellipse(ctx, 0, redY - 3, 2.2, 2.2, '#ffffff', null);
        line(ctx, [[0, redY - 1], [0, redY + 4]], '#ffffff', 2.0);
      } else {
        ellipse(ctx, 0, redY - 3, 2.2, 2.2, '#7f1d1d', null);
        line(ctx, [[0, redY - 1], [0, redY + 4]], '#7f1d1d', 2.0);
      }

      // Nền đèn xanh
      ellipse(ctx, 0, greenY, 9, 9, lightState === 'green' ? '#022c22' : '#0f172a', INK, 1.2);
      if (lightState === 'green') {
        ctx.save();
        ctx.shadowColor = '#10b981'; ctx.shadowBlur = 12;
        ellipse(ctx, 0, greenY, 8.5, 8.5, '#10b981', null);
        ctx.restore();
        // Hình người bước đi
        ellipse(ctx, 0, greenY - 3, 2.2, 2.2, '#ffffff', null);
        line(ctx, [[0, greenY - 1], [1, greenY + 2]], '#ffffff', 2.0);
        line(ctx, [[1, greenY + 2], [-2, greenY + 5]], '#ffffff', 1.6);
        line(ctx, [[1, greenY + 2], [3, greenY + 5]], '#ffffff', 1.6);
      } else {
        ellipse(ctx, 0, greenY - 3, 2.2, 2.2, '#064e3b', null);
        line(ctx, [[0, greenY - 1], [1, greenY + 2]], '#064e3b', 2.0);
      }
    } else {
      // Đèn 3 màu chuẩn: Đỏ, Vàng, Xanh
      const positions = [
        { id: 'red', y: 15, activeCol: '#ef4444', dimCol: '#450a0a', glow: '#fca5a5' },
        { id: 'yellow', y: 38, activeCol: '#f59e0b', dimCol: '#451a03', glow: '#fde68a' },
        { id: 'green', y: 61, activeCol: '#10b981', dimCol: '#022c22', glow: '#6ee7b7' }
      ];

      for (const pos of positions) {
        const active = lightState === pos.id;
        // Mái che lens
        path(ctx, `M -11 ${pos.y - 2} Q 0 ${pos.y - 12} 11 ${pos.y - 2} L 11 ${pos.y - 6} Q 0 ${pos.y - 14} -11 ${pos.y - 6} Z`, '#0f172a', INK, 1.0);

        // Vành đèn
        ellipse(ctx, 0, pos.y, 9, 9, '#090d16', INK, 1.2);

        if (active) {
          ctx.save();
          ctx.shadowColor = pos.activeCol; ctx.shadowBlur = 14;
          ellipse(ctx, 0, pos.y, 8.5, 8.5, pos.activeCol, null);
          ctx.restore();
          // Tâm sáng bóng đèn
          ellipse(ctx, -2, pos.y - 2, 3, 2.5, pos.glow, null);
        } else {
          ellipse(ctx, 0, pos.y, 8, 8, pos.dimCol, null);
        }
      }
    }

    ctx.restore();
  }

  // 1.2 VẠCH SANG ĐƯỜNG NGƯỜI ĐI BỘ (crosswalk)
  function drawCrosswalk(ctx, s, t) {
    const w = 180;
    const h = 42;
    const stripes = s.stripes || 7;

    // Mặt đường asphalt tương phản
    drawPoly(ctx, [
      [-w * 0.5, 0], [w * 0.5, 0],
      [w * 0.52, -h], [-w * 0.52, -h]
    ], '#334155', null);

    // Các vạch kẻ trắng sọc ngựa vằn
    const stripeW = (w / stripes) * 0.62;
    const step = w / stripes;
    for (let i = 0; i < stripes; i++) {
      const cx = -w * 0.5 + step * (i + 0.5);
      drawPoly(ctx, [
        [cx - stripeW * 0.5, -2], [cx + stripeW * 0.5, -2],
        [cx + stripeW * 0.55, -h + 2], [cx - stripeW * 0.55, -h + 2]
      ], '#f8fafc', '#94a3b8', 1.0);
    }
  }

  // 1.3 CỌC TIÊU PHẢN QUANG (traffic_cone)
  function drawTrafficCone(ctx, s, t) {
    const h = 48;
    const baseW = 34;

    // Bóng đổ
    ellipse(ctx, 0, 0, baseW * 0.6, 4, 'rgba(0,0,0,0.25)', null);

    // Đế cao su vuông màu đen
    drawPoly(ctx, [
      [-baseW * 0.5, 0], [baseW * 0.5, 0],
      [baseW * 0.45, -6], [-baseW * 0.45, -6]
    ], '#1e293b', INK, 1.6);

    // Thân nón màu cam
    drawPoly(ctx, [
      [-12, -6], [12, -6],
      [3.5, -h], [-3.5, -h]
    ], '#f97316', INK, 1.8);

    // Chóp tròn đỉnh
    ellipse(ctx, 0, -h, 3.5, 2, '#f97316', INK, 1.2);

    // Dải phản quang trắng số 1 (dưới)
    const y1 = -15, y2 = -23;
    const w1 = mix(12, 3.5, (y1 + 6) / (-h + 6));
    const w2 = mix(12, 3.5, (y2 + 6) / (-h + 6));
    drawPoly(ctx, [
      [-w1, y1], [w1, y1],
      [w2, y2], [-w2, y2]
    ], '#f8fafc', INK, 1.2);

    // Dải phản quang trắng số 2 (trên)
    const y3 = -29, y4 = -37;
    const w3 = mix(12, 3.5, (y3 + 6) / (-h + 6));
    const w4 = mix(12, 3.5, (y4 + 6) / (-h + 6));
    drawPoly(ctx, [
      [-w3, y3], [w3, y3],
      [w4, y4], [-w4, y4]
    ], '#f8fafc', INK, 1.2);

    // Vạch bóng sáng dọc
    ctx.beginPath();
    ctx.moveTo(-5, -8);
    ctx.lineTo(-1.5, -h + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // 1.4 THIẾT BỊ BÁO KHÓI (smoke_detector)
  function drawSmokeDetector(ctx, s, t) {
    const r = 20;
    const isAlarm = s.alarm || false;
    const isTest = s.test || false;

    // Vành đế gắn tường/trần
    ellipse(ctx, 0, -r, r * 1.08, r * 0.35, '#cbd5e1', INK, 1.4);
    // Vỏ hộp tròn
    ellipse(ctx, 0, -r * 0.75, r, r * 0.8, volume(ctx, 0, -r * 0.75, r, r * 0.8, '#f8fafc'), INK, 1.8);

    // Khe cảm biến khói
    for (let i = -2; i <= 2; i++) {
      line(ctx, [[i * 4, -r * 1.1], [i * 4, -r * 0.5]], '#94a3b8', 1.2);
    }

    // Nút kiểm tra Test ở giữa
    ellipse(ctx, 0, -r * 0.75, 4.5, 4.0, '#e2e8f0', INK, 1.0);

    // Đèn LED chỉ thị
    const ledColor = isAlarm ? '#ef4444' : (isTest ? '#22c55e' : ((Math.sin(t * 3) > 0.7) ? '#22c55e' : '#94a3b8'));
    if (isAlarm) {
      ctx.save();
      ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10;
      ellipse(ctx, 0, -r * 0.75, 3, 3, '#ef4444', null);
      ctx.restore();
      // Vòng sóng âm thanh báo động
      for (let wave = 1; wave <= 2; wave++) {
        const waveR = r + wave * 9 + (t * 20) % 8;
        ctx.beginPath();
        ctx.arc(0, -r * 0.75, waveR, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.7 - wave * 0.25})`;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    } else {
      ellipse(ctx, 0, -r * 0.75, 2.2, 2.2, ledColor, null);
    }
  }

  // 1.5 CHĂN CHỐNG CHÁY CỨU HỎA (fire_blanket)
  function drawFireBlanket(ctx, s, t) {
    const w = 32;
    const h = 48;

    ellipse(ctx, 0, 0, w * 0.5, 3, 'rgba(0,0,0,0.2)', null);

    // Hộp đỏ đựng chăn
    drawPoly(ctx, [
      [-w * 0.5, 0], [w * 0.5, 0],
      [w * 0.5, -h], [-w * 0.5, -h]
    ], '#dc2626', INK, 2.0);

    // Khung viền trắng an toàn
    drawPoly(ctx, [
      [-w * 0.42, -4], [w * 0.42, -4],
      [w * 0.42, -h + 4], [-w * 0.42, -h + 4]
    ], null, '#ffffff', 1.4);

    // Biểu tượng pictogram ngọn lửa trắng dập tắt
    path(ctx, `M 0 ${-h * 0.65} Q 6 ${-h * 0.45} 3 ${-h * 0.3} Q 0 ${-h * 0.4} -3 ${-h * 0.3} Q -6 ${-h * 0.45} 0 ${-h * 0.65} Z`, '#ffffff', null);
    // Vạch chăn trùm dập lửa
    line(ctx, [[-8, -h * 0.26], [8, -h * 0.26]], '#ffffff', 2.0);

    // 2 dây giật nylon đen thò ra dưới đáy
    line(ctx, [[-5, 0], [-5, 8]], '#0f172a', 2.8);
    line(ctx, [[5, 0], [5, 8]], '#0f172a', 2.8);
  }

  // 1.6 PHAO BƠI TRÒN TRẺ EM (swim_ring)
  function drawSwimRing(ctx, s, t) {
    const rx = 30;
    const ry = 18;

    ellipse(ctx, 0, 0, rx * 1.05, ry * 0.5, 'rgba(0,0,0,0.25)', null);

    // Vành ngoài phao
    ellipse(ctx, 0, -ry, rx, ry, '#f43f5e', INK, 2.0);

    // Các sọc trắng đối xứng
    ctx.save();
    ctx.translate(0, -ry);
    // Sọc trắng trái và phải
    path(ctx, `M ${-rx * 0.8} ${-ry * 0.3} Q ${-rx * 0.6} 0 ${-rx * 0.8} ${ry * 0.3} L ${-rx * 0.45} ${ry * 0.5} Q ${-rx * 0.3} 0 ${-rx * 0.45} ${-ry * 0.5} Z`, '#fffbeb', INK, 1.2);
    path(ctx, `M ${rx * 0.8} ${-ry * 0.3} Q ${rx * 0.6} 0 ${rx * 0.8} ${ry * 0.3} L ${rx * 0.45} ${ry * 0.5} Q ${rx * 0.3} 0 ${rx * 0.45} ${-ry * 0.5} Z`, '#fffbeb', INK, 1.2);
    ctx.restore();

    // Lỗ thủng bên trong phao
    ellipse(ctx, 0, -ry, rx * 0.44, ry * 0.44, '#38bdf8', INK, 1.6);
    // Bóng đổ trong vành
    ellipse(ctx, 0, -ry + 2, rx * 0.38, ry * 0.32, 'rgba(0,0,0,0.18)', null);
  }

  // 1.7 PHAO CỨU SINH CHUYÊN DỤNG (rescue_buoy)
  function drawRescueBuoy(ctx, s, t) {
    const r = 26;

    ellipse(ctx, 0, 0, r * 1.1, 4, 'rgba(0,0,0,0.25)', null);

    ctx.save();
    ctx.translate(0, -r);

    // Vòng tròn phao SOLAS màu cam cứu nạn
    ellipse(ctx, 0, 0, r, r, '#ea580c', INK, 2.2);

    // 4 dải băng phản quang trắng ở 4 góc 90 độ
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * 90 * Math.PI) / 180);
      drawPoly(ctx, [
        [-5, -r + 1], [5, -r + 1],
        [4, -r + 10], [-4, -r + 10]
      ], '#ffffff', INK, 1.0);
      ctx.restore();
    }

    // Lỗ rỗng giữa phao
    ellipse(ctx, 0, 0, r * 0.48, r * 0.48, '#e0f2fe', INK, 2.0);

    // Dây thừng cứu hộ viền quanh qua 4 khoen giữ
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * 90 + 45) * Math.PI / 180);
      ellipse(ctx, 0, -r - 1, 3, 2, '#1e293b', null);
      // Dây chùng võng ra ngoài
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, -0.35, 0.35);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.0;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // 1.8 ĐÀI RADIO KHẨN CẤP QUAY TAY (radio)
  function drawRadio(ctx, s, t) {
    const w = 50;
    const h = 34;

    ellipse(ctx, 0, 0, w * 0.6, 3, 'rgba(0,0,0,0.25)', null);

    // Thân radio màu vàng cứu hộ viền cao su đen chống sốc
    drawPoly(ctx, [
      [-w * 0.5, 0], [w * 0.5, 0],
      [w * 0.5, -h], [-w * 0.5, -h]
    ], '#eab308', INK, 2.0);

    // Ốp cao su bảo vệ 4 góc
    drawPoly(ctx, [[-w * 0.5, 0], [-w * 0.5 + 8, 0], [-w * 0.5, -8]], '#1e293b', null);
    drawPoly(ctx, [[w * 0.5, 0], [w * 0.5 - 8, 0], [w * 0.5, -8]], '#1e293b', null);
    drawPoly(ctx, [[-w * 0.5, -h], [-w * 0.5 + 8, -h], [-w * 0.5, -h + 8]], '#1e293b', null);
    drawPoly(ctx, [[w * 0.5, -h], [w * 0.5 - 8, -h], [w * 0.5, -h + 8]], '#1e293b', null);

    // Lưới loa tròn bên trái
    ellipse(ctx, -12, -h * 0.5, 10, 10, '#334155', INK, 1.4);
    for (let rG = 3; rG <= 7; rG += 2) {
      ellipse(ctx, -12, -h * 0.5, rG, rG, null, '#64748b', 1.0);
    }

    // Mặt đồng hồ dò sóng AM/FM bên phải
    drawPoly(ctx, [
      [3, -h * 0.75], [20, -h * 0.75],
      [20, -h * 0.45], [3, -h * 0.45]
    ], '#f8fafc', INK, 1.0);
    // Vạch kim dò sóng màu đỏ
    const needleX = 5 + (Math.sin(t * 0.8) * 0.5 + 0.5) * 11;
    line(ctx, [[needleX, -h * 0.75], [needleX, -h * 0.45]], '#ef4444', 1.4);

    // Núm xoay điều chỉnh
    ellipse(ctx, 12, -h * 0.25, 4, 4, '#1e293b', INK, 1.0);

    // Tấm pin mặt trời trên đỉnh
    drawPoly(ctx, [
      [-14, -h], [14, -h],
      [12, -h - 3], [-12, -h - 3]
    ], '#0f172a', INK, 1.0);

    // Cần ăng-ten kim loại vươn chéo góc phải
    line(ctx, [[18, -h], [24, -h - 22]], '#94a3b8', 1.8);
    ellipse(ctx, 24, -h - 22, 1.8, 1.8, '#ef4444', null);
  }

  // 1.9 LOA PHÓNG THANH CẦM TAY (megaphone)
  function drawMegaphone(ctx, s, t) {
    const isSpeaking = s.speaking || s.active;

    ellipse(ctx, 0, 0, 20, 3, 'rgba(0,0,0,0.2)', null);

    ctx.save();
    ctx.translate(-5, -18);

    // Nón loa màu trắng viền đỏ
    drawPoly(ctx, [
      [0, -4], [0, 4],
      [26, 12], [26, -12]
    ], '#f8fafc', INK, 1.8);

    // Vành miệng loa đỏ
    ellipse(ctx, 26, 0, 4, 12, '#dc2626', INK, 1.6);

    // Thân sau màu đỏ
    drawPoly(ctx, [
      [-10, -5], [0, -4],
      [0, 4], [-10, 5]
    ], '#dc2626', INK, 1.6);
    ellipse(ctx, -10, 0, 2.5, 5, '#991b1b', INK, 1.2);

    // Tay cầm báng súng có cò bấm
    drawPoly(ctx, [
      [-6, 4], [-2, 4],
      [-5, 16], [-9, 16]
    ], '#dc2626', INK, 1.4);
    // Cò bấm
    line(ctx, [[-2, 7], [-2, 11]], '#1e293b', 2.0);

    // Vạch sóng âm nếu đang nói
    if (isSpeaking) {
      for (let i = 1; i <= 3; i++) {
        const rad = 14 + i * 8 + (t * 15) % 6;
        ctx.beginPath();
        ctx.arc(26, 0, rad, -0.45, 0.45);
        ctx.strokeStyle = `rgba(59, 130, 246, ${0.8 - i * 0.22})`;
        ctx.lineWidth = 2.0;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // 1.10 BAO CÁT CHỐNG LŨ (sandbag)
  function drawSandbag(ctx, s, t) {
    const count = s.count || 1;
    const w = 46;
    const h = 20;

    ellipse(ctx, 0, 0, w * 0.6, 3, 'rgba(0,0,0,0.25)', null);

    function drawSingleBag(bx, by) {
      ctx.save();
      ctx.translate(bx, by);
      // Thân bao tải căng tròn dưới trọng lực
      path(ctx, `M ${-w * 0.45} 0 Q 0 4 ${w * 0.45} 0 Q ${w * 0.48} ${-h * 0.5} ${w * 0.4} ${-h} Q 0 ${-h - 2} ${-w * 0.4} ${-h} Q ${-w * 0.48} ${-h * 0.5} ${-w * 0.45} 0 Z`, '#a38257', INK, 1.8);
      // Vệt sọc sợi đay
      line(ctx, [[-w * 0.3, -h * 0.4], [w * 0.3, -h * 0.4]], '#85663e', 1.2);
      line(ctx, [[-w * 0.25, -h * 0.7], [w * 0.25, -h * 0.7]], '#85663e', 1.2);
      // Đầu bao thắt túm dây bên góc phải
      drawPoly(ctx, [
        [w * 0.38, -h + 2], [w * 0.48, -h - 4],
        [w * 0.44, -h + 6]
      ], '#85663e', INK, 1.0);
      ellipse(ctx, w * 0.4, -h + 2, 2.5, 2.5, '#ffffff', null); // Nút thắt trắng
      ctx.restore();
    }

    if (count === 1) {
      drawSingleBag(0, 0);
    } else if (count === 2) {
      drawSingleBag(-12, 0);
      drawSingleBag(12, 0);
    } else {
      // 3 bao xếp hình tam giác đê chắn sóng
      drawSingleBag(-20, 0);
      drawSingleBag(20, 0);
      drawSingleBag(0, -h * 0.85);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. RIG REGISTRY VỚI ANCHORS CHUẨN
  // ---------------------------------------------------------------------------

  const rigs = {
    traffic_light: {
      group: 'tool',
      topics: ['safety', 'city'],
      anchors: {
        root: [0, 0],
        top: [0, -135],
        light_red: [0, -112],
        light_yellow: [0, -95],
        light_green: [0, -78],
        housing: [0, -95]
      },
      draw: drawTrafficLight
    },
    crosswalk: {
      group: 'prop',
      topics: ['safety', 'city'],
      anchors: {
        root: [0, 0],
        center: [0, -20],
        start: [-90, -20],
        end: [90, -20]
      },
      draw: drawCrosswalk
    },
    traffic_cone: {
      group: 'tool',
      topics: ['safety', 'city'],
      anchors: {
        root: [0, 0],
        top: [0, -48],
        center: [0, -24],
        grip: [0, -24]
      },
      draw: drawTrafficCone
    },
    smoke_detector: {
      group: 'prop',
      topics: ['safety', 'daily'],
      anchors: {
        root: [0, 0],
        mount: [0, -32],
        center: [0, -16],
        led: [0, -16]
      },
      draw: drawSmokeDetector
    },
    fire_blanket: {
      group: 'prop',
      topics: ['safety', 'daily'],
      anchors: {
        root: [0, 0],
        center: [0, -25],
        mount: [0, -50],
        pull_tabs: [0, -2],
        grip: [0, -25]
      },
      draw: drawFireBlanket
    },
    swim_ring: {
      group: 'prop',
      topics: ['safety', 'daily'],
      anchors: {
        root: [0, 0],
        center: [0, -22],
        grip: [0, -22],
        grip_l: [-24, -22],
        grip_r: [24, -22],
        float: [0, -22]
      },
      draw: drawSwimRing
    },
    rescue_buoy: {
      group: 'prop',
      topics: ['safety', 'daily'],
      anchors: {
        root: [0, 0],
        center: [0, -28],
        grip: [0, -28],
        grip_l: [-26, -28],
        grip_r: [26, -28],
        rope: [0, -4]
      },
      draw: drawRescueBuoy
    },
    radio: {
      group: 'prop',
      topics: ['safety', 'daily'],
      anchors: {
        root: [0, 0],
        center: [0, -22],
        grip: [0, -22],
        antenna: [18, -55]
      },
      draw: drawRadio
    },
    megaphone: {
      group: 'prop',
      topics: ['safety', 'city'],
      anchors: {
        root: [0, 0],
        grip: [-10, -12],
        nozzle: [22, -22],
        center: [0, -20]
      },
      draw: drawMegaphone
    },
    sandbag: {
      group: 'prop',
      topics: ['safety', 'nature'],
      anchors: {
        root: [0, 0],
        center: [0, -12],
        grip: [0, -12],
        top: [0, -25]
      },
      draw: drawSandbag
    }
  };

  // ---------------------------------------------------------------------------
  // 3. ACTION HOOKS: wait_signal & crawl_low
  // ---------------------------------------------------------------------------

  const actionHooks = {
    // 1. WAIT_SIGNAL: Đứng chờ tín hiệu giao thông, quan sát trái phải
    wait_signal(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      const target = states[a.target];
      if (!actor) return;

      // Nhìn trái nhìn phải kiểm tra đường
      const scan = Math.sin(t * 5);
      actor.eye_x = scan * 0.75;
      actor.head_tilt = scan * 2.5;

      // Quy tắc an toàn Nhật Bản: giơ tay cao khi qua đường
      const locale = a.locale || actor.locale;
      if (locale === 'jp') {
        actor.hand_r_y = -65;
        actor.hand_r_x = 12;
      }

      // Khi đèn xanh hoặc qua 60% thời lượng động tác, tiến bước qua đường
      const isGreen = target && target.light === 'green';
      if (isGreen || p > 0.6) {
        actor.walk = 1.0;
        actor.stride = t * 9;
        actor.x += 1.4;
      } else {
        actor.walk = 0;
      }
    },

    // 2. CRAWL_LOW: Bò thấp người dưới tầng khói trong diễn tập thoát hiểm
    crawl_low(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (!actor) return;

      actor.sit = 1.0; // Hạ thấp trọng tâm
      actor.lean = 0.65; // Cúi gập người tránh khói nóng phía trên

      // Tay trái bịt khăn/tay vào mũi miệng
      actor.hand_l_x = 0;
      actor.hand_l_y = -35;

      // Tay phải bò chống đất di chuyển
      actor.hand_r_x = 18 + Math.sin(t * 7) * 8;
      actor.hand_r_y = 6;

      // Bò tiến tới
      actor.walk = 1.0;
      actor.stride = t * 6;
      actor.x += 1.0;
    }
  };

  // ---------------------------------------------------------------------------
  // 4. ĐĂNG KÝ VỚI ENGINE
  // ---------------------------------------------------------------------------

  RemakeVector.register({
    rigs,
    actionHooks
  });

})();
