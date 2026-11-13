import { buildRegistry } from '@skelly/engine/content';
import { buildCityPlan, cityGridOf } from '@skelly/engine/internal/core/cityPlan.ts';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { BLUEPRINTS } from '@skelly/engine/vehicles';
import {
  CHUNK,
  type Chunk,
  CitySite,
  createTerrainEvaluator,
  footprint,
  makeScale,
  terrainShapeOf,
  toChunk,
} from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { baseSources } from '../src/product/content.ts';
import { startupContent } from './baseRegistry.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureMaterials, fixtureSounds } from './economyFixtures.ts';
import { defaultStartOf } from './fixtures/scenario.ts';

const { registry, issues } = startupContent();
const cityScenarios = [...registry.scenarios.values()].filter((scenario) => scenario.kind === 'assembledCity');

const streetCars = (seed: number) => {
  const scenario = cityScenarios.find(({ city }) => city.streetProps?.length)!;
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
  const scenario = cityScenarios.find(({ city }) => city.streetProps?.length)!;
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
  // The street holds several car blueprints, each stripped of a different part set.
  expect(field((vehicle) => vehicle.blueprint).size).toBeGreaterThan(1);
  expect(field((vehicle) => vehicle.removed).size).toBeGreaterThan(1);
  expect(streetCars(1)).toEqual(draws[0]);
});

