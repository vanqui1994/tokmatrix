// remake_vector_packs/medical.js — Giai đoạn H: Đồ y tế, vi sinh bản đầu, hình nền giáo dục & y tế
// 24 Đồ y tế & vệ sinh, 4 rig vi sinh & răng, 10 hình nền chuẩn ground_y: 810 (ngày & đêm), 13 action hooks y tế.
// Hoàn toàn không chữ, không nhãn hiệu, không dùng chữ thập đỏ (dùng dấu cộng xanh lá/xanh dương y tế).

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
  // 1. ĐỒ Y TẾ VÀ VỆ SINH (24 PROPS/TOOLS)
  // =========================================================================

  const MEDICAL_RIGS = {
    // 1. Ống nghe y tế
    stethoscope: {
      group: 'tool',
      anchors: { root: [0, 0], grip: [0, -10], chest_piece: [0, 0], earpieces: [0, -40], top: [0, -45], surface: [0, -5] },
      draw(ctx, s, t) {
        // Dây chữ Y cao su màu xanh than
        path(ctx, 'M -14 -40 Q -10 -20 0 -12 Q 10 -20 14 -40', null, '#1e293b', 3.0);
        // Dây nối xuống củ nghe
        path(ctx, 'M 0 -12 Q -6 6 0 0', null, '#1e293b', 3.0);
        // Hai núm tai nghe
        ellipse(ctx, -14, -40, 2.5, 2.5, '#475569', null);
        ellipse(ctx, 14, -40, 2.5, 2.5, '#475569', null);
        // Củ nghe kim loại mạ bạc
        ellipse(ctx, 0, 0, 8.0, 8.0, '#cbd5e1', INK, 1.4);
        ellipse(ctx, 0, 0, 5.0, 5.0, '#94a3b8', null);
        ellipse(ctx, -2, -2, 2.0, 2.0, '#ffffff', null);
      }
    },

    // 2. Nhiệt kế điện tử
    thermometer: {
      group: 'tool',
      anchors: { root: [0, 0], grip: [0, -35], tip: [0, 0], top: [0, -50], surface: [0, -2] },
      draw(ctx, s, t) {
        const fever = s.fever || 0;
        // Thân nhựa trắng thuôn dài
        path(ctx, 'M -4 -50 L 4 -50 L 3 -10 L 1.5 0 L -1.5 0 L -3 -10 Z', '#ffffff', INK, 1.4);
        // Đầu cảm biến kim loại mạ bạc
        path(ctx, 'M -2 -8 L 2 -8 L 1.5 0 L -1.5 0 Z', '#94a3b8', INK, 1.0);
        // Màn hình LCD nhỏ
        const screenCol = fever > 0.3 ? '#f87171' : '#86efac';
        path(ctx, 'M -2.5 -35 L 2.5 -35 L 2.5 -25 L -2.5 -25 Z', screenCol, INK, 0.8);
        // Nút bấm xanh
        ellipse(ctx, 0, -42, 1.5, 1.5, '#0284c7', null);
      }
    },

    // 3. Ống tiêm cho trẻ (kim ngắn an toàn, không máu)
    syringe: {
      group: 'tool',
      anchors: { root: [0, 0], grip: [0, -25], needle: [0, 0], plunger: [0, -50], top: [0, -50], surface: [0, -2] },
      draw(ctx, s, t) {
        // Kim ngắn đầu tròn mạ bạc
        line(ctx, [[0, 0], [0, -10]], '#94a3b8', 1.4);
        // Thân ống tiêm nhựa trong
        path(ctx, 'M -6 -10 L 6 -10 L 6 -36 L -6 -36 Z', 'rgba(240, 249, 255, 0.85)', INK, 1.4);
        // Thuốc màu xanh ngọc bên trong
        const fill = s.fill != null ? s.fill : 0.8;
        if (fill > 0.05) {
          const medH = 24 * fill;
          path(ctx, `M -5 -11 L 5 -11 L 5 ${-11 - medH} L -5 ${-11 - medH} Z`, '#38bdf8', null);
        }
        // Vạch chia dung tích
        for (let y = -14; y >= -32; y -= 4.5) {
          line(ctx, [[-5, y], [-2, y]], '#0284c7', 1.0);
        }
        // Cần đẩy (piston)
        const pistonY = -11 - 24 * fill;
        line(ctx, [[0, pistonY], [0, -46]], '#cbd5e1', 2.8);
        line(ctx, [[-6, -46], [6, -46]], '#0284c7', 2.5);
      }
    },

    // 4. Viên thuốc (viên con nhộng 2 màu)
    pill: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -7], top: [0, -14], surface: [0, 0] },
      draw(ctx, s, t) {
        // Viên con nhộng nghiêng góc 30 độ
        ctx.save();
        ctx.rotate(0.35);
        // Nửa đỏ
        path(ctx, 'M -5 -14 Q 0 -19 5 -14 L 5 -7 L -5 -7 Z', '#ef4444', INK, 1.2);
        // Nửa vàng
        path(ctx, 'M -5 -7 L 5 -7 L 5 0 Q 0 5 -5 0 Z', '#facc15', INK, 1.2);
        // Vệt sáng bóng
        ellipse(ctx, -2, -10, 1.2, 5.0, 'rgba(255,255,255,0.7)', null);
        ctx.restore();
      }
    },

    // 5. Lọ thuốc nắp an toàn
    pill_bottle: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -18], top: [0, -36], surface: [0, 0] },
      draw(ctx, s, t) {
        // Thân lọ nhựa màu cam hổ phách
        path(ctx, 'M -10 0 L 10 0 L 9.5 -26 L -9.5 -26 Z', '#f97316', INK, 1.4);
        // Nhãn trắng không chữ
        path(ctx, 'M -9.5 -6 L 9.5 -6 L 9.5 -20 L -9.5 -20 Z', '#ffffff', null);
        line(ctx, [[-6, -11], [6, -11]], '#0284c7', 1.8);
        line(ctx, [[-4, -15], [4, -15]], '#94a3b8', 1.2);
        // Cổ lọ và nắp trắng khía
        taper(ctx, 0, -26, 0, -29, 6.5, 6.5, '#ffffff', INK, 1.2);
        taper(ctx, 0, -29, 0, -36, 8.5, 8.5, '#f1f5f9', INK, 1.4);
      }
    },

    // 6. Chai siro ho
    syrup_bottle: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -22], top: [0, -44], surface: [0, 0] },
      draw(ctx, s, t) {
        // Thân chai thuỷ tinh nâu sẫm
        path(ctx, 'M -11 0 L 11 0 L 10 -32 L -10 -32 Z', '#78350f', INK, 1.4);
        // Nhãn vàng pastel có hình quả cam nhỏ (không chữ)
        path(ctx, 'M -9 -8 L 9 -8 L 9 -24 L -9 -24 Z', '#fef08a', null);
        ellipse(ctx, 0, -16, 4.5, 4.5, '#f97316', null);
        ellipse(ctx, 1.5, -19, 1.5, 2.5, '#4ade80', null);
        // Nắp chai nhựa trắng
        taper(ctx, 0, -32, 0, -36, 5.0, 5.0, '#ffffff', INK, 1.2);
        taper(ctx, 0, -36, 0, -44, 7.0, 7.0, '#ffffff', INK, 1.4);
      }
    },

    // 7. Thìa đong thuốc
    spoon: {
      group: 'tool',
      anchors: { root: [0, 0], grip: [0, -15], tip: [0, 0], top: [0, -32], surface: [0, 0] },
      draw(ctx, s, t) {
        // Cán thìa nhựa trong viền xanh
        taper(ctx, 0, -8, 0, -32, 2.2, 1.8, '#e0f2fe', INK, 1.2);
        // Lòng thìa bầu dục đựng siro đỏ ngọt
        ellipse(ctx, 0, 0, 7.5, 9.5, '#f8fafc', INK, 1.4);
        ellipse(ctx, 0, 1, 5.5, 7.0, '#ef4444', null);
        ellipse(ctx, -2, -1, 1.5, 3.0, '#ffffff', null);
      }
    },

    // 8. Băng dán cá nhân (band_aid)
    band_aid: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -3], top: [0, -6], surface: [0, 0] },
      draw(ctx, s, t) {
        // Dải băng màu be bo góc tròn
        ellipse(ctx, 0, 0, 16, 5.5, '#fed7aa', INK, 1.2);
        // Miếng đệm bông giữa
        ellipse(ctx, 0, 0, 6, 4.5, '#fff7ed', INK, 1.0);
        // Các lỗ thoáng khí nhỏ
        for (const dx of [-10, -7, 7, 10]) {
          ellipse(ctx, dx, 0, 0.8, 0.8, '#ea580c', null);
        }
      }
    },

    // 9. Cuộn băng gạc y tế
    bandage_roll: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -8], top: [0, -16], surface: [0, 0] },
      draw(ctx, s, t) {
        // Khối cuộn tròn màu trắng ngà
        ellipse(ctx, 0, -8, 11, 11, '#f8fafc', INK, 1.4);
        ellipse(ctx, 0, -8, 8, 8, '#e2e8f0', INK, 1.0);
        ellipse(ctx, 0, -8, 4, 4, '#cbd5e1', null);
        // Dải băng bung ra mép
        path(ctx, 'M 8 -4 Q 14 -2 18 -6', null, '#ffffff', 3.0);
      }
    },

    // 10. Khẩu trang y tế (layer: over_face)
    face_mask: {
      group: 'prop',
      layer: 'over_face',
      anchors: { root: [0, 0], grip: [0, 0], top: [0, -12], surface: [0, 0] },
      draw(ctx, s, t) {
        // Khẩu trang xanh da trời 3 nếp gấp che kín mũi miệng
        path(ctx, 'M -15 -10 L 15 -10 L 13 4 L -13 4 Z', '#7dd3fc', INK, 1.4);
        // 3 nếp gấp ngang
        line(ctx, [[-13, -6], [13, -6]], '#38bdf8', 1.2);
        line(ctx, [[-13, -2], [13, -2]], '#38bdf8', 1.2);
        line(ctx, [[-12, 1], [12, 1]], '#38bdf8', 1.2);
        // Nẹp mũi kim loại phía trên
        line(ctx, [[-6, -10], [6, -10]], '#0284c7', 1.8);
        // Quai đeo thun vòng qua tai 2 bên
        path(ctx, 'M -15 -8 Q -20 -4 -13 2', null, '#ffffff', 1.4);
        path(ctx, 'M 15 -8 Q 20 -4 13 2', null, '#ffffff', 1.4);
      }
    },

    // 11. Bánh xà phòng
    soap: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -5], top: [0, -10], surface: [0, 0] },
      draw(ctx, s, t) {
        // Khối xà phòng bầu dục bo tròn màu hồng phấn
        ellipse(ctx, 0, -5, 12, 7, '#f472b6', INK, 1.4);
        ellipse(ctx, -1, -6, 9, 4.5, '#fbcfe8', null);
        // Bong bóng xà phòng nhỏ quanh bánh
        ellipse(ctx, 12, -9, 2.5, 2.5, 'rgba(255,255,255,0.7)', '#93c5fd', 0.8);
        ellipse(ctx, -11, -11, 2.0, 2.0, 'rgba(255,255,255,0.7)', '#93c5fd', 0.8);
      }
    },

    // 12. Chai gel cồn sát khuẩn có vòi xịt
    sanitizer: {
      group: 'tool',
      anchors: { root: [0, 0], grip: [0, -16], pump: [0, -38], top: [0, -40], surface: [0, 0] },
      draw(ctx, s, t) {
        // Thân chai trong suốt đựng cồn xanh ngọc
        path(ctx, 'M -9 0 L 9 0 L 8 -26 L -8 -26 Z', 'rgba(207, 250, 254, 0.85)', INK, 1.4);
        // Nhãn giọt nước sạch (không chữ)
        ellipse(ctx, 0, -13, 5, 5, '#ffffff', null);
        path(ctx, 'M 0 -17 C -3 -13 -3 -10 0 -9 C 3 -10 3 -13 0 -17 Z', '#06b6d4', null);
        // Vòi xịt bơm nhấn
        taper(ctx, 0, -26, 0, -32, 4, 4, '#ffffff', INK, 1.2);
        line(ctx, [[0, -32], [0, -38]], '#94a3b8', 2.0);
        path(ctx, 'M -3 -38 L 7 -38 L 8 -35 L 5 -35 L 5 -37 L -3 -37 Z', '#0284c7', INK, 1.2);
      }
    },

    // 13. Khăn bông mềm
    towel: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -15], top: [0, -30], surface: [0, 0] },
      draw(ctx, s, t) {
        // Khăn bông gấp nếp treo màu vàng nhạt
        path(ctx, 'M -8 -30 L 8 -30 L 10 0 L -10 0 Z', '#fef08a', INK, 1.4);
        // Sọc trang trí xanh dương
        line(ctx, [[-9, -6], [9, -6]], '#38bdf8', 1.8);
        line(ctx, [[-8.5, -10], [8.5, -10]], '#38bdf8', 1.8);
        // Nếp gấp khăn
        line(ctx, [[0, -28], [0, -2]], '#fde047', 1.2);
      }
    },

    // 14. Bàn chải đánh răng
    toothbrush: {
      group: 'tool',
      anchors: { root: [0, 0], grip: [0, -20], bristles: [0, 0], top: [0, -38], surface: [0, 0] },
      draw(ctx, s, t) {
        // Cán bàn chải uốn lượn màu hồng pastel
        taper(ctx, 0, -8, 0, -38, 2.5, 2.0, '#f472b6', INK, 1.4);
        // Đầu cắm lông bàn chải
        path(ctx, 'M -2 -8 L 2 -8 L 2 0 L -2 0 Z', '#ffffff', INK, 1.0);
        // Lông bàn chải trắng mịn
        path(ctx, 'M -2 0 L 2 0 L 2 6 L -2 6 Z', '#ffffff', INK, 1.0);
        // Vệt kem đánh răng xanh ngọc sọc trên lông
        ellipse(ctx, 0, 4, 1.8, 3.5, '#2dd4bf', null, 0.4);
      }
    },

    // 15. Tuýp kem đánh răng
    toothpaste: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -15], cap: [0, 0], top: [0, -32], surface: [0, 0] },
      draw(ctx, s, t) {
        // Thân tuýp dẹp đuôi, phồng cổ màu trắng sọc xanh
        path(ctx, 'M -8 -32 L 8 -32 L 6 -8 L -6 -8 Z', '#ffffff', INK, 1.4);
        // Dải sóng màu xanh tươi mát
        path(ctx, 'M -7 -24 Q 0 -20 7 -24 L 6.5 -16 Q 0 -12 -6.5 -16 Z', '#06b6d4', null);
        // Nắp tuýp nhựa xanh đậm
        taper(ctx, 0, -8, 0, 0, 4.0, 4.0, '#0284c7', INK, 1.2);
      }
    },

    // 16. Ly nước sạch
    water_glass: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -12], top: [0, -24], surface: [0, 0] },
      draw(ctx, s, t) {
        // Cốc thuỷ tinh trong suốt
        path(ctx, 'M -6 0 L 6 0 L 8 -24 L -8 -24 Z', 'rgba(255, 255, 255, 0.4)', INK, 1.4);
        // Mức nước xanh mát bên trong
        const fill = s.fill != null ? s.fill : 0.75;
        if (fill > 0.05) {
          const waterH = 20 * fill;
          path(ctx, `M -5.5 -1 L 5.5 -1 L ${6.5 * fill} ${-1 - waterH} L ${-6.5 * fill} ${-1 - waterH} Z`, 'rgba(56, 189, 248, 0.75)', null);
          ellipse(ctx, 0, -1 - waterH, 6.5 * fill, 1.5, '#7dd3fc', null);
        }
        // Vệt phản chiếu thành ly
        line(ctx, [[-5, -3], [-6.5, -20]], '#ffffff', 1.2);
      }
    },

    // 17. Hộp cứu thương y tế (dấu cộng xanh lá, KHÔNG DÙNG CHỮ THẬP ĐỎ!)
    first_aid_kit: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -18], top: [0, -24], surface: [0, 0] },
      draw(ctx, s, t) {
        // Hộp nhựa trắng cứng bo góc
        path(ctx, 'M -14 0 L 14 0 L 14 -18 L -14 -18 Z', '#ffffff', INK, 1.6);
        // Quai xách trên nắp
        path(ctx, 'M -5 -18 L -5 -24 L 5 -24 L 5 -18', null, '#475569', 2.0);
        // Khung tròn chứa DẤU CỘNG XANH LÁ Y TẾ AN TOÀN
        ellipse(ctx, 0, -9, 6.5, 6.5, '#ecfdf5', '#10b981', 1.0);
        line(ctx, [[0, -13], [0, -5]], '#10b981', 2.2);
        line(ctx, [[-4, -9], [4, -9]], '#10b981', 2.2);
      }
    },

    // 18. Túi chườm đá gel mát
    ice_pack: {
      group: 'prop',
      anchors: { root: [0, 0], grip: [0, -10], top: [0, -20], surface: [0, 0] },
      draw(ctx, s, t) {
        // Túi vải chống thấm màu xanh ngọc có nếp gấp
        ellipse(ctx, 0, -10, 14, 10, '#38bdf8', INK, 1.4);
        ellipse(ctx, 0, -10, 11, 7.5, '#7dd3fc', null);
        // Nắp xoáy nhựa trắng trên đỉnh
        taper(ctx, 0, -18, 0, -23, 4.5, 4.5, '#ffffff', INK, 1.2);
        // Hạt tuyết / hoa băng tượng trưng mát lạnh
        line(ctx, [[0, -13], [0, -7]], '#ffffff', 1.4);
        line(ctx, [[-3, -10], [3, -10]], '#ffffff', 1.4);
      }
    },

    // 19. Giường bệnh viện
    hospital_bed: {
      group: 'prop',
      anchors: { root: [0, 0], mattress: [0, -32], head: [-38, -48], foot: [38, -32], top: [0, -55], surface: [0, 0] },
      draw(ctx, s, t) {
        // Chân giường và bánh xe khoá
        for (const bx of [-36, -30, 30, 36]) {
          line(ctx, [[bx, 0], [bx, -28]], '#94a3b8', 2.5);
          ellipse(ctx, bx, -2, 2.5, 2.5, '#475569', null);
        }
        // Khung giường kim loại xanh nhạt
        path(ctx, 'M -44 -28 L 44 -28 L 44 -32 L -44 -32 Z', '#cbd5e1', INK, 1.4);
        // Đệm êm bọc ga trắng
        path(ctx, 'M -42 -32 L 42 -32 L 42 -40 L -42 -40 Z', '#f8fafc', INK, 1.4);
        // Gối nằm ở đầu giường
        ellipse(ctx, -32, -43, 9, 5, '#e2e8f0', INK, 1.2);
        // Thanh chắn an toàn gập
        for (let gx = -22; gx <= 22; gx += 8) {
          line(ctx, [[gx, -32], [gx, -46]], '#94a3b8', 1.6);
        }
        line(ctx, [[-24, -46], [24, -46]], '#94a3b8', 2.0);
        // Thành đầu giường cao
        path(ctx, 'M -44 -28 L -44 -56 L -40 -56 L -40 -28 Z', '#64748b', INK, 1.4);
      }
    },

    // 20. Xe lăn y tế
    wheelchair: {
      group: 'prop',
      anchors: { root: [0, 0], seat: [0, -28], backrest: [-14, -44], grip: [-18, -48], top: [0, -52], surface: [0, 0] },
      draw(ctx, s, t) {
        // Bánh xe lớn nan hoa tròn phía sau
        ellipse(ctx, -10, -20, 19, 19, '#f8fafc', INK, 1.8);
        ellipse(ctx, -10, -20, 16, 16, null, '#94a3b8', 1.0);
        for (let a = 0; a < 8; a++) {
          const ang = a * Math.PI / 4;
          line(ctx, [[-10, -20], [-10 + Math.cos(ang) * 16, -20 + Math.sin(ang) * 16]], '#cbd5e1', 1.0);
        }
        ellipse(ctx, -10, -20, 3.5, 3.5, '#475569', null);

        // Bánh xe nhỏ phía trước
        ellipse(ctx, 16, -5, 5, 5, '#94a3b8', INK, 1.2);

        // Khung ghế ngồi màu xanh than
        path(ctx, 'M -16 -28 L 14 -28 L 12 -33 L -16 -33 Z', '#1e3a8a', INK, 1.4);
        // Tựa lưng
        path(ctx, 'M -16 -28 L -16 -48 L -13 -48 L -13 -28 Z', '#1e3a8a', INK, 1.4);
        // Tay cầm đẩy cho người nhà/y tá
        line(ctx, [[-16, -48], [-22, -48]], '#0f172a', 3.0);
        // Bàn để chân phía trước
        path(ctx, 'M 14 -28 L 16 -12 L 20 -12', null, '#475569', 2.0);
      }
    },

    // 21. Cặp nạng chống nách
    crutches: {
      group: 'tool',
      anchors: { root: [0, 0], grip: [0, -32], armpit: [0, -58], top: [0, -60], surface: [0, 0] },
      draw(ctx, s, t) {
        // Hai thanh nạng gỗ/nhôm bo hẹp dần xuống chân
        line(ctx, [[-7, -56], [0, 0]], '#94a3b8', 2.0);
        line(ctx, [[7, -56], [0, 0]], '#94a3b8', 2.0);
        // Đệm tì nách bọc mút mềm
        ellipse(ctx, 0, -58, 10, 3.0, '#334155', INK, 1.4);
        // Tay nắm ngang ở giữa
        line(ctx, [[-5, -32], [5, -32]], '#0f172a', 3.2);
        // Đế cao su chống trượt ở đáy
        ellipse(ctx, 0, -1, 3.0, 2.0, '#0f172a', null);
      }
    },

    // 22. Cân sức khoẻ điện tử
    scale: {
      group: 'prop',
      anchors: { root: [0, 0], display: [0, -2], top: [0, -5], surface: [0, 0] },
      draw(ctx, s, t) {
        // Mặt kính vuông màu bạc bo 4 góc
        ellipse(ctx, 0, -2.5, 22, 5.0, '#f1f5f9', INK, 1.4);
        ellipse(ctx, 0, -3, 19, 3.8, '#e2e8f0', null);
        // Màn hình LED kỹ thuật số nhỏ
        ellipse(ctx, 0, -4.5, 6, 1.6, '#0f172a', null);
        line(ctx, [[-3, -4.5], [3, -4.5]], '#22c55e', 1.0);
      }
    },

    // 23. Thước đo chiều cao hươu cao cổ
    height_chart: {
      group: 'prop',
      anchors: { root: [0, 0], marker: [0, -50], top: [0, -95], surface: [0, 0] },
      draw(ctx, s, t) {
        // Thân thước dán tường màu vàng ấm
        path(ctx, 'M -8 0 L 8 0 L 8 -90 L -8 -90 Z', '#fef08a', INK, 1.4);
        // Đầu chú hươu cao cổ ngộ nghĩnh trên đỉnh
        ellipse(ctx, 0, -92, 10, 8, '#f59e0b', INK, 1.4);
        ellipse(ctx, -5, -98, 2.0, 4.0, '#b45309', null);
        ellipse(ctx, 5, -98, 2.0, 4.0, '#b45309', null);
        ellipse(ctx, -3, -93, 1.5, 1.5, '#0f172a', null);
        ellipse(ctx, 3, -93, 1.5, 1.5, '#0f172a', null);
        // Các vạch đo chiều cao không số
        for (let y = -10; y >= -85; y -= 6) {
          line(ctx, [[-7, y], [-2, y]], '#b45309', 1.4);
          line(ctx, [[-7, y + 3], [-4, y + 3]], '#d97706', 0.8);
        }
      }
    },

    // 24. Khay ăn dinh dưỡng 5 ngăn
    lunch_tray: {
      group: 'prop',
      anchors: { root: [0, 0], food_rice: [-12, -4], food_fish: [0, -4], food_veg: [12, -4], top: [0, -8], surface: [0, 0] },
      draw(ctx, s, t) {
        // Khay inox hình chữ nhật 5 ô chia
        ellipse(ctx, 0, -4, 26, 8, '#f8fafc', INK, 1.6);
        // Ngăn cơm trắng thơm dẻo
        ellipse(ctx, -14, -4, 7, 4.5, '#ffffff', INK, 1.0);
        ellipse(ctx, -14, -5, 5, 2.5, '#f1f5f9', null);
        // Ngăn cá rim màu vàng cánh gián
        ellipse(ctx, 0, -5, 6, 3.5, '#b45309', INK, 1.0);
        ellipse(ctx, -1, -5, 4, 1.5, '#f59e0b', null);
        // Ngăn rau xanh mướt luộc
        ellipse(ctx, 13, -5, 6, 3.5, '#22c55e', INK, 1.0);
        ellipse(ctx, 12, -6, 2, 2, '#16a34a', null);
        ellipse(ctx, 15, -4, 2, 2, '#15803d', null);
        // Bát canh nhỏ và quả táo tráng miệng
        ellipse(ctx, -6, -1, 4, 2.5, '#fdba74', INK, 0.8);
        ellipse(ctx, 6, -1, 3.5, 3.0, '#ef4444', INK, 0.8);
      }
    },

    // =======================================================================
    // 2. 4 RIG VI SINH & CƠ QUAN BẢN ĐẦU (§9.3)
    // =======================================================================

    // 25. Lợi khuẩn đường ruột (good_bacteria)
    good_bacteria: {
      group: 'cell',
      anchors: { root: [0, 0], face: [0, -14], mouth: [0, -11], top: [0, -28], surface: [0, -1] },
      draw(ctx, s, t) {
        // Thân que màu vàng tươi bo tròn 2 đầu
        taper(ctx, 0, -6, 0, -20, 7.5, 7.5, '#facc15', INK, 1.4);
        ellipse(ctx, 0, -6, 7.5, 5.0, '#facc15', INK, 1.4);
        ellipse(ctx, 0, -20, 7.5, 5.0, '#facc15', INK, 1.4);
        // Mũ lưỡi trai xanh thể thao trên đầu
        path(ctx, 'M -8 -22 Q 0 -27 8 -22 L 12 -21 L 8 -20 Z', '#38bdf8', INK, 1.2);
        // Mắt/miệng do face() của engine vẽ (catalog face: true), không tự vẽ thêm.
      }
    },

    // 26. Trực khuẩn que (bacteria_rod)
    bacteria_rod: {
      group: 'microbe',
      anchors: { root: [0, 0], face: [0, -16], mouth: [0, -12], top: [0, -32], surface: [0, -1] },
      draw(ctx, s, t) {
        // Thân que dài màu xanh lá cây
        taper(ctx, 0, -7, 0, -24, 7.0, 7.0, '#4ade80', INK, 1.4);
        ellipse(ctx, 0, -7, 7.0, 4.5, '#4ade80', INK, 1.4);
        ellipse(ctx, 0, -24, 7.0, 4.5, '#4ade80', INK, 1.4);
        // Roi quẫy nhẹ phía sau theo nhịp t
        const whip = Math.sin(t * 12) * 5;
        path(ctx, `M -4 -25 Q -10 ${-32 + whip} -14 ${-28 - whip}`, null, '#22c55e', 1.8);
        path(ctx, `M 4 -25 Q 10 ${-32 - whip} 14 ${-28 + whip}`, null, '#22c55e', 1.8);
        // Mắt/miệng do face() của engine vẽ (catalog face: true), không tự vẽ thêm.
      }
    },

    // 27. Virus gai núm hoạt hình (virus_spike)
    virus_spike: {
      group: 'microbe',
      anchors: { root: [0, 0], face: [0, -16], mouth: [0, -12], top: [0, -32], surface: [0, -1] },
      draw(ctx, s, t) {
        // Khối cầu tròn màu tím
        const cy = -16;
        ellipse(ctx, 0, cy, 11, 11, '#a855f7', INK, 1.6);
        // Các gai núm tròn cam/vàng hoạt hình xòe đều xung quanh
        for (let i = 0; i < 8; i++) {
          const ang = i * Math.PI / 4 + t * 1.5;
          const sx = Math.cos(ang) * 11, sy = cy + Math.sin(ang) * 11;
          const ex = Math.cos(ang) * 16, ey = cy + Math.sin(ang) * 16;
          line(ctx, [[sx, sy], [ex, ey]], '#7e22ce', 2.0);
          ellipse(ctx, ex, ey, 2.5, 2.5, '#fb923c', INK, 1.0);
        }
        // Mắt/miệng do face() của engine vẽ (catalog face: true), không tự vẽ thêm.
      }
    },

    // 28. Chiếc răng Chibi (tooth_chibi)
    tooth_chibi: {
      group: 'organ',
      anchors: { root: [0, 0], face: [0, -18], mouth: [0, -14], top: [0, -34], surface: [0, -2] },
      draw(ctx, s, t) {
        const cavity = s.cavity || 0;
        const sparkle = s.sparkle || 0;
        // Chiếc răng hàm 2 chân màu trắng muốt
        path(ctx, 'M -12 -30 C -15 -18 -8 -2 -7 0 C -4 -2 -3 -8 0 -8 C 3 -8 4 -2 7 0 C 8 -2 15 -18 12 -30 C 8 -34 4 -32 0 -30 C -4 -32 -8 -34 -12 -30 Z', '#ffffff', INK, 1.6);

        // Vết sâu răng đen (nếu có cavity > 0)
        if (cavity > 0.05) {
          const cavR = 4.5 * cavity;
          ellipse(ctx, 6, -26, cavR, cavR * 0.8, '#451a03', INK, 1.0);
          line(ctx, [[6 - cavR, -26], [6 + cavR, -26]], '#1c1917', 1.0);
        }

        // Mắt/miệng do face() của engine vẽ (catalog face: true), không tự vẽ thêm.

        // Miệng/biểu cảm (buồn khi sâu răng) đặt qua expression của face().

        // Tia lấp lánh (sparkle) khi đánh răng sạch
        if (sparkle > 0.1 || s.clean) {
          const spY = -28 + Math.sin(t * 8) * 2;
          line(ctx, [[-10, spY - 4], [-10, spY + 4]], '#38bdf8', 1.4);
          line(ctx, [[-14, spY], [-6, spY]], '#38bdf8', 1.4);
          line(ctx, [[10, spY - 3], [10, spY + 3]], '#facc15', 1.4);
          line(ctx, [[7, spY], [13, spY]], '#facc15', 1.4);
        }
      }
    },
  };

  // =========================================================================
  // 3. 10 HÌNH NỀN MỚI (§11) CHUẨN ground_y: 810 (NGÀY & ĐÊM, KHÔNG CHỮ)
  // =========================================================================

  const MEDICAL_BACKGROUNDS = {
    // 1. Phòng khách (living_room)
    living_room: {
      label: 'Phòng khách ấm cúng',
      theme: 'home',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        // Tường phòng khách màu kem vàng / ấm áp
        ctx.fillStyle = isNight ? '#1e1c24' : '#faf5ee';
        ctx.fillRect(0, 0, 576, 810);

        // Khung cửa sổ nhìn ra trời
        ctx.fillStyle = isNight ? '#0b1626' : '#bfdbfe';
        ctx.fillRect(80, 220, 160, 240);
        if (isNight) {
          ellipse(ctx, 190, 280, 14, 14, '#fef08a', null);
          ellipse(ctx, 185, 276, 12, 12, '#0b1626', null);
        } else {
          ellipse(ctx, 160, 300, 28, 12, 'rgba(255,255,255,0.8)', null);
        }
        // Khung gỗ cửa sổ
        line(ctx, [[80, 220], [240, 220], [240, 460], [80, 460], [80, 220]], '#78350f', 3.0);
        line(ctx, [[160, 220], [160, 460]], '#78350f', 2.0);
        line(ctx, [[80, 340], [240, 340]], '#78350f', 2.0);

        // Bức tranh đồi núi thiên nhiên không chữ
        path(ctx, 'M 360 260 L 500 260 L 500 380 L 360 380 Z', isNight ? '#162842' : '#f0fdf4', INK, 2.0);
        path(ctx, 'M 360 380 Q 410 330 440 350 Q 470 340 500 380 Z', '#86efac', null);
        ellipse(ctx, 460, 300, 10, 10, '#fde047', null);

        // Ghế sofa êm ái màu xanh ngọc
        const sofaCol = isNight ? '#134e4a' : '#2dd4bf';
        path(ctx, 'M 40 680 L 320 680 L 320 810 L 40 810 Z', sofaCol, INK, 2.2);
        // Tựa lưng sofa
        path(ctx, 'M 30 580 Q 180 570 330 580 L 330 680 L 30 680 Z', tone(sofaCol, -0.1), INK, 2.2);
        // Gối tựa vàng
        ellipse(ctx, 80, 660, 22, 16, '#facc15', INK, 1.4, -0.2);
        ellipse(ctx, 280, 660, 22, 16, '#facc15', INK, 1.4, 0.2);

        // Bàn trà gỗ nhỏ
        path(ctx, 'M 360 740 L 530 740 L 520 760 L 370 760 Z', '#b45309', INK, 1.8);
        line(ctx, [[380, 760], [375, 810]], '#92400e', 3.0);
        line(ctx, [[510, 760], [515, 810]], '#92400e', 3.0);
        // Chậu hoa nhỏ trên bàn
        ellipse(ctx, 445, 735, 12, 5, '#f43f5e', null);
        ellipse(ctx, 445, 738, 7, 5, '#cbd5e1', INK, 1.2);

        // Đèn cây góc phòng toả ánh sáng vàng ấm
        line(ctx, [[530, 520], [530, 810]], '#64748b', 3.0);
        ellipse(ctx, 530, 810, 18, 4, '#475569', null);
        drawPoly(ctx, [[510, 520], [550, 520], [540, 480], [520, 480]], isNight ? '#fbbf24' : '#fef08a', INK, 1.4);
        if (isNight) {
          ctx.save();
          const halo = ctx.createRadialGradient(530, 500, 5, 530, 500, 110);
          halo.addColorStop(0, 'rgba(253, 224, 71, 0.6)');
          halo.addColorStop(1, 'rgba(253, 224, 71, 0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(530, 500, 110, 0, TAU);
          ctx.fill();
          ctx.restore();
        }

        // Mặt sàn gỗ phòng khách (ground_y: 810)
        ctx.fillStyle = isNight ? '#1c130d' : '#854d0e';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], INK, 2.4);
        for (let y = 850; y < 1024; y += 45) {
          line(ctx, [[0, y], [576, y]], isNight ? '#0f0a07' : '#713f12', 1.0);
        }
      }
    },

    // 2. Phòng tắm & bồn rửa tay (bathroom_sink)
    bathroom_sink: {
      label: 'Phòng tắm bồn rửa tay',
      theme: 'home',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        // Tường gạch men xanh ngọc / trắng mát dịu
        ctx.fillStyle = isNight ? '#0f292f' : '#e0f2fe';
        ctx.fillRect(0, 0, 576, 810);
        // Lưới đường ron gạch men
        ctx.strokeStyle = isNight ? 'rgba(255,255,255,0.06)' : 'rgba(14, 165, 233, 0.15)';
        ctx.lineWidth = 1.0;
        for (let x = 0; x < 576; x += 48) line(ctx, [[x, 0], [x, 810]], ctx.strokeStyle, 1.0);
        for (let y = 0; y < 810; y += 48) line(ctx, [[0, y], [576, y]], ctx.strokeStyle, 1.0);

        // Gương soi hình vòm lớn ở giữa
        const mirrorGrad = ctx.createLinearGradient(180, 240, 396, 560);
        mirrorGrad.addColorStop(0, isNight ? '#1e293b' : '#f0f9ff');
        mirrorGrad.addColorStop(1, isNight ? '#0f172a' : '#bae6fd');
        ctx.save();
        path(ctx, 'M 180 540 L 180 340 Q 288 200 396 340 L 396 540 Z', mirrorGrad, '#94a3b8', 3.5);
        // Vệt sáng chéo trên mặt gương
        line(ctx, [[210, 510], [330, 280]], 'rgba(255,255,255,0.6)', 3.0);
        line(ctx, [[230, 520], [360, 290]], 'rgba(255,255,255,0.4)', 2.0);
        ctx.restore();

        // Bồn rửa tay sứ trắng chân trụ
        taper(ctx, 288, 670, 288, 810, 24, 28, isNight ? '#cbd5e1' : '#f8fafc', INK, 2.0);
        // Chậu rửa sứ
        ellipse(ctx, 288, 660, 110, 32, isNight ? '#e2e8f0' : '#ffffff', INK, 2.4);
        ellipse(ctx, 288, 662, 88, 22, isNight ? '#94a3b8' : '#e0f2fe', INK, 1.4);
        // Vòi nước inox bóng loáng
        path(ctx, 'M 288 640 L 288 590 Q 288 570 274 576 L 270 584', null, '#64748b', 4.5);
        // Tay gạt vòi
        line(ctx, [[282, 595], [294, 595]], '#94a3b8', 3.0);

        // Khay đựng xà phòng và chai nước rửa tay bên cạnh
        ellipse(ctx, 210, 655, 18, 8, '#fbcfe8', INK, 1.2);
        taper(ctx, 360, 660, 360, 635, 8, 8, '#38bdf8', INK, 1.2);

        // Thanh treo khăn bông bên trái
        line(ctx, [[40, 480], [120, 480]], '#94a3b8', 3.0);
        path(ctx, 'M 50 480 L 110 480 L 115 620 L 45 620 Z', '#fef08a', INK, 1.6);
        line(ctx, [[50, 590], [110, 590]], '#38bdf8', 2.0);

        // Đèn trần phòng tắm
        if (isNight) {
          ellipse(ctx, 288, 40, 22, 10, '#fef08a', null);
        }

        // Sàn gạch mosaic chống trượt (ground_y: 810)
        ctx.fillStyle = isNight ? '#0b1c24' : '#0284c7';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], INK, 2.4);
        for (let x = 0; x < 576; x += 32) line(ctx, [[x, 810], [x, 1024]], 'rgba(255,255,255,0.15)', 1.0);
      }
    },

    // 3. Lớp học thân thiện (classroom)
    classroom: {
      label: 'Lớp học mầm non & tiểu học',
      theme: 'school',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        ctx.fillStyle = isNight ? '#1e2028' : '#fffbeb';
        ctx.fillRect(0, 0, 576, 810);

        // Cửa sổ nhìn ra trời và cây xanh phía trái
        ctx.fillStyle = isNight ? '#0b1626' : '#bae6fd';
        ctx.fillRect(40, 220, 110, 220);
        ellipse(ctx, 90, 410, 40, 30, '#4ade80', null);
        line(ctx, [[40, 220], [150, 220], [150, 440], [40, 440], [40, 220]], '#b45309', 2.5);
        line(ctx, [[95, 220], [95, 440]], '#b45309', 1.8);

        // Bảng phấn xanh lớn ở trung tâm (HÌNH MINH HOẠ KHÔNG CHỮ)
        const boardY = 220;
        path(ctx, `M 180 ${boardY} L 530 ${boardY} L 530 ${boardY + 240} L 180 ${boardY + 240} Z`, '#15803d', '#92400e', 5.0);
        // Khay để phấn dưới bảng
        path(ctx, `M 175 ${boardY + 240} L 535 ${boardY + 240} L 535 ${boardY + 252} L 175 ${boardY + 252} Z`, '#b45309', INK, 1.4);

        // Vẽ phấn trắng trên bảng: hình cây xanh, tam giác, phép tính biểu tượng
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 2.0;
        // Hình cây nhỏ
        line(ctx, [[240, boardY + 120], [240, boardY + 180]], ctx.strokeStyle, 2.5);
        path(ctx, `M 220 ${boardY + 120} L 260 ${boardY + 120} L 240 ${boardY + 80} Z`, null, ctx.strokeStyle, 2.0);
        path(ctx, `M 225 ${boardY + 80} L 255 ${boardY + 80} L 240 ${boardY + 50} Z`, null, ctx.strokeStyle, 2.0);
        // Hình tam giác và hình tròn
        drawPoly(ctx, [[320, boardY + 100], [360, boardY + 100], [340, boardY + 60]], null, ctx.strokeStyle, 2.0);
        ellipse(ctx, 420, boardY + 80, 18, 18, null, ctx.strokeStyle, 2.0);
        // Dấu cộng lớn và trái tim
        line(ctx, [[470, boardY + 80], [490, boardY + 80]], ctx.strokeStyle, 2.2);
        line(ctx, [[480, boardY + 70], [480, boardY + 90]], ctx.strokeStyle, 2.2);
        ctx.restore();

        // Bàn ghế học sinh gỗ phía trước
        path(ctx, 'M 140 730 L 460 730 L 450 755 L 150 755 Z', '#d97706', INK, 2.0);
        line(ctx, [[170, 755], [160, 810]], '#b45309', 3.5);
        line(ctx, [[430, 755], [440, 810]], '#b45309', 3.5);

        // Mặt sàn lớp học (ground_y: 810)
        ctx.fillStyle = isNight ? '#18181b' : '#78350f';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], INK, 2.4);
      }
    },

    // 4. Sân trường xanh mát (school_yard)
    school_yard: {
      label: 'Sân trường và cây xanh',
      theme: 'school',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        // Bầu trời
        const skyTop = isNight ? '#0b1626' : '#7dd3fc';
        const skyBot = isNight ? '#162842' : '#e0f2fe';
        const grad = ctx.createLinearGradient(0, 0, 0, 810);
        grad.addColorStop(0, skyTop); grad.addColorStop(1, skyBot);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 576, 810);

        // Dãy phòng học xa xa với mái ngói đỏ
        path(ctx, 'M 60 520 L 520 520 L 520 810 L 60 810 Z', isNight ? '#1e293b' : '#fef08a', INK, 2.0);
        path(ctx, 'M 40 520 L 290 440 L 540 520 Z', isNight ? '#450a0a' : '#ef4444', INK, 2.2);

        // Cây phượng vĩ lớn góc phải (tán rộng hoa đỏ mùa hè)
        taper(ctx, 480, 810, 480, 420, 16, 12, '#78350f', INK, 2.2);
        ellipse(ctx, 470, 360, 90, 65, isNight ? '#14532d' : '#22c55e', null);
        ellipse(ctx, 440, 340, 30, 20, isNight ? '#7f1d1d' : '#f43f5e', null);
        ellipse(ctx, 510, 350, 28, 18, isNight ? '#7f1d1d' : '#f43f5e', null);
        ellipse(ctx, 480, 320, 26, 16, isNight ? '#7f1d1d' : '#f43f5e', null);

        // Cột cờ sân trường (TUYỆT ĐỐI KHÔNG CÓ CỜ QUỐC GIA)
        line(ctx, [[160, 810], [160, 340]], '#94a3b8', 3.0);
        taper(ctx, 160, 810, 160, 790, 24, 18, '#cbd5e1', INK, 1.6);
        ellipse(ctx, 160, 338, 4, 4, '#f59e0b', null);
        // Dải ruy băng gió ngũ sắc đung đưa (không cờ quốc gia)
        const ribbonWave = Math.sin(t * 4) * 6;
        path(ctx, `M 160 350 Q 185 ${355 + ribbonWave} 210 ${350 - ribbonWave}`, null, '#38bdf8', 3.0);

        // Sân gạch bê tông trường học (ground_y: 810)
        ctx.fillStyle = isNight ? '#1f2937' : '#9ca3af';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], INK, 2.4);
      }
    },

    // 5. Sân chơi thiếu nhi (playground)
    playground: {
      label: 'Sân chơi thiếu nhi vui nhộn',
      theme: 'school',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        // Bầu trời
        ctx.fillStyle = isNight ? '#0b1626' : '#bae6fd';
        ctx.fillRect(0, 0, 576, 810);

        // Đồi cỏ xa chân trời
        path(ctx, 'M 0 620 Q 160 560 320 600 Q 460 630 576 580 L 576 810 L 0 810 Z', isNight ? '#064e3b' : '#86efac', null);

        // Cầu trượt xoắn sắc màu phía trái
        // Thang leo
        line(ctx, [[80, 810], [80, 540]], '#e11d48', 3.5);
        line(ctx, [[120, 810], [120, 540]], '#e11d48', 3.5);
        for (let y = 780; y > 540; y -= 35) line(ctx, [[80, y], [120, y]], '#facc15', 2.0);
        // Chòi nghỉ nhỏ có mái nhọn
        path(ctx, 'M 70 540 L 130 540 L 100 480 Z', '#3b82f6', INK, 2.0);
        // Máng trượt cong màu vàng uốn xuống đất
        path(ctx, 'M 120 560 Q 220 580 240 810', null, '#facc15', 14);
        path(ctx, 'M 120 560 Q 220 580 240 810', null, INK, 1.4);

        // Khung xích đu đung đưa phía phải
        line(ctx, [[350, 810], [420, 560]], '#0284c7', 3.5);
        line(ctx, [[490, 810], [420, 560]], '#0284c7', 3.5);
        line(ctx, [[380, 560], [460, 560]], '#0284c7', 3.5);
        // Dây xích đu và ghế ngồi đung đưa nhẹ theo t
        const swing = Math.sin(t * 3.5) * 16;
        line(ctx, [[400, 560], [400 + swing, 750]], '#64748b', 1.8);
        line(ctx, [[440, 560], [440 + swing, 750]], '#64748b', 1.8);
        ellipse(ctx, 420 + swing, 755, 24, 5, '#ef4444', INK, 1.4);

        // Bãi cỏ sân chơi (ground_y: 810)
        ctx.fillStyle = isNight ? '#064e3b' : '#22c55e';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], INK, 2.4);
      }
    },

    // 6. Phòng khám bệnh bác sĩ (clinic_room)
    clinic_room: {
      label: 'Phòng khám bệnh bác sĩ',
      theme: 'clinic',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        // Tường phòng khám màu xanh bạc hà nhạt tinh tươm
        ctx.fillStyle = isNight ? '#0f2324' : '#f0fdf4';
        ctx.fillRect(0, 0, 576, 810);

        // Tủ thuốc kính góc trái có DẤU CỘNG XANH LÁ
        path(ctx, 'M 40 320 L 140 320 L 140 760 L 40 760 Z', '#ffffff', INK, 2.0);
        // Dấu cộng xanh y tế trên tủ
        line(ctx, [[90, 360], [90, 400]], '#10b981', 4.0);
        line(ctx, [[70, 380], [110, 380]], '#10b981', 4.0);
        // Ngăn kính
        line(ctx, [[40, 480], [140, 480]], '#94a3b8', 1.4);
        line(ctx, [[40, 600], [140, 600]], '#94a3b8', 1.4);

        // Bảng đo thị lực hình chữ E / vòng hở Landolt (không chữ cái latin)
        path(ctx, 'M 200 260 L 280 260 L 280 440 L 200 440 Z', '#ffffff', INK, 1.8);
        for (let ey = 290; ey <= 410; ey += 28) {
          const sz = (430 - ey) * 0.16;
          // Hình chữ E hướng ngẫu nhiên
          path(ctx, `M ${240 + sz} ${ey - sz} L ${240 - sz} ${ey - sz} L ${240 - sz} ${ey + sz} L ${240 + sz} ${ey + sz}`, null, '#0f172a', 2.0);
          line(ctx, [[240 - sz, ey], [240, ey]], '#0f172a', 2.0);
        }

        // Bàn khám bệnh gỗ sáng góc phải
        path(ctx, 'M 320 680 L 530 680 L 520 810 L 330 810 Z', '#f8fafc', INK, 2.0);
        line(ctx, [[320, 710], [530, 710]], '#cbd5e1', 1.4);
        // Ống đựng nhiệt kế và đèn khám trên bàn
        taper(ctx, 480, 680, 480, 650, 6, 6, '#cbd5e1', INK, 1.2);

        // Sàn gạch vinyl y tế sáng (ground_y: 810)
        ctx.fillStyle = isNight ? '#13211f' : '#ccfbf1';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], INK, 2.4);
      }
    },

    // 7. Phòng bệnh viện nội trú (hospital_ward)
    hospital_ward: {
      label: 'Phòng bệnh nội trú',
      theme: 'clinic',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        ctx.fillStyle = isNight ? '#111827' : '#f8fafc';
        ctx.fillRect(0, 0, 576, 810);

        // Cửa sổ kính rộng nhìn ra ngoài
        ctx.fillStyle = isNight ? '#0b1626' : '#bfdbfe';
        ctx.fillRect(340, 200, 190, 260);
        line(ctx, [[340, 200], [530, 200], [530, 460], [340, 460], [340, 200]], '#94a3b8', 2.5);
        line(ctx, [[435, 200], [435, 460]], '#94a3b8', 1.8);

        // Rèm ngăn giường màu xanh ngọc nhạt xếp nếp
        path(ctx, 'M 80 180 L 160 180 L 160 810 L 80 810 Z', isNight ? '#134e4a' : '#ccfbf1', INK, 1.8);
        for (let ry = 80; ry <= 160; ry += 16) {
          line(ctx, [[ry, 180], [ry, 810]], '#99f6e4', 1.2);
        }

        // Cọc truyền dịch inox cạnh giường
        line(ctx, [[280, 810], [280, 380]], '#94a3b8', 3.0);
        path(ctx, 'M 268 400 Q 280 370 292 400', null, '#94a3b8', 2.0);
        // Bình truyền dịch trong suốt
        taper(ctx, 280, 450, 280, 410, 8, 8, 'rgba(240,249,255,0.85)', INK, 1.2);

        // Sàn phòng bệnh (ground_y: 810)
        ctx.fillStyle = isNight ? '#1f2937' : '#e2e8f0';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], INK, 2.4);
      }
    },

    // 8. Nhà thuốc (pharmacy)
    pharmacy: {
      label: 'Nhà thuốc y tế',
      theme: 'clinic',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        ctx.fillStyle = isNight ? '#1c2024' : '#f0fdf4';
        ctx.fillRect(0, 0, 576, 810);

        // Kệ thuốc nhiều tầng chứa các hộp thuốc màu sắc phong phú (KHÔNG CHỮ)
        for (let ky = 220; ky <= 620; ky += 80) {
          path(ctx, `M 60 ${ky} L 516 ${ky} L 516 ${ky + 14} L 60 ${ky + 14} Z`, '#e2e8f0', INK, 1.4);
          // Các hộp thuốc trên kệ
          const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
          for (let hx = 80; hx <= 480; hx += 36) {
            const hCol = colors[(hx + ky) % colors.length];
            path(ctx, `M ${hx} ${ky} L ${hx + 24} ${ky} L ${hx + 24} ${ky - 35} L ${hx} ${ky - 35} Z`, hCol, INK, 1.0);
            line(ctx, [[hx + 4, ky - 18], [hx + 20, ky - 18]], '#ffffff', 1.4);
          }
        }

        // Quầy kính dược sĩ phía trước
        path(ctx, 'M 100 690 L 476 690 L 476 810 L 100 810 Z', isNight ? '#1e293b' : '#ffffff', INK, 2.2);
        ellipse(ctx, 288, 750, 24, 24, '#ecfdf5', '#10b981', 1.8);
        line(ctx, [[288, 735], [288, 765]], '#10b981', 3.0);
        line(ctx, [[273, 750], [303, 750]], '#10b981', 3.0);

        // Sàn nhà thuốc (ground_y: 810)
        ctx.fillStyle = isNight ? '#0f172a' : '#dcfce7';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], INK, 2.4);
      }
    },

    // 9. Phòng khám nha khoa (dentist_room)
    dentist_room: {
      label: 'Phòng khám nha khoa',
      theme: 'clinic',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        ctx.fillStyle = isNight ? '#0b1d28' : '#ecfeff';
        ctx.fillRect(0, 0, 576, 810);

        // Bức tranh hàm răng hoạt hình cười tươi không chữ
        path(ctx, 'M 200 240 L 376 240 L 376 380 L 200 380 Z', '#ffffff', '#0284c7', 3.0);
        // Chiếc răng cười to trên tranh
        path(ctx, 'M 276 280 C 270 295 275 320 280 340 C 285 320 290 320 296 340 C 301 320 306 295 300 280 Z', '#38bdf8', null);
        ellipse(ctx, 283, 305, 2.5, 2.5, '#0f172a', null);
        ellipse(ctx, 293, 305, 2.5, 2.5, '#0f172a', null);
        path(ctx, 'M 284 318 Q 288 324 292 318', null, INK, 1.4);

        // Ghế nha khoa đa năng hiện đại
        path(ctx, 'M 140 640 Q 240 680 340 620 L 340 660 L 140 680 Z', '#0284c7', INK, 2.0);
        taper(ctx, 240, 680, 240, 810, 18, 22, '#94a3b8', INK, 2.0);
        // Tựa đầu ghế
        ellipse(ctx, 130, 625, 14, 10, '#0369a1', INK, 1.4);

        // Đèn rọi nha khoa tròn trên cần xoay
        line(ctx, [[460, 810], [460, 480]], '#64748b', 3.5);
        path(ctx, 'M 460 480 Q 420 460 380 490', null, '#64748b', 3.0);
        ellipse(ctx, 380, 495, 18, 9, '#fef08a', INK, 1.4);
        if (isNight) {
          ctx.save();
          const lightGrad = ctx.createRadialGradient(380, 495, 4, 380, 495, 120);
          lightGrad.addColorStop(0, 'rgba(254, 240, 138, 0.7)');
          lightGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
          ctx.fillStyle = lightGrad;
          ctx.beginPath();
          ctx.arc(380, 495, 120, 0, TAU);
          ctx.fill();
          ctx.restore();
        }

        // Sàn phòng nha khoa (ground_y: 810)
        ctx.fillStyle = isNight ? '#0c1e28' : '#cffafe';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], INK, 2.4);
      }
    },

    // 10. Phòng thí nghiệm khoa học (science_lab)
    science_lab: {
      label: 'Phòng thí nghiệm khoa học',
      theme: 'lab',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        const isNight = s.time === 'night';
        ctx.fillStyle = isNight ? '#131b2e' : '#f1f5f9';
        ctx.fillRect(0, 0, 576, 810);

        // Kính hiển vi quang học đặt trên bàn phụ bên trái
        const microX = 140, microY = 640;
        path(ctx, `M ${microX - 16} ${microY} L ${microX + 16} ${microY} L ${microX + 12} ${microY - 8} L ${microX - 12} ${microY - 8} Z`, '#0f172a', INK, 1.4);
        line(ctx, [[microX, microY - 8], [microX + 10, microY - 45]], '#334155', 4.0);
        taper(ctx, microX - 2, microY - 32, microX - 8, microY - 14, 5, 4, '#64748b', INK, 1.2);
        taper(ctx, microX + 8, microY - 52, microX + 3, microY - 38, 4.5, 4.5, '#0284c7', INK, 1.2);

        // Giá để ống nghiệm thuỷ tinh chứa dung dịch màu sặc sỡ
        const rackX = 360, rackY = 640;
        path(ctx, `M ${rackX - 45} ${rackY} L ${rackX + 45} ${rackY} L ${rackX + 45} ${rackY - 30} L ${rackX - 45} ${rackY - 30} Z`, '#d97706', INK, 1.4);
        const tubeColors = ['#ec4899', '#3b82f6', '#22c55e', '#a855f7'];
        for (let i = 0; i < 4; i++) {
          const tx = rackX - 30 + i * 20;
          taper(ctx, tx, rackY - 36, tx, rackY - 6, 4.5, 4.5, 'rgba(255,255,255,0.7)', INK, 1.0);
          taper(ctx, tx, rackY - 20, tx, rackY - 6, 4.0, 4.0, tubeColors[i], null);
        }

        // Bình tam giác Erlenmeyer chứa dung dịch sủi bọt
        const erlX = 460, erlY = 640;
        path(ctx, `M ${erlX - 16} ${erlY} L ${erlX + 16} ${erlY} L ${erlX + 5} ${erlY - 32} L ${erlX - 5} ${erlY - 32} Z`, 'rgba(255,255,255,0.75)', INK, 1.4);
        path(ctx, `M ${erlX - 14} ${erlY - 1} L ${erlX + 14} ${erlY - 1} L ${erlX + 9} ${erlY - 18} L ${erlX - 9} ${erlY - 18} Z`, '#06b6d4', null);
        // Bong bóng sủi bọt theo t
        const bubbleY = ((t * 15) % 18);
        ellipse(ctx, erlX, erlY - 4 - bubbleY, 2.0, 2.0, '#ffffff', null);

        // Bàn đá đen phòng thí nghiệm (chịu lực)
        path(ctx, 'M 40 640 L 536 640 L 536 810 L 40 810 Z', isNight ? '#0f172a' : '#1e293b', INK, 2.4);
        line(ctx, [[40, 646], [536, 646]], '#475569', 2.0);

        // Sàn phòng thí nghiệm chống tĩnh điện (ground_y: 810)
        ctx.fillStyle = isNight ? '#090d16' : '#94a3b8';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], INK, 2.4);
      }
    },

    // 11. Không gian hoạt hình trong cơ thể (body_inside)
    body_inside: {
      label: 'Bên trong cơ thể hoạt hình',
      theme: 'body',
      ground_y: 810,
      draw(ctx, s, t, kit) {
        // Nền hồng phấn mềm mại của mạch máu / mô
        const grad = ctx.createLinearGradient(0, 0, 0, 810);
        grad.addColorStop(0, '#f472b6');
        grad.addColorStop(1, '#fda4af');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 576, 810);

        // Các tế bào hồng cầu mờ trôi lững lờ ở hậu cảnh
        for (let i = 0; i < 7; i++) {
          const bx = ((hash('rbc_x_' + i) + t * 24) % 620) - 20;
          const by = (hash('rbc_y_' + i) % 700) + 40;
          ellipse(ctx, bx, by, 16, 12, 'rgba(239, 68, 68, 0.45)', null, 0.3);
          ellipse(ctx, bx, by, 8, 6, 'rgba(185, 28, 28, 0.3)', null, 0.3);
        }

        // Vách mạch máu cong mềm mại uốn lượn 2 bên
        path(ctx, 'M 0 0 Q 60 400 0 810 L 0 810 Z', 'rgba(244, 63, 94, 0.5)', null);
        path(ctx, 'M 576 0 Q 516 400 576 810 L 576 810 Z', 'rgba(244, 63, 94, 0.5)', null);

        // Nền đáy mềm (ground_y: 810)
        ctx.fillStyle = '#fb7185';
        ctx.fillRect(0, 810, 576, 214);
        line(ctx, [[0, 810], [576, 810]], '#e11d48', 2.4);
      }
    },
  };

  // =========================================================================
  // 4. 13 ĐỘNG TÁC Y TẾ – VỆ SINH & ACTION HOOKS (§9.4)
  // =========================================================================

  // Tiếp cận – giữ – rời: 0 → 1 trong [0, inEnd], 1 → 0 trong [outStart, 1].
  function contactBlend(p, inEnd, outStart) {
    return p < inEnd ? smooth(p / inEnd) : p > outStart ? 1 - smooth((p - outStart) / (1 - outStart)) : 1;
  }
  function targetAnchor(cat, a, tgt, preferred) {
    if (a.target_anchor) return a.target_anchor;
    const anchors = cat.assets[tgt.asset].anchors;
    return preferred.find(name => anchors[name]) || 'face';
  }
  // Độ lệch thế giới từ ổ gắn (tay) tới anchor của dụng cụ đang gắn (attach_to) ở tay đó. Hook chạy
  // trước bước attach, nên state của dụng cụ lúc này còn là tư thế cục bộ quanh tay (như attach đọc).
  function toolOffset(cat, actor, tool, anchorName) {
    const lr = tool.rotation || 0, rot = actor.rotation || 0;
    const d = RemakeVector.kit.rotate(tool.x * (actor.flip ? -1 : 1), tool.y, rot);
    const probe = { ...tool, x: d[0], y: d[1], rotation: rot + (actor.flip ? -lr : lr), flip: Boolean(actor.flip) !== Boolean(tool.flip) };
    return RemakeVector.worldAnchor(cat, probe, anchorName);
  }
  // Đặt tay (IK) sao cho đầu dụng cụ action.tool (hoặc chính bàn tay khi không có tool) tới đúng dest.
  function aimHand(cat, a, states, prefix, dest, blend, toolAnchor) {
    const actor = states[a.actor];
    if (!actor || blend <= 0) return;
    const tool = a.tool && toolAnchor ? states[a.tool] : null;
    const off = tool ? toolOffset(cat, actor, tool, toolAnchor) : { x: 0, y: 0 };
    const local = RemakeVector.worldToLocal(actor, { x: dest.x - off.x, y: dest.y - off.y });
    const rest = RemakeVector.localAnchor(cat, actor, prefix);
    actor[`${prefix}_x`] = mix(rest[0], local[0], blend);
    actor[`${prefix}_y`] = mix(rest[1], local[1], blend);
  }
  // 6 bước rửa tay (WHO): sep = nửa khoảng cách hai tay, r = bán kính chà (px); same = hai tay cùng chiều.
  const WASH_STEPS = [
    { sep: [1, 0], r: [3, 2.5], mode: 'counter' },   // 1 lòng bàn tay xoa nhau
    { sep: [1, -3], r: [5, 1], mode: 'same' },       // 2 lòng tay chà mu bàn tay kia
    { sep: [1, 0], r: [3.5, 1], mode: 'counter' },   // 3 đan kẽ ngón
    { sep: [.5, 1.5], r: [1, 3], mode: 'counter' },  // 4 mu ngón tay khoá vào lòng tay kia
    { sep: [3, 0], r: [3, 3], mode: 'same' },        // 5 xoay ngón cái
    { sep: [1, 1], r: [2.5, 2.5], mode: 'counter' }, // 6 đầu ngón tay xoay trong lòng bàn tay
  ];
  const VACCINE_CONTACT = [.4, .6], VACCINE_STANDOFF = 34;

  const medicalActionHooks = {
    // 4.1 Rửa tay 6 bước (wash_hands): hai bàn tay luôn chạm nhau trước ngực, mỗi bước một kiểu chà
    // (step 1–6 cố định một bước; không có step thì lần lượt đủ 6 bước). Biên độ tính bằng pixel thế giới.
    wash_hands(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (!s) return;
      const scale = s.height / 100, blend = contactBlend(p, .1, .9) * amount;
      const index = a.step ? a.step - 1 : Math.min(5, Math.floor(p * 6));
      const local = a.step ? p : p * 6 - index, envelope = Math.sin(Math.PI * clamp(local));
      const theta = local * Math.PI * 8, step = WASH_STEPS[index];
      const sl = RemakeVector.localAnchor(cat, s, 'shoulder_l'), sr = RemakeVector.localAnchor(cat, s, 'shoulder_r');
      const cx = (sl[0] + sr[0]) / 2, cy = (sl[1] + sr[1]) / 2 + 12;
      const ox = step.r[0] * Math.cos(theta) * envelope, oy = step.r[1] * Math.sin(theta) * envelope;
      const sep = [step.sep[0] * envelope + 1.5, step.sep[1] * envelope];
      const twin = step.mode === 'same' ? 1 : -1;
      const left = [cx + (-sep[0] + ox) / scale, cy + (-sep[1] + oy) / scale];
      const right = [cx + (sep[0] + twin * ox) / scale, cy + (sep[1] + twin * oy) / scale];
      s.hand_l_x = mix(s.hand_l_x ?? left[0], left[0], blend); s.hand_l_y = mix(s.hand_l_y ?? left[1], left[1], blend);
      s.hand_r_x = mix(s.hand_r_x ?? right[0], right[0], blend); s.hand_r_y = mix(s.hand_r_y ?? right[1], right[1], blend);
      s.washing_hands = true;
      s.wash_step = index + 1;
    },

    // 4.2 Đánh răng (brush_teeth): đầu lông bàn chải (action.tool gắn ở tay phải) hoặc bàn tay
    // chải qua lại ±8 px quanh răng/miệng của đích (có thể là chính mình).
    brush_teeth(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor], tgt = states[a.target] || s;
      if (!s) return;
      const anchor = targetAnchor(cat, a, tgt, ['teeth', 'mouth']);
      const dest = RemakeVector.worldAnchor(cat, tgt, anchor);
      dest.x += Math.sin(p * Math.PI * 14) * 8;
      aimHand(cat, a, states, 'hand_r', dest, contactBlend(p, .15, .85) * amount, 'bristles');
      s.brushing_teeth = true;
      tgt.mouth = Math.max(tgt.mouth || 0, (0.4 + 0.2 * Math.sin(p * Math.PI * 14)) * contactBlend(p, .15, .85));
      if (tgt.asset === 'tooth_chibi') {
        tgt.clean = true;
        tgt.sparkle = Math.max(tgt.sparkle || 0, p);
        if (tgt.cavity) tgt.cavity = Math.max(0, tgt.cavity - p * 0.5);
      }
    },

    // 4.3 Ho vào khuỷu tay (cough_cover)
    cough_cover(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.coughing = true;
        // Đưa khuỷu tay trái lên che miệng
        s.hand_l_x = 10;
        s.hand_l_y = -55;
        s.lean = -0.3;
      }
    },

    // 4.4 Hắt hơi (sneeze)
    sneeze(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.sneezing = true;
        if (p < 0.6) {
          // Giai đoạn hít sâu giật lùi
          s.lean = -0.4 * (p / 0.6);
        } else {
          // Giai đoạn hắt mạnh ra trước
          const burst = (p - 0.6) / 0.4;
          s.lean = 0.5 * Math.sin(burst * Math.PI);
        }
      }
    },

    // 4.5 Đo nhiệt độ (take_temperature): đầu nhiệt kế (tool, anchor tip) hoặc tay chạm trán của đích.
    take_temperature(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const tgt = states[a.target];
      if (!tgt) return;
      const dest = RemakeVector.worldAnchor(cat, tgt, targetAnchor(cat, a, tgt, ['forehead']));
      aimHand(cat, a, states, 'hand_r', dest, contactBlend(p, .2, .85) * amount, 'tip');
      tgt.measuring_temp = true;
    },

    // 4.6 Nghe nhịp tim (listen): mặt ống nghe (tool, anchor chest_piece) áp lên ngực, dời nhẹ vài điểm nghe.
    listen(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const tgt = states[a.target];
      if (!tgt) return;
      const dest = RemakeVector.worldAnchor(cat, tgt, targetAnchor(cat, a, tgt, ['chest']));
      const spot = Math.floor(clamp(p) * 3.999);
      dest.x += [0, -6, 5, 0][spot] * tgt.height / 300;
      dest.y += [0, 3, 5, 0][spot] * tgt.height / 300;
      aimHand(cat, a, states, 'hand_r', dest, contactBlend(p, .2, .85) * amount, 'chest_piece');
      tgt.heart_listening = true;
    },

    // 4.7 Tiêm chủng (vaccinate): đưa kim (tool, anchor needle) tới điểm chờ cách arm_l VACCINE_STANDOFF px,
    // chỉ chạm tay đích trong VACCINE_CONTACT của thời lượng, rồi rút ra. Bé lo lắng trước, cười sau khi tiêm.
    vaccinate(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const nurse = states[a.actor], kid = states[a.target];
      if (!nurse || !kid) return;
      const dest = RemakeVector.worldAnchor(cat, kid, targetAnchor(cat, a, kid, ['arm_l', 'shoulder_l']));
      const [c0, c1] = VACCINE_CONTACT, ramp = .05;
      const poke = p < c0 - ramp || p > c1 + ramp ? 0 : p < c0 ? smooth((p - c0 + ramp) / ramp) : p > c1 ? 1 - smooth((p - c1) / ramp) : 1;
      const side = Math.sign(nurse.x - kid.x) || -1;
      const goal = { x: dest.x + side * VACCINE_STANDOFF * .8 * (1 - poke), y: dest.y - VACCINE_STANDOFF * .6 * (1 - poke) };
      const reach = p < c0 - ramp ? smooth(p / (c0 - ramp)) : p > c1 + ramp ? 1 - smooth((p - c1 - ramp) / (1 - c1 - ramp)) : 1;
      aimHand(cat, a, states, 'hand_r', goal, reach * amount, 'needle');
      kid.expression = p < c1 ? 'worried' : 'happy';
      if (p >= c1) kid.vaccinated = true;
    },

    // 4.8 Dán băng (apply_bandage): hai tay áp vào arm_l của đích (tay phải đúng điểm, tay trái miết bên cạnh).
    apply_bandage(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor], tgt = states[a.target];
      if (!s || !tgt) return;
      const dest = RemakeVector.worldAnchor(cat, tgt, targetAnchor(cat, a, tgt, ['arm_l', 'shoulder_l']));
      const blend = contactBlend(p, .25, .85) * amount;
      aimHand(cat, a, states, 'hand_r', dest, blend, null);
      aimHand(cat, a, states, 'hand_l', { x: dest.x + (s.x < tgt.x ? -10 : 10), y: dest.y + 4 + Math.sin(p * Math.PI * 6) * 3 }, blend, null);
      tgt.bandaged = true;
    },

    // 4.9 Uống viên thuốc (swallow_pill)
    swallow_pill(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.hand_r_x = 0;
        s.hand_r_y = -58;
        s.mouth = p < 0.5 ? 0.6 : 0.0;
      }
    },

    // 4.10 Uống nước (drink)
    drink(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        s.hand_r_x = 2;
        s.hand_r_y = -56;
        s.mouth = 0.3;
      }
    },

    // 4.11 Thể dục rèn luyện sức khoẻ (exercise)
    exercise(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        // Vươn tay nhún nhảy thể dục
        const cycle = p * Math.PI * 8;
        s.jump = Math.abs(Math.sin(cycle)) * 0.6;
        s.hand_l_x = -22 + Math.sin(cycle) * 8;
        s.hand_l_y = -46 - Math.abs(Math.sin(cycle)) * 14;
        s.hand_r_x = 22 - Math.sin(cycle) * 8;
        s.hand_r_y = -46 - Math.abs(Math.sin(cycle)) * 14;
      }
    },

    // 4.12 Ăn uống lành mạnh (eat)
    eat(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const s = states[a.actor];
      if (s) {
        const chew = Math.sin(p * Math.PI * 10);
        s.hand_r_x = Math.sin(p * Math.PI * 4) * 6;
        s.hand_r_y = -56;
        s.mouth = Math.abs(chew) * 0.45;
      }
    },

    // 4.13 Vi sinh tấn công (germ_attack)
    germ_attack(a, states, t, p, u, amount, cat, active) {
      if (!active) return;
      const germ = states[a.actor];
      const target = states[a.target];
      if (germ && target) {
        // Vi sinh bò / bay uốn lượn tới bề mặt target
        const wiggle = Math.sin(t * 16) * 12;
        germ.x = mix(germ.x, target.x, p * 0.3) + wiggle;
        germ.y = mix(germ.y, target.y - 40, p * 0.3);
      }
    },
  };

  // =========================================================================
  // 5. HIỆU ỨNG HÌNH ẢNH (CUSTOM EFFECTS)
  // =========================================================================

  function medicalCustomEffects(ctx, snapshot, cat, kit) {
    const { path, line, ellipse, INK, TAU, clamp, hash } = kit;

    // 5.1 Bọt xà phòng trắng tròn khi rửa tay (wash_hands) hoặc đánh răng (brush_teeth)
    const washingActors = Object.values(snapshot.states).filter(s => s.washing_hands || s.brushing_teeth);
    for (const actor of washingActors) {
      ctx.save();
      const pos = RemakeVector.worldAnchor(cat, actor, actor.brushing_teeth ? 'mouth' : 'hand') || { x: actor.x, y: actor.y - 30 };
      for (let i = 0; i < 6; i++) {
        const ang = (snapshot.t * 3 + i * (TAU / 6));
        const dist = 12 + ((hash(actor.id + '_bubble_' + i) % 15));
        const bx = pos.x + Math.cos(ang) * dist;
        const by = pos.y + Math.sin(ang) * dist - (snapshot.t * 8 % 14);
        const br = 2.5 + (i % 3);
        ellipse(ctx, bx, by, br, br, 'rgba(255, 255, 255, 0.85)', '#93c5fd', 0.8);
        ellipse(ctx, bx - 0.8, by - 0.8, br * 0.35, br * 0.35, '#ffffff', null);
      }
      ctx.restore();
    }

    // 5.2 Sóng nhịp tim đồ hoạ (heartbeat) khi nghe tim (listen)
    const listeningActors = Object.values(snapshot.states).filter(s => s.heart_listening);
    for (const actor of listeningActors) {
      ctx.save();
      const pos = RemakeVector.worldAnchor(cat, actor, 'chest') || { x: actor.x, y: actor.y - 38 };
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      const sx = pos.x - 24, sy = pos.y - 12;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 12, sy);
      ctx.lineTo(sx + 18, sy - 14);
      ctx.lineTo(sx + 24, sy + 14);
      ctx.lineTo(sx + 30, sy - 8);
      ctx.lineTo(sx + 36, sy);
      ctx.lineTo(sx + 48, sy);
      ctx.stroke();
      ctx.restore();
    }

    // 5.3 Hạt bắn li ti khi hắt hơi (sneeze)
    const sneezingActors = Object.values(snapshot.states).filter(s => s.sneezing);
    for (const actor of sneezingActors) {
      ctx.save();
      const pos = RemakeVector.worldAnchor(cat, actor, 'mouth') || { x: actor.x, y: actor.y - 60 };
      const dir = actor.flip ? -1 : 1;
      ctx.fillStyle = '#60a5fa';
      for (let i = 0; i < 8; i++) {
        const spread = (i - 4) * 4;
        const px = pos.x + dir * (15 + i * 6);
        const py = pos.y + spread;
        ellipse(ctx, px, py, 1.4, 1.4, '#60a5fa', null);
      }
      ctx.restore();
    }
  }

  // =========================================================================
  // 6. ĐĂNG KÝ VỚI REMAKEVECTOR ENGINE
  // =========================================================================

  // Quy ước thư viện: hình vẽ lấp gần đầy khung rig 100 đơn vị, để height trong story là cỡ nhìn thấy.
  // Các rig dưới đây vẽ nhỏ nên được phóng quanh gốc; anchor trong catalog đã nhân cùng hệ số.
  const RIG_SCALE = {"stethoscope": 2.2, "thermometer": 1.85, "syringe": 2.0, "pill": 5.75, "pill_bottle": 2.6, "syrup_bottle": 2.1, "spoon": 2.9, "band_aid": 2.85, "bandage_roll": 3.15, "face_mask": 2.7, "soap": 3.35, "sanitizer": 2.4, "towel": 3.1, "toothbrush": 2.45, "toothpaste": 2.9, "water_glass": 3.85, "first_aid_kit": 3.2, "ice_pack": 3.25, "wheelchair": 1.8, "crutches": 1.5, "scale": 2.1, "lunch_tray": 1.75, "good_bacteria": 3.7, "bacteria_rod": 3.1, "virus_spike": 2.5, "tooth_chibi": 2.85};
  for (const [id, k] of Object.entries(RIG_SCALE)) {
    const draw = MEDICAL_RIGS[id].draw;
    MEDICAL_RIGS[id].draw = function (ctx, ...rest) { ctx.save(); ctx.scale(k, k); draw.call(this, ctx, ...rest); ctx.restore(); };
    const anchors = MEDICAL_RIGS[id].anchors;
    if (anchors) for (const name of Object.keys(anchors)) anchors[name] = anchors[name].map(v => v * k);
  }

  RemakeVector.register({
    rigs: MEDICAL_RIGS,
    backgrounds: MEDICAL_BACKGROUNDS,
    effects: [medicalCustomEffects],
    actionHooks: medicalActionHooks,
  });

})();
