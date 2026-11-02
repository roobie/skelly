import {
  array,
  check,
  maxValue,
  minValue,
  nonEmpty,
  number,
  optional,
  picklist,
  pipe,
  rawCheck,
  record,
  strictObject,
  boolean as vBoolean,
} from 'valibot';
import { BODY_REGIONS, type BodyRegion, DAMAGE_KINDS, type DamageKind, TOUCHES, type Touch } from '../body.ts';
import { WEAR_SLOTS } from './items.ts';
import {
  Fraction,
  GamePerHour,
  Id,
  Name,
  NonNegative,
  NonNegativeSimRate,
  Positive,
  PositiveGameHours,
  PositiveGameMinutes,
  PositiveRealSeconds,
  PositiveSimSeconds,
  SimRate,
} from './primitives.ts';

/** One value for every damage kind, so no kind is ever left out. */
const perDamageKind = <S extends typeof Fraction | typeof NonNegative>(value: S) =>
  strictObject(Object.fromEntries(DAMAGE_KINDS.map((kind) => [kind, value])) as Record<DamageKind, S>);

const WearSlotSchema = picklist(WEAR_SLOTS);

const CoveringSlots = pipe(
  array(WearSlotSchema),
  check((slots) => new Set(slots).size === slots.length, 'covering slots must be unique'),
);

/** One bleeding tier; the list runs mildest first (`DESIGN.md`, "Bleeding"). */
const BleedingTierSchema = strictObject({
  id: Id,
  /** How the HUD, inventory and item actions name a wound bleeding at this tier. */
  label: Name,
  /** Shown with the warning style and sign. */
  warn: vBoolean(),
  /** The character's line when their worst bleeding worsens to this tier; omitted tiers pass unspoken. */
  notice: optional(Name),
  /** Blood lost per Sim second at the top of this tier's band. */
  bloodLossPerSimSecond: SimRate,
  /** Sim seconds a wound takes to close through this tier's band by itself while the body recovers. */
  closeSimSeconds: PositiveSimSeconds,
  /** Treatment quality it takes to close this tier's band. */
  treatmentEffort: Positive,
  /** Least hit damage that can open this tier. */
  minDamage: NonNegative,
  /** Per-region chance multipliers; omitted regions use 1, and 0 excludes that region. */
  regionFactor: optional(record(picklist(BODY_REGIONS), NonNegative)),
  /** This tier's share of the wound roll per point of accumulated damage. */
  chancePerDamage: perDamageKind(NonNegative),
  /** Drips per second relative to the base rate, and droplet size relative to the base size. */
  drip: strictObject({ rate: Positive, size: Positive }),
  /** Background pain while a wound bleeds at this tier. */
  pain: NonNegative,
});

/** One pain tier, its start a share of the knockout threshold; the list runs mildest first (`DESIGN.md`, "Pain"). */
const PainTierSchema = strictObject({
  id: Id,
  /** Where the tier starts, as a share of the knockout threshold. The first tier's start is where pain's effects begin. */
  from: Positive,
  /** The character's line when felt pain worsens into this tier; omitted tiers pass unspoken. */
  notice: optional(Name),
  /** How much colour one pulse of the seen cue drains, at its peak. */
  desaturation: Fraction,
  /** Real seconds between the seen cue's pulses. */
  pulseIntervalRealSeconds: PositiveRealSeconds,
});

/** A pain effect: the multiplier grows by `perShare` for each share of the threshold above the first tier, up to `1 + max`. */
const PainEffectSchema = strictObject({ perShare: NonNegative, max: NonNegative });

const PainTuningSchema = strictObject({
  /** Felt pain that knocks the player out; tiers and effects are shares of it. Pain itself has no upper bound. */
  knockoutAt: Positive,
  /** Acute pain per point of hit damage, by the hit's damage kind. */
  perDamage: perDamageKind(NonNegative),
  /** Multiplies a hit's acute pain and a region's background pain from its damage. */
  regionWeight: strictObject(
    Object.fromEntries(BODY_REGIONS.map((region) => [region, NonNegative])) as Record<
      (typeof BODY_REGIONS)[number],
      typeof NonNegative
    >,
  ),
  /** Background pain per point of a region's damage. */
  perRegionDamage: NonNegative,
  /** Background pain from a wound at each infection stage. */
  infection: strictObject({ early: NonNegative, advanced: NonNegative }),
  /** Acute pain fades by this much per Sim second… */
  acuteFadePerSimSecond: NonNegativeSimRate,
  /** …plus this share of itself per Sim second, so it fades faster when high. */
  acuteFadeSharePerSimSecond: NonNegativeSimRate,
  aimSway: PainEffectSchema,
  /** Slows reloading, racking, magazine work and swings; never treatment or crafting. */
  handlingSlowdown: PainEffectSchema,
  tiers: pipe(
    array(PainTierSchema),
    nonEmpty('needs at least one tier'),
    check((tiers) => new Set(tiers.map(({ id }) => id)).size === tiers.length, 'pain tier ids must be unique'),
    check(
      (tiers) => tiers.every((tier, index) => index === 0 || tier.from > tiers[index - 1]!.from),
      'each pain tier must start above the one before it',
    ),
  ),
});

