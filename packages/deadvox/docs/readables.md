---
read_if:
  - you're authoring readable item or furniture content, or changing the player tuning used for plaque mounting height
  - you're changing how authored text enters play or how reading owns time
  - you're changing gameplay input while a readable is open
---

# Authored notes and signs

Items and furniture may carry immutable authored text. Each distinct note or sign is its own content type; copies share the text, and saves keep the existing type reference rather than duplicating prose or per-copy reading state. Keep authored text plain and render it as text nodes, never HTML. `npm run validate` owns the field checks; see `src/core/schema.ts`, `ReadableSchema`.

Loose notes, manuals and logs are items because their appearance should agree with pickup and carrying. Separate paper categories let content tune carrying weight, stacking and loot eligibility without treating a sheet as a manual. See `src/core/schema.ts`, `ItemSchema`, and `src/content/base/models-items.jsonnet`.

Fixed signage stays furniture: wall plaques must look attached rather than occupy a wall-sized solid cell, while freestanding boards need legs. Shape and mounting are explicit content choices, never inferred from readable text or solidity. The mount and shape contract belongs to `src/core/schema.ts`, `FurnitureSchema`; host admission belongs to `src/core/content.ts`, `checkPaletteThing`. Plaques stay fixed and cannot be pried down. Host destruction is deferred to d334 slice 4; until that item, removing the wall can leave a plaque floating.

Plaques normally hang with their face centred near the standing eye line because they are read standing, not by looking down at the floor. Do not duplicate eye-height tuning: use `src/content/base/player.jsonnet`, `eye`, through `src/game/player.ts`, `playerTuning`, with placement scale in `src/core/scale.ts`, `BLOCK_SIZE`. An intentionally unusual height is an authored exception that needs a reason. Keep the face and its host aligned with the occupied cell so presentation, picking and host admission agree. See `test/authoredMedicalSite.test.ts`, "hangs wall mounts across the standing eye line and keeps the notice room accessible".

A loose note sits on a desk, crate or bench as fixed loot with surface placement: furniture raises the paper into view without adding a ground-placement mechanism. Gauntlet street leads, the maintenance memo and the camp's closing note all work this way. Each lead's text remains independently useful and its location spatially separate. Picking up its readable item counts as clue discovery; possession does not authorize the route. See `src/content/base/scenarios.jsonnet`, `composition`, and `src/core/scenarioDiscovery.ts`, `discoveryForPlan`. A note that belongs to one city building instead rides on that building's furniture as palette stock, so it appears wherever the building is drawn rather than at a site coordinate; it is flavour, not a scenario lead. See `src/core/schema.ts`, `PaletteThingSchema`, and `src/content/base/gauntlet-city-scenes.libsonnet`, `onDesk`.

A readable-only note does not consume or change the item. Do not combine readable with food or light: Read wins over Eat or Switch, so this is an authoring constraint, not a validation rejection. An item with a book component may use both: the book owns timed recipe learning, while the readable owns the paper text. Readable-only notes use the held quickbar route; books also support held primary use. There is no inventory Read command. Opening a readable-only note is instantaneous; the live world continues while it is read. See `src/game/primaryAction.ts`, `CAPABILITY_DISPATCH`.

The world-interaction action opens a sign through ordinary furniture reach and identity checks. Door interaction has priority over readable text, which has priority over container access. A readable/container hybrid opens for reading through F; inventory access remains ordinary.

The paper surface is one scrollable body, with no pages: page metadata, navigation, saved page state and repeated controls do not pay for the authored reading beats. It owns focus and scrolling while open. Gameplay, inventory and quickbar commands must not leak through. Closing it restores focus; closing a recipe book pauses its job and preserves progress, while movement closes the page and proceeds. The page shows its own progress endpoint because the player needs to know when reading is complete even with every HUD option disabled. See `src/ui/reading.ts`, `mountReading`, and `src/game/play.ts`, `stopReadingOnClose`.

Prototype samples remain explicitly marked as placeholders and separate from authored playtest lore. The medical sampling log and notice are drafts; approved evacuation and hunter text belongs to the playtest scenes. See `src/content/base/readables.json` and `src/content/base/layouts-playtest.json`.

## Darkness remains open

No reading-darkness gate is implemented. A future gate must build and cache its core visibility volume on the simulation side, fingerprint its inputs and fail open outside authored fields; it may combine core sky visibility, sky intensity and charged held-light state, but cannot claim local photometric illumination or flashlight-beam occlusion. It must not depend on renderer camera residency. BR still decides the threshold and how crafted light should pay off in Beat 3.
