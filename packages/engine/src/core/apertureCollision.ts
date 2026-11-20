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
  // Keyed by the dimensions a shape reads, not by body identity: a way-past probe walks a fresh body copy each
  // call (#1957), and bodies of one size clear windows alike.
  const shapes: { halfWidth: number; halfDepth: number; height: number; shape: BodyShape }[] = [];
  return (body) => {
    const bounds = (pos: Vec3, height = body.height): [Vec3, Vec3] => [
      [pos[0] - body.halfWidth, pos[1], pos[2] - (body.halfDepth ?? body.halfWidth)],
      [pos[0] + body.halfWidth, pos[1] + height, pos[2] + (body.halfDepth ?? body.halfWidth)],
    ];
    const [low, high] = bounds(body.pos);
    // Include the next voxel so a body's bounded physics substep cannot cross into an unseen frame.
    if (!entities.windowNear(low, high, 1)) {
      return;
    }
    const halfDepth = body.halfDepth ?? body.halfWidth;
    let shape = shapes.find(
      (cached) =>
        cached.halfWidth === body.halfWidth && cached.halfDepth === halfDepth && cached.height === body.height,
    )?.shape;
    if (!shape) {
      // The entry is shared by every body with these dimensions, and a stance change rewrites the creating body's
      // height in place, so the shape reads only this frozen basis, never the live body (#1957).
      const basis: Body = { ...body };
      const basisBounds = (pos: Vec3, height = basis.height): [Vec3, Vec3] => [
        [pos[0] - basis.halfWidth, pos[1], pos[2] - (basis.halfDepth ?? basis.halfWidth)],
        [pos[0] + basis.halfWidth, pos[1] + height, pos[2] + (basis.halfDepth ?? basis.halfWidth)],
      ];
      const overlaps = (pos: Vec3, height = basis.height): boolean => {
        if (bodyOverlapsTerrain({ ...basis, pos, height }, nonWindowSolid)) {
          return true;
        }
        const [min, max] = basisBounds(pos, height);
        return [...touchedWindows(entities, min, max)].some((entity) => {
          const definition = entities.defOf(entity);
          const head = [...max] as Vec3;
          head[1] -= definition.window!.passageLeewayMetres / blockSize;
          return windowParts(entity, definition, 1).some(({ kind, box }) => {
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
        overlapsTerrainBelow: (pos, height) => overlaps(pos, Math.min(height, basis.height)),
        overlapsBox: (pos, min, max) => {
          const [boxLow, boxHigh] = basisBounds(pos);
          return intersects(boxLow, boxHigh, min, max);
        },
      };
      shapes.push({ halfWidth: body.halfWidth, halfDepth, height: body.height, shape });
    }
    return shape;
  };
};
