"""Caption đăng TikTok cho mọi thể loại video Compare Studio (thay publishing-kit.mjs).

publishing-kit.mjs chỉ biết mẫu "A vs B" và chỉ đọc spec.json, nên video Tâm Linh ra
tiêu đề "Đừng nhầm lẫn giữa FOLKLORE-… và Side B" và hashtag #sideb. Module này:

- nhận diện thể loại bằng compare_native.detect_video_type;
- đọc tiêu đề / câu mở / lời thoại theo nơi mỗi thể loại thật sự lưu (bảng 3.1 của
  docs/PLAN_render_to_tiktok_publish.md), dựa trên video_detail đã chuẩn hoá sẵn;
- ghép 3 tiêu đề, mô tả, hashtag theo thể loại × ngôn ngữ; giữ dưới 2200 ký tự.

Kết quả giữ đúng các khoá giao diện đang đọc (titles[].title, description, hashtags[],
hashtagString) và thêm caption / type / lang / aiGenerated.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional

try:
    from bkt_web import compare_native as cn
except ImportError:  # chạy trực tiếp trong bkt_web/
    import compare_native as cn

LANGS = ("vi", "en", "de", "fr", "ja", "ko")
MAX_CAPTION = 2200
MAX_HASHTAGS = 8

# Hashtag riêng của thể loại (bảng 3.3 trong plan).
TYPE_HASHTAGS: Dict[str, Dict[str, List[str]]] = {
    "compare": {"vi": ["sosanh", "kienthuc", "phanbiet"], "en": ["comparison", "learnontiktok"], "de": ["vergleich", "wissen"],
                "fr": ["comparaison", "savoir"], "ja": ["比較", "豆知識"], "ko": ["비교", "상식"]},
    "survival": {"vi": ["sinhton", "khoahoc", "neuthi"], "en": ["survival", "whatif"], "de": ["überleben", "wasWäreWenn"],
                 "fr": ["survie", "etsi"], "ja": ["サバイバル", "もしも"], "ko": ["생존", "만약에"]},
    "tierlist": {"vi": ["tierlist", "xephang"], "en": ["tierlist", "ranking"], "de": ["tierlist", "ranking"],
                 "fr": ["tierlist", "classement"], "ja": ["ティアリスト", "ランキング"], "ko": ["티어리스트", "순위"]},
    "vox": {"vi": ["giaithich", "phongsu"], "en": ["explained", "documentary"], "de": ["erklärt", "doku"],
            "fr": ["expliqué", "documentaire"], "ja": ["解説", "ドキュメンタリー"], "ko": ["해설", "다큐"]},
    "newspaper": {"vi": ["lichsu", "vuandieutra"], "en": ["history", "truestory"], "de": ["geschichte", "wahregeschichte"],
                  "fr": ["histoire", "faitdivers"], "ja": ["歴史", "実話"], "ko": ["역사", "실화"]},
    "chalk": {"vi": ["diachinhtri", "bando"], "en": ["geopolitics", "maps"], "de": ["geopolitik", "karten"],
              "fr": ["géopolitique", "cartes"], "ja": ["地政学", "地図"], "ko": ["지정학", "지도"]},
    "wildlife": {"vi": ["dongvat", "thiennhien"], "en": ["wildlife", "animals"], "de": ["tiere", "natur"],
                 "fr": ["animaux", "nature"], "ja": ["動物", "自然"], "ko": ["동물", "자연"]},
    "kinetic": {"vi": ["tamly", "tuduy"], "en": ["psychology", "mindset"], "de": ["psychologie", "mindset"],
                "fr": ["psychologie", "mindset"], "ja": ["心理学", "思考"], "ko": ["심리학", "사고방식"]},
    "science": {"vi": ["khoahoc", "vutru"], "en": ["science", "space"], "de": ["wissenschaft", "weltraum"],
                "fr": ["science", "espace"], "ja": ["科学", "宇宙"], "ko": ["과학", "우주"]},
    "mystery": {"vi": ["bian", "vuan", "chuacoloigiai"], "en": ["mystery", "unsolved"], "de": ["mysterium", "ungelöst"],
                "fr": ["mystère", "énigme"], "ja": ["ミステリー", "未解決"], "ko": ["미스터리", "미제사건"]},
    "folklore": {"vi": ["tamlinh", "chuyenma", "dangian"], "en": ["folklore", "ghoststory", "creepy"], "de": ["sagen", "gruselig"],
                 "fr": ["légende", "frisson"], "ja": ["怪談", "民俗"], "ko": ["괴담", "민담"]},
}
LANG_HASHTAGS = {"vi": ["xuhuong", "fyp"], "en": ["fyp", "foryou"], "de": ["fürdich", "fyp"],
                 "fr": ["pourtoi", "fyp"], "ja": ["おすすめ", "fyp"], "ko": ["추천", "fyp"]}

# Mẫu tiêu đề thứ 3 (dạng câu hỏi) và mẫu so sánh, theo ngôn ngữ.
QUESTION_TEMPLATE = {
    "vi": "{title}: bạn đã biết điều này chưa?", "en": "{title}: did you know this?",
    "de": "{title}: Wusstest du das?", "fr": "{title} : le saviez-vous ?",
    "ja": "{title}、知っていましたか？", "ko": "{title}, 알고 계셨나요?",
}
COMPARE_TEMPLATE = {
    "vi": "{left} vs {right}: khác nhau ở đâu?", "en": "{left} vs {right}: what's the real difference?",
    "de": "{left} vs. {right}: Was ist der Unterschied?", "fr": "{left} vs {right} : quelle différence ?",
    "ja": "{left}と{right}の違いとは？", "ko": "{left} vs {right}, 차이점은?",
}
TITLE_LABELS = {"hook": "Câu mở gây tò mò", "direct": "Tiêu đề thẳng", "question": "Dạng câu hỏi"}


def _clean(text: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(text or ""))).strip()


def _shorten(text: str, limit: int) -> str:
    text = _clean(text)
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0] if " " in text[: limit - 1] else text[: limit - 1]
    return cut.rstrip(" ,.;:—-") + "…"


def _humanize_slug(slug: str) -> str:
    words = [w for w in slug.split("-") if w and w not in LANGS]
    return " ".join(w.capitalize() for w in words)


def hashtag(word: str, lang: str) -> str:
    """#tag giữ chữ có dấu và chữ CJK; riêng tiếng Việt bỏ dấu như cách người dùng TikTok gõ."""
    text = str(word or "").strip().lstrip("#")
    if lang == "vi":
        text = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
        text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
        text = text.lower()
    text = re.sub(r"[^\w]", "", text, flags=re.UNICODE).replace("_", "")
    return f"#{text}" if text else ""


