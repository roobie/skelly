import { BLEEDING_TIERS, type Body } from '../core/body.ts';

/** Fresh debug games may start with the left leg bleeding at a tier (`?wound=arterial`), to look at it without a fight. */
export const setDebugWound = (body: Body, search: string, enabled: boolean, fresh: boolean): void => {
  const tier = BLEEDING_TIERS.find((candidate) => candidate === new URLSearchParams(search).get('wound'));
  if (enabled && fresh && tier) {
    body.impact(0, 'leftLeg', { bleeding: tier, infectionAtRisk: false });
  }
};
