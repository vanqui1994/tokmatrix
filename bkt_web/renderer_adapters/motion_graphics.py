"""UV-401 — motion graphics adapter.

Covers text, shapes, cards, lower-thirds, charts and callouts for 9:16, 16:9
and 1:1 canvases.  Layout (wrapping, font size, boxes) is resolved once at
compile time, so every frame reuses the same geometry and text can never
overflow its box at a particular timestamp.  Fonts resolve through a fixed
fallback table: an unavailable family always lands on the same stack.
"""

from __future__ import annotations

from typing import Any, Mapping

from bkt_web.renderer_adapters.base import (
    AdapterIssue,
    CANVAS_PRESETS,
    CompiledScene,
    RendererAdapter,
    SceneNotSupported,
    builtin_provenance,
    clamp,
    ease,
)
from bkt_web.universal_storyboard import Scene


RENDERER_ID = "motion-graphics-v1"
RENDERER_VERSION = "1.0.0"

KINDS = ("text", "shape", "card", "lower_third", "chart", "callout")
ACTIONS = ("mg.reveal", "mg.emphasize", "mg.chart-grow", "mg.callout-point", "mg.dismiss")
EFFECTS = ("mg.fade", "mg.slide", "mg.scale")

# family -> metric class.  Anything unknown falls back to "sans" deterministically.
FAMILY_CLASS = {
    "inter": "sans",
    "roboto": "sans",
    "helvetica": "sans",
    "arial": "sans",
    "system-ui": "sans",
    "georgia": "serif",
    "times": "serif",
    "noto serif": "serif",
    "ibm plex mono": "mono",
    "menlo": "mono",
    "courier": "mono",
}
FALLBACK_STACK = {
    "sans": ["Inter", "Helvetica Neue", "Arial", "sans-serif"],
    "serif": ["Georgia", "Times New Roman", "serif"],
    "mono": ["IBM Plex Mono", "Menlo", "monospace"],
}
# Mean advance width as a fraction of the font size, per metric class.  Fixed
# numbers keep measurement identical on every machine and in every browser.
ADVANCE = {"sans": 0.52, "serif": 0.5, "mono": 0.6}
WIDE_CHARS = set("MWmw@%")
NARROW_CHARS = set("iljtIf.,;:'!|()[]{} ")

MIN_FONT_SCALE = 0.45
LINE_HEIGHT = 1.25
DEFAULT_BOXES = {
    "text": {"x": 0.08, "y": 0.30, "width": 0.84, "height": 0.30},
    "card": {"x": 0.10, "y": 0.34, "width": 0.80, "height": 0.28},
    "lower_third": {"x": 0.06, "y": 0.74, "width": 0.70, "height": 0.16},
    "shape": {"x": 0.30, "y": 0.40, "width": 0.40, "height": 0.20},
    "chart": {"x": 0.10, "y": 0.28, "width": 0.80, "height": 0.42},
    "callout": {"x": 0.12, "y": 0.18, "width": 0.50, "height": 0.16},
}
DEFAULT_FONT_FRACTION = {"text": 0.055, "card": 0.042, "lower_third": 0.034, "callout": 0.030, "chart": 0.024, "shape": 0.030}


def measure_text(text: str, font_size: float, metric_class: str) -> float:
    """Deterministic width estimate; no browser and no system font needed."""
    advance = ADVANCE[metric_class]
    total = 0.0
    for character in text:
        factor = 1.0
        if metric_class != "mono":
            if character in WIDE_CHARS:
                factor = 1.45
            elif character in NARROW_CHARS:
                factor = 0.45
        total += advance * factor
    return total * font_size


def wrap_text(text: str, font_size: float, metric_class: str, max_width: float) -> list[str] | None:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if measure_text(candidate, font_size, metric_class) <= max_width or not current:
            if not current and measure_text(word, font_size, metric_class) > max_width:
                return None
            current = candidate
            continue
        lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines or [""]


def resolve_font(requested: Any) -> dict[str, Any]:
    name = requested.strip().lower() if isinstance(requested, str) and requested.strip() else ""
    metric_class = FAMILY_CLASS.get(name)
    resolved_class = metric_class or "sans"
    return {
        "requested": requested if isinstance(requested, str) and requested.strip() else None,
        "metric_class": resolved_class,
        "stack": list(FALLBACK_STACK[resolved_class]),
        "fallback": metric_class is None,
    }


