#!/usr/bin/env python3
"""
Build self-contained 16:9 interactive HTML character rig players for:
- flas/76 Người đàn ông nông thôn cổ đại.fla -> flas/76_nguoi_dan_ong_nong_thon_co_dai_rig_16x9.html
- flas/79 Người đàn ông nông thôn cổ đại 2.fla -> flas/79_nguoi_dan_ong_nong_thon_co_dai_2_rig_16x9.html

Reference architecture: flas/warrior83_rig_fixed_16x9_v7.html
"""

import sys, os, io, struct, zipfile, json, base64
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.append(str(Path(__file__).parent))
from generate_demo import shape_to_svg_elements, render_node, render_symbol
import generate_demo
from html_template import generate_html

ROOT = Path("/Users/vfa/Code/SSMATool Tiktok")
FLAS_DIR = ROOT / "flas"
X = "{http://ns.adobe.com/xfl/2008/}"

def load_fla_symbols(fla_path):
    data = bytearray(Path(fla_path).read_bytes())
    eocd = data.rfind(b"PK\x05\x06")
    cd = data.find(b"PK\x01\x02")
    if eocd != -1 and cd != -1:
        struct.pack_into("<I", data, eocd + 12, eocd - cd)
    z = zipfile.ZipFile(io.BytesIO(data))
    syms = {}
    for name in z.namelist():
        if name.startswith("LIBRARY/") and name.endswith(".xml"):
            syms[name[len("LIBRARY/"):-4]] = ET.fromstring(z.read(name).decode("utf-8"))
    return syms

def extract_sprites_and_meta(browser, parts_def, char_name):
    page = browser.new_page()
    meta = {}
    src = {}
    print(f"--- Extracting {char_name} ({len(parts_def)} parts) ---")
    for name, spec in parts_def.items():
        svg_content = spec["content"]
        anchor = spec["anchor"]
        page.set_content(f'<svg xmlns="http://www.w3.org/2000/svg" id="root">{svg_content}</svg>')
        b = page.evaluate('() => { const el = document.getElementById("root"); const b = el.getBBox(); return {x: b.x, y: b.y, w: b.width, h: b.height}; }')
        x, y, w, h = b["x"], b["y"], b["w"], b["h"]
        pad = 2
        w_int = int(w + pad * 2 + 1)
        h_int = int(h + pad * 2 + 1)
        tight_svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w_int}" height="{h_int}" viewBox="{x-pad} {y-pad} {w_int} {h_int}">{svg_content}</svg>'
        page.set_content(tight_svg)
        page.set_viewport_size({"width": w_int, "height": h_int})
        png_bytes = page.locator("svg").screenshot(omit_background=True)
        im = Image.open(io.BytesIO(png_bytes))
        bbox = im.getbbox()
        if bbox:
            cropped = im.crop(bbox)
            buf = io.BytesIO()
            cropped.save(buf, format="PNG")
            b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
            actual_x = (x - pad) + bbox[0]
            actual_y = (y - pad) + bbox[1]
            size = cropped.size
        else:
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
            actual_x = x
            actual_y = y
            size = im.size
        offset = [round(actual_x - anchor[0]), round(actual_y - anchor[1])]
        meta[name] = {"anchor": anchor, "offset": offset}
        src[name] = b64
        print(f"  {name:12s}: anchor={anchor}, offset={offset}, size={size}")
    page.close()
    return meta, src

