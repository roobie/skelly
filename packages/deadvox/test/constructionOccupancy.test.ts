import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { BlockEntitiesState, BlockEntity } from '../src/core/blockEntities.ts';
import { worldOpaque, worldSolid } from '../src/core/collision.ts';
import { pickFurnitureAndObstruction } from '../src/core/furniturePick.ts';
import { Inventory } from '../src/core/inventory.ts';
import { type Body, stepBodyHorizontal } from '../src/core/physics.ts';
import { raycast, type SolidAt } from '../src/core/raycast.ts';
import { bindReach, type ReachPlayer } from '../src/core/reach.ts';
import { captureSky, furnitureBounds, growSky, SKY_SHELL } from '../src/core/skySnapshot.ts';
import { type BrickOut, brickHas, type SolidBricks, worldBricks } from '../src/core/solidBricks.ts';
import { World } from '../src/core/world.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';

const base = readdirSync('src/content/base')
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({
    source: f,
    data: JSON.parse(readFileSync(join('src/content/base', f), 'utf8')) as unknown,
  }));
const { registry, issues } = buildRegistry([
  ...base,
  {
    source: 'construction-occupancy.json',
    data: {
      furniture: [
        {
          id: 'occupancy_door',
          name: 'Fixture door',
          size: [2, 4, 1],
          color: '#666666',
          door: { material: 'wood', methods: {}, handlingSimSeconds: 0.3 },
        },
        {
          id: 'occupancy_crate',
          name: 'Fixture crate',
          size: [1, 1, 1],
          color: '#ffffff',
          container: { pockets: [{ grid: [2, 2], handlingSimSeconds: 1 }] },
        },
      ],
      items: [{ id: 'occupancy_item', name: 'Fixture item', category: 'material', weight: 1, size: [1, 1] }],
    },
  },
]);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const SOLID = registry.blocks.findIndex((block, id) => id > 0 && block?.solid === true);
const BLOCK_SIZE = 0.5;
const PARAMS = { gravity: 0, stepHeight: 0 };

/** A door across the actor's path, with a stocked crate behind it and off the path. */
const site = () => {
  const world = new World();
  for (let x = -6; x < 6; x++) {
    for (let z = -6; z < 6; z++) {
      world.setBlock(x, 0, z, SOLID);
    }
  }
  const inventory = new Inventory(registry);
  const { entities } = inventory;
  const door = inventory.furnish({ type: 'occupancy_door', pos: [0, 1, 0], size: [2, 4, 1], facing: 'n' })!;
  const crate = inventory.furnish({ type: 'occupancy_crate', pos: [-1, 1, 2], size: [1, 1, 1], facing: 'n' })!;
  if (!inventory.add(inventory.create('occupancy_item'), { kind: 'furniture', entity: crate, pocket: 0 })) {
    throw new Error('Fixture item did not fit');
  }
  const save = (): BlockEntitiesState => JSON.parse(JSON.stringify(entities.snapshotState())) as BlockEntitiesState;
  return { world, inventory, entities, door, crate, save, isSolid: worldSolid(world, registry, entities) };
};

const actorAt = (z: number): Body => ({ pos: [1, 1, z], vel: [0, 0, 0], halfWidth: 0.4, height: 3.4, onGround: true });

/** Where an actor walking through the doorway from in front of it ends up. */
const walk = (isSolid: SolidAt): number => {
  const actor = actorAt(-1.5);
  stepBodyHorizontal(actor, { dx: 0, dz: 3, isSolid, params: PARAMS });
  return actor.pos[2];
};

/** The cells around the door where the solid bricks and the live solid query disagree. */
const brickMismatches = (bricks: SolidBricks, isSolid: SolidAt): string[] => {
  const out: BrickOut = { lo: 0, hi: 0 };
  const mismatches: string[] = [];
  for (let x = -2; x < 4; x++) {
    for (let y = 0; y < 7; y++) {
      for (let z = -2; z < 4; z++) {
        const any = bricks.brick(x >> 2, y >> 2, z >> 2, out);
        if (isSolid(x, y, z) !== (any && brickHas(out, x & 3, y & 3, z & 3))) {
          mismatches.push(`${x},${y},${z}`);
        }
      }
    }
  }
  return mismatches;
};

