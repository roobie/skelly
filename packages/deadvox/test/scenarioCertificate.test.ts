import { deepStrictEqual } from 'node:assert/strict';
import { describe, expect, it, vi } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import type { Chunk } from '../src/core/chunk.ts';
import { perimeterRouteIssues } from '../src/core/cityLots.ts';
import { buildCityPlan, type CityPlan, cityGridOf } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import { climbCertificate } from '../src/core/climbCertificate.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK, toChunk, type Vec3 } from '../src/core/coords.ts';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { makeScale } from '../src/core/scale.ts';
import {
  type CertificatePhase,
  scenarioCertificate,
  scenarioLotResourceCertificate,
} from '../src/core/scenarioCertificate.ts';
import { undergroundPortIssues } from '../src/core/scenarioPortal.ts';
import { ScenarioRouteSpace } from '../src/core/scenarioRoute.ts';
import { sitePalette, terrainShapeOf } from '../src/core/sitePalette.ts';
import {
  compileAssembly,
  compileTemplate,
  footprint,
  type Placement,
  placedBlockAt,
  placedPieces,
  placedPoint,
} from '../src/core/templates.ts';
import { generateChunk } from '../src/core/worldgen.ts';
import { startupContent } from './baseRegistry.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureMaterials, fixtureSounds } from './economyFixtures.ts';
import { cyclicSite, traverseScenario } from './fixtures/scenarioCertificate.ts';

const { registry } = startupContent();
const profile = [...registry.scenarios.values()].find((scenario) => scenario.composition)!;
if (!profile) {
  throw new Error('Missing composed scenario');
}
const COMPOSED_LADDER = /composed ladder/;
const UNDERGROUND_OVERLAP = /overlaps the city/;
// What a case needs to link the storeys before a rule that reads them (objective, fixed resources, the portal).
const ROUTED_PHASES: CertificatePhase[] = ['floors', 'ladders', 'stairs'];
const scale = makeScale(0.5);
const grid = cityGridOf(registry, profile.city);
const base = buildCityPlan({ seed: 9, registry, floor: 64, grid, scenario: profile });
const compiled = compileAssembly(registry, registry.mapAssemblies.get(profile.serviceTemplate)!, {
  seed: 9,
  siteId: `scenario:${profile.id}:service`,
});

const witness = JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/lab-witness.jsonnet')) as {
  mapAssemblies: string[];
  mapPieces: string[];
  loops: { from: Vec3; through: Vec3; to: Vec3; cut: { min: Vec3; size: Vec3 } }[];
  pitClimb: { ladder: Vec3; upper: Vec3; lower: Vec3 };
};
const labDefinition = <T>(definitions: ReadonlyMap<string, T>, id: string): T => {
  const definition = definitions.get(id);
  if (!definition) {
    throw new Error(`Base content does not admit lab definition ${id}`);
  }
  return definition;
};
const lab = {
  mapAssemblies: witness.mapAssemblies.map((id) => labDefinition(registry.mapAssemblies, id)),
  mapPieces: witness.mapPieces.map((id) => labDefinition(registry.mapPieces, id)),
};

