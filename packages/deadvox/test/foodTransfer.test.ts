import { describe, expect, it } from 'vitest';
import type { RecipeDef } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { planCraft } from '../src/core/crafting.ts';
import { FOOD_EXPOSURE_DENOMINATOR } from '../src/core/food.ts';
import { ruinFurniture } from '../src/core/furnitureMove.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory, type Location, type Target } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { bindReach } from '../src/core/reach.ts';
import { gameMinutes, simSeconds } from '../src/core/time.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { fixtureFood, foodFixtureRegistry } from './foodFixture.ts';

const food = foodFixtureRegistry(baseRegistry());
const container = (id: string, grid: [number, number], rigid = false) => ({
  ...fixtureFood,
  id,
  category: 'bag' as const,
  food: undefined,
  stack: undefined,
  container: { pockets: [{ grid, handlingSimSeconds: simSeconds(0) }], rigid },
});
/** A test-owned recipe that consumes the fixture food, so escrow follows a plan a player could start. */
const FOOD_RECIPE: RecipeDef = {
  id: 'transfer_recipe',
  category: 'fixture_category',
  tags: [],
  searchTerms: [],
  result: { item: 'fixture_keeps', count: 1 },
  timeGameMinutes: gameMinutes(1),
  skills: {},
  qualities: {},
  components: [[{ item: fixtureFood.id, count: 2 }]],
};
const registry = {
  ...food,
  items: new Map(food.items)
    .set('transfer_bag', container('transfer_bag', [2, 2]))
    .set('transfer_pouch', container('transfer_pouch', [1, 1]))
    .set('transfer_case', container('transfer_case', [2, 2], true)),
  recipes: new Map(food.recipes).set(FOOD_RECIPE.id, FOOD_RECIPE),
};

/** A synthetic environment: no powered fridge exists yet, so these roots are cold by fixture rule alone. */
const AMBIENT_RATE = FOOD_EXPOSURE_DENOMINATOR;
const COLD_RATE = FOOD_EXPOSURE_DENOMINATOR / 4;
const FLOOR = 1;
const WARM: Vec3 = [0, FLOOR, 0];
const WARM_2: Vec3 = [0, FLOOR, 2];
const COLD: Vec3 = [5, FLOOR, 0];
const COLD_2: Vec3 = [5, FLOOR, 2];
const coldRoot = (root: Location): boolean =>
  (root.kind === 'pile' && root.pile.pos[0] === COLD[0]) || root.kind === 'furniture' || root.kind === 'vehicle';

const world = () => {
  const inventory = new Inventory(registry);
  const clock = { now: 0 };
  inventory.foodClock = () => clock.now;
  inventory.foodRate = (root) => (coldRoot(root) ? COLD_RATE : AMBIENT_RATE);
  const put = (type: string, target: Target, count = 1, madeAt = 0): Item => {
    const item = inventory.create(type, count, 1, madeAt);
    if (!inventory.add(item, target)) {
      throw new Error(`Fixture ${type} did not fit`);
    }
    return item;
  };
  const exposure = (item: Item) => inventory.currentFood(item)!.gameMilliseconds;
  return { inventory, clock, put, exposure };
};
const pile = (pos: Vec3, at?: { x: number; y: number }): Target => ({
  kind: 'pile',
  pos,
  ...(at ? { at: { ...at, rotated: false } } : {}),
});
const pocketOf = (owner: Item): Target => ({ kind: 'pocket', owner, pocket: 0 });

