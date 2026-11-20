import {
  array,
  check,
  type InferOutput,
  literal,
  minValue,
  nonEmpty,
  optional,
  pipe,
  record,
  strictObject,
} from 'valibot';
import { UsageTagSchema } from '../loot.ts';
import { ServicesSchema } from './furniture.ts';
import { Count, Id, Name, range } from './primitives.ts';
import { BuildingEligibilitySchema } from './templates.ts';

// Why each field exists: `packages/deadvox/docs/building-pathway.md`, "Brief".

/** The plot a building's footprint must fit, in blocks along the street and back from it. */
const PlotFitSchema = strictObject({ along: pipe(Count, minValue(1)), depth: pipe(Count, minValue(1)) });

export type PlotFit = InferOutput<typeof PlotFitSchema>;

/** The services every answer of one settlement kind and loot usage must place, beyond what its brief's rooms ask. */
const ServiceStandardSchema = strictObject({
  settlementKind: Id,
  usage: UsageTagSchema,
  serves: ServicesSchema,
});

/** Where and when the world is, which briefs name instead of each restating it. */
export const WorldSettingSchema = strictObject({
  id: Id,
  region: Name,
  era: Name,
  buildingCulture: Name,
  /** The settlement kinds this setting has; a brief's kinds must be among them. */
  settlementKinds: BuildingEligibilitySchema.entries.settlementKinds,
  /** The tags a brief may carry, each with what it means. */
  tags: pipe(
    record(Id, Name),
    check((tags) => Object.keys(tags).length > 0, 'needs at least one tag'),
  ),
  standards: optional(array(ServiceStandardSchema)),
});

/** A room the answer must carry: a standing anchor under the room's name. */
const ProgramRoomSchema = strictObject({
  purpose: Name,
  /** The services the room asks of the answer's furniture. */
  serves: optional(ServicesSchema),
  /**
   * A room only an answer with a cellar carries, standing on a cellar storey: a declared storey whose floor lies below
   * the ground storey's.
   */
  cellar: optional(literal(true)),
});

/** The constraints a curated building answers; an assembly names the brief, so many buildings answer one. */
export const BuildingBriefSchema = strictObject({
  id: Id,
  setting: Id,
  /** Tags from the setting, such as the cultures and eras the brief draws on. */
  tags: pipe(
    array(Id),
    nonEmpty('needs at least one tag'),
    check((tags) => new Set(tags).size === tags.length, 'tags must be distinct'),
  ),
  eligibility: BuildingEligibilitySchema,
  plot: PlotFitSchema,
  /** Map style ids every answer may build in. */
  styles: pipe(array(Id), nonEmpty()),
  /** How many storeys `access.storeys` may declare. */
  storeys: pipe(
    range(Count),
    check(([min]) => min >= 1, 'a building has at least one storey'),
  ),
  program: pipe(
    record(Id, ProgramRoomSchema),
    check((rooms) => Object.keys(rooms).length > 0, 'needs at least one room'),
  ),
  references: pipe(array(Name), nonEmpty()),
  facade: Name,
  cover: Name,
});

export type BuildingBriefDef = InferOutput<typeof BuildingBriefSchema>;
