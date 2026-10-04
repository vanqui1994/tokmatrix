"""Story mẫu Giai đoạn V (tận thế, sinh tồn, zombie, thành phố cũ) dựng từ dàn nhân vật tái sử dụng.

Mọi nhân vật dàn diễn đi qua `cast_actor`/`cast_pose` (bkt_web/vector_characters/cast.py), đạo cụ đặc
trưng lấy cỡ và tay cầm từ `remake_vector_cast.json` qua `prop_keys`. Bố cục theo bài học review:
- chibi cỡ 210–240 rộng ~0,6·height ⇒ đặt cách nhau ≥ 140 px, không chồng;
- mỗi cảnh có người di chuyển; đạo cụ cầm tay ≥ 60 px trên hình;
- zombie luôn cách người ≥ 80 px, đi ≤ 40 px/s (hook `shamble` tự dời, pose đứng yên);
- không dùng hook `crank_radio` với radio gắn tay: hook chạy trước bước gắn nên IK kéo tay ra ngoài khung
  (cây gậy vàng ở bản đầu) — tay quay và `crank` được đặt bằng keyframe.
"""
from __future__ import annotations

from bkt_web.remake_vector import RENDERER, held_pose, validate_story
from bkt_web.vector_characters.cast import cast_actor, cast_pose, get_cast_data


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


def _action(kind, start, end, actor=None, target=None, **extra):
    return {"type": kind, "start": start, "end": end, **({"actor": actor} if actor else {}), **({"target": target} if target else {}), **extra}


def _pose(t, x, y, h, **extra):
    return {"time": t, "x": x, "y": y, "height": h, **extra}


def prop_keys(cid, times, actor_id=None, rotation=None, **extra):
    """Keyframe cho đạo cụ đặc trưng của một nhân vật dàn diễn: cỡ và góc lấy từ remake_vector_cast.json."""
    sp = get_cast_data()[cid]["signature_props"][0]
    rot = sp.get("rotation", 0) if rotation is None else rotation
    hp = held_pose(sp["asset"], sp["height"], rot, anchor=sp.get("anchor", "grip"))
    return [{"time": t, "x": hp["x"], "y": hp["y"], "height": sp["height"], "rotation": rot, "opacity": 1.0, **extra} for t in times]


def _story(sid, name, note, scenes, characters, cues):
    story = {
        "id": sid,
        "name": name,
        "renderer": RENDERER,
        "fidelity": "technical-demo",
        "note": note,
        "duration": scenes[-1]["end_time"],
        "characters": characters,
        "scenes": scenes,
        "cues": cues,
    }
    for index, item in enumerate(story["scenes"]):
        item["index"] = index
    validate_story(story)
    return [story]


def _cue(start, end, cid, text, expression="happy"):
    return {"start": start, "end": end, "character_id": cid, "text": text, "expression": expression}


