import {
  array,
  check,
  finite,
  type InferOutput,
  integer,
  maxValue,
  minLength,
  minValue,
  nonEmpty,
  nullable,
  number,
  optional,
  picklist,
  pipe,
  record,
  strictObject,
  string,
  transform,
  boolean as vBoolean,
} from 'valibot';
import { type ActorModel, BODY_PLANS, type BodyPlan, FIGURE_VARIANTS } from '../actorModels.ts';
import { BODY_REGIONS } from '../body.ts';
import { HUMANOID_REGION_NAMES } from '../humanoidRegionNames.ts';
import { MELEE_MOTIONS } from '../meleeMotion.ts';
import { simRate } from '../time.ts';
import { capabilityClaimsField } from './capability.ts';
import {
  Color,
  Count,
  Fraction,
  Id,
  Name,
  NonNegative,
  Positive,
  PositiveRealSeconds,
  PositiveSimSeconds,
  QualityLevel,
  SimAcceleration,
  SimDurationRange,
  SimRate,
} from './primitives.ts';

// ---- zombies ----

export type HumanoidHitRegion = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

export type ActorHitRegion = HumanoidHitRegion | 'core.trunk' | `member.${number}.${HumanoidHitRegion}`;

export type ActorRegions = Record<string, number>;

const FUSED_MASS_REGION_KEYS = ['core.trunk', ...HUMANOID_REGION_NAMES.map((region) => `member.${region}`)];

const BODY_PLAN = picklist(Object.keys(BODY_PLANS) as BodyPlan[]);

const ACTOR_ABILITIES = ['acidSpit'] as const;

const DamageResistanceSchema = record(
  Id,
  strictObject(
    Object.fromEntries(BODY_REGIONS.map((region) => [region, Fraction])) as Record<
      (typeof BODY_REGIONS)[number],
      typeof Fraction
    >,
  ),
);

/** What a landed hit can be, picked by weight as it lands (`DESIGN.md`, "Bleeding"). */
const DamageMoveSchema = strictObject({
  id: Id,
  weight: Positive,
  damage: Positive,
  damageKind: Id,
  hitRegions: pipe(
    array(strictObject({ region: picklist(BODY_REGIONS), weight: Positive })),
    nonEmpty('needs at least one hit region'),
  ),
});

const MeleeMovesSchema = pipe(
  array(strictObject({ ...DamageMoveSchema.entries, motion: picklist(MELEE_MOTIONS) })),
  nonEmpty('needs at least one move'),
);

/** Tunables of the `acidSpit` ability (`docs/acid-zombie.md`, "Ability, not type"). */
const AcidSpitSchema = pipe(
  strictObject({
    rangeBand: strictObject({ nearMetres: Positive, farMetres: Positive }),
    windupSimSeconds: PositiveSimSeconds,
    cooldownSimSeconds: PositiveSimSeconds,
    /** Fraction of the cooldown a spit cancelled by a hit costs. */
    cancelPenaltyFraction: Fraction,
    spreadDegrees: pipe(NonNegative, maxValue(90, 'must be at most 90')),
    globMetresPerSimSecond: SimRate,
    presentation: strictObject({
      color: Color,
      radiusMetres: Positive,
      splashRadiusMetres: Positive,
      splashRealSeconds: PositiveRealSeconds,
    }),
    moves: pipe(array(DamageMoveSchema), nonEmpty('needs at least one move')),
    puddle: strictObject({
      damageKind: Id,
      lifetimeSimSeconds: PositiveSimSeconds,
      radiusMetres: Positive,
      damagePerSimSecond: Positive,
    }),
  }),
  check(({ rangeBand }) => rangeBand.nearMetres < rangeBand.farMetres, 'range band near edge must be inside far edge'),
  check((spit) => spit.windupSimSeconds < spit.cooldownSimSeconds, 'windup must be less than cooldown'),
  check(({ moves }) => new Set(moves.map(({ id }) => id)).size === moves.length, 'zombie move ids must be unique'),
);

