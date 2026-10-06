---
read_if:
  - you are changing GitHub Pages builds or deploy configuration
  - "issue #292 changes analytics delivery"
---

# GitHub Pages deployment

The Pages workflow publishes the root landing page and the three subprojects. Analytics belongs only in the deployed gungen, deadvox and mobgen builds, not local development or test sessions. The shared `pagesAnalyticsPlugin` in `pagesAnalyticsPlugin.ts` adds the script to a Vite build only when `PAGES_ANALYTICS=1`; the three subproject Vite configs pass that explicit switch, and `.github/workflows/pages.yml` sets it only for the Pages builds. Other builds, dev servers and previews leave it unset. The root `site/index.html` is assembled separately and remains unchanged.

BR's rulings on 2026-10-06:

- **06:19:** “292: test yes. Also on gungen  and mobgen”
- **06:34, test sessions:** “Production builds only” (for the option “Vite injects the script only in production builds, so dev, preview and test pages never load it.”)
- **06:34, dev sessions:** “No, not in dev”

Issue #292 is the trigger for this delivery boundary. Keep the switch confined to the Pages build steps so production-mode builds used by tests do not load analytics.
