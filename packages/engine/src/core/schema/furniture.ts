import {
  array,
  check,
  finite,
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
import { POWER_UNITS, unitCount } from '../powerContent.ts';
import { shapeBlocks } from '../shapeSolid.ts';
import { capabilitySelection } from './capability.ts';
import { ContainerSchema, ReadableSchema, RecoveryWorkSchema } from './items.ts';
import { PlantInstrumentsSchema } from './plantInstruments.ts';
import {
  Color,
  Count,
  Fraction,
  GameMinutes,
  Id,
  Name,
  NonNegative,
  Positive,
  PositiveSimSeconds,
  QualityLevel,
  range,
  SimSeconds,
  Size,
  SkillLevel,
} from './primitives.ts';
import { skillFeeds } from './skillFeeds.ts';

const FiniteBlocks = pipe(number(), finite());

// ---- furniture ----

export const FurnitureMaterialSchema = pipe(
  strictObject({
    id: Id,
    /** What a blow on a piece of this material sounds like; it must alert hearing, since every blow is heard. */
    blowSound: Id,
    /** Per damage kind, the share of a blow's strength a piece of this material shrugs off, read as a block material's. */
    resistance: record(Id, Fraction),
    drops: optional(record(Id, Id)),
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

const Share = pipe(Fraction, minValue(Number.EPSILON));

/**
 * A cover on one face of a door leaf or a window frame (`packages/deadvox/docs/aftermath.md`, "Door variants", and
 * `packages/deadvox/docs/aftermath.md`, "Window variants"). Door boards hang on the leaf and swing with it. A cover without `curtain` protects: either face
 * refuses opening and it closes the opening to bodies. A `curtain` is textile: closed, it stops sight and light but
 * not bodies, and it opens and closes.
 */
export const BoardingSchema = pipe(
  strictObject({
    id: Id,
    name: Name,
    /** The opening it goes on. */
    fits: picklist(['door', 'window']),
    color: Color,
    /** How far each board stands proud of the leaf or frame, in blocks. */
    thicknessBlocks: pipe(Positive, maxValue(0.5)),
    /** Each board's band up the leaf or frame, as shares of its height. */
    boards: pipe(
      array(
        pipe(
          strictObject({ from: Fraction, height: Share }),
          check(({ from, height }) => from + height <= 1, 'a board stays within the leaf'),
        ),
      ),
      nonEmpty('needs at least one board'),
    ),
    /** Upright strips between the frame and the boards, as shares of the frame's width; the boards stand on them. */
    battens: optional(
      strictObject({
        color: Color,
        thicknessBlocks: pipe(Positive, maxValue(0.5)),
        strips: pipe(
          array(
            pipe(
              strictObject({ from: Fraction, width: Share }),
              check(({ from, width }) => from + width <= 1, 'a batten stays within the frame'),
            ),
          ),
          nonEmpty('needs at least one batten'),
        ),
      }),
    ),
    curtain: optional(
      strictObject({
        /** Each half, opened, gathers into this share of the frame's width at its own side. */
        gatheredShare: pipe(Share, maxValue(0.5)),
        handlingSimSeconds: SimSeconds,
      }),
    ),
    /** The materials recovered when this boarding comes off its door or window. */
    takeApart: optional(RecoveryWorkSchema),
  }),
  check(
    ({ fits, battens, curtain }) => fits === 'window' || (battens === undefined && curtain === undefined),
    'battens and curtains go on windows only',
  ),
  check(({ battens, curtain }) => !(battens && curtain), 'a curtain hangs without battens'),
);

const SeededPartSchema = strictObject({ item: Id, condition: range(Fraction) });

/**
 * The item slots of a placed housing (`packages/deadvox/docs/holdout.md`, "Supplies and progression"). Each slot holds
 * one part of an accepted type. An untouched slot is its `initial` part, if any, whose condition the world seed draws
 * from its range per placement and slot (`packages/deadvox/docs/decisions/0011-lazy-part-state.md`, "Decision").
 * With `failure`, the seed picks one `among` slot per placement whose untouched part is its `failed` one instead, so
 * every placement starts with exactly one fault to find. Removing or fitting a slot's part is one timed job on the
 * piece whose time, tools and skills are the slot's `service`. A slot's `name` is what the player calls it, so it
 * stays the same whichever part it holds, or none, and whether or not the housing places its slots on the model.
 */
export const PartBlueprintSchema = strictObject({
  id: Id,
  slots: pipe(
    array(
      strictObject({
        id: Id,
        name: Name,
        accepts: pipe(array(Id), nonEmpty('a slot accepts at least one item')),
        initial: optional(SeededPartSchema),
        failed: optional(SeededPartSchema),
        service: strictObject({
          /** Game minutes; 0 is an instant job that still runs the same review and Start. */
          timeGameMinutes: GameMinutes,
          qualities: optional(record(Id, QualityLevel), {}),
          skills: optional(record(capabilitySelection('skills'), SkillLevel), {}),
        }),
      }),
    ),
    nonEmpty('a blueprint has at least one slot'),
    check((slots) => new Set(slots.map(({ id }) => id)).size === slots.length, 'slot ids must be unique'),
  ),
  failure: optional(
    strictObject({
      among: pipe(
        array(Id),
        nonEmpty('a failure picks among at least one slot'),
        check((among) => new Set(among).size === among.length, 'failure slots must be unique'),
      ),
    }),
  ),
});

const DoorForcingSchema = strictObject({
  quality: Id,
  level: QualityLevel,
  strikeSound: Id,
  /** Sim seconds of work at skill level zero. */
  timeSimSeconds: PositiveSimSeconds,
  /** The skills that shorten the work, named by role so content keeps naming what drives it. */
  skills: skillFeeds('door.forcingSimSeconds'),
  /** Sim seconds between noisy strikes at skill level zero; skill shortens them with the work. */
  strikeIntervalSimSeconds: PositiveSimSeconds,
  /** Canister fill a finished cut spends; the cut won't start without it. A fuelled tool is needed. */
  fuel: optional(Positive),
});

/** How a doorway leaf or hatch reads as one that opens; lengths are in metres (`packages/deadvox/docs/content.md`, "Door detail"). */
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

const ShapeBoxes = pipe(array(FurnitureShapeBoxSchema), nonEmpty('needs at least one box'));

const boxesWithin = (
  boxes: readonly { position: readonly number[]; size: readonly number[] }[],
  size: readonly number[],
) => boxes.every(({ position, size: extent }) => position.every((at, axis) => at + extent[axis]! <= size[axis]!));

const HousingPoint = tuple([FiniteBlocks, FiniteBlocks, FiniteBlocks]);
const FiniteDegrees = pipe(number(), finite());
/** Degrees about the housing's X, then Y, then Z axis. */
const Orientation = tuple([FiniteDegrees, FiniteDegrees, FiniteDegrees]);

/**
 * Where a housing slot sits on the piece's model, so the player can pick the slot there. Positions are blocks from
 * the origin cell's centre in the piece's own axes, as plant instruments place theirs, and the pick box is centred on
 * the anchor. The socket is more of the piece's shape boxes, in its cell coordinates like `shape`, so a part kind's
 * socket look is content drawn as the piece is. The flag mount is relative to the anchor, so the slot's instrument
 * flag cannot drift from its pick box.
 */
const SlotAnchorSchema = strictObject({
  slot: Id,
  position: HousingPoint,
  orientationDegrees: optional(Orientation),
  pickSize: tuple([Positive, Positive, Positive]),
  socketShape: optional(ShapeBoxes),
  flagMount: optional(strictObject({ position: HousingPoint, orientationDegrees: optional(Orientation) })),
});

/**
 * Content-named services, such as a toilet, cooking or storage, that a building needs; furniture serves them and briefs
 * require them. A service claims a reachable fitting, never that it works
 * (`packages/deadvox/docs/building-pathway.md`, "Services").
 */
export const ServicesSchema = pipe(
  array(Id),
  nonEmpty('names at least one service'),
  check((services) => new Set(services).size === services.length, 'services must be distinct'),
);

export const FurnitureSchema = pipe(
  strictObject({
    id: Id,
    name: Name,
    /** The services the piece provides, whatever its condition. */
    serves: optional(ServicesSchema),
    /** Cells, in blocks: [x, y, z]. It's anchored at its lowest corner. */
    size: Size,
    color: Color,
    /** The furniture material whose damage looks the piece shows (`packages/deadvox/DESIGN.md`, "Block entities"). */
    material: Id,
    /** Estimated kilograms for a piece that can be lifted or dragged. */
    massKg: optional(NonNegative),
    solid: optional(vBoolean()),
    /** A flat piece that may lie on a shut hatch (`packages/deadvox/DESIGN.md`, "Moving furniture"); it must be non-solid and one block high. */
    cover: optional(literal(true)),
    /** A debug practice surface; hits may receive a profile-specific presentation ping. */
    shotTarget: optional(literal(true)),
    scenarioGoal: optional(literal(true)),
    /** Carried, it turns but won't tip over (`packages/deadvox/DESIGN.md`, "Moving furniture"). */
    upright: optional(literal(true)),
    readable: optional(ReadableSchema),
    /** What the piece hangs on: the block behind its back face, or the block over its top face. */
    mount: optional(picklist(['wall', 'ceiling'])),
    container: optional(ContainerSchema),
    /** Sound emitted when searching this furniture; it must alert hearing. */
    searchNoise: optional(strictObject({ sound: Id })),
    moveSounds: optional(strictObject({ lift: Id, drag: Id })),
    window: optional(
      strictObject({
        inside: picklist(['front', 'back']),
        hinge: picklist(['low', 'high']),
        thicknessBlocks: Positive,
        frameWidthBlocks: Positive,
        sashWidthBlocks: Positive,
        passageLeewayMetres: NonNegative,
        openTurnRadians: pipe(number(), finite()),
        handlingSimSeconds: SimSeconds,
        initialPane: picklist(['intact', 'missing']),
        initialLatched: vBoolean(),
        minimumForce: Positive,
        breakForce: Positive,
        forceTaken: Positive,
        shards: strictObject({ item: Id, count: pipe(Count, minValue(1)) }),
        impactSound: Id,
        shatterSound: Id,
        glass: strictObject({ color: Color, opacity: pipe(Positive, maxValue(1)), thicknessBlocks: Positive }),
        hardwareColor: Color,
        hardwareSizeBlocks: Positive,
        remnantHeightBlocks: Positive,
      }),
    ),
    /** It opens and closes, taking this many Sim seconds. */
    door: optional(
      strictObject({
        handlingSimSeconds: SimSeconds,
        methods: record(Id, DoorForcingSchema),
        openSound: optional(Id),
        closeSound: optional(Id),
        blockedCloseSound: optional(Id),
        /** It lies flat in a floor or roof and swings up on its hinge edge, which is on its facing side. */
        hatch: optional(literal(true)),
        detail: optional(DoorDetailSchema),
      }),
    ),
    /**
     * How the piece yields to blows (`packages/deadvox/DESIGN.md`, "Block entities"); every piece has it. Strength is in the N·s of a
     * melee weapon's `impulse`: a blow below `minimumStrength` does nothing, and the strengths of blows at or above it
     * add up to `durability`, which ruins the piece.
     */
    breach: strictObject({ minimumStrength: Positive, durability: Positive }),
    /**
     * Worldgen may place the piece already worn, by a share of its durability drawn from this range (`packages/deadvox/DESIGN.md`,
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
    /** What a ruined piece leaves besides its contents (`packages/deadvox/DESIGN.md`, "Damage, destruction and dismemberment"). */
    ruin: optional(
      strictObject({
        debris: array(strictObject({ item: Id, count: pipe(Count, minValue(1, 'must be at least 1')) })),
      }),
    ),
    /**
     * How taking the piece apart goes (`packages/deadvox/DESIGN.md`, "World repair selection"): an authored `yield`
     * for a whole piece, or a `partBlueprints` id whose housing slots hold parts removed or fitted one at a time.
     */
    takeApart: optional(
      pipe(
        strictObject({ yield: optional(RecoveryWorkSchema), parts: optional(Id) }),
        check(
          (route) => (route.yield === undefined) !== (route.parts === undefined),
          "a piece's take-apart route is an authored yield or a parts blueprint, exactly one",
        ),
      ),
    ),
    /**
     * The player climbs it; its facing is the side the climber stands on (`packages/deadvox/DESIGN.md`, "Ladders and
     * hatches"). With a `load`, a piece bears a climber of at most `limitKg` at full condition, scaled by its condition
     * raised to `conditionExponent`; without one it bears any climber.
     */
    climbable: optional(
      strictObject({
        speedMetresPerSimSecond: Positive,
        load: optional(strictObject({ limitKg: Positive, conditionExponent: Positive })),
      }),
    ),
    appearance: optional(
      strictObject({
        kind: picklist(['cabinet', 'drawers', 'fridge', 'door', 'lid', 'rack']),
        surface: picklist(['wood', 'painted-metal', 'plastic']),
      }),
    ),
    /**
     * A dead human, drawn as the figure lying in its corpse pose and dressed in the named outfit of that figure
     * (`packages/deadvox/DESIGN.md`, "Dead humans").
     */
    corpse: optional(strictObject({ figure: Id, outfit: Id })),
    /** Boxes in cell coordinates that the piece is drawn as. */
    shape: optional(ShapeBoxes),
    /**
     * Absent, the housing's slots are served from their list alone. Present, it places every slot of the parts
     * blueprint exactly once, so no slot is pickable on the model while another is not.
     */
    slotAnchors: optional(
      pipe(
        array(SlotAnchorSchema),
        nonEmpty('slot anchors place at least one slot'),
        check((anchors) => new Set(anchors.map(({ slot }) => slot)).size === anchors.length, 'anchor each slot once'),
      ),
    ),
    stockAppearance: optional(
      strictObject({
        fullCount: pipe(Count, minValue(1)),
        steps: pipe(
          array(strictObject({ from: Fraction, shape: pipe(array(FurnitureShapeBoxSchema), nonEmpty()) })),
          nonEmpty(),
          check(
            (steps) => steps[0]!.from === 0 && steps.every((step, at) => at === 0 || step.from > steps[at - 1]!.from),
            'stock looks start at zero with strictly rising fill shares',
          ),
        ),
      }),
    ),
    /**
     * A solid shaped piece that isn't a door stops movement and light only in the blocks its `shape` fills to at least
     * this fraction, so a player can walk where it looks open.
     */
    solidFill: optional(Fraction),
    /**
     * Rendered as a content vehicle blueprint (`packages/mods/skelly.ground-vehicles/vehicles.jsonnet`), whose
     * finishes its fittings author. `removed` names fittings the wreck is without (checked against the blueprint in
     * `packages/engine/src/core/content.ts`, `checkFurnitureVehicle`), and its blocks stop movement and light where
     * its parts fill at least `solidFill` of them, so a low bonnet can be climbed while the cabin still blocks.
     */
    vehicle: optional(
      strictObject({
        blueprint: string(),
        removed: array(string()),
        solidFill: Fraction,
      }),
    ),
    power: optional(
      strictObject({
        device: Id,
        fuelLitres: pipe(
          NonNegative,
          check((value) => unitCount(value, POWER_UNITS.amount) !== undefined, 'fuel must be exact in power units'),
        ),
        enabled: vBoolean(),
        instruments: optional(PlantInstrumentsSchema),
        /**
         * The housing parts a source needs to produce, each in a slot of the piece's parts blueprint
         * (`packages/deadvox/docs/holdout.md`, "Supplies and progression"). A part counts while it is one of `parts`
         * and at least `minimum` condition; without a `minimum`, only ruin stops it. A `critical` requirement is an
         * authored initial failure, the only kind whose seeded part may start failing.
         */
        requires: optional(
          pipe(
            array(
              strictObject({
                slot: Id,
                parts: pipe(array(Id), nonEmpty('a requirement names at least one working part')),
                minimum: optional(Fraction),
                critical: optional(literal(true)),
              }),
            ),
            nonEmpty('a source with requirements needs at least one'),
            check(
              (requires) => new Set(requires.map(({ slot }) => slot)).size === requires.length,
              'each slot is required at most once',
            ),
          ),
        ),
        light: optional(
          strictObject({
            color: Color,
            intensity: Positive,
            radius: Positive,
            /** Metres from which agents sense the lit fixture, matching item lights' own authored reach. */
            seenFrom: Positive,
            emissive: optional(NonNegative),
            /** Blocks from the centre of the piece's origin cell, in its own axes; absent, it shines from that centre. */
            offset: optional(tuple([FiniteBlocks, FiniteBlocks, FiniteBlocks])),
          }),
        ),
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
    ({ window, door, shape, container, vehicle, corpse, mount, climbable, cover, appearance, size }) =>
      !window ||
      (!(door || shape || container || vehicle || corpse || mount || climbable || cover || appearance) &&
        size[2] === 1 &&
        window.thicknessBlocks <= size[2] &&
        2 * (window.frameWidthBlocks + window.sashWidthBlocks) < Math.min(size[0], size[1]) &&
        window.openTurnRadians !== 0),
    'a window is an upright fitted opening with room for its frame, sash and pane, not another furniture mechanism',
  ),
  check(
    ({ stockAppearance, container, shape, door, appearance, corpse, vehicle, size }) =>
      !stockAppearance ||
      (container?.accepts !== undefined &&
        shape !== undefined &&
        !door &&
        !appearance &&
        !corpse &&
        !vehicle &&
        stockAppearance.steps.every((step) => boxesWithin(step.shape, size))),
    'stock looks need a filtered shaped container and boxes within its size',
  ),
  check(
    ({ size, shape, slotAnchors }) =>
      boxesWithin(shape ?? [], size) &&
      (slotAnchors ?? []).every(({ socketShape }) => boxesWithin(socketShape ?? [], size)),
    (issue) => `shape boxes of "${(issue.input as { id: string }).id}" must stay within furniture size`,
  ),
  check(
    ({ shape, slotAnchors }) => shape !== undefined || !slotAnchors?.some(({ socketShape }) => socketShape),
    'sockets are drawn on the piece as more of its shape, so a piece with socket shapes needs a shape',
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
    ({ appearance, container, shape, door, readable }) =>
      !appearance || (container !== undefined && !shape && !door && !readable),
    'appearance needs a plain container without a shape, door or readable',
  ),
  check(({ door, shape }) => !(door?.hatch && shape), 'a hatch is its own panel and cannot have a shape'),
  check(
    ({ power, corpse, vehicle }) => power?.light?.emissive === undefined || !(corpse || vehicle),
    'body glow belongs on furniture meshes, not separately rendered corpses or vehicles',
  ),
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
    'a cover must be non-solid, one block high and not a door, ladder or mount',
  ),
  check(
    ({ mount, size, shape, solid }) =>
      mount !== 'wall' ||
      (size.every((extent) => extent === 1) &&
        solid === false &&
        shape?.length === 1 &&
        shape.every(
          ({ position: [x, y, z], size: [w, h, d] }) =>
            x === 0 && y === 0 && w === 1 && h === 1 && d < 1 && z + d === 1,
        )),
    'a wall mount needs a non-solid single-cell shape spanning its face, thin and flush with its back',
  ),
  check(
    ({ mount, size, shape, solid }) =>
      mount !== 'ceiling' ||
      (size.every((extent) => extent === 1) &&
        solid === false &&
        shape?.some(({ position: [, y], size: [, h] }) => y + h === 1) === true),
    'a ceiling mount needs a non-solid single-cell shape that reaches its top face',
  ),
);
