---
read_if:
  - you're changing the site launcher
  - you're changing the playtest tester brief or its publication
  - you're changing the launcher's visual assets
---

The launcher uses lit-html because it simplifies rendering and interactions. Keep the launcher simple but useful: it should make common launch options and direct links easy to use without becoming a second configuration interface.

Keep direct destinations separate from project controls so playtests remain easy to find without making the umbrella launcher round-specific. Frozen invitations are published separately from rolling Pages; the old round landing must explain that moving origins does not carry saves. See `../packages/deadvox/docs/playtest-run.md`, "Frozen round publication".

The invitation reuses shared bilingual consent copy rather than duplicating it. Its HTML owns social metadata because crawlers may not run the Lit UI; publishing resolves those URLs to the round's address. See `../packages/deadvox/tools/publish-playtest.mjs`, `publishPlaytest`. The page shares the launcher's backdrop for visual continuity, while round-specific preview artwork identifies the playtest when shared. Transparent logos sit over the backdrop; cards retain separate backgrounds so imagery does not compete with text.
