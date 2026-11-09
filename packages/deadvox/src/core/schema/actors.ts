import {
  array,
  check,
  finite,
  type InferOutput,
  integer,
  literal,
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
  tuple,
  union,
  variant,
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
  turnRateDegPerRealSecond: Positive,
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
  /**
   * A fused mass's collision box about its ground origin, in metres: content admission reads it because the browser
   * loads no figure file before admission, and the Node figure check holds it to the built body.
   */
  spawnEnvelope: optional(
    strictObject({ halfWidthMetres: Positive, halfDepthMetres: Positive, heightMetres: Positive }),
  ),
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
      /** The flesh a hole shows inside (spike: the `holes=` debug looks only). */
      interiorColor: optional(Color),
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

// ---- baked actor data: a body and its clips per actor type and seed, as skelly-assets bakes them ----

const UNIT_TOLERANCE = 1e-6;

const Finite = pipe(number(), finite('must be finite'));
const FinitePositive = pipe(Positive, finite('must be finite'));
const PositiveInteger = pipe(number(), integer('must be a whole number'), minValue(1, 'must be 1 or more'));
const BoneName = pipe(string(), nonEmpty('must not be empty'));
const Vec3Schema = tuple([Finite, Finite, Finite]);
const RangeSchema = pipe(
  tuple([Finite, Finite]),
  check(([min, max]) => min <= max, 'range min must not exceed max'),
);

const nearUnit = (length: number): boolean => Math.abs(length - 1) <= UNIT_TOLERANCE;
const vecLength = (v: readonly number[]): number => Math.hypot(...v);
const vecDot = (a: readonly number[], b: readonly number[]): number => a.reduce((sum, x, i) => sum + x * b[i]!, 0);
const pointKey = (p: readonly number[]): string => p.join(',');
const hasBone = (body: { readonly bones: readonly { readonly id: string }[] }, id: string): boolean =>
  body.bones.some((bone) => bone.id === id);

/** Hit boxes are posed from their bone's voxels, so a boxed bone without them cannot be hit-tested. */
const boxBonesWithoutVoxels = (body: {
  readonly bones: readonly { readonly id: string; readonly voxels?: unknown }[];
  readonly boxes?: Readonly<Record<string, readonly { readonly bone: string }[]>> | undefined;
}): string[] => {
  const voxelled = new Set(body.bones.filter(({ voxels }) => voxels !== undefined).map(({ id }) => id));
  const boxed = Object.values(body.boxes ?? {}).flatMap((rows) => rows.map(({ bone }) => bone));
  return [...new Set(boxed)].filter((bone) => !voxelled.has(bone));
};

const ActorBoneSchema = pipe(
  strictObject({
    id: BoneName,
    parent: nullable(BoneName),
    head: Vec3Schema,
    tail: Vec3Schema,
    frame: optional(
      pipe(
        strictObject({ x: Vec3Schema, y: Vec3Schema, z: Vec3Schema }),
        check(
          ({ x, y, z }) =>
            [x, y, z].every((axis) => nearUnit(vecLength(axis))) &&
            [vecDot(x, y), vecDot(y, z), vecDot(z, x)].every((d) => Math.abs(d) <= UNIT_TOLERANCE),
          'joint frame axes must be unit length and pairwise orthogonal',
        ),
      ),
    ),
    limits: optional(strictObject({ flex: RangeSchema, abduct: RangeSchema, twist: RangeSchema })),
    disposition: optional(picklist(['fixed', 'sever', 'burst'])),
    /** World-space rest centres of the voxels the bone owns. */
    voxels: optional(pipe(array(Vec3Schema), nonEmpty('must not be empty'))),
    /** The subset of `voxels` that ground fitting reads. */
    hull: optional(pipe(array(Vec3Schema), nonEmpty('must not be empty'))),
  }),
  check(
    ({ voxels, hull }) => (voxels === undefined) === (hull === undefined),
    'hull must be present exactly with voxels',
  ),
  check(({ voxels, hull }) => {
    const owned = new Set((voxels ?? []).map(pointKey));
    return (hull ?? []).every((centre) => owned.has(pointKey(centre)));
  }, 'every hull centre must be one of the bone voxels'),
);

const BoneVoxelBoxSchema = strictObject({ bone: BoneName, center: Vec3Schema, halfSize: Vec3Schema });

const HumanoidAnimationSchema = strictObject({
  attackPeakAtSimSeconds: FinitePositive,
  attackDurationSimSeconds: FinitePositive,
  hitDurationSimSeconds: FinitePositive,
});

const AcidAnimationSchema = strictObject({
  ...HumanoidAnimationSchema.entries,
  deathDurationRealSeconds: FinitePositive,
});

const FusedMassAnimationSchema = strictObject({
  flinch: pipe(
    strictObject({ peakAtSimSeconds: FinitePositive, durationSimSeconds: FinitePositive, pitch: Finite, roll: Finite }),
    check(
      ({ peakAtSimSeconds, durationSimSeconds }) => peakAtSimSeconds <= durationSimSeconds,
      'flinch peak must be within its duration',
    ),
  ),
});

const FusedMassManifestSchema = strictObject({
  parts: array(
    strictObject({
      id: BoneName,
      rootBone: BoneName,
      boneIds: array(BoneName),
      severable: vBoolean(),
      regionIds: array(BoneName),
      massFraction: Fraction,
      capabilityIds: array(BoneName),
    }),
  ),
  regions: array(strictObject({ id: BoneName, partId: BoneName, boneIds: array(BoneName) })),
  headBoneIds: array(BoneName),
});

const FUSED_MASS_ONLY_KEYS = [
  'manifest',
  'bounds',
  'originOffset',
  'coreInteriorPoint',
  'restStrikeOrigin',
  'cells',
] as const;

/** One baked actor body: its bones and the geometry, mass and timing the runtime reads (see `packages/skelly-assets/tools/actorBody.mjs`, `actorBody`). */
export const ActorBodySchema = pipe(
  strictObject({
    type: string(),
    model: string(),
    seed: Finite,
    bodyPlan: string(),
    legCut: optional(
      pipe(
        Finite,
        check((cut) => cut > 0 && cut < 1, 'must be between 0 and 1, exclusive'),
      ),
    ),
    scale: FinitePositive,
    height: FinitePositive,
    voxelSize: FinitePositive,
    /** In GLB bone-index order, parents first. */
    bones: pipe(array(ActorBoneSchema), nonEmpty('needs at least one bone')),
    anchors: record(string(), strictObject({ bone: BoneName, position: Vec3Schema })),
    regions: optional(record(string(), array(BoneName))),
    boxes: optional(record(string(), array(BoneVoxelBoxSchema))),
    severableParts: optional(record(string(), array(BoneName))),
    burstBones: array(BoneName),
    extents: record(
      BoneName,
      pipe(
        strictObject({ min: Vec3Schema, max: Vec3Schema }),
        check(({ min, max }) => min.every((m, axis) => m <= max[axis]!), 'extent min must not exceed max'),
      ),
    ),
    groundContactBones: optional(array(BoneName)),
    bodyMassKg: FinitePositive,
    massFractions: optional(
      record(
        string(),
        pipe(
          Finite,
          check((fraction) => fraction > 0 && fraction <= 1, 'must be more than 0 and at most 1'),
        ),
      ),
    ),
    lookAt: optional(LookAtProfileSchema),
    animation: union([HumanoidAnimationSchema, AcidAnimationSchema, FusedMassAnimationSchema, strictObject({})]),
    manifest: optional(FusedMassManifestSchema),
    bounds: optional(strictObject({ min: Vec3Schema, max: Vec3Schema })),
    originOffset: optional(Vec3Schema),
    coreInteriorPoint: optional(Vec3Schema),
    restStrikeOrigin: optional(Vec3Schema),
    cells: optional(
      strictObject({
        size: FinitePositive,
        origin: Vec3Schema,
        dims: tuple([PositiveInteger, PositiveInteger, PositiveInteger]),
        filled: array(tuple([pipe(number(), integer('must be a whole number')), PositiveInteger])),
      }),
    ),
  }),
  check(({ bones }) => new Set(bones.map(({ id }) => id)).size === bones.length, 'bone ids must be unique'),
  check(
    ({ bones }) => bones[0]?.parent === null && bones.filter(({ parent }) => parent === null).length === 1,
    'the first bone must be the only root',
  ),
  check(
    ({ bones }) => bones.every(({ parent }, i) => parent === null || bones.slice(0, i).some(({ id }) => id === parent)),
    'every bone parent must name an earlier bone',
  ),
  check(
    (body) => Object.values(body.anchors).every(({ bone }) => hasBone(body, bone)),
    'every anchor must name a body bone',
  ),
  check(
    ({ regions, boxes, severableParts }) =>
      (regions === undefined) === (boxes === undefined) && (regions === undefined) === (severableParts === undefined),
    'regions, boxes and severableParts must be present together',
  ),
  check(
    (body) =>
      [
        ...Object.values(body.regions ?? {}).flat(),
        ...Object.values(body.boxes ?? {}).flatMap((rows) => rows.map(({ bone }) => bone)),
        ...Object.values(body.severableParts ?? {}).flat(),
      ].every((bone) => hasBone(body, bone)),
    'every region, box and severable part bone must be a body bone',
  ),
  check(
    (body) => boxBonesWithoutVoxels(body).length === 0,
    ({ input }) => `every box bone must carry voxels; missing on ${boxBonesWithoutVoxels(input).join(', ')}`,
  ),
  check((body) => body.burstBones.every((bone) => hasBone(body, bone)), 'every burst bone must be a body bone'),
  check((body) => Object.keys(body.extents).every((bone) => hasBone(body, bone)), 'every extent must key a body bone'),
  check(
    (body) => (body.groundContactBones !== undefined) === (body.bodyPlan === 'humanoid'),
    'groundContactBones must be present exactly on a humanoid body',
  ),
  check(
    (body) =>
      (body.groundContactBones ?? []).every((id) =>
        body.bones.some((bone) => bone.id === id && bone.voxels !== undefined),
      ),
    'every ground contact bone must be a body bone carrying voxels',
  ),
  check(
    (body) => body.lookAt?.headBone === undefined || hasBone(body, body.lookAt.headBone),
    'the look-at head bone must be a body bone',
  ),
  check(({ bodyPlan, animation }) => {
    switch (bodyPlan) {
      case 'humanoid':
        return 'attackPeakAtSimSeconds' in animation && !('deathDurationRealSeconds' in animation);
      case 'acid':
        return 'deathDurationRealSeconds' in animation;
      case 'fused-mass':
        return 'flinch' in animation;
      default:
        return Object.keys(animation).length === 0;
    }
  }, 'animation must have the fields of the body plan'),
  check(
    ({ animation }) =>
      !('attackPeakAtSimSeconds' in animation) ||
      animation.attackPeakAtSimSeconds <= animation.attackDurationSimSeconds,
    'attack peak must be within the attack duration',
  ),
  check(
    (body) => FUSED_MASS_ONLY_KEYS.every((key) => (body[key] !== undefined) === (body.bodyPlan === 'fused-mass')),
    'manifest, bounds, originOffset, coreInteriorPoint, restStrikeOrigin and cells must be present exactly on a fused-mass body',
  ),
  check(({ cells, bones }) => {
    if (!cells) {
      return true;
    }
    const count = cells.dims[0] * cells.dims[1] * cells.dims[2];
    return cells.filled.every(([index, owner]) => index >= 0 && index < count && owner <= bones.length);
  }, 'every filled cell must index the grid and name a bone by its 1-based index'),
);

export type ActorBody = InferOutput<typeof ActorBodySchema>;

const UnitQuatSchema = pipe(
  tuple([Finite, Finite, Finite, Finite]),
  check((q) => nearUnit(vecLength(q)), 'quaternion must be unit length'),
);

const PoseFrameSchema = strictObject({ root: Vec3Schema, rotations: record(BoneName, UnitQuatSchema) });

interface Timed {
  readonly durationSimSeconds?: number | undefined;
  readonly hitAtSimSeconds?: number | undefined;
  readonly peakAtSimSeconds?: number | undefined;
}

const timedWithin = (clip: Timed, key: 'hitAtSimSeconds' | 'peakAtSimSeconds'): boolean => {
  const time = clip[key];
  return time === undefined || clip.durationSimSeconds === undefined || time <= clip.durationSimSeconds;
};

/**
 * Absolute local rotations per frame. Loop cursors are normalised; finite cursors are seconds. A walk loop
 * states `strideMetres` and an idle loop `periodSimSeconds` (see `packages/deadvox/DESIGN.md`, "Clocks and units").
 */
export const PoseClipSchema = pipe(
  strictObject({
    kind: literal('pose'),
    loop: vBoolean(),
    frames: pipe(array(PoseFrameSchema), nonEmpty('needs at least one frame')),
    durationSimSeconds: optional(FinitePositive),
    periodSimSeconds: optional(FinitePositive),
    strideMetres: optional(FinitePositive),
    cycles: optional(PositiveInteger),
    idleBlendSpeed: optional(FinitePositive),
    hitAtSimSeconds: optional(FinitePositive),
  }),
  check((clip) => timedWithin(clip, 'hitAtSimSeconds'), 'hitAtSimSeconds must be within the duration'),
  check(
    (clip) => clip.periodSimSeconds === undefined || clip.strideMetres === undefined,
    'a loop states periodSimSeconds or strideMetres, not both',
  ),
);

/** One death fall: a finite pose clip that render samples on Real time, so its span names that clock. */
const DeathClipSchema = strictObject({
  kind: literal('pose'),
  loop: literal(false),
  frames: pipe(array(PoseFrameSchema), minLength(2, 'needs at least two frames')),
  durationRealSeconds: FinitePositive,
});

/**
 * Euler-degree angles composed onto a live base pose.
 * @public Planned per-clip schema API; its consumer lands with the actor cutover.
 */
export const OverlayClipSchema = pipe(
  strictObject({
    kind: literal('overlay'),
    durationSimSeconds: FinitePositive,
    hitAtSimSeconds: optional(FinitePositive),
    peakAtSimSeconds: optional(FinitePositive),
    sideScalesZ: vBoolean(),
    walkBlendBones: array(BoneName),
    frames: pipe(
      array(
        strictObject({
          angles: record(BoneName, Vec3Schema),
          walkBlendWeight: Fraction,
          dropMetres: Finite,
        }),
      ),
      nonEmpty('needs at least one frame'),
    ),
  }),
  check(
    ({ hitAtSimSeconds, peakAtSimSeconds }) => (hitAtSimSeconds === undefined) !== (peakAtSimSeconds === undefined),
    'needs exactly one of hitAtSimSeconds and peakAtSimSeconds',
  ),
  check((clip) => timedWithin(clip, 'hitAtSimSeconds'), 'hitAtSimSeconds must be within the duration'),
  check((clip) => timedWithin(clip, 'peakAtSimSeconds'), 'peakAtSimSeconds must be within the duration'),
);

/** Joint-angle deltas added to a live base pose inside each bone's limits. */
export const JointDeltaClipSchema = pipe(
  strictObject({
    kind: literal('jointDelta'),
    cursor: picklist(['time', 'progress', 'gaitPhase']),
    loop: optional(vBoolean()),
    speedWeight: vBoolean(),
    sideScalesZ: vBoolean(),
    footSoleHold: vBoolean(),
    cycles: optional(PositiveInteger),
    strideMetres: optional(FinitePositive),
    durationSimSeconds: optional(FinitePositive),
    hitAtSimSeconds: optional(FinitePositive),
    peakAtSimSeconds: optional(FinitePositive),
    frames: pipe(array(strictObject({ angles: record(BoneName, Vec3Schema) })), nonEmpty('needs at least one frame')),
  }),
  check((clip) => timedWithin(clip, 'hitAtSimSeconds'), 'hitAtSimSeconds must be within the duration'),
  check((clip) => timedWithin(clip, 'peakAtSimSeconds'), 'peakAtSimSeconds must be within the duration'),
  check(
    (clip) =>
      clip.cursor !== 'gaitPhase' ||
      (clip.loop === true && clip.cycles !== undefined && clip.strideMetres !== undefined),
    'a gaitPhase clip must loop and carry cycles and strideMetres',
  ),
);

const StanceIdleSchema = strictObject({
  base: PoseFrameSchema,
  motion: array(
    strictObject({
      periodSimSeconds: FinitePositive,
      amplitudeDeg: Finite,
      salt: pipe(number(), integer('must be a whole number')),
      bones: array(strictObject({ bone: BoneName, axis: picklist(['x', 'y', 'z']), scale: Finite })),
    }),
  ),
});

const HumanoidIdleSchema = strictObject({ slack: StanceIdleSchema, aggravated: StanceIdleSchema });
const DeathPairSchema = strictObject({ forward: DeathClipSchema, backward: DeathClipSchema });

const ClipEntrySchema = union([
  variant('kind', [PoseClipSchema, OverlayClipSchema, JointDeltaClipSchema]),
  HumanoidIdleSchema,
  DeathPairSchema,
]);

const ClipSetSchema = pipe(
  record(BoneName, ClipEntrySchema),
  check(
    (set) =>
      Object.entries(set).every(([name, entry]) => {
        if ('kind' in entry) {
          return true;
        }
        return name === ('slack' in entry ? 'idle' : 'death');
      }),
    'a stance idle may only be named idle and a death pair only death',
  ),
);

/** A clips file: clip sets by locomotion (see `packages/skelly-assets/tools/actorClips.mjs`). */
export const ActorClipsSchema = pipe(
  strictObject({ standing: optional(ClipSetSchema), crawling: optional(ClipSetSchema) }),
  check(
    ({ standing, crawling }) => standing !== undefined || crawling !== undefined,
    'needs a standing or crawling set',
  ),
);

export type ActorClips = InferOutput<typeof ActorClipsSchema>;
export type PoseClip = InferOutput<typeof PoseClipSchema>;
export type DeathClip = InferOutput<typeof DeathClipSchema>;
export type PoseFrame = PoseClip['frames'][number];
export type OverlayClip = InferOutput<typeof OverlayClipSchema>;
export type OverlayFrame = OverlayClip['frames'][number];
export type JointDeltaClip = InferOutput<typeof JointDeltaClipSchema>;
export type StanceIdle = InferOutput<typeof StanceIdleSchema>;
export type HumanoidIdle = InferOutput<typeof HumanoidIdleSchema>;
type ClipEntry = InferOutput<typeof ClipEntrySchema>;
type Clip = PoseClip | OverlayClip | JointDeltaClip;

const namedBones = (clip: Clip | StanceIdle): string[] => {
  if (!('kind' in clip)) {
    return [
      ...Object.keys(clip.base.rotations),
      ...clip.motion.flatMap((oscillator) => oscillator.bones.map(({ bone }) => bone)),
    ];
  }
  if (clip.kind === 'pose') {
    return clip.frames.flatMap(({ rotations }) => Object.keys(rotations));
  }
  const angled = clip.frames.flatMap(({ angles }) => Object.keys(angles));
  return clip.kind === 'overlay' ? [...angled, ...clip.walkBlendBones] : angled;
};

const jointDeltaIssues = (bones: ReadonlyMap<string, ActorBody['bones'][number]>, clip: JointDeltaClip): string[] => {
  const issues: string[] = [];
  const jointed = new Set(clip.frames.flatMap(({ angles }) => Object.keys(angles)));
  if (clip.footSoleHold) {
    jointed.add('foot.L').add('foot.R');
  }
  for (const id of jointed) {
    const bone = bones.get(id);
    if (bone && !(bone.frame && bone.limits)) {
      issues.push(`moves bone ${id}, which lacks a joint frame or limits`);
    } else if (!bone && clip.footSoleHold && id.startsWith('foot.')) {
      issues.push(`holds the sole of ${id}, which the body lacks`);
    }
  }
  return issues;
};

/** The body-dependent issues of one clip: every bone it names exists, and joint deltas name only jointed bones. */
export const clipBoneIssues = (body: ActorBody, clip: Clip | StanceIdle): string[] => {
  const bones = new Map(body.bones.map((bone) => [bone.id, bone]));
  const issues = [...new Set(namedBones(clip))]
    .filter((id) => !bones.has(id))
    .map((id) => `names bone ${id}, which the body lacks`);
  if ('kind' in clip && clip.kind === 'jointDelta') {
    issues.push(...jointDeltaIssues(bones, clip));
  }
  return issues;
};

type Requirement = (entry: ClipEntry) => boolean;

const isPose =
  (more: (clip: PoseClip) => boolean = () => true): Requirement =>
  (entry) =>
    'kind' in entry && entry.kind === 'pose' && more(entry);
const isOverlay =
  (timing: 'hitAtSimSeconds' | 'peakAtSimSeconds'): Requirement =>
  (entry) =>
    'kind' in entry && entry.kind === 'overlay' && entry[timing] !== undefined;
const isJointDelta =
  (cursor: JointDeltaClip['cursor'], more: (clip: JointDeltaClip) => boolean = () => true): Requirement =>
  (entry) =>
    'kind' in entry && entry.kind === 'jointDelta' && entry.cursor === cursor && more(entry);
const isStanceIdle: Requirement = (entry) => 'slack' in entry;
const isDeathPair: Requirement = (entry) => 'forward' in entry;

const oneFrame = (clip: PoseClip): boolean => clip.frames.length === 1;
const walking = (clip: PoseClip): boolean => clip.cycles !== undefined && clip.strideMetres !== undefined;

const HUMANOID_CRAWLING: Readonly<Record<string, Requirement>> = {
  idle: isPose(oneFrame),
  walk: isPose(walking),
  attack: isOverlay('hitAtSimSeconds'),
  flinch: isOverlay('peakAtSimSeconds'),
};

const CREATURE_STANDING: Readonly<Record<string, Requirement>> = {
  idle: isPose((clip) => oneFrame(clip) && clip.periodSimSeconds !== undefined),
  walk: isPose(walking),
  attack: isPose((clip) => !clip.loop && clip.durationSimSeconds !== undefined && clip.hitAtSimSeconds !== undefined),
};

/** One clip set a body plan admits: the clips it must hold, and whether the set may be left out. */
interface PlanSet {
  readonly clips: Readonly<Record<string, Requirement>>;
  readonly optional?: true;
}

type PlanSets = Readonly<Partial<Record<'standing' | 'crawling', PlanSet>>>;

/**
 * The clip sets the producer writes per body plan; a humanoid with a leg cut only crawls. A standing humanoid's
 * crawl set is optional because built data holds only what the game uses: a row the game never crawls, such as
 * the player, has none (`packages/deadvox/DESIGN.md`, "Clocks and units").
 */
const planSets = (body: ActorBody): PlanSets | undefined => {
  switch (body.bodyPlan) {
    case 'humanoid':
      return body.legCut === undefined
        ? {
            standing: {
              clips: {
                idle: isStanceIdle,
                walk: isPose((clip) => walking(clip) && clip.idleBlendSpeed !== undefined),
                attack: isOverlay('hitAtSimSeconds'),
                flinch: isOverlay('peakAtSimSeconds'),
              },
            },
            crawling: { clips: HUMANOID_CRAWLING, optional: true },
          }
        : { crawling: { clips: HUMANOID_CRAWLING } };
    case 'acid':
      return {
        standing: {
          clips: {
            idle: isPose((clip) => clip.periodSimSeconds !== undefined && clip.frames.length >= 2),
            death: isDeathPair,
            walk: isJointDelta('gaitPhase'),
            attack: isJointDelta(
              'time',
              (clip) => clip.durationSimSeconds !== undefined && clip.hitAtSimSeconds !== undefined,
            ),
            spitDraw: isJointDelta('progress'),
            hit: isJointDelta(
              'time',
              (clip) => clip.durationSimSeconds !== undefined && clip.peakAtSimSeconds !== undefined,
            ),
          },
        },
      };
    case 'fused-mass':
      return { standing: { clips: { idle: isPose(oneFrame) } } };
    case 'quadruped':
    case 'insect':
    case 'floater':
    case 'dragon':
      return { standing: { clips: CREATURE_STANDING } };
    default:
      return undefined;
  }
};

const entryClips = (entry: ClipEntry): (Clip | StanceIdle)[] => {
  if ('kind' in entry) {
    return [entry];
  }
  return 'slack' in entry ? [entry.slack, entry.aggravated] : [entry.forward, entry.backward];
};

type ClipSet = NonNullable<ActorClips['standing']>;

/** One entry's issues: its bones, its loop flags and, for a fused mass, its kind. */
const entryIssues = (body: ActorBody, setName: string, name: string, entry: ClipEntry): string[] => {
  const clipsOf = entryClips(entry);
  const issues = clipsOf.flatMap((clip) => clipBoneIssues(body, clip).map((issue) => `${setName}.${name} ${issue}`));
  const loops = clipsOf.flatMap((clip) => ('kind' in clip && clip.kind !== 'overlay' ? [clip.loop] : []));
  const mustLoop = name === 'walk' || (body.bodyPlan === 'acid' && setName === 'standing' && name === 'idle');
  if (mustLoop && loops.some((loop) => loop !== true)) {
    issues.push(`${setName}.${name} must loop`);
  }
  if (name === 'death' && loops.some((loop) => loop !== false)) {
    issues.push(`${setName}.death must not loop`);
  }
  if (body.bodyPlan === 'fused-mass' && 'kind' in entry && entry.kind !== 'pose') {
    issues.push(`${setName}.${name} of a fused-mass body must be a pose clip`);
  }
  return issues;
};

/** One set's issues against the plan's requirements: each required clip present and of its kind, nothing extra. */
const setIssues = (
  plan: string,
  setName: string,
  want: Readonly<Record<string, Requirement>>,
  have: ClipSet,
): string[] => {
  const issues: string[] = [];
  for (const [name, requirement] of Object.entries(want)) {
    const entry = have[name];
    if (entry === undefined) {
      issues.push(`missing clip ${setName}.${name}`);
    } else if (!requirement(entry)) {
      issues.push(`clip ${setName}.${name} is not the kind the ${plan} plan requires`);
    }
  }
  for (const name of Object.keys(have)) {
    if (!Object.hasOwn(want, name)) {
      issues.push(`unexpected clip ${setName}.${name}`);
    }
  }
  return issues;
};

/** The issues of a clips file against its body: bones, the plan's required clip set and each clip's loop flag. */
export const actorClipIssues = (body: ActorBody, clips: ActorClips): string[] => {
  const issues = Object.entries(clips).flatMap(([setName, set]) =>
    Object.entries(set ?? {}).flatMap(([name, entry]) => entryIssues(body, setName, name, entry)),
  );
  const sets = planSets(body);
  if (!sets) {
    issues.push(`body plan ${body.bodyPlan} has no required clip set`);
    return issues;
  }
  for (const setName of ['standing', 'crawling'] as const) {
    const want = sets[setName];
    const have = clips[setName];
    if (want && have) {
      issues.push(...setIssues(body.bodyPlan, setName, want.clips, have));
    } else if (want && !want.optional) {
      issues.push(`missing clip set ${setName}`);
    } else if (have) {
      issues.push(`unexpected clip set ${setName}`);
    }
  }
  return issues;
};

/** The registry key of one built figure, named as the asset submodule names its files. */
export const actorFigureKey = (type: string, seed: number): string => `${type}.${seed}`;

const FIGURE_KEY = /^(.+)\.(\d+)$/;

/** A figure key's type and seed, or nothing when the key is not "type.seed". */
export const actorFigureKeyParts = (id: string): { type: string; seed: number } | undefined => {
  const match = FIGURE_KEY.exec(id);
  return match ? { type: match[1]!, seed: Number(match[2]) } : undefined;
};

/**
 * One built figure: the declared pack files holding the body, clips and GLB mesh the asset submodule bakes for one
 * type and seed. Only Node reads those bytes, so the browser admits figures without loading them.
 */
export const ActorFigureSchema = pipe(
  strictObject({ id: string(), body: string(), clips: string(), mesh: string() }),
  check(({ id }) => actorFigureKeyParts(id) !== undefined, 'id must be the figure type and seed as "type.seed"'),
);
