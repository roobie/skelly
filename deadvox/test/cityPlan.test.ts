import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import { buildCityPlan, servicePlacement } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK, toChunk, type Vec3 } from '../src/core/coords.ts';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { makeScale } from '../src/core/scale.ts';
import type { HordeSpawn, ZombieSpawn } from '../src/core/site.ts';
import { compileTemplate, footprint } from '../src/core/templates.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';

const profile = fixtureScenario();
const { registry, issues } = buildRegistry(fixtureScenarioSources(profile));
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const scale = makeScale(0.5);
const floor = CHUNK;
const planned = (pool = profile.city.templates) =>
  buildCityPlan({
    seed: 73,
    registry,
    floor,
    grid: { ...profile.city, templates: pool },
    maxStoreys: 4,
    scenario: profile,
  });
const mod = (value: number, period: number) => ((value % period) + period) % period;

const chunkCells = (plan: ReturnType<typeof planned>): Vec3[] => {
  const cells = new Map<string, Vec3>();
  for (const placement of plan.placements) {
    const [width, depth] = footprint(placement);
    for (let cz = toChunk(placement.origin[2]); cz <= toChunk(placement.origin[2] + depth - 1); cz++) {
      for (
        let cy = toChunk(placement.origin[1]);
        cy <= toChunk(placement.origin[1] + placement.template.size[1] - 1);
        cy++
      ) {
        for (let cx = toChunk(placement.origin[0]); cx <= toChunk(placement.origin[0] + width - 1); cx++) {
          cells.set(`${cx},${cy},${cz}`, [cx, cy, cz]);
        }
      }
    }
  }
  return [...cells.values()];
};

const generated = (reverse: boolean) => {
  const plan = planned();
  const site = new CitySite(73, registry, scale, plan);
  const cells = chunkCells(plan);
  if (reverse) {
    cells.reverse();
  }
  const chunks = new Map<string, Uint16Array>();
  for (const [cx, cy, cz] of cells) {
    const chunk = new Chunk(cx, cy, cz);
    site.stamp(chunk);
    chunks.set(`${cx},${cy},${cz}`, chunk.toArray());
  }
  const columns = new Map(cells.map(([cx, , cz]) => [`${cx},${cz}`, [cx, cz] as const]));
  const furniture = [...columns.values()]
    .flatMap(([cx, cz]) => site.furnitureIn(cx, cz))
    .sort((a, b) => a.spec.pos.join(',').localeCompare(b.spec.pos.join(',')));
  return { chunks, furniture };
};

