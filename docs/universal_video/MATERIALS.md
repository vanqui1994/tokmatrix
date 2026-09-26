# Materials and deterministic particles (UV-204)

Module: `bkt_web/material_runtime.py` · Catalog: `bkt_web/schemas/material_catalog.json` · Tests: `tests/test_material_runtime.py`

Particles for the seven materials the plan lists — `water`, `soil`, `seed`, `fertilizer`, `sap`, `smoke`, `dust` — plus validated container fill and spill. Renderer-neutral: the catalog carries physics, not colour, sprites or blending.

## Seek independence

Each particle's state is a closed-form function of its own spawn time, so `sample(t)` never needs the frames before it. An emitter sampled at `t = 2.7` gives the same bytes whether it is the first call, the last of a forward playthrough, or reached by seeking backwards.

- Spawn time of particle `i` is `start + i / rate`; the particle exists while `0 <= t - spawn <= lifetime` and `spawn <= end`.
- Position under constant gravity and linear drag has a closed form (`terminal = gravity/drag`, exponential decay); with `drag = 0` it reduces to the ballistic form.
- The one non-closed-form step, the ground-landing time under drag, is a **fixed 64-iteration bisection** — bounded work, no convergence loop, identical every call.
- The emitter's origin is sampled at each particle's spawn time, so a moving source (a tipping watering can) leaves a correct trail. Pass a point for a static source or a callable `seconds -> {x, y}` to track the component tree.
- Screen space: `+y` points down. A positive `gravity` falls, a negative one rises; smoke and dust are authored with `direction_degrees: -90`.

## Seeds

```python
emitter_seed(project_id, entity_id, action_id, material) -> int   # 32-bit
```

Randomness is a splitmix64 hash of `(seed, particle index, channel)` — pure integer math, no global RNG, no wall clock, no platform-dependent float behaviour. Channels are angle (1), speed (2) and size (3).

UV-203 delegates to this function, so an `Emission` from the interaction grammar and a `MaterialEmitter` built from it share one particle stream. `emitter_from_emission(emission, origin, ground_y=...)` does that wiring.

## Containers, fill and spill

A `Container` is a bounds rectangle plus a `capacity` in the same abstract volume unit as the catalog's `volume_per_particle`. `fill_report(container, seconds)` counts the settling particles whose landing point lies inside the bounds by that timestamp and returns:

| Field | Meaning |
|---|---|
| `captured` | particles that landed inside the bounds |
| `volume` | `captured * volume_per_particle` |
| `capacity`, `level` | capacity, and `min(1, volume/capacity)` |
| `spilled_volume` | `max(0, volume - capacity)` |
| `overflowed` | whether anything spilled |

Excess never disappears quietly: a full container reports `level = 1.0` **and** a non-zero `spilled_volume`. Asking for a fill level from a non-settling material (smoke, dust) or from an emitter without `ground_y` is an error, not a zero, and the container's bounds must contain `ground_y`.

## Validation

`validate_material_catalog` rejects an unknown schema, a bad phase, a non-finite or out-of-range number, and a non-settling material that claims a volume. `EmitterSpec` rejects a negative start, an end before the start, a negative seed, a non-positive rate scale and unknown fields. An emitter whose interval would spawn more than `MAX_PARTICLES` (20 000) is refused **at construction**, before any frame is rendered.

## API

```python
material_catalog() -> dict                     # read-only copy
material(material_id, catalog=None) -> dict
validate_material_catalog(document) -> None
emitter_seed(project_id, entity_id, action_id, material) -> int
MaterialEmitter(spec, origin, *, catalog=None, max_particles=20_000)
  .sample(seconds) -> EmitterSample            # every live particle
  .particle_at(index, seconds) -> Particle | None
  .landing_point(index) -> {x, y, time} | None
  .fill_report(container, seconds) -> FillReport
emitter_from_emission(emission, origin, *, ground_y=None, direction_degrees=90.0)
sample_emitters(emitters, seconds) -> dict     # JSON-safe, keyed by emitter id
```

A per-emitter `physics` override on `EmitterSpec` replaces catalog fields for one emitter and is validated with the same rules as the catalog.
