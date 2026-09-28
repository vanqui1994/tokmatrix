// remake_vector_packs/chibi.js — Giai đoạn H: Nhân vật Chibi giáo dục & y tế
// Tỉ lệ chuẩn 2.3 đầu, đầu chiếm ~45% chiều cao, tay chân mập tròn, bàn tay mitten, đầy đủ 27 anchor bắt buộc.
// 13 nhân vật: chibi_boy, chibi_girl, chibi_kid, chibi_teacher, chibi_doctor, chibi_nurse, chibi_dentist,
// chibi_pharmacist, chibi_patient, chibi_grandma, chibi_grandpa, chibi_farmer, chibi_chef.

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') throw new Error('RemakeVector core engine must be loaded before engine packs.');

  const { path, line, ellipse, cylinder, taper, volume, tone, limb, mitten, INK, TAU, clamp, hash, smooth, mix, chibiSkeleton } = RemakeVector.kit;

  // 27 Anchor bắt buộc của nhân vật chibi (§9.1)
  const CHIBI_BASE_ANCHORS = {
    root: [0, 0],
    face: [0, -68],
    mouth: [0, -60],
    forehead: [0, -78],
    ear_l: [-19, -68],
    ear_r: [19, -68],
    teeth: [0, -60],
    head_top: [0, -90],
    top: [0, -95],
    neck: [0, -48],
    chest: [0, -38],
    belly: [0, -28],
    back: [-12, -36],
    waist: [0, -26],
    hip: [0, -22],
    shoulder_l: [-14, -44],
    shoulder_r: [14, -44],
    elbow_l: [-20, -34],
    elbow_r: [20, -34],
    wrist_l: [-22, -26],
    wrist_r: [22, -26],
    hand_l: [-24, -22],
    hand_r: [24, -22],
    hand: [24, -22],
    grip: [24, -22],
    arm_l: [-18, -38],
    knee_l: [-8, -12],
    knee_r: [8, -12],
    foot_l: [-9, 0],
    foot_r: [9, 0],
  };

  // Cấu hình ngoại hình, tóc và trang phục cho 13 nhân vật Chibi
  const CHIBI_SPECS = {
    chibi_boy: {
      label: 'Bé trai học sinh',
      skin: '#ffe0bd',
      hairStyle: 'short_boy',
      hairColor: '#2e1c12',
      shirtColor: '#f7fafc',
      pantsColor: '#243b5a',
      shoesColor: '#1a202c',
      accessory: 'red_scarf',
    },
    chibi_girl: {
      label: 'Bé gái học sinh',
      skin: '#ffe4c4',
      hairStyle: 'twintails',
      hairColor: '#362214',
      shirtColor: '#f7fafc',
      pantsColor: '#243b5a',
      shoesColor: '#6b3034',
      accessory: 'bow_tie',
    },
    chibi_kid: {
      label: 'Bé mầm non',
      skin: '#ffe0bd',
      hairStyle: 'curly_tuft',
      hairColor: '#452c18',
      shirtColor: '#fcd34d',
      pantsColor: '#f97316',
      shoesColor: '#3b82f6',
      accessory: 'bear_pocket',
    },
    chibi_teacher: {
      label: 'Cô giáo',
      skin: '#ffe4c4',
      hairStyle: 'neat_bun',
      hairColor: '#1f1610',
      shirtColor: '#f472b6',
      pantsColor: '#fdf2f8',
      shoesColor: '#831843',
      accessory: 'necklace',
    },
    chibi_doctor: {
      label: 'Bác sĩ',
      skin: '#ffe0bd',
      hairStyle: 'short_parted',
      hairColor: '#241a14',
      shirtColor: '#ffffff',
      pantsColor: '#e2e8f0',
      shoesColor: '#334155',
      accessory: 'stethoscope',
    },
    chibi_nurse: {
      label: 'Y tá',
      skin: '#ffe4c4',
      hairStyle: 'short_bob',
      hairColor: '#3b2518',
      shirtColor: '#ffffff',
      pantsColor: '#f1f5f9',
      shoesColor: '#475569',
      accessory: 'nurse_cap',
    },
    chibi_dentist: {
      label: 'Nha sĩ',
      skin: '#ffe0bd',
      hairStyle: 'short_boy',
      hairColor: '#201812',
      shirtColor: '#0d9488',
      pantsColor: '#134e4a',
      shoesColor: '#0f172a',
      accessory: 'head_mirror',
    },
    chibi_pharmacist: {
      label: 'Dược sĩ',
      skin: '#ffe4c4',
      hairStyle: 'short_bob',
      hairColor: '#2e1c12',
      shirtColor: '#ffffff',
      pantsColor: '#0284c7',
      shoesColor: '#1e293b',
      accessory: 'id_badge',
    },
    chibi_patient: {
      label: 'Bệnh nhân',
      skin: '#fce7d2',
      hairStyle: 'tousled',
      hairColor: '#3d2b1f',
      shirtColor: '#bae6fd',
      pantsColor: '#7dd3fc',
      shoesColor: '#cbd5e1',
      accessory: 'stripes',
    },
    chibi_grandma: {
      label: 'Bà cụ',
      skin: '#f7d8ba',
      hairStyle: 'grey_bun',
      hairColor: '#d1d5db',
      shirtColor: '#78350f',
      pantsColor: '#451a03',
      shoesColor: '#1c1917',
      accessory: 'glasses',
    },
    chibi_grandpa: {
      label: 'Ông cụ',
      skin: '#f5d5b6',
      hairStyle: 'grey_balding',
      hairColor: '#9ca3af',
      shirtColor: '#475569',
      pantsColor: '#1e293b',
      shoesColor: '#0f172a',
      accessory: 'glasses_cane',
    },
    chibi_farmer: {
      label: 'Em bé nông dân',
      skin: '#fcd3ad',
      hairStyle: 'short_boy',
      hairColor: '#1f1712',
      shirtColor: '#524035',
      pantsColor: '#292019',
      shoesColor: '#181310',
      accessory: 'conical_hat',
    },
    chibi_chef: {
      label: 'Đầu bếp nhí',
      skin: '#ffe0bd',
      hairStyle: 'short_boy',
      hairColor: '#2e1c12',
      shirtColor: '#ffffff',
      pantsColor: '#1e293b',
      shoesColor: '#0f172a',
      accessory: 'chef_toque',
    },
  };

  // Helper vẽ hình đa giác khép kín
  function drawPoly(ctx, pts, fill, stroke, width = 1) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  // =========================================================================
  // HÀM VẼ TỔNG HỢP NHÂN VẬT CHIBI: drawChibi()
  // =========================================================================

  function drawChibi(ctx, s, t, spec, cat) {
    const skin = (s.style && s.style.skin) || spec.skin || '#ffe0bd';
    const hairCol = (s.style && s.style.hair) || spec.hairColor || '#2e1c12';
    const shirtCol = (s.style && s.style.shirt) || spec.shirtColor || '#ffffff';
    const pantsCol = (s.style && s.style.pants) || spec.pantsColor || '#243b5a';
    const shoesCol = (s.style && s.style.shoes) || spec.shoesColor || '#1a202c';

    // Kinematics & Poses
    const walk = s.walk || 0;
    const stride = s.stride || 0;
    const sit = s.sit || 0;
    const lie = s.lie || 0;
    const lean = (s.lean || 0) * 12;
    const jump = s.jump || 0;
    const wind = s.wind || 0;

    // Bobbing nhún đầu và thân khi bước đi
    const bobY = Math.abs(Math.sin(stride)) * 2.5 * walk - jump * 26 + sit * 8;
    const legSwing = Math.sin(stride) * 16 * walk;

    ctx.save();
    if (lean) ctx.rotate(lean * Math.PI / 180);

    // 1. CHÂN VÀ GIÀY (y từ -22 đến 0)
    const footLeftY = sit > 0 ? -12 : (0 - Math.max(0, -legSwing * 0.4) - bobY * 0.2);
    const footRightY = sit > 0 ? -12 : (0 - Math.max(0, legSwing * 0.4) - bobY * 0.2);
    const legLeftX = -8 + (sit > 0 ? -6 : legSwing * 0.5);
    const legRightX = 8 + (sit > 0 ? 6 : -legSwing * 0.5);

    // Ống quần / chân trái & phải
    taper(ctx, -7, -22 - bobY * 0.5, legLeftX, footLeftY - 5, 5.5, 4.5, pantsCol, INK, 1.4);
    taper(ctx, 7, -22 - bobY * 0.5, legRightX, footRightY - 5, 5.5, 4.5, pantsCol, INK, 1.4);

    // Giày tròn mập mạp kiểu Chibi
    ellipse(ctx, legLeftX, footLeftY - 2, 6.2, 4.2, shoesCol, INK, 1.4);
    ellipse(ctx, legRightX, footRightY - 2, 6.2, 4.2, shoesCol, INK, 1.4);
    // Đế giày sáng nhẹ
    ellipse(ctx, legLeftX, footLeftY, 5.8, 1.6, tone(shoesCol, 0.2), null);
    ellipse(ctx, legRightX, footRightY, 5.8, 1.6, tone(shoesCol, 0.2), null);

    // 2. THÂN & ÁO (y từ -46 đến -22)
    const torsoTopY = -46 - bobY;
    const torsoBotY = -22 - bobY;

    // Thân tròn hình quả lê / bầu dục béo lùn
    ctx.save();
    path(ctx, `M -14 ${torsoTopY} Q -17 ${torsoBotY + 2} -11 ${torsoBotY} L 11 ${torsoBotY} Q 17 ${torsoBotY + 2} 14 ${torsoTopY} Z`, shirtCol, INK, 1.8);

    // Hoạ tiết áo tuỳ nhân vật
    if (spec.accessory === 'stripes') {
      // Sọc áo bệnh nhân
      for (let sx = -11; sx <= 11; sx += 4.5) {
        line(ctx, [[sx, torsoTopY + 2], [sx, torsoBotY - 1]], '#38bdf8', 1.2);
      }
    } else if (spec.accessory === 'red_scarf') {
      // Khăn quàng đỏ học sinh
      path(ctx, `M 0 ${torsoTopY + 2} L -7 ${torsoTopY + 12} L -2 ${torsoTopY + 17} L 3 ${torsoTopY + 12} Z`, '#e11d48', INK, 1.0);
    } else if (spec.accessory === 'bow_tie') {
      // Nơ đỏ bé gái
      ellipse(ctx, -4, torsoTopY + 5, 3.5, 2.5, '#e11d48', INK, 1.0, -0.2);
      ellipse(ctx, 4, torsoTopY + 5, 3.5, 2.5, '#e11d48', INK, 1.0, 0.2);
      ellipse(ctx, 0, torsoTopY + 5, 1.8, 1.8, '#be123c', null);
    } else if (spec.accessory === 'bear_pocket') {
      // Túi gấu nhỏ bé mầm non
      ellipse(ctx, 5, torsoBotY - 8, 4.5, 4.0, '#f97316', INK, 1.0);
      ellipse(ctx, 3, torsoBotY - 12, 1.6, 1.6, '#ea580c', null);
      ellipse(ctx, 7, torsoBotY - 12, 1.6, 1.6, '#ea580c', null);
    } else if (spec.accessory === 'chef_toque') {
      // Hai hàng cúc đen áo đầu bếp
      for (let cy = torsoTopY + 6; cy < torsoBotY - 2; cy += 6) {
        ellipse(ctx, -4, cy, 1.4, 1.4, '#1e293b', null);
        ellipse(ctx, 4, cy, 1.4, 1.4, '#1e293b', null);
      }
    } else if (spec.accessory === 'stethoscope') {
      // Củ ống nghe bác sĩ ở ngực
      line(ctx, [[-6, torsoTopY + 3], [-4, torsoTopY + 12]], '#334155', 1.6);
      line(ctx, [[6, torsoTopY + 3], [4, torsoTopY + 12]], '#334155', 1.6);
      line(ctx, [[-4, torsoTopY + 12], [0, torsoTopY + 15]], '#334155', 1.6);
      line(ctx, [[4, torsoTopY + 12], [0, torsoTopY + 15]], '#334155', 1.6);
      ellipse(ctx, 0, torsoTopY + 16, 3.0, 3.0, '#94a3b8', INK, 1.0);
    }
    ctx.restore();

    // 3. TAY VÀ BÀN TAY (IK 2 đoạn hoặc vị trí pose)
    const skel = chibiSkeleton(s);
    const shoulderL = [skel.shoulder_l[0], skel.shoulder_l[1] - bobY];
    const shoulderR = [skel.shoulder_r[0], skel.shoulder_r[1] - bobY];
    const elbowL = [skel.elbow_l[0], skel.elbow_l[1] - bobY];
    const elbowR = [skel.elbow_r[0], skel.elbow_r[1] - bobY];
    const handL = [skel.hand_l[0], skel.hand_l[1] - bobY];
    const handR = [skel.hand_r[0], skel.hand_r[1] - bobY];

    // Vẽ tay trái (phía sau hoặc bên)
    taper(ctx, shoulderL[0], shoulderL[1], elbowL[0], elbowL[1], 4.2, 3.8, shirtCol, INK, 1.4);
    taper(ctx, elbowL[0], elbowL[1], handL[0], handL[1], 3.8, 3.2, skin, INK, 1.4);
    mitten(ctx, handL[0], handL[1], 4.2, skin, Math.atan2(handL[1] - elbowL[1], handL[0] - elbowL[0]));

    // Vẽ tay phải
    taper(ctx, shoulderR[0], shoulderR[1], elbowR[0], elbowR[1], 4.2, 3.8, shirtCol, INK, 1.4);
    taper(ctx, elbowR[0], elbowR[1], handR[0], handR[1], 3.8, 3.2, skin, INK, 1.4);
    mitten(ctx, handR[0], handR[1], 4.2, skin, Math.atan2(handR[1] - elbowR[1], handR[0] - elbowR[0]));

    // Gậy chống của ông cụ
    if (spec.accessory === 'glasses_cane') {
      line(ctx, [[handR[0], handR[1]], [handR[0] + 4, 0]], '#854d0e', 3.0);
      path(ctx, `M ${handR[0] + 4} ${handR[1] - 4} Q ${handR[0] - 2} ${handR[1] - 8} ${handR[0] - 6} ${handR[1] - 2}`, null, '#854d0e', 3.0);
    }

    // 4. ĐẦU & TÓC (y từ -88 đến -48, tâm đầu y ≈ -68)
    const headY = -68 - bobY;

    // Cổ ngắn
    taper(ctx, 0, -48 - bobY, 0, -56 - bobY, 4.5, 4.5, skin, null);

    // Tai nhỏ 2 bên
    ellipse(ctx, -19, headY, 3.2, 4.5, skin, INK, 1.2);
    ellipse(ctx, 19, headY, 3.2, 4.5, skin, INK, 1.2);

    // Khối đầu tròn trĩnh
    ellipse(ctx, 0, headY, 20, 19.5, skin, INK, 1.8);

    // Tóc phía sau
    if (spec.hairStyle === 'twintails') {
      // 2 chùm tóc 2 bên
      const hairSwing = Math.sin(t * 5 + wind * 2) * 4;
      ellipse(ctx, -24, headY + 4 + hairSwing, 7.5, 12, hairCol, INK, 1.4, -0.3);
      ellipse(ctx, 24, headY + 4 - hairSwing, 7.5, 12, hairCol, INK, 1.4, 0.3);
      // Nơ cột tóc
      ellipse(ctx, -20, headY - 4, 2.5, 2.5, '#e11d48', null);
      ellipse(ctx, 20, headY - 4, 2.5, 2.5, '#e11d48', null);
    } else if (spec.hairStyle === 'neat_bun' || spec.hairStyle === 'grey_bun') {
      // Búi tóc tròn trên cao / sau gáy
      ellipse(ctx, 0, headY - 19, 9, 8.5, hairCol, INK, 1.4);
      if (spec.accessory === 'necklace') {
        // Kẹp tóc ngọc trai
        ellipse(ctx, 6, headY - 18, 2.2, 2.2, '#fef08a', null);
      }
    }

    // Mái tóc trước trán
    ctx.save();
    if (spec.hairStyle === 'short_boy' || spec.hairStyle === 'tousled') {
      path(ctx, `M -19 ${headY - 4} Q -20 ${headY - 22} 0 ${headY - 22} Q 20 ${headY - 22} 19 ${headY - 4} Q 13 ${headY - 14} 7 ${headY - 10} Q 0 ${headY - 15} -7 ${headY - 11} Q -13 ${headY - 15} -19 ${headY - 4} Z`, hairCol, INK, 1.4);
    } else if (spec.hairStyle === 'curly_tuft') {
      // Chỏm tóc xoăn mầm non
      ellipse(ctx, 0, headY - 21, 6, 5, hairCol, INK, 1.2);
      ellipse(ctx, -5, headY - 19, 4, 4, hairCol, null);
      ellipse(ctx, 5, headY - 19, 4, 4, hairCol, null);
    } else if (spec.hairStyle === 'short_bob' || spec.hairStyle === 'twintails') {
      // Mái bằng dễ thương
      path(ctx, `M -19 ${headY - 2} Q -21 ${headY - 22} 0 ${headY - 22} Q 21 ${headY - 22} 19 ${headY - 2} Q 12 ${headY - 12} 0 ${headY - 11} Q -12 ${headY - 12} -19 ${headY - 2} Z`, hairCol, INK, 1.4);
    } else if (spec.hairStyle === 'grey_balding') {
      // Tóc bạc thưa 2 bên của ông cụ
      ellipse(ctx, -19, headY - 8, 4.5, 9, hairCol, INK, 1.2);
      ellipse(ctx, 19, headY - 8, 4.5, 9, hairCol, INK, 1.2);
    } else {
      path(ctx, `M -19 ${headY - 4} Q -20 ${headY - 21} 0 ${headY - 21} Q 20 ${headY - 21} 19 ${headY - 4} Q 10 ${headY - 12} 0 ${headY - 12} Q -10 ${headY - 12} -19 ${headY - 4} Z`, hairCol, INK, 1.4);
    }
    ctx.restore();

    // 5. PHỤ KIỆN TRÊN ĐẦU
    if (spec.accessory === 'nurse_cap') {
      // Mũ y tá trắng có DẤU CỘNG XANH LÁ / XANH DƯƠNG (KHÔNG DÙNG CHỮ THẬP ĐỎ!)
      const capY = headY - 19;
      drawPoly(ctx, [[-12, capY + 4], [12, capY + 4], [8, capY - 6], [-8, capY - 6]], '#ffffff', INK, 1.2);
      // Dấu cộng xanh y tế
      line(ctx, [[0, capY - 4], [0, capY + 2]], '#10b981', 1.8);
      line(ctx, [[-3, capY - 1], [3, capY - 1]], '#10b981', 1.8);
    } else if (spec.accessory === 'head_mirror') {
      // Đèn phản chiếu tròn trán của nha sĩ
      const mirY = headY - 16;
      line(ctx, [[-18, mirY + 2], [18, mirY + 2]], '#475569', 1.4);
      ellipse(ctx, 0, mirY, 4.5, 4.5, '#e2e8f0', INK, 1.2);
      ellipse(ctx, -1, mirY - 1, 1.5, 1.5, '#ffffff', null);
    } else if (spec.accessory === 'conical_hat') {
      // Nón lá em bé nông dân
      const hatY = headY - 16;
      drawPoly(ctx, [[-26, hatY + 6], [26, hatY + 6], [0, hatY - 22]], '#fef08a', INK, 1.4);
      // Vành nan nón
      line(ctx, [[-18, hatY - 2], [18, hatY - 2]], '#eab308', 1.0);
      line(ctx, [[-10, hatY - 10], [10, hatY - 10]], '#eab308', 1.0);
    } else if (spec.accessory === 'chef_toque') {
      // Mũ đầu bếp trắng cao xếp nếp
      const toqueY = headY - 20;
      path(ctx, `M -13 ${toqueY} L 13 ${toqueY} L 14 ${toqueY - 6} Q 18 ${toqueY - 16} 10 ${toqueY - 24} Q 0 ${toqueY - 28} -10 ${toqueY - 24} Q -18 ${toqueY - 16} -14 ${toqueY - 6} Z`, '#ffffff', INK, 1.4);
      for (let tx = -8; tx <= 8; tx += 4) {
        line(ctx, [[tx, toqueY - 7], [tx, toqueY - 22]], '#e2e8f0', 1.0);
      }
      line(ctx, [[-13, toqueY], [13, toqueY]], INK, 1.4);
    }

    // Kính mắt bà cụ / ông cụ
    if (spec.accessory === 'glasses' || spec.accessory === 'glasses_cane') {
      const eyeY = headY - 1;
      ellipse(ctx, -9, eyeY, 6.5, 6.5, 'rgba(255, 255, 255, 0.4)', '#94a3b8', 1.4);
      ellipse(ctx, 9, eyeY, 6.5, 6.5, 'rgba(255, 255, 255, 0.4)', '#94a3b8', 1.4);
      line(ctx, [[-2.5, eyeY], [2.5, eyeY]], '#94a3b8', 1.4);
      line(ctx, [[-15.5, eyeY], [-19, eyeY - 2]], '#94a3b8', 1.2);
      line(ctx, [[15.5, eyeY], [19, eyeY - 2]], '#94a3b8', 1.2);
    }

    ctx.restore();
  }

  // =========================================================================
  // ĐĂNG KÝ VỚI REMAKEVECTOR ENGINE
  // =========================================================================

  const chibiRigs = {};
  for (const [id, spec] of Object.entries(CHIBI_SPECS)) {
    chibiRigs[id] = {
      group: 'chibi',
      anchors: CHIBI_BASE_ANCHORS,
      spec,
      draw(ctx, s, t, cat, kit) {
        drawChibi(ctx, s, t, spec, cat);
      },
    };
  }

  RemakeVector.register({
    rigs: chibiRigs,
  });

})();
