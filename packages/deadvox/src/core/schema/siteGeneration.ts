import {
  array,
  check,
  integer,
  literal,
  maxValue,
  minLength,
  minValue,
  number,
  picklist,
  pipe,
  strictObject,
  tuple,
  variant,
} from 'valibot';
import { TREE_SHAPES, type TreeShape } from '../treeShapes.ts';
import { PositiveMetres } from './layouts.ts';
import { Count, Fraction, Id, NonNegative, Positive } from './primitives.ts';

/** Tree shapes in metres from the trunk's foot, built from half-metre slices (`src/core/vegetation.ts`, `treeShapes`). */
export const TreeCrownSchema = variant('kind', [
  /** Leaves filling an ellipsoid around the trunk. */
  strictObject({
    kind: literal('ellipsoid'),
    centreMetres: PositiveMetres,
    radiiMetres: tuple([PositiveMetres, PositiveMetres, PositiveMetres]),
  }),
  /** Square leaf layers from `baseMetres` up to `topMetres`, narrowing by `taper` metres per metre of height. */
  strictObject({
    kind: literal('cone'),
    baseMetres: NonNegative,
    topMetres: PositiveMetres,
    taper: Positive,
    minHalfWidthMetres: PositiveMetres,
  }),
]);

const TreeShapeSchema = pipe(
  strictObject({ crown: TreeCrownSchema, heightMetres: PositiveMetres, branchReachMetres: PositiveMetres }),
  check(({ crown }) => crown.kind !== 'cone' || crown.baseMetres < crown.topMetres, 'cone base must be below top'),
);

const TreesSchema = strictObject({
  trunkHalfWidthMetres: PositiveMetres,
  /** Two crossed branch layers, each this thick, the upper one this far below the trunk top. */
  branchLayer: strictObject({ topDropMetres: NonNegative, thicknessMetres: PositiveMetres }),
  shapes: strictObject(
    Object.fromEntries(TREE_SHAPES.map((shape) => [shape, TreeShapeSchema])) as Record<
      TreeShape,
      typeof TreeShapeSchema
    >,
  ),
});

import { capabilityField } from './capability.ts';

export const SiteGenerationSchema = strictObject({
  id: Id,
  capability: capabilityField('siteGeneration'),
  activeZombieRadiusMetres: PositiveMetres,
  topography: strictObject({
    amplitudeMetres: NonNegative,
    wavelengthMetres: PositiveMetres,
    buildingMarginMetres: NonNegative,
    roadShoulderMetres: NonNegative,
    spawnMarginMetres: NonNegative,
  }),
  // The natural ground every site stands on; metres, so a block size never changes the landscape.
  terrain: pipe(
    strictObject({
      minHeightMetres: NonNegative,
      maxHeightMetres: NonNegative,
      beachBelowMetres: NonNegative,
      dirtDepthMetres: NonNegative,
      featureSizeMetres: PositiveMetres,
      octaves: pipe(number(), integer('must be a whole number'), minValue(1, 'must be 1 or more')),
    }),
    check(({ minHeightMetres, maxHeightMetres }) => minHeightMetres < maxHeightMetres, 'min height must be below max'),
  ),
  vegetation: strictObject({
    woodlandEdgeWavelengthMetres: PositiveMetres,
    woodlandEdgeVariation: pipe(Fraction, maxValue(0.5, 'must not exceed 0.5')),
    openDensity: Fraction,
    obstacleMarginMetres: NonNegative,
    // One entry per draw, so repeating a shape weights it.
    treeMix: pipe(array(picklist(TREE_SHAPES)), minLength(1)),
    treeCellMetres: PositiveMetres,
    /** How far a tree may stray from its cell's centre on each axis. */
    treeJitterMetres: NonNegative,
    trees: TreesSchema,
    forestHalfExtentMetres: PositiveMetres,
    forestDensityField: strictObject({
      wavelengthMetres: PositiveMetres,
      seedSalt: Count,
      floor: Fraction,
      gain: NonNegative,
      ceiling: Fraction,
    }),
  }),
  // One palette shared by every site kind: terrain, paving, trees and litter are block ids.
  palette: strictObject({
    terrain: strictObject({ grass: Id, dirt: Id, rock: Id, sand: Id, water: Id }),
    paving: Id,
    trees: strictObject({ trunk: Id, branch: Id, leaves: Id }),
    leafLitter: Id,
  }),
});