/** How the acid model's body shows its acid (`docs/acid-zombie.md`, "Model"). Presentation only. */
const AcidBodySchema = pipe(
  strictObject({
    color: Color,
    /** Multiplier on the sac's emission, at rest and at the end of a spit wind-up. */
    charge: strictObject({ idle: NonNegative, charged: NonNegative }),
    /** The point light the sac lends its surroundings while the actor is among the nearest glowing ones. */
    light: strictObject({ intensity: Positive, radiusMetres: Positive }),
    drips: strictObject({ perRealSecond: Positive, sizeMetres: Positive }),
    /** The burst of droplets that replaces the sac on death. */
    deathSplash: strictObject({
      droplets: pipe(number(), integer(), minValue(1, 'must be at least 1')),
      speedMetresPerRealSecond: Positive,
      slowestSpeedFraction: Fraction,
      sizeMetres: Positive,
    }),
  }),
  check(({ charge }) => charge.idle <= charge.charged, 'the sac must not dim during the wind-up'),
);

const AgentSchema = strictObject({
  /** Idle voice cadence and its local-crowd thinning curve. */
  idleSound: strictObject({
    intervalSimSeconds: SimDurationRange,
    density: strictObject({ radiusMetres: Positive, penaltyPerNeighbour: NonNegative }),
  }),
  /** Metres by day. */
  sight: Positive,
  /** Metres by night. */
  nightSight: Positive,
  /** Multiplies the range at which a light is spotted; omitted is 1. */
  lightSightScale: optional(Positive),
  /** Sim seconds before a heard or seen stimulus is forgotten. */
  stimulusMemorySimSeconds: Positive,
  /** Half-angle of the sight cone, in degrees. */
  sightCone: pipe(Positive, maxValue(180, 'must be at most 180')),
  /** A horde of this type stands on a golden-angle spiral whose radius grows from `innerMetres` by `stepMetres` × √member. */
  hordeSpacing: strictObject({ innerMetres: NonNegative, stepMetres: Positive }),
  wander: strictObject({
    obstacleWanderChance: Fraction,
    obstacleWanderDistanceMetres: Positive,
    /**
     * How far a zombie held up at a piece looks for a way past it (`DESIGN.md`, "Senses and AI"). It bashes the piece
     * only when no way past gains ground toward its target within this reach.
     */
    wayAroundReachMetres: Positive,
    /**
     * The share of the ground a clear heading would gain toward its target that a slanted heading must still gain
     * within that reach to count as a way past.
     */
    wayAroundMinGainFraction: Fraction,
    idleSimSeconds: SimDurationRange,
    strollSimSeconds: SimDurationRange,
    leashMetres: Positive,
    lookIntervalSimSeconds: SimDurationRange,
    bodyLookArcDegrees: pipe(Positive, maxValue(360, 'must be at most 360')),
    headLookArcDegrees: pipe(Positive, maxValue(360, 'must be at most 360')),
  }),
  /** 1 is normal hearing. */
  hearing: NonNegative,
  hearingRange: strictObject({ walk: Positive, jog: Positive, sprint: Positive }),
  hearingModel: pipe(
    strictObject({
      farMultiplier: pipe(Positive, minValue(1, 'must be at least 1')),
      bearingErrorRadians: pipe(Positive, maxValue(Math.PI, 'must be at most pi')),
      investigationDistanceMetres: Positive,
      loudNoiseRadiusMetres: Positive,
      hesitationSimSeconds: SimDurationRange,
      refusalSuspicionSimSeconds: PositiveSimSeconds,
      refusalLean: Fraction,
      alertCooldownSimSeconds: NonNegative,
      chainRadiusMetres: NonNegative,
      chainChance: Fraction,
      searchSimSeconds: SimDurationRange,
      searchRadiusMetres: Positive,
      searchStrollSimSeconds: SimDurationRange,
    }),
    check(
      (model) => model.hesitationSimSeconds.min <= model.hesitationSimSeconds.max,
      'minimum hesitation must not exceed maximum',
    ),
    check(
      (model) => model.searchSimSeconds.min <= model.searchSimSeconds.max,
      'minimum search duration must not exceed maximum',
    ),
    check(
      (model) => model.searchStrollSimSeconds.min <= model.searchStrollSimSeconds.max,
      'minimum search stroll must not exceed maximum',
    ),
  ),
  speed: strictObject({
    /** The farthest one background-tier tick moves it toward its target. */
    backgroundStepMetres: Positive,
  }),
});

const GazeLimitSchema = strictObject({ yawDeg: NonNegative, pitchDeg: NonNegative });

/** How far and how fast a rig's neck and head turn to track a target (src/render/lookAt.ts). Presentation only. */
const LookAtProfileSchema = strictObject({
  /** The bone that turns as the head; omitted is `head`. */
  headBone: optional(pipe(string(), nonEmpty('must not be empty'))),
  neck: GazeLimitSchema,
  head: GazeLimitSchema,
  turnRateDegPerSecond: Positive,
});

