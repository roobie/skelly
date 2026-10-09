---
read_if:
  - "you're reviewing an authored layout or current-world terrain"
  - "you're changing the top-down review map or opening it in-game in a debug session"
---

# Review map

`map.html` ships with the game build as a review tool, not player knowledge. In a game started with `debug=1`, use the configured debug gate and review-map binding to open an overlay centered on the player's current position; Escape or the review-map binding closes it. The map is reachable in-game only through this debug gate. The game remains unpaused, matching the debug panel. The overlay uses the active seed and site settings, shows the player's facing, and supports panning, zooming, and coordinate inspection. The standalone page remains useful for reviewing authored layouts and opening a fresh debug game at a selected coordinate.

Map sampling uses the current world's site surface and chunk stamping with the shared terrain and block-generation paths. Authored footprints and tracks appear when the selected site has a layout; other sites show sampled terrain and generated top-block colours without invented footprints. See `src/siteMapPage.ts`, `generateMap`, `src/game/worldSetup.ts`, `siteForReviewMap`, and `src/render/siteMap.ts`, `marchingSquares`.

The game's player map remains a paper map; see `DESIGN.md`, “UI principles”.
