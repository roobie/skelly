---
read_if:
  - you're authoring readable item or furniture content
  - you're changing how authored text enters play or how reading owns time
  - you're changing gameplay input while a readable is open
---

# Authored notes and signs

Items and furniture may carry immutable authored text. Each distinct note or sign is its own content type; copies share the text, and saves keep the existing type reference rather than duplicating prose or per-copy reading state. Keep authored text plain and render it as text nodes, never HTML. `npm run validate` owns the field checks; see `src/core/schema.ts`, `ReadableSchema`.

A readable-only note does not consume or change the item. An item with a book component may use both: the book owns timed recipe learning, while the readable owns the paper text. Reading starts from a held item or its quickbar action, not an inventory Read command. Opening a readable-only note is instantaneous; the live world continues while it is read.

The world-interaction action opens a sign through ordinary furniture reach and identity checks. Door interaction has priority over readable text, which has priority over container access. A readable/container hybrid opens for reading through F; inventory access remains ordinary.

The paper surface owns focus and scrolling while open. Gameplay, inventory and quickbar commands must not leak through. Closing it restores focus; closing a recipe book pauses its job and preserves progress, while movement closes the page and proceeds. The page shows its own progress endpoint because the player needs to know when reading is complete even with every HUD option disabled. See `src/ui/reading.ts`, `mountReading`, and `src/game/play.ts`, `stopReadingOnClose`.

Prototype samples remain explicitly marked as placeholders and separate from authored playtest lore. The medical sampling log and notice are drafts; approved evacuation and hunter text belongs to the playtest scenes. See `src/content/base/readables.json` and `src/content/base/layouts-playtest.json`.

## Darkness remains open

No reading-darkness gate is implemented. A cheap future gate may combine core sky visibility, sky intensity and charged held-light state, but it cannot claim local photometric illumination or flashlight-beam occlusion. It must not depend on renderer camera residency. BR still decides the threshold and how crafted light should pay off in Beat 3.
