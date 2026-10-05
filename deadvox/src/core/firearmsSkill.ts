export interface FirearmsSkillEffects {
  readonly variance: number;
  readonly reloadDuration: number;
  readonly rackDuration: number;
}

const saturation = (level: number, floor: number, halfLife: number): number =>
  floor + (1 - floor) * (halfLife / (halfLife + level));

/** Independent, monotone and saturating effects for the firearms skill. */
export const firearmsSkillEffects = (level: number): FirearmsSkillEffects => {
  if (!Number.isSafeInteger(level) || level < 0) {
    throw new Error('Invalid firearms skill level');
  }
  return {
    variance: saturation(level, 0.42, 4),
    reloadDuration: saturation(level, 0.55, 5),
    rackDuration: saturation(level, 0.62, 3),
  };
};
