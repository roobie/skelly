# Hunting-cabin pump: action and export

`designs/archetype-pump-shotgun.json` is the curated, unbranded 12-gauge pump:
M barrel, 75% tube, walnut tapered sporting stock, wood forend, trigger plate,
no pistol grip or tactical rail. Chosen dimensions/presence are locked; inherited
neighbour params remain implicit. The matching fixture uses the same rail-free
shape. Guns remain discrete size classes, not manufacturer-dimensioned mechanisms.

## Source-driven fit and explicit estimates

The source is `cartridges/12-gauge-00-buck.json`, unchanged by this work. Its
62.23 mm conservative loaded envelope rounds **up** to the existing 5.5 u
(63.25 mm) coupled stroke. This is not a Federal crimp assertion. The ejection
aperture is 6.75 u (77.625 mm), admitting the 70.1 mm opened hull envelope.

A real underside loading opening replaces the formerly closed receiver floor.
Its 6 u × 2 u (69 × 23 mm) mouth rounds up from loaded length plus two 0.25 u
end clearances, and the 22.5 mm rim diameter. It retains 0.5 u side skins. The
loading anchor is the centre of its exterior mouth, not a point inside solid
metal. The L bore/tube/receiver frame is the existing large-shell size band;
barrel, tube diameter, stock shape and forend proportions are otherwise unchanged.

`gun/tubeCapacity.ts` counts **loaded** shells, not opened hulls. Usable axial
length is the tube body's start to the rear face of its fixed cap, less the
named `TUBE_FOLLOWER_SPRING_RESERVE_U = 1` visual allowance. On this design:

- 27 u tube reach minus 2.5 u cap and 1 u follower/spring reserve = 23.5 u;
- 23.5 × 11.5 = 270.25 mm; floor(270.25 / 62.23) = **4 shells**;
- this excludes a chambered shell; it is not “4+1” state or an ammo economy.

The external octagonal tube's 23 mm flat-to-flat envelope clears the rim with
`TUBE_RIM_ALLOWANCE_MM = 0.25` aggregate visual fit budget. These allowances
are **game/model estimates**, not sourced internal bore, wall, follower or spring
measurements. No rounds are drawn inside the tube and no shell transfer, lifter,
latch or manufacturing tolerance is simulated. A larger rim or insufficient
axial space is refused instead of silently declaring capacity.

Hand timing and ejection are also labelled visual estimates: 0.5 s pull,
0.15 s rear dwell, **0.5 s hand-driven push**, 0.35 s rest (1.5 s loop).
Both legs use minimum-jerk hand motion, not the automatic actions' spring return.
Ejection is at 76% of rearward travel, towards normalized [0.12, 0.24, 0.96].
The viewer's arrow indicates this data; it does not simulate a flying hull.

## Optional Deadvox contract additions

- `action.fire` and `action.rpm` are optional and **absent on the pump**.
  Automatic actions retain both. Part `modes` must reference a declared timeline.
- Carrier and forend are separate GLB nodes, each with `modes: ["hand"]`,
  equal `strokeMetres: 0.06325`, and rearward unit axes in model coordinates.
- `action.hand` uses seconds; `ejectAt` is a stroke fraction and
  `ejectDirection` a unit vector. `holdOpen: false` invents no automatic catch.
- `anchors.loading_port`, like `ejection`/`muzzle`/`support`, is a point in metres
  in model coordinates (+x forward, +y up, +z right).
- Optional `tube: { capacity: 4 }` belongs to the **gun**, not a detached item.
  It requires calibre/loading_port and forbids a box-magazine `capacity`/`rounds`
  column on the same entry. Shells enter singly through that port.
- Existing cartridge identity remains exactly `12-gauge-00-buck`.
  There are no new angle fields; any angles remain degrees, never radians.

Three.js strips colons from names. Resolve each exact `action.parts.*.node` in
`parser.json.nodes`, then use `parser.associations`' node index to find the object.
Do not call `getObjectByName` with the original glTF name. Maintained Deadvox tests
exercise that lookup and real `GLTFLoader -> prepareModel` ground/held forms.
This export supplies the data; playable racking, loading, ammunition and firing
come from Deadvox's d36 feature. Deadvox mechanics require real export data:
automatic cycles need `action.fire` and `rpm`, while hand cycles need the hand
action. This hand-only pump samples hand motion only; no automatic pose, cadence,
calibre or case metadata is synthesized. An unannotated model still validates,
loads and can be held and inspected, but unsupported mechanics refuse with a
clear reason. The former debug stand-in and its 5.56/600-rpm fallback are retired;
exporting a calibre/hull is not itself playable ammunition handling.

## Reproduce and inspect

From `gungen/`:

```sh
npm run export:glb -- designs/archetype-pump-shotgun.json --calibre 12-gauge-00-buck --out ../deadvox/src/content/base/assets/models --entry-out "$XDG_RUNTIME_DIR/gungen-pump-entry" --id shotgun_pump
```

The generated entry is recorded in `deadvox/src/content/base/models-firearms.json`;
the new GLB replaces the CC0 stand-in at its existing asset path/id. Asset credits
now point to the curated project design. `debug_shotgun_pump` remains debug-only,
available with G under `?debug=1`, not a firing gameplay weapon or loot drop.

Viewer: `?design=archetype-pump-shotgun&cycle=hand&cycleSpeed=0.1`.
Click **Play** or Space; scrub/step to inspect both hand-driven legs. Fire mode
and AR empty-magazine controls are unavailable on this manual action. Add
`&ammo=12-gauge-00-buck` for loaded/open hulls, or fade the receiver to see the
carrier. `&pose=action-open` remains a static view-only inspection pose; cycle
controls are hidden there to avoid treating an already-open pose as home.
Validation/export always stay at rest. Exact convex axial sweeps of **both** movers
against every fixed solid guard the whole stroke, not just sampled frames or
keep-out allowances. Existing pump sweep coverage retains its size/length cases.
