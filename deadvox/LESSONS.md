---
read_if:
  - you're changing an area with a lesson below
  - you're troubleshooting an input, browser, save, rendering or resource-lifetime problem
  - you've solved a hard problem and need to preserve its reason
---

# Deadvox lessons

These are reusable constraints, not incident timelines. Code and tests own the mechanism; this file keeps the reasons that are easy to lose during a later change.

## Input capture

Apply mode-specific suppression when input is captured, using the mode at that edge; retain the later guard as defense in depth. Fixed-step simulation may consume an input after the rendering mode has changed. Browser proof should observe the actual simulation boundary, not infer consumption from a frame. See `test/input.test.ts`, "does not retain a dominant press refused by the active owner".

## Browser readiness

Browser stages should wait for app readiness, not optional external resources. Keep Playwright's managed launch path and isolated profiles: desktop keyring initialization and DevTools discovery have delayed custom launches, while unrelated resource load is not a game readiness contract. Do not warm up a request, retry a failed stage or raise its timeout. See `test/browser/chromium.mjs`, `launchChromium`, and `test/browser/save-storage.mjs`, `trackPageNavigation`.

## Persistence requests

Ask for durable-storage permission only after the player chooses it; startup may inspect existing status without opening a browser prompt. Metadata queries must be bounded, and an unknown status must not hide the explicit request action. Never interpret a non-prompting status query as refusal.

## Simulation identity

Cosmetic presentation must stay outside simulation identity. Keep draw, HUD projection and render lifecycle out of fingerprinted gameplay modules when possible; do not broadly exclude a mixed module. Test the observable boundary rather than callback spelling. See `tools/simulationFingerprint.ts` and `test/simulationFingerprint.test.ts`.

## Sound admission

Admit and commit seeded sound choice, cooldown and hearing stimulus in the simulation before calling playback. Audio output may be unavailable or a file missing; that must not undo zombie hearing. Keep output allocation separate from simulation admission. Footsteps with continuous movement hearing are a separate perception input, not duplicate discrete noise.

## Item ownership

Hands, worn slots and container/pile/furniture trees own items. Quickbar bindings and selected lights hold UIDs and resolve them through inventory; they are not aliases that require lifetime cleanup. At snapshot boundaries validate saved references rather than repairing malformed data. See `src/core/itemTree.ts`, `walkItemTree`, and `src/core/inventory.ts`, `Inventory.itemByUid`.

## Save-lock deadlines

Bound lock acquisition separately from worker I/O. Cancel only a queued request; never steal a held writer lock. A frozen page can hold the origin lock, so the current page cannot recover it. Use a controlled lock holder to prove timeout and recovery rather than depending on a timing race. See `src/game/saveStorage.ts`, `SaveStorage.withLock`, and `docs/decisions/0002-saves.md`.

## GPU resource ownership

Renderer memory counters do not cover every instance buffer or VAO. Dispose owned instanced resources on removal and presentation teardown, but never dispose shared model geometry/materials. Delayed asset loads may replace a fallback only while the owning slot still exists. See `test/browser/case-visual-pool.mjs`.

## Shader interpolation

With MSAA, edge samples can extrapolate non-flat varyings beyond their vertex values. Use centroid interpolation for shading inputs and clamp derived values to their valid range. Run the hot check after the final shading stage, and confirm driver-specific claims on a real GPU; SwiftShader cannot rule them out. See `TROUBLESHOOTING.md`, "Debug and rendering".

## Pointer-lock scrolling

A CSS overflow region cannot retarget a locked wheel to the drawn cursor. Route it to the nearest scrollable ancestor, consume it at pane edges, and keep free-pointer behavior distinct from synthetic locked-cursor coverage. See `src/ui/menuPointer.ts`, `mountMenuPointer`, and `src/ui/wheel.ts`, `wheelPixels`.
