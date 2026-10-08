// Content schemas (Valibot). Each schema checks one kind of content's shape, and the
// TypeScript types are inferred from it. References between content (loot tables,
// furniture, zombie types, models) are checked after all files are merged (content.ts).
// Units: grams, millilitres, metres and seconds; inventory space is in cells.

import {
  array,
  check,
  type InferOutput,
  integer,
  literal,
  maxLength,
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
  regex,
  strictObject,
  string,
  transform,
  tuple,
  union,
  boolean as vBoolean,
} from 'valibot';
import { hasSegment } from './authoredTerrain.mjs';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from './character.ts';
import { parseSpawnTime } from './clock.ts';
import { FIREARMS_SKILL_ZERO_RANGES } from './firearmsSkill.ts';
import { hasReadableWords, isReadablePlainText, READABLE_TEXT_LIMIT, READABLE_TITLE_LIMIT } from './readable.ts';
import { SOUND_EVENT_IDS } from './soundEvents.ts';
import {
  gameHours,
  gameMinutes,
  gamePerHour,
  gameTimeOfDay,
  simAcceleration,
  simPerMinute,
  simRate,
  simSeconds,
} from './time.ts';
import { ZOMBIE_REGION_NAMES } from './zombieRegionNames.ts';

const ID_PATTERN = /^[a-z0-9_]+$/;
const CALIBRE_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const Id = pipe(string(), regex(ID_PATTERN, 'must be lowercase letters, digits and _'));
const CalibreId = pipe(string(), regex(CALIBRE_ID_PATTERN, 'must be a cartridge-data id'));
const Name = pipe(string(), nonEmpty('must not be empty'));
const Color = pipe(string(), regex(/^#[0-9a-fA-F]{6}$/, 'expected "#rrggbb"'));
const NonNegative = pipe(number(), minValue(0, 'must be 0 or more'));
const Positive = pipe(number(), minValue(Number.MIN_VALUE, 'must be more than 0'));
const Count = pipe(number(), integer('must be a whole number'), minValue(0, 'must be 0 or more'));
const SkillLevel = pipe(
  number(),
  integer('must be a whole number'),
  minValue(SKILL_LEVEL_MIN, `must be at least ${SKILL_LEVEL_MIN}`),
  maxValue(SKILL_LEVEL_MAX, `must be at most ${SKILL_LEVEL_MAX}`),
);
const Fraction = pipe(number(), minValue(0, 'must be 0 to 1'), maxValue(1, 'must be 0 to 1'));
const skillZeroFactor = ({ min, max }: { min: number; max: number }) =>
  pipe(number(), minValue(min, `must be at least ${min}`), maxValue(max, `must be at most ${max}`));
const FirearmsSkillZeroEffectSchema = strictObject({
  variance: skillZeroFactor(FIREARMS_SKILL_ZERO_RANGES.variance),
  recoilKickScale: skillZeroFactor(FIREARMS_SKILL_ZERO_RANGES.recoilKickScale),
  recoilRecoveryScale: skillZeroFactor(FIREARMS_SKILL_ZERO_RANGES.recoilRecoveryScale),
});
const FirearmsSkillZeroHandlingSchema = strictObject({
  singleShot: FirearmsSkillZeroEffectSchema,
  automaticFollowup: FirearmsSkillZeroEffectSchema,
});
const QualityLevel = pipe(number(), integer('must be a whole number'), minValue(1), maxValue(5));
const SimSeconds = pipe(NonNegative, transform(simSeconds));
const PositiveSimSeconds = pipe(Positive, transform(simSeconds));
const SimRate = pipe(Positive, transform(simRate));
const NonNegativeSimRate = pipe(NonNegative, transform(simRate));
const SimAcceleration = pipe(Positive, transform(simAcceleration));
const SimDurationRange = strictObject({ min: PositiveSimSeconds, max: PositiveSimSeconds });
const PositiveGameHours = pipe(Positive, transform(gameHours));
const PositiveGameMinutes = pipe(Positive, transform(gameMinutes));
const GamePerHour = pipe(Positive, transform(gamePerHour));
const SimPerMinute = pipe(Positive, transform(simPerMinute));
const GameTimeOfDay = pipe(
  string(),
  regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM'),
  transform((text) => {
    const [hours, minutes] = text.split(':').map(Number);
    return gameTimeOfDay(hours! * 3600 + minutes! * 60);
  }),
);

/** An inclusive [min, max] range. */
const range = <S extends typeof Count | typeof Fraction>(item: S) =>
  pipe(
    tuple([item, item]),
    check(([min, max]) => min <= max, 'min must not be more than max'),
  );

/** [x, y, z] in blocks. */
const Size = tuple([
  pipe(Count, minValue(1, 'must be at least 1')),
  pipe(Count, minValue(1, 'must be at least 1')),
  pipe(Count, minValue(1, 'must be at least 1')),
]);

// ---- blocks ----

/**
 * Procedural surface patterns, drawn in the chunk shader. The index is the id the mesher
 * emits and the shader switches on (render/chunks.ts), so append, never reorder.
 */
export const BLOCK_PATTERNS = [
  'none',
  'brick',
  'planks',
  'cobble',
  'dressed',
  'rough',
  'tiles',
  'siding',
  'corrugated',
  'shingles',
  'noise',
] as const;

const BlockSchema = strictObject({
  id: Id,
  name: Name,
  color: Color,
  /** Blocks movement. Non-solid blocks still render as cubes for now. */
  solid: vBoolean(),
  /** Blocks sight/aim/picking; ordinary blocks inherit their movement rule when omitted. */
  opaque: optional(vBoolean()),
  /** Content-owned brushing events: gentle movement and fast movement. */
  rustle: optional(strictObject({ gentle: picklist(SOUND_EVENT_IDS), fast: picklist(SOUND_EVENT_IDS) })),
  /** Surface pattern; `none` when omitted. */
  pattern: optional(picklist(BLOCK_PATTERNS)),
});

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
  'misc',
] as const;

const WEAR_SLOTS = ['head', 'torso', 'legs', 'back', 'waist', 'hands', 'feet'] as const;

export type WearSlot = (typeof WEAR_SLOTS)[number];

const Cells = pipe(Count, minValue(1, 'must be at least 1'));

/** Width and height in inventory cells. */
const Area = tuple([Cells, Cells]);

const PocketSchema = strictObject({
  name: optional(Name),
  /** Its grid: the only limit on what fits (DESIGN.md, "The item model"). */
  grid: Area,
  /** Sim seconds to take an item out or put one in, before the per-cell part. */
  handlingSimSeconds: SimSeconds,
});

const ContainerSchema = strictObject({ pockets: pipe(array(PocketSchema), nonEmpty('needs at least one pocket')) });

const WearableSchema = strictObject({
  slot: picklist(WEAR_SLOTS),
  /** 0–100: how much it slows and hampers you. */
  encumbrance: pipe(NonNegative, maxValue(100, 'must be 0 to 100')),
  warmth: optional(pipe(NonNegative, maxValue(100, 'must be 0 to 100'))),
  wearPerHit: optional(Fraction),
});

const FoodSchema = strictObject({
  /** Kilocalories. */
  calories: NonNegative,
  /** Millilitres of water it gives. */
  water: NonNegative,
  /** Game hours until it spoils; absent means it keeps. */
  rotsAfterGameHours: optional(PositiveGameHours),
});

const ToolSchema = strictObject({
  /** Quality levels, such as { "prying": 2 }. */
  qualities: record(Id, QualityLevel),
});

const WeaponSchema = strictObject({
  melee: strictObject({
    damage: Positive,
    /** Metres beyond the player's hand; the arm's reach is added when swinging. */
    reach: Positive,
    /** Sim seconds between swings. */
    cooldownSimSeconds: PositiveSimSeconds,
    stamina: NonNegative,
    /** Impulse delivered by a melee hit, in N·s. */
    impulse: optional(NonNegative),
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
    type: picklist(['blunt', 'cut', 'pierce']),
  }),
});

const MeleeClassSchema = strictObject({
  id: picklist(['blunt', 'cut', 'pierce']),
  /** Fractional spread applied symmetrically around base weapon damage. */
  damageVariance: Fraction,
  headDamageMultiplier: Positive,
  limbDamageMultiplier: Positive,
  /** Multiplies swing speed; cooldown is divided by this value. */
  speedMultiplier: Positive,
});

// A pump feeds item-owned shells from its exported tube; other firearms feed from a fitted magazine (`magazineWellCalibre`).
const FirearmSchema = strictObject({
  pump: optional(vBoolean()),
  /** Camera-local aim kick per committed shot, scaled by firearms control. */
  recoilKickRadians: Positive,
  /** Half-angle of the firearm's independent per-round cone; pump firearms must set zero because pellet spread owns their cone. */
  dispersionRadians: pipe(NonNegative, maxValue(Math.PI / 2, 'must be at most a right angle')),
  /** Optional per-gun skill-zero endpoints; absent guns use firearms-combat's shared factors. */
  skillZeroHandling: optional(FirearmsSkillZeroHandlingSchema),
});
/** Per projectile (one rifle bullet, or each pellet); damage, push and reach are gameplay estimates, not ballistics. */
const AmmoSchema = strictObject({
  calibre: CalibreId,
  pellets: pipe(Count, minValue(1), maxValue(64)),
  diameterMm: Positive,
  /** Region health a projectile takes, before the zombie's per-region pierce resistance. */
  damage: Positive,
  /** Push in N·s on the struck body. */
  impulse: Positive,
  /** Hitscan reach. */
  rangeMetres: Positive,
  /** Scales `damage` on a head hit; absent means 1. */
  headDamageMultiplier: optional(Positive),
});

const LightSchema = strictObject({
  /** Metres it lights up. */
  radius: Positive,
  /** Metres from which others can see it (DESIGN.md, "Light"). */
  seenFrom: Positive,
  /** Point-light colour and candela; both are presentation-owned content. */
  color: Color,
  intensity: Positive,
  /** Material glow for sources that remain visible when outside the point-light pool. */
  emissive: optional(NonNegative),
  /** Total burn in Game hours for a consumable flame/light. */
  burnTimeGameHours: optional(PositiveGameHours),
  /** Fuel units consumed per Game hour, for self-fueled sources such as a lighter. */
  fuelPerGameHour: optional(GamePerHour),
  /** A cone of this many degrees; absent means light all around. */
  beam: optional(pipe(Positive, maxValue(180, 'must be at most 180'))),
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
  /** What powers it: an item with a battery component, and charge used per Game hour. */
  power: optional(strictObject({ battery: Id, chargePerGameHour: GamePerHour })),
});

const IgniterSchema = strictObject({ capacity: Positive, perIgnition: Positive });

const BatterySchema = strictObject({
  /** Charge when full, in the units lights use per hour. */
  capacity: Positive,
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
const ReadableSchema = strictObject({
  title: readableText(READABLE_TITLE_LIMIT),
  text: readableText(READABLE_TEXT_LIMIT),
});

const ItemCountSchema = strictObject({ item: Id, count: pipe(Count, minValue(1, 'must be at least 1')) });
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
const DisassemblyYieldSchema = strictObject({
  ...ItemCountSchema.entries,
  /** Multiplier by skill level: index 0 is skill 0; the last entry is this yield's top level. */
  fractions: SkillFractions,
  /** Applied independently to this yield's scaled count. */
  rounding: YieldRounding,
  toolModifier: optional(
    strictObject({
      quality: Id,
      /** Additions by tool quality level: index 0 is level 1; higher levels saturate at the last entry. */
      bonusByLevel: ToolFractionBonus,
    }),
  ),
});
const DisassemblySchema = strictObject({
  /** Game minutes. */
  timeGameMinutes: PositiveGameMinutes,
  skill: Id,
  yields: pipe(array(DisassemblyYieldSchema), nonEmpty('needs at least one yield')),
});

const ItemSchema = strictObject({
  id: Id,
  name: Name,
  category: picklist(ITEM_CATEGORIES),
  weight: NonNegative,
  /** Cells it takes in a grid, as [w, h]; it can be rotated. */
  size: Area,
  description: optional(string()),
  /** Identical, stateless instances stack, up to this many (nails, batteries). */
  stack: optional(pipe(Count, minValue(2, 'must be at least 2'))),
  /** Held in both hands. */
  twoHanded: optional(vBoolean()),
  container: optional(ContainerSchema),
  wearable: optional(WearableSchema),
  food: optional(FoodSchema),
  /** An item that applies a named treatment to one body wound. */
  treatment: optional(picklist(['bandage', 'rag', 'antiseptic', 'antibiotics'])),
  tool: optional(ToolSchema),
  weapon: optional(WeaponSchema),
  firearm: optional(FirearmSchema),
  ammo: optional(AmmoSchema),
  /** Sealed, non-container payload: held primary activation opens one package. */
  unpack: optional(strictObject({ item: Id, count: pipe(Count, minValue(1, 'must be at least 1')) })),
  /** An authored yield for a finished item; never inferred from recipe alternatives. */
  disassembly: optional(DisassemblySchema),
  /** Fixed outputs for found items with no recipe. */
  salvage: optional(pipe(array(ItemCountSchema), nonEmpty('needs at least one salvage output'))),
  light: optional(LightSchema),
  igniter: optional(IgniterSchema),
  readable: optional(ReadableSchema),
  /** Display capability shown in first person; later devices can share this rendering seam. */
  heldDisplay: optional(picklist(HELD_DISPLAY_KINDS)),
  /** How the item appears when it is in a ground pile. */
  pileDisplay: optional(picklist(PILE_DISPLAY_KINDS)),
  book: optional(BookSchema),
  battery: optional(BatterySchema),
  /** One authored/global lock id; no per-placement key payload. */
  key: optional(strictObject({ lock: Id })),
  /** Its model (the `models` section); without one it's a bundle in a pile and a box in the hand. */
  model: optional(Id),
});

// ---- models ----

/** [x, y, z] in the model file's metres. */
const Point = tuple([number(), number(), number()]);

/**
 * A glTF binary in the pack, in metres, lying at rest on the ground with its long side
 * along x (DESIGN.md, "Item models"). The entry adds what the file can't say.
 */
const SoundMultipliers = pipe(
  tuple([Positive, Positive]),
  check(([min, max]) => min <= max, 'minimum must not exceed maximum'),
);

const SoundSchema = strictObject({
  id: Id,
  variants: pipe(
    array(pipe(string(), regex(/^assets\/audio\/[a-z0-9_.-]+\.ogg$/, 'expected an Ogg file under assets/audio/'))),
    nonEmpty('needs at least one variant'),
  ),
  gain: pipe(Positive, maxValue(1, 'must be at most 1')),
  pitchJitter: SoundMultipliers,
  gainJitter: SoundMultipliers,
  minIntervalSimSeconds: SimSeconds,
  category: picklist(['world', 'body', 'ui']),
  noise: strictObject({ enabled: vBoolean(), radiusMetres: Positive }),
  wall: optional(
    strictObject({
      gain: pipe(NonNegative, maxValue(1, 'must be at most 1')),
      cutoffHz: Positive,
    }),
  ),
});

const UnitVector = pipe(
  Point,
  check(([x, y, z]) => Math.abs(Math.hypot(x, y, z) - 1) <= 1e-6, 'must be a unit vector'),
);

const ActionCycleSchema = pipe(
  strictObject({
    durationSimSeconds: PositiveSimSeconds,
    rearwardSimSeconds: PositiveSimSeconds,
    dwellSimSeconds: SimSeconds,
    forwardSimSeconds: PositiveSimSeconds,
  }),
  check(
    (cycle) =>
      cycle.rearwardSimSeconds + cycle.dwellSimSeconds + cycle.forwardSimSeconds <= cycle.durationSimSeconds + 1e-9,
    'cycle phases must fit within durationSimSeconds',
  ),
);

const ActionPartSchema = strictObject({
  /** Exact GLB node name, e.g. `bolt-carrier:bolt-carrier`. */
  node: pipe(string(), nonEmpty('must not be empty')),
  axis: UnitVector,
  strokeMetres: Positive,
  /** References shared timelines; modes not listed keep this node at home. */
  modes: pipe(
    array(picklist(['fire', 'hand'])),
    nonEmpty('needs at least one cycle mode'),
    check((modes) => new Set(modes).size === modes.length, 'cycle modes must be distinct'),
  ),
});

const ActionSchema = pipe(
  strictObject({
    parts: pipe(
      record(Id, ActionPartSchema),
      check((parts) => Object.keys(parts).length > 0, 'needs at least one moving part'),
    ),
    fire: optional(ActionCycleSchema),
    hand: ActionCycleSchema,
    ejectAt: Fraction,
    /** Unit direction vector in the exported model frame. */
    ejectDirection: UnitVector,
    holdOpen: vBoolean(),
    /** Cyclic rate in rounds per Sim minute. */
    roundsPerSimMinute: optional(SimPerMinute),
  }),
  check(
    (action) => Object.values(action.parts).every((part) => part.modes.every((mode) => action[mode] !== undefined)),
    'moving part modes must reference a declared timeline',
  ),
  check(
    (action) => (action.fire === undefined) === (action.roundsPerSimMinute === undefined),
    'only an automatic fire timeline has a cyclic rpm',
  ),
);

const MagazineRoundSchema = strictObject({
  /** Centre in metres in the magazine model frame (+x forward, +y up, +z right). */
  at: Point,
  /** Degrees about +z; nose-up is positive. */
  tilt: number(),
});

const MagazineCapacity = pipe(number(), integer('must be a whole number'), minValue(1, 'must be at least 1'));
const AttachmentPropertiesSchema = strictObject({
  magnification: optional(
    pipe(
      strictObject({ min: Positive, max: Positive }),
      check(({ min, max }) => max >= min, 'maximum magnification cannot be below minimum'),
    ),
  ),
  reticleKind: optional(picklist(['dot', 'crosshair', 'chevron'])),
  noiseFactor: optional(Fraction),
  wearClass: optional(picklist(['real', 'improvised'])),
  handlingClass: optional(pipe(string(), nonEmpty('must not be empty'))),
  railSpanNotches: optional(
    pipe(
      strictObject({
        minOffset: pipe(number(), integer('must be a whole number')),
        maxOffset: pipe(number(), integer('must be a whole number')),
      }),
      check(({ minOffset, maxOffset }) => minOffset <= maxOffset, 'maximum notch offset cannot be below minimum'),
    ),
  ),
});
const AttachmentSightSchema = strictObject({
  kind: picklist(['optic', 'iron']),
  eye: Point,
  direction: UnitVector,
  up: UnitVector,
  eyeReliefMetres: Positive,
  ocularDiameterMetres: optional(Positive),
});
const AttachmentFieldsSchema = strictObject({
  id: pipe(string(), nonEmpty('must not be empty')),
  kind: picklist(['optic', 'iron-sight', 'suppressor', 'flashlight-mount', 'foregrip']),
  mount: picklist(['rail-top', 'rail-side', 'rail-bottom', 'muzzle']),
  massKg: Positive,
  properties: AttachmentPropertiesSchema,
  sight: optional(AttachmentSightSchema),
});
const attachmentSpanMatchesMount = ({ mount, properties }: InferOutput<typeof AttachmentFieldsSchema>): boolean =>
  mount === 'muzzle' ? properties.railSpanNotches === undefined : properties.railSpanNotches !== undefined;
const attachmentSpanCheck = check(
  attachmentSpanMatchesMount,
  'rail attachments need a notch span and muzzle attachments cannot have one',
);
const AttachmentSchema = pipe(AttachmentFieldsSchema, attachmentSpanCheck);
const FittedAttachmentSchema = pipe(
  strictObject({
    ...AttachmentFieldsSchema.entries,
    node: pipe(string(), nonEmpty('must not be empty')),
    mountedAt: pipe(string(), nonEmpty('must not be empty')),
  }),
  check(
    (value) => attachmentSpanMatchesMount(value),
    'rail attachments need a notch span and muzzle attachments cannot have one',
  ),
);
const AttachmentSlotSchema = pipe(
  strictObject({
    id: pipe(string(), nonEmpty('must not be empty')),
    mount: picklist(['rail-top', 'rail-side', 'rail-bottom', 'muzzle']),
    position: Point,
    direction: UnitVector,
    up: UnitVector,
    railId: optional(pipe(string(), nonEmpty('must not be empty'))),
    notchIndex: optional(pipe(number(), integer('must be a whole number'), minValue(0, 'must be non-negative'))),
  }),
  check(
    ({ mount, railId, notchIndex }) =>
      mount === 'muzzle'
        ? railId === undefined && notchIndex === undefined
        : railId !== undefined && notchIndex !== undefined,
    'rail slots need railId and notchIndex; muzzle interfaces cannot have them',
  ),
);
const AttachmentCompatibilityChoiceSchema = tuple([
  pipe(string(), nonEmpty('must not be empty')),
  pipe(string(), nonEmpty('must not be empty')),
]);
const AttachmentCompatibilityPairSchema = tuple([
  AttachmentCompatibilityChoiceSchema,
  AttachmentCompatibilityChoiceSchema,
]);
const ModelMagazineSlotSchema = strictObject({
  node: pipe(string(), nonEmpty('must not be empty')),
  at: Point,
  turn: Point,
});

const attachmentRangesDoNotOverlap = (
  attachments: readonly InferOutput<typeof FittedAttachmentSchema>[],
  slots: readonly InferOutput<typeof AttachmentSlotSchema>[],
): boolean => {
  const ranges = attachments.flatMap(({ mountedAt, properties }) => {
    const slot = slots.find(({ id }) => id === mountedAt);
    const span = properties.railSpanNotches;
    return slot?.railId !== undefined && slot.notchIndex !== undefined && span
      ? [{ railId: slot.railId, min: slot.notchIndex + span.minOffset, max: slot.notchIndex + span.maxOffset }]
      : [];
  });
  return ranges.every((a, index) =>
    ranges.slice(index + 1).every((b) => a.railId !== b.railId || a.max < b.min || b.max < a.min),
  );
};

const ModelSchema = pipe(
  strictObject({
    id: Id,
    /** The `.glb` file, as a path within the pack. */
    file: pipe(string(), regex(/^assets\/models\/[a-z0-9_-]+\.glb$/, 'expected "assets/models/<name>.glb"')),
    /** Cartridge-data id (not a display designation); punctuation is normalized only in model slugs. */
    calibre: optional(CalibreId),
    /** Full magazine capacity and one centre/tilt pose per round, ordered top to bottom. */
    capacity: optional(MagazineCapacity),
    /** Integral tube, loaded singly through anchors.loading_port; no box round-pose column. */
    tube: optional(strictObject({ capacity: MagazineCapacity })),
    rounds: optional(array(MagazineRoundSchema)),
    /**
     * Where the hand holds it, and how it's turned there (degrees about x, y and z, in
     * that order). Held, the model's +x points forward and +y up.
     */
    grip: optional(strictObject({ at: Point, turn: optional(Point) })),
    /** Held with its long axis aimed forward or upright, grip at the origin. */
    hold: optional(picklist(['forward', 'upright'])),
    /** Degrees to roll around the model's long +x axis before applying the hold pose. */
    roll: optional(pipe(number(), minValue(-180), maxValue(180))),
    /** Named points used by presentation that are not represented by replaceable item slots. */
    anchors: optional(record(Id, Point)),
    /** Replaceable model parts and the gun-side mount frames for later fitting. */
    attachments: optional(array(FittedAttachmentSchema)),
    attachmentSlots: optional(array(AttachmentSlotSchema)),
    /** Complete per-slot allowlist certified by gungen; absence denies dynamic fitting. */
    compatibility: optional(
      record(pipe(string(), nonEmpty('must not be empty')), array(pipe(string(), nonEmpty('must not be empty')))),
    ),
    /** Complete pairwise allowlist; each tuple is [slot ID, attachment ID], absence denies pairs. */
    compatibilityPairs: optional(array(AttachmentCompatibilityPairSchema)),
    /** Exact baked GLB node and replacement transform for each item-owned model slot. */
    slots: optional(strictObject({ magazine: optional(ModelMagazineSlotSchema) })),
    /** Static model metadata for an attachment exported as its own item asset. */
    attachment: optional(AttachmentSchema),
    /** Model-derived eye point, sight line and up axis for ADS presentation and ballistics. */
    sight: optional(
      strictObject({
        kind: picklist(['iron', 'optic']),
        eye: Point,
        eyeReliefMetres: NonNegative,
        ocularDiameterMetres: optional(Positive),
        direction: UnitVector,
        up: UnitVector,
      }),
    ),
    /** Unit barrel direction in the same local model frame as anchors. */
    muzzleDirection: optional(UnitVector),
    /** Optional estimated action cycles and the named moving GLB nodes. */
    action: optional(ActionSchema),
    /**
     * Where the charging handle sits around the bore: degrees from the top of the receiver toward the gun's right
     * (+z). A rack rolls the gun toward the off hand, further when the handle is on the far side (DESIGN.md, "Rifles
     * (3.2, d114)"). Hand-authored: the export does not carry it.
     */
    chargingHandleDegrees: optional(pipe(number(), minValue(-180), maxValue(180))),
  }),
  check(
    ({ calibre, capacity, rounds }) =>
      capacity === undefined && rounds === undefined
        ? true
        : calibre !== undefined && capacity !== undefined && rounds !== undefined && rounds.length === capacity,
    'magazine metadata needs calibre, capacity, and one round pose per capacity slot',
  ),
  check(
    ({ attachments, attachmentSlots }) =>
      attachments === undefined ||
      (attachmentSlots !== undefined &&
        new Set(attachments.map(({ mountedAt }) => mountedAt)).size === attachments.length &&
        attachments.every(({ mountedAt, mount }) =>
          attachmentSlots.some((slot) => slot.id === mountedAt && slot.mount === mount),
        ) &&
        attachmentRangesDoNotOverlap(attachments, attachmentSlots)),
    'fitted attachments need unique matching mount slots and non-overlapping rail spans',
  ),
  check(
    ({ sight }) => sight?.kind !== 'optic' || sight.ocularDiameterMetres !== undefined,
    'optic sight metadata needs an ocular opening diameter',
  ),
  check(
    ({ tube, calibre, anchors, capacity, rounds }) =>
      tube === undefined ||
      (calibre !== undefined && anchors?.loading_port !== undefined && capacity === undefined && rounds === undefined),
    'tube metadata needs calibre/loading_port and cannot carry a box round column',
  ),
);

// ---- furniture ----

const DoorPryingSchema = pipe(
  strictObject({
    /** Minimum tool quality needed to force the door's lock. */
    quality: QualityLevel,
    /** Skill whose level shortens prying time. */
    skill: Id,
    /** Sim seconds of work at the lowest skill level. */
    timeSimSeconds: PositiveSimSeconds,
    /** Sim seconds of work at the fastest skill level. */
    fastestTimeSimSeconds: PositiveSimSeconds,
    /** Sim seconds between noisy strikes at the lowest skill level. */
    strikeIntervalSimSeconds: PositiveSimSeconds,
  }),
  check(
    ({ timeSimSeconds, fastestTimeSimSeconds }) => fastestTimeSimSeconds <= timeSimSeconds,
    'fastest prying time cannot exceed the base time',
  ),
);

const FurnitureSchema = strictObject({
  id: Id,
  name: Name,
  /** Cells, in blocks: [x, y, z]. It's anchored at its lowest corner. */
  size: Size,
  color: Color,
  solid: optional(vBoolean()),
  /** A debug practice surface; hits may receive a profile-specific presentation ping. */
  shotTarget: optional(literal(true)),
  readable: optional(ReadableSchema),
  container: optional(ContainerSchema),
  /** The loot table rolled into its container when the chunk generates. */
  loot: optional(Id),
  /** It opens and closes, taking this many Sim seconds. */
  door: optional(
    strictObject({
      handlingSimSeconds: SimSeconds,
      prying: optional(DoorPryingSchema),
      openNoise: optional(strictObject({ sound: picklist([...SOUND_EVENT_IDS]) })),
    }),
  ),
  /** Comfort scales fatigue recovery; sleepable pieces also enable the sleep rate. */
  rest: optional(strictObject({ quality: Fraction, sleep: optional(literal(true)) })),
  /** A station available to matching recipes within reach; bonus is the fraction removed from work time. */
  workstation: optional(
    strictObject({
      id: Id,
      qualities: record(Id, QualityLevel),
      workFactorBonus: Fraction,
    }),
  ),
});

// ---- loot tables ----

const LootEntrySchema = pipe(
  strictObject({
    weight: Positive,
    item: optional(Id),
    table: optional(Id),
    nothing: optional(vBoolean()),
    /** How many of the item, inclusive. */
    count: optional(range(Count)),
    /** Condition of the item, 0 (broken) to 1 (new), inclusive. */
    condition: optional(range(Fraction)),
  }),
  check(
    (e) => [e.item, e.table, e.nothing].filter((x) => x !== undefined).length === 1,
    'needs exactly one of "item", "table" or "nothing"',
  ),
);

const LootTableSchema = strictObject({
  id: Id,
  /** Military supply: the only tables that may hold military-only items or nest another military table. */
  military: optional(vBoolean()),
  /** How many times to roll, inclusive. */
  rolls: range(Count),
  entries: pipe(array(LootEntrySchema), nonEmpty('needs at least one entry')),
});

// ---- templates ----

const Char = pipe(string(), regex(/^.$/u, 'palette keys are single characters'));

const DoorLockSchema = strictObject({ id: Id, locked: vBoolean() });
const SpawnTime = pipe(
  string(),
  check((value) => parseSpawnTime(value) !== undefined, 'expected a named game time or HH:MM'),
  transform((value) => gameTimeOfDay(parseSpawnTime(value)!)),
);
const SpawnWindowSchema = pipe(
  strictObject({ fromGameTimeOfDay: SpawnTime, toGameTimeOfDay: optional(SpawnTime) }),
  check(
    ({ fromGameTimeOfDay, toGameTimeOfDay }) => toGameTimeOfDay === undefined || fromGameTimeOfDay !== toGameTimeOfDay,
    'from and to must differ',
  ),
);

/** A palette entry that isn't a plain block: furniture or a spawn point. */
const PaletteThingSchema = pipe(
  strictObject({
    furniture: optional(Id),
    /** Overrides the furniture's own loot table. */
    loot: optional(Id),
    facing: optional(picklist(['n', 'e', 's', 'w'])),
    /** Initial lock state, only on a door; ids are unique within an authored site. */
    lock: optional(DoorLockSchema),
    /** A zombie type that may stand here; the cell itself is air. */
    spawn: optional(Id),
    chance: optional(Fraction),
    /** Daily game-clock window; omitted markers spawn when their column loads. */
    window: optional(SpawnWindowSchema),
  }),
  check((e) => (e.furniture === undefined) !== (e.spawn === undefined), 'needs exactly one of "furniture" or "spawn"'),
  check((e) => e.spawn !== undefined || e.window === undefined, '"window" only goes with "spawn"'),
  check(
    (e) => e.furniture !== undefined || (e.loot === undefined && e.facing === undefined && e.lock === undefined),
    '"loot", "facing" and "lock" only go with "furniture"',
  ),
  check((e) => e.spawn !== undefined || e.chance === undefined, '"chance" only goes with "spawn"'),
);

/** Template-local block coordinates; horizontal half cells permit centred, two-cell-wide landings. */
const CellCoordinate = pipe(
  number(),
  check((v) => Number.isFinite(v) && Number.isInteger(v * 2), 'must be on the half-cell grid'),
);
const CellPosition = tuple([CellCoordinate, Count, CellCoordinate]);
const StairSchema = strictObject({
  from: Id,
  to: Id,
  lower: CellPosition,
  upper: CellPosition,
  width: pipe(Count, minValue(2)),
  block: Id,
});
const TemplateAccessSchema = strictObject({
  ground: Id,
  entrance: CellPosition,
  storeys: pipe(array(strictObject({ id: Id, floor: Count })), nonEmpty()),
  stairs: array(StairSchema),
});

const TemplateSchema = strictObject({
  id: Id,
  /** Blocks: [x, y, z]. */
  size: Size,
  /** What each character means: a block id ("air" for empty), or furniture or a spawn point. */
  palette: record(Char, union([Id, PaletteThingSchema])),
  /** Layers from the bottom up; each is rows along z of characters along x. */
  layers: array(array(string())),
  /** Explicit floors and flights, never stress-test repetitions. Floor heights are feet heights in blocks. */
  access: optional(TemplateAccessSchema),
});

// ---- authored site layouts (metres, independent of chunk/block order) ----

const Metres = pipe(
  number(),
  check((value) => Number.isFinite(value), 'must be finite'),
);
const Degrees = pipe(
  number(),
  check((value) => Number.isFinite(value), 'must be finite'),
);
const HalfMetres = pipe(
  Metres,
  check((v) => Number.isInteger(v * 2), 'must be snapped to 0.5 m'),
);
const MetrePosition = tuple([Metres, Metres, Metres]);
const LayoutPoint = tuple([Metres, Metres]); // [x, z]; Tiled's pixel y becomes world z.
const PositiveMetres = pipe(Metres, minValue(Number.MIN_VALUE));
const TerrainPrimitive = union([
  strictObject({
    kind: literal('ridge'),
    points: pipe(
      array(LayoutPoint),
      minLength(2),
      check((points) => hasSegment(points), 'ridge needs a non-zero segment'),
    ),
    rise: PositiveMetres,
    width: PositiveMetres,
  }),
  strictObject({
    kind: literal('hill'),
    centre: LayoutPoint,
    radii: tuple([PositiveMetres, PositiveMetres]),
    rise: PositiveMetres,
  }),
]);
const FixedLootItem = strictObject({
  item: Id,
  count: optional(pipe(Count, minValue(1))),
  condition: optional(Fraction),
});
const FixedLootOverride = strictObject({
  /** Template-local furniture anchor in half-metre block cells. */
  at: tuple([Count, Count, Count]),
  items: pipe(array(FixedLootItem), nonEmpty('needs at least one fixed item')),
});
const LayoutBuilding = strictObject({
  template: Id,
  position: tuple([HalfMetres, HalfMetres, HalfMetres]),
  rotation: picklist([0, 90, 180, 270], 'rotation must be a quarter turn'),
  storeys: optional(pipe(Count, minValue(1), maxValue(8))),
  fixedLoot: optional(array(FixedLootOverride)),
});

const SiteLayoutSchema = strictObject({
  id: Id,
  /** Fixture and showcase layouts are not world sources; unmarked authored layouts contribute building containers and fixed loot. */
  demo: optional(vBoolean()),
  bounds: pipe(
    strictObject({ x0: Metres, z0: Metres, x1: Metres, z1: Metres }),
    check((r) => r.x0 < r.x1 && r.z0 < r.z1, 'bounds must have positive area'),
  ),
  /** Foundation elevation: lower face of the top ground block, in metres. */
  ground: HalfMetres,
  /** Calendar time on day 1 when this site is selected without an explicit ?time=. */
  startTimeGameTimeOfDay: optional(GameTimeOfDay),
  terrain: array(TerrainPrimitive),
  buildings: array(LayoutBuilding),
  player: strictObject({
    position: MetrePosition,
    /** Clockwise degrees from WORLD_NORTH; converted to camera yaw only at startup. */
    bearing: Degrees,
  }),
  shamblers: array(
    strictObject({
      type: Id,
      position: MetrePosition,
      chance: optional(Fraction),
      window: optional(SpawnWindowSchema),
    }),
  ),
  woodlands: array(strictObject({ polygon: pipe(array(LayoutPoint), minLength(3)), density: Fraction })),
  tracks: array(
    strictObject({
      points: pipe(array(LayoutPoint), minLength(2)),
      width: pipe(Metres, minValue(Number.MIN_VALUE)),
      surface: optional(picklist(['dirt', 'asphalt'])),
    }),
  ),
});

// ---- zombies ----

export type ShamblerHitRegion = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export type ZombieRegion = ShamblerHitRegion;
export type ZombieHitRegion = ZombieRegion | 'core.trunk' | `member.${number}.${ShamblerHitRegion}`;
export type ZombieRegions = Record<string, number>;

const AMALGAM_REGION_KEYS = ['core.trunk', ...ZOMBIE_REGION_NAMES.map((region) => `member.${region}`)];

const ZOMBIE_MODEL = picklist(['shambler', 'runner', 'amalgam']);

const ZOMBIE_ABILITIES = [
  'grab',
  'leap',
  'scream',
  'explode',
  'acidSpit',
  'heatAura',
  'lightEmitter',
  'armoured',
  'regenerate',
  'burrow',
] as const;

const MeleeDamageResistanceSchema = strictObject({
  head: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  torso: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  leftArm: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  rightArm: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  leftLeg: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  rightLeg: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
});

const ZombieSchema = strictObject({
  id: Id,
  name: Name,
  /** Mobgen template selected for this type's silhouette and posed hit regions. */
  model: ZOMBIE_MODEL,
  /** Uniform scale for this model's realized body, in addition to the mobgen template's dimensions. */
  bodyScale: optional(Positive),
  /** Health keyed by hit-region id; ordinary shamblers use six anatomy keys, amalgams use manifest ids. */
  regions: record(pipe(string(), nonEmpty('must not be empty')), Positive),
  /** Relative chance that an ordinary hamlet spawn chooses this type; 1 is the common baseline. */
  spawnWeight: pipe(Positive, maxValue(1, 'must be at most 1')),
  /** Excludes debug fixtures from ordinary hamlet selection while keeping authored/debug spawns available. */
  debugOnly: optional(vBoolean()),
  sounds: strictObject({
    idle: picklist(SOUND_EVENT_IDS),
    alert: picklist(SOUND_EVENT_IDS),
    attack: picklist(SOUND_EVENT_IDS),
    hurt: picklist(SOUND_EVENT_IDS),
  }),
  /** Fraction of each melee damage type resisted by each region; omitted entries are neutral. */
  meleeDamageResistance: optional(MeleeDamageResistanceSchema),
  /** Metres per Sim second. */
  speed: strictObject({ wanderMetresPerSimSecond: SimRate, chaseMetresPerSimSecond: SimRate }),
  /** Metres advanced by one half-cycle of the leg gait. */
  stepLength: Positive,
  /** Metres by day. */
  sight: Positive,
  /** Metres by night. */
  nightSight: Positive,
  /** Sim seconds before a heard or seen stimulus is forgotten. */
  stimulusMemorySimSeconds: Positive,
  /** Half-angle of the sight cone, in degrees. */
  sightCone: pipe(Positive, maxValue(180, 'must be at most 180')),
  /** Idle/stroll timing, home leash and eased look controls. */
  wander: strictObject({
    obstacleWanderChance: Fraction,
    obstacleWanderDistanceMetres: Positive,
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
      searchSimSeconds: SimDurationRange,
      searchRadiusMetres: Positive,
      searchStrollSimSeconds: SimDurationRange,
    }),
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
      damage: Positive,
      reach: Positive,
      cooldownSimSeconds: PositiveSimSeconds,
      windupSimSeconds: PositiveSimSeconds,
      hitRegion: optional(picklist(['torso', 'legs'])),
    }),
    check((attack) => attack.windupSimSeconds < attack.cooldownSimSeconds, 'windup must be less than cooldown'),
  ),
  /** Per-hit chance of severing a random not-yet-severed arm part (src/core/zombies.ts's swing); a
   * killing blow additionally rolls headOnKillChance to sever the head too. Both independent 0..1 chances,
   * not a shared budget. */
  dismember: strictObject({ chance: Fraction, headOnKillChance: Fraction }),
  abilities: array(picklist(ZOMBIE_ABILITIES)),
  /** What's in its pockets. */
  loot: optional(Id),
});

