// Game content is data: JSON files with sections of definitions (schema.ts). Files
// are applied in order, so a mod loaded after the base pack can add new ids or
// override existing ones. Each file's shape is checked on its own; references
// between definitions are checked once every file is merged. A file with any issue
// is skipped whole, so one broken mod can't leave half-applied content behind.

import { type BaseIssue, safeParse } from 'valibot';
import { authoredLayoutIssues } from './authoredLayout.ts';
import {
  type BlockDef,
  CONTENT_SECTION_KEYS,
  type ContentFile,
  ContentFileSchema,
  type ContentSection,
  type ItemDef,
  type RecipeDef,
  type TemplateDef,
} from './schema.ts';
import { SOUND_EVENT_IDS } from './soundEvents.ts';
import { templateSpatialIssues } from './templateSpatial.ts';
import { compileTemplate, findPieces, pieceSize, templateLockIds, templateResolves } from './templates.ts';

export type {
  FigureDef,
  FurnitureDef,
  ItemDef,
  LootEntry,
  ModelDef,
  RecipeDef,
  SoundDef,
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

type RegistryMaps = {
  [S in Exclude<ContentSection, 'blocks'>]: Map<string, NonNullable<ContentFile[S]>[number]>;
};

export interface Registry extends RegistryMaps {
  /** Index is the runtime block id stored in chunks. Index 0 is always air. */
  blocks: BlockDef[];
  blockIds: Map<string, number>;
  /** Where each model was defined; its file is a path within that content file's pack. */
  modelOrigins: Map<string, { source: string; path: string }>;
  /** Where each sound event was defined; variant paths are relative to this content file's pack. */
  soundOrigins: Map<string, { source: string; path: string }>;
}

const AIR: BlockDef = { id: 'air', name: 'Air', color: '#000000', solid: false };

const SECTIONS = CONTENT_SECTION_KEYS;
const RECIPE_COMBINATION_CAP = 1024n;

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
const fileIssues = (file: ContentFile, source: string): [string, string][] => {
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
  (file.recipes ?? []).forEach((recipe, i) => {
    const combinations = recipe.components.reduce((count, group) => count * BigInt(group.length), 1n);
    if (combinations > RECIPE_COMBINATION_CAP) {
      out.push([
        `recipes[${i}].components`,
        `${combinations} component combinations exceeds maximum ${RECIPE_COMBINATION_CAP}`,
      ]);
    }
  });
  if (source.endsWith('/models-melee.json') || source === 'models-melee.json') {
    (file.models ?? []).forEach((model, i) => {
      if (model.hold === undefined) {
        out.push([`models[${i}].hold`, 'missing']);
      }
    });
  }
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
  return fileIssues(result.output, source).map(([path, message]) => ({ source, path, message }));
};

// ---- merging ----

/** Where the definition that won came from, for issues found after merging. */
interface Origin {
  source: string;
  path: string;
}

const emptyRegistry = (): Registry => ({
  // Object.fromEntries loses key-specific types; every ordinary section receives its native map.
  ...(Object.fromEntries(
    SECTIONS.filter((section) => section !== 'blocks').map((section) => [section, new Map()]),
  ) as RegistryMaps),
  blocks: [AIR],
  blockIds: new Map([[AIR.id, 0]]),
  modelOrigins: new Map(),
  soundOrigins: new Map(),
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
    for (const section of SECTIONS) {
      if (section === 'blocks') {
        continue;
      }
      const map = registry[section];
      (file[section] ?? []).forEach((def, i) => {
        (map as Map<string, typeof def>).set(def.id, def);
        note(section, def.id, source, i);
      });
    }
    (file.models ?? []).forEach((model, i) => {
      registry.modelOrigins.set(model.id, { source, path: `models[${i}]` });
    });
    (file.sounds ?? []).forEach((sound, i) => {
      registry.soundOrigins.set(sound.id, { source, path: `sounds[${i}]` });
    });
  }
  return { registry, origins };
};

// ---- references (after merging) ----

type Report = (section: ContentSection, id: string, path: string, message: string) => void;

const checkUnpacking = (item: ItemDef, registry: Registry, report: Report): void => {
  if (!item.unpack) {
    return;
  }
  const payload = registry.items.get(item.unpack.item);
  if (!payload) {
    report('items', item.id, '.unpack.item', `no item "${item.unpack.item}"`);
  } else if (item.unpack.count > (payload.stack ?? 1)) {
    report('items', item.id, '.unpack.count', 'payload must fit one stack');
  }
  if (item.container) {
    report('items', item.id, '.unpack', 'sealed packages are not containers');
  }
};

const checkDisassembly = (item: ItemDef, registry: Registry, qualities: ReadonlySet<string>, report: Report) => {
  const { disassembly } = item;
  if (disassembly) {
    if (!registry.skills.has(disassembly.skill)) {
      report('items', item.id, '.disassembly.skill', `no skill "${disassembly.skill}"`);
    }
    disassembly.yields.forEach((yieldItem, index) => {
      if (!registry.items.has(yieldItem.item)) {
        report('items', item.id, `.disassembly.yields[${index}].item`, `no item "${yieldItem.item}"`);
      } else if (yieldItem.item === item.id) {
        report(
          'items',
          item.id,
          `.disassembly.yields[${index}].item`,
          'disassembly cannot yield the input item itself',
        );
      }
      const quality = yieldItem.toolModifier?.quality;
      if (quality !== undefined && !qualities.has(quality)) {
        report('items', item.id, `.disassembly.yields[${index}].toolModifier.quality`, `no tool quality "${quality}"`);
      }
    });
  }
  item.salvage?.forEach((output, index) => {
    if (!registry.items.has(output.item)) {
      report('items', item.id, `.salvage[${index}].item`, `no item "${output.item}"`);
    }
  });
  if (disassembly && item.salvage) {
    report('items', item.id, '.salvage', 'use either a disassembly yield or a salvage list, not both');
  }
};

const checkBook = (item: ItemDef, registry: Registry, report: Report) => {
  if (item.book && item.category !== 'book') {
    report('items', item.id, '.book', 'book component requires the book category');
  }
  if (registry.recipes.size === 0) {
    return;
  }
  item.book?.recipes.forEach((recipe, index) => {
    if (!registry.recipes.has(recipe)) {
      report('items', item.id, `.book.recipes[${index}]`, `no recipe "${recipe}"`);
    }
  });
};

const checkItemLight = (item: ItemDef, hasIgniter: boolean, registry: Registry, report: Report) => {
  const { light, igniter } = item;
  const battery = light?.power?.battery;
  if (battery !== undefined && registry.items.get(battery)?.battery === undefined) {
    report('items', item.id, '.light.power.battery', `"${battery}" is not an item with a battery component`);
  }
  if (igniter && igniter.perIgnition > igniter.capacity) {
    report('items', item.id, '.igniter.perIgnition', 'must not exceed fuel capacity');
  }
  if (light?.power && light.burnTime !== undefined) {
    report('items', item.id, '.light.burnTime', 'battery lights cannot also have a burn time');
  }
  if (light?.fuelPerHour !== undefined && !igniter) {
    report('items', item.id, '.light.fuelPerHour', 'self-fuelled lights need an igniter fuel component');
  }
  if (light?.fuelPerHour !== undefined && light.burnTime !== undefined) {
    report('items', item.id, '.light.fuelPerHour', 'self-fuelled lights cannot also have a burn time');
  }
  if (light?.burning && light.burnTime === undefined) {
    report('items', item.id, '.light.burning', 'burning rules need a burn time');
  }
  if (light?.burning?.ignition === 'firestarter' && !hasIgniter) {
    report('items', item.id, '.light.burning.ignition', 'needs at least one item with an igniter component');
  }
};

const checkItemFirearm = (item: ItemDef, report: Report): void => {
  if (item.firearm?.pump && item.firearm.dispersionRadians !== 0) {
    report('items', item.id, '.firearm.dispersionRadians', 'pump pellet spread owns its cone');
  }
};

const checkItems = (registry: Registry, report: Report) => {
  const items = [...registry.items.values()];
  const qualities = new Set(items.flatMap((item) => Object.keys(item.tool?.qualities ?? {})));
  const hasIgniter = items.some((item) => item.igniter !== undefined);
  for (const item of items) {
    checkItemLight(item, hasIgniter, registry, report);
    checkItemFirearm(item, report);
    checkUnpacking(item, registry, report);
    checkDisassembly(item, registry, qualities, report);
    checkBook(item, registry, report);
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
    if (furniture.door?.prying && !registry.skills.has(furniture.door.prying.skill)) {
      report('furniture', furniture.id, '.door.prying.skill', `no skill "${furniture.door.prying.skill}"`);
    }
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
  if (entry.loot !== undefined && furniture && furniture.container === undefined) {
    found.push(['.loot', 'has loot but no container to put it in']);
  }
  if (entry.lock && furniture && !furniture.door) {
    found.push(['.lock', 'only a door can have a lock']);
  }
  if (entry.spawn !== undefined && !registry.zombies.has(entry.spawn)) {
    found.push(['.spawn', `no zombie type "${entry.spawn}"`]);
  }
  return found;
};

const checkTemplateSpace = (registry: Registry, template: TemplateDef, report: Report) => {
  if (template.access && templateResolves(registry, template)) {
    for (const [path, message] of templateSpatialIssues(registry, compileTemplate(registry, template))) {
      report('templates', template.id, path, message);
    }
  }
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
    checkTemplateSpace(registry, template, report);
  }
};

const checkZombies = (registry: Registry, report: Report) => {
  for (const zombie of registry.zombies.values()) {
    if (zombie.loot !== undefined && !registry.loot.has(zombie.loot)) {
      report('zombies', zombie.id, '.loot', `no loot table "${zombie.loot}"`);
    }
  }
};

const checkRecipeRepair = (registry: Registry, recipe: RecipeDef, report: Report): void => {
  if (recipe.kind === 'repair') {
    if (!recipe.repair) {
      report('recipes', recipe.id, '.repair', 'repair recipes need a repair effect');
      return;
    }
    if (!registry.skills.has(recipe.repair.skill)) {
      report('recipes', recipe.id, '.repair.skill', `no skill "${recipe.repair.skill}"`);
    }
    if (recipe.result.count !== 1) {
      report('recipes', recipe.id, '.result.count', 'repair recipes target one item');
    }
  } else if (recipe.repair) {
    report('recipes', recipe.id, '.repair', 'only repair recipes may declare a repair effect');
  }
};

const checkRecipe = ({
  registry,
  recipe,
  qualities,
  workstations,
  report,
}: {
  registry: Registry;
  recipe: RecipeDef;
  qualities: ReadonlySet<string>;
  workstations: ReadonlySet<string>;
  report: Report;
}) => {
  const checkItem = (id: string, path: string) => {
    if (!registry.items.has(id)) {
      report('recipes', recipe.id, path, `no item "${id}"`);
    }
  };
  checkItem(recipe.result.item, '.result.item');
  checkRecipeRepair(registry, recipe, report);
  recipe.components.forEach((group, g) => {
    group.forEach((component, c) => {
      checkItem(component.item, `.components[${g}][${c}].item`);
    });
  });
  for (const id of Object.keys(recipe.skills)) {
    const skill = registry.skills.get(id);
    if (!skill) {
      report('recipes', recipe.id, `.skills.${id}`, `no skill "${id}"`);
    }
  }
  if (
    Object.keys(recipe.skills).length > 0 &&
    registry.skills.get('crafting')?.training?.craftingTierOffset === undefined
  ) {
    report('recipes', recipe.id, '.skills', 'crafting skill has no crafting tier offset');
  }
  for (const id of Object.keys(recipe.qualities)) {
    if (!qualities.has(id)) {
      report('recipes', recipe.id, `.qualities.${id}`, `no tool quality "${id}"`);
    }
  }
  if (typeof recipe.workstation === 'string' && !workstations.has(recipe.workstation)) {
    report('recipes', recipe.id, '.workstation', `no workstation "${recipe.workstation}"`);
  }
};

const checkRecipes = (registry: Registry, report: Report) => {
  const qualities = new Set([
    ...[...registry.items.values()].flatMap((item) => Object.keys(item.tool?.qualities ?? {})),
    ...[...registry.furniture.values()].flatMap((furniture) => Object.keys(furniture.workstation?.qualities ?? {})),
  ]);
  const workstations = new Set(
    [...registry.furniture.values()].flatMap((furniture) => (furniture.workstation ? [furniture.workstation.id] : [])),
  );
  for (const recipe of registry.recipes.values()) {
    checkRecipe({ registry, recipe, qualities, workstations, report });
  }
  for (const id of new Set(
    [...registry.recipes.values()].filter((recipe) => recipe.kind !== 'repair').map((recipe) => recipe.result.item),
  )) {
    const item = registry.items.get(id);
    if (!item) {
      continue;
    }
    if (!item.disassembly) {
      report('items', id, '.disassembly', 'recipe result needs an explicit disassembly yield');
    }
    if (item.salvage) {
      report('items', id, '.salvage', 'recipe results use a disassembly yield, not a salvage list');
    }
  }
};

const checkKeys = (registry: Registry, report: Report) => {
  const doorLocks = new Set(
    [...registry.templates.values()].flatMap((template) => templateLockIds(registry, template)),
  );
  const keyLocks = new Set([...registry.items.values()].flatMap((item) => (item.key ? [item.key.lock] : [])));
  for (const item of registry.items.values()) {
    if (item.key && !doorLocks.has(item.key.lock)) {
      report('items', item.id, '.key.lock', `no door has lock "${item.key.lock}"`);
    }
  }
  for (const template of registry.templates.values()) {
    for (const lock of new Set(templateLockIds(registry, template))) {
      if (!keyLocks.has(lock)) {
        report('templates', template.id, '.palette', `no key names lock "${lock}"`);
      }
    }
  }
};

const referenceIssues = (registry: Registry, origins: Map<string, Origin>): ContentIssue[] => {
  const issues: ContentIssue[] = [];
  const report: Report = (section, id, path, message) => {
    const origin = origins.get(`${section}:${id}`)!;
    issues.push({ source: origin.source, path: `${origin.path}${path}`, message });
  };
  for (const block of registry.blocks) {
    for (const [gait, event] of Object.entries(block.rustle ?? {})) {
      const sound = registry.sounds.get(event);
      if (!sound) {
        report('blocks', block.id, `.rustle.${gait}`, `no sound "${event}"`);
      } else if (!sound.noise.enabled) {
        report('blocks', block.id, `.rustle.${gait}`, `rustle sound "${event}" must emit noise`);
      }
    }
  }
  checkItems(registry, report);
  checkLoot(registry, report);
  checkFurniture(registry, report);
  checkTemplates(registry, report);
  checkKeys(registry, report);
  checkZombies(registry, report);
  checkRecipes(registry, report);
  for (const layout of registry.layouts.values()) {
    for (const [path, message] of authoredLayoutIssues(layout, registry)) {
      report('layouts', layout.id, path, message);
    }
  }
  return issues;
};

export const requiredSoundIssues = (registry: Registry, source = 'sounds.json'): ContentIssue[] =>
  SOUND_EVENT_IDS.filter((id) => !registry.sounds.has(id)).map((id) => ({
    source,
    path: 'sounds',
    message: `missing required sound event "${id}"`,
  }));

/**
 * Merges content files in order into a registry. A file with a shape issue is
 * skipped. Then references are checked; files with broken references are dropped
 * and the rest merged again, until what's left is consistent.
 */
export const buildRegistry = (
  sources: readonly ContentSource[],
): {
  registry: Registry;
  issues: ContentIssue[];
  /** Winning origins, including ordered overrides and whole-file removal. */
  origins: ReadonlyMap<string, Origin>;
} => {
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
      return { registry, issues, origins };
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
