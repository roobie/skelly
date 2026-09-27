import type { BlockEntities } from './blockEntities.ts';
import type { Registry } from './content.ts';
import type { SolidAt } from './raycast.ts';
import type { World } from './world.ts';

/** The game's collision/raycast solids: solid world blocks plus closed block entities. */
export const worldSolid =
  (world: World, registry: Registry, entities: BlockEntities): SolidAt =>
  (x, y, z) => {
    const block = world.getBlock(x, y, z);
    return (block !== 0 && registry.blocks[block]!.solid) || entities.isSolid(x, y, z);
  };
