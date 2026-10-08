---
read_if:
  - you change the pump shotgun design, its tube capacity or its loading port
  - you change the hand-driven action data a pump exports to Deadvox
  - you re-export or inspect the pump shotgun model
---

# Hunting-cabin pump: action and export

`designs/archetype-pump-shotgun.json` is the curated, unbranded 12-gauge pump:
M barrel, 75% tube, walnut tapered sporting stock, wood forend, trigger plate,
no pistol grip or tactical rail. Chosen dimensions/presence are locked; inherited
neighbour params remain implicit. The matching fixture uses the same rail-free
shape. Guns remain discrete size classes, not manufacturer-dimensioned mechanisms.

## Source-driven fit and explicit estimates

The source is `cartridges/12-gauge-00-buck.json`. Its conservative loaded
envelope rounds **up** to the grid for the coupled stroke, and the ejection
aperture admits the opened hull envelope; see `src/gun/pumpShell.ts`,
`PUMP_SHELL_LOADED_LENGTH_U` and `PUMP_ACTION_TRAVEL_U`. Rounding up the
standard's envelope is not a claim about Federal's crimp.

The receiver floor has a real underside loading opening. Its mouth rounds up
from the loaded length plus an end clearance at each end, and from the rim
diameter, and it keeps side skins; see `PUMP_LOADING_PORT_X` and
`PUMP_LOADING_PORT_HALF_WIDTH_U` in the same file. The loading anchor is the
centre of its exterior mouth, not a point inside solid metal. The bore, tube and
receiver use the large-shell size band.

`src/gun/tubeCapacity.ts` counts **loaded** shells, not opened hulls. Usable
axial length runs from the tube body's start to the rear face of its fixed cap,
less the `TUBE_FOLLOWER_SPRING_RESERVE_U` visual allowance, and the count is how
many loaded lengths fit in it. A chambered shell isn't counted; there is no
magazine-plus-one state or ammo economy.

The external octagonal tube's flat-to-flat envelope clears the rim within the
`TUBE_RIM_ALLOWANCE_MM` aggregate visual fit budget. These allowances are
**game/model estimates**, not sourced internal bore, wall, follower or spring
measurements. No rounds are drawn inside the tube and no shell transfer, lifter,
latch or manufacturing tolerance is simulated. A larger rim or insufficient
axial space is refused instead of silently declaring capacity.

Hand timing and ejection are also labelled visual estimates: a pull, a rear
dwell, a **hand-driven push** and a rest, with ejection partway through the
rearward travel; see `src/gun/cycle.ts`, `PUMP_HAND_TIMING` and
`pumpCycleMotion`. Both legs use minimum-jerk hand motion, not the automatic
actions' spring return. The viewer's arrow indicates the ejection data; it does
not simulate a flying hull.

## Optional Deadvox contract additions

- `action.fire` and `action.rpm` are optional and **absent on the pump**.
  Automatic actions retain both. Part `modes` must reference a declared timeline.
- Carrier and forend are separate GLB nodes, each with `modes: ["hand"]`,
  an equal `strokeMetres`, and rearward unit axes in model coordinates.
- `action.hand` uses seconds; `ejectAt` is a stroke fraction and
  `ejectDirection` a unit vector. `holdOpen: false` invents no automatic catch.
- `anchors.loading_port`, like `ejection`/`muzzle`/`support`, is a point in metres
  in model coordinates (+x forward, +y up, +z right).
- Optional `tube: { capacity }` belongs to the **gun**, not a detached item.
  It requires calibre/loading_port and forbids a box-magazine `capacity`/`rounds`
  column on the same entry. Shells enter singly through that port.
- Existing cartridge identity remains exactly `12-gauge-00-buck`.
  There are no new angle fields; any angles remain degrees, never radians.

Three.js strips colons from names. Resolve each exact `action.parts.*.node` in
`parser.json.nodes`, then use `parser.associations`' node index to find the object.
Do not call `getObjectByName` with the original glTF name. Maintained Deadvox tests
exercise that lookup and real `GLTFLoader -> prepareModel` ground/held forms.
This export supplies the data; playable racking, loading, ammunition and firing
come from Deadvox's firearm handling. Deadvox mechanics require real export data:
automatic cycles need `action.fire` and `rpm`, while hand cycles need the hand
action. This hand-only pump samples hand motion only; no automatic pose, cadence,
calibre or case metadata is synthesized. An unannotated model still validates,
loads and can be held and inspected, but unsupported mechanics refuse with a
clear reason. Exporting a calibre/hull is not itself playable ammunition
handling.

## Reproduce and inspect

From `gungen/`:

```sh
npm run export:glb -- designs/archetype-pump-shotgun.json --calibre 12-gauge-00-buck --out ../deadvox/src/content/base/assets/models --entry-out "$XDG_RUNTIME_DIR/gungen-pump-entry" --id shotgun_pump
```

The generated entry is recorded in `deadvox/src/content/base/models-firearms.json`,
and the asset credits point to the curated project design.

Viewer: `?design=archetype-pump-shotgun&cycle=hand&cycleSpeed=0.1`.
Click **Play** or Space; scrub/step to inspect both hand-driven legs. Fire mode
and AR empty-magazine controls are unavailable on this manual action. Add
`&ammo=12-gauge-00-buck` for loaded/open hulls, or fade the receiver to see the
carrier. `&pose=action-open` remains a static view-only inspection pose; cycle
controls are hidden there to avoid treating an already-open pose as home.
Validation/export always stay at rest. Exact convex axial sweeps of **both** movers
against every fixed solid guard the whole stroke, not just sampled frames or
keep-out allowances. Existing pump sweep coverage retains its size/length cases.
