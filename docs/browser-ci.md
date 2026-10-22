---
read_if:
  - you change Deadvox browser CI partition, aggregate requirements, or browser launch source
  - you investigate or reinstate a quarantined browser case
  - you change how the Deadvox unit suite is split across CI jobs or the bound on a shard
---

# Browser CI ownership and evidence

The Deadvox unit suite is sharded because one step over the whole suite outgrew its flat bound with no failing test (#1140), and a bound must follow the work it covers. Each shard's step bound is about twice the slowest shard's measured time, which includes per-shard costs (compile, global setup, imports) that more shards do not shrink. When files grow, add shards rather than raise the bound. See `.github/workflows/deadvox.yml`, `unit`, and `AGENTS.md`, "Zero drift".

The sharded unit job is the only path that runs the whole Deadvox unit suite. The old single-job layout, kept as a manual control, is retired: it could only fail at the cap with no failing test, and sharding it would have changed what it measured, so it was a second path to the same check. The Pages build does not rerun the unit suite either; the same sources reach `main` through the sharded job, and a second, unbounded copy added a path and no coverage. A new whole-suite run needs a bound sized to its measured work (`docs/PROCESS.md`, "Bound every run"), or it joins the shards.

Install steps keep a 3-minute bound because a cold `npm ci` takes seconds. The failures behind it (#1108) were a registry request that stalled for npm's default five-minute fetch timeout, longer than the bound. The root `.npmrc` and the one beside the lit-check lockfile cap each request and retry so a stalled one is retried inside the bound; raise neither the bound nor the retries to hide a slow registry. Both files carry the same values because npm reads the config of the directory it installs into.

GitHub Actions owns browser scheduling, isolation and timeouts. Keeping orchestration in `.github/workflows/deadvox-browser.yml` avoids a second runner that could change what the measurements mean.

`test/browser-ci-manifest.mjs`, `browserManifest`, checks that executed browser cases match the reusable workflow and enabled package scripts. Explicit quarantines keep a removed case's reinstatement obligation visible.

Managed-browser containment bounds launch failures without claiming a root cause; the launch cause stays unproven. See `packages/deadvox/TROUBLESHOOTING.md`.

Chromium save navigation is quarantined under #706 because it exceeded the workflow bound
without enough evidence to identify the slow operation. A successful bfcache restore does not
prove the subsequent lifecycle save completed, and a final log entry does not locate the cause
of cumulative stage delay. The quarantine removes CI proof of Chromium's real bfcache
handoff and post-Back lifecycle commit; Firefox navigation and unit lifecycle checks cannot
replace that proof. Keep the explicit local diagnostic available through
`packages/deadvox/package.json`, "test:browser:chromium:navigation". Reinstatement requires the
issue's bounded diagnosis and before/after/restored-before evidence, not a retry or larger
timeout. See `packages/deadvox/test/browser/save-storage.mjs`, `navigationOnly`, and
`test/browser-ci-manifest.mjs`, `quarantinedScripts`.

Asynchronous save checks must poll the resolved result, not the truthiness of the promise:
a false first observation must not certify quiescence. Separate browser capture and storage
durations from host phase timings, because renderer dispatch delay can precede the work
being measured. Keep these observations bounded and retain document identity across Back
so destination activity cannot be mistaken for restored-world work. See
`packages/deadvox/test/browser/save-storage.mjs`, `pollNavigation`, `navigationPhase` and
`instrumentNavigationSave`.

Two flakes that never reproduced locally, #670 (the second weathering page never enables `#go`) and #749 (the win checkpoint never reaches saved), both involve the save lock held across a page teardown or a stalled write. Their stage timeouts therefore record the `#save-status` transitions and a Web Lock snapshot on both sides of the stalling step, because a bare timeout cannot tell a stalled discovery or write from a missing launcher. The probe repeats the two stages on the CI image, on manual dispatch and on pushes to its own branch (a workflow can be dispatched only once it is on the default branch), so the evidence comes from the environment that failed and it is never a required check. See `.github/workflows/save-lock-probe.yml`, "save-lock probe", and `packages/deadvox/test/browser/save-lock-diagnostics.mjs`, `saveLockSnapshot`.

The required aggregate fails closed on unsuccessful or unobservable attempts in the same run: a later green rerun must not hide an earlier failure. See `tools/browser-ci-result.mjs`, `assertBrowserResult` and `checkBrowserWorkflow`, and `.github/workflows/deadvox.yml`.

Diagnostic artifacts keep source, run, attempt and layout evidence distinct, so siblings and reruns cannot overwrite one another. Native-input, render-free, pixel and operator-review checks answer different questions and remain separate. The primary-action logic and pixel checks are separate because software rendering must not consume the logic contract's time bound; see `packages/deadvox/test/browser/primary-action.mjs` and `packages/deadvox/test/browser/primary-action-pixel.mjs`.
