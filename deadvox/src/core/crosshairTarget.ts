import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { pickFurnitureHit } from './furniturePick.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { World } from './world.ts';

export const SHOT_TRACE_RANGE_BLOCKS = 240;

export interface CrosshairTargetWorld {
  readonly world: Pick<World, 'getBlock'>;
  readonly registry: Pick<Registry, 'blocks'>;
  readonly entities: BlockEntities;
  readonly isSolid: SolidAt;
  readonly blockSize: number;
}

export interface CrosshairTarget {
  readonly distanceBlocks: number;
  readonly distanceMetres: number;
  readonly point: Vec3;
  readonly entity?: BlockEntity;
  readonly block?: Vec3;
}

export const crosshairTarget = (
  { world, registry, entities, isSolid, blockSize }: CrosshairTargetWorld,
  origin: Vec3,
  direction: Vec3,
  maxDistanceBlocks = SHOT_TRACE_RANGE_BLOCKS,
): CrosshairTarget | undefined => {
  const magnitude = Math.hypot(...direction);
  if (
    !(
      magnitude > 0 &&
      Number.isFinite(magnitude) &&
      origin.every(Number.isFinite) &&
      Number.isFinite(blockSize) &&
      blockSize > 0 &&
      Number.isFinite(maxDistanceBlocks) &&
      maxDistanceBlocks >= 0
    )
  ) {
    return undefined;
  }
  const dir: Vec3 = direction.map((component) => component / magnitude) as Vec3;
  const furniture = pickFurnitureHit({
    entities,
    origin,
    direction: dir,
    maxDistance: maxDistanceBlocks,
    blockSize,
    isSolid,
  });
  if (furniture && entities.blocks(furniture.entity)) {
    const { distanceBlocks } = furniture;
    return {
      distanceBlocks,
      distanceMetres: distanceBlocks * blockSize,
      point: origin.map((value, axis) => value + dir[axis]! * distanceBlocks) as Vec3,
      entity: furniture.entity,
    };
  }
  const hit = raycast(origin, dir, maxDistanceBlocks, isSolid);
  const block = hit && registry.blocks[world.getBlock(...hit.block)];
  if (!(hit && block) || block.id === 'air') {
    return undefined;
  }
  return {
    distanceBlocks: hit.distance,
    distanceMetres: hit.distance * blockSize,
    point: origin.map((value, axis) => value + dir[axis]! * hit.distance) as Vec3,
    block: hit.block,
  };
};
