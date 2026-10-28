import { expect, it } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { guardLean, leanFrame } from '../src/core/lean.ts';
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
