import { deepStrictEqual } from 'node:assert/strict';
import { describe, expect, it, vi } from 'vitest';
import { compileJsonnetFile } from '../../tools/jsonnet/index.mjs';
import type { Chunk } from '../src/core/chunk.ts';
import { perimeterRouteIssues } from '../src/core/cityLots.ts';
import { buildCityPlan, type CityPlan, cityGridOf, servicePlacement } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { CHUNK, toChunk, type Vec3 } from '../src/core/coords.ts';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { makeScale } from '../src/core/scale.ts';
import { scenarioCertificate } from '../src/core/scenarioCertificate.ts';
import { composeScenario } from '../src/core/scenarioComposition.ts';
import { undergroundPortIssues } from '../src/core/scenarioPortal.ts';
import { ScenarioRouteSpace } from '../src/core/scenarioRoute.ts';
import type { ContentFile, MapAssemblyDef } from '../src/core/schema.ts';
import { sitePalette, terrainShapeOf } from '../src/core/sitePalette.ts';
import {
  compileAssembly,
  compileTemplate,
  footprint,
  type Placement,
  placedBlockAt,
  placedPoint,
  type Turn,
} from '../src/core/templates.ts';
import { generateChunk } from '../src/core/worldgen.ts';
import { startupContent } from './baseRegistry.ts';
import { cyclicSite, traverseScenario } from './fixtures/scenarioCertificate.ts';
import { GAUNTLET_SITE_MS } from './siteTimeouts.ts';

