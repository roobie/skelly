import { check, minValue, pipe, strictObject } from 'valibot';
import { capabilityField } from './capability.ts';
import { LoweredStanceSchema } from './player.ts';
import { Count, Fraction, Id, NonNegative, Positive, PositiveSimSeconds } from './primitives.ts';

export const SenseSchema = strictObject({
  id: Id,
  capability: capabilityField('senses'),
  /** Chest height as a fraction of the eye height, so a stance that lowers the eyes lowers the chest. */
  chestEyeFraction: Fraction,
  /** Real seconds the crouch key is held before it lies down instead of toggling crouch. */
  crouchProneHoldRealSeconds: Positive,
  crouch: LoweredStanceSchema,
  /** Below crouch: the player lies down and crawls. */
  prone: LoweredStanceSchema,
  wall: strictObject({
    hearingRangeScale: Fraction,
    gain: Fraction,
    cutoffHz: Positive,
    clearGain: Fraction,
    clearCutoffHz: Positive,
  }),
  /** Footfall spacing per moving gait and the fall that lands hard; cadence and landing noise follow from these. */
  footsteps: strictObject({
    walkingStepMetres: Positive,
    joggingStepMetres: Positive,
    sprintingStepMetres: Positive,
    hardLandingMetres: Positive,
  }),
  /** How long a player vocal noise stays audible to shamblers after it is emitted. */
  vocalNoiseLifetimeSimSeconds: PositiveSimSeconds,
  /**
   * The shambler voice-pitch law (`DESIGN.md`, "Audio"), as multiples of the old law's pitch √(reference height ÷ body
   * height) at the smallest pooled body. One law covers the whole figure pool, so it lives here, not on a zombie type.
   */
  shamblerVoice: strictObject({
    oldLawReferenceHeightMetres: Positive,
    smallestAnchorMultiplier: Positive,
    clampMultiplier: pipe(
      strictObject({ min: Positive, max: Positive }),
      check(({ min, max }) => min <= max, 'min must not exceed max'),
    ),
  }),
  light: strictObject({
    playerDaySightScale: Fraction,
    /** Reduce how far shamblers investigate non-player light sources. */
    lureRangeScale: Fraction,
    throwMaxDistanceMetres: Positive,
    throwChargeSimSeconds: PositiveSimSeconds,
    throwMinimumHoldSimSeconds: PositiveSimSeconds,
    throwStanceDropHoldRealSeconds: Positive,
    wornLightToggleHoldRealSeconds: Positive,
    renderedBeamLimit: pipe(Count, minValue(2)),
    /** Powered fixtures drawn as lights at once, nearest the camera first; the rest stay dark. */
    renderedFixtureLimit: pipe(Count, minValue(1)),
    throwArmSpeedMetresPerRealSecond: Positive,
    throwArmEnergyJoules: Positive,
    /**
     * A light set down: the height a zombie's sight line aims at, and the drawn point light's lift when its model
     * has no flame to shine from, high enough that the near-field falloff reaches nearby surfaces.
     */
    groundLight: strictObject({ senseHeightMetres: Positive, renderLiftMetres: Positive }),
    /**
     * Light at a point, in the renderer's light units (`DESIGN.md`, "Light"): the distance decay and near-field
     * offset every punctual light is drawn and measured with, and the least light a page or sign needs to be read.
     */
    illumination: strictObject({ pointDecay: NonNegative, nearFieldMetres: NonNegative, readingThreshold: Positive }),
  }),
});
