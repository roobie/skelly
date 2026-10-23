import { describe, expect, it, vi } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { type Item, typeWeightGrams } from '../src/core/items.ts';
import { chargeOf, toggleLight } from '../src/core/lights.ts';
import { slotsReason } from '../src/core/magazine.ts';
import { bindReach } from '../src/core/reach.ts';
import { simSeconds } from '../src/core/time.ts';
import { Survival, type SurvivalHooks } from '../src/game/survival.ts';
import { Unpacking } from '../src/game/unpacking.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { withDefaultMountedLight } from './firearmAttachmentFixture.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';
import { fixtureFood, foodFixtureRegistry } from './foodFixture.ts';
import { BODY_TUNING_FIXTURE, fixtureTier, Simulation } from './simulationFixture.ts';

const registry = baseRegistry();
const TAKE_TIME = 2;

const sealedCanRegistry = (): Registry => {
  const items = new Map(registry.items);
  items.set('fixture_opened_can_contents', {
    id: 'fixture_opened_can_contents',
    workInProgress: false,
    notLoot: false,
    economy: { usage: [], tiers: [] },
    name: 'Fixture can contents',
    category: 'food',
    weight: 1,
    size: [1, 1],
    food: { calories: 1, water: 0, consumeSimSeconds: simSeconds(1) },
  });
  items.set('fixture_sealed_can', {
    id: 'fixture_sealed_can',
    workInProgress: false,
    notLoot: false,
    economy: { usage: [], tiers: [] },
    name: 'Fixture sealed can',
    category: 'food',
    weight: 1,
    size: [1, 1],
    unpack: {
      item: 'fixture_opened_can_contents',
      count: 1,
      simSeconds: simSeconds(1),
      qualities: { opening: 1 },
    },
  });
  items.set('fixture_can_tool', {
    id: 'fixture_can_tool',
    workInProgress: false,
    notLoot: false,
    economy: { usage: [], tiers: [] },
    name: 'Fixture can tool',
    category: 'tool',
    weight: 1,
    size: [1, 1],
    tool: { qualities: { opening: 1 } },
  });
  items.set('fixture_tool_belt', {
    id: 'fixture_tool_belt',
    workInProgress: false,
    notLoot: false,
    economy: { usage: [], tiers: [] },
    name: 'Fixture tool belt',
    category: 'clothing',
    weight: 1,
    size: [1, 1],
    wearable: { slot: 'waist', encumbrance: 0 },
    container: { pockets: [{ grid: [1, 1], handlingSimSeconds: simSeconds(0) }] },
  });
  return { ...registry, items };
};

// The test's own painkillers: the component, not the category, makes an item one, so each route is held to that.
const pillOf = (id: string, category: string) => ({
  id,
  name: id,
  category,
  weight: 1,
  size: [1, 1],
  stack: 6,
  analgesic: {
    takeSimSeconds: TAKE_TIME,
    reliefPerDose: 1,
    maxRelief: 1,
    onsetGameMinutes: 30,
    peakGameMinutes: 120,
    fadeGameMinutes: 60,
  },
});
const painkillerFixture = buildRegistry([
  playerInventorySource(),
  {
    source: 'painkiller-fixture',
    data: {
      items: [
        pillOf('material_pill', 'material'),
        pillOf('tool_pill', 'tool'),
        {
          id: 'pocketed_trousers',
          name: 'Pocketed trousers',
          category: 'clothing',
          weight: 1,
          size: [3, 3],
          wearable: { slot: 'legs', encumbrance: 0 },
          container: { pockets: [{ name: 'pocket', grid: [1, 1], handlingSimSeconds: 0.5 }] },
        },
      ],
    },
  },
]);
if (painkillerFixture.issues.length > 0) {
  throw new Error(`Invalid painkiller fixture: ${JSON.stringify(painkillerFixture.issues)}`);
}
const painkillers = painkillerFixture.registry;

const batteryOf = (light: Item): Item => {
  const battery = light.slots?.battery;
  if (!battery) {
    throw new Error('powered-light fixture has no fitted battery');
  }
  return battery;
};

