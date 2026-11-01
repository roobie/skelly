import { describe, expect, it, vi } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import { coreLabel, coreMessage } from '../src/core/coreText.ts';
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
    readingLight: () => undefined,
    read: readHook,
  });
  const hold = (type: string, side: 'right' | 'left' = 'right') => {
    const item = inventory.create(type);
    inventory.add(item, { kind: 'hand', side });
    return item;
  };
  return { sim, inventory, queue, survival, notices, hold, reach, player };
};

describe('a paused craft in held-item actions', () => {
  const heldWork = (t: ReturnType<typeof setup>, where: 'hand' | 'pile') => {
    const item = t.inventory.create('work_in_progress');
    item.work = { kind: 'craft', recipe: 'torch', elapsed: 1, duration: 120, components: [] };
    t.inventory.add(item, where === 'hand' ? { kind: 'hand', side: 'right' } : { kind: 'pile', pos: [0, 0, 0] });
    return item;
  };

  it('offers continue for a held paused work item', () => {
    const t = setup();
    const item = heldWork(t, 'hand');
    expect(t.survival.availableItemActions(item).some((action) => action.continuing)).toBe(true);
  });

  it('offers nothing for a dropped paused work item', () => {
    const t = setup();
    const item = heldWork(t, 'pile');
    expect(t.survival.availableItemActions(item).some((action) => action.continuing)).toBe(false);
  });

  it('offers no continue for a held item that is not work in progress', () => {
    const t = setup();
    const item = t.hold('rag');
    expect(t.survival.availableItemActions(item).some((action) => action.continuing)).toBe(false);
  });
});

