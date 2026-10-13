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
