from __future__ import annotations

import argparse
import copy
import json
import math
import re
from functools import lru_cache
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parent / "static"
RENDERER = "native-vector-v1"
# Rig dùng farmerSkeleton (hai tay IK) và rig bàn tay có khớp ngón.
PEOPLE = ("farmer", "fisherman", "farmer_woman")
CHIBI_PEOPLE = (
    "chibi_boy", "chibi_girl", "chibi_kid", "chibi_teacher",
    "chibi_doctor", "chibi_nurse", "chibi_dentist", "chibi_pharmacist",
    "chibi_patient", "chibi_grandma", "chibi_grandpa", "chibi_farmer", "chibi_chef",
)
ALL_PEOPLE = PEOPLE + CHIBI_PEOPLE
HANDS = ("hand", "hand_right")


@lru_cache(maxsize=1)
def _catalog():
    return json.loads((STATIC_DIR / "remake_vector_catalog.json").read_text(encoding="utf-8"))


def catalog():
    return copy.deepcopy(_catalog())


GROUND_WARN_GROUPS = {"human", "chibi", "animal"}
# Hành động y tế nhắm đầu dụng cụ đang cầm (action.tool, attach_to vào tay actor) vào đích: anchor của dụng cụ.
TOOL_ACTIONS = {"brush_teeth": "bristles", "take_temperature": "tip", "listen": "chest_piece", "vaccinate": "needle"}


def held_pose(asset: str, height: float, rotation: float = 0.0, anchor: str = "grip") -> dict:
    """Tư thế cục bộ (x, y, rotation) để anchor (mặc định grip) của vật nằm đúng ổ gắn khi attach_to."""
    gx, gy = _catalog()["assets"][asset]["anchors"][anchor]
    r = math.radians(rotation)
    k = height / 100
    return {"x": -(gx * k * math.cos(r) - gy * k * math.sin(r)), "y": -(gx * k * math.sin(r) + gy * k * math.cos(r)), "rotation": rotation}
GROUND_WARN_PX = 40
CLOSEUP_ASSETS = {"hand", "hand_right", "foot"}


def ground_warnings(story: dict) -> list[str]:
    """Cảnh báo (không chặn) khi người/con vật lơ lửng cao hơn mặt đất của hình nền quá GROUND_WARN_PX.

    Đất kéo dài từ ground_y xuống đáy khung (đứng thấp hơn = gần máy quay) nên chỉ cảnh báo phía trên.
    Tay/chân cận cảnh và con biết bay (actor của động tác `fly`) được bỏ qua; nhân vật trên cành,
    trên xe vẫn hợp lệ, nên đây chỉ là lời nhắc cho người dựng story.
    """
    cat = _catalog()
    specs = cat.get("background_specs", {})
    cast = {c["id"]: c for c in story.get("characters", [])}
    fliers = set(cat["actions"].get("fly", {}).get("actors", []))
    warnings = []
    for index, scene in enumerate(story.get("scenes", [])):
        preset = (scene.get("background") or {}).get("preset", "garden")
        ground = specs.get(preset, {}).get("ground_y")
        if ground is None:
            continue
        for cid, keys in (scene.get("poses") or {}).items():
            char = cast.get(cid, {})
            asset = cat["assets"].get(char.get("asset"), {})
            asset_id = char.get("asset")
            if asset.get("group") not in GROUND_WARN_GROUPS or asset_id in CLOSEUP_ASSETS or asset_id in fliers or char.get("attach_to") or not keys:
                continue
            y = keys[0].get("y")
            if isinstance(y, (int, float)) and y < ground - GROUND_WARN_PX:
                warnings.append(f"Cảnh {index + 1}: {cid} lơ lửng ở y={y:g}, mặt đất của {preset} ở y={ground}")
    return warnings


