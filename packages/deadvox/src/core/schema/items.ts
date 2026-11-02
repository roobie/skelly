import { ModelPointSchema } from '@skelly/thing-core/schema';
import {
  array,
  check,
  finite,
  type InferOutput,
  integer,
  literal,
  maxLength,
  maxValue,
  minLength,
  minValue,
  nonEmpty,
  number,
  optional,
  picklist,
  pipe,
  record,
  safeInteger,
  strictObject,
  string,
  tuple,
  union,
  variant,
  boolean as vBoolean,
} from 'valibot';
import { BODY_REGIONS, DAMAGE_KINDS, MELEE_DAMAGE_KINDS } from '../body.ts';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../character.ts';
import { CORE_CONTENT_IDS } from '../contentIds.ts';
import { ItemEconomySchema } from '../loot.ts';
import { MELEE_MOTIONS } from '../meleeMotion.ts';
import { hasReadableWords, isReadablePlainText, READABLE_TEXT_LIMIT, READABLE_TITLE_LIMIT } from '../readable.ts';
import { SOUND_EVENT_IDS } from '../soundEvents.ts';
import {
  CalibreId,
  Color,
  Count,
  FirearmsSkillZeroHandlingSchema,
  Fraction,
  GameMinutes,
  GamePerHour,
  Id,
  Name,
  NonNegative,
  Positive,
  PositiveGameHours,
  PositiveGameMinutes,
  PositiveRealSeconds,
  PositiveSimSeconds,
  QualityLevel,
  SimSeconds,
  SkillLevel,
} from './primitives.ts';

// ---- items ----

const ITEM_CATEGORIES = [
  'food',
  'drink',
  'medical',
  'tool',
  'weapon',
  'clothing',
  'bag',
  'light',
  'battery',
  'ammo',
  'material',
  'book',
  'note',
  'misc',
] as const;

/** What a fitted vehicle part provides; the game supports these, so content naming another is refused. */
const VEHICLE_CAPABILITIES = [
  'steered',
  'driven',
  'power',
  'fuel',
  'electricity',
  'storage',
  'seat',
  /** A door or hatch a player gets in through. */
  'entry',
  'light',
  'glazing',
  'protection',
  /** Frame, tray or mount that other fittings rest on. */
  'structure',
  /** A road wheel, the part a vehicle rolls on. */
  'wheel',
  /** Raises heavy loads; the part names its rated load. */
  'lift',
  /** Braces a lifting vehicle against the ground; a vehicle that lifts needs one. */
  'stabiliser',
  /** A floor a cargo space can rest on (`src/core/cargoSpace.ts`, `placementRegion`). */
  'load_floor',
] as const;

export type VehicleCapability = (typeof VEHICLE_CAPABILITIES)[number];

/** Eyes sits beside the head so goggles stack with a helmet or headlamp (`DESIGN.md`, "The item model"). */
const CLOTHING_SLOTS = ['head', 'eyes', 'torso', 'vest', 'legs', 'back', 'waist', 'hands', 'feet'] as const;

/** The shoulder holds a slung long gun, never clothing (`DESIGN.md`, "Shoulder and sling"). */
export const WEAR_SLOTS = [...CLOTHING_SLOTS, 'shoulder'] as const;

export type WearSlot = (typeof WEAR_SLOTS)[number];

export const Cells = pipe(Count, minValue(1, 'must be at least 1'));

/** Width and height in inventory cells. */
const Area = tuple([Cells, Cells]);

const PocketSchema = strictObject({
  name: optional(Name),
  /** Its grid: the only limit on what fits (`DESIGN.md`, "The item model"). */
  grid: Area,
  /** Sim seconds to take an item out or put one in, before the per-cell part. */
  handlingSimSeconds: SimSeconds,
});

export const ContainerSchema = strictObject({
  pockets: pipe(array(PocketSchema), nonEmpty('needs at least one pocket')),
  /** Why its pockets need more than the inventory width tuning allows. */
  wideReason: optional(pipe(string(), nonEmpty('must not be empty'))),
});

