---
read_if:
  - you change Gungen's modeling boundary, firearm geometry or feasibility goal
  - you change cartridge-driven frame selection or design authoring
  - you use or update the golden AKM reference photo or its overlays
  - you change attachment compatibility, sights, eye-distance ranges or the Gungen-to-Deadvox export contract
  - you change per-optic eye relief or hold-dependent fit rules
  - you change a gun Deadvox ships, or anything its export reads
  - you change physical inputs, drawn collision exports or their ownership
  - you author or key a gun part's mass
  - you change Gungen's test or cross-project integration policy
  - you change the structured Deadvox export recipe or refresh boundary
  - you diagnose platform-dependent export comparisons
  - you share recipe or synchronization mechanisms between authoring tools
---

# Gun authoring tool

The gun tool authors firearm assemblies whose parts fit and whose moving paths have room. Feasibility is checked geometry, not firearm physics: the project does not produce manufacturing tolerances, CAD or fabrication output. Real-model resemblance is allowed; see `things/README.md`, "Rules".

## Modeling boundary

Reusable part families keep fit rules applicable as authored designs change; they do not
restrict a gun's resemblance to a real model. See `src/gun/designLoader.ts`, `loadGunDesign`
and `src/gun/templates.ts`, `TEMPLATES`.

The shared engine owns domain-neutral assembly, geometry and fit mechanisms. The gun
tool owns firearm data and policy so other consumers do not inherit gun-specific concepts;
see `packages/engine/README.md`, "Shared engine".

## Scale and ammunition

Firearms use a stylized gun-domain scale. Ammunition is the exception: its sourced dimensions matter to ammunition identity and physical fit, while unsourced values stay unknown rather than becoming invented specifications. See `src/gun/units.ts`, `GUN_UNITS` and `cartridges/README.md`.

Cartridge fit does not establish platform interchangeability, and human-contact dimensions should not scale with cartridge size. Frame eligibility, frame-specific placement and the visual-review boundary are recorded in `docs/decisions/0001-calibre-driven-sizing.md`; the selection path is `src/gun/actionFrame.ts`, `selectFrame` and `src/gun/arFrames.ts`, `AR_FRAME_BY_CALIBRE`. The bore remains the firearm assembly's datum so action and ammunition alignment do not move with ergonomic parts; see `src/gun/units.ts`, `GUN_UNITS`.

