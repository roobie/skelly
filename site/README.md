---
read_if:
  - you're changing the site launcher
  - you're changing the playtest tester brief
  - you're changing the launcher's visual assets
---

The launcher uses lit-html because it simplifies rendering and interactions. Keep the launcher simple but useful: it should make common launch options and direct links easy to use without becoming a second configuration interface.

The playtest tester brief's wording lives only in `launcher.js`, `playtestBrief`. The organiser's sheet, `../deadvox/docs/playtest-run.md`, points at it rather than copying it, so a wording change reaches every tester. The Playtest card appears before the Deadvox developer launcher, and its map link follows the brief; keeping them separate distinguishes a tester's entry from the developer Play button. The logo uses transparency to sit cleanly over the backdrop. Its processing and display live in `../tools/process-site-assets.mjs` and `styles.css`; the cards keep their own backgrounds so the imagery does not compete with their text. The launcher takes its palette from `styles.css`, `:root`, to carry the logo's visual identity without adding decoration; recheck card and footer contrast when the backdrop changes.
