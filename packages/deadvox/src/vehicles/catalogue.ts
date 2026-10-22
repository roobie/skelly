/** Every part type the spike's vehicles use, under one id each. */
import { APC, APC_PARTS } from './apc.ts';
import { BOX_VAN, BOX_VAN_PARTS } from './boxVan.ts';
import { type Blueprint, catalogueOf, type PartCatalogue } from './model.ts';
import { MOTORBIKE, MOTORBIKE_PARTS } from './motorbike.ts';
import { PICKUP, PICKUP_PARTS } from './pickup.ts';
import { RANGE_ROVER, RANGE_ROVER_PARTS } from './rangeRover.ts';
import { SEDAN, SEDAN_PARTS } from './sedan.ts';

/** The blueprints furniture content may show as a vehicle (`vehicle.blueprint`), by id. */
export const BLUEPRINTS: Readonly<Record<string, Blueprint>> = Object.fromEntries(
  [RANGE_ROVER, PICKUP, BOX_VAN, SEDAN, MOTORBIKE, APC].map((blueprint) => [blueprint.id, blueprint]),
);

export const CATALOGUE: PartCatalogue = catalogueOf([
  ...RANGE_ROVER_PARTS,
  ...PICKUP_PARTS,
  ...BOX_VAN_PARTS,
  ...SEDAN_PARTS,
  ...MOTORBIKE_PARTS,
  ...APC_PARTS,
]);
