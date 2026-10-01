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
| `barrel-shroud` | `barrel-shroud` | `length` S/M/L (16/22/28u) | A stamped-box upper the barrel recoils inside: receiver front-face height and width, 0.5u walls, a front bulkhead that guides the barrel. Extends the top rail and carries the bipod port and the handle's `trunnion` port (left wall, 2u from the rear) |
| `bipod` | `bipod` | `legs` S/M/L (12/18/20u reach), `pose` folded/deployed | Mounts under the shroud; carries a `leg-sweep` keep-out |
| `handle-trunnion` | `carry-handle` | `pose` carry/stowed | A 4u long, 2u deep block, symmetric about the horizontal plane with both faces sloped, bolted to the shroud's left wall (its `trunnion` port). Its one other port points the strut diagonally up and left (`carry`) or down and left (`stowed`); the block itself does not change with the pose |
| `handle-strut` | `carry-handle` | `pose`, inherited from the trunnion | One octagonal prism, 7.5u long, mounted on that port so it runs diagonally in world space; its top port is tilted back so the bar mounted there is level |
| `handle-bar` | `carry-handle` | `pose`, inherited from the strut | The grip bar, an octagonal prism along the bore reaching back from the strut, overhanging the left; carries the `hand-room` keep-out. Left (-Z) is fixed, not a param |
| `recoil-stock` | `stock` | `length` M/L (16/22u) | Tall body, cheek rest, wide flat rubber pad; has a `monopod` port |
| `monopod` | `monopod` | `pose` folded/deployed | Mounts under the butt |
| `heavy-receiver` | `receiver` | `action` auto, `feed` box, `bore` L/M | The shared receiver's box shell, ports and keep-outs, 30u long instead of 16u, sized for the .50 round and its carrier (see "Magazine and action") |
| `heavy-bolt-carrier` | `bolt-carrier` | none | A plain 12.5u block, as long as the ejection port less its margins; moves along the receiver's `bolt-travel` keep-out |
| `heavy-lower` | `lower` | none | The shared conventional lower with a 13.5u x 4.5u magazine well; trigger guard and grip keep their distances from the well |
| `heavy-magazine` | `magazine` | none | 10-round .50 BMG box magazine, 13 x 4 x 10.75u |

Reused as they are: `barrel` (standard profile, length L), `grip`, `sight` and the shroud rail.
No param value of an existing family was added or changed.

`heavy-receiver`, `heavy-lower` and `heavy-magazine` are their own families because the shared
ones are sized for 5.56 and 7.62 rounds: the `magazine` family's section is 5.5u x 2.5u, the
`lower`'s well is built around it, and the `receiver` is 16u long. Each plays its shared role
(`PartDef.family`), so `feed-match`, `magazine-well-axis`, `trigger-guard`, the keep-outs and the
palette treat them as a receiver, a lower and a magazine. Their registry keys (`heavy-*`) are what the
design files name. `barrel` reads `bore` from the heavy receiver as
they do from the shared one.

`recoil-stock` is its own family because the monopod needs a mount on the stock
and the shared `stock` has no such port. It plays the `stock` role so palette and
rules treat it as a stock; it is not tagged as a firing grip (the pistol grip is).

Param value lists are kept short on purpose: `test/parts.test.ts` builds every
combination of every family's params. The new families add 36 cases there (brake
3 bores x 2 profiles x 2 lengths = 12, shroud 3, bipod 3 x 2 = 6, handle trunnion, strut and bar 2 poses each = 6 (the
strut's and bar's `pose` is inherited but is still a param, so it still counts),
recoil stock 2, monopod 2, heavy receiver 2 bores, heavy lower 1, heavy magazine 1, heavy bolt carrier 1).
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
- **Optic sees past the handle.** The handle stands to the left of the rail, wholly outside the `sightline`
  tube and clear of a full-size scope's envelope (see "Carry handle and scope envelope"). Nothing on the
  rail or the receiver can reach the handle's `hand-room`, which only the keep-out rule would guard.
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
| Overall length | 48 to 57 in (1219 to 1448 mm; 106 to 126u) | 109u, about 1254 mm: stock L 22 + pad 1.5, receiver 30, barrel L 46 starting 1.5u inside the receiver, brake L 11 |
| Barrel length | 20 to 29 in (508 to 737 mm; 44 to 64u) | 46u, about 529 mm: the largest existing barrel class, at the short end of the range |
| Magazine | detachable box, 5 or 10 rounds | `heavy-magazine`, 10 rounds, 13 x 4 x 10.75u (about 150 x 46 x 124 mm); derived below |
| Features | folding carrying handle and bipod; detachable rear monopod under the butt; recoil pad; two-chamber muzzle brake; stamped upper and lower receiver; barrel recoils about 1 in | handle, bipod, monopod, pad, two-chamber brake, stamped-box shroud; recoil travel itself is not modelled |