const WearableSchema = pipe(
  strictObject({
    slot: picklist(CLOTHING_SLOTS),
    figureFit: optional(Id),
    viewModel: optional(
      strictObject({
        model: Id,
        tint: Fraction,
        darkening: Fraction,
      }),
    ),
    /** 0–100: how much it slows and hampers you. */
    encumbrance: pipe(NonNegative, maxValue(100, 'must be 0 to 100')),
    warmth: optional(pipe(NonNegative, maxValue(100, 'must be 0 to 100'))),
    wearPerDamage: optional(NonNegative),
    protects: optional(record(picklist(DAMAGE_KINDS), pipe(NonNegative, maxValue(1)))),
    /** Damage kinds that neither reach the wearer through it nor wear it (`DESIGN.md`, "Worn coverage"). */
    imperviousTo: optional(
      pipe(
        array(picklist(DAMAGE_KINDS)),
        check((kinds) => new Set(kinds).size === kinds.length, 'impervious damage kinds must be unique'),
      ),
    ),
  }),
  check(
    (wearable) => wearable.figureFit === undefined || wearable.slot === 'torso',
    'an under-layer fit requires the torso slot',
  ),
  check(
    (wearable) => wearable.viewModel === undefined || wearable.slot === 'head',
    'a first-person model requires the head slot',
  ),
  check(
    (wearable) => !(wearable.imperviousTo ?? []).some((kind) => wearable.protects?.[kind] !== undefined),
    'protected damage kinds must not also be impervious',
  ),
);

const FoodSchema = pipe(
  strictObject({
    /** Kilocalories. */
    calories: NonNegative,
    /** Millilitres of water it gives. */
    water: NonNegative,
    /** Sim seconds to eat or drink one. */
    consumeSimSeconds: PositiveSimSeconds,
    /** Game hours until it spoils; absent means it keeps. */
    rotsAfterGameHours: optional(PositiveGameHours),
    /** Share of `rotsAfterGameHours` after which it reads as going off; required for food that spoils. */
    goingOffFraction: optional(pipe(Positive, maxValue(1, 'must be at most 1'))),
    /** Health lost to eating it once rotten; required for food that spoils. */
    poisonHealth: optional(Positive),
  }),
  check(
    (food) =>
      food.rotsAfterGameHours === undefined
        ? food.goingOffFraction === undefined && food.poisonHealth === undefined
        : food.goingOffFraction !== undefined && food.poisonHealth !== undefined,
    'food that spoils needs goingOffFraction and poisonHealth, and food that keeps has neither',
  ),
);

const ToolSchema = strictObject({
  /** Quality levels, such as { "prying": 2 }. */
  qualities: record(Id, QualityLevel),
  /** It runs on a swappable canister: the item type that fits it, and Sim seconds to swap one in. */
  fuel: optional(strictObject({ canister: Id, swapSimSeconds: PositiveSimSeconds })),
});

/** The fill shape of a battery, for a canister a fuelled tool draws on. */
const CanisterSchema = strictObject({
  /** Fill when full, in the units a forcing method's `fuel` spends. */
  capacity: Positive,
});

/** Holding the attack past the wind-up builds a stronger strike. Doc: `docs/charged-attacks.md`. */
const MeleeChargeSchema = strictObject({
  /** Sim seconds of holding that reach the full charge; holding longer adds nothing. */
  fullSimSeconds: PositiveSimSeconds,
  /** Shapes the build-up: the charge level is the held share of `fullSimSeconds` raised to this power. */
  curveExponent: Positive,
  /** Damage multiplier at the full charge; a partial charge scales linearly towards it. */
  damageMultiplier: Positive,
  /** Impulse multiplier at the full charge; a partial charge scales linearly towards it. */
  impulseMultiplier: Positive,
  /** Extra stamina a full charge costs on release, scaled by the charge level. */
  stamina: NonNegative,
});

export type MeleeCharge = InferOutput<typeof MeleeChargeSchema>;

const WeaponSchema = strictObject({
  melee: strictObject({
    motion: picklist(MELEE_MOTIONS),
    damage: Positive,
    /** Metres beyond the player's hand; the arm's reach is added when swinging. */
    reach: Positive,
    /** Sim seconds between swings. */
    cooldownSimSeconds: PositiveSimSeconds,
    stamina: NonNegative,
    /** Share of the cooldown a swing winds up before contact, capped by `windupCapSimSeconds`. */
    contactFraction: Fraction,
    /** The longest wind-up before contact, in sim seconds. */
    windupCapSimSeconds: PositiveSimSeconds,
    /** Impulse delivered by a melee hit, in N·s; it is also the strike's strength against a door. */
    impulse: NonNegative,
    /** Condition lost when this weapon lands a melee hit. */
    wearPerHit: optional(Fraction),
    /** Overrides the weapon class's per-hit damage spread. */
    damageVariance: optional(Fraction),
    /** Overrides the weapon class's head-hit damage multiplier. */
    headDamageMultiplier: optional(Positive),
    /** Overrides the weapon class's limb-hit damage multiplier. */
    limbDamageMultiplier: optional(Positive),
    /** Overrides the weapon class's swing-speed multiplier. */
    speedMultiplier: optional(Positive),
    /** Swing presentation event; absent uses the shared swing. */
    swingSound: optional(Id),
    /** Hit presentation event; absent uses the shared hit. */
    hitSound: optional(Id),
    /** Played over the hit, such as a metal ring for a metal weapon. */
    hitLayerSound: optional(Id),
    type: picklist(MELEE_DAMAGE_KINDS),
    charge: optional(MeleeChargeSchema),
  }),
});

