import { expect, it } from 'vitest';
import { buildRegistry, requiredContentIssues } from '../src/engine/content.ts';
import { admitPacks } from '../src/engine/packs.ts';
import { readAvailablePacks, readBundledPacks } from '../tools/readBundledPacks.ts';

// A mod that consumes a provider must declare it, so loading the mod with only its declared closure and the core mods
// still finds every provider. The default and full stacks would hide a missing edge behind another mod's dependency.
it('loads every non-core mod with only its declared closure and the core mods, with zero issues', () => {
  const available = readAvailablePacks('.');
  const nonCore = available.filter(({ manifest }) => manifest.tier !== 'core');
  expect(nonCore.length).toBeGreaterThan(0);
  const issues = nonCore.flatMap(({ manifest }) => {
    const closure = new Set(readBundledPacks('.', manifest.id).map(({ manifest: { id } }) => id));
    const admitted = admitPacks(available.filter(({ manifest: { id, tier } }) => tier === 'core' || closure.has(id)));
    const { registry, issues: buildIssues } = buildRegistry(admitted.sources);
    return [...admitted.issues, ...buildIssues, ...requiredContentIssues(registry)].map(
      ({ path, message }) => `${manifest.id}: ${path}: ${message}`,
    );
  });
  expect(issues).toEqual([]);
});
