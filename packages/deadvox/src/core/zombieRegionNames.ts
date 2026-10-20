import type { ShamblerHitRegion, ZombieRegion } from './schema.ts';

export const ZOMBIE_REGION_NAMES = [
  'head',
  'torso',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
] as const satisfies readonly ShamblerHitRegion[];

/** The item a severed shambler region leaves behind. */
export const SEVERED_ITEM: Readonly<Record<ZombieRegion, string>> = {
  head: 'shambler_head',
  torso: 'shambler_torso',
  leftArm: 'shambler_left_arm',
  rightArm: 'shambler_right_arm',
  leftLeg: 'shambler_left_leg',
  rightLeg: 'shambler_right_leg',
};
