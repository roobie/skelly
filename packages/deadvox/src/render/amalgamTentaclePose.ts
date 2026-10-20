// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves through this package's aliases.
import { type Mat3, mulMV, type Transform } from '@mobgen/core/math.ts';
import type { AmalgamFigure } from '../core/amalgamFigure.ts';
import type { Vec3 } from '../core/coords.ts';

export interface AmalgamTentaclePoseInput {
  readonly start: Vec3;
  readonly target: Vec3;
  readonly facing: Vec3;
  readonly reachMetres: number;
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

/** The figure's core interior point on the posed core, in world metres. */
export const amalgamCoreInteriorAnchor = ({
  figure,
  transforms,
  yaw,
  position,
  hidden,
}: {
  readonly figure: AmalgamFigure;
  readonly transforms: ReadonlyMap<string, Transform>;
  readonly hidden: ReadonlySet<string>;
  readonly yaw: Mat3;
  readonly position: Vec3;
}): Vec3 => {
  const core = transforms.get('core');
  if (!core) {
    throw new Error('Amalgam tentacle anchor requires a posed core');
  }
  if (hidden.has('core')) {
    throw new Error('Amalgam tentacle anchor requires visible posed core voxels');
  }
  const posedLocal = mulMV(core.r, figure.coreInteriorPoint.map((coordinate) => coordinate * figure.scale) as Vec3);
  const worldOffset = mulMV(yaw, [
    posedLocal[0] + core.t[0] * figure.scale,
    posedLocal[1] + core.t[1] * figure.scale,
    posedLocal[2] + core.t[2] * figure.scale,
  ]);
  return [position[0] + worldOffset[0], position[1] + worldOffset[1], position[2] + worldOffset[2]];
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (value: number): number => value * value * (3 - 2 * value);

/**
 * Render-only reach: extend through the sim-owned windup, hold at contact, then retract over one windup. The
 * tentacle runs straight from `start` toward `target`, at most `reachMetres` long, as the simulation's
 * attack line does (core/zombies.ts, `withinAttackReach`).
 */
export const amalgamTentaclePose = ({
  start,
  target,
  facing,
  reachMetres,
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
  const length = Math.min(distance, Math.max(0, reachMetres)) * extension;
  return {
    start,
    end: [start[0] + direction[0] * length, start[1] + direction[1] * length, start[2] + direction[2] * length],
    extension,
  };
};
