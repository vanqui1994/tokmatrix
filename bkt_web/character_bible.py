"""Project-level identity and appearance contract for layered 2D characters.

The storyboard repeats entities per scene.  A character bible collapses those
occurrences into one stable identity so hair, palette and proportions cannot
drift between scenes.  Values are deterministic and editable through the
review API; no render-time randomness or network access is involved.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Mapping


CHARACTER_BIBLE_SCHEMA = "tokmatrix.character-bible/v1"
CHARACTER_KINDS = frozenset({"character", "human", "person", "puppet", "animal"})
HAIR_STYLES = ("crop", "bob", "waves", "side-part", "bun", "curly")
SKIN_TONES = ("#f2cfb3", "#e8b990", "#d9956c", "#a96545", "#74432f")
PALETTES = (
    ("#2f6f5a", "#e3a857", "#28443b", "#f6eee2"),
    ("#4c5f91", "#d87967", "#303957", "#f4eadf"),
    ("#8a4f3d", "#d9a441", "#523126", "#f8edda"),
    ("#6b4f86", "#cf7f73", "#40334d", "#f3e9e3"),
    ("#28737b", "#e89b55", "#25464a", "#f5eddf"),
)
EXPRESSIONS = ("neutral", "happy", "worried", "angry", "sad", "surprised", "smug", "sleep")


def _dramatic_profile(label: str, asset: str = "") -> dict[str, Any]:
    """Small deterministic writer's room for a cast member, never a speaker guess."""
    text = f"{label} {asset}".casefold()
    if any(word in text for word in ("farmer", "nông", "fisher", "người")):
        return {"role": "caretaker", "want": "giữ mọi thứ an toàn và phát triển", "tension": "muốn kiểm soát quá nhanh", "arc": "quan sát → hành động → nhẹ nhõm", "range": ["neutral", "worried", "happy", "surprised"]}
    if any(word in text for word in ("fish", "cá")):
        return {"role": "free-spirit", "want": "bơi tự do và thoát khỏi mối nguy", "tension": "bị kéo giữa tò mò và bản năng sinh tồn", "arc": "tự do → mắc kẹt → giải thoát hoặc thích nghi", "range": ["neutral", "happy", "worried", "surprised"]}
    if any(word in text for word in ("monster", "quái", "sea_monster", "thủy")):
        return {"role": "force-of-nature", "want": "bảo vệ lãnh địa hoặc đòi lại sự chú ý", "tension": "sức mạnh lớn nhưng cảm xúc dễ bùng nổ", "arc": "ẩn mình → cảnh báo → đối đầu → lắng xuống", "range": ["neutral", "angry", "worried", "surprised"]}
    if any(word in text for word in ("boat", "thuyền")):
        return {"role": "fragile-shelter", "want": "giữ mọi người nổi và cùng hướng", "tension": "mong manh trước sóng và va chạm", "arc": "ổn định → chao đảo → an toàn", "range": ["neutral", "worried"]}
    if any(word in text for word in ("tree", "plant", "cây", "papaya", "tomato_plant", "peanut")):
        return {"role": "living-stakes", "want": "được chăm sóc và tồn tại", "tension": "mong manh trước tác động bên ngoài", "arc": "bình yên → nguy cơ → hồi phục", "range": ["neutral", "worried", "sad", "happy"]}
    if any(word in text for word in ("apple", "tomato", "watermelon", "pepper", "fruit", "quả", "dưa", "táo", "ớt")):
        return {"role": "heart-of-scene", "want": "được bảo vệ hoặc được chọn đúng lúc", "tension": "phản ứng trực tiếp với nguy hiểm", "arc": "tò mò → bất ngờ → an toàn", "range": ["neutral", "happy", "worried", "surprised", "sad"]}
    if any(word in text for word in ("knife", "dao", "sprayer", "tool", "bucket", "bag", "seed", "hạt")):
        return {"role": "story-catalyst", "want": "hoàn thành đúng thao tác", "tension": "sai contact sẽ tạo hậu quả", "arc": "chờ → tác động → kết quả", "range": ["neutral", "surprised"]}
    return {"role": "supporting-character", "want": "đóng góp vào tình huống", "tension": "cần phản ứng rõ với beat chính", "arc": "giới thiệu → phản ứng → kết", "range": ["neutral", "happy", "worried", "surprised"]}


