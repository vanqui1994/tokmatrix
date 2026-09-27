"""Mapping Matrix channel ↔ TikTok account (1:1 cố định) và ngôn ngữ theo quốc gia."""
from __future__ import annotations

import datetime
from typing import Any, Dict, List, Optional

from . import store

_MAP_KEYS = ("matrix_channel_id", "niche_id", "tiktok_channel_id", "country", "language", "assigned_at")

# Quốc gia của TikTok account → ngôn ngữ video/TTS
COUNTRY_LANGUAGE_MAP = {
    "KR": "ko",  # Hàn Quốc
    "DE": "de",  # Đức
    "GB": "en",  # Anh
    "US": "en",  # Mỹ
    "VN": "vi",  # Việt Nam
    "JP": "ja",  # Nhật
    "FR": "fr",  # Pháp
    "ES": "es",  # Tây Ban Nha
    "IT": "it",  # Ý
    "BR": "pt",  # Brazil
    "TH": "th",  # Thái Lan
    "ID": "id",  # Indonesia
    "PH": "en",  # Philippines
    "RU": "ru",  # Nga
    "TR": "tr",  # Thổ Nhĩ Kỳ
    "SA": "ar",  # Ả Rập
    "IN": "hi",  # Ấn Độ
    "PL": "pl",  # Ba Lan
    "NL": "nl",  # Hà Lan
}

# Giọng Edge mặc định theo ngôn ngữ (khớp compare_studio/tools/voices.mjs).
# Ngôn ngữ không có ở đây thì Matrix không sinh được giọng → không gán kênh.
LANGUAGE_VOICES = {
    "vi": {"male": "vi-VN-NamMinhNeural", "female": "vi-VN-HoaiMyNeural"},
    "en": {"male": "en-US-AndrewNeural", "female": "en-US-AvaNeural"},
    "de": {"male": "de-DE-ConradNeural", "female": "de-DE-KatjaNeural"},
    "fr": {"male": "fr-FR-HenriNeural", "female": "fr-FR-DeniseNeural"},
    "ja": {"male": "ja-JP-KeitaNeural", "female": "ja-JP-NanamiNeural"},
    "ko": {"male": "ko-KR-InJoonNeural", "female": "ko-KR-SunHiNeural"},
}
_FEMALE_VOICES = {v["female"] for v in LANGUAGE_VOICES.values()}


def country_to_language(country: str) -> str:
    """Country code → ngôn ngữ video. Mặc định 'en'."""
    return COUNTRY_LANGUAGE_MAP.get(country.upper(), "en")


def voice_for_language(language: str, current_voice: str = "") -> str:
    """Giọng mặc định của ngôn ngữ, giữ giới tính của giọng đang dùng."""
    voices = LANGUAGE_VOICES[language]
    if current_voice.startswith(f"{language}-"):
        return current_voice
    return voices["female" if current_voice in _FEMALE_VOICES else "male"]


def apply_language_to_channel_config(cfg: Dict[str, Any], language: str) -> bool:
    """Đặt publishing.language + audio.voice_id cho khớp nhau. Trả True nếu có đổi."""
    publishing = cfg.setdefault("publishing", {})
    audio = cfg.setdefault("audio", {})
    current = str(audio.get("voice_id") or "")
    # Ngôn ngữ không đổi → giữ giọng đã chia (tools/assign-voices.mjs; giọng CapCut như DiT_de_… không có tiền tố "de-",
    # matrix-config-validator đã kiểm giọng khớp publishing.language).
    voice = current if current and publishing.get("language") == language else voice_for_language(language, current)
    changed = publishing.get("language") != language or audio.get("voice_id") != voice
    publishing["language"] = language
    audio["voice_id"] = voice
    if changed:
        # matrix_config.sync_channel_configs từ chối config đổi mà giữ nguyên version.
        cfg["config_version"] = int(cfg.get("config_version") or 1) + 1
    return changed


# ---------------------------------------------------------------------------
# Channel map
# ---------------------------------------------------------------------------

def _map_rows(where: str = "1=1", params: tuple = ()) -> List[Dict[str, Any]]:
    conn = store.adb()
    try:
        rows = conn.execute(
            f"SELECT {', '.join(_MAP_KEYS)} FROM autopilot_channel_map WHERE {where} "
            "ORDER BY niche_id, matrix_channel_id",
            params,
        ).fetchall()
        return [dict(zip(_MAP_KEYS, r)) for r in rows]
    finally:
        conn.close()


def get_channel_map() -> List[Dict[str, Any]]:
    return _map_rows()


def get_mapping_for_matrix(matrix_channel_id: str) -> Optional[Dict[str, Any]]:
    rows = _map_rows("matrix_channel_id=?", (matrix_channel_id,))
    return rows[0] if rows else None


def get_mapping_for_tiktok(tiktok_id: int) -> Optional[Dict[str, Any]]:
    rows = _map_rows("tiktok_channel_id=?", (tiktok_id,))
    return rows[0] if rows else None


