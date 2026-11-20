import type { BlockEntities } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import { type Body, type BodyShape, bodyOverlapsTerrain, type ShapeOf } from './physics.ts';
import type { SolidAt } from './raycast.ts';
import { windowParts } from './windowParts.ts';

const intersects = (low: Vec3, high: Vec3, otherLow: Vec3, otherHigh: Vec3): boolean =>
  low.every((value, axis) => value < otherHigh[axis]! && high[axis]! > otherLow[axis]!);

const touchedWindows = (entities: BlockEntities, low: Vec3, high: Vec3) => {
  const found = new Set<NonNullable<ReturnType<BlockEntities['windowCollisionAt']>>>();
  for (let y = Math.floor(low[1]); y < Math.ceil(high[1]); y++) {
    for (let z = Math.floor(low[2]); z < Math.ceil(high[2]); z++) {
      for (let x = Math.floor(low[0]); x < Math.ceil(high[0]); x++) {
        const entity = entities.windowCollisionAt(x, y, z);
        if (entity) {
          found.add(entity);
        }
      }
    }
  }
  return found;
};

/** Thin aperture rails must not become whole occupied voxels when a body tests its clearance. */
export const apertureShapes = (entities: BlockEntities, nonWindowSolid: SolidAt, blockSize: number): ShapeOf => {
  const shapes = new WeakMap<Body, BodyShape>();
  return (body) => {
    const bounds = (pos: Vec3, height = body.height): [Vec3, Vec3] => [
      [pos[0] - body.halfWidth, pos[1], pos[2] - (body.halfDepth ?? body.halfWidth)],
      [pos[0] + body.halfWidth, pos[1] + height, pos[2] + (body.halfDepth ?? body.halfWidth)],
    ];
    const [low, high] = bounds(body.pos);
    // Include the next voxel so a body's bounded physics substep cannot cross into an unseen frame.
    if (touchedWindows(entities, low.map((v) => v - 1) as Vec3, high.map((v) => v + 1) as Vec3).size === 0) {
      return;
    }
    let shape = shapes.get(body);
    if (!shape) {
      const overlaps = (pos: Vec3, height = body.height): boolean => {
        if (bodyOverlapsTerrain({ ...body, pos, height }, nonWindowSolid)) {
          return true;
        }
        const [min, max] = bounds(pos, height);
        return [...touchedWindows(entities, min, max)].some((entity) => {
          const definition = entities.defOf(entity);
          const head = [...max] as Vec3;
          head[1] -= definition.window!.passageLeewayMetres / blockSize;
          return windowParts(entity, definition, 1, entities.boardingOf(entity)).some(({ kind, box }) => {
            if (entity.window!.open && kind !== 'frame') {
              return false;
            }
            const c = Math.cos(box.rotationY);
            const s = Math.sin(box.rotationY);
            const center: Vec3 = [
              box.pivot[0] + c * box.center[0] + s * box.center[2],
              box.pivot[1] + box.center[1],
              box.pivot[2] - s * box.center[0] + c * box.center[2],
            ];
            const half: Vec3 = [
              (Math.abs(c) * box.size[0] + Math.abs(s) * box.size[2]) / 2,
              box.size[1] / 2,
              (Math.abs(s) * box.size[0] + Math.abs(c) * box.size[2]) / 2,
            ];
            return intersects(
              min,
              head,
              center.map((v, axis) => v - half[axis]!) as Vec3,
              center.map((v, axis) => v + half[axis]!) as Vec3,
            );
          });
        });
      };
      shape = {
        overlapsTerrain: (pos) => overlaps(pos),
        overlapsTerrainBelow: (pos, height) => overlaps(pos, Math.min(height, body.height)),
        overlapsBox: (pos, min, max) => {
          const [boxLow, boxHigh] = bounds(pos);
          return intersects(boxLow, boxHigh, min, max);
        },
      };
      shapes.set(body, shape);
    }
    return shape;
  };
};