// An item template is a floor pad plus furniture; a pad that stamps its own block shows as a patch on the street.
it('keeps the street surface under every placed item standing on a street cell', () => {
  const scenario = cityScenarios.find(({ city }) => city.streetProps?.length)!;
  const grid = cityGridOf(registry, scenario.city);
  const plan = buildCityPlan({
    seed: 1,
    registry,
    grid,
    floor: 0,
    scenario,
    start: defaultStartOf(registry, scenario),
  });
  const scale = makeScale(0.5);
  const site = new CitySite(1, registry, scale, plan);
  const terrain = createTerrainEvaluator({
    seed: 1,
    shape: terrainShapeOf(registry),
    scale,
    site: site.terrain,
    structures: [],
    blocks: { grass: 1000, dirt: 1001, rock: 1002, sand: 1003, water: 1004 },
  });
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
    if (!padOnly || template.pieces.length === 0 || !cells.every(([x, z]) => terrain.top(x, z) !== undefined)) {
      continue;
    }
    const chunks = new Map<string, Chunk>();
    for (const [x, z] of cells) {
      const [cx, cy, cz] = [toChunk(x), toChunk(origin[1]), toChunk(z)];
      const key = `${cx},${cy},${cz}`;
      if (!chunks.has(key)) {
        const chunk = terrain.generateChunk([cx, cy, cz]);
        chunks.set(key, chunk);
      }
      const chunk = chunks.get(key)!;
      checked += 1;
      if (chunk.get(mod(x, CHUNK), mod(origin[1], CHUNK), mod(z, CHUNK)) !== terrain.top(x, z)) {
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

// A wreck look over a content vehicle blueprint takes its finishes from the blueprint's fittings, and its blocks
// from the same fitted collision the renderer draws, so it is refused when that collision blocks nowhere or
// spills outside the piece. The vehicle content it refers to, not the whole base, keeps the case light.
const VEHICLE_BASE = ['vehicles.json', 'models-items.json', 'inventory.json', 'item-wear.json', 'natural-sounds.json'];
const vehicleFixtureSources = baseSources.filter(({ source }) =>
  VEHICLE_BASE.some((file) => source.endsWith(`/${file}`)),
);
const wreckVehicle = { blueprint: 'police_car', removed: [] as string[], solidFill: 0.4 };
const checkWreck = (
  override: Partial<typeof wreckVehicle>,
  size: [number, number, number] = [4, 4, 10],
  sources = vehicleFixtureSources,
) => {
  const data: ContentFile = {
    furnitureMaterials: fixtureMaterials(),
    sounds: fixtureSounds(),
    furniture: [
      {
        id: 'fixture_wreck',
        name: 'Wreck',
        size,
        color: '#5b605c',
        vehicle: { ...wreckVehicle, ...override },
        breach: fixtureBreach(),
        material: FIXTURE_MATERIAL,
      },
    ],
  };
  return buildRegistry([...sources, { source: 'fixture-wreck.json', data }]).issues.filter(
    ({ source }) => source === 'fixture-wreck.json',
  );
};

it('accepts a content blueprint wreck look, and refuses one whose parts block nowhere or outside its size', () => {
  const everyFitting = buildRegistry(vehicleFixtureSources)
    .registry.vehicleBlueprints.get('police_car')!
    .fittings.map(({ id }) => id);
  expect(checkWreck({})).toEqual([]);
  expect(checkWreck({ removed: ['no-such-fitting'] }).length).toBeGreaterThan(0);
  expect(checkWreck({ blueprint: 'no_such_blueprint' }).length).toBeGreaterThan(0);
  for (const refused of [checkWreck({ removed: everyFitting }), checkWreck({}, [1, 1, 1])]) {
    expect(refused.some(({ message }) => message.includes('must block somewhere'))).toBe(true);
  }
});

it('reports rather than throws when a furniture blueprint has an unsound part', () => {
  const sources = vehicleFixtureSources.map(({ source, data }) => ({
    source,
    data: {
      ...(data as ContentFile),
      models: (data as ContentFile).models?.map((model) => ({ ...model, parts: undefined })),
    },
  }));
  expect(checkWreck({}, [4, 4, 10], sources).some(({ message }) => message.includes('unsound part'))).toBe(true);
});

it('blocks every column spanned by kept collision in every content wreck look', async () => {
  const { contentVehicleBlocks, contentVehicleFrame } = await import(
    '@skelly/engine/internal/core/vehicleShapeSolid.ts'
  );
  const { placeFitting } = await import('@skelly/engine/internal/core/vehicleBlueprint.ts');
  const wrecks = [...registry.furniture.values()].filter(
    ({ vehicle }) => vehicle && BLUEPRINTS[vehicle.blueprint] === undefined,
  );
  expect(wrecks.length).toBeGreaterThan(0);
  for (const def of wrecks) {
    const vehicleLook = def.vehicle!;
    const { cx, cz } = contentVehicleFrame(registry, vehicleLook);
    const blocked = new Set(contentVehicleBlocks(registry, vehicleLook, def.size, 0.5).map(([x, , z]) => `${x},${z}`));
    const spans = new Map<string, [number, number]>();
    const boxes = registry.vehicleBlueprints
      .get(vehicleLook.blueprint)!
      .fittings.filter(({ id }) => !vehicleLook.removed.includes(id))
      .flatMap((fitting) => placeFitting(registry, fitting).collision);
    for (const { min, max } of boxes) {
      for (
        let x = Math.floor(def.size[0] / 2 - (max[0] - cx) / 0.5);
        x < Math.ceil(def.size[0] / 2 - (min[0] - cx) / 0.5);
        x += 1
      ) {
        for (
          let z = Math.floor(def.size[2] / 2 - (max[2] - cz) / 0.5);
          z < Math.ceil(def.size[2] / 2 - (min[2] - cz) / 0.5);
          z += 1
        ) {
          const key = `${x},${z}`;
          const previous = spans.get(key);
          spans.set(key, [
            Math.min(previous?.[0] ?? Number.POSITIVE_INFINITY, min[1] / 0.5),
            Math.max(previous?.[1] ?? Number.NEGATIVE_INFINITY, max[1] / 0.5),
          ]);
        }
      }
    }
    expect(spans.size, def.id).toBeGreaterThan(0);
    const solidColumns = [...spans].filter(([, [low, high]]) => {
      for (let y = Math.floor(low); y < Math.ceil(high); y += 1) {
        if (Math.min(y + 1, high) - Math.max(y, low) >= vehicleLook.solidFill) {
          return true;
        }
      }
      return false;
    });
    expect(solidColumns.length, def.id).toBeGreaterThan(0);
    expect(
      solidColumns.filter(([column]) => !blocked.has(column)),
      def.id,
    ).toEqual([]);
  }
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
