"""Kiểm tra trước khi đưa video vào hàng đợi đăng: đúng kênh, đúng niche, đúng ngôn ngữ."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional

from . import channels, store

try:
    from bkt_web import matrix_db
except ImportError:
    import matrix_db


@dataclass(frozen=True)
class Verdict:
    ok: bool
    reason: str = ""


def check_niche_match(
    *,
    job: Mapping[str, Any],
    plan: Mapping[str, Any],
    mapping: Optional[Mapping[str, Any]],
    job_niches: Mapping[str, Optional[str]],
) -> Verdict:
    """Hàm thuần: job chỉ được đăng khi mọi nguồn niche trùng nhau 100%.

    Nguồn: plan tạo batch, mapping acc TikTok, channel Matrix của job, topic của job.
    Thiếu bất kỳ nguồn nào cũng chặn — không đoán.
    """
    if not mapping:
        return Verdict(False, f"channel {job.get('channel_id')} chưa gán TikTok acc")
    if mapping.get("matrix_channel_id") != job.get("channel_id"):
        return Verdict(False, f"mapping trỏ tới {mapping.get('matrix_channel_id')} chứ không phải {job.get('channel_id')}")
    sources = {
        "plan": plan.get("niche_id"),
        "acc": mapping.get("niche_id"),
        "channel": job_niches.get("channel_niche"),
        "topic": job_niches.get("topic_niche"),
    }
    missing = [name for name, value in sources.items() if not value]
    if missing:
        return Verdict(False, f"không xác định được niche từ {', '.join(missing)}")
    if len(set(sources.values())) != 1:
        detail = ", ".join(f"{name}={value}" for name, value in sources.items())
        return Verdict(False, f"niche lệch nhau ({detail})")
    return Verdict(True)


# Chữ cái chỉ tiếng Việt mới có — thấy trong video không phải tiếng Việt là
# kịch bản đã viết sai ngôn ngữ.
_VIETNAMESE_ONLY = set("ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệịỉĩọỏốồổỗộớờởỡợụủũứừửữựỳỷỹỵ")  # không có â/ê/ô: tiếng Pháp cũng dùng


def has_vietnamese(text: str) -> bool:
    return any(ch in _VIETNAMESE_ONLY for ch in text.lower())


def video_language_problem(slug: str, tiktok_id: int, job_id: str = "") -> Optional[str]:
    """Lý do video không được đăng lên acc này vì lệch ngôn ngữ; None nếu khớp."""
    expected = channels.account_language(tiktok_id)
    if not expected:
        return f"acc #{tiktok_id} chưa có country nên không biết ngôn ngữ cần đăng"
    try:
        meta = json.loads((store.VIDEOS_DIR / slug / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return f"không đọc được meta.json của {slug}"
    lang = str(meta.get("lang") or "")
    if lang != expected:
        return f"video lang={lang or '?'} nhưng acc #{tiktok_id} cần {expected}"
    job = matrix_db.get_job(job_id) if job_id else None
    manifest: Dict[str, Any] = (job or {}).get("manifest") or {}
    voice = str((manifest.get("audio") or {}).get("voice_id") or "")
    if voice and not voice.startswith(f"{expected}-"):
        return f"giọng {voice} không phải {expected}"
    if expected != "vi":
        texts = [str(meta.get("name") or "")]
        texts += [str(scene.get("line") or "") for scene in manifest.get("scenes") or [] if isinstance(scene, dict)]
        texts += [str(v.get("fullScriptHtml") or "") for v in meta.values() if isinstance(v, dict)]
        if any(has_vietnamese(text) for text in texts):
            return f"kịch bản có chữ tiếng Việt nhưng acc #{tiktok_id} cần {expected}"
    return None
