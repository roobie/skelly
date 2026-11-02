import { check, ltValue, maxValue, pipe, strictObject } from 'valibot';
import { Fraction, Id, NonNegative, Positive, PositiveSimSeconds, SimRate } from './primitives.ts';

export const LoweredStanceSchema = strictObject({
  hearingRangeScale: Fraction,
  sightRangeScale: Fraction,
});

const PlayerStanceTuningSchema = strictObject({
  speedMetresPerSimSecond: SimRate,
  eyeDropMetres: Positive,
  bodyHeightMetres: Positive,
});

import { capabilityField } from './capability.ts';

export const PlayerSchema = strictObject({
  id: Id,
  capability: capabilityField('player'),
  halfWidth: Positive,
  height: Positive,
  eye: Positive,
  walk: SimRate,
  jog: SimRate,
  sprint: SimRate,
  jump: SimRate,
  /** Downward acceleration shared by every falling body and effect. */
  gravityMetresPerSimSecondSquared: Positive,
  reach: Positive,
  debugBlockTool: strictObject({
    reachMetres: Positive,
    stepDurabilityFraction: pipe(Positive, ltValue(1)),
  }),
  stepHeight: Positive,
  movement: strictObject({ sidewaysSpeedScale: Fraction, backwardSpeedScale: Fraction }),
  lean: strictObject({
    offsetMetres: NonNegative,
    rollDegrees: pipe(NonNegative, maxValue(45)),
    enterSimSeconds: PositiveSimSeconds,
    returnSimSeconds: PositiveSimSeconds,
    movementSpeedScale: Fraction,
    wallMarginMetres: Positive,
  }),
  crouch: PlayerStanceTuningSchema,
  prone: PlayerStanceTuningSchema,
  load: pipe(
    strictObject({ light: NonNegative, heavy: Positive, slowest: Fraction, handlingScale: Fraction }),
    check(({ light, heavy }) => heavy > light, 'heavy load must exceed light load'),
  ),
  aim: strictObject({
    moveYawPerSpeed: NonNegative,
    lookSensitivityRadiansPerPixel: Positive,
    freeLook: strictObject({
      yawLimitRadians: pipe(Positive, maxValue(Math.PI)),
      pitchLimitRadians: pipe(Positive, maxValue(Math.PI / 2)),
      returnRadiansPerRealSecond: Positive,
    }),
    lookLagPerRadian: NonNegative,
    lookSettleSimSeconds: PositiveSimSeconds,
    recoilRecoverySimSeconds: PositiveSimSeconds,
    maxOffsetRadians: pipe(Positive, maxValue(Math.PI / 2)),
  }),
});
