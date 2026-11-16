local skillCurve = import 'tools/jsonnet/lib/skill-curve.libsonnet';
// Practice closes the gap from a gun's skill-zero handling to the shared expert handling.
local shotFeeds(role) = {
  [effect]: { [role]: { expert: 0, halfLifeLevels: 4 } }
  for effect in ['variance', 'recoilKickScale', 'recoilRecoveryScale']
};
{
  combatPolicy: [{
    id: 'deadvox',
    capability: 'player',
    aim: {
      moveYawPerSpeed: 0.0045,
      lookLagPerRadian: 0.035,
      lookSettleSimSeconds: 0.22,
      recoilRecoverySimSeconds: 0.34,
      maxOffsetRadians: 0.12,
    },
    firearms: {
      local firearms = self,
      longGunSteadinessRole: 'longGunSteadiness',
      raiseSimSeconds: 0.7,
      adsAcquisitionMaximumSimSeconds: 0.55,
      readyMovementMinimum: 0.45,
      loweredPitchRadians: 0.3,
      skillZeroHandling: {
        singleShot: { variance: 20, recoilKickScale: 6, recoilRecoveryScale: 0.5 },
        automaticFollowup: { variance: 40, recoilKickScale: 12, recoilRecoveryScale: 0.25 },
      },
      expertHandling: { variance: 0.05, recoilKickScale: 0.59, recoilRecoveryScale: 1.41 },
      wobbleLimitRadians: 0.14,
      wobbleVerticalToHorizontalRatio: 0.225,
      wobbleLuneArchPower: 2,
      wobbleLunePhaseOffsetRadians: 0.08,
      wobbleNoiseReversionRatePerSimSecond: 2.4,
      wobbleNoiseSigmaRadiansPerSqrtSecond: 0.002,
      wobbleNoiseSmoothingSimSeconds: 0.12,
      wobbleStanceDriftScale: { standing: 1, crouching: 0.8, prone: 0.6 },
      breathHold: {
        staminaPerSimSecond: 12,
        recoverySimSeconds: 3,
        recoverySwayScale: 2.5,
        steadyingMinimum: 0.5,
        painWeakeningPerRatio: 0.5,
      },
      local breathFeeds(role) = { [role]: skillCurve.between(firearms.breathHold.steadyingMinimum, 0.77, 5) },
      skills: {
        raise: { firearmsCombat: skillCurve.between(firearms.raiseSimSeconds, 0.42, 5) },
        readyMovement: { firearmsCombat: skillCurve.between(firearms.readyMovementMinimum, 0.68, 5) },
        reload: { firearmsCombat: { expert: 0.35, halfLifeLevels: 5 } },
        rack: { firearmsCombat: { expert: 0.35, halfLifeLevels: 3 } },
        attachment: { firearmsCombat: { expert: 0.1, halfLifeLevels: 1.1 } },
        breathSteadying: breathFeeds('firearmsCombat'),
        singleShot: shotFeeds('firearmsCombat'),
        automaticFollowup: shotFeeds('firearmsCombat'),
      },
      // A long gun's sway and breath answer to its own steadiness skill; recoil stays with Firearms Combat.
      longGunSkills: {
        breathSteadying: breathFeeds(firearms.longGunSteadinessRole),
        singleShot: { variance: shotFeeds(firearms.longGunSteadinessRole).variance },
        automaticFollowup: {
          variance: shotFeeds(firearms.longGunSteadinessRole).variance,
        },
      },
    },
    melee: {
      local melee = self,
      blockChanceMinimum: 0.05,
      mitigationMinimum: 0.3,
      staminaPerAbsorbedPoint: 2,
      skills: {
        blockChance: { meleeCombat: skillCurve.between(melee.blockChanceMinimum, 0.37, 4) },
        mitigation: { meleeCombat: skillCurve.between(melee.mitigationMinimum, 0.72, 3) },
        staminaPerAbsorbedPoint: { meleeCombat: { expert: 0.5, halfLifeLevels: 3 } },
      },
      joltPerAbsorbedPoint: 0.08,
      joltRealSeconds: 0.08,
      deflectRiseMetres: 0.14,
      deflectRiseFloor: 0.6,
      deflectRealSeconds: 0.35,
    },
  }],
}
