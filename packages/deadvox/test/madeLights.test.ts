import { describe, expect, it } from 'vitest';
import { simSecondsPerHour } from '../src/core/clock.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { chargeOf, drainBurnLight, toggleLight, wornNightVision } from '../src/core/lights.ts';
import { bindReach } from '../src/core/reach.ts';
import { Survival } from '../src/game/survival.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { Simulation } from './simulationFixture.ts';

const registry = baseRegistry();

const setup = () => {
  const sim = new Simulation({ seed: 1 });
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  const player = { inventory, position: [0, 0, 0] as [number, number, number], blockSize: 1, clock: BASE_CLOCK };
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

  it('switches a worn headlamp on and off with the worn-light control', () => {
    const { inventory, survival } = setup();
    const headlamp = inventory.create('headlamp');
    expect(inventory.add(headlamp, { kind: 'worn' })).toBe(true);

    expect(survival.toggleWornLights()).toBeUndefined();
    expect(headlamp.on).toBe(true);
    expect(survival.lit).toBe(headlamp);
    expect(survival.toggleWornLights()).toBeUndefined();
    expect(headlamp.on).toBe(false);
  });

  it('leaves a lit hand light alone when the worn-light control switches a worn light', () => {
    const { inventory, survival, hold } = setup();
    const flashlight = hold('flashlight');
    expect(survival.use(flashlight)).toBeUndefined();
    const headlamp = inventory.create('headlamp');
    expect(inventory.add(headlamp, { kind: 'worn' })).toBe(true);

    expect(survival.toggleWornLights()).toBeUndefined();
    expect([headlamp.on, flashlight.on, survival.lit]).toEqual([true, true, flashlight]);
    expect(survival.toggleWornLights()).toBeUndefined();
    expect([headlamp.on, flashlight.on, survival.lit]).toEqual([false, true, flashlight]);
  });

  it('lights an on worn light once the hand light that was active goes off', () => {
    const { inventory, survival, hold } = setup();
    const flashlight = hold('flashlight');
    expect(survival.use(flashlight)).toBeUndefined();
    const headlamp = inventory.create('headlamp');
    expect(inventory.add(headlamp, { kind: 'worn' })).toBe(true);
    expect(survival.toggleWornLights()).toBeUndefined();

    expect(survival.use(flashlight)).toBeUndefined();
    expect(flashlight.on).toBe(false);
    expect(survival.lit).toBe(headlamp);
  });

  it('wears goggles in the eyes slot with a headlamp, and the worn-light control switches both', () => {
    const { inventory, survival } = setup();
    const headlamp = inventory.create('headlamp');
    const goggles = inventory.create('night_vision_goggles');
    expect(inventory.add(headlamp, { kind: 'worn' })).toBe(true);
    expect(inventory.add(goggles, { kind: 'worn' })).toBe(true);
    expect([inventory.worn.head, inventory.worn.eyes]).toEqual([headlamp, goggles]);

    expect(survival.toggleWornLights()).toBeUndefined();
    expect([headlamp.on, goggles.on]).toEqual([true, true]);
    expect(survival.toggleWornLights()).toBeUndefined();
    expect([headlamp.on, goggles.on]).toEqual([false, false]);
  });

  it('drains the battery of worn goggles while they are on', () => {
    const { sim, inventory, survival } = setup();
    const goggles = inventory.create('night_vision_goggles');
    expect(inventory.add(goggles, { kind: 'worn' })).toBe(true);
    const full = chargeOf(registry, goggles)!;

    expect(survival.toggleWornLights()).toBeUndefined();
    sim.scheduler.advance(60);
    expect(goggles.on).toBe(true);
    expect(chargeOf(registry, goggles)).toBeLessThan(full);
  });

  it('gives the night-vision view only while the goggles are worn, on and charged', () => {
    const { sim, inventory, survival, hold } = setup();
    const goggles = hold('night_vision_goggles');
    const light = registry.items.get('night_vision_goggles')!.light!;
    const view = light.nightVision;
    expect(view).toBeDefined();
    expect(survival.use(goggles)).toBeUndefined();
    expect(wornNightVision(inventory)).toBeUndefined();

    expect(inventory.move(goggles, { kind: 'worn' }).ok).toBe(true);
    expect(goggles.on).toBe(true);
    expect(wornNightVision(inventory)).toBe(view);

    expect(survival.toggleWornLights()).toBeUndefined();
    expect(goggles.on).toBe(false);
    expect(wornNightVision(inventory)).toBeUndefined();

    expect(survival.toggleWornLights()).toBeUndefined();
    const runtime = (chargeOf(registry, goggles)! / light.power!.chargePerGameHour) * simSecondsPerHour(sim.clock);
    sim.scheduler.advance(runtime + 1, runtime, () => !goggles.on);
    expect(chargeOf(registry, goggles)).toBe(0);
    expect(wornNightVision(inventory)).toBeUndefined();
  });

  it('does not switch a hand light, or anything, when no switchable light is worn', () => {
    const { inventory, survival, hold } = setup();
    const flashlight = hold('flashlight');
    const before = inventory.version;

    expect(survival.toggleWornLights()).toBeUndefined();
    expect(flashlight.on).toBeFalsy();
    expect(inventory.version).toBe(before);
  });

  it('burns a torch out at the same time in one step or one-second steps', () => {
    const torch = registry.items.get('torch')!.light!;
    const duration = torch.burnTimeGameHours!;
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
    expect([caught.on, caught.burnRemainingGameSeconds, live.on, live.burnRemainingGameSeconds]).toEqual([
      false,
      0,
      false,
      0,
    ]);
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

    const expiresAt = glowstick.litAtGameTimestamp! + glowstick.burnRemainingGameSeconds!;
    sim.setDebugCalendarTime(expiresAt - 1.5 * sim.clock.ratio);
    sim.scheduler.advance(1);
    expect(glowstick.on).toBe(true);
    expect(inventory.version).toBe(version);
    sim.scheduler.advance(1);
    expect(glowstick.on).toBe(false);
    expect(inventory.version).toBe(version + 1);
  });

  it('preserves the remaining time when a candle is doused and relit', () => {
    const burnTime = registry.items.get('candle')!.light!.burnTimeGameHours!;
    const duration = burnTime;
    const candle = new Inventory(registry).create('candle');
    expect(toggleLight(registry, candle, 0)).toBeUndefined();
    expect(drainBurnLight(candle, duration / 2)).toBe(false);
    expect(toggleLight(registry, candle, duration / 2)).toBeUndefined();
    expect(candle.on).toBe(false);
    expect(candle.burnRemainingGameSeconds).toBeCloseTo(burnTime / 2, 9);

    expect(toggleLight(registry, candle, duration / 2)).toBeUndefined();
    expect(drainBurnLight(candle, duration)).toBe(true);
    expect(candle.on).toBe(false);
    expect(candle.burnRemainingGameSeconds).toBe(0);
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
    expect(candle.burnRemainingGameSeconds).toBeGreaterThan(0);
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
    const burnLights = [...registry.items.values()].filter(({ light }) => light?.burnTimeGameHours !== undefined);
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

  it('keeps every dropped burn light burning on its fuel until it burns out on the floor', () => {
    const burnLights = [...registry.items.values()].filter(({ light }) => light?.burning !== undefined);
    const igniter = [...registry.items.values()].find((definition) => definition.igniter)!.id;
    expect(burnLights.length).toBeGreaterThan(0);

    for (const definition of burnLights) {
      const { sim, inventory, survival, hold } = setup();
      const light = hold(definition.id);
      if (definition.light!.burning!.ignition === 'firestarter') {
        hold(igniter, 'left');
      }
      expect(survival.use(light)).toBeUndefined();
      expect(inventory.move(light, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
      sim.scheduler.advance(1);
      expect([definition.id, light.on]).toEqual([definition.id, true]);

      const expiresAt = light.litAtGameTimestamp! + light.burnRemainingGameSeconds!;
      sim.setDebugCalendarTime(expiresAt - 1.5 * sim.clock.ratio);
      sim.scheduler.advance(1);
      expect(light.on).toBe(true);
      sim.scheduler.advance(1);
      expect([light.on, light.burnRemainingGameSeconds]).toEqual([false, 0]);
    }
  });

  it('does not let a used glowstick be doused or relit', () => {
    const spec = registry.items.get('glowstick')!.light!;
    const glowstick = { uid: 1, type: 'glowstick', count: 1, condition: 1 };
    expect(toggleLight(registry, glowstick, 0)).toBeUndefined();
    expect(toggleLight(registry, glowstick, 1)).toEqual(expect.any(String));
    expect(drainBurnLight(glowstick, spec.burnTimeGameHours!)).toBe(true);
    expect(toggleLight(registry, glowstick, spec.burnTimeGameHours!)).toEqual(expect.any(String));
  });
});
