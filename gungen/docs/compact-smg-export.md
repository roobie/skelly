---
read_if:
  - you build or tune the compact SMG or its telescoping or fixed stock, drum rear sight or hooded front sight
  - you change the forward cocking tube or sliding handle that the compact SMG reuses
  - you add the 9x19 cartridge or the compact SMG's Deadvox entry
  - you register a new side-view reference photo for a Gungen design
---

# Compact SMG export

The compact SMG is traced from MP5-type side views with simple shapes and then built in the Gungen engine, as the hunting rifle was. Four features make the silhouette recognisable: the charging handle at the front, the telescoping buttstock, the rear aperture sight with its drum and the ringed front sight. The build must produce each one as real geometry and not as a decal or substitute part. This doc states intent before implementation; build rounds trim it to reasons and code cues (`PILLARS.md`, "Zero drift").

## Reference registration

The references are side-view photos kept outside the repository. The silhouette round lands the derived proportions table together with its first consumer, as the sporter and AK tables did; until then the trace data stays outside the tracked tree.

The main photo shows the stock extended, and the registration scales it to the 680 mm extended overall length in the [Small Arms Survey MP5 sheet](https://www.smallarmssurvey.org/sites/default/files/SAS-weapons-sub-machine-guns-Heckler-Koch-MP5.pdf). Matching a published length to a photo in the same configuration avoids the collapsed length, on which sources disagree. The span is from the muzzle stub's tip to the butt plate's rear face, the two features that are sharp in the photo.

The bore line runs through the muzzle axis and is horizontal in the photo, so the registration has no slope. The origin is the receiver's front face, where the handguard starts, matching the sporter's receiver/barrel datum (`docs/bolt-action-export.md`, "Reference registration"). Parts are traced around that fixed bore and datum and never moved to cover the photo, for the same reason given there. Depth, wall thickness and clearances are not recoverable from a side view and stay authoring choices.

A second photo shows a fixed-stock gun. It is scaled so that the muzzle-to-origin span matches the main registration, because the two guns share everything ahead of the receiver; the fixed stock's length then follows from the photo instead of being assumed. The collapsed telescoping position is the extended position shifted forward by the published stock travel, because neither photo shows it.

## Parts and joins

The design sits on the existing `smg` template; see `src/gun/templates.ts`, `smg`. The trace adds or changes these parts:

- **Upper receiver and end cap.** The receiver ends at the origin and the end cap holds the stock. The ejection port is on the right side of the receiver, ahead of the grip.
- **Cocking tube.** It runs from the receiver's front face along the top of the handguard and ends in a cap at the front sight base. The existing `smg-cocking-tube` from the handguard's `handleStyle: smg` already places the tube there, so the build tunes it; see `src/gun/parts.ts`, `smgSlidingHandle`. The slot in the tube has a notch at its rear end.
- **Handguard.** It hangs below the cocking tube, deeper at the rear than the front, and leaves the magazine well clear.
- **Front sight.** A base at the muzzle end carries a closed ring around a post. No front-sight style has a ring, so this needs a new style; see `src/gun/parts.ts`, `frontSight`.
- **Rear sight.** A static drum on a base on top of the receiver, with apertures around its rim. The existing rear-sight families have no drum, so this needs a new family; see `src/gun/parts.ts`, `sportingRearSight` and `akRearSight`.
- **Muzzle.** A plain stub, and a threaded, suppressor-ready muzzle as a design variant.
- **Lower.** The trigger housing hangs below the receiver and carries the pistol grip, trigger guard, selector, magazine release and a rear sling tab.
- **Magazine.** It is curved and forward-raked, entering a magwell just behind the origin; the existing `smg` magazine profile is the starting point. It holds the new 9x19 cartridge.
- **Stock.** Two variants on the same end cap. The telescoping stock has two struts that slide in the end cap and carry a butt plate; no stock style telescopes, so this needs a new style. The fixed stock is a solid buttstock traced from the fixed-stock photo; see `src/gun/parts.ts`, `stock`.

Joins keep the shared receiver frame so struts, tube and lower cannot drift from the receiver when it is retuned. The struts and their butt plate are one moving group, so the plate cannot be left behind at full extension.

## Rulings

- **Calibre and game entry.** The gun is chambered for a new 9x19 cartridge and ships in Deadvox. An existing pistol-class cartridge would misstate the gun, and a Gungen-only model would leave it out of play.
- **Stock.** Telescoping and fixed stocks are both built, as design variants. Each is a recognisable configuration of the gun, and variants keep the choice in content rather than in the firing model.
- **Handle lock-back.** The slot has a notch, and the handle has a held-back state in it. Holding the bolt open is part of how this gun is loaded and cleared, so travel alone would be incomplete.
- **Reference length.** The trace registers at 680 mm on a photo with the stock extended, for the reason in "Reference registration".
- **Rear drum.** The drum is static. Its turning axis cannot be recovered from a side view, and a turning drum would add a mover for a sight that uses one aperture on the eye line.
- **Muzzle.** The plain stub is the base, with a threaded or suppressor-ready muzzle as a variant, so a suppressor has a muzzle to fit later.

## Motion

Each mover is certified with the swept-clearance check, not exempted by family; see `src/gun/cycle.ts`, `sweepMovingPart`.

- **Charging handle.** The knob slides back along its slot in the cocking tube; the visible slot length bounds the travel. At the rear end it turns into the notch and stays there, which is the held-back state, until it is released forward. The handle is hand-only and does not move with each shot. The `smg` pattern has no resolved action yet: `resolveGunAction` resolves no `smg` pattern and the archetype's handle is not in `coupledParts`; see `src/gun/actionDescription.ts`. The handle round adds the action description and handle pairing.
- **Stock.** The telescoping stock moves between the collapsed and extended positions along the bore axis. It is a configuration state, not part of the firing cycle, so it does not belong on the action timeline. The fixed stock does not move.
- **Rear drum.** Static, so it has no motion.

## Export contract for Deadvox

The export follows the existing model record and anchors; it adds no new channel. See `src/gun/exportGlb.ts`, `DeadvoxModelEntry`, and `src/gun/anchorData.ts`, `GUN_ANCHORS`.

- **Hand datums.** The firing hand is at the grip anchor and the support hand is at the handguard support anchor, as in other handguard designs.
- **Magazine.** A detachable-magazine slot at the lower magwell, with round poses from the magazine column, so Deadvox reloads it like other box-fed guns.
- **Ejection port.** The receiver ejection anchor at the traced port.
- **Muzzle and sight.** The muzzle anchor at the muzzle's tip on each muzzle variant. The iron-sight eye line passes through the drum aperture and the front ring.
- **Stock and muzzle variants.** Each variant is its own export, so the model record needs no stock or muzzle field. The telescoping variant exports at its extended position, the registered one.

The record is refreshed through the same path as other credited guns, so Deadvox-owned fields survive; see `src/cli/refreshDeadvoxFirearms.ts`.

## Content tunables

Profiles, slot and travel limits, notch placement, stock travel, sight-ring sizes and drum aperture count are content values that the design selects, not named constants in code. The new stock style, front-sight style, rear-sight family and threaded muzzle are mechanisms in code, so a modded design can reuse them without a code edit (`PILLARS.md`, "Content forward compatibility"). The 9x19 cartridge is content beside the other cartridges in `cartridges/`. The proportions table owns silhouette defaults independently of any shipped design, as the sporter table does.

## Archetype decision

The compact SMG sits beside `designs/archetype-smg.json` as a new compact-smg Jsonnet design, which imports the archetype and overrides parts, as `designs/hunting-rifle.jsonnet` does with its base. The archetype is a canonical generator fixture with its own appearance variant (see `src/cli/exportFile.ts`, `FIXTURE_APPEARANCE`), so replacing it would change generator output that other checks rely on. Extending it in place would bend the generic fixture toward one traced gun. Its cocking tube, sliding handle and magazine profile are reused rather than duplicated.

## Build split

The registration round comes first and lands no code. The build rounds after it run in order. Every build round must pass these checks: validate reports no geometry issues for each design variant, every mover passes its swept-clearance check, and the export loads in Deadvox validation and model preparation. A round only adds checks of its own.

1. **Silhouette.** Add the compact-smg Jsonnet design on the archetype, adding the proportions table at the 680 mm registration with this first consumer, and using it for the receiver, handguard, cocking tube, lower, grip and magazine. Add the plain and threaded muzzle variants. Its own checks: the bore and receiver datum match the registration, and the muzzle anchor sits at the tip of each muzzle variant.
2. **Sights.** Add the ringed front-sight style and the static drum rear-sight family. Its own check: the eye line passes through the aperture and ring.
3. **Charging handle.** Tune the existing sliding handle to the traced slot, add the notch at the slot's rear end and the held-back state. Add the `smg` action description in `src/gun/actionDescription.ts` and pair the handle in `coupledParts`. Its own checks: the handle clears the front sight base and handguard over its full travel and into the notch, the held-back state stays in the notch, and `resolveGunAction` resolves an action for the `smg` pattern.
4. **Stocks.** Add the telescoping stock style with collapsed and extended states, and the fixed stock, as design variants. Its own checks: the struts clear the end cap and lower at both ends, and the grip datum moves with neither the telescoping stock nor the choice of variant.
5. **Cartridge and Deadvox entry.** Add the 9x19 cartridge as content, chamber the gun and its magazine for it, then export, refresh and credit each variant in Deadvox. Its own checks: the cartridge validates, and the gungen-deadvox contract test covers each shipped variant.
