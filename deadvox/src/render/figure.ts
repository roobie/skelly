// Shared low-poly humanoid layout. Shamblers and the player's body use this same
// figure; player-only arm subdivisions below add sleeves, forearms and hands.

import type { FigureBox } from '../core/zombieRegions.ts';

/** The player's shirt-to-skin subdivisions; the shambler keeps its one-piece arms. */
export const PLAYER_ARM_BOXES = {
  leftUpperArm: { size: [0.15, 0.42, 0.16], at: [-0.225, 1.15, 0] },
  rightUpperArm: { size: [0.15, 0.42, 0.16], at: [0.225, 1.15, 0] },
  leftForearm: { size: [0.13, 0.2, 0.14], at: [-0.225, 0.84, 0] },
  rightForearm: { size: [0.13, 0.2, 0.14], at: [0.225, 0.84, 0] },
  leftHand: { size: [0.14, 0.12, 0.14], at: [-0.225, 0.68, 0] },
  rightHand: { size: [0.14, 0.12, 0.14], at: [0.225, 0.68, 0] },
} as const satisfies Record<string, FigureBox>;
