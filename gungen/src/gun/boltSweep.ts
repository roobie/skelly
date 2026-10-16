import {
  distanceWorld,
  localSolidBounds,
  lowerBoundDistanceWorld,
  penetrationWorld,
  type WorldSolid,
  worldSolid,
} from '@skelly/engine/core/geometry.ts';
import { length, sub } from '@skelly/engine/core/math.ts';
import { motionTransform } from '@skelly/engine/core/motion.ts';
import type { Resolved } from '@skelly/engine/core/resolve.ts';
import { resolveGunAction } from './actionDescription.ts';

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
      const radius = Math.hypot(
        ...([0, 1, 2] as const).map((axis) =>
          Math.max(Math.abs(min[axis] - turn.pivot[axis]), Math.abs(max[axis] - turn.pivot[axis])),
        ),
      );
      const turnAt = (phase: number) => worldSolid(motionTransform(part.placed, motion, 0, phase), solid);
      const drawAt = (phase: number) => worldSolid(motionTransform(part.placed, motion, phase, 1), solid);
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
