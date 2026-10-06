"""Country-aware script translation and deterministic multi-role voice mixing."""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


try:
    from bkt_web import key_vault
except ImportError:
    import key_vault


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


COUNTRIES: List[Dict[str, Any]] = [
    {"code": "vi-VN", "country": "Việt Nam", "language": "Tiếng Việt", "flag": "🇻🇳", "voices": {"young_1": "vi-VN-HoaiMyNeural", "young_2": "vi-VN-HoaiMyNeural", "adult": "vi-VN-NamMinhNeural", "narrator": "vi-VN-NamMinhNeural"}},
    {"code": "en-US", "country": "Hoa Kỳ", "language": "English (US)", "flag": "🇺🇸", "voices": {"young_1": "en-US-AnaNeural", "young_2": "en-US-JennyNeural", "adult": "en-US-AndrewNeural", "narrator": "en-US-ChristopherNeural"}},
    {"code": "en-GB", "country": "Vương quốc Anh", "language": "English (UK)", "flag": "🇬🇧", "voices": {"young_1": "en-GB-MaisieNeural", "young_2": "en-GB-LibbyNeural", "adult": "en-GB-RyanNeural", "narrator": "en-GB-ThomasNeural"}},
    {"code": "zh-CN", "country": "Trung Quốc", "language": "简体中文", "flag": "🇨🇳", "voices": {"young_1": "zh-CN-XiaoyiNeural", "young_2": "zh-CN-YunxiaNeural", "adult": "zh-CN-YunjianNeural", "narrator": "zh-CN-YunyangNeural"}},
    {"code": "zh-TW", "country": "Đài Loan", "language": "繁體中文", "flag": "🇹🇼", "voices": {"young_1": "zh-TW-HsiaoYuNeural", "young_2": "zh-TW-HsiaoChenNeural", "adult": "zh-TW-YunJheNeural", "narrator": "zh-TW-YunJheNeural"}},
    {"code": "ja-JP", "country": "Nhật Bản", "language": "日本語", "flag": "🇯🇵", "voices": {"young_1": "ja-JP-NanamiNeural", "young_2": "ja-JP-NanamiNeural", "adult": "ja-JP-KeitaNeural", "narrator": "ja-JP-KeitaNeural"}},
    {"code": "ko-KR", "country": "Hàn Quốc", "language": "한국어", "flag": "🇰🇷", "voices": {"young_1": "ko-KR-SunHiNeural", "young_2": "ko-KR-SunHiNeural", "adult": "ko-KR-InJoonNeural", "narrator": "ko-KR-HyunsuMultilingualNeural"}},
    {"code": "th-TH", "country": "Thái Lan", "language": "ภาษาไทย", "flag": "🇹🇭", "voices": {"young_1": "th-TH-PremwadeeNeural", "young_2": "th-TH-PremwadeeNeural", "adult": "th-TH-NiwatNeural", "narrator": "th-TH-NiwatNeural"}},
    {"code": "id-ID", "country": "Indonesia", "language": "Bahasa Indonesia", "flag": "🇮🇩", "voices": {"young_1": "id-ID-GadisNeural", "young_2": "id-ID-GadisNeural", "adult": "id-ID-ArdiNeural", "narrator": "id-ID-ArdiNeural"}},
    {"code": "fil-PH", "country": "Philippines", "language": "Filipino", "flag": "🇵🇭", "voices": {"young_1": "fil-PH-BlessicaNeural", "young_2": "fil-PH-BlessicaNeural", "adult": "fil-PH-AngeloNeural", "narrator": "fil-PH-AngeloNeural"}},
    {"code": "hi-IN", "country": "Ấn Độ", "language": "हिन्दी", "flag": "🇮🇳", "voices": {"young_1": "hi-IN-SwaraNeural", "young_2": "hi-IN-SwaraNeural", "adult": "hi-IN-MadhurNeural", "narrator": "hi-IN-MadhurNeural"}},
    {"code": "fr-FR", "country": "Pháp", "language": "Français", "flag": "🇫🇷", "voices": {"young_1": "fr-FR-EloiseNeural", "young_2": "fr-FR-DeniseNeural", "adult": "fr-FR-HenriNeural", "narrator": "fr-FR-RemyMultilingualNeural"}},
    {"code": "de-DE", "country": "Đức", "language": "Deutsch", "flag": "🇩🇪", "voices": {"young_1": "de-DE-AmalaNeural", "young_2": "de-DE-KatjaNeural", "adult": "de-DE-ConradNeural", "narrator": "de-DE-FlorianMultilingualNeural"}},
    {"code": "es-ES", "country": "Tây Ban Nha", "language": "Español", "flag": "🇪🇸", "voices": {"young_1": "es-ES-ElviraNeural", "young_2": "es-ES-XimenaNeural", "adult": "es-ES-AlvaroNeural", "narrator": "es-ES-AlvaroNeural"}},
    {"code": "es-MX", "country": "Mexico", "language": "Español (México)", "flag": "🇲🇽", "voices": {"young_1": "es-MX-DaliaNeural", "young_2": "es-MX-DaliaNeural", "adult": "es-MX-JorgeNeural", "narrator": "es-MX-JorgeNeural"}},
    {"code": "pt-BR", "country": "Brazil", "language": "Português", "flag": "🇧🇷", "voices": {"young_1": "pt-BR-FranciscaNeural", "young_2": "pt-BR-ThalitaMultilingualNeural", "adult": "pt-BR-AntonioNeural", "narrator": "pt-BR-AntonioNeural"}},
]

