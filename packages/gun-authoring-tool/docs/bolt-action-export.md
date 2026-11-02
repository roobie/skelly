---
read_if:
  - you locate or change a schema contract cited here
  - you change turn-bolt geometry, staggered integral capacity or hunting-rifle exports
  - you change the shared manual-action model contract consumed by Deadvox
  - you regenerate the hunting rifle, its civilian cartridge or its optional scope
  - you change the sporter's bore-registered action, furniture joint or silhouette tuning
  - you change the structured Deadvox export recipe or its companion choices
---

# Turn-bolt export

The hunting rifle must exist as a fitted Gungen assembly before Deadvox adds playable handling or loot. Exporting geometry first keeps gameplay from inventing mechanical dimensions. Content and visual timing remain tunable rather than becoming test snapshots; see `src/gun/templates.ts`, `huntingRifle`, `designs/hunting-rifle.jsonnet`, and `src/gun/cycle.ts`, `BOLT_HAND_TIMING`.

## Civilian identity and equipment

The rifle uses a separate civilian cartridge identity rather than silently sharing military ammunition. The shared standards drawing establishes dimensions, not cross-loading permission; unsupported measurements remain unknown. Rendering may use the sourced maximum loaded length when typical length is unknown without filling that unknown in the cartridge record. See `cartridges/308-winchester.jsonnet`, `cartridges/README.md`, and `src/ammo/roundProfile.ts`, `roundProfiles`.

An integral magazine loaded singly through the open bolt distinguishes this sporter from detachable-box rifles and from the pump's closed-action loading. Fixed irons keep fitting the separately exported hunting scope a player choice. The scope's geometry, magnification and reticle belong to Gungen content, not a special Deadvox optic path. See `src/gun/optics.ts`, `OPTIC_TYPE_IDS`, and `src/gun/internalMagazine.ts`, `internalMagazineCapacity`.

Fixed irons and a shallow comb angle preserve a BDL-type sporter's identity rather than a Scout's. Shared shotgun wood contours keep the wrist hand-sized when the comb changes, while the open-notch rear leaf avoids a block pedestal. The design chooses the furniture and sight configuration; proportion tables own its silhouette defaults independently of any shipped design. See `designs/hunting-rifle.jsonnet`, `src/gun/sporterProportions.ts`, `SPORTER_PROPORTIONS`, and `src/gun/taperedStock.ts`, `taperedStockSolids`.

## Reference registration

