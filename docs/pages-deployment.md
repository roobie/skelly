---
read_if:
  - you are changing GitHub Pages builds or deploy configuration
  - "issue #292 changes analytics delivery"
---

# GitHub Pages deployment

Issue #292 requires analytics in the Pages deployments of gungen, deadvox and mobgen, but not in local development, previews or test builds. The root landing page is assembled separately and remains unchanged. The shared `pagesAnalyticsPlugin` in `pagesAnalyticsPlugin.ts` adds the script only when `PAGES_ANALYTICS=1`; the three subproject Vite configs pass that explicit switch, and `.github/workflows/pages.yml` sets it only for Pages build steps. Other builds—including production-mode builds used by tests—leave it unset.
