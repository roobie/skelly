import type { Actor } from './actorState.ts';
import type { ActorBody } from './schema/actors.ts';

/** Whether losing a leg drops a body to its crawl set; an authored leg cut is a shape, not an injury. */
export const crawlsAfterLegLoss = (body: Pick<ActorBody, 'bodyPlan' | 'legCut'>): boolean =>
  body.bodyPlan === 'humanoid' && body.legCut === undefined;

export interface LostLegs {
  readonly left: boolean;
  readonly right: boolean;
}

/** The legs an actor has lost: a destroyed leg region, or any severable part of the leg cut. */
export const lostLegs = (
  actor: Pick<Actor, 'regions' | 'severed'>,
  body: Pick<ActorBody, 'severableParts'>,
): LostLegs => {
  const lost = (region: 'leftLeg' | 'rightLeg'): boolean => {
    const health = actor.regions[region];
    return (
      (health !== undefined && health <= 0) ||
      (body.severableParts?.[region] ?? []).some((part) => actor.severed.includes(part))
    );
  };
  return { left: lost('leftLeg'), right: lost('rightLeg') };
};

/**
 * The clip set a leaper moves on: one lost hind leg limps on that side, both drag the body
 * (`packages/deadvox/docs/leaper.md`, "Gait by injury").
 */
export type LeaperGait =
  | { readonly set: 'standing' }
  | { readonly set: 'limping'; readonly side: 'left' | 'right' }
  | { readonly set: 'dragging' };

export const leaperGaitOf = ({ left, right }: LostLegs): LeaperGait => {
  if (left && right) {
    return { set: 'dragging' };
  }
  if (left || right) {
    return { set: 'limping', side: left ? 'left' : 'right' };
  }
  return { set: 'standing' };
};
