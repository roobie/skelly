// Ladders (DESIGN.md, "Ladders and hatches"): furniture only the player climbs. A body is on a ladder while it
// overlaps one of the ladder's cells, counting a step's height below its feet, so a climb ends with the feet a
// step above the ladder's top, level with the roof the ladder serves.

import type { BlockEntities, BlockEntity } from './blockEntities.ts';
import type { Body } from './physics.ts';
import type { Facing } from './templates.ts';

/** The horizontal direction a facing points, as [x, z]; north is -z (coords.ts, `WORLD_NORTH`). */
const OUTWARD: Readonly<Record<Facing, readonly [number, number]>> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/**
 * The ladder piece the body is on: the highest one whose cells its box overlaps, counting `reachBelow` blocks under
 * its feet. Ladders stack one piece per layer, so the highest piece tells whether the body is at the top.
 */
export const ladderAt = (entities: BlockEntities, body: Body, reachBelow: number): BlockEntity | undefined => {
  const [x, y, z] = body.pos;
  const halfX = body.halfWidth;
  const halfZ = body.halfDepth ?? halfX;
  for (let by = Math.ceil(y + body.height) - 1; by >= Math.floor(y - reachBelow); by--) {
    for (let bz = Math.floor(z - halfZ); bz < z + halfZ; bz++) {
      for (let bx = Math.floor(x - halfX); bx < x + halfX; bx++) {
        const entity = entities.at(bx, by, bz);
        if (entity && entities.defOf(entity).climbable) {
          return entity;
        }
      }
    }
  }
  return undefined;
};

/**
 * Turns the steered velocity into a climb, in blocks per Sim second. Moving toward the ladder's climbing side climbs
 * and moving away climbs down; neither carries the body off the ladder, which holds it on its centre line unless it
 * strafes across to step off sideways. Above the top piece, moving toward the ladder carries the body off onto
 * what it serves. Returns false where the body walks instead: on the ground, unless it moves toward the ladder.
 */
export const climb = (
  body: Body,
  ladder: BlockEntity,
  { speed, dt, strafing }: { speed: number; dt: number; strafing: boolean },
): boolean => {
  const [ox, oz] = OUTWARD[ladder.facing];
  const away = body.vel[0] * ox + body.vel[2] * oz;
  if (body.onGround && away >= 0) {
    return false;
  }
  const moving = Math.hypot(body.vel[0], body.vel[2]);
  body.vel[1] = moving > 0 ? (-away / moving) * speed : 0;
  const across = body.vel[0] * -oz + body.vel[2] * ox;
  const offsetX = body.pos[0] - (ladder.pos[0] + ladder.size[0] / 2);
  const offsetZ = body.pos[2] - (ladder.pos[2] + ladder.size[2] / 2);
  const pull = (offset: number): number => Math.max(-speed, Math.min(speed, -offset / dt));
  const atTop = body.pos[1] >= ladder.pos[1] + ladder.size[1];
  const outward = atTop ? Math.min(away, 0) : pull(offsetX * ox + offsetZ * oz);
  const sideways = atTop || strafing ? across : pull(offsetX * -oz + offsetZ * ox);
  body.vel[0] = outward * ox + sideways * -oz;
  body.vel[2] = outward * oz + sideways * ox;
  return true;
};
