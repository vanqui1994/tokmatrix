// Khung chứa hình của cảnh (ảnh AI hoặc panel dữ liệu của engine). Mỗi khung là HÌNH DẠNG + VẬT LIỆU thật khác nhau
// (polaroid, ô cửa tàu ngầm, màn CRT, cuộn giấy…), không phải cùng một hộp đổi màu. Vị trí/kích thước do composition
// của variant truyền vào (`region`). Mọi độ lệch "ngẫu nhiên" đến từ rng có seed.
import { rngRange } from "./rng.mjs";

const px = (n) => `${Math.round(n)}px`;
export function regionStyle(r, extra = "") {
  return `left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)};${extra}`;
}

// Răng cưa xé giấy tất định: đa giác clip-path theo seed.
function tornPolygon(rng, teeth = 18, depth = 2.2) {
  const pts = [];
  for (let i = 0; i <= teeth; i += 1) pts.push(`${((i / teeth) * 100).toFixed(2)}% ${rngRange(rng, 0, depth, 2)}%`);
  for (let i = teeth; i >= 0; i -= 1) pts.push(`${((i / teeth) * 100).toFixed(2)}% ${(100 - rngRange(rng, 0, depth, 2)).toFixed(2)}%`);
  return `polygon(${pts.join(",")})`;
}

const RIVETS = (n) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return `<i class="f-rivet" style="left:${(50 + 47 * Math.cos(a)).toFixed(2)}%;top:${(50 + 47 * Math.sin(a)).toFixed(2)}%"></i>`;
}).join("");

const SPROCKETS = (n) => Array.from({ length: n }, (_, i) => `<i style="top:${((i + 0.5) * (100 / n)).toFixed(2)}%"></i>`).join("");

