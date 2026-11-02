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
import { BODY_REGIONS, DAMAGE_KINDS } from '../body.ts';
import { MELEE_MOTIONS } from '../meleeMotion.ts';
import { simRate } from '../time.ts';
import { ZOMBIE_MODELS } from '../zombieModels.ts';
import { ZOMBIE_REGION_NAMES } from '../zombieRegionNames.ts';
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

export type ShamblerHitRegion = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

export type ZombieRegion = ShamblerHitRegion;

export type ZombieHitRegion = ZombieRegion | 'core.trunk' | `member.${number}.${ShamblerHitRegion}`;

export type ZombieRegions = Record<string, number>;

const AMALGAM_REGION_KEYS = ['core.trunk', ...ZOMBIE_REGION_NAMES.map((region) => `member.${region}`)];

const ZOMBIE_MODEL = picklist(ZOMBIE_MODELS);

const ZOMBIE_ABILITIES = ['acidSpit'] as const;

const MeleeDamageResistanceSchema = strictObject({
  head: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  torso: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  leftArm: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  rightArm: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  leftLeg: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  rightLeg: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
});

/** What a landed hit can be, picked by weight as it lands (`DESIGN.md`, "Bleeding"). */
const DamageMoveSchema = strictObject({
  id: Id,
  weight: Positive,
  damage: Positive,
  damageKind: picklist(DAMAGE_KINDS),
  hitRegions: pipe(
    array(strictObject({ region: picklist(BODY_REGIONS), weight: Positive })),
    nonEmpty('needs at least one hit region'),
  ),
});

