import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import { ladderOutward } from './ladders.ts';
import { STAIR_BODY_HALF_WIDTH } from './stairFlight.ts';

export interface ClimbSpace {
  readonly entities: BlockEntities;
  readonly entityAt: (point: Readonly<Vec3>) => BlockEntity | undefined;
  readonly clear: (point: Readonly<Vec3>) => boolean;
  readonly standing: (point: Readonly<Vec3>) => boolean;
  readonly sweep: (from: Readonly<Vec3>, to: Readonly<Vec3>, supported?: boolean) => boolean;
  readonly connected: (from: Readonly<Vec3>, to: Readonly<Vec3>) => boolean;
}
export interface ClimbLink {
  readonly ladder?: Readonly<Vec3> | undefined;
  readonly upper: Readonly<Vec3>;
  readonly lower: Readonly<Vec3>;
}

const bottomOf = (space: ClimbSpace, link: ClimbLink): BlockEntity | undefined => {
  if (link.ladder) {
    return space.entityAt(link.ladder);
  }
  space.clear(link.lower);
  return [...space.entities.all].find(
    (entity) =>
      space.entities.defOf(entity).climbable &&
      entity.pos[1] === link.lower[1] &&
      Math.hypot(entity.pos[0] - link.lower[0], entity.pos[2] - link.lower[2]) <= 3,
  );
};

const shaft = (space: ClimbSpace, link: ClimbLink, bottom: BlockEntity, centre: Vec3): boolean => {
  const [, lower] = link.lower;
  for (let feet = lower; feet <= link.upper[1]; feet += 0.5) {
    if (!space.clear([centre[0], feet, centre[2]])) {
      return false;
    }
    const probeY = Math.min(Math.floor(feet), link.upper[1] - 2);
    const piece = space.entityAt([Math.floor(centre[0]), probeY, Math.floor(centre[2])]);
    if (!(piece && space.entities.defOf(piece).climbable && piece.facing === bottom.facing)) {
      return false;
    }
  }
  return space.sweep(link.lower, [centre[0], link.lower[1], centre[2]]);
};

const exitSupported = (
  space: ClimbSpace,
  link: ClimbLink,
  bottom: BlockEntity,
  { centre, step: [dx, dz] }: { centre: Vec3; step: readonly [number, number] },
): boolean => {
  const top: Vec3 = [centre[0] + dx, link.upper[1], centre[2] + dz];
  const [ox, oz] = ladderOutward(bottom.facing);
  const h = STAIR_BODY_HALF_WIDTH;
  const overlaps =
    top[0] + h > bottom.pos[0] &&
    top[0] - h < bottom.pos[0] + bottom.size[0] &&
    top[2] + h > bottom.pos[2] &&
    top[2] - h < bottom.pos[2] + bottom.size[2];
  return (
    overlaps &&
    dx * ox + dz * oz <= 0 &&
    space.standing(top) &&
    space.sweep([centre[0], top[1], centre[2]], top, false) &&
    space.connected(link.upper, top)
  );
};

// A continuous shaft and reversible supported landings certify both ascent and descent.
export const climbCertificate = (space: ClimbSpace, link: ClimbLink): string | undefined => {
  if (link.upper[1] <= link.lower[1]) {
    return 'climb needs distinct ordered landing heights';
  }
  const bottom = bottomOf(space, link);
  if (!(bottom && space.entities.defOf(bottom).climbable)) {
    return 'missing composed ladder';
  }
  const centre: Vec3 = [bottom.pos[0] + bottom.size[0] / 2, bottom.pos[1], bottom.pos[2] + bottom.size[2] / 2];
  if (shaft(space, link, bottom, centre)) {
    for (let dx = -1; dx <= 1; dx += 0.5) {
      for (let dz = -1; dz <= 1; dz += 0.5) {
        if (exitSupported(space, link, bottom, { centre, step: [dx, dz] })) {
          return undefined;
        }
      }
    }
  }
  return 'composed ladder needs continuous body-clear shaft and supported braced landings';
};