const zombieRegionsMatchModel = (zombie: InferOutput<typeof ZombieSchema>): boolean => {
  const expected = zombie.model === 'amalgam' ? AMALGAM_REGION_KEYS : ZOMBIE_REGION_NAMES;
  const keys = Object.keys(zombie.regions);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(zombie.regions, key));
};

/** Actor palettes are content so appearance doesn't live in renderer code. */
const FigureSchema = strictObject({
  id: Id,
  palette: strictObject({ skin: Color, shirt: Color, trousers: Color }),
});

// ---- skills and recipes ----

const SkillSchema = pipe(
  strictObject({
    id: Id,
    name: Name,
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
                tier: SkillLevel,
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
    combat: optional(
      strictObject({
        firearms: optional(
          strictObject({
            raiseMinimumSimSeconds: PositiveSimSeconds,
            raiseRangeSimSeconds: SimSeconds,
            raiseHalfLifeLevels: Positive,
            readyMovementMinimum: Fraction,
            readyMovementRange: Fraction,
            readyMovementHalfLifeLevels: Positive,
            loweredPitchRadians: pipe(NonNegative, maxValue(Math.PI / 2)),
            adsApertureFill: pipe(Positive, maxValue(0.95)),
            skillZeroHandling: FirearmsSkillZeroHandlingSchema,
            wobbleSkillTenVariance: pipe(Positive, maxValue(100)),
            wobbleLimitRadians: pipe(Positive, maxValue(Math.PI / 2)),
            wobbleVerticalToHorizontalRatio: pipe(Positive, maxValue(1)),
            wobbleLuneArchPower: pipe(Positive, maxValue(4)),
            wobbleLunePhaseOffsetRadians: pipe(NonNegative, maxValue(0.45)),
            wobbleJitterShare: Fraction,
            wobbleJitterAmplitudeFraction: pipe(Positive, maxValue(1)),
            reloadFactorFloor: Fraction,
            reloadFactorHalfLifeLevels: Positive,
            rackFactorFloor: Fraction,
            rackFactorHalfLifeLevels: Positive,
          }),
        ),
        melee: optional(
          strictObject({
            blockChanceMinimum: Fraction,
            blockChanceRange: Fraction,
            blockChanceHalfLifeLevels: Positive,
          }),
        ),
      }),
    ),
  }),
  check(({ training, id, combat }) => {
    const activity = (activityId: string, field: 'practice' | 'practicePerSimSecond') =>
      training?.activities?.[activityId]?.[field] !== undefined;
    const complete =
      (id !== 'crafting' || training?.craftingTierOffset !== undefined) &&
      (id !== 'firearms_combat' ||
        (combat?.firearms !== undefined &&
          activity('readying', 'practicePerSimSecond') &&
          activity('handling', 'practice') &&
          activity('shot', 'practice') &&
          activity('hit', 'practice'))) &&
      (id !== 'melee_combat' || (combat?.melee !== undefined && activity('block', 'practice')));
    const firearm = combat?.firearms;
    const melee = combat?.melee;
    return (
      complete &&
      (!firearm || firearm.readyMovementMinimum + firearm.readyMovementRange <= 1) &&
      (!melee || melee.blockChanceMinimum + melee.blockChanceRange <= 1)
    );
  }, 'missing required skill tuning or effect range exceeds one'),
);
const SenseSchema = strictObject({
  id: Id,
  crouch: strictObject({
    speedMetresPerSimSecond: SimRate,
    hearingRangeScale: Fraction,
    sightRangeScale: Fraction,
    eyeDropMetres: Positive,
  }),
  wall: strictObject({
    hearingRangeScale: Fraction,
    gain: Fraction,
    cutoffHz: Positive,
    clearGain: Fraction,
    clearCutoffHz: Positive,
  }),
  light: strictObject({
    playerDaySightScale: Fraction,
    /** Reduce how far shamblers investigate non-player light sources. */
    lureRangeScale: Fraction,
    throwMaxDistanceMetres: Positive,
    throwChargeSimSeconds: PositiveSimSeconds,
    throwMinimumHoldSimSeconds: PositiveSimSeconds,
    throwArmSpeedMetresPerRealSecond: Positive,
    throwArmEnergyJoules: Positive,
  }),
});
const RecipeItemSchema = ItemCountSchema;

