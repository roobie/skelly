import { array, check, type InferOutput, minValue, nonEmpty, pipe, record, strictObject } from 'valibot';
import { Count, Id, Name, range } from './primitives.ts';
import { BuildingEligibilitySchema } from './templates.ts';

// Why each field exists: `packages/deadvox/docs/building-pathway.md`, "Brief".

/** The plot a building's footprint must fit, in blocks along the street and back from it. */
const PlotFitSchema = strictObject({ along: pipe(Count, minValue(1)), depth: pipe(Count, minValue(1)) });

export type PlotFit = InferOutput<typeof PlotFitSchema>;

/** Where and when the world is, which briefs name instead of each restating it. */
export const WorldSettingSchema = strictObject({
  id: Id,
  region: Name,
  era: Name,
  buildingCulture: Name,
  /** The settlement kinds this setting has; a brief's kinds must be among them. */
  settlementKinds: BuildingEligibilitySchema.entries.settlementKinds,
});

/** The constraints a curated building answers; an assembly names the brief, so many buildings answer one. */
export const BuildingBriefSchema = strictObject({
  id: Id,
  setting: Id,
  eligibility: BuildingEligibilitySchema,
  plot: PlotFitSchema,
  /** Map style ids every answer may build in. */
  styles: pipe(array(Id), nonEmpty()),
  /** How many storeys `access.storeys` may declare. */
  storeys: pipe(
    range(Count),
    check(([min]) => min >= 1, 'a building has at least one storey'),
  ),
  /** Standing anchor names the answer must carry, each with what the room is for. */
  program: pipe(
    record(Id, Name),
    check((rooms) => Object.keys(rooms).length > 0, 'needs at least one room'),
  ),
  references: pipe(array(Name), nonEmpty()),
  facade: Name,
  cover: Name,
});