def last_city_morning_examples():
    """Sân thượng: Pip quay radio, Mika đi tới nghe tín hiệu bằng bộ đàm, cả nhóm lên đường."""
    def crank(t0, t1, y=-34):
        # Tay phải Pip quay vòng quanh tay quay của radio (radio cầm tay trái).
        return [cast_pose("pip", round(t0 + i * 0.25, 2), 110, 820, expression="happy",
                          hand_r_x=6 + (6 if i % 2 else -2), hand_r_y=y + (-6 if i % 2 else 4)) for i in range(int((t1 - t0) / 0.25) + 1)]

    sc1 = _scene(0.0, 5.0, {
        "pip": [cast_pose("pip", 0.0, 110, 820, expression="neutral")] + crank(0.5, 5.0),
        "pip_hand_crank_radio": prop_keys("pip", [0.0, 5.0], crank=0.0, powered=1) [:1]
        + [dict(prop_keys("pip", [round(0.5 + i * 0.5, 2)])[0], crank=(i % 2) * 0.5, powered=1) for i in range(10)],
        "biscuit": [cast_pose("biscuit", 0.0, 255, 830, height=105), cast_pose("biscuit", 5.0, 255, 830, height=105)],
        "tray": [_pose(0.0, 490, 840, 160), _pose(5.0, 490, 840, 160)],
        "mika": [cast_pose("mika", 0.0, 660, 820), cast_pose("mika", 3.5, 395, 820), cast_pose("mika", 5.0, 395, 820)],
        "mika_walkie_talkie": prop_keys("mika", [0.0, 5.0]),
    }, bg="rooftop_garden", weather="clear")

    sc2 = _scene(5.0, 10.0, {
        "pip": [cast_pose("pip", 5.0, 110, 820, expression="surprised"), cast_pose("pip", 10.0, 110, 820, expression="happy")],
        "pip_hand_crank_radio": prop_keys("pip", [5.0, 10.0], crank=0.0, powered=1),
        "biscuit": [cast_pose("biscuit", 5.0, 255, 830, height=105), cast_pose("biscuit", 10.0, 255, 830, height=105)],
        # Mika đưa bộ đàm lên tai; Leo đi từ phải vào.
        "mika": [cast_pose("mika", 5.0, 395, 820), cast_pose("mika", 6.0, 395, 820, hand_r_x=14, hand_r_y=-62),
                 cast_pose("mika", 10.0, 395, 820, hand_r_x=14, hand_r_y=-62)],
        "mika_walkie_talkie": prop_keys("mika", [5.0, 10.0]),
        "leo": [cast_pose("leo", 5.0, 680, 820), cast_pose("leo", 8.5, 530, 820), cast_pose("leo", 10.0, 530, 820)],
        "leo_flashlight": prop_keys("leo", [5.0, 10.0]),
    }, actions=[
        _action("emote", 6.0, 8.5, actor="pip", emote="exclamation"),
        _action("emote", 6.5, 9.5, actor="biscuit", emote="heart"),
    ], bg="rooftop_garden", weather="clear")

    # Cảnh 3: cả nhóm đi sang phải rời sân thượng (mỗi người ≥ 150 px).
    sc3 = _scene(10.0, 15.0, {
        "pip": [cast_pose("pip", 10.0, 110, 820), cast_pose("pip", 15.0, 330, 820, expression="happy")],
        "pip_hand_crank_radio": prop_keys("pip", [10.0, 15.0]),
        "biscuit": [cast_pose("biscuit", 10.0, 255, 830, height=105), cast_pose("biscuit", 15.0, 470, 830, height=105)],
        "mika": [cast_pose("mika", 10.0, 395, 820), cast_pose("mika", 15.0, 620, 820, expression="happy")],
        "mika_walkie_talkie": prop_keys("mika", [10.0, 15.0]),
        "leo": [cast_pose("leo", 10.0, 530, 820), cast_pose("leo", 15.0, 760, 820, expression="happy")],
        "leo_flashlight": prop_keys("leo", [10.0, 15.0]),
    }, actions=[
        _action("emote", 10.5, 13.0, actor="mika", emote="heart"),
    ], bg="rooftop_garden", weather="clear")

    return _story(
        "last_city_morning",
        "60 · Last City Morning: Sunrise on the Rooftop Garden",
        "Phase V survival story (zombies are fiction): Pip powers the hand-crank radio, Mika hears the safe camp signal on her walkie-talkie, and the team sets out.",
        [sc1, sc2, sc3],
        [*cast_actor("pip"), *cast_actor("biscuit"), *cast_actor("mika"), *cast_actor("leo"),
         {"id": "tray", "name": "Seed tray", "asset": "seed_tray"}],
        [
            _cue(0.5, 4.5, "pip", "The morning sun rises over the rooftop garden as Pip turns the hand-crank radio to check for signals."),
            _cue(5.5, 9.5, "mika", "A faint broadcast crackles through the walkie-talkie: the safe camp is in the southern sector!"),
            _cue(10.5, 14.5, "leo", "Rule of three: three days without water, three weeks without food. Water first, then we move together."),
        ],
    )