def get_tiktok_for_matrix(matrix_channel_id: str) -> Optional[int]:
    mapping = get_mapping_for_matrix(matrix_channel_id)
    return mapping["tiktok_channel_id"] if mapping else None


def set_channel_mapping(matrix_channel_id: str, niche_id: str, tiktok_channel_id: int,
                        country: str = "", language: str = "") -> None:
    if not language and country:
        language = country_to_language(country)
    conn = store.adb()
    try:
        conn.execute(
            "INSERT INTO autopilot_channel_map(matrix_channel_id, niche_id, tiktok_channel_id, country, language, assigned_at) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(matrix_channel_id) DO UPDATE SET niche_id=excluded.niche_id, "
            "tiktok_channel_id=excluded.tiktok_channel_id, country=excluded.country, "
            "language=excluded.language, assigned_at=excluded.assigned_at",
            (matrix_channel_id, niche_id, tiktok_channel_id, country, language or "vi",
             datetime.datetime.now().isoformat()),
        )
        conn.commit()
    finally:
        conn.close()


def load_matrix_channel_configs() -> Dict[str, Dict[str, Any]]:
    """channel_id → {"niche_id", "path", "config"} từ compare_studio/config/channels/*.yaml."""
    import yaml

    result: Dict[str, Dict[str, Any]] = {}
    for path in sorted(store.CHANNELS_CONFIG_DIR.glob("*.yaml")):
        cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        channel_id = cfg.get("channel_id", path.stem)
        result[channel_id] = {"niche_id": cfg.get("niche_id", ""), "path": path, "config": cfg}
    return result


_TOPIC_CACHE: Dict[str, Any] = {"at": 0.0, "data": {}}
_TOPIC_TTL = 300


def niche_names() -> Dict[str, str]:
    """niche_id → tên hiển thị (tiếng Việt) từ compare_studio/config/niches/*.yaml."""
    import yaml

    names: Dict[str, str] = {}
    for path in sorted((store.COMPARE_DIR / "config" / "niches").glob("*.yaml")):
        try:
            cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except Exception:
            continue
        if cfg.get("niche_id"):
            names[cfg["niche_id"]] = str(cfg.get("name") or cfg["niche_id"])
    return names


def account_topics(force: bool = False) -> Dict[int, Dict[str, str]]:
    """TikTok channel id → chủ đề của acc (niche + kênh Matrix đã gán). Cache 5 phút: đọc ~240 YAML."""
    import time

    now = time.time()
    if not force and now - _TOPIC_CACHE["at"] < _TOPIC_TTL:
        return _TOPIC_CACHE["data"]
    names = niche_names()
    configs = load_matrix_channel_configs()
    data: Dict[int, Dict[str, str]] = {}
    for row in get_channel_map():
        try:
            tiktok_id = int(row["tiktok_channel_id"])
        except (TypeError, ValueError):
            continue
        cfg = (configs.get(row["matrix_channel_id"]) or {}).get("config") or {}
        data[tiktok_id] = {
            "niche_id": row["niche_id"] or "",
            "niche_name": names.get(row["niche_id"], row["niche_id"] or ""),
            "matrix_channel_id": row["matrix_channel_id"],
            "matrix_channel_name": str(cfg.get("name") or row["matrix_channel_id"]),
        }
    _TOPIC_CACHE.update(at=now, data=data)
    return data


def count_channels_for_niche(niche_id: str) -> int:
    return sum(1 for c in load_matrix_channel_configs().values() if c["niche_id"] == niche_id)


def mapped_channels_by_niche() -> Dict[str, List[str]]:
    """niche → Matrix channel đã gán TikTok acc, có YAML, và YAML cùng niche với mapping.

    Chỉ những channel này mới đăng được; sinh video cho channel chưa gán acc là tốn công vô ích.
    """
    configs = load_matrix_channel_configs()
    result: Dict[str, List[str]] = {}
    for row in get_channel_map():
        cfg = configs.get(row["matrix_channel_id"])
        if cfg and cfg["niche_id"] == row["niche_id"]:
            result.setdefault(row["niche_id"], []).append(row["matrix_channel_id"])
    return {niche: sorted(ids) for niche, ids in result.items()}


def _write_yaml(path, cfg: Dict[str, Any]) -> bool:
    """Ghi YAML kênh; bỏ qua (False) khi migration Creative DNA đang giữ khoá channels/.migration.lock."""
    import yaml

    if (path.parent / ".migration.lock").exists():
        store.log_event(f"⏸️ Bỏ qua ghi {path.name}: đang có migration Creative DNA (channels/.migration.lock)", "warn")
        return False
    path.write_text(yaml.dump(cfg, allow_unicode=True, default_flow_style=False, sort_keys=False), encoding="utf-8")
    return True


