---
read_if:
  - you're changing the site launcher
  - you're changing the playtest tester brief
  - you're changing the launcher's visual assets
---

The launcher uses lit-html because it simplifies rendering and interactions. Keep the launcher simple but useful: it should make common launch options and direct links easy to use without becoming a second configuration interface.

The umbrella launcher in `launcher.js` covers the subprojects and keeps direct destinations in a link-list card, separate from project controls, so the Round 1 playtest is easy to find without making the home page round-specific. A round-specific Deadvox invitation belongs at `deadvox/playtest/round1/` so its share preview describes the playtest rather than the whole project collection. Its HTML owns the social metadata because crawlers must be able to read the preview without running the Lit UI. The invitation reuses the bilingual copy in `playtest.jsonnet`, language selection in `playtestLanguage.js`, and catalog loading in `playtestCatalog.js`; the organiser's sheet, `../deadvox/docs/playtest-run.md`, points at that catalog instead of copying its wording. Keep the page's play link aimed at the authored Round 1 setup. The web page uses the launcher's backdrop so the playtest feels like part of the site; its social preview uses the round-specific artwork so a shared card identifies the playtest. A static preview keeps shares representative when crawlers do not execute the Lit UI. The logo's transparency lets it sit over the backdrop, while the cards keep their own backgrounds so imagery does not compete with text.