The reference is a side-view photo of a 700 BDL-type sporter, kept outside the repository. The published overall length in the [Remington Model 700 specification table](https://en.wikipedia.org/wiki/Remington_Model_700) calibrates this BDL-type study; it does not identify the photographed variant. The photo supplies the action and wood profile relationships. Depth, wall thickness and operating clearances remain stylized authoring choices, not measurements recoverable from a side view. See `src/gun/sporterProportions.ts`, `SPORTER_PROPORTIONS`.

Keep the bore direction and receiver/barrel datum fixed when tracing and comparing silhouettes. Moving or resizing individual parts to cover the photo hides bad proportions. Stock wood, its firing-grip datum and the action bed share a joint frame so lowering the seat cannot leave the mesh or hand behind. Matching the wood's underside and width prevents a stepped joint; the tang needs an inlet rather than overlapping solid wood. See `src/gun/parts.ts`, `receiverPorts`, and `src/gun/sporter.ts`, `sporterStock` and `sporterFurniture`.

The round action needs bedding below it, not an enclosed box handguard. The mating section determines front-face fit, not the deeper wood behind that plane. The bed leaves the feed path, ejection mouth and handle corridor open instead of exempting furniture from collision checks. Plain wood must not advertise rails that its geometry does not provide. Barrel-mounted irons retain the traced rearward handle station without moving the bore or turn pivot. See `src/gun/rules.ts`, `handguardFit`, `src/gun/parts.ts`, `boltActionHandSpace`, and `src/gun/sporter.ts`, `cutSporterAction`.

## Geometry and motion boundary

The .308 BDL-type short action holds four rounds in the magazine plus one separately chambered. Reworking the internal well preserves the traced exterior instead of changing the shared gun scale to make ammunition fit. Wall, feed-mouth and follower clearances are stylized authoring choices, not measurements from a real box drawing. The catalogue owns the target and clearances; the staggered column must actually fit, rather than acquire a nominal capacity shim. See `cartridges/catalogue/bolt.jsonnet`, `integralWells`, and `src/gun/internalMagazine.ts`, `internalMagazineLayout`.

Cartridge identity must not silently select a different action envelope: modded bolt designs must either size from their selected cartridge or report a validation issue. Reusing the magazine column packer keeps same-side and opposite-side clearance constraints consistent across detachable and integral magazines. See `src/gun/boltCartridge.ts`, `boltCalibreIssue`, and `src/ammo/magazineColumn.ts`, `layoutColumn`.

The carrier, arm and knob share one turn about the carrier's longitudinal centreline. Each part stores that pivot and bore-parallel axis in its own local frame, while the export transforms them into the model frame. The handle profile supplies the lift angle. Receiver relief leaves room for the handle root. Rail clearance follows the turned neck, while the sporter's bedding and low tang leave its rearward root clear without lifting the rail; neither approach permits collisions by family exemption. Continuous clearance is certified for the coupled body and handle over both the lift arc and the lifted draw, including fixed optic geometry; interval displacement bounds prevent narrow collisions between samples from being missed. Axial tail length must not inflate the turn-speed bound, and obstacles reuse immutable phase poses, so bedding detail does not multiply identical motion work. See `src/gun/parts.ts`, `boltTurn`, and `src/gun/boltSweep.ts`, `sweepTurningAction`.

The action is hand-only: unlock, draw, dwell, push and lock share one timeline. Ejection progress comes from the resolved receiver port and carrier stroke, not an independently tuned fraction. Deadvox validates that every turning mover references timelines containing both turn phases, and that all phases fit the duration. Gungen owns visual timing estimates; Deadvox owns skill scaling and mechanical state. See `src/gun/actionDescription.ts`, `resolveGunAction`, `src/gun/cycle.ts`, `boltCycleMotion`, and `packages/deadvox/src/core/schema/models.ts`, `ActionSchema`.

Pump tubes and integral rifle wells use the same neutral model record because loading capacity does not imply a tube shape. Neither exports a detachable-magazine slot or a box round-pose column. The loading anchor describes the mouth, not a hand or inventory transaction; see `src/gun/exportGlb.ts`, `DeadvoxModelEntry`, and `src/gun/anchorData.ts`, `GUN_ANCHORS`.

## Regeneration and acceptance

Exporter-written records stay separate from authored handling constructors so refreshes cannot flatten tunable content. Companion choices belong in the consumption recipe rather than an inference from a gun: the boundary must be inspectable even when equipment changes. See `exports/deadvox.jsonnet`, `src/cli/exportRecipe.ts`, `loadExportRecipe`, and `src/cli/refreshDeadvox.ts`. Credits import that recipe so provenance cannot silently describe a different set of outputs.

Export storage must not change time semantics, so standalone model records use the pack's temporal catalogue rather than a second allowlist; see `packages/deadvox/src/core/temporalFields.ts`, `TEMPORAL_FIELDS`, and `packages/deadvox/tools/time-lint.mjs`, `temporalCatalogueFindings`.

Acceptance includes Deadvox validation and model preparation, not just a successful Gungen export. See `test/boltExport.test.ts` and `packages/deadvox/test/models.test.ts`. The recipe-wide check in `test/gungen-deadvox-contract.test.mjs` compares exporter-written records, not compiled overlays, so gameplay-owned fields never need a parallel omission list.
