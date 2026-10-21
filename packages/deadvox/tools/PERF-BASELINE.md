---
read_if:
  - you're collecting or comparing a real-GPU Deadvox performance baseline
  - you're changing the performance harness or interpreting its evidence
  - you're tracing browser presentation gaps or comparing query-free frame cadence
  - you're diagnosing browser backend fallback or attributing texture uploads
  - you're deciding whether a rejected measurement can support a performance claim
  - you're reducing main-thread inventory or collision work without changing simulation rules
---

# Real-GPU baseline

Performance changes need the same workload on real hardware: software GL does not predict
GPU cost, and lower cost does not authorize a different look. See `packages/deadvox/GRAPHICS.md`,
"Look decisions". Keep machine evidence outside the repository; it is a comparison artifact,
not a portable performance promise.

See `packages/deadvox/tools/perf-baseline.mjs`, `run`, for collection and the same file's usage
message for invocation. Workloads and sampling policy belong in
`packages/deadvox/src/config/perf-baseline.jsonnet`, so comparisons can share an explicit fixture.
Each run gets a fresh browser context so an operator's saved preferences cannot change the
comparison workload. The measurement build is unminified to retain useful profiler symbols.
Do not publish diagnostic bundles as ordinary game builds.

Fixed input does not promise bit-identical AI trajectories: frame cadence still controls
live simulation time. Inspect scene evidence before comparing runs; a repeatable camera
alone cannot establish that the intended workload was exercised.

Whole-frame and segmented GPU timers run separately because elapsed queries cannot nest.
Alternating order reduces drift bias; it cannot eliminate driver overhead from segment
boundaries. Rank passes using segmented means, including zero on frames without a pass,
but gate total cost with whole queries. Do not add CPU and GPU timings as if they were
serial budget components. Frame intervals include presentation and browser scheduling;
main-thread frame timing covers the game callback, not all browser tasks. CPU profiles run
separately without GPU queries, so profiling overhead cannot contaminate the GPU baseline.

A shader compile failure can leave geometry undrawn without throwing a page exception. Treat browser console errors as collection failures too; otherwise missing work can masquerade as a GPU improvement. See `packages/deadvox/tools/perf-baseline.mjs`, `run`.

Compare only like measurement builds. Reject invalid measurements rather than retrying
until a run succeeds: selecting only successful attempts hides instability and can make an
unreliable workload appear to meet its budget. Investigate the rejected attempt before
collecting replacement evidence. See `packages/deadvox/tools/perf-baseline.mjs`, `run`, for the
collection checks rather than treating a separate prose checklist as the acceptance contract.

See `packages/deadvox/tools/perf-baseline-stats.mjs`, `rankProfile`, for CPU attribution. Categories
are inclusive stack-based samples, mutually exclusive, not exact subsystem timers. Worker
execution is outside this main-thread profile. Native/unattributed samples are not AI,
streaming or idle evidence. Preserve raw profiles so a ranking can be investigated instead
of treating incomplete sampling as proof that a subsystem is free.

See `packages/deadvox/tools/perf-baseline-stats.mjs`, `summarize`, for the JSON summary contract.
Scene attribution must be independent of post effects so plain rendering cannot be mistaken
for an undrawn workload. The measurement adapter reuses the enclosing GPU probe for resolution
adaptation because elapsed queries cannot nest. Record the effective scene scale with each frame so delayed
results from an older size cannot steer the resized target. Warm-up must allow resolution to
settle before comparing sustained-load costs; see `packages/deadvox/tools/perf-baseline-browser.mjs`,
`install`, and `packages/deadvox/src/config/perf-baseline.jsonnet`.

## Browser interval attribution

A short game callback and a short GPU query do not account for the interval between animation
frames. Browser scheduling, worker callbacks, compositing and presentation can consume or defer
the rest. Capture a browser-wide trace rather than treating a main-thread CPU profile's
unattributed samples as waiting. See `packages/deadvox/tools/perf-baseline.mjs`, `run`, and
`packages/deadvox/tools/perf-baseline-trace.mjs`, `startTrace`. Trace capture is restricted to
orbit workloads so warm-up and the sampled window have separate boundaries.