COUNTRY_BY_CODE = {country["code"]: country for country in COUNTRIES}


SOURCE_1_HASH = "b8b15afbaba82130410294f87ecdb1a38c2daf54f1be504f64a5b796407a5274"
SOURCE_1_PROFILE: Dict[str, Any] = {
    "id": "watermelon-story-v2",
    "renderer": "/static/remake_2d_demo.html",
    "default_audio_url": "/static/remake_dua_hau_preview.mp4",
    "duration": 52.756,
    "characters": [
        {"id": "melon_a", "name": "Dưa A", "voice_role": "young_1", "avatar": "🍉", "evidence": [0.5, 6.4, 15.0]},
        {"id": "melon_b", "name": "Dưa B", "voice_role": "young_2", "avatar": "🍈", "evidence": [17.8]},
        {"id": "farmer", "name": "Bác nông dân", "voice_role": "adult", "avatar": "👨‍🌾", "evidence": [10.4, 22.2, 30.2]},
        {"id": "narrator", "name": "Lời bình", "voice_role": "narrator", "avatar": "🎙️", "evidence": [34.2, 43.2]},
    ],
    "cues": [
        {"start": 0.5, "end": 4.2, "speaker": "melon_a", "text": "Anh Hai ơi, tụi mình bự chảng ngần này rồi, sao chưa ai tới hái vậy cà?"},
        {"start": 6.4, "end": 10.2, "speaker": "melon_a", "text": "Ủa bác đi đâu đấy? Tưởng tới hái tụi cháu chớ? Tụi cháu to bự lắm rồi nè!"},
        {"start": 10.4, "end": 14.8, "speaker": "farmer", "text": "To xác chưa chắc đã chín đâu con! Hai đứa bay phải nằm phơi nắng thêm mấy ngày nữa!"},
        {"start": 15.0, "end": 17.6, "speaker": "melon_a", "text": "Ai mà thèm đợi nữa chứ! Cứ bắt người ta nằm chờ hoài hà!"},
        {"start": 17.8, "end": 22.0, "speaker": "melon_b", "text": "Ủa mày tính làm gì đó? Tự bứt cuống luôn! Buộc phải bưng tụi mình về nha!"},
        {"start": 22.2, "end": 29.4, "speaker": "farmer", "text": "Ủa cuống rụng rồi à? Thôi bổ ăn thử... Trời đất ơi! To xác mà ruột trắng bệch, nhạt toẹt, tiếc ghê!"},
        {"start": 30.2, "end": 33.5, "speaker": "farmer", "text": "Phải đợi thêm thời gian thì dưa mới tích đủ mật ngọt chứ!"},
        {"start": 34.2, "end": 42.5, "speaker": "narrator", "text": "Bài học: Dưa hấu đạt kích thước tối đa vẫn cần thêm thời gian để tích lũy độ ngọt tự nhiên."},
        {"start": 43.2, "end": 51.5, "speaker": "narrator", "text": "Mẹo chọn dưa: Vệt vàng cam dưới đáy, cuống khô teo và gõ nghe tiếng đục mới là dưa chín ngọt nha!"},
    ],
}

