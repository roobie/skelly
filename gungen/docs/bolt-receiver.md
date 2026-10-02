---
id: gungen::bolt-receiver
description: Tubular bolt-rifle frame, its sourced reference cartridge and continuous clearance contracts
tags: [gungen, receiver, bolt-action, geometry, clearance]
created: 2026-10-02
---

# Tubular bolt-rifle receiver (g33)

Only `archetype-bolt-rifle`, its fixture and the `bolt-rifle` template (including
its thumbhole option) use `bolt-receiver`. The boxed bolt rifle and AWM keep the
ordinary receiver and their existing geometry. This is a **Remington-700-style
art envelope**, not a reproduction or a manufacturing drawing.

## Dimensions and sources

At **1u = 11.5 mm**:

| Measure | Model | Basis |
| --- | --- | --- |
| Tube outside diameter | 3u = 34.5 mm | g33 dispatch's approximate 1.36in target; Borden's Rimrock actions publish 1.350in = 34.29 mm |
| Tube length | 18.75u = 215.625 mm, X=-16.75…2 | g33 dispatch's approximate 8.5in target (215.9 mm), rounded to the grid |
| Loading port | 6.5u = 74.75 mm, X=-9.75…-3.25 | Fits the reference round's 71.374 mm maximum overall length plus one 2.875 mm grid allowance |
| Reference case head | 0.473in = 12.0142 mm maximum | SAAMI .308 Winchester drawing |
| Swept round diameter | 1.5u = 17.25 mm | Head diameter plus 0.25u allowance, then rounded upward to the 0.25u grid |
| Bolt pull / unlock | 7u = 80.5 mm / 90° | Existing bolt travel, and an explicitly checked quarter-turn unlock |

Sources (accessed 2026-10-02):

- [Borden Rimrock actions](https://bordenrifles.com/rimrock-actions/) publishes
  the 1.350in diameter and several different lengths. Its short-throw BRM table
  gives 8⅛in; its long-throw BRL gives 8⅞in. **The dispatch's 8.5in length is a
  requested estimate, not a verified Remington short-action measurement.** It
  must not be cited as an exact short-action specification.
- [SAAMI ANSI Z299.4, centerfire rifle, 2025 revision](https://saami.org/wp-content/uploads/2026/04/SAAMI-Z299.4-CFR-2025-Centerfire-Rifle-Approved-2-10-2025-2026-04-27.pdf),
  printed page 117, “308 Winchester”, drawing revised 2022-06-03: rim/head
  maximum .473in; overall length maximum 2.810in. The reference is for frame
  clearance only: it does **not** select a cartridge identity, replace cartridge
  data, or claim the coarse M/L bore classes are .308 ammunition.

## Tube, interfaces and mounting

The visible round rear bridge and front ring/thread socket use hollow revolved
profiles. Cut wall portions use contiguous 16-sided annular wall cells. Collision
uses those convex cells throughout: a single revolved convex hull would fill the
bore and certify the wrong loading geometry. At the viewer's default **16 facets**,
wall cells and round sleeves have matching sections. Display groups are checked
for watertightness. The CLI keeps the core's ordinary 6-facet revolved export
level of detail; the annular collision/cut-wall cells remain fixed at 16 facets.
This is a display tessellation choice, not a change to the required clearance.

The barrel/stock/lower/handguard interface definitions retain their ordinary-frame
datums. The barrel rear is inside the front socket; the socket radius comes from
the existing octagonal barrel's corner radius. A recoil lug and bottom bearing
retain the lower's Y=-2.5 contact plane. The tube extends 0.75u behind the stock
interface into its existing nesting allowance. All receiver solids use the metal
slot. The recoil lug accommodates each bore class's existing handguard width.

Two decks sit outside the opening on connected tube saddles. Their right underside
is chamfered for the lifted stem. The rail stays at **Y=2.5u**, so the merged g29
optic bodies and default world heights are unchanged. **No scope lift was added.**
The LPVO optical axis remains Y=4.5u = 51.75 mm above the bore (23 mm above rail).

The approved g26 arm and knob retain their local meshes and human-scale dimensions.
The tubular frame puts the carrier on the bore axis, shortens the wall-crossing
attachment to Z=1.75u, and rotates the arm's mounting frame 45° farther downward.
Its rear-view (Y/Z) projected closed angle is about 72° below horizontal; after the 90° lift it
is about 18° above. This is a constructed frame attachment for clearance, not a
sourced claim about the exact Remington handle angle. Keeping the old mounting
orientation made the lifted arm intersect the rear deck and optic feet. The
boxed rifle and AWM do not take this attachment change.

## Mandatory physical contracts

`boltReceiverMotionClearance` checks the **complete** unlock arc, followed by the
complete 7u pull, against actual receiver, optic, furniture and other placed
solids. Generic `motionSweep.ts` certifies angular intervals with exact sine/cosine
projection extrema and separating planes, subdividing unproved intervals; it
never accepts based only on pose samples. Translation uses the convex sweep's
additional side planes/edges. An unproved interval refuses conservatively.

The ordinary closed-pose linear handle sweep is not appropriate to this frame:
the handle must lift before it pulls. The tube uses the full-cycle rule instead;
its linear motion/export datums retain their existing meaning.

`boltReceiverLoadingClearance` checks a conservative cartridge-sized volume
through the **right-side** port at bore height (0° elevation). Unlike g29's former
45° path above a box receiver's top lip, the new port opens directly to the side.
The volume spans the round-length opening and reaches Z=6u outside the action.
It checks every actual static solid, including receiver walls, feet, optic bodies,
turrets and controls. It also checks the actual bolt/handle solids at the fully
unlocked and retracted pose. The required path does not depend on a producer
remembering its optional keep-out annotation. Thus it is neither a nominal-optic
check nor a promise of loading a closed bolt.

## Diagnostics and QA

- `broken-bolt-receiver-closed-port`: the blanked aperture obstructs loading and
  unlock. `loadingPort: closed` is a fault value, excluded from generation.
- `broken-bolt-receiver-wrong-handle-frame`: an explicit ordinary-frame carrier
  attachment overrides inheritance and strikes the deck/scope during unlock.
- Eight pair-covering rows exercise M/L × standard/AWM human lever ×
  sporting/thumbhole stock × LPVO/high-mag/prism/thermal. Separate canaries protect
  actual receiver plugs, missing keep-out annotations, unretracted overlong tips,
  and a blocked lifted-stem raceway.
- The ordinary boxed/AWM straight-pull tests remain. The tubular rifle's former
  ordinary-shell/closed-pull assertions move to its new local-mesh/full-cycle
  contracts; no old box-shell assertion is retained as a compatibility requirement.
- Export diffs are review evidence, not a byte-identity gate. The shared corpus
  changes only the bolt-rifle design/fixture; two new broken examples are added.
