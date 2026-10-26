---
read_if:
  - you evaluate camera-only optical borders against authored world geometry
  - you compare authored eye relief with aperture-fill-derived ADS placement
  - you compare an ocular world disc with relief-sized eyecup geometry
  - you change ADS-only housing visibility or reticle projection
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

A hollow eyecup can cover the rim but cannot replace rays through the tube with
world imagery. The unity-power world disc therefore remains a separate choice;
above unity the zoom image already replaces the interior. See
`packages/deadvox/src/render/opticsSpike.ts`, `opticsTubePresentation`; and
`packages/deadvox/src/render/opticLens.ts`, `OpticLensRenderer.prepare`.
Both image paths exclude the player's close-eye geometry so neither magnifies
nor copies the instrument back into its own window.

Eyecups are authored content sized to the relief placement, not a general fix for
every eye distance or field of view. See
`packages/gun-authoring-tool/src/gun/optics.ts`, `eyecup`; and
`packages/gun-authoring-tool/src/gun/opticPresentation.jsonnet`.
An ADS-only mask must not change the instrument seen outside ADS or erase the
near rim that locates the aperture. The near frame remains visible while the
lengthwise housing uses temporary visibility in
`packages/deadvox/src/render/hands.ts`, `HeldItems.syncOpticPieces`.
The retained frame paints over the housing's existing occupied volume rather
than changing its full silhouette; see
`packages/gun-authoring-tool/src/gun/optics.ts`, `nearFrame`.
Frame dimensions remain authored in
`packages/gun-authoring-tool/src/gun/opticPresentation.jsonnet`.
Keeping the opaque battery front below the transparent pane avoids a voxel-shared
interface that removes its eye-facing surface; see
`packages/gun-authoring-tool/test/optics.test.ts`,
"voxel holographic battery presents an opaque eye-facing surface rather than a hole through glass neighbours".
Relief and housing dimensions remain content choices rather than optic-specific
rendering rules.

The aperture clips a finite glass opening, but the reticle represents the sight's
aim direction on the world image. Attaching both to the glass centre introduces
parallax when the instrument translates relative to the eye. Project the sight
direction through the image camera's field of view instead; see
`packages/deadvox/src/core/opticView.ts`, `projectOpticReticle`; and
`packages/deadvox/src/render/opticLens.ts`, `setOpticLensUniforms`.
The reticle stays clipped by the physical aperture; its centre is independent of
that aperture's finite distance.
