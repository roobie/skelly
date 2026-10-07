import { PointLight } from 'three';
import { describe, expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import { hasMetThrowMinimumHold, throwDistanceForItem, traceItemLanding } from '../src/core/itemThrow.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import type { Item } from '../src/core/items.ts';
import { ItemThrows } from '../src/render/itemThrows.ts';

const testItem = (type: string): Item => ({ uid: 1, type, count: 1, condition: 1 });
const testRegistry = (weights: Record<string, number>): Registry =>
  ({ items: new Map(Object.entries(weights).map(([id, weight]) => [id, { id, weight }])) }) as unknown as Registry;
const tuning = {
  maximumDistanceMetres: 8,
  chargeSimSeconds: 2,
  armSpeedMetresPerSecond: 9,
  armEnergyJoules: 60,
};

describe('held-item throws', () => {
  it('rejects a release before the minimum hold and accepts the boundary', () => {
    expect(hasMetThrowMinimumHold(0.99, 1)).toBe(false);
    expect(hasMetThrowMinimumHold(1, 1)).toBe(true);
  });

  it('limits heavier items to no greater range at the same charge', () => {
    const registry = testRegistry({ light: 450, heavy: 4000 });
    const heldSimSeconds = tuning.chargeSimSeconds;
    const lightRange = throwDistanceForItem(testItem('light'), registry, tuning, heldSimSeconds);
    const heavyRange = throwDistanceForItem(testItem('heavy'), registry, tuning, heldSimSeconds);

    expect(heavyRange).toBeLessThan(lightRange);
  });

  it('keeps a light item at the tuned maximum range at full charge', () => {
    const registry = testRegistry({ light: 450 });

    expect(throwDistanceForItem(testItem('light'), registry, tuning, tuning.chargeSimSeconds)).toBe(
      tuning.maximumDistanceMetres,
    );
  });

  it('presents an item flight without adding a point light to the shader pool', () => {
    const throws = new ItemThrows();
    throws.spawn([0, 1, 0], [2, 1, 0], '#d8d0c4');

    expect(throws.group.children.some((child) => child instanceof PointLight)).toBe(false);
    throws.dispose();
  });

  it('settles a charged arc on the thrower side of a near wall', () => {
    const isSolid: SolidAt = (x, y) => y === 0 || (x === 4 && y > 0 && y < 4);
    const landing = traceItemLanding({
      from: [1.5, 1.5, 1.5],
      direction: [1, 0, 0],
      distanceMetres: 8,
      blockSize: 1,
      minY: -8,
      isSolid,
    });

    expect(landing).toBeDefined();
    expect(landing![0]).toBeLessThan(4);
    expect(landing![1]).toBe(1);
  });

  it('stops the charged arc at a low ceiling and settles below it', () => {
    const isSolid: SolidAt = (x, y) => y === 0 || (y === 2 && x < 6);
    const landing = traceItemLanding({
      from: [1.5, 1.5, 1.5],
      direction: [1, 0, 0],
      distanceMetres: 8,
      blockSize: 1,
      minY: -8,
      isSolid,
    });

    expect(landing).toBeDefined();
    expect(landing![0]).toBeLessThan(6);
    expect(landing![1]).toBe(1);
  });
});
