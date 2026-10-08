import type { Vec3 } from '../core/coords.ts';

export interface AmalgamTentaclePoseInput {
  readonly start: Vec3;
  readonly target: Vec3;
  readonly facing: Vec3;
  readonly reachMetres: number;
  readonly anchorOffsetMetres: number;
  readonly attackWindupSimSeconds: number;
  readonly attackWindupDurationSimSeconds: number;
  readonly attackWaitSimSeconds: number;
  readonly attackCooldownDurationSimSeconds: number;
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
  anchorOffsetMetres,
  attackWindupSimSeconds,
  attackWindupDurationSimSeconds,
  attackWaitSimSeconds,
  attackCooldownDurationSimSeconds,
}: AmalgamTentaclePoseInput): AmalgamTentaclePose => {
  let extension = 0;
  if (reachMetres > 0 && attackWindupSimSeconds > 0 && attackWindupDurationSimSeconds > 0) {
    extension = smoothstep(1 - clamp01(attackWindupSimSeconds / attackWindupDurationSimSeconds));
  } else if (
    reachMetres > 0 &&
    attackWaitSimSeconds > 0 &&
    attackCooldownDurationSimSeconds > attackWindupDurationSimSeconds
  ) {
    const waitAtStrike = attackCooldownDurationSimSeconds - attackWindupDurationSimSeconds;
    const sinceStrike = Math.max(0, waitAtStrike - attackWaitSimSeconds);
    extension = 1 - smoothstep(clamp01(sinceStrike / attackWindupDurationSimSeconds));
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
  const anchorDistance = Math.min(distance, Math.max(0, anchorOffsetMetres), Math.max(0, reachMetres));
  const meshStart: Vec3 = [
    start[0] + direction[0] * anchorDistance,
    start[1] + direction[1] * anchorDistance,
    start[2] + direction[2] * anchorDistance,
  ];
  const length =
    Math.min(Math.max(0, distance - anchorDistance), Math.max(0, reachMetres - anchorDistance)) * extension;
  return {
    start: meshStart,
    end: [
      meshStart[0] + direction[0] * length,
      meshStart[1] + direction[1] * length,
      meshStart[2] + direction[2] * length,
    ],
    extension,
  };
};
