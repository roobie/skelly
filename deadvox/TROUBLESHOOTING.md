---
read_if:
  - you're debugging Deadvox startup, saves, input, rendering or browser stages
  - a browser contract or stage fails on software GL
  - you're authoring a browser stage or exporting a site in Tiled
  - you investigate a save-lock timeout or browser CI launch failure
---

# Deadvox troubleshooting

Start with the closest boundary and reproduce the observed condition; do not infer a simulation result from a rendered frame or a save read. Reusable root-cause lessons are in [LESSONS.md](LESSONS.md).

## Startup and save discovery

The title screen remains unavailable until save discovery and content validation finish. A loading status must remain visible while the startup screen covers the game; after a world starts, the separate spawn-meshing hint remains until nearby terrain is ready. See `src/main.ts`, `hideStartupScreen`, and `src/game/play.ts`, `updateStartupHint`.

Continue may wait for another page's origin-wide save lock. A timeout does not mean a frozen holder can be recovered from the current page; use the reported holder/pending state and the controlled busy-lock browser contract. A successful competing read does not prove that contention caused a failure. See `src/game/saveStorage.ts`, `SaveStorage.withLock`, and `test/browser/save-storage.mjs`.

A frozen page can hold the lock, so the last committed generation is the recovery point. Firefox may cancel module requests when navigation replaces a document; only the destination page's successful load and save checks establish the navigation outcome. See [ADR 0002](docs/decisions/0002-saves.md).

## Debug and rendering

`?debug=1` is development-only. Debug bindings remain rebindable; the held debug gate applies to authoring actions, while noclip flight is ungated only while noclip is active. Native text editing and focus remain browser-owned. A desktop OS may intercept a key before the browser receives it, so synthetic events cannot prove native key delivery. See `src/game/inputBindings.ts`, `INPUT_BINDINGS`, and [CONTROLS.md](CONTROLS.md).

Look and camera parameters are copied from the URL, making a reported pose reproducible. Use `tools/render-probe.mjs` with a `cam=` pose for headless shader reproduction; inspect the screenshot and pixel scan. SwiftShader is not a GPU, so a clean run cannot rule out driver-specific defects. Flip one debug toggle at a time before theorizing; see `src/debug/lookUrl.ts`, `src/debug/camUrl.ts`, and `src/core/weatheringUrl.ts`.

Software-rendered browser contracts should exercise logic without paying renderer startup cost. Use render-free mode for DOM/input/simulation assertions and pixel mode only for visual witnesses. A stage that checks a frame-applied effect must wait for that effect before asserting. See `test/browser/stage-mode.mjs`, `modes`, and `tools/ui-browser-contract.mjs`.

## Browser stages

Wait for application readiness rather than optional third-party resources. For native selection, compare an observed UID change with its pre-key sample; an empty representation can otherwise appear successful before a row is selected. A stage walk must release its key in the page when its condition is satisfied, before the next simulation frame. See `test/browser/inventory-selection.ts`, `inventorySelectionChanged`, and `test/browser/simulation-wait.mjs`, `waitForSimulation`.

Keep Playwright's managed Chromium launch and isolated browser profiles. Treat system Chrome plus Playwright as unsupported until a root cause is established. Firefox pointer-lock refusal (#168) and built IndexedDB Continue (#170) remain quarantined: do not restore either case without a fixed trial plan and before/after/restored-before evidence. Issue #287 remains open for the system-Chrome launch root cause. See `test/browser/chromium.mjs`, `launchChromium`, and [browser-ci.md](../docs/browser-ci.md).

A busy-lock fixture uses an actual exclusive Web Lock in a same-origin blank document; it tests lock recovery without a second world or save worker. It simulates pointer lock and does not establish native-gesture coverage.

## Tiled site export

If Tiled reports an unrecognized project format, use the project action to regenerate Deadvox property types, then close and reopen the project before editing. Do not save a stale project state between regeneration and reopening. See `maps/extensions/deadvox.mjs`, `generatePropertyTypes` and `exportLayout`.

## Browser dependency stalls

The CI browser contracts passed without apt-installed runner packages; browser binaries are installed separately with bounded jobs. If an assertion starts depending on a system package, install only that package rather than restoring broad `--with-deps`. See `.github/workflows/deadvox-browser.yml` and `.github/workflows/deadvox.yml`.
