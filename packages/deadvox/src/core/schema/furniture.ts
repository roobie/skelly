import {
  array,
  check,
  literal,
  ltValue,
  maxValue,
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
  boolean as vBoolean,
} from 'valibot';
import { BLUEPRINTS } from '../../vehicles/catalogue.ts';
import { solidBlocks } from '../../vehicles/solid.ts';
import { POWER_UNITS, unitCount } from '../powerContent.ts';
import { shapeBlocks } from '../shapeSolid.ts';
import { SOUND_EVENT_IDS } from '../soundEvents.ts';
import { ContainerSchema, ReadableSchema } from './items.ts';
import {
  Color,
  Count,
  Fraction,
  Id,
  Name,
  NonNegative,
  Positive,
  PositiveSimSeconds,
  QualityLevel,
  SimSeconds,
  Size,
} from './primitives.ts';

// ---- furniture ----

export const FurnitureMaterialSchema = pipe(
  strictObject({
    id: Id,
    /** What a blow on a piece of this material sounds like; it must alert hearing, since every blow is heard. */
    blowSound: Id,
    /** Forcing methods a door of this material admits; a door's material must list them. */
    methods: optional(array(Id)),
    /** How a broken leaf of this material is painted: its colour moves `strength` of the way to `tint`. */
    broken: optional(strictObject({ tint: Color, strength: Fraction })),
    /**
     * How a piece is painted as its damage grows toward ruin, so the player sees how close it is to giving way.
     * Each step applies once the damage reaches `from`, a fraction of the piece's durability; the last step reached wins.
     */
    damaged: optional(array(strictObject({ from: Fraction, tint: Color, strength: Fraction }))),
  }),
  check(
    ({ damaged }) => (damaged ?? []).every((step, at) => at === 0 || step.from > damaged![at - 1]!.from),
    'damage looks need strictly rising thresholds',
  ),
);

const DoorForcingSchema = pipe(
  strictObject({
    quality: Id,
    level: QualityLevel,
    strikeSound: Id,
    /** Skill whose level shortens forcing time. */
    skill: Id,
    /** Sim seconds of work at the lowest skill level. */
    timeSimSeconds: PositiveSimSeconds,
    /** Sim seconds of work at the fastest skill level. */
    fastestTimeSimSeconds: PositiveSimSeconds,
    /** Sim seconds between noisy strikes at the lowest skill level. */
    strikeIntervalSimSeconds: PositiveSimSeconds,
    /** Canister fill a finished cut spends; the cut won't start without it. A fuelled tool is needed. */
    fuel: optional(Positive),
  }),
  check(
    ({ timeSimSeconds, fastestTimeSimSeconds }) => fastestTimeSimSeconds <= timeSimSeconds,
    'fastest forcing time cannot exceed the base time',
  ),
);

/** How a doorway leaf or hatch reads as one that opens; lengths are in metres (`docs/content.md`, "Door detail"). */
const DoorDetailSchema = strictObject({
  /** Colour of the handle and hinges. */
  hardware: Color,
  /** How far the fields stand off each face of the leaf. */
  relief: Positive,
  /** Bare border round the fields, and the gap between them; both show the leaf's darker core. */
  frame: NonNegative,
  seam: NonNegative,
  /** Raised fields across the leaf from its hinge edge, and along that edge. */
  fields: tuple([pipe(Count, minValue(1, 'must be at least 1')), pipe(Count, minValue(1, 'must be at least 1'))]),
  /** Strap hinges lying on both faces from the hinge edge. */
  hinges: strictObject({ count: Count, length: Positive, width: Positive }),
  /** On both faces: its grip centre lies `fromFreeEdge` in from the free edge and `along` the length of the hinge edge. */
  handle: strictObject({
    kind: picklist(['knob', 'lever', 'pull', 'bar', 'ring']),
    fromFreeEdge: Positive,
    along: Fraction,
    length: Positive,
    thickness: Positive,
  }),
});

const FurnitureShapeBoxSchema = strictObject({
  /** Lower corner in the furniture's cell coordinates. */
  position: tuple([NonNegative, NonNegative, NonNegative]),
  /** Extent in cell coordinates. */
  size: tuple([Positive, Positive, Positive]),
  /** Paints this box instead of the furniture's colour, so a heap can mix materials. */
  color: optional(Color),
});

