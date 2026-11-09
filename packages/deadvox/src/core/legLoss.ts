import type { ActorBody } from './schema/actors.ts';

/** Whether losing a leg drops a body to its crawl set; an authored leg cut is a shape, not an injury. */
export const crawlsAfterLegLoss = (body: Pick<ActorBody, 'bodyPlan' | 'legCut'>): boolean =>
  body.bodyPlan === 'humanoid' && body.legCut === undefined;
