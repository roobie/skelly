import { FAMILIES } from '../src/gun/parts.ts';
import { sweepCases } from './partSweepCases.ts';
import { definePartChecks } from './partSweepChecks.ts';
import { sweepGroup } from './sweeps.ts';

sweepGroup('full parameter product: receiver ar', () => {
  const receiver = FAMILIES.receiver!;
  definePartChecks(
    receiver,
    sweepCases('receiver', receiver).filter(({ section }) => section === 'ar'),
    256,
  );
});
