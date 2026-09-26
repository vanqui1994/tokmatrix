#!/usr/bin/env python3
"""
Slices and extracts character parts and face expressions from crawled assets
to create complete 2D animation rigs for 'Hoạt hình điêu khắc cát' / 'Gấu hài hước'.
"""

import json
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter

BASE_DIR = Path("/Users/vfa/Code/SSMATool Tiktok/crawled_vatlieuhoathinh")
RIG_DIR = BASE_DIR / "rig_assets"
FACES_DIR = RIG_DIR / "faces"
BODIES_DIR = RIG_DIR / "bodies"
HATS_DIR = RIG_DIR / "hats"
PROPS_DIR = RIG_DIR / "props"

for d in (FACES_DIR, BODIES_DIR, HATS_DIR, PROPS_DIR):
    d.mkdir(parents=True, exist_ok=True)

def remove_dark_bg_for_face(im: Image.Image) -> Image.Image:
    """Extract white/bright meme face on dark background to transparent PNG with black ink details."""
    im = im.convert("RGBA")
    data = im.getdata()
    new_data = []
    for r, g, b, a in data:
        # Dark background in the expression sheets is roughly (20-40, 20-40, 20-40)
        brightness = (r + g + b) / 3
        if brightness < 60:
            new_data.append((0, 0, 0, 0)) # transparent
        else:
            # Keep face color (white/pink/grayscale)
            new_data.append((r, g, b, 255))
    im.putdata(new_data)
    # Crop to non-transparent bounding box
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    return im

def slice_expression_sheet(sheet_path: Path, rows: int, cols: int, prefix: str) -> list[str]:
    saved = []
    if not sheet_path.exists():
        return saved
    im = Image.open(sheet_path).convert("RGBA")
    w, h = im.size
    cell_w = w // cols
    cell_h = h // rows
    
    idx = 1
    for r in range(rows):
        for c in range(cols):
            x0 = c * cell_w
            y0 = r * cell_h
            # Cut off bottom 22% of cell which contains the chinese filename label text
            face_box = (x0 + 4, y0 + 4, x0 + cell_w - 4, y0 + int(cell_h * 0.78))
            cell_im = im.crop(face_box)
            face_clean = remove_dark_bg_for_face(cell_im)
            
            # If the cell actually has face content
            if face_clean.width > 20 and face_clean.height > 20:
                face_clean.thumbnail((180, 180), Image.Resampling.LANCZOS)
                out_name = f"{prefix}_{idx:02d}.png"
                out_path = FACES_DIR / out_name
                face_clean.save(out_path, "PNG")
                saved.append(out_name)
                idx += 1
    return saved

def extract_bo_character_parts():
    """Extract Bo (Gấu Hài Hước) parts from image_01.png"""
    bo_img_path = BASE_DIR / "nhan-vat/-moho-bo-nhan-vat-hoat-hinh-gau-hai-huoc/image_01.png"
    if not bo_img_path.exists():
        return
    
    im = Image.open(bo_img_path).convert("RGBA")
    w, h = im.size
    
    # Remove light grey gradient background
    # Background has r > 200, g > 200, b > 200 and r ≈ g ≈ b
    pixels = im.load()
    mask = Image.new("L", (w, h), 0)
    mask_pixels = mask.load()
    
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # Background is light grey (#d8d8d8 - #e5e5e5)
            if r > 200 and g > 200 and b > 200 and abs(r - g) < 10 and abs(g - b) < 10:
                mask_pixels[x, y] = 0
            else:
                mask_pixels[x, y] = 255
                
    im.putalpha(mask)
    
    # 1. Full Bo Rig Body
    bo_full = im.crop(im.getbbox())
    bo_full.save(BODIES_DIR / "bo_panda_full.png", "PNG")
    
    # 2. Extract Head (top region: y: 100 -> 450)
    head_box = (int(w * 0.05), int(h * 0.12), int(w * 0.95), int(h * 0.52))
    head_im = im.crop(head_box)
    head_bbox = head_im.getbbox()
    if head_bbox:
        head_im = head_im.crop(head_bbox)
    head_im.save(BODIES_DIR / "bo_panda_head.png", "PNG")
    
    # 3. Extract Torso + Legs (y: 430 -> 750)
    body_box = (int(w * 0.10), int(h * 0.45), int(w * 0.90), int(h * 0.92))
    body_im = im.crop(body_box)
    body_bbox = body_im.getbbox()
    if body_bbox:
        body_im = body_im.crop(body_bbox)
    body_im.save(BODIES_DIR / "bo_panda_torso.png", "PNG")