const NeedPercent = pipe(number(), minValue(0, 'must be 0 to 100'), maxValue(100, 'must be 0 to 100'));

const CriticalNeedSchema = pipe(
  strictObject({
    need: picklist(['calories', 'hydration', 'fatigue']),
    /** Critical while the need is under this. */
    below: optional(NeedPercent),
    /** Critical while the need is over this; fatigue has no upper cap. */
    above: optional(NonNegative),
    /** What the player is told when the need becomes critical. */
    message: Name,
  }),
  check((rule) => (rule.below === undefined) !== (rule.above === undefined), 'needs exactly one of below and above'),
);

/** Survival needs and stamina. Vitals run 0 to 100; fatigue is sleep debt (`packages/deadvox/src/core/needs.ts`). */
const NeedsTuningSchema = strictObject({
  /** The needs and stamina a new character starts with. */
  spawn: strictObject({ calories: NeedPercent, hydration: NeedPercent, fatigue: NonNegative, stamina: NeedPercent }),
  /** Calories and hydration lost per Game hour. */
  drainPerGameHour: strictObject({ calories: GamePerHour, hydration: GamePerHour }),
  /** Health lost per Game hour while calories or hydration sit at 0; both add up. */
  healthLossPerGameHour: strictObject({ starving: GamePerHour, dehydrated: GamePerHour }),
  stamina: strictObject({
    /** Spent per Sim second of sprinting. */
    sprintPerSimSecond: SimRate,
    /** Recovered per Sim second when not sprinting. */
    recoverPerSimSecond: SimRate,
    /** Recovery is scaled by this while any critical need holds. */
    wornRecoveryFactor: Fraction,
    /** Below this stamina you're winded and can't start sprinting. */
    windedBelow: NeedPercent,
  }),
  /** 100% calories is this many kilocalories, and 100% hydration this many millilitres. */
  full: strictObject({ kcal: Positive, ml: Positive }),
  /** Crossing one of these interrupts a long action and says its message. */
  critical: array(CriticalNeedSchema),
  /** Health falling under this from above interrupts a long action and says its message. */
  badlyHurt: strictObject({ below: Positive, message: Name }),
});

import { capabilityField } from './capability.ts';

