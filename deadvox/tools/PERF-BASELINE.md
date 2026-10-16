---
read_if:
  - you're collecting or comparing a real-GPU Deadvox performance baseline
  - you're changing the performance harness or interpreting its evidence
---

# Real-GPU baseline

Performance changes need the same workload on real hardware: software GL does not predict
GPU cost, and lower cost does not authorize a different look. See `deadvox/GRAPHICS.md`,
"Look decisions". Keep machine evidence outside the repository; it is a comparison artifact,
not a portable performance promise.

Run `node deadvox/tools/perf-baseline.mjs --out=/path/outside/repository` after installing
check dependencies and compiling content. A working desktop display and Playwright's full
Chromium are required. Supply the display through the environment, not a tracked host path.
Use `--root=deadvox` to select the source build, `--route=ID` for one configured route,
`--config=PATH` for an alternative compiled configuration, or `--executable=PATH` for an
explicit browser binary. The harness builds an instrumented production bundle into that
source tree's ignored build directory; do not publish this diagnostic bundle.

See `deadvox/tools/perf-baseline.mjs`, `run`, for collection, and
`deadvox/src/config/perf-baseline.jsonnet` for workloads and sampling policy. A new isolated
browser context per run excludes saved machine graphics preferences. The sky route uses
its own cold/warm traversal; other routes warm before replaying a frame-indexed camera
sweep. The horde remains live and the camera is raised through the debug fixture so attacks
do not end collection. Fixed input does not promise bit-identical AI trajectories: frame
cadence still controls live simulation time. Inspect screenshots and actor draw evidence
before comparing runs. An interior view must remain inside its authored enclosure.

Whole-frame and segmented GPU timers run separately because elapsed queries cannot nest.
Alternating order reduces drift bias; it cannot eliminate driver overhead from segment
boundaries. Rank passes using segmented means, including zero on frames without a pass,
but gate total cost with whole queries. Do not add CPU and GPU timings as if they were
serial budget components. Frame intervals include presentation and browser scheduling;
main-thread frame timing covers the game callback, not all browser tasks. CPU profiles run
separately without GPU queries, so profiling overhead cannot contaminate the GPU baseline.

The measurement build is unminified to retain useful profiler symbols. Compare only like
measurement builds. Source transform boundaries fail on drift rather than silently omitting
instrumentation. Query polling is asynchronous; disjoint clocks, software rendering,
unresolved queries, page errors and incomplete sky traversal invalidate collection.

See `deadvox/tools/perf-baseline-stats.mjs`, `rankProfile`, for CPU attribution. Categories
are inclusive stack-based samples, mutually exclusive, not exact subsystem timers. Worker
execution is outside this main-thread profile. Native/unattributed samples are not AI,
streaming or idle evidence. Preserve raw profiles so a ranking can be investigated instead
of treating incomplete sampling as proof that a subsystem is free.

See `deadvox/tools/perf-baseline-stats.mjs`, `summarize`, for the JSON summary contract.
Raw warm frames accompany each summary, enabling different aggregation without repeating
the expensive hardware run. Compare repeat spreads as well as pooled results; no automatic
pass/fail claim substitutes for the operator's fidelity approval.
