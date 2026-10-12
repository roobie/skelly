---
read_if:
  - you are changing Vitest's worker budget or temporary-cache ownership
  - you are changing browser-test profile management
---

# Test pool

CPU-aware pool sizing leaves room for transform work while per-file isolation preserves fresh module state. See `testPool.ts`, `TEST_POOL`.

Vitest cache cleanup is scoped to directories owned by that run: killed processes skip exit cleanup, and an uncertain owner must not lose its files. Ordinary Vite imports keep the caller's temp directory. See `testPool.ts`, `makeOwnedTempDirectory`, `testTemp.ts`, and `test/vitest-temp.test.mjs`.

Playwright owns browser-profile cleanup, avoiding a second profile-reclamation mechanism. See `docs/browser-ci.md` and `.github/workflows/deadvox-browser.yml`.