/** Counts are whole items, never millilitres; no partial-liquid storage contract exists yet. */
const BodyTuningSchema = strictObject({
  id: Id,
  /** Game hours after a bleeding wound before an at-risk infection becomes early. */
  infectionOnsetGameHours: PositiveGameHours,
  /** Game hours the early infection stage remains treatable with antiseptic. */
  antisepticWindowGameHours: PositiveGameHours,
  infectionChance: Fraction,
  /** Sim seconds that the player remains unconscious. */
  knockoutSimSeconds: PositiveSimSeconds,
  /** Sim seconds to wait after stamina reaches zero before recovery begins. */
  staminaRegenDelaySimSeconds: PositiveSimSeconds,
  /** Player eye height in metres while unconscious and prone. */
  proneEyeHeightMetres: Positive,
  /** Blunt-force shock damage per point of health damage. */
  bluntShockPerDamage: Positive,
  /** Sim seconds required to apply wound treatment. */
  treatmentSimSeconds: PositiveSimSeconds,
  /** Shock restored when the player wakes, on a 0–100 scale. */
  wakeShock: pipe(
    Positive,
    check((value) => value < 100, 'must be below 100'),
  ),
  /** Blood lost per Sim second while a wound bleeds. */
  bloodLossPerSimSecond: SimRate,
  /** Blood recovered per Sim second when no wound bleeds. */
  bloodRecoveryPerSimSecond: SimRate,
  /** Shock recovered per Sim second outside a knockout. */
  shockRecoveryPerSimSecond: SimRate,
  /** Health lost per Sim second while infection is advanced. */
  advancedInfectionHealthLossPerSimSecond: SimRate,
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
});