describe('food exposure across ownership changes', () => {
  it('a loaded bag crossing environments changes only the later aging of its nested food', () => {
    const { inventory, clock, put, exposure } = world();
    const bag = put('transfer_bag', pile(WARM));
    const apples = put(fixtureFood.id, pocketOf(bag), 2);
    clock.now = 1000;
    expect(inventory.move(bag, pile(COLD)).ok).toBe(true);
    expect(apples.foodExposure).toMatchObject({ gameMilliseconds: 1000, settledAtGameMilliseconds: 1000 });
    clock.now = 3000;
    expect(inventory.move(bag, pile(WARM)).ok).toBe(true);
    expect(apples.foodExposure).toMatchObject({ gameMilliseconds: 1500, settledAtGameMilliseconds: 3000 });
    clock.now = 4000;
    expect(exposure(apples)).toBe(2500);
    expect(apples.count).toBe(2);
  });

  it('a partial move copies the settled cohort and an equal cohort rejoins with its count and age', () => {
    const { inventory, clock, put, exposure } = world();
    const stack = put(fixtureFood.id, pile(COLD), 4);
    clock.now = 2000;
    expect(inventory.move(stack, pile(COLD_2), 1).ok).toBe(true);
    const part = inventory.pileAt(COLD_2)!.items[0]!.item;
    expect([stack.count, part.count]).toEqual([3, 1]);
    expect(part.foodExposure).toEqual(stack.foodExposure);
    expect(part.foodExposure).toMatchObject({ gameMilliseconds: 500, settledAtGameMilliseconds: 2000 });
    clock.now = 6000;
    expect(inventory.move(part, pile(COLD))).toMatchObject({ ok: true, merge: stack });
    expect(stack.count).toBe(4);
    expect(stack.foodExposure).toMatchObject({ gameMilliseconds: 1500, settledAtGameMilliseconds: 6000 });
    expect(exposure(stack)).toBe(1500);
  });

  it('a swap settles each item under the environment it leaves', () => {
    const { inventory, clock, put, exposure } = world();
    const corner = { x: 0, y: 0 };
    const chilled = put(fixtureFood.id, pile(COLD, corner));
    clock.now = 500;
    const held = put(fixtureFood.id, { kind: 'hand', side: 'right' }, 1, 0.5);
    clock.now = 2000;
    expect(inventory.move(held, pile(COLD, corner))).toMatchObject({ ok: true, swap: chilled });
    expect(inventory.hands.right).toBe(chilled);
    expect(chilled.foodExposure).toMatchObject({ gameMilliseconds: 500, settledAtGameMilliseconds: 2000 });
    expect(held.foodExposure).toMatchObject({ gameMilliseconds: 1500, settledAtGameMilliseconds: 2000 });
    clock.now = 3000;
    expect([exposure(chilled), exposure(held)]).toEqual([1500, 1750]);
  });

  it('unequal cohorts take a separate spot instead of merging', () => {
    const { inventory, clock, put } = world();
    const chilled = put(fixtureFood.id, pile(COLD));
    const ambient = put(fixtureFood.id, pile(WARM));
    expect(inventory.plan(ambient, pile(COLD))).toMatchObject({ ok: true, merge: chilled });
    clock.now = 2000;
    const plan = inventory.move(ambient, pile(COLD));
    expect(plan).toMatchObject({ ok: true });
    expect(plan.ok && plan.merge).toBeUndefined();
    expect(inventory.pileAt(COLD)!.items.map(({ item }) => item.count)).toEqual([1, 1]);
  });

  it('a queued merge revalidates at completion; a refused or cancelled move keeps ownership and aging', () => {
    const { inventory, clock, put, exposure } = world();
    const pouch = put('transfer_pouch', pile(COLD));
    const chilled = put(fixtureFood.id, pocketOf(pouch));
    const ambient = put(fixtureFood.id, pile(WARM));
    const queue = new HandlingQueue(inventory);
    const queued = queue.enqueue(ambient, pocketOf(pouch));
    expect(queued.ok).toBe(true);
    expect(inventory.plan(ambient, pocketOf(pouch))).toMatchObject({ ok: true, merge: chilled });
    clock.now = 2000;
    expect(queue.tick(queued.ok ? queued.job.duration + 1 : 0).failed).toHaveLength(1);
    expect(inventory.locate(ambient)).toMatchObject({ kind: 'pile' });
    expect([ambient.count, chilled.count]).toEqual([1, 1]);
    const cancelled = queue.enqueue(ambient, pile(WARM_2));
    expect(cancelled.ok).toBe(true);
    clock.now = 3000;
    queue.cancel();
    expect(queue.tick(1).failed).toEqual([]);
    expect(inventory.pileAt(WARM)!.items[0]!.item).toBe(ambient);
    expect([exposure(ambient), exposure(chilled)]).toEqual([3000, 750]);
  });

  it('craft escrow and cancellation return the exact input with its aging intact', () => {
    const { inventory, clock, put, exposure } = world();
    const stack = put(fixtureFood.id, pile(COLD), 3);
    clock.now = 2000;
    const reach = bindReach({ inventory, position: COLD, blockSize: 0.5, clock: BASE_CLOCK })();
    const planned = planCraft(FOOD_RECIPE, reach, { skills: {}, knownRecipes: new Set([FOOD_RECIPE.id]) });
    if (!('plan' in planned)) {
      throw new Error(planned.missing.reason);
    }
    expect(planned.plan.components.map(({ item, count }) => [item, count])).toEqual([[stack, 2]]);
    const work = inventory.beginWork(planned.plan);
    const input = work!.work!.components[0]!;
    expect([stack.count, input.count]).toEqual([1, 2]);
    expect(input.foodExposure).toMatchObject({ gameMilliseconds: 500, settledAtGameMilliseconds: 2000 });
    clock.now = 3000;
    inventory.releaseWork(work!, false, WARM, 3);
    expect(inventory.locate(input)).toMatchObject({ kind: 'pile' });
    expect(input.foodExposure).toMatchObject({ gameMilliseconds: 1500, settledAtGameMilliseconds: 3000 });
    expect(exposure(stack)).toBe(750);
  });

  it('food nested under fitted vehicle cargo ages by the vehicle root until it leaves', () => {
    const { inventory, clock, put } = world();
    const [blueprint, def] = [...registry.vehicleBlueprints.entries()].find(([, b]) =>
      b.fittings.some((f) => f.cargo),
    )!;
    const id = inventory.registerVehicle({
      placementKey: 'food.cargo',
      blueprint,
      origin: [20, FLOOR, 20],
      facing: 'n',
    });
    const cargoId = def.fittings.find((fitting) => fitting.cargo)!.id;
    const cargo = inventory.vehicles.get(id)!.fittings.find((fitting) => fitting.id === cargoId)!.item;
    const crate = put('transfer_case', pocketOf(cargo));
    const apples = put(fixtureFood.id, pocketOf(crate), 2);
    clock.now = 2000;
    expect(inventory.move(crate, pile(WARM)).ok).toBe(true);
    expect(apples.foodExposure).toMatchObject({ gameMilliseconds: 500, settledAtGameMilliseconds: 2000 });
  });

  it('ruined furniture settles its pocket food before the contents fall', () => {
    const { inventory, clock, exposure } = world();
    const [type, def] = [...registry.furniture.entries()].find(([, f]) => f.container && !f.door)!;
    const entity = inventory.furnish({ type, pos: [20, FLOOR, 20], size: [...def.size], facing: 'n' })!;
    const apples = inventory.create(fixtureFood.id, 2);
    expect(inventory.add(apples, { kind: 'furniture', entity, pocket: 0 })).toBe(true);
    clock.now = 2000;
    const mover = {
      inventory,
      terrainSolid: (_x: number, y: number) => y < FLOOR,
      blockSize: 0.5,
      player: { pos: [40, FLOOR, 40] as Vec3, vel: [0, 0, 0] as Vec3, halfWidth: 0.4, height: 3.6, onGround: true },
      others: [],
      stamina: 100,
    };
    expect(ruinFurniture(mover, entity)).toBeDefined();
    expect(inventory.locate(apples)).toMatchObject({ kind: 'pile' });
    clock.now = 3000;
    expect(exposure(apples)).toBe(1500);
  });
});
