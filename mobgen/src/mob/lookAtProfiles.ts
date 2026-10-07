export interface LookAtProfile {
  readonly neck: { readonly yawDeg: number; readonly pitchDeg: number };
  readonly head: { readonly yawDeg: number; readonly pitchDeg: number };
  readonly turnRateDegPerSecond: number;
}

/** Presentation limits for the registered rigs; kept outside simulation templates and state. */
export const LOOK_AT_PROFILES: Readonly<Record<string, LookAtProfile>> = {
  shambler: {
    neck: { yawDeg: 25, pitchDeg: 20 },
    head: { yawDeg: 35, pitchDeg: 25 },
    turnRateDegPerSecond: 120,
  },
  runner: {
    neck: { yawDeg: 22, pitchDeg: 18 },
    head: { yawDeg: 34, pitchDeg: 24 },
    turnRateDegPerSecond: 140,
  },
  crawler: {
    neck: { yawDeg: 28, pitchDeg: 50 },
    head: { yawDeg: 38, pitchDeg: 42 },
    turnRateDegPerSecond: 110,
  },
  brute: {
    neck: { yawDeg: 20, pitchDeg: 16 },
    head: { yawDeg: 30, pitchDeg: 22 },
    turnRateDegPerSecond: 90,
  },
  boss: {
    neck: { yawDeg: 20, pitchDeg: 16 },
    head: { yawDeg: 30, pitchDeg: 22 },
    turnRateDegPerSecond: 90,
  },
};
