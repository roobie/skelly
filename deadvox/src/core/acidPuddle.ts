import type { Vec3 } from './coords.ts';
import { type Body, CONTACT_SKIN } from './physics.ts';

export interface AcidPuddleState {
  id: number;
  type: string;
  pos: Vec3;
  remainingSimSeconds: number;
  damagePerSimSecond: number;
}

export const feetInAcidPuddle = (body: Body, puddle: Readonly<AcidPuddleState>, radius: number): boolean =>
  body.onGround &&
  Math.abs(body.pos[1] - puddle.pos[1]) <= 2 * CONTACT_SKIN &&
  Math.hypot(body.pos[0] - puddle.pos[0], body.pos[2] - puddle.pos[2]) <= radius;