def water_first_examples():
    """Hứng nước mưa, lọc qua vải, đun sôi, rồi mới uống (độ trong của thùng nước tăng dần)."""
    sc1 = _scene(0.0, 5.0, {
        "barrel": [_pose(0.0, 110, 830, 220, clarity=0.0), _pose(5.0, 110, 830, 220, clarity=0.2)],
        "filter": [_pose(0.0, 300, 840, 150), _pose(5.0, 300, 840, 150)],
        "mika": [cast_pose("mika", 0.0, 650, 830, state="rain"), cast_pose("mika", 3.5, 460, 830, state="rain", hand_r_x=-24, hand_r_y=-30),
                 cast_pose("mika", 5.0, 460, 830, state="rain", hand_r_x=-24, hand_r_y=-30)],
    }, bg="abandoned_street", weather="rain")

    sc2 = _scene(5.0, 10.0, {
        "barrel": [_pose(5.0, 90, 830, 220, clarity=0.3), _pose(10.0, 90, 830, 220, clarity=0.6)],
        "filter": [_pose(5.0, 215, 840, 150), _pose(10.0, 215, 840, 150)],
        "pot": [_pose(5.0, 340, 840, 170, boil=0.0), _pose(7.0, 340, 840, 170, boil=0.4), _pose(9.0, 340, 840, 170, boil=1.0), _pose(10.0, 340, 840, 170, boil=1.0)],
        "fire": [_pose(5.0, 340, 848, 150, lit=1.0), _pose(10.0, 340, 848, 150, lit=1.0)],
        "leo": [cast_pose("leo", 5.0, 660, 830), cast_pose("leo", 7.5, 490, 830, hand_r_x=-22, hand_r_y=-26), cast_pose("leo", 10.0, 490, 830, hand_r_x=-22, hand_r_y=-26)],
        "leo_flashlight": prop_keys("leo", [5.0, 10.0]),
    }, actions=[
        _action("purify_water", 5.5, 9.5, actor="filter", target="pot"),
    ], bg="abandoned_street", weather="clear")

    sc3 = _scene(10.0, 15.0, {
        "barrel": [_pose(10.0, 100, 830, 220, clarity=0.6), _pose(12.0, 100, 830, 220, clarity=1.0), _pose(15.0, 100, 830, 220, clarity=1.0)],
        "mika": [cast_pose("mika", 10.0, 270, 830), cast_pose("mika", 15.0, 270, 830, expression="happy")],
        "pip": [cast_pose("pip", 10.0, 680, 830), cast_pose("pip", 13.0, 450, 830, expression="happy"), cast_pose("pip", 15.0, 450, 830, expression="happy")],
        "bottle": [_pose(10.0, 0, 0, 1, opacity=1.0), _pose(15.0, 0, 0, 1, opacity=1.0)],
    }, actions=[
        _action("emote", 12.5, 14.8, actor="mika", emote="heart"),
        _action("emote", 13.2, 14.8, actor="pip", emote="heart"),
    ], bg="abandoned_street", weather="clear")
    bottle_pose = held_pose("water_filter_bottle", 150, 0)
    for k in sc3["poses"]["bottle"]:
        k.update(x=bottle_pose["x"], y=bottle_pose["y"], height=150, rotation=0)

    return _story(
        "water_first",
        "61 · Clean Water First: Filtering Rainwater and Boiling",
        "Phase V survival story (zombies are fiction): collect rainwater, strain it through cloth, boil it for at least one minute, then store it in a filter bottle.",
        [sc1, sc2, sc3],
        [*cast_actor("mika"), *cast_actor("leo"), *cast_actor("pip", with_props=False),
         {"id": "barrel", "name": "Rain barrel", "asset": "rain_barrel_filter"},
         {"id": "filter", "name": "Cloth filter", "asset": "cloth_filter"},
         {"id": "pot", "name": "Water pot", "asset": "water_pot_boiling"},
         {"id": "fire", "name": "Campfire", "asset": "campfire"},
         {"id": "bottle", "name": "Filter bottle", "asset": "water_filter_bottle", "attach_to": {"id": "mika", "anchor": "hand_r"}}],
        [
            _cue(0.5, 4.5, "mika", "Rainwater can carry germs and dirt. First, strain it through several layers of clean cloth.", "neutral"),
            _cue(5.5, 9.5, "leo", "Then boil it for at least one full minute. Boiling kills the germs a cloth cannot catch."),
            _cue(10.5, 14.5, "pip", "Now it is safe to drink. We fill the filter bottles before the journey!"),
        ],
    )


