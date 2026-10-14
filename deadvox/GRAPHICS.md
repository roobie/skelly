---
read_if:
  - you're changing procedural surface weathering or building appearance
  - you're changing the solar-phase look, flashlight daylight adaptation, or evaluating renderer performance
  - you're changing wide ambient occlusion or its interaction with skylight
  - you're adding or evaluating opt-in GPU quality trials
---

# Deadvox graphics

The graphics direction is driven by atmosphere and readability, not realism. The detailed rationale for the look is in [DESIGN.md](DESIGN.md#a-world-that-feels-real); visual debugging guidance is in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Look decisions

Tone mapping follows the solar cycle: neutral in bright daylight, shifting toward ACES at dawn and dusk and using ACES at night. The by-eye choice gives daylight a natural palette while retaining depth in darkness. Weathering adds render-only age without replacing material identity; named profiles let authored scenes vary it. See `src/core/mood.ts`, `DEFAULT_LOOK`, and `src/render/autoTone.ts`.

Distance fog, the clear background and height mist share the camera's diffuse sky visibility so they cannot glow where the sky cannot reach. Use the interior field's spatial interpolation rather than a separate transition, keeping doorway changes aligned with held-item lighting. See `src/render/playView.ts`, `prepareLighting`; `src/render/sky.ts`, `applySky`; and `src/render/mood.ts`, `Mood.setSky`.

A flashlight beam fades in full daylight because its pool is not worth drawing or shadowing against the sun. Adapt its strength to the sky where the beam lands, not where the player stands, so a lit player can still illuminate a dark doorway. See `src/render/playView.ts`, `prepareLighting`, and `src/render/flashlight.ts`, `flashlightDaylightScale`.

Post-processing and shadows support the intended mood. Compare the same workload on a real GPU before claiming a performance win; SwiftShader cannot establish reference-GPU cost. Keep image changes separate from waste removal so visual quality remains an operator decision. See `src/bench/post.ts`, `benchDraw`.

Tone mapping, display transfer and colour grading share a fullscreen draw because storing and sampling an intermediate display-space image adds GPU work without adding an effect. Grade remains after tone mapping and transfer so its controls keep their display-referred meaning; bloom stays before them in linear light. See `src/render/moodOutput.ts`, `createMoodOutputPass`, and `src/render/mood.ts`, `Mood`.

GPU quality trials stay debug-only until the operator judges the paired images by eye: a measured cost reduction does not authorize a different default look. Scale the post-chain inputs rather than the canvas so DOM/HUD readability and display-space film stay independent of scene resolution. The direct no-post path remains unscaled. See `src/debug/lookUrl.ts`, `parseLookParams`, and `src/render/mood.ts`, `Mood.setRenderScale` and `Mood.setBloomScale`.

Coarser surface detail can retain weathering and camouflage while changing their appearance, so it is a visual choice rather than equivalent-image waste removal. World anchoring still matters for continuity across faces and chunks; changing detail does not justify changing geometry or shadow-caster visibility. See `src/render/chunks.ts`, `ChunkMeshes.setCoarseWeathering` and `ChunkMeshes.setFastCamo`, and `src/render/surfacePatterns.ts`, `camoColor`. Smaller sun maps keep biases and grid snapping tied to their actual texel size to avoid trading raster cost for acne or unstable edges; see `src/render/shadows.ts`, `Shadows.setSmallSunMap`.

Wide ambient occlusion darkens indirect light according to enclosure, while direct sun and flashlight lighting remain separate. The mesher's corner AO remains unchanged. Weathering changes rendering only; building-geometry changes are tracked separately by #396. See `src/core/occlusion.ts` and `src/render/chunks.ts`, `chunkMaterial`.

## Unresolved constraints

- Sun-shadow rendering and flashlight falloff rely on three.js internals; upgrades must fail loudly until these hooks have a supported replacement.
- Wide occlusion is tuned by eye on limited indoor scenes. Revisit its strength when Slice 4a skylight overlaps with it.
- Dawn/dusk tone transitions and weathering profiles need review on a real GPU.
- Debug-only look controls must move before their reserved gameplay inputs are bound.
- Shader warm-up gaps remain for model materials and the no-post-processing path.
