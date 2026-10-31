import {
  array,
  check,
  finite,
  maxValue,
  minValue,
  number,
  optional,
  parse,
  pipe,
  record,
  strictObject,
  string,
  tuple,
} from 'valibot';
import content from './triggerGuards.json' with { type: 'json' };

const Finite = pipe(number(), finite());
const Positive = pipe(number(), finite(), minValue(Number.MIN_VALUE));
const Angle = pipe(
  Positive,
  maxValue(90),
  check((value) => value < 90, 'Angle must be below ninety degrees.'),
);
const Extent = pipe(
  tuple([Finite, Finite]),
  check(([min, max]) => min < max),
);
const Guard = strictObject({
  wallU: Positive,
  clearanceU: Positive,
  halfWidthU: Positive,
  frontCutU: Positive,
  frontCutDegrees: Angle,
  rearSlantDegrees: Angle,
  /** Absent where a traced lower owns the finger's height. */
  fingerY: optional(Extent),
  fingerZ: Extent,
});
const Trigger = strictObject({
  lower: array(tuple([Positive, Positive])),
  topX: tuple([Positive, Positive]),
  halfWidthU: Positive,
});
const parsed = parse(strictObject({ trigger: Trigger, guards: record(string(), Guard) }), content);
export const TRIGGER_GUARDS = parsed.guards;
export const TRIGGER_BLADE = parsed.trigger;
export type TriggerGuardDimensions = (typeof TRIGGER_GUARDS)[string];
export type TriggerBladeShape = typeof TRIGGER_BLADE;
