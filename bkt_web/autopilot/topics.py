"""Nguồn topic cho plan theo từng acc (26/09).

Mỗi TikTok acc nhận một topic riêng mỗi ngày → ~13 acc/niche tiêu 13 topic/ngày, trong khi
config/topics/<niche>.txt chỉ có ~30 dòng. Khi kho topic chưa dùng của một niche xuống dưới
nhu cầu, Gemini viết thêm (tránh trùng chủ thể với topic đã có) vào
storage/autopilot_topics/<niche>.txt; planner đọc file này sau file curated.

Hai acc cùng niche không được nhận topic cùng chủ thể trong `topic_subject_gap_days` ngày:
"Mantis shrimp punch…" và "Why mantis shrimp eyes…" chung từ khoá "mantis", "shrimp" → coi là trùng.
"""
from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import Iterable, List, Optional, Set

from . import store

logger = logging.getLogger(__name__)

GENERATED_DIR = store.BKT_DIR / "storage" / "autopilot_topics"
# Thử lần lượt; 503 "high demand"/429 thì chuyển model kế tiếp.
GEMINI_MODELS = ("gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "what", "when", "which", "while", "why", "how",
    "who", "whose", "than", "then", "they", "their", "them", "were", "was", "are", "is", "its", "it's", "your",
    "you", "can", "could", "would", "should", "does", "did", "have", "has", "had", "not", "but", "all", "any",
    "most", "more", "less", "ever", "over", "under", "about", "after", "before", "behind", "inside", "real",
    "true", "truth", "story", "stories", "secret", "secrets", "hidden", "mystery", "mysteries", "strange",
    "world", "world's", "ancient", "history", "facts", "fact", "biggest", "deadliest", "strongest", "greatest",
    "really", "actually", "still", "only", "just", "every", "one", "two", "three", "first", "last", "vs",
    "versus", "which", "top", "best", "worst", "made", "make", "makes", "become", "became", "time", "times",
}
_failed_until = {}


def subject_words(topic: str) -> Set[str]:
    words = re.findall(r"[a-zà-ÿ0-9']+", (topic or "").lower())
    result = set()
    for word in words:
        word = word.strip("'")
        if word.endswith("'s"):
            word = word[:-2]
        if len(word) >= 4 and word not in _STOPWORDS:
            result.add(word[:-1] if word.endswith("s") and not word.endswith("ss") else word)
    return result


def same_subject(topic: str, others: Iterable[str]) -> bool:
    mine = subject_words(topic)
    return any(len(mine & subject_words(other)) >= 2 for other in others)


def generated_file(niche_id: str) -> Path:
    return GENERATED_DIR / f"{niche_id}.txt"


def generated_topics(niche_id: str) -> List[str]:
    path = generated_file(niche_id)
    if not path.exists():
        return []
    lines = (line.strip() for line in path.read_text(encoding="utf-8").splitlines())
    return [line for line in lines if line and not line.startswith("#")]


def _niche_name(niche_id: str) -> str:
    from . import planner
    try:
        return next((n["name"] for n in planner.get_niches() if n["id"] == niche_id), niche_id)
    except Exception:
        return niche_id


def _ask_gemini(prompt: str) -> str:
    import httpx
    from bkt_web.imagerouter_image import _gemini_key

    api_key = _gemini_key()
    if not api_key:
        raise RuntimeError("chưa có khoá Gemini (key vault ai.gemini / GEMNINI_KEY)")
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.9, "maxOutputTokens": 4000}}
    errors = []
    for model in GEMINI_MODELS:
        try:
            resp = httpx.post(GEMINI_URL.format(model=model), params={"key": api_key}, json=body, timeout=90.0)
        except httpx.HTTPError as exc:
            errors.append(f"{model}: {type(exc).__name__}")
            continue
        data = resp.json() if resp.content else {}
        if resp.status_code == 200:
            parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
            return "\n".join(str(p.get("text", "")) for p in parts)
        errors.append(f"{model}: HTTP {resp.status_code} {str((data.get('error') or {}).get('message', ''))[:80]}")
        if resp.status_code not in (429, 500, 503, 404):
            break
    raise RuntimeError("Gemini lỗi — " + "; ".join(errors))


