import { minValue, number, pipe, strictObject } from 'valibot';
import { Id } from './primitives.ts';

/** A dimensionless time multiplier; 1 runs at the normal Sim rate. */
const CompressionCap = pipe(number(), minValue(1, 'must be at least 1'));

export const CompressionTuningSchema = strictObject({
  id: Id,
  /** The highest compression each compressing long action ramps to; prying always runs at 1×. */
  caps: strictObject({
    wait: CompressionCap,
    rest: CompressionCap,
    sleep: CompressionCap,
    craft: CompressionCap,
    reading: CompressionCap,
    treatment: CompressionCap,
  }),
});
