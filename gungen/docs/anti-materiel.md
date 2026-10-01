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
| `bipod` | `bipod` | `legs` S/M/L (14/18/20u reach), `pose` folded/deployed | Mounts under the shroud; carries a `leg-sweep` keep-out |
| `carry-handle` | `carry-handle` | none | Four posts and a grip bar on the receiver rail; carries a `hand-room` keep-out |
| `recoil-stock` | `stock` | `length` M/L (16/22u) | Tall body, cheek rest, wide flat rubber pad; has a `monopod` port |
| `monopod` | `monopod` | `pose` folded/deployed | Mounts under the butt |

Reused as they are: `receiver` (auto, box, bore L), `bolt-carrier` (barrett),
`lower` (conventional), `barrel` (standard profile, length L), `grip`,
`magazine` (standard profile, length L), `sight` and the receiver and shroud rails.
No param value of an existing family was added or changed.

`recoil-stock` is its own family because the monopod needs a mount on the stock
and the shared `stock` has no such port. It plays the `stock` role so palette and
rules treat it as a stock; it is not tagged as a firing grip (the pistol grip is).

Param value lists are kept short on purpose: `test/parts.test.ts` builds every
combination of every family's params. The new families add 26 cases there (brake
3 bores x 2 profiles x 2 lengths = 12, shroud 3, bipod 3 x 2 = 6, handle 1,
recoil stock 2, monopod 2). The brake's `bore` and `profile` are inherited from
the barrel, so their lists must cover the values the barrel can hand over.

## Rules

| Rule | Checks | Broken fixture |
| --- | --- | --- |
| `shroud-fit` | at least 0.25u of clearance between barrel and shroud (the barrel recoils), and at least 4u of barrel ahead of the shroud for the muzzle device | `broken-shroud-fit` (heavy barrel in an M-bore rifle fills the cavity) |
| `bipod-ground-clearance` | the legs' reach, from the mount, ends at least 1u below the lowest solid of every other part (magazine floorplate, grip, ...), so the rifle can rest on the bipod. Judged by reach, whichever pose is shown | `broken-bipod-ground-clearance` (S legs, deployed) |

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
| Overall length | 48 to 57 in (1219 to 1448 mm; 106 to 126u) | 96.5u, about 1110 mm: stock L 22 + pad 1.5, receiver 16, barrel L 46, brake L 11 |
| Barrel length | 20 to 29 in (508 to 737 mm; 44 to 64u) | 46u, about 529 mm: the largest existing barrel class, at the short end of the range |
| Magazine | detachable box, 5 or 10 rounds | `standard` magazine, length L (16u) |
| Features | folding carrying handle and bipod; detachable rear monopod under the butt; recoil pad; two-chamber muzzle brake; stamped upper and lower receiver; barrel recoils about 1 in | handle, bipod, monopod, pad, two-chamber brake, stamped-box shroud; recoil travel itself is not modelled |

The rifle is about 9% shorter than the shortest published overall length. Closing
that would need a barrel class longer than `L`, which every family that reads
`barrel.length` (handguard, tube, gas block) would have to learn. It was left out
to keep existing families untouched.

## Not verified

- The look has been checked in the viewer in headless Chromium only, with BR's
  judgement of proportions still to come.
- deadvox has not been given the model.
