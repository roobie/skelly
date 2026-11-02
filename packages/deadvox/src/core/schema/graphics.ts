import { check, finite, integer, maxValue, minValue, number, pipe, strictObject } from 'valibot';
import { GraphicsOptionsSchema } from '../graphics.ts';
import { Degrees } from './layouts.ts';
import { Count, Fraction, Id, Positive } from './primitives.ts';

export const GraphicsTuningSchema = strictObject({
  id: Id,
  nearPlaneMetres: Positive,
  playerViewFovDegrees: pipe(number(), finite(), minValue(1), maxValue(179)),
  opticLens: strictObject({
    rimSoftness: pipe(Positive, maxValue(0.5)),
    reticleAntiAliasWidth: pipe(Positive, maxValue(2)),
  }),
  readyRadiusM: pipe(number(), finite(), minValue(0)),
  /** How far past the view radius terrain stays loaded and drawn, so a column on the edge does not churn. */
  streamHysteresisM: pipe(Positive, finite()),
  /**
   * The camera's far plane as a multiple of where the fog ends. Fog goes by horizontal distance; a
   * larger scale lets more of what is far above or below the camera stay unfogged, and culls less
   * (`src/render/distanceFog.ts`).
   */
  fogFarPlaneScale: pipe(number(), finite(), minValue(1)),
  itemPictureCacheCapacity: pipe(number(), integer(), minValue(1)),
  /** The inventory picture camera's margin around a model's fitted bounds. */
  itemPicture: strictObject({ framing: Positive }),
  modelLoadConcurrency: pipe(number(), integer(), minValue(1)),
  skyJobsInFlight: pipe(number(), integer(), minValue(2)),
  skyPreloadRings: Count,
  /** Diffuse sky visibility drawn where a sky field has no answer yet (`DESIGN.md`, "Light"). */
  unbuiltSkyCap: Fraction,
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
  }),
  ...GraphicsOptionsSchema.entries,
});
