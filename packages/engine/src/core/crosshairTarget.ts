import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { pickFurnitureHit } from './furniturePick.ts';
import { type RayAt, raycast } from './raycast.ts';
import { NOT_LOADED, type TerrainRead } from './terrainRead.ts';

export interface CrosshairTargetWorld {
  readonly world: Pick<TerrainRead, 'getBlock' | 'renderOnly'>;
  readonly registry: Pick<Registry, 'blocks'>;
  readonly entities: BlockEntities;
  readonly isSolid: RayAt;
  readonly blockSize: number;
}

export interface CrosshairTarget {
  readonly distanceBlocks: number;
  readonly distanceMetres: number;
  readonly point: Vec3;
  readonly entity?: BlockEntity;
  readonly block?: Vec3;
}

export const crosshairAimPoint = (
  origin: Vec3,
  direction: Vec3,
  rangeBlocks: number,
  hitDistancesBlocks: readonly (number | undefined)[],
): Vec3 => {
  const magnitude = Math.hypot(...direction);
  const dir: Vec3 = magnitude > 0 ? (direction.map((component) => component / magnitude) as Vec3) : [0, 0, -1];
  const hits = hitDistancesBlocks.filter(
    (value): value is number => value !== undefined && Number.isFinite(value) && value > 0,
  );
  const distance = Math.min(rangeBlocks, ...hits);
  return origin.map((value, axis) => value + dir[axis]! * distance) as Vec3;
};

export const crosshairTarget = (
  { world, registry, entities, isSolid, blockSize }: CrosshairTargetWorld,
  origin: Vec3,
  direction: Vec3,
  maxDistanceBlocks: number,
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
  const id = hit && world.getBlock(...hit.block);
  const block = id === NOT_LOADED || id === undefined ? undefined : registry.blocks[id];
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
