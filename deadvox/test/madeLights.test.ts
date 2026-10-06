import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { drainBurnLight, toggleLight } from '../src/core/lights.ts';
import { bindReach } from '../src/core/reach.ts';
import { Survival } from '../src/game/survival.ts';
import { Simulation } from './simulationFixture.ts';

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
  it('keeps a worn headlamp switchable and lit through the light tick', () => {
    const { sim, inventory, survival } = setup();
    const headlamp = inventory.create('headlamp');
    expect(inventory.add(headlamp, { kind: 'worn' })).toBe(true);
    expect(survival.use(headlamp)).toBeUndefined();
    expect(headlamp.on).toBe(true);

    sim.scheduler.advance(1);
    expect(headlamp.on).toBe(true);
    expect(survival.lit).toBe(headlamp);
    expect(survival.use(headlamp)).toBeUndefined();
    expect(headlamp.on).toBe(false);
  });

  it('burns a torch out at the same time in one step or one-second steps', () => {
    const torch = registry.items.get('torch')!.light!;
    const duration = torch.burnTime! * 3600;
    const caught = new Inventory(registry).create('torch');
    const live = new Inventory(registry).create('torch');
    expect(toggleLight(registry, caught, 0)).toBeUndefined();
    expect(toggleLight(registry, live, 0)).toBeUndefined();

    expect(drainBurnLight(caught, duration)).toBe(true);
    for (let second = 1; second <= duration; second++) {
      const expired = drainBurnLight(live, second);
      expect(expired).toBe(second === duration);
      expect(live.on).toBe(second < duration);
    }
    expect([caught.on, caught.burnRemaining, live.on, live.burnRemaining]).toEqual([false, 0, false, 0]);
  });

  it('keeps pile presentation stable while a glowstick burns, then invalidates it when it expires', () => {
    const { sim, inventory, survival, hold } = setup();
    const glowstick = hold('glowstick');
    expect(survival.use(glowstick)).toBeUndefined();
    expect(inventory.move(glowstick, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    const { version } = inventory;

    sim.scheduler.advance(3);
    expect(glowstick.on).toBe(true);
    expect(inventory.version).toBe(version);

    const expiresAt = glowstick.litAt! + glowstick.burnRemaining! * 3600;
    sim.setDebugCalendarTime(expiresAt - 1.5 * sim.clock.ratio);
    sim.scheduler.advance(1);
    expect(glowstick.on).toBe(true);
    expect(inventory.version).toBe(version);
    sim.scheduler.advance(1);
    expect(glowstick.on).toBe(false);
    expect(inventory.version).toBe(version + 1);
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

  it('requires the firestarter in the other hand, not merely within reach', () => {
    const held = setup();
    const candle = held.hold('candle');
    const matches = held.hold('matches', 'left');
    const heldCharge = matches.charges!;
    const { igniter } = registry.items.get(matches.type)!;
    const { perIgnition } = igniter!;
    expect(held.survival.use(candle)).toBeUndefined();
    expect(candle.on).toBe(true);
    expect(matches.charges).toBe(heldCharge - perIgnition);

    const pocketed = setup();
    const pocketCandle = pocketed.hold('candle');
    const jeans = pocketed.inventory.create('jeans');
    expect(pocketed.inventory.add(jeans, { kind: 'worn' })).toBe(true);
    const pocketMatches = pocketed.inventory.create('matches');
    expect(pocketed.inventory.add(pocketMatches, { kind: 'pocket', owner: jeans, pocket: 0 })).toBe(true);
    const chargeBefore = pocketMatches.charges;
    expect(pocketed.survival.use(pocketCandle)).toEqual(expect.any(String));
    expect(pocketCandle.on).not.toBe(true);
    expect(pocketMatches.charges).toBe(chargeBefore);
  });

  it('applies each burn light’s declared stow and sprint rules', () => {
    const burnLights = [...registry.items.values()].filter(({ light }) => light?.burnTime !== undefined);
    expect(burnLights.length).toBeGreaterThan(0);

    for (const definition of burnLights) {
      const rules = definition.light!.burning!;
      const sprintCase = setup();
      const sprintLight = sprintCase.hold(definition.id);
      if (rules.ignition === 'firestarter') {
        sprintCase.hold('lighter', 'left');
      }
      expect(sprintCase.survival.use(sprintLight)).toBeUndefined();
      sprintCase.survival.setSprinting(true);
      expect(sprintLight.on).toBe(rules.sprint === 'stay');

      const stowCase = setup();
      const stowedLight = stowCase.hold(definition.id);
      if (rules.ignition === 'firestarter') {
        stowCase.hold('lighter', 'left');
      }
      expect(stowCase.survival.use(stowedLight)).toBeUndefined();
      const backpack = stowCase.inventory.create('school_backpack');
      expect(stowCase.inventory.add(backpack, { kind: 'worn' })).toBe(true);
      const moved = stowCase.inventory.move(stowedLight, { kind: 'pocket', owner: backpack, pocket: 0 });
      expect(moved.ok).toBe(rules.stow !== 'refuse');
      if (moved.ok) {
        stowCase.sim.scheduler.advance(1);
        expect(stowedLight.on).toBe(rules.stow === 'stay');
      } else {
        expect(stowCase.inventory.locate(stowedLight)?.kind).toBe('hand');
      }
    }
  });

  it('applies BR’s drop ruling to torches, candles and glowsticks', () => {
    for (const [type, staysLit] of [
      ['torch', false],
      ['candle', false],
      ['glowstick', true],
    ] as const) {
      const { sim, inventory, survival, hold } = setup();
      const light = hold(type);
      if (registry.items.get(type)!.light!.burning!.ignition === 'firestarter') {
        hold('lighter', 'left');
      }
      expect(survival.use(light)).toBeUndefined();
      expect(inventory.move(light, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
      sim.scheduler.advance(1);
      expect(light.on).toBe(staysLit);
    }
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