def quiet_street_examples():
    """Núp sau xe buýt cũ, ném lon đánh lạc hướng hai người nhiễm bệnh, lặng lẽ đi vòng."""
    walker = lambda cid, t, x, **kw: cast_pose(cid, t, x, 830, state="zombie", **kw)
    # Hook shamble giới hạn 35 px/s × thời lượng; quãng đi đặt đúng giới hạn để cảnh sau nối liền (không nhảy).
    sc1 = _scene(0.0, 5.0, {
        "bus": [_pose(0.0, 230, 840, 160, decay=0.6), _pose(5.0, 230, 840, 160, decay=0.6)],
        # Hai bạn đi vào rồi cúi thấp sau xe buýt (vẽ phía sau xe, đầu nhô lên).
        "mika": [cast_pose("mika", 0.0, -60, 830, z=-1), cast_pose("mika", 2.5, 150, 830, z=-1), cast_pose("mika", 5.0, 150, 845, z=-1, expression="worried")],
        "leo": [cast_pose("leo", 0.0, -180, 830, z=-1), cast_pose("leo", 2.8, 300, 830, z=-1), cast_pose("leo", 5.0, 300, 845, z=-1, expression="worried")],
        "leo_flashlight": prop_keys("leo", [0.0, 5.0]),
        "zombie_walker_a": [walker("zombie_walker_a", 0.0, 680), walker("zombie_walker_a", 5.0, 680)],
        "zombie_walker_b": [walker("zombie_walker_b", 0.0, 760), walker("zombie_walker_b", 5.0, 760)],
    }, actions=[
        _action("shamble", 0.0, 5.0, actor="zombie_walker_a", direction="left", distance=175),
        _action("shamble", 0.0, 5.0, actor="zombie_walker_b", direction="left", distance=150),
    ], bg="abandoned_street", weather="fog")

    # Cảnh 2: Leo ném lon vòng cung ra xa phía sau hai người nhiễm bệnh; họ quay về phía tiếng động và đi xa.
    sc2 = _scene(5.0, 10.0, {
        "bus": [_pose(5.0, 230, 840, 160, decay=0.6), _pose(10.0, 230, 840, 160, decay=0.6)],
        "mika": [cast_pose("mika", 5.0, 150, 845, z=-1, expression="worried"), cast_pose("mika", 10.0, 150, 845, z=-1)],
        "leo": [cast_pose("leo", 5.0, 300, 845, z=-1), cast_pose("leo", 5.6, 300, 830, z=-1, hand_r_x=20, hand_r_y=-70),
                cast_pose("leo", 6.2, 300, 845, z=-1), cast_pose("leo", 10.0, 300, 845, z=-1, expression="happy")],
        "leo_flashlight": prop_keys("leo", [5.0, 10.0]),
        "can": [_pose(5.0, 330, 700, 110, opacity=0.0), _pose(5.6, 330, 700, 110, opacity=1.0), _pose(6.4, 470, 470, 110, rotation=300, opacity=1.0),
                _pose(7.2, 560, 845, 110, rotation=600, opacity=1.0), _pose(10.0, 560, 845, 110, rotation=600, opacity=1.0)],
        "zombie_walker_a": [walker("zombie_walker_a", 5.0, 505), walker("zombie_walker_a", 10.0, 505)],
        "zombie_walker_b": [walker("zombie_walker_b", 5.0, 610), walker("zombie_walker_b", 10.0, 610)],
    }, actions=[
        _action("distract", 7.2, 8.0, actor="leo", target="can"),
        _action("shamble", 8.0, 10.0, actor="zombie_walker_a", direction="right", distance=70),
        _action("shamble", 8.0, 10.0, actor="zombie_walker_b", direction="right", distance=70),
    ], bg="abandoned_street", weather="fog")

    sc3 = _scene(10.0, 15.0, {
        "bus": [_pose(10.0, 230, 840, 160, decay=0.6), _pose(15.0, 230, 840, 160, decay=0.6)],
        "mika": [cast_pose("mika", 10.0, 150, 845, z=-1), cast_pose("mika", 10.8, 150, 830, z=-1), cast_pose("mika", 15.0, -120, 830, z=-1, expression="happy")],
        "leo": [cast_pose("leo", 10.0, 300, 845, z=-1), cast_pose("leo", 10.8, 300, 830, z=-1), cast_pose("leo", 15.0, 20, 830, z=-1, expression="happy")],
        "leo_flashlight": prop_keys("leo", [10.0, 15.0]),
        "zombie_walker_a": [walker("zombie_walker_a", 10.0, 575), walker("zombie_walker_a", 15.0, 575)],
        "zombie_walker_b": [walker("zombie_walker_b", 10.0, 680), walker("zombie_walker_b", 15.0, 680)],
    }, actions=[
        _action("shamble", 10.0, 15.0, actor="zombie_walker_a", direction="right", distance=150),
        _action("shamble", 10.0, 15.0, actor="zombie_walker_b", direction="right", distance=150),
        _action("emote", 12.0, 14.5, actor="leo", emote="heart"),
    ], bg="abandoned_street", weather="fog")

    return _story(
        "quiet_street",
        "62 · Quiet Street: Teamwork and Distraction",
        "Phase V survival story (zombies are fiction): Mika and Leo hide behind an old bus, toss an empty can to draw two dazed walkers away, and slip past quietly.",
        [sc1, sc2, sc3],
        [*cast_actor("mika"), *cast_actor("leo"), *cast_actor("zombie_walker_a", state="zombie"), *cast_actor("zombie_walker_b", state="zombie"),
         {"id": "bus", "name": "Old bus", "asset": "city_bus"}, {"id": "can", "name": "Empty can", "asset": "can"}],
        [
            _cue(0.5, 4.5, "mika", "Two dazed walkers drift down the empty street. Mika and Leo crouch low behind an old bus.", "neutral"),
            _cue(5.5, 9.5, "leo", "Leo tosses an empty can far down the street. The clatter draws both walkers away."),
            _cue(10.5, 14.5, "mika", "Stay quiet, stay together, always keep a way out. The team slips past safely."),
        ],
    )


