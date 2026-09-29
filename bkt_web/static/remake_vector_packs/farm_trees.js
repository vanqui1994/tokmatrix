// Remake Vector Engine Pack: Farm Trees (Giai đoạn B)
// Cây ăn quả, động tác hái/rung cây, và hình nền đồng quê
(function() {
  'use strict';
  if (!globalThis.RemakeVector) throw new Error('RemakeVector core engine must be loaded before engine packs.');
  const { kit, register } = globalThis.RemakeVector;
  const { INK, tone, volume, cylinder, limb, leaf, blade, ellipse, path, line, withCut, hash, clamp, smooth, FRUIT_BODIES } = kit;
  const TAU = Math.PI * 2;

  const FRUIT_COLORS = {
    apple: [[139, 196, 74], [232, 196, 70], [214, 50, 48]],
    tomato: [[112, 178, 66], [240, 160, 52], [226, 58, 44]],
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
    dragon_fruit: [[154, 200, 90], [224, 90, 138], [224, 48, 106]],
    starfruit: [[140, 200, 78], [216, 216, 74], [240, 200, 58]],
    jackfruit: [[127, 168, 74], [168, 176, 74], [200, 176, 74]],
    olive: [[115, 145, 60], [140, 160, 65], [65, 80, 40]],
  };

  function ripenColor(fruitId, g) {
    const stops = FRUIT_COLORS[fruitId] || [[120, 180, 70], [220, 180, 60], [220, 60, 50]];
    const scaled = clamp(g) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    const u = scaled - i;
    const r = Math.round(stops[i][0] + (stops[i + 1][0] - stops[i][0]) * u);
    const gCol = Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * u);
    const b = Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * u);
    return `rgb(${r},${gCol},${b})`;
  }

  // Thông số từng loài. slots = tâm quả ở growth 1 (hệ 100 đơn vị, gốc đáy-giữa), anchor fruit_N lấy từ đây.
  // flower: petal5 | panicle (chùm nhỏ) | bell (chuông rủ) | spike (bông mo dừa) | star (hoa đêm lớn) | bloom (hoa dứa) | none
  // edge: lá rìa tán — lance (lá thuôn rủ) | small (lá nhỏ dày) | broad (lá to thưa).
  const TREE_SPECS = {
    mango_tree: {
      fruit: 'mango', trunk: 'forked', canopy: 'spread', leaf: 'lance', edge: 'lance', canopyScale: 1,
      leafColor: '#4e8c3a', flower: 'panicle', blossom: { color: '#f3e3a0', center: '#d89c30' },
      fruitScale: 0.17, stalk: 12, onTrunk: false,
      slots: [[-26, -52], [22, -50], [-8, -56], [36, -60], [-38, -62], [8, -48]]
    },
    orange_tree: {
      fruit: 'orange', trunk: 'forked', canopy: 'round', leaf: 'small', edge: 'small', canopyScale: 1,
      leafColor: '#3e8236', flower: 'petal5', blossom: { color: '#ffffff', center: '#f4d040' },
      fruitScale: 0.13, stalk: 4, onTrunk: false,
      slots: [[-24, -70], [20, -68], [-8, -82], [12, -86], [-28, -86], [28, -80], [2, -70]]
    },
    lime_tree: {
      fruit: 'lime', trunk: 'bush', canopy: 'round', leaf: 'small', edge: 'small', canopyScale: 0.82,
      leafColor: '#488e38', flower: 'petal5', blossom: { color: '#ffffff', center: '#e0d860' },
      fruitScale: 0.11, stalk: 3, onTrunk: false,
      slots: [[-18, -66], [16, -64], [-6, -76], [10, -80], [-22, -78], [22, -74]]
    },
    apple_tree: {
      fruit: 'apple', trunk: 'forked', canopy: 'round', leaf: 'broad', edge: 'broad', canopyScale: 1,
      leafColor: '#428238', flower: 'petal5', blossom: { color: '#ffd8e0', center: '#f0b830' },
      fruitScale: 0.14, stalk: 5, onTrunk: false,
      slots: [[-22, -68], [20, -66], [-6, -80], [14, -84], [-28, -84], [30, -76]]
    },
    coconut_palm: {
      fruit: 'coconut', trunk: 'palm', canopy: 'palm_fronds', leaf: 'frond', edge: 'none', canopyScale: 1,
      leafColor: '#3f8435', flower: 'spike', blossom: { color: '#e8df9a', center: '#c4a040' },
      fruitScale: 0.15, stalk: 0, onTrunk: false,
      slots: [[-16, -74], [0, -73], [-8, -68], [-23, -78], [7, -78]]
    },
    durian_tree: {
      fruit: 'durian', trunk: 'straight', canopy: 'oval', leaf: 'broad', edge: 'broad', canopyScale: 1,
      leafColor: '#4a7836', flower: 'bell', blossom: { color: '#f2ecc8', center: '#c8b050' },
      fruitScale: 0.17, stalk: 9, onTrunk: false,
      slots: [[-24, -45], [24, -43], [-19, -61], [20, -59], [-6, -54]]
    },
    jackfruit_tree: {
      fruit: 'jackfruit', trunk: 'straight', canopy: 'oval', leaf: 'broad', edge: 'broad', canopyScale: 1,
      leafColor: '#366e2e', flower: 'none', blossom: null,
      fruitScale: 0.19, stalk: 0, onTrunk: true,
      slots: [[-14, -34], [14, -46], [-13, -58], [14, -20]]
    },
    lychee_tree: {
      fruit: 'lychee', trunk: 'forked', canopy: 'round', leaf: 'small', edge: 'small', canopyScale: 1,
      leafColor: '#3d7e35', flower: 'panicle', blossom: { color: '#f0f4d8', center: '#c0b050' },
      fruitScale: 0.09, stalk: 3, onTrunk: false,
      slots: [[-25, -64], [-19, -62], [-22, -58], [18, -70], [24, -68], [21, -64], [-1, -82], [5, -80]]
    },
    rambutan_tree: {
      fruit: 'rambutan', trunk: 'forked', canopy: 'round', leaf: 'broad', edge: 'broad', canopyScale: 1,
      leafColor: '#3d7e35', flower: 'panicle', blossom: { color: '#eef2cc', center: '#b8a848' },
      fruitScale: 0.1, stalk: 3, onTrunk: false,
      slots: [[-24, -66], [-18, -64], [-21, -59], [20, -72], [26, -70], [22, -65], [0, -84], [6, -82]]
    },
    guava_tree: {
      fruit: 'guava', trunk: 'forked', canopy: 'spread', leaf: 'broad', edge: 'broad', canopyScale: 1,
      leafColor: '#4a8a3c', flower: 'petal5', blossom: { color: '#ffffff', center: '#f0d860' },
      fruitScale: 0.13, stalk: 4, onTrunk: false, bark: '#9a7a5a',
      slots: [[-26, -62], [24, -60], [-8, -72], [14, -76], [-34, -70], [32, -68]]
    },
    avocado_tree: {
      fruit: 'avocado', trunk: 'straight', canopy: 'oval', leaf: 'lance', edge: 'lance', canopyScale: 1,
      leafColor: '#2f6a2b', flower: 'panicle', blossom: { color: '#e2ecb0', center: '#a4b450' },
      fruitScale: 0.14, stalk: 8, onTrunk: false,
      slots: [[-22, -48], [22, -46], [-17, -64], [18, -62], [-4, -56]]
    },
    dragon_fruit_cactus: {
      fruit: 'dragon_fruit', trunk: 'cactus_post', canopy: 'none', leaf: 'succulent', edge: 'none', canopyScale: 1,
      leafColor: '#5a9a3c', flower: 'star', blossom: { color: '#fffdf2', center: '#f2e08a' },
      fruitScale: 0.16, stalk: 0, onTrunk: false,
      slots: [[-30, -40], [30, -42], [-19, -30], [19, -31]]
    },
    pineapple_plant: {
      fruit: 'pineapple', trunk: 'rosette', canopy: 'none', leaf: 'needle', edge: 'none', canopyScale: 1,
      leafColor: '#4f8f54', flower: 'bloom', blossom: { color: '#c0487a', center: '#7a3b8a' },
      fruitScale: 0.3, stalk: 0, onTrunk: false,
      slots: [[0, -30]]
    },
    strawberry_plant: {
      fruit: 'strawberry', trunk: 'rosette', canopy: 'none', leaf: 'trifoliate', edge: 'none', canopyScale: 1,
      leafColor: '#468e3c', flower: 'petal5', blossom: { color: '#ffffff', center: '#f4d030' },
      fruitScale: 0.1, stalk: 6, onTrunk: false,
      slots: [[-22, -7], [21, -8], [-9, -6], [10, -7], [0, -9]]
    },
    mangosteen_tree: {
      fruit: 'mangosteen', trunk: 'forked', canopy: 'round', leaf: 'broad', edge: 'broad', canopyScale: 0.95,
      leafColor: '#2e6828', flower: 'petal5', blossom: { color: '#f2d0dc', center: '#d07090' },
      fruitScale: 0.12, stalk: 4, onTrunk: false,
      slots: [[-20, -68], [20, -66], [-6, -80], [12, -82], [-26, -80], [26, -76]]
    },
    // Cây xứ lạnh (Giai đoạn D). winterFruit: quả còn trên cành trụi lá mùa đông (hồng).
    persimmon_tree: {
      fruit: 'persimmon', trunk: 'forked', canopy: 'round', leaf: 'broad', edge: 'broad', canopyScale: 1,
      leafColor: '#4a8a3a', flower: 'petal5', blossom: { color: '#fced98', center: '#d68e24' },
      fruitScale: 0.14, stalk: 5, onTrunk: false, winterFruit: true,
      slots: [[-22, -64], [18, -60], [-8, -78], [12, -82], [-26, -80], [26, -72]]
    },
    peach_tree: {
      fruit: 'peach', trunk: 'forked', canopy: 'spread', leaf: 'lance', edge: 'lance', canopyScale: 1,
      leafColor: '#4e8c3a', flower: 'petal5', blossom: { color: '#ffb6c8', center: '#e64268' },
      fruitScale: 0.14, stalk: 6, onTrunk: false,
      slots: [[-26, -54], [22, -52], [-8, -60], [34, -60], [-36, -62], [10, -50]]
    },
    pear_tree: {
      fruit: 'pear', trunk: 'forked', canopy: 'oval', leaf: 'small', edge: 'small', canopyScale: 0.95,
      leafColor: '#428638', flower: 'petal5', blossom: { color: '#ffffff', center: '#e2ca42' },
      fruitScale: 0.14, stalk: 8, onTrunk: false,
      slots: [[-20, -64], [18, -62], [-6, -78], [14, -80], [-22, -80], [22, -72]]
    },
    cherry_tree: {
      fruit: 'cherry', trunk: 'forked', canopy: 'spread', leaf: 'small', edge: 'small', canopyScale: 1,
      leafColor: '#3c7e32', flower: 'petal5', blossom: { color: '#ffd6e4', center: '#e85c84' },
      fruitScale: 0.12, stalk: 8, onTrunk: false,
      slots: [[-24, -56], [20, -54], [-6, -62], [30, -62], [-32, -64], [8, -52]]
    },
    starfruit_tree: {
      fruit: 'starfruit', trunk: 'forked', canopy: 'spread', leaf: 'small', edge: 'small', canopyScale: 1,
      leafColor: '#468e3c', flower: 'panicle', blossom: { color: '#e27ab4', center: '#b04a8a' },
      fruitScale: 0.14, stalk: 7, onTrunk: false,
      slots: [[-26, -54], [22, -52], [-8, -58], [36, -62], [-36, -64], [8, -50]]
    },
    olive_tree: {
      fruit: 'olive', trunk: 'forked', canopy: 'spread', leaf: 'small', edge: 'small', canopyScale: 0.95,
      leafColor: '#5c7850', flower: 'petal5', blossom: { color: '#ffffff', center: '#e2ca42' },
      fruitScale: 0.1, stalk: 4, onTrunk: false, bark: '#7a7060',
      slots: [[-22, -54], [20, -52], [-6, -60], [30, -58], [-32, -62], [8, -48]]
    },
  };

  // Hệ số co của anchor nhóm plant (plantPoint trong lõi): hình vẽ phải co y hệt để quả nằm đúng fruit_N.
  function growthScale(s) {
    const bend = s.bend || 0, g = clamp(s.growth ?? 0.5);
    return [1 + bend * 0.25, (0.7 + 0.3 * g) * (1 - 0.68 * bend)];
  }

  function drawFlower(ctx, kind, blossom, scale, t, i) {
    const bCol = blossom.color, cCol = blossom.center || '#ffd840';
    ctx.save(); ctx.scale(scale, scale);
    if (kind === 'panicle') {
      // Chùm hoa nhỏ dựng đứng (xoài, vải, chôm chôm, bơ, khế)
      for (let r = 0; r < 4; r++) for (let k = 0; k <= r; k++) {
        const x = (k - r / 2) * 3.2, y = -12 + r * 3.4;
        ellipse(ctx, x, y, 1.7, 1.7, k % 2 ? cCol : bCol, INK, 0.4);
      }
      line(ctx, [[0, -12], [0, 4]], '#6f8a3a', 1.1);
    } else if (kind === 'bell') {
      // Chùm hoa chuông rủ (sầu riêng)
      line(ctx, [[0, -6], [0, 2]], '#6f6a3a', 1);
      for (const dx of [-4, 0, 4]) {
        path(ctx, `M ${dx - 2.6} 2 Q ${dx} 12 ${dx + 2.6} 2 Z`, volume(ctx, dx, 6, 3, 5, bCol), INK, 0.6);
        ellipse(ctx, dx, 11, 0.9, 1.4, cCol, null);
      }
    } else if (kind === 'spike') {
      // Bông mo dừa: các sợi hoa vàng rủ xuống
      for (let k = -3; k <= 3; k++) path(ctx, `M 0 -2 Q ${k * 3} 4 ${k * 4.2} ${12 + Math.abs(k)}`, null, bCol, 1.6);
    } else if (kind === 'star') {
      // Hoa thanh long nở đêm: nhiều cánh trắng dài
      for (let p = 0; p < 12; p++) {
        const a = (p / 12) * Math.PI * 2;
        ellipse(ctx, Math.cos(a) * 7, Math.sin(a) * 7, 6.5, 1.8, volume(ctx, Math.cos(a) * 7, Math.sin(a) * 7, 6.5, 2, bCol), INK, 0.5, a);
      }
      ellipse(ctx, 0, 0, 3.4, 3.4, cCol, INK, 0.6);
    } else if (kind === 'bloom') {
      // Hoa dứa: bắp tím đỏ giữa hoa thị lá
      ellipse(ctx, 0, 0, 6, 9, volume(ctx, 0, 0, 6, 9, bCol), INK, 0.9);
      for (let k = 0; k < 6; k++) ellipse(ctx, (k % 2 ? 2 : -2), -6 + k * 2.4, 1.2, 1.2, cCol, null);
    } else {
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        ellipse(ctx, Math.cos(pa) * 4.5, Math.sin(pa) * 4.5, 3.2, 2.2, volume(ctx, Math.cos(pa) * 4.5, Math.sin(pa) * 4.5, 3.2, 2.2, bCol), INK, 0.7, pa);
      }
      ellipse(ctx, 0, 0, 2.2, 2.2, cCol, INK, 0.6);
    }
    ctx.restore();
  }

  function drawFruitTree(ctx, s, t, spec) {
    const g = clamp(s.growth ?? 0.5);
    const shake = s.shake || 0;
    const seed = hash(s.id);
    const wind = s.wind || 0;
    const season = s.season || 'summer';
    let leafColor = s.style.leaf || spec.leafColor;
    if (season === 'autumn') leafColor = tone('#cf842e', (seed % 5) * 0.05);
    else if (season === 'winter') leafColor = tone('#6b7468', -0.1);
    else if (season === 'spring') leafColor = tone(leafColor, 0.15);

    const trunkColor = s.style.bark || spec.bark || (spec.trunk === 'palm' ? '#8a6a42' : spec.trunk === 'cactus_post' ? '#8e8b82' : '#6b4d2e');

    if (s.roots) {
      ctx.save();
      ctx.globalAlpha *= s.roots;
      for (let i = -3; i <= 3; i++) {
        const x = i * 9, len = 22 + (3 - Math.abs(i)) * 7;
        path(ctx, `M 0 0 Q ${x} 10 ${x} ${len} l ${i % 2 ? -4 : 4} 8`, null, '#e3d9a9', 1.1);
      }
      ctx.restore();
    }
    if (s.nutrients) {
      for (let i = 0; i < 7; i++) ellipse(ctx, (i - 3) * 6, 3 + (i % 2) * 4, 2, 2.6, '#efd9a0', '#9d8350', 0.6);
    }

    // 0. CÂY CON (growth < 0.25): thân mảnh mọc thẳng/uốn nhẹ, 3 lá non
    if (g < 0.25) {
      const p = g / 0.25;
      const h = -15 - p * 35;
      path(ctx, `M -2 0 Q ${shake * 10} ${h * 0.5} 0 ${h}`, null, INK, 3.2);
      path(ctx, `M -2 0 Q ${shake * 10} ${h * 0.5} 0 ${h}`, null, trunkColor, 1.8);
      for (let i = 0; i < 3; i++) {
        const side = i % 2 ? 1 : -1;
        const ly = h * (0.35 + i * 0.28);
        const lAngle = side * 0.8 + (Math.sin(t * 3 + i) * 0.1);
        leaf(ctx, side * 3, ly, 0.35 + p * 0.2, lAngle, leafColor);
      }
      return;
    }

    ctx.save();
    if (shake) ctx.rotate(shake);
    const [xs, ys] = growthScale(s);
    ctx.scale(xs, ys);
    // Quả/hoa vẽ ngược hệ số co để giữ đúng hình, chỉ vị trí co theo cây.
    const atSlot = (fx, fy, draw) => { ctx.save(); ctx.translate(fx, fy); ctx.scale(1 / xs, 1 / ys); draw(); ctx.restore(); };

    // 1. THÂN
    if (spec.trunk === 'palm') {
      const topX = -8 + Math.sin(t * 1.5 + seed) * wind * 3;
      path(ctx, `M -7 0 Q -18 -45 ${topX - 4} -82 L ${topX + 4} -82 Q -6 -45 7 0 Z`, cylinder(ctx, -7, 7, trunkColor), INK, 2.0);
      for (let i = 1; i <= 10; i++) {
        const py = -i * 7.5;
        const cx = -3 - (py / -82) * 5;
        path(ctx, `M ${cx - 5} ${py} Q ${cx} ${py - 3} ${cx + 5} ${py}`, null, tone(trunkColor, -0.28), 1.4);
      }
    } else if (spec.trunk === 'cactus_post') {
      // Trụ bê tông, trên đỉnh là các nhánh xương rồng 3 cạnh vắt qua, rủ xuống hai bên.
      path(ctx, 'M -6 0 L -6 -56 L 6 -56 L 6 0 Z', cylinder(ctx, -6, 6, trunkColor), INK, 2.0);
      path(ctx, 'M -18 -56 L 18 -56 L 16 -61 L -16 -61 Z', '#7d7a72', INK, 1.4);
      for (const [ex, ey] of spec.slots) {
        const side = Math.sign(ex);
        const mid = [side * 10, -72], knee = [ex + side * 4, ey - 16];
        limb(ctx, [[side * 3, -60], mid, knee, [ex, ey - 4]], leafColor, 7.5);
        line(ctx, [[side * 3, -60], mid, knee, [ex, ey - 4]], tone(leafColor, 0.3), 1.6);
        for (let k = 0; k < 4; k++) {
          const u = (k + 0.5) / 4, px = mid[0] + (knee[0] - mid[0]) * u, py = mid[1] + (knee[1] - mid[1]) * u;
          ellipse(ctx, px + side * 3, py - 2, 1.1, 1.1, '#e8e4c0', INK, 0.4);
        }
      }
      // Thân chính mọc từ gốc bám theo trụ
      limb(ctx, [[-2, -2], [-4, -24], [-2, -46], [0, -60]], leafColor, 6);
    } else if (spec.trunk === 'rosette') {
      if (spec.leaf === 'needle') {
        // Dứa: hoa thị lá gai dài, cứng, xoè ra từ gốc.
        for (let i = 0; i < 16; i++) {
          const a = -Math.PI / 2 + (i / 15 - 0.5) * 2.7;
          const len = 30 + (i % 3) * 6;
          const tip = [Math.cos(a) * len, -4 + Math.sin(a) * len * 0.85];
          blade(ctx, Math.cos(a) * 3, tip, tone(leafColor, ((i * 7) % 5) * 0.05 - 0.08), 3.2);
        }
      } else {
        // Dâu tây: lá kép 3 chét trên cuống, bò sát đất, có ngó.
        path(ctx, 'M 0 -3 Q 24 2 34 -2', null, '#6f8a3a', 1.2);
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.4;
          const len = 18 + (i % 2) * 5;
          const tip = [Math.cos(a) * len, -2 + Math.sin(a) * len * 0.9];
          line(ctx, [[0, -2], tip], '#6f8a3a', 1.4);
          for (const d of [-0.7, 0, 0.7]) leaf(ctx, tip[0] + Math.cos(a + d) * 4, tip[1] + Math.sin(a + d) * 4, 0.28, a + d + Math.PI / 2, tone(leafColor, (i % 3) * 0.06), true);
        }
      }
    } else if (spec.trunk === 'bush') {
      for (const bx of [-8, -2, 4, 9]) limb(ctx, [[bx * 0.5, 0], [bx, -25], [bx * 1.8, -48]], trunkColor, 6);
    } else if (spec.trunk === 'straight') {
      path(ctx, 'M -9 0 L -8 -45 L -6 -76 L 6 -76 L 8 -45 L 9 0 Z', cylinder(ctx, -9, 9, trunkColor), INK, 2.2);
      for (let i = 0; i < 7; i++) line(ctx, [[-5, -12 - i * 9], [4, -10 - i * 9]], tone(trunkColor, -0.3), 1.2);
      limb(ctx, [[-7, -48], [-24, -54]], trunkColor, 6.5);
      limb(ctx, [[7, -46], [24, -52]], trunkColor, 6.5);
      limb(ctx, [[-6, -64], [-20, -70]], trunkColor, 5.5);
      limb(ctx, [[6, -62], [20, -68]], trunkColor, 5.5);
    } else {
      // 'forked': thân chẽ ba (xoài, cam, táo, ổi…)
      path(ctx, 'M -8 0 L -8 -38 L 8 -38 L 8 0 Z', cylinder(ctx, -8, 8, trunkColor), INK, 2.2);
      limb(ctx, [[-4, -36], [-16, -56], [-26, -70]], trunkColor, 7);
      limb(ctx, [[4, -36], [15, -54], [25, -68]], trunkColor, 7);
      limb(ctx, [[0, -36], [0, -62], [-4, -80]], trunkColor, 5.5);
    }

    // 2. TÁN
    if (spec.canopy === 'palm_fronds') {
      const topX = -8;
      const fronds = [
        { angle: -2.3, len: 44 }, { angle: -1.8, len: 48 }, { angle: -1.3, len: 46 },
        { angle: -0.7, len: 42 }, { angle: -0.2, len: 40 }, { angle: 0.4, len: 44 },
        { angle: 0.9, len: 48 }, { angle: 1.5, len: 44 }
      ];
      for (const f of fronds) {
        const flutter = Math.sin(t * 3 + f.angle * 2) * wind * 4;
        const tx = topX + Math.cos(f.angle) * f.len + flutter;
        const ty = -82 + Math.sin(f.angle) * f.len * 0.7;
        path(ctx, `M ${topX} -82 Q ${(topX + tx) * 0.5} ${ty - 10} ${tx} ${ty}`, null, INK, 3.5);
        path(ctx, `M ${topX} -82 Q ${(topX + tx) * 0.5} ${ty - 10} ${tx} ${ty}`, null, tone(leafColor, -0.1), 2.0);
        for (let k = 1; k <= 7; k++) {
          const u = k / 8;
          const px = topX + (tx - topX) * u, py = -82 + (ty + 82) * u;
          line(ctx, [[px, py], [px + Math.cos(f.angle + 1.2) * 9, py + Math.sin(f.angle + 1.2) * 7]], leafColor, 1.6);
          line(ctx, [[px, py], [px - Math.cos(f.angle - 1.2) * 9, py - Math.sin(f.angle - 1.2) * 7]], leafColor, 1.6);
        }
      }
    } else if (season === 'winter' && spec.canopy !== 'none') {
      // Mùa đông trụi lá: tuyết đọng trên các nhánh chính
      for (const [x, y] of [[-26, -70], [25, -68], [-4, -80], [-16, -56], [15, -54]]) {
        ellipse(ctx, x, y - 2, 7, 3, '#fbfdff', INK, 0.8);
      }
    } else if (spec.canopy !== 'none') {
      const lobes = spec.canopy === 'spread' ? [
        { x: -30, y: -70, rx: 24, ry: 14 }, { x: 28, y: -68, rx: 24, ry: 14 },
        { x: -14, y: -82, rx: 26, ry: 15 }, { x: 16, y: -80, rx: 26, ry: 15 },
        { x: 0, y: -74, rx: 34, ry: 18 }, { x: -36, y: -60, rx: 18, ry: 11 },
        { x: 34, y: -58, rx: 18, ry: 11 }
      ] : spec.canopy === 'oval' ? [
        { x: 0, y: -76, rx: 26, ry: 28 }, { x: -16, y: -68, rx: 18, ry: 22 },
        { x: 16, y: -68, rx: 18, ry: 22 }, { x: -11, y: -86, rx: 17, ry: 18 },
        { x: 11, y: -86, rx: 17, ry: 18 }, { x: 0, y: -96, rx: 16, ry: 14 }
      ] : [
        { x: 0, y: -74, rx: 32, ry: 24 }, { x: -22, y: -72, rx: 22, ry: 18 },
        { x: 22, y: -70, rx: 22, ry: 18 }, { x: -14, y: -86, rx: 22, ry: 16 },
        { x: 14, y: -84, rx: 22, ry: 16 }, { x: 0, y: -88, rx: 20, ry: 15 }
      ];
      const k = spec.canopyScale || 1, cy = -76;
      for (const lb of lobes) {
        const lx = lb.x * k + Math.sin(t * 2 + lb.x) * wind * 1.5, ly = cy + (lb.y - cy) * k;
        ellipse(ctx, lx, ly, lb.rx * k, lb.ry * k, volume(ctx, lx, ly, lb.rx * k, lb.ry * k, leafColor, 0.22, -0.24), INK, 1.6);
      }
      // Lá rìa tán theo loài
      const edge = spec.edge || 'broad';
      const count = edge === 'small' ? 14 : edge === 'lance' ? 9 : 6;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + (seed % 5) * 0.1;
        const rad = (edge === 'small' ? 32 : 30) * k + (i % 2) * 4;
        const lx = Math.cos(a) * rad, ly = cy + Math.sin(a) * rad * (spec.canopy === 'oval' ? 0.95 : 0.66);
        const col = tone(leafColor, 0.12 + (i % 3) * 0.04);
        if (edge === 'lance') {
          // Lá thuôn dài, rủ xuống (xoài, bơ)
          const droop = Math.PI / 2 + Math.cos(a) * 0.7;
          ellipse(ctx, lx + Math.cos(droop) * 6, ly + Math.sin(droop) * 6, 2.4, 8, volume(ctx, lx, ly, 3, 8, col), INK, 0.8, droop - Math.PI / 2);
        } else if (edge === 'small') {
          ellipse(ctx, lx, ly, 3.2, 2.2, col, INK, 0.6, a);
        } else {
          leaf(ctx, lx, ly, 0.35, a + 0.3, col);
        }
      }
    }

    // 3. HOA khi 0.25 <= g < 0.45 (hoặc mùa xuân)
    const hasFlowers = (g >= 0.25 && g < 0.45) || (season === 'spring' && g < 0.7);
    if (hasFlowers && season !== 'winter' && spec.blossom && spec.flower !== 'none') {
      const bScale = 0.4 + 0.6 * clamp((g - 0.25) / 0.2);
      const kind = spec.flower || 'petal5';
      if (kind === 'spike' || kind === 'bloom') atSlot(spec.slots[0][0], spec.slots[0][1] + (kind === 'spike' ? -6 : 0), () => drawFlower(ctx, kind, spec.blossom, bScale, t, 0));
      else spec.slots.forEach(([fx, fy], i) => atSlot(fx, fy, () => drawFlower(ctx, kind, spec.blossom, bScale, t, i)));
    }

    // 4. QUẢ khi g >= 0.45: vẽ bằng thân quả của lõi (FRUIT_BODIES), tâm thân quả trùng fruit_N.
    if (g >= 0.45 && (season !== 'winter' || spec.winterFruit)) {
      const fruitProgress = clamp((g - 0.45) / 0.55);
      const fruitSizeFactor = 0.5 + 0.5 * fruitProgress;
      const fruitCol = ripenColor(spec.fruit, fruitProgress);
      const numFruits = Math.max(0, Math.min(spec.slots.length, Math.round(s.fruits ?? spec.slots.length)));
      const drawBody = FRUIT_BODIES[spec.fruit];
      const scaleNow = spec.fruitScale * fruitSizeFactor;
      for (let i = 0; i < numFruits; i++) {
        const [fx, fy] = spec.slots[i];
        const top = -50 * scaleNow;  // mép trên của thân quả so với tâm
        if (spec.stalk) line(ctx, [[fx, fy + top / ys - spec.stalk], [fx, fy + top / ys]], tone(trunkColor, -0.2), 1.6);
        atSlot(fx, fy, () => {
          ctx.scale(scaleNow, scaleNow);
          ctx.translate(0, 50);
          drawBody(ctx, { id: `${s.id}_f${i}`, asset: spec.fruit, growth: fruitProgress, style: {} }, fruitCol, t);
        });
      }
    }

    ctx.restore();
  }

  // 5. HÌNH NỀN MỚI CHO GIAI ĐOẠN B
  const BACKGROUNDS = {
    rice_paddy: {
      label: 'Ruộng lúa',
      theme: 'farm',
      ground_y: 810,
      draw(ctx, settings, t, kit) {
        const W = 576, H = 1024;
        const night = settings.time === 'night';
        const rain = settings.weather === 'rain' || settings.weather === 'storm';
        // Trời
        ctx.fillStyle = night ? '#1b2a3a' : rain ? '#8da3a8' : '#b8e4ea';
        ctx.fillRect(-2000, -2000, 4500, 5000);
        if (!night) {
          // Mây trắng trôi
          ellipse(ctx, 140, 110, 65, 22, '#ffffff', null);
          ellipse(ctx, 420, 130, 80, 26, '#ffffff', null);
        } else {
          // Trăng đêm
          ellipse(ctx, 450, 110, 26, 26, '#f4ebcc', null);
        }
        // Dãy núi xanh mờ ở chân trời (y ≈ 580 - 640)
        ctx.fillStyle = night ? '#15242e' : '#6b9c8a';
        path(ctx, 'M -200 640 Q 120 560 300 620 Q 480 570 700 640 L 700 810 L -200 810 Z', ctx.fillStyle, null);
        ctx.fillStyle = night ? '#1e3436' : '#88bba2';
        path(ctx, 'M -200 680 Q 80 620 280 670 Q 450 630 700 690 L 700 810 L -200 810 Z', ctx.fillStyle, null);

        // Mặt nước ruộng phản chiếu (tầng trung 680 - 810)
        ctx.fillStyle = night ? '#162836' : '#7cb9c8';
        ctx.fillRect(-2000, 690, 4500, 120);

        // Các bờ ruộng đất đắp (bờ vùng, bờ thửa)
        ctx.fillStyle = night ? '#222f28' : '#725638';
        path(ctx, 'M -100 750 Q 200 735 680 755 L 680 766 Q 200 746 -100 762 Z', ctx.fillStyle, null);
        path(ctx, 'M 180 740 L 160 810 L 172 810 L 192 740 Z', ctx.fillStyle, null);
        path(ctx, 'M 420 745 L 440 810 L 452 810 L 432 745 Z', ctx.fillStyle, null);

        // Những khóm mạ non xanh mướt cấy thẳng hàng trong nước
        const riceCol = night ? '#2a4c36' : '#68bc46';
        for (let row = 0; row < 4; row++) {
          const ry = 715 + row * 26;
          for (let col = 0; col < 9; col++) {
            const rx = 25 + col * 62 + (row % 2) * 28;
            for (let b = -1; b <= 1; b++) {
              ctx.save(); ctx.translate(rx, ry); blade(ctx, 0, [b * 5, -14], riceCol); ctx.restore();  // blade() mọc từ y = 0
            }
          }
        }

        // Bờ ruộng tiền cảnh (ground_y = 810 xuống đáy H = 1024)
        ctx.fillStyle = night ? '#1e2d24' : '#6b5034';
        ctx.fillRect(-2000, 810, 4500, 2200);
        // Cỏ viền bờ ruộng
        ctx.fillStyle = night ? '#253e2e' : '#5ba044';
        for (let x = -20; x < W + 40; x += 18) {
          ellipse(ctx, x, 810, 14, 5, ctx.fillStyle, null);
        }

        // Cò trắng bay lượn ở xa
        ctx.fillStyle = '#ffffff';
        const storkWing = Math.sin(t * 5) * 4;
        for (const [sx, sy] of [[180, 570], [240, 555], [310, 580]]) {
          path(ctx, `M ${sx - 8} ${sy - storkWing} Q ${sx} ${sy} ${sx + 8} ${sy - storkWing} L ${sx} ${sy + 2} Z`, ctx.fillStyle, null);
        }
      }
    },

    terraced_field: {
      label: 'Ruộng bậc thang',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t, kit) {
        const W = 576, H = 1024;
        const night = settings.time === 'night';
        const rain = settings.weather === 'rain' || settings.weather === 'storm';
        // Trời vùng cao
        ctx.fillStyle = night ? '#172230' : rain ? '#889ea6' : '#9ce0f0';
        ctx.fillRect(-2000, -2000, 4500, 5000);
        if (night) {
          ellipse(ctx, 120, 120, 24, 24, '#f8f0d4', null);
        } else {
          ellipse(ctx, 430, 110, 36, 36, '#ffea78', null);
          ellipse(ctx, 430, 110, 55, 55, 'rgba(255,234,120,0.25)', null);
        }

        // Dãy núi trùng điệp mù sương
        ctx.fillStyle = night ? '#1a2c38' : '#528276';
        path(ctx, 'M -200 520 Q 80 430 260 480 Q 420 420 700 500 L 700 810 L -200 810 Z', ctx.fillStyle, null);
        ctx.fillStyle = night ? '#223842' : '#649a88';
        path(ctx, 'M -200 570 Q 140 490 320 540 Q 520 480 700 560 L 700 810 L -200 810 Z', ctx.fillStyle, null);

        // Các tầng ruộng bậc thang uốn lượn hình vòng cung
        const tiers = [
          { y: 600, h: 32, col: night ? '#284632' : '#88c850', water: night ? '#1c3444' : '#8ac8d6' },
          { y: 635, h: 38, col: night ? '#243e2e' : '#9cd45c', water: night ? '#1a3040' : '#92d0dc' },
          { y: 675, h: 42, col: night ? '#203828' : '#7db848', water: night ? '#182c3c' : '#7cbccb' },
          { y: 720, h: 46, col: night ? '#1c3224' : '#8ebf4e', water: night ? '#162836' : '#88c4d2' },
          { y: 768, h: 50, col: night ? '#1a2e20' : '#6ea440', water: night ? '#142432' : '#74b2c2' }
        ];

        for (const tr of tiers) {
          // Mặt nước ruộng phản chiếu ánh trời
          ctx.fillStyle = tr.water;
          path(ctx, `M -100 ${tr.y} Q 288 ${tr.y - 18} 680 ${tr.y} L 680 ${tr.y + tr.h} Q 288 ${tr.y + tr.h - 18} -100 ${tr.y + tr.h} Z`, ctx.fillStyle, null);
          // Lúa vàng/xanh bậc thang
          ctx.fillStyle = tr.col;
          path(ctx, `M -100 ${tr.y + 6} Q 288 ${tr.y - 12} 680 ${tr.y + 6} L 680 ${tr.y + tr.h} Q 288 ${tr.y + tr.h - 18} -100 ${tr.y + tr.h} Z`, ctx.fillStyle, null);
          // Bờ đá/đất bậc thang
          ctx.strokeStyle = night ? '#16221c' : '#52402c';
          ctx.lineWidth = 4;
          path(ctx, `M -100 ${tr.y + tr.h} Q 288 ${tr.y + tr.h - 18} 680 ${tr.y + tr.h}`, null, ctx.strokeStyle, 4);
        }

        // Bờ đất bậc trước (ground_y = 810)
        ctx.fillStyle = night ? '#18241c' : '#5a422a';
        ctx.fillRect(-2000, 810, 4500, 2200);
        ctx.fillStyle = night ? '#203426' : '#548e38';
        for (let x = -20; x < W + 40; x += 16) {
          ellipse(ctx, x, 810, 12, 4, ctx.fillStyle, null);
        }
      }
    },

    fruit_orchard: {
      label: 'Vườn cây ăn quả',
      theme: 'farm',
      ground_y: 810,
      draw(ctx, settings, t, kit) {
        const W = 576, H = 1024;
        const night = settings.time === 'night';
        const rain = settings.weather === 'rain' || settings.weather === 'storm';
        // Trời
        ctx.fillStyle = night ? '#1c2838' : rain ? '#90a4a8' : '#b2e8f2';
        ctx.fillRect(-2000, -2000, 4500, 5000);
        if (!night) {
          ellipse(ctx, 380, 100, 75, 24, '#ffffff', null);
          ellipse(ctx, 160, 130, 60, 20, '#ffffff', null);
        } else {
          ellipse(ctx, 440, 100, 25, 25, '#f5edd2', null);
        }

        // Dãy đồi xa xa
        ctx.fillStyle = night ? '#182b36' : '#82bba4';
        ellipse(ctx, 150, 680, 240, 100, ctx.fillStyle, null);
        ellipse(ctx, 460, 670, 220, 90, ctx.fillStyle, null);

        // Hàng cây ăn quả ở hậu cảnh (xa)
        const farTreeCol = night ? '#1f382a' : '#5ea048';
        const fruitDotsCol = night ? '#b87c24' : '#f4a028';
        for (let i = 0; i < 7; i++) {
          const tx = 30 + i * 85, ty = 730;
          // Thân nhỏ
          line(ctx, [[tx, ty], [tx, ty - 30]], night ? '#1a261e' : '#5a4632', 4);
          // Tán tròn
          ellipse(ctx, tx, ty - 42, 34, 26, farTreeCol, null);
          // Đốm quả vàng cam lấp lánh trong tán
          ellipse(ctx, tx - 10, ty - 46, 3, 3, fruitDotsCol, null);
          ellipse(ctx, tx + 12, ty - 38, 3, 3, fruitDotsCol, null);
          ellipse(ctx, tx - 2, ty - 52, 2.5, 2.5, fruitDotsCol, null);
        }

        // Hàng cây ăn quả ở trung cảnh
        const midTreeCol = night ? '#244432' : '#4d9238';
        for (let i = 0; i < 5; i++) {
          const tx = 60 + i * 115, ty = 780;
          line(ctx, [[tx, ty], [tx, ty - 42]], night ? '#222e22' : '#685038', 6);
          ellipse(ctx, tx, ty - 56, 46, 34, midTreeCol, null);
          ellipse(ctx, tx - 14, ty - 62, 4.5, 4.5, fruitDotsCol, null);
          ellipse(ctx, tx + 16, ty - 50, 4.5, 4.5, fruitDotsCol, null);
          ellipse(ctx, tx, ty - 68, 4, 4, fruitDotsCol, null);
        }

        // Mặt đất vườn cỏ xanh (ground_y = 810)
        ctx.fillStyle = night ? '#1b2a20' : '#72b448';
        ctx.fillRect(-2000, 810, 4500, 2200);

        // Lối đi đất nâu ở giữa vườn
        ctx.fillStyle = night ? '#242e26' : '#a88c68';
        path(ctx, 'M 250 810 L 326 810 L 380 1024 L 196 1024 Z', ctx.fillStyle, null);

        // Vệt cỏ viền và hoa dại nhỏ hai bên lối đi
        for (let i = 0; i < 20; i++) {
          const gx = (i * 73 + 12) % W;
          const gy = 825 + (i * 37) % 180;
          if (gx < 220 || gx > 350) {
            ellipse(ctx, gx, gy, 8, 3, night ? '#223826' : '#5c9836', null);
            if (i % 3 === 0) ellipse(ctx, gx, gy - 3, 2, 2, '#fffdf0', null);
          }
        }
      }
    }
  };

  // Đăng ký toàn bộ các rig cây ăn quả và hình nền mới
  const rigs = {};
  for (const [id, spec] of Object.entries(TREE_SPECS)) {
    rigs[id] = {
      group: 'plant',
      draw: (ctx, s, t) => drawFruitTree(ctx, s, t, spec),
      spec
    };
  }

  register({
    rigs,
    backgrounds: BACKGROUNDS,
    actionHooks: {
      shake(a, states, t, p, u, amount, cat, active) {
        if (!active) return;
        const target = states[a.target];
        if (target) {
          // Rung lắc tán cây theo hàm sin tất định
          const env = Math.sin(p * Math.PI);
          target.shake = Math.sin(t * 26) * 0.12 * env * amount;
        }
      }
    }
  });

})();
