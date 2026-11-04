import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildRegistry, requiredContentIssues } from '../src/core/content.ts';
import { CORE_ONLY_KNOWN_ISSUES } from './fixtures/coreOnlyKnownIssues.ts';

const CORE_MODS = [
  'skelly.saves',
  'skelly.day-cycle',
  'skelly.controls',
  'skelly.graphics',
  'skelly.ui',
  'skelly.weathering',
  'skelly.melee-classes',
  'skelly.inventory',
  'skelly.body',
  'skelly.sound-families',
  'skelly.senses',
  'skelly.natural-world',
  'skelly.materials',
  'skelly.medicine',
  'skelly.hand-tools',
];

/** A core mod's content files, as its manifest lists them. */
const coreModSources = (mod: string) => {
  const manifest = JSON.parse(readFileSync(`../mods/${mod}/pack/manifest.json`, 'utf8')) as {
    files: { path: string; kind: string }[];
  };
  return manifest.files
    .filter(({ kind }) => kind === 'content')
    .map(({ path }) => ({
      source: `core-only/${mod}/${path}`,
      data: JSON.parse(readFileSync(`../mods/${mod}/${path}`, 'utf8')) as unknown,
    }));
};

it('validates selected core mods without booting or hiding unowned or stale issues', () => {
  const { registry, issues } = buildRegistry(CORE_MODS.flatMap(coreModSources));
  const actual = [...issues, ...requiredContentIssues(registry)];
  expect(registry.compression.size).toBeGreaterThan(0);
  expect(registry.inventory.size).toBeGreaterThan(0);
  expect(registry.saves.size).toBeGreaterThan(0);
  expect(registry.weathering.size).toBeGreaterThan(0);
  expect(actual).toEqual(CORE_ONLY_KNOWN_ISSUES.map(({ issue }) => issue));
});
