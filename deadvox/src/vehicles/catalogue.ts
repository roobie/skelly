/** Every part type the spike's vehicles use, under one id each. */
import { HATCHBACK_PARTS } from './hatchback.ts';
import { catalogueOf, type PartCatalogue } from './model.ts';
import { MOTORBIKE_PARTS } from './motorbike.ts';
import { PICKUP_PARTS } from './pickup.ts';
import { RANGE_ROVER_PARTS } from './rangeRover.ts';

export const CATALOGUE: PartCatalogue = catalogueOf([
  ...RANGE_ROVER_PARTS,
  ...PICKUP_PARTS,
  ...MOTORBIKE_PARTS,
  ...HATCHBACK_PARTS,
]);
