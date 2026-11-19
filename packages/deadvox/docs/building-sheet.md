---
read_if:
  - you're reviewing how an authored building looks in the game, or want pictures of one without playing
  - you're changing the building contact sheet tool, its views or its browser stage
  - a building sheet is slow and you want to know where its time goes
---

# Building contact sheet

The sheet shows an authored building the way the game draws it, so a reviewer judges the shipped look rather than an approximation. It loads the real game page and moves the spectator camera; it never builds its own scene or renderer, because a second renderer would drift from the game's lighting, weathering and meshing and would be reviewed instead of the game. See `tools/building-sheet.mjs` and `test/browser/buildingSheet.mjs`, `renderBuildingSheet`.

A template on its own stands on flat ground at the day cycle's noon, so it is seen without a site's terrain, neighbours or night. The time is read from the day cycle, so the sheet follows the game when noon moves. A building that only exists inside a site, such as an assembly, is drawn where that site's start first places it, after a reload that stands the player beside it, because the world streams in around the body, not the camera. See `test/browser/buildingSheet.mjs`, `loneTemplateStart`, and `test/browser/buildingSheetPage.ts`, `camBeside`.

The game runs frozen, so the simulation doesn't move people, weather or time between views and every view shows the same moment. A view waits for real signals that what it draws is final, then for enough drawn frames for the sun's shadows to catch up. A fixed sleep would be too short on a loaded machine and wasteful on an idle one. See `test/browser/buildingSheetPage.ts`, `settled`.

## Speed

Most of a sheet's time goes to waiting for the world to mesh, and the game meshes a fixed share of columns each frame, so under software rendering that wait follows the frame rate. A clipped view draws only the columns round its box, so it waits for those and the ring next to them, whose arrival remeshes their edges, and only for the ones within the game's view radius, since the game never meshes the rest. Only the unclipped street view needs the whole view radius, so it is drawn last, while the clipped views are posed and the rest of the radius streams in. It waits on the game's own settled view rather than a copy of that rule, so the sheet and the game agree on when the world is final. See `test/browser/buildingSheetPage.ts`, `drawnFinal`, `test/browser/buildingSheet.mjs`, `renderBuildingSheet`, and `packages/presentation/src/presentation/worldLoading.ts`, `viewSettled`.

The sheet keeps the game's view radius rather than shrinking it to the building. The distance fog closes at the view radius, so a smaller radius would draw a foggier building than a player sees.

Several sheets share one browser and one page server, because a fresh server first spends its time transforming the game's modules and later pages reuse them. For the same reason an assembly's scout page costs little next to the streaming it saves.

## Views

The front is the side the template's local z = 0 row faces, turned with the placement. Templates are authored with their entrance on that row, so the front elevation shows the face a player walks up to, wherever the site turns it. See `test/browser/buildingSheetPage.ts`, `sheetViews`.

Elevations, the roofline view and the plans clip the world to a box round the building, so neighbours, trees and terrain don't hide it or crowd the frame. The street view stays unclipped, at the player's eye height, because it shows the building in context as a player first meets it. The sky is never clipped, so a clipped view still has a background. See `test/browser/buildingSheetPage.ts`, `clipTo`.

A plan cuts each declared storey a little above its floor, as an architect's plan does: high enough to pass through doors and windows, so openings show, and low enough to stay under the ceiling. A template without declared storeys gets one plan of its ground floor. See `test/browser/buildingSheetPage.ts`, `PLAN_CUT_M`.

## Limits

Clipping removes the roof from the sun's view as well as the camera's, so a plan's rooms are sunlit, while the baked skylight and ambient occlusion still darken them as if roofed.

A cut wall is hollow, because a voxel mesh has faces only where a solid meets air. A plan shows a cut wall's top as a gap onto the sky, not as a filled section; the gap's outline is the wall.
