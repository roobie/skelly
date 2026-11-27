import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { RayAt, RayShape, SolidAt } from './raycast.ts';
import { type StrutFace, strutFaces } from './strutShape.ts';
import type { TerrainRead } from './terrainRead.ts';

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const planeInterval = (face: StrutFace, origin: Vec3, direction: Vec3): readonly [number, number] | undefined => {
  const offset = dot(face.normal, face.vertices[0]!) - dot(face.normal, origin);
  const speed = dot(face.normal, direction);
  if (speed === 0) {
    return offset >= 0 ? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY] : undefined;
  }
  const time = offset / speed;
  return speed < 0 ? [time, Number.POSITIVE_INFINITY] : [Number.NEGATIVE_INFINITY, time];
};

const convexShape =
  (faces: readonly StrutFace[]): RayShape =>
  (origin, direction, maximum) => {
    let enter = 0;
    let exit = maximum;
    let normal: Vec3 = [0, 0, 0];
    for (const face of faces) {
      const interval = planeInterval(face, origin, direction);
      if (!interval) {
        return;
      }
      if (interval[0] > enter) {
        [enter] = interval;
        const length = Math.hypot(...face.normal);
        normal = face.normal.map((value) => value / length) as Vec3;
      }
      exit = Math.min(exit, interval[1]);
      if (enter > exit) {
        return;
      }
    }
    return { distance: enter, normal };
  };

/** Resolve content once; the live lookup preserves furniture and vehicle full-cell blockers. */
export const blockRayQuery = (
  registry: Pick<Registry, 'blocks'>,
  blockAt: TerrainRead['getBlock'],
  occupied: SolidAt,
): RayAt => {
  const shapes = registry.blocks.map((block) => block.strut && convexShape(strutFaces(block.strut)));
  return (x, y, z) => {
    if (!occupied(x, y, z)) {
      return false;
    }
    const id = blockAt(x, y, z);
    const shape = typeof id === 'number' ? shapes[id] : undefined;
    return shape ?? true;
  };
};
