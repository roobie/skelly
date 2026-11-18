import type { GunModelDef } from './schema.ts';

export type PressCheckClip = NonNullable<GunModelDef['pressCheck']>;
type PressCheckKey = PressCheckClip['keys'][number];
type OffHandTarget = PressCheckKey['offHand'];

/**
 * A press check at one moment: the gun's turn and lift, the eyes' turn, each part's share of its stroke and the off
 * hand's weight on each target.
 */
export interface PressCheckSample {
  readonly turnDegrees: { readonly pitch: number; readonly yaw: number; readonly roll: number };
  readonly liftMetres: { readonly up: number; readonly back: number; readonly across: number };
  readonly lookDegrees: { readonly pitch: number; readonly yaw: number };
  readonly parts: Readonly<Record<string, number>>;
  readonly offHand: Readonly<Record<OffHandTarget, number>>;
}

const EASINGS: Record<PressCheckClip['easing'], (t: number) => number> = {
  linear: (t) => t,
  'minimum-jerk': (t) => t * t * t * (10 - 15 * t + 6 * t * t),
};

/** The whole clip's length in Sim seconds, before the skill's handling factor. */
export const pressCheckSeconds = (clip: PressCheckClip): number =>
  clip.keys.reduce((sum, key) => sum + (key.intoSimSeconds ?? 0) + (key.holdSimSeconds ?? 0), 0);

const weights = (target: OffHandTarget): Record<OffHandTarget, number> => ({
  grip: target === 'grip' ? 1 : 0,
  handle: target === 'handle' ? 1 : 0,
  port: target === 'port' ? 1 : 0,
});

const NO_LIFT = { up: 0, back: 0, across: 0 } as const;
const NO_LOOK = { pitch: 0, yaw: 0 } as const;

const blend = (from: PressCheckKey, to: PressCheckKey, t: number): PressCheckSample => {
  const mix = (start: number, end: number): number => start + (end - start) * t;
  const ids = new Set([...Object.keys(from.parts ?? {}), ...Object.keys(to.parts ?? {})]);
  const held = weights(from.offHand);
  const next = weights(to.offHand);
  const lift = from.liftMetres ?? NO_LIFT;
  const nextLift = to.liftMetres ?? NO_LIFT;
  const look = from.lookDegrees ?? NO_LOOK;
  const nextLook = to.lookDegrees ?? NO_LOOK;
  return {
    turnDegrees: {
      pitch: mix(from.turnDegrees.pitch, to.turnDegrees.pitch),
      yaw: mix(from.turnDegrees.yaw, to.turnDegrees.yaw),
      roll: mix(from.turnDegrees.roll, to.turnDegrees.roll),
    },
    liftMetres: {
      up: mix(lift.up, nextLift.up),
      back: mix(lift.back, nextLift.back),
      across: mix(lift.across, nextLift.across),
    },
    lookDegrees: { pitch: mix(look.pitch, nextLook.pitch), yaw: mix(look.yaw, nextLook.yaw) },
    parts: Object.fromEntries([...ids].map((id) => [id, mix(from.parts?.[id] ?? 0, to.parts?.[id] ?? 0)])),
    offHand: {
      grip: mix(held.grip, next.grip),
      handle: mix(held.handle, next.handle),
      port: mix(held.port, next.port),
    },
  };
};

/** The clip `seconds` in: each move eased out of the key before and into the next; held keys stand still. */
export const samplePressCheck = (clip: PressCheckClip, seconds: number): PressCheckSample => {
  const { keys } = clip;
  const ease = EASINGS[clip.easing];
  let at = keys[0]!.holdSimSeconds ?? 0;
  for (let index = 1; index < keys.length; index++) {
    const key = keys[index]!;
    const into = key.intoSimSeconds ?? 0;
    if (seconds < at + into) {
      return blend(keys[index - 1]!, key, ease(Math.max(0, seconds - at) / into));
    }
    at += into + (key.holdSimSeconds ?? 0);
    if (seconds < at) {
      return blend(key, key, 0);
    }
  }
  const last = keys.at(-1)!;
  return blend(last, last, 0);
};
