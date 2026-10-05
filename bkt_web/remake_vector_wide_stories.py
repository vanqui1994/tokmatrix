"""Story mẫu khổ ngang (widescreen B5, docs/PLAN_vector_widescreen.md §5).

Năm story viết thẳng cho khung 1820×1024 (`frame: "landscape"`, gốc toạ độ 0), không sửa story khổ dọc gốc:
`the_cure_wide`, `quiet_street_wide`, `tortoise_and_hare_wide`, `castle_life_wide`, `solar_system_tour_wide`.
Bề rộng được dùng thật: nhân vật chính đi ≥ 400 px mỗi cảnh, dàn diễn trải hết khung. Thị trường de/us/kr/jp:
lời thoại tiếng Anh, người lớn là `chibi_teacher` + trang phục (không dùng `chibi_farmer` nón lá).
Zombie là hư cấu, đi chậm (hook `shamble` ≤ 35 px/s, mọi keyframe ≤ 40 px/s) và luôn cách người ≥ 80 px.
"""
from __future__ import annotations

from bkt_web.remake_vector import RENDERER, held_pose, validate_story
from bkt_web.remake_vector_apocalypse import _action, _cue, _pose, prop_keys
from bkt_web.vector_characters.cast import cast_actor, cast_pose

FRAME = "landscape"


def _scene(start, end, poses, actions=(), bg="abandoned_street", **extra):
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


