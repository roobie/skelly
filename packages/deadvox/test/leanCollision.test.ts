import { expect, it, vi } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { createLeanGuard, guardLean, leanFrame } from '../src/core/lean.ts';
import { playerLeanBoxes } from '../src/core/leanCollision.ts';
import { playerLookPose } from '../src/core/playerLookPose.ts';
import { baseRegistry } from './baseRegistry.ts';

it('shortens lean for the physical gun even when the eye has room beside cover', () => {
  const registry = baseRegistry();
  const inventory = new Inventory(registry);
  const [type] = [...registry.items].find(([, item]) => item.firearm && item.twoHanded)!;
  expect(inventory.add(inventory.create(type), { kind: 'hand', side: 'right' })).toBe(true);
  const figure = registry.figures.get('player')!;
  const tuning = registry.player.get('player')!.lean;
  const blockSize = 0.5;
  let feet: Vec3 = [0, 2, 0];
  const boxesAt = (fraction: number) =>
    playerLeanBoxes({
      inventory,
      feet,
      blockSize,
      yaw: 0,
      pitch: 0,
      aimFrame: NEUTRAL_AIM,
      ads: false,
      progress: () => 1,
      loweredPitchRadians: 0,
      pose: playerLookPose({
        figure,
        models: registry.models,
        stance: 'standing',
        pitch: 0,
        lean: leanFrame(fraction, tuning),
      }),
    });
  const rest = boxesAt(0);
  const full = boxesAt(1);
  expect(full.length).toBeGreaterThan(1);
  const frontCell = Math.floor(Math.min(...rest.slice(1).map(({ min }) => min[2])));
  const gunRight = (boxes: ReturnType<typeof boxesAt>) =>
    Math.max(
      ...boxes
        .slice(1)
        .filter(({ min, max }) => Math.floor(min[2]) <= frontCell && Math.floor(max[2]) >= frontCell)
        .map(({ max }) => max[0]),
    );
  const restRight = gunRight(rest);
  const fullRight = gunRight(full);
  expect(fullRight).toBeGreaterThan(restRight);
  feet = [1 - (restRight + fullRight) / 2, 2, 0];
  expect(Math.floor(boxesAt(1)[0]!.min[2])).not.toBe(frontCell);
  const amount = guardLean({
    amount: 1,
    rollRadians: leanFrame(1, tuning).rollRadians,
    boxesAt,
    isSolid: (x, _y, z) => x >= 1 && z === frontCell,
    marginBlocks: 0,
  });
  expect(amount).toBeGreaterThan(0);
  expect(amount).toBeLessThan(1);
  expect(gunRight(boxesAt(amount))).toBeLessThan(1);
});

it('sweeps lean from the body rather than admitting a clear endpoint beyond a thin wall', () => {
  const boxesAt = (fraction: number) => [
    { min: [fraction * 4, 2, 0] as Vec3, max: [fraction * 4, 2, 0] as Vec3, radius: 0 },
  ];
  const amount = guardLean({ amount: 1, rollRadians: 0, boxesAt, isSolid: (x) => x === 1, marginBlocks: 0 });
  expect(amount).toBeGreaterThan(0);
  expect(boxesAt(amount)[0]!.max[0]).toBeLessThan(1);
  expect(boxesAt(1)[0]!.min[0]).toBeGreaterThan(2);
});

const cacheFixture = () => ({
  amount: 1,
  rollRadians: 0,
  marginBlocks: 0,
  poseKey: [0],
  spaceKey: [0],
  boxesAt: vi.fn((amount: number) => [{ min: [amount * 4, 2, 0] as Vec3, max: [amount * 4, 2, 0] as Vec3, radius: 0 }]),
  isSolid: (x: number, _y: number, z: number) => x === 1 && z === 0,
});

it('does not repeat pose solves while a partial lean remains blocked by unchanged cover', () => {
  const guard = createLeanGuard();
  const input = cacheFixture();
  const amount = guard(input);
  expect(amount).toBeGreaterThan(0);
  expect(amount).toBeLessThan(1);
  input.boxesAt.mockClear();
  for (let tick = 0; tick < 10; tick++) {
    expect(guard({ ...input, amount })).toBe(amount);
  }
  expect(input.boxesAt.mock.calls.length).toBe(0);
});

it('invalidates clearance for changed surroundings but keeps translation-independent pose bounds', () => {
  const guard = createLeanGuard();
  const input = cacheFixture();
  const blocked = guard(input);
  expect(blocked).toBeGreaterThan(0);
  expect(blocked).toBeLessThan(1);
  input.boxesAt.mockClear();
  expect(guard({ ...input, offset: [0, 0, 2], spaceKey: [1] })).toBe(1);
  expect(input.boxesAt.mock.calls.length).toBe(0);
  guard({ ...input, poseKey: [1] });
  expect(input.boxesAt.mock.calls.length).toBeGreaterThan(0);
});

it('admits identical partial lean with a warm cache and a cold standalone replay cache', () => {
  const guard = createLeanGuard();
  const input = cacheFixture();
  guard({ ...input, amount: 0.1 });
  const blocked = guard(input);
  expect(blocked).toBeGreaterThan(0);
  expect(blocked).toBeLessThan(1);
  for (const amount of [blocked, 0.5, 1, -1]) {
    expect(guard({ ...input, amount })).toBe(createLeanGuard()({ ...input, amount }));
  }
});