describe('one finished city plan', () => {
  it('supplies ordinary wanderers and hordes even when city buildings have no spawn markers', () => {
    const native = BUNDLED_CONTENT.registry;
    const scenario = [...native.scenarios.values()].find((candidate) => candidate.composition)!;
    const fixture = registry.templates.get('fixture_house')!;
    const solid = native.blocks.find((block) => block.solid)!.id;
    const cityRegistry = {
      ...native,
      templates: new Map([...native.templates, [fixture.id, { ...fixture, palette: { '=': solid, C: solid } }]]),
    };
    const site = new GauntletSite({
      seed: 73,
      registry: cityRegistry,
      scale,
      scenario: { ...scenario, city: { ...scenario.city, templates: [fixture.id] } },
    });
    const spawns: ZombieSpawn[] = [];
    const hordes: HordeSpawn[] = [];
    for (let cz = toChunk(site.bounds.z0); cz <= toChunk(site.bounds.z1); cz++) {
      for (let cx = toChunk(site.bounds.x0); cx <= toChunk(site.bounds.x1); cx++) {
        spawns.push(...site.zombiesIn(cx, cz));
        hordes.push(...(site.hordesIn?.(cx, cz) ?? []));
      }
    }
    expect(spawns.length).toBeGreaterThan(0);
    expect(hordes.length).toBeGreaterThan(0);
    expect(hordes.every((horde) => horde.members > 0)).toBe(true);
  });

  it('fills paired inner banks while keeping alleys, perimeter gates and the service reserve clear', () => {
    const scenario = fixtureScenario();
    scenario.city = {
      ...scenario.city,
      blockX: 40,
      blockZ: 40,
      rows: 4,
      perimeter: { block: 'fixture_solid', height: 6, thickness: 2 },
    };
    const admitted = buildRegistry(fixtureScenarioSources(scenario));
    expect(admitted.issues).toEqual([]);
    const plan = buildCityPlan({ seed: 73, registry: admitted.registry, floor, grid: scenario.city, scenario });
    const normal = plan.placements.filter((placement) => placement !== plan.service);
    const banks = new Set(
      normal
        .filter((placement) => placement.origin[0] > 0 && placement.origin[2] > 0)
        .map((placement) => placement.origin[2]),
    );
    expect(banks.size).toBe(scenario.city.rows);
    const site = new CitySite(73, admitted.registry, scale, plan);
    const alleyZ =
      scenario.city.street +
      scenario.city.pad +
      2 * Math.floor((scenario.city.blockZ - 2 * scenario.city.pad - scenario.city.street) / scenario.city.rows!);
    expect(site.surface.top(scenario.city.street + scenario.city.pad + 2, alleyZ)).toBe(
      admitted.registry.blockIds.get('asphalt'),
    );
    expect(plan.structures.length).toBeGreaterThan(0);
    const occupied = (point: Vec3) =>
      plan.structures.some(({ min, max }) => point.every((value, axis) => value >= min[axis]! && value < max[axis]!));
    for (const z of [plan.bounds.z0 - 1, plan.bounds.z1]) {
      expect(occupied([plan.spawn[0], floor + 1, z])).toBe(false);
      expect(occupied([-scenario.city.street, floor + 1, z])).toBe(true);
    }
    const [width, depth] = footprint(plan.service!);
    expect(
      normal.every((placement) => {
        const [w, d] = footprint(placement);
        return (
          placement.origin[0] + w <= plan.service!.origin[0] ||
          placement.origin[0] >= plan.service!.origin[0] + width ||
          placement.origin[2] + d <= plan.service!.origin[2] ||
          placement.origin[2] >= plan.service!.origin[2] + depth
        );
      }),
    ).toBe(true);
  });

  it('reserves each candidate/turn class inside the apron and keeps ordinary rows out of street space', () => {
    const plan = planned();
    expect(plan.candidates.length).toBeGreaterThan(0);
    expect(plan.candidates.some(([i, j]) => i === 0 && j === 0)).toBe(false);
    const service = compileTemplate(registry, registry.templates.get(profile.serviceTemplate)!);
    const grid = profile.city;
    const pitchX = grid.street + grid.blockX;
    const pitchZ = grid.street + grid.blockZ;
    for (const cell of plan.candidates) {
      for (const turn of [0, 1, 2, 3] as const) {
        const placement = servicePlacement({ template: service, floor, grid, cell, turn });
        const [width, depth] = footprint(placement);
        expect(placement.origin[0]).toBeGreaterThanOrEqual(cell[0] * pitchX + grid.street + grid.pad);
        expect(placement.origin[0] + width).toBeLessThanOrEqual((cell[0] + 1) * pitchX - grid.pad);
        expect(placement.origin[2] + depth).toBeLessThanOrEqual((cell[1] + 1) * pitchZ - grid.pad);
        expect(placement.origin[1] + service.groundLayer!).toBe(floor);
      }
    }
    expect(plan.service).toBeDefined();
    expect(plan.portal).toBeDefined();
    expect(plan.portal!.envelope.min[1]).toBeLessThanOrEqual(plan.portal!.lower[1] - 1);
    expect(plan.portal!.envelope.max[1]).toBeGreaterThan(plan.portal!.upper[1]);
    expect(plan.placements.length).toBeGreaterThan(1);
    for (const placement of plan.placements) {
      if (placement !== plan.service) {
        expect(profile.city.templates.includes(placement.template.id)).toBe(true);
      }
      const [width, depth] = footprint(placement);
      expect(mod(placement.origin[0], pitchX)).toBeGreaterThanOrEqual(grid.street + grid.pad);
      expect(mod(placement.origin[0], pitchX) + width).toBeLessThanOrEqual(pitchX - grid.pad);
      expect(mod(placement.origin[2], pitchZ)).toBeGreaterThanOrEqual(grid.street + grid.pad);
      expect(mod(placement.origin[2], pitchZ) + depth).toBeLessThanOrEqual(pitchZ - grid.pad);
    }
    expect(mod(plan.spawn[0], pitchX)).toBeLessThan(grid.street);
    expect(mod(plan.spawn[2], pitchZ)).toBeLessThan(grid.street);
    const site = new CitySite(73, registry, scale, plan);
    expect(site.surface.height(plan.spawn[0], plan.spawn[2], floor + 9)).toBe(floor);
    expect(site.surface.top(plan.spawn[0], plan.spawn[2])).toBe(registry.blockIds.get('asphalt'));
  });

  it('chooses the service block/turn independently of incidental template selection', () => {
    const forPool = (templates: string[]) =>
      buildCityPlan({ seed: 74, registry, floor, grid: { ...profile.city, templates }, scenario: profile });
    const first = forPool(profile.city.templates);
    const varied = forPool(['fixture_small_house']);
    expect(varied.placements.some((placement) => placement.template.id === 'fixture_small_house')).toBe(true);
    expect(varied.serviceBlock).toEqual(first.serviceBlock);
    expect(varied.service?.turn).toEqual(first.service?.turn);
    expect(varied.portal).toEqual(first.portal);
    expect(Object.isFrozen(first.placements)).toBe(true);
    expect(first.placements.every((placement) => Object.isFrozen(placement.origin))).toBe(true);
  });

  it('stamps all vertical and horizontal chunks plus furniture identically in reverse request order', () => {
    const first = generated(false);
    const reversed = generated(true);
    expect(first.chunks.size).toBeGreaterThan(1);
    expect([...first.chunks.values()].some((blocks) => blocks.some((block) => block !== 0))).toBe(true);
    expect(reversed.chunks.size).toBe(first.chunks.size);
    for (const [key, blocks] of first.chunks) {
      expect(Buffer.from(reversed.chunks.get(key)!.buffer).equals(Buffer.from(blocks.buffer)), key).toBe(true);
    }
    expect(first.furniture.length).toBeGreaterThan(0);
    expect(reversed.furniture).toEqual(first.furniture);
  });
});