def extract_ha_nhan_parts():
    """Extract Ha Nhan (Ancient robe character) parts from image_04.png"""
    ha_path = BASE_DIR / "nhan-vat/nhan-vat-ha-nhan-hoat-hinh-dieu-khac-cat/image_04.png"
    if not ha_path.exists():
        return
    im = Image.open(ha_path).convert("RGBA")
    
    # Remove pure white background
    data = im.getdata()
    new_data = []
    for r, g, b, a in data:
        if r > 245 and g > 245 and b > 245:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append((r, g, b, a))
    im.putdata(new_data)
    
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
        
    w, h = im.size
    im.save(BODIES_DIR / "ha_nhan_full.png", "PNG")
    
    # Head with hat
    head_box = (0, 0, w, int(h * 0.40))
    head_im = im.crop(head_box)
    head_bbox = head_im.getbbox()
    if head_bbox:
        head_im = head_im.crop(head_bbox)
    head_im.save(BODIES_DIR / "ha_nhan_head.png", "PNG")
    
    # Robe / Torso
    robe_box = (0, int(h * 0.38), w, h)
    robe_im = im.crop(robe_box)
    robe_bbox = robe_im.getbbox()
    if robe_bbox:
        robe_im = robe_im.crop(robe_bbox)
    robe_im.save(BODIES_DIR / "ha_nhan_robe.png", "PNG")

def extract_gau_vang_parts():
    """Extract Gau Vang (Yellow hoodie character) parts from image_01.png"""
    gv_path = BASE_DIR / "nhan-vat/cu-gau-vang/image_01.png"
    if not gv_path.exists():
        return
    im = Image.open(gv_path).convert("RGBA")
    w, h = im.size
    
    # Remove background (green chalkboard at top, beige wall, brown floor)
    # Character has dark borders (r,g,b < 60), yellow shirt (r>200, g>180, b<50), white head, black pants
    # A floodfill from corners or color segmentation:
    pixels = im.load()
    mask = Image.new("L", (w, h), 0)
    m_pixels = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # Blackboard at top: green r<80, g>100, b>60
            is_green_board = (r < 100 and g > 90 and b < 100)
            # Wall: beige/sage green
            is_wall = (r > 150 and g > 170 and b > 120 and abs(r - b) < 60)
            # Floor: brown r>80, g<70, b<60
            is_floor = (r > 60 and g > 40 and b < 50 and abs(r - g) > 20)
            
            if is_green_board or is_wall or is_floor:
                m_pixels[x, y] = 0
            else:
                m_pixels[x, y] = 255
                
    im.putalpha(mask)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.save(BODIES_DIR / "gau_vang_full.png", "PNG")

