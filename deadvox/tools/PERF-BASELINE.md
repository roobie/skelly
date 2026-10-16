---
read_if:
  - you're collecting or comparing a real-GPU Deadvox performance baseline
  - you're changing the performance harness or interpreting its evidence
  - you're deciding whether a rejected measurement can support a performance claim
---

# Real-GPU baseline

Performance changes need the same workload on real hardware: software GL does not predict
GPU cost, and lower cost does not authorize a different look. See `deadvox/GRAPHICS.md`,
"Look decisions". Keep machine evidence outside the repository; it is a comparison artifact,
not a portable performance promise.

See `deadvox/tools/perf-baseline.mjs`, `run`, for collection and the same file's usage
message for invocation. Workloads and sampling policy belong in
`deadvox/src/config/perf-baseline.jsonnet`, so comparisons can share an explicit fixture
rather than depend on an operator's saved preferences. Do not publish diagnostic bundles
as ordinary game builds.

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

Compare only like measurement builds. Reject invalid measurements rather than retrying
until a run succeeds: selecting only successful attempts hides instability and can make an
unreliable workload appear to meet its budget. Investigate the rejected attempt before
collecting replacement evidence. See `deadvox/tools/perf-baseline.mjs`, `run`, for the
collection checks rather than treating a separate prose checklist as the acceptance contract.

See `deadvox/tools/perf-baseline-stats.mjs`, `rankProfile`, for CPU attribution. Categories
are inclusive stack-based samples, mutually exclusive, not exact subsystem timers. Worker
execution is outside this main-thread profile. Native/unattributed samples are not AI,
streaming or idle evidence. Preserve raw profiles so a ranking can be investigated instead
of treating incomplete sampling as proof that a subsystem is free.

See `deadvox/tools/perf-baseline-stats.mjs`, `summarize`, for the JSON summary contract.
Raw warm frames accompany each summary, enabling different aggregation without repeating
the expensive hardware run. Compare repeat spreads as well as pooled results; no automatic
pass/fail claim substitutes for the operator's fidelity approval.
