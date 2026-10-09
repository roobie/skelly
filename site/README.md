---
read_if:
  - you're changing the site launcher
  - you're changing the playtest tester brief
  - you're changing the launcher's visual assets
---

The launcher uses lit-html because it simplifies rendering and interactions. Keep the launcher simple but useful: it should make common launch options and direct links easy to use without becoming a second configuration interface.

The Playtest text is authored in both languages in `playtest.jsonnet`; `launcher.js`, `playtestBrief`, lays it out. The organiser's sheet, `../deadvox/docs/playtest-run.md`, points at the catalog rather than copying its wording, so a wording change reaches every tester. Only the Playtest section is translated, so testers can use their browser language while the developer launchers stay English: choose Swedish when the browser lists it before English, and English otherwise. A link override lets a shared or review link request a particular language (`playtestLanguage.js`, `applyPlaytestLanguage`). Edit both language entries when wording changes, and have BR review the Swedish before merge. Keep the Playtest card before the developer launcher and its link after the brief so testers enter through the task rather than developer controls. The logo's transparency lets it sit over the backdrop; its processing and display live in `../tools/process-site-assets.mjs` and `styles.css`. The cards keep their own backgrounds so imagery does not compete with text. The palette carries the logo's visual identity without adding decoration; recheck card and footer contrast when the backdrop changes (`styles.css`, `:root`).
