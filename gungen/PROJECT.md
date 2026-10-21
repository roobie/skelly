---
read_if:
  - you change Gungen's modeling boundary, firearm geometry or feasibility goal
  - you change cartridge-driven frame selection or design authoring
  - you use or update the golden AKM reference photo or its overlays
  - you change attachment compatibility, sights or the Gungen-to-Deadvox export contract
  - you change a gun Deadvox ships, or anything its export reads
  - you change physical inputs or their ownership
  - you author or key a gun part's mass
  - you change Gungen's test or cross-project integration policy
---

# gungen — low-poly firearm designer

Gungen designs stylized firearm assemblies whose parts fit and whose moving paths have room. Feasibility is checked geometry, not firearm physics: the project does not produce manufacturing tolerances, CAD or fabrication output, and does not reproduce specific real models or brands.

## Modeling boundary

Curated designs choose from a constrained vocabulary of part families, parameters and prefabs. New archetypal shapes belong in that vocabulary rather than unconstrained vertex editing; this keeps fit rules applicable as designs change. See `src/gun/designLoader.ts#loadGunDesign` and `src/gun/templates.ts#TEMPLATES`.

The shared engine owns domain-neutral assembly, geometry and fit mechanisms. Gungen owns firearm data and policy so other consumers do not inherit gun-specific concepts; see `packages/engine/README.md`, "Shared engine".

## Scale and ammunition

Firearms use a stylized gun-domain scale. Ammunition is the exception: its sourced dimensions matter to ammunition identity and physical fit, while unsourced values stay unknown rather than becoming invented specifications. See `src/gun/units.ts#GUN_UNITS` and `cartridges/README.md`.

Cartridge fit does not establish platform interchangeability, and human-contact dimensions should not scale with cartridge size. Frame eligibility, frame-specific placement and the visual-review boundary are recorded in `docs/decisions/0001-calibre-driven-sizing.md`; the selection path is `src/gun/actionFrame.ts#selectFrame` and `src/gun/arFrames.ts#AR_FRAME_BY_CALIBRE`. The bore remains the firearm assembly's datum so action and ammunition alignment do not move with ergonomic parts; see `src/gun/units.ts#GUN_UNITS`.

