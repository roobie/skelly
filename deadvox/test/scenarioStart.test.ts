import { parse } from 'valibot';
import { expect, it } from 'vitest';
import type { Chunk } from '../src/core/chunk.ts';
import { buildCityPlan, cityGridOf, scenarioPlanIssues } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { scenarioCertificate } from '../src/core/scenarioCertificate.ts';
import type { StartDescent } from '../src/core/scenarioStart.ts';
import { ContentFileSchema } from '../src/core/schema.ts';
import { type BlockBox, stampChunk } from '../src/core/structure.ts';
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
  scenarioCertificate(
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
  expect(plan.candidates.some(([x, z]) => x === 0 && z === 0)).toBe(false);
  const { placement } = start;
  expect(plan.placements).toContain(placement);
  expect(placement.origin[0]).toBeGreaterThanOrEqual(plan.core.x0);
  expect(placement.origin[2]).toBeGreaterThanOrEqual(plan.core.z0);
  expect(placement.origin[0] + placement.template.size[0]).toBeLessThanOrEqual(plan.core.x1);
  expect(placement.origin[2] + placement.template.size[2]).toBeLessThanOrEqual(plan.core.z1);
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
