// Shared low-poly humanoid layout. Shamblers and the player's body use this same
// figure; player-only arm subdivisions below add sleeves, forearms and hands.

export type FigurePart = 'body' | 'head' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

export interface FigureBox {
  /** Metres, in local figure space. */
  size: [number, number, number];
  /** Centre in metres, except leg positions which mark the hip pivot. */
  at: [number, number, number];
}

export const FIGURE_PARTS: readonly FigurePart[] = ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

export const FIGURE_BOXES: Readonly<Record<FigurePart, FigureBox>> = {
  body: { size: [0.42, 0.78, 0.28], at: [0, 1.02, 0] },
  head: { size: [0.3, 0.32, 0.3], at: [0, 1.58, 0] },
  leftArm: { size: [0.15, 0.68, 0.16], at: [-0.225, 1.02, 0] },
  rightArm: { size: [0.15, 0.68, 0.16], at: [0.225, 1.02, 0] },
  leftLeg: { size: [0.18, 0.62, 0.2], at: [-0.12, 0.62, 0] },
  rightLeg: { size: [0.18, 0.62, 0.2], at: [0.12, 0.62, 0] },
};

/** The player's shirt-to-skin subdivisions; the shambler keeps its one-piece arms. */
export const PLAYER_ARM_BOXES = {
  leftUpperArm: { size: [0.15, 0.42, 0.16], at: [-0.225, 1.15, 0] },
  rightUpperArm: { size: [0.15, 0.42, 0.16], at: [0.225, 1.15, 0] },
  leftForearm: { size: [0.13, 0.2, 0.14], at: [-0.225, 0.84, 0] },
  rightForearm: { size: [0.13, 0.2, 0.14], at: [0.225, 0.84, 0] },
  leftHand: { size: [0.14, 0.12, 0.14], at: [-0.225, 0.68, 0] },
  rightHand: { size: [0.14, 0.12, 0.14], at: [0.225, 0.68, 0] },
} as const satisfies Record<string, FigureBox>;
