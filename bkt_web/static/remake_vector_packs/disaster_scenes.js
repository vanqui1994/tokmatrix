// remake_vector_packs/disaster_scenes.js — Disaster Scenes Pack (Agent F: R10)
// 10 rigs: meteor_impact, tsunami_wave, supervolcano, earthquake_fissure, smoke_plume,
//          dust_storm_wall, warning_beacon, rescue_vehicle, flood_sandbags, cartoon_microbe
// 3 backgrounds: coastal_town, ash_sky_city, dust_bowl_farm
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
  // 1. METEOR IMPACT (Thiên thạch rơi phát sáng)
  // center: [0, -45], top: [0, -85]
  // Bounding box: x in [-40, 35], y in [-85, 0] >= -100
  // =============================================================
  function drawMeteorImpact(ctx, s, t) {
    const pulse = Math.sin((t || 0) * 8) * 0.05;
    ctx.save();
    ctx.translate(0, 0);

    // Supersonic fiery atmospheric ionization tail
    ctx.save();
    ctx.translate(-15, -55);
    ctx.rotate(-0.6);

    // Outer plasma glow
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-20, -18, -48, -12);
    ctx.quadraticCurveTo(-20, 18, 0, 0);
    ctx.fillStyle = 'rgba(249, 115, 22, 0.45)';
    ctx.fill();

    // Inner bright white/yellow jet
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-15, -8, -36, -4);
    ctx.quadraticCurveTo(-15, 8, 0, 0);
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    ctx.restore();

    // Radiant shockwave glow behind stone
    ctx.save();
    ctx.globalAlpha = 0.5 + pulse;
    ellipse(ctx, 12, -32, 26, 26, '#f97316', null);
    ellipse(ctx, 12, -32, 16, 16, '#fef08a', null);
    ctx.restore();

    // Main celestial bolide meteorite rock
    ctx.save();
    ctx.translate(12, -32);
    ctx.beginPath();
    ctx.moveTo(14, -6);
    ctx.lineTo(8, -16);
    ctx.lineTo(-4, -18);
    ctx.lineTo(-14, -6);
    ctx.lineTo(-12, 10);
    ctx.lineTo(2, 16);
    ctx.lineTo(14, 8);
    ctx.closePath();
    ctx.fillStyle = '#451a03';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Glowing impact craters & hot molten fissures on meteorite face
    ellipse(ctx, -2, -4, 4.0, 3.0, '#ea580c', INK, 1.2);
    ellipse(ctx, 6, 4, 3.0, 2.5, '#ea580c', INK, 1.0);
    ellipse(ctx, -6, 6, 2.5, 2.0, '#ea580c', null);

    // Incandescent molten streaks
    line(ctx, -10, -2, 2, 8, '#fef08a', 1.8);
    line(ctx, 4, -12, 8, -4, '#fde047', 1.6);
    ctx.restore();

    // Sparkles radiating
    for (let i = 0; i < 5; i++) {
      const spAng = i * 0.9 + (t || 0) * 4;
      const spDist = 28 + (i % 3) * 6;
      ellipse(ctx, 12 + Math.cos(spAng) * spDist, -32 + Math.sin(spAng) * spDist, 2.0, 2.0, '#fef08a', null);
    }

    ctx.restore();
  }

  // =============================================================
  // 2. TSUNAMI WAVE (Sóng thần cuộn lớn)
  // center: [0, -45], top: [0, -88]
  // Bounding box: x in [-45, 45], y in [-88, 0] >= -100
  // =============================================================
  function drawTsunamiWave(ctx, s, t) {
    const waveShift = Math.sin((t || 0) * 3) * 2;
    ctx.save();
    ctx.translate(0, 0);

    // Deep ocean base surge volume
    ctx.beginPath();
    ctx.moveTo(-45, 0);
    ctx.lineTo(-45, -35);
    ctx.bezierCurveTo(-30, -50, -10, -68, 12, -75);
    // Wave crest curling over
    ctx.bezierCurveTo(24, -85 + waveShift, 36, -82, 38, -65);
    ctx.bezierCurveTo(34, -50, 20, -48, 15, -42);
    ctx.bezierCurveTo(25, -30, 38, -25, 45, 0);
    ctx.closePath();
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Internal translucent turquoise curl
    ctx.beginPath();
    ctx.moveTo(-25, -20);
    ctx.bezierCurveTo(-10, -45, 8, -58, 24, -62);
    ctx.bezierCurveTo(18, -42, 6, -38, -5, -15);
    ctx.closePath();
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    // Deep water pressure bands
    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-40, -15);
    ctx.quadraticCurveTo(-15, -35, 10, -45);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-35, -28);
    ctx.quadraticCurveTo(-10, -52, 18, -60);
    ctx.stroke();

    // Foamy white wave crest & spraying froth
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    for (let f = 0; f < 6; f++) {
      const fx = 12 + f * 5;
      const fy = -78 + (f % 2) * 6 + waveShift;
      ellipse(ctx, fx, fy, 4.5, 4.5, '#f8fafc', INK, 1.2);
    }

    // Flying spray droplets
    for (let d = 0; d < 7; d++) {
      const dx = 28 + (d % 4) * 4 + Math.sin(d + (t || 0) * 5) * 3;
      const dy = -60 - d * 3.5;
      ellipse(ctx, dx, dy, 2.2, 2.2, '#e0f2fe', null);
    }

    ctx.restore();
  }

  // =============================================================
  // 3. SUPERVOLCANO (Siêu núi lửa miệng rộng & cột tro bụi)
  // center: [0, -45], top: [0, -92]
  // Bounding box: x in [-46, 46], y in [-92, 0] >= -100
  // =============================================================
  function drawSupervolcano(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Towering ash umbrella cloud emerging from caldera
    ctx.save();
    ctx.fillStyle = '#475569';
    // Ash cloud billows
    ellipse(ctx, 0, -80, 28, 14, '#334155', INK, 1.4);
    ellipse(ctx, -18, -74, 20, 12, '#475569', INK, 1.2);
    ellipse(ctx, 18, -74, 20, 12, '#475569', INK, 1.2);
    ellipse(ctx, -8, -86, 16, 10, '#64748b', null);
    ellipse(ctx, 8, -86, 16, 10, '#64748b', null);

    // Glowing incandescent steam vents inside ash column
    ctx.fillStyle = '#ea580c';
    ellipse(ctx, 0, -68, 8, 4, '#f97316', null);
    ellipse(ctx, 0, -68, 4, 2, '#fef08a', null);
    ctx.restore();

    // Massive broad shield caldera mountain base
    ctx.beginPath();
    ctx.moveTo(-45, 0);
    ctx.lineTo(-24, -48);
    ctx.quadraticCurveTo(-14, -54, 0, -54);
    ctx.quadraticCurveTo(14, -54, 24, -48);
    ctx.lineTo(45, 0);
    ctx.closePath();
    ctx.fillStyle = '#292524';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Sunken caldera crater basin
    ctx.beginPath();
    ctx.ellipse(0, -48, 22, 7, 0, 0, TAU);
    ctx.fillStyle = '#1c1917';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Glowing red magma lakes and vents in crater floor
    ellipse(ctx, -8, -48, 6, 2.5, '#dc2626', null);
    ellipse(ctx, 6, -48, 7, 2.8, '#ea580c', null);
    ellipse(ctx, 0, -49, 4, 1.8, '#fef08a', null);

    // Lava channels and basalt ribs down volcano slopes
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-6, -46);
    ctx.lineTo(-14, -28);
    ctx.lineTo(-22, -10);
    ctx.stroke();

    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(8, -46);
    ctx.lineTo(16, -26);
    ctx.lineTo(26, -6);
    ctx.stroke();

    ctx.restore();
  }

  // =============================================================
  // 4. EARTHQUAKE FISSURE (Vết nứt đứt gãy địa chấn)
  // center: [0, -25], top: [0, -50]
  // Bounding box: x in [-45, 45], y in [-60, 0] >= -100
  // =============================================================
  function drawEarthquakeFissure(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Left displaced ground block
    drawPoly(ctx, [[-45, 0], [-45, -50], [-10, -50], [-8, -25], [-14, 0]], '#57534e', INK, 1.8);
    // Surface soil / asphalt layer
    ctx.fillStyle = '#292524';
    ctx.fillRect(-45, -50, 35, 6);

    // Right displaced ground block (shifted lower by fault displacement)
    drawPoly(ctx, [[14, 0], [10, -20], [12, -40], [45, -40], [45, 0]], '#44403c', INK, 1.8);
    ctx.fillStyle = '#292524';
    ctx.fillRect(12, -40, 33, 6);

    // Central deep jagged chasm / crevasse
    ctx.beginPath();
    ctx.moveTo(-10, -50);
    ctx.lineTo(-4, -42);
    ctx.lineTo(-8, -30);
    ctx.lineTo(-2, -18);
    ctx.lineTo(-6, -6);
    ctx.lineTo(2, 0);
    ctx.lineTo(6, -8);
    ctx.lineTo(4, -22);
    ctx.lineTo(10, -32);
    ctx.lineTo(12, -40);
    ctx.closePath();
    ctx.fillStyle = '#0c0a09';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Subterranean rock strata and rubble lines
    line(ctx, -40, -30, -18, -30, '#78716c', 1.4);
    line(ctx, -42, -18, -16, -18, '#78716c', 1.4);
    line(ctx, 16, -24, 42, -24, '#78716c', 1.4);
    line(ctx, 18, -12, 40, -12, '#78716c', 1.4);

    // Loose rock rubble fragments
    drawPoly(ctx, [[-6, -12], [-2, -16], [0, -10]], '#78716c', INK, 1.0);
    drawPoly(ctx, [[3, -16], [7, -18], [5, -12]], '#78716c', INK, 1.0);

    ctx.restore();
  }

  // =============================================================
  // 5. SMOKE PLUME (Cột khói đối lưu bốc cao)
  // center: [0, -46], top: [0, -90]
  // Bounding box: x in [-36, 36], y in [-90, 0] >= -100
  // =============================================================
  function drawSmokePlume(ctx, s, t) {
    const drift = Math.sin((t || 0) * 2) * 2;
    ctx.save();
    ctx.translate(0, 0);

    // Stacked convective billowing cloud puffs
    // Tier 1 (Base - narrow)
    ellipse(ctx, 0, -12, 10, 8, '#334155', INK, 1.4);

    // Tier 2 (Middle)
    ellipse(ctx, -6 + drift * 0.4, -28, 16, 12, '#475569', INK, 1.6);
    ellipse(ctx, 6 + drift * 0.4, -32, 18, 13, '#475569', INK, 1.6);

    // Tier 3 (Upper billows)
    ellipse(ctx, -12 + drift * 0.8, -50, 22, 16, '#64748b', INK, 1.6);
    ellipse(ctx, 12 + drift * 0.8, -54, 24, 17, '#64748b', INK, 1.6);

    // Tier 4 (Top anvil spreading out)
    ellipse(ctx, -14 + drift, -74, 24, 16, '#94a3b8', INK, 1.4);
    ellipse(ctx, 14 + drift, -76, 26, 17, '#94a3b8', INK, 1.4);
    ellipse(ctx, 0 + drift, -82, 22, 14, '#cbd5e1', INK, 1.4);

    // Internal highlight contours
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(-8 + drift, -76, 12, Math.PI * 0.9, Math.PI * 1.6, false);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(8 + drift, -78, 14, Math.PI * 1.3, Math.PI * 1.9, false);
    ctx.stroke();

    ctx.restore();
  }

  // =============================================================
  // 6. DUST STORM WALL (Bão bụi Haboob cuồn cuộn)
  // center: [0, -45], top: [0, -88]
  // Bounding box: x in [-45, 45], y in [-88, 0] >= -100
  // =============================================================
  function drawDustStormWall(ctx, s, t) {
    const sweep = Math.sin((t || 0) * 2.5) * 2;
    ctx.save();
    ctx.translate(0, 0);

    // Warm ochre and sand-colored rolling dust cloud front
    // Backing mass
    ctx.beginPath();
    ctx.moveTo(-45, 0);
    ctx.lineTo(-45, -70);
    ctx.quadraticCurveTo(-20, -92, 0, -84);
    ctx.quadraticCurveTo(25, -88, 42, -65);
    ctx.lineTo(45, 0);
    ctx.closePath();
    ctx.fillStyle = '#b45309';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Billowing front lobes
    ellipse(ctx, -24, -35, 22, 18, '#d97706', INK, 1.4);
    ellipse(ctx, 0, -42, 26, 20, '#d97706', INK, 1.4);
    ellipse(ctx, 24 + sweep, -38, 22, 18, '#f59e0b', INK, 1.4);

    // Upper shelf billows
    ellipse(ctx, -16, -65, 20, 15, '#f59e0b', INK, 1.2);
    ellipse(ctx, 16 + sweep, -68, 22, 16, '#fbbf24', INK, 1.2);

    // Wind speed lines & flying sand streaks
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.75)';
    ctx.lineWidth = 1.8;
    line(ctx, -32, -20, 12, -20);
    line(ctx, -15, -48, 35, -48);
    line(ctx, -25, -60, 20, -60);

    // Airborne sand grains
    for (let p = 0; p < 8; p++) {
      const px = 28 + (p % 3) * 5 + Math.sin(p + (t || 0) * 6) * 3;
      const py = -25 - p * 6;
      ellipse(ctx, px, py, 1.8, 1.8, '#fef08a', null);
    }

    ctx.restore();
  }

  // =============================================================
  // 7. WARNING BEACON (Tháp còi báo động khẩn cấp)
  // center: [0, -45], top: [0, -88]
  // Bounding box: x in [-30, 30], y in [-88, 0] >= -100
  // =============================================================
  function drawWarningBeacon(ctx, s, t) {
    const flash = Math.sin((t || 0) * 10) > 0 ? 1 : 0.3;
    ctx.save();
    ctx.translate(0, 0);

    // Steel lattice support pole
    line(ctx, -5, 0, -3, -65, '#475569', 3.0);
    line(ctx, 5, 0, 3, -65, '#475569', 3.0);
    // Crossbraces
    line(ctx, -4, -15, 4, -25, '#64748b', 1.4);
    line(ctx, 4, -15, -4, -25, '#64748b', 1.4);
    line(ctx, -3, -35, 3, -45, '#64748b', 1.4);
    line(ctx, 3, -35, -3, -45, '#64748b', 1.4);

    // Concrete pedestal base
    drawPoly(ctx, [[-16, 0], [-14, -8], [14, -8], [16, 0]], '#64748b', INK, 1.8);

    // Solar backup panel
    ctx.save();
    ctx.translate(-16, -50);
    ctx.rotate(-0.35);
    drawPoly(ctx, [[-8, -12], [8, -12], [8, 12], [-8, 12]], '#0284c7', INK, 1.2);
    ctx.restore();

    // Twin outdoor siren loudspeaker horns
    // Left horn
    drawPoly(ctx, [[-3, -66], [-22, -74], [-22, -60], [-3, -64]], '#334155', INK, 1.4);
    // Right horn
    drawPoly(ctx, [[3, -66], [22, -74], [22, -60], [3, -64]], '#334155', INK, 1.4);

    // Top revolving warning beacon platform
    drawPoly(ctx, [[-8, -68], [-8, -72], [8, -72], [8, -68]], '#1e293b', INK, 1.6);

    // Beacon dome lens & flashing amber/red light
    ctx.save();
    ctx.globalAlpha = flash;
    ellipse(ctx, 0, -78, 18, 18, 'rgba(239, 68, 68, 0.4)', null);
    ctx.restore();

    // Dome glass
    ellipse(ctx, 0, -78, 7, 9, '#ef4444', INK, 1.6);
    ellipse(ctx, 0, -78, 3.5, 5, '#fef08a', null);

    ctx.restore();
  }

  // =============================================================
  // 8. RESCUE VEHICLE (Xe cứu hộ địa hình)
  // center: [0, -32], top: [0, -66]
  // Bounding box: x in [-42, 42], y in [-66, 0] >= -100
  // =============================================================
  function drawRescueVehicle(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Emergency rescue truck chassis (bright red & white high-vis)
    ctx.beginPath();
    ctx.moveTo(-36, -14);
    ctx.lineTo(-36, -42);
    ctx.lineTo(-12, -42);
    // Windshield slope
    ctx.lineTo(4, -42);
    ctx.lineTo(16, -26);
    // Hood & front grille
    ctx.lineTo(36, -26);
    ctx.lineTo(36, -14);
    ctx.closePath();
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // White reflective band along body
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-35, -28, 68, 6);

    // Side windows (clean tinted cyan)
    drawPoly(ctx, [[-10, -40], [2, -40], [12, -28], [-10, -28]], '#38bdf8', INK, 1.4);
    drawPoly(ctx, [[-32, -40], [-14, -40], [-14, -28], [-32, -28]], '#38bdf8', INK, 1.4);

    // Rooftop emergency lightbar (blue/amber LED bar)
    drawPoly(ctx, [[-6, -44], [-6, -48], [8, -48], [8, -44]], '#1e293b', INK, 1.2);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-4, -48, 5, 4);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(2, -48, 5, 4);

    // Front winch and bumper
    drawPoly(ctx, [[36, -18], [42, -18], [42, -12], [36, -12]], '#475569', INK, 1.2);

    // Wheel wheel-wells and heavy-duty all-terrain tires
    // Rear wheel
    ellipse(ctx, -22, -10, 13, 13, '#1e293b', INK, 2.0);
    ellipse(ctx, -22, -10, 6, 6, '#cbd5e1', INK, 1.2);

    // Front wheel
    ellipse(ctx, 22, -10, 13, 13, '#1e293b', INK, 2.0);
    ellipse(ctx, 22, -10, 6, 6, '#cbd5e1', INK, 1.2);

    ctx.restore();
  }

  // =============================================================
  // 9. FLOOD SANDBAGS (Bao cát đắp đê chống lũ)
  // center: [0, -28], top: [0, -56]
  // Bounding box: x in [-40, 40], y in [-56, 0] >= -100
  // =============================================================
  function drawFloodSandbags(ctx, s, t) {
    ctx.save();
    ctx.translate(0, 0);

    // Wooden retaining reinforcement stakes
    line(ctx, -34, 0, -34, -48, '#78350f', 4.0);
    line(ctx, 34, 0, 34, -48, '#78350f', 4.0);

    // Protective plastic underlayment sheeting
    drawPoly(ctx, [[-38, 0], [-36, -6], [36, -6], [38, 0]], '#0284c7', INK, 1.2);

    // Tier 1 (Bottom row - 4 sandbags)
    for (let i = 0; i < 4; i++) {
      const bx = -27 + i * 18;
      ctx.beginPath();
      ctx.ellipse(bx, -10, 10, 6, 0, 0, TAU);
      ctx.fillStyle = i % 2 === 0 ? '#d97706' : '#b45309';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Tier 2 (Middle row - 3 sandbags)
    for (let i = 0; i < 3; i++) {
      const bx = -18 + i * 18;
      ctx.beginPath();
      ctx.ellipse(bx, -22, 10, 6, 0, 0, TAU);
      ctx.fillStyle = i % 2 === 0 ? '#b45309' : '#d97706';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Tier 3 (Top row - 2 sandbags)
    for (let i = 0; i < 2; i++) {
      const bx = -9 + i * 18;
      ctx.beginPath();
      ctx.ellipse(bx, -34, 10, 6, 0, 0, TAU);
      ctx.fillStyle = '#d97706';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Apex sandbag
    ctx.beginPath();
    ctx.ellipse(0, -45, 10, 6, 0, 0, TAU);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.restore();
  }

  // =============================================================
  // 10. CARTOON MICROBE (Sinh vật vi sinh vật hoạt hình đáng yêu)
  // center: [0, -40], top: [0, -75]
  // Bounding box: x in [-34, 34], y in [-75, -5] >= -100
  // =============================================================
  function drawCartoonMicrobe(ctx, s, t) {
    const pulse = Math.sin((t || 0) * 3) * 0.05;
    ctx.save();
    ctx.translate(0, -40);

    // Rounded soft cytoplasmic pseudopods / spikes radiating
    const spikeCount = 8;
    for (let a = 0; a < spikeCount; a++) {
      const ang = a * Math.PI / 4 + (t || 0) * 0.2;
      ctx.save();
      ctx.rotate(ang);
      // Soft rounded blob spike
      ctx.beginPath();
      ctx.moveTo(-5, -20);
      ctx.quadraticCurveTo(-6, -30, 0, -32);
      ctx.quadraticCurveTo(6, -30, 5, -20);
      ctx.closePath();
      ctx.fillStyle = '#14b8a6';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Knob at tip
      ellipse(ctx, 0, -31, 3.2, 3.2, '#2dd4bf', INK, 1.2);
      ctx.restore();
    }

    // Main friendly spherical organism body
    ctx.beginPath();
    ctx.arc(0, 0, 22 * (1 + pulse), 0, TAU);
    ctx.fillStyle = '#0d9488';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Cute intelligent cartoon eyes (like body_world cells)
    ellipse(ctx, -7, -4, 5.0, 6.0, '#ffffff', INK, 1.4);
    ellipse(ctx, 7, -4, 5.0, 6.0, '#ffffff', INK, 1.4);

    // Pupils with shine
    ellipse(ctx, -6, -4, 2.5, 3.2, '#0f172a', null);
    ellipse(ctx, 8, -4, 2.5, 3.2, '#0f172a', null);
    ellipse(ctx, -5, -6, 1.0, 1.0, '#ffffff', null);
    ellipse(ctx, 9, -6, 1.0, 1.0, '#ffffff', null);

    // Friendly little smile
    ctx.beginPath();
    ctx.arc(0, 5, 4.0, 0.2, Math.PI - 0.2, false);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.restore();
  }

  // =============================================================
  // BACKGROUNDS
  // =============================================================

  // 1. COASTAL TOWN (Thị trấn ven biển kiên cố)
  function drawCoastalTownBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 480);
    if (isNight) {
      skyGrad.addColorStop(0, '#030712');
      skyGrad.addColorStop(1, '#0f172a');
    } else {
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(0.7, '#bae6fd');
      skyGrad.addColorStop(1, '#fef08a');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(X0, 0, X1 - X0, 1024); // trời phủ kín khung: không hở dải giữa trời và đất

    // Distant sea horizon & water
    const seaGrad = ctx.createLinearGradient(0, 480, 0, 640);
    seaGrad.addColorStop(0, isNight ? '#0f172a' : '#0284c7');
    seaGrad.addColorStop(1, isNight ? '#0369a1' : '#0d9488');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(X0, 480, X1 - X0, 160);

    // Protective stone sea wall
    ctx.fillStyle = isNight ? '#1e293b' : '#64748b';
    ctx.fillRect(X0, 630, X1 - X0, 30);

    // Gabled town buildings on the quayside
    ctx.save();
    const bldColors = isNight ? ['#1e293b', '#334155', '#1e1b4b'] : ['#f97316', '#0284c7', '#10b981', '#f59e0b', '#ec4899'];
    for (let x = X0 + 30; x <= X1; x += 95) {
      const col = bldColors[(Math.floor(Math.abs(x) / 95)) % bldColors.length];
      const bh = 130 + Math.sin(x * 0.05) * 40;
      drawPoly(ctx, [[x - 35, groundY], [x - 35, groundY - bh], [x, groundY - bh - 25], [x + 35, groundY - bh], [x + 35, groundY]], col, INK, 1.4);
      // Windows
      for (let r = 0; r < 2; r++) {
        ellipse(ctx, x - 15, groundY - bh + 25 + r * 30, 4, 6, isNight ? '#fef08a' : '#e0f2fe', INK, 1.0);
        ellipse(ctx, x + 15, groundY - bh + 25 + r * 30, 4, 6, isNight ? '#fef08a' : '#e0f2fe', INK, 1.0);
      }
    }
    ctx.restore();

    // Paved stone harbor ground
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
    groundGrad.addColorStop(0, isNight ? '#1e293b' : '#78716c');
    groundGrad.addColorStop(1, isNight ? '#0f172a' : '#44403c');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    ctx.restore();
  }

  // 2. ASH SKY CITY (Bầu trời tro bụi thành phố hiện đại)
  function drawAshSkyCityBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // High overcast volcanic ash sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      skyGrad.addColorStop(0, '#0f172a');
      skyGrad.addColorStop(0.5, '#1e293b');
      skyGrad.addColorStop(1, '#334155');
    } else {
      skyGrad.addColorStop(0, '#475569');
      skyGrad.addColorStop(0.5, '#64748b');
      skyGrad.addColorStop(1, '#94a3b8');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Modern architectural skyline silhouettes
    ctx.save();
    for (let x = X0 + 20; x <= X1; x += 75) {
      const sh = 240 + Math.abs(Math.sin(x * 0.04)) * 140;
      ctx.fillStyle = isNight ? '#090d16' : '#334155';
      ctx.fillRect(x - 30, groundY - sh, 60, sh);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x - 30, groundY - sh, 60, sh);

      // Grid of office windows
      ctx.fillStyle = isNight ? '#fef08a' : '#cbd5e1';
      for (let y = groundY - sh + 20; y < groundY - 20; y += 30) {
        ctx.fillRect(x - 20, y, 10, 12);
        ctx.fillRect(x + 10, y, 10, 12);
      }
    }
    ctx.restore();

    // Wide avenue roadway ground
    ctx.fillStyle = isNight ? '#0f172a' : '#1e293b';
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    // White dashed lane markings
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 4.0;
    line(ctx, X0, groundY + 90, X1, groundY + 90);

    ctx.restore();
  }

  // 3. DUST BOWL FARM (Nông trại bão bụi đồng cỏ)
  function drawDustBowlFarmBg(ctx, settings, t) {
    ctx.save();
    const w = 576, h = 1024;
    const sp = frameSpan(settings);
    const X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
    const groundY = settings.ground_y || 810;
    const isNight = settings.time === 'night';

    // Hazy dust sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isNight) {
      skyGrad.addColorStop(0, '#1c1917');
      skyGrad.addColorStop(1, '#292524');
    } else {
      skyGrad.addColorStop(0, '#d97706');
      skyGrad.addColorStop(0.5, '#f59e0b');
      skyGrad.addColorStop(1, '#fed7aa');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(X0, 0, X1 - X0, groundY);

    // Distant dust-swept prairie hills
    ctx.save();
    ctx.fillStyle = isNight ? '#292524' : '#b45309';
    ctx.beginPath();
    ctx.moveTo(X0, groundY);
    for (let x = X0; x <= X1; x += 120) {
      ctx.lineTo(x + 60, groundY - 60 - Math.abs(Math.sin(x * 0.03)) * 40);
      ctx.lineTo(x + 120, groundY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Weathered wooden prairie barn
    ctx.save();
    ctx.translate(140, groundY - 140);
    drawPoly(ctx, [[-60, 140], [-60, 40], [0, 0], [60, 40], [60, 140]], isNight ? '#44403c' : '#78350f', INK, 1.8);
    // Barn door
    drawPoly(ctx, [[-20, 140], [-20, 70], [20, 70], [20, 140]], '#292524', INK, 1.4);
    ctx.restore();

    // Vintage water-pumping windmill tower
    ctx.save();
    ctx.translate(380, groundY - 160);
    line(ctx, -14, 160, -4, 0, '#475569', 2.0);
    line(ctx, 14, 160, 4, 0, '#475569', 2.0);
    line(ctx, -10, 80, 10, 80, '#475569', 1.4);
    // Rotor wheel
    ellipse(ctx, 0, -10, 24, 24, null, '#64748b', 2.0);
    for (let a = 0; a < 6; a++) {
      const ang = a * Math.PI / 3;
      line(ctx, 0, -10, Math.cos(ang) * 22, -10 + Math.sin(ang) * 22, '#64748b', 1.4);
    }
    ctx.restore();

    // Dry sandy prairie ground
    const soilGrad = ctx.createLinearGradient(0, groundY, 0, h);
    soilGrad.addColorStop(0, isNight ? '#292524' : '#b45309');
    soilGrad.addColorStop(1, isNight ? '#1c1917' : '#78350f');
    ctx.fillStyle = soilGrad;
    ctx.fillRect(X0, groundY, X1 - X0, h - groundY);

    // Wooden fence posts & dry grass across whole width
    for (let x = X0 + 25; x <= X1; x += 80) {
      if ((x > 70 && x < 210) || (x > 340 && x < 420)) continue;
      ctx.fillStyle = '#78350f';
      ctx.fillRect(x - 3, groundY - 35, 6, 40);
      line(ctx, x - 30, groundY - 20, x + 30, groundY - 20, '#94a3b8', 1.0);
    }

    ctx.restore();
  }

  // =============================================================
  // REGISTRATION
  // =============================================================
  const DISASTER_RIGS = {
    meteor_impact: { draw(ctx, s, t) { drawMeteorImpact(ctx, s, t); } },
    tsunami_wave: { draw(ctx, s, t) { drawTsunamiWave(ctx, s, t); } },
    supervolcano: { draw(ctx, s, t) { drawSupervolcano(ctx, s, t); } },
    earthquake_fissure: { draw(ctx, s, t) { drawEarthquakeFissure(ctx, s, t); } },
    smoke_plume: { draw(ctx, s, t) { drawSmokePlume(ctx, s, t); } },
    dust_storm_wall: { draw(ctx, s, t) { drawDustStormWall(ctx, s, t); } },
    warning_beacon: { draw(ctx, s, t) { drawWarningBeacon(ctx, s, t); } },
    rescue_vehicle: { draw(ctx, s, t) { drawRescueVehicle(ctx, s, t); } },
    flood_sandbags: { draw(ctx, s, t) { drawFloodSandbags(ctx, s, t); } },
    cartoon_microbe: { draw(ctx, s, t) { drawCartoonMicrobe(ctx, s, t); } }
  };

  const DISASTER_BACKGROUNDS = {
    coastal_town: {
      label: 'Thị trấn ven biển kiên cố',
      theme: 'water',
      ground_y: 810,
      draw(ctx, settings, t) { drawCoastalTownBg(ctx, settings, t); }
    },
    ash_sky_city: {
      label: 'Bầu trời tro bụi thành phố',
      theme: 'street',
      ground_y: 810,
      draw(ctx, settings, t) { drawAshSkyCityBg(ctx, settings, t); }
    },
    dust_bowl_farm: {
      label: 'Nông trại bão bụi bình nguyên',
      theme: 'farm',
      ground_y: 810,
      draw(ctx, settings, t) { drawDustBowlFarmBg(ctx, settings, t); }
    }
  };

  RemakeVector.register({
    rigs: DISASTER_RIGS,
    backgrounds: DISASTER_BACKGROUNDS
  });

})();
