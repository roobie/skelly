import {
  array,
  check,
  finite,
  literal,
  maxValue,
  minLength,
  minValue,
  number,
  picklist,
  pipe,
  rawCheck,
  regex,
  strictObject,
  string,
  transform,
} from 'valibot';
import { Degrees } from './layouts.ts';
import { Count, GameTimeOfDay, NonNegative, Positive } from './primitives.ts';

const CalendarDateSchema = pipe(
  strictObject({
    month: pipe(Count, minValue(1), maxValue(12)),
    day: pipe(Count, minValue(1), maxValue(31)),
  }),
  check(({ month, day }) => day <= [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!, 'invalid date'),
);

const SkyColour = pipe(
  string(),
  regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb colour'),
  transform((text): readonly [number, number, number] => {
    const rgb = Number.parseInt(text.slice(1), 16);
    return [((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255];
  }),
);

const UnitFraction = pipe(number(), finite(), minValue(0), maxValue(1));

/** One sky look: the keyframe values the time of day blends between (core/sky.ts owns the blend). */
const SkyLookSchema = strictObject({
  sky: SkyColour,
  lightColor: SkyColour,
  lightIntensity: NonNegative,
  ambientSky: SkyColour,
  ambientGround: SkyColour,
  ambientIntensity: NonNegative,
  fogNear: UnitFraction,
  fogFar: UnitFraction,
  heightFog: NonNegative,
  heightFogColor: SkyColour,
  bloom: NonNegative,
  tone: UnitFraction,
});

/** The weather's fog on top of the looks; fractions only shrink the distance fog, so both stay below 1. */
const WeatherTuningSchema = strictObject({
  /** The fogginess a session starts at; the looks' height fog is exactly their own density here. */
  defaultFogginess: pipe(UnitFraction, minValue(Number.MIN_VALUE)),
  nearTighten: pipe(UnitFraction, maxValue(0.99)),
  farTighten: pipe(UnitFraction, maxValue(0.99)),
});

const SKY_PHASES = ['night', 'dawn', 'day', 'dusk'] as const;

/** Where a look sits in a solar phase: 0 is the phase's start, 1 its end. */
const SkyKeySchema = strictObject({
  phase: picklist(SKY_PHASES),
  at: UnitFraction,
  look: picklist(['night', 'deepNight', 'dawn', 'day', 'dusk']),
});

/**
 * The blend sorts keys by time and wraps the last to the first, so two keys at one instant would
 * make the blend span a whole day. Keys therefore run in cycle order, strictly later each time,
 * and the last stays short of the first a cycle later.
 */
const SkyKeysSchema = pipe(
  array(SkyKeySchema),
  minLength(2),
  rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) {
      return;
    }
    const positions = dataset.value.map((key) => SKY_PHASES.indexOf(key.phase) + key.at);
    positions.forEach((position, index) => {
      if (index > 0 && position <= positions[index - 1]!) {
        addIssue({ message: `keys[${index}].at must come strictly after the key before it in cycle order` });
      }
    });
    const last = positions.length - 1;
    if (positions[last]! >= positions[0]! + SKY_PHASES.length) {
      addIssue({ message: `keys[${last}].at must come strictly before the first key a cycle later` });
    }
  }),
);

export const DayCycleSchema = strictObject({
  /** Calendar seconds per simulation second: how long a game day lasts in play. A new session takes it; a save keeps its own. */
  clockRatio: Positive,
  latitudeDegrees: pipe(Degrees, minValue(-90), maxValue(90)),
  date: CalendarDateSchema,
  twilight: literal('nautical'),
  /** The keyframe looks by solar phase: night and deepNight around midnight, dawn and dusk at the sun's edge. */
  looks: strictObject({
    night: SkyLookSchema,
    deepNight: SkyLookSchema,
    dawn: SkyLookSchema,
    day: SkyLookSchema,
    dusk: SkyLookSchema,
  }),
  /** Which look sits where in its phase, in cycle order; timing tuning, with the order the blend needs enforced here. */
  keys: SkyKeysSchema,
  weather: WeatherTuningSchema,
  /** Where a new game starts when the scenario names no time; light is good with dusk still far off. */
  defaultStartGameTimeOfDay: GameTimeOfDay,
  /** The named spawn-window times the sun doesn't derive: dawn and dusk follow the cycle's sun. */
  midnightGameTimeOfDay: GameTimeOfDay,
  noonGameTimeOfDay: GameTimeOfDay,
});