def engine_sources() -> list[Path]:
    """Danh sách các file JavaScript của engine theo đúng thứ tự nạp (lõi rồi tới các gói)."""
    # Thiếu gói thì báo lỗi, không render thiếu rig rồi coi như xong.
    sources = [STATIC_DIR / "remake_vector_engine.js"]
    packs_dir = STATIC_DIR / "remake_vector_packs"
    for pack in _catalog().get("engine_packs", []):
        filename = pack if pack.endswith(".js") else f"{pack}.js"
        sources.append(packs_dir / filename)
    missing = [str(path) for path in sources if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Thiếu file engine vector: {', '.join(missing)}")
    return sources


def _number(value, low, high, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{label}: cần số hữu hạn trong [{low}, {high}]")


def _validate_grips(cast, scene):
    cat = _catalog()
    events = sorted((a for a in scene.get("actions", []) if a["type"] in ("grip", "release")), key=lambda a: a["start"])
    if len(events) > 32:
        raise ValueError("Tối đa 32 thao tác cầm/thả mỗi cảnh")
    owners, slots, available, detached = {}, {}, {}, set()
    def slot(action):
        anchor = action.get("actor_anchor", "grip")
        return (action["actor"], "left" if cast[action["actor"]]["asset"] in ALL_PEOPLE and anchor in ("hand", "hand_l", "wrist_l") else "right")
    for action in events:
        actor, target = action["actor"], action["target"]
        key = slot(action)
        if action["type"] == "grip":
            if target in owners or key in slots or action["start"] < max(available.get(target, 0), available.get(key, 0)):
                raise ValueError("Vật hoặc bàn tay đang được dùng bởi thao tác cầm/thả khác")
            owners[target] = action
            slots[key] = target
            detached.add(target)
        else:
            previous = owners.get(target)
            if not previous or previous["actor"] != actor or action["start"] < previous["end"]:
                raise ValueError("Thả vật cần một thao tác cầm đã hoàn tất của đúng nhân vật")
            previous_slot = slot(previous)
            if "actor_anchor" in action and key != previous_slot:
                raise ValueError("Thả vật phải đúng bàn tay đang cầm")
            del owners[target]
            del slots[previous_slot]
            available[target] = available[previous_slot] = action["end"]
        edges = {cid: c["attach_to"]["id"] for cid, c in cast.items() if c.get("attach_to") and cid not in detached}
        edges.update({cid: a["actor"] for cid, a in owners.items()})
        for cid in edges:
            visited = set()
            while cid in edges:
                if cid in visited:
                    raise ValueError("Cầm vật và attach_to tạo vòng lặp")
                visited.add(cid)
                cid = edges[cid]
    for grip in (a for a in events if a["type"] == "grip"):
        for action in scene.get("actions", []):
            if action["type"] in ("grip", "release") or action["end"] <= grip["start"]:
                continue
            controls_target = (cat["actions"][action["type"]]["motion"] and action.get("actor") == grip["target"]) or (action["type"] in ("carry", "uproot") and action.get("target") == grip["target"])
            if controls_target:
                raise ValueError("Vật đã cầm/thả không được điều khiển chuyển động riêng trong cùng cảnh")


def _validate_tree_interactions(cat, cast, scene, poses, start, end):
    spawned_actors = {}
    actions = scene.get("actions", [])
    present = set(scene.get("characters_present", []))
    for action in actions:
        kind = action.get("type")
        if kind == "pick":
            tree_cid = action.get("target")
            if not tree_cid or tree_cid not in cast:
                raise ValueError("pick: target không tồn tại trong dàn vai")
            tree_asset = cast[tree_cid]["asset"]
            tree_def = cat["assets"].get(tree_asset, {})
            tree_spec = tree_def.get("spec", {})
            fruit_asset = tree_spec.get("fruit")
            if not fruit_asset:
                raise ValueError("pick: target phải là cây ăn quả có fruit spec")
            t_start = action.get("start")
            t_end = action.get("end")
            if t_start is None or t_end is None or t_start >= t_end:
                raise ValueError("pick: thời gian không hợp lệ")
            tree_keys = poses.get(tree_cid, [])
            # Thời điểm tay chạm quả do action khai (contact, mặc định start + 0.6), không đoán theo keyframe.
            # showreel nén thời gian nên contact được nén cùng tỉ lệ.
            t_contact = round(action.get("contact", t_start + 0.6), 4)
            if not t_start < t_contact <= t_end + 0.0001:
                raise ValueError("pick: contact phải nằm trong (start, end]")
            fruits_before = len(tree_spec.get("slots", []))
            for k in tree_keys:
                if k.get("time", 0) < t_contact - 0.0001:
                    if "fruits" in k:
                        fruits_before = int(k["fruits"])
            expected_anchor = f"fruit_{fruits_before}"
            if action.get("target_anchor") != expected_anchor:
                raise ValueError(f"pick: hái sai slot (cần {expected_anchor}, nhận {action.get('target_anchor')})")
            contact_tree_key = next((k for k in tree_keys if abs(k.get("time", -1) - t_contact) <= 0.001), None)
            if not contact_tree_key or contact_tree_key.get("fruits") != fruits_before - 1:
                raise ValueError("pick: cây phải giảm đúng 1 fruit tại contact")
            grip = next((a for a in actions if a.get("type") == "grip" and abs(a.get("start", -1) - t_contact) <= 0.001), None)
            if not grip:
                raise ValueError("pick: cần action grip bắt đầu tại contact")
            fruit_cid = grip.get("target")
            if not fruit_cid or fruit_cid not in cast:
                raise ValueError("pick: target của grip không tồn tại trong dàn vai")
            if cast[fruit_cid]["asset"] != fruit_asset:
                raise ValueError(f"pick: quả sai loại: cây có quả {fruit_asset}, actor là {cast[fruit_cid]['asset']}")
            fruit_keys = poses.get(fruit_cid, [])
            if not fruit_keys:
                raise ValueError("pick: thiếu pose cho actor quả")
            first_time = fruit_keys[0].get("time", -1)
            if first_time < t_contact - 0.001:
                raise ValueError("pick: actor quả xuất hiện trước lúc fruits giảm")
            if abs(first_time - t_contact) > 0.001:
                raise ValueError("pick: keyframe đầu của actor quả phải trùng contact")
            spawned_actors[fruit_cid] = t_contact
        elif kind == "shake":
            tree_cid = action.get("target")
            if not tree_cid or tree_cid not in cast:
                raise ValueError("shake: target không tồn tại trong dàn vai")
            tree_spec = cat["assets"].get(cast[tree_cid]["asset"], {}).get("spec", {})
            fruit_asset = tree_spec.get("fruit")
            if not fruit_asset:
                raise ValueError("shake: target phải là cây ăn quả có fruit spec")
            t_start, t_end = action.get("start"), action.get("end")
            preset = (scene.get("background") or {}).get("preset", "garden")
            ground = cat.get("background_specs", {}).get(preset, {}).get("ground_y")
            tree_keys = poses.get(tree_cid, [])
            previous = len(tree_spec.get("slots", []))
            for k in tree_keys:
                current = int(k.get("fruits", previous))
                if t_start <= k.get("time", -1) <= t_end and current < previous:
                    if previous - current != 1:
                        raise ValueError("shake: mỗi keyframe chỉ được rụng 1 quả")
                    t_drop = k["time"]
                    # Đúng một quả mới cùng loài xuất hiện đúng lúc số quả giảm.
                    dropped = [cid for cid in present if cid != tree_cid and cid in cast and poses.get(cid)
                               and abs(poses[cid][0].get("time", -1) - t_drop) <= 0.001]
                    if len(dropped) != 1:
                        raise ValueError(f"shake: cần đúng 1 actor quả xuất hiện tại {t_drop}s, có {len(dropped)}")
                    cid = dropped[0]
                    if cast[cid]["asset"] != fruit_asset:
                        raise ValueError(f"shake: quả rơi sai loại: cây có quả {fruit_asset}, actor là {cast[cid]['asset']}")
                    # Quả phải chạm đất (sau đó có thể được nhặt lên), không lơ lửng giữa không trung.
                    if ground is not None and not any(abs(key.get("y", -1e9) - ground) <= 2 for key in poses[cid][1:]):
                        raise ValueError(f"shake: quả rơi phải chạm mặt đất y={ground} của {preset}")
                    spawned_actors[cid] = t_drop
                previous = current
    return spawned_actors


def validate_vector_scenes(characters, scenes):
    cat = _catalog()
    # 300: showreel() ghép mọi story mẫu (nhân vật đổi tên theo namespace) thành một story duy nhất.
    if not 1 <= len(characters) <= 300:
        raise ValueError("Thư viện hỗ trợ 1–300 nhân vật mỗi storyboard")
    cast = {}
    for c in characters:
        cid = c.get("id")
        if not isinstance(cid, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", cid) or cid in cast:
            raise ValueError("ID nhân vật không hợp lệ hoặc bị trùng")
        if c.get("asset") not in cat["assets"]:
            raise ValueError(f"{cid}: asset không có trong thư viện")
        if "face" in c and not isinstance(c["face"], bool):
            raise ValueError(f"{cid}: face phải là boolean")
        if "layer" in c and c["layer"] not in ("default", "over_face", "under"):
            raise ValueError(f"{cid}: layer không hợp lệ")
        if c.get("material", "clean") not in cat["materials"]:
            raise ValueError(f"{cid}: material không có trong thư viện")
        if "outfit" in c and c["outfit"] != "none" and c["outfit"] not in cat.get("outfits", {}):
            raise ValueError(f"{cid}: outfit không có trong thư viện")
        if not isinstance(c.get("style", {}), dict):
            raise ValueError(f"{cid}: style phải là object")
        for key, color in c.get("style", {}).items():
            if key == "locale":
                if color not in cat.get("locales", []):
                    raise ValueError(f"{cid}: locale style không hợp lệ")
                continue
            if key not in cat["style_colors"] or not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
                raise ValueError(f"{cid}: màu style không hợp lệ")
        cast[cid] = c
    for c in characters:
        seen = {c["id"]}
        current = c
        while current.get("attach_to"):
            attachment = current["attach_to"]
            if not isinstance(attachment, dict) or attachment.get("id") not in cast:
                raise ValueError("attach_to tham chiếu nhân vật không tồn tại")
            parent = cast[attachment["id"]]
            if parent["id"] in seen:
                raise ValueError("attach_to tạo vòng lặp")
            if attachment.get("anchor") not in cat["assets"][parent["asset"]]["anchors"]:
                raise ValueError("Điểm gắn attach_to không tồn tại trên rig")
            if "layer" in attachment and attachment["layer"] not in ("default", "over_face", "under"):
                raise ValueError("layer trong attach_to không hợp lệ")
            seen.add(parent["id"])
            current = parent
    if len(scenes) > 300:
        raise ValueError("Tối đa 300 cảnh")
    previous_end = 0.0
    for scene in scenes:
        if abs(scene["start_time"] - previous_end) > 0.000001:
            raise ValueError("Timeline vector phải liên tục, không hở hoặc chồng cảnh")
        previous_end = scene["end_time"]
        if scene.get("renderer") != RENDERER:
            raise ValueError("Không trộn renderer trong storyboard thư viện")
        if scene.get("kind", "scene") not in ("scene", "title"):
            raise ValueError("kind phải là scene hoặc title")
        if scene.get("kind") == "title":
            if scene.get("characters_present") or scene.get("actions"):
                raise ValueError("Thẻ chuyển không chứa nhân vật hoặc hành động")
            if not isinstance(scene.get("text"), str) or not 1 <= len(scene["text"]) <= 160:
                raise ValueError("Thẻ chuyển cần text 1–160 ký tự")
        bg = scene.get("background", {})
        if not isinstance(bg, dict) or bg.get("preset", "garden") not in cat["backgrounds"] or bg.get("weather", "clear") not in cat["weather"] or bg.get("time", "day") not in cat["times_of_day"]:
            raise ValueError("Bối cảnh/thời tiết không có trong thư viện")
        if "season" in bg and bg["season"] not in cat.get("seasons", []):
            raise ValueError("Mùa không có trong thư viện")
        if "locale" in bg and bg["locale"] not in cat.get("locales", []):
            raise ValueError("Locale bối cảnh không có trong thư viện")
        start, end = scene["start_time"], scene["end_time"]
        present = set(scene.get("characters_present", []))
        poses = scene.get("poses", {})
        if not isinstance(poses, dict) or set(poses) != present:
            raise ValueError("poses phải khớp chính xác characters_present")
        spawned_actors = _validate_tree_interactions(cat, cast, scene, poses, start, end)
        for cid in present:
            if cid not in cast:
                raise ValueError("Nhân vật chưa có trong dàn vai")
            parent_id = cast[cid].get("attach_to", {}).get("id")
            if parent_id and parent_id not in present:
                raise ValueError("Nhân vật cha phải xuất hiện cùng bộ phận được gắn")
            keys = poses[cid]
            if not isinstance(keys, list) or not 1 <= len(keys) <= 2000:
                raise ValueError(f"{cid}: cần 1–2000 keyframe")
            expected_start = spawned_actors.get(cid, start)
            if abs(keys[0].get("time", -1) - expected_start) > 0.001:
                if cid in spawned_actors:
                    raise ValueError(f"{cid}: keyframe đầu phải trùng thời điểm xuất hiện")
                else:
                    raise ValueError(f"{cid}: keyframe đầu phải trùng đầu cảnh")
            previous = -1.0
            for key in keys:
                _number(key.get("time"), expected_start, end, f"{cid}.time")
                if key["time"] <= previous:
                    raise ValueError("Keyframe phải tăng dần, không trùng timestamp")
                previous = key["time"]
                for field in ("x", "y", "height"):
                    if field not in key:
                        raise ValueError(f"{cid}: thiếu {field}")
                for field, value in key.items():
                    if field == "time":
                        continue
                    if field in cat["pose_ranges"]:
                        if field.startswith("branch_") and field not in cat["assets"][cast[cid]["asset"]]["anchors"]:
                            raise ValueError(f"{cid}: khớp cành không tồn tại")
                        if field in ("wrist", "thumb", "index", "middle", "ring", "pinky") and cast[cid]["asset"] not in HANDS:
                            raise ValueError(f"{cid}: khớp ngón/cổ tay chỉ dùng cho hand")
                        _number(value, *cat["pose_ranges"][field], f"{cid}.{field}")
                    elif field == "expression" and value in cat["expressions"]:
                        continue
                    elif field == "hand_pose" and value in cat["hand_poses"]:
                        continue
                    elif field == "drawing_id" and isinstance(value, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", value):
                        continue
                    elif field == "exposure" and value in cat["exposures"]:
                        continue
                    elif field == "ease" and value in cat["eases"]:
                        continue
                    elif field == "flip" and isinstance(value, bool):
                        continue
                    elif field == "highlight" and (value is None or isinstance(value, str)):
                        continue
                    elif field == "outfit" and (value == "none" or value in cat.get("outfits", {})):
                        continue
                    elif field == "light" and value in ("red", "yellow", "green", "off"):
                        continue
                    elif field == "alarm" and isinstance(value, bool):
                        continue
                    else:
                        raise ValueError(f"{cid}: thuộc tính pose không hợp lệ: {field}")
        cameras = scene.get("camera", [])
        previous = -1.0
        for camera in cameras:
            _number(camera.get("time"), start, end, "camera.time")
            if camera["time"] <= previous:
                raise ValueError("Camera keyframe không tăng dần")
            previous = camera["time"]
            _number(camera.get("x"), -2000, 2500, "camera.x")
            _number(camera.get("y"), -2000, 3000, "camera.y")
            _number(camera.get("zoom"), 0.2, 5, "camera.zoom")
            if camera.get("ease", "linear") not in cat["eases"]:
                raise ValueError("Camera ease không hợp lệ")
        actions = scene.get("actions", [])
        if not isinstance(actions, list) or len(actions) > 300:
            raise ValueError("Tối đa 300 hành động mỗi cảnh")
        reservations = []
        for action in actions:
            kind = action.get("type")
            if kind not in cat["actions"]:
                raise ValueError("Hành động không có trong thư viện")
            spec = cat["actions"][kind]
            for field in ("start", "end"):
                _number(action.get(field), start, end, f"{kind}.{field}")
            if action["start"] >= action["end"]:
                raise ValueError("Hành động cần start < end")
            extra_fields = (
                {"blend_in", "rotation"} if kind == "grip"
                else {"offset", "spin"} if kind == "release"
                else {"contact"} if kind == "pick"
                else {"emote", "symbol"} if kind == "emote"
                else {"pop_at", "helpers", "lift_amount"} if kind == "tug"
                else {"step"} if kind == "wash_hands"
                else {"tool"} if kind in TOOL_ACTIONS
                else {"exercise_type"} if kind == "exercise"
                else {"food_id"} if kind == "eat"
                else {"locale"} if kind == "wait_signal"
                else set()
            )
            if set(action) - ({"type", "actor", "target", "start", "end", "amount", "stroke", "actor_anchor", "target_anchor", "hold"} | extra_fields):
                raise ValueError("Hành động có thuộc tính không được hỗ trợ")
            if kind == "tug":
                if "pop_at" in action:
                    _number(action["pop_at"], action["start"], action["end"], "tug.pop_at")
                if "helpers" in action:
                    if not isinstance(action["helpers"], list) or any(h not in cast for h in action["helpers"]):
                        raise ValueError("tug.helpers phải là danh sách nhân vật hợp lệ")
            if "tool" in action:
                tool = cast.get(action["tool"])
                if not tool or tool.get("attach_to", {}).get("id") != action.get("actor"):
                    raise ValueError(f"{kind}.tool phải là nhân vật gắn (attach_to) vào chính actor")
                if TOOL_ACTIONS[kind] not in cat["assets"][tool["asset"]]["anchors"]:
                    raise ValueError(f"{kind}.tool thiếu anchor {TOOL_ACTIONS[kind]}")
            if kind == "wash_hands" and "step" in action:
                _number(action["step"], 1, 6, "wash_hands.step")
            if kind == "exercise" and "exercise_type" in action:
                if action["exercise_type"] not in ("jumping_jacks", "stretch", "squat", "run"):
                    raise ValueError("Loại bài tập exercise_type không hợp lệ")
            if kind in ("grip", "release"):
                if "amount" in action or "stroke" in action or action.get("hold", spec["hold"]) != spec["hold"]:
                    raise ValueError("Cầm/thả sử dụng ownership, không dùng amount/stroke hoặc đổi hold")
                if kind == "grip":
                    _number(action.get("blend_in", 0), 0, action["end"] - action["start"], "grip.blend_in")
                    _number(action.get("rotation", 0), -1080, 1080, "grip.rotation")
                else:
                    offset = action.get("offset", [0, 0])
                    if not isinstance(offset, list) or len(offset) != 2:
                        raise ValueError("release.offset cần [dx, dy] theo pixel thế giới")
                    for value in offset:
                        _number(value, -2000, 2000, "release.offset")
                    _number(action.get("spin", 0), -1080, 1080, "release.spin")
            _number(action.get("amount", 1), 0, 1, "action.amount")
            if "hold" in action and not isinstance(action["hold"], bool):
                raise ValueError("action.hold phải là boolean")
            if "stroke" in action:
                if not isinstance(action["stroke"], list) or len(action["stroke"]) != 2:
                    raise ValueError("stroke cần [dx,dy]")
                for value in action["stroke"]:
                    _number(value, -500, 500, "stroke")
            for role, allowed in (("actor", spec["actors"]), ("target", spec["targets"])):
                cid = action.get(role)
                if allowed:
                    if cid not in present or cast[cid]["asset"] not in allowed:
                        raise ValueError(f"{kind}: {role} không xuất hiện hoặc không đúng loại rig")
                    requested = action.get(f"{role}_anchor")
                    if requested and requested not in cat["assets"][cast[cid]["asset"]]["anchors"]:
                        raise ValueError(f"{kind}: anchor không tồn tại")
                elif cid is not None:
                    raise ValueError(f"{kind}: không sử dụng {role}")
            if action.get("actor") == action.get("target"):
                raise ValueError("Actor và target phải khác nhau")
            channels = []
            if spec["motion"]:
                if cast[action["actor"]].get("attach_to"):
                    raise ValueError("Actor tương tác cần rig độc lập, không attach_to")
                channels.append((action["actor"], "motion"))
            if spec.get("channel"):
                channel = action.get("target_anchor", "") if kind == "press" and action.get("target_anchor", "").startswith("branch_") else spec["channel"]
                channels.append((action.get("target", action.get("actor")), channel))
            if kind == "uproot":
                channels.append((action["target"], "motion"))
            if kind == "reach":
                hand = action.get("actor_anchor", spec["actor_anchor"])
                channels.append((action["actor"], "ik-left" if hand == "hand_l" else "ik-right"))
            if kind == "carry":
                channels.extend(((action["actor"], "ik-left"), (action["actor"], "ik-right"), (action["target"], "motion")))
            if kind == "grip":
                channels.append((action["target"], "motion"))
                if cast[action["actor"]]["asset"] in ALL_PEOPLE:
                    hand = action.get("actor_anchor", spec["actor_anchor"])
                    channels.append((action["actor"], "ik-left" if hand == "hand_l" else "ik-right"))
            for owner, channel in channels:
                if any(owner == o and channel == c and action["start"] < e and action["end"] > s for o, c, s, e in reservations):
                    raise ValueError("Hai hành động chồng lấn cùng kênh điều khiển")
                reservations.append((owner, channel, action["start"], action["end"]))
        _validate_grips(cast, scene)


def validate_vector_cues(cues):
    for cue in cues:
        if "expression" in cue and cue["expression"] not in _catalog()["expressions"]:
            raise ValueError("Biểu cảm lời thoại không hợp lệ")
        if "offscreen" in cue and not isinstance(cue["offscreen"], bool):
            raise ValueError("offscreen phải là boolean")
        visemes = cue.get("visemes", [])
        if not isinstance(visemes, list) or len(visemes) > 2000:
            raise ValueError("visemes cần danh sách tối đa 2000 mẫu")
        previous = -1.0
        for key in visemes:
            _number(key.get("time"), cue["start"], cue["end"], "viseme.time")
            _number(key.get("open"), 0, 1, "viseme.open")
            if key["time"] <= previous:
                raise ValueError("Viseme phải tăng dần")
            previous = key["time"]


def validate_story(story):
    try:
        from bkt_web.remake_composer import validate_timeline
    except ImportError:
        from remake_composer import validate_timeline
    _number(story.get("duration"), 0.01, 1800, "duration")
    if not story.get("scenes") or any(s.get("renderer") != RENDERER for s in story["scenes"]):
        raise ValueError("Storyboard phải dùng native-vector-v1 cho mọi cảnh")
    validate_timeline(story["scenes"], story.get("cues", []), story["characters"], story["duration"])
    return story


def localize(story: dict, locale: str) -> dict:
    """Trả về bản sao story với locale mới cho mọi cảnh và nhân vật (§18.4).

    Không làm thay đổi thời gian, pose hay động tác.
    """
    cat = _catalog()
    valid_locales = cat.get("locales", ["neutral", "de", "us", "kr", "jp"])
    if locale not in valid_locales:
        raise ValueError(f"Locale '{locale}' không hợp lệ. Phải thuộc {valid_locales}")
    story_copy = copy.deepcopy(story)
    for scene in story_copy.get("scenes", []):
        bg = scene.setdefault("background", {})
        bg["locale"] = locale
    chars = story_copy.get("characters", [])
    if isinstance(chars, dict):
        chars = chars.values()
    for char in chars:
        if isinstance(char, dict):
            style = char.setdefault("style", {})
            style["locale"] = locale
    return story_copy


def tree_fruit_placement(tree_asset: str, slot: int, tree_pos: dict) -> dict:
    """Vị trí gốc (đáy-giữa) và chiều cao cho actor quả sao cho trùng khít quả đang vẽ ở fruit_{slot}.

    Khớp với farm_trees.js / trellis.js: tâm thân quả nằm ở anchor fruit_N, cỡ quả =
    fruitScale × (0.5 + 0.5 × clamp((growth − 0.45) / 0.55)); anchor cây (không có fixed_anchors)
    co theo growth giống plantPoint của lõi. Thân quả của rig có tâm ở y = −50 (nửa chiều cao).
    """
    cat = _catalog()
    tree_def = cat["assets"][tree_asset]
    spec = tree_def.get("spec", {})
    growth = float(tree_pos.get("growth", 1))
    bend = float(tree_pos.get("bend", 0))
    fx, fy = tree_def["anchors"][f"fruit_{slot}"]
    if not tree_def.get("fixed_anchors") and fy < 0:
        fx, fy = fx * (1 + bend * 0.25), fy * (0.7 + 0.3 * growth) * (1 - 0.68 * bend)
    unit = tree_pos["height"] / 100.0
    lx, ly = fx * unit * (-1 if tree_pos.get("flip") else 1), fy * unit
    angle = math.radians(float(tree_pos.get("rotation", 0)))
    cx = tree_pos["x"] + lx * math.cos(angle) - ly * math.sin(angle)
    cy = tree_pos["y"] + lx * math.sin(angle) + ly * math.cos(angle)
    size = spec.get("fruitScale", 0.28) * (0.5 + 0.5 * min(1.0, max(0.0, (growth - 0.45) / 0.55)))
    height = tree_pos["height"] * size
    return {"x": round(cx, 2), "y": round(cy + height / 2, 2), "height": round(height, 2), "center_y": round(cy, 2)}


def _tree_key(t: float, pos: dict, fruits: int) -> dict:
    key = {"time": t, "x": pos["x"], "y": pos["y"], "height": pos["height"], "growth": pos.get("growth", 1), "fruits": fruits}
    for field in ("flip", "rotation", "bend"):
        if field in pos:
            key[field] = pos[field]
    return key


def tree_pick_events(tree_char_id, tree_asset, fruits_before, t, hand_char_id, fruit_char_id, tree_pos=None, pick_duration=1.0, grip_duration=1.5, fruit_asset=None, hand="hand_r"):
    """hand: tay của người hái (hand_l khi quả nằm bên trái người) — dùng chung cho pick và grip."""
    if hand not in ("hand_l", "hand_r"):
        raise ValueError("hand phải là hand_l hoặc hand_r")
    cat = _catalog()
    if tree_asset not in cat["assets"]:
        raise ValueError(f"Asset cây {tree_asset} không tồn tại")
    tree_def = cat["assets"][tree_asset]
    tree_spec = tree_def.get("spec", {})
    expected_fruit = tree_spec.get("fruit")
    if not expected_fruit:
        raise ValueError(f"{tree_asset} không phải cây ăn quả")
    if fruit_asset is not None and fruit_asset != expected_fruit:
        raise ValueError(f"Loại quả không khớp: cây {tree_asset} có quả {expected_fruit}, nhận {fruit_asset}")
    slots = tree_spec.get("slots", [])
    max_slots = len(slots)
    if not (1 <= fruits_before <= max_slots):
        raise ValueError(f"fruits_before={fruits_before} không hợp lệ (tối đa {max_slots})")

    pos = {"growth": 1, **(tree_pos or {"x": 288, "y": 760, "height": 400})}
    slot_anchor = f"fruit_{fruits_before}"
    placed = tree_fruit_placement(tree_asset, fruits_before, pos)
    fruit_x, fruit_y, fruit_h = placed["x"], placed["y"], placed["height"]

    t_contact = round(t + 0.6, 3)
    pick_end = round(t + max(pick_duration, 0.7), 3)
    grip_end = round(t_contact + grip_duration, 3)

    tree_keyframes = [_tree_key(t, pos, fruits_before), _tree_key(t_contact, pos, fruits_before - 1)]

    fruit_character = {
        "id": fruit_char_id,
        "name": cat["assets"][expected_fruit]["label"],
        "asset": expected_fruit,
        "face": False,  # quả trên cây không có mặt; quả vừa hái/rụng không được bỗng dưng có mắt
    }

    fruit_keyframes = [
        {"time": t_contact, "x": fruit_x, "y": fruit_y, "height": fruit_h},
        {"time": grip_end, "x": fruit_x, "y": fruit_y, "height": fruit_h},
    ]

    pick_action = {
        "type": "pick",
        "actor": hand_char_id,
        "target": tree_char_id,
        "target_anchor": slot_anchor,
        "actor_anchor": hand,
        "start": t,
        "end": pick_end,
        "contact": t_contact,
    }

    grip_action = {
        "type": "grip",
        "actor": hand_char_id,
        "target": fruit_char_id,
        "actor_anchor": hand,
        "start": t_contact,
        "end": grip_end,
    }

    return {
        "tree_keyframes": tree_keyframes,
        "fruit_character": fruit_character,
        "fruit_keyframes": fruit_keyframes,
        "actions": [pick_action, grip_action],
        "pick_action": pick_action,
        "grip_action": grip_action,
        "t_contact": t_contact,
        "fruit_pos": {"x": fruit_x, "y": fruit_y, "height": fruit_h},
    }


def tree_shake_events(tree_char_id, tree_asset, fruits_before, t, shaker_char_id=None, fruit_char_id=None, tree_pos=None, ground_y=810, drop_delay=0.4, shake_duration=1.4, fruit_asset=None):
    cat = _catalog()
    if tree_asset not in cat["assets"]:
        raise ValueError(f"Asset cây {tree_asset} không tồn tại")
    tree_def = cat["assets"][tree_asset]
    tree_spec = tree_def.get("spec", {})
    expected_fruit = tree_spec.get("fruit")
    if not expected_fruit:
        raise ValueError(f"{tree_asset} không phải cây ăn quả")
    if fruit_asset is not None and fruit_asset != expected_fruit:
        raise ValueError(f"Loại quả không khớp: cây {tree_asset} có quả {expected_fruit}, nhận {fruit_asset}")

    if fruit_char_id is None:
        fruit_char_id = f"{expected_fruit}_dropped"

    slots = tree_spec.get("slots", [])
    max_slots = len(slots)
    if not (1 <= fruits_before <= max_slots):
        raise ValueError(f"fruits_before={fruits_before} không hợp lệ (tối đa {max_slots})")

    pos = {"growth": 1, **(tree_pos or {"x": 288, "y": 760, "height": 400})}
    placed = tree_fruit_placement(tree_asset, fruits_before, pos)
    fruit_x, fruit_y, fruit_h = placed["x"], placed["y"], placed["height"]

    t_drop = round(t + drop_delay, 3)
    shake_end = round(t + shake_duration, 3)
    t_hit = round(t_drop + 0.45, 3)
    t_bounce = round(t_hit + 0.12, 3)
    t_settle = round(t_hit + 0.25, 3)
    bounce_h = min(20.0, max(5.0, (ground_y - fruit_y) * 0.1))

    tree_keyframes = [_tree_key(t, pos, fruits_before), _tree_key(t_drop, pos, fruits_before - 1)]

    fruit_character = {
        "id": fruit_char_id,
        "name": cat["assets"][expected_fruit]["label"],
        "asset": expected_fruit,
        "face": False,  # quả trên cây không có mặt; quả vừa hái/rụng không được bỗng dưng có mắt
    }

    fruit_keyframes = [
        {"time": t_drop, "x": fruit_x, "y": fruit_y, "height": fruit_h},
        {"time": t_hit, "x": fruit_x, "y": float(ground_y), "height": fruit_h, "ease": "ease_in"},
        {"time": t_bounce, "x": fruit_x, "y": round(ground_y - bounce_h, 2), "height": fruit_h, "ease": "ease_out"},
        {"time": t_settle, "x": fruit_x, "y": float(ground_y), "height": fruit_h, "ease": "ease_in"},
        {"time": max(shake_end, t_settle + 0.5), "x": fruit_x, "y": float(ground_y), "height": fruit_h},
    ]

    shake_action = {
        "type": "shake",
        "target": tree_char_id,
        "start": t,
        "end": shake_end,
    }
    if shaker_char_id:
        shake_action["actor"] = shaker_char_id

    return {
        "tree_keyframes": tree_keyframes,
        "fruit_character": fruit_character,
        "fruit_keyframes": fruit_keyframes,
        "actions": [shake_action],
        "shake_action": shake_action,
        "t_drop": t_drop,
        "ground_y": float(ground_y),
    }


def examples():
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="garden", **extra):
        return {"renderer": RENDERER, "kind": "scene", "start_time": start, "end_time": end, "characters_present": list(poses), "poses": poses, "actions": list(actions), "background": {"preset": bg}, **extra}

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    def story(sid, name, chars, scenes):
        return {"id": sid, "name": name, "renderer": RENDERER, "fidelity": "technical-demo", "note": "Mẫu kiểm chứng thư viện, không phải bản remake đã duyệt của video nguồn.", "duration": scenes[-1]["end_time"], "characters": chars, "scenes": scenes, "cues": []}

    melon = story("watermelon", "1 · Dưa hấu: rạch, bổ, cầm quả", [actor("left", "watermelon"), actor("right", "watermelon"), actor("blade", "knife"), actor("farmer", "farmer"), actor("held", "watermelon", attach_to={"id": "farmer", "anchor": "hand"})], [
        scene(0, 8, {"left": [pose(0, 180, 650, 170, expression="worried")], "right": [pose(0, 410, 650, 150, expression="surprised")], "blade": [pose(0, 455, 440, 125, z=2)]}, [action("cut", 1, 3, "left", "blade"), action("slice", 3.2, 5.5, "left", "blade")]),
        scene(8, 12, {"farmer": [pose(8, 340, 870, 460, expression="happy")], "held": [pose(8, 0, 15, 90, slice=1, z=3)]}, [action("gesture", 8.5, 11, actor_id="farmer")]),
    ])
    pepper = story("pepper", "2 · Ớt: sâu bò, vòi phun, ngày/đêm", [actor("pepper", "pepper"), actor("bug", "insect"), actor("sprayer", "sprayer")], [
        scene(0, 6, {"pepper": [pose(0, 300, 830, 570, rotation=25, damage=0.8)], "bug": [pose(0, 220, 560, 90, expression="smug", z=2)], "sprayer": [pose(0, 435, 330, 160, rotation=20, z=3)]}, [action("spray", 1, 3, "bug", "sprayer", target_anchor="face"), action("crawl", 3.2, 5.5, "pepper", "bug")], "pepper_patch"),
        scene(6, 12, {"pepper": [pose(6, 300, 830, 570, rotation=25, damage=0.8)], "bug": [pose(6, 280, 370, 90, expression="sleep", z=2)], "sprayer": [pose(6, 435, 330, 160, rotation=20, expression="angry", z=3)]}, [action("spray", 8, 11, "bug", "sprayer", target_anchor="face")], background={"preset": "pepper_patch", "time": "night"}),
    ])
    apples = [actor("bare", "apple"), actor("protected", "apple"), actor("bag", "bag")]
    apple = story("apple", "3 · Táo: bọc túi, mưa, hé lộ", apples, [
        scene(0, 4, {"bare": [pose(0, 160, 610, 170, growth=0)], "protected": [pose(0, 390, 610, 170, growth=0)], "bag": [pose(0, 490, 350, 190, z=2)]}, [action("cover", 1, 3, "protected", "bag")], "orchard"),
        scene(4, 8, {"bare": [pose(4, 160, 610, 170, growth=0, damage=0), pose(8, 160, 610, 170, growth=0, damage=1, expression="sad")], "protected": [pose(4, 390, 610, 170, growth=0.5)], "bag": [pose(4, 390, 610, 190, z=2, expression="happy")]}, background={"preset": "orchard", "weather": "rain"}),
        scene(8, 14, {"bare": [pose(8, 160, 610, 170, damage=1, growth=0.4, expression="worried")], "protected": [pose(8, 390, 610, 170, growth=0.7, expression="happy")], "bag": [pose(8, 390, 610, 190, z=2)]}, [action("uncover", 9, 11, "protected", "bag"), action("grow", 8, 12, "protected")], "orchard"),
    ])
    peanut_chars = [actor("plant", "peanut_plant", face=False), actor("shoot", "face", attach_to={"id": "plant", "anchor": "shoot"}), actor("branch", "face", attach_to={"id": "plant", "anchor": "branch"}), actor("foot", "foot"), actor("hand", "hand")]
    peanut = story("peanut", "4 · Lạc: ép cành, mặt cắt, nhổ cây", peanut_chars, [
        scene(0, 7, {"plant": [pose(0, 288, 800, 430, growth=0.8)], "shoot": [pose(0, 0, 35, 90, expression="surprised", z=3)], "branch": [pose(0, 0, 20, 65, expression="worried", z=3)], "foot": [pose(0, 410, 270, 230, z=4)]}, [action("press", 1, 4, "plant", "foot", amount=0.8)]),
        scene(7, 11, {"plant": [pose(7, 288, 470, 260, roots=1, growth=0.2, bend=0.6)]}, [action("grow", 7.5, 10.5, "plant")], "soil_cutaway"),
        scene(11, 15, {"plant": [pose(11, 250, 820, 340, growth=1)], "hand": [pose(11, 445, 540, 170, z=3)]}, [action("uproot", 11.5, 14, "plant", "hand")]),
    ])
    tomato = story("tomato", "5 · Cà chua: bón hạt, rễ, sinh trưởng", [actor("plant", "tomato_plant"), actor("pot", "pot"), actor("hand", "hand")], [
        scene(0, 4, {"pot": [pose(0, 288, 890, 190, z=0)], "plant": [pose(0, 288, 782, 450, growth=0.2, expression="sad", z=1)], "hand": [pose(0, 452, 565, 170, z=3)]}, [action("fertilize", 1, 3.8, "pot", "hand")], "balcony"),
        scene(4, 8, {"pot": [pose(4, 288, 870, 400, cutaway=1, nutrients=1, z=0)], "plant": [pose(4, 288, 642, 380, roots=1, growth=0.3, z=1)], "hand": [pose(4, 440, 530, 140, z=3)]}, [action("fertilize", 4.5, 7, "pot", "hand")], "balcony", camera=[{"time": 4, "x": 288, "y": 600, "zoom": 1}, {"time": 8, "x": 288, "y": 600, "zoom": 1.12, "ease": "smooth"}]),
        {"renderer": RENDERER, "kind": "title", "start_time": 8, "end_time": 9.5, "text": "2000 năm sau", "characters_present": [], "poses": {}},
        scene(9.5, 14, {"pot": [pose(9.5, 288, 890, 190)], "plant": [pose(9.5, 288, 782, 450, growth=0.3, expression="happy", z=1)]}, [action("grow", 9.6, 13, "plant")], "balcony"),
    ])
    for item in (melon, pepper, apple, peanut, tomato):
        for index, s in enumerate(item["scenes"]):
            s["index"] = index
        speaker = {"watermelon": "left", "pepper": "bug", "apple": "bare", "peanut": "shoot", "tomato": "plant"}[item["id"]]
        item["cues"] = [{"start": 0.2, "end": 0.9, "character_id": speaker, "text": "Mẫu kỹ thuật", "expression": "surprised"}]
    return [melon, pepper, apple, peanut, tomato]


def articulation_examples():
    """Small deterministic stories that exercise articulated hands, holds and branches."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, height, **extra):
        return {"time": t, "x": x, "y": y, "height": height, **extra}

    def story(sid, characters, poses, actions):
        return {
            "id": sid,
            "name": sid,
            "renderer": RENDERER,
            "fidelity": "technical-demo",
            "duration": 8,
            "characters": characters,
            "scenes": [{
                "renderer": RENDERER,
                "kind": "scene",
                "index": 0,
                "start_time": 0,
                "end_time": 8,
                "characters_present": list(poses),
                "poses": poses,
                "actions": actions,
                "background": {"preset": "garden"},
            }],
            "cues": [],
        }

    hold_tool = story(
        "articulated-hand-tool",
        [actor("hand", "hand", face=False), actor("tool", "knife", face=False)],
        {
            "hand": [pose(0, 150, 590, 190, hand_pose="open", z=2), pose(4.9, 365, 510, 190, hand_pose="knife", rotation=-12, wrist=25, ease="smooth"), pose(5.8, 405, 490, 190, hand_pose="open", wrist=15, rotation=0, ease="smooth"), pose(8, 470, 430, 190, hand_pose="open", wrist=-20, rotation=15, ease="smooth")],
            "tool": [pose(0, 260, 760, 145, rotation=-25, z=3)],
        },
        [
            {"type": "grip", "actor": "hand", "target": "tool", "start": 1, "end": 1.5, "blend_in": .5},
            {"type": "release", "actor": "hand", "target": "tool", "start": 5, "end": 5.8, "offset": [15, 130], "spin": 20},
        ],
    )
    hold_tool["name"] = "Khớp tay · Cầm dao và thả"
    hand_poses = story(
        "articulated-hand-poses",
        [actor("hand", "hand", face=False), actor("seed", "seed", face=False)],
        {
            "hand": [pose(0, 210, 590, 210, hand_pose="open"), pose(2, 250, 560, 210, hand_pose="pinch", ease="smooth"), pose(4, 310, 540, 210, hand_pose="point", ease="smooth"), pose(6, 365, 560, 210, hand_pose="scatter", ease="smooth")],
            "seed": [pose(0, 390, 710, 38)],
        },
        [],
    )
    hand_poses["name"] = "Khớp tay · Mở, véo, chỉ, rải"
    branch = story(
        "articulated-branch",
        [actor("plant", "peanut_plant", face=False), actor("face", "face", attach_to={"id": "plant", "anchor": "branch_2"}), actor("hand", "hand", face=False)],
        {
            "plant": [pose(0, 288, 820, 430, growth=.85, branch_2=0), pose(2.5, 288, 820, 430, growth=.85, branch_2=42, ease="smooth"), pose(5, 288, 820, 430, growth=.85, branch_2=-8, ease="smooth"), pose(6.8, 288, 820, 430, growth=.85, branch_2=0, ease="smooth")],
            "face": [pose(0, 0, 0, 52, expression="surprised", z=3)],
            "hand": [pose(0, 460, 490, 170, hand_pose="open", z=4)],
        },
        [{"type": "press", "actor": "hand", "target": "plant", "start": 1, "end": 4, "target_anchor": "branch_2", "amount": .65, "hold": False}],
    )
    branch["name"] = "Khớp cành · Uốn và hồi lại"
    return [hold_tool, hand_poses, branch]


def ik_examples():
    def pose(t, x, y, height, **extra):
        return {"time": t, "x": x, "y": y, "height": height, **extra}

    def make(sid, name, target_asset, target_pose, action, farmer_keys):
        return {
            "id": sid,
            "name": name,
            "renderer": RENDERER,
            "fidelity": "technical-demo",
            "duration": 8,
            "characters": [
                {"id": "farmer", "name": "Nông dân", "asset": "farmer"},
                {"id": "object", "name": _catalog()["assets"][target_asset]["label"], "asset": target_asset, "face": False},
            ],
            "scenes": [{
                "renderer": RENDERER,
                "kind": "scene",
                "index": 0,
                "start_time": 0,
                "end_time": 8,
                "characters_present": ["farmer", "object"],
                "poses": {"farmer": farmer_keys, "object": [target_pose]},
                "actions": [action],
                "background": {"preset": "garden"},
            }],
            "cues": [],
        }

    reach = make(
        "farmer-ik-reach",
        "Nông dân IK · Vươn tay chạm quả",
        "watermelon",
        pose(0, 430, 690, 115, z=3),
        {"type": "reach", "actor": "farmer", "target": "object", "start": 1, "end": 3, "actor_anchor": "hand_r"},
        [pose(0, 250, 870, 430, expression="happy")],
    )
    carry = make(
        "farmer-ik-carry",
        "Nông dân IK · Bê quả hai tay",
        "watermelon",
        pose(0, 430, 760, 125, z=3),
        {"type": "carry", "actor": "farmer", "target": "object", "start": 1, "end": 4},
        [pose(0, 210, 880, 440, expression="happy"), pose(8, 370, 880, 440, expression="happy", ease="smooth")],
    )
    return [reach, carry]


def fishing_examples():
    """Cartoon fishing set: cast, bite, reel and carry with the shared rig contract."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, height, **extra):
        return {"time": t, "x": x, "y": y, "height": height, **extra}

    def scene(start, end, poses, actions, bg="river", **extra):
        return {"renderer": RENDERER, "kind": "scene", "start_time": start, "end_time": end, "characters_present": list(poses), "poses": poses, "actions": list(actions), "background": {"preset": bg}, **extra}

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    characters = [
        actor("fisherman", "fisherman", material="ink"),
        actor("boat", "boat", face=False, material="ink"),
        actor("rod", "fishing_rod", face=False, material="pencil", attach_to={"id": "fisherman", "anchor": "hand_r"}),
        actor("bobber", "bobber", attach_to={"id": "rod", "anchor": "line_end"}, material="ink"),
        actor("hook", "hook", face=False, material="ink"),
        actor("fish", "fish", material="pencil"),
    ]
    scenes = [
        scene(0, 8, {
            "fisherman": [pose(0, 155, 900, 340, expression="happy", drawing_id="patient", exposure="hold")],
            "boat": [pose(0, 386, 940, 235, z=0)],
            "rod": [pose(0, 0, 0, 165, rotation=-18, z=3, drawing_id="cast-ready", exposure="hold"), pose(5, 0, 0, 165, rotation=38, ease="smooth", z=3, drawing_id="cast", exposure="ones"), pose(8, 0, 0, 165, rotation=22, ease="smooth", z=3, drawing_id="wait", exposure="twos")],
            "bobber": [pose(0, 0, 42, 70, swim=-1, z=3), pose(4, 0, 42, 70, swim=1, ease="smooth", z=3), pose(8, 0, 42, 70, swim=-1, ease="smooth", z=3)],
            "hook": [pose(0, 448, 855, 58, z=3, opacity=0)],
            "fish": [pose(0, 452, 870, 92, swim=-0.4, z=1, drawing_id="glide", exposure="twos"), pose(8, 420, 875, 92, swim=0.5, ease="smooth", z=1, drawing_id="notice", exposure="ones")],
        }, [
            action("gesture", 1, 3, actor_id="fisherman"),
            action("swim", 0.4, 8, "fish"),
        ]),
        scene(8, 15, {
            "fisherman": [pose(8, 155, 900, 340, expression="surprised", drawing_id="bite", exposure="ones")],
            "boat": [pose(8, 386, 940, 235, z=0)],
            "rod": [pose(8, 0, 0, 165, rotation=22, z=3, drawing_id="bite", exposure="ones"), pose(15, 0, 0, 165, rotation=12, ease="smooth", z=3, drawing_id="pull", exposure="twos")],
            "bobber": [pose(8, 0, 42, 92, swim=1, z=3), pose(11, 0, 42, 92, swim=-1, ease="smooth", z=3), pose(15, 0, 42, 92, swim=0, ease="smooth", z=3)],
            "hook": [pose(8, 430, 875, 58, z=3)],
            "fish": [pose(8, 420, 875, 92, swim=0.5, z=1, drawing_id="bite", exposure="ones"), pose(15, 400, 870, 92, swim=-0.4, ease="smooth", z=1, drawing_id="hooked", exposure="twos")],
        }, [
            action("set_hook", 9, 12, "fish", "hook"),
            action("splash", 10.5, 13, "fish"),
        ]),
        scene(15, 24, {
            "fisherman": [pose(15, 160, 900, 340, expression="worried", drawing_id="reel", exposure="ones"), pose(24, 205, 900, 340, expression="happy", ease="smooth", drawing_id="release", exposure="twos")],
            "boat": [pose(15, 386, 940, 235, z=0)],
            "rod": [pose(15, 0, 0, 165, rotation=12, z=3, drawing_id="reel", exposure="ones"), pose(24, 0, 0, 165, rotation=6, ease="smooth", z=3, drawing_id="rest", exposure="hold")],
            "fish": [pose(15, 400, 870, 92, hooked=1, expression="surprised", z=3, drawing_id="lift", exposure="ones"), pose(24, 300, 825, 92, hooked=1, expression="happy", ease="smooth", z=3, drawing_id="safe", exposure="twos")],
        }, [
            action("reel", 15, 19, "rod", "fish"),
            action("carry", 19, 22, "fish", "fisherman"),
            action("gesture", 19.5, 22.5, actor_id="fisherman"),
        ]),
    ]
    for index, item in enumerate(scenes):
        item["index"] = index
    story = {
        "id": "fishing",
        "name": "6 · Câu cá: quăng cần, cá cắn, kéo lên, bê cá",
        "theme": "fishing",
        "story_beats": ["Mở: người câu kiên nhẫn", "Cú hích: phao rung/cá cắn", "Cao trào: kéo dây", "Kết: quan sát cá an toàn"],
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật thư viện (chủ đề câu cá), không phải bản remake đã duyệt của video nguồn.",
        "duration": 24,
        "characters": characters,
        "scenes": scenes,
        "cues": [{"start": 0.2, "end": 2.2, "character_id": "fish", "text": "Có gì đó ở dưới nước!", "expression": "worried"}, {"start": 15.2, "end": 17, "character_id": "fisherman", "text": "Bình tĩnh, kéo chậm thôi.", "expression": "worried"}],
    }
    return [story]


def agriculture_examples():
    """Three contact-led farm studies: sowing, harvesting, and papaya latex.

    They intentionally use the hand-drawn contract: replacement drawing IDs
    mark anticipation/contact/recovery, and the rig only supplies anchors and
    continuous contact placement.
    """
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, height, **extra):
        return {"time": t, "x": x, "y": y, "height": height, **extra}

    def scene(start, end, poses, actions=(), bg="garden", **extra):
        return {"renderer": RENDERER, "kind": "scene", "start_time": start, "end_time": end, "characters_present": list(poses), "poses": poses, "actions": list(actions), "background": {"preset": bg}, **extra}

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sowing = {
        "id": "farm-sow-grow", "name": "Nông trại · Gieo hạt, tưới và nảy mầm", "renderer": RENDERER,
        "fidelity": "technical-demo", "note": "Mẫu kiểm chứng rig nông nghiệp, không phải remake đã duyệt.", "duration": 12,
        "characters": [actor("hand", "hand", material="pencil"), actor("seed", "seed", material="ink"), actor("pot", "pot", face=False, material="ink"), actor("plant", "tomato_plant", face=False, material="ink")],
        "scenes": [
            scene(0, 6, {
                "hand": [pose(0, 190, 690, 190, hand_pose="pinch", drawing_id="seed-ready", exposure="hold"), pose(2, 275, 650, 190, hand_pose="scatter", drawing_id="seed-drop", exposure="ones"), pose(6, 300, 690, 190, hand_pose="open", drawing_id="after-drop", exposure="twos")],
                "seed": [pose(0, 330, 570, 72, drawing_id="seed-rest", exposure="hold")],
                "pot": [pose(0, 292, 875, 330, cutaway=1, drawing_id="pot-open", exposure="hold")],
                "plant": [pose(0, 292, 855, 210, growth=.05, drawing_id="sprout", exposure="hold")],
            }, [action("grip", 1, 1.4, "seed", "hand"), action("release", 2.2, 3, "seed", "hand", offset=[0, 170]), action("fertilize", 3.1, 5.2, "pot", "hand", amount=.8)]),
            scene(6, 12, {
                "pot": [pose(6, 292, 875, 330, cutaway=1, drawing_id="pot-open", exposure="hold")],
                "plant": [pose(6, 292, 855, 210, growth=.05, drawing_id="sprout", exposure="hold"), pose(9, 292, 855, 330, growth=.65, drawing_id="leafy", exposure="twos"), pose(12, 292, 855, 390, growth=1, drawing_id="flowering", exposure="hold")],
            }, [action("grow", 6.4, 11.5, "plant")]),
        ], "cues": [],
    }
    harvest = {
        "id": "farm-harvest", "name": "Nông trại · Hái cà chua và thả vào xô", "renderer": RENDERER,
        "fidelity": "technical-demo", "note": "Mẫu kiểm chứng contact cành–tay–trái–xô, không phải remake đã duyệt.", "duration": 7,
        "characters": [actor("farmer", "farmer", material="ink"), actor("plant", "tomato_plant", face=False, material="ink"), actor("tomato", "tomato", material="ink", attach_to={"id": "plant", "anchor": "branch_1"}), actor("bucket", "bucket", face=False, material="ink")],
        "scenes": [scene(0, 7, {
            "farmer": [pose(0, 165, 890, 440, expression="happy", drawing_id="reach-ready", exposure="hold"), pose(2.8, 170, 890, 440, expression="happy", drawing_id="reach-contact", exposure="ones"), pose(7, 220, 890, 440, expression="happy", drawing_id="drop-recover", exposure="twos")],
            "plant": [pose(0, 405, 850, 410, growth=1, drawing_id="fruit-heavy", exposure="hold")],
            "tomato": [pose(0, 0, 0, 88, drawing_id="attached", exposure="hold")],
            "bucket": [pose(0, 365, 945, 250, fill=0, drawing_id="bucket-empty", exposure="hold"), pose(7, 365, 945, 250, fill=.3, drawing_id="bucket-filled", exposure="hold")],
        }, [action("reach", .7, 2.8, "tomato", "farmer", actor_anchor="hand_r"), action("grip", 3, 3.3, "tomato", "farmer", actor_anchor="hand_r"), action("release", 4.4, 5.5, "tomato", "farmer", actor_anchor="hand_r", offset=[105, 155]), action("gesture", 5.7, 6.8, actor_id="farmer")])], "cues": [],
    }
    papaya = {
        "id": "farm-papaya-latex", "name": "Nông trại · Cắt đu đủ và hứng nhựa", "renderer": RENDERER,
        "fidelity": "technical-demo", "note": "Mẫu kiểm chứng điểm cắt, dòng nhựa và miệng xô, không phải remake đã duyệt.", "duration": 7,
        "characters": [actor("tree", "papaya_tree", face=False, material="ink"), actor("knife", "knife", face=False, material="ink"), actor("bucket", "bucket", face=False, material="ink")],
        "scenes": [scene(0, 7, {
            "tree": [pose(0, 285, 860, 590, growth=1, drawing_id="tree-rest", exposure="hold"), pose(2.8, 285, 860, 590, cut=.7, drawing_id="cut-contact", exposure="ones"), pose(7, 285, 860, 590, cut=1, drawing_id="latex-flow", exposure="hold")],
            "knife": [pose(0, 465, 555, 160, rotation=-22, drawing_id="knife-raise", exposure="hold")],
            "bucket": [pose(0, 300, 970, 230, fill=0, drawing_id="bucket-empty", exposure="hold"), pose(7, 300, 970, 230, fill=.75, drawing_id="bucket-latex", exposure="hold")],
        }, [action("cut", 1, 3.1, "tree", "knife"), action("drip", 3.2, 6.7, "bucket", "tree", amount=.75)])], "cues": [],
    }
    for story in (sowing, harvest, papaya):
        for index, item in enumerate(story["scenes"]): item["index"] = index
        validate_story(story)
    return [sowing, harvest, papaya]


def farm_life_examples():
    """Rig nông nghiệp mới: gặt lúa, trâu và gà, tưới rau, nhổ cà rốt bằng tay phải."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, height, **extra):
        return {"time": t, "x": x, "y": y, "height": height, **extra}

    def scene(start, end, poses, actions=(), bg="garden", **extra):
        return {"renderer": RENDERER, "kind": "scene", "start_time": start, "end_time": end, "characters_present": list(poses), "poses": poses, "actions": list(actions), "background": {"preset": bg}, **extra}

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    story = {
        "id": "farm-life", "name": "Nông trại · Gặt lúa, trâu, gà, tưới rau, nhổ cà rốt", "renderer": RENDERER,
        "fidelity": "technical-demo", "note": "Mẫu kiểm chứng rig nông nghiệp mới, không phải remake đã duyệt.", "duration": 16,
        "characters": [
            actor("woman", "farmer_woman"), actor("rice1", "rice_plant", face=False), actor("rice2", "rice_plant", face=False), actor("rice3", "rice_plant", face=False),
            actor("sickle", "sickle"), actor("scarecrow", "scarecrow"), actor("buffalo", "buffalo"), actor("chicken", "chicken"), actor("worm", "earthworm"),
            actor("sunflower", "sunflower"), actor("bee", "bee"), actor("cabbage", "cabbage"), actor("can", "watering_can"),
            actor("carrot", "carrot"), actor("hand", "hand_right", face=False), actor("pumpkin", "pumpkin"), actor("eggplant", "eggplant"), actor("corn", "corn"), actor("basket", "basket"),
        ],
        "scenes": [
            scene(0, 4, {
                "rice1": [pose(0, 80, 900, 300, growth=1, z=1)], "rice2": [pose(0, 175, 910, 300, growth=1, z=1)], "rice3": [pose(0, 270, 900, 300, growth=.7, z=1)],
                "sickle": [pose(0, 230, 620, 140, rotation=-10, z=3)],
                "woman": [pose(0, 450, 960, 330, expression="happy", z=2)],
            }, [action("cut", .4, 1.8, "rice1", "sickle"), action("cut", 2, 3.4, "rice2", "sickle"), action("gesture", 1, 3, actor_id="woman")]),
            scene(4, 8, {
                "scarecrow": [pose(4, 470, 810, 280, z=0)],
                "buffalo": [pose(4, -60, 830, 250, z=1), pose(8, 300, 830, 250, z=1)],
                "chicken": [pose(4, 300, 930, 170, z=2)],
                "worm": [pose(4, 420, 935, 80, z=1)],
            }, [action("peck", 5, 7.4, "worm", "chicken")]),
            scene(8, 12, {
                "sunflower": [pose(8, 140, 900, 380, growth=.3), pose(11.5, 140, 900, 380, growth=1, ease="ease_out")],
                "bee": [pose(8, 40, 380, 100), pose(10, 160, 300, 100, ease="smooth"), pose(12, 120, 360, 100, flip=True, ease="smooth")],
                "cabbage": [pose(8, 330, 930, 230, growth=.7, z=1)],
                "can": [pose(8, 470, 700, 190, z=3)],
            }, [action("grow", 8.4, 11.5, "sunflower"), action("water", 8.6, 11.4, "cabbage", "can")]),
            scene(12, 16, {
                "carrot": [pose(12, 300, 900, 260, growth=.9, z=1)],
                "hand": [pose(12, 520, 640, 190, z=3)],
                "basket": [pose(12, 110, 990, 240, fill=.8, z=0)],
                "pumpkin": [pose(12, 90, 790, 190, expression="happy", z=1)],
                "eggplant": [pose(12, 470, 990, 150, expression="happy", z=2)],
                "corn": [pose(12, 540, 990, 150, expression="surprised", z=2)],
            }, [action("uproot", 12.3, 15, "carrot", "hand")]),
        ],
        "cues": [{"start": 13.2, "end": 15.6, "character_id": "pumpkin", "text": "Mùa màng bội thu!", "expression": "happy"}],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def farm_animals_examples():
    """Mẫu sinh vật nông trại mới: đồng cỏ, vườn hoa, vườn quả, sân nhà."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, height, **extra):
        return {"time": t, "x": x, "y": y, "height": height, **extra}

    def scene(start, end, poses, actions=(), bg="garden", **extra):
        return {"renderer": RENDERER, "kind": "scene", "start_time": start, "end_time": end, "characters_present": list(poses), "poses": poses, "actions": list(actions), "background": {"preset": bg}, **extra}

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    story = {
        "id": "farm-animals",
        "name": "Nông trại · Động vật, vườn hoa quả và đào đất",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kiểm chứng thú 4 chân, chim, côn trùng, hoa quả và dụng cụ mới.",
        "duration": 16,
        "characters": [
            actor("cow", "cow"), actor("grass", "grass_tuft", face=False), actor("goat", "goat"), actor("rabbit", "rabbit"),
            actor("lotus", "lotus"), actor("rose", "rose"), actor("daisy", "daisy"), actor("butterfly", "butterfly", face=False), actor("bee", "bee", face=False),
            actor("woman", "farmer_woman"), actor("mango", "mango"), actor("crate", "crate", face=False), actor("strawberry", "strawberry"), actor("orange", "orange"),
            actor("pig", "pig"), actor("duck", "duck"), actor("chick", "chick"), actor("ant", "ant", face=False), actor("shovel", "shovel", face=False), actor("soil_bed", "soil_bed", face=False),
        ],
        "scenes": [
            scene(0, 4, {
                # Bò trong khung, cúi gặm bụi cỏ phía trước; dê đi ở hàng sau từ phải sang; thỏ nhảy ở tiền cảnh.
                "cow": [pose(0, 190, 840, 260, z=1)],
                "grass": [pose(0, 400, 850, 140, z=0)],
                "goat": [pose(0, 660, 790, 190, flip=True, z=0), pose(4, 480, 790, 190, flip=True, z=0)],
                "rabbit": [pose(0, 105, 905, 130, z=3)],
            }, [action("graze", 0.5, 3.5, "grass", "cow"), action("hop", 1.0, 3.5, actor_id="rabbit")], bg="garden"),
            scene(4, 8, {
                "lotus": [pose(4, 100, 910, 280, growth=0.2, z=0), pose(7.5, 100, 910, 280, growth=1.0, ease="ease_out")],
                "rose": [pose(4, 270, 920, 290, growth=0.3, z=1), pose(7.5, 270, 920, 290, growth=1.0, ease="ease_out")],
                "daisy": [pose(4, 440, 920, 260, growth=0.2, z=0), pose(7.5, 440, 920, 260, growth=0.9, ease="ease_out")],
                "butterfly": [pose(4, 380, 480, 110, z=2)],
                "bee": [pose(4, 160, 440, 90, z=2)],
            }, [action("grow", 4.2, 7.5, "lotus"), action("grow", 4.3, 7.5, "rose"), action("grow", 4.4, 7.5, "daisy"), action("pollinate", 4.5, 7.5, "rose", "butterfly"), action("fly", 4.2, 7.6, actor_id="bee")], bg="garden"),
            scene(8, 12, {
                # Xoài nằm trên nắp thùng gỗ (tầm tay với tới; IK không với xuống đất), cô nhặt lên rồi thả
                # xuống cạnh dâu và cam. Mọi thứ đứng ở y ≤ 915 để phụ đề ở đáy khung không đè lên.
                "woman": [pose(8, 330, 915, 330, z=2)],
                "crate": [pose(8, 175, 912, 170, z=1)],
                "mango": [pose(8, 175, 810, 100, z=3)],
                "strawberry": [pose(8, 460, 912, 115, expression="happy", z=3)],
                "orange": [pose(8, 525, 912, 115, expression="surprised", z=3)],
            }, [action("reach", 8.2, 9.4, "mango", "woman"), action("grip", 9.4, 10.6, "mango", "woman"), action("release", 10.6, 11.6, "mango", "woman", offset=[250, 100])], bg="garden"),
            scene(12, 16, {
                "pig": [pose(12, -60, 870, 200, z=1), pose(16, 260, 870, 200, z=1)],
                "duck": [pose(12, 530, 920, 160, flip=True, z=2), pose(16, 350, 920, 160, flip=True, z=2)],
                "chick": [pose(12, 170, 940, 100, z=2)],
                "ant": [pose(12, 230, 945, 45, z=1)],
                "shovel": [pose(12, 380, 780, 180, z=3)],
                "soil_bed": [pose(12, 380, 990, 160, z=0)],
            }, [action("peck", 12.8, 15.2, "ant", "chick"), action("dig", 12.5, 15.5, "soil_bed", "shovel")], bg="garden"),
        ],
        "cues": [{"start": 9.2, "end": 11.6, "character_id": "strawberry", "text": "Trái cây chín ngọt thơm quá!", "expression": "happy"}],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]



def monster_examples():
    """Two sea monsters (S & SS tier): emerge, whip tentacles, roar and strike."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, height, **extra):
        return {"time": t, "x": x, "y": y, "height": height, **extra}

    def scene(start, end, poses, actions, bg="sea", **extra):
        return {"renderer": RENDERER, "kind": "scene", "start_time": start, "end_time": end, "characters_present": list(poses), "poses": poses, "actions": list(actions), "background": {"preset": bg}, **extra}

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    characters = [
        actor("s_monster", "sea_monster_s", material="ink"),
        actor("ss_monster", "sea_monster_ss", material="ink"),
        actor("boat", "boat", face=False, material="pencil"),
        actor("fisherman", "fisherman", material="ink"),
    ]
    scenes = [
        scene(0, 8, {
            "s_monster": [pose(0, 430, 980, 280, rise=0, z=1)],
            "ss_monster": [pose(0, 120, 1040, 340, rise=0, z=1)],
            "boat": [pose(0, 340, 1000, 250, z=0)],
            "fisherman": [pose(0, 200, 900, 430, expression="happy", z=3)],
        }, [
            action("emerge", 1, 4, "s_monster", amount=.8),
            action("whip", 5, 7.5, "s_monster", amount=.7),
        ]),
        scene(8, 15, {
            "s_monster": [pose(8, 430, 980, 280, rise=.8, z=1)],
            "ss_monster": [pose(8, 120, 1040, 340, rise=0, z=1)],
            "boat": [pose(8, 340, 1000, 250, z=0)],
            "fisherman": [pose(8, 200, 900, 430, expression="surprised", z=3)],
        }, [
            action("emerge", 8.5, 11.5, "ss_monster"),
            action("whip", 9, 12, "s_monster", amount=.5),
            action("roar", 12, 14.5, "ss_monster"),
        ]),
        scene(15, 22, {
            "s_monster": [pose(15, 430, 980, 290, rise=.9, z=1)],
            "ss_monster": [pose(15, 120, 1030, 350, rise=1, z=1)],
            "boat": [pose(15, 340, 1000, 250, z=0)],
            "fisherman": [pose(15, 200, 900, 430, expression="worried", z=3)],
        }, [
            action("strike", 16, 18.5, "boat", "s_monster"),
            action("strike", 19, 21.5, "fisherman", "ss_monster"),
        ]),
    ]
    for index, item in enumerate(scenes):
        item["index"] = index
    story = {
        "id": "sea-monsters",
        "name": "7 · Thủy quái: trồi lên, quật xúc tu, gầm, vồ thuyền (cấp S & SS)",
        "theme": "sea-monster",
        "story_beats": ["Mở: biển yên", "Cảnh báo: quái trồi lên", "Cao trào: thuyền bị vồ", "Kết: nhân vật tìm đường thoát"],
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật thư viện (hai thủy quái cấp S và SS), không phải bản remake đã duyệt của video nguồn.",
        "duration": 22,
        "characters": characters,
        "scenes": scenes,
        "cues": [{"start": 0.5, "end": 2.5, "character_id": "fisherman", "text": "Mặt biển hôm nay lạ quá.", "expression": "worried"}, {"start": 12.1, "end": 14.2, "character_id": "ss_monster", "text": "Rời khỏi vùng nước của ta!", "expression": "angry"}],
    }
    return [story]


def orchard_harvest_examples():
    """Technical showcase for Phase B fruit trees, picking, shaking and orchard backgrounds."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="fruit_orchard", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    p1 = tree_pick_events("mango_tree", "mango_tree", fruits_before=6, t=1.0, hand_char_id="farmer", fruit_char_id="mango_picked", tree_pos={"x": 190, "y": 810, "height": 560}, hand="hand_l")
    m_fruit_pos = p1["fruit_pos"]
    # Nông dân (cao FH) đứng bên phải quả sắp hái để tay với tới, không che thân cây.
    FH = 360
    mx = round(m_fruit_pos["x"] + 78)
    s1_farmer_poses = [
        pose(0, 500, 810, FH),
        pose(1.0, mx + 10, 810, FH),
        pose(1.6, mx, 810, FH),
        pose(2.2, mx, 810, FH),
        pose(3.5, 165, 810, FH, ease="smooth", flip=True),
        pose(4.0, 165, 810, FH, flip=True),
        pose(5.0, 165, 810, FH, flip=True),
    ]
    s1_tree_poses = [
        pose(0, 190, 810, 560, growth=1, fruits=6),
        pose(1.6, 190, 810, 560, growth=1, fruits=5),
        pose(5.0, 190, 810, 560, growth=1, fruits=5),
    ]
    s1_basket_poses = [
        pose(0, 95, 810, 180, fill=0),
        pose(4.2, 95, 810, 180, fill=0),
        pose(4.8, 95, 810, 180, fill=0.3),
        pose(5.0, 95, 810, 180, fill=0.3),
    ]
    s1_fruit_poses = [
        pose(1.6, m_fruit_pos["x"], m_fruit_pos["y"], m_fruit_pos["height"]),
        pose(4.0, m_fruit_pos["x"], m_fruit_pos["y"], m_fruit_pos["height"]),
        pose(4.4, 95, 790, m_fruit_pos["height"], ease="ease_in"),
        pose(5.0, 95, 790, m_fruit_pos["height"]),
    ]
    s1_actions = [
        p1["pick_action"],
        {"type": "grip", "actor": "farmer", "target": "mango_picked", "actor_anchor": "hand_l", "start": 1.6, "end": 4.0},
        {"type": "release", "actor": "farmer", "target": "mango_picked", "start": 4.0, "end": 4.4, "offset": [-60, 120]},
    ]
    scene1 = scene(0, 5.0, {
        "farmer": s1_farmer_poses,
        "mango_tree": s1_tree_poses,
        "basket": s1_basket_poses,
        "mango_picked": s1_fruit_poses,
    }, actions=s1_actions, bg="fruit_orchard")

    p2 = tree_pick_events("orange_tree", "orange_tree", fruits_before=7, t=6.0, hand_char_id="farmer", fruit_char_id="orange_picked", tree_pos={"x": 190, "y": 810, "height": 470}, hand="hand_l")
    o_fruit_pos = p2["fruit_pos"]
    ox = round(o_fruit_pos["x"] + 78)
    s2_farmer_poses = [
        pose(5.0, 500, 810, FH),
        pose(6.0, ox + 10, 810, FH),
        pose(6.6, ox, 810, FH),
        pose(7.2, ox, 810, FH),
        pose(8.4, 165, 810, FH, ease="smooth", flip=True),
        pose(9.0, 165, 810, FH, flip=True),
        pose(10.0, 165, 810, FH, flip=True),
    ]
    s2_tree_poses = [
        pose(5.0, 190, 810, 470, growth=1, fruits=7),
        pose(6.6, 190, 810, 470, growth=1, fruits=6),
        pose(10.0, 190, 810, 470, growth=1, fruits=6),
    ]
    s2_basket_poses = [
        pose(5.0, 95, 810, 180, fill=0.3),
        pose(9.1, 95, 810, 180, fill=0.3),
        pose(9.6, 95, 810, 180, fill=0.6),
        pose(10.0, 95, 810, 180, fill=0.6),
    ]
    s2_fruit_poses = [
        pose(6.6, o_fruit_pos["x"], o_fruit_pos["y"], o_fruit_pos["height"]),
        pose(9.0, o_fruit_pos["x"], o_fruit_pos["y"], o_fruit_pos["height"]),
        pose(9.4, 95, 790, o_fruit_pos["height"], ease="ease_in"),
        pose(10.0, 95, 790, o_fruit_pos["height"]),
    ]
    s2_actions = [
        p2["pick_action"],
        {"type": "grip", "actor": "farmer", "target": "orange_picked", "actor_anchor": "hand_l", "start": 6.6, "end": 9.0},
        {"type": "release", "actor": "farmer", "target": "orange_picked", "start": 9.0, "end": 9.4, "offset": [-60, 120]},
    ]
    scene2 = scene(5.0, 10.0, {
        "farmer": s2_farmer_poses,
        "orange_tree": s2_tree_poses,
        "basket": s2_basket_poses,
        "orange_picked": s2_fruit_poses,
    }, actions=s2_actions, bg="fruit_orchard")

    s3 = tree_shake_events("durian_tree", "durian_tree", fruits_before=5, t=11.0, shaker_char_id="farmer", fruit_char_id="durian_dropped", tree_pos={"x": 200, "y": 810, "height": 600}, ground_y=810)
    dx = s3["fruit_keyframes"][0]["x"]
    s3_tree_poses = [
        pose(10.0, 200, 810, 600, growth=1, fruits=5),
        pose(11.4, 200, 810, 600, growth=1, fruits=4),
        pose(16.0, 200, 810, 600, growth=1, fruits=4),
    ]
    s3_farmer_poses = [
        pose(10.0, 500, 810, FH),
        pose(11.0, 290, 810, FH),
        pose(12.4, 290, 810, FH),
        pose(13.2, round(dx + 70), 810, FH, ease="smooth"),
        pose(14.0, round(dx + 70), 810, FH),
        pose(14.8, 165, 810, FH, ease="smooth", flip=True),
        pose(15.4, 165, 810, FH, flip=True),
        pose(16.0, 165, 810, FH, expression="happy", flip=True),
    ]
    s3_basket_poses = [
        pose(10.0, 95, 810, 180, fill=0.6),
        pose(15.2, 95, 810, 180, fill=0.6),
        pose(15.7, 95, 810, 180, fill=1.0),
        pose(16.0, 95, 810, 180, fill=1.0),
    ]
    durian_keys = [
        *s3["fruit_keyframes"][:4],
        pose(14.0, dx, 810, s3["fruit_keyframes"][0]["height"]),
        pose(15.2, dx, 810, s3["fruit_keyframes"][0]["height"]),
        pose(15.6, 95, 790, s3["fruit_keyframes"][0]["height"], ease="ease_in"),
        pose(16.0, 95, 790, s3["fruit_keyframes"][0]["height"]),
    ]
    s3_actions = [
        s3["shake_action"],
        {"type": "grip", "actor": "farmer", "target": "durian_dropped", "actor_anchor": "hand_l", "start": 14.0, "end": 15.2},
        {"type": "release", "actor": "farmer", "target": "durian_dropped", "start": 15.2, "end": 15.6, "offset": [-60, 100]},
    ]
    scene3 = scene(10.0, 16.0, {
        "farmer": s3_farmer_poses,
        "durian_tree": s3_tree_poses,
        "basket": s3_basket_poses,
        "durian_dropped": durian_keys,
    }, actions=s3_actions, bg="fruit_orchard")

    story = {
        "id": "orchard_harvest",
        "name": "Thu hoạch vườn cây ăn quả: xoài, cam, sầu riêng",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase B: hái xoài, hái cam, rung cây sầu riêng.",
        "duration": 16.0,
        "characters": [
            actor("farmer", "farmer"),
            actor("mango_tree", "mango_tree"),
            actor("orange_tree", "orange_tree"),
            actor("durian_tree", "durian_tree"),
            actor("basket", "basket"),
            p1["fruit_character"],
            p2["fruit_character"],
            s3["fruit_character"],
        ],
        "scenes": [scene1, scene2, scene3],
        "cues": [
            {"start": 0.5, "end": 2.5, "character_id": "farmer", "text": "Hôm nay vườn cây chín rộ, ta đi thu hoạch thôi!", "expression": "happy"},
            {"start": 10.5, "end": 12.5, "character_id": "farmer", "text": "Cây sầu riêng cao quá, rung cho quả chín rụng xuống nào.", "expression": "surprised"},
        ],
    }
    # Người hái đứng trước cây/giàn, không bị tán lá che.
    for sc in story["scenes"]:
        for key in sc["poses"].get("farmer", []):
            key.setdefault("z", 3)
    return [story]


def trellis_examples():
    """Technical showcase for Phase C trellis vines, growing, flowering, and picking cucumber."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="trellis_garden", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    # Scene 1: Vine fast growth, flowering and forming fruits (0 -> 5s)
    # Background: greenhouse, day
    s1_vine_poses = [
        pose(0, 240, 810, 440, growth=0.15, fruits=0),
        pose(1.8, 240, 810, 440, growth=0.48, fruits=0, ease="smooth"),
        pose(3.6, 240, 810, 440, growth=0.82, fruits=6, ease="smooth"),
        pose(5.0, 240, 810, 440, growth=1.0, fruits=6),
    ]
    s1_farmer_poses = [
        pose(0, 460, 810, 450, expression="happy"),
        pose(5.0, 460, 810, 450, expression="happy"),
    ]
    scene1 = scene(0, 5.0, {
        "farmer": s1_farmer_poses,
        "cucumber_vine": s1_vine_poses,
    }, actions=[
        {"type": "grow", "target": "cucumber_vine", "start": 0.5, "end": 4.5},
    ], bg="greenhouse")

    # Scene 2: Farmer harvesting cucumber into basket (5 -> 10s)
    # Background: trellis_garden, day
    p1 = tree_pick_events("cucumber_vine", "cucumber_vine", fruits_before=6, t=6.0, hand_char_id="farmer", fruit_char_id="cucumber_picked", tree_pos={"x": 240, "y": 810, "height": 450}, hand="hand_l")
    c_fruit_pos = p1["fruit_pos"]
    s2_farmer_poses = [
        pose(5.0, 480, 810, 450),
        pose(6.0, 370, 810, 450),
        pose(6.6, 350, 810, 450),
        pose(7.2, 350, 810, 450),
        pose(8.4, 210, 810, 450, ease="smooth"),
        pose(9.0, 210, 810, 450),
        pose(10.0, 210, 810, 450),
    ]
    s2_vine_poses = [
        pose(5.0, 240, 810, 450, growth=1, fruits=6),
        pose(6.6, 240, 810, 450, growth=1, fruits=5),
        pose(10.0, 240, 810, 450, growth=1, fruits=5),
    ]
    s2_basket_poses = [
        pose(5.0, 110, 810, 180, fill=0),
        pose(8.5, 110, 810, 180, fill=0),
        pose(9.2, 110, 810, 180, fill=0.4),
        pose(10.0, 110, 810, 180, fill=0.4),
    ]
    s2_fruit_poses = [
        pose(6.6, c_fruit_pos["x"], c_fruit_pos["y"], c_fruit_pos["height"]),
        pose(8.4, c_fruit_pos["x"], c_fruit_pos["y"], c_fruit_pos["height"]),
        pose(9.0, 110, 770, c_fruit_pos["height"], ease="ease_in"),
        pose(10.0, 110, 770, c_fruit_pos["height"]),
    ]
    s2_actions = [
        p1["pick_action"],
        {"type": "grip", "actor": "farmer", "target": "cucumber_picked", "actor_anchor": "hand_l", "start": 6.6, "end": 8.4},
        {"type": "release", "actor": "farmer", "target": "cucumber_picked", "start": 8.4, "end": 9.0, "offset": [-140, 200]},
    ]
    scene2 = scene(5.0, 10.0, {
        "farmer": s2_farmer_poses,
        "cucumber_vine": s2_vine_poses,
        "basket": s2_basket_poses,
        "cucumber_picked": s2_fruit_poses,
    }, actions=s2_actions, bg="trellis_garden")

    story = {
        "id": "trellis_cucumber",
        "name": "Dưa leo leo giàn và thu hoạch dưa giàn chữ A",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase C: giàn dưa leo sinh trưởng, nở hoa và hái quả.",
        "duration": 10.0,
        "characters": [
            actor("farmer", "farmer"),
            actor("cucumber_vine", "cucumber_vine"),
            actor("basket", "basket"),
            p1["fruit_character"],
        ],
        "scenes": [scene1, scene2],
        "cues": [
            {"start": 0.5, "end": 3.0, "character_id": "farmer", "text": "Dây dưa leo vươn ngọn, hoa vàng nở rộ dọc giàn!", "expression": "happy"},
            {"start": 5.5, "end": 8.0, "character_id": "farmer", "text": "Dưa leo trên giàn chữ A sai trĩu quả, ta hái vào giỏ nào.", "expression": "happy"},
        ],
    }
    # Người hái đứng trước cây/giàn, không bị tán lá che.
    for sc in story["scenes"]:
        for key in sc["poses"].get("farmer", []):
            key.setdefault("z", 3)
    return [story]


def highland_examples():
    """Technical showcase for Phase D temperate fruits and trees on highland farm and snowy orchard."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="highland_farm", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    # Scene 1: Đà Lạt highland farm in autumn fog, farmer picks a ripe persimmon (0 -> 5s)
    p1 = tree_pick_events("persimmon_tree", "persimmon_tree", fruits_before=6, t=1.2, hand_char_id="farmer", fruit_char_id="persimmon_picked", tree_pos={"x": 200, "y": 810, "height": 520}, hand="hand_l")
    f_pos = p1["fruit_pos"]
    FH = 360
    fx = round(f_pos["x"] + 75)

    s1_farmer_poses = [
        pose(0, 480, 810, FH, expression="happy"),
        pose(1.2, fx + 10, 810, FH),
        pose(1.8, fx, 810, FH),
        pose(2.4, fx, 810, FH),
        pose(3.8, 160, 810, FH, ease="smooth", flip=True),
        pose(4.4, 160, 810, FH, flip=True),
        pose(5.0, 160, 810, FH, flip=True),
    ]
    s1_tree_poses = [
        pose(0, 200, 810, 520, growth=1, fruits=6),
        pose(1.8, 200, 810, 520, growth=1, fruits=5),
        pose(5.0, 200, 810, 520, growth=1, fruits=5),
    ]
    s1_straw_poses = [
        pose(0, 390, 810, 120, growth=1, fruits=4),
        pose(5.0, 390, 810, 120, growth=1, fruits=4),
    ]
    s1_basket_poses = [
        pose(0, 85, 810, 180, fill=0),
        pose(3.9, 85, 810, 180, fill=0),
        pose(4.5, 85, 810, 180, fill=0.4),
        pose(5.0, 85, 810, 180, fill=0.4),
    ]
    s1_fruit_poses = [
        pose(1.8, f_pos["x"], f_pos["y"], f_pos["height"]),
        pose(3.8, f_pos["x"], f_pos["y"], f_pos["height"]),
        pose(4.4, 85, 770, f_pos["height"], ease="ease_in"),
        pose(5.0, 85, 770, f_pos["height"]),
    ]
    s1_actions = [
        p1["pick_action"],
        {"type": "grip", "actor": "farmer", "target": "persimmon_picked", "actor_anchor": "hand_l", "start": 1.8, "end": 3.8},
        {"type": "release", "actor": "farmer", "target": "persimmon_picked", "start": 3.8, "end": 4.4, "offset": [-115, 210]},
    ]
    scene1 = scene(0, 5.0, {
        "farmer": s1_farmer_poses,
        "persimmon_tree": s1_tree_poses,
        "strawberry_plant": s1_straw_poses,
        "basket": s1_basket_poses,
        "persimmon_picked": s1_fruit_poses,
    }, actions=s1_actions, bg="highland_farm", weather="fog", season="autumn")

    # Scene 2: Snowy orchard in winter, pear tree covered in snow (5 -> 10s)
    s2_farmer_poses = [
        pose(5.0, 380, 810, FH, expression="happy"),
        pose(7.5, 380, 810, FH, expression="happy"),
        pose(10.0, 380, 810, FH, expression="happy"),
    ]
    s2_pear_tree_poses = [
        pose(5.0, 180, 810, 520, growth=1, fruits=0),
        pose(10.0, 180, 810, 520, growth=1, fruits=0),
    ]
    s2_basket_poses = [
        pose(5.0, 480, 810, 180, fill=0.4),
        pose(10.0, 480, 810, 180, fill=0.4),
    ]
    scene2 = scene(5.0, 10.0, {
        "farmer": s2_farmer_poses,
        "pear_tree": s2_pear_tree_poses,
        "basket": s2_basket_poses,
    }, actions=[], bg="snowy_orchard", weather="snow", season="winter")

    story = {
        "id": "highland_temperate",
        "name": "Nông trại cao nguyên Đà Lạt và vườn cây tuyết phủ mùa đông",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase D: cây hồng persimmon mùa thu sương mù, dâu tây và vườn cây mùa đông tuyết phủ.",
        "duration": 10.0,
        "characters": [
            actor("farmer", "farmer"),
            actor("persimmon_tree", "persimmon_tree"),
            actor("strawberry_plant", "strawberry_plant"),
            actor("pear_tree", "pear_tree"),
            actor("basket", "basket"),
            p1["fruit_character"],
        ],
        "scenes": [scene1, scene2],
        "cues": [
            {"start": 0.5, "end": 3.0, "character_id": "farmer", "text": "Đà Lạt sương mù giăng lối, hồng chín đỏ rực cả đồi thông!", "expression": "happy"},
            {"start": 5.5, "end": 8.5, "character_id": "farmer", "text": "Mùa đông tuyết rơi trắng xóa vườn cây, ta ủ ấm đón xuân sang.", "expression": "happy"},
        ],
    }
    for sc in story["scenes"]:
        for key in sc["poses"].get("farmer", []):
            key.setdefault("z", 3)
    return [story]


def vegetable_cutaway_examples():
    """Technical showcase for Phase E: kohlrabi and sweet potato cutaway growth and uproot."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="soil_cutaway", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    # Scene 1 (0 -> 4.5s): Kohlrabi and Sweet Potato growing on soil_cutaway (ground_y = 480)
    s1_kohlrabi = [
        pose(0, 160, 480, 360, growth=0.25, cutaway=1, roots=1, z=1),
        pose(4.5, 160, 480, 360, growth=1.0, cutaway=1, roots=1, z=1),
    ]
    s1_sweet_pot = [
        pose(0, 380, 480, 380, growth=0.25, cutaway=1, roots=1, z=2),
        pose(4.5, 380, 480, 380, growth=1.0, cutaway=1, roots=1, z=2),
    ]
    s1_hand = [
        pose(0, 500, 320, 240, z=3),
        pose(4.5, 500, 320, 240, z=3),
    ]
    s1_actions = [
        action("grow", 0.5, 4.0, "kohlrabi_plant"),
        action("grow", 0.5, 4.0, "sweet_potato_plant"),
    ]
    scene1 = scene(0, 4.5, {
        "kohlrabi_plant": s1_kohlrabi,
        "sweet_potato_plant": s1_sweet_pot,
        "hand": s1_hand,
    }, actions=s1_actions, bg="soil_cutaway")

    # Scene 2 (4.5 -> 9.0s): Hand uproots sweet potato plant
    s2_kohlrabi = [
        pose(4.5, 160, 480, 360, growth=1.0, cutaway=1, roots=1, z=1),
        pose(9.0, 160, 480, 360, growth=1.0, cutaway=1, roots=1, z=1),
    ]
    s2_sweet_pot = [
        pose(4.5, 380, 480, 380, growth=1.0, cutaway=1, roots=1, z=2),
        pose(9.0, 380, 480, 380, growth=1.0, cutaway=1, roots=1, z=2),
    ]
    s2_hand = [
        pose(4.5, 500, 320, 240, z=3),
        pose(5.2, 400, 440, 240, z=3),
        pose(9.0, 400, 340, 240, z=3),
    ]
    s2_actions = [
        action("uproot", 5.4, 8.6, "sweet_potato_plant", "hand"),
    ]
    scene2 = scene(4.5, 9.0, {
        "kohlrabi_plant": s2_kohlrabi,
        "sweet_potato_plant": s2_sweet_pot,
        "hand": s2_hand,
    }, actions=s2_actions, bg="soil_cutaway")

    story = {
        "id": "vegetable_cutaway",
        "name": "5 · Mặt cắt đất: su hào, khoai lang sinh trưởng và thu hoạch nhổ củ",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase E: mặt cắt đất soil_cutaway thấy củ su hào trên đất, củ khoai lang phình to dưới đất, và bàn tay nhổ củ uproot kéo theo củ khoai.",
        "duration": 9.0,
        "characters": [
            actor("kohlrabi_plant", "kohlrabi_plant"),
            actor("sweet_potato_plant", "sweet_potato_plant"),
            actor("hand", "hand"),
        ],
        "scenes": [scene1, scene2],
        "cues": [
            {"start": 0.5, "end": 3.8, "character_id": "sweet_potato_plant", "text": "Dưới lòng đất màu mỡ, củ khoai lang phình to mập mạp!", "expression": "happy"},
            {"start": 5.2, "end": 8.6, "character_id": "kohlrabi_plant", "text": "Bác nông dân nhổ khoai, từng chùm củ ngọt lành theo cây lên mặt đất!", "expression": "surprised"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def safe_spraying_examples():
    """Technical showcase for Phase F: PPE, chemical storage, wind spray drift and produce washing."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="farm_warehouse", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    # Scene 1: Warehouse / Storage preparation (0.0 -> 5.0s)
    s1_farmer = [
        pose(0, 240, 810, 360, expression="happy"),
        pose(5.0, 240, 810, 360, expression="happy"),
    ]
    s1_mask = [
        pose(0, 0, 2, 105),
        pose(5.0, 0, 2, 105),
    ]
    s1_goggles = [
        pose(0, 0, 0, 92),
        pose(5.0, 0, 0, 92),
    ]
    s1_sprayer = [
        pose(0, 160, 810, 220),
        pose(5.0, 160, 810, 220),
    ]
    s1_cabinet = [
        pose(0, 460, 810, 320, open=1.0),
        pose(5.0, 460, 810, 320, open=1.0),
    ]
    s1_bottle = [
        pose(0, 460, 680, 80),
        pose(5.0, 460, 680, 80),
    ]
    s1_sign = [
        pose(0, 80, 810, 240),
        pose(5.0, 80, 810, 240),
    ]
    s1_actions = [
        action("pour", 1.5, 4.0, target="sprayer", actor_id="bottle"),
    ]
    sc1 = scene(0, 5.0, {
        "farmer": s1_farmer,
        "mask": s1_mask,
        "goggles": s1_goggles,
        "sprayer": s1_sprayer,
        "cabinet": s1_cabinet,
        "bottle": s1_bottle,
        "sign": s1_sign,
    }, actions=s1_actions, bg="farm_warehouse")

    # Scene 2: Spraying with wind drift causing bystander toxic (5.0 -> 10.0s)
    s2_farmer = [
        pose(5.0, 180, 810, 360, expression="happy"),
        pose(8.0, 180, 810, 360, expression="worried"),
        pose(10.0, 180, 810, 360, expression="worried"),
    ]
    s2_mask = [
        pose(5.0, 0, 2, 105),
        pose(10.0, 0, 2, 105),
    ]
    s2_goggles = [
        pose(5.0, 0, 0, 92),
        pose(10.0, 0, 0, 92),
    ]
    worn = held_pose("backpack_sprayer", 220, 0, anchor="back")
    s2_sprayer = [
        {"time": 5.0, "height": 220, "z": -1, **worn},
        {"time": 10.0, "height": 220, "z": -1, **worn},
    ]
    s2_cabbage = [
        pose(5.0, 300, 810, 180, growth=1.0),
        pose(10.0, 300, 810, 180, growth=1.0),
    ]
    # Người đứng cuối gió: spray_drift tự bật toxic (và sắc mặt) khi luồng sương bị gió đẩy tới chạm người.
    s2_bystander = [
        pose(5.0, 470, 810, 350, expression="happy", z=2),
        pose(10.0, 470, 810, 350, expression="happy", z=2),
    ]
    s2_actions = [
        action("spray_drift", 6.0, 9.2, target="bystander", actor_id="sprayer"),
    ]
    sc2 = scene(5.0, 10.0, {
        "farmer": s2_farmer,
        "mask": s2_mask,
        "goggles": s2_goggles,
        "sprayer": s2_sprayer,
        "cabbage": s2_cabbage,
        "bystander": s2_bystander,
    }, actions=s2_actions, bg="vegetable_rows", weather="wind")

    # Scene 3: Kitchen washing produce clean (10.0 -> 15.0s)
    s3_bystander = [
        pose(10.0, 180, 810, 350, expression="worried", toxic=0.4),
        pose(12.5, 180, 810, 350, expression="happy", toxic=0.0),
        pose(15.0, 180, 810, 350, expression="happy", toxic=0.0),
    ]
    s3_basin = [
        pose(10.0, 380, 810, 200, fill=0.6),
        pose(15.0, 380, 810, 200, fill=0.6),
    ]
    s3_cabbage = [
        pose(10.0, 380, 750, 130, toxic=0.6, z=2),
        pose(13.5, 380, 750, 130, toxic=0.0, z=2),
        pose(15.0, 380, 750, 130, toxic=0.0, z=2),
    ]
    s3_hand = [
        pose(10.0, 380, 690, 140, z=3),
        pose(15.0, 380, 690, 140, z=3),
    ]
    s3_actions = [
        action("wash_produce", 11.0, 14.2, target="cabbage", actor_id="hand"),
    ]
    sc3 = scene(10.0, 15.0, {
        "bystander": s3_bystander,
        "basin": s3_basin,
        "cabbage": s3_cabbage,
        "hand": s3_hand,
    }, actions=s3_actions, bg="kitchen")

    story = {
        "id": "safe_spraying",
        "name": "6 · An toàn hoá chất: bảo hộ, gió tạt sương độc và rửa sạch nông sản",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase F: tủ khoá hoá chất, đồ bảo hộ ppe_mask, bình phun backpack_sprayer, gió làm spray_drift nhiễm toxic và wash_produce trong chậu rửa kitchen.",
        "duration": 15.0,
        "characters": [
            actor("farmer", "farmer"),
            actor("mask", "ppe_mask", face=False, layer="over_face", attach_to={"id": "farmer", "anchor": "mouth"}),
            actor("goggles", "ppe_goggles", face=False, layer="over_face", attach_to={"id": "farmer", "anchor": "face"}),
            actor("sprayer", "backpack_sprayer", face=False, attach_to={"id": "farmer", "anchor": "back"}),
            actor("cabinet", "chem_cabinet", face=False),
            actor("bottle", "pesticide_bottle", face=False),
            actor("sign", "warning_sign", face=False),
            actor("bystander", "farmer_woman"),
            actor("cabbage", "cabbage"),
            actor("basin", "rinse_basin", face=False),
            actor("hand", "hand", face=False),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 3.5, "character_id": "farmer", "text": "Trang bị mặt nạ bảo hộ và cất giữ hoá chất đúng quy định trong tủ khoá.", "expression": "happy"},
            {"start": 6.2, "end": 9.2, "character_id": "bystander", "text": "Gió lớn làm tạt sương thuốc, phải ngừng phun ngay để tránh nhiễm độc!", "expression": "worried"},
            {"start": 11.2, "end": 14.5, "character_id": "bystander", "text": "Rửa rau củ thật sạch trong bồn nước trước khi dùng để an toàn cho sức khoẻ.", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def giant_radish_examples():
    """Technical showcase for Phase G: collective tug on giant radish, pop-and-fall, and market celebration."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="farmyard_barn", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    # Scene 1: Ông nhổ một mình không nổi (pop_at = end: củ không bật) (0 -> 5s)
    sc1 = scene(0, 5.0, {
        "radish": [pose(0, 90, 810, 340, growth=1.0), pose(5.0, 90, 810, 340, growth=1.0)],
        "grandpa": [pose(0, 200, 810, 340, expression="happy"), pose(5.0, 200, 810, 340, expression="worried")],
    }, actions=[
        action("tug", 1.0, 4.0, target="radish", actor_id="grandpa", pop_at=4.0),
        action("emote", 4.1, 5.0, actor_id="grandpa", emote="!"),
    ], bg="farmyard_barn")

    # Scene 2: Ông – bà – cháu – chó – mèo – chuột nối nhau kéo; pop_at 9.6 củ bật, cả đoàn ngã (5 -> 11s)
    sc2 = scene(5.0, 11.0, {
        "radish": [pose(5.0, 40, 810, 340, growth=1.0), pose(11.0, 40, 810, 340, growth=1.0)],
        "grandpa": [pose(5.0, 160, 810, 330, z=1), pose(11.0, 160, 810, 330, z=1)],
        "grandma": [pose(5.0, 240, 810, 320, z=2), pose(11.0, 240, 810, 320, z=2)],
        "kid": [pose(5.0, 290, 810, 210, z=3), pose(11.0, 290, 810, 210, z=3)],
        "dog": [pose(5.0, 350, 810, 130, flip=True, z=4), pose(11.0, 350, 810, 130, flip=True, z=4)],
        "cat": [pose(5.0, 450, 810, 110, flip=True, z=5), pose(11.0, 450, 810, 110, flip=True, z=5)],
        "mouse": [pose(5.0, 525, 810, 70, flip=True, z=6), pose(11.0, 525, 810, 70, flip=True, z=6)],
    }, actions=[
        action("tug", 5.5, 11.0, target="radish", actor_id="grandpa", helpers=["grandma", "kid", "dog", "cat", "mouse"], pop_at=9.6, lift_amount=120),
        action("dizzy", 10.3, 11.0, actor_id="grandpa"),
    ], bg="farmyard_barn")

    # Scene 3: Củ cải đã lên khỏi đất, cả nhà ăn mừng ở chợ quê (11 -> 16s)
    sc3 = scene(11.0, 16.0, {
        "radish": [pose(11.0, 120, 700, 240, expression="happy", growth=1.0, roots=1.0, rotation=-8), pose(16.0, 120, 700, 240, expression="happy", growth=1.0, roots=1.0, rotation=-8)],
        "grandpa": [pose(11.0, 250, 810, 330, expression="happy"), pose(16.0, 250, 810, 330, expression="happy")],
        "grandma": [pose(11.0, 340, 810, 320, expression="happy"), pose(16.0, 340, 810, 320, expression="happy")],
        "kid": [pose(11.0, 420, 810, 210, expression="happy"), pose(16.0, 420, 810, 210, expression="happy")],
        "dog": [pose(11.0, 480, 810, 130, expression="happy", flip=True), pose(16.0, 480, 810, 130, expression="happy", flip=True)],
        "cat": [pose(11.0, 190, 810, 110, expression="happy"), pose(16.0, 190, 810, 110, expression="happy")],
        "mouse": [pose(11.0, 540, 810, 70, expression="happy", flip=True), pose(16.0, 540, 810, 70, expression="happy", flip=True)],
    }, actions=[
        action("celebrate", 11.2, 15.8, actor_id="grandpa"),
        action("bounce", 11.5, 15.5, actor_id="dog"),
        action("bounce", 11.8, 15.5, actor_id="kid"),
        action("emote", 12.0, 15.5, actor_id="radish", emote="heart"),
    ], bg="village_market")

    story = {
        "id": "giant_radish",
        "name": "1 · Củ cải khổng lồ: kéo co tập thể, ngã lăn và pháo hoa ăn mừng",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase G: củ cải khổng lồ giant_radish, kéo co tug đồng đội, bật tung pop_at, rơi giấy celebrate và hình nền farmyard_barn, village_market.",
        "duration": 16.0,
        "characters": [
            actor("radish", "giant_radish"),
            actor("grandpa", "farmer"),
            actor("grandma", "farmer_woman"),
            actor("kid", "chibi_kid"),
            actor("dog", "dog"),
            actor("cat", "cat"),
            actor("mouse", "mouse"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 3.5, "character_id": "grandpa", "text": "Củ cải to quá, một mình ta nhổ mãi không lay chuyển được!", "expression": "worried"},
            {"start": 6.0, "end": 9.2, "character_id": "grandma", "text": "Nào cả nhà cùng chung sức, một hai ba kéo lên nào!", "expression": "happy"},
            {"start": 11.5, "end": 14.5, "character_id": "grandpa", "text": "Hoan hô, củ cải lên rồi! Cả nhà cùng vui múa ăn mừng thôi!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def handwashing_examples():
    """Technical showcase for Phase H: 6-step hand hygiene, soap bubbles, germ detachment, and heart emote."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="bathroom_sink", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    # Scene 1: Kid arrives with germs on hands (0 -> 5s)
    sc1 = scene(0, 5.0, {
        "kid": [pose(0, 180, 810, 320, expression="worried"), pose(5.0, 180, 810, 320, expression="worried")],
        "soap": [pose(0, 372, 652, 34), pose(5.0, 372, 652, 34)],
        "bac1": [pose(0, 210, 680, 60), pose(5.0, 215, 675, 60)],
        "bac2": [pose(0, 230, 710, 50), pose(5.0, 225, 715, 50)],
    }, actions=[
        action("germ_attack", 0.5, 4.8, actor_id="bac1", target="kid"),
        action("emote", 2.0, 4.0, actor_id="kid", emote="!"),
    ], bg="bathroom_sink")

    # Scene 2: 6-step handwashing with soap and lather bubbles (5 -> 11s)
    sc2 = scene(5.0, 11.0, {
        "kid": [pose(5.0, 250, 810, 320, expression="neutral"), pose(11.0, 250, 810, 320, expression="happy")],
        "soap": [pose(5.0, 372, 652, 34), pose(11.0, 372, 652, 34)],
        "bac1": [pose(5.0, 215, 675, 60), pose(8.0, 310, 500, 30), pose(11.0, 420, 350, 10)],
        "bac2": [pose(5.0, 225, 715, 50), pose(8.0, 330, 520, 25), pose(11.0, 450, 380, 10)],
    }, actions=[
        action("wash_hands", 5.2, 10.8, actor_id="kid", target="soap"),
    ], bg="bathroom_sink")

    # Scene 3: Clean sparkly hands, healthy smile and heart emote (11 -> 16s)
    sc3 = scene(11.0, 16.0, {
        "kid": [pose(11.0, 270, 810, 320, expression="happy", sparkle=1.0, blush=0.5), pose(16.0, 270, 810, 320, expression="happy", sparkle=1.0, blush=0.5)],
        "towel": [pose(11.0, 450, 810, 90), pose(16.0, 450, 810, 90)],
    }, actions=[
        action("emote", 12.0, 15.5, actor_id="kid", emote="heart"),
    ], bg="bathroom_sink")

    story = {
        "id": "handwashing",
        "name": "1 · Rửa tay 6 bước: xà phòng tạo bọt, đánh bay vi khuẩn và đôi tay sáng bóng",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase H: Chibi rửa tay 6 bước wash_hands, bọt tuyết xà phòng, vi khuẩn bacteria_rod / virus_spike vỡ bọt và hình nền bathroom_sink.",
        "duration": 16.0,
        "characters": [
            actor("kid", "chibi_kid"),
            actor("soap", "soap", face=False),
            actor("towel", "towel", face=False),
            actor("bac1", "bacteria_rod", face=False),
            actor("bac2", "virus_spike", face=False),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 3.8, "character_id": "kid", "text": "Sau khi chơi đùa, vi khuẩn bám đầy trên tay phải rửa thật sạch ngay!", "expression": "worried"},
            {"start": 5.5, "end": 9.5, "character_id": "kid", "text": "Lấy xà phòng, xoa đều mu bàn tay và từng kẽ ngón tay theo 6 bước chuẩn.", "expression": "neutral"},
            {"start": 11.5, "end": 15.0, "character_id": "kid", "text": "Đôi tay đã sạch bong kin kít, thơm mát và an toàn cho sức khoẻ!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def doctor_visit_examples():
    """Technical showcase for Phase H: clinic examination, thermometer fever check, stethoscope auscultation, vaccination, and bandage."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="clinic_room", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    def tool(t, asset, h, rotation, opacity=1.0):
        return {"time": t, "height": h, "opacity": opacity, **held_pose(asset, h, rotation)}

    # Scene 1: Kid is sick with fever, doctor measures temperature (0 -> 5s)
    sc1 = scene(0, 5.0, {
        "doctor": [pose(0, 190, 810, 360, expression="neutral"), pose(5.0, 190, 810, 360, expression="neutral")],
        "patient": [pose(0, 360, 810, 310, expression="sick", fever=0.8, tears=0.3), pose(5.0, 360, 810, 310, expression="sick", fever=0.8, tears=0.3)],
        "thermo": [tool(0, "thermometer", 70, -70), tool(5.0, "thermometer", 70, -70)],
    }, actions=[
        action("take_temperature", 0.8, 4.5, actor_id="doctor", target="patient", tool="thermo"),
    ], bg="clinic_room")

    # Scene 2: Doctor listens to chest with stethoscope and checks heartbeat (5 -> 10s)
    sc2 = scene(5.0, 10.0, {
        "doctor": [pose(5.0, 210, 810, 360, expression="neutral"), pose(10.0, 210, 810, 360, expression="happy")],
        "patient": [pose(5.0, 350, 810, 310, expression="surprised", fever=0.3), pose(10.0, 350, 810, 310, expression="happy", fever=0.1)],
        "stetho": [tool(5.0, "stethoscope", 80, -20), tool(10.0, "stethoscope", 80, -20)],
    }, actions=[
        action("listen", 5.5, 9.5, actor_id="doctor", target="patient", tool="stetho"),
    ], bg="clinic_room")

    # Scene 3: Safe vaccination, protective band-aid, kid smiles healthy (10 -> 15s)
    sc3 = scene(10.0, 15.0, {
        "doctor": [pose(10.0, 170, 810, 360, expression="happy"), pose(12.8, 170, 810, 360, expression="happy"), pose(13.2, 280, 810, 360, expression="happy"), pose(15.0, 280, 810, 360, expression="happy")],
        "patient": [pose(10.0, 400, 810, 310, expression="neutral", blush=0.4), pose(15.0, 400, 810, 310, expression="happy", blush=0.6, sparkle=1.0)],
        "syringe": [tool(10.0, "syringe", 62, -60), tool(12.8, "syringe", 62, -60), tool(13.0, "syringe", 62, -60, opacity=0.0), tool(15.0, "syringe", 62, -60, opacity=0.0)],
        "bandaid": [pose(10.0, 0, 6, 22, rotation=20, opacity=0.0), pose(14.0, 0, 6, 22, rotation=20, opacity=0.0), pose(14.3, 0, 6, 22, rotation=20), pose(15.0, 0, 6, 22, rotation=20)],
    }, actions=[
        action("vaccinate", 10.3, 12.8, actor_id="doctor", target="patient", tool="syringe"),
        action("apply_bandage", 13.0, 14.8, actor_id="doctor", target="patient"),
        action("emote", 13.5, 14.8, actor_id="patient", emote="heart"),
    ], bg="clinic_room")

    story = {
        "id": "doctor_visit",
        "name": "2 · Khám bác sĩ Chibi: đo nhiệt kế, nghe nhịp tim, tiêm phòng và dán băng",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase H: Bác sĩ chibi chibi_doctor khám bệnh cho chibi_patient, take_temperature, listen, vaccinate, apply_bandage tại clinic_room.",
        "duration": 15.0,
        "characters": [
            actor("doctor", "chibi_doctor"),
            actor("patient", "chibi_patient"),
            actor("thermo", "thermometer", face=False, attach_to={"id": "doctor", "anchor": "hand_r"}),
            actor("stetho", "stethoscope", face=False, attach_to={"id": "doctor", "anchor": "hand_r"}),
            actor("syringe", "syringe", face=False, attach_to={"id": "doctor", "anchor": "hand_r"}),
            actor("bandaid", "band_aid", face=False, layer="over_face", attach_to={"id": "patient", "anchor": "arm_l"}),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.0, "character_id": "doctor", "text": "Bé bị sốt nhẹ rồi, để bác sĩ đo nhiệt độ kiểm tra sức khoẻ nhé.", "expression": "neutral"},
            {"start": 5.5, "end": 9.0, "character_id": "doctor", "text": "Nhịp tim đập rất đều và phổi khoẻ mạnh, không có gì đáng lo cả.", "expression": "happy"},
            {"start": 10.5, "end": 14.2, "character_id": "patient", "text": "Tiêm một chút như kiến cắn thôi, dán băng xinh xắn là khoẻ re!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def tooth_examples():
    """Technical showcase for Phase H: chibi dentist, tooth cavity, toothbrushing foam, and sparkling recovery."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="dentist_room", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    # Scene 1: Tooth has a painful cavity and cries (0 -> 5s)
    sc1 = scene(0, 5.0, {
        "dentist": [pose(0, 190, 810, 360, expression="neutral"), pose(5.0, 190, 810, 360, expression="neutral")],
        "tooth": [pose(0, 360, 810, 180, cavity=0.9, tears=0.8, expression="sad"), pose(5.0, 360, 810, 180, cavity=0.9, tears=0.8, expression="sad")],
    }, actions=[
        action("emote", 1.0, 3.5, actor_id="tooth", emote="!"),
    ], bg="dentist_room")

    # Scene 2: Dentist brushes teeth, bubbles remove cavity (5 -> 11s)
    sc2 = scene(5.0, 11.0, {
        "dentist": [pose(5.0, 210, 810, 360, expression="neutral"), pose(11.0, 210, 810, 360, expression="happy")],
        "tooth": [pose(5.0, 340, 810, 180, cavity=0.8, tears=0.2), pose(8.0, 340, 810, 180, cavity=0.3, tears=0.0), pose(11.0, 340, 810, 180, cavity=0.0, sparkle=0.6, expression="happy")],
        "brush": [{"time": 5.0, "height": 80, **held_pose("toothbrush", 80, -90)}, {"time": 11.0, "height": 80, **held_pose("toothbrush", 80, -90)}],
    }, actions=[
        action("brush_teeth", 5.5, 10.5, actor_id="dentist", target="tooth", tool="brush"),
    ], bg="dentist_room")

    # Scene 3: Clean, sparkling white tooth, cheerful smiles (11 -> 16s)
    sc3 = scene(11.0, 16.0, {
        "dentist": [pose(11.0, 210, 810, 360, expression="happy"), pose(16.0, 210, 810, 360, expression="happy")],
        "tooth": [pose(11.0, 350, 810, 180, cavity=0.0, sparkle=1.0, blush=0.5, expression="happy"), pose(16.0, 350, 810, 180, cavity=0.0, sparkle=1.0, blush=0.5, expression="happy")],
    }, actions=[
        action("emote", 11.5, 15.0, actor_id="tooth", emote="star"),
    ], bg="dentist_room")

    story = {
        "id": "tooth_care",
        "name": "3 · Nha khoa Chibi: chữa sâu răng, chải răng sạch bọt và răng xinh toả sáng",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase H: Chiếc răng tooth_chibi có vết sâu cavity, nha sĩ chibi_dentist chải răng brush_teeth làm sạch sâu và toả sáng lấp lánh sparkle.",
        "duration": 16.0,
        "characters": [
            actor("dentist", "chibi_dentist"),
            actor("tooth", "tooth_chibi"),
            actor("brush", "toothbrush", face=False, attach_to={"id": "dentist", "anchor": "hand_r"}),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.0, "character_id": "dentist", "text": "Ăn nhiều đồ ngọt không chải răng làm sâu răng đau buốt rồi kìa!", "expression": "neutral"},
            {"start": 5.5, "end": 9.5, "character_id": "dentist", "text": "Hãy chải răng thật kỹ mặt trong mặt ngoài theo vòng tròn nhé.", "expression": "neutral"},
            {"start": 11.5, "end": 15.0, "character_id": "tooth", "text": "Răng đã sạch bóng và trắng tinh toả sáng lấp lánh rồi!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def nutrition_examples():
    """Technical showcase for Phase H: balanced school lunch tray, eating fresh vegetables, and energetic exercise."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="classroom", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    # Scene 1: Chibi girl eats nutritious vegetables and soup from lunch tray (0 -> 5s)
    sc1 = scene(0, 5.0, {
        "kid": [pose(0, 200, 810, 320, expression="happy", blush=0.4), pose(5.0, 200, 810, 320, expression="happy", blush=0.4)],
        "tray": [pose(0, 340, 810, 60), pose(5.0, 340, 810, 60)],
    }, actions=[
        action("eat", 0.8, 4.5, actor_id="kid", target="tray"),
    ], bg="classroom")

    # Scene 2: Filled with energy, kid exercises in the school yard (5 -> 10s)
    sc2 = scene(5.0, 10.0, {
        "kid": [pose(5.0, 270, 810, 320, expression="happy"), pose(10.0, 270, 810, 320, expression="happy")],
    }, actions=[
        action("exercise", 5.5, 9.5, actor_id="kid", exercise_type="jumping_jacks"),
    ], bg="school_yard")

    # Scene 3: Healthy, strong and cheerful on the playground (10 -> 15s)
    sc3 = scene(10.0, 15.0, {
        "kid": [pose(10.0, 270, 810, 320, expression="happy", jump=0.0, sparkle=0.5), pose(12.5, 270, 720, 320, expression="happy", jump=1.0, sparkle=1.0), pose(15.0, 270, 810, 320, expression="happy", jump=0.0, sparkle=1.0)],
    }, actions=[
        action("emote", 11.0, 14.5, actor_id="kid", emote="heart"),
    ], bg="playground")

    story = {
        "id": "nutrition_fitness",
        "name": "4 · Dinh dưỡng và rèn luyện: khay cơm đủ chất, ăn rau củ và tập thể dục thể thao",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase H: Chibi chibi_girl ăn trưa khay cơm dinh dưỡng lunch_tray bằng hành động eat, tập thể dục exercise và nhảy cao tại playground.",
        "duration": 15.0,
        "characters": [
            actor("kid", "chibi_girl"),
            actor("tray", "lunch_tray", face=False),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.0, "character_id": "kid", "text": "Khay cơm đầy đủ rau xanh, đạm và canh ngon giúp cơ thể phát triển khoẻ mạnh!", "expression": "happy"},
            {"start": 5.5, "end": 9.0, "character_id": "kid", "text": "Ăn no đủ chất rồi thì cùng ra sân tập thể dục nhảy dây nâng cao thể lực nào.", "expression": "happy"},
            {"start": 10.5, "end": 14.0, "character_id": "kid", "text": "Cơ thể tràn đầy năng lượng, sảng khoái và luôn tươi vui mỗi ngày!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def scrape_battle_examples():
    """Technical showcase for Phase I: scrape wound on skin, neutrophil net trap, macrophage engulf, B cell antibody, and platelet wound patching."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="wound_site", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sc1 = scene(0, 5.0, {
        "patch": [pose(0, 200, 810, 180, wound=0.8), pose(5.0, 200, 810, 180, wound=0.8)],
        "germ": [pose(0, 420, 810, 120), pose(2.0, 340, 810, 120), pose(5.0, 340, 810, 120, stunned=1.0)],
        "neutro": [pose(0, 100, 810, 140), pose(2.0, 260, 810, 140), pose(5.0, 260, 810, 140)],
    }, actions=[
        action("charge", 0.5, 2.5, actor_id="neutro", target="germ"),
        action("net_trap", 2.2, 4.8, actor_id="neutro", target="germ"),
    ], bg="wound_site")

    sc2 = scene(5.0, 10.0, {
        "patch": [pose(5.0, 200, 810, 180, wound=0.8), pose(10.0, 200, 810, 180, wound=0.8)],
        "germ": [pose(5.0, 340, 810, 120, stunned=1.0), pose(7.5, 280, 780, 60, opacity=0.3), pose(10.0, 280, 780, 20, opacity=0.0)],
        "macro": [pose(5.0, 240, 810, 170, engulf=0.0), pose(7.5, 280, 810, 170, engulf=1.0), pose(10.0, 280, 810, 170, engulf=0.0)],
        "archer": [pose(5.0, 120, 810, 140), pose(10.0, 120, 810, 140)],
        "cluster": [pose(5.0, 440, 810, 130), pose(8.0, 440, 810, 130, tagged=0.0), pose(10.0, 440, 810, 130, tagged=1.0)],
    }, actions=[
        action("engulf", 5.5, 9.5, actor_id="macro", target="germ"),
        action("shoot_antibody", 6.5, 9.8, actor_id="archer", target="cluster"),
    ], bg="wound_site")

    sc3 = scene(10.0, 15.0, {
        "patch": [pose(10.0, 200, 810, 180, wound=0.8), pose(13.5, 200, 810, 180, wound=0.0), pose(15.0, 200, 810, 180, wound=0.0)],
        "platelet": [pose(10.0, 260, 810, 100), pose(15.0, 260, 810, 100)],
        "macro": [pose(10.0, 380, 810, 170), pose(15.0, 380, 810, 170, glow=1.0)],
    }, actions=[
        action("patch_wound", 10.5, 13.8, actor_id="platelet", target="patch"),
        action("victory", 13.8, 15.0, actor_id="macro"),
    ], bg="wound_site")

    story = {
        "id": "scrape_battle",
        "name": "11 · Trận chiến trầy xước: bảo vệ vết thương, bắt vi khuẩn và tiểu cầu vá da",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase I: Vết xước ngoài da, bạch cầu trung tính net_trap, đại thực bào engulf, tế bào B shoot_antibody và tiểu cầu patch_wound làm lành da.",
        "duration": 15.0,
        "characters": [
            actor("patch", "skin_patch"),
            actor("germ", "bacteria_chain"),
            actor("cluster", "bacteria_cluster"),
            actor("neutro", "neutrophil_scout"),
            actor("macro", "macrophage_chef"),
            actor("archer", "b_cell_archer"),
            actor("platelet", "platelet_builder"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.5, "character_id": "neutro", "text": "Có vết xước hở rồi, bạch cầu trung tính lập tức xông lên tung lưới chặn vi khuẩn!", "expression": "neutral"},
            {"start": 5.5, "end": 9.5, "character_id": "macro", "text": "Đại thực bào dũng cảm nuốt trọn mầm bệnh và tế bào B bắn kháng thể đánh dấu!", "expression": "neutral"},
            {"start": 10.5, "end": 14.5, "character_id": "platelet", "text": "Tiểu cầu kết mạng lưới làm lành vết thương, trả lại làn da mịn màng khoẻ mạnh!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    auto_frame(story)
    validate_story(story)
    return [story]


def virus_invasion_examples():
    """Technical showcase for Phase I: virus hijack, killer T strike, and brain thermostat regulation."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="blood_vessel", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sc1 = scene(0, 5.0, {
        "virus": [pose(0, 180, 810, 120), pose(2.5, 280, 770, 100), pose(5.0, 280, 770, 40, opacity=0.0)],
        "cell": [pose(0, 340, 810, 150, infected=0.2), pose(3.0, 340, 810, 150, infected=0.8), pose(5.0, 340, 810, 150, infected=1.0)],
    }, actions=[
        action("hijack", 1.0, 4.5, actor_id="virus", target="cell"),
    ], bg="blood_vessel")

    sc2 = scene(5.0, 10.0, {
        "cell": [pose(5.0, 340, 810, 150, infected=1.0), pose(8.5, 340, 810, 150, infected=1.0, pop=0.5), pose(10.0, 340, 810, 150, infected=1.0, pop=1.0, opacity=0.0)],
        "knight": [pose(5.0, 180, 810, 150), pose(8.0, 260, 810, 150), pose(10.0, 260, 810, 150)],
        "ninja": [pose(5.0, 440, 810, 140), pose(10.0, 440, 810, 140)],
    }, actions=[
        action("strike_infected", 6.0, 9.5, actor_id="knight", target="cell"),
    ], bg="blood_vessel")

    sc3 = scene(10.0, 15.0, {
        "brain": [pose(10.0, 288, 810, 180, think=0.5), pose(12.5, 288, 810, 180, think=1.0, thermostat=0.8), pose(15.0, 288, 810, 180, think=0.0, thermostat=0.0, glow=1.0)],
    }, bg="brain_hq")

    story = {
        "id": "virus_invasion",
        "name": "12 · Đột kích virus: T gây độc và sát thủ NK tiêu diệt tế bào nhiễm",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase I: Virus xâm nhập tế bào hijack, hiệp sĩ T killer_t_knight strike_infected và não bộ brain_chibi điều chỉnh nhiệt kế bảo vệ cơ thể.",
        "duration": 15.0,
        "characters": [
            actor("virus", "virus_spike"),
            actor("cell", "infected_cell"),
            actor("knight", "killer_t_knight"),
            actor("ninja", "nk_ninja"),
            actor("brain", "brain_chibi"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.5, "character_id": "virus", "text": "Virus tìm cách bám vào tế bào và xâm nhập để biến nó thành ổ nhiễm bệnh!", "expression": "neutral"},
            {"start": 5.5, "end": 9.5, "character_id": "knight", "text": "Hiệp sĩ T và ninja NK phối hợp chém trúng tế bào nhiễm, vô hiệu hoá virus!", "expression": "neutral"},
            {"start": 10.5, "end": 14.5, "character_id": "brain", "text": "Não bộ điều chỉnh phản ứng sốt nhẹ hỗ trợ diệt khuẩn rồi nghỉ ngơi hồi phục hoàn toàn!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    auto_frame(story)
    validate_story(story)
    return [story]


def vaccine_training_examples():
    """Technical showcase for Phase I: vaccine training camp, memory cell album learning, and fast defense."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="training_camp", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sc1 = scene(0, 5.0, {
        "librarian": [pose(0, 220, 810, 150, glow=0.2), pose(5.0, 220, 810, 150, glow=0.8)],
        "archer": [pose(0, 380, 810, 140), pose(5.0, 380, 810, 140)],
    }, actions=[
        action("remember", 0.8, 4.5, actor_id="librarian"),
    ], bg="training_camp")

    sc2 = scene(5.0, 10.0, {
        "librarian": [pose(5.0, 180, 810, 150), pose(10.0, 180, 810, 150)],
        "archer": [pose(5.0, 260, 810, 140), pose(10.0, 260, 810, 140)],
        "spore": [pose(5.0, 420, 810, 120), pose(8.0, 420, 810, 120, tagged=0.0), pose(10.0, 420, 810, 120, tagged=1.0)],
    }, actions=[
        action("shoot_antibody", 5.8, 9.5, actor_id="archer", target="spore"),
    ], bg="training_camp")

    sc3 = scene(10.0, 15.0, {
        "captain": [pose(10.0, 220, 810, 150, glow=0.0), pose(12.0, 220, 810, 150, glow=1.0), pose(15.0, 220, 810, 150, glow=1.0)],
        "archer": [pose(10.0, 360, 810, 140), pose(15.0, 360, 810, 140, glow=0.9)],
    }, actions=[
        action("rally", 10.5, 13.5, actor_id="captain", target="archer"),
        action("victory", 13.5, 15.0, actor_id="captain"),
    ], bg="lymph_node_base")

    story = {
        "id": "vaccine_training",
        "name": "13 · Trại tập luyện vaccine: tế bào nhớ học nhận diện mầm bệnh an toàn",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase I: Tại training_camp, tế bào nhớ memory_cell_librarian remember học tập nhận diện kháng nguyên, giúp hệ miễn dịch phản ứng tức thì.",
        "duration": 15.0,
        "characters": [
            actor("librarian", "memory_cell_librarian"),
            actor("archer", "b_cell_archer"),
            actor("spore", "fungus_spore"),
            actor("captain", "helper_t_captain"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.5, "character_id": "librarian", "text": "Vaccine giúp thủ thư tế bào nhớ nhận diện trước hình ảnh mầm bệnh an toàn vào sổ tay!", "expression": "happy"},
            {"start": 5.5, "end": 9.5, "character_id": "archer", "text": "Khi mầm bệnh thật xuất hiện, xạ thủ B lập tức bắn kháng thể chuẩn xác không một giây chậm trễ!", "expression": "neutral"},
            {"start": 10.5, "end": 14.5, "character_id": "captain", "text": "Chỉ huy phát sóng tập hợp, toàn bộ cơ thể được bảo vệ an toàn tối đa!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    auto_frame(story)
    validate_story(story)
    return [story]


def body_tour_examples():
    """Technical showcase for Phase I: transparent body xray tour highlighting heart, lungs, stomach, and brain."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="body_inside", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    sc1 = scene(0, 4.0, {
        "xray": [pose(0, 288, 810, 360, highlight="heart"), pose(4.0, 288, 810, 360, highlight="heart")],
        "heart": [pose(0, 310, 666, 70), pose(4.0, 310, 666, 70)],
    }, bg="body_inside")

    sc2 = scene(4.0, 8.0, {
        "xray": [pose(4.0, 288, 810, 360, highlight="lungs"), pose(8.0, 288, 810, 360, highlight="lungs")],
        "lungs": [pose(4.0, 288, 658, 80), pose(8.0, 288, 658, 80)],
    }, bg="body_inside")

    sc3 = scene(8.0, 12.0, {
        "xray": [pose(8.0, 288, 810, 360, highlight="stomach"), pose(12.0, 288, 810, 360, highlight="stomach")],
        "stomach": [pose(8.0, 310, 695, 75), pose(12.0, 310, 695, 75)],
    }, bg="body_inside")

    sc4 = scene(12.0, 16.0, {
        "xray": [pose(12.0, 288, 810, 360, highlight="brain"), pose(16.0, 288, 810, 360, highlight="brain")],
        "brain": [pose(12.0, 288, 529, 80), pose(16.0, 288, 529, 80)],
    }, bg="body_inside")

    story = {
        "id": "body_tour",
        "name": "14 · Du hành cơ thể: X-quang khám phá các cơ quan hoạt động nhịp nhàng",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase I: Khung X-quang body_xray soi sáng từng cơ quan trong cơ thể: tim đập, phổi thở, dạ dày tiêu hoá và não bộ chỉ huy.",
        "duration": 16.0,
        "characters": [
            actor("xray", "body_xray"),
            actor("heart", "heart_chibi", attach_to={"id": "xray", "anchor": "heart"}),
            actor("lungs", "lungs_chibi", attach_to={"id": "xray", "anchor": "lungs"}),
            actor("stomach", "stomach_chibi", attach_to={"id": "xray", "anchor": "stomach"}),
            actor("brain", "brain_chibi", attach_to={"id": "xray", "anchor": "brain"}),
        ],
        "scenes": [sc1, sc2, sc3, sc4],
        "cues": [
            {"start": 0.5, "end": 3.5, "character_id": "heart", "text": "Trái tim khoẻ mạnh đập nhịp nhàng bơm máu và dưỡng chất nuôi toàn thân!", "expression": "happy"},
            {"start": 4.5, "end": 7.5, "character_id": "lungs", "text": "Hai lá phổi phồng xẹp hít thở không khí trong lành cung cấp oxy tươi mát!", "expression": "happy"},
            {"start": 8.5, "end": 11.5, "character_id": "stomach", "text": "Dạ dày tiêu hoá thức ăn thành năng lượng nuôi dưỡng cơ thể tràn đầy sức sống!", "expression": "happy"},
            {"start": 12.5, "end": 15.5, "character_id": "brain", "text": "Bộ não thông thái chỉ huy mọi giác quan và suy nghĩ điều tuyệt vời mỗi ngày!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    auto_frame(story)
    validate_story(story)
    return [story]


def gut_team_examples():
    """Technical showcase for Phase I: friendly gut microbiome guarding against pathogenic bacteria in intestine town."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="intestine_town", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sc1 = scene(0, 5.0, {
        "good1": [pose(0, 200, 810, 140), pose(5.0, 200, 810, 140)],
        "good2": [pose(0, 320, 810, 140), pose(5.0, 320, 810, 140)],
    }, actions=[
        action("patrol", 0.5, 4.5, actor_id="good1"),
        action("patrol", 0.5, 4.5, actor_id="good2"),
    ], bg="intestine_town")

    sc2 = scene(5.0, 10.0, {
        "good1": [pose(5.0, 200, 810, 140), pose(10.0, 200, 810, 140)],
        "good2": [pose(5.0, 280, 810, 140), pose(10.0, 280, 810, 140)],
        "bad": [pose(5.0, 460, 810, 130), pose(7.5, 360, 810, 130), pose(10.0, 420, 810, 130, stunned=0.8)],
    }, actions=[
        action("patrol", 5.5, 9.5, actor_id="good2"),
    ], bg="intestine_town")

    sc3 = scene(10.0, 15.0, {
        "good1": [pose(10.0, 220, 810, 140), pose(15.0, 220, 810, 140, glow=1.0)],
        "good2": [pose(10.0, 320, 810, 140), pose(15.0, 320, 810, 140, glow=1.0)],
        "intestine": [pose(10.0, 430, 810, 160), pose(15.0, 430, 810, 160, glow=0.8)],
    }, actions=[
        action("victory", 11.0, 14.5, actor_id="good1"),
        action("victory", 11.0, 14.5, actor_id="good2"),
    ], bg="intestine_town")

    story = {
        "id": "gut_team",
        "name": "15 · Đội quân đường ruột: lợi khuẩn giữ chỗ và bảo vệ hệ tiêu hoá",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase I: Tại intestine_town, lợi khuẩn good_bacteria đông đúc giữ chỗ và đẩy lùi vi khuẩn xấu bacteria_rod, giữ ruột êm khoẻ.",
        "duration": 15.0,
        "characters": [
            actor("good1", "good_bacteria"),
            actor("good2", "good_bacteria"),
            actor("bad", "bacteria_rod"),
            actor("intestine", "intestine_chibi"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.5, "character_id": "good1", "text": "Hàng triệu lợi khuẩn tí hon vui vẻ đi tuần bảo vệ từng ngọn đồi lông nhung đường ruột!", "expression": "happy"},
            {"start": 5.5, "end": 9.5, "character_id": "good2", "text": "Khi vi khuẩn xấu mon men tới, đội quân lợi khuẩn xếp hàng vững chắc chặn lối!", "expression": "neutral"},
            {"start": 10.5, "end": 14.5, "character_id": "intestine", "text": "Ăn nhiều rau xanh và sữa chua giúp bụng êm, tiêu hoá tốt và cơ thể khoẻ re!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    auto_frame(story)
    validate_story(story)
    return [story]


def cavity_examples():
    """Technical showcase for Phase I: cavity germ drilling, gentle sweep clearing plaque, and sparkling tooth."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="mouth_cave", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sc1 = scene(0, 5.0, {
        "tooth": [pose(0, 220, 810, 170, cavity=0.2), pose(3.0, 220, 810, 170, cavity=0.6), pose(5.0, 220, 810, 170, cavity=0.9, tears=0.5)],
        "germ": [pose(0, 380, 810, 120), pose(2.0, 300, 810, 120), pose(5.0, 300, 810, 120)],
    }, actions=[
        action("drill", 1.5, 4.8, actor_id="germ", target="tooth"),
    ], bg="mouth_cave")

    sc2 = scene(5.0, 10.0, {
        "tooth": [pose(5.0, 220, 810, 170, cavity=0.9), pose(8.0, 220, 810, 170, cavity=0.4), pose(10.0, 220, 810, 170, cavity=0.0)],
        "cilia": [pose(5.0, 380, 810, 140), pose(10.0, 380, 810, 140)],
        "goo": [pose(5.0, 310, 810, 100), pose(8.0, 420, 780, 100), pose(10.0, 560, 740, 100, opacity=0.0)],
    }, actions=[
        action("sweep", 5.5, 9.5, actor_id="cilia", target="goo"),
    ], bg="mouth_cave")

    sc3 = scene(10.0, 15.0, {
        "tooth": [pose(10.0, 288, 810, 170, cavity=0.0, sparkle=0.5), pose(12.5, 288, 810, 170, cavity=0.0, sparkle=1.0), pose(15.0, 288, 810, 170, cavity=0.0, sparkle=1.0, blush=0.5)],
    }, bg="mouth_cave")

    story = {
        "id": "cavity_battle",
        "name": "16 · Thám hiểm khoang miệng: ngăn chặn vi khuẩn sâu răng và mảng bám",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase I: Trong mouth_cave, vi khuẩn sâu răng cavity_germ drill, lông chổi vệ sinh sweep mảng bám plaque_goo và răng tooth_chibi toả sáng sparkle.",
        "duration": 15.0,
        "characters": [
            actor("tooth", "tooth_chibi"),
            actor("germ", "cavity_germ"),
            actor("cilia", "cilia_sweeper"),
            actor("goo", "plaque_goo"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.5, "character_id": "germ", "text": "Vi khuẩn sâu răng cầm máy khoan tí hon đục khoét men răng làm răng đau nhức!", "expression": "neutral"},
            {"start": 5.5, "end": 9.5, "character_id": "cilia", "text": "Chải răng đúng cách quét sạch mảng bám dính và đuổi sạch vi khuẩn sâu răng đi!", "expression": "neutral"},
            {"start": 10.5, "end": 14.5, "character_id": "tooth", "text": "Răng xinh trắng muốt toả sáng lấp lánh nụ cười tự tin rạng rỡ!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    auto_frame(story)
    validate_story(story)
    return [story]


def allergy_examples():
    """Technical showcase for Phase I: pollen puff allergy false alarm triggering sneezing clearance."""
    def actor(cid, asset, **extra):
        return {"id": cid, "name": _catalog()["assets"][asset]["label"], "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="nose_cave", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sc1 = scene(0, 5.0, {
        "pollen": [pose(0, 420, 680, 100), pose(2.5, 300, 720, 100), pose(5.0, 240, 750, 100)],
        "mast": [pose(0, 160, 810, 140), pose(5.0, 160, 810, 140)],
    }, bg="nose_cave")

    sc2 = scene(5.0, 10.0, {
        "pollen": [pose(5.0, 240, 750, 100), pose(10.0, 240, 750, 100)],
        "mast": [pose(5.0, 160, 810, 140, alert=0.0), pose(7.5, 160, 810, 140, alert=1.0), pose(10.0, 160, 810, 140, alert=1.0)],
    }, actions=[
        action("false_alarm", 5.5, 9.5, actor_id="mast", target="pollen"),
    ], bg="nose_cave")

    sc3 = scene(10.0, 15.0, {
        "nose": [pose(10.0, 220, 810, 160, sneeze=0.0), pose(12.0, 220, 810, 160, sneeze=1.0), pose(15.0, 220, 810, 160, sneeze=0.0, blush=0.5)],
        "pollen": [pose(10.0, 280, 750, 100), pose(12.5, 450, 620, 80), pose(15.0, 560, 520, 60, opacity=0.0)],
    }, bg="nose_cave")

    story = {
        "id": "allergy_story",
        "name": "17 · Câu chuyện dị ứng: dưỡng bào báo động nhầm với phấn hoa vô hại",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase I: Hạt phấn hoa pollen_puff bay vào mũi nose_cave, dưỡng bào mast_cell_alarm rung chuông false_alarm khiến mũi hắt hơi đẩy phấn hoa ra ngoài.",
        "duration": 15.0,
        "characters": [
            actor("pollen", "pollen_puff"),
            actor("mast", "mast_cell_alarm"),
            actor("nose", "nose_chibi"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.5, "character_id": "pollen", "text": "Hạt phấn hoa bay trong gió mùa xuân vô hại vô tình lạc vào khoang mũi.", "expression": "neutral"},
            {"start": 5.5, "end": 9.5, "character_id": "mast", "text": "Dưỡng bào giật mình rung chuông báo động nhầm lẫn làm kích hoạt phản ứng ngứa mũi!", "expression": "surprised"},
            {"start": 10.5, "end": 14.5, "character_id": "nose", "text": "Chiếc mũi hắt hơi một cái thật to, đẩy toàn bộ hạt phấn hoa ra ngoài an toàn!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    auto_frame(story)
    validate_story(story)
    return [story]


def recycling_sort_examples():
    """Mẫu kỹ thuật Phase K: Phân loại rác tại bãi tái chế và thùng rác locale."""
    cat = catalog()

    def actor(cid, asset, **extra):
        lbl = cat["assets"][asset].get("label") or cat["assets"][asset].get("spec", {}).get("label") or asset
        return {"id": cid, "name": lbl, "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="recycling_yard", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sc1 = scene(0, 5.0, {
        "kid": [pose(0, 200, 810, 260), pose(2.5, 200, 810, 260), pose(5.0, 200, 810, 260)],
        "bin_p": [pose(0, 320, 810, 230), pose(5.0, 320, 810, 230)],
        "bin_pap": [pose(0, 440, 810, 230), pose(5.0, 440, 810, 230)],
        "bottle": [pose(0, 120, 750, 100), pose(1.8, 320, 720, 100), pose(2.2, 320, 750, 100, opacity=0.0), pose(5.0, 320, 750, 100, opacity=0.0)],
        "news": [pose(0, 150, 750, 72), pose(3.8, 440, 720, 72), pose(4.2, 440, 750, 72, opacity=0.0), pose(5.0, 440, 750, 72, opacity=0.0)],
    }, actions=[
        action("sort", 0.5, 2.2, actor_id="bottle", target="bin_p"),
        action("sort", 2.5, 4.2, actor_id="news", target="bin_pap"),
    ], bg="recycling_yard")

    sc2 = scene(5.0, 10.0, {
        "kid": [pose(5.0, 200, 810, 260), pose(7.0, 200, 810, 260, expression="surprised"), pose(10.0, 200, 810, 260, expression="happy")],
        "bin_g": [pose(5.0, 320, 810, 230), pose(10.0, 320, 810, 230)],
        "bin_b": [pose(5.0, 440, 810, 230), pose(10.0, 440, 810, 230)],
        "peel": [pose(5.0, 120, 750, 60), pose(7.0, 280, 720, 60), pose(9.2, 440, 720, 60), pose(9.6, 440, 750, 60, opacity=0.0), pose(10.0, 440, 750, 60, opacity=0.0)],
    }, actions=[
        action("sort", 7.5, 9.6, actor_id="peel", target="bin_b"),
    ], bg="recycling_yard")

    sc3 = scene(10.0, 15.0, {
        "kid": [pose(10.0, 220, 810, 260), pose(15.0, 220, 810, 260, expression="happy")],
        "bin_res": [pose(10.0, 340, 810, 230), pose(15.0, 340, 810, 230)],
        "batt": [pose(10.0, 140, 750, 80), pose(13.0, 340, 720, 80), pose(13.5, 340, 750, 80, opacity=0.0), pose(15.0, 340, 750, 80, opacity=0.0)],
    }, actions=[
        action("sort", 11.0, 13.5, actor_id="batt", target="bin_res"),
    ], bg="recycling_yard")

    story = {
        "id": "recycling_sort",
        "name": "18 · Phân loại rác: Chibi thực hành bỏ rác đúng thùng và sửa lỗi nhầm",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase K: Chibi phân loại chai nhựa, báo cũ, vỏ chuối và pin cũ vào đúng thùng rác theo quy định bảo vệ môi trường.",
        "duration": 15.0,
        "characters": [
            actor("kid", "chibi_kid"),
            actor("bin_p", "bin_plastic"),
            actor("bin_pap", "bin_paper"),
            actor("bin_g", "bin_glass"),
            actor("bin_b", "bin_bio"),
            actor("bin_res", "bin_residual"),
            actor("bottle", "plastic_bottle"),
            actor("news", "newspaper_bundle"),
            actor("peel", "banana_peel"),
            actor("batt", "battery"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.5, "character_id": "kid", "text": "Chai nhựa bỏ vào thùng nhựa, giấy báo cũ bỏ vào thùng giấy tái chế nhé!", "expression": "happy"},
            {"start": 5.5, "end": 9.5, "character_id": "kid", "text": "Khoan đã, vỏ chuối là rác hữu cơ, không được bỏ vào thùng thuỷ tinh!", "expression": "surprised"},
            {"start": 10.5, "end": 14.5, "character_id": "kid", "text": "Pin cũ chứa hoá chất cần thu gom xử lý riêng biệt để bảo vệ môi trường!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def bottle_journey_examples():
    """Mẫu kỹ thuật Phase K: Hành trình tái sinh của chai nhựa qua xe rác và nhà máy."""
    cat = catalog()

    def actor(cid, asset, **extra):
        lbl = cat["assets"][asset].get("label") or cat["assets"][asset].get("spec", {}).get("label") or asset
        return {"id": cid, "name": lbl, "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="street", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sc1 = scene(0, 5.0, {
        "truck": [pose(0, 100, 810, 180), pose(2.5, 300, 810, 180), pose(5.0, 500, 810, 180)],
        "bottle": [pose(0, 260, 810, 42), pose(2.5, 360, 770, 42, squish=0.8), pose(3.0, 360, 770, 42, opacity=0.0), pose(5.0, 360, 770, 42, opacity=0.0)],
    }, actions=[
        action("drive", 0, 5.0, actor_id="truck"),
    ], bg="street")

    sc2 = scene(5.0, 10.0, {
        "plant": [pose(5.0, 400, 810, 240), pose(10.0, 400, 810, 240)],
        "truck": [pose(5.0, 150, 810, 180), pose(10.0, 250, 810, 180)],
        "bottle": [pose(5.0, 150, 780, 42, opacity=0.0), pose(7.5, 250, 760, 42, opacity=1.0), pose(10.0, 350, 780, 42)],
    }, actions=[
        action("drive", 5.0, 10.0, actor_id="truck"),
    ], bg="recycling_yard")

    sc3 = scene(10.0, 15.0, {
        "plant": [pose(10.0, 288, 810, 260, cutaway=1.0), pose(15.0, 288, 810, 260, cutaway=1.0)],
        "bottle": [pose(10.0, 200, 740, 42), pose(12.5, 288, 740, 42, slice=1.0), pose(15.0, 360, 740, 42, growth=1.0)],
    }, bg="recycling_yard")

    story = {
        "id": "bottle_journey",
        "name": "19 · Hành trình tái sinh: Chai nhựa qua xe rác và nhà máy biến thành sản phẩm mới",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase K: Chai nhựa được xe chở rác thu gom, đưa đến nhà máy tái chế và chuyển hoá qua băng chuyền.",
        "duration": 15.0,
        "characters": [
            actor("truck", "garbage_truck"),
            actor("bottle", "plastic_bottle"),
            actor("plant", "recycling_plant"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.5, "character_id": "truck", "text": "Xe chở rác chuyên dụng thu gom chai nhựa đã qua sử dụng trên các tuyến phố.", "expression": "neutral"},
            {"start": 5.5, "end": 9.5, "character_id": "plant", "text": "Rác tái chế được tập kết tại bãi trung chuyển của nhà máy hiện đại.", "expression": "happy"},
            {"start": 10.5, "end": 14.5, "character_id": "bottle", "text": "Qua hệ thống băng chuyền xử lý, chai nhựa được băm nhỏ và tái sinh thành đồ dùng mới!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def crossing_street_examples():
    """Mẫu kỹ thuật Phase L: Giao thông an toàn, chờ đèn tín hiệu và qua đường."""
    cat = catalog()

    def actor(cid, asset, **extra):
        lbl = cat["assets"][asset].get("label") or cat["assets"][asset].get("spec", {}).get("label") or asset
        return {"id": cid, "name": lbl, "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="street", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sc1 = scene(0, 5.0, {
        "kid": [pose(0, 140, 810, 260, outfit="hi_vis_vest"), pose(2.5, 140, 810, 260, outfit="hi_vis_vest"), pose(5.0, 140, 810, 260, outfit="hi_vis_vest")],
        "light": [pose(0, 520, 810, 135, light="red"), pose(5.0, 520, 810, 135, light="red")],
        "zebra": [pose(0, 310, 810, 42), pose(5.0, 310, 810, 42)],
        "cone": [pose(0, 210, 810, 48), pose(5.0, 210, 810, 48)],
    }, actions=[
        action("wait_signal", 0.5, 4.5, actor_id="kid", target="light", locale="jp"),
    ], bg="street")

    sc2 = scene(5.0, 10.0, {
        "kid": [pose(5.0, 140, 810, 260, outfit="hi_vis_vest"), pose(7.5, 310, 810, 260, outfit="hi_vis_vest", hand_r_y=-65, expression="happy"), pose(10.0, 390, 810, 260, outfit="hi_vis_vest", hand_r_y=-65, expression="happy")],
        "light": [pose(5.0, 520, 810, 135, light="green"), pose(10.0, 520, 810, 135, light="green")],
        "zebra": [pose(5.0, 310, 810, 42), pose(10.0, 310, 810, 42)],
        "cone": [pose(5.0, 210, 810, 48), pose(10.0, 210, 810, 48)],
    }, actions=[
        action("wait_signal", 5.0, 8.5, actor_id="kid", target="light", locale="jp"),
    ], bg="street")

    sc3 = scene(10.0, 15.0, {
        "kid": [pose(10.0, 390, 810, 260, outfit="hi_vis_vest", expression="happy"), pose(15.0, 390, 810, 260, outfit="hi_vis_vest", expression="happy")],
        "light": [pose(10.0, 520, 810, 135, light="green"), pose(15.0, 520, 810, 135, light="green")],
        "zebra": [pose(10.0, 310, 810, 42), pose(15.0, 310, 810, 42)],
        "cone": [pose(10.0, 210, 810, 48), pose(15.0, 210, 810, 48)],
    }, bg="street")

    story = {
        "id": "crossing_street",
        "name": "19 · Giao thông an toàn: Chibi quan sát đèn tín hiệu và qua đường an toàn",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase L: Chibi mặc áo phản quang, quan sát đèn tín hiệu giao thông, giơ tay qua đường theo quy tắc an toàn.",
        "duration": 15.0,
        "characters": [
            actor("kid", "chibi_kid"),
            actor("light", "traffic_light"),
            actor("zebra", "crosswalk"),
            actor("cone", "traffic_cone"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.5, "character_id": "kid", "text": "Đèn đỏ phải dừng lại quan sát hai bên đường thật cẩn thận nhé!", "expression": "neutral"},
            {"start": 5.5, "end": 9.5, "character_id": "kid", "text": "Đèn xanh đã bật, giơ tay cao xin đường và bước đều qua vạch sang đường!", "expression": "happy"},
            {"start": 10.5, "end": 14.5, "character_id": "kid", "text": "Đã qua đường an toàn rồi, luôn tuân thủ luật an toàn giao thông!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def disaster_safety_examples():
    """Mẫu kỹ thuật Phase L: Diễn tập thoát hiểm khói cháy và phòng chống thiên tai."""
    cat = catalog()

    def actor(cid, asset, **extra):
        lbl = cat["assets"][asset].get("label") or cat["assets"][asset].get("spec", {}).get("label") or asset
        return {"id": cid, "name": lbl, "asset": asset, **extra}

    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def scene(start, end, poses, actions=(), bg="interior", **extra):
        return {
            "renderer": RENDERER,
            "kind": "scene",
            "start_time": start,
            "end_time": end,
            "characters_present": list(poses),
            "poses": poses,
            "actions": list(actions),
            "background": {"preset": bg, **extra},
        }

    def action(kind, start, end, target=None, actor_id=None, **extra):
        return {"type": kind, "start": start, "end": end, **({"target": target} if target else {}), **({"actor": actor_id} if actor_id else {}), **extra}

    sc1 = scene(0, 5.0, {
        "kid": [pose(0, 140, 810, 260, sit=1.0, lean=0.6, expression="worried"), pose(2.5, 240, 810, 260, sit=1.0, lean=0.6, expression="worried"), pose(5.0, 340, 810, 260, sit=1.0, lean=0.6, expression="neutral")],
        "detector": [pose(0, 280, 640, 32, alarm=True), pose(5.0, 280, 640, 32, alarm=True)],
        "blanket": [pose(0, 480, 750, 48), pose(5.0, 480, 750, 48)],
    }, actions=[
        action("crawl_low", 0.5, 4.5, actor_id="kid", target="blanket"),
    ], bg="interior")

    sc2 = scene(5.0, 10.0, {
        "kid": [pose(5.0, 200, 810, 200, outfit="bosai_zukin", expression="worried"), pose(10.0, 200, 810, 200, outfit="bosai_zukin", expression="neutral")],
        "table": [pose(5.0, 300, 810, 360, z=2), pose(10.0, 300, 810, 360, z=2)],
        "bag": [pose(5.0, 160, 810, 50), pose(10.0, 160, 810, 50)],
        "radio_rig": [pose(5.0, 120, 810, 45), pose(10.0, 120, 810, 45)],
    }, actions=[
        action("take_cover", 5.0, 9.5, actor_id="kid", target="table"),
    ], bg="interior", quake=0.8)

    sc3 = scene(10.0, 15.0, {
        "kid": [pose(10.0, 160, 810, 260, outfit="life_vest", expression="happy"), pose(15.0, 160, 810, 260, outfit="life_vest", expression="happy")],
        "sand": [pose(10.0, 340, 810, 25, count=3), pose(15.0, 340, 810, 25, count=3)],
        "buoy": [pose(10.0, 460, 810, 55), pose(15.0, 460, 810, 55)],
        "radio_rig": [pose(10.0, 240, 810, 45), pose(15.0, 240, 810, 45)],
    }, bg="street", weather="rain", flood=0.45)

    story = {
        "id": "disaster_safety",
        "name": "20 · Phòng chống thiên tai: Thoát hiểm hỏa hoạn, động đất và chuẩn bị bão lũ",
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": "Mẫu kỹ thuật Phase L: Diễn tập bò thấp người thoát hiểm khói, chui gầm bàn chống động đất và đắp bao cát chuẩn bị ứng phó bão lũ.",
        "duration": 15.0,
        "characters": [
            actor("kid", "chibi_kid"),
            actor("detector", "smoke_detector"),
            actor("blanket", "fire_blanket"),
            actor("table", "desk"),
            actor("bag", "emergency_backpack"),
            actor("radio_rig", "radio"),
            actor("sand", "sandbag"),
            actor("buoy", "rescue_buoy"),
        ],
        "scenes": [sc1, sc2, sc3],
        "cues": [
            {"start": 0.5, "end": 4.5, "character_id": "kid", "text": "Chuông báo khói kêu vang, mau lấy khăn bịt mũi miệng và bò thấp người thoát hiểm!", "expression": "worried"},
            {"start": 5.5, "end": 9.5, "character_id": "kid", "text": "Động đất rung lắc, đội mũ bảo hộ và chui ngay xuống gầm bàn kiên cố che đầu gáy!", "expression": "neutral"},
            {"start": 10.5, "end": 14.5, "character_id": "kid", "text": "Khi bão lũ tới, xếp bao cát chắn nước ngập, mặc áo phao và bật đài radio theo dõi tin tức!", "expression": "happy"},
        ],
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]



def auto_frame(story: dict, max_zoom: float = 2.0) -> dict:
    """Đặt camera tĩnh cho mỗi cảnh chưa có camera để nhóm nhân vật nhỏ (tế bào, vi khuẩn) chiếm ~85% bề ngang.

    Khung bao lấy từ mọi keyframe (x ± 0.45·height, y − height … y) của nhân vật không gắn attach_to; mặt đất
    (đáy khung bao) nằm ở 78% chiều cao màn hình, phụ đề vẽ ngoài camera nên không bị zoom. Camera bị kẹp
    trong khung 576×1024 để không lộ mép hình nền. Cảnh không cần phóng (zoom < 1.05) giữ nguyên.
    """
    W, H = 576, 1024
    attached = {c["id"] for c in story["characters"] if c.get("attach_to")}
    for scene in story["scenes"]:
        if scene.get("camera") or scene.get("kind") == "title":
            continue
        boxes = [(k["x"] - 0.45 * k["height"], k["y"] - k["height"], k["x"] + 0.45 * k["height"], k["y"])
                 for cid, keys in scene.get("poses", {}).items() if cid not in attached for k in keys]
        if not boxes:
            continue
        x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
        x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
        zoom = min(max_zoom, 0.86 * W / max(1.0, x1 - x0), 0.62 * H / max(1.0, y1 - y0))
        if zoom < 1.05:
            continue
        cx = min(max((x0 + x1) / 2, W / 2 / zoom), W - W / 2 / zoom)
        cy = min(max(y1 - (0.78 * H - H / 2) / zoom, H / 2 / zoom), H - H / 2 / zoom)
        scene["camera"] = [{"time": scene["start_time"], "x": round(cx, 2), "y": round(cy, 2), "zoom": round(zoom, 3)}]
    return story

def sample_stories():
    """Every sample the library ships: farm stories, articulated hands, IK, fishing, sea monsters, orchard harvest, trellis, highland, vegetable cutaway, safe spraying, giant radish, handwashing, doctor visit, tooth care, nutrition, Phase I body world, Phase K recycling, and Phase L safety stories."""
    return (
        examples() + agriculture_examples() + farm_life_examples() + farm_animals_examples() +
        articulation_examples() + ik_examples() + fishing_examples() + monster_examples() +
        orchard_harvest_examples() + trellis_examples() + highland_examples() +
        vegetable_cutaway_examples() + safe_spraying_examples() + giant_radish_examples() +
        handwashing_examples() + doctor_visit_examples() + tooth_examples() + nutrition_examples() +
        scrape_battle_examples() + virus_invasion_examples() + vaccine_training_examples() +
        body_tour_examples() + gut_team_examples() + cavity_examples() + allergy_examples() +
        recycling_sort_examples() + bottle_journey_examples() +
        crossing_street_examples() + disaster_safety_examples()
    )


def showreel():
    """Silent technical reel: all samples stitched into one 5-second slot each."""
    scenes = [{"renderer": RENDERER, "kind": "title", "start_time": 0, "end_time": 1.5, "text": "Thư viện vector · Mẫu kỹ thuật", "characters_present": [], "poses": {}}]
    characters, cues = [], []
    offset = 1.5
    for source in sample_stories():
        item = copy.deepcopy(source)
        prefix = item["id"] + "-"
        ratio = 5 / item["duration"]
        for character in item["characters"]:
            character["id"] = prefix + character["id"]
            if character.get("attach_to"):
                character["attach_to"]["id"] = prefix + character["attach_to"]["id"]
            characters.append(character)
        for scene in item["scenes"]:
            scene["start_time"] = offset + scene["start_time"] * ratio
            scene["end_time"] = offset + scene["end_time"] * ratio
            scene["characters_present"] = [prefix + cid for cid in scene["characters_present"]]
            scene["poses"] = {prefix + cid: keys for cid, keys in scene["poses"].items()}
            for keys in [*scene["poses"].values(), scene.get("camera", [])]:
                for key in keys:
                    key["time"] = offset + key["time"] * ratio
            for action in scene.get("actions", []):
                action["start"] = offset + action["start"] * ratio
                action["end"] = offset + action["end"] * ratio
                if "contact" in action:
                    action["contact"] = offset + action["contact"] * ratio
                if "pop_at" in action:
                    action["pop_at"] = offset + action["pop_at"] * ratio
                if "blend_in" in action:
                    action["blend_in"] = min(action["blend_in"] * ratio, action["end"] - action["start"])
                if "helpers" in action and isinstance(action["helpers"], list):
                    action["helpers"] = [prefix + hid for hid in action["helpers"]]
                for role in ("actor", "target", "tool"):
                    if role in action:
                        action[role] = prefix + action[role]
            scenes.append(scene)
        cues.append({"start": offset, "end": offset + 5, "character_id": "narrator", "text": item["name"], "offscreen": True})
        offset += 5
    scenes.append({"renderer": RENDERER, "kind": "title", "start_time": offset, "end_time": offset + 1.5, "text": "Rig + hành động + timeline · Không phải bản remake đã duyệt", "characters_present": [], "poses": {}})
    for index, scene in enumerate(scenes):
        scene["index"] = index
    return validate_story({"id": "vector-library-showreel", "renderer": RENDERER, "fidelity": "technical-demo", "duration": offset + 1.5, "characters": characters, "scenes": scenes, "cues": cues})


def render_showcase():
    import subprocess
    try:
        from bkt_web.remake_composer import compose_animated_video
    except ImportError:
        from remake_composer import compose_animated_video
    story = showreel()
    slug = story["id"]
    audio = STATIC_DIR / f"remake_{slug}_audio.mp3"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", str(story["duration"]), "-q:a", "9", str(audio)], check=True)
    (STATIC_DIR / f"remake_{slug}_story.json").write_text(json.dumps(story, ensure_ascii=False, indent=2), encoding="utf-8")
    output = STATIC_DIR / f"remake_{slug}_preview.mp4"
    result = compose_animated_video(slug, story["characters"], story["scenes"], story["cues"], audio, output, story["duration"], log=lambda message, percent: print(f"[{percent}%] {message}", flush=True))
    if not result:
        raise RuntimeError("Xuất video mẫu chưa thành công")
    return result


def build_showcase():
    samples = sample_stories()
    for story in samples:
        validate_story(story)
    path = STATIC_DIR / "remake_vector_examples.json"
    path.write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def generate_contact_sheet(
    target: str,
    out_path: Path | str,
    growths: tuple[float, ...] = (0.2, 0.5, 1.0),
    times: tuple[float, ...] | None = None,
) -> Path:
    """Tạo bảng hình soi (contact sheet) cho một nhóm, một gói, hoặc danh sách id (§2.5)."""
    from playwright.sync_api import sync_playwright

    out_file = Path(out_path).resolve()
    out_file.parent.mkdir(parents=True, exist_ok=True)
    cat = catalog()
    sources = engine_sources()
    engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in sources)

    all_assets = cat["assets"]
    target_clean = target.strip().lower()
    if target_clean in ("all", "*"):
        asset_ids = list(all_assets.keys())
    elif target_clean in {a.get("group") for a in all_assets.values()}:
        asset_ids = [aid for aid, a in all_assets.items() if a.get("group") == target_clean]
    elif target_clean in cat.get("engine_packs", []):
        # Mỗi rig của gói khai "pack" trong catalog; không đoán theo chuỗi con của id.
        asset_ids = [aid for aid, a in all_assets.items() if a.get("pack") == target_clean]
    else:
        req = [x.strip() for x in target.split(",") if x.strip()]
        asset_ids = [aid for aid in req if aid in all_assets]

    if not asset_ids:
        raise ValueError(f"Không tìm thấy rig nào khớp với target: '{target}'")

    rows_data = []
    for aid in asset_ids:
        meta = all_assets[aid]
        # Động tác chính: rig là actor (ghép với target đầu tiên) hoặc là target (ghép với actor đầu tiên).
        primary_action, role, partner = None, None, None
        for act_id, act_spec in cat["actions"].items():
            if aid in act_spec.get("actors", []):
                primary_action, role = act_id, "actor"
                partner = next((x for x in act_spec.get("targets", []) if x != aid), None)
                break
        if not primary_action:
            for act_id, act_spec in cat["actions"].items():
                if act_id in ("grip", "release"):
                    continue
                if aid in act_spec.get("targets", []) and act_spec.get("actors"):
                    primary_action, role, partner = act_id, "target", act_spec["actors"][0]
                    break
        rows_data.append({
            "id": aid,
            "label": meta.get("label", aid),
            "group": meta.get("group", ""),
            "action": primary_action,
            "role": role,
            "partner": partner,
        })

    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #121f1d; color: #eaf3e6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; }}
  #sheet {{ width: 1440px; margin: 0 auto; background: #182b27; border-radius: 14px; padding: 24px; border: 1px solid #29463f; box-shadow: 0 12px 40px rgba(0,0,0,0.6); }}
  .title-bar {{ display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }}
  h1 {{ font-size: 24px; font-weight: 800; color: #a3e89a; letter-spacing: -0.5px; }}
  .target-badge {{ font-size: 13px; font-weight: 700; color: #172522; background: #e3bc66; padding: 4px 12px; border-radius: 20px; }}
  .subtitle {{ font-size: 13px; color: #87a79e; margin-bottom: 22px; }}
  .grid {{ display: flex; flex-direction: column; gap: 12px; }}
  .header-row {{ display: grid; grid-template-columns: 210px repeat({len(growths) + 2}, 1fr); gap: 12px; font-weight: 700; font-size: 13px; color: #d2ecd0; padding: 0 12px 10px 12px; border-bottom: 2px solid #2b4940; text-align: center; }}
  .header-row .first-col {{ text-align: left; }}
  .item-row {{ display: grid; grid-template-columns: 210px repeat({len(growths) + 2}, 1fr); gap: 12px; align-items: center; background: #0e1a18; border-radius: 10px; padding: 12px; border: 1px solid #1f3630; }}
  .info {{ display: flex; flex-direction: column; gap: 4px; padding-right: 8px; }}
  .info .label {{ font-size: 16px; font-weight: 700; color: #ffffff; }}
  .info .id {{ font-size: 12px; color: #e6be65; font-family: monospace; }}
  .info .group {{ font-size: 11px; color: #76968d; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }}
  .cell {{ display: flex; flex-direction: column; align-items: center; justify-content: center; background: #132421; border-radius: 8px; overflow: hidden; border: 1px solid #233d36; }}
  canvas {{ display: block; width: 100%; height: auto; aspect-ratio: 1 / 1.25; background: #1b3530; }}
  .caption {{ font-size: 11px; color: #8faea5; padding: 5px 0 3px 0; font-weight: 600; }}
</style>
</head>
<body>
<div id="sheet">
  <div class="title-bar">
    <h1>BẢNG HÌNH SOI VECTOR RIG (CONTACT SHEET)</h1>
    <span class="target-badge">Mục tiêu: {target} ({len(rows_data)} rig)</span>
  </div>
  <div class="subtitle">Khung lưới chuẩn 576×1024 · Growth {" / ".join(f"{g:g}" for g in growths)}, Chuyển động hoặc Động tác chính, Phóng to chi tiết (2x)</div>
  <div class="grid">
    <div class="header-row">
      <div class="first-col">Rig &amp; Nhóm</div>
      {"".join(f"<div>Growth {g:g}</div>" for g in growths)}
      <div>Chuyển động / Động tác</div>
      <div>Phóng to chi tiết (2x)</div>
    </div>
    {"".join(f'''
    <div class="item-row">
      <div class="info">
        <span class="label">{row["label"]}</span>
        <span class="id">{row["id"]}</span>
        <span class="group">{row["group"]}</span>
      </div>
      {"".join(f'<div class="cell"><canvas id="c_{row["id"]}_g{i}" width="288" height="360"></canvas><span class="caption">growth {g:g}</span></div>' for i, g in enumerate(growths))}
      <div class="cell"><canvas id="c_{row["id"]}_act" width="288" height="360"></canvas><span class="caption">{(row["action"] + (" · " + row["role"] if row["role"] else "")) if row["action"] else "đứng yên"}</span></div>
      <div class="cell"><canvas id="c_{row["id"]}_zoom" width="288" height="360"></canvas><span class="caption">zoom 2x</span></div>
    </div>
    ''' for row in rows_data)}
  </div>
</div>
<script>{engine_js}</script>
<script>
  window.cat = {json.dumps(cat)};
  window.renderAll = function(rows, growths) {{
    const mid = growths[Math.floor((growths.length - 1) / 2)] ?? 0.5;
    for (const r of rows) {{
      const aid = r.id;
      const makeStory = (g, actionType, zoom) => {{
        const yPos = zoom ? 940 : 810;
        const height = zoom ? 880 : 440;
        const still = (x, h) => [{{ time: 0, x, y: yPos, height: h, growth: g }}, {{ time: 4, x, y: yPos, height: h, growth: g }}];
        const characters = [{{ id: 'rig', asset: aid }}], poses = {{ rig: still(288, height) }}, acts = [];
        if (actionType && window.cat.actions[actionType]) {{
          // Rig đứng một bên, bạn diễn đứng bên kia; rig là actor hay target tuỳ vai trong catalog.
          poses.rig = still(r.partner ? (r.role === 'actor' ? 190 : 390) : 288, 300);
          const act = {{ type: actionType, start: 0.5, end: 3.5 }};
          if (r.partner) {{
            characters.push({{ id: 'partner', asset: r.partner }});
            poses.partner = still(r.role === 'actor' ? 390 : 190, 300);
            act.actor = r.role === 'actor' ? 'rig' : 'partner';
            if (window.cat.actions[actionType].targets.length) act.target = r.role === 'actor' ? 'partner' : 'rig';
          }} else {{
            act.actor = 'rig';
          }}
          acts.push(act);
        }}
        return {{
          id: 'sheet-' + aid, renderer: 'native-vector-v1', duration: 4,
          characters,
          scenes: [{{
            renderer: 'native-vector-v1', start_time: 0, end_time: 4,
            characters_present: Object.keys(poses),
            background: {{ preset: 'garden' }},
            poses,
            actions: acts
          }}]
        }};
      }};

      const renderTo = (cid, story, t) => {{
        const canvas = document.getElementById(cid);
        if (!canvas) return;
        const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
        renderer.render(t);
      }};

      growths.forEach((g, i) => renderTo('c_' + aid + '_g' + i, makeStory(g, null, false), 0.1));
      renderTo('c_' + aid + '_act', makeStory(mid, r.action, false), r.action ? 1.8 : 0.8);
      renderTo('c_' + aid + '_zoom', makeStory(growths[growths.length - 1], null, true), 0.1);
    }}
  }};
</script>
</body>
</html>"""

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 1200})
        page.set_content(html_content)
        page.evaluate("([rows, growths]) => window.renderAll(rows, growths)", [rows_data, list(growths)])
        sheet_el = page.locator("#sheet")
        sheet_el.screenshot(path=str(out_file), type="jpeg", quality=88)
        browser.close()

    return out_file


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--build-showcase", action="store_true")
    parser.add_argument("--render-showcase", action="store_true")
    parser.add_argument("--contact-sheet", type=str, help="Tạo bảng hình soi: <group|pack|ids>")
    parser.add_argument("--out", type=str, default="contact_sheet.jpg", help="File ảnh xuất (.jpg)")
    parser.add_argument("--growth", type=str, default="0.2,0.5,1.0", help="Danh sách growth phân tách bằng dấu phẩy")
    parser.add_argument("--times", type=str, default="", help="Danh sách thời gian phân tách bằng dấu phẩy")
    args = parser.parse_args()
    if args.render_showcase:
        build_showcase()
        print(render_showcase())
    elif args.build_showcase:
        print(build_showcase())
    elif args.contact_sheet:
        growths = tuple(float(g.strip()) for g in args.growth.split(",") if g.strip())
        times = tuple(float(t.strip()) for t in args.times.split(",")) if args.times else None
        print(generate_contact_sheet(args.contact_sheet, args.out, growths=growths, times=times))
    else:
        print(json.dumps(catalog(), ensure_ascii=False, indent=2))

