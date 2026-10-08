---
read_if:
  - you change Deadvox's browser CI partition, required aggregate, browser launch source, or pilot measurements
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

Managed-browser containment keeps browser-launch failures bounded without
claiming a root cause. Its evidence and trigger are recorded in
`deadvox/TROUBLESHOOTING.md`; #287 tracks establishing the launch cause.

The required `check` in `.github/workflows/deadvox.yml` uses
`tools/browser-ci-result.mjs`, `assertBrowserResult`. A selected layout's jobs
must succeed; only the unselected layout's jobs may skip (the control jobs on a
sharded run, `fast` and `browser` on a control run). Matrix fail-fast is disabled
so one failure cannot erase sibling evidence. `checkBrowserWorkflow` queries
prior attempts in the same run before accepting a rerun because GitHub's latest
green alone can conceal a failed first attempt. Its prior-attempt check keeps
the run red after any failed, cancelled or unobservable attempt until it is
disposed; failure in the history query also fails the gate.

`reportEarlierRuns` in `tools/browser-ci-result.mjs`, called by `check` in
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
partitioning changes none of those contracts. For #469, the workflow separates the
primary-action interaction/replay and glowstick pixel checks so SwiftShader rendering
cannot consume the logic contract's wall budget; their assertions remain in
`deadvox/test/browser/primary-action.mjs` and
`deadvox/test/browser/primary-action-pixel.mjs`.
