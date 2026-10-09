---
read_if:
  - you're debugging deadvox and need its debug parameters or keys
  - you're using the debug test-house range
  - you need to see the game without a display
  - a browser contract or stage fails on software GL
  - you investigate a Chromium launch failure in browser CI
  - you investigate native inventory selection or keyboard settlement in browser tests
  - you're authoring a browser stage that checks a frame-applied effect
  - you're authoring or exporting a Deadvox site in Tiled
  - you diagnose a stalled Deadvox CI browser dependency install (#388)
  - you're choosing render-free or pixel mode for a browser stage
  - you diagnose keyboard rebinding, debug gates or native browser interception
  - you investigate save-lock timeouts
  - you debug startup or save discovery
  - you investigate navigation-aborted save-test requests (#474)
  - a new-world start shows a blank canvas before nearby terrain is ready
---

# deadvox — troubleshooting

How to look at the game and narrow down a problem. Lessons from past problems are in
[LESSONS.md](LESSONS.md).

## New-world loading feedback

The title overlay hides when pointer lock is granted, before the spawn neighborhood is fully meshed. Keep a centered status hint over the canvas until that neighborhood is ready; otherwise the empty view can look like a stalled start. `src/game/play.ts`, `updateStartupHint`, uses `Streamer.unmeshedColumns` to show progress and decide when the hint can hide.

## Debug parameters

`?debug=1` enables debug tools. Hold the rebindable F2 gate for keyboard
authoring commands; see `src/game/inputBindings.ts`, `INPUT_BINDINGS`, and the
generated keyboard settings for the effective chords. Plain gameplay keys never
invoke debug tools. With it, the look and
camera settings live in the URL and update as you change them, so a reload or a pasted
link reproduces what you saw. Only deviations from the defaults are written; values and
their ranges are in `src/debug/lookUrl.ts` and `src/debug/camUrl.ts`.

Browser profiles can rebind defaults, so this guide does not reproduce a key
catalogue that could mislead a player; see `BindingRegistry` in
`src/game/inputBindings.ts`.

Noclip flight is ungated while noclip is active so vertical movement can combine
with WASD; entering noclip remains gated. The debug spectator camera also reuses
that flight movement on a separate camera position: the player body remains in the
simulation, and toggling spectator mode off snaps back to it. `MobActorMeshes`
continues to aim chase gaze at the player's body eyes, not the detached view.
Perception labels are a renderer overlay of stored state: sight, recent near
attention, remembered attention, or unaware. The hidden-shambler action requires
nearby solid geometry. The test-noise action plays the existing `player_hurt_light`
event through `session.playPlayerSound`; this debug action writes the player's
vocal-noise state and simulation event queue. See `src/game/inputBindings.ts`,
`INPUT_BINDINGS`, `src/debug/shamblerSpawning.ts`, `spawnUnawareShambler`, and
`src/game/debugInterface.ts`, `DebugHooks.emitTestNoise` for the action routes.

The spawn menu itself is debug-only,
but its navigation and confirmation are ordinary modal controls.

Enter confirms while the spawn menu is open; native activation of debug buttons
remains gated. Native text editing/focus stays with the browser; see `CONTROLS.md`,
“Native browser boundary and exceptions”. A desktop OS can intercept a key before
the browser receives it; report that boundary rather than claiming a synthetic
event proves capture.

Fresh debug games receive an authored loadout so experiments do not alter normal
games or restored saves. See `src/debug/index.ts`, `attachDebugTools`.

- `cam=x,y,z,yaw,pitch,roll`: the player's feet in metres and the view in degrees. Copy it
  from the address bar to share an exact pose.
- `at=x,z[,yaw]`: start a new debug session at x/z in metres on the site's ground, optionally
  facing yaw degrees. It makes a site look URL reproducible without changing saved or replayed
  state: loading a save keeps its saved position and view, and a replay starts from its recorded
  snapshot. See `src/game/config.ts`, `configFromUrl`, and `src/game/worldSetup.ts`,
  `playerStartFromWorld`.
- The debug bindings for spectator camera, perception labels, hidden-shambler spawn, and test noise
  are listed by action in `src/game/inputBindings.ts`, `INPUT_BINDINGS`; their active keys remain
  rebindable. Use them together to watch a shambler remain unaware behind a wall, emit a near test
  noise, and then step the body into sight. The labels expose the state transition while gaze stays
  tied to the simulated body.
- `site=testHouse`: the small test scene (block sizes, materials, furniture). With `debug=1`, use the south garden gate, then go east around the wall to the range's west end; the rack and shooting table are there, and targets are east. Registry-derived stock is in `src/game/testHouseRange.ts`, `testHouseRangeStock`.
- `voicePitch=<factor>` and `voicePitchLarge=<factor>` on `?site=voice_size&debug=1` tune figure pitch anchors. `src/game/shamblerAudio.ts`, `debugVoicePitch`, ignores them on other sites or without debug mode.
- `firearmsCombat=<level>` on a fresh debug world sets the authored firearms-combat skill range (`firearms_combat`). See `src/core/character.ts`, `SKILL_LEVEL_MIN`, `SKILL_LEVEL_MAX` and `SKILL_LEVEL_LEGENDARY`, and `src/debug/debugFirearmsSkill.ts`, `setDebugFirearmsSkill`.
- `inventoryManagement=<level>` on a fresh debug world sets the Inventory Management skill (`inventory_management`). See `src/debug/debugInventoryManagementSkill.ts`, `setDebugInventoryManagementSkill`.
- `hotcheck=1`: world fragments whose colour is NaN, infinite, negative or
  above 8 are painted by material (legend in the debug panel); full / half / checker fill =
  NaN / Inf-or->8 / negative. It runs after fog.
- `crackcheck=1`: the background is cleared to magenta, so holes show.

The looked-at-block hint stays near the lower edge to avoid obscuring the center. It sits above
visible bottom HUD elements, following their actual bounds; with those hidden, it uses the
quickbar's computed bottom offset. In `src/debug/index.ts`,
`attachDebugTools` installs `runtime.updateLookedAt`, which uses `src/debug/lookedAt.ts`,
`describeLookedAt`, for text and calls `src/ui/hud.ts`, `positionLookedAtReadout`, for placement. The
shorter shambler aim readout stays at the crosshair because it is target-specific, and the block hint
yields while it is active.

The debug centre X follows the HUD Crosshair option live, so it does not mark the view when the
player has turned that aid off. See `src/game/play.ts`, `frame`,
`src/game/debugInterface.ts`, `DebugRuntime.setCrosshairVisible`, and `src/debug/index.ts`,
`panelTemplate`.

Bisect a visual bug by flipping one toggle at a time before theorising.

## Save-lock timeouts

Continue can be blocked while another page holds the origin-wide save lock. A
live hung writer releases it when `SaveStorage.request` times out; nothing in a
frozen page can release a lock it holds. The back/forward-cache exception and
recovery point are in `docs/decisions/0002-saves.md`, “Snapshot timing and frame
budget”.

`SaveStorage.withLock` reports the cause and held/pending lock summary, including
whether the holder is another client, and explains the other-page failure to the
player. A save checkpoint is proved by the controller's committed generation and failure
state, not by UI wording or a competing storage read. In
`test/browser/save-storage.mjs`, `testTitleAndAutosave` reads the `save-test`
hook's `saveState`. A reader polling during an OPFS write takes the shared save
lock against the writer's exclusive lock; the reported timeout has not shown
that contention caused the failure. Wait timeouts report save status and page
errors; postcondition read errors identify the backend and step.

Firefox cancels outstanding module fetches when a navigation replaces their
document; that cancellation is not a save failure. The destination document must
still load and pass its save checks. In `test/browser/save-storage.mjs`,
`trackPageNavigation` advances the document generation only when a main-frame
navigation request commits, and `recordRequestFailure` ignores only an aborted
request attributed to a generation during an explicit test navigation.
`navigatePage` records that navigation's source state. The leaving-state rule is
in `src/ui/saveController.ts`, `SaveController`; navigation and busy-lock
contracts are in `navigationOnly` and `busyLockOnly`.

## Startup and save discovery

The startup screen covers the title card until save discovery and content validation
finish. During that wait, the controller's `#save-status` stays visible beneath the
loading bar, so a slow or failed storage check explains itself. The persistence action
becomes reachable on the title card only after discovery has established the storage
state. See `src/main.ts`, `hideStartupScreen`, and `src/ui/saveController.ts`,
`SaveController.prepare`.

## Deadvox CI browser dependency stalls

For #388, Playwright's `--with-deps` stalled while apt fetched and installed runner packages. The enabled browser contracts and Xvfb stages passed without apt, so CI installs browser binaries only and bounds the install and job. If a stage starts asserting text glyphs or Firefox media, install the specific package that assertion needs rather than restoring `--with-deps`. See `.github/workflows/deadvox-browser.yml`, `jobs.run`, and `.github/workflows/deadvox.yml`, `jobs.fast` and `jobs.check`.

## Seeing the game without a display

`tools/render-probe.mjs` renders a URL in headless Chromium on SwiftShader (software
WebGL), screenshots it, and scans the pixels. Use it to verify shader or rendering changes
and to reproduce a reported visual bug at an exact `cam=` pose. Headless Firefox cannot
create a WebGL context on a display-less host; use this instead.

One-time per host: `npx playwright install chromium`. Then, with `npm run dev` running in
`deadvox/`:

```sh
cd deadvox
node tools/render-probe.mjs "http://localhost:5173/?debug=1&site=testHouse&cam=-5.21,23.00,5.01,-87.8,-10.2,0.0&hotcheck=1&bloom=0" --out "$XDG_RUNTIME_DIR/shot.png"
```

It prints the WebGL renderer, console errors, page errors, and scan counts with the first
hits; `--window x,y,w,h` dumps raw RGB. Exit 1 on a page error, no WebGL, or flagged
pixels; 2 on bad usage. Look at the screenshot itself too.

- Any hot-check or crack-check pixel is flagged.
- The renderer line says what drew the pixels. SwiftShader is not a GPU: a clean run does
  not rule out GPU- or driver-specific issues. It is slow; keep the 25 s default wait.

## Browser contracts on software GL

On software GL (SwiftShader, headless or under Xvfb) the look slows start-up: in a cut-down
Firefox start-up probe, page load took 6.1 s with the default look against 2.5 s with
`post=0&sunshadow=0&torchshadow=0`. `npm run test:ui-browser` therefore opens the game with
those three parameters (commit `3299e50`; on the full look the contract took 8m09s against
its 300 s cap). It tests the UI, not the look.

Native key delivery and the inventory's next-frame DOM update are different
boundaries. A selection wait must compare the same empty representation as its
pre-key sample, or it can declare success before any row is selected. See
`test/browser/inventory-selection.ts`, `inventorySelectionChanged`, and
`test/inventorySelectionWait.test.ts` for the missing-row regression. Wait for
an observed UID change, not elapsed wall time or an injected selection. Debug
toggles apply on the next frame; in a browser stage, use `pressAction`, wait for
the effect, and only then assert.

## Render-free browser logic stages

`?render=0` is a development-only, ordinary-play opt-in that skips WebGL presentation
(Mood and shadow resources) while keeping world setup, simulation and input active. It is
ignored by production builds and benchmark URLs. Chromium logic stages pair it with
`--disable-gpu`; visual stages retain SwiftShader and pixel coverage.

Stage assignments live in `test/browser/stage-mode.mjs`, `modes`. The Chromium OPFS Continue
autosave scenario and the quarantined Firefox IndexedDB Continue scenario are intentional
pixel-mode exceptions: each builds the production bundle and loads it through Vite preview.

The pump-handling stage is render-free because it checks input, inventory, handling and audio, not
pixels. `test/browser/pump-handling.mjs` observes canvas context requests and asserts that the
stage creates no WebGL context while its simulation and input assertions pass. Add future stages
to the shared mode helper and use its URL/launch helpers together so the render choice and browser
flags stay aligned; put pixel-only checks in an existing visual stage. `tools/ui-browser-contract.mjs`
checks DOM and input only, so it runs render-free and asserts no WebGL context, which keeps it off
the SwiftShader initialization path in #256.

Install Firefox once with `npx playwright install --with-deps firefox`, then from
`deadvox/` run `xvfb-run -a npm run test:browser:firefox` (no `xvfb-run` on a desktop).
This matches CI's enabled cases: explicitly synthetic pointer-lock UI coverage, storage
protocol/kill stages, an independent busy-lock relaunch, and IndexedDB replacement.
The UI checks wait for positive simulation advance, paused nonadvance across observed
frames, and resumed advance—not a HUD minute reached within a wall-clock interval.

Two single-case quarantines remain; a fresh pass does not establish a fix:
- [#168](https://github.com/roobie/skelly/issues/168): native first-gesture pointer-lock
  refusal. Investigate with `xvfb-run -a npm run test:browser:firefox:native`.
- [#170](https://github.com/roobie/skelly/issues/170): built IndexedDB Continue's canvas
  timeout. Investigate with `xvfb-run -a npm run test:browser:firefox:continue`.
Neither is in the default Firefox command. No retries or increased bounds; record a
fixed trial plan and before/after/restored-before evidence before reinstating a case.

Treat the system Chrome 154 + Playwright 1.63 pairing as unsupported: all observed launch
failures used system Chrome, while managed Chromium had zero launch failures in the 91-run
sample. The cause remains unproven; the 240-launch source × bus comparison did not establish
one. Issue #287 stays open for the root cause.
See `test/browser/chromium.mjs`, `launchChromium`, for the shared managed launch boundary,
and `docs/browser-ci.md` for CI evidence.

Save-browser waits emit `BROWSER_FAILURE` without changing the failing result. It
separates absent, hidden/zero-size and unresponsive canvases; records navigation/load,
crash/close/context-loss events, page/console errors, last responsive frame/simulation
time, child output/exit status, and parent/child cgroup memory limits/events/pressure.
Each failure page evaluation is bounded to five seconds. Firefox's public managed
server API supplies child-process diagnostics; this is test infrastructure, not product
persistence policy. Cgroup deltas cover the entire named group, not just the renderer:
`high` reclaim pressure is not an OOM or proof of an app leak.

The busy-lock fixture owns a real exclusive Web Lock in a same-origin blank document.
It needs no second world, renderer or save worker; seeding and recovery use the built
app. It explicitly simulates pointer lock and does not claim native-gesture coverage.

## Tiled site export

If Tiled reports “Format not recognized” for the authored-site export, trust the
project's scripts before choosing the Deadvox site-layout format. After using the
project action to generate Deadvox property types, close and reopen the project so
Tiled refreshes them; do not save the stale project state in between. See
`maps/extensions/deadvox.mjs`, `exportLayout` and `generatePropertyTypes`, for the
exporter and project action.
