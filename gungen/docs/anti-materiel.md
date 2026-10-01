---
id: skelly::gungen-anti-materiel
description: The anti-materiel rifle archetype in gungen - the vocabulary it added, the rules, the modelling choices and where its proportions come from.
tags: [gungen, archetype, anti-materiel, vocabulary]
created: 2026-10-01
status: active
---

# Anti-materiel rifle archetype

An M82-style semi-automatic anti-materiel rifle (GitHub issue #110), added as
vocabulary and a template, not as a reproduction of any model or brand
(`PROJECT.md`, non-goals). Real rifles are proportion references only.

Template `anti-materiel`, published design `designs/archetype-anti-materiel.json`,
fixture `fixtures/archetype-anti-materiel.json`.

## Where the code is

Everything new lives in `src/gun/antiMateriel/`. The rest of gungen reaches it
through these single-line registrations:

| Existing file | Edit | Why |
| --- | --- | --- |
| `src/gun/parts.ts` | import + `...ANTI_MATERIEL_FAMILIES` at the end of `FAMILIES` | registers the families |
| `src/gun/parts.ts` | `barrel`'s `muzzle` keep-out gains `allowPort: 'muzzle'` | the part on the muzzle port (a brake) may stand in the space in front of the muzzle; nothing else may. No geometry or param changes |
| `src/gun/domain.ts` | import + `...ANTI_MATERIEL_RULES` at the end of `rules` | registers the rules |
| `src/gun/palette.ts` | import + one spread per table (colours, slots, shades, finishes) | the palette tests need a colour, slot and shade for every role and registry key |
| `src/gun/templates.ts` | one appended `antiMateriel` block and one list entry | the template |

`src/gun/antiMateriel/` imports only from `core`, never from `parts.ts`, because
`parts.ts` imports it.

## Families

| Registry key | Role | Params | What it is |
| --- | --- | --- | --- |
| `muzzle-brake` | `muzzle-brake` | `length` M/L (9/11u); `bore` and `profile` (standard, heavy) follow the barrel | Threads on the barrel's `muzzle` port. Octagonal core and collar, and four swept wing chambers (two per side) split by a 0.5u vent slot. In plan it is an arrowhead: widest at the barrel, narrowing to the nose. A pistol or revolver barrel is refused as a `structure` issue |
| `barrel-shroud` | `barrel-shroud` | `length` S/M/L (16/22/28u) | A stamped-box upper the barrel recoils inside: receiver front-face height and width, 0.5u walls, a front bulkhead that guides the barrel. Extends the top rail and carries the bipod port |
| `bipod` | `bipod` | `legs` S/M/L (12/18/20u reach), `pose` folded/deployed | Mounts under the shroud; carries a `leg-sweep` keep-out |
| `carry-handle` | `carry-handle` | none | Four posts and a grip bar on the receiver rail; carries a `hand-room` keep-out |
| `recoil-stock` | `stock` | `length` M/L (16/22u) | Tall body, cheek rest, wide flat rubber pad; has a `monopod` port |
| `monopod` | `monopod` | `pose` folded/deployed | Mounts under the butt |
| `heavy-receiver` | `receiver` | `action` auto, `feed` box, `bore` L/M | The shared receiver's box shell, ports and keep-outs, 23.5u long instead of 16u, sized for the .50 round (see "Magazine and action") |
| `heavy-lower` | `lower` | none | The shared conventional lower with a 13.5u x 4.5u magazine well; trigger guard and grip keep their distances from the well |
| `heavy-magazine` | `magazine` | none | 10-round .50 BMG box magazine, 13 x 4 x 10.75u |

Reused as they are: `bolt-carrier` (barrett), `barrel` (standard profile, length L), `grip`, `sight` and the shroud rail.
No param value of an existing family was added or changed.

`heavy-receiver`, `heavy-lower` and `heavy-magazine` are their own families because the shared
ones are sized for 5.56 and 7.62 rounds: the `magazine` family's section is 5.5u x 2.5u, the
`lower`'s well is built around it, and the `receiver` is 16u long. Each plays its shared role
(`PartDef.family`), so `feed-match`, `magazine-well-axis`, `trigger-guard`, the keep-outs and the
palette treat them as a receiver, a lower and a magazine. Their registry keys (`heavy-*`) are what the
design files name. `bolt-carrier` and `barrel` read `action` and `bore` from the heavy receiver as
they do from the shared one.

`recoil-stock` is its own family because the monopod needs a mount on the stock
and the shared `stock` has no such port. It plays the `stock` role so palette and
rules treat it as a stock; it is not tagged as a firing grip (the pistol grip is).

Param value lists are kept short on purpose: `test/parts.test.ts` builds every
combination of every family's params. The new families add 30 cases there (brake
3 bores x 2 profiles x 2 lengths = 12, shroud 3, bipod 3 x 2 = 6, handle 1,
recoil stock 2, monopod 2, heavy receiver 2 bores, heavy lower 1, heavy magazine 1).
The brake's `bore` and `profile` are inherited from the barrel, so their lists must
cover the values the barrel can hand over.

