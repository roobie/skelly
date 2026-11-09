import { templateByName } from '@mobgen/core/template.ts';
// Registers the humanoid templates actor types still name, so lookups hold wherever validation runs.
import '@mobgen/mob/templates.ts';
import { bodyPlanModel, FIGURE_VARIANTS, figureVariantOf } from './actorModels.ts';

/** Whether losing a leg drops this actor type to its crawl set; an authored leg cut is a shape, not an injury. */
export const crawlsAfterLegLoss = (type: { readonly model: string; readonly figure?: string | undefined }): boolean => {
  const variant = figureVariantOf(type);
  const model = bodyPlanModel(variant);
  return FIGURE_VARIANTS[variant].bodyPlan === 'humanoid' && templateByName(model).legCut === undefined;
};
