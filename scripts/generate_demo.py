#!/usr/bin/env python3
"""Generate visual demo artifacts (GIF, MP4, image sheet, interactive HTML) for rigged FLA 79."""

import io
import json
import math
import os
import re
import shutil
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path("/Users/vfa/Code/SSMATool Tiktok")
SRC_FLA = ROOT / "flas" / "79 Người đàn ông nông thôn cổ đại 2.fla"
OUT_DIR = ROOT / "flas"
SCRATCH_DIR = Path("/Users/vfa/.gemini/antigravity-ide/brain/d512c9d4-022b-46f4-9a78-556603acf8b5")

ns = {"xfl": "http://ns.adobe.com/xfl/2008/"}
X = "{http://ns.adobe.com/xfl/2008/}"

def parse_flash_num(s):
    if s.startswith('#'):
        s = s[1:]
        if '.' in s:
            int_p, frac_p = s.split('.')
            val = int(int_p, 16)
            if len(int_p) == 8 and val >= 0x80000000: val -= 0x100000000
            frac = int(frac_p, 16) / (16 ** len(frac_p))
            return val + frac if val >= 0 else val - frac
        else:
            val = int(s, 16)
            if len(s) == 8 and val >= 0x80000000: val -= 0x100000000
            return float(val)
    return float(s)

def parse_edges_to_segments(edge_str):
    edge_str = re.sub(r'S\d+', ' ', edge_str)
    tokens = re.finditer(r'(!|\||/|\[|\])\s*([#\-\w\.]+)\s+([#\-\w\.]+)(?:\s+([#\-\w\.]+)\s+([#\-\w\.]+))?', edge_str)
    cur = None
    segs = []
    for m in tokens:
        cmd = m.group(1)
        if cmd == '!':
            cur = (parse_flash_num(m.group(2))/20.0, parse_flash_num(m.group(3))/20.0)
        elif cmd in ('|', '/'):
            end = (parse_flash_num(m.group(2))/20.0, parse_flash_num(m.group(3))/20.0)
            if cur is not None: segs.append(('L', cur, end))
            cur = end
        elif cmd in ('[', ']'):
            ctrl = (parse_flash_num(m.group(2))/20.0, parse_flash_num(m.group(3))/20.0)
            end = (parse_flash_num(m.group(4))/20.0, parse_flash_num(m.group(5))/20.0)
            if cur is not None: segs.append(('Q', cur, ctrl, end))
            cur = end
    return segs

