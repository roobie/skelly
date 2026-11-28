import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import { type DoorPanelBox, isBodyDoor, panelFor } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import { casingBoxes, POWER_SWITCH_PART, powerSwitchBoxes, type WorldBox } from './plantInstruments.ts';
import { type RayAt, type RayHit, raycast } from './raycast.ts';
import type { FurnitureDef } from './schema.ts';
import { type WindowPart, windowParts } from './windowParts.ts';

/** A part of a piece picked by its own boxes, so a use can name it. */
export type FurniturePart = WindowPart['kind'] | typeof POWER_SWITCH_PART;

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
  isSolid: RayAt;
  /** A climber's ray passes through ladders, an open frame, to reach the hatch above. */
  throughLadders?: boolean;
}

const swings = new WeakMap<BlockEntities['registry'], number>();

/** The furthest, in blocks, that any door's panel reaches beyond its own cells. */
const doorSwing = ({ registry }: BlockEntities): number => {
  let swing = swings.get(registry);
  if (swing === undefined) {
    swing = Math.max(0, ...[...registry.furniture.values()].flatMap((def) => (def.door || def.window ? def.size : [])));
    swings.set(registry, swing);
  }
  return swing;
};

interface PanelHit {
  entity: BlockEntity;
  distance: number;
  part?: FurniturePart | undefined;
}

/** An axis-aligned box in blocks as an unturned panel in metres. */
const boxPanel = ({ min, max }: WorldBox, blockSize: number): DoorPanelBox => ({
  pivot: min.map((low, axis) => ((low + max[axis]!) / 2) * blockSize) as Vec3,
  center: [0, 0, 0],
  size: min.map((low, axis) => (max[axis]! - low) * blockSize) as Vec3,
  rotationY: 0,
});

interface PanelRay {
  originMetres: Vec3;
  direction: Vec3;
  maxDistanceMetres: number;
  blockSize: number;
}

/**
 * How far a ray travels to a housing's power switch, unless the housing's casing comes first. A switch can stand inside
 * the housing's own cells, so only the drawn casing tells a ray at its face from one through the housing.
 */
const switchDistance = (
  entity: BlockEntity,
  definition: FurnitureDef,
  { originMetres, direction, maxDistanceMetres, blockSize }: PanelRay,
): number | undefined => {
  const switches = powerSwitchBoxes(entity, definition);
  if (switches.length === 0) {
    return undefined;
  }
  const nearest = (boxes: readonly WorldBox[]) =>
    Math.min(
      ...boxes.map(
        (box) =>
          rayPanelDistance(boxPanel(box, blockSize), originMetres, direction, maxDistanceMetres) ??
          Number.POSITIVE_INFINITY,
      ),
    );
  const distance = nearest(switches);
  return distance < nearest(casingBoxes(entity, definition)) ? distance : undefined;
};

const nearestPanelHit = ({ entities, ...ray }: PanelRay & { entities: BlockEntities }): PanelHit | undefined => {
  const { originMetres, direction, maxDistanceMetres, blockSize } = ray;
  let nearest: PanelHit | undefined;
  // An open leaf swings out of its cells by up to its width, so the ray's box grows by the widest door.
  const swing = doorSwing(entities);
  const ends = [0, maxDistanceMetres].map((along) =>
    originMetres.map((value, axis) => (value + direction[axis]! * along) / blockSize),
  );
  const low = [0, 1, 2].map((axis) => Math.min(ends[0]![axis]!, ends[1]![axis]!) - swing) as Vec3;
  const high = [0, 1, 2].map((axis) => Math.max(ends[0]![axis]!, ends[1]![axis]!) + swing) as Vec3;
  for (const entity of entities.near(low, high)) {
    const definition = entities.defOf(entity);
    const panels: { kind?: FurniturePart; box: DoorPanelBox }[] = [];
    if (definition.window) {
      panels.push(...windowParts(entity, definition, blockSize, entities.boardingOf(entity)));
    } else if (definition.door) {
      panels.push({ box: panelFor(entity, definition, blockSize) });
    }
    const hits: { part?: FurniturePart | undefined; distance: number | undefined }[] = [
      ...panels.map(({ kind, box }) => ({
        part: kind,
        distance: rayPanelDistance(box, originMetres, direction, maxDistanceMetres),
      })),
      { part: POWER_SWITCH_PART, distance: switchDistance(entity, definition, ray) },
    ];
    for (const { part, distance } of hits) {
      if (distance !== undefined && (!nearest || distance < nearest.distance)) {
        nearest = { entity, distance, part };
      }
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
  isSolid: RayAt;
  throughLadders: boolean;
}): RayHit | undefined =>
  raycast(origin, direction, maxDistance, (x, y, z) => {
    const entity = entities.at(x, y, z);
    const definition = entity && entities.defOf(entity);
    if (!definition || (throughLadders && definition.climbable)) {
      return isSolid(x, y, z);
    }
    if (definition.window) {
      return false;
    }
    // A piece is picked only where it can be collided with, so aiming at empty air never selects one.
    return definition.door ? isBodyDoor(definition) || !entity!.open : entities.hasPartAt(x, y, z);
  });

export interface FurniturePickHit {
  readonly entity: BlockEntity;
  readonly distanceBlocks: number;
  readonly part?: FurniturePart;
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
  // A panel inside its own piece's cells: an unshaped door's leaf, or a switch its casing does not hide.
  const inOwnCell = panelHit && cellEntity?.uid === panelHit.entity.uid && !isBodyDoor(entities.defOf(panelHit.entity));
  if (panelHit && (!cellHit || panelHit.distance <= cellHit.distance * blockSize || inOwnCell)) {
    return {
      entity: panelHit.entity,
      distanceBlocks: panelHit.distance / blockSize,
      ...(panelHit.part ? { part: panelHit.part } : {}),
    };
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
  readonly cell: RayHit | undefined;
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
    return { furniture: undefined, obstructionDistanceBlocks: undefined, cell: undefined };
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
    cell: cellHit,
    obstructionDistanceBlocks: panelHit
      ? Math.min(panelHit.distance / blockSize, cellHit?.distance ?? Number.POSITIVE_INFINITY)
      : cellHit?.distance,
  };
};

/** Picks the nearest visible furniture cell or visible door panel along a block-space ray. */
export const pickFurnitureHit = (options: FurniturePickOptions): FurniturePickHit | undefined =>
  pickFurnitureAndObstruction(options).furniture;

export const pickFurniture = (options: FurniturePickOptions): BlockEntity | undefined =>
  pickFurnitureHit(options)?.entity;
