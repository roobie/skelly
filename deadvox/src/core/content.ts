// Game content is data: JSON files of block and item definitions. Files are applied
// in order, so a mod loaded after the base pack can add new ids or override existing ones.

export interface BlockDef {
  id: string;
  name: string;
  /** "#rrggbb" */
  color: string;
  /** Blocks movement. Non-solid blocks still render as cubes for now. */
  solid: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  category: string;
  /** Grams. */
  weight: number;
  /** Millilitres. */
  volume: number;
  description?: string;
}

export interface ContentFile {
  blocks?: BlockDef[];
  items?: ItemDef[];
}

/** A parsed JSON file and where it came from (for error messages). */
export interface ContentSource {
  source: string;
  data: unknown;
}

export interface ContentIssue {
  source: string;
  path: string;
  message: string;
}

export interface Registry {
  /** Index is the runtime block id stored in chunks. Index 0 is always air. */
  blocks: BlockDef[];
  blockIds: Map<string, number>;
  items: Map<string, ItemDef>;
}

export const AIR: BlockDef = { id: 'air', name: 'Air', color: '#000000', solid: false };

type FieldType = 'string' | 'number' | 'boolean';
type FieldSpec = Record<string, { type: FieldType; required: boolean }>;

const BLOCK_FIELDS: FieldSpec = {
  id: { type: 'string', required: true },
  name: { type: 'string', required: true },
  color: { type: 'string', required: true },
  solid: { type: 'boolean', required: true },
};

const ITEM_FIELDS: FieldSpec = {
  id: { type: 'string', required: true },
  name: { type: 'string', required: true },
  category: { type: 'string', required: true },
  weight: { type: 'number', required: true },
  volume: { type: 'number', required: true },
  description: { type: 'string', required: false },
};

const ID = /^[a-z0-9_]+$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Checks one content file's shape. An empty list means the file is usable. */
export const validateContent = ({ source, data }: ContentSource): ContentIssue[] => {
  const issues: ContentIssue[] = [];
  const issue = (path: string, message: string) => issues.push({ source, path, message });

  if (!isObject(data)) {
    issue('', 'expected an object with "blocks" and/or "items" arrays');
    return issues;
  }
  for (const key of Object.keys(data)) {
    if (key !== 'blocks' && key !== 'items') {
      issue(key, `unknown section "${key}"`);
    }
  }

  const checkList = (
    key: 'blocks' | 'items',
    fields: FieldSpec,
    extra: (def: Record<string, unknown>, path: string) => void,
  ) => {
    const list = data[key];
    if (list === undefined) {
      return;
    }
    if (!Array.isArray(list)) {
      issue(key, 'expected an array');
      return;
    }
    const seen = new Set<string>();
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
    list.forEach((def: unknown, i) => {
      const path = `${key}[${i}]`;
      if (!isObject(def)) {
        issue(path, 'expected an object');
        return;
      }
      for (const [name, spec] of Object.entries(fields)) {
        const value = def[name];
        if (value === undefined) {
          if (spec.required) {
            issue(`${path}.${name}`, 'missing');
          }
        } else if (typeof value !== spec.type) {
          issue(`${path}.${name}`, `expected a ${spec.type}`);
        }
      }
      for (const name of Object.keys(def)) {
        if (!(name in fields)) {
          issue(`${path}.${name}`, `unknown field "${name}"`);
        }
      }
      if (typeof def.id === 'string') {
        if (!ID.test(def.id)) {
          issue(`${path}.id`, `"${def.id}" must be lowercase letters, digits and _`);
        }
        if (seen.has(def.id)) {
          issue(`${path}.id`, `duplicate id "${def.id}" in this file`);
        }
        seen.add(def.id);
      }
      extra(def, path);
    });
  };

  checkList('blocks', BLOCK_FIELDS, (def, path) => {
    if (def.id === AIR.id) {
      issue(`${path}.id`, '"air" is built in');
    }
    if (typeof def.color === 'string' && !COLOR.test(def.color)) {
      issue(`${path}.color`, 'expected "#rrggbb"');
    }
  });
  checkList('items', ITEM_FIELDS, (def, path) => {
    for (const name of ['weight', 'volume']) {
      const value = def[name];
      if (typeof value === 'number' && !(value >= 0)) {
        issue(`${path}.${name}`, 'must be 0 or more');
      }
    }
  });
  return issues;
};

/**
 * Merges content files in order into a registry. Files with issues are skipped whole,
 * so one broken mod can't leave half-applied content behind.
 */
export const buildRegistry = (sources: ContentSource[]): { registry: Registry; issues: ContentIssue[] } => {
  const registry: Registry = { blocks: [AIR], blockIds: new Map([[AIR.id, 0]]), items: new Map() };
  const issues: ContentIssue[] = [];
  for (const src of sources) {
    const found = validateContent(src);
    if (found.length > 0) {
      issues.push(...found);
      continue;
    }
    const file = src.data as ContentFile;
    for (const block of file.blocks ?? []) {
      const existing = registry.blockIds.get(block.id);
      if (existing === undefined) {
        registry.blockIds.set(block.id, registry.blocks.length);
        registry.blocks.push(block);
      } else {
        registry.blocks[existing] = block; // override keeps the runtime id
      }
    }
    for (const item of file.items ?? []) {
      registry.items.set(item.id, item);
    }
  }
  return { registry, issues };
};

/** Looks up a block's runtime id, failing loudly if content doesn't define it. */
export const blockId = (registry: Registry, id: string): number => {
  const n = registry.blockIds.get(id);
  if (n === undefined) {
    throw new Error(`content does not define block "${id}"`);
  }
  return n;
};

/** RGB bytes per runtime block id, for the mesher. */
export const blockColors = (registry: Registry): Uint8Array => {
  const out = new Uint8Array(registry.blocks.length * 3);
  registry.blocks.forEach((b, i) => {
    const n = Number.parseInt(b.color.slice(1), 16);
    out[i * 3] = (n >> 16) & 255;
    out[i * 3 + 1] = (n >> 8) & 255;
    out[i * 3 + 2] = n & 255;
  });
  return out;
};
