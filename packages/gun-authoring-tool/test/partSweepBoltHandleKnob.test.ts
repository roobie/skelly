import { FAMILIES } from '../src/gun/parts.ts';
import { sweepCases } from './partSweepCases.ts';
import { definePartChecks } from './partSweepChecks.ts';
import { sweepGroup } from './sweeps.ts';

sweepGroup('full parameter product: bolt-handle-knob', () => {
  definePartChecks(FAMILIES['bolt-handle-knob']!, sweepCases('bolt-handle-knob', FAMILIES['bolt-handle-knob']!), 256);
});
