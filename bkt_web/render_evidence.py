"""Bằng chứng cho một lần render, và manifest đi kèm (UV-804).

Sau khi dựng xong, câu hỏi không phải "pipeline có chạy hết không" mà "cái
file vừa xuất ra có đúng là bản dựng không". Module này trả lời bằng những
thứ kiểm được trên chính file đó, rồi đóng gói vào manifest UV-603.

Nguyên tắc quan trọng nhất ở đây: **một phép kiểm không xem xét gì thì không
được tính là đạt.**

Ví dụ thật gặp khi làm task này: `check_geometric_fidelity` chạy trên
storyboard migrate từ v1 trả `passed=True` — nhưng không component nào khai
`bounds`, nên nó kiểm đúng số không. Nếu gấp kết quả đó vào manifest,
`completion_claim` sẽ thành `complete` nhờ một phép kiểm rỗng. Vì vậy mọi
phép kiểm ở đây đều phải khai `applicable`; cái nào không xem xét gì thì vào
``not_applicable`` kèm lý do, và manifest coi như **chưa có bằng chứng** chứ
không phải đã đạt.

Những gì kiểm được thật trên file xuất ra:

``OUTPUT_MISSING``          không có file
``OUTPUT_TOO_SMALL``        file nhỏ tới mức không thể là video
``OUTPUT_IS_SOURCE_COPY``   file xuất ra **chính là** file nguồn
``DURATION_MISMATCH``       độ dài lệch khỏi storyboard
``OUTPUT_FROZEN``           mọi frame lấy mẫu giống hệt nhau
``OUTPUT_BLANK``            khung hình phẳng lì một màu
"""

from __future__ import annotations

import hashlib
import math
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence


EVIDENCE_SCHEMA = "tokmatrix.render-evidence/v1"
FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"
MIN_VIDEO_BYTES = 2048
DEFAULT_SAMPLES = 5
FROZEN_SSIM = 0.999
BLANK_COLOURS = 3