## Rules

| Rule | Checks | Broken fixture |
| --- | --- | --- |
| `shroud-fit` | at least 0.25u of clearance between barrel and shroud (the barrel recoils), and at least 4u of barrel ahead of the shroud for the muzzle device | `broken-shroud-fit` (heavy barrel in an M-bore rifle fills the cavity) |
| `bipod-ground-clearance` | the legs' reach, from the mount, ends at least 1u below the lowest solid of every other part (magazine floorplate, grip, ...), so the rifle can rest on the bipod. Judged by reach, whichever pose is shown | `broken-bipod-ground-clearance` (S legs, deployed: 12u reach, so the feet end 0.5u below the magazine floor, not the 1u needed) |

The core `keep-out` rule does the rest, with no new code:

- **Bipod clears the magazine.** The legs fold back under the shroud. A short
  shroud with long legs puts the `leg-sweep` volume (and the folded legs) into
  the lower's `magazine-path`. Tested in `test/antiMaterielRules.test.ts`.
- **Optic sees past the handle.** The handle's posts stand outside the `sightline`
  tube and its bar is above it. An optic placed inside the handle's `hand-room`
  fails.
- **Brake sits on the muzzle port.** `port-compat` (`muzzle` mount) and the
  barrel's `muzzle` keep-out, which only the part on that port may enter.

## Decisions

**Perforations are display-only.** gungen solids are convex, so a wall with N
holes is N+ convex pieces, which costs triangles and collision work and gives the
rules nothing to check. The shroud's walls are plain boxes (`solids`). The holes
are thin dark panels (48 on the L shroud: two rows on each side) laid on the outer
faces in `displaySolids` (rubber-black, no bevel, no outline). The viewer and the glTF
export draw them; the validator ignores them. If a hole ever matters to a rule
(for example, a hand reaching through), it would need real geometry.

**The bipod has a folded and a deployed pose, as a param.** `pose` redraws the
legs; the mounting, `leg-sweep` keep-out and ground-clearance rule are the same in
both. The published design is folded (carried). deadvox can show it deployed by
changing one param (`bipod.pose=deployed`), for example when prone. This does not
animate; the swing is the keep-out volume. The monopod works the same way.

**Folding direction.** The legs fold back toward the receiver. That is a choice
that makes the magazine clearance a real constraint; the references do not say
which way the legs fold.

**Anchors.** No anchors were added. `hold` comes from the grip, `support` from
nothing (the shroud and bipod are not hand-held), and `muzzle` stays on the
barrel's muzzle port, which is the rear of the brake. A brake `muzzle` anchor at
the nose would lose to the barrel's under the lowest-part-id rule in
`src/gun/anchors.ts`. A bipod `support` anchor for deadvox's prone handling is a
separate issue.

## Proportions

Size classes, not measurements (`1u` = 11.5 mm, `PROJECT.md`). Reference figures
come from the English Wikipedia article "Barrett M82" (text and infobox read
through the MediaWiki API on 2026-10-01). This is a secondary source, not a
manufacturer specification.

| | Reference | In gungen |
| --- | --- | --- |
| Overall length | 48 to 57 in (1219 to 1448 mm; 106 to 126u) | 104u, about 1196 mm: stock L 22 + pad 1.5, receiver 23.5, barrel L 46, brake L 11 |
| Barrel length | 20 to 29 in (508 to 737 mm; 44 to 64u) | 46u, about 529 mm: the largest existing barrel class, at the short end of the range |
| Magazine | detachable box, 5 or 10 rounds | `heavy-magazine`, 10 rounds, 13 x 4 x 10.75u (about 150 x 46 x 124 mm); derived below |
| Features | folding carrying handle and bipod; detachable rear monopod under the butt; recoil pad; two-chamber muzzle brake; stamped upper and lower receiver; barrel recoils about 1 in | handle, bipod, monopod, pad, two-chamber brake, stamped-box shroud; recoil travel itself is not modelled |

The rifle is about 2% shorter than the shortest published overall length (it was
9% shorter before the receiver was lengthened for the .50 round). Closing the rest
would need a barrel class longer than `L`, which every family that reads
`barrel.length` (handguard, tube, gas block) would have to learn. It was left out
to keep existing families untouched.

## Magazine and action

The shared `magazine` (5.5u x 2.5u section, up to 16u tall) and `receiver` (16u) are sized for
5.56 and 7.62 rounds. A .50 BMG round is longer than the whole shared magazine is deep, so the
magazine, the well it sits in and the action around it are derived from the cartridge in
`src/gun/antiMateriel/cartridge.ts`.