SOURCE_2_HASH = "d2fc318371a2372591af22388d89e1d7b64066cdd991524de84560cac87c8e9f"
SOURCE_2_PROFILE: Dict[str, Any] = {
    "id": "caterpillar-story-v2",
    "renderer": "/static/remake_caterpillar_demo.html",
    "default_audio_url": "/static/remake_caterpillar_master.mp3",
    "duration": 62.067,
    "characters": [
        {"id": "farmer", "name": "Bác nông dân", "voice_role": "adult", "avatar": "👨‍🌾", "evidence": [0.0, 12.0, 22.0]},
        {"id": "worm", "name": "Chú sâu xanh", "voice_role": "young_1", "avatar": "🐛", "evidence": [5.8, 16.0, 36.5]},
        {"id": "narrator", "name": "Lời bình", "voice_role": "narrator", "avatar": "🎙️", "evidence": [34.5, 58.0]},
    ],
    "cues": [
        {"start": 0.0, "end": 2.0, "speaker": "farmer", "text": "Này con sâu ranh con kia, lại mò vào ăn lá à!"},
        {"start": 2.1, "end": 4.2, "speaker": "farmer", "text": "Xem hôm nay tao xử đẹp mày thế nào!"},
        {"start": 5.8, "end": 8.5, "speaker": "worm", "text": "Lêu lêu! Cứ như ông mà đòi trị được bổn công tử này à!"},
        {"start": 12.0, "end": 13.9, "speaker": "farmer", "text": "Ủa tao xịt thuốc sâu xịn sò ngần này rồi cơ mà?"},
        {"start": 14.0, "end": 15.9, "speaker": "farmer", "text": "Chẳng lẽ thuốc dỏm nên sâu chưa bị diệt sao ta?"},
        {"start": 16.0, "end": 17.9, "speaker": "worm", "text": "Mắt ông để dưới gót chân hay sao vậy hả?!"},
        {"start": 18.0, "end": 19.2, "speaker": "worm", "text": "Thuốc có dính được giọt nào lên người tui đâu!"},
        {"start": 19.3, "end": 21.0, "speaker": "worm", "text": "Xịt hụt tùm lum thì làm sao mà diệt được tui hả trời!"},
        {"start": 22.0, "end": 24.2, "speaker": "farmer", "text": "Ban ngày mày nấp kỹ quá tao xịt không trúng chứ gì!"},
        {"start": 24.5, "end": 27.5, "speaker": "farmer", "text": "Cứ đợi đấy, tối nay tao nhất định sẽ quay lại phục kích mày!"},
        {"start": 28.0, "end": 30.0, "speaker": "worm", "text": "Thách ông luôn đó, tui lại sợ ông quá cơ!"},
        {"start": 30.2, "end": 34.0, "speaker": "farmer", "text": "Hôm nay ông đây quyết chiến tới cùng với mày luôn!"},
        {"start": 34.5, "end": 36.2, "speaker": "narrator", "text": "Đêm khuya thanh vắng, bác nông dân rình ngoài vườn."},
        {"start": 36.5, "end": 38.5, "speaker": "worm", "text": "Trời đất ơi trong kẽ lá này oi bức ngột ngạt quá!"},
        {"start": 38.6, "end": 41.0, "speaker": "worm", "text": "Phải bò ra ngoài hóng gió mát tí cho đỡ ngột ngạt coi..."},
        {"start": 41.2, "end": 43.5, "speaker": "worm", "text": "Aha! Gió mát trăng thanh, đã cái nư ghê chưa kìa!"},
        {"start": 44.5, "end": 47.0, "speaker": "farmer", "text": "Đã cái nư hả mậy?! Xem hôm nay mày chạy đằng trời nè con!"},
        {"start": 47.0, "end": 48.5, "speaker": "worm", "text": "Ủa mẹ ơi cứu con!"},
        {"start": 48.5, "end": 51.2, "speaker": "worm", "text": "Nửa đêm nửa hôm ngần này rồi mà ông còn chưa chịu đi ngủ hả?!"},
        {"start": 51.5, "end": 53.5, "speaker": "farmer", "text": "Vì để bắt sống được cái thứ ranh mãnh như mày..."},
        {"start": 53.8, "end": 57.5, "speaker": "farmer", "text": "Có biết ông đây phải thức trắng đêm khổ cực thế nào không hả?!"},
        {"start": 58.0, "end": 61.8, "speaker": "narrator", "text": "Mẹo nhà nông: Sâu cuốn lá thường bò ra ngoài vào ban đêm, soi đèn bắt sâu là cách an toàn và hiệu quả nhất!"},
    ],
}

