// remake_vector_packs/wildlife_weird.js — Nhóm R3: Sinh vật kỳ thú & siêu năng lực tự nhiên (wildlife_weird)
// 10 rigs: mantis_shrimp, tardigrade, axolotl, greenland_shark, electric_eel, bombardier_beetle, wood_frog, naked_mole_rat, archerfish, arctic_tern
// 1 background: micro_world (ground_y: 810, 7 weathers, day/night, ZERO text)

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
    tone,
    volume,
    mixColor,
    INK,
    TAU,
    clamp,
    smooth,
    mix,
    hash
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

  // =============================================================
  // 1. MANTIS SHRIMP (Tôm tít / Peacock Mantis Shrimp)
  // center: [0, -32], head: [28, -36], peacock jewel colors & dactyl club
  // =============================================================
  function drawMantisShrimp(ctx, s, t) {
    ctx.save();
    const punch = clamp(s.punch !== undefined ? s.punch : 0, 0, 1);
    const swim = Math.sin((t || 0) * 3) * 0.1;
    const punchCycle = Math.sin((t || 0) * 4);
    const punching = punch > 0.05 || punchCycle > 0.75;

    ctx.translate(0, -28 + swim * 4);

    // Chân bơi (Pleopods) dạng lông vũ dưới bụng
    for (let i = 0; i < 4; i++) {
      const px = -22 + i * 10;
      const pwave = Math.sin((t || 0) * 6 + i * 0.8) * 0.3;
      ctx.save();
      ctx.translate(px, 14);
      ctx.rotate(pwave);
      drawPoly(ctx, [[0, 0], [-4, 10], [4, 10]], '#ef4444', INK, 1.0);
      ctx.restore();
    }

    // Đuôi quạt (Telson) xòe sặc sỡ phía sau
    ctx.save();
    ctx.translate(-34, 4);
    drawPoly(ctx, [[0, 0], [-14, -10], [-18, 0], [-14, 10]], '#06b6d4', INK, 1.4);
    // Viền đỏ cam của đuôi
    path(ctx, 'M -14 -10 Q -20 0 -14 10', null, '#f97316', 2.0);
    ctx.restore();

    // Thân phân đốt giáp cầu vồng (Emerald green & electric cyan)
    const segments = [
      { x: -28, w: 10, col: '#10b981' },
      { x: -18, w: 12, col: '#059669' },
      { x: -6, w: 14, col: '#06b6d4' },
      { x: 8, w: 16, col: '#10b981' }
    ];
    for (const seg of segments) {
      ellipse(ctx, seg.x, 2, seg.w, 14, seg.col, INK, 1.4);
      // Viền đốm cam hai bên giáp
      ellipse(ctx, seg.x, 8, 2.5, 2.0, '#f97316', null);
    }

    // Mai ngực (Carapace) xanh ngọc rực rỡ
    ellipse(ctx, 16, -2, 14, 15, '#047857', INK, 1.8);
    ellipse(ctx, 18, -4, 8, 10, '#10b981', null);

    // Càng đập dactyl ("Hammer clubs")
    ctx.save();
    ctx.translate(22, 6);
    if (punching) {
      // Bung cú đấm siêu tốc về phía trước
      drawPoly(ctx, [[0, 0], [18, -4], [26, 4], [8, 8]], '#f97316', INK, 1.6);
      ellipse(ctx, 28, 4, 7, 7, '#ef4444', INK, 1.6);
      // Vòng bọt sóng xung kích mini (Cute cavitation bubble burst)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(38, 4, 8, 0, TAU);
      ctx.stroke();
      ellipse(ctx, 42, 0, 3, 3, '#ffffff', null);
    } else {
      // Càng gập gọn dưới ức sẵn sàng bung
      drawPoly(ctx, [[0, 0], [10, 8], [4, 16], [-4, 8]], '#f97316', INK, 1.6);
      ellipse(ctx, 8, 16, 6.5, 6.5, '#ef4444', INK, 1.6);
    }
    ctx.restore();

    // Đầu & mắt cuống linh hoạt (Trinocular compound eyes)
    ctx.save();
    ctx.translate(26, -14);
    // Cuống mắt
    line(ctx, 0, 4, 4, -8, '#10b981', 3.0);
    line(ctx, 6, 4, 10, -8, '#10b981', 3.0);
    // Mắt kép tròn đa sắc màu
    ellipse(ctx, 4, -10, 5, 5, '#fde047', INK, 1.2);
    ellipse(ctx, 4, -10, 2.5, 2.5, '#0f172a', null);
    line(ctx, 1.5, -10, 6.5, -10, '#f97316', 1.0);

    ellipse(ctx, 11, -9, 4.5, 4.5, '#fde047', INK, 1.2);
    ellipse(ctx, 11, -9, 2.2, 2.2, '#0f172a', null);

    // Râu xúc giác (Antennules)
    path(ctx, 'M 8 -4 Q 18 -12 28 -8', null, '#ef4444', 1.4);
    path(ctx, 'M 8 0 Q 18 2 26 8', null, '#f97316', 1.4);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 2. TARDIGRADE (Gấu nước / Water Bear, sinh vật bất tử)
  // center: [0, -32], head: [28, -32], plump segmented microbe
  // =============================================================
  function drawTardigrade(ctx, s, t) {
    ctx.save();
    const tun = clamp(s.tun !== undefined ? s.tun : 0, 0, 1);
    const pace = (t || 0) * 3;
    const bodyCol = '#cbd5e1';
    const bodyShade = '#94a3b8';
    const highlight = '#f1f5f9';

    ctx.translate(0, -28);

    if (tun > 0.4) {
      // Trạng thái kén bất tử (Tun state): co tròn thành một hạt bền vững
      ellipse(ctx, 0, 0, 22, 20, bodyCol, INK, 2.0);
      ellipse(ctx, -2, -2, 16, 14, highlight, null);
      ctx.restore();
      return;
    }

    // 4 cặp chân mập mạp có móng cong
    for (let i = 0; i < 4; i++) {
      const lx = -22 + i * 14;
      const legWave = Math.sin(pace + i * 1.2) * 5;
      // Chân
      ellipse(ctx, lx + legWave * 0.4, 18, 5.5, 8, bodyShade, INK, 1.2);
      // Chùm 4 móng vuốt li ti
      for (let c = -1.5; c <= 1.5; c += 1) {
        line(ctx, lx + legWave * 0.4 + c * 2, 24, lx + legWave * 0.4 + c * 2.5, 27, '#334155', 1.2);
      }
    }

    // Thân tròn 4 ngấn béo múp
    const segments = [-18, -6, 6, 18];
    for (const sx of segments) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(sx, 0, 14, 16, 0, 0, TAU);
      ctx.fillStyle = bodyCol;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Nếp gấp da mềm mại
      ellipse(ctx, sx - 2, -4, 8, 10, highlight, null);
      ctx.restore();
    }

    // Đầu hình nón & Mõm tròn hình ống hút (Snout)
    ctx.save();
    ctx.translate(26, 0);
    ellipse(ctx, 0, 0, 11, 12, bodyCol, INK, 1.6);
    // Miệng ống tròn
    ellipse(ctx, 9, 1, 4.5, 5.5, bodyShade, INK, 1.4);
    ellipse(ctx, 10, 1, 2.0, 2.5, '#1e293b', null);

    // Mắt chấm đen li ti
    ellipse(ctx, 4, -4, 1.6, 1.6, '#0f172a', null);
    ellipse(ctx, 4, -3.8, 0.5, 0.5, '#ffffff', null);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 3. AXOLOTL (Kỳ giông Axolotl, nụ cười tái sinh bất tận)
  // center: [0, -32], head: [26, -34], feathery pink gills
  // =============================================================
  function drawAxolotl(ctx, s, t) {
    ctx.save();
    const swim = Math.sin((t || 0) * 3) * 0.12;
    const gillWave = Math.sin((t || 0) * 4) * 0.15;
    const axoPink = '#fbcfe8';
    const axoDeepPink = '#f472b6';
    const gillCrimson = '#ec4899';

    ctx.translate(0, -30 + swim * 4);

    // Đuôi có vây lưng trong suốt uốn lượn
    ctx.save();
    ctx.translate(-30, 2);
    ctx.rotate(swim * 1.5);
    drawPoly(ctx, [[0, -12], [-22, 0], [0, 12]], 'rgba(244, 114, 182, 0.65)', INK, 1.4);
    ctx.restore();

    // Chân sau & chân trước nhỏ xíu bơi bơi
    ellipse(ctx, -14, 14, 4, 7, axoPink, INK, 1.1);
    ellipse(ctx, 12, 14, 4, 7, axoPink, INK, 1.1);

    // Thân mũm mĩm hồng hào
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-4, 0, 26, 14, 0, 0, TAU);
    ctx.fillStyle = axoPink;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Bụng sáng mềm mại
    ellipse(ctx, -2, 4, 18, 7, '#ffffff', null);
    ctx.restore();

    // Đầu tròn to dễ thương
    ctx.save();
    ctx.translate(22, -2);
    ellipse(ctx, 0, 0, 17, 15, axoPink, INK, 1.8);

    // 6 nhánh mang ngoài dạng lông vũ (External feathery gills)
    const gillAngles = [-0.6, -0.1, 0.4];
    for (const ang of gillAngles) {
      // Mang bên trên
      ctx.save();
      ctx.translate(-6, -6);
      ctx.rotate(ang + gillWave);
      line(ctx, 0, 0, 16, -10, gillCrimson, 2.6);
      for (let f = 4; f <= 16; f += 3) {
        line(ctx, f, -f * 0.6, f + 2, -f * 0.6 - 5, axoDeepPink, 1.5);
      }
      ctx.restore();

      // Mang bên dưới
      ctx.save();
      ctx.translate(-6, 6);
      ctx.rotate(-ang - gillWave);
      line(ctx, 0, 0, 14, 10, gillCrimson, 2.6);
      for (let f = 4; f <= 14; f += 3) {
        line(ctx, f, f * 0.7, f + 2, f * 0.7 + 4, axoDeepPink, 1.5);
      }
      ctx.restore();
    }

    // Đôi mắt tròn xoe đen láy
    ellipse(ctx, 4, -4, 3.2, 3.2, '#0f172a', null);
    ellipse(ctx, 3.2, -4.8, 1.0, 1.0, '#ffffff', null);

    // Nụ cười toét miệng siêu đáng yêu (Iconic axolotl smile)
    path(ctx, 'M 2 5 Q 9 10 16 5', null, INK, 1.6);

    // Đốm hồng má
    ellipse(ctx, 2, 2, 4.5, 3.0, 'rgba(236, 72, 153, 0.4)', null);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 4. GREENLAND SHARK (Cá mập Greenland, tuổi thọ 400 năm, float: true)
  // center: [0, -34], head: [44, -34], mottled dark cold giant
  // =============================================================
  function drawGreenlandShark(ctx, s, t) {
    ctx.save();
    const swim = clamp(s.swim !== undefined ? s.swim : 1);
    const slowWave = Math.sin((t || 0) * 1.4) * 0.08 * swim;
    const tailWave = Math.sin((t || 0) * 1.6) * 0.16 * swim;

    const sharkMottle = '#4b5563';
    const sharkDark = '#374151';

    ctx.translate(0, -32);
    ctx.rotate(slowWave);

    // Đuôi cá mập bơi chậm rãi uy nghi
    ctx.save();
    ctx.translate(-42, 0);
    ctx.rotate(tailWave);
    drawPoly(ctx, [[0, 0], [-12, -18], [-6, 0], [-12, 16], [0, 2]], sharkDark, INK, 1.6);
    ctx.restore();

    // Vây lưng tròn nhỏ (thích nghi biển băng giá sâu)
    drawPoly(ctx, [[-12, -12], [-6, -22], [4, -10]], sharkDark, INK, 1.4);
    drawPoly(ctx, [[14, -10], [18, -18], [24, -8]], sharkDark, INK, 1.2);

    // Thân cá mập đồ sộ, tròn như khúc gỗ
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(46, -1);
    ctx.bezierCurveTo(34, -18, 0, -20, -40, -1);
    ctx.bezierCurveTo(-20, 16, 16, 16, 46, -1);
    ctx.closePath();
    ctx.fillStyle = sharkMottle;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    // Đốm loang lổ trên da cá cổ đại
    const spots = [
      [-24, -6], [-16, 2], [-8, -8], [0, 4], [10, -6], [22, 2], [30, -5]
    ];
    for (const [sx, sy] of spots) {
      ellipse(ctx, sx, sy, 3.5, 2.5, sharkDark, null);
      ellipse(ctx, sx + 2, sy + 3, 1.5, 1.5, '#6b7280', null);
    }

    // 5 khe mang nhỏ
    for (let i = 0; i < 5; i++) {
      const gx = 18 - i * 3;
      path(ctx, `M ${gx} -3 Q ${gx - 0.8} 2 ${gx} 7`, null, '#1f2937', 1.2);
    }

    // Mắt nhỏ đục màu sữa (đặc trưng cá mập Greenland)
    ellipse(ctx, 36, -6, 2.4, 2.4, '#9ca3af', INK, 1.0);
    ellipse(ctx, 36, -6, 1.2, 1.2, '#d1d5db', null);
    // Điểm sáng đốm phát quang nhỏ cạnh mắt (Ký sinh trùng Ommatokoita phát quang dịu dàng)
    ellipse(ctx, 38, -4, 1.2, 1.2, '#38bdf8', null);

    // Mõm tròn tù
    path(ctx, 'M 44 3 Q 36 7 28 5', null, INK, 1.2);
    ctx.restore();

    // Vây ngực tròn ngắn
    ctx.save();
    ctx.translate(14, 4);
    ctx.rotate(0.2 + slowWave);
    drawPoly(ctx, [[0, 0], [-6, 18], [6, 20], [10, 4]], sharkDark, INK, 1.4);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 5. ELECTRIC EEL (Lươn điện, phát dòng điện 860V, float: true)
  // center: [0, -30], head: [46, -34], undulating anal fin & electric arcs
  // =============================================================
  function drawElectricEel(ctx, s, t) {
    ctx.save();
    const shock = clamp(s.shock !== undefined ? s.shock : 0, 0, 1);
    const wave = Math.sin((t || 0) * 3.5) * 0.14;
    const pulsing = shock > 0.1 || Math.sin((t || 0) * 4) > 0.6;

    const eelDark = '#1e293b';
    const eelOrange = '#f59e0b';

    ctx.translate(0, -28);

    // Vây hậu môn dài uốn lượn liên tục dọc toàn bộ thân dưới
    ctx.beginPath();
    ctx.moveTo(34, 4);
    for (let x = 34; x >= -46; x -= 4) {
      const fy = 6 + Math.sin(x * 0.18 - (t || 0) * 8) * 4.5;
      ctx.lineTo(x, fy);
    }
    ctx.lineTo(-46, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.fill();

    // Thân lươn thuôn dài hình trụ
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(48, -2);
    ctx.bezierCurveTo(34, -14, -10, -16, -48, -2);
    ctx.bezierCurveTo(-10, 12, 34, 10, 48, -2);
    ctx.closePath();
    ctx.fillStyle = eelDark;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Vệt cổ và ức màu vàng cam nổi bật
    ctx.beginPath();
    ctx.moveTo(46, -2);
    ctx.bezierCurveTo(38, 6, 24, 7, 10, 5);
    ctx.bezierCurveTo(24, 9, 38, 8, 46, -2);
    ctx.closePath();
    ctx.fillStyle = eelOrange;
    ctx.fill();

    // Mắt nhỏ
    ellipse(ctx, 42, -5, 2.0, 2.0, '#fef08a', INK, 0.8);
    ellipse(ctx, 42, -5, 1.0, 1.0, '#0f172a', null);

    // Miệng
    path(ctx, 'M 46 0 Q 40 3 36 1', null, INK, 1.2);
    ctx.restore();

    // Hiệu ứng tia điện phát sáng đáng yêu (Cute electric spark arcs, không đáng sợ)
    if (pulsing) {
      ctx.save();
      const sparkCol = '#fef08a';
      ctx.strokeStyle = sparkCol;
      ctx.lineWidth = 2.0;

      // Vòng hào quang xung điện
      for (let a = -30; a <= 30; a += 20) {
        const sy = Math.sin((t || 0) * 12 + a) * 8;
        ctx.beginPath();
        ctx.moveTo(a, sy - 14);
        ctx.lineTo(a + 4, sy - 20);
        ctx.lineTo(a - 2, sy - 24);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(a + 6, sy + 14);
        ctx.lineTo(a + 10, sy + 20);
        ctx.lineTo(a + 5, sy + 25);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  // =============================================================
  // 6. BOMBARDIER BEETLE (Bọ cánh cứng Bombardier, phun hóa chất sôi)
  // center: [0, -28], head: [28, -32], chemical steam puff
  // =============================================================
  function drawBombardierBeetle(ctx, s, t) {
    ctx.save();
    const spray = clamp(s.spray !== undefined ? s.spray : 0, 0, 1);
    const pace = (t || 0) * 4;
    const spraying = spray > 0.05 || Math.sin((t || 0) * 3) > 0.7;

    const beetleRed = '#ea580c';
    const elytraBlue = '#1e3a8a';
    const legDark = '#451a03';

    ctx.translate(0, -24);

    // 6 chân bọ phân đốt
    for (let i = 0; i < 3; i++) {
      const lx = -14 + i * 14;
      const step = Math.sin(pace + i * 2) * 4;
      // Chân
      path(ctx, `M ${lx} 6 L ${lx + step} 18 L ${lx + step + 6} 24`, null, legDark, 1.8);
      path(ctx, `M ${lx - 4} -6 L ${lx - 2 + step} -18 L ${lx + 4 + step} -24`, null, legDark, 1.8);
    }

    // Bụng và cánh cứng (Elytra) màu xanh lam ánh kim
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-10, 0, 18, 12, 0, 0, TAU);
    ctx.fillStyle = elytraBlue;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Rãnh giữa hai cánh cứng
    line(ctx, -26, 0, 6, 0, '#0f172a', 1.4);
    // Vệt bóng sáng ánh kim
    ellipse(ctx, -10, -4, 12, 3, 'rgba(147, 197, 253, 0.4)', null);
    ctx.restore();

    // Ngực (Thorax) màu cam đỏ
    ellipse(ctx, 12, 0, 8, 9, beetleRed, INK, 1.6);

    // Đầu & Râu bọ
    ctx.save();
    ctx.translate(22, 0);
    ellipse(ctx, 0, 0, 6, 6, beetleRed, INK, 1.5);
    // Mắt kép nhỏ
    ellipse(ctx, 2, -3, 1.8, 1.8, '#0f172a', null);

    // Đôi râu dài phân đoạn (Antennae)
    path(ctx, 'M 4 -2 Q 14 -12 22 -8', null, legDark, 1.5);
    path(ctx, 'M 4 2 Q 14 12 22 8', null, legDark, 1.5);
    ctx.restore();

    // Vòi đuôi phun hóa chất (Directional defensive nozzle)
    ctx.save();
    ctx.translate(-28, 0);
    ellipse(ctx, 0, 0, 3, 3, '#c2410c', INK, 1.0);

    // Đám mây hơi nóng xịt ra từ đuôi (Harmless, cute steam puff)
    if (spraying) {
      for (let p = 0; p < 4; p++) {
        const px = -8 - p * 8;
        const py = (p % 2 === 0 ? -4 : 4) + Math.sin(t * 8 + p) * 3;
        ellipse(ctx, px, py, 5 + p * 2, 4 + p * 2, 'rgba(226, 232, 240, 0.75)', null);
      }
    }
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 7. WOOD FROG (Ếch gỗ Alaska, đóng băng và hồi sinh)
  // center: [0, -24], head: [20, -32], freeze-thaw mask
  // =============================================================
  function drawWoodFrog(ctx, s, t) {
    ctx.save();
    const frozen = clamp(s.frozen !== undefined ? s.frozen : 0, 0, 1);
    const frogBrown = mixColor('#b45309', '#38bdf8', frozen * 0.6);
    const frogDark = mixColor('#78350f', '#0284c7', frozen * 0.6);
    const maskCol = mixColor('#292524', '#0f172a', frozen);

    ctx.translate(0, 0);

    // Chân sau gập cơ bắp hai bên
    drawPoly(ctx, [[-16, -18], [-28, -26], [-20, -2]], frogDark, INK, 2.0);
    drawPoly(ctx, [[-20, -2], [-26, 0], [-14, 0]], frogBrown, INK, 1.4);

    // Chân trước chống đất
    line(ctx, 14, -14, 16, 0, frogBrown, 3.0);
    drawPoly(ctx, [[12, 0], [16, -1], [20, 0]], frogBrown, INK, 1.2);

    // Thân ếch tròn béo
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -18, 22, 14, -0.05, 0, TAU);
    ctx.fillStyle = frogBrown;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Sọc bên hông
    path(ctx, 'M -14 -24 Q 0 -22 14 -22', null, frogDark, 1.8);
    ctx.restore();

    // Đầu ếch
    ctx.save();
    ctx.translate(16, -20);
    ellipse(ctx, 0, 0, 11, 9, frogBrown, INK, 1.6);

    // Vệt đen kiểu mặt nạ kẻ cướp qua mắt (Robber's mask)
    path(ctx, 'M -8 -4 L 8 -1 L 6 3 L -8 2 Z', maskCol, null);

    // Mắt lồi trên đỉnh đầu
    ellipse(ctx, 0, -8, 4.5, 4.5, frogBrown, INK, 1.2);
    if (frozen > 0.5) {
      // Mắt đóng băng mờ ảo màu xanh ngọc
      ellipse(ctx, 0, -8, 3.0, 3.0, '#bae6fd', null);
      ellipse(ctx, 0, -8, 1.2, 1.2, '#ffffff', null);
    } else {
      ellipse(ctx, 0, -8, 3.0, 3.0, '#f59e0b', null);
      ellipse(ctx, 0, -8, 1.8, 1.8, '#0f172a', null);
      ellipse(ctx, -0.8, -8.8, 0.8, 0.8, '#ffffff', null);
    }

    // Miệng ếch
    path(ctx, 'M 2 3 Q 6 5 10 2', null, INK, 1.2);
    ctx.restore();

    // Tinh thể băng lấp lánh khi đông đá (Ice crystals)
    if (frozen > 0.2) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      const crystals = [[-8, -26], [6, -28], [-14, -14], [4, -12]];
      for (const [cx, cy] of crystals) {
        line(ctx, cx - 3, cy, cx + 3, cy);
        line(ctx, cx, cy - 3, cx, cy + 3);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  // =============================================================
  // 8. NAKED MOLE-RAT (Chuột chũi trụi lông, da nhăn không ung thư)
  // center: [0, -22], head: [28, -28], wrinkled skin & outside teeth
  // =============================================================
  function drawNakedMoleRat(ctx, s, t) {
    ctx.save();
    const pace = (t || 0) * 3.5;
    const molePink = '#f5d0c5';
    const moleDark = '#e2a79b';

    ctx.translate(0, 0);

    // Đuôi ngắn xíu
    path(ctx, 'M -28 -14 Q -36 -12 -38 -6', null, moleDark, 2.2);

    // Chân ngắn
    const swing = Math.sin(pace) * 4;
    ellipse(ctx, -16 + swing, -3, 4, 6, molePink, INK, 1.2);
    ellipse(ctx, 16 - swing, -3, 4, 6, molePink, INK, 1.2);

    // Thân dài nhăn nheo mũm mĩm
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -18, 28, 13, 0, 0, TAU);
    ctx.fillStyle = molePink;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Các nếp nhăn da đặc trưng trên lưng
    for (let x = -20; x <= 16; x += 7) {
      path(ctx, `M ${x} -28 Q ${x + 2} -18 ${x} -8`, null, moleDark, 1.2);
    }
    ctx.restore();

    // Đầu chuột chũi
    ctx.save();
    ctx.translate(24, -18);
    ellipse(ctx, 0, 0, 12, 11, molePink, INK, 1.6);

    // Mắt thoái hóa cực nhỏ (chấm đen li ti)
    ellipse(ctx, 2, -4, 1.2, 1.2, '#0f172a', null);

    // Mũi hồng
    ellipse(ctx, 9, -1, 2.5, 2.5, '#f472b6', null);

    // Râu cảm giác (Sensory vibrissae)
    line(ctx, 8, -3, 16, -6, '#94a3b8', 1.0);
    line(ctx, 8, 0, 17, 0, '#94a3b8', 1.0);
    line(ctx, 8, 3, 16, 6, '#94a3b8', 1.0);

    // Răng cửa to bản chìa ra ngoài môi (Outside teeth)
    drawPoly(ctx, [[7, 2], [13, 5], [12, 10], [6, 6]], '#ffffff', INK, 1.1);
    line(ctx, 9, 3, 9, 8, '#cbd5e1', 1.0);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 9. ARCHERFISH (Cá phun nước, bắn rụng côn trùng, float: true)
  // center: [0, -32], head: [32, -36], water jet shooter
  // =============================================================
  function drawArcherfish(ctx, s, t) {
    ctx.save();
    const shoot = clamp(s.shoot !== undefined ? s.shoot : 0, 0, 1);
    const swim = Math.sin((t || 0) * 3) * 0.12;
    const shooting = shoot > 0.05 || Math.sin((t || 0) * 3.5) > 0.75;

    const fishSilver = '#cbd5e1';
    const fishDark = '#1e293b';

    ctx.translate(0, -30 + swim * 4);

    // Đuôi cá hình quạt
    ctx.save();
    ctx.translate(-36, 0);
    drawPoly(ctx, [[0, 0], [-14, -14], [-8, 0], [-14, 14]], fishSilver, INK, 1.4);
    ctx.restore();

    // Vây lưng & vây hậu môn phía sau
    drawPoly(ctx, [[-12, -18], [-22, -26], [-6, -18]], fishDark, INK, 1.2);
    drawPoly(ctx, [[-10, 16], [-20, 24], [-4, 16]], fishDark, INK, 1.2);

    // Thân cá lưng gù cao, dẹp hai bên
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(34, -4);
    ctx.bezierCurveTo(20, -24, -10, -22, -36, 0);
    ctx.bezierCurveTo(-10, 22, 18, 22, 34, -4);
    ctx.closePath();
    ctx.fillStyle = fishSilver;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 4 vạch đen thẳng đứng đặc trưng của cá mang rổ
    const bars = [
      [[-18, -14], [-16, 12]],
      [[-6, -18], [-4, 14]],
      [[6, -16], [[8, 12]]],
      [[18, -12], [20, 6]]
    ];
    for (const [p1, p2] of bars) {
      line(ctx, p1[0], p1[1], p2[0], p2[1], fishDark, 4.5);
    }

    // Mắt to đặt cao sát đỉnh đầu để ngắm bắn
    ellipse(ctx, 24, -10, 4.0, 4.0, '#facc15', INK, 1.1);
    ellipse(ctx, 24, -10, 2.2, 2.2, '#0f172a', null);
    ellipse(ctx, 23, -11, 0.8, 0.8, '#ffffff', null);

    // Miệng hướng chếch lên trên (Upturned lower jaw)
    drawPoly(ctx, [[30, -2], [36, -8], [34, 4]], fishSilver, INK, 1.2);
    ctx.restore();

    // Tia nước bắn vọt lên cao (Accurate high-pressure water jet stream)
    if (shooting) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(36, -8);
      ctx.lineTo(60, -38);
      ctx.stroke();

      // Giọt nước li ti ở đầu tia
      ellipse(ctx, 62, -40, 2.5, 2.5, '#38bdf8', null);
      ellipse(ctx, 65, -45, 1.8, 1.8, '#7dd3fc', null);
      ctx.restore();
    }

    ctx.restore();
  }

  // =============================================================
  // 10. ARCTIC TERN (Nhạn biển Bắc Cực, kỷ lục bay 70.000 km)
  // center: [0, -35], head: [16, -52], slender swallow-tail
  // =============================================================
  function drawArcticTern(ctx, s, t) {
    ctx.save();
    const fly = clamp(s.fly !== undefined ? s.fly : 0, 0, 1);
    const flap = Math.sin((t || 0) * 7) * 0.45 * fly;

    const ternWhite = '#f8fafc';
    const ternGrey = '#cbd5e1';
    const ternRed = '#ef4444';
    const capBlack = '#0f172a';

    ctx.translate(0, fly ? -22 + Math.sin((t || 0) * 3) * 6 : 0);

    // Chân đỏ nhỏ xíu nếu đứng đất
    if (!fly) {
      line(ctx, -2, -12, -4, 0, ternRed, 2.0);
      line(ctx, 6, -12, 4, 0, ternRed, 2.0);
      drawPoly(ctx, [[-7, 0], [-3, -1], [-1, 0]], ternRed, null);
      drawPoly(ctx, [[2, 0], [5, -1], [8, 0]], ternRed, null);
    }

    // Đuôi chẻ sâu hình đuôi én (Deeply forked streamers)
    drawPoly(ctx, [[-16, -32], [-38, -20], [-24, -28], [-38, -36]], ternWhite, INK, 1.4);

    // Thân thon gọn thanh mảnh
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -34, 18, 13, -0.15, 0, TAU);
    ctx.fillStyle = ternWhite;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // Đôi cánh dài nhọn chuyên bay lượn ngàn dặm
    ctx.save();
    ctx.translate(-2, -38);
    if (fly) {
      ctx.rotate(flap);
      drawPoly(ctx, [[0, 0], [-26, -30], [-42, -14], [-10, 4]], ternGrey, INK, 1.6);
      drawPoly(ctx, [[6, 0], [36, -30], [50, -14], [16, 4]], ternGrey, INK, 1.6);
    } else {
      drawPoly(ctx, [[2, 0], [-22, 16], [-10, 20], [8, 6]], ternGrey, INK, 1.4);
    }
    ctx.restore();

    // Đầu & Mũ đen bóng
    ctx.save();
    ctx.translate(14, -50);
    ellipse(ctx, 0, 0, 10, 9, ternWhite, INK, 1.6);

    // Mũ đen tuyền kéo từ trán qua gáy
    ctx.beginPath();
    ctx.arc(0, 0, 9.8, Math.PI * 0.9, Math.PI * 1.9, false);
    ctx.closePath();
    ctx.fillStyle = capBlack;
    ctx.fill();

    // Mỏ thẳng nhọn màu đỏ tươi (Coral-red beak)
    drawPoly(ctx, [[6, 0], [18, 2], [6, 4]], ternRed, INK, 1.1);

    // Mắt đen tròn
    ellipse(ctx, 2, 0, 2.2, 2.2, '#0f172a', null);
    ellipse(ctx, 1.5, -0.6, 0.7, 0.7, '#ffffff', null);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // BACKGROUND: MICRO_WORLD (Thế giới vi mô trong giọt nước)
  // ground_y: 810, 7 weathers, day/night, ZERO text
  // =============================================================

  function extRanges(x0, x1) {
    const out = [];
    if (x0 < 0) out.push([x0, 0]);
    if (x1 > 576) out.push([576, x1]);
    return out;
  }

  function scatterExt(ext, step, key, fn) {
    for (const [a, b] of ext) {
      let i = 0;
      for (let x = a + step * 0.5; x < b - step * 0.3; i++) {
        const r = RemakeVector.kit.seeded(`${key}:${Math.round(x)}`);
        fn(x, r, i);
        x += step * (0.7 + r * 0.6);
      }
    }
  }

  function drawMicroWorldBg(ctx, settings, t) {
    ctx.save();
    const sp = RemakeVector.kit.frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const isNight = Boolean(settings && (settings.night || settings.time === 'night' || settings.timeOfDay === 'night'));
    const groundY = (settings && settings.ground_y) || 810;

    // Không gian chất lỏng giọt nước phóng đại (Deep fluid medium)
    const fluidGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      fluidGrad.addColorStop(0, '#020617');
      fluidGrad.addColorStop(0.5, '#042f2e');
      fluidGrad.addColorStop(1, '#064e3b');
    } else {
      fluidGrad.addColorStop(0, '#083344');
      fluidGrad.addColorStop(0.4, '#0e7490');
      fluidGrad.addColorStop(0.8, '#14b8a6');
      fluidGrad.addColorStop(1, '#2dd4bf');
    }
    ctx.fillStyle = fluidGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Viền khúc xạ giọt nước cầu vồng (Droplet Meniscus Boundary)
    ctx.save();
    ctx.beginPath();
    ctx.arc(288, 380, 320, 0, TAU);
    ctx.strokeStyle = isNight ? 'rgba(45, 212, 191, 0.18)' : 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 18;
    ctx.stroke();
    ctx.restore();

    // Bong bóng vi mô khúc xạ nổi bồng bềnh
    function drawMicroBubble(bx, by, r) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(204, 251, 241, 0.4)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Điểm sáng khúc xạ
      ellipse(ctx, bx - r * 0.35, by - r * 0.35, r * 0.25, r * 0.2, '#ffffff', null);
      ctx.restore();
    }

    drawMicroBubble(140, 240, 24);
    drawMicroBubble(380, 180, 32);
    drawMicroBubble(480, 340, 18);
    drawMicroBubble(80, 480, 16);

    scatterExt(ext, 160, 'bubble', (x, r) => {
      drawMicroBubble(x, 150 + r * 350, 16 + r * 20);
    });

    // Tảo xoắn Spirogyra lượn sóng trong giọt nước
    ctx.save();
    for (let j = 0; j < 2; j++) {
      const startX = 60 + j * 320;
      ctx.beginPath();
      ctx.moveTo(startX, 60);
      for (let y = 60; y < groundY - 60; y += 30) {
        const sx = startX + Math.sin(y * 0.02 + (t || 0) * 1.5 + j) * 25;
        ctx.lineTo(sx, y);
      }
      ctx.strokeStyle = isNight ? 'rgba(5, 150, 105, 0.45)' : 'rgba(52, 211, 153, 0.6)';
      ctx.lineWidth = 12;
      ctx.stroke();
    }
    ctx.restore();

    // Tảo silic Diatom hình học phát quang
    function drawDiatom(dx, dy, size) {
      ctx.save();
      ctx.translate(dx, dy);
      ellipse(ctx, 0, 0, size, size * 0.5, 'rgba(254, 240, 138, 0.35)', 'rgba(250, 204, 21, 0.6)', 1.2);
      line(ctx, -size * 0.8, 0, size * 0.8, 0, 'rgba(250, 204, 21, 0.8)', 1.0);
      ctx.restore();
    }

    drawDiatom(240, 320, 26);
    drawDiatom(420, 460, 20);

    scatterExt(ext, 180, 'diatom', (x, r) => {
      drawDiatom(x, 200 + r * 260, 18 + r * 14);
    });

    // Thảm tế bào lục lạp / rêu vi mô ở đáy (Magnified chloroplast bed, ground_y: 810)
    const bedGrad = ctx.createLinearGradient(0, groundY - 40, 0, 1024);
    if (isNight) {
      bedGrad.addColorStop(0, '#064e3b');
      bedGrad.addColorStop(0.5, '#022c22');
      bedGrad.addColorStop(1, '#020617');
    } else {
      bedGrad.addColorStop(0, '#15803d');
      bedGrad.addColorStop(0.4, '#166534');
      bedGrad.addColorStop(1, '#14532d');
    }
    ctx.fillStyle = bedGrad;
    ctx.fillRect(X0, groundY - 30, X1 - X0, 1024 - (groundY - 30));

    // Các viên lục lạp (Chloroplast spheres) tròn xoe phát sáng trên nền
    for (let x = X0 + 15; x < X1; x += 28) {
      const cr = 8 + Math.sin(x * 0.1) * 3;
      ellipse(ctx, x, groundY - 20, cr, cr, isNight ? '#059669' : '#22c55e', null);
      ellipse(ctx, x - 2, groundY - 22, cr * 0.35, cr * 0.35, '#86efac', null);
    }

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION
  // =============================================================
  const WILDLIFE_WEIRD_RIGS = {
    mantis_shrimp: { draw(ctx, s, t) { drawMantisShrimp(ctx, s, t); } },
    tardigrade: { draw(ctx, s, t) { drawTardigrade(ctx, s, t); } },
    axolotl: { draw(ctx, s, t) { drawAxolotl(ctx, s, t); } },
    greenland_shark: { draw(ctx, s, t) { drawGreenlandShark(ctx, s, t); } },
    electric_eel: { draw(ctx, s, t) { drawElectricEel(ctx, s, t); } },
    bombardier_beetle: { draw(ctx, s, t) { drawBombardierBeetle(ctx, s, t); } },
    wood_frog: { draw(ctx, s, t) { drawWoodFrog(ctx, s, t); } },
    naked_mole_rat: { draw(ctx, s, t) { drawNakedMoleRat(ctx, s, t); } },
    archerfish: { draw(ctx, s, t) { drawArcherfish(ctx, s, t); } },
    arctic_tern: { draw(ctx, s, t) { drawArcticTern(ctx, s, t); } }
  };

  const WILDLIFE_WEIRD_BACKGROUNDS = {
    micro_world: {
      label: 'Thế giới giọt nước vi mô',
      theme: 'nature',
      ground_y: 810,
      draw(ctx, settings, t) { drawMicroWorldBg(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: WILDLIFE_WEIRD_RIGS,
    backgrounds: WILDLIFE_WEIRD_BACKGROUNDS
  });

})();
