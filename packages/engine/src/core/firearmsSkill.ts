import type { BreathHoldTuning } from './aim.ts';
import { canonicalJson } from './canonicalJson.ts';
import { type EffectActor, modified, type SkillFeeds } from './modifiers.ts';
import type { PlayerStance } from './playerStance.ts';

export const FIREARMS_SKILL_ZERO_RANGES = {
  variance: { min: 0.1, max: 100, step: 0.1 },
  recoilKickScale: { min: 0.1, max: 100, step: 0.1 },
  recoilRecoveryScale: { min: 0.01, max: 10, step: 0.01 },
} as const;

export interface FirearmsSkillZeroEffect {
  readonly variance: number;
  readonly recoilKickScale: number;
  readonly recoilRecoveryScale: number;
}

export interface FirearmsSkillZeroHandling {
  readonly singleShot: FirearmsSkillZeroEffect;
  readonly automaticFollowup: FirearmsSkillZeroEffect;
}

export type FirearmsSkillShotKind = keyof FirearmsSkillZeroHandling;

export const skillZeroHandlingForFirearm = (
  firearm: FirearmsSkillZeroHandling | undefined,
  shared: FirearmsSkillZeroHandling,
): FirearmsSkillZeroHandling => firearm ?? shared;

export const sameFirearmsSkillZeroHandling = (
  left: FirearmsSkillZeroHandling,
  right: FirearmsSkillZeroHandling,
): boolean => canonicalJson(left) === canonicalJson(right);

export interface FirearmsShotSkillFeeds {
  readonly variance?: SkillFeeds | undefined;
  readonly recoilKickScale?: SkillFeeds | undefined;
  readonly recoilRecoveryScale?: SkillFeeds | undefined;
}

/** The skills feeding each firearm handling effect from its skill-zero value. */
export interface FirearmsSkillFeeds {
  readonly raise?: SkillFeeds | undefined;
  readonly readyMovement?: SkillFeeds | undefined;
  readonly reload?: SkillFeeds | undefined;
  readonly rack?: SkillFeeds | undefined;
  readonly attachment?: SkillFeeds | undefined;
  readonly breathSteadying?: SkillFeeds | undefined;
  readonly singleShot?: FirearmsShotSkillFeeds | undefined;
  readonly automaticFollowup?: FirearmsShotSkillFeeds | undefined;
}

export interface FirearmsCombatTuning {
  readonly longGunSteadinessRole?: string | undefined;
  readonly raiseSimSeconds: number;
  /** The ADS-only speed floor, as the longest allowed aim-down-sights acquisition; bounds ADS, not raise. */
  readonly adsAcquisitionMaximumSimSeconds: number;
  readonly readyMovementMinimum: number;
  readonly loweredPitchRadians: number;
  readonly skillZeroHandling: FirearmsSkillZeroHandling;
  /** Sway and recoil handling every firearm reaches with practice, whatever its skill-zero handling. */
  readonly expertHandling: FirearmsSkillZeroEffect;
  readonly wobbleLimitRadians: number;
  readonly wobbleVerticalToHorizontalRatio: number;
  readonly wobbleLuneArchPower: number;
  readonly wobbleLunePhaseOffsetRadians: number;
  readonly wobbleNoiseReversionRatePerSimSecond: number;
  readonly wobbleNoiseSigmaRadiansPerSqrtSecond: number;
  readonly wobbleNoiseSmoothingSimSeconds: number;
  readonly wobbleStanceDriftScale: Readonly<Record<PlayerStance, number>>;
  readonly caseEjection: {
    readonly speedMetresPerSimSecond: number;
    readonly flightSimSeconds: number;
    readonly landingLiftMetres: number;
  };
  readonly shotTraceRangeBlocks: number;
  readonly breathHold: BreathHoldTuning;
  readonly skills?: FirearmsSkillFeeds | undefined;
  readonly longGunSkills?: FirearmsSkillFeeds | undefined;
}

export interface FirearmsSkillEffects {
  readonly variance: number;
  readonly recoilKickScale: number;
  readonly recoilRecoveryRate: number;
  readonly reloadFactor: number;
  readonly rackFactor: number;
  /** Share of drift a held breath removes before pain weakens it. */
  readonly breathSteadying: number;
}

export interface FirearmStanceEffects {
  readonly raiseDurationSimSeconds: number;
  readonly adsAcquisitionDurationSimSeconds: number;
  readonly readyMovementFactor: number;
}

const SHOT_KINDS = ['singleShot', 'automaticFollowup'] as const satisfies readonly FirearmsSkillShotKind[];

/**
 * A long gun answers to its own steadiness skill for sway and breath, so its feeds replace the matching shared ones
 * effect by effect; every effect it leaves out keeps the shared feeds.
 */
export const longGunTuning = (tuning: FirearmsCombatTuning): FirearmsCombatTuning => {
  const shared = tuning.skills ?? {};
  const longGun = tuning.longGunSkills ?? {};
  const shots = Object.fromEntries(SHOT_KINDS.map((kind) => [kind, { ...shared[kind], ...longGun[kind] }])) as Pick<
    FirearmsSkillFeeds,
    FirearmsSkillShotKind
  >;
  return { ...tuning, skills: { ...shared, ...longGun, ...shots } };
};

/** Skill-zero handling endpoints are per firearm; the skills feeding them close each gap to shared expert handling. */
export const firearmsSkillEffects = (
  skills: EffectActor,
  tuning: FirearmsCombatTuning,
  shotKind: FirearmsSkillShotKind = 'singleShot',
): FirearmsSkillEffects => {
  const zero = tuning.skillZeroHandling[shotKind];
  const expert = tuning.expertHandling;
  const feeds = tuning.skills;
  const shot = feeds?.[shotKind];
  const handling = (effect: keyof FirearmsSkillZeroEffect): number =>
    expert[effect] +
    (zero[effect] - expert[effect]) * modified('firearm.noviceHandlingShare', 1, skills, { skills: shot?.[effect] });
  return {
    variance: handling('variance'),
    recoilKickScale: handling('recoilKickScale'),
    recoilRecoveryRate: handling('recoilRecoveryScale'),
    reloadFactor: modified('firearm.reloadFactor', 1, skills, { skills: feeds?.reload }),
    rackFactor: modified('firearm.rackFactor', 1, skills, { skills: feeds?.rack }),
    breathSteadying: modified('aim.breathSteadying', tuning.breathHold.steadyingMinimum, skills, {
      skills: feeds?.breathSteadying,
    }),
  };
};

/** The ADS-only speed floor: acquisition reads the raise duration, clamped to a content maximum. */
export const adsAcquisitionDuration = (raiseDurationSimSeconds: number, tuning: FirearmsCombatTuning): number =>
  Math.min(raiseDurationSimSeconds, tuning.adsAcquisitionMaximumSimSeconds);

export const firearmStanceEffects = (skills: EffectActor, tuning: FirearmsCombatTuning): FirearmStanceEffects => {
  const raiseDurationSimSeconds = modified('firearm.raiseSimSeconds', tuning.raiseSimSeconds, skills, {
    skills: tuning.skills?.raise,
  });
  return {
    raiseDurationSimSeconds,
    adsAcquisitionDurationSimSeconds: adsAcquisitionDuration(raiseDurationSimSeconds, tuning),
    readyMovementFactor: modified('firearm.readyMovementFactor', tuning.readyMovementMinimum, skills, {
      skills: tuning.skills?.readyMovement,
    }),
  };
};