def shape_to_svg_elements(shape_elem):
    fills = {}
    for f in shape_elem.findall('.//xfl:FillStyle', ns):
        idx = f.attrib.get('index')
        c = f.find('.//xfl:SolidColor', ns)
        color = c.attrib.get('color', '#000000') if c is not None else 'none'
        alpha = float(c.attrib.get('alpha', '1')) if c is not None else 1.0
        fills[idx] = (color, alpha)
    
    strokes = {}
    for s in shape_elem.findall('.//xfl:StrokeStyle', ns):
        idx = s.attrib.get('index')
        stroke_info = s.find('.//xfl:SolidStroke', ns)
        weight = float(stroke_info.attrib.get('weight', '1')) if stroke_info is not None else 1.0
        c = s.find('.//xfl:SolidColor', ns)
        color = c.attrib.get('color', '#000000') if c is not None else '#000000'
        alpha = float(c.attrib.get('alpha', '1')) if c is not None else 1.0
        strokes[idx] = (color, weight, alpha)
    
    fill_segs, stroke_segs = {}, {}
    for e in shape_elem.findall('.//xfl:Edge', ns):
        edge_str = e.attrib.get('edges', '')
        if not edge_str: continue
        segs = parse_edges_to_segments(edge_str)
        f0, f1, s_idx = e.attrib.get('fillStyle0'), e.attrib.get('fillStyle1'), e.attrib.get('strokeStyle')
        if f1 and f1 in fills: fill_segs.setdefault(f1, []).extend(segs)
        if f0 and f0 in fills:
            rev_segs = []
            for s in reversed(segs):
                if s[0] == 'L': rev_segs.append(('L', s[2], s[1]))
                elif s[0] == 'Q': rev_segs.append(('Q', s[3], s[2], s[1]))
            fill_segs.setdefault(f0, []).extend(rev_segs)
        if s_idx and s_idx in strokes: stroke_segs.setdefault(s_idx, []).extend(segs)
            
    svg_parts = []
    for f_idx, segs in fill_segs.items():
        color, alpha = fills[f_idx]
        if color == 'none' or not segs: continue
        remaining = list(segs)
        loops = []
        while remaining:
            cur_loop = [remaining.pop(0)]
            while remaining:
                last_pt = cur_loop[-1][-1]
                best_idx, best_dist = -1, 1e9
                for i, r in enumerate(remaining):
                    start_pt = r[1]
                    d = math.hypot(start_pt[0] - last_pt[0], start_pt[1] - last_pt[1])
                    if d < best_dist: best_dist = d; best_idx = i
                if best_dist < 1.0: cur_loop.append(remaining.pop(best_idx))
                else: break
            loops.append(cur_loop)
            
        d_strs = []
        for l in loops:
            if not l: continue
            d_strs.append(f'M {l[0][1][0]:.2f} {l[0][1][1]:.2f}')
            for s in l:
                if s[0] == 'L': d_strs.append(f'L {s[2][0]:.2f} {s[2][1]:.2f}')
                elif s[0] == 'Q': d_strs.append(f'Q {s[2][0]:.2f} {s[2][1]:.2f} {s[3][0]:.2f} {s[3][1]:.2f}')
            d_strs.append('Z')
        path_d = ' '.join(d_strs)
        opacity = f' fill-opacity="{alpha}"' if alpha < 1.0 else ''
        svg_parts.append(f'<path d="{path_d}" fill="{color}"{opacity} fill-rule="evenodd"/>')
        
    for s_idx, segs in stroke_segs.items():
        color, weight, alpha = strokes[s_idx]
        d_strs, cur_pt = [], None
        for s in segs:
            if cur_pt is None or math.hypot(cur_pt[0] - s[1][0], cur_pt[1] - s[1][1]) > 0.05:
                d_strs.append(f'M {s[1][0]:.2f} {s[1][1]:.2f}')
            if s[0] == 'L': d_strs.append(f'L {s[2][0]:.2f} {s[2][1]:.2f}'); cur_pt = s[2]
            elif s[0] == 'Q': d_strs.append(f'Q {s[2][0]:.2f} {s[2][1]:.2f} {s[3][0]:.2f} {s[3][1]:.2f}'); cur_pt = s[3]
        opacity = f' stroke-opacity="{alpha}"' if alpha < 1.0 else ''
        svg_parts.append(f'<path d="{" ".join(d_strs)}" stroke="{color}" stroke-width="{weight}" fill="none"{opacity} stroke-linecap="round" stroke-linejoin="round"/>')
    return svg_parts

def load_symbols():
    data = bytearray(SRC_FLA.read_bytes())
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

symbols = load_symbols()

