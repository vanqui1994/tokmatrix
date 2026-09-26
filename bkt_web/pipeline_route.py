"""Cổng đánh giá: nguồn mới có tự dựng được không (UV-802).

Đây là mắt nối giữa tầng phân tích v2 và pipeline production. Nó chạy
``analyse_media`` → ``compile_storyboard`` → ``direct`` → ``route_storyboard``
rồi trả về một **phán quyết** kèm lý do cụ thể, thay vì một chữ "không".

Ba cái bẫy mà cổng này chặn, phát hiện khi nối thật chứ không phải suy đoán:

1. **Render plan `routable` không đồng nghĩa với dựng được.** Storyboard do
   UV-304 compile cố ý để `render_requirements` **rỗng** (không bịa yêu cầu).
   Router vì thế không có cổng cứng nào để trượt, nên nó chọn renderer điểm
   cao nhất và tuyên bố `routable`. Requirement rỗng nghĩa là *chưa kiểm gì*,
   không phải *đã đạt hết*.

2. **Renderer điểm cao nhất cho nguồn mới lại là `footage-composite-v1`** —
   tức là dùng lại chính footage nguồn. Nếu tin router, mọi video mới sẽ
   "tự động remake" bằng cách phát lại video gốc. Registry có khai
   ``features.source_media_reuse`` nên cổng phát hiện được mà không cần
   hard-code tên renderer.

3. **Router gật nhưng renderer vẫn không vẽ được.** Với native-vector-v1,
   UV-800 biết còn thiếu pose và bối cảnh; cổng hỏi lại bridge.

Cổng chỉ **đọc và phán quyết**. Nó không render, không gọi TTS, không sửa
storyboard, và không bao giờ tự duyệt việc dùng lại media nguồn.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence


ROUTE_SCHEMA = "tokmatrix.pipeline-route/v1"
NATIVE_RENDERER = "native-vector-v1"

REASON_CODES = (
    "ANALYSIS_FAILED",
    "NO_FIDELITY_REQUIREMENTS",
    "SOURCE_MEDIA_REUSE_NOT_APPROVED",
    "RENDERER_CANNOT_DRAW_SCENE",
    "ROUTE_NEEDS_REVIEW",
    "COMPILED_WITH_SKIPPED_OBSERVATIONS",
    "ASSET_NEEDS_REVIEW",
)


@dataclass(frozen=True, slots=True)
class RouteVerdict:
    """Nguồn này có đi tiếp được không, và nếu không thì vì sao."""

    ok: bool
    status: str
    reason_codes: tuple[str, ...] = ()
    reasons: tuple[str, ...] = ()
    project_id: str | None = None
    analysis_id: str | None = None
    renderers: tuple[str, ...] = ()
    scene_count: int = 0
    skipped: tuple[dict[str, Any], ...] = ()
    uncertainties: tuple[dict[str, Any], ...] = ()
    storyboard: dict[str, Any] | None = None
    render_plan: dict[str, Any] | None = None
    asset_plan: dict[str, Any] | None = None
    asset_gaps: tuple[dict[str, Any], ...] = ()

    def summary(self) -> str:
        if self.ok:
            return f"Có thể dựng tự động bằng {', '.join(self.renderers) or 'renderer đã chọn'}"
        return "; ".join(self.reasons) if self.reasons else "chưa đủ điều kiện dựng tự động"

    def as_dict(self, *, include_storyboard: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "schema": ROUTE_SCHEMA,
            "ok": self.ok,
            "status": self.status,
            "summary": self.summary(),
            "reason_codes": list(self.reason_codes),
            "reasons": list(self.reasons),
            "project_id": self.project_id,
            "analysis_id": self.analysis_id,
            "renderers": list(self.renderers),
            "scene_count": self.scene_count,
            "skipped": [dict(item) for item in self.skipped],
            "uncertainties": [dict(item) for item in self.uncertainties],
            "asset_plan": copy.deepcopy(self.asset_plan),
            "asset_gaps": [copy.deepcopy(item) for item in self.asset_gaps],
        }
        if include_storyboard and self.storyboard is not None:
            payload["storyboard"] = copy.deepcopy(self.storyboard)
            payload["render_plan"] = copy.deepcopy(self.render_plan)
        return payload


def _failed(code: str, reason: str, **extra: Any) -> RouteVerdict:
    return RouteVerdict(ok=False, status="needs_review", reason_codes=(code,), reasons=(reason,), **extra)


def assess_render_plan(
    storyboard: dict[str, Any],
    render_plan: dict[str, Any],
    *,
    registry: dict[str, Any] | None = None,
    allow_source_media_reuse: bool = False,
) -> tuple[list[str], list[str]]:
    """Kiểm một render plan đã có; trả (reason_codes, reasons)."""
    codes: list[str] = []
    reasons: list[str] = []

    scenes = storyboard.get("scenes", [])
    required_total = sum(
        len((scene.get("render_requirements") or {}).get("required", []))
        for scene in scenes
    )
    if scenes and required_total == 0:
        codes.append("NO_FIDELITY_REQUIREMENTS")
        reasons.append(
            "storyboard chưa khai yêu cầu fidelity nào nên router không có cổng cứng để kiểm; "
            "'routable' ở đây nghĩa là chưa kiểm gì, không phải đã đạt"
        )

    selections = render_plan.get("selections", [])
    if any(item.get("status") == "needs-review" for item in selections):
        codes.append("ROUTE_NEEDS_REVIEW")
        blocked = sorted({item.get("scene_id") for item in selections if item.get("status") == "needs-review"})
        reasons.append(f"router trả needs-review cho scene: {', '.join(str(item) for item in blocked)}")

    if registry is None:
        from bkt_web.capability_registry import inspect_registry

        registry = inspect_registry()
    renderers = registry.get("renderers", {})

    reusing: list[str] = []
    for item in selections:
        if item.get("status") == "rejected":
            continue
        entry = renderers.get(item.get("renderer_id"), {})
        if entry.get("features", {}).get("source_media_reuse"):
            reusing.append(str(item.get("renderer_id")))
    for fallback in render_plan.get("fallbacks", []):
        if fallback.get("source_media_usage", "none") != "none":
            reusing.append(f"fallback:{fallback.get('fallback_id')}")
    if reusing and not allow_source_media_reuse:
        codes.append("SOURCE_MEDIA_REUSE_NOT_APPROVED")
        reasons.append(
            f"route dùng lại media nguồn ({', '.join(sorted(set(reusing)))}) mà chưa có người duyệt; "
            "phát lại video gốc không phải là remake"
        )

    native_scenes = [
        item for item in selections
        if item.get("renderer_id") == NATIVE_RENDERER and item.get("status") != "rejected"
    ]
    if native_scenes:
        from bkt_web.native_vector_bridge import inspect_native_bridge

        bridge = inspect_native_bridge(storyboard)
        if not bridge.renderable:
            codes.append("RENDERER_CANNOT_DRAW_SCENE")
            reasons.append(bridge.reason())

    return codes, reasons


def assess_source(
    media_path: str | Path,
    *,
    transcription: dict[str, Any] | None = None,
    profile_id: str = "source-faithful",
    created_at: str | None = None,
    registry: dict[str, Any] | None = None,
    allow_source_media_reuse: bool = False,
    allow_network: bool = False,
) -> RouteVerdict:
    """Chạy analysis → compile → direct → route cho một file nguồn."""
    from bkt_web.analysis_compiler import compile_storyboard
    from bkt_web.analysis_probe import analyse_media
    from bkt_web.auto_director import direct

    try:
        run = analyse_media(media_path, transcription=transcription, allow_network=allow_network)
    except Exception as error:  # noqa: BLE001 - mọi lỗi phân tích đều thành needs_review có lý do
        return _failed("ANALYSIS_FAILED", f"không phân tích được nguồn: {error}")

    stamp = created_at or "1970-01-01T00:00:00Z"
    try:
        compiled = compile_storyboard(run.payload, created_at=stamp)
    except Exception as error:  # noqa: BLE001
        return _failed("ANALYSIS_FAILED", f"không dựng được storyboard từ phân tích: {error}")

    storyboard = compiled.storyboard
    try:
        plan = direct(storyboard, profile_id=profile_id, registry=registry, plan_assets=True)
        render_plan = plan["render_plan"]
    except Exception as error:  # noqa: BLE001
        return _failed(
            "ANALYSIS_FAILED",
            f"không định tuyến được storyboard: {error}",
            project_id=storyboard.get("project_id"),
            analysis_id=run.document.analysis_id,
            scene_count=len(storyboard.get("scenes", [])),
        )

    codes, reasons = assess_render_plan(
        storyboard,
        render_plan,
        registry=registry,
        allow_source_media_reuse=allow_source_media_reuse,
    )
    if compiled.skipped:
        # Một transcript không có nhãn speaker bị compiler bỏ đúng cách, nhưng
        # nếu cổng im lặng thì pipeline sẽ dựng một video mất sạch lời thoại
        # mà vẫn coi là tự động thành công.
        codes.append("COMPILED_WITH_SKIPPED_OBSERVATIONS")
        listed = ", ".join(sorted({item.reason for item in compiled.skipped}))
        reasons.append(f"compiler bỏ {len(compiled.skipped)} quan sát không neo được ({listed})")
    asset_gaps = tuple(copy.deepcopy(item) for item in plan.get("asset_gaps", []))
    if asset_gaps:
        codes.append("ASSET_NEEDS_REVIEW")
        names = ", ".join(sorted({str(item["entity_name"]) for item in asset_gaps}))
        reasons.append(f"không có asset phù hợp cho entity: {names}")
    renderers = tuple(sorted({
        str(item.get("renderer_id"))
        for item in render_plan.get("selections", [])
        if item.get("status") != "rejected"
    }))
    return RouteVerdict(
        ok=not codes,
        status="routable" if not codes else "needs_review",
        reason_codes=tuple(codes),
        reasons=tuple(reasons),
        project_id=storyboard.get("project_id"),
        analysis_id=run.document.analysis_id,
        renderers=renderers,
        scene_count=len(storyboard.get("scenes", [])),
        skipped=tuple(item.as_dict() for item in compiled.skipped),
        uncertainties=tuple(dict(item) for item in compiled.uncertainties),
        storyboard=storyboard,
        render_plan=render_plan,
        asset_plan=copy.deepcopy(plan.get("asset_plan")),
        asset_gaps=asset_gaps,
    )


__all__ = [
    "NATIVE_RENDERER",
    "REASON_CODES",
    "ROUTE_SCHEMA",
    "RouteVerdict",
    "assess_render_plan",
    "assess_source",
]