const setup = (
  content: Registry = registry,
  readHook: SurvivalHooks['read'] = () => {
    throw new Error('Unexpected reading in use-items fixture');
  },
) => {
  const sim = new Simulation({ seed: 1, analgesics: (item) => content.items.get(item)?.analgesic });
  const inventory = new Inventory(content);
  const queue = new HandlingQueue(inventory);
  const notices: string[] = [];
  const player = { inventory, position: [0, 0, 0] as [number, number, number], blockSize: 1, clock: BASE_CLOCK };
  const reach = bindReach(player);
  const survival = new Survival(sim, inventory, queue, {
    reach,
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: (text) => notices.push(text),
    read: readHook,
  });
  const hold = (type: string, side: 'right' | 'left' = 'right') => {
    const item = inventory.create(type);
    inventory.add(item, { kind: 'hand', side });
    return item;
  };
  return { sim, inventory, queue, survival, notices, hold, reach, player };
};

describe('using what you hold', () => {
  it('refuses held and quickbar actions while unconscious and permits them after wake', () => {
    const t = setup();
    t.sim.body.impact(1, 'torso', { bleeding: fixtureTier('serious'), shockDamage: 100 });
    const rag = t.hold('rag', 'left');
    const treatmentOf = (itemType: string) => registry.items.get(itemType)!.treatment!;
    t.sim.actions.treatment = {
      validate: (region, _itemUid, itemType) =>
        t.sim.body.canTreat(region, treatmentOf(itemType)) ? undefined : 'Treatment no longer applies',
      finish: (region, _itemUid, itemType) =>
        t.sim.body.treat(region, treatmentOf(itemType), () => 0.5) ? true : 'Treatment no longer applies',
    };
    expect(t.survival.use(rag)).toBeDefined();
    expect(t.survival.useFromQuickbar(rag)).toBeDefined();

    t.sim.body.advance(BODY_TUNING_FIXTURE.knockoutSimSeconds);

    expect(t.sim.body.unconscious).toBe(false);
    expect(t.survival.use(rag)).toBeUndefined();
  });

  it('uses the selected wound for held treatment and lets the wheel change that target', () => {
    const t = setup();
    t.sim.body.impact(1, 'leftArm', { bleeding: fixtureTier('serious') });
    t.sim.body.impact(3, 'rightArm', { bleeding: fixtureTier('serious') });
    const rag = t.hold('rag');
    const initial = t.survival.selectedItemAction(rag);
    expect(initial?.treatment?.region).toBe('rightArm');
    const beginTreatment = vi.spyOn(t.sim.actions, 'beginTreatment').mockReturnValue(undefined);

    expect(t.survival.use(rag)).toBeUndefined();
    expect(beginTreatment.mock.calls[0]?.[0]).toBe(initial?.treatment?.region);
    expect(beginTreatment.mock.calls[0]?.[1]).toBe(rag.uid);
    expect(t.survival.cycleItemAction(rag, 1)).toBe(true);
    const selected = t.survival.selectedItemAction(rag);
    expect(selected).not.toBe(initial);
    expect(t.survival.use(rag)).toBeUndefined();
    expect(beginTreatment.mock.calls[1]?.[0]).toBe(selected?.treatment?.region);
  });

  it('passes the read item type to the read hook', () => {
    const readableType = [...registry.items.values()].find((def) => def.readable && !def.book)?.id;
    expect(readableType).toBeDefined();
    const readTypes: (string | undefined)[] = [];
    const t = setup(registry, (request) => readTypes.push(request.itemType));
    const note = t.hold(readableType!);

    expect(t.survival.use(note)).toBeUndefined();
    expect(readTypes).toEqual([readableType]);
  });

  it('cannot eat a sealed can and only a tool in the other hand enables opening', () => {
    const { sim, inventory, queue, survival, hold } = setup(sealedCanRegistry());
    const sealed = hold('fixture_sealed_can');
    const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0]);
    const before = inventory.snapshotState();

    expect(survival.use(sealed)).toBeDefined();
    expect(unpacking.activate(sealed)).toBeDefined();
    expect(inventory.snapshotState()).toEqual(before);
    expect(queue.jobs).toEqual([]);

    const belt = inventory.create('fixture_tool_belt');
    const tool = inventory.create('fixture_can_tool');
    if (!(inventory.add(belt, { kind: 'worn' }) && inventory.add(tool, { kind: 'pocket', owner: belt, pocket: 0 }))) {
      throw new Error('Could not equip the fixture tool');
    }
    expect(unpacking.activate(sealed)).toBeDefined();
    expect(inventory.move(tool, { kind: 'hand', side: 'left' }).ok).toBe(true);
    expect(unpacking.activate(sealed)).toBeUndefined();
    expect(queue.jobs).toHaveLength(1);
    queue.tick(1);

    const opened = [...inventory.items()].find(({ item }) => item.type === 'fixture_opened_can_contents')?.item;
    if (!(opened && inventory.move(opened, { kind: 'hand', side: 'right' }).ok)) {
      throw new Error('Opened can contents did not reach the hand');
    }
    expect(survival.use(opened)).toBeUndefined();
    queue.tick(1);
    expect(sim.needs.calories).toBeGreaterThan(sim.body.spawnNeeds.calories);
  });

  it('opening conserves carried mass and eating removes only the retained serving mass', () => {
    const cans = [...registry.items.values()].filter(
      (def) => def.unpack?.inPlace && registry.items.get(def.unpack.item)?.serving,
    );
    expect(cans.length).toBeGreaterThan(0);
    for (const def of cans) {
      const { inventory, queue, survival, hold } = setup();
      const can = hold(def.id);
      const [quality] = Object.keys(def.unpack!.qualities ?? {});
      if (quality !== undefined) {
        const tool = [...registry.items.values()].find((item) => (item.tool?.qualities?.[quality] ?? 0) > 0)!;
        hold(tool.id, 'left');
      }
      const sealedMass = inventory.carriedWeight();
      const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0]);
      expect(unpacking.activate(can)).toBeUndefined();
      expect(queue.tick(queue.remaining).failed).toEqual([]);
      expect(inventory.carriedWeight()).toBeCloseTo(sealedMass);
      const serving = registry.items.get(can.type)!.serving!;
      const foodMass = typeWeightGrams(registry, serving.food);
      expect(foodMass).toBeGreaterThan(0);
      expect(survival.use(can)).toBeUndefined();
      expect(queue.tick(queue.remaining).failed).toEqual([]);
      expect(inventory.carriedWeight()).toBeCloseTo(sealedMass - foodMass);
      expect(inventory.itemByUid(can.uid)).toBe(can);
      expect(can.type).toBe(serving.empty);
    }
  });

  it('needs the food in your hands, and rotten food makes you sick', () => {
    const { sim, inventory, queue, survival, notices, hold } = setup(foodFixtureRegistry(registry));
    const pocketed = inventory.create('fixture_keeps');
    expect(survival.use(pocketed)).toBeTruthy();
    expect(queue.jobs).toEqual([]);
    const food = hold(fixtureFood.id);
    sim.setDebugCalendarTime(sim.calendar + fixtureFood.food!.rotsAfterGameHours!);
    survival.use(food);
    const noticed = notices.length;
    queue.tick(fixtureFood.food!.consumeSimSeconds + 0.1);
    expect(sim.needs.calories).toBe(sim.body.spawnNeeds.calories);
    expect(sim.body.health).toBe(100 - fixtureFood.food!.poisonHealth!);
    expect(notices.length).toBeGreaterThan(noticed);
  });

  it('consumes the actual perishable serving and leaves an ageless empty vessel', () => {
    const f = setup(foodFixtureRegistry(registry));
    const vessel = f.hold('fixture_full');
    const { health } = f.sim.body;
    const { calories } = f.sim.needs;
    const before = structuredClone(vessel);
    f.survival.describe(vessel);
    expect(vessel).toEqual(before);
    expect(f.survival.use(vessel)).toBeUndefined();
    f.queue.tick(fixtureFood.food!.consumeSimSeconds);
    expect(f.sim.body.health).toBe(health - fixtureFood.food!.poisonHealth!);
    expect(f.sim.needs.calories).toBe(calories);
    expect(f.inventory.itemByUid(vessel.uid)).toBe(vessel);
    expect(vessel.type).toBe('fixture_empty');
    expect(vessel.foodExposure).toBeUndefined();
  });

  it.each(['material_pill', 'tool_pill'])(
    'takes one pill off a %s stack, from your hands or a pocket, and starts one dose for it',
    (pill) => {
      const { sim, inventory, queue, survival } = setup(painkillers);
      const doses = (): number => sim.body.snapshotState().pain.doses.length;
      const held = inventory.create(pill, 3);
      inventory.add(held, { kind: 'hand', side: 'right' });
      expect(survival.use(held)).toBeUndefined();
      queue.tick(TAKE_TIME + 0.1);
      expect([held.count, doses()]).toEqual([2, 1]);

      const trousers = inventory.create('pocketed_trousers');
      inventory.add(trousers, { kind: 'worn' });
      const pocketed = inventory.create(pill, 3);
      expect(inventory.add(pocketed, { kind: 'pocket', owner: trousers, pocket: 0 })).toBe(true);
      expect(survival.useFromQuickbar(pocketed)).toBeUndefined();
      queue.tick(60);
      expect([pocketed.count, doses(), inventory.locate(pocketed)?.kind]).toEqual([2, 2, 'pocket']);
    },
  );

  it('switches the light on and off, and it goes off when put away', () => {
    const { inventory, survival, sim, hold } = setup();
    const light = hold('flashlight');
    survival.use(light);
    expect([light.on, survival.lit]).toEqual([true, light]);
    survival.use(light);
    expect([light.on, survival.lit]).toEqual([false, undefined]);
    survival.use(light);
    const jeans = inventory.create('jeans');
    inventory.add(jeans, { kind: 'worn' });
    expect(inventory.move(light, { kind: 'pocket', owner: jeans, pocket: 0 }).ok).toBe(true);
    sim.frame(1);
    expect([light.on, survival.lit]).toEqual([false, undefined]);
  });

  it('does not spend or report battery fuel when matches are used alone', () => {
    const { survival, sim, notices, hold } = setup();
    const matches = hold('matches');
    const emptyFlashlight = hold('flashlight', 'left');
    batteryOf(emptyFlashlight).charges = 0;
    const batteryReason = survival.use(emptyFlashlight);
    expect(batteryReason).toEqual(expect.any(String));
    const fuelBefore = matches.charges;

    const result = survival.use(matches);
    sim.scheduler.advance(2);
    expect(matches.on).not.toBe(true);
    expect(matches.charges).toBe(fuelBefore);
    expect(notices).toEqual([]);
    expect(result).toEqual(expect.any(String));

    matches.charges = 0;
    const emptyReason = survival.use(matches);
    expect(emptyReason).toEqual(expect.any(String));
    expect(emptyReason).not.toBe(batteryReason);
  });

  it('reports fuel rather than battery failure for an empty self-fuelled igniter', () => {
    const t = setup();
    const lighter = t.hold('lighter');
    const emptyFlashlight = t.hold('flashlight', 'left');
    batteryOf(emptyFlashlight).charges = 0;
    const batteryReason = t.survival.use(emptyFlashlight);
    expect(batteryReason).toEqual(expect.any(String));
    lighter.charges = 0;

    const reason = t.survival.use(lighter);
    expect(reason).toEqual(expect.any(String));
    expect(reason).not.toBe(batteryReason);
  });

  it('drains while on, and a dead light takes a spare battery from your pockets', () => {
    const { inventory, queue, survival, sim, notices, hold } = setup();
    const light = hold('flashlight');
    survival.use(light);
    const noticedBefore = notices.length;
    // 4 game hours is 1800 simulation seconds at 1:8.
    for (let i = 0; i < 1800 + 30; i++) {
      sim.frame(1);
    }
    expect(light.on).toBe(false);
    expect(chargeOf(registry, light)).toBe(0);
    expect(notices.length).toBeGreaterThan(noticedBefore);
    expect(survival.use(light)).toBeTruthy();

    const jeans = inventory.create('jeans');
    inventory.add(jeans, { kind: 'worn' });
    const batteries = inventory.create('aa_battery', 2);
    inventory.add(batteries, { kind: 'pocket', owner: jeans, pocket: 0 });
    expect(survival.use(light)).toBeUndefined();
    queue.tick(2.1);
    expect(chargeOf(registry, light)).toBe(1);
    expect(batteries.count).toBe(1);
    expect(survival.use(light)).toBeUndefined();
    expect(light.on).toBe(true);
  });

  it('keeps a mounted light on and drains its nested battery while its firearm is held', () => {
    const mounted = withDefaultMountedLight(registry, 'rifle_assault', 'flashlight');
    const t = setup(mounted.registry);
    const firearm = t.hold('rifle_assault');
    const light = firearm.slots?.[mounted.fitted.mountedAt];
    if (!light) {
      throw new Error('Factory-created mounted light default is missing');
    }
    expect(slotsReason(mounted.registry, firearm.type, firearm.slots)).toBeUndefined();
    expect(toggleLight(mounted.registry, light, t.sim.calendar)).toBeUndefined();
    const initialCharge = chargeOf(mounted.registry, light)!;

    t.sim.frame(2);

    expect(light.on).toBe(true);
    expect(chargeOf(mounted.registry, light)).toBeLessThan(initialCharge);
  });

  it('scalar light switching and drain invalidate the cached state-sensitive reach', () => {
    const t = setup();
    t.hold('flashlight');
    const before = t.reach();
    expect(t.reach()).toBe(before);
    t.survival.use(t.inventory.hands.right!);
    const switched = t.reach();
    expect(switched).not.toBe(before);
    t.sim.frame(1);
    expect(t.reach()).not.toBe(switched);
  });

  it('selects the fullest searched/ground spare and rechecks its reach at battery completion', () => {
    const t = setup();
    const light = t.hold('flashlight');
    batteryOf(light).charges = 0;
    const bag = t.inventory.create('school_backpack');
    t.inventory.add(bag, { kind: 'pile', pos: [0, 0, 0] });
    const floor = t.inventory.create('aa_battery');
    floor.charges = 0.7;
    t.inventory.add(floor, { kind: 'pocket', owner: bag, pocket: 0 });
    const definition = [...registry.furniture.values()].find((def) => def.container)!;
    const furniture = t.inventory.entities.add({ type: definition.id, pos: [1, 0, 0], size: [1, 2, 1], facing: 'n' })!;
    const spare = t.inventory.create('aa_battery');
    spare.charges = 0.9;
    t.inventory.add(spare, { kind: 'furniture', entity: furniture, pocket: 0 });
    expect(t.survival.use(light)).toBeUndefined();
    expect(t.queue.jobs[0]).toMatchObject({ params: { batteryUid: floor.uid } });
    t.queue.cancel();
    t.inventory.entities.markSearched(furniture);
    t.survival.use(light);
    expect(t.queue.jobs[0]).toMatchObject({ params: { batteryUid: spare.uid } });
    t.player.position[0] = 10;
    expect(t.queue.tick(3).failed[0]?.reason).toBeTruthy();
    expect(batteryOf(light).charges).toBe(0);
    expect(t.inventory.itemByUid(spare.uid)).toBe(spare);
    t.player.position[0] = 0;
    t.survival.use(light);
    t.queue.tick(3);
    expect(batteryOf(light).charges).toBe(0.9);
    expect(light.on).not.toBe(true);
    t.survival.use(light);
    expect(light.on).toBe(true);
  });

  it('loads a battery into the light in your other hand', () => {
    const { inventory, queue, survival, hold } = setup();
    const light = hold('flashlight');
    const battery = hold('aa_battery', 'left');
    batteryOf(light).charges = 0.1;
    expect(survival.use(battery)).toBeUndefined();
    queue.tick(2.1);
    expect(chargeOf(registry, light)).toBe(1);
    expect(inventory.hands.left).toBeUndefined();
    // The old battery comes out with what it had left.
    const spent = inventory.pileAt([0, 0, 0])!.items[0]!.item;
    expect(chargeOf(registry, spent)).toBeCloseTo(0.1, 9);
  });
});
