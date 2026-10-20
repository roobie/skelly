import { describe, expect, it } from 'vitest';
import { benchmarkCityGrid, cityGridOf } from '../src/core/cityPlan.ts';
import { buildRegistry } from '../src/core/content.ts';
import { scenarioSources } from '../src/core/scenarioComposition.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { fixturePool, fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';

const EXCLUDED_ENTRY =
  /collection "fixture_pool" building "fixture_house".*every consumer.*settlement kind "fixture_city" is excluded/;
const PLOT_EXCLUDED = /collection "fixture_pool" building "fixture_house".*does not fit reserved row/;

const fixture = () => {
  const sources = fixtureScenarioSources();
  return { sources, data: sources[0]!.data as ContentFile };
};

const benchmark = () => ({
  id: 'fixture_benchmark',
  settlementKind: 'fixture_city',
  pool: 'fixture_pool',
  street: 4,
  blockX: 20,
  blockZ: 20,
  pad: 2,
  gap: 2,
  blend: 4,
  rows: 2,
  reachMetres: 20,
});

describe('settlement collection admission', () => {
  it('rejects a collection entry excluded by every consumer, naming collection, building and reason', () => {
    const { sources, data } = fixture();
    data.templates!.find(({ id }) => id === 'fixture_house')!.eligibility = { settlementKinds: ['fixture_other'] };
    const { issues } = buildRegistry(sources);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'mapPools[0].choices[0].ref',
          message: expect.stringMatching(EXCLUDED_ENTRY),
        }),
        expect.objectContaining({
          path: 'scenarios[0].city.pool',
          message: expect.stringContaining('no eligible weighted buildings'),
        }),
      ]),
    );
  });

  it('filters a shared collection by each consumer kind without rejecting a building accepted elsewhere', () => {
    const { sources, data } = fixture();
    const other = fixtureScenario();
    other.id = 'fixture_other_scenario';
    other.city.settlementKind = 'fixture_other';
    data.scenarios!.push(other);
    data.templates!.find(({ id }) => id === 'fixture_small_house')!.eligibility = {
      settlementKinds: ['fixture_other'],
    };
    data.mapPools = [
      fixturePool([
        { ref: { kind: 'template', id: 'fixture_house' }, weight: 3, atLeast: 1 },
        { ref: { kind: 'template', id: 'fixture_small_house' }, weight: 2, atMost: 2 },
      ]),
    ];
    const { registry, issues } = buildRegistry(sources);
    expect(issues).toEqual([]);
    expect(cityGridOf(registry, data.scenarios![0]!.city).templates).toEqual([
      { id: 'fixture_house', weight: 3, atLeast: 1 },
    ]);
    expect(cityGridOf(registry, other.city).templates).toEqual([{ id: 'fixture_small_house', weight: 2, atMost: 2 }]);
  });

  it('uses authored building dimensions to filter plot fit and rejects a building fitting nowhere', () => {
    const { sources, data } = fixture();
    const house = data.templates!.find(({ id }) => id === 'fixture_house')!;
    house.size[0] += 7;
    house.layers = house.layers.map((layer) => layer.map((row) => `${row}${'='.repeat(7)}`));
    data.mapPools = [
      fixturePool([
        { ref: { kind: 'template', id: house.id }, weight: 3, atLeast: 1 },
        { ref: { kind: 'template', id: 'fixture_small_house' }, weight: 2 },
      ]),
    ];
    const narrow = fixtureScenario();
    narrow.id = 'fixture_narrow_scenario';
    narrow.city.blockX = 14;
    data.scenarios!.push(narrow);
    const admitted = buildRegistry(sources);
    expect(admitted.issues).toEqual([]);
    expect(cityGridOf(admitted.registry, narrow.city).templates.map(({ id }) => id)).toEqual(['fixture_small_house']);
    data.scenarios = [narrow];
    expect(buildRegistry(sources).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringMatching(PLOT_EXCLUDED),
        }),
      ]),
    );
  });

  it('does not count benchmark-only candidates as playable scenario sources', () => {
    const { sources, data } = fixture();
    data.cityBenchmarks = [{ ...benchmark(), settlementKind: 'fixture_benchmark_kind' }];
    data.templates!.find(({ id }) => id === 'fixture_small_house')!.eligibility = {
      settlementKinds: ['fixture_benchmark_kind'],
    };
    data.mapPools = [
      fixturePool([
        { ref: { kind: 'template', id: 'fixture_house' }, weight: 1 },
        { ref: { kind: 'template', id: 'fixture_small_house' }, weight: 1 },
      ]),
    ];
    const { registry, issues } = buildRegistry(sources);
    expect(issues).toEqual([]);
    expect(benchmarkCityGrid(registry).templates.map(({ id }) => id)).toEqual(['fixture_small_house']);
    expect(scenarioSources(registry).templates).toContain('fixture_house');
    expect(scenarioSources(registry).templates).not.toContain('fixture_small_house');
  });

  it('keeps benchmark candidates unchanged when the fixture hamlet roster changes', () => {
    const { sources, data } = fixture();
    data.cityBenchmarks = [benchmark()];
    const before = buildRegistry(sources);
    expect(before.issues).toEqual([]);
    const candidates = benchmarkCityGrid(before.registry).templates;
    expect(candidates.length).toBeGreaterThan(0);
    data.siteGeneration![0]!.hamlet.northSide = ['fixture_small_house', 'fixture_small_house'];
    data.siteGeneration![0]!.hamlet.southSide = ['fixture_small_house'];
    const after = buildRegistry(sources);
    expect(after.issues).toEqual([]);
    expect(benchmarkCityGrid(after.registry).templates).toEqual(candidates);
  });

  it('validates benchmark references and empty filtered candidates without requiring a benchmark in other stacks', () => {
    const { sources, data } = fixture();
    expect(buildRegistry(sources).issues).toEqual([]);
    data.cityBenchmarks = [{ ...benchmark(), pool: 'fixture_missing' }];
    expect(buildRegistry(sources).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'cityBenchmarks[0].pool', message: 'no map pool "fixture_missing"' }),
      ]),
    );
    data.cityBenchmarks = [{ ...benchmark(), settlementKind: 'fixture_other' }];
    expect(buildRegistry(sources).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'cityBenchmarks[0].pool',
          message: expect.stringContaining('no eligible weighted buildings'),
        }),
      ]),
    );
  });
});
