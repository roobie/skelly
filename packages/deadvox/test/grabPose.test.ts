import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory, type Target } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import type { MeleePoseFrame } from '../src/core/meleePose.ts';
import { simSeconds } from '../src/core/time.ts';
import { grabPose, worldGrabProgress } from '../src/render/grabPose.ts';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureFood, foodFixtureRegistry } from './foodFixture.ts';

describe('ground-item grab pose', () => {
  it('reaches forward and down, then returns to the underlying hand pose', () => {
    const neutral: MeleePoseFrame = {
      right: { offset: [0, 0, 0], rotation: [0, 0, 0] },
      left: { offset: [0, 0, 0], rotation: [0, 0, 0] },
    };
    const start = grabPose(neutral, 0);
    const reach = grabPose(neutral, 0.5);
    const finish = grabPose(neutral, 1);

    expect(start).toEqual(neutral);
    expect(finish).toEqual(neutral);
    for (const hand of [reach.right, reach.left]) {
      expect(hand.offset[1]).toBeLessThan(0);
      expect(hand.offset[2]).toBeLessThan(0);
    }
  });
});

const food = foodFixtureRegistry(baseRegistry());
const registry = {
  ...food,
  items: new Map(food.items).set('grab_bag', {
    ...fixtureFood,
    id: 'grab_bag',
    category: 'bag' as const,
    food: undefined,
    stack: undefined,
    container: { pockets: [{ grid: [2, 2] as [number, number], handlingSimSeconds: simSeconds(1) }], rigid: false },
  }),
};
const FLOOR: Vec3 = [0, 1, 0];
const RIGHT_HAND: Target = { kind: 'hand', side: 'right' };

const put = (inventory: Inventory, type: string, target: Target): Item => {
  const item = inventory.create(type, 1);
  if (!inventory.add(item, target)) {
    throw new Error(`Fixture ${type} did not fit`);
  }
  return item;
};
const bagPocket = (inventory: Inventory, at: Target): Target => ({
  kind: 'pocket',
  owner: put(inventory, 'grab_bag', at),
  pocket: 0,
});

/** Starts a move a player could start and runs it halfway. */
const halfwayMove = (from: (inventory: Inventory) => Target, into: (inventory: Inventory) => Target) => {
  const inventory = new Inventory(registry);
  const item = put(inventory, 'fixture_empty', from(inventory));
  const queue = new HandlingQueue(inventory);
  const queued = queue.enqueue(item, into(inventory));
  if (!queued.ok) {
    throw new Error(queued.reason);
  }
  const { duration } = queued.job;
  queue.tick(duration / 2);
  return { duration, progress: worldGrabProgress(inventory, queue.jobs[0]) };
};

describe('world grab progress', () => {
  it('a take from storage reaches out like a pickup from the ground', () => {
    const sources: Record<string, (inventory: Inventory) => Target> = {
      ground: () => ({ kind: 'pile', pos: FLOOR }),
      furniture: (inventory) => {
        const [type, def] = [...registry.furniture.entries()].find(([, f]) => f.container && !f.door)!;
        const entity = inventory.furnish({ type, pos: [8, 1, 8], size: [...def.size], facing: 'n' })!;
        inventory.entities.markSearched(entity);
        return { kind: 'furniture', entity, pocket: 0 };
      },
      bagOnTheGround: (inventory) => bagPocket(inventory, { kind: 'pile', pos: FLOOR }),
    };
    for (const [source, from] of Object.entries(sources)) {
      const { progress } = halfwayMove(from, () => RIGHT_HAND);
      expect(progress, source).toBeTypeOf('number');
      expect(progress, source).toBeGreaterThan(0);
      expect(progress, source).toBeLessThan(1);
    }
  });

  it('a move among carried things does not reach out', () => {
    const { duration, progress } = halfwayMove(
      () => RIGHT_HAND,
      (inventory) => bagPocket(inventory, { kind: 'hand', side: 'left' }),
    );
    expect(duration).toBeGreaterThan(0);
    expect(progress).toBeUndefined();
  });
});
