import {
  array,
  check,
  type InferOutput,
  integer,
  literal,
  maxValue,
  minLength,
  minValue,
  nonEmpty,
  number,
  omit,
  optional,
  picklist,
  pipe,
  regex,
  strictObject,
  string,
  tuple,
  union,
  variant,
  boolean as vBoolean,
} from 'valibot';
import { hasSegment } from '../authoredTerrain.mjs';
import { LootContextSchema, LootTierSchema, UsageSchema } from '../loot.ts';
import { Count, Fraction, GameTimeOfDay, Id, Name } from './primitives.ts';
import { CellCoordinate, CellPosition, FixedLootItem, KitRefSchema, SpawnWindowSchema } from './templates.ts';

// ---- authored site layouts (metres, independent of chunk/block order) ----

const Metres = pipe(
  number(),
  check((value) => Number.isFinite(value), 'must be finite'),
);

export const Degrees = pipe(
  number(),
  check((value) => Number.isFinite(value), 'must be finite'),
);

const HalfMetres = pipe(
  Metres,
  check((v) => Number.isInteger(v * 2), 'must be snapped to 0.5 m'),
);

const MetrePosition = tuple([Metres, Metres, Metres]);

const LayoutPoint = tuple([Metres, Metres]);

// [x, z]; Tiled's pixel y becomes world z.
export const PositiveMetres = pipe(Metres, minValue(Number.MIN_VALUE));

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
  strictObject({
    kind: literal('basin'),
    centre: LayoutPoint,
    radii: tuple([PositiveMetres, PositiveMetres]),
    depth: PositiveMetres,
  }),
]);

export const FixedLootOverride = strictObject({
  lootUsage: optional(UsageSchema),
  /** Exact tier, taking precedence over the anchor and building. */
  lootTier: optional(LootTierSchema),
  /** Template-local furniture anchor in half-metre block cells. */
  at: tuple([Count, Count, Count]),
  items: pipe(array(FixedLootItem), nonEmpty('needs at least one fixed item')),
});

const LayoutBuilding = strictObject({
  lootContext: optional(LootContextSchema),
  template: Id,
  position: tuple([HalfMetres, HalfMetres, HalfMetres]),
  rotation: picklist([0, 90, 180, 270], 'rotation must be a quarter turn'),
  storeys: optional(pipe(Count, minValue(1), maxValue(8))),
  fixedLoot: optional(array(FixedLootOverride)),
  /** The lot stands in water on purpose, so the flooded-lot check skips it. */
  overWater: optional(vBoolean()),
});

export const LayoutRect = pipe(
  strictObject({ x0: Metres, z0: Metres, x1: Metres, z1: Metres }),
  check((r) => r.x0 < r.x1 && r.z0 < r.z1, 'must have positive area'),
);

const HalfMetrePosition = tuple([HalfMetres, HalfMetres, HalfMetres]);

const PositiveHalfMetres = pipe(HalfMetres, minValue(0.5));

/** Where new features are shown: authored slots and a derived catalogue of every furniture piece. */
const ShowroomSchema = strictObject({
  /** The west end of the packed row's front line, feet on the deck; row slots run east from here. */
  row: HalfMetrePosition,
  /** Which way every slot's front faces; the row is seen from that side. */
  facing: picklist(['n', 's']),
  /** Gap between neighbouring slots. */
  spacing: PositiveHalfMetres,
  /** How many slots the display holds; a new slot past it replaces the oldest. */
  capacity: pipe(Count, minValue(1)),
  /** Oldest first; the default spawn faces the last. */
  slots: array(
    strictObject({
      furniture: Id,
      /** An independently placed slot does not consume space in the packed row. */
      placement: optional(strictObject({ position: HalfMetrePosition, facing: picklist(['n', 's']) })),
      fixed: optional(literal(true)),
      /** The slot's fixture stock. */
      items: optional(pipe(array(omit(FixedLootItem, ['key'])), nonEmpty())),
    }),
  ),
  /** How far in front of a prop a focus spawn stands. */
  focusDistance: PositiveHalfMetres,
  /** Every content furniture piece in rows facing south, on a flat floor; row packing remains game logic. */
  catalogue: strictObject({
    /** The floor's north-west corner, feet height; rows run east and each next row lies further south. */
    position: HalfMetrePosition,
    /** How far east a row may run. */
    width: PositiveHalfMetres,
    /** Gap between neighbouring pieces, and the aisle in front of each row. */
    spacing: PositiveHalfMetres,
    /** The block the floor is made of. */
    floor: Id,
    /** How far the natural ground takes to blend into the floor. */
    blend: PositiveHalfMetres,
  }),
});

