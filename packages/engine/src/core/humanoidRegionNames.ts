import type { HumanoidHitRegion } from './schema.ts';

export const HUMANOID_REGION_NAMES = [
  'head',
  'torso',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
] as const satisfies readonly HumanoidHitRegion[];
