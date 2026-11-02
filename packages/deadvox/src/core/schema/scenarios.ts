import {
  array,
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
  strictObject,
  tuple,
  union,
  boolean as vBoolean,
} from 'valibot';
import { DAY_PHASES } from '../dayPhase.ts';
import { SCENARIO_KINDS } from '../scenarioKinds.ts';
import {
  CityBlockGeometry,
  CityLotSchema,
  CityUndergroundSchema,
  FixedLootOverride,
  LayoutRect,
  PerimeterCrossingSchema,
  StartDescentSchema,
} from './layouts.ts';
import { Count, Id, PositiveGameHours } from './primitives.ts';
import { CellCoordinate, CellPosition } from './templates.ts';

/** A scenario event: once its trigger has passed and every condition holds, its effects apply once. See `SLICE-5.md`, "Settled event and playtest rules". */
const EventRuleSchema = strictObject({
  id: Id,
  trigger: union([strictObject({ kind: literal('elapsed'), afterGameHours: PositiveGameHours })]),
  conditions: optional(
    array(union([strictObject({ kind: literal('dayPhase'), phases: pipe(array(picklist(DAY_PHASES)), nonEmpty()) })])),
    [],
  ),
  effects: pipe(
    array(
      union([
        /** A horde of one zombie type appears at `at`, in world cells, and heads for where the player stood. */
        strictObject({
          kind: literal('releaseHorde'),
          zombie: Id,
          count: pipe(Count, minValue(1), maxValue(64)),
          at: CellPosition,
        }),
      ]),
    ),
    nonEmpty('needs an effect'),
  ),
});

export type EventRuleDef = InferOutput<typeof EventRuleSchema>;

