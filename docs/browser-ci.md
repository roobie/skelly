---
read_if:
  - you change Deadvox browser CI partition, aggregate requirements, or browser launch source
  - you investigate or reinstate a quarantined browser case
  - you change how the Deadvox unit suite is split across CI jobs or the bound on a shard
---

# Browser CI ownership and evidence

The Deadvox unit suite is sharded because one step over the whole suite outgrew its flat bound with no failing test (#1140), and a bound must follow the work it covers. Each shard's step bound is about twice the slowest shard's measured time, which includes per-shard costs (global setup, imports) that more shards do not shrink. Shards run `vitest run` directly, not `npm test`, because the content outputs they read are tracked and the root CI's content check fails any drift in them; a recompile per shard would repeat that check inside the bound. See `.github/workflows/deadvox.yml`, `unit`; `package.json`, "content:check"; and `AGENTS.md`, "Zero drift". When files grow, add shards rather than raise the bound.

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

The stage clears the `pageshow` marker before Back, because the destination page writes the same session-storage key and would otherwise satisfy the wait while the old document is still loading. It then asserts that Back restored the cached page and, if not, fails with the navigation entry's `notRestoredReasons`. Reinstatement starts from that eviction reason: a Back that Chromium declines to restore is a bfcache eviction, not a slow save.

The eviction's cause is unproven. Chromium reports it as `masked` with an `about:blank` child, which matches the hidden debug review-map iframe that start-up creates. The eviction did not return when the frame was put back, so the frame is not established as the cause and eviction depends on something that varies between runs. Do not lift the quarantine on the frame alone: it needs before, after and restored-before runs in which the restored-before runs evict again. See `packages/deadvox/src/game/play.ts`, `createReviewMapFrame`.

Asynchronous save checks must poll the resolved result, not the truthiness of the promise:
a false first observation must not certify quiescence. Separate browser capture and storage
durations from host phase timings, because renderer dispatch delay can precede the work
being measured. Keep these observations bounded and retain document identity across Back
so destination activity cannot be mistaken for restored-world work. See
`packages/deadvox/test/browser/save-storage.mjs`, `pollNavigation`, `navigationPhase` and
`instrumentNavigationSave`.

A stage timeout on a save step records the `#save-status` transitions and a Web Lock
snapshot on both sides of the stalling step, because a bare timeout cannot tell a stalled
discovery or write from a missing launcher. #749 (the gauntlet win checkpoint never reaches
saved) reports this in the `save-other` shard. #670 (the second weathering page never
enables `#go`) reports it only when the quarantined subflow runs with
`DEADVOX_FIREFOX_UI_WEATHERING_TEST=1`, because no CI shard reaches it. Both issues stay
open as the owners. See `packages/deadvox/test/browser/save-lock-diagnostics.mjs`,
`saveLockSnapshot`.

The required aggregate fails closed on unsuccessful or unobservable attempts in the same run: a later green rerun must not hide an earlier failure. See `tools/browser-ci-result.mjs`, `assertBrowserResult` and `checkBrowserWorkflow`, and `.github/workflows/deadvox.yml`.

Diagnostic artifacts keep source, run, attempt and layout evidence distinct, so siblings and reruns cannot overwrite one another. Native-input, render-free, pixel and operator-review checks answer different questions and remain separate. The primary-action logic and pixel checks are separate because software rendering must not consume the logic contract's time bound; see `packages/deadvox/test/browser/primary-action.mjs` and `packages/deadvox/test/browser/primary-action-pixel.mjs`. Assign a new logic case to the group with the most slack, and split the groups when none has room rather than raising a timeout, so growth does not exhaust a step's headroom. The groups and their steps are set by the script's group argument and `.github/workflows/deadvox-browser.yml`.
