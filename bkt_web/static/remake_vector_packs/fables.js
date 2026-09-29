// remake_vector_packs/fables.js — Giai đoạn U: Truyện ngụ ngôn (fables)
// 3 rigs: grasshopper, tortoise, city_mouse
// Không thêm background mới (dùng lại alpine_meadow, garden, street, v.v.)

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
  // 1. GRASSHOPPER (Châu chấu kéo đàn vĩ cầm fiddle: 0..1)
  // center: [0, -30], top: [20, -58], violin: [8, -26]
  // Base at y=0, Bounding box: x in [-32, 34], y in [-62, 0] >= -100
  // =============================================================
  function drawGrasshopper(ctx, s, t) {
    const fiddle = clamp(s.fiddle !== undefined ? s.fiddle : 0);
    const shiver = clamp(s.shiver !== undefined ? s.shiver : 0);
    const hop = clamp(s.hop !== undefined ? s.hop : 0);
    const greenBase = '#4ade80';
    const greenDark = '#16a34a';
    const greenLight = '#86efac';

    const shiverOffset = shiver > 0.05 ? Math.sin((t || 0) * 45) * shiver * 2.0 : 0;
    const bowSlide = fiddle > 0.05 ? Math.sin((t || 0) * 8.5) * 8.0 * fiddle : 0;

    ctx.save();
    ctx.translate(shiverOffset, -hop * 25);

    // Far hind jumping leg (Chân nhảy xa phía sau)
    ctx.save();
    ctx.translate(-14, -20);
    // Thigh femur
    drawPoly(ctx, [[0, 0], [-16, -26], [-10, -28], [4, -4]], greenDark, INK, 1.4);
    // Tibia shin
    line(ctx, -13, -27, -18, 20, greenDark, 2.2);
    // Foot tarsus
    line(ctx, -18, 20, -24, 20, greenDark, 2.0);
    ctx.restore();

    // Far front leg
    line(ctx, 4, -18, 0, 0, greenDark, 1.8);

    // Thorax & Abdomen (Ngực và bụng)
    ctx.save();
    ctx.translate(-4, -22);
    // Segmented abdomen
    ctx.beginPath();
    ctx.ellipse(-14, 4, 16, 7, -0.2, 0, TAU);
    ctx.fillStyle = greenBase;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Abdomen segment stripes
    line(ctx, -22, 1, -20, 7, greenDark, 1.2);
    line(ctx, -16, 0, -14, 8, greenDark, 1.2);
    line(ctx, -10, -1, -8, 9, greenDark, 1.2);

    // Folded green wing over abdomen
    drawPoly(ctx, [[-2, -4], [-28, -2], [-24, 6], [2, 0]], greenLight, INK, 1.4);

    // Thorax
    drawPoly(ctx, [[-2, -8], [10, -6], [8, 6], [-4, 6]], greenDark, INK, 1.6);
    ctx.restore();

    // Head
    ctx.save();
    ctx.translate(12, -34);
    // Head oval
    ellipse(ctx, 4, -4, 9, 12, greenBase, INK, 1.8);

    // Big friendly cartoon insect eye
    ellipse(ctx, 6, -8, 4.5, 5.5, '#ffffff', INK, 1.4);
    ellipse(ctx, 7, -8, 2.4, 3.2, '#0f172a', null);
    ellipse(ctx, 8, -9.5, 1.0, 1.0, '#ffffff', null);

    // Mouth smile
    ctx.beginPath();
    ctx.arc(6, 0, 3.5, 0.2, Math.PI - 0.2, false);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Long graceful antennae
    ctx.beginPath();
    ctx.moveTo(4, -15);
    ctx.quadraticCurveTo(8, -26, 14, -28);
    ctx.moveTo(2, -15);
    ctx.quadraticCurveTo(2, -26, 6, -29);
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // Violin instrument (Đàn vĩ cầm nhỏ bằng gỗ)
    ctx.save();
    ctx.translate(6, -26);
    // Violin wooden body
    drawPoly(ctx, [[-6, -6], [4, -5], [6, 4], [-4, 5]], '#b45309', INK, 1.4);
    ellipse(ctx, -1, 0, 5, 4.5, '#d97706', null);
    // Fingerboard & neck
    line(ctx, 4, -5, 12, -9, '#451a03', 1.8);
    // Pegbox
    ellipse(ctx, 13, -9, 2, 2, '#78350f', null);
    // Strings
    line(ctx, -5, -1, 12, -8, '#fef08a', 0.8);

    // Bow sliding back and forth (Cây vĩ kéo đàn)
    ctx.save();
    ctx.translate(bowSlide, 0);
    line(ctx, -8, -12, 6, 8, '#fde047', 1.6);
    ctx.restore();

    // Musical notes floating up when fiddling
    if (fiddle > 0.1) {
      ctx.save();
      ctx.fillStyle = '#ec4899';
      for (let n = 0; n < 2; n++) {
        const ny = -18 - n * 12 - ((t || 0) * 15 + n * 8) % 15;
        const nx = 12 + n * 8 + Math.sin((t || 0) * 4 + n) * 4;
        ellipse(ctx, nx, ny, 2.5, 2.0, '#ec4899', null);
        line(ctx, nx + 2, ny, nx + 2, ny - 6, '#ec4899', 1.0);
      }
      ctx.restore();
    }
    ctx.restore();

    // Near front arm & legs
    line(ctx, 8, -20, 6, 0, greenBase, 2.0);

    // Near large hind jumping leg (Chân nhảy lớn nổi bật phía trước)
    ctx.save();
    ctx.translate(-10, -20);
    // Muscular thigh
    drawPoly(ctx, [[0, 0], [-18, -28], [-12, -30], [5, -4]], greenBase, INK, 1.8);
    // Shin
    line(ctx, -15, -29, -20, 20, greenBase, 2.4);
    line(ctx, -15, -29, -20, 20, INK, 1.2);
    // Foot
    line(ctx, -20, 20, -27, 20, greenDark, 2.0);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 2. TORTOISE (Rùa cạn bước đi chậm rãi)
  // center: [0, -25], head: [36, -26], top: [0, -46]
  // Base at y=0, Bounding box: x in [-40, 48], y in [-48, 0] >= -100
  // =============================================================
  function drawTortoise(ctx, s, t) {
    const walk = clamp(s.walk !== undefined ? s.walk : 1);
    const step = Math.sin((t || 0) * 3) * 0.25 * walk;
    const shellBase = '#854d0e';
    const shellDark = '#713f12';
    const shellPlate = '#a16207';
    const skinBase = '#65a30d';
    const skinDark = '#4d7c0f';

    ctx.save();
    ctx.translate(0, -20);

    // Far hind leg
    ctx.save();
    ctx.translate(-22, 10);
    ctx.rotate(-step);
    drawPoly(ctx, [[-5, 0], [-6, 10], [5, 10], [4, 0]], skinDark, INK, 1.4);
    ctx.restore();

    // Far front leg
    ctx.save();
    ctx.translate(20, 10);
    ctx.rotate(step);
    drawPoly(ctx, [[-5, 0], [-6, 10], [5, 10], [4, 0]], skinDark, INK, 1.4);
    ctx.restore();

    // Tall Domed Carapace (Mai rùa gồ cao đặc trưng của rùa cạn)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-32, 8);
    // Dome arc
    ctx.bezierCurveTo(-34, -14, -20, -26, 0, -26);
    ctx.bezierCurveTo(20, -26, 32, -14, 30, 8);
    ctx.closePath();
    ctx.fillStyle = shellBase;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Scute plates (Các mảng vảy mai gồ ghề đồng tâm)
    drawPoly(ctx, [[-10, -6], [0, -18], [10, -6], [0, 6]], shellPlate, shellDark, 1.4);
    drawPoly(ctx, [[-22, 2], [-14, -8], [-10, -6], [-14, 6]], shellPlate, shellDark, 1.2);
    drawPoly(ctx, [[22, 2], [14, -8], [10, -6], [14, 6]], shellPlate, shellDark, 1.2);
    drawPoly(ctx, [[-8, -19], [0, -24], [8, -19], [0, -18]], shellPlate, shellDark, 1.2);

    // Bottom plastron edge
    line(ctx, -30, 8, 28, 8, shellDark, 2.0);
    ctx.restore();

    // Wrinkly stretching neck and head
    ctx.save();
    ctx.translate(28, 0);
    // Neck with skin folds
    drawPoly(ctx, [[0, -4], [10, -6], [10, 4], [0, 4]], skinBase, INK, 1.4);
    line(ctx, 4, -4, 4, 3, skinDark, 1.0);
    line(ctx, 7, -5, 7, 3, skinDark, 1.0);

    // Head
    ellipse(ctx, 14, -3, 8, 7, skinBase, INK, 1.8);
    // Snout
    drawPoly(ctx, [[19, -4], [23, -2], [19, 1]], skinBase, INK, 1.2);

    // Determined friendly eye
    ellipse(ctx, 15, -5, 2.8, 2.8, '#ffffff', INK, 1.0);
    ellipse(ctx, 16, -5, 1.6, 1.6, '#0f172a', null);
    ellipse(ctx, 16.6, -5.6, 0.6, 0.6, '#ffffff', null);

    // Gentle mouth slit
    line(ctx, 17, 0, 21, -1, skinDark, 1.4);
    ctx.restore();

    // Little pointed tail
    drawPoly(ctx, [[-30, 4], [-38, 5], [-31, 7]], skinDark, INK, 1.2);

    // Near hind leg (Chân cột trụ có móng cùn)
    ctx.save();
    ctx.translate(-18, 10);
    ctx.rotate(step);
    drawPoly(ctx, [[-6, 0], [-7, 10], [6, 10], [5, 0]], skinBase, INK, 1.8);
    // Blunt nails
    line(ctx, -5, 10, -5, 12, '#f8fafc', 1.4);
    line(ctx, 0, 10, 0, 12, '#f8fafc', 1.4);
    line(ctx, 4, 10, 4, 12, '#f8fafc', 1.4);
    ctx.restore();

    // Near front leg
    ctx.save();
    ctx.translate(16, 10);
    ctx.rotate(-step);
    drawPoly(ctx, [[-6, 0], [-7, 10], [6, 10], [5, 0]], skinBase, INK, 1.8);
    // Blunt nails
    line(ctx, -5, 10, -5, 12, '#f8fafc', 1.4);
    line(ctx, 0, 10, 0, 12, '#f8fafc', 1.4);
    line(ctx, 4, 10, 4, 12, '#f8fafc', 1.4);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 3. CITY MOUSE (Chuột thành phố thanh lịch)
  // center: [0, -28], top: [16, -55], face: [26, -30] (face: true)
  // Base at y=0, Bounding box: x in [-38, 38], y in [-58, 0] >= -100
  // =============================================================
  function drawCityMouse(ctx, s, t) {
    const mouseColor = '#94a3b8';
    const mouseDark = '#64748b';
    const vestColor = '#831843'; // Dapper burgundy tailored vest
    const vestGold = '#fbbf24';  // Gold buttons & tie

    ctx.save();
    ctx.translate(0, -24);

    // Long slender pink mouse tail curving up
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-14, 10);
    ctx.bezierCurveTo(-26, 8, -36, -2, -32, -18);
    ctx.quadraticCurveTo(-28, -26, -24, -20);
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Hind feet with neat spats
    ellipse(ctx, -10, 22, 6, 3, mouseDark, INK, 1.2);
    ellipse(ctx, 4, 22, 6, 3, mouseDark, INK, 1.2);

    // Mouse body wearing tailored burgundy vest
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 4, 14, 16, 0.1, 0, TAU);
    ctx.fillStyle = mouseColor;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Burgundy vest
    ctx.beginPath();
    ctx.ellipse(0, 6, 12, 14, 0.1, 0, TAU);
    ctx.fillStyle = vestColor;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Vest lapels & shirt collar
    drawPoly(ctx, [[-5, -6], [0, 2], [0, 16], [-7, 16], [-9, 4]], vestColor, '#be185d', 1.0);
    drawPoly(ctx, [[5, -6], [0, 2], [0, 16], [7, 16], [9, 4]], vestColor, '#be185d', 1.0);
    // White shirt V
    drawPoly(ctx, [[-4, -6], [0, -2], [4, -6]], '#ffffff', null);
    // Yellow Bow tie
    drawPoly(ctx, [[-4, -4], [0, -2], [-4, 0]], vestGold, INK, 0.8);
    drawPoly(ctx, [[4, -4], [0, -2], [4, 0]], vestGold, INK, 0.8);
    ellipse(ctx, 0, -2, 1.5, 1.5, vestGold, INK, 0.8);

    // Gold buttons
    ellipse(ctx, 0, 4, 1.2, 1.2, vestGold, null);
    ellipse(ctx, 0, 9, 1.2, 1.2, vestGold, null);
    ctx.restore();

    // Đầu: bầu dục tâm (16, -10) trong khung đã dịch → thế giới (16, -34); tai vẽ trước (sau đầu),
    // mõm nhọn về bên phải, mũ chóp trên đỉnh. Mắt/miệng do face() vẽ tại anchor `face` (catalog face_scale nhỏ).
    ctx.save();
    ctx.translate(16, -10);
    ellipse(ctx, -6, -11, 6, 7.5, mouseColor, INK, 1.4);
    ellipse(ctx, -6, -11, 3.8, 5.2, '#fbcfe8', null);
    ellipse(ctx, 5, -12, 6, 7.5, mouseColor, INK, 1.4);
    ellipse(ctx, 5, -12, 3.8, 5.2, '#fbcfe8', null);
    path(ctx, 'M 8 -6 Q 18 -3 21 1 Q 14 5 7 4 Z', mouseColor, INK, 1.5);
    ellipse(ctx, 0, 0, 11, 9, mouseColor, INK, 1.8);
    ellipse(ctx, 21, 1, 2.4, 2.2, '#f472b6', INK, 1.0);

    // Mũ chóp đen quý phái trên đỉnh đầu
    ctx.save();
    ctx.translate(-1, -8);
    ellipse(ctx, 0, 0, 11, 2.6, '#0f172a', INK, 1.2);
    drawPoly(ctx, [[-6.5, 0], [-6, -12], [6, -12], [6.5, 0]], '#1e293b', INK, 1.4);
    drawPoly(ctx, [[-6.5, 0], [-6.5, -2.6], [6.5, -2.6], [6.5, 0]], '#e11d48', null);
    ctx.restore();

    ctx.restore();

    // Little walking cane / umbrella in hand
    ctx.save();
    ctx.translate(14, 4);
    // Wooden cane shaft
    line(ctx, 0, -12, 4, 18, '#78350f', 2.0);
    // Curved gold handle
    ctx.beginPath();
    ctx.arc(0, -12, 3.5, Math.PI, 0, false);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // Hand gripping cane
    ellipse(ctx, 1, -8, 2.5, 2.5, mouseColor, INK, 0.8);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION (RemakeVector.register)
  // =============================================================
  const FABLES_RIGS = {
    grasshopper: { draw(ctx, s, t) { drawGrasshopper(ctx, s, t); } },
    tortoise: { draw(ctx, s, t) { drawTortoise(ctx, s, t); } },
    city_mouse: { draw(ctx, s, t) { drawCityMouse(ctx, s, t); } }
  };

  RemakeVector.register({
    rigs: FABLES_RIGS
  });

})();
