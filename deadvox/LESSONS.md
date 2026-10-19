---
read_if:
  - you're changing an area with a lesson below
  - you're troubleshooting an input, browser, save, rendering or resource-lifetime problem
  - you're changing new-world startup, gesture-gated pointer capture or browser launch probes
  - you're changing save-worker timeout policy or interpreting its request diagnostics
  - you're sizing browser-stage budgets after adding pixel captures
  - you're changing sparse vehicle meshing or investigating startup CPU cost
  - you've solved a hard problem and need to preserve its reason
---

# Deadvox lessons

These are reusable constraints, not incident timelines. Code and tests own the mechanism; this file keeps the reasons that are easy to lose during a later change.

## Input capture

Apply mode-specific suppression when input is captured, using the mode at that edge; retain the later guard as defense in depth. Fixed-step simulation may consume an input after the rendering mode has changed. Browser proof should observe the actual simulation boundary, not infer consumption from a frame. See `test/input.test.ts`, "does not retain a dominant press refused by the active owner".

## Browser readiness

Before gameplay or debug commands, browser stages must wait for world readiness after each start or reload. A mounted debug UI, pointer lock, dismissed title menu or unpaused simulation does not certify readiness; before the first frame, the simulation's initial pause value can precede loading admission. Commands under the loading mask are deliberately discarded. Observe the loading owner or the mounted mask's completed state, not optional external resources. See `src/game/worldLoading.ts`, `WorldLoading`, and `src/ui/worldLoading.ts`, `mountWorldLoading`.

Request pointer capture before constructing a new world: synchronous setup can outlast the browser's transient user activation even within the click handler. Let the gesture handler return before setup so native capture can settle without competing with construction. Repeated acceptance while that work is pending must not create another survivor. A ready world with refused capture remains paused, so a debug route's missing output does not imply loading is still pending. See `src/main.ts`, `saveController.setNewWorldLauncher`, `src/game/input.ts`, `requestInputLock`, `src/ui/saveController.ts`, `confirmNewWorld`, and `test/browser/stairs.mjs`.

Persistence probes must wait for controller entry before touching the bound session: accepting a launch gesture does not mean construction or checkpoint binding has finished. See `src/ui/saveController.ts`, `isEntered`, and `test/browser/save-storage.mjs`, `testTitleAndAutosave`.

Furniture occlusion depends on standing geometry, not container search state. Repeating shape transforms for every lighting field multiplies startup work by both furniture and field count without adding information. See `src/render/skylight.ts`, `refreshEntities`, and `test/skylightFields.test.ts`, "shares one furniture bounds scan across fields and readiness polls until standing geometry changes".

Local pixel fixtures should load only the terrain needed by their observation. A nearby dropped-light check does not earn the cost of a distant view ring; full-ring readiness makes that unrelated work part of startup. Keep the pixel oracle and completed-readiness boundary intact rather than lengthening the wait. See `test/browser/primary-action-pixel.mjs`, `measureGlowstickFloor`.

Reference-source overlays keep a presentation frame's producer and consumer at one revision while retaining the branch's core owners. A mismatched frame contract can stop the startup frame loop before meshing delivers results; the loading owner consumes the error, so an empty browser-error list does not rule it out. See `test/browser/sky-main-arrival.mjs`, `mainSourceOverlays`.

Keep Playwright's managed launch path and isolated profiles: desktop keyring initialization and DevTools discovery have delayed custom launches, while unrelated resource load is not a game readiness contract. Do not warm up a request, retry a failed stage or lengthen its readiness wait to hide a launch problem. See `test/browser/chromium.mjs`, `launchChromium`, and `test/browser/save-storage.mjs`, `trackPageNavigation`.

Pixel readbacks can dominate a software-rendered stage even when individual frames remain comparable. When adding captures, compare the same phases against a green control and scale only the added work's share of the stage budget, rounding up to the workflow's time unit. Do not treat the total stage duration as proof of a rendering regression, or enlarge a budget to hide one. Keep capture timings separate from readiness so later failures remain attributable; see `test/browser/stairs.mjs`, `lightingCellarProofs` and `timePhase`.

## Persistence requests

