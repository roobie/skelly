import { parse } from 'valibot';
import { expect, it } from 'vitest';
import type { Chunk } from '../src/core/chunk.ts';
import { buildCityPlan, cityGridOf, scenarioPlanIssues } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { scenarioCertificate, scenarioStartCertificate } from '../src/core/scenarioCertificate.ts';
import { type StartDescent, scenarioStartIssues } from '../src/core/scenarioStart.ts';
import { ContentFileSchema } from '../src/core/schema.ts';
import { type BlockBox, stampChunk } from '../src/core/structure.ts';
import { templateReachableStandingPositions } from '../src/core/templateSpatial.ts';
import { gameHours } from '../src/core/time.ts';
import { baseRegistry } from './baseRegistry.ts';
import { GAUNTLET_SITE_MS } from './siteTimeouts.ts';

const registry = baseRegistry();
const profile = [...registry.scenarios.values()].find((row) => row.composition)!;
const grid = cityGridOf(registry, profile.city);
const plan = buildCityPlan({ seed: 9, registry, floor: 64, grid, scenario: profile });
const { start } = plan.composition!;
const scale = makeScale(0.5);
const obstruction = (at: Readonly<Vec3>) => ({
  min: at.map(Math.floor) as Vec3,
  max: at.map((value) => Math.floor(value) + 1) as Vec3,
  block: registry.blockIds.get('stone')!,
});
class ObstructedStartSite extends CitySite {
  readonly obstructions: readonly BlockBox[];
  constructor(obstructions: readonly BlockBox[], ownPlan = plan) {
    super(9, registry, scale, ownPlan);
    this.obstructions = obstructions;
  }
  override stamp(chunk: Chunk): void {
    super.stamp(chunk);
    stampChunk(chunk, this.obstructions);
  }
}
const certificate = (
  descents: readonly StartDescent[],
  minimumOpenDescents: number,
  blocked: readonly StartDescent[] = [],
) =>
  scenarioStartCertificate(
    new ObstructedStartSite(
      blocked.map((descent) => obstruction(descent.lower)),
      {
        ...plan,
        composition: { ...plan.composition!, start: { ...start, descents, minimumOpenDescents } },
      },
    ),
  );

it('admits the authored roof spawn and keeps its reserved block inside the street grid', () => {
  expect(scenarioPlanIssues(registry, profile)).toEqual([]);
  expect(start.spawn[1]).toBeGreaterThan(plan.floor + 1);
  expect(plan.spawn).toEqual(start.spawn);
  const [cellX, cellZ] = profile.composition!.start.cell;
  expect(plan.candidates.some(([x, z]) => x === cellX && z === cellZ)).toBe(false);
  const { placement } = start;
  expect(plan.placements).toContain(placement);
  expect(placement.origin[0]).toBeGreaterThanOrEqual(plan.core.x0);
  expect(placement.origin[2]).toBeGreaterThanOrEqual(plan.core.z0);
  expect(placement.origin[0] + placement.template.size[0]).toBeLessThanOrEqual(plan.core.x1);
  expect(placement.origin[2] + placement.template.size[2]).toBeLessThanOrEqual(plan.core.z1);
});

it('keeps every start-storey container reachable from the roof through supported steps', () => {
  const { template } = start.placement;
  const reached = templateReachableStandingPositions(registry, template, {
    entrance: profile.composition!.start.spawn,
  });
  expect(template.access!.storeys.length).toBeGreaterThan(0);
  for (const { floor } of template.access!.storeys) {
    const containers = template.pieces.filter(
      (piece) => piece.pos[1] === floor && registry.furniture.get(piece.furniture)!.container,
    );
    expect(containers.length).toBeGreaterThan(0);
    for (const piece of containers) {
      const [x, , z] = piece.pos;
      const [width, , depth] = piece.size;
      const beside = reached.some(
        ([px, py, pz]) =>
          py === floor &&
          ((px >= x && px <= x + width && (Math.abs(pz - z) <= 1 || Math.abs(pz - z - depth) <= 1)) ||
            (pz >= z && pz <= z + depth && (Math.abs(px - x) <= 1 || Math.abs(px - x - width) <= 1))),
      );
      expect(beside, `${piece.furniture} at ${piece.pos} needs a reachable side`).toBe(true);
    }
  }
});

it(
  'refuses start reservations that overlap authored lots or leave the street grid',
  () => {
    const own = structuredClone(profile);
    const cell = plan.candidates[0]!;
    own.composition!.start.cell = [...cell];
    expect(scenarioStartIssues(registry, own)).toEqual([]);
    expect(() => buildCityPlan({ seed: 9, registry, floor: plan.floor, grid, scenario: own })).toThrow(
      'overlaps reserved building',
    );
    own.composition!.start.cell = [grid.blocksX, grid.blocksZ];
    expect(scenarioStartIssues(registry, own).some(([path]) => path === '.composition.start.cell')).toBe(true);
  },
  GAUNTLET_SITE_MS,
);

