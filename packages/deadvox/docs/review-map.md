---
read_if:
  - you're reviewing an authored layout or current-world terrain
  - you're changing the top-down review map or opening it in a debug session
---

# Review map

The map page is a development review tool, not player knowledge. In a debug game it opens without pausing simulation, uses the active seed/site and supports inspection of the player's facing and coordinates. The standalone page reviews authored layouts and can open a debug game at a selected location. Keep these views separate from the in-game paper map, which belongs to the player-facing design. See `src/siteMapPage.ts`, `generateMap`, and `src/game/play.ts`, `toggleReviewMap`.

The map shows one height slice at a time, because a top-down view hides everything under the surface and the lab's levels, cellars and shafts are reviewed by eye. A slice is a cut: the highest solid block at or below a block-grid height, with everything above left out, so a room under ground shows its own floor. The cut reads the generated voxel grid, which the map already samples for its block colours, instead of a list of levels: any authored storey, shaft or cave appears without the map knowing it. The page labels the active cut, and a way back to the surface view is always one press away. Stepping is by block, or by chunk with Shift, since a level's height is not content the map can read. See `src/siteMapPage.ts`, `showSlice`, and `src/render/siteMap.ts`, `topSolidAtOrBelow`.

Authored footprints and tracks appear only when the selected site has a layout; other sites show sampled terrain without invented footprints. See `src/render/siteMap.ts`, `marchingSquares`.
