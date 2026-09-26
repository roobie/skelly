// Game content is data: JSON files with sections of definitions (schema.ts). Files
// are applied in order, so a mod loaded after the base pack can add new ids or
// override existing ones. Each file's shape is checked on its own; references
// between definitions are checked once every file is merged. A file with any issue
// is skipped whole, so one broken mod can't leave half-applied content behind.

import { type BaseIssue, safeParse } from 'valibot';
import {
  type BlockDef,
  type ContentFile,
  ContentFileSchema,
  type ContentSection,
  type FurnitureDef,
  type ItemDef,
  type LootTable,
  type ModelDef,
  type TemplateDef,
  type ZombieDef,
} from './schema.ts';
import { findPieces, pieceSize } from './templates.ts';

export type {
  BlockDef,
  FurnitureDef,
  ItemDef,
  LootEntry,
  LootTable,
  ModelDef,
  TemplateDef,
  ZombieDef,
} from './schema.ts';

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
  furniture: Map<string, FurnitureDef>;
  loot: Map<string, LootTable>;
  templates: Map<string, TemplateDef>;
  zombies: Map<string, ZombieDef>;
  models: Map<string, ModelDef>;
  /** Where each model was defined; its file is a path within that content file's pack. */
  modelOrigins: Map<string, { source: string; path: string }>;
}

export const AIR: BlockDef = { id: 'air', name: 'Air', color: '#000000', solid: false };

const SECTIONS: readonly ContentSection[] = ['blocks', 'items', 'furniture', 'loot', 'templates', 'zombies', 'models'];

// ---- shape (one file) ----

type Issue = BaseIssue<unknown>;

/** "items[0].light.power", with palette characters in brackets: `palette["#"]`. */
const formatPath = (issue: Issue): string => {
  const keys = (issue.path ?? []).map((item) => item.key as string | number);
  return keys
    .map((key, i) => {
      if (typeof key === 'number') {
        return `[${key}]`;
      }
      if (keys[i - 1] === 'palette') {
        return `["${key}"]`;
      }
      return i === 0 ? key : `.${key}`;
    })
    .join('');
};

/** A union reports its own "wrong type"; the issues from the branch that nearly matched say more. */
const flatten = (issue: Issue): Issue[] => {
  const depth = issue.path?.length ?? 0;
  const deeper = (issue.issues ?? []).filter((sub) => (sub.path?.length ?? 0) > depth);
  return issue.type === 'union' && deeper.length > 0 ? deeper.flatMap(flatten) : [issue];
};

