import { FAMILIES } from '../src/gun/parts.ts';
import { sweepCases } from './partSweepCases.ts';
import { definePartChecks } from './partSweepChecks.ts';
import { sweepGroup } from './sweeps.ts';

sweepGroup('full parameter product: bolt-handle-arm', () => {
  definePartChecks(FAMILIES['bolt-handle-arm']!, sweepCases('bolt-handle-arm', FAMILIES['bolt-handle-arm']!), 256);
});