The AR's magazine source choices are deliberate: the straight 20-round body follows the [Brownells listing](https://www.brownells.se/AR-15-MAGAZINE-20-ROUND-USGI-BROWNELLS-AR-15-STRAIGHT-MAGAZINE-20-ROUND-GRAY-Aluminum-Gra-556-x-45-430110983), while the 30-round body follows the [SA80-compatible steel reference](https://www.meanandgreen.com/army/British_Army/SA80_5.56mm_30_Round_NATO_Magazine/3850/2876.html), not USGI aluminum. Treat the listing's 2.54-inch figure as body depth and its 127 × 66 × 25 mm dimensions as package size. Source-backed dimensions are snapped to the nearest gun-grid step to preserve the stylized scale. The [paired magazine photo](https://upload.wikimedia.org/wikipedia/commons/c/ca/Stanag_mags.jpg) is used for shape and camera-skew calibration, but does not override the sourced length. Feed-lip height is derived from the modeled bolt-carrier path because sources do not specify that relationship. Other capacities remain deferred to #414. The seat and alignment contract is in `src/gun/parts.ts#magazineGeometryFor`, `src/gun/parts.ts#BOLT_CARRIER_ENVELOPES`, and `src/gun/anchorData.ts#frameAt`.

## Design and variants

Gungen is an authoring tool, not a generator: the curated design is the product because a valid assembly is not necessarily a good-looking one, and because every part it exports needs an authored mass (`things/README.md`, "Rules"). Seeded variations only propose shapes to curate. Automated geometry checks establish fit, not appearance, so source-incomplete proportions still need visual judgment.

The golden reference photograph and overlays stay outside the repository; cite [the public photo](https://www.americanrifleman.org/media/caqhmu12/izhmash_akm_right.jpg?width=1920&height=620) instead. The AK silhouette is registered to its public side-view reference by the bore and scaled from published overall length, rather than moving the receiver to force sight alignment. This preserves the receiver-to-bore relationship and places the rear sight on the receiver without an artificial post; see `src/gun/akProportions.ts#AK_PROPORTIONS`. The gas cylinder keeps the reference height and the piston stays on its axis; the lower handguard does not extend below the receiver, and the wooden stock keeps its straight bottom. Both AKM and AK-74 curved magazines fit the layout. The two muzzle devices remain separate threaded choices because a muzzle style should not change the barrel geometry. See `src/gun/parts.ts#akMuzzleDevice` and `test/ak.test.ts`. The AK design retains its 7.62×39 identity; 5.45×39 support is separate follow-up #362 rather than an inference from similar geometry.

Keep the AR frame and magwell unchanged when correcting magazine seating: adjust the shared well insertion so the established receiver silhouette and opening remain fixed. See `src/gun/arLayout.ts#AR_ACTION_LAYOUT` and `src/gun/parts.ts#MAGAZINE_INSERTION`.

## Testing

Seed sweeps exercise generated assemblies across templates and choices that focused property tests do not cover; they remain opt-in locally and run in CI. This keeps routine feedback representative and deterministic without dropping broad generator checks; see `test/sweeps.ts#runSweeps`.

## Attachments and export

Attachments are separate geometry and identity so a fitted choice can be replaced without changing the host firearm's appearance or geometry. Compatibility is certified by the firearm domain and fails closed when a pair is absent; see `docs/attachments.md` and `src/gun/attachmentCompatibility.ts#attachmentCompatibilityPairs`.

A Gungen change to a gun Deadvox ships refreshes Deadvox's copy, its GLB and model entry, in the same PR: a stale copy still validates and loads, so the two drift apart silently. Each exported design records the inputs its export needs, such as its `calibre`, so `../test/gungen-deadvox-contract.test.mjs` can re-export every gun the Deadvox asset manifest credits to a Gungen design and fail on any difference in Gungen's export. Follow the shared authoring boundary in `../docs/jsonnet.md`, "Source boundaries".

The hunting rifle's civilian identity, integral loading, separate scope and phased turn-bolt contract are governed by `docs/bolt-action-export.md`. Geometry is exported before playable handling so Deadvox consumes fitted dimensions rather than inventing them.

The Gungen adapter exports resolved geometry and firearm metadata while the shared engine remains domain-neutral. Deadvox owns the playable handling contract; see `src/gun/exportGlb.ts`, `exportGunGlb`, and `packages/deadvox/docs/decisions/0006-firearm-handling.md`. Attachment mass is authored on the attachment's item, because an attachment is an atom (`things/README.md`, "Rules"). Shared export places geometric centres without estimating mass; see `packages/thing-export/src/physical.ts`, `modelParts`.

Until a gun's parts become items (`../things/WORK.md`, "Phases"), each body part's authored mass comes from one part mass table keyed by part family and variant. A part shared by several designs then has one value, and the table already has the shape of the closed item set. A parametric part gets one row per variant rather than a scaling rule, because a rule would derive mass again. A row names only the params that make it a different part, so a pose or a placement does not split a row. Export fails when a part matches no row or more than one, because a guessed mass is the derivation the rule removes. See `src/gun/physical.jsonnet`, `partMasses`, and `src/gun/physical.ts`, `gunModelParts`.

Revolvers use independently mounted moving parts and a separate rotational export contract so the linear carrier contract stays focused; see `docs/revolver-export.md` and `src/gun/revolverExport.ts`, `RevolverMetadata`.

Cross-project checks protect this boundary. Attachment typechecking and tests traverse Deadvox and Mobgen imports, so their aliases remain part of Gungen's check graph; see `tsconfig.json#paths` and `vite.config.ts#resolve.alias`.
