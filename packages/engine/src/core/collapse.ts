import { boxIntersectsBody } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import { type Body, bodyOverlapsTerrain, stepBodyHorizontal } from './physics.ts';
import type { SolidAt } from './raycast.ts';

/** Shortest floor route on a content-sized movement lattice, using the ordinary swept body collision owner. */
export const reachableCollapseExit = ({
  body,
  path,
  size,
  solid,
  others,
  stride,
  budget,
}: {
  body: Body;
  path: Vec3;
  size: Vec3;
  solid: SolidAt;
  others: readonly Body[];
  stride: number;
  budget: number;
}): Vec3 | undefined => {
  const open: { x: number; z: number; pos: Vec3 }[] = [{ x: 0, z: 0, pos: [...body.pos] }];
  const seen = new Set(['0,0']);
  for (let index = 0; index < Math.min(open.length, budget); index++) {
    const at = open[index]!;
    const probe: Body = { ...body, buried: undefined, pos: [...at.pos], vel: [0, 0, 0] };
    if (!(boxIntersectsBody(path, size, probe) || bodyOverlapsTerrain(probe, solid))) {
      return probe.pos;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = at.x + dx!;
      const z = at.z + dz!;
      const key = `${x},${z}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const next: Body = { ...probe, pos: [...at.pos] };
      stepBodyHorizontal(next, {
        dx: dx! * stride,
        dz: dz! * stride,
        isSolid: solid,
        params: { gravity: 0, stepHeight: 0, obstacles: others },
      });
      if (
        [0, 2].some(
          (axis, coordinate) => Math.abs(next.pos[axis]! - (body.pos[axis]! + [x, z][coordinate]! * stride)) > 1e-6,
        )
      ) {
        continue;
      }
      const below: Body = { ...next, pos: [next.pos[0], next.pos[1] - stride, next.pos[2]], height: stride };
      if (!bodyOverlapsTerrain(below, solid)) {
        continue;
      }
      open.push({ x, z, pos: next.pos });
    }
  }
  return undefined;
};

export const collapseBlockingCells = (landing: Vec3, size: Vec3): Vec3[] => {
  const [x0, y0, z0] = landing;
  const [width, height, depth] = size;
  const cells: Vec3[] = [];
  for (let x = x0; x < x0 + width; x++) {
    for (let y = y0; y < y0 + height; y++) {
      for (let z = z0; z < z0 + depth; z++) {
        cells.push([x, y, z]);
      }
    }
  }
  return cells;
};

/** Rescue follows the blocking cells, not a timer: removing the last of them releases the body. */
export const refreshBurial = (body: Body, solid: SolidAt): boolean => {
  if (!body.buried) {
    return false;
  }
  const remaining = body.buried.filter((cell) => solid(...cell));
  body.buried = remaining.length > 0 ? remaining : undefined;
  if (body.buried) {
    body.vel = [0, 0, 0];
  }
  return body.buried !== undefined;
};
