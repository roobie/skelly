import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SECONDS_PER_HOUR } from '../src/core/clock.ts';
import { buildRegistry, type ContentSource, type Registry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { chargeOf, toggleLight } from '../src/core/lights.ts';
import { slotsReason } from '../src/core/magazine.ts';
import { FOOD_POISONING, SPAWN_NEEDS } from '../src/core/needs.ts';
import { EAT_TIME } from '../src/core/options.ts';
import { bindReach } from '../src/core/reach.ts';
import { Survival } from '../src/game/survival.ts';
import { withDefaultMountedLight } from './firearmAttachmentFixture.ts';
import { BODY_TUNING_FIXTURE, Simulation } from './simulationFixture.ts';

const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => read(`src/content/base/${file}`)),
);

const batteryOf = (light: Item): Item => {
  const battery = light.slots?.battery;
  if (!battery) {
    throw new Error('powered-light fixture has no fitted battery');
  }
  return battery;
};

const setup = (content: Registry = registry) => {
  const sim = new Simulation({ seed: 1 });
  const inventory = new Inventory(content);
  const queue = new HandlingQueue(inventory);
  const notices: string[] = [];
  const player = { inventory, position: [0, 0, 0] as [number, number, number], blockSize: 1 };
  const reach = bindReach(player);
  const survival = new Survival(sim, inventory, queue, {
    reach,
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: (text) => notices.push(text),
    read: () => {
      throw new Error('Unexpected reading in use-items fixture');
    },
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
    t.sim.body.impact(1, 'torso', { bleeding: true, shockDamage: 100 });
    const rag = t.hold('rag', 'left');
    t.sim.actions.treatment = {
      validate: (region, _itemUid, treatment) =>
        t.sim.body.canTreat(region, treatment) ? undefined : 'Treatment no longer applies',
      finish: (region, _itemUid, treatment) =>
        t.sim.body.treat(region, treatment) ? true : 'Treatment no longer applies',
    };
    expect(t.survival.use(rag)).toBeDefined();
    expect(t.survival.useFromQuickbar(rag)).toBeDefined();

    t.sim.body.advance(BODY_TUNING_FIXTURE.knockoutSimSeconds);

    expect(t.sim.body.unconscious).toBe(false);
    expect(t.survival.use(rag)).toBeUndefined();
  });

  it('uses the selected wound for held treatment and lets the wheel change that target', () => {
    const t = setup();
    t.sim.body.impact(1, 'leftArm', { bleeding: true });
    t.sim.body.impact(3, 'rightArm', { bleeding: true });
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

  it('eats from your hands after a few seconds', () => {
    const { sim, inventory, queue, survival, hold } = setup();
    const beans = hold('canned_beans');
    expect(survival.use(beans)).toBeUndefined();
    queue.tick(EAT_TIME - 0.1);
    expect(inventory.hands.right).toBe(beans);
    queue.tick(0.2);
    expect(inventory.hands.right).toBeUndefined();
    expect(sim.needs.calories).toBeCloseTo(SPAWN_NEEDS.calories + 14, 9);
  });

  it('needs the food in your hands, and rotten food makes you sick', () => {
    const { sim, inventory, queue, survival, notices, hold } = setup();
    const pocketed = inventory.create('chocolate_bar');
    expect(survival.use(pocketed)).toBe('Take the chocolate bar in your hands first');
    const apple = hold('apple');
    apple.madeAtGameTimestamp = 0;
    sim.setDebugCalendarTime(300 * SECONDS_PER_HOUR);
    survival.use(apple);
    queue.tick(EAT_TIME + 0.1);
    expect(sim.needs.calories).toBe(SPAWN_NEEDS.calories);
    expect(sim.body.health).toBe(100 - FOOD_POISONING);
    expect(notices).toContain('The apple was rotten');
  });

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
    // 4 game hours is 1800 simulation seconds at 1:8.
    for (let i = 0; i < 1800 + 30; i++) {
      sim.frame(1);
    }
    expect(light.on).toBe(false);
    expect(chargeOf(registry, light)).toBe(0);
    expect(notices).toContain('The flashlight died');
    expect(survival.use(light)).toBe('The battery is dead, and you have no spare');

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
    expect(t.queue.tick(3).failed[0]?.reason).toBe('The battery is no longer in reach');
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