SOURCE_4_HASH = "91ff438871dfa3957ec1ac4971539b91984f93bddeab843b12ab8341598b6132"
SOURCE_4_PROFILE: Dict[str, Any] = {
    "id": "peanut-plant-story-v2",
    "renderer": "/static/remake_peanut_demo.html",
    "default_audio_url": "/static/remake_projects/{project_id}/source.mp4",
    "default_locale": "zh-CN",
    "duration": 44.118,
    "characters": [
        {"id": "peanut_plant", "name": "Cây lạc", "voice_role": "young_1", "avatar": "🌿", "evidence": [1.6, 4.1, 24.9]},
        {"id": "root_a", "name": "Rễ lạc A", "voice_role": "young_2", "avatar": "🌱", "evidence": [2.1, 5.5, 22.7]},
        {"id": "root_b", "name": "Rễ lạc B", "voice_role": "young_2", "avatar": "🌱", "evidence": [9.7, 11.6, 16.1]},
        {"id": "farmer", "name": "Người trồng", "voice_role": "adult", "avatar": "🧑‍🌾", "evidence": [20.4, 26.4, 40.0]},
    ],
    # Text is transcribed from the visible source subtitles and locked to the
    # source timeline. The renderer may redesign shapes, never story events.
    "cues": [
        {"start": 1.55, "end": 2.09, "speaker": "peanut_plant", "text": "喂"},
        {"start": 2.09, "end": 3.53, "speaker": "root_a", "text": "干什么"},
        {"start": 4.05, "end": 4.83, "speaker": "peanut_plant", "text": "去哪里啊"},
        {"start": 5.53, "end": 6.57, "speaker": "root_a", "text": "土里"},
        {"start": 6.57, "end": 7.83, "speaker": "peanut_plant", "text": "然后呢"},
        {"start": 7.83, "end": 9.71, "speaker": "root_a", "text": "上班长成花生呀"},
        {"start": 9.71, "end": 10.99, "speaker": "root_b", "text": "不上班行不行"},
        {"start": 11.55, "end": 13.67, "speaker": "root_b", "text": "不上班你养我啊"},
        {"start": 14.43, "end": 16.05, "speaker": "peanut_plant", "text": "喂，又怎么了"},
        {"start": 16.05, "end": 17.09, "speaker": "root_a", "text": "我养你"},
        {"start": 20.35, "end": 22.67, "speaker": "farmer", "text": "你俩不上班谁养我呀"},
        {"start": 22.67, "end": 24.85, "speaker": "root_a", "text": "上班就上班嘛"},
        {"start": 24.85, "end": 26.39, "speaker": "peanut_plant", "text": "干嘛踩我呀"},
        {"start": 26.39, "end": 28.73, "speaker": "farmer", "text": "我正是在帮你"},
        {"start": 28.73, "end": 30.99, "speaker": "farmer", "text": "让植株贴着地面生长"},
        {"start": 30.99, "end": 33.17, "speaker": "farmer", "text": "这样会繁殖出更多的花针"},
        {"start": 33.17, "end": 34.17, "speaker": "farmer", "text": "扎入土壤里"},
        {"start": 34.17, "end": 36.59, "speaker": "farmer", "text": "让花生的产量翻倍呀"},
        {"start": 38.60, "end": 41.10, "speaker": "farmer", "text": "这用脚踩过的花生苗"},
        {"start": 41.10, "end": 43.22, "speaker": "farmer", "text": "果然产量就是好"},
    ],
}