/** The bare-handed attack, which no item supplies. */
const UnarmedAttackSchema = strictObject({
  motion: picklist(MELEE_MOTIONS),
  damage: Positive,
  /** Metres beyond the player's hand; the arm's reach is added when swinging. */
  reach: Positive,
  /** Sim seconds between swings. */
  cooldownSimSeconds: PositiveSimSeconds,
  stamina: NonNegative,
  contactFraction: Fraction,
  windupCapSimSeconds: PositiveSimSeconds,
  impulse: NonNegative,
});

export const MeleeClassSchema = pipe(
  strictObject({
    id: picklist([...MELEE_DAMAGE_KINDS, 'fists']),
    /** Fractional spread applied symmetrically around base weapon damage. */
    damageVariance: Fraction,
    headDamageMultiplier: Positive,
    limbDamageMultiplier: Positive,
    /** Multiplies swing speed; cooldown is divided by this value. */
    speedMultiplier: Positive,
    /** Present exactly on the `fists` class, whose attack has no weapon item to carry it. */
    unarmed: optional(UnarmedAttackSchema),
  }),
  check(
    (meleeClass) => (meleeClass.id === CORE_CONTENT_IDS.fistsMeleeClass) === (meleeClass.unarmed !== undefined),
    'only the fists melee class carries an unarmed attack, and it must',
  ),
);

const RoundFeedPoseSchema = pipe(
  strictObject({
    pickupEnd: NonNegative,
    approachEnd: NonNegative,
    thumbEnd: NonNegative,
    pickupSide: NonNegative,
    pickupBelow: NonNegative,
    pickupBack: NonNegative,
    palmBelow: NonNegative,
    palmBack: NonNegative,
    thumbLift: NonNegative,
    thumbTravel: NonNegative,
  }),
  check(
    (pose) =>
      pose.pickupEnd > 0 && pose.pickupEnd < pose.approachEnd && pose.approachEnd < pose.thumbEnd && pose.thumbEnd < 1,
    'feed phases must increase strictly between zero and one',
  ),
);

export type RoundFeedPoseTuning = InferOutput<typeof RoundFeedPoseSchema>;

const FirearmSchema = strictObject({
  pump: optional(vBoolean()),
  bolt: optional(vBoolean()),
  roundLoadSimSeconds: optional(PositiveSimSeconds),
  /** Shot presentation event; every firearm selects one, so a new gun needs no code edit. */
  shotSound: Id,
  /** Shot event while a suppressor is fitted; required when the model can mount one. */
  suppressedShotSound: optional(Id),
  /** Low-frequency layer played with the shot, for a gun whose report needs more body than one recording has; skipped while suppressed. */
  shotBodySound: optional(Id),
  /** Trigger pulled on an empty chamber; absent stays silent. */
  dryFireSound: optional(Id),
  /** The trigger pull cocks the hammer itself (double action), so every empty pull clicks; otherwise only working the action re-cocks it. */
  triggerCocks: optional(vBoolean()),
  /** A bolt gun's open and close strokes; each plays on its own phase, so a bolt gun needs both. */
  boltOpenSound: optional(Id),
  boltCloseSound: optional(Id),
  /** Camera-local aim kick per committed shot, scaled by firearms control. */
  recoilKickRadians: Positive,
  /** Half-angle of the firearm's independent per-round cone; pump firearms must set zero because pellet spread owns their cone. */
  dispersionRadians: pipe(NonNegative, maxValue(Math.PI / 2, 'must be at most a right angle')),
  /** Multiplies an ammunition item's pellet spread, so the firearm owns its choke. */
  pelletSpreadScale: Positive,
  /** Optional per-gun skill-zero endpoints; absent guns use firearms-combat's shared factors. */
  skillZeroHandling: optional(FirearmsSkillZeroHandlingSchema),
  /** Reload handling times at skill 0, before the firearms skill's reload factor. */
  revolver: optional(
    strictObject({
      doubleActionPullSimSeconds: PositiveSimSeconds,
      doubleActionDispersionRadians: pipe(NonNegative, maxValue(Math.PI / 2)),
      recoverySimSeconds: PositiveSimSeconds,
      openSimSeconds: PositiveSimSeconds,
      ejectSimSeconds: PositiveSimSeconds,
      pickSimSeconds: PositiveSimSeconds,
      loadSimSeconds: PositiveSimSeconds,
      loadPose: RoundFeedPoseSchema,
      closeSimSeconds: PositiveSimSeconds,
      cockSimSeconds: PositiveSimSeconds,
    }),
  ),
  handling: strictObject({
    /** Taking the fitted magazine out and drawing one in; required for a magazine-fed gun. */
    magazine: optional(
      strictObject({
        removeSimSeconds: PositiveSimSeconds,
        insertSimSeconds: PositiveSimSeconds,
      }),
    ),
  }),
});