ACTIONS_CONFIG = """{
  idle:{duration:1.8, loop:true, label:'Idle', info:'Idle — chuyển động thở nhẹ, giữ nhân vật sống động tự nhiên.', phase:p=>'breathing'},
  walk:{duration:1.0, loop:true, label:'Walk', info:'Walk — đi bộ rõ nhịp điệu làng quê, tay chân đối pha, nhún hông tự nhiên.', phase:p=>p<.25?'contact':p<.5?'passing':p<.75?'contact':'passing'},
  run:{duration:.72, loop:true, label:'Run', info:'Run — chạy nhanh, người hơi ngả về trước, sải chân và tay vung dứt khoát.', phase:p=>p<.25?'push':p<.5?'flight':p<.75?'landing':'recovery'},
  point:{duration:1.3, loop:false, label:'Point', info:'Point — đưa tay phải ra phía trước chỉ hướng, thân hơi vươn tới (theo keyframe FLA gốc).', phase:p=>p<.25?'wind-up':p<.72?'pointing':'retract'},
  kneel:{duration:1.5, loop:false, label:'Kneel', info:'Kneel — quỳ gối kính cẩn chào lễ phép, hai tay chắp trước ngực (theo keyframe FLA gốc).', phase:p=>p<.28?'kneeling':p<.72?'bowing':'rising'},
  wave:{duration:1.2, loop:true, label:'Wave', info:'Wave — tay phải giơ cao vẫy chào thân thiện 2 nhịp rõ ràng.', phase:p=>p<.5?'wave left':'wave right'},
  work:{duration:1.2, loop:false, label:'Work', info:'Work — động tác bổ cuốc / làm nông: vung cao lấy đà rồi giáng mạnh xuống đất.', phase:p=>p<.3?'raise':p<.65?'strike':'lift'},
  manual:{duration:1, loop:false, label:'Manual', info:'Manual — bạn tự điều khiển từng bone bằng slider.', phase:p=>'manual pose'}
}"""

