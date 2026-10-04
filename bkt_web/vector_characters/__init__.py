"""Vector Character Library package.

Extracts reusable vector characters and performance clips from sample stories.
"""

from .compose import compose_story
from .dedupe import dedupe_clips
from .extract import extract_library
from .naming import get_character_info, resolve_character_id
from .sheet import render_all_sheets, render_hat_comparison, render_neutral_stories_review

__all__ = [
    "extract_library",
    "dedupe_clips",
    "compose_story",
    "render_all_sheets",
    "render_hat_comparison",
    "render_neutral_stories_review",
    "get_character_info",
    "resolve_character_id",
]