const ZombieMovesSchema = pipe(
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

export const ZombieSchema = strictObject({
  id: Id,
  name: Name,
  /** How the death screen names this type as the cause, article included, because only the phrase knows its article. */
  cause: Name,
  /** Mobgen template selected for this type's silhouette and posed hit regions. */
  model: ZOMBIE_MODEL,
  /** Uniform scale for this model's realized body, in addition to the mobgen template's dimensions. */
  bodyScale: optional(Positive),
  /** Mobgen figure seeds an individual of this type is drawn from. Every model but the amalgam, whose figure seed is fixed, defines them. */
  figureSeeds: optional(
    pipe(
      array(pipe(number(), integer('must be a whole number'), minValue(1, 'must be 1 or more'))),
      minLength(1, 'needs at least one figure seed'),
      check((seeds) => new Set(seeds).size === seeds.length, 'figure seeds must be distinct'),
    ),
  ),
  /** Overrides body-height pitch scaling for this type's voice cues. */
  soundPitchMultiplier: optional(Positive),
  /** Health keyed by hit-region id; ordinary shamblers use six anatomy keys, amalgams use manifest ids. */
  regions: record(pipe(string(), nonEmpty('must not be empty')), Positive),
  /** Explicitly null when this region leaves no item. */
  severedItems: record(pipe(string(), nonEmpty('must not be empty')), nullable(Id)),
  /** Relative chance that an ordinary settlement spawn chooses this type; 1 is the common baseline. */
  spawnWeight: pipe(Positive, maxValue(1, 'must be at most 1')),
  /** Excludes this kind from ordinary settlement selection while keeping authored/debug spawns available. */
  authoredOnly: optional(vBoolean()),
  /** Sound ids are content references, so a new voice needs content only; the registry checks each exists. */
  sounds: strictObject({ idle: Id, alert: Id, attack: Id, hurt: Id }),
  /** Idle voice cadence and its local-crowd thinning curve. */
  idleSound: strictObject({
    intervalSimSeconds: SimDurationRange,
    density: strictObject({ radiusMetres: Positive, penaltyPerNeighbour: NonNegative }),
  }),
  /** Fraction of each melee damage type resisted by each region; omitted entries are neutral. */
  meleeDamageResistance: optional(MeleeDamageResistanceSchema),
  /** Fraction of acid damage resisted, whatever the region; 1 is immune and omitted is neutral. */
  acidResistance: optional(Fraction),
  speed: strictObject({
    wanderMetresPerSimSecond: SimRate,
    chaseMetresPerSimSecond: SimRate,
    crawlMetresPerSimSecond: SimRate,
    /** The farthest one background-tier tick moves it toward its target. */
    backgroundStepMetres: Positive,
  }),
  /** Metres advanced by one half-cycle of the leg gait. */
  stepLength: Positive,
  /** Surface-step sound family for grounded travel; omitted types do not emit footfalls. */
  footstepSound: optional(picklist(['shambler'])),
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
  /** Height above its feet that it sees from. */
  eyeHeightMetres: Positive,
  /** Height above its feet that it hears at; a sound's occlusion line runs level from the source at this height. */
  earHeightMetres: Positive,
  /** A horde of this type stands on a golden-angle spiral whose radius grows from `innerMetres` by `stepMetres` × √member. */
  hordeSpacing: strictObject({ innerMetres: NonNegative, stepMetres: Positive }),
  /** Idle/stroll timing, home leash and eased look controls. */
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
    bodyTurnDegreesPerSimSecond: SimRate,
    headTurnDegreesPerSimSecond: SimRate,
    movementAccelerationMetresPerSimSecondSquared: SimAcceleration,
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
  chaseMotion: pipe(
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
  attack: pipe(
    strictObject({
      reach: Positive,
      cooldownSimSeconds: PositiveSimSeconds,
      windupSimSeconds: PositiveSimSeconds,
      /** A grab lands only while the player's feet are less than this far above or below its own. */
      grabBandMetres: optional(Positive),
      moves: ZombieMovesSchema,
    }),
    check((attack) => attack.windupSimSeconds < attack.cooldownSimSeconds, 'windup must be less than cooldown'),
    check(({ moves }) => new Set(moves.map(({ id }) => id)).size === moves.length, 'zombie move ids must be unique'),
  ),
  /** A melee hit with at least this impulse holds the zombie still and spoils its attack (docs/stagger.md);
   * absent means it never staggers. */
  stagger: optional(strictObject({ impulseThreshold: Positive, durationSimSeconds: PositiveSimSeconds })),
  /** Flesh a damaging hit knocks off the body, leaving a hole (src/core/amalgamCarving.ts): the struck voxel
   * and every voxel within the radius of it. Amalgams only. */
  carving: optional(
    strictObject({
      radiusMetresPerDamage: pipe(NonNegative, maxValue(0.01, 'must be at most 0.01')),
      maxRadiusMetres: pipe(NonNegative, maxValue(1, 'must be at most 1')),
      /** The hole's inner faces. */
      interiorColor: Color,
    }),
  ),
  /** Per-hit chance of severing a random not-yet-severed arm part (src/core/zombies.ts's swing); a
   * killing blow additionally rolls headOnKillChance to sever the head too. Both independent 0..1 chances,
   * not a shared budget. */
  dismember: strictObject({ chance: Fraction, headOnKillChance: Fraction }),
  /** Multiplies the impulse of the hit that severs a part, so the flying piece leaves faster (src/render/mobActors.ts's
   * zombieSevered). Only that flight reads it; the hit's stagger and damage keep the weapon's own impulse. */
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
  abilities: array(picklist(ZOMBIE_ABILITIES)),
  /** Tunables of the `acidSpit` ability; present exactly when the type lists that ability. */
  acidSpit: optional(AcidSpitSchema),
  /** The acid model's glow, drips and death splash; present exactly when the model is `acid`. */
  acidBody: optional(AcidBodySchema),
  /** What's in its pockets. */
  loot: optional(Id),
});

export const zombieAcidSpitMatchesAbility = (zombie: InferOutput<typeof ZombieSchema>): boolean =>
  zombie.abilities.includes('acidSpit') === (zombie.acidSpit !== undefined);

export const zombieRegionsMatchModel = (zombie: InferOutput<typeof ZombieSchema>): boolean => {
  const expected = zombie.model === 'amalgam' ? AMALGAM_REGION_KEYS : ZOMBIE_REGION_NAMES;
  const keys = Object.keys(zombie.regions);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(zombie.regions, key));
};
