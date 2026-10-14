import { describe, expect, it, vi } from 'vitest';
import { compileJsonnetFile } from '../../tools/jsonnet/index.mjs';
import type { Chunk } from '../src/core/chunk.ts';
import { buildCityPlan, type CityPlan, servicePlacement } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { CHUNK, toChunk, type Vec3 } from '../src/core/coords.ts';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { makeScale } from '../src/core/scale.ts';
import { scenarioCertificate } from '../src/core/scenarioCertificate.ts';
import { composeScenario } from '../src/core/scenarioComposition.ts';
import { ScenarioRouteSpace } from '../src/core/scenarioRoute.ts';
import type { ContentFile, MapAssemblyDef } from '../src/core/schema.ts';
import { compileAssembly, compileTemplate, footprint, placedPoint, type Turn } from '../src/core/templates.ts';
import { generateChunk, terrainBlockIds } from '../src/core/worldgen.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { cyclicSite, traverseScenario } from './fixtures/scenarioCertificate.ts';

const { registry } = BUNDLED_CONTENT;
const profile = [...registry.scenarios.values()].find((scenario) => scenario.composition)!;
if (!profile) {
  throw new Error('Missing composed scenario');
}
const COMPOSED_LADDER = /composed ladder/;
const scale = makeScale(0.5);
const base = buildCityPlan({ seed: 9, registry, floor: 64, grid: profile.city, scenario: profile });
const compiled = compileAssembly(registry, registry.mapAssemblies.get(profile.serviceTemplate)!, {
  seed: 9,
  siteId: `scenario:${profile.id}:service`,
});

const lab = JSON.parse(compileJsonnetFile('deadvox/src/content/base/gauntlet-lab.libsonnet')) as ContentFile;
const roomPools = new Map<string, MapAssemblyDef[]>();
for (const room of lab.mapAssemblies!) {
  const shell = room.slots.find((slot) => slot.id === 'shell');
  if (!shell) {
    continue;
  }
  const template = compileAssembly(registry, room, { seed: 9, siteId: 'fixture_room_pool' });
  if (template.pieces.some((piece) => registry.furniture.get(piece.furniture)?.scenarioGoal)) {
    continue;
  }
  const key = shell.choices[0]!.ref.id;
  roomPools.set(key, [...(roomPools.get(key) ?? []), room]);
}
const alternatives = new Map(
  [...roomPools.values()].flatMap((rooms) => rooms.map((room) => [room.id, rooms] as const)),
);
const substitutedRegistry: Registry = {
  ...registry,
  mapAssemblies: new Map([
    ...registry.mapAssemblies,
    ...lab.mapAssemblies!.map(
      (assembly) =>
        [
          assembly.id,
          {
            ...assembly,
            slots: assembly.slots.map((slot) => {
              const ref = slot.choices[0]!.ref;
              const choices = ref.kind === 'assembly' ? alternatives.get(ref.id) : undefined;
              const replacements = choices?.filter((room) => room.id !== ref.id);
              return replacements && replacements.length > 0
                ? {
                    ...slot,
                    choices: replacements.map((room) => ({
                      ref: { kind: 'assembly' as const, id: room.id },
                      weight: 1,
                    })),
                  }
                : slot;
            }),
          },
        ] as const,
    ),
  ]),
};
if (![...roomPools.values()].some((rooms) => rooms.length > 1)) {
  throw new Error('Production lab fixture needs substitutable furnished rooms');
}
const selectedServices = [9, 10, 11].map((seed) => ({
  seed,
  template: compileAssembly(substitutedRegistry, substitutedRegistry.mapAssemblies.get(profile.serviceTemplate)!, {
    seed,
    siteId: `scenario:${profile.id}:service`,
  }),
}));

const candidatePlan = (
  cell: readonly [number, number],
  turn: Turn,
  template = compiled,
  content = registry,
): CityPlan => {
  const service = servicePlacement({ template, floor: base.floor, grid: profile.city, cell, turn });
  const composition = composeScenario(content, profile, service, base.floor)!;
  const [width, depth] = footprint(service);
  const placements = base.placements.filter((placement) => {
    if (
      placement === base.service ||
      base.composition!.leads.includes(placement) ||
      base.composition!.landmarks.includes(placement)
    ) {
      return false;
    }
    const [w, d] = footprint(placement);
    return (
      placement.origin[0] + w <= service.origin[0] ||
      placement.origin[0] >= service.origin[0] + width ||
      placement.origin[2] + d <= service.origin[2] ||
      placement.origin[2] >= service.origin[2] + depth
    );
  });
  const upper = placedPoint(service, profile.portal.upper);
  const lower = placedPoint(service, profile.portal.lower);
  return {
    ...base,
    service,
    serviceBlock: cell,
    composition,
    portal: { ...base.portal!, upper, lower },
    placements: [...placements, service, ...composition.leads, ...composition.landmarks],
  };
};

