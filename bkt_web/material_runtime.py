"""Deterministic materials and particles for Universal Storyboard v2 (UV-204).

Every particle is a closed-form function of its own spawn time, so sampling a
frame never needs the frames before it: ``sample(t)`` is O(live particles) and
gives byte-identical output whether the caller seeks forward, backward or at
random.  Randomness comes from a splitmix64 hash of the emitter seed, the
particle index and a channel number — no global RNG, no wall clock, no state
carried between frames.

The emitter seed itself is derived from the project, entity and action ids, so
the same storyboard always produces the same spray, and two emitters in the
same scene never share a stream.

Containers track how much of a settling material landed inside their bounds,
which gives a validated fill level and an explicit spill instead of a silently
overflowing bucket.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable


MATERIAL_SCHEMA = "tokmatrix.material-catalog/v1"
MATERIAL_CATALOG_PATH = Path(__file__).resolve().parent / "schemas" / "material_catalog.json"

MAX_PARTICLES = 20_000
_LANDING_ITERATIONS = 64
_MASK64 = (1 << 64) - 1

_REQUIRED_FIELDS = {
    "gravity": (-100_000.0, 100_000.0),
    "drag": (0.0, 100.0),
    "lifetime_seconds": (1e-6, 3600.0),
    "spawn_rate": (1e-6, 10_000.0),
    "initial_speed": (0.0, 100_000.0),
    "speed_variance": (0.0, 1.0),
    "cone_degrees": (0.0, 360.0),
    "size": (1e-6, 10_000.0),
    "size_variance": (0.0, 1.0),
    "volume_per_particle": (0.0, 1_000.0),
}
_PHASES = {"liquid", "granular", "gas"}


class MaterialError(ValueError):
    """Raised when a material, emitter or container cannot be sampled safely."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise MaterialError(message)


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise MaterialError(f"{label} phải là số hữu hạn")
    return float(value)


# --- Deterministic noise -------------------------------------------------


def _splitmix64(value: int) -> int:
    value = (value + 0x9E3779B97F4A7C15) & _MASK64
    value ^= value >> 30
    value = (value * 0xBF58476D1CE4E5B9) & _MASK64
    value ^= value >> 27
    value = (value * 0x94D049BB133111EB) & _MASK64
    return value ^ (value >> 31)


def unit_random(seed: int, index: int, channel: int) -> float:
    """A stable value in ``[0,1)`` for one particle and one channel.

    Pure integer math, so the value does not depend on the platform's float
    behaviour, the iteration order or anything sampled before it.
    """
    mixed = _splitmix64((seed & _MASK64) ^ _splitmix64((index << 8) ^ channel))
    return (mixed >> 11) / float(1 << 53)


def _signed_random(seed: int, index: int, channel: int) -> float:
    return unit_random(seed, index, channel) * 2.0 - 1.0


def emitter_seed(project_id: str, entity_id: str, action_id: str, material: str) -> int:
    """Derive an emitter's 32-bit seed from project, entity and action ids."""
    for label, value in (("project_id", project_id), ("entity_id", entity_id), ("action_id", action_id), ("material", material)):
        _require(isinstance(value, str), f"emitter_seed.{label} phải là chuỗi")
    payload = f"{project_id}|{entity_id}|{action_id}|{material}".encode("utf-8")
    return int(hashlib.sha256(payload).hexdigest()[:8], 16)


# --- Catalog -------------------------------------------------------------


def validate_material_catalog(document: Any) -> None:
    """Check a material catalog document without touching the runtime."""
    _require(isinstance(document, dict), "material catalog phải là object")
    _require(document.get("schema") == MATERIAL_SCHEMA, "material catalog schema không được hỗ trợ")
    materials = document.get("materials")
    _require(isinstance(materials, dict) and materials, "material catalog cần ít nhất một material")
    for material_id, spec in materials.items():
        label = f"material.{material_id}"
        _require(isinstance(spec, dict), f"{label} phải là object")
        _require(spec.get("id") == material_id, f"{label}: id không khớp")
        _require(spec.get("phase") in _PHASES, f"{label}.phase không hợp lệ")
        _require(isinstance(spec.get("settles"), bool), f"{label}.settles phải là boolean")
        for key, (low, high) in _REQUIRED_FIELDS.items():
            value = _finite(spec.get(key), f"{label}.{key}")
            _require(low <= value <= high, f"{label}.{key} nằm ngoài khoảng [{low}, {high}]")
        if not spec["settles"]:
            _require(spec["volume_per_particle"] == 0, f"{label}: vật liệu không lắng đọng thì không có thể tích")


