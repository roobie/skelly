import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import { doorPanel } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import { type RayHit, raycast, type SolidAt } from './raycast.ts';

const rotateToPanel = ([x, y, z]: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * x - s * z, y, s * x + c * z];
};

const rayPanelDistance = (
  panel: ReturnType<typeof doorPanel>,
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
    if (!entities.defOf(entity).door) {
      continue;
    }
    const distance = rayPanelDistance(doorPanel(entity, blockSize), originMetres, direction, maxDistanceMetres);
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
}: {
  entities: BlockEntities;
  origin: Vec3;
  direction: Vec3;
  maxDistance: number;
  isSolid: SolidAt;
}): RayHit | undefined =>
  raycast(origin, direction, maxDistance, (x, y, z) => {
    const entity = entities.at(x, y, z);
    if (entity && entities.defOf(entity).door) {
      return !entity.open;
    }
    return entity !== undefined || isSolid(x, y, z);
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
  const sameClosedDoor = panelHit && cellEntity?.uid === panelHit.entity.uid;
  if (panelHit && (!cellHit || panelHit.distance <= cellHit.distance * blockSize || sameClosedDoor)) {
    return { entity: panelHit.entity, distanceBlocks: panelHit.distance / blockSize };
  }
  if (cellEntity && !entities.defOf(cellEntity).door && cellHit) {
    return { entity: cellEntity, distanceBlocks: cellHit.distance };
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
  const cellHit = firstPickCell({ entities, origin, direction: dir, maxDistance, isSolid });
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
