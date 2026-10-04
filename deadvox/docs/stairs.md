# Explicit storeys, stairs and root cellars

ASCII `layers` remain the floor plans. Optional `access` describes named storeys and
constructs ordinary-block straight flights; it is not an AI route or a new stair block.
The helper is simpler to author than hand-maintaining every tread and overhead hole
across multiple ASCII layers.

```json
"access": {
  "ground": "ground",
  "entrance": [2, 9, 2],
  "storeys": [{"id": "cellar", "floor": 1}, {"id": "ground", "floor": 9}],
  "stairs": [{
    "from": "cellar", "to": "ground",
    "lower": [2, 1, 5], "upper": [11, 9, 5],
    "width": 2, "block": "planks"
  }]
}
```

## Units and construction

All template coordinates are **blocks**, at 0.5 m per block. A storey's `floor`
is its standing **feet** height, not its support-layer index. Layers are still
indexed from zero: this example's cellar support is layer 0, ground support layer 8.
The palette/layers contain each floor's distinct walls, furniture, doors and spawns.

`lower`/`upper` are the **centres of two-row landings**, at feet height. They join
`from`/`to` storey ids. The flight can run along either horizontal axis in either
direction. Every rise is one block; between landing centres the horizontal run is
`rise + 1` blocks. The along-axis centres are integers, while the across-axis
centre minus `width / 2` must be an integer; width is at least two cells (1 m).
Coordinates otherwise allow half cells. For example, a three-cell flight's across
centre can be 5.5.

Compilation fills solid wedges, both landings and all risers with `block`, and
clears **six cells (3 m)** above each row, including its landings. This opens the
upper floor. The player is 1.8 m tall and has a 0.3 m half-width: its box spans
adjacent one-cell treads during the existing 0.5 m step-up sweep. Five cells were
insufficient at the opening; six allows the actual sweep without tuning physics.
The 1.7 m shambler fits the same clearance, but fitting is not route discovery.
Do not put furniture or doors inside this clearance volume.

City stress tests still use `stackTemplate` to repeat an unannotated storey. An
explicitly planned building cannot also request repeated `storeys` in its site
placement: use its own upper-floor ASCII plan instead. No legacy conversion runs.

## Placement and carving

Site building `position` still names the rotated footprint's lowest x/z corner and
the **ground-floor support elevation in metres**. For the example above at y=21 m,
`AuthoredSite` lowers the template origin by eight blocks to y=17 m. Cellar feet
are at 17.5 m, ground-floor feet at 21.5 m. Lot elevation remains 21 m, not 17 m.

After natural terrain and vegetation, `stampPlacement` writes **every** template
cell, including air, over the terrain. This carves the buried room; repeated
stamping and regeneration produce the same void, even across horizontal/vertical
chunk seams and quarter turns. Surrounding soil, foundation, upper floor and roof
stay solid. A placement cannot put its lowest layer below the world's -48 m floor.

`placedFlights(placement)` exposes joined floor ids and rotated **world-block**
landing coordinates. These are deliberately retained for later navigation work;
there is no new shambler navigation or door-opening behaviour.

## Spatial validation

`npm run validate` runs `core/templateSpatial.ts`, not recipe/item reachability.
Whole-file rejection follows the ordinary content admission path. Explicit access
requires:

- unique floor ids/heights, a declared ground id and standing-body room;
- a supported, unobstructed entrance;
- a solid flight block, matching joined floor heights, aligned straight run and
  one-block rises;
- supported landing cells at both ends;
- full six-cell clearance over the entire flight, including furniture/closed doors;
- every standing floor-space sample reachable from the entrance through openings,
  openable doors and flights, with player/shambler-sized bounds and step-up clearance.

The static spatial check uses a half-cell horizontal grid and one-block vertical
steps. Doors are treated as openable for route acceptance; other solid furniture
blocks it. This is a construction check, not runtime pathfinding. Actual non-noclip
player traversal additionally tests the shipped example with the real physics.

## Darkness and light limits

Ordinary wide AO has a nonzero ambient floor, so merely burying the room did not
prove absence of sky bleed. Authored cellar placements supply a bounded voxel sky
field. Actual opacity (including closed furniture doors) blocks sky; missing chunks
are conservatively opaque. Clear vertical sky columns seed a six-neighbour air-path
flood. Diffuse transport loses 24/255 per half-metre cell, a **visual approximation**,
not sourced photometry or full global illumination. There is no ambient floor in
an enclosed region with no sky path.

A standard Three.js 3D texture scales world materials' **indirect diffuse** light.
The existing shadowed sun and flashlight contributions are not multiplied by it:
light can physically enter an opening, and a switched-on flashlight illuminates the
room. Existing flashlight adaptation uses the same local visibility in these bounds
instead of treating a dark cellar at noon as bright outdoors. It otherwise retains
its existing outdoor model. Fields update with mesh/furniture revisions, including
voxel edits and open/closed doors. The stylized separate hands scene retains its
existing lighting; it is not a photometric interior-light witness.

Only cellar sites allocate/patch this field. Built-in forest/city and the original
no-cellar authored spike keep their existing shaders and tree workload. No native
GPU/performance acceptance is implied by the headless functional test.

## Demonstration, not the real playtest buildings

`templates-stairs.json` contains `stairs_house` (two different storeys, a closed
upstairs bedroom door and resident) and `stairs_cabin` (ground floor, root cellar
and a cupboard containing six existing shotshell items). `layouts-stairs.json`
places them in `?site=stair_demo`. These are small fixtures, **not** the final beat-1
house or Dad's beat-3 cabin/woodshed/terrain. The lead authors those later.

Walk toward the lower landing in the house, up/down with ordinary movement. In the
cabin, the ground landing leads down; take a flashlight. The maintained
`test/browser/stairs.mjs` uses actual keyboard movement, checks noclip stays off,
compares dark/beam screenshots and demonstrates resident upstairs/player below and
the reverse under an actual sound stimulus.

Shamblers currently steer directly in x/z; investigation arrival ignores floor
height and far hearing keeps the listener's y. They cannot discover a remote stair
route. The closed bedroom door blocks the resident until the player opens it on
that floor. The cellar demonstration has no shambler. A future feature needs
floor-aware arrival and connector/waypoint routing; door AI is separate again.

Hatches would require horizontal hinge/panel geometry, collision/picking and a
saveable interaction state instead of today's vertical-door facing contract.
Ladders require a climbable surface, grab/release and vertical movement/physics
rules. Neither is implemented here.
