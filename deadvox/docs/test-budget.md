---
read_if:
  - you're reviewing why the default Deadvox unit suite was reduced
  - you're revisiting a cut after a budget overrun or related defect
  - you're measuring suite growth between milestones
---

# Default Deadvox unit-suite reductions

The suite keeps its worker policy and timeout rules; reductions target repeated or incidental work while preserving an assertion for each protected property. Absolute wall time depends on host capacity, so this document tracks milestone growth rather than a host-specific budget.

## Retained coverage

- Mesher and occlusion samples are narrower; property guards still compare merged output with the simpler construction.
- Hamlet order, zombie idle horizons and dismemberment cases use targeted samples; remaining tests protect order invariance, seeded intervals, bounded launches and energy dissipation.
- Save/scheduler fixtures no longer repeat full-world incidental data; continuation tests protect full-state restoration and interruption across snapshots, while format tests protect edited-world round trips.
- No content behavior was removed; base validation remains the guard.

See the named tests in `test/mesher.test.ts`, `test/occlusion.test.ts`, `test/hamlet.test.ts`, `test/zombies.test.ts`, `test/severedEnergy.test.ts`, `test/snapshot-continuation.test.ts` and `test/snapshot-format.test.ts`.

Revisit a cut only when an issue reports a related defect or suite overrun; restore the case that protects that property and link the trigger. Do not broaden fixtures or assert drifting content to compensate.

## Milestone growth

Compare the previous milestone with the new head using interleaved runs, each isolated. Treat median growth beyond the run-to-run spread as an overrun and record the per-file deltas. Absolute duration may move with host load; it is not evidence of milestone regression by itself.

When a registry check approaches the test timeout, use the smallest registry source that exercises its assertion. Preserve full base/overlay builds where the assertion needs integration behavior. See `test/content.test.ts`, `baseBuild`, `baseRegistry` and `withBase`.

Import-time work is spread across the graph. Avoid runtime-import splits or prefilters unless measured savings justify the bundle and coverage risk; revisit if BR asks for it.
