"""Storyboard beat + thời lượng TTS đo thật → story vector khổ dọc (tất định, không ngẫu nhiên).

LLM chỉ chọn nền, vật thể và beat cho từng câu lời đọc; toạ độ do builder tính:
- người dẫn và bạn đồng hành đứng ở slot cố định trên mặt đất (`ground_y` của nền), không bao giờ chồng nhau;
- vật thể đặt giữa khoảng trống còn lại (vật bay ở trên đầu nhân vật), cỡ tính từ kích thước đo thật
  (`extents`) để luôn ≥ 60 px và không lấn sang người;
- mỗi beat là một hàm sinh keyframe/action hợp lệ của thư viện (enter, exit, walk, point, emote, react,
  celebrate, think, look, reveal); nhân vật luôn quay mặt theo hướng đi, keyframe ghi đủ trường (không để
  `opacity` hay tay "dính" sang keyframe sau);
- phụ đề không vẽ lên canvas (story không có cue): engine Node đặt phụ đề HTML bên dưới vùng diễn.
"""
from __future__ import annotations

import copy
import hashlib
import re

from bkt_web.remake_vector import RENDERER, EMOTE_SYMBOLS, catalog, validate_story
from bkt_web.vector_video import dna as dna_mod
from bkt_web.vector_video.extents import bbox, extent
from bkt_web.vector_video.niches import allowed

W, H = 576, 1024
BEATS = ("enter", "exit", "walk", "point", "emote", "react", "celebrate", "think", "look", "reveal")
MOODS = ("neutral", "happy", "surprised", "worried", "sad", "smug")
EMOTES = ("idea", "question", "exclamation", "heart", "music", "sweat", "zzz")
PACING = {"calm": 1, "normal": 2, "busy": 3}
HOST_H = {"wide": 230, "close": 245, "pan": 235}
BUDDY_VISUAL_H = 118
GAP = 14
MIN_SUBJECT_H = 90           # vật thể dưới đất cao tối thiểu (px, khung 576)
FLOAT_BAND = (110, 575)      # vật bay nằm trên đầu nhân vật (đầu chibi 230 ở y ≈ 600)
# Lề an toàn theo khung hình của DNA: camera zoom cắt mép khung (close 1.1 tâm giữa, pan 1.06 lia ±14 px),
# nên người/thú/vật thể phải nằm trong phần camera thật sự thấy.
SAFE_X = {"wide": 22.0, "close": 50.0, "pan": 54.0}
FLOAT_TOP = {"wide": 110.0, "close": 150.0, "pan": 110.0}
CAMERA = {"close": {"zoom": (1.0, 1.1), "x": (288, 288), "y": (560, 600)}, "pan": {"zoom": (1.06, 1.06), "x": (274, 302), "y": (540, 540)}}
SUBJECT_W = {"s": 190, "m": 250, "l": 330}
SUBJECT_FLOAT_H = {"s": 210, "m": 280, "l": 360}
SUBJECT_GROUND_H = {"s": 190, "m": 250, "l": 330}
WALK_SPEED = 150.0           # px/s tối đa khi đi bộ


def _seed(*parts) -> int:
    return int(hashlib.sha256("|".join(map(str, parts)).encode("utf-8")).hexdigest()[:8], 16)


class Track:
    """Keyframe của một nhân vật trong một cảnh; mỗi keyframe chép đủ trạng thái của keyframe trước."""

    FIELDS = ("x", "y", "height", "flip", "expression", "opacity", "hand_r_x", "hand_r_y", "jump", "celebrate", "variant", "z", "outfit")

    def __init__(self, start: float, end: float | None = None, **state):
        self.keys = [{"time": round(start, 3), **state}]
        self.end = end

    @property
    def last(self) -> dict:
        return self.keys[-1]

    def key(self, t: float, **changes) -> dict:
        if self.end is not None:
            t = min(t, self.end - 0.002)   # cảnh ngắn: không để keyframe vượt quá cuối cảnh
        t = round(max(t, self.last["time"]), 3)
        if t == self.last["time"] and len(self.keys) > 1:
            self.last.update(changes)
            return self.last
        if t == self.last["time"]:
            t = round(t + 0.001, 3)
        frame = {**self.last, **changes, "time": t}
        self.keys.append(frame)
        return frame

    def x_at(self, t: float) -> float:
        prev = self.keys[0]
        for k in self.keys:
            if k["time"] >= t:
                if k["time"] == prev["time"]:
                    return k["x"]
                u = (t - prev["time"]) / (k["time"] - prev["time"])
                return prev["x"] + (k["x"] - prev["x"]) * u
            prev = k
        return prev["x"]

    def finish(self, end: float) -> list[dict]:
        self.end = None
        self.key(end)
        out = []
        for k in self.keys:
            frame = {f: k[f] for f in ("time", *self.FIELDS) if f in k and k[f] is not None}
            out.append(frame)
        return out


