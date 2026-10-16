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

it('honours the authored start cell and refuses a cell outside the street grid', () => {
  const own = structuredClone(profile);
  const cell = plan.candidates[0]!;
  own.composition!.start.cell = [...cell];
  expect(scenarioStartIssues(registry, own)).toEqual([]);
  const moved = buildCityPlan({ seed: 9, registry, floor: plan.floor, grid, scenario: own });
  expect(moved.composition!.start.placement.origin).not.toEqual(start.placement.origin);
  expect(moved.candidates).not.toContainEqual(cell);
  expect(scenarioCertificate(new CitySite(9, registry, scale, moved)).issues).toEqual([]);
  own.composition!.start.cell = [grid.blocksX, grid.blocksZ];
  expect(scenarioStartIssues(registry, own).some(([path]) => path === '.composition.start.cell')).toBe(true);
});

it('refuses a start roof that can clear the wall, with or without a ring', () => {
  const own = structuredClone(profile);
  const template = structuredClone(registry.mapAssemblies.get(own.composition!.start.template)!);
  template.id = 'fixture_tall_start';
  template.size[1] = 1000;
  const fixtures = { ...registry, mapAssemblies: new Map(registry.mapAssemblies).set(template.id, template) };
  own.composition!.start.template = template.id;
  own.composition!.start.cell = [-own.city.blocksX, -own.city.blocksZ];
  for (const ring of [profile.city.ring, undefined]) {
    own.city.ring = ring;
    own.composition!.start.cell = [-own.city.blocksX, -own.city.blocksZ];
    expect(scenarioPlanIssues(fixtures, own).some(([path]) => path === '.composition.start.template')).toBe(true);
    template.size[1] = registry.mapAssemblies.get(profile.composition!.start.template)!.size[1];
    own.composition!.start.cell = [...profile.composition!.start.cell];
    expect(scenarioPlanIssues(fixtures, own).filter(([path]) => path.startsWith('.composition.start'))).toEqual([]);
    template.size[1] = 1000;
  }
});

it('refuses a start overtopped by a building in either city pool', () => {
  for (const ring of [false, true]) {
    const own = structuredClone(profile);
    const poolId = ring ? own.city.ring!.pool : own.city.pool;
    const pool = structuredClone(registry.mapPools.get(poolId)!);
    const { ref: buildingRef } = pool.choices.find(({ ref }) => ref.kind === 'assembly')!;
    const building = structuredClone(registry.mapAssemblies.get(buildingRef.id)!);
    building.id = 'fixture_overtopping_building';
    pool.id = 'fixture_skyline';
    pool.choices = [{ ref: { kind: 'assembly', id: building.id }, weight: 1 }];
    if (ring) {
      own.city.ring!.pool = pool.id;
    } else {
      own.city.pool = pool.id;
    }
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
  const oldLead = plan.composition!.leads[0]!;
  const movedLead = {
    ...oldLead,
    origin: [oldLead.origin[0], oldLead.origin[1], oldLead.origin[2] + grid.street * 2] as Vec3,
  };
  const ownPlan = {
    ...plan,
    placements: plan.placements.map((placement) => (placement === oldLead ? movedLead : placement)),
    composition: {
      ...plan.composition!,
      leads: plan.composition!.leads.map((placement) => (placement === oldLead ? movedLead : placement)),
      lootSources: plan.composition!.lootSources.map((source) =>
        source.placement === oldLead ? { ...source, placement: movedLead } : source,
      ),
    },
  };
  const result = scenarioCertificate(new ObstructedStartSite(walls, ownPlan));
  expect(result.space.standing([x, y, z])).toBe(true);
  expect(result.space.path([x, y, z], start.descents[0]!.lower)).toBeUndefined();
  expect(result.issues).toEqual([]);
});
