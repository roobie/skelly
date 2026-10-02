import type { Domain } from '../core/schema.ts';
import { ANTI_MATERIEL_RULES } from './antiMateriel/index.ts';
import { FAMILIES } from './parts.ts';
import {
  actionHandleRest,
  feedMatch,
  firingGrip,
  freeFloatClearance,
  handguardFit,
  magazineWellAxis,
  opticEyeRelief,
  opticMountFit,
  pistolBarrelCrown,
  thumbholeGripMatch,
  triggerGuard,
} from './rules.ts';
import { GUN_UNITS } from './units.ts';

/** The gun domain. The core's main axis is the bore line. */
export const gunDomain: Domain = {
  name: 'gun',
  units: GUN_UNITS,
  families: FAMILIES,
  mountAllowances: { grip: 0.01, clamp: 0 },
  axisRules: [
    { kind: 'bore', mode: 'collinear' },
    { kind: 'sight', mode: 'parallel' },
    { kind: 'gas-cylinder', mode: 'parallel' },
  ],
  rules: [
    firingGrip,
    actionHandleRest,
    thumbholeGripMatch,
    feedMatch,
    pistolBarrelCrown,
    triggerGuard,
    handguardFit,
    freeFloatClearance,
    magazineWellAxis,
    opticMountFit,
    opticEyeRelief,
    ...ANTI_MATERIEL_RULES,
  ],
};