def barricade_night_examples():
    """Trại an toàn ban đêm: ông Otto đóng ván chặn cổng, Biscuit canh, người nhiễm bệnh lảng vảng rồi bỏ đi."""
    walker = lambda t, x, **kw: cast_pose("zombie_walker_c", t, x, 830, state="zombie", z=-2, **kw)
    sc1 = _scene(0.0, 5.0, {
        "gate": [_pose(0.0, 120, 840, 200, growth=0.0), _pose(5.0, 120, 840, 200, growth=1.0)],
        "grandpa_otto": [cast_pose("grandpa_otto", 0.0, 205, 830, flip=True), cast_pose("grandpa_otto", 5.0, 205, 830, flip=True)],
        "grandpa_otto_hammer": prop_keys("grandpa_otto", [0.0, 5.0]),
        "mika": [cast_pose("mika", 0.0, 650, 830), cast_pose("mika", 3.0, 355, 830), cast_pose("mika", 5.0, 355, 830)],
        "fire": [_pose(0.0, 462, 850, 160, lit=1.0), _pose(5.0, 462, 850, 160, lit=1.0)],
        "biscuit": [cast_pose("biscuit", 0.0, 530, 840, height=100), cast_pose("biscuit", 5.0, 530, 840, height=100)],
    }, actions=[
        _action("barricade", 0.3, 4.8, actor="grandpa_otto", target="gate"),
    ], bg="safe_camp", time="night", weather="clear")

    # Cảnh 2: người nhiễm bệnh tới sát hàng rào phía ngoài (vẽ sau cổng), Biscuit báo động; cổng đứng vững.
    sc2 = _scene(5.0, 10.0, {
        "gate": [_pose(5.0, 120, 840, 200, growth=1.0), _pose(10.0, 120, 840, 200, growth=1.0)],
        "grandpa_otto": [cast_pose("grandpa_otto", 5.0, 205, 830, flip=True), cast_pose("grandpa_otto", 10.0, 205, 830, expression="worried", flip=True)],
        "grandpa_otto_hammer": prop_keys("grandpa_otto", [5.0, 10.0]),
        "mika": [cast_pose("mika", 5.0, 355, 830), cast_pose("mika", 10.0, 355, 830, expression="worried")],
        "fire": [_pose(5.0, 462, 850, 160, lit=1.0), _pose(10.0, 462, 850, 160, lit=1.0)],
        "biscuit": [cast_pose("biscuit", 5.0, 530, 840, height=100), cast_pose("biscuit", 10.0, 530, 840, height=100)],
        "zombie_walker_c": [walker(5.0, -110), walker(10.0, -110)],
    }, actions=[
        _action("shamble", 5.0, 9.0, actor="zombie_walker_c", direction="right", distance=140),
        _action("emote", 6.5, 9.5, actor="biscuit", emote="exclamation"),
    ], bg="safe_camp", time="night", weather="clear")

    sc3 = _scene(10.0, 15.0, {
        "gate": [_pose(10.0, 120, 840, 200, growth=1.0), _pose(15.0, 120, 840, 200, growth=1.0)],
        "grandpa_otto": [cast_pose("grandpa_otto", 10.0, 205, 830, flip=True), cast_pose("grandpa_otto", 15.0, 205, 830, expression="happy")],
        "grandpa_otto_hammer": prop_keys("grandpa_otto", [10.0, 15.0]),
        "mika": [cast_pose("mika", 10.0, 355, 830), cast_pose("mika", 15.0, 355, 830, expression="happy")],
        "fire": [_pose(10.0, 462, 850, 160, lit=1.0), _pose(15.0, 462, 850, 160, lit=1.0)],
        "biscuit": [cast_pose("biscuit", 10.0, 530, 840, height=100), cast_pose("biscuit", 15.0, 530, 840, height=100)],
        "zombie_walker_c": [walker(10.0, 30, flip=True), walker(15.0, 30, flip=True)],
    }, actions=[
        _action("shamble", 10.0, 15.0, actor="zombie_walker_c", direction="left", distance=175),
        _action("emote", 11.5, 14.5, actor="mika", emote="heart"),
    ], bg="safe_camp", time="night", weather="clear")

    return _story(
        "barricade_night",
        "63 · Safe Camp Night: Reinforcing the Gate",
        "Phase V survival story (zombies are fiction): Grandpa Otto boards up the gate, Biscuit keeps watch by a safe campfire, and a lone walker wanders away.",
        [sc1, sc2, sc3],
        [*cast_actor("grandpa_otto"), *cast_actor("mika"), *cast_actor("biscuit"), *cast_actor("zombie_walker_c", state="zombie"),
         {"id": "gate", "name": "Barricade", "asset": "barricade_boards"}, {"id": "fire", "name": "Campfire", "asset": "campfire"}],
        [
            _cue(0.5, 4.5, "grandpa_otto", "Night falls on the safe camp. Grandpa Otto boards up the gate with sturdy planks.", "neutral"),
            _cue(5.5, 9.5, "biscuit", "Biscuit hears rustling outside the fence and barks a warning, but the gate holds fast.", "worried"),
            _cue(10.5, 14.5, "mika", "The walker finds no way in and drifts away. Keep the fire small and take turns on watch."),
        ],
    )


