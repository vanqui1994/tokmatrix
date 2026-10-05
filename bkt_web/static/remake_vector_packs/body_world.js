// remake_vector_packs/body_world.js — Giai đoạn I: Thế giới trong cơ thể: bộ phận chibi, vi khuẩn, đội quân miễn dịch
// 13 tế bào bảo vệ (cell), 10 vi khuẩn & kẻ xâm nhập mới (microbe), 17 bộ phận cơ thể & khung X-quang chibi (organ),
// 12 hình nền hiển vi trong cơ thể ground_y: 810 (ngày & đêm), 20 action hooks bảo vệ cơ thể & chiến đấu vui nhộn.
// Hoàn toàn không máu me (vi khuẩn thua bụp thành bong bóng và lấp lánh), không có chữ, không sao chép phim có sẵn.

(function () {
  'use strict';

  if (typeof RemakeVector === 'undefined') throw new Error('RemakeVector core engine must be loaded before engine packs.');

  const { path, line, ellipse, cylinder, taper, volume, tone, limb, mitten, INK, TAU, clamp, hash, smooth, mix } = RemakeVector.kit;

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
  // 1. TEMPLATE VẼ TẾ BÀO CHIBI HOẠT HÌNH: drawCellChibi
  // =========================================================================

  function drawCellChibi(ctx, s, t, spec) {
    const squish = s.squish || 0;
    const walk = s.walk || 0;
    const bounce = Math.sin(walk * TAU) * 0.08;
    const scaleX = 1 + squish * 0.25 - bounce * 0.5;
    const scaleY = 1 - squish * 0.25 + bounce;
    const hp = s.hp != null ? s.hp : 1.0;
    const isTired = hp < 0.3 || (s.infected || 0) > 0.5;
    const isTagged = (s.tagged || 0) > 0.1;
    const glow = s.glow || 0;
    const alert = s.alert || 0;
    const stunned = s.stunned || 0;
    const pop = s.pop || 0;
    const split = s.split || 0;
    const engulf = s.engulf || 0;

    if (pop >= 0.99) return; // Đã nổ hoàn toàn

    ctx.save();

    // Hiệu ứng biến mất khi pop (nổ bong bóng hoạt hình)
    if (pop > 0) {
      const popScale = 1 + pop * 0.5;
      ctx.scale(popScale, popScale);
      ctx.globalAlpha = Math.max(0, 1 - pop * 1.2);
    }

    // Hào quang phát sáng (glow / rally)
    if (glow > 0.05) {
      ctx.save();
      const grad = ctx.createRadialGradient(0, -22, 12, 0, -22, 38 + glow * 12);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, -22, 38 + glow * 12, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Viền kháng thể dính vào nếu tagged
    if (isTagged) {
      ctx.save();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, -22, 28, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    ctx.scale(scaleX, scaleY);

    // Chân chibi nhỏ xinh bước đi
    const lFootY = Math.sin(walk * TAU) * 4;
    const rFootY = -Math.sin(walk * TAU) * 4;
    ellipse(ctx, -8, lFootY, 4, 3, spec.footColor || '#38bdf8', INK, 1.2);
    ellipse(ctx, 8, rFootY, 4, 3, spec.footColor || '#38bdf8', INK, 1.2);

    // Thân tế bào theo hình dạng (spec.shape)
    const baseColor = isTired ? (spec.tiredColor || '#94a3b8') : spec.bodyColor;
    const strokeColor = spec.strokeColor || INK;

    if (spec.shape === 'disc') {
      // Đĩa lõm 2 mặt (hồng cầu)
      ellipse(ctx, 0, -20, 24, 18, baseColor, strokeColor, 1.6);
      ellipse(ctx, 0, -20, 12, 8, tone(baseColor, -0.15), null);
    } else if (spec.shape === 'star') {
      // Tế bào tua sao (dendritic cell)
      ctx.save();
      ctx.translate(0, -22);
      ctx.beginPath();
      const numPts = 8;
      for (let i = 0; i < numPts * 2; i++) {
        const r = (i % 2 === 0) ? 26 : 14;
        const ang = (i * Math.PI) / numPts + Math.sin(t * 3 + i) * 0.1;
        const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = baseColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    } else if (spec.shape === 'blob') {
      // Đại thực bào blob biến hình mềm mại
      const cy = -24;
      ctx.save();
      ctx.beginPath();
      const bRad = 26;
      for (let i = 0; i <= 16; i++) {
        const ang = (i / 16) * TAU;
        const wave = Math.sin(ang * 4 + t * 4) * 2.5;
        const px = Math.cos(ang) * (bRad + wave);
        const py = cy + Math.sin(ang) * (bRad + wave);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = baseColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Nếu há miệng engulf lớn
      if (engulf > 0.05) {
        const mouthW = 16 * engulf;
        const mouthH = 14 * engulf;
        ellipse(ctx, 0, cy + 4, mouthW, mouthH, '#431407', INK, 1.4);
      }
      ctx.restore();
    } else if (spec.shape === 'brick') {
      // Tường da bảo vệ (viên gạch bo góc)
      path(ctx, 'M -22 -42 L 22 -42 Q 25 -42 25 -39 L 25 -3 Q 25 0 22 0 L -22 0 Q -25 0 -25 -3 L -25 -39 Q -25 -42 -22 -42 Z', baseColor, strokeColor, 1.8);
      line(ctx, [[-25, -21], [25, -21]], '#c2410c', 1.2);
      line(ctx, [[0, -42], [0, -21]], '#c2410c', 1.2);
      line(ctx, [[-12, -21], [-12, 0]], '#c2410c', 1.2);
      line(ctx, [[12, -21], [12, 0]], '#c2410c', 1.2);
    } else if (spec.shape === 'sweep') {
      // Hàng lông mao đường thở (cilia)
      const baseW = 24;
      path(ctx, `M -${baseW} 0 L ${baseW} 0 L ${baseW} -14 L -${baseW} -14 Z`, baseColor, strokeColor, 1.6);
      for (let i = -18; i <= 18; i += 9) {
        const sway = Math.sin(t * 6 + i * 0.2) * 5;
        path(ctx, `M ${i} -14 Q ${i + sway * 0.5} -32 ${i + sway} -44`, null, strokeColor, 2.5);
      }
    } else if (spec.shape === 'tiny') {
      // Mảnh tiểu cầu nhỏ gọn
      ellipse(ctx, 0, -16, 16, 12, baseColor, strokeColor, 1.5);
    } else {
      // Hình tròn tế bào chuẩn (round / default)
      if (split > 0.05) {
        // Tế bào đang phân đôi (split)
        const sep = 16 * split;
        ellipse(ctx, -sep, -22, 15, 15, baseColor, strokeColor, 1.5);
        ellipse(ctx, sep, -22, 15, 15, baseColor, strokeColor, 1.5);
      } else {
        ellipse(ctx, 0, -22, 22, 20, baseColor, strokeColor, 1.6);
      }
    }

    // Nhân tế bào mờ (nucleus)
    if (spec.nucleus && spec.shape !== 'disc' && split <= 0.05) {
      if (spec.nucleus === 'lobes') {
        // Bạch cầu trung tính: nhân 3 thùy nối nhau
        ellipse(ctx, -6, -26, 5, 4, 'rgba(125, 211, 252, 0.5)', null);
        ellipse(ctx, 6, -26, 5, 4, 'rgba(125, 211, 252, 0.5)', null);
        ellipse(ctx, 0, -16, 6, 5, 'rgba(125, 211, 252, 0.5)', null);
      } else {
        ellipse(ctx, 0, -22, 9, 8, spec.nucleusColor || 'rgba(147, 197, 253, 0.4)', null);
      }
    }

    // Tay chibi trái & phải
    const handLX = s.hand_l_x != null ? s.hand_l_x : -18;
    const handLY = s.hand_l_y != null ? s.hand_l_y : -16;
    const handRX = s.hand_r_x != null ? s.hand_r_x : 18;
    const handRY = s.hand_r_y != null ? s.hand_r_y : -16;

    mitten(ctx, handLX, handLY, 4.5, spec.handColor || '#38bdf8', 0);
    mitten(ctx, handRX, handRY, 4.5, spec.handColor || '#38bdf8', 0);

    // Trang bị riêng của từng rig tế bào (spec.drawGear)
    if (spec.drawGear) {
      spec.drawGear(ctx, s, t);
    }

    // Kháng thể chữ Y cắm vào thân nếu bị tagged
    if (isTagged) {
      ctx.save();
      ctx.translate(14, -32);
      ctx.rotate(0.3);
      path(ctx, 'M 0 0 L 0 -8 L -5 -14 M 0 -8 L 5 -14', null, '#eab308', 2.5);
      ctx.restore();
    }

    // Cửa sổ virus bên trong nếu bị infected
    if ((s.infected || 0) > 0.1) {
      ellipse(ctx, 0, -16, 7, 7, 'rgba(239, 68, 68, 0.25)', '#dc2626', 1.0);
      ellipse(ctx, 0, -16, 3, 3, '#7e22ce', null);
    }

    // Băng dán nếu HP thấp < 0.3
    if (hp < 0.3) {
      ctx.save();
      ctx.translate(8, -32);
      ctx.rotate(0.4);
      path(ctx, 'M -5 -2 L 5 -2 L 5 2 L -5 2 Z', '#fde68a', '#d97706', 0.8);
      ctx.restore();
    }

    // Dấu báo động (!)
    if (alert > 0.1) {
      ctx.save();
      const aY = -48 - Math.sin(t * 8) * 3;
      path(ctx, `M -2 ${aY} L 2 ${aY} L 1 ${aY + 8} L -1 ${aY + 8} Z`, '#ef4444', INK, 1.0);
      ellipse(ctx, 0, aY + 12, 1.8, 1.8, '#ef4444', INK, 0.8);
      ctx.restore();
    }

    // Sao quay quanh đầu nếu bị choáng (stunned)
    if (stunned > 0.1) {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const sang = t * 6 + (i * TAU) / 3;
        const sx = Math.cos(sang) * 18, sy = -38 + Math.sin(sang) * 6;
        ellipse(ctx, sx, sy, 2.5, 2.5, '#facc15', '#ca8a04', 0.8);
      }
      ctx.restore();
    }

    // Hiệu ứng nổ bong bóng (pop)
    if (pop > 0.05) {
      for (let i = 0; i < 6; i++) {
        const bang = (i * TAU) / 6 + pop * 2;
        const brad = 24 + pop * 30;
        const bx = Math.cos(bang) * brad, by = -22 + Math.sin(bang) * brad;
        ellipse(ctx, bx, by, 3, 3, 'rgba(56, 189, 248, 0.8)', '#ffffff', 1.0);
      }
    }

    ctx.restore();
  }

  // =========================================================================
  // 2. DANH SÁCH RIGS TRONG CƠ THỂ (GÓI BODY_WORLD)
  // =========================================================================

  const BODY_RIGS = {
    // -----------------------------------------------------------------------
    // A. 13 TẾ BÀO BẢO VỆ CƠ THỂ (CELL)
    // -----------------------------------------------------------------------

    // 1. Hồng cầu đưa thư (rbc_courier)
    rbc_courier: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -38],
        surface: [0, -2], back: [0, -20], hand_l: [-18, -14], hand_r: [18, -14],
        grip: [18, -14], belly: [0, -14]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'disc',
          bodyColor: '#fb7185',
          footColor: '#e11d48',
          handColor: '#f43f5e',
          drawGear(ctx, s, t) {
            // Quả bóng oxy (xanh dương sáng) hoặc CO2 (xám) ôm trước ngực
            const isCO2 = s.o2 === 0 || s.co2;
            const bubbleCol = isCO2 ? '#94a3b8' : '#38bdf8';
            const bubGrad = ctx.createRadialGradient(-3, -17, 2, 0, -14, 10);
            bubGrad.addColorStop(0, '#ffffff');
            bubGrad.addColorStop(1, bubbleCol);
            ellipse(ctx, 0, -14, 8, 8, bubGrad, INK, 1.2);
          }
        });
      }
    },

    // 2. Bạch cầu trung tính trinh sát (neutrophil_scout)
    neutrophil_scout: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -42],
        surface: [0, -2], back: [0, -22], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16], belly: [0, -16]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'round',
          bodyColor: '#f0f9ff',
          footColor: '#0284c7',
          handColor: '#e0f2fe',
          nucleus: 'lobes',
          drawGear(ctx, s, t) {
            // Băng đô thể thao màu xanh dương trên trán
            path(ctx, 'M -18 -30 Q 0 -34 18 -30 L 17 -26 Q 0 -30 -17 -26 Z', '#0284c7', INK, 1.0);
            // Dải băng vẫy phía sau
            path(ctx, 'M 17 -28 Q 24 -32 26 -26', null, '#0284c7', 2.0);
            // Lưới bẫy NETs nếu đang net_trap
            if (s.net_trap) {
              path(ctx, 'M 14 -16 L 36 -10 M 14 -16 L 34 -24 M 26 -22 L 28 -8', null, '#38bdf8', 1.5);
            }
          }
        });
      }
    },

    // 3. Đại thực bào đầu bếp (macrophage_chef)
    macrophage_chef: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -28], mouth: [0, -22], top: [0, -48],
        surface: [0, -2], back: [0, -28], hand_l: [-22, -20], hand_r: [22, -20],
        grip: [22, -20], belly: [0, -18], weapon_tip: [24, -26]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'blob',
          bodyColor: '#fed7aa',
          footColor: '#ea580c',
          handColor: '#f97316',
          drawGear(ctx, s, t) {
            // Tạp dề đầu bếp màu cam
            path(ctx, 'M -14 -18 L 14 -18 L 10 -4 L -10 -4 Z', '#fb923c', INK, 1.2);
            // Muôi canh lớn cầm ở tay phải
            line(ctx, [[18, -16], [24, -26]], '#78350f', 2.2);
            ellipse(ctx, 24, -26, 4.5, 3.5, '#ea580c', INK, 1.0);
          }
        });
      }
    },

    // 4. Tế bào tua liên lạc (dendritic_messenger)
    dendritic_messenger: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -42],
        surface: [0, -2], back: [0, -22], hand_l: [-20, -16], hand_r: [20, -16],
        grip: [20, -16], belly: [0, -16]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'star',
          bodyColor: '#a7f3d0',
          footColor: '#059669',
          handColor: '#34d399',
          drawGear(ctx, s, t) {
            // Túi đeo chéo đưa thư màu xanh lá đậm
            line(ctx, [[-14, -28], [8, -10]], '#047857', 1.8);
            path(ctx, 'M 4 -12 L 14 -12 L 14 -4 L 4 -4 Z', '#059669', INK, 1.0);
          }
        });
      }
    },

    // 5. Tế bào T chỉ huy (helper_t_captain)
    helper_t_captain: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -46],
        surface: [0, -2], back: [0, -22], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16], belly: [0, -16], weapon_tip: [22, -22]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'round',
          bodyColor: '#7dd3fc',
          footColor: '#0369a1',
          handColor: '#38bdf8',
          nucleus: true,
          drawGear(ctx, s, t) {
            // Mũ chỉ huy thuyền trưởng viền vàng
            path(ctx, 'M -14 -36 L 14 -36 L 10 -44 L -10 -44 Z', '#0369a1', INK, 1.2);
            ellipse(ctx, 0, -40, 2.5, 2.5, '#facc15', null);
            // Loa cầm tay ở tay phải
            path(ctx, 'M 18 -18 L 26 -22 L 26 -14 Z', '#0284c7', INK, 1.2);
          }
        });
      }
    },

    // 6. Hiệp sĩ T diệt khuẩn (killer_t_knight)
    killer_t_knight: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -46],
        surface: [0, -2], back: [0, -22], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16], belly: [0, -16], weapon_tip: [26, -30]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'round',
          bodyColor: '#c084fc',
          footColor: '#6b21a8',
          handColor: '#a855f7',
          nucleus: true,
          drawGear(ctx, s, t) {
            // Mũ giáp sắt hiệp sĩ có chỏm lông tím
            path(ctx, 'M -14 -32 L 14 -32 L 10 -42 L -10 -42 Z', '#64748b', INK, 1.2);
            path(ctx, 'M 0 -42 Q 4 -48 10 -46', null, '#a855f7', 2.0);
            // Kiếm hiệp sĩ sáng loáng ở tay phải
            line(ctx, [[18, -16], [26, -30]], '#cbd5e1', 2.5);
            line(ctx, [[15, -19], [21, -15]], '#475569', 1.8); // Chuôi kiếm
          }
        });
      }
    },

    // 7. Tế bào B xạ thủ (b_cell_archer)
    b_cell_archer: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -46],
        surface: [0, -2], back: [0, -22], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16], belly: [0, -16], weapon_tip: [24, -20]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'round',
          bodyColor: '#fde047',
          footColor: '#ca8a04',
          handColor: '#eab308',
          nucleus: true,
          drawGear(ctx, s, t) {
            // Cung tên cầm tay phóng kháng thể chữ Y
            path(ctx, 'M 18 -8 Q 28 -18 18 -28', null, '#854d0e', 2.0);
            line(ctx, [[18, -8], [18, -28]], '#e2e8f0', 0.8);
            // Kháng thể chữ Y chuẩn bị bắn
            path(ctx, 'M 18 -18 L 24 -18 M 24 -18 L 28 -22 M 24 -18 L 28 -14', null, '#ca8a04', 1.8);
          }
        });
      }
    },

    // 8. Tế bào sát thủ tự nhiên NK (nk_ninja)
    nk_ninja: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -44],
        surface: [0, -2], back: [0, -22], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16], belly: [0, -16], weapon_tip: [22, -20]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'round',
          bodyColor: '#64748b',
          footColor: '#1e293b',
          handColor: '#475569',
          drawGear(ctx, s, t) {
            // Khăn bịt mặt ninja che nửa mặt
            path(ctx, 'M -16 -20 Q 0 -24 16 -20 L 14 -12 Q 0 -14 -14 -12 Z', '#0f172a', null);
            // Băng buộc đầu bay phấp phới
            path(ctx, 'M -14 -32 L 14 -32 L 14 -28 L -14 -28 Z', '#0f172a', null);
            path(ctx, 'M -14 -30 Q -22 -32 -24 -24', null, '#0f172a', 2.0);
            // Phi tiêu / dao găm ninja
            line(ctx, [[18, -16], [22, -20]], '#cbd5e1', 2.0);
          }
        });
      }
    },

    // 9. Tiểu cầu thợ xây (platelet_builder)
    platelet_builder: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -16], mouth: [0, -12], top: [0, -32],
        surface: [0, -2], back: [0, -16], hand_l: [-14, -12], hand_r: [14, -12],
        grip: [14, -12], belly: [0, -12], weapon_tip: [16, -16]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'tiny',
          bodyColor: '#fef3c7',
          footColor: '#d97706',
          handColor: '#fde68a',
          drawGear(ctx, s, t) {
            // Mũ bảo hộ xây dựng màu vàng tươi
            path(ctx, 'M -12 -22 Q 0 -30 12 -22 L 10 -18 L -10 -18 Z', '#eab308', INK, 1.2);
            // Bay xây vá vết thương ở tay phải
            line(ctx, [[14, -12], [18, -16]], '#78350f', 1.6);
            path(ctx, 'M 18 -16 L 22 -14 L 20 -18 Z', '#94a3b8', INK, 0.8);
          }
        });
      }
    },

    // 10. Tế bào nhớ thủ thư (memory_cell_librarian)
    memory_cell_librarian: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -46],
        surface: [0, -2], back: [0, -22], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16], belly: [0, -16]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'round',
          bodyColor: '#bbf7d0',
          footColor: '#16a34a',
          handColor: '#86efac',
          nucleus: true,
          drawGear(ctx, s, t) {
            // Mũ cử nhân/thủ thư nhỏ
            path(ctx, 'M -10 -36 L 10 -36 L 14 -40 L -6 -40 Z', '#15803d', INK, 1.0);
            // Kính tròn trí thức
            ellipse(ctx, -5, -24, 3.5, 3.5, null, '#854d0e', 1.2);
            ellipse(ctx, 5, -24, 3.5, 3.5, null, '#854d0e', 1.2);
            line(ctx, [[-1.5, -24], [1.5, -24]], '#854d0e', 1.2);
            // Quyển sách/album lưu ảnh mầm bệnh ôm trước bụng
            path(ctx, 'M -8 -16 L 8 -16 L 8 -4 L -8 -4 Z', '#15803d', INK, 1.0);
            path(ctx, 'M -7 -14 L 7 -14 L 7 -6 L -7 -6 Z', '#fef08a', null);
          }
        });
      }
    },

    // 11. Dưỡng bào báo động (mast_cell_alarm)
    mast_cell_alarm: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -42],
        surface: [0, -2], back: [0, -22], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16], belly: [0, -16], weapon_tip: [20, -24]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'round',
          bodyColor: '#fbcfe8',
          footColor: '#db2777',
          handColor: '#f472b6',
          drawGear(ctx, s, t) {
            // Hạt histamine tím nhỏ lấm chấm bên trong
            for (let i = 0; i < 5; i++) {
              const ang = (i * TAU) / 5;
              ellipse(ctx, Math.cos(ang) * 12, -22 + Math.sin(ang) * 10, 2, 2, '#be185d', null);
            }
            // Chuông đồng báo động cầm tay
            line(ctx, [[18, -16], [20, -24]], '#78350f', 2.0);
            path(ctx, 'M 16 -24 L 24 -24 L 26 -18 L 14 -18 Z', '#facc15', INK, 1.0);
          }
        });
      }
    },

    // 12. Lông mao quét bụi (cilia_sweeper)
    cilia_sweeper: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -46],
        surface: [0, -2], back: [0, -20], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16], belly: [0, -16], weapon_tip: [22, -20]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'sweep',
          bodyColor: '#fed7aa',
          footColor: '#ea580c',
          handColor: '#f97316',
          drawGear(ctx, s, t) {
            // Chổi rơm quét bụi cầm ngang
            line(ctx, [[8, -10], [22, -20]], '#78350f', 2.0);
            path(ctx, 'M 22 -20 L 28 -26 L 32 -22 L 24 -16 Z', '#eab308', INK, 1.0);
          }
        });
      }
    },

    // 13. Chiến binh tường da bảo vệ (skin_guard)
    skin_guard: {
      group: 'cell',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -44],
        surface: [0, -2], back: [0, -22], hand_l: [-20, -16], hand_r: [18, -16],
        grip: [18, -16], belly: [0, -16], shield: [-20, -20]
      },
      draw(ctx, s, t) {
        drawCellChibi(ctx, s, t, {
          shape: 'brick',
          bodyColor: '#fdba74',
          footColor: '#c2410c',
          handColor: '#fb923c',
          drawGear(ctx, s, t) {
            // Khiên bảo vệ màu xanh cyan ở tay trái
            ellipse(ctx, -20, -20, 8, 14, '#38bdf8', '#0284c7', 1.6);
            line(ctx, [[-20, -28], [-20, -12]], '#ffffff', 1.4);
            line(ctx, [[-24, -20], [-16, -20]], '#ffffff', 1.4);
          }
        });
      }
    },

    // -----------------------------------------------------------------------
    // B. 10 VI KHUẨN & KẺ XÂM NHẬP MỚI (MICROBE)
    // -----------------------------------------------------------------------

    // 14. Liên cầu khuẩn chuỗi (bacteria_chain)
    bacteria_chain: {
      group: 'microbe',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -34],
        surface: [0, -2], back: [0, -20], hand_l: [-18, -14], hand_r: [18, -14],
        grip: [18, -14]
      },
      draw(ctx, s, t) {
        // Chuỗi 5 cầu khuẩn nối nhau uốn lượn hình sin trễ pha
        ctx.save();
        for (let i = 0; i < 5; i++) {
          const cx = (i - 2) * 10;
          const cy = -18 + Math.sin(t * 6 + i * 0.8) * 4;
          ellipse(ctx, cx, cy, 6.5, 6.5, '#818cf8', INK, 1.4);
        }
        ctx.restore();
      }
    },

    // 15. Tụ cầu khuẩn chùm (bacteria_cluster)
    bacteria_cluster: {
      group: 'microbe',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -40],
        surface: [0, -2], back: [0, -22], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16]
      },
      draw(ctx, s, t) {
        // Chùm quả cầu như chùm nho cam vàng lăn lắc
        ctx.save();
        const pts = [
          [-8, -14], [8, -14], [0, -18], [-10, -24], [10, -24], [0, -28], [-4, -34], [4, -34]
        ];
        for (const [px, py] of pts) {
          ellipse(ctx, px, py, 6.5, 6.5, '#fb923c', INK, 1.3);
        }
        ctx.restore();
      }
    },

    // 16. Tế bào bị nhiễm virus (infected_cell)
    infected_cell: {
      group: 'microbe',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -44],
        surface: [0, -2], back: [0, -22], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16]
      },
      draw(ctx, s, t) {
        // Tế bào hồng nhợt mệt mỏi có virus bên trong
        ellipse(ctx, 0, -22, 22, 20, '#fca5a5', INK, 1.5);
        // Cửa sổ trong suốt thấy virus gai bên trong
        ellipse(ctx, 0, -18, 9, 8, 'rgba(254, 226, 226, 0.9)', '#ef4444', 1.0);
        ellipse(ctx, 0, -18, 3.5, 3.5, '#7e22ce', null);
        // Cờ hiệu SOS cầm ở tay
        line(ctx, [[16, -14], [24, -36]], '#475569', 1.8);
        path(ctx, 'M 24 -36 L 34 -32 L 24 -28 Z', '#ef4444', INK, 0.8);
      }
    },

    // 17. Bào tử vi nấm (fungus_spore)
    fungus_spore: {
      group: 'microbe',
      anchors: {
        root: [0, 0], face: [0, -18], mouth: [0, -14], top: [0, -36],
        surface: [0, -2], back: [0, -18], hand_l: [-16, -14], hand_r: [16, -14],
        grip: [16, -14]
      },
      draw(ctx, s, t) {
        // Chân nấm ngắn
        taper(ctx, 0, -2, 0, -16, 7, 6, '#fef3c7', INK, 1.4);
        // Mũ nấm tròn màu nâu cam
        path(ctx, 'M -18 -16 Q 0 -34 18 -16 Q 0 -14 -18 -16 Z', '#d97706', INK, 1.4);
        // Đốm vàng trên mũ nấm
        ellipse(ctx, -8, -22, 2.5, 2, '#fef08a', null);
        ellipse(ctx, 6, -24, 2.5, 2, '#fef08a', null);
        // Hạt bào tử bay lơ lửng quanh
        const dustY = -28 + Math.sin(t * 8) * 3;
        ellipse(ctx, -14, dustY, 1.5, 1.5, '#facc15', null);
        ellipse(ctx, 15, dustY - 2, 1.5, 1.5, '#facc15', null);
      }
    },

    // 18. Giun ký sinh đeo kính (parasite_worm)
    parasite_worm: {
      group: 'microbe',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -36],
        surface: [0, -2], back: [0, -20], hand_l: [-16, -14], hand_r: [16, -14],
        grip: [16, -14]
      },
      draw(ctx, s, t) {
        // Thân giun uốn lượn màu hồng đào
        ctx.save();
        ctx.beginPath();
        for (let y = 0; y >= -32; y -= 2) {
          const x = Math.sin(t * 6 + y * 0.25) * 6;
          if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Kính râm đen cực ngầu
        const hx = Math.sin(t * 6 - 32 * 0.25) * 6;
        path(ctx, `M ${hx - 7} -26 L ${hx - 1} -26 L ${hx - 2} -21 L ${hx - 6} -21 Z`, '#0f172a', null);
        path(ctx, `M ${hx + 1} -26 L ${hx + 7} -26 L ${hx + 6} -21 L ${hx + 2} -21 Z`, '#0f172a', null);
        line(ctx, [[hx - 1, -25], [hx + 1, -25]], '#0f172a', 1.2);
        ctx.restore();
      }
    },

    // 19. Vi khuẩn sâu răng máy khoan (cavity_germ)
    cavity_germ: {
      group: 'microbe',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -40],
        surface: [0, -2], back: [0, -20], hand_l: [-16, -14], hand_r: [16, -14],
        grip: [16, -14], weapon_tip: [20, -18]
      },
      draw(ctx, s, t) {
        // Thân tím sừng nhỏ
        ellipse(ctx, 0, -20, 14, 16, '#7c3aed', INK, 1.4);
        // Sừng nhọn trên đầu
        path(ctx, 'M -8 -30 L -12 -38 L -4 -32 Z', '#5b21b6', INK, 1.0);
        path(ctx, 'M 8 -30 L 12 -38 L 4 -32 Z', '#5b21b6', INK, 1.0);
        // Máy khoan đồ chơi quay tít ở tay phải
        path(ctx, 'M 14 -16 L 22 -16 L 20 -12 L 14 -12 Z', '#facc15', INK, 1.0);
        // Mũi khoan xoắn
        const drillRot = Math.sin(t * 30) * 2;
        path(ctx, `M 22 -14 L 30 ${-14 + drillRot} L 22 -12 Z`, '#94a3b8', INK, 0.8);
      }
    },

    // 20. Mảng bám răng nhầy (plaque_goo)
    plaque_goo: {
      group: 'microbe',
      anchors: {
        root: [0, 0], face: [0, -16], mouth: [0, -12], top: [0, -30],
        surface: [0, -2], back: [0, -16], hand_l: [-16, -12], hand_r: [16, -12],
        grip: [16, -12]
      },
      draw(ctx, s, t) {
        // Khối nhầy vàng dính dính
        ctx.save();
        path(ctx, 'M -18 0 Q -22 -16 -12 -24 Q 0 -30 14 -22 Q 22 -14 18 0 Z', '#fde047', INK, 1.4);
        // Giọt nhầy dính
        ellipse(ctx, -8, -4, 4, 3, '#facc15', null);
        ellipse(ctx, 8, -4, 4, 3, '#facc15', null);
        ctx.restore();
      }
    },

    // 21. Giọt độc tố sủi bọt (toxin_blob)
    toxin_blob: {
      group: 'microbe',
      anchors: {
        root: [0, 0], face: [0, -18], mouth: [0, -14], top: [0, -36],
        surface: [0, -2], back: [0, -18], hand_l: [-16, -12], hand_r: [16, -12],
        grip: [16, -12]
      },
      draw(ctx, s, t) {
        // Giọt chất độc màu tím sẫm
        path(ctx, 'M 0 -36 C -18 -20 -16 0 0 0 C 16 0 18 -20 0 -36 Z', '#a855f7', INK, 1.4);
        // Bong bóng khí xanh độc hại sủi bọt
        const bubY = -12 + Math.sin(t * 8) * 3;
        ellipse(ctx, -4, bubY, 2.5, 2.5, '#4ade80', null);
        ellipse(ctx, 4, bubY - 6, 2, 2, '#4ade80', null);
      }
    },

    // 22. Hạt phấn hoa tròn ngây thơ (pollen_puff)
    pollen_puff: {
      group: 'microbe',
      anchors: {
        root: [0, 0], face: [0, -18], mouth: [0, -14], top: [0, -36],
        surface: [0, -2], back: [0, -18], hand_l: [-16, -12], hand_r: [16, -12],
        grip: [16, -12]
      },
      draw(ctx, s, t) {
        // Khối cầu vàng mềm mại với các gai núm tròn vô hại
        const cy = -18;
        ellipse(ctx, 0, cy, 14, 14, '#fef08a', INK, 1.4);
        for (let i = 0; i < 8; i++) {
          const ang = (i * TAU) / 8 + t * 0.5;
          const px = Math.cos(ang) * 15, py = cy + Math.sin(ang) * 15;
          ellipse(ctx, px, py, 2.5, 2.5, '#facc15', null);
        }
      }
    },

    // 23. Siêu vi khuẩn kháng thuốc vương miện (superbug_boss)
    superbug_boss: {
      group: 'microbe',
      anchors: {
        root: [0, 0], face: [0, -26], mouth: [0, -20], top: [0, -56],
        surface: [0, -2], back: [0, -26], hand_l: [-24, -18], hand_r: [24, -18],
        grip: [24, -18], shield: [-22, -22]
      },
      draw(ctx, s, t) {
        // Thân to xù xì màu xanh rêu đậm
        ellipse(ctx, 0, -24, 24, 22, '#15803d', INK, 1.8);
        // Vương miện vàng kiêu hãnh trên đầu
        path(ctx, 'M -12 -42 L -14 -50 L -6 -45 L 0 -52 L 6 -45 L 14 -50 L 12 -42 Z', '#facc15', INK, 1.2);
        // Khiên bảo vệ hình viên thuốc (kháng kháng sinh)
        ctx.save();
        ctx.translate(-22, -22);
        ctx.rotate(0.3);
        path(ctx, 'M -6 -12 L 6 -12 L 6 0 L -6 0 Z', '#ef4444', INK, 1.0);
        path(ctx, 'M -6 0 L 6 0 L 6 12 L -6 12 Z', '#f8fafc', INK, 1.0);
        ctx.restore();
      }
    },

    // -----------------------------------------------------------------------
    // C. 17 BỘ PHẬN CƠ THỂ CHIBI & KHUNG X-QUANG (ORGAN)
    // -----------------------------------------------------------------------

    // 24. Trái tim Chibi (heart_chibi)
    heart_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -46],
        surface: [0, -2], back: [0, -22], hand_l: [-20, -16], hand_r: [20, -16],
        grip: [20, -16]
      },
      draw(ctx, s, t) {
        // Co bóp nhịp tim tự nhiên
        const beatSpeed = (s.exercise || 0) > 0 ? 16 : 7;
        const beatPulse = Math.sin(t * beatSpeed);
        const beatScale = 1 + (beatPulse > 0.6 ? 0.08 : 0);
        ctx.save();
        ctx.translate(0, -20);
        ctx.scale(beatScale, beatScale);
        ctx.translate(0, 20);

        // Cuống động mạch chủ và tĩnh mạch nhỏ ở đỉnh
        path(ctx, 'M -6 -40 L -6 -45 L 0 -45 L 0 -40 Z', '#38bdf8', INK, 1.0);
        path(ctx, 'M 2 -40 L 2 -46 L 8 -46 L 8 -40 Z', '#f43f5e', INK, 1.0);

        // Hình quả tim đỏ hồng đầy đặn
        path(ctx, 'M 0 -12 C -24 -24 -24 -42 -2 -38 C 0 -36 0 -36 0 -34 C 0 -36 0 -36 2 -38 C 24 -42 24 -24 0 -12 Z', '#f43f5e', INK, 1.6);
        ctx.restore();
      }
    },

    // 25. Lá phổi Chibi (lungs_chibi)
    lungs_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -48],
        surface: [0, -2], back: [0, -22], hand_l: [-24, -16], hand_r: [24, -16],
        grip: [24, -16]
      },
      draw(ctx, s, t) {
        // Nhịp thở phồng xẹp
        const breath = Math.sin(t * 3.5) * 0.06;
        ctx.save();
        ctx.scale(1 + breath, 1 + breath);

        // Khí quản chữ Y ở trên
        line(ctx, [[0, -46], [0, -36]], '#cbd5e1', 3.0);
        line(ctx, [[0, -36], [-8, -30]], '#cbd5e1', 2.5);
        line(ctx, [[0, -36], [8, -30]], '#cbd5e1', 2.5);

        // Hai thùy phổi màu hồng phấn (nếu có smoke thì hơi xám)
        const lungCol = (s.smoke || 0) > 0.2 ? '#cbd5e1' : '#fda4af';
        // Phổi trái
        ellipse(ctx, -12, -22, 11, 16, lungCol, INK, 1.5);
        // Phổi phải
        ellipse(ctx, 12, -22, 11, 16, lungCol, INK, 1.5);
        ctx.restore();
      }
    },

    // 26. Bộ não Chibi (brain_chibi)
    brain_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -44],
        surface: [0, -2], back: [0, -20], hand_l: [-20, -16], hand_r: [20, -16],
        grip: [20, -16]
      },
      draw(ctx, s, t) {
        // Thân não màu hồng nhạt có nếp gấp
        ellipse(ctx, 0, -22, 22, 18, '#f9a8d4', INK, 1.6);
        // Nếp gấp vỏ não nơ-ron
        path(ctx, 'M -14 -24 Q -6 -32 0 -24 Q 6 -32 14 -24', null, '#ec4899', 1.5);
        path(ctx, 'M -16 -18 Q -8 -14 0 -18 Q 8 -14 16 -18', null, '#ec4899', 1.5);
        // Bóng đèn phát sáng nếu đang think
        if ((s.think || 0) > 0.1) {
          ellipse(ctx, 0, -48, 5, 5, '#fef08a', '#ca8a04', 1.0);
          line(ctx, [[-7, -54], [-4, -51]], '#facc15', 1.2);
          line(ctx, [[0, -56], [0, -53]], '#facc15', 1.2);
          line(ctx, [[7, -54], [4, -51]], '#facc15', 1.2);
        }
      }
    },

    // 27. Dạ dày Chibi (stomach_chibi)
    stomach_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -22], mouth: [0, -18], top: [0, -46],
        surface: [0, -2], back: [0, -22], hand_l: [-18, -16], hand_r: [18, -16],
        grip: [18, -16]
      },
      draw(ctx, s, t) {
        // Hình túi cong chữ J màu hồng đào
        const fullScale = (s.full || 0) > 0.3 ? 1.15 : 1.0;
        ctx.save();
        ctx.scale(fullScale, fullScale);
        path(ctx, 'M 4 -40 C 4 -30 -16 -30 -16 -18 C -16 -6 8 -4 14 -14 C 18 -22 10 -30 8 -40 Z', '#fb7185', INK, 1.6);
        // Bong bóng acid xanh nhẹ bên trong
        ellipse(ctx, -2, -16, 3, 3, 'rgba(163, 230, 53, 0.7)', null);
        ctx.restore();
      }
    },

    // 28. Đường ruột Chibi (intestine_chibi)
    intestine_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -42],
        surface: [0, -2], back: [0, -20], hand_l: [-20, -14], hand_r: [20, -14],
        grip: [20, -14]
      },
      draw(ctx, s, t) {
        // Ruột uốn lượn như cầu trượt màu cam nhạt
        path(ctx, 'M -18 -32 Q 0 -36 18 -32 Q 22 -22 0 -22 Q -22 -16 0 -14 Q 18 -12 14 -2', null, '#fed7aa', 10);
        path(ctx, 'M -18 -32 Q 0 -36 18 -32 Q 22 -22 0 -22 Q -22 -16 0 -14 Q 18 -12 14 -2', null, INK, 1.5);
      }
    },

    // 29. Lá gan Chibi máy lọc (liver_chibi)
    liver_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -42],
        surface: [0, -2], back: [0, -20], hand_l: [-22, -14], hand_r: [22, -14],
        grip: [22, -14]
      },
      draw(ctx, s, t) {
        // Lá gan nâu đỏ hình nêm mềm
        path(ctx, 'M -20 -18 C -20 -36 12 -38 20 -28 C 24 -18 14 -6 -6 -8 C -14 -10 -20 -12 -20 -18 Z', '#b45309', INK, 1.6);
        // Tạp dề máy lọc xanh nước sạch
        path(ctx, 'M -8 -16 L 8 -16 L 6 -6 L -6 -6 Z', '#38bdf8', INK, 1.0);
      }
    },

    // 30. Quả thận Chibi đôi (kidney_chibi)
    kidney_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -40],
        surface: [0, -2], back: [0, -20], hand_l: [-20, -14], hand_r: [20, -14],
        grip: [20, -14]
      },
      draw(ctx, s, t) {
        // Cặp hạt đậu ôm nhau
        ellipse(ctx, -8, -20, 8, 12, '#be123c', INK, 1.5);
        ellipse(ctx, 8, -20, 8, 12, '#be123c', INK, 1.5);
      }
    },

    // 31. Bàng quang Chibi bóng nước (bladder_chibi)
    bladder_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -40],
        surface: [0, -2], back: [0, -20], hand_l: [-18, -14], hand_r: [18, -14],
        grip: [18, -14]
      },
      draw(ctx, s, t) {
        // Quả bóng nước vàng chanh
        const fill = s.fill || 0.5;
        const bRad = 14 + fill * 6;
        ellipse(ctx, 0, -20, bRad, bRad * 0.9, 'rgba(254, 240, 138, 0.9)', INK, 1.5);
      }
    },

    // 32. Chiếc lưỡi Chibi vị giác (tongue_chibi)
    tongue_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -18], mouth: [0, -14], top: [0, -36],
        surface: [0, -2], back: [0, -18], hand_l: [-18, -14], hand_r: [18, -14],
        grip: [18, -14]
      },
      draw(ctx, s, t) {
        // Chiếc lưỡi hồng tươi có rãnh giữa
        path(ctx, 'M -14 -30 C -16 -12 -12 0 0 0 C 12 0 16 -12 14 -30 Z', '#fb7185', INK, 1.5);
        line(ctx, [[0, -24], [0, -8]], '#f43f5e', 1.5);
      }
    },

    // 33. Nhãn cầu mắt Chibi (eye_chibi)
    eye_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -14], top: [0, -40],
        surface: [0, -2], back: [0, -20], hand_l: [-18, -14], hand_r: [18, -14],
        grip: [18, -14]
      },
      draw(ctx, s, t) {
        // Nhãn cầu tròn trắng
        ellipse(ctx, 0, -20, 18, 18, '#ffffff', INK, 1.6);
        // Tròng mắt xanh to tròn
        ellipse(ctx, 0, -20, 9, 9, '#0284c7', null);
        ellipse(ctx, 0, -20, 5, 5, '#0f172a', null);
        ellipse(ctx, -2, -22, 2.5, 2.5, '#ffffff', null);
      }
    },

    // 34. Vành tai Chibi (ear_chibi)
    ear_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -14], top: [0, -42],
        surface: [0, -2], back: [0, -20], hand_l: [-18, -14], hand_r: [18, -14],
        grip: [18, -14]
      },
      draw(ctx, s, t) {
        // Vành tai đào cong
        path(ctx, 'M -6 -40 C 18 -42 20 -10 -4 0 C 4 -12 4 -28 -6 -40 Z', '#fed7aa', INK, 1.6);
      }
    },

    // 35. Chiếc mũi Chibi (nose_chibi)
    nose_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -14], top: [0, -40],
        surface: [0, -2], back: [0, -20], hand_l: [-18, -14], hand_r: [18, -14],
        grip: [18, -14]
      },
      draw(ctx, s, t) {
        // Chiếc mũi xinh xắn
        path(ctx, 'M -10 -12 Q 0 -34 10 -12 Q 0 -6 -10 -12 Z', '#fbcfe8', INK, 1.5);
        // Lỗ mũi nhỏ
        ellipse(ctx, -4, -12, 1.5, 1, '#be185d', null);
        ellipse(ctx, 4, -12, 1.5, 1, '#be185d', null);
      }
    },

    // 36. Mảng da Chibi biểu bì (skin_patch)
    skin_patch: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -14], top: [0, -40],
        surface: [0, -2], back: [0, -20], hand_l: [-20, -14], hand_r: [20, -14],
        grip: [20, -14]
      },
      draw(ctx, s, t) {
        // Lớp da biểu bì nhiều tầng
        path(ctx, 'M -22 -30 L 22 -30 L 22 0 L -22 0 Z', '#fed7aa', INK, 1.6);
        // Sợi lông chân lông
        path(ctx, 'M 0 -30 Q 4 -42 12 -46', null, '#78350f', 2.0);
        // Vết xước cartoon nếu có wound
        const wound = s.wound || 0;
        if (wound > 0.05) {
          path(ctx, 'M -12 -16 L 12 -14', null, '#fb7185', 2.5);
        }
      }
    },

    // 37. Khúc xương Chibi canxi (bone_chibi)
    bone_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -42],
        surface: [0, -2], back: [0, -20], hand_l: [-20, -14], hand_r: [20, -14],
        grip: [20, -14]
      },
      draw(ctx, s, t) {
        // Khúc xương hai đầu phình tròn
        path(ctx, 'M -16 -36 C -20 -36 -20 -28 -14 -28 L -14 -14 C -20 -14 -20 -6 -16 -6 L 16 -6 C 20 -6 20 -14 14 -14 L 14 -28 C 20 -28 20 -36 16 -36 Z', '#f8fafc', INK, 1.6);
      }
    },

    // 38. Bắp cơ Chibi gồng khoẻ (muscle_chibi)
    muscle_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -42],
        surface: [0, -2], back: [0, -20], hand_l: [-20, -14], hand_r: [20, -14],
        grip: [20, -14]
      },
      draw(ctx, s, t) {
        // Bắp tay gồng nở to
        const flex = s.flex || 0;
        const flexR = 14 + flex * 6;
        ellipse(ctx, 0, -20, flexR, flexR * 0.85, '#fb923c', INK, 1.6);
      }
    },

    // 39. Giọt máu Chibi dẫn chuyện (blood_drop_chibi)
    blood_drop_chibi: {
      group: 'organ',
      anchors: {
        root: [0, 0], face: [0, -20], mouth: [0, -16], top: [0, -40],
        surface: [0, -2], back: [0, -20], hand_l: [-18, -14], hand_r: [18, -14],
        grip: [18, -14]
      },
      draw(ctx, s, t) {
        // Giọt máu màu hồng cam dịu dàng thân thiện (không đỏ máu me)
        path(ctx, 'M 0 -38 C -16 -24 -16 0 0 0 C 16 0 16 -24 0 -38 Z', '#fb7185', INK, 1.6);
        // Má hồng dễ thương
        ellipse(ctx, -7, -18, 2.5, 1.5, '#f43f5e', null);
        ellipse(ctx, 7, -18, 2.5, 1.5, '#f43f5e', null);
      }
    },

    // 40. Khung X-quang cơ thể Chibi trong suốt (body_xray)
    body_xray: {
      group: 'organ',
      anchors: {
        root: [0, 0], surface: [0, 0], top: [0, -95], head_top: [0, -90],
        brain: [0, -78], eye_l: [-8, -70], eye_r: [8, -70],
        nose: [0, -65], mouth: [0, -58], lungs: [0, -42],
        heart: [6, -40], liver: [-7, -34], stomach: [6, -32],
        kidney_l: [-8, -26], kidney_r: [8, -26], intestine: [0, -20],
        bladder: [0, -12], bone_arm: [-18, -38], muscle_arm: [18, -38]
      },
      draw(ctx, s, t) {
        // Chibi trong suốt (dáng chibi_kid: đầu to, thân ngắn, tay mitten) với các cơ quan giản lược đặt đúng
        // ô anchor. Bên của nhân vật: tim lệch sang TRÁI nhân vật = bên phải màn hình (x > 0), gan bên trái màn hình.
        const A = this.anchors, glass = 'rgba(125, 211, 252, 0.16)', rim = '#38bdf8';
        const beat = 1 + 0.08 * Math.max(0, Math.sin((t || 0) * 7)), breath = 1 + 0.05 * Math.sin((t || 0) * 2.2);
        const hl = s.highlight;
        const organ = (name, fn) => {
          ctx.save();
          ctx.globalAlpha *= hl && hl !== name ? 0.35 : 1;
          const [x, y] = A[name];
          if (hl === name) {
            const g = ctx.createRadialGradient(x, y, 1, x, y, 16);
            g.addColorStop(0, 'rgba(250, 204, 21, 0.75)'); g.addColorStop(1, 'rgba(250, 204, 21, 0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill();
          }
          fn(x, y);
          ctx.restore();
        };
        ctx.save();
        // Thân kính: chân, tay, thân, đầu
        for (const side of [-1, 1]) {
          taper(ctx, side * 7, -20, side * 8, -5, 5, 4.4, glass, rim, 1.4);
          ellipse(ctx, side * 8, -2, 6, 4, glass, rim, 1.4);
          taper(ctx, side * 14, -44, side * 22, -30, 4.2, 3.6, glass, rim, 1.4);
          taper(ctx, side * 22, -30, side * 24, -22, 3.6, 3.2, glass, rim, 1.4);
          mitten(ctx, side * 24, -22, 4.2, glass, side < 0 ? Math.PI * 0.6 : Math.PI * 0.4);
        }
        path(ctx, 'M -14 -46 Q -18 -20 -11 -16 L 11 -16 Q 18 -20 14 -46 Z', glass, rim, 1.8);
        taper(ctx, 0, -46, 0, -52, 4.5, 4.5, glass, null);
        ellipse(ctx, 0, -68, 20, 19.5, glass, rim, 1.8);
        // Xương tay trái (màn hình) và cơ bắp tay phải
        organ('bone_arm', (x, y) => { line(ctx, [[x + 3, y - 5], [x - 3, y + 7]], '#f8fafc', 2.4); for (const [dx, dy] of [[3, -5], [-3, 7]]) ellipse(ctx, x + dx, y + dy, 1.8, 1.8, '#f8fafc', '#94a3b8', 0.6); });
        organ('muscle_arm', (x, y) => ellipse(ctx, x, y, 3.2, 6, '#fb7185', '#be123c', 0.8, -0.5));
        // Não, mắt, mũi, miệng
        organ('brain', (x, y) => { ellipse(ctx, x, y, 12, 8, '#f9a8d4', '#db2777', 1); for (const dx of [-6, 0, 6]) path(ctx, `M ${x + dx - 3} ${y - 3} Q ${x + dx} ${y + 1} ${x + dx + 3} ${y - 3}`, null, '#db2777', 0.8); line(ctx, [[x, y - 8], [x, y + 8]], '#db2777', 0.8); });
        for (const e of ['eye_l', 'eye_r']) organ(e, (x, y) => { ellipse(ctx, x, y, 3.4, 3.4, '#f8fafc', '#475569', 0.8); ellipse(ctx, x, y, 1.6, 1.6, '#0f172a', null); });
        organ('nose', (x, y) => path(ctx, `M ${x} ${y - 3} L ${x + 2} ${y + 2} L ${x - 2} ${y + 2} Z`, '#fda4af', '#be123c', 0.6));
        organ('mouth', (x, y) => path(ctx, `M ${x - 4} ${y} Q ${x} ${y + 3} ${x + 4} ${y}`, null, '#be123c', 1.2));
        // Phổi hai lá (thở), tim đập lệch về trái nhân vật
        organ('lungs', (x, y) => { for (const side of [-1, 1]) ellipse(ctx, x + side * 6.5, y + 2, 5 * breath, 8 * breath, '#fda4af', '#e11d48', 0.9); line(ctx, [[x, y - 8], [x, y - 3]], '#e11d48', 1.2); });
        organ('heart', (x, y) => { ctx.save(); ctx.translate(x, y); ctx.scale(beat, beat); path(ctx, 'M 0 3.5 Q -5 -0.5 -3.4 -3.2 Q -1.4 -4.6 0 -2.4 Q 1.4 -4.6 3.4 -3.2 Q 5 -0.5 0 3.5 Z', '#ef4444', '#991b1b', 0.8); ctx.restore(); });
        organ('liver', (x, y) => path(ctx, `M ${x - 7} ${y - 2} Q ${x - 5} ${y - 6} ${x + 5} ${y - 4} Q ${x + 3} ${y + 3} ${x - 6} ${y + 2} Z`, '#a16207', '#713f12', 0.9));
        organ('stomach', (x, y) => path(ctx, `M ${x - 3} ${y - 4} Q ${x + 6} ${y - 5} ${x + 5} ${y + 1} Q ${x + 3} ${y + 5} ${x - 3} ${y + 3} Q ${x} ${y} ${x - 3} ${y - 4} Z`, '#fdba74', '#c2410c', 0.9));
        for (const k of ['kidney_l', 'kidney_r']) organ(k, (x, y) => ellipse(ctx, x, y, 2.4, 3.6, '#b45309', '#78350f', 0.8, k === 'kidney_l' ? 0.3 : -0.3));
        organ('intestine', (x, y) => { path(ctx, `M ${x - 7} ${y - 3} Q ${x - 7} ${y + 4} ${x} ${y + 3} Q ${x + 7} ${y + 4} ${x + 7} ${y - 3} Q ${x + 3} ${y - 5} ${x} ${y - 2} Q ${x - 3} ${y - 5} ${x - 7} ${y - 3} Z`, '#fbcfe8', '#db2777', 0.9); path(ctx, `M ${x - 3} ${y} Q ${x} ${y + 1.5} ${x + 3} ${y}`, null, '#db2777', 0.7); });
        organ('bladder', (x, y) => ellipse(ctx, x, y, 3, 2.6, '#fde68a', '#ca8a04', 0.8));
        ctx.restore();
      }
    }
  };

  // =========================================================================
  // 3. 12 HÌNH NỀN HIỂN VI TRONG CƠ THỂ (GROUND_Y: 810)
  // =========================================================================


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

  const BODY_BACKGROUNDS = {
    // 1. Đường huyết mạch (blood_vessel)
    blood_vessel: {
      label: 'Đường huyết mạch cơ thể',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#1f0914' : '#ffe4e6';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Thành mạch máu hồng cong mềm
        path(ctx, 'M 0 0 Q 288 80 576 0 L 576 120 Q 288 200 0 120 Z', isNight ? '#4c0519' : '#fecdd3', null);
        path(ctx, 'M 0 690 Q 288 610 576 690 L 576 810 L 0 810 Z', isNight ? '#4c0519' : '#fecdd3', null);

        // Hồng cầu trôi mờ ở xa
        for (let i = 0; i < 6; i++) {
          const rx = (i * 96 + t * 40) % 640 - 32;
          const ry = 300 + Math.sin(t * 2 + i) * 60;
          ellipse(ctx, rx, ry, 18, 12, 'rgba(244, 63, 94, 0.35)', null);
        }

        // Khổ ngang: thành mạch nối tiếp, hồng cầu và bạch cầu trôi ở hai bên
        for (const [ea, eb] of ext) {
          for (let ox = ea < 0 ? -576 : 576; ea < 0 ? ox + 576 > ea : ox < eb; ox += ea < 0 ? -576 : 576) {
            path(ctx, `M ${ox} 0 Q ${ox + 288} 80 ${ox + 576} 0 L ${ox + 576} 120 Q ${ox + 288} 200 ${ox} 120 Z`, isNight ? '#4c0519' : '#fecdd3', null);
            path(ctx, `M ${ox} 690 Q ${ox + 288} 610 ${ox + 576} 690 L ${ox + 576} 810 L ${ox} 810 Z`, isNight ? '#4c0519' : '#fecdd3', null);
          }
        }
        scatterExt(ext, 110, 'bv_rbc', (x, r, i) => {
          const rx = x + Math.sin(t * 1.5 + i) * 20 + t * 30 % 40;
          const ry = 250 + r * 330 + Math.sin(t * 2 + i) * 30;
          if (r > 0.82) ellipse(ctx, rx, ry, 30, 30, 'rgba(241, 245, 249, 0.55)', 'rgba(148, 163, 184, 0.6)', 1.4);
          else { ellipse(ctx, rx, ry, 22, 14, 'rgba(244, 63, 94, 0.4)', null); ellipse(ctx, rx, ry, 9, 5, 'rgba(190, 18, 60, 0.25)', null); }
        });
        // Đáy mạch (ground_y: 810)
        ctx.fillStyle = isNight ? '#3b0716' : '#fda4af';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], isNight ? '#881337' : '#e11d48', 2.4);
      }
    },

    // 2. Phế nang phổi hô hấp (lung_alveoli)
    lung_alveoli: {
      label: 'Phế nang phổi hô hấp',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#1e1124' : '#fdf2f8';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Chùm bóng phế nang phồng xẹp theo t
        const pulse = Math.sin(t * 3) * 8;
        const bubbles = [
          [120, 240, 60], [280, 200, 75], [440, 260, 65],
          [180, 420, 80], [360, 400, 85], [260, 580, 90]
        ];
        for (const [bx, by, br] of bubbles) {
          ellipse(ctx, bx, by, br + pulse, br + pulse, isNight ? '#4a154b' : '#fce7f3', '#f472b6', 1.8);
          ellipse(ctx, bx - 15, by - 15, 12, 8, '#ffffff', null);
        }

        scatterExt(ext, 150, 'lung', (x, r, i) => {
          for (const [by, k] of [[200 + r * 120, 0], [440 + r * 150, 1]]) {
            const br = 55 + RemakeVector.kit.seeded(`lung_r:${Math.round(x)}:${k}`) * 35;
            const bx = x + (k ? 40 : 0);
            ellipse(ctx, bx, by, br + pulse, br + pulse, isNight ? '#4a154b' : '#fce7f3', '#f472b6', 1.8);
            ellipse(ctx, bx - 15, by - 15, 12, 8, '#ffffff', null);
          }
        });
        // Sàn phế nang (ground_y: 810)
        ctx.fillStyle = isNight ? '#2e1065' : '#fbcfe8';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#db2777', 2.4);
      }
    },

    // 3. Lòng dạ dày tiêu hoá (stomach_inside)
    stomach_inside: {
      label: 'Lòng dạ dày tiêu hoá',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#1c1917' : '#fff1f2';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Nếp gấp niêm mạc dạ dày (rugae)
        for (let x = 60; x < 576; x += 110) {
          path(ctx, `M ${x} 0 Q ${x + 20} 240 ${x} 480`, null, isNight ? '#4c0519' : '#fecdd3', 14);
        }

        tileExt(ext, 60, 110, 575, (x) => path(ctx, `M ${x} 0 Q ${x + 20} 240 ${x} 480`, null, isNight ? '#4c0519' : '#fecdd3', 14));
        for (const [ea, eb] of ext) {
          for (let ox = ea < 0 ? -576 : 576; ea < 0 ? ox + 576 > ea : ox < eb; ox += ea < 0 ? -576 : 576) {
            path(ctx, `M ${ox} 680 Q ${ox + 144} 650 ${ox + 288} 680 Q ${ox + 432} 710 ${ox + 576} 680 L ${ox + 576} 810 L ${ox} 810 Z`, 'rgba(163, 230, 53, 0.35)', null);
          }
        }
        scatterExt(ext, 70, 'acid', (x, r) => ellipse(ctx, x, 720 + r * 70 - ((t * 30 + r * 50) % 40), 4 + r * 6, 4 + r * 6, null, 'rgba(101, 163, 13, 0.6)', 1.4));
        // Hồ acid sủi bọt ở đáy
        path(ctx, 'M 0 680 Q 144 650 288 680 Q 432 710 576 680 L 576 810 L 0 810 Z', 'rgba(163, 230, 53, 0.35)', null);

        // Sàn dạ dày (ground_y: 810)
        ctx.fillStyle = isNight ? '#292524' : '#fda4af';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#e11d48', 2.4);
      }
    },

    // 4. Làng lông nhung đường ruột (intestine_town)
    intestine_town: {
      label: 'Làng lông nhung đường ruột',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#1a1008' : '#fff7ed';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Hàng ngàn lông nhung mềm như đồi cỏ nhấp nhô
        for (let x = 30; x <= 550; x += 40) {
          const sway = Math.sin(t * 4 + x * 0.1) * 8;
          taper(ctx, x, 810, x + sway, 520, 16, 12, isNight ? '#7c2d12' : '#fed7aa', '#ea580c', 1.4);
        }

        tileExt(ext, 30, 40, 550, (x) => {
          const sway = Math.sin(t * 4 + x * 0.1) * 8;
          const top = 520 + (RemakeVector.kit.seeded(`villus:${x}`) - 0.5) * 80;
          taper(ctx, x, 810, x + sway, top, 16, 12, isNight ? '#7c2d12' : '#fed7aa', '#ea580c', 1.4);
        });
        scatterExt(ext, 160, 'gut_bug', (x, r) => { ellipse(ctx, x, 360 + r * 100, 14, 8, 'rgba(34, 197, 94, 0.45)', '#15803d', 1.0, r); });
        // Sàn đồi lông nhung (ground_y: 810)
        ctx.fillStyle = isNight ? '#431407' : '#fdba74';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#c2410c', 2.4);
      }
    },

    // 5. Mặt biểu bì da (skin_surface)
    skin_surface: {
      label: 'Mặt biểu bì da',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#18181b' : '#fafaf9';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Sợi lông chân lông mọc như thân cây cao
        for (const hx of [120, 320, 480]) {
          path(ctx, `M ${hx} 810 Q ${hx + 30} 420 ${hx + 50} 180`, null, '#78350f', 6.0);
        }

        scatterExt(ext, 170, 'hair', (x, r) => path(ctx, `M ${x} 810 Q ${x + 20 + r * 20} ${420 + r * 60} ${x + 30 + r * 40} ${160 + r * 80}`, null, '#78350f', 5 + r * 2));
        scatterExt(ext, 90, 'pore', (x, r) => ellipse(ctx, x, 770 + r * 30, 10 + r * 6, 4, isNight ? '#3f3f46' : '#e7c3a4', null));
        // Ô tế bào sừng xếp lớp
        ctx.fillStyle = isNight ? '#27272a' : '#f5d0b5';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#d97706', 2.4);
      }
    },

    // 6. Vị trí vết xước phục hồi (wound_site)
    wound_site: {
      label: 'Vị trí vết xước phục hồi',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#1f1315' : '#fff1f2';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Khe núi xước hoạt hình màu cam đào (không đỏ máu me)
        path(ctx, 'M 220 810 L 250 480 L 290 810 Z', isNight ? '#4c0519' : '#fda4af', null);

        // Giàn giáo fibrin của tiểu cầu đan chéo
        line(ctx, [[210, 680], [310, 640]], '#e2e8f0', 2.0);
        line(ctx, [[210, 600], [300, 670]], '#e2e8f0', 2.0);

        scatterExt(ext, 190, 'wound_hair', (x, r) => path(ctx, `M ${x} 810 Q ${x + 25} ${460 + r * 60} ${x + 40} ${220 + r * 80}`, null, '#78350f', 5));
        scatterExt(ext, 120, 'platelet', (x, r) => { ellipse(ctx, x, 560 + r * 160, 9, 6, isNight ? '#a78bfa' : '#c4b5fd', '#7c3aed', 1.0, r * 3); });
        // Sàn vết xước (ground_y: 810)
        ctx.fillStyle = isNight ? '#3b0716' : '#fecdd3';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#fb7185', 2.4);
      }
    },

    // 7. Vòm miệng và cung răng (mouth_cave)
    mouth_cave: {
      label: 'Vòm miệng và cung răng',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#200b14' : '#ffe4e6';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Dãy răng trên trắng như nhũ đá
        for (let x = 40; x <= 540; x += 55) {
          path(ctx, `M ${x - 22} 0 L ${x + 22} 0 L ${x + 16} 70 L ${x - 16} 70 Z`, '#ffffff', '#cbd5e1', 1.6);
        }

        // Dãy răng dưới trắng ở mép sàn
        for (let x = 40; x <= 540; x += 55) {
          path(ctx, `M ${x - 20} 810 L ${x + 20} 810 L ${x + 16} 750 L ${x - 16} 750 Z`, '#ffffff', '#cbd5e1', 1.6);
        }

        tileExt(ext, 40, 55, 540, (x) => {
          path(ctx, `M ${x - 22} 0 L ${x + 22} 0 L ${x + 16} 70 L ${x - 16} 70 Z`, '#ffffff', '#cbd5e1', 1.6);
          path(ctx, `M ${x - 20} 810 L ${x + 20} 810 L ${x + 16} 750 L ${x - 16} 750 Z`, '#ffffff', '#cbd5e1', 1.6);
        });
        scatterExt(ext, 220, 'uvula', (x, r) => ellipse(ctx, x, 380 + r * 160, 16 + r * 10, 10 + r * 6, isNight ? 'rgba(251, 113, 133, 0.25)' : 'rgba(251, 113, 133, 0.35)', null));
        // Lưỡi hồng làm sàn (ground_y: 810)
        ctx.fillStyle = isNight ? '#4c0519' : '#fb7185';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#e11d48', 2.4);
      }
    },

    // 8. Khoang mũi và rừng lông mao (nose_cave)
    nose_cave: {
      label: 'Khoang mũi và rừng lông mao',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#1e1b2e' : '#fdf4ff';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Rừng lông mũi đung đưa
        for (let x = 30; x <= 550; x += 45) {
          const sway = Math.sin(t * 5 + x) * 10;
          path(ctx, `M ${x} 810 Q ${x + sway * 0.6} 580 ${x + sway} 420`, null, isNight ? '#475569' : '#78350f', 3.5);
        }

        // Hạt bụi phấn hoa lơ lửng
        for (let i = 0; i < 8; i++) {
          const px = (i * 70 + t * 20) % 576;
          const py = 280 + Math.sin(t * 3 + i) * 40;
          ellipse(ctx, px, py, 3, 3, '#facc15', null);
        }

        tileExt(ext, 30, 45, 550, (x) => {
          const sway = Math.sin(t * 5 + x) * 10;
          const top = 420 + (RemakeVector.kit.seeded(`nosehair:${x}`) - 0.5) * 120;
          path(ctx, `M ${x} 810 Q ${x + sway * 0.6} 580 ${x + sway} ${top}`, null, isNight ? '#475569' : '#78350f', 3.5);
        });
        scatterExt(ext, 75, 'pollen', (x, r, i) => ellipse(ctx, x + Math.sin(t + i) * 15, 240 + r * 120 + Math.sin(t * 3 + i) * 30, 3, 3, '#facc15', null));
        // Sàn khoang mũi (ground_y: 810)
        ctx.fillStyle = isNight ? '#2e1065' : '#f5d0fe';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#c026d3', 2.4);
      }
    },

    // 9. Căn cứ hạch bạch huyết (lymph_node_base)
    lymph_node_base: {
      label: 'Căn cứ hạch bạch huyết',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#0a1d2e' : '#ecfeff';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Doanh trại vòm tròn kiểu pháo đài tương lai
        path(ctx, 'M 120 810 Q 288 320 456 810 Z', isNight ? '#083344' : '#cffafe', '#06b6d4', 2.5);

        // Cờ hiệu hình kháng thể chữ Y (không có cờ quốc gia)
        line(ctx, [[288, 380], [288, 300]], '#0891b2', 3.0);
        path(ctx, 'M 288 300 L 330 315 L 288 330 Z', '#38bdf8', '#0284c7', 1.2);
        // Chữ Y trên cờ
        path(ctx, 'M 298 318 L 306 318 M 306 318 L 312 312 M 306 318 L 312 324', null, '#ffffff', 1.8);

        scatterExt(ext, 300, 'lymph', (x, r) => {
          const hw = 80 + r * 50, top = 520 + r * 120;
          path(ctx, `M ${x - hw} 810 Q ${x} ${top - (810 - top)} ${x + hw} 810 Z`, isNight ? '#083344' : '#cffafe', '#06b6d4', 2.2);
          ellipse(ctx, x, 790 - (810 - top) * 0.3, 14, 18, isNight ? '#0e7490' : '#a5f3fc', '#0891b2', 1.4);
          path(ctx, `M ${x - 10} ${top - 40} L ${x} ${top - 25} L ${x + 10} ${top - 40} M ${x} ${top - 25} L ${x} ${top - 8}`, null, '#0891b2', 3);
        });
        // Sàn căn cứ (ground_y: 810)
        ctx.fillStyle = isNight ? '#0c2436' : '#a5f3fc';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#0891b2', 2.4);
      }
    },

    // 10. Nhà máy tuỷ xương sinh tế bào (bone_marrow_factory)
    bone_marrow_factory: {
      label: 'Nhà máy tuỷ xương sinh tế bào',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#1c1409' : '#fffbeb';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Khung tuỷ xương xốp dạng tổ ong
        for (let x = 60; x <= 520; x += 100) {
          for (let y = 140; y <= 560; y += 100) {
            ellipse(ctx, x, y, 32, 28, isNight ? '#451a03' : '#fef3c7', '#d97706', 1.5);
          }
        }

        tileExt(ext, 60, 100, 575, (x) => {
          for (let y = 140; y <= 560; y += 100) ellipse(ctx, x, y, 32, 28, isNight ? '#451a03' : '#fef3c7', '#d97706', 1.5);
        });
        for (const [ea, eb] of ext) {
          line(ctx, [[ea, 680], [eb, 680]], '#94a3b8', 4.0);
        }
        tileExt(ext, 90, 70, 480, (x) => ellipse(ctx, x, 680, 5, 5, '#475569', null));
        scatterExt(ext, 140, 'stemcell', (x, r) => ellipse(ctx, x + ((t * 25) % 70), 662, 12, 12, isNight ? '#a78bfa' : '#ddd6fe', '#7c3aed', 1.2));
        // Băng chuyền đưa tế bào non ra ngoài
        line(ctx, [[60, 680], [516, 680]], '#94a3b8', 4.0);
        for (let cx = 90; cx <= 480; cx += 70) {
          ellipse(ctx, cx, 680, 5, 5, '#475569', null);
        }

        // Sàn nhà máy (ground_y: 810)
        ctx.fillStyle = isNight ? '#291804' : '#fde68a';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#b45309', 2.4);
      }
    },

    // 11. Trung tâm chỉ huy não bộ (brain_hq)
    brain_hq: {
      label: 'Trung tâm chỉ huy não bộ',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#0b1120' : '#f8fafc';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Màn hình sóng nơ-ron điện não đồ (chỉ hình đồ thị sóng, không có chữ)
        path(ctx, 'M 140 240 L 436 240 L 436 420 L 140 420 Z', isNight ? '#020617' : '#0f172a', '#38bdf8', 2.5);
        ctx.beginPath();
        for (let x = 160; x <= 416; x += 8) {
          const sy = 330 + Math.sin(t * 8 + x * 0.15) * 25;
          if (x === 160) ctx.moveTo(x, sy); else ctx.lineTo(x, sy);
        }
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Bàn điều khiển hiện đại
        path(ctx, 'M 80 810 L 140 680 L 436 680 L 496 810 Z', isNight ? '#1e293b' : '#e2e8f0', '#64748b', 2.0);

        scatterExt(ext, 280, 'brainhq', (x, r, i) => {
          const mw = 150 + r * 50, my = 200 + r * 80;
          path(ctx, `M ${x - mw / 2} ${my} L ${x + mw / 2} ${my} L ${x + mw / 2} ${my + 120} L ${x - mw / 2} ${my + 120} Z`, isNight ? '#020617' : '#0f172a', '#38bdf8', 2.2);
          ctx.beginPath();
          for (let k = 0; k <= mw - 30; k += 8) {
            const sy = my + 60 + Math.sin(t * (5 + i) + k * 0.2) * 20 * (r + 0.4);
            if (k === 0) ctx.moveTo(x - mw / 2 + 15 + k, sy); else ctx.lineTo(x - mw / 2 + 15 + k, sy);
          }
          ctx.strokeStyle = ['#22c55e', '#f472b6', '#facc15'][i % 3]; ctx.lineWidth = 2.0; ctx.stroke();
          path(ctx, `M ${x - 110} 810 L ${x - 70} 720 L ${x + 70} 720 L ${x + 110} 810 Z`, isNight ? '#1e293b' : '#e2e8f0', '#64748b', 2.0);
          for (let k = -2; k <= 2; k++) ellipse(ctx, x + k * 22, 745, 5, 5, ['#22c55e', '#f43f5e', '#38bdf8', '#facc15', '#a78bfa'][(k + 2 + i) % 5], null);
        });
        // Sàn chỉ huy (ground_y: 810)
        ctx.fillStyle = isNight ? '#0f172a' : '#cbd5e1';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#334155', 2.4);
      }
    },

    // 12. Doanh trại huấn luyện miễn dịch (training_camp)
    training_camp: {
      label: 'Doanh trại huấn luyện miễn dịch',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        const { x0, x1 } = RemakeVector.kit.frameSpan(s);
        const ext = extRanges(x0, x1);
        ctx.fillStyle = isNight ? '#141c10' : '#f0fdf4';
        ctx.fillRect(x0, 0, x1 - x0, 810);

        // Bù nhìn vi khuẩn tập bắn cho tân binh
        for (const dummyX of [140, 436]) {
          line(ctx, [[dummyX, 810], [dummyX, 580]], '#78350f', 4.0);
          ellipse(ctx, dummyX, 550, 22, 22, '#ca8a04', INK, 1.8);
          // Núm gai bù nhìn
          for (let i = 0; i < 4; i++) {
            const ang = (i * TAU) / 4;
            ellipse(ctx, dummyX + Math.cos(ang) * 24, 550 + Math.sin(ang) * 24, 3, 3, '#a16207', null);
          }
        }

        // Hàng rào tập vượt chướng ngại vật
        line(ctx, [[240, 740], [336, 740]], '#dc2626', 3.0);
        line(ctx, [[240, 810], [240, 740]], '#475569', 2.5);
        line(ctx, [[336, 810], [336, 740]], '#475569', 2.5);

        scatterExt(ext, 220, 'dummy', (x, r, i) => {
          if (i % 2 === 0) {
            line(ctx, [[x, 810], [x, 600 + r * 40]], '#78350f', 4.0);
            ellipse(ctx, x, 570 + r * 40, 22, 22, '#ca8a04', INK, 1.8);
            for (let k = 0; k < 4; k++) { const ang = (k * TAU) / 4; ellipse(ctx, x + Math.cos(ang) * 24, 570 + r * 40 + Math.sin(ang) * 24, 3, 3, '#a16207', null); }
          } else {
            const hh = 50 + r * 30;
            line(ctx, [[x - 45, 810 - hh], [x + 45, 810 - hh]], '#f59e0b', 3.0);
            line(ctx, [[x - 45, 810], [x - 45, 810 - hh]], '#475569', 2.5);
            line(ctx, [[x + 45, 810], [x + 45, 810 - hh]], '#475569', 2.5);
          }
        });
        // Sàn sân tập (ground_y: 810)
        ctx.fillStyle = isNight ? '#1e293b' : '#bbf7d0';
        ctx.fillRect(x0, 810, x1 - x0, 214);
        line(ctx, [[x0, 810], [x1, 810]], '#16a34a', 2.4);
      }
    }
  };

  // =========================================================================
  // 4. 20 ĐỘNG TÁC CHIẾN ĐẤU & HOẠT ĐỘNG CƠ THỂ (ACTION HOOKS)
  // =========================================================================

  function contactBlend(p, inEnd, outStart) {
    return p < inEnd ? smooth(p / inEnd) : p > outStart ? 1 - smooth((p - outStart) / (1 - outStart)) : 1;
  }

  const bodyActionHooks = {
    // 1. Đi tuần bảo vệ (patrol)
    patrol(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (!s) return;
      s.walk = p * 4;
      // Nhìn qua lại hai bên
      s.look_x = Math.sin(p * Math.PI * 6) * 6;
    },

    // 2. Chỉ huy phát sóng tập hợp (rally)
    rally(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (!s) return;
      s.glow = contactBlend(p, 0.15, 0.85);
      // Các đồng đội xung quanh cùng sáng bừng
      for (const id in states) {
        if (id !== a.actor && cat.assets[states[id].asset]?.group === 'cell') {
          states[id].glow = Math.max(states[id].glow || 0, s.glow * 0.85);
        }
      }
    },

    // 3. Xông lên tấn công chớp nhoáng (charge)
    charge(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor], tgt = states[a.target];
      if (!s || !tgt) return;
      s.walk = p * 6;
      s.squish = Math.sin(p * Math.PI) * 0.35;
    },

    // 4. Chém mầm bệnh (slash)
    slash(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor], tgt = states[a.target];
      if (!s || !tgt) return;
      if (p > 0.4) {
        tgt.stunned = 1;
      }
      if (p > 0.8) {
        tgt.pop = (p - 0.8) / 0.2;
      }
    },

    // 5. Bắn cung kháng thể chữ Y (shoot_antibody)
    shoot_antibody(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor], tgt = states[a.target];
      if (!s || !tgt) return;
      // Kháng thể chạm đích ở mốc p >= 0.5, lúc đó tagged bắt đầu tăng
      if (p >= 0.5) {
        tgt.tagged = (p - 0.5) / 0.5;
      }
    },

    // 6. Đại thực bào nuốt mầm bệnh (engulf)
    engulf(a, states, t, p, u, amount, cat, active) {
      const s = states[a.actor], tgt = states[a.target];
      if (!s || !tgt) return;
      s.engulf = contactBlend(p, 0.2, 0.8);
      // Mầm bệnh di chuyển vào tâm bụng macrophage và mờ dần
      if (p >= 0.2) {
        const bellyPos = RemakeVector.worldAnchor(cat, s, 'belly');
        const progress = Math.min(1, (p - 0.2) / 0.6);
        tgt.x = mix(tgt.x, bellyPos.x, progress);
        tgt.y = mix(tgt.y, bellyPos.y, progress);
        tgt.opacity = Math.max(0, 1 - progress);
      }
      if (p >= 0.99 || !active) {
        tgt.opacity = 0;
      }
    },

    // 7. Tung lưới bẫy NETs (net_trap)
    net_trap(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor], tgt = states[a.target];
      if (!s || !tgt) return;
      s.net_trap = true;
      if (p > 0.4) {
        tgt.squish = 0.5;
        tgt.stunned = 1;
      }
    },

    // 8. Giơ khiên chắn phòng thủ (shield_block)
    shield_block(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (!s) return;
      s.squish = Math.sin(p * Math.PI) * 0.2;
    },

    // 9. Trình diện ảnh truy nã (present)
    present(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor], tgt = states[a.target];
      if (!s) return;
      s.glow = 0.8;
      if (tgt && p > 0.5) {
        tgt.alert = 1;
        tgt.glow = 0.8;
      }
    },

    // 10. Vận chuyển oxy tới cơ quan (deliver)
    deliver(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor], tgt = states[a.target];
      if (!s || !tgt) return;
      if (p >= 0.5) {
        tgt.glow = (p - 0.5) / 0.5;
        s.o2 = 0; // Đổi sang CO2
      } else {
        s.o2 = 1;
      }
    },

    // 11. Tiểu cầu vá vết thương (patch_wound)
    patch_wound(a, states, t, p, u, amount, cat, active) {
      const tgt = states[a.target];
      if (!tgt) return;
      // Vết xước giảm đơn điệu từ ban đầu về 0
      const initWound = a._init_wound != null ? a._init_wound : (tgt.wound != null ? tgt.wound : 1.0);
      a._init_wound = initWound;
      tgt.wound = Math.max(0, initWound * (1 - p));
    },

    // 12. Quét dọn (sweep: lông mao cilia hoặc chibi quét rác)
    sweep(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor], tgt = states[a.target];
      if (s) {
        const sweepPhase = Math.sin(t * 8);
        s.hand_r_x = 22 + sweepPhase * 10;
        s.hand_r_y = -24 + Math.abs(sweepPhase) * 4;
      }
      if (tgt) {
        // Quét vi khuẩn/vật thể bay ra khỏi khung
        tgt.x += p * 12;
        tgt.y -= Math.sin(p * Math.PI) * 15;
      }
    },

    // 13. Virus xâm nhập tế bào (hijack)
    hijack(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor], tgt = states[a.target];
      if (!s || !tgt) return;
      if (p >= 0.4) {
        tgt.infected = (p - 0.4) / 0.6;
      }
    },

    // 14. Tiêu diệt tế bào nhiễm (strike_infected)
    strike_infected(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const tgt = states[a.target];
      if (!tgt) return;
      if (p >= 0.7) {
        tgt.pop = (p - 0.7) / 0.3;
      }
    },

    // 15. Vi khuẩn phân chia nhân đôi (multiply)
    multiply(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (!s) return;
      s.split = p;
    },

    // 16. Lật album nhận diện kháng nguyên (remember)
    remember(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (!s) return;
      s.glow = contactBlend(p, 0.2, 0.8);
    },

    // 17. Báo động nhầm dị ứng phấn hoa (false_alarm)
    false_alarm(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (!s) return;
      s.alert = 1;
    },

    // 18. Gan và thận lọc độc tố (filter)
    filter(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const tgt = states[a.target];
      if (!tgt) return;
      if (p >= 0.5) {
        tgt.pop = (p - 0.5) / 0.5;
      }
    },

    // 19. Vi khuẩn khoan sâu răng (drill)
    drill(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const tgt = states[a.target];
      if (!tgt) return;
      tgt.cavity = Math.min(1.0, (tgt.cavity || 0) + p * 0.4);
    },

    // 20. Ăn mừng chiến thắng (victory)
    victory(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (!s) return;
      s.glow = 1.0;
      s.bounce = Math.abs(Math.sin(p * Math.PI * 4)) * 18;
    }
  };

  // =========================================================================
  // 5. ĐĂNG KÝ GÓI BODY_WORLD
  // =========================================================================

  RemakeVector.register({
    rigs: BODY_RIGS,
    backgrounds: BODY_BACKGROUNDS,
    actionHooks: bodyActionHooks
  });

})();
