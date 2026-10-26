import { FAMILIES } from '../src/gun/parts.ts';
import { sweepCases } from './partSweepCases.ts';
import { definePartChecks } from './partSweepChecks.ts';
import { sweepGroup } from './sweeps.ts';

sweepGroup('full parameter product: receiver standard', () => {
  const receiver = FAMILIES.receiver!;
  definePartChecks(
    receiver,
    sweepCases('receiver', receiver).filter(({ section }) => section === 'standard'),
    256,
  );
});
