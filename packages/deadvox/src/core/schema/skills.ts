import { array, check, maxValue, minValue, number, optional, pipe, record, strictObject } from 'valibot';
import { CORE_CONTENT_IDS } from '../contentIds.ts';
import {
  Count,
  FirearmsSkillZeroHandlingSchema,
  Fraction,
  Id,
  Name,
  NonNegative,
  NonNegativeSimRate,
  Positive,
  PositiveSimSeconds,
  SimSeconds,
  SkillLevel,
} from './primitives.ts';

// ---- skills and recipes ----

const SkillCurveSchema = strictObject({
  saturationFloor: Fraction,
  saturationHalfLifeLevels: Positive,
});

export const SkillProgressionSchema = strictObject({
  id: Id,
  practicePerLevel: Positive,
});

export const SkillSchema = pipe(
  strictObject({
    id: Id,
    name: Name,
    detail: optional(Name),
    curve: optional(SkillCurveSchema),
    steadiness: optional(
      strictObject({
        wobbleSkillTenVariance: pipe(Positive, maxValue(100)),
        steadyingMinimum: Fraction,
        steadyingSkillRange: Fraction,
        steadyingSkillHalfLifeLevels: Positive,
      }),
    ),
    /** Recipes a new character knows from the start. */
    startingRecipes: optional(array(Id)),
    training: optional(
      strictObject({
        craftingTierOffset: optional(Count),
        activities: optional(
          record(
            Id,
            pipe(
              strictObject({
                practice: optional(NonNegative),
                practicePerSimSecond: optional(NonNegativeSimRate),
                tier: optional(SkillLevel),
              }),
              check(
                (activity) => (activity.practice === undefined) !== (activity.practicePerSimSecond === undefined),
                'needs exactly one of "practice" or "practicePerSimSecond"',
              ),
            ),
          ),
        ),
      }),
    ),
    inventory: optional(
      strictObject({
        handlingFactorFloor: Fraction,
        handlingFactorHalfLifeLevels: Positive,
        handlingPerCellSimSeconds: NonNegative,
        handlingGroundSimSeconds: NonNegative,
        handlingWearSimSeconds: NonNegative,
      }),
    ),
    combat: optional(
      strictObject({
        firearms: optional(
          strictObject({
            longGunSteadinessSkill: Id,
            raiseMinimumSimSeconds: PositiveSimSeconds,
            raiseRangeSimSeconds: SimSeconds,
            raiseHalfLifeLevels: Positive,
            /** The ADS-only speed floor, as a maximum aim-down-sights acquisition duration. */
            adsAcquisitionMaximumSimSeconds: PositiveSimSeconds,
            readyMovementMinimum: Fraction,
            readyMovementRange: Fraction,
            readyMovementHalfLifeLevels: Positive,
            loweredPitchRadians: pipe(NonNegative, maxValue(Math.PI / 2)),
            skillZeroHandling: FirearmsSkillZeroHandlingSchema,
            wobbleSkillTenVariance: pipe(Positive, maxValue(100)),
            wobbleLimitRadians: pipe(Positive, maxValue(Math.PI / 2)),
            wobbleVerticalToHorizontalRatio: pipe(Positive, maxValue(1)),
            wobbleLuneArchPower: pipe(Positive, maxValue(4)),
            wobbleLunePhaseOffsetRadians: pipe(NonNegative, maxValue(0.45)),
            wobbleNoiseReversionRatePerSimSecond: pipe(Positive, maxValue(30)),
            wobbleNoiseSigmaRadiansPerSqrtSecond: pipe(NonNegative, maxValue(1)),
            wobbleNoiseSmoothingSimSeconds: pipe(Positive, maxValue(1)),
            wobbleStanceDriftScale: strictObject({
              standing: NonNegative,
              crouching: NonNegative,
              prone: NonNegative,
            }),
            reloadFactorFloor: Fraction,
            reloadFactorHalfLifeLevels: Positive,
            rackFactorFloor: Fraction,
            rackFactorHalfLifeLevels: Positive,
            attachmentFactorFloor: Fraction,
            attachmentFactorHalfLifeLevels: Positive,
            caseEjection: strictObject({
              speedMetresPerSimSecond: Positive,
              flightSimSeconds: PositiveSimSeconds,
              /** A landed case rests this far above its settled voxel surface, so it never z-fights the floor. */
              landingLiftMetres: NonNegative,
            }),
            shotTraceRangeBlocks: Positive,
            /** `DESIGN.md`, "Holding breath". */
            breathHold: strictObject({
              staminaPerSimSecond: NonNegativeSimRate,
              recoverySimSeconds: SimSeconds,
              recoverySwayScale: pipe(number(), minValue(1, 'must be at least 1'), maxValue(10)),
              steadyingMinimum: Fraction,
              steadyingSkillRange: Fraction,
              steadyingSkillHalfLifeLevels: Positive,
              painWeakeningPerRatio: NonNegative,
            }),
            /** The owning skill's curve is attached by the registry, not authored here. */
            curve: optional(SkillCurveSchema),
          }),
        ),
        melee: optional(
          strictObject({
            blockChanceMinimum: Fraction,
            blockChanceRange: Fraction,
            blockChanceHalfLifeLevels: Positive,
            mitigationMinimum: Fraction,
            mitigationRange: Fraction,
            mitigationHalfLifeLevels: Positive,
            staminaPerAbsorbedPoint: Positive,
            staminaCostFloor: Fraction,
            staminaCostHalfLifeLevels: Positive,
            joltPerAbsorbedPoint: NonNegative,
            joltRealSeconds: NonNegative,
            deflectRiseMetres: NonNegative,
            deflectRiseFloor: Fraction,
            deflectRealSeconds: NonNegative,
          }),
        ),
      }),
    ),
  }),
  check(({ training, id, combat, inventory, steadiness, curve }) => {
    const activity = (activityId: string, field: 'practice' | 'practicePerSimSecond') =>
      training?.activities?.[activityId]?.[field] !== undefined;
    const complete =
      (id !== CORE_CONTENT_IDS.crafting || training?.craftingTierOffset !== undefined) &&
      (id !== CORE_CONTENT_IDS.firearmsCombat ||
        (combat?.firearms !== undefined &&
          activity('readying', 'practicePerSimSecond') &&
          activity('handling', 'practice') &&
          activity('shot', 'practice') &&
          activity('hit', 'practice') &&
          activity('attachment', 'practice'))) &&
      (id !== CORE_CONTENT_IDS.meleeCombat ||
        (combat?.melee !== undefined && activity('block', 'practice') && activity('hit', 'practice'))) &&
      (id !== CORE_CONTENT_IDS.inventoryManagement || (inventory !== undefined && activity('handling', 'practice')));
    const firearm = combat?.firearms;
    const melee = combat?.melee;
    return (
      complete &&
      (!steadiness ||
        (curve !== undefined &&
          steadiness.steadyingMinimum + steadiness.steadyingSkillRange <= 1 &&
          activity('acquisition', 'practice') &&
          activity('ads', 'practicePerSimSecond') &&
          activity('shot', 'practice') &&
          activity('hit', 'practice'))) &&
      (!firearm ||
        (firearm.readyMovementMinimum + firearm.readyMovementRange <= 1 &&
          firearm.breathHold.steadyingMinimum + firearm.breathHold.steadyingSkillRange <= 1)) &&
      (!melee ||
        (melee.blockChanceMinimum + melee.blockChanceRange <= 1 &&
          melee.mitigationMinimum + melee.mitigationRange <= 1))
    );
  }, 'missing required skill tuning or effect range exceeds one'),
  check(
    ({ id, training }) =>
      id !== CORE_CONTENT_IDS.inventoryManagement || training?.activities?.handling?.tier === undefined,
    'inventory-management handling activity must be untiered',
  ),
);
