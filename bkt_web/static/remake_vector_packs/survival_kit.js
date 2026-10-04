// remake_vector_packs/survival_kit.js — Giai đoạn V: Dụng cụ & Kỹ năng sinh tồn
(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('RemakeVector core engine must be loaded before engine packs.');
  }

  const {
    path, line, ellipse, cylinder, taper, volume, tone, INK, TAU, clamp, hash, smooth, mix, drawPoly
  } = RemakeVector.kit;

  // -------------------------------------------------------------
  // 9 RIGS CỦA SURVIVAL_KIT
  // -------------------------------------------------------------
  const SURVIVAL_RIGS = {
    water_pot_boiling: {
      group: 'prop',
      pack: 'survival_kit',
      anchors: {
        root: [0, 0],
        top: [0, -35],
        rim: [0, -30],
        handle_l: [-26, -24],
        handle_r: [26, -24],
        surface: [0, -18]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        const boil = clamp(s.boil !== undefined ? s.boil : 0, 0, 1);
        // Thân nồi gang / thép dã ngoại màu xám chì
        taper(ctx, 0, -4, 0, -28, 22, 24, '#334155', INK, 1.8);
        ellipse(ctx, 0, -4, 22, 4.5, '#1e293b', INK, 1.4);
        ellipse(ctx, 0, -28, 24, 5.5, '#475569', INK, 1.6);
        // Nước bên trong
        const waterCol = boil > 0.5 ? '#7dd3fc' : '#38bdf8';
        ellipse(ctx, 0, -27, 21.5, 4.8, waterCol, null);

        // Hai quai nồi hai bên
        path(ctx, 'M -24 -24 Q -32 -24 -24 -14', null, '#0f172a', 2.4);
        path(ctx, 'M 24 -24 Q 32 -24 24 -14', null, '#0f172a', 2.4);

        // Bong bóng và hơi nước sôi bốc lên khi boil > 0
        if (boil > 0) {
          ctx.save();
          // Bong bóng lăn tăn trên mặt nước
          for (let i = 0; i < 5; i++) {
            const bx = Math.sin(t * 8 + i * 2) * 14;
            const by = -27 + Math.cos(t * 8 + i * 2) * 2;
            ellipse(ctx, bx, by, 1.5 + (i % 2), 1.2, '#ffffff', null);
          }
          // Luồng hơi nước bốc lên cao
          for (let i = 0; i < 3; i++) {
            const sy = -32 - ((t * 25 + i * 18) % 45);
            const sx = Math.sin(t * 3 + i * 2) * 8;
            const alpha = (1 - ((-32 - sy) / 45)) * 0.45 * boil;
            ctx.globalAlpha = alpha;
            ellipse(ctx, sx, sy, 6 + i * 2, 4 + i, '#f8fafc', null);
          }
          ctx.restore();
        }
        ctx.restore();
      }
    },

    cloth_filter: {
      group: 'prop',
      pack: 'survival_kit',
      anchors: {
        root: [0, 0],
        top: [0, -50],
        opening: [0, -48],
        drip: [0, -2],
        surface: [0, -25]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        const clarity = clamp(s.clarity !== undefined ? s.clarity : 1, 0, 1);
        // Vòng thép kẹp vải lọc ở trên
        ellipse(ctx, 0, -48, 22, 6, '#64748b', INK, 1.8);

        // Phễu vải lọc thắt hình nón
        drawPoly(ctx, [[-21, -48], [21, -48], [3, -12], [-3, -12]], '#f1f5f9', INK, 1.6);
        // Các lớp lọc bên trong nhìn thấu (cát, than hoạt tính, sỏi)
        drawPoly(ctx, [[-16, -42], [16, -42], [12, -34], [-12, -34]], '#334155', null); // than
        drawPoly(ctx, [[-12, -34], [12, -34], [8, -24], [-8, -24]], '#ca8a04', null); // cát mịn

        // Giọt nước nhỏ xuống từ đáy phễu
        const dripY = -10 + ((t * 30) % 24);
        // Màu nước chuyển từ đục nâu sang xanh trong theo clarity
        const dripCol = mix('#78716c', '#38bdf8', clarity);
        ellipse(ctx, 0, dripY, 2.4, 3.4, dripCol, null);
        ctx.restore();
      }
    },

    firewood_bundle: {
      group: 'prop',
      pack: 'survival_kit',
      anchors: {
        root: [0, 0],
        top: [0, -35],
        surface: [0, -20],
        log_top: [0, -32],
        grip: [0, -20]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Bó củi bổ sẵn xếp chụm lại
        for (let i = 0; i < 4; i++) {
          const lx = -18 + i * 12;
          drawPoly(ctx, [[lx - 6, -4], [lx + 6, -4], [lx + 5, -28], [lx - 5, -28]], '#854d0e', INK, 1.4);
          ellipse(ctx, lx, -28, 5, 2.5, '#d97706', INK, 1.0);
        }
        // Khúc củi đặt chéo phía trên
        drawPoly(ctx, [[-14, -18], [14, -18], [12, -32], [-12, -32]], '#78350f', INK, 1.4);
        ellipse(ctx, 0, -32, 12, 3.5, '#b45309', INK, 1.0);
        // Dây thừng thắt quanh bó củi
        line(ctx, [[-24, -15], [24, -15]], '#ca8a04', 3.0);
        line(ctx, [[-23, -15], [23, -15]], '#78350f', 1.0);
        ctx.restore();
      }
    },

    fishing_rod_simple: {
      group: 'prop',
      pack: 'survival_kit',
      anchors: {
        root: [0, 0],
        top: [35, -85],
        grip: [-20, -10],
        tip: [35, -85],
        hook: [35, -15]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Cần câu trúc dẻo uốn cong
        path(ctx, 'M -25 -4 Q 0 -45 35 -85', null, '#a16207', 3.5);
        // Các khoen luồn dây
        ellipse(ctx, 0, -42, 2, 2, '#475569', null);
        ellipse(ctx, 18, -65, 1.8, 1.8, '#475569', null);
        ellipse(ctx, 35, -85, 2, 2, '#475569', null);
        // Cuộn cước gỗ ở gốc cần
        ellipse(ctx, -20, -12, 6, 6, '#78350f', INK, 1.2);
        ellipse(ctx, -20, -12, 3, 3, '#e2e8f0', null);
        // Dây cước buông thõng từ ngọn cần
        const sway = Math.sin(t * 3) * 4;
        line(ctx, [[35, -85], [35 + sway, -16]], 'rgba(255, 255, 255, 0.75)', 1.0);
        // Lưỡi câu và phao nhỏ
        ellipse(ctx, 35 + sway, -32, 2.5, 4, '#ef4444', null); // phao
        path(ctx, `M ${35 + sway} -16 Q ${33 + sway} -10 ${37 + sway} -10`, null, '#64748b', 1.6); // lưỡi
        ctx.restore();
      }
    },

    snare_free: {
      group: 'prop',
      pack: 'survival_kit',
      anchors: {
        root: [0, 0],
        top: [0, -25],
        peg: [-15, 0],
        loop: [10, -12]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Cọc gỗ cắm đất
        drawPoly(ctx, [[-16, 0], [-12, 0], [-12, -18], [-16, -18]], '#78350f', INK, 1.2);
        // Dây bẫy vòng tròn để ngỏ trên thảm lá (KHÔNG CÓ CON THÚ NÀO)
        ellipse(ctx, 10, -10, 14, 8, 'rgba(0,0,0,0)', '#94a3b8', 1.4);
        line(ctx, [[-12, -14], [0, -10]], '#94a3b8', 1.2);
        // Vài chiếc lá rơi xung quanh
        ellipse(ctx, 4, -4, 4, 2, '#ca8a04', null);
        ellipse(ctx, 18, -6, 3, 1.8, '#65a30d', null);
        ctx.restore();
      }
    },

    seed_tray: {
      group: 'prop',
      pack: 'survival_kit',
      anchors: {
        root: [0, 0],
        top: [0, -22],
        sprouts: [0, -18],
        surface: [0, -10]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Khay gỗ ươm mầm
        drawPoly(ctx, [[-26, 0], [26, 0], [28, -12], [-28, -12]], '#78350f', INK, 1.4);
        // Đất mùn đen
        ellipse(ctx, 0, -12, 27, 4.5, '#292524', null);
        // Các mầm cây non xanh tốt nhô lên
        for (let x = -20; x <= 20; x += 8) {
          line(ctx, [[x, -12], [x, -18]], '#16a34a', 1.4);
          ellipse(ctx, x - 2, -19, 2.5, 1.5, '#4ade80', null);
          ellipse(ctx, x + 2, -19, 2.5, 1.5, '#4ade80', null);
        }
        ctx.restore();
      }
    },

    hand_crank_radio: {
      group: 'prop',
      pack: 'survival_kit',
      anchors: {
        root: [0, 0],
        top: [0, -48],
        grip: [-18, -20],
        crank: [16, -25],
        antenna: [-12, -45]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        const crank = s.crank !== undefined ? s.crank : 0;
        const powered = (s.powered !== undefined ? s.powered : 0) > 0;
        // Thân đài khẩn cấp màu cam/vàng dã ngoại
        drawPoly(ctx, [[-22, -2], [22, -2], [22, -36], [-22, -36]], '#ea580c', INK, 1.6);
        // Lưới loa tròn bên trái
        ellipse(ctx, -10, -20, 9, 9, '#1e293b', INK, 1.2);
        // Mặt đồng hồ dò sóng / tần số bên phải
        drawPoly(ctx, [[4, -28], [18, -28], [18, -34], [4, -34]], '#f8fafc', INK, 1.0);
        line(ctx, [[11, -29], [11, -33]], '#ef4444', 1.2);
        // Đèn LED chỉ thị nguồn điện quay tay
        ellipse(ctx, 16, -14, 1.8, 1.8, powered ? '#22c55e' : '#64748b', null);

        // Cần ăng ten rút
        line(ctx, [[-16, -36], [-12, -46]], '#cbd5e1', 1.8);

        // Tay quay dynamo (crank handle) xoay theo trường crank hoặc t
        const crankAngle = crank * TAU;
        ctx.save();
        ctx.translate(16, -22);
        ctx.rotate(crankAngle);
        line(ctx, [[0, 0], [9, 0]], '#0f172a', 2.5);
        ellipse(ctx, 9, 0, 2.5, 2.5, '#facc15', INK, 1.0);
        ctx.restore();

        ctx.restore();
      }
    },

    sos_stones: {
      group: 'prop',
      pack: 'survival_kit',
      anchors: {
        root: [0, 0],
        top: [0, -20],
        center: [0, -10]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Các hòn đá cuội xếp thành chữ "S O S" (HOÀN TOÀN BẰNG ĐƯỜNG CONG HÌNH HỌC, KHÔNG DÙNG fillText)
        const stoneCol = '#cbd5e1';
        const strokeCol = '#475569';

        // Chữ S thứ nhất (ở x từ -34 đến -14)
        const s1Pts = [
          [-16, -16], [-20, -18], [-26, -18], [-30, -15],
          [-28, -11], [-22, -10], [-18, -8], [-16, -4],
          [-20, -2], [-26, -2], [-30, -4]
        ];
        for (const pt of s1Pts) {
          ellipse(ctx, pt[0], pt[1], 2.2, 1.8, stoneCol, strokeCol, 0.8);
        }

        // Chữ O ở giữa (ở x từ -10 đến 10)
        for (let a = 0; a < TAU; a += Math.PI / 5) {
          const ox = Math.cos(a) * 9;
          const oy = -10 + Math.sin(a) * 7.5;
          ellipse(ctx, ox, oy, 2.2, 1.8, stoneCol, strokeCol, 0.8);
        }

        // Chữ S thứ hai (ở x từ 14 đến 34)
        const s2Pts = [
          [32, -16], [28, -18], [22, -18], [18, -15],
          [20, -11], [26, -10], [30, -8], [32, -4],
          [28, -2], [22, -2], [18, -4]
        ];
        for (const pt of s2Pts) {
          ellipse(ctx, pt[0], pt[1], 2.2, 1.8, stoneCol, strokeCol, 0.8);
        }

        ctx.restore();
      }
    },

    cure_sprayer: {
      group: 'prop',
      pack: 'survival_kit',
      anchors: {
        root: [0, 0],
        top: [0, -55],
        grip: [-12, -22],
        nozzle: [26, -38],
        tank: [-10, -25]
      },
      draw(ctx, s, t, cat) {
        ctx.save();
        // Bình nén kim loại bằng thép không gỉ / đồng thau
        taper(ctx, -10, -6, -10, -42, 10, 10, '#0d9488', INK, 1.6);
        ellipse(ctx, -10, -42, 10, 3.5, '#14b8a6', INK, 1.2);
        ellipse(ctx, -10, -6, 10, 3.5, '#042f2e', INK, 1.2);

        // Tay bơm chữ T ở trên nắp bình
        line(ctx, [[-10, -42], [-10, -52]], '#64748b', 2.0);
        line(ctx, [[-15, -52], [-5, -52]], '#334155', 2.5);

        // Đồng hồ đo áp suất nhỏ
        ellipse(ctx, -2, -38, 3.2, 3.2, '#f8fafc', INK, 1.0);
        line(ctx, [[-2, -38], [0, -40]], '#22c55e', 1.0); // kim xanh an toàn

        // Ống mềm dẫn sang cần xịt
        path(ctx, 'M -10 -8 Q 0 4 12 -12', null, '#1e293b', 2.2);

        // Cần phun đồng thau có van bấm (nozzle hướng chếch lên)
        line(ctx, [[12, -12], [26, -38]], '#ca8a04', 2.0);
        ellipse(ctx, 26, -38, 2.5, 2.5, '#eab308', INK, 1.0);
        ctx.restore();
      }
    }
  };

  // -------------------------------------------------------------
  // 5 HÀNH ĐỘNG CỦA SURVIVAL_KIT
  // -------------------------------------------------------------
  const SURVIVAL_ACTION_HOOKS = {
    // 1. PURIFY_WATER: Lọc và đun sôi nước
    purify_water(a, states, t, p, u, amount, cat, active) {
      const pot = states[a.target];
      const filter = states[a.actor];
      if (filter) {
        filter.clarity = smooth(clamp(p, 0, 1));
      }
      if (pot) {
        // Nước sôi lên sau khi lọc
        if (p > 0.4) {
          pot.boil = smooth(clamp((p - 0.4) / 0.6, 0, 1));
        }
      }
    },

    // 2. CRANK_RADIO: Quay tay dynamo radio
    crank_radio(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      const radio = states[a.target];
      if (radio) {
        radio.crank = (t * 3.5) % 1;
        radio.powered = 1;
      }
      if (actor && radio) {
        // Bàn tay actor xoay tròn theo tay quay radio
        const crankPt = RemakeVector.worldAnchor(cat, radio, 'crank');
        const angle = t * 3.5 * TAU;
        const handX = crankPt.x + Math.cos(angle) * 8;
        const handY = crankPt.y + Math.sin(angle) * 8;
        const local = RemakeVector.worldToLocal(actor, { x: handX, y: handY });
        actor.hand_r_x = local[0];
        actor.hand_r_y = local[1];
      }
    },

    // 3. SIGNAL: Vẫy gương phát tín hiệu SOS có chùm sáng
    signal(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      const tool = states[a.target] || actor;
      if (tool) {
        tool.signal = Math.sin(t * 12) > 0 ? 1 : 0.2;
      }
      if (actor) {
        actor.hand_r_y = -35 + Math.sin(t * 4) * 8;
        actor.hand_r_x = 22 + Math.cos(t * 4) * 6;
      }
    },

    // 4. SCAVENGE: Tìm kiếm đồ trong thùng/xe
    scavenge(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (actor) {
        actor.lean = 0.3;
        actor.hand_r_x = 18;
        actor.hand_r_y = -22 + Math.sin(t * 6) * 5;
      }
      if (a.item && states[a.item]) {
        const it = states[a.item];
        if (p > 0.5) {
          it.opacity = clamp((p - 0.5) / 0.3);
          it.y -= (p - 0.5) * 15;
        }
      }
    },

    // 5. BARRICADE: Đóng ván gỗ, đầu búa chạm ván < 12 px tại nhịp gõ
    barricade(a, states, t, p, u, amount, cat, active) {
      const worker = states[a.actor];
      const boards = states[a.target];
      if (boards) {
        boards.growth = clamp(p, 0, 1);
      }
      if (worker && boards) {
        // Nhịp gõ búa (4 chu kỳ mỗi hành động)
        const hitPhase = (p * 4) % 1;
        const strike = Math.sin(hitPhase * Math.PI);
        const targetPt = RemakeVector.worldAnchor(cat, boards, hitPhase > 0.5 ? 'board_2' : 'board_1');
        const hitX = targetPt.x - (1 - strike) * 18;
        const hitY = targetPt.y - (1 - strike) * 12;
        const local = RemakeVector.worldToLocal(worker, { x: hitX, y: hitY });
        worker.hand_r_x = local[0];
        worker.hand_r_y = local[1];
      }
    }
  };

  // -------------------------------------------------------------
  // HIỆU ỨNG TÍN HIỆU SÁNG (SIGNAL EFFECTS)
  // -------------------------------------------------------------
  function survivalEffects(ctx, snapshot) {
    for (const a of snapshot.actions || []) {
      if (a.type === 'signal') {
        const actor = snapshot.states[a.actor];
        if (actor) {
          ctx.save();
          // Chùm tia sáng hình nón chiếu lên trời
          const sx = actor.x + 20;
          const sy = actor.y - actor.height * 0.45;
          const beamGrad = ctx.createRadialGradient(sx, sy, 5, sx - 150, sy - 350, 400);
          beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.7)');
          beamGrad.addColorStop(0.4, 'rgba(254, 240, 138, 0.25)');
          beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
          ctx.fillStyle = beamGrad;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - 220, 0);
          ctx.lineTo(sx - 80, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  RemakeVector.register({
    rigs: SURVIVAL_RIGS,
    effects: survivalEffects,
    actionHooks: SURVIVAL_ACTION_HOOKS
  });

})();
