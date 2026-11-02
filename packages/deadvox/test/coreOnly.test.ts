import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildRegistry, requiredContentIssues } from '../src/core/content.ts';
import { CORE_ONLY_KNOWN_ISSUES } from './fixtures/coreOnlyKnownIssues.ts';

const CORE_TOPICS = [
  'body',
  'compression',
  'figures-player',
  'inventory',
  'item-wear',
  'saves',
  'dayCycle',
  'controls',
  'ui',
  'graphics',
  'look',
  'senses',
  'player',
];

it('validates selected core topics without booting or hiding unowned or stale issues', () => {
  const sources = CORE_TOPICS.map((topic) => ({
    source: `core-only/${topic}.json`,
    data: JSON.parse(readFileSync(`src/content/base/${topic}.json`, 'utf8')) as unknown,
  }));
  const weathering = JSON.parse(readFileSync('src/content/base/weathering.json', 'utf8')) as {
    weathering: { capability?: string }[];
  };
  sources.push({
    source: 'core-only/weathering.json',
    data: { weathering: weathering.weathering.filter((profile) => profile.capability === 'defaultWeathering') },
  });
  const { registry, issues } = buildRegistry(sources);
  const actual = [...issues, ...requiredContentIssues(registry)];
  expect(registry.compression.size).toBeGreaterThan(0);
  expect(registry.inventory.size).toBeGreaterThan(0);
  expect(registry.saves.size).toBeGreaterThan(0);
  expect(registry.weathering.size).toBeGreaterThan(0);
  expect(actual).toEqual(CORE_ONLY_KNOWN_ISSUES.map(({ issue }) => issue));
});