POSE_CODE = """function pose(phase){
  const p={...manual,rootX:0,rootY:0,rootTilt:0};
  if(mode==='manual') return p;
  if(mode==='idle'){
    const s=Math.sin(phase*Math.PI*2), c=Math.cos(phase*Math.PI*2);
    p.head += s*1.5; p.torso += s*1.2; p.rootY = s*2;
    p.uArmL += -6 + c*2; p.fArmL += 8 + s*2;
    p.uArmR += 6 - c*2; p.fArmR += -8 - s*2;
    p.handL += c*1.2; p.handR += -c*1.2;
    p.thighL += s*1.2; p.thighR -= s*1.2;
    p.shinL += c*.8; p.shinR -= c*.8;
  }else if(mode==='walk'){
    const s=Math.sin(phase*Math.PI*2), c=Math.cos(phase*Math.PI*2);
    p.rootY = Math.abs(s)*5.5; p.torso += -s*2.8; p.head += -Math.sin(phase*Math.PI*4)*.8;
    p.uArmL += -8 + s*22; p.fArmL += 10 + Math.max(0,-s)*12; p.handL += Math.max(0,-s)*4;
    p.uArmR += 8 - s*22; p.fArmR += -10 + Math.max(0,s)*12; p.handR += -Math.max(0,s)*4;
    p.thighL += 18 - s*25; p.shinL += Math.max(0,c)*24; p.footL += -Math.max(0,c)*10 + Math.max(0,-s)*4;
    p.thighR += -18 + s*25; p.shinR += Math.max(0,-c)*24; p.footR += -Math.max(0,-c)*10 + Math.max(0,s)*4;
  }else if(mode==='run'){
    const s=Math.sin(phase*Math.PI*2), c=Math.cos(phase*Math.PI*2);
    const flight=smoothstep(.18,.34,phase)-smoothstep(.56,.72,phase);
    p.rootTilt = -8; p.torso += -7 - s*2.5; p.head += 1.8 - s*1.2;
    p.rootY = Math.abs(s)*9 + flight*10;
    p.uArmL += -30 + s*38; p.fArmL += 28 + Math.max(0,-s)*18; p.handL += Math.max(0,-s)*6;
    p.uArmR += 30 - s*38; p.fArmR += -28 + Math.max(0,s)*18; p.handR += -Math.max(0,s)*6;
    p.thighL += 28 - s*40; p.shinL += Math.max(0,c)*34 + flight*6; p.footL += -Math.max(0,c)*13;
    p.thighR += -28 + s*40; p.shinR += Math.max(0,-c)*34 + flight*6; p.footR += -Math.max(0,-c)*13;
  }else if(mode==='point'){
    if(phase<.25){
      const k=ease(phase/.25);
      p.rootTilt += -k*4; p.torso += k*6; p.head += -k*3;
      p.uArmR += -k*80; p.fArmR += k*5; p.handR += 0;
      p.uArmL += -k*15; p.fArmL += k*18;
      p.thighL += k*6; p.shinL += k*6; p.thighR += -k*4;
    }else if(phase<.72){
      const k=Math.sin((phase-.25)/.47*Math.PI);
      p.rootTilt += -4; p.torso += 6; p.head += -3 + k*1.5;
      p.uArmR += -80 - k*3; p.fArmR += 5 + k*2; p.handR += 0;
      p.uArmL += -15; p.fArmL += 18;
      p.thighL += 6; p.shinL += 6; p.thighR += -4;
    }else{
      const k=ease((phase-.72)/.28);
      p.rootTilt += -4*(1-k); p.torso += 6*(1-k); p.head += -3*(1-k);
      p.uArmR += -80*(1-k); p.fArmR += 5*(1-k); p.handR += 0;
      p.uArmL += -15*(1-k); p.fArmL += 18*(1-k);
      p.thighL += 6*(1-k); p.shinL += 6*(1-k); p.thighR += -4*(1-k);
    }
  }else if(mode==='kneel'){
    if(phase<.28){
      const k=ease(phase/.28);
      p.rootX += k*12; p.rootY += k*105; p.rootTilt += k*4; p.torso += k*14; p.head += -k*8;
      p.thighL += -k*65; p.shinL += k*85; p.footL += -k*20;
      p.thighR += -k*60; p.shinR += k*85; p.footR += -k*25;
      p.uArmL += -k*35; p.fArmL += k*55; p.handL += k*10;
      p.uArmR += -k*40; p.fArmR += k*60; p.handR += -k*10;
    }else if(phase<.72){
      const k=Math.sin((phase-.28)/.44*Math.PI);
      p.rootX += 12; p.rootY += 105 + k*1.5; p.rootTilt += 4; p.torso += 14 + k*2; p.head += -8 - k*2;
      p.thighL += -65; p.shinL += 85; p.footL += -20;
      p.thighR += -60; p.shinR += 85; p.footR += -25;
      p.uArmL += -35; p.fArmL += 55; p.handL += 10;
      p.uArmR += -40; p.fArmR += 60; p.handR += -10;
    }else{
      const k=ease((phase-.72)/.28);
      p.rootX += 12*(1-k); p.rootY += 105*(1-k); p.rootTilt += 4*(1-k); p.torso += 14*(1-k); p.head += -8*(1-k);
      p.thighL += -65*(1-k); p.shinL += 85*(1-k); p.footL += -20*(1-k);
      p.thighR += -60*(1-k); p.shinR += 85*(1-k); p.footR += -25*(1-k);
      p.uArmL += -35*(1-k); p.fArmL += 55*(1-k); p.handL += 10*(1-k);
      p.uArmR += -40*(1-k); p.fArmR += 60*(1-k); p.handR += -10*(1-k);
    }
  }else if(mode==='wave'){
    const w=Math.sin(phase*Math.PI*4), bob=Math.sin(phase*Math.PI*2);
    p.rootY = bob*1.5; p.head += -4 + bob*1.2; p.torso += -2.5;
    p.uArmL += -10; p.fArmL += 8;
    p.uArmR += -140; p.fArmR += 22 + w*20; p.handR += 10 + w*15;
  }else if(mode==='work'){
    if(phase<.30){
      const k=ease(phase/.30);
      p.rootTilt += -k*8; p.rootY += -k*6; p.torso += -k*12; p.head += k*4;
      p.uArmR += -k*100; p.fArmR += k*35;
      p.uArmL += -k*85; p.fArmL += k*30;
      p.thighL += k*10; p.shinL += k*8; p.thighR += -k*8;
    }else if(phase<.65){
      const k=ease((phase-.30)/.35);
      p.rootTilt += -8 + k*20; p.rootY += -6 + k*14; p.torso += -12 + k*34; p.head += 4 - k*12;
      p.uArmR += -100 + k*85; p.fArmR += 35 + k*10;
      p.uArmL += -85 + k*65; p.fArmL += 30 + k*8;
      p.thighL += 10 + k*12; p.shinL += 8 + k*12; p.thighR += -8 + k*18;
    }else{
      const k=ease((phase-.65)/.35);
      p.rootTilt += 12*(1-k); p.rootY += 8*(1-k); p.torso += 22*(1-k); p.head += -8*(1-k);
      p.uArmR += -15*(1-k); p.fArmR += 45*(1-k);
      p.uArmL += -20*(1-k); p.fArmL += 38*(1-k);
      p.thighL += 22*(1-k); p.shinL += 20*(1-k); p.thighR += 10*(1-k);
    }
  }
  return p;
}"""

