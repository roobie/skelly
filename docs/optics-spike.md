---
read_if:
  - you evaluate camera-only optical borders against authored world geometry
  - you compare authored eye relief with aperture-fill-derived ADS placement
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
would obscure the optical comparison with an unrelated animation migration.

Eye placement is a separate judgement from border ownership: realistic eye relief
can make the sight picture smaller, regardless of how its border is drawn. The
comparison must project the aperture from the same distance used to place the
instrument, or the image and housing would disagree. See
`packages/deadvox/src/render/opticsSpike.ts`, `opticsEyeDistance`; and
`packages/deadvox/src/render/actorAnimator.ts`, `ActorViewPlacement`.
This compares relative eye-to-instrument placement, not a shared physical ADS
pose or a change to the gameplay camera trajectory. The camera and instrument
must describe the same frame: a screen-space aperture cannot stay aligned with
world geometry posed from an earlier camera sample. See
`packages/deadvox/src/game/play.ts`, `updateFrame`.

Authored world geometry is the limit of this experiment. Missing close-eye
interiors are a result to report, not permission to invent replacement assets.
The magnified image excludes the player's close-eye geometry to avoid magnifying
the instrument itself; see `packages/deadvox/src/render/opticLens.ts`,
`OpticLensRenderer.prepare`.
