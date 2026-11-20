import {
  array,
  check,
  type InferOutput,
  integer,
  literal,
  maxLength,
  maxValue,
  minValue,
  nonEmpty,
  number,
  omit,
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
import { SPAWN_TIME_NAMES } from '../clock.ts';
import { DECAL_KINDS, type DecalKind } from '../decalKinds.ts';
import { LootContextSchema, LootTierSchema, UsageSchema } from '../loot.ts';
import { LiquidAmountSchema, LiquidContentsSchema } from './items.ts';
import { CartridgeOddsSchema } from './loot.ts';
import {
  Color,
  Count,
  Fraction,
  GameTimeOfDay,
  Id,
  NonNegative,
  Positive,
  PositiveGameHours,
  Size,
} from './primitives.ts';

// ---- templates ----

const Char = pipe(string(), regex(/^.$/u, 'palette keys are single characters'));

export const DoorLockSchema = strictObject({ id: Id, locked: vBoolean() });

// Names stay names through parsing: the day cycle that gives them meaning is content too (`resolveSpawnTime`).
const SpawnTime = union([picklist(SPAWN_TIME_NAMES), GameTimeOfDay], 'expected a named game time or HH:MM');

export const SpawnWindowSchema = pipe(
  strictObject({ fromGameTimeOfDay: SpawnTime, toGameTimeOfDay: optional(SpawnTime) }),
  check(
    ({ fromGameTimeOfDay, toGameTimeOfDay }) => toGameTimeOfDay === undefined || fromGameTimeOfDay !== toGameTimeOfDay,
    'from and to must differ',
  ),
);

export const FixedLootItem = strictObject({
  item: Id,
  /** How many of the item; of a packaged item, how many filled holders. */
  count: optional(pipe(Count, minValue(1))),
  condition: optional(Fraction),
  /** How full each holder of a packaged item comes, as a share of its packaging count; unset is full. */
  fill: optional(Fraction),
  /** Stocks a packaged item as the bare stack. */
  loose: optional(literal(true)),
  /** Observation only: playtest metrics record when the player first loots or reads this item. */
  key: optional(vBoolean()),
  /** Surface items begin as visible world piles on their furniture's top; other items fill its container. */
  placement: optional(picklist(['surface', 'container'], 'placement must be surface or container')),
  /** Item types fitted at spawn, by slot id: a found gun that comes with its sling. */
  fitted: optional(record(Id, Id)),
  /** Battery charge at spawn as a share of full, for the item if it is a battery and for its fitted batteries. */
  charge: optional(Fraction),
  /** The cartridge type filling the row's magazine, or its fitted magazine; unset takes no type. */
  cartridge: optional(Id),
  /** Cartridge types, by weight, one of which fills the magazine when `cartridge` is unset; never with `cartridge`. */
  cartridgeOdds: optional(CartridgeOddsSchema),
  /** How many cartridges that magazine holds; unset rolls from the product's loot policy. */
  load: optional(Count),
  craftedLiquids: optional(pipe(array(LiquidAmountSchema), nonEmpty())),
  liquidContents: optional(LiquidContentsSchema),
});

const GroundLootSupplySchema = union([
  strictObject({ kind: literal('empty') }),
  strictObject({ kind: literal('table'), table: Id }),
  strictObject({
    kind: literal('fixed'),
    items: pipe(array(omit(FixedLootItem, ['placement'])), nonEmpty()),
    table: optional(Id),
  }),
]);

export type GroundLootSupply = InferOutput<typeof GroundLootSupplySchema>;

/** A palette entry that isn't a plain block. */
const PaletteThingSchema = pipe(
  strictObject({
    furniture: optional(Id),
    groundLoot: optional(GroundLootSupplySchema),
    /** The table this container placement rolls. */
    loot: optional(Id),
    lootUsage: optional(UsageSchema),
    /** Exact tier for this point alone, rather than the building's tier range. */
    lootTier: optional(LootTierSchema),
    facing: optional(picklist(['n', 'e', 's', 'w'])),
    /** The face this furniture lies on, when it is not standing on its bottom. */
    tip: optional(picklist(['back', 'front', 'left', 'right', 'top'])),
    /** Initial lock state, only on a door; ids are unique within an authored site. */
    lock: optional(DoorLockSchema),
    /** Boards nailed on one side of an upright door, a `boardings` id, as a player would board it. */
    boarding: optional(strictObject({ type: Id, side: picklist(['front', 'back']) })),
    /** Fastened where it stands, like a fitted cupboard, so the player can't move it. */
    fixed: optional(literal(true)),
    /** A worn share in place of the piece's seeded wear roll, so a fixture can stand a piece at a known condition. */
    wear: optional(Fraction),
    /** Stock every copy of this piece always holds, beside its table's roll. */
    items: optional(pipe(array(omit(FixedLootItem, ['key'])), nonEmpty())),
    /** An actor type that may stand here; the cell itself is air. */
    spawn: optional(Id),
    chance: optional(Fraction),
    /** Daily game-clock window; omitted markers spawn when their column loads. */
    window: optional(SpawnWindowSchema),
    /** The ground here: the cell stamps nothing and keeps whatever surface the site put under the item. */
    ground: optional(literal(true)),
  }),
  check(
    (e) => [e.furniture, e.spawn, e.ground, e.groundLoot].filter((part) => part !== undefined).length === 1,
    'needs exactly one of "furniture", "spawn", "ground" or "groundLoot"',
  ),
  check((e) => e.spawn !== undefined || e.window === undefined, '"window" only goes with "spawn"'),
  check(
    (e) =>
      e.furniture !== undefined ||
      (e.loot === undefined &&
        e.facing === undefined &&
        e.tip === undefined &&
        e.lock === undefined &&
        e.boarding === undefined &&
        e.fixed === undefined &&
        e.wear === undefined &&
        e.items === undefined),
    '"loot", "facing", "tip", "lock", "boarding", "fixed", "wear" and "items" only go with "furniture"',
  ),
  check((e) => e.spawn !== undefined || e.chance === undefined, '"chance" only goes with "spawn"'),
);

/** Template-local block coordinates; horizontal half cells permit centred, two-cell-wide landings. */
export const CellCoordinate = pipe(
  number(),
  check((v) => Number.isFinite(v) && Number.isInteger(v * 2), 'must be on the half-cell grid'),
);

export const CellPosition = tuple([CellCoordinate, Count, CellCoordinate]);

export const StairSchema = strictObject({
  from: Id,
  to: Id,
  lower: CellPosition,
  upper: CellPosition,
  width: pipe(Count, minValue(2)),
  block: Id,
});

export const TemplateAccessSchema = strictObject({
  ground: Id,
  entrance: CellPosition,
  storeys: pipe(array(strictObject({ id: Id, floor: Count })), nonEmpty()),
  stairs: array(StairSchema),
});

const OwnershipSchema = strictObject({
  /** '.' leaves terrain alone, S claims occupancy, A excavates, R reserves empty circulation. */
  layers: array(array(pipe(string(), regex(/^[.SAR]*$/)))),
});

const DecalVariantSchema = strictObject({
  sizeMetres: tuple([Positive, Positive]),
  color: Color,
  agedColor: Color,
  opacity: Fraction,
  agedOpacity: Fraction,
  ageingGameHours: PositiveGameHours,
  noiseScale: Positive,
  edgeRaggedness: Fraction,
  /** Normalized line segments, each [x0, y0, x1, y1, width]. */
  strokes: pipe(
    array(
      pipe(
        tuple([Fraction, Fraction, Fraction, Fraction, Fraction]),
        check(([x0, y0, x1, y1, width]) => width > 0 && (x0 !== x1 || y0 !== y1), 'needs a nonzero stroke'),
      ),
    ),
    maxLength(64),
  ),
});

export const DecalSchema = strictObject({
  kind: picklist(Object.keys(DECAL_KINDS) as DecalKind[]),
  at: tuple([number(), number(), number()]),
  door: optional(tuple([number(), number(), number()])),
  normal: picklist(['n', 'e', 's', 'w', 'up', 'down']),
  rotation: number(),
  variants: pipe(array(DecalVariantSchema), nonEmpty(), maxLength(32)),
});

export type DecalDef = InferOutput<typeof DecalSchema>;

export const BuildingEligibilitySchema = strictObject({
  settlementKinds: pipe(array(Id), nonEmpty()),
});

export const TemplateSchema = strictObject({
  id: Id,
  lootContext: LootContextSchema,
  eligibility: optional(BuildingEligibilitySchema),
  /** The most storeys the stress-test city stacks this template to; absent means no limit. */
  maxStoreys: optional(pipe(Count, minValue(1), maxValue(8))),
  /** Blocks: [x, y, z]. */
  size: Size,
  /** What each character means: a block id ("air" for empty), or furniture or a spawn point. */
  palette: record(Char, union([Id, PaletteThingSchema])),
  /** Layers from the bottom up; each is rows along z of characters along x. */
  layers: array(array(string())),
  decals: optional(pipe(array(DecalSchema), maxLength(128))),
  /** Explicit floors and flights, never stress-test repetitions. Floor heights are feet heights in blocks. */
  access: optional(TemplateAccessSchema),
  ownership: optional(OwnershipSchema),
});

const KitSize = pipe(
  Size,
  check(
    ([x, y, z]) => Number.isSafeInteger(x * y * z) && x * y * z <= 1_048_576,
    'kit volume exceeds the allocation bound',
  ),
);

/** Roles a style binding must bind to a solid block, because support and standing proofs read solidity. */
export const STRUCTURAL_MATERIAL_ROLES = ['shell', 'interior_wall', 'interior_floor', 'roof', 'support'] as const;

const MaterialRole = picklist([...STRUCTURAL_MATERIAL_ROLES, 'trim', 'opening']);

/** A kind of non-default condition a drawn variant shows. See `packages/deadvox/docs/aftermath.md`, "Aftermath odds". */
export const AftermathTagSchema = strictObject({ id: Id });

/** The aftermath tags a style, piece or assembly shows wherever a slot draws it. */
const AftermathTags = optional(pipe(array(Id), nonEmpty()));

/** A weight multiplier per aftermath tag; an unset tag keeps the next scope out's, and 1 at the outermost. */
export const AftermathOddsSchema = record(Id, NonNegative);

export const MapStyleSchema = strictObject({
  id: Id,
  aftermath: AftermathTags,
  bindings: record(Id, strictObject({ role: MaterialRole, block: Id })),
});

const KitBoxSchema = strictObject({ min: tuple([Count, Count, Count]), size: KitSize });

export const KitAnchorSchema = strictObject({ at: CellPosition, kind: picklist(['standing', 'interaction', 'point']) });

export const KitPortSchema = strictObject({
  id: Id,
  type: Id,
  at: CellPosition,
  facing: picklist(['n', 'e', 's', 'w', 'up', 'down']),
  traversal: picklist(['walk', 'climb', 'drop', 'sealed']),
  aperture: tuple([pipe(Count, minValue(1)), pipe(Count, minValue(1))]),
  clearance: KitBoxSchema,
  standing: CellPosition,
});

export const MapPieceSchema = strictObject({
  id: Id,
  lootContext: LootContextSchema,
  size: KitSize,
  style: Id,
  aftermath: AftermathTags,
  palette: record(Char, union([strictObject({ role: MaterialRole, material: Id }), PaletteThingSchema])),
  layers: array(array(string())),
  decals: optional(pipe(array(DecalSchema), maxLength(128))),
  ownership: OwnershipSchema,
  anchors: record(Id, KitAnchorSchema),
  ports: array(KitPortSchema),
});

export const KitRefSchema = strictObject({ kind: picklist(['piece', 'assembly']), id: Id, style: optional(Id) });

const KitSlotSchema = pipe(
  strictObject({
    id: Id,
    at: tuple([Count, Count, Count]),
    size: KitSize,
    turn: picklist([0, 1, 2, 3]),
    choices: optional(pipe(array(strictObject({ ref: KitRefSchema, weight: Positive })), nonEmpty())),
    pool: optional(Id),
    /** Every alternative leaves the slot passable, so a briefed building's walks may cross it. */
    doorway: optional(literal(true)),
  }),
  check((slot) => (slot.choices === undefined) !== (slot.pool === undefined), 'needs exactly one of choices or pool'),
);

const KitEndpointSchema = strictObject({ slot: Id, port: Id });

const KitJoinSchema = strictObject({
  id: Id,
  a: KitEndpointSchema,
  b: KitEndpointSchema,
  seam: strictObject({ piece: Id, at: tuple([Count, Count, Count]), turn: picklist([0, 1, 2, 3]), a: Id, b: Id }),
});

export const MapAssemblySchema = strictObject({
  id: Id,
  lootContext: LootContextSchema,
  eligibility: optional(BuildingEligibilitySchema),
  /** The building brief this assembly answers. */
  brief: optional(Id),
  aftermath: AftermathTags,
  /** Odds for every slot this assembly and its nested assemblies draw, over the scopes around it. */
  aftermathOdds: optional(AftermathOddsSchema),
  size: KitSize,
  slots: array(KitSlotSchema),
  joins: array(KitJoinSchema),
  anchors: record(Id, KitAnchorSchema),
  ports: array(strictObject({ id: Id, slot: Id, port: Id })),
  access: optional(TemplateAccessSchema),
});

export const MapSiteSchema = strictObject({
  id: Id,
  assembly: Id,
  origin: tuple([pipe(number(), integer()), pipe(number(), integer()), pipe(number(), integer())]),
  turn: picklist([0, 1, 2, 3]),
  routes: pipe(
    array(strictObject({ from: Id, to: Id, traversal: picklist(['walk', 'climb']), return: vBoolean() })),
    nonEmpty(),
  ),
});