@lru_cache(maxsize=1)
def _catalog() -> dict[str, Any]:
    document = json.loads(MATERIAL_CATALOG_PATH.read_text(encoding="utf-8"))
    validate_material_catalog(document)
    return document


def material_catalog() -> dict[str, Any]:
    """Read-only copy of the shipped material catalog."""
    return copy.deepcopy(_catalog())


def material(material_id: str, catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    """One material's physics, as a copy."""
    document = catalog if catalog is not None else _catalog()
    if catalog is not None:
        validate_material_catalog(document)
    spec = document["materials"].get(material_id)
    _require(spec is not None, f"Material chưa có trong catalog: {material_id}")
    return copy.deepcopy(spec)


SUPPORTED_MATERIALS = tuple(sorted(_catalog()["materials"]))


# --- Emitter -------------------------------------------------------------


Origin = dict[str, float] | Callable[[float], dict[str, float]]


@dataclass(frozen=True, slots=True)
class Particle:
    index: int
    x: float
    y: float
    vx: float
    vy: float
    age: float
    size: float
    settled: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "x": self.x,
            "y": self.y,
            "vx": self.vx,
            "vy": self.vy,
            "age": self.age,
            "size": self.size,
            "settled": self.settled,
        }


@dataclass(frozen=True, slots=True)
class EmitterSample:
    emitter_id: str
    material: str
    seconds: float
    spawned: int
    particles: tuple[Particle, ...]
    settled: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "emitter_id": self.emitter_id,
            "material": self.material,
            "seconds": self.seconds,
            "spawned": self.spawned,
            "settled": self.settled,
            "particles": [item.as_dict() for item in self.particles],
        }


@dataclass(frozen=True, slots=True)
class FillReport:
    container_id: str
    emitter_id: str
    seconds: float
    captured: int
    volume: float
    capacity: float
    level: float
    spilled_volume: float
    overflowed: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "container_id": self.container_id,
            "emitter_id": self.emitter_id,
            "seconds": self.seconds,
            "captured": self.captured,
            "volume": self.volume,
            "capacity": self.capacity,
            "level": self.level,
            "spilled_volume": self.spilled_volume,
            "overflowed": self.overflowed,
        }


@dataclass(frozen=True, slots=True)
class Container:
    """A bounded region that collects settling material."""

    container_id: str
    min_x: float
    min_y: float
    max_x: float
    max_y: float
    capacity: float

    def __post_init__(self) -> None:
        _require(isinstance(self.container_id, str) and bool(self.container_id), "container_id không hợp lệ")
        for name in ("min_x", "min_y", "max_x", "max_y", "capacity"):
            object.__setattr__(self, name, _finite(getattr(self, name), f"container.{name}"))
        _require(self.min_x <= self.max_x and self.min_y <= self.max_y, f"{self.container_id}: bounds không hợp lệ")
        _require(self.capacity > 0, f"{self.container_id}: capacity phải lớn hơn 0")

    @property
    def surface_y(self) -> float:
        # Screen space: the top edge of the box is where material lands.
        return self.min_y

    def contains(self, x: float, y: float) -> bool:
        return self.min_x <= x <= self.max_x and self.min_y <= y <= self.max_y

    @classmethod
    def from_value(cls, value: Any) -> "Container":
        if isinstance(value, cls):
            return value
        _require(isinstance(value, dict), "container phải là object")
        allowed = {"container_id", "min_x", "min_y", "max_x", "max_y", "capacity"}
        unknown = set(value) - allowed
        _require(not unknown, f"container có field lạ: {sorted(unknown)}")
        return cls(**value)