export const SiteLayoutSchema = strictObject({
  /** Layout keys are URL scene names, including camel-case names. */
  id: pipe(string(), regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'must be a URL scene name')),
  lootContext: LootContextSchema,
  /** Fixture and showcase layouts are not world sources; unmarked authored layouts contribute building containers and fixed loot. */
  demo: optional(vBoolean()),
  /** The render-only weathering profile for this site; absent layouts use the default profile. */
  weatheringProfile: optional(Id),
  bounds: LayoutRect,
  /** Foundation elevation: lower face of the top ground block, in metres. */
  ground: HalfMetres,
  /** Calendar time on day 1 when this site is selected without an explicit ?time=. */
  startTimeGameTimeOfDay: optional(GameTimeOfDay),
  terrain: array(TerrainPrimitive),
  buildings: array(LayoutBuilding),
  vehicles: optional(
    array(
      strictObject({
        blueprint: Id,
        placementKey: pipe(string(), nonEmpty()),
        position: MetrePosition,
        facing: picklist(['n', 'e', 's', 'w']),
      }),
    ),
  ),
  /** Vehicle parking bays: a vehicle's origin and facing, whether or not one is parked there. */
  bays: optional(array(strictObject({ position: MetrePosition, facing: picklist(['n', 'e', 's', 'w']) }))),
  /** The building template whose containers receive derived repair stock; derivation remains game logic. */
  repairStock: optional(Id),
  showroom: optional(ShowroomSchema),
  /** Debug lane placement is independent of landscape bounds, so enlarging a view does not move test supplies. */
  handlingRange: optional(strictObject({ beside: LayoutRect, floor: HalfMetres })),
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
  hordes: optional(array(strictObject({ id: Id, position: MetrePosition }))),
  woodlands: array(strictObject({ polygon: pipe(array(LayoutPoint), minLength(3)), density: Fraction })),
  /** Standing water: wherever a column inside the polygon has its bed below the level, water fills up to it. */
  water: optional(
    array(
      strictObject({
        /** The water's top face, the plane a swimmer floats at; `ground` is instead a block's lower face. */
        level: HalfMetres,
        polygon: pipe(array(LayoutPoint), minLength(3)),
        /** How far from the water the ground turns to sand. */
        shore: pipe(Metres, minValue(0)),
      }),
    ),
  ),
  tracks: array(
    strictObject({
      points: pipe(array(LayoutPoint), minLength(2)),
      width: pipe(Metres, minValue(Number.MIN_VALUE)),
      /** The block the track's surface is made of. */
      surface: Id,
    }),
  ),
  /** Observation only: playtest metrics record when the player first stands in each beat's area. */
  beats: optional(array(strictObject({ id: Id, area: LayoutRect }))),
  /** Practice's optional modules: the items each teaches and the labels its steps show. */
  practice: optional(
    strictObject({
      light: strictObject({
        light: Id,
        battery: Id,
        labels: strictObject({ start: Name, on: Name, assign: Name, swap: Name, relight: Name }),
      }),
    }),
  ),
});

const PoolRefSchema = union([KitRefSchema, strictObject({ kind: literal('template'), id: Id, style: optional(Id) })]);

