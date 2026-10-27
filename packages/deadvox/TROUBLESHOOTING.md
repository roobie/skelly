---
read_if:
  - you're debugging Deadvox startup, saves, input, rendering or browser stages
  - a browser contract or stage fails on software GL
  - you're collecting a real-hardware lighting gate from a published preview
  - you're authoring a browser stage or exporting a site in Tiled
  - you investigate a save-lock timeout or browser CI launch failure
  - you add or use transient world-space debug geometry
  - you expose content-defined actors through debug spawning
  - you inspect held-gun poses on the player's detached-camera avatar
---

# Deadvox troubleshooting

Start with the closest boundary and reproduce the observed condition; do not infer a simulation result from a rendered frame or a save read. Reusable root-cause lessons are in [LESSONS.md](LESSONS.md).

## Startup and save discovery

Save discovery and content validation protect entry into a world. The loading mask keeps one progress cue while simulation and player input are paused. The mask is opaque, so the world is not drawn behind it: on software GL those draws take enough time from generation and meshing to stretch a small site's load past a browser stage's wait (#1286). Frames still service the skylight, because lighting readiness gates loading, and the frame that turns ready draws the world before the mask lifts. Until then the canvas holds no current world frame and play drops action input, so a browser stage that hides the mask still waits for the ready state before it presses or captures pixels; see `test/browser/stairs.mjs`, "world-ready". Lighting readiness follows nearby demand rather than requiring distant volumes to be resident. See `src/main.ts`, `hideStartupScreen`, `src/ui/worldLoading.ts`, `mountWorldLoading`, `src/game/worldLoading.ts`, `WorldLoading` and `finishLoadingFrame`, and `src/render/skylight.ts`, `loadingReadiness`.

A stuck load keeps the scene covered and offers reload instead of exposing incomplete terrain, because a missing chunk can show what solid blocks hide, such as a sealed or buried room. The mask protects the ready ring; the terrain reveal gate protects the remaining view as it fills in. Replay uses the same ready ring within recorded terrain so loading never invents simulation columns. Recording starts after readiness to preserve the initial player view without load-time simulation ticks. Pause and held-input restoration must agree at that boundary so the first action, ready stance and ADS do not depend on a later frame. See `src/game/play.ts`, `updateWorldLoading`, `src/game/streamer.ts`, `unmeshedRecordedColumns`, and `src/render/chunks.ts`, `ChunkMeshes`.

A world mesh worker failure is fatal, before or after load: `Streamer.update` throws it, so during load the mask reports it and after load it reaches the error report, as an unhandled generation failure does. Streaming does not go on without meshing, because holes would open and autosave would keep saving a session the player cannot see. The worker is not restarted and its work requeued, because a deterministic build failure fails again on the same chunk, and requeueing would need per-worker tracking of mesh and sky requests. A mesh build that throws answers with its chunk key, so the chunk returns to waiting instead of staying in flight. See `src/game/streamer.ts`, `Streamer.update`, and `src/worker/mesh.worker.ts`.

Continue may wait for another page's origin-wide save lock. A timeout does not mean a frozen holder can be recovered from the current page; use the reported holder/pending state and the controlled busy-lock browser contract. A successful competing read does not prove that contention caused a failure. See `src/game/saveStorage.ts`, `SaveStorage.withLock`, and `test/browser/save-storage.mjs`.

A frozen page can hold the lock, so the last committed generation is the recovery point. Firefox may cancel module requests when the fixture closes or replaces a document. Mark every owned close and rescan through `test/browser/save-storage.mjs`, `navigatePage`, so cancellation is attributed to that outgoing document; destination-page failures remain errors. Only the destination page's successful load and save checks establish the navigation outcome. See [ADR 0002](docs/decisions/0002-saves.md).

## Debug and rendering

`?debug=1` is for authoring and diagnostics, including immutable preview measurements. Debug bindings remain rebindable; the held debug gate applies to authoring actions, while noclip flight is ungated only while noclip is active. Native text editing and focus remain browser-owned. A desktop OS may intercept a key before the browser receives it, so synthetic events cannot prove native key delivery. See `src/game/inputBindings.ts`, `INPUT_BINDINGS`, and [CONTROLS.md](CONTROLS.md).

The Tools gun-pose actions hold an authoring pose while the detached camera takes
over input. Press the selected action again to return to ordinary mouse control;
select another to replace the latch. The debug HUD names the latched pose. These
requests use the player's normal readiness and anatomical solver, not a mannequin
copy; detached flight still cannot move or fire the avatar. Use the live key
labels in the Tools group because bindings remain rebindable. See
`src/debug/index.ts`, `GUN_POSES`; `src/content/base/controls.jsonnet`, `controls`;
and `src/game/debugGunPose.ts`, `DebugGunPose`.

Use transient world-space primitives for spatial diagnostics rather than a one-off visualizer or permanent scene objects. Keep producers behind a debug group. Primitives without a duration retire at the next rendered frame; durations use the same frame Real clock, so simulation speed and pause do not affect expiry. The draw owner copies caller coordinates and releases its scene resources on disposal. Its bounded queue drops the oldest entry and counts overload. See `src/debug/transientDraw.ts`, `TransientDebugDraw`.

The Diagnostics interaction-ray toggle draws to the nearer of an opaque hit or the target F would pick, within reach. Its cross sits outside the hit: along the surface normal for blocks, or back along the ray for targets without a normal. See `src/debug/index.ts`, `drawInteractionRay`, and `src/game/play.ts`, `interactionTargetAt`.

Look and camera parameters are copied from the URL, making a reported pose reproducible. Use `tools/render-probe.mjs` with a `cam=` pose for headless shader reproduction; inspect the screenshot and pixel scan. SwiftShader is not a GPU, so a clean run cannot rule out driver-specific defects. Flip one debug toggle at a time before theorizing; see `src/debug/lookUrl.ts`, `src/debug/camUrl.ts`, and `src/core/weatheringUrl.ts`.

Compare beam spill at the same nighttime camera pose with `?torchspill=0` for the plain cone and `?torchspill=1` for the blended profile. Reload between comparisons because the shared shader is installed before materials compile. See `src/render/playView.ts`, `createPlayView`.

Software-rendered browser contracts should exercise logic without paying renderer startup cost. Use render-free mode for DOM/input/simulation assertions and pixel mode only for visual witnesses. A stage that checks a frame-applied effect must wait for that effect before asserting. See `test/browser/stage-mode.mjs`, `modes`, and `tools/ui-browser-contract.mjs`.

## Debug spawning

The zombie spawn catalogue follows loaded content, including authored-only types, so modded and site-specific actors can be inspected without making them ambient spawns. Keyboard shortcuts are optional; an unbound type remains available in the panel. See `src/debug/index.ts`, `createDebugActions`, and `src/debug/shamblerSpawning.ts`, `spawnZombieType`.

## Browser stages

A successful throw fixture needs room at that item's own landing: different dragged flights do not share a destination, and generated loot is not guaranteed to leave it free. Select a valid aim rather than weakening the throw refusal or waiting longer for a refused launch. See `test/browser/primary-action.mjs`, `aimThrowAtFreeLanding`.

Keep artifact-only screenshots out of pixel stages when the render-free flow already checks the interaction. Software-rendered capture and scene changes consume the stage budget without adding a visual assertion. See `test/browser/primary-action-pixel.mjs` and `test/browser/primary-action.mjs`.

Wait for application readiness rather than optional third-party resources. For native selection, compare an observed UID change with its pre-key sample; an empty representation can otherwise appear successful before a row is selected. A stage walk must release its key in the page when its condition is satisfied, before the next simulation frame. A simulated wait's clock must be sampled with its trigger in one browser task; compressed time can otherwise consume the budget before the command is delivered. See `test/browser/inventory-selection.ts`, `inventorySelectionChanged`, and `test/browser/simulation-wait.mjs`, `waitForSimulation`.

Keep Playwright's managed Chromium launch and isolated browser profiles. Treat system Chrome plus Playwright as unsupported until a root cause is established: the managed launcher mitigates its launch timeouts without explaining them. Firefox pointer-lock refusal (#168) and built IndexedDB Continue (#170) remain quarantined: do not restore either case without a fixed trial plan and before/after/restored-before evidence. See `test/browser/chromium.mjs`, `launchChromium`, and [browser-ci.md](../../docs/browser-ci.md).

Native pointer activation of the practice terminal return and Exit practice transitions is quarantined in #705; keyboard activation keeps the save contract covered. Restore the clicks only with a deterministic reproduction and before/after/restored-before evidence for the cause: passing trials do not lift it. The recorded failure mode is the destination document's startup after navigation (the click navigates, the new document never finishes starting), not pointer delivery, so instrument the destination's startup milestones and outstanding module requests. See `test/browser/save-controller-regressions.mjs`.

A busy-lock fixture uses an actual exclusive Web Lock in a same-origin blank document; it tests lock recovery without a second world or save worker. It simulates pointer lock and does not establish native-gesture coverage.

## Tiled site export

If Tiled reports an unrecognized project format, use the project action to regenerate Deadvox property types, then close and reopen the project before editing. Do not save a stale project state between regeneration and reopening. See `maps/extensions/deadvox.mjs`, `generatePropertyTypes` and `exportLayout`.

## Browser dependency stalls

The CI browser contracts passed without apt-installed runner packages; browser binaries are installed separately with bounded jobs. If an assertion starts depending on a system package, install only that package rather than restoring broad `--with-deps`. See `.github/workflows/deadvox-browser.yml` and `.github/workflows/deadvox.yml`.