it('refuses a start overtopped by a fixed or pooled authored building', () => {
  for (const pooled of [false, true]) {
    const own = structuredClone(profile);
    const pool = structuredClone(registry.mapPools.get(own.city.pool)!);
    const { ref: buildingRef } = pool.choices.find(({ ref }) => ref.kind === 'assembly')!;
    const building = structuredClone(registry.mapAssemblies.get(buildingRef.id)!);
    building.id = 'fixture_overtopping_building';
    pool.id = 'fixture_skyline';
    pool.choices = [{ ref: { kind: 'assembly', id: building.id }, weight: 1 }];
    own.city.lots = [
      {
        id: 'fixture_skyline_lot',
        position: [0, 0],
        size: [18, 16],
        turn: 0,
        source: pooled ? { kind: 'pool', id: pool.id } : { kind: 'assembly', id: building.id },
      },
    ];
    const fixtures = {
      ...registry,
      mapAssemblies: new Map(registry.mapAssemblies).set(building.id, building),
      mapPools: new Map(registry.mapPools).set(pool.id, pool),
    };
    const startIssues = () =>
      scenarioStartIssues(fixtures, own).filter(([path]) => path === '.composition.start.template');
    expect(startIssues()).toEqual([]);
    building.size[1] = start.placement.template.size[1] + 1;
    expect(startIssues().length).toBeGreaterThan(0);
  }
});

it('rejects an unsupported roof-route target without rejecting its reachable sibling', () => {
  const own = structuredClone(profile);
  const definition = own.composition!.start;
  const upper: Vec3 = [...definition.spawn];
  const unsupported: Vec3 = [upper[0], start.placement.template.size[1] - 1, upper[2]];
  const drop = (point: Vec3) => ({
    kind: 'drop' as const,
    upper: point,
    edge: point,
    landing: [point[0], point[1] - 1, point[2]] as Vec3,
    lower: definition.spawn,
  });
  definition.descents = [drop(upper), drop(unsupported)];
  definition.minimumOpenDescents = 1;
  const paths = scenarioStartIssues(registry, own).map(([path]) => path);
  expect(paths).toContain('.composition.start.descents[1]');
  expect(paths).not.toContain('.composition.start.descents[0]');
});

for (const descent of start.descents) {
  it(`proves the authored ${descent.kind} way down from the roof, not just its foot`, () => {
    expect(certificate([descent], 1).issues).toEqual([]);
    expect(
      certificate([descent], 1, [descent]).issues.some(([path]) => path.startsWith('.composition.start.descents')),
    ).toBe(true);
  });
}

it('rejects a drop that would require walking on air before reaching its landing', () => {
  const drop = start.descents.find((descent) => descent.kind === 'drop');
  expect(drop).toBeDefined();
  if (drop?.kind !== 'drop') {
    throw new Error('Missing drop fixture');
  }
  const remoteEdge = { ...drop, upper: start.spawn };
  expect(
    Math.hypot(remoteEdge.edge[0] - remoteEdge.upper[0], remoteEdge.edge[2] - remoteEdge.upper[2]),
  ).toBeGreaterThan(1);
  expect(certificate([remoteEdge], 1).issues.some(([path]) => path === '.composition.start.descents')).toBe(true);
});

it('keeps a choice when one way down is blocked but rejects a single remaining exit', () => {
  const parsed = parse(ContentFileSchema, {
    scenarios: [
      {
        ...profile,
        outbreakAgeGameHours: profile.outbreakAgeGameHours / gameHours(1),
        composition: {
          ...profile.composition!,
          start: { ...profile.composition!.start, minimumOpenDescents: undefined },
        },
      },
    ],
  });
  const minimum = parsed.scenarios![0]!.composition!.start.minimumOpenDescents;
  expect(start.descents.length).toBeGreaterThan(minimum);
  expect(minimum).toBeGreaterThan(1);
  expect(certificate(start.descents, minimum, start.descents.slice(0, 1)).issues).toEqual([]);
  expect(
    certificate(start.descents, minimum, start.descents.slice(1)).issues.some(
      ([path]) => path === '.composition.start.descents',
    ),
  ).toBe(true);
});

it('roots public leads at reached roof exits even when the old street spawn is sealed off', () => {
  const x = grid.street / 2;
  const z = grid.street / 2;
  const y = plan.floor + 1;
  const block = registry.blockIds.get('stone')!;
  const walls = [
    { min: [x - 2, y, z - 2], max: [x - 1, y + 5, z + 2], block },
    { min: [x + 1, y, z - 2], max: [x + 2, y + 5, z + 2], block },
    { min: [x - 1, y, z - 2], max: [x + 1, y + 5, z - 1], block },
    { min: [x - 1, y, z + 1], max: [x + 1, y + 5, z + 2], block },
  ].map((wall) => ({ ...wall, min: wall.min as Vec3, max: wall.max as Vec3 }));
  const result = scenarioCertificate(new ObstructedStartSite(walls, plan), ['start', 'leads']);
  expect(result.space.standing([x, y, z])).toBe(true);
  expect(result.space.path([x, y, z], start.descents[0]!.lower)).toBeUndefined();
  expect(result.issues).toEqual([]);
});