def _first(*values: Any) -> str:
    for v in values:
        s = _clean(v)
        if s:
            return s
    return ""


def _title_for(kind: str, slug: str, meta: Dict[str, Any], spec: Dict[str, Any], detail: Dict[str, Any]) -> Dict[str, str]:
    """Tiêu đề + nhãn trái/phải (compare) theo nơi mỗi thể loại lưu dữ liệu."""
    g = cn.g
    name = _clean(g(meta, "name"))
    if name.lower() == slug.lower():
        name = ""  # chalk/newspaper cũ ghi slug vào meta.name
    if kind == "compare":
        left = _first(g(spec, "labelLeft"))
        right = _first(g(spec, "labelRight"))
        if not (left and right) and "-vs-" in slug:
            a, b = slug.split("-vs-", 1)
            left = left or _humanize_slug(a)
            right = right or _humanize_slug(b)
        return {"title": f"{left} vs {right}" if left and right else _first(g(spec, "title"), name, _humanize_slug(slug)),
                "left": left, "right": right}
    by_kind = {
        "survival": (g(spec, "survivalConfig", "title"), g(meta, "survivalConfig", "title"), name),
        "tierlist": (g(spec, "topicTitle"), g(spec, "tierListConfig", "topicTitle"), g(meta, "tierListConfig", "topicTitle"), g(spec, "headline"), name),
        "vox": (g(meta, "voxConfig", "topicTitle"), g(spec, "voxConfig", "topicTitle"), g(spec, "title"), name),
        "newspaper": (g(meta, "newspaperConfig", "topicTitle"), g(meta, "newspaperConfig", "headline"), name, g(spec, "title")),
        "chalk": (g(spec, "topicTitle"), g(spec, "chalkConfig", "topicTitle"), g(meta, "chalkConfig", "topicTitle"), g(spec, "headline"), name),
        "wildlife": (g(meta, "wildlifeConfig", "topicTitle"), g(spec, "wildlifeConfig", "topicTitle"), g(spec, "title"), name),
        "kinetic": (g(meta, "kineticConfig", "headline"), g(meta, "kineticConfig", "topicTitle"), name, g(spec, "title")),
        "science": (name, g(spec, "title"), g(spec, "scienceConfig", "title")),
        "mystery": (g(meta, "mysteryConfig", "topicTitle"), g(spec, "mysteryConfig", "topicTitle"), g(spec, "title"), name),
        "folklore": (g(meta, "folkloreConfig", "topicTitle"), g(spec, "folkloreConfig", "topicTitle"), g(spec, "title"), name),
    }
    title = _first(*by_kind.get(kind, ()), g(spec, "title"), name)
    if kind == "wildlife":
        latin = _first(g(meta, "wildlifeConfig", "latinName"), g(spec, "wildlifeConfig", "latinName"))
        if latin and latin.lower() not in title.lower():
            title = f"{title} ({latin})"
    return {"title": title or _humanize_slug(slug), "left": "", "right": ""}