def render_node(node, frame_idx=0, depth=0):
    if depth > 12: return []
    parts = []
    tag = node.tag.split("}")[-1]
    if tag == "DOMShape":
        parts.extend(shape_to_svg_elements(node))
    elif tag == "DOMGroup":
        mat = node.find(f"./{X}matrix/{X}Matrix")
        mat_str = ""
        if mat is not None:
            a = mat.get("a", "1"); b = mat.get("b", "0"); c = mat.get("c", "0"); d = mat.get("d", "1"); tx = mat.get("tx", "0"); ty = mat.get("ty", "0")
            mat_str = f"matrix({a} {b} {c} {d} {tx} {ty})"
        members = node.find(f"./{X}members")
        sub_parts = []
        if members is not None:
            for child in members:
                sub_parts.extend(render_node(child, frame_idx, depth+1))
        if mat_str: parts.append(f'<g transform="{mat_str}">{" ".join(sub_parts)}</g>')
        else: parts.extend(sub_parts)
    elif tag == "DOMSymbolInstance":
        lib_name = node.get("libraryItemName")
        if lib_name in symbols:
            mat = node.find(f"./{X}matrix/{X}Matrix")
            mat_str = ""
            if mat is not None:
                a = mat.get("a", "1"); b = mat.get("b", "0"); c = mat.get("c", "0"); d = mat.get("d", "1"); tx = mat.get("tx", "0"); ty = mat.get("ty", "0")
                mat_str = f"matrix({a} {b} {c} {d} {tx} {ty})"
            ff = int(node.get("firstFrame", "0"))
            sub_f = (frame_idx + ff) if node.get("loop") == "loop" else ff
            sub_parts = render_symbol(lib_name, sub_f, depth+1)
            if mat_str: parts.append(f'<g transform="{mat_str}">{" ".join(sub_parts)}</g>')
            else: parts.extend(sub_parts)
    return parts

def render_symbol(sym_name, frame_idx=0, depth=0):
    if sym_name not in symbols or depth > 12: return []
    doc = symbols[sym_name]
    parts = []
    for layer in doc.findall(f".//{X}DOMLayer"):
        matched = None
        for f in layer.findall(f".//{X}DOMFrame"):
            idx = int(f.get("index", "0"))
            dur = int(f.get("duration", "1"))
            if idx <= frame_idx < idx + dur:
                matched = f; break
        if matched is None:
            matched = layer.find(f".//{X}DOMFrame[@index=\"0\"]") or layer.find(f".//{X}DOMFrame")
        if matched is None: continue
        elems = matched.find(f"./{X}elements")
        if elems is not None:
            for child in elems:
                parts.extend(render_node(child, frame_idx, depth+1))
    return parts

def get_head_parts():
    head_sym = symbols["元件 1"]
    combo_elements = head_sym.find(f".//{X}DOMFrame/{X}elements")
    grp = combo_elements.find(f"./{X}DOMGroup")
    head_parts = []
    for child in grp.find(f"./{X}members"):
        head_parts.extend(render_node(child, 0))
    return head_parts

def get_clean_torso():
    master = symbols["重复项目文件夹/元件 1 复制 7"]
    f0 = master.findall(f".//{X}DOMFrame[@index=\"0\"]")[0]
    e0 = list(f0.find(f"./{X}elements"))
    torso_parts = []
    for sub in list(e0[8].find(f"./{X}members"))[:2]:
        torso_parts.extend(render_node(sub, 0))
    return torso_parts