class RenderEvidenceError(ValueError):
    """Raised khi không thu thập được bằng chứng."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RenderEvidenceError(message)


def _tool(name: str) -> str:
    found = shutil.which(name)
    _require(found is not None, f"Không có '{name}' trên PATH nên không kiểm được bản dựng")
    assert found is not None
    return found


def file_sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


@dataclass(frozen=True, slots=True)
class Finding:
    code: str
    severity: str
    message: str
    measured: float | None = None
    expected: float | None = None

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class CheckOutcome:
    """Một phép kiểm, kèm việc nó có thực sự xem xét gì không."""

    kind: str
    applicable: bool
    passed: bool
    findings: tuple[Finding, ...] = ()
    detail: str = ""
    metrics: dict[str, float] = field(default_factory=dict)

    @property
    def failure_count(self) -> int:
        return sum(1 for item in self.findings if item.severity == "fail")

    @property
    def warning_count(self) -> int:
        return sum(1 for item in self.findings if item.severity == "warn")

    def as_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "applicable": self.applicable,
            "passed": self.passed,
            "detail": self.detail,
            "failure_count": self.failure_count,
            "warning_count": self.warning_count,
            "metrics": dict(sorted(self.metrics.items())),
            "findings": [item.as_dict() for item in self.findings],
        }

    def as_fidelity_result(self) -> Any:
        """Chuyển thành bản ghi cho manifest UV-603; chỉ gọi khi applicable."""
        from bkt_web.render_manifest import FidelityResult

        _require(self.applicable, f"{self.kind}: phép kiểm không xem xét gì thì không được ghi là đã chạy")
        return FidelityResult(
            kind=self.kind,
            passed=self.passed,
            failure_count=self.failure_count,
            warning_count=self.warning_count,
            scope=self.detail or None,
            metrics=dict(self.metrics),
        )


def _probe_duration(path: str | Path) -> float:
    binary = _tool(FFPROBE)
    completed = subprocess.run(
        [binary, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, timeout=60, check=False,
    )
    _require(completed.returncode == 0, f"ffprobe không đọc được bản dựng: {completed.stderr.strip()[:200]}")
    try:
        return float(completed.stdout.strip())
    except ValueError:
        raise RenderEvidenceError("bản dựng không khai thời lượng") from None


def _sample_frames(path: str | Path, times: Sequence[float], folder: Path) -> list[Any]:
    from bkt_web.fidelity_visual import load_frame

    binary = _tool(FFMPEG)
    frames = []
    for index, seconds in enumerate(times):
        target = folder / f"sample.{index:03d}.png"
        completed = subprocess.run(
            [binary, "-nostdin", "-v", "error", "-y", "-ss", f"{seconds:.3f}",
             "-i", str(path), "-frames:v", "1", str(target)],
            capture_output=True, text=True, timeout=120, check=False,
        )
        if completed.returncode != 0 or not target.is_file():
            continue
        frames.append(load_frame(target, seconds))
    return frames


def verify_output_video(
    video_path: str | Path,
    *,
    expected_duration: float,
    source_path: str | Path | None = None,
    samples: int = DEFAULT_SAMPLES,
    duration_tolerance: float = 0.5,
) -> CheckOutcome:
    """Kiểm chính file vừa xuất: có thật, đúng độ dài, không phải nguồn, có đổi."""
    from bkt_web.fidelity_visual import frame_ssim

    findings: list[Finding] = []
    metrics: dict[str, float] = {}
    path = Path(video_path)

    if not path.is_file():
        findings.append(Finding("OUTPUT_MISSING", "fail", f"không có file bản dựng tại {path}"))
        return CheckOutcome(kind="visual", applicable=True, passed=False, findings=tuple(findings), detail=str(path))

    size = path.stat().st_size
    metrics["output_bytes"] = float(size)
    if size < MIN_VIDEO_BYTES:
        findings.append(Finding("OUTPUT_TOO_SMALL", "fail", f"file chỉ {size} byte, không thể là video", float(size), float(MIN_VIDEO_BYTES)))
        return CheckOutcome(kind="visual", applicable=True, passed=False, findings=tuple(findings), detail=str(path), metrics=metrics)

    if source_path is not None and Path(source_path).is_file():
        if file_sha256(path) == file_sha256(source_path):
            # Phát lại nguyên file nguồn rồi gọi là remake là điều cả chương
            # trình tồn tại để ngăn.
            findings.append(Finding("OUTPUT_IS_SOURCE_COPY", "fail", "file xuất ra chính là file nguồn"))

    duration = _probe_duration(path)
    metrics["duration_seconds"] = round(duration, 6)
    metrics["expected_duration_seconds"] = round(float(expected_duration), 6)
    drift = abs(duration - float(expected_duration))
    metrics["duration_drift_seconds"] = round(drift, 6)
    if drift > duration_tolerance:
        findings.append(Finding("DURATION_MISMATCH", "fail", "độ dài bản dựng lệch khỏi storyboard", round(drift, 6), duration_tolerance))

    _require(samples >= 2, "cần lấy ít nhất hai mẫu frame để biết video có đổi không")
    span = max(duration, 0.001)
    times = [min(span * 0.98, span * index / (samples - 1)) for index in range(samples)]
    with tempfile.TemporaryDirectory() as folder:
        frames = _sample_frames(path, times, Path(folder))
    metrics["frames_requested"] = float(len(times))
    metrics["frames_sampled"] = float(len(frames))
    if 2 <= len(frames) < len(times):
        # Một mẫu rơi mất vẫn kiểm được, nhưng phải thấy được chứ không im lặng.
        findings.append(Finding(
            "SAMPLES_INCOMPLETE", "warn",
            "không lấy đủ số frame mẫu đã yêu cầu",
            float(len(frames)), float(len(times)),
        ))

    if len(frames) < 2:
        findings.append(Finding("OUTPUT_UNREADABLE", "fail", "không đọc được đủ frame để kiểm bản dựng", float(len(frames)), 2.0))
    else:
        scores = [frame_ssim(frames[index], frames[index + 1]) for index in range(len(frames) - 1)]
        lowest = min(scores)
        metrics["lowest_adjacent_ssim"] = round(lowest, 6)
        if lowest >= FROZEN_SSIM:
            findings.append(Finding("OUTPUT_FROZEN", "fail", "mọi frame lấy mẫu giống hệt nhau; bản dựng đứng hình", round(lowest, 6), FROZEN_SSIM))
        distinct = max(len(set(item.pixels)) for item in frames)
        metrics["max_distinct_levels"] = float(distinct)
        if distinct <= BLANK_COLOURS:
            findings.append(Finding("OUTPUT_BLANK", "fail", "khung hình phẳng lì, gần như một màu", float(distinct), float(BLANK_COLOURS)))

    passed = not any(item.severity == "fail" for item in findings)
    return CheckOutcome(kind="visual", applicable=True, passed=passed, findings=tuple(findings), detail=str(path), metrics=metrics)


def geometric_evidence(storyboard: dict[str, Any]) -> CheckOutcome:
    """Chạy UV-601, nhưng chỉ tính là đã kiểm khi có component khai bounds."""
    from bkt_web.fidelity_geometric import check_storyboard_geometry

    reports = check_storyboard_geometry(storyboard)
    checked = sum(int(item.metrics.get("components_with_bounds", 0)) for item in reports)
    skipped = sum(int(item.metrics.get("components_without_bounds", 0)) for item in reports)
    if checked == 0:
        return CheckOutcome(
            kind="geometric",
            applicable=False,
            passed=False,
            detail=f"không component nào khai bounds ({skipped} component bỏ qua) nên phép kiểm hình học chưa xem xét gì",
            metrics={"components_with_bounds": 0.0, "components_without_bounds": float(skipped)},
        )
    findings = tuple(
        Finding(item.code, item.severity, item.message, item.measured, item.allowed)
        for report in reports for item in report.findings
    )
    return CheckOutcome(
        kind="geometric",
        applicable=True,
        passed=all(report.passed for report in reports),
        findings=findings,
        detail=f"{len(reports)} scene, {checked} component có bounds",
        metrics={"components_with_bounds": float(checked), "components_without_bounds": float(skipped)},
    )


def structural_evidence(
    reference: dict[str, Any],
    candidate: dict[str, Any],
    *,
    allow_equal_snapshots: bool = False,
) -> CheckOutcome:
    """Chạy UV-600; so một tài liệu với chính nó thì không chứng minh được gì."""
    from bkt_web.fidelity_structural import check_structural_fidelity

    if reference is candidate or (reference == candidate and not allow_equal_snapshots):
        return CheckOutcome(
            kind="structural",
            applicable=False,
            passed=False,
            detail="reference và candidate là cùng một storyboard nên phép so sánh không chứng minh được gì",
        )
    report = check_structural_fidelity(reference, candidate)
    findings = tuple(
        Finding(item.code, item.severity, item.message, item.measured, item.expected)
        for item in report.findings
    )
    return CheckOutcome(
        kind="structural",
        applicable=True,
        passed=report.passed,
        findings=findings,
        detail=report.candidate_project_id,
        metrics=dict(report.metrics),
    )


def asset_records_from_storyboard(storyboard: dict[str, Any]) -> tuple[Any, ...]:
    """Resolve every declared entity asset to a checksummed manifest record."""
    from bkt_web.asset_manifest import asset_manifest
    from bkt_web.render_manifest import AssetRecord

    records = asset_manifest()["assets"]
    asset_ids = {
        str(component.get("attributes", {}).get("asset"))
        for scene in storyboard.get("scenes", [])
        for entity in scene.get("entities", [])
        for component in entity.get("components", [])
        if component.get("attributes", {}).get("asset")
    }
    result = []
    for asset_id in sorted(asset_ids):
        record = records.get(asset_id)
        _require(record is not None, f"storyboard dùng asset chưa có manifest: {asset_id}")
        provenance = record.get("provenance", {})
        license_spec = provenance.get("license")
        license_id = license_spec.get("id") if isinstance(license_spec, dict) else license_spec
        result.append(AssetRecord(
            asset_id=asset_id,
            version=record["version"],
            checksum=record["checksum"],
            provenance_kind=provenance["kind"],
            license=license_id,
        ))
    return tuple(result)


def fallback_records_from_storyboard(storyboard: dict[str, Any]) -> tuple[Any, ...]:
    """Preserve the render plan's fallback disclosure in the render manifest."""
    from bkt_web.render_manifest import FallbackRecord

    return tuple(FallbackRecord(
        fallback_id=item["fallback_id"],
        scene_id=item["scene_id"],
        type=item["type"],
        reason_code=item["reason_code"],
        disclosure=item["disclosure"],
        source_media_usage=item.get("source_media_usage", "none"),
        approved=not bool(item.get("approval_required", False)),
    ) for item in storyboard.get("render_plan", {}).get("fallbacks", []))


