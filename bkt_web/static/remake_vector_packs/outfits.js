// remake_vector_packs/outfits.js — Phần II Giai đoạn J: trang phục chibi (plan §18.1).
// Một bộ trang phục (catalog `outfits`) ghép các mảnh theo lớp: back, bottom, shoes, top, head, face_acc.
// Mỗi mảnh là MỘT DÒNG THAM SỐ trong các bảng TOPS/BOTTOMS/SHOES/HEADS/BACKS/FACE_ACCS, vẽ bằng vài
// "kiểu may" dùng chung. drawChibi (chibi.js) vẽ nhân vật như cũ và chỉ thay đúng lớp có mảnh, nên tóc,
// mặt và nét riêng của từng chibi được giữ. Mảnh `regular_*`/`shoes` = giữ đồ của chính nhân vật.
// Không có mảnh nào được tự rơi về hình mặc định: test đòi mọi mảnh trong catalog có trong các bảng này.
(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') throw new Error('outfits pack: RemakeVector core engine chưa được nạp.');

  const { path, line, ellipse, taper, mitten, tone, INK } = RemakeVector.kit;

  // Hình thân áo chuẩn của chibi (giống thân gốc), dài thêm `len` xuống dưới và loe `flare`.
  function torso(ctx, v, fill, len = 0, flare = 0, w = 14) {
    const top = v.torsoTopY, bot = v.torsoBotY + len;
    path(ctx, `M ${-w} ${top} Q ${-17 - flare} ${bot + 2} ${-11 - flare} ${bot} L ${11 + flare} ${bot} Q ${17 + flare} ${bot + 2} ${w} ${top} Z`, fill, INK, 1.8);
  }
  function leg(ctx, v, side, fill, r1 = 5.5, r2 = 4.5, endLift = 5) {
    const x = side < 0 ? v.legLeftX : v.legRightX, fy = side < 0 ? v.footLeftY : v.footRightY;
    taper(ctx, side * 7, v.hipY, x, fy - endLift, r1, r2, fill, INK, 1.4);
  }
  // Điểm trên ống chân ở tỉ lệ k (0 = hông, 1 = cổ chân).
  function legPoint(v, side, k) {
    const x = side < 0 ? v.legLeftX : v.legRightX, fy = (side < 0 ? v.footLeftY : v.footRightY) - 5;
    return [side * 7 + (x - side * 7) * k, v.hipY + (fy - v.hipY) * k];
  }

  // ---------------------------------------------------------------- chi tiết áo
  const DETAILS = {
    buttons(ctx, v, c = '#1e293b') { for (let y = v.torsoTopY + 6; y < v.torsoBotY - 2; y += 6) ellipse(ctx, 0, y, 1.3, 1.3, c, null); },
    double_buttons(ctx, v, c = '#1e293b') { for (let y = v.torsoTopY + 6; y < v.torsoBotY - 2; y += 6) { ellipse(ctx, -4, y, 1.3, 1.3, c, null); ellipse(ctx, 4, y, 1.3, 1.3, c, null); } },
    zip(ctx, v, c = '#94a3b8') { line(ctx, [[0, v.torsoTopY + 2], [0, v.torsoBotY]], c, 1.4); },
    collar(ctx, v, c = '#ffffff') { path(ctx, `M -8 ${v.torsoTopY} L 0 ${v.torsoTopY + 7} L 8 ${v.torsoTopY} L 5 ${v.torsoTopY - 1} L 0 ${v.torsoTopY + 3} L -5 ${v.torsoTopY - 1} Z`, c, INK, 1.0); },
    lapels(ctx, v, c) { path(ctx, `M -10 ${v.torsoTopY} L -2 ${v.torsoTopY + 14} L -7 ${v.torsoTopY + 14} L -13 ${v.torsoTopY + 3} Z`, c, INK, 1.0); path(ctx, `M 10 ${v.torsoTopY} L 2 ${v.torsoTopY + 14} L 7 ${v.torsoTopY + 14} L 13 ${v.torsoTopY + 3} Z`, c, INK, 1.0); },
    belt(ctx, v, c = '#3f2a1a') { line(ctx, [[-14, v.torsoBotY - 3], [14, v.torsoBotY - 3]], c, 3); ellipse(ctx, 0, v.torsoBotY - 3, 2.4, 2, '#eab308', INK, 0.8); },
    sash(ctx, v, c = '#be123c') { line(ctx, [[-14, v.torsoBotY - 4], [14, v.torsoBotY - 4]], c, 5); },
    obi(ctx, v, c = '#be123c') { path(ctx, `M -15 ${v.torsoBotY - 9} L 15 ${v.torsoBotY - 9} L 15 ${v.torsoBotY - 2} L -15 ${v.torsoBotY - 2} Z`, c, INK, 1.2); line(ctx, [[-15, v.torsoBotY - 5.5], [15, v.torsoBotY - 5.5]], tone(c, 0.3), 1.2); },
    // Vạt áo quấn chéo (kimono, yukata, haori, durumagi): vạt trái đè vạt phải, cổ áo màu viền.
    wrap(ctx, v, c = '#ffffff') { path(ctx, `M -9 ${v.torsoTopY} L 7 ${v.torsoBotY - 6}`, null, INK, 2.8); path(ctx, `M -9 ${v.torsoTopY} L 7 ${v.torsoBotY - 6}`, null, c, 1.6); path(ctx, `M 9 ${v.torsoTopY} L 1 ${v.torsoTopY + 9}`, null, c, 1.6); },
    goreum(ctx, v, c = '#be123c') { path(ctx, `M -2 ${v.torsoTopY + 12} L 4 ${v.torsoTopY + 25} M -2 ${v.torsoTopY + 12} L -6 ${v.torsoTopY + 24}`, null, c, 2.2); ellipse(ctx, -2, v.torsoTopY + 12, 2.6, 2, c, INK, 0.8); },
    apron(ctx, v, c = '#d6c7a1') { path(ctx, `M -9 ${v.torsoTopY + 6} L 9 ${v.torsoTopY + 6} L 11 ${v.torsoBotY + 12} L -11 ${v.torsoBotY + 12} Z`, c, INK, 1.2); line(ctx, [[-9, v.torsoTopY + 6], [-12, v.torsoTopY]], c, 1.4); line(ctx, [[9, v.torsoTopY + 6], [12, v.torsoTopY]], c, 1.4); },
    vest(ctx, v, c) { path(ctx, `M -14 ${v.torsoTopY} Q -17 ${v.torsoBotY + 2} -11 ${v.torsoBotY} L -3 ${v.torsoBotY} L -3 ${v.torsoTopY + 8} L -8 ${v.torsoTopY} Z`, c, INK, 1.2); path(ctx, `M 14 ${v.torsoTopY} Q 17 ${v.torsoBotY + 2} 11 ${v.torsoBotY} L 3 ${v.torsoBotY} L 3 ${v.torsoTopY + 8} L 8 ${v.torsoTopY} Z`, c, INK, 1.2); },
    reflect(ctx, v, c = '#e5e7eb') { line(ctx, [[-15, v.torsoBotY - 7], [15, v.torsoBotY - 7]], c, 2.4); line(ctx, [[-7, v.torsoTopY + 1], [-7, v.torsoBotY]], c, 2); line(ctx, [[7, v.torsoTopY + 1], [7, v.torsoBotY]], c, 2); },
    stripe_h(ctx, v, c) { line(ctx, [[-15, v.torsoBotY - 8], [15, v.torsoBotY - 8]], c, 2.4); },
    stripes_v(ctx, v, c) { for (let x = -10; x <= 10; x += 5) line(ctx, [[x, v.torsoTopY + 2], [x, v.torsoBotY - 1]], c, 1.2); },
    check(ctx, v, c) { for (let x = -10; x <= 10; x += 5) line(ctx, [[x, v.torsoTopY + 2], [x, v.torsoBotY - 1]], c, 1.1); for (let y = v.torsoTopY + 5; y < v.torsoBotY; y += 5) line(ctx, [[-13, y], [13, y]], c, 1.1); },
    pocket(ctx, v, c) { path(ctx, `M 3 ${v.torsoTopY + 7} L 10 ${v.torsoTopY + 7} L 10 ${v.torsoTopY + 13} L 3 ${v.torsoTopY + 13} Z`, c, INK, 0.9); },
    badge(ctx, v, c = '#eab308') { ellipse(ctx, -7, v.torsoTopY + 8, 2.4, 2.4, c, INK, 0.8); },
    wings(ctx, v, c = '#eab308') { path(ctx, `M -12 ${v.torsoTopY + 8} Q -8 ${v.torsoTopY + 5} -5 ${v.torsoTopY + 8} Q -8 ${v.torsoTopY + 10} -12 ${v.torsoTopY + 8} Z`, c, INK, 0.7); },
    plus(ctx, v, c = '#16a34a') { line(ctx, [[0, v.torsoTopY + 6], [0, v.torsoTopY + 14]], c, 2.2); line(ctx, [[-4, v.torsoTopY + 10], [4, v.torsoTopY + 10]], c, 2.2); },
    plates(ctx, v, c) { for (let y = v.torsoTopY + 6; y < v.torsoBotY; y += 5) path(ctx, `M -13 ${y} Q 0 ${y + 3} 13 ${y}`, null, c, 1.2); },
    rings(ctx, v, c) { for (let y = v.torsoTopY + 4; y < v.torsoBotY; y += 3.5) for (let x = -12; x <= 12; x += 4) ellipse(ctx, x + (y % 7 ? 2 : 0), y, 1.3, 1, null, c, 0.6); },
    fur_hem(ctx, v, c) { for (let x = -12; x <= 12; x += 4) path(ctx, `M ${x - 2} ${v.torsoBotY + 2} L ${x} ${v.torsoBotY + 6} L ${x + 2} ${v.torsoBotY + 2}`, c, null); },
    one_shoulder(ctx, v, c) { path(ctx, `M 14 ${v.torsoTopY} L 6 ${v.torsoTopY} L -14 ${v.torsoBotY - 4}`, null, c, 3); },
    toga_fold(ctx, v, c) { for (const dy of [4, 10, 16]) path(ctx, `M -12 ${v.torsoTopY + dy} Q 0 ${v.torsoTopY + dy + 6} 13 ${v.torsoTopY + dy - 4}`, null, c, 1.1); },
    sailor(ctx, v, c = '#1e3a8a') { path(ctx, `M -12 ${v.torsoTopY} L 0 ${v.torsoTopY + 12} L 12 ${v.torsoTopY} L 12 ${v.torsoTopY + 4} L 0 ${v.torsoTopY + 15} L -12 ${v.torsoTopY + 4} Z`, c, INK, 1.0); path(ctx, `M -3 ${v.torsoTopY + 14} L 3 ${v.torsoTopY + 14} L 0 ${v.torsoTopY + 20} Z`, '#dc2626', null); },
    tie(ctx, v, c = '#b91c1c') { path(ctx, `M -1.5 ${v.torsoTopY + 2} L 1.5 ${v.torsoTopY + 2} L 2.5 ${v.torsoTopY + 14} L 0 ${v.torsoTopY + 17} L -2.5 ${v.torsoTopY + 14} Z`, c, INK, 0.8); },
    ridges(ctx, v, c) { for (const x of [-9, 0, 9]) path(ctx, `M ${x} ${v.torsoTopY - 2} Q ${x * 1.5} ${(v.torsoTopY + v.torsoBotY) / 2} ${x} ${v.torsoBotY + 4}`, null, c, 1.3); },
    jack_o(ctx, v, c = '#1c1917') { path(ctx, `M -7 ${v.torsoTopY + 8} L -3 ${v.torsoTopY + 5} L -3 ${v.torsoTopY + 9} Z M 7 ${v.torsoTopY + 8} L 3 ${v.torsoTopY + 5} L 3 ${v.torsoTopY + 9} Z`, c, null); path(ctx, `M -8 ${v.torsoTopY + 14} Q 0 ${v.torsoTopY + 20} 8 ${v.torsoTopY + 14} L 4 ${v.torsoTopY + 15} L 2 ${v.torsoTopY + 13} L -2 ${v.torsoTopY + 15} L -5 ${v.torsoTopY + 13} Z`, c, null); },
    belly(ctx, v, c) { ellipse(ctx, 0, (v.torsoTopY + v.torsoBotY) / 2 + 2, 8, 10, c, INK, 1.0); for (let y = v.torsoTopY + 6; y < v.torsoBotY - 2; y += 4) line(ctx, [[-6, y], [6, y]], tone(c, -0.15), 0.8); },
    white_trim(ctx, v, c = '#ffffff') { line(ctx, [[0, v.torsoTopY], [0, v.torsoBotY]], c, 3); line(ctx, [[-16, v.torsoBotY + 1], [16, v.torsoBotY + 1]], c, 3.5); },
    corset(ctx, v, c) { path(ctx, `M -11 ${v.torsoTopY + 6} L 11 ${v.torsoTopY + 6} L 10 ${v.torsoBotY} L -10 ${v.torsoBotY} Z`, c, INK, 1.2); for (let y = v.torsoTopY + 9; y < v.torsoBotY - 1; y += 3) line(ctx, [[-2, y], [2, y + 1.5]], '#f5f5f4', 0.8); },
    suspenders(ctx, v, c) { line(ctx, [[-7, v.torsoTopY], [-7, v.torsoBotY]], c, 2.6); line(ctx, [[7, v.torsoTopY], [7, v.torsoBotY]], c, 2.6); line(ctx, [[-7, v.torsoTopY + 9], [7, v.torsoTopY + 9]], c, 2.4); },
    bib(ctx, v, c) { path(ctx, `M -8 ${v.torsoTopY + 6} L 8 ${v.torsoTopY + 6} L 9 ${v.torsoBotY} L -9 ${v.torsoBotY} Z`, c, INK, 1.2); line(ctx, [[-8, v.torsoTopY + 6], [-11, v.torsoTopY]], c, 2); line(ctx, [[8, v.torsoTopY + 6], [11, v.torsoTopY]], c, 2); ellipse(ctx, -6, v.torsoTopY + 7, 1.2, 1.2, '#eab308', null); ellipse(ctx, 6, v.torsoTopY + 7, 1.2, 1.2, '#eab308', null); },
    fringe(ctx, v, c) { for (let x = -12; x <= 12; x += 3) line(ctx, [[x, v.torsoTopY + 12], [x - 0.5, v.torsoTopY + 16]], c, 1); line(ctx, [[-13, v.torsoTopY + 12], [13, v.torsoTopY + 12]], c, 1.3); },
    puffs(ctx, v, c) { for (let y = v.torsoTopY + 7; y < v.torsoBotY; y += 6) path(ctx, `M -14 ${y} Q 0 ${y + 3} 14 ${y}`, null, c, 1.2); },
    hem_zigzag(ctx, v, c) { for (let x = -14; x < 14; x += 5) path(ctx, `M ${x} ${v.torsoBotY + 14} L ${x + 2.5} ${v.torsoBotY + 19} L ${x + 5} ${v.torsoBotY + 14}`, null, c, 1.2); },
  };

  // ---------------------------------------------------------------- áo (top)
  // kind: shirt | coat (dài, loe) | robe (dài tới gối, loe mạnh) | short (áo ngắn jeogori) | round (bí ngô)
  //       | sheet (khăn trùm ma) | suit (liền thân).  sleeve: short | long | none | wide.
  const TOPS = {
    firefighter_coat: { kind: 'coat', color: '#1e293b', len: 5, sleeve: 'long', details: [['reflect', '#facc15'], ['zip', '#facc15']], cuff: '#facc15' },
    pilot_jacket: { kind: 'shirt', color: '#1e3a8a', sleeve: 'long', details: [['double_buttons', '#eab308'], ['wings', '#eab308'], ['collar', '#f8fafc']], cuff: '#eab308' },
    space_suit: { kind: 'suit', color: '#f1f5f9', sleeve: 'long', details: [['badge', '#38bdf8'], ['stripe_h', '#94a3b8']], cuff: '#94a3b8', glove: '#e2e8f0' },
    hi_vis_vest: { kind: 'shirt', color: '#facc15', sleeve: 'short', sleeveColor: '#64748b', details: [['reflect', '#f8fafc']] },
    safety_vest: { kind: 'shirt', color: '#f97316', sleeve: 'short', keepShirtSleeve: true, details: [['reflect', '#f8fafc']] },
    lab_coat: { kind: 'coat', color: '#ffffff', len: 8, sleeve: 'long', details: [['lapels', '#f1f5f9'], ['pocket', '#f1f5f9'], ['buttons', '#94a3b8']] },
    mail_shirt: { kind: 'shirt', color: '#60a5fa', sleeve: 'short', details: [['collar', '#1e3a8a'], ['pocket', '#3b82f6'], ['badge', '#f8fafc']] },
    conductor_vest: { kind: 'shirt', color: '#f8fafc', sleeve: 'long', details: [['vest', '#1e3a8a'], ['buttons', '#eab308'], ['tie', '#b91c1c']] },
    chef_coat: { kind: 'shirt', color: '#ffffff', sleeve: 'long', details: [['double_buttons', '#1e293b'], ['collar', '#ffffff']] },
    overalls: { kind: 'shirt', color: '#ef4444', sleeve: 'short', details: [['check', '#b91c1c'], ['bib', '#2563eb']] },
    safari_shirt: { kind: 'shirt', color: '#d6b98c', sleeve: 'short', details: [['collar', '#c8a877'], ['pocket', '#c8a877'], ['buttons', '#78350f']] },
    wetsuit_top: { kind: 'suit', color: '#0f172a', sleeve: 'long', details: [['stripe_h', '#0ea5e9'], ['zip', '#0ea5e9']] },
    fur_tunic: { kind: 'robe', color: '#92400e', len: 6, sleeve: 'none', details: [['one_shoulder', '#78350f'], ['fur_hem', '#78350f']] },
    linen_kilt: { kind: 'shirt', color: '#f5f0dc', sleeve: 'none', details: [['stripe_h', '#d6c89c']] },
    shendyt_tunic: { kind: 'shirt', color: '#fefce8', sleeve: 'none', details: [['stripes_v', '#e7e1c4']] },
    chiton_top: { kind: 'robe', color: '#f8fafc', len: 4, sleeve: 'short', details: [['toga_fold', '#cbd5e1'], ['belt', '#b45309']] },
    toga_top: { kind: 'robe', color: '#f8fafc', len: 4, sleeve: 'short', details: [['one_shoulder', '#7c2d12'], ['toga_fold', '#cbd5e1']] },
    lorica_armor: { kind: 'shirt', color: '#a1a1aa', sleeve: 'short', sleeveColor: '#b91c1c', details: [['plates', '#52525b'], ['belt', '#78350f']] },
    tunic_wool: { kind: 'robe', color: '#57534e', len: 6, sleeve: 'long', details: [['belt', '#3f2a1a'], ['collar', '#a8a29e']] },
    surcoat_armor: { kind: 'robe', color: '#1d4ed8', len: 5, sleeve: 'long', sleeveColor: '#94a3b8', details: [['plus', '#facc15'], ['belt', '#3f2a1a']] },
    peasant_tunic: { kind: 'robe', color: '#a16207', len: 5, sleeve: 'long', details: [['belt', '#57534e']] },
    printer_apron: { kind: 'shirt', color: '#f5f5f4', sleeve: 'long', details: [['apron', '#78716c']] },
    waistcoat_vest: { kind: 'shirt', color: '#f8fafc', sleeve: 'long', details: [['vest', '#7c2d12'], ['buttons', '#eab308'], ['tie', '#1e293b']] },
    bomber_jacket: { kind: 'shirt', color: '#78350f', sleeve: 'long', details: [['collar', '#f5f5f4'], ['zip', '#d6d3d1']], cuff: '#57534e' },
    pioneer_dress: { kind: 'shirt', color: '#93c5fd', sleeve: 'long', details: [['collar', '#ffffff'], ['apron', '#f8fafc']] },
    western_shirt: { kind: 'shirt', color: '#dc2626', sleeve: 'long', details: [['fringe', '#fef3c7'], ['buttons', '#fef3c7'], ['belt', '#3f2a1a']] },
    haori_top: { kind: 'robe', color: '#1e293b', len: 5, sleeve: 'wide', details: [['wrap', '#e2e8f0'], ['obi', '#78716c']] },
    happi_coat: { kind: 'coat', color: '#1d4ed8', len: 4, sleeve: 'wide', details: [['wrap', '#f8fafc'], ['sash', '#f8fafc']] },
    durumagi_robe: { kind: 'robe', color: '#f1f5f9', len: 10, sleeve: 'wide', details: [['wrap', '#cbd5e1'], ['goreum', '#1e3a8a']] },
    jeogori_top: { kind: 'short', color: '#fef3c7', sleeve: 'long', details: [['wrap', '#ffffff'], ['goreum', '#a16207']] },
    jeogori_silk: { kind: 'short', color: '#facc15', sleeve: 'long', cuff: '#e11d48', details: [['wrap', '#ffffff'], ['goreum', '#be123c']] },
    dirndl_corset: { kind: 'shirt', color: '#ffffff', sleeve: 'puff', details: [['corset', '#047857']] },
    checkered_shirt: { kind: 'shirt', color: '#fef2f2', sleeve: 'short', details: [['check', '#dc2626']] },
    yukata_top: { kind: 'shirt', color: '#0ea5e9', sleeve: 'wide', details: [['wrap', '#f8fafc'], ['obi', '#fbbf24']] },
    kimono_top: { kind: 'shirt', color: '#db2777', sleeve: 'wide', details: [['wrap', '#fef3c7'], ['obi', '#fbbf24']] },
    sailor_or_gakuran_top: { kind: 'shirt', color: '#f8fafc', sleeve: 'long', cuff: '#1e3a8a', details: [['sailor', '#1e3a8a']] },
    kr_blazer_top: { kind: 'shirt', color: '#1e3a8a', sleeve: 'long', details: [['lapels', '#1e40af'], ['tie', '#b91c1c'], ['badge', '#eab308']] },
    puffer_jacket: { kind: 'coat', color: '#ef4444', len: 3, sleeve: 'long', details: [['puffs', '#b91c1c'], ['zip', '#f8fafc']] },
    yellow_raincoat: { kind: 'coat', color: '#facc15', len: 6, sleeve: 'long', details: [['buttons', '#1e293b']] },
    sheet_body: { kind: 'sheet', color: '#f8fafc', sleeve: 'sheet' },
    pumpkin_body: { kind: 'round', color: '#f97316', sleeve: 'none', details: [['ridges', '#c2410c'], ['jack_o']] },
    black_dress: { kind: 'robe', color: '#312e81', len: 4, sleeve: 'long', details: [['belt', '#a855f7']] },
    dino_suit: { kind: 'suit', color: '#22c55e', sleeve: 'long', details: [['belly', '#bbf7d0']], glove: '#22c55e' },
    red_coat: { kind: 'coat', color: '#dc2626', len: 5, sleeve: 'long', cuff: '#ffffff', details: [['white_trim'], ['belt', '#1c1917']] },
    orange_life_vest: { kind: 'shirt', color: '#f97316', sleeve: 'none', details: [['stripe_h', '#1e293b'], ['reflect', '#e5e7eb']] },
    sport_shirt: { kind: 'shirt', color: '#22c55e', sleeve: 'short', details: [['stripe_h', '#f8fafc']] },
    swimsuit: { kind: 'shirt', color: '#0ea5e9', sleeve: 'none', details: [['stripes_v', '#38bdf8']] },
    regular_top: null,     // giữ áo của nhân vật (vd. chỉ đội mũ phòng thiên tai)
  };

  // ---------------------------------------------------------------- quần / váy (bottom)
  // kind: pants | shorts (tới gối) | skirt (váy tới gối) | long_skirt (tới mắt cá, che chân) | wide (hakama/quần ống rộng)
  //       | kilt (váy quấn ngắn) | tights (bó sát) | sheet (vạt khăn ma che chân) | strips (váy dải giáp La Mã).
  const BOTTOMS = {
    firefighter_pants: { kind: 'pants', color: '#1e293b', band: '#facc15' },
    space_pants: { kind: 'pants', color: '#f1f5f9', width: 1.25, band: '#94a3b8' },
    work_pants: { kind: 'pants', color: '#334155' },
    pilot_pants: { kind: 'pants', color: '#1e3a8a' },
    chef_pants: { kind: 'pants', color: '#1f2937', check: '#f8fafc' },
    overalls_legs: { kind: 'pants', color: '#2563eb' },
    safari_shorts: { kind: 'shorts', color: '#b08d57' },
    wetsuit_bottom: { kind: 'pants', color: '#0f172a', band: '#0ea5e9' },
    fur_bottom: { kind: 'kilt', color: '#92400e', zigzag: true },
    linen_skirt: { kind: 'kilt', color: '#f5f0dc', pleats: '#d6c89c' },
    shendyt_skirt: { kind: 'kilt', color: '#fefce8', pleats: '#e7d99a', belt: '#eab308' },
    chiton_bottom: { kind: 'skirt', color: '#f8fafc', pleats: '#cbd5e1' },
    toga_bottom: { kind: 'long_skirt', color: '#f8fafc', pleats: '#cbd5e1' },
    pteruges_skirt: { kind: 'strips', color: '#b91c1c', strip: '#78350f' },
    trousers_wool: { kind: 'pants', color: '#78716c', wraps: '#57534e' },
    chainmail_legs: { kind: 'pants', color: '#94a3b8', rings: '#64748b' },
    breeches: { kind: 'pants', color: '#a16207', knee: true },
    hose_pants: { kind: 'tights', color: '#7f1d1d' },
    trousers: { kind: 'pants', color: '#44403c' },
    prairie_skirt: { kind: 'long_skirt', color: '#60a5fa', ruffle: '#f8fafc' },
    jeans_chaps: { kind: 'pants', color: '#1d4ed8', chaps: '#92400e' },
    hakama_pants: { kind: 'wide', color: '#475569', pleats: '#334155' },
    momohiki_pants: { kind: 'tights', color: '#1e293b' },
    baji_pants: { kind: 'wide', color: '#f8fafc', tie: '#cbd5e1' },
    baji_white: { kind: 'wide', color: '#f8fafc', tie: '#cbd5e1' },
    dirndl_skirt: { kind: 'skirt', color: '#047857', apron: '#f8fafc' },
    lederhosen_shorts: { kind: 'shorts', color: '#78350f', stitch: '#fcd34d' },
    yukata_skirt: { kind: 'long_skirt', color: '#0ea5e9', pattern: '#f8fafc' },
    kimono_skirt: { kind: 'long_skirt', color: '#db2777', pattern: '#fde68a' },
    chima_skirt: { kind: 'long_skirt', color: '#e11d48', high: true, flare: 6 },
    pleated_skirt_or_pants: { kind: 'skirt', color: '#1e3a8a', pleats: '#172554' },
    kr_skirt_or_pants: { kind: 'skirt', color: '#374151', pleats: '#1f2937' },
    warm_pants: { kind: 'pants', color: '#1e3a8a', width: 1.15 },
    rain_pants: { kind: 'pants', color: '#eab308' },
    sheet_flow: { kind: 'sheet', color: '#f8fafc' },
    green_tights: { kind: 'tights', color: '#16a34a' },
    purple_skirt: { kind: 'skirt', color: '#7c3aed', zigzag: true },
    dino_legs: { kind: 'pants', color: '#22c55e', width: 1.2 },
    red_pants: { kind: 'pants', color: '#dc2626' },
    swim_trunks: { kind: 'shorts', color: '#0ea5e9', short: true },
    shorts: { kind: 'shorts', color: '#1f2937' },
    swim_bottom: { kind: 'shorts', color: '#0ea5e9', short: true },
    regular_pants: null,   // giữ quần của nhân vật
    regular_bottom: null,
  };

  // ---------------------------------------------------------------- giày (shoes)
  // kind: shoe | boot (cao cổ) | sandal | geta | zori | flipper | claw | wrap (quấn lông) | plated | barefoot | hidden.
  const SHOES = {
    boots: { kind: 'boot', color: '#1c1917', h: 7 },
    shoes: null,  // giữ giày của nhân vật
    space_boots: { kind: 'boot', color: '#e2e8f0', h: 7, band: '#38bdf8' },
    flippers: { kind: 'flipper', color: '#0ea5e9' },
    fur_wraps: { kind: 'wrap', color: '#92400e' },
    sandals: { kind: 'sandal', color: '#92400e' },
    caligae_boots: { kind: 'sandal', color: '#78350f', high: true },
    turnshoes: { kind: 'shoe', color: '#57534e' },
    sabatons: { kind: 'plated', color: '#94a3b8' },
    oxfords: { kind: 'shoe', color: '#3f2a1a' },
    high_boots: { kind: 'boot', color: '#3f2a1a', h: 10 },
    cowboy_boots: { kind: 'boot', color: '#92400e', h: 9, band: '#fcd34d' },
    geta: { kind: 'geta', color: '#b45309' },
    tabi_shoes: { kind: 'shoe', color: '#1e293b', split: true },
    jipsin_sandals: { kind: 'sandal', color: '#d6b98c', straw: true },
    trachten_shoes: { kind: 'shoe', color: '#1c1917', buckle: '#d6d3d1' },
    haferlschuhe: { kind: 'shoe', color: '#78350f', lace: '#f5f5f4' },
    zori: { kind: 'zori', color: '#fef3c7' },
    kkotsin: { kind: 'shoe', color: '#ec4899', flower: '#facc15' },
    loafers: { kind: 'shoe', color: '#44403c' },
    sneakers: { kind: 'shoe', color: '#f8fafc', lace: '#ef4444', sole: '#e5e7eb' },
    winter_boots: { kind: 'boot', color: '#78350f', h: 8, fur: '#f5f5f4' },
    gumboots: { kind: 'boot', color: '#facc15', h: 10 },
    hidden: { kind: 'hidden' },
    dino_claws: { kind: 'claw', color: '#22c55e' },
    black_belt_boots: { kind: 'boot', color: '#1c1917', h: 9, fur: '#ffffff' },
    barefoot: { kind: 'barefoot' },
  };

  // ---------------------------------------------------------------- mũ / đồ đội đầu (head)
  // kind: cap | helmet | brim | bowler | gat | pointed | hood | band | pin | wreath | beanie | toque | nemes | wig
  //       | bubble (mũ phi hành gia, kính vẽ sau mặt) | dive (kính lặn, sau mặt) | topknot | crest | nasal | flaps | bonnet | stem | santa.
  const HEADS = {
    firefighter_helmet: { kind: 'helmet', color: '#dc2626', brim: '#b91c1c', badge: '#facc15', wide: 1.15 },
    pilot_cap: { kind: 'cap', color: '#1e3a8a', band: '#f8fafc', badge: '#eab308' },
    space_helmet: { kind: 'bubble', color: '#f8fafc' },
    hard_hat: { kind: 'helmet', color: '#facc15', brim: '#eab308', ridge: '#ca8a04' },
    mail_cap: { kind: 'cap', color: '#2563eb', badge: '#f8fafc' },
    conductor_cap: { kind: 'cap', color: '#1e293b', band: '#eab308', badge: '#eab308' },
    chef_toque: { kind: 'toque', color: '#ffffff' },
    straw_hat: { kind: 'brim', color: '#fde68a', band: '#dc2626', wide: 34 },
    pith_helmet: { kind: 'helmet', color: '#e7d7a8', brim: '#d6c28c', wide: 1.2 },
    dive_mask: { kind: 'dive', color: '#0ea5e9' },
    linen_nemes: { kind: 'nemes', color: '#fde68a', stripe: '#1d4ed8' },
    noble_wig: { kind: 'wig', color: '#111827', band: '#eab308' },
    olive_wreath: { kind: 'wreath', color: '#65a30d' },
    galea_helmet: { kind: 'crest', color: '#a1a1aa', crest: '#dc2626' },
    spangenhelm: { kind: 'nasal', color: '#9ca3af', band: '#78716c' },
    kettle_helm: { kind: 'brim', color: '#94a3b8', wide: 30, metal: true },
    coif_hood: { kind: 'hood', color: '#d6c7a1' },
    beret_cap: { kind: 'beret', color: '#1f2937' },
    bowler_hat: { kind: 'bowler', color: '#1c1917' },
    leather_flight_cap: { kind: 'flaps', color: '#78350f' },
    bonnet_hat: { kind: 'bonnet', color: '#f8fafc', ribbon: '#60a5fa' },
    cowboy_hat: { kind: 'brim', color: '#92400e', band: '#3f2a1a', wide: 32, dent: true },
    chonmage_cap: { kind: 'topknot', color: '#111827' },
    hachimaki_band: { kind: 'band', color: '#f8fafc', dot: '#dc2626', knot: true },
    gat_hat: { kind: 'gat', color: 'rgba(17, 24, 39, 0.62)' },
    bigeon_band: { kind: 'band', color: '#374151', pin: '#fbbf24' },
    braid_band: { kind: 'braid', color: '#b45309' },
    tyrolean_hat: { kind: 'brim', color: '#15803d', band: '#166534', wide: 24, feather: '#dc2626' },
    flower_clip: { kind: 'pin', color: '#f472b6', flower: true },
    kanzashi_pin: { kind: 'pin', color: '#fbbf24', beads: '#ef4444' },
    baessidaenggi: { kind: 'band', color: '#be123c', pin: '#facc15', ornate: true },
    beanie_pom: { kind: 'beanie', color: '#dc2626', pom: '#ffffff' },
    rain_hood: { kind: 'hood', color: '#facc15' },
    sheet_hood: { kind: 'sheet', color: '#f8fafc' },
    stem_cap: { kind: 'stem', color: '#f97316' },
    witch_hat: { kind: 'pointed', color: '#312e81', band: '#a855f7' },
    dino_hood: { kind: 'dino', color: '#22c55e' },
    red_white_cap: { kind: 'santa', color: '#dc2626' },
    bike_helmet: { kind: 'helmet', color: '#0284c7', vents: '#f8fafc', strap: true },
    bosai_cushion_hood: { kind: 'hood', color: '#facc15', quilt: '#ca8a04', padded: true },
  };

  // ---------------------------------------------------------------- đồ sau lưng và phụ kiện mặt
  const BACKS = {
    oxygen_tank: { behind(ctx, v) { for (const x of [-17, 17]) { path(ctx, `M ${x - 4} ${v.torsoTopY - 6} L ${x + 4} ${v.torsoTopY - 6} L ${x + 4} ${v.torsoBotY - 2} L ${x - 4} ${v.torsoBotY - 2} Z`, '#cbd5e1', INK, 1.3); ellipse(ctx, x, v.torsoTopY - 6, 4, 2, '#94a3b8', INK, 1); } } },
    mail_bag: { front(ctx, v) { line(ctx, [[12, v.torsoTopY], [-10, v.torsoBotY - 4]], '#78350f', 2.4); path(ctx, `M -19 ${v.torsoBotY - 8} L -7 ${v.torsoBotY - 8} L -7 ${v.torsoBotY + 4} L -19 ${v.torsoBotY + 4} Z`, '#a16207', INK, 1.2); line(ctx, [[-19, v.torsoBotY - 4], [-7, v.torsoBotY - 4]], '#78350f', 1.2); } },
    dino_tail: { behind(ctx, v) { path(ctx, `M -8 ${v.torsoBotY - 2} Q -26 ${v.torsoBotY + 4} -34 ${v.torsoBotY + 14} Q -22 ${v.torsoBotY + 12} -6 ${v.torsoBotY + 6} Z`, '#22c55e', INK, 1.4); for (const k of [0.3, 0.55, 0.8]) path(ctx, `M ${-8 - 26 * k} ${v.torsoBotY + 2 + 10 * k} l -2 -5 l 4 1 Z`, '#facc15', null); } },
    ring_float: { front(ctx, v) { ellipse(ctx, 0, v.torsoBotY + 1, 20, 7, '#ef4444', INK, 1.6); for (const x of [-14, 0, 14]) ellipse(ctx, x, v.torsoBotY + 1 + (x ? 0 : 5), 3.5, 2.6, '#ffffff', null); ellipse(ctx, 0, v.torsoBotY - 1, 13, 3, 'rgba(0,0,0,0.12)', null); } },
  };
  const FACE_ACCS = {
    goggles: { coversEyes: true, overlay(ctx, v) { const y = v.headY - 1; line(ctx, [[-20, y - 1], [20, y - 1]], '#334155', 2); for (const x of [-9, 9]) { ellipse(ctx, x, y, 7, 6, 'rgba(125, 211, 252, 0.45)', '#0f172a', 1.8); line(ctx, [[x - 3, y - 3], [x + 1, y - 4]], '#ffffff', 1.2); } } },
    flight_goggles: { front(ctx, v) { const y = v.headY - 15; line(ctx, [[-20, y], [20, y]], '#78350f', 2.4); for (const x of [-7, 7]) ellipse(ctx, x, y, 5.5, 4.5, '#bae6fd', '#57534e', 1.8); } },
    kf94_mask: { overlay(ctx, v) { const y = v.headY + 7; path(ctx, `M -13 ${y - 6} Q 0 ${y - 9} 13 ${y - 6} L 11 ${y + 6} Q 0 ${y + 10} -11 ${y + 6} Z`, '#f8fafc', '#94a3b8', 1.2); line(ctx, [[0, y - 8], [0, y + 8]], '#e2e8f0', 1); line(ctx, [[-13, y - 5], [-19, y - 8]], '#cbd5e1', 1); line(ctx, [[13, y - 5], [19, y - 8]], '#cbd5e1', 1); } },
    collar: { chest(ctx, v) { const y = v.torsoTopY; path(ctx, `M -13 ${y + 1} Q 0 ${y + 16} 13 ${y + 1} Q 0 ${y + 8} -13 ${y + 1} Z`, '#eab308', INK, 1.2); path(ctx, `M -11 ${y + 3} Q 0 ${y + 13} 11 ${y + 3}`, null, '#1d4ed8', 1.6); path(ctx, `M -9 ${y + 5} Q 0 ${y + 11} 9 ${y + 5}`, null, '#dc2626', 1.2); } },
  };

  // ================================================================= kiểu may
  function drawTop(ctx, v, p) {
    const top = v.torsoTopY, bot = v.torsoBotY;
    if (p.kind === 'round') {
      ellipse(ctx, 0, (top + bot) / 2 + 1, 21, 17, p.color, INK, 1.8);
      ellipse(ctx, 0, top - 1, 4, 2.2, '#15803d', INK, 1);
    } else if (p.kind === 'sheet') {
      path(ctx, `M -16 ${top - 4} Q -24 ${bot + 8} -22 ${bot + 20} Q -14 ${bot + 16} -9 ${bot + 21} Q -3 ${bot + 16} 3 ${bot + 21} Q 9 ${bot + 16} 14 ${bot + 21} Q 20 ${bot + 16} 22 ${bot + 20} Q 24 ${bot + 8} 16 ${top - 4} Z`, p.color, INK, 1.8);
    } else if (p.kind === 'short') {
      torso(ctx, v, p.color, -(bot - top) + 16, 0);
    } else {
      const len = p.len || 0, flare = p.kind === 'robe' ? 3 : p.kind === 'coat' ? 1.5 : 0;
      torso(ctx, v, p.color, len, flare);
    }
    for (const [name, c] of p.details || []) DETAILS[name](ctx, v, c);
  }
  // Tay áo theo khung xương chibiSkeleton; sleeve = short | long | none | wide | puff | sheet.
  function drawArms(ctx, v, p) {
    const c = p.sleeveColor || p.color, skin = v.skin;
    for (const [sh, el, hd] of [[v.shoulderL, v.elbowL, v.handL], [v.shoulderR, v.elbowR, v.handR]]) {
      const ang = Math.atan2(hd[1] - el[1], hd[0] - el[0]);
      if (p.sleeve === 'sheet') {
        path(ctx, `M ${sh[0]} ${sh[1] - 3} L ${el[0]} ${el[1]} L ${hd[0]} ${hd[1] + 4} L ${hd[0] * 0.8} ${hd[1] + 8} L ${sh[0] * 0.7} ${sh[1] + 8} Z`, c, INK, 1.2);
        continue;
      }
      const upper = p.sleeve === 'none' ? skin : p.keepShirtSleeve ? v.shirtCol : c;
      const lower = p.sleeve === 'long' || p.sleeve === 'wide' ? c : skin;
      taper(ctx, sh[0], sh[1], el[0], el[1], p.sleeve === 'puff' ? 5.2 : 4.2, 3.8, upper, INK, 1.4);
      if (p.sleeve === 'puff') ellipse(ctx, (sh[0] + el[0]) / 2, (sh[1] + el[1]) / 2, 5.5, 4.5, c, INK, 1.2);
      taper(ctx, el[0], el[1], hd[0], hd[1], 3.8, 3.2, lower, INK, 1.4);
      if (p.sleeve === 'wide') path(ctx, `M ${el[0] - 4} ${el[1]} L ${el[0] + 4} ${el[1]} L ${el[0] + 3} ${el[1] + 12} L ${el[0] - 5} ${el[1] + 10} Z`, c, INK, 1.2);
      if (p.cuff && lower === c) { const cx = el[0] + (hd[0] - el[0]) * 0.78, cy = el[1] + (hd[1] - el[1]) * 0.78; ellipse(ctx, cx, cy, 3.6, 2.2, p.cuff, INK, 0.8, ang + Math.PI / 2); }
      mitten(ctx, hd[0], hd[1], 4.2, p.glove || skin, ang);
    }
  }
  function drawBottom(ctx, v, p) {
    const hip = v.hipY;
    const legs = (fill, lift) => { leg(ctx, v, -1, fill, 4.6, 4, lift); leg(ctx, v, 1, fill, 4.6, 4, lift); };
    if (p.kind === 'pants') {
      const w = p.width || 1;
      leg(ctx, v, -1, p.color, 5.5 * w, 4.5 * w); leg(ctx, v, 1, p.color, 5.5 * w, 4.5 * w);
      for (const side of [-1, 1]) {
        const [bx, by] = legPoint(v, side, 0.95);
        if (p.band) line(ctx, [[bx - 5, by], [bx + 5, by]], p.band, 2);
        if (p.wraps) for (const k of [0.55, 0.7, 0.85]) { const [x, y] = legPoint(v, side, k); line(ctx, [[x - 5, y - 1], [x + 5, y + 1]], p.wraps, 1.2); }
        if (p.rings) for (const k of [0.2, 0.4, 0.6, 0.8]) { const [x, y] = legPoint(v, side, k); line(ctx, [[x - 4, y], [x + 4, y]], p.rings, 0.9); }
        if (p.knee) { const [x, y] = legPoint(v, side, 0.6); line(ctx, [[x - 5, y], [x + 5, y]], tone(p.color, -0.3), 1.6); }
        if (p.chaps) { const [x, y] = legPoint(v, side, 0.45); taper(ctx, side * 8, hip + 2, x + side * 2, y + 8, 3, 3, p.chaps, INK, 1); }
        if (p.check) for (const k of [0.3, 0.6]) { const [x, y] = legPoint(v, side, k); ellipse(ctx, x, y, 1.2, 1.2, p.check, null); }
      }
      return;
    }
    if (p.kind === 'tights') { leg(ctx, v, -1, p.color, 4.6, 4); leg(ctx, v, 1, p.color, 4.6, 4); return; }
    if (p.kind === 'sheet') { return; }   // vạt khăn ma (áo `sheet`) đã che chân
    // Các kiểu còn lại để lộ chân (da) phía dưới vải
    if (p.kind !== 'long_skirt' && p.kind !== 'wide') legs(v.skin, 5);
    if (p.kind === 'shorts') {
      const k = p.short ? 0.28 : 0.45;
      for (const side of [-1, 1]) { const [x, y] = legPoint(v, side, k); taper(ctx, side * 7, hip, x, y, 6, 5.6, p.color, INK, 1.3); if (p.stitch) line(ctx, [[x - 4, y - 2], [x + 4, y - 2]], p.stitch, 0.9); }
      if (p.stitch) { line(ctx, [[-7, hip - 1], [-6, v.torsoBotY]], p.stitch, 0.9); line(ctx, [[7, hip - 1], [6, v.torsoBotY]], p.stitch, 0.9); }
      return;
    }
    if (p.kind === 'wide') {
      for (const side of [-1, 1]) { const x = side < 0 ? v.legLeftX : v.legRightX, fy = side < 0 ? v.footLeftY : v.footRightY; path(ctx, `M ${side * 1} ${hip - 2} L ${side * 13} ${hip - 2} L ${x + side * 8} ${fy - 4} L ${x - side * 6} ${fy - 4} Z`, p.color, INK, 1.3); if (p.pleats) line(ctx, [[side * 7, hip], [x + side * 1, fy - 5]], p.pleats, 1); if (p.tie) line(ctx, [[x - 5, fy - 6], [x + 5, fy - 6]], p.tie, 1.4); }
      return;
    }
    const top = p.high ? v.torsoTopY + 14 : v.torsoBotY - 2;
    const hem = p.kind === 'long_skirt' ? Math.max(v.footLeftY, v.footRightY) - 5 : p.kind === 'kilt' ? hip + 9 : hip + 13;
    if (p.kind === 'strips') {
      for (let x = -13; x <= 9; x += 5.5) path(ctx, `M ${x} ${v.torsoBotY - 1} L ${x + 4.5} ${v.torsoBotY - 1} L ${x + 4.5} ${hip + 11} L ${x} ${hip + 11} Z`, p.color, INK, 1.0);
      line(ctx, [[-14, v.torsoBotY], [14, v.torsoBotY]], p.strip, 2.6);
      return;
    }
    const fl = p.flare || (p.kind === 'long_skirt' ? 4 : 3);
    path(ctx, `M -13 ${top} Q ${-17 - fl} ${hem - 2} ${-15 - fl} ${hem} L ${15 + fl} ${hem} Q ${17 + fl} ${hem - 2} 13 ${top} Z`, p.color, INK, 1.6);
    if (p.pleats) for (const x of [-8, -3, 3, 8]) line(ctx, [[x * 0.8, top + 3], [x * 1.25, hem - 1]], p.pleats, 1);
    if (p.apron) path(ctx, `M -7 ${top} L 7 ${top} L 8 ${hem - 3} L -8 ${hem - 3} Z`, p.apron, INK, 1.0);
    if (p.ruffle) line(ctx, [[-15 - fl, hem - 1.5], [15 + fl, hem - 1.5]], p.ruffle, 2);
    if (p.zigzag) for (let x = -15; x < 15; x += 5) path(ctx, `M ${x} ${hem} L ${x + 2.5} ${hem + 4} L ${x + 5} ${hem}`, p.color, INK, 1.0);
    if (p.pattern) for (const [x, y] of [[-8, 0.35], [6, 0.55], [-3, 0.8], [9, 0.25]]) ellipse(ctx, x, top + (hem - top) * y, 2, 2, p.pattern, null);
    if (p.belt) line(ctx, [[-14, top + 1], [14, top + 1]], p.belt, 2.4);
  }
  function drawShoes(ctx, v, p) {
    for (const side of [-1, 1]) {
      const x = side < 0 ? v.legLeftX : v.legRightX, fy = side < 0 ? v.footLeftY : v.footRightY;
      if (p.kind === 'hidden') continue;
      if (p.kind === 'barefoot') { ellipse(ctx, x, fy - 2, 5.6, 3.6, v.skin, INK, 1.2); continue; }
      if (p.kind === 'boot') {
        path(ctx, `M ${x - 5} ${fy - 3 - p.h} L ${x + 5} ${fy - 3 - p.h} L ${x + 5} ${fy - 4} L ${x - 5} ${fy - 4} Z`, p.color, INK, 1.2);
        if (p.band) line(ctx, [[x - 5, fy - 1 - p.h], [x + 5, fy - 1 - p.h]], p.band, 1.6);
        if (p.fur) ellipse(ctx, x, fy - 3 - p.h, 6.2, 2.4, p.fur, INK, 0.9);
        ellipse(ctx, x, fy - 2, 6.4, 4.2, p.color, INK, 1.4);
        ellipse(ctx, x, fy, 6, 1.6, tone(p.color, 0.25), null);
        continue;
      }
      if (p.kind === 'shoe' || p.kind === 'plated') {
        ellipse(ctx, x, fy - 2, 6.2, 4.2, p.color, INK, 1.4);
        ellipse(ctx, x, fy, 5.8, 1.6, p.sole || tone(p.color, 0.2), null);
        if (p.kind === 'plated') for (const dy of [-4, -2]) line(ctx, [[x - 5, fy + dy], [x + 5, fy + dy]], '#475569', 0.9);
        if (p.lace) line(ctx, [[x - 2, fy - 4], [x + 2, fy - 4]], p.lace, 1.2);
        if (p.buckle) path(ctx, `M ${x - 1.8} ${fy - 5} L ${x + 1.8} ${fy - 5} L ${x + 1.8} ${fy - 2.5} L ${x - 1.8} ${fy - 2.5} Z`, null, p.buckle, 1);
        if (p.flower) ellipse(ctx, x, fy - 4, 1.8, 1.8, p.flower, null);
        if (p.split) line(ctx, [[x + side * 1.5, fy - 5.5], [x + side * 1.5, fy]], '#0f172a', 0.9);
        continue;
      }
      if (p.kind === 'sandal' || p.kind === 'zori') {
        ellipse(ctx, x, fy - 1.6, 5.8, 3.4, v.skin, INK, 1.1);
        ellipse(ctx, x, fy, 6.4, 1.8, p.color, INK, 1.1);
        if (p.kind === 'zori') path(ctx, `M ${x - 3} ${fy - 1} L ${x} ${fy - 4} L ${x + 3} ${fy - 1}`, null, '#dc2626', 1.4);
        else { line(ctx, [[x - 5, fy - 2.5], [x + 5, fy - 2.5]], p.color, 1.4); if (p.high) for (const dy of [5, 8]) line(ctx, [[x - 4, fy - dy], [x + 4, fy - dy]], p.color, 1.2); if (p.straw) line(ctx, [[x - 4, fy], [x + 4, fy]], '#a16207', 0.8); }
        continue;
      }
      if (p.kind === 'geta') {
        ellipse(ctx, x, fy - 2, 5.4, 3.2, v.skin, INK, 1);
        path(ctx, `M ${x - 6} ${fy - 1.5} L ${x + 6} ${fy - 1.5} L ${x + 6} ${fy} L ${x - 6} ${fy} Z`, p.color, INK, 1.1);
        for (const dx of [-3.5, 3.5]) line(ctx, [[x + dx, fy], [x + dx, fy + 1.2]], '#451a03', 1.6);
        path(ctx, `M ${x - 3} ${fy - 1.5} L ${x} ${fy - 4} L ${x + 3} ${fy - 1.5}`, null, '#1d4ed8', 1.3);
        continue;
      }
      if (p.kind === 'flipper') { path(ctx, `M ${x - 4} ${fy - 4} L ${x + 4} ${fy - 4} L ${x + side * 3 + 7} ${fy + 1} L ${x + side * 3 - 7} ${fy + 1} Z`, p.color, INK, 1.2); continue; }
      if (p.kind === 'claw') { ellipse(ctx, x, fy - 2, 6.4, 4.2, p.color, INK, 1.3); for (const dx of [-3.5, 0, 3.5]) path(ctx, `M ${x + dx - 1.2} ${fy} L ${x + dx} ${fy + 2.2} L ${x + dx + 1.2} ${fy} Z`, '#f8fafc', INK, 0.6); continue; }
      if (p.kind === 'wrap') { ellipse(ctx, x, fy - 2, 6.4, 4.2, p.color, INK, 1.3); for (const dx of [-3, 0, 3]) line(ctx, [[x + dx - 1, fy - 5], [x + dx + 1, fy + 1]], tone(p.color, -0.3), 1); continue; }
    }
  }

  // Mũ: behind = vẽ trước đầu (vạt mũ trùm, tóc giả phía sau), front = vẽ sau tóc, overlay = sau khuôn mặt.
  function headPart(p) {
    const H = v => v.headY;
    switch (p.kind) {
      case 'cap': return { front(ctx, v) { const y = H(v); path(ctx, `M -20 ${y - 7} Q -21 ${y - 27} 0 ${y - 27} Q 21 ${y - 27} 20 ${y - 7} Z`, p.color, INK, 1.4); if (p.band) line(ctx, [[-20, y - 9], [20, y - 9]], p.band, 2.2); ellipse(ctx, 0, y - 7, 21, 3.6, tone(p.color, -0.35), INK, 1.2); if (p.badge) ellipse(ctx, 0, y - 16, 3, 2.6, p.badge, INK, 0.8); } };
      case 'helmet': return { front(ctx, v) { const y = H(v), k = p.wide || 1; path(ctx, `M -21 ${y - 6} Q -22 ${y - 31} 0 ${y - 31} Q 22 ${y - 31} 21 ${y - 6} Z`, p.color, INK, 1.5); ellipse(ctx, 0, y - 6, 23 * k, 3.4, p.brim || tone(p.color, -0.2), INK, 1.2); if (p.ridge) line(ctx, [[0, y - 30], [0, y - 7]], p.ridge, 2); if (p.badge) ellipse(ctx, 0, y - 17, 3.4, 4, p.badge, INK, 0.9); if (p.vents) for (const x of [-9, 0, 9]) ellipse(ctx, x, y - 21, 2.4, 4.5, p.vents, null); if (p.strap) { line(ctx, [[-18, y - 6], [-12, y + 16]], '#1e293b', 1.2); line(ctx, [[18, y - 6], [12, y + 16]], '#1e293b', 1.2); } } };
      case 'brim': return { front(ctx, v) { const y = H(v) - 11; ellipse(ctx, 0, y, p.wide, 5.5, p.color, INK, 1.4); path(ctx, `M -13 ${y} Q -14 ${y - 20} 0 ${y - 20} Q 14 ${y - 20} 13 ${y} Z`, p.metal ? tone(p.color, 0.1) : p.color, INK, 1.4); if (p.dent) path(ctx, `M -5 ${y - 19} Q 0 ${y - 15} 5 ${y - 19}`, null, INK, 1); if (p.band) path(ctx, `M -13 ${y - 3} L 13 ${y - 3} L 13 ${y - 0.5} L -13 ${y - 0.5} Z`, p.band, null); if (p.feather) path(ctx, `M 10 ${y - 3} Q 20 ${y - 12} 18 ${y - 22}`, null, p.feather, 2); } };
      case 'bowler': return { front(ctx, v) { const y = H(v) - 12; ellipse(ctx, 0, y, 22, 3.5, p.color, INK, 1.3); path(ctx, `M -14 ${y} Q -15 ${y - 17} 0 ${y - 17} Q 15 ${y - 17} 14 ${y} Z`, p.color, INK, 1.3); line(ctx, [[-14, y - 2], [14, y - 2]], '#57534e', 1.6); } };
      // Mũ gat Joseon: vành phẳng rất rộng, trong suốt màu đen, chóp trụ thấp, quai hạt dưới cằm.
      case 'gat': return { front(ctx, v) { const y = H(v) - 13; ellipse(ctx, 0, y, 33, 6, p.color, '#111827', 1.3); path(ctx, `M -9 ${y} L -8 ${y - 16} Q 0 ${y - 19} 8 ${y - 16} L 9 ${y} Z`, p.color, '#111827', 1.3); ellipse(ctx, 0, y - 16, 8, 2.2, 'rgba(17, 24, 39, 0.8)', '#111827', 1); for (const side of [-1, 1]) for (let k = 0; k <= 1.001; k += 0.25) ellipse(ctx, side * (22 - 9 * k * k), y + 6 + 29 * k, 1.2, 1.2, '#78350f', null); } };
      case 'pointed': return { front(ctx, v) { const y = H(v) - 12; ellipse(ctx, 0, y, 29, 5, p.color, INK, 1.3); path(ctx, `M -14 ${y} Q -6 ${y - 26} 8 ${y - 42} Q 4 ${y - 22} 14 ${y} Z`, p.color, INK, 1.3); path(ctx, `M -13 ${y - 3} L 13 ${y - 3} L 13 ${y} L -13 ${y} Z`, p.band, null); } };
      // Mũ trùm (coif, áo mưa, mũ phòng thiên tai): vành sau đầu + viền ôm quanh mặt, CHỪA mắt và miệng.
      case 'hood': return {
        behind(ctx, v) { const y = H(v); ellipse(ctx, 0, y + 1, 26, 26, p.color, INK, 1.6); if (p.padded) path(ctx, `M -24 ${y + 12} Q -26 ${y + 26} -14 ${y + 28} L 14 ${y + 28} Q 26 ${y + 26} 24 ${y + 12} Z`, p.color, INK, 1.4); },
        front(ctx, v) { const y = H(v); path(ctx, `M -23 ${y + 10} Q -26 ${y - 26} 0 ${y - 27} Q 26 ${y - 26} 23 ${y + 10} L 17 ${y + 10} Q 19 ${y - 13} 0 ${y - 14} Q -19 ${y - 13} -17 ${y + 10} Z`, p.color, INK, 1.5); if (p.quilt) { for (const k of [-10, 0, 10]) line(ctx, [[k, y - 26], [k * 0.9, y - 15]], p.quilt, 1); line(ctx, [[-20, y - 3], [-18, y + 8]], p.quilt, 1); line(ctx, [[20, y - 3], [18, y + 8]], p.quilt, 1); } },
      };
      case 'band': return { front(ctx, v) { const y = H(v) - 12; path(ctx, `M -20 ${y - 2} Q 0 ${y - 6} 20 ${y - 2} L 20 ${y + 2} Q 0 ${y - 2} -20 ${y + 2} Z`, p.color, INK, 1.1); if (p.dot) ellipse(ctx, 0, y - 2, 3, 2.4, p.dot, null); if (p.knot) { path(ctx, `M 19 ${y} l 7 -4 l 1 5 Z`, p.color, INK, 1); path(ctx, `M 19 ${y} l 6 6 l -3 2 Z`, p.color, INK, 1); } if (p.pin) { line(ctx, [[-14, y - 10], [2, y - 16]], p.pin, 2); ellipse(ctx, 2, y - 16, 2, 2, p.pin, INK, 0.8); } if (p.ornate) for (const x of [-10, 0, 10]) ellipse(ctx, x, y - 1, 2, 2, '#facc15', INK, 0.6); } };
      case 'braid': return { front(ctx, v) { const y = H(v) - 17; for (let x = -18; x <= 18; x += 4) ellipse(ctx, x, y + Math.abs(x) * 0.28, 2.6, 2.2, p.color, INK, 0.8); } };
      case 'pin': return { front(ctx, v) { const y = H(v) - 16; if (p.flower) { for (let i = 0; i < 5; i++) ellipse(ctx, 15 + Math.cos(i * 1.26) * 3, y + Math.sin(i * 1.26) * 3, 2.4, 2.4, p.color, INK, 0.6); ellipse(ctx, 15, y, 1.6, 1.6, '#facc15', null); } else { line(ctx, [[8, y - 6], [18, y + 2]], p.color, 1.8); ellipse(ctx, 8, y - 6, 3, 3, p.color, INK, 0.8); for (const k of [0, 3, 6]) ellipse(ctx, 18, y + 4 + k, 1.3, 1.3, p.beads, null); } } };
      case 'wreath': return { front(ctx, v) { const y = H(v) - 14; for (let x = -18; x <= 18; x += 4.5) { ellipse(ctx, x, y + Math.abs(x) * 0.25, 3.2, 1.6, p.color, INK, 0.6, x < 0 ? 0.5 : -0.5); } } };
      case 'beanie': return { front(ctx, v) { const y = H(v); path(ctx, `M -20 ${y - 8} Q -20 ${y - 30} 0 ${y - 30} Q 20 ${y - 30} 20 ${y - 8} Z`, p.color, INK, 1.4); path(ctx, `M -21 ${y - 12} L 21 ${y - 12} L 21 ${y - 7} L -21 ${y - 7} Z`, tone(p.color, -0.2), INK, 1.1); ellipse(ctx, 0, y - 31, 5, 5, p.pom, INK, 1); } };
      case 'santa': return { front(ctx, v) { const y = H(v); path(ctx, `M -19 ${y - 10} Q -12 ${y - 34} 8 ${y - 32} Q 22 ${y - 30} 26 ${y - 16} Q 18 ${y - 24} 19 ${y - 10} Z`, p.color, INK, 1.4); path(ctx, `M -21 ${y - 13} L 21 ${y - 13} L 21 ${y - 7} L -21 ${y - 7} Z`, '#ffffff', INK, 1.1); ellipse(ctx, 26, y - 15, 4.2, 4.2, '#ffffff', INK, 1); } };
      case 'toque': return { front(ctx, v) { const y = H(v) - 20; path(ctx, `M -13 ${y} L 13 ${y} L 14 ${y - 6} Q 18 ${y - 16} 10 ${y - 24} Q 0 ${y - 28} -10 ${y - 24} Q -18 ${y - 16} -14 ${y - 6} Z`, p.color, INK, 1.4); for (let x = -8; x <= 8; x += 4) line(ctx, [[x, y - 7], [x, y - 22]], '#e2e8f0', 1); line(ctx, [[-13, y], [13, y]], INK, 1.4); } };
      case 'nemes': return {
        behind(ctx, v) { const y = H(v); for (const side of [-1, 1]) path(ctx, `M ${side * 16} ${y - 6} L ${side * 25} ${y - 2} L ${side * 20} ${y + 26} L ${side * 13} ${y + 24} Z`, p.color, INK, 1.2); },
        front(ctx, v) { const y = H(v); path(ctx, `M -22 ${y - 4} Q -22 ${y - 26} 0 ${y - 26} Q 22 ${y - 26} 22 ${y - 4} L 19 ${y - 4} Q 17 ${y - 12} 0 ${y - 13} Q -17 ${y - 12} -19 ${y - 4} Z`, p.color, INK, 1.4); for (let k = -18; k <= 18; k += 6) line(ctx, [[k, y - 24 + Math.abs(k) * 0.35], [k * 0.9, y - 14 + Math.abs(k) * 0.3]], p.stripe, 1.2); } };
      case 'wig': return { behind(ctx, v) { ellipse(ctx, 0, H(v) + 3, 25, 24, p.color, INK, 1.4); }, front(ctx, v) { const y = H(v); path(ctx, `M -21 ${y - 2} Q -22 ${y - 24} 0 ${y - 24} Q 22 ${y - 24} 21 ${y - 2} L 18 ${y - 2} Q 16 ${y - 12} 0 ${y - 12} Q -16 ${y - 12} -18 ${y - 2} Z`, p.color, INK, 1.3); line(ctx, [[-20, y - 12], [20, y - 12]], p.band, 1.8); } };
      case 'crest': return { front(ctx, v) { const y = H(v); path(ctx, `M -21 ${y - 5} Q -22 ${y - 30} 0 ${y - 30} Q 22 ${y - 30} 21 ${y - 5} Z`, p.color, INK, 1.5); for (let x = -9; x <= 9; x += 3) path(ctx, `M ${x - 1.8} ${y - 29} Q ${x} ${y - 41} ${x + 1.8} ${y - 29} Z`, p.crest, INK, 0.7); for (const side of [-1, 1]) path(ctx, `M ${side * 19} ${y - 6} L ${side * 21} ${y + 10} L ${side * 15} ${y + 8} L ${side * 15} ${y - 6} Z`, p.color, INK, 1.2); } };
      // Mũ Viking lịch sử: chóp nón sắt + thanh che mũi (không có sừng).
      case 'nasal': return { front(ctx, v) { const y = H(v); path(ctx, `M -20 ${y - 7} Q -18 ${y - 27} 0 ${y - 35} Q 18 ${y - 27} 20 ${y - 7} Z`, p.color, INK, 1.5); line(ctx, [[-20, y - 8], [20, y - 8]], p.band, 2.6); line(ctx, [[0, y - 33], [0, y - 9]], p.band, 1.6); path(ctx, `M -2 ${y - 8} L 2 ${y - 8} L 1.6 ${y + 1} L -1.6 ${y + 1} Z`, p.color, INK, 1); } };
      case 'flaps': return { front(ctx, v) { const y = H(v); path(ctx, `M -20 ${y - 6} Q -21 ${y - 27} 0 ${y - 27} Q 21 ${y - 27} 20 ${y - 6} Z`, p.color, INK, 1.4); for (const side of [-1, 1]) path(ctx, `M ${side * 20} ${y - 8} L ${side * 21} ${y + 8} Q ${side * 18} ${y + 12} ${side * 15} ${y + 8} L ${side * 15} ${y - 6} Z`, p.color, INK, 1.2); line(ctx, [[-19, y - 8], [19, y - 8]], '#f5f5f4', 1.6); } };
      case 'bonnet': return { behind(ctx, v) { ellipse(ctx, 0, H(v) - 1, 25, 24, p.color, INK, 1.4); }, front(ctx, v) { const y = H(v); path(ctx, `M -24 ${y + 4} Q -26 ${y - 30} 0 ${y - 30} Q 26 ${y - 30} 24 ${y + 4} L 19 ${y + 2} Q 19 ${y - 16} 0 ${y - 17} Q -19 ${y - 16} -19 ${y + 2} Z`, p.color, INK, 1.4); path(ctx, `M -19 ${y + 3} Q -14 ${y + 25} 0 ${y + 23} Q 14 ${y + 25} 19 ${y + 3}`, null, p.ribbon, 1.6); path(ctx, `M -1 ${y + 23} l -5 6 M 1 ${y + 23} l 5 6`, null, p.ribbon, 1.6); } };
      case 'beret': return { front(ctx, v) { const y = H(v) - 17; ellipse(ctx, -3, y, 21, 7, p.color, INK, 1.3); ellipse(ctx, -2, y - 6, 2, 2, p.color, INK, 0.8); } };
      case 'topknot': return { front(ctx, v) { const y = H(v); path(ctx, `M -12 ${y - 17} Q 0 ${y - 22} 12 ${y - 17} Q 0 ${y - 14} -12 ${y - 17} Z`, v.skin, null); path(ctx, `M -3 ${y - 20} Q 4 ${y - 30} 12 ${y - 25} Q 6 ${y - 23} 2 ${y - 19} Z`, p.color, INK, 1); line(ctx, [[1, y - 23], [4, y - 21]], '#f8fafc', 1); } };
      case 'stem': return { front(ctx, v) { const y = H(v); path(ctx, `M -19 ${y - 9} Q -20 ${y - 28} 0 ${y - 28} Q 20 ${y - 28} 19 ${y - 9} Z`, p.color, INK, 1.4); for (const x of [-9, 0, 9]) path(ctx, `M ${x} ${y - 27} Q ${x * 1.3} ${y - 18} ${x} ${y - 9}`, null, '#c2410c', 1.1); path(ctx, `M -2 ${y - 28} L -1 ${y - 36} L 3 ${y - 36} L 2 ${y - 28} Z`, '#15803d', INK, 1); path(ctx, `M 2 ${y - 33} Q 10 ${y - 38} 12 ${y - 31} Q 6 ${y - 30} 2 ${y - 33} Z`, '#22c55e', INK, 0.8); } };
      // Khăn trùm ma: trùm kín đầu, mặt (face()) hiện lên trên như mặt con ma.
      case 'sheet': return { front(ctx, v) { const y = H(v); path(ctx, `M -22 ${y + 16} Q -26 ${y - 30} 0 ${y - 30} Q 26 ${y - 30} 22 ${y + 16} Z`, p.color, INK, 1.6); } };
      case 'dino': return { behind(ctx, v) { ellipse(ctx, 0, H(v) + 1, 25, 25, p.color, INK, 1.5); }, front(ctx, v) { const y = H(v); path(ctx, `M -23 ${y + 6} Q -26 ${y - 30} 0 ${y - 31} Q 26 ${y - 30} 23 ${y + 6} L 18 ${y - 10} Q 0 ${y - 15} -18 ${y - 10} Z`, p.color, INK, 1.5); for (let x = -15; x <= 13; x += 5.5) path(ctx, `M ${x} ${y - 11.5} L ${x + 2.7} ${y - 6.5} L ${x + 5.4} ${y - 11.5} Z`, '#ffffff', INK, 0.6); for (const x of [-8, 8]) { ellipse(ctx, x, y - 25, 4, 3.4, '#ffffff', INK, 0.9); ellipse(ctx, x, y - 25, 1.8, 1.8, '#111827', null); } for (const k of [0, 1, 2]) path(ctx, `M ${-4 + k * 4} ${y - 31 + k} l 2 -5 l 2 5 Z`, '#facc15', INK, 0.6); } };
      // Mũ phi hành gia: cổ mũ trắng + kính trong suốt (vẽ sau mặt để mặt vẫn thấy qua kính).
      case 'bubble': return {
        behind(ctx, v) { const y = H(v); ellipse(ctx, 0, y + 20, 18, 5, p.color, INK, 1.4); },
        overlay(ctx, v) { const y = v.headY; ellipse(ctx, 0, y - 2, 26, 26, 'rgba(186, 230, 253, 0.28)', '#cbd5e1', 2.4); path(ctx, `M -17 ${y - 14} Q -12 ${y - 22} -2 ${y - 24}`, null, 'rgba(255, 255, 255, 0.85)', 2.4); ellipse(ctx, 0, y + 22, 19, 4.5, p.color, INK, 1.4); },
      };
      case 'dive': return { coversEyes: true, overlay(ctx, v) { const y = v.headY - 2; line(ctx, [[-21, y - 1], [21, y - 1]], '#0f172a', 2.4); path(ctx, `M -16 ${y - 8} Q 0 ${y - 11} 16 ${y - 8} L 15 ${y + 6} Q 0 ${y + 9} -15 ${y + 6} Z`, 'rgba(125, 211, 252, 0.42)', p.color, 2.6); path(ctx, `M 17 ${y + 4} L 20 ${y + 4} L 20 ${y - 20} Q 20 ${y - 24} 24 ${y - 24}`, null, '#f97316', 2.6); } };
    }
    throw new Error(`outfit head: kiểu mũ không có: ${p.kind}`);
  }

  // Ghép một bộ trang phục (catalog) thành các lớp cho drawChibi; null = không mặc gì.
  // Mảnh lạ (không có trong bảng) là lỗi, không bao giờ âm thầm vẽ đồ mặc định.
  const cache = new Map();
  function resolveOutfit(cat, s) {
    const id = s.outfit;
    if (!id || id === 'none') return null;
    if (cache.has(id)) return cache.get(id);
    const spec = cat.outfits && cat.outfits[id];
    if (!spec) throw new Error(`outfit không có trong catalog: ${id}`);
    const parts = spec.parts || {}, need = (table, slot) => {
      const key = parts[slot];
      if (key === undefined) return null;
      if (!(key in table)) throw new Error(`outfit ${id}: mảnh ${slot} "${key}" chưa có hình vẽ`);
      return table[key];
    };
    const top = need(TOPS, 'top'), bottom = need(BOTTOMS, 'bottom'), shoes = need(SHOES, 'shoes');
    const head = need(HEADS, 'head'), acc = need(FACE_ACCS, 'face_acc'), back = need(BACKS, 'back');
    const hp = head ? headPart(head) : null;
    const overlays = [hp && hp.overlay, acc && acc.overlay].filter(Boolean);
    const fit = {
      top: top && { draw: (ctx, v) => drawTop(ctx, v, top), arms: (ctx, v) => drawArms(ctx, v, top) },
      bottom: bottom && { draw: (ctx, v) => drawBottom(ctx, v, bottom) },
      shoes: shoes && { draw: (ctx, v) => drawShoes(ctx, v, shoes) },
      head: hp,
      back,
      chest: acc && acc.chest,
      headAcc: acc && acc.front,
      overlay: overlays.length ? (ctx, v) => overlays.forEach(f => f(ctx, v)) : null,
      coversEyes: Boolean((acc && acc.coversEyes) || (hp && hp.coversEyes)),
    };
    cache.set(id, fit);
    return fit;
  }

  RemakeVector.kit.OUTFIT_PARTS = { top: TOPS, bottom: BOTTOMS, shoes: SHOES, head: HEADS, back: BACKS, face_acc: FACE_ACCS };
  RemakeVector.kit.resolveOutfit = resolveOutfit;
  RemakeVector.register({ rigs: {} });
})();
