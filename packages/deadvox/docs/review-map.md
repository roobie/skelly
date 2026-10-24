---
read_if:
  - you're reviewing an authored layout or current-world terrain
  - you're changing the top-down review map or opening it in a debug session
---

# Review map

The map page is a development review tool, not player knowledge. In a debug game it opens without pausing simulation, uses the active seed/site and supports inspection of the player's facing and coordinates. The standalone page reviews authored layouts and can open a debug game at a selected location. Keep these views separate from the in-game paper map, which belongs to the player-facing design. See `src/siteMapPage.ts`, `generateMap`, and `src/game/play.ts`, `toggleReviewMap`.

The map cuts by voxel height because a top-down view hides the lab's levels and cellars, and there is no authored level catalogue to read instead. The map page owns its slice keys so no game action is lost. See `src/siteMapPage.ts`, `showSlice` and `sliceKey`, and `src/render/siteMap.ts`, `topSolidAtOrBelow`.

Authored footprints and tracks appear only when the selected site has a layout; other sites show sampled terrain without invented footprints. See `src/render/siteMap.ts`, `marchingSquares`.
