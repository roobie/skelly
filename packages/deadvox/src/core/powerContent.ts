import {
  check,
  finite,
  type InferOutput,
  literal,
  maxValue,
  minValue,
  nonEmpty,
  number,
  pipe,
  strictObject,
  string,
  variant,
} from 'valibot';

/**
 * Integer units per authored unit (`docs/electricity.md`, "Integer units"). Rates count units per game
 * millisecond, so a watt and a litre per game hour scale alike.
 */
export const POWER_UNITS = {
  /** Watts to microjoules per game millisecond; litres per game hour to fuel units per game millisecond. */
  rate: 1000,
  /** Watt-hours to microjoules; litres to fuel units. */
  amount: 3_600_000_000,
  /** Efficiency to parts per million. */
  efficiency: 1_000_000,
  gameMillisecondsPerGameSecond: 1000,
} as const;

/** The whole number of units an authored value makes, or undefined when it is not exact. */
export const unitCount = (value: number, scale: number): number | undefined => {
  const count = Math.round(value * scale);
  return Number.isSafeInteger(count) && count / scale === value ? count : undefined;
};

export const exactUnits = (value: number, scale: number): number => {
  const count = unitCount(value, scale);
  if (count === undefined) {
    throw new Error('Power value has no exact integer units');
  }
  return count;
};

const exact = (scale: number) =>
  check((value: number) => unitCount(value, scale) !== undefined, 'must be exact in power units');
const NonNegative = pipe(number(), finite(), minValue(0));
const Positive = pipe(number(), finite(), minValue(Number.MIN_VALUE));
const Watts = pipe(NonNegative, exact(POWER_UNITS.rate));
const Efficiency = pipe(Positive, maxValue(1), exact(POWER_UNITS.efficiency));
const Identity = pipe(string(), nonEmpty());
const common = { id: Identity, priority: pipe(number(), finite()) };

export const PowerDeviceSchema = variant('kind', [
  strictObject({
    ...common,
    kind: literal('generator'),
    outputWatts: Watts,
    burnLitresPerGameHour: pipe(Positive, exact(POWER_UNITS.rate)),
  }),
  strictObject({
    ...common,
    kind: literal('solar'),
    outputWatts: strictObject({ night: Watts, dawn: Watts, day: Watts, dusk: Watts }),
  }),
  strictObject({
    ...common,
    kind: literal('battery'),
    capacityWh: pipe(Positive, exact(POWER_UNITS.amount)),
    chargeEfficiency: Efficiency,
    dischargeEfficiency: Efficiency,
  }),
  strictObject({ ...common, kind: literal('consumer'), demandWatts: Watts }),
  strictObject({ ...common, kind: literal('switch') }),
]);

export const PowerTuningSchema = strictObject({ id: Identity, tickSimSeconds: Positive });
export type PowerDeviceDef = InferOutput<typeof PowerDeviceSchema>;
export type PowerTuningDef = InferOutput<typeof PowerTuningSchema>;