def generate_character_76(browser):
    fla_path = FLAS_DIR / "76 Người đàn ông nông thôn cổ đại.fla"
    generate_demo.symbols = load_fla_symbols(fla_path)
    master = generate_demo.symbols["重复项目文件夹/元件 2 复制 10"]
    f19 = master.findall(f".//{X}DOMFrame[@index=\"19\"]")[0]
    e19 = list(f19.find(f"./{X}elements"))

    f45 = master.findall(f".//{X}DOMFrame[@index=\"45\"]")[0]
    groups = f45.findall(f"./{X}elements/{X}DOMGroup")

    head_combo = generate_demo.symbols["元件 1"]
    head_grp = head_combo.find(f".//{X}DOMFrame/{X}elements/{X}DOMGroup")

    pelvis_svg = '<ellipse cx="96" cy="170" rx="36" ry="14" fill="#2E4239" stroke="#1F2D27" stroke-width="1.5"/>'

    parts_def = {
        "head": {
            "content": f'<g transform="matrix(1.8557 0 0 1.8557 -470 262)">{" ".join(render_node(head_grp))}</g>',
            "anchor": [96, 0]
        },
        "torso": {
            "content": " ".join(render_node(e19[10])),
            "anchor": [96, 170]
        },
        "pelvis": {
            "content": pelvis_svg,
            "anchor": [96, 170]
        },
        "upperArmL": {
            "content": " ".join(render_node(groups[5])),
            "anchor": [26, 40]
        },
        "foreArmL": {
            "content": " ".join(render_node(groups[10])),
            "anchor": [38, 120]
        },
        "handL": {
            "content": " ".join(render_node(groups[9])),
            "anchor": [78, 160]
        },
        "upperArmR": {
            "content": f'<g transform="translate(192 0) scale(-1 1)">{" ".join(render_node(groups[5]))}</g>',
            "anchor": [166, 40]
        },
        "foreArmR": {
            "content": f'<g transform="translate(192 0) scale(-1 1)">{" ".join(render_node(groups[10]))}</g>',
            "anchor": [154, 120]
        },
        "handR": {
            "content": f'<g transform="translate(192 0) scale(-1 1)">{" ".join(render_node(groups[9]))}</g>',
            "anchor": [114, 160]
        },
        "thighL": {
            "content": " ".join(render_node(e19[7])),
            "anchor": [48, 150]
        },
        "shinL": {
            "content": " ".join(render_node(e19[9])),
            "anchor": [48, 240]
        },
        "footL": {
            "content": " ".join(render_node(e19[8])),
            "anchor": [52, 290]
        },
        "thighR": {
            "content": " ".join(render_node(e19[4])),
            "anchor": [104, 150]
        },
        "shinR": {
            "content": " ".join(render_node(e19[6])),
            "anchor": [105, 240]
        },
        "footR": {
            "content": " ".join(render_node(e19[5])),
            "anchor": [112, 290]
        },
    }

    meta, src = extract_sprites_and_meta(browser, parts_def, "76 Người đàn ông nông thôn cổ đại")
    out_file = FLAS_DIR / "76_nguoi_dan_ong_nong_thon_co_dai_rig_16x9.html"
    generate_html(
        title="Người Đàn Ông Nông Thôn Cổ Đại 1 — Rig Fixed 16:9",
        desc_html="Bản rig 2.5D trích xuất từ <code>flas/76 Người đàn ông nông thôn cổ đại.fla</code>, chuẩn 16:9 mobile-safe canvas, đầy đủ các tư thế Idle, Walk, Run, Point, Kneel, Wave, Work và Manual bone sliders.",
        meta=meta,
        src=src,
        skin_color="#E0D9C9",
        robe_color="#2E4239",
        pants_color="#4E414B",
        actions_config=ACTIONS_CONFIG,
        pose_code=POSE_CODE,
        output_path=out_file,
        default_scale=1.35,
        default_root_y=398,
        shadow_y=624
    )