describe('using what you hold', () => {
  it('inventory activation refuses a pocket item until it is held', () => {
    const t = setup(painkillers);
    const trousers = t.inventory.create('pocketed_trousers');
    const pill = t.inventory.create('material_pill', 2);
    expect(t.inventory.add(trousers, { kind: 'worn' })).toBe(true);
    expect(t.inventory.add(pill, { kind: 'pocket', owner: trousers, pocket: 0 })).toBe(true);
    expect(t.survival.activateHeld(pill)).toBeTruthy();
    expect(t.queue.jobs).toEqual([]);
    expect(t.inventory.move(pill, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(t.survival.activateHeld(pill)).toBeUndefined();
    expect(t.queue.busy).toBe(true);
    t.queue.tick(t.queue.remaining);
    expect(pill.count).toBe(1);
  });

  it('describes a reservoir lamp by its switch state, not a second battery balance', () => {
    const t = setup();
    const lamp = t.hold('oil_lamp', 'right');
    expect(lamp.slots?.battery).toBeUndefined();
    expect(registry.items.get(lamp.type)!.light!.power).toBeUndefined();
    expect(t.survival.describe(lamp)).toEqual([coreLabel(registry, 'lightOffStatus')]);
    t.hold('matches', 'left');
    expect(t.survival.use(lamp)).toBeUndefined();
    expect(t.survival.describe(lamp)).toEqual([coreLabel(registry, 'lightOnStatus')]);
  });

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

  it('uses the explicitly selected treatment region instead of the default worst wound', () => {
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
    const other = t.survival.availableItemActions(rag).find((action) => action.id !== initial?.id && action.treatment);
    expect(other).toBeDefined();
    expect(t.survival.chooseItemAction(rag, other!.id)).toBe(true);
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

  it('drains while on, then goes dark', () => {
    const { survival, sim, notices, hold } = setup();
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
  });

  it('refuses a dead light used alone and loads nothing, even with a charged battery in a bag', () => {
    const t = setup();
    const light = t.hold('flashlight');
    batteryOf(light).charges = 0;
    const bag = t.inventory.create('school_backpack');
    t.inventory.add(bag, { kind: 'worn' });
    const spare = t.inventory.create('aa_battery');
    t.inventory.add(spare, { kind: 'pocket', owner: bag, pocket: 0 });

    expect(t.survival.use(light)).toBe(coreMessage(registry, 'batteryDeadNoSpare'));

    expect(t.queue.jobs).toEqual([]);
    expect(t.inventory.locate(spare)).toMatchObject({ kind: 'pocket', owner: bag });
    expect(chargeOf(registry, light)).toBe(0);
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

  it('loads the battery dropped on the slot and rechecks its reach at completion', () => {
    const t = setup();
    const light = t.hold('flashlight');
    batteryOf(light).charges = 0;
    const definition = [...registry.furniture.values()].find((def) => def.container)!;
    const furniture = t.inventory.entities.add({ type: definition.id, pos: [1, 0, 0], size: [1, 2, 1], facing: 'n' })!;
    const spare = t.inventory.create('aa_battery');
    spare.charges = 0.9;
    t.inventory.add(spare, { kind: 'furniture', entity: furniture, pocket: 0 });
    expect(t.survival.loadBattery(light.uid, spare.uid)).toBe(coreMessage(registry, 'tooFar'));
    t.inventory.entities.markSearched(furniture);
    expect(t.survival.loadBattery(light.uid, spare.uid)).toBeUndefined();
    t.player.position[0] = 10;
    expect(t.queue.tick(3).failed[0]?.reason).toBeTruthy();
    expect(batteryOf(light).charges).toBe(0);
    expect(t.inventory.itemByUid(spare.uid)).toBe(spare);
    t.player.position[0] = 0;
    t.survival.loadBattery(light.uid, spare.uid);
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

  it('a dead light used with a charged battery in the other hand refuses and loads nothing', () => {
    const { inventory, queue, survival, hold } = setup();
    const light = hold('flashlight');
    const battery = hold('aa_battery', 'left');
    const original = batteryOf(light);
    original.charges = 0;
    expect(survival.use(light)).toBe(coreMessage(registry, 'batteryDeadNoSpare'));
    expect(queue.jobs).toEqual([]);
    expect(light.slots?.battery).toBe(original);
    expect(inventory.locate(battery)?.kind).toBe('hand');
  });

  it('a hand load refuses once an earlier queued move has put the light down', () => {
    const t = setup();
    const light = t.hold('flashlight');
    const battery = t.hold('aa_battery', 'left');
    const original = batteryOf(light);
    expect(t.queue.enqueue(light, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    expect(t.survival.use(battery)).toBeUndefined();
    const result = t.queue.tick(t.queue.jobs.reduce((sum, job) => sum + job.duration, 0) + 1);
    expect(t.inventory.locate(light)?.kind).toBe('pile');
    expect(result.failed.length).toBeGreaterThan(0);
    expect(light.slots?.battery).toBe(original);
    expect(t.inventory.locate(battery)?.kind).toBe('hand');
  });
});

describe('taking the battery out of a held light', () => {
  const unload = (t: ReturnType<typeof setup>, light: Item) => {
    if (!t.survival.chooseItemAction(light, 'battery:unload')) {
      throw new Error('Fixture light has no battery-removal action');
    }
    const selected = t.survival.selectedItemAction(light)?.battery;
    const refusal = t.survival.use(light);
    const ticked = t.queue.tick(registry.items.get(light.type)!.light!.power!.swapSimSeconds + 0.1);
    return { selected, refusal, failed: ticked.failed };
  };

  it('puts the battery, charge kept, in a pocket with room and switches the light off', () => {
    const t = setup();
    const light = t.hold('flashlight');
    const jeans = t.inventory.create('jeans');
    t.inventory.add(jeans, { kind: 'worn' });
    const battery = batteryOf(light);
    battery.charges = 0.4;
    expect(t.survival.use(light)).toBeUndefined();
    expect(light.on).toBe(true);

    expect(unload(t, light)).toEqual({ selected: 'unload', refusal: undefined, failed: [] });

    expect(light.slots?.battery).toBeUndefined();
    expect(light.on).toBe(false);
    expect(t.inventory.locate(battery)).toMatchObject({ kind: 'pocket', owner: jeans });
    expect(chargeOf(registry, battery)).toBeCloseTo(0.4, 9);
  });

  it('puts the battery on the ground when no pocket has room', () => {
    const t = setup();
    const light = t.hold('flashlight');
    const battery = batteryOf(light);

    unload(t, light);

    expect(light.slots?.battery).toBeUndefined();
    expect(t.inventory.locate(battery)?.kind).toBe('pile');
  });

  it('leaves the battery fitted with nowhere to put it', () => {
    const t = setup();
    const light = t.hold('flashlight');
    const battery = batteryOf(light);
    t.inventory.landing = () => undefined;

    expect(unload(t, light).failed[0]?.reason).toEqual(expect.any(String));

    expect(light.slots?.battery).toBe(battery);
  });

  it('is not offered for a light with no battery', () => {
    const t = setup();
    const light = t.hold('flashlight');
    expect(t.survival.availableItemActions(light).some((action) => action.battery === 'unload')).toBe(true);

    unload(t, light);

    expect(t.survival.availableItemActions(light).some((action) => action.battery === 'unload')).toBe(false);
  });

  it('leaves the light empty: it says so, and a battery goes back in through the slot', () => {
    const t = setup();
    const light = t.hold('flashlight');
    const battery = batteryOf(light);
    unload(t, light);
    expect(t.survival.use(light)).toBe(coreMessage(registry, 'noBatteryNoSpare'));

    expect(t.survival.loadBattery(light.uid, battery.uid)).toBeUndefined();
    t.queue.tick(registry.items.get(light.type)!.light!.power!.swapSimSeconds + 0.1);

    expect(light.slots?.battery).toBe(battery);
  });
});
