import { templateByName } from '@mobgen/core/template.ts';
// Registers every template an actor type can name, so the lookup holds wherever validation runs.
import '@mobgen/mob/templates.ts';
import '@mobgen/mob/acidTemplate.ts';
import '@mobgen/mob/fusedMassTemplate.ts';
import { bodyPlanModel, figureVariantOf } from './actorModels.ts';

/** Whether losing a leg drops this actor type to its crawl set; an authored leg cut is a shape, not an injury. */
export const crawlsAfterLegLoss = (type: { readonly model: string; readonly figure?: string | undefined }): boolean => {
  const template = templateByName(bodyPlanModel(figureVariantOf(type)));
  return template.bodyPlan === 'humanoid' && template.legCut === undefined;
};