const siteOf = (plan = base) => new CitySite(9, registry, scale, plan);
const obstruct = (chunk: Chunk, point: Readonly<Vec3>): void => {
  const cell = point.map(Math.floor) as Vec3;
  if (toChunk(cell[0]) === chunk.cx && toChunk(cell[1]) === chunk.cy && toChunk(cell[2]) === chunk.cz) {
    chunk.set(
      cell[0] - chunk.cx * CHUNK,
      cell[1] - chunk.cy * CHUNK,
      cell[2] - chunk.cz * CHUNK,
      registry.blockIds.get('stone')!,
    );
  }
};

class ObstructedSite extends CitySite {
  readonly obstruction: Readonly<Vec3>;
  constructor(obstruction: Readonly<Vec3>, plan = base) {
    super(9, registry, scale, plan);
    this.obstruction = obstruction;
  }
  override stamp(chunk: Chunk): void {
    super.stamp(chunk);
    obstruct(chunk, this.obstruction);
  }
}

describe('final composed body-route certificate', () => {
  for (const cell of base.candidates) {
    it.each([0, 1, 2, 3] as const)(
      `joins substituted production rooms, street, landings, resources and button face for candidate ${cell}, turn %s`,
      (turn) => {
        const selected = selectedServices[(base.candidates.indexOf(cell) + turn) % selectedServices.length]!;
        const plan = candidatePlan(cell, turn, selected.template, substitutedRegistry);
        expect(scenarioCertificate(new CitySite(selected.seed, substitutedRegistry, scale, plan)).issues).toEqual([]);
      },
    );
  }

  it('rejects an obstruction stamped after the service portal was locally certified', () => {
    const original = CitySite.prototype.stamp;
    const stamp = vi.spyOn(CitySite.prototype, 'stamp').mockImplementation(function (this: CitySite, chunk: Chunk) {
      original.call(this, chunk);
      obstruct(chunk, this.plan.portal!.lower);
    });
    try {
      expect(() => new GauntletSite({ seed: 9, registry, scale, scenario: profile })).toThrow(COMPOSED_LADDER);
    } finally {
      stamp.mockRestore();
    }
  });

  it('rejects a shaft-neighbor obstruction in the final furnished production lab', () => {
    const [descent] = base.composition!.descents;
    if (!descent) {
      throw new Error('Production lab has no descent witness');
    }
    const obstruction: Vec3 = [descent.ladder[0] + 1, descent.ladder[1] + 4, descent.ladder[2]];
    const result = scenarioCertificate(new ObstructedSite(obstruction));
    expect(
      result.issues.some(
        ([path, message]) => path === '.composition.descents[0]' && message.includes('continuous body-clear shaft'),
      ),
    ).toBe(true);
  });

  it('rejects support removed from the stamped objective face', () => {
    const site = siteOf();
    const original = site.stamp.bind(site);
    const [x, feet, z] = base.composition!.objectiveFace;
    const stamp = vi.spyOn(site, 'stamp').mockImplementation((chunk) => {
      original(chunk);
      for (const bx of [x - 1, x]) {
        for (const bz of [z - 1, z]) {
          if (toChunk(bx) === chunk.cx && toChunk(feet - 1) === chunk.cy && toChunk(bz) === chunk.cz) {
            chunk.set(bx - chunk.cx * CHUNK, feet - 1 - chunk.cy * CHUNK, bz - chunk.cz * CHUNK, 0);
          }
        }
      }
    });
    try {
      const result = scenarioCertificate(site);
      expect(result.issues.some(([path]) => path === '.composition.objectiveFace')).toBe(true);
    } finally {
      stamp.mockRestore();
    }
  });

  it('loads an obstructing furniture anchor across a chunk boundary before caching body clearance', () => {
    const own = buildRegistry([
      {
        source: 'owned-boundary.json',
        data: {
          furniture: [{ id: 'boundary_box', name: 'Boundary box', size: [3, 4, 2], color: '#aaaaaa' }],
          templates: [
            {
              id: 'boundary_box',
              lootContext: { usage: [], tier: 'Tier1' },
              size: [3, 4, 2],
              palette: { B: { furniture: 'boundary_box' } },
              layers: Array.from({ length: 4 }, () => ['BBB', 'BBB']),
            },
          ],
        },
      },
    ]);
    expect(own.issues).toEqual([]);
    const boundaryRegistry = { ...registry, furniture: new Map([...registry.furniture, ...own.registry.furniture]) };
    const placement = {
      template: compileTemplate(boundaryRegistry, own.registry.templates.get('boundary_box')!),
      origin: [CHUNK - 1, base.floor + 1, 5] as Vec3,
      turn: 0 as const,
    };
    const site = new CitySite(9, boundaryRegistry, scale, { ...base, placements: [...base.placements, placement] });
    const space = new ScenarioRouteSpace(site);
    expect(space.clear([CHUNK + 1, base.floor + 1, 6])).toBe(false);
  });

  it('rejects a fixed resource whose declared standing route is obstructed', () => {
    const result = scenarioCertificate(new ObstructedSite(base.composition!.resources[0]!.standing));
    expect(result.issues.some(([path]) => path.startsWith('.composition.resources'))).toBe(true);
  });

  it('rejects cyclic fixed keys behind their mutually dependent locked portals', () => {
    const result = scenarioCertificate(cyclicSite(registry, base, scale));
    expect(result.issues.some(([path]) => path === '.portal')).toBe(true);
    expect(result.issues.some(([path]) => path.startsWith('.composition.resources'))).toBe(true);
  });

  it('rejects a missing clue instead of treating two copies of metadata as independent sources', () => {
    const missing = base.composition!.leads[0]!;
    const result = scenarioCertificate(
      siteOf({ ...base, placements: base.placements.filter((placement) => placement !== missing) }),
    );
    expect(result.issues.some(([path]) => path === '.composition.leads')).toBe(true);
  });
});