class MotionGraphicsAdapter(RendererAdapter):
    renderer_id = RENDERER_ID
    renderer_version = RENDERER_VERSION
    frame_mode = "draw-list"
    default_canvas = dict(CANVAS_PRESETS["9:16"])
    supported_canvases = tuple(dict(value) for value in CANVAS_PRESETS.values())

    def inspect_capabilities(self) -> dict[str, Any]:
        assets = {
            f"mg.{name.replace('_', '-')}": {
                "id": f"mg.{name.replace('_', '-')}",
                "version": RENDERER_VERSION,
                "renderer": RENDERER_ID,
                "entity_types": [name],
                "anchors": ["center", "top-left", "bottom-left"],
                "actions": sorted(ACTIONS if name == "chart" else [item for item in ACTIONS if item != "mg.chart-grow"]),
                "states": ["hidden", "visible"],
            }
            for name in KINDS
        }
        for asset_id, asset in assets.items():
            if asset_id != "mg.callout":
                asset["actions"] = [item for item in asset["actions"] if item != "mg.callout-point"]
            asset["provenance"] = builtin_provenance(asset)
        actions = {
            action_id: {
                "id": action_id,
                "version": RENDERER_VERSION,
                "actors": sorted(asset_id for asset_id, asset in assets.items() if action_id in asset["actions"]),
                "targets": [],
            }
            for action_id in ACTIONS
        }
        return {
            "schema": "tokmatrix.capability-registry/v1",
            "version": "1.0.0",
            "renderers": {
                RENDERER_ID: {
                    "id": RENDERER_ID,
                    "version": RENDERER_VERSION,
                    "media": ["vector-2d", "typography"],
                    "features": {
                        "deterministic_seek": True,
                        "offline_render": True,
                        "alpha_output": True,
                        "audio_tracks": False,
                        "nested_compositions": False,
                        "responsive_layout": True,
                    },
                    "supports": {
                        "entities": sorted(KINDS),
                        "actions": sorted(ACTIONS),
                        "materials": [],
                        "effects": sorted(EFFECTS),
                    },
                    "fallbacks": [],
                    "limits": {
                        "max_entities_per_project": 200,
                        "max_scene_duration_seconds": 3600,
                        "canvas_sizes": [[item["width"], item["height"]] for item in self.supported_canvases],
                    },
                    "fidelity": {"photorealism": 0.0, "character_motion": 0.0, "typography": 0.95},
                }
            },
            "assets": assets,
            "actions": actions,
            "materials": {},
            "effects": {effect_id: {"id": effect_id, "version": RENDERER_VERSION} for effect_id in EFFECTS},
            "fallbacks": {},
        }

    # -- validation -------------------------------------------------------
    def _validate(self, scene: Scene, assets: Mapping[str, Any]) -> list[AdapterIssue]:
        issues: list[AdapterIssue] = []
        entity_kinds: dict[str, str] = {}
        for index, entity in enumerate(scene.entities):
            path = f"$.entities[{index}]"
            if entity.kind not in KINDS:
                issues.append(AdapterIssue("MG_ENTITY_KIND_UNSUPPORTED", f"{path}.kind", f"kind không được hỗ trợ: {entity.kind}"))
                continue
            entity_kinds[entity.entity_id] = entity.kind
            attributes = entity.attributes
            if entity.kind in {"text", "card", "lower_third", "callout"} and not isinstance(attributes.get("text"), str):
                issues.append(AdapterIssue("MG_TEXT_MISSING", f"{path}.attributes.text", "cần chuỗi text"))
            if entity.kind == "chart":
                series = attributes.get("series")
                if not isinstance(series, list) or not series:
                    issues.append(AdapterIssue("MG_CHART_SERIES_MISSING", f"{path}.attributes.series", "cần danh sách series"))
                elif any(
                    not isinstance(item, dict)
                    or not isinstance(item.get("label"), str)
                    or isinstance(item.get("value"), bool)
                    or not isinstance(item.get("value"), (int, float))
                    for item in series
                ):
                    issues.append(AdapterIssue("MG_CHART_SERIES_INVALID", f"{path}.attributes.series", "series cần label chuỗi và value số"))
            if entity.kind == "callout" and not self._point(attributes.get("anchor_point")):
                issues.append(AdapterIssue("MG_CALLOUT_ANCHOR_INVALID", f"{path}.attributes.anchor_point", "cần điểm chuẩn hoá {x,y} trong [0,1]"))
            box = attributes.get("box")
            if box is not None and not self._box(box):
                issues.append(AdapterIssue("MG_BOX_INVALID", f"{path}.attributes.box", "box phải nằm trong [0,1] và không tràn khung"))
        for index, action in enumerate(scene.actions):
            path = f"$.actions[{index}]"
            if action.type not in ACTIONS:
                issues.append(AdapterIssue("MG_ACTION_UNSUPPORTED", f"{path}.type", f"action không được hỗ trợ: {action.type}"))
                continue
            for position, actor in enumerate(action.actor_ids):
                kind = entity_kinds.get(actor)
                if kind is None:
                    issues.append(AdapterIssue("MG_ACTION_REFERENCE", f"{path}.actor_ids[{position}]", f"không tìm thấy entity: {actor}"))
                elif action.type == "mg.chart-grow" and kind != "chart":
                    issues.append(AdapterIssue("MG_ACTION_KIND_MISMATCH", f"{path}.actor_ids[{position}]", "mg.chart-grow chỉ áp dụng cho chart"))
                elif action.type == "mg.callout-point" and kind != "callout":
                    issues.append(AdapterIssue("MG_ACTION_KIND_MISMATCH", f"{path}.actor_ids[{position}]", "mg.callout-point chỉ áp dụng cho callout"))
        return issues

    @staticmethod
    def _point(value: Any) -> bool:
        return (
            isinstance(value, dict)
            and all(not isinstance(value.get(key), bool) and isinstance(value.get(key), (int, float)) and 0 <= value[key] <= 1 for key in ("x", "y"))
        )

    @staticmethod
    def _box(value: Any) -> bool:
        if not isinstance(value, dict):
            return False
        for key in ("x", "y", "width", "height"):
            item = value.get(key)
            if isinstance(item, bool) or not isinstance(item, (int, float)) or not 0 <= item <= 1:
                return False
        return value["width"] > 0 and value["height"] > 0 and value["x"] + value["width"] <= 1.0001 and value["y"] + value["height"] <= 1.0001

    # -- compile ----------------------------------------------------------
    def _compile(self, scene: Scene, assets: Mapping[str, Any], canvas: dict[str, int]) -> CompiledScene:
        width, height = canvas["width"], canvas["height"]
        safe = {"x": 0.06 * width, "y": 0.05 * height}
        elements: list[dict[str, Any]] = []
        fonts: list[dict[str, Any]] = []
        overflow: list[AdapterIssue] = []
        for index, entity in enumerate(scene.entities):
            attributes = entity.attributes
            box_norm = attributes.get("box") or DEFAULT_BOXES[entity.kind]
            box = {
                "x": box_norm["x"] * width,
                "y": box_norm["y"] * height,
                "width": box_norm["width"] * width,
                "height": box_norm["height"] * height,
            }
            # Keep every box inside the safe area of the chosen aspect ratio.
            box["x"] = min(max(box["x"], safe["x"]), max(safe["x"], width - safe["x"] - box["width"]))
            box["y"] = min(max(box["y"], safe["y"]), max(safe["y"], height - safe["y"] - box["height"]))
            box["width"] = min(box["width"], width - 2 * safe["x"])
            box["height"] = min(box["height"], height - 2 * safe["y"])
            font = resolve_font(attributes.get("font_family"))
            fonts.append({"entity_id": entity.entity_id, **font})
            element: dict[str, Any] = {
                "element_id": entity.entity_id,
                "kind": entity.kind,
                "z": int(attributes.get("z", index)),
                "box": box,
                "font": font,
                "fill": attributes.get("fill") or self._default_fill(entity.kind),
                "stroke": attributes.get("stroke"),
                "actions": [],
            }
            if entity.kind in {"text", "card", "lower_third", "callout"}:
                requested = float(attributes.get("font_size_fraction", DEFAULT_FONT_FRACTION[entity.kind])) * height
                padding = 0.04 * box["width"] if entity.kind in {"card", "lower_third", "callout"} else 0.0
                inner_width = box["width"] - 2 * padding
                inner_height = box["height"] - 2 * padding
                layout = self._fit_text(attributes["text"], requested, font["metric_class"], inner_width, inner_height)
                if layout is None:
                    overflow.append(AdapterIssue("MG_TEXT_OVERFLOW", f"$.entities[{index}].attributes.text", "text không vừa hộp ngay cả ở cỡ chữ nhỏ nhất"))
                    continue
                element.update({"text_layout": layout, "padding": padding})
            if entity.kind == "shape":
                element["shape"] = attributes.get("shape", "rect")
                if element["shape"] not in {"rect", "ellipse", "line"}:
                    overflow.append(AdapterIssue("MG_SHAPE_UNSUPPORTED", f"$.entities[{index}].attributes.shape", f"shape không được hỗ trợ: {element['shape']}"))
                    continue
            if entity.kind == "chart":
                element["series"] = [{"label": str(item["label"]), "value": float(item["value"])} for item in attributes["series"]]
                element["chart_type"] = attributes.get("chart_type", "bar")
                if element["chart_type"] != "bar":
                    overflow.append(AdapterIssue("MG_CHART_TYPE_UNSUPPORTED", f"$.entities[{index}].attributes.chart_type", "hiện chỉ hỗ trợ chart bar"))
                    continue
                layout = self._fit_chart_labels(element["series"], box, font["metric_class"])
                if layout is None:
                    overflow.append(AdapterIssue("MG_CHART_LABEL_OVERFLOW", f"$.entities[{index}].attributes.series", "nhãn chart không vừa cột ngay cả ở cỡ chữ nhỏ nhất"))
                    continue
                element["chart_layout"] = layout
            if entity.kind == "callout":
                point = attributes["anchor_point"]
                element["anchor_point"] = {"x": point["x"] * width, "y": point["y"] * height}
            elements.append(element)
        if overflow:
            raise SceneNotSupported(self.renderer_id, overflow)
        by_id = {item["element_id"]: item for item in elements}
        for action in scene.actions:
            for actor in action.actor_ids:
                if actor in by_id:
                    by_id[actor]["actions"].append({"type": action.type, "start": action.start, "end": action.end, "action_id": action.action_id})
        for element in elements:
            element["actions"].sort(key=lambda item: (item["start"], item["action_id"]))
        elements.sort(key=lambda item: (item["z"], item["element_id"]))
        warnings = tuple(
            f"font '{item['requested']}' không có trong bảng metric; dùng stack {item['stack'][0]}"
            for item in fonts
            if item["fallback"] and item["requested"]
        )
        return CompiledScene(
            renderer_id=self.renderer_id,
            renderer_version=self.renderer_version,
            scene_id=scene.scene_id,
            start=scene.start,
            end=scene.end,
            canvas=canvas,
            frame_mode=self.frame_mode,
            fidelity_class="motion-graphics",
            source_media_usage="none",
            plan={"elements": elements, "safe_area": safe, "fonts": fonts},
            assets=tuple({"asset_id": f"mg.{item['kind'].replace('_', '-')}", "entity_id": item["element_id"], "provenance": "built-in"} for item in elements),
            warnings=warnings,
        )

    @staticmethod
    def _default_fill(kind: str) -> str:
        return {"text": "#f6f4ec", "card": "#12312b", "lower_third": "#0f2a3d", "shape": "#2f6f5a", "chart": "#2f6f5a", "callout": "#3a2f12"}[kind]

    @staticmethod
    def _fit_chart_labels(series: list[dict[str, Any]], box: dict[str, float], metric_class: str) -> dict[str, Any] | None:
        gap = box["width"] / (len(series) * 4)
        slot = (box["width"] - gap * (len(series) + 1)) / len(series)
        if slot <= 0:
            return None
        size = box["height"] * 0.06
        smallest = size * MIN_FONT_SCALE
        while size >= smallest:
            widths = [measure_text(item["label"], size, metric_class) for item in series]
            if max(widths) <= slot:
                return {
                    "gap": round(gap, 4),
                    "slot": round(slot, 4),
                    "label_font_size": round(size, 4),
                    "labels": [{"label": item["label"], "width": round(width, 4)} for item, width in zip(series, widths)],
                }
            size *= 0.92
        return None

    @staticmethod
    def _fit_text(text: str, requested: float, metric_class: str, max_width: float, max_height: float) -> dict[str, Any] | None:
        size = requested
        while size >= requested * MIN_FONT_SCALE:
            lines = wrap_text(text, size, metric_class, max_width)
            if lines is not None and len(lines) * size * LINE_HEIGHT <= max_height:
                return {
                    "font_size": round(size, 4),
                    "line_height": round(size * LINE_HEIGHT, 4),
                    "lines": [{"text": line, "width": round(measure_text(line, size, metric_class), 4)} for line in lines],
                    "max_width": round(max_width, 4),
                    "max_height": round(max_height, 4),
                }
            size *= 0.92
        return None

    # -- frames -----------------------------------------------------------
    def _frame(self, compiled: CompiledScene, seconds: float) -> dict[str, Any]:
        layers = []
        for element in compiled.plan["elements"]:
            state = self._state(element, seconds)
            if state["opacity"] <= 0:
                layers.append({"layer_id": element["element_id"], "z": element["z"], "opacity": 0.0, "ops": []})
                continue
            layers.append({
                "layer_id": element["element_id"],
                "z": element["z"],
                "opacity": round(state["opacity"], 6),
                "ops": self._ops(element, state),
            })
        return {"layers": layers}

    @staticmethod
    def _state(element: dict[str, Any], seconds: float) -> dict[str, float]:
        has_reveal = any(item["type"] == "mg.reveal" for item in element["actions"])
        state = {"opacity": 0.0 if has_reveal else 1.0, "offset_y": 0.0, "scale": 1.0, "progress": 1.0, "leader": 1.0}
        for action in element["actions"]:
            span = max(action["end"] - action["start"], 1e-9)
            u = clamp((seconds - action["start"]) / span)
            if seconds < action["start"]:
                if action["type"] == "mg.reveal":
                    state.update(opacity=0.0, offset_y=0.0)
                if action["type"] == "mg.chart-grow":
                    state["progress"] = 0.0
                if action["type"] == "mg.callout-point":
                    state["leader"] = 0.0
                continue
            if action["type"] == "mg.reveal":
                eased = ease("smooth", u)
                state["opacity"] = eased
                state["offset_y"] = (1 - eased) * 0.04
            elif action["type"] == "mg.dismiss":
                eased = ease("ease-in", u)
                state["opacity"] = 1 - eased
                state["offset_y"] = -eased * 0.03
            elif action["type"] == "mg.emphasize":
                triangle = 1 - abs(2 * u - 1)
                state["scale"] = 1 + 0.06 * ease("smooth", triangle)
            elif action["type"] == "mg.chart-grow":
                state["progress"] = ease("ease-out", u)
            elif action["type"] == "mg.callout-point":
                state["leader"] = ease("ease-out", u)
        return state

    def _ops(self, element: dict[str, Any], state: dict[str, float]) -> list[dict[str, Any]]:
        box = element["box"]
        offset = state["offset_y"] * box["height"]
        scale = state["scale"]
        centre_x = box["x"] + box["width"] / 2
        centre_y = box["y"] + box["height"] / 2 + offset
        ops: list[dict[str, Any]] = []

        def scaled(x: float, y: float, w: float, h: float) -> dict[str, float]:
            return {
                "x": round(centre_x + (x + w / 2 - centre_x) * scale - w * scale / 2, 4),
                "y": round(centre_y + (y + h / 2 - centre_y) * scale - h * scale / 2, 4),
                "width": round(w * scale, 4),
                "height": round(h * scale, 4),
            }

        if element["kind"] in {"card", "lower_third", "callout"}:
            ops.append({"op": "rect", **scaled(box["x"], box["y"] + offset, box["width"], box["height"]), "fill": element["fill"], "radius": round(min(box["width"], box["height"]) * 0.08, 4)})
        if element["kind"] == "callout":
            point = element["anchor_point"]
            end_x = box["x"] + box["width"] / 2 + (point["x"] - box["x"] - box["width"] / 2) * state["leader"]
            end_y = box["y"] + box["height"] + (point["y"] - box["y"] - box["height"]) * state["leader"]
            ops.append({"op": "line", "points": [[round(centre_x, 4), round(box["y"] + box["height"] + offset, 4)], [round(end_x, 4), round(end_y + offset, 4)]], "stroke": element["stroke"] or "#f6f4ec", "width": 3})
        if element["kind"] == "shape":
            geometry = scaled(box["x"], box["y"] + offset, box["width"], box["height"])
            if element["shape"] == "line":
                ops.append({"op": "line", "points": [[geometry["x"], round(geometry["y"] + geometry["height"] / 2, 4)], [round(geometry["x"] + geometry["width"], 4), round(geometry["y"] + geometry["height"] / 2, 4)]], "stroke": element["fill"], "width": 4})
            else:
                ops.append({"op": element["shape"], **geometry, "fill": element["fill"], "stroke": element["stroke"]})
        if element["kind"] == "chart":
            ops.extend(self._chart_ops(element, state, offset, scale, centre_x, centre_y))
        layout = element.get("text_layout")
        if layout:
            padding = element.get("padding", 0.0)
            text_fill = "#0d1b17" if element["kind"] == "text" else "#f6f4ec"
            top = box["y"] + padding + offset + (box["height"] - 2 * padding - len(layout["lines"]) * layout["line_height"]) / 2
            for line_index, line in enumerate(layout["lines"]):
                ops.append({
                    "op": "text",
                    "text": line["text"],
                    "x": round(centre_x, 4),
                    "y": round(centre_y + (top + (line_index + 0.8) * layout["line_height"] - centre_y) * scale, 4),
                    "align": "center",
                    "font_size": round(layout["font_size"] * scale, 4),
                    "font_stack": element["font"]["stack"],
                    "fill": element["fill"] if element["kind"] == "text" else text_fill,
                    "measured_width": round(line["width"] * scale, 4),
                    "max_width": round(layout["max_width"], 4),
                })
        return ops

    @staticmethod
    def _chart_ops(element: dict[str, Any], state: dict[str, float], offset: float, scale: float, centre_x: float, centre_y: float) -> list[dict[str, Any]]:
        box, series, layout = element["box"], element["series"], element["chart_layout"]
        peak = max((abs(item["value"]) for item in series), default=0.0) or 1.0
        gap, slot = layout["gap"], layout["slot"]
        baseline = box["y"] + box["height"] + offset
        ops = [{"op": "line", "points": [[round(box["x"], 4), round(baseline, 4)], [round(box["x"] + box["width"], 4), round(baseline, 4)]], "stroke": "#8a9a93", "width": 2}]
        for index, item in enumerate(series):
            full = box["height"] * 0.86 * (abs(item["value"]) / peak)
            bar = full * state["progress"]
            x = box["x"] + gap + index * (slot + gap)
            ops.append({
                "op": "rect",
                "x": round(centre_x + (x + slot / 2 - centre_x) * scale - slot * scale / 2, 4),
                "y": round(centre_y + (baseline - bar - centre_y) * scale, 4),
                "width": round(slot * scale, 4),
                "height": round(bar * scale, 4),
                "fill": element["fill"],
                "radius": 0,
            })
            ops.append({
                "op": "text",
                "text": item["label"],
                "x": round(x + slot / 2, 4),
                "y": round(baseline + box["height"] * 0.08, 4),
                "align": "center",
                "font_size": layout["label_font_size"],
                "font_stack": element["font"]["stack"],
                "fill": "#0d1b17",
                "measured_width": layout["labels"][index]["width"],
                "max_width": round(slot, 4),
            })
        return ops


ADAPTER = MotionGraphicsAdapter

__all__ = ["ADAPTER", "MotionGraphicsAdapter", "RENDERER_ID", "measure_text", "resolve_font", "wrap_text"]
