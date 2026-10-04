"""Vector Character Library package.

Extracts reusable vector characters and performance clips from sample stories.
"""

from .compose import compose_story
from .dedupe import dedupe_clips
from .extract import extract_library
from .naming import get_character_info, resolve_character_id
from .cast import cast_actor, cast_pose, cast_clip
# sheet.py cần Playwright: chỉ nạp khi chạy lệnh `sheet` (from bkt_web.vector_characters.sheet import …).

__all__ = [
    "extract_library",
    "dedupe_clips",
    "compose_story",
    "get_character_info",
    "resolve_character_id",
    "cast_actor",
    "cast_pose",
    "cast_clip",
]