@dataclass(frozen=True, slots=True)
class EmitterSpec:
    emitter_id: str
    material: str
    start: float
    end: float
    seed: int
    rate_scale: float = 1.0
    spread_scale: float = 1.0
    direction_degrees: float = 90.0
    ground_y: float | None = None
    physics: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _require(isinstance(self.emitter_id, str) and bool(self.emitter_id), "emitter_id không hợp lệ")
        _require(isinstance(self.material, str) and bool(self.material), "emitter.material không hợp lệ")
        object.__setattr__(self, "start", _finite(self.start, "emitter.start"))
        object.__setattr__(self, "end", _finite(self.end, "emitter.end"))
        _require(self.start >= 0, "emitter.start không được âm")
        _require(self.end >= self.start, "emitter.end không được nhỏ hơn start")
        _require(not isinstance(self.seed, bool) and isinstance(self.seed, int) and self.seed >= 0, "emitter.seed phải là số nguyên không âm")
        object.__setattr__(self, "rate_scale", _finite(self.rate_scale, "emitter.rate_scale"))
        object.__setattr__(self, "spread_scale", _finite(self.spread_scale, "emitter.spread_scale"))
        object.__setattr__(self, "direction_degrees", _finite(self.direction_degrees, "emitter.direction_degrees"))
        _require(self.rate_scale > 0, "emitter.rate_scale phải lớn hơn 0")
        _require(0 <= self.spread_scale <= 4, "emitter.spread_scale cần trong [0,4]")
        if self.ground_y is not None:
            object.__setattr__(self, "ground_y", _finite(self.ground_y, "emitter.ground_y"))
        object.__setattr__(self, "physics", copy.deepcopy(self.physics))


def _axis_position(position: float, velocity: float, gravity: float, drag: float, dt: float) -> tuple[float, float]:
    """Closed-form position and velocity under constant gravity + linear drag."""
    if drag <= 1e-9:
        return position + velocity * dt + 0.5 * gravity * dt * dt, velocity + gravity * dt
    terminal = gravity / drag
    decay = math.exp(-drag * dt)
    moved = terminal * dt + (velocity - terminal) * (1.0 - decay) / drag
    return position + moved, terminal + (velocity - terminal) * decay