def build_rig_schema():
    """Generate rig_data.json connecting bones, anchors, skins, and animations."""
    faces = sorted([f.name for f in FACES_DIR.glob("*.png")])
    bodies = sorted([b.name for b in BODIES_DIR.glob("*.png")])
    
    rig_data = {
        "name": "HoatHinhDieuKhacCat_Rig",
        "version": "1.0.0",
        "description": "Standard 2D skeletal rig for Hoạt hình điêu khắc cát / Gấu hài hước",
        "default_scale": 1.0,
        "canvas_size": [1080, 1920],
        "root_anchor": [0, 0],
        
        # Bone hierarchy & default bind pose
        "bones": [
            {"id": "root", "parent": None, "x": 0, "y": 0, "length": 0, "color": "#00ffcc"},
            {"id": "pelvis", "parent": "root", "x": 0, "y": -45, "length": 25, "color": "#0099ff"},
            {"id": "spine", "parent": "pelvis", "x": 0, "y": -70, "length": 35, "color": "#ff3366"},
            {"id": "neck", "parent": "spine", "x": 0, "y": -95, "length": 15, "color": "#ff9933"},
            {"id": "head", "parent": "neck", "x": 0, "y": -120, "length": 40, "color": "#ffff00"},
            
            # Left Arm (viewer's left = character's right or anatomical left)
            {"id": "shoulder_l", "parent": "spine", "x": -26, "y": -80, "length": 22, "color": "#33cc33"},
            {"id": "elbow_l", "parent": "shoulder_l", "x": -42, "y": -58, "length": 20, "color": "#33cc33"},
            {"id": "hand_l", "parent": "elbow_l", "x": -45, "y": -38, "length": 12, "color": "#66ff66"},
            
            # Right Arm
            {"id": "shoulder_r", "parent": "spine", "x": 26, "y": -80, "length": 22, "color": "#33cc33"},
            {"id": "elbow_r", "parent": "shoulder_r", "x": 42, "y": -58, "length": 20, "color": "#33cc33"},
            {"id": "hand_r", "parent": "elbow_r", "x": 45, "y": -38, "length": 12, "color": "#66ff66"},
            
            # Left Leg
            {"id": "hip_l", "parent": "pelvis", "x": -16, "y": -42, "length": 24, "color": "#9933ff"},
            {"id": "knee_l", "parent": "hip_l", "x": -20, "y": -20, "length": 20, "color": "#9933ff"},
            {"id": "foot_l", "parent": "knee_l", "x": -22, "y": -2, "length": 10, "color": "#cc66ff"},
            
            # Right Leg
            {"id": "hip_r", "parent": "pelvis", "x": 16, "y": -42, "length": 24, "color": "#9933ff"},
            {"id": "knee_r", "parent": "hip_r", "x": 20, "y": -20, "length": 20, "color": "#9933ff"},
            {"id": "foot_r", "parent": "knee_r", "x": 22, "y": -2, "length": 10, "color": "#cc66ff"},
        ],
        
        # Attachments / Slots
        "slots": [
            {"id": "slot_body", "bone": "pelvis", "default_attachment": "bo_panda_full.png"},
            {"id": "slot_head", "bone": "head", "offset": [0, -10], "scale": 1.0},
            {"id": "slot_face", "bone": "head", "offset": [0, 0], "scale": 0.82},
            {"id": "slot_hat", "bone": "head", "offset": [0, -28], "scale": 1.0},
            {"id": "slot_hand_l", "bone": "hand_l", "offset": [0, 0], "scale": 1.0},
            {"id": "slot_hand_r", "bone": "hand_r", "offset": [0, 0], "scale": 1.0},
        ],
        
        # Available Skins / Characters
        "skins": [
            {
                "id": "bo_panda",
                "label": "Bò (Gấu Hài Hước)",
                "thumb": "bodies/bo_panda_full.png",
                "body_img": "bodies/bo_panda_full.png",
                "head_img": "bodies/bo_panda_head.png",
                "torso_img": "bodies/bo_panda_torso.png",
                "has_pigtails": True,
            },
            {
                "id": "ha_nhan",
                "label": "Hạ Nhân (Cổ Trang Lam Y)",
                "thumb": "bodies/ha_nhan_full.png",
                "body_img": "bodies/ha_nhan_full.png",
                "head_img": "bodies/ha_nhan_head.png",
                "torso_img": "bodies/ha_nhan_robe.png",
                "has_hat": True,
            },
            {
                "id": "gau_vang",
                "label": "Cụ Gấu Vàng (Hoodie Vàng)",
                "thumb": "bodies/gau_vang_full.png",
                "body_img": "bodies/gau_vang_full.png",
                "head_img": None,
                "torso_img": None,
            },
        ],
        
        # Expression library
        "faces": [
            {"id": f, "path": f"faces/{f}"} for f in faces
        ],
        
        # Preset Animations (keyframes & mathematical functions)
        "animations": {
            "idle": {
                "label": "Thở / Đứng chờ (Idle)",
                "fps": 30,
                "duration": 2.0,
                "description": "Nhịp thở nhẹ nhàng, thân người và đầu nhấp nhô theo chu kỳ",
            },
            "walk": {
                "label": "Bước đi lắc lư (Waddle Walk)",
                "fps": 30,
                "duration": 1.2,
                "description": "Dáng đi lắc lư hai bên đặc trưng hài hước của hoạt hình điêu khắc cát",
            },
            "talk": {
                "label": "Nói chuyện giật giật (Mouth Talk)",
                "fps": 30,
                "duration": 1.0,
                "description": "Đầu gật gù, miệng nhóp nhép, tay khua khua giải thích",
            },
            "laugh": {
                "label": "Cười rung meme (Meme Laugh)",
                "fps": 30,
                "duration": 0.8,
                "description": "Cả người rung bần bật, đầu lắc mạnh, há miệng cười hả hê",
            },
            "shock": {
                "label": "Giật mình hoảng hốt (Shocked)",
                "fps": 30,
                "duration": 1.0,
                "description": "Giật bắn người lùi lại, hai tay giơ lên trời, mắt há hốc",
            },
            "sneak": {
                "label": "Đi rình rập / Lén lút (Sneak)",
                "fps": 30,
                "duration": 1.6,
                "description": "Hạ thấp người, bước từng bước rón rén",
            },
            "dance": {
                "label": "Múa quạt / Nhảy bựa (Meme Dance)",
                "fps": 30,
                "duration": 1.4,
                "description": "Lắc hông, tay vung nhịp điệu cực bựa",
            }
        }
    }
    
    out_file = RIG_DIR / "rig_data.json"
    out_file.write_text(json.dumps(rig_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ Đã tạo cấu hình Rig tại: {out_file}")

def main():
    print("=== ĐANG TÁCH BIỂU CẢM & BỘ PHẬN NHÂN VẬT ===")
    
    # 1. Slice expressions from sheets
    sheet1 = BASE_DIR / "bieu-cam/-sieu-re-100-bieu-cam-hoat-hinh-gau-hai-huoc-dieu-khac-cat/image_01.png"
    sheet2 = BASE_DIR / "bieu-cam/-sieu-re-100-bieu-cam-hoat-hinh-gau-hai-huoc-dieu-khac-cat/image_02.png"
    
    f1 = slice_expression_sheet(sheet1, rows=6, cols=5, prefix="meme_a")
    f2 = slice_expression_sheet(sheet2, rows=6, cols=6, prefix="meme_b")
    print(f"✓ Đã tách {len(f1) + len(f2)} biểu cảm khuôn mặt vào {FACES_DIR}")
    
    # 2. Extract character parts
    extract_bo_character_parts()
    extract_ha_nhan_parts()
    extract_gau_vang_parts()
    print(f"✓ Đã tách các bộ phận thân/đầu vào {BODIES_DIR}")
    
    # 3. Build rig schema
    build_rig_schema()
    print("✓ Hoàn tất tạo Rig nhân vật!")

if __name__ == "__main__":
    main()
