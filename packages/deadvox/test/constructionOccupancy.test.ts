import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { BlockEntities, BlockEntitiesState, BlockEntity } from '../src/core/blockEntities.ts';
import { terrainSolid, worldOpaque, worldSolid } from '../src/core/collision.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { type FurnitureMover, removeFurniture } from '../src/core/furnitureMove.ts';
import { pickFurnitureAndObstruction } from '../src/core/furniturePick.ts';
import { Inventory } from '../src/core/inventory.ts';
import { type Body, stepBodyHorizontal } from '../src/core/physics.ts';
import { raycast, type SolidAt } from '../src/core/raycast.ts';
import { bindReach, type ReachPlayer } from '../src/core/reach.ts';
import { captureSky, furnitureBounds, growSky, SKY_SHELL } from '../src/core/skySnapshot.ts';
import { type BrickOut, brickHas, type SolidBricks, worldBricks } from '../src/core/solidBricks.ts';
import { cellsOf } from '../src/core/templates.ts';
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
          door: {
            material: 'wood',
            methods: {},
            handlingSimSeconds: 0.3,
          },
        },
        {
          id: 'occupancy_crate',
          name: 'Fixture crate',
          size: [1, 1, 1],
          color: '#ffffff',
          container: { pockets: [{ grid: [2, 2], handlingSimSeconds: 1 }] },
        },
        { id: 'occupancy_block', name: 'Fixture block', size: [1, 1, 1], color: '#999999' },
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
  expect(() => entities.remove(crate)).toThrow();
  expect(isSolid(-1, 1, 2)).toBe(true);
});

/** Stands still well away from the pieces, so only what a test puts on them holds them. */
const bystander = (): Body => ({ pos: [-4.5, 1, -4.5], vel: [0, 0, 0], halfWidth: 0.4, height: 3.4, onGround: true });

const moverAt = (inventory: Inventory, world: World, player = bystander()): FurnitureMover => ({
  inventory,
  terrainSolid: terrainSolid(world, registry),
  blockSize: BLOCK_SIZE,
  player,
  others: [],
  stamina: 1,
});

/** The cells, record and solidity a piece holds, to show a refusal left them as they were. */
const occupancy = (entities: BlockEntities, isSolid: SolidAt, piece: BlockEntity) =>
  [...cellsOf(piece.size)].map(([x, y, z]) => {
    const cell: Vec3 = [piece.pos[0] + x, piece.pos[1] + y, piece.pos[2] + z];
    return { at: entities.at(...cell) === piece, solid: isSolid(...cell), live: entities.byUid(piece.uid) === piece };
  });

it('throws on removing through a handle from before a restore, leaving the restored piece in its cells', () => {
  const { entities, door, save, isSolid } = site();
  entities.restoreState(save());
  const live = entities.byUid(door.uid)!;
  expect(live).not.toBe(door);
  const before = occupancy(entities, isSolid, live);

  expect(() => entities.remove(door)).toThrow();
  expect(occupancy(entities, isSolid, live)).toEqual(before);
  expect(before.every(({ at, solid, live: held }) => at && solid && held)).toBe(true);
});

it('refuses to remove a door barricaded in its doorway until the barricade is lifted', () => {
  const { world, inventory, entities, door } = site();
  const mover = moverAt(inventory, world);
  entities.setOpen(door, true);
  const barricade = entities.add({ type: 'occupancy_block', pos: [1, 1, 0], size: [1, 1, 1], facing: 'n' });
  expect(barricade && entities.at(1, 1, 0)).toBe(barricade);

  expect(removeFurniture(mover, door)).toBeDefined();
  expect(() => entities.remove(door)).toThrow();
  expect(entities.doorAt(0, 1, 0)).toBe(door);

  entities.lift(barricade!);
  expect(removeFurniture(mover, door)).toBeUndefined();
  expect(entities.byUid(door.uid)).toBeUndefined();
  expect(entities.doorAt(0, 1, 0)).toBeUndefined();
});

it('refuses to remove a piece with a piece, a pile or the player on it, leaving its occupancy unchanged', () => {
  /** Each puts its load on the cell above the stand and returns who the player is. */
  const cases: Record<string, (fixture: ReturnType<typeof site>) => Body> = {
    piece: ({ entities }) => {
      entities.add({ type: 'occupancy_block', pos: [3, 2, 3], size: [1, 1, 1], facing: 'n' });
      return bystander();
    },
    pile: ({ inventory }) => {
      if (!inventory.add(inventory.create('occupancy_item'), { kind: 'pile', pos: [3, 2, 3] })) {
        throw new Error('Fixture pile did not fit');
      }
      return bystander();
    },
    player: () => ({ pos: [3.5, 2, 3.5], vel: [0, 0, 0], halfWidth: 0.4, height: 3.4, onGround: true }),
  };
  for (const [what, load] of Object.entries(cases)) {
    const fixture = site();
    const { world, inventory, entities, isSolid } = fixture;
    const stand = entities.add({ type: 'occupancy_block', pos: [3, 1, 3], size: [1, 1, 1], facing: 'n' })!;
    const mover = moverAt(inventory, world, load(fixture));
    const before = occupancy(entities, isSolid, stand);

    expect(removeFurniture(mover, stand), what).toBeDefined();
    expect(occupancy(entities, isSolid, stand), what).toEqual(before);
    expect(before[0], what).toEqual({ at: true, solid: true, live: true });
  }
});

it('removes a piece with nothing on it', () => {
  const { world, inventory, entities, isSolid } = site();
  const stand = entities.add({ type: 'occupancy_block', pos: [3, 1, 3], size: [1, 1, 1], facing: 'n' })!;
  expect(removeFurniture(moverAt(inventory, world), stand)).toBeUndefined();
  expect(isSolid(3, 1, 3)).toBe(false);
});
