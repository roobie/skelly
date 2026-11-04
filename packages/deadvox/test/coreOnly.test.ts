import { expect, it } from 'vitest';
import { buildRegistry, requiredContentIssues } from '../src/core/content.ts';
import { readBundledPacks } from '../tools/readBundledPacks.ts';
import { CORE_ONLY_KNOWN_ISSUES } from './fixtures/coreOnlyKnownIssues.ts';

/** Every core-tier mod's content files, as its manifest lists them, so a new core mod cannot skip this check. */
const coreSources = readBundledPacks('.')
  .filter(({ manifest }) => manifest.tier === 'core')
  .flatMap(({ manifest, files }) =>
    manifest.files
      .filter(({ kind }) => kind === 'content')
      .map(({ path }) => ({
        source: `core-only/${manifest.id}/${path}`,
        data: files.find(({ source }) => source === path)!.data,
      })),
  );

it('validates the core-tier mods alone without booting or hiding unowned or stale issues', () => {
  const { registry, issues } = buildRegistry(coreSources);
  const actual = [...issues, ...requiredContentIssues(registry)];
  expect(registry.compression.size).toBeGreaterThan(0);
  expect(registry.inventory.size).toBeGreaterThan(0);
  expect(registry.saves.size).toBeGreaterThan(0);
  expect(registry.weathering.size).toBeGreaterThan(0);
  expect(actual).toEqual(CORE_ONLY_KNOWN_ISSUES.map(({ issue }) => issue));
});
