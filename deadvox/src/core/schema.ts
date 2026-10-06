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
  tuple,
  union,
  boolean as vBoolean,
} from 'valibot';
import { hasSegment } from './authoredTerrain.mjs';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from './character.ts';
import { parseSpawnTime } from './clock.ts';
import { hasReadableWords, isReadablePlainText, READABLE_TEXT_LIMIT, READABLE_TITLE_LIMIT } from './readable.ts';
import { SOUND_EVENT_IDS } from './soundEvents.ts';

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
const QualityLevel = pipe(number(), integer('must be a whole number'), minValue(1), maxValue(5));

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
  /** Seconds to take an item out or put one in, before the per-cell part. */
  handling: NonNegative,
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
  rotsAfter: optional(Positive),
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
    /** Seconds between swings. */
    cooldown: Positive,
    stamina: NonNegative,
    /** Impulse delivered by a melee hit, in N·s. */
    impulse: optional(NonNegative),
    /** Condition lost when this weapon lands a melee hit. */
    wearPerHit: optional(Fraction),
    type: picklist(['blunt', 'cut', 'pierce']),
  }),
});

// Debug rifles use virtual rounds; a pump consumes item-owned ammunition and needs exported tube/hand data.
const FirearmSchema = strictObject({
  pump: optional(vBoolean()),
  /** Camera-local aim kick per committed shot, scaled by firearms control. */
  recoilKickRadians: Positive,
  /** Half-angle of the firearm's independent per-round cone; pump firearms must set zero because pellet spread owns their cone. */
  dispersionRadians: pipe(NonNegative, maxValue(Math.PI / 2, 'must be at most a right angle')),
});
const AmmoSchema = strictObject({
  calibre: CalibreId,
  pellets: pipe(Count, minValue(1), maxValue(64)),
  diameterMm: Positive,
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
  /** Total burn in game hours for a consumable flame/light. */
  burnTime: optional(Positive),
  /** Fuel units consumed per game hour, for self-fueled sources such as a lighter. */
  fuelPerHour: optional(Positive),
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
  /** What powers it: an item with a battery component, and charge used per game hour. */
  power: optional(strictObject({ battery: Id, perHour: Positive })),
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
  readingTime: Positive,
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
  time: Positive,
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
  minIntervalSeconds: NonNegative,
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
    durationSeconds: Positive,
    rearwardSeconds: Positive,
    dwellSeconds: NonNegative,
    forwardSeconds: Positive,
  }),
  check(
    (cycle) => cycle.rearwardSeconds + cycle.dwellSeconds + cycle.forwardSeconds <= cycle.durationSeconds + 1e-9,
    'cycle phases must fit within durationSeconds',
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
    /** Cyclic rate in rounds per minute. */
    rpm: optional(Positive),
  }),
  check(
    (action) => Object.values(action.parts).every((part) => part.modes.every((mode) => action[mode] !== undefined)),
    'moving part modes must reference a declared timeline',
  ),
  check(
    (action) => (action.fire === undefined) === (action.rpm === undefined),
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
    /** Named points, such as the flashlight's `lens` or a firearm's `magwell`. */
    anchors: optional(record(Id, Point)),
    /** Optional estimated action cycles and the named moving GLB nodes. */
    action: optional(ActionSchema),
  }),
  check(
    ({ calibre, capacity, rounds }) =>
      capacity === undefined && rounds === undefined
        ? true
        : calibre !== undefined && capacity !== undefined && rounds !== undefined && rounds.length === capacity,
    'magazine metadata needs calibre, capacity, and one round pose per capacity slot',
  ),
  check(
    ({ tube, calibre, anchors, capacity, rounds }) =>
      tube === undefined ||
      (calibre !== undefined && anchors?.loading_port !== undefined && capacity === undefined && rounds === undefined),
    'tube metadata needs calibre/loading_port and cannot carry a box round column',
  ),
);

// ---- furniture ----