def _expression_for_text(text: str) -> str:
    value = text.casefold()
    if any(token in value for token in ("!", "wow", "ôi", "trời", "ghê", "à?")):
        return "surprised"
    if any(token in value for token in ("không", "đừng", "nguy", "sợ", "đau", "mất", "buồn")):
        return "worried"
    if any(token in value for token in ("giận", "tức", "hỏng", "sai")):
        return "angry"
    if any(token in value for token in ("tốt", "hay", "được", "cảm ơn", "vui", "ngon")):
        return "happy"
    return "neutral"


class CharacterBibleError(ValueError):
    pass


def _slug(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return text[:48] or "character"


def _identity(entity: Mapping[str, Any]) -> str:
    attrs = entity.get("attributes") if isinstance(entity.get("attributes"), Mapping) else {}
    return str(attrs.get("identity_id") or entity.get("label") or entity.get("entity_id") or "character").strip()


def _pick(seed: str, values: tuple[Any, ...], offset: int = 0) -> Any:
    digest = hashlib.sha256(f"{seed}:{offset}".encode("utf-8")).digest()
    return values[int.from_bytes(digest[:4], "big") % len(values)]


def _rig_for(label: str, attrs: Mapping[str, Any]) -> str:
    if isinstance(attrs.get("rig"), str) and attrs["rig"]:
        return attrs["rig"]
    text = f"{label} {attrs.get('age_group', '')} {attrs.get('role', '')}".casefold()
    if any(word in text for word in ("child", "kid", "baby", "trẻ", "bé", "em ")):
        return "puppet.rig.child"
    if any(word in text for word in ("presenter", "host", "anchor", "mc", "người dẫn")):
        return "puppet.rig.presenter"
    return "puppet.rig.adult"


def build_character_bible(storyboard: Mapping[str, Any], *, project_id: str | None = None) -> dict[str, Any]:
    """Build one deterministic record per semantic character identity."""
    records: dict[str, dict[str, Any]] = {}
    for scene in storyboard.get("scenes", []) or []:
        if not isinstance(scene, Mapping):
            continue
        for entity in scene.get("entities", []) or []:
            if not isinstance(entity, Mapping) or entity.get("kind") not in CHARACTER_KINDS:
                continue
            label = _identity(entity)
            key = label.casefold()
            entity_id = str(entity.get("entity_id") or label)
            record = records.get(key)
            if record is None:
                attrs = entity.get("attributes") if isinstance(entity.get("attributes"), Mapping) else {}
                seed = f"{project_id or storyboard.get('project_id', '')}:{key}"
                palette = _pick(seed, PALETTES)
                character_id = f"char.{_slug(label)}.{hashlib.sha256(key.encode()).hexdigest()[:6]}"
                record = {
                    "character_id": character_id,
                    "label": label,
                    "status": "draft",
                    "rig": _rig_for(label, attrs),
                    "style": "editorial-cartoon-v1",
                    "appearance": {
                        "skin": attrs.get("skin", _pick(seed, SKIN_TONES, 1)),
                        "hair": attrs.get("hair", "#322923"),
                        "hair_style": attrs.get("hair_style", _pick(seed, HAIR_STYLES, 2)),
                        "outfit_primary": attrs.get("outfit", palette[0]),
                        "outfit_secondary": attrs.get("outfit_secondary", palette[1]),
                        "trousers": attrs.get("trousers", palette[2]),
                        "shoes": attrs.get("shoes", "#2b2825"),
                        "outline": attrs.get("outline", "#26352f"),
                        "accessory": attrs.get("accessory", "none"),
                    },
                    "entity_refs": [],
                    "scene_ids": [],
                    "performance": _dramatic_profile(label),
                }
                records[key] = record
            if entity_id not in record["entity_refs"]:
                record["entity_refs"].append(entity_id)
            scene_id = str(scene.get("scene_id", ""))
            if scene_id and scene_id not in record["scene_ids"]:
                record["scene_ids"].append(scene_id)

    # Classic remake/vector scripts already store a canonical cast instead of
    # Universal Storyboard entities. Include every role (including living fruit
    # and tools) so every approved script gets a writer-facing character plan.
    for character in storyboard.get("characters", []) or []:
        if not isinstance(character, Mapping):
            continue
        label = str(character.get("name") or character.get("id") or "character").strip()
        if not label:
            continue
        key = label.casefold()
        if key in records:
            continue
        asset = str(character.get("asset") or "")
        seed = f"{project_id or storyboard.get('project_id', '')}:{key}"
        palette = _pick(seed, PALETTES)
        records[key] = {
            "character_id": f"char.{_slug(label)}.{hashlib.sha256(key.encode()).hexdigest()[:6]}",
            "label": label, "status": "draft", "rig": _rig_for(label, character), "style": "editorial-cartoon-v1",
            "appearance": {"skin": _pick(seed, SKIN_TONES, 1), "hair": "#322923", "hair_style": _pick(seed, HAIR_STYLES, 2), "outfit_primary": palette[0], "outfit_secondary": palette[1], "trousers": palette[2], "shoes": "#2b2825", "outline": "#26352f", "accessory": "none"},
            "entity_refs": [str(character.get("id") or label)], "scene_ids": [],
            "performance": _dramatic_profile(label, asset),
        }

    characters = sorted(records.values(), key=lambda item: item["character_id"])
    return {
        "schema": CHARACTER_BIBLE_SCHEMA,
        "version": "1.0.0",
        "project_id": project_id or storyboard.get("project_id", "remake"),
        "style": {
            "preset": "warm-editorial-2d",
            "line_weight": "bold",
            "layer_order": ["shadow", "back_hair", "legs", "torso", "arms", "head", "face", "front_hair", "accessory"],
        },
        "review_status": "approved" if characters and all(item["status"] == "approved" for item in characters) else "draft",
        "characters": characters,
        "performance_plan": build_performance_plan(storyboard),
    }


def validate_character_bible(document: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and return a defensive, JSON-safe copy."""
    if not isinstance(document, Mapping) or document.get("schema") != CHARACTER_BIBLE_SCHEMA:
        raise CharacterBibleError(f"schema phải là {CHARACTER_BIBLE_SCHEMA}")
    chars = document.get("characters")
    if not isinstance(chars, list):
        raise CharacterBibleError("characters phải là list")
    seen: set[str] = set()
    for index, char in enumerate(chars):
        if not isinstance(char, Mapping):
            raise CharacterBibleError(f"characters[{index}] phải là object")
        char_id = char.get("character_id")
        if not isinstance(char_id, str) or not char_id or char_id in seen:
            raise CharacterBibleError(f"characters[{index}].character_id không hợp lệ hoặc trùng")
        seen.add(char_id)
        if char.get("status") not in {"draft", "approved"}:
            raise CharacterBibleError(f"characters[{index}].status không hợp lệ")
        if char.get("rig") not in {"puppet.rig.adult", "puppet.rig.child", "puppet.rig.presenter"}:
            raise CharacterBibleError(f"characters[{index}].rig không hợp lệ")
        appearance = char.get("appearance")
        if not isinstance(appearance, Mapping):
            raise CharacterBibleError(f"characters[{index}].appearance phải là object")
        for name in ("skin", "hair", "outfit_primary", "outfit_secondary", "trousers", "shoes", "outline"):
            value = appearance.get(name)
            if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
                raise CharacterBibleError(f"characters[{index}].appearance.{name} phải là màu #rrggbb")
        if appearance.get("hair_style") not in HAIR_STYLES:
            raise CharacterBibleError(f"characters[{index}].appearance.hair_style không hợp lệ")
        performance = char.get("performance", {})
        if not isinstance(performance, Mapping) or not isinstance(performance.get("role"), str) or not isinstance(performance.get("range"), list) or not set(performance["range"]).issubset(EXPRESSIONS):
            raise CharacterBibleError(f"characters[{index}].performance không hợp lệ")
    result = json.loads(json.dumps(document, ensure_ascii=False))
    performance_plan = result.get("performance_plan")
    if performance_plan is not None:
        if not isinstance(performance_plan, Mapping) or performance_plan.get("schema") != "tokmatrix.performance-plan/v1" or not isinstance(performance_plan.get("beats"), list):
            raise CharacterBibleError("performance_plan không hợp lệ")
    result["review_status"] = "approved" if chars and all(item.get("status") == "approved" for item in chars) else "draft"
    return result


def save_character_bible(path: Path, document: Mapping[str, Any]) -> dict[str, Any]:
    clean = validate_character_bible(document)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)
    return clean


def load_character_bible(path: Path) -> dict[str, Any]:
    return validate_character_bible(json.loads(path.read_text(encoding="utf-8")))


def apply_character_bible(storyboard: Mapping[str, Any], bible: Mapping[str, Any]) -> dict[str, Any]:
    """Inject approved/draft appearance into every matching scene occurrence."""
    clean = validate_character_bible(bible)
    output = copy.deepcopy(storyboard)
    by_ref = {ref: char for char in clean["characters"] for ref in char.get("entity_refs", [])}
    by_label = {str(char.get("label", "")).casefold(): char for char in clean["characters"]}
    for scene in output.get("scenes", []) or []:
        for entity in scene.get("entities", []) or []:
            if entity.get("kind") not in CHARACTER_KINDS:
                continue
            char = by_ref.get(entity.get("entity_id")) or by_label.get(_identity(entity).casefold())
            if not char:
                continue
            attrs = entity.setdefault("attributes", {})
            appearance = char["appearance"]
            attrs.update({
                "character_id": char["character_id"], "rig": char["rig"],
                "skin": appearance["skin"], "hair": appearance["hair"],
                "hair_style": appearance["hair_style"], "outfit": appearance["outfit_primary"],
                "outfit_secondary": appearance["outfit_secondary"], "trousers": appearance["trousers"],
                "shoes": appearance["shoes"], "outline": appearance["outline"],
                "accessory": appearance.get("accessory", "none"), "character_style": char["style"],
            })
    return output


def build_performance_plan(storyboard: Mapping[str, Any]) -> dict[str, Any]:
    """Return speaker-safe performance beats for an approved script.

    It infers expression only for a cue that already names a member of the
    cast. Unknown speakers remain explicitly unresolved rather than being
    assigned to a convenient character.
    """
    cast = {str(item.get("id")): item for item in storyboard.get("characters", []) if isinstance(item, Mapping) and item.get("id")}
    beats = []
    for cue in storyboard.get("cues", []) or []:
        if not isinstance(cue, Mapping):
            continue
        speaker = cue.get("character_id") or cue.get("speaker") or cue.get("speaker_id")
        if speaker not in cast:
            beats.append({"start": cue.get("start"), "end": cue.get("end"), "speaker": speaker, "status": "unresolved", "reason": "speaker chưa xác minh hoặc ngoài dàn vai"})
            continue
        expression = cue.get("expression") if cue.get("expression") in EXPRESSIONS else _expression_for_text(str(cue.get("text", "")))
        profile = _dramatic_profile(str(cast[speaker].get("name") or speaker), str(cast[speaker].get("asset") or ""))
        beats.append({"start": cue.get("start"), "end": cue.get("end"), "speaker": speaker, "status": "planned", "expression": expression, "drawing_id": f"line-{expression}", "exposure": "twos", "direction": profile["arc"]})
    return {"schema": "tokmatrix.performance-plan/v1", "cast": [{"id": cid, **_dramatic_profile(str(item.get("name") or cid), str(item.get("asset") or ""))} for cid, item in cast.items()], "beats": beats}


def apply_performance_plan(storyboard: Mapping[str, Any]) -> dict[str, Any]:
    """Attach planned expressions to cues and native-vector pose keys only."""
    output = copy.deepcopy(storyboard)
    plan = build_performance_plan(output)
    by_start = {(beat["speaker"], beat["start"]): beat for beat in plan["beats"] if beat["status"] == "planned"}
    for cue in output.get("cues", []) or []:
        speaker = cue.get("character_id") or cue.get("speaker") or cue.get("speaker_id")
        beat = by_start.get((speaker, cue.get("start")))
        if beat and cue.get("expression") not in EXPRESSIONS:
            cue["expression"] = beat["expression"]
    if not output.get("scenes") or any(scene.get("renderer") != "native-vector-v1" for scene in output["scenes"]):
        output["performance_plan"] = plan
        return output
    for scene in output["scenes"]:
        for beat in plan["beats"]:
            if beat["status"] != "planned" or not scene["start_time"] <= beat["start"] < scene["end_time"] or beat["speaker"] not in scene.get("poses", {}):
                continue
            keys = scene["poses"][beat["speaker"]]
            existing = next((key for key in keys if abs(key.get("time", -99) - beat["start"]) < 1e-6), None)
            if existing is None:
                prior = max((key for key in keys if key["time"] <= beat["start"]), key=lambda key: key["time"], default=keys[0])
                existing = copy.deepcopy(prior); existing["time"] = beat["start"]; keys.append(existing)
            existing.update({"expression": beat["expression"], "drawing_id": beat["drawing_id"], "exposure": beat["exposure"]})
            keys.sort(key=lambda key: key["time"])
    output["performance_plan"] = plan
    return output


__all__ = ["CHARACTER_BIBLE_SCHEMA", "CHARACTER_KINDS", "HAIR_STYLES", "CharacterBibleError", "apply_character_bible", "apply_performance_plan", "build_character_bible", "build_performance_plan", "load_character_bible", "save_character_bible", "validate_character_bible"]
