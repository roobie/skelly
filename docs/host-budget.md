# Shared-host budget: deb39

Measured **2026-10-03**, checkout `4c0ea9104871ce0a5606547a487a7fdf6e5e0a2b`
(after #161), Linux VM, 7 available logical CPUs, 19.5 GiB RAM. Node 26.8.1;
Vitest 5.0.1 in Gungen/Deadvox and 5.0.2 in Mobgen. These are host measurements,
not reference-laptop frame budgets or GitHub runner guarantees.

## Admission rules

- **One heavy run at a time**, through
  `flock -w 900 /run/user/1000/skelly-heavy.lock timeout 300 …`. Acquire and
  release for **each** suite/build/browser stage, not a whole chained pipeline.
  Time waiting for the lock is not suite execution time.
- Keep **5 GiB free disk** on the repository filesystem. Check before a new
  worktree/install/export and at each lead mail-watch re-arm. If below the
  reserve, stop admitting these jobs and new workers, report to the lead, and
  remove only your verified merged/inactive worktrees, obsolete owned servers
  and disposable artifacts. Never delete another agent's work or failure
  evidence to make room. Resume after the reserve is restored; an exception
  requires BR, not an ENOSPC retry.
- Check live `MemoryCurrent`, `MemoryHigh`, effective limits and browser scope
  membership at the same admission points. At/above a relevant `MemoryHigh`,
  stop admitting new work and report the consumers; do not wait for an OOM kill
  or raise a cap. Adding workers requires a fresh capacity check by the lead.
  Existing role caps are **not additive capacity reservations**.
- A browser may span multiple cgroups: reserve headroom in both the launching
  agent/infra group and the separate Chromium app scope. A 3 GiB *scope* limit
  is not a proved 3 GiB limit for the whole browser job. Keep serialization even
  when individual observed peaks look small.

No new admission daemon, resource-limit changes or automatic test retries are
installed by this documentation change.

## Disk: a real installed worktree

Fresh `.claude/worktrees/deadvox-slice2-budgets`, after all five `npm ci` installs,
before tests/build outputs: **654,324 KiB = 638.99 MiB allocated** (`du -sk`).
The independently installed r5 worktree was 654,184 KiB. This is the physical
checkout/install footprint, not an estimate from package download sizes.

| Install | Allocated KiB | MiB |
| --- | ---: | ---: |
| Root | 126,692 | 123.72 |
| Gungen | 139,736 | 136.46 |
| Deadvox | 183,628 | 179.32 |
| Mobgen | 110,460 | 107.87 |
| Deadvox lit-check | 79,276 | 77.42 |

Shared `.git`, npm/Playwright caches, scratch evidence, browser profiles and
subsequent generated outputs are **not** included in that per-worktree number.
At the final capacity read, `df -B1` reported 8,749,023,232 bytes available
(8.15 GiB); the 5 GiB reserve therefore held. Re-measure after lockfile/asset
changes rather than assuming every future worktree stays at 639 MiB.

## Live memory limits, not just the nominal files

Read from `systemctl --user show`, without changing any properties:

| Group | MemoryHigh | MemoryMax |
| --- | ---: | ---: |
| `agents.slice` (team parent) | 15 GiB | 16,500 MiB = 16.11 GiB |
| `agents-coder.slice` | 11,500 MiB = 11.23 GiB | 13 GiB |
| Each observed `agent-coder*.scope` | 2,600 MiB = 2.54 GiB | 3 GiB |
| `agents-review.slice` | **5 GiB** | **6 GiB** |
| `agents-infra.slice` | 2,600 MiB = 2.54 GiB | 3 GiB |
| `app-org.chromium.Chromium-*.scope` | 2,560 MiB = 2.5 GiB | 3 GiB |

The team parent also has `MemorySwapMax=1G`; the Chromium prefix drop-in has
`MemorySwapMax=256M`. The role limits can sum above their parent's limit: seven
3 GiB coder scopes do not grant seven concurrent 3 GiB workloads.

**Important override:** `~/.config/systemd/user/agents-review.slice.d/host.conf`
still says 1,700 MiB / 2 GiB. Higher-precedence files under
`~/.config/systemd/user.control/agents-review.slice.d/` set the effective
5 GiB / 6 GiB values above. `systemctl --user cat` exposes both. Capacity checks
must use effective properties, not one stale drop-in. None was edited.

## Agent-session memory

Existing pi PID 1291933 had **389.52 MiB process VmHWM** and about 304 MiB RSS
at the final read. Its entire `agent-coder5-advanced.scope` had a kernel lifetime
peak of **2.556 GiB**. These are different measurements: the scope includes
check children, servers and charged cache; VmHWM is only the pi process.

Observed live coder-scope lifetime peaks (same 3 GiB effective ceiling):

| Scope | Peak GiB |
| --- | ---: |
| coder1 | 2.693 |
| coder2 | 2.549 |
| coder3 | 2.635 |
| coder4 | 2.627 |
| coder5-advanced | 2.556 |
| coder6-advanced | 1.942 |
| coder7-advanced | 2.550 |

They are real session high-water marks across their earlier work, **not** nine
fresh identical trials or pi-only memory. Do not add independent lifetime peaks
and claim simultaneous host use. At the initial read, the team parent's current
charge was 8.26 GiB and lifetime peak 11.86 GiB; file cache is part of cgroup
charging, whereas the host's `MemAvailable` also accounts for reclaimability.

## Browser runs and Vite

Real contracts ran in fresh transient measurement scopes under the **existing**
`agents-infra.slice`. No limit was added/raised: each inherited its 3 GiB
ceiling. The heavy lock still serialized them. `systemd-cgls` captured live
membership, and `MemoryPeak` read the kernel cgroup high-water mark.

| Run | Measured memory | Wall time / result |
| --- | --- | --- |
| Chromium full UI contract, first run | Launch scope 1.163 GiB; escaped app peak not captured in this initial pass | 192.02s, passed |
| Chromium full UI contract, complete scope observation | Launch scope **0.934 GiB**; separate browser-main app scope **99.04 MiB** | 193.70s, passed |
| Firefox storage contract (OPFS + IndexedDB, contention, nine kill points) | Whole launch scope **613.50 MiB**; live tree contained Firefox processes, no escaped app scope observed | 57.33s, passed |

For the fully observed Chromium run, the two measured scope peaks sum to
**1.030 GiB**, a conservative upper bound on concurrent combined charge, **not**
a measured simultaneous aggregate peak. Chromium moved its main PID into
`app.slice`, outside `agents.slice`, while other Chrome/Vite/test processes
remained in the launch scope. The existing Chromium prefix cap applied to that
app scope (confirmed live). Reading only the launch scope misses it; reading
only the app scope misses those other processes.

The fresh Vite process serving the Chromium contract had **330.62 MiB VmHWM**,
239.36 MiB RSS before teardown, and **2.06 CPU seconds** over the 193.70s run
(1.06% of one logical CPU averaged over that window). This includes startup and
serving the real UI, not just an idle server. These are per-process figures, not
the whole browser scope; future Vite child processes need separate accounting.
An idle measurement of the old review-server PID was unavailable because that
server had already been stopped; no idle CPU number is inferred from it.

These workloads establish observed costs, **not worst-case certification** for
all browser scenarios. The previously recorded 11.4 GiB uncapped browser event
remains a reason to keep caps/membership checks, not to assume the current UI
fixture covers every large-save or long-session peak. Firefox's separate
IndexedDB-continue missing-canvas diagnosis belongs to d20/r6; the passing
storage workload above does not declare that separate scenario fixed.

## Default test-run budgets

Measured default `npm test`, **three successful runs per project**, same checkout
and shared `TEST_POOL` (`maxWorkers: '40%'`, `isolate: true`), no CLI override.
Seven available CPUs resolve to three workers. All full runs held the heavy
lock. Numbers are `/usr/bin/time` whole-command wall seconds including npm/
Vitest startup, excluding lock wait. Root lint/site were likewise repeated
three times; they do not use Vitest.

| Command | Run 1 | Run 2 | Run 3 | Median | Budget |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gungen `npm test` | 27.52 | 24.52 | 24.10 | **24.52** | **40s** |
| Deadvox `npm test` | 26.35 | 26.54 | 27.45 | **26.54** | **40s** |
| Mobgen `npm test` | 40.25 | 40.09 | 44.31 | **40.25** | **65s** |
| Root `npm run ci` | 2.78 | 2.71 | 2.80 | **2.78** | **5s** |
| Root `npm run test:site` | 0.31 | 0.29 | 0.33 | **0.31** | **1s** |

Headroom is at least **50% over the median**, rounded up to the next 5s for
subprojects and next 1s for root checks. All observed runs fit. Corpus:
Gungen 4,349 passed / 224 skipped (79 files), Deadvox 921 passed (104 files),
Mobgen 300 passed / 1 skipped (18 files), root site 3 passed. Flagged sweeps,
typecheck/build, browser contracts and installs are **not** hidden inside these
default-run budgets and remain separate checks.

A milestone exceeding a budget records the before/after command timings and
explains the distinct coverage/work added in its PR. Review redundant cases or
split genuinely slow work; do not raise case timeouts, skip assertions, or tune
the pool merely to make the number green. The lead checks this on each milestone.
No CI guard is installed: these deb39/Node-26 budgets are not valid hard limits
for GitHub's different CPU/Node-22 environment. An automated warning would need
an explicitly measured runner baseline first.

## Re-measure without a bespoke profiler

```sh
# Same-SHA installs and physical footprint (AGENTS.md has the five npm ci commands).
git rev-parse HEAD
node --version
node -p 'require("node:os").availableParallelism()'
du -sk . node_modules gungen/node_modules deadvox/node_modules \
  mobgen/node_modules deadvox/tools/lit-check/node_modules
df -B1 --output=size,used,avail,pcent .

# Effective properties and their higher-precedence source files.
systemctl --user show agents.slice agents-coder.slice agents-review.slice \
  agents-infra.slice agent-coder5-advanced.scope \
  -p MemoryCurrent -p MemoryPeak -p MemoryHigh -p MemoryMax \
  -p EffectiveMemoryMax -p MemorySwapMax -p ControlGroup
systemctl --user cat agents.slice agents-coder.slice agents-review.slice agents-infra.slice
# Also read ~/.config/systemd/user/app-org.chromium.Chromium-.scope.d/50-memory-cap.conf.
# pi-only memory: /proc/<pi-pid>/status, VmHWM and VmRSS (not virtual size).

# Repeat three times, each command with its own lock hold; time INSIDE the lock.
flock -w 900 /run/user/1000/skelly-heavy.lock timeout 300 \
  sh -c 'cd gungen; /usr/bin/time -f "wall=%e user=%U sys=%S" npm test'
# Repeat for deadvox/mobgen; time npm run ci and npm run test:site from the root.

# Fresh cgroup peak for one actual browser stage, without changing host caps.
flock -w 900 /run/user/1000/skelly-heavy.lock \
  systemd-run --user --scope --unit=budget-browser --slice=agents-infra.slice \
  sh -c 'cd deadvox; timeout 300 xvfb-run -a node test/browser/save-storage.mjs firefox; \
    result=$?; systemctl --user show budget-browser.scope \
    -p MemoryPeak -p EffectiveMemoryMax; exit "$result"'
# While live: systemd-cgls --user-unit=budget-browser.scope --no-pager.
# Chromium: ALSO read its app-org.chromium.Chromium-<pid>.scope before teardown.
```

For Vite, read `/proc/<vite-pid>/status` before exit; CPU seconds are stat fields
14 + 15 divided by `getconf CLK_TCK`. Compare CPU counter deltas over a stated
wall window for idle measurements; do not use VSZ as resident memory.
Measurement transport is `.agent-mail/scratch/d21-{*.time,*.log,final-caps.txt,
effective-dropins.txt}` plus the disposable browser scope/pre-teardown probes.
The tables and commands above are the lasting record; no profiler is added to
the project.
