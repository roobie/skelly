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
cuts **only the upper support layer over the intermediate treads**. It never
clears authored walls or ceilings. Validation derives clearance from the 1.8 m
body, 0.3 m half-width and existing raise-then-move step-up sweep along a half-cell
route. Standing requires four clear cells; overlap with future treads can require
six at the opening edge, not over a flat landing. An ordinary 2.5 m room keeps its
roof intact. A conflicting authored block is rejected with its cell coordinate.
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
- a supported, unobstructed entrance whose flood reaches a standing opening in
  the footprint's ground-storey outer ring;
- a solid flight block, matching joined floor heights, aligned straight run and
  one-block rises;
- supported landing cells at both ends;
- standing and step-up body clearance along the flight, including furniture/closed doors;
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
its existing outdoor model. Each cellar placement has its own two-block-padded
field. Up to **K = 4 nearest fields within the configured view radius** are resident
at once, stacked along the vertical-cell axis of one 3D texture. No volume spans
building gaps. Atlas slots retain authored order while resident membership stays
the same, so changing which of two cellars is nearest does not change either
interior's light or upload the texture again. Samples clamp to each field's texel
centres to prevent linear interpolation into the adjacent atlas slice.

**Limit:** beyond K, the farthest fields have visibility 1, as do fields outside
the view radius. Those interiors can still change light when residency changes;
this is bounded diffuse-light approximation, not unlimited scene GI. Retired
fields release their volume and sky-column cache; returning rebuilds them.

Streamer reports every chunk-data arrival/removal, including all-air chunks which
never request a mesh. Mesh changes separately cover edits/remeshes. Both invalidate
only intersecting columns and cached occluders above the box. `buildSkylight` owns
one cached top-down scan and floods only each resident box. Local door/geometry
changes invalidate it; distant entities and searched/locked-only state do not.
Materials are visited every frame with a WeakSet guard: dropped items, spent cases
and asynchronous model materials can appear without a mesh/entity revision.
Surface sampling is half a cell into air, so outdoor faces do not blend with solid texels.
The stylized separate hands scene retains its
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
`test/browser/stairs.mjs traversal` uses actual keyboard movement and checks
noclip stays off. Horizontal arrival has a ten-**simulation**-second bound;
landing settlement has a three-simulation-second physical bound. Both waits end
and fail if the simulation pauses, rather than waiting for the outer kill. Body
position, velocity, onGround, simulation time and pause state are written to
`states.json` before assertions and on walk/settle failure. Traversal uses a smaller
640×400 viewport because its unasserted diagnostic rendering consumes frame time;
lighting retains the 1280×800 viewport and its pixel oracles.
`test/browser/stairs.mjs lighting` independently compares HUD-free dark/beam
screenshots and an outdoor view against sky visibility forced to one. A test-only
second authored cabin, raised six metres so its padded top is in an all-air chunk
at block 64, checks real Streamer-to-render cache recovery and both CPU interior
samples staying dark across the nearest-cellar switch. Its test-only terrain apron
stays at the shared ground level, exposing the lower west wall. The same local cell
must be dark in slot zero and lit in slot one (`at()` values `[0, 1]`); that exposed
wall's GPU luminance must match the sky-one reference. The second-cellar dark
screenshot proves slot 1 is sampled; the wall contrast proves it is sampled from
its own slice. This contrast, not two identically dark interiors, detects
wrong-slot sampling. The extra cabin and terrain
override exist only in the lighting test's Vite plugin, not the demo or build. Both
stages keep the existing 300 s outer cap; neither retries to green. Opposite-floor resident/player
screenshots remain historical scratch evidence, not a test that pins today's AI limitation.

Shamblers currently steer directly in x/z; investigation arrival ignores floor
height and far hearing keeps the listener's y. They cannot discover a remote stair
route. The closed bedroom door blocks the resident until the player opens it on
that floor. The cellar demonstration has no shambler. A future feature needs
floor-aware arrival and connector/waypoint routing; door AI is separate again.

Hatches would require horizontal hinge/panel geometry, collision/picking and a
saveable interaction state instead of today's vertical-door facing contract.
Ladders require a climbable surface, grab/release and vertical movement/physics
rules. Neither is implemented here.
