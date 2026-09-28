import type { Domain } from '../core/schema.ts';
import { FAMILIES } from './parts.ts';
import { feedMatch, firingGrip, handguardFit, magazineWellAxis, pistolBarrelCrown } from './rules.ts';

/** The gun domain. The core's main axis is the bore line. */
export const gunDomain: Domain = {
  name: 'gun',
  families: FAMILIES,
  axisRules: [
    { kind: 'bore', mode: 'collinear' },
    { kind: 'sight', mode: 'parallel' },
    { kind: 'gas-system', mode: 'parallel' },
  ],
  rules: [firingGrip, feedMatch, pistolBarrelCrown, handguardFit, magazineWellAxis],
};
