---
read_if:
  - you're reviewing why the default Deadvox unit suite was reduced
  - you're revisiting a suite reduction after a budget overrun or related defect
  - you're running a milestone's default-suite time check
---

# Default Deadvox unit-suite reductions

The default Deadvox unit suite exceeded its budget. BR chose named cuts without changing the budget (d92, 2026-10-06, option B). The absolute budget value and the host's timing procedure remain in the lead's host notes; the milestone growth check is below.

Each cut keeps the assertion defining its protected property and removes only repeated or incidental work. Worker policy is unchanged; timeouts remain proportional to their work. Follow `AGENTS.md`, “Tests,” when recording the coverage given up and its remaining guard.

## Decision record

- Narrowed sampled mesher layouts; remaining guard: see `test/mesher.test.ts`, “draws the same faces as plain face culling (random chunks)”.
- Narrowed sampled occlusion terrains; remaining guard: see `test/occlusion.test.ts`, “gives every merged-quad corner the per-vertex value (random terrain)”.
- Gave up repeated Hamlet order and seed cases; remaining guard: see `test/hamlet.test.ts`, “generates the same in any chunk order”.
- Shortened the idle/stroll horizon; remaining guard: see `test/zombies.test.ts`, “uses seeded idle and straight stroll intervals during a sustained sample”.
- Gave up low-impulse and post-touchdown synthetic dismemberment coverage; remaining guards: see `test/zombies.test.ts`, “scales launch distance monotonically through 40 N·s and keeps weapon distances bounded”, and `test/severedEnergy.test.ts`, “caps real bat launches and dissipates each bounce across five zombie seeds”.
- No content behavior was given up; remaining guard: see `test/content.test.ts`, “base content has no issues”.
- Ordinary save and scheduler cases gave up incidental full-world fixture coverage; remaining guard: see `test/snapshot-continuation.test.ts`, “detects omission of simulation, world, scheduler, inventory, and audio state”.
- Gave up the duplicate deep non-rest continuation comparison; remaining guards: see `test/snapshot-continuation.test.ts`, “deeply matches N steps with K/save/load/N−K (active rest)”, “preserves an active-sleep interruption emitted between frames across save/load”, and “preserves a pending sleep interruption across a paused snapshot and load”.
- No save-format behavior was given up; remaining guard: see `test/snapshot-format.test.ts`, “round-trips an edited hamlet byte-exactly and continues deterministically from the restored bytes”.

Revisit these cuts when an issue reports another default-suite budget overrun or a defect that a given-up case would have caught. Restore the affected case when responding to such a defect, and link the issue.

## Milestone growth check

For each milestone, compare the previous milestone's merge commit with the new head using three interleaved default-suite runs per head, each in its own isolated run. Treat median growth beyond the run-to-run spread as an overrun, and record per-file deltas. The absolute budget remains the quiet-host target.

On a busy shared host, absolute duration moves with load and can read over budget without a milestone regression. The interleaved d103 comparison between d92's merge and #304's merge found no suite-level median growth despite over-budget absolute readings. Module import accounted for a large share, but its evaluation cost was spread across the graph under per-file isolation, with no single module dominating; Vitest's `experimental.importDurations` reports the module profile. d103 found the candidate import savings small relative to that whole graph, so it changed no tests or runtime imports.

Decided (BR, 2026-10-06): measure each milestone's growth against the previous milestone's merge and cut loading time with no test loss. BR: "agreed; do as suggested".

In d103, the lead held the renderer-edge import split and `inputLiterals` prefilter: their expected savings were small against the whole import graph, the split changes runtime imports and the bundle, and the prefilter risks weakening the input-registry guard. Revisit either only if BR asks for it.