const DoorPryingSchema = strictObject({
  /** Minimum tool quality needed to force the door's lock. */
  quality: QualityLevel,
  /** Simulated seconds of work. */
  time: Positive,
  /** Simulated seconds between noisy strikes. */
  strikeInterval: Positive,
});

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
  /** It opens and closes, taking this many seconds. */
  door: optional(strictObject({ handling: NonNegative, prying: optional(DoorPryingSchema) })),
  /** Comfort scales fatigue recovery; sleepable pieces also enable the sleep rate. */
  rest: optional(strictObject({ quality: Fraction, sleep: optional(literal(true)) })),
  /** A station available to matching recipes within reach; bonus is the fraction removed from work time. */
  workstation: optional(
    strictObject({
      id: Id,
      qualities: record(Id, QualityLevel),
      workTimeBonus: Fraction,
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
);
const SpawnWindowSchema = pipe(
  strictObject({ from: SpawnTime, to: optional(SpawnTime) }),
  check(({ from, to }) => to === undefined || parseSpawnTime(from) !== parseSpawnTime(to), 'from and to must differ'),
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
  bounds: pipe(
    strictObject({ x0: Metres, z0: Metres, x1: Metres, z1: Metres }),
    check((r) => r.x0 < r.x1 && r.z0 < r.z1, 'bounds must have positive area'),
  ),
  /** Foundation elevation: lower face of the top ground block, in metres. */
  ground: HalfMetres,
  /** Calendar time on day 1 when this site is selected without an explicit ?time=. */
  startTime: optional(pipe(string(), regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM'))),
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

const ZombieSchema = strictObject({
  id: Id,
  name: Name,
  regions: strictObject({
    head: Positive,
    torso: Positive,
    leftArm: Positive,
    rightArm: Positive,
    leftLeg: Positive,
    rightLeg: Positive,
  }),
  /** Metres per second. */
  speed: strictObject({ wander: Positive, chase: Positive }),
  /** Metres advanced by one half-cycle of the leg gait. */
  stepLength: Positive,
  /** Metres by day. */
  sight: Positive,
  /** Metres by night. */
  nightSight: Positive,
  /** Half-angle of the sight cone, in degrees. */
  sightCone: pipe(Positive, maxValue(180, 'must be at most 180')),
  /** Idle/stroll timing, home leash and eased look controls. */
  wander: strictObject({
    obstacleWanderChance: Fraction,
    obstacleWanderDistanceMetres: Positive,
    idleSeconds: strictObject({ min: Positive, max: Positive }),
    strollSeconds: strictObject({ min: Positive, max: Positive }),
    leashMetres: Positive,
    lookIntervalSeconds: strictObject({ min: Positive, max: Positive }),
    bodyLookArcDegrees: pipe(Positive, maxValue(360, 'must be at most 360')),
    headLookArcDegrees: pipe(Positive, maxValue(360, 'must be at most 360')),
    bodyTurnDegreesPerSecond: Positive,
    headTurnDegreesPerSecond: Positive,
    movementAcceleration: Positive,
  }),
  /** 1 is normal hearing. */
  hearing: NonNegative,
  hearingRange: strictObject({ walk: Positive, jog: Positive, sprint: Positive }),
  hearingModel: pipe(
    strictObject({
      farMultiplier: pipe(Positive, minValue(1, 'must be at least 1')),
      bearingErrorRadians: pipe(Positive, maxValue(Math.PI, 'must be at most pi')),
      investigationDistanceMetres: Positive,
      searchSeconds: strictObject({ min: Positive, max: Positive }),
      searchRadiusMetres: Positive,
      searchStrollSeconds: strictObject({ min: Positive, max: Positive }),
    }),
    check(
      (model) => model.searchSeconds.min <= model.searchSeconds.max,
      'minimum search duration must not exceed maximum',
    ),
    check(
      (model) => model.searchStrollSeconds.min <= model.searchStrollSeconds.max,
      'minimum search stroll must not exceed maximum',
    ),
  ),
  chaseMotion: pipe(
    strictObject({
      swayDegrees: pipe(NonNegative, maxValue(90, 'must be at most 90')),
      swayIntervalSeconds: strictObject({ min: Positive, max: Positive }),
      speedMultiplier: strictObject({ min: Positive, max: Positive }),
      lurchSeconds: Positive,
      stumbleChancePerSecond: pipe(NonNegative, maxValue(1, 'must be at most 1')),
      stumbleDurationSeconds: strictObject({ min: Positive, max: Positive }),
      stumbleEaseSeconds: Positive,
      stumbleSpeedFraction: Fraction,
      stumbleDeceleration: Positive,
    }),
    check(
      (motion) => motion.swayIntervalSeconds.min <= motion.swayIntervalSeconds.max,
      'minimum sway interval must not exceed maximum',
    ),
    check(
      (motion) => motion.speedMultiplier.min <= motion.speedMultiplier.max,
      'minimum speed multiplier must not exceed maximum',
    ),
    check(
      (motion) => motion.stumbleDurationSeconds.min <= motion.stumbleDurationSeconds.max,
      'minimum stumble duration must not exceed maximum',
    ),
    check(
      (motion) => motion.stumbleDurationSeconds.min >= 2 * motion.stumbleEaseSeconds,
      'stumble duration must allow easing in and out',
    ),
  ),
  attack: pipe(
    strictObject({ damage: Positive, reach: Positive, cooldown: Positive, windup: Positive }),
    check((attack) => attack.windup < attack.cooldown, 'windup must be less than cooldown'),
  ),
  /** Per-hit chance of severing a random not-yet-severed arm part (src/core/zombies.ts's swing); a
   * killing blow additionally rolls headOnKillChance to sever the head too. Both independent 0..1 chances,
   * not a shared budget. */
  dismember: strictObject({ chance: Fraction, headOnKillChance: Fraction }),
  abilities: array(picklist(ZOMBIE_ABILITIES)),
  /** What's in its pockets. */
  loot: optional(Id),
});

/** Actor palettes are content so appearance doesn't live in renderer code. */
const FigureSchema = strictObject({
  id: Id,
  palette: strictObject({ skin: Color, shirt: Color, trousers: Color }),
});

// ---- skills and recipes ----

const SkillSchema = strictObject({ id: Id, name: Name });
const SenseSchema = strictObject({
  id: Id,
  crouch: strictObject({
    speedMetresPerSecond: Positive,
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
    throwChargeSeconds: Positive,
  }),
});
const RecipeItemSchema = ItemCountSchema;

/** Counts are whole items, never millilitres; no partial-liquid storage contract exists yet. */
const BodyTuningSchema = strictObject({
  id: Id,
  /** Game hours after a bleeding wound before an at-risk infection becomes early. */
  infectionOnsetGameHours: Positive,
  /** Game hours the early infection stage remains treatable with antiseptic. */
  antisepticWindowGameHours: Positive,
  infectionChance: Fraction,
  /** Simulation seconds that the player remains unconscious. */
  knockoutSeconds: Positive,
  /** Player eye height in metres while unconscious and prone. */
  proneEyeHeightMetres: Positive,
  /** Blunt-force shock damage per point of health damage. */
  bluntShockPerDamage: Positive,
  /** Simulation seconds required to apply wound treatment. */
  treatmentSeconds: Positive,
  /** Shock restored when the player wakes, on a 0–100 scale. */
  wakeShock: pipe(
    Positive,
    check((value) => value < 100, 'must be below 100'),
  ),
  /** Blood lost per simulation second while a wound bleeds. */
  bloodLossPerSecond: Positive,
  /** Blood recovered per simulation second when no wound bleeds. */
  bloodRecoveryPerSecond: Positive,
  /** Shock recovered per simulation second outside a knockout. */
  shockRecoveryPerSecond: Positive,
  /** Health lost per simulation second while infection is advanced. */
  advancedInfectionHealthLossPerSecond: Positive,
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
  /** Game minutes, not simulation seconds. */
  time: Positive,
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
  zombies: { schema: optional(array(ZombieSchema)), label: 'zombie types', order: 6 },
  figures: { schema: optional(array(FigureSchema)), label: 'figures', order: 3 },
  models: { schema: optional(array(ModelSchema)), label: 'models', order: 7 },
  sounds: { schema: optional(array(SoundSchema)), label: 'sound events', order: 8 },
  skills: { schema: optional(array(SkillSchema)), label: 'skills', order: 9 },
  recipes: { schema: optional(array(RecipeSchema)), label: 'recipes', order: 10 },
  layouts: { schema: optional(array(SiteLayoutSchema)), label: 'site layouts', order: 11 },
  body: { schema: optional(array(BodyTuningSchema)), label: 'body tuning', order: 12 },
  senses: { schema: optional(array(SenseSchema)), label: 'sense tuning', order: 13 },
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
