import { check, finite, maxValue, minValue, number, parse, pipe, record, strictObject, string, tuple } from 'valibot';
import content from './triggerGuards.json' with { type: 'json' };

const Positive = pipe(number(), finite(), minValue(Number.MIN_VALUE));
const Angle = pipe(
  Positive,
  maxValue(90),
  check((value) => value < 90, 'Angle must be below ninety degrees.'),
);
const Extent = pipe(
  tuple([pipe(number(), finite()), pipe(number(), finite())]),
  check(([min, max]) => min < max),
);
const Guard = strictObject({
  wallU: Positive,
  clearanceU: Positive,
  halfWidthU: Positive,
  frontCutU: Positive,
  frontCutDegrees: Angle,
  rearSlantDegrees: Angle,
  fingerY: Extent,
  fingerZ: Extent,
});
export const TRIGGER_GUARDS = parse(record(string(), Guard), content);
export type TriggerGuardDimensions = (typeof TRIGGER_GUARDS)[string];
