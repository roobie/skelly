# Authored-site spike (d35)

Source: `lone-house.tmj`, readable Tiled object-layer JSON. Runtime: the committed
`../src/content/base/layouts.json`. Building interiors remain ASCII templates;
Tiled places whole buildings, not their cells or furniture.

## Open and export

Open `deadvox.tiled-project` in **Tiled 1.11**, then `lone-house.tmj`. Enable scripts
for this project in Tiled's project scripting banner (only after reviewing
`extensions/deadvox.mjs`). Project extensions are deliberately suppressed until
trusted; an untrusted headless invocation says `Format not recognized`.

From `deadvox/`:

```sh
QT_QPA_PLATFORM=offscreen tiled --project "$PWD/maps/deadvox.tiled-project" \
  --export-map deadvox-site maps/lone-house.tmj src/content/base/layouts.json
npm run validate
../node_modules/.bin/biome format --write src/content/base/layouts.json
```

The short format name is `deadvox-site`; the editor calls it **Deadvox site layout**.
Successful export exits 0 and writes one JSON file. Unknown classes, missing
properties, wrong shapes, unaligned buildings, bad IDs, overlap and bounds errors
return an error string and exit 1 without publishing a new file. Existing output
is preserved if acceptance fails. `npm run validate` is the authoritative content
check, including references against the fully merged registry.

Right-click an object in the map and choose **Generate Deadvox property types
(reopen project)** to rebuild template/zombie enums and the five object classes
from base content. Close/reopen the project immediately afterward: Tiled 1.11 has
no scripting API to mutate live property types. Do not save stale editor types
back over the generated project. Enum IDs are preserved; unrelated custom types
are retained. The generated project types are already committed.

## Coordinate contract and classes

One pixel = one metre; use a finite orthogonal map with 1×1 tiles. Pixel x/y become
world x/z; elevation is world y. Map properties: `id` (lowercase content ID) and
`ground` (foundation elevation, snapped to 0.5 m). Map dimensions supply bounds
`[0,width) × [0,height)`. Group layers work; offsets and tile layers are rejected.

| Object class | Shape | Properties |
| --- | --- | --- |
| `building` | rectangle | required `template`; optional `storeys` (1–8, default 1), `elevation` (default ground) |
| `player_spawn` | point, exactly one | optional `yaw` (degrees, default 0), `elevation` (default ground + 0.5) |
| `shambler` | point | required `zombie`; optional `chance` (0–1, default 1), `elevation` (default ground + 0.5) |
| `woodland` | polygon | required `density` (0–1 multiplier on the seeded 2.13 field) |
| `track` | polyline | required `width` (>0 m); optional `surface` (`dirt` or `asphalt`, default dirt) |

Building rectangles must match the **unrotated** ASCII template footprint:
`size[0] × 0.5` by `size[2] × 0.5` metres. Rotate them only by quarter turns. Tiled's
rectangle pivot differs from runtime `Placement.origin`: export computes the
rotated minimum corner. That corner and elevation must be on the 0.5 m grid.
The house's Tiled pivot `(65,62)`, rotation 180°, exports minimum `(55,55)`; the
shed's pivot `(52,57)`, rotation 90°, exports minimum `(49,57)`.

Ground means the lower face of the top ground/foundation block. At 0.5 m blocks,
feet rest at `ground + 0.5`. Stored player yaw is degrees; only the loader converts
to engine radians. Spawn points must be strictly below the exclusive upper bounds;
polygon/building edges may touch them. Track width, including end caps, must fit.

## Layout JSON and runtime

`schema.ts` adds the content section `layouts`, an array of:

- `id`, `bounds: {x0,z0,x1,z1}`, `ground`;
- `buildings: [{template, position:[x,y,z], rotation:0|90|180|270, storeys?}]`;
- `player: {position:[x,y,z], yaw}`;
- `shamblers: [{type, position:[x,y,z], chance?}]`;
- `woodlands: [{polygon:[[x,z],...], density}]`;
- `tracks: [{points:[[x,z],...], width, surface?}]`.

All coordinates/widths are finite metres. Bounds have positive area. The normal
content pipeline checks IDs, every object's bounds and rotated building overlap,
and drops a broken file whole. Startup URL discovery and world construction
share that same admitted bundled registry; malformed-but-parseable sources
cannot contribute site IDs or prevent built-in sites from starting.
`AuthoredSite` reuses template compilation,
`stackTemplate`, clipping/stamping, furniture/loot and seed-owned tree placement
and `TreeIndex`. It flattens the site/lots, blends the boundary into natural
terrain, paints tracks, and rolls authored plus template spawn markers once.
Lot ownership is resolved before blending: a containing footprint wins,
otherwise the nearest footprint by block-cell rectangle distance wins. Equal
distances use the lexicographic key `template:position.join(','):rotation`,
never building-array order. Only that owner's 2 m flat apron and 4 m blend toward
site ground apply; a neighbour's transition cannot override its foundation.
Footprints do not overlap after admission; no per-column sorting is involved.
Overlapping woodlands use the maximum density multiplier. Woodland edges and
track canopy exclusion are rough, deliberately; no new renderer is involved.

`?site=lone_house&seed=1&debug=1` selects the bundled layout; unknown URL IDs retain
the normal fallback. Authored ASCII sites require the game's 0.5 m blocks. Saves
carry the arbitrary site ID (schema 8); source/content fingerprints cover the
loader and layout. No old-save migration.

## Beat 1 and limits

The map contains a south-facing two-storey `small_house`, a rotated `shed` standing
in for the tool shack, woodland north/behind the house, and a dirt track east.
The fixed shambler's feet are at 25 m, on the second storey's floor; furniture is
repeated upstairs by the existing stack primitive.

**This original spike still has no stair connection between storeys.** It is not
finished beat-1 content. Explicit storeys, ordinary-block flights, carved cellars
and spatial validation are now available separately: see [stairs](../docs/stairs.md)
and `?site=stair_demo`. Neither demonstration is the final playtest house/cabin;
`lone_house` itself remains unchanged. Hen house, fence and actual tool shack are
outside the spike.

## Several sites and production

Start with one `.tmj` → one content JSON per site. `outputFiles` adds value only
when one exporter emits several files (its default already names this single
output). A Tiled `.world` can show adjacent source maps as an editor atlas, but it
is not a runtime world loader and does not supply coordinate transforms to this
exporter. Disconnected playtest sites need neither feature.

A production pass needs proper playtest two-storey/stair content using the explicit
construction/spatial checks, authored spawn-support checks (XZ bounds are not those
checks), better terrain profiles,
woodland clipping, merged-pack enum generation, contextual elevation defaults,
and designer feedback for moved/rotated template rectangles. Stable authored spawn
IDs would make chance streams independent of object reordering.

A regenerate-and-diff check is worthwhile **on map/exporter/content-ID changes**,
using a pinned, project-trusted Tiled job and comparing parsed JSON (or applying
Biome before diff), not raw serializer whitespace. The spike proves semantic
regeneration equality locally; CI intentionally needs no Tiled. Ordinary CI
validates the committed output and exercises each acceptance rule plus chunk-order
stamping/upstairs furniture/spawns. Native Tiled rejection evidence is retained in
`.agent-mail/scratch/d35-1-tiled-controls.json`.
