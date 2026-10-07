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


_VOICE_LANGS: Optional[Dict[str, set]] = None


def _voice_catalog() -> Dict[str, set]:
    """id giọng → mã ngôn ngữ, đọc từ tools/voices.mjs (khối `code:`) và capcut_auditioned.json."""
    global _VOICE_LANGS
    if _VOICE_LANGS is not None:
        return _VOICE_LANGS
    import re
    langs: Dict[str, set] = {}
    try:
        text = (store.COMPARE_DIR / "tools" / "voices.mjs").read_text(encoding="utf-8")
        code = None
        for m in re.finditer(r'code:\s*"([a-z]{2})"|\bid:\s*"([^"]+)"', text):
            if m.group(1):
                code = m.group(1)
            elif code:
                langs.setdefault(m.group(2), set()).add(code)
    except OSError:
        pass
    try:
        data = json.loads((store.COMPARE_DIR / "config" / "voices" / "capcut_auditioned.json").read_text(encoding="utf-8"))
        for v in data.get("voices") or []:
            if v.get("id") and v.get("lang") and v.get("status", "pass") == "pass":
                langs.setdefault(v["id"], set()).add(str(v["lang"]).split("-")[0].lower())
    except (OSError, ValueError):
        pass
    _VOICE_LANGS = langs
    return langs


def voice_languages(voice: str) -> set:
    """Ngôn ngữ của giọng: Edge `de-DE-…` theo tiền tố, CapCut theo catalog (có thể nhiều nước); rỗng = không rõ (không chặn)."""
    import re
    m = re.match(r"^([a-z]{2})-[A-Z]{2}-", voice)
    if m:
        return {m.group(1)}
    return set(_voice_catalog().get(voice) or ())


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
    voice_langs = voice_languages(voice) if voice else set()
    if voice_langs and expected not in voice_langs:
        return f"giọng {voice} là {'/'.join(sorted(voice_langs))}, không phải {expected}"
    if expected != "vi":
        texts = [str(meta.get("name") or "")]
        texts += [str(scene.get("line") or "") for scene in manifest.get("scenes") or [] if isinstance(scene, dict)]
        texts += [str(v.get("fullScriptHtml") or "") for v in meta.values() if isinstance(v, dict)]
        if any(has_vietnamese(text) for text in texts):
            return f"kịch bản có chữ tiếng Việt nhưng acc #{tiktok_id} cần {expected}"
    return None
