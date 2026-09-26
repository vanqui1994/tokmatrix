# Interaction grammar (UV-203)

Module: `bkt_web/interaction_grammar.py` · Library: `bkt_web/schemas/interaction_composites.json` · Tests: `tests/test_interaction_grammar.py`

The grammar sits between semantic scene actions and the runtime built in UV-200 to UV-202. It expands composite actions into primitives, then compiles each primitive into absolute-time lifecycle events, constraint specs for the UV-202 solver, and material emission descriptors for UV-204. It renders nothing and mutates nothing.

## Primitives

| Group | Primitives | Compiles to |
|---|---|---|
| Contact | `touch`, `push`, `pull`, `drag`, `place` | `point_to_point` contact; `path_follow` for motion; `inside_container` for a bounded placement |
| Articulation | `open`, `close`, `fold` | a `joint_limit` motion envelope over the action plus a `joint_limit` hold from the action's end to the scene's end |
| Exchange | `give`, `receive`, `transfer` | component attach/detach events plus contact constraints; `transfer` splits contact at the midpoint (giver → receiver) |
| Material | `pour`, `scatter`, `spray` | an `Emission` with a seed derived from project, scene, action and material ids |

UV-201's lifecycle atoms (`attach`, `detach`, `pluck`, `cut-detach`, `join`, `grip`, `carry`, `place`, `release`) still compile through `component_lifecycle`; the grammar only adds to them.

## Addressing

`Action.actor_ids` must reference **entities** in Universal Storyboard v2, so the component or anchor that actually makes contact is carried in `parameters.actor_ref` (UV-201's `actor_component_id` is accepted as a synonym). `target_ids[0]` is the component or anchor being acted on.

An action whose refs do not resolve to the component tree — for instance a v1-derived action that still addresses whole entities — is **not** compiled into a contact that does not exist. It lands in `plan.skipped` / `needs_review` with a reason (`missing_actor_ref`, `actor_is_not_a_component_or_anchor`, `target_is_not_a_component_or_anchor`, `missing_component_target`, `exchange_target_must_be_a_component`). A recognised action that *does* resolve but is missing a required parameter fails loudly instead.

Which side moves follows the solver's rule and can be overridden with `parameters.movable` (`actor` | `target`). Defaults: the hand moves for `touch`/`push`/`pull`/`drag`, the object moves for `place` and the exchanges. In a motion the object follows the path (priority 120) and the hand follows the object (priority 90), so the two never fight.

## Chaining

Within a scene the compiler carries state between steps, in `(start, end, action_id)` order:

- a second `open`/`close`/`fold` on the same hinge starts from the angle the previous one held, not from the rig's authored rotation;
- a second `push`/`pull`/`drag` on the same object starts from where the previous motion ended.

Both defaults are overridable with `from_degrees` / `from`. Without a predecessor, the start value is sampled from the component tree at the action's start time, which is deterministic.

## Composites are data

A composite lives only in the library JSON:

```json
{
  "id": "harvest_fruit",
  "roles": ["farmer", "hand", "fruit", "basket"],
  "steps": [
    {"step_id": "touch", "type": "touch", "start_ratio": 0.0, "end_ratio": 0.25,
     "actor_roles": ["farmer"], "target_roles": ["fruit"],
     "parameters": {"actor_ref": {"$role": "hand"}}}
  ]
}
```

- Step times are **ratios of the composite interval**, so a composite is duration independent; absolute times come out as `composite.start + duration * ratio`.
- `{"$role": "..."}` resolves against `parameters.roles` on the scene action; `{"$param": "..."}` resolves against the composite action's own parameters. A missing role or param is an error, never a default.
- Expanded ids are `"<composite action id>:<step id>"`, and each step keeps the composite's provenance and analysis.
- A step may never name another composite, and steps must be in chronological order. Expansion is therefore single-pass and always terminates.

Seven sequences ship today: `harvest_fruit`, `water_plant`, `hand_over_item`, `store_in_box`, `push_object_aside`, `spray_crop`, `scatter_seed`. Adding another needs no Python — `tests/test_interaction_grammar.py::test_a_new_composite_needs_data_only_no_code` pins that property by compiling a composite defined entirely in a test-local library.

## Emissions

`pour`, `scatter` and `spray` produce an `Emission` (`material`, `source_ref`, `target_ref`, `start`, `end`, `rate`, `spread`, `seed`). The seed is `sha256(project_id|scene_id|action_id|material)` truncated to 32 bits, so a particle renderer built in UV-204 can reproduce the same emission at any timestamp without running from frame 0.

## API

```python
composite_library() -> dict                      # read-only copy of the shipped library
validate_composite_library(document) -> None
expand_actions(scene, library=None) -> list[Action]
compile_scene_interactions(scene, *, project_id="", library=None) -> InteractionPlan
InteractionPlan.solver(max_passes=8) -> ConstraintSolver
solve_scene_interactions(storyboard, scene_id, seconds) -> dict   # JSON-safe snapshot + plan
```

`solve_scene_interactions` returns the UV-202 solution (`components`, `results`, `conflicts`) plus `plan` with the expanded primitives, events, constraints, emissions and `needs_review`.
