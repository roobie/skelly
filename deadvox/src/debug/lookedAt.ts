// "What am I looking at": names the block or furniture under the crosshair for the debug
// readout, so colours and materials can be talked about by id.

import type { BlockEntities, BlockEntity } from '../core/blockEntities.ts';
import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { pickFurniture } from '../core/furniturePick.ts';
import { raycast, type SolidAt } from '../core/raycast.ts';
import type { World } from '../core/world.ts';

/** Metres: how far the readout looks. */
export const LOOK_REACH = 16;

export interface LookedAtWorld {
  world: Pick<World, 'getBlock'>;
  registry: Pick<Registry, 'blocks'>;
  entities: BlockEntities;
  /** Blocks and furniture that stop movement. */
  isSolid: SolidAt;
  /** Metres per block. */
  blockSize: number;
}

/** " · door (open)", " · container", or nothing for plain furniture. */
const furnitureKind = (entity: BlockEntity, isDoor: boolean): string => {
  if (isDoor) {
    return ` · door (${entity.open ? 'open' : 'closed'})`;
  }
  return entity.pockets ? ' · container' : '';
};

/**
 * One line naming what a ray from `eye` along the unit vector `dir` (both in blocks) meets
 * within `LOOK_REACH`, or '' for nothing. Furniture and doors are found by the same pick F uses.
 * Block coordinates are in blocks; distances are in metres.
 */
export const describeLookedAt = (
  { world, registry, entities, isSolid, blockSize }: LookedAtWorld,
  eye: Vec3,
  dir: Vec3,
): string => {
  const reachBlocks = LOOK_REACH / blockSize;
  const entity = pickFurniture({
    entities,
    origin: eye,
    direction: dir,
    maxDistance: reachBlocks,
    blockSize,
    isSolid,
  });
  if (entity) {
    const def = entities.defOf(entity);
    const metres = entities.distance(entity, eye) * blockSize;
    return `${def.id} · ${def.name}${furnitureKind(entity, def.door !== undefined)} · block ${entity.pos.join(',')} · ${metres.toFixed(1)} m`;
  }
  const hit = raycast(eye, dir, reachBlocks, isSolid);
  const block = hit && registry.blocks[world.getBlock(...hit.block)];
  if (!(hit && block) || block.id === 'air') {
    return '';
  }
  return `${block.id} · ${block.name} · ${block.color} · block ${hit.block.join(',')} · ${(hit.distance * blockSize).toFixed(1)} m`;
};