def flooded_escape_examples():
    """Chèo thuyền qua phố ngập, Mika phát tín hiệu bằng gương, thuyền đi tiếp tới chỗ cứu hộ."""
    BOAT_H, RIDER_H = 230, 165
    seat_dy = 44 * BOAT_H / 100   # anchor seat [0, -44] của boat
    def riders(t, bx, **kw):
        # Leo chèo ở đuôi, Mika đứng mũi; chân trên mặt ghế, vẽ sau thân thuyền (z -1) để mạn thuyền che bàn chân.
        return {
            "leo": cast_pose("leo", t, bx - 80, 840 - seat_dy + 12, height=RIDER_H, z=-1, **kw.get("leo", {})),
            "mika": cast_pose("mika", t, bx + 75, 840 - seat_dy + 12, height=RIDER_H, z=-1, **kw.get("mika", {})),
        }
    def track(points):
        out = {"skiff": [], "leo": [], "mika": []}
        for t, bx, kw in points:
            out["skiff"].append(_pose(t, bx, 840, BOAT_H))
            for k, v in riders(t, bx, **kw).items():
                out[k].append(v)
        return out

    p1 = track([(0.0, 40, {}), (5.0, 250, {})])
    sc1 = _scene(0.0, 5.0, {**p1, "mika_signal_mirror": [dict(k, opacity=0.0) for k in _mirror([0.0, 5.0])]},
                 actions=[_action("row", 0.3, 4.8, actor="leo", target="skiff")], bg="flooded_downtown", weather="clear")

    p2 = track([(5.0, 250, {}), (6.0, 250, {"mika": {"hand_r_x": 18, "hand_r_y": -64}}), (10.0, 250, {"mika": {"hand_r_x": 18, "hand_r_y": -64, "expression": "happy"}})])
    sc2 = _scene(5.0, 10.0, {**p2, "mika_signal_mirror": _mirror([5.0, 10.0])},
                 actions=[_action("signal", 6.0, 9.5, actor="mika", target="mika_signal_mirror"),
                          _action("emote", 6.2, 8.5, actor="mika", emote="exclamation")],
                 bg="flooded_downtown", weather="clear")

    p3 = track([(10.0, 250, {}), (15.0, 470, {"leo": {"expression": "happy"}, "mika": {"expression": "happy"}})])
    sc3 = _scene(10.0, 15.0, {**p3, "mika_signal_mirror": [dict(k, opacity=0.0) for k in _mirror([10.0, 15.0])]},
                 actions=[_action("row", 10.2, 14.8, actor="leo", target="skiff"),
                          _action("emote", 11.0, 14.5, actor="mika", emote="heart")],
                 bg="flooded_downtown", weather="clear")

    return _story(
        "flooded_escape",
        "64 · Flooded Escape: Rowing to Safety",
        "Phase V survival story (zombies are fiction): Leo rows the skiff through flooded streets while Mika flashes a signal mirror to rescuers.",
        [sc1, sc2, sc3],
        [*cast_actor("leo", with_props=False), *cast_actor("mika", with_props=False),
         {"id": "mika_signal_mirror", "name": "Signal mirror", "asset": "signal_mirror", "attach_to": {"id": "mika", "anchor": "hand_r"}},
         {"id": "skiff", "name": "Skiff", "asset": "boat"}],
        [
            _cue(0.5, 4.5, "leo", "Floodwater has covered the lower streets. Leo rows the skiff slowly and keeps to the middle.", "neutral"),
            _cue(5.5, 9.5, "mika", "Mika angles a signal mirror at the sky. A flash of sunlight can be seen many kilometres away."),
            _cue(10.5, 14.5, "leo", "Rescuers answer the signal! Clear signals and teamwork bring everyone home."),
        ],
    )


