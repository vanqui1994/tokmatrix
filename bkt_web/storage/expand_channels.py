"""Sinh thêm channel configs cho 57 acc mới (từ 180 → 237).

18 niches hiện có 10 channels mỗi niche (180 tổng).
Cần thêm 57: 18 niches × 3 = 54, + 3 niches × 1 = 57.
→ 15 niches sẽ có 13 channels, 3 niches sẽ có 14 channels.

Chạy: python3 bkt_web/storage/expand_channels.py
"""
import random
import yaml
from pathlib import Path

CHANNELS_DIR = Path(__file__).resolve().parent.parent.parent / "compare_studio" / "config" / "channels"

# Lấy danh sách niches
niches = {}
for f in sorted(CHANNELS_DIR.glob("*.yaml")):
    cfg = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
    niche = cfg.get("niche_id", "")
    if niche not in niches:
        niches[niche] = []
    niches[niche].append({"file": f, "config": cfg})

print(f"Hiện có {len(niches)} niches, tổng {sum(len(v) for v in niches.values())} channels")

# Tính số cần thêm: 237 - 180 = 57
TOTAL_TARGET = 237
current_total = sum(len(v) for v in niches.values())
need = TOTAL_TARGET - current_total

if need <= 0:
    print(f"Đã đủ {current_total} channels, không cần thêm")
    exit()

# Phân bổ đều: 57 / 18 = 3 dư 3
niche_list = sorted(niches.keys())
per_niche = need // len(niche_list)  # 3
extra = need % len(niche_list)       # 3

created = 0
for idx, niche_id in enumerate(niche_list):
    existing = niches[niche_id]
    existing_count = len(existing)
    add_count = per_niche + (1 if idx < extra else 0)
    
    if add_count == 0:
        continue
    
    # Lấy config cuối cùng làm template
    template = existing[-1]["config"].copy()
    
    for j in range(add_count):
        new_num = existing_count + j + 1
        new_id = f"{niche_id}_{new_num:02d}"
        new_name = template.get("name", niche_id).rsplit(" ", 1)[0] + f" {new_num:02d}"
        
        new_cfg = yaml.safe_load(yaml.dump(template))  # deep copy
        new_cfg["channel_id"] = new_id
        new_cfg["name"] = new_name
        new_cfg["tiktok_account_ref"] = None
        
        # Slight variation in DNA
        new_cfg["story"]["target_duration_seconds"] = random.randint(45, 55)
        new_cfg["creative"]["cut_cadence_seconds"] = round(random.uniform(2.2, 3.0), 1)
        new_cfg["audio"]["voice_speed"] = round(random.uniform(0.98, 1.06), 2)
        
        # Rotate preferred engines slightly
        engines = new_cfg["creative"]["preferred_engines"]
        if len(engines) >= 2:
            shift = (j + 1) % len(engines)
            new_cfg["creative"]["preferred_engines"] = engines[shift:] + engines[:shift]
        
        new_file = CHANNELS_DIR / f"{new_id}.yaml"
        new_file.write_text(
            yaml.dump(new_cfg, allow_unicode=True, default_flow_style=False, sort_keys=False),
            encoding="utf-8",
        )
        created += 1
        print(f"  ✓ {new_id}")

print(f"\nTạo {created} channel configs mới. Tổng: {current_total + created}")