export const MapPoolSchema = strictObject({
  id: Id,
  choices: pipe(
    array(
      strictObject({
        ref: PoolRefSchema,
        weight: pipe(
          number(),
          minValue(0),
          check((value) => Number.isFinite(value), 'must be finite'),
        ),
        atLeast: optional(pipe(number(), integer('must be a whole number'), minValue(1))),
        atMost: optional(pipe(number(), integer('must be a whole number'), minValue(0))),
      }),
    ),
    minLength(1),
    check(
      (rows) => rows.every(({ atLeast, atMost }) => atLeast === undefined || atMost === undefined || atLeast <= atMost),
      'atLeast must not exceed atMost',
    ),
    check(
      (rows) => new Set(rows.map(({ ref }) => `${ref.kind}:${ref.id}@${ref.style ?? ''}`)).size === rows.length,
      'building refs must be unique',
    ),
    check((rows) => rows.some(({ weight }) => weight > 0), 'needs a positive building weight'),
  ),
});

export const StartDescentSchema = variant('kind', [
  strictObject({ kind: literal('ladder'), ladder: CellPosition, upper: CellPosition, lower: CellPosition }),
  strictObject({ kind: literal('stairs'), hatch: CellPosition, upper: CellPosition, lower: CellPosition }),
  strictObject({
    kind: literal('drop'),
    upper: CellPosition,
    edge: CellPosition,
    landing: CellPosition,
    lower: CellPosition,
  }),
]);

/** Block geometry of a street grid, in blocks; shared so a scenario city and the stress city keep the same limits. */
export const CityBlockGeometry = {
  street: pipe(Count, minValue(4), maxValue(64)),
  blockX: pipe(Count, minValue(8), maxValue(256)),
  blockZ: pipe(Count, minValue(8), maxValue(256)),
  pad: pipe(Count, minValue(2), maxValue(32)),
  gap: pipe(Count, minValue(1), maxValue(32)),
  blend: pipe(Count, maxValue(64)),
  rows: pipe(
    Count,
    minValue(2),
    maxValue(8),
    check((value) => value % 2 === 0, 'needs paired rows'),
  ),
};

export const CityBenchmarkSchema = strictObject({
  id: Id,
  settlementKind: Id,
  pool: Id,
  ...CityBlockGeometry,
  reachMetres: PositiveMetres,
});

export const PerimeterCrossingSchema = strictObject({ id: Id, inside: CellPosition, outside: CellPosition });

export type PerimeterCrossingDef = InferOutput<typeof PerimeterCrossingSchema>;

export const CityLotSchema = strictObject({
  id: Id,
  position: tuple([CellCoordinate, CellCoordinate]),
  size: tuple([pipe(Count, minValue(1)), pipe(Count, minValue(1))]),
  turn: picklist([0, 1, 2, 3]),
  source: optional(
    union([
      strictObject({ kind: picklist(['template', 'assembly']), id: Id, style: optional(Id) }),
      strictObject({ kind: literal('pool'), id: Id }),
    ]),
  ),
  /** A direct crossing prevents a route around the fence from certifying a blocked breach. */
  routes: optional(array(PerimeterCrossingSchema)),
});

/** A corridor under the city; elements, mouths and ports are lists so a later junction is one more entry. */
export const CityUndergroundSchema = strictObject({
  id: Id,
  assembly: Id,
  position: tuple([CellCoordinate, CellCoordinate]),
  turn: picklist([0, 1, 2, 3]),
  /** Ladders up to the street, in element cells. */
  mouths: pipe(array(strictObject({ ladder: CellPosition, upper: CellPosition, lower: CellPosition })), minLength(1)),
  /** Openings into the service: `outside` in element cells; `threshold` and `inside` in service cells. */
  ports: pipe(
    array(strictObject({ id: Id, outside: CellPosition, threshold: CellPosition, inside: CellPosition })),
    minLength(1),
  ),
});
