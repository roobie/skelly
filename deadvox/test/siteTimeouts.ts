// Building and certifying one bundled gauntlet city is CPU-bound, so a test's timeout scales with the sites it builds
// instead of vitest's flat default. One site builds in under 1.8 s unloaded; the factor of 4 is the slowdown from a
// shared CPU that the tests should tolerate. It must stay above the default, or a scaled test is stricter than a flat one.
const GAUNTLET_SITE_BUILD_MS = 1800;
const SHARED_CPU_SLOWDOWN = 4;

export const GAUNTLET_SITE_MS = GAUNTLET_SITE_BUILD_MS * SHARED_CPU_SLOWDOWN;
