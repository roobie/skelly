import { expect, it } from 'vitest';
import { buildCityPlan, cityGridOf } from '../src/core/cityPlan.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { buildBundledContent } from '../src/game/bundledContent.ts';

const { registry, issues } = buildBundledContent();

const streetCars = (seed: number) => {
  const scenario = [...registry.scenarios.values()].find(({ city }) => city.streetProps?.length)!;
  const grid = cityGridOf(registry, scenario.city);
  const pool = new Set(grid.streetProps!.flatMap((id) => registry.mapPools.get(id)!.choices.map(({ ref }) => ref.id)));
  const plan = buildCityPlan({ seed, registry, grid, floor: 0 });
  return plan.placements.filter(({ template }) => pool.has(template.id)).map(({ template }) => template.id);
};

const look = (templateId: string) => registry.furniture.get(templateId)!.vehicle!;

it('street car procedural variants', () => {
  expect(issues).toEqual([]);
  const scenario = [...registry.scenarios.values()].find(({ city }) => city.streetProps?.length)!;
  const poolIds = scenario.city.streetProps!.flatMap((id) =>
    registry.mapPools.get(id)!.choices.map(({ ref }) => ref.id),
  );
  const draws = Array.from({ length: 6 }, (_, seed) => streetCars(seed));
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
  expect(streetCars(3)).toEqual(draws[3]);
});

it('rejects a vehicle look naming an unknown blueprint or part', () => {
  const vehicle = { blueprint: 'rover', body: '#112233', dirt: 0.5, removed: [] as string[] };
  const withVehicle = (override: Partial<typeof vehicle>): ContentFile => ({
    furniture: [
      { id: 'fixture_car', name: 'Car', size: [4, 4, 9], color: '#5b605c', vehicle: { ...vehicle, ...override } },
    ],
  });
  const check = (data: ContentFile) => buildRegistry([{ source: 'fixture-car.json', data }]).issues;
  expect(check(withVehicle({}))).toEqual([]);
  expect(check(withVehicle({ removed: ['no-such-part'] })).length).toBeGreaterThan(0);
  expect(check(withVehicle({ blueprint: 'no_such_vehicle' })).length).toBeGreaterThan(0);
  expect(check(withVehicle({ dirt: 1.5 })).length).toBeGreaterThan(0);
});