const RecipeSchema = strictObject({
  id: Id,
  result: RecipeItemSchema,
  /** Omitted means an ordinary craft. A repair recipe's result identifies its target type. */
  kind: optional(picklist(['craft', 'repair'])),
  repair: optional(strictObject({ skill: Id, amount: Fraction, perSkill: Fraction })),
  /** Game minutes. */
  timeGameMinutes: PositiveGameMinutes,
  skills: record(Id, SkillLevel),
  qualities: record(Id, pipe(Count, minValue(1), maxValue(5))),
  components: array(pipe(array(RecipeItemSchema), nonEmpty('needs at least one alternative'))),
  workstation: optional(nullable(Id)),
});

// ---- files ----

/** Native schemas and section metadata live here, not in parallel loader/validator lists. */
const SECTION_DESCRIPTOR = {
  blocks: { schema: optional(array(BlockSchema)), label: 'blocks', order: 0 },
  items: { schema: optional(array(ItemSchema)), label: 'items', order: 1 },
  furniture: { schema: optional(array(FurnitureSchema)), label: 'furniture', order: 2 },
  loot: { schema: optional(array(LootTableSchema)), label: 'loot tables', order: 4 },
  templates: { schema: optional(array(TemplateSchema)), label: 'templates', order: 5 },
  zombies: {
    schema: optional(
      pipe(
        array(ZombieSchema),
        check(
          (types) => types.every((zombie) => zombie.model !== 'amalgam' || zombie.bodyScale !== undefined),
          'amalgam must define bodyScale',
        ),
        check((types) => types.every(zombieRegionsMatchModel), 'zombie region keys must match the model'),
      ),
    ),
    label: 'zombie types',
    order: 6,
  },
  figures: { schema: optional(array(FigureSchema)), label: 'figures', order: 3 },
  models: { schema: optional(array(ModelSchema)), label: 'models', order: 7 },
  sounds: { schema: optional(array(SoundSchema)), label: 'sound events', order: 8 },
  skills: { schema: optional(array(SkillSchema)), label: 'skills', order: 9 },
  recipes: { schema: optional(array(RecipeSchema)), label: 'recipes', order: 10 },
  layouts: { schema: optional(array(SiteLayoutSchema)), label: 'site layouts', order: 11 },
  body: { schema: optional(array(BodyTuningSchema)), label: 'body tuning', order: 12 },
  senses: { schema: optional(array(SenseSchema)), label: 'sense tuning', order: 13 },
  meleeClasses: { schema: optional(array(MeleeClassSchema)), label: 'melee classes', order: 14 },
} as const;

