---
read_if:
  - you evaluate camera-only optical borders against authored world geometry
  - you compare authored eye relief with aperture-fill-derived ADS placement
  - you change the spike's non-magnifying stock-cheek fit exemption
  - you change scope disc presentation or investigate a tube-to-disc gap
  - you change ADS-only housing visibility or reticle projection
  - you change which owner geometry appears inside unity or magnified optic images
  - you change how a world disc or reticle respects opaque optic housing
  - you tune a clear optic window or hide overlapping HUD aim marks
  - you investigate a gap where a voxel optic body meets transparent glass
  - you test night-vision or worn-visor effects against the world presentation
---

# Optical border comparison

This is a disposable visual comparison, not an actor-owner migration. Optical
borders need a separate judgement because a close-eye perceptual mask need not
have the same constraints as a physical object seen by another observer.

See `packages/deadvox/src/render/opticsSpike.ts`, `opticsSpikeFromSearch`;
`packages/deadvox/src/render/hands.ts`, `HeldItems.configureOpticsSpike`; and
`packages/deadvox/src/render/playerFigure.ts`, `PlayerMeshes.opticsSpikeWorldBorders`.
The chosen world presentation and authored eye relief are the spike defaults;
URL overrides remain useful for comparisons. Existing pose owners remain separate
deliberately: consolidating them would obscure the optical comparison with an
unrelated animation migration.

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

Fixed-power unmagnified sights share authored relief so their eye placement can
be compared consistently. Their stock-cheek constraint is suspended for the look
comparison, not rejected as a final authoring rule: the pistol view must be judged
before deciding that constraint. See
`packages/gun-authoring-tool/src/gun/opticPresentation.jsonnet`; and
`packages/gun-authoring-tool/src/gun/rules.ts`, `opticEyeRelief`.

Every unmagnified optic shares one presentation: the world disc.
The holographic window follows the scope-at-unity presentation because that
image was chosen in the visual comparison. The eyecup comparison is not retained: the disc was chosen,
and cups only add geometry outside the scope body without replacing rays through
the tube with world imagery. The hybrid comparison also has no purpose without
cups. See
`packages/deadvox/src/render/opticsSpike.ts`, `defaultOpticsTube`; and
`packages/deadvox/src/render/opticLens.ts`, `OpticLensRenderer.prepare`.
At unity, the image must retain the rifle's own sights, barrel and rail: the disc
replaces the window, not the objects visible through it. Only the active owner's
mounted optic, including its body and glass, must not copy itself into the image.
The separate physical-player view stays excluded to avoid drawing a second gun.
The mounted slot identifies the optic without content-ID branches; see
`packages/deadvox/src/render/hands.ts`, `HeldItems.syncOpticLayers`.

A nominal aperture is not permission to paint over physical hardware. The disc
and reticle must yield to the actual opaque housing silhouette, even where the
nominal opening overlaps it. Keeping that silhouette separate from the world
image preserves both the housing and the mounted-optic self-exclusion. Glass
must not occlude the replacement image or the mask would disable the window.
The silhouette needs its own scene so it cannot consume a world-shadow update
under a different camera. See `packages/deadvox/src/render/shadows.ts`, `Shadows.drawMaps`.
See `packages/deadvox/src/render/opticHousingMask.ts`, `OpticHousingMask.prepare`;
and `packages/deadvox/src/render/opticLens.ts`, `OpticLensRenderer.prepare`.

The clear window, not overpaint through its housing, owns the apparent opening.
The mini reflex keeps a wider authored tunnel for the intermediate sight picture;
see `packages/gun-authoring-tool/src/gun/opticPresentation.jsonnet`, `miniReflex`.
An optic's reticle replaces overlapping HUD aim marks while it is presented,
otherwise a small dot can be hidden by the crosshair despite a clear optical path.
See `packages/deadvox/src/ui/playHud.ts`, `playCrosshairFrame`; and
`packages/deadvox/src/game/play.ts`, `opticReticleVisible`.

Above unity, the image remains world-only. A real scope focuses far away and its
front post blurs out; copying the sharp close-eye gun into a magnified disc would
misrepresent that view. Blur handling needs a separate visual judgement, not an
implicit change to the magnified image. See
`packages/deadvox/src/render/opticLens.ts`, `OpticLensRenderer.prepare`.

Disc diameter and eye relief are independent authored choices: reducing the
disc at relief placement exposes more of the physical rim without moving it.
Aperture-fill placement instead intentionally derives distance from that diameter.
Opaque voxel surfaces must remain present beside transparent glass; culling that
interface opens a false gap through the instrument in every view. Neither a larger
disc nor a different eye placement repairs the exported surface. See
`packages/thing-export/src/glb.ts`, `voxelPrimitivesFor`; and
`packages/gun-authoring-tool/test/opticTubeExport.test.ts`.
The whole disc-to-lip annulus must remain opaque, not only a narrow band next to
the disc. Adjacent opaque comparison geometry can suppress exported tube faces
that become holes when that geometry is hidden. Removing the unused cups before
export avoids that hidden-neighbour dependency without changing the scope body.

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
rendering rules. A sight datum and its clearance corridor may bisect aperture-edge
grid stations: centring the sight must not move the opening to satisfy a grid
check. See `packages/gun-authoring-tool/test/partSweepChecks.ts`, `definePartChecks`.

Effect-mask tests must select that presentation explicitly rather than inherit
the world default. The world presentation uses physical worn geometry instead of
the camera-attached visor and NVG border masks; it must still preserve the player's
night-vision gain and colour without applying them to a spectator. See
`packages/deadvox/src/render/playView.ts`, `setViewEffects`; and
`packages/deadvox/test/browser/primary-action-pixel.mjs`, `heldItemChecks`.

The aperture clips a finite glass opening, but the reticle represents the sight's
aim direction on the world image. Attaching both to the glass centre introduces
parallax when the instrument translates relative to the eye. Project the sight
direction through the image camera's field of view instead; see
`packages/deadvox/src/core/opticView.ts`, `projectOpticReticle`; and
`packages/deadvox/src/render/opticLens.ts`, `setOpticLensUniforms`.
The reticle stays clipped by the physical aperture; its centre is independent of
that aperture's finite distance.
