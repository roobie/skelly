import { expect, it, vi } from 'vitest';
import { createLeanGuard, guardLean } from '../src/core/lean.ts';
import type { Vec3 } from '../src/world.ts';

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
