import {
  array,
  check,
  finite,
  gtValue,
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
const PhysicalSkySchema = strictObject({
  /** Scales the model's radiance before it is mapped into display range; the model's own units are arbitrary. */
  exposure: NonNegative,
  /** 0 draws the keyed gradient only, 1 the physical sky; the dome scales it by the sun's height in `physicalBand`, so a low sun draws the gradient at any weight. */
  weight: UnitFraction,
  turbidity: NonNegative,
  rayleigh: NonNegative,
  mie: NonNegative,
  /** The model's Henyey-Greenstein asymmetry, which is undefined at 1. */
  mieDirectional: pipe(NonNegative, ltValue(1, 'must be below 1')),
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
  moon: strictObject({ colour: SkyColour, brightness: NonNegative }),
  /** The sun, painted over the sky whatever the physical sky's weight. */
  sun: strictObject({
    /** The disc and the air right round it. */
    colour: SkyColour,
    /** Scales the disc. */
    brightness: NonNegative,
    /** The air further out. */
    glowColour: SkyColour,
    /** Scales the halos, so a low sun can be wrapped in haze and a high one left clean. */
    glow: NonNegative,
  }),
});

/** The two edges, low to high, between which a smoothstep eases; reversed edges are undefined in GLSL. */
const Band = pipe(
  tuple([UnitFraction, UnitFraction]),
  check(([from, to]) => from < to, 'must rise from a lower to a higher edge'),
);

/** Two sun heights, as the sine of its elevation, between which a smoothstep eases; the sun can be below the horizon. */
const SunHeightBand = pipe(
  tuple([pipe(number(), minValue(-1), maxValue(1)), pipe(number(), minValue(-1), maxValue(1))]),
  check(([from, to]) => from < to, 'must rise from a lower to a higher edge'),
);

/** A lobe of light round a direction: `cos(angle) ** power * gain`. */
const Lobe = strictObject({ power: Positive, gain: NonNegative });

/** A body drawn on the dome: a disc with a tight halo and a wide one. */
const BodyShapeSchema = strictObject({
  /** The cosines of the angle from the body's centre between which the disc eases in; the body's size. */
  disc: Band,
  discGain: NonNegative,
  tightHalo: Lobe,
  wideHalo: Lobe,
});

/** The moon's body and its face. */
const MoonShapeSchema = strictObject({
  ...BodyShapeSchema.entries,
  /** How much darker the disc's rim is than its centre: 0 is a flat disc. */
  limbDarkening: UnitFraction,
  /** The darker seas on the disc: how much they darken it, and how many fit across it. */
  maria: strictObject({ depth: UnitFraction, scale: Positive }),
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
  /**
   * The sun heights between which the moon and the stars wash out of a brightening sky: whole below the first, gone
   * above the second, whatever the looks give them.
   */
  washOutBand: SunHeightBand,
  moon: MoonShapeSchema,
  sun: BodyShapeSchema,
  cloudLight: strictObject({
    /** How much of the main light's colour a cloud takes. */
    light: NonNegative,
    /** How much of the ambient sky colour a cloud takes. */
    ambient: NonNegative,
    /** The share of the main light that depends on facing it; the rest lights a cloud evenly. */
    facing: UnitFraction,
    /** The most main-light intensity a deck layer takes; the tops take up to 1. */
    deckLight: UnitFraction,
  }),
  cloudShape: strictObject({
    /** How fast the cloud threshold falls as cover rises. */
    coverGain: NonNegative,
    /** How wide the cloud edge is in noise units. */
    edgeSoftness: Positive,
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

/** One layer of the layered cloud field. */
const CloudLayerSchema = strictObject({
  scale: Positive,
  angle: FiniteNumber,
  /** Texture-space drift per second along x and y. */
  drift: tuple([FiniteNumber, FiniteNumber]),
  opacity: UnitFraction,
  /** How much of the layer takes the deck's main light rather than the tops'. */
  shade: UnitFraction,
});

/** The kinds of cloud the dome draws; each weather state names the one it shows. */
const CLOUD_KINDS = ['layered', 'scatter'] as const;
const CloudKind = picklist(CLOUD_KINDS);

/** The layered field: flat layers drawn from the same warped noise at their own scale, angle and drift. */
const LayeredCloudsSchema = strictObject({
  warp: NonNegative,
  /** The sky dome (#1505) samples every layer on every sky pixel, so the count is capped to bound that cost. */
  layers: pipe(array(CloudLayerSchema), minLength(1), maxLength(4)),
});

/** The scatter kind: a few big soft clouds, each shaded deeper towards its core and lined where the light is behind it. */
const ScatterCloudsSchema = strictObject({
  /** The noise's frequency over the cloud plane: higher draws more, smaller clouds. */
  scale: Positive,
  /** Noise-space drift per second along x and y. */
  drift: tuple([FiniteNumber, FiniteNumber]),
  /** How fast the noise's octaves slide past one another per second, so the clouds billow rather than slide as one. */
  billow: NonNegative,
  /**
   * The large-scale swing in cover that leaves clear gaps beside dense banks: its frequency and its reach in cover;
   * a cover thinner than the reach thins the whole field with it.
   */
  region: strictObject({ scale: Positive, strength: UnitFraction }),
  /** How fast a cloud turns opaque past its edge. */
  density: Positive,
  /** The share of a cloud's light left at its self-shadowed core. */
  shadow: UnitFraction,
  /** How bright a cloud's rim shines with the light behind it. */
  lining: NonNegative,
});

/** Each kind's shape, which does not change over the day; the looks' `dome.clouds` set how much of it shows. */
const CloudsSchema = strictObject({
  layered: LayeredCloudsSchema,
  scatter: ScatterCloudsSchema,
});

/**
 * What one weather state does to the blended sky at full strength; at part strength it does that part. Every field
 * only closes towards overcast or scales down, so no tuning can push a value out of its range or brighten the sky.
 */
const WeatherSkySchema = strictObject({
  clouds: strictObject({
    /** The share of the look's clear sky the clouds close. */
    cover: UnitFraction,
    /** The share of the look's cloud transparency the clouds close. */
    opacity: UnitFraction,
  }),
  /** What is left of the physical sky's weight, so the keyed gradient shows instead of a blue sunlit sky. */
  physicalWeight: UnitFraction,
  /**
   * What is left of the lights painted on the dome, the sun with its glow, the moon and the stars. The layered deck
   * lets part of what lies behind it through even at full cover, so without this they would shine through it.
   */
  skyLights: UnitFraction,
  /** What is left of the main light, so the world under it reads flat. */
  light: UnitFraction,
  /**
   * What is left of the ambient light, which lights the cloud deck as well as the world, so the deck dims with the
   * greyed fog below it instead of standing brighter at the horizon.
   */
  ambient: UnitFraction,
  /** The sky's colours: the fog and mist colours and the dome's gradient. */
  skyColour: strictObject({
    /** What is left of their saturation, so they read grey. */
    saturation: UnitFraction,
    /** What is left of their brightness. */
    brightness: UnitFraction,
  }),
});

/** A weather state's sky and the kind of cloud it shows. */
const WeatherStateSchema = strictObject({ ...WeatherSkySchema.entries, kind: CloudKind });

/** The weather on top of the looks: fog, cloudiness and rain. */
const WeatherTuningSchema = pipe(
  strictObject({
    /**
     * The weather a session starts at; the looks' height fog is exactly their own density at this fogginess, and
     * their own clouds show at the fair cloudiness.
     */
    defaults: strictObject({
      fogginess: pipe(UnitFraction, minValue(Number.MIN_VALUE)),
      cloudiness: UnitFraction,
      rain: UnitFraction,
    }),
    /** How far thick fog pulls the distance fog in; fractions only shrink it, so both ends stay below 1. */
    fog: strictObject({
      nearTighten: pipe(UnitFraction, maxValue(0.99)),
      farTighten: pipe(UnitFraction, maxValue(0.99)),
    }),
    /** The looks' own sky: the cloudiness at which it shows, and its kind of cloud. */
    fair: strictObject({ cloudiness: UnitFraction, kind: CloudKind }),
    /** The sky between fair weather and overcast, at its own cloudiness. */
    cloudy: strictObject({ ...WeatherStateSchema.entries, cloudiness: UnitFraction }),
    /** The sky at full cloudiness. */
    overcast: WeatherStateSchema,
    /** Rain's sky on top of the overcast it brings with it. */
    rain: WeatherStateSchema,
  }),
  rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) {
      return;
    }
    // A clearer sky than fair weather, and each state on the way to overcast, needs its own room on the scale.
    const { fair, cloudy } = dataset.value;
    if (!(fair.cloudiness > 0 && fair.cloudiness < cloudy.cloudiness && cloudy.cloudiness < 1)) {
      addIssue({ message: 'fair.cloudiness and cloudy.cloudiness must rise strictly inside (0, 1)' });
    }
  }),
);

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
  rebakeChange: Positive,
  /** The fewest real seconds between two bakes, so a fast-forwarded clock cannot bake every frame. */
  rebakeRealSeconds: NonNegative,
  /** How strongly models reflect the open sky; sky exposure dims it where the sky cannot reach. */
  strength: NonNegative,
});

/** Where the main light comes from; how it follows the sun and the moon is code (core/sky.ts, `skyAt`). */
const MainLightSchema = strictObject({
  /**
   * The lowest the main light comes from, as the sine of its elevation, so it never grazes the ground near the
   * horizon. Above 0, so the sun's side and the moon's side never cancel as the light blends between them.
   */
  lowestHeight: pipe(UnitFraction, gtValue(0, 'must be above 0'), ltValue(1, 'must be below 1')),
  /** The drawn moon's brightness at and above which the main light comes wholly from the moon's side. */
  fromMoonAt: Positive,
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
  mainLight: MainLightSchema,
  /** Where a new game starts when the scenario names no time; light is good with dusk still far off. */
  defaultStartGameTimeOfDay: GameTimeOfDay,
  /** The named spawn-window times the sun doesn't derive: dawn and dusk follow the cycle's sun. */
  midnightGameTimeOfDay: GameTimeOfDay,
  noonGameTimeOfDay: GameTimeOfDay,
});
