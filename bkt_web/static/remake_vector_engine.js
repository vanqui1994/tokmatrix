globalThis.RemakeVector = (() => {
  'use strict';
  const W = 576, H = 1024, TAU = Math.PI * 2;
  // Cel vẽ tay chỉ dùng cho trang thư viện (Renderer option { cels: true }).
  // Video remake và bản xuất MP4 mở HTML qua file://, không có /static, nên
  // mặc định luôn vẽ vector — preview và video xuất ra phải giống nhau.
  const CEL_SHEETS = {
    main: '/static/generated_images/handdrawn_cel_sheet_v2.png',
    garden: '/static/generated_images/handdrawn_garden_cels_v2.png'
  };
  // Mỗi cel là một ô lưới [cột, hàng, sheet]. Mép tranh không thẳng hàng với lưới
  // (thân ớt nhô sang ô dưa hấu, bọt nước của rồng chạm ô cà chua), nên KHÔNG cắt
  // theo khung: pixel được gom theo vùng liền mạch rồi gán cho ô chứa tâm vùng.
  const CEL_GRID = { main: [2, 3], garden: [2, 4] };
  const CEL_CELLS = {
    fisherman: [0, 0, 'main'], fish: [1, 0, 'main'], big_fish: [1, 0, 'main'],
    sea_monster_s: [0, 1, 'main'], sea_monster_ss: [0, 1, 'main'], tomato_plant: [1, 1, 'main'],
    tomato: [0, 2, 'main'], boat: [1, 2, 'main'],
    watermelon: [0, 0, 'garden'], apple: [1, 0, 'garden'], pepper: [0, 1, 'garden'], peanut_plant: [1, 1, 'garden'],
    papaya_tree: [0, 2, 'garden'], insect: [1, 2, 'garden'], hand: [0, 3, 'garden'], foot: [1, 3, 'garden']
  };
  // asset → canvas đã tách nền xanh. Tách một lần lúc nạp, không làm lại mỗi frame.
  const celLayers = new Map();
  let celLoad = null;
  const RIG_DRAWERS = {};
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Không nạp được cel sheet ${url}`));
      img.src = url;
    });
  }
  // Tách nền (xanh chroma hoặc alpha sẵn có), đánh nhãn vùng liền mạch và trả về
  // một canvas đã cắt sát cho từng ô lưới. Chạy một lần cho mỗi sheet.
  function sliceSheet(img, [cols, rows]) {
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
    const src = document.createElement('canvas'); src.width = W0; src.height = H0;
    const sx = src.getContext('2d', { willReadFrequently: true }); sx.drawImage(img, 0, 0);
    const pixels = sx.getImageData(0, 0, W0, H0), d = pixels.data, n = W0 * H0;
    const solid = new Uint8Array(n);
    for (let i = 0, p = 0; p < n; i += 4, p++) {
      const green = d[i] < 35 && d[i + 1] > 160 && d[i + 2] < 55;
      if (green) d[i + 3] = 0;
      solid[p] = d[i + 3] > 16 ? 1 : 0;
    }
    sx.putImageData(pixels, 0, 0);
    const label = new Int32Array(n).fill(-1), stack = new Int32Array(n), comps = [];
    const cellW = W0 / cols, cellH = H0 / rows, nCells = cols * rows;
    const cellOf = (x, y) => Math.min(rows - 1, Math.floor(y / cellH)) * cols + Math.min(cols - 1, Math.floor(x / cellW));
    for (let start = 0; start < n; start++) {
      if (!solid[start] || label[start] >= 0) continue;
      const id = comps.length, count = new Float64Array(nCells), box = [];
      for (let k = 0; k < nCells; k++) box.push([W0, H0, -1, -1]);
      let top = 0;
      stack[top++] = start; label[start] = id;
      while (top) {
        const p = stack[--top], x = p % W0, y = (p - x) / W0, k = cellOf(x, y), bx = box[k];
        count[k]++;
        if (x < bx[0]) bx[0] = x; if (y < bx[1]) bx[1] = y; if (x > bx[2]) bx[2] = x; if (y > bx[3]) bx[3] = y;
        if (x > 0) { const q = p - 1; if (solid[q] && label[q] < 0) { label[q] = id; stack[top++] = q; } }
        if (x < W0 - 1) { const q = p + 1; if (solid[q] && label[q] < 0) { label[q] = id; stack[top++] = q; } }
        if (y > 0) { const q = p - W0; if (solid[q] && label[q] < 0) { label[q] = id; stack[top++] = q; } }
        if (y < H0 - 1) { const q = p + W0; if (solid[q] && label[q] < 0) { label[q] = id; stack[top++] = q; } }
      }
      const total = count.reduce((a, c) => a + c, 0);
      const main = count.indexOf(Math.max(...count));
      // Vùng lấn sang ô khác nhiều (người câu + cá nối bằng dây câu) → cắt theo ô;
      // chỉ lấn một mẩu nhỏ (thân ớt nhô lên ô dưa hấu) → giữ nguyên cả vùng cho ô chính.
      const split = [...count].some((c, k) => k !== main && c >= total * 0.15);
      comps.push({ main, split, count, box });
    }
    const cells = new Map();
    for (let k = 0; k < nCells; k++) {
      const whole = new Set(), cut = new Set();
      let x0 = W0, y0 = H0, x1 = -1, y1 = -1;
      const grow = b => { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); };
      comps.forEach((comp, id) => {
        if (comp.split) { if (comp.count[k]) { cut.add(id); grow(comp.box[k]); } }
        else if (comp.main === k) { whole.add(id); for (const b of comp.box) if (b[2] >= 0) grow(b); }
      });
      if (x1 < 0) continue;
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const layer = document.createElement('canvas'); layer.width = w; layer.height = h;
      const lx = layer.getContext('2d'), out = lx.createImageData(w, h), o = out.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x0 + x, py = y0 + y, p = py * W0 + px, id = label[p];
        if (id < 0 || !(whole.has(id) || (cut.has(id) && cellOf(px, py) === k))) continue;
        const i = p * 4, j = (y * w + x) * 4;
        o[j] = d[i]; o[j + 1] = d[i + 1]; o[j + 2] = d[i + 2]; o[j + 3] = d[i + 3];
      }
      lx.putImageData(out, 0, 0);
      cells.set(`${k % cols},${Math.floor(k / cols)}`, layer);
    }
    return cells;
  }
  // Nạp và tách nền toàn bộ cel. Resolve true khi xong; lỗi thì reject và KHÔNG
  // có cel nào được đăng ký, để không có video nào trộn cel với vector.
  function loadCelSheets(urls = CEL_SHEETS) {
    if (celLoad) return celLoad;
    celLoad = Promise.all([loadImage(urls.main), loadImage(urls.garden)]).then(([main, garden]) => {
      const sheets = { main: sliceSheet(main, CEL_GRID.main), garden: sliceSheet(garden, CEL_GRID.garden) };
      const layers = new Map();
      for (const [asset, [col, row, sheet]] of Object.entries(CEL_CELLS)) {
        const layer = sheets[sheet].get(`${col},${row}`);
        if (!layer) throw new Error(`Cel sheet ${sheet} thiếu ô ${col},${row} cho ${asset}`);
        layers.set(asset, layer);
      }
      for (const [k, v] of layers) celLayers.set(k, v);
      return true;
    });
    celLoad.catch(() => { celLoad = null; });
    return celLoad;
  }
  const celsReady = () => celLayers.size > 0;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a, b, u) => a + (b - a) * u;
  const smooth = u => u * u * (3 - 2 * u);
  // ease_out cho chuyển động dừng mềm, ease_in cho lấy đà, back vượt nhẹ rồi về
  // (settle), pop nảy về đích — cả hai đều hội tụ đúng giá trị key ở u = 1.
  function ease(name, u) {
    if (name === 'smooth') return smooth(u);
    if (name === 'hold') return 0;
    if (name === 'ease_in') return u * u * u;
    if (name === 'ease_out') return 1 - (1 - u) ** 3;
    if (name === 'back') { const k = 1.70158; return 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2; }
    if (name === 'pop') return u >= 1 ? 1 : 1 - Math.cos(u * Math.PI * 2.5) * Math.exp(-5.5 * u);
    return u;
  }
  const hash = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  const material = ctx => ctx.__remakeMaterial || { kind: 'clean', seed: 1 };
  const rotate = (x, y, angle) => {
    const r = angle * Math.PI / 180;
    return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  };
  function track(keys, t, defaults = {}) {
    if (!keys?.length) return { ...defaults };
    let a = { ...defaults, ...keys[0] };
    if (t <= a.time) return a;
    for (let i = 1; i < keys.length; i++) {
      const b = { ...a, ...keys[i] };
      if (t >= b.time) { a = b; continue; }
      let u = clamp((t - a.time) / (b.time - a.time));
      u = ease(b.ease, u);
      const out = { ...a };
      if (a.hand_pose && b.hand_pose && a.hand_pose !== b.hand_pose) out.hand_curls = handPresets[a.hand_pose].map((v, i) => mix(v, handPresets[b.hand_pose][i], u));
      for (const key of Object.keys(b)) {
        if (key === 'fruits') {
          out.fruits = a.fruits;
          continue;
        }
        if (typeof a[key] === 'number' && typeof b[key] === 'number') out[key] = mix(a[key], b[key], u);
      }
      return out;
    }
    return a;
  }
  function exposureTime(keys, t) {
    if (!keys?.length) return t;
    let active = keys[0];
    for (const key of keys) { if (key.time > t) break; active = key; }
    if (active.exposure === 'hold') return active.time;
    // The renderer samples at arbitrary timestamps during export; snap only
    // drawing selection, never the camera, root placement, or contacts.
    if (active.exposure === 'twos') return Math.floor(t * 12 + 1e-9) / 12;
    return t;
  }
  function ellipse(ctx, x, y, rx, ry, fill, stroke = '#263c2c', width = 1.5, rotation = 0) {
    const ink = material(ctx);
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rotation, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = ink.kind === 'pencil' ? '#394038' : stroke; ctx.lineWidth = width * (ink.kind === 'ink' ? 1.18 : ink.kind === 'pencil' ? .78 : 1); ctx.stroke(); }
  }
  function path(ctx, d, fill, stroke = '#263c2c', width = 1.5) {
    const ink = material(ctx);
    const p = new Path2D(d);
    if (fill) { ctx.fillStyle = fill; ctx.fill(p); }
    if (stroke) { ctx.strokeStyle = ink.kind === 'pencil' ? '#394038' : stroke; ctx.lineWidth = width * (ink.kind === 'ink' ? 1.18 : ink.kind === 'pencil' ? .78 : 1); ctx.stroke(p); }
  }
  function line(ctx, points, color, width = 1.5) {
    const ink = material(ctx);
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.lineWidth = width * (ink.kind === 'ink' ? 1.15 : ink.kind === 'pencil' ? .72 : 1); ctx.strokeStyle = ink.kind === 'pencil' ? '#394038' : color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  // Nét viền chung cho mọi nhân vật: một màu mực ấm, dày hơn nét chi tiết, để
  // hình vector đọc như một cel vẽ tay trọn khối thay vì các mảng màu rời.
  const INK = '#2d2621';
  function rgbOf(color) {
    const hex = /^#([0-9a-f]{6})/i.exec(color);
    if (hex) { const n = parseInt(hex[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    const fn = /rgba?\(([^)]+)\)/.exec(color);
    return fn ? fn[1].split(',').slice(0, 3).map(Number) : null;
  }
  // amount > 0 pha trắng, < 0 pha tối.
  function tone(color, amount) {
    const rgb = rgbOf(color);
    if (!rgb) return color;
    const f = amount >= 0 ? v => v + (255 - v) * amount : v => v * (1 + amount);
    return `rgb(${rgb.map(v => Math.round(clamp(f(v), 0, 255))).join(',')})`;
  }
  // Khối tròn: sáng ở trên-trái, tối ở mép dưới-phải.
  function volume(ctx, x, y, rx, ry, base, light = .34, dark = -.3) {
    const g = ctx.createRadialGradient(x - rx * .35, y - ry * .42, Math.min(rx, ry) * .08, x, y, Math.max(rx, ry) * 1.08);
    g.addColorStop(0, tone(base, light)); g.addColorStop(.52, base); g.addColorStop(1, tone(base, dark));
    return g;
  }
  // Khối trụ (chậu, xô, thân cây): dải sáng dọc lệch trái.
  function cylinder(ctx, x0, x1, base) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, tone(base, -.25)); g.addColorStop(.3, tone(base, .28)); g.addColorStop(.62, base); g.addColorStop(1, tone(base, -.35));
    return g;
  }
  // Chi có viền: vẽ nét mực rộng rồi phủ màu, các khớp nối liền thành một khối.
  function limb(ctx, points, color, width, ink = INK) {
    line(ctx, points, ink, width + 2.6);
    line(ctx, points, color, width);
  }
  // Ống côn giữa hai điểm (chân chibi, cán dụng cụ): bán kính r1 ở đầu (x1, y1), r2 ở đầu (x2, y2).
  function taper(ctx, x1, y1, x2, y2, r1, r2, fill, stroke, strokeWidth = 1) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(x1 + nx * r1, y1 + ny * r1); ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
    ctx.lineTo(x2 - nx * r2, y2 - ny * r2); ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function mitten(ctx, x, y, r, color, angle = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ellipse(ctx, 0, 0, r, r * 1.08, volume(ctx, 0, 0, r, r, color), INK, 1.3);
    ellipse(ctx, -r * .7, -r * .45, r * .42, r * .58, color, INK, 1.1, -.5);
    ctx.restore();
  }
  function leaf(ctx, x, y, size, angle, color = '#54a547', lobed = false) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(size, size);
    const g = ctx.createLinearGradient(-14, 0, 14, -40);
    g.addColorStop(0, tone(color, -.22)); g.addColorStop(.55, color); g.addColorStop(1, tone(color, .26));
    path(ctx, lobed ? 'M 0 0 Q -8 -3 -12 -10 L -4 -10 Q -16 -20 -11 -26 L -3 -20 Q -7 -33 0 -40 Q 8 -32 4 -20 L 12 -28 Q 16 -17 5 -11 L 14 -12 Q 9 -3 0 0 Z' : 'M 0 0 C -23 -12 -20 -33 0 -40 C 21 -29 21 -10 0 0 Z', g, tone(color, -.55), 1.5);
    const vein = tone(color, .45);
    line(ctx, [[0, 0], [0, -35]], vein, 1.2);
    line(ctx, [[0, -12], [-9, -22]], vein, .7); line(ctx, [[0, -20], [8, -28]], vein, .7); line(ctx, [[0, -27], [-6, -33]], vein, .6);
    ctx.restore();
  }
  // Bóng đổ mềm dưới chân: chỉ cho vật đứng trên nền, không cho vật đang được cầm/gắn.
  function contactShadow(ctx, s, cat) {
    const group = cat.assets[s.asset].group;
    const grounded = ['fruit', 'vegetable', 'plant'].includes(group) || PEOPLE.has(s.asset) || ['pot', 'bucket', 'bag', 'seed', 'scarecrow', 'basket', 'buffalo', 'chicken', 'snail', 'watering_can', 'cow', 'pig', 'goat', 'sheep', 'horse', 'dog', 'cat', 'rabbit', 'mouse', 'grass_tuft', 'duck', 'chick', 'rooster', 'ladybug', 'ant', 'caterpillar', 'frog', 'soil_bed', 'wheelbarrow', 'crate', 'sack', 'hay_bale', 'nest', 'bowl', 'fence'].includes(s.asset);
    if (!grounded || s.attached || s.held_by || Math.abs(s.rotation) > 35 || s.opacity < .05) return;
    const w = s.height * (group === 'plant' && s.asset !== 'grass_tuft' ? .16 : (group === 'fruit' || group === 'vegetable') ? .38 : PEOPLE.has(s.asset) ? .26 : ['buffalo', 'cow', 'horse'].includes(s.asset) ? .58 : ['pig', 'sheep', 'goat'].includes(s.asset) ? .42 : ['dog', 'cat', 'duck', 'rooster'].includes(s.asset) ? .34 : s.asset === 'frog' ? .32 : s.asset === 'rabbit' ? .26 : ['chick'].includes(s.asset) ? .2 : ['mouse', 'ladybug', 'ant', 'caterpillar'].includes(s.asset) ? .18 : s.asset === 'grass_tuft' ? .32 : s.asset === 'soil_bed' ? .55 : s.asset === 'wheelbarrow' ? .45 : ['crate', 'hay_bale', 'fence'].includes(s.asset) ? .42 : ['sack', 'nest', 'bowl'].includes(s.asset) ? .32 : s.asset === 'scarecrow' ? .2 : .36) * (1 - clamp((s.lift || 0) / 300) * .5);
    ctx.save(); ctx.globalAlpha = s.opacity * .22 * (1 - clamp((s.lift || 0) / 300) * .6);
    ellipse(ctx, s.x, s.y + (s.lift || 0), w, Math.max(3, w * .16), '#2b2418', null);
    ctx.restore();
  }
  // A cel is a complete drawing, not a collection of independently wobbling
  // parts.  `drawing_id` chooses its silhouette; exposureTime() above decides
  // when that drawing changes.  These marks are deliberately seeded from that
  // identifier so seeking produces the exact same photographed-pencil frame.
  function celId(s) { return String(s.drawing_id || 'idle').toLowerCase(); }
  function celHatch(ctx, s, box, color = '#47392b', count = 7) {
    if (s.material === 'clean') return;
    let seed = hash(`${s.id}:${celId(s)}:hatch`) || 1;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    ctx.save(); ctx.globalAlpha *= s.material === 'ink' ? .34 : .22;
    for (let i = 0; i < count; i++) {
      const x = box[0] + random() * box[2], y = box[1] + random() * box[3], d = 3 + random() * 8;
      line(ctx, [[x - d, y + d * .35], [x + d, y - d * .35]], color, s.material === 'ink' ? 1.05 : .65);
    }
    ctx.restore();
  }
  function plantPoint(s, x, y) {
    if (y >= 0 || s.asset === 'papaya_tree') return [x, y];
    return [x * (1 + s.bend * .25), y * (.7 + .3 * s.growth) * (1 - .68 * s.bend)];
  }
  function branchGeometry(s, index) {
    const side = index % 2 ? 1 : -1, rawY = -20 - index * 7, palm = s.asset === 'papaya_tree';
    const base = palm ? [0, -65] : plantPoint(s, 0, rawY + 9);
    const tip = palm ? [Math.cos(index * Math.PI / 6) * 37, -68 - Math.sin(index * Math.PI / 6) * 20] : plantPoint(s, side * (29 - index * .8), rawY - 10);
    const fruit = plantPoint(s, side * 14, rawY + 10), angle = s[`branch_${index + 1}`] || 0;
    const turn = point => { const v = rotate(point[0] - base[0], point[1] - base[1], angle); return [base[0] + v[0], base[1] + v[1]]; };
    return { base, tip: turn(tip), fruit: turn(fruit), angle };
  }
  const handPresets = {
    open: [0, 0, 0, 0, 0], fist: [.9, 1, 1, 1, 1], pinch: [.72, .72, .1, .15, .2],
    point: [.75, 0, .9, .95, 1], knife: [.65, .78, .82, .88, .94],
    fruit: [.55, .48, .52, .58, .65], scatter: [.15, .05, .18, .28, .4]
  };
  // Tay phải là ảnh gương của tay trái qua trục dọc: cổ tay bên phải, ngón chĩa
  // sang trái, ngón cái vẫn ở trên. Mọi anchor tay đi qua đây nên tự khớp.
  const HANDS = new Set(['hand', 'hand_right']), PEOPLE = new Set(['farmer', 'fisherman', 'farmer_woman']);
  function handPoint(s, point) {
    const pivot = [-45, -65], v = rotate(point[0] - pivot[0], point[1] - pivot[1], s.wrist || 0);
    return s.asset === 'hand_right' ? [-(pivot[0] + v[0]), pivot[1] + v[1]] : [pivot[0] + v[0], pivot[1] + v[1]];
  }
  function handSkeleton(s) {
    const names = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    const curls = (s.hand_curls || handPresets[s.hand_pose] || handPresets.open).map((value, i) => clamp(value + (s[names[i]] || 0)));
    const roots = [[-3, -45], [5, -58], [3, -45], [0, -32], [-5, -20]];
    const lengths = [[22, 16], [30, 23], [31, 23], [28, 21], [23, 18]];
    const baseAngles = [-42, -24, -8, 9, 27];
    const fingers = roots.map((root, i) => {
      const curl = curls[i], a1 = baseAngles[i] + curl * 72, a2 = a1 + curl * 82;
      const p1v = rotate(lengths[i][0], 0, a1), p1 = [root[0] + p1v[0], root[1] + p1v[1]];
      const p2v = rotate(lengths[i][1], 0, a2), p2 = [p1[0] + p2v[0], p1[1] + p2v[1]];
      return [root, p1, p2].map(point => handPoint(s, point));
    });
    const wrist = handPoint(s, [-45, -65]), palm = handPoint(s, [2, -42]), base = handPoint(s, [-16, -60]);
    const grip = [(fingers[0][2][0] + fingers[1][2][0]) / 2, (fingers[0][2][1] + fingers[1][2][1]) / 2];
    return { wrist, palm, grip, fingers, base };
  }
  function solveArm(shoulder, hand, bend = 1, segLen = 23) {
    const dx = hand[0] - shoulder[0], dy = hand[1] - shoulder[1], raw = Math.hypot(dx, dy) || .0001;
    const distance = Math.min(raw, segLen * 2 - 0.5), ux = dx / raw, uy = dy / raw;
    const along = distance / 2, height = Math.sqrt(Math.max(0, segLen * segLen - along * along));
    return [shoulder[0] + ux * along - uy * height * bend, shoulder[1] + uy * along + ux * height * bend];
  }
  function farmerSkeleton(s) {
    const shoulder_l = [-12, -64], shoulder_r = [14, -64];
    let hand_l = [s.hand_l_x, s.hand_l_y], hand_r = [s.hand_r_x, s.hand_r_y];
    if (s.arm) {
      const moved = rotate(hand_l[0] - shoulder_l[0], hand_l[1] - shoulder_l[1], s.arm);
      hand_l = [shoulder_l[0] + moved[0], shoulder_l[1] + moved[1]];
    }
    return {
      shoulder_l, shoulder_r, hand_l, hand_r,
      elbow_l: solveArm(shoulder_l, hand_l, 1),
      elbow_r: solveArm(shoulder_r, hand_r, -1)
    };
  }
  const WEATHER_REACTORS = new Set(['human', 'chibi', 'animal']);
  function chibiSkeleton(s) {
    const shoulder_l = [-14, -44], shoulder_r = [14, -44];
    let hand_l = [s.hand_l_x ?? -24, s.hand_l_y ?? -22], hand_r = [s.hand_r_x ?? 24, s.hand_r_y ?? -22];
    if (s.arm) {
      const moved = rotate(hand_l[0] - shoulder_l[0], hand_l[1] - shoulder_l[1], s.arm);
      hand_l = [shoulder_l[0] + moved[0], shoulder_l[1] + moved[1]];
    }
    return {
      shoulder_l, shoulder_r, hand_l, hand_r,
      elbow_l: solveArm(shoulder_l, hand_l, 1, 14),
      elbow_r: solveArm(shoulder_r, hand_r, -1, 14)
    };
  }
  function localAnchor(cat, s, name) {
    const anchors = cat.assets[s.asset].anchors;
    let [x, y] = anchors[name] || anchors.face || anchors.root;
    const branchMatch = /^branch_(\d+)$/.exec(name);
    if (cat.assets[s.asset].group === 'plant' && branchMatch) {
      const geometry = branchGeometry(s, Number(branchMatch[1]) - 1);
      [x, y] = geometry.tip;
    } else if (cat.assets[s.asset].group === 'plant' && !cat.assets[s.asset].fixed_anchors) [x, y] = plantPoint(s, x, y);  // dây leo: giàn đứng yên, anchor không co theo growth
    if ((cat.assets[s.asset].group === 'fruit' || cat.assets[s.asset].group === 'vegetable') && name === 'face') x -= s.slice * 22;
    if (s.head_down && HEAD_ANCHORS.has(name) && QUADRUPED_SPECS[s.asset]) [x, y] = headPoint(QUADRUPED_SPECS[s.asset], s.head_down, [x, y]);
    if (HANDS.has(s.asset)) {
      const skeleton = handSkeleton(s), fingers = ['thumb_tip', 'index_tip', 'middle_tip', 'ring_tip', 'pinky_tip'];
      if (['grip', 'palm', 'wrist'].includes(name)) [x, y] = skeleton[name];
      else if (name === 'tip') [x, y] = skeleton.fingers[1][2];
      else if (fingers.includes(name)) [x, y] = skeleton.fingers[fingers.indexOf(name)][2];
      else if (!['root', 'top'].includes(name)) [x, y] = handPoint(s, [x, y]);
    }
    if (PEOPLE.has(s.asset)) {
      const skeleton = farmerSkeleton(s), key = name === 'hand' ? 'hand_l' : name === 'grip' ? 'hand_r' : name;
      const resolved = key === 'wrist_l' ? 'hand_l' : key === 'wrist_r' ? 'hand_r' : key;
      if (skeleton[resolved]) [x, y] = skeleton[resolved];
    }
    if (cat.assets[s.asset]?.group === 'chibi') {
      const skeleton = chibiSkeleton(s), key = name === 'hand' ? 'hand_r' : name === 'grip' ? 'hand_r' : name;
      const resolved = key === 'wrist_l' ? 'hand_l' : key === 'wrist_r' ? 'hand_r' : key;
      if (skeleton[resolved]) [x, y] = skeleton[resolved];
    }
    return [x, y];
  }
  // Gió (s.wind 0–1) làm cây/hoa nghiêng về bên phải màn hình: shear quanh gốc. face() vẽ trong
  // hệ đã shear nên chỉ anchor thế giới (điểm chạm, bình xịt nhắm) phải cộng thêm độ nghiêng.
  const WIND_BEND = .16;
  function windShear(cat, s) {
    if (!s.wind || cat.assets[s.asset].group !== 'plant') return 0;
    return -WIND_BEND * s.wind * (s.flip ? -1 : 1);
  }
  function worldAnchor(cat, s, name) {
    let [x, y] = localAnchor(cat, s, name);
    const shear = windShear(cat, s);
    if (shear) x += shear * y;
    const v = rotate(x * s.height / 100 * (s.flip ? -1 : 1), y * s.height / 100, s.rotation);
    return { x: s.x + v[0], y: s.y + v[1] };
  }
  // pick: tay tới quả đúng lúc contact (mặc định start + 0.6; showreel nén contact cùng tỉ lệ).
  function pickReach(a) { return Math.max(1e-3, (a.contact ?? a.start + Math.min(0.6, a.end - a.start)) - a.start); }
  function worldToLocal(s, point) {
    const unturned = rotate(point.x - s.x, point.y - s.y, -s.rotation);
    const scale = s.height / 100;
    return [unturned[0] / scale * (s.flip ? -1 : 1), unturned[1] / scale];
  }
  function worldFrame(cat, s, name) {
    let joint = 0;
    if (HANDS.has(s.asset) && !['root', 'top'].includes(name)) joint = (s.wrist || 0) * (s.asset === 'hand_right' ? -1 : 1);
    if (PEOPLE.has(s.asset)) joint = ['hand', 'hand_l', 'wrist_l'].includes(name) ? s.wrist_l || 0 : ['grip', 'hand_r', 'wrist_r'].includes(name) ? s.wrist_r || 0 : 0;
    if (/^branch_\d+$/.test(name)) joint = s[name] || 0;
    return { ...worldAnchor(cat, s, name), rotation: s.rotation + (s.flip ? -joint : joint), flip: s.flip, height: s.height };
  }
  function sampleBase(story, cat, seconds) {
    if (!Number.isFinite(seconds)) throw new Error('Timestamp phải hữu hạn');
    const t = clamp(seconds, 0, Math.max(0, Math.min(story.duration, story.scenes[story.scenes.length - 1].end_time) - .000001));
    const scene = story.scenes.find(s => t >= s.start_time && t < s.end_time);
    if (!scene) throw new Error('Timeline bị hở tại timestamp này');
    const cast = new Map(story.characters.map(c => [c.id, c]));
    const states = Object.create(null);
    const cue = (story.cues || []).find(c => t >= c.start && t < c.end) || null;
    for (const id of scene.characters_present) {
      const c = cast.get(id);
      const keys = scene.poses[id];
      if (keys?.length && t < keys[0].time - 0.0001) {
        states[id] = { ...cat.pose_defaults, ...track(keys, keys[0].time, cat.pose_defaults), opacity: 0, visible: false, id, asset: c.asset, style: c.style || {}, material: c.material || 'clean', faceEnabled: false };
        continue;
      }
      const posed = track(keys, t, cat.pose_defaults);
      const drawing = track(keys, exposureTime(keys, t), cat.pose_defaults);
      // Root motion stays continuous for contacts; only the authored drawing
      // identity is exposed on ones/twos/holds.
      states[id] = { ...cat.pose_defaults, ...posed, drawing_id: drawing.drawing_id, id, asset: c.asset, style: c.style || {}, material: c.material || 'clean', faceEnabled: c.face ?? cat.assets[c.asset].face };
      const s = states[id];
      // Tư thế nghỉ riêng của rig (vd. tay chibi): pose_defaults là của người lớn nên chỉ áp cho thông số
      // mà không keyframe nào khai.
      const rest = cat.assets[c.asset].rest_pose;
      if (rest) for (const [k, v] of Object.entries(rest)) if (!keys.some(f => f[k] !== undefined)) s[k] = v;
      s.season = scene.background?.season || 'summer';  // cây ăn quả đổi tán/hoa/quả theo mùa của cảnh
      const bgWeather = scene.background?.weather || scene.weather || '';
      const windAuto = bgWeather === 'wind' ? 0.65 + 0.35 * Math.sin(t * 3.2 + (hash(id) % 11) * 0.5) : bgWeather === 'storm' ? 0.85 + 0.15 * Math.sin(t * 4.5 + (hash(id) % 7)) : 0;
      // pose_defaults có wind: 0 nên phải xem keyframe có khai wind thật không, nếu không gió của cảnh bị bỏ qua.
      s.wind = keys.some(k => k.wind !== undefined) ? clamp(posed.wind, 0, 1) : windAuto;
      // Tuyết: người/chibi/thú có mặt tự run cầm cập; nắng nóng: tự đổ mồ hôi. Keyframe khai shiver/sweat (vd. 0 = mặc áo ấm) thì theo keyframe.
      // Trang phục khai ở nhân vật là mặc định; keyframe `outfit` (đổi đồ giữa cảnh) được ưu tiên.
      if (c.outfit && !keys.some(k => k.outfit !== undefined)) s.outfit = c.outfit;
      if (WEATHER_REACTORS.has(cat.assets[c.asset].group) && s.faceEnabled !== false) {
        const warm = Boolean(cat.outfits?.[s.outfit]?.warm);  // áo ấm, đồ phi hành gia: không run
        if (bgWeather === 'snow' && !warm && !keys.some(k => k.shiver !== undefined)) s.shiver = 1;
        if (bgWeather === 'hot' && !keys.some(k => k.sweat !== undefined)) s.sweat = 1;
      }
      s.speaking = (cue?.character_id || cue?.speaker || cue?.speaker_id) === id && !cue?.offscreen;
      s.mouth = 0;
      if (s.speaking) {
        s.expression = cue.expression || s.expression;
        s.mouth = cue.visemes?.length ? clamp(track(cue.visemes, t, { open: 0 }).open) : (.2 + .8 * Math.abs(Math.sin((t - cue.start) * 17))) * clamp((t - cue.start) * 20) * clamp((cue.end - t) * 20);
      }
      s.gait = 0;
      s.attached = Boolean(c.attach_to);
      s.attach_to = c.attach_to || null;
      s.layer = c.layer || (c.attach_to && c.attach_to.layer) || null;
      // Vận tốc của pose (không tính action) chỉ dùng cho chuyển động phụ khi vẽ:
      // bước chân, nhún, nghiêng. Không đụng toạ độ neo nên không đổi điểm tiếp xúc.
      const before = keys?.length ? track(keys, Math.max(0, t - 1 / 12), cat.pose_defaults) : posed;
      const vx = (posed.x - before.x) * 12, vy = (posed.y - before.y) * 12;
      s.vx = Number.isFinite(vx) ? vx : 0; s.vy = Number.isFinite(vy) ? vy : 0;
      const size = Math.max(40, posed.height || 100);
      s.walk = clamp((Math.abs(s.vx) - size * .04) / (size * .5));
      s.stride = Number.isFinite(posed.x) ? posed.x / (size * .17) * Math.PI : 0;
    }
    const actions = (scene.actions || []).map((a, order) => ({ ...a, order })).sort((a, b) => a.start - b.start || a.order - b.order);
    const live = [];
    for (const a of actions) {
      const spec = cat.actions[a.type], active = t >= a.start && t < a.end;
      if (t < a.start || (!active && !(a.hold ?? spec.hold))) continue;
      const p = clamp((t - a.start) / (a.end - a.start)), u = smooth(p), amount = a.amount ?? 1;
      const target = states[a.target], actor = states[a.actor];
      const contactProgress = ['cut', 'slice', 'press', 'uproot', 'dig'].includes(a.type) ? smooth(clamp((p - .2) / .65)) : a.type === 'graze' ? smooth(clamp((p - .25) / .75)) : u;
      if (spec.channel && a.type !== 'gesture') {
        const joint = a.type === 'press' && /^branch_\d+$/.test(a.target_anchor || '') ? a.target_anchor : null;
        const channel = joint || spec.channel;
        const value = joint ? amount * 60 * (Number(joint.split('_')[1]) % 2 ? -1 : 1) : channel === 'tentacle' ? amount * 46 : amount;
        const influence = a.type === 'press' && a.hold === false ? contactProgress * (1 - smooth(clamp((p - .85) / .15))) : contactProgress;
        const entity = target || actor;
        if (entity && entity[channel] !== undefined) entity[channel] = mix(entity[channel], value, influence);
      }
      if (a.type === 'uproot') { target.lift = 140 * amount * contactProgress; target.y -= target.lift; }
      if (a.type === 'gesture') {
        actor.arm += Math.sin(p * TAU) * 38 * amount;
        if (HANDS.has(actor.asset)) actor.rotation += actor.arm * .45 * (actor.asset === 'hand_right' ? -1 : 1);
      }
      if (a.type === 'crawl') actor.gait = p * 14;
      if (a.type === 'cut' && active) actor.is_cutting = true;
      // Nghiêng bình tưới cho vòi chúc xuống rồi dựng lại.
      if (a.type === 'water' && active) actor.rotation -= 42 * (p < .15 ? smooth(p / .15) : p > .85 ? 1 - smooth((p - .85) / .15) : 1) * amount;
      if (a.type === 'graze' && active) {
        if (!((actor.mouth || 0) > .01 && cue?.character_id === a.actor)) {
          actor.mouth = 0.5 + 0.5 * Math.sin(t * 12);
        }
      }
      if (a.type === 'hop') {
        actor.y -= Math.abs(Math.sin(p * Math.PI * 2)) * actor.height * 0.25;
      }
      if (a.type === 'fly') {
        if (active) actor.flying = true;
        actor.x += Math.sin(p * TAU) * 60;
        actor.y += Math.sin(2 * p * TAU) * 25;
        if (Math.cos(p * TAU) < 0) actor.flip = !actor.flip;
      }
      if (ACTION_HOOKS[a.type]) ACTION_HOOKS[a.type](a, states, t, p, u, amount, cat, active);
      live.push({ ...a, p, active });
    }
    // Nhiễm độc (toxic, từ pose hoặc spray_drift): cây úa vàng rủ lá (dùng lại damage), người/chibi đổi sắc mặt.
    for (const s of Object.values(states)) {
      if (!(s.toxic > .05)) continue;
      const group = cat.assets[s.asset].group;
      if (group === 'plant' || group === 'vegetable') { s.damage = Math.max(s.damage || 0, s.toxic * .8); s.bend = Math.max(s.bend || 0, s.toxic * .3); }
      if ((group === 'human' || group === 'chibi') && ['neutral', 'happy', 'smug'].includes(s.expression)) s.expression = s.toxic > .6 ? 'sick' : 'worried';
    }
    function attach(id, stack = new Set()) {
      if (stack.has(id)) throw new Error('Rig attachment cycle');
      const c = cast.get(id), s = states[id];
      if (!c.attach_to) return;
      stack.add(id); attach(c.attach_to.id, stack); stack.delete(id);
      const parent = states[c.attach_to.id], origin = worldAnchor(cat, parent, c.attach_to.anchor);
      const local = track(scene.poses[id], t, cat.pose_defaults);
      const delta = rotate(local.x * (parent.flip ? -1 : 1), local.y, parent.rotation);
      s.x = origin.x + delta[0]; s.y = origin.y + delta[1] - (s.lift || 0);
      s.rotation = parent.rotation + local.rotation; s.flip = Boolean(parent.flip) !== Boolean(local.flip);
      s.opacity = local.opacity * parent.opacity;
    }
    for (const id of scene.characters_present) attach(id);
    // pick của người = vươn tay IK tới fruit_N trong 0.6 s đầu (không dời cả thân như tay rời).
    const reachLike = item => item.type === 'reach' || (item.type === 'pick' && (PEOPLE.has(states[item.actor].asset) || cat.assets[states[item.actor].asset]?.group === 'chibi'));
    for (const a of live.filter(reachLike)) {
      const actor = states[a.actor], target = states[a.target], hand = a.type === 'pick' ? (a.actor_anchor === 'hand_l' ? 'hand_l' : 'hand_r') : a.actor_anchor || 'hand_r';
      if (!actor || !target) continue;
      const destination = worldAnchor(cat, target, a.target_anchor || 'grip');
      const blend = a.type === 'pick' ? smooth(clamp((t - a.start) / pickReach(a))) : smooth(a.p);
      const local = worldToLocal(actor, destination);
      const prefix = hand === 'hand_l' ? 'hand_l' : 'hand_r';
      actor[`${prefix}_x`] = mix(actor[`${prefix}_x`], local[0], blend);
      actor[`${prefix}_y`] = mix(actor[`${prefix}_y`], local[1], blend);
    }
    for (const a of live) {
      const spec = cat.actions[a.type];
      if (!spec.motion) continue;
      const actor = states[a.actor], target = states[a.target];
      if (!actor || !target) continue;
      if (a.type === 'pick' && (PEOPLE.has(actor.asset) || cat.assets[actor.asset]?.group === 'chibi')) continue;  // người / chibi: đã vươn tay IK ở trên
      if (!a.active && ['cut', 'slice', 'press', 'peck', 'dig'].includes(a.type)) continue;
      const actorName = a.actor_anchor || (cat.assets[actor.asset].anchors[spec.actor_anchor] ? spec.actor_anchor : 'root');
      const targetName = a.target_anchor || (cat.assets[target.asset].anchors[spec.target_anchor] ? spec.target_anchor : 'face');
      const from = worldAnchor(cat, actor, actorName), dest = worldAnchor(cat, target, targetName);
      let blend = smooth(a.p), dx = 0, dy = 0;
      if (a.type === 'pick') blend = smooth(clamp((t - a.start) / pickReach(a)));
      if (a.type === 'cut' || a.type === 'slice' || a.type === 'dig') {
        const defaultStroke = a.type === 'dig' ? [0, 30] : [0, Math.min(65, target.height * .25)];
        const stroke = a.stroke || defaultStroke;
        if (a.type === 'dig') {
          const pSub = (a.p * 2) % 1;
          const digPhase = clamp((pSub - .2) / .5);
          dx = stroke[0] * digPhase;
          dy = stroke[1] * digPhase;
          blend = a.p < .15 ? smooth(a.p / .15) : a.p > .85 ? 1 - smooth((a.p - .85) / .15) : 1;
        } else {
          const cut = clamp((a.p - .2) / .5);
          dx = stroke[0] * cut; dy = stroke[1] * cut;
          blend = a.p < .2 ? smooth(a.p / .2) : a.p > .8 ? 1 - smooth((a.p - .8) / .2) : 1;
        }
      }
      if (a.type === 'press') blend = a.p < .2 ? smooth(a.p / .2) : a.p > .85 ? 1 - smooth((a.p - .85) / .15) : 1;
      if (a.type === 'uproot') blend = smooth(clamp(a.p * 4));
      if (a.type === 'cover') actor.opacity = mix(actor.opacity, track(scene.poses[a.actor], t, cat.pose_defaults).opacity, blend);
      if (a.type === 'uncover') { dest.y -= 230 * smooth(a.p); actor.opacity *= 1 - smooth(a.p); blend = 1; }
      if (a.type === 'crawl') dy -= Math.abs(Math.sin(a.p * Math.PI * 14)) * 4 * (1 - a.p);
      if (a.type === 'graze') {
        // Đi ngang tới bụi cỏ rồi CÚI ĐẦU cho mõm chạm ngọn cỏ; thân và chân không rời mặt đất.
        blend = a.p < .25 ? smooth(a.p / .25) : 1;
        const qspec = QUADRUPED_SPECS[actor.asset], mouthName = actorName;
        if (qspec) {
          const scale = actor.height / 100, rest = cat.assets[actor.asset].anchors[mouthName] || [0, 0];
          const localTarget = rest[1] + (dest.y - from.y) / scale;
          const nod = a.active && a.p >= .25 ? Math.sin(a.p * Math.PI * 6) * .05 : 0;
          actor.head_down = Math.max(0, headAngleFor(qspec, rest, localTarget) * smooth(clamp(a.p / .3)) + nod);
          const reached = worldAnchor(cat, actor, mouthName);
          actor.x += (dest.x - reached.x) * blend;
          continue;
        }
      }
      if (a.type === 'pollinate') {
        blend = smooth(clamp(a.p * 2.5));
        dx = Math.sin(t * 3) * 6;
        dy = Math.cos(t * 3) * 6;
      }
      // Mổ ba lần: mỏ chạm đích ở đỉnh mỗi nhịp rồi rút về.
      if (a.type === 'peck') blend = Math.abs(Math.sin(a.p * Math.PI * 3)) ** 1.5;
      actor.x += (dest.x + dx - from.x) * blend; actor.y += (dest.y + dy - from.y) * blend;
    }
    for (const id of scene.characters_present) attach(id);
    for (const a of live.filter(item => item.type === 'carry')) {
      const actor = states[a.actor], target = states[a.target];
      if (!actor || !target) continue;
      const blend = smooth(a.p), destination = worldAnchor(cat, actor, 'carry');
      const origin = worldAnchor(cat, target, a.target_anchor || 'root');
      target.x += (destination.x - origin.x) * blend;
      target.y += (destination.y - origin.y) * blend;
      for (const side of ['l', 'r']) {
        const hand = `hand_${side}`, point = worldAnchor(cat, target, `grip_${side}`), local = worldToLocal(actor, point);
        actor[`${hand}_x`] = mix(actor[`${hand}_x`], local[0], blend);
        actor[`${hand}_y`] = mix(actor[`${hand}_y`], local[1], blend);
      }
    }
    for (const id of scene.characters_present) attach(id);
    return { t, scene, states, actions: live, cue, camera: track(scene.camera, t, { x: W / 2, y: H / 2, zoom: 1 }) };
  }
  function sample(story, cat, seconds) {
    const memo = new Map(), cast = new Map(story.characters.map(c => [c.id, c]));
    function evaluate(at, limit = Infinity) {
      const key = `${at}:${limit}`;
      if (memo.has(key)) return memo.get(key);
      const frame = sampleBase(story, cat, at), { states, scene, t } = frame;
      const events = (scene.actions || []).filter(a => ['grip', 'release'].includes(a.type)).map((a, order) => ({ ...a, order })).sort((a, b) => a.start - b.start || a.order - b.order);
      const latest = new Map();
      events.forEach((a, i) => { if (i < limit && t >= a.start) latest.set(a.target, { ...a, index: i }); });
      for (const a of latest.values()) {
        const actor = states[a.actor];
        if (a.type === 'grip' && HANDS.has(actor.asset) && actor.hand_pose === 'open' && !actor.hand_curls) {
          const u = a.blend_in ? smooth(clamp((t - a.start) / a.blend_in)) : 1;
          actor.hand_curls = handPresets.open.map((v, i) => mix(v, handPresets.knife[i], u));
          actor.hand_pose = 'knife';
        }
      }
      const done = new Set(), visiting = new Set();
      function resolve(id) {
        if (done.has(id)) return;
        if (visiting.has(id)) throw new Error('Grip/attachment cycle');
        visiting.add(id);
        const state = states[id], binding = latest.get(id), c = cast.get(id);
        if (binding) {
          const captured = evaluate(binding.start, binding.index);
          const initial = captured.states[id];
          if (binding.type === 'release') {
            const p = clamp((t - binding.start) / (binding.end - binding.start)), offset = binding.offset || [0, 0];
            for (const field of ['x', 'y', 'rotation', 'height', 'flip', 'opacity']) state[field] = initial[field];
            state.x += offset[0] * p; state.y += offset[1] * p * p; state.rotation += (binding.spin || 0) * p;
            state.held_by = null;
          } else {
            resolve(binding.actor);
            const holder = states[binding.actor], anchor = binding.actor_anchor || cat.actions.grip.actor_anchor;
            const now = worldFrame(cat, holder, anchor), start = worldFrame(cat, captured.states[binding.actor], anchor);
            const mirrored = Boolean(now.flip) !== Boolean(start.flip);
            const offsetAngle = binding.rotation ?? (initial.rotation - start.rotation);
            const desired = { ...state, x: 0, y: 0, height: initial.height * now.height / start.height, rotation: now.rotation + (mirrored ? -offsetAngle : offsetAngle), flip: Boolean(initial.flip) !== mirrored, opacity: initial.opacity * holder.opacity };
            const pivot = worldAnchor(cat, desired, binding.target_anchor || cat.actions.grip.target_anchor);
            desired.x = now.x - pivot.x; desired.y = now.y - pivot.y;
            const u = binding.blend_in ? smooth(clamp((t - binding.start) / binding.blend_in)) : 1;
            for (const field of ['x', 'y', 'rotation', 'height', 'opacity']) state[field] = mix(initial[field], desired[field], u);
            state.flip = u < 1 ? initial.flip : desired.flip;
            state.held_by = binding.actor;
          }
        } else if (c.attach_to) {
          resolve(c.attach_to.id);
          const parent = states[c.attach_to.id], socket = worldFrame(cat, parent, c.attach_to.anchor);
          const local = track(scene.poses[id], t, cat.pose_defaults);
          const delta = rotate(local.x * (parent.flip ? -1 : 1), local.y, socket.rotation);
          state.x = socket.x + delta[0]; state.y = socket.y + delta[1] - (state.lift || 0);
          state.rotation = socket.rotation + (parent.flip ? -local.rotation : local.rotation);
          state.flip = Boolean(parent.flip) !== Boolean(local.flip); state.opacity = local.opacity * parent.opacity;
          if (state.layer === 'over_face' && parent) {
            state.z = Math.max(state.z, (parent.z || 0) + 0.1);
          }
        }
        visiting.delete(id); done.add(id);
      }
      for (const id of scene.characters_present) resolve(id);
      memo.set(key, frame);
      return frame;
    }
    return evaluate(seconds);
  }
  function face(ctx, s, cat, t) {
    if (!s.faceEnabled) return;
    const [x, y] = localAnchor(cat, s, 'face');
    let size = { farmer: .46, fisherman: .46, farmer_woman: .46, hand_right: .65, chicken: .3, buffalo: .4, earthworm: .3, snail: .34, bee: .34, scarecrow: .5, eggplant: .72, corn: .62, watering_can: .6, hand: .65, foot: .65, knife: .8, pepper: .65, face: 1.45, fish: .5, big_fish: .42, bobber: .6, cow: .38, pig: .36, goat: .32, sheep: .34, horse: .38, dog: .34, cat: .32, rabbit: .3, mouse: .22, duck: .32, chick: .26, rooster: .34, sparrow: .24, butterfly: .28, dragonfly: .28, ladybug: .22, ant: .2, caterpillar: .24, frog: .36, mango: .8, orange: .85, lime: .7, guava: .75, lychee: .7, rambutan: .7, mangosteen: .75, durian: .9, coconut: .85, avocado: .75, strawberry: .7, pineapple: .8, grape: .6, dragon_fruit: .8, starfruit: .75, jackfruit: .95, banana_fruit: .65, sack: .65, egg: .45, beehive: .55 }[s.asset] || 1;
    if (cat.assets[s.asset].group === 'plant') size = { sunflower: .5, cabbage: .6, carrot: .42, rice_plant: .45, corn_plant: .48, banana_tree: .5 }[s.asset] || (cat.assets[s.asset].pack === 'farm_trees' ? .4 : .55);
    // Mặt hoa lớn theo độ nở: nụ nhỏ không bị mặt che, hoa nở hết mặt ~.52 (bông ~26 đơn vị).
    if (FLOWER_SPECS[s.asset]) size = .26 + .26 * clamp((clamp(s.growth) - .3) / .7);
    if (cat.assets[s.asset].face_scale) size = cat.assets[s.asset].face_scale;  // rig thân nhỏ (gừng, ớt…) khai cỡ mặt trong catalog
    const [hx, hy] = headOffset(s, t);
    ctx.save(); ctx.translate(x + hx, y + hy); ctx.scale(size, size);
    if (HANDS.has(s.asset)) ctx.rotate((s.wrist || 0) * Math.PI / 180 * (s.asset === 'hand_right' ? -1 : 1));
    const e = s.expression, speaking = s.mouth > .01;
    const blink = (t + (hash(s.id) % 97) / 23) % 3.8 > 3.66;
    const lx = clamp(s.look_x || 0, -1, 1) * 2.6, ly = clamp(s.look_y || 0, -1, 1) * 2.6;
    // Má hồng trước mắt để viền mắt đè lên.
    ctx.save();
    const blushAlpha = Math.min(1.0, 0.42 + (s.blush || 0) * 0.45 + (s.fever || 0) * 0.35);
    ctx.globalAlpha *= blushAlpha;
    const blushCol = e === 'sick' || s.sick ? '#68b878' : e === 'cold' ? '#8cb8ea' : e === 'hot' || s.fever ? '#ff3b30' : '#ff7f86';
    for (const side of [-1, 1]) ellipse(ctx, side * 18, 9, 6.5, 3.8, blushCol, null);
    if (s.fever > 0) ellipse(ctx, 0, -10, 14, 6, 'rgba(255, 60, 50, 0.25)', null);
    ctx.restore();
    if (s.tears > 0) {
      for (const side of [-1, 1]) ellipse(ctx, side * 15, 6, 2.2, 3.8, '#58b2e8', null);
    }
    for (const side of [-1, 1]) {
      const ex = side * 10;
      if (e === 'sleep' || blink) {
        path(ctx, `M ${ex - 8} 1 Q ${ex} 7 ${ex + 8} 1`, null, INK, 2.2);
        if (e === 'sleep') line(ctx, [[ex - 6 * side, 3], [ex - 9 * side, 6]], INK, 1.2);
      } else if (e === 'dizzy') {
        ellipse(ctx, ex, 0, 8.5, 8.5, '#fffdf6', INK, 1.7);
        for (let ring = 2.2; ring <= 6.2; ring += 2.0) {
          path(ctx, `M ${ex - ring} 0 A ${ring} ${ring} 0 1 0 ${ex + ring} 0 A ${ring} ${ring} 0 1 0 ${ex - ring} 0`, null, INK, 1.4);
        }
      } else if (e === 'happy' && !speaking) {
        path(ctx, `M ${ex - 8} 3 Q ${ex} -8 ${ex + 8} 3`, null, INK, 2.6);
      } else {
        const ry = e === 'surprised' ? 12.5 : 10.5, rx = e === 'surprised' ? 9.5 : 8.6;
        ellipse(ctx, ex, 0, rx, ry, '#fffdf6', INK, 1.7);
        const ir = e === 'surprised' ? 4 : 5.4;
        ctx.save(); const clip = new Path2D(); clip.ellipse(ex, 0, rx, ry, 0, 0, TAU); ctx.clip();
        ellipse(ctx, ex + lx + 1, 1.5 + ly, ir, ir * 1.18, volume(ctx, ex + lx + 1, 1.5 + ly, ir, ir, '#4a2e1c', .25, -.45), null);
        ellipse(ctx, ex + lx + 1, 1.8 + ly, ir * .5, ir * .6, '#140c08', null);
        ellipse(ctx, ex + lx - 1, -1.5 + ly, 1.9, 1.9, '#ffffff', null);
        ellipse(ctx, ex + lx + 3, 4.2 + ly, .9, .9, '#ffffff', null);
        // Mí mắt: đắc ý / tức giận che nửa trên, lo lắng che góc ngoài.
        if (e === 'smug' || e === 'angry') path(ctx, `M ${ex - 11} -12 L ${ex + 11} -12 L ${ex + 11} ${e === 'smug' ? -1 : -4 + side * 3} L ${ex - 11} ${e === 'smug' ? -1 : -4 - side * 3} Z`, '#e4d6c3', null);
        ctx.restore();
        if (e === 'smug') line(ctx, [[ex - 8.6, -1], [ex + 8.6, -1]], INK, 1.8);
      }
      // Lông mày cho mọi biểu cảm: nét quyết định cảm xúc khi mặt nhỏ trên màn hình.
      const brow = {
        neutral: [-15, -15, .35], happy: [-17, -17, .5], worried: [-13, -18, -.2], sad: [-13, -17, -.15],
        angry: [-17, -11, .1], surprised: [-21, -21, .6], smug: side < 0 ? [-14, -14, .2] : [-19, -17, .45], sleep: [-12, -12, .2],
        sick: [-13, -18, -.25], cold: [-14, -16, -.15], hot: [-16, -18, .4], dizzy: [-18, -13, .1]
      }[e] || [-15, -15, .35];
      const inner = [ex - side * 7, brow[1]], outer = [ex + side * 8, brow[0]], mid = [ex, Math.min(brow[0], brow[1]) - brow[2] * 5];
      path(ctx, `M ${inner[0]} ${inner[1]} Q ${mid[0]} ${mid[1]} ${outer[0]} ${outer[1]}`, null, INK, 2.8);
    }
    if (speaking || e === 'surprised') {
      const open = e === 'surprised' && !speaking ? .55 : s.mouth, w = e === 'surprised' && !speaking ? 5 : 7 + open * 3, h = 2.5 + open * 8;
      path(ctx, `M ${-w} 15 Q 0 ${13 - open * 2} ${w} 15 Q ${w * .8} ${15 + h} 0 ${15 + h} Q ${-w * .8} ${15 + h} ${-w} 15 Z`, '#6b2a2e', INK, 1.5);
      if (open > .3) {
        ctx.save(); const clip = new Path2D(`M ${-w} 15 Q 0 ${13 - open * 2} ${w} 15 Q ${w * .8} ${15 + h} 0 ${15 + h} Q ${-w * .8} ${15 + h} ${-w} 15 Z`); ctx.clip(clip);
        ellipse(ctx, 0, 15 + h, w * .62, h * .45, '#ee7d82', null);
        path(ctx, `M ${-w} 14 L ${w} 14 L ${w} ${16 + h * .12} L ${-w} ${16 + h * .12} Z`, '#fffdf6', null);
        ctx.restore();
      }
    } else if (e === 'happy') {
      path(ctx, 'M -9 13 Q 0 14 9 13 Q 8 25 0 25 Q -8 25 -9 13 Z', '#6b2a2e', INK, 1.5);
      ctx.save(); ctx.clip(new Path2D('M -9 13 Q 0 14 9 13 Q 8 25 0 25 Q -8 25 -9 13 Z')); ellipse(ctx, 0, 25, 6, 4.5, '#ee7d82', null); ctx.restore();
    } else if (e === 'angry') {
      path(ctx, 'M -8 20 Q 0 15 8 20 L 8 23 Q 0 19 -8 23 Z', '#fffdf6', INK, 1.5);
    } else if (e === 'smug') {
      path(ctx, 'M -6 18 Q 2 20 9 13', null, INK, 2);
    } else if (e === 'sleep') {
      ellipse(ctx, 1, 19, 2.4, 2, '#6b2a2e', INK, 1.1);
      ctx.save(); ctx.globalAlpha *= .8;
      const drift = (t * .6) % 1;
      path(ctx, `M 20 ${-18 - drift * 16} l 7 0 l -7 7 l 7 0`, null, INK, 1.6);
      ctx.restore();
    } else if (e === 'sick') {
      path(ctx, 'M -8 18 Q -4 14 0 18 Q 4 22 8 18', null, INK, 2.2);
    } else if (e === 'cold') {
      path(ctx, 'M -7 16 L 7 16 L 7 22 L -7 22 Z', '#ffffff', INK, 1.4);
      line(ctx, [[-2, 16], [-2, 22]], INK, 1.1);
      line(ctx, [[3, 16], [3, 22]], INK, 1.1);
    } else if (e === 'hot') {
      path(ctx, 'M -8 14 Q 0 12 8 14 Q 7 24 0 24 Q -7 24 -8 14 Z', '#6b2a2e', INK, 1.5);
      ellipse(ctx, 0, 24, 4.5, 4.8, '#ee5555', null);
      ellipse(ctx, 16, -8 + (t * 8 % 10), 2.4, 3.8, '#70c8e8', INK, 0.9);
    } else if (e === 'dizzy') {
      path(ctx, 'M -7 19 Q -3 23 1 16 Q 4 18 7 17', null, INK, 2.0);
    } else {
      const mood = e === 'sad' ? -5 : e === 'worried' ? -2.5 : 4;
      path(ctx, `M -7 ${17 - (mood < 0 ? 0 : 1)} Q 0 ${17 + mood} 7 ${17 - (mood < 0 ? 0 : 1)}`, null, INK, 2.1);
    }
    if (e === 'sad') for (const side of [-1, 1]) ellipse(ctx, side * 12, 11 + (t * 10 % 18), 2.8, 4.5, '#8fd8f0', '#4d9ab5', .8);
    ctx.restore();
  }
  // Đầu nhún theo nhịp thở, gật nhẹ khi nói; face() và thân dùng cùng độ lệch.
  function headOffset(s, t) {
    if (s.asset === 'bee') return [0, Math.sin(t * 6 + hash(s.id) % 5) * 2.2];
    if (s.asset === 'sparrow') return [0, Math.sin(t * 6 + hash(s.id) % 5) * 2];
    if (s.asset === 'butterfly') return [Math.sin(t * 3.5) * 3, Math.cos(t * 2.8) * 3];
    if (s.asset === 'rabbit' || s.asset === 'frog') return [0, (s.walk || 0) * -Math.abs(Math.sin(s.stride || 0)) * 6];
    if (s.asset === 'chick') return [0, (s.walk || 0) * -Math.abs(Math.sin(s.stride || 0)) * 3];
    if (!PEOPLE.has(s.asset) && !['watermelon', 'apple', 'tomato', 'pepper', 'pumpkin', 'eggplant', 'corn'].includes(s.asset)) return [0, 0];
    const breath = Math.sin(t * 2.3 + hash(s.id) % 7) * .55;
    const nod = (s.mouth || 0) * 1.6, bob = (s.walk || 0) * -Math.abs(Math.sin(s.stride || 0)) * 2.2;
    const pose = PEOPLE.has(s.asset) ? celId(s) : '', lean = pose.includes('pull') || pose.includes('reach') ? -4 : pose.includes('recoil') ? 4 : 0;
    return [lean * .8, breath + nod + bob];
  }
  // Tay chân nhỏ của quả có mặt: vẫy nhẹ khi đứng, vung mạnh khi nói, bước theo
  // quãng đường đã đi (stride) nên tua tới/lui vẫn ra cùng một dáng.
  function fruitLimbs(ctx, s, t, color, part, spec) {
    const talk = s.mouth || 0, walk = s.walk || 0, stride = s.stride || 0, seed = hash(s.id) % 11;
    if (part === 'legs') {
      if (s.held_by) return;
      for (const side of [-1, 1]) {
        const phase = stride + (side > 0 ? Math.PI : 0), swing = Math.sin(phase) * walk * 9, lift = Math.max(0, -Math.cos(phase)) * walk * 5;
        const cx = spec.hipX || 0, hip = [cx + side * spec.hip, spec.hipY], foot = [cx + side * (spec.hip + 3) + swing, -3.5 - lift];
        limb(ctx, [hip, foot], color, 5.5);
        ellipse(ctx, foot[0] + side * 3.5, foot[1] + .5, 8.5, 4.4, volume(ctx, foot[0] + side * 3.5, foot[1], 8.5, 4.4, tone(color, -.2)), INK, 1.4);
      }
      return;
    }
    for (const side of [-1, 1]) {
      const wave = Math.sin(t * 2.1 + seed + side) * .1 + talk * Math.sin(t * 9 + side * 1.7) * .55 + walk * Math.sin(stride + (side > 0 ? 0 : Math.PI)) * .35;
      const angle = (side > 0 ? .55 : Math.PI - .55) - side * (wave + (s.expression === 'happy' || s.expression === 'surprised' ? .7 : 0));
      const shoulder = [(spec.armX || 0) + side * spec.arm, spec.armY], elbow = [shoulder[0] + Math.cos(angle) * 10, shoulder[1] + Math.sin(angle) * 10];
      const hand = [elbow[0] + Math.cos(angle + side * .35) * 10, elbow[1] + Math.sin(angle + side * .35) * 10];
      limb(ctx, [shoulder, elbow, hand], color, 5);
      mitten(ctx, hand[0], hand[1], 4.6, color, side > 0 ? 0 : Math.PI);
    }
  }
  // Bí ngô múi, cà tím thuôn có đài, bắp ngô hạt xếp hàng trong lá bẹ.
  function drawGourd(ctx, s, body) {
    if (s.asset === 'pumpkin') {
      ctx.save(); ctx.translate(0, -40);
      for (const k of [-2, 2, -1, 1, 0]) {
        const x = k * 15, rx = k === 0 ? 20 : 22;
        ellipse(ctx, x, 0, rx, 38, volume(ctx, x, 0, rx, 38, tone(body, Math.abs(k) === 2 ? -.12 : 0), .3, -.3), INK, 2);
      }
      ctx.restore();
      ellipse(ctx, -24, -58, 5, 10, 'rgba(255,255,255,.4)', null, 1, .35);
      path(ctx, 'M -4 -74 Q -6 -88 2 -96 L 10 -92 Q 5 -84 6 -74 Z', cylinder(ctx, -6, 10, '#6e8a3a'), INK, 1.6);
      path(ctx, 'M 8 -90 Q 20 -98 22 -86 Q 18 -90 12 -86', null, '#5f8f3a', 1.6);
      leaf(ctx, -6, -80, .5, -1.2, '#5fa244', true);
    } else if (s.asset === 'eggplant') {
      const d = 'M 0 -80 C -20 -80 -24 -60 -24 -44 C -26 -14 -14 -2 2 -2 C 18 -2 28 -14 26 -42 C 25 -62 18 -80 0 -80 Z';
      path(ctx, d, volume(ctx, -4, -42, 28, 40, body, .35, -.3), INK, 2.2);
      ellipse(ctx, -12, -50, 4.5, 16, 'rgba(255,255,255,.45)', null, 1, .12);
      let cap = 'M -16 -72';
      for (let i = 0; i <= 5; i++) cap += ` L ${-16 + i * 6.4} ${i % 2 ? -60 : -76 + Math.abs(i - 2.5)}`;
      path(ctx, cap + ' Q 0 -88 -16 -72 Z', volume(ctx, 0, -76, 18, 10, '#5c9a44'), INK, 1.6);
      path(ctx, 'M 0 -82 Q -2 -94 6 -98', null, INK, 5.5); path(ctx, 'M 0 -82 Q -2 -94 6 -98', null, '#6aa44a', 3.2);
    } else {
      ctx.save(); ctx.translate(0, -50);
      const cob = new Path2D('M 0 -40 C -20 -40 -22 -10 -20 14 C -18 34 -8 42 0 42 C 8 42 18 34 20 14 C 22 -10 20 -40 0 -40 Z');
      ctx.fillStyle = volume(ctx, 0, 0, 22, 42, body, .25, -.25); ctx.fill(cob);
      ctx.save(); ctx.clip(cob);
      for (let row = 0; row < 11; row++) for (let col = -3; col <= 3; col++) {
        const x = col * 6 + (row % 2) * 3, y = -36 + row * 7.4;
        ellipse(ctx, x, y, 2.9, 3.4, volume(ctx, x, y, 3, 3.4, body, .45, -.2), tone(body, -.3), .6);
      }
      ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(cob);
      for (const side of [-1, 1]) {
        const husk = `M ${side * 4} 44 Q ${side * 30} 20 ${side * 22} -18 Q ${side * 18} 12 ${side * 2} 30 Z`;
        path(ctx, husk, volume(ctx, side * 16, 16, 14, 30, '#78b04c'), INK, 1.8);
      }
      ctx.restore();
      for (let i = -2; i <= 2; i++) path(ctx, `M 0 -88 Q ${i * 5} -98 ${i * 7} -104`, null, '#c7894a', 1.3);
    }
  }
  const FRUIT_COLORS = {
    apple: [[139, 196, 74], [232, 196, 70], [214, 50, 48]],
    tomato: [[112, 178, 66], [240, 160, 52], [226, 58, 44]],
    pumpkin: [[104, 156, 70], [222, 176, 62], [240, 134, 38]],
    eggplant: [[150, 176, 96], [134, 84, 156], [86, 40, 112]],
    corn: [[226, 222, 160], [246, 212, 86], [244, 186, 44]],
    mango: [[127, 178, 74], [216, 194, 74], [242, 169, 59]],
    orange: [[111, 174, 72], [232, 184, 74], [240, 138, 42]],
    lime: [[95, 174, 72], [140, 200, 78], [184, 216, 90]],
    guava: [[111, 174, 72], [168, 204, 90], [216, 224, 122]],
    lychee: [[140, 191, 90], [216, 106, 74], [200, 50, 58]],
    rambutan: [[140, 191, 90], [224, 112, 58], [208, 48, 47]],
    mangosteen: [[111, 154, 74], [138, 74, 122], [74, 32, 64]],
    durian: [[111, 154, 58], [154, 168, 58], [184, 168, 58]],
    coconut: [[92, 160, 58], [112, 176, 64], [142, 98, 50]],
    avocado: [[95, 154, 58], [63, 106, 42], [47, 58, 31]],
    strawberry: [[196, 222, 150], [238, 96, 92], [220, 36, 54]],
    pineapple: [[127, 174, 72], [216, 184, 74], [232, 162, 58]],
    grape: [[154, 200, 90], [138, 90, 154], [90, 42, 106]],
    dragon_fruit: [[154, 200, 90], [224, 90, 138], [224, 48, 106]],
    starfruit: [[140, 200, 78], [216, 216, 74], [240, 200, 58]],
    jackfruit: [[127, 168, 74], [168, 176, 74], [200, 176, 74]],
    banana_fruit: [[127, 178, 74], [224, 208, 74], [242, 207, 69]],
  };
  // Thân riêng của từng trái cây; drawFruit giữ phần chung (tay chân, bổ đôi, co giãn, vết cắt).
  const FRUIT_BODIES = {
    pepper(ctx, s, body, t) {
      const d = 'M 6 -93 C -25 -99 -33 -67 -22 -38 Q -9 -9 -24 -2 Q 32 -6 30 -56 Q 34 -89 6 -93 Z';
      path(ctx, d, volume(ctx, 0, -55, 30, 44, body), INK, 2.2);
      path(ctx, 'M 18 -84 Q 26 -60 17 -30 Q 26 -58 21 -84 Z', tone(body, -.25), null);
      ellipse(ctx, -12, -70, 4.5, 14, 'rgba(255,255,255,.55)', null, 1, .25);
      ellipse(ctx, -6, -48, 2.2, 5, 'rgba(255,255,255,.4)', null, 1, .2);
      path(ctx, 'M -10 -89 Q -2 -99 6 -97 Q 16 -99 22 -88 Q 12 -84 6 -87 Q -2 -84 -10 -89 Z', volume(ctx, 6, -92, 16, 6, '#5c9a3f'), INK, 1.6);
      path(ctx, 'M 5 -96 Q 4 -106 12 -110 Q 17 -111 18 -107', null, INK, 5.2);
      path(ctx, 'M 5 -96 Q 4 -106 12 -110 Q 17 -111 18 -107', null, '#6aa447', 3);
    },
    pumpkin(ctx, s, body, t) {
      drawGourd(ctx, s, body);
    },
    apple(ctx, s, body, t) {
      path(ctx, 'M 0 -86 C -30 -104 -56 -80 -48 -46 Q -40 -8 -14 -6 Q -4 -4 0 -8 Q 6 -4 16 -6 Q 44 -8 49 -46 Q 55 -104 0 -86 Z', volume(ctx, -4, -52, 46, 44, body), INK, 2.2);
      ellipse(ctx, -22, -70, 7, 14, 'rgba(255,255,255,.5)', null, 1, .5);
      ellipse(ctx, -12, -82, 2.5, 3, 'rgba(255,255,255,.55)', null);
      path(ctx, 'M 0 -88 Q 1 -100 9 -106', null, INK, 5.5);
      path(ctx, 'M 0 -88 Q 1 -100 9 -106', null, '#6e5a34', 3.2);
      leaf(ctx, 4, -100, .45, 1.05, '#72b04a');
    },
    tomato(ctx, s, body, t) {
      ellipse(ctx, 0, -46, 48, 42, volume(ctx, 0, -46, 48, 42, body), INK, 2.2);
      ctx.save(); ctx.globalAlpha *= .35;
      for (const side of [-1, 1]) path(ctx, `M ${side * 10} -84 Q ${side * 24} -50 ${side * 12} -10`, null, tone(body, -.3), 2);
      ctx.restore();
      ellipse(ctx, -22, -70, 7, 14, 'rgba(255,255,255,.5)', null, 1, .5);
      ellipse(ctx, -12, -82, 2.5, 3, 'rgba(255,255,255,.55)', null);
      let d = 'M 0 -84';
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i + .5) * TAU / 5, b = a + TAU / 10; d += ` L ${Math.cos(a) * 20} ${-84 + Math.sin(a) * 7 + 2} L ${Math.cos(b) * 6} ${-84 + Math.sin(b) * 3}`; }
      path(ctx, d + ' Z', '#4f9a3c', INK, 1.4);
      line(ctx, [[0, -86], [1, -96]], INK, 5); line(ctx, [[0, -86], [1, -96]], '#5da646', 3);
    },
    watermelon(ctx, s, body, t) {
      ellipse(ctx, 0, -50, 45, 46, volume(ctx, 0, -50, 45, 46, body, .28, -.25), INK, 2.2);
      ctx.save(); const clip = new Path2D(); clip.ellipse(0, -50, 44, 45, 0, 0, TAU); ctx.clip();
      for (let i = -3; i <= 3; i++) {
        const x = i * 15, bow = i * 7;
        let d = `M ${x - 3} -98`;
        for (let k = 1; k <= 8; k++) d += ` L ${x + bow * Math.sin(k / 8 * Math.PI) + (k % 2 ? 4 : -4)} ${-98 + k * 12}`;
        path(ctx, d, null, '#1f5a31', 6);
      }
      ctx.restore();
      ellipse(ctx, -22, -70, 7, 14, 'rgba(255,255,255,.5)', null, 1, .5);
      ellipse(ctx, -12, -82, 2.5, 3, 'rgba(255,255,255,.55)', null);
      path(ctx, 'M 0 -88 Q 1 -100 9 -106', null, INK, 5.5);
      path(ctx, 'M 0 -88 Q 1 -100 9 -106', null, '#6e5a34', 3.2);
      leaf(ctx, 4, -100, .45, 1.05, '#72b04a');
    },
    mango(ctx, s, body, t) {
      // Dáng quả thận: thuôn dài, lưng phải phình, bụng trái hơi lõm, đáy nhọn lệch.
      path(ctx, 'M -4 -92 C 22 -94 38 -70 36 -44 C 34 -16 22 2 2 2 C -14 2 -24 -8 -24 -24 C -24 -38 -14 -44 -16 -60 C -18 -74 -20 -90 -4 -92 Z', volume(ctx, 6, -48, 32, 48, body), INK, 2.2);
      ellipse(ctx, 18, -70, 9, 12, 'rgba(232,96,60,.18)', null);
      ellipse(ctx, -6, -74, 4.5, 12, 'rgba(255,255,255,.45)', null, 1, .2);
      path(ctx, 'M 0 -86 Q -2 -96 4 -102', null, INK, 4.5);
      path(ctx, 'M 0 -86 Q -2 -96 4 -102', null, '#5e4827', 2.8);
      leaf(ctx, 4, -96, .4, .8, '#5fa838');
    },
    orange(ctx, s, body, t) {
      ellipse(ctx, 0, -48, 42, 42, volume(ctx, 0, -48, 42, 42, body), INK, 2.2);
      ellipse(ctx, -16, -66, 6, 12, 'rgba(255,255,255,.45)', null, 1, .4);
      ctx.save(); ctx.globalAlpha *= .25;
      for (let i = 0; i < 14; i++) {
        const px = Math.sin(i * 2.1) * 28, py = -48 + Math.cos(i * 1.7) * 28;
        ellipse(ctx, px, py, 1.2, 1.2, tone(body, -.3), null);
      }
      ctx.restore();
      let d = 'M 0 -90';
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i + .5) * TAU / 5, b = a + TAU / 10; d += ` L ${Math.cos(a) * 10} ${-90 + Math.sin(a) * 4} L ${Math.cos(b) * 4} ${-90 + Math.sin(b) * 2}`; }
      path(ctx, d + ' Z', '#4f9a3c', INK, 1.2);
      path(ctx, 'M 0 -90 L 0 -98', null, INK, 4.5); path(ctx, 'M 0 -90 L 0 -98', null, '#4f9a3c', 2.8);
      leaf(ctx, 4, -95, .42, 1.1, '#5ca63a');
    },
    lime(ctx, s, body, t) {
      ellipse(ctx, 0, -44, 30, 36, volume(ctx, 0, -44, 30, 36, body), INK, 2.2);
      ellipse(ctx, -10, -58, 4, 10, 'rgba(255,255,255,.45)', null, 1, .3);
      path(ctx, 'M -4 -8 Q 0 -2 4 -8 Z', volume(ctx, 0, -5, 6, 4, body), INK, 1.4);
      path(ctx, 'M -4 -80 Q 0 -86 4 -80 Z', volume(ctx, 0, -83, 6, 4, body), INK, 1.4);
      path(ctx, 'M 0 -84 L 1 -94', null, INK, 4); path(ctx, 'M 0 -84 L 1 -94', null, '#4a8e32', 2.2);
      leaf(ctx, 3, -90, .35, .9, '#5ca63a');
    },
    guava(ctx, s, body, t) {
      path(ctx, 'M 0 -84 C 26 -84 36 -62 38 -36 C 40 -12 24 2 0 2 C -24 2 -40 -12 -38 -36 C -36 -62 -26 -84 0 -84 Z', volume(ctx, 0, -42, 38, 44, body), INK, 2.2);
      ellipse(ctx, -14, -60, 5, 12, 'rgba(255,255,255,.4)', null, 1, .35);
      path(ctx, 'M -5 1 L -2 5 L 0 2 L 2 5 L 5 1 Z', '#3a2e1d', INK, 1);
      path(ctx, 'M 0 -84 L 0 -94', null, INK, 4.5); path(ctx, 'M 0 -84 L 0 -94', null, '#5e4a28', 2.8);
      leaf(ctx, 4, -90, .4, .85, '#68aa3e');
    },
    lychee(ctx, s, body, t) {
      ellipse(ctx, 0, -46, 32, 36, volume(ctx, 0, -46, 32, 36, body), INK, 2.2);
      ellipse(ctx, -12, -62, 4, 10, 'rgba(255,255,255,.45)', null, 1, .3);
      ctx.save(); ctx.globalAlpha *= .32;
      for (let i = 0; i < 22; i++) {
        const lx = Math.sin(i * 1.9) * 22, ly = -46 + Math.cos(i * 1.5) * 26;
        ellipse(ctx, lx, ly, 2.2, 2.2, tone(body, -.35), null);
      }
      ctx.restore();
      path(ctx, 'M 0 -82 Q 1 -94 6 -100', null, INK, 4.2); path(ctx, 'M 0 -82 Q 1 -94 6 -100', null, '#5e4828', 2.6);
      leaf(ctx, 4, -92, .38, .9, '#4a9234');
    },
    rambutan(ctx, s, body, t) {
      ellipse(ctx, 0, -46, 32, 34, volume(ctx, 0, -46, 32, 34, body), INK, 2);
      ellipse(ctx, -11, -60, 4, 9, 'rgba(255,255,255,.45)', null, 1, .3);
      for (let i = 0; i < 28; i++) {
        const a = i * TAU / 28, sway = Math.sin(t * 3.5 + i) * 2.5;
        const bx = Math.cos(a) * 31, by = -46 + Math.sin(a) * 33;
        const tx = Math.cos(a) * 42 + sway, ty = -46 + Math.sin(a) * 44;
        path(ctx, `M ${bx} ${by} Q ${bx * 1.1 + sway} ${by * 1.1} ${tx} ${ty}`, null, INK, 2.2);
        path(ctx, `M ${bx} ${by} Q ${bx * 1.1 + sway} ${by * 1.1} ${tx} ${ty}`, null, i % 2 ? '#d0302f' : '#8cbf5a', 1.4);
      }
      path(ctx, 'M 0 -80 Q -1 -92 4 -98', null, INK, 4.2); path(ctx, 'M 0 -80 Q -1 -92 4 -98', null, '#5e4828', 2.6);
    },
    mangosteen(ctx, s, body, t) {
      ellipse(ctx, 0, -46, 36, 36, volume(ctx, 0, -46, 36, 36, body), INK, 2.2);
      ellipse(ctx, -14, -62, 5, 11, 'rgba(255,255,255,.35)', null, 1, .35);
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * .65;
        const cx = Math.cos(a) * 20, cy = -80 + Math.sin(a) * 8;
        ellipse(ctx, cx, cy, 8, 5, volume(ctx, cx, cy, 8, 5, '#569238'), INK, 1.4, a);
      }
      path(ctx, 'M 0 -82 L 0 -96', null, INK, 5.2); path(ctx, 'M 0 -82 L 0 -96', null, '#584428', 3.2);
    },
    durian(ctx, s, body, t) {
      ellipse(ctx, 0, -52, 44, 52, volume(ctx, 0, -52, 44, 52, body), INK, 2.2);
      for (let i = 0; i < 28; i++) {
        const a = i * TAU / 28, tx = Math.cos(a) * 44, ty = -52 + Math.sin(a) * 52;
        const ox = Math.cos(a) * 50, oy = -52 + Math.sin(a) * 58;
        path(ctx, `M ${tx - 4} ${ty} L ${ox} ${oy} L ${tx + 4} ${ty} Z`, volume(ctx, ox, oy, 8, 8, tone(body, -.1)), INK, 1.2);
      }
      ctx.save(); ctx.globalAlpha *= .45;
      for (let i = 0; i < 24; i++) {
        const dx = Math.sin(i * 2.3) * 32, dy = -52 + Math.cos(i * 1.9) * 38;
        path(ctx, `M ${dx - 3} ${dy + 2} L ${dx} ${dy - 4} L ${dx + 3} ${dy + 2} Z`, tone(body, -.3), null);
      }
      ctx.restore();
      path(ctx, 'M 0 -104 L 0 -118', null, INK, 6.5); path(ctx, 'M 0 -104 L 0 -118', null, '#5a4626', 4.2);
    },
    coconut(ctx, s, body, t) {
      // Dừa xiêm: gần tròn, vai hơi vuông, núm cuống nâu ở đỉnh; chín hẳn thì thành trái nâu có xơ và 3 mắt.
      const shape = 'M 0 -98 C 26 -98 42 -80 42 -54 C 42 -24 24 -2 0 -2 C -24 -2 -42 -24 -42 -54 C -42 -80 -26 -98 0 -98 Z';
      path(ctx, shape, volume(ctx, 0, -52, 42, 48, body), INK, 2.2);
      ctx.save(); ctx.clip(new Path2D(shape));
      ctx.globalAlpha *= .28;
      for (const x of [-22, 0, 22]) path(ctx, `M ${x * .5} -96 Q ${x * 1.35} -52 ${x * .55} -4`, null, tone(body, -.4), 2.4);
      ctx.globalAlpha /= .28;
      const brown = clamp((s.growth - .8) / .2);
      if (brown > 0) {
        ctx.globalAlpha *= .5 * brown;
        for (let i = 0; i < 16; i++) {
          const x = -36 + i * 4.8, y = -70 + (i * 23 % 40);
          path(ctx, `M ${x} ${y} q 3 8 1 16`, null, '#4a2e18', 1.1);
        }
      }
      ctx.restore();
      ellipse(ctx, -18, -72, 6, 14, 'rgba(255,255,255,.38)', null, 1, .35);
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * .55;
        ellipse(ctx, Math.cos(a) * 9, -94 + Math.sin(a) * 4 + 4, 7, 4.5, volume(ctx, Math.cos(a) * 9, -92, 7, 4.5, '#b88a4c'), INK, 1.2, a + Math.PI / 2);
      }
      ellipse(ctx, 0, -97, 6, 4, '#9a6e38', INK, 1.2);
      if (s.growth > .8) for (const [px, py] of [[-6, -86], [6, -86], [0, -80]]) ellipse(ctx, px, py, 2.2, 2.2, '#281a10', null);
      path(ctx, 'M 0 -100 L 0 -108', null, INK, 5); path(ctx, 'M 0 -100 L 0 -108', null, '#6e5230', 3);
    },
    avocado(ctx, s, body, t) {
      path(ctx, 'M 0 -84 C 18 -84 22 -66 32 -48 C 42 -30 38 0 0 0 C -38 0 -42 -30 -32 -48 C -22 -66 -18 -84 0 -84 Z', volume(ctx, 0, -42, 38, 44, body), INK, 2.2);
      ellipse(ctx, -12, -64, 4, 12, 'rgba(255,255,255,.3)', null, 1, .3);
      ctx.save(); ctx.globalAlpha *= .25;
      for (let i = 0; i < 20; i++) {
        const ax = Math.sin(i * 1.8) * 24, ay = -42 + Math.cos(i * 1.4) * 32;
        ellipse(ctx, ax, ay, 1.8, 1.8, '#182410', null);
      }
      ctx.restore();
      path(ctx, 'M 0 -84 L 0 -94', null, INK, 4.5); path(ctx, 'M 0 -84 L 0 -94', null, '#3c2c1a', 2.8);
    },
    strawberry(ctx, s, body, t) {
      // Dâu: nón rộng vai, nhọn đáy, hạt vàng xếp hàng so le, đài lá xoè phủ vai.
      const shape = 'M 0 -2 C -10 -2 -30 -24 -36 -50 C -40 -72 -24 -84 -10 -84 C -5 -84 -2 -82 0 -80 C 2 -82 5 -84 10 -84 C 24 -84 40 -72 36 -50 C 30 -24 10 -2 0 -2 Z';
      path(ctx, shape, volume(ctx, -2, -52, 38, 44, body, .3, -.25), INK, 2.2);
      ctx.save(); ctx.clip(new Path2D(shape));
      for (let row = 0; row < 7; row++) for (let k = -4; k <= 4; k++) {
        const y = -72 + row * 10, x = k * 10 + (row % 2) * 5;
        if (Math.abs(x) > 34 - row * 3.2) continue;
        ellipse(ctx, x, y + 1.2, 2.4, 3.2, tone(body, -.28), null);
        ellipse(ctx, x, y, 1.3, 2.1, '#ffe58a', '#9a6a1c', .6);
      }
      ctx.restore();
      ellipse(ctx, -18, -62, 5, 11, 'rgba(255,255,255,.45)', null, 1, .45);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + (i + .5) * Math.PI / 6, tipX = Math.cos(a) * 26, tipY = -80 - Math.sin(-a) * 6 + (i === 0 || i === 5 ? 10 : 4);
        path(ctx, `M ${Math.cos(a) * 4} -82 Q ${tipX * .55} ${-92 + Math.abs(tipX) * .1} ${tipX} ${tipY} Q ${tipX * .5} -80 ${Math.cos(a) * 3} -79 Z`, volume(ctx, tipX * .5, -84, 12, 6, '#4f9a3c'), INK, 1.2);
      }
      path(ctx, 'M 0 -84 Q 1 -96 7 -101', null, INK, 4.6); path(ctx, 'M 0 -84 Q 1 -96 7 -101', null, '#5aa844', 2.8);
    },
    pineapple(ctx, s, body, t) {
      ellipse(ctx, 0, -46, 34, 46, volume(ctx, 0, -46, 34, 46, body), INK, 2.2);
      ctx.save();
      const clip = new Path2D(); clip.ellipse(0, -46, 33, 45, 0, 0, TAU); ctx.clip();
      for (let i = -5; i <= 5; i++) {
        line(ctx, [[-40 + i * 16, -96], [40 + i * 16, 4]], tone(body, -.3), 1.5);
        line(ctx, [[40 + i * 16, -96], [-40 + i * 16, 4]], tone(body, -.3), 1.5);
      }
      for (let row = -3; row <= 3; row++) {
        for (let col = -2; col <= 2; col++) {
          ellipse(ctx, col * 14 + (row % 2 ? 7 : 0), -46 + row * 11, 2, 2.5, '#6a8430', null);
        }
      }
      ctx.restore();
      for (let i = -3; i <= 3; i++) {
        const lx = i * 8, ly = -90 - (4 - Math.abs(i)) * 4;
        path(ctx, `M ${lx * .4} -90 Q ${lx * .7} -96 ${lx * 1.3} ${ly}`, null, INK, 3.8);
        path(ctx, `M ${lx * .4} -90 Q ${lx * .7} -96 ${lx * 1.3} ${ly}`, null, '#4a9034', 2.2);
      }
    },
    grape(ctx, s, body, t) {
      const grapeCoords = [
        [-18, -76], [-6, -78], [6, -78], [18, -76],
        [-22, -64], [-9, -65], [3, -64], [16, -65],
        [-14, -52], [-2, -53], [12, -52],
        [-8, -40], [4, -40],
        [-2, -28]
      ];
      for (const [gx, gy] of grapeCoords) line(ctx, [[0, -84], [gx, gy]], '#5a4628', 1.4);
      for (const [gx, gy] of grapeCoords) {
        ellipse(ctx, gx, gy, 8, 8, volume(ctx, gx, gy, 8, 8, body), INK, 1.4);
        ellipse(ctx, gx - 2, gy - 2, 2, 3, 'rgba(255,255,255,.45)', null, 1, .3);
      }
      path(ctx, 'M 0 -84 Q 1 -94 8 -100', null, INK, 4.5); path(ctx, 'M 0 -84 Q 1 -94 8 -100', null, '#5e4828', 2.8);
      leaf(ctx, 6, -92, .45, .8, '#4a9234');
      path(ctx, 'M 2 -90 Q -8 -94 -4 -102 Q 2 -106 -2 -112', null, '#4a9234', 1.4);
    },
    dragon_fruit(ctx, s, body, t) {
      ellipse(ctx, 0, -50, 36, 48, volume(ctx, 0, -50, 36, 48, body), INK, 2.2);
      ellipse(ctx, -14, -68, 5, 12, 'rgba(255,255,255,.4)', null, 1, .3);
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12, sx = Math.cos(a) * 34, sy = -50 + Math.sin(a) * 44;
        const tx = Math.cos(a) * 44, ty = -50 + Math.sin(a) * 48 - 6;
        path(ctx, `M ${sx - 3} ${sy} Q ${tx} ${ty} ${sx + 3} ${sy} Z`, volume(ctx, tx, ty, 6, 6, '#86bf40'), INK, 1.2);
      }
      path(ctx, 'M 0 -96 L 0 -106', null, INK, 4.5); path(ctx, 'M 0 -96 L 0 -106', null, '#6fa034', 2.6);
    },
    starfruit(ctx, s, body, t) {
      path(ctx, 'M 0 -86 C 14 -86 30 -62 30 -38 C 30 -14 16 0 0 0 C -16 0 -30 -14 -30 -38 C -30 -62 -14 -86 0 -86 Z', volume(ctx, 0, -42, 30, 44, body), INK, 2.2);
      path(ctx, 'M 0 -86 Q 4 -42 0 0', null, INK, 2); path(ctx, 'M 0 -86 Q 4 -42 0 0', null, tone(body, .25), 1.2);
      path(ctx, 'M -18 -76 Q -22 -42 -14 -8', null, tone(body, -.3), 2.2);
      path(ctx, 'M 18 -76 Q 22 -42 14 -8', null, tone(body, -.3), 2.2);
      ellipse(ctx, -8, -58, 3.5, 12, 'rgba(255,255,255,.45)', null, 1, .25);
      path(ctx, 'M 0 -86 L 0 -96', null, INK, 4.2); path(ctx, 'M 0 -86 L 0 -96', null, '#5e4828', 2.6);
      leaf(ctx, 3, -92, .35, .8, '#6ea838');
    },
    jackfruit(ctx, s, body, t) {
      // Mít: thuôn dài, viền hơi gồ ghề, gai nhỏ phủ kín vỏ, cuống gỗ to.
      let shape = '';
      for (let i = 0; i <= 48; i++) {
        const a = i / 48 * TAU, r = 1 + .025 * Math.sin(a * 7) + .015 * Math.sin(a * 11);
        const x = Math.cos(a) * 40 * r, y = -56 + Math.sin(a) * 56 * r - (Math.sin(a) < 0 ? 0 : Math.sin(a) * 2);
        shape += `${i ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)} `;
      }
      shape += 'Z';
      path(ctx, shape, volume(ctx, 0, -56, 40, 56, body, .28, -.22), INK, 2.2);
      ctx.save(); ctx.clip(new Path2D(shape));
      const dark = tone(body, -.34), light = tone(body, .35);
      for (let row = 0; row < 13; row++) for (let k = -5; k <= 5; k++) {
        const y = -106 + row * 8.6, x = k * 8 + (row % 2) * 4;
        const u = x / 40, v = (y + 56) / 56;
        if (u * u + v * v > 1.02) continue;
        path(ctx, `M ${x - 3} ${y + 2} L ${x} ${y - 2.6} L ${x + 3} ${y + 2}`, null, dark, 1.2);
        ellipse(ctx, x - .6, y - .8, .9, .9, light, null);
      }
      ctx.restore();
      ellipse(ctx, -16, -80, 6, 15, 'rgba(255,255,255,.3)', null, 1, .3);
      path(ctx, 'M -5 -110 Q -6 -122 -2 -128 L 5 -128 Q 6 -120 5 -110 Z', cylinder(ctx, -6, 6, '#6b4e2a'), INK, 1.6);
      ellipse(ctx, 0, -110, 9, 3.5, '#5e4a26', INK, 1.2);
    },
    banana_fruit(ctx, s, body, t) {
      path(ctx, 'M -20 -82 C 10 -76 34 -48 30 -14 C 26 2 12 4 4 -6 C 8 -36 -10 -64 -24 -76 Z', volume(ctx, 5, -40, 26, 42, body), INK, 2.2);
      path(ctx, 'M -20 -80 C 6 -72 26 -44 22 -14', null, tone(body, -.25), 1.8);
      ellipse(ctx, 8, -48, 3, 14, 'rgba(255,255,255,.45)', null, 1, -.3);
      path(ctx, 'M -20 -82 L -25 -92', null, INK, 5.2); path(ctx, 'M -20 -82 L -25 -92', null, '#3a2814', 3.4);
      ellipse(ctx, 4, -4, 3, 3, '#3a2814', null);
    },
  };
  FRUIT_BODIES.eggplant = FRUIT_BODIES.pumpkin;
  FRUIT_BODIES.corn = FRUIT_BODIES.pumpkin;
  // Hạt/ruột riêng hiện ra khi trái cây bị bổ đôi (side = -1 nửa trái, 1 nửa phải).
  const FRUIT_SEEDS = {
    watermelon(ctx, s, side, flesh) {
      for (let i = 0; i < 7; i++) ellipse(ctx, side * 5 + Math.sin(i * 2) * 11, (i - 3) * 8, 1.5, 2.6, '#3b2b1f', null, 1, side * .3);
    },
    orange(ctx, s, side, flesh) {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i + .5) * TAU / 6;
        line(ctx, [[side * 5, 0], [side * 5 + Math.cos(a) * 16, Math.sin(a) * 26]], '#ffffff', 1.2);
      }
    },
    avocado(ctx, s, side, flesh) {
      if (side === 1) ellipse(ctx, 5, 4, 11, 14, '#5b3a1a', INK, 1.2);
      else ellipse(ctx, -5, 4, 10, 13, tone(flesh, -.25), null);
    },
    dragon_fruit(ctx, s, side, flesh) {
      for (let i = 0; i < 18; i++) ellipse(ctx, side * 5 + Math.sin(i * 2.3) * 12, (i - 9) * 3.4, 1, 1, '#1b1b1b', null);
    },
    durian(ctx, s, side, flesh) {
      for (let i = -1; i <= 1; i++) ellipse(ctx, side * 5, i * 14, 8, 6, '#f8d050', INK, 1);
    },
    coconut(ctx, s, side, flesh) {
      ellipse(ctx, side * 5, 0, 14, 24, '#7aa8c8', INK, 1);
    },
    mango(ctx, s, side, flesh) {
      ellipse(ctx, side * 5, 0, 8, 18, '#ecd27a', tone('#ecd27a', -.3), 1);
    },
    apple(ctx, s, side, flesh) {
      for (let i = 0; i < 5; i++) ellipse(ctx, side * 5 + Math.sin(i * 2) * 8, (i - 2) * 8, 1.3, 2.2, '#483424', null);
    },
    lychee(ctx, s, side, flesh) {
      if (side === 1) ellipse(ctx, 5, 0, 8, 12, '#4a2c16', INK, 1);
    },
  };
  FRUIT_SEEDS.lime = FRUIT_SEEDS.orange;
  FRUIT_SEEDS.jackfruit = FRUIT_SEEDS.durian;
  FRUIT_SEEDS.guava = FRUIT_SEEDS.apple;
  FRUIT_SEEDS.strawberry = FRUIT_SEEDS.apple;
  FRUIT_SEEDS.rambutan = FRUIT_SEEDS.lychee;
  const FRUIT_LIMBS = {
    pepper: { hip: 8, hipY: -8, arm: 25, armY: -55 },
    eggplant: { hip: 10, hipY: -6, arm: 29, armY: -40 },
    corn: { hip: 9, hipY: -8, arm: 27, armY: -48 },
    pumpkin: { hip: 18, hipY: -8, arm: 50, armY: -40 },
    banana_fruit: { hip: 6, hipY: -14, hipX: 16, arm: 12, armX: 16, armY: -44 },
    pineapple: { hip: 14, hipY: -8, arm: 36, armY: -42 },
    durian: { hip: 16, hipY: -8, arm: 44, armY: -48 },
    jackfruit: { hip: 16, hipY: -8, arm: 38, armY: -56 },
    grape: { hip: 6, hipY: -34, hipX: -2, arm: 22, armY: -62 },
    lime: { hip: 10, hipY: -6, arm: 28, armY: -44 },
    lychee: { hip: 10, hipY: -6, arm: 28, armY: -46 },
    strawberry: { hip: 9, hipY: -8, arm: 32, armY: -56 },
    avocado: { hip: 12, hipY: -6, arm: 34, armY: -44 },
    mango: { hip: 10, hipY: -6, hipX: 4, arm: 26, armX: 6, armY: -46 },
    orange: { hip: 14, hipY: -8, arm: 40, armY: -48 },
    coconut: { hip: 14, hipY: -8, arm: 40, armY: -52 },
    dragon_fruit: { hip: 13, hipY: -8, arm: 36, armY: -50 },
    starfruit: { hip: 12, hipY: -6, arm: 32, armY: -48 },
    guava: { hip: 12, hipY: -6, arm: 34, armY: -48 },
    mangosteen: { hip: 12, hipY: -6, arm: 34, armY: -46 },
    rambutan: { hip: 12, hipY: -6, arm: 30, armY: -46 },
  };
  function drawFruitBody(ctx, s, body, t) {
    const own = FRUIT_BODIES[s.asset];
    if (own) { own(ctx, s, body, t); return; }
    ellipse(ctx, 0, -50, 45, 46, volume(ctx, 0, -50, 45, 46, body, .28, -.25), INK, 2.2);
    ellipse(ctx, -22, -70, 7, 14, 'rgba(255,255,255,.5)', null, 1, .5);
    ellipse(ctx, -12, -82, 2.5, 3, 'rgba(255,255,255,.55)', null);
    path(ctx, 'M 0 -88 Q 1 -100 9 -106', null, INK, 5.5);
    path(ctx, 'M 0 -88 Q 1 -100 9 -106', null, '#6e5a34', 3.2);
    leaf(ctx, 4, -100, .45, 1.05, '#72b04a');
  }
  function drawFruit(ctx, s, t) {
    const pose = celId(s), squashPose = pose.includes('squash') || pose.includes('land') ? .84 : pose.includes('jump') ? 1.12 : 1;
    // Co giãn theo vận tốc dọc: rơi/nhảy thì dài ra, không đổi điểm neo đáy.
    const stretch = s.held_by ? 1 : 1 + clamp(Math.abs(s.vy || 0) / (Math.max(60, s.height) * 3), 0, .1);
    const squash = squashPose * stretch * (1 - (s.walk || 0) * Math.abs(Math.cos(s.stride || 0)) * .04);
    const limbs = s.faceEnabled && !s.attached && s.slice <= .01;
    const [, hy] = headOffset(s, t);
    // Chín: xanh → vàng cam → đỏ, đi qua màu tươi thay vì trộn thẳng ra nâu.
    const ripen = stops => { const g = clamp(s.growth) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(g)), u = g - i; return `rgb(${stops[i].map((v, k) => Math.round(mix(v, stops[i + 1][k], u))).join(',')})`; };
    const body = s.style.body || (s.asset === 'watermelon' ? '#4b9e49' : FRUIT_COLORS[s.asset] ? ripen(FRUIT_COLORS[s.asset]) : '#e0402f');
    const spec = FRUIT_LIMBS[s.asset] || { hip: 14, hipY: -9, arm: 42, armY: -46 };
    // Rig của gói tự tính màu thân nên phải tự khai màu tay chân (limbColor), không thì rơi về đỏ mặc định.
    const limbColor = s.style.accent || spec.limbColor || (s.asset === 'watermelon' ? '#3f8a3c' : ['pepper', 'eggplant', 'corn', 'pumpkin'].includes(s.asset) ? '#4f8a3a' : tone(body, -.3));
    if (limbs) fruitLimbs(ctx, s, t, limbColor, 'legs', spec);
    ctx.save(); ctx.translate(0, (1 - squash) * -44 + hy); ctx.scale(1 / Math.sqrt(squash), squash);
    if (limbs && s.walk > 0) ctx.rotate(Math.sin(s.stride) * s.walk * .05);
    if (s.slice > .01 && s.asset !== 'pepper') {
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(side * s.slice * 22, -48); ctx.rotate(side * s.slice * .38);
        ellipse(ctx, 0, 0, 27, 43, volume(ctx, 0, 0, 27, 43, s.asset === 'watermelon' ? '#3f8e40' : body), INK, 2);
        const flesh = {
          watermelon: '#f25c62', tomato: '#ef6a55', pumpkin: '#f6a33c', corn: '#f7d764',
          mango: '#f7b84a', orange: '#f08a2a', lime: '#b8e070', guava: '#f0c8c0',
          lychee: '#f5f8f8', rambutan: '#f5f8f8', mangosteen: '#ffffff', durian: '#f2d878',
          coconut: '#fafaf8', avocado: '#c8d860', strawberry: '#f8a0a8', pineapple: '#f8d04a',
          dragon_fruit: '#f0f0f4', starfruit: '#e8e040', jackfruit: '#f4c840', banana_fruit: '#f7f0d0'
        }[s.asset] || '#f7e9ba';
        ellipse(ctx, side * 4, 0, 23, 38.5, s.asset === 'watermelon' ? '#e9f5cf' : tone(flesh, .3), null);
        ellipse(ctx, side * 5, 0, 20, 35, volume(ctx, side * 5, 0, 20, 35, flesh, .25, -.15), tone(flesh, -.35), 1);
        const seeds = FRUIT_SEEDS[s.asset];
        if (seeds) seeds(ctx, s, side, flesh);
        ctx.restore();
      }
    } else {
      drawFruitBody(ctx, s, body, t);
    }
    for (let i = 0; i < Math.ceil(s.damage * 10); i++) ellipse(ctx, Math.sin(i * 2.3) * 22, -72 + (i * 17 % 58), 3 + i % 3, 4, '#7d6b3e', tone('#7d6b3e', -.3), .8);
    if (s.cut > 0) { line(ctx, [[-15, -65], [-14, -65 + s.cut * 27]], '#b7303a', 3.4); line(ctx, [[-15, -65], [-14, -65 + s.cut * 27]], '#ffd6a0', 1.4); }
    celHatch(ctx, s, [-38, -92, 76, 82], '#824534', 8);
    ctx.restore();
    if (limbs) fruitLimbs(ctx, s, t, limbColor, 'arms', spec);
  }
  function roots(ctx, s) {
    if (!s.roots) return;
    ctx.save(); ctx.globalAlpha *= s.roots;
    for (let i = -3; i <= 3; i++) {
      const x = i * 9, len = 22 + (3 - Math.abs(i)) * 7;
      path(ctx, `M 0 0 Q ${x} 10 ${x} ${len} l ${i % 2 ? -4 : 4} 8`, null, '#e3d9a9', 1.1);
      if (s.asset === 'peanut_plant') for (let k = 0; k < Math.ceil(s.growth * 3); k++) {
        ellipse(ctx, x + (k % 2 ? 3 : -3), 13 + k * 10, 3.5, 6, '#ddc383', '#877e4d', .7, .3);
      }
    }
    ctx.restore();
  }
  function drawPlant(ctx, s, t) {
    roots(ctx, s);
    if (FARM_PLANTS[s.asset]) {
      FARM_PLANTS[s.asset](ctx, s, t);
      if (s.nutrients) for (let i = 0; i < 7; i++) ellipse(ctx, (i - 3) * 6, 3 + (i % 2) * 4, 2, 2.6, '#efd9a0', '#9d8350', .6);
      celHatch(ctx, s, [-37, -100, 74, 99], '#41683a', 9); return;
    }
    const color = s.style.leaf || '#69ac47';
    if (s.asset === 'papaya_tree') {
      path(ctx, 'M -6 0 Q -4 -40 -3 -73 L 4 -73 Q 5 -40 7 0 Z', cylinder(ctx, -6, 7, '#a07a4a'), INK, 1.6);
      for (let i = 0; i < 8; i++) path(ctx, `M -4 ${-5 - i * 8.5} Q 1 ${-9 - i * 8.5} 5 ${-5 - i * 8.5}`, null, '#6b5231', 1.3);
      for (let i = 0; i < 7; i++) {
        const geometry = branchGeometry(s, i), [x, y] = geometry.tip;
        path(ctx, `M 0 -65 Q ${x * .5} ${y - 9} ${x} ${y}`, null, INK, 3.6);
        path(ctx, `M 0 -65 Q ${x * .5} ${y - 9} ${x} ${y}`, null, '#6aa84f', 2);
        leaf(ctx, x, y, .4 + s.growth * .25, i * Math.PI / 6 - Math.PI / 2 + geometry.angle * Math.PI / 180, color, true);
      }
      for (let i = 0; i < 1 + Math.floor(s.growth * 4); i++) {
        const fx = (i % 2 ? 1 : -1) * (6 + i), fy = -58 + i * 7, rx = 4 + s.growth * 3, ry = 8 + s.growth * 5;
        ellipse(ctx, fx, fy, rx, ry, volume(ctx, fx, fy, rx, ry, s.growth > .75 ? '#e0a33a' : '#76b03a'), INK, 1.2);
      }
      if (s.cut > 0) line(ctx, [[-10, -44], [-10, -44 + s.cut * 14]], '#ffffdf', 1.3);
      celHatch(ctx, s, [-42, -105, 84, 105], '#486d35', 10);
      return;
    }
    const top = plantPoint(s, 0, -97);
    path(ctx, `M 0 0 Q -7 ${top[1] * .4} ${top[0]} ${top[1]}`, null, INK, 5.2);
    path(ctx, `M 0 0 Q -7 ${top[1] * .4} ${top[0]} ${top[1]}`, null, '#4a9148', 3.2);
    const branches = s.asset === 'peanut_plant' ? 10 : 7;
    for (let i = 0; i < branches; i++) {
      const side = i % 2 ? 1 : -1, geometry = branchGeometry(s, i);
      const [x, y] = geometry.tip, [bx, by] = geometry.base;
      path(ctx, `M ${bx} ${by} Q ${x * .7} ${by} ${x} ${y}`, null, INK, 3.2);
      path(ctx, `M ${bx} ${by} Q ${x * .7} ${by} ${x} ${y}`, null, '#56a04f', 1.7);
      leaf(ctx, x, y, .45 + s.growth * .1, side * .8 + geometry.angle * Math.PI / 180, color, s.asset === 'tomato_plant');
      if (s.asset === 'peanut_plant') leaf(ctx, x, y, .42, -side * .4 + geometry.angle * Math.PI / 180, '#8cbe61');
      if (s.asset === 'tomato_plant' && i < 1 + Math.floor(s.growth * 6)) {
        const [fx, fy] = geometry.fruit;
        const rx = 4 + s.growth * 2, ry = 5 + s.growth * 2;
        ellipse(ctx, fx, fy, rx, ry, volume(ctx, fx, fy, rx, ry, s.growth > .5 ? '#dc4a3a' : '#b3b448'), INK, 1);
        line(ctx, [[fx - 3, fy - ry + 1], [fx, fy - ry - 1], [fx + 3, fy - ry + 1]], '#3f8a3c', 1.4);
      }
    }
    if (s.nutrients) for (let i = 0; i < 5; i++) ellipse(ctx, (i - 2) * 5, 5 + (i % 2) * 4, 1.8, 2.3, '#e6ce86', null);
    celHatch(ctx, s, [-37, -100, 74, 99], '#41683a', 9);
  }
  function drawHand(ctx, s) {
    const skin = s.style.skin || '#f1d3aa', sleeve = s.style.shirt || '#3986b5', skel = handSkeleton(s);
    const back = [skel.wrist[0] - skel.base[0], skel.wrist[1] - skel.base[1]], len = Math.hypot(...back) || 1;
    const cuff = [skel.wrist[0] + back[0] / len * 20, skel.wrist[1] + back[1] / len * 20];
    const palmAngle = (-.15 + (s.wrist || 0) * Math.PI / 180) * (s.asset === 'hand_right' ? -1 : 1);
    // Một lượt mực cho cả bàn tay rồi một lượt da: ngón và lòng bàn tay liền khối.
    line(ctx, [skel.wrist, skel.base, skel.palm], INK, 27);
    ellipse(ctx, skel.palm[0], skel.palm[1], 20.5, 24.5, INK, null, 1, palmAngle);
    for (const finger of skel.fingers) line(ctx, finger, INK, 11.2);
    line(ctx, [skel.wrist, skel.base, skel.palm], skin, 24);
    ellipse(ctx, skel.palm[0], skel.palm[1], 19, 23, volume(ctx, skel.palm[0], skel.palm[1], 19, 23, skin, .22, -.12), null, 1, palmAngle);
    for (const finger of skel.fingers) line(ctx, finger, skin, 8.4);
    for (const finger of skel.fingers) {
      const [, mid, tip] = finger, a = Math.atan2(tip[1] - mid[1], tip[0] - mid[0]);
      ellipse(ctx, tip[0] - Math.cos(a) * 1.6, tip[1] - Math.sin(a) * 1.6, 2.6, 2, tone(skin, .45), tone(skin, -.3), .6, a);
      line(ctx, [[mid[0] - Math.sin(a) * 2, mid[1] + Math.cos(a) * 2], [mid[0] + Math.sin(a) * 2, mid[1] - Math.cos(a) * 2]], tone(skin, -.25), .8);
    }
    line(ctx, [[-16, -54], [-2, -48], [9, -42]].map(p => handPoint(s, p)), tone(skin, -.28), 1.2);
    limb(ctx, [cuff, skel.wrist], sleeve, 21);
    line(ctx, [[skel.wrist[0] - back[1] / len * 10, skel.wrist[1] + back[0] / len * 10], [skel.wrist[0] + back[1] / len * 10, skel.wrist[1] - back[0] / len * 10]], tone(sleeve, .35), 2);
  }
  function drawFoot(ctx, s) {
    const skin = s.style.skin || '#f1d3aa';
    path(ctx, 'M 12 -100 L 46 -100 L 40 -36 Q 48 -16 34 -6 L -31 -4 Q -57 -6 -51 -21 Q -48 -31 -27 -30 L 8 -34 Z', volume(ctx, 0, -40, 50, 60, skin, .22, -.2), INK, 2);
    for (let i = 0; i < 4; i++) {
      const x = -45 + i * 7, y = -18 - i * .8;
      ellipse(ctx, x, y, 3.6, 4.6, skin, tone(skin, -.4), .8);
      ellipse(ctx, x - .6, y - 1.4, 1.8, 1.5, tone(skin, .5), null);
    }
    path(ctx, 'M 22 -40 Q 30 -28 38 -22', null, tone(skin, -.3), 1.2);
    path(ctx, 'M 8 -101 L 50 -101 L 46 -82 Q 28 -78 9 -83 Z', cylinder(ctx, 8, 50, s.style.shirt || '#34506b'), INK, 2);
  }
  function drawPerson(ctx, s, t) {
    const fisher = s.asset === 'fisherman', woman = s.asset === 'farmer_woman', hatted = fisher || woman, skin = s.style.skin || '#f1d3aa';
    const shirt = s.style.shirt || (fisher ? '#3f8a8c' : woman ? '#b8546e' : '#3986b5'), pants = s.style.accent || (fisher ? '#3d4a57' : woman ? '#27262e' : '#2e3a36');
    const skel = farmerSkeleton(s), pose = celId(s), walk = s.walk || 0, stride = s.stride || 0;
    const lean = pose.includes('pull') || pose.includes('reach') ? -4 : pose.includes('recoil') ? 4 : 0;
    const [hx, hy] = headOffset(s, t), bob = walk * -Math.abs(Math.sin(stride)) * 2.2;
    // Chân: bước theo quãng đường, gót nhấc ở pha sau.
    for (const side of [-1, 1]) {
      const phase = stride + (side > 0 ? Math.PI : 0), swing = Math.sin(phase) * walk * 7, lift = Math.max(0, -Math.cos(phase)) * walk * 4;
      const hip = [side * 8, -28 + bob], foot = [side * 10 + swing, -4 - lift];
      if (woman) { limb(ctx, [hip, foot], pants, 8.6); line(ctx, [[foot[0] - 3.5, foot[1] - 4], [foot[0] + 3.5, foot[1] - 4]], tone(pants, -.4), 1.2); }
      else limb(ctx, [hip, foot], skin, 6.4);
      ellipse(ctx, foot[0] + side * 3, foot[1] + .6, 9.5, 4.6, volume(ctx, foot[0] + side * 3, foot[1], 9.5, 4.6, '#35302c'), INK, 1.4);
    }
    ctx.save(); ctx.translate(lean * .6, bob);
    if (!woman) path(ctx, 'M -18 -40 L 18 -40 L 19 -21 Q 12 -19 4 -21 L 0 -29 L -4 -21 Q -12 -19 -19 -21 Z', cylinder(ctx, -19, 19, pants), INK, 1.8);
    path(ctx, 'M -5 -69 L -4 -75 L 6 -75 L 7 -69 Z', tone(skin, -.12), INK, 1.4);
    if (woman) {
      // Áo bà ba: dài qua hông, xẻ tà hai bên, hàng nút giữa.
      path(ctx, 'M -14 -68 Q -21 -64 -20 -52 L -21 -27 L -9 -25 L -6 -30 L 8 -30 L 11 -25 L 22 -27 L 20 -52 Q 21 -64 15 -68 Q 0 -72 -14 -68 Z', volume(ctx, -2, -52, 22, 24, shirt, .25, -.3), INK, 1.8);
      path(ctx, 'M -7 -70 Q 1 -63 9 -70', null, tone(shirt, -.35), 1.3);
      for (const y of [-60, -52, -44, -36]) ellipse(ctx, 1, y, 1.2, 1.2, '#f6ecd9', tone(shirt, -.4), .5);
    } else path(ctx, 'M -14 -68 Q -21 -64 -20 -52 L -19 -38 Q 0 -33 19 -38 L 20 -52 Q 21 -64 15 -68 Q 0 -72 -14 -68 Z', volume(ctx, -2, -56, 22, 20, shirt, .25, -.3), INK, 1.8);
    if (woman) {
    } else if (fisher) {
      path(ctx, 'M -8 -69 L 1 -58 L 9 -69 Q 1 -66 -8 -69 Z', tone(skin, -.05), INK, 1.2);
      path(ctx, 'M 6 -54 L 15 -54 L 15 -45 L 6 -45 Z', tone(shirt, -.15), INK, 1.1);
    } else {
      path(ctx, 'M -9 -70 L 1 -60 L 10 -70 L 6 -72 L 1 -65 L -5 -72 Z', '#fbf8ec', INK, 1.2);
      line(ctx, [[1, -60], [1, -38]], tone(shirt, -.35), 1.2);
      for (const y of [-55, -47]) ellipse(ctx, 3, y, 1.1, 1.1, '#f3efdf', null);
    }
    if (!woman) line(ctx, [[-19, -38.5], [19, -38.5]], tone(pants, -.3), 2);
    ctx.restore();
    // Đầu cùng độ lệch với face() để mắt/miệng không trôi khỏi mặt.
    ctx.save(); ctx.translate(hx, hy);
    if (woman) {
      const hair = volume(ctx, 1, -80, 24, 20, '#2a201b', .15, -.2);
      path(ctx, 'M -21 -92 Q -26 -70 -20 -58 Q -8 -54 1 -56 Q 12 -54 22 -58 Q 28 -70 23 -92 Z', hair, INK, 1.6);
      // Bím tóc vắt qua vai trái.
      for (let i = 0; i < 4; i++) ellipse(ctx, -19 - i * .6, -58 + i * 6, 4.2 - i * .4, 3.8, hair, INK, 1.1);
      ellipse(ctx, -21.5, -34, 2.6, 2, '#d9534f', INK, .8);
    }
    for (const side of [-1, 1]) ellipse(ctx, 1 + side * 19, -84, 4.2, 5.6, tone(skin, -.06), INK, 1.4);
    ellipse(ctx, 1, -86, 19, 20.5, volume(ctx, 1, -86, 19, 20.5, skin, .25, -.18), INK, 1.9);
    path(ctx, 'M 1.5 -80.5 Q 4.5 -78 1.5 -76', null, tone(skin, -.38), 1.3);
    const defaultHat = (fisher || woman) ? 'conical' : 'none';
    const hatType = (s.style && s.style.hat !== undefined) ? s.style.hat : (s.hat !== undefined ? s.hat : defaultHat);
    if (hatType === 'conical') {
      path(ctx, woman ? 'M -18 -86 Q -14 -102 1 -102 Q 16 -102 20 -86 Q 12 -95 6 -91 Q -2 -97 -8 -90 Q -13 -92 -18 -86 Z' : 'M -17 -90 Q -12 -102 1 -102 Q 14 -102 19 -90 Q 8 -95 1 -94 Q -8 -95 -17 -90 Z', '#2a211c', null);
      ctx.save(); ctx.globalAlpha *= .25; ellipse(ctx, 1, -95, 20, 5, '#2a211c', null); ctx.restore();
      const hat = 'M -40 -94 Q -18 -108 1 -127 Q 20 -108 42 -94 Q 1 -86 -40 -94 Z';
      path(ctx, hat, cylinder(ctx, -40, 42, '#e8cc80'), INK, 2);
      ctx.save(); ctx.clip(new Path2D(hat));
      for (let i = -3; i <= 3; i++) line(ctx, [[1, -127], [1 + i * 12, -88]], '#b99a52', .9);
      for (const y of [-114, -104]) path(ctx, `M ${-40 + (y + 127) * 1.2} ${y} Q 1 ${y + 4} ${42 - (y + 127) * 1.2} ${y}`, null, '#b99a52', .9);
      ctx.restore();
      path(ctx, 'M -40 -94 Q 1 -86 42 -94', null, '#9a7a3a', 2.2);
    } else if (hatType === 'straw') {
      path(ctx, woman ? 'M -18 -86 Q -14 -102 1 -102 Q 16 -102 20 -86 Q 12 -95 6 -91 Q -2 -97 -8 -90 Q -13 -92 -18 -86 Z' : 'M -17 -90 Q -12 -102 1 -102 Q 14 -102 19 -90 Q 8 -95 1 -94 Q -8 -95 -17 -90 Z', '#2a211c', null);
      ellipse(ctx, 1, -96, 34, 7, '#e8cc80', INK, 1.8);
      path(ctx, 'M -15 -96 L -14 -116 Q 1 -119 16 -116 L 17 -96 Z', cylinder(ctx, -15, 17, '#e8cc80'), INK, 1.8);
      path(ctx, 'M -15.5 -101 Q 1 -99 17.5 -101 L 17.5 -96 Q 1 -94 -15.5 -96 Z', '#b83b3b', null);
      path(ctx, 'M -28 -95 Q 1 -92 30 -95', null, '#b99a52', 1.2);
    } else if (hatType === 'cap') {
      path(ctx, woman ? 'M -18 -86 Q -14 -102 1 -102 Q 16 -102 20 -86 Q 12 -95 6 -91 Q -2 -97 -8 -90 Q -13 -92 -18 -86 Z' : 'M -17 -90 Q -12 -102 1 -102 Q 14 -102 19 -90 Q 8 -95 1 -94 Q -8 -95 -17 -90 Z', '#2a211c', null);
      const capColor = s.style.cap || (fisher ? '#2a4858' : woman ? '#7c2d37' : '#234a6f');
      path(ctx, 'M -19 -92 Q -20 -113 1 -113 Q 21 -113 20 -92 Z', volume(ctx, 1, -102, 21, 14, capColor, .2, -.2), INK, 1.8);
      path(ctx, 'M -16 -91 Q 6 -89 27 -93 Q 18 -97 -5 -96 Z', tone(capColor, -0.25), INK, 1.6);
      ellipse(ctx, 1, -113, 2.4, 2, tone(capColor, 0.25), INK, 1);
    } else {
      if (woman) {
        path(ctx, 'M -18 -86 Q -14 -102 1 -102 Q 16 -102 20 -86 Q 12 -95 6 -91 Q -2 -97 -8 -90 Q -13 -92 -18 -86 Z', volume(ctx, 1, -96, 20, 10, '#2a201b', .15, -.2), INK, 1.6);
        path(ctx, 'M -8 -94 Q 1 -97 9 -93', null, '#57483e', 1.2);
      } else {
        const hair = 'M -19 -86 Q -22 -104 -2 -108 Q 20 -109 21 -90 Q 19 -86 17 -88 Q 12 -98 3 -97 Q -3 -102 -9 -95 Q -12 -89 -19 -86 Z';
        path(ctx, hair, volume(ctx, 0, -100, 20, 10, '#2c231d', .2, -.2), INK, 1.6);
        path(ctx, 'M -2 -107 Q 4 -113 9 -110', null, INK, 2);
        ctx.save(); ctx.globalAlpha *= .35; path(ctx, 'M -10 -103 Q 2 -107 12 -102', null, '#8a7a6c', 1.6); ctx.restore();
      }
    }
    ctx.restore();
    // Tay: da liền từ vai qua khuỷu tới bàn tay, tay áo ngắn phủ bắp tay.
    for (const side of ['l', 'r']) {
      const shoulder = skel[`shoulder_${side}`], elbow = skel[`elbow_${side}`], hand = skel[`hand_${side}`];
      const cuff = [mix(shoulder[0], elbow[0], .78), mix(shoulder[1], elbow[1], .78)];
      limb(ctx, [shoulder, elbow, hand], skin, 5.8);
      if (woman) limb(ctx, [shoulder, elbow, [mix(elbow[0], hand[0], .8), mix(elbow[1], hand[1], .8)]], shirt, 8);
      else limb(ctx, [shoulder, cuff], shirt, 9.5);
      const a = Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0]) + (s[`wrist_${side}`] || 0) * Math.PI / 180;
      mitten(ctx, hand[0], hand[1], 4.2, skin, a + (side === 'l' ? Math.PI / 2 : -Math.PI / 2) * .4);
    }
    celHatch(ctx, s, [-30, -108, 60, 108], '#4a3829', 11);
  }
  function drawHuman(ctx, s, cat, t) {
    if (HANDS.has(s.asset)) drawHand(ctx, s);
    else if (s.asset === 'foot') drawFoot(ctx, s);
    else { drawPerson(ctx, s, t); return; }
    celHatch(ctx, s, [-30, -108, 60, 108], '#4a3829', 11);
  }
  // Dụng cụ: mỗi asset một hàm vẽ; drawTool thêm lớp hatch chung. Asset lạ vẽ như bình xịt (như nhánh else cũ).
  const TOOL_DRAWERS = {
    knife(ctx, s, t) {
      const blade = ctx.createLinearGradient(0, -52, 0, -24);
      const steel = s.style.body || '#e3eded';
      blade.addColorStop(0, tone(steel, .5)); blade.addColorStop(.45, steel); blade.addColorStop(1, tone(steel, -.3));
      path(ctx, 'M -58 -55 Q -34 -13 8 -28 L 10 -41 Z', blade, INK, 2);
      path(ctx, 'M -52 -51 Q -20 -44 8 -39', null, 'rgba(255,255,255,.85)', 1.6);
      path(ctx, 'M -50 -46 Q -32 -22 6 -30', null, tone(steel, -.25), 1);
      path(ctx, 'M 4 -44 L 12 -42 L 10 -26 L 2 -28 Z', cylinder(ctx, 2, 12, '#9ea8a8'), INK, 1.4);
      const wood = s.style.accent || '#487d68';
      path(ctx, 'M 11 -42 L 56 -31 Q 61 -23 54 -15 L 9 -26 Z', volume(ctx, 30, -32, 26, 10, wood, .3, -.3), INK, 2);
      for (const x of [22, 36]) ellipse(ctx, x, -31 + (x - 22) * .22, 2.2, 2.2, '#dfe6e6', INK, .9);
    },
    fishing_rod(ctx, s, t) {
      const rodColor = s.style.body || '#8a5a2e';
      path(ctx, 'M -55 -18 Q -10 -46 60 -62 L 61 -58 Q -8 -40 -53 -13 Z', cylinder(ctx, -55, 61, rodColor), INK, 1.5);
      for (const x of [-10, 20, 45]) ellipse(ctx, x, -40 - (x + 10) * .33, 2.2, 3, '#c9d2d0', INK, .8);
      ellipse(ctx, -50, -22, 8, 12, volume(ctx, -50, -22, 8, 12, s.style.accent || '#4a3520'), INK, 1.4, -.2);
      ellipse(ctx, -44, -12, 6.5, 9, volume(ctx, -44, -12, 6.5, 9, '#9aa6a6'), INK, 1.2);
      line(ctx, [[-44, -12], [-40, -8]], INK, 2);
      line(ctx, [[60, -60], [80, 4]], '#f4f7f4', 1.2);
      ellipse(ctx, 80, 6, 4, 4, '#9fb0ad', INK, 1);
    },
    sprayer(ctx, s, t) {
      const body = s.style.body || '#a8b4b8';
      path(ctx, 'M 42 -104 L 12 -104 Q -18 -99 -19 -76 L -15 -29 L 18 -29 L 17 -73 Q 14 -82 42 -78 Z', cylinder(ctx, -19, 18, body), INK, 2);
      path(ctx, 'M 40 -107 L 50 -107 L 50 -75 L 40 -75 Z', tone(body, -.35), INK, 1.4);
      path(ctx, 'M -24 -34 L 25 -34 L 28 -14 Q 0 -10 -24 -14 Z', cylinder(ctx, -24, 28, '#5f7b80'), INK, 2);
      line(ctx, [[-12, -90], [-10, -40]], 'rgba(255,255,255,.55)', 3);
      line(ctx, [[-18, -96], [13, -86]], 'rgba(255,255,255,.7)', 2.2);
    },
    hoe(ctx, s, t) {
      const steel = s.style.accent || '#9aa4a6', wood = s.style.body || '#a8733f';
      path(ctx, 'M -3 0 L -3 -93 L 3 -93 L 3 0 Z', cylinder(ctx, -3, 3, wood), INK, 1.6);
      path(ctx, 'M -3 -95 L -17 -97 Q -32 -88 -31 -70 L -20 -68 Q -19 -82 -3 -87 Z', volume(ctx, -18, -84, 14, 14, steel, .4, -.3), INK, 1.8);
      line(ctx, [[-30, -71], [-21, -69]], '#f2f6f6', 1.6);
      path(ctx, 'M -5 -97 L 5 -97 L 5 -87 L -5 -87 Z', cylinder(ctx, -5, 5, tone(steel, -.2)), INK, 1.3);
    },
    sickle(ctx, s, t) {
      const steel = s.style.accent || '#9aa4a6', wood = s.style.body || '#a8733f';
      const edge = 'M -3 -38 C -38 -40 -50 -84 -30 -96 C -38 -80 -30 -52 3 -46 Z';
      const g = ctx.createLinearGradient(-44, -90, 0, -40); g.addColorStop(0, tone(steel, .45)); g.addColorStop(1, tone(steel, -.2));
      path(ctx, edge, g, INK, 1.8);
      path(ctx, 'M -31 -92 C -36 -76 -28 -54 2 -47', null, 'rgba(255,255,255,.8)', 1.2);
      path(ctx, 'M -4 0 L -4 -36 L 4 -36 L 4 0 Z', cylinder(ctx, -4, 4, wood), INK, 1.6);
      path(ctx, 'M -5 -40 L 5 -40 L 5 -33 L -5 -33 Z', tone(steel, -.25), INK, 1.2);
    },
    shovel(ctx, s, t) {
      const steel = s.style.accent || '#9aa4a6', wood = s.style.body || '#a8733f';
      path(ctx, 'M -3.5 -36 L -3.5 -92 L 3.5 -92 L 3.5 -36 Z', cylinder(ctx, -3.5, 3.5, wood), INK, 1.6);
      path(ctx, 'M -14 -99 L 14 -99 L 14 -92 L -14 -92 Z', cylinder(ctx, -14, 14, wood), INK, 1.5);
      path(ctx, 'M -4 -92 L -12 -92 L -10 -84 L -3.5 -84 Z', tone(steel, -.1), INK, 1.2);
      path(ctx, 'M 4 -92 L 12 -92 L 10 -84 L 3.5 -84 Z', tone(steel, -.1), INK, 1.2);
      path(ctx, 'M -5 -44 L 5 -44 L 4 -32 L -4 -32 Z', cylinder(ctx, -5, 5, tone(steel, -.2)), INK, 1.4);
      const bladePath = 'M -18 -40 Q -18 -36 -15 -24 Q -10 -8 0 -4 Q 10 -8 15 -24 Q 18 -36 18 -40 L 4 -40 L 0 -36 L -4 -40 Z';
      const g = ctx.createLinearGradient(-18, -40, 18, -4);
      g.addColorStop(0, tone(steel, .4)); g.addColorStop(0.5, steel); g.addColorStop(1, tone(steel, -.25));
      path(ctx, bladePath, g, INK, 2);
      line(ctx, [[0, -36], [0, -7]], tone(steel, -.35), 1.6);
      line(ctx, [[-1, -36], [-1, -8]], 'rgba(255,255,255,.8)', 1.2);
      path(ctx, 'M -11 -12 Q 0 -4 11 -12', null, 'rgba(255,255,255,.9)', 1.4);
    },
    rake(ctx, s, t) {
      const steel = s.style.accent || '#9aa4a6', wood = s.style.body || '#a8733f';
      path(ctx, 'M -3 -24 L -3 -100 L 3 -100 L 3 -24 Z', cylinder(ctx, -3, 3, wood), INK, 1.6);
      path(ctx, 'M -4.5 -25 L 4.5 -25 L 3.5 -20 L -3.5 -20 Z', tone(steel, -.2), INK, 1.3);
      path(ctx, 'M -36 -22 L 36 -22 L 36 -18 L -36 -18 Z', cylinder(ctx, -36, 36, steel), INK, 1.6);
      for (let i = -4; i <= 4; i++) {
        const tx = i * 8;
        path(ctx, `M ${tx} -18 Q ${tx} -10 ${tx + (i > 0 ? 1 : i < 0 ? -1 : 0) * 1.5} -4`, null, INK, 2.4);
        path(ctx, `M ${tx} -18 Q ${tx} -10 ${tx + (i > 0 ? 1 : i < 0 ? -1 : 0) * 1.5} -4`, null, steel, 1.5);
      }
      line(ctx, [[-35, -21], [35, -21]], 'rgba(255,255,255,.7)', 1.1);
    },
    axe(ctx, s, t) {
      const steel = s.style.accent || '#9aa4a6', wood = s.style.body || '#a8733f';
      const handle = 'M -4 0 Q -8 -20 -2 -50 Q 2 -70 -2 -92 L 4 -92 Q 8 -70 4 -50 Q -2 -20 2 0 Z';
      path(ctx, handle, wood, INK, 1.6);
      line(ctx, [[-1, -10], [1, -85]], tone(wood, 0.2), 1.2);
      path(ctx, 'M -5 -93 L 5 -93 L 5 -85 L -5 -85 Z', tone(steel, -.25), INK, 1.3);
      const axeHead = 'M 8 -94 L -10 -93 Q -20 -95 -22 -98 Q -24 -88 -22 -78 Q -20 -81 -10 -83 L 8 -82 Z';
      const g = ctx.createLinearGradient(-24, -88, 8, -88);
      g.addColorStop(0, tone(steel, .4)); g.addColorStop(0.6, steel); g.addColorStop(1, tone(steel, -.3));
      path(ctx, axeHead, g, INK, 1.8);
      path(ctx, 'M -22 -97 Q -24 -88 -22 -79', null, 'rgba(255,255,255,.9)', 1.5);
      path(ctx, 'M 7 -94 L 11 -93 L 11 -83 L 7 -82 Z', volume(ctx, 9, -88, 4, 11, tone(steel, -.1)), INK, 1.3);
    },
    pruning_shears(ctx, s, t) {
      const steel = s.style.accent || '#9aa4a6';
      const cutting = Boolean(s.is_cutting || s.cutting);
      const snip = cutting ? Math.sin(t * 14) * 0.16 : 0.04;
      const redGrip = s.style.body || '#c83232';
      path(ctx, 'M -3 -50 Q -16 -40 -14 -8 L -7 -8 Q -9 -38 -1 -48 Z', redGrip, INK, 1.6);
      line(ctx, [[-12, -14], [-10, -42]], tone(redGrip, 0.35), 1.4);
      path(ctx, 'M 3 -50 Q 16 -40 14 -8 L 7 -8 Q 9 -38 1 -48 Z', tone(redGrip, -0.1), INK, 1.6);
      line(ctx, [[10, -14], [8, -42]], tone(redGrip, 0.25), 1.4);
      ctx.save(); ctx.translate(0, -52); ctx.rotate(snip);
      path(ctx, 'M -2 2 Q -8 -20 0 -40 Q 6 -24 3 2 Z', volume(ctx, -1, -20, 7, 21, steel), INK, 1.6);
      path(ctx, 'M -2 0 Q -7 -20 0 -38', null, 'rgba(255,255,255,.85)', 1.2);
      ctx.restore();
      ctx.save(); ctx.translate(0, -52); ctx.rotate(-snip);
      path(ctx, 'M 2 2 Q 8 -20 0 -38 Q -5 -22 -3 2 Z', volume(ctx, 1, -20, 7, 20, tone(steel, -.15)), INK, 1.6);
      ctx.restore();
      ellipse(ctx, 0, -52, 4.5, 4.5, '#2a2420', INK, 1.2);
      ellipse(ctx, 0, -52, 2.5, 2.5, '#f0e6d2', null);
    },
    watering_can(ctx, s, t) {
      const body = s.style.body || '#4f9fc6';
      line(ctx, [[-18, -24], [-52, -66]], INK, 9); line(ctx, [[-18, -24], [-52, -66]], body, 6.4);
      ellipse(ctx, -56, -69, 7, 10.5, volume(ctx, -56, -69, 7, 10.5, tone(body, .15)), INK, 1.5, -.7);
      for (let i = 0; i < 5; i++) ellipse(ctx, -58 + (i % 3) * 2.2, -73 + i * 2, .8, .8, INK, null);
      path(ctx, 'M 2 -60 Q 6 -84 24 -80 Q 38 -74 30 -40', null, INK, 7.6);
      path(ctx, 'M 2 -60 Q 6 -84 24 -80 Q 38 -74 30 -40', null, body, 4.6);
      path(ctx, 'M -24 -60 Q -26 -6 -20 -2 L 24 -2 Q 30 -6 28 -60 Q 2 -66 -24 -60 Z', cylinder(ctx, -26, 30, body), INK, 2);
      ellipse(ctx, 2, -61, 26, 5.5, tone(body, -.35), INK, 1.6);
      for (const y of [-50, -12]) path(ctx, `M -25 ${y} Q 2 ${y + 4} 28 ${y}`, null, tone(body, -.25), 1.6);
    },
  };
  function drawTool(ctx, s, t) {
    (TOOL_DRAWERS[s.asset] || TOOL_DRAWERS.sprayer)(ctx, s, t);
    celHatch(ctx, s, [-62, -108, 126, 112], '#5c4430', 6);
  }
  // Đạo cụ: mỗi asset một hàm vẽ; drawProp thêm lớp hatch chung.
  const PROP_DRAWERS = {
    pot(ctx, s, t) {
      const body = s.style.body || '#c07a45';
      path(ctx, 'M -46 -56 L -33 -4 Q 0 6 33 -4 L 46 -56 Z', cylinder(ctx, -46, 46, body), INK, 2);
      ellipse(ctx, 0, -57, 47, 10, '#5e3e24', INK, 2);
      if (s.cutaway) {
        path(ctx, 'M -40 -51 L -28 -7 Q 0 0 28 -7 L 40 -51 Z', '#6e4f33', INK, 1.4);
        for (let i = 0; i < 32; i++) ellipse(ctx, Math.sin(i * 8) * 27, -12 - (i * 7 % 36), .9, 1, '#a88050', null);
      }
      if (s.nutrients > 0) for (let i = 0; i < Math.ceil(s.nutrients * 9); i++) ellipse(ctx, (i % 3 - 1) * 14, -40 + Math.floor(i / 3) * 11, 2.5, 3.8, '#efd9a0', '#9d8350', .7, .4);
      path(ctx, 'M -49 -62 Q 0 -71 49 -62 L 48 -51 Q 0 -42 -48 -51 Z', cylinder(ctx, -49, 49, tone(body, .1)), INK, 2);
    },
    bucket(ctx, s, t) {
      const body = s.style.body || '#6f8a8e';
      path(ctx, 'M -39 -64 C -68 -38 -53 -5 -28 -10 M 40 -64 C 62 -36 52 -13 32 -11', null, INK, 4.6);
      path(ctx, 'M -39 -64 C -68 -38 -53 -5 -28 -10 M 40 -64 C 62 -36 52 -13 32 -11', null, '#cdd8d2', 2.4);
      path(ctx, 'M -43 -74 L -31 -6 Q 0 6 31 -6 L 43 -74 Z', cylinder(ctx, -43, 43, body), INK, 2);
      for (const y of [-52, -26]) path(ctx, `M ${-40 + (y + 74) * .17} ${y} Q 0 ${y + 7} ${40 - (y + 74) * .17} ${y}`, null, tone(body, -.3), 2);
      ellipse(ctx, 0, -73, 43, 12, '#c3cfcc', INK, 2);
      ellipse(ctx, 0, -73, 36, 8, s.fill > 0 ? '#fffbe3' : '#3f524f', tone(body, -.3), 1.2);
      if (s.fill > 0) path(ctx, `M -28 ${-9 - s.fill * 45} L 28 ${-9 - s.fill * 45} L 26 -8 Q 0 1 -26 -8 Z`, '#f3f6e8bb', null);
    },
    bag(ctx, s, t) {
      const body = s.style.body || '#c29a6b', d = 'M -37 -99 L -27 -91 L -17 -101 L -5 -91 L 8 -99 L 22 -91 L 36 -99 L 44 -14 L 30 0 L -32 -1 L -45 -15 Z';
      path(ctx, d, cylinder(ctx, -45, 44, body), INK, 2);
      path(ctx, 'M -36 -94 L -30 -14 L -40 -6 M 32 -94 L 24 -14 L 33 -1 M -30 -14 L 24 -14', null, tone(body, -.3), 1.3);
      path(ctx, 'M -20 -80 L -16 -24', null, 'rgba(255,255,255,.35)', 3);
    },
    hook(ctx, s, t) {
      line(ctx, [[0, -84], [0, -30]], INK, 5); line(ctx, [[0, -84], [0, -30]], '#c3ccca', 3);
      path(ctx, 'M 0 -30 Q 0 0 12 -6 Q 26 -12 26 -30 Q 26 -40 18 -42', null, INK, 7);
      path(ctx, 'M 0 -30 Q 0 0 12 -6 Q 26 -12 26 -30 Q 26 -40 18 -42', null, '#a9b8b5', 4.6);
      path(ctx, 'M 2 -24 Q 4 -8 12 -9', null, 'rgba(255,255,255,.8)', 1.4);
      path(ctx, 'M 26 -30 L 34 -34', null, INK, 5); path(ctx, 'M 26 -30 L 34 -34', null, '#d2dad8', 3);
      ellipse(ctx, 0, -84, 5, 7, '#eef2ee', INK, 1.4);
      line(ctx, [[-6, -34], [6, -34]], s.style.accent || '#c25b4b', 4);
    },
    bobber(ctx, s, t) {
      ctx.save(); ctx.translate(Math.sin((s.swim || 0) * Math.PI) * 6, Math.sin(t * 3.1 + hash(s.id) % 5) * 1.2);
      ctx.save(); ctx.globalAlpha *= .5; ellipse(ctx, 0, -18, 26 + Math.sin(t * 3.1) * 2, 7, '#e7f7fb', null); ctx.restore();
      ellipse(ctx, 0, -50, 22, 40, volume(ctx, 0, -50, 22, 40, s.style.body || '#efeadb'), INK, 2);
      ctx.save(); ctx.clip(new Path2D('M -30 -120 L 30 -120 L 30 -62 L -30 -62 Z'));
      ellipse(ctx, 0, -50, 22, 40, volume(ctx, 0, -60, 22, 30, s.style.accent || '#d8402f'), INK, 2);
      ctx.restore();
      line(ctx, [[-21, -62], [21, -62]], INK, 1.5);
      line(ctx, [[0, -89], [0, -98]], INK, 4.4); line(ctx, [[0, -89], [0, -98]], '#8a7556', 2.4);
      ctx.save(); ctx.globalAlpha *= .6; ellipse(ctx, 0, -18, 21, 9, '#9fd6e6', null); ctx.restore();
      ctx.restore();
    },
    boat(ctx, s, t) {
      const body = s.style.body || '#9a6a3c', hull = 'M -80 -42 L 80 -42 L 60 -6 Q 0 14 -60 -6 Z';
      path(ctx, hull, cylinder(ctx, -80, 80, body), INK, 2.2);
      ctx.save(); ctx.clip(new Path2D(hull));
      for (const y of [-30, -19, -8]) path(ctx, `M -82 ${y} Q 0 ${y + 10} 82 ${y}`, null, tone(body, -.35), 1.5);
      ctx.restore();
      path(ctx, 'M -80 -42 L 80 -42 L 76 -33 L -76 -33 Z', cylinder(ctx, -80, 80, s.style.accent || '#c9995b'), INK, 1.8);
      line(ctx, [[-52, -42], [-52, -20]], INK, 5); line(ctx, [[-52, -42], [-52, -20]], '#7a532c', 3);
      ctx.save(); ctx.globalAlpha *= .55;
      for (const side of [-1, 1]) path(ctx, `M ${side * 50} -4 Q ${side * 72} 0 ${side * 92} -6`, null, '#eaf8fb', 2.4);
      ctx.restore();
    },
    seed(ctx, s, t) {
      ellipse(ctx, 0, -50, 30, 47, volume(ctx, 0, -50, 30, 47, s.style.body || '#e6cd91'), INK, 2, .3);
      path(ctx, 'M -6 -90 Q 8 -50 -2 -8', null, tone(s.style.body || '#e6cd91', -.3), 1.4);
    },
    soil_bed(ctx, s, t) {
      const soilCol = s.style.body || (s.wet > 0 ? '#3d2412' : '#5a381e');
      const bed = 'M -72 0 Q -70 -24 -56 -24 L 56 -24 Q 70 -24 72 0 Z';
      path(ctx, bed, volume(ctx, 0, -12, 70, 16, soilCol), INK, 1.8);
      for (let i = 0; i < 18; i++) {
        const dx = -58 + (i * 29) % 116, dy = -4 - (i * 13) % 18;
        ellipse(ctx, dx, dy, 1.8, 1.4, tone(soilCol, (i % 2) ? .2 : -.2), null);
      }
      for (const [gx, gy] of [[-66, -4], [-58, -12], [58, -12], [66, -4]]) {
        path(ctx, `M ${gx} ${gy} Q ${gx - 3} ${gy - 10} ${gx - 5} ${gy - 12}`, null, '#6fae48', 1.6);
        path(ctx, `M ${gx} ${gy} Q ${gx + 3} ${gy - 9} ${gx + 4} ${gy - 11}`, null, '#88c850', 1.4);
      }
      if ((s.cut || 0) > .01) {
        const pitDepth = s.cut * 20;
        const pit = `M -24 -24 Q 0 ${-24 + pitDepth} 24 -24 Q 0 ${-24 + pitDepth * 0.4} -24 -24 Z`;
        path(ctx, pit, '#221207', INK, 1.4);
        const moundH = s.cut * 14;
        ellipse(ctx, 36, -24 - moundH * 0.35, 14, moundH * 0.7, volume(ctx, 36, -24 - moundH * 0.5, 14, moundH * 0.7, tone(soilCol, 0.2)), INK, 1.3);
      }
    },
    wheelbarrow(ctx, s, t) {
      const chassis = '#3b4347', hopperCol = s.style.body || '#3a7d44';
      line(ctx, [[-66, -44], [-20, -32], [44, -14]], INK, 4.8);
      line(ctx, [[-66, -44], [-20, -32], [44, -14]], chassis, 3);
      line(ctx, [[-66, -44], [-54, -41]], '#1a1f22', 5);
      line(ctx, [[-26, -33], [-28, 0]], INK, 4);
      line(ctx, [[-26, -33], [-28, 0]], chassis, 2.4);
      const wheelAngle = (s.stride || 0) + (s.gait || 0) + (Math.abs(s.walk || 0) > 0.01 ? t * 6 : 0);
      ellipse(ctx, 44, -14, 14, 14, '#242a2d', INK, 1.6);
      ellipse(ctx, 44, -14, 11, 11, tone(chassis, 0.4), INK, 1.2);
      ctx.save(); ctx.translate(44, -14); ctx.rotate(wheelAngle);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 4;
        line(ctx, [[Math.cos(a) * 11, Math.sin(a) * 11], [-Math.cos(a) * 11, -Math.sin(a) * 11]], '#bcc5c7', 1.2);
      }
      ellipse(ctx, 0, 0, 3.5, 3.5, '#1a1f22', INK, 1);
      ctx.restore();
      line(ctx, [[-4, -30], [28, -48]], chassis, 2.5);
      const tray = 'M -24 -54 L 36 -54 L 28 -28 L -16 -28 Z';
      if ((s.fill || 0) > .01) {
        const fH = s.fill * 16;
        ellipse(ctx, 6, -54 - fH * 0.4, 26, fH * 0.8 + 4, volume(ctx, 6, -54 - fH * 0.5, 26, fH + 4, '#d48834'), INK, 1.2);
      }
      path(ctx, tray, volume(ctx, 6, -41, 28, 16, hopperCol), INK, 2);
      path(ctx, 'M -26 -55 L 38 -55 L 36 -51 L -24 -51 Z', cylinder(ctx, -26, 38, tone(hopperCol, .25)), INK, 1.4);
    },
    crate(ctx, s, t) {
      const wood = s.style.body || '#a67744';
      path(ctx, 'M -44 -60 L 44 -60 L 44 0 L -44 0 Z', '#3a2212', INK, 2);
      if ((s.fill || 0) > .01) {
        const produceColors = ['#e0342b', '#f29c2b', '#88c830', '#e0342b'];
        const numItems = Math.ceil(s.fill * 12);
        for (let i = 0; i < numItems; i++) {
          const fx = -30 + (i * 23) % 60, fy = -52 - (i % 3) * 6 * s.fill;
          ellipse(ctx, fx, fy, 7.5, 7, volume(ctx, fx, fy, 7.5, 7, produceColors[i % 4]), INK, 1.1);
        }
      }
      for (const y of [-54, -36, -18]) {
        path(ctx, `M -44 ${y} L 44 ${y} L 44 ${y + 14} L -44 ${y + 14} Z`, cylinder(ctx, -44, 44, wood), INK, 1.4);
        line(ctx, [[-40, y + 7], [40, y + 7]], tone(wood, 0.18), 1);
      }
      for (const cx of [-44, 34]) {
        path(ctx, `M ${cx} -60 L ${cx + 10} -60 L ${cx + 10} 0 L ${cx} 0 Z`, volume(ctx, cx + 5, -30, 6, 30, tone(wood, -.15)), INK, 1.4);
        ellipse(ctx, cx + 5, -54, 1.5, 1.5, '#2a180c', null);
        ellipse(ctx, cx + 5, -6, 1.5, 1.5, '#2a180c', null);
      }
      path(ctx, 'M -34 -54 L 34 -6 L 34 0 L -34 -48 Z', tone(wood, -.08), INK, 1.2);
    },
    sack(ctx, s, t) {
      const sackCol = s.style.body || '#c49e68';
      const belly = 'M -38 0 Q -46 -36 -34 -70 Q -24 -84 0 -86 Q 24 -84 34 -70 Q 46 -36 38 0 Z';
      path(ctx, belly, volume(ctx, 0, -44, 40, 44, sackCol, .35, -.2), INK, 2.2);
      ctx.save(); ctx.clip(new Path2D(belly));
      for (let i = -6; i <= 6; i++) {
        line(ctx, [[i * 8, -86], [i * 8, 0]], tone(sackCol, -.14), 1);
        line(ctx, [[-44, i * 14 - 10], [44, i * 14 - 10]], tone(sackCol, .14), 1);
      }
      ctx.restore();
      path(ctx, 'M -32 -6 Q 0 4 32 -6', null, tone(sackCol, -.3), 2);
      path(ctx, 'M -16 -87 Q 0 -84 16 -87 L 15 -83 Q 0 -80 -15 -83 Z', '#e2cb96', INK, 1.4);
      line(ctx, [[0, -83], [4, -72]], '#e2cb96', 2.4);
      const frill = 'M -16 -87 L -22 -100 L -10 -95 L 0 -101 L 10 -95 L 22 -100 L 16 -87 Z';
      path(ctx, frill, volume(ctx, 0, -94, 20, 8, tone(sackCol, .15)), INK, 1.6);
    },
    hay_bale(ctx, s, t) {
      const hay = s.style.body || '#e5be48';
      const bale = 'M -48 -48 L 48 -48 Q 50 -48 50 -46 L 50 -2 Q 50 0 48 0 L -48 0 Q -50 0 -50 -2 L -50 -46 Q -50 -48 -48 -48 Z';
      path(ctx, bale, volume(ctx, 0, -24, 50, 26, hay), INK, 2);
      for (let i = 0; i < 22; i++) {
        const sy = -4 + (i * 9) % 44, sx = -42 + (i * 21) % 84;
        line(ctx, [[sx, -sy], [sx + 14, -sy - 2]], tone(hay, (i % 2) ? .25 : -.22), 1.2);
      }
      for (const [rx, ry, rdx, rdy] of [[-49, -38, -6, 2], [-49, -16, -7, -3], [49, -32, 6, -2], [49, -12, 7, 3], [-20, -49, -2, -5], [18, -49, 3, -6]]) {
        line(ctx, [[rx, ry], [rx + rdx, ry + rdy]], '#edd268', 1.6);
      }
      for (const tx of [-22, 22]) {
        line(ctx, [[tx, -48], [tx, 0]], INK, 4);
        line(ctx, [[tx, -48], [tx, 0]], '#355c32', 2.2);
      }
    },
    egg(ctx, s, t) {
      const eggPath = 'M 0 0 C -34 0 -32 -60 0 -100 C 32 -60 34 0 0 0 Z';
      const shellCol = s.style.body || '#fbf6ea';
      path(ctx, eggPath, volume(ctx, 0, -50, 32, 50, shellCol, .45, -.25), INK, 2);
      ellipse(ctx, -12, -62, 5, 14, 'rgba(255,255,255,.8)', null, .2);
      if ((s.damage || 0) > .01) {
        const d = clamp(s.damage, 0, 1);
        ctx.save(); ctx.lineCap = 'round';
        path(ctx, `M 0 -72 L 6 -64 L -4 -56 L 8 -46 L -2 -38 L 4 -28`, null, INK, 2.2);
        path(ctx, `M 0 -72 L 6 -64 L -4 -56 L 8 -46 L -2 -38 L 4 -28`, null, '#54321b', 1.4);
        if (d > .4) {
          path(ctx, `M 6 -64 L 16 -66 L 22 -60`, null, INK, 1.8);
          path(ctx, `M -4 -56 L -16 -54 L -20 -62`, null, INK, 1.8);
        }
        ctx.restore();
      }
    },
    nest(ctx, s, t) {
      const strawCol = s.style.body || '#9a7038';
      ellipse(ctx, 0, -38, 44, 12, '#38220f', INK, 1.6);
      if ((s.fill || 0) > .01) {
        const count = Math.min(4, Math.floor(s.fill * 4.99));
        const eggPos = [[-12, -40], [12, -40], [0, -44], [0, -36]];
        for (let i = 0; i < count; i++) {
          const [ex, ey] = eggPos[i];
          ellipse(ctx, ex, ey, 7, 9.5, volume(ctx, ex, ey, 7, 9.5, '#faf4e6'), INK, 1.2, (i % 2 ? .3 : -.3));
        }
      }
      const nestWall = 'M -46 -38 Q -48 0 0 0 Q 48 0 46 -38 Q 0 -28 -46 -38 Z';
      path(ctx, nestWall, volume(ctx, 0, -20, 46, 22, strawCol), INK, 2);
      for (let i = 0; i < 20; i++) {
        const nx = -38 + (i * 19) % 76, ny = -4 - (i * 11) % 32;
        path(ctx, `M ${nx} ${ny} Q ${nx + 10} ${ny - 6} ${nx + 18} ${ny}`, null, tone(strawCol, (i % 2) ? .25 : -.25), 1.4);
      }
      path(ctx, 'M -46 -38 Q 0 -28 46 -38', null, INK, 4.2);
      path(ctx, 'M -46 -38 Q 0 -28 46 -38', null, tone(strawCol, .3), 2.2);
    },
    beehive(ctx, s, t) {
      const hiveCol = s.style.body || '#e5a832';
      line(ctx, [[0, -100], [0, -88]], INK, 4);
      line(ctx, [[0, -100], [0, -88]], '#88622c', 2.2);
      const tiers = [
        { y: -82, rx: 16, ry: 7 },
        { y: -72, rx: 26, ry: 9 },
        { y: -60, rx: 34, ry: 10 },
        { y: -46, rx: 36, ry: 11 },
        { y: -32, rx: 30, ry: 10 },
        { y: -20, rx: 20, ry: 8 }
      ];
      for (const tr of tiers) {
        ellipse(ctx, 0, tr.y, tr.rx, tr.ry, volume(ctx, 0, tr.y, tr.rx, tr.ry, hiveCol), INK, 1.8);
        line(ctx, [[-tr.rx * 0.7, tr.y], [tr.rx * 0.5, tr.y]], 'rgba(255,255,255,.45)', 1.2);
      }
      ellipse(ctx, 0, -24, 7, 7, '#1f1307', INK, 1.4);
      const beeWing = Math.sin(t * 30);
      ellipse(ctx, 22, -44 + Math.sin(t * 4) * 4, 3.2, 2.2, '#f2cf45', INK, 0.9);
      ellipse(ctx, 22, -47 + Math.sin(t * 4) * 4, 1.8, 2.4 * Math.abs(beeWing), '#ffffffcc', null);
    },
    lantern(ctx, s, t) {
      const red = s.style.body || '#d82828', gold = '#f0c242';
      const glow = 0.22 + 0.08 * Math.sin(t * 5 + 1);
      ctx.save(); ctx.globalAlpha = glow;
      const g = ctx.createRadialGradient(0, -58, 10, 0, -58, 64);
      g.addColorStop(0, '#ffe882'); g.addColorStop(0.6, '#f79e38'); g.addColorStop(1, 'rgba(247,158,56,0)');
      ellipse(ctx, 0, -58, 64, 64, g, null);
      ctx.restore();
      ellipse(ctx, 0, -96, 6, 6, null, '#281c16', 2.2);
      path(ctx, 'M -18 -88 L 18 -88 L 14 -82 L -14 -82 Z', volume(ctx, 0, -85, 18, 4, gold), INK, 1.4);
      ellipse(ctx, 0, -58, 30, 26, volume(ctx, 0, -58, 30, 26, red, .4, -.2), INK, 2.2);
      for (const k of [-18, -9, 0, 9, 18]) {
        path(ctx, `M ${k * 0.5} -82 Q ${k * 1.5} -58 ${k * 0.5} -34`, null, tone(red, -.35), 1.2);
      }
      line(ctx, [[-28, -58], [28, -58]], tone(red, -.2), 1.2);
      path(ctx, 'M -14 -34 L 14 -34 L 16 -28 L -16 -28 Z', volume(ctx, 0, -31, 16, 4, gold), INK, 1.4);
      const tasselFlutter = Math.sin(t * 3.5) * 2;
      for (let i = -3; i <= 3; i++) {
        line(ctx, [[i * 3, -28], [i * 3.5 + tasselFlutter, -2]], gold, 1.8);
      }
    },
    bowl(ctx, s, t) {
      const bowlCol = s.style.body || '#faf8f2', patternCol = '#2554a8';
      ellipse(ctx, 0, -2, 16, 3, tone(bowlCol, -.15), INK, 1.4);
      ellipse(ctx, 0, -40, 36, 9, '#e4e2da', INK, 1.6);
      if ((s.fill || 0) > .01) {
        const riceH = s.fill * 16;
        ellipse(ctx, 0, -40 - riceH * 0.4, 34, 11 + riceH * 0.5, volume(ctx, 0, -42 - riceH * 0.4, 34, 12 + riceH * 0.5, '#ffffff'), INK, 1.3);
        for (let i = 0; i < 14; i++) {
          const rx = -20 + (i * 17) % 40, ry = -44 - (i % 3) * 4 * s.fill;
          ellipse(ctx, rx, ry, 1.8, 1.2, '#f0eee6', null, .3);
        }
        ctx.save(); ctx.globalAlpha = 0.55;
        for (const [sx, phase] of [[-12, 0], [0, 1.8], [12, 3.6]]) {
          ctx.beginPath();
          for (let py = -54; py >= -84; py -= 4) {
            const px = sx + Math.sin(t * 3.5 + py * 0.12 + phase) * 4;
            if (py === -54) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke();
        }
        ctx.restore();
      }
      const bowlBody = 'M -36 -40 Q -38 -12 -16 -2 L 16 -2 Q 38 -12 36 -40 Z';
      path(ctx, bowlBody, volume(ctx, 0, -20, 36, 22, bowlCol), INK, 2);
      path(ctx, 'M -34 -34 Q 0 -26 34 -34', null, patternCol, 2);
      for (let i = -4; i <= 4; i++) {
        ellipse(ctx, i * 7.5, -31 - Math.sin((i + 4) / 8 * Math.PI) * 4, 1.8, 1.8, patternCol, null);
      }
      ellipse(ctx, 0, -40, 36, 6, null, 'rgba(255,255,255,.9)', 1.4);
    },
    fence(ctx, s, t) {
      const wood = s.style.body || '#aa7a4a';
      const posts = [-64, -32, 0, 32, 64];
      for (const ry of [-52, -22]) {
        path(ctx, `M -74 ${ry} L 74 ${ry} L 74 ${ry + 8} L -74 ${ry + 8} Z`, cylinder(ctx, -74, 74, tone(wood, -.12)), INK, 1.4);
      }
      for (const px of posts) {
        const picket = `M ${px - 6} 0 L ${px - 6} -70 L ${px} -76 L ${px + 6} -70 L ${px + 6} 0 Z`;
        path(ctx, picket, volume(ctx, px, -38, 8, 38, wood), INK, 1.6);
        line(ctx, [[px - 1, -66], [px + 1, -10]], tone(wood, .2), 1);
        ellipse(ctx, px, -48, 1.5, 1.5, '#2c1e14', null);
        ellipse(ctx, px, -18, 1.5, 1.5, '#2c1e14', null);
      }
    },
  };
  function drawProp(ctx, s, t) {
    if (s.asset === 'scarecrow' || s.asset === 'basket') { (s.asset === 'scarecrow' ? drawScarecrow : drawBasket)(ctx, s, t); celHatch(ctx, s, [-46, -106, 92, 106], '#5c4430', 8); return; }
    const own = PROP_DRAWERS[s.asset];
    if (own) own(ctx, s, t);
    celHatch(ctx, s, [-82, -105, 164, 108], '#5c4430', 8);
  }
  function drawInsect(ctx, s) {
    const body = s.style.body || '#b3d873';
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const phase = Math.sin(s.gait * TAU + i + side) * 8;
      const pts = [[i * 12 - 15, -39], [i * 17 - 26, -20 + side * 30 + phase], [i * 22 - 31, side < 0 ? -84 + phase : -1 + phase]];
      limb(ctx, pts, '#557a36', 2.4);
    }
    ellipse(ctx, 5, -48, 31, 26, volume(ctx, 5, -48, 31, 26, body), INK, 2);
    ctx.save(); ctx.clip(new Path2D('M -26 -48 a 31 26 0 1 0 62 0 a 31 26 0 1 0 -62 0'));
    for (let i = 0; i < 4; i++) path(ctx, `M ${i * 11 - 8} -74 Q ${i * 11 + 6} -48 ${i * 11 - 8} -22`, null, tone(body, -.3), 1.6);
    ctx.restore();
    for (const [x, y] of [[-45, -90], [-7, -92]]) {
      path(ctx, `M ${x > -20 ? -17 : -31} ${x > -20 ? -64 : -61} Q ${x - 4} ${y + 10} ${x} ${y}`, null, INK, 2.2);
      ellipse(ctx, x, y, 3, 3, '#7aa84a', INK, 1);
    }
    ellipse(ctx, -24, -46, 18, 20, volume(ctx, -24, -46, 18, 20, tone(body, .12)), INK, 2);
  }
  function drawFish(ctx, s, t) {
    const body = s.style.body || (s.asset === 'big_fish' ? '#4f7fa8' : '#f0a449');
    const fin = s.style.accent || (s.asset === 'big_fish' ? '#35607f' : '#dd7d2f');
    const speed = clamp(Math.abs(s.vx || 0) / Math.max(60, s.height * 1.2));
    const rate = (s.asset === 'big_fish' ? 5 : 8) * (1 + speed * .8 + (s.hooked > .05 ? 1.2 : 0));
    const wig = Math.sin((t || 0) * rate + (hash(s.id) % 10)), amp = 1 + speed * .8 + (s.hooked > .05 ? .8 : 0);
    // Đuôi chẻ và vây lưng quẫy lệch pha với thân.
    const tail = `M -46 -50 Q ${-62 + wig * 4 * amp} ${-58 - wig * 3} ${-78 + wig * 7 * amp} ${-76 + wig * 4} Q ${-70 + wig * 5 * amp} -52 ${-78 + wig * 7 * amp} ${-26 + wig * 4} Q ${-62 + wig * 4 * amp} ${-42 - wig * 3} -46 -50 Z`;
    path(ctx, tail, volume(ctx, -66, -50, 16, 26, fin), INK, 1.8);
    for (const dy of [-10, 0, 10]) path(ctx, `M -52 -50 L ${-72 + wig * 6 * amp} ${-50 + dy * 2}`, null, tone(fin, -.25), 1);
    path(ctx, `M -22 -76 Q -4 ${-98 - wig * 2} 20 -76 Z`, volume(ctx, 0, -84, 20, 10, fin), INK, 1.8);
    path(ctx, 'M -10 -24 Q 0 -10 12 -24 Z', fin, INK, 1.4);
    const shape = 'M 46 -56 Q 42 -82 6 -82 Q -30 -82 -48 -50 Q -30 -20 6 -20 Q 40 -20 46 -48 Z';
    path(ctx, shape, volume(ctx, 0, -54, 48, 32, body, .3, -.3), INK, 2);
    ctx.save(); ctx.clip(new Path2D(shape));
    ellipse(ctx, 0, -26, 50, 14, tone(body, .45), null);
    ctx.globalAlpha *= .35;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
      const x = -30 + i * 11 + (row % 2) * 5, y = -68 + row * 11;
      path(ctx, `M ${x} ${y} Q ${x + 5} ${y + 5} ${x} ${y + 10}`, null, tone(body, -.4), 1.2);
    }
    ctx.restore();
    path(ctx, 'M 22 -76 Q 30 -52 22 -28', null, tone(body, -.35), 1.8);
    const pect = `M 14 -46 Q ${2 + wig * 2} ${-38 + wig * 2} ${-2 + wig * 3} ${-30 + wig * 3} Q 10 -36 20 -44 Z`;
    path(ctx, pect, fin, INK, 1.3);
    ellipse(ctx, -14, -66, 9, 4, 'rgba(255,255,255,.4)', null, 1, -.2);
    const open = s.hooked > .05 || s.mouth > .01;
    if (open) { path(ctx, 'M 44 -58 Q 54 -56 52 -48 Q 48 -46 44 -50 Z', '#7a3b45', INK, 1.4); ellipse(ctx, 49, -51, 2.6, 2.2, '#c96a76', null); }
    else path(ctx, 'M 40 -54 Q 45 -52 46 -50', null, INK, 1.6);
    if (s.hooked > .05) { line(ctx, [[52, -54], [58, -40], [54, -26]], '#9fb0ad', 3); ellipse(ctx, 54, -26, 4, 4, '#e9efe9', INK, 1); }
    else if (s.wet > 0) for (let i = 0; i < 3; i++) ellipse(ctx, 20 - i * 12, -46 + (t * 20 + i * 6) % 14, 1.6, 2.6, '#bfe8f2', null);
    celHatch(ctx, s, [-55, -87, 112, 83], '#69452a', 13);
  }
  function tierBadge(ctx, text, x, y) {
    const wide = 44 + text.length * 13, plate = text === 'SS' ? '#caa1ff' : '#93ecc4', ink = text === 'SS' ? '#3a1d5c' : '#124a37';
    ctx.save(); ctx.translate(x, y);
    path(ctx, `M ${-wide / 2 + 9} -16 L ${wide / 2 - 9} -16 Q ${wide / 2} -16 ${wide / 2} -7 L ${wide / 2} 7 Q ${wide / 2} 16 ${wide / 2 - 9} 16 L ${-wide / 2 + 9} 16 Q ${-wide / 2} 16 ${-wide / 2} 7 L ${-wide / 2} -7 Q ${-wide / 2} -16 ${-wide / 2 + 9} -16 Z`, plate, '#231533', 2.5);
    ctx.fillStyle = ink; ctx.font = '800 23px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 1); ctx.textBaseline = 'alphabetic'; ctx.restore();
  }
  function drawMonster(ctx, s, t) {
    const ss = s.asset === 'sea_monster_ss';
    const body = s.style.body || (ss ? '#5b3a86' : '#2f7d6b');
    const accent = s.style.accent || (ss ? '#b56cff' : '#7fd6b4');
    const belly = ss ? '#8a63bb' : '#56b39a';
    const glow = ss ? '#f0d4ff' : '#c4ffe6';
    const rise = clamp(s.rise || 0), rage = clamp(s.rage || 0), jaw = clamp(s.jaw || 0);
    const count = ss ? 7 : 5, phase = (hash(s.id) % 7);
    ctx.save();
    ctx.translate(0, (1 - rise) * 88 + Math.sin((t || 0) * 2.4 + phase) * 3);
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * (ss ? 14 : 17);
      const swing = Math.sin((t || 0) * 2.6 + i * 1.3) * (ss ? 16 : 11) + (s.tentacle || 0) * (.5 + i * .14);
      const tipX = spread + swing, tipY = -4 + Math.cos((t || 0) * 2 + i) * 5;
      const cx = spread * .8 + swing * .5, d = `M ${spread * .35} -38 Q ${cx} -72 ${tipX} ${tipY}`;
      path(ctx, d, null, INK, ss ? 12 : 11);
      path(ctx, d, null, accent, ss ? 9 : 8);
      path(ctx, d, null, tone(accent, .35), 2.4);
      for (let k = 1; k <= 3; k++) {
        const u = .45 + k * .15, x = (1 - u) ** 2 * spread * .35 + 2 * (1 - u) * u * cx + u * u * tipX, y = (1 - u) ** 2 * -38 + 2 * (1 - u) * u * -72 + u * u * tipY;
        ellipse(ctx, x, y, 1.8, 1.8, tone(accent, .55), tone(accent, -.35), .6);
      }
      ellipse(ctx, tipX, tipY, ss ? 5 : 4.2, ss ? 5 : 4.2, volume(ctx, tipX, tipY, 5, 5, accent), INK, 1.2);
    }
    for (let i = 0; i < (ss ? 6 : 4); i++) {
      const a = -2.1 + i * .52, bx = Math.cos(a) * (ss ? 45 : 39), by = -66 + Math.sin(a) * (ss ? 47 : 41);
      path(ctx, `M ${bx} ${by} Q ${bx + Math.cos(a) * 16} ${by + Math.sin(a) * 16} ${bx + Math.cos(a) * 5} ${by + Math.sin(a) * 5 + 7} Z`, volume(ctx, bx, by, 10, 10, accent), INK, 1.4);
    }
    if (ss) {
      path(ctx, 'M -26 -104 Q -50 -136 -18 -124 Z', volume(ctx, -30, -120, 14, 14, '#4a2e75'), INK, 1.6);
      path(ctx, 'M 26 -104 Q 50 -136 18 -124 Z', volume(ctx, 30, -120, 14, 14, '#4a2e75'), INK, 1.6);
      path(ctx, 'M 0 -112 L 7 -144 L -7 -144 Z', glow, INK, 1.4);
    }
    ellipse(ctx, 0, -66, ss ? 46 : 40, ss ? 48 : 42, volume(ctx, 0, -66, ss ? 46 : 40, ss ? 48 : 42, body, .3, -.35), INK, 2.4);
    ellipse(ctx, 0, -48, ss ? 36 : 31, ss ? 22 : 19, volume(ctx, 0, -48, 34, 21, belly, .25, -.15), null);
    ctx.save(); ctx.globalAlpha *= .35;
    for (let i = 0; i < 5; i++) ellipse(ctx, -22 + i * 11 + (i % 2) * 3, -92 + (i % 2) * 8, 3, 2.2, tone(body, .35), null);
    ctx.restore();
    const eyeY = -74, eyeXs = ss ? [-16, 16] : [0];
    for (const ex of eyeXs) {
      const r = ss ? 13 : 15;
      ellipse(ctx, ex, eyeY, r, r, '#10231f', INK, 1.6);
      ellipse(ctx, ex, eyeY, (ss ? 8.5 : 10.5) + rage * 3, (ss ? 8.5 : 10.5) + rage * 3, volume(ctx, ex, eyeY, 10, 10, glow, .4, -.3), null);
      ellipse(ctx, ex + (s.look_x || 0) * 3, eyeY + (s.look_y || 0) * 3, 3.6 - rage, 5 + rage * 2, '#231410', null);
      ellipse(ctx, ex - 3, eyeY - 4, 2, 2, '#ffffff', null);
      const lowL = ex > 0 ? rage * 7 : ex === 0 ? rage * 3 : 0, lowR = ex < 0 ? rage * 7 : ex === 0 ? rage * 3 : 0;
      path(ctx, `M ${ex - r - 2} ${eyeY - r - 1 + lowL} L ${ex + r + 2} ${eyeY - r - 1 + lowR}`, null, INK, 3.4);
    }
    const mouth = `M -26 -50 Q 0 ${-36 + jaw * (ss ? 30 : 24)} 26 -50 Q 0 ${-46 + jaw * 10} -26 -50 Z`;
    path(ctx, mouth, '#3a1620', INK, 1.8);
    ctx.save(); ctx.clip(new Path2D(mouth)); ellipse(ctx, 0, -40 + jaw * 16, 12, 6 + jaw * 4, '#c2485a', null); ctx.restore();
    for (let i = -2; i <= 2; i++) path(ctx, `M ${i * 9} -49 L ${i * 9 + 4} ${-43 + jaw * (ss ? 18 : 14)} L ${i * 9 + 8} -49 Z`, '#fbf6e2', INK, .8);
    if (rage > .05) {
      ctx.save(); ctx.globalAlpha *= .35 + .45 * rage;
      for (let i = 0; i < 6; i++) ellipse(ctx, Math.sin(i * 2.1 + (t || 0) * 4) * 42, -66 + Math.cos(i * 1.7 + (t || 0) * 3) * 42, 4.5, 4.5, glow, null);
      ctx.restore();
    }
    ctx.restore();
    if (s.wet > 0) for (let i = 0; i < 4; i++) ellipse(ctx, i * 11 - 18, -14 + ((t || 0) * 10 + i * 5) % 20, 1.4, 2.4, '#bfe8f2', null);
    celHatch(ctx, s, [-48, -144, 96, 142], '#183f3c', ss ? 18 : 15);
  }

  // ---- Nông nghiệp: cây, dụng cụ, đạo cụ và vật nuôi -------------------------
  function mixColor(a, b, u) {
    const x = rgbOf(a), y = rgbOf(b);
    return `rgb(${x.map((v, i) => Math.round(mix(v, y[i], clamp(u)))).join(',')})`;
  }
  // Bị cắt (cut): phần dưới vết cắt đứng yên, phần trên ngã sang phải theo cut.
  function withCut(ctx, s, cutY, draw) {
    const c = clamp(s.cut || 0);
    if (c <= .01) { draw(); return; }
    ctx.save(); ctx.beginPath(); ctx.rect(-400, cutY, 800, 600); ctx.clip(); draw(); ctx.restore();
    ctx.save(); ctx.translate(0, cutY); ctx.rotate(c * 1.25); ctx.translate(c * 6, -cutY);
    ctx.beginPath(); ctx.rect(-400, -600, 800, 600 + cutY); ctx.clip(); draw(); ctx.restore();
    ellipse(ctx, 0, cutY, 7, 2.2, '#f3ecc4', INK, 1);
  }
  function blade(ctx, x0, tip, color, width = 2.2) {
    const cx = x0 + (tip[0] - x0) * .3, cy = tip[1] * .62;
    path(ctx, `M ${x0 - width} 0 Q ${cx - width * .7} ${cy} ${tip[0]} ${tip[1]} Q ${cx + width * .7} ${cy} ${x0 + width} 0 Z`, color, INK, 1.1);
  }
  function drawRice(ctx, s, t) {
    const g = clamp(s.growth), ripe = clamp((g - .6) / .4), bend = s.bend || 0, seed = hash(s.id) % 7;
    const H = 42 + 52 * g, sway = Math.sin(t * 1.6 + seed) * 2.5;
    ctx.save(); ctx.globalAlpha *= .45; ellipse(ctx, 0, 0, 32, 5, '#6d5236', null); ctx.restore();
    withCut(ctx, s, -26, () => {
      for (let i = 0; i < 11; i++) {
        const u = i / 10 - .5, x0 = u * 14;
        const tip = [u * 62 + bend * 36 + sway * (.5 + Math.abs(u)), -H * (.72 + .28 * Math.cos(u * 3)) * (1 - .3 * bend)];
        blade(ctx, x0, tip, mixColor(i % 2 ? '#5fae48' : '#4f9a3e', i % 2 ? '#e1bf4e' : '#caa43c', ripe));
      }
      if (g > .4) {
        const count = Math.min(4, 1 + Math.round((g - .4) * 7));
        for (let k = 0; k < count; k++) {
          const side = k % 2 ? 1 : -1, x0 = side * (2 + k * 2), top = [x0 + bend * 30 + sway, -H * .92];
          const end = [top[0] + side * (14 + k * 3) + bend * 12, -H * (.62 - .12 * ripe)];
          path(ctx, `M ${x0} ${-H * .5} Q ${x0} ${top[1]} ${top[0]} ${top[1]} Q ${end[0] - side * 4} ${top[1]} ${end[0]} ${end[1]}`, null, mixColor('#6fae48', '#b99436', ripe), 1.5);
          for (let j = 1; j <= 7; j++) {
            const v = j / 7, x = mix(top[0], end[0], v), y = mix(top[1], end[1], v * v) - Math.sin(v * Math.PI) * 4;
            ellipse(ctx, x, y, 2.3, 3.5, mixColor('#a9cf62', '#f0cf55', ripe), tone(mixColor('#6fae48', '#b99436', ripe), -.3), .6, side * (.4 + v));
          }
        }
      }
    });
  }
  function drawCorn(ctx, s, t) {
    const g = clamp(s.growth), bend = s.bend || 0, H = 55 + 40 * g, sway = Math.sin(t * 1.3 + hash(s.id) % 5) * 1.5;
    const topX = bend * 22 + sway;
    withCut(ctx, s, -30, () => {
      path(ctx, `M 0 0 Q ${topX * .3} ${-H * .5} ${topX} ${-H}`, null, INK, 8.6);
      path(ctx, `M 0 0 Q ${topX * .3} ${-H * .5} ${topX} ${-H}`, null, '#79b24e', 6);
      for (let i = 1; i < 6; i++) { const y = -i * H / 6, x = topX * (i / 6) ** 1.6; line(ctx, [[x - 3.5, y], [x + 3.5, y]], '#4f8a36', 1.4); }
      for (let i = 0; i < 6; i++) {
        const side = i % 2 ? 1 : -1, y = -12 - i * H / 7.2, x = topX * (-y / H) ** 1.6, len = 30 + 8 * g - i * 2;
        const tip = [x + side * len + bend * 10 + sway, y + 16 - i];
        path(ctx, `M ${x} ${y} Q ${x + side * len * .5} ${y - 22} ${tip[0]} ${tip[1]} Q ${x + side * len * .45} ${y - 12} ${x} ${y + 5} Z`, volume(ctx, x + side * 15, y - 8, 20, 10, '#62ab48'), INK, 1.3);
        path(ctx, `M ${x} ${y + 2} Q ${x + side * len * .48} ${y - 16} ${tip[0]} ${tip[1]}`, null, '#a8d680', .9);
      }
      if (g > .25) {
        const k = clamp((g - .25) / .75), ex = 8 + topX * .3, ey = -52;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(.45);
        if (g > .8) ellipse(ctx, 0, -10 - 6 * k, 4, 6, '#f2cf55', INK, 1);
        ellipse(ctx, 0, 0, 5 + 3 * k, 12 + 8 * k, volume(ctx, 0, 0, 8, 18, '#86bf58'), INK, 1.4);
        path(ctx, `M 0 ${-12 - 8 * k} q -4 -8 -9 -9 M 0 ${-12 - 8 * k} q 3 -8 6 -10`, null, '#a8653a', 1.4);
        ctx.restore();
      }
      if (g > .5) for (let i = -2; i <= 2; i++) path(ctx, `M ${topX} ${-H} Q ${topX + i * 5} ${-H - 10} ${topX + i * 9} ${-H - 6 + Math.abs(i) * 3}`, null, '#cfb466', 1.6);
    });
  }
  function drawSunflower(ctx, s, t) {
    const g = clamp(s.growth), bloom = clamp((g - .3) / .7), tilt = Math.sin(t * 1.2 + hash(s.id) % 5) * .05;
    withCut(ctx, s, -40, () => {
      path(ctx, 'M 0 0 Q -7 -40 0 -72', null, INK, 6); path(ctx, 'M 0 0 Q -7 -40 0 -72', null, '#5aa347', 3.8);
      leaf(ctx, -4, -30, .75 + .25 * g, -1.1, '#5fae48'); leaf(ctx, -2, -48, .65 + .2 * g, 1.1, '#5fae48');
      ctx.save(); ctx.translate(0, -80); ctx.rotate(tilt);
      if (bloom <= .01) {
        ellipse(ctx, 0, 0, 9, 11, volume(ctx, 0, 0, 9, 11, '#6fb24c'), INK, 1.4);
        for (const a of [-.6, 0, .6]) path(ctx, `M 0 6 Q ${Math.sin(a) * 12} -2 ${Math.sin(a) * 6} -10`, null, '#4f8f3a', 1.4);
      } else {
        const r0 = 9 + 7 * bloom, len = 6 + 14 * bloom;
        for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 16; i++) {
          const a = (i + ring * .5) / 16 * TAU;
          ctx.save(); ctx.rotate(a); ellipse(ctx, 0, -(r0 + len * .5), 4 + 2 * bloom, len * .6, volume(ctx, 0, -(r0 + len * .5), 5, len * .6, ring ? '#f2b92b' : '#f7cf3a'), INK, 1.1); ctx.restore();
        }
        ellipse(ctx, 0, 0, r0 + 1, r0 + 1, volume(ctx, 0, 0, r0, r0, '#7a4a22', .25, -.35), INK, 1.6);
        for (let i = 0; i < 30; i++) { const a = i * 2.4, r = Math.sqrt(i / 30) * r0 * .85; ellipse(ctx, Math.cos(a) * r, Math.sin(a) * r, .9, .9, '#3a2412', null); }
      }
      ctx.restore();
    });
  }
  function drawBanana(ctx, s, t) {
    const g = clamp(s.growth), sway = Math.sin(t * 1.1 + hash(s.id) % 5) * .05;
    withCut(ctx, s, -34, () => {
      for (let i = 0; i < 6; i++) {
        const a = -2.6 + i * .45 + sway * (i % 2 ? 1 : -1), L = 34 + 10 * g + (i % 3) * 4;
        ctx.save(); ctx.translate(0, -62); ctx.rotate(a + Math.PI / 2); ctx.scale(L / 54, 1);
        const d = 'M 0 0 C 8 -6 12 -30 6 -54 L -2 -54 C -10 -34 -8 -10 0 0 Z';
        path(ctx, d, volume(ctx, 2, -28, 10, 28, i % 2 ? '#5fae48' : '#6cb853'), INK, 1.5);
        line(ctx, [[0, -2], [2, -52]], '#b9dd8a', 1.2);
        for (let k = 1; k < 4; k++) line(ctx, [[2, -12 * k], [9, -12 * k - 5]], '#3f7d33', .9);
        ctx.restore();
      }
      path(ctx, 'M -9 0 Q -8 -34 -6 -64 L 6 -64 Q 8 -34 9 0 Z', cylinder(ctx, -9, 9, '#93b25c'), INK, 1.8);
      for (let i = 0; i < 4; i++) path(ctx, `M ${-6 + i * 4} -6 Q ${-5 + i * 4} -30 ${-4 + i * 3} -60`, null, '#6f7f3a', .9);
      if (g > .2) {
        const k = clamp((g - .2) / .8), fruit = mixColor('#7fb24a', '#f2cf45', clamp((g - .7) / .3));
        path(ctx, 'M 2 -62 Q 16 -64 17 -50 L 18 -30', null, INK, 3.6); path(ctx, 'M 2 -62 Q 16 -64 17 -50 L 18 -30', null, '#8aa04c', 2);
        for (let r = 0; r < 1 + Math.round(k * 3); r++) for (let b = -2; b <= 2; b++) {
          const x = 17 + b * 3.4, y = -52 + r * 7, len = 5 + 3 * k;
          limb(ctx, [[x, y], [x + b * 1.6 + len * .5, y - len * .5], [x + b * 2.2 + len * .7, y - len * 1.2]], fruit, 2.6 + k);
        }
        ellipse(ctx, 19, -26, 4.5, 7.5, volume(ctx, 19, -26, 4.5, 7.5, '#8a2f5e'), INK, 1.2, .1);
      }
    });
  }
  function drawCabbage(ctx, s) {
    const g = clamp(s.growth), r = 15 + 11 * g, spread = .7 + .3 * g;
    withCut(ctx, s, -8, () => {
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * .1 + i / 8 * Math.PI * 1.2 + Math.PI * (i % 2 ? .02 : 0), cx = Math.cos(a + Math.PI) * 26 * spread, cy = -26 - Math.sin(a) * -16 * spread;
        const rx = 20 * spread, ry = 15 * spread, rot = a + Math.PI / 2;
        path(ctx, `M ${cx - Math.cos(rot) * rx} ${cy - Math.sin(rot) * rx} Q ${cx + Math.sin(rot) * ry * 1.4} ${cy - Math.cos(rot) * ry * 1.4} ${cx + Math.cos(rot) * rx} ${cy + Math.sin(rot) * rx} Q ${cx - Math.sin(rot) * ry * 1.1} ${cy + Math.cos(rot) * ry * 1.1} ${cx - Math.cos(rot) * rx} ${cy - Math.sin(rot) * rx} Z`, volume(ctx, cx, cy, rx, ry, i % 2 ? '#5fa54c' : '#4f9442'), INK, 1.3);
        line(ctx, [[cx * .3, -28], [cx * 1.25, cy + (cy + 26) * .3]], '#a6d67f', 1);
      }
      ellipse(ctx, 0, -32, r, r * .95, volume(ctx, 0, -32, r, r, '#b3db84', .3, -.2), INK, 1.8);
      for (const side of [-1, 1]) path(ctx, `M ${side * r * .95} ${-32 + r * .3} Q ${side * r * .2} ${-32 - r * .2} ${side * r * .15} ${-32 - r * .95}`, null, '#7fb35c', 1.4);
      path(ctx, `M ${-r * .6} ${-32 + r * .75} Q 0 ${-32 + r * .2} ${r * .6} ${-32 + r * .75}`, null, '#86ba60', 1.2);
    });
  }
  function drawCarrot(ctx, s, t) {
    const g = clamp(s.growth), L = 28 + 34 * g, sway = Math.sin(t * 1.5 + hash(s.id) % 5) * .06;
    const shown = clamp(Math.max(s.roots || 0, (s.lift || 0) / 50));
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * .32 + sway, len = 26 + 30 * g - Math.abs(i - 2) * 5;
      const tip = [Math.cos(a) * len, -16 + Math.sin(a) * len];
      line(ctx, [[0, -16], tip], INK, 3); line(ctx, [[0, -16], tip], '#5aa347', 1.6);
      leaf(ctx, tip[0], tip[1], .32 + .12 * g, a + Math.PI / 2, '#62b24c', true);
      leaf(ctx, tip[0] * .6, -16 + (tip[1] + 16) * .6, .24, a + Math.PI / 2 + (i % 2 ? .7 : -.7), '#58a444', true);
    }
    const body = `M -13 -16 Q -14 ${L * .35} 0 ${L} Q 14 ${L * .35} 13 -16 Z`;
    if (shown > .01) {
      ctx.save(); ctx.globalAlpha *= shown;
      path(ctx, body, volume(ctx, -2, L * .2, 14, L * .6, '#ee8a2a', .3, -.25), INK, 1.8);
      for (let k = 1; k < 6; k++) { const y = -10 + k * L / 6, w = 11 * (1 - k / 6.5); line(ctx, [[-w, y], [-w * .3, y + 1.5]], '#c4641c', 1.1); }
      for (const side of [-1, 1]) line(ctx, [[side * 8, L * .45], [side * 13, L * .5]], '#d9b98a', .8);
      ctx.restore();
    }
    ctx.save(); ctx.clip(new Path2D('M -30 -40 L 30 -40 L 30 0 L -30 0 Z'));
    path(ctx, body, volume(ctx, -2, -8, 14, 10, '#f09232', .3, -.2), INK, 1.8);
    ctx.restore();
    if (shown < .99) line(ctx, [[-15, 0], [15, 0]], '#6d5236', 2.4 * (1 - shown));
  }
  function drawGrassTuft(ctx, s, t) {
    const g = clamp(s.growth ?? 1);
    const H = 18 + 36 * g;
    const bend = s.bend || 0, seed = hash(s.id) % 7;
    const sway = Math.sin(t * 1.8 + seed) * 1.8;
    ctx.save(); ctx.globalAlpha *= .35; ellipse(ctx, 0, 0, 26, 4.5, '#5d4628', null); ctx.restore();
    withCut(ctx, s, -8, () => {
      const blades = 15;
      for (let i = 0; i < blades; i++) {
        const u = i / (blades - 1) - .5;
        const x0 = u * 18;
        const curve = u * 42 + bend * 22 + sway * (.6 + Math.abs(u));
        const len = H * (0.68 + 0.32 * Math.cos(u * 2.7));
        const tip = [x0 + curve, -len];
        const color = i % 2 ? '#5fae48' : '#4d983c';
        blade(ctx, x0, tip, color, 2.2);
      }
    });
  }
  const FLOWER_SPECS = {
    rose: { petals: 12, shape: 'cup', layers: 3, colors: ['#c92236', '#e03046', '#f25066'], center: 'dots', stem: 'straight', leaves: 4 },
    lotus: { petals: 14, shape: 'pointed', layers: 2, colors: ['#ea7896', '#fcd2dc', '#f6b840'], center: 'disk', stem: 'straight', leaves: 2 },
    tulip: { petals: 6, shape: 'cup', layers: 2, colors: ['#e83040', '#f46070', '#f6c840'], center: 'stamens', stem: 'straight', leaves: 2 },
    daisy: { petals: 18, shape: 'round', layers: 1, colors: ['#ffffff', '#f4f6fa', '#f8b820'], center: 'disk', stem: 'straight', leaves: 2 },
    marigold: { petals: 28, shape: 'ruffled', layers: 3, colors: ['#e86018', '#f28e20', '#f8ba24'], center: 'disk', stem: 'straight', leaves: 4 },
    hibiscus: { petals: 5, shape: 'heart', layers: 1, colors: ['#d81e34', '#ea3850', '#ffd840'], center: 'stamens', stem: 'straight', leaves: 3 },
    orchid: { petals: 5, shape: 'pointed', layers: 1, colors: ['#8a3a96', '#d894e6', '#f6d840'], center: 'dots', stem: 'arched', leaves: 2 },
    peach_blossom: { petals: 5, shape: 'round', layers: 1, colors: ['#e85a86', '#fca0be', '#f6d870'], center: 'stamens', stem: 'branch', leaves: 2 },
    apricot_blossom: { petals: 5, shape: 'round', layers: 1, colors: ['#e8a818', '#ffd43a', '#e87820'], center: 'stamens', stem: 'branch', leaves: 2 },
    lily: { petals: 6, shape: 'pointed', layers: 2, colors: ['#f6ede4', '#ff849a', '#74341e'], center: 'stamens', stem: 'straight', leaves: 3 },
  };

  function drawFlower(ctx, s, t, spec) {
    const g = clamp(s.growth);
    const bloom = clamp((g - 0.3) / 0.7);
    const tilt = Math.sin(t * 1.5 + (hash(s.id) % 7)) * 0.06;
    const bodyColor = s.style.body || spec.colors[0];
    const innerColor = s.style.accent || spec.colors[1];
    const centerColor = spec.colors[2];

    withCut(ctx, s, -40, () => {
      // 1. Stem & foliage
      if (spec.stem === 'branch') {
        path(ctx, 'M 0 0 Q 6 -35 -4 -65 Q -10 -78 2 -95', null, INK, 5.2);
        path(ctx, 'M 0 0 Q 6 -35 -4 -65 Q -10 -78 2 -95', null, '#583e26', 3.4);
        path(ctx, 'M -2 -46 Q 10 -56 16 -66', null, INK, 3.8);
        path(ctx, 'M -2 -46 Q 10 -56 16 -66', null, '#583e26', 2.2);
        leaf(ctx, -6, -38, 0.45 + 0.15 * g, -0.9, '#529a36');
        leaf(ctx, 10, -52, 0.4 + 0.15 * g, 0.8, '#529a36');
      } else if (spec.stem === 'arched') {
        path(ctx, 'M 0 0 Q -4 -40 10 -70 Q 20 -86 16 -96', null, INK, 5);
        path(ctx, 'M 0 0 Q -4 -40 10 -70 Q 20 -86 16 -96', null, '#4a8c38', 3);
        leaf(ctx, -6, -26, 0.7 + 0.2 * g, -1.2, '#3f8230');
        leaf(ctx, 4, -42, 0.65 + 0.2 * g, 1.1, '#3f8230');
      } else {
        path(ctx, 'M 0 0 Q -5 -40 0 -76', null, INK, 5.5);
        path(ctx, 'M 0 0 Q -5 -40 0 -76', null, '#569e38', 3.4);
        if (s.asset === 'rose') {
          for (const [ty, side] of [[-16, -1], [-28, 1], [-42, -1], [-56, 1]]) {
            path(ctx, `M ${side * 2} ${ty} L ${side * 7} ${ty - 2} L ${side * 2} ${ty + 4} Z`, '#6a3424', INK, 0.8);
          }
        }
        if (s.asset === 'lotus') {
          ellipse(ctx, -38, 2, 28, 7, volume(ctx, -38, 2, 28, 7, '#3d8636'), INK, 1.4);
          ellipse(ctx, 38, 2, 26, 7, volume(ctx, 38, 2, 26, 7, '#3d8636'), INK, 1.4);
          for (const lx of [-38, 38]) {
            for (let i = 0; i < 6; i++) {
              const a = i * TAU / 6;
              line(ctx, [[lx, 2], [lx + Math.cos(a) * 22, 2 + Math.sin(a) * 5]], '#2c6a28', 1);
            }
          }
        }
        if (spec.leaves >= 2) {
          leaf(ctx, -4, -32, 0.65 + 0.25 * g, -1.0, '#529a36');
          leaf(ctx, 2, -48, 0.6 + 0.2 * g, 1.0, '#529a36');
        }
      }

      // 2. Extra secondary blossoms for branch / arched flowers
      if (spec.stem === 'branch') {
        if (g > 0.35) {
          ctx.save(); ctx.translate(16, -66); ctx.rotate(0.35 + tilt);
          const bg = clamp((g - 0.35) / 0.65);
          drawSingleFlowerHead(ctx, bg, spec, bodyColor, innerColor, centerColor);
          ctx.restore();
        }
        if (g > 0.65) {
          ctx.save(); ctx.translate(-4, -65); ctx.rotate(-0.4 + tilt);
          const bg = clamp((g - 0.65) / 0.35);
          drawSingleFlowerHead(ctx, bg, spec, bodyColor, innerColor, centerColor);
          ctx.restore();
        }
      } else if (spec.stem === 'arched') {
        if (g > 0.4) {
          ctx.save(); ctx.translate(10, -60); ctx.rotate(0.2 + tilt);
          const bg = clamp((g - 0.4) / 0.6);
          drawSingleFlowerHead(ctx, bg, spec, bodyColor, innerColor, centerColor);
          ctx.restore();
        }
        if (g > 0.7) {
          ctx.save(); ctx.translate(0, -42); ctx.rotate(-0.25 + tilt);
          const bg = clamp((g - 0.7) / 0.3);
          drawSingleFlowerHead(ctx, bg, spec, bodyColor, innerColor, centerColor);
          ctx.restore();
        }
      }

      // 3. Main bloom at [0, -82]
      ctx.save(); ctx.translate(0, -82); ctx.rotate(tilt);
      drawSingleFlowerHead(ctx, bloom, spec, bodyColor, innerColor, centerColor);
      ctx.restore();
    });
  }

  function drawSingleFlowerHead(ctx, bloom, spec, bodyColor, innerColor, centerColor) {
    if (bloom <= 0.01) {
      // Bud
      ellipse(ctx, 0, 0, 7, 12, volume(ctx, 0, 0, 7, 12, bodyColor), INK, 1.4);
      for (const a of [-0.5, 0, 0.5]) {
        path(ctx, `M 0 6 Q ${Math.sin(a) * 9} -2 ${Math.sin(a) * 5} -12`, null, '#4a8e32', 1.4);
      }
      return;
    }

    const r = 10 + 16 * bloom, len = 12 + 20 * bloom;

    if (spec.shape === 'cup') {
      if (spec.layers >= 3) {
        for (let l = 0; l < 3; l++) {
          const lr = r * (0.55 + l * 0.22);
          const col = l === 0 ? innerColor : l === 1 ? bodyColor : tone(bodyColor, -0.15);
          for (let p = 0; p < 4; p++) {
            const a = p * TAU / 4 + l * 0.45;
            const px = Math.cos(a) * lr * 0.6, py = Math.sin(a) * lr * 0.6;
            ellipse(ctx, px, py, lr * 0.65, lr * 0.85, volume(ctx, px, py, lr * 0.65, lr * 0.85, col), INK, 1.2, a);
          }
        }
        ellipse(ctx, 0, 0, 4, 4, centerColor, null);
      } else {
        for (const side of [-1, 1]) {
          path(ctx, `M 0 8 Q ${side * 24 * bloom} -4 ${side * 12 * bloom} ${-len} Q ${side * 4} -10 0 8 Z`, volume(ctx, side * 10, -len * 0.5, 14, len * 0.5, innerColor), INK, 1.3);
        }
        path(ctx, `M ${-14 * bloom} 6 Q 0 -6 ${14 * bloom} 6 Q ${8 * bloom} ${-len * 1.05} 0 ${-len * 0.9} Q ${-8 * bloom} ${-len * 1.05} ${-14 * bloom} 6 Z`, volume(ctx, 0, -len * 0.5, 16, len * 0.5, bodyColor), INK, 1.5);
      }
    } else if (spec.shape === 'pointed') {
      const petals = spec.petals || 6;
      for (let layer = 0; layer < (spec.layers || 1); layer++) {
        const lr = len * (layer === 0 ? 0.85 : 1);
        const col = layer === 0 ? bodyColor : innerColor;
        for (let i = 0; i < petals; i++) {
          const a = i * TAU / petals + (layer * Math.PI / petals);
          ctx.save(); ctx.rotate(a);
          const pw = 7 + 5 * bloom;
          path(ctx, `M 0 0 Q ${-pw} ${-lr * 0.5} 0 ${-lr} Q ${pw} ${-lr * 0.5} 0 0 Z`, volume(ctx, 0, -lr * 0.5, pw, lr * 0.5, col), INK, 1.2);
          if (spec.center === 'stamens') {
            for (let k = 1; k <= 3; k++) ellipse(ctx, (k % 2 ? -1.5 : 1.5), -lr * 0.25 - k * 3, 1, 1, '#5a2216', null);
          }
          ctx.restore();
        }
      }
      if (spec.center === 'disk') {
        ellipse(ctx, 0, 0, 8 * bloom, 8 * bloom, volume(ctx, 0, 0, 8, 8, centerColor), INK, 1.3);
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5;
          ellipse(ctx, Math.cos(a) * 4 * bloom, Math.sin(a) * 4 * bloom, 1.3, 1.3, '#3a2810', null);
        }
      } else if (spec.center === 'stamens') {
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6;
          const sx = Math.cos(a) * 14 * bloom, sy = Math.sin(a) * 14 * bloom;
          line(ctx, [[0, 0], [sx, sy]], '#d4e280', 1.2);
          ellipse(ctx, sx, sy, 2, 3, centerColor, null, 1, a);
        }
      }
    } else if (spec.shape === 'heart') {
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5;
        ctx.save(); ctx.rotate(a);
        const pw = 16 * bloom, pl = len * 1.05;
        path(ctx, `M 0 0 C ${-pw} ${-pl * 0.4} ${-pw * 0.8} ${-pl} 0 ${-pl * 0.9} C ${pw * 0.8} ${-pl} ${pw} ${-pl * 0.4} 0 0 Z`, volume(ctx, 0, -pl * 0.5, pw, pl * 0.5, bodyColor), INK, 1.3);
        ctx.restore();
      }
      path(ctx, `M 0 0 Q 3 -12 6 ${-len * 0.85}`, null, INK, 3.2);
      path(ctx, `M 0 0 Q 3 -12 6 ${-len * 0.85}`, null, '#ea3448', 2);
      for (let i = 0; i < 7; i++) {
        const sy = -len * 0.5 - i * 3, sx = (i % 2 ? -3 : 3) + i * 0.4;
        ellipse(ctx, sx, sy, 1.5, 1.5, centerColor, null);
      }
    } else if (spec.shape === 'ruffled') {
      for (let layer = 0; layer < 3; layer++) {
        const count = 10 + layer * 6;
        const lr = r * (0.55 + layer * 0.22);
        const col = layer === 0 ? innerColor : layer === 1 ? bodyColor : tone(bodyColor, -0.15);
        for (let i = 0; i < count; i++) {
          const a = i * TAU / count + (layer * 0.3);
          const px = Math.cos(a) * lr, py = Math.sin(a) * lr;
          ellipse(ctx, px, py, 4.5 * bloom, 6.5 * bloom, volume(ctx, px, py, 5, 7, col), INK, 0.9, a);
        }
      }
      ellipse(ctx, 0, 0, 6 * bloom, 6 * bloom, centerColor, null);
    } else {
      const count = spec.petals || 5;
      for (let i = 0; i < count; i++) {
        const a = i * TAU / count;
        ctx.save(); ctx.rotate(a);
        // Hoa 5–6 cánh (đào, mai): cánh bầu theo chiều dài; hoa nhiều cánh (cúc): cánh mảnh nhưng không mất nét.
        const pw = spec.shape === 'round' && count > 10 ? Math.max(1.8, 3.5 * bloom) : count <= 6 ? len * .42 : 8 * bloom;
        ellipse(ctx, 0, -len * 0.55, pw, len * 0.5, volume(ctx, 0, -len * 0.55, pw, len * 0.5, bodyColor), INK, 1.1);
        ctx.restore();
      }
      if (spec.center === 'disk') {
        ellipse(ctx, 0, 0, 8 * bloom, 8 * bloom, volume(ctx, 0, 0, 8, 8, centerColor), INK, 1.3);
        for (let i = 0; i < 7; i++) ellipse(ctx, Math.sin(i * 2.1) * 4 * bloom, Math.cos(i * 1.8) * 4 * bloom, 1.2, 1.2, '#b88210', null);
      } else {
        ellipse(ctx, 0, 0, 4 * bloom, 4 * bloom, centerColor, null);
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5;
          line(ctx, [[0, 0], [Math.cos(a) * 6 * bloom, Math.sin(a) * 6 * bloom]], '#8a5e18', 1);
          ellipse(ctx, Math.cos(a) * 7 * bloom, Math.sin(a) * 7 * bloom, 1.2, 1.2, '#f6c830', null);
        }
      }
    }
  }

  const FARM_PLANTS = {
    rice_plant: drawRice,
    corn_plant: drawCorn,
    sunflower: drawSunflower,
    banana_tree: drawBanana,
    cabbage: drawCabbage,
    carrot: drawCarrot,
    grass_tuft: drawGrassTuft,
    rose: (ctx, s, t) => drawFlower(ctx, s, t, FLOWER_SPECS.rose),
    lotus: (ctx, s, t) => drawFlower(ctx, s, t, FLOWER_SPECS.lotus),
    tulip: (ctx, s, t) => drawFlower(ctx, s, t, FLOWER_SPECS.tulip),
    daisy: (ctx, s, t) => drawFlower(ctx, s, t, FLOWER_SPECS.daisy),
    marigold: (ctx, s, t) => drawFlower(ctx, s, t, FLOWER_SPECS.marigold),
    hibiscus: (ctx, s, t) => drawFlower(ctx, s, t, FLOWER_SPECS.hibiscus),
    orchid: (ctx, s, t) => drawFlower(ctx, s, t, FLOWER_SPECS.orchid),
    peach_blossom: (ctx, s, t) => drawFlower(ctx, s, t, FLOWER_SPECS.peach_blossom),
    apricot_blossom: (ctx, s, t) => drawFlower(ctx, s, t, FLOWER_SPECS.apricot_blossom),
    lily: (ctx, s, t) => drawFlower(ctx, s, t, FLOWER_SPECS.lily),
  };
  function drawScarecrow(ctx, s, t) {
    const shirt = s.style.shirt || '#c0504d', flutter = Math.sin(t * 2.2 + hash(s.id) % 5);
    path(ctx, 'M -3 0 L -3 -72 L 3 -72 L 3 0 Z', cylinder(ctx, -3, 3, '#8a6437'), INK, 1.5);
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const a = side * (.2 + i * .22) + flutter * .05;
      line(ctx, [[side * 42, -62], [side * (46 + Math.cos(a) * 9), -62 + Math.sin(i - 2) * 6]], '#e0c05a', 1.6);
    }
    line(ctx, [[-44, -62], [44, -62]], INK, 6); line(ctx, [[-44, -62], [44, -62]], '#9a7040', 3.6);
    for (const side of [-1, 1]) path(ctx, `M ${side * 14} -69 L ${side * 42} -68 L ${side * 42} -56 L ${side * 16} -54 Z`, volume(ctx, side * 28, -62, 14, 8, shirt), INK, 1.6);
    path(ctx, 'M -16 -69 L 16 -69 L 18 -30 L -18 -30 Z', volume(ctx, 0, -50, 20, 22, shirt), INK, 1.8);
    ctx.save(); ctx.clip(new Path2D('M -16 -69 L 16 -69 L 18 -30 L -18 -30 Z'));
    for (let i = -3; i <= 3; i++) { line(ctx, [[i * 6, -70], [i * 6, -28]], tone(shirt, -.25), 1); line(ctx, [[-20, -64 + (i + 3) * 6], [20, -64 + (i + 3) * 6]], tone(shirt, .2), 1); }
    ctx.restore();
    path(ctx, 'M 2 -52 L 12 -52 L 12 -42 L 2 -42 Z', '#6a8fb3', INK, 1.1);
    for (let i = -3; i <= 3; i++) line(ctx, [[i * 5, -30], [i * 5.6 + flutter, -21]], '#e0c05a', 1.6);
    ellipse(ctx, 0, -80, 13, 13, volume(ctx, 0, -80, 13, 13, '#d9c08a'), INK, 1.6);
    path(ctx, 'M -12 -76 Q 0 -72 12 -76', null, tone('#d9c08a', -.35), .8);
    ellipse(ctx, 0, -91, 24, 5, volume(ctx, 0, -91, 24, 5, '#e3c46a'), INK, 1.6);
    path(ctx, 'M -12 -92 Q -12 -106 0 -106 Q 12 -106 12 -92 Z', volume(ctx, 0, -99, 12, 8, '#e8cc78'), INK, 1.6);
    line(ctx, [[-12, -94], [12, -94]], '#c0504d', 2.4);
  }
  function drawBasket(ctx, s) {
    const body = s.style.body || '#c99a5a', shape = 'M -46 -46 Q -44 -6 -24 -2 L 24 -2 Q 44 -6 46 -46 Z';
    ellipse(ctx, 0, -46, 46, 8, '#5f4126', INK, 1.6);
    if (s.fill > .01) {
      const colors = ['#e0452f', '#f0a13a', '#6fae48', '#f2cf45'];
      for (let i = 0; i < Math.ceil(s.fill * 14); i++) {
        const x = -34 + (i * 29) % 68, y = -48 - (i % 3) * 5 * s.fill - Math.sin(x / 70 * Math.PI + Math.PI / 2) * 8 * s.fill;
        ellipse(ctx, x, y, 7, 6.5, volume(ctx, x, y, 7, 6.5, colors[i % 4]), INK, 1.1);
      }
    }
    path(ctx, shape, cylinder(ctx, -46, 46, body), INK, 2);
    ctx.save(); ctx.clip(new Path2D(shape));
    for (let i = -10; i <= 10; i++) { line(ctx, [[i * 9, -50], [i * 9 + 30, 0]], tone(body, -.22), 1.3); line(ctx, [[i * 9, -50], [i * 9 - 30, 0]], tone(body, .18), 1.1); }
    ctx.restore();
    path(ctx, 'M -46 -46 Q 0 -34 46 -46', null, INK, 5.4); path(ctx, 'M -46 -46 Q 0 -34 46 -46', null, '#a8773f', 3.4);
  }
  function drawQuadLeg(ctx, s, lx, near, off, walk, stride, spec, bodyColor) {
    const phase = stride + off;
    const swingK = spec.legSwing || 8, liftK = spec.legLift || 5;
    const swing = Math.sin(phase) * walk * swingK;
    const lift = Math.max(0, -Math.cos(phase)) * walk * liftK;
    const topY = spec.legTop || -34;
    const midY = topY + (spec.legLen || 34) * 0.48;
    const footY = -2 - lift;
    const legCol = near ? (spec.legColor || bodyColor) : tone(spec.legColor || bodyColor, -0.25);
    const midX = lx + swing * 0.4, footX = lx + swing;
    limb(ctx, [[lx, topY], [midX, midY], [footX, footY]], legCol, spec.legWidth || 8);
    const hoofCol = spec.hoofColor || '#2a2422';
    if (spec.hoof === 'trotter') {
      ellipse(ctx, footX - 1.8, footY + 1, (spec.legWidth || 8) * 0.32, 3.2, hoofCol, INK, 1);
      ellipse(ctx, footX + 1.8, footY + 1, (spec.legWidth || 8) * 0.32, 3.2, hoofCol, INK, 1);
    } else if (spec.hoof === 'paw') {
      const pawR = (spec.legWidth || 8) * 0.72;
      ellipse(ctx, footX + 1.2, footY + 0.8, pawR, pawR * 0.55, legCol, INK, 1.1);
      line(ctx, [[footX - 1, footY - 1], [footX - 1, footY + 2]], tone(legCol, -0.2), 0.9);
      line(ctx, [[footX + 2, footY - 1], [footX + 2, footY + 2]], tone(legCol, -0.2), 0.9);
    } else {
      const hw = (spec.legWidth || 8) * 0.75;
      ellipse(ctx, footX + 1, footY + 0.6, hw, hw * 0.52, hoofCol, INK, 1.1);
    }
  }
  function drawQuadTail(ctx, s, t, spec, bodyColor) {
    const seed = hash(s.id) % 11;
    const id = s.asset;
    if (spec.tail === 'curly') {
      const [tx, ty] = [-50, -56];
      const coil = Math.sin(t * 5 + seed) * 0.15;
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(coil);
      path(ctx, 'M 0 0 C -7 -6 -14 2 -6 8 C 2 12 10 2 0 -2 C -5 -4 -6 -1 -3 1', null, INK, 3.5);
      path(ctx, 'M 0 0 C -7 -6 -14 2 -6 8 C 2 12 10 2 0 -2 C -5 -4 -6 -1 -3 1', null, bodyColor, 2);
      ctx.restore();
    } else if (spec.tail === 'puff') {
      const [tx, ty] = id === 'rabbit' ? [-26, -22] : [-44, -62];
      const r = id === 'rabbit' ? 7 : 8.5;
      ellipse(ctx, tx, ty, r, r * 0.9, volume(ctx, tx, ty, r, r * 0.9, id === 'rabbit' ? '#ffffff' : '#f0ece0'), INK, 1.4);
    } else if (spec.tail === 'thin') {
      if (id === 'mouse') {
        const sway = Math.sin(t * 3.5) * 5;
        limb(ctx, [[-24, -14], [-32, -18 + sway * 0.5], [-42, -10 + sway]], '#d4a8a8', 2.2);
      } else {
        const sway = Math.sin(t * 2.2) * 6;
        limb(ctx, [[-38, -52], [-44 + sway * 0.3, -64], [-40 + sway * 0.7, -76], [-46 + sway, -84]], bodyColor, 4.5);
      }
    } else if (spec.tail === 'cat') {
      // Đuôi mèo: dài, cong chữ J lên trên, đốt cuối sẫm màu.
      const sway = Math.sin(t * 2.2) * 5;
      const pts = [[-32, -50], [-46, -54], [-52 + sway * .3, -68], [-46 + sway, -84]];
      limb(ctx, pts, bodyColor, 5);
      ellipse(ctx, pts[3][0], pts[3][1], 3.4, 4.2, tone(bodyColor, -.32), null, 1, .3);
    } else if (spec.tail === 'bushy') {
      if (id === 'dog') {
        const speed = s.expression === 'happy' ? 18 : 3.5;
        const wag = Math.sin(t * speed) * (s.expression === 'happy' ? 14 : 7);
        limb(ctx, [[-38, -56], [-44 + wag * 0.5, -66], [-42 + wag, -76]], bodyColor, 5.5);
      } else if (id === 'horse') {
        const sway = Math.sin(t * 2.6) * 6;
        path(ctx, `M -48 -66 Q ${-56 + sway * 0.5} -50 ${-54 + sway} -24 Q ${-50 + sway} -20 -46 -58 Z`, volume(ctx, -50, -45, 10, 25, spec.tailColor || '#2c180e'), INK, 1.4);
      }
    } else if (spec.tail === 'tuft') {
      if (id === 'goat') {
        const wag = Math.sin(t * 3) * 3;
        path(ctx, `M -38 -64 Q -44 -68 ${-42 + wag} -76 Q -38 -72 -36 -64 Z`, volume(ctx, -40, -70, 5, 8, bodyColor), INK, 1.2);
      } else {
        const [tx, ty] = id === 'buffalo' ? [-58, -64] : [-56, -62];
        const tailPts = [[tx, ty], [tx - 8 + Math.sin(t * 2.2) * 3, ty + 14], [tx - 6 + Math.sin(t * 2.2 + 0.8) * 6, ty + 30]];
        limb(ctx, tailPts, bodyColor, 2.4);
        ellipse(ctx, tailPts[2][0], tailPts[2][1] + 3, 3.6, 6, spec.tailColor || '#2e2a28', INK, 1.1);
      }
    }
  }
  function drawQuadBody(ctx, s, t, spec, bodyColor) {
    if (spec.pattern === 'fluffy') {
      const wool = spec.color || '#f7f5ea';
      const puffs = [
        [-34, -58, 16], [-20, -68, 18], [-2, -70, 19], [16, -64, 17],
        [24, -48, 16], [14, -36, 17], [-6, -34, 18], [-26, -38, 17],
        [-38, -48, 16], [-10, -52, 22]
      ];
      ellipse(ctx, -8, -52, 38, 22, volume(ctx, -8, -52, 38, 22, wool, .25, -.2), INK, 2);
      for (const [px, py, pr] of puffs) {
        ellipse(ctx, px, py, pr, pr * 0.88, volume(ctx, px, py, pr, pr * 0.88, wool, .28, -.15), INK, 1.4);
      }
      return;
    }
    const bodyBox = spec.bodyBox || [-8, -60, 50, 26];
    path(ctx, spec.body, volume(ctx, bodyBox[0], bodyBox[1], bodyBox[2], bodyBox[3], bodyColor, .25, -.28), INK, 2.2);
    if (spec.belly) {
      path(ctx, `M ${bodyBox[0] - 25} ${bodyBox[1] + 20} Q ${bodyBox[0]} ${bodyBox[1] + 28} ${bodyBox[0] + 25} ${bodyBox[1] + 20}`, null, spec.belly, 3.5);
    }
    if (spec.pattern === 'spots') {
      ctx.save(); ctx.clip(new Path2D(spec.body));
      const spotColor = spec.spotColor || '#231f20';
      ellipse(ctx, -32, -68, 14, 11, spotColor, null, 1, 0.3);
      ellipse(ctx, -8, -52, 16, 13, spotColor, null, 1, -0.2);
      ellipse(ctx, 16, -72, 12, 10, spotColor, null, 1, 0.4);
      ellipse(ctx, 10, -36, 10, 8, spotColor, null, 1, 0.1);
      ctx.restore();
      path(ctx, spec.body, null, INK, 2.2);
    } else if (spec.pattern === 'stripes') {
      ctx.save(); ctx.clip(new Path2D(spec.body));
      const stripeCol = '#454950';
      for (let i = -4; i <= 2; i++) {
        const sx = i * 9;
        path(ctx, `M ${sx} -72 Q ${sx + 4} -52 ${sx - 2} -30`, null, stripeCol, 2.2);
      }
      ctx.restore();
      path(ctx, spec.body, null, INK, 2.2);
    }
  }
  function drawQuadHead(ctx, s, t, spec, bodyColor) {
    const id = s.asset;
    const seed = hash(s.id) % 7;
    const earTwitch = Math.sin(t * 3.5 + seed) * 0.06;
    if (spec.head) {
      const hb = spec.headBox || [40, -60, 18, 20];
      path(ctx, spec.head, volume(ctx, hb[0], hb[1], hb[2], hb[3], spec.headColor || bodyColor, .28, -.25), INK, 2);
    }
    if (spec.horns === 'short') {
      path(ctx, 'M 36 -78 Q 38 -94 30 -92 Q 36 -88 40 -76 Z', volume(ctx, 35, -86, 6, 9, '#eae1cc'), INK, 1.4);
      path(ctx, 'M 44 -78 Q 48 -96 42 -94 Q 46 -88 46 -76 Z', volume(ctx, 45, -88, 6, 9, '#eae1cc'), INK, 1.4);
    } else if (spec.horns === 'curved') {
      path(ctx, 'M 44 -82 Q 44 -106 24 -104 Q 38 -100 38 -78 Z', volume(ctx, 38, -96, 8, 12, '#dfd5bc'), INK, 1.5);
      path(ctx, 'M 36 -80 Q 22 -104 4 -94 Q 18 -96 30 -74 Z', volume(ctx, 20, -92, 14, 10, '#e8dfc8'), INK, 1.5);
    } else if (spec.horns === 'goat') {
      path(ctx, 'M 28 -78 Q 24 -98 12 -96 Q 22 -92 34 -76 Z', volume(ctx, 24, -88, 8, 14, '#b4a58e'), INK, 1.4);
      path(ctx, 'M 32 -76 Q 30 -100 20 -98 Q 28 -94 38 -74 Z', volume(ctx, 28, -90, 8, 14, '#c8bba6'), INK, 1.4);
      for (let i = 0; i < 3; i++) line(ctx, [[24 - i * 3, -84 - i * 4], [28 - i * 3, -82 - i * 4]], tone('#b4a58e', -.3), 1.1);
    }
    if (spec.ears === 'floppy') {
      const earCol = spec.earColor || bodyColor;
      const ex = spec.earPos ? spec.earPos[0] : 31, ey = spec.earPos ? spec.earPos[1] : -68;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(earTwitch + 0.4);
      ellipse(ctx, 0, 0, 7.5, 4, volume(ctx, 0, 0, 7.5, 4, earCol), INK, 1.2);
      ctx.restore();
    } else if (spec.ears === 'pointy') {
      const [ex, ey] = spec.earPos || [34, -76];
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(earTwitch);
      path(ctx, 'M -4 2 L 0 -14 L 6 2 Z', volume(ctx, 0, -6, 5, 8, bodyColor), INK, 1.3);
      path(ctx, 'M -2 1 L 0 -10 L 4 1 Z', '#f5b5b5', null);
      ctx.restore();
    } else if (spec.ears === 'long') {
      const [ex, ey] = [14, -58];
      for (const [dx, ang] of [[-4, -0.15 + earTwitch], [4, 0.15 + earTwitch]]) {
        ctx.save(); ctx.translate(ex + dx, ey); ctx.rotate(ang);
        path(ctx, 'M -4 0 C -7 -18 -6 -38 0 -42 C 6 -38 7 -18 4 0 Z', volume(ctx, 0, -21, 6, 21, '#ffffff'), INK, 1.4);
        path(ctx, 'M -2 -4 C -4 -16 -3 -32 0 -36 C 3 -32 4 -16 2 -4 Z', '#f7b8c4', null);
        ctx.restore();
      }
    } else if (spec.ears === 'drop') {
      // Tai cụp rủ xuống cạnh đầu (chó).
      const [ex, ey] = spec.earPos || [26, -78], earCol = spec.earColor || tone(bodyColor, -.25);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(.18 + earTwitch * .6);
      path(ctx, 'M -5 0 C -9 8 -8 20 -2 24 C 4 26 7 18 6 8 C 5 2 1 -1 -5 0 Z', volume(ctx, 0, 12, 7, 13, earCol), INK, 1.4);
      ctx.restore();
    } else if (spec.ears === 'round') {
      const [ex, ey] = [16, -30];
      ellipse(ctx, ex, ey, 7, 7, volume(ctx, ex, ey, 7, 7, bodyColor), INK, 1.3);
      ellipse(ctx, ex, ey, 4.5, 4.5, '#f4b8b8', null);
    }
    if (spec.snout) {
      const { x, y, rx, ry, color, nostrils } = spec.snout;
      ellipse(ctx, x, y, rx, ry, volume(ctx, x, y, rx, ry, color), INK, 1.4);
      if (nostrils) {
        for (const nx of [x - rx * 0.35, x + rx * 0.35]) {
          ellipse(ctx, nx, y, 1.4, 2, INK, null);
        }
      }
    }
  }
  // Cúi đầu (graze): đầu + sừng + tai + mõm xoay quanh điểm cổ, anchor mouth/face/horn xoay theo
  // (localAnchor) nên mặt và điểm tiếp xúc đi cùng đầu. Góc dương = cúi xuống khi quay mặt sang phải.
  const HEAD_ANCHORS = new Set(['mouth', 'face', 'horn']);
  function neckPivot(spec) {
    if (spec.neckPivot) return spec.neckPivot;
    const m = /M\s*(-?[\d.]+)\s+(-?[\d.]+)/.exec(spec.head || '');
    return m ? [Number(m[1]), Number(m[2]) + 6] : [30, -66];
  }
  // Vươn cổ tới trước và hạ xuống theo độ cúi: gặm cỏ phía trước chân trước, không dưới bụng, và
  // mõm xuống tới ngọn cỏ mà đầu không phải dựng đứng.
  function neckReach(spec, angle) { return (spec.neckReach ?? 18) * Math.sin(angle); }
  function neckDrop(spec, angle) { return (spec.neckDrop ?? 26) * Math.sin(angle); }
  function headPoint(spec, angle, [x, y]) {
    const [px, py] = neckPivot(spec), c = Math.cos(angle), sn = Math.sin(angle);
    return [px + neckReach(spec, angle) + (x - px) * c - (y - py) * sn, py + neckDrop(spec, angle) + (x - px) * sn + (y - py) * c];
  }
  // Góc cúi để anchor mouth (local) xuống tới độ cao localY; tìm nhị phân, tất định.
  function headAngleFor(spec, mouth, localY) {
    let lo = 0, hi = 1.35;
    if (headPoint(spec, hi, mouth)[1] <= localY) return hi;
    if (mouth[1] >= localY) return 0;
    for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (headPoint(spec, mid, mouth)[1] < localY) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function drawQuadruped(ctx, s, t, spec) {
    const bodyColor = s.style.body || spec.color;
    const walk = s.walk || 0, stride = s.stride || 0;
    const id = s.asset;
    const hop = id === 'rabbit' ? walk * -Math.abs(Math.sin(stride)) * 6 : 0;
    const waddle = id === 'pig' ? Math.sin(stride) * walk * 0.04 : 0;
    ctx.save();
    ctx.translate(0, hop);
    if (waddle) ctx.rotate(waddle);
    for (const [lx, near, off] of spec.legs) {
      if (near !== 0) continue;
      drawQuadLeg(ctx, s, lx, near, off, walk, stride, spec, bodyColor);
    }
    drawQuadTail(ctx, s, t, spec, bodyColor);
    drawQuadBody(ctx, s, t, spec, bodyColor);
    if (spec.extras) spec.extras(ctx, s, t, bodyColor, 'under');
    for (const [lx, near, off] of spec.legs) {
      if (near !== 1) continue;
      drawQuadLeg(ctx, s, lx, near, off, walk, stride, spec, bodyColor);
    }
    const down = s.head_down || 0;
    if (down) {
      const [px, py] = neckPivot(spec);
      // Khối cổ lấp khe giữa thân và đầu khi đầu xoay xuống.
      const hb = spec.headBox || [40, -60, 18, 20], r = Math.max(7, hb[3] * .55), reach = neckReach(spec, down), drop = neckDrop(spec, down);
      limb(ctx, [[px - 8, py - 4], [px + reach * .55, py + drop * .45], [px + reach, py + drop]], spec.headColor || bodyColor, r * 1.9);
      ctx.save(); ctx.translate(px + reach, py + drop); ctx.rotate(down); ctx.translate(-px, -py);
    }
    drawQuadHead(ctx, s, t, spec, bodyColor);
    if (spec.extras) spec.extras(ctx, s, t, bodyColor, 'over');
    if (down) ctx.restore();
    ctx.restore();
  }
  const BUFFALO_SPEC = {
    color: '#5f6872',
    legs: [[-40, 0, 0], [22, 0, Math.PI], [-30, 1, Math.PI], [32, 1, 0]],
    legTop: -34, legLen: 34, legWidth: 9, hoof: 'hoof', hoofColor: '#2e2a28',
    tail: 'tuft',
    body: 'M -58 -60 Q -62 -84 -32 -86 L 18 -86 Q 42 -84 44 -62 Q 44 -36 24 -30 L -44 -30 Q -60 -36 -58 -60 Z',
    bodyBox: [-8, -66, 52, 26],
    head: 'M 30 -76 Q 44 -86 58 -74 Q 68 -58 64 -46 Q 60 -36 50 -38 Q 36 -44 30 -76 Z',
    headBox: [48, -62, 18, 22],
    snout: { x: 58, y: -45, rx: 9, ry: 7, color: '#9aa0a6', nostrils: true },
    ears: 'floppy', earPos: [31, -71],
    horns: 'curved'
  };
  const COW_SPEC = {
    color: '#f5f3ec', pattern: 'spots', spotColor: '#231f20',
    legs: [[-38, 0, 0], [20, 0, Math.PI], [-28, 1, Math.PI], [30, 1, 0]],
    legTop: -34, legLen: 34, legWidth: 8.5, hoof: 'hoof', hoofColor: '#2e2a28',
    tail: 'tuft', tailColor: '#24201e',
    body: 'M -56 -60 Q -60 -84 -30 -86 L 16 -86 Q 40 -84 42 -62 Q 42 -36 22 -30 L -42 -30 Q -58 -36 -56 -60 Z',
    bodyBox: [-8, -66, 52, 26],
    head: 'M 26 -74 Q 38 -86 52 -74 Q 62 -58 58 -46 Q 54 -36 44 -38 Q 32 -44 26 -74 Z',
    headBox: [44, -62, 18, 22],
    snout: { x: 56, y: -48, rx: 9.5, ry: 7, color: '#f3b4b8', nostrils: true },
    ears: 'floppy', earPos: [30, -70], earColor: '#f5f3ec', horns: 'short',
    extras: (ctx, s, t, bodyColor, pass) => {
      if (pass === 'under') {
        ellipse(ctx, -6, -30, 9, 6.5, volume(ctx, -6, -30, 9, 6.5, '#f4b8b8'), INK, 1.2);
        for (const tx of [-11, -7, -4, 0]) {
          line(ctx, [[tx, -25], [tx, -21]], '#f4b8b8', 2.2);
          ellipse(ctx, tx, -21, 1.1, 1.1, tone('#f4b8b8', -0.1), null);
        }
      }
    }
  };
  const PIG_SPEC = {
    color: '#fbaab8', belly: '#f599aa',
    legs: [[-34, 0, 0], [18, 0, Math.PI], [-24, 1, Math.PI], [26, 1, 0]],
    legTop: -24, legLen: 24, legWidth: 8, hoof: 'trotter', hoofColor: '#8f4654',
    tail: 'curly',
    body: 'M -50 -48 Q -52 -72 -24 -74 L 14 -74 Q 38 -70 42 -50 Q 44 -26 20 -22 L -34 -22 Q -50 -26 -50 -48 Z',
    bodyBox: [-6, -50, 48, 24],
    head: 'M 22 -62 Q 34 -72 48 -60 Q 56 -46 52 -38 Q 44 -30 36 -32 Q 26 -38 22 -62 Z',
    headBox: [40, -52, 16, 18],
    snout: { x: 52, y: -44, rx: 8, ry: 6.5, color: '#f3899d', nostrils: true },
    ears: 'floppy', earPos: [26, -64], earColor: '#f898aa', horns: null
  };
  const GOAT_SPEC = {
    color: '#e8e4db', belly: '#d6d0c4',
    legs: [[-28, 0, 0], [14, 0, Math.PI], [-20, 1, Math.PI], [22, 1, 0]],
    legTop: -32, legLen: 32, legWidth: 6.5, hoof: 'hoof', hoofColor: '#3a322c',
    tail: 'tuft',
    body: 'M -40 -56 Q -42 -76 -20 -78 L 12 -78 Q 28 -74 32 -56 Q 34 -34 16 -30 L -30 -30 Q -42 -36 -40 -56 Z',
    bodyBox: [-6, -58, 38, 24],
    head: 'M 18 -68 Q 28 -82 40 -74 Q 48 -62 44 -52 Q 38 -46 30 -48 Q 22 -52 18 -68 Z',
    headBox: [34, -64, 15, 18],
    snout: { x: 42, y: -58, rx: 6.5, ry: 5.5, color: '#baa892', nostrils: true },
    ears: 'floppy', earPos: [22, -68], earColor: '#ded8cd', horns: 'goat',
    extras: (ctx, s, t, bodyColor, pass) => {
      if (pass === 'over') {
        const wag = Math.sin(t * 4) * 2;
        path(ctx, `M 38 -52 L ${36 + wag} -40 L 42 -52 Z`, '#dcd4c6', INK, 1.1);
      }
    }
  };
  const SHEEP_SPEC = {
    color: '#f8f6ea', pattern: 'fluffy', legColor: '#302b28',
    legs: [[-30, 0, 0], [14, 0, Math.PI], [-20, 1, Math.PI], [22, 1, 0]],
    legTop: -32, legLen: 32, legWidth: 6, hoof: 'hoof', hoofColor: '#1c1816',
    headColor: '#342e2b',
    head: 'M 22 -62 Q 32 -72 44 -64 Q 50 -52 46 -44 Q 38 -38 30 -40 Q 24 -46 22 -62 Z',
    headBox: [36, -56, 14, 16],
    snout: { x: 44, y: -48, rx: 6, ry: 4.5, color: '#25201e', nostrils: true },
    ears: 'floppy', earPos: [26, -60], earColor: '#342e2b', horns: null, tail: 'puff'
  };
  const HORSE_SPEC = {
    color: '#8f5029', belly: '#7c401d',
    legs: [[-36, 0, 0], [16, 0, Math.PI], [-26, 1, Math.PI], [26, 1, 0]],
    legTop: -40, legLen: 40, legWidth: 7, hoof: 'hoof', hoofColor: '#201c1a',
    tail: 'bushy', tailColor: '#26150b', maneColor: '#26150b',
    body: 'M -50 -60 Q -52 -80 -24 -80 L 14 -80 Q 34 -78 38 -62 Q 40 -44 22 -40 L -38 -40 Q -50 -44 -50 -60 Z',
    bodyBox: [-6, -62, 46, 22],
    // Cổ dài vươn lên rồi mặt dài chúc xuống phía trước; cả khối xoay quanh gốc cổ khi cúi ăn cỏ.
    head: 'M 16 -72 C 18 -88 24 -98 36 -102 C 48 -105 58 -96 66 -84 C 72 -76 70 -68 62 -67 C 56 -67 50 -72 46 -76 C 42 -70 40 -64 36 -60 L 22 -62 Z',
    neckPivot: [24, -66], neckReach: 10,
    headBox: [44, -86, 22, 20],
    snout: { x: 65, y: -73, rx: 6.5, ry: 5.5, color: '#5a3418', nostrils: true },
    ears: 'pointy', earPos: [38, -103], earColor: '#8f5029', horns: null,
    extras: (ctx, s, t, bodyColor, pass) => {
      if (pass !== 'over') return;
      const walk = s.walk || 0;
      for (let i = 0; i < 6; i++) {
        const u = i / 5, mx = 20 + u * 16, my = -72 - u * 30;
        const wave = Math.sin(t * 7 + i + walk * 6) * 2.5;
        path(ctx, `M ${mx} ${my} Q ${mx - 9 + wave} ${my + 3} ${mx - 13 + wave} ${my + 11} Q ${mx - 4} ${my + 7} ${mx + 2} ${my + 2} Z`, volume(ctx, mx - 6, my + 5, 6, 6, '#26150b'), INK, 1.1);
      }
    }
  };
  const DOG_SPEC = {
    color: '#d99738', belly: '#e8b668',
    legs: [[-28, 0, 0], [14, 0, Math.PI], [-18, 1, Math.PI], [22, 1, 0]],
    legTop: -28, legLen: 28, legWidth: 6.5, hoof: 'paw',
    tail: 'bushy',
    body: 'M -40 -54 Q -42 -72 -18 -74 L 14 -74 Q 30 -70 34 -52 Q 36 -32 18 -26 L -28 -26 Q -40 -32 -40 -54 Z',
    bodyBox: [-6, -56, 38, 24],
    head: 'M 16 -66 Q 22 -84 38 -82 Q 48 -78 48 -68 Q 48 -58 40 -56 Q 28 -52 20 -56 Q 16 -60 16 -66 Z',
    headBox: [32, -70, 16, 16],
    // Mõm chó nhô ra, màu nhạt, mũi đen (khác mõm heo hồng có lỗ mũi).
    snout: { x: 49, y: -63, rx: 8, ry: 6, color: '#f0cf96', nostrils: false },
    ears: 'drop', earPos: [26, -78], earColor: '#8a5320', horns: null,
    extras: (ctx, s, t, bodyColor, pass) => {
      if (pass !== 'over') return;
      ellipse(ctx, 55, -66, 3.6, 3, volume(ctx, 55, -66, 3.6, 3, '#2a1d17', .5, -.2), INK, 1);
      path(ctx, 'M 50 -60 Q 53 -57 56 -59', null, INK, 1.1);
      if ((s.mouth || 0) > 0.1) {
        const pant = Math.sin(t * 10) * 1.5;
        path(ctx, `M 48 -59 Q 53 ${-52 + pant} 51 ${-47 + pant} Q 47 ${-49 + pant} 46 -58 Z`, '#f7788a', INK, 1.1);
      }
    }
  };
  const CAT_SPEC = {
    // Mèo mướp cam: lưng cong, eo thon, đầu tròn to, hai tai tam giác, đuôi dài uốn lên.
    color: '#e9a24f',
    legs: [[-24, 0, 0], [14, 0, Math.PI], [-16, 1, Math.PI], [20, 1, 0]],
    legTop: -32, legLen: 32, legWidth: 7, hoof: 'paw',
    tail: 'cat',
    body: 'M -36 -46 C -38 -62 -22 -68 -6 -66 C 10 -64 22 -66 28 -54 C 34 -42 24 -30 10 -30 L -22 -30 C -32 -30 -36 -38 -36 -46 Z',
    bodyBox: [-4, -48, 34, 19],
    head: 'M 16 -66 C 14 -80 26 -86 36 -84 C 48 -82 52 -70 48 -60 C 44 -52 34 -50 26 -52 C 18 -54 16 -60 16 -66 Z',
    headBox: [34, -68, 16, 16],
    neckPivot: [26, -54], neckReach: 12, neckDrop: 20,
    snout: { x: 47, y: -64, rx: 2.8, ry: 2.2, color: '#e5808f', nostrils: false },
    ears: null, horns: null,
    extras: (ctx, s, t, bodyColor, pass) => {
      const stripe = tone(bodyColor, -.32);
      if (pass === 'under') {
        ctx.save(); ctx.clip(new Path2D(CAT_SPEC.body));
        ellipse(ctx, 2, -30, 26, 9, '#f7dcb0', null);
        for (const x of [-26, -15, -4, 7]) path(ctx, `M ${x} -69 Q ${x + 4} -60 ${x + 1} -52`, null, stripe, 3.2);
        ctx.restore();
        return;
      }
      const twitch = Math.sin(t * 3) * .06;
      for (const [ex, ey, rot] of [[24, -79, -.35], [41, -82, .25]]) {
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(rot + twitch);
        path(ctx, 'M -6 3 L -1 -13 L 6 3 Z', volume(ctx, 0, -4, 6, 8, bodyColor), INK, 1.4);
        path(ctx, 'M -3 2 L -1 -8 L 3 2 Z', '#f3a9b3', null);
        ctx.restore();
      }
      for (const x of [29, 33, 37]) path(ctx, `M ${x} -84 L ${x} -79`, null, stripe, 1.8);
      const whisk = Math.sin(t * 4) * .8;
      for (let i = -1; i <= 1; i++) line(ctx, [[46, -61 + i * 2.2], [58, -63 + i * 4.5 + whisk]], '#5a4636', .9);
    }
  };
  const RABBIT_SPEC = {
    color: '#fbfaf6', belly: '#f0ece4',
    legs: [[-18, 0, 0], [12, 0, Math.PI], [-10, 1, Math.PI], [16, 1, 0]],
    legTop: -18, legLen: 18, legWidth: 5.5, hoof: 'paw',
    tail: 'puff',
    body: 'M -26 -36 Q -28 -56 -10 -58 L 10 -58 Q 24 -54 26 -38 Q 28 -18 12 -14 L -18 -14 Q -26 -18 -26 -36 Z',
    bodyBox: [0, -40, 26, 22],
    head: 'M 8 -46 Q 14 -60 26 -56 Q 32 -46 28 -38 Q 22 -32 16 -34 Q 10 -38 8 -46 Z',
    headBox: [20, -46, 12, 14],
    snout: { x: 26, y: -44, rx: 4.5, ry: 4, color: '#f5b8c2', nostrils: false },
    ears: 'long', earPos: [14, -58], horns: null,
    extras: (ctx, s, t, bodyColor, pass) => {
      if (pass === 'over') {
        const twitch = Math.sin(t * 6) * 0.6;
        for (let i = -1; i <= 1; i++) line(ctx, [[26, -44 + i * 2], [34, -46 + i * 3.5 + twitch]], '#ffffff', 0.8);
      }
    }
  };
  const MOUSE_SPEC = {
    color: '#8a7c74', belly: '#baa89e',
    legs: [[-14, 0, 0], [8, 0, Math.PI], [-8, 1, Math.PI], [12, 1, 0]],
    legTop: -10, legLen: 10, legWidth: 3.5, hoof: 'paw',
    tail: 'thin',
    body: 'M -24 -24 Q -26 -36 -8 -38 L 8 -38 Q 20 -34 22 -22 Q 24 -8 10 -6 L -16 -6 Q -24 -8 -24 -24 Z',
    bodyBox: [-2, -24, 22, 16],
    head: 'M 6 -24 Q 14 -34 26 -30 Q 34 -24 32 -18 Q 24 -14 18 -16 Q 10 -18 6 -24 Z',
    headBox: [20, -24, 12, 12],
    snout: { x: 34, y: -22, rx: 3, ry: 2.5, color: '#e8a4a8', nostrils: false },
    ears: 'round', earPos: [16, -30], earColor: '#8a7c74', horns: null,
    extras: (ctx, s, t, bodyColor, pass) => {
      if (pass === 'over') {
        const twitch = Math.sin(t * 8) * 0.8;
        for (let i = -1; i <= 1; i++) line(ctx, [[34, -22 + i * 2], [42, -24 + i * 4 + twitch]], '#dedede', 0.8);
      }
    }
  };
  const QUADRUPED_SPECS = { buffalo: BUFFALO_SPEC, cow: COW_SPEC, pig: PIG_SPEC, goat: GOAT_SPEC, sheep: SHEEP_SPEC, horse: HORSE_SPEC, dog: DOG_SPEC, cat: CAT_SPEC, rabbit: RABBIT_SPEC, mouse: MOUSE_SPEC };
  for (const [id, spec] of Object.entries(QUADRUPED_SPECS)) {
    RIG_DRAWERS[id] = (ctx, s, t) => drawQuadruped(ctx, s, t, spec);
  }
  function drawBuffalo(ctx, s, t) {
    drawQuadruped(ctx, s, t, BUFFALO_SPEC);
  }
  function drawBird(ctx, s, t, spec) {
    const bodyColor = s.style.body || spec.bodyColor;
    const walk = s.walk || 0, stride = s.stride || 0;
    const waddle = spec.waddle ? Math.sin(stride) * walk * 0.09 : 0;
    const hop = spec.hop ? walk * -Math.abs(Math.sin(stride)) * 3 : 0;
    ctx.save();
    ctx.translate(0, hop);
    if (waddle) ctx.rotate(waddle);
    const flying = Boolean(spec.flying || (spec.canFly && s.flying));
    if (!flying) {
      const legColor = spec.legs.color || '#e8a23a';
      const legW = spec.legs.width || (spec.legs.short ? 2.2 : 2.6);
      const legTopY = spec.legs.top || -36;
      for (const [x, off] of [[spec.legs.x[0], 0], [spec.legs.x[1], Math.PI]]) {
        const phase = stride + off;
        const swing = Math.sin(phase) * walk * (spec.legs.short ? 4 : 7);
        const lift = Math.max(0, -Math.cos(phase)) * walk * (spec.legs.short ? 3 : 5);
        const foot = [x + swing, -2 - lift];
        limb(ctx, [[x, legTopY], foot], legColor, legW);
        if (spec.legs.type === 'webbed') {
          path(ctx, `M ${foot[0] - 6} ${foot[1] + 1.5} L ${foot[0] + 6} ${foot[1] + 1.5} L ${foot[0] + 1} ${foot[1] - 3} Z`, legColor, INK, 1);
        } else {
          for (const d of [-5, 0, 6]) line(ctx, [foot, [foot[0] + d, foot[1] + 1.5]], legColor, 2);
        }
      }
    }
    if (spec.tail === 'fan') {
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.translate(-26, -62); ctx.rotate(-1.9 + i * .32 + Math.sin(t * 2 + i) * .03);
        path(ctx, 'M 0 0 Q -6 -14 0 -30 Q 6 -14 0 0 Z', volume(ctx, 0, -15, 5, 15, i % 2 ? '#2f4a3a' : '#3d5f3f'), INK, 1.2);
        ctx.restore();
      }
    } else if (spec.tail === 'long') {
      const colors = ['#1d3b32', '#9c241b', '#264a3e', '#b87322', '#142822'];
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.translate(-24, -64);
        const wave = Math.sin(t * 2.5 + i * 0.4) * 0.06;
        ctx.rotate(-2.2 + i * 0.28 + wave);
        path(ctx, 'M 0 0 Q -10 -24 0 -50 Q 8 -24 0 0 Z', volume(ctx, 0, -25, 7, 25, colors[i]), INK, 1.3);
        ctx.restore();
      }
    } else if (spec.tail === 'short') {
      const [tx, ty] = spec.tailPos || [-24, -50];
      path(ctx, `M ${tx} ${ty} Q ${tx - 12} ${ty - 10} ${tx - 16} ${ty - 2} Q ${tx - 8} ${ty + 4} ${tx} ${ty} Z`, volume(ctx, tx - 8, ty - 4, 8, 6, tone(bodyColor, -0.15)), INK, 1.2);
    }
    if (flying) {
      const flap = Math.sin(t * 38) * 0.45;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(0, (spec.body || [0, -54])[1]); ctx.rotate(side * (0.3 + flap));
        ellipse(ctx, side * 16, -10, 18, 8, volume(ctx, side * 16, -10, 18, 8, tone(bodyColor, -0.1)), INK, 1.3, side * 0.3);
        ctx.restore();
      }
    }
    const b = spec.body || [-4, -54, 28, 22, -0.15];
    ellipse(ctx, b[0], b[1], b[2], b[3], volume(ctx, b[0], b[1], b[2], b[3], bodyColor, .3, -.3), INK, 2, b[4]);
    if (spec.extras) spec.extras(ctx, s, t);
    if (!flying) {
      if (spec.wing) {
        ellipse(ctx, spec.wing[0], spec.wing[1], spec.wing[2], spec.wing[3], volume(ctx, spec.wing[0], spec.wing[1], spec.wing[2], spec.wing[3], spec.wingColor || tone(bodyColor, -.15)), INK, 1.4);
      } else {
        path(ctx, 'M -20 -58 Q 0 -68 10 -52 Q -4 -40 -20 -48 Z', volume(ctx, -6, -54, 14, 10, tone(bodyColor, -.15)), INK, 1.4);
        for (let i = 0; i < 3; i++) path(ctx, `M ${-14 + i * 6} -56 Q ${-10 + i * 6} -50 ${-14 + i * 6} -46`, null, tone(bodyColor, -.35), 1);
      }
    }
    const h = spec.head || [16, -74, 12.5];
    const stretch = spec.stretchOnMouth ? (s.mouth || 0) * 4 : 0;
    const hx = h[0], hy = h[1] - stretch, hr = h[2];
    ellipse(ctx, hx, hy, hr, hr, volume(ctx, hx, hy, hr, hr, spec.headColor || tone(bodyColor, .12)), INK, 1.8);
    if (spec.crest?.comb === 'large') {
      path(ctx, `M ${hx - 10} ${hy - hr + 2} Q ${hx - 12} ${hy - hr - 14} ${hx - 5} ${hy - hr - 10} Q ${hx} ${hy - hr - 18} ${hx + 5} ${hy - hr - 12} Q ${hx + 10} ${hy - hr - 20} ${hx + 14} ${hy - hr - 10} Q ${hx + 16} ${hy - hr + 2} ${hx + 12} ${hy - hr + 4} Z`, volume(ctx, hx + 2, hy - hr - 8, 12, 10, '#e03022'), INK, 1.4);
      ellipse(ctx, hx + 10, hy + hr + 2, 4.2, 7.5, '#e03022', INK, 1.1);
    } else if (spec.crest?.comb) {
      path(ctx, `M ${hx - 8} ${hy - hr} Q ${hx - 8} ${hy - hr - 10} ${hx - 3} ${hy - hr - 6} Q ${hx - 1} ${hy - hr - 13} ${hx + 3} ${hy - hr - 6} Q ${hx + 7} ${hy - hr - 11} ${hx + 8} ${hy - hr - 2} Z`, volume(ctx, hx, hy - hr - 6, 8, 5, '#e0402f'), INK, 1.3);
      ellipse(ctx, hx + 10, hy + hr - 1, 3, 5, '#e0402f', INK, 1);
    }
    if (spec.beak?.shape === 'flat') {
      path(ctx, `M ${hx + 8} ${hy + 1} Q ${hx + 24} ${hy} ${hx + 22} ${hy + 7} Q ${hx + 14} ${hy + 11} ${hx + 8} ${hy + 7} Z`, volume(ctx, hx + 15, hy + 4, 8, 5, spec.beak.color || '#f28522'), INK, 1.4);
      ellipse(ctx, hx + 12, hy + 3, 1.1, 1.4, INK, null);
    } else if (spec.beak) {
      const bColor = spec.beak.color || '#f2b233';
      const bx = hx + hr - 1.5, by = hy + 3;
      const bLen = spec.beak.len || 9, bH = spec.beak.h || 4.5;
      path(ctx, `M ${bx} ${by - bH} L ${bx + bLen} ${by} L ${bx} ${by + bH} Z`, volume(ctx, bx + bLen * 0.4, by, bLen * 0.5, bH, bColor), INK, 1.3);
    }
    ctx.restore();
  }
  const CHICKEN_SPEC = {
    bodyColor: '#d9893f',
    body: [-4, -54, 28, 22, -0.15],
    head: [16, -74, 12.5],
    crest: { comb: true },
    beak: { shape: 'short', color: '#f2b233', len: 9, h: 4.5 },
    tail: 'fan',
    legs: { color: '#e8a23a', x: [-8, 4], width: 2.6, type: 'thin' }
  };
  const ROOSTER_SPEC = {
    bodyColor: '#b83828', headColor: '#d84e32',
    body: [-4, -54, 28, 22, -0.15],
    head: [16, -76, 13],
    crest: { comb: 'large' },
    beak: { shape: 'short', color: '#f2b233', len: 10, h: 5 },
    tail: 'long',
    stretchOnMouth: true,
    legs: { color: '#e8a23a', x: [-8, 4], width: 2.8, type: 'thin' }
  };
  const DUCK_SPEC = {
    bodyColor: '#fbfbf5', headColor: '#fbfbf5',
    // Vịt: thân bầu thấp sát đất, cổ ngắn, chân ngắn có màng (không chân cao như cò).
    body: [-2, -30, 30, 17, -0.08],
    head: [20, -52, 12],
    wing: [-6, -32, 17, 9], wingColor: '#ecece0',
    beak: { shape: 'flat', color: '#f28522' },
    tail: 'short', tailPos: [-30, -36],
    waddle: true,
    legs: { color: '#ea7820', x: [-10, 6], width: 3.2, type: 'webbed', short: true, top: -16 }
  };
  const CHICK_SPEC = {
    bodyColor: '#fae348', headColor: '#fae348',
    body: [0, -32, 17, 16, 0],
    // Cánh riêng: cánh mặc định vẽ ở y≈-58 (gà lớn) sẽ nằm trên đầu gà con như cái mũ.
    wing: [-3, -30, 10, 7], wingColor: '#f2d13a',
    head: [6, -44, 9.5],
    beak: { shape: 'short', color: '#f29020', len: 6, h: 3 },
    tail: 'short', tailPos: [-16, -34],
    hop: true,
    legs: { color: '#f59e22', x: [-4, 4], width: 2.2, short: true, top: -20 }
  };
  const SPARROW_SPEC = {
    bodyColor: '#8a5c36', headColor: '#9a6a40',
    body: [0, -26, 16, 11, -0.25],
    head: [13, -38, 8.5],
    wing: [-3, -27, 12, 7], wingColor: '#6b4424',
    beak: { shape: 'short', color: '#38322c', len: 6, h: 2.8 },
    tail: 'short', tailPos: [-14, -24],
    canFly: true,
    legs: { color: '#8a6a4a', x: [-3, 3], width: 1.8, short: true, top: -16 },
    extras: (ctx, s) => {
      ellipse(ctx, 3, -21, 10, 5.5, 'rgba(240,226,200,.85)', null);
      for (let i = 0; i < 3; i++) path(ctx, `M ${-10 + i * 5} -30 Q ${-7 + i * 5} -26 ${-10 + i * 5} -23`, null, '#3e2614', 1);
    }
  };
  const BIRD_SPECS = { chicken: CHICKEN_SPEC, rooster: ROOSTER_SPEC, duck: DUCK_SPEC, chick: CHICK_SPEC, sparrow: SPARROW_SPEC };
  for (const [id, spec] of Object.entries(BIRD_SPECS)) {
    RIG_DRAWERS[id] = (ctx, s, t) => drawBird(ctx, s, t, spec);
  }
  function drawChicken(ctx, s, t) {
    drawBird(ctx, s, t, CHICKEN_SPEC);
  }
  function drawButterfly(ctx, s, t) {
    const flap = Math.abs(Math.sin(t * 9));
    const bodyColor = s.style.body || '#f47321', accent = s.style.accent || '#ffcc33';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 3, -50);
      ctx.scale(side * (0.2 + 0.8 * flap), 1);
      path(ctx, 'M 0 0 C 12 -28 32 -40 42 -30 C 50 -20 44 2 12 -2 Z', volume(ctx, 22, -18, 22, 20, bodyColor), INK, 1.4);
      path(ctx, 'M 4 -3 C 14 -20 28 -28 34 -20 C 40 -12 34 0 10 -2 Z', volume(ctx, 18, -12, 16, 14, accent), null);
      ellipse(ctx, 36, -26, 2.5, 2.5, '#ffffff', null);
      path(ctx, 'M 0 2 C 14 0 32 8 28 26 C 24 38 6 28 0 4 Z', volume(ctx, 14, 18, 16, 18, bodyColor), INK, 1.4);
      path(ctx, 'M 2 4 C 10 3 24 8 20 20 C 16 28 6 22 2 6 Z', volume(ctx, 12, 14, 12, 12, accent), null);
      ellipse(ctx, 24, 26, 2, 2, '#ffffff', null);
      ctx.restore();
    }
    path(ctx, 'M -2 -64 Q -8 -78 -14 -76', null, INK, 1.3);
    path(ctx, 'M 2 -64 Q 8 -78 14 -76', null, INK, 1.3);
    ellipse(ctx, 0, -48, 3.5, 18, volume(ctx, 0, -48, 3.5, 18, '#26201b'), INK, 1.2);
    ellipse(ctx, 0, -60, 4.5, 4.5, volume(ctx, 0, -60, 4.5, 4.5, '#1e1a16'), INK, 1.2);
  }
  function drawDragonfly(ctx, s, t) {
    const flutter = Math.sin(t * 60) * 0.22;
    ctx.save();
    for (const [side, ang] of [[-1, flutter], [1, -flutter]]) {
      ctx.save(); ctx.translate(14, -52); ctx.rotate(side * 0.15 + ang);
      ellipse(ctx, -14, side * 18, 22, 4.5, 'rgba(215,242,255,0.72)', '#5a8ca8', 0.9, -side * 0.2);
      ellipse(ctx, 6, side * 16, 20, 4.2, 'rgba(215,242,255,0.72)', '#5a8ca8', 0.9, side * 0.1);
      ctx.restore();
    }
    ctx.restore();
    for (let i = 0; i < 7; i++) {
      ellipse(ctx, 8 - i * 7.5, -50, 4.5 - i * 0.3, 3 - i * 0.2, volume(ctx, 8 - i * 7.5, -50, 4.5, 3, '#3182ce'), INK, 0.9);
    }
    ellipse(ctx, 16, -50, 8, 6, volume(ctx, 16, -50, 8, 6, '#2b6cb0'), INK, 1.3);
    ellipse(ctx, 28, -53, 5, 5, volume(ctx, 28, -53, 5, 5, '#38a169'), INK, 1.1);
    ellipse(ctx, 32, -47, 5, 5, volume(ctx, 32, -47, 5, 5, '#48bb78'), INK, 1.1);
  }
  function drawLadybug(ctx, s, t) {
    const gait = (s.gait || 0) * TAU;
    for (let i = 0; i < 3; i++) {
      const off = i * 0.8;
      const lx = -4 + i * 10;
      line(ctx, [[lx, -14], [lx - 4 + Math.sin(gait + off) * 4, -4]], INK, 1.8);
      line(ctx, [[lx, -24], [lx + 4 + Math.sin(gait + off + Math.PI) * 4, -30]], INK, 1.8);
    }
    ellipse(ctx, 6, -20, 18, 14, volume(ctx, 6, -20, 18, 14, '#e53e3e', .35, -.3), INK, 1.8);
    line(ctx, [[-12, -20], [24, -20]], INK, 1.4);
    const spots = [[-4, -26], [8, -27], [16, -24], [-4, -14], [8, -13], [16, -16], [0, -20]];
    for (const [sx, sy] of spots) ellipse(ctx, sx, sy, 2.4, 2.4, '#1c1c1e', null);
    ellipse(ctx, -2, -26, 5, 2, 'rgba(255,255,255,.45)', null, 1, -.3);
    ellipse(ctx, 22, -20, 6, 6, volume(ctx, 22, -20, 6, 6, '#1a202c'), INK, 1.2);
    ellipse(ctx, 24, -22, 1.4, 1.4, '#ffffff', null);
  }
  function drawAnt(ctx, s, t) {
    const gait = (s.gait || 0) * TAU;
    for (let i = 0; i < 3; i++) {
      const off = i * 0.9;
      const lx = 0 + i * 5;
      line(ctx, [[lx, -16], [lx - 3 + Math.sin(gait + off) * 4, -6], [lx - 4 + Math.sin(gait + off) * 4, -2]], INK, 1.5);
      line(ctx, [[lx, -22], [lx + 2 + Math.sin(gait + off + Math.PI) * 4, -28], [lx + 5 + Math.sin(gait + off + Math.PI) * 4, -34]], INK, 1.5);
    }
    ellipse(ctx, -14, -18, 12, 9, volume(ctx, -14, -18, 12, 9, '#261710'), INK, 1.4);
    ellipse(ctx, 4, -18, 6, 5, volume(ctx, 4, -18, 6, 5, '#3d251a'), INK, 1.2);
    ellipse(ctx, 20, -20, 8, 7, volume(ctx, 20, -20, 8, 7, '#261710'), INK, 1.3);
    path(ctx, 'M 24 -24 L 28 -34 L 36 -32', null, INK, 1.2);
    path(ctx, 'M 22 -25 L 24 -36 L 31 -37', null, INK, 1.1);
  }
  function drawCaterpillar(ctx, s, t) {
    const gait = (s.gait || 0) * TAU;
    for (let i = 0; i < 7; i++) {
      const wave = Math.sin(gait + i * 0.9) * 4;
      const cx = -34 + i * 9.5, cy = -18 + wave;
      ellipse(ctx, cx, cy, 6.5, 8, volume(ctx, cx, cy, 6.5, 8, i % 2 ? '#48bb78' : '#38a169'), INK, 1.2);
      ellipse(ctx, cx, cy - 3, 2, 2, '#ecc94b', null);
    }
    const headWave = Math.sin(gait + 7 * 0.9) * 4;
    ellipse(ctx, 33, -20 + headWave, 8, 8, volume(ctx, 33, -20 + headWave, 8, 8, '#2f855a'), INK, 1.4);
    line(ctx, [[35, -27 + headWave], [38, -34 + headWave]], INK, 1.2);
  }
  function drawFrog(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const hop = walk * -Math.abs(Math.sin(stride)) * 6;
    ctx.save();
    ctx.translate(0, hop);
    ellipse(ctx, -14, -12, 10, 8, volume(ctx, -14, -12, 10, 8, '#2f855a'), INK, 1.4, -0.4);
    ellipse(ctx, 20, -12, 10, 8, volume(ctx, 20, -12, 10, 8, '#2f855a'), INK, 1.4, 0.4);
    path(ctx, 'M -22 -2 L -12 -2 L -16 -8 Z', '#276749', INK, 1);
    path(ctx, 'M 14 -2 L 24 -2 L 18 -8 Z', '#276749', INK, 1);
    path(ctx, 'M -18 -16 Q -22 -36 0 -40 Q 22 -36 18 -16 Q 14 -4 -18 -4 Z', volume(ctx, 0, -22, 20, 18, '#38a169'), INK, 1.8);
    ellipse(ctx, 2, -18, 10, 12, '#fefcbf', null);
    const throatPuff = (s.mouth || 0) * 8 + Math.sin(t * 3) * 1.8;
    if (throatPuff > 0.5) {
      ellipse(ctx, 14 + throatPuff * 0.25, -26, 6 + throatPuff * 0.4, 5 + throatPuff * 0.35, '#fff9db', INK, 1);
    }
    ellipse(ctx, 0, -42, 6, 6, volume(ctx, 0, -42, 6, 6, '#48bb78'), INK, 1.4);
    ellipse(ctx, 14, -42, 6, 6, volume(ctx, 14, -42, 6, 6, '#48bb78'), INK, 1.4);
    ellipse(ctx, 1, -42, 2.5, 3.5, '#1a202c', null);
    ellipse(ctx, 15, -42, 2.5, 3.5, '#1a202c', null);
    ellipse(ctx, 2, -43, 1, 1, '#ffffff', null);
    ellipse(ctx, 16, -43, 1, 1, '#ffffff', null);
    ctx.restore();
  }
  // Trái cây / cây-hoa / dụng cụ / đạo cụ cũng đăng ký theo asset; hàm nhóm lo phần chung (tay chân, bổ đôi, rễ, hatch).
  for (const id of Object.keys(FRUIT_BODIES)) RIG_DRAWERS[id] = drawFruit;
  for (const id of Object.keys(FARM_PLANTS)) RIG_DRAWERS[id] = drawPlant;
  for (const id of Object.keys(TOOL_DRAWERS)) RIG_DRAWERS[id] = drawTool;
  for (const id of [...Object.keys(PROP_DRAWERS), 'scarecrow', 'basket']) RIG_DRAWERS[id] = drawProp;
  RIG_DRAWERS.butterfly = drawButterfly;
  RIG_DRAWERS.dragonfly = drawDragonfly;
  RIG_DRAWERS.ladybug = drawLadybug;
  RIG_DRAWERS.ant = drawAnt;
  RIG_DRAWERS.caterpillar = drawCaterpillar;
  RIG_DRAWERS.frog = drawFrog;
  function drawEarthworm(ctx, s, t) {
    const color = s.style.body || '#e59a9a', points = [];
    for (let x = -40; x <= 36; x += 4) points.push([x, -9 + Math.sin(x * .13 + t * 3 + (s.gait || 0) * TAU) * 4 * (1 - (x + 40) / 190)]);
    limb(ctx, points, color, 12);
    line(ctx, points.slice(1), tone(color, .3), 3);
    for (let i = 1; i < points.length - 1; i += 2) {
      const [x, y] = points[i];
      line(ctx, [[x, y - 5], [x + 1, y + 5]], tone(color, -.22), 1);
    }
    limb(ctx, points.slice(13, 16), '#d0707e', 12.5);
  }
  function drawSnail(ctx, s, t) {
    const stretch = 1 + Math.sin((s.gait || 0) * TAU) * .05;
    ctx.save(); ctx.scale(stretch, 1 / stretch);
    const body = s.style.body || '#e0bf78';
    for (const [x0, x1, y1] of [[34, 30, -56], [40, 48, -52]]) { line(ctx, [[x0, -34], [x1, y1]], INK, 4.4); line(ctx, [[x0, -34], [x1, y1]], body, 2.6); ellipse(ctx, x1, y1, 3, 3, '#3a2a1a', INK, .8); }
    path(ctx, 'M -40 -2 Q -36 -14 -10 -14 L 24 -16 Q 30 -40 40 -38 Q 50 -34 46 -14 Q 42 -2 30 -2 Z', volume(ctx, 10, -12, 40, 14, body, .3, -.25), INK, 1.8);
    const shell = s.style.accent || '#c98f32';
    ellipse(ctx, -6, -44, 28, 27, volume(ctx, -6, -44, 28, 27, shell, .35, -.35), INK, 2);
    let d = '';
    for (let a = 0; a <= 4 * Math.PI; a += .2) { const r = 25 * (1 - a / (4.6 * Math.PI)); d += `${d ? ' L' : 'M'} ${-6 + Math.cos(a) * r} ${-44 + Math.sin(a) * r}`; }
    path(ctx, d, null, tone(shell, -.4), 2);
    ctx.restore();
  }
  function drawBee(ctx, s, t) {
    const [, hover] = headOffset(s, t), flap = Math.sin(t * 50) * .35;
    ctx.save(); ctx.translate(0, hover);
    for (const [x, a] of [[-6, -.35 - flap], [6, .15 + flap]]) {
      ctx.save(); ctx.globalAlpha *= .75; ellipse(ctx, x, -68, 10, 18, 'rgba(220,240,255,.85)', '#7aa6c4', 1.2, a); ctx.restore();
    }
    for (const x of [-10, 0, 10]) line(ctx, [[x, -32], [x - 3, -24]], INK, 1.6);
    path(ctx, 'M -28 -44 L -38 -40 L -28 -37 Z', '#3a2e22', INK, 1);
    const shape = new Path2D(); shape.ellipse(-4, -44, 26, 17, 0, 0, TAU);
    ctx.fillStyle = volume(ctx, -4, -44, 26, 17, s.style.body || '#f2c230'); ctx.fill(shape);
    ctx.save(); ctx.clip(shape); for (const x of [-18, -6, 6]) path(ctx, `M ${x} -64 L ${x + 6} -64 L ${x + 6} -24 L ${x} -24 Z`, '#3a2e22', null); ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(shape);
    for (const [x1, y1] of [[20, -66], [28, -62]]) { path(ctx, `M 16 -56 Q ${x1 - 4} ${y1 + 2} ${x1} ${y1}`, null, INK, 1.4); ellipse(ctx, x1, y1, 1.8, 1.8, INK, null); }
    ellipse(ctx, 16, -48, 11.5, 11.5, volume(ctx, 16, -48, 11.5, 11.5, '#f6cf4a'), INK, 1.8);
    ctx.restore();
  }
  function drawAnimal(ctx, s, t) {
    const draw = { buffalo: drawBuffalo, chicken: drawChicken, earthworm: drawEarthworm, snail: drawSnail, bee: drawBee }[s.asset];
    if (draw) draw(ctx, s, t); else drawInsect(ctx, s);
  }
  function waterStream(ctx, snapshot, a, from, to) {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const age = (snapshot.t - a.start) * 1.6 - i / n;
      if (age < 0) continue;
      const u = age % 1, x = mix(from.x, to.x, u) + Math.sin(i * 7) * 10 * u, y = from.y + (to.y - from.y) * u * u + Math.sin(u * Math.PI) * -12;
      ellipse(ctx, x, y, 2.2, 3.6, '#a8e0f5', '#4f9ec0', .6);
    }
    ctx.save(); ctx.globalAlpha *= .5; ellipse(ctx, to.x, to.y, 22, 5, null, '#bfe8f5', 2); ctx.restore();
  }
  function burst(ctx, at, r, q) {
    ctx.save(); ctx.globalAlpha = (1 - q) * .95; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const ang = i * TAU / 8 + .2, r0 = r * (.35 + q * .6), r1 = r * (.7 + q * .9) * (i % 2 ? .7 : 1);
      ctx.strokeStyle = i % 2 ? '#ffe27a' : '#ffffff'; ctx.lineWidth = 4 * (1 - q) + 1;
      ctx.beginPath(); ctx.moveTo(at.x + Math.cos(ang) * r0, at.y + Math.sin(ang) * r0); ctx.lineTo(at.x + Math.cos(ang) * r1, at.y + Math.sin(ang) * r1); ctx.stroke();
    }
    ctx.restore();
  }
  function handMarks(ctx, s, cat) {
    if (s.material === 'clean') return;
    const group = cat.assets[s.asset].group;
    // Marks are generated once from actor + drawing id, never output time.
    // A held cel therefore holds both silhouette and stroke pattern on seek.
    let seed = hash(`${s.id}:${s.drawing_id || 'base'}`) || 1;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    ctx.save(); ctx.beginPath();
    if (group === 'fruit' || group === 'vegetable' || group === 'monster') ctx.ellipse(0, (group === 'fruit' || group === 'vegetable') ? -52 : -66, (group === 'fruit' || group === 'vegetable') ? 37 : 35, (group === 'fruit' || group === 'vegetable') ? 40 : 42, 0, 0, TAU);
    else if (group === 'human') ctx.rect(-22, -102, 44, 100);
    else if (group === 'plant') ctx.rect(-42, -105, 84, 105);
    else ctx.rect(-48, -105, 96, 105);
    ctx.clip();
    ctx.globalAlpha *= s.material === 'ink' ? .24 : .16;
    ctx.strokeStyle = s.material === 'ink' ? '#263c2c' : '#465048';
    ctx.lineWidth = s.material === 'ink' ? 1.35 : .7;
    const count = s.material === 'ink' ? 8 : 12;
    for (let i = 0; i < count; i++) {
      const x = -34 + random() * 68, y = -96 + random() * 84, length = 5 + random() * 12;
      ctx.beginPath(); ctx.moveTo(x - length, y + length * .28); ctx.lineTo(x + length, y - length * .28); ctx.stroke();
    }
    ctx.restore();
  }
  function drawActor(ctx, s, cat, t, useCels = false) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rotation * Math.PI / 180); ctx.scale(s.height / 100 * (s.flip ? -1 : 1), s.height / 100); ctx.globalAlpha = s.opacity;
    ctx.__remakeMaterial = { kind: s.material || 'clean', seed: hash(`${s.id}:${s.drawing_id || 'base'}`) };
    const group = cat.assets[s.asset].group;
    const layer = useCels ? celLayers.get(s.asset) : null;
    const shear = windShear(cat, s);
    if (shear) ctx.transform(1, 0, shear, 1, 0, 0);
    if (layer) {
      // Gốc vẫn là điểm neo đáy-giữa nên các điểm cầm / thả / pose giữ nguyên toạ độ.
      const h = 112, w = h * layer.width / layer.height;
      ctx.drawImage(layer, -w / 2, -h, w, h);
    } else if (RIG_DRAWERS[s.asset]) {
      RIG_DRAWERS[s.asset](ctx, s, t, cat);
    } else if (group === 'fruit' || group === 'vegetable') drawFruit(ctx, s, t);
    else if (group === 'plant') drawPlant(ctx, s, t);
    else if (group === 'human') drawHuman(ctx, s, cat, t);
    else if (group === 'tool') drawTool(ctx, s, t);
    else if (group === 'prop') drawProp(ctx, s, t);
    else if (group === 'animal') drawAnimal(ctx, s, t);
    else if (group === 'fish') {
      // Nước nhiễm độc nặng: cá nổi bụng (lật dọc quanh thân).
      if (s.toxic > .8) { ctx.translate(0, -48); ctx.scale(1, -1); ctx.translate(0, 48); }
      drawFish(ctx, s, t);
    }
    else if (group === 'monster') drawMonster(ctx, s, t);
    // Cel vẽ tay đã có sẵn mặt và bàn tay: vẽ thêm lớp vector sẽ thành hai khuôn mặt.
    if (!layer) { face(ctx, s, cat, t); handMarks(ctx, s, cat); }
    // Lớp vẽ sau khuôn mặt của rig (khẩu trang, kính lặn, kính mũ phi hành gia che lên mắt/miệng).
    if (!layer && RIG_OVERLAYS[s.asset]) RIG_OVERLAYS[s.asset](ctx, s, t, cat);
    if (s.wet > 0) for (let i = 0; i < 4; i++) ellipse(ctx, i * 9 - 16, -20 + (t * 8 + i * 4) % 17, 1.1, 2.2, '#70c8e0', null);
    ctx.restore();
  }
  function defaultSky(ctx, settings) {
    const night = settings.time === 'night', rain = settings.weather === 'rain' || settings.weather === 'storm';
    const snow = settings.weather === 'snow', hot = settings.weather === 'hot';
    ctx.fillStyle = night ? '#243750' : rain ? '#9dbac0' : snow ? '#d6e2e8' : hot ? '#f7e7b8' : '#c0eff1'; ctx.fillRect(-2000, -2000, 4500, 5000);
    if (hot && !night) { ellipse(ctx, 255, 110, 70, 70, 'rgba(255,214,110,.35)', null); ellipse(ctx, 255, 110, 44, 44, '#ffd24a', '#f0a92a', 3); }
    if (night) { ellipse(ctx, 460, 100, 28, 30, '#f3e3af', null); ellipse(ctx, 471, 91, 26, 27, '#243750', null); }
    else for (const [x, y] of [[90, 85], [420, 100]]) for (const [dx, dy, r] of [[-35, 5, 28], [0, -12, 38], [40, 2, 30]]) ellipse(ctx, x + dx, y + dy, r, r * .65, rain ? '#788f95' : '#fffdf1', null);
  }
  const BACKGROUNDS = {
    garden: {
      label: 'Vườn', theme: 'garden', ground_y: 810,
      draw(ctx, settings, t, kit) {
        defaultSky(ctx, settings);
        const night = settings.time === 'night';
        ctx.fillStyle = night ? '#345348' : '#bdd296';
        for (let i = 0; i < 12; i++) ellipse(ctx, i * 60, 760, 80, 100 + i % 3 * 30, ctx.fillStyle, null);
        ctx.fillStyle = '#c5a67e'; ctx.fillRect(-2000, 810, 4500, 2190);
        for (let i = 0; i < 35; i++) ellipse(ctx, (i * 113 + 20) % W, 830 + (i * 43) % 190, 8, 2, '#aa8864', null);
      }
    },
    orchard: {
      label: 'Cành cây / vườn quả', theme: 'farm', ground_y: 810,
      draw(ctx, settings, t, kit) {
        BACKGROUNDS.garden.draw(ctx, settings, t, kit);
        path(ctx, 'M -20 410 Q 280 350 610 407', null, '#705640', 18);
        for (let i = 0; i < 7; i++) leaf(ctx, i * 97, 384, 1.2, i % 2 ? -.8 : .8, '#4e9153');
      }
    },
    balcony: {
      label: 'Ban công', theme: 'home', ground_y: 780,
      draw(ctx, settings, t, kit) {
        defaultSky(ctx, settings);
        ctx.fillStyle = '#e2d0b3'; ctx.fillRect(-2000, 780, 4500, 2220);
        for (let i = 0; i < 8; i++) line(ctx, [[i * 90 - 60, 780], [i * 110 - 125, H]], '#b29e83', 2);
        for (const y of [840, 920, 1000]) line(ctx, [[0, y], [W, y]], '#b29e83', 2);
        for (let x = 10; x < W; x += 86) { line(ctx, [[x, 0], [x, 775]], '#829a96', 9); line(ctx, [[x - 2, 0], [x - 2, 775]], '#e1e9d9', 3); }
        line(ctx, [[0, 675], [W, 675]], '#819a93', 11);
      }
    },
    pepper_patch: {
      label: 'Vườn ớt', theme: 'farm', ground_y: 810,
      draw(ctx, settings, t, kit) {
        BACKGROUNDS.garden.draw(ctx, settings, t, kit);
        const night = settings.time === 'night';
        for (let i = 0; i < 5; i++) leaf(ctx, i * 141, 870 - i % 2 * 220, 3, i % 2 ? -.7 : .8, night ? '#3e795d' : '#69af60');
      }
    },
    soil_cutaway: {
      label: 'Mặt cắt đất', theme: 'farm', ground_y: 480,
      draw(ctx, settings, t, kit) {
        defaultSky(ctx, settings);
        ctx.fillStyle = '#76583d'; ctx.fillRect(-2000, 480, 4500, 2520);
        line(ctx, [[0, 480], [W, 480]], '#719553', 10);
        for (let i = 0; i < 90; i++) ellipse(ctx, (i * 79) % W, 499 + (i * 51) % 520, 3, 1.5, '#a78555', null);
      }
    },
    pond: {
      label: 'Ao', theme: 'water', ground_y: 760,
      draw(ctx, settings, t, kit) {
        defaultSky(ctx, settings);
        const night = settings.time === 'night';
        ctx.fillStyle = night ? '#1d3550' : '#6fb4cf'; ctx.fillRect(-2000, -2000, 4500, 5000);
        ctx.fillStyle = night ? '#122438' : '#4f93b8'; ctx.fillRect(-2000, 760, 4500, 2240);
        for (let i = 0; i < 14; i++) {
          const y = 780 + i * 22 + Math.sin(t * .6 + i) * 2;
          ellipse(ctx, (i % 3) * 210 + 60, y, 90, 5, 'rgba(255,255,255,.14)', null);
        }
        for (const bx of [-40, 316]) for (let i = 0; i < 6; i++) path(ctx, `M ${bx + i * 14} 700 Q ${bx + 6 + i * 14} 616 ${bx + 16 + i * 14} 700`, null, '#3f7a3a', 5);
        for (let i = 0; i < 5; i++) ellipse(ctx, i * 160 - 30, 640, 130, 90, night ? '#274a3a' : '#5f9a4c', null);
        for (let i = 0; i < 26; i++) ellipse(ctx, (i * 137 + 40) % W, 800 + (i * 53) % (H - 800), 4, 8, 'rgba(255,255,255,.12)', null);
      }
    },
    river: {
      label: 'Sông', theme: 'water', ground_y: 760,
      draw(ctx, settings, t, kit) {
        defaultSky(ctx, settings);
        const night = settings.time === 'night';
        ctx.fillStyle = night ? '#1d3550' : '#6fb4cf'; ctx.fillRect(-2000, -2000, 4500, 5000);
        ctx.fillStyle = night ? '#122438' : '#4f93b8'; ctx.fillRect(-2000, 760, 4500, 2240);
        for (let i = 0; i < 14; i++) {
          const y = 780 + i * 22 + Math.sin(t * .6 + i) * 2;
          ellipse(ctx, (i % 3) * 210 + 60, y, 90, 5, 'rgba(255,255,255,.14)', null);
        }
        ctx.fillStyle = night ? '#0b1b2c' : '#2c6d94';
        for (let i = 0; i < 5; i++) ellipse(ctx, i * 160 - 30, 640, 130, 90, night ? '#274a3a' : '#5f9a4c', null);
        for (let i = 0; i < 26; i++) ellipse(ctx, (i * 137 + 40) % W, 800 + (i * 53) % (H - 800), 4, 8, 'rgba(255,255,255,.12)', null);
      }
    },
    sea: {
      label: 'Biển', theme: 'water', ground_y: 760,
      draw(ctx, settings, t, kit) {
        BACKGROUNDS.river.draw(ctx, settings, t, kit);
      }
    },
    underwater: {
      label: 'Dưới nước', theme: 'water', ground_y: 760,
      draw(ctx, settings, t, kit) {
        defaultSky(ctx, settings);
        const night = settings.time === 'night';
        ctx.fillStyle = night ? '#1d3550' : '#3f7fa6'; ctx.fillRect(-2000, -2000, 4500, 5000);
        for (let i = 0; i < 14; i++) {
          const y = 120 + i * 22 + Math.sin(t * .6 + i) * 4;
          ellipse(ctx, (i % 3) * 210 + 60, y, 90, 5, 'rgba(255,255,255,.14)', null);
        }
        for (let i = 0; i < 5; i++) ellipse(ctx, i * 160 - 30, 640, 130, 90, night ? '#274a3a' : '#5f9a4c', null);
        for (let i = 0; i < 26; i++) ellipse(ctx, (i * 137 + 40) % W, 800 + (i * 53) % (H - 800), 4, 8, 'rgba(255,255,255,.12)', null);
      }
    }
  };
  // Lũ (background.flood 0–1): nước đục dâng tới 150 px trên mặt đất, vẽ SAU nhân vật để ngập chân.
  // Bụi mịn (background.dust 0–1): màn bụi vàng xám phủ cả cảnh.
  function hazards(ctx, settings, t) {
    const bg = BACKGROUNDS[settings.preset || 'garden'] || BACKGROUNDS.garden, flood = clamp(settings.flood || 0), dust = clamp(settings.dust || 0);
    if (flood > 0) {
      const level = bg.ground_y - flood * 150;
      ctx.beginPath(); ctx.moveTo(-2000, level);
      for (let x = -40; x <= W + 40; x += 24) ctx.lineTo(x, level + Math.sin(x * 0.05 + t * 2.4) * 4);
      ctx.lineTo(W + 2000, 3000); ctx.lineTo(-2000, 3000); ctx.closePath();
      ctx.fillStyle = 'rgba(94, 132, 150, 0.62)'; ctx.fill();
      for (let i = 0; i < 9; i++) ellipse(ctx, (i * 71 + t * 22) % (W + 60) - 30, level + 12 + (i % 3) * 16, 22, 2.4, 'rgba(255, 255, 255, 0.35)', null);
    }
    if (dust > 0) {
      ctx.fillStyle = `rgba(196, 180, 140, ${0.42 * dust})`; ctx.fillRect(-2000, -2000, 4500, 5000);
      for (let i = 0; i < 40 * dust; i++) ellipse(ctx, (hash(`dust${i}`) % W + t * 9 * (1 + i % 3)) % W, hash(`dusty${i}`) % H, 1.6, 1.6, `rgba(120, 100, 70, ${0.4 * dust})`, null);
    }
  }
  function background(ctx, settings, t) {
    const preset = settings.preset || 'garden';
    const bg = BACKGROUNDS[preset] || BACKGROUNDS.garden;
    bg.draw(ctx, settings, t, kit);
    // Nước ao/sông ô nhiễm (background.contaminated 0–1): nước ngả xanh đục và có váng.
    const dirty = clamp(settings.contaminated || 0);
    if (dirty > 0 && bg.theme === 'water') {
      const gy = bg.ground_y;
      ctx.fillStyle = `rgba(122, 140, 48, ${.55 * dirty})`; ctx.fillRect(-2000, gy, 4500, 3000);
      for (let i = 0; i < Math.round(14 * dirty); i++) {
        const x = (hash(`scum${i}`) % (W + 80)) - 40, y = gy + 12 + (hash(`scumy${i}`) % 200);
        ellipse(ctx, x + Math.sin(t * .5 + i) * 6, y, 26 + i % 4 * 9, 5, `rgba(196, 190, 92, ${.7 * dirty})`, null);
      }
    }
    // Tuyết đọng thành lớp gợn trên mặt đất (nền nước / dưới nước không đọng).
    if (settings.weather === 'snow' && bg.theme !== 'water') {
      const gy = bg.ground_y;
      ctx.fillStyle = '#f4f8fa'; ctx.beginPath(); ctx.moveTo(-2000, gy + 14);
      for (let x = -40; x <= W + 40; x += 40) ctx.quadraticCurveTo(x + 20, gy - 6 - (x / 40 % 2) * 4, x + 40, gy + 2);
      ctx.lineTo(W + 2000, gy + 14); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 22; i++) ellipse(ctx, (i * 131 + 30) % W, gy + 30 + (i * 47) % 160, 14, 3, 'rgba(255,255,255,.7)', null);
    }
  }
  function weather(ctx, settings, t) {
    const w = settings.weather;
    if (!w || w === 'clear') return;
    if (w === 'rain') {
      for (let i = 0; i < 70; i++) {
        const x = ((i * 89 - t * 100) % (W + 120) + W + 120) % (W + 120) - 60;
        const y = (i * 157 + t * 430) % (H + 60) - 30;
        line(ctx, [[x, y], [x - 8, y + 24]], '#e2f2f399', 1.6);
      }
    } else if (w === 'snow') {
      for (let i = 0; i < 60; i++) {
        const x = ((i * 97 + Math.sin(i * 3 + t * 0.8) * 20) % (W + 60) + W + 60) % (W + 60) - 30;
        const y = (i * 131 + t * 140) % (H + 40) - 20;
        const r = 1.8 + (i % 3) * 1.2;
        ellipse(ctx, x, y, r, r, 'rgba(255,255,255,0.85)', null);
      }
    } else if (w === 'wind') {
      ctx.save();
      for (let i = 0; i < 18; i++) {
        const age = (t * 1.8 + i * 0.22) % 1;
        const x = mix(-80, W + 80, age);
        const y = 140 + (i * 179) % (H - 280) + Math.sin(age * Math.PI * 2 + i) * 14;
        const len = 40 + (i % 4) * 25;
        ctx.globalAlpha = Math.sin(age * Math.PI) * 0.75;
        path(ctx, `M ${x} ${y} q ${len * .5} ${-6 - i % 3 * 2} ${len} ${Math.sin(i) * 4} q 10 3 6 -6`, null, '#ffffff', 2.4);
      }
      for (let i = 0; i < 7; i++) {
        const age = (t * .55 + i * .143) % 1, x = mix(-40, W + 40, age), y = 260 + (i * 211) % (H - 480) + Math.sin(age * 9 + i) * 40;
        ctx.globalAlpha = Math.sin(age * Math.PI);
        ctx.save(); ctx.translate(x, y); ctx.rotate(age * 12 + i);
        path(ctx, 'M 0 -7 Q 6 0 0 7 Q -6 0 0 -7 Z', i % 2 ? '#7fb24a' : '#d9a441', INK, .8);
        ctx.restore();
      }
      ctx.restore();
    } else if (w === 'fog') {
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const y = 300 + i * 110;
        const g = ctx.createLinearGradient(0, y - 50, 0, y + 50);
        g.addColorStop(0, 'rgba(235,245,245,0)');
        g.addColorStop(0.5, `rgba(235,245,245,${(0.42 + 0.08 * Math.sin(t * .4 + i)).toFixed(3)})`);
        g.addColorStop(1, 'rgba(235,245,245,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-2000 + Math.sin(t * .3 + i) * 30, y - 50, 4500, 100);
      }
      ctx.fillStyle = 'rgba(232,240,240,0.18)'; ctx.fillRect(-2000, -2000, 4500, 5000);
      ctx.restore();
    } else if (w === 'storm') {
      for (let i = 0; i < 110; i++) {
        const x = ((i * 73 - t * 240) % (W + 160) + W + 160) % (W + 160) - 80;
        const y = (i * 137 + t * 620) % (H + 60) - 30;
        line(ctx, [[x, y], [x - 16, y + 32]], '#e2f2f3bb', 2.0);
      }
      const flashCycle = (t + 2.3) % 4.7;  // chớp đầu tiên ở giây 2.4, không loé ngay khung đầu
      if (flashCycle < 0.12) {
        const flashAlpha = flashCycle < 0.05 ? (flashCycle / 0.05) * 0.45 : ((0.12 - flashCycle) / 0.07) * 0.45;
        ctx.fillStyle = `rgba(255,255,255,${flashAlpha.toFixed(3)})`;
        ctx.fillRect(-2000, -2000, 4500, 5000);
        if (flashCycle < 0.08) {
          const bx = 160 + ((Math.floor((t + 2.3) / 4.7) * 173) % (W - 320));
          line(ctx, [[bx, 0], [bx - 20, 120], [bx + 15, 200], [bx - 10, 320]], '#ffffff', 3.5);
          line(ctx, [[bx, 0], [bx - 20, 120], [bx + 15, 200], [bx - 10, 320]], '#cce8ff', 1.8);
        }
      }
    } else if (w === 'hot') {
      ctx.save();
      for (let i = 0; i < 8; i++) {
        const y = 620 + i * 45;
        const wave = Math.sin(t * 3.5 + i * 1.8) * 8;
        ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 2 + i);
        ctx.fillStyle = '#fff1c4';
        ctx.fillRect(-2000, y + wave, 4500, 16);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255,170,60,0.10)'; ctx.fillRect(-2000, -2000, 4500, 5000);
      ctx.restore();
    }
  }
  function effects(ctx, snapshot, cat) {
    for (const a of snapshot.actions) {
      if (!a.active || !['spray', 'fertilize', 'drip', 'water', 'pollinate'].includes(a.type)) continue;
      const spec = cat.actions[a.type], actor = snapshot.states[a.actor], target = snapshot.states[a.target];
      const from = worldAnchor(cat, actor, a.actor_anchor || spec.actor_anchor), to = worldAnchor(cat, target, a.target_anchor || spec.target_anchor);
      if (a.type === 'pollinate') {
        ctx.save(); ctx.globalAlpha = 0.8;
        for (let i = 0; i < 6; i++) {
          const age = (snapshot.t * 2 + i * 0.35) % 1;
          const angle = i * TAU / 6 + snapshot.t * 1.5;
          const r = 8 + age * 22;
          const px = to.x + Math.cos(angle) * r;
          const py = to.y + Math.sin(angle) * r * 0.7 - age * 16;
          ellipse(ctx, px, py, 2.2 * (1 - age * 0.4), 2.2 * (1 - age * 0.4), '#ffd840', '#caa020', 0.8);
        }
        ctx.restore();
        continue;
      }
      if (a.type === 'water') { waterStream(ctx, snapshot, a, from, to); continue; }
      const count = a.type === 'spray' ? 24 : 9, speed = a.type === 'spray' ? 2.3 : 1.2;
      for (let i = 0; i < count; i++) {
        const age = (snapshot.t - a.start) * speed - i / count;
        if (age < 0) continue;
        const u = age % 1, spread = a.type === 'spray' ? Math.sin(i * 17) * u * 25 : Math.sin(i * 3) * 9 * u;
        const x = mix(from.x, to.x, u) + spread;
        const y = a.type === 'spray' ? mix(from.y, to.y, u) : mix(from.y, to.y, u * u);
        ellipse(ctx, x, y, a.type === 'fertilize' ? 4 : 2, a.type === 'fertilize' ? 5.5 : 3.5, a.type === 'fertilize' ? '#ead99f' : a.type === 'drip' ? '#fffce4' : '#80c8eccc', null);
      }
    }
    for (const ef of CUSTOM_EFFECTS) ef(ctx, snapshot, cat, kit);
  }
  // Vệt chuyển động sau đầu dao/đầu móc/phao: lấy lại vị trí neo ở vài thời điểm
  // trước (theo t, không theo thời gian thực) nên tua lại vẫn ra đúng một hình.
  const TRAILS = { cut: 'actor', slice: 'actor', strike: 'actor', set_hook: 'actor', press: 'actor', cast: 'target', reel: 'actor', dig: 'actor' };
  function motionTrails(ctx, frame, cat, sampleAt) {
    for (const a of frame.actions) {
      const side = TRAILS[a.type];
      if (!a.active || !side) continue;
      const id = side === 'actor' ? a.actor : a.target, state = frame.states[id];
      if (!state) continue;
      const spec = cat.actions[a.type], anchors = cat.assets[state.asset].anchors;
      const wanted = side === 'actor' ? a.actor_anchor || spec.actor_anchor : 'root', name = anchors[wanted] ? wanted : 'root';
      const points = [worldAnchor(cat, state, name)];
      for (let k = 1; k <= 6; k++) {
        const at = frame.t - k / 60;
        if (at < a.start) break;
        const past = sampleAt(at).states[id];
        if (!past) break;
        points.push(worldAnchor(cat, past, name));
      }
      let length = 0;
      for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (length < 14) continue;
      const width = clamp(state.height * .05, 5, 16);
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 1; i < points.length; i++) {
        const u = 1 - (i - 1) / points.length;
        ctx.globalAlpha = .6 * u * state.opacity; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = width * u;
        ctx.beginPath(); ctx.moveTo(points[i - 1].x, points[i - 1].y); ctx.lineTo(points[i].x, points[i].y); ctx.stroke();
      }
      ctx.restore();
    }
  }
  // Tia va chạm ngắn tại điểm tiếp xúc, và nước bắn cho splash/emerge.
  const IMPACTS = { cut: .2, slice: .2, press: .2, uproot: .22, strike: .5, set_hook: .05, dig: .25 };
  function impacts(ctx, frame, cat) {
    for (const a of frame.actions) {
      if (!a.active) continue;
      const spec = cat.actions[a.type], target = frame.states[a.target];
      if (!target) continue;
      if (a.type === 'peck') {
        const q = ((a.p * 3) % 1 - .42) / .3;
        if (q >= 0 && q <= 1) burst(ctx, worldAnchor(cat, target, a.target_anchor || spec.target_anchor), clamp(target.height * .12, 12, 30), q);
      } else if (a.type === 'dig') {
        const q = ((a.p * 2) % 1 - .25) / .35;
        if (q >= 0 && q <= 1) {
          const at = worldAnchor(cat, target, a.target_anchor || 'surface');
          ctx.save(); ctx.globalAlpha = (1 - q) * .9;
          for (let i = 0; i < 8; i++) {
            const ang = -Math.PI * (.18 + .64 * ((i * 5) % 8) / 7);
            const dist = 36 * (.4 + .6 * q) * (.8 + (i % 3) * .2);
            const px = at.x + Math.cos(ang) * dist + ((i % 2) ? 6 : -6);
            const py = at.y + Math.sin(ang) * dist + q * q * 16;
            ellipse(ctx, px, py, 2.6, 2.2, '#5e3e24', '#3d2514', 0.8);
          }
          ctx.restore();
        }
      } else if (a.type in IMPACTS) {
        const q = (a.p - IMPACTS[a.type]) / .16;
        if (q < 0 || q > 1) continue;
        const anchors = cat.assets[target.asset].anchors, wanted = a.target_anchor || spec.target_anchor;
        const at = worldAnchor(cat, target, anchors[wanted] ? wanted : 'face'), r = clamp(target.height * .1, 16, 46);
        ctx.save(); ctx.globalAlpha = (1 - q) * .95; ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
          const ang = i * TAU / 8 + .2, r0 = r * (.35 + q * .6), r1 = r * (.7 + q * .9) * (i % 2 ? .7 : 1);
          ctx.strokeStyle = i % 2 ? '#ffe27a' : '#ffffff'; ctx.lineWidth = 4 * (1 - q) + 1;
          ctx.beginPath(); ctx.moveTo(at.x + Math.cos(ang) * r0, at.y + Math.sin(ang) * r0); ctx.lineTo(at.x + Math.cos(ang) * r1, at.y + Math.sin(ang) * r1); ctx.stroke();
        }
        ctx.restore();
      } else if (a.type === 'splash' || a.type === 'emerge') {
        const base = worldAnchor(cat, target, 'root'), size = clamp(target.height * .45, 40, 160), q = clamp(a.p * 1.6);
        if (q >= 1) continue;
        ctx.save(); ctx.globalAlpha = (1 - q) * .9;
        ellipse(ctx, base.x, base.y, size * (.5 + q), size * .12 * (.5 + q), null, '#eefcff', 3 * (1 - q) + 1);
        for (let i = 0; i < 12; i++) {
          const ang = Math.PI * (.15 + .7 * ((i * 7) % 12) / 11), v = size * (.55 + (i % 4) * .15);
          const x = base.x + Math.cos(ang) * v * q * 1.2, y = base.y - Math.sin(ang) * v * q * 1.6 + q * q * v * 1.4;
          ellipse(ctx, x, y, 3 + (i % 3), 4.5 + (i % 3), '#dff6fd', '#6fb8d2', 1);
        }
        ctx.restore();
      }
    }
  }
  function wrapText(ctx, text, maxWidth) {
    const lines = []; let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  function label(ctx, value, y, size = 28, color = '#fff5ad', maxLines = 3) {
    let lines;
    do { ctx.font = `800 ${size}px system-ui`; lines = wrapText(ctx, value, W - 60); if (lines.length <= maxLines) break; size -= 2; } while (size > 12);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    lines.forEach((line, i) => {
      const top = y + (i - (lines.length - 1) / 2) * size * 1.25;
      ctx.strokeStyle = '#26372a'; ctx.lineWidth = 5; ctx.strokeText(line, W / 2, top, W - 50);
      ctx.fillStyle = color; ctx.fillText(line, W / 2, top, W - 50);
    });
  }
  class Renderer {
    constructor(canvas, cat, story, options = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.catalog = cat; this.story = story;
      // cels chỉ bật được khi loadCelSheets() đã xong: không bao giờ đổi kiểu vẽ giữa chừng.
      if (options.cels && !celsReady()) throw new Error('Gọi RemakeVector.loadCelSheets() trước khi bật cels');
      this.cels = Boolean(options.cels);
      canvas.width = W; canvas.height = H;
    }
    sample(t) { return sample(this.story, this.catalog, t); }
    render(t, debug = false) {
      const frame = this.sample(t), ctx = this.ctx, scene = frame.scene;
      ctx.reset();
      if (scene.kind === 'title') {
        ctx.fillStyle = '#162522'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#876f42'; ctx.fillRect(0, 350, W, 320);
        for (let i = 0; i < 32; i++) line(ctx, [[0, 352 + i * 10], [W, 350 + i * 10]], '#ae9056', 2);
        label(ctx, scene.text, H / 2, 48, '#ffedb0', 3);
        return frame;
      }
      const bg = scene.background || {};
      ctx.fillStyle = '#c0eff1'; ctx.fillRect(0, 0, W, H);
      // Động đất (background.quake 0–1): rung khung hình tất định theo t.
      const quake = clamp(bg.quake || 0);
      const shakeX = quake ? Math.sin(frame.t * 47) * 7 * quake + Math.sin(frame.t * 23) * 3 * quake : 0, shakeY = quake ? Math.cos(frame.t * 39) * 4 * quake : 0;
      ctx.save(); ctx.translate(W / 2 + shakeX, H / 2 + shakeY); ctx.scale(frame.camera.zoom, frame.camera.zoom); ctx.translate(-frame.camera.x, -frame.camera.y);
      background(ctx, bg, frame.t);
      // Vật gắn layer over_face đã được nâng z cao hơn cha lúc gắn (attach), nên chỉ cần sắp theo z.
      const ordered = Object.values(frame.states).sort((a, b) => a.z - b.z);
      for (const state of ordered) contactShadow(ctx, state, this.catalog);
      motionTrails(ctx, frame, this.catalog, at => this.sample(at));
      for (const state of ordered) drawActor(ctx, state, this.catalog, frame.t, this.cels);
      impacts(ctx, frame, this.catalog);
      for (const state of ordered) if (this.catalog.assets[state.asset].group === 'monster') {
        const p = worldAnchor(this.catalog, state, 'top');
        tierBadge(ctx, this.catalog.assets[state.asset].tier, p.x, p.y - 24);
      }
      effects(ctx, frame, this.catalog); weather(ctx, bg, frame.t); hazards(ctx, bg, frame.t);
      if (debug) for (const s of ordered) for (const name of Object.keys(this.catalog.assets[s.asset].anchors)) {
        const p = worldAnchor(this.catalog, s, name); ellipse(ctx, p.x, p.y, 3, 3, '#fd3f65', null);
        ctx.font = '11px system-ui'; ctx.fillStyle = '#17252b'; ctx.textAlign = 'left'; ctx.fillText(`${s.id}.${name}`, p.x + 5, p.y);
      }
      ctx.restore();
      if (frame.cue?.text) label(ctx, frame.cue.text, 924);
      return frame;
    }
  }
  const PICTOGRAMS = {
    traffic(ctx, cx, cy, size, type) {
      ctx.save();
      ctx.translate(cx, cy);
      const r = size * 0.5;
      if (type === 'stop_hand') {
        path(ctx, `M ${-r*0.41} ${-r} L ${r*0.41} ${-r} L ${r} ${-r*0.41} L ${r} ${r*0.41} L ${r*0.41} ${r} L ${-r*0.41} ${r} L ${-r} ${r*0.41} L ${-r} ${-r*0.41} Z`, '#dc2626', '#ffffff', 2);
        ellipse(ctx, 0, r*0.1, r*0.28, r*0.35, '#ffffff', null);
        for (let i = -2; i <= 1; i++) {
          line(ctx, [[i*r*0.12, -r*0.05], [i*r*0.12, -r*0.45]], '#ffffff', r*0.1);
        }
        line(ctx, [[-r*0.25, r*0.15], [-r*0.38, -r*0.05]], '#ffffff', r*0.1);
      } else if (type === 'pedestrian') {
        ellipse(ctx, 0, 0, r, r, '#2563eb', '#ffffff', 2);
        ellipse(ctx, 0, -r*0.45, r*0.18, r*0.18, '#ffffff', null);
        line(ctx, [[0, -r*0.25], [-r*0.1, r*0.15]], '#ffffff', 2.5);
        line(ctx, [[-r*0.1, r*0.15], [-r*0.25, r*0.6]], '#ffffff', 2.5);
        line(ctx, [[-r*0.1, r*0.15], [r*0.2, r*0.55]], '#ffffff', 2.5);
        line(ctx, [[0, -r*0.1], [-r*0.25, r*0.1]], '#ffffff', 2.5);
        line(ctx, [[0, -r*0.1], [r*0.25, 0]], '#ffffff', 2.5);
      } else if (type === 'bicycle') {
        ellipse(ctx, 0, 0, r, r, '#2563eb', '#ffffff', 2);
        ellipse(ctx, -r*0.4, r*0.25, r*0.22, r*0.22, null, '#ffffff', 2);
        ellipse(ctx, r*0.4, r*0.25, r*0.22, r*0.22, null, '#ffffff', 2);
        line(ctx, [[-r*0.4, r*0.25], [0, r*0.25], [r*0.25, -r*0.15], [r*0.4, r*0.25]], '#ffffff', 2);
        line(ctx, [[0, r*0.25], [-r*0.15, -r*0.15], [-r*0.4, r*0.25]], '#ffffff', 2);
        line(ctx, [[-r*0.15, -r*0.15], [-r*0.2, -r*0.28]], '#ffffff', 2.5);
        line(ctx, [[r*0.25, -r*0.15], [r*0.2, -r*0.35]], '#ffffff', 2.5);
      } else if (type === 'children_crossing') {
        path(ctx, `M 0 ${-r} L ${r*0.9} ${r*0.7} L ${-r*0.9} ${r*0.7} Z`, '#fbbf24', '#b45309', 2);
        ellipse(ctx, -r*0.25, -r*0.15, r*0.14, r*0.14, '#1e293b', null);
        line(ctx, [[-r*0.25, 0], [-r*0.25, r*0.45]], '#1e293b', 2.5);
        ellipse(ctx, r*0.2, 0, r*0.12, r*0.12, '#1e293b', null);
        line(ctx, [[r*0.2, r*0.12], [r*0.2, r*0.5]], '#1e293b', 2.5);
      }
      ctx.restore();
    },
    recycling(ctx, cx, cy, size, type) {
      ctx.save();
      ctx.translate(cx, cy);
      const r = size * 0.5;
      if (type === 'recycle_arrows') {
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.rotate((i * 120 * Math.PI) / 180);
          path(ctx, `M ${-r*0.4} ${-r*0.6} L ${r*0.2} ${-r*0.6} L ${r*0.3} ${-r*0.45} L ${r*0.15} ${-r*0.45} L ${r*0.1} ${-r*0.52} L ${-r*0.35} ${-r*0.52} Z`, '#16a34a', null);
          path(ctx, `M ${r*0.2} ${-r*0.75} L ${r*0.45} ${-r*0.52} L ${r*0.2} ${-r*0.3} Z`, '#16a34a', null);
          ctx.restore();
        }
      } else if (type === 'paper') {
        path(ctx, `M ${-r*0.4} ${-r*0.6} L ${r*0.15} ${-r*0.6} L ${r*0.4} ${-r*0.3} L ${r*0.4} ${r*0.6} L ${-r*0.4} ${r*0.6} Z`, '#f8fafc', '#475569', 1.5);
        path(ctx, `M ${r*0.15} ${-r*0.6} L ${r*0.15} ${-r*0.3} L ${r*0.4} ${-r*0.3} Z`, '#cbd5e1', '#475569', 1.2);
        line(ctx, [[-r*0.25, 0], [r*0.25, 0]], '#94a3b8', 1.2);
        line(ctx, [[-r*0.25, r*0.25], [r*0.25, r*0.25]], '#94a3b8', 1.2);
      } else if (type === 'bottle') {
        path(ctx, `M ${-r*0.12} ${-r*0.65} L ${r*0.12} ${-r*0.65} L ${r*0.12} ${-r*0.45} L ${r*0.28} ${-r*0.2} L ${r*0.28} ${r*0.6} L ${-r*0.28} ${r*0.6} L ${-r*0.28} ${-r*0.2} L ${-r*0.12} ${-r*0.45} Z`, '#38bdf8', '#0284c7', 1.5);
      } else if (type === 'can') {
        path(ctx, `M ${-r*0.22} ${-r*0.5} L ${r*0.22} ${-r*0.5} L ${r*0.22} ${r*0.5} L ${-r*0.22} ${r*0.5} Z`, '#94a3b8', '#475569', 1.5);
        ellipse(ctx, 0, -r*0.5, r*0.22, r*0.08, '#cbd5e1', '#475569', 1.2);
        ellipse(ctx, 0, r*0.5, r*0.22, r*0.08, '#94a3b8', '#475569', 1.2);
      } else if (type === 'apple_core') {
        path(ctx, `M ${-r*0.15} ${-r*0.4} Q ${r*0.3} 0 ${-r*0.15} ${r*0.4} L ${r*0.15} ${r*0.4} Q ${-r*0.3} 0 ${r*0.15} ${-r*0.4} Z`, '#fef08a', '#ca8a04', 1.5);
        ellipse(ctx, 0, -r*0.1, r*0.04, r*0.06, '#713f12', null);
        ellipse(ctx, 0, r*0.1, r*0.04, r*0.06, '#713f12', null);
      } else if (type === 'battery') {
        path(ctx, `M ${-r*0.25} ${-r*0.45} L ${r*0.25} ${-r*0.45} L ${r*0.25} ${r*0.55} L ${-r*0.25} ${r*0.55} Z`, '#e2e8f0', '#334155', 1.5);
        path(ctx, `M ${-r*0.1} ${-r*0.58} L ${r*0.1} ${-r*0.58} L ${r*0.1} ${-r*0.45} L ${-r*0.1} ${-r*0.45} Z`, '#f59e0b', '#334155', 1.2);
        line(ctx, [[0, -r*0.25], [0, r*0.05]], '#22c55e', 2);
        line(ctx, [[-r*0.15, -r*0.1], [r*0.15, -r*0.1]], '#22c55e', 2);
      }
      ctx.restore();
    },
    emergency(ctx, cx, cy, size, type) {
      ctx.save();
      ctx.translate(cx, cy);
      const r = size * 0.5;
      if (type === 'running_exit') {
        path(ctx, `M ${-r} ${-r*0.65} L ${r} ${-r*0.65} L ${r} ${r*0.65} L ${-r} ${r*0.65} Z`, '#15803d', '#ffffff', 1.5);
        path(ctx, `M ${r*0.25} ${-r*0.45} L ${r*0.75} ${-r*0.45} L ${r*0.75} ${r*0.55} L ${r*0.25} ${r*0.55} Z`, '#ffffff', null);
        ellipse(ctx, -r*0.2, -r*0.25, r*0.12, r*0.12, '#ffffff', null);
        line(ctx, [[-r*0.2, -r*0.1], [-r*0.1, r*0.15], [-r*0.35, r*0.45]], '#ffffff', 2.2);
        line(ctx, [[-r*0.1, r*0.15], [r*0.15, r*0.3]], '#ffffff', 2.2);
        line(ctx, [[-r*0.18, 0], [r*0.1, -r*0.15]], '#ffffff', 2.2);
      } else if (type === 'flame') {
        path(ctx, `M 0 ${r*0.6} Q ${-r*0.6} ${r*0.2} ${-r*0.3} ${-r*0.2} Q ${-r*0.4} ${-r*0.5} 0 ${-r*0.7} Q ${r*0.5} ${-r*0.2} ${r*0.3} ${r*0.2} Q ${r*0.6} ${r*0.5} 0 ${r*0.6} Z`, '#ef4444', '#b91c1c', 1.5);
        path(ctx, `M 0 ${r*0.5} Q ${-r*0.3} ${r*0.2} 0 ${-r*0.3} Q ${r*0.3} ${r*0.2} 0 ${r*0.5} Z`, '#fde047', null);
      } else if (type === 'quake') {
        path(ctx, `M 0 ${-r*0.65} L ${r*0.6} ${-r*0.15} L ${r*0.5} ${-r*0.15} L ${r*0.5} ${r*0.6} L ${-r*0.5} ${r*0.6} L ${-r*0.5} ${-r*0.15} L ${-r*0.6} ${-r*0.15} Z`, '#f8fafc', '#1e293b', 1.5);
        path(ctx, `M 0 ${-r*0.2} L ${-r*0.12} 0 L ${r*0.12} ${r*0.25} L 0 ${r*0.6}`, null, '#dc2626', 2);
        line(ctx, [[-r*0.8, -r*0.1], [-r*0.65, 0]], '#64748b', 1.5);
        line(ctx, [[r*0.8, -r*0.1], [r*0.65, 0]], '#64748b', 1.5);
      } else if (type === 'tsunami') {
        path(ctx, `M ${-r*0.7} ${r*0.6} Q ${-r*0.2} ${r*0.6} ${-r*0.1} ${r*0.2} Q 0 ${-r*0.5} ${r*0.4} ${-r*0.5} Q ${r*0.6} ${-r*0.2} ${r*0.35} ${-r*0.05} Q ${r*0.65} ${r*0.1} ${r*0.7} ${r*0.6} Z`, '#0284c7', '#0369a1', 1.5);
      } else if (type === 'arrow') {
        path(ctx, `M ${-r*0.5} ${-r*0.15} L ${r*0.1} ${-r*0.15} L ${r*0.1} ${-r*0.4} L ${r*0.6} 0 L ${r*0.1} ${r*0.4} L ${r*0.1} ${r*0.15} L ${-r*0.5} ${r*0.15} Z`, '#22c55e', '#15803d', 1.5);
      }
      ctx.restore();
    },
    prohibition(ctx, cx, cy, size, type) {
      ctx.save();
      ctx.translate(cx, cy);
      const r = size * 0.5;
      if (type === 'no_swim') {
        ellipse(ctx, 0, 0, r, r, '#ffffff', '#dc2626', 2.5);
        ellipse(ctx, -r*0.2, -r*0.15, r*0.1, r*0.1, '#1e293b', null);
        path(ctx, `M ${-r*0.5} ${r*0.2} Q ${-r*0.25} ${r*0.05} 0 ${r*0.2} Q ${r*0.25} ${r*0.35} ${r*0.5} ${r*0.2}`, null, '#0284c7', 2);
        line(ctx, [[-r*0.7, -r*0.7], [r*0.7, r*0.7]], '#dc2626', 3.0);
      } else if (type === 'warning_triangle') {
        path(ctx, `M 0 ${-r} L ${r*0.95} ${r*0.7} L ${-r*0.95} ${r*0.7} Z`, '#facc15', '#b45309', 2.5);
        ellipse(ctx, 0, -r*0.05, r*0.08, r*0.2, '#1e293b', null);
        ellipse(ctx, 0, r*0.38, r*0.08, r*0.08, '#1e293b', null);
      }
      ctx.restore();
    },
    first_aid(ctx, cx, cy, size, type) {
      ctx.save();
      ctx.translate(cx, cy);
      const r = size * 0.5;
      if (type === 'heart') {
        path(ctx, `M 0 ${r*0.7} Q ${-r*0.8} 0 ${-r*0.4} ${-r*0.6} Q 0 ${-r*0.6} 0 ${-r*0.1} Q 0 ${-r*0.6} ${r*0.4} ${-r*0.6} Q ${r*0.8} 0 0 ${r*0.7} Z`, '#ef4444', '#b91c1c', 1.5);
      } else {
        path(ctx, `M ${-r} ${-r} L ${r} ${-r} L ${r} ${r} L ${-r} ${r} Z`, '#10b981', '#059669', 1.5);
        path(ctx, `M ${-r*0.2} ${-r*0.7} L ${r*0.2} ${-r*0.7} L ${r*0.2} ${-r*0.2} L ${r*0.7} ${-r*0.2} L ${r*0.7} ${r*0.2} L ${r*0.2} ${r*0.2} L ${r*0.2} ${r*0.7} L ${-r*0.2} ${r*0.7} L ${-r*0.2} ${r*0.2} L ${-r*0.7} ${r*0.2} L ${-r*0.7} ${-r*0.2} L ${-r*0.2} ${-r*0.2} Z`, '#ffffff', null);
      }
      ctx.restore();
    },
    ghs(ctx, cx, cy, size, symbol = 'skull') {
      ctx.save();
      ctx.translate(cx, cy);
      const d = size;
      path(ctx, `M 0 ${-d * 0.72} L ${d * 0.72} 0 L 0 ${d * 0.72} L ${-d * 0.72} 0 Z`, '#ffffff', '#d62424', 2.2);
      if (symbol === 'skull') {
        ellipse(ctx, 0, -d * 0.16, d * 0.28, d * 0.25, '#1e2422', null);
        ellipse(ctx, -d * 0.1, -d * 0.16, d * 0.07, d * 0.08, '#ffffff', null);
        ellipse(ctx, d * 0.1, -d * 0.16, d * 0.07, d * 0.08, '#ffffff', null);
        path(ctx, `M ${-d * 0.12} ${-d * 0.02} L ${d * 0.12} ${-d * 0.02} L ${d * 0.08} ${d * 0.12} L ${-d * 0.08} ${d * 0.12} Z`, '#1e2422', null);
        line(ctx, [[-d * 0.28, d * 0.24], [d * 0.28, -d * 0.24]], '#1e2422', 1.8);
        line(ctx, [[-d * 0.28, -d * 0.24], [d * 0.28, d * 0.24]], '#1e2422', 1.8);
      } else if (symbol === 'aquatic') {
        path(ctx, `M ${-d * 0.24} ${d * 0.1} Q ${-d * 0.05} ${d * 0.2} ${d * 0.2} ${d * 0.06}`, null, '#1e2422', 1.6);
        ellipse(ctx, 0, d * 0.08, d * 0.18, d * 0.09, '#1e2422', null, 0.2);
        ellipse(ctx, -d * 0.1, d * 0.06, d * 0.04, d * 0.04, '#ffffff', null);
        line(ctx, [[d * 0.12, -d * 0.22], [d * 0.12, d * 0.08]], '#1e2422', 1.8);
        line(ctx, [[d * 0.12, -d * 0.1], [d * 0.24, -d * 0.18]], '#1e2422', 1.4);
        line(ctx, [[d * 0.12, -d * 0.04], [0, -d * 0.12]], '#1e2422', 1.4);
      } else {
        ellipse(ctx, 0, -d * 0.1, d * 0.07, d * 0.18, '#1e2422', null);
        ellipse(ctx, 0, d * 0.2, d * 0.07, d * 0.07, '#1e2422', null);
      }
      ctx.restore();
    }
  };

  const kit = {
    INK,
    TAU,  // các gói lấy TAU từ kit; thiếu thì mọi arc/góc thành NaN và hình âm thầm biến mất
    tone,
    volume,
    cylinder,
    taper,
    limb,
    mitten,
    leaf,
    blade,
    ellipse,
    path,
    line,
    withCut,
    mixColor,
    hash,
    clamp,
    smooth,
    mix,
    celHatch,
    W,
    H,
    FRUIT_BODIES,
    FRUIT_SEEDS,
    FRUIT_LIMBS,
    BACKGROUNDS,
    RIG_DRAWERS,
    chibiSkeleton,
    solveArm,
    rotate,
    PICTOGRAMS,
  };
  const CUSTOM_EFFECTS = [];
  const RIG_OVERLAYS = {};
  const ACTION_HOOKS = {};
  function register(pack) {
    if (!pack) return;
    // Gói chỉ được thêm mới: trùng id sẽ âm thầm thay rig/hình nền cũ trong mọi story đang dùng.
    const taken = (table, ids, kind) => {
      const dup = ids.filter(id => Object.prototype.hasOwnProperty.call(table, id));
      if (dup.length) throw new Error(`RemakeVector.register: ${kind} đã tồn tại: ${dup.join(', ')}`);
    };
    if (pack.backgrounds) taken(BACKGROUNDS, Object.keys(pack.backgrounds), 'hình nền');
    if (pack.rigs) taken(RIG_DRAWERS, Object.keys(pack.rigs), 'rig');
    if (pack.actionHooks) taken(ACTION_HOOKS, Object.keys(pack.actionHooks), 'action hook');
    if (pack.rigs) for (const [id, def] of Object.entries(pack.rigs)) {
      if (!def || typeof def.draw !== 'function' && typeof def.drawActor !== 'function') throw new Error(`RemakeVector.register: rig ${id} thiếu hàm draw`);
    }
    if (pack.backgrounds) Object.assign(BACKGROUNDS, pack.backgrounds);
    if (pack.rigs) {
      for (const [id, def] of Object.entries(pack.rigs)) {
        if (def.group === 'fruit' || def.group === 'vegetable') {
          if (def.draw) FRUIT_BODIES[id] = def.draw;
          if (def.spec) FRUIT_LIMBS[id] = def.spec;
          if (def.seeds) FRUIT_SEEDS[id] = def.seeds;
          RIG_DRAWERS[id] = drawFruit;
        } else if (def.group === 'plant') {
          if (def.draw) FARM_PLANTS[id] = def.draw;
          RIG_DRAWERS[id] = drawPlant;
        } else if (def.group === 'tool') {
          if (def.draw) TOOL_DRAWERS[id] = def.draw;
          RIG_DRAWERS[id] = drawTool;
        } else if (def.group === 'prop') {
          if (def.draw) PROP_DRAWERS[id] = def.draw;
          RIG_DRAWERS[id] = drawProp;
        } else {
          RIG_DRAWERS[id] = def.drawActor || ((ctx, s, t, cat, cels) => def.draw(ctx, s, t, cat, kit));
        }
        if (def.overlay) RIG_OVERLAYS[id] = def.overlay;
      }
    }
    if (pack.effects) {
      for (const ef of Array.isArray(pack.effects) ? pack.effects : [pack.effects]) {
        CUSTOM_EFFECTS.push(ef);
      }
    }
    if (pack.actionHooks) {
      Object.assign(ACTION_HOOKS, pack.actionHooks);
    }
  }
  return {
    Renderer,
    sample,
    track,
    exposureTime,
    worldAnchor,
    worldToLocal,
    localAnchor,
    handSkeleton,
    farmerSkeleton,
    loadCelSheets,
    celsReady,
    CEL_CELLS,
    kit,
    register,
    BACKGROUNDS,
    version: '1.11.0'
  };
})();