export const ScenarioSchema = strictObject({
  id: Id,
  kind: picklist(SCENARIO_KINDS),
  outbreakAgeGameHours: PositiveGameHours,
  decalLimit: pipe(Count, maxValue(4096)),
  body: Id,
  compression: Id,
  serviceTemplate: Id,
  composition: optional(
    strictObject({
      start: strictObject({
        template: Id,
        cell: tuple([pipe(number(), integer()), pipe(number(), integer())]),
        spawn: CellPosition,
        minimumOpenDescents: optional(pipe(Count, minValue(1), maxValue(32)), 2),
        descents: pipe(array(StartDescentSchema), minLength(1), maxLength(32)),
        /** Core stock the instance promises in the start building, at template-local furniture anchors. */
        fixedLoot: optional(array(FixedLootOverride)),
      }),
      fixedLoot: pipe(array(FixedLootOverride), nonEmpty('needs a fixed resource source')),
      events: optional(
        array(
          strictObject({
            template: Id,
            lot: Id,
            at: CellPosition,
            fixedLoot: pipe(array(FixedLootOverride), nonEmpty('needs a promised item')),
          }),
        ),
      ),
      /** Core stock the instance promises in a fixed lot's building; the building's template stays unchanged. */
      stops: optional(
        array(
          strictObject({
            lot: Id,
            fixedLoot: pipe(array(FixedLootOverride), nonEmpty('needs a promised item')),
          }),
        ),
      ),
      leads: tuple([
        strictObject({
          template: Id,
          fixedLoot: optional(array(FixedLootOverride)),
          lot: optional(Id),
          at: optional(CellPosition),
          standing: optional(CellPosition),
        }),
        strictObject({
          template: Id,
          fixedLoot: optional(array(FixedLootOverride)),
          lot: optional(Id),
          at: optional(CellPosition),
          standing: optional(CellPosition),
        }),
      ]),
      landmarks: tuple([Id, Id]),
      landmarkPositions: optional(tuple([CellPosition, CellPosition])),
      incidentalTemplates: pipe(array(Id), minLength(1), maxLength(32)),
      objective: CellPosition,
      objectiveFace: CellPosition,
      retreat: CellPosition,
      /**
       * Service-local unless `lot` names a fixed lot, whose stop then holds the stock and whose local frame the poses
       * use. A `key` route is proved from the start: up its climbs to the holder, back down, then to the resource.
       */
      resources: pipe(
        array(
          strictObject({
            at: CellPosition,
            standing: CellPosition,
            lot: optional(Id),
            key: optional(
              strictObject({
                at: CellPosition,
                standing: CellPosition,
                climbs: optional(
                  array(strictObject({ ladder: CellPosition, upper: CellPosition, lower: CellPosition })),
                  [],
                ),
              }),
            ),
          }),
        ),
        nonEmpty('needs a resource standing pose'),
      ),
      storeys: pipe(array(strictObject({ id: Id, standing: CellPosition })), minLength(1), maxLength(16)),
      seals: optional(
        array(
          strictObject({
            doors: pipe(array(CellPosition), nonEmpty()),
            key: CellPosition,
            held: optional(literal(true)),
            standing: CellPosition,
          }),
        ),
        [],
      ),
      stairs: optional(array(strictObject({ upper: CellPosition, lower: CellPosition })), []),
      descents: pipe(
        array(strictObject({ ladder: CellPosition, upper: CellPosition, lower: CellPosition })),
        maxLength(32),
      ),
    }),
  ),
  portal: strictObject({
    hatch: CellPosition,
    ladder: CellPosition,
    upper: CellPosition,
    lower: CellPosition,
  }),
  eventRules: optional(array(EventRuleSchema), []),
  /** The ordinary buildings' street pressure; authored markers are separate from it. */
  population: strictObject({
    settlementPressure: vBoolean(),
    authoredMarkers: vBoolean(),
    /** Ordinary buildings per street group; each group gets roadside stragglers. */
    groupSize: pipe(Count, minValue(1), maxValue(64)),
    /** Hordes in the whole city, each on a different seeded street group. */
    hordes: pipe(Count, maxValue(16)),
    hordeAreas: optional(array(LayoutRect)),
    /** Metres each side of a street's centreline where stragglers stand. */
    roadsideOffset: pipe(Count, minValue(1), maxValue(32)),
    /** Stragglers added to each group on top of its baseline settlement count. */
    extraStragglers: pipe(Count, maxValue(16)),
  }),
  city: strictObject({
    settlementKind: Id,
    blocksX: pipe(Count, minValue(1), maxValue(4)),
    blocksZ: pipe(Count, minValue(1), maxValue(4)),
    ...CityBlockGeometry,
    /** Holds the ground at the city floor beyond the bounds instead of blending to the natural terrain, so a confined playtest site has no relief. */
    flatSurroundings: optional(vBoolean()),
    perimeter: optional(
      strictObject({
        block: Id,
        height: pipe(Count, minValue(1), maxValue(32)),
        thickness: pipe(Count, minValue(2), maxValue(8)),
        /** Solid wire fence on top of the wall. */
        wire: optional(strictObject({ block: Id, height: pipe(Count, minValue(1), maxValue(8)) })),
        /** Assembly set against the wall's inside face every `pitch` blocks, facing inward. */
        lining: optional(strictObject({ assembly: Id, pitch: pipe(Count, minValue(2), maxValue(64)) })),
        /** Assembly set against the wall where the central street meets it. */
        gate: optional(strictObject({ assembly: Id })),
      }),
    ),
    /** One row of buildings around the grid, backs to the wall and fronts to the outermost street. */
    ring: optional(strictObject({ pool: Id, setback: pipe(Count, minValue(1), maxValue(64)) })),
    streetProps: optional(pipe(array(Id), maxLength(16))),
    bounds: optional(LayoutRect),
    lots: optional(array(CityLotSchema)),
    underground: optional(array(CityUndergroundSchema)),
    fillRows: optional(vBoolean()),
    paving: optional(array(LayoutRect)),
    service: optional(
      strictObject({
        cell: tuple([CellCoordinate, CellCoordinate]),
        turn: picklist([0, 1, 2, 3]),
        routes: optional(array(PerimeterCrossingSchema)),
      }),
    ),
    pool: Id,
  }),
});
