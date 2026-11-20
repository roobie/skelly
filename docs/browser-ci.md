---
read_if:
  - you change Deadvox browser CI partition, aggregate requirements, or browser launch source
  - you change a browser stage's startup wait, page-owned readiness signals, or where its production bundle is built
  - you investigate or change a production-bundle step's time bound
  - you change what content a browser stage page builds or the intake it calls
  - you investigate a render-progress wait, reinstate a quarantined browser case, or rename its environment gate
  - you change a pixel stage's viewport, screenshot crop, or brightness measurement
  - you change how the Deadvox unit suite is split across CI jobs or the bound on a shard
  - a browser step shows a time-limit warning, or you change when that warning fires
  - you change how browser shards install, or what `npm run setup` runs
---

# Browser CI ownership and evidence

The Deadvox unit suite is sharded because one step over the whole suite outgrew its flat bound with no failing test (#1140), and a bound must follow the work it covers. Each shard's step bound is about twice the slowest shard's measured time, which includes per-shard costs (global setup, imports) that more shards do not shrink. Shards run `vitest run` directly, not `npm test`, so they read the tracked content outputs rather than recompile them; see `docs/jsonnet.md`, "Compile cache", and `.github/workflows/deadvox.yml`, `unit`. When files grow, add shards rather than raise the bound.

The sharded unit job is the only path that runs the whole Deadvox unit suite. The old single-job layout, kept as a manual control, is retired: it could only fail at the cap with no failing test, and sharding it would have changed what it measured, so it was a second path to the same check. The Pages build does not rerun the unit suite either; the same sources reach `main` through the sharded job, and a second, unbounded copy added a path and no coverage. A new whole-suite run needs a bound sized to its measured work (`docs/PROCESS.md`, "Bound every run"), or it joins the shards.

Install steps, the browser shards' setup among them, keep a 3-minute bound that a cold install fits inside. The failures behind it (#1108) were a registry request that stalled for npm's default five-minute fetch timeout, longer than the bound. The root `.npmrc` and the one beside the lit-check lockfile cap each request and retry so a stalled one is retried inside the bound; raise neither the bound nor the retries to hide a slow registry. Both files carry the same values because npm reads the config of the directory it installs into.

GitHub Actions owns browser scheduling, isolation and timeouts. Keeping orchestration in `.github/workflows/deadvox-browser.yml` avoids a second runner that could change what the measurements mean.

A browser step's bound follows the same rule as a unit shard's: about twice its measured time, split when the work grows rather than raised. A step near its bound fails on runner variance alone, and a green rerun cannot clear that failure (`tools/browser-ci-result.mjs`, `assertBrowserResult`), so it blocks the head (#1546). The gauntlet save flow has its own step for this reason; it shares its server with the other save-controller cases. See `packages/deadvox/test/browser/gauntlet-save-regressions.mjs` and `packages/deadvox/test/browser/save-controller-fixture.mjs`, `saveControllerServer`. The Firefox mods-screen flow has its own step too: every edit on that screen evaluates the whole selection against the content again, so the flow's cost follows its edits, not the play checks that shared its step and its bound. See `packages/presentation/src/ui/modsPanel.ts`, `chooseMods`, and `packages/deadvox/test/browser/mods-startup.mjs`, `selectFixtureMods`.

Browser stage pages use the product's base content intake rather than every mod on disk: scenario mods add validation work without exercising the probe, and unstamped development content pays that cost on every page. See `packages/deadvox/test/browser/case-visual-pool.mjs` and `packages/deadvox/src/product/content.ts`, `productContent`.

A production-bundle stage's bound must not cover the bundle build: compile and validation work tracks runner speed, not the stage's behaviour, and must not consume its navigation or readiness budget. Size the separate build bound at about twice its measured time, so a slow or hung build fails as a build. Main's completed Firefox builds varied widely across revisions, with the slowest nearly filling the former bound; completed builds in the fast job also exceeded that former bound. The bound therefore includes approximately one completed build's worth of margin above the slowest completed Firefox measurement, rather than relying on a green retry. See `.github/workflows/deadvox-browser.yml`, "Production bundle for Firefox save navigation". The bundle stamp validates each opt-in selection on top of the defaults, so validation work grows with opt-in packs and runs in parallel shard processes; see `packages/deadvox/tools/stampBundle.ts`, `MAX_VALIDATION_SHARDS`. Package scripts that run these stages build first; the stage refuses to start without a bundle rather than time out against a missing one. See `packages/deadvox/test/browser/save-storage.mjs`, `previewServer`.

A navigation timeout alone cannot identify the stalled side, and the browser's `net::ERR_ABORTED` during teardown is not its cause. The save-storage request timeline therefore prints both server and browser observations only on failure, before cleanup can obscure them, so passing runs stay quiet. See `packages/deadvox/test/browser/requestTimeline.mjs`, `createRequestTimeline`.

The OPFS Continue production-reload step is quarantined from CI under #1721, not fixed by a retry or a larger timeout. A CPU-constrained reproduction received a prompt server 304 response while Chromium's renderer waited for GPU commands during document teardown; a passing trace also spent most of the reload in frame detachment. This rules out an unanswered server request for that reproduction, but does not establish why the GPU work stalls or prove that every CI hit has the same cause. Neither cache revalidation nor OPFS handle retention is established as the cause. Keep the production-rendered diagnostic runnable through `packages/deadvox/package.json`, "test:browser:chromium:opfs-continue"; do not replace it with render-free coverage, which would remove the observed teardown path. The quarantine costs production-bundle OPFS reload and Continue proof; the other save cases do not replace it. Reinstatement needs a bounded cause and before/after/restored-before evidence. See `test/browser-ci-manifest.mjs`, `quarantinedScripts`.

A screenshot clip reduces the captured image, not the WebGL frame drawn by software rendering. Brightness-only witnesses can reduce that work without changing the scene region by scaling the viewport and crop together; normalize against the image's actual pixels, not a fixed capture size. World readiness does not certify a later fixture placement, because camera following runs in the live frame: wait for that frame before capturing the placed scene. See `packages/deadvox/test/browser/stairs.mjs`, `lightingScale`, `pixelCrop`, `luminance` and `lightingCellarProofs`.

A timeout while waiting for new rendered frames does not distinguish incomplete render work from delayed observation. Preserve callback progress and elapsed time at the failure boundary, before teardown removes the evidence, and log the same observation on success for comparison. See `packages/deadvox/test/browser/stairs.mjs`, `postFrameProgress`.

Camo pointer lock and route completion must also remain observable independently of the next rendered frame: software rendering can delay a poll after the work is complete. Phase entry logs identify a wait even if the enclosing stage deadline terminates the process. See `packages/deadvox/test/browser/stairs.mjs`, `timePhase`, and `packages/presentation/src/ui/skyRoutePanel.ts`, `createSkyRoutePanel`.

## Setup install

Browser shards install with the root `npm run setup`, the install a developer runs, rather than hand-picked pieces of it. A fault that only setup introduces then fails a browser stage in CI instead of only on developer machines: setup's own install inside the skelly-assets tools once gave the game a second valibot and failed every browser stage locally while CI, installing without it, stayed green (#1892). Every shard runs it rather than one, so the workflow keeps one install path and no shard-specific copy of the setup pieces that could drift from it; setup's extra pieces add less to a shard's install than its runner variance does. The npm environment switches on the step skip audit and fund requests and prefer the cache; they change no installed file. The Deadvox workflow's path filter covers every input setup reads, so a change to setup triggers the browser shards. See `package.json`, "setup", and `test/deadvox-browser-ci.test.mjs`.

## Main first-mesh reference shard

The main first-mesh reference runs in its own shard rather than as a step in front of branch-scene stages, because it fetches the pull request's base revision and then boots main's startup beside the branch: that git and network work would extend a shared shard's stage time, and a failure there would skip every later stage's evidence in that shard. Camo AO assertions in particular must not depend on the comparison. The shard pays its own install and browser setup, which runs in parallel with the other shards. See `packages/deadvox/test/browser/main-first-mesh.mjs` and `packages/deadvox/test/browser/sky-main-arrival.mjs`, `measureMainFirstMesh`.

Because that shard finishes long before the stages shard, a self-contained branch stage that would lengthen the stages shard's critical path runs there after the reference, even when the reference fails, so neither's evidence depends on the other. The vehicle locker loot stage is one. See `packages/deadvox/test/browser/vehicle-locker-flow.mjs`.

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

The eviction's cause is unproven. Chromium reports it as `masked` with an `about:blank` child, which matches the hidden debug review-map iframe that start-up creates. The eviction did not return when the frame was put back, so the frame is not established as the cause and eviction depends on something that varies between runs. Do not lift the quarantine on the frame alone: it needs before, after and restored-before runs in which the restored-before runs evict again. See `packages/presentation/src/presentation/play.ts`, `createReviewMapFrame`.

Full-auto fire is quarantined under #1781 because its ordinary run nearly fills its CI step
budget, so runner variance alone fails it. The quarantine removes CI proof of held-trigger cadence, case ejection and cold-start audio under the
live loop; the firearm unit suites do not replace the audio and input routing. Keep it runnable
through `packages/deadvox/package.json`, "test:browser:chromium:full-auto". Reinstatement needs
the stage to fit its budget with margin by locating the slow phases, not a larger timeout.

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
`SKELLY_FIREFOX_UI_WEATHERING_TEST=1`, because no CI shard reaches it. Both issues stay
open as the owners. See `packages/deadvox/test/browser/save-lock-diagnostics.mjs`,
`saveLockSnapshot`.

The required aggregate fails closed on unsuccessful or unobservable attempts in the same run: a later green rerun must not hide an earlier failure. See `tools/browser-ci-result.mjs`, `assertBrowserResult` and `checkBrowserWorkflow`, and `.github/workflows/deadvox.yml`.

Diagnostic artifacts keep source, run, attempt and layout evidence distinct, so siblings and reruns cannot overwrite one another. Native-input, render-free, pixel and operator-review checks answer different questions and remain separate. The primary-action logic and pixel checks are separate because software rendering must not consume the logic contract's time bound; see `packages/deadvox/test/browser/primary-action.mjs` and `packages/deadvox/test/browser/primary-action-pixel.mjs`. Assign a new logic case to the group with the most slack, and split the groups when none has room rather than raising a timeout, so growth does not exhaust a step's headroom. A step's bound covers the whole group, not the phase being logged when it fires: a timeout lands in whichever phase runs at the bound, so read the phase timings of the whole step against the bound before hunting a stall in that last phase. A group measured at two thirds of its bound locally has no headroom left for runner variance. The groups and their steps are set by the script's group argument and `.github/workflows/deadvox-browser.yml`.

The scope-zoom and fixed-sight pixel contracts are quarantined under #1812 because their CI steps time out intermittently on changes that do not touch them. Keep them runnable through `packages/deadvox/package.json`, "test:browser:optic-pixel"; reinstatement restores their workflow steps and lifts the quarantine in `test/browser-ci-manifest.mjs`, `quarantinedScripts`.

Optic pixel readbacks can dominate even when startup and ordinary frame observations remain comparable (#1471). Keep variable-power endpoints separate from the fixed-sight presentation transitions, so cumulative GPU work does not consume one step's teardown headroom. Both groups retain their real tube-pixel witnesses; fixed-sight transitions stay in one session to detect stale masks. See `packages/deadvox/test/browser/primary-action-pixel.mjs`, `opticZoomCheck`, and `packages/deadvox/test/browser/optic-disc-scene.mjs`, `scopeDiscPixels`.

## Step time warning

A browser step that uses more than three quarters of its bound gets a warning annotation on the run, and every step logs its share. A step sized at about twice its measured time sits near half its bound, so passing three quarters means its work has grown well past that sizing, and a slower runner can then fail it at the bound with no error. The warning flags the creep on the pull request that causes it, without failing it. The limits are read from the workflow file and the times from the run's own job record, so the bound has one source. See `tools/browser-ci-step-time.mjs`, `WARNING_SHARE`.