def generate(niche_id: str, existing: List[str], count: int = 40, brief: str = "") -> List[str]:
    """Gemini viết `count` topic tiếng Anh mới, mỗi topic một chủ thể khác nhau và khác mọi topic đã có.

    `brief` (topic pack) thu hẹp mảng chủ đề trong niche."""
    sample = "\n".join(f"- {t}" for t in existing[-150:])
    focus = f"Every topic must fit this series brief: {brief}\n" if brief else ""
    prompt = (
        f"You write video topics for a short-form (60-second) faceless TikTok channel in the niche "
        f"\"{_niche_name(niche_id)}\" (id: {niche_id}).\n"
        f"{focus}"
        f"Write {count} NEW topics in English, one per line, no numbering, no quotes, 5-14 words each, "
        "in the same style as the existing ones (a concrete subject plus an angle).\n"
        "Rules:\n"
        "- Every topic must be about a DIFFERENT main subject (a different animal, person, place, event, object...). "
        "Never two topics about the same subject.\n"
        "- Do not reuse any main subject from the existing topics below.\n"
        "- Only well documented, verifiable subjects; no invented facts, no living private individuals.\n"
        "- Nothing sexual, hateful, self-harm or medical advice.\n\n"
        f"Existing topics (do not repeat their subjects):\n{sample}\n"
    )
    lines = []
    for raw in _ask_gemini(prompt).splitlines():
        line = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", raw).strip().strip('"').strip()
        if 4 <= len(line.split()) <= 20 and not line.endswith(":"):
            lines.append(line)
    fresh: List[str] = []
    for line in lines:
        if not same_subject(line, existing + fresh):
            fresh.append(line)
    return fresh


def refill(niche_id: str, existing: List[str], need: int) -> int:
    """Viết thêm topic cho niche (tối đa 1 lần/30 phút khi lỗi). Trả số topic mới đã ghi."""
    if time.time() < _failed_until.get(niche_id, 0):
        return 0
    try:
        fresh = generate(niche_id, existing, count=max(40, need * 2))
    except Exception as exc:
        _failed_until[niche_id] = time.time() + 1800
        store.log_event(f"⚠️ Không sinh được topic mới cho {niche_id}: {exc}", "warn")
        return 0
    if not fresh:
        _failed_until[niche_id] = time.time() + 1800
        return 0
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    with generated_file(niche_id).open("a", encoding="utf-8") as handle:
        handle.write("\n".join(fresh) + "\n")
    store.log_event(f"🧠 {niche_id}: Gemini viết thêm {len(fresh)} topic (storage/autopilot_topics/{niche_id}.txt)")
    return len(fresh)


def refill_pack(pack: dict, niche_id: str, existing: List[str], need: int) -> int:
    """Viết thêm topic cho một topic pack (theo brief) vào storage/autopilot_topics/packs/<pack>.txt."""
    from . import topic_packs

    key = f"pack:{pack['id']}"
    if time.time() < _failed_until.get(key, 0):
        return 0
    fmt = pack.get("format")
    brief = " ".join(filter(None, [str(pack.get("brief") or ""), topic_packs.FORMAT_RULES.get(fmt, "")]))
    try:
        fresh = generate(niche_id, existing, count=max(20, need * 2), brief=brief)
    except Exception as exc:
        _failed_until[key] = time.time() + 1800
        store.log_event(f"⚠️ Không sinh được topic cho pack {pack['id']}: {exc}", "warn")
        return 0
    rejected = [t for t in fresh if not topic_packs.fits_format(t, fmt)]
    fresh = [t for t in fresh if topic_packs.fits_format(t, fmt)]
    if rejected:
        store.log_event(f"⚠️ pack {pack['id']}: bỏ {len(rejected)} topic sai định dạng {fmt} (vd. {rejected[0]!r})", "warn")
    if not fresh:
        _failed_until[key] = time.time() + 1800
        return 0
    path = topic_packs.generated_file(pack["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write("\n".join(fresh) + "\n")
    store.log_event(f"🧠 pack {pack['id']}: Gemini viết thêm {len(fresh)} topic")
    return len(fresh)
