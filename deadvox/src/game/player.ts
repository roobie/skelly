import type { Body } from '../core/physics.ts';

export const WALK_SPEED = 4.3;
export const SPRINT_SPEED = 6.8;
export const JUMP_SPEED = 9;
export const EYE_HEIGHT = 1.62;
export const REACH = 5;

export const createPlayerBody = (x: number, y: number, z: number): Body => ({
  pos: [x, y, z],
  vel: [0, 0, 0],
  halfWidth: 0.3,
  height: 1.8,
  onGround: false,
});

export interface MoveIntent {
  forward: number; // -1..1
  right: number; // -1..1
  jump: boolean;
  sprint: boolean;
}

/** Sets the body's horizontal velocity from the intent and view yaw; starts a jump if grounded. */
export const steer = (body: Body, yaw: number, intent: MoveIntent): void => {
  let { forward, right } = intent;
  const len = Math.hypot(forward, right);
  if (len > 1) {
    forward /= len;
    right /= len;
  }
  const speed = intent.sprint ? SPRINT_SPEED : WALK_SPEED;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // yaw 0 looks down -z; +x is to the right.
  body.vel[0] = (-sin * forward + cos * right) * speed;
  body.vel[2] = (-cos * forward - sin * right) * speed;
  if (intent.jump && body.onGround) {
    body.vel[1] = JUMP_SPEED;
  }
};
