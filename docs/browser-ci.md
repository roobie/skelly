---
read_if:
  - you change Deadvox's browser CI partition, required aggregate, or pilot measurements
---

# Browser CI ownership and evidence

The execution definition belongs to `.github/workflows/deadvox-browser.yml`. Its
reusable workflow lets GitHub Actions own sequential steps, timeout enforcement,
runner isolation and matrix scheduling; a second command runner would duplicate
those primitives and make the pilot compare different implementations.

`test/browser-ci-manifest.mjs`, `browserManifest`, derives case identity from executed
commands and environment selectors, and checks the matrix partition against the
full reusable workflow and enabled package scripts. Package aliases do not add
extra executions. Quarantines remain explicit: repartitioning must not silently
restore a flaky case or remove its reinstatement obligation.

The Chromium save-storage stages are excluded while #287 tracks an intermittent
Playwright launch stall. In the failing `browser (indexeddb)` run, Chrome spawned
but did not complete Playwright's pipe handshake before the launch deadline, so no
page or storage assertion ran. The successful save-storage launch in the same run
reported the same D-Bus address error and continued, so that message alone does
not explain the stall. The failing log does not identify a lower-level cause;
`deadvox/test/browser/save-storage.mjs`, `chromium`, is the observed boundary.
`quarantinedStages` in `test/browser-ci-manifest.mjs` keeps those cases out of the
workflow and requires their explicit disposition before reinstatement.

The required `check` in `.github/workflows/deadvox.yml` uses
`tools/browser-ci-result.mjs`, `assertBrowserResult`. A selected layout's jobs
must succeed; only the unselected layout's jobs may skip (the control jobs on a
sharded run, `fast` and `browser` on a control run). Matrix fail-fast is disabled
so one failure cannot erase sibling evidence. Earlier attempts in the same run
are queried before rerun acceptance because GitHub's latest green alone can
conceal the first failed attempt. A failed, cancelled or unobservable earlier
attempt requires disposition, not an unchanged retry into green, and failure in
this within-run history query fails the gate.

BR's 2026-10-05 condition-3 ruling on #255: “Doesn't hide a failed first
attempt” stays per run: `checkBrowserWorkflow`'s prior-attempt check keeps the
result red within a run. In addition, the aggregate makes earlier failures
visible without blocking. `reportEarlierRuns` in
`tools/browser-ci-result.mjs`, called by `check` in
`.github/workflows/deadvox.yml`, reports completed unsuccessful attempts from
other runs at the same head SHA as warning annotations and a job-summary note.
It excludes the current run and runs still in progress. If the cross-run history
query fails, the summary records that it could not check earlier runs and the
required result remains unchanged.

For a pilot, paired manual runs call the same reusable workflow at one fixed
checkout SHA, with each layout receiving its own aggregate. The control
reproduces the two independent jobs #255 replaced, `check` and `browser-stages`
as of main `badb55e`, including the check's cheap-work ordering around browser
cases. Serializing the complete suite instead would inflate the apparent benefit
against that topology.

Compare repeated paired observations, actual aggregate completion, job durations
and per-step results; retain failed observations and first-attempt links.
Time-to-green includes queue, setup and aggregation, while runner time sums the
jobs each layout actually needs. Giving the former `browser-stages` cases their
own shard keeps them off the input shard's critical path.
Do not turn a successful synthetic merge check or a timing model into proof for
an untested commit.

Diagnostic artifacts distinguish source, run, attempt and layout so sibling jobs
or reruns cannot overwrite the evidence. Native inputs, render-free contracts,
pixels and operator appearance judgments retain their separate meanings; CI
partitioning changes none of those contracts.
