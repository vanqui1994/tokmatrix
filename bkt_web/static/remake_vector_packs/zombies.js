// remake_vector_packs/zombies.js — Giai đoạn V: Zombie hoạt hình hài hước, an toàn cho trẻ em
(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') {
    throw new Error('RemakeVector core engine must be loaded before engine packs.');
  }

  const {
    path, line, ellipse, cylinder, taper, volume, tone, INK, TAU, clamp, hash, smooth, mix, drawPoly
  } = RemakeVector.kit;

  // -------------------------------------------------------------
  // HÀNH ĐỘNG CỦA ZOMBIE (4 hành động)
  // -------------------------------------------------------------
  const ZOMBIE_ACTION_HOOKS = {
    // 1. SHAMBLE: Đi lảo đảo, tay giơ trước, tốc độ <= 40 px/s
    shamble(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      if (!actor) return;
      const dur = Math.max(0.1, a.end - a.start);
      // Tốc độ tối đa 35 px/s (luôn <= 40 px/s theo quy tắc cứng)
      const maxDist = 35 * dur;
      const reqDist = a.distance !== undefined ? Math.min(a.distance, maxDist) : Math.min(30 * dur, 75);
      const dir = (a.direction === 'left' || actor.flip) ? -1 : 1;

      // Tự dời vị trí như haul (motion: false, channel: null)
      actor.x += dir * reqDist * p;
      actor.flip = (dir < 0);

      // Hai tay giơ về phía trước
      actor.hand_l_y = -36;
      actor.hand_r_y = -36;
      actor.hand_l_x = -16 + dir * 18;
      actor.hand_r_x = 16 + dir * 18;

      // Dáng đi lảo đảo
      actor.walk = 0.55;
      actor.stride = t * 6.0;
      actor.lean = Math.sin(t * 3.5) * 0.12;

      // Biểu cảm ngơ ngác
      if (!actor.expression) actor.expression = 'dazed';
      if (actor.zombie === undefined) actor.zombie = 1.0;
    },

    // 2. CHASE_SLOW: Đuổi theo nhưng KHÔNG BAO GIỜ chạm, luôn giữ khoảng cách >= 80 px
    chase_slow(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      const target = states[a.target];
      if (!actor || !target) return;

      const dur = Math.max(0.1, a.end - a.start);
      const minDist = a.min_dist !== undefined ? Math.max(82, a.min_dist) : 85;
      const currentGap = target.x - actor.x;
      const dir = currentGap >= 0 ? 1 : -1;

      actor.flip = (dir < 0);

      // Tốc độ chậm tối đa 32 px/s
      const allowedTravel = Math.min(32 * dur * p, Math.max(0, Math.abs(currentGap) - minDist));
      actor.x += dir * allowedTravel;

      // Rào chắn bảo vệ cứng: khoảng cách luôn >= 80 px
      if (Math.abs(target.x - actor.x) < 80) {
        actor.x = target.x - dir * 80;
      }

      // Hai tay với về phía trước
      actor.hand_l_y = -36;
      actor.hand_r_y = -36;
      actor.hand_l_x = -16 + dir * 18;
      actor.hand_r_x = 16 + dir * 18;

      actor.walk = 0.6;
      actor.stride = t * 7.0;
      actor.lean = dir * 0.14;

      if (!actor.expression) actor.expression = 'dazed';
      if (actor.zombie === undefined) actor.zombie = 1.0;
    },

    // 3. DISTRACT: Ném đồ phát tiếng, zombie quay hướng theo
    distract(a, states, t, p, u, amount, cat, active) {
      const actor = states[a.actor];
      const target = states[a.target];
      const distractPt = a.distract_point || (target ? { x: target.x, y: target.y } : { x: 288, y: 810 });

      // Tìm các zombie trong cảnh để quay đầu về hướng tiếng động
      for (const [id, s] of Object.entries(states)) {
        if (s && (s.zombie > 0 || id.includes('zombie'))) {
          // Quay mặt về hướng tiếng động
          s.flip = (distractPt.x < s.x);
          s.look_x = s.flip ? -1 : 1;
          if (p > 0.3) {
            s.expression = 'surprised';
          }
        }
      }
    },

    // 4. CURE_SPRAY: Phun thuốc dạng mây lấp lánh, cured của mục tiêu tăng lên 1
    cure_spray(a, states, t, p, u, amount, cat, active) {
      const doctor = states[a.actor];
      const target = states[a.target];
      if (!doctor || !target) return;

      // Bác sĩ vươn tay cầm bình xịt hướng về mục tiêu
      const dir = target.x >= doctor.x ? 1 : -1;
      doctor.flip = (dir < 0);
      doctor.hand_r_x = dir * 26;
      doctor.hand_r_y = -32;

      // Lưu toạ độ luồng mây phun để hiệu ứng effects vẽ
      a._sprayMist = {
        fromX: doctor.x + dir * 32,
        fromY: doctor.y - 32,
        toX: target.x,
        toY: target.y - 36,
        progress: p
      };

      // Mức độ chữa khỏi của mục tiêu tăng đơn điệu tới 1
      const curedProgress = smooth(clamp(p, 0, 1));
      target.cured = curedProgress;
      target.zombie = Math.max(0, 1 - curedProgress);

      // Khi khỏi bệnh, nét mặt trở nên vui tươi rạng rỡ
      if (p >= 0.75) {
        target.expression = 'happy';
      }
    }
  };

  // -------------------------------------------------------------
  // HIỆU ỨNG HẠT MÂY THUỐC LẤP LÁNH (CURE MIST EFFECTS)
  // -------------------------------------------------------------
  function zombieEffects(ctx, snapshot) {
    for (const a of snapshot.actions || []) {
      if (a.type === 'cure_spray' && a._sprayMist) {
        const m = a._sprayMist;
        const p = m.progress;
        ctx.save();
        // Luồng mây phun lấp lánh (màu xanh ngọc / lam / vàng, KHÔNG ĐỎ)
        const numParticles = 14;
        for (let i = 0; i < numParticles; i++) {
          const frac = ((i / numParticles) + p * 2) % 1;
          const px = m.fromX + (m.toX - m.fromX) * frac + Math.sin(frac * Math.PI * 4 + i) * 12;
          const py = m.fromY + (m.toY - m.fromY) * frac + Math.cos(frac * Math.PI * 3 + i) * 10;
          const pr = 2.5 + Math.sin(i * 3) * 1.5;
          const col = i % 3 === 0 ? '#38bdf8' : i % 3 === 1 ? '#4ade80' : '#fef08a';
          ellipse(ctx, px, py, pr, pr, col, null);
        }
        ctx.restore();
      }
    }
  }

  // -------------------------------------------------------------
  // ĐĂNG KÝ VỚI ENGINE
  // -------------------------------------------------------------
  RemakeVector.register({
    effects: zombieEffects,
    actionHooks: ZOMBIE_ACTION_HOOKS
  });

})();