def generate_character_79(browser):
    fla_path = FLAS_DIR / "79 Người đàn ông nông thôn cổ đại 2.fla"
    generate_demo.symbols = load_fla_symbols(fla_path)
    master = generate_demo.symbols["重复项目文件夹/元件 1 复制 7"]
    f0 = master.findall(f".//{X}DOMFrame[@index=\"0\"]")[0]
    e0 = list(f0.find(f"./{X}elements"))

    head_combo = generate_demo.symbols["元件 1"]
    head_grp = head_combo.find(f".//{X}DOMFrame/{X}elements/{X}DOMGroup")
    svg_head_parts = [render_node(m) for m in head_grp.find(f"./{X}members")]
    flat_head = [item for sub in svg_head_parts for item in sub]

    arm_l_members = list(e0[6].find(f"./{X}members"))
    arm_r_members = list(e0[7].find(f"./{X}members"))
    torso_members = list(e0[8].find(f"./{X}members"))

    parts_def = {
        "head": {
            "content": f'<g transform="matrix(1 0 0 1 0 -95)">{" ".join(flat_head)}</g>',
            "anchor": [73, 52]
        },
        "torso": {
            "content": " ".join(render_node(torso_members[0])),
            "anchor": [76, 128]
        },
        "pelvis": {
            "content": " ".join(render_node(torso_members[1])),
            "anchor": [76, 128]
        },
        "upperArmL": {
            "content": " ".join(render_node(arm_l_members[1])),
            "anchor": [22, 35]
        },
        "foreArmL": {
            "content": " ".join(render_node(arm_l_members[2])),
            "anchor": [22, 115]
        },
        "handL": {
            "content": " ".join(render_node(arm_l_members[0])),
            "anchor": [48, 160]
        },
        "upperArmR": {
            "content": " ".join(render_node(arm_r_members[0])),
            "anchor": [132, 35]
        },
        "foreArmR": {
            "content": " ".join(render_node(arm_r_members[2])),
            "anchor": [128, 110]
        },
        "handR": {
            "content": " ".join(render_node(arm_r_members[1])),
            "anchor": [98, 145]
        },
        "thighL": {
            "content": " ".join(render_node(e0[3])),
            "anchor": [48, 148]
        },
        "shinL": {
            "content": " ".join(render_node(e0[5])),
            "anchor": [48, 235]
        },
        "footL": {
            "content": " ".join(render_node(e0[4])),
            "anchor": [52, 285]
        },
        "thighR": {
            "content": " ".join(render_node(e0[0])),
            "anchor": [104, 145]
        },
        "shinR": {
            "content": " ".join(render_node(e0[2])),
            "anchor": [105, 235]
        },
        "footR": {
            "content": " ".join(render_node(e0[1])),
            "anchor": [112, 285]
        },
    }

    meta, src = extract_sprites_and_meta(browser, parts_def, "79 Người đàn ông nông thôn cổ đại 2")
    out_file = FLAS_DIR / "79_nguoi_dan_ong_nong_thon_co_dai_2_rig_16x9.html"
    generate_html(
        title="Người Đàn Ông Nông Thôn Cổ Đại 2 — Rig Fixed 16:9",
        desc_html="Bản rig 2.5D trích xuất từ <code>flas/79 Người đàn ông nông thôn cổ đại 2.fla</code>, chuẩn 16:9 mobile-safe canvas, đầy đủ các tư thế Idle, Walk, Run, Point, Kneel, Wave, Work và Manual bone sliders.",
        meta=meta,
        src=src,
        skin_color="#FEF4ED",
        robe_color="#2E4239",
        pants_color="#5C4832",
        actions_config=ACTIONS_CONFIG,
        pose_code=POSE_CODE,
        output_path=out_file,
        default_scale=1.45,
        default_root_y=335,
        shadow_y=624
    )

def main():
    print("=== Building Rig Players ===")
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        generate_character_76(browser)
        generate_character_79(browser)
        browser.close()
    print("=== All Rig Players Generated Successfully! ===")

if __name__ == "__main__":
    main()
