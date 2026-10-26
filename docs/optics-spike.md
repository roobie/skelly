---
read_if:
  - you evaluate camera-only optical borders against authored world geometry
---

# Optical border comparison

This is a disposable visual comparison, not an actor-owner migration. Optical
borders need a separate judgement because a close-eye perceptual mask need not
have the same constraints as a physical object seen by another observer.

See `packages/deadvox/src/render/opticsSpike.ts`, `opticsSpikeFromSearch`;
`packages/deadvox/src/render/hands.ts`, `HeldItems.configureOpticsSpike`; and
`packages/deadvox/src/render/playerFigure.ts`, `PlayerMeshes.opticsSpikeWorldBorders`.
The opt-in boundary keeps ordinary play unchanged while the presentation is
unsettled. Existing pose owners remain separate deliberately: consolidating them
would obscure the border comparison with an unrelated animation migration.

Authored world geometry is the limit of this experiment. Missing close-eye
interiors are a result to report, not permission to invent replacement assets.
The magnified image excludes the player's close-eye geometry to avoid magnifying
the instrument itself; see `packages/deadvox/src/render/opticLens.ts`,
`OpticLensRenderer.prepare`.
