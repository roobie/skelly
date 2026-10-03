import type { BlockEntities } from './blockEntities.ts';
import type { Registry } from './content.ts';
import type { SolidAt } from './raycast.ts';
import type { World } from './world.ts';

/** Movement, melee and acoustic blockers, including closed doors/furniture. */
export const worldSolid =
  (world: World, registry: Registry, entities: BlockEntities): SolidAt =>
  (x, y, z) => {
    const block = world.getBlock(x, y, z);
    return (block !== 0 && registry.blocks[block]!.solid) || entities.isSolid(x, y, z);
  };

/** Sight, aim and pick blockers. Foliage can hide actors without stopping their bodies or sounds. */
export const worldOpaque =
  (world: World, registry: Registry, entities: BlockEntities): SolidAt =>
  (x, y, z) => {
    const block = world.getBlock(x, y, z);
    const definition = registry.blocks[block];
    return (block !== 0 && Boolean(definition?.opaque ?? definition?.solid)) || entities.isSolid(x, y, z);
  };