def _mirror(times):
    hp = held_pose("signal_mirror", 160, -20)
    return [{"time": t, "x": hp["x"], "y": hp["y"], "height": 160, "rotation": -20, "opacity": 1.0} for t in times]


def the_cure_examples():
    """Dr. Hana phun thuốc chữa lần lượt cho Nora và hai người nhiễm bệnh; cả ba khỏi bệnh."""
    H = 215
    def z(cid, t, x, cured=0.0, **kw):
        state = "cured" if cured >= 1.0 else "zombie"
        p = cast_pose(cid, t, x, 830, state=state, height=H, **kw)
        if cured < 1.0:
            p.update(zombie=1.0, cured=cured)
        else:
            p.update(zombie=0.0, cured=1.0)
        return p

    sc1 = _scene(0.0, 5.0, {
        "dr_hana": [cast_pose("dr_hana", 0.0, -80, 830), cast_pose("dr_hana", 3.0, 90, 830), cast_pose("dr_hana", 5.0, 90, 830)],
        "dr_hana_cure_sprayer": prop_keys("dr_hana", [0.0, 5.0]),
        "nora": [z("nora", 0.0, 300), z("nora", 5.0, 300)],
        "zombie_walker_a": [z("zombie_walker_a", 0.0, 435), z("zombie_walker_a", 5.0, 435)],
        "zombie_walker_b": [z("zombie_walker_b", 0.0, 570), z("zombie_walker_b", 5.0, 570)],
    }, actions=[
        _action("shamble", 0.0, 5.0, actor="nora", direction="left", distance=50),
        _action("shamble", 0.0, 5.0, actor="zombie_walker_a", direction="left", distance=50),
        _action("shamble", 0.0, 5.0, actor="zombie_walker_b", direction="left", distance=50),
    ], bg="subway_tunnel", weather="clear")

    # Cảnh 2: ba lần phun nối tiếp; mỗi người khỏi bệnh lần lượt.
    sc2 = _scene(5.0, 10.0, {
        "dr_hana": [cast_pose("dr_hana", 5.0, 90, 830), cast_pose("dr_hana", 10.0, 90, 830, expression="happy")],
        "dr_hana_cure_sprayer": prop_keys("dr_hana", [5.0, 10.0]),
        "nora": [z("nora", 5.0, 250), z("nora", 5.6, 250, 0.0), z("nora", 6.8, 250, 0.6), z("nora", 7.0, 250, 1.0, expression="happy"), z("nora", 10.0, 250, 1.0, expression="happy")],
        "zombie_walker_a": [z("zombie_walker_a", 5.0, 385), z("zombie_walker_a", 7.0, 385), z("zombie_walker_a", 8.5, 385, 1.0, expression="happy"), z("zombie_walker_a", 10.0, 385, 1.0, expression="happy")],
        "zombie_walker_b": [z("zombie_walker_b", 5.0, 520), z("zombie_walker_b", 8.5, 520), z("zombie_walker_b", 10.0, 520, 1.0, expression="happy")],
    }, actions=[
        _action("cure_spray", 5.6, 7.0, actor="dr_hana", target="nora"),
        _action("cure_spray", 7.0, 8.5, actor="dr_hana", target="zombie_walker_a"),
        _action("cure_spray", 8.5, 10.0, actor="dr_hana", target="zombie_walker_b"),
    ], bg="subway_tunnel", weather="clear")

    sc3 = _scene(10.0, 15.0, {
        "dr_hana": [cast_pose("dr_hana", 10.0, 90, 830, expression="happy"), cast_pose("dr_hana", 15.0, 90, 830, expression="happy")],
        "dr_hana_cure_sprayer": prop_keys("dr_hana", [10.0, 15.0]),
        "nora": [z("nora", 10.0, 250, 1.0, expression="happy"), z("nora", 12.0, 230, 1.0, expression="happy"), z("nora", 15.0, 230, 1.0, expression="happy")],
        "zombie_walker_a": [z("zombie_walker_a", 10.0, 385, 1.0, expression="happy"), z("zombie_walker_a", 12.5, 370, 1.0, expression="happy"), z("zombie_walker_a", 15.0, 370, 1.0, expression="happy")],
        "zombie_walker_b": [z("zombie_walker_b", 10.0, 520, 1.0, expression="happy"), z("zombie_walker_b", 13.0, 510, 1.0, expression="happy"), z("zombie_walker_b", 15.0, 510, 1.0, expression="happy")],
    }, actions=[
        _action("emote", 11.0, 14.5, actor="nora", emote="heart"),
        _action("emote", 11.5, 14.5, actor="dr_hana", emote="heart"),
    ], bg="subway_tunnel", weather="clear")

    return _story(
        "the_cure",
        "65 · The Cure: Science, Kindness and Hope",
        "Phase V survival story (zombies are fiction): Dr. Hana's sparkling cure mist turns Nora and two dazed walkers back into healthy friends.",
        [sc1, sc2, sc3],
        [*cast_actor("dr_hana"), *cast_actor("nora", state="zombie"),
         *cast_actor("zombie_walker_a", state="zombie"), *cast_actor("zombie_walker_b", state="zombie")],
        [
            _cue(0.5, 4.5, "dr_hana", "Deep in the subway tunnel, Dr. Hana is ready with her new cure.", "neutral"),
            _cue(5.5, 9.5, "dr_hana", "A gentle sparkling mist, one person at a time. The strange illness fades away."),
            _cue(10.5, 14.5, "nora", "Nora is herself again, and so are her friends. Science and kindness win!"),
        ],
    )