/** Per projectile (one rifle bullet, or each pellet); damage, push and reach are gameplay estimates, not ballistics. */
const AmmoSchema = strictObject({
  calibre: CalibreId,
  pellets: pipe(Count, minValue(1), maxValue(64)),
  /** Base half-angle for pellet directions; the firearm's choke scale multiplies it. */
  spreadDegrees: pipe(NonNegative, maxValue(90, 'must be at most a right angle')),
  diameterMm: Positive,
  /** Region health a projectile takes, before the zombie's per-region pierce resistance. */
  damage: Positive,
  /** Push in N·s on the struck body. */
  impulse: Positive,
  /** Hitscan reach. */
  rangeMetres: Positive,
  /** Scales `damage` on a head hit; absent means 1. */
  headDamageMultiplier: optional(Positive),
  /** Sim seconds to press one into a magazine, before the firearms skill's reload factor. */
  loadSimSeconds: PositiveSimSeconds,
  /** Sim seconds to strip one out of a magazine, before the firearms skill's reload factor. */
  stripSimSeconds: PositiveSimSeconds,
});

export const BeamSpillSchema = strictObject({
  /** Off keeps the tunables authored but renders the plain cone; a mod or `torchspill=1` turns it on. */
  enabled: vBoolean(),
  radiusRatio: pipe(number(), finite(), minValue(1 + Number.EPSILON)),
  intensity: pipe(number(), finite(), minValue(0), maxValue(1 - Number.EPSILON)),
});

export type BeamSpill = InferOutput<typeof BeamSpillSchema>;

/** How bright light in view flares through the goggles (`src/render/nightVisionFlare.ts`, `nightVisionFlare`). */
const NightVisionFlareSchema = strictObject({
  /** How hard the summed sources wash the view out; 0 turns the flare off. */
  strength: NonNegative,
  /** Metres at which a source's flare falls to half. */
  distanceMetres: Positive,
  /** A blast fireball's brightness to the goggles at the moment of the blast. */
  blastIntensity: NonNegative,
  /** Time constant of the after-image. */
  recoverRealSeconds: PositiveRealSeconds,
  /** A halo's radius at a light, as a share of the picture's size. */
  haloRadius: pipe(Positive, maxValue(1, 'must be at most 1')),
});

const NightVisionSchema = strictObject({
  /** Multiplies the scene's linear light before tone mapping. */
  gain: Positive,
  /** The colour the picture's brightness is shown in. */
  tint: Color,
  /** Peak-to-peak grain, in display-referred colour (0..1). */
  grain: Fraction,
  /**
   * The narrowed field of view: the picture darkens from `inner` to `outer` (distances from its centre, as shares
   * of its size) and by `darkening` beyond.
   */
  edge: pipe(
    strictObject({ darkening: Fraction, inner: Fraction, outer: Fraction }),
    check((edge) => edge.inner < edge.outer, 'inner must be less than outer'),
  ),
  flare: NightVisionFlareSchema,
});

export type NightVision = InferOutput<typeof NightVisionSchema>;