const siteOf = (plan = base) => new CitySite(9, registry, scale, plan);
// A narrowed phase set can report a rule's path for an unrelated reason (a route locked because a phase it needs was
// left out), so each narrowed probe first proves its rule stays quiet on the unobstructed site with the same phases.
const healthyPaths = new Map<string, string[]>();
const expectQuietWhenHealthy = (phases: readonly CertificatePhase[], rule: (path: string) => boolean): void => {
  const key = phases.join();
  if (!healthyPaths.has(key)) {
    healthyPaths.set(
      key,
      scenarioCertificate(siteOf(), phases).issues.map(([path]) => path),
    );
  }
  // biome-ignore lint/suspicious/noMisplacedAssertion: shared control, only ever called from inside a test case
  expect(healthyPaths.get(key)!.filter(rule)).toEqual([]);
};
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
  it('prepares furniture columns only on the first route probe into a chunk', () => {
    const space = new ScenarioRouteSpace(siteOf(base));
    const furniture = vi.spyOn(
      space as unknown as { loadFurniture: (cx: number, cz: number) => void },
      'loadFurniture',
    );
    const y = CHUNK * 2 + 1;
    try {
      space.blocked(0, y, 0);
      expect(furniture.mock.calls.length).toBeGreaterThan(0);
      furniture.mockClear();
      space.blocked(1, y, 0);
      space.blocked(1, y + 1, 0);
      expect(furniture).not.toHaveBeenCalled();
      space.blocked(CHUNK, y, 0);
      expect(furniture.mock.calls.length).toBeGreaterThan(0);
    } finally {
      furniture.mockRestore();
    }
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
    const result = scenarioCertificate(new ObstructedSite(obstruction, plan), ['start', 'service']);
    expect(result.space.path(entry, inside, { placement: plan.service! })).toBeDefined();
    expect(result.issues.map(([path]) => path)).toEqual(['.city.service.routes[0]']);
  });

  it('rejects an obstruction stamped after the service portal was locally certified', () => {
    const original = CitySite.prototype.stamp;
    const stamp = vi.spyOn(CitySite.prototype, 'stamp').mockImplementation(function (this: CitySite, chunk: Chunk) {
      original.call(this, chunk);
      obstruct(chunk, this.plan.portal!.lower);
    });
    try {
      const { issues } = scenarioCertificate(new GauntletSite({ seed: 9, registry, scale, scenario: profile }));
      expect(issues.map(([path, message]) => `${path}: ${message}`).join('\n')).toMatch(COMPOSED_LADDER);
    } finally {
      stamp.mockRestore();
    }
  });

  it.each(witness.loops)(
    'keeps storey %# an interior loop when a public room doorway is blocked with the bulkheads closed',
    (loop) => {
      const site = siteOf();
      const point = (at: Vec3) => placedPoint(site.plan.service!, at);
      const from = point(loop.from);
      const through = point(loop.through);
      const to = point(loop.to);
      const clear = new ScenarioRouteSpace(site);
      expect(clear.sweep(from, through)).toBe(true);
      expect(clear.path(through, to, { steps: true })).toBeDefined();
      const original = site.stamp.bind(site);
      const stamp = vi.spyOn(site, 'stamp').mockImplementation((chunk) => {
        original(chunk);
        for (let y = 0; y < loop.cut.size[1]; y++) {
          for (let z = 0; z < loop.cut.size[2]; z++) {
            for (let x = 0; x < loop.cut.size[0]; x++) {
              obstruct(chunk, point([loop.cut.min[0] + x, loop.cut.min[1] + y, loop.cut.min[2] + z]));
            }
          }
        }
      });
      try {
        const detour = new ScenarioRouteSpace(site);
        expect(detour.sweep(from, through)).toBe(false);
        expect(detour.path(from, to, { steps: true })).toBeDefined();
      } finally {
        stamp.mockRestore();
      }
    },
  );

  it('lets a body that falls into the amalgam pit climb back to the chamber rim', () => {
    // The certificate links only storeys, so the pit's ladder is proved here.
    const site = siteOf();
    const space = new ScenarioRouteSpace(site);
    const service = site.plan.service!;
    const point = (at: Vec3) => placedPoint(service, at);
    const { ladder, upper, lower } = witness.pitClimb;
    const index = service.template.pieces.findIndex((piece) => piece.pos.join(',') === ladder.join(','));
    expect(index).toBeGreaterThanOrEqual(0);
    const link = { ladder: placedPieces(service)[index]!.pos, upper: point(upper), lower: point(lower) };
    const entityAt = (at: Readonly<Vec3>) => {
      space.blocked(Math.floor(at[0]), Math.floor(at[1]), Math.floor(at[2]));
      return space.entities.at(...(at as Vec3));
    };
    const issue = climbCertificate(
      {
        entities: space.entities,
        entityAt,
        clear: (at) => space.clear(at),
        solid: ([x, y, z]) => space.blocked(x, y, z),
        standing: (at) => space.standing(at),
        sweep: (from, to, supported) => space.sweep(from, to, supported),
        connected: (from, to) => space.path(from, to) !== undefined,
      },
      link,
    );
    expect(issue).toBeUndefined();
  });

  it.each(base.composition!.seals.map((_, index) => index))(
    'rejects missing seal %i keycard instead of admitting its bulkheads',
    (index) => {
      const site = siteOf();
      const seal = site.plan.composition!.seals[index]!;
      const atKey = (at: Readonly<Vec3>) => at.every((value, axis) => value === seal.key[axis]);
      if (seal.held) {
        const original = site.furnitureIn.bind(site);
        vi.spyOn(site, 'furnitureIn').mockImplementation((cx, cz) =>
          original(cx, cz).map((spawn) => (atKey(spawn.spec.pos) ? { ...spawn, loot: [], surfaceLoot: [] } : spawn)),
        );
      } else {
        const original = site.lootPointsIn.bind(site);
        vi.spyOn(site, 'lootPointsIn').mockImplementation((cx, cz) =>
          original(cx, cz).filter((point) => !atKey(point.destination)),
        );
      }
      expect(scenarioCertificate(site, ['seals']).issues.map(([path]) => path)).toContain(
        `.composition.seals[${index}]`,
      );
    },
  );

  it('rejects a keycard container that lies behind the seal it opens', () => {
    expectQuietWhenHealthy(['seals'], (path) => path.startsWith('.composition.seals'));
    // Level two's card desk, made to hold level one's card and to open level one's bulkheads, which stand between it and the way in.
    const composition = base.composition!;
    const held = composition.seals.findIndex((seal) => seal.held);
    const desk = composition.seals[held]!;
    const above = composition.seals[held - 1]!;
    const site = siteOf({ ...base, composition: { ...composition, seals: [{ ...desk, doors: above.doors }] } });
    const space = new ScenarioRouteSpace(site);
    space.blocked(...above.doors[0]!);
    const lock = space.entities.at(...above.doors[0]!)!.lock!.id;
    const card = [...registry.items.values()].find((item) => item.key?.lock === lock)!;
    const original = site.furnitureIn.bind(site);
    vi.spyOn(site, 'furnitureIn').mockImplementation((cx, cz) =>
      original(cx, cz).map((spawn) =>
        spawn.spec.pos.every((value, axis) => value === desk.key[axis])
          ? { ...spawn, loot: spawn.loot.map((item) => ({ ...item, type: card.id })) }
          : spawn,
      ),
    );
    expect(scenarioCertificate(site, ['seals']).issues.map(([path]) => path)).toContain('.composition.seals[0]');
  });

  it('rejects a keycard container out of reach of where its taker stands', () => {
    // The desk's taker is sent to level one's card spot, which the way in reaches but which is far from the desk.
    const composition = base.composition!;
    const held = composition.seals.findIndex((seal) => seal.held);
    const { standing } = composition.seals[held - 1]!;
    const seals = composition.seals.map((seal, index) => (index === held ? { ...seal, standing } : seal));
    const site = siteOf({ ...base, composition: { ...composition, seals } });
    expect(scenarioCertificate(site, ['seals']).issues.map(([path]) => path)).toContain(`.composition.seals[${held}]`);
  });

  it("keeps each level's ways down behind its bulkheads until its card, reached through the seals above, is admitted", () => {
    const site = siteOf();
    const space = new ScenarioRouteSpace(site);
    const entry = site.plan.portal!.lower;
    const composition = site.plan.composition!;
    expect(composition.seals.length).toBeGreaterThan(0);
    for (const seal of composition.seals) {
      expect(space.path(entry, seal.standing, { steps: true })).toBeDefined();
      for (const door of seal.doors) {
        space.blocked(...door);
        const definition = space.entities.defOf(space.entities.at(...door)!);
        expect(definition.door).toBeDefined();
        expect(definition.door!.methods).toEqual({});
      }
      const [, level] = seal.doors[0]!;
      const links = [...composition.descents, ...composition.stairs].filter((link) => link.upper[1] === level);
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(space.path(entry, link.upper, { steps: true })).toBeUndefined();
      }
      space.admitLock(space.entities.at(...seal.doors[0]!)!.lock!.id);
      for (const link of links) {
        expect(space.path(entry, link.upper, { steps: true })).toBeDefined();
      }
    }
    expect(scenarioCertificate(site).issues).toEqual([]);
  });

  it('rejects a keyed lot resource whose key route has lost its climb', () => {
    const index = base.composition!.resources.findIndex((resource) => resource.key?.climbs.length);
    const ladder = base.composition!.resources[index]?.key?.climbs[0]?.ladder;
    if (!ladder) {
      throw new Error('Production scenario has no climbed key route');
    }
    const site = siteOf();
    const original = site.furnitureIn.bind(site);
    vi.spyOn(site, 'furnitureIn').mockImplementation((cx, cz) =>
      original(cx, cz).filter(
        ({ spec }) =>
          !(registry.furniture.get(spec.type)?.climbable && spec.pos[0] === ladder[0] && spec.pos[2] === ladder[2]),
      ),
    );
    expect(scenarioLotResourceCertificate(site).issues).toContainEqual([
      `.composition.resources[${index}].key.climbs[0]`,
      expect.stringMatching(COMPOSED_LADDER),
    ]);
  });

  it('rejects a keyed lot resource whose ground key source is missing', () => {
    const site = siteOf();
    const resource = base.composition!.resources.find(
      (candidate) =>
        candidate.key &&
        !site
          .furnitureIn(toChunk(candidate.key.at[0]), toChunk(candidate.key.at[2]))
          .some(({ spec }) => spec.pos.every((value, axis) => value === candidate.key!.at[axis])),
    );
    if (!resource?.key) {
      throw new Error('Production scenario has no ground-keyed lot resource');
    }
    const original = site.lootPointsIn.bind(site);
    vi.spyOn(site, 'lootPointsIn').mockImplementation((cx, cz) =>
      original(cx, cz).filter((point) => !point.destination.every((value, axis) => value === resource.key!.at[axis])),
    );
    expect(scenarioLotResourceCertificate(site).issues.map(([path]) => path)).toContain(
      `.composition.resources[${base.composition!.resources.indexOf(resource)}].key`,
    );
  });

  it("keeps a keyed resource's admitted locks from opening a later unkeyed lot resource's route", () => {
    const keyed = base.composition!.resources.find((resource) => resource.key);
    if (!keyed) {
      throw new Error('Production scenario has no keyed lot resource');
    }
    const { key: _key, ...unkeyed } = keyed;
    const plan: CityPlan = { ...base, composition: { ...base.composition!, resources: [keyed, unkeyed] } };
    // Proving the unkeyed copy unreachable would flood the whole street, so this records the doors each final search
    // starts with instead of running it.
    const lockedOpen: boolean[] = [];
    const original = ScenarioRouteSpace.prototype.path;
    const record = (space: ScenarioRouteSpace): undefined => {
      lockedOpen.push([...space.entities.all].some((entity) => entity.lock?.locked && entity.open));
    };
    const path = vi.spyOn(ScenarioRouteSpace.prototype, 'path').mockImplementation(function (
      this: ScenarioRouteSpace,
      from,
      to,
      options,
    ) {
      return to.join(',') === keyed.standing.join(',') ? record(this) : original.call(this, from, to, options);
    });
    try {
      scenarioLotResourceCertificate(siteOf(plan));
    } finally {
      path.mockRestore();
    }
    // The keyed rack's one search runs with its key's lock open; each later start-foot search runs with it shut.
    expect(lockedOpen.lastIndexOf(true)).toBe(0);
    expect(lockedOpen.indexOf(false)).toBe(1);
  });

  it('rejects a shaft-neighbor obstruction in the final furnished production lab', () => {
    const [descent] = base.composition!.descents;
    if (!descent) {
      throw new Error('Production lab has no descent witness');
    }
    const obstruction: Vec3 = [descent.ladder[0] + 1, descent.ladder[1] + 4, descent.ladder[2]];
    const phases = ROUTED_PHASES.concat('seals');
    expectQuietWhenHealthy(phases, (path) => path === '.composition.descents[0]');
    const result = scenarioCertificate(new ObstructedSite(obstruction), phases);
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
      const phases = ROUTED_PHASES.concat('seals', 'objective');
      expectQuietWhenHealthy(phases, (path) => path === '.composition.objectiveFace');
      const result = scenarioCertificate(site, phases);
      expect(result.issues.map(([path]) => path)).toContain('.composition.objectiveFace');
    } finally {
      stamp.mockRestore();
    }
  });

  it('loads an obstructing furniture anchor across a chunk boundary before caching body clearance', () => {
    const own = buildRegistry([
      {
        source: 'owned-boundary.json',
        data: {
          furnitureMaterials: fixtureMaterials(),
          sounds: fixtureSounds(),
          furniture: [
            {
              id: 'boundary_box',
              name: 'Boundary box',
              size: [3, 4, 2],
              color: '#aaaaaa',
              massKg: 1,
              breach: fixtureBreach(),
              material: FIXTURE_MATERIAL,
            },
          ],
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
      const phases = ['start' as CertificatePhase].concat(ROUTED_PHASES, 'seals', 'underground');
      expectQuietWhenHealthy(phases, (path) => path.startsWith('.city.underground'));
      const result = scenarioCertificate(site, phases);
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
    expectQuietWhenHealthy(ROUTED_PHASES.concat('resources'), (path) => path === '.composition.resources[0]');
    const result = scenarioCertificate(
      new ObstructedSite(base.composition!.resources[0]!.standing),
      ROUTED_PHASES.concat('resources'),
    );
    expect(result.issues.some(([path]) => path === '.composition.resources[0]')).toBe(true);
  });

  it('rejects cyclic fixed keys behind their mutually dependent locked portals', () => {
    expectQuietWhenHealthy(
      ROUTED_PHASES.concat('resources'),
      (path) => path === '.portal' || path.startsWith('.composition.resources'),
    );
    const result = scenarioCertificate(cyclicSite(registry, base, scale), ROUTED_PHASES.concat('resources'));
    expect(result.issues.some(([path]) => path === '.portal')).toBe(true);
    expect(result.issues.some(([path]) => path.startsWith('.composition.resources'))).toBe(true);
  });

  it('rejects a missing clue instead of treating two copies of metadata as independent sources', () => {
    const missing = base.composition!.leads[0]!;
    expectQuietWhenHealthy(['start', 'leads'], (path) => path === '.composition.leads');
    const result = scenarioCertificate(
      siteOf({ ...base, placements: base.placements.filter((placement) => placement !== missing) }),
      ['start', 'leads'],
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

it('resolves production service ownership, furnished loot and terrain stamps independently of chunk request order', () => {
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
});

it('walks closed lids, opens descents, returns alive and activates the objective from the goal-face save', () => {
  traverseScenario(siteOf(), profile, scale);
});

describe('lab threat by depth', () => {
  // Follow the scenario's authored storeys, including rebuilt levels outside the grid kit.
  const { storeys } = profile.composition!;
  const stack = lab.mapAssemblies.find((assembly) =>
    storeys.every((storey) => assembly.slots.some((slot) => slot.id === storey.id)),
  )!;
  const storeySlots = stack.slots.filter((slot) => storeys.some((storey) => storey.id === slot.id));
  // A threat slot's pieces carry the marker chance; its weighted choices carry the zombie type.
  const markerChance = new Map(
    lab.mapPieces.map((piece) => [
      piece.id,
      Object.values(piece.palette).reduce((sum, entry) => sum + ('chance' in entry ? (entry.chance ?? 0) : 0), 0),
    ]),
  );
  const expectedMarkers = (storeyId: string): number =>
    lab.mapAssemblies
      .find((assembly) => assembly.id === storeyId)!
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
      lab.mapPieces
        .filter((piece) =>
          Object.values(piece.palette).some(
            (entry) => typeof entry !== 'string' && 'spawn' in entry && entry.spawn === 'amalgam',
          ),
        )
        .map((piece) => piece.id),
    );
    const storeysWithAmalgam = lab.mapAssemblies.filter((assembly) =>
      assembly.slots.some((slot) => slot.choices?.some((choice) => amalgamPieces.has(choice.ref.id))),
    );
    const lowest = storeySlots.reduce((low, slot) => (slot.at[1] < low.at[1] ? slot : low));
    expect(storeysWithAmalgam.map((assembly) => assembly.id)).toEqual([lowest.choices?.[0]?.ref.id]);
  });
});
