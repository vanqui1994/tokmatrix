"""Caption + hashtag cho video Autopilot, theo đúng niche và ngôn ngữ của acc.

Phần chữ lấy từ publish_kit (viết từ kịch bản nên đã đúng ngôn ngữ); hashtag KHÔNG lấy từ
publish_kit vì bộ đó gắn cứng theo engine và tiếng Việt (vd #khoahoc trên acc tiếng Anh).
"""
from __future__ import annotations

import json
from typing import Dict, List, Tuple

from . import safety, store

try:
    from bkt_web import publish_flow
except ImportError:
    import publish_flow

MAX_CAPTION = 2200
NICHE_TAGS: Dict[str, List[str]] = {
    "folklore_legends": ["#folklore", "#legends", "#mythology"],
    "unsolved_mysteries": ["#mystery", "#unsolved", "#truestory"],
    "deep_space": ["#space", "#astronomy", "#universe"],
    "extreme_wildlife": ["#wildlife", "#animals", "#nature"],
    "geopolitics_maps": ["#geopolitics", "#maps", "#history"],
    "dark_psychology": ["#psychology", "#mindset", "#brain"],
    "extreme_survival": ["#survival", "#truestory", "#adventure"],
    "tech_ai_future": ["#tech", "#ai", "#future"],
    "economy_empires": ["#business", "#economy", "#history"],
    "lost_civilizations": ["#history", "#archaeology", "#ancient"],
    "medical_anomalies": ["#health", "#science", "#humanbody"],
    "mega_catastrophes": ["#disaster", "#history", "#nature"],
    "infamous_figures": ["#history", "#truestory", "#biography"],
    "forbidden_experiments": ["#science", "#history", "#ethics"],
    "ocean_mysteries": ["#ocean", "#deepsea", "#mystery"],
    "philosophy_paradox": ["#philosophy", "#paradox", "#thinking"],
    "military_arsenal": ["#militaryhistory", "#history", "#engineering"],
    "ancient_mythology": ["#mythology", "#ancient", "#gods"],
    "zombie_survival": ["#zombie", "#survival", "#animation"],
    "monster_fishing": ["#fishing", "#seamonster", "#animation"],
    "happy_farm": ["#farm", "#farmlife", "#animation"],
}
LANGUAGE_TAGS: Dict[str, List[str]] = {
    "de": ["#fürdich", "#wissen"],
    "en": ["#fyp", "#didyouknow"],
    "fr": ["#pourtoi", "#culture"],
    "ja": ["#おすすめ", "#雑学"],
    "ko": ["#추천", "#상식"],
    "vi": ["#xuhuong", "#kienthuc"],
}


def hashtags_for(niche_id: str, language: str) -> str:
    tags = NICHE_TAGS.get(niche_id, [])[:3] + LANGUAGE_TAGS.get(language, ["#fyp"]) + ["#fyp"]
    return " ".join(dict.fromkeys(tags))[:300]


def _title(slug: str) -> str:
    try:
        return str(json.loads((store.VIDEOS_DIR / slug / "meta.json").read_text(encoding="utf-8")).get("name") or "")
    except (OSError, ValueError):
        return ""


def build_caption(slug: str, niche_id: str, language: str) -> Tuple[str, str]:
    """(caption, hashtags) — không bao giờ rỗng cả hai; không để chữ tiếng Việt lọt sang acc nước ngoài."""
    caption = (publish_flow._kit_caption(slug).get("caption") or "").strip()
    if not caption or (language != "vi" and safety.has_vietnamese(caption)):
        caption = _title(slug)
    hashtags = hashtags_for(niche_id, language)
    limit = MAX_CAPTION - len(hashtags) - 1
    if len(caption) > limit:
        caption = caption[: limit - 1].rstrip() + "…"
    return caption, hashtags