Ask for durable-storage permission only after the player chooses it; startup may inspect existing status without opening a browser prompt. Metadata queries must be bounded, and an unknown status must not hide the explicit request action. Never interpret a non-prompting status query as refusal.

## Simulation identity

Cosmetic presentation must stay outside simulation identity. Keep draw, HUD projection and render lifecycle out of fingerprinted gameplay modules when possible; do not broadly exclude a mixed module. Test the observable boundary rather than callback spelling. See `tools/simulationFingerprint.ts` and `test/simulationFingerprint.test.ts`.

## Sound admission

Admit and commit seeded sound choice, cooldown and hearing stimulus in the simulation before calling playback. Audio output may be unavailable or a file missing; that must not undo zombie hearing. Keep output allocation separate from simulation admission. Footsteps with continuous movement hearing are a separate perception input, not duplicate discrete noise.

## Item ownership

Hands, worn slots and container/pile/furniture trees own items. Quickbar bindings and selected lights hold UIDs and resolve them through inventory; they are not aliases that require lifetime cleanup; a quickbar binding resolves only among carried items (`deadvox/INTERACTIONS.md`, "Ownership"). At snapshot boundaries validate saved light references rather than repairing malformed data. See `src/core/itemTree.ts`, `walkItemTree`, and `src/core/inventory.ts`, `Inventory.itemByUid`.

## Save-storage deadlines

Bound lock acquisition separately from worker I/O. Cancel only a queued lock request; never steal a held writer lock. A frozen page can hold the origin lock, so the current page cannot recover it. Use a controlled lock holder to prove timeout and recovery rather than depending on a timing race. See `src/game/saveStorage.ts`, `SaveStorage.withLock`, and `docs/decisions/0002-saves.md`.

An unanswered worker request keeps its deadline. Only a clearly late deadline callback grants one short dispatch grace: a stalled main thread can run a due timer before an already queued healthy reply. A matching reply cancels the active timer, including that grace; an on-time timeout fails immediately. The grace cannot repeat even if its callback is also delayed, so a silent worker is still terminated. See `src/game/saveStorage.ts`, `SaveStorage.request` and `SAVE_REPLY_GRACE_REAL_MS`.

The timeout error and console warning identify the unanswered request's phase, selected backend and elapsed time, along with the initial timer's lateness and available binary-payload size. An unselected backend or unmeasured payload size remains unknown, not a zero-cost observation. These details distinguish main-thread dispatch delay from ordinary deadline expiry and locate the operation to investigate; they do not prove a backend hang or that an unacknowledged commit never reached disk. Payload size is not the entire cloned-message size, and timeout diagnostics are not worker-execution timings.

## Sparse vehicle meshing

Empty space in a sparse vehicle grid contributes no faces. Repeatedly probing a model's entire bounding volume for each face direction and transparency pass makes empty gaps part of startup cost. Neighbour queries should follow occupied voxels instead; the exposed-face and material rules must remain unchanged. See `src/vehicles/voxels.ts`, `meshPass`, and `test/vehicleParts.test.ts`, "queries only occupied voxels’ neighbours when meshing sparse solid and glass slices".

## GPU resource ownership

Renderer memory counters do not cover every instance buffer or VAO. Dispose owned instanced resources on removal and presentation teardown, but never dispose shared model geometry/materials. Delayed asset loads may replace a fallback only while the owning slot still exists. See `test/browser/case-visual-pool.mjs`.

## Shader interpolation

With MSAA, edge samples can extrapolate non-flat varyings beyond their vertex values. Use centroid interpolation for shading inputs and clamp derived values to their valid range. Run the hot check after the final shading stage, and confirm driver-specific claims on a real GPU; SwiftShader cannot rule them out. See `TROUBLESHOOTING.md`, "Debug and rendering".

## Pointer-lock scrolling

A CSS overflow region cannot retarget a locked wheel to the drawn cursor. Route it to the nearest scrollable ancestor, consume it at pane edges, and keep free-pointer behavior distinct from synthetic locked-cursor coverage. See `src/ui/menuPointer.ts`, `mountMenuPointer`, and `src/ui/wheel.ts`, `wheelPixels`.