export const FurnitureSchema = pipe(
  strictObject({
    id: Id,
    name: Name,
    /** Cells, in blocks: [x, y, z]. It's anchored at its lowest corner. */
    size: Size,
    color: Color,
    /** The furniture material whose damage looks the piece shows (`DESIGN.md`, "Block entities"). */
    material: Id,
    /** Estimated kilograms for a piece that can be lifted or dragged. */
    massKg: optional(NonNegative),
    solid: optional(vBoolean()),
    /** A flat piece that may lie on a shut hatch (`DESIGN.md`, "Moving furniture"); it must be non-solid and one block high. */
    cover: optional(literal(true)),
    /** A debug practice surface; hits may receive a profile-specific presentation ping. */
    shotTarget: optional(literal(true)),
    scenarioGoal: optional(literal(true)),
    /** Carried, it turns but won't tip over (`DESIGN.md`, "Moving furniture"). */
    upright: optional(literal(true)),
    readable: optional(ReadableSchema),
    mount: optional(literal('wall')),
    container: optional(ContainerSchema),
    /** Sound emitted when searching this furniture; it must alert hearing. */
    searchNoise: optional(strictObject({ sound: picklist([...SOUND_EVENT_IDS]) })),
    /** It opens and closes, taking this many Sim seconds. */
    door: optional(
      strictObject({
        handlingSimSeconds: SimSeconds,
        methods: record(Id, DoorForcingSchema),
        openNoise: optional(strictObject({ sound: picklist([...SOUND_EVENT_IDS]) })),
        /** It lies flat in a floor or roof and swings up on its hinge edge, which is on its facing side. */
        hatch: optional(literal(true)),
        /** Barricaded from this side, the facing side (`front`) or its opposite (`back`): it opens only from the other. */
        barredFrom: optional(picklist(['front', 'back'])),
        detail: optional(DoorDetailSchema),
      }),
    ),
    /**
     * How the piece yields to blows (`DESIGN.md`, "Block entities"); every piece has it. Strength is in the N·s of a
     * melee weapon's `impulse`: a blow below `minimumStrength` does nothing, and the strengths of blows at or above it
     * add up to `durability`, which ruins the piece.
     */
    breach: strictObject({ minimumStrength: Positive, durability: Positive }),
    /**
     * Worldgen may place the piece already worn, by a share of its durability drawn from this range (`DESIGN.md`,
     * "Block entities"). Both ends stay below 1, so a placed piece is never ruined; no range places it intact.
     */
    wear: optional(
      pipe(
        strictObject({
          from: pipe(number(), minValue(0, 'must be 0 or more'), maxValue(1 - Number.EPSILON, 'must be below 1')),
          to: pipe(number(), minValue(0, 'must be 0 or more'), maxValue(1 - Number.EPSILON, 'must be below 1')),
        }),
        check(({ from, to }) => from <= to, 'wear must run from the lower share to the higher'),
      ),
    ),
    /** What a ruined piece leaves besides its contents (`DESIGN.md`, "Damage, destruction and dismemberment"). */
    ruin: optional(
      strictObject({
        debris: array(strictObject({ item: Id, count: pipe(Count, minValue(1, 'must be at least 1')) })),
      }),
    ),
    /** The player climbs it; its facing is the side the climber stands on (`DESIGN.md`, "Ladders and hatches"). */
    climbable: optional(strictObject({ speedMetresPerSimSecond: Positive })),
    appearance: optional(
      strictObject({
        kind: picklist(['cabinet', 'drawers', 'fridge', 'door', 'lid', 'rack']),
        surface: picklist(['wood', 'painted-metal', 'plastic']),
      }),
    ),
    /**
     * A dead human, drawn as the figure lying in its corpse pose and dressed in the named outfit of that figure
     * (`DESIGN.md`, "Dead humans").
     */
    corpse: optional(strictObject({ figure: Id, outfit: Id })),
    /** Boxes in cell coordinates that the piece is drawn as. */
    shape: optional(pipe(array(FurnitureShapeBoxSchema), nonEmpty('needs at least one box'))),
    /**
     * A solid shaped piece that isn't a door stops movement and light only in the blocks its `shape` fills to at least
     * this fraction, so a player can walk where it looks open.
     */
    solidFill: optional(Fraction),
    /**
     * Rendered as this vehicle: a blueprint without the `removed` fittings, in `body` paint, `dirt` grimy (0 clean to
     * 1 filthy). Its blocks stop movement and light where its parts fill at least `solidFill` of them, so a low
     * bonnet can be climbed while the cabin still blocks.
     */
    vehicle: optional(
      pipe(
        strictObject({
          blueprint: string(),
          body: Color,
          dirt: Fraction,
          removed: array(string()),
          solidFill: Fraction,
        }),
        check(({ blueprint }) => BLUEPRINTS[blueprint] !== undefined, 'unknown vehicle blueprint'),
        check(
          ({ blueprint, removed }) =>
            removed.every((id) => BLUEPRINTS[blueprint]?.fittings.some((fitting) => fitting.id === id)),
          'removed names a fitting the blueprint lacks',
        ),
      ),
    ),
    power: optional(
      strictObject({
        device: Id,
        fuelLitres: pipe(
          NonNegative,
          check((value) => unitCount(value, POWER_UNITS.amount) !== undefined, 'fuel must be exact in power units'),
        ),
        enabled: vBoolean(),
        light: optional(strictObject({ color: Color, intensity: Positive, radius: Positive })),
      }),
    ),
    charger: optional(
      strictObject({
        batteries: pipe(array(Id), nonEmpty('needs a compatible battery')),
        pocket: pipe(number(), safeInteger(), minValue(0)),
        efficiency: pipe(Positive, maxValue(1)),
      }),
    ),
    /** Comfort scales fatigue recovery; sleepable pieces also enable the sleep rate. */
    rest: optional(strictObject({ quality: Fraction, sleep: optional(literal(true)) })),
    /**
     * A station available to matching recipes within reach; bonus is the fraction removed from work time.
     * Below 1, because a whole bonus leaves a recipe with its inputs at hand no work time, and restore refuses that.
     */
    workstation: optional(
      strictObject({
        id: Id,
        qualities: record(Id, QualityLevel),
        workFactorBonus: pipe(number(), minValue(0, 'must be 0 or more'), ltValue(1, 'must be less than 1')),
      }),
    ),
  }),
  check(
    ({ size, shape }) =>
      shape === undefined ||
      shape.every(
        ({ position: [x, y, z], size: [w, h, d] }) => x + w <= size[0] && y + h <= size[1] && z + d <= size[2],
      ),
    (issue) => `shape boxes of "${(issue.input as { id: string }).id}" must stay within furniture size`,
  ),
  check(
    ({ shape, solid, door, solidFill }) =>
      (solidFill !== undefined) === (shape !== undefined && solid !== false && door === undefined),
    'solidFill belongs on exactly the solid shaped pieces that are not doors',
  ),
  // Its blocks stay within its size because its boxes do (checked above), so only emptiness is left to refuse.
  check(
    ({ shape, solidFill }) =>
      shape === undefined || solidFill === undefined || shapeBlocks(shape, solidFill).length > 0,
    (issue) => `shaped piece "${(issue.input as { id: string }).id}" must block somewhere`,
  ),
  check(
    ({ size, vehicle }) => {
      if (vehicle === undefined || BLUEPRINTS[vehicle.blueprint] === undefined) {
        return true;
      }
      const blocks = solidBlocks(vehicle, size);
      return blocks.length > 0 && blocks.every((block) => block.every((at, axis) => at >= 0 && at < size[axis]!));
    },
    (issue) => `vehicle piece "${(issue.input as { id: string }).id}" must block somewhere, and only within its size`,
  ),
  check(
    ({ appearance, container, shape, door, readable }) =>
      !appearance || (container !== undefined && !shape && !door && !readable),
    'appearance needs a plain container without a shape, door or readable',
  ),
  check(({ door, shape }) => !(door?.hatch && shape), 'a hatch is its own panel and cannot have a shape'),
  check(
    ({ corpse, shape, appearance, door, vehicle, solid }) =>
      !corpse || (!(shape || appearance || door || vehicle) && solid === false),
    'a corpse is drawn as its figure, so it is non-solid and has no shape, appearance, door or vehicle',
  ),
  // The same reading as `src/core/blockEntities.ts`, `isBodyDoor`: a body door is the front of its own drawn body.
  check(
    ({ door, shape, container }) => !door?.detail || shape === undefined || container === undefined,
    'a body door draws its handle on its body, so door detail belongs only on doorway leaves and hatches',
  ),
  // The same reading as `src/core/blockEntities.ts`, `isBodyDoor`: any other door breaks instead of being ruined.
  check(
    ({ ruin, door, shape, container }) => !(ruin && door) || (shape !== undefined && container !== undefined),
    'a door leaf breaks rather than being ruined, so it leaves no debris',
  ),
  check(({ climbable, solid }) => !climbable || solid === false, 'a climbable piece must not be solid'),
  check(
    ({ cover, solid, size, door, climbable, mount }) =>
      !cover || (solid === false && size[1] === 1 && !door && !climbable && !mount),
    'a cover must be non-solid, one block high and not a door, ladder or wall mount',
  ),
  check(
    ({ mount, size, shape, solid }) =>
      !mount ||
      (size.every((extent) => extent === 1) &&
        solid === false &&
        shape?.length === 1 &&
        shape.every(
          ({ position: [x, y, z], size: [w, h, d] }) =>
            x === 0 && y === 0 && w === 1 && h === 1 && d < 1 && z + d === 1,
        )),
    'a wall mount needs a non-solid single-cell shape spanning its face, thin and flush with its back',
  ),
);
