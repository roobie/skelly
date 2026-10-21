import {
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

const NonNegative = pipe(number(), finite(), minValue(0));
const Positive = pipe(number(), finite(), minValue(Number.MIN_VALUE));
const Efficiency = pipe(Positive, maxValue(1));
const Identity = pipe(string(), nonEmpty());
const common = { id: Identity, priority: pipe(number(), finite()) };

export const PowerDeviceSchema = variant('kind', [
  strictObject({ ...common, kind: literal('generator'), outputWatts: NonNegative, burnLitresPerGameHour: Positive }),
  strictObject({
    ...common,
    kind: literal('solar'),
    outputWatts: strictObject({ night: NonNegative, dawn: NonNegative, day: NonNegative, dusk: NonNegative }),
  }),
  strictObject({
    ...common,
    kind: literal('battery'),
    capacityWh: Positive,
    chargeEfficiency: Efficiency,
    dischargeEfficiency: Efficiency,
  }),
  strictObject({ ...common, kind: literal('consumer'), demandWatts: NonNegative }),
]);

export const PowerTuningSchema = strictObject({ id: Identity, tickSimSeconds: Positive });
export type PowerDeviceDef = InferOutput<typeof PowerDeviceSchema>;
export type PowerTuningDef = InferOutput<typeof PowerTuningSchema>;