def renderer_plan_evidence(storyboard: dict[str, Any], renderer_id: str) -> CheckOutcome:
    """Fail closed when the renderer that produced pixels differs from the plan."""
    planned = sorted({
        str(item.get("renderer_id"))
        for item in storyboard.get("render_plan", {}).get("selections", [])
        if item.get("status") == "selected" and item.get("renderer_id")
    })
    if renderer_id in planned:
        return CheckOutcome(
            kind="custom", applicable=True, passed=True,
            detail=f"renderer thực tế {renderer_id} khớp render plan",
            metrics={"planned_renderer_count": float(len(planned))},
        )
    finding = Finding(
        "RENDERER_PLAN_MISMATCH", "fail",
        f"renderer thực tế {renderer_id} không nằm trong render plan: {planned}",
    )
    return CheckOutcome(
        kind="custom", applicable=True, passed=False, findings=(finding,),
        detail=f"renderer thực tế: {renderer_id}",
        metrics={"planned_renderer_count": float(len(planned))},
    )


# --- Manifest ------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ProjectEvidence:
    manifest: dict[str, Any]
    outcomes: tuple[CheckOutcome, ...]
    not_applicable: tuple[dict[str, str], ...]

    @property
    def completion_claim(self) -> str:
        return str(self.manifest.get("completion_claim"))

    @property
    def complete(self) -> bool:
        return self.completion_claim == "complete"

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": EVIDENCE_SCHEMA,
            "completion_claim": self.completion_claim,
            "manifest": self.manifest,
            "checks": [item.as_dict() for item in self.outcomes],
            "not_applicable": [dict(item) for item in self.not_applicable],
        }


