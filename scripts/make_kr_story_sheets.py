from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ART_DIR = Path("/Users/vfa/.gemini/antigravity-ide/brain/49239a9e-43cd-4cf1-968a-b3a91afc986a")
SCRATCH_DIR = ART_DIR / "scratch"

stories = [
    ("tiger_and_persimmon", ["1.0s", "3.6s", "6.0s", "9.0s", "11.5s"], "Hổ và Quả Hồng (tiger_and_persimmon)"),
    ("kimchi_day", ["1.0s", "3.6s", "6.0s", "9.0s", "11.5s"], "Ngày Muối Kimchi (kimchi_day)"),
    ("seollal_morning", ["1.0s", "3.6s", "6.0s", "9.0s", "11.5s"], "Sáng Mùng Một Tết Seollal (seollal_morning)"),
    ("rain_gauge", ["1.0s", "3.0s", "5.0s", "7.5s", "9.5s"], "Đo Lượng Mưa Cheugugi (rain_gauge)"),
]

for story_id, times, title in stories:
    # 5 frames side by side
    w, h = 288, 512
    margin = 20
    header_h = 50
    total_w = w * 5 + margin * 6
    total_h = h + header_h + margin * 2

    canvas = Image.new("RGB", (total_w, total_h), (24, 24, 27))
    draw = ImageDraw.Draw(canvas)

    draw.text((margin, 15), f"{title}", fill=(244, 244, 245))

    for i, t_str in enumerate(times):
        img_path = SCRATCH_DIR / f"{story_id}_{i}_{t_str}.png"
        if not img_path.exists():
            print(f"Missing {img_path}")
            continue
        im = Image.open(img_path).convert("RGB")
        im_resized = im.resize((w, h), Image.Resampling.LANCZOS)
        x = margin + i * (w + margin)
        y = header_h + margin
        canvas.paste(im_resized, (x, y))
        draw.text((x + 10, y + 10), f"t = {t_str}", fill=(254, 240, 138))

    out_file = ART_DIR / f"story_{story_id}_frames.jpg"
    canvas.save(out_file, quality=92)
    print(f"Saved {out_file.name}")

print("All story sheets created!")
