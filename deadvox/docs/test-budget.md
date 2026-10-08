---
read_if:
  - you're reviewing why the default Deadvox unit suite was reduced
  - you're revisiting a suite reduction after a budget overrun or related defect
  - you're running a milestone's default-suite time check
---

# Default Deadvox unit-suite reductions

The default Deadvox unit suite exceeded its budget. The d92 cuts reduce repeated
and incidental work without changing the budget. The absolute budget value and
the host's timing procedure remain in the lead's host notes; the milestone
growth check is below.

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

For #318, neither whole-tree scan guard carries the whole tree under one test timeout. Parsing is spread across per-file cases, and the mutation checks reuse the collected graph instead of re-collecting it. See `test/inputLiterals.test.ts` and `test/simulationFingerprint.test.ts`, `mutateSimulationSource`.

## Milestone growth check

For each milestone, compare the previous milestone's merge commit with the new head using three interleaved default-suite runs per head, each in its own isolated run. Treat median growth beyond the run-to-run spread as an overrun, and record per-file deltas. The absolute budget remains the quiet-host target.

When #380 reports registry checks approaching Vitest's default timeout, give each check the smallest registry sources that exercise its assertion. In `test/content.test.ts`, keep `baseBuild` and `baseRegistry` for read-only checks of authored content, use fixtures such as `recipeDependencies` for independent reference rules, and retain full `withBase` builds where the assertion needs actual authored content or an overlay. This keeps base-integration coverage without charging unrelated registry checks for the full content pack.

On a busy shared host, absolute duration moves with load and can read over budget without a milestone regression. The interleaved d103 comparison between d92's merge and #304's merge found no suite-level median growth despite over-budget absolute readings. Module import accounted for a large share, but its evaluation cost was spread across the graph under per-file isolation, with no single module dominating; Vitest's `experimental.importDurations` reports the module profile. d103 found the candidate import savings small relative to that whole graph, so it changed no tests or runtime imports.

Measure each milestone's growth against the previous milestone's merge and cut
loading time without losing test coverage. Defer the renderer-edge import split
and `inputLiterals` prefilter: their expected savings are small against the whole
import graph, the split changes runtime imports and the bundle, and the prefilter
risks weakening the input-registry guard. Revisit either only if BR asks for it.
