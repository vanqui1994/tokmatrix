// remake_vector_packs/tech_future.js — Tech & AI Future Pack (Agent F: R11)
// 10 rigs: friendly_robot, ai_chip, server_rack, undersea_cable, satellite_gps,
//          lithium_battery, autonomous_car, quantum_computer, ai_chat_bubble, telecom_tower
// 3 backgrounds: data_center, smart_city, chip_fab_clean_room
// (ground_y: 810, 7 weathers, day/night, ZERO text, ZERO brand logos, friendly futuristic look)

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

  // =============================================================
  // 1. FRIENDLY ROBOT (Robot hình người trợ lý thân thiện)
  // center: [0, -45], top: [0, -88]
  // Bounding box: x in [-32, 32], y in [-88, 0] >= -100
  // =============================================================
  function drawFriendlyRobot(ctx, s, t) {
    const wave = Math.sin((t || 0) * 3) * 0.08;
    ctx.save();
    ctx.translate(0, 0);

    // Legs & rounded feet
    // Left leg
    drawPoly(ctx, [[-16, -24], [-8, -24], [-8, -6], [-16, -6]], '#e2e8f0', INK, 1.6);
    ellipse(ctx, -12, -4, 9, 5, '#0ea5e9', INK, 1.4);
    // Right leg
    drawPoly(ctx, [[8, -24], [16, -24], [16, -6], [8, -6]], '#e2e8f0', INK, 1.6);
    ellipse(ctx, 12, -4, 9, 5, '#0ea5e9', INK, 1.4);

    // Torso body (glossy white pod with cyan status core)
    ctx.beginPath();
    ctx.ellipse(0, -38, 20, 18, 0, 0, TAU);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Chest glowing cyan battery/status orb
    ellipse(ctx, 0, -38, 7, 7, '#0284c7', INK, 1.2);
    ellipse(ctx, 0, -38, 4, 4, '#38bdf8', null);
    ellipse(ctx, -1.5, -39.5, 1.5, 1.5, '#ffffff', null);

    // Arms & articulated mittens
    // Left arm
    ctx.save();
    ctx.translate(-20, -42);
    ctx.rotate(-0.2 + wave);
    drawPoly(ctx, [[-4, 0], [4, 0], [3, 18], [-3, 18]], '#e2e8f0', INK, 1.4);
    ellipse(ctx, 0, 21, 5, 5, '#0284c7', INK, 1.2);
    ctx.restore();

    // Right arm (friendly waving)
    ctx.save();
    ctx.translate(20, -42);
    ctx.rotate(0.3 - wave * 1.5);
    drawPoly(ctx, [[-4, 0], [4, 0], [3, 18], [-3, 18]], '#e2e8f0', INK, 1.4);
    ellipse(ctx, 0, 21, 5, 5, '#0284c7', INK, 1.2);
    ctx.restore();

    // Head (smooth round capsule)
    ctx.save();
    ctx.translate(0, -68);
    ellipse(ctx, 0, 0, 19, 16, '#f8fafc', INK, 2.0);

    // Antenna on top of head
    line(ctx, 0, -16, 0, -23, '#64748b', 2.0);
    ellipse(ctx, 0, -25, 3.5, 3.5, '#0ea5e9', INK, 1.2);

    // Ear discs
    ellipse(ctx, -19, 0, 3, 5, '#0284c7', INK, 1.2);
    ellipse(ctx, 19, 0, 3, 5, '#0284c7', INK, 1.2);

    // Curved LED visor face
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 9, 0, 0, TAU);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Expressive glowing cyan digital eyes
    ellipse(ctx, -5, -1, 3.0, 3.5, '#38bdf8', null);
    ellipse(ctx, 5, -1, 3.0, 3.5, '#38bdf8', null);
    ellipse(ctx, -4, -2, 1.0, 1.0, '#ffffff', null);
    ellipse(ctx, 6, -2, 1.0, 1.0, '#ffffff', null);

    // Gentle smile arc on visor
    ctx.beginPath();
    ctx.arc(0, 3, 3.0, 0.2, Math.PI - 0.2, false);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 2. AI CHIP (Vi mạch bán dẫn xử lý nơ-ron AI)
  // center: [0, -40], top: [0, -80]
  // Bounding box: x in [-36, 36], y in [-80, 0] >= -100
  // =============================================================
  function drawAiChip(ctx, s, t) {
    ctx.save();
    ctx.translate(0, -40);

    // Gold BGA contact pads / pins around square substrate
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.8;
    for (let i = -30; i <= 30; i += 6) {
      line(ctx, i, -34, i, -38);
      line(ctx, i, 34, i, 38);
      line(ctx, -34, i, -38, i);
      line(ctx, 34, i, 38, i);
    }

    // Green organic PCB substrate package
    ctx.beginPath();
    ctx.rect(-34, -34, 68, 68);
    ctx.fillStyle = '#065f46';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Polished metallic silicon die / heat spreader in center
    ctx.beginPath();
    ctx.rect(-22, -22, 44, 44);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Glowing cyan/emerald neural circuit pathways
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.6;
    // Circuit trace 1
    ctx.beginPath();
    ctx.moveTo(-16, -16);
    ctx.lineTo(-6, -16);
    ctx.lineTo(-6, -6);
    ctx.lineTo(0, -6);
    ctx.lineTo(0, 0);
    ctx.stroke();

    // Circuit trace 2
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.lineTo(6, 16);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 6);
    ctx.lineTo(0, 0);
    ctx.stroke();

    // Circuit trace 3
    ctx.beginPath();
    ctx.moveTo(-16, 16);
    ctx.lineTo(-10, 16);
    ctx.lineTo(-4, 4);
    ctx.lineTo(0, 0);
    ctx.stroke();

    // Central neural core node
    ellipse(ctx, 0, 0, 4.5, 4.5, '#38bdf8', INK, 1.2);
    ellipse(ctx, 0, 0, 2.0, 2.0, '#ffffff', null);

    // Silicon wafer alignment notch (pin 1 marker dot)
    ellipse(ctx, -26, -26, 2.5, 2.5, '#facc15', null);

    ctx.restore();
  }

  // =============================================================
  // 3. SERVER RACK (Tủ máy chủ trung tâm dữ liệu)
  // center: [0, -45], top: [0, -92]
  // Bounding box: x in [-32, 32], y in [-92, 0] >= -100
  // =============================================================
  function drawServerRack(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Dark titanium steel server cabinet chassis
    drawPoly(ctx, [[-28, 0], [-28, -90], [28, -90], [28, 0]], '#0f172a', INK, 2.2);

    // Top ventilation exhaust grille
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-24, -88, 48, 8);
    for (let x = -20; x <= 20; x += 5) {
      line(ctx, x, -87, x, -81, '#334155', 1.2);
    }

    // Stacked 1U/2U server chassis modules (6 blade server units)
    for (let u = 0; u < 6; u++) {
      const uy = -76 + u * 12;
      ctx.fillStyle = u % 2 === 0 ? '#1e293b' : '#334155';
      ctx.fillRect(-24, uy, 48, 10);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.0;
      ctx.strokeRect(-24, uy, 48, 10);

      // Drive bays on left
      for (let b = 0; b < 3; b++) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(-22 + b * 6, uy + 2, 5, 6);
      }

      // Blinking status activity LEDs on right
      const blink1 = Math.sin((t || 0) * 8 + u) > 0;
      const blink2 = Math.sin((t || 0) * 6 + u * 2) > 0;
      ellipse(ctx, 12, uy + 5, 1.8, 1.8, blink1 ? '#22c55e' : '#14532d', null);
      ellipse(ctx, 17, uy + 5, 1.8, 1.8, blink2 ? '#38bdf8' : '#0369a1', null);
      ellipse(ctx, 21, uy + 5, 1.8, 1.8, '#f59e0b', null);
    }

    // Cable organizer side brackets
    line(ctx, -26, -78, -26, -5, '#0284c7', 2.0);
    line(ctx, 26, -78, 26, -5, '#0284c7', 2.0);

    ctx.restore();
  }

  // =============================================================
  // 4. UNDERSEA CABLE (Mặt cắt cáp quang ngầm biển)
  // center: [0, -38], top: [0, -76]
  // Bounding box: x in [-38, 38], y in [-76, 0] >= -100
  // =============================================================
  function drawUnderseaCable(ctx, s, t) {
    ctx.save();
    ctx.translate(0, -38);

    // Layer 1: Heavy outer polyethylene protective jacket (yellow/black)
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, TAU);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Yellow stripe ring
    ctx.beginPath();
    ctx.arc(0, 0, 33, 0, TAU);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Layer 2: High-tensile galvanized steel armor wire ring
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, TAU);
    ctx.fillStyle = '#64748b';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Individual armor strand dots
    const wires = 12;
    for (let w = 0; w < wires; w++) {
      const ang = w * TAU / wires;
      ellipse(ctx, Math.cos(ang) * 28, Math.sin(ang) * 28, 2.8, 2.8, '#94a3b8', INK, 0.8);
    }

    // Layer 3: Copper power conductor tube
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    ctx.fillStyle = '#b45309';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Layer 4: Aluminum water barrier tube
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, TAU);
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Layer 5: Thixotropic water-blocking jelly core with optical glass fibers
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.fillStyle = '#0284c7';
    ctx.fill();

    // Glowing individual hair-thin optical fiber cores
    const fiberColors = ['#f43f5e', '#38bdf8', '#4ade80', '#facc15', '#a855f7', '#fb923c'];
    for (let f = 0; f < fiberColors.length; f++) {
      const fang = f * TAU / fiberColors.length + (t || 0) * 0.5;
      ellipse(ctx, Math.cos(fang) * 5, Math.sin(fang) * 5, 1.8, 1.8, fiberColors[f], null);
    }

    ctx.restore();
  }

  // =============================================================
  // 5. SATELLITE GPS (Vệ tinh định vị GPS cánh pin mặt trời)
  // center: [0, -45], top: [0, -82]
  // Bounding box: x in [-44, 44], y in [-82, -10] >= -100
  // =============================================================
  function drawSatelliteGps(ctx, s, t) {
    const bob = Math.sin((t || 0) * 2) * 2;
    ctx.save();
    ctx.translate(0, -45 + bob);

    // Left solar panel array wing
    ctx.beginPath();
    ctx.rect(-44, -14, 28, 28);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Photovoltaic grid lines
    line(ctx, -30, -14, -30, 14, '#38bdf8', 1.0);
    line(ctx, -44, 0, -16, 0, '#38bdf8', 1.0);

    // Right solar panel array wing
    ctx.beginPath();
    ctx.rect(16, -14, 28, 28);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    line(ctx, 30, -14, 30, 14, '#38bdf8', 1.0);
    line(ctx, 16, 0, 44, 0, '#38bdf8', 1.0);

    // Wing connection booms
    line(ctx, -16, 0, -10, 0, '#64748b', 2.4);
    line(ctx, 10, 0, 16, 0, '#64748b', 2.4);

    // Satellite main bus body (gold multi-layer insulation foil)
    ctx.beginPath();
    ctx.rect(-10, -16, 20, 32);
    ctx.fillStyle = '#eab308';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Thermal foil facets
    line(ctx, -10, -6, 10, -6, '#ca8a04', 1.2);
    line(ctx, -10, 6, 10, 6, '#ca8a04', 1.2);

    // Earth-facing phased array helical antenna dish at bottom
    ctx.beginPath();
    ctx.ellipse(0, 18, 9, 5, 0, 0, TAU);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    line(ctx, 0, 18, 0, 27, '#64748b', 1.8);
    ellipse(ctx, 0, 28, 2, 2, '#38bdf8', null);

    // Top star tracker optical sensors
    ellipse(ctx, -4, -18, 2.5, 2.5, '#475569', INK, 1.0);
    ellipse(ctx, 4, -18, 2.5, 2.5, '#475569', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // 6. LITHIUM BATTERY (Mặt cắt pin lithium-ion hình trụ)
  // center: [0, -42], top: [0, -84]
  // Bounding box: x in [-30, 30], y in [-84, 0] >= -100
  // =============================================================
  function drawLithiumBattery(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Cylindrical steel can casing
    ctx.beginPath();
    ctx.moveTo(-20, -74);
    ctx.lineTo(-20, -6);
    ctx.quadraticCurveTo(-20, 0, 0, 0);
    ctx.quadraticCurveTo(20, 0, 20, -6);
    ctx.lineTo(20, -74);
    ctx.quadraticCurveTo(20, -78, 0, -78);
    ctx.quadraticCurveTo(-20, -78, -20, -74);
    ctx.closePath();
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Positive top terminal button cap
    drawPoly(ctx, [[-6, -78], [-6, -84], [6, -84], [6, -78]], '#cbd5e1', INK, 1.4);

    // Technical cutaway window showing interior jelly-roll layers
    ctx.beginPath();
    ctx.rect(-16, -64, 32, 52);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Alternating spiral wound layers (copper anode, aluminum cathode, separator)
    for (let l = 0; l < 5; l++) {
      const lx = -13 + l * 6;
      // Anode (copper)
      ctx.fillStyle = '#b45309';
      ctx.fillRect(lx, -62, 2, 48);
      // Separator (white)
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(lx + 2, -62, 1, 48);
      // Cathode (aluminum/cobalt)
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(lx + 3, -62, 2, 48);
    }

    // Glowing lithium ions migrating
    for (let i = 0; i < 4; i++) {
      const iy = -54 + i * 12 + Math.sin((t || 0) * 4 + i) * 3;
      ellipse(ctx, -8 + (i % 2) * 16, iy, 2.0, 2.0, '#4ade80', null);
    }

    ctx.restore();
  }

  // =============================================================
  // 7. AUTONOMOUS CAR (Xe tự lái điện thông minh)
  // center: [0, -32], top: [0, -64]
  // Bounding box: x in [-44, 44], y in [-64, 0] >= -100
  // =============================================================
  function drawAutonomousCar(ctx, s, t) {
    const lidarSpin = (t || 0) * 8;
    ctx.save();
    ctx.translate(0, 0);

    // Aerodynamic futuristic car body (clean pearl white, zero logos)
    ctx.beginPath();
    ctx.moveTo(-40, -12);
    ctx.bezierCurveTo(-42, -26, -28, -34, -14, -38);
    // Smooth aerodynamic cabin curve
    ctx.bezierCurveTo(-4, -46, 12, -46, 22, -38);
    // Hood & nose
    ctx.bezierCurveTo(34, -30, 42, -22, 42, -12);
    ctx.lineTo(-40, -12);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Panoramic tinted glass dome canopy
    ctx.beginPath();
    ctx.moveTo(-12, -36);
    ctx.bezierCurveTo(-4, -44, 10, -44, 18, -36);
    ctx.lineTo(24, -28);
    ctx.lineTo(-18, -28);
    ctx.closePath();
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Rooftop spinning LiDAR sensor dome puck
    drawPoly(ctx, [[-6, -46], [-6, -56], [6, -56], [6, -46]], '#1e293b', INK, 1.4);
    // Spinning laser indicator slits
    ellipse(ctx, 0, -51, 6, 2.5, null, '#0ea5e9', 1.4);
    ellipse(ctx, Math.sin(lidarSpin) * 4, -51, 1.8, 1.8, '#38bdf8', null);

    // Front matrix LED light strip (headlight ribbon)
    line(ctx, 36, -20, 41, -16, '#38bdf8', 3.0);

    // Flush aero wheels
    ellipse(ctx, -24, -10, 12, 12, '#1e293b', INK, 2.0);
    ellipse(ctx, -24, -10, 6, 6, '#94a3b8', INK, 1.2);

    ellipse(ctx, 24, -10, 12, 12, '#1e293b', INK, 2.0);
    ellipse(ctx, 24, -10, 6, 6, '#94a3b8', INK, 1.2);

    ctx.restore();
  }

  // =============================================================
  // 8. QUANTUM COMPUTER (Máy tính lượng tử đèn chùm vàng)
  // center: [0, -50], top: [0, -94]
  // Bounding box: x in [-35, 35], y in [-94, 0] >= -100
  // =============================================================
  function drawQuantumComputer(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Top gold mounting flange plate (Stage 1 - 50K)
    drawPoly(ctx, [[-32, -90], [32, -90], [32, -84], [-32, -84]], '#eab308', INK, 1.8);

    // Coaxial copper/gold transmission line cables (cascading bundles)
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 1.6;
    for (let c = -24; c <= 24; c += 8) {
      line(ctx, c, -84, c * 0.8, -65);
    }

    // Stage 2: 4K golden plate
    drawPoly(ctx, [[-26, -65], [26, -65], [26, -60], [-26, -60]], '#facc15', INK, 1.6);

    for (let c = -18; c <= 18; c += 6) {
      line(ctx, c, -60, c * 0.75, -42);
    }

    // Stage 3: Still stage (100 mK)
    drawPoly(ctx, [[-20, -42], [20, -42], [20, -38], [-20, -38]], '#fde047', INK, 1.4);

    for (let c = -14; c <= 14; c += 5) {
      line(ctx, c, -38, c * 0.7, -22);
    }

    // Stage 4: Mixing chamber (15 mK near absolute zero)
    drawPoly(ctx, [[-15, -22], [15, -22], [15, -18], [-15, -18]], '#fef08a', INK, 1.4);

    // Quantum processing unit (QPU) shielded superconducting canister at bottom
    drawPoly(ctx, [[-10, -18], [10, -18], [10, -4], [-10, -4]], '#0284c7', INK, 1.6);
    // Glowing qubit processor core window
    ellipse(ctx, 0, -11, 4, 4, '#38bdf8', INK, 1.0);
    ellipse(ctx, 0, -11, 2, 2, '#ffffff', null);

    ctx.restore();
  }

  // =============================================================
  // 9. AI CHAT BUBBLE (Khung hội thoại AI tương lai hình học)
  // center: [0, -45], top: [0, -85]
  // Bounding box: x in [-40, 40], y in [-85, -5] >= -100
  // =============================================================
  function drawAiChatBubble(ctx, s, t) {
    const wave = Math.sin((t || 0) * 3) * 2;
    ctx.save();
    ctx.translate(0, 0);

    // Top prompt card (user question card)
    ctx.save();
    ctx.translate(-6, -64 + wave * 0.4);
    drawPoly(ctx, [[-28, -14], [28, -14], [28, 12], [-28, 12]], '#0284c7', INK, 1.6);
    // Stylized geometric text lines (NO real letters, rounded pill bars)
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(-22, -8, 26, 4);
    ctx.fillRect(-22, 0, 38, 4);
    ctx.restore();

    // Bottom response card (AI glowing answer card)
    ctx.save();
    ctx.translate(6, -28 - wave * 0.4);
    drawPoly(ctx, [[-28, -16], [28, -16], [28, 16], [-28, 16]], '#0f172a', INK, 1.8);

    // Glowing audio / neural waveform in response card
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let x = -22; x <= 22; x += 4) {
      const wh = Math.sin(x * 0.3 + (t || 0) * 6) * 6;
      ctx.moveTo(x, -wh);
      ctx.lineTo(x, wh);
    }
    ctx.stroke();

    // Sparkle star on corner
    ellipse(ctx, 22, -10, 2.5, 2.5, '#38bdf8', null);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 10. TELECOM TOWER (Tháp phát sóng viễn thông 5G/6G)
  // center: [0, -48], top: [0, -96]
  // Bounding box: x in [-32, 32], y in [-96, 0] >= -100
  // =============================================================
  function drawTelecomTower(ctx, s, t) {
    const beacon = Math.sin((t || 0) * 8) > 0;
    ctx.save();
    ctx.translate(0, 0);

    // Tapering steel lattice mast
    line(ctx, -16, 0, -3, -88, '#475569', 2.8);
    line(ctx, 16, 0, 3, -88, '#475569', 2.8);

    // Lattice diagonal braces
    for (let y = -15; y >= -80; y -= 16) {
      line(ctx, -12 * (1 + y / 90), y + 16, 12 * (1 + y / 90), y, '#64748b', 1.4);
      line(ctx, 12 * (1 + y / 90), y + 16, -12 * (1 + y / 90), y, '#64748b', 1.4);
    }

    // Directional 5G/6G sector antenna panels (rectangular arrays)
    // Left panel
    drawPoly(ctx, [[-16, -82], [-10, -82], [-10, -60], [-16, -60]], '#f8fafc', INK, 1.4);
    // Center panel
    drawPoly(ctx, [[-4, -84], [4, -84], [4, -62], [-4, -62]], '#f8fafc', INK, 1.4);
    // Right panel
    drawPoly(ctx, [[10, -82], [16, -82], [16, -60], [10, -60]], '#f8fafc', INK, 1.4);

    // Parabolic microwave link dish
    ellipse(ctx, -18, -48, 8, 8, '#e2e8f0', INK, 1.6);
    ellipse(ctx, -18, -48, 3, 3, '#0284c7', null);

    // Flashing red obstruction beacon at very top
    line(ctx, 0, -88, 0, -94, '#334155', 2.0);
    ellipse(ctx, 0, -94, 3.0, 3.0, beacon ? '#ef4444' : '#7f1d1d', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS
  // =============================================================

  // 1. DATA CENTER (Trung tâm dữ liệu máy chủ)
  function drawDataCenterBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;

    // Ambient interior lighting
    const ceilingGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    ceilingGrad.addColorStop(0, '#030712');
    ceilingGrad.addColorStop(0.5, '#0b1329');
    ceilingGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = ceilingGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Overhead cable trays & blue fluorescent light strips
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4.0;
    line(ctx, X0, 120, X1, 120);

    // Receding rows of server cabinets along the hall
    ctx.save();
    for (let x = X0 + 30; x <= X1; x += 110) {
      drawPoly(ctx, [[x - 45, groundY], [x - 45, 140], [x + 45, 140], [x + 45, groundY]], '#0f172a', INK, 1.8);
      // Front glass door with blue glow
      ctx.fillStyle = 'rgba(2, 132, 199, 0.2)';
      ctx.fillRect(x - 40, 150, 80, groundY - 160);

      // Blinking status lights
      for (let y = 170; y < groundY - 30; y += 40) {
        ellipse(ctx, x - 25, y, 2.5, 2.5, '#22c55e', null);
        ellipse(ctx, x + 25, y, 2.5, 2.5, '#38bdf8', null);
      }
    }
    ctx.restore();

    // Raised antistatic floor tiles
    const floorGrad = ctx.createLinearGradient(0, groundY, 0, h);
    floorGrad.addColorStop(0, '#1e293b');
    floorGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    // Floor tile grid
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.6;
    for (let y = groundY + 30; y < h; y += 45) {
      line(ctx, X0, y, X1, y);
    }
    for (let x = X0; x <= X1; x += 60) {
      line(ctx, x, groundY, x, h);
    }

    ctx.restore();
  }

  // 2. SMART CITY (Thành phố thông minh tương lai)
  function drawSmartCityBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(0.6, '#0f172a');
      skyGrad.addColorStop(1, '#1e1b4b');
    } else {
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(0.5, '#bae6fd');
      skyGrad.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Sleek eco-skyscrapers with curved glass and green vertical garden terraces
    ctx.save();
    const towerWidth = 85;
    for (let x = X0 + 20; x <= X1; x += towerWidth) {
      const th = 320 + Math.abs(Math.sin(x * 0.03)) * 220;
      ctx.fillStyle = isNight ? '#090d16' : '#f8fafc';
      ctx.fillRect(x - 35, groundY - th, 70, th);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x - 35, groundY - th, 70, th);

      // Glass tint ribbon
      ctx.fillStyle = isNight ? '#1e3a8a' : '#bae6fd';
      ctx.fillRect(x - 25, groundY - th + 20, 50, th - 40);

      // Green terrace band
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x - 30, groundY - th * 0.5, 60, 8);
    }
    ctx.restore();

    // Elevated transparent maglev transit tube
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 6.0;
    line(ctx, X0, 480, X1, 480);
    ctx.restore();

    // Clean modern boulevard ground
    const roadGrad = ctx.createLinearGradient(0, groundY, 0, h);
    roadGrad.addColorStop(0, isNight ? '#0f172a' : '#334155');
    roadGrad.addColorStop(1, isNight ? '#020617' : '#1e293b');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    // Glowing cyan smart lane markings
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.0;
    line(ctx, X0, groundY + 90, X1, groundY + 90);

    ctx.restore();
  }

  // 3. CHIP FAB CLEAN ROOM (Phòng sạch sản xuất vi mạch)
  function drawChipFabCleanRoomBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;

    // Distinctive monochromatic amber/yellow lithography cleanroom lighting
    const roomGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    roomGrad.addColorStop(0, '#78350f');
    roomGrad.addColorStop(0.3, '#d97706');
    roomGrad.addColorStop(0.8, '#f59e0b');
    roomGrad.addColorStop(1, '#fef08a');
    ctx.fillStyle = roomGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Overhead automated wafer transport monorail track (FOUP pods)
    line(ctx, X0, 100, X1, 100, '#475569', 5.0);
    for (let x = X0 + 80; x <= X1; x += 180) {
      // Wafer transport FOUP container pod
      drawPoly(ctx, [[x - 18, 105], [x + 18, 105], [x + 14, 135], [x - 14, 135]], '#0284c7', INK, 1.4);
    }

    // High-precision photolithography stepper machine enclosures (warm yellow cleanroom glow)
    ctx.save();
    for (let x = X0 + 60; x <= X1; x += 160) {
      drawPoly(ctx, [[x - 55, groundY], [x - 55, 260], [x + 55, 260], [x + 55, groundY]], '#fef3c7', INK, 2.0);
      // Clean tinted glass inspection portal
      ctx.fillStyle = '#fde047';
      ctx.fillRect(x - 35, 300, 70, 80);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x - 35, 300, 70, 80);
    }
    ctx.restore();

    // Ultra-clean mirror-glossy epoxy floor
    const floorGrad = ctx.createLinearGradient(0, groundY, 0, h);
    floorGrad.addColorStop(0, '#fef08a');
    floorGrad.addColorStop(0.4, '#fde047');
    floorGrad.addColorStop(1, '#eab308');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION
  // =============================================================
  const TECH_RIGS = {
    friendly_robot: { draw(ctx, s, t) { drawFriendlyRobot(ctx, s, t); } },
    ai_chip: { draw(ctx, s, t) { drawAiChip(ctx, s, t); } },
    server_rack: { draw(ctx, s, t) { drawServerRack(ctx, s, t); } },
    undersea_cable: { draw(ctx, s, t) { drawUnderseaCable(ctx, s, t); } },
    satellite_gps: { draw(ctx, s, t) { drawSatelliteGps(ctx, s, t); } },
    lithium_battery: { draw(ctx, s, t) { drawLithiumBattery(ctx, s, t); } },
    autonomous_car: { draw(ctx, s, t) { drawAutonomousCar(ctx, s, t); } },
    quantum_computer: { draw(ctx, s, t) { drawQuantumComputer(ctx, s, t); } },
    ai_chat_bubble: { draw(ctx, s, t) { drawAiChatBubble(ctx, s, t); } },
    telecom_tower: { draw(ctx, s, t) { drawTelecomTower(ctx, s, t); } }
  };

  const TECH_BACKGROUNDS = {
    data_center: {
      label: 'Trung tâm dữ liệu máy chủ đám mây',
      theme: 'building',
      ground_y: 810,
      draw(ctx, settings, t) { drawDataCenterBg(ctx, settings, t); }
    },
    smart_city: {
      label: 'Thành phố thông minh xanh',
      theme: 'street',
      ground_y: 810,
      draw(ctx, settings, t) { drawSmartCityBg(ctx, settings, t); }
    },
    chip_fab_clean_room: {
      label: 'Phòng sạch chế tạo vi mạch',
      theme: 'building',
      ground_y: 810,
      draw(ctx, settings, t) { drawChipFabCleanRoomBg(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: TECH_RIGS,
    backgrounds: TECH_BACKGROUNDS
  });

})();
