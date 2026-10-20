// "What am I looking at": names the block or furniture under the crosshair for the debug
// readout, so colours and materials can be talked about by id.

import type { BlockEntities, BlockEntity } from '../core/blockEntities.ts';
import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { crosshairTarget } from '../core/crosshairTarget.ts';
import type { SolidAt } from '../core/raycast.ts';
import type { World } from '../core/world.ts';

/** Metres: how far the readout looks. */
const LOOK_REACH = 16;

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
  const target = crosshairTarget({ world, registry, entities, isSolid, blockSize }, eye, dir, LOOK_REACH / blockSize);
  if (target?.entity) {
    const def = entities.defOf(target.entity);
    return `${def.id} · ${def.name}${furnitureKind(target.entity, def.door !== undefined)} · block ${target.entity.pos.join(',')} · ${target.distanceMetres.toFixed(1)} m`;
  }
  const block = target?.block && registry.blocks[world.getBlock(...target.block)];
  if (!(target?.block && block) || block.id === 'air') {
    return '';
  }
  return `${block.id} · ${block.name} · ${block.color} · block ${target.block.join(',')} · ${target.distanceMetres.toFixed(1)} m`;
};
