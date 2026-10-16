---
read_if:
  - you change turn-bolt geometry, integral magazine fit or hunting-rifle exports
  - you change the shared manual-action model contract consumed by Deadvox
  - you regenerate the hunting rifle, its civilian cartridge or its optional scope
---

# Turn-bolt export

The hunting rifle must exist as a fitted Gungen assembly before Deadvox adds playable handling or loot. Exporting geometry first keeps gameplay from inventing mechanical dimensions. Content and visual timing remain tunable rather than becoming test snapshots; see `src/gun/templates.ts`, `huntingRifle`, `designs/hunting-rifle.jsonnet`, and `src/gun/cycle.ts`, `BOLT_HAND_TIMING`.

## Civilian identity and equipment

The rifle uses a separate civilian cartridge identity rather than silently sharing military ammunition. Deadvox's playable rifle content must keep its ammunition supply store-only. The shared standards drawing establishes dimensions, not cross-loading permission; unsupported measurements remain unknown. Rendering may use the sourced maximum loaded length when typical length is unknown without filling that unknown in the cartridge record. See `cartridges/308-winchester.jsonnet`, `cartridges/README.md`, and `src/ammo/roundProfile.ts`, `roundProfiles`.

An integral magazine loaded singly through the open bolt distinguishes this sporter from detachable-box rifles and from the pump's closed-action loading. The design ships with fixed irons; the hunting scope is a separate attachment export so fitting an optic remains a player choice. The scope's geometry, magnification and reticle belong to Gungen content, not a special Deadvox optic path. See `src/gun/parts.ts`, `sportingRearSight`, `src/gun/optics.ts`, `OPTIC_TYPE_IDS`, and `src/gun/internalMagazine.ts`, `internalMagazineCapacity`.

## Geometry and motion boundary

The shared bolt-pattern family uses the sourced hunting-cartridge envelope rather than a fixed travel class. Extraction clearance, well walls and follower reserve are labelled visual estimates; they are not manufacturing specifications. Well capacity counts the rounds that fit the resolved cavity, not a nominal capacity label. See `src/gun/boltCartridge.ts`, `boltStrokeUnits`, and `src/gun/internalMagazine.ts`, `internalMagazineCapacity`.

The carrier, arm and knob share one turn about the carrier's longitudinal centreline. Each part stores that pivot and bore-parallel axis in its own local frame, while the export transforms them into the model frame. The handle profile supplies the lift angle. The receiver relief leaves room for the handle root, and the rail height follows the turned neck's clearance at the rail edge, rather than allowing collisions by family exemption. Continuous clearance is certified for the coupled body and handle over both the lift arc and the lifted draw, including fixed optic geometry; interval displacement bounds prevent narrow collisions between samples from being missed. See `src/gun/parts.ts`, `boltTurn`, and `src/gun/boltSweep.ts`, `sweepBoltAction`.

The action is hand-only: unlock, draw, dwell, push and lock share one timeline. Ejection progress comes from the resolved receiver port and carrier stroke, not an independently tuned fraction. Deadvox validates that every turning mover references timelines containing both turn phases, and that all phases fit the duration. Gungen owns visual timing estimates; Deadvox owns skill scaling and mechanical state. See `src/gun/actionDescription.ts`, `resolveGunAction`, `src/gun/cycle.ts`, `boltCycleMotion`, and `deadvox/src/core/schema.ts`, `ActionSchema`.

Pump tubes and integral rifle wells use the same neutral model record because loading capacity does not imply a tube shape. Neither exports a detachable-magazine slot or a box round-pose column. The loading anchor describes the mouth, not a hand or inventory transaction; see `src/gun/exportGlb.ts`, `DeadvoxModelEntry`, and `src/gun/anchorData.ts`, `GUN_ANCHORS`.

## Regeneration and acceptance

Generated model records stay separate from authored handling constructors so an asset refresh cannot flatten tunable content. The refresh path preserves Deadvox-owned model fields; see `src/cli/refreshDeadvoxFirearms.ts`. Content compilation shares the source boundary so the manifest and bundled entries cannot silently diverge.

Acceptance includes Deadvox validation and model preparation, not just a successful Gungen export. The property checks are in `test/boltExport.test.ts` and `deadvox/test/models.test.ts`; synchronization of credited firearm assets is checked by `test/gungen-deadvox-contract.test.mjs`.
