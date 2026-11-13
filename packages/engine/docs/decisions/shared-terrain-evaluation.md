---
read_if:
  - changing Site terrain contributions or shared terrain evaluation
  - changing terrain worker boundaries, admission or canonical save ownership
  - separating terrain computation from gameplay ownership
---

# Shared terrain evaluation

## Decision

A Site contributes resolved terrain data rather than evaluating terrain itself.
The plan is cloneable and function-free so a worker can receive it without
rebuilding gameplay state. One evaluator serves every caller, preventing separate
synchronous and asynchronous terrain formulas. See `src/core/terrainPlan.ts`,
`TerrainPlan`; `src/core/site.ts`, `Site`; and `src/core/terrainEvaluator.ts`,
`createTerrainEvaluator`.

Planning and gameplay ownership remain on the main thread. Content owns tuning;
the plan carries the admitted content's resolved terrain choices. The plan is
derived runtime data, not a second save format.

Rectangle-distance predicates and ground-query sampling are not interchangeable:
sharing evaluation must not erase their distinct coordinate and boundary semantics.
Computation alone does not grant ownership of terrain arrival, resident edits or
save state.
