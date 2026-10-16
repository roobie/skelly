import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { fixtureScenario, fixtureScenarioSources, fixtureService } from './fixtures/scenario.ts';

describe('scenario admission', () => {
  it('admits resolved bounded references without mistaking another ladder marker for the entry column', () => {
    const profile = fixtureScenario();
    const service = fixtureService();
    service.palette.L = { furniture: 'fixture_ladder', facing: 'w' };
    for (const row of [5, 6]) {
      service.layers[1]![row] = `${service.layers[1]![row]!.slice(0, 2)}L${service.layers[1]![row]!.slice(3)}`;
    }
    const admitted = buildRegistry(fixtureScenarioSources(profile, service));
    expect(admitted.issues).toEqual([]);
    expect(admitted.registry.scenarios.get(profile.id)).toEqual(profile);
  });

  it.each(['body', 'compression', 'serviceTemplate'] as const)(
    'rejects the whole source when its %s reference is absent',
    (field) => {
      const sources = fixtureScenarioSources();
      const profile = fixtureScenario();
      profile[field] = 'missing_fixture_reference';
      const data = sources[0]!.data as { scenarios: (typeof profile)[] };
      data.scenarios = [profile];
      const rejected = buildRegistry(sources);
      expect(rejected.issues.some((issue) => issue.path.endsWith(`.${field}`))).toBe(true);
      expect(rejected.registry.scenarios.has(profile.id)).toBe(false);
      expect(rejected.registry.templates.has('fixture_house')).toBe(false);
    },
  );

  it('rejects nonclimbable furniture filling a gap in the declared entry column', () => {
    const service = fixtureService();
    service.palette.X = { furniture: 'fixture_crate' };
    for (const row of [3, 4]) {
      service.layers[3]![row] = `${service.layers[3]![row]!.slice(0, 4)}X${service.layers[3]![row]!.slice(5)}`;
    }
    const rejected = buildRegistry(fixtureScenarioSources(fixtureScenario(), service));
    expect(
      rejected.issues.some(
        (issue) => issue.path.endsWith('.portal.ladder') && issue.message.includes('climbable ladder column'),
      ),
    ).toBe(true);
  });

  it('rejects a lane prop that reaches into the reserved street-centre body envelope', () => {
    const profile = fixtureScenario();
    profile.city.streetProps = ['fixture_lane_prop'];
    const sources = fixtureScenarioSources(profile);
    const data = sources[0]!.data as { templates: ReturnType<typeof fixtureService>[] };
    data.templates.push({
      id: 'fixture_lane_prop',
      size: [profile.city.street / 2, 1, 1],
      lootContext: fixtureService().lootContext,
      palette: { '=': 'fixture_solid' },
      layers: [['='.repeat(profile.city.street / 2)]],
    });
    const rejected = buildRegistry(sources);
    expect(rejected.issues.some((issue) => issue.path.endsWith('.city.streetProps'))).toBe(true);
    expect(rejected.registry.scenarios.has(profile.id)).toBe(false);
  });

  describe('street prop pools', () => {
    const withPool = (choices: { kind: 'template' | 'piece'; id: string }[], laneProp?: { width: number }) => {
      const profile = fixtureScenario();
      profile.city.streetProps = ['fixture_prop_pool'];
      const sources = fixtureScenarioSources(profile);
      const data = sources[0]!.data as {
        templates: ReturnType<typeof fixtureService>[];
        mapPools?: { id: string; choices: { ref: { kind: string; id: string }; weight: number }[] }[];
      };
      data.templates.push({
        id: 'fixture_pool_prop',
        size: [laneProp?.width ?? 1, 1, 1],
        lootContext: fixtureService().lootContext,
        palette: { '=': 'fixture_solid' },
        layers: [['='.repeat(laneProp?.width ?? 1)]],
      });
      data.mapPools = [
        ...(data.mapPools ?? []),
        { id: 'fixture_prop_pool', choices: choices.map((ref) => ({ ref, weight: 1 })) },
      ];
      return { profile, sources };
    };

    it('reports a kit ref in a street prop pool as an issue instead of throwing', () => {
      const { profile, sources } = withPool([
        { kind: 'template', id: 'fixture_pool_prop' },
        { kind: 'piece', id: 'fixture_pool_piece' },
      ]);
      const rejected = buildRegistry(sources);
      expect(rejected.issues.some((issue) => issue.path.endsWith('.city.streetProps'))).toBe(true);
      expect(rejected.registry.scenarios.has(profile.id)).toBe(false);
    });

    it('rejects a street prop pool when any one choice does not fit the lane', () => {
      const { profile, sources } = withPool([{ kind: 'template', id: 'fixture_pool_prop' }], {
        width: fixtureScenario().city.street,
      });
      const rejected = buildRegistry(sources);
      expect(rejected.issues.some((issue) => issue.path.endsWith('.city.streetProps'))).toBe(true);
      expect(rejected.registry.scenarios.has(profile.id)).toBe(false);
    });

    it('admits a street prop pool whose every choice fits the lane', () => {
      const { profile, sources } = withPool([{ kind: 'template', id: 'fixture_pool_prop' }]);
      const admitted = buildRegistry(sources);
      expect(admitted.issues).toEqual([]);
      expect(admitted.registry.scenarios.has(profile.id)).toBe(true);
    });
  });

  it('rejects bounds that cannot preserve the reserved apron under every service turn', () => {
    const profile = fixtureScenario();
    profile.city.blockZ = profile.city.pad * 2 + fixtureService().size[2];
    const rejected = buildRegistry(fixtureScenarioSources(profile));
    expect(rejected.issues.some((issue) => issue.path.endsWith('.serviceTemplate'))).toBe(true);
    expect(rejected.registry.scenarios.has(profile.id)).toBe(false);
  });

  it('rejects a landing or shaft obstruction rather than admitting an abstract portal', () => {
    const service = fixtureService();
    service.layers[4]![4] = `${service.layers[4]![4]!.slice(0, 3)}=${service.layers[4]![4]!.slice(4)}`;
    const rejected = buildRegistry(fixtureScenarioSources(fixtureScenario(), service));
    expect(rejected.issues.some((issue) => issue.path.includes('.portal.'))).toBe(true);
    expect(rejected.registry.scenarios.size).toBe(0);
  });

  it('rejects a nearby lower landing sealed off from its ladder', () => {
    const profile = fixtureScenario();
    profile.portal.upper = [8.5, 7, 4];
    profile.portal.lower = [2.5, 1, 4];
    profile.portal.hatch = [5, 6, 3];
    profile.portal.ladder = [6, 1, 3];
    for (const partition of [false, true]) {
      const service = fixtureService();
      service.size[0] = 12;
      const lowerRows = [
        '============',
        '=..........=',
        '=..........=',
        '=.....H....=',
        '=.....H....=',
        '=..........=',
        '=..........=',
        '============',
      ].map((row) => (partition ? `${row.slice(0, 4)}=${row.slice(5)}` : row));
      const hatchRows = [
        '============',
        '============',
        '============',
        '=====TTT====',
        '=====TTT====',
        '============',
        '============',
        '============',
      ];
      service.layers = Array.from({ length: service.size[1] }, (_layer, y) => {
        if (y === 0) {
          return Array.from({ length: service.size[2] }, () => '============');
        }
        if (y === 6) {
          return [...hatchRows];
        }
        if (y >= 7) {
          return Array.from({ length: service.size[2] }, () => '............');
        }
        return [...lowerRows];
      });
      const result = buildRegistry(fixtureScenarioSources(profile, service));
      if (partition) {
        expect(result.issues.some((issue) => issue.path.endsWith('.portal.lower'))).toBe(true);
        expect(result.registry.scenarios.has(profile.id)).toBe(false);
      } else {
        expect(result.issues).toEqual([]);
        expect(result.registry.scenarios.has(profile.id)).toBe(true);
      }
    }
  });

  it('rejects an upper landing disconnected from every braced hatch exit', () => {
    const profile = fixtureScenario();
    profile.portal.upper = [8.5, 7, 4];
    for (const partition of [false, true]) {
      const service = fixtureService();
      if (partition) {
        for (let y = 7; y < service.size[1]; y++) {
          service.layers[y] = service.layers[y]!.map((row) => `${row.slice(0, 6)}=${row.slice(7)}`);
        }
      }
      const result = buildRegistry(fixtureScenarioSources(profile, service));
      if (partition) {
        expect(result.issues.some((issue) => issue.path.endsWith('.portal.upper'))).toBe(true);
        expect(result.registry.scenarios.has(profile.id)).toBe(false);
      } else {
        expect(result.issues).toEqual([]);
        expect(result.registry.scenarios.has(profile.id)).toBe(true);
      }
    }
  });

  it('rejects a locked entry even when its ordinary key reference resolves', () => {
    const sources = fixtureScenarioSources();
    const data = sources[0]!.data as {
      templates: ReturnType<typeof fixtureService>[];
      items: { key?: { lock: string } }[];
    };
    const service = data.templates.find((template) => template.id === fixtureScenario().serviceTemplate)!;
    const hatch = service.palette.T as { furniture: string; facing: 'w'; lock?: { id: string; locked: boolean } };
    hatch.lock = { id: 'fixture_lock', locked: true };
    data.items[0]!.key = { lock: 'fixture_lock' };
    const rejected = buildRegistry(sources);
    expect(rejected.issues.some((issue) => issue.path.endsWith('.portal.hatch'))).toBe(true);
    expect(rejected.registry.scenarios.size).toBe(0);
  });

  it('rejects a profile whose selector shadows the benchmark', () => {
    const profile = fixtureScenario();
    profile.id = 'city';
    const rejected = buildRegistry(fixtureScenarioSources(profile));
    expect(rejected.issues.some((issue) => issue.path.endsWith('.id'))).toBe(true);
    expect(rejected.registry.scenarios.has(profile.id)).toBe(false);
  });
});