type SectionSchemas = { [S in keyof typeof SECTION_DESCRIPTOR]: (typeof SECTION_DESCRIPTOR)[S]['schema'] };
const sectionSchemas = Object.fromEntries(
  Object.entries(SECTION_DESCRIPTOR).map(([section, descriptor]) => [section, descriptor.schema]),
) as SectionSchemas;

/** One content file: any declared section, each a list of definitions. */
export const ContentFileSchema = strictObject(sectionSchemas);

export type BlockDef = InferOutput<typeof BlockSchema>;
export type ItemDef = InferOutput<typeof ItemSchema>;
export type FurnitureDef = InferOutput<typeof FurnitureSchema>;
type LootTable = InferOutput<typeof LootTableSchema>;
export type LootEntry = LootTable['entries'][number];
export type TemplateDef = InferOutput<typeof TemplateSchema>;
export type StairDef = InferOutput<typeof StairSchema>;
export type TemplateAccess = InferOutput<typeof TemplateAccessSchema>;
export type FixedLootItemDef = InferOutput<typeof FixedLootItem>;
export type SiteLayoutDef = InferOutput<typeof SiteLayoutSchema>;
export type DoorLockDef = InferOutput<typeof DoorLockSchema>;
export type ZombieDef = InferOutput<typeof ZombieSchema>;
export type FigureDef = InferOutput<typeof FigureSchema>;
export type ModelDef = InferOutput<typeof ModelSchema>;
export type SoundDef = InferOutput<typeof SoundSchema>;
export type RecipeDef = InferOutput<typeof RecipeSchema>;
export type MeleeClassDef = InferOutput<typeof MeleeClassSchema>;
export type BodyTuningDef = InferOutput<typeof BodyTuningSchema>;
export type SenseDef = InferOutput<typeof SenseSchema>;
export type ContentFile = InferOutput<typeof ContentFileSchema>;
export type ContentSection = keyof ContentFile;

/** Also rejects independently adding a schema section without its metadata. */
export const CONTENT_SECTIONS = SECTION_DESCRIPTOR satisfies Record<ContentSection, { label: string; order: number }>;
/** Order preserves the existing duplicate-id diagnostics independently of schema field order. */
export const CONTENT_SECTION_KEYS = (Object.keys(CONTENT_SECTIONS) as ContentSection[]).sort(
  (a, b) => CONTENT_SECTIONS[a].order - CONTENT_SECTIONS[b].order,
);