Tracing is a separate diagnostic condition: its overhead must not be folded into an untraced
baseline. Preserve the raw trace and its sample-boundary marks alongside frame records, and
compare traced and untraced repeats before attributing a gap. Browser-wide capture includes
other contexts and processes, so inspect process and frame identity before joining events.
An accelerated WebGL renderer does not establish accelerated compositing: the browser can copy
the canvas back to software outside the measured game callback. Preserve the browser's GPU
feature status before and after drawing, as well as WebGL identity, before transferring a result
to another browser or GPU. See `packages/deadvox/tools/perf-baseline.mjs` for that evidence.
A backend probe must exercise the workload, not just create a context: native presentation can
fail after accelerated initialization succeeds. WebGL, shared-image interop and the browser's
presentation surface are separate failure boundaries. Keep machine-specific backend workarounds
outside tracked launch defaults; a working alternative on one driver is not a portable policy.
Require matching look evidence and a trace without the suspected fallback before comparing cost.
Accelerated compositing is not a zero-copy presentation guarantee: an alternative output device
can still copy the composed image to the window even when WebGL no longer reads its canvas back.
Trace categories belong to the workload config so repeated captures request the same evidence.
See `packages/deadvox/src/config/perf-baseline.jsonnet`, `traceCategories`.

Query-free collection must not silently start a CPU profiler: either diagnostic can perturb
cadence. The `off` sampling mode preserves callback and scene evidence without elapsed GPU
queries or profiling; GPU cost remains absent rather than zero. See
`packages/deadvox/tools/perf-baseline-browser.mjs`, `install`, and
`packages/deadvox/tools/perf-baseline-stats.mjs`, `summarize`. Query-free collection also suspends
the adapter's GPU-driven resolution feedback, so compare only frames at matching effective
scene scale. Diagnostic URL overrides and sampling configs are not proposed game defaults.

Raw warm frames accompany each summary, enabling different aggregation without repeating
the expensive hardware run. Compare repeat spreads as well as pooled results; no automatic
pass/fail claim substitutes for the operator's fidelity approval.

## Texture upload attribution

An upload's first consumer is not necessarily its owner: a shadow draw can first bind an actor's
pose texture, charging the upload to the shadow stack even though later colour draws need it too.
Identify the texture and compare its bytes between uploads before calling repeated uploads waste.
The shared actor texture's producer and dirtying boundary are in
`packages/deadvox/src/render/mobActors.ts`, `MobActorMeshes.sync`; its material binding is in
`MobActorMeshes` in the same file. Keep byte comparisons and upload hooks in separate diagnostic
captures because copying texture data perturbs the callback being measured. A changing texture
can still contain unchanged regions, but reducing its transfer needs separate evidence and must
preserve all consumers' pose data.

## Simulation CPU reductions

Prefer excluding impossible work to retaining mutable simulation projections. Inventory ownership,
light power and terrain edits must be visible immediately, without a second invalidation protocol.
See `packages/deadvox/src/core/lights.ts`, `inventoryLightSources`, and `packages/deadvox/src/core/physics.ts`,
`moveTerrainAxis`. Revolver cancellation needs only the continuations already owned by handling,
not every idle item in the world; see `packages/deadvox/src/game/revolverHandling.ts`, `cancelUnheld`.
Eligibility still reads live ownership, so moving a gun between steps cannot leave its handling running.
Equivalence fixtures compare pruned exposure and cancellation to full item-tree scans, and terrain-only
movement to the generic obstacle path; see `packages/deadvox/test/lightPool.test.ts`,
`packages/deadvox/test/revolver.test.ts` and `packages/deadvox/test/physics.test.ts`.
Performance evidence belongs outside the repository, not in timing assertions that depend on the
execution host. Frame callback counts are not simulation rates: distinguish selected actor counts
from scheduler ticks and elapsed-time catch-up before proposing cadence changes.
