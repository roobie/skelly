// The player's body and movement, specified in metres and converted to blocks.

import type { Body, PhysicsParams } from '../core/physics.ts';
import type { Scale } from '../core/scale.ts';

/** Player constants in metres and metres per second (DESIGN.md, "Scale and units"). */
export const PLAYER = {
  halfWidth: 0.3,
  height: 1.8,
  eye: 1.62,
  walk: 1.8,
  jog: 4.3,
  sprint: 6.5,
  /** Take-off speed; with GRAVITY it clears about 1.1 m. */
  jump: 7.9,
  reach: 4,
  stepHeight: 0.5,
} as const;

/** m/s². Heavier than Earth's; it makes jumps feel snappy. */
export const GRAVITY = 28;

export const physicsFor = (scale: Scale): PhysicsParams => ({
  gravity: GRAVITY / scale.blockSize,
  stepHeight: PLAYER.stepHeight / scale.blockSize,
});

/** A player body at (x, y, z) in blocks, sized for the block size. */
export const createPlayerBody = (scale: Scale, x: number, y: number, z: number): Body => ({
  pos: [x, y, z],
  vel: [0, 0, 0],
  halfWidth: PLAYER.halfWidth / scale.blockSize,
  height: PLAYER.height / scale.blockSize,
  onGround: false,
});

export interface MoveIntent {
  forward: number; // -1..1
  right: number; // -1..1
  jump: boolean;
  sprint: boolean;
  /** Walk instead of jog. Sprinting wins over walking. */
  walk: boolean;
  /** Speed factor from load and handling (paceFactor); 1 when absent. */
  pace?: number;
}

/** Grams: carrying more than `light` slows you, down to `slowest` at `heavy`. */
export const LOAD = { light: 20_000, heavy: 40_000, slowest: 0.6 } as const;

/** Handling an item halves your pace (DESIGN.md, "Handling time"). */
export const paceFactor = (grams: number, handling: boolean): number => {
  const over = Math.max(0, grams - LOAD.light) / (LOAD.heavy - LOAD.light);
  const load = Math.max(LOAD.slowest, 1 - (1 - LOAD.slowest) * over);
  return handling ? load * 0.5 : load;
};

/** Sets the body's horizontal velocity from the intent and view yaw; starts a jump if grounded. */
export const steer = (body: Body, scale: Scale, yaw: number, intent: MoveIntent): void => {
  let { forward, right } = intent;
  const len = Math.hypot(forward, right);
  if (len > 1) {
    forward /= len;
    right /= len;
  }
  const pace = intent.walk ? PLAYER.walk : PLAYER.jog;
  const speed = ((intent.sprint ? PLAYER.sprint : pace) * (intent.pace ?? 1)) / scale.blockSize;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // yaw 0 looks down -z; +x is to the right.
  body.vel[0] = (-sin * forward + cos * right) * speed;
  body.vel[2] = (-cos * forward - sin * right) * speed;
  if (intent.jump && body.onGround) {
    body.vel[1] = PLAYER.jump / scale.blockSize;
  }
};