PROFILES_BY_HASH = {
    SOURCE_1_HASH: SOURCE_1_PROFILE,
    SOURCE_2_HASH: SOURCE_2_PROFILE,
    SOURCE_4_HASH: SOURCE_4_PROFILE,
}


PROJECTS_DIR = Path(__file__).resolve().parent / "static" / "remake_projects"


def profile_for_source(source_sha256: str) -> Optional[Dict[str, Any]]:
    """Tìm hồ sơ nhân vật của một video nguồn.

    Ngoài 3 hồ sơ viết tay sẵn có, còn đọc `profile.json` do pipeline sinh ra cho
    từng project. Thiếu bước này thì mọi video người dùng tự upload đều không
    lồng tiếng được (luôn trả 409 "chưa có Story Bible").
    """
    if not source_sha256:
        return None

    profile = PROFILES_BY_HASH.get(source_sha256)
    if profile:
        return profile

    if not PROJECTS_DIR.exists():
        return None
    for profile_path in PROJECTS_DIR.glob("*/profile.json"):
        try:
            candidate = json.loads(profile_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if candidate.get("source_sha256") != source_sha256:
            continue
        if candidate.get("characters") and candidate.get("cues"):
            return candidate
    return None


def public_country(country: Dict[str, Any]) -> Dict[str, Any]:
    return {key: country[key] for key in ("code", "country", "language", "flag")}


def _extract_json(text: str) -> Any:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I | re.S)
    start, end = cleaned.find("["), cleaned.rfind("]")
    if start < 0 or end <= start:
        raise ValueError("AI không trả về danh sách JSON hợp lệ")
    return json.loads(cleaned[start:end + 1])


def translate_cues(
    cues: List[Dict[str, Any]], locale: str, source_locale: str = "vi-VN"
) -> List[Dict[str, Any]]:
    if locale == source_locale:
        return [{**cue, "source_text": cue["text"], "locale": locale} for cue in cues]
    country = COUNTRY_BY_CODE.get(locale)
    if not country:
        raise ValueError(f"Quốc gia/ngôn ngữ chưa được hỗ trợ: {locale}")
    api_key = key_vault.get_key("ai.gemini")
    if not api_key:
        raise RuntimeError("Chưa cấu hình Google Gemini API key để dịch lời thoại")
    payload_cues = [{"index": i, "speaker": cue["speaker"], "text": cue["text"]} for i, cue in enumerate(cues)]
    prompt = (
        f"Bạn là đạo diễn lồng tiếng hoạt hình. Dịch các câu sau sang {country['language']} "
        f"dùng tự nhiên tại {country['country']}. Giữ nguyên nhân vật, ý nghĩa, cảm xúc và sự kiện; "
        "không thêm nhân vật, tình tiết hay lời giải thích. Viết gọn để khớp thời lượng. "
        "Chỉ trả về JSON array [{\"index\":0,\"text\":\"...\"}] đủ đúng số câu.\n"
        + json.dumps(payload_cues, ensure_ascii=False)
    )
    try:
        from bkt_web.services import gemini
    except ImportError:
        from services import gemini
    model = os.environ.get("TOKMATRIX_GEMINI_MODEL", "gemini-flash-latest")
    try:
        raw = gemini.generate(prompt, models=[model], key=api_key, temperature=0.2, timeout=90, attempts=4, retry_delay=2)
    except gemini.GeminiError:
        try:
            from deep_translator import GoogleTranslator
            target = {"zh-CN": "zh-CN", "zh-TW": "zh-TW"}.get(locale, locale.split("-", 1)[0])
            source = {"zh-CN": "zh-CN", "zh-TW": "zh-TW"}.get(source_locale, source_locale.split("-", 1)[0])
            translated_lines = [GoogleTranslator(source=source, target=target).translate(cue["text"]) for cue in cues]
            if all(translated_lines):
                return [
                    {**cue, "source_text": cue["text"], "text": translated_lines[index], "locale": locale}
                    for index, cue in enumerate(cues)
                ]
        except Exception:
            pass
        raise
    translated = _extract_json(raw)
    by_index = {int(item["index"]): str(item["text"]).strip() for item in translated}
    if set(by_index) != set(range(len(cues))) or any(not text for text in by_index.values()):
        raise ValueError("Bản dịch thiếu câu hoặc sai thứ tự; hệ thống đã dừng để tránh đổi nội dung")
    return [
        {**cue, "source_text": cue["text"], "text": by_index[index], "locale": locale}
        for index, cue in enumerate(cues)
    ]


