import type { Domain } from '@skelly/engine/assembly/schema.ts';
import {
  array,
  finite,
  type InferOutput,
  minValue,
  nonEmpty,
  number,
  optional,
  parse,
  pipe,
  record,
  strictObject,
  string,
} from 'valibot';
import content from './catalogue.json' with { type: 'json' };
import { gunDomain } from './domain.ts';
import { GUN_FINISH_SLOTS, GUN_PALETTE } from './palette.ts';

const Params = record(pipe(string(), nonEmpty()), string());
const EntrySchema = strictObject({
  id: pipe(string(), nonEmpty()),
  family: pipe(string(), nonEmpty()),
  match: Params,
  massKg: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
  params: optional(Params),
  finish: optional(Params),
});
const CatalogueSchema = strictObject({ placementParams: array(string()), parts: array(EntrySchema) });

type CatalogueEntry = InferOutput<typeof EntrySchema>;
/** A part the catalogue fully defines: a design can name it and it exports as its own loose part. */
type PartItem = CatalogueEntry & {
  readonly params: Readonly<Record<string, string>>;
  readonly finish: Readonly<Record<string, string>>;
};

export interface PartCatalogue {
  readonly placementParams: ReadonlySet<string>;
  /** Every authored mass; parts no design item names select theirs from here by `match`. */
  readonly entries: readonly CatalogueEntry[];
  readonly items: ReadonlyMap<string, PartItem>;
}

const ROW_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
// Item ids are Deadvox content ids, so they follow its grammar rather than the row spelling.
const ITEM_ID = /^[a-z0-9_]+$/;

const isItem = (entry: CatalogueEntry): entry is PartItem => entry.params !== undefined && entry.finish !== undefined;

const itemProblems = (item: PartItem, domain: Domain, placement: ReadonlySet<string>): string[] => {
  const family = domain.families[item.family]!;
  const construction = Object.keys(family.params).filter((name) => !placement.has(name));
  const problems = [
    ...construction.filter((name) => item.params[name] === undefined).map((name) => `leaves ${name} unset`),
    ...Object.entries(item.params).flatMap(([name, value]) => {
      const spec = family.params[name];
      if (spec === undefined || placement.has(name)) {
        return [`fixes ${name}, which is not a construction param of ${item.family}`];
      }
      return spec.values.includes(value) && !spec.fault?.includes(value) ? [] : [`fixes ${name}=${value}`];
    }),
    ...Object.entries(item.match)
      .filter(([name, value]) => item.params[name] !== value)
      .map(([name]) => `selects on ${name} without fixing it to that value`),
    ...Object.entries(item.finish)
      .filter(
        ([slot, material]) =>
          !(GUN_FINISH_SLOTS.includes(slot) && Object.hasOwn(GUN_PALETTE.materials ?? {}, material)),
      )
      .map(([slot]) => `has an unknown finish ${slot}`),
  ];
  return problems.map((problem) => `catalogue item ${item.id} ${problem}`);
};

/** Checks the authored catalogue against the domain; a bad catalogue is a build error, not a design issue. */
export const loadPartCatalogue = (raw: unknown, domain: Domain = gunDomain): PartCatalogue => {
  const parsed = parse(CatalogueSchema, raw);
  const placement = new Set(parsed.placementParams);
  const items = parsed.parts.filter(isItem);
  const sorted = (table: Readonly<Record<string, string>>) =>
    Object.entries(table).sort(([a], [b]) => a.localeCompare(b));
  // Finish is identity too: a different finish of the same construction is its own item.
  const identities = items.map(({ family, params, finish }) =>
    JSON.stringify([family, sorted(params), sorted(finish)]),
  );
  const problems = [
    ...parsed.parts.flatMap((entry) => [
      ...(domain.families[entry.family] ? [] : [`catalogue entry ${entry.id} names unknown family ${entry.family}`]),
      ...((isItem(entry) ? ITEM_ID : ROW_ID).test(entry.id) ? [] : [`catalogue entry id ${entry.id} is misspelt`]),
      ...(Object.keys(entry.match).some((name) => placement.has(name))
        ? [`catalogue entry ${entry.id} selects on pose or placement`]
        : []),
      ...((entry.params === undefined) === (entry.finish === undefined)
        ? []
        : [`catalogue entry ${entry.id} needs both params and finish to be an item`]),
    ]),
    ...(new Set(parsed.parts.map(({ id }) => id)).size === parsed.parts.length ? [] : ['catalogue ids must be unique']),
    ...(new Set(identities).size === identities.length
      ? []
      : ['two catalogue items build the same part in the same finish']),
    ...items.flatMap((item) => (domain.families[item.family] ? itemProblems(item, domain, placement) : [])),
  ];
  if (problems.length > 0) {
    throw new Error(problems.join('; '));
  }
  return { placementParams: placement, entries: parsed.parts, items: new Map(items.map((item) => [item.id, item])) };
};

export const PART_CATALOGUE = loadPartCatalogue(content);