The AR's magazine source choices are deliberate: the straight 20-round body follows the [Brownells listing](https://www.brownells.se/AR-15-MAGAZINE-20-ROUND-USGI-BROWNELLS-AR-15-STRAIGHT-MAGAZINE-20-ROUND-GRAY-Aluminum-Gra-556-x-45-430110983), while the 30-round body follows the [SA80-compatible steel reference](https://www.meanandgreen.com/army/British_Army/SA80_5.56mm_30_Round_NATO_Magazine/3850/2876.html), not USGI aluminum. Treat the listing's 2.54-inch figure as body depth and its 127 × 66 × 25 mm dimensions as package size. Source-backed dimensions are snapped to the nearest gun-grid step to preserve the stylized scale. The [paired magazine photo](https://upload.wikimedia.org/wikipedia/commons/c/ca/Stanag_mags.jpg) is used for shape and camera-skew calibration, but does not override the sourced length. Feed-lip height is derived from the modeled bolt-carrier path because sources do not specify that relationship. Other capacities remain deferred to #414. The seat and alignment contract is in `src/gun/parts.ts`, `magazineGeometryFor`, `src/gun/parts.ts`, `BOLT_CARRIER_ENVELOPES`, and `src/gun/anchorData.ts`, `frameAt`.

## Design and variants

Gungen is an authoring tool, not a generator: the curated design is the product because a valid assembly is not necessarily a good-looking one, and because every part it exports needs an authored mass (`things/README.md`, "Rules"). Seeded variations only propose shapes to curate. Automated geometry checks establish fit, not appearance, so source-incomplete proportions still need visual judgment.

The golden reference photograph and overlays stay outside the repository; cite [the public photo](https://www.americanrifleman.org/media/caqhmu12/izhmash_akm_right.jpg?width=1920&height=620) instead. The AK silhouette is registered to its public side-view reference by the bore and scaled from published overall length, rather than moving the receiver to force sight alignment. This preserves the receiver-to-bore relationship and places the rear sight on the receiver without an artificial post; see `src/gun/akProportions.ts`, `AK_PROPORTIONS`. The gas cylinder keeps the reference height and the piston stays on its axis; the lower handguard does not extend below the receiver, and the wooden stock keeps its straight bottom. Both AKM and AK-74 curved magazines fit the layout. The muzzle devices are separate threaded attachments because a muzzle style should not change the barrel geometry; `docs/attachments.md`, "Muzzle devices" says why the player fits them. See `src/gun/parts.ts`, `akMuzzleDevice` and `test/ak.test.ts`. The AK design retains its 7.62×39 identity; 5.45×39 support is separate follow-up #362 rather than an inference from similar geometry.

Keep the AR frame and magwell unchanged when correcting magazine seating: adjust the shared well insertion so the established receiver silhouette and opening remain fixed. See `src/gun/arLayout.ts`, `AR_ACTION_LAYOUT` and `src/gun/parts.ts`, `MAGAZINE_INSERTION`.

## Testing

Seed sweeps exercise generated assemblies across templates and choices that focused property tests do not cover; they run only in the manual slow-test workflow (`AGENTS.md`, "Tests"), which keeps routine feedback fast while the broad generator checks stay runnable; see `test/sweeps.ts`, `runSweeps`.

## Attachments and export

Attachments are separate geometry and identity so a fitted choice can be replaced without changing the host firearm's appearance or geometry. Compatibility is certified by the firearm domain and fails closed when a pair is absent; see `docs/attachments.md` and `src/gun/attachmentCompatibility.ts`, `attachmentCompatibilityPairs`.

A Gungen change to any export Deadvox consumes refreshes its GLB and model entry in the same PR: a stale copy can still validate and load, so drift otherwise stays silent. The authored consumption boundary is `exports/deadvox.jsonnet`; explicit companion choices keep a gun's refresh from silently selecting other items. See `src/cli/exportRecipe.ts`, `loadExportRecipe`, and `src/cli/refreshDeadvox.ts`.

Exporter-written records stay separate from Deadvox's authored overlays so refreshes cannot flatten gameplay tuning. Synchronization compares those records rather than maintaining a second list of fields to omit. Platform floating-point roundoff is not authored content drift, so numeric comparison tolerates it; see `test/model-export-sync.mjs`, `exportDifference`. Asset credits import the recipe so provenance cannot omit or retain a different set of exports; see `packages/deadvox/src/content/base/assets/manifest.libsonnet`, `recipe`. Follow `docs/jsonnet.md`, "Source boundaries".

Cover checks need the exported shape rather than guessed gun dimensions, so
firearm bodies, fitted attachments and magazines carry collision bounds from
the same drawn geometry as their models. Atomic items retain item-owned mass;
collision does not turn them into assemblies. See `src/gun/physical.ts`,
`gunModelParts`; `src/gun/attachmentExport.ts`, `exportAttachmentGlb`;
`src/gun/magazineExport.ts`, `exportMagazineGlb`; and
`packages/thing-export/src/physical.ts`, `modelCollision`.

Iron eye-distance ranges belong to the gun tool so consumers can fit a bounded viewing camera without inventing sight geometry or remodelling the weapon. The far endpoint accommodates the existing gun's rear rather than assuming every iron has a rear notch; optics retain a fixed eye point. See `src/gun/sightView.ts`, `ironGunEyeRange`; `src/gun/sightView.jsonnet`; and `src/gun/exportGlb.ts`, `sightMetadata`.

Non-magnifying optics need an iron-like viewing distance so their apertures leave the surrounding view visible, with the reflex or holographic reticle seen through the optic rather than an aperture filling the viewport. Author eye relief per optic so each model owns its sight picture instead of a consumer override. See `src/gun/opticPresentation.jsonnet`, `miniReflex`, `tubeDot` and `holographic`; and `src/gun/attachments.ts`, `attachmentMetadata`, which exports `eyeReliefMetres`. A non-magnifying optic must not disqualify a stockless hold; magnifying optics need a cheek datum because their eye placement is constrained. See `src/gun/rules.ts`, `opticEyeRelief`.

The hunting rifle's civilian identity, integral loading, separate scope and phased turn-bolt contract are governed by `docs/bolt-action-export.md`. Geometry is exported before playable handling so Deadvox consumes fitted dimensions rather than inventing them.

The Gungen adapter exports resolved geometry and firearm metadata while the shared engine remains domain-neutral. Deadvox owns the playable handling contract; see `src/gun/exportGlb.ts`, `exportGunGlb`, and `packages/deadvox/docs/decisions/0006-firearm-handling.md`. Anchors ride the drawn file where the hand meets it: the exported support anchor's height is the lowest face the forend part draws, like the muzzle reads the drawn front, because Deadvox seats the support hand on that anchor and a hand-copied height would drift at the next refresh. Attachment mass is authored on the attachment's item, because an attachment is an atom (`things/README.md`, "Rules"). Shared export places geometric centres without estimating mass; see `packages/thing-export/src/physical.ts`, `modelParts`.

A gun assembly refers to authored part items. Construction belongs to the item; pose and placement belong to its assembly instance, so a design that names an item sets only placement and a part built otherwise is a different item. Where shapes differ, each shape is its own item with its own mass, sharing build helpers but not identity, and a different finish of the same shape is also its own item. Each item fixes one look and one mass, so a part looks and weighs the same loose and fitted, and one item per finish needs no new mechanism; the cost is a catalogue item and a loose model for each new finish of an existing shape (`things/WORK.md`, "Decisions"). Each item also exports as its own loose part, which is registered in Deadvox but does not spawn. The editor refuses body geometry without item identity so a proposal cannot leave the editor as a model; see `src/viewer/designExport.ts`, `exportEditorDesign`. Removable children keep their own authoritative weight and are excluded from the host body sum, so fitting them does not count their mass twice. See `src/gun/catalogue.ts`, `loadPartCatalogue`; `src/gun/designLoader.ts`, `loadGunDesignValue`; `src/gun/physical.ts`, `gunModelParts`; and `src/cli/exportPart.ts`, `exportPartItem`.

Items and the remaining mass rows share one catalogue, so a mass is authored once. File and recipe export still select the matching mass row for a body part that names no item, until its design is converted (#509); see `src/gun/physical.ts`, `gunModelParts`. The consumption recipe's designs name items, so converting the remaining corpus is not a reproduction requirement. A row names only the params that make it a different part, so a pose or a placement does not split a row, and export fails when a part matches no row or more than one, because a guessed mass is the derivation the rule removes. A value is a plausible mass authored in content, without a source citation, because the catalogue is gameplay content to tune and not a measurement to defend. A part choice that has no row is removed rather than kept unreachable, because a template change could then reach it and break an export. See `src/gun/catalogue.jsonnet`, `parts`.

A self-loading pistol's slide is its carrier, not a rifle bolt in disguise. The generic linear cycle keeps simulation timing and exported motion coupled without adding a separate Deadvox hand action. The short-barrel band and slide envelope follow the external reference in `src/gun/pistolDimensions.jsonnet`; slide travel is derived from cartridge overall length with content-authored feed clearance, while internal clearances and cycle values remain visual/gameplay estimates rather than manufacturing specifications. See `src/gun/actionDescription.ts`, `resolveGunAction`, and `src/gun/pistolAction.jsonnet`.

Revolvers use independently mounted moving parts and a separate rotational export contract so the linear carrier contract stays focused; see `docs/revolver-export.md` and `src/gun/revolverExport.ts`, `RevolverMetadata`.

Cross-project checks protect this boundary. Attachment typechecking and tests traverse Deadvox and Mobgen imports, so their aliases remain part of Gungen's check graph; see `tsconfig.json`, `paths` and `vite.config.ts`, `alias`.
