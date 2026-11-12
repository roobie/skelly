---
read_if:
  - you are changing GitHub Pages builds or deploy configuration
  - you are changing analytics or the analytics badge in published pages
---

# GitHub Pages deployment

Analytics is enabled only by publication tooling for Pages and frozen playtests, so development, preview and test builds do not depend on an external script. See `pagesAnalyticsPlugin.ts`, `pagesAnalyticsPlugin`, `.github/workflows/pages.yml`, and `packages/deadvox/tools/publish-playtest.mjs`, `publishPlaytest`.

The badge is a footer on pages that scroll like documents: the launcher, the playtest rounds and the audio sheet. The game and the full-viewport map would lose screen to it, so they load only the script. A page opts in with `data-analytics-badge` on its body. `pagesAnalyticsPlugin.ts`, `addPagesAnalytics`, is the one place that injects the script and badge, for Vite builds, for static pages at Pages assembly (`.github/workflows/pages.yml`) and for `packages/deadvox/tools/publish-playtest.mjs`, `publishPlaytest`. The art is white and pale teal, so its footer is always dark.