const messageOf = (issue: Issue): string => {
  if (issue.type === 'strict_object') {
    const key = issue.path?.at(-1)?.key;
    return issue.input === undefined ? 'missing' : `unknown field "${String(key)}"`;
  }
  return issue.message;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Checks inside one template: layer sizes, and that every character is in the palette. */
const templateIssues = (template: TemplateDef, path: string): [string, string][] => {
  const [sx, , sz] = template.size;
  const out: [string, string][] = [];
  if (template.layers.length !== template.size[1]) {
    out.push([`${path}.layers`, `has ${template.layers.length} layers; size[1] is ${template.size[1]}`]);
  }
  template.layers.forEach((layer, y) => {
    if (layer.length !== sz) {
      out.push([`${path}.layers[${y}]`, `has ${layer.length} rows; size[2] is ${sz}`]);
    }
    layer.forEach((row, z) => {
      const cells = [...row];
      if (cells.length !== sx) {
        out.push([`${path}.layers[${y}][${z}]`, `has ${cells.length} cells; size[0] is ${sx}`]);
      }
      for (const c of new Set(cells)) {
        if (!(c in template.palette)) {
          out.push([`${path}.layers[${y}][${z}]`, `"${c}" is not in the palette`]);
        }
      }
    });
  });
  return out;
};

/** Checks that need only the file itself: duplicate ids, the built-in air block, template sizes. */
const fileIssues = (file: ContentFile): [string, string][] => {
  const out: [string, string][] = [];
  for (const section of SECTIONS) {
    const seen = new Set<string>();
    (file[section] ?? []).forEach((def, i) => {
      if (seen.has(def.id)) {
        out.push([`${section}[${i}].id`, `duplicate id "${def.id}" in this file`]);
      }
      seen.add(def.id);
    });
  }
  (file.blocks ?? []).forEach((block, i) => {
    if (block.id === AIR.id) {
      out.push([`blocks[${i}].id`, '"air" is built in']);
    }
  });
  (file.templates ?? []).forEach((template, i) => {
    out.push(...templateIssues(template, `templates[${i}]`));
  });
  return out;
};

/** Valibot's issues as content issues, with readable paths. */
export const schemaIssues = (source: string, issues: readonly Issue[]): ContentIssue[] =>
  issues.flatMap(flatten).map((issue) => ({ source, path: formatPath(issue), message: messageOf(issue) }));

/** Checks one content file on its own. An empty list means the file is usable. */
export const validateContent = ({ source, data }: ContentSource): ContentIssue[] => {
  if (!isObject(data)) {
    return [{ source, path: '', message: `expected an object with any of: ${SECTIONS.join(', ')}` }];
  }
  const result = safeParse(ContentFileSchema, data);
  if (!result.success) {
    return schemaIssues(source, result.issues);
  }
  return fileIssues(result.output).map(([path, message]) => ({ source, path, message }));
};

// ---- merging ----

/** Where the definition that won came from, for issues found after merging. */
interface Origin {
  source: string;
  path: string;
}

const emptyRegistry = (): Registry => ({
  blocks: [AIR],
  blockIds: new Map([[AIR.id, 0]]),
  items: new Map(),
  furniture: new Map(),
  loot: new Map(),
  templates: new Map(),
  zombies: new Map(),
  models: new Map(),
  modelOrigins: new Map(),
});

const merge = (files: readonly { source: string; file: ContentFile }[]) => {
  const registry = emptyRegistry();
  const origins = new Map<string, Origin>();
  const note = (section: ContentSection, id: string, source: string, i: number) =>
    origins.set(`${section}:${id}`, { source, path: `${section}[${i}]` });

  for (const { source, file } of files) {
    (file.blocks ?? []).forEach((block, i) => {
      const existing = registry.blockIds.get(block.id);
      if (existing === undefined) {
        registry.blockIds.set(block.id, registry.blocks.length);
        registry.blocks.push(block);
      } else {
        registry.blocks[existing] = block; // an override keeps the runtime id
      }
      note('blocks', block.id, source, i);
    });
    const maps = [
      ['items', registry.items],
      ['furniture', registry.furniture],
      ['loot', registry.loot],
      ['templates', registry.templates],
      ['zombies', registry.zombies],
      ['models', registry.models],
    ] as const;
    for (const [section, map] of maps) {
      (file[section] ?? []).forEach((def, i) => {
        (map as Map<string, typeof def>).set(def.id, def);
        note(section, def.id, source, i);
      });
    }
    (file.models ?? []).forEach((model, i) => {
      registry.modelOrigins.set(model.id, { source, path: `models[${i}]` });
    });
  }
  return { registry, origins };
};

// ---- references (after merging) ----

type Report = (section: ContentSection, id: string, path: string, message: string) => void;

const checkItems = (registry: Registry, report: Report) => {
  for (const item of registry.items.values()) {
    const battery = item.light?.power?.battery;
    if (battery !== undefined && registry.items.get(battery)?.battery === undefined) {
      report('items', item.id, '.light.power.battery', `"${battery}" is not an item with a battery component`);
    }
    if (item.model !== undefined && !registry.models.has(item.model)) {
      report('items', item.id, '.model', `no model "${item.model}"`);
    }
  }
};

/** Follows nested tables; a table that leads back to itself would roll forever. */
const findLoop = (registry: Registry, start: string): string[] | undefined => {
  const walk = (id: string, trail: string[]): string[] | undefined => {
    if (trail.includes(id)) {
      return [...trail, id];
    }
    for (const entry of registry.loot.get(id)?.entries ?? []) {
      const loop = entry.table === undefined ? undefined : walk(entry.table, [...trail, id]);
      if (loop) {
        return loop;
      }
    }
    return undefined;
  };
  const loop = walk(start, []);
  return loop?.[0] === start ? loop : undefined;
};

const checkLoot = (registry: Registry, report: Report) => {
  for (const table of registry.loot.values()) {
    table.entries.forEach((entry, i) => {
      if (entry.item !== undefined && !registry.items.has(entry.item)) {
        report('loot', table.id, `.entries[${i}].item`, `no item "${entry.item}"`);
      }
      if (entry.table !== undefined && !registry.loot.has(entry.table)) {
        report('loot', table.id, `.entries[${i}].table`, `no loot table "${entry.table}"`);
      }
    });
    const loop = findLoop(registry, table.id);
    if (loop) {
      report('loot', table.id, '.entries', `nested tables loop: ${loop.join(' → ')}`);
    }
  }
};

const checkFurniture = (registry: Registry, report: Report) => {
  for (const furniture of registry.furniture.values()) {
    if (furniture.loot !== undefined && !registry.loot.has(furniture.loot)) {
      report('furniture', furniture.id, '.loot', `no loot table "${furniture.loot}"`);
    }
    if (furniture.loot !== undefined && furniture.container === undefined) {
      report('furniture', furniture.id, '.loot', 'has loot but no container to put it in');
    }
  }
};

type PaletteThing = Exclude<TemplateDef['palette'][string], string>;

const checkPaletteThing = (registry: Registry, template: TemplateDef, char: string, entry: PaletteThing) => {
  const found: [string, string][] = [];
  const furniture = entry.furniture === undefined ? undefined : registry.furniture.get(entry.furniture);
  if (entry.furniture !== undefined && !furniture) {
    found.push(['.furniture', `no furniture "${entry.furniture}"`]);
  }
  const problem = furniture && findPieces(template, char, pieceSize(furniture.size, entry.facing ?? 'n')).problem;
  if (problem) {
    found.push(['.furniture', problem]);
  }
  if (entry.loot !== undefined && !registry.loot.has(entry.loot)) {
    found.push(['.loot', `no loot table "${entry.loot}"`]);
  }
  if (entry.spawn !== undefined && !registry.zombies.has(entry.spawn)) {
    found.push(['.spawn', `no zombie type "${entry.spawn}"`]);
  }
  return found;
};

const checkTemplates = (registry: Registry, report: Report) => {
  for (const template of registry.templates.values()) {
    for (const [char, entry] of Object.entries(template.palette)) {
      const at = `.palette["${char}"]`;
      if (typeof entry !== 'string') {
        for (const [path, message] of checkPaletteThing(registry, template, char, entry)) {
          report('templates', template.id, `${at}${path}`, message);
        }
      } else if (!registry.blockIds.has(entry)) {
        report('templates', template.id, at, `no block "${entry}"`);
      }
    }
  }
};

const checkZombies = (registry: Registry, report: Report) => {
  for (const zombie of registry.zombies.values()) {
    if (zombie.loot !== undefined && !registry.loot.has(zombie.loot)) {
      report('zombies', zombie.id, '.loot', `no loot table "${zombie.loot}"`);
    }
  }
};

const referenceIssues = (registry: Registry, origins: Map<string, Origin>): ContentIssue[] => {
  const issues: ContentIssue[] = [];
  const report: Report = (section, id, path, message) => {
    const origin = origins.get(`${section}:${id}`)!;
    issues.push({ source: origin.source, path: `${origin.path}${path}`, message });
  };
  checkItems(registry, report);
  checkLoot(registry, report);
  checkFurniture(registry, report);
  checkTemplates(registry, report);
  checkZombies(registry, report);
  return issues;
};

/**
 * Merges content files in order into a registry. A file with a shape issue is
 * skipped. Then references are checked; files with broken references are dropped
 * and the rest merged again, until what's left is consistent.
 */
export const buildRegistry = (sources: readonly ContentSource[]): { registry: Registry; issues: ContentIssue[] } => {
  const issues: ContentIssue[] = [];
  let files: { source: string; file: ContentFile }[] = [];
  for (const src of sources) {
    const found = validateContent(src);
    issues.push(...found);
    if (found.length === 0) {
      files.push({ source: src.source, file: src.data as ContentFile });
    }
  }
  for (;;) {
    const { registry, origins } = merge(files);
    const broken = referenceIssues(registry, origins);
    if (broken.length === 0) {
      return { registry, issues };
    }
    issues.push(...broken);
    const bad = new Set(broken.map((i) => i.source));
    files = files.filter((f) => !bad.has(f.source));
  }
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
