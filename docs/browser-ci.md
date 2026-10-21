---
read_if:
  - you change Deadvox browser CI partition, aggregate requirements, or browser launch source
  - you investigate or reinstate a quarantined browser case
---

# Browser CI ownership and evidence

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

The required aggregate fails closed on unsuccessful or unobservable attempts in the same run: a later green rerun must not hide an earlier failure. See `tools/browser-ci-result.mjs`, `assertBrowserResult` and `checkBrowserWorkflow`, and `.github/workflows/deadvox.yml`.

Diagnostic artifacts keep source, run, attempt and layout evidence distinct, so siblings and reruns cannot overwrite one another. Native-input, render-free, pixel and operator-review checks answer different questions and remain separate. The primary-action logic and pixel checks are separate because software rendering must not consume the logic contract's time bound; see `packages/deadvox/test/browser/primary-action.mjs` and `packages/deadvox/test/browser/primary-action-pixel.mjs`.