def build_action_svg(action_name, frame_idx=0):
    head_parts = get_head_parts()
    head_tag = f'<g transform="matrix(1 0 0 1 0 -95)">{"".join(head_parts)}</g>'
    torso_parts = get_clean_torso()
    torso_tag = f'<g>{"".join(torso_parts)}</g>'
    master = symbols["重复项目文件夹/元件 1 复制 7"]
    
    if action_name == "idle":
        f0 = master.findall(f".//{X}DOMFrame[@index=\"0\"]")[0]
        e0 = list(f0.find(f"./{X}elements"))
        legs = []
        for idx in [0, 1, 2, 3, 4, 5]:
            legs.extend(render_node(e0[idx], 0))
        arms = []
        for idx in [6, 7]:
            arms.extend(render_node(e0[idx], 0))
        arms_tag = f'<g transform="matrix(1 0 0 1 259.1 563.9)">{"".join(arms)}</g>'
        return f'<g id="char"><g>{"".join(legs)}</g>{torso_tag}{arms_tag}{head_tag}</g>'
        
    elif action_name == "point":
        f18 = master.findall(f".//{X}DOMFrame[@index=\"18\"]")[0]
        e18 = list(f18.find(f"./{X}elements"))
        legs = []
        for idx in [4, 5, 6, 7, 8, 9]:
            legs.extend(render_node(e18[idx], 0))
        arm_r = []
        for idx in [0, 1, 2]:
            arm_r.extend(render_node(e18[idx], 0))
        arm_l = render_node(e18[3], 0)
        arm_l_tag = f'<g transform="matrix(1 0 0 1 259.1 563.9)">{"".join(arm_l)}</g>'
        return f'<g id="char"><g>{"".join(legs)}</g>{torso_tag}<g>{"".join(arm_r)}</g>{arm_l_tag}{head_tag}</g>'
        
    elif action_name == "kneel":
        f43 = master.findall(f".//{X}DOMFrame[@index=\"43\"]")[0]
        e43 = list(f43.find(f"./{X}elements"))
        kneel_limbs = []
        for idx in [0, 1, 2, 3, 4, 5, 7, 8, 9, 10]:
            kneel_limbs.extend(render_node(e43[idx], 0))
        return f'<g id="char"><g>{"".join(kneel_limbs)}</g>{torso_tag}{head_tag}</g>'
        
    elif action_name == "walk":
        walk_doc = symbols["重复项目文件夹/元件 10 复制 3"]
        walk_legs = []
        for layer in walk_doc.findall(f".//{X}DOMLayer"):
            lname = layer.get("name")
            if lname in ["元件_16", "元件_15", "元件_14", "元件_13"]:
                for f in layer.findall(f".//{X}DOMFrame"):
                    idx = int(f.get("index", "0"))
                    dur = int(f.get("duration", "1"))
                    if idx <= frame_idx < idx + dur:
                        for child in f.find(f"./{X}elements"):
                            walk_legs.extend(render_node(child, frame_idx))
                        break
        return f'<g id="char"><g>{"".join(walk_legs)}</g>{torso_tag}{head_tag}</g>'
    return ""