def _story(sid, name, note, scenes, characters, cues):
    story = {
        "id": sid,
        "name": name,
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "frame": FRAME,
        "note": note,
        "duration": scenes[-1]["end_time"],
        "characters": characters,
        "scenes": scenes,
        "cues": cues,
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return story


def the_cure_wide():
    """Dr. Hana đi dọc đường hầm, ba người nhiễm bệnh lê bước tới; phun thuốc lần lượt, cả nhóm cùng ra ga."""
    H = 215

    def z(cid, t, x, cured=0.0, **kw):
        state = "cured" if cured >= 1.0 else "zombie"
        p = cast_pose(cid, t, x, 830, state=state, height=H, **kw)
        p.update(zombie=0.0, cured=1.0) if cured >= 1.0 else p.update(zombie=1.0, cured=cured)
        return p

    # Cảnh 1 (12 s): Hana đi 60 → 480; ba người lê bước sang trái đúng giới hạn 35 px/s × 12 s = 420 px.
    sc1 = _scene(0.0, 12.0, {
        "dr_hana": [cast_pose("dr_hana", 0.0, 60, 830), cast_pose("dr_hana", 10.0, 480, 830), cast_pose("dr_hana", 12.0, 480, 830)],
        "dr_hana_cure_sprayer": prop_keys("dr_hana", [0.0, 12.0]),
        "nora": [z("nora", 0.0, 1480), z("nora", 12.0, 1480)],
        "zombie_walker_a": [z("zombie_walker_a", 0.0, 1620), z("zombie_walker_a", 12.0, 1620)],
        "zombie_walker_b": [z("zombie_walker_b", 0.0, 1760), z("zombie_walker_b", 12.0, 1760)],
    }, actions=[
        _action("shamble", 0.0, 12.0, actor="nora", direction="left", distance=420),
        _action("shamble", 0.0, 12.0, actor="zombie_walker_a", direction="left", distance=420),
        _action("shamble", 0.0, 12.0, actor="zombie_walker_b", direction="left", distance=420),
    ], bg="subway_tunnel")

    # Cảnh 2 (10 s): Hana tiến 480 → 900 rồi phun lần lượt (cách 160 / 300 / 440 px).
    sc2 = _scene(12.0, 22.0, {
        "dr_hana": [cast_pose("dr_hana", 12.0, 480, 830), cast_pose("dr_hana", 15.5, 900, 830), cast_pose("dr_hana", 22.0, 900, 830, expression="happy")],
        "dr_hana_cure_sprayer": prop_keys("dr_hana", [12.0, 22.0]),
        "nora": [z("nora", 12.0, 1060), z("nora", 16.0, 1060), z("nora", 17.5, 1060, 1.0, expression="happy"), z("nora", 22.0, 1060, 1.0, expression="happy")],
        "zombie_walker_a": [z("zombie_walker_a", 12.0, 1200), z("zombie_walker_a", 17.5, 1200), z("zombie_walker_a", 19.0, 1200, 1.0, expression="happy"), z("zombie_walker_a", 22.0, 1200, 1.0, expression="happy")],
        "zombie_walker_b": [z("zombie_walker_b", 12.0, 1340), z("zombie_walker_b", 19.0, 1340), z("zombie_walker_b", 20.5, 1340, 1.0, expression="happy"), z("zombie_walker_b", 22.0, 1340, 1.0, expression="happy")],
    }, actions=[
        _action("cure_spray", 16.0, 17.5, actor="dr_hana", target="nora"),
        _action("cure_spray", 17.5, 19.0, actor="dr_hana", target="zombie_walker_a"),
        _action("cure_spray", 19.0, 20.5, actor="dr_hana", target="zombie_walker_b"),
    ], bg="subway_tunnel")

    # Cảnh 3 (10 s): cả bốn cùng đi sang phải ra ga, mỗi người ≥ 400 px, giữ khoảng cách 140 px.
    sc3 = _scene(22.0, 32.0, {
        "dr_hana": [cast_pose("dr_hana", 22.0, 900, 830, expression="happy"), cast_pose("dr_hana", 30.0, 1310, 830, expression="happy"), cast_pose("dr_hana", 32.0, 1310, 830, expression="happy")],
        "dr_hana_cure_sprayer": prop_keys("dr_hana", [22.0, 32.0]),
        "nora": [z("nora", 22.0, 1060, 1.0, expression="happy"), z("nora", 30.0, 1460, 1.0, expression="happy"), z("nora", 32.0, 1460, 1.0, expression="happy")],
        "zombie_walker_a": [z("zombie_walker_a", 22.0, 1200, 1.0, expression="happy"), z("zombie_walker_a", 30.0, 1600, 1.0, expression="happy"), z("zombie_walker_a", 32.0, 1600, 1.0, expression="happy")],
        "zombie_walker_b": [z("zombie_walker_b", 22.0, 1340, 1.0, expression="happy"), z("zombie_walker_b", 30.0, 1740, 1.0, expression="happy"), z("zombie_walker_b", 32.0, 1740, 1.0, expression="happy")],
    }, actions=[
        _action("emote", 29.0, 31.5, actor="nora", emote="heart"),
        _action("emote", 29.5, 31.5, actor="dr_hana", emote="heart"),
    ], bg="subway_tunnel")

    return _story(
        "the_cure_wide",
        "W1 · The Cure (widescreen)",
        "Widescreen sample (zombies are fiction): Dr. Hana walks the long subway tunnel, cures three dazed walkers one by one, and they all head for the exit together.",
        [sc1, sc2, sc3],
        [*cast_actor("dr_hana"), *cast_actor("nora", state="zombie"),
         *cast_actor("zombie_walker_a", state="zombie"), *cast_actor("zombie_walker_b", state="zombie")],
        [
            _cue(0.5, 11.5, "dr_hana", "Down the long subway tunnel, Dr. Hana carries her new cure. Three dazed walkers drift slowly towards her.", "neutral"),
            _cue(12.5, 21.5, "dr_hana", "One gentle sparkling mist at a time. Nora, then her two friends, wake up as themselves again."),
            _cue(22.5, 31.5, "nora", "Together we walk out into the daylight. Science and kindness win!"),
        ],
    )


def quiet_street_wide():
    """Mika và Leo núp sau xe buýt, ném lon thật xa để hai người nhiễm bệnh đi theo tiếng động, rồi lặng lẽ rời đi."""
    walker = lambda cid, t, x, **kw: cast_pose(cid, t, x, 830, state="zombie", **kw)  # noqa: E731
    sc1 = _scene(0.0, 12.0, {
        "bus": [_pose(0.0, 640, 840, 240, decay=0.6), _pose(12.0, 640, 840, 240, decay=0.6)],
        "mika": [cast_pose("mika", 0.0, 60, 830, z=-1), cast_pose("mika", 8.0, 540, 830, z=-1), cast_pose("mika", 12.0, 540, 845, z=-1, expression="worried")],
        "leo": [cast_pose("leo", 0.0, -80, 830, z=-1), cast_pose("leo", 9.0, 720, 830, z=-1), cast_pose("leo", 12.0, 720, 845, z=-1, expression="worried")],
        "leo_flashlight": prop_keys("leo", [0.0, 12.0]),
        "zombie_walker_a": [walker("zombie_walker_a", 0.0, 1600), walker("zombie_walker_a", 12.0, 1600)],
        "zombie_walker_b": [walker("zombie_walker_b", 0.0, 1780), walker("zombie_walker_b", 12.0, 1780)],
    }, actions=[
        _action("shamble", 0.0, 12.0, actor="zombie_walker_a", direction="left", distance=420),
        _action("shamble", 0.0, 12.0, actor="zombie_walker_b", direction="left", distance=420),
    ], bg="abandoned_street", weather="fog")

    # Cảnh 2 (12 s): Leo ném lon bay vòng cung xa 900 px; hai người quay lại đi theo tiếng động 420 px.
    sc2 = _scene(12.0, 24.0, {
        "bus": [_pose(12.0, 640, 840, 240, decay=0.6), _pose(24.0, 640, 840, 240, decay=0.6)],
        "mika": [cast_pose("mika", 12.0, 540, 845, z=-1, expression="worried"), cast_pose("mika", 24.0, 540, 845, z=-1)],
        "leo": [cast_pose("leo", 12.0, 720, 845, z=-1), cast_pose("leo", 12.6, 720, 830, z=-1, hand_r_x=20, hand_r_y=-70),
                cast_pose("leo", 13.2, 720, 845, z=-1), cast_pose("leo", 24.0, 720, 845, z=-1, expression="happy")],
        "leo_flashlight": prop_keys("leo", [12.0, 24.0]),
        "can": [_pose(12.0, 750, 700, 110, opacity=0.0), _pose(12.6, 750, 700, 110, opacity=1.0), _pose(13.8, 1180, 330, 110, rotation=300, opacity=1.0),
                _pose(15.0, 1700, 845, 110, rotation=600, opacity=1.0), _pose(24.0, 1700, 845, 110, rotation=600, opacity=1.0)],
        "zombie_walker_a": [walker("zombie_walker_a", 12.0, 1180), walker("zombie_walker_a", 24.0, 1180)],
        "zombie_walker_b": [walker("zombie_walker_b", 12.0, 1360), walker("zombie_walker_b", 24.0, 1360)],
    }, actions=[
        _action("distract", 15.0, 16.0, actor="leo", target="can"),
        _action("shamble", 16.0, 24.0, actor="zombie_walker_a", direction="right", distance=280),
        _action("shamble", 16.0, 24.0, actor="zombie_walker_b", direction="right", distance=200),
    ], bg="abandoned_street", weather="fog")

    # Cảnh 3 (12 s): hai bạn đứng dậy, đi ngược về bên trái 460 px; hai người nhiễm bệnh đứng quanh cái lon.
    sc3 = _scene(24.0, 36.0, {
        "bus": [_pose(24.0, 640, 840, 240, decay=0.6), _pose(36.0, 640, 840, 240, decay=0.6)],
        "mika": [cast_pose("mika", 24.0, 540, 845, z=-1), cast_pose("mika", 25.0, 540, 830, z=-1), cast_pose("mika", 34.0, 80, 830, z=-1, expression="happy"), cast_pose("mika", 36.0, 80, 830, z=-1, expression="happy")],
        "leo": [cast_pose("leo", 24.0, 720, 845, z=-1), cast_pose("leo", 25.0, 720, 830, z=-1), cast_pose("leo", 34.0, 240, 830, z=-1, expression="happy"), cast_pose("leo", 36.0, 240, 830, z=-1, expression="happy")],
        "leo_flashlight": prop_keys("leo", [24.0, 36.0]),
        "can": [_pose(24.0, 1700, 845, 110, rotation=600), _pose(36.0, 1700, 845, 110, rotation=600)],
        "zombie_walker_a": [walker("zombie_walker_a", 24.0, 1460), walker("zombie_walker_a", 36.0, 1460)],
        "zombie_walker_b": [walker("zombie_walker_b", 24.0, 1560), walker("zombie_walker_b", 36.0, 1560)],
    }, actions=[
        _action("shamble", 24.0, 36.0, actor="zombie_walker_b", direction="right", distance=40),
        _action("emote", 31.0, 35.5, actor="leo", emote="heart"),
    ], bg="abandoned_street", weather="fog")

    return _story(
        "quiet_street_wide",
        "W2 · Quiet Street (widescreen)",
        "Widescreen sample (zombies are fiction): Mika and Leo hide behind an old bus, throw an empty can far down the long street to draw two walkers away, and slip back the way they came.",
        [sc1, sc2, sc3],
        [*cast_actor("mika"), *cast_actor("leo"), *cast_actor("zombie_walker_a", state="zombie"), *cast_actor("zombie_walker_b", state="zombie"),
         {"id": "bus", "name": "Old bus", "asset": "city_bus"}, {"id": "can", "name": "Empty can", "asset": "can"}],
        [
            _cue(0.5, 11.5, "mika", "Two dazed walkers drift down the long empty street. Mika and Leo crouch low behind an old bus.", "neutral"),
            _cue(12.5, 23.5, "leo", "Leo throws an empty can far down the street. The clatter draws both walkers away."),
            _cue(24.5, 35.5, "mika", "Stay quiet, stay together, always keep a way out. The team slips away safely."),
        ],
    )


def tortoise_and_hare_wide():
    """Rùa và Thỏ trên đường đua dài 1820 px: thỏ phóng xa rồi ngủ, rùa đi đều và về đích trước."""
    def pose(t, x, h, **extra):
        return {"time": t, "x": x, "y": 810, "height": h, **extra}

    tree = lambda t: pose(t, 1060, 300, z=0)  # noqa: E731
    flag = lambda t: pose(t, 1700, 230, z=0)  # noqa: E731
    sc1 = _scene(0.0, 10.0, {
        "hare": [pose(0.0, 80, 130, walk=1, z=2), pose(4.0, 980, 130, walk=1, z=2), pose(10.0, 980, 130, walk=0, z=2)],
        "tortoise": [pose(0.0, 60, 140, walk=1, z=3), pose(10.0, 460, 140, walk=1, z=3)],
        "tree": [tree(0.0), tree(10.0)],
        "flag": [flag(0.0), flag(10.0)],
    }, actions=[_action("emote", 5.0, 9.5, actor="hare", emote="zzz")], bg="alpine_meadow")

    sc2 = _scene(10.0, 20.0, {
        "hare": [pose(10.0, 980, 130, walk=0, z=2), pose(20.0, 980, 130, walk=0, z=2)],
        "tortoise": [pose(10.0, 460, 140, walk=1, z=3), pose(20.0, 880, 140, walk=1, z=3)],
        "tree": [tree(10.0), tree(20.0)],
        "flag": [flag(10.0), flag(20.0)],
    }, actions=[_action("emote", 10.5, 19.5, actor="hare", emote="zzz")], bg="alpine_meadow")

    # Cảnh 3: rùa vượt qua thỏ đang ngủ, đi 880 → 1640 (đích ở 1700); thỏ tỉnh dậy chạy theo nhưng dừng sau rùa.
    sc3 = _scene(20.0, 32.0, {
        "hare": [pose(20.0, 980, 130, walk=0, z=2), pose(27.0, 980, 130, walk=0, z=2), pose(29.5, 1460, 130, walk=1, z=2), pose(32.0, 1460, 130, walk=0, z=2)],
        "tortoise": [pose(20.0, 880, 140, walk=1, z=3), pose(29.0, 1640, 140, walk=1, z=3), pose(32.0, 1640, 140, walk=0, z=3)],
        "tree": [tree(20.0), tree(32.0)],
        "flag": [flag(20.0), flag(32.0)],
    }, actions=[
        _action("emote", 20.5, 26.5, actor="hare", emote="zzz"),
        _action("emote", 29.5, 31.8, actor="tortoise", emote="heart"),
        _action("emote", 30.0, 31.8, actor="hare", emote="heart"),
    ], bg="alpine_meadow")

    return _story(
        "tortoise_and_hare_wide",
        "W3 · The Tortoise and the Hare (widescreen)",
        "Widescreen sample (Aesop's fable): on a long meadow track the hare dashes ahead and naps under a tree, while the tortoise keeps walking and reaches the finish first.",
        [sc1, sc2, sc3],
        [{"id": "hare", "name": "Hare", "asset": "rabbit"}, {"id": "tortoise", "name": "Tortoise", "asset": "tortoise"},
         {"id": "tree", "name": "Shady tree", "asset": "persimmon_tree"}, {"id": "flag", "name": "Finish banner", "asset": "banner_plain"}],
        [
            _cue(0.5, 9.5, "hare", "The hare races far ahead, then lies down for a nap in the shade.", "happy"),
            _cue(10.5, 19.5, "tortoise", "Slow and steady, step after step, the tortoise keeps going.", "neutral"),
            _cue(20.5, 31.5, "tortoise", "The tortoise crosses the finish line first. The two friends cheer together!", "happy"),
        ],
    )


def castle_life_wide():
    """Cầu treo hạ xuống, xe ngựa đi ngang khung vào sân thành; hai bạn nhỏ tập khiên gỗ, rồi cả nhóm đi chợ."""
    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    p_shield = held_pose("wooden_shield", 210, 0, anchor="grip")
    p_sword = held_pose("toy_sword", 160, -20, anchor="grip")
    castle = lambda t, o=1.0: pose(t, 1180, 810, 210, open=o)  # noqa: E731
    villager = dict(outfit="medieval_villager", expression="happy")
    knight = dict(outfit="knight", expression="happy")

    # Cảnh 1 (10 s): cầu treo hạ; xe ngựa đi từ ngoài khung trái 60 → 600 rồi 1000 (≥ 400 px), người đánh xe ngồi trên xe.
    sc1 = _scene(0.0, 10.0, {
        "castle": [castle(0.0, 0.03), castle(3.0, 1.0), castle(10.0)],
        "cart": [pose(0.0, -120, 900, 170), pose(3.0, -120, 900, 170), pose(10.0, 940, 900, 170)],
        "horse": [pose(0.0, -20, 900, 170), pose(3.0, -20, 900, 170), pose(10.0, 1040, 900, 170)],
        "driver": [pose(0.0, -120, 900, 180, **villager), pose(10.0, 940, 900, 180, **villager)],
    }, actions=[
        _action("ride", 0.0, 10.0, actor="driver", target="cart", seat="seat_1"),
        _action("emote", 6.0, 9.5, actor="driver", emote="music"),
    ], bg="castle_yard")

    # Cảnh 2 (10 s): hai bạn đi từ hai mép khung vào giữa (≥ 400 px mỗi người) rồi tập đỡ khiên.
    sc2 = _scene(10.0, 20.0, {
        "banner": [pose(10.0, 910, 760, 220), pose(20.0, 910, 760, 220)],
        "knight_trainee": [pose(10.0, 260, 810, 230, **knight), pose(14.0, 760, 810, 230, **knight),
                           pose(15.0, 760, 810, 230, **knight, hand_l_x=30, hand_l_y=-40), pose(16.0, 760, 810, 230, **knight, hand_l_x=26, hand_l_y=-30),
                           pose(17.0, 760, 810, 230, **knight, hand_l_x=30, hand_l_y=-40), pose(20.0, 760, 810, 230, **knight, hand_l_x=30, hand_l_y=-40)],
        "shield": [pose(10.0, p_shield["x"], p_shield["y"], 210, rotation=p_shield["rotation"]), pose(20.0, p_shield["x"], p_shield["y"], 210, rotation=p_shield["rotation"])],
        "partner": [pose(10.0, 1520, 810, 230, **villager, flip=True), pose(14.0, 1060, 810, 230, **villager, flip=True),
                    pose(15.0, 1060, 810, 230, **villager, flip=True, hand_r_x=20, hand_r_y=-62), pose(16.0, 1060, 810, 230, **villager, flip=True, hand_r_x=30, hand_r_y=-34),
                    pose(17.0, 1060, 810, 230, **villager, flip=True, hand_r_x=20, hand_r_y=-62), pose(20.0, 1060, 810, 230, **villager, flip=True, hand_r_x=30, hand_r_y=-34)],
        "sword": [pose(10.0, p_sword["x"], p_sword["y"], 160, rotation=p_sword["rotation"]), pose(20.0, p_sword["x"], p_sword["y"], 160, rotation=p_sword["rotation"])],
    }, actions=[
        _action("emote", 11.0, 13.5, actor="knight_trainee", emote="music"),
        _action("emote", 16.0, 19.5, actor="partner", emote="heart"),
    ], bg="castle_yard")

    # Cảnh 3 (10 s): làng thời trung cổ, ba người đi cùng nhau sang phải tới quầy chợ (≥ 400 px).
    sc3 = _scene(20.0, 30.0, {
        "stall": [pose(20.0, 1500, 810, 240), pose(30.0, 1500, 810, 240)],
        "knight_trainee": [pose(20.0, 120, 810, 230, **knight), pose(28.0, 820, 810, 230, **knight), pose(30.0, 820, 810, 230, **knight)],
        "shield": [pose(20.0, p_shield["x"], p_shield["y"], 210, rotation=p_shield["rotation"]), pose(30.0, p_shield["x"], p_shield["y"], 210, rotation=p_shield["rotation"])],
        "partner": [pose(20.0, 300, 810, 230, **villager), pose(28.0, 1000, 810, 230, **villager), pose(30.0, 1000, 810, 230, **villager)],
        "sword": [pose(20.0, p_sword["x"], p_sword["y"], 160, rotation=p_sword["rotation"]), pose(30.0, p_sword["x"], p_sword["y"], 160, rotation=p_sword["rotation"])],
        "driver": [pose(20.0, 500, 810, 240, **villager), pose(28.0, 1200, 810, 240, **villager), pose(30.0, 1200, 810, 240, **villager)],
    }, actions=[_action("emote", 28.0, 29.8, actor="driver", emote="heart")], bg="medieval_village")

    return _story(
        "castle_life_wide",
        "W4 · Castle Life (widescreen)",
        "Widescreen sample (medieval, no fighting): the drawbridge comes down, a horse cart rolls across the whole yard, two friends practise with a wooden shield, then everyone walks to the village market.",
        [sc1, sc2, sc3],
        [
            {"id": "castle", "name": "Castle", "asset": "castle"},
            {"id": "cart", "name": "Horse cart", "asset": "horse_cart"},
            {"id": "horse", "name": "Horse", "asset": "horse"},
            {"id": "driver", "name": "Cart driver", "asset": "chibi_teacher"},
            {"id": "banner", "name": "Plain banner", "asset": "banner_plain"},
            {"id": "knight_trainee", "name": "Young knight", "asset": "chibi_boy"},
            {"id": "shield", "name": "Wooden shield", "asset": "wooden_shield", "attach_to": {"id": "knight_trainee", "anchor": "hand_l"}},
            {"id": "partner", "name": "Friend", "asset": "chibi_kid"},
            {"id": "sword", "name": "Toy sword", "asset": "toy_sword", "attach_to": {"id": "partner", "anchor": "hand_r"}},
            {"id": "stall", "name": "Market stall", "asset": "market_stall"},
        ],
        [
            _cue(0.5, 9.5, "driver", "The drawbridge comes down and a horse cart full of vegetables rolls into the castle yard.", "happy"),
            _cue(10.5, 19.5, "knight_trainee", "Under the banner, two friends practise holding a wooden shield, safely and with a smile.", "happy"),
            _cue(20.5, 29.5, "partner", "Training done! Everyone walks down to the village market together.", "happy"),
        ],
    )


def solar_system_tour_wide():
    """Tên lửa bay ngang khung rộng qua tám hành tinh, đúng thứ tự từ Sao Thuỷ tới Sao Hải Vương."""
    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    def planets(t0, t1, rows):
        return {pid: [pose(t0, x, y, h, variant=v), pose(t1, x, y, h, variant=v)] for pid, x, y, h, v in rows}

    # Cảnh 1 (10 s): bốn hành tinh đất đá trải 300–1500 px; tên lửa bay −80 → 1900 (≈ 2000 px).
    sc1 = _scene(0.0, 10.0, {
        "ship": [pose(0.0, -80, 380, 120, rotation=90), pose(10.0, 1900, 380, 120, rotation=90)],
        "sun": [pose(0.0, 90, 600, 260), pose(10.0, 90, 600, 260)],
        **planets(0.0, 10.0, [("p1", 420, 560, 90, "mercury"), ("p2", 760, 545, 120, "venus"),
                               ("p3", 1120, 550, 130, "earth"), ("p4", 1480, 540, 110, "mars")]),
    }, actions=[_action("fly", 0.5, 9.5, actor="ship")], bg="space_orbit")

    # Cảnh 2 (10 s): bốn hành tinh khí khổng lồ, cỡ thật lớn hơn, trải hết bề rộng.
    sc2 = _scene(10.0, 20.0, {
        "ship": [pose(10.0, -80, 330, 120, rotation=90), pose(20.0, 1900, 330, 120, rotation=90)],
        **planets(10.0, 20.0, [("p5", 280, 580, 220, "jupiter"), ("p6", 700, 570, 200, "saturn"),
                                ("p7", 1130, 560, 150, "uranus"), ("p8", 1520, 560, 140, "neptune")]),
    }, actions=[_action("fly", 10.5, 19.5, actor="ship")], bg="space_orbit")

    return _story(
        "solar_system_tour_wide",
        "W5 · Solar System Tour (widescreen)",
        "Widescreen sample: a rocket flies across the wide frame past all eight planets in order, from Mercury to Neptune.",
        [sc1, sc2],
        [{"id": "ship", "name": "Rocket", "asset": "rocket"}, {"id": "sun", "name": "Sun", "asset": "sun"},
         *({"id": f"p{i}", "name": "Planet", "asset": "planet"} for i in range(1, 9))],
        [
            {"start": 0.5, "end": 9.5, "character_id": "ship", "text": "Leaving the Sun behind, the rocket passes the rocky planets: Mercury, Venus, Earth and Mars.", "offscreen": True},
            {"start": 10.5, "end": 19.5, "character_id": "ship", "text": "Further out wait the giants: Jupiter, Saturn, Uranus and Neptune.", "offscreen": True},
        ],
    )


def wide_stories():
    """Năm story mẫu khổ ngang (B5)."""
    return [the_cure_wide(), quiet_street_wide(), tortoise_and_hare_wide(), castle_life_wide(), solar_system_tour_wide()]
