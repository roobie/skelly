import { maxValue, minValue, number, picklist, pipe, strictObject, boolean as vBoolean } from 'valibot';
import { MAX_EXPOSURE, MIN_EXPOSURE, TONE_KEYS } from '../mood.ts';
/** The game's default look (core/mood.ts `LookDefaults`); URL parameters and the debug panel override it. */
import { capabilityField } from './capability.ts';
import { Fraction, Id, NonNegative, Positive, PositiveRealSeconds, PositiveSimSeconds } from './primitives.ts';

export const LookDefaultsSchema = strictObject({
  id: Id,
  capability: capabilityField('look'),
  tone: picklist(TONE_KEYS),
  exposure: pipe(
    number(),
    minValue(MIN_EXPOSURE, `must be ${MIN_EXPOSURE} to ${MAX_EXPOSURE}`),
    maxValue(MAX_EXPOSURE, `must be ${MIN_EXPOSURE} to ${MAX_EXPOSURE}`),
  ),
  srgb: vBoolean(),
  patterns: vBoolean(),
  vao: vBoolean(),
  /** The mood pass's master switch: off, bloom, film and grade render nothing. */
  post: vBoolean(),
  bloom: vBoolean(),
  film: vBoolean(),
  grade: Fraction,
  heightFog: strictObject({ baseMetres: NonNegative, scaleMetres: Positive }),
  painCue: strictObject({
    pulseRiseRealSeconds: PositiveRealSeconds,
    pulseFallRealSeconds: PositiveRealSeconds,
    settleStretch: NonNegative,
  }),
  damageFeedback: strictObject({
    vignetteMax: Fraction,
    damageForFullStrength: Positive,
    vignetteFadeRealSeconds: PositiveRealSeconds,
    rollPeakDegrees: Positive,
    rollRiseRealSeconds: PositiveRealSeconds,
    rollSettleRealSeconds: PositiveRealSeconds,
  }),
  mobActors: strictObject({
    corpseLieSimSeconds: PositiveSimSeconds,
    corpseSinkSimSeconds: PositiveSimSeconds,
    corpseSinkDepthMetres: Positive,
    launchSpinRadiansPerSimSecond: Positive,
    hearingGazeJitter: strictObject({
      yawDegrees: NonNegative,
      pitchDegrees: NonNegative,
      cyclesPerSimSecond: NonNegative,
    }),
  }),
});
