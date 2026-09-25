// Milestone 1.0's test scene: a small two-room house next to spawn, defined in
// metres so it can be compared at different block sizes. Its rooms have a front door,
// windows, a kitchen counter, a table, a bed, and full-block stairs up to a roof
// terrace. The ground around it is levelled.

import type { Vec3 } from '../core/coords.ts';
import type { MetreBox } from '../core/structure.ts';

export interface HouseBlocks {
  brick: number;
  plaster: number;
  planks: number;
  tiles: number;
  fabric: number;
  roof: number;
  dirt: number;
  grass: number;
}

/** Storey height in metres. */
const STOREY = 3;

/**
 * The house as boxes applied in order.
 * @param origin the lot's north-west corner at floor level, in whole metres
 * @param blockSize stairs rise one block per step, so they depend on it
 */
export const testHouse = (origin: Vec3, b: HouseBlocks, blockSize: number): MetreBox[] => {
  const [ox, oy, oz] = origin;
  const box = (min: Vec3, max: Vec3, block: number): MetreBox => ({
    min: [ox + min[0], oy + min[1], oz + min[2]],
    max: [ox + max[0], oy + max[1], oz + max[2]],
    block,
  });
  const air = 0;
  const boxes: MetreBox[] = [
    // Level lot: solid ground below the floor, nothing above it.
    box([-10, -8, -3], [13, 0, 10], b.dirt),
    box([-10, -0.5, -3], [13, 0, 10], b.grass),
    box([-10, 0, -3], [13, 16, 10], air),
    // Floor (kitchen tiled), outer walls, interior wall, roof.
    box([0, -0.5, 0], [10, 0, 7], b.planks),
    box([0.5, -0.5, 0.5], [5, 0, 6.5], b.tiles),
    box([0, 0, 0], [10, STOREY, 0.5], b.brick),
    box([0, 0, 6.5], [10, STOREY, 7], b.brick),
    box([0, 0, 0], [0.5, STOREY, 7], b.brick),
    box([9.5, 0, 0], [10, STOREY, 7], b.brick),
    box([5, 0, 0.5], [5.5, STOREY, 6.5], b.plaster),
    box([0, STOREY, 0], [10, STOREY + 0.5, 7], b.roof),
    // Openings: front door (west), interior doorway, windows, roof hatch over the stairs.
    box([0, 0, 3], [0.5, 2, 4], air),
    box([5, 0, 3], [5.5, 2, 4], air),
    box([2, 1, 0], [3, 2, 0.5], air),
    box([2, 1, 6.5], [3, 2, 7], air),
    box([7, 1, 6.5], [8, 2, 7], air),
    box([9.5, 1, 3], [10, 2, 4], air),
    box([6, STOREY, 0.5], [9, STOREY + 0.5, 1.5], air),
    // Kitchen: counter along the north wall, table. Bedroom: bed.
    box([1, 0, 0.5], [4, 0.9, 1.1], b.tiles),
    box([2.5, 0, 4.5], [4, 0.75, 5.5], b.planks),
    box([7.5, 0, 4.5], [9.5, 0.5, 6.5], b.fabric),
  ];
  // Stairs in the bedroom, rising east along the north wall: one block per step.
  const steps = Math.round(STOREY / blockSize);
  for (let i = 0; i < steps; i++) {
    const x = 6 + i * blockSize;
    boxes.push(box([x, 0, 0.5], [x + blockSize, (i + 1) * blockSize, 1.5], b.planks));
  }
  return boxes;
};

/** Where to put the house relative to the world origin, and where the player starts (metres). */
export const HOUSE_OFFSET: readonly [number, number] = [4, -4];
/** On the lot, 8 m out from the front door and facing it, so the whole house is in view. */
export const SPAWN_OFFSET: Vec3 = [-8, 0, 3.5];
/** Yaw that faces +x (east), toward the front door. */
export const SPAWN_YAW = -Math.PI / 2;
/** The lot's centre, used to pick its floor height. */
export const LOT_CENTRE: readonly [number, number] = [5, 3.5];
