import {
  array,
  check,
  finite,
  integer,
  maxValue,
  minLength,
  minValue,
  number,
  optional,
  pipe,
  strictObject,
} from 'valibot';
import { GraphicsOptionsSchema } from '../graphics.ts';
import { SHADOW_DISTANCE_RANGE } from '../mood.ts';
import { capabilityField } from './capability.ts';
import { Degrees } from './layouts.ts';
import { Count, Fraction, Id, NonNegative, Positive, range } from './primitives.ts';

/** The view radii a run accepts, from the content default or a debug hash. */
export const VIEW_RADIUS_BOUNDS_M = { min: 32, max: 256 } as const;

/** An inclusive { min, max } range of one kind of number. */
const orderedRange = (item: typeof NonNegative | typeof Positive) =>
  pipe(
    strictObject({ min: item, max: item }),
    check(({ min, max }) => min <= max, 'min must not be more than max'),
  );

export const GraphicsTuningSchema = strictObject({
  id: Id,
  capability: capabilityField('graphics'),
  nearPlaneMetres: Positive,
  playerViewFovDegrees: pipe(number(), finite(), minValue(1), maxValue(179)),
  opticLens: strictObject({
    rimSoftness: pipe(Positive, maxValue(0.5)),
    reticleAntiAliasWidth: pipe(Positive, maxValue(2)),
  }),
  /**
   * The view radius a run starts with: what is meshed and drawn, and where the distance fog must be complete.
   * Streaming loads past it, so it sets the world's load as well as its look.
   */
  viewRadiusM: pipe(number(), finite(), minValue(VIEW_RADIUS_BOUNDS_M.min), maxValue(VIEW_RADIUS_BOUNDS_M.max)),
  readyRadiusM: pipe(number(), finite(), minValue(0)),
  /** How far past the view radius terrain stays loaded and drawn, so a column on the edge does not churn. */
  streamHysteresisM: pipe(Positive, finite()),
  /**
   * The camera's far plane as a multiple of where the fog ends. Fog goes by horizontal distance; a
   * larger scale lets more of what is far above or below the camera stay unfogged, and culls less
   * (`packages/presentation/src/render/distanceFog.ts`).
   */
  fogFarPlaneScale: pipe(number(), finite(), minValue(1)),
  /**
   * The distance fog's curve between a look's fog start and end: fog = t ** exponent, t running 0 to 1 over the band.
   * Above 1 the fog stays thin over most of the band and closes late, so far silhouettes keep their shape while the
   * view's edge still ends in pure fog colour.
   */
  fogCurveExponent: pipe(number(), finite(), minValue(0.25), maxValue(8)),
  itemPictureCacheCapacity: pipe(number(), integer(), minValue(1)),
  /** The inventory picture camera's margin around a model's fitted bounds. */
  itemPicture: strictObject({ framing: Positive }),
  modelLoadConcurrency: pipe(number(), integer(), minValue(1)),
  /** Retries of a model fetch that hit a passing server or network error, and the first wait, which doubles. */
  modelFetchRetry: strictObject({ retries: Count, backoffRealSeconds: NonNegative }),
  skyJobsInFlight: pipe(number(), integer(), minValue(2)),
  /**
   * The side, in chunks, of the square area one instanced batch of standing furniture covers. A larger area draws
   * fewer batches but culls less of what is out of view (`packages/presentation/src/render/furniture.ts`).
   */
  furnitureSectorChunks: pipe(number(), integer(), minValue(1)),
  skyPreloadRings: Count,
  /** Terrain columns admitted per frame while streaming (`packages/engine/src/game/streamer.ts`, `update`). */
  columnsPerFrame: pipe(number(), integer(), minValue(1)),
  /**
   * Dedicated workers that compute terrain columns ahead of admission, how many missing columns they are asked
   * for, nearest first, and how many columns may be running or staged at once
   * (`packages/engine/docs/decisions/terrain-workers.md`, "Decision").
   */
  terrainWorkers: strictObject({
    count: pipe(number(), integer(), minValue(1)),
    lookaheadColumns: pipe(number(), integer(), minValue(1)),
    maxOutstandingColumns: pipe(number(), integer(), minValue(1)),
  }),
  /** Diffuse sky visibility drawn where a sky field has no answer yet (`packages/deadvox/DESIGN.md`, "Light"). */
  unbuiltSkyCap: Fraction,
  /** The sky gradient vehicle finishes reflect (`packages/deadvox/GRAPHICS.md`, "Vehicle finishes"). */
  vehicleReflection: strictObject({
    cubeSize: pipe(
      number(),
      integer(),
      minValue(16),
      check((size) => Number.isInteger(Math.log2(size)), 'must be a power of two'),
    ),
    skyDrift: Fraction,
    zenithHeight: pipe(Positive, maxValue(1)),
    groundEdge: pipe(Positive, maxValue(1)),
    strength: Positive,
    horizonGain: Positive,
    coatGrazing: Fraction,
  }),
  sunShadow: pipe(
    strictObject({
      defaultReachMetres: pipe(
        number(),
        integer(),
        minValue(SHADOW_DISTANCE_RANGE.min),
        maxValue(SHADOW_DISTANCE_RANGE.max),
      ),
      debugReachMetres: pipe(
        array(pipe(number(), integer(), minValue(SHADOW_DISTANCE_RANGE.min), maxValue(SHADOW_DISTANCE_RANGE.max))),
        minLength(1),
      ),
    }),
    check(
      ({ defaultReachMetres, debugReachMetres }) =>
        new Set(debugReachMetres).size === debugReachMetres.length && debugReachMetres.includes(defaultReachMetres),
      'sun shadow reaches must be unique and include the default',
    ),
  ),
  /** The inventory item viewer: opening pose, drag and wheel response, and zoom range around the opening zoom of 1. */
  itemViewer: pipe(
    strictObject({
      /** Half the view's shorter side per bounding radius at zoom 1. */
      framing: Positive,
      startYawDegrees: Degrees,
      startPitchDegrees: Degrees,
      pitchLimitDegrees: pipe(number(), minValue(0), maxValue(90)),
      degreesPerPixel: Positive,
      zoomPerWheelPixel: Positive,
      zoomMin: Positive,
      zoomMax: Positive,
    }),
    check(({ zoomMin, zoomMax }) => zoomMin <= 1 && zoomMax >= 1, 'zoom range must include 1'),
    check(
      ({ startPitchDegrees, pitchLimitDegrees }) => Math.abs(startPitchDegrees) <= pitchLimitDegrees,
      'start pitch must be within the pitch limit',
    ),
  ),
  mobActors: strictObject({ maxCorpses: Count }),
  gore: strictObject({
    dropletCap: Count,
    splatCap: Count,
    dropletSpawnsPerFrame: Count,
    dripSourceCap: Count,
    /**
     * Flesh chunks thrown with the blood on every carve and on hard hits
     * (`packages/presentation/src/render/gore.ts`, `Gore.carved` and `Gore.wounded`): which models, how many a throw starts, the pool they recycle oldest first, how they fly,
     * spin and fade. A row without it throws none.
     */
    chunks: optional(
      strictObject({
        models: pipe(array(Id), minLength(1, 'must name at least one model')),
        cap: Count,
        perThrow: range(Count),
        /** The least damage of one hit that throws chunks from any enemy. */
        hardHitDamage: Positive,
        speedMetresPerRealSecond: orderedRange(NonNegative),
        /** How far a chunk's launch fans from the strike, as a share of its direction. */
        spreadFraction: NonNegative,
        spinRadiansPerRealSecond: orderedRange(NonNegative),
        /** Size against the model's own. */
        scale: orderedRange(Positive),
        /** Also the life of the splat a landed chunk lies on, so no bare splat is left where a chunk was. */
        lifetimeRealSeconds: Positive,
        /** The end of its lifetime over which a chunk shrinks away and its splat fades. */
        fadeRealSeconds: Positive,
        /** The splat a landed chunk lies on: small enough that the chunk stands out from it, not lost in it. */
        landedSplatRadiusMetres: orderedRange(Positive),
      }),
    ),
  }),
  ...GraphicsOptionsSchema.entries,
});
