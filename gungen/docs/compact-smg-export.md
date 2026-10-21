---
read_if:
  - you build or tune the compact SMG or its telescoping or fixed stock, drum rear sight or hooded front sight
  - you change the forward cocking tube or sliding handle that the compact SMG reuses
  - you add the 9x19 cartridge or the compact SMG's Deadvox entry
  - you choose the reference drawing or photos a Gungen design is traced from
  - you separate a traced design's appearance profile from a generator fixture
  - you change the structured Deadvox export recipe or add shipped variants
---

# Compact SMG export

The compact SMG is traced from a dimensioned HK schematic with simple shapes and then built in the Gungen engine, as the hunting rifle was. Four features make the silhouette recognisable: the charging handle at the front, the telescoping buttstock, the rear aperture sight with its drum and the ringed front sight. The build must produce each one as real geometry and not as a decal or substitute part. This doc states intent before implementation; build rounds trim it to reasons and code cues (`PILLARS.md`, "Zero drift").

## Reference registration

The reference is HK's dimensioned [SP5 schematic](https://www.americanrifleman.org/media/vp5o0jbz/hksp1.jpg), kept outside the repository, together with the MP5A3's published specification and the fixed-stock length in the [Swedish Wikipedia MP5 article](https://sv.wikipedia.org/wiki/Heckler_%26_Koch_MP5). The silhouette round lands the derived proportions table together with its first consumer, as the sporter and AK tables did; until then the trace data stays outside the tracked tree.

Side-view photos are not references for this gun. Two photos scaled differently along and across the bore cannot share one receiver, while one dimensioned drawing plus published numbers gives the shared parts a single consistent source.

The SP5 has the MP5's receiver, barrel group, sights and grip but no stock, so the schematic gives the shape from the end cap to the muzzle. Only its labels give dimensions, because the picture is not drawn to scale. Positions along the bore therefore scale on the overall-length label, from the end cap's rear face to the muzzle tip, and heights scale on the height label, from the rear sight's top to the grip's bottom.

Where the schematic and the specification both give a number, the specification's is used, because it describes the gun being built and the SP5 is its civilian sibling. That applies to the barrel: the specification's 225 mm, measured back from the muzzle tip, places the breech, not the schematic's 8.66 in label.

The SP5 lacks the stocks, so their lengths come from elsewhere. The MP5A3 specification gives the telescoping stock's lengths. It has no fixed stock, which belongs to the MP5A2, so the fixed stock's length comes from the Wikipedia article. Each length runs from the muzzle tip to the butt plate's rear face. The shared parts register on the schematic's threaded muzzle tip, so measuring the stock lengths from that same tip keeps one datum. The stocks' shapes are covered in "Rulings", "Reference length".

The bore line runs through the muzzle axis and is horizontal in the schematic, so the registration has no slope. The origin is the receiver's front face, where the handguard starts, matching the sporter's receiver/barrel datum (`docs/bolt-action-export.md`, "Reference registration"). Parts are traced around that fixed bore and datum and never moved to cover the drawing, for the same reason given there. Depth, wall thickness and clearances are not recoverable from a side view and stay authoring choices.

## Parts and joins

The design sits on the existing `smg` template; see `src/gun/templates.ts`, `smg`. The trace adds or changes these parts:

- **Upper receiver and end cap.** The receiver ends at the origin and the end cap holds the stock. The ejection port is on the right side of the receiver, ahead of the grip.
- **Cocking tube.** It runs from the receiver's front face along the top of the handguard and ends in a cap at the front sight base. The existing `smg-cocking-tube` from the handguard's `handleStyle: smg` already places the tube there, so the build tunes it; see `src/gun/parts.ts`, `smgSlidingHandle`. The slot in the tube has a notch at its rear end.
- **Handguard.** It hangs below the cocking tube, deeper at the rear than the front, and leaves the magazine well clear.
- **Front sight.** A base at the muzzle end carries a closed ring around a post. No front-sight style has a ring, so this needs a new style; see `src/gun/parts.ts`, `frontSight`.
- **Rear sight.** A static drum on a base on top of the receiver, with apertures around its rim. The existing rear-sight families have no drum, so this needs a new family; see `src/gun/parts.ts`, `sportingRearSight` and `akRearSight`.
- **Muzzle.** A threaded, suppressor-ready muzzle on the existing thread mount (see `src/gun/mounts.ts`, `muzzle`), as the schematic draws it, and a plain stub whose length is the model's own design.
- **Lower.** The trigger housing hangs below the receiver and carries the pistol grip, trigger guard, selector, magazine release and a rear sling tab.
- **Magazine.** It is curved and forward-raked, entering a magwell just behind the origin; the existing `smg` magazine profile is the starting point. It holds the new 9x19 cartridge.
- **Stock.** Two variants on the same end cap. The telescoping stock has two struts that slide in the end cap and carry a butt plate; no stock style telescopes, so this needs a new style. The fixed stock is a solid buttstock; see `src/gun/parts.ts`, `stock`. Both profiles are designed, not traced.

Joins keep the shared receiver frame so struts, tube and lower cannot drift from the receiver when it is retuned. The struts and their butt plate are one moving group, so the plate cannot be left behind at full extension.

## Rulings

- **Calibre and game entry.** The gun is chambered for a new 9x19 cartridge and ships in Deadvox. An existing pistol-class cartridge would misstate the gun, and a Gungen-only model would leave it out of play.
- **Stock.** Telescoping and fixed stocks are both built, as design variants. Each is a recognisable configuration of the gun, and variants keep the choice in content rather than in the firing model.
- **Handle lock-back.** The slot has a notch, and the handle has a held-back state in it. Holding the bolt open is part of how this gun is loaded and cleared, so travel alone would be incomplete.
- **Reference length.** Each stock has its published overall length: 680 mm for the fixed stock ([Swedish Wikipedia MP5 article](https://sv.wikipedia.org/wiki/Heckler_%26_Koch_MP5)), and 700 mm extended and 550 mm collapsed for the telescoping stock (the MP5A3 specification). Both stocks sit on the one receiver the schematic gives. Each stock's profile, such as the butt outline, the strut spacing and the butt plate, is the model's own design within its lengths, because the schematic has no stock.
- **Rear drum.** The drum is static. Its turning axis cannot be recovered from a side view, and a turning drum would add a mover for a sight that uses one aperture on the eye line.
- **Muzzle.** The threaded muzzle is the one Deadvox ships, so a suppressor has a muzzle to fit later. The plain stub stays a Gungen export only.
- **Deadvox variants.** Deadvox ships two entries, one per stock, both with the threaded muzzle, the one a suppressor fits.

## Motion

Each mover is certified with the swept-clearance check, not exempted by family; see `src/gun/cycle.ts`, `sweepMovingPart`.

- **Charging handle.** The knob slides back along its slot in the cocking tube; the visible slot length bounds the travel. At the rear end it turns into the notch and stays there, which is the held-back state, until it is released forward. The handle is hand-only and does not move with each shot. The `smg` pattern has no resolved action yet: `resolveGunAction` resolves no `smg` pattern and the archetype's handle is not in `coupledParts`; see `src/gun/actionDescription.ts`. The handle round adds the action description and handle pairing.
- **Stock.** The telescoping stock moves between the collapsed and extended positions along the bore axis. It is a configuration state, not part of the firing cycle, so it does not belong on the action timeline. The fixed stock does not move.
- **Rear drum.** Static, so it has no motion.

## Export contract for Deadvox

The export uses the shared model envelope rather than adding a compact-SMG channel: hand, loading and sight relationships belong to fitted geometry, not invented gameplay coordinates. See `src/gun/exportGlb.ts`, `DeadvoxModelEntry`, and `src/gun/anchorData.ts`, `GUN_ANCHORS`. Distinct stock and muzzle choices keep separate export identities so the playable model needs no configuration-specific channel.

Shipped variants belong in `exports/deadvox.jsonnet` so the consumption boundary cannot silently omit a variant or infer equipment from another gun. Exporter-written records remain separate from authored gameplay overlays; see `src/cli/exportRecipe.ts`, `loadExportRecipe`, and `src/cli/refreshDeadvox.ts`.

## Content tunables

Profiles, slot and travel limits, notch placement (no source dimensions the notch, so its placement is an engineering choice), stock lengths and travel, sight-ring sizes and drum aperture count are content values that the design selects, not named constants in code. The new stock style, front-sight style, rear-sight family and threaded muzzle are mechanisms in code, so a modded design can reuse them without a code edit (`PILLARS.md`, "Content forward compatibility"). The 9x19 cartridge is content beside the other cartridges in `cartridges/`. The proportions table owns silhouette defaults independently of any shipped design, as the sporter table does.

## Archetype decision

Keep the traced compact SMG separate from its canonical generator fixture. Replacing the
fixture would change generator output that other checks rely on; extending it in place
would bend the generic fixture toward one traced gun. A separate appearance profile keeps
that boundary explicit; see `src/cli/exportFile.ts`, `FIXTURE_APPEARANCE`.

## Build split

The registration round comes first and lands no code. The build rounds after it run in order. Every build round must pass these checks: validate reports no geometry issues for each design variant, every mover passes its swept-clearance check, and the export loads in Deadvox validation and model preparation. A round only adds checks of its own.

1. **Silhouette.** Add the compact-smg Jsonnet design on the archetype, adding the proportions table with this first consumer. The table takes the shared parts from the schematic's registration the telescoping stock's lengths from the specification and the fixed stock's from the Wikipedia article, and the design uses it for the receiver, handguard, cocking tube, lower, grip and magazine. Add the threaded and plain muzzle variants. Its own checks: the bore and receiver datum match the registration, and the muzzle anchor sits at the tip of each muzzle variant.
2. **Sights.** Add the ringed front-sight style and the static drum rear-sight family. Its own check: the eye line passes through the aperture and ring.
3. **Charging handle.** Tune the existing sliding handle to the traced slot, add the notch at the slot's rear end and the held-back state. Add the `smg` action description in `src/gun/actionDescription.ts` and pair the handle in `coupledParts`. Its own checks: the handle clears the front sight base and handguard over its full travel and into the notch, the held-back state stays in the notch, and `resolveGunAction` resolves an action for the `smg` pattern.
4. **Stocks.** Add the telescoping stock style with collapsed and extended states, and the fixed stock, as design variants. Its own checks: the struts clear the end cap and lower at both ends, and the grip datum moves with neither the telescoping stock nor the choice of variant.
5. **Cartridge and Deadvox entry.** Add the 9x19 cartridge as content, chamber the gun and its magazine for it, then export and refresh the two threaded-muzzle variants, one per stock, and credit them in Deadvox. Its own checks: the cartridge validates, and the gungen-deadvox contract test covers both shipped entries.
