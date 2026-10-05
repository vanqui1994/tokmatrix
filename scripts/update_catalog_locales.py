"""Gắn `locale` cho mọi hình nền trong catalog (thư viện nhân vật, plan PLAN_vector_character_library §6.1).

Chạy SAU mọi scripts/update_catalog_*.py khác: các script gói ghi đè mục background_specs của gói mình
và làm mất `locale`. Chạy lại nhiều lần cho cùng kết quả (idempotent).
- neutral: dùng được cho de/us/kr/jp;
- de/us/kr/jp: hình nền văn hoá, mặc định chỉ cấp cho nước đó;
- vi: chỉ lưu trữ (archived), không cấp cho engine video.
"""
import json
from pathlib import Path

CAT_PATH = Path(__file__).resolve().parents[1] / "bkt_web/static/remake_vector_catalog.json"

LOCALES = {
    "de": {"black_forest_village", "christmas_market", "allotment_garden", "alpine_meadow", "rhine_cliff"},
    "jp": {"edo_town", "jp_school", "train_platform", "shrine_generic", "onsen_snow", "takamagahara"},
    "kr": {"hanok_village", "joseon_palace_generic", "kr_market", "kr_school", "apartment_street", "korean_mountain_night"},
    "us": {"suburb_backyard", "national_park", "wild_west_town", "launch_pad", "pumpkin_patch", "moon_surface"},
    "vi": {"village_market"},
}

cat = json.loads(CAT_PATH.read_text(encoding="utf-8"))
for bg_id, spec in cat["background_specs"].items():
    locale = next((loc for loc, ids in LOCALES.items() if bg_id in ids), "neutral")
    spec["locale"] = locale
    if locale == "vi":
        spec["archived"] = True
    else:
        spec.pop("archived", None)
CAT_PATH.write_text(json.dumps(cat, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"locale set on {len(cat['background_specs'])} backgrounds")
