import type { Domain } from '../core/schema.ts';
import { FAMILIES } from './parts.ts';
import { feedMatch, firingGrip } from './rules.ts';

/** The gun domain. The core's main axis is the bore line. */
export const gunDomain: Domain = {
  name: 'gun',
  families: FAMILIES,
  axisRules: [
    { kind: 'bore', mode: 'collinear' },
    { kind: 'sight', mode: 'parallel' },
  ],
  rules: [firingGrip, feedMatch],
};