def _lang_for(slug: str, meta: Dict[str, Any], spec: Dict[str, Any], detail: Dict[str, Any]) -> str:
    g = cn.g
    for value in (detail.get("lang"), g(spec, "lang"), g(meta, "lang"),
                  *(g(meta, key, "lang") for key in ("folkloreConfig", "mysteryConfig", "wildlifeConfig", "survivalConfig", "voxConfig"))):
        if isinstance(value, str) and value[:2] in LANGS:
            return value[:2]
    tail = slug.rsplit("-", 1)[-1]
    return tail if tail in LANGS else "en"


async def build_publish_kit(slug: str) -> Dict[str, Any]:
    """Caption, 3 tiêu đề, mô tả và hashtag cho một video — mọi thể loại, 6 ngôn ngữ."""
    d = cn._video_dir(slug)
    meta = cn.read_json(d / "meta.json") or {}
    spec_raw = cn.read_json(d / "spec.json") or {}
    detail = await cn.video_detail(slug)
    spec = detail.get("spec") if isinstance(detail.get("spec"), dict) else spec_raw
    kind = detail.get("type") or cn.detect_video_type_for_slug(slug)
    lang = _lang_for(slug, meta, spec or {}, detail)

    names = _title_for(kind, slug, meta, spec or {}, detail)
    title = names["title"]
    script = [x for x in detail.get("script") or [] if isinstance(x, dict)]
    lines = [_clean(x.get("spoken") or x.get("caption")) for x in script]
    lines = [re.sub(r"\[\[(.*?)\]\]|\*(.*?)\*", lambda m: m.group(1) or m.group(2) or "", l) for l in lines if l]
    if not lines:
        # newspaper/kinetic cũ không lưu lời thoại: dùng tiêu đề báo / câu chốt từng nhịp.
        lines = [_clean(x.get("title")) for x in script
                 if _clean(x.get("title")) and not re.fullmatch(r"(Nhịp|Hồi|Cảnh|Tư liệu|Giao thức) \d+", _clean(x.get("title")))]
    # Câu mở: không dùng BRIEF "message" của compare — đó là ghi chú nội bộ, có thể khác ngôn ngữ video.
    hook = _first(
        cn.g(meta, "folkloreConfig", "hook") if kind == "folklore" else None,
        cn.g(script, 0, "hook") if kind == "tierlist" else None,
        (detail.get("message") if kind == "science" else None),
        lines[0] if lines else None,
        title,
    )
    if _clean(hook).lower() == _clean(title).lower() and len(lines) > 1:
        hook = lines[1]

    direct = COMPARE_TEMPLATE[lang].format(left=names["left"], right=names["right"]) if kind == "compare" and names["left"] else title
    titles = [
        {"type": "hook", "label": TITLE_LABELS["hook"], "title": _shorten(hook, 150)},
        {"type": "direct", "label": TITLE_LABELS["direct"], "title": _shorten(direct, 150)},
        {"type": "question", "label": TITLE_LABELS["question"], "title": _shorten(QUESTION_TEMPLATE[lang].format(title=title), 150)},
    ]

    tags: List[str] = []
    if kind == "compare" and names["left"]:
        tags += [hashtag(names["left"], lang).lower(), hashtag(names["right"], lang).lower()]
    tags += [hashtag(t, lang) for t in TYPE_HASHTAGS.get(kind, {}).get(lang, [])]
    tags += [hashtag(t, lang) for t in LANG_HASHTAGS.get(lang, ["fyp"])]
    seen, hashtags = set(), []
    for t in tags:
        if t and len(t) > 1 and t.lower() not in seen:
            seen.add(t.lower())
            hashtags.append(t)
    hashtags = hashtags[:MAX_HASHTAGS]
    hashtag_string = " ".join(hashtags)

    body_lines = [l for l in lines if l and l != hook][:2]
    description = _shorten(" ".join(body_lines), 300)
    budget = MAX_CAPTION - len(hashtag_string) - 1  # publisher ghép "caption hashtags"
    caption = titles[0]["title"] + (f"\n\n{description}" if description else "")
    if len(caption) > budget:
        caption = _shorten(caption, budget)

    return {
        "slug": slug,
        "type": kind,
        "lang": lang,
        "title": title,
        "labelLeft": names["left"],
        "labelRight": names["right"],
        "titles": titles,
        "description": description,
        "caption": caption,
        "hashtags": hashtags,
        "hashtagString": hashtag_string,
        # Mọi thể loại đều dùng giọng TTS (và nhiều thể loại dùng ảnh AI) → khai báo AI.
        "aiGenerated": True,
        "rootDuration": detail.get("duration"),
        "chapters": [],
    }
