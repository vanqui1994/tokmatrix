// remake_vector_packs/survival_scenes.js — Survival Scenes Pack (Agent F: R9)
// 10 rigs: crashed_plane, life_raft, icebound_ship, snow_shelter, miner_helmet,
//          climbing_rope, oxygen_tank, avalanche_probe, rescue_flare, canteen_flask
// 5 backgrounds: jungle_crash_site, antarctic_camp, mine_tunnel, mountain_peak, desert_noon
// (ground_y: 810, 7 weathers, day/night, ZERO text, ZERO gore, peaceful rescue focus)

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
  // 1. CRASHED PLANE (Máy bay nhỏ hạ cánh trong rừng, không cháy nổ)
  // center: [0, -45], top: [0, -80]
  // Bounding box: x in [-46, 46], y in [-80, 0] >= -100
  // =============================================================
  function drawCrashedPlane(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Natural jungle moss & foliage resting on and around the plane
    // Leaf clumps on ground
    drawPoly(ctx, [[-45, 0], [-35, -12], [-20, -4], [-10, -10], [5, 0]], '#15803d', INK, 1.4);
    drawPoly(ctx, [[15, 0], [30, -14], [45, -6], [42, 0]], '#166534', INK, 1.4);

    // Main fuselage (aluminum white/light blue body, tilted gently)
    ctx.save();
    ctx.translate(0, -32);
    ctx.rotate(-0.06);

    // Rear tail fin (vertical stabilizer)
    drawPoly(ctx, [[-34, -14], [-44, -44], [-32, -42], [-24, -14]], '#0284c7', INK, 1.6);
    // Horizontal stabilizer
    drawPoly(ctx, [[-40, -14], [-46, -20], [-32, -18]], '#38bdf8', INK, 1.4);

    // Main fuselage body
    ctx.beginPath();
    ctx.moveTo(38, 4);
    ctx.bezierCurveTo(34, -16, 12, -22, -15, -20);
    ctx.bezierCurveTo(-30, -18, -40, -8, -42, 6);
    ctx.bezierCurveTo(-30, 16, 10, 18, 38, 4);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Colored cheatline stripe along fuselage
    ctx.beginPath();
    ctx.moveTo(36, 2);
    ctx.bezierCurveTo(15, -2, -15, -4, -40, 2);
    ctx.lineTo(-38, 8);
    ctx.bezierCurveTo(-15, 2, 15, 4, 34, 8);
    ctx.closePath();
    ctx.fillStyle = '#0284c7';
    ctx.fill();

    // Cockpit windshield windows (tinted blue/cyan, clean, intact)
    ctx.beginPath();
    ctx.moveTo(22, -14);
    ctx.lineTo(34, -4);
    ctx.lineTo(26, 2);
    ctx.lineTo(16, -6);
    ctx.closePath();
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Passenger cabin windows (3 small rounded squares)
    for (let i = 0; i < 3; i++) {
      const wx = 6 - i * 11;
      ellipse(ctx, wx, -6, 3.5, 4.0, '#7dd3fc', INK, 1.2);
    }

    // Engine cowling & stationary 2-blade propeller on nose
    ctx.save();
    ctx.translate(38, 4);
    ellipse(ctx, 0, 0, 4.5, 7, '#64748b', INK, 1.4);
    // Stationary wooden/composite propeller blades
    drawPoly(ctx, [[0, 0], [4, -18], [1, -22], [-2, -20], [-2, 0]], '#d97706', INK, 1.2);
    drawPoly(ctx, [[0, 0], [-3, 16], [-1, 20], [3, 18], [2, 0]], '#d97706', INK, 1.2);
    ellipse(ctx, 0, 0, 2.5, 2.5, '#0f172a', null);
    ctx.restore();

    // Wing extending out toward viewer (resting safely on foliage)
    ctx.beginPath();
    ctx.moveTo(8, 2);
    ctx.lineTo(-8, 2);
    ctx.lineTo(-24, 28);
    ctx.lineTo(2, 32);
    ctx.closePath();
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.restore();

    // Tropical monstera vine draped peacefully over wing tip
    drawPoly(ctx, [[-15, -4], [-8, -18], [-2, -16], [-10, -2]], '#22c55e', INK, 1.2);
    drawPoly(ctx, [[-5, -12], [2, -24], [8, -20], [0, -10]], '#16a34a', INK, 1.2);

    ctx.restore();
  }

  // =============================================================
  // 2. LIFE RAFT (Bè cứu sinh màu cam)
  // center: [0, -30], top: [0, -65]
  // Bounding box: x in [-44, 44], y in [-65, 0] >= -100
  // =============================================================
  function drawLifeRaft(ctx, s, t) {
    const wave = Math.sin((t || 0) * 2.2) * 0.04;
    ctx.save();
    ctx.translate(0, -28);
    ctx.rotate(wave);

    // Water ripple below raft
    ctx.save();
    ctx.globalAlpha = 0.5;
    ellipse(ctx, 0, 24, 42, 8, '#0284c7', null);
    ctx.restore();

    // Inflatable double buoyancy chambers (lower & upper tubes)
    // Lower tube
    ctx.beginPath();
    ctx.ellipse(0, 14, 38, 12, 0, 0, TAU);
    ctx.fillStyle = '#ea580c';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Upper tube
    ctx.beginPath();
    ctx.ellipse(0, 6, 36, 11, 0, 0, TAU);
    ctx.fillStyle = '#f97316';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Interior floor
    ellipse(ctx, 0, 6, 26, 7, '#c2410c', null);

    // Canopy arch support structure (high-vis weather dome)
    ctx.beginPath();
    ctx.moveTo(-28, 4);
    ctx.quadraticCurveTo(-26, -34, 0, -35);
    ctx.quadraticCurveTo(26, -34, 28, 4);
    ctx.lineTo(22, 4);
    ctx.quadraticCurveTo(18, -26, 0, -27);
    ctx.quadraticCurveTo(-18, -26, -22, 4);
    ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Canopy fabric roof
    ctx.beginPath();
    ctx.moveTo(-24, 2);
    ctx.quadraticCurveTo(-16, -30, 0, -32);
    ctx.quadraticCurveTo(16, -30, 24, 2);
    ctx.quadraticCurveTo(0, -6, -24, 2);
    ctx.closePath();
    ctx.fillStyle = '#fb923c';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Retro-reflective safety patches (silver crosses / rectangles)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-4, -28, 8, 4);
    ctx.fillRect(-2, -30, 4, 8);

    // Perimeter lifeline grab ropes (looped on outside of tubes)
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      const rx = i * 11;
      ctx.arc(rx, 14, 5, 0, Math.PI, false);
    }
    ctx.stroke();

    // Survival kit pack inside raft
    drawPoly(ctx, [[-10, 2], [2, 2], [2, 10], [-10, 10]], '#0284c7', INK, 1.2);
    ellipse(ctx, -4, 6, 2, 2, '#ffffff', null);

    ctx.restore();
  }

  // =============================================================
  // 3. ICEBOUND SHIP (Tàu thám hiểm kẹt băng bắc cực)
  // center: [0, -45], top: [0, -90]
  // Bounding box: x in [-45, 45], y in [-90, 0] >= -100
  // =============================================================
  function drawIceboundShip(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Background sea ice blocks
    drawPoly(ctx, [[-44, 0], [-42, -12], [-25, -16], [-10, -8], [0, -14], [25, -10], [44, -14], [44, 0]], '#bae6fd', INK, 1.4);

    // Ship hull (sturdy wooden/steel expedition ship)
    ctx.save();
    ctx.translate(0, -22);
    ctx.rotate(0.04);

    // Main hull
    ctx.beginPath();
    ctx.moveTo(38, -6);
    ctx.lineTo(34, 16);
    ctx.lineTo(-38, 16);
    ctx.lineTo(-42, -8);
    ctx.lineTo(-36, -8);
    ctx.lineTo(-34, 4);
    ctx.lineTo(32, 4);
    ctx.lineTo(34, -6);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Red water-line hull stripe
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-37, 8, 70, 7);

    // Deckhouse cabin (white with portholes)
    drawPoly(ctx, [[-20, 4], [-20, -14], [14, -14], [14, 4]], '#f1f5f9', INK, 1.8);
    // Portholes
    ellipse(ctx, -12, -5, 2.5, 2.5, '#38bdf8', INK, 1.0);
    ellipse(ctx, -4, -5, 2.5, 2.5, '#38bdf8', INK, 1.0);
    ellipse(ctx, 4, -5, 2.5, 2.5, '#38bdf8', INK, 1.0);

    // Steam funnel / chimney
    drawPoly(ctx, [[-2, -14], [-2, -26], [6, -26], [6, -14]], '#e2e8f0', INK, 1.4);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-2, -26, 8, 4);

    // Mainmast with crow's nest & rigging
    line(ctx, -6, 4, -6, -64, '#78350f', 2.2);
    // Crow's nest barrel
    drawPoly(ctx, [[-10, -50], [-10, -42], [-2, -42], [-2, -50]], '#92400e', INK, 1.4);
    // Yardarms
    line(ctx, -20, -56, 8, -56, '#78350f', 1.6);
    line(ctx, -16, -38, 4, -38, '#78350f', 1.6);
    // Rigging shrouds
    line(ctx, -20, -56, -32, 4, '#64748b', 1.0);
    line(ctx, 8, -56, 20, 4, '#64748b', 1.0);

    // Bowsprit spar extending forward
    line(ctx, 34, -6, 44, -18, '#78350f', 2.0);

    ctx.restore();

    // Foreground angular ice hummocks pressing hull
    drawPoly(ctx, [[-35, 0], [-25, -14], [-12, -2], [0, 0]], '#e0f2fe', INK, 1.6);
    drawPoly(ctx, [[8, 0], [22, -18], [34, -4], [45, 0]], '#f0f9ff', INK, 1.6);

    ctx.restore();
  }

  // =============================================================
  // 4. SNOW SHELTER (Lều tuyết / Igloo sinh tồn)
  // center: [0, -35], top: [0, -65]
  // Bounding box: x in [-42, 42], y in [-65, 0] >= -100
  // =============================================================
  function drawSnowShelter(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Drift snow around base
    drawPoly(ctx, [[-42, 0], [-36, -8], [36, -8], [42, 0]], '#e0f2fe', INK, 1.4);

    // Main domed igloo structure
    ctx.beginPath();
    ctx.arc(0, -10, 36, Math.PI, 0, false);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Soft blue shading on the left dome side
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, -10, 36, Math.PI * 0.8, Math.PI * 1.25, false);
    ctx.lineTo(-14, -10);
    ctx.closePath();
    ctx.fillStyle = 'rgba(186, 230, 253, 0.45)';
    ctx.fill();
    ctx.restore();

    // Carved snow block seams (spiraling horizontal & vertical joints)
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 1.4;
    // Layer 1
    ctx.beginPath();
    ctx.arc(0, -10, 26, Math.PI * 0.95, Math.PI * 0.05, false);
    ctx.stroke();
    // Layer 2
    ctx.beginPath();
    ctx.arc(0, -10, 16, Math.PI * 0.92, Math.PI * 0.08, false);
    ctx.stroke();

    // Vertical seam lines between snow blocks
    line(ctx, -28, -10, -24, -22, '#93c5fd', 1.4);
    line(ctx, -10, -10, -8, -24, '#93c5fd', 1.4);
    line(ctx, 12, -10, 10, -24, '#93c5fd', 1.4);
    line(ctx, -18, -25, -12, -38, '#93c5fd', 1.4);
    line(ctx, 6, -25, 4, -38, '#93c5fd', 1.4);

    // Curved low entrance tunnel on the right
    ctx.beginPath();
    ctx.moveTo(18, -10);
    ctx.quadraticCurveTo(24, -26, 36, -24);
    ctx.lineTo(38, -10);
    ctx.closePath();
    ctx.fillStyle = '#f1f5f9';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Dark entrance interior opening (warm protection)
    ctx.beginPath();
    ctx.ellipse(32, -12, 6, 10, 0, 0, TAU);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // Ventilation air hole at top
    ellipse(ctx, 0, -44, 3, 2, '#60a5fa', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // 5. MINER HELMET (Mũ bảo hiểm thợ mỏ có đèn pha)
  // center: [0, -32], top: [0, -60]
  // Bounding box: x in [-32, 38], y in [-60, 0] >= -100
  // =============================================================
  function drawMinerHelmet(ctx, s, t) {
    const beamOn = clamp(s.beam !== undefined ? s.beam : 1);
    ctx.save();
    ctx.translate(0, -18);

    // Headlamp bright beam light projection
    if (beamOn > 0.05) {
      ctx.save();
      ctx.globalAlpha = 0.35 * beamOn;
      ctx.beginPath();
      ctx.moveTo(18, -14);
      ctx.lineTo(38, -32);
      ctx.lineTo(38, 4);
      ctx.closePath();
      const grad = ctx.createLinearGradient(18, -14, 38, -14);
      grad.addColorStop(0, '#fef08a');
      grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    // Heavy-duty safety helmet dome
    ctx.beginPath();
    ctx.arc(0, -12, 22, Math.PI * 0.9, Math.PI * 0.1, false);
    ctx.closePath();
    ctx.fillStyle = '#eab308';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Top protective ridge / rib
    ctx.beginPath();
    ctx.moveTo(-16, -26);
    ctx.quadraticCurveTo(0, -34, 16, -26);
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 3.0;
    ctx.stroke();

    // Helmet wide brim
    drawPoly(ctx, [[-26, -10], [-28, -6], [28, -6], [26, -10]], '#ca8a04', INK, 1.8);

    // Mounted headlamp bracket & lamp assembly
    drawPoly(ctx, [[12, -18], [20, -20], [20, -8], [12, -10]], '#334155', INK, 1.4);
    ellipse(ctx, 20, -14, 3.5, 6, '#fef08a', INK, 1.4);
    ellipse(ctx, 21, -14, 1.8, 3, '#ffffff', null);

    // Power cable running to battery pack
    ctx.beginPath();
    ctx.moveTo(12, -12);
    ctx.quadraticCurveTo(2, -6, -20, -4);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Chin strap
    ctx.beginPath();
    ctx.moveTo(-14, -6);
    ctx.quadraticCurveTo(0, 14, 14, -6);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.restore();
  }

  // =============================================================
  // 6. CLIMBING ROPE (Cuộn dây thừng leo núi cứu hộ)
  // center: [0, -35], top: [0, -68]
  // Bounding box: x in [-30, 30], y in [-68, 0] >= -100
  // =============================================================
  function drawClimbingRope(ctx, s, t) {
    ctx.save();
    ctx.translate(0, -12);

    // Coiled loops of climbing rope (multi-loop cylindrical coil)
    const coilCount = 6;
    for (let i = 0; i < coilCount; i++) {
      const cy = -10 - i * 7;
      ctx.beginPath();
      ctx.ellipse(0, cy, 22, 6, 0, 0, TAU);
      ctx.fillStyle = i % 2 === 0 ? '#0284c7' : '#0ea5e9';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Dynamic fleck weave pattern
      line(ctx, -14, cy - 2, -10, cy + 2, '#f97316', 1.4);
      line(ctx, -2, cy - 2, 2, cy + 2, '#f97316', 1.4);
      line(ctx, 10, cy - 2, 14, cy + 2, '#f97316', 1.4);
    }

    // Top loop cinch
    ctx.beginPath();
    ctx.ellipse(0, -30, 10, 16, 0, 0, TAU);
    ctx.fillStyle = '#0369a1';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Metallic screwgate carabiner at top
    ctx.save();
    ctx.translate(10, -45);
    ctx.rotate(0.2);
    // D-ring shape
    ctx.beginPath();
    ctx.moveTo(-6, -10);
    ctx.lineTo(6, -10);
    ctx.quadraticCurveTo(10, 0, 6, 12);
    ctx.lineTo(-6, 12);
    ctx.quadraticCurveTo(-10, 0, -6, -10);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Brass knurled barrel
    ctx.fillStyle = '#d97706';
    ctx.fillRect(4, -2, 5, 8);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 7. OXYGEN TANK (Bình dưỡng khí oxy độ cao)
  // center: [0, -40], top: [0, -78]
  // Bounding box: x in [-28, 32], y in [-78, 0] >= -100
  // =============================================================
  function drawOxygenTank(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Cylinder main body (metallic aluminum with lime-green collar)
    ctx.beginPath();
    ctx.moveTo(-16, -6);
    ctx.lineTo(-16, -54);
    ctx.quadraticCurveTo(-16, -68, 0, -68);
    ctx.quadraticCurveTo(16, -68, 16, -54);
    ctx.lineTo(16, -6);
    ctx.quadraticCurveTo(16, 0, 0, 0);
    ctx.quadraticCurveTo(-16, 0, -16, -6);
    ctx.closePath();
    ctx.fillStyle = '#94a3b8';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // High-vis lime green top shoulder
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-16, -50);
    ctx.quadraticCurveTo(-16, -68, 0, -68);
    ctx.quadraticCurveTo(16, -68, 16, -50);
    ctx.closePath();
    ctx.fillStyle = '#84cc16';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // Pressure gauge & regulator valve on top
    drawPoly(ctx, [[-4, -68], [-4, -76], [4, -76], [4, -68]], '#d97706', INK, 1.4);
    // Circular dial gauge
    ellipse(ctx, 12, -72, 6, 6, '#f8fafc', INK, 1.4);
    // Gauge needle
    line(ctx, 12, -72, 14, -75, '#dc2626', 1.4);

    // Flexible breathing tube & mask hanging down side
    ctx.beginPath();
    ctx.moveTo(0, -74);
    ctx.quadraticCurveTo(-22, -60, -20, -35);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Clear silicone breathing mask
    ctx.save();
    ctx.translate(-20, -30);
    ctx.rotate(0.3);
    drawPoly(ctx, [[-6, -8], [8, -8], [6, 10], [-4, 8]], 'rgba(224, 242, 254, 0.75)', INK, 1.4);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 8. AVALANCHE PROBE (Gậy dò tuyết lở gấp gọn & máy thu tín hiệu)
  // center: [0, -42], top: [0, -82]
  // Bounding box: x in [-32, 32], y in [-82, 0] >= -100
  // =============================================================
  function drawAvalancheProbe(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // 4 folded probe rod sections bound together
    for (let r = 0; r < 4; r++) {
      const rx = -16 + r * 6;
      ctx.fillStyle = r % 2 === 0 ? '#ef4444' : '#f8fafc';
      ctx.fillRect(rx - 2, -78, 4, 76);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(rx - 2, -78, 4, 76);

      // Depth measurement gradations (hash marks)
      for (let m = -72; m < -8; m += 10) {
        line(ctx, rx - 2, m, rx + 2, m, '#0f172a', 1.0);
      }
    }

    // Top tensioning loop cable
    ctx.beginPath();
    ctx.moveTo(-16, -78);
    ctx.quadraticCurveTo(-6, -84, 2, -78);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Avalanche transceiver beacon device clipped on right side
    ctx.save();
    ctx.translate(18, -40);
    drawPoly(ctx, [[-8, -18], [10, -18], [10, 18], [-8, 18]], '#eab308', INK, 1.8);
    // LCD status display (no letters, geometric indicator bars)
    drawPoly(ctx, [[-5, -14], [7, -14], [7, -4], [-5, -4]], '#0f172a', null);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(-3, -11, 4, 4);
    ctx.fillRect(2, -11, 3, 4);
    // Antenna knob
    ellipse(ctx, 6, -20, 2.5, 2.5, '#475569', INK, 1.0);
    ctx.restore();

    ctx.restore();
  }

  // =============================================================
  // 9. RESCUE FLARE (Pháo sáng cứu hộ đường biển / núi)
  // center: [0, -40], top: [0, -85]
  // Bounding box: x in [-32, 32], y in [-85, 0] >= -100
  // =============================================================
  function drawRescueFlare(ctx, s, t) {
    const flareOn = clamp(s.flare !== undefined ? s.flare : 1);
    ctx.save();
    ctx.translate(0, 0);

    // Glowing flare starburst light emission at top
    if (flareOn > 0.05) {
      const flicker = Math.sin((t || 0) * 12) * 3;
      ctx.save();
      ctx.translate(0, -66);
      ctx.globalAlpha = 0.5 * flareOn;
      ellipse(ctx, 0, 0, 28 + flicker, 28 + flicker, '#fef08a', null);
      ctx.globalAlpha = 0.8 * flareOn;
      ellipse(ctx, 0, 0, 14, 14, '#ffffff', null);

      // Starburst rays
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 2.0;
      for (let a = 0; a < 8; a++) {
        const ang = a * Math.PI / 4 + (t || 0) * 2;
        line(ctx, Math.cos(ang) * 4, Math.sin(ang) * 4, Math.cos(ang) * (20 + flicker), Math.sin(ang) * (20 + flicker));
      }
      ctx.restore();
    }

    // Flare tube casing (red plastic industrial canister)
    drawPoly(ctx, [[-8, -10], [-8, -60], [8, -60], [8, -10]], '#dc2626', INK, 2.0);
    // Grip ribs
    for (let y = -22; y >= -50; y -= 8) {
      line(ctx, -7, y, 7, y, '#991b1b', 1.6);
    }

    // Safety cap & pull ring lanyard at base
    drawPoly(ctx, [[-7, -10], [-7, -2], [7, -2], [7, -10]], '#1e293b', INK, 1.4);
    ellipse(ctx, 0, 4, 3.5, 3.5, null, '#facc15', 1.6);

    ctx.restore();
  }

  // =============================================================
  // 10. CANTEEN FLASK (Bình nước sinh tồn có quai)
  // center: [0, -32], top: [0, -64]
  // Bounding box: x in [-30, 30], y in [-64, 0] >= -100
  // =============================================================
  function drawCanteenFlask(ctx, s, t) {
    ctx.save();
    ctx.translate(0, -4);

    // Shoulder strap webbing extending outward
    ctx.beginPath();
    ctx.moveTo(-26, -25);
    ctx.quadraticCurveTo(-20, -50, -6, -55);
    ctx.strokeStyle = '#4d7c0f';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(26, -25);
    ctx.quadraticCurveTo(20, -50, 6, -55);
    ctx.strokeStyle = '#4d7c0f';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Canteen main body (olive-drab rounded flask)
    ctx.beginPath();
    ctx.moveTo(-18, -10);
    ctx.lineTo(-18, -36);
    ctx.quadraticCurveTo(-18, -48, 0, -48);
    ctx.quadraticCurveTo(18, -48, 18, -36);
    ctx.lineTo(18, -10);
    ctx.quadraticCurveTo(18, 0, 0, 0);
    ctx.quadraticCurveTo(-18, 0, -18, -10);
    ctx.closePath();
    ctx.fillStyle = '#65a30d';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Detachable nesting aluminum cup on lower half
    drawPoly(ctx, [[-17, -18], [-17, 0], [17, 0], [17, -18]], '#cbd5e1', INK, 1.6);

    // Screw cap & chain on neck
    drawPoly(ctx, [[-6, -48], [-6, -56], [6, -56], [6, -48]], '#334155', INK, 1.6);
    // Retaining security chain
    ctx.beginPath();
    ctx.moveTo(6, -52);
    ctx.quadraticCurveTo(14, -46, 12, -38);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS
  // =============================================================

  // 1. JUNGLE CRASH SITE (Rừng nhiệt đới rậm rạp)
  function drawJungleCrashSiteBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Sky / canopy glow
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      skyGrad.addColorStop(0, '#022c22');
      skyGrad.addColorStop(1, '#064e3b');
    } else {
      skyGrad.addColorStop(0, '#86efac');
      skyGrad.addColorStop(0.4, '#15803d');
      skyGrad.addColorStop(1, '#14532d');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Sunbeams filtering through canopy
    if (!isNight && settings.weather !== 'storm') {
      ctx.save();
      ctx.globalAlpha = 0.15;
      for (let sx = X0 + 90; sx <= X1; sx += 140) {
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + 70, 0);
        ctx.lineTo(sx + 140, groundY);
        ctx.lineTo(sx + 30, groundY);
        ctx.closePath();
        ctx.fillStyle = '#fef08a';
        ctx.fill();
      }
      ctx.restore();
    }

    // Tall tropical trees & giant leaves
    ctx.save();
    ctx.fillStyle = isNight ? '#064e3b' : '#166534';
    for (let x = X0 + 40; x <= X1; x += 130) {
      ctx.fillRect(x - 8, 120, 16, groundY - 120);
      // Foliage crowns
      ellipse(ctx, x, 140, 50, 35, isNight ? '#022c22' : '#15803d', null);
    }
    ctx.restore();

    // Jungle ground (rich moist soil with ferns)
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
    groundGrad.addColorStop(0, isNight ? '#052e16' : '#3f2c1d');
    groundGrad.addColorStop(1, isNight ? '#021e10' : '#1c120c');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    // Wide horizontal scatter (ferns, fallen logs, bamboo)
    scatterExt(ext, 120, 'jungle_flora', (x, r, i) => {
      ctx.save();
      ctx.fillStyle = isNight ? '#064e3b' : '#15803d';
      for (let l = 0; l < 4; l++) {
        ctx.beginPath();
        ctx.ellipse(x + l * 12 - 18, groundY - 20 - (l % 2) * 10, 14, 28, -0.3 + l * 0.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    });

    ctx.restore();
  }

  // 2. ANTARCTIC CAMP (Trại băng Nam Cực)
  function drawAntarcticCampBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Polar sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      skyGrad.addColorStop(0, '#030712');
      skyGrad.addColorStop(0.6, '#0f172a');
      skyGrad.addColorStop(1, '#1e293b');
    } else {
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(0.6, '#bae6fd');
      skyGrad.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Polar Aurora at night
    if (isNight) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(X0, 200);
      for (let x = X0; x <= X1; x += 60) {
        ctx.quadraticCurveTo(x + 30, 180 + Math.sin(x * 0.02 + (t || 0)) * 40, x + 60, 200);
      }
      ctx.lineTo(X1, 320);
      ctx.lineTo(X0, 320);
      ctx.closePath();
      const aur = ctx.createLinearGradient(0, 180, 0, 320);
      aur.addColorStop(0, '#4ade80');
      aur.addColorStop(1, 'rgba(34, 197, 94, 0)');
      ctx.fillStyle = aur;
      ctx.fill();
      ctx.restore();
    }

    // Distant jagged blue glacial peaks
    ctx.save();
    ctx.fillStyle = isNight ? '#1e293b' : '#93c5fd';
    ctx.beginPath();
    ctx.moveTo(X0, groundY);
    for (let x = X0; x <= X1; x += 110) {
      ctx.lineTo(x + 55, groundY - 140 - Math.abs(Math.sin(x * 0.03)) * 60);
      ctx.lineTo(x + 110, groundY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Vast snowfield ground
    const snowGrad = ctx.createLinearGradient(0, groundY, 0, h);
    snowGrad.addColorStop(0, isNight ? '#334155' : '#f8fafc');
    snowGrad.addColorStop(0.4, isNight ? '#1e293b' : '#e2e8f0');
    snowGrad.addColorStop(1, isNight ? '#0f172a' : '#cbd5e1');
    ctx.fillStyle = snowGrad;
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    // Windblown sastrugi snow drifts
    scatterExt(ext, 140, 'snow_sastrugi', (x, r, i) => {
      ctx.fillStyle = isNight ? '#475569' : '#cbd5e1';
      ctx.beginPath();
      ctx.ellipse(x, groundY + 25 + (i % 3) * 20, 48 + r * 20, 6, -0.05, 0, TAU);
      ctx.fill();
    });

    ctx.restore();
  }

  // 3. MINE TUNNEL (Đường hầm mỏ khai thác ngầm)
  function drawMineTunnelBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;

    // Underground cavern ceiling & walls (textured rock strata)
    const cavernGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    cavernGrad.addColorStop(0, '#0f172a');
    cavernGrad.addColorStop(0.5, '#1e293b');
    cavernGrad.addColorStop(1, '#334155');
    ctx.fillStyle = cavernGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Wooden timber support frames (mine arch sets)
    ctx.save();
    for (let x = 60; x <= w; x += 160) {
      ctx.fillStyle = '#78350f';
      // Left and right posts
      ctx.fillRect(x - 10, 100, 16, groundY - 100);
      ctx.fillRect(x + 110, 100, 16, groundY - 100);
      // Top crossbeam
      ctx.fillRect(x - 15, 90, 150, 18);

      // Hanging miner safety lantern casting warm ambient glow
      ellipse(ctx, x + 60, 125, 30, 30, 'rgba(254, 240, 138, 0.25)', null);
      ellipse(ctx, x + 60, 125, 7, 10, '#fde047', INK, 1.2);
    }
    ctx.restore();

    // Tunnel floor & rail tracks
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    // Wooden rail ties and steel rails
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 6;
    for (let y = groundY + 15; y < h; y += 30) {
      line(ctx, X0, y, X1, y, '#78350f', 6);
    }
    line(ctx, 180, groundY, 180, h, '#94a3b8', 4);
    line(ctx, 396, groundY, 396, h, '#94a3b8', 4);

    // Wide horizontal extension
    tileExt(ext, 60, 160, w, (x) => {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(x - 10, 100, 16, groundY - 100);
      ctx.fillRect(x + 110, 100, 16, groundY - 100);
      ctx.fillRect(x - 15, 90, 150, 18);
    });

    ctx.restore();
  }

  // 4. MOUNTAIN PEAK (Đỉnh núi cao hùng vĩ)
  function drawMountainPeakBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Crisp high-altitude sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(1, '#0f172a');
    } else {
      skyGrad.addColorStop(0, '#0284c7');
      skyGrad.addColorStop(0.5, '#38bdf8');
      skyGrad.addColorStop(1, '#bae6fd');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Sea of clouds below peaks in valley
    ctx.save();
    ctx.fillStyle = isNight ? '#334155' : 'rgba(255, 255, 255, 0.75)';
    for (let cx = X0 + 60; cx <= X1; cx += 90) {
      ellipse(ctx, cx, 480 + (Math.abs(Math.sin(cx * 0.05)) > 0.5 ? 20 : 0), 65, 30, null);
      ctx.fill();
    }
    ctx.restore();

    // Distant mountain summits
    ctx.save();
    ctx.fillStyle = isNight ? '#1e293b' : '#64748b';
    ctx.beginPath();
    ctx.moveTo(X0, groundY);
    for (let x = X0; x <= X1; x += 130) {
      ctx.lineTo(x + 65, groundY - 220 - Math.abs(Math.sin(x * 0.02)) * 80);
      ctx.lineTo(x + 130, groundY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Summit rocky ridge ground
    const ridgeGrad = ctx.createLinearGradient(0, groundY, 0, h);
    ridgeGrad.addColorStop(0, isNight ? '#1e293b' : '#475569');
    ridgeGrad.addColorStop(1, isNight ? '#0f172a' : '#334155');
    ctx.fillStyle = ridgeGrad;
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    // Rocky crags & cairn stones on extension
    scatterExt(ext, 120, 'peak_rocks', (x, r, i) => {
      ctx.fillStyle = isNight ? '#334155' : '#94a3b8';
      ctx.beginPath();
      ctx.ellipse(x, groundY - 10, 32 + r * 16, 18, 0, Math.PI, 0);
      ctx.fill();
    });

    ctx.restore();
  }

  // 5. DESERT NOON (Sa mạc đồi cát trưa nắng)
  function drawDesertNoonBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Blazing desert sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 520);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(1, '#1e1b4b');
    } else {
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(0.6, '#fef08a');
      skyGrad.addColorStop(1, '#fed7aa');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(X0, 0, X1 - X0, 520);

    // Blazing desert sun
    if (!isNight) {
      ellipse(ctx, 288, 140, 42, 42, '#fef08a', null);
      ellipse(ctx, 288, 140, 26, 26, '#ffffff', null);
    }

    // Distant sandstone mesas
    ctx.fillStyle = isNight ? '#1e1b4b' : '#c2410c';
    ctx.fillRect(X0, 480, X1 - X0, 60);

    // Rolling desert dunes
    const duneGrad = ctx.createLinearGradient(0, 520, 0, h);
    duneGrad.addColorStop(0, isNight ? '#312e81' : '#f59e0b');
    duneGrad.addColorStop(0.4, isNight ? '#1e1b4b' : '#d97706');
    duneGrad.addColorStop(1, isNight ? '#0f172a' : '#b45309');
    ctx.fillStyle = duneGrad;
    ctx.fillRect(X0, 520, X1 - X0, h - 520);

    // Sinuous dune crests
    ctx.strokeStyle = isNight ? '#4338ca' : '#fbbf24';
    ctx.lineWidth = 3.0;
    for (let y = 600; y < h; y += 75) {
      ctx.beginPath();
      ctx.moveTo(X0, y);
      for (let x = X0; x <= X1; x += 180) {
        ctx.quadraticCurveTo(x + 90, y + Math.sin(x * 0.02) * 22, x + 180, y);
      }
      ctx.stroke();
    }

    // Extended horizontal details
    scatterExt(ext, 160, 'dune_crust', (x, r, i) => {
      ctx.fillStyle = isNight ? '#3730a3' : '#ea580c';
      ctx.beginPath();
      ctx.ellipse(x, groundY + 10, 45, 12, 0.1, 0, TAU);
      ctx.fill();
    });

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION
  // =============================================================
  const SURVIVAL_RIGS = {
    crashed_plane: { draw(ctx, s, t) { drawCrashedPlane(ctx, s, t); } },
    life_raft: { draw(ctx, s, t) { drawLifeRaft(ctx, s, t); } },
    icebound_ship: { draw(ctx, s, t) { drawIceboundShip(ctx, s, t); } },
    snow_shelter: { draw(ctx, s, t) { drawSnowShelter(ctx, s, t); } },
    miner_helmet: { draw(ctx, s, t) { drawMinerHelmet(ctx, s, t); } },
    climbing_rope: { draw(ctx, s, t) { drawClimbingRope(ctx, s, t); } },
    oxygen_tank: { draw(ctx, s, t) { drawOxygenTank(ctx, s, t); } },
    avalanche_probe: { draw(ctx, s, t) { drawAvalancheProbe(ctx, s, t); } },
    rescue_flare: { draw(ctx, s, t) { drawRescueFlare(ctx, s, t); } },
    canteen_flask: { draw(ctx, s, t) { drawCanteenFlask(ctx, s, t); } }
  };

  const SURVIVAL_BACKGROUNDS = {
    jungle_crash_site: {
      label: 'Hiện trường rừng rậm hạ cánh an toàn',
      theme: 'farm',
      ground_y: 810,
      draw(ctx, settings, t) { drawJungleCrashSiteBg(ctx, settings, t); }
    },
    antarctic_camp: {
      label: 'Căn cứ thám hiểm băng tuyết Nam Cực',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawAntarcticCampBg(ctx, settings, t); }
    },
    mine_tunnel: {
      label: 'Đường hầm mỏ khai thác ngầm',
      theme: 'building',
      ground_y: 810,
      draw(ctx, settings, t) { drawMineTunnelBg(ctx, settings, t); }
    },
    mountain_peak: {
      label: 'Đỉnh núi cao hiểm trở',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) { drawMountainPeakBg(ctx, settings, t); }
    },
    desert_noon: {
      label: 'Sa mạc đồi cát trưa nắng',
      theme: 'farm',
      ground_y: 810,
      draw(ctx, settings, t) { drawDesertNoonBg(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: SURVIVAL_RIGS,
    backgrounds: SURVIVAL_BACKGROUNDS
  });

})();
