import type { Vec3 } from '../core/coords.ts';

export interface AmalgamTentaclePoseInput {
  readonly start: Vec3;
  readonly target: Vec3;
  readonly facing: Vec3;
  readonly reachMetres: number;
  readonly attackWindup: number;
  readonly attackWindupSeconds: number;
  readonly attackWait: number;
  readonly attackCooldownSeconds: number;
}

export interface AmalgamTentaclePose {
  readonly start: Vec3;
  readonly end: Vec3;
  readonly extension: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (value: number): number => value * value * (3 - 2 * value);

/** Render-only reach: extend through the sim-owned windup, hold at contact, then retract over one windup. */
export const amalgamTentaclePose = ({
  start,
  target,
  facing,
  reachMetres,
  attackWindup,
  attackWindupSeconds,
  attackWait,
  attackCooldownSeconds,
}: AmalgamTentaclePoseInput): AmalgamTentaclePose => {
  let extension = 0;
  if (reachMetres > 0 && attackWindup > 0 && attackWindupSeconds > 0) {
    extension = smoothstep(1 - clamp01(attackWindup / attackWindupSeconds));
  } else if (reachMetres > 0 && attackWait > 0 && attackCooldownSeconds > attackWindupSeconds) {
    const waitAtStrike = attackCooldownSeconds - attackWindupSeconds;
    const sinceStrike = Math.max(0, waitAtStrike - attackWait);
    extension = 1 - smoothstep(clamp01(sinceStrike / attackWindupSeconds));
  }

  const delta: Vec3 = [target[0] - start[0], target[1] - start[1], target[2] - start[2]];
  const distance = Math.hypot(...delta);
  const facingLength = Math.hypot(facing[0], facing[2]);
  let direction: Vec3;
  if (distance > 1e-9) {
    direction = [delta[0] / distance, delta[1] / distance, delta[2] / distance];
  } else if (facingLength > 1e-9) {
    direction = [facing[0] / facingLength, 0, facing[2] / facingLength];
  } else {
    direction = [0, 0, -1];
  }
  const length = Math.min(distance, Math.max(0, reachMetres)) * extension;
  return {
    start: [...start],
    end: [start[0] + direction[0] * length, start[1] + direction[1] * length, start[2] + direction[2] * length],
    extension,
  };
};
