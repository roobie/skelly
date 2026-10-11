import type { Body } from '../core/body.ts';

/**
 * Fresh debug games may start with the left leg bleeding at a content tier, named by its id
 * (`?wound=arterial`), to look at it without a fight.
 */
export const setDebugWound = (body: Body, search: string, enabled: boolean, fresh: boolean): void => {
  const id = new URLSearchParams(search).get('wound');
  const tier = body.tuning.bleeding.tiers.findIndex((candidate) => candidate.id === id);
  if (enabled && fresh && tier >= 0) {
    body.impact(0, 'leftLeg', { bleeding: tier, infectionAtRisk: false });
  }
};
