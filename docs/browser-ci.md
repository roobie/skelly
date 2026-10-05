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

The required `check` in `.github/workflows/deadvox.yml` uses
`tools/browser-ci-result.mjs`, `assertBrowserResult`. A selected layout must
succeed; only a deliberately unselected control layout may skip. Matrix
fail-fast is disabled so one failure cannot erase sibling evidence. Earlier run
attempts are queried before rerun acceptance because GitHub's latest green alone
can conceal the first failed attempt. A failed, cancelled or unobservable earlier
attempt requires disposition, not an unchanged retry into green. Failure in the
history query also fails the gate.

For a pilot, the manual workflow's control and matrix call the same reusable
workflow at the same checkout SHA. Compare repeated paired observations, actual
job durations and per-step results; retain failed observations and first-attempt
links. Time-to-green includes shared prerequisites and aggregation, while runner
time sums the jobs each layout actually needs. The serial control deliberately
serializes all enabled cases; it is not an assertion that the previous workflow's
partially parallel topology had that same duration. Do not turn a successful
synthetic merge check or a timing model into proof for an untested commit.

Diagnostic artifacts distinguish source, run, attempt and layout so sibling jobs
or reruns cannot overwrite the evidence. Native inputs, render-free contracts,
pixels and operator appearance judgments retain their separate meanings; CI
partitioning changes none of those contracts.
