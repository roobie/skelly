import type { PartDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import { partNodeName } from '@skelly/thing-export/glb.ts';
import { modelParts, type PhysicalInputs } from '@skelly/thing-export/physical.ts';
import {
  array,
  check,
  finite,
  type InferOutput,
  minValue,
  nonEmpty,
  number,
  parse,
  pipe,
  record,
  regex,
  strictObject,
  string,
} from 'valibot';
import content from './physical.json' with { type: 'json' };

const PartMassSchema = strictObject({
  id: pipe(string(), regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)),
  family: pipe(string(), nonEmpty()),
  match: record(pipe(string(), nonEmpty()), string()),
  massKg: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
});
const PartMassTableSchema = pipe(
  array(PartMassSchema),
  check((rows) => new Set(rows.map(({ id }) => id)).size === rows.length, 'part mass row ids must be unique'),
  check(
    (rows) =>
      rows.every(
        ({ match }) =>
          !['pose', 'muzzleInsetRatio', 'chamberIndex', 'frontSightMuzzleInsetRatio'].some((key) =>
            Object.hasOwn(match, key),
          ),
      ),
    'pose and placement cannot select a mass',
  ),
);
export type PartMassRow = InferOutput<typeof PartMassSchema>;
const partMasses = parse(PartMassTableSchema, content.partMasses);

export class PartMassError extends Error {}

const physicalInputs = (
  resolved: Resolved,
  id: string,
  part: PartDef,
  rows: readonly PartMassRow[],
): PhysicalInputs => {
  const family = resolved.assembly.parts[id]?.family;
  const params = Object.fromEntries(
    Object.entries(resolved.params.get(id) ?? {}).map(([key, parameter]) => [key, parameter.value]),
  );
  const matches = rows.filter(
    (row) => row.family === family && Object.entries(row.match).every(([key, value]) => params[key] === value),
  );
  if (matches.length !== 1) {
    throw new PartMassError(
      `Design ${JSON.stringify(resolved.assembly.name)}, part ${JSON.stringify(id)}, family ${JSON.stringify(family)}, resolved params ${JSON.stringify(params)}: expected one authored mass row; matched ${matches.length === 0 ? 'none' : matches.map(({ id: row }) => row).join(', ')}`,
    );
  }
  return { part, massKg: matches[0]!.massKg };
};

export const gunModelParts = (
  resolved: Resolved,
  replaceableNodes: ReadonlySet<string>,
  rows: readonly PartMassRow[] = partMasses,
) => {
  // Replaceable geometry belongs to the child item, whose authored weight is authoritative.
  const body = {
    ...resolved,
    defs: new Map(
      [...resolved.defs].filter(([id]) => {
        const family = resolved.assembly.parts[id]?.family;
        if (family === undefined) {
          throw new PartMassError(`No instance for physical part ${id}`);
        }
        return !replaceableNodes.has(partNodeName(id, family));
      }),
    ),
  };
  return modelParts(body, (id, part) => physicalInputs(resolved, id, part, rows));
};
