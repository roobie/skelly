import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import { type DoorPanelBox, isBodyDoor, panelFor } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import { type RayHit, raycast, type SolidAt } from './raycast.ts';

const rotateToPanel = ([x, y, z]: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * x - s * z, y, s * x + c * z];
};

const rayPanelDistance = (
  panel: DoorPanelBox,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
): number | undefined => {
  const localOrigin = rotateToPanel(
    [origin[0] - panel.pivot[0], origin[1] - panel.pivot[1], origin[2] - panel.pivot[2]],
    panel.rotationY,
  );
  const localDirection = rotateToPanel(direction, panel.rotationY);
  const low = panel.center.map((v, i) => v - panel.size[i]! / 2);
  const high = panel.center.map((v, i) => v + panel.size[i]! / 2);
  let near = 0;
  let far = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const o = localOrigin[axis]!;
    const d = localDirection[axis]!;
    if (Math.abs(d) < 1e-12) {
      if (o < low[axis]! || o > high[axis]!) {
        return undefined;
      }
      continue;
    }
    let a = (low[axis]! - o) / d;
    let b = (high[axis]! - o) / d;
    if (a > b) {
      [a, b] = [b, a];
    }
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) {
      return undefined;
    }
  }
  return far >= 0 && near <= maxDistance ? near : undefined;
};

export interface FurniturePickOptions {
  entities: BlockEntities;
  /** Ray origin in block coordinates. */
  origin: Vec3;
  direction: Vec3;
  /** Maximum ray distance in blocks. */
  maxDistance: number;
  blockSize: number;
  isSolid: SolidAt;
  /** A climber's ray passes through ladders, an open frame, to reach the hatch above. */
  throughLadders?: boolean;
}

interface PanelHit {
  entity: BlockEntity;
  distance: number;
}

const nearestPanelHit = ({
  entities,
  originMetres,
  direction,
  maxDistanceMetres,
  blockSize,
}: {
  entities: BlockEntities;
  originMetres: Vec3;
  direction: Vec3;
  maxDistanceMetres: number;
  blockSize: number;
}): PanelHit | undefined => {
  let nearest: PanelHit | undefined;
  for (const entity of entities.all) {
    const definition = entities.defOf(entity);
    if (!definition.door) {
      continue;
    }
    const distance = rayPanelDistance(
      panelFor(entity, definition, blockSize),
      originMetres,
      direction,
      maxDistanceMetres,
    );
    if (distance !== undefined && (!nearest || distance < nearest.distance)) {
      nearest = { entity, distance };
    }
  }
  return nearest;
};

const firstPickCell = ({
  entities,
  origin,
  direction,
  maxDistance,
  isSolid,
  throughLadders,
}: {
  entities: BlockEntities;
  origin: Vec3;
  direction: Vec3;
  maxDistance: number;
  isSolid: SolidAt;
  throughLadders: boolean;
}): RayHit | undefined =>
  raycast(origin, direction, maxDistance, (x, y, z) => {
    const entity = entities.at(x, y, z);
    const definition = entity && entities.defOf(entity);
    if (!definition || (throughLadders && definition.climbable)) {
      return isSolid(x, y, z);
    }
    // A piece is picked only where it can be collided with, so aiming at empty air never selects one.
    return definition.door ? isBodyDoor(definition) || !entity!.open : entities.hasPartAt(x, y, z);
  });

export interface FurniturePickHit {
  readonly entity: BlockEntity;
  readonly distanceBlocks: number;
}

const resolvePick = ({
  entities,
  panelHit,
  cellHit,
  blockSize,
}: {
  entities: BlockEntities;
  panelHit: PanelHit | undefined;
  cellHit: RayHit | undefined;
  blockSize: number;
}): FurniturePickHit | undefined => {
  const cellEntity = cellHit ? entities.at(...cellHit.block) : undefined;
  const bodyDoor = panelHit && isBodyDoor(entities.defOf(panelHit.entity));
  const sameUnshapedDoorCell = !bodyDoor && panelHit && cellEntity?.uid === panelHit.entity.uid;
  if (panelHit && (!cellHit || panelHit.distance <= cellHit.distance * blockSize || sameUnshapedDoorCell)) {
    return { entity: panelHit.entity, distanceBlocks: panelHit.distance / blockSize };
  }
  if (cellEntity && cellHit) {
    const definition = entities.defOf(cellEntity);
    if (!definition.door || (isBodyDoor(definition) && cellEntity.open)) {
      return { entity: cellEntity, distanceBlocks: cellHit.distance };
    }
  }
  return undefined;
};

export interface FurnitureAndObstructionHit {
  readonly furniture: FurniturePickHit | undefined;
  /** First blocking cell on the same normalized ray, in blocks. */
  readonly obstructionDistanceBlocks: number | undefined;
}

/** Resolves furniture and the first blocking cell from one shared interaction ray. */
export const pickFurnitureAndObstruction = ({
  entities,
  origin,
  direction,
  maxDistance,
  blockSize,
  isSolid,
  throughLadders = false,
}: FurniturePickOptions): FurnitureAndObstructionHit => {
  const magnitude = Math.hypot(...direction);
  if (magnitude === 0 || maxDistance < 0 || blockSize <= 0) {
    return { furniture: undefined, obstructionDistanceBlocks: undefined };
  }
  const dir: Vec3 = direction.map((component) => component / magnitude) as Vec3;
  const maxMetres = maxDistance * blockSize;
  const originMetres: Vec3 = origin.map((coordinate) => coordinate * blockSize) as Vec3;
  const panelHit = nearestPanelHit({
    entities,
    originMetres,
    direction: dir,
    maxDistanceMetres: maxMetres,
    blockSize,
  });
  const cellHit = firstPickCell({ entities, origin, direction: dir, maxDistance, isSolid, throughLadders });
  return {
    furniture: resolvePick({ entities, panelHit, cellHit, blockSize }),
    obstructionDistanceBlocks: cellHit?.distance,
  };
};

/** Picks the nearest visible furniture cell or visible door panel along a block-space ray. */
export const pickFurnitureHit = (options: FurniturePickOptions): FurniturePickHit | undefined =>
  pickFurnitureAndObstruction(options).furniture;

export const pickFurniture = (options: FurniturePickOptions): BlockEntity | undefined =>
  pickFurnitureHit(options)?.entity;
