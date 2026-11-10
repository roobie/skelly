export const MELEE_MOTIONS = ['thrust', 'swing', 'wrestle'] as const;
export type MeleeMotion = (typeof MELEE_MOTIONS)[number];
