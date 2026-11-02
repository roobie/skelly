import { array, integer, minValue, nonEmpty, number, pipe, rawCheck, strictObject, tuple } from 'valibot';
import { Cells } from './items.ts';
import { Fraction, Id, Name, NonNegative, Positive, PositiveSimSeconds, SimRate, SimSeconds } from './primitives.ts';

/** Ordered lower bounds with a word each; the first starts at 0 and each rises, so every value in [0, 1] reads as one band. */
const ConditionBandsSchema = pipe(
  array(strictObject({ from: Fraction, word: Name })),
  nonEmpty('needs at least one band'),
  rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) {
      return;
    }
    dataset.value.forEach(({ from }, index) => {
      if (index === 0 && from !== 0) {
        addIssue({ message: `bands[${index}].from must be 0 so no value is left without a word` });
      } else if (index > 0 && !(from > dataset.value[index - 1]!.from)) {
        addIssue({ message: `bands[${index}].from must be above the band before it, or bands overlap` });
      }
    });
  }),
);

import { capabilityField } from './capability.ts';

export const InventoryTuningSchema = strictObject({
  id: Id,
  capability: capabilityField('inventory'),
  /** What a condition reads as (`DESIGN.md`, "The item model"); furniture reads the same table. */
  conditionBands: ConditionBandsSchema,
  /** The real side of one inventory cell; footprints and pockets are real sizes rounded up to it (`DESIGN.md`, "The item model"). */
  cellMetres: Positive,
  /** Maximum width, in cells, for a container pocket without a content-owned exception. */
  containerMaxWidthCells: Cells,
  keyHoldRealSeconds: Positive,
  /** Most pile states validation explores for one ground supply before calling it unproven (`DESIGN.md`, "Loot"). */
  groundPileStateCap: Cells,
  /** Tall placement's free-rectangle gain over its empty-grid baseline must exceed this many cells. */
  autoPlacementTallMinFreeAreaGainCells: pipe(number(), integer(), minValue(0)),
  /** Metres from the chest to the nearest point of a pile, furniture box or body for inventory actions. */
  reachMetres: Positive,
  /** Metres above the feet at which reach is measured. */
  chestHeightMetres: Positive,
  /** Metres within which a looked-at furniture piece can be used. */
  useReachMetres: Positive,
  /** Searching a container takes `minSimSeconds` for an empty one, rising linearly to `maxSimSeconds` at `cellsForMax` pocket cells. */
  search: strictObject({ minSimSeconds: SimSeconds, maxSimSeconds: SimSeconds, cellsForMax: Cells }),
  /** Sim seconds a thrown item takes from the hand to where it lands. */
  throwFlightSimSeconds: Positive,
  /** Air resistance on a thrown item (`DESIGN.md`, "Held-item throws"). */
  throwDrag: strictObject({
    airDensityKgPerCubicMetre: NonNegative,
    /** Drag coefficient against the item's footprint area; it folds in the shape and how much of the footprint faces the air. */
    footprintDragCoefficient: NonNegative,
  }),
  /** Carrying furniture in both hands (`DESIGN.md`, "Moving furniture"). */
  furnitureMove: strictObject({
    /** The largest piece the player can lift, along each side. */
    maxSizeMetres: Positive,
    /** Stamina curves for moving furniture: each drains `base + perKg * massKg`. */
    fatigue: strictObject({
      lift: strictObject({ base: NonNegative, perKg: NonNegative }),
      drag: strictObject({ base: NonNegative, perKg: NonNegative }),
      carry: strictObject({ basePerSimSecond: SimRate, perKgPerSimSecond: SimRate }),
    }),
    slide: strictObject({
      stepSimSeconds: PositiveSimSeconds,
    }),
    /** How the carried piece shows in first person, in view metres (x right, y up, z back from the eye). */
    carriedView: strictObject({
      offsetMetres: tuple([number(), number(), number()]),
      /** The piece's longest side is drawn this long, so a big piece doesn't fill the view. */
      sizeMetres: Positive,
      /** How far it rises and sinks while held, and how many times a real second. */
      bobMetres: NonNegative,
      bobPerRealSecond: NonNegative,
    }),
  }),
});
