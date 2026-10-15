---
read_if:
  - you're changing procedural surface weathering or building appearance
  - you're changing the solar-phase look, flashlight daylight adaptation, beam shape or spill, or evaluating renderer performance
  - you're changing wide ambient occlusion or its interaction with skylight
  - you're changing content-defined graphics policy or per-machine graphics settings, or evaluating GPU quality trials
  - you're adding or evaluating opt-in GPU quality trials
  - you're interpreting or changing debug draw submission counters
---

# Deadvox graphics

The graphics direction is driven by atmosphere and readability, not realism. The detailed rationale for the look is in [DESIGN.md](DESIGN.md#a-world-that-feels-real); visual debugging guidance is in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Look decisions

Tone mapping follows the solar cycle: neutral in bright daylight, shifting toward ACES at dawn and dusk and using ACES at night. The by-eye choice gives daylight a natural palette while retaining depth in darkness. Weathering adds render-only age without replacing material identity; named profiles let authored scenes vary it. See `src/core/mood.ts`, `DEFAULT_LOOK`, and `src/render/autoTone.ts`.

Distance fog, the clear background and height mist share the camera's diffuse sky visibility so they cannot glow where the sky cannot reach. Use the interior field's spatial interpolation rather than a separate transition, keeping doorway changes aligned with held-item lighting. See `src/render/playView.ts`, `prepareLighting`; `src/render/sky.ts`, `applySky`; and `src/render/mood.ts`, `Mood.setSky`.

A flashlight beam fades in full daylight because its pool is not worth drawing or shadowing against the sun. Adapt its strength to the sky where the beam lands, not where the player stands, so a lit player can still illuminate a dark doorway. See `src/render/playView.ts`, `prepareLighting`, and `src/render/flashlight.ts`, `flashlightDaylightScale`.

Battery beams keep their focused hotspot inside a dim, softly fading spill because the surrounding pool should remain readable without becoming as bright as the centre. Blend both lobes in one spot-light profile and widen its shadow camera so the spill cannot shine through occluders or require another shadow pass. Item beam content owns the spill profile alongside the hotspot shape because different kinds of beam can need different pools. Switch the shared light's uniforms, not its shader, when the active item changes. See `src/core/schema.ts`, `BeamSpillSchema`, and `src/content/base/items-tools.libsonnet`, `batteryBeam`. The shared path covers handheld and head-mounted beams; weapon-mounted flashlights lack nested lens resolution (#763) and receive no rendered beam or spill. Simulation awareness remains independent of the rendered cone. See `src/render/flashlightCone.ts`, `withFlashlightSpill`, and `src/render/flashlight.ts`, `Flashlight`.

Post-processing and shadows support the intended mood. Compare the same workload on a real GPU before claiming a performance win; SwiftShader cannot establish reference-GPU cost. Keep image changes separate from waste removal so visual quality remains an operator decision. See `src/bench/post.ts`, `benchDraw`.

Tone mapping, display transfer and colour grading share a fullscreen draw because storing and sampling an intermediate display-space image adds GPU work without adding an effect. Grade remains after tone mapping and transfer so its controls keep their display-referred meaning; bloom stays before them in linear light. See `src/render/moodOutput.ts`, `createMoodOutputPass`, and `src/render/mood.ts`, `Mood`.

A measured cost reduction does not authorize a different default look; default changes require the operator's visual judgment. Scale the post-chain inputs rather than the canvas so DOM/HUD readability and display-space film stay independent of scene resolution. The direct no-post path remains unscaled. See `src/render/mood.ts`, `Mood.setRenderScale` and `Mood.setBloomScale`.

Coarser surface detail can retain weathering and camouflage while changing their appearance, so it is a visual choice rather than equivalent-image waste removal. World anchoring still matters for continuity across faces and chunks; changing detail does not justify changing geometry or shadow-caster visibility. See `src/render/chunks.ts`, `ChunkMeshes.setCoarseWeathering` and `ChunkMeshes.setFastCamo`, and `src/render/surfacePatterns.ts`, `camoColor`. Smaller sun maps keep biases and grid snapping tied to their actual texel size to avoid trading raster cost for acne or unstable edges; see `src/render/shadows.ts`, `Shadows.setSmallSunMap`.

Wide ambient occlusion darkens indirect light according to enclosure, while direct sun and flashlight lighting remain separate. The mesher's corner AO remains unchanged. Weathering changes rendering only; building-geometry changes are tracked separately by #396. See `src/core/occlusion.ts` and `src/render/chunks.ts`, `chunkMaterial`.

## Graphics policy

Keep graphics defaults and permitted choices in the core mod, while the player owns the
choice for their machine: a content pack cannot know their GPU. Debug URL overrides must
win over player choices, which must win over content defaults. Explicit false values are
choices, not absence. See `src/content/base/graphics.jsonnet`,
`src/core/graphics.ts`, `resolveGraphics`, and `src/game/graphicsSettings.ts`.

Benchmarks use only effective mod defaults, ignoring machine preferences and debug graphics
URL overrides, because saved choices must not silently change the comparison workload.
See `src/game/engine.ts`, `createEngine`, and `src/main.ts`.

Persist only explicit player choices, not resolved defaults or debug overrides, so a mod's
policy can change without stale defaults becoming machine preferences. Validate stored
choices against the effective content policy before using them; unavailable storage must
not prevent play. See `src/core/graphics.ts`, `validGraphicsSettings`.

Graphics options are meta controls because hardware preferences are not character knowledge.
Clearing a preference returns ownership to content rather than saving its resolved default.
Debug overrides remain separate from preferences, and unrelated look changes must not promote
player or mod values into the URL. See `src/ui/graphicsOptions.ts`, `renderGraphicsOptions`,
`src/game/graphicsControls.ts`, `GraphicsControls`, and `src/debug/lookUrl.ts`, `writeLookParams`.

## Performance diagnostics

Debug-only whole-frame CPU submission counters distinguish batching growth from drawing-buffer pixel load alongside frame-time percentiles. Repeated geometry submissions count again; these are not unique geometry counts or GPU timings. GPU cost requires asynchronous timing probes on real hardware. See `src/render/drawCounters.ts`, `DrawCounters`, for frame-scoped collection; `src/debug/index.ts`, `readoutTemplate`, and `src/debug/lookDump.ts`, `lookDump`, for the readout and dump.

## Unresolved constraints

- Sun-shadow rendering and flashlight falloff rely on three.js internals; upgrades must fail loudly until these hooks have a supported replacement.
- Wide occlusion is tuned by eye on limited indoor scenes. Revisit its strength when Slice 4a skylight overlaps with it.
- Dawn/dusk tone transitions and weathering profiles need review on a real GPU.
- Debug-only look controls must move before their reserved gameplay inputs are bound.
- Shader warm-up gaps remain for model materials and the no-post-processing path.
