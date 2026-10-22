/** Every part type the spike's vehicles use, under one id each. */
import { HATCHBACK, HATCHBACK_PARTS } from './hatchback.ts';
import { HOIST, HOIST_PARTS } from './hoist.ts';
import { type Blueprint, catalogueOf, type PartCatalogue } from './model.ts';
import { MOTORBIKE, MOTORBIKE_PARTS } from './motorbike.ts';
import { PICKUP, PICKUP_PARTS } from './pickup.ts';
import { RANGE_ROVER, RANGE_ROVER_PARTS } from './rangeRover.ts';

/** The blueprints furniture content may show as a vehicle (`vehicle.blueprint`), by id. */
export const BLUEPRINTS: Readonly<Record<string, Blueprint>> = Object.fromEntries(
  [RANGE_ROVER, PICKUP, HOIST, MOTORBIKE, HATCHBACK].map((blueprint) => [blueprint.id, blueprint]),
);

export const CATALOGUE: PartCatalogue = catalogueOf([
  ...RANGE_ROVER_PARTS,
  ...PICKUP_PARTS,
  ...HOIST_PARTS,
  ...MOTORBIKE_PARTS,
  ...HATCHBACK_PARTS,
]);
