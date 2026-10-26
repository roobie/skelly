import { expect, it } from 'vitest';
import type { Chunk } from '../src/core/chunk.ts';
import { buildCityPlan, cityGridOf } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { terrainShapeOf } from '../src/core/sitePalette.ts';
import { footprint } from '../src/core/templates.ts';
import { generateChunk } from '../src/core/worldgen.ts';
import { BLUEPRINTS } from '../src/vehicles/catalogue.ts';
import { startupContent } from './baseRegistry.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureMaterials, fixtureSounds } from './economyFixtures.ts';

const { registry, issues } = startupContent();

const streetCars = (seed: number) => {
  const scenario = [...registry.scenarios.values()].find(({ city }) => city.streetProps?.length)!;
  const grid = cityGridOf(registry, scenario.city);
  const pool = new Set(grid.streetProps!.flatMap((id) => registry.mapPools.get(id)!.choices.map(({ ref }) => ref.id)));
  const plan = buildCityPlan({ seed, registry, grid, floor: 0 });
  return plan.placements.filter(({ template }) => pool.has(template.id)).map(({ template }) => template.id);
};

const mod = (value: number, period: number) => ((value % period) + period) % period;

const look = (templateId: string) => registry.furniture.get(templateId)!.vehicle!;

const fixtureCar = { blueprint: 'rover', body: '#112233', dirt: 0.5, removed: [] as string[], solidFill: 0.4 };
const checkCar = (override: Partial<typeof fixtureCar>, size: [number, number, number] = [4, 4, 9]) => {
  const data: ContentFile = {
    furnitureMaterials: fixtureMaterials(),
    sounds: fixtureSounds(),
    furniture: [
      {
        id: 'fixture_car',
        name: 'Car',
        size,
        color: '#5b605c',
        vehicle: { ...fixtureCar, ...override },
        breach: fixtureBreach(),
        material: FIXTURE_MATERIAL,
      },
    ],
  };
  return buildRegistry([{ source: 'fixture-car.json', data }]).issues;
};

it('street car procedural variants', () => {
  expect(issues).toEqual([]);
  const scenario = [...registry.scenarios.values()].find(({ city }) => city.streetProps?.length)!;
  const poolIds = scenario.city.streetProps!.flatMap((id) =>
    registry.mapPools.get(id)!.choices.map(({ ref }) => ref.id),
  );
  // Each draw plans a whole city, which is the test's whole cost: one seed's many cars show variation, and its repeat shows determinism.
  const draws = [streetCars(1)];
  for (const ids of draws) {
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => poolIds.includes(id))).toBe(true);
  }
  const looks = draws.flat().map((id) => JSON.stringify(look(id)));
  expect(new Set(looks).size).toBeGreaterThan(1);
  const field = (pick: (vehicle: ReturnType<typeof look>) => unknown) =>
    new Set(draws.flat().map((id) => JSON.stringify(pick(look(id)))));
  expect(field((vehicle) => vehicle.body).size).toBeGreaterThan(1);
  expect(field((vehicle) => vehicle.dirt).size).toBeGreaterThan(1);
  expect(field((vehicle) => vehicle.removed).size).toBeGreaterThan(1);
  expect(streetCars(1)).toEqual(draws[0]);
});

// An item template is a floor pad plus furniture; a pad that stamps its own block shows as a patch on the street.
it('keeps the street surface under every placed item standing on a street cell', () => {
  const scenario = [...registry.scenarios.values()].find(({ city }) => city.streetProps?.length)!;
  const grid = cityGridOf(registry, scenario.city);
  const plan = buildCityPlan({ seed: 1, registry, grid, floor: 0, scenario });
  const scale = makeScale(0.5);
  const site = new CitySite(1, registry, scale, plan);
  const terrain = {
    seed: 1,
    shape: terrainShapeOf(registry),
    scale,
    surface: site.surface,
    blocks: { grass: 1000, dirt: 1001, rock: 1002, sand: 1003, water: 1004 },
  };
  const mismatches: string[] = [];
  let checked = 0;
  for (const placement of plan.placements) {
    const { template, origin } = placement;
    const [w, d] = footprint(placement);
    const cells = Array.from(
      { length: w * d },
      (_, i) => [origin[0] + (i % w), origin[2] + Math.floor(i / w)] as const,
    );
    const padOnly = !template.blocks.slice(template.size[0] * template.size[2]).some((block) => block !== 0);
    if (!padOnly || template.pieces.length === 0 || !cells.every(([x, z]) => site.surface.top(x, z) !== undefined)) {
      continue;
    }
    const chunks = new Map<string, Chunk>();
    for (const [x, z] of cells) {
      const [cx, cy, cz] = [toChunk(x), toChunk(origin[1]), toChunk(z)];
      const key = `${cx},${cy},${cz}`;
      if (!chunks.has(key)) {
        const chunk = generateChunk(terrain, [cx, cy, cz]);
        site.stamp(chunk);
        chunks.set(key, chunk);
      }
      const chunk = chunks.get(key)!;
      checked += 1;
      if (chunk.get(mod(x, CHUNK), mod(origin[1], CHUNK), mod(z, CHUNK)) !== site.surface.top(x, z)) {
        mismatches.push(template.id);
      }
    }
  }
  expect(checked).toBeGreaterThan(0);
  expect([...new Set(mismatches)]).toEqual([]);
});

it('rejects a vehicle look naming an unknown blueprint or part', () => {
  expect(checkCar({})).toEqual([]);
  expect(checkCar({ removed: ['no-such-part'] }).length).toBeGreaterThan(0);
  expect(checkCar({ blueprint: 'no_such_vehicle' }).length).toBeGreaterThan(0);
  expect(checkCar({ dirt: 1.5 }).length).toBeGreaterThan(0);
});

const checkShaped = (solidFill: number, height = 0.5) => {
  const shape = [{ position: [0, 0, 0] as [number, number, number], size: [1, height, 1] as [number, number, number] }];
  const data: ContentFile = {
    furnitureMaterials: fixtureMaterials(),
    sounds: fixtureSounds(),
    furniture: [
      {
        id: 'fixture_bench',
        name: 'Bench',
        size: [1, 1, 1],
        color: '#5b605c',
        massKg: 1,
        shape,
        solidFill,
        breach: fixtureBreach(),
        material: FIXTURE_MATERIAL,
      },
    ],
  };
  return buildRegistry([{ source: 'fixture-bench.json', data }]).issues;
};

it('refuses a vehicle or shaped piece whose solid cells are empty or spill out of its size, naming the piece', () => {
  const everyFitting = BLUEPRINTS.rover!.fittings.map(({ id }) => id);
  expect(checkShaped(0.01)).toEqual([]);
  for (const [refused, id] of [
    [checkCar({ removed: everyFitting }), 'fixture_car'],
    [checkCar({}, [4, 4, 4]), 'fixture_car'],
    [checkShaped(1), 'fixture_bench'],
    [checkShaped(0.01, 2), 'fixture_bench'],
  ] as const) {
    expect(refused.some(({ message }) => message.includes(`"${id}"`))).toBe(true);
  }
});
