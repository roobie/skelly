import { boolean, finite, type InferOutput, minValue, number, picklist, pipe, strictObject } from 'valibot';
import { Count } from './primitives.ts';

export const AttemptPolicySchema = strictObject({
  resumeStored: boolean(),
  persist: boolean(),
  exportFormat: picklist(['metrics', 'attempt']),
  countPaused: boolean(),
  countHidden: boolean(),
  compressionThreshold: pipe(number(), finite(), minValue(1)),
  persistIntervalRealMs: pipe(number(), finite(), minValue(0)),
  persistOnInterruption: boolean(),
  limits: strictObject({
    history: pipe(Count, minValue(1)),
    pockets: pipe(Count, minValue(1)),
    marks: pipe(Count, minValue(1)),
  }),
});

export type AttemptPolicyDef = InferOutput<typeof AttemptPolicySchema>;
export type MetricsLimits = AttemptPolicyDef['limits'];