**Cartridge.** Dimensions of the .50 BMG (12.7x99mm NATO) come from the infobox of the English
Wikipedia article ".50 BMG" (wikitext read through the MediaWiki API on 2026-10-01), fields
`length` (overall length), `case_length` and `base` (case base diameter):

| | inches | mm | u |
| --- | ---: | ---: | ---: |
| Overall length | 5.450 | 138.43 | 12.04 |
| Case length | 3.910 | 99.31 | 8.64 |
| Case base diameter | 0.804 | 20.42 | 1.78 |

The 10-round capacity is on Barrett's own page for the Model 82A1 (barrett.net/firearms/model-82a1,
"Mag. Capacity 10 Rounds", read 2026-10-01).

**Magazine (X depth, Z width, Y height).** The rounds lie along the bore, so the magazine is as deep
as the round is long, and a 10-round magazine has to be a double column to be short:

| | Derivation | u | mm |
| --- | --- | ---: | ---: |
| Depth (X) | round length 12.04 + 0.25u wall at each end = 12.54, up to the 0.5u a box symmetric about its port needs on the 0.25u grid | 13.0 | 149.5 |
| Width (Z) | two columns whose neighbours touch: centres offset by sqrt(3)/2 of the base diameter, so 1.866 x 1.78 = 3.31, plus 0.25u walls = 3.81, up to the next 0.5u | 4.0 | 46 |
| Height (Y) | ten rounds in that zig-zag stand (10 - 1) x d/2 + d = 5.5 x 1.78 = 9.77, plus 0.75u for follower, spring and floorplate = 10.52, up to the next 0.25u | 10.75 | 123.6 |

A single column of ten cases would stand 10 x 1.78 = 17.8u (204 mm), taller than the shared L
magazine (16u, 184 mm) that was judged too long, so a double column is the only way a 10-round .50
magazine comes out shorter than that. The zig-zag is the close-packed limit (neighbouring rounds touch
and each column's rounds touch), so 10.75u is the least height that holds ten cases. The 0.75u base
allowance is a modelling allowance, not a measured figure. The magazine stands 0.75u up into the well,
as the shared magazine does.

**Well and lower.** The well is the magazine plus 0.25u on every side (13.5u x 4.5u), with a 0.25u
wall outside that, so the lower is 5u wide where the receiver is 4u. Its front face stays 1.25u behind the
receiver's front face, where the shared lower has it, so the bipod's swing clears the magazine exactly as
before; the well grows rearward, and the trigger finger (3.5u behind the well), trigger guard and grip
(2.25u behind the trigger) keep the distances they have in the shared conventional lower. The guard and
grip fit repeats that lower's numbers, which cannot be imported (it would be an import cycle); a test pins
the copies.

**Receiver.** The shared receiver's shell (5u tall, 4u wide, 0.5u walls), ports, rail and keep-outs, made
long enough for the cartridge:

| | Derivation | u | mm |
| --- | --- | ---: | ---: |
| Length | 1.25u behind the lower's rearmost frame (-22.25u), the margin the shared receiver leaves behind its lower | 23.5 | 270 |
| Bolt face at rest | behind the barrel port by one case length plus 0.25u, up to the grid: 8.64 + 0.25, so a chambered case fits in front of it | -9.0 | -103.5 |
| Carrier at rest | face at -9.0, the `barrett` carrier is 6u long, so its centre is 3u behind the face | -12.0 | -138 |
| Carrier travel | parks the face 2.5u behind the magazine's rear wall (-14.5u) so the next round can rise | 8.0 | 92 |
| Ejection port | one case length plus 0.25u at each end, up to the grid: 8.64 + 0.5 | 9.25 | 106.4 |

The rail has 11 slots (the shared receiver's 7), starting 1.5u in from the rear face. The sight is on
slot 5 and the carry handle on slot 8, which puts both at the same stations (x = -12 and -6) as before.

**Not modelled.** The feed opening in the receiver floor (the shared `standard` section has none
either), feed lips, and the magazine's follower and rounds.

## Not verified

- The look has been checked in the viewer in headless Chromium only, with BR's
  judgement of proportions still to come.
- deadvox has not been given the model.
- **How the real magazine stacks its rounds.** No source for the M82's stacking was found in what
  could be read (Wikipedia's M82 and .50 BMG articles, Barrett's model page; Wikipedia says the
  5-round Accuracy International AS50 magazine is single-stack). The double column is a deduction from
  the height argument above; Barrett's product photograph of the M82A1 (barrett.net, "model-82a1-product-img.jpg")
  shows a magazine visibly deeper than it hangs below the receiver, read by eye and not measured. The
  stagger geometry is the close-packed limit, not a measured magazine.
- The receiver length (23.5u) and the bolt travel are derived from the cartridge and the shared
  lower's layout, not from a published dimension of the rifle.