export type LookAtProfile = InferOutput<typeof LookAtProfileSchema>;

export const ActorSchema = strictObject({
  id: Id,
  capability: capabilityClaimsField('actors'),
  name: Name,
  /** How the death screen names this type as the cause, article included, because only the phrase knows its article. */
  cause: Name,
  model: BODY_PLAN,
  figure: optional(picklist(Object.keys(FIGURE_VARIANTS) as ActorModel[])),
  /** Uniform scale for this model's realized body, in addition to the mobgen template's dimensions. */
  bodyScale: optional(Positive),
  /** Mobgen figure seeds an individual of this type is drawn from. Every model but fused-mass, whose figure seed is fixed, defines them. */
  figureSeeds: optional(
    pipe(
      array(pipe(number(), integer('must be a whole number'), minValue(1, 'must be 1 or more'))),
      minLength(1, 'needs at least one figure seed'),
      check((seeds) => new Set(seeds).size === seeds.length, 'figure seeds must be distinct'),
    ),
  ),
  /** Overrides body-height pitch scaling for this type's voice cues. */
  soundPitchMultiplier: optional(Positive),
  /** Health keyed by hit-region id; humanoid bodies use six anatomy keys, fused-mass bodies use manifest ids. */
  regions: record(pipe(string(), nonEmpty('must not be empty')), Positive),
  /** Explicitly null when this region leaves no item. */
  severedItems: record(pipe(string(), nonEmpty('must not be empty')), nullable(Id)),
  /** Relative chance that an ordinary settlement spawn chooses this type; 1 is the common baseline. */
  spawnWeight: pipe(Positive, maxValue(1, 'must be at most 1')),
  /** Excludes this kind from ordinary settlement selection while keeping authored/debug spawns available. */
  authoredOnly: optional(vBoolean()),
  /** Sound ids are content references, so a new voice needs content only; the registry checks each exists. */
  sounds: strictObject({ idle: Id, alert: Id, attack: Id, hurt: Id }),
  damageResistance: optional(DamageResistanceSchema),
  speed: strictObject({
    wanderMetresPerSimSecond: SimRate,
    chaseMetresPerSimSecond: SimRate,
    crawlMetresPerSimSecond: SimRate,
  }),
  /** Metres advanced by one half-cycle of the leg gait. */
  stepLength: Positive,
  /** Surface-step sound family for grounded travel; omitted types do not emit footfalls. */
  footstepSound: optional(Id),
  /** Whether this type tries to jump low obstacles when grounded. */
  canJumpObstacles: vBoolean(),
  jumpMetresPerSimSecond: pipe(Positive, finite(), transform(simRate)),
  /**
   * Force of a bash against a closed door it is pressed against, in the N·s of a melee weapon's `impulse`, so a
   * player's strike and a bash meet the same door gate. It bashes once per attack cooldown; 0 never damages a door.
   */
  strength: NonNegative,
  /**
   * How it moves relative to its facing: `forward` walks only along its facing, so it turns before it heads
   * somewhere new; `omnidirectional` moves straight toward its goal whatever its facing, which still turns to
   * the goal. Omitted is `forward`.
   */
  locomotion: optional(picklist(['forward', 'omnidirectional'])),
  /** Height above its feet that it sees from. */
  eyeHeightMetres: Positive,
  /** Height above its feet that it hears at; a sound's occlusion line runs level from the source at this height. */
  earHeightMetres: Positive,
  chaseMotion: optional(
    pipe(
      strictObject({
        swayDegrees: pipe(NonNegative, maxValue(90, 'must be at most 90')),
        swayIntervalSimSeconds: SimDurationRange,
        speedMultiplier: strictObject({ min: Positive, max: Positive }),
        lurchSimSeconds: PositiveSimSeconds,
        stumbleChancePerSimSecond: pipe(NonNegative, maxValue(1, 'must be at most 1'), transform(simRate)),
        stumbleDurationSimSeconds: SimDurationRange,
        stumbleEaseSimSeconds: PositiveSimSeconds,
        stumbleSpeedFraction: Fraction,
        stumbleDecelerationMetresPerSimSecondSquared: SimAcceleration,
      }),
      check(
        (motion) => motion.swayIntervalSimSeconds.min <= motion.swayIntervalSimSeconds.max,
        'minimum sway interval must not exceed maximum',
      ),
      check(
        (motion) => motion.speedMultiplier.min <= motion.speedMultiplier.max,
        'minimum speed multiplier must not exceed maximum',
      ),
      check(
        (motion) => motion.stumbleDurationSimSeconds.min <= motion.stumbleDurationSimSeconds.max,
        'minimum stumble duration must not exceed maximum',
      ),
      check(
        (motion) => motion.stumbleDurationSimSeconds.min >= 2 * motion.stumbleEaseSimSeconds,
        'stumble duration must allow easing in and out',
      ),
    ),
  ),
  attack: optional(
    pipe(
      strictObject({
        reach: Positive,
        cooldownSimSeconds: PositiveSimSeconds,
        windupSimSeconds: PositiveSimSeconds,
        /** A grab lands only while the player's feet are less than this far above or below its own. */
        grabBandMetres: optional(Positive),
        moves: MeleeMovesSchema,
      }),
      check((attack) => attack.windupSimSeconds < attack.cooldownSimSeconds, 'windup must be less than cooldown'),
      check(({ moves }) => new Set(moves.map(({ id }) => id)).size === moves.length, 'zombie move ids must be unique'),
    ),
  ),
  /** A melee hit with at least this impulse holds the zombie still and spoils its attack (docs/stagger.md);
   * absent means it never staggers. */
  stagger: optional(strictObject({ impulseThreshold: Positive, durationSimSeconds: PositiveSimSeconds })),
  /** Flesh a damaging hit knocks off the body, leaving a hole (src/core/fusedMassCarving.ts): the struck voxel
   * and every voxel within the radius of it. Fused-mass bodies only. */
  carving: optional(
    strictObject({
      radiusMetresPerDamage: pipe(NonNegative, maxValue(0.01, 'must be at most 0.01')),
      maxRadiusMetres: pipe(NonNegative, maxValue(1, 'must be at most 1')),
      /** The hole's inner faces. */
      interiorColor: Color,
    }),
  ),
  /** Per-hit chance of severing a random not-yet-severed arm part (src/core/actorSystem.ts's swing); a
   * killing blow additionally rolls headOnKillChance to sever the head too. Both independent 0..1 chances,
   * not a shared budget. */
  dismember: strictObject({ chance: Fraction, headOnKillChance: Fraction }),
  /** Multiplies the impulse of the hit that severs a part, so the flying piece leaves faster (src/render/mobActors.ts's
   * actorSevered). Only that flight reads it; the hit's stagger and damage keep the weapon's own impulse. */
  severedImpulseScale: NonNegative,
  /** The blood a cut throws as its part goes: how many droplets, how fast they leave the wound and how far they
   * fan from the strike, how long they live, and how much of the part's launch velocity each one inherits. */
  severedSpurt: strictObject({
    droplets: Count,
    speedMetresPerRealSecond: NonNegative,
    spreadFraction: NonNegative,
    lifetimeRealSeconds: NonNegative,
    partVelocityShare: Fraction,
  }),
  /** The timed actions that clear a downed body (src/game/downedBody.ts). Finishing it off needs no tool;
   * dismembering it needs a carried tool with the quality and leaves its arms and head behind. */
  downed: optional(
    strictObject({
      finishOff: strictObject({ simSeconds: PositiveSimSeconds }),
      dismember: strictObject({ simSeconds: PositiveSimSeconds, quality: Id, level: QualityLevel }),
    }),
  ),
  abilities: array(picklist(ACTOR_ABILITIES)),
  /** Tunables of the `acidSpit` ability; present exactly when the type lists that ability. */
  acidSpit: optional(AcidSpitSchema),
  /** The acid model's glow, drips and death splash; present exactly when the model is `acid`. */
  acidBody: optional(AcidBodySchema),
  /** What's in its pockets. */
  loot: optional(Id),
  motion: strictObject({
    bodyTurnDegreesPerSimSecond: SimRate,
    headTurnDegreesPerSimSecond: SimRate,
    movementAccelerationMetresPerSimSecondSquared: SimAcceleration,
  }),
  agent: optional(AgentSchema),
});

export const actorAcidSpitMatchesAbility = (actor: InferOutput<typeof ActorSchema>): boolean =>
  actor.abilities.includes('acidSpit') === (actor.acidSpit !== undefined);

export const actorRegionsMatchModel = (actor: InferOutput<typeof ActorSchema>): boolean => {
  const expected = actor.model === 'fused-mass' ? FUSED_MASS_REGION_KEYS : HUMANOID_REGION_NAMES;
  const keys = Object.keys(actor.regions);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(actor.regions, key));
};