The rifle is now inside the published range, about 3% above its shortest end (it was
9% below it before the receiver was lengthened for the .50 round). The barrel is
still the largest existing class (`L`), at the short end of its own range; a longer
one would need every family that reads `barrel.length` (handguard, tube, gas block)
to learn it, so it was left out to keep existing families untouched.

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

**Slanted bottom.** The magazine's bottom rises toward the front: the back face keeps the full 10.75u,
the front face is 9.0u. The side profile is a convex extruded polygon along Z whose rise is the depth
times tan 8 degrees (13 x 0.1405 = 1.83u), snapped to the 0.25u grid as the shared slanted magazine
snaps its vertex (`snapAkGrid` in `parts.ts`), so the rise is 1.75u and the real angle 7.67 degrees. The
top, the well and the two faces' x are unchanged, and the lowest point is still the back-bottom edge
(y = -14.0), so `bipod-ground-clearance` and its fixture measure the same figures as before. The slant is a
styling choice on the archetype, not derived from the cartridge: at the front end of the lowest case the
floor has risen about 1.2u against the 0.75u base allowance, so it cuts about 0.45u into that case, which the
round's narrowing toward the nose (neck 0.560 in against base 0.804 in) only partly explains.

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
| Bolt face at rest | over the magazine's front face (-8.0 well centre + 6.5 half depth) | -1.5 | -17 |
| Barrel port (breech) | at the bolt face: the barrel reaches back 1.5u into the receiver through a ring at the front face, so the chamber starts at the bolt and the 8.64u case lies in the barrel | -1.5 | -17 |
| Carrier length | `heavy-bolt-carrier`: the magazine's depth (13u) less the 0.25u ejection margin at each end | 12.5 | 144 |
| Carrier at rest | face at -1.5, so its centre is half a carrier length (6.25u) behind the face | -7.75 | -89 |
| Ejection port | the carrier's face bounds at rest plus 0.25u on every side, the rule `ejectionPortWindow` in `parts.ts` applies to every receiver (the keep-out and the opening share the definition): x from -14.25 to -1.25 (front edge 0.25u ahead of the bolt face, over the well's front face), y from 0 to 2. 13u long, so the 8.64u case passes with room to spare | 13.0 | 149.5 |
| Carrier travel | back until the face is 2.5u behind the magazine's rear wall (-14.5u), at -17.0, so the next round can rise: 17.0 - 1.5 | 15.5 | 178 |
| Length | the longer of two needs: 1.25u behind the lower's rearmost frame (-22.25u, giving 23.5), and room for the carrier parked behind the magazine (its rear at -29.5u, plus the 0.5u end wall, giving 30.0) | 30.0 | 345 |

The carrier is its own family because the shared `barrett` envelope is 6u long and cannot change. Its
face bounds are what size the port; the margin `HEAVY_EJECTION_PORT_MARGIN_U` repeats
`EJECTION_PORT_MARGIN_U` (it cannot be imported without a cycle) and a test pins the copy.

