// Remake Vector Engine Pack: Polar Birds & Cartoon Specials (Chim, Cực địa & Hoạt hình đặc biệt)
// Rigs: eagle, penguin, wild_rabbit, capybara, cartoon_tiger, cartoon_monkey, armored_bear, armored_wolf, chibi_cow, cartoon_snake, vulture
(function() {
  'use strict';
  if (!globalThis.RemakeVector) throw new Error('RemakeVector core engine must be loaded before engine packs.');
  const { kit, register } = globalThis.RemakeVector;
  const { INK, tone, volume, cylinder, limb, ellipse, path, line, withCut, hash, clamp, smooth } = kit;

  function drawEye(ctx, x, y, r, blink, dirX = 1, irisColor = '#2b231d') {
    if (blink > 0.7) {
      path(ctx, `M ${x - r} ${y} Q ${x} ${y + r * 0.8} ${x + r} ${y}`, null, INK, 1.6);
      return;
    }
    const h = r * (1 - blink * 0.8);
    ellipse(ctx, x, y, r, h, '#ffffff', INK, 1.2);
    const pupilX = x + dirX * (r * 0.25);
    ellipse(ctx, pupilX, y, r * 0.55, h * 0.55, irisColor, null);
    ellipse(ctx, pupilX, y, r * 0.32, h * 0.32, '#111111', null);
    ellipse(ctx, pupilX - r * 0.18, y - h * 0.18, r * 0.2, h * 0.2, '#ffffff', null);
  }

  // 1. EAGLE (Đại bàng hoàng kim)
  function drawEagle(ctx, s, t) {
    const flying = Boolean(s.flying ?? false);
    const bodyCol = s.style?.body || '#443125';
    const headCol = '#fcfbf6'; // đầu trắng kiểu đại bàng đầu trắng
    const beakCol = '#f2b426';

    ctx.save();
    if (flying) {
      const flap = Math.sin(t * 14) * 0.4;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(0, -42);
        ctx.rotate(side * (0.35 + flap));
        // Cánh sải rộng có lông vũ đầu cánh
        path(ctx, `M 0 0 Q ${side * 40} -36 ${side * 80} -20 C ${side * 75} 10 ${side * 40} 24 0 16 Z`, volume(ctx, side * 40, 0, 40, 22, bodyCol), INK, 1.8);
        for (let f = 0; f < 4; f++) {
          line(ctx, [[side * (60 + f * 5), -14 + f * 6], [side * (82 + f * 4), -18 + f * 10]], tone(bodyCol, -0.2), 2);
        }
        ctx.restore();
      }
    } else {
      // Đậu trên mặt đất
      // Chân vàng móng vuốt quắp sắc nhọn
      for (const lx of [-10, 8]) {
        limb(ctx, [[lx, -18], [lx, -3]], beakCol, 4.5);
        for (let c = -1; c <= 1; c++) {
          line(ctx, [[lx + c * 3, -3], [lx + c * 4 + 3, 0]], '#1a1a1a', 2);
        }
      }
      // Cánh gập xuôi theo thân
      path(ctx, 'M -16 -40 L -28 -14 L -4 -20 Z', volume(ctx, -16, -26, 14, 14, bodyCol), INK, 1.5);
    }

    // Đuôi lông trắng xòe
    path(ctx, 'M -22 -30 L -38 -20 L -30 -12 Z', headCol, INK, 1.2);

    // Thân chim ưng
    ellipse(ctx, 0, -36, 16, 20, volume(ctx, 0, -36, 16, 20, bodyCol), INK, 1.8);

    // ĐẦU TRẮNG & MỎ MÓC VÀNG QUẮM DỮ TỢN
    ctx.save();
    const hx = 14, hy = -56;
    ellipse(ctx, hx, hy, 12, 11, volume(ctx, hx, hy, 12, 11, headCol), INK, 1.6);

    // Mỏ vàng khoằm
    path(ctx, `M ${hx + 8} ${hy - 4} C ${hx + 24} ${hy - 4} ${hx + 26} ${hy + 6} ${hx + 20} ${hy + 14} C ${hx + 18} ${hy + 4} ${hx + 12} ${hy + 4} ${hx + 8} ${hy + 4} Z`, volume(ctx, hx + 16, hy + 4, 10, 8, beakCol), INK, 1.5);

    // Mắt đại bàng vàng chói gờ mày sắc lẹm
    path(ctx, `M ${hx} ${hy - 8} Q ${hx + 7} ${hy - 10} ${hx + 12} ${hy - 5}`, null, INK, 2.5);
    drawEye(ctx, hx + 5, hy - 4, 3.5, s.blink || 0, 1, '#f2d026');

    ctx.restore();
    ctx.restore();
  }

  // 2. PENGUIN (Chim cánh cụt hoàng đế)
  function drawPenguin(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const bodyCol = '#202228';
    const bellyCol = '#ffffff';
    const yellowCol = '#f8b82a';

    ctx.save();
    // Dáng đi lạch bạch (Waddle)
    const waddle = Math.sin(stride) * walk * 0.15;
    ctx.rotate(waddle);

    // Hai bàn chân màng màu đen bám đất
    for (const [lx, off] of [[-10, 0], [10, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 6;
      path(ctx, `M ${lx + sw - 6} 0 L ${lx + sw + 8} 0 L ${lx + sw + 2} -4 Z`, '#2a2420', INK, 1);
    }

    // Thân bầu dục hình chim cánh cụt
    ellipse(ctx, 0, -32, 18, 28, volume(ctx, 0, -32, 18, 28, bodyCol), INK, 2);

    // Bụng trắng muốt như áo vest tuxedo
    ellipse(ctx, 2, -28, 12, 22, bellyCol, null);

    // Hai cánh flipper nhỏ dẹp
    const flipperFlap = Math.sin(t * 6) * 0.1;
    ctx.save();
    ctx.translate(-14, -42);
    ctx.rotate(-0.2 - flipperFlap);
    ellipse(ctx, -4, 14, 5, 16, volume(ctx, -4, 14, 5, 16, bodyCol), INK, 1.2, 0.2);
    ctx.restore();

    ctx.save();
    ctx.translate(14, -42);
    ctx.rotate(0.2 + flipperFlap);
    ellipse(ctx, 4, 14, 5, 16, volume(ctx, 4, 14, 5, 16, bodyCol), INK, 1.2, -0.2);
    ctx.restore();

    // Vạt lông vàng óng đặc trưng ở hai bên cổ
    ellipse(ctx, -8, -52, 4, 8, yellowCol, null, 0, -0.3);
    ellipse(ctx, 8, -52, 4, 8, yellowCol, null, 0, 0.3);

    // Đầu tròn
    ellipse(ctx, 0, -60, 11, 10, volume(ctx, 0, -60, 11, 10, bodyCol), INK, 1.6);

    // Mỏ nhọn có vệt cam
    path(ctx, 'M 4 -62 L 18 -58 L 4 -56 Z', volume(ctx, 10, -59, 8, 3, '#1c1b18'), INK, 1);
    line(ctx, [[6, -58], [14, -58]], yellowCol, 1.5);

    // Mắt
    drawEye(ctx, 3, -62, 3, s.blink || 0, 1, '#222222');

    ctx.restore();
  }

  // 3. WILD RABBIT (Thỏ rừng chân dài)
  function drawWildRabbit(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const bodyCol = s.style?.body || '#b68858';
    const bellyCol = '#faeed9';

    ctx.save();
    // Cử động nhảy chồm (Hop)
    const hop = walk * -Math.abs(Math.sin(stride)) * 10;
    ctx.translate(0, hop);

    // Chân sau dài khỏe
    for (const [lx, off] of [[-18, 0], [-10, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 8;
      limb(ctx, [[lx, -24], [lx - 8, -12], [lx + 6 + sw, -2]], bodyCol, 6.5);
    }

    // Đuôi bông xù tròn nhỏ
    ellipse(ctx, -26, -28, 5, 5, bellyCol, INK, 1);

    // Thân thon gọn
    path(ctx, 'M -24 -24 C -26 -44 -6 -48 14 -44 C 24 -40 26 -28 20 -18 C 10 -12 -8 -12 -20 -14 Z', volume(ctx, -2, -32, 24, 18, bodyCol), INK, 1.8);
    ellipse(ctx, 4, -24, 12, 8, bellyCol, null);

    // Chân trước thanh mảnh
    for (const [lx, off] of [[12, Math.PI], [18, 0]]) {
      limb(ctx, [[lx, -20], [lx + 4, -2]], bodyCol, 4.5);
    }

    // Đầu & HAI TAI SIÊU DÀI CÓ CHÓP ĐEN
    ctx.save();
    const hx = 22, hy = -44;
    ellipse(ctx, hx, hy, 11, 10, volume(ctx, hx, hy, 11, 10, bodyCol), INK, 1.6);
    ellipse(ctx, hx + 5, hy + 2, 5, 4, bellyCol, null);

    // Mắt to tròn màu hổ phách
    drawEye(ctx, hx + 2, hy - 2, 3.8, s.blink || 0, 1, '#b8681e');

    // Mũi hồng & Ria mép
    ellipse(ctx, hx + 9, hy + 1, 1.8, 1.5, '#e89da8', null);
    const twitch = Math.sin(t * 10) * 0.8;
    line(ctx, [[hx + 8, hy + 1], [hx + 16, hy - 2 + twitch]], '#555555', 0.8);
    line(ctx, [[hx + 8, hy + 2], [hx + 16, hy + 4 - twitch]], '#555555', 0.8);

    // TAI SIÊU DÀI VƯƠN CAO
    for (const [ex, rot] of [[hx - 3, -0.15], [hx + 3, 0.15]]) {
      ctx.save();
      ctx.translate(ex, hy - 8);
      ctx.rotate(rot);
      path(ctx, 'M -4 0 C -6 -18 -5 -36 0 -42 C 5 -36 6 -18 4 0 Z', volume(ctx, 0, -20, 6, 20, bodyCol), INK, 1.2);
      path(ctx, 'M -2 -2 C -3 -14 -2 -28 0 -32 C 2 -28 3 -14 2 -2 Z', '#f0b8c4', null);
      // Chóp tai đen đặc trưng thỏ rừng
      path(ctx, 'M -4 -34 C -3 -40 0 -42 0 -42 C 0 -42 3 -40 4 -34 Z', '#1a1816', null);
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }

  // 4. CAPYBARA (Chuột lang nước Capybara)
  function drawCapybara(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#88583a';
    const bellyCol = '#aa7652';

    ctx.save();
    // 4 chân ngắn chắc nịch
    const capyLeg = (lx, near, off) => {
      const sw = -Math.sin(stride + off) * walk * 8;
      const col = near ? bodyCol : tone(bodyCol, -0.2);
      const fx = lx + sw;
      limb(ctx, [[lx, -20], [fx, -2]], col, 8);
      ellipse(ctx, fx + 1, -1.5, 5, 2.5, '#221a14', null);
    };
    capyLeg(-24, 0, 0);
    capyLeg(18, 0, Math.PI);

    // Thân thùng tròn trịa phẳng phiu
    ellipse(ctx, -2, -30, 28, 20, volume(ctx, -2, -30, 28, 20, bodyCol), INK, 2);

    capyLeg(-14, 1, Math.PI);
    capyLeg(26, 1, 0);

    // ĐẦU VUÔNG ĐẶC TRƯNG & BIỂU CẢM CHILL VÔ TẬN
    ctx.save();
    const hp = [22, -42];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.6);
    ctx.translate(-hp[0], -hp[1]);

    // Đầu hình khối chữ nhật bo tròn
    path(ctx, 'M 18 -48 L 44 -48 C 50 -48 52 -44 52 -36 C 52 -28 46 -26 36 -28 L 18 -32 Z', volume(ctx, 34, -38, 18, 12, bodyCol), INK, 1.8);

    // Mũi to tròn phẳng
    ellipse(ctx, 50, -38, 3.5, 4, '#382216', null);
    ellipse(ctx, 51, -38, 1.5, 2, '#18100a', null);

    // Mắt nhỏ lim dim thanh thản bình yên
    drawEye(ctx, 30, -44, 2.8, (s.blink || 0) + 0.25, 1, '#1f1612');

    // Tai nhỏ xíu trên đỉnh đầu
    ellipse(ctx, 22, -50, 3, 3.5, tone(bodyCol, -0.2), INK, 0.8);

    ctx.restore();
    ctx.restore();
  }

  // 5. CARTOON TIGER (Hổ vằn hoạt hình)
  function drawCartoonTiger(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#f48022';
    const whiteCol = '#ffffff';
    const stripeCol = '#1a1816';

    ctx.save();
    const tigerLeg = (lx, near, off) => {
      const sw = -Math.sin(stride + off) * walk * 12;
      const lift = Math.max(0, -Math.cos(stride + off)) * walk * 7;
      const col = near ? bodyCol : tone(bodyCol, -0.2);
      const fx = lx + sw, fy = -lift;
      limb(ctx, [[lx, -28], [lx + 4, -14], [fx, fy - 3]], col, 8);
      ellipse(ctx, fx + 1, fy - 2, 6, 3.5, whiteCol, INK, 0.8);
      // Vằn trên chân
      line(ctx, [[lx + 2, -20], [lx + 6, -18]], stripeCol, 2);
    };
    tigerLeg(-26, 0, 0);
    tigerLeg(18, 0, Math.PI);

    // Đuôi dài vằn vện
    const tailWhip = Math.sin(t * 4 + stride) * 8;
    path(ctx, `M -36 -38 Q -56 -48 ${-64 + tailWhip} -24`, null, INK, 5.5);
    path(ctx, `M -36 -38 Q -56 -48 ${-64 + tailWhip} -24`, null, bodyCol, 4);
    // Vòng vằn đen trên đuôi
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, -44 - i * 5, -42 + i * 4, 2, 4, stripeCol, null);
    }

    // Thân hổ dũng mãnh
    path(ctx, 'M -38 -38 C -40 -58 -14 -60 16 -56 C 30 -54 34 -42 28 -30 C 18 -22 -6 -22 -26 -24 Z', volume(ctx, -4, -42, 36, 20, bodyCol), INK, 2);
    // Bụng trắng
    ellipse(ctx, -2, -26, 22, 7, whiteCol, null);

    // SỌC VẰN HỔ ĐEN BẢN RỘNG TRÊN THÂN
    for (const [sx, sy] of [[-24, -54], [-14, -56], [-4, -56], [6, -54], [16, -50]]) {
      path(ctx, `M ${sx} ${sy} Q ${sx + 4} ${sy + 8} ${sx} ${sy + 16} L ${sx + 2} ${sy + 16} Q ${sx + 6} ${sy + 8} ${sx + 3} ${sy} Z`, stripeCol, null);
    }

    tigerLeg(-16, 1, Math.PI);
    tigerLeg(26, 1, 0);

    // ĐẦU HỔ OAI HÙNG
    ctx.save();
    const hp = [22, -48];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.6);
    ctx.translate(-hp[0], -hp[1]);

    ellipse(ctx, 30, -56, 15, 14, volume(ctx, 30, -56, 15, 14, bodyCol), INK, 1.8);

    // Má xù trắng và cằm trắng
    ellipse(ctx, 36, -52, 8, 6, whiteCol, INK, 0.8);
    ellipse(ctx, 24, -52, 6, 5, whiteCol, null);

    // Chữ "Vương" (Chữ sọc trán hổ)
    line(ctx, [[28, -66], [34, -66]], stripeCol, 2);
    line(ctx, [[27, -63], [35, -63]], stripeCol, 2);
    line(ctx, [[31, -68], [31, -60]], stripeCol, 2);

    // Mắt hổ to tròn dũng cảm
    drawEye(ctx, 30, -58, 4, s.blink || 0, 1, '#e5a820');

    // Mũi hồng
    path(ctx, 'M 38 -56 L 43 -56 L 40.5 -53 Z', '#f08d98', INK, 0.8);

    // Ria mép trắng
    line(ctx, [[40, -52], [50, -54]], '#ffffff', 1.2);
    line(ctx, [[40, -50], [50, -49]], '#ffffff', 1.2);

    if (mouth > 0.1) {
      path(ctx, `M 35 -50 Q 40 ${-42 + mouth * 10} 45 -50`, '#88222a', INK, 1.2);
      path(ctx, 'M 37 -50 L 38 -46 L 40 -50 Z', '#ffffff', null);
    }

    // Tai tròn có đốm trắng sau tai
    for (const [ex, ey] of [[22, -68], [36, -68]]) {
      ellipse(ctx, ex, ey, 4.5, 5, stripeCol, INK, 1);
      ellipse(ctx, ex, ey, 2.5, 3, whiteCol, null);
    }

    ctx.restore();
    ctx.restore();
  }

  // 6. CARTOON MONKEY (Khỉ con đuôi dài)
  function drawCartoonMonkey(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#8c5936';
    const peachCol = '#fad4b4';

    ctx.save();
    // ĐUÔI DÀI CUỘN TRÒN LINH HOẠT
    const tailCurl = Math.sin(t * 3) * 6;
    path(ctx, `M -14 -24 C -28 -34 -36 -14 -28 -4 C -22 4 -12 -2 ${-18 + tailCurl} -10`, null, INK, 4.5);
    path(ctx, `M -14 -24 C -28 -34 -36 -14 -28 -4 C -22 4 -12 -2 ${-18 + tailCurl} -10`, null, bodyCol, 3);

    // Chân & Tay
    for (const [lx, off] of [[-10, 0], [10, Math.PI]]) {
      const sw = -Math.sin(stride + off) * walk * 8;
      limb(ctx, [[lx, -18], [lx + sw, -2]], bodyCol, 5);
      ellipse(ctx, lx + sw + 1, -1, 3.5, 2, peachCol, null);
    }

    // Thân khỉ
    ellipse(ctx, 0, -28, 14, 16, volume(ctx, 0, -28, 14, 16, bodyCol), INK, 1.6);
    ellipse(ctx, 2, -26, 9, 11, peachCol, null);

    // Tay trước cử động
    const armWave = Math.sin(t * 4) * 4;
    limb(ctx, [[6, -34], [14, -26], [16 + armWave, -18]], bodyCol, 4.5);
    ellipse(ctx, 16 + armWave, -18, 3, 2.5, peachCol, null);

    // Đầu & Mặt quả đào đáng yêu
    ctx.save();
    const hx = 10, hy = -46;
    ellipse(ctx, hx, hy, 12, 11, volume(ctx, hx, hy, 12, 11, bodyCol), INK, 1.6);

    // Mặt đào hai hình tròn ghép lại
    ellipse(ctx, hx + 1, hy - 1, 6, 6, peachCol, null);
    ellipse(ctx, hx + 7, hy - 1, 6, 6, peachCol, null);
    ellipse(ctx, hx + 4, hy + 4, 7, 5, peachCol, null);

    // Mắt hạt nhãn lém lỉnh
    drawEye(ctx, hx + 2, hy - 2, 3, s.blink || 0, 1, '#2c1e14');
    drawEye(ctx, hx + 8, hy - 2, 3, s.blink || 0, 1, '#2c1e14');

    // Nụ cười toe toét
    path(ctx, `M ${hx + 2} ${hy + 4} Q ${hx + 5} ${hy + 7} ${hx + 8} ${hy + 4}`, null, INK, 1.4);

    // Hai tai tròn to vểnh hai bên
    ellipse(ctx, hx - 10, hy - 2, 5, 5, bodyCol, INK, 1);
    ellipse(ctx, hx - 10, hy - 2, 3, 3, peachCol, null);
    ellipse(ctx, hx + 14, hy - 2, 5, 5, bodyCol, INK, 1);
    ellipse(ctx, hx + 14, hy - 2, 3, 3, peachCol, null);

    ctx.restore();
    ctx.restore();
  }

  // 7. ARMORED BEAR (Gấu chiến giáp)
  function drawArmoredBear(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0;
    const bodyCol = s.style?.body || '#4d3423';
    const armorCol = '#747c87';
    const brassCol = '#d8a834';

    ctx.save();
    const bearLeg = (lx, near, off) => {
      const sw = -Math.sin(stride + off) * walk * 10;
      const col = near ? bodyCol : tone(bodyCol, -0.2);
      const fx = lx + sw;
      limb(ctx, [[lx, -30], [lx, -16], [fx, -3]], col, 12);
      // Móng vuốt sắt
      for (let c = -1; c <= 1; c++) {
        line(ctx, [[fx + c * 3, -3], [fx + c * 4 + 3, 0]], '#1b1b1b', 2.2);
      }
    };
    bearLeg(-28, 0, 0);
    bearLeg(24, 0, Math.PI);

    // Thân gấu khổng lồ
    path(ctx, 'M -42 -38 C -44 -68 -12 -72 26 -68 C 44 -64 48 -46 42 -30 C 30 -18 2 -18 -32 -20 Z', volume(ctx, -2, -48, 44, 26, bodyCol), INK, 2.2);

    // GIÁP SẮT VÀ DÂY ĐAI DA CHIẾN TRẬN
    // Dây đai da chéo qua ngực
    path(ctx, 'M 2 -68 L 18 -68 L 34 -32 L 20 -32 Z', '#3a2012', INK, 1);
    ellipse(ctx, 18, -48, 4, 4, brassCol, INK, 0.8); // Khóa đồng

    // GIÁP VAI KIM LOẠI (Steel Pauldron) có đinh tán
    ctx.save();
    ctx.translate(22, -62);
    ellipse(ctx, 0, 0, 14, 16, volume(ctx, 0, 0, 14, 16, armorCol), INK, 1.8, 0.3);
    // Đinh tán đồng viền quanh giáp vai
    for (let d = -2; d <= 2; d++) {
      ellipse(ctx, d * 4, -10 + Math.abs(d) * 3, 1.5, 1.5, brassCol, null);
    }
    ctx.restore();

    bearLeg(-16, 1, Math.PI);
    bearLeg(34, 1, 0);

    // ĐẦU GẤU HÙNG DŨNG & GIÁP TRÁN
    ctx.save();
    const hx = 34, hy = -62;
    ellipse(ctx, hx, hy, 16, 15, volume(ctx, hx, hy, 16, 15, bodyCol), INK, 2);

    // Mõm gấu to
    ellipse(ctx, hx + 10, hy + 3, 9, 7.5, '#78563c', INK, 1.2);
    ellipse(ctx, hx + 14, hy + 2, 3.5, 2.5, '#18120e', null);

    // TẤM GIÁP BẢO VỆ TRÁN (Steel Helm Plate)
    path(ctx, `M ${hx - 4} ${hy - 14} L ${hx + 8} ${hy - 14} L ${hx + 4} ${hy - 4} Z`, armorCol, INK, 1);

    // Mắt gấu dữ tợn
    drawEye(ctx, hx + 4, hy - 4, 3.8, s.blink || 0, 1, '#d87020');

    // Tai tròn
    ellipse(ctx, hx - 8, hy - 14, 5, 5, bodyCol, INK, 1);

    if (mouth > 0.1) {
      path(ctx, `M ${hx + 6} ${hy + 6} Q ${hx + 12} ${hy + 16} ${hx + 18} ${hy + 6}`, '#7a1f26', INK, 1.4);
      path(ctx, `M ${hx + 8} ${hy + 6} L ${hx + 9} ${hy + 10} L ${hx + 11} ${hy + 6} Z`, '#ffffff', null);
    }

    ctx.restore();
    ctx.restore();
  }

  // 8. ARMORED WOLF (Sói chiến giáp)
  function drawArmoredWolf(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0, mouth = s.mouth || 0, down = s.head_down || 0;
    const bodyCol = s.style?.body || '#7f8591';
    const armorCol = '#4e5664';
    const silverCol = '#d8e0ea';

    ctx.save();
    const wolfLeg = (lx, near, off) => {
      const sw = -Math.sin(stride + off) * walk * 14;
      const col = near ? bodyCol : tone(bodyCol, -0.2);
      const fx = lx + sw;
      limb(ctx, [[lx, -32], [lx + 4, -16], [fx, -2]], col, 7);
      ellipse(ctx, fx + 1, -1.5, 5, 3, silverCol, INK, 0.8);
    };
    wolfLeg(-28, 0, 0);
    wolfLeg(18, 0, Math.PI);

    // Đuôi xù dài rủ xuống
    const tailWag = Math.sin(t * 3.5) * 6;
    path(ctx, `M -38 -44 Q -56 -36 ${-54 + tailWag} -16`, null, INK, 5.5);
    path(ctx, `M -38 -44 Q -56 -36 ${-54 + tailWag} -16`, null, bodyCol, 4);

    // Thân sói thon chắc
    path(ctx, 'M -38 -42 C -40 -62 -14 -64 16 -60 C 28 -58 32 -46 28 -34 C 18 -26 -6 -26 -26 -28 Z', volume(ctx, -4, -46, 36, 20, bodyCol), INK, 1.8);
    // Bụng bạc
    ellipse(ctx, -2, -30, 22, 7, silverCol, null);

    // GIÁP VAI THÉP CÓ GAI SẮC
    ctx.save();
    ctx.translate(16, -56);
    path(ctx, 'M -6 -10 L 10 -10 L 8 8 L -4 8 Z', armorCol, INK, 1.4);
    // Gai nhọn trên giáp vai
    path(ctx, 'M 0 -10 L 2 -18 L 6 -10 Z', silverCol, INK, 0.8);
    ctx.restore();

    wolfLeg(-16, 1, Math.PI);
    wolfLeg(28, 1, 0);

    // ĐẦU SÓI HUỐT GIÓ / HÚ TRĂNG
    ctx.save();
    const hp = [22, -54];
    ctx.translate(hp[0], hp[1]);
    ctx.rotate(down * 0.6);
    ctx.translate(-hp[0], -hp[1]);

    ellipse(ctx, 30, -62, 14, 12, volume(ctx, 30, -62, 14, 12, bodyCol), INK, 1.8);

    // Mõm sói dài sắc cạnh
    path(ctx, 'M 34 -64 L 48 -58 L 34 -54 Z', volume(ctx, 40, -59, 10, 6, silverCol), INK, 1.2);
    ellipse(ctx, 48, -58, 2.5, 2, '#181210', null);

    // VÒNG CỔ CÓ ĐINH TÁN (Spiked Collar)
    path(ctx, 'M 18 -54 L 26 -52 L 24 -46 L 16 -48 Z', '#222224', INK, 1);
    ellipse(ctx, 22, -50, 1.8, 1.8, silverCol, null);

    // Mắt sói vàng sáng quắc
    drawEye(ctx, 30, -64, 3.5, s.blink || 0, 1, '#f2b820');

    // Tai nhọn thẳng đứng
    path(ctx, 'M 18 -68 L 22 -84 L 28 -70 Z', volume(ctx, 23, -76, 5, 8, bodyCol), INK, 1.2);
    path(ctx, 'M 20 -69 L 23 -80 L 26 -70 Z', silverCol, null);

    if (mouth > 0.1) {
      path(ctx, `M 34 -54 Q 40 ${-46 + mouth * 10} 46 -56`, '#7a2228', INK, 1.2);
    }

    ctx.restore();
    ctx.restore();
  }

  // 9. CHIBI COW (Bê con Chibi)
  function drawChibiCow(ctx, s, t) {
    const walk = s.walk || 0, stride = s.stride || 0;
    const bodyCol = '#fdfdfb';
    const patchCol = '#252220';
    const pinkCol = '#f7b6c0';

    ctx.save();
    // 4 chân ngắn mập
    for (const [lx, off] of [[-14, 0], [12, Math.PI], [-6, Math.PI], [18, 0]]) {
      const sw = -Math.sin(stride + off) * walk * 6;
      limb(ctx, [[lx, -16], [lx + sw, -2]], bodyCol, 6);
      ellipse(ctx, lx + sw + 1, -1.5, 3.5, 2, '#38322c', null);
    }

    // Thân tròn vo
    ellipse(ctx, 0, -24, 20, 16, volume(ctx, 0, -24, 20, 16, bodyCol), INK, 1.8);
    // Đốm bò sữa trên lưng
    ellipse(ctx, -8, -30, 8, 7, patchCol, null);
    ellipse(ctx, 6, -26, 6, 6, patchCol, null);

    // Đuôi nhỏ có túm lông
    line(ctx, [[-18, -26], [-26, -18]], bodyCol, 2);
    ellipse(ctx, -26, -16, 2.5, 4, patchCol, null);

    // ĐẦU TO KHỔNG LỒ CHIBI & ĐÔI MẮT LONG LANH TỎA SÁNG
    ctx.save();
    const hx = 16, hy = -42;
    ellipse(ctx, hx, hy, 18, 16, volume(ctx, hx, hy, 18, 16, bodyCol), INK, 2);

    // Đốm đen quanh mắt trái
    ellipse(ctx, hx + 8, hy - 4, 8, 8, patchCol, null);

    // Mõm hồng tròn phúng phính
    ellipse(ctx, hx + 5, hy + 6, 9, 6.5, volume(ctx, hx + 5, hy + 6, 9, 6.5, pinkCol), INK, 1.2);
    ellipse(ctx, hx + 2, hy + 6, 1.5, 2, '#8a424e', null);
    ellipse(ctx, hx + 7, hy + 6, 1.5, 2, '#8a424e', null);

    // ĐÔI MẮT ANIME TO TRÒN LONG LANH
    drawEye(ctx, hx - 3, hy - 3, 5, s.blink || 0, 1, '#1b1b1b');
    drawEye(ctx, hx + 9, hy - 3, 5, s.blink || 0, 1, '#1b1b1b');

    // Chồi sừng non nhỏ xíu vàng nhạt
    ellipse(ctx, hx - 6, hy - 17, 2, 3, '#f2dfa0', INK, 0.8, -0.3);
    ellipse(ctx, hx + 6, hy - 17, 2, 3, '#f2dfa0', INK, 0.8, 0.3);

    // Tai cụp mềm mại
    ellipse(ctx, hx - 14, hy - 8, 6, 3.5, bodyCol, INK, 0.8, -0.4);
    ellipse(ctx, hx - 14, hy - 8, 4, 2, pinkCol, null, 0, -0.4);

    // VÒNG CỔ RUY-BĂNG ĐỎ CÓ CHUÔNG VÀNG LENG KENG
    path(ctx, `M ${hx - 4} ${hy + 12} L ${hx + 8} ${hy + 12}`, null, '#d82230', 3.5);
    const bellWag = Math.sin(t * 8) * 1.5;
    ellipse(ctx, hx + 2 + bellWag, hy + 16, 3.5, 3.5, '#f4c424', INK, 0.8);

    ctx.restore();
    ctx.restore();
  }

  // 10. CARTOON SNAKE (Rắn lục hoạt hình)
  function drawCartoonSnake(ctx, s, t) {
    const walk = s.walk || 0;
    const bodyCol = s.style?.body || '#3da846';
    const bellyCol = '#e6dc5c';

    ctx.save();
    // THÂN RẮN UỐN LƯỢN SÓNG HÌNH SIN DỌC THEO MẶT ĐẤT
    const segs = 16;
    const points = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const x = -50 + u * 75;
      const wave = Math.sin(t * 5 + u * Math.PI * 3) * 6;
      const y = -6 + wave;
      points.push([x, y]);
    }

    // Vẽ thân bằng limb
    limb(ctx, points, bodyCol, 12);
    // Bụng vàng
    limb(ctx, points.map(p => [p[0], p[1] + 3]), bellyCol, 5);

    // Họa tiết đốm kim cương trên lưng
    for (let j = 2; j < segs - 2; j += 2) {
      const p = points[j];
      ellipse(ctx, p[0], p[1] - 3, 3, 2, '#206828', null);
    }

    // ĐẦU RẮN & LƯỠI CHẺ THÈ RA THỤT VÀO
    const headPt = points[segs];
    ctx.save();
    ctx.translate(headPt[0], headPt[1] - 4);

    // Đầu rắn tròn
    ellipse(ctx, 4, 0, 10, 8, volume(ctx, 4, 0, 10, 8, bodyCol), INK, 1.4);

    // Mắt to tròn hoạt hình
    drawEye(ctx, 2, -3, 3.5, s.blink || 0, 1, '#e5aa18');

    // LƯỠI ĐỎ CHẺ ĐÔI THÈ RA LIÊN HỒI
    const tongueExt = (Math.sin(t * 12) + 1) * 0.5;
    if (tongueExt > 0.2) {
      const tx = 14 + tongueExt * 10;
      path(ctx, `M 12 1 L ${tx} 1 L ${tx + 5} -3 M ${tx} 1 L ${tx + 5} 5`, null, '#d82834', 1.5);
    }

    ctx.restore();
    ctx.restore();
  }

  // 11. VULTURE (Kền kền sa mạc)
  function drawVulture(ctx, s, t) {
    const flying = Boolean(s.flying ?? false);
    const bodyCol = '#2a2624';
    const neckCol = '#d87e86'; // cổ trần hồng nhăn nheo
    const beakCol = '#e5a828';

    ctx.save();
    if (flying) {
      const flap = Math.sin(t * 10) * 0.35;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(0, -36);
        ctx.rotate(side * (0.3 + flap));
        path(ctx, `M 0 0 Q ${side * 40} -30 ${side * 76} -14 Q ${side * 40} 24 0 16 Z`, volume(ctx, side * 38, 0, 38, 20, bodyCol), INK, 1.8);
        ctx.restore();
      }
    } else {
      // Đậu co ro rụt cổ
      limb(ctx, [[-8, -14], [-8, 0]], '#3a322c', 4);
      limb(ctx, [[8, -14], [8, 0]], '#3a322c', 4);
      path(ctx, 'M -16 -36 L -24 -12 L 0 -16 Z', volume(ctx, -16, -24, 12, 14, bodyCol), INK, 1.5);
    }

    // Thân chim
    ellipse(ctx, 0, -32, 16, 18, volume(ctx, 0, -32, 16, 18, bodyCol), INK, 1.8);

    // BỜM CỔ LÔNG VŨ XÙ (Feather Ruff Collar)
    for (let i = -3; i <= 3; i++) {
      ellipse(ctx, 10 + i * 3, -42 + Math.abs(i) * 2, 4, 6, '#181514', INK, 0.8, i * 0.2);
    }

    // CỔ TRẦN NHĂN NHEO VƯƠN RA
    limb(ctx, [[10, -42], [18, -48], [24, -52]], neckCol, 6.5);

    // ĐẦU TRỐC ĐẶC TRƯNG KỀN KỀN & MỎ KHOẰM
    ctx.save();
    const hx = 26, hy = -54;
    ellipse(ctx, hx, hy, 8, 7, volume(ctx, hx, hy, 8, 7, neckCol), INK, 1.4);

    // Mỏ móc khoằm ăn xác thối
    path(ctx, `M ${hx + 4} ${hy - 3} C ${hx + 18} ${hy - 3} ${hx + 20} ${hy + 4} ${hx + 16} ${hy + 10} C ${hx + 12} ${hy + 2} ${hx + 6} ${hy + 2} ${hx + 4} ${hy + 2} Z`, volume(ctx, hx + 12, hy + 2, 8, 6, beakCol), INK, 1.4);

    // Mắt
    drawEye(ctx, hx + 2, hy - 2, 2.5, s.blink || 0, 1, '#1b1b1b');

    ctx.restore();
    ctx.restore();
  }

  // Đăng ký 11 rig Polar & Cartoon vào RemakeVector
  const rigs = {
    eagle: { group: 'animal', draw: drawEagle },
    penguin: { group: 'animal', draw: drawPenguin },
    wild_rabbit: { group: 'animal', draw: drawWildRabbit },
    capybara: { group: 'animal', draw: drawCapybara },
    cartoon_tiger: { group: 'animal', draw: drawCartoonTiger },
    cartoon_monkey: { group: 'animal', draw: drawCartoonMonkey },
    armored_bear: { group: 'animal', draw: drawArmoredBear },
    armored_wolf: { group: 'animal', draw: drawArmoredWolf },
    chibi_cow: { group: 'animal', draw: drawChibiCow },
    cartoon_snake: { group: 'animal', draw: drawCartoonSnake },
    vulture: { group: 'animal', draw: drawVulture }
  };

  register({ rigs });
})();
