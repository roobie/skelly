# Test pool budget (r4)

`testPool.ts` is the shared Vitest policy for Gungen, Deadvox and Mobgen.
It uses Vitest's native **40% available-CPU budget**, keeping file isolation.
On the measured 7-logical-CPU VM this resolves to 3 workers; on a 2-core GitHub
runner it resolves to 1. CLI `--maxWorkers` remains available for diagnostics.
Changes to this shared file trigger all three subproject workflows.

## Measurements

2026-10-02, main `8597386`, Node 26.8.1 / Vitest 5.0.1, Linux VM exposing
7 logical CPUs (4 cores, SMT). All full runs and solo probes held
`/run/user/1000/skelly-heavy.lock`; no other full suite was admitted. Background
single-file work and host scheduling still cause noise: these are measurements,
not universal speed guarantees. Same test corpus, unchanged expectations.

Seconds, isolated fork pool:

| Workers | Gungen suite | Revolver watertight case | Deadvox suite | Melee reach case |
| --- | ---: | ---: | ---: | ---: |
| Default (6) | 17.58 | 3.45 | 24.95 | 3.25 |
| 1 (serial files) | 47.41 | 1.74 | 53.93 | 1.54 |
| 2 | 32.30 | 2.09 | 31.30 | 1.74 |
| 3 | 22.59 | 2.39 | 27.88 | 2.74 |
| 4 | 19.17 | 2.96 | 28.19 | 2.64 |
| Shared policy, repeat | 20.42 | 2.24 | 27.61 | 2.21 |

Independent single-file probes: revolver case 2.21s; melee reach case 1.73s;
Deadvox's random-chunk mesher case 3.07s. The existing 25s/10s bumps had been
introduced after pooled measurements of 5.2s/5.4s; both now use the ordinary
5s deadline again. No case, assertion, seed or sweep threshold was removed.

An actual two-CPU affinity run (`taskset -c 0,1`) reported
`availableParallelism() = 2` and selected one worker: all three projects passed.
This exercises the budget through Vitest, not a mocked copy of its rounding rule.

The trade-off is intentional: the budget increases total suite wall time by
roughly 3s on this VM, while reducing the two reported heavy-case latencies by
about a third. Aggregate user CPU fell from 88.81s to 73.90s for Gungen and
94.86s to 84.00s for Deadvox. Six workers also inflate collection/import time:
Gungen 16.98s aggregate versus 10.50s at three; Deadvox 23.75s versus 11.66s.
CPU contention, not just intrinsically slow tests, accounts for that inflation.

## Alternatives

- Isolated threads were measured at 3 and 6 workers. At 3 they ran Gungen in
  20.57s and Deadvox in 26.37s, but did not materially improve the heavy cases.
  At 6, the revolver/melee cases rose to 4.30s/4.13s. Keep the fork substrate;
  changing it does not solve oversubscription.
- Do **not** adopt `isolate: false` from Vitest's estimated-speedup hint alone.
  Deadvox's `inventoryScreen.test.ts` installs DOM globals at module scope;
  `models.test.ts` and `meleeMotionProjection.test.ts` install `self`. The suite
  therefore does not satisfy the requested no-global-mutation safety condition.
  Gungen's measured startup hint was only about 2.5s with six workers; it does
  not justify a separate isolation policy and a shared-state audit here.
- Full seed sweeps remain behind the projects' existing sweep mode. This work
  does not move or trim coverage to manufacture a timing improvement.

Per-file/per-test diagnostics and pool comparisons are archived under the main
checkout's `.agent-mail/scratch/r4-before-*.json` and `r4-after-*.json`, with
matching logs. Those are measurement transport; this document is the lasting
summary. Browser suites still serialize with the heavy lock; their own browser
stage timeouts are unrelated to Vitest's worker budget.
