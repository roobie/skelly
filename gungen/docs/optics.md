---
read_if:
  - you're changing optic envelopes, geometry or receiver mounting constraints
  - you're authoring or resizing an iron rear sight's notch or aperture
  - you're changing how an optic's lens glass looks or which coating tint it shows
  - you're changing the cross section of a round optic body
  - you're retracing the fixed prism or changing its backup irons or top-loader compatibility
---

# Optic reference envelopes

Optics are static, persisted attachment choices. Their catalog shapes are visual classes based on cited products, not manufacturer CAD; reticles, zoom, night vision and thermal behavior are outside this model. The catalog owns source dimensions and mount requirements in `src/gun/optics.ts`, `OPTIC_CATALOG`.

## Fixed prism reference

The fixed prism uses the [TA31F published dimensions](https://www.trijicon.com/products/details/ta31f) as its size constraint, except that its taller mount neck may exceed the published height because the optic needs visible rise above the rail fastenings. The body, backup irons and optical axis rise together while the clamp stays seated on the rail.

Trace the selected side reference before reshaping the ACOG archetype: its raked objective hood, rear-rising casting and rear fin distinguish it from a symmetric scope. Preserve those profile cues rather than substituting a generic turned cone. The photograph and dimensions describe different variants, so photographic proportions are estimates rather than additional manufacturer measurements; the trace must not silently replace the size or optical-datum constraints. Reference images and overlays stay outside the repository. Source-backed values and labelled estimates belong to `src/gun/fixedPrism.jsonnet`, `solids` and `reference`, not renderer constants.

The TA51 stays one continuous clamp mount on every host. Top-loaded rifles reject it because that mount obstructs their loading opening; changing the feet to preserve a fit would change the item being traced. The authored exclusion is consumed by validation and attachment certification through the same rule; see `src/gun/fixedPrism.jsonnet`, `excludedHostFeeds`, and `src/gun/rules.ts`, `opticMountFitForPart`.

The backup front post and rear aperture are shape only. ADS remains on the prism's optical axis because the export carries one chosen sight frame, not independently selectable primary and backup sights; see `src/gun/exportGlb.ts`, `sightCandidate` and `sightMetadata`. The separate top seam keeps a later replacement sight from becoming part of the cast housing. The optic keeps its existing material rather than adopting the reference photograph's colour.

## Octagonal bodies

Cylindrical optic bodies are octagonal: every body turned about the optical axis (scope tubes, bells and ring bands) has flat sides, and the lenses seated in it share them, so each lens fills its opening out to the wall's inside flats. Octagonal is the chosen look for the game's optics. The side count is part of the shape, not a mesh level of detail, so every drawn level of detail and the collision hull agree on it. One side count in content serves every such body: `src/gun/appearance.jsonnet`, `opticBodySides`; the shape is `packages/engine/src/shapes/solid.ts`, `RevolvedSolid`. Box-housed sights keep their housings, and dials and turrets stay round, because they are controls on a body, not the body.

## Lens glass

Every optic's ocular and objective faces are glass, with the tinted sheen a coated lens shows at grazing angles, so a player reads a scope or a sight window as glass and not as painted metal. The glass is a look only: it carries no optical behavior. The glass and its sheen are shared materials in `packages/thing-core/src/materials.jsonnet`, so a new coating is a new material and not a code change.

A lens's coating is its own finish slot, so a product or an instance can vary it as it varies any other attachment finish slot, and a gun's finish never repaints it; the default and override rule for every attachment is in `attachments.md`, "Looks". The lens is a slot only the product can fill, so an optic whose content selects no coating, or a coating that is no material, fails instead of drawing the sight's metal; see `src/gun/attachments.ts`, `attachmentLookIssue`. Glass is see-through, so it may sit in another optic's sightline keep-out while that optic's body may not; see `src/gun/optics.ts`, `LENS_SLOT`, and `packages/engine/src/assembly/rules.ts`, `keepOutIssue`. Deadvox and gungen's viewer both draw a material with a sheen as a physical material, because only that material reflects a tint, and take its see-through and sheen from one shared rule, so glass authored in the viewer looks as it does in game; see `packages/thing-core/src/materials.ts`, `surfaceOf`. The viewer's diagnostic colouring stays opaque, because it shows roles, not the finish; see `packages/tool-ui/src/scene.ts`, `surfaceMaterial`.

Mount support is based on actual foot geometry rather than the nominal envelope, because an optic body can overhang a rail without a valid unsupported mount. Body collisions and loading clearance remain separate checks; see `src/gun/rules.ts`, `opticMountFitForPart`, and `src/gun/optics.ts`, `pairedFeet`.

Persisted optic IDs are not display labels, so visual-class changes do not silently rename a design's selected attachment. Mount and sightline rules are specified by the catalog and firearm validation, not by a second table of dimensions here.

The pump shotgun's ADS uses a simple front bead rather than rifle-style iron sights, preserving the shotgun sight picture. Its exported eye line is derived from the bead and receiver; see `src/gun/exportGlb.ts`, `frontBeadSightLine`.

The AK rear sight's ADS line uses the notch edge rather than the sight-block seat, so the aiming datum follows the opening instead of the mount surface; see `src/gun/parts.ts`, `akRearSight`, and `src/gun/exportGlb.ts`, `sightMetadata`.

A rear sight's notch must be wide enough for the voxel lattice to leave it open. A voxelized file keeps a voxel wherever a solid's centre-sampled span reaches it, so a notch one voxel wide or narrower of the grain it is drawn at can hold no voxel centre and fill, and the player lines up a solid block. Author the notch wider than one voxel of whatever grain draws it, and export refuses a sight whose drawn notch is narrower than the gun grain; see `src/gun/exportGlb.ts`, `openSightGapOrThrow`, and `test/rearSightNotch.test.ts`.

One rear-sight model covers an open notch and a closed aperture, so a gun can have a true peep sight, as on an aperture rifle, without a per-family exemption. Where the drawn top is open across the line, the eye sits at the top and the notch is read there. Where the top is solid across the line, the eye sits at the centre of the closed hole on the line and the width is read across the hole, because a peep is aimed through its hole and not over its top. Both are held to the same grain rule, and a sight with neither still fails export.
