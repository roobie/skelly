import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SECONDS_PER_HOUR } from '../src/core/clock.ts';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { chargeOf } from '../src/core/lights.ts';
import { FOOD_POISONING, SPAWN_NEEDS } from '../src/core/needs.ts';
import { EAT_TIME } from '../src/core/options.ts';
import { bindReach } from '../src/core/reach.ts';
import { Simulation } from '../src/core/sim.ts';
import { Survival } from '../src/game/survival.ts';

const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => read(`src/content/base/${file}`)),
);

const setup = () => {
  const sim = new Simulation({ seed: 1 });
  const inventory = new Inventory(registry);
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
    apple.made = -300 * SECONDS_PER_HOUR; // picked long before the world began
    survival.use(apple);
    queue.tick(EAT_TIME + 0.1);
    expect(sim.needs.calories).toBe(SPAWN_NEEDS.calories);
    expect(sim.needs.health).toBe(100 - FOOD_POISONING);
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
    light.charges = 0;
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
    expect(light.charges).toBe(0);
    expect(t.inventory.itemByUid(spare.uid)).toBe(spare);
    t.player.position[0] = 0;
    t.survival.use(light);
    t.queue.tick(3);
    expect(light.charges).toBe(0.9);
    expect(light.on).not.toBe(true);
    t.survival.use(light);
    expect(light.on).toBe(true);
  });

  it('loads a battery into the light in your other hand', () => {
    const { inventory, queue, survival, hold } = setup();
    const light = hold('flashlight');
    const battery = hold('aa_battery', 'left');
    light.charges = 0.1;
    expect(survival.use(battery)).toBeUndefined();
    queue.tick(2.1);
    expect(chargeOf(registry, light)).toBe(1);
    expect(inventory.hands.left).toBeUndefined();
    // The old battery comes out with what it had left.
    const spent = inventory.pileAt([0, 0, 0])!.items[0]!.item;
    expect(chargeOf(registry, spent)).toBeCloseTo(0.1, 9);
  });
});