class MaterialEmitter:
    """One emitter: deterministic particles for a material over an interval."""

    def __init__(
        self,
        spec: EmitterSpec | dict[str, Any],
        origin: Origin,
        *,
        catalog: dict[str, Any] | None = None,
        max_particles: int = MAX_PARTICLES,
    ) -> None:
        self._spec = spec if isinstance(spec, EmitterSpec) else self._spec_from(spec)
        physics = material(self._spec.material, catalog)
        physics.update(copy.deepcopy(self._spec.physics))
        validate_material_catalog({"schema": MATERIAL_SCHEMA, "materials": {self._spec.material: physics}})
        self._physics = physics
        self._origin = origin
        _require(callable(origin) or isinstance(origin, dict), "origin phải là điểm hoặc hàm theo thời gian")
        if isinstance(origin, dict):
            self._static_origin: dict[str, float] | None = {
                "x": _finite(origin.get("x", 0), "origin.x"),
                "y": _finite(origin.get("y", 0), "origin.y"),
            }
        else:
            self._static_origin = None
        _require(not isinstance(max_particles, bool) and isinstance(max_particles, int) and 0 < max_particles <= MAX_PARTICLES, "max_particles không hợp lệ")
        self._max_particles = max_particles
        total = self._spawned_by(self._spec.end)
        _require(
            total <= max_particles,
            f"{self._spec.emitter_id}: emitter sinh {total} hạt, vượt giới hạn {max_particles}",
        )

    @staticmethod
    def _spec_from(value: dict[str, Any]) -> EmitterSpec:
        _require(isinstance(value, dict), "emitter spec phải là object")
        allowed = {"emitter_id", "material", "start", "end", "seed", "rate_scale", "spread_scale", "direction_degrees", "ground_y", "physics"}
        unknown = set(value) - allowed
        _require(not unknown, f"emitter spec có field lạ: {sorted(unknown)}")
        return EmitterSpec(**value)

    @property
    def spec(self) -> EmitterSpec:
        return self._spec

    @property
    def physics(self) -> dict[str, Any]:
        return copy.deepcopy(self._physics)

    @property
    def rate(self) -> float:
        return self._physics["spawn_rate"] * self._spec.rate_scale

    def _spawned_by(self, seconds: float) -> int:
        """How many particles exist by ``seconds`` — emission starts at index 0."""
        if seconds < self._spec.start:
            return 0
        elapsed = min(seconds, self._spec.end) - self._spec.start
        return int(math.floor(elapsed * self.rate)) + 1

    def spawn_time(self, index: int) -> float:
        return self._spec.start + index / self.rate

    def origin_at(self, seconds: float) -> dict[str, float]:
        if self._static_origin is not None:
            return dict(self._static_origin)
        point = self._origin(seconds)  # type: ignore[operator]
        _require(isinstance(point, dict), "origin callable phải trả về object có x và y")
        return {"x": _finite(point.get("x", 0), "origin.x"), "y": _finite(point.get("y", 0), "origin.y")}

    def _launch(self, index: int) -> tuple[float, float, float]:
        physics = self._physics
        cone = math.radians(physics["cone_degrees"] * self._spec.spread_scale)
        angle = math.radians(self._spec.direction_degrees) + _signed_random(self._spec.seed, index, 1) * cone * 0.5
        speed = physics["initial_speed"] * (1.0 + _signed_random(self._spec.seed, index, 2) * physics["speed_variance"])
        size = physics["size"] * (1.0 + _signed_random(self._spec.seed, index, 3) * physics["size_variance"])
        return angle, max(speed, 0.0), max(size, 1e-6)

    def _landing_time(self, origin_y: float, vy: float, ground_y: float) -> float | None:
        """First time the particle reaches the ground, or ``None`` within its life."""
        physics = self._physics
        gravity, drag, lifetime = physics["gravity"], physics["drag"], physics["lifetime_seconds"]
        if origin_y >= ground_y:
            return 0.0
        end_y, _velocity = _axis_position(origin_y, vy, gravity, drag, lifetime)
        if end_y < ground_y:
            return None
        low, high = 0.0, lifetime
        # Fixed-iteration bisection: bounded work, no convergence loop.
        for _step in range(_LANDING_ITERATIONS):
            middle = (low + high) / 2
            position, _velocity = _axis_position(origin_y, vy, gravity, drag, middle)
            if position < ground_y:
                low = middle
            else:
                high = middle
        return high

    def particle_at(self, index: int, seconds: float) -> Particle | None:
        """One particle's state, computed only from its own spawn time."""
        spawn = self.spawn_time(index)
        if spawn > seconds or spawn > self._spec.end:
            return None
        dt = seconds - spawn
        physics = self._physics
        if dt > physics["lifetime_seconds"]:
            return None
        origin = self.origin_at(spawn)
        angle, speed, size = self._launch(index)
        vx0, vy0 = speed * math.cos(angle), speed * math.sin(angle)
        ground_y = self._spec.ground_y
        landing = None
        if physics["settles"] and ground_y is not None:
            landing = self._landing_time(origin["y"], vy0, ground_y)
        elapsed = dt if landing is None else min(dt, landing)
        x, vx = _axis_position(origin["x"], vx0, 0.0, physics["drag"], elapsed)
        y, vy = _axis_position(origin["y"], vy0, physics["gravity"], physics["drag"], elapsed)
        settled = landing is not None and dt >= landing
        if settled:
            y, vx, vy = ground_y if ground_y is not None else y, 0.0, 0.0
        return Particle(index=index, x=x, y=y, vx=vx, vy=vy, age=dt, size=size, settled=settled)

    def landing_point(self, index: int) -> dict[str, float] | None:
        """Where a settling particle comes to rest, or ``None`` if it never does."""
        ground_y = self._spec.ground_y
        if not self._physics["settles"] or ground_y is None:
            return None
        spawn = self.spawn_time(index)
        if spawn > self._spec.end:
            return None
        origin = self.origin_at(spawn)
        angle, speed, _size = self._launch(index)
        vy0 = speed * math.sin(angle)
        landing = self._landing_time(origin["y"], vy0, ground_y)
        if landing is None:
            return None
        x, _vx = _axis_position(origin["x"], speed * math.cos(angle), 0.0, self._physics["drag"], landing)
        return {"x": x, "y": ground_y, "time": spawn + landing}

    def sample(self, seconds: float) -> EmitterSample:
        """Every live particle at an absolute timestamp."""
        time = _finite(seconds, "seconds")
        _require(time >= 0, "seconds không được âm")
        spawned = self._spawned_by(time)
        particles: list[Particle] = []
        settled = 0
        for index in range(spawned):
            particle = self.particle_at(index, time)
            if particle is None:
                continue
            particles.append(particle)
            settled += int(particle.settled)
        return EmitterSample(
            emitter_id=self._spec.emitter_id,
            material=self._spec.material,
            seconds=time,
            spawned=spawned,
            particles=tuple(particles),
            settled=settled,
        )

    def fill_report(self, container: Container | dict[str, Any], seconds: float) -> FillReport:
        """Validated fill level and spill for one container at a timestamp."""
        box = Container.from_value(container)
        time = _finite(seconds, "seconds")
        _require(time >= 0, "seconds không được âm")
        ground_y = self._spec.ground_y
        _require(
            self._physics["settles"] and ground_y is not None,
            f"{self._spec.emitter_id}: chỉ vật liệu lắng đọng có ground_y mới tính được fill level",
        )
        assert ground_y is not None
        _require(
            box.min_y <= ground_y <= box.max_y,
            f"{box.container_id}: ground_y phải nằm trong bounds của container",
        )
        captured = 0
        for index in range(self._spawned_by(time)):
            landing = self.landing_point(index)
            if landing is None or landing["time"] > time:
                continue
            if box.contains(landing["x"], landing["y"]):
                captured += 1
        volume = captured * self._physics["volume_per_particle"]
        spilled = max(0.0, volume - box.capacity)
        return FillReport(
            container_id=box.container_id,
            emitter_id=self._spec.emitter_id,
            seconds=time,
            captured=captured,
            volume=volume,
            capacity=box.capacity,
            level=min(1.0, volume / box.capacity),
            spilled_volume=spilled,
            overflowed=spilled > 0,
        )


