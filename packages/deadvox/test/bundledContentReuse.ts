import { afterEach, beforeEach, vi } from 'vitest';
import type { StartupContent } from '../src/game/bundledContent.ts';
import { productContent } from '../src/product/content.ts';

const build = productContent.buildBundledContent;
const built = new Map<string, StartupContent>();
const buildKey = (mods: readonly unknown[], modsSelected: boolean): string => JSON.stringify([mods, modsSelected]);

const reusingBuild = (): void => {
  vi.spyOn(productContent, 'buildBundledContent').mockImplementation((mods = [], modsSelected = mods.length > 0) => {
    const key = buildKey(mods, modsSelected);
    const content = built.get(key) ?? build(mods, modsSelected);
    built.set(key, content);
    return content;
  });
};

/**
 * Admission rebuilds the whole base registry per call, so a test file whose cases admit the same mod sources builds
 * each distinct source list once and shares the result. The build is deterministic and cases only read what it returns;
 * a case that compares against base content keeps its own direct build, so that comparison never meets itself.
 * `plain` is an independent build of the content with no mod, which a file may hand over to spare the first such build.
 */
export const reuseBundledBuilds = (plain?: StartupContent): void => {
  if (plain !== undefined) {
    built.set(buildKey([], false), plain);
  }
  beforeEach(reusingBuild);
  afterEach(() => {
    vi.restoreAllMocks();
  });
};

/** Runs a module-level selection with the same sharing, for content a file reads from many cases. */
export const withReusedBuilds = <T>(select: () => T): T => {
  reusingBuild();
  try {
    return select();
  } finally {
    vi.restoreAllMocks();
  }
};