const { registry } = startupContent();
const profile = [...registry.scenarios.values()].find((scenario) => scenario.composition)!;
if (!profile) {
  throw new Error('Missing composed scenario');
}
const COMPOSED_LADDER = /composed ladder/;
const UNDERGROUND_OVERLAP = /overlaps the city/;
// The heavy cases are CPU-bound, so their timeouts scale with the simulated work and leave headroom for a shared
// CPU, instead of vitest's flat default (#792).
const WALK_MS_PER_STOREY = 4800;
const scale = makeScale(0.5);
const grid = cityGridOf(registry, profile.city);
const base = buildCityPlan({ seed: 9, registry, floor: 64, grid, scenario: profile });
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
  const key = shell.choices![0]!.ref.id;
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
              const { ref } = slot.choices![0]!;
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
  const service = servicePlacement({ template, floor: base.floor, grid, cell, turn });
  const composition = composeScenario(content, profile, service, {
    floor: base.floor,
    start: base.composition!.start.placement,
    lots: base.lots ?? [],
  })!;
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
const ownedCells = (placement: Placement, y: number): Vec3[] => {
  const [width, depth] = footprint(placement);
  const [x0, , z0] = placement.origin;
  const cells: Vec3[] = [];
  for (let z = z0; z < z0 + depth; z++) {
    for (let x = x0; x < x0 + width; x++) {
      if (placedBlockAt(placement, [x, y, z]) !== undefined) {
        cells.push([x, y, z]);
      }
    }
  }
  return cells;
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
  it('joins substituted production rooms and authored yards to the fixed campus, resources and objective', () => {
    const selected = selectedServices[0]!;
    const plan = candidatePlan(base.serviceBlock!, base.service!.turn, selected.template, substitutedRegistry);
    expect(scenarioCertificate(new CitySite(selected.seed, substitutedRegistry, scale, plan)).issues).toEqual([]);
  });

  it('rejects a blocked service crossing even when its inside witness stays reachable', () => {
    const [selected] = base.grid.service?.routes ?? [];
    expect(selected).toBeDefined();
    const route = { ...selected!, id: 'fixture_service_breach' };
    const plan: CityPlan = {
      ...base,
      grid: { ...base.grid, service: { ...base.grid.service!, routes: [route] } },
    };
    const inside = placedPoint(plan.service!, route.inside);
    const outside = placedPoint(plan.service!, route.outside);
    const entry = placedPoint(plan.service!, plan.service!.template.access!.entrance);
    // The full certificate is costly, so the unobstructed baseline checks only the crossing, from the entrance itself.
    const crossing = { placement: plan.service!, routes: [route] };
    const clear = new ScenarioRouteSpace(siteOf(plan));
    expect(perimeterRouteIssues(crossing, clear, [entry], '.city.service')).toEqual([]);
    const obstruction = inside.map((value, axis) => (value + outside[axis]!) / 2) as Vec3;
    const result = scenarioCertificate(new ObstructedSite(obstruction, plan));
    expect(result.space.path(entry, inside, { placement: plan.service! })).toBeDefined();
    expect(result.issues.map(([path]) => path)).toEqual(['.city.service.routes[0]']);
  });

  it(
    'rejects an obstruction stamped after the service portal was locally certified',
    () => {
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
    },
    GAUNTLET_SITE_MS,
  );

  it('rejects a missing seal keycard instead of admitting its bulkheads', () => {
    const site = siteOf();
    const [seal] = site.plan.composition!.seals;
    expect(seal).toBeDefined();
    const original = site.lootPointsIn.bind(site);
    vi.spyOn(site, 'lootPointsIn').mockImplementation((cx, cz) =>
      original(cx, cz).filter((point) => !point.destination.every((value, axis) => value === seal!.key[axis])),
    );
    expect(scenarioCertificate(site).issues.some(([path]) => path === '.composition.seals[0]')).toBe(true);
  });

  it('keeps both descents behind their bulkheads until the reachable card is admitted', () => {
    const site = siteOf();
    const closed = new ScenarioRouteSpace(site);
    const entry = site.plan.portal!.lower;
    const composition = site.plan.composition!;
    expect(composition.seals.length).toBeGreaterThan(0);
    for (const seal of composition.seals) {
      expect(closed.path(entry, seal.standing)).toBeDefined();
      for (const door of seal.doors) {
        closed.blocked(...door);
        const definition = closed.entities.defOf(closed.entities.at(...door)!);
        expect(definition.door).toBeDefined();
        expect(definition.door!.prying).toBeUndefined();
      }
    }
    const [, upper] = entry;
    const links = [...composition.descents, ...composition.stairs].filter((link) => link.upper[1] === upper);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(closed.path(entry, link.upper)).toBeUndefined();
    }
    const admitted = scenarioCertificate(site);
    expect(admitted.issues).toEqual([]);
    for (const link of links) {
      expect(admitted.space.path(entry, link.upper)).toBeDefined();
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

  it('rejects a sewer tunnel walled off between its mouth and the lab port', () => {
    const [sewer] = base.underground;
    if (!sewer) {
      throw new Error('Production city has no underground witness');
    }
    const { placement, definition } = sewer;
    const mouth = placedPoint(placement, definition.mouths[0]!.lower);
    const outside = placedPoint(placement, definition.ports[0]!.outside);
    const z = Math.floor((mouth[2] + outside[2]) / 2);
    const [width] = footprint(placement);
    const [west, bottom] = placement.origin;
    const site = siteOf();
    const original = site.stamp.bind(site);
    const stamp = vi.spyOn(site, 'stamp').mockImplementation((chunk) => {
      original(chunk);
      for (let x = west; x < west + width; x++) {
        for (let y = bottom + 1; y < bottom + placement.template.groundLayer!; y++) {
          obstruct(chunk, [x, y, z]);
        }
      }
    });
    try {
      const result = scenarioCertificate(site);
      expect(
        result.issues.some(
          ([path, message]) => path === '.city.underground[0].ports[0]' && message.includes('from the mouth'),
        ),
      ).toBe(true);
    } finally {
      stamp.mockRestore();
    }
  });

  it('admits the sewer port only where its threshold crosses the service shell', () => {
    expect(undergroundPortIssues(registry, profile, compiled)).toEqual([]);
    const [sewer] = profile.city.underground!;
    const [port] = sewer!.ports;
    const [x, y, z] = port!.threshold;
    const walled = { ...port!, threshold: [x + 8, y, z] as Vec3, inside: [x + 8, y, z - 3] as Vec3 };
    const city = { ...profile.city, underground: [{ ...sewer!, ports: [walled] }] };
    expect(undergroundPortIssues(registry, { ...profile, city }, compiled).map(([path]) => path)).toEqual([
      '.city.underground[0].ports[0]',
    ]);
  });

  it('refuses a city plan whose underground elements claim the same cells', () => {
    const [sewer] = profile.city.underground!;
    const underground = [sewer!, { ...sewer!, id: `${sewer!.id}_copy` }];
    const city = { ...profile.city, underground };
    expect(() =>
      buildCityPlan({ seed: 9, registry, floor: 64, grid: cityGridOf(registry, city), scenario: { ...profile, city } }),
    ).toThrow(UNDERGROUND_OVERLAP);
  });

  it('refuses a city plan whose underground element runs through a building above ground', () => {
    const [sewer] = base.underground;
    if (!sewer) {
      throw new Error('Production city has no underground witness');
    }
    const street = 64 + 1;
    const [own] = ownedCells(sewer.placement, street);
    const building = base.placements.find(
      (placement) => placement !== sewer.placement && ownedCells(placement, street).length > 0,
    );
    if (!(own && building)) {
      throw new Error('Need an owned street-level cell in the sewer and in a building');
    }
    const [target] = ownedCells(building, street);
    const [element] = profile.city.underground!;
    const position: [number, number] = [
      element!.position[0] + target![0] - own[0],
      element!.position[1] + target![2] - own[2],
    ];
    const city = { ...profile.city, underground: [{ ...element!, position }] };
    expect(() =>
      buildCityPlan({ seed: 9, registry, floor: 64, grid: cityGridOf(registry, city), scenario: { ...profile, city } }),
    ).toThrow(UNDERGROUND_OVERLAP);
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

const stampProbePoints = [
  base.portal!.upper,
  base.portal!.lower,
  base.composition!.objective,
  ...base.composition!.descents.flatMap(({ upper, lower, ladder }) => [upper, lower, ladder]),
  ...base.composition!.resources.map(({ at }) => at),
];
const stampProbeCells = [
  ...new Map(
    stampProbePoints.map((point) => {
      const cell = point.map(toChunk) as Vec3;
      return [cell.join(','), cell] as const;
    }),
  ).values(),
];

it(
  'resolves production service ownership, furnished loot and terrain stamps independently of chunk request order',
  () => {
    const first = siteOf();
    const second = siteOf(buildCityPlan({ seed: 9, registry, floor: 64, grid, scenario: profile }));
    expect(stampProbeCells.length).toBeGreaterThan(1);
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
        shape: terrainShapeOf(registry),
        scale,
        surface: site.surface,
        blocks: sitePalette(registry).terrain,
      };
      return new Map(
        order.map((cell) => {
          const chunk = generateChunk(terrain, cell);
          site.stamp(chunk);
          return [cell.join(','), { blocks: chunk.toArray(), furniture: site.furnitureIn(cell[0], cell[2]) }] as const;
        }),
      );
    };
    const forward = request(first, stampProbeCells);
    const backward = request(second, [...stampProbeCells].reverse());
    // Native deep equality avoids matcher traversal overhead on dense chunk and provenance arrays.
    for (const cell of stampProbeCells) {
      const key = cell.join(',');
      deepStrictEqual(backward.get(key), forward.get(key), `chunk ${key}`);
    }
    deepStrictEqual(selected(first), before, 'forward selection remains unchanged');
    deepStrictEqual(selected(second), before, 'backward selection matches the original');
  },
  stampProbeCells.length * 2 * 1000,
);

it(
  'walks substituted rooms and closed lids, opens descents, returns alive and activates the objective from the goal-face save',
  () => {
    const selected = selectedServices[0]!;
    const plan = candidatePlan(base.serviceBlock!, base.service!.turn, selected.template, substitutedRegistry);
    traverseScenario(new CitySite(selected.seed, substitutedRegistry, scale, plan), profile, scale);
  },
  profile.composition!.storeys.length * WALK_MS_PER_STOREY,
);

describe('lab threat by depth', () => {
  // Follow the scenario's authored storeys, including rebuilt levels outside the grid kit.
  const { storeys } = profile.composition!;
  const stack = lab.mapAssemblies!.find((assembly) =>
    storeys.every((storey) => assembly.slots.some((slot) => slot.id === storey.id)),
  )!;
  const storeySlots = stack.slots.filter((slot) => storeys.some((storey) => storey.id === slot.id));
  // A threat slot's pieces carry the marker chance; its weighted choices carry the zombie type.
  const markerChance = new Map(
    lab.mapPieces!.map((piece) => [
      piece.id,
      Object.values(piece.palette).reduce((sum, entry) => sum + ('chance' in entry ? (entry.chance ?? 0) : 0), 0),
    ]),
  );
  const expectedMarkers = (storeyId: string): number =>
    lab
      .mapAssemblies!.find((assembly) => assembly.id === storeyId)!
      .slots.filter((slot) => slot.id.includes('_threat_'))
      .reduce((sum, slot) => {
        const total = (slot.choices ?? []).reduce((all, choice) => all + choice.weight, 0);
        return (
          sum +
          (slot.choices ?? []).reduce(
            (acc, choice) => acc + (choice.weight / total) * markerChance.get(choice.ref.id)!,
            0,
          )
        );
      }, 0);

  it('weights expected markers no lower on each deeper storey and higher at the bottom than the top', () => {
    const topDown = [...storeySlots]
      .sort((a, b) => b.at[1] - a.at[1])
      .map((slot) => expectedMarkers(slot.choices?.[0]?.ref.id ?? ''));
    expect(topDown.length).toBeGreaterThan(1);
    for (let i = 1; i < topDown.length; i++) {
      expect(topDown[i]).toBeGreaterThanOrEqual(topDown[i - 1]!);
    }
    expect(topDown.at(-1)).toBeGreaterThan(topDown[0]!);
  });

  it('offers the amalgam only on the lowest storey', () => {
    const amalgamPieces = new Set(
      lab
        .mapPieces!.filter((piece) =>
          Object.values(piece.palette).some(
            (entry) => typeof entry !== 'string' && 'spawn' in entry && entry.spawn === 'amalgam',
          ),
        )
        .map((piece) => piece.id),
    );
    const storeysWithAmalgam = lab.mapAssemblies!.filter((assembly) =>
      assembly.slots.some((slot) => slot.choices?.some((choice) => amalgamPieces.has(choice.ref.id))),
    );
    const lowest = storeySlots.reduce((low, slot) => (slot.at[1] < low.at[1] ? slot : low));
    expect(storeysWithAmalgam.map((assembly) => assembly.id)).toEqual([lowest.choices?.[0]?.ref.id]);
  });
});
