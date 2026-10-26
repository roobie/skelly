import { afterEach, beforeEach, vi } from 'vitest';
// biome-ignore lint/performance/noNamespaceImport: the reuse wraps the content-build boundary that admission calls
import * as bundledContent from '../src/game/bundledContent.ts';

const build = bundledContent.buildBundledContent;
const built = new Map<string, bundledContent.StartupContent>();

/**
 * Admission rebuilds the whole base registry per call, so a test file whose cases admit the same mod sources builds
 * each distinct source list once and shares the result. The build is deterministic and cases only read what it returns;
 * a case that compares against base content keeps its own direct build, so that comparison never meets itself.
 */
export const reuseBundledBuilds = (): void => {
  beforeEach(() => {
    vi.spyOn(bundledContent, 'buildBundledContent').mockImplementation((mods = [], modsSelected = mods.length > 0) => {
      const key = JSON.stringify([mods, modsSelected]);
      const content = built.get(key) ?? build(mods, modsSelected);
      built.set(key, content);
      return content;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
};
