---
read_if:
  - you're changing procedural surface weathering or building appearance
  - you're changing the solar-phase look or evaluating renderer performance
  - you're changing wide ambient occlusion or its interaction with skylight
---

# Deadvox graphics

The graphics direction is driven by atmosphere and readability, not realism. The detailed rationale for the look is in [DESIGN.md](DESIGN.md#a-world-that-feels-real); visual debugging guidance is in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Look decisions

Tone mapping follows the solar cycle: neutral in bright daylight, shifting toward ACES at dawn and dusk and using ACES at night. The by-eye choice gives daylight a natural palette while retaining depth in darkness. Weathering adds render-only age without replacing material identity; named profiles let authored scenes vary it. See `src/core/mood.ts`, `DEFAULT_LOOK`, and `src/render/autoTone.ts`.

Post-processing and shadows support the intended mood, but their cost on a reference GPU remains unmeasured. SwiftShader is not evidence of reference-GPU performance. Keep same-workload comparisons before making performance claims. See `src/bench/post.ts`, `benchDraw`.

Wide ambient occlusion darkens indirect light according to enclosure, while direct sun and flashlight lighting remain separate. The mesher's corner AO remains unchanged. Weathering changes rendering only; building-geometry changes are tracked separately by #396. See `src/core/occlusion.ts` and `src/render/chunks.ts`, `chunkMaterial`.

## Unresolved constraints

- Sun-shadow rendering and flashlight falloff rely on three.js internals; upgrades must fail loudly until these hooks have a supported replacement.
- Wide occlusion is tuned by eye on limited indoor scenes. Revisit its strength when Slice 4 skylight overlaps with it.
- Dawn/dusk tone transitions and weathering profiles need review on a real GPU.
- Debug-only look controls must move before their reserved gameplay inputs are bound.
- Shader warm-up gaps remain for model materials and the no-post-processing path.