def _ground(bg: str, cat: dict) -> float:
    return float(cat["background_specs"].get(bg, {}).get("ground_y", 810))


def _host_actor(host: dict) -> dict:
    actor = {"id": "host", "name": "Host", "asset": host["rig"]}
    if host.get("outfit"):
        actor["outfit"] = host["outfit"]
    return actor


def _subject_geometry(spec: dict, ground: float, people: list[tuple[float, float]], margin: float = 22.0, float_top: float = FLOAT_BAND[0]) -> tuple[float, float, float]:
    """(x, y, height) cho vật thể; people = khung ngang (x0, x1) của người/thú đang đứng."""
    left, top, right, bottom = extent(spec["asset"], spec.get("variant"))
    size = spec.get("size", "m")
    if spec.get("float"):
        lo, hi = margin, W - margin
        band_top, band_bottom = float_top, FLOAT_BAND[1]
        h = min(SUBJECT_W[size] / (right - left), SUBJECT_FLOAT_H[size] / (bottom - top), (band_bottom - band_top) / (bottom - top))
        x = (lo + hi) / 2 - (left + right) / 2 * h
        y = (band_top + band_bottom) / 2 - (top + bottom) / 2 * h
        return round(x, 1), round(y, 1), round(h, 1)
    lo = max([margin] + [x1 + GAP for x0, x1 in people if x1 < W / 2])
    hi = min([W - margin] + [x0 - GAP for x0, x1 in people if x0 > W / 2])
    h = min(min(SUBJECT_W[size], hi - lo) / (right - left), SUBJECT_GROUND_H[size] / (bottom - top), (ground - 120) / (bottom - top))
    # Vật dẹt: nâng cỡ tới khi cao ≥ MIN_SUBJECT_H nhưng không vượt khoảng trống giữa người.
    h = max(h, min(MIN_SUBJECT_H / (bottom - top), (hi - lo) / (right - left)))
    x = (lo + hi) / 2 - (left + right) / 2 * h
    return round(x, 1), round(ground, 1), round(h, 1)


def _face(track: Track, target_x: float | None) -> bool:
    """flip = True khi mục tiêu ở bên trái (rig mặc định quay phải)."""
    if target_x is None:
        return track.last.get("flip", False)
    return target_x < track.last["x"] - 4


def _label_words(label: str) -> list[str]:
    """Từ khoá của nhãn vật thể (bỏ mạo từ, từ ≤ 3 ký tự); so nguyên từ, không so chuỗi con."""
    return [w for w in re.findall(r"[\w-]+", label.lower()) if len(w) > 3 and w not in {"the", "a", "an"}]


def _mentions(spec: dict, lang: str, text: str, words: set[str]) -> bool:
    """Lời/ý hình nhắc tới vật thể: từ của nhãn tiếng Anh hoặc nhãn theo ngôn ngữ kênh (`labels`).
    Chữ CJK không có khoảng trắng nên nhãn ko/ja so như chuỗi con (≥ 2 ký tự); chữ Latin so nguyên từ."""
    if any(w in words for w in _label_words(spec["label"])):
        return True
    local = (spec.get("labels") or {}).get(lang)
    if not local:
        return False
    for term in [t.strip().lower() for t in local.split("|") if t.strip()]:
        if re.search(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]", term):
            if len(term) >= 2 and term in text:
                return True
        elif term in words or any(w in words for w in _label_words(term)):
            return True
    return False


