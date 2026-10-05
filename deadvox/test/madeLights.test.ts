import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { drainBurnLight, toggleLight } from '../src/core/lights.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
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
  const player = { inventory, position: [0, 0, 0] as [number, number, number], blockSize: 1 };
  const survival = new Survival(sim, inventory, queue, {
    reach: bindReach(player),
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: () => undefined,
    read: () => {
      throw new Error('Unexpected reading in made-light test');
    },
  });
  const hold = (type: string, side: 'right' | 'left' = 'right') => {
    const item = inventory.create(type);
    if (!inventory.add(item, { kind: 'hand', side })) {
      throw new Error(`Could not hold ${type}`);
    }
    return item;
  };
  return { sim, inventory, survival, hold };
};

describe('made light burn state', () => {
  it('burns a torch out at the same time in one step or one-second steps', () => {
    const torch = registry.items.get('torch')!.light!;
    const duration = torch.burnTime! * 3600;
    const caught = new Inventory(registry).create('torch');
    const live = new Inventory(registry).create('torch');
    expect(toggleLight(registry, caught, 0)).toBeUndefined();
    expect(toggleLight(registry, live, 0)).toBeUndefined();

    expect(drainBurnLight(caught, duration)).toBe(true);
    let expired = false;
    for (let second = 1; second <= duration; second++) {
      expired = drainBurnLight(live, second) || expired;
    }
    expect(expired).toBe(true);
    expect([caught.on, caught.burnRemaining, live.on, live.burnRemaining]).toEqual([false, 0, false, 0]);
  });

  it('preserves the remaining time when a candle is doused and relit', () => {
    const burnTime = registry.items.get('candle')!.light!.burnTime!;
    const duration = burnTime * 3600;
    const candle = new Inventory(registry).create('candle');
    expect(toggleLight(registry, candle, 0)).toBeUndefined();
    expect(drainBurnLight(candle, duration / 2)).toBe(false);
    expect(toggleLight(registry, candle, duration / 2)).toBeUndefined();
    expect(candle.on).toBe(false);
    expect(candle.burnRemaining).toBeCloseTo(burnTime / 2, 9);

    expect(toggleLight(registry, candle, duration / 2)).toBeUndefined();
    expect(drainBurnLight(candle, duration)).toBe(true);
    expect(candle.on).toBe(false);
    expect(candle.burnRemaining).toBe(0);
  });

  it('spends lighter fuel to ignite a torch and extinguishes a candle on sprint', () => {
    const { inventory, survival, hold } = setup();
    const torch = hold('torch');
    const lighter = hold('lighter', 'left');
    const fuelBefore = lighter.charges;
    expect(survival.use(torch)).toBeUndefined();
    expect(torch.on).toBe(true);
    expect(lighter.charges).toBeLessThan(fuelBefore!);
    inventory.consume(torch);

    const candle = inventory.create('candle');
    inventory.add(candle, { kind: 'pile', pos: [0, 0, 0] });
    expect(inventory.move(candle, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(survival.use(candle)).toBeUndefined();
    expect(candle.on).toBe(true);
    survival.setSprinting(true);
    expect(candle.on).toBe(false);
    expect(candle.burnRemaining).toBeGreaterThan(0);
  });

  it('applies each light source’s component-driven carry rules', () => {
    const { sim, inventory, survival, hold } = setup();
    const torch = hold('torch');
    hold('lighter', 'left');
    const jeans = inventory.create('jeans');
    expect(inventory.add(jeans, { kind: 'worn' })).toBe(true);
    expect(survival.use(torch)).toBeUndefined();
    expect(inventory.move(torch, { kind: 'pocket', owner: jeans, pocket: 0 }).ok).toBe(false);
    expect(inventory.move(torch, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);

    const candle = hold('candle');
    expect(survival.use(candle)).toBeUndefined();
    expect(inventory.move(candle, { kind: 'pocket', owner: jeans, pocket: 0 }).ok).toBe(true);

    const glowstick = hold('glowstick');
    expect(survival.use(glowstick)).toBeUndefined();
    expect(inventory.move(glowstick, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    sim.frame(1);
    expect([torch.on, candle.on, glowstick.on]).toEqual([false, false, true]);
  });

  it('does not let a used glowstick be doused or relit', () => {
    const spec = registry.items.get('glowstick')!.light!;
    const glowstick = { uid: 1, type: 'glowstick', count: 1, condition: 1 };
    expect(toggleLight(registry, glowstick, 0)).toBeUndefined();
    expect(toggleLight(registry, glowstick, 1)).toBe("It can't be doused");
    expect(drainBurnLight(glowstick, spec.burnTime! * 3600)).toBe(true);
    expect(toggleLight(registry, glowstick, spec.burnTime! * 3600)).toBe("It can't be lit again");
  });
});
