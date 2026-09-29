// Remake Vector Engine Pack: Ancient History (Giai đoạn M)
// Thời kỳ đồ đá, Ai Cập cổ đại, Hy Lạp cổ đại, La Mã cổ đại và Con đường tơ lụa.
(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('ancient pack: RemakeVector core engine chưa được nạp.');
  }

  const {
    INK, TAU, tone, volume, taper, limb, mitten, leaf, blade,
    ellipse, path, line, withCut, hash, clamp, smooth, mix,
    FRUIT_BODIES, FRUIT_SEEDS, FRUIT_LIMBS
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

  function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, fill, stroke, width = 1) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x4, y4);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke && width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  // -------------------------------------------------------------
  // 1. OLIVE (Trái ô liu & hạt)
  // -------------------------------------------------------------
  function drawOliveBody(ctx, s, body, t) {
    const col = s.style?.body || '#556b2f';
    const d = `M 0 -76 C 20 -76 26 -52 26 -36 C 26 -16 16 0 0 2 C -16 0 -26 -16 -26 -36 C -26 -52 -20 -76 0 -76 Z`;
    path(ctx, d, volume(ctx, 4, -36, 26, 38, col, 0.35, -0.25), INK, 2.0);
    // Vệt bóng sáng mịn đặc trưng của quả ô liu bóng dầu
    ellipse(ctx, -8, -48, 4, 14, 'rgba(255,255,255,0.48)', null, 1, 0.2);
    // Cuống nhỏ và lá ô liu màu xanh bàng bạc
    path(ctx, `M 0 -76 L 0 -86`, null, INK, 3.2);
    path(ctx, `M 0 -76 L 0 -86`, null, '#4a5d2a', 2.0);
    leaf(ctx, 6, -82, 0.55, 0.55, '#738a5a');
  }

  function drawOliveSeeds(ctx, s, side, flesh) {
    ellipse(ctx, side * 6, -36, 11, 24, '#7a9644', null);
    // Hạt ô liu hình thoi nhọn hai đầu màu nâu gỗ
    ellipse(ctx, side * 5, -36, 4.5, 12, '#4a2c16', null, 1, side * 0.1);
  }

  // -------------------------------------------------------------
  // 2. CON VẬT: MAMMOTH & CAMEL
  // -------------------------------------------------------------

  // 2.1 MAMMOTH (Voi ma mút lông xoăn thời kỳ đồ đá)
  // Chân chạm y = 0, lưng gù cao, ngà cong dài vút lên, vòi cử động.
  function drawMammoth(ctx, s, t, cat) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const running = Boolean(s.running_away);
    const speed = running ? 12 : 6;
    const phase = running ? t * speed : stride;

    // Màu lông nâu sẫm ấm áp
    const furMain = s.style?.body || '#6a4524';
    const furDark = tone(furMain, -0.22);
    const furLight = tone(furMain, 0.22);
    const tuskCol = '#f5eedb';
    const tuskShade = '#d8cbaf';

    ctx.save();
    // Chân không lún dưới ground_y: y = 0 là đế chân
    // 4 chân cột trụ dày: 2 chân xa (near = 0)
    for (const [lx, off] of [[-28, 0], [22, Math.PI]]) {
      const legPhase = phase + off;
      const swing = Math.sin(legPhase) * (running ? 14 : 7 * walk);
      const lift = Math.max(0, -Math.cos(legPhase)) * (running ? 12 : 5 * walk);
      const fx = lx + swing, fy = -lift;
      // Khối chân sau
      quad(ctx, lx - 4, -38, lx + 4, -38, fx - 5.5, fy, fx + 5.5, fy, furDark, INK, 1.2);
      ellipse(ctx, fx, fy - 2, 7, 3, tone(furDark, -0.15), INK, 1.0);
    }

    // Đuôi nhỏ có túm lông rủ
    const tailWave = Math.sin(t * 3) * 0.15;
    path(ctx, `M -46 -54 Q ${-58 + tailWave * 10} -42 -52 -28`, null, furDark, 3.4);
    ellipse(ctx, -52 + tailWave * 10, -26, 4, 7, furDark, null, 1, 0.2);

    // Thân voi ma mút: lưng dốc từ bướu vai cao xuống mông
    // Đỉnh bướu vai ở x = 8, y = -82, mông ở x = -44, y = -62
    const bodyPath = `M -48 -58 C -52 -78 -24 -82 10 -84 C 28 -84 36 -74 38 -56 C 40 -36 24 -30 -6 -32 C -32 -34 -44 -40 -48 -58 Z`;
    path(ctx, bodyPath, volume(ctx, -6, -60, 48, 28, furMain, 0.35, -0.25), INK, 2.0);

    // Lông viền bụng xõa dài rủ xuống che nửa trên của chân
    ctx.save();
    ctx.fillStyle = furDark;
    for (let i = -5; i <= 4; i++) {
      const bx = i * 8, by = -32 + Math.sin(i * 1.4) * 2;
      path(ctx, `M ${bx - 5} ${by} L ${bx} ${by + 8} L ${bx + 5} ${by} Z`, furDark, null);
    }
    ctx.restore();

    // Ngà xa (lớp dưới đầu)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(34, -58);
    ctx.bezierCurveTo(58, -60, 78, -44, 74, -28);
    ctx.bezierCurveTo(72, -18, 62, -26, 56, -42);
    ctx.closePath();
    ctx.fillStyle = tuskShade;
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();

    // Đầu voi: đỉnh sọ nhô cao đặc trưng của voi ma mút
    const headPath = `M 18 -68 C 22 -88 44 -86 48 -70 C 52 -54 44 -46 32 -48 C 22 -48 16 -54 18 -68 Z`;
    path(ctx, headPath, volume(ctx, 32, -66, 16, 20, furMain, 0.35, -0.25), INK, 2.0);

    // Tai nhỏ nhiều lông (chống rét)
    ellipse(ctx, 16, -72, 5, 8, furDark, INK, 1.2, -0.3);

    // Mắt hiền hòa có viền mí và đốm sáng
    ellipse(ctx, 34, -70, 3.2, 3.2, '#1a1410', null);
    ellipse(ctx, 33, -71, 1.1, 1.1, '#ffffff', null);

    // Vòi voi: uốn lượn tự nhiên theo t
    const trunkWave = Math.sin(t * 3.5) * 6;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(44, -56);
    ctx.bezierCurveTo(56, -50, 62 + trunkWave * 0.4, -36, 58 + trunkWave, -22);
    ctx.bezierCurveTo(52 + trunkWave, -20, 48 + trunkWave * 0.6, -34, 40, -48);
    ctx.closePath();
    ctx.fillStyle = furMain;
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.restore();

    // Ngà gần (lớp trước đầu): cong vòng cung vút lên trời
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(36, -54);
    ctx.bezierCurveTo(64, -58, 86, -38, 82, -16);
    ctx.bezierCurveTo(80, -8, 68, -18, 60, -38);
    ctx.closePath();
    ctx.fillStyle = tuskCol;
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();

    // 2 chân gần (near = 1)
    for (const [lx, off] of [[-18, Math.PI], [32, 0]]) {
      const legPhase = phase + off;
      const swing = Math.sin(legPhase) * (running ? 14 : 7 * walk);
      const lift = Math.max(0, -Math.cos(legPhase)) * (running ? 12 : 5 * walk);
      const fx = lx + swing, fy = -lift;
      quad(ctx, lx - 4.5, -36, lx + 4.5, -36, fx - 6, fy, fx + 6, fy, furMain, INK, 1.4);
      ellipse(ctx, fx, fy - 2, 8, 3.5, tone(furMain, -0.15), INK, 1.1);
      // Móng chân voi tròn dẹt
      for (const mx of [-3.5, 0, 3.5]) {
        ellipse(ctx, fx + mx, fy - 1.2, 1.4, 1.2, '#ded4c0', null);
      }
    }

    ctx.restore();
  }

  // 2.2 CAMEL (Lạc đà hai bướu trên Con đường tơ lụa)
  // Hai bướu mềm, có yên đệm thổ cẩm ở giữa hai bướu (seat_1 tại x = 0, y = -68).
  function drawCamel(ctx, s, t, cat) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const bodyCol = s.style?.body || '#c6955a';
    const darkCol = tone(bodyCol, -0.2);
    const lightCol = tone(bodyCol, 0.22);

    ctx.save();

    // 2 chân xa (near = 0)
    for (const [lx, off] of [[-24, 0], [22, Math.PI]]) {
      const legPhase = stride + off;
      const swing = Math.sin(legPhase) * 6 * walk;
      const lift = Math.max(0, -Math.cos(legPhase)) * 4.5 * walk;
      const fx = lx + swing, fy = -lift;
      // Khớp đầu gối nổi
      quad(ctx, lx - 2.8, -42, lx + 2.8, -42, lx + swing * 0.5 - 2.4, -22, lx + swing * 0.5 + 2.4, -22, darkCol, INK, 1.0);
      quad(ctx, lx + swing * 0.5 - 2.4, -22, lx + swing * 0.5 + 2.4, -22, fx - 2.6, fy, fx + 2.6, fy, darkCol, INK, 1.0);
      ellipse(ctx, fx, fy - 1.5, 5, 2.5, '#4a3420', INK, 0.8);
    }

    // Đuôi lạc đà dài có túm lông đen nhỏ ở chóp
    const tailWave = Math.sin(t * 2.8) * 0.12;
    path(ctx, `M -36 -46 Q ${-46 + tailWave * 8} -32 -42 -18`, null, darkCol, 2.2);
    ellipse(ctx, -42 + tailWave * 8, -16, 2.6, 5, '#382618', null);

    // Thân và 2 bướu lạc đà
    // Bướu sau: x = -18, y = -76; bướu trước: x = 16, y = -76; lưng giữa: x = 0, y = -66
    const camelBody = `M -36 -48 C -38 -64 -28 -82 -18 -82 C -8 -82 -4 -68 0 -68 C 4 -68 8 -82 18 -82 C 28 -82 36 -64 34 -48 C 32 -34 16 -32 0 -32 C -18 -32 -34 -34 -36 -48 Z`;
    path(ctx, camelBody, volume(ctx, 0, -56, 36, 26, bodyCol, 0.35, -0.25), INK, 2.0);

    // Tấm đệm thảm thổ cẩm Con đường tơ lụa giữa hai bướu (chỗ ngồi seat_1)
    // Tấm thảm đỏ viền hoa văn vàng và tua rua xanh
    drawPoly(ctx, [[-12, -67], [12, -67], [14, -58], [-14, -58]], '#9e2a2b', INK, 1.2);
    line(ctx, [[-12, -63], [12, -63]], '#e9c46a', 1.4);
    // Tua rua mép thảm
    for (let tx = -11; tx <= 11; tx += 3.5) {
      line(ctx, [[tx, -58], [tx, -54]], '#264653', 1.2);
    }

    // Cổ dài uốn lượn hình chữ S mềm mại
    const neckPath = `M 22 -48 C 26 -60 30 -74 34 -82 C 38 -82 42 -76 38 -62 C 34 -52 30 -44 26 -44 Z`;
    path(ctx, neckPath, volume(ctx, 28, -64, 10, 22, bodyCol, 0.35, -0.2), INK, 1.8);

    // Đầu lạc đà: trán dô, mõm mềm
    const headPath = `M 30 -82 C 32 -94 44 -94 48 -86 C 52 -78 46 -74 38 -76 C 32 -76 30 -78 30 -82 Z`;
    path(ctx, headPath, volume(ctx, 40, -84, 10, 10, bodyCol, 0.35, -0.2), INK, 1.6);

    // Tai nhỏ dựng đứng
    ellipse(ctx, 32, -92, 2.4, 5, bodyCol, INK, 1.0, 0.2);

    // Mắt to có hàng mi dài bảo vệ khỏi bão cát
    ellipse(ctx, 38, -86, 2.4, 2.4, '#1c140e', null);
    ellipse(ctx, 37.5, -86.8, 0.8, 0.8, '#ffffff', null);
    line(ctx, [[36, -88], [40, -88]], '#1c140e', 1.2);

    // Lỗ mũi có nếp khép chống cát
    line(ctx, [[45, -82], [47, -81]], '#6a4a28', 1.2);

    // 2 chân gần (near = 1)
    for (const [lx, off] of [[-16, Math.PI], [30, 0]]) {
      const legPhase = stride + off;
      const swing = Math.sin(legPhase) * 6 * walk;
      const lift = Math.max(0, -Math.cos(legPhase)) * 4.5 * walk;
      const fx = lx + swing, fy = -lift;
      quad(ctx, lx - 3.2, -40, lx + 3.2, -40, lx + swing * 0.5 - 2.6, -20, lx + swing * 0.5 + 2.6, -20, bodyCol, INK, 1.2);
      quad(ctx, lx + swing * 0.5 - 2.6, -20, lx + swing * 0.5 + 2.6, -20, fx - 2.8, fy, fx + 2.8, fy, bodyCol, INK, 1.2);
      ellipse(ctx, fx, fy - 1.5, 5.5, 2.8, '#3d2b1a', INK, 1.0);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 3. VẬT THỂ & ĐẠO CỤ LỊCH SỬ CỔ ĐẠI
  // -------------------------------------------------------------

  // 3.1 STONE_BLOCK (Khối đá vôi kim tự tháp đẽo gọt)
  // Kích thước chuẩn: x: [-30, 30], y: [-36, 0].
  function drawStoneBlock(ctx, s, t, cat) {
    ctx.save();
    const w = 60, h = 36;
    const baseCol = s.style?.body || '#d6c8a5';
    const topCol = tone(baseCol, 0.2);
    const shadeCol = tone(baseCol, -0.22);

    // Mặt trước khối đá đẽo gọt phẳng
    ctx.fillStyle = baseCol;
    ctx.fillRect(-w * 0.5, -h, w, h);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
    ctx.strokeRect(-w * 0.5, -h, w, h);

    // Gờ vát 3D ở mép trên và mép bên
    drawPoly(ctx, [[-w * 0.5, -h], [w * 0.5, -h], [w * 0.5 - 4, -h + 4], [-w * 0.5 + 4, -h + 4]], topCol, null);
    drawPoly(ctx, [[w * 0.5 - 4, -h + 4], [w * 0.5, -h], [w * 0.5, 0], [w * 0.5 - 4, -4]], shadeCol, null);

    // Đường vân đục đá ngang tự nhiên của thợ Ai Cập
    line(ctx, [[-22, -26], [18, -26]], tone(baseCol, -0.14), 1.0);
    line(ctx, [[-16, -14], [24, -14]], tone(baseCol, -0.14), 1.0);
    line(ctx, [[-26, -8], [-2, -8]], tone(baseCol, -0.12), 1.0);

    ctx.restore();
  }

  // 3.2 SLEDGE (Xe trượt gỗ kéo đá Ai Cập)
  // Hai thanh trượt uốn cong phía trước chạm đất ở y = 0, sàn chở đá ở y = -14.
  function drawSledge(ctx, s, t, cat) {
    ctx.save();
    const woodCol = s.style?.body || '#8d633b';
    const darkWood = tone(woodCol, -0.22);
    const lightWood = tone(woodCol, 0.2);

    // Thanh trượt gỗ lớn uốn cong đầu (chạy dài từ x = -48 tới +48, cong lên ở đầu +52)
    ctx.beginPath();
    ctx.moveTo(-48, 0);
    ctx.lineTo(42, 0);
    ctx.quadraticCurveTo(52, 0, 52, -14);
    ctx.lineTo(48, -14);
    ctx.quadraticCurveTo(46, -4, 38, -4);
    ctx.lineTo(-48, -4);
    ctx.closePath();
    ctx.fillStyle = darkWood; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();

    // Sàn gỗ chở đá nằm ngang phẳng ở y = -14
    ctx.fillStyle = woodCol;
    ctx.fillRect(-44, -14, 84, 8);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.strokeRect(-44, -14, 84, 8);

    // Các thanh dầm dọc gia cố và dây thừng chằng
    for (const bx of [-34, -14, 6, 26]) {
      quad(ctx, bx - 2.5, -14, bx + 2.5, -14, bx - 2.5, -4, bx + 2.5, -4, lightWood, INK, 1.2);
    }

    // Mấu buộc dây thừng kéo đá (neo hitch ở [45, -10])
    ellipse(ctx, 45, -10, 4, 4, '#c29b68', INK, 1.4);
    // Vòng dây thừng bọc quanh mấu
    ellipse(ctx, 45, -10, 2.5, 2.5, '#78542c', null);

    ctx.restore();
  }

  // 3.3 PAPYRUS_ROLL (Cuộn giấy cói Ai Cập)
  // Mở ra một phần, vẽ các hình tượng trưng cổ đại (KHÔNG có chữ).
  function drawPapyrusRoll(ctx, s, t, cat) {
    ctx.save();
    const paperCol = s.style?.body || '#ebdcb9';
    const rodCol = '#7a542e';

    // Mặt giấy cói mở rộng từ x = -28 đến +28, y = -36 đến 0
    ctx.fillStyle = paperCol;
    ctx.fillRect(-28, -36, 56, 36);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.strokeRect(-28, -36, 56, 36);

    // Vân sọc đan ngang dọc của sợi lau sậy cói
    for (let py = -32; py <= -4; py += 6) {
      line(ctx, [[-26, py], [26, py]], 'rgba(180, 150, 100, 0.35)', 0.8);
    }

    // Các hình vẽ biểu tượng cổ đại Ai Cập (Ankh, Mắt Horus, hoa sen, sóng nước) — hoàn toàn hình vẽ
    // 1. Biểu tượng chìa khóa sự sống (Ankh) ở giữa
    ellipse(ctx, 0, -26, 2.5, 3.5, null, '#8b263e', 1.2);
    line(ctx, [[0, -22], [0, -14]], '#8b263e', 1.2);
    line(ctx, [[-3, -19], [3, -19]], '#8b263e', 1.2);

    // 2. Mắt thần Horus bên trái
    path(ctx, `M -18 -22 Q -13 -26 -8 -22 Q -13 -18 -18 -22 Z`, null, '#22577a', 1.1);
    ellipse(ctx, -13, -22, 1.2, 1.2, '#22577a', null);

    // 3. Hoa sen cách điệu bên phải
    path(ctx, `M 13 -15 C 8 -22 13 -26 13 -26 C 13 -26 18 -22 13 -15 Z`, '#38a3a5', INK, 0.8);

    // 4. Lượn sóng nước sông Nile ở dưới
    path(ctx, `M -22 -8 Q -16 -12 -10 -8 Q -4 -12 2 -8 Q 8 -12 14 -8 Q 20 -12 24 -8`, null, '#22577a', 1.2);

    // Trục gỗ hai đầu cuộn
    quad(ctx, -32, -38, -28, -38, -32, 2, -28, 2, rodCol, INK, 1.2);
    quad(ctx, 28, -38, 32, -38, 28, 2, 32, 2, rodCol, INK, 1.2);
    ellipse(ctx, -30, -38, 2.5, 2, '#9a7044', INK, 1.0);
    ellipse(ctx, 30, -38, 2.5, 2, '#9a7044', INK, 1.0);

    ctx.restore();
  }

  // 3.4 CAMPFIRE (Đống lửa trại thời đồ đá)
  // Các khúc củi xếp chéo, vòng đá bao quanh pit, ngọn lửa hoạt hình tất định theo lit và t.
  function drawCampfire(ctx, s, t, cat) {
    ctx.save();
    const lit = clamp(s.lit ?? 0);

    // Vòng đá tròn bao quanh hố lửa ở y = 0
    const stoneCol = '#6b7280', stoneDark = '#4b5563';
    for (let i = 0; i < 7; i++) {
      const sx = -24 + i * 8, sy = -2 + (i % 2) * 3;
      ellipse(ctx, sx, sy, 5.5, 3.5, volume(ctx, sx, sy, 5.5, 3.5, i % 2 ? stoneCol : stoneDark), INK, 1.2);
    }

    // Các khúc củi khô xếp chéo chữ X trong lòng bếp
    quad(ctx, -18, -4, -14, -8, 14, -2, 18, 2, '#5c4033', INK, 1.2);
    quad(ctx, 16, -6, 12, -10, -16, -2, -12, 2, '#4a332a', INK, 1.2);
    quad(ctx, -8, -10, -4, -12, 6, -2, 10, 0, '#6d4c3d', INK, 1.2);

    // Khi lit > 0: lửa bùng cháy rực rỡ, tất định theo hàm lượng giác
    if (lit > 0.02) {
      ctx.save();
      ctx.globalAlpha = lit;

      // Ánh than hồng ở đáy lò
      ellipse(ctx, 0, -6, 14 * lit, 5 * lit, '#ea580c', null);

      // Ngọn lửa chính: 3 lớp (đỏ ngoài, cam giữa, vàng trong cùng)
      const wave1 = Math.sin(t * 8) * 3;
      const wave2 = Math.cos(t * 11) * 2.5;
      const flameH = (38 + Math.sin(t * 10) * 4) * lit;

      // Lớp lửa đỏ cam ngoài
      ctx.beginPath();
      ctx.moveTo(-16 * lit, -6);
      ctx.quadraticCurveTo(-14 * lit + wave1, -flameH * 0.6, 0 + wave2, -flameH);
      ctx.quadraticCurveTo(14 * lit + wave1, -flameH * 0.6, 16 * lit, -6);
      ctx.closePath();
      ctx.fillStyle = '#dc2626';
      ctx.fill();

      // Lớp lửa cam giữa
      ctx.beginPath();
      ctx.moveTo(-11 * lit, -6);
      ctx.quadraticCurveTo(-9 * lit + wave2, -flameH * 0.55, 0 + wave1, -flameH * 0.85);
      ctx.quadraticCurveTo(9 * lit + wave2, -flameH * 0.55, 11 * lit, -6);
      ctx.closePath();
      ctx.fillStyle = '#f97316';
      ctx.fill();

      // Lõi lửa vàng sáng rực
      ctx.beginPath();
      ctx.moveTo(-6 * lit, -6);
      ctx.quadraticCurveTo(-4 * lit, -flameH * 0.4, 0, -flameH * 0.6);
      ctx.quadraticCurveTo(4 * lit, -flameH * 0.4, 6 * lit, -6);
      ctx.closePath();
      ctx.fillStyle = '#fde047';
      ctx.fill();

      // Tàn lửa bay lên tất định
      for (let i = 0; i < 4; i++) {
        const sx = Math.sin(t * 4 + i * 2) * 12 * lit;
        const sy = -flameH - 6 - ((t * 30 + i * 15) % 25) * lit;
        ellipse(ctx, sx, sy, 1.4, 1.4, '#fef08a', null);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  // 3.5 CAVE_WALL (Vách đá hang động có bích hoạ thời tiền sử)
  // Khối vách đá tự nhiên có mặt phẳng ở giữa (anchor surface tại [0, -42]).
  function drawCaveWall(ctx, s, t, cat) {
    ctx.save();
    const rockCol = s.style?.body || '#7c6a58';
    const darkRock = tone(rockCol, -0.22);
    const lightRock = tone(rockCol, 0.2);

    // Khối vách đá vững chãi với đường viền ghồ ghề tự nhiên
    const wallPath = `M -45 0 L -48 -78 Q -32 -88 0 -86 Q 36 -88 48 -76 L 46 0 Z`;
    path(ctx, wallPath, volume(ctx, 0, -44, 46, 42, rockCol, 0.35, -0.25), INK, 2.0);

    // Các rãnh nứt tự nhiên trên vách đá
    line(ctx, [[-40, -68], [-28, -58]], darkRock, 1.4);
    line(ctx, [[26, -72], [38, -60]], darkRock, 1.4);
    line(ctx, [[-36, -20], [-26, -14]], darkRock, 1.2);

    // Mặt tranh vẽ bích hoạ màu thổ hoàng (ochre) và than củi (charcoal)
    // 1. Hình vẽ chú hươu / bò rừng tiền sử màu đỏ đất
    ctx.save();
    ctx.strokeStyle = '#993d28'; ctx.lineWidth = 1.6;
    ctx.fillStyle = '#993d28';
    // Thân và 4 chân hươu que tiền sử
    path(ctx, `M -16 -44 Q -8 -48 4 -44 L 8 -42 L 8 -34 L -16 -34 Z`, '#993d28', null);
    line(ctx, [[-14, -34], [-16, -26]], '#993d28', 1.5);
    line(ctx, [[-10, -34], [-10, -26]], '#993d28', 1.5);
    line(ctx, [[4, -34], [4, -26]], '#993d28', 1.5);
    line(ctx, [[7, -34], [9, -26]], '#993d28', 1.5);
    // Cổ và đầu
    line(ctx, [[4, -44], [12, -50]], '#993d28', 1.8);
    ellipse(ctx, 13, -51, 2.2, 1.5, '#993d28', null, 1, 0.3);
    // Gạc hươu phân nhánh
    line(ctx, [[12, -52], [14, -58]], '#993d28', 1.2);
    line(ctx, [[14, -56], [17, -57]], '#993d28', 1.2);

    // 2. Dấu bàn tay thổi màu (hand stencil) kinh điển của người tiền sử
    ellipse(ctx, -18, -54, 3.5, 4.5, '#b85433', null);
    for (let f = 0; f < 5; f++) {
      const fa = -1.2 + f * 0.6;
      line(ctx, [[-18 + Math.cos(fa) * 3, -54 + Math.sin(fa) * 3], [-18 + Math.cos(fa) * 6, -54 + Math.sin(fa) * 6]], '#b85433', 1.4);
    }
    ctx.restore();

    ctx.restore();
  }

  // 3.6 LAUREL_TORCH (Đuốc Olympic cổ đại quấn cành nguyệt quế)
  // Tay cầm tại grip [0, -12], ngọn đuốc tại flame [0, -42].
  function drawLaurelTorch(ctx, s, t, cat) {
    ctx.save();
    // Cán đuốc bằng đồng khắc rãnh
    quad(ctx, -3, -24, 3, -24, -2, 0, 2, 0, '#b8860b', INK, 1.2);
    // Tay nắm gỗ quấn dây ở giữa
    quad(ctx, -3.5, -16, 3.5, -16, -3.5, -8, 3.5, -8, '#654321', INK, 1.0);

    // Vòng nguyệt quế / cành ô liu xanh quấn quanh cổ đuốc
    for (let i = 0; i < 4; i++) {
      const lx = (i % 2 === 0 ? -1 : 1) * 5;
      const ly = -20 + i * 3;
      leaf(ctx, lx, ly, 0.45, 0.45, '#386641');
    }

    // Đài lửa bằng đồng loe rộng ở đỉnh
    drawPoly(ctx, [[-8, -32], [8, -32], [4, -24], [-4, -24]], '#d4af37', INK, 1.2);
    ellipse(ctx, 0, -32, 8, 2.5, '#f4d06f', INK, 1.0);

    // Ngọn lửa Olympic rực sáng nhảy múa tất định
    const wave = Math.sin(t * 9) * 2.5;
    const flameH = 26 + Math.cos(t * 12) * 3;

    // Lớp lửa ngoài
    ctx.beginPath();
    ctx.moveTo(-6, -32);
    ctx.quadraticCurveTo(-6 + wave, -32 - flameH * 0.6, 0 + wave, -32 - flameH);
    ctx.quadraticCurveTo(6 + wave, -32 - flameH * 0.6, 6, -32);
    ctx.closePath();
    ctx.fillStyle = '#e63946';
    ctx.fill();

    // Lớp lửa vàng trong
    ctx.beginPath();
    ctx.moveTo(-3.5, -32);
    ctx.quadraticCurveTo(-3.5, -32 - flameH * 0.5, 0, -32 - flameH * 0.75);
    ctx.quadraticCurveTo(3.5, -32 - flameH * 0.5, 3.5, -32);
    ctx.closePath();
    ctx.fillStyle = '#ffb703';
    ctx.fill();

    ctx.restore();
  }

  // 3.7 DISCUS (Đĩa ném thể thao Hy Lạp cổ đại)
  // Đĩa tròn dẹt bằng gỗ bóng nạm đồng ở tâm.
  function drawDiscus(ctx, s, t, cat) {
    ctx.save();
    // Thân đĩa tròn bóng
    ellipse(ctx, 0, -16, 16, 16, volume(ctx, 0, -16, 16, 16, '#9c6644', 0.35, -0.25), INK, 1.5);
    // Viền kim loại đồng bên ngoài
    ellipse(ctx, 0, -16, 14, 14, null, '#d4af37', 1.4);
    // Tâm đồng tròn nổi bật
    ellipse(ctx, 0, -16, 5, 5, volume(ctx, 0, -16, 5, 5, '#e9c46a'), INK, 1.0);
    ctx.restore();
  }

  // 3.8 JAVELIN_TRAINING (Lao tập luyện thể thao Hy Lạp)
  // Gậy gỗ dài đầu bịt tròn an toàn (KHÔNG sắc nhọn, không phải vũ khí), quấn dây ném ankyle ở giữa.
  function drawJavelinTraining(ctx, s, t, cat) {
    ctx.save();
    // Thân cán lao bằng gỗ tần bì (ash wood) dài thanh thoát từ y = 0 tới y = -90
    quad(ctx, -1.8, -90, 1.8, -90, -1.8, 0, 1.8, 0, '#c7a76d', INK, 1.2);

    // Đầu bịt bảo hộ tròn dẹt bằng gỗ/đồng (đồ tập thể thao)
    ellipse(ctx, 0, -90, 3.5, 3.5, '#b08968', INK, 1.2);

    // Dây ném da (ankyle) quấn chặt ở trọng tâm [0, -45] có vòng xỏ ngón tay
    quad(ctx, -2.5, -48, 2.5, -48, -2.5, -42, 2.5, -42, '#7f4f24', INK, 1.0);
    path(ctx, `M 2 -45 Q 8 -43 6 -38 Q 2 -36 1 -42`, null, '#7f4f24', 1.5);

    ctx.restore();
  }

  // 3.9 PAVING_STONE (Khối đá lát đường La Mã)
  // Đá bazan đa giác đẽo gọt xếp khít.
  function drawPavingStone(ctx, s, t, cat) {
    ctx.save();
    const stoneCol = s.style?.body || '#71717a';
    const darkStone = tone(stoneCol, -0.22);
    const topStone = tone(stoneCol, 0.2);

    // Khối đá đa giác bề mặt phẳng
    drawPoly(ctx, [[-20, 0], [20, 0], [22, -16], [12, -22], [-14, -22], [-22, -14]], stoneCol, INK, 1.6);
    // Vát 3D mặt trên
    drawPoly(ctx, [[-14, -22], [12, -22], [10, -19], [-12, -19]], topStone, null);
    // Vát bóng mép dưới
    drawPoly(ctx, [[-20, 0], [20, 0], [18, -3], [-18, -3]], darkStone, null);

    ctx.restore();
  }

  // 3.10 CHALKBOARD_WAX_TABLET (Bảng sáp La Mã gập đôi diptych)
  // Khung gỗ gấp đôi, lớp sáp ong đen có vết khắc que (KHÔNG chữ).
  function drawChalkboardWaxTablet(ctx, s, t, cat) {
    ctx.save();
    const frameCol = s.style?.body || '#8a5a36';

    // Hai cánh bảng gập đôi mở rộng từ x = -19 đến +19, y = -30 đến 0
    // Cánh trái
    ctx.fillStyle = frameCol;
    ctx.fillRect(-19, -30, 18, 30);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    ctx.strokeRect(-19, -30, 18, 30);
    // Mặt sáp ong đen bên trong cánh trái
    ctx.fillStyle = '#262626';
    ctx.fillRect(-17, -28, 14, 26);

    // Cánh phải
    ctx.fillStyle = frameCol;
    ctx.fillRect(1, -30, 18, 30);
    ctx.strokeRect(1, -30, 18, 30);
    // Mặt sáp ong đen bên trong cánh phải
    ctx.fillStyle = '#262626';
    ctx.fillRect(3, -28, 14, 26);

    // Bản lề da buộc ở giữa
    for (const hy of [-24, -15, -6]) {
      ellipse(ctx, 0, hy, 1.8, 2.5, '#4a3018', INK, 0.8);
    }

    // Các vệt khắc zic-zac tượng trưng của que stylus (không thành chữ)
    for (let i = 0; i < 3; i++) {
      const ly = -22 + i * 7;
      line(ctx, [[-15, ly], [-5, ly]], '#737373', 0.9);
      line(ctx, [[5, ly], [15, ly]], '#737373', 0.9);
    }

    // Bút stylus bằng đồng gác bên cạnh
    quad(ctx, 19, -28, 21, -28, 19.5, -2, 20.5, -2, '#d4af37', INK, 0.8);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 4. 5 HÌNH NỀN LỊCH SỬ CỔ ĐẠI MỚI (ground_y: 810, KHÔNG chữ)
  // -------------------------------------------------------------

  // 4.1 STONE_AGE_CAVE (Hang động thời đồ đá nhìn ra thung lũng nguyên sinh)
  function drawStoneAgeCave(ctx, s, t, opt = {}) {
    const W = 576, H = 1024, GY = 810;
    const isNight = s.time === 'night' || s.night || opt.night || s.season === 'night';
    const weather = opt.weather || s.weather || 'clear';

    // Bầu trời ngoài cửa hang
    const sky = ctx.createLinearGradient(0, 0, 0, GY);
    if (isNight) {
      sky.addColorStop(0, '#0a0e1a'); sky.addColorStop(1, '#1b2438');
    } else if (weather === 'rain' || weather === 'storm') {
      sky.addColorStop(0, '#596573'); sky.addColorStop(1, '#8c9aa8');
    } else {
      sky.addColorStop(0, '#78a6c8'); sky.addColorStop(1, '#d4e6f1');
    }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);

    // Trăng và sao đêm ngoài cửa hang
    if (isNight) {
      ctx.fillStyle = '#fffdf0';
      ellipse(ctx, 288, 160, 22, 22, '#fffdf0', null);
      for (let i = 0; i < 24; i++) {
        const sx = (i * 73 + 41) % W, sy = (i * 37 + 19) % (GY - 300);
        ellipse(ctx, sx, sy, 1.2, 1.2, 'rgba(255,255,255,0.75)', null);
      }
    }

    // Dãy núi và rừng cây nguyên sinh phía xa ngoài cửa hang
    ctx.fillStyle = isNight ? '#141d28' : '#4a6b52';
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, 80 + i * 140, GY - 180, 110, 60, ctx.fillStyle, null);
    }

    // Vòm miệng hang đá tự nhiên bao bọc hai bên và trần hang
    const caveRock = ctx.createLinearGradient(0, 0, 0, GY);
    if (isNight) {
      caveRock.addColorStop(0, '#1c1917'); caveRock.addColorStop(1, '#292524');
    } else {
      caveRock.addColorStop(0, '#44403c'); caveRock.addColorStop(1, '#57534e');
    }

    // Trần hang và thạch nhũ (stalactites) rủ xuống
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 320);
    // Vòm hang cong
    ctx.bezierCurveTo(420, 120, 150, 120, 0, 320);
    ctx.closePath();
    ctx.fillStyle = caveRock; ctx.fill();

    // Thạch nhũ đá nhọn rủ từ trần
    for (let i = 0; i < 9; i++) {
      const tx = 40 + i * 60, ty = 140 + (i % 3) * 35;
      path(ctx, `M ${tx - 12} 80 L ${tx} ${ty} L ${tx + 12} 80 Z`, caveRock, null);
    }

    // Vách đá hai bên mép khung hình
    drawPoly(ctx, [[0, 200], [70, 350], [45, GY], [0, GY]], caveRock, null);
    drawPoly(ctx, [[W, 200], [W - 70, 350], [W - 45, GY], [W, GY]], caveRock, null);

    // Mặt sàn hang đá ở GY = 810
    const floor = ctx.createLinearGradient(0, GY, 0, H);
    if (isNight) {
      floor.addColorStop(0, '#292524'); floor.addColorStop(1, '#1c1917');
    } else {
      floor.addColorStop(0, '#57534e'); floor.addColorStop(1, '#44403c');
    }
    ctx.fillStyle = floor; ctx.fillRect(0, GY, W, H - GY);

    // Các phiến đá phẳng gồ ghề trên sàn hang
    for (let i = 0; i < 8; i++) {
      const rx = (i * 76 + 32) % W, ry = GY + 14 + (i % 4) * 45;
      ellipse(ctx, rx, ry, 28, 7, isNight ? '#1f1c1a' : '#44403c', null);
    }
  }

  // 4.2 NILE_BANK (Bờ sông Nile Ai Cập cổ đại)
  function drawNileBank(ctx, s, t, opt = {}) {
    const W = 576, H = 1024, GY = 810;
    const isNight = s.time === 'night' || s.night || opt.night || s.season === 'night';
    const weather = opt.weather || s.weather || 'clear';

    // Bầu trời Ai Cập rực rỡ
    const sky = ctx.createLinearGradient(0, 0, 0, GY);
    if (isNight) {
      sky.addColorStop(0, '#0b132b'); sky.addColorStop(1, '#1c2541');
    } else if (weather === 'rain' || weather === 'storm') {
      sky.addColorStop(0, '#778da9'); sky.addColorStop(1, '#a3b18a');
    } else {
      sky.addColorStop(0, '#3a86ff'); sky.addColorStop(0.65, '#ffb703'); sky.addColorStop(1, '#fb8500');
    }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);

    // Mặt trời Ai Cập vàng rực hoặc trăng đêm
    if (!isNight) {
      ellipse(ctx, 420, 180, 36, 36, '#fff3b0', null);
      ellipse(ctx, 420, 180, 52, 52, 'rgba(255, 243, 176, 0.25)', null);
    } else {
      ellipse(ctx, 420, 180, 24, 24, '#fffdf0', null);
    }

    // Dãy đồi cát và bóng hình kim tự tháp kỳ vĩ ở đường chân trời
    const pyrCol = isNight ? '#162238' : '#ba7a44';
    drawPoly(ctx, [[40, GY - 140], [150, GY - 260], [260, GY - 140]], pyrCol, null);
    drawPoly(ctx, [[150, GY - 260], [260, GY - 140], [210, GY - 140]], tone(pyrCol, -0.2), null);
    drawPoly(ctx, [[210, GY - 140], [290, GY - 220], [370, GY - 140]], pyrCol, null);

    // Hàng cây chà là (date palms) xa xa
    for (let i = 0; i < 5; i++) {
      const px = 300 + i * 45, py = GY - 140;
      line(ctx, [[px, py], [px + 2, py - 40]], '#5a3d28', 2.0);
      ellipse(ctx, px + 2, py - 42, 14, 8, isNight ? '#0d1f18' : '#2d6a4f', null);
    }

    // Dòng sông Nile xanh biếc hiền hòa (chiều cao từ GY - 140 đến GY)
    const river = ctx.createLinearGradient(0, GY - 140, 0, GY);
    if (isNight) {
      river.addColorStop(0, '#1c2541'); river.addColorStop(1, '#0b132b');
    } else {
      river.addColorStop(0, '#0077b6'); river.addColorStop(1, '#0096c7');
    }
    ctx.fillStyle = river; ctx.fillRect(0, GY - 140, W, 140);

    // Thuyền buồm giấy cói (felucca) lướt sóng xa xa
    const boatX = 140 + Math.sin(t * 0.8) * 15;
    path(ctx, `M ${boatX - 18} ${GY - 60} Q ${boatX} ${GY - 52} ${boatX + 18} ${GY - 60} Z`, '#6f4e37', INK, 1.0);
    drawPoly(ctx, [[boatX, GY - 60], [boatX - 14, GY - 95], [boatX, GY - 90]], isNight ? '#a0aec0' : '#f7fafc', null);

    // Bờ cát phù sa màu mỡ sông Nile ở GY = 810
    const bank = ctx.createLinearGradient(0, GY, 0, H);
    if (isNight) {
      bank.addColorStop(0, '#2d251e'); bank.addColorStop(1, '#1b1612');
    } else {
      bank.addColorStop(0, '#ddb892'); bank.addColorStop(1, '#b08968');
    }
    ctx.fillStyle = bank; ctx.fillRect(0, GY, W, H - GY);

    // Bụi cói papyrus và hoa sen xanh hai bên mép nước
    for (let i = 0; i < 14; i++) {
      const rx = (i * 44 + 10) % W, ry = GY - 12 - (i % 3) * 14;
      line(ctx, [[rx, GY], [rx, ry]], '#386641', 2.2);
      ellipse(ctx, rx, ry, 6, 2.5, '#588157', null);
      if (i % 4 === 0) ellipse(ctx, rx, ry - 3, 3, 3, '#90e0ef', null);
    }
  }

  // 4.3 DESERT_DUNES (Cồn cát sa mạc Con đường tơ lụa)
  function drawDesertDunes(ctx, s, t, opt = {}) {
    const W = 576, H = 1024, GY = 810;
    const isNight = s.time === 'night' || s.night || opt.night || s.season === 'night';
    const weather = opt.weather || s.weather || 'clear';

    // Bầu trời sa mạc khoáng đạt
    const sky = ctx.createLinearGradient(0, 0, 0, GY);
    if (isNight) {
      sky.addColorStop(0, '#03071e'); sky.addColorStop(0.6, '#370617'); sky.addColorStop(1, '#6a040f');
    } else if (weather === 'rain' || weather === 'storm') {
      sky.addColorStop(0, '#8d99ae'); sky.addColorStop(1, '#d8bc98');
    } else {
      sky.addColorStop(0, '#0077b6'); sky.addColorStop(0.7, '#ffb703'); sky.addColorStop(1, '#fb8500');
    }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);

    // Biển sao đêm lộng lẫy trên sa mạc
    if (isNight) {
      for (let i = 0; i < 40; i++) {
        const sx = (i * 67 + 23) % W, sy = (i * 41 + 17) % (GY - 240);
        ellipse(ctx, sx, sy, 1.3, 1.3, 'rgba(255,255,255,0.85)', null);
      }
      ellipse(ctx, 160, 160, 20, 20, '#ffea00', null);
      ellipse(ctx, 166, 156, 17, 17, '#03071e', null); // Lưỡi liềm
    }

    // Các tầng cồn cát nhấp nhô uốn lượn mềm mại ở chân trời
    const duneBack = isNight ? '#401618' : '#e09f3e';
    ctx.beginPath();
    ctx.moveTo(0, GY - 280);
    ctx.quadraticCurveTo(180, GY - 360, 360, GY - 260);
    ctx.quadraticCurveTo(460, GY - 210, W, GY - 290);
    ctx.lineTo(W, GY); ctx.lineTo(0, GY); ctx.closePath();
    ctx.fillStyle = duneBack; ctx.fill();

    const duneMid = isNight ? '#301014' : '#d48b28';
    ctx.beginPath();
    ctx.moveTo(0, GY - 160);
    ctx.quadraticCurveTo(220, GY - 90, 420, GY - 220);
    ctx.quadraticCurveTo(500, GY - 270, W, GY - 180);
    ctx.lineTo(W, GY); ctx.lineTo(0, GY); ctx.closePath();
    ctx.fillStyle = duneMid; ctx.fill();

    // Mặt đất cồn cát bằng phẳng ở GY = 810
    const ground = ctx.createLinearGradient(0, GY, 0, H);
    if (isNight) {
      ground.addColorStop(0, '#2b090a'); ground.addColorStop(1, '#180405');
    } else {
      ground.addColorStop(0, '#f4a261'); ground.addColorStop(1, '#e76f51');
    }
    ctx.fillStyle = ground; ctx.fillRect(0, GY, W, H - GY);

    // Những gợn sóng cát (sand ripples) đều đặn do gió thổi
    for (let i = 0; i < 16; i++) {
      const rx = (i * 73 + 20) % W, ry = GY + 10 + (i % 6) * 32;
      path(ctx, `M ${rx - 25} ${ry} Q ${rx} ${ry - 3} ${rx + 25} ${ry}`, null, isNight ? '#1e0506' : '#cc7738', 1.4);
    }
  }

  // 4.4 ROMAN_TOWN (Quảng trường La Mã và đường đá cổ)
  function drawRomanTown(ctx, s, t, opt = {}) {
    const W = 576, H = 1024, GY = 810;
    const isNight = s.time === 'night' || s.night || opt.night || s.season === 'night';
    const weather = opt.weather || s.weather || 'clear';

    // Bầu trời Địa Trung Hải
    const sky = ctx.createLinearGradient(0, 0, 0, GY);
    if (isNight) {
      sky.addColorStop(0, '#0f172a'); sky.addColorStop(1, '#1e293b');
    } else if (weather === 'rain' || weather === 'storm') {
      sky.addColorStop(0, '#64748b'); sky.addColorStop(1, '#94a3b8');
    } else {
      sky.addColorStop(0, '#38bdf8'); sky.addColorStop(1, '#bae6fd');
    }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);

    // Cầu dẫn nước La Mã (aqueduct) hùng vĩ vắt ngang ngọn đồi xa
    const aqCol = isNight ? '#242e3d' : '#cbd5e1';
    ctx.fillStyle = aqCol;
    ctx.fillRect(0, GY - 310, W, 18);
    for (let x = 30; x < W; x += 75) {
      quad(ctx, x - 6, GY - 310, x + 6, GY - 310, x - 6, GY - 240, x + 6, GY - 240, aqCol, null);
      // Vòm cuốn bán nguyệt
      ctx.beginPath();
      ctx.arc(x + 37.5, GY - 292, 28, Math.PI, 0);
      ctx.fillStyle = sky; ctx.fill();
    }

    // Các tòa nhà kiến trúc La Mã mái ngói terracotta và hàng cột cẩm thạch
    // Tòa nhà bên trái
    const marbleCol = isNight ? '#334155' : '#f8fafc';
    const roofCol = isNight ? '#451a1a' : '#b91c1c';
    ctx.fillStyle = marbleCol; ctx.fillRect(10, GY - 260, 160, 260);
    drawPoly(ctx, [[0, GY - 260], [90, GY - 310], [180, GY - 260]], roofCol, INK, 1.5);
    // Hàng cột Ionic/Doric
    for (let cx = 35; cx <= 155; cx += 40) {
      quad(ctx, cx - 5, GY - 260, cx + 5, GY - 260, cx - 5, GY, cx + 5, GY, marbleCol, INK, 1.2);
    }

    // Khải hoàn môn (Triumphal Arch) La Mã ở trung tâm
    ctx.fillStyle = marbleCol;
    ctx.fillRect(240, GY - 250, 180, 250);
    // Cửa vòm cuốn La Mã lớn ở giữa
    ctx.beginPath();
    ctx.arc(330, GY - 130, 48, Math.PI, 0);
    ctx.lineTo(378, GY); ctx.lineTo(282, GY); ctx.closePath();
    ctx.fillStyle = isNight ? '#1e293b' : '#64748b'; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.0; ctx.stroke();

    // Mặt đường lát đá bazan La Mã cổ đại tại GY = 810
    const road = ctx.createLinearGradient(0, GY, 0, H);
    if (isNight) {
      road.addColorStop(0, '#334155'); road.addColorStop(1, '#1e293b');
    } else {
      road.addColorStop(0, '#94a3b8'); road.addColorStop(1, '#64748b');
    }
    ctx.fillStyle = road; ctx.fillRect(0, GY, W, H - GY);

    // Các phiến đá đa giác ghép khít trên mặt đường
    for (let row = 0; row < 5; row++) {
      const py = GY + 12 + row * 40;
      for (let col = 0; col < 7; col++) {
        const px = col * 85 + (row % 2) * 40 - 20;
        drawPoly(ctx, [[px - 34, py], [px + 34, py], [px + 30, py + 32], [px - 30, py + 32]], isNight ? '#273344' : '#8091a5', isNight ? '#1a2330' : '#475569', 1.2);
      }
    }

    // Các phiến đá bước qua đường nhô cao (Roman stepping stones)
    for (const sx of [120, 280, 440]) {
      drawPoly(ctx, [[sx - 26, GY + 18], [sx + 26, GY + 18], [sx + 22, GY + 44], [sx - 22, GY + 44]], isNight ? '#3d4d63' : '#cbd5e1', INK, 1.4);
    }
  }

  // 4.5 GREEK_STADIUM (Sân vận động Olympia Hy Lạp cổ đại)
  function drawGreekStadium(ctx, s, t, opt = {}) {
    const W = 576, H = 1024, GY = 810;
    const isNight = s.time === 'night' || s.night || opt.night || s.season === 'night';
    const weather = opt.weather || s.weather || 'clear';

    // Bầu trời xanh biếc Địa Trung Hải
    const sky = ctx.createLinearGradient(0, 0, 0, GY);
    if (isNight) {
      sky.addColorStop(0, '#0a192f'); sky.addColorStop(1, '#172a45');
    } else if (weather === 'rain' || weather === 'storm') {
      sky.addColorStop(0, '#64748b'); sky.addColorStop(1, '#94a3b8');
    } else {
      sky.addColorStop(0, '#0284c7'); sky.addColorStop(0.7, '#7dd3fc'); sky.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);

    // Những ngọn đồi Elis xanh mát và rặng thông, ô liu xa xa
    ctx.fillStyle = isNight ? '#0f241a' : '#2d6a4f';
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, 70 + i * 150, GY - 200, 110, 50, ctx.fillStyle, null);
    }

    // Đền thờ thần Zeus / Hera với hàng cột cẩm thạch trắng Doric trên sườn đồi
    const marbleCol = isNight ? '#293548' : '#f8fafc';
    ctx.fillStyle = marbleCol;
    ctx.fillRect(160, GY - 230, 256, 12);
    drawPoly(ctx, [[140, GY - 230], [288, GY - 275], [436, GY - 230]], isNight ? '#3a4a60' : '#e2e8f0', INK, 1.4);
    // Hàng cột Doric fluted
    for (let cx = 175; cx <= 405; cx += 38) {
      quad(ctx, cx - 4.5, GY - 230, cx + 4.5, GY - 230, cx - 4.5, GY - 160, cx + 4.5, GY - 160, marbleCol, INK, 1.2);
    }

    // Các bậc thềm khán đài vòng cung trên sườn cỏ tự nhiên (Embankment seating)
    for (let tier = 0; tier < 4; tier++) {
      const ty = GY - 140 + tier * 28;
      const tierCol = isNight ? '#1f382a' : '#52796f';
      ctx.fillStyle = tierCol; ctx.fillRect(0, ty, W, 26);
      line(ctx, [[0, ty], [W, ty]], isNight ? '#14281e' : '#2f3e46', 1.5);
    }

    // Đường chạy điền kinh sân vận động bằng cát nén chặt tại GY = 810
    const track = ctx.createLinearGradient(0, GY, 0, H);
    if (isNight) {
      track.addColorStop(0, '#382a1d'); track.addColorStop(1, '#241a12');
    } else {
      track.addColorStop(0, '#e9c46a'); track.addColorStop(1, '#d4a373');
    }
    ctx.fillStyle = track; ctx.fillRect(0, GY, W, H - GY);

    // Vạch xuất phát bằng đá cẩm thạch trắng (Balbis) khảm chìm trên mặt cát
    line(ctx, [[0, GY], [W, GY]], '#475569', 2.0);
    for (let bx = 30; bx < W; bx += 80) {
      drawPoly(ctx, [[bx - 25, GY + 14], [bx + 25, GY + 14], [bx + 25, GY + 22], [bx - 25, GY + 22]], isNight ? '#475569' : '#f1f5f9', INK, 1.2);
      // Rãnh đặt ngón chân cho vận động viên
      line(ctx, [[bx - 20, GY + 18], [bx + 20, GY + 18]], '#94a3b8', 1.0);
    }
  }

  // -------------------------------------------------------------
  // 5. ĐĂNG KÝ VỚI CORE VECTOR ENGINE
  // -------------------------------------------------------------
  const ANCIENT_RIGS = {
    // Trái cây ô liu
    olive: {
      group: 'fruit',
      draw: drawOliveBody,
      spec: { hip: 11, hipY: -4, arm: 20, armY: -36, limbColor: '#506830' },
      seeds: drawOliveSeeds
    },
    // Con vật
    mammoth: {
      draw(ctx, s, t, cat) { drawMammoth(ctx, s, t, cat); }
    },
    camel: {
      draw(ctx, s, t, cat) { drawCamel(ctx, s, t, cat); }
    },
    // Vật thể & dụng cụ
    stone_block: {
      draw(ctx, s, t, cat) { drawStoneBlock(ctx, s, t, cat); }
    },
    sledge: {
      draw(ctx, s, t, cat) { drawSledge(ctx, s, t, cat); }
    },
    papyrus_roll: {
      draw(ctx, s, t, cat) { drawPapyrusRoll(ctx, s, t, cat); }
    },
    campfire: {
      draw(ctx, s, t, cat) { drawCampfire(ctx, s, t, cat); }
    },
    cave_wall: {
      draw(ctx, s, t, cat) { drawCaveWall(ctx, s, t, cat); }
    },
    laurel_torch: {
      draw(ctx, s, t, cat) { drawLaurelTorch(ctx, s, t, cat); }
    },
    discus: {
      draw(ctx, s, t, cat) { drawDiscus(ctx, s, t, cat); }
    },
    javelin_training: {
      draw(ctx, s, t, cat) { drawJavelinTraining(ctx, s, t, cat); }
    },
    paving_stone: {
      draw(ctx, s, t, cat) { drawPavingStone(ctx, s, t, cat); }
    },
    chalkboard_wax_tablet: {
      draw(ctx, s, t, cat) { drawChalkboardWaxTablet(ctx, s, t, cat); }
    }
  };

  const ANCIENT_BACKGROUNDS = {
    stone_age_cave: {
      label: 'Hang động thời đồ đá',
      theme: 'highland',
      ground_y: 810,
      draw: drawStoneAgeCave
    },
    nile_bank: {
      label: 'Bờ sông Nile',
      theme: 'water',
      ground_y: 810,
      draw: drawNileBank
    },
    desert_dunes: {
      label: 'Cồn cát sa mạc Con đường tơ lụa',
      theme: 'farm',
      ground_y: 810,
      draw: drawDesertDunes
    },
    roman_town: {
      label: 'Thị trấn và đường La Mã',
      theme: 'urban',
      ground_y: 810,
      draw: drawRomanTown
    },
    greek_stadium: {
      label: 'Sân vận động Olympia Hy Lạp',
      theme: 'urban',
      ground_y: 810,
      draw: drawGreekStadium
    }
  };

  RemakeVector.register({
    rigs: ANCIENT_RIGS,
    backgrounds: ANCIENT_BACKGROUNDS
  });

})();
