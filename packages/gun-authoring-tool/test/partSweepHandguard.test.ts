import { FAMILIES } from '../src/gun/parts.ts';
import { sweepCases } from './partSweepCases.ts';
import { definePartChecks } from './partSweepChecks.ts';
import { sweepGroup } from './sweeps.ts';

sweepGroup('full parameter product: handguard', () => {
  definePartChecks(FAMILIES.handguard!, sweepCases('handguard', FAMILIES.handguard!), 256);
});
