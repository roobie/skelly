---
read_if:
  - you're authoring readable item or furniture content
  - you're changing how authored text enters play or how reading owns time
  - you're changing gameplay input while a readable is open
---

# Authored notes and signs

Items and furniture may carry immutable authored text. Each distinct note or sign is its own content type; copies share the text, and saves keep the existing type reference rather than duplicating prose or per-copy reading state. Keep authored text plain and render it as text nodes, never HTML. `npm run validate` owns the field checks; see `src/core/schema.ts`, `ReadableSchema`.

A readable-only note does not consume or change the item. Do not combine readable with food or light: Read wins over Eat or Switch, so this is an authoring constraint, not a validation rejection. An item with a book component may use both: the book owns timed recipe learning, while the readable owns the paper text. Readable-only notes use the held quickbar route; books also support held primary use. There is no inventory Read command. Opening a readable-only note is instantaneous; the live world continues while it is read. See `src/game/primaryAction.ts`, `CAPABILITY_DISPATCH`.

The world-interaction action opens a sign through ordinary furniture reach and identity checks. Door interaction has priority over readable text, which has priority over container access. A readable/container hybrid opens for reading through F; inventory access remains ordinary.

The paper surface is one scrollable body, with no pages: page metadata, navigation, saved page state and repeated controls do not pay for the authored reading beats. It owns focus and scrolling while open. Gameplay, inventory and quickbar commands must not leak through. Closing it restores focus; closing a recipe book pauses its job and preserves progress, while movement closes the page and proceeds. The page shows its own progress endpoint because the player needs to know when reading is complete even with every HUD option disabled. See `src/ui/reading.ts`, `mountReading`, and `src/game/play.ts`, `stopReadingOnClose`.

Prototype samples remain explicitly marked as placeholders and separate from authored playtest lore. The medical sampling log and notice are drafts; approved evacuation and hunter text belongs to the playtest scenes. See `src/content/base/readables.json` and `src/content/base/layouts-playtest.json`.

## Darkness remains open

No reading-darkness gate is implemented. A future gate must build and cache its core visibility volume on the simulation side, fingerprint its inputs and fail open outside authored fields; it may combine core sky visibility, sky intensity and charged held-light state, but cannot claim local photometric illumination or flashlight-beam occlusion. It must not depend on renderer camera residency. BR still decides the threshold and how crafted light should pay off in Beat 3.
