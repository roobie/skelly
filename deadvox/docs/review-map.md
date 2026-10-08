---
read_if:
  - you're reviewing the authored playtest layout in #181
  - you're changing the top-down review map before #470
---

# Playtest review map

`map.html` is a development-only review page for inspecting the authored playtest site without adding a top-down view to the game. Open it on the Deadvox dev server, choose a view, then drag, zoom and click to inspect ground coordinates and open a fresh debug game there.

The page samples terrain and authored-site shaping through the same world-generation modules as play, and gets block colours from the content registry. See `src/siteMapPage.ts`, `generateMap`, and `src/render/siteMap.ts`, `marchingSquares`.

The top-down render is a review tool, not player knowledge. The in-game map remains the paper map the player finds in #470; see `DESIGN.md`, “UI principles”.
