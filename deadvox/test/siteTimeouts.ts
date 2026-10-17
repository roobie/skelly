// Building and certifying one bundled gauntlet city is CPU-bound, so a test's timeout scales with the sites it builds
// instead of vitest's flat default. The budget for one site leaves several times a single build's headroom for a
// shared CPU, and stays above the default: a scaled test must never be stricter than a flat one.
export const GAUNTLET_SITE_MS = 7200;
