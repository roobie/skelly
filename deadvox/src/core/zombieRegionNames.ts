import type { ShamblerHitRegion } from './schema.ts';

export const ZOMBIE_REGION_NAMES = [
  'head',
  'torso',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
] as const satisfies readonly ShamblerHitRegion[];
