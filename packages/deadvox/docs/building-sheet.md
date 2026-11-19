---
read_if:
  - you're reviewing how an authored building or site looks in the game, or want pictures of one without playing
  - you want a sheet of one slot alternative, such as a roof variant, or of every placement on a site
  - you're changing the building contact sheet tool, its views or its browser stage
  - a building sheet is slow and you want to know where its time goes
---

# Building contact sheet

The sheet shows an authored building the way the game draws it, so a reviewer judges the shipped look rather than an approximation. It loads the real game page and moves the spectator camera; it never builds its own scene or renderer, because a second renderer would drift from the game's lighting, weathering and meshing and would be reviewed instead of the game. Usage is in `tools/building-sheet.mjs`; see also `test/browser/buildingSheet.mjs`, `renderBuildingSheet`.

The tool reads what an id names from the content that authors it, so a reviewer names a template, an assembly or a layout the same way and a misnamed id fails before any browser starts. See `test/browser/buildingSheet.mjs`, `checkSheetRequest`.

A template or assembly on its own stands on flat ground at the day cycle's noon, so it is seen without a site's terrain, neighbours or night. The time is read from the day cycle, so the sheet follows the game when noon moves. See `test/browser/buildingSheet.mjs`, `sheetStart`.

A start names a site, so the start option takes the id a player picks the start by. Each placement of the building on that site gets its own sheet, because a site may place it more than once in different styles or turns. A layout is drawn whole and then placement by placement, so a reviewer sees how its parts sit together and each part alone. The whole site faces the side the player starts on, since a site puts its approach there. See `test/browser/buildingSheetPage.ts`, `sheetParts` and `siteSubject`.

A sheet of a placement away from the spawn reloads the page standing the player beside it, because the world streams in around the body, not the camera. The sheet names that reload as a page path, so a reviewer who wants to walk round the building starts beside it rather than at the start's spawn. See `test/browser/buildingSheet.mjs`, `walkInPath`, and `test/browser/buildingSheetPage.ts`, `camBeside`.

## Slot variants

A chosen slot alternative is drawn by searching for a seed whose own draw gives it, not by overriding the draw, so the sheet only ever shows a building the game can produce and its seed reproduces it in play. The search runs on the layout before any picture is taken, and the drawing page checks that its seed still draws the choice, so a sheet never shows another alternative under the chosen name. A generated or composed site places its buildings from the seed too, so a seed chosen for a slot would move the building; only a layout site takes variants. See `test/browser/buildingSheetVariants.ts`, `variantSeed`, and `test/browser/buildingSheetPage.ts`, `planSheet`.

The game runs frozen, so the simulation doesn't move people, weather or time between views and every view shows the same moment. A view waits for real signals that what it draws is final, then for enough drawn frames for the sun's shadows to catch up. A fixed sleep would be too short on a loaded machine and wasteful on an idle one. See `test/browser/buildingSheetPage.ts`, `settled`.

## Speed

Most of a sheet's time goes to waiting for the world to mesh, and the game meshes a fixed share of columns each frame, so under software rendering that wait follows the frame rate. A clipped view draws only the columns round its box, so it waits for those and the ring next to them, whose arrival remeshes their edges, and only for the ones within the game's view radius, since the game never meshes the rest. Only the unclipped street view needs the whole view radius, so it is drawn last, while the clipped views are posed and the rest of the radius streams in. It waits on the game's own settled view rather than a copy of that rule, so the sheet and the game agree on when the world is final. See `test/browser/buildingSheetPage.ts`, `drawnFinal`, `test/browser/buildingSheet.mjs`, `renderBuildingSheet`, and `packages/presentation/src/presentation/worldLoading.ts`, `viewSettled`.

The sheet keeps the game's view radius rather than shrinking it to the building. The distance fog closes at the view radius, so a smaller radius would draw a foggier building than a player sees.

The tool can draw on the host's own GPU when asked, because a reviewer waiting on a sheet gains more from a fast real driver than from SwiftShader's pixels, while the browser stage keeps SwiftShader so CI draws the same pixels on every runner. See `tools/building-sheet.mjs` and `test/browser/stage-mode.mjs`, `hostGpuArgs`.

Several sheets share one browser and one page server, because a fresh server first spends its time transforming the game's modules and later pages reuse them. For the same reason a scout page, which finds the placements and the variant seed, costs little next to the streaming it saves. A lone building without variants stands beside the spawn, so it skips the scout. See `test/browser/buildingSheetPage.ts`, `scoutSheet`.

## Views

The front is the side the template's local z = 0 row faces, turned with the placement. Templates are authored with their entrance on that row, so the front elevation shows the face a player walks up to, wherever the site turns it. Each elevation is named for the compass side it shows, read from the direction it faces, so the name stays true for a turned placement or a whole site. See `test/browser/buildingSheetPage.ts`, `placementSubject` and `faceName`.

Elevations, the roofline view and the plans clip the world to a box round the building, so neighbours, trees and terrain don't hide it or crowd the frame. The street view stays unclipped, at the player's eye height, because it shows the building in context as a player first meets it. The sky is never clipped, so a clipped view still has a background. See `test/browser/buildingSheetPage.ts`, `clipTo`.

A plan cuts each declared storey a little above its floor, as an architect's plan does: high enough to pass through doors and windows, so openings show, and low enough to stay under the ceiling. A template without declared storeys gets one plan of its ground floor. See `test/browser/buildingSheetPage.ts`, `PLAN_CUT_M`.

## Limits

Clipping removes the roof from the sun's view as well as the camera's, so a plan's rooms are sunlit, while the baked skylight and ambient occlusion still darken them as if roofed.

A cut wall is hollow, because a voxel mesh has faces only where a solid meets air. A plan shows a cut wall's top as a gap onto the sky, not as a filled section; the gap's outline is the wall.
