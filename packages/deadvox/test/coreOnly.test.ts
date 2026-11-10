import { expect, it } from 'vitest';
import { buildRegistry, requiredContentIssues } from '../../engine/src/content.ts';
import { readBundledPacks } from '../tools/readBundledPacks.ts';

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

it('validates the core-tier mods alone with zero issues and without booting', () => {
  const { registry, issues } = buildRegistry(coreSources);
  expect(registry.compression.size).toBeGreaterThan(0);
  expect(registry.inventory.size).toBeGreaterThan(0);
  expect(registry.saves.size).toBeGreaterThan(0);
  expect(registry.weathering.size).toBeGreaterThan(0);
  expect([...issues, ...requiredContentIssues(registry)]).toEqual([]);
});
