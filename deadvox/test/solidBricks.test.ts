import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { worldSolid } from '../src/core/collision.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { type BrickOut, brickHas, type SolidBricks, worldBricks } from '../src/core/solidBricks.ts';
import { World } from '../src/core/world.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SOLID = registry.blocks.findIndex((block, id) => id > 0 && block?.solid === true);

/** Each block of brick (bx, by, bz): where it is, whether `isSolid` says solid, and whether the brick does. */
const blocksOf = (bricks: SolidBricks, isSolid: SolidAt, [bx, by, bz]: readonly number[]) => {
  const out: BrickOut = { lo: 0, hi: 0 };
  const any = bricks.brick(bx!, by!, bz!, out);
  return Array.from({ length: 64 }, (_, cell) => {
    const [lx, ly, lz] = [cell & 3, cell >> 4, (cell >> 2) & 3];
    const at = [bx! * 4 + lx, by! * 4 + ly, bz! * 4 + lz] as const;
    return { at, solid: isSolid(...at), brick: any && brickHas(out, lx, ly, lz) };
  });
};

/** Every block of the bricks around the origin, as the bricks read it against `isSolid`. */
const compare = (bricks: SolidBricks, isSolid: SolidAt): { mismatches: string[]; solid: number } => {
  const around = [-2, -1, 0, 1, 2];
  const blocks = around.flatMap((bx) =>
    [0, 1, 2].flatMap((by) => around.flatMap((bz) => blocksOf(bricks, isSolid, [bx, by, bz]))),
  );
  return {
    mismatches: blocks.filter((block) => block.solid !== block.brick).map((block) => block.at.join(',')),
    solid: blocks.filter((block) => block.solid).length,
  };
};

it('reads the solid blocks worldSolid reads, after blocks change and a door opens', () => {
  const world = new World();
  for (let x = -6; x < 6; x++) {
    for (let z = -6; z < 6; z++) {
      world.setBlock(x, 0, z, SOLID);
    }
  }
  world.setBlock(2, 1, 2, SOLID);
  const entities = new BlockEntities(registry);
  const door = entities.add({ type: 'wood_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' })!;
  const bricks = worldBricks(world, registry, entities);
  const isSolid = worldSolid(world, registry, entities);
  const before = compare(bricks, isSolid);
  const { version } = bricks;
  expect(before.mismatches).toEqual([]);

  world.setBlock(2, 1, 2, 0);
  world.setBlock(-3, 2, 1, SOLID);
  entities.setOpen(door, true);
  const after = compare(bricks, isSolid);
  expect(after.solid).not.toBe(before.solid);
  expect(bricks.version).not.toBe(version);
  expect(after.mismatches).toEqual([]);
});