The rail has 11 slots (the shared receiver's 7) at x = -22 ... -2, the front 22u of the receiver. The sight
is on slot 5 (x = -12) as before; the carry handle is bolted to the shroud's left wall (next section).

## Carry handle and scope envelope

The handle was centred over the rail, which a real scope (a long tube, a large objective bell, tall rings)
would run through; a second version put a table-like shelf, four posts and a bar to its left. It is now three
parts to the **left** (-Z; gungen's +Z is right) of the rifle: a trunnion block on the shroud's left wall, one
diagonal strut, and a level grip bar that reaches back from the strut's top end. The side is fixed, not a
param; the other side would be a mirror of its z values. The three parts always come together (a template slot
cannot depend on another slot's chance), so the template no longer gives the handle a 0.8 chance.

**Pose: `carry` and `stowed`.** Like the bipod and monopod, the handle has a `pose` param, set once, on the
trunnion; the strut and the bar read it through `from: [{ port: 'base', param: 'pose' }]`, chained, so a design
file names it on the trunnion only. `carry` is the raised handle described below. `stowed` is the same handle
mirrored about the horizontal plane through the trunnion's port: the strut runs down and to the left, the bar
hangs below the bore line, still level and parallel to the bore and reaching back. It exists because, in
deadvox's first-person view, the raised bar (about 100 mm above and 92 mm left of the bore, near the rear of the
shroud) would occlude the upper left of the view; the published design is `stowed`, and deadvox can switch to
`carry` when the gun is carried rather than aimed. In `stowed` the bar's axis is at y -8.75, z -8 and its hand
room spans y -12 to -5.5. The pose changes only port orientation and positions: the trunnion's `strut` port
normal is (0, 0.8, -0.6) in `carry` and (0, -0.8, -0.6) in `stowed`; the strut's `top` port normal is
(0.8, 0, -0.6) or (0.8, 0, 0.6); the bar's `base` port sits on its underside (`carry`) or its top (`stowed`).

**Frame and numbers.** In the shroud's own frame (x forward from its rear end, which is the receiver's front
face; y up from the bore axis; z right), 1u = 11.5 mm. Numbers are for `carry`; `stowed` flips the sign of y:

| Part | What | Numbers |
| --- | --- | --- |
| Trunnion (`handle-trunnion`) | block bolted to the shroud's left wall | port `trunnion` on the wall at (2.5, 0, -2); 4u long (x 0.5 to 4.5), 2u out (z -4 to -2), y -2.25 to 2.25 at the wall, -0.75 to 0.75 at the outer face: a symmetric trapezoid in section, convex, the same in both poses. Its upper face is square to the strut in `carry`, its lower face in `stowed` |
| Strut (`handle-strut`) | octagonal prism, 1.5u (17 mm) across flats | from (2.5, 1.5, -3) to (2.5, 7.5, -7.5): 7.5u long, 6u up and 4.5u to the left, a 3-4-5 triangle: 36.87 degrees from vertical (53.13 above horizontal), so its end is on the 0.25u grid |
| Grip bar (`handle-bar`) | octagonal prism along the bore, 2.5u (28.75 mm) across flats | 12u (138 mm) long, x -7.5 to 4.5, axis at y 8.75, z -8: 6u (69 mm) to the left of the shroud wall, its outer surface 7.25u (83 mm) out. The strut meets it 4u ahead of its middle, so it reaches back from there |
| Hand room | keep-out box | 9 x 6.5 x 6.5u (x -7.5 to 1.5, y 5.5 to 12, z -11.25 to -4.75): the bar plus 2u clear on every side, from the bar's rear end to 0.25u behind the strut |

**Why those sizes (assumptions, not measurements).** The bar is 28.75 mm across flats, inside the 25 to 35 mm a
hand closes around comfortably; it was 3u (34.5 mm) and the strut 2u (23 mm) in the version before this, and was
thinned at BR's request. Its free stretch behind the strut is 9u (103.5 mm), for a gloved palm breadth taken as
about 100 mm; 2u (23 mm) around the bar is a gloved finger's thickness. For the load, a rough estimate rather
than an engineering check: a 13 kg rifle at 3 g is about 380 N; the bar sits 4.5u (52 mm) sideways of the
strut's foot, so about 20 N m at the foot; a 17 mm octagon (I about 0.0547 d^4, 4.8e-9 m^4) takes that at about
35 MPa, far under the yield of steel or aluminium (hundreds of MPa). No source was consulted for any of these.

**How the diagonal and the level bar come out of port orientation.** No solid is skewed, as the pistol grip is
not either (its port's normal and up are tilted, `parts.ts` near the grip port). The trunnion's `strut` port has
the normal (0, 0.8, -0.6): up and to the left. A part's frame comes from its mating port's normal and up
(`portFrame`, `core/resolve.ts`), so the strut, an octagonal prism along its own X, lies along that normal. The
strut's `top` port is tilted back by the same angle: normal (0.8, 0, -0.6) in the strut's frame is world up, so
the bar's `base` port (normal down, up = bore direction) puts the bar axis-aligned: level and parallel to the
bore. `test/antiMateriel.test.ts` checks the angle and the bar's attitude in world space.

**Sunk ends, one solid to the eye.** The strut's solid reaches 0.5u past its foot port into the trunnion and
0.625u past its top port into the bar. The mechanism is the nesting allowance every directly connected pair of
parts already has: `solid-overlap` lets connected parts interpenetrate up to `TOLERANCE.interface` (0.75u),
unless the mount has its own entry in `INTERFACE_TOLERANCE_BY_MOUNT` (`grip` and `clamp` do; these three mounts
do not), and `connection-contact` only asks for solids within one grid step. No `allowPort`, keep-out exemption
or `seat` is used: `seat` and `allowPort` serve the magazine well and the barrel's muzzle volume, and the barrel
breech reaches into the receiver through a hollow ring, which a tilted round strut cannot copy. Measured depths
are 0.5u at the trunnion and about 0.64u at the bar, both under 0.75u, and a test pins them. The same depths hold in
both poses (`stowed` is an exact mirror). The trunnion's sloped face is square to the strut, so the strut leaves
it in a clean ring with no wedge gap; the bar end is placed 0.5u
inboard of the bar's centre line so the sunk end lies inside the bar's section instead of poking out of its
outer face. `SolidDisplayHints.mergeGroup` does not weld them: `displayItems` is called on one part's solids
at a time (`viewer/scene.ts`, `glb.ts`), so a group cannot span parts. The parts still draw as three meshes
that meet in a ring; nothing here fakes a single mesh.

**Why a trunnion on the shroud.** The barrel runs inside the shroud, 0.25u clear of it, and recoils, so a collar
on the barrel at the receiver's front face would be hidden by the shroud and could not carry a handle outside it.
The honest attachment point is the shroud's left wall just ahead of where the barrel leaves the receiver: the
shroud is bolted to the receiver the barrel enters. This is a modelling choice (where the real rifle's handle
mounts was not researched), and it needed a `trunnion` port on `barrel-shroud` (in this folder, so no shared
family changes).

**Stowed clearances.** The stowed handle lies to the left of the rifle's body, not under it. The keep-out and
overlap rules pass on the fixture in both poses and both bipod poses (folded and deployed), and
`test/antiMateriel.test.ts` requires at least 0.25u between the bar, strut, block and hand room and the
magazine, lower, grip (trigger guard is part of the lower), bolt carrier and bipod. Nearest approaches measured in `stowed`: the bar
4.75u from the magazine body, the hand room 2.5u from the magazine's floorplate; the sunk strut end 0.1u from
the shroud wall as in `carry`. The ejection port is on the receiver at y 0 to 2, far from the hand room.
The scope envelope is above the bore, so `stowed` clears it by far more (strut 4.2u, hand room 9.2u).

**Clearances in `carry`** (measured by `test/antiMateriel.test.ts` and a scratch script; the keep-out rule passes on the fixture):
strut to the scope envelope's objective box 0.65u, trunnion 1.25u, hand room 2u, bar 4u (all at least 0.25u).
The sunk strut end is 0.1u from the shroud's left wall inside the block, with no overlap, and the trunnion
touches the shroud wall only, 0.5u ahead of the receiver. The nearest other part to the hand room is the receiver's top
shell, 4.07u away. The bar's rear end lies over the front of the receiver's rail zone, its underside 5u above the
rail face and its axis 6u to the left of the shroud wall; it is nowhere near the sightline tube, the sight, the
bipod or the ejection port (y 0 to 2, x up to -1.25). The resolved assembly closes exactly: the three new
connections show 0 u and 0 degrees of mismatch (largest 1e-15 u), against the 0.01u and 0.5 degrees allowed.

**Scope envelope: a stand-in until the attachments work lands.** The scope vocabulary (optics, mounts) is the
next gungen iteration and is not built here; `src/gun/antiMateriel/scopeEnvelope.ts` holds the space of a
full-size, high-magnification scope as three boxes, only so the handle can be sized against it. The design
keeps the small `sight` as a placeholder. Dimensions come from Leupold's product page for the Mark 4HD 6-24x52
(leupold.com/mark-4hd-6-24x52-m5c3-side-focus-ffp-illum-pr2-mil, "Dimensions", read 2026-10-01) and its Mark 4
34mm High ring (leupold.com/mark-4-34mm-aluminum-high-matte, read 2026-10-01):

| | Source | in | mm | u |
| --- | --- | ---: | ---: | ---: |
| Total length | A | 14.6 | 371 | 32.2 |
| Total mounting space | B | 6.3 | 160 | 13.9 |
| Eyepiece length | E | 3.3 | 84 | 7.3 |
| Objective length | F | 5.1 | 130 | 11.3 |
| Objective diameter | G | 2.4 | 61 | 5.3 (radius 2.65, boxed at 2.75) |
| Eyepiece diameter | H | 1.8 | 46 | 4.0 (radius 2.0) |
| Main tube | K | 1.34 | 34 | 3.0 (radius 1.5) |
| Ring height | High ring, "Ring Height (in)" | 1.06 | 27 | 2.3 |

The ring height is read as the distance from the rail to the bottom of the tube, which puts the tube axis
3.75u above the rail face (2.34 + 1.48, rounded to the grid) and the objective bell's underside 1.0u above it;
the other reading (axis at the ring height) would put the 2.4 in bell below the rail, so it cannot be right
for a 52 mm scope. That reading is an assumption about Leupold's figure. The envelope is placed with the
middle of its mounting space on the sight's slot (x = -12): eyepiece to the rear, objective ahead to x = 6.2.
Rings and the scope's own turrets are not boxed. `test/antiMateriel.test.ts` asserts the handle's solids and
its hand room stay at least 0.25u from every box.

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
- The receiver length (30u), the carrier length and the bolt travel are derived from the cartridge and the shared
  lower's layout, not from a published dimension of the rifle.