def auto_link_channels() -> Dict[str, Any]:
    """Gán tuần tự Matrix channels (theo niche+channel_id) ↔ TikTok accounts (theo id).

    Đọc country từ TikTok account → set language + giọng trong channel config YAML.
    """
    configs = load_matrix_channel_configs()
    matrix_channels = sorted(
        ({"channel_id": cid, "niche_id": c["niche_id"]} for cid, c in configs.items()),
        key=lambda c: (c["niche_id"], c["channel_id"]),
    )

    conn = store.channels_db()
    try:
        rows = conn.execute(
            "SELECT id, username, status, country FROM channels WHERE status != 'DIE' ORDER BY id"
        ).fetchall()
    finally:
        conn.close()
    # Chỉ lấy acc có country mà Matrix đọc được bằng giọng đúng ngôn ngữ
    tiktok_accs = [
        {"id": r[0], "username": r[1], "status": r[2], "country": r[3] or ""} for r in rows
        if (r[3] or "") in COUNTRY_LANGUAGE_MAP and country_to_language(r[3]) in LANGUAGE_VOICES
    ]

    linked = lang_updated = 0
    count = min(len(matrix_channels), len(tiktok_accs))
    for mc, ta in zip(matrix_channels[:count], tiktok_accs[:count]):
        language = country_to_language(ta["country"])
        set_channel_mapping(mc["channel_id"], mc["niche_id"], ta["id"], country=ta["country"], language=language)
        entry = configs[mc["channel_id"]]
        if entry["path"].exists() and apply_language_to_channel_config(entry["config"], language):
            if _write_yaml(entry["path"], entry["config"]):
                lang_updated += 1
        linked += 1

    return {
        "linked": linked,
        "language_updated": lang_updated,
        "matrix_channels_total": len(matrix_channels),
        "tiktok_accounts_bkt": len(tiktok_accs),
        "country_language_map": {ta["country"]: country_to_language(ta["country"]) for ta in tiktok_accs},
        "message": f"Đã gán {linked}/{count} channels, cập nhật {lang_updated} language configs",
    }


def sync_channel_languages() -> Dict[str, Any]:
    """Cho YAML của từng Matrix channel khớp ngôn ngữ acc đã gán, không gán lại acc."""
    import yaml

    updated, skipped = [], []
    for mapping in get_channel_map():
        language = mapping.get("language") or ""
        path = store.CHANNELS_CONFIG_DIR / f"{mapping['matrix_channel_id']}.yaml"
        if language not in LANGUAGE_VOICES or not path.exists():
            skipped.append(mapping["matrix_channel_id"])
            continue
        cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if apply_language_to_channel_config(cfg, language):
            if _write_yaml(path, cfg):
                updated.append(mapping["matrix_channel_id"])
            else:
                skipped.append(mapping["matrix_channel_id"])
    return {"updated": updated, "skipped": skipped}


def account_language(tiktok_id: int) -> str:
    conn = store.channels_db()
    try:
        row = conn.execute("SELECT country FROM channels WHERE id=?", (tiktok_id,)).fetchone()
    finally:
        conn.close()
    return country_to_language(row[0]) if row and row[0] else ""


# ---------------------------------------------------------------------------
# Thời điểm tiêm cookie (để "ngâm" acc trước khi đăng)
# ---------------------------------------------------------------------------

_COOKIE_TRACKING_SQL = """
CREATE TRIGGER IF NOT EXISTS trg_channels_cookie_inserted AFTER INSERT ON channels
WHEN COALESCE(NEW.cookie, '') != ''
BEGIN
    UPDATE channels SET cookie_injected_at = CAST(strftime('%s', 'now') AS INTEGER) WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_channels_cookie_changed AFTER UPDATE OF cookie_hash ON channels
WHEN COALESCE(NEW.cookie_hash, '') != '' AND NEW.cookie_hash IS NOT OLD.cookie_hash
BEGIN
    UPDATE channels SET cookie_injected_at = CAST(strftime('%s', 'now') AS INTEGER) WHERE id = NEW.id;
END;
"""


def ensure_cookie_tracking() -> None:
    """Cột channels.cookie_injected_at + trigger ghi giờ mỗi khi cookie THỰC SỰ đổi (cookie_hash đổi).

    Trigger bắt được mọi đường cập nhật cookie (import, dựng profile, write_back…) mà không phải sửa
    từng chỗ. Import lại đúng cookie cũ (cùng hash) không reset thời gian ngâm. Acc có từ trước
    (giá trị 0) coi như đã ngâm xong.
    """
    conn = store.channels_db()
    try:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(channels)")}
        if not cols:
            return  # DB chưa có bảng channels (server chưa khởi tạo)
        if "cookie_injected_at" not in cols:
            conn.execute("ALTER TABLE channels ADD COLUMN cookie_injected_at INTEGER DEFAULT 0")
        conn.executescript(_COOKIE_TRACKING_SQL)
        conn.commit()
    finally:
        conn.close()


def cookie_injected_at(tiktok_id: int) -> int:
    conn = store.channels_db()
    try:
        row = conn.execute("SELECT cookie_injected_at FROM channels WHERE id=?", (tiktok_id,)).fetchone()
    except Exception:  # cột chưa có
        return 0
    finally:
        conn.close()
    return int(row[0] or 0) if row else 0
