// Gói Ruộng Lạc (peanut_field)
// Phiên bản: 1.0.0
// 4 rig cho phim "cây lạc & bác nông dân":
//   peanut_bush  – bụi lạc lá chét tròn (nhóm plant). `bend` ép bụi dẹt sát đất,
//                  `roots` lộ tia lạc + chùm củ dưới đất (y > 0), `growth` lớn bụi.
//   soil_inset   – bong bóng mặt cắt đất chèn trong cảnh (nhóm prop); `growth` cho
//                  tia lạc đâm sâu xuống đất rồi phình thành củ.
//   face_tuft    – mặt gắn có chỏm tóc (đọt ngọn).
//   face_lashes  – mặt gắn có mi + phấn mắt tím (cành gốc); `tears` vẽ dòng nước mắt.
// Không vẽ chữ (không fillText). Anchor trong catalog phải khớp các toạ độ dưới đây.

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('peanut_field pack: RemakeVector core engine chưa được nạp.');
  }

  const { INK, TAU, tone, volume, ellipse, path, line, clamp } = RemakeVector.kit;

  // Cùng công thức plantPoint của core: anchor của rig plant đi qua plantPoint, nên hình
  // vẽ phải co giãn y hệt thì mặt gắn vào shoot/branch mới nằm đúng chỗ khi bụi bị ép.
  function plantPoint(s, x, y) {
    if (y >= 0) return [x, y];
    return [x * (1 + (s.bend || 0) * .25), y * (.7 + .3 * clamp(s.growth)) * (1 - .68 * (s.bend || 0))];
  }

  const LEAF = '#79bd4c', LEAF_DARK = '#4f9638', LEAF_LINE = '#2c5f27', STEM = '#4b8f3a', PEG = '#a2466a';
  const POD = '#e7c35e', POD_LINE = '#8f6f2c';

  // Bố cục chùm lá cố định (tất định): hàng trên hẹp, hàng dưới rộng → dáng vòm như bụi lạc.
  const CLUSTERS = (() => {
    const out = [];
    const rows = [[-90, 3, 20], [-76, 4, 32], [-61, 5, 42], [-46, 6, 50], [-31, 6, 55], [-17, 5, 56]];
    rows.forEach(([y, n, span], r) => {
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : i / (n - 1) * 2 - 1;
        const jitter = Math.sin((r + 1) * 12.9898 + i * 78.233) * 3.2;
        out.push({ x: u * span + jitter, y: y + Math.cos(i * 1.7 + r) * 3 - (1 - u * u) * 4, row: r, tilt: u * .5 });
      }
    });
    return out;
  })();

  function leaflet(ctx, x, y, k, angle, fill) {
    const dx = Math.sin(angle) * 7.2 * k, dy = -Math.cos(angle) * 7.2 * k;
    const cx = x + dx, cy = y + dy, rx = 5 * k, ry = 8.2 * k;
    ellipse(ctx, cx, cy, rx, ry, volume(ctx, cx, cy, rx, ry, fill, .22, -.3), LEAF_LINE, 1.1, angle);
    line(ctx, [[x + dx * .35, y + dy * .35], [x + dx * 1.6, y + dy * 1.6]], tone(fill, -.28), .8);
  }

  function leafCluster(ctx, x, y, k, tilt, fill) {
    // Lá lạc kép: 4 lá chét thành 2 cặp quanh cuống.
    for (const a of [-1.05, -.38, .38, 1.05]) leaflet(ctx, x, y, k, a + tilt, fill);
  }

  function peanutPod(ctx, x, y, k, angle) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(k, k);
    path(ctx, 'M 0 -9 C 5 -9 5.5 -4 3.6 -1 C 5.6 2 5.4 9 0 9 C -5.4 9 -5.6 2 -3.6 -1 C -5.5 -4 -5 -9 0 -9 Z',
      volume(ctx, 0, 0, 5, 9, POD, .25, -.3), POD_LINE, 1.1);
    for (let i = -1; i <= 1; i++) line(ctx, [[-2.6, i * 4.5], [2.6, i * 4.5 + .6]], tone(POD, -.22), .7);
    ctx.restore();
  }

  // Chùm củ dưới đất: số củ theo growth, độ hiện theo roots (lộ khi nhổ / mặt cắt).
  function podCluster(ctx, s) {
    const show = clamp(s.roots || 0);
    if (show <= .01) return;
    ctx.save(); ctx.globalAlpha *= show;
    const n = Math.round(4 + clamp(s.growth) * 14);
    for (let i = 0; i < n; i++) {
      const u = (i / Math.max(1, n - 1)) * 2 - 1;
      const x = u * 24 + Math.sin(i * 2.7) * 4, y = 12 + Math.abs(Math.sin(i * 1.9)) * 26 + (1 - Math.abs(u)) * 6;
      line(ctx, [[x * .35, 1], [x, y - 7]], PEG, 1.2);
      peanutPod(ctx, x, y, .55 + clamp(s.growth) * .25, Math.sin(i * 3.1) * .6);
    }
    ctx.restore();
  }

  function drawPeanutBush(ctx, s) {
    const g = clamp(s.growth), k = .55 + .45 * g, widen = .72 + .28 * g;
    const pt = (x, y) => plantPoint(s, x * widen, y);
    podCluster(ctx, s);
    // Cuống chính toả từ gốc lên các chùm lá hàng giữa.
    const stems = CLUSTERS.filter(c => c.row === 3 || c.row === 1);
    for (const c of stems) {
      const [tx, ty] = pt(c.x, c.y), [mx, my] = pt(c.x * .35, c.y * .45);
      path(ctx, `M 0 0 Q ${mx} ${my} ${tx} ${ty}`, null, INK, 3.4);
      path(ctx, `M 0 0 Q ${mx} ${my} ${tx} ${ty}`, null, STEM, 2);
    }
    // Tia lạc (cuống hoa đỏ tím) cắm xuống đất ở chân bụi khi cây đã lớn.
    if (g > .8) {
      const pegs = Math.round((g - .8) / .2 * 4);
      for (let i = 0; i < pegs; i++) {
        const side = i % 2 ? 1 : -1, bx = side * (8 + i * 3.5), [px, py] = pt(bx, -14 - (i % 3) * 4);
        path(ctx, `M ${px} ${py} Q ${px + side * 3} ${py * .4} ${px + side * 2} 2`, null, INK, 2.6);
        path(ctx, `M ${px} ${py} Q ${px + side * 3} ${py * .4} ${px + side * 2} 2`, null, PEG, 1.4);
      }
    }
    // Lá: hàng trên (sau) trước, hàng dưới (trước) sau; hàng trước sáng hơn.
    for (const c of CLUSTERS) {
      const [x, y] = pt(c.x, c.y), shade = .1 - c.row * .045;
      const fill = c.row < 2 ? tone(LEAF_DARK, .08) : tone(LEAF, -shade);
      leafCluster(ctx, x, y, k * (1 - (s.bend || 0) * .15), c.tilt * (1 + (s.bend || 0)), fill);
    }
    // Vài hoa vàng nhỏ khi bụi trưởng thành.
    if (g > .65) for (const [fx, fy] of [[-30, -40], [26, -55], [6, -30]]) {
      const [x, y] = pt(fx, fy);
      ellipse(ctx, x, y, 3.2, 2.6, '#f6d23c', '#b48a1c', .8);
    }
  }

  // ---- Bong bóng mặt cắt đất ----------------------------------------------------
  const BUBBLE = { cx: 0, cy: -58, r: 44 };
  function drawSoilInset(ctx, s) {
    const g = clamp(s.growth), { cx, cy, r } = BUBBLE, surface = cy - 10;
    const outline = `M ${cx - 9} ${cy + r - 2} L ${cx - 2} 0 L ${cx + 11} ${cy + r - 3}`;
    // Đuôi bong bóng trỏ xuống bụi lạc.
    path(ctx, `${outline} Z`, '#fffdf4', INK, 2.4);
    ctx.save();
    const clip = new Path2D(); clip.arc(cx, cy, r, 0, TAU); ctx.clip(clip);
    ctx.fillStyle = '#cdeccf'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Đất mặt cắt + hạt sỏi.
    ctx.fillStyle = '#6e4529'; ctx.fillRect(cx - r, surface, r * 2, r * 2);
    ctx.fillStyle = '#5a3720'; ctx.fillRect(cx - r, surface + 26, r * 2, r * 2);
    for (let i = 0; i < 26; i++) {
      const x = cx - r + ((i * 37) % 88), y = surface + 4 + ((i * 23) % 50);
      ellipse(ctx, x, y, 1.2 + (i % 3) * .5, .9 + (i % 2) * .4, i % 2 ? '#8a6040' : '#4a2c18', null);
    }
    line(ctx, [[cx - r, surface], [cx + r, surface]], '#3f2a17', 1.6);
    // Tia lạc đâm sâu dần, phình củ ở cuối khi growth > .7.
    const pegs = [-30, -20, -10, 0, 10, 20, 30];
    pegs.forEach((px, i) => {
      const len = 5 + g * (24 + (i % 3) * 5), tip = [px + Math.sin(i * 1.3) * 3, surface + len];
      path(ctx, `M ${px} ${surface - 3} Q ${px + 2} ${surface + len * .5} ${tip[0]} ${tip[1]}`, null, INK, 2.6);
      path(ctx, `M ${px} ${surface - 3} Q ${px + 2} ${surface + len * .5} ${tip[0]} ${tip[1]}`, null, PEG, 1.4);
      if (g > .7) peanutPod(ctx, tip[0], tip[1] + 3, .35 + (g - .7) / .3 * .3, Math.sin(i) * .4);
    });
    // Hàng lá lạc trên mặt đất (bụi đã ép sát đất).
    for (let i = 0; i < 9; i++) {
      const x = cx - 40 + i * 10;
      leafCluster(ctx, x, surface - 3, .42, (i % 2 ? .3 : -.3), i % 2 ? LEAF : tone(LEAF, -.08));
    }
    ctx.restore();
    // Viền bong bóng, phủ lên chỗ nối đuôi.
    ellipse(ctx, cx, cy, r, r, null, '#fffdf4', 5);
    ellipse(ctx, cx, cy, r + 2.6, r + 2.6, null, INK, 2.2);
    path(ctx, outline, null, INK, 2.4);
    path(ctx, `M ${cx - 7} ${cy + r - 1} L ${cx + 9} ${cy + r - 2}`, null, '#fffdf4', 4);
  }

  // ---- Mặt gắn có tóc / mi ------------------------------------------------------
  // Mặt core vẽ quanh anchor face [0, -50] với cỡ face_scale 1.45: mắt ở x ±14.5, mép trên ~ -66.
  const FACE = { y: -50, k: 1.45 };
  function tearStreams(ctx, s) {
    const tears = clamp(s.tears || 0);
    if (tears <= .01) return;
    for (const side of [-1, 1]) {
      const x = side * 10 * FACE.k, y0 = FACE.y + 8, len = 34 * tears;
      path(ctx, `M ${x - 4} ${y0} L ${x + 4} ${y0} L ${x + 5 + side} ${y0 + len} Q ${x} ${y0 + len + 5} ${x - 5 + side} ${y0 + len} Z`,
        'rgba(110, 196, 240, 0.92)', '#3b8fc6', 1.1);
      line(ctx, [[x - 1, y0 + 3], [x - 1, y0 + len - 4]], 'rgba(255,255,255,0.75)', 1.2);
    }
  }

  function drawFaceTuft(ctx, s) {
    // Chỏm tóc đen xoăn trên đỉnh đầu (vẽ trước mặt, lông mày đè lên).
    const y = FACE.y - 23 * FACE.k;
    path(ctx, `M -4 ${y + 4} C -10 ${y - 8} -2 ${y - 16} 6 ${y - 14} C 14 ${y - 12} 16 ${y - 20} 12 ${y - 24} C 22 ${y - 18} 20 ${y - 6} 10 ${y - 6} C 6 ${y - 6} 4 ${y} 4 ${y + 4} Z`,
      '#1d1a1a', INK, 1.4);
    path(ctx, `M -2 ${y + 2} C -14 ${y - 2} -16 ${y - 12} -9 ${y - 16} C -10 ${y - 9} -6 ${y - 5} 0 ${y - 3} Z`, '#1d1a1a', INK, 1.2);
  }
  function faceTuftOverlay(ctx, s) { tearStreams(ctx, s); }

  function drawFaceLashes() {}
  function faceLashesOverlay(ctx, s) {
    const e = s.expression;
    if (e !== 'sleep' && e !== 'happy' && e !== 'dizzy') {
      const ry = (e === 'surprised' ? 12.5 : 10.5) * FACE.k;
      for (const side of [-1, 1]) {
        const ex = side * 10 * FACE.k, top = FACE.y - ry;
        // Phấn mắt tím và hàng mi cong ra ngoài.
        path(ctx, `M ${ex - 11} ${top + 4} Q ${ex} ${top - 6} ${ex + 11} ${top + 4}`, null, '#9a55c4', 3.2);
        for (let i = 0; i < 3; i++) {
          const a = (side > 0 ? -.2 : -2.94) + side * i * .42, bx = ex + side * (5 + i * 3), by = top + 1 + i * 1.6;
          line(ctx, [[bx, by], [bx + Math.cos(a) * 7, by + Math.sin(a) * 7 - 2]], INK, 1.7);
        }
      }
    }
    tearStreams(ctx, s);
  }

  RemakeVector.register({
    rigs: {
      peanut_bush: { group: 'plant', draw: drawPeanutBush },
      soil_inset: { group: 'prop', draw: drawSoilInset },
      face_tuft: { group: 'rig', draw: drawFaceTuft, overlay: faceTuftOverlay },
      face_lashes: { group: 'rig', draw: drawFaceLashes, overlay: faceLashesOverlay },
    },
  });
})();