def build_project_evidence(
    *,
    manifest_id: str,
    created_at: str,
    storyboard: dict[str, Any],
    renderers: Sequence[Any],
    outcomes: Sequence[CheckOutcome],
    assets: Sequence[Any] = (),
    fallbacks: Sequence[Any] = (),
    warnings: Sequence[Any] = (),
) -> ProjectEvidence:
    """Gấp bằng chứng vào manifest UV-603; phép kiểm rỗng không được tính."""
    from bkt_web.render_manifest import build_manifest

    fidelity = [item.as_fidelity_result() for item in outcomes if item.applicable]
    not_applicable = tuple(
        {"kind": item.kind, "reason": item.detail}
        for item in outcomes if not item.applicable
    )
    extra_warnings = list(warnings) + [
        {"code": "FIDELITY_NOT_APPLICABLE", "message": f"{item['kind']}: {item['reason']}"[:2000]}
        for item in not_applicable
    ]
    manifest = build_manifest(
        manifest_id=manifest_id,
        created_at=created_at,
        storyboard=storyboard,
        renderers=renderers,
        assets=assets,
        fallbacks=fallbacks,
        warnings=extra_warnings,
        fidelity=fidelity,
    )
    return ProjectEvidence(
        manifest=manifest.as_dict(),
        outcomes=tuple(outcomes),
        not_applicable=not_applicable,
    )


def write_manifest(folder: str | Path, evidence: ProjectEvidence, *, name: str = "manifest.json") -> Path:
    """Ghi manifest cạnh project và đọc lại để chắc chắn nó hợp lệ."""
    import json

    from bkt_web.render_manifest import validate_manifest

    target = Path(folder)
    target.mkdir(parents=True, exist_ok=True)
    path = target / name
    payload = evidence.as_dict()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    validate_manifest(json.loads(path.read_text(encoding="utf-8"))["manifest"])
    return path


def load_manifest(folder: str | Path, *, name: str = "manifest.json") -> dict[str, Any]:
    """Đọc lại manifest của một project, có validate."""
    import json

    from bkt_web.render_manifest import validate_manifest

    path = Path(folder) / name
    _require(path.is_file(), f"Không có manifest tại {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    _require(isinstance(payload, dict) and "manifest" in payload, "file manifest không đúng định dạng")
    validate_manifest(payload["manifest"])
    return payload


__all__ = [
    "BLANK_COLOURS",
    "CheckOutcome",
    "EVIDENCE_SCHEMA",
    "Finding",
    "FROZEN_SSIM",
    "MIN_VIDEO_BYTES",
    "ProjectEvidence",
    "RenderEvidenceError",
    "asset_records_from_storyboard",
    "build_project_evidence",
    "fallback_records_from_storyboard",
    "file_sha256",
    "geometric_evidence",
    "load_manifest",
    "renderer_plan_evidence",
    "structural_evidence",
    "verify_output_video",
    "write_manifest",
]
