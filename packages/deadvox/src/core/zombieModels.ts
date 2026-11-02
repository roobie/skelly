export const BODY_PLANS = {
  humanoid: { model: 'shambler', generator: 'shambler-figure-v1' },
  runner: { model: 'runner', generator: 'shambler-figure-v1' },
  crawler: { model: 'crawler', generator: 'shambler-figure-v1' },
  brute: { model: 'brute', generator: 'shambler-figure-v1' },
  acid: { model: 'acid', generator: 'shambler-figure-v1' },
  'fused-mass': { model: 'amalgam', generator: 'amalgam-figure-v1' },
} as const;

export type BodyPlan = keyof typeof BODY_PLANS;
export type ZombieModel = BodyPlan;

export const bodyPlanModel = (plan: string) => {
  if (!Object.hasOwn(BODY_PLANS, plan)) {
    throw new Error(`Unsupported body plan "${plan}"`);
  }
  return BODY_PLANS[plan as BodyPlan].model;
};
