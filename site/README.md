---
read_if:
  - you're changing the site launcher
  - you're changing the playtest tester brief
---

The launcher uses lit-html because it simplifies rendering and interactions. Keep the launcher simple but useful: it should make common launch options and direct links easy to use without becoming a second configuration interface.

The playtest tester brief's wording lives only in `launcher.js`, `playtestBrief`. The organiser's sheet, `../deadvox/docs/playtest-run.md`, points at it rather than copying it, so a wording change reaches every tester.
