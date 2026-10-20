import { motionTransform } from '@skelly/engine/assembly/motion.ts';
import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import { dot, length, scale, sub, type Vec3 } from '@skelly/engine/foundation/math.ts';
import {
  distanceWorld,
  localSolidBounds,
  lowerBoundDistanceWorld,
  penetrationWorld,
  type WorldSolid,
  worldSolid,
} from '@skelly/engine/shapes/geometry.ts';
import { resolveGunAction } from './actionDescription.ts';

// Every obstacle visits the same dyadic phases; a moving solid's pose is independent of the obstacle.
const cachedPoses = (at: (phase: number) => WorldSolid): ((phase: number) => WorldSolid) => {
  const poses = new Map<number, WorldSolid>();
  return (phase) => {
    const cached = poses.get(phase);
    if (cached) {
      return cached;
    }
    const shape = at(phase);
    poses.set(phase, shape);
    return shape;
  };
};

/** Certify continuous intervals by bounding each vertex's maximum displacement from the midpoint. */
const clearsInterval = (
  at: (phase: number) => WorldSolid,
  obstacle: WorldSolid,
  speedBound: number,
  interval = { lo: 0, hi: 1, depth: 0 },
): boolean => {
  const { lo, hi, depth } = interval;
  const middle = (lo + hi) / 2;
  const shape = at(middle);
  if (lowerBoundDistanceWorld(shape, obstacle) > (speedBound * (hi - lo)) / 2 + 1e-9) {
    return true;
  }
  if (distanceWorld(shape, obstacle) > (speedBound * (hi - lo)) / 2 + 1e-9) {
    return true;
  }
  if (penetrationWorld(shape, obstacle) > 1e-7 || depth >= 20) {
    return false;
  }
  return (
    clearsInterval(at, obstacle, speedBound, { lo, hi: middle, depth: depth + 1 }) &&
    clearsInterval(at, obstacle, speedBound, { lo: middle, hi, depth: depth + 1 })
  );
};

export const sweepBoltAction = (resolved: Resolved): readonly string[] => {
  const action = resolveGunAction(resolved);
  if (action?.kind !== 'bolt') {
    return [];
  }
  const moving = new Set(Object.values(action.parts).map(({ id }) => id));
  const obstacles = [...resolved.defs]
    .filter(([id]) => !moving.has(id))
    .flatMap(([id, def]) =>
      def.solids.map((solid) => ({ id: `${id}.${solid.id}`, shape: worldSolid(resolved.placed.get(id)!, solid) })),
    );
  return Object.values(action.parts).flatMap((part) => {
    const motion = part.def.motion!;
    const turn = motion.turn!;
    return part.def.solids.flatMap((solid) => {
      const [min, max] = localSolidBounds(solid);
      // Axial length does not contribute to turn speed, especially for the long rear bolt tail.
      const radius = Math.max(
        ...[min[0], max[0]].flatMap((x) =>
          [min[1], max[1]].flatMap((y) =>
            [min[2], max[2]].map((z) => {
              const offset = sub([x, y, z] as Vec3, turn.pivot);
              const axial = scale(turn.axis, dot(offset, turn.axis) / dot(turn.axis, turn.axis));
              return length(sub(offset, axial));
            }),
          ),
        ),
      );
      const turnAt = cachedPoses((phase) => worldSolid(motionTransform(part.placed, motion, 0, phase), solid));
      const drawAt = cachedPoses((phase) => worldSolid(motionTransform(part.placed, motion, phase, 1), solid));
      return obstacles
        .filter(
          ({ shape }) =>
            !(
              clearsInterval(turnAt, shape, radius * Math.abs(turn.angleRadians)) &&
              clearsInterval(drawAt, shape, length(sub(motion.end, motion.start)))
            ),
        )
        .map(({ id }) => `${part.id}.${solid.id} vs ${id}`);
    });
  });
};
