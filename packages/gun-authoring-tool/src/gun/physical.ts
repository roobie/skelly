import type { PartDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import type { DrawnGeometry } from '@skelly/thing-export/drawn.ts';
import { partNodeName } from '@skelly/thing-export/glb.ts';
import { modelParts, type PhysicalInputs } from '@skelly/thing-export/physical.ts';
import { PART_CATALOGUE, type PartCatalogue } from './catalogue.ts';

export class PartMassError extends Error {}

/** Which catalogue item each assembly instance is, by instance id; the design's item references. */
export type PartItems = Readonly<Record<string, string>>;

interface PartSource {
  readonly catalogue: PartCatalogue;
  readonly items: PartItems;
}

interface BuiltPart {
  readonly context: string;
  readonly family: string | undefined;
  readonly params: Readonly<Record<string, unknown>>;
}

const itemMass = ({ context, family, params }: BuiltPart, itemId: string, catalogue: PartCatalogue) => {
  const item = catalogue.items.get(itemId);
  if (item === undefined || item.family !== family) {
    throw new PartMassError(`${context}: names ${JSON.stringify(itemId)}, which is no ${family} item`);
  }
  // The item is the part as built; an instance built any other way is a different part.
  const changed = Object.keys(item.params).filter((key) => params[key] !== item.params[key]);
  if (changed.length > 0) {
    throw new PartMassError(`${context}: built with ${changed.join(', ')} other than item ${itemId} fixes`);
  }
  return { massKg: item.massKg, item: item.id };
};

const rowMass = ({ context, family, params }: BuiltPart, catalogue: PartCatalogue) => {
  const matches = catalogue.entries.filter(
    (row) => row.family === family && Object.entries(row.match).every(([key, value]) => params[key] === value),
  );
  if (matches.length !== 1) {
    // Items that differ only in finish match the same params, so only an item reference can tell them apart.
    const items = matches.filter(({ id }) => catalogue.items.has(id));
    throw new PartMassError(
      `${context}, resolved params ${JSON.stringify(params)}: expected one authored mass row; matched ${matches.length === 0 ? 'none' : matches.map(({ id: row }) => row).join(', ')}${items.length > 1 ? `; name one of the items ${items.map(({ id }) => id).join(', ')}` : ''}`,
    );
  }
  return { massKg: matches[0]!.massKg };
};

const physicalInputs =
  (resolved: Resolved, { catalogue, items }: PartSource) =>
  (id: string, part: PartDef): PhysicalInputs => {
    const family = resolved.assembly.parts[id]?.family;
    const params = Object.fromEntries(
      Object.entries(resolved.params.get(id) ?? {}).map(([key, parameter]) => [key, parameter.value]),
    );
    const built = {
      context: `Design ${JSON.stringify(resolved.assembly.name)}, part ${JSON.stringify(id)}, family ${JSON.stringify(family)}`,
      family,
      params,
    };
    const itemId = items[id];
    return { part, ...(itemId === undefined ? rowMass(built, catalogue) : itemMass(built, itemId, catalogue)) };
  };

export const gunModelParts = (
  resolved: Resolved,
  replaceableNodes: ReadonlySet<string>,
  {
    catalogue = PART_CATALOGUE,
    items = {},
    drawn,
  }: { readonly catalogue?: PartCatalogue; readonly items?: PartItems; readonly drawn?: DrawnGeometry } = {},
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
        const replaceable = replaceableNodes.has(partNodeName(id, family));
        if (replaceable && items[id] !== undefined) {
          throw new PartMassError(`Replaceable part ${id} is its own item, not body item ${items[id]}`);
        }
        return !replaceable;
      }),
    ),
  };
  const unknown = Object.keys(items).filter((id) => !resolved.defs.has(id));
  if (unknown.length > 0) {
    throw new PartMassError(`Item references name no built part: ${unknown.join(', ')}`);
  }
  return modelParts(body, physicalInputs(resolved, { catalogue, items }), {
    collision: true,
    ...(drawn ? { drawn } : {}),
  });
};