it('resolves production service ownership, furnished loot and terrain stamps independently of chunk request order', () => {
  const first = siteOf();
  const second = siteOf(buildCityPlan({ seed: 9, registry, floor: 64, grid: profile.city, scenario: profile }));
  const composition = first.plan.composition!;
  const points = [
    first.plan.portal!.upper,
    first.plan.portal!.lower,
    composition.objective,
    ...composition.descents.flatMap(({ upper, lower, ladder }) => [upper, lower, ladder]),
    ...composition.resources.map(({ at }) => at),
  ];
  const cells = new Map(
    points.map((point) => {
      const cell = point.map(toChunk) as Vec3;
      return [cell.join(','), cell] as const;
    }),
  );
  expect(cells.size).toBeGreaterThan(1);
  const service = first.plan.service!.template;
  expect(service.provenance!.some((owner) => owner && owner.slotPath.split('/').length > 2)).toBe(true);
  const selected = (site: CitySite) => ({
    origin: site.plan.service!.origin,
    turn: site.plan.service!.turn,
    provenance: site.plan.service!.template.provenance,
  });
  const before = structuredClone(selected(first));
  const request = (site: CitySite, order: readonly Vec3[]) => {
    const terrain = {
      seed: site.seed,
      scale,
      surface: site.surface,
      blocks: terrainBlockIds((id) => registry.blockIds.get(id)!),
    };
    return new Map(
      order.map((cell) => {
        const chunk = generateChunk(terrain, cell);
        site.stamp(chunk);
        return [cell.join(','), { blocks: chunk.toArray(), furniture: site.furnitureIn(cell[0], cell[2]) }] as const;
      }),
    );
  };
  const forward = request(first, [...cells.values()]);
  const backward = request(second, [...cells.values()].reverse());
  for (const key of cells.keys()) {
    expect(backward.get(key)).toEqual(forward.get(key));
  }
  expect(selected(first)).toEqual(before);
  expect(selected(second)).toEqual(before);
});

it(
  'walks closed lids, opens descents, returns alive and activates the objective from the goal-face save',
  () => {
    traverseScenario(siteOf(candidatePlan(base.candidates[0]!, 1)), profile, scale);
  },
  profile.composition!.storeys.length * 2000,
);