def fallback_storyboard(scenes: list[dict], niche_id: str, lang: str, title: str = "") -> dict:
    """Chế độ A (tất định, không bịa): giữ nền theo cụm 2 cảnh, chọn vật thể có tên xuất hiện trong lời đọc
    hoặc ý hình, nếu không thì xoay vòng; beat theo mẫu mở đầu → giới thiệu → phản ứng → kết."""
    allow = allowed(niche_id, lang)
    settings, subjects = allow["settings"], list(allow["subjects"])
    h = _seed(niche_id, lang, title)
    out = []
    n = len(scenes)
    for i, scene in enumerate(scenes):
        text = f"{scene.get('line', '')} {scene.get('visual_intent', '')}".lower()
        words = set(re.findall(r"[\w-]+", text))
        match = next((s for s in subjects if _mentions(allow["subjects"][s], lang, text, words)), None)
        # Không bịa: không khớp tên thì giữ vật thể của cảnh trước (cùng chủ đề đang nói), không có thì "none".
        subject = match or (out[-1]["subject"] if out else "none")
        if i == 0:
            beats = [{"type": "enter", "who": "host"}, {"type": "emote", "who": "host", "symbol": "idea"}]
        elif i == n - 1:
            beats = [{"type": "celebrate", "who": "host"}, {"type": "emote", "who": "buddy", "symbol": "heart"}]
        else:
            pattern = [
                [{"type": "reveal", "who": "subject"}, {"type": "point", "who": "host"}],
                [{"type": "react", "who": "host", "mood": "surprised"}, {"type": "look", "who": "buddy"}],
                [{"type": "think", "who": "host"}, {"type": "walk", "who": "host"}],
                [{"type": "point", "who": "host"}, {"type": "emote", "who": "buddy", "symbol": "exclamation"}],
            ]
            beats = pattern[(i - 1) % len(pattern)]
            if subject == "none":
                beats = [b for b in beats if b["type"] != "reveal"] or [{"type": "react", "who": "host", "mood": "surprised"}]
        setting = settings[((h >> 3) + i // 2) % len(settings)]
        fits = [bg for bg in (allow["subjects"].get(subject, {}).get("settings") or []) if bg in settings]
        if fits and setting not in fits:
            # Vật thể có bối cảnh hợp (tàu đắm dưới đáy biển, hành tinh ngoài không gian): giữ nền cảnh trước nếu hợp.
            setting = out[-1]["setting"] if out and out[-1]["setting"] in fits else fits[0]
        out.append({
            "scene_index": i + 1,
            "setting": setting,
            "subject": subject,
            "mood": ("happy", "surprised", "neutral", "worried")[(h + i) % 4] if 0 < i < n - 1 else "happy",
            "beats": beats,
        })
    return {"scenes": out}


def storyboard_problems(board: dict, scene_count: int, niche_id: str, lang: str) -> list[str]:
    allow = allowed(niche_id, lang)
    errs = []
    scenes = board.get("scenes") if isinstance(board, dict) else None
    if not isinstance(scenes, list) or len(scenes) != scene_count:
        return [f"scenes must have exactly {scene_count} items"]
    for i, sc in enumerate(scenes):
        tag = f"scenes[{i}]"
        if sc.get("setting") not in allow["settings"]:
            errs.append(f"{tag}.setting must be one of {allow['settings']}")
        if sc.get("subject") not in [*allow["subjects"], "none"]:
            errs.append(f"{tag}.subject must be 'none' or one of the listed subjects")
        if sc.get("mood") not in MOODS:
            errs.append(f"{tag}.mood must be one of {list(MOODS)}")
        beats = sc.get("beats")
        if not isinstance(beats, list) or not 1 <= len(beats) <= 3:
            errs.append(f"{tag}.beats must have 1-3 items")
            continue
        for j, b in enumerate(beats):
            if b.get("type") not in BEATS:
                errs.append(f"{tag}.beats[{j}].type must be one of {list(BEATS)}")
            if b.get("who") not in ("host", "buddy", "subject"):
                errs.append(f"{tag}.beats[{j}].who must be host, buddy or subject")
            if b.get("type") == "reveal" and b.get("who") != "subject":
                errs.append(f"{tag}.beats[{j}]: reveal is only for who=subject")
            if b.get("type") == "emote" and b.get("symbol") not in EMOTES:
                errs.append(f"{tag}.beats[{j}].symbol must be one of {list(EMOTES)}")
            if b.get("type") == "reveal" and sc.get("subject") in (None, "none"):
                errs.append(f"{tag}.beats[{j}]: reveal needs a subject")
    return errs


def build_story(*, slug: str, lang: str, niche_id: str, channel_id: str, scenes: list[dict], total: float, storyboard: dict | None = None, title: str = "") -> dict:
    """scenes: [{start, duration, line?, visual_intent?}] theo thời gian TTS đo thật; total = độ dài video."""
    cat = catalog()
    allow = allowed(niche_id, lang)
    hosts, buddies = list(allow["hosts"]), list(allow["buddies"])
    dna = dna_mod.for_channel(channel_id, len(hosts), len(buddies))
    board = storyboard if storyboard and not storyboard_problems(storyboard, len(scenes), niche_id, lang) else fallback_storyboard(scenes, niche_id, lang, title)
    host_spec = allow["hosts"][hosts[dna["cast"][0]]]
    buddy_id = buddies[dna["cast"][1]] if dna["cast"][1] >= 0 else None
    buddy_spec = allow["buddies"][buddy_id] if buddy_id else None
    max_beats = PACING[dna["pacing"]]
    safe = SAFE_X[dna["framing"]]
    host_h = HOST_H[dna["framing"]]
    hl, ht, hr, hb = extent(host_spec["rig"])
    characters = [_host_actor(host_spec)]
    buddy_h = None
    if buddy_spec:
        bl, bt, br, bb = extent(buddy_spec["asset"])
        buddy_h = round(BUDDY_VISUAL_H / (bb - bt), 1)
        characters.append({"id": "buddy", "name": "Buddy", "asset": buddy_spec["asset"]})
    subject_ids = []
    out_scenes = []
    starts = [0.0] + [float(s["start"]) for s in scenes[1:]]
    ends = starts[1:] + [float(total)]
    for i, (sc, s0, s1) in enumerate(zip(board["scenes"], starts, ends)):
        bg = sc["setting"]
        ground = _ground(bg, cat)
        time_of_day = {"day": "day", "night": "night", "mist": "day", "alternate": "day" if i < len(scenes) / 2 else "night"}[dna["palette"]]
        background = {"preset": bg, "time": time_of_day}
        if dna["palette"] == "mist":
            background["weather"] = "fog"
        subject_key = sc.get("subject") if sc.get("subject") not in (None, "none") else None
        spec = allow["subjects"][subject_key] if subject_key else None
        buddy_here = bool(buddy_spec)
        if buddy_spec and spec and not spec.get("float"):
            # Vật thể dẹt (cá sấu, tàu…) cần cả khoảng giữa để cao ≥ MIN_SUBJECT_H: bạn đồng hành nhường cảnh này.
            sl, st, sr, sb = extent(spec["asset"], spec.get("variant"))
            gap = (W - safe + bl * buddy_h - br * buddy_h - GAP) - (safe - hl * host_h + hr * host_h + GAP) - 2 * safe
            if MIN_SUBJECT_H * (sr - sl) / (sb - st) > gap:
                buddy_here = False
        beats = [b for b in sc["beats"] if b.get("who") != "buddy" or buddy_here][:max_beats]
        if spec and not spec.get("float"):
            host_x = safe - hl * host_h
            buddy_x = (W - safe - br * buddy_h) if buddy_here else None
        else:
            host_x = 190.0 if buddy_here else 230.0
            buddy_x = 400.0 if buddy_here else None
        host_x = round(host_x, 1)
        people = [(host_x + hl * host_h, host_x + hr * host_h)]
        if buddy_here:
            buddy_x = round(buddy_x, 1)
            people.append((buddy_x + bl * buddy_h, buddy_x + br * buddy_h))
        poses: dict[str, list] = {}
        actions = []
        actor_asset = {"host": host_spec["rig"], "buddy": buddy_spec["asset"] if buddy_here else None}

        def add_action(action):
            # Chỉ thêm động tác mà catalog cho phép với rig đó (vd. cú không có bong bóng emote), gọn trong cảnh.
            action["end"] = round(min(action["end"], s1 - 0.01), 3)
            if action["end"] - action["start"] < 0.3:
                return
            if actor_asset.get(action["actor"]) in cat["actions"][action["type"]].get("actors", []):
                actions.append(action)
        host = Track(s0, s1, x=host_x, y=ground, height=host_h, flip=False, expression=sc.get("mood", "neutral"), opacity=1.0, hand_r_x=24, hand_r_y=-22, jump=0, celebrate=0)
        tracks = {"host": host}
        if buddy_here:
            tracks["buddy"] = Track(s0, s1, x=buddy_x, y=ground, height=buddy_h, flip=True, expression="happy", opacity=1.0, jump=0)
        subj = None
        if spec:
            cid = f"subject_{subject_key}"
            if cid not in subject_ids:
                subject_ids.append(cid)
                characters.append({"id": cid, "name": spec["label"], "asset": spec["asset"]})
            sx, sy, sh = _subject_geometry(spec, ground, people, safe, FLOAT_TOP[dna["framing"]])
            reveal = any(b["type"] == "reveal" for b in beats)
            subj = Track(s0, s1, x=sx, y=sy, height=sh, opacity=0.0 if reveal else 1.0, variant=spec.get("variant"), z=-1)
            tracks[cid] = subj
        target_x = (subj.last["x"] if subj else None)
        span = (s1 - s0) / max(1, len(beats))
        for j, beat in enumerate(beats):
            b0 = s0 + j * span + 0.15
            b1 = s0 + (j + 1) * span - 0.1
            who = beat["who"]
            if who == "subject":
                if subj and beat["type"] == "reveal":
                    full = subj.last["height"]
                    subj.key(b0, opacity=0.0, height=round(full * 0.55, 1))
                    subj.key(min(b1, b0 + 0.7), opacity=1.0, height=full)
                continue
            tr = tracks.get(who)
            if tr is None:
                continue
            home = tr.keys[0]["x"]
            other = tracks["buddy"].last["x"] if who == "host" and "buddy" in tracks else (host.last["x"] if who == "buddy" else None)
            look_at = target_x if target_x is not None else other
            kind = beat["type"]
            if kind in ("enter", "exit"):
                side = -90.0 if home < W / 2 else W + 90.0
                dist = abs(home - side)
                dur = min(max(0.6, b1 - b0), max(dist / WALK_SPEED, 0.8))
                if kind == "enter":
                    tr.keys[0].update(x=side, flip=side > home)
                    tr.key(b0, x=side, flip=side > home)
                    tr.key(b0 + dur, x=home, flip=side > home)
                    tr.key(b0 + dur + 0.05, flip=_face(tr, look_at))
                else:
                    tr.key(b0, flip=side < home)
                    tr.key(b0 + dur, x=side, flip=side < home)
            elif kind == "walk":
                toward = look_at if look_at is not None else W / 2
                step = 46.0 if toward > home else -46.0
                if who == "host" and subj and not (spec or {}).get("float"):
                    step = min(step, 30.0) if step > 0 else max(step, -30.0)
                mid = b0 + (b1 - b0) * 0.45
                tr.key(b0, flip=step < 0)
                tr.key(mid, x=round(home + step, 1), flip=step < 0)
                tr.key(min(b1, mid + 0.2), flip=_face(tr, look_at))
            elif kind in ("point", "look"):
                face = _face(tr, look_at)
                tr.key(b0, flip=face)
                if kind == "point" and who == "host":
                    tr.key(b0 + 0.35, hand_r_x=38, hand_r_y=-74)
                    tr.key(max(b0 + 0.4, b1 - 0.35), hand_r_x=38, hand_r_y=-74)
                    tr.key(b1, hand_r_x=24, hand_r_y=-22)
                elif kind == "point":
                    tr.key(b0 + 0.3, jump=1)
                    tr.key(b0 + 0.6, jump=0)
            elif kind == "emote":
                symbol = {"idea": "idea", "question": "?", "exclamation": "!", "heart": "heart", "music": "music", "sweat": "sweat", "zzz": "zzz"}[beat.get("symbol", "idea")]
                add_action({"type": "emote", "start": round(b0, 3), "end": round(max(b0 + 0.8, b1), 3), "actor": who, "emote": symbol})
            elif kind == "react":
                mood = beat.get("mood") if beat.get("mood") in MOODS else "surprised"
                tr.key(b0, expression=mood)
                tr.key(b0 + 0.25, jump=1)
                tr.key(b0 + 0.6, jump=0)
            elif kind == "celebrate":
                tr.key(b0, expression="happy", celebrate=0)
                tr.key(b0 + 0.3, celebrate=1)
                tr.key(max(b0 + 0.35, b1 - 0.2), celebrate=1)
                tr.key(b1, celebrate=0)
            elif kind == "think":
                tr.key(b0, expression="neutral")
                if who == "host":
                    tr.key(b0 + 0.3, hand_r_x=12, hand_r_y=-58)
                    tr.key(max(b0 + 0.35, b1 - 0.3), hand_r_x=12, hand_r_y=-58)
                    tr.key(b1, hand_r_x=24, hand_r_y=-22)
                add_action({"type": "emote", "start": round(b0, 3), "end": round(max(b0 + 0.8, b1), 3), "actor": who, "emote": "?"})
        # Vật bay nhấp nhô nhẹ cả cảnh (chuyển động liên tục, tất định).
        if subj and (spec or {}).get("float"):
            base_y = subj.keys[0]["y"]
            t = s0
            k = 0
            while t + 1.2 < s1:
                t += 1.2
                k += 1
                subj.key(t, y=round(base_y + (6 if k % 2 else -6), 1))
        cid_subject = f"subject_{subject_key}" if spec else None
        for cid, tr in tracks.items():
            poses[cid] = tr.finish(s1)
        # hand_r/jump/celebrate chỉ dành cho người; thú bỏ trường tay.
        if "buddy" in poses:
            for k in poses["buddy"]:
                k.pop("hand_r_x", None)
                k.pop("hand_r_y", None)
                k.pop("celebrate", None)
        if cid_subject:
            for k in poses[cid_subject]:
                for f in ("expression", "flip", "hand_r_x", "hand_r_y", "jump", "celebrate"):
                    k.pop(f, None)
                # Trường pose riêng của vật thể (vd zombie: zombie/outfit/expression; quái vật biển: badge 0).
                k.update(spec.get("pose") or {})
        scene = {
            "renderer": RENDERER, "kind": "scene", "index": i, "start_time": round(s0, 3), "end_time": round(s1, 3),
            "characters_present": list(poses), "poses": poses, "actions": actions, "background": background,
        }
        cam = CAMERA.get(dna["framing"])
        if cam:
            xs = cam["x"] if i % 2 == 0 else cam["x"][::-1]
            scene["camera"] = [{"time": round(s0, 3), "x": xs[0], "y": cam["y"][0], "zoom": cam["zoom"][0]},
                               {"time": round(s1, 3), "x": xs[1], "y": cam["y"][1], "zoom": cam["zoom"][1]}]
        out_scenes.append(scene)
    story = {
        "id": slug, "name": title or slug, "renderer": RENDERER, "fidelity": "technical-demo",
        "note": f"vector engine · niche {niche_id} · {lang}", "duration": round(float(total), 3),
        "characters": characters, "scenes": out_scenes, "cues": [],
        "vector_meta": {"dna": dna, "host": hosts[dna["cast"][0]], "buddy": buddy_id, "storyboard_source": "llm" if board is storyboard else "fallback"},
    }
    validate_story(copy.deepcopy({k: v for k, v in story.items() if k != "vector_meta"}))
    return story
