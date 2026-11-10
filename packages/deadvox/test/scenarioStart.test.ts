import { buildCityPlan, cityGridOf, scenarioPlanIssues } from '@skelly/engine/internal/core/cityPlan.ts';
import { scenarioCertificate, scenarioStartCertificate } from '@skelly/engine/internal/core/scenarioCertificate.ts';
import { type StartDescent, scenarioStartIssues } from '@skelly/engine/internal/core/scenarioStart.ts';
import type { StartDef } from '@skelly/engine/internal/core/schema/starts.ts';
import { ContentFileSchema } from '@skelly/engine/internal/core/schema.ts';
import { startIssues } from '@skelly/engine/internal/core/startIssues.ts';
import { type BlockBox, stampChunk } from '@skelly/engine/internal/core/structure.ts';
import { templateReachableStandingPositions } from '@skelly/engine/internal/core/templateSpatial.ts';
import { type Chunk, CitySite, makeScale, type Vec3 } from '@skelly/engine/world';
import { parse } from 'valibot';
import { expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { defaultStartOf } from './fixtures/scenario.ts';

const registry = baseRegistry();
const profile = [...registry.scenarios.values()].find((row) => row.composition)!;
const grid = cityGridOf(registry, profile.city);
const placement = defaultStartOf(registry, profile);
const plan = buildCityPlan({
  seed: 9,
  registry,
  floor: 64,
  grid,
  scenario: profile,
  start: placement,
});
const start = plan.composition!.start!;
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
  const [cellX, cellZ] = placement.cell;
  expect(plan.candidates.some(([x, z]) => x === cellX && z === cellZ)).toBe(false);
  const built = start.placement;
  expect(plan.placements).toContain(built);
  expect(built.origin[0]).toBeGreaterThanOrEqual(plan.core.x0);
  expect(built.origin[2]).toBeGreaterThanOrEqual(plan.core.z0);
  expect(built.origin[0] + built.template.size[0]).toBeLessThanOrEqual(plan.core.x1);
  expect(built.origin[2] + built.template.size[2]).toBeLessThanOrEqual(plan.core.z1);
});

it('keeps every start-storey container reachable from the roof through supported steps', () => {
  const { template } = start.placement;
  const reached = templateReachableStandingPositions(registry, template, {
    entrance: placement.spawn,
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

it('refuses start reservations that overlap authored lots or leave the street grid', () => {
  const own = structuredClone(placement);
  const cell = plan.candidates[0]!;
  own.cell = [...cell];
  expect(scenarioStartIssues(registry, profile, own)).toEqual([]);
  expect(() => buildCityPlan({ seed: 9, registry, floor: plan.floor, grid, scenario: profile, start: own })).toThrow(
    'overlaps reserved building',
  );
  own.cell = [grid.blocksX, grid.blocksZ];
  expect(scenarioStartIssues(registry, profile, own).some(([path]) => path === '.placement.cell')).toBe(true);
});

const startRow = [...registry.starts.values()].find((row) => row.defaultForSite && row.site === profile.id)!;
const withStart = (row: StartDef) => ({ ...registry, starts: new Map([[row.id, row]]) });

it('reports a misplaced start on its own start row, not on the scenario it starts on', () => {
  const own = structuredClone(startRow);
  own.placement!.cell = [grid.blocksX, grid.blocksZ];
  const fixtures = withStart(own);
  expect(startIssues(fixtures)).toContainEqual({
    id: own.id,
    path: '.placement.cell',
    message: 'start cell must lie inside the street grid',
  });
  expect(scenarioPlanIssues(fixtures, profile)).toEqual([]);
});

it('requires a placement on every start of a composed scenario and refuses one elsewhere', () => {
  const { placement: _placement, ...bare } = structuredClone(startRow);
  expect(startIssues(withStart(bare)).filter(({ path }) => path === '.placement')).toEqual([
    { id: bare.id, path: '.placement', message: expect.stringContaining(profile.id) },
  ]);
  const elsewhere = [...registry.starts.values()].find((row) => !registry.scenarios.get(row.site)?.composition)!;
  expect(startIssues(withStart({ ...elsewhere, placement })).filter(({ path }) => path === '.placement')).toHaveLength(
    1,
  );
});

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
    const skyline = () =>
      scenarioStartIssues(fixtures, own, placement).filter(([path]) => path === '.placement.template');
    expect(skyline()).toEqual([]);
    building.size[1] = start.placement.template.size[1] + 1;
    expect(skyline().length).toBeGreaterThan(0);
  }
});

it('rejects an unsupported roof-route target without rejecting its reachable sibling', () => {
  const definition = structuredClone(placement);
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
  const paths = scenarioStartIssues(registry, profile, definition).map(([path]) => path);
  expect(paths).toContain('.placement.descents[1]');
  expect(paths).not.toContain('.placement.descents[0]');
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
    starts: [
      {
        id: 'fixture_default_minimum',
        site: profile.id,
        placement: { ...placement, minimumOpenDescents: undefined },
        kit: [],
        wounds: [],
        skills: {},
        recipes: [],
      },
    ],
  });
  const minimum = parsed.starts![0]!.placement!.minimumOpenDescents;
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
