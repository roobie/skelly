---
read_if:
  - "you're reviewing an authored layout or current-world terrain"
  - "you're changing the top-down review map or opening it in-game in a debug session"
---

# Review map

`map.html` ships as a review tool, not player knowledge. In a game started with `debug=1`, hold the debug gate and press the review-map binding to open the overlay; Escape or the same binding closes it. The map is reachable in-game only through the debug gate, and the game remains unpaused. The overlay uses the active seed and site, shows the player's facing, and supports panning, zooming, and coordinate inspection. The standalone page reviews authored layouts and opens a debug game at a selected coordinate. See `src/game/inputBindings.ts`, `INPUT_BINDINGS`, and `src/game/play.ts`, `toggleReviewMap`.

Map sampling uses the current world's site surface and chunk stamping with the shared terrain and block-generation paths. Authored footprints and tracks appear when the selected site has a layout; other sites show sampled terrain and generated top-block colours without invented footprints. See `src/siteMapPage.ts`, `generateMap`, `src/game/worldSetup.ts`, `siteForReviewMap`, and `src/render/siteMap.ts`, `marchingSquares`.

The game's player map remains a paper map; see `DESIGN.md`, “UI principles”.
