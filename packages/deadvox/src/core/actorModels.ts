export const BODY_PLANS = {
  humanoid: { generator: 'humanoid-figure-v1' },
  acid: { generator: 'humanoid-figure-v1' },
  'fused-mass': { generator: 'amalgam-figure-v1' },
} as const;

export const FIGURE_VARIANTS = {
  humanoid: { bodyPlan: 'humanoid', model: 'humanoid' },
  runner: { bodyPlan: 'humanoid', model: 'runner' },
  crawler: { bodyPlan: 'humanoid', model: 'crawler' },
  brute: { bodyPlan: 'humanoid', model: 'brute' },
  acid: { bodyPlan: 'acid', model: 'acid' },
  'fused-mass': { bodyPlan: 'fused-mass', model: 'amalgam' },
} as const;

export type BodyPlan = keyof typeof BODY_PLANS;
export type ActorModel = keyof typeof FIGURE_VARIANTS;

export const figureVariantOf = (type: { readonly model: string; readonly figure?: string | undefined }): ActorModel =>
  (type.figure ?? type.model) as ActorModel;

export const bodyPlanModel = (variant: string) => {
  if (!Object.hasOwn(FIGURE_VARIANTS, variant)) {
    throw new Error(`Unsupported figure variant "${variant}"`);
  }
  return FIGURE_VARIANTS[variant as ActorModel].model;
};