const LightSchema = strictObject({
  /** Metres it lights up. */
  radius: Positive,
  /** Metres from which others can see it (`DESIGN.md`, "Light"). */
  seenFrom: Positive,
  /** Point-light colour, and intensity in the light units the renderer draws and the simulation measures. */
  color: Color,
  intensity: Positive,
  /** Material glow for sources that remain visible when outside the point-light pool. */
  emissive: optional(NonNegative),
  /** Total burn in Game hours for a consumable flame/light. */
  burnTimeGameHours: optional(PositiveGameHours),
  /** Fuel units consumed per Game hour, for self-fueled sources such as a lighter. */
  fuelPerGameHour: optional(GamePerHour),
  liquidFuel: optional(
    strictObject({
      accepts: pipe(array(Id), minLength(1)),
      microlitresPerGameSecond: pipe(Positive, integer(), maxValue(Number.MAX_SAFE_INTEGER)),
    }),
  ),
  /** A cone-shaped beam; absent means light all around. */
  beam: optional(
    strictObject({
      /** Full width of the cone, in degrees. */
      angleDegrees: pipe(Positive, maxValue(180, 'must be at most 180')),
      /** Share of the cone, from its edge inward, over which the beam fades to dark; the rest is the hotspot. */
      penumbra: pipe(number(), minValue(0, 'must be at least 0'), maxValue(1, 'must be at most 1')),
      decay: NonNegative,
      spill: optional(BeamSpillSchema),
    }),
  ),
  burning: optional(
    strictObject({
      ignition: picklist(['manual', 'firestarter', 'snap']),
      douse: vBoolean(),
      sprint: picklist(['stay', 'douse']),
      stow: picklist(['refuse', 'douse', 'stay']),
      drop: picklist(['douse', 'stay']),
      relight: vBoolean(),
    }),
  ),
  /** Size of the drawn flame, in metres, standing on the model's `flame` anchor while lit. */
  flame: optional(strictObject({ heightMetres: Positive, radiusMetres: Positive })),
  /** What powers it: an item with a battery component, and charge used per Game hour. */
  power: optional(
    strictObject({
      battery: Id,
      compatibleBatteries: optional(array(Id)),
      chargePerGameHour: GamePerHour,
      swapSimSeconds: PositiveSimSeconds,
    }),
  ),
  /** Stays lit while worn and answers the worn-light control, so a source not in the hand needs no new key. */
  wornSwitch: optional(vBoolean()),
  /** How the view looks through it while worn, on and charged (`DESIGN.md`, "Light"). */
  nightVision: optional(NightVisionSchema),
});

const IgniterSchema = strictObject({ capacity: Positive, perIgnition: Positive });

/** A thrown charge whose fuse starts when it leaves the hand (`DESIGN.md`, "Hand grenade"). */
const ExplosiveSchema = strictObject({
  fuseSimSeconds: PositiveSimSeconds,
  /**
   * Region health taken from every region of a body whose centre the blast sees, and the push in N·s on it, both
   * falling to none at the radius.
   */
  blast: strictObject({ radiusMetres: Positive, damage: Positive, impulse: Positive }),
  /**
   * Seeded rays through the shot hit test; each takes `damage` from the region it strikes. Every ray is traced
   * against the bodies in range when the charge goes off, so the count sets that moment's cost.
   */
  fragments: strictObject({
    count: pipe(Count, minValue(1, 'must be at least 1'), maxValue(1000, 'must be at most 1000')),
    damage: Positive,
    rangeMetres: Positive,
    /** Push in N·s on the struck body. */
    impulse: Positive,
  }),
  /** Sound event at detonation; its noise draws zombies. */
  sound: picklist(SOUND_EVENT_IDS),
});

/** A trap set on the floor that springs on whatever enters its cell (`SLICE-5.md`, "Settled bear-trap rules — issue #107"). */
const TrapSchema = strictObject({
  setSimSeconds: PositiveSimSeconds,
  /** One uninterrupted bare-hands attempt; an interrupted attempt starts again from nothing. */
  disarmSimSeconds: PositiveSimSeconds,
  /** How long its jaws hold a caught leg before the victim pulls free. */
  holdSimSeconds: PositiveSimSeconds,
  /** The player's wound when it springs on them. */
  playerInjury: strictObject({ region: picklist(BODY_REGIONS), damage: Positive, kind: picklist(DAMAGE_KINDS) }),
  /** Health taken from a caught zombie's legs, shared between those not yet destroyed. */
  zombieLegDamage: NonNegative,
});

/** Tagged with its model's attachment kind, so each kind authors every effect it has and no other. */
const FirearmAttachmentEffectsSchema = variant('kind', [
  strictObject({
    kind: literal('suppressor'),
    /** Fraction of the firearm's committed recoil kick removed at full condition. */
    recoilReduction: Fraction,
    /** Condition lost per committed shot; zero means the attachment does not wear. */
    wearPerShot: Fraction,
    /** Firearms Combat level required to fit this suppressor; removing it remains open. */
    fitSkillLevel: SkillLevel,
    /** Player-facing refusal when the character lacks the fitting skill. */
    fitRefusal: Name,
  }),
  strictObject({
    kind: literal('foregrip'),
    /** Multipliers applied to the existing aim and stance response. */
    swayScale: Positive,
    recoveryScale: Positive,
    raiseScale: Positive,
    swingScale: Positive,
    wearPerShot: Fraction,
  }),
]);

const BatterySchema = strictObject({
  /** Charge when full, in the units lights use per hour. */
  capacity: Positive,
  rechargeable: optional(strictObject({ microjoulesPerCharge: pipe(number(), safeInteger(), minValue(1)) })),
});

export const HELD_DISPLAY_KIND = { compass: 'compass' } as const;

const HELD_DISPLAY_KINDS = Object.values(HELD_DISPLAY_KIND);