def emitter_from_emission(
    emission: Any,
    origin: Origin,
    *,
    ground_y: float | None = None,
    direction_degrees: float = 90.0,
    catalog: dict[str, Any] | None = None,
) -> MaterialEmitter:
    """Build an emitter from a UV-203 :class:`Emission` (or any dict like it)."""
    read = emission.get if isinstance(emission, dict) else lambda key, default=None: getattr(emission, key, default)
    spec = EmitterSpec(
        emitter_id=read("emission_id"),
        material=read("material"),
        start=read("start"),
        end=read("end"),
        seed=read("seed"),
        rate_scale=read("rate", 1.0),
        spread_scale=read("spread", 1.0),
        direction_degrees=direction_degrees,
        ground_y=ground_y,
    )
    return MaterialEmitter(spec, origin, catalog=catalog)


def sample_emitters(emitters: list[MaterialEmitter], seconds: float) -> dict[str, dict[str, Any]]:
    """Snapshot several emitters at one timestamp, keyed by emitter id."""
    ids = [item.spec.emitter_id for item in emitters]
    _require(len(ids) == len(set(ids)), "emitter_id bị trùng")
    return {item.spec.emitter_id: item.sample(seconds).as_dict() for item in sorted(emitters, key=lambda item: item.spec.emitter_id)}


__all__ = [
    "Container",
    "EmitterSample",
    "EmitterSpec",
    "FillReport",
    "MATERIAL_SCHEMA",
    "MAX_PARTICLES",
    "MaterialEmitter",
    "MaterialError",
    "Particle",
    "SUPPORTED_MATERIALS",
    "emitter_from_emission",
    "emitter_seed",
    "material",
    "material_catalog",
    "sample_emitters",
    "unit_random",
    "validate_material_catalog",
]
