---
read_if:
  - you are changing GitHub Pages builds or deploy configuration
  - you are changing analytics or the analytics badge in published pages
---

# GitHub Pages deployment

Analytics is enabled only by publication tooling for Pages and frozen playtests, so development, preview and test builds do not depend on an external script. See `tools/pages-analytics/index.ts`, `pagesAnalyticsPlugin`, `.github/workflows/pages.yml`, and `packages/deadvox/tools/publish-playtest.mjs`, `publishPlaytest`.

The badge discloses the analytics, so every page that loads the script should show it where that costs nothing. Document-style pages carry it in a footer. Full-viewport pages, the game and the map, get the script only, because a badge would cover controls or take screen. The classification and its checks are in `test/pages-analytics.test.mjs`, `BADGE_PAGES`. The badge art is white and pale teal, so its footer is always dark.
