---
read_if:
  - you build or tune the compact SMG or its telescoping or fixed stock
  - you add or change the compact SMG's sights
  - you retrace the compact SMG from its reference photo
  - you change the forward cocking tube or sliding handle that the compact SMG reuses
  - you add the 9x19 cartridge or the compact SMG's Deadvox entry
  - you choose the reference drawing or photos a Gungen design is traced from
  - you separate a traced design's appearance profile from a generator fixture
  - you change the structured Deadvox export recipe or choose shipped compact-SMG variants
---

# Compact SMG export

The compact SMG is traced from a side photo of an MP5A3 with simple shapes and then built in the Gungen engine, as the hunting rifle was. It must read as an MP5 from the side: the receiver and end cap, the drum rear sight and hooded front sight, the slim handguard under the cocking tube, the charging handle in its notch, the curved magazine, the grip and trigger group, and the telescoping stock. The build produces each one as real geometry and not as a decal or substitute part.

## Reference trace

The reference is the [DWS MP5 photo](https://dwsuk.org/WebRoot/Store15/Shops/057184c7-2fa2-4321-880c-a30e87657239/69C7/6D80/385B/37A6/29EB/0A48/355D/84FE/DSCF7535-Photoroom.jpg), kept outside the repository. It shows the same gun twice, with the stock collapsed and extended. The traced table is `src/gun/compactSmgProportions.ts`, `COMPACT_SMG_PROPORTIONS`; each value there is a photo estimate in the gun frame, so a retrace changes the table and nothing else.

The photo is not dimensioned, so it is scaled from a published length: the extended gun's overall length, from the threaded muzzle tip to the butt pad's rear face, is the MP5A3 specification's 700 mm. The two guns are pictured at different sizes, so the collapsed gun takes its scale from the extended one through body landmarks both share: the receiver's front face and end cap, the front-sight housing and the muzzle tip. Measured at that transferred scale, the collapsed gun comes out about 4% shorter than the specification's 550 mm. That gap is the trace's residual uncertainty, from landmark picking and the photo's perspective; it does not confirm the scale. The published lengths rule, so the collapsed stock sits at 550 mm and not where the photo puts it. The barrel length is the specification's 225 mm, measured back from the threaded muzzle tip, which places the breech.

The bore line runs through the muzzle axis and is horizontal in the photo, so the registration has no slope. The origin is the receiver's front face, where the handguard starts, matching the sporter's receiver/barrel datum (`docs/bolt-action-export.md`, "Reference registration"). Parts are traced around that fixed bore and datum and never moved to cover the photo, for the same reason given there. Depth, wall thickness and clearances are not recoverable from a side view and stay authoring choices.

A traced shape yields to a gun rule where the two disagree, and the table's comments name each such case. The trigger guard is the main one: the photo's curved guard becomes four straight bars, because the trigger-guard rule reads a top bar, a bottom bar and two walls of one thickness; see `src/gun/rules.ts`, `triggerGuardGeometryFits`. The front-sight post is another: its tip stands at the rear aperture's height and not at the photo's, because the sight line must run parallel to the bore (see "Sights" under "Rulings").

Some photo detail is beyond the build's primitives and stays a known difference. The hood is a ring around the bore's axis, so from the side it shows square corners where the photo's hood is rounded and tapers toward the top. Knurling on the knob and the sight wheel is finer than the gun voxel grain (`src/gun/gunVoxel.json`), so those surfaces are smooth.

## Parts and joins

The design sits on the `compactSmg` template; see `src/gun/templates.ts`, `compactSmg`. Its traced parts come from the compact-SMG builders in `src/gun/parts.ts`:

- **Receiver and end cap.** The receiver's own section keeps its outline, end-cap slope and cavity tied to the table; see `RECEIVER_SECTION` and `compactSmgReceiverDetails`, which add the rear lug and the drum rear sight. The drum is built in pieces around a square aperture, and the receiver carries the gun's sight axis through it; see `compactSmgSightAxis`. The section forces the `smg` carrier pattern in `carrierPatternFor`, because the other patterns' carriers do not fit its cavity.
- **Barrel and front sight.** The barrel carries the front-sight block, tower, hood ring, post, the knurled wheel on the housing's front face, and the muzzle collar; see `compactSmgBarrelDetails`. The hood ring's axis is the bore's.
- **Cocking tube.** The handguard places it from the receiver's front face to the front-sight block; see `smgCockingTube`. The tube is open walls, so the handle stem rides in a real slot on the shooter's left, with the notch opening up from the slot's rear end.
- **Handguard.** It hangs below the cocking tube and leaves the magazine well clear.
- **Muzzle.** A threaded, suppressor-ready muzzle on the existing thread mount (see `src/gun/mounts.ts`, `muzzle`), and a plain stub whose length is the model's own design. The barrel's `muzzle` param picks the variant, and the port id stays `muzzle` so the anchor sits at the tip of either.
- **Lower.** The trigger housing, magazine well, trigger and guard; see `compactSmgLower`. The housing's flat bottom is the grip's mount face.
- **Grip.** Traced pieces turned onto the grip's lean; see `compactSmgGrip`. Its front meets the guard's rear wall.
- **Magazine.** Traced, curved and forward-raked; see `compactSmgMagazine`. Its top hides in the well.
- **Stock.** The telescoping stock is traced from the photo: a butt pad on two struts, with the latch housing and lever on the end cap; see `compactSmgTelescopingStock`. Its `pose` param picks extended or collapsed. The photo has no fixed stock, so the fixed stock is the generic straight style at its published length.

Joins keep the shared receiver frame, so struts, tube and lower cannot drift from the receiver when it is retuned. The struts and their butt pad are one group, so the pad cannot be left behind at either pose.

## Rulings

- **Calibre and game entry.** The gun is chambered for a new 9x19 cartridge and ships in Deadvox. An existing pistol-class cartridge would misstate the gun, and a Gungen-only model would leave it out of play.
- **Stock.** Telescoping and fixed stocks are both built, as design variants. Each is a recognisable configuration of the gun, and variants keep the choice in content rather than in the firing model.
- **Handle lock-back.** The slot has a notch, and the handle has a held-back state in it. Holding the bolt open is part of how this gun is loaded and cleared, so travel alone would be incomplete.
- **Reference length.** Each stock has its published overall length: 680 mm for the fixed stock ([Swedish Wikipedia MP5 article](https://sv.wikipedia.org/wiki/Heckler_%26_Koch_MP5)), and 700 mm extended and 550 mm collapsed for the telescoping stock (the MP5A3 specification). A published length outranks the photo, because the photo is only scaled from one of them.
- **Sights.** The gun carries the MP5's own sights, traced as receiver and barrel solids, and no add-on sight parts. A sight is allowed only when it looks like this gun's sight: a generic sight would make the gun read as something else, so no sight is better than a wrong one. Sight solids that look right must also work: the export finds the eye through the drum's aperture and the line onto the post's tip (see `src/gun/exportGlb.ts`, `drawnIronSightLine`), so a sight that only looks like one cannot ship as a sightless gun. The sight axis runs parallel to the bore because the domain's sight rule rejects a tilted one.
- **Muzzle.** The threaded muzzle provides a suppressor mount; the plain stub keeps an unthreaded authoring alternative.

## Motion

Each mover is certified with the swept-clearance check, not exempted by family; see `src/gun/cycle.ts`, `sweepMovingPart`.

- **Charging handle.** The knob slides back along its slot in the cocking tube; the slot length bounds the travel. At the rear end it turns into the notch and stays there, which is the held-back state, until it is released forward. The handle is hand-only and does not move with each shot, so its pairing references the hand timeline only; see `src/gun/actionDescription.ts`, `coupledParts`. The hand turns it in and out inside the rear dwell, so the carrier stays back and never turns. The timeline rejects a turn duration that is not positive or does not fit inside the dwell. A held hand stops the cycle clock at the hold point until released; the viewer's hold toggle drives that clock. See `src/gun/cycle.ts`, `advanceCycleClock`. The turn sweep certifies the knob into the notch; see `src/gun/boltSweep.ts`, `sweepTurningAction`. The export omits the notch turn because it is a held state, not a cycle step: Deadvox requires unlock and lock phases for every exported turn. See `src/gun/exportGlb.ts`, `buildActionExport`.
- **Stock.** The telescoping stock's pose is a configuration state, not part of the firing cycle, so it is a design param and not on the action timeline. The fixed stock does not move.

## Export contract for Deadvox

The export uses the shared model envelope rather than adding a compact-SMG channel: hand, loading and sight relationships belong to fitted geometry, not invented gameplay coordinates. See `src/gun/exportGlb.ts`, `DeadvoxModelEntry`, and `src/gun/anchorData.ts`, `GUN_ANCHORS`. Distinct stock and muzzle choices keep separate export identities, so the playable model needs no configuration-specific channel.

Ship one threaded-muzzle export per stock, so both stock configurations remain available and each accepts a suppressor. Keep the plain-muzzle variants Gungen-only. These shipping choices belong in `exports/deadvox.jsonnet`, so the consumption boundary cannot silently omit a variant or infer equipment from another gun. Exporter-written records remain separate from authored gameplay overlays; see `src/cli/exportRecipe.ts`, `loadExportRecipe`, and `src/cli/refreshDeadvox.ts`.

## Content tunables

No source dimensions the slot, the handle's travel or the knob's reach from the tube. The notch is traced; the slot runs forward from it to where the knob's hand space meets the front-sight block, because the hand cannot pull the knob from further forward; see `src/gun/parts.ts`, `smgTubeFor`. The knob's reach is set so it clears the handguard's side, since the side photo cannot show it. The notch turn is an engineering choice. The rear aperture's size and the eye relief behind the drum are estimates too: the aperture is the smallest hole the gun voxel grain keeps open, and the eye sits where the cheek rests on the stock. A cocking tube without a traced notch takes its slot length from `src/gun/smgHandleProportions.ts`, `SMG_HANDLE_PROPORTIONS`, a design estimate since nothing traces it.

Profiles, the slot's ends, notch placement and turn duration, and stock lengths are content values in `COMPACT_SMG_PROPORTIONS`, not named constants in code, and design params are enumerated choices only. The traced builders and the telescoping stock style are mechanisms in code, so a modded design can reuse them without a code edit (`PILLARS.md`, "Content forward compatibility"). The 9x19 cartridge is content beside the other cartridges in `cartridges/`. The proportions table owns silhouette defaults independently of any shipped design, as the sporter table does.

## Archetype decision

Keep the traced compact SMG separate from its canonical generator fixture. Replacing the fixture would change generator output that other checks rely on; extending it in place would bend the generic fixture toward one traced gun. A separate appearance profile keeps that boundary explicit; see `src/cli/exportFile.ts`, `FIXTURE_APPEARANCE`.

## Build split

The build rounds run in order. Every build round must pass these checks: validate reports no geometry issues for each design variant, every mover passes its swept-clearance check, and the export loads in Deadvox validation and model preparation. A round only adds checks of its own.

1. **Silhouette.** `designs/compact-smg.jsonnet` and `designs/compact-smg-plain.jsonnet` on the `compactSmg` template, traced part by part against the reference photo; their datum and muzzle checks are `test/compactSmgReference.test.ts`.
2. **Charging handle.** The slotted tube, the notch and its held-back turn, the `smg` action and the hand-only handle pairing; their checks are `test/smgChargingHandle.test.ts` and the viewer hold case in `test/cycleView.test.ts`.
3. **Stocks.** Ship the telescoping stock's two poses and the fixed stock as design variants. Its own checks: the struts clear the end cap and lower at both poses, and the grip datum moves with neither the pose nor the choice of variant.
4. **Cartridge and Deadvox entry.** Add the 9x19 cartridge as content, chamber the gun and its magazine for it, then export and refresh the two threaded-muzzle variants, one per stock, and credit them in Deadvox. Its own checks: the cartridge validates, and the gungen-deadvox contract test covers both shipped entries.
5. **Details.** The selector, magazine release and rear sling tab on the lower, and the ejection port on the receiver's right side. Its own checks: the ejection port opens the receiver wall without cutting into the bolt's swept path.
