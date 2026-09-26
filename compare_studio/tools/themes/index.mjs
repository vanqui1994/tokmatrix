// tools/themes/index.mjs
// Hệ thống Layout (Bảng màu chuẩn WCAG AA) và Linh vật (2D Flat Mascot)
// riêng biệt cho từng quốc gia:
//   - de (Đức):      Dachshund "Otto"      | Bauhaus Slate & Bavarian Amber Gold
//   - ko (Hàn Quốc): K-Tiger "Horangi"     | Hanbok Celadon & Royal Navy & Coral
//   - ja (Nhật Bản): Shiba Inu "Hachi"     | Torii Vermilion & Sumi Ink & Matcha
//   - vi (Việt Nam): Mèo Mun "Professor"   | Retro Warm Amber & Classic Clay Brown
//   - fr (Pháp):     Rooster "Pierre"      | Parisian Bistro Navy & Bordeaux Wine
//   - en (Mỹ/UK):    Wise Owl "Barnaby"    | Oxford Navy & Royal Amber Gold

export const THEMES = {
  // =========================================================================
  // 🇩🇪 ĐỨC (Germany) — Dachshund "Otto"
  // =========================================================================
  de: {
    code: "de",
    country: "Đức (Germany)",
    flag: "🇩🇪",
    mascotName: "Dachshund Otto",
    mascotDesc: "Chú chó xúc xích lạp xưởng thông thái đeo kính vàng bia và nơ đỏ cổ điển",
    palette: {
      "--bg": "#F5EAD6",
      "--glow-top": "rgba(212, 154, 61, 0.42)",
      "--glow-bottom": "rgba(40, 50, 56, 0.35)",
      "--panel": "#283238",
      "--panel-edge": "#D49A3D",
      "--panel-edge-dim": "rgba(212, 154, 61, 0.25)",
      "--fg": "#162024",
      "--fg-dim": "#3D4C53",
      "--fg-on-panel": "#F5EAD6",
      "--accent-terra": "#C24A3F",
      "--accent-terra-ink": "#9C2418",
      "--accent-sage": "#4A7C59",
      "--accent-sage-ink": "#255633",
      "--accent-sage-light": "#82B792",
      "--gold": "#D49A3D",
      "--fur": "#543525",
      "--fur-edge": "#3B2114",
    },
    mascotCss: `
      #avatar-host {
        position: absolute;
        top: 1280px;
        left: 330px;
        width: 420px;
        height: 520px;
        opacity: 0;
        transform-origin: 50% 100%;
      }
      #tail {
        position: absolute;
        left: 28px;
        top: 340px;
      }
      #avatar-body {
        position: absolute;
        left: 95px;
        top: 170px;
        width: 230px;
        height: 300px;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      .arm {
        position: absolute;
        top: 245px;
        width: 30px;
        height: 145px;
        border-radius: 15px;
        background: var(--fur);
        transform-origin: 50% 0%;
        will-change: transform;
      }
      #arm-left { left: 155px; }
      #arm-right { left: 235px; }
      .hand {
        position: absolute;
        bottom: -10px;
        left: -3px;
        width: 36px;
        height: 28px;
        border-radius: 18px / 14px;
        background: #3B2114;
      }
      .leg {
        position: absolute;
        top: 450px;
        width: 90px;
        height: 44px;
        border-radius: 45px / 22px;
        background: #3B2114;
      }
      #leg-left { left: 115px; }
      #leg-right { left: 215px; }
      #avatar-head {
        position: absolute;
        left: 105px;
        top: 30px;
        width: 210px;
        height: 175px;
        background: var(--fur);
        border-radius: 52% 52% 46% 46% / 56% 56% 44% 44%;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      /* Tai dài rủ của chó lạp xưởng Dachshund */
      .ear-dachshund {
        position: absolute;
        top: 22px;
        width: 52px;
        height: 145px;
        background: #3E2417;
        border-radius: 26px 26px 36px 36px / 30px 30px 60px 60px;
        transform-origin: 50% 0%;
        z-index: 1;
      }
      #ear-left { left: -18px; transform: rotate(10deg); }
      #ear-right { right: -18px; transform: rotate(-10deg); }
      /* Mõm chó lạp xưởng */
      #muzzle {
        position: absolute;
        left: 55px;
        top: 86px;
        width: 100px;
        height: 72px;
        background: #6E4531;
        border-radius: 50px / 36px;
      }
      #nose {
        position: absolute;
        left: 88px;
        top: 82px;
        width: 34px;
        height: 22px;
        border-radius: 16px 16px 12px 12px;
        background: #1C120C;
      }
      .eye {
        position: absolute;
        top: 40px;
        width: 62px;
        height: 62px;
        border-radius: 50%;
        background: var(--fg-on-panel);
      }
      #eye-left { left: 26px; }
      #eye-right { right: 26px; }
      .pupil {
        position: absolute;
        top: 60px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #1C120C;
      }
      #pupil-left { left: 56px; }
      #pupil-right { right: 56px; }
      /* Kính tròn vàng bia */
      .lens {
        position: absolute;
        top: 32px;
        width: 76px;
        height: 76px;
        border-radius: 50%;
        border: 6px solid var(--gold);
        z-index: 2;
      }
      #lens-left { left: 19px; }
      #lens-right { right: 19px; }
      #glasses-bridge {
        position: absolute;
        top: 68px;
        left: 95px;
        width: 20px;
        height: 6px;
        background: var(--gold);
        z-index: 2;
      }
      /* Nơ cổ đỏ kiểu Đức */
      #bowtie {
        position: absolute;
        left: 85px;
        top: 172px;
        width: 40px;
        height: 24px;
        background: var(--accent-terra-ink);
        clip-path: polygon(0 0, 100% 100%, 100% 0, 0 100%);
        z-index: 3;
      }
      #mouth {
        position: absolute;
        top: 136px;
        left: 93px;
        width: 24px;
        height: 10px;
        border-radius: 4px;
        background: #1C120C;
        transform-origin: 50% 50%;
      }
    `,
    mascotHtml: `
      <svg data-hf-id="hf-tail-de" id="tail" viewBox="0 0 140 140" width="110" height="110">
        <path d="M 120,120 Q 50,110 30,50" fill="none" stroke="var(--fur)" stroke-width="22" stroke-linecap="round" />
      </svg>
      <div data-hf-id="hf-lg01" class="leg" id="leg-left"></div>
      <div data-hf-id="hf-lg02" class="leg" id="leg-right"></div>
      <div data-hf-id="hf-ar01" class="arm" id="arm-left"><div data-hf-id="hf-hd01" class="hand"></div></div>
      <div data-hf-id="hf-ar02" class="arm" id="arm-right"><div data-hf-id="hf-hd02" class="hand"></div></div>
      <svg data-hf-id="hf-body-de" id="avatar-body" viewBox="0 0 230 300">
        <path d="M 60,0 L 170,0 Q 215,100 220,240 Q 220,290 115,290 Q 10,290 10,240 Q 15,100 60,0 Z" fill="var(--fur)" />
        <ellipse cx="115" cy="180" rx="55" ry="85" fill="#6E4531" opacity="0.65" />
      </svg>
      <div data-hf-id="hf-head-de" id="avatar-head">
        <div data-hf-id="hf-ear-l" class="ear-dachshund" id="ear-left"></div>
        <div data-hf-id="hf-ear-r" class="ear-dachshund" id="ear-right"></div>
        <div data-hf-id="hf-muzzle" id="muzzle"></div>
        <div data-hf-id="hf-eye-l" class="eye" id="eye-left"></div>
        <div data-hf-id="hf-eye-r" class="eye" id="eye-right"></div>
        <div data-hf-id="hf-pupil-l" class="pupil" id="pupil-left"></div>
        <div data-hf-id="hf-pupil-r" class="pupil" id="pupil-right"></div>
        <div data-hf-id="hf-lens-l" class="lens" id="lens-left"></div>
        <div data-hf-id="hf-lens-r" class="lens" id="lens-right"></div>
        <div data-hf-id="hf-bridge" id="glasses-bridge"></div>
        <div data-hf-id="hf-nose" id="nose"></div>
        <div data-hf-id="hf-mouth" id="mouth"></div>
        <div data-hf-id="hf-bowtie" id="bowtie"></div>
      </div>
    `,
  },

  // =========================================================================
  // 🇰🇷 HÀN QUỐC (Korea) — Korean Tiger "Horangi" (호랑이)
  // =========================================================================
  ko: {
    code: "ko",
    country: "Hàn Quốc (Korea)",
    flag: "🇰🇷",
    mascotName: "K-Tiger Horangi",
    mascotDesc: "Chú hổ con K-Tiger biểu tượng quốc gia Hàn Quốc với sọc vằn đen và má hồng k-style",
    palette: {
      "--bg": "#E2EFE7",
      "--glow-top": "rgba(226, 109, 92, 0.40)",
      "--glow-bottom": "rgba(31, 42, 62, 0.32)",
      "--panel": "#1F2A3E",
      "--panel-edge": "#E26D5C",
      "--panel-edge-dim": "rgba(226, 109, 92, 0.25)",
      "--fg": "#121C2B",
      "--fg-dim": "#3C4B60",
      "--fg-on-panel": "#E2EFE7",
      "--accent-terra": "#E26D5C",
      "--accent-terra-ink": "#A02B1E",
      "--accent-sage": "#4E937A",
      "--accent-sage-ink": "#205E4B",
      "--accent-sage-light": "#80CDB3",
      "--gold": "#E5A335",
      "--fur": "#D97724",
      "--fur-edge": "#964B0C",
    },
    mascotCss: `
      #avatar-host {
        position: absolute;
        top: 1280px;
        left: 330px;
        width: 420px;
        height: 520px;
        opacity: 0;
        transform-origin: 50% 100%;
      }
      #tail {
        position: absolute;
        left: 20px;
        top: 310px;
      }
      #avatar-body {
        position: absolute;
        left: 90px;
        top: 155px;
        width: 240px;
        height: 310px;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      .arm {
        position: absolute;
        top: 240px;
        width: 32px;
        height: 148px;
        border-radius: 16px;
        background: var(--fur);
        transform-origin: 50% 0%;
        will-change: transform;
      }
      #arm-left { left: 155px; }
      #arm-right { left: 235px; }
      .hand {
        position: absolute;
        bottom: -10px;
        left: -3px;
        width: 38px;
        height: 30px;
        border-radius: 19px / 15px;
        background: #F5E8D3;
      }
      .leg {
        position: absolute;
        top: 446px;
        width: 96px;
        height: 48px;
        border-radius: 48px / 24px;
        background: #221A16;
      }
      #leg-left { left: 108px; }
      #leg-right { left: 216px; }
      #avatar-head {
        position: absolute;
        left: 100px;
        top: 24px;
        width: 220px;
        height: 185px;
        background: var(--fur);
        border-radius: 50% 50% 46% 46% / 54% 54% 46% 46%;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      /* Tai tròn hổ với sọc đen */
      .ear-tiger {
        position: absolute;
        top: -24px;
        width: 58px;
        height: 58px;
        border-radius: 50%;
        background: var(--fur);
        border: 7px solid #221A16;
      }
      #ear-left { left: 12px; }
      #ear-right { right: 12px; }
      .ear-inner-tiger {
        position: absolute;
        top: 8px;
        left: 8px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #F7EAD7;
      }
      /* Vệt trán hổ vằn 王 */
      #tiger-forehead {
        position: absolute;
        top: 10px;
        left: 85px;
        width: 50px;
        height: 28px;
      }
      /* Má hồng K-Style */
      .blush {
        position: absolute;
        top: 110px;
        width: 32px;
        height: 18px;
        border-radius: 50%;
        background: #E26D5C;
        opacity: 0.55;
      }
      #blush-left { left: 18px; }
      #blush-right { right: 18px; }
      .eye {
        position: absolute;
        top: 45px;
        width: 66px;
        height: 66px;
        border-radius: 50%;
        background: var(--fg-on-panel);
      }
      #eye-left { left: 30px; }
      #eye-right { right: 30px; }
      .pupil {
        position: absolute;
        top: 66px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #221A16;
      }
      #pupil-left { left: 64px; }
      #pupil-right { right: 64px; }
      /* Kính xanh ngọc Celadon */
      .lens {
        position: absolute;
        top: 38px;
        width: 78px;
        height: 78px;
        border-radius: 50%;
        border: 6px solid var(--accent-sage);
        z-index: 2;
      }
      #lens-left { left: 24px; }
      #lens-right { right: 24px; }
      #glasses-bridge {
        position: absolute;
        top: 74px;
        left: 101px;
        width: 18px;
        height: 6px;
        background: var(--accent-sage);
        z-index: 2;
      }
      #nose {
        position: absolute;
        left: 98px;
        top: 115px;
        width: 24px;
        height: 16px;
        border-radius: 12px 12px 6px 6px;
        background: #E26D5C;
      }
      #mouth {
        position: absolute;
        top: 144px;
        left: 97px;
        width: 26px;
        height: 11px;
        border-radius: 4px;
        background: #221A16;
        transform-origin: 50% 50%;
      }
    `,
    mascotHtml: `
      <svg data-hf-id="hf-tail-ko" id="tail" viewBox="0 0 160 160" width="130" height="130">
        <path d="M 140,140 C 90,150 30,130 25,80 C 20,40 60,20 90,40" fill="none" stroke="var(--fur)" stroke-width="26" stroke-linecap="round" />
        <path d="M 80,140 L 75,130" stroke="#221A16" stroke-width="12" stroke-linecap="round" />
        <path d="M 45,115 L 40,105" stroke="#221A16" stroke-width="12" stroke-linecap="round" />
        <path d="M 32,75 L 30,65" stroke="#221A16" stroke-width="12" stroke-linecap="round" />
      </svg>
      <div data-hf-id="hf-lg01" class="leg" id="leg-left"></div>
      <div data-hf-id="hf-lg02" class="leg" id="leg-right"></div>
      <div data-hf-id="hf-ar01" class="arm" id="arm-left"><div data-hf-id="hf-hd01" class="hand"></div></div>
      <div data-hf-id="hf-ar02" class="arm" id="arm-right"><div data-hf-id="hf-hd02" class="hand"></div></div>
      <svg data-hf-id="hf-body-ko" id="avatar-body" viewBox="0 0 240 310">
        <path d="M 65,0 L 175,0 Q 225,110 230,250 Q 230,300 120,300 Q 10,300 10,250 Q 15,110 65,0 Z" fill="var(--fur)" />
        <ellipse cx="120" cy="185" rx="55" ry="90" fill="#FFF2DF" />
        <!-- Sọc vằn thân hổ -->
        <path d="M 25,180 Q 55,185 75,175" stroke="#221A16" stroke-width="10" stroke-linecap="round" fill="none" />
        <path d="M 215,180 Q 185,185 165,175" stroke="#221A16" stroke-width="10" stroke-linecap="round" fill="none" />
      </svg>
      <div data-hf-id="hf-head-ko" id="avatar-head">
        <div data-hf-id="hf-ear-l" class="ear-tiger" id="ear-left"><div class="ear-inner-tiger"></div></div>
        <div data-hf-id="hf-ear-r" class="ear-tiger" id="ear-right"><div class="ear-inner-tiger"></div></div>
        <!-- Vệt trán hổ chữ Vương (王) cách điệu -->
        <svg id="tiger-forehead" viewBox="0 0 50 28">
          <line x1="8" y1="4" x2="42" y2="4" stroke="#221A16" stroke-width="4" stroke-linecap="round" />
          <line x1="14" y1="14" x2="36" y2="14" stroke="#221A16" stroke-width="4" stroke-linecap="round" />
          <line x1="25" y1="4" x2="25" y2="24" stroke="#221A16" stroke-width="4" stroke-linecap="round" />
        </svg>
        <div data-hf-id="hf-blush-l" class="blush" id="blush-left"></div>
        <div data-hf-id="hf-blush-r" class="blush" id="blush-right"></div>
        <div data-hf-id="hf-eye-l" class="eye" id="eye-left"></div>
        <div data-hf-id="hf-eye-r" class="eye" id="eye-right"></div>
        <div data-hf-id="hf-pupil-l" class="pupil" id="pupil-left"></div>
        <div data-hf-id="hf-pupil-r" class="pupil" id="pupil-right"></div>
        <div data-hf-id="hf-lens-l" class="lens" id="lens-left"></div>
        <div data-hf-id="hf-lens-r" class="lens" id="lens-right"></div>
        <div data-hf-id="hf-bridge" id="glasses-bridge"></div>
        <div data-hf-id="hf-nose" id="nose"></div>
        <div data-hf-id="hf-mouth" id="mouth"></div>
      </div>
    `,
  },

  // =========================================================================
  // 🇯🇵 NHẬT BẢN (Japan) — Shiba Inu "Hachi" (ハチ)
  // =========================================================================
  ja: {
    code: "ja",
    country: "Nhật Bản (Japan)",
    flag: "🇯🇵",
    mascotName: "Shiba Hachi",
    mascotDesc: "Quốc khuyển Shiba Inu Nhật Bản mặt tròn, đốm mày trắng đặc trưng và khăn quàng đỏ Torii",
    palette: {
      "--bg": "#FCEBE4",
      "--glow-top": "rgba(214, 69, 49, 0.38)",
      "--glow-bottom": "rgba(91, 138, 114, 0.35)",
      "--panel": "#292423",
      "--panel-edge": "#C84B31",
      "--panel-edge-dim": "rgba(200, 75, 49, 0.25)",
      "--fg": "#1C1615",
      "--fg-dim": "#534644",
      "--fg-on-panel": "#FCEBE4",
      "--accent-terra": "#D64531",
      "--accent-terra-ink": "#A62413",
      "--accent-sage": "#5B8A72",
      "--accent-sage-ink": "#2B5842",
      "--accent-sage-light": "#8EBFA7",
      "--gold": "#D4A24C",
      "--fur": "#C97A3E",
      "--fur-edge": "#8C4C1D",
    },
    mascotCss: `
      #avatar-host {
        position: absolute;
        top: 1280px;
        left: 330px;
        width: 420px;
        height: 520px;
        opacity: 0;
        transform-origin: 50% 100%;
      }
      #tail {
        position: absolute;
        left: 24px;
        top: 310px;
      }
      #avatar-body {
        position: absolute;
        left: 90px;
        top: 160px;
        width: 240px;
        height: 300px;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      .arm {
        position: absolute;
        top: 240px;
        width: 30px;
        height: 146px;
        border-radius: 15px;
        background: var(--fur);
        transform-origin: 50% 0%;
        will-change: transform;
      }
      #arm-left { left: 155px; }
      #arm-right { left: 235px; }
      .hand {
        position: absolute;
        bottom: -10px;
        left: -3px;
        width: 36px;
        height: 28px;
        border-radius: 18px / 14px;
        background: #FFF7EE;
      }
      .leg {
        position: absolute;
        top: 448px;
        width: 94px;
        height: 46px;
        border-radius: 47px / 23px;
        background: #FFF7EE;
      }
      #leg-left { left: 110px; }
      #leg-right { left: 216px; }
      #avatar-head {
        position: absolute;
        left: 100px;
        top: 24px;
        width: 220px;
        height: 180px;
        background: var(--fur);
        border-radius: 50% 50% 46% 46% / 54% 54% 46% 46%;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      /* Tai tam giác đứng của Shiba */
      .ear-shiba {
        position: absolute;
        top: -38px;
        width: 0;
        height: 0;
        border-left: 28px solid transparent;
        border-right: 28px solid transparent;
        border-bottom: 68px solid var(--fur);
      }
      #ear-left { left: 18px; transform: rotate(-14deg); }
      #ear-right { right: 18px; transform: rotate(14deg); }
      .ear-inner-shiba {
        position: absolute;
        top: -16px;
        width: 0;
        height: 0;
        border-left: 14px solid transparent;
        border-right: 14px solid transparent;
        border-bottom: 38px solid #FFF7EE;
      }
      #ear-in-left { left: 32px; transform: rotate(-14deg); }
      #ear-in-right { right: 32px; transform: rotate(14deg); }
      /* 2 đốm mày trắng tròn đặc trưng của Shiba Inu */
      .eyebrow-spot {
        position: absolute;
        top: 20px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #FFF7EE;
      }
      #eyebrow-left { left: 46px; }
      #eyebrow-right { right: 46px; }
      /* Vùng má và mõm trắng (Urajiro) */
      #urajiro-muzzle {
        position: absolute;
        bottom: 0px;
        left: 35px;
        width: 150px;
        height: 90px;
        background: #FFF7EE;
        border-radius: 50% 50% 46% 46% / 60% 60% 40% 40%;
      }
      .eye {
        position: absolute;
        top: 46px;
        width: 62px;
        height: 62px;
        border-radius: 50%;
        background: #241F1E;
      }
      #eye-left { left: 32px; }
      #eye-right { right: 32px; }
      .pupil {
        position: absolute;
        top: 60px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #FFFFFF;
      }
      #pupil-left { left: 68px; }
      #pupil-right { right: 68px; }
      .lens {
        position: absolute;
        top: 38px;
        width: 76px;
        height: 76px;
        border-radius: 50%;
        border: 6px solid var(--accent-sage);
        z-index: 2;
      }
      #lens-left { left: 25px; }
      #lens-right { right: 25px; }
      #glasses-bridge {
        position: absolute;
        top: 74px;
        left: 102px;
        width: 16px;
        height: 6px;
        background: var(--accent-sage);
        z-index: 2;
      }
      #nose {
        position: absolute;
        left: 98px;
        top: 96px;
        width: 24px;
        height: 18px;
        border-radius: 12px 12px 8px 8px;
        background: #241F1E;
        z-index: 1;
      }
      #mouth {
        position: absolute;
        top: 130px;
        left: 98px;
        width: 24px;
        height: 10px;
        border-radius: 4px;
        background: #241F1E;
        z-index: 1;
        transform-origin: 50% 50%;
      }
      /* Khăn bandana đỏ Torii */
      #bandana {
        position: absolute;
        left: 60px;
        top: 166px;
        width: 100px;
        height: 36px;
        background: var(--accent-terra);
        clip-path: polygon(0 0, 100% 0, 50% 100%);
        z-index: 3;
      }
    `,
    mascotHtml: `
      <svg data-hf-id="hf-tail-ja" id="tail" viewBox="0 0 150 150" width="120" height="120">
        <!-- Đuôi Shiba cuộn tròn đặc trưng -->
        <path d="M 120,130 C 80,130 40,110 35,70 C 30,30 75,15 100,35 C 115,50 100,80 80,75" fill="none" stroke="var(--fur)" stroke-width="24" stroke-linecap="round" />
        <circle cx="85" cy="75" r="10" fill="#FFF7EE" />
      </svg>
      <div data-hf-id="hf-lg01" class="leg" id="leg-left"></div>
      <div data-hf-id="hf-lg02" class="leg" id="leg-right"></div>
      <div data-hf-id="hf-ar01" class="arm" id="arm-left"><div data-hf-id="hf-hd01" class="hand"></div></div>
      <div data-hf-id="hf-ar02" class="arm" id="arm-right"><div data-hf-id="hf-hd02" class="hand"></div></div>
      <svg data-hf-id="hf-body-ja" id="avatar-body" viewBox="0 0 240 300">
        <path d="M 65,0 L 175,0 Q 225,110 230,240 Q 230,290 120,290 Q 10,290 10,240 Q 15,110 65,0 Z" fill="var(--fur)" />
        <ellipse cx="120" cy="180" rx="55" ry="85" fill="#FFF7EE" />
      </svg>
      <div data-hf-id="hf-head-ja" id="avatar-head">
        <div data-hf-id="hf-ear-l" class="ear-shiba" id="ear-left"></div>
        <div data-hf-id="hf-ear-r" class="ear-shiba" id="ear-right"></div>
        <div data-hf-id="hf-ear-in-l" class="ear-inner-shiba" id="ear-in-left"></div>
        <div data-hf-id="hf-ear-in-r" class="ear-inner-shiba" id="ear-in-right"></div>
        <div data-hf-id="hf-urajiro" id="urajiro-muzzle"></div>
        <div data-hf-id="hf-eyebrow-l" class="eyebrow-spot" id="eyebrow-left"></div>
        <div data-hf-id="hf-eyebrow-r" class="eyebrow-spot" id="eyebrow-right"></div>
        <div data-hf-id="hf-eye-l" class="eye" id="eye-left"></div>
        <div data-hf-id="hf-eye-r" class="eye" id="eye-right"></div>
        <div data-hf-id="hf-pupil-l" class="pupil" id="pupil-left"></div>
        <div data-hf-id="hf-pupil-r" class="pupil" id="pupil-right"></div>
        <div data-hf-id="hf-lens-l" class="lens" id="lens-left"></div>
        <div data-hf-id="hf-lens-r" class="lens" id="lens-right"></div>
        <div data-hf-id="hf-bridge" id="glasses-bridge"></div>
        <div data-hf-id="hf-nose" id="nose"></div>
        <div data-hf-id="hf-mouth" id="mouth"></div>
        <div data-hf-id="hf-bandana" id="bandana"></div>
      </div>
    `,
  },

  // =========================================================================
  // 🇻🇳 VIỆT NAM — Giáo sư Mèo Mun (Black Cat)
  // =========================================================================
  vi: {
    code: "vi",
    country: "Việt Nam (Vietnam)",
    flag: "🇻🇳",
    mascotName: "Mèo Mun",
    mascotDesc: "Chú mèo đen thông thái đeo kính xô thơm và ria mép dài — linh vật kinh điển của series",
    palette: {
      "--bg": "#EBDCA8",
      "--glow-top": "rgba(180, 80, 47, 0.40)",
      "--glow-bottom": "rgba(62, 140, 119, 0.35)",
      "--panel": "#5A4535",
      "--panel-edge": "#D2A24C",
      "--panel-edge-dim": "rgba(210, 162, 76, 0.22)",
      "--fg": "#2C1D12",
      "--fg-dim": "#563E2D",
      "--fg-on-panel": "#EBDCA8",
      "--accent-terra": "#CC6B49",
      "--accent-terra-ink": "#8A2810",
      "--accent-sage": "#73BDA8",
      "--accent-sage-ink": "#1B5443",
      "--accent-sage-light": "#8ACBB7",
      "--gold": "#D2A24C",
      "--fur": "#4A3A2C",
      "--fur-edge": "#6F5643",
    },
    mascotCss: `
      #avatar-host {
        position: absolute;
        top: 1280px;
        left: 330px;
        width: 420px;
        height: 520px;
        opacity: 0;
        transform-origin: 50% 100%;
      }
      #tail {
        position: absolute;
        left: 32px;
        top: 315px;
      }
      #avatar-body {
        position: absolute;
        left: 90px;
        top: 148px;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      .arm {
        position: absolute;
        top: 240px;
        width: 28px;
        height: 150px;
        border-radius: 14px;
        background: var(--fur);
        transform-origin: 50% 0%;
        will-change: transform;
      }
      #arm-left { left: 160px; }
      #arm-right { left: 230px; }
      .hand {
        position: absolute;
        bottom: -10px;
        left: -3px;
        width: 34px;
        height: 28px;
        border-radius: 17px / 14px;
        background: var(--fur);
      }
      .leg {
        position: absolute;
        top: 442px;
        width: 96px;
        height: 50px;
        border-radius: 48px / 25px;
        background: var(--fur);
      }
      #leg-left { left: 108px; }
      #leg-right { left: 216px; }
      #avatar-head {
        position: absolute;
        left: 110px;
        top: 22px;
        width: 200px;
        height: 178px;
        background: var(--fur);
        border-radius: 50% 50% 46% 46% / 54% 54% 46% 46%;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      .ear {
        position: absolute;
        width: 0;
        height: 0;
        border-left: 26px solid transparent;
        border-right: 26px solid transparent;
        border-bottom: 74px solid var(--fur);
      }
      #ear-left { left: 16px; top: -46px; transform: rotate(-12deg); }
      #ear-right { left: 132px; top: -46px; transform: rotate(12deg); }
      .ear-inner {
        position: absolute;
        width: 0;
        height: 0;
        border-left: 11px solid transparent;
        border-right: 11px solid transparent;
        border-bottom: 32px solid var(--bg);
      }
      #ear-inner-left { left: 31px; top: -20px; transform: rotate(-12deg); }
      #ear-inner-right { left: 147px; top: -20px; transform: rotate(12deg); }
      .eye {
        position: absolute;
        top: 42px;
        width: 68px;
        height: 68px;
        border-radius: 50%;
        background: var(--fg-on-panel);
      }
      #eye-left { left: 20px; }
      #eye-right { left: 112px; }
      .pupil {
        position: absolute;
        top: 64px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--fur);
      }
      #pupil-left { left: 56px; }
      #pupil-right { left: 126px; }
      .lens {
        position: absolute;
        top: 36px;
        width: 80px;
        height: 80px;
        border-radius: 50%;
        border: 6px solid var(--accent-sage);
      }
      #lens-left { left: 14px; }
      #lens-right { left: 106px; }
      #glasses-bridge {
        position: absolute;
        top: 72px;
        left: 94px;
        width: 12px;
        height: 6px;
        border-radius: 3px;
        background: var(--accent-sage);
      }
      .temple {
        position: absolute;
        top: 64px;
        width: 20px;
        height: 5px;
        border-radius: 3px;
        background: var(--accent-sage);
      }
      #temple-left { left: -6px; }
      #temple-right { left: 186px; }
      #nose {
        position: absolute;
        left: 91px;
        top: 110px;
        width: 0;
        height: 0;
        border-left: 9px solid transparent;
        border-right: 9px solid transparent;
        border-top: 11px solid var(--fg-on-panel);
      }
      #mouth {
        position: absolute;
        top: 145px;
        left: 87px;
        width: 25px;
        height: 10px;
        border-radius: 3px;
        background: var(--fg-on-panel);
        transform-origin: 50% 50%;
      }
      .whisker {
        position: absolute;
        width: 70px;
        height: 4px;
        border-radius: 2px;
        background: var(--accent-sage);
        opacity: 0.5;
      }
      #whisker-l1 { right: -76px; top: 96px; transform: rotate(-10deg); }
      #whisker-l2 { right: -80px; top: 112px; }
      #whisker-l3 { right: -76px; top: 128px; transform: rotate(10deg); }
      #whisker-r1 { right: 200px; top: 96px; transform: rotate(10deg); }
      #whisker-r2 { right: 204px; top: 112px; }
      #whisker-r3 { right: 200px; top: 128px; transform: rotate(-10deg); }
    `,
    mascotHtml: `
      <svg data-hf-id="hf-tail0" id="tail" viewBox="0 0 190 190" width="150" height="150">
        <path d="M 170,152 C 104,162 36,152 26,102 C 18,60 58,34 92,50" fill="none" stroke="var(--fur)" stroke-width="26" stroke-linecap="round" />
      </svg>
      <div data-hf-id="hf-lg01" class="leg" id="leg-left"></div>
      <div data-hf-id="hf-lg02" class="leg" id="leg-right"></div>
      <div data-hf-id="hf-ar01" class="arm" id="arm-left"><div data-hf-id="hf-hd01" class="hand"></div></div>
      <div data-hf-id="hf-ar02" class="arm" id="arm-right"><div data-hf-id="hf-hd02" class="hand"></div></div>
      <svg data-hf-id="hf-body" id="avatar-body" viewBox="0 0 240 320" width="240" height="320">
        <path d="M 60,0 L 180,0 C 220,90 236,200 240,260 C 240,300 210,320 120,320 C 30,320 0,300 0,260 C 4,200 20,90 60,0 Z" fill="var(--fur)" />
      </svg>
      <div data-hf-id="hf-head" id="avatar-head">
        <div data-hf-id="hf-er01" class="ear" id="ear-left"></div>
        <div data-hf-id="hf-er02" class="ear" id="ear-right"></div>
        <div data-hf-id="hf-ei01" class="ear-inner" id="ear-inner-left"></div>
        <div data-hf-id="hf-ei02" class="ear-inner" id="ear-inner-right"></div>
        <div data-hf-id="hf-wh01" class="whisker" id="whisker-l1"></div>
        <div data-hf-id="hf-wh02" class="whisker" id="whisker-l2"></div>
        <div data-hf-id="hf-wh03" class="whisker" id="whisker-l3"></div>
        <div data-hf-id="hf-wh04" class="whisker" id="whisker-r1"></div>
        <div data-hf-id="hf-wh05" class="whisker" id="whisker-r2"></div>
        <div data-hf-id="hf-wh06" class="whisker" id="whisker-r3"></div>
        <div data-hf-id="hf-y4ty" class="eye" id="eye-left"></div>
        <div data-hf-id="hf-7vpp" class="eye" id="eye-right"></div>
        <div data-hf-id="hf-pu01" class="pupil" id="pupil-left"></div>
        <div data-hf-id="hf-pu02" class="pupil" id="pupil-right"></div>
        <div data-hf-id="hf-ln01" class="lens" id="lens-left"></div>
        <div data-hf-id="hf-ln02" class="lens" id="lens-right"></div>
        <div data-hf-id="hf-ln03" id="glasses-bridge"></div>
        <div data-hf-id="hf-ln04" class="temple" id="temple-left"></div>
        <div data-hf-id="hf-ln05" class="temple" id="temple-right"></div>
        <div data-hf-id="hf-no01" id="nose"></div>
        <div data-hf-id="hf-6l22" id="mouth"></div>
      </div>
    `,
  },

  // =========================================================================
  // 🇫🇷 PHÁP (France) — Gallic Rooster "Pierre" (Le Coq Gaulois)
  // =========================================================================
  fr: {
    code: "fr",
    country: "Pháp (France)",
    flag: "🇫🇷",
    mascotName: "Coq Pierre",
    mascotDesc: "Chú gà trống Gô-loa kiêu hãnh với mào đỏ Bordeaux và nơ cổ Bistro thanh lịch",
    palette: {
      "--bg": "#E6E9F2",
      "--glow-top": "rgba(166, 43, 43, 0.38)",
      "--glow-bottom": "rgba(30, 41, 59, 0.32)",
      "--panel": "#1E293B",
      "--panel-edge": "#C28E46",
      "--panel-edge-dim": "rgba(194, 142, 70, 0.25)",
      "--fg": "#131C2A",
      "--fg-dim": "#3C4A60",
      "--fg-on-panel": "#E6E9F2",
      "--accent-terra": "#A62B2B",
      "--accent-terra-ink": "#8F1C1C",
      "--accent-sage": "#457B9D",
      "--accent-sage-ink": "#1C4E70",
      "--accent-sage-light": "#7EB2D6",
      "--gold": "#C28E46",
      "--fur": "#23334A",
      "--fur-edge": "#141D2B",
    },
    mascotCss: `
      #avatar-host {
        position: absolute;
        top: 1280px;
        left: 330px;
        width: 420px;
        height: 520px;
        opacity: 0;
        transform-origin: 50% 100%;
      }
      #tail {
        position: absolute;
        left: 10px;
        top: 290px;
      }
      #avatar-body {
        position: absolute;
        left: 95px;
        top: 160px;
        width: 230px;
        height: 300px;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      .arm {
        position: absolute;
        top: 240px;
        width: 32px;
        height: 145px;
        border-radius: 16px;
        background: var(--fur);
        transform-origin: 50% 0%;
        will-change: transform;
      }
      #arm-left { left: 155px; }
      #arm-right { left: 235px; }
      .hand {
        position: absolute;
        bottom: -10px;
        left: -3px;
        width: 38px;
        height: 28px;
        border-radius: 19px / 14px;
        background: #141D2B;
      }
      .leg {
        position: absolute;
        top: 450px;
        width: 90px;
        height: 44px;
        border-radius: 45px / 22px;
        background: var(--gold);
      }
      #leg-left { left: 115px; }
      #leg-right { left: 215px; }
      #avatar-head {
        position: absolute;
        left: 110px;
        top: 28px;
        width: 200px;
        height: 175px;
        background: var(--fur);
        border-radius: 50% 50% 46% 46% / 54% 54% 46% 46%;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      /* Mào gà trống đỏ kiêu hãnh */
      #comb {
        position: absolute;
        top: -46px;
        left: 45px;
        width: 110px;
        height: 56px;
      }
      /* Tích gà dưới cằm */
      #wattle {
        position: absolute;
        top: 128px;
        left: 92px;
        width: 24px;
        height: 34px;
        border-radius: 12px / 17px;
        background: var(--accent-terra);
        z-index: 2;
      }
      .eye {
        position: absolute;
        top: 42px;
        width: 62px;
        height: 62px;
        border-radius: 50%;
        background: var(--fg-on-panel);
      }
      #eye-left { left: 22px; }
      #eye-right { right: 22px; }
      .pupil {
        position: absolute;
        top: 60px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #141D2B;
      }
      #pupil-left { left: 52px; }
      #pupil-right { right: 52px; }
      .lens {
        position: absolute;
        top: 34px;
        width: 76px;
        height: 76px;
        border-radius: 50%;
        border: 6px solid var(--gold);
        z-index: 2;
      }
      #lens-left { left: 15px; }
      #lens-right { right: 15px; }
      #glasses-bridge {
        position: absolute;
        top: 70px;
        left: 91px;
        width: 18px;
        height: 6px;
        background: var(--gold);
        z-index: 2;
      }
      /* Mỏ gà vàng */
      #beak {
        position: absolute;
        left: 85px;
        top: 96px;
        width: 30px;
        height: 26px;
        clip-path: polygon(0 0, 100% 0, 50% 100%);
        background: var(--gold);
        z-index: 3;
      }
      #mouth {
        position: absolute;
        top: 120px;
        left: 91px;
        width: 18px;
        height: 8px;
        border-radius: 3px;
        background: #141D2B;
        z-index: 3;
        transform-origin: 50% 50%;
      }
    `,
    mascotHtml: `
      <svg data-hf-id="hf-tail-fr" id="tail" viewBox="0 0 170 170" width="140" height="140">
        <path d="M 150,150 C 90,160 30,120 20,60 C 15,30 50,20 80,40 C 40,60 50,110 130,130 Z" fill="var(--accent-sage)" />
        <path d="M 130,150 C 80,150 40,100 50,50 C 60,30 85,30 95,50 C 75,70 80,120 130,140 Z" fill="var(--accent-terra)" />
      </svg>
      <div data-hf-id="hf-lg01" class="leg" id="leg-left"></div>
      <div data-hf-id="hf-lg02" class="leg" id="leg-right"></div>
      <div data-hf-id="hf-ar01" class="arm" id="arm-left"><div data-hf-id="hf-hd01" class="hand"></div></div>
      <div data-hf-id="hf-ar02" class="arm" id="arm-right"><div data-hf-id="hf-hd02" class="hand"></div></div>
      <svg data-hf-id="hf-body-fr" id="avatar-body" viewBox="0 0 230 300">
        <path d="M 60,0 L 170,0 Q 220,100 225,240 Q 225,290 115,290 Q 10,290 10,240 Q 15,100 60,0 Z" fill="var(--fur)" />
        <!-- Yếm cổ Pháp thanh lịch -->
        <ellipse cx="115" cy="170" rx="50" ry="75" fill="#F5EFEB" opacity="0.9" />
      </svg>
      <div data-hf-id="hf-head-fr" id="avatar-head">
        <!-- Mào gà trống 3 múi đỏ kiêu hãnh -->
        <svg id="comb" viewBox="0 0 110 56">
          <circle cx="25" cy="35" r="22" fill="var(--accent-terra)" />
          <circle cx="55" cy="24" r="24" fill="var(--accent-terra)" />
          <circle cx="85" cy="32" r="20" fill="var(--accent-terra)" />
        </svg>
        <div data-hf-id="hf-wattle" id="wattle"></div>
        <div data-hf-id="hf-eye-l" class="eye" id="eye-left"></div>
        <div data-hf-id="hf-eye-r" class="eye" id="eye-right"></div>
        <div data-hf-id="hf-pupil-l" class="pupil" id="pupil-left"></div>
        <div data-hf-id="hf-pupil-r" class="pupil" id="pupil-right"></div>
        <div data-hf-id="hf-lens-l" class="lens" id="lens-left"></div>
        <div data-hf-id="hf-lens-r" class="lens" id="lens-right"></div>
        <div data-hf-id="hf-bridge" id="glasses-bridge"></div>
        <div data-hf-id="hf-beak" id="beak"></div>
        <div data-hf-id="hf-mouth" id="mouth"></div>
      </div>
    `,
  },

  // =========================================================================
  // 🇺🇸 / 🇬🇧 MỸ / ANH / TOÀN CẦU (English) — Wise Owl "Barnaby"
  // =========================================================================
  en: {
    code: "en",
    country: "Mỹ / UK / Toàn cầu (Global)",
    flag: "🇺🇸",
    mascotName: "Owl Barnaby",
    mascotDesc: "Cú mèo giáo sư thông thái với đôi mắt tròn to, bộ lông nâu ấm và kính tri thức Oxford",
    palette: {
      "--bg": "#F6EDD3",
      "--glow-top": "rgba(212, 155, 36, 0.42)",
      "--glow-bottom": "rgba(30, 40, 56, 0.32)",
      "--panel": "#1E2838",
      "--panel-edge": "#D49B24",
      "--panel-edge-dim": "rgba(212, 155, 36, 0.25)",
      "--fg": "#141C2A",
      "--fg-dim": "#424E60",
      "--fg-on-panel": "#F6EDD3",
      "--accent-terra": "#B83A3A",
      "--accent-terra-ink": "#96241C",
      "--accent-sage": "#4A7C72",
      "--accent-sage-ink": "#245349",
      "--accent-sage-light": "#7FABA2",
      "--gold": "#D49B24",
      "--fur": "#47382B",
      "--fur-edge": "#2A1F16",
    },
    mascotCss: `
      #avatar-host {
        position: absolute;
        top: 1280px;
        left: 330px;
        width: 420px;
        height: 520px;
        opacity: 0;
        transform-origin: 50% 100%;
      }
      #tail {
        position: absolute;
        left: 45px;
        top: 360px;
      }
      #avatar-body {
        position: absolute;
        left: 85px;
        top: 150px;
        width: 250px;
        height: 310px;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      .arm {
        position: absolute;
        top: 235px;
        width: 32px;
        height: 145px;
        border-radius: 16px;
        background: var(--fur);
        transform-origin: 50% 0%;
        will-change: transform;
      }
      #arm-left { left: 155px; }
      #arm-right { left: 235px; }
      .hand {
        position: absolute;
        bottom: -10px;
        left: -3px;
        width: 38px;
        height: 28px;
        border-radius: 19px / 14px;
        background: #2A1F16;
      }
      .leg {
        position: absolute;
        top: 448px;
        width: 90px;
        height: 46px;
        border-radius: 45px / 23px;
        background: var(--gold);
      }
      #leg-left { left: 115px; }
      #leg-right { left: 215px; }
      #avatar-head {
        position: absolute;
        left: 95px;
        top: 20px;
        width: 230px;
        height: 185px;
        background: var(--fur);
        border-radius: 50% 50% 46% 46% / 54% 54% 46% 46%;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      /* Cặp tai vểnh lông vũ của cú mèo */
      .owl-tuft {
        position: absolute;
        top: -34px;
        width: 0;
        height: 0;
        border-left: 24px solid transparent;
        border-right: 24px solid transparent;
        border-bottom: 58px solid var(--fur);
      }
      #tuft-left { left: 26px; transform: rotate(-22deg); }
      #tuft-right { right: 26px; transform: rotate(22deg); }
      /* Quầng mắt tròn to của cú */
      .owl-eye-disc {
        position: absolute;
        top: 26px;
        width: 86px;
        height: 86px;
        border-radius: 50%;
        background: #614D3C;
      }
      #disc-left { left: 20px; }
      #disc-right { right: 20px; }
      .eye {
        position: absolute;
        top: 34px;
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: var(--fg-on-panel);
      }
      #eye-left { left: 28px; }
      #eye-right { right: 28px; }
      .pupil {
        position: absolute;
        top: 54px;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: #1A120B;
      }
      #pupil-left { left: 58px; }
      #pupil-right { right: 58px; }
      .lens {
        position: absolute;
        top: 28px;
        width: 82px;
        height: 82px;
        border-radius: 50%;
        border: 6px solid var(--gold);
        z-index: 2;
      }
      #lens-left { left: 22px; }
      #lens-right { right: 22px; }
      #glasses-bridge {
        position: absolute;
        top: 66px;
        left: 104px;
        width: 22px;
        height: 6px;
        background: var(--gold);
        z-index: 2;
      }
      #beak {
        position: absolute;
        left: 102px;
        top: 96px;
        width: 26px;
        height: 24px;
        clip-path: polygon(0 0, 100% 0, 50% 100%);
        background: var(--gold);
        z-index: 3;
      }
      #mouth {
        position: absolute;
        top: 122px;
        left: 105px;
        width: 20px;
        height: 8px;
        border-radius: 4px;
        background: #1A120B;
        z-index: 3;
        transform-origin: 50% 50%;
      }
    `,
    mascotHtml: `
      <svg data-hf-id="hf-tail-en" id="tail" viewBox="0 0 100 60" width="80" height="50">
        <path d="M 10,10 Q 50,55 90,10 Z" fill="#2A1F16" />
      </svg>
      <div data-hf-id="hf-lg01" class="leg" id="leg-left"></div>
      <div data-hf-id="hf-lg02" class="leg" id="leg-right"></div>
      <div data-hf-id="hf-ar01" class="arm" id="arm-left"><div data-hf-id="hf-hd01" class="hand"></div></div>
      <div data-hf-id="hf-ar02" class="arm" id="arm-right"><div data-hf-id="hf-hd02" class="hand"></div></div>
      <svg data-hf-id="hf-body-en" id="avatar-body" viewBox="0 0 250 310">
        <path d="M 65,0 L 185,0 Q 235,110 240,250 Q 240,300 125,300 Q 10,300 10,250 Q 15,110 65,0 Z" fill="var(--fur)" />
        <ellipse cx="125" cy="185" rx="60" ry="90" fill="#F3F1E8" opacity="0.9" />
        <!-- Hoa văn lông vũ ngực cú -->
        <path d="M 95,140 Q 125,160 155,140" stroke="#614D3C" stroke-width="4" stroke-linecap="round" fill="none" />
        <path d="M 90,175 Q 125,195 160,175" stroke="#614D3C" stroke-width="4" stroke-linecap="round" fill="none" />
        <path d="M 100,210 Q 125,230 150,210" stroke="#614D3C" stroke-width="4" stroke-linecap="round" fill="none" />
      </svg>
      <div data-hf-id="hf-head-en" id="avatar-head">
        <div data-hf-id="hf-tuft-l" class="owl-tuft" id="tuft-left"></div>
        <div data-hf-id="hf-tuft-r" class="owl-tuft" id="tuft-right"></div>
        <div data-hf-id="hf-disc-l" class="owl-eye-disc" id="disc-left"></div>
        <div data-hf-id="hf-disc-r" class="owl-eye-disc" id="disc-right"></div>
        <div data-hf-id="hf-eye-l" class="eye" id="eye-left"></div>
        <div data-hf-id="hf-eye-r" class="eye" id="eye-right"></div>
        <div data-hf-id="hf-pupil-l" class="pupil" id="pupil-left"></div>
        <div data-hf-id="hf-pupil-r" class="pupil" id="pupil-right"></div>
        <div data-hf-id="hf-lens-l" class="lens" id="lens-left"></div>
        <div data-hf-id="hf-lens-r" class="lens" id="lens-right"></div>
        <div data-hf-id="hf-bridge" id="glasses-bridge"></div>
        <div data-hf-id="hf-beak" id="beak"></div>
        <div data-hf-id="hf-mouth" id="mouth"></div>
      </div>
    `,
  },
};

/** Lấy cấu hình theme của quốc gia theo mã ngôn ngữ (fallback 'en' hoặc 'vi') */
export function getCountryTheme(lang = "en") {
  const code = String(lang).toLowerCase().slice(0, 2);
  return THEMES[code] || THEMES.en;
}

/** Chuyển bảng màu thành đoạn CSS string để tiêm vào :root */
export function formatPaletteCss(palette) {
  return Object.entries(palette)
    .map(([key, val]) => `        ${key}: ${val};`)
    .join("\n");
}
