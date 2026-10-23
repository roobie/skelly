import { describe, expect, it } from 'vitest';
import { chargeOf } from '../src/core/lights.ts';
import { useOption } from '../src/core/options.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { startupContent } from './baseRegistry.ts';

const { registry } = startupContent();
const FRAME = 1 / 60;

const lampType = [...registry.items.values()].find(
  ({ light, tool }) => light?.fuelPerGameHour !== undefined && tool?.fuel !== undefined,
)!;
const lighterType = [...registry.items.values()].find(({ igniter }) => igniter)!;

const runtime = () => {
  const session = createSession({
    registry,
    world: new World(),
    scale: makeScale(0.5),
    seed: 5,
    start: 43_200,
    spawn: [0.5, 1, 0.5],
    isSolid: (_x: number, y: number) => y === 0,
    isOpaque: (_x: number, y: number) => y === 0,
    ready: () => true,
    controls: {
      active: () => true,
      blocking: () => false,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    refusal: () => undefined,
    onRead: () => undefined,
  });
  session.sim.paused = false;
  /** Runs past the once-a-second light tick, which applies the drop rule and burns fuel. */
  const tick = () => {
    for (let elapsed = 0; elapsed < 1.5; elapsed += FRAME) {
      session.frame(FRAME);
    }
  };
  return { session, tick };
};

const heldLamp = (fill: number | undefined) => {
  const { session, tick } = runtime();
  const lamp = session.inventory.create(lampType.id);
  const lighter = session.inventory.create(lighterType.id);
  if (
    !(
      session.inventory.add(lamp, { kind: 'hand', side: 'right' }) &&
      session.inventory.add(lighter, { kind: 'hand', side: 'left' })
    )
  ) {
    throw new Error('fixture could not fill the hands');
  }
  if (fill !== undefined) {
    const canister = session.inventory.create(lampType.tool!.fuel!.canister);
    canister.charges = fill;
    session.inventory.fitSlot(lamp, 'canister', canister);
  }
  return { session, tick, lamp };
};

describe('fuelled lamp', () => {
  it('names a compatible canister when offering to fuel a lamp', () => {
    const { session } = heldLamp(undefined);
    const canister = session.inventory.create(lampType.tool!.fuel!.canister);
    expect(session.inventory.add(canister, { kind: 'pile', pos: session.feet() })).toBe(true);
    const option = useOption(canister, session.reach());
    expect(option.operation).toBe('canister');
    expect(option.label).toContain(session.inventory.name(canister).toLowerCase());
  });

  it('will not light without fuel in its canister slot', () => {
    const { session, lamp } = heldLamp(undefined);
    expect(session.survival.use(lamp)).toBeDefined();
    expect(lamp.on).toBeFalsy();
  });

  it('set down lit, it burns the fuel in its canister slot', () => {
    const full = registry.items.get(lampType.tool!.fuel!.canister)!.canister!.capacity;
    const { session, tick, lamp } = heldLamp(full);
    expect(session.survival.use(lamp)).toBeUndefined();
    expect(session.inventory.move(lamp, { kind: 'pile', pos: [2, 1, 0] }).ok).toBe(true);
    tick();
    expect(lamp.on).toBe(true);
    expect(chargeOf(registry, lamp)!).toBeLessThan(full);
  });

  it('goes out where it stands when its fuel runs dry', () => {
    const { session, tick, lamp } = heldLamp(Number.EPSILON);
    expect(session.survival.use(lamp)).toBeUndefined();
    expect(session.inventory.move(lamp, { kind: 'pile', pos: [2, 1, 0] }).ok).toBe(true);
    tick();
    expect(lamp.on).toBeFalsy();
    expect(chargeOf(registry, lamp)).toBe(0);
  });
});