export const PILE_DISPLAY_KIND = { scatter: 'scatter' } as const;

const PILE_DISPLAY_KINDS = Object.values(PILE_DISPLAY_KIND);

const BookSchema = strictObject({
  title: Name,
  recipes: pipe(array(Id), nonEmpty('needs at least one recipe')),
  /** Game minutes spent reading. */
  readingGameMinutes: PositiveGameMinutes,
});

const readableText = (limit: number) =>
  pipe(
    string(),
    check(hasReadableWords, 'must contain non-whitespace text'),
    check(isReadablePlainText, 'must be plain text without markup or control characters'),
    maxLength(limit, `must be at most ${limit} characters`),
  );

export const ReadableSchema = strictObject({
  title: readableText(READABLE_TITLE_LIMIT),
  text: readableText(READABLE_TEXT_LIMIT),
});

export const ItemCountSchema = strictObject({ item: Id, count: pipe(Count, minValue(1, 'must be at least 1')) });

const YieldRounding = picklist(['floor', 'round', 'ceil']);

const SkillFractions = pipe(
  array(Fraction),
  minLength(2, `needs a skill-${SKILL_LEVEL_MIN} and top-skill fraction`),
  maxLength(SKILL_LEVEL_MAX - SKILL_LEVEL_MIN + 1, 'extends beyond the maximum skill level'),
  check((fractions) => fractions.every((fraction, i) => i === 0 || fraction >= fractions[i - 1]!), 'must not decrease'),
  check((fractions) => fractions.at(-1)! > fractions[0]!, 'must increase with skill'),
);

const ToolFractionBonus = pipe(
  array(Fraction),
  minLength(1, 'needs a bonus for at least one tool level'),
  check((fractions) => fractions.every((fraction, i) => i === 0 || fraction >= fractions[i - 1]!), 'must not decrease'),
);

const LiquidRecoverySchema = strictObject({
  fractions: SkillFractions,
  rounding: YieldRounding,
  toolModifier: optional(
    strictObject({
      quality: Id,
      /** Additions by tool quality level: index 0 is level 1; higher levels saturate at the last entry. */
      bonusByLevel: ToolFractionBonus,
    }),
  ),
});

const DisassemblyYieldSchema = strictObject({
  ...ItemCountSchema.entries,
  ...LiquidRecoverySchema.entries,
});

const DisassemblySchema = strictObject({
  /** Game minutes. */
  timeGameMinutes: PositiveGameMinutes,
  skill: Id,
  yields: pipe(array(DisassemblyYieldSchema), nonEmpty('needs at least one yield')),
  liquidRecovery: optional(LiquidRecoverySchema),
});

/** What one dose of a painkiller does to felt pain (`DESIGN.md`, "Pain"); it heals nothing. */
const AnalgesicSchema = strictObject({
  /** Painkillers that share one cap; an item without a group is its own. */
  group: optional(Id),
  /** Handling time to take one dose. */
  takeSimSeconds: PositiveSimSeconds,
  /** Pain one dose takes off at its peak. */
  reliefPerDose: Positive,
  /** The most relief the group's doses give together, so a repeat dose adds less. */
  maxRelief: Positive,
  /** Game minutes for a dose's relief to rise from nothing to its peak; 0 reaches the peak on taking. */
  onsetGameMinutes: GameMinutes,
  /** Game minutes it holds at its peak. */
  peakGameMinutes: GameMinutes,
  /** Game minutes it then takes to fall back to nothing; 0 stops at once. */
  fadeGameMinutes: GameMinutes,
  /** Edge blur and darkening at a dose's peak, as a share of full; it follows the dose's relief curve. */
  vignette: optional(Fraction),
});

/** What one application does to a body wound (`DESIGN.md`, "Bleeding"). */
export const TreatmentSchema = pipe(
  strictObject({
    /** Strength: the bleeding one application closes before its roll and modifiers, in `treatmentEffort` units. */
    bleeding: optional(Positive),
    /** The infection stages one application can resolve, and its chance to. */
    infection: optional(
      strictObject({
        stages: pipe(array(picklist(['early', 'advanced'])), nonEmpty('must name a stage')),
        chance: Fraction,
      }),
    ),
  }),
  check(
    (treatment) => treatment.bleeding !== undefined || treatment.infection !== undefined,
    'must treat bleeding or infection',
  ),
);

const LiquidVolumeMicrolitres = pipe(number(), safeInteger(), minValue(0));

export const LiquidAmountSchema = strictObject({
  liquid: Id,
  volumeMicrolitres: pipe(LiquidVolumeMicrolitres, minValue(1)),
});

