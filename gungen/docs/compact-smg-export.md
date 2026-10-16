---
read_if:
  - you build or tune the compact SMG (g67) or its telescoping stock, drum rear sight or hooded front sight
  - you change the forward cocking tube or sliding handle that the compact SMG reuses
  - you register a new side-view reference photo for a Gungen design
  - you decide one of the compact SMG's open questions
---

# Compact SMG export

BR asked for an SMG traced from an MP5-type side view and then built in the Gungen engine, as the hunting rifle was. They singled out four features: the charging handle at the front, the telescoping buttstock, the rotary rear aperture sight and the ringed front sight. Those four features are what makes the silhouette recognisable, so the build must produce each one as real geometry and not as a decal or substitute part. This doc states intent before implementation; build rounds trim it to reasons and code cues (`PILLARS.md`, "Zero drift").

## Reference registration

The reference is a side-view photo kept outside the repository; only the derived table is tracked. See `src/gun/compactSmgProportions.ts`, `COMPACT_SMG_PROPORTIONS`.

The photo shows the stock collapsed, so the scale comes from a published collapsed overall length for the A3 pattern rather than the extended 680 mm in the [Small Arms Survey MP5 sheet](https://www.smallarmssurvey.org/sites/default/files/SAS-weapons-sub-machine-guns-Heckler-Koch-MP5.pdf). Calibrating with the extended length on a collapsed photo would inflate every part by roughly a quarter. The span is from the butt plate's rear face to the muzzle stub's tip, the two features that are sharp in the photo. Sources disagree on the collapsed length, which is why it is an open question below.

The bore line runs through the muzzle axis and is horizontal in the photo, so the registration has no slope. The origin is the receiver's front face, where the handguard starts, matching the sporter's receiver/barrel datum (`docs/bolt-action-export.md`, "Reference registration"). Parts are traced around that fixed bore and datum and never moved to cover the photo, for the same reason given there. Depth, wall thickness and clearances are not recoverable from a side view and stay authoring choices.

The extended stock position is the collapsed position shifted rearward by the published stock travel. It is not traced, because the photo does not show it.

## Parts and joins

The design sits on the existing `smg` template; see `src/gun/templates.ts`, `smg`. The trace adds or changes these parts:

- **Upper receiver and end cap.** The receiver ends at the origin and the end cap holds the stock struts. The ejection port is on the right side of the receiver, ahead of the grip.
- **Cocking tube.** It runs from the receiver's front face along the top of the handguard and ends in a cap at the front sight base. The existing `smg-cocking-tube` from the handguard's `handleStyle: smg` already places the tube there, so the build tunes it; see `src/gun/parts.ts`, `smgSlidingHandle`.
- **Handguard.** It hangs below the cocking tube, deeper at the rear than the front, and leaves the magazine well clear.
- **Front sight.** A base at the muzzle end carries a closed ring around a post. No front-sight style has a ring, so this needs a new style; see `src/gun/parts.ts`, `frontSight`.
- **Rear sight.** A drum on a base on top of the receiver, with apertures around its rim. No rear-sight family rotates, so this needs a new family; see `src/gun/parts.ts`, `sportingRearSight` and `akRearSight`.
- **Lower.** The trigger housing hangs below the receiver and carries the pistol grip, trigger guard, selector, magazine release and a rear sling tab.
- **Magazine.** It is curved and forward-raked, entering a magwell just behind the origin; the existing `smg` magazine profile is the starting point.
- **Telescoping stock.** Two struts slide in the end cap and carry a butt plate. No stock style telescopes, so this needs a new style; see `src/gun/parts.ts`, `stock`.

Joins keep the shared receiver frame so struts, tube and lower cannot drift from the receiver when it is retuned. The struts and their butt plate are one moving group, so the plate cannot be left behind at full extension.

## Motion

Each mover is certified with the swept-clearance check, not exempted by family; see `src/gun/cycle.ts`, `sweepMovingPart`.

- **Charging handle.** The knob slides back along its slot in the cocking tube. The visible slot length bounds the travel in the trace. BR named "locked back and released", but the photo does not show the notch that holds it back, so that state is an open question. The handle is hand-only and does not move with each shot, matching the forward-handle pattern the `smg` template already exports; see `src/gun/actionDescription.ts`, `resolveGunAction`.
- **Stock.** It moves between the collapsed and extended positions along the bore axis. It is a configuration state, not part of the firing cycle, so it does not belong on the action timeline.
- **Rear drum.** It turns to present a different aperture. The axis cannot be recovered from a side view, so it is an open question whether the drum turns, and about which axis.

## Export contract for Deadvox

The export follows the existing model record and anchors; it adds no new channel. See `src/gun/exportGlb.ts`, `DeadvoxModelEntry`, and `src/gun/anchorData.ts`, `GUN_ANCHORS`.

- **Hand datums.** The firing hand is at the grip anchor and the support hand is at the handguard support anchor, as in other handguard designs.
- **Magazine.** A detachable-magazine slot at the lower magwell, with round poses from the magazine column, so Deadvox reloads it like other box-fed guns.
- **Ejection port.** The receiver ejection anchor at the traced port.
- **Muzzle and sight.** The muzzle anchor at the muzzle stub. The iron-sight eye line passes through the drum aperture and the front ring.
- **Stock state.** If the telescoping stock becomes a player choice, its state has to be either a separate export or a new model-record field. That choice belongs with the stock-variant open question.

The record is refreshed through the same path as other credited guns, so Deadvox-owned fields survive; see `src/cli/refreshDeadvoxFirearms.ts`.

## Content tunables

Profiles, travel limits, sight-ring sizes and drum aperture count are content values that the design selects. The new stock style, front-sight style and rear-sight family are mechanisms in code, so a modded design can reuse them without a code edit (`PILLARS.md`, "Content forward compatibility"). The proportions table owns silhouette defaults independently of any shipped design, as the sporter table does.

## Archetype decision

The compact SMG sits beside `designs/archetype-smg.json` as a new `designs/compact-smg.jsonnet`, which imports the archetype and overrides parts, as `designs/hunting-rifle.jsonnet` does with its base. The archetype is a canonical generator fixture with its own appearance variant (see `src/cli/exportFile.ts`, `FIXTURE_APPEARANCE`), so replacing it would change generator output that other checks rely on. Extending it in place would bend the generic fixture toward one traced gun. Its cocking tube, sliding handle and magazine profile are reused rather than duplicated.

## Build split

The rounds run in order. Every round must pass these checks: validate reports no geometry issues for the design, every mover passes its swept-clearance check, and the export loads in Deadvox validation and model preparation. A round only adds checks of its own.

1. **Design and silhouette.** Add `designs/compact-smg.jsonnet` on the archetype, consuming the proportions table for the receiver, handguard, cocking tube, lower, grip and magazine. Remove the table's knip entry. Its own check: the bore and receiver datum match the registration.
2. **Sights.** Add the ringed front-sight style and a static drum rear-sight family. Its own check: the eye line passes through the aperture and ring.
3. **Charging handle travel.** Tune the existing sliding handle to the traced slot, plus the locked-back state if BR wants it. Its own check: the handle clears the front sight base and handguard over its full travel.
4. **Telescoping stock.** Add the telescoping stock style with collapsed and extended states. Its own checks: the struts clear the end cap and lower at both ends, and the grip datum does not move with the stock.
5. **Deadvox entry.** Export, refresh and credit the gun in Deadvox once BR has chosen its calibre. Its own check: the gungen-deadvox contract test covers it.

If BR chooses a turning drum, it is added as part of the sights round.

## Open questions for BR

These block the rounds named in each question; g67 tracks them.

1. **Calibre and game entry** (round 5). Gungen has no 9x19 cartridge. Options:
   - add a 9x19 cartridge and ship the gun in Deadvox;
   - ship the model in Gungen only for now;
   - chamber it in an existing pistol-class cartridge.
2. **Stock variant** (round 4). Options:
   - telescoping only, with collapsed and extended states;
   - a fixed stock only;
   - both as design variants.
3. **Locked-back handle** (round 3). Options:
   - model the locked-back notch and state;
   - travel only, with no held state.
4. **Reference length** (round 1). Options:
   - 550 mm collapsed;
   - 490 mm, the A3N retracted figure;
   - re-register on the 680 mm extended figure with a photo showing the stock extended.
5. **Rear drum** (round 2). Options:
   - static drum;
   - drum turning about a vertical axis;
   - drum turning about a transverse axis, across the bore.
6. **Muzzle** (round 1). Options:
   - plain stub as traced;
   - a threaded or suppressor-ready muzzle as a variant.
