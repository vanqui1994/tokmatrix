// remake_vector_packs/wasteland.js — Giai đoạn V: Thành phố cũ kỹ & Bỏ hoang
(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('RemakeVector core engine must be loaded before engine packs.');
  }

  const {
    path, line, ellipse, cylinder, taper, volume, tone, INK, TAU, clamp, hash, smooth, mix, drawPoly
  } = RemakeVector.kit;

  // Lớp phủ suy tàn dùng chung (decay overlay)
  function decayOverlay(ctx, bbox, decay, seed) {
    if (!decay || decay <= 0) return;
    const d = clamp(decay, 0, 1);
    const [bx, by, bw, bh] = bbox;
    const s = typeof seed === 'number' ? seed : hash(String(seed || 'decay'));
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();

    // 1. Vết rỉ sét / ố màu (Rust patches) - màu nâu ấm mờ
    const numPatches = Math.floor(3 + d * 6);
    for (let i = 0; i < numPatches; i++) {
      const px = bx + (((s * (i + 1) * 37) % 100) / 100) * bw;
      const py = by + (((s * (i + 3) * 59) % 100) / 100) * bh;
      const rx = 6 + ((s * (i + 5)) % 10) * d * 1.5;
      const ry = 4 + ((s * (i + 7)) % 8) * d * 1.5;
      ellipse(ctx, px, py, rx, ry, `rgba(146, 64, 14, ${0.15 + d * 0.35})`, null);
    }

    // 2. Vết nứt (Cracks) - đường kẻ gấp khúc màu tối
    const numCracks = Math.floor(2 + d * 5);
    for (let i = 0; i < numCracks; i++) {
      const cx = bx + (((s * (i + 11) * 41) % 90 + 5) / 100) * bw;
      const cy = by + (((s * (i + 13) * 67) % 90 + 5) / 100) * bh;
      const len = (12 + (s % 15)) * d;
      const angle = (((s * (i + 17)) % 360) * Math.PI) / 180;
      const p1 = [cx, cy];
      const p2 = [cx + Math.cos(angle) * len * 0.5 + Math.sin(angle) * 3, cy + Math.sin(angle) * len * 0.5 - Math.cos(angle) * 3];
      const p3 = [cx + Math.cos(angle) * len, cy + Math.sin(angle) * len];
      line(ctx, [p1, p2, p3], 'rgba(30, 41, 59, 0.75)', 1.2);
    }

    // 3. Dây leo / rêu (Vines / foliage) - dây xanh và lá nhỏ
    const numVines = Math.floor(2 + d * 4);
    for (let i = 0; i < numVines; i++) {
      const startX = (i % 2 === 0) ? bx : bx + bw;
      const startY = by + bh - (((s * (i + 23) * 31) % 70) / 100) * bh;
      const vineLen = (20 + (s % 25)) * d * 1.5;
      const dirX = (i % 2 === 0) ? 1 : -1;
      const p1 = [startX, startY];
      const p2 = [startX + dirX * vineLen * 0.5, startY - vineLen * 0.4];
      const p3 = [startX + dirX * vineLen, startY - vineLen * 0.8];
      line(ctx, [p1, p2, p3], '#15803d', 1.8);
      // Lá nhỏ
      ellipse(ctx, p2[0] + 2, p2[1] - 2, 3.2, 2.0, '#22c55e', '#166534', 0.8, 0.4);
      ellipse(ctx, p3[0] - 1, p3[1] + 1, 3.0, 1.8, '#16a34a', '#14532d', 0.8, -0.4);
    }

    ctx.restore();
  }

  RemakeVector.kit.decayOverlay = decayOverlay;

  // -------------------------------------------------------------
  // 12 RIGS MỚI CỦA WASTELAND
  // -------------------------------------------------------------
  const WASTELAND_RIGS = {
    barricade_boards: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -70],
        surface: [0, -35],
        board_1: [-15, -20],
        board_2: [10, -45],
        grip: [0, -35]
      },
      draw(ctx, s, t, cat) {
        const growth = clamp(s.growth !== undefined ? s.growth : 1, 0, 1);
        ctx.save();
        // Khung cọc dựng 2 bên
        drawPoly(ctx, [[-26, 0], [-18, 0], [-18, -68], [-26, -68]], '#78350f', INK, 1.4);
        drawPoly(ctx, [[18, 0], [26, 0], [26, -68], [18, -68]], '#78350f', INK, 1.4);

        // Các tấm ván ngang/chéo xuất hiện theo growth
        const numBoards = Math.round(growth * 4);
        if (numBoards >= 1) {
          drawPoly(ctx, [[-30, -12], [30, -12], [28, -24], [-32, -24]], '#92400e', INK, 1.4);
          ellipse(ctx, -22, -18, 1.4, 1.4, '#e2e8f0', INK, 0.8);
          ellipse(ctx, 22, -18, 1.4, 1.4, '#e2e8f0', INK, 0.8);
        }
        if (numBoards >= 2) {
          drawPoly(ctx, [[-32, -30], [28, -30], [30, -42], [-30, -42]], '#a16207', INK, 1.4);
          ellipse(ctx, -22, -36, 1.4, 1.4, '#e2e8f0', INK, 0.8);
          ellipse(ctx, 22, -36, 1.4, 1.4, '#e2e8f0', INK, 0.8);
        }
        if (numBoards >= 3) {
          drawPoly(ctx, [[-28, -48], [32, -48], [30, -60], [-30, -60]], '#854d0e', INK, 1.4);
          ellipse(ctx, -22, -54, 1.4, 1.4, '#e2e8f0', INK, 0.8);
          ellipse(ctx, 22, -54, 1.4, 1.4, '#e2e8f0', INK, 0.8);
        }
        if (numBoards >= 4) {
          // Ván chéo gia cố
          drawPoly(ctx, [[-28, -14], [-20, -14], [28, -58], [20, -58]], '#b45309', INK, 1.4);
          ellipse(ctx, 0, -36, 1.6, 1.6, '#e2e8f0', INK, 0.8);
        }
        ctx.restore();
      }
    },

    rain_barrel_filter: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -85],
        opening: [0, -80],
        spigot: [18, -20],
        surface: [0, -45]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Thân thùng nhựa xanh dương/xanh rêu chịu lực
        const col = s.style?.body || '#1e3a8a';
        taper(ctx, 0, -10, 0, -70, 20, 22, col, INK, 1.8);
        // Gờ nổi gia cường
        ellipse(ctx, 0, -25, 20.5, 3.5, tone(col, 0.15), INK, 1.2);
        ellipse(ctx, 0, -45, 21.2, 3.5, tone(col, 0.15), INK, 1.2);
        ellipse(ctx, 0, -65, 21.8, 3.5, tone(col, 0.15), INK, 1.2);
        // Đáy và nắp
        ellipse(ctx, 0, -5, 19.5, 4.5, tone(col, -0.2), INK, 1.4);
        ellipse(ctx, 0, -72, 22, 5, '#334155', INK, 1.6);
        // Phễu lọc ở trên
        drawPoly(ctx, [[-16, -72], [16, -72], [12, -84], [-12, -84]], '#475569', INK, 1.4);
        ellipse(ctx, 0, -84, 12, 3.5, '#64748b', INK, 1.2);
        // Lưới lọc sỏi/than
        ellipse(ctx, 0, -82, 10, 2.5, '#0f172a', null);
        // Vòi xả (spigot) ở góc dưới
        drawPoly(ctx, [[14, -22], [22, -22], [22, -18], [14, -18]], '#eab308', INK, 1.2);
        drawPoly(ctx, [[20, -18], [24, -18], [22, -12], [20, -12]], '#ca8a04', INK, 1.0);
        ctx.restore();
      }
    },

    solar_panel_small: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -65],
        plug: [15, -15],
        surface: [0, -35]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Giá đỡ kim loại chữ A
        line(ctx, [[-26, 0], [-18, -48], [-10, 0]], '#64748b', 2.2);
        line(ctx, [[10, 0], [18, -48], [26, 0]], '#64748b', 2.2);
        line(ctx, [[-22, -18], [22, -18]], '#475569', 1.8);
        // Tấm pin mặt trời nghiêng
        drawPoly(ctx, [[-30, -58], [30, -58], [24, -16], [-24, -16]], '#0284c7', INK, 1.8);
        // Lưới ô silicon
        for (let x = -20; x <= 20; x += 10) {
          line(ctx, [[x * 1.05, -57], [x * 0.85, -17]], '#e0f2fe', 1.0);
        }
        for (let y = -48; y <= -24; y += 10) {
          const w = 24 + ((y + 16) / -42) * 5;
          line(ctx, [[-w, y], [w, y]], '#e0f2fe', 1.0);
        }
        // Hộp biến tần nhỏ và dây cắm
        drawPoly(ctx, [[10, -18], [20, -18], [20, -8], [10, -8]], '#334155', INK, 1.2);
        ellipse(ctx, 15, -13, 1.4, 1.4, '#22c55e', null); // đèn xanh
        ctx.restore();
      }
    },

    tent: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -75],
        door: [0, -25],
        inside: [0, -20],
        surface: [0, -40]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Thân lều tam giác màu xanh ô liu
        const col = s.style?.body || '#3f6212';
        drawPoly(ctx, [[-45, 0], [0, -72], [45, 0]], col, INK, 2.0);
        // Mặt hông tạo khối 3D
        drawPoly(ctx, [[0, -72], [45, 0], [28, -6], [-10, -68]], tone(col, -0.2), INK, 1.6);
        // Cửa lều cuốn lên để lộ bên trong
        drawPoly(ctx, [[-20, 0], [0, -52], [20, 0]], '#14532d', INK, 1.6);
        drawPoly(ctx, [[-12, 0], [0, -40], [12, 0]], '#052e16', null);
        // Dây neo cọc lều
        line(ctx, [[-45, 0], [-55, 0]], '#ca8a04', 1.6);
        line(ctx, [[45, 0], [55, 0]], '#ca8a04', 1.6);
        line(ctx, [[0, -72], [-35, 0]], tone(col, 0.25), 1.2);
        ctx.restore();
      }
    },

    sleeping_bag: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -25],
        pillow: [-25, -20],
        foot: [25, -10],
        surface: [0, -12]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Túi ngủ trải sàn chần bông
        const col = s.style?.body || '#0369a1';
        drawPoly(ctx, [[-32, -4], [-30, -20], [30, -16], [32, -2]], col, INK, 1.6);
        ellipse(ctx, 31, -9, 3, 7, tone(col, -0.2), INK, 1.2);
        // Gối đỡ đầu
        ellipse(ctx, -26, -12, 7, 7, '#38bdf8', INK, 1.4);
        // Vạch may chần cách nhiệt
        for (let x = -15; x <= 22; x += 9) {
          line(ctx, [[x, -19], [x + 2, -3]], tone(col, 0.3), 1.2);
        }
        ctx.restore();
      }
    },

    vine_wall: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -90],
        surface: [0, -45]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Mảng tường bê tông vỡ góc
        drawPoly(ctx, [[-28, 0], [28, 0], [28, -88], [-24, -88]], '#94a3b8', INK, 2.0);
        // Dây leo um tùm bám tường
        line(ctx, [[-20, 0], [-10, -35], [-22, -65], [-8, -86]], '#15803d', 3.0);
        line(ctx, [[18, 0], [8, -40], [20, -70], [12, -88]], '#166534', 2.8);
        for (let i = 0; i < 9; i++) {
          const ly = -10 - i * 9;
          const lx = (i % 2 === 0 ? -1 : 1) * (8 + (i * 3) % 14);
          ellipse(ctx, lx, ly, 4.5, 3.0, '#22c55e', '#14532d', 0.8, (i % 3 - 1) * 0.4);
        }
        ctx.restore();
      }
    },

    street_lamp_old: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [12, -95],
        lamp: [15, -85],
        surface: [0, -50]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Trụ đèn nghiêng nhẹ (~6 độ)
        ctx.rotate(0.08);
        // Chân đế gang
        drawPoly(ctx, [[-10, 0], [10, 0], [6, -14], [-6, -14]], '#334155', INK, 1.6);
        // Thân cột đèn
        drawPoly(ctx, [[-4, -14], [4, -14], [3, -76], [-3, -76]], '#475569', INK, 1.6);
        // Tay đòn uốn cong
        path(ctx, 'M 0 -76 Q 0 -92 14 -90', null, '#334155', 3.2);
        // Lồng đèn lục giác
        drawPoly(ctx, [[8, -90], [20, -90], [22, -78], [14, -72], [6, -78]], '#fef08a', INK, 1.4);
        ellipse(ctx, 14, -80, 2.5, 3.5, '#facc15', null);
        // Dây leo quấn quanh chân cột
        line(ctx, [[-8, 0], [5, -20], [-4, -40], [3, -58]], '#16a34a', 2.0);
        ctx.restore();
      }
    },

    shopping_cart: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -60],
        handle: [-28, -52],
        basket: [5, -35],
        grip: [-28, -52],
        wheel_f: [24, 0],
        wheel_r: [-22, 0]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // 4 Bánh xe cao su nhỏ
        ellipse(ctx, -22, -3, 3.5, 3.5, '#1e293b', INK, 1.2);
        ellipse(ctx, 24, -3, 3.5, 3.5, '#1e293b', INK, 1.2);
        // Khung gầm thép
        line(ctx, [[-22, -3], [24, -3]], '#64748b', 2.4);
        line(ctx, [[-22, -3], [-24, -22]], '#64748b', 2.2);
        line(ctx, [[24, -3], [20, -22]], '#64748b', 2.2);
        // Giỏ hàng nan kim loại
        drawPoly(ctx, [[-26, -22], [26, -22], [28, -48], [-28, -48]], 'rgba(203, 213, 225, 0.45)', INK, 1.6);
        for (let x = -20; x <= 22; x += 7) {
          line(ctx, [[x, -22], [x + 1, -48]], '#94a3b8', 1.0);
        }
        for (let y = -28; y >= -42; y -= 7) {
          line(ctx, [[-26, y], [27, y]], '#94a3b8', 1.0);
        }
        // Tay cầm nhựa đỏ
        line(ctx, [[-28, -48], [-34, -54]], '#475569', 2.2);
        ellipse(ctx, -34, -54, 3, 2, '#dc2626', INK, 1.0);
        ctx.restore();
      }
    },

    canned_food_stack: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -40],
        grip: [0, -20],
        surface: [0, -20]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Lon 1 dưới đáy
        taper(ctx, -12, 0, -12, -18, 9, 9, '#cbd5e1', INK, 1.2);
        ellipse(ctx, -12, -18, 9, 2.5, '#e2e8f0', INK, 1.0);
        drawPoly(ctx, [[-21, -4], [-3, -4], [-3, -14], [-21, -14]], '#16a34a', null); // nhãn xanh

        // Lon 2 bên cạnh
        taper(ctx, 12, 0, 12, -18, 9, 9, '#cbd5e1', INK, 1.2);
        ellipse(ctx, 12, -18, 9, 2.5, '#e2e8f0', INK, 1.0);
        drawPoly(ctx, [[3, -4], [21, -4], [21, -14], [3, -14]], '#ea580c', null); // nhãn cam

        // Lon 3 chồng lên trên
        taper(ctx, 0, -18, 0, -36, 9, 9, '#cbd5e1', INK, 1.2);
        ellipse(ctx, 0, -36, 9, 2.5, '#e2e8f0', INK, 1.0);
        drawPoly(ctx, [[-9, -22], [9, -22], [9, -32], [-9, -32]], '#ca8a04', null); // nhãn vàng
        ctx.restore();
      }
    },

    water_filter_bottle: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -45],
        grip: [0, -22],
        mouth: [0, -42]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Thân bình trong mờ màu xanh
        taper(ctx, 0, -4, 0, -36, 8, 8, 'rgba(56, 189, 248, 0.45)', INK, 1.4);
        ellipse(ctx, 0, -36, 8, 2.5, '#0284c7', INK, 1.0);
        // Lõi lọc hình trụ bên trong
        taper(ctx, 0, -8, 0, -32, 3.5, 3.5, '#f8fafc', '#64748b', 0.8);
        // Nắp bình thể thao có vòi ngậm
        drawPoly(ctx, [[-7, -36], [7, -36], [6, -42], [-6, -42]], '#0f172a', INK, 1.2);
        ellipse(ctx, 0, -43, 2.5, 2, '#38bdf8', null);
        ctx.restore();
      }
    },

    signal_mirror: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -35],
        grip: [0, -10],
        mirror: [0, -25]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Tay cầm và khung gương tròn
        drawPoly(ctx, [[-3, 0], [3, 0], [3, -15], [-3, -15]], '#475569', INK, 1.2);
        ellipse(ctx, 0, -25, 11, 11, '#e2e8f0', INK, 1.6);
        // Mặt gương phản chiếu ánh kim
        ellipse(ctx, 0, -25, 9, 9, '#f8fafc', '#94a3b8', 1.0);
        // Lỗ ngắm chính giữa
        ellipse(ctx, 0, -25, 1.8, 1.8, '#0f172a', null);
        // Tia chớp sáng nếu có signal
        if ((s.signal || 0) > 0) {
          const gleam = clamp(s.signal);
          ctx.save();
          ctx.globalAlpha = gleam;
          line(ctx, [[-15, -25], [15, -25]], '#fef08a', 2.0);
          line(ctx, [[0, -40], [0, -10]], '#fef08a', 2.0);
          ctx.restore();
        }
        ctx.restore();
      }
    },

    walkie_talkie: {
      group: 'prop',
      pack: 'wasteland',
      anchors: {
        root: [0, 0],
        top: [0, -60],
        grip: [0, -22],
        antenna: [8, -58],
        speaker: [0, -28]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Thân bộ đàm bọc cao su đen
        drawPoly(ctx, [[-10, -4], [10, -4], [10, -42], [-10, -42]], '#1e293b', INK, 1.6);
        // Nút bấm PTT bên hông
        drawPoly(ctx, [[-12, -26], [-10, -26], [-10, -36], [-12, -36]], '#f97316', INK, 1.0);
        // Ăng ten cao bên phải
        taper(ctx, 6, -42, 6, -58, 2.0, 1.4, '#0f172a', INK, 1.0);
        // Núm xoay âm lượng bên trái
        drawPoly(ctx, [[-7, -42], [-3, -42], [-3, -46], [-7, -46]], '#475569', INK, 1.0);
        // Khe loa và màn hình nhỏ
        drawPoly(ctx, [[-6, -34], [6, -34], [6, -40], [-6, -40]], '#bef264', INK, 0.8);
        for (let y = -14; y >= -24; y -= 3.5) {
          line(ctx, [[-6, y], [6, y]], '#475569', 1.2);
        }
        // Đèn LED trạng thái
        ellipse(ctx, 5, -44, 1.2, 1.2, (s.signal || 0) > 0 ? '#22c55e' : '#ef4444', null);
        ctx.restore();
      }
    }
  };

  // -------------------------------------------------------------
  // 6 HÌNH NỀN WASTELAND (ground_y: 810, NO text, all weathers)
  // -------------------------------------------------------------

  // Khổ ngang (B4): hai dải mở rộng [x0, 0) và [576, x1); khổ dọc trả về rỗng nên pixel dọc không đổi.
  function extRanges(x0, x1) {
    const out = [];
    if (x0 < 0) out.push([x0, 0]);
    if (x1 > 576) out.push([576, x1]);
    return out;
  }
  // Nối tiếp hoạ tiết lặp (start, step; vòng gốc dừng ở origEnd) sang hai dải mở rộng.
  function tileExt(ext, start, step, origEnd, fn) {
    for (const [a, b] of ext) {
      if (a < 0) { for (let x = start - step; x > a - step; x -= step) fn(x); }
      else { let x = start; while (x <= origEnd) x += step; for (; x < b + step; x += step) fn(x); }
    }
  }
  // Rải vật tất định trên dải mở rộng: bước step ± 30 %, seed theo toạ độ.
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

  const WASTELAND_BACKGROUNDS = {
    abandoned_street: {
      label: 'Phố cũ bỏ hoang',
      theme: 'street',
      ground_y: 810,
      draw(ctx, settings, t) {
        ctx.save();
        const width = RemakeVector.kit.W || 576, height = RemakeVector.kit.H || 1024, s = settings || {};
        const sp = RemakeVector.kit.frameSpan(s), X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
        const seeded = RemakeVector.kit.seeded;
        const night = s.night || s.time === 'night';
        const skyCol = night ? '#090d16' : '#94a3b8';
        ctx.fillStyle = skyCol;
        ctx.fillRect(X0, 0, X1 - X0, height);

        // Đường chân trời các toà nhà đổ bóng mờ
        const bldgCol = night ? '#111827' : '#64748b';
        ctx.fillStyle = bldgCol;
        ctx.fillRect(20, 220, 120, 590);
        ctx.fillRect(160, 140, 140, 670);
        ctx.fillRect(320, 260, 110, 550);
        ctx.fillRect(450, 180, 100, 630);

        // Cây cỏ / dây leo mọc trên nóc và tường
        ctx.fillStyle = night ? '#064e3b' : '#15803d';
        ctx.fillRect(20, 215, 125, 15);
        ctx.fillRect(155, 135, 145, 18);
        ctx.fillRect(315, 255, 120, 14);
        // Khổ ngang: toà nhà bỏ hoang cao thấp khác nhau, cửa sổ vỡ tối, dây leo, biển hiệu trống
        scatterExt(ext, 150, 'ab_bldg', (x, r, i) => {
          const bw = 90 + r * 50, top = 140 + seeded(`ab_h:${Math.round(x)}`) * 160;
          ctx.fillStyle = i % 2 ? bldgCol : (night ? '#1f2937' : '#7c8aa0');
          ctx.fillRect(x - bw / 2, top, bw, 680 - top);
          ctx.fillStyle = night ? '#0b1120' : '#475569';
          for (let wy = top + 24; wy < 640; wy += 46) for (let wx = x - bw / 2 + 14; wx < x + bw / 2 - 20; wx += 30) {
            if (seeded(`ab_w:${Math.round(wx)}:${wy}`) < 0.75) ctx.fillRect(wx, wy, 16, 22);
          }
          ctx.fillStyle = night ? '#064e3b' : '#15803d';
          ctx.fillRect(x - bw / 2 - 4, top - 6, bw + 8, 12);
          for (let k = 0; k < 3; k++) { const vx = x - bw / 2 + 10 + k * bw / 3; ctx.fillRect(vx, top, 5, 60 + seeded(`ab_v:${Math.round(vx)}`) * 160); }
        });

        // Mặt đường nhựa nứt nẻ
        const roadCol = night ? '#1f2937' : '#475569';
        drawPoly(ctx, [[X0, 680], [X1, 680], [X1, height], [X0, height]], roadCol, null);

        // Vỉa hè vỡ có cỏ mọc
        drawPoly(ctx, [[X0, 680], [X1, 680], [X1, 715], [X0, 715]], night ? '#374151' : '#64748b', null);
        for (let x = 30; x < width; x += 65) {
          ellipse(ctx, x, 715, 16, 6, '#15803d', null);
        }
        tileExt(ext, 30, 65, width - 1, (x) => ellipse(ctx, x, 715, 16, 6, '#15803d', null));
        // xe bỏ hoang, vết nứt mặt đường, cột đèn nghiêng
        scatterExt(ext, 260, 'ab_prop', (x, r, i) => {
          if (i % 2 === 0) {
            const cy = 760 + r * 30, col = ['#b91c1c', '#1d4ed8', '#a16207'][Math.floor(r * 3)];
            drawPoly(ctx, [[x - 60, cy], [x + 60, cy], [x + 56, cy - 30], [x + 30, cy - 30], [x + 16, cy - 52], [x - 34, cy - 52], [x - 48, cy - 30], [x - 60, cy - 30]], night ? '#334155' : col, INK, 1.6);
            drawPoly(ctx, [[x - 28, cy - 48], [x + 12, cy - 48], [x + 22, cy - 32], [x - 40, cy - 32]], night ? '#0f172a' : '#cbd5e1', INK, 1.0);
            ellipse(ctx, x - 34, cy, 12, 12, '#111827', INK, 1.2); ellipse(ctx, x + 34, cy, 12, 12, '#111827', INK, 1.2);
            ellipse(ctx, x + 10, cy - 52, 30, 5, 'rgba(21, 128, 61, 0.8)', null);
          } else {
            line(ctx, [[x, 700], [x + 14, 420]], '#475569', 4);
            line(ctx, [[x + 14, 420], [x + 44, 426]], '#475569', 3);
            ellipse(ctx, x + 46, 430, 8, 5, night ? '#334155' : '#94a3b8', INK, 1.0);
            line(ctx, [[x - 30, 860 + r * 60], [x, 870 + r * 60], [x + 40, 856 + r * 60]], night ? '#111827' : '#334155', 2);
          }
        });

        // Vạch kẻ đường đứt đoạn (hình học, không chữ)
        for (let x = 40; x < width; x += 110) {
          drawPoly(ctx, [[x, 810], [x + 55, 810], [x + 50, 820], [x - 5, 820]], '#facc15', null);
        }
        tileExt(ext, 40, 110, width - 1, (x) => drawPoly(ctx, [[x, 810], [x + 55, 810], [x + 50, 820], [x - 5, 820]], '#facc15', null));

        ctx.restore();
      }
    },

    overgrown_plaza: {
      label: 'Quảng trường cây mọc',
      theme: 'highland',
      ground_y: 810,
      draw(ctx, settings, t) {
        ctx.save();
        const width = RemakeVector.kit.W || 576, height = RemakeVector.kit.H || 1024, s = settings || {};
        const sp = RemakeVector.kit.frameSpan(s), X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
        const seeded = RemakeVector.kit.seeded;
        const night = s.night || s.time === 'night';
        ctx.fillStyle = night ? '#0b1120' : '#a3b899';
        ctx.fillRect(X0, 0, X1 - X0, height);

        // Hàng vòm đá cổ phía xa
        const archCol = night ? '#1e293b' : '#cbd5e1';
        for (let x = 40; x < width - 40; x += 110) {
          drawPoly(ctx, [[x, 480], [x + 20, 480], [x + 20, 720], [x, 720]], archCol, null);
          drawPoly(ctx, [[x + 70, 480], [x + 90, 480], [x + 90, 720], [x + 70, 720]], archCol, null);
          path(ctx, `M ${x} 520 Q ${x + 45} 440 ${x + 90} 520 Z`, archCol, null);
        }
        tileExt(ext, 40, 110, width - 41, (x) => {
          drawPoly(ctx, [[x, 480], [x + 20, 480], [x + 20, 720], [x, 720]], archCol, null);
          drawPoly(ctx, [[x + 70, 480], [x + 90, 480], [x + 90, 720], [x + 70, 720]], archCol, null);
          if (seeded(`arch:${x}`) < 0.75) path(ctx, `M ${x} 520 Q ${x + 45} 440 ${x + 90} 520 Z`, archCol, null);
          if (seeded(`archv:${x}`) < 0.5) ellipse(ctx, x + 10, 560, 14, 50, night ? '#064e3b' : '#16a34a', null);
        });
        // cây lớn mọc giữa quảng trường
        scatterExt(ext, 300, 'plaza_tree', (x, r) => {
          line(ctx, [[x, 760], [x + 6, 520]], '#78350f', 14);
          for (const [dx, dy, rr] of [[0, -40, 70], [-50, 0, 50], [50, -10, 55]]) ellipse(ctx, x + 6 + dx, 500 + dy - r * 40, rr, rr * 0.8, night ? '#064e3b' : '#15803d', null);
        });

        // Mặt sân lát gạch vỡ cỏ mọc xuyên
        drawPoly(ctx, [[X0, 720], [X1, 720], [X1, height], [X0, height]], night ? '#1f2937' : '#78716c', null);
        for (let y = 740; y < height; y += 35) {
          line(ctx, [[X0, y], [X1, y]], '#57534e', 1.6);
        }
        for (let x = 20; x < width; x += 45) {
          ellipse(ctx, x, 810 + ((x * 17) % 20), 14, 5, '#16a34a', null);
        }
        tileExt(ext, 20, 45, width - 1, (x) => ellipse(ctx, x, 810 + ((Math.abs(x) * 17) % 20), 14, 5, '#16a34a', null));
        scatterExt(ext, 200, 'plaza_bench', (x, r, i) => {
          if (i % 2) return;
          drawPoly(ctx, [[x - 50, 760], [x + 50, 760], [x + 50, 768], [x - 50, 768]], '#78350f', INK, 1.2);
          drawPoly(ctx, [[x - 50, 738], [x + 50, 738], [x + 50, 746], [x - 50, 746]], '#78350f', INK, 1.2);
          for (const lx of [x - 44, x + 40]) line(ctx, [[lx, 768], [lx, 790]], '#334155', 3);
          ellipse(ctx, x + 50, 744, 16, 10, '#16a34a', null);
        });

        // Bể đài phun nước cạn khô rêu phong ở giữa xa
        ellipse(ctx, width * 0.5, 710, 90, 24, '#44403c', INK, 1.8);
        ellipse(ctx, width * 0.5, 706, 82, 18, '#14532d', null);
        ctx.restore();
      }
    },

    rooftop_garden: {
      label: 'Vườn sinh tồn trên sân thượng',
      theme: 'garden',
      ground_y: 810,
      draw(ctx, settings, t) {
        ctx.save();
        const width = RemakeVector.kit.W || 576, height = RemakeVector.kit.H || 1024, s = settings || {};
        const sp = RemakeVector.kit.frameSpan(s), X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
        const seeded = RemakeVector.kit.seeded;
        const night = s.night || s.time === 'night';
        // Bầu trời rộng mở
        ctx.fillStyle = night ? '#020617' : '#7dd3fc';
        ctx.fillRect(X0, 0, X1 - X0, height);

        // Đường chân trời thành phố xa
        const bldgCol = night ? '#0f172a' : '#94a3b8';
        ctx.fillStyle = bldgCol;
        ctx.fillRect(40, 340, 90, 360);
        ctx.fillRect(150, 280, 110, 420);
        ctx.fillRect(300, 320, 120, 380);
        ctx.fillRect(440, 260, 90, 440);
        scatterExt(ext, 120, 'roof_city', (x, r) => {
          const top = 240 + seeded(`rc_h:${Math.round(x)}`) * 160, bw = 70 + r * 50;
          ctx.fillStyle = bldgCol; ctx.fillRect(x - bw / 2, top, bw, 700 - top);
          ctx.fillStyle = night ? '#fde68a' : '#cbd5e1';
          for (let wy = top + 20; wy < 660; wy += 40) for (let wx = x - bw / 2 + 10; wx < x + bw / 2 - 14; wx += 24) if (!night || seeded(`rcw:${Math.round(wx)}:${wy}`) < 0.3) ctx.fillRect(wx, wy, 10, 14);
          ctx.fillStyle = bldgCol;
        });

        // Lan can sân thượng (parapet wall)
        drawPoly(ctx, [[X0, 670], [X1, 670], [X1, 730], [X0, 730]], night ? '#1e293b' : '#b45309', INK, 2.0);
        line(ctx, [[X0, 670], [X1, 670]], '#fef08a', 2.0);

        // Sàn bê tông sân thượng
        drawPoly(ctx, [[X0, 730], [X1, 730], [X1, height], [X0, height]], night ? '#1e293b' : '#64748b', null);
        // Khổ ngang: bồn rau, thùng hứng nước mưa, tấm pin mặt trời, dây phơi
        scatterExt(ext, 210, 'roof_prop', (x, r, i) => {
          const k = i % 3;
          if (k === 0) {
            drawPoly(ctx, [[x - 70, 740], [x + 70, 740], [x + 70, 785], [x - 70, 785]], '#78350f', INK, 1.6);
            ellipse(ctx, x, 740, 70, 10, '#3f6212', null);
            for (let vx = x - 58; vx <= x + 58; vx += 18) ellipse(ctx, vx, 734 - (Math.abs(vx) % 3) * 3, 8, 8, ['#4ade80', '#f87171', '#facc15'][Math.floor(r * 3)], null);
          } else if (k === 1) {
            drawPoly(ctx, [[x - 26, 790], [x + 26, 790], [x + 22, 700], [x - 22, 700]], '#1d4ed8', INK, 1.6);
            ellipse(ctx, x, 700, 24, 6, '#1e3a8a', INK, 1.2);
            line(ctx, [[x + 20, 700], [x + 50, 660]], '#64748b', 3);
          } else {
            drawPoly(ctx, [[x - 60, 760], [x + 60, 760], [x + 40, 710], [x - 80, 710]], '#1e3a8a', INK, 1.6);
            for (const dx of [-40, -10, 20]) line(ctx, [[x + dx, 760], [x + dx - 20, 710]], '#60a5fa', 1);
            line(ctx, [[x - 60, 760], [x - 60, 790]], '#475569', 3); line(ctx, [[x + 60, 760], [x + 60, 790]], '#475569', 3);
          }
        });

        // Bồn trồng rau gỗ phía xa
        drawPoly(ctx, [[60, 740], [220, 740], [220, 785], [60, 785]], '#78350f', INK, 1.6);
        ellipse(ctx, 140, 740, 80, 10, '#3f6212', null);
        // Rau xanh mọc
        for (let x = 75; x <= 205; x += 18) {
          ellipse(ctx, x, 735, 8, 8, '#4ade80', null);
        }
        ctx.restore();
      }
    },

    subway_tunnel: {
      label: 'Đường hầm tàu điện ngầm',
      theme: 'interior',
      ground_y: 810,
      draw(ctx, settings, t) {
        ctx.save();
        const width = RemakeVector.kit.W || 576, height = RemakeVector.kit.H || 1024, s = settings || {};
        const sp = RemakeVector.kit.frameSpan(s), X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
        const seeded = RemakeVector.kit.seeded;
        // Hầm tối nhưng có ánh đèn công nghiệp đủ sáng
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(X0, 0, X1 - X0, height);

        // Vòm hầm gạch men
        path(ctx, `M 0 350 Q ${width * 0.5} 120 ${width} 350 L ${width} 720 L 0 720 Z`, '#334155', null);
        // Khổ ngang: vòm hầm nối tiếp, cột trụ chia vòm, bảng sơ đồ trống
        for (const [ea, eb] of ext) {
          for (let ox = ea < 0 ? -width : width; ea < 0 ? ox + width > ea : ox < eb; ox += ea < 0 ? -width : width) {
            path(ctx, `M ${ox} 350 Q ${ox + width * 0.5} 120 ${ox + width} 350 L ${ox + width} 720 L ${ox} 720 Z`, '#334155', null);
          }
        }
        tileExt(ext, 0, width, width - 1, (x) => drawPoly(ctx, [[x - 18, 230], [x + 18, 230], [x + 18, 720], [x - 18, 720]], '#1e293b', INK, 1.4));
        scatterExt(ext, 290, 'sub_map', (x, r) => {
          drawPoly(ctx, [[x - 60, 470], [x + 60, 470], [x + 60, 560], [x - 60, 560]], '#e2e8f0', INK, 1.6);
          line(ctx, [[x - 50, 500], [x + 50, 500]], '#ef4444', 3); line(ctx, [[x - 40, 530], [x + 40, 520]], '#3b82f6', 3);
          for (const dx of [-30, 0, 30]) ellipse(ctx, x + dx, 500, 4, 4, '#ffffff', INK, 1);
          drawPoly(ctx, [[x - 90, 650], [x - 20, 650], [x - 20, 720], [x - 90, 720]], '#475569', INK, 1.2);
        });

        // Dây cáp điện và ống thông gió
        line(ctx, [[X0, 360], [X1, 360]], '#1e293b', 4.0);
        line(ctx, [[X0, 375], [X1, 375]], '#1e293b', 3.0);

        // Đèn halogen treo trần toả nón sáng vàng ấm
        const lamps = [120, 288, 456];
        tileExt(ext, 120, 168, width - 1, (x) => lamps.push(x));
        for (const lx of lamps) {
          line(ctx, [[lx, 260], [lx, 320]], '#64748b', 2.0);
          ellipse(ctx, lx, 322, 10, 6, '#fef08a', INK, 1.2);
          // Nón ánh sáng mềm
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(lx, 322);
          ctx.lineTo(lx - 75, 810);
          ctx.lineTo(lx + 75, 810);
          ctx.closePath();
          ctx.fillStyle = 'rgba(254, 240, 138, 0.14)';
          ctx.fill();
          ctx.restore();
        }

        // Sân ga bê tông (nền đất y: 810)
        drawPoly(ctx, [[X0, 720], [X1, 720], [X1, height], [X0, height]], '#475569', null);
        // Vạch sọc vàng mép ke ga
        for (let x = 0; x < width; x += 30) {
          drawPoly(ctx, [[x, 810], [x + 18, 810], [x + 12, 822], [x - 6, 822]], '#eab308', null);
        }
        tileExt(ext, 0, 30, width - 1, (x) => drawPoly(ctx, [[x, 810], [x + 18, 810], [x + 12, 822], [x - 6, 822]], '#eab308', null));
        ctx.restore();
      }
    },

    flooded_downtown: {
      label: 'Khu phố ngập nước',
      theme: 'water',
      ground_y: 810,
      open_water: true,
      draw(ctx, settings, t) {
        ctx.save();
        const width = RemakeVector.kit.W || 576, height = RemakeVector.kit.H || 1024, s = settings || {};
        const sp = RemakeVector.kit.frameSpan(s), X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
        const seeded = RemakeVector.kit.seeded;
        const night = s.night || s.time === 'night';
        ctx.fillStyle = night ? '#090d16' : '#bae6fd';
        ctx.fillRect(X0, 0, X1 - X0, height);

        // Các toà nhà nhô lên khỏi mặt nước
        const bldgCol = night ? '#111827' : '#64748b';
        ctx.fillStyle = bldgCol;
        ctx.fillRect(30, 240, 110, 480);
        ctx.fillRect(170, 180, 130, 540);
        ctx.fillRect(330, 260, 120, 460);
        ctx.fillRect(470, 220, 80, 500);

        // Vệt ngấn nước (waterline) trên tường toà nhà
        line(ctx, [[30, 710], [140, 710]], '#0284c7', 3.0);
        line(ctx, [[170, 710], [300, 710]], '#0284c7', 3.0);
        line(ctx, [[330, 710], [450, 710]], '#0284c7', 3.0);
        scatterExt(ext, 150, 'fl_bldg', (x, r, i) => {
          const bw = 80 + r * 60, top = 160 + seeded(`fl_h:${Math.round(x)}`) * 180;
          ctx.fillStyle = i % 2 ? bldgCol : (night ? '#1f2937' : '#7c8aa0');
          ctx.fillRect(x - bw / 2, top, bw, 720 - top);
          ctx.fillStyle = night ? '#fde68a' : '#cbd5e1';
          for (let wy = top + 24; wy < 680; wy += 44) for (let wx = x - bw / 2 + 12; wx < x + bw / 2 - 16; wx += 28) if (!night || seeded(`flw:${Math.round(wx)}:${wy}`) < 0.2) ctx.fillRect(wx, wy, 12, 18);
          line(ctx, [[x - bw / 2, 710], [x + bw / 2, 710]], '#0284c7', 3.0);
        });

        // Mặt nước ngập sâu tới tận đáy khung hình (open_water: true)
        const waterGrad = ctx.createLinearGradient(0, 710, 0, height);
        waterGrad.addColorStop(0, night ? '#042f2e' : '#0284c7');
        waterGrad.addColorStop(0.5, night ? '#022c22' : '#0f766e');
        waterGrad.addColorStop(1, night ? '#011e18' : '#134e4a');
        drawPoly(ctx, [[X0, 710], [X1, 710], [X1, height], [X0, height]], waterGrad, null);
        // Khổ ngang: thuyền nhỏ buộc vào cột đèn, thùng nổi, ngọn cây nhô lên
        scatterExt(ext, 230, 'fl_prop', (x, r, i) => {
          const bob = Math.sin(t * 1.6 + r * 6) * 4;
          if (i % 3 === 0) {
            drawPoly(ctx, [[x - 40, 760 + bob], [x + 40, 760 + bob], [x + 28, 778 + bob], [x - 28, 778 + bob]], '#b45309', INK, 1.4);
            line(ctx, [[x + 70, 600], [x + 70, 790]], '#475569', 4); line(ctx, [[x + 40, 762 + bob], [x + 70, 740]], '#a8a29e', 1.2);
          } else if (i % 3 === 1) {
            drawPoly(ctx, [[x - 16, 750 + bob], [x + 16, 750 + bob], [x + 16, 780 + bob], [x - 16, 780 + bob]], '#2563eb', INK, 1.2);
          } else {
            for (const [dx, rr] of [[-14, 22], [10, 28], [26, 18]]) ellipse(ctx, x + dx, 726 - rr * 0.4, rr, rr * 0.7, night ? '#064e3b' : '#15803d', null);
          }
        });

        // Gợn sóng lăn tăn theo t
        for (let i = 0; i < 6; i++) {
          const wy = 730 + i * 45;
          const shift = Math.sin(t * 2.5 + i) * 25;
          line(ctx, [[40 + shift, wy], [160 + shift, wy]], 'rgba(255, 255, 255, 0.35)', 1.8);
          line(ctx, [[280 - shift, wy + 20], [440 - shift, wy + 20]], 'rgba(255, 255, 255, 0.35)', 1.8);
          for (const [ea, eb] of ext) for (let x = ea + 40; x < eb - 120; x += 240) line(ctx, [[x + shift, wy + (x % 2) * 20], [x + 120 + shift, wy + (x % 2) * 20]], 'rgba(255, 255, 255, 0.35)', 1.8);
        }
        ctx.restore();
      }
    },

    safe_camp: {
      label: 'Trại an toàn kiên cố',
      theme: 'camp',
      ground_y: 810,
      draw(ctx, settings, t) {
        ctx.save();
        const width = RemakeVector.kit.W || 576, height = RemakeVector.kit.H || 1024, s = settings || {};
        const sp = RemakeVector.kit.frameSpan(s), X0 = sp.x0, X1 = sp.x1, ext = extRanges(X0, X1);
        const seeded = RemakeVector.kit.seeded;
        const night = s.night || s.time === 'night';
        ctx.fillStyle = night ? '#090e17' : '#93c5fd';
        ctx.fillRect(X0, 0, X1 - X0, height);

        // Rặng cây xanh rậm rạp sau tường bảo vệ
        ctx.fillStyle = night ? '#064e3b' : '#15803d';
        for (let x = 20; x < width; x += 75) {
          ellipse(ctx, x, 520, 55, 55, null, null);
          ctx.fill();
        }
        tileExt(ext, 20, 75, width - 1, (x) => { ellipse(ctx, x, 520 - seeded(`camp_tree:${x}`) * 30, 55, 55, null, null); ctx.fill(); });

        // Tường gỗ cọc nhọn kiên cố (palisade log wall)
        for (let x = 0; x < width; x += 18) {
          const hTop = 550 + ((x * 13) % 25);
          drawPoly(ctx, [[x, 720], [x + 16, 720], [x + 8, hTop]], '#78350f', INK, 1.4);
        }
        tileExt(ext, 0, 18, width - 1, (x) => drawPoly(ctx, [[x, 720], [x + 16, 720], [x + 8, 550 + ((Math.abs(x) * 13) % 25)]], '#78350f', INK, 1.4));
        // Thanh xà giằng ngang
        drawPoly(ctx, [[X0, 620], [X1, 620], [X1, 634], [X0, 634]], '#92400e', INK, 1.4);
        drawPoly(ctx, [[X0, 680], [X1, 680], [X1, 694], [X0, 694]], '#92400e', INK, 1.4);

        // Mặt đất đầm chặt trong sân trại
        drawPoly(ctx, [[X0, 720], [X1, 720], [X1, height], [X0, height]], night ? '#1e293b' : '#a88d67', null);
        // Khổ ngang: lều, đống củi, dây phơi, thùng nước, tháp canh thứ hai
        scatterExt(ext, 220, 'camp_prop', (x, r, i) => {
          const k = i % 4;
          if (k === 0) {
            const col = ['#15803d', '#ea580c', '#2563eb'][Math.floor(r * 3)];
            drawPoly(ctx, [[x - 70, 790], [x, 700 - r * 20], [x + 70, 790]], night ? '#334155' : col, INK, 1.6);
            drawPoly(ctx, [[x - 14, 790], [x, 750], [x + 14, 790]], '#1c1917', null);
          } else if (k === 1) {
            for (let j = 0; j < 4; j++) line(ctx, [[x - 30, 784 - j * 8], [x + 30, 780 - j * 8]], '#92400e', 7);
            for (let j = 0; j < 3; j++) ellipse(ctx, x - 26 + j * 26, 760, 8, 8, '#a16207', INK, 1.0);
          } else if (k === 2) {
            line(ctx, [[x - 60, 790], [x - 60, 700]], '#78350f', 3); line(ctx, [[x + 60, 790], [x + 60, 700]], '#78350f', 3);
            path(ctx, `M ${x - 60} 705 Q ${x} 720 ${x + 60} 705`, null, '#a8a29e', 1.2);
            for (const [dx, col] of [[-30, '#f87171'], [0, '#60a5fa'], [28, '#facc15']]) drawPoly(ctx, [[x + dx - 10, 712], [x + dx + 10, 712], [x + dx + 10, 742], [x + dx - 10, 742]], col, INK, 1.0);
          } else {
            drawPoly(ctx, [[x - 30, 440], [x + 40, 440], [x + 30, 720], [x - 20, 720]], '#573318', INK, 1.6);
            drawPoly(ctx, [[x - 35, 430], [x + 45, 430], [x + 45, 445], [x - 35, 445]], '#78350f', INK, 1.4);
            drawPoly(ctx, [[x - 30, 430], [x + 5, 400], [x + 40, 430]], '#92400e', INK, 1.4);
          }
        });

        // Tháp canh gỗ nhỏ ở góc trái
        drawPoly(ctx, [[20, 440], [90, 440], [80, 720], [30, 720]], '#573318', INK, 1.6);
        drawPoly(ctx, [[15, 430], [95, 430], [95, 445], [15, 445]], '#78350f', INK, 1.4);
        ctx.restore();
      }
    }
  };

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  RemakeVector.register({
    rigs: WASTELAND_RIGS,
    backgrounds: WASTELAND_BACKGROUNDS
  });

})();
