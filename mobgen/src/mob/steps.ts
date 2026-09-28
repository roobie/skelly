// Per-step randomization for a "drunk shamble": each step (a stance-to-stance interval, alternating
// feet) gets a style and jittered parameters, deterministic from (genome seed, step index) — no new
// sampled genome params, so a seed's walk doesn't reshuffle when this file changes its own constants.

import type { HumanoidParams } from './humanoid.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** mulberry32: small, fast, deterministic — plenty for cosmetic jitter, not cryptographic. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

/** Combines the genome seed and a step index into one 32-bit PRNG seed. */
const stepSeed = (seed: number, stepIndex: number): number => {
  let h = (seed ^ 0x9e_37_79_b9) >>> 0;
  h = Math.imul(h ^ stepIndex, 0x9e_37_79_b1) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
};

export type StepStyle = 'normal' | 'stagger' | 'drag' | 'lurch';

/** Per-step offsets on top of the genome's base gait — see stepPlanFor. All multipliers are 1 (or 0 for
 * additive fields) at a plain step. */
export interface StepPlan {
  readonly style: StepStyle;
  readonly side: 'L' | 'R';
  readonly lengthMul: number; // this step's length vs. the genome's normal per-step length
  readonly lateralX: number; // metres, hip-relative offset of this step's landing spot from on-line
  readonly liftMul: number; // multiplies footLift for this step's swing
  readonly rollMul: number; // multiplies the heel/toe roll for this step's stance
  readonly hipDropMul: number; // multiplies the hip-bob amplitude around this step
  readonly leanExtraDeg: number; // extra forward lean while this step is active
  readonly armWideExtraDeg: number; // extra arm-out-to-the-side (stagger: balance)
  readonly armForwardExtraDeg: number; // extra forward arm swing (lurch: flail)
  readonly armHangSide: 'L' | 'R' | null; // an arm that goes slack (drag) while this step is active
}

const sideForStep = (stepIndex: number): 'L' | 'R' => (stepIndex % 2 === 0 ? 'L' : 'R');

/** Style weights before jitter/anti-repeat, skewed a little by traits the genome already samples — each
 * actor's own "drunkenness" mix, no new params. */
const styleWeights = (params: HumanoidParams): Record<StepStyle, number> => ({
  normal: 6,
  stagger: 0.6 + params.pelvisSway / 6,
  drag: 0.6 + params.limp * 2.5,
  lurch: 0.6 + clamp(params.hunch / 15, 0, 1) + clamp((params.strideFactor - 1) * 2, 0, 1),
});

const STYLES: readonly StepStyle[] = ['normal', 'stagger', 'drag', 'lurch'];

const pickStyle = (rand: () => number, weights: Record<StepStyle, number>): StepStyle => {
  const total = STYLES.reduce((sum, s) => sum + weights[s], 0);
  let r = rand() * total;
  for (const style of STYLES) {
    r -= weights[style];
    if (r <= 0) {
      return style;
    }
  }
  return 'normal';
};

/** This step's plan — deterministic from (seed, stepIndex, params): same inputs always give the same
 * plan. Looks back exactly one step (not chained further) to avoid repeating an odd style twice running. */
export const stepPlanFor = (seed: number, stepIndex: number, params: HumanoidParams): StepPlan => {
  const rand = mulberry32(stepSeed(seed, stepIndex));
  let style = pickStyle(rand, styleWeights(params));
  if (style !== 'normal' && stepIndex > 0 && stepPlanFor(seed, stepIndex - 1, params).style === style) {
    style = 'normal';
  }
  const side = sideForStep(stepIndex);
  const sign = side === 'L' ? -1 : 1;

  // Jitter every step, on top of the style: length +-15%, a little lateral noise, lift, lean.
  const lengthMul = 1 + (rand() * 2 - 1) * 0.15;
  const lateralNoise = (rand() * 2 - 1) * 0.03;
  const liftMul = 1 + (rand() * 2 - 1) * 0.2;
  const leanExtraDeg = (rand() * 2 - 1) * 2;

  if (style === 'stagger') {
    const magnitude = 0.1 + rand() * 0.05; // 0.1-0.15 m
    const crossOver = rand() < 0.3; // sometimes crosses toward/over the midline instead of going wider
    return {
      style,
      side,
      lengthMul,
      lateralX: lateralNoise + sign * magnitude * (crossOver ? -1 : 1),
      liftMul,
      rollMul: 1,
      hipDropMul: 1,
      leanExtraDeg,
      armWideExtraDeg: 15 + rand() * 10,
      armForwardExtraDeg: 0,
      armHangSide: null,
    };
  }
  if (style === 'drag') {
    return {
      style,
      side,
      lengthMul: lengthMul * (0.8 + rand() * 0.15),
      lateralX: lateralNoise,
      liftMul: 0.15 + rand() * 0.15, // barely clears the ground
      rollMul: 0.2,
      hipDropMul: 1,
      leanExtraDeg: leanExtraDeg + 4 + rand() * 4,
      armWideExtraDeg: 0,
      armForwardExtraDeg: 0,
      armHangSide: side,
    };
  }
  if (style === 'lurch') {
    return {
      style,
      side,
      lengthMul: lengthMul * (1.25 + rand() * 0.2),
      lateralX: lateralNoise,
      liftMul,
      rollMul: 1,
      hipDropMul: 1.6 + rand() * 0.6,
      leanExtraDeg: leanExtraDeg + 6 + rand() * 5,
      armWideExtraDeg: 0,
      armForwardExtraDeg: 10 + rand() * 15,
      armHangSide: null,
    };
  }
  return {
    style: 'normal',
    side,
    lengthMul,
    lateralX: lateralNoise,
    liftMul,
    rollMul: 1,
    hipDropMul: 1,
    leanExtraDeg,
    armWideExtraDeg: 0,
    armForwardExtraDeg: 0,
    armHangSide: null,
  };
};