// kind → { css (tĩnh, 1 lần), html(opts) }. opts = { id, region, inner, rng, label, sub }.
const FRAMES = {
  plain: {
    css: ".f-plain{position:absolute;box-sizing:border-box;border:10px solid var(--frame-edge,var(--panel));overflow:hidden;box-shadow:0 24px 50px rgba(0,0,0,.4)}",
    html: ({ id, region, inner, rng }) => `<div class="f-plain" id="${id}" style="${regionStyle(region, `transform:rotate(${rngRange(rng, -0.8, 0.8, 2)}deg)`)}">${inner}</div>`,
  },
  polaroid: {
    css: ".f-polaroid{position:absolute;box-sizing:border-box;background:#f7f4ec;padding:26px 26px 120px;box-shadow:0 26px 55px rgba(0,0,0,.45)}.f-polaroid .f-win{position:relative;width:100%;height:100%;overflow:hidden;background:#111}.f-polaroid .f-sub{position:absolute;left:26px;right:26px;bottom:26px;height:70px;font-size:40px;line-height:70px;color:#2a2a2a;text-align:center;white-space:nowrap;overflow:hidden}",
    html: ({ id, region, inner, rng, sub }) => `<div class="f-polaroid" id="${id}" style="${regionStyle(region, `transform:rotate(${rngRange(rng, -4, 4, 2)}deg)`)}"><div class="f-win">${inner}</div>${sub ? `<div class="f-sub">${sub}</div>` : ""}</div>`,
  },
  tape_photo: {
    css: ".f-tape{position:absolute;box-sizing:border-box;border:14px solid #fffdf6;box-shadow:0 14px 30px rgba(0,0,0,.35);background:#111}.f-tape .f-win{position:absolute;inset:0;overflow:hidden}.f-tape b{position:absolute;width:210px;height:58px;background:rgba(236,226,180,.82);box-shadow:0 2px 4px rgba(0,0,0,.15);z-index:3}.f-tape b.l{left:-60px;top:-18px;transform:rotate(-32deg)}.f-tape b.r{right:-60px;bottom:-18px;transform:rotate(-32deg)}",
    html: ({ id, region, inner, rng }) => `<div class="f-tape" id="${id}" style="${regionStyle(region, `transform:rotate(${rngRange(rng, -2.5, 2.5, 2)}deg)`)}"><div class="f-win">${inner}</div><b class="l"></b><b class="r"></b></div>`,
  },
  pinned: {
    css: ".f-pinned{position:absolute;box-sizing:border-box;border:12px solid #fbfaf5;box-shadow:0 18px 34px rgba(0,0,0,.5);background:#111}.f-pinned .f-win{position:absolute;inset:0;overflow:hidden}.f-pin{position:absolute;left:50%;top:-26px;width:44px;height:44px;margin-left:-22px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ff8a80,#c62828 60%,#7f0000);box-shadow:0 6px 8px rgba(0,0,0,.45);z-index:3}",
    html: ({ id, region, inner, rng }) => `<div class="f-pinned" id="${id}" style="${regionStyle(region, `transform:rotate(${rngRange(rng, -3, 3, 2)}deg)`)}"><div class="f-win">${inner}</div><i class="f-pin"></i></div>`,
  },
  circle: {
    css: ".f-circle{position:absolute;box-sizing:border-box;border-radius:50%;overflow:hidden;border:12px solid var(--frame-edge,var(--gold));box-shadow:0 0 0 10px rgba(0,0,0,.25),0 30px 60px rgba(0,0,0,.45);background:#111}",
    html: ({ id, region, inner }) => `<div class="f-circle" id="${id}" style="${regionStyle(region)}">${inner}</div>`,
  },
  porthole: {
    css: ".f-porthole{position:absolute;box-sizing:border-box;border-radius:50%;background:linear-gradient(145deg,#c9ccd0,#5b6066);padding:46px;box-shadow:0 30px 60px rgba(0,0,0,.6),inset 0 4px 10px rgba(255,255,255,.4)}.f-porthole .f-win{position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;box-shadow:inset 0 0 60px rgba(0,20,40,.9);background:#021018}.f-porthole .f-glass{position:absolute;inset:0;border-radius:50%;background:radial-gradient(ellipse at 30% 25%,rgba(255,255,255,.28),transparent 45%);z-index:3}.f-rivet{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#eef0f2,#6a7076);box-shadow:0 2px 3px rgba(0,0,0,.5)}",
    html: ({ id, region, inner }) => `<div class="f-porthole" id="${id}" style="${regionStyle(region)}">${RIVETS(12)}<div class="f-win">${inner}<i class="f-glass"></i></div></div>`,
  },
  scope: {
    css: ".f-scope{position:absolute;isolation:isolate;box-sizing:border-box;border-radius:50%;overflow:hidden;border:6px solid var(--scope-ink,#7dffb0);box-shadow:0 0 40px color-mix(in srgb,var(--scope-ink,#7dffb0) 40%,transparent);background:#010}.f-scope .f-ret{position:absolute;inset:0;z-index:3;background:linear-gradient(var(--scope-ink,#7dffb0),var(--scope-ink,#7dffb0)) 50% 0/2px 100% no-repeat,linear-gradient(90deg,var(--scope-ink,#7dffb0),var(--scope-ink,#7dffb0)) 0 50%/100% 2px no-repeat,repeating-radial-gradient(circle,transparent 0 118px,color-mix(in srgb,var(--scope-ink,#7dffb0) 45%,transparent) 118px 120px);opacity:.75}.f-scope .f-vig{position:absolute;inset:0;z-index:2;background:radial-gradient(circle,transparent 55%,rgba(0,0,0,.7))}",
    html: ({ id, region, inner }) => `<div class="f-scope" id="${id}" style="${regionStyle(region)}">${inner}<i class="f-vig"></i><i class="f-ret"></i></div>`,
  },
  radar: {
    css: ".f-radar{position:absolute;box-sizing:border-box;border-radius:50%;overflow:hidden;border:5px solid #53f28a;background:#031a0c;box-shadow:0 0 50px rgba(83,242,138,.35)}.f-radar .f-win{position:absolute;inset:18%;border-radius:50%;overflow:hidden;opacity:.85;filter:grayscale(.3) sepia(.4) hue-rotate(70deg)}.f-radar .f-rings{position:absolute;inset:0;background:repeating-radial-gradient(circle,transparent 0 88px,rgba(83,242,138,.4) 88px 90px),linear-gradient(#53f28a,#53f28a) 50% 0/1px 100% no-repeat,linear-gradient(90deg,#53f28a,#53f28a) 0 50%/100% 1px no-repeat}.f-radar .f-sweep{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(83,242,138,.55),rgba(83,242,138,0) 70deg,transparent 360deg)}",
    html: ({ id, region, inner }) => `<div class="f-radar" id="${id}" style="${regionStyle(region)}"><div class="f-win">${inner}</div><i class="f-rings"></i><i class="f-sweep" id="${id}-sweep"></i></div>`,
  },
  crt: {
    css: ".f-crt{position:absolute;box-sizing:border-box;border-radius:46px;background:linear-gradient(160deg,#3a3a36,#161614);padding:54px 54px 120px;box-shadow:0 30px 60px rgba(0,0,0,.6)}.f-crt .f-win{position:relative;width:100%;height:100%;border-radius:38px/48px;overflow:hidden;background:#000}.f-crt .f-scan{position:absolute;inset:0;z-index:3;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 2px,transparent 2px 5px),radial-gradient(ellipse,transparent 60%,rgba(0,0,0,.45))}.f-crt .f-knobs{position:absolute;right:70px;bottom:36px;width:170px;height:50px;background:radial-gradient(circle at 25px 25px,#777 0 18px,transparent 19px),radial-gradient(circle at 95px 25px,#777 0 18px,transparent 19px)}",
    html: ({ id, region, inner }) => `<div class="f-crt" id="${id}" style="${regionStyle(region)}"><div class="f-win">${inner}<i class="f-scan"></i></div><i class="f-knobs"></i></div>`,
  },
  phone: {
    css: ".f-phone{position:absolute;box-sizing:border-box;border-radius:70px;background:#101114;padding:26px;box-shadow:0 30px 60px rgba(0,0,0,.55),inset 0 0 0 4px #33363d}.f-phone .f-win{position:relative;width:100%;height:100%;border-radius:50px;overflow:hidden;background:#000}.f-phone .f-notch{position:absolute;left:50%;top:14px;width:180px;height:40px;margin-left:-90px;border-radius:20px;background:#101114;z-index:3}",
    html: ({ id, region, inner }) => `<div class="f-phone" id="${id}" style="${regionStyle(region)}"><div class="f-win">${inner}<i class="f-notch"></i></div></div>`,
  },
  cctv: {
    css: ".f-cctv{position:absolute;box-sizing:border-box;border:4px solid rgba(220,220,220,.55);overflow:hidden;background:#000}.f-cctv .f-win{position:absolute;inset:0;filter:grayscale(1) contrast(1.25) brightness(.9)}.f-cctv .f-osd{position:absolute;left:14px;right:14px;top:12px;z-index:3;display:flex;justify-content:space-between;font-size:30px;letter-spacing:3px;color:#f2f2f2}.f-cctv .f-osd span{background:rgba(0,0,0,.8);padding:2px 10px}.f-cctv .f-rec{color:#ff6b61}.f-cctv .f-scan{position:absolute;inset:0;z-index:2;background:repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0 1px,transparent 1px 3px)}",
    html: ({ id, region, inner, label, sub }) => `<div class="f-cctv" id="${id}" style="${regionStyle(region)}"><div class="f-win">${inner}</div><i class="f-scan"></i><div class="f-osd"><span>${label || "CAM 01"}</span><span class="f-rec">● REC ${sub || ""}</span></div></div>`,
  },
  film: {
    css: ".f-film{position:absolute;box-sizing:border-box;background:#0b0b0b;padding:0 74px;box-shadow:0 20px 40px rgba(0,0,0,.5)}.f-film .f-win{position:relative;width:100%;height:100%;overflow:hidden}.f-film .f-holes{position:absolute;top:0;bottom:0;width:74px}.f-film .f-holes.l{left:0}.f-film .f-holes.r{right:0}.f-film .f-holes i{position:absolute;left:20px;width:34px;height:46px;margin-top:-23px;border-radius:6px;background:#e9e2cf}",
    html: ({ id, region, inner }) => `<div class="f-film" id="${id}" style="${regionStyle(region)}"><div class="f-holes l">${SPROCKETS(9)}</div><div class="f-win">${inner}</div><div class="f-holes r">${SPROCKETS(9)}</div></div>`,
  },
  scroll: {
    css: ".f-scroll{position:absolute;box-sizing:border-box;padding:70px 46px;background:linear-gradient(90deg,#d9c79c,#f1e6c8 12%,#f1e6c8 88%,#d9c79c)}.f-scroll::before,.f-scroll::after{content:'';position:absolute;left:-26px;right:-26px;height:58px;border-radius:29px;background:linear-gradient(180deg,#7a4b24,#3e2410 60%,#6b3f1c)}.f-scroll::before{top:-20px}.f-scroll::after{bottom:-20px}.f-scroll .f-win{position:relative;width:100%;height:100%;overflow:hidden;box-shadow:inset 0 0 30px rgba(90,60,20,.45)}",
    html: ({ id, region, inner }) => `<div class="f-scroll" id="${id}" style="${regionStyle(region)}"><div class="f-win">${inner}</div></div>`,
  },
  card: {
    css: ".f-card{position:absolute;box-sizing:border-box;border-radius:34px;padding:30px;background:linear-gradient(160deg,var(--gold),color-mix(in srgb,var(--gold) 55%,#000));box-shadow:0 30px 60px rgba(0,0,0,.5)}.f-card .f-win{position:relative;width:100%;height:100%;border-radius:18px;overflow:hidden;border:6px solid rgba(255,255,255,.65);background:#111}.f-card .f-corner{position:absolute;width:70px;height:70px;border:6px solid rgba(255,255,255,.7);z-index:3}.f-card .f-corner.a{left:14px;top:14px;border-right:0;border-bottom:0}.f-card .f-corner.b{right:14px;bottom:14px;border-left:0;border-top:0}",
    html: ({ id, region, inner, rng }) => `<div class="f-card" id="${id}" style="${regionStyle(region, `transform:rotate(${rngRange(rng, -1.5, 1.5, 2)}deg)`)}"><div class="f-win">${inner}</div><i class="f-corner a"></i><i class="f-corner b"></i></div>`,
  },
  museum_case: {
    css: ".f-case{position:absolute;box-sizing:border-box;padding:36px;background:linear-gradient(180deg,#2b2320,#140f0d);box-shadow:0 40px 70px rgba(0,0,0,.7)}.f-case .f-win{position:relative;width:100%;height:100%;overflow:hidden;box-shadow:inset 0 0 0 3px rgba(255,255,255,.25)}.f-case .f-glass{position:absolute;inset:0;z-index:3;background:linear-gradient(115deg,rgba(255,255,255,.22) 0 8%,transparent 8% 22%,rgba(255,255,255,.1) 22% 26%,transparent 26%)}.f-case .f-spot{position:absolute;left:0;top:0;width:100%;height:70%;z-index:2;background:radial-gradient(ellipse at 50% 0,rgba(255,240,200,.35),transparent 70%)}",
    html: ({ id, region, inner }) => `<div class="f-case" id="${id}" style="${regionStyle(region)}"><div class="f-win">${inner}<i class="f-spot"></i><i class="f-glass"></i></div></div>`,
  },
  arch: {
    css: ".f-arch{position:absolute;box-sizing:border-box;border-radius:50% 50% 0 0/28% 28% 0 0;border:18px solid var(--frame-edge,var(--accent-terra-ink));overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.5);background:#111}",
    html: ({ id, region, inner }) => `<div class="f-arch" id="${id}" style="${regionStyle(region)}">${inner}</div>`,
  },
  torn: {
    css: ".f-torn{position:absolute;box-sizing:border-box;background:#f4efe2;padding:22px;filter:drop-shadow(0 16px 20px rgba(0,0,0,.4))}.f-torn .f-win{position:relative;width:100%;height:100%;overflow:hidden}",
    html: ({ id, region, inner, rng }) => `<div class="f-torn" id="${id}" style="${regionStyle(region, `clip-path:${tornPolygon(rng)};transform:rotate(${rngRange(rng, -2, 2, 2)}deg)`)}"><div class="f-win">${inner}</div></div>`,
  },
  hex: {
    css: ".f-hex{position:absolute;clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%);overflow:hidden;background:#111}.f-hex-ring{position:absolute;clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%);background:var(--frame-edge,var(--gold))}",
    html: ({ id, region, inner }) => `<div class="f-hex-ring" style="${regionStyle({ x: region.x - 14, y: region.y - 14, w: region.w + 28, h: region.h + 28 })}"></div><div class="f-hex" id="${id}" style="${regionStyle(region)}">${inner}</div>`,
  },
  letterbox: {
    css: ".f-letterbox{position:absolute;box-sizing:border-box;overflow:hidden;background:#000}.f-letterbox::before,.f-letterbox::after{content:'';position:absolute;left:0;right:0;height:9%;background:#000;z-index:3}.f-letterbox::before{top:0}.f-letterbox::after{bottom:0}",
    html: ({ id, region, inner }) => `<div class="f-letterbox" id="${id}" style="${regionStyle(region)}">${inner}</div>`,
  },
  folder: {
    css: ".f-folder{position:absolute;box-sizing:border-box;padding:70px 40px 40px;background:linear-gradient(180deg,#d8b778,#c49a55);border-radius:0 18px 18px 18px;box-shadow:0 26px 50px rgba(0,0,0,.45)}.f-folder::before{content:'';position:absolute;left:0;top:-54px;width:300px;height:56px;border-radius:18px 18px 0 0;background:#d8b778}.f-folder .f-win{position:relative;width:100%;height:100%;overflow:hidden;border:10px solid #fbfaf4;box-shadow:0 8px 18px rgba(0,0,0,.3)}.f-folder .f-clip{position:absolute;right:90px;top:30px;width:40px;height:120px;border:7px solid #9aa0a6;border-radius:20px;z-index:3}",
    html: ({ id, region, inner, rng }) => `<div class="f-folder" id="${id}" style="${regionStyle(region, `transform:rotate(${rngRange(rng, -1.2, 1.2, 2)}deg)`)}"><div class="f-win">${inner}</div><i class="f-clip"></i></div>`,
  },
  stamp: {
    css: ".f-stamp{position:absolute;box-sizing:border-box;padding:30px;background:#fbf7ee;-webkit-mask:linear-gradient(#000,#000) 13px 13px/calc(100% - 26px) calc(100% - 26px) no-repeat,radial-gradient(circle 13px at 13px 13px,transparent 12px,#000 13px) -13px -13px/40px 40px;mask:linear-gradient(#000,#000) 13px 13px/calc(100% - 26px) calc(100% - 26px) no-repeat,radial-gradient(circle 13px at 13px 13px,transparent 12px,#000 13px) -13px -13px/40px 40px}.f-stamp .f-win{position:relative;width:100%;height:100%;overflow:hidden}",
    html: ({ id, region, inner, rng }) => `<div class="f-stamp" id="${id}" style="${regionStyle(region, `transform:rotate(${rngRange(rng, -3, 3, 2)}deg)`)}"><div class="f-win">${inner}</div></div>`,
  },
  diamond: {
    css: ".f-diamond{position:absolute;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);overflow:hidden;background:#111}.f-diamond-ring{position:absolute;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);background:var(--frame-edge,var(--gold))}",
    html: ({ id, region, inner }) => `<div class="f-diamond-ring" style="${regionStyle({ x: region.x - 16, y: region.y - 16, w: region.w + 32, h: region.h + 32 })}"></div><div class="f-diamond" id="${id}" style="${regionStyle(region)}">${inner}</div>`,
  },
  lattice: {
    css: ".f-lattice{position:absolute;box-sizing:border-box;border:22px solid #5a2e1b;overflow:hidden;background:#f3ead2;box-shadow:0 30px 60px rgba(0,0,0,.5)}.f-lattice .f-win{position:absolute;inset:0;filter:sepia(.35) brightness(.9);opacity:.92}.f-lattice .f-bars{position:absolute;inset:0;z-index:3;background:repeating-linear-gradient(90deg,transparent 0 124px,#5a2e1b 124px 138px),repeating-linear-gradient(0deg,transparent 0 124px,#5a2e1b 124px 138px)}",
    html: ({ id, region, inner }) => `<div class="f-lattice" id="${id}" style="${regionStyle(region)}"><div class="f-win">${inner}</div><i class="f-bars"></i></div>`,
  },
  clipboard: {
    css: ".f-clipboard{position:absolute;box-sizing:border-box;padding:110px 34px 34px;border-radius:24px;background:linear-gradient(180deg,#a57645,#7b5431);box-shadow:0 26px 50px rgba(0,0,0,.45)}.f-clipboard .f-win{position:relative;width:100%;height:100%;overflow:hidden;background:#fff;border:8px solid #fff}.f-clipboard .f-clamp{position:absolute;left:50%;top:22px;width:260px;height:90px;margin-left:-130px;border-radius:14px;background:linear-gradient(180deg,#d7dadd,#8d9296);box-shadow:0 6px 10px rgba(0,0,0,.35)}",
    html: ({ id, region, inner }) => `<div class="f-clipboard" id="${id}" style="${regionStyle(region)}"><i class="f-clamp"></i><div class="f-win">${inner}</div></div>`,
  },
  bleed: {
    // Tràn vùng, không khung — dùng cho ảnh toàn màn (lost places, nature doc, satellite).
    css: ".f-bleed{position:absolute;overflow:hidden;background:#000}",
    html: ({ id, region, inner }) => `<div class="f-bleed" id="${id}" style="${regionStyle(region)}">${inner}</div>`,
  },
};

export const FRAME_KINDS = Object.freeze(Object.keys(FRAMES));

export function frameCss(kinds) {
  return [...new Set(kinds)].map((kind) => {
    if (!FRAMES[kind]) throw new Error(`unknown frame ${kind}`);
    return FRAMES[kind].css;
  }).join("\n");
}

export function frameHtml(kind, opts) {
  const frame = FRAMES[kind];
  if (!frame) throw new Error(`unknown frame ${kind}`);
  return frame.html(opts);
}
