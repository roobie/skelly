import { FAMILIES } from '../src/gun/parts.ts';
import { sweepCases } from './partSweepCases.ts';
import { definePartChecks } from './partSweepChecks.ts';
import { sweepGroup } from './sweeps.ts';

sweepGroup('full parameter product: bolt-carrier', () => {
  definePartChecks(FAMILIES['bolt-carrier']!, sweepCases('bolt-carrier', FAMILIES['bolt-carrier']!), 256);
});
