---
read_if:
  - you build or tune the compact SMG or its telescoping or fixed stock
  - you add sights to the compact SMG
  - you change the forward cocking tube or sliding handle that the compact SMG reuses
  - you add the 9x19 cartridge or the compact SMG's Deadvox entry
  - you choose the reference drawing or photos a Gungen design is traced from
  - you separate a traced design's appearance profile from a generator fixture
  - you change the structured Deadvox export recipe or choose shipped compact-SMG variants
---

# Compact SMG export

The compact SMG is traced from a dimensioned HK schematic with simple shapes and then built in the Gungen engine, as the hunting rifle was. Two features make the silhouette recognisable: the charging handle at the front and the telescoping buttstock. The build must produce each one as real geometry and not as a decal or substitute part.
## Reference registration

The reference is HK's dimensioned [SP5 schematic](https://www.americanrifleman.org/media/vp5o0jbz/hksp1.jpg), kept outside the repository, together with the MP5A3's published specification and the fixed-stock length in the [Swedish Wikipedia MP5 article](https://sv.wikipedia.org/wiki/Heckler_%26_Koch_MP5). The derived proportions table is `src/gun/compactSmgProportions.ts`, `COMPACT_SMG_PROPORTIONS`. It is derived from the dimensions cited here because the trace data stays outside the tracked tree, so a retrace changes the table and nothing else.

Side-view photos are not references for this gun. Two photos scaled differently along and across the bore cannot share one receiver, while one dimensioned drawing plus published numbers gives the shared parts a single consistent source.

The SP5 has the MP5's receiver, barrel group, sights and grip but no stock, so the schematic gives the shape from the end cap to the muzzle. Only its labels give dimensions, because the picture is not drawn to scale. Positions along the bore therefore scale on the overall-length label, from the end cap's rear face to the muzzle tip, and heights scale on the height label, from the rear sight's top to the grip's bottom.

Where the schematic and the specification both give a number, the specification's is used, because it describes the gun being built and the SP5 is its civilian sibling. That applies to the barrel: `COMPACT_SMG_PROPORTIONS`, `barrel` subtracts the specification's 225 mm, measured back from the threaded muzzle tip, to place the breech and seat the barrel there, rather than using the schematic's 8.66 in label. The threaded tip keeps its registered position; the plain authoring variant keeps its separately traced tip and therefore has a shorter stub.

The SP5 lacks the stocks, so their lengths come from elsewhere. The MP5A3 specification gives the telescoping stock's lengths. It has no fixed stock, which belongs to the MP5A2, so the fixed stock's length comes from the Wikipedia article. Each length runs from the muzzle tip to the butt plate's rear face. The shared parts register on the schematic's threaded muzzle tip, so measuring the stock lengths from that same tip keeps one datum. The stocks' shapes are covered in "Rulings", "Reference length".

The bore line runs through the muzzle axis and is horizontal in the schematic, so the registration has no slope. The origin is the receiver's front face, where the handguard starts, matching the sporter's receiver/barrel datum (`docs/bolt-action-export.md`, "Reference registration"). Parts are traced around that fixed bore and datum and never moved to cover the drawing, for the same reason given there. Depth, wall thickness and clearances are not recoverable from a side view and stay authoring choices.

## Parts and joins

The design sits on the existing `smg` template; see `src/gun/templates.ts`, `smg`. The trace adds or changes these parts:

- **Upper receiver and end cap.** The receiver's own section keeps its outline and cavity tied to the table; see `src/gun/parts.ts`, `RECEIVER_SECTION`. The section forces the `smg` carrier pattern in `carrierPatternFor`, because the other patterns' carriers do not fit its cavity. The end cap holds the stock.
- **Cocking tube.** The handguard's `handleStyle: smg` places it from the receiver's front face to the handguard's front end; see `src/gun/parts.ts`, `smgCockingTube`. The tube is open walls, not a solid block, so the handle stem rides in a real slot on the shooter's left. A notch opens up from the slot's rear end.
- **Handguard.** It hangs below the cocking tube and leaves the magazine well clear; see `src/gun/parts.ts`, `standardHandguardLength`. Intent, owned by Build split round 5: it is deeper at the rear than at the front, as the schematic draws it.
- **Sights.** None; see "Rulings", "Sights". The receiver has no rail and the design carries no optic.
- **Muzzle.** A threaded, suppressor-ready muzzle on the existing thread mount (see `src/gun/mounts.ts`, `muzzle`), as the schematic draws it, and a plain stub whose length is the model's own design. The barrel's `muzzle` param picks the variant, and the port id stays `muzzle` so the anchor sits at the tip of either.
- **Lower.** The trigger housing hangs below the receiver and carries the pistol grip and trigger guard. Intent, owned by Build split round 5: it also carries the selector, the magazine release and a rear sling tab, as the schematic draws them.
- **Ejection port.** Intent, owned by Build split round 5: an opening in the receiver's right side, ahead of the grip, as the schematic draws it.
- **Magazine.** It is curved and forward-raked, entering a magwell just behind the origin, on the existing `smg` magazine profile. It holds the new 9x19 cartridge once round 4 adds it.
- **Stock.** Two variants on the same end cap. The telescoping stock has two struts that slide in the end cap and carry a butt plate; no stock style telescopes, so this needs a new style. The fixed stock is a solid buttstock; see `src/gun/parts.ts`, `stock`. Both profiles are designed, not traced.

Joins keep the shared receiver frame so struts, tube and lower cannot drift from the receiver when it is retuned. The struts and their butt plate are one moving group, so the plate cannot be left behind at full extension.

## Rulings

- **Calibre and game entry.** The gun is chambered for a new 9x19 cartridge and ships in Deadvox. An existing pistol-class cartridge would misstate the gun, and a Gungen-only model would leave it out of play.
- **Stock.** Telescoping and fixed stocks are both built, as design variants. Each is a recognisable configuration of the gun, and variants keep the choice in content rather than in the firing model.
- **Handle lock-back.** The slot has a notch, and the handle has a held-back state in it. Holding the bolt open is part of how this gun is loaded and cleared, so travel alone would be incomplete.
- **Reference length.** Each stock has its published overall length: 680 mm for the fixed stock ([Swedish Wikipedia MP5 article](https://sv.wikipedia.org/wiki/Heckler_%26_Koch_MP5)), and 700 mm extended and 550 mm collapsed for the telescoping stock (the MP5A3 specification). Both stocks sit on the one receiver the schematic gives. Each stock's profile, such as the butt outline, the strut spacing and the butt plate, is the model's own design within its lengths, because the schematic has no stock.
- **Sights.** The gun carries no sights until a new sight design is ruled. The traced drum rear sight and ringed front sight did not read as this gun's sights at any level of detail, so no sight is better than a wrong one.
- **Muzzle.** The threaded muzzle provides a suppressor mount; the plain stub retains an unthreaded authoring alternative.

## Motion

Each mover is certified with the swept-clearance check, not exempted by family; see `src/gun/cycle.ts`, `sweepMovingPart`.

- **Charging handle.** The knob slides back along its slot in the cocking tube; the visible slot length bounds the travel. At the rear end it turns into the notch and stays there, which is the held-back state, until it is released forward. The handle is hand-only and does not move with each shot, so its pairing references the hand timeline only; see `src/gun/actionDescription.ts`, `coupledParts`. The hand turns it in and out inside the rear dwell, so the carrier stays back and never turns. A held hand stops the cycle clock at the hold point until released; the viewer's hold toggle drives that clock. See `src/gun/cycle.ts`, `advanceCycleClock`. The turn sweep certifies the stem into the notch; see `src/gun/boltSweep.ts`, `sweepTurningAction`. The export omits the notch turn because it is a held state, not a cycle step: Deadvox requires unlock and lock phases for every exported turn. See `src/gun/exportGlb.ts`, `buildActionExport`.
- **Stock.** The telescoping stock moves between the collapsed and extended positions along the bore axis. It is a configuration state, not part of the firing cycle, so it does not belong on the action timeline. The fixed stock does not move.

## Export contract for Deadvox

The export uses the shared model envelope rather than adding a compact-SMG channel: hand, loading and sight relationships belong to fitted geometry, not invented gameplay coordinates. See `src/gun/exportGlb.ts`, `DeadvoxModelEntry`, and `src/gun/anchorData.ts`, `GUN_ANCHORS`. Distinct stock and muzzle choices keep separate export identities so the playable model needs no configuration-specific channel.

Ship one threaded-muzzle export per stock so both stock configurations remain available and each accepts a suppressor. Keep the plain-muzzle variants Gungen-only. These shipping choices belong in `exports/deadvox.jsonnet` so the consumption boundary cannot silently omit a variant or infer equipment from another gun. Exporter-written records remain separate from authored gameplay overlays; see `src/cli/exportRecipe.ts`, `loadExportRecipe`, and `src/cli/refreshDeadvox.ts`.

## Content tunables

No source dimensions the slot or the notch. The slot length is set so the handle's travel matches the carrier stroke, because shorter travel would not open the bolt fully; the notch turn is an engineering choice. A retrace changes only `COMPACT_SMG_PROPORTIONS`, `chargingHandle`. Profiles, slot and travel limits, notch placement, and stock lengths and travel are content values that the design selects, not named constants in code. Design params are enumerated choices only, so numeric values live in `COMPACT_SMG_PROPORTIONS`. The new stock style and threaded muzzle are mechanisms in code, so a modded design can reuse them without a code edit (`PILLARS.md`, "Content forward compatibility"). The 9x19 cartridge is content beside the other cartridges in `cartridges/`. The proportions table owns silhouette defaults independently of any shipped design, as the sporter table does.

## Archetype decision

Keep the traced compact SMG separate from its canonical generator fixture. Replacing the
fixture would change generator output that other checks rely on; extending it in place
would bend the generic fixture toward one traced gun. A separate appearance profile keeps
that boundary explicit; see `src/cli/exportFile.ts`, `FIXTURE_APPEARANCE`.

## Build split

The build rounds run in order. Every build round must pass these checks: validate reports no geometry issues for each design variant, every mover passes its swept-clearance check, and the export loads in Deadvox validation and model preparation. A round only adds checks of its own.

1. **Silhouette.** `designs/compact-smg.jsonnet` and `designs/compact-smg-plain.jsonnet` on the `compactSmg` template; their datum and muzzle checks are `test/compactSmgReference.test.ts`.
2. **Charging handle.** The slotted tube, the notch and its held-back turn, the `smg` action and the hand-only handle pairing; their checks are `test/smgChargingHandle.test.ts` and the viewer hold case in `test/cycleView.test.ts`.
3. **Stocks.** Add the telescoping stock style with collapsed and extended states, and the fixed stock, as design variants. Its own checks: the struts clear the end cap and lower at both ends, and the grip datum moves with neither the telescoping stock nor the choice of variant.
4. **Cartridge and Deadvox entry.** Add the 9x19 cartridge as content, chamber the gun and its magazine for it, then export and refresh the two threaded-muzzle variants, one per stock, and credit them in Deadvox. Its own checks: the cartridge validates, and the gungen-deadvox contract test covers both shipped entries.
5. **Schematic details.** The handguard deeper at the rear than at the front, the selector, magazine release and rear sling tab on the lower, and the ejection port on the receiver's right side. Its own checks: the handguard stays clear of the cocking handle's travel and the magazine well, and the ejection port opens the receiver wall without cutting into the bolt's swept path.