def _audio_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def _atempo_chain(speed: float) -> str:
    factors: List[float] = []
    while speed > 2.0:
        factors.append(2.0)
        speed /= 2.0
    while speed < 0.5:
        factors.append(0.5)
        speed /= 0.5
    factors.append(speed)
    return ",".join(f"atempo={factor:.5f}" for factor in factors)


def synthesize_locale(
    project_dir: Path,
    profile: Dict[str, Any],
    locale: str,
    log: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    log = log or (lambda _message: None)
    country = COUNTRY_BY_CODE.get(locale)
    if not country:
        raise ValueError(f"Locale chưa được hỗ trợ: {locale}")
    locale_dir = project_dir / "locales" / locale
    clips_dir = locale_dir / "clips"
    package_path = locale_dir / "dialogue.json"
    master_path = locale_dir / "master.mp3"
    if package_path.exists() and master_path.exists():
        try:
            cached = json.loads(package_path.read_text(encoding="utf-8"))
            if cached.get("locale") == locale and len(cached.get("cues", [])) == len(profile["cues"]):
                log(f"{country['flag']} Dùng lại gói voice đã kiểm tra")
                return cached
        except (OSError, json.JSONDecodeError):
            pass
    cues = translate_cues(profile["cues"], locale, profile.get("default_locale", "vi-VN"))
    characters = {character["id"]: character for character in profile["characters"]}
    clips_dir.mkdir(parents=True, exist_ok=True)

    mixed_inputs: List[str] = []
    filters: List[str] = []
    labels: List[str] = []
    for index, cue in enumerate(cues):
        character = characters[cue["speaker"]]
        role = character["voice_role"]
        voice = country["voices"][role]
        rate = "+8%" if role.startswith("young") else ("-4%" if role == "narrator" else "+0%")
        pitch = "+10Hz" if role == "young_1" else ("-8Hz" if role == "young_2" else "+0Hz")
        raw_path = clips_dir / f"{index:02d}-raw.mp3"
        fit_path = clips_dir / f"{index:02d}.mp3"
        log(f"{country['flag']} {character['name']}: tạo câu {index + 1}/{len(cues)}")
        result = subprocess.run(
            ["edge-tts", "--voice", voice, f"--rate={rate}", f"--pitch={pitch}", "--text", cue["text"], "--write-media", str(raw_path)],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0 or not raw_path.exists():
            raise RuntimeError(f"Không tạo được giọng {voice}: {result.stderr[-240:]}")
        slot = max(0.4, float(cue["end"]) - float(cue["start"]))
        raw_duration = _audio_duration(raw_path)
        speed = max(0.5, raw_duration / slot)
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(raw_path), "-filter:a", _atempo_chain(speed), "-t", f"{slot:.3f}", str(fit_path)],
            capture_output=True, text=True, check=True,
        )
        cue["voice"] = voice
        cue["character_name"] = character["name"]
        mixed_inputs.extend(["-i", str(fit_path)])
        label = f"voice{index}"
        delay = round(float(cue["start"]) * 1000)
        filters.append(f"[{index}:a]adelay={delay}|{delay},apad[{label}]")
        labels.append(f"[{label}]")

    duration = float(profile["duration"])
    filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0,alimiter=limit=0.95[out]")
    subprocess.run(
        ["ffmpeg", "-y", *mixed_inputs, "-filter_complex", ";".join(filters), "-map", "[out]", "-t", f"{duration:.3f}", str(master_path)],
        capture_output=True, text=True, check=True,
    )
    package = {
        "locale": locale,
        "country": public_country(country),
        "audio_url": f"/static/remake_projects/{project_dir.name}/locales/{locale}/master.mp3",
        "cues": cues,
        "characters": profile["characters"],
        "duration": duration,
    }
    package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2), encoding="utf-8")
    return package