it('stops movement at a placed or restored door and lets it through once the door is removed', () => {
  const { world, entities, door, save, isSolid } = site();
  const bricks = worldBricks(world, registry, entities);
  const placed = save();
  expect(walk(isSolid)).toBeLessThan(0);
  expect(brickMismatches(bricks, isSolid)).toEqual([]);

  entities.remove(door);
  expect(walk(isSolid)).toBeGreaterThan(1);
  expect(brickMismatches(bricks, isSolid)).toEqual([]);

  entities.restoreState(placed);
  expect(walk(isSolid)).toBeLessThan(0);
  expect(brickMismatches(bricks, isSolid)).toEqual([]);
});

it('picks a placed or restored door and nothing once it is removed', () => {
  const { entities, door, save, isSolid } = site();
  const pick = () =>
    pickFurnitureAndObstruction({
      entities,
      origin: [1, 3, -2],
      direction: [0, 0, 1],
      maxDistance: 6,
      blockSize: BLOCK_SIZE,
      isSolid,
    });
  const placed = save();
  expect(pick().furniture?.entity.uid).toBe(door.uid);

  entities.remove(door);
  expect(pick()).toEqual({ furniture: undefined, obstructionDistanceBlocks: undefined });

  entities.restoreState(placed);
  expect(pick().furniture?.entity.uid).toBe(door.uid);
});

it('hides what is behind a placed or restored door and shows it once the door is removed', () => {
  const { world, entities, door, save } = site();
  const opaque = worldOpaque(world, registry, entities);
  const sees = () => raycast([1, 3, -2], [0, 0, 1], 5, opaque) === undefined;
  const placed = save();
  expect(sees()).toBe(false);

  entities.remove(door);
  expect(sees()).toBe(true);

  entities.restoreState(placed);
  expect(sees()).toBe(false);
});

it('lets sky light through a removed door and blocks it again after a restore', () => {
  const { world, entities, door, save } = site();
  const doorBoxes = furnitureBounds(entities).filter(({ min }) => min.every((value, axis) => value === door.pos[axis]));
  const capture = () => {
    const iterator = captureSky({ world, entities, registry }, growSky(doorBoxes[0]!, SKY_SHELL), {
      bottom: 0,
      top: 31,
    });
    let next = iterator.next();
    while (!next.done) {
      next = iterator.next();
    }
    return next.value;
  };
  const saved = save();
  const placed = capture();
  expect(doorBoxes.length).toBeGreaterThan(0);
  expect(placed.input.furniture).toEqual(expect.arrayContaining(doorBoxes));

  entities.remove(door);
  expect(placed.current()).toBe(false);
  const removed = capture();
  for (const box of doorBoxes) {
    expect(removed.input.furniture).not.toContainEqual(box);
  }

  entities.restoreState(saved);
  expect(removed.current()).toBe(false);
  expect(capture().input.furniture).toEqual(placed.input.furniture);
});

it('refreshes a reach view when a closed door is removed', () => {
  const { inventory, entities, door, crate, isSolid } = site();
  const player: ReachPlayer = {
    inventory,
    position: [1, 1, -1],
    blockSize: BLOCK_SIZE,
    clock: BASE_CLOCK,
    obstacles: { isSolid, version: 0 },
  };
  const view = bindReach(player);
  const reached = () => view().furniture.map((entity: BlockEntity) => entity.uid);
  expect(reached()).toEqual([]);

  entities.remove(door);
  expect(reached()).toEqual([crate.uid]);
});

it('refreshes a reach view across restores of saves that hold as many pieces', () => {
  const { inventory, entities, door, crate, save, isSolid } = site();
  const player: ReachPlayer = {
    inventory,
    position: [1, 1, -1],
    blockSize: BLOCK_SIZE,
    clock: BASE_CLOCK,
    obstacles: { isSolid, version: 0 },
  };
  const view = bindReach(player);
  const closed = save();
  entities.setOpen(door, true);
  const opened = save();
  const reached = () => view().furniture.map((entity: BlockEntity) => entity.uid);

  entities.restoreState(closed);
  expect(reached()).toEqual([]);
  entities.restoreState(opened);
  expect(inventory.canReachEntity(entities.byUid(crate.uid)!)).toBe(true);
  expect(reached()).toEqual([crate.uid]);
});

it('refuses to remove a container that still holds items', () => {
  const { entities, crate, isSolid } = site();
  expect(() => entities.remove(crate)).toThrow('holds items');
  expect(isSolid(-1, 1, 2)).toBe(true);
});
