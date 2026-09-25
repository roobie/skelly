// Content schemas (Valibot). Each schema checks one kind of content's shape, and the
// TypeScript types are inferred from it. References between content (loot tables,
// furniture, zombie types) are checked after all files are merged (content.ts).
// Units: grams, millilitres, metres and seconds; inventory space is in cells.

import {
  array,
  check,
  type InferOutput,
  integer,
  maxValue,
  minValue,
  nonEmpty,
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

const ID_PATTERN = /^[a-z0-9_]+$/;

export const Id = pipe(string(), regex(ID_PATTERN, 'must be lowercase letters, digits and _'));
const Name = pipe(string(), nonEmpty('must not be empty'));
const Color = pipe(string(), regex(/^#[0-9a-fA-F]{6}$/, 'expected "#rrggbb"'));
const NonNegative = pipe(number(), minValue(0, 'must be 0 or more'));
const Positive = pipe(number(), minValue(Number.MIN_VALUE, 'must be more than 0'));
const Count = pipe(number(), integer('must be a whole number'), minValue(0, 'must be 0 or more'));
const Fraction = pipe(number(), minValue(0, 'must be 0 to 1'), maxValue(1, 'must be 0 to 1'));

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

export const BlockSchema = strictObject({
  id: Id,
  name: Name,
  color: Color,
  /** Blocks movement. Non-solid blocks still render as cubes for now. */
  solid: vBoolean(),
});

// ---- items ----

export const ITEM_CATEGORIES = [
  'food',
  'drink',
  'medical',
  'tool',
  'weapon',
  'clothing',
  'bag',
  'light',
  'battery',
  'material',
  'book',
  'misc',
] as const;

export const WEAR_SLOTS = ['head', 'torso', 'legs', 'back', 'waist', 'hands', 'feet'] as const;

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
  qualities: record(Id, pipe(number(), integer('must be a whole number'), minValue(1), maxValue(5))),
});

const WeaponSchema = strictObject({
  melee: strictObject({
    damage: Positive,
    /** Metres. */
    reach: Positive,
    /** Seconds between swings. */
    cooldown: Positive,
    stamina: NonNegative,
    type: picklist(['blunt', 'cut', 'pierce']),
  }),
});

const LightSchema = strictObject({
  /** Metres it lights up. */
  radius: Positive,
  /** Metres from which others can see it (DESIGN.md, "Light"). */
  seenFrom: Positive,
  /** A cone of this many degrees; absent means light all around. */
  beam: optional(pipe(Positive, maxValue(180, 'must be at most 180'))),
  /** What powers it: an item with a battery component, and charge used per game hour. */
  power: optional(strictObject({ battery: Id, perHour: Positive })),
});

const BatterySchema = strictObject({
  /** Charge when full, in the units lights use per hour. */
  capacity: Positive,
});

export const ItemSchema = strictObject({
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
  tool: optional(ToolSchema),
  weapon: optional(WeaponSchema),
  light: optional(LightSchema),
  battery: optional(BatterySchema),
});

// ---- furniture ----

export const FurnitureSchema = strictObject({
  id: Id,
  name: Name,
  /** Cells, in blocks: [x, y, z]. It's anchored at its lowest corner. */
  size: Size,
  color: Color,
  solid: optional(vBoolean()),
  container: optional(ContainerSchema),
  /** The loot table rolled into its container when the chunk generates. */
  loot: optional(Id),
  /** It opens and closes, taking this many seconds. */
  door: optional(strictObject({ handling: NonNegative })),
  /** You can sleep on it; 1 is a good bed. */
  bed: optional(strictObject({ quality: Fraction })),
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

export const LootTableSchema = strictObject({
  id: Id,
  /** How many times to roll, inclusive. */
  rolls: range(Count),
  entries: pipe(array(LootEntrySchema), nonEmpty('needs at least one entry')),
});

// ---- templates ----

const Char = pipe(string(), regex(/^.$/u, 'palette keys are single characters'));

/** A palette entry that isn't a plain block: furniture or a spawn point. */
const PaletteThingSchema = pipe(
  strictObject({
    furniture: optional(Id),
    /** Overrides the furniture's own loot table. */
    loot: optional(Id),
    facing: optional(picklist(['n', 'e', 's', 'w'])),
    /** A zombie type that may stand here; the cell itself is air. */
    spawn: optional(Id),
    chance: optional(Fraction),
  }),
  check((e) => (e.furniture === undefined) !== (e.spawn === undefined), 'needs exactly one of "furniture" or "spawn"'),
  check(
    (e) => e.furniture !== undefined || (e.loot === undefined && e.facing === undefined),
    '"loot" and "facing" only go with "furniture"',
  ),
  check((e) => e.spawn !== undefined || e.chance === undefined, '"chance" only goes with "spawn"'),
);

export const TemplateSchema = strictObject({
  id: Id,
  /** Blocks: [x, y, z]. */
  size: Size,
  /** What each character means: a block id ("air" for empty), or furniture or a spawn point. */
  palette: record(Char, union([Id, PaletteThingSchema])),
  /** Layers from the bottom up; each is rows along z of characters along x. */
  layers: array(array(string())),
});

// ---- zombies ----

export const ZOMBIE_ABILITIES = [
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

export const ZombieSchema = strictObject({
  id: Id,
  name: Name,
  health: Positive,
  /** Metres per second. */
  speed: strictObject({ wander: Positive, chase: Positive }),
  /** Metres by day. */
  sight: Positive,
  /** 1 is normal hearing. */
  hearing: NonNegative,
  attack: strictObject({ damage: Positive, reach: Positive, cooldown: Positive }),
  abilities: array(picklist(ZOMBIE_ABILITIES)),
  /** What's in its pockets. */
  loot: optional(Id),
  model: Id,
});

// ---- files ----

/** One content file: any of these sections, each a list of definitions. */
export const ContentFileSchema = strictObject({
  blocks: optional(array(BlockSchema)),
  items: optional(array(ItemSchema)),
  furniture: optional(array(FurnitureSchema)),
  loot: optional(array(LootTableSchema)),
  templates: optional(array(TemplateSchema)),
  zombies: optional(array(ZombieSchema)),
});

export type BlockDef = InferOutput<typeof BlockSchema>;
export type ItemDef = InferOutput<typeof ItemSchema>;
export type FurnitureDef = InferOutput<typeof FurnitureSchema>;
export type LootTable = InferOutput<typeof LootTableSchema>;
export type LootEntry = LootTable['entries'][number];
export type TemplateDef = InferOutput<typeof TemplateSchema>;
export type ZombieDef = InferOutput<typeof ZombieSchema>;
export type ContentFile = InferOutput<typeof ContentFileSchema>;
export type ContentSection = keyof ContentFile;
