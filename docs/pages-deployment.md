---
read_if:
  - you are changing GitHub Pages builds or deploy configuration
  - you are changing analytics in published playtest builds
---

# GitHub Pages deployment

Analytics is enabled only by publication tooling for Pages and frozen playtests, so development, preview and test builds do not depend on an external script. See `pagesAnalyticsPlugin.ts`, `pagesAnalyticsPlugin`, `.github/workflows/pages.yml`, and `packages/deadvox/tools/publish-playtest.mjs`, `publishPlaytest`.
