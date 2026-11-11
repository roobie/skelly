import {
  array,
  check,
  finite,
  literal,
  ltValue,
  maxLength,
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
  tuple,
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

/** The dome's physical (Preetham) sky model in its own terms, so hazier air at a low sun is content, not code. */
const FiniteNonNegative = pipe(NonNegative, finite('must be finite'));

const PhysicalSkySchema = strictObject({
  /** Scales the model's radiance before it is mapped into display range; the model's own units are arbitrary. */
  exposure: FiniteNonNegative,
  /** 0 draws the keyed gradient only, 1 the physical sky; the dome scales it by the sun's height in `physicalBand`, so a low sun draws the gradient at any weight. */
  weight: UnitFraction,
  turbidity: FiniteNonNegative,
  rayleigh: FiniteNonNegative,
  mie: FiniteNonNegative,
  /** The model's Henyey-Greenstein asymmetry, which is undefined at 1. */
  mieDirectional: pipe(FiniteNonNegative, ltValue(1, 'must be below 1')),
});

/** The sky dome of one look: the gradient between the fog colour and the zenith, the physical sky, clouds and stars. */
const DomeLookSchema = strictObject({
  zenith: SkyColour,
  /** The band just above the horizon, between the look's fog colour (`sky`) and the zenith. */
  horizonGlow: SkyColour,
  physical: PhysicalSkySchema,
  clouds: strictObject({
    /** Moves the cloud threshold: 0 is clear, 1 overcast. */
    cover: UnitFraction,
    /** Scales every cloud layer's own opacity. */
    opacity: UnitFraction,
  }),
  /** Star brightness. */
  stars: UnitFraction,
  /** The moon, which the dome draws opposite the sun. */
  moon: strictObject({ colour: SkyColour, brightness: FiniteNonNegative }),
  /** The sun, painted over the sky whatever the physical sky's weight. */
  sun: strictObject({
    /** The disc and the air right round it. */
    colour: SkyColour,
    /** Scales the disc. */
    brightness: FiniteNonNegative,
    /** The air further out. */
    glowColour: SkyColour,
    /** Scales the halos, so a low sun can be wrapped in haze and a high one left clean. */
    glow: FiniteNonNegative,
  }),
});

/** The two edges, low to high, between which a smoothstep eases; reversed edges are undefined in GLSL. */
const Band = pipe(
  tuple([UnitFraction, UnitFraction]),
  check(([from, to]) => from < to, 'must rise from a lower to a higher edge'),
);

const FinitePositive = pipe(Positive, finite('must be finite'));

/** A lobe of light round a direction: `cos(angle) ** power * gain`. */
const Lobe = strictObject({ power: FinitePositive, gain: FiniteNonNegative });

/** A body drawn on the dome: a disc with a tight halo and a wide one. */
const BodyShapeSchema = strictObject({
  /** The cosines of the angle from the body's centre between which the disc eases in; the body's size. */
  disc: Band,
  discGain: FiniteNonNegative,
  tightHalo: Lobe,
  wideHalo: Lobe,
});

/** The dome's shape that does not change over the day: how its gradient, stars, bodies and cloud light are built from the looks. */
const DomeShapeSchema = strictObject({
  /** Where the look's fog colour eases into the horizon glow, as the sine of the elevation. */
  horizonBand: Band,
  /** Where the horizon glow eases into the zenith, as the sine of the elevation. */
  glowBand: Band,
  /** The sun heights between which the physical sky comes in over the keyed gradient: none below the first, all of it above the second. */
  physicalBand: Band,
  starField: strictObject({
    /** The fraction of the field's cells that hold a star. */
    density: UnitFraction,
    /** A star's radius as a fraction of its cell. */
    size: pipe(UnitFraction, minValue(Number.MIN_VALUE)),
    /** How far a star's brightness dips below full: 0 is steady. */
    twinkle: UnitFraction,
  }),
  moon: BodyShapeSchema,
  sun: BodyShapeSchema,
  cloudLight: strictObject({
    /** How much of the main light's colour a cloud takes. */
    light: FiniteNonNegative,
    /** How much of the ambient sky colour a cloud takes. */
    ambient: FiniteNonNegative,
    /** The share of the main light that depends on facing it; the rest lights a cloud evenly. */
    facing: UnitFraction,
  }),
  cloudShape: strictObject({
    /** How fast the cloud threshold falls as cover rises. */
    coverGain: FiniteNonNegative,
    /** How wide the cloud edge is in noise units. */
    edgeSoftness: FinitePositive,
    /** Where clouds fade in above the horizon, as the sine of the elevation. */
    horizonFade: Band,
  }),
});

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
  dome: DomeLookSchema,
});

const FiniteNumber = pipe(number(), finite());

/** One cloud layer of the field; the layers are drawn from the same warped noise at their own scale, angle and drift. */
const CloudLayerSchema = strictObject({
  scale: Positive,
  angle: FiniteNumber,
  /** Texture-space drift per second along x and y. */
  drift: tuple([FiniteNumber, FiniteNumber]),
  opacity: UnitFraction,
});

/** The cloud field's shape, which does not change over the day; the looks' `dome.clouds` set how much of it shows. */
const CloudsSchema = strictObject({
  warp: NonNegative,
  /** The sky dome (#1505) samples every layer on every sky pixel, so the count is capped to bound that cost. */
  layers: pipe(array(CloudLayerSchema), minLength(1), maxLength(4)),
});

/** The weather's fog on top of the looks; fractions only shrink the distance fog, so both stay below 1. */
const WeatherTuningSchema = strictObject({
  /** The fogginess a session starts at; the looks' height fog is exactly their own density here. */
  defaultFogginess: pipe(UnitFraction, minValue(Number.MIN_VALUE)),
  nearTighten: pipe(UnitFraction, maxValue(0.99)),
  farTighten: pipe(UnitFraction, maxValue(0.99)),
});

/** The sky's reflection on models: a prefiltered map of the dome alone, redrawn only once the look has moved enough to show. */
const SkyEnvironmentSchema = strictObject({
  /**
   * Cube face edge in pixels; prefiltering halves it per level, so a size between powers of two would be wasted.
   * The minimum is three's smallest prefilter level; the maximum is a cost cap, since the reflection is blurred.
   */
  faceSize: pipe(
    Count,
    minValue(16),
    maxValue(256),
    check((size) => Number.isInteger(Math.log2(size)), 'must be a power of two'),
  ),
  /** How far the drawn sky moves, as its largest change in any value, before the reflection is redrawn: smaller follows twilight closer for more bakes. */
  rebakeChange: FinitePositive,
  /** How strongly models reflect the open sky; sky exposure dims it where the sky cannot reach. */
  strength: FiniteNonNegative,
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
  clouds: CloudsSchema,
  domeShape: DomeShapeSchema,
  environment: SkyEnvironmentSchema,
  /** Where a new game starts when the scenario names no time; light is good with dusk still far off. */
  defaultStartGameTimeOfDay: GameTimeOfDay,
  /** The named spawn-window times the sun doesn't derive: dawn and dusk follow the cycle's sun. */
  midnightGameTimeOfDay: GameTimeOfDay,
  noonGameTimeOfDay: GameTimeOfDay,
});