export const BodyTuningSchema = pipe(
  strictObject({
    id: Id,
    capability: capabilityField('body'),
    /** Game hours after a bleeding wound before an at-risk infection becomes early. */
    infectionOnsetGameHours: PositiveGameHours,
    /** Game hours the early infection stage remains treatable with antiseptic. */
    antisepticWindowGameHours: PositiveGameHours,
    infectionChance: Fraction,
    /** Sim seconds that the player remains unconscious. */
    knockoutSimSeconds: PositiveSimSeconds,
    /** Why the player can't act while unconscious. */
    knockoutRefusal: Name,
    /** Sim seconds to wait after stamina reaches zero before recovery begins. */
    staminaRegenDelaySimSeconds: PositiveSimSeconds,
    /** Player eye height in metres while unconscious and prone. */
    proneEyeHeightMetres: Positive,
    /** Where on the upright body a grenade fragment strikes, as fractions of its height: above `head` hits the head, above `torso` the torso, else a leg. */
    fragmentRegionHeights: pipe(
      strictObject({ head: Fraction, torso: Fraction }),
      check(({ head, torso }) => torso < head, 'torso must start below head'),
    ),
    /** Shock damage per point of health damage, by the hit's damage kind. */
    shockPerDamage: perDamageKind(NonNegative),
    /** How much harder a hit of each damage kind wears the outermost worn item on the struck region; 1 is the item's own rate. */
    outerWearMultiplier: perDamageKind(NonNegative),
    /** The wear slots covering each region, outermost first; a hit meets the first one worn (`DESIGN.md`, "Worn coverage"). */
    coverage: strictObject(
      Object.fromEntries(BODY_REGIONS.map((region) => [region, CoveringSlots])) as Record<
        BodyRegion,
        typeof CoveringSlots
      >,
    ),
    /** The slot each touch meets first, where that slot covers the touched region. */
    touchFirst: strictObject(
      Object.fromEntries(TOUCHES.map((touch) => [touch, WearSlotSchema])) as Record<Touch, typeof WearSlotSchema>,
    ),
    exposureRefusal: Name,
    linger: record(
      picklist(DAMAGE_KINDS),
      strictObject({
        simSeconds: PositiveSimSeconds,
      }),
    ),
    landing: strictObject({
      safeSpeedMetresPerSimSecond: SimRate,
      damagePerSquaredSpeed: Positive,
      damageSpread: pipe(
        strictObject({ min: Positive, max: Positive }),
        check(({ min, max }) => min <= max, 'min must not be more than max'),
      ),
      kind: picklist(DAMAGE_KINDS),
      cause: Name,
      regions: pipe(
        array(strictObject({ region: picklist(BODY_REGIONS), weight: Positive })),
        nonEmpty('needs at least one landing region'),
        check(
          (regions) => new Set(regions.map(({ region }) => region)).size === regions.length,
          'landing regions must be unique',
        ),
      ),
    }),
    /** Sim seconds required to apply wound treatment. */
    treatmentSimSeconds: PositiveSimSeconds,
    /** The range each treatment application's strength is multiplied by, rolled per application. */
    treatmentSpread: pipe(
      strictObject({ min: NonNegative, max: Positive }),
      check(({ min, max }) => min <= max, 'min must not be more than max'),
    ),
    /** Shock restored when the player wakes, on a 0–100 scale. */
    wakeShock: pipe(
      Positive,
      check((value) => value < 100, 'must be below 100'),
    ),
    /** The bleeding tiers, and when and with what line bleeding refuses time compression. */
    bleeding: strictObject({
      refusal: Name,
      /** Total blood loss per Sim second at or above which bleeding refuses compression; 0 means any bleeding. */
      blockCompressionAtLossPerSimSecond: NonNegativeSimRate,
      tiers: pipe(
        array(BleedingTierSchema),
        nonEmpty('needs at least one tier'),
        check((tiers) => new Set(tiers.map(({ id }) => id)).size === tiers.length, 'bleeding tier ids must be unique'),
        check(
          (tiers) =>
            tiers.every(
              (tier, index) => index === 0 || tier.bloodLossPerSimSecond > tiers[index - 1]!.bloodLossPerSimSecond,
            ),
          'each bleeding tier must lose blood faster than the one before it',
        ),
      ),
    }),
    pain: PainTuningSchema,
    /** Blood recovered per Sim second when no wound bleeds. */
    bloodRecoveryPerSimSecond: SimRate,
    /** Shock recovered per Sim second outside a knockout. */
    shockRecoveryPerSimSecond: SimRate,
    /** Health lost per Sim second while infection is advanced. */
    advancedInfectionHealthLossPerSimSecond: SimRate,
    needs: NeedsTuningSchema,
    /** The stamina heartbeat, a presentation cue only (`DESIGN.md`, "Audio"). */
    heartbeat: strictObject({
      /** One beat each: the slow recording, and the shorter one used once a beat is too quick for the slow one. */
      sounds: strictObject({ slow: Id, fast: Id }),
      /** Silent above this stamina; rate and loudness rise linearly from here to exhaustion. */
      startStamina: NeedPercent,
      startHz: Positive,
      exhaustedHz: Positive,
      startGain: Fraction,
      exhaustedGain: Fraction,
    }),
    /** Fatigue is sleep debt with no upper cap; this much accrues per Game hour awake. */
    fatigueRisePerGameHour: GamePerHour,
    /** Fatigue cleared per Game hour resting, scaled by the furniture's rest quality. */
    restFatigueRecoveryPerGameHour: GamePerHour,
    /** Fatigue cleared per Game hour asleep at rest quality 1: a normal sleep. */
    sleepFatigueRecoveryPerGameHour: GamePerHour,
    /** Sleep onset gets shorter as fatigue rises, reaching its minimum at the authored threshold. */
    sleepOnset: pipe(
      strictObject({
        minGameMinutes: PositiveGameMinutes,
        maxGameMinutes: PositiveGameMinutes,
        fatigueAtMinimum: Positive,
      }),
      check(
        ({ minGameMinutes, maxGameMinutes }) => minGameMinutes <= maxGameMinutes,
        'minimum must not exceed maximum',
      ),
    ),
    /** The share of a normal sleep's recovery at rest quality 0; it rises linearly to all of it at 1. */
    roughSleepShare: Fraction,
    /** Health, and each region's damage, recovered per Game hour while needs are at their floor or above and fatigue under its ceiling. */
    healthRecoveryPerGameHour: GamePerHour,
    /** The lowest calories and hydration at which health and regions still recover. */
    healthRecoveryNeedsFloor: strictObject({ calories: NonNegative, hydration: NonNegative }),
    /** The highest fatigue at which health and regions still recover, awake and asleep; a state left out has none. */
    healthRecoveryFatigueCeiling: strictObject({ awake: optional(NonNegative), asleep: optional(NonNegative) }),
    /** Multiplies health, regional and blood recovery while asleep. */
    sleepRecoveryFactor: Positive,
    /** Aim sway added per point of torso damage. */
    aimSwayPerDamage: Positive,
    /** Swing slowdown added per point of arm damage. */
    swingSlowdownPerDamage: Positive,
    /** Movement slowdown added per point of leg damage. */
    movementSlowdownPerDamage: Positive,
    /** Lowest movement-speed multiplier caused by leg damage. */
    minimumMovementSpeed: pipe(
      Positive,
      check((value) => value <= 1, 'must not exceed 1'),
    ),
  }),
  // A touch slot that covers no region would never be met, so the touch would silently fall back to coverage.
  rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) {
      return;
    }
    const covering = new Set(Object.values(dataset.value.coverage).flat());
    for (const touch of TOUCHES) {
      if (!covering.has(dataset.value.touchFirst[touch])) {
        addIssue({ message: `touchFirst.${touch} must name a slot that covers some region` });
      }
    }
  }),
);