export const LiquidContentsSchema = union([
  strictObject({ kind: literal('empty') }),
  strictObject({
    kind: literal('filled'),
    ...LiquidAmountSchema.entries,
  }),
]);

export const LiquidSchema = strictObject({ id: Id, name: Name, densityGramsPerMillilitre: pipe(Positive, finite()) });

const VesselSchema = strictObject({
  capacityMicrolitres: pipe(LiquidVolumeMicrolitres, minValue(1)),
  accepts: pipe(array(Id), nonEmpty()),
  initialContents: LiquidContentsSchema,
  pour: optional(
    strictObject({
      incrementMicrolitres: pipe(LiquidVolumeMicrolitres, minValue(1)),
      microlitresPerSimSecond: pipe(Positive, finite()),
    }),
  ),
});

export type LiquidContents = InferOutput<typeof LiquidContentsSchema>;

export const VEHICLE_ADDON_FACES = {
  // biome-ignore lint/style/useNamingConvention: keys are content capability words.
  load_floor: { normal: 1, tangents: [0, 2] },
} as const;

const VehicleServiceFields = {
  mount: Id,
  durationSimSeconds: PositiveSimSeconds,
  qualities: record(Id, QualityLevel),
};

export const ItemSchema = strictObject({
  id: Id,
  economy: ItemEconomySchema,
  workInProgress: vBoolean(),
  notLoot: vBoolean(),
  name: Name,
  category: picklist(ITEM_CATEGORIES),
  weight: optional(NonNegative),
  /** Cells it takes in a grid, as [w, h]; it can be rotated. */
  size: Area,
  description: optional(string()),
  /** Extra words a player may type to find it on the inventory screen, besides its name. */
  keywords: optional(array(Name)),
  /** Identical, stateless instances stack, up to this many (nails, batteries). */
  stack: optional(pipe(Count, minValue(2, 'must be at least 2'))),
  /** Held in both hands. */
  twoHanded: optional(vBoolean()),
  container: optional(strictObject({ ...ContainerSchema.entries, rigid: optional(vBoolean()) })),
  wearable: optional(WearableSchema),
  figureModels: optional(
    array(
      strictObject({
        model: Id,
        overTorso: optional(record(Id, Id)),
        frame: Id,
        covers: optional(array(Id)),
        pivot: tuple([number(), number(), number()]),
        at: tuple([number(), number(), number()]),
        turn: tuple([number(), number(), number()]),
      }),
    ),
  ),
  food: optional(FoodSchema),
  serving: optional(strictObject({ food: Id, empty: Id })),
  treatment: optional(TreatmentSchema),
  analgesic: optional(AnalgesicSchema),
  tool: optional(ToolSchema),
  weapon: optional(WeaponSchema),
  firearm: optional(FirearmSchema),
  ammo: optional(AmmoSchema),
  /** Sealed, non-container payload: held primary activation opens one package. */
  unpack: optional(
    strictObject({
      item: Id,
      count: pipe(Count, minValue(1, 'must be at least 1')),
      simSeconds: PositiveSimSeconds,
      qualities: optional(record(Id, QualityLevel)),
      inPlace: optional(vBoolean()),
    }),
  ),
  /** An authored yield for a finished item; never inferred from recipe alternatives. */
  disassembly: optional(DisassemblySchema),
  /** Destructive recovery outputs, independent of recipes and disassembly support. */
  salvage: optional(pipe(array(ItemCountSchema), nonEmpty('needs at least one salvage output'))),
  /** Work time to salvage; required with `salvage`, forbidden without it. */
  salvageTimeGameMinutes: optional(PositiveGameMinutes),
  salvageLiquidRecovery: optional(strictObject({ skill: Id, ...LiquidRecoverySchema.entries })),
  light: optional(LightSchema),
  igniter: optional(IgniterSchema),
  explosive: optional(ExplosiveSchema),
  trap: optional(TrapSchema),
  readable: optional(ReadableSchema),
  paperMap: optional(literal(true)),
  /** Display capability shown in first person; later devices can share this rendering seam. */
  heldDisplay: optional(picklist(HELD_DISPLAY_KINDS)),
  /** How the item appears when it is in a ground pile. */
  pileDisplay: optional(picklist(PILE_DISPLAY_KINDS)),
  book: optional(BookSchema),
  battery: optional(BatterySchema),
  canister: optional(CanisterSchema),
  vessel: optional(VesselSchema),
  /** A working alarm clock: carried, it lets a sleep run to a chosen wake hour. */
  alarm: optional(literal(true)),
  /** Initial ADS power for a variable-power optic; constrained by its exported range. */
  opticMagnification: optional(Positive),
  opticUnityImage: optional(picklist(['world', 'source'])),
  /** Explicitly excludes an optic from fitting until its dedicated image mechanism exists. */
  opticView: optional(picklist(['unavailable'])),
  opticZoom: optional(strictObject({ step: Positive, rememberPerWeapon: vBoolean() })),
  /** Deadvox-owned handling/wear tuning for a fitted firearm attachment. */
  firearmAttachmentEffects: optional(FirearmAttachmentEffectsSchema),
  /** Fits a long gun's sling mount, so the gun can be carried on the shoulder. */
  sling: optional(vBoolean()),
  /** A light mount: fits a long gun whose `lightMountSite` has the same kind, where gungen exports no rail for it. */
  lightMount: optional(strictObject({ kind: Id })),
  /** Where a long gun takes a `lightMount` of the same kind: a frame in the gun model's metres and XYZ degrees. */
  lightMountSite: optional(
    strictObject({
      kind: Id,
      at: tuple([number(), number(), number()]),
      turn: tuple([number(), number(), number()]),
    }),
  ),
  /** One authored/global lock id; no per-placement key payload. */
  key: optional(strictObject({ lock: Id })),
  /**
   * Dropped across a closed door from the side the player stands on, it bars the door from the other side
   * (`DESIGN.md`, "Door bar"). Held in both hands to set; `look` draws it on the door.
   */
  doorBar: optional(
    strictObject({
      setSimSeconds: PositiveSimSeconds,
      liftSimSeconds: PositiveSimSeconds,
      look: strictObject({ color: Color, thickness: Positive }),
    }),
  ),
  /** Its model (the `models` section); without one it's a bundle in a pile and a box in the hand. */
  model: optional(Id),
  /** A vehicle part: blueprints may fit it, and its model must export parts with baked collision. */
  vehicle: optional(
    strictObject({
      /** Content identity of the service interface this loose part can occupy. */
      mount: optional(Id),
      service: optional(strictObject(VehicleServiceFields)),
      addon: optional(
        strictObject({
          requires: picklist(Object.keys(VEHICLE_ADDON_FACES) as (keyof typeof VEHICLE_ADDON_FACES)[]),
          /** An omitted clearance leaves open sky unbounded; fitted collision still limits height. */
          openClearanceCells: optional(Cells),
        }),
      ),
      capabilities: pipe(
        array(picklist(VEHICLE_CAPABILITIES)),
        check((list) => new Set(list).size === list.length, 'capabilities must be distinct'),
      ),
      /** Channel-specific blockers; a physical fitting need not hide, shade, hear or stop a strike. */
      obstruction: strictObject({
        sight: vBoolean(),
        light: vBoolean(),
        sound: vBoolean(),
        combat: vBoolean(),
      }),
      /** The heaviest load a `lift` part raises; one rating, not a chart over reach. */
      ratedLoadKg: optional(Positive),
      /**
       * A cargo space: a block whose footprint is its one pocket (`DESIGN.md`, "Vehicles", **Cargo space.**).
       * Its block is a fitting's `cargo` cells, whatever voxels its model is drawn in.
       */
      cargoSpace: optional(
        strictObject({
          /** Sim seconds to take an item out or put one in, before the per-cell part. */
          handlingSimSeconds: SimSeconds,
          /** Why its pocket may be wider than the inventory width tuning allows. */
          wideReason: optional(pipe(string(), nonEmpty('must not be empty'))),
        }),
      ),
    }),
  ),
});

const VehicleFittingSchema = strictObject({
  id: Id,
  /** An item with a `vehicle` block. */
  part: Id,
  /** Where the part's model origin sits, in vehicle metres: x forward, y up, z toward the near side. */
  at: ModelPointSchema,
  /** Reflected across z about `at`: the other side's placement of an unhanded part. */
  mirror: optional(literal(true)),
  /** Every fitting it rests on; an authored structural choice, not inferred from contact. */
  supportedBy: array(Id),
  /** A factory cargo space's size in inventory cells along x, y and z; its pocket is x by z. */
  cargo: optional(tuple([Cells, Cells, Cells])),
  /** Overrides the part's work requirements at this authored site. */
  service: optional(
    strictObject({
      /** What the opened vehicle calls this site while it is empty. */
      name: Name,
      ...VehicleServiceFields,
    }),
  ),
});

/** A factory build, as a vehicle authoring export: parts by item id, placed and supported. */
export const VehicleBlueprintSchema = strictObject({
  id: Id,
  name: Name,
  fittings: pipe(
    array(VehicleFittingSchema),
    nonEmpty('needs at least one fitting'),
    check((list) => new Set(list.map(({ id }) => id)).size === list.length, 'fitting ids must be distinct'),
  ),
});