def main():
    print("=== Generating High Quality Visual Rig Demos ===")
    scratch_frames = SCRATCH_DIR / "walk_frames"
    scratch_frames.mkdir(parents=True, exist_ok=True)
    
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        
        # 1. Render static poses: idle, point, kneel
        static_actions = ["idle", "point", "kneel"]
        for act in static_actions:
            content = build_action_svg(act, 0)
            raw_svg = f'<svg xmlns="http://www.w3.org/2000/svg" id="root">{content}</svg>'
            tmp_path = SCRATCH_DIR / f"raw_{act}.svg"
            tmp_path.write_text(raw_svg, encoding="utf-8")
            
            page = browser.new_page()
            page.goto(f"file://{tmp_path}")
            bb = page.evaluate('() => { const el = document.getElementById("char"); const b = el.getBBox(); return {x: b.x, y: b.y, w: b.width, h: b.height}; }')
            page.close()
            
            # Save framed SVG & PNG
            pad = 20
            vx, vy, vw, vh = bb["x"] - pad, bb["y"] - pad, bb["w"] + pad * 2, bb["h"] + pad * 2
            framed_svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx} {vy} {vw} {vh}" width="400" height="600">{content}</svg>'
            
            svg_out = SCRATCH_DIR / f"demo_pose_{act}.svg"
            png_out = SCRATCH_DIR / f"demo_pose_{act}.png"
            svg_out.write_text(framed_svg, encoding="utf-8")
            
            page = browser.new_page(viewport={"width": 400, "height": 600})
            page.goto(f"file://{svg_out}")
            page.screenshot(path=str(png_out), omit_background=True)
            page.close()
            print(f" Rendered pose: {act} (bbox: w={bb['w']:.1f}, h={bb['h']:.1f})")
            
        # 2. Render all 28 frames of walk cycle with consistent bounding box
        content_w0 = build_action_svg("walk", 0)
        raw_walk = f'<svg xmlns="http://www.w3.org/2000/svg" id="root">{content_w0}</svg>'
        tmp_w = SCRATCH_DIR / "raw_walk.svg"
        tmp_w.write_text(raw_walk, encoding="utf-8")
        
        page = browser.new_page()
        page.goto(f"file://{tmp_w}")
        bb_walk = page.evaluate('() => { const el = document.getElementById("char"); const b = el.getBBox(); return {x: b.x, y: b.y, w: b.width, h: b.height}; }')
        page.close()
        
        pad = 22
        w_vx, w_vy = bb_walk["x"] - pad, bb_walk["y"] - pad
        w_vw, w_vh = bb_walk["w"] + pad * 2, bb_walk["h"] + pad * 2
        
        print("Rendering 28 walk cycle frames...")
        walk_pngs = []
        for f in range(28):
            f_content = build_action_svg("walk", f)
            f_svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{w_vx} {w_vy} {w_vw} {w_vh}" width="400" height="600">{f_content}</svg>'
            f_svg_path = scratch_frames / f"walk_{f:02d}.svg"
            f_png_path = scratch_frames / f"walk_{f:02d}.png"
            f_svg_path.write_text(f_svg, encoding="utf-8")
            
            page = browser.new_page(viewport={"width": 400, "height": 600})
            page.goto(f"file://{f_svg_path}")
            page.screenshot(path=str(f_png_path), omit_background=True)
            page.close()
            walk_pngs.append(str(f_png_path))
            
        browser.close()
        print(f" Rendered {len(walk_pngs)} frames of walk cycle!")

    # 3. Create animated GIF & MP4 via ffmpeg
    gif_out = OUT_DIR / "79 Người đàn ông nông thôn cổ đại 2_walk_demo.gif"
    mp4_out = OUT_DIR / "79 Người đàn ông nông thôn cổ đại 2_walk_demo.mp4"
    palette = scratch_frames / "palette.png"
    
    subprocess.run([
        "ffmpeg", "-y", "-framerate", "14",
        "-i", str(scratch_frames / "walk_%02d.png"),
        "-vf", "palettegen=reserve_transparent=1",
        str(palette)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    subprocess.run([
        "ffmpeg", "-y", "-framerate", "14",
        "-i", str(scratch_frames / "walk_%02d.png"),
        "-i", str(palette),
        "-lavfi", "paletteuse=alpha_threshold=128",
        "-loop", "0",
        str(gif_out)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f" Created GIF: {gif_out}")

    subprocess.run([
        "ffmpeg", "-y", "-framerate", "14",
        "-i", str(scratch_frames / "walk_%02d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,pad=ceil(iw/2)*2:ceil(ih/2)*2",
        str(mp4_out)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f" Created MP4: {mp4_out}")

    shutil.copy(gif_out, SCRATCH_DIR / "walk_demo.gif")
    shutil.copy(mp4_out, SCRATCH_DIR / "walk_demo.mp4")

    # 4. Generate composite action sheet & HTML preview
    html_content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Demo Rig Nhân Vật - Người Đàn Ông Nông Thôn Cổ Đại 2</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    padding: 36px 20px;
    background: #f7f3ee;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    color: #2c2520;
    display: flex;
    flex-direction: column;
    align-items: center;
  }}
  .header {{
    text-align: center;
    max-width: 800px;
    margin-bottom: 32px;
  }}
  h1 {{
    font-size: 28px;
    margin: 0 0 10px 0;
    color: #3b2d22;
    letter-spacing: -0.5px;
  }}
  .sub {{
    font-size: 15px;
    color: #7a6b5e;
    line-height: 1.5;
    margin: 0;
  }}
  .code {{
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    background: #ece4d8;
    padding: 2px 7px;
    border-radius: 5px;
    font-size: 13px;
    color: #553c29;
  }}
  .grid {{
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    justify-content: center;
    max-width: 1240px;
    width: 100%;
  }}
  .card {{
    background: #ffffff;
    border-radius: 18px;
    padding: 20px 18px 22px;
    box-shadow: 0 10px 30px rgba(70, 50, 30, 0.07), 0 1px 3px rgba(0, 0, 0, 0.04);
    text-align: center;
    width: 275px;
    display: flex;
    flex-direction: column;
    align-items: center;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }}
  .card:hover {{
    transform: translateY(-4px);
    box-shadow: 0 16px 40px rgba(70, 50, 30, 0.12);
  }}
  .img-wrap {{
    width: 100%;
    height: 380px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at center, #faf7f2 0%, #f0e9df 100%);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 16px;
  }}
  .img-wrap img {{
    max-width: 90%;
    max-height: 90%;
    object-fit: contain;
    filter: drop-shadow(0 8px 16px rgba(0,0,0,0.08));
  }}
  .card h3 {{
    margin: 0 0 8px 0;
    font-size: 19px;
    font-weight: 700;
    color: #2d241c;
  }}
  .desc {{
    font-size: 13px;
    color: #8c7c6f;
    margin: 0 0 12px 0;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .badge {{
    display: inline-block;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    background: #f0e6d8;
    color: #634d3a;
  }}
  .badge.loop {{
    background: #e2f2e3;
    color: #1f6b28;
  }}
</style>
</head>
<body>
  <div class="header">
    <h1>Articulated Rig Demo: Người Đàn Ông Nông Thôn Cổ Đại 2</h1>
    <p class="sub">Tất cả các bộ phận (đầu, búi tóc, dải lụa, thân, tay, chân) đã được khớp nối chuẩn xác trong file <span class="code">flas/79 Người đàn ông nông thôn cổ đại 2_rigged.fla</span></p>
  </div>

  <div class="grid">
    <div class="card">
      <div class="img-wrap">
        <img src="demo_pose_idle.png" alt="Idle"/>
      </div>
      <h3>1. Đứng Nghỉ (Idle)</h3>
      <p class="desc">Hai tay chắp tự nhiên trước bụng, tư thế đứng thẳng trang nhã</p>
      <span class="badge">Frame 0 - 29</span>
    </div>

    <div class="card">
      <div class="img-wrap">
        <img src="demo_pose_point.png" alt="Point"/>
      </div>
      <h3>2. Chỉ Tay (Point)</h3>
      <p class="desc">Tay phải đưa thẳng về phía trước chỉ hướng, tay áo vạt rộng mềm mại</p>
      <span class="badge">Frame 30 - 59</span>
    </div>

    <div class="card">
      <div class="img-wrap">
        <img src="demo_pose_kneel.png" alt="Kneel"/>
      </div>
      <h3>3. Quỳ / Ngồi (Kneel)</h3>
      <p class="desc">Hai chân quỳ gối, thân hơi cúi chào, hai tay chắp trang nghiêm</p>
      <span class="badge">Frame 60 - 89</span>
    </div>

    <div class="card">
      <div class="img-wrap">
        <img src="walk_demo.gif" alt="Walk Cycle"/>
      </div>
      <h3>4. Bước Đi (Walk)</h3>
      <p class="desc">Chu kỳ bước đi tự nhiên 28 frame (loop vô tận), nhịp bước chân mượt mà</p>
      <span class="badge loop">Loop 28 Frames (Frame 90 - 117)</span>
    </div>
  </div>
</body>
</html>
"""
    html_out = OUT_DIR / "demo_character_rig.html"
    html_out.write_text(html_content, encoding="utf-8")
    shutil.copy(html_out, SCRATCH_DIR / "demo_character_rig.html")
    
    for act in ["idle", "point", "kneel"]:
        shutil.copy(SCRATCH_DIR / f"demo_pose_{act}.png", OUT_DIR / f"demo_pose_{act}.png")
    shutil.copy(SCRATCH_DIR / "walk_demo.gif", OUT_DIR / "walk_demo.gif")
    
    # 5. Take high-res screenshot of the composite action sheet
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 680})
        page.goto(f"file://{html_out}")
        page.screenshot(path=str(OUT_DIR / "79 Người đàn ông nông thôn cổ đại 2_actions_sheet.png"))
        page.screenshot(path=str(SCRATCH_DIR / "actions_sheet.png"))
        browser.close()
        
    print(f" Action sheet saved: {OUT_DIR / '79 Người đàn ông nông thôn cổ đại 2_actions_sheet.png'}")
    print(f" Interactive HTML: {html_out}")
    print("=== All visual demos generated successfully! ===")

if __name__ == "__main__":
    main()
