// Game content is data: JSON files with sections of definitions (schema.ts). Files
// are applied in order, so a mod loaded after the base pack can add new ids or
// override existing ones. Each file's shape is checked on its own; references
// between definitions are checked once every file is merged. A file with any issue
// is skipped whole, so one broken mod can't leave half-applied content behind.

import { type BaseIssue, safeParse } from 'valibot';
import { authoredLayoutIssues } from './authoredLayout.ts';
import type { BundleAdmission } from './bundleAdmission.ts';
import { scenarioPlanIssues, settlementCollectionIssues } from './cityPlan.ts';
import { resolveSpawnTime, type SpawnTimeWindow } from './clock.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import { visibleGridName } from './inventoryGridName.ts';
import {
  footprintScaleIssue,
  PILE_GRID,
  pileFitIssue,
  pocketScaleIssue,
  rigidPocketScaleIssue,
  rolledFitIssue,
} from './inventoryScale.ts';
import { lootTypeIssue } from './loot.ts';
import { magazineWellCalibre, militaryLootItems } from './magazine.ts';
import { mapKitIssues } from './mapKit.ts';
import { pieceItemIssues } from './placementLoot.ts';
import { POWER_UNITS } from './powerContent.ts';
import { handlingRangeIssues } from './rangeLayout.ts';
import { scenarioSources } from './scenarioComposition.ts';
import {
  type BlockDef,
  CONTENT_SECTION_KEYS,
  type ContentFile,
  ContentFileSchema,
  type ContentSection,
  type DayCycleDef,
  type FurnitureDef,
  HELD_DISPLAY_KIND,
  type ItemDef,
  type ModelDef,
  type RecipeDef,
  type ScenarioDef,
  type SiteLayoutDef,
  type TemplateDef,
  type ZombieDef,
} from './schema.ts';
import { SOUND_EVENT_IDS } from './soundEvents.ts';
import { ownershipShapeIssues } from './templateOwnership.ts';
import {
  templateDoorIssues,
  templateGroundLootIssues,
  templateSpatialIssues,
  templateSpawnClearanceIssues,
} from './templateSpatial.ts';
import { compileTemplate, findPieces, pieceSize, templateLockIds, templateResolves } from './templates.ts';
import { vehicleContentIssues } from './vehicleBlueprint.ts';

export type {
  FigureDef,
  FurnitureDef,
  ItemDef,
  LootEntry,
  MeleeClassDef,
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
  dayCycle: DayCycleDef | undefined;
  contentOrigins: Map<string, { source: string; path: string }>;
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
const templateIssues = (
  template: Pick<TemplateDef, 'size' | 'layers' | 'ownership'> & { palette: Readonly<Record<string, unknown>> },
  path: string,
): [string, string][] => {
  const [sx, , sz] = template.size;
  const out: [string, string][] = ownershipShapeIssues(template).map(([at, message]) => [`${path}${at}`, message]);
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
  (file.mapPieces ?? []).forEach((piece, i) => {
    out.push(...templateIssues(piece, `mapPieces[${i}]`));
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

/** Parses one authored content file into its runtime representation. */
const parseContent = ({ source, data }: ContentSource): { file?: ContentFile; issues: ContentIssue[] } => {
  if (!isObject(data)) {
    return { issues: [{ source, path: '', message: `expected an object with any of: ${SECTIONS.join(', ')}` }] };
  }
  const result = safeParse(ContentFileSchema, data);
  if (!result.success) {
    return { issues: schemaIssues(source, result.issues) };
  }
  const issues = fileIssues(result.output, source).map(([path, message]) => ({ source, path, message }));
  return { file: result.output, issues };
};

/** Checks one content file on its own. An empty list means the file is usable. */
export const validateContent = (source: ContentSource): ContentIssue[] => parseContent(source).issues;

// ---- merging ----

/** The day cycle content; a spawn window's named times and the default start need it. */
export const requireDayCycle = (registry: Registry): DayCycleDef => {
  if (registry.dayCycle === undefined) {
    throw new Error('content defines no day cycle');
  }
  return registry.dayCycle;
};

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
  dayCycle: undefined,
  contentOrigins: new Map(),
});

const merge = (files: readonly { source: string; file: ContentFile }[]) => {
  const registry = emptyRegistry();
  const origins = registry.contentOrigins;
  const note = (section: ContentSection, id: string, source: string, i: number) =>
    origins.set(`${section}:${id}`, { source, path: `${section}[${i}]` });

  for (const { source, file } of files) {
    if (file.dayCycle !== undefined) {
      registry.dayCycle = file.dayCycle;
    }
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
        if (section === 'skills') {
          const skill = def as NonNullable<ContentFile['skills']>[number];
          const entry =
            skill.combat?.firearms === undefined
              ? skill
              : { ...skill, combat: { ...skill.combat, firearms: { ...skill.combat.firearms, curve: skill.curve } } };
          registry.skills.set(entry.id, entry);
          note(section, entry.id, source, i);
          return;
        }
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

const vesselHasState = (item: ItemDef, registry: Registry): boolean =>
  [
    item.stack,
    item.container,
    item.wearable,
    item.firearm,
    item.light,
    item.igniter,
    item.explosive,
    item.battery,
    item.canister,
    item.model && registry.models.get(item.model)?.gun,
  ].some(Boolean);

const checkVessels = (item: ItemDef, registry: Registry, report: Report): void => {
  const transitions = [
    ...(item.unpack?.inPlace ? [[item.unpack.item, '.unpack.item'] as const] : []),
    ...(item.serving ? [[item.serving.empty, '.serving.empty'] as const] : []),
  ];
  for (const [type, path] of transitions) {
    const next = registry.items.get(type);
    if (
      !next ||
      vesselHasState(item, registry) ||
      vesselHasState(next, registry) ||
      item.twoHanded !== next.twoHanded ||
      item.size.some((value, index) => value !== next.size[index])
    ) {
      report('items', item.id, path, 'in-place vessels require stateless, unstacked items with matching size and grip');
    }
  }
  if (item.serving && !registry.items.get(item.serving.food)?.food) {
    report('items', item.id, '.serving.food', 'serving must reference edible food');
  }
};

// A door keeps only its bar's item type, and lifting the bar hands back a fresh one.
const checkDoorBar = (item: ItemDef, registry: Registry, report: Report): void => {
  if (item.doorBar && (!item.twoHanded || vesselHasState(item, registry))) {
    report('items', item.id, '.doorBar', 'a door bar is a stateless, unstacked item held in both hands');
  }
};

const checkUnpacking = (item: ItemDef, registry: Registry, qualities: ReadonlySet<string>, report: Report): void => {
  checkVessels(item, registry, report);
  checkDoorBar(item, registry, report);
  if (!item.unpack) {
    return;
  }
  if (item.unpack.inPlace && item.unpack.count !== 1) {
    report('items', item.id, '.unpack.count', 'in-place opening yields one vessel');
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
  for (const quality of Object.keys(item.unpack.qualities ?? {})) {
    if (!qualities.has(quality)) {
      report('items', item.id, `.unpack.qualities.${quality}`, `no tool quality "${quality}"`);
    }
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
  if (item.salvage && item.salvageTimeGameMinutes === undefined) {
    report('items', item.id, '.salvageTimeGameMinutes', 'a salvage list needs an authored work time');
  }
  if (!item.salvage && item.salvageTimeGameMinutes !== undefined) {
    report('items', item.id, '.salvageTimeGameMinutes', 'a salvage work time needs a salvage list');
  }
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

const checkItemLightModel = (item: ItemDef, registry: Registry, report: Report) => {
  if (
    item.light?.emissive !== undefined &&
    item.model !== undefined &&
    !registry.models.get(item.model)?.emissiveMaterial
  ) {
    report('items', item.id, '.model', 'an emissive light model needs an emissive material');
  }
  if (item.light?.flame && item.model !== undefined && !registry.models.get(item.model)?.anchors?.flame) {
    report('items', item.id, '.model', 'a flame light model needs a flame anchor');
  }
  if (item.light?.wornSwitch === true && !item.wearable) {
    report('items', item.id, '.light.wornSwitch', 'a worn-switch light needs a wearable component');
  }
};

const checkItemHeldDisplay = (item: ItemDef, registry: Registry, report: Report) => {
  if (item.heldDisplay === undefined) {
    return;
  }
  const model = item.model === undefined ? undefined : registry.models.get(item.model);
  if (!model?.display) {
    report('items', item.id, '.model', 'a held display needs a model with a display');
  }
  if (item.heldDisplay === HELD_DISPLAY_KIND.compass && !model?.anchors?.needle_mount) {
    report('items', item.id, '.model', 'a held compass needs a model with a needle_mount anchor');
  }
  if (item.heldDisplay === HELD_DISPLAY_KIND.compass && !model?.dial) {
    report('items', item.id, '.model', 'a held compass needs a model with a dial');
  }
};

const checkItemBatteries = (item: ItemDef, registry: Registry, report: Report) => {
  const { light } = item;
  const batteries = light?.power ? [light.power.battery, ...(light.power.compatibleBatteries ?? [])] : [];
  for (const [index, battery] of batteries.entries()) {
    if (registry.items.get(battery)?.battery === undefined) {
      const path = index === 0 ? '.light.power.battery' : `.light.power.compatibleBatteries[${index - 1}]`;
      report('items', item.id, path, `"${battery}" is not an item with a battery component`);
    }
  }
  if (
    item.battery?.rechargeable &&
    !Number.isSafeInteger(item.battery.capacity * item.battery.rechargeable.microjoulesPerCharge)
  ) {
    report('items', item.id, '.battery', 'rechargeable capacity must be a safe integer number of microjoules');
  }
};

const checkItemLight = (item: ItemDef, hasIgniter: boolean, registry: Registry, report: Report) => {
  const { light, igniter } = item;
  checkItemBatteries(item, registry, report);
  if (igniter && igniter.perIgnition > igniter.capacity) {
    report('items', item.id, '.igniter.perIgnition', 'must not exceed fuel capacity');
  }
  if (light?.power && light.burnTimeGameHours !== undefined) {
    report('items', item.id, '.light.burnTimeGameHours', 'battery lights cannot also have a burn time');
  }
  if (light?.fuelPerGameHour !== undefined && !igniter && !item.tool?.fuel) {
    report(
      'items',
      item.id,
      '.light.fuelPerGameHour',
      'self-fuelled lights need an igniter or a swappable fuel canister',
    );
  }
  if (light?.fuelPerGameHour !== undefined && light.burnTimeGameHours !== undefined) {
    report('items', item.id, '.light.fuelPerGameHour', 'self-fuelled lights cannot also have a burn time');
  }
  if (light?.burning && light.burnTimeGameHours === undefined && light.fuelPerGameHour === undefined) {
    report('items', item.id, '.light.burning', 'burning rules need a burn time or a fuel rate');
  }
  if (light?.burning?.ignition === 'firestarter' && !hasIgniter) {
    report('items', item.id, '.light.burning.ignition', 'needs at least one item with an igniter component');
  }
};

/** Whether a firearm's exported mounts accept any attachment whose model is a suppressor. */
const acceptsSuppressor = (registry: Registry, model: ModelDef | undefined): boolean => {
  const suppressors = new Set(
    [...registry.items.values()].flatMap((candidate) => {
      const candidateModel = candidate.model === undefined ? undefined : registry.models.get(candidate.model);
      return candidateModel?.gun?.attachment?.kind === 'suppressor' ? [candidateModel.gun.attachment.id] : [];
    }),
  );
  return Object.values(model?.gun?.compatibility ?? {}).some((ids) => ids.some((id) => suppressors.has(id)));
};

/** Authored shot selections must resolve, and a gun that can mount a suppressor must author the quiet event. */
const checkFirearmSounds = (item: ItemDef, model: ModelDef | undefined, registry: Registry, report: Report): void => {
  const firearm = item.firearm!;
  for (const field of ['shotSound', 'shotBodySound', 'dryFireSound', 'boltOpenSound', 'boltCloseSound'] as const) {
    const sound = firearm[field];
    if (sound !== undefined && !registry.sounds.has(sound)) {
      report('items', item.id, `.firearm.${field}`, `no sound event "${sound}"`);
    }
    if (field.startsWith('bolt') && (sound !== undefined) !== (firearm.bolt === true)) {
      report(
        'items',
        item.id,
        `.firearm.${field}`,
        'a bolt gun needs each bolt stroke sound, and only a bolt gun has one',
      );
    }
  }
  if (firearm.suppressedShotSound !== undefined) {
    if (!registry.sounds.has(firearm.suppressedShotSound)) {
      report('items', item.id, '.firearm.suppressedShotSound', `no sound event "${firearm.suppressedShotSound}"`);
    }
  } else if (acceptsSuppressor(registry, model)) {
    report(
      'items',
      item.id,
      '.firearm.suppressedShotSound',
      'a suppressor-mountable firearm needs a suppressed shot sound',
    );
  }
};

const checkMeleeSounds = (item: ItemDef, registry: Registry, report: Report): void => {
  const melee = item.weapon?.melee;
  for (const field of ['swingSound', 'hitSound', 'hitLayerSound'] as const) {
    const sound = melee?.[field];
    if (sound !== undefined && !registry.sounds.has(sound)) {
      report('items', item.id, `.weapon.melee.${field}`, `no sound event "${sound}"`);
    }
  }
};

const checkFirearmHandling = (
  item: ItemDef,
  firearm: NonNullable<ItemDef['firearm']>,
  registry: Registry,
  report: Report,
): void => {
  const model = item.model ? registry.models.get(item.model) : undefined;
  if (Boolean(model?.gun?.revolver) !== Boolean(firearm.revolver)) {
    report('items', item.id, '.firearm.revolver', 'revolver model and handling tuning must be present together');
  }
  if ((firearm.pump || firearm.bolt) && firearm.roundLoadSimSeconds === undefined) {
    report('items', item.id, '.firearm.roundLoadSimSeconds', 'an integral-magazine firearm needs a round load time');
  }
  if (
    firearm.bolt &&
    (firearm.pump ||
      !model?.gun?.internalMagazine ||
      !model.anchors?.loading_port ||
      !Object.values(model.gun.action?.parts ?? {}).some((part) => part.turn))
  ) {
    report('items', item.id, '.firearm.bolt', 'a bolt firearm needs a turning action and integral loading port');
  }
  if (magazineWellCalibre(registry, item.id) !== undefined && firearm.handling.magazine === undefined) {
    report('items', item.id, '.firearm.handling.magazine', 'a magazine-fed firearm needs magazine handling times');
  }
};

const checkItemFirearm = (item: ItemDef, registry: Registry, report: Report): void => {
  if (item.firearm?.pump && item.firearm.dispersionRadians !== 0) {
    report('items', item.id, '.firearm.dispersionRadians', 'pump pellet spread owns its cone');
  }
  // The fitted magazine is drawn at this slot, so a magazine-fed gun's model shows whether one is fitted.
  if (magazineWellCalibre(registry, item.id) !== undefined && !registry.models.get(item.model!)?.gun?.slots?.magazine) {
    report('items', item.id, '.model', 'a magazine-fed firearm needs a model with a magazine slot');
  }
  const model = item.model === undefined ? undefined : registry.models.get(item.model);
  if (item.firearm) {
    checkFirearmSounds(item, model, registry, report);
    checkFirearmHandling(item, item.firearm, registry, report);
  }
  for (const attachment of model?.gun?.attachments ?? []) {
    const registered = [...registry.items.values()].some((candidate) => {
      const attachmentModel = candidate.model === undefined ? undefined : registry.models.get(candidate.model);
      return attachmentModel?.gun?.attachment?.id === attachment.id;
    });
    if (!registered) {
      report('items', item.id, '.model', `no item model registered for attachment "${attachment.id}"`);
    }
  }
};

const addLootTableItems = (
  registry: Registry,
  tableId: string,
  items: Set<string>,
  visitedTables: Set<string>,
): void => {
  if (visitedTables.has(tableId)) {
    return;
  }
  visitedTables.add(tableId);
  for (const entry of registry.loot.get(tableId)?.entries ?? []) {
    if (entry.item) {
      items.add(entry.item);
    } else if (entry.table) {
      addLootTableItems(registry, entry.table, items, visitedTables);
    }
  }
};

const addDerivedItems = (registry: Registry, item: ItemDef, items: Set<string>): void => {
  for (const yieldItem of item.disassembly?.yields ?? []) {
    items.add(yieldItem.item);
  }
  const model = item.model === undefined ? undefined : registry.models.get(item.model);
  for (const fitted of model?.gun?.attachments ?? []) {
    const child = [...registry.items.values()].find((candidate) => {
      const attachmentModel = candidate.model === undefined ? undefined : registry.models.get(candidate.model);
      return attachmentModel?.gun?.attachment?.id === fitted.id;
    });
    if (child) {
      items.add(child.id);
    }
  }
};

const addFixedLootItems = (registry: Registry, items: Set<string>): void => {
  const sources = [...registry.layouts.values()].flatMap((layout) =>
    layout.buildings.flatMap((building) => building.fixedLoot ?? []),
  );
  sources.push(...scenarioSources(registry).fixedLoot);
  for (const source of sources) {
    for (const fixed of source.items) {
      items.add(fixed.item);
    }
  }
};

const obtainableItems = (registry: Registry): ReadonlySet<string> => {
  const items = new Set<string>();
  const visitedTables = new Set<string>();
  for (const tableId of registry.loot.keys()) {
    addLootTableItems(registry, tableId, items, visitedTables);
  }
  for (const recipe of registry.recipes.values()) {
    items.add(recipe.result.item);
  }
  for (const item of registry.items.values()) {
    addDerivedItems(registry, item, items);
  }
  addFixedLootItems(registry, items);
  return items;
};

const checkItemOptic = (item: ItemDef, registry: Registry, obtainable: ReadonlySet<string>, report: Report): void => {
  const model = item.model === undefined ? undefined : registry.models.get(item.model);
  const attachment = model?.gun?.attachment;
  const range = attachment?.properties.magnification;
  const variable = attachment?.kind === 'optic' && range !== undefined && range.min < range.max;
  if (item.opticMagnification !== undefined && attachment?.kind !== 'optic') {
    report('items', item.id, '.opticMagnification', 'an initial ADS magnification needs an optic model');
    return;
  }
  if (item.opticMagnification !== undefined && range === undefined) {
    report('items', item.id, '.opticMagnification', 'the optic model exports no magnification range');
  } else if (
    item.opticMagnification !== undefined &&
    range &&
    (item.opticMagnification < range.min || item.opticMagnification > range.max)
  ) {
    report('items', item.id, '.opticMagnification', 'the initial ADS magnification is outside the exported range');
  }
  if (obtainable.has(item.id) && variable && item.opticMagnification === undefined) {
    report(
      'items',
      item.id,
      '.opticMagnification',
      'an obtainable variable-power optic needs an initial ADS magnification',
    );
  }
  checkOpticZoom(item, variable, obtainable.has(item.id), report);
};

const EFFECT_ATTACHMENT_KINDS: ReadonlySet<string> = new Set(['suppressor', 'foregrip']);

const checkItemAttachmentEffects = (item: ItemDef, registry: Registry, report: Report): void => {
  const kind = item.model === undefined ? undefined : registry.models.get(item.model)?.gun?.attachment?.kind;
  const effects = item.firearmAttachmentEffects;
  if (effects === undefined && kind !== undefined && EFFECT_ATTACHMENT_KINDS.has(kind)) {
    report('items', item.id, '.firearmAttachmentEffects', `a ${kind} model needs ${kind} attachment effects`);
  } else if (effects !== undefined && effects.kind !== kind) {
    report('items', item.id, '.firearmAttachmentEffects.kind', `${effects.kind} effects need a ${effects.kind} model`);
  }
};

const checkOpticZoom = (item: ItemDef, variable: boolean, obtainable: boolean, report: Report): void => {
  if (item.opticZoom !== undefined && !variable) {
    report('items', item.id, '.opticZoom', 'zoom tuning needs a variable-power optic model');
  }
  if (variable && (obtainable || item.opticMagnification !== undefined) && !item.opticZoom) {
    report('items', item.id, '.opticZoom', 'a supported variable-power optic needs zoom tuning');
  }
};

const checkContainerWidth = ({
  section,
  id,
  container,
  registry,
  report,
}: {
  section: 'items' | 'furniture';
  id: string;
  container: NonNullable<ItemDef['container']>;
  registry: Registry;
  report: Report;
}): void => {
  const limit = registry.inventory.get(CORE_CONTENT_IDS.player)?.containerMaxWidthCells;
  if (limit === undefined || container.wideReason) {
    return;
  }
  container.pockets.forEach((pocket, index) => {
    if (pocket.grid[0] > limit) {
      report(
        section,
        id,
        `.container.pockets[${index}].grid[0]`,
        `pocket width ${pocket.grid[0]} exceeds inventory limit ${limit}; add a wideReason for an exception`,
      );
    }
  });
};

const itemGridNames = (item: ItemDef): Set<string> => {
  const [width, height] = item.size;
  return new Set([visibleGridName(item.name, width, height), visibleGridName(item.name, height, width)]);
};

const checkInventoryNameCollisions = (items: readonly ItemDef[], report: Report): void => {
  for (let firstIndex = 0; firstIndex < items.length; firstIndex += 1) {
    const first = items[firstIndex]!;
    const firstFootprint = [...first.size].sort((a, b) => a - b).join('x');
    const firstNames = itemGridNames(first);
    for (const second of items.slice(firstIndex + 1)) {
      if (second.category !== first.category || [...second.size].sort((a, b) => a - b).join('x') !== firstFootprint) {
        continue;
      }
      const secondNames = itemGridNames(second);
      if ([...secondNames].some((name) => firstNames.has(name))) {
        report('items', second.id, '.name', `visible grid name collides with "${first.id}"`);
      }
    }
  }
};

const checkWearableModels = (item: ItemDef, registry: Registry, report: Report): void => {
  for (const field of ['viewModel', 'figureModel'] as const) {
    const entry = item.wearable?.[field];
    if (entry && !registry.models.has(entry.model)) {
      report('items', item.id, `.wearable.${field}.model`, `no model "${entry.model}"`);
    }
  }
};

const checkItemMass = (item: ItemDef, registry: Registry, report: Report): void => {
  const model = item.model === undefined ? undefined : registry.models.get(item.model);
  if (item.model !== undefined && model === undefined) {
    return;
  }
  const hasParts = model?.parts !== undefined;
  if (hasParts === (item.weight !== undefined)) {
    report(
      'items',
      item.id,
      '.weight',
      hasParts
        ? 'an assembly sums its model parts and cannot author an item weight'
        : 'an atom needs an authored item weight',
    );
  }
};

const checkPaperMap = (item: ItemDef, report: Report): void => {
  if (item.paperMap && (item.stack !== undefined || item.book !== undefined || item.readable !== undefined)) {
    report('items', item.id, '.paperMap', 'paper maps cannot stack or declare another reading capability');
  }
};

const checkVessel = (item: ItemDef, registry: Registry, report: Report): void => {
  const { vessel } = item;
  if (!vessel) {
    return;
  }
  if (item.stack !== undefined) {
    report('items', item.id, '.stack', 'liquid vessels cannot stack');
  }
  if (
    item.canister ||
    item.battery ||
    item.igniter ||
    item.tool?.fuel ||
    item.light?.power ||
    item.light?.burnTimeGameHours !== undefined ||
    item.light?.fuelPerGameHour !== undefined ||
    item.serving ||
    item.food ||
    item.unpack
  ) {
    report('items', item.id, '.vessel', 'liquid vessels cannot declare another consumable balance or unpacking');
  }
  for (const liquid of vessel.accepts) {
    if (!registry.liquids.has(liquid)) {
      report('items', item.id, '.vessel.accepts', `no liquid "${liquid}"`);
    }
  }
  const initial = vessel.initialContents;
  if (initial.kind === 'filled') {
    if (!(vessel.accepts.includes(initial.liquid) && registry.liquids.has(initial.liquid))) {
      report('items', item.id, '.vessel.initialContents', 'initial liquid must be registered and accepted');
    }
    if (initial.volumeMicrolitres > vessel.capacityMicrolitres) {
      report('items', item.id, '.vessel.initialContents', 'initial volume exceeds capacity');
    }
  }
};

const checkItems = (registry: Registry, report: Report) => {
  const items = [...registry.items.values()];
  checkInventoryNameCollisions(items, report);
  const obtainable = obtainableItems(registry);
  const qualities = new Set(items.flatMap((item) => Object.keys(item.tool?.qualities ?? {})));
  const hasIgniter = items.some((item) => item.igniter !== undefined);
  const cellMetres = registry.inventory.get(CORE_CONTENT_IDS.player)?.cellMetres;
  for (const item of items) {
    if (item.container) {
      checkContainerWidth({ section: 'items', id: item.id, container: item.container, registry, report });
      const issue = rigidPocketScaleIssue(item);
      if (issue) {
        report('items', item.id, '.container.pockets', issue);
      }
    }
    checkItemMass(item, registry, report);
    checkVessel(item, registry, report);
    checkItemLight(item, hasIgniter, registry, report);
    checkItemLightModel(item, registry, report);
    checkItemHeldDisplay(item, registry, report);
    checkItemFirearm(item, registry, report);
    checkMeleeSounds(item, registry, report);
    checkItemOptic(item, registry, obtainable, report);
    checkItemAttachmentEffects(item, registry, report);
    checkUnpacking(item, registry, qualities, report);
    checkDisassembly(item, registry, qualities, report);
    checkBook(item, registry, report);
    checkPaperMap(item, report);
    checkToolFuel(item, registry, report);
    checkWearableModels(item, registry, report);
    if (item.model !== undefined && !registry.models.has(item.model)) {
      report('items', item.id, '.model', `no model "${item.model}"`);
    }
    const scaleIssue = (cellMetres && footprintScaleIssue(registry, item, cellMetres)) ?? pileFitIssue(item, PILE_GRID);
    if (scaleIssue) {
      report('items', item.id, '.size', scaleIssue);
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

const checkDoorOpenNoise = (registry: Registry, furniture: FurnitureDef, report: Report) => {
  const openNoise = furniture.door?.openNoise;
  const openingSound = openNoise && registry.sounds.get(openNoise.sound);
  if (openNoise && !openingSound) {
    report('furniture', furniture.id, '.door.openNoise.sound', `no sound event "${openNoise.sound}"`);
  } else if (openNoise && openingSound && !openingSound.noise.enabled) {
    report('furniture', furniture.id, '.door.openNoise.sound', 'opening sound must emit hearing noise');
  }
};

const checkSearchNoise = (registry: Registry, furniture: FurnitureDef, report: Report) => {
  const { searchNoise } = furniture;
  const sound = searchNoise && registry.sounds.get(searchNoise.sound);
  if (searchNoise && !sound) {
    report('furniture', furniture.id, '.searchNoise.sound', `no sound event "${searchNoise.sound}"`);
  } else if (searchNoise && sound && !sound.noise.enabled) {
    report('furniture', furniture.id, '.searchNoise.sound', 'search sound must emit hearing noise');
  }
};

const militaryOnly = (id: string) => `"${id}" is military loot only`;

const checkInstalledEconomy = (registry: Registry, item: ItemDef, report: Report) => {
  for (const usage of item.economy.usage) {
    for (const tier of item.economy.tiers) {
      const issue = lootTypeIssue(registry, item.id, { usage: [usage], tier });
      if (issue !== undefined) {
        report('items', item.id, '.economy', issue);
      }
    }
  }
};

const itemSupplyOutputs = (item: ItemDef): (readonly [string, string])[] => [
  ...(item.unpack ? [['.unpack.item', item.unpack.item] as const] : []),
  ...(item.serving
    ? [['.serving.food', item.serving.food] as const, ['.serving.empty', item.serving.empty] as const]
    : []),
  ...(item.disassembly?.yields ?? []).map((output, i) => [`.disassembly.yields[${i}].item`, output.item] as const),
  ...(item.salvage ?? []).map((output, i) => [`.salvage[${i}].item`, output.item] as const),
];

/** Military-only supply cannot be manufactured through an ordinary recipe or salvage source. */
const checkMilitaryLoot = (registry: Registry, report: Report) => {
  const military = militaryLootItems(registry);
  for (const item of registry.items.values()) {
    checkInstalledEconomy(registry, item, report);
    const outputs = itemSupplyOutputs(item);
    for (const [path, output] of military.has(item.id) ? [] : outputs) {
      if (military.has(output)) {
        report('items', item.id, path, `${militaryOnly(output)}; salvage may not yield it`);
      }
    }
  }
  for (const recipe of registry.recipes.values()) {
    if (recipe.kind !== 'repair' && military.has(recipe.result.item)) {
      report('recipes', recipe.id, '.result.item', `${militaryOnly(recipe.result.item)}; no recipe may make it`);
    }
  }
};

const checkMaterial = (registry: Registry, furniture: FurnitureDef, report: Report) => {
  const material = registry.furnitureMaterials.get(furniture.material);
  if (!material) {
    report('furniture', furniture.id, '.material', `no furniture material "${furniture.material}"`);
  } else if (furniture.door && !material.methods) {
    report('furniture', furniture.id, '.material', `door material "${material.id}" must list its forcing methods`);
  }
};

const checkMaterialSounds = (registry: Registry, report: Report) => {
  for (const material of registry.furnitureMaterials.values()) {
    if (!registry.sounds.get(material.blowSound)?.noise.enabled) {
      report('furnitureMaterials', material.id, '.blowSound', 'blows need a sound that alerts hearing');
    }
  }
};

const checkDoorForcing = (registry: Registry, furniture: FurnitureDef, report: Report) => {
  const { door } = furniture;
  if (!door) {
    return;
  }
  const material = registry.furnitureMaterials.get(furniture.material);
  for (const [id, method] of Object.entries(door.methods)) {
    const path = `.door.methods.${id}`;
    if (material?.methods && !material.methods.includes(id)) {
      report('furniture', furniture.id, path, `material "${material.id}" does not admit method "${id}"`);
    }
    if (!registry.skills.has(method.skill)) {
      report('furniture', furniture.id, `${path}.skill`, `no skill "${method.skill}"`);
    }
    const sound = registry.sounds.get(method.strikeSound);
    if (!sound?.noise.enabled) {
      report('furniture', furniture.id, `${path}.strikeSound`, 'forcing strikes need a sound that alerts hearing');
    }
    if (method.fuel !== undefined) {
      checkForcingFuel(registry, { furniture: furniture.id, path, method }, report);
    }
  }
};

const checkForcingFuel = (
  registry: Registry,
  at: { furniture: string; path: string; method: { quality: string; level: number; fuel?: number | undefined } },
  report: Report,
) => {
  const { method } = at;
  for (const item of registry.items.values()) {
    if ((item.tool?.qualities[method.quality] ?? 0) < method.level) {
      continue;
    }
    const canister = item.tool?.fuel?.canister;
    const capacity = canister === undefined ? undefined : registry.items.get(canister)?.canister?.capacity;
    if (capacity === undefined) {
      report('furniture', at.furniture, `${at.path}.fuel`, `"${item.id}" meets the method but has no fuel canister`);
    } else if (capacity < method.fuel!) {
      report('furniture', at.furniture, `${at.path}.fuel`, `a full canister for "${item.id}" cannot cover one cut`);
    }
  }
};

const checkToolFuel = (item: ItemDef, registry: Registry, report: Report) => {
  const canister = item.tool?.fuel?.canister;
  if (canister !== undefined && registry.items.get(canister)?.canister === undefined) {
    report('items', item.id, '.tool.fuel.canister', `"${canister}" is not an item with a canister component`);
  }
};

const checkChargerBattery = (registry: Registry, furniture: FurnitureDef, type: string, report: Report) => {
  const charger = furniture.charger!;
  const grid = furniture.container?.pockets[charger.pocket]?.grid;
  const item = registry.items.get(type);
  if (!item?.battery?.rechargeable) {
    report('furniture', furniture.id, '.charger.batteries', `"${type}" is not rechargeable`);
  } else if (
    grid &&
    !((item.size[0] <= grid[0] && item.size[1] <= grid[1]) || (item.size[1] <= grid[0] && item.size[0] <= grid[1]))
  ) {
    report('furniture', furniture.id, '.charger.pocket', `"${type}" does not fit`);
  }
};

const checkFurnitureCharger = (registry: Registry, furniture: FurnitureDef, report: Report) => {
  const { power, charger } = furniture;
  if (charger) {
    const device = power && registry.powerDevices.get(power.device);
    const rate = device?.kind === 'consumer' ? device.demandWatts * POWER_UNITS.rate * charger.efficiency : 0;
    if (!Number.isSafeInteger(rate) || rate <= 0 || power?.light) {
      report(
        'furniture',
        furniture.id,
        '.charger',
        'needs a positive consumer with exact delivered microjoules per game millisecond and no light',
      );
    }
    const grid = furniture.container?.pockets[charger.pocket]?.grid;
    if (!grid) {
      report('furniture', furniture.id, '.charger.pocket', 'needs a container pocket');
    }
    for (const type of charger.batteries) {
      checkChargerBattery(registry, furniture, type, report);
    }
  }
};

const checkFurniturePower = (registry: Registry, furniture: FurnitureDef, report: Report) => {
  checkFurnitureCharger(registry, furniture, report);
  const { power } = furniture;
  if (!power) {
    return;
  }
  const device = registry.powerDevices.get(power.device);
  if (!device) {
    report('furniture', furniture.id, '.power.device', `no power device "${power.device}"`);
  } else if (device.kind !== 'generator' && power.fuelLitres !== 0) {
    report('furniture', furniture.id, '.power.fuelLitres', 'only a generator holds fuel');
  }
  if (power.light && device?.kind !== 'consumer') {
    report('furniture', furniture.id, '.power.light', 'a light must be a consumer');
  }
};

const checkFurniture = (registry: Registry, report: Report) => {
  const cellMetres = registry.inventory.get(CORE_CONTENT_IDS.player)?.cellMetres;
  checkMaterialSounds(registry, report);
  for (const furniture of registry.furniture.values()) {
    checkFurniturePower(registry, furniture, report);
    if (furniture.container) {
      checkContainerWidth({ section: 'furniture', id: furniture.id, container: furniture.container, registry, report });
    }
    furniture.container?.pockets.forEach(({ grid }, index) => {
      const issue = cellMetres && pocketScaleIssue(furniture, grid, cellMetres);
      if (issue) {
        report('furniture', furniture.id, `.container.pockets[${index}].grid`, issue);
      }
    });
    checkDoorOpenNoise(registry, furniture, report);
    checkSearchNoise(registry, furniture, report);
    checkMaterial(registry, furniture, report);
    checkDoorForcing(registry, furniture, report);
    furniture.ruin?.debris.forEach(({ item }, index) => {
      if (!registry.items.has(item)) {
        report('furniture', furniture.id, `.ruin.debris[${index}].item`, `no item "${item}"`);
      }
    });
  }
};

type PaletteThing = Exclude<TemplateDef['palette'][string], string>;

const checkPaletteObjectRefs = (registry: Registry, entry: PaletteThing): [string, string][] => {
  const found: [string, string][] = [];
  const furniture = entry.furniture === undefined ? undefined : registry.furniture.get(entry.furniture);
  if (entry.lock && furniture && !furniture.door) {
    found.push(['.lock', 'only a door can have a lock']);
  }
  if (entry.fixed && furniture?.cover) {
    found.push(['.fixed', 'a cover must be liftable, so it cannot be fitted']);
  }
  if (entry.spawn !== undefined && !registry.zombies.has(entry.spawn)) {
    found.push(['.spawn', `no zombie type "${entry.spawn}"`]);
  }
  return found;
};

const checkPaletteThing = (registry: Registry, template: TemplateDef, char: string, entry: PaletteThing) => {
  const found: [string, string][] = [];
  const furniture = entry.furniture === undefined ? undefined : registry.furniture.get(entry.furniture);
  if (entry.furniture !== undefined && !furniture) {
    found.push(['.furniture', `no furniture "${entry.furniture}"`]);
  }
  const pieces = furniture && findPieces(template, char, pieceSize(furniture.size, entry.facing ?? 'n', entry.tip));
  if (pieces?.problem) {
    found.push(['.furniture', pieces.problem]);
  }
  if (furniture?.mount === 'wall') {
    found.push(...wallMountIssues(registry, template, entry, pieces?.anchors ?? []));
  }
  if (entry.loot !== undefined && !registry.loot.has(entry.loot)) {
    found.push(['.loot', `no loot table "${entry.loot}"`]);
  }
  if (entry.loot !== undefined && furniture && furniture.container === undefined) {
    found.push(['.loot', 'has loot but no container to put it in']);
  }
  const misfit = entry.loot !== undefined && furniture?.container && rolledFitIssue(registry, furniture, entry.loot);
  if (misfit) {
    found.push(['.loot', misfit]);
  }
  found.push(...checkPaletteObjectRefs(registry, entry));
  return found;
};

const solidTemplateBlock = (
  registry: Registry,
  template: TemplateDef,
  char: string | undefined,
): string | undefined => {
  const id = char === undefined ? undefined : template.palette[char];
  if (typeof id !== 'string') {
    return undefined;
  }
  const index = registry.blockIds.get(id);
  return index !== undefined && registry.blocks[index]?.solid ? id : undefined;
};

const wallMountIssues = (
  registry: Registry,
  template: TemplateDef,
  entry: PaletteThing,
  anchors: readonly (readonly [number, number, number])[],
): [string, string][] => {
  const back: Record<NonNullable<PaletteThing['facing']>, readonly [number, number]> = {
    n: [0, 1],
    e: [-1, 0],
    s: [0, -1],
    w: [1, 0],
  };
  const [dx, dz] = back[entry.facing ?? 'n'];
  return anchors.flatMap(([x, y, z]): [string, string][] =>
    solidTemplateBlock(registry, template, [...(template.layers[y]?.[z + dz] ?? '')][x + dx])
      ? []
      : [['.furniture', `wall mount at [${x}, ${y}, ${z}] needs a solid block behind its back face`]],
  );
};

const boundaryWallAt = (
  registry: Registry,
  template: TemplateDef,
  y: number,
  { x, z }: { x: number; z: number },
): string | null => {
  const [width, , depth] = template.size;
  if (x !== 0 && z !== 0 && x !== width - 1 && z !== depth - 1) {
    return null;
  }
  const row = template.layers[y]?.[z] ?? '';
  if (template.palette[row[x] ?? ''] !== 'air') {
    return null;
  }
  const wall = solidTemplateBlock(registry, template, template.layers[y - 1]?.[z]?.[x]);
  return wall && wall === solidTemplateBlock(registry, template, template.layers[y + 1]?.[z]?.[x]) ? wall : null;
};

const exteriorWallCourses = (registry: Registry, template: TemplateDef, y: number): Set<string> => {
  const [width, , depth] = template.size;
  const walls = new Set<string>();
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const wall = boundaryWallAt(registry, template, y, { x, z });
      if (wall) {
        walls.add(wall);
      }
    }
  }
  return walls;
};

const interiorSolidBlocks = (registry: Registry, template: TemplateDef, y: number): Set<string> => {
  const [width, , depth] = template.size;
  const blocks = new Set<string>();
  for (let z = 1; z < depth - 1; z += 1) {
    const row = template.layers[y]?.[z] ?? '';
    for (let x = 1; x < width - 1; x += 1) {
      const block = solidTemplateBlock(registry, template, row[x]);
      if (block) {
        blocks.add(block);
      }
    }
  }
  return blocks;
};

const floorCourseWallGap = (registry: Registry, template: TemplateDef, y: number): string | null => {
  const wallCourses = exteriorWallCourses(registry, template, y);
  if (wallCourses.size === 0) {
    return null;
  }
  const floorBlocks = interiorSolidBlocks(registry, template, y);
  for (const wall of wallCourses) {
    if ([...floorBlocks].some((block) => block !== wall)) {
      return wall;
    }
  }
  return null;
};

const checkFloorCourseWall = (registry: Registry, template: TemplateDef, y: number, report: Report): void => {
  const wall = floorCourseWallGap(registry, template, y);
  if (wall) {
    report(
      'templates',
      template.id,
      `.layers[${y}]`,
      `has an open exterior cell between matching "${wall}" wall courses`,
    );
  }
};

const checkFloorCourseWalls = (registry: Registry, template: TemplateDef, report: Report): void => {
  for (let y = 1; y < template.layers.length - 1; y += 1) {
    checkFloorCourseWall(registry, template, y, report);
  }
};

const checkTemplateSpace = (registry: Registry, template: TemplateDef, report: Report) => {
  if (!templateResolves(registry, template)) {
    return;
  }
  let compiled: ReturnType<typeof compileTemplate>;
  try {
    compiled = compileTemplate(registry, template);
  } catch (error) {
    report('templates', template.id, '.ownership', error instanceof Error ? error.message : String(error));
    return;
  }
  for (const [path, message] of templateDoorIssues(registry, compiled)) {
    report('templates', template.id, path, message);
  }
  for (const [path, message] of templateGroundLootIssues(registry, compiled)) {
    report('templates', template.id, path, message);
  }
  for (const [path, message] of pieceItemIssues(registry, compiled)) {
    report('templates', template.id, path, message);
  }
  for (const [path, message] of templateSpawnClearanceIssues(registry, compiled)) {
    report('templates', template.id, path, message);
  }
  if (template.access) {
    for (const [path, message] of templateSpatialIssues(registry, compiled)) {
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
    checkFloorCourseWalls(registry, template, report);
    checkTemplateSpace(registry, template, report);
  }
};

/** Named window times mean something only against a day cycle, and a window's ends must differ once resolved. */
const checkSpawnWindows = (registry: Registry, report: Report) => {
  const { dayCycle } = registry;
  const check = (spawnWindow: SpawnTimeWindow | undefined, locate: (message: string) => void) => {
    if (spawnWindow === undefined) {
      return;
    }
    const { fromGameTimeOfDay: from, toGameTimeOfDay: to } = spawnWindow;
    if (dayCycle === undefined) {
      if (typeof from === 'string' || typeof to === 'string') {
        locate('a named spawn time needs a day cycle');
      }
    } else if (to !== undefined && resolveSpawnTime(dayCycle, from) === resolveSpawnTime(dayCycle, to)) {
      locate('from and to must differ');
    }
  };
  for (const template of registry.templates.values()) {
    for (const [char, entry] of Object.entries(template.palette)) {
      if (typeof entry !== 'string') {
        check(entry.window, (message) => report('templates', template.id, `.palette["${char}"].window`, message));
      }
    }
  }
  for (const layout of registry.layouts.values()) {
    layout.shamblers?.forEach((shambler, index) => {
      check(shambler.window, (message) => report('layouts', layout.id, `.shamblers[${index}].window`, message));
    });
  }
};

const checkSiteGeneration = (registry: Registry, report: Report) => {
  for (const entry of registry.siteGeneration.values()) {
    const { terrain, trees, ...single } = entry.palette;
    const blocks: [string, string][] = [
      ...Object.entries(terrain).map(([key, name]): [string, string] => [`.palette.terrain.${key}`, name]),
      ...Object.entries(trees).map(([key, name]): [string, string] => [`.palette.trees.${key}`, name]),
      ...Object.entries(single).map(([key, name]): [string, string] => [`.palette.${key}`, name]),
    ];
    for (const [path, name] of blocks) {
      if (!registry.blockIds.has(name)) {
        report('siteGeneration', entry.id, path, `no block "${name}"`);
      }
    }
  }
};

const checkHandlingRanges = (registry: Registry, report: Report) => {
  for (const layout of registry.handlingRange.values()) {
    for (const [path, message] of handlingRangeIssues(layout)) {
      report('handlingRange', layout.id, path, message);
    }
  }
};

const checkSeveredItems = (registry: Registry, zombie: ZombieDef, report: Report) => {
  const regions = Object.keys(zombie.regions);
  if (
    regions.length !== Object.keys(zombie.severedItems).length ||
    regions.some((region) => !Object.hasOwn(zombie.severedItems, region))
  ) {
    report('zombies', zombie.id, '.severedItems', 'severed item keys must match region keys');
  }
  for (const [region, item] of Object.entries(zombie.severedItems)) {
    if (item !== null && !registry.items.has(item)) {
      report('zombies', zombie.id, `.severedItems.${region}`, `no item "${item}"`);
    }
  }
};

const checkZombies = (registry: Registry, report: Report) => {
  const qualities = new Set([...registry.items.values()].flatMap((item) => Object.keys(item.tool?.qualities ?? {})));
  for (const zombie of registry.zombies.values()) {
    checkSeveredItems(registry, zombie, report);
    if (zombie.loot !== undefined && !registry.loot.has(zombie.loot)) {
      report('zombies', zombie.id, '.loot', `no loot table "${zombie.loot}"`);
    }
    const quality = zombie.downed?.dismember.quality;
    if (quality !== undefined && !qualities.has(quality)) {
      report('zombies', zombie.id, '.downed.dismember.quality', `no tool quality "${quality}"`);
    }
    for (const key of ['idle', 'alert', 'attack', 'hurt'] as const) {
      const event = zombie.sounds[key];
      if (!registry.sounds.has(event)) {
        report('zombies', zombie.id, `.sounds.${key}`, `no sound event "${event}"`);
      }
    }
  }
};

const checkRecipeRepair = (registry: Registry, recipe: RecipeDef, report: Report): void => {
  if (recipe.activation && (recipe.kind !== 'repair' || recipe.components.length > 0)) {
    report('recipes', recipe.id, '.activation', 'held sharpening needs a repair effect and no components');
  }
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
    registry.skills.get(CORE_CONTENT_IDS.crafting)?.training?.craftingTierOffset === undefined
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
  const sources = [
    ...[...registry.templates.values()].map((definition) => ({ section: 'templates' as const, definition })),
    ...[...registry.mapPieces.values()].map((definition) => ({ section: 'mapPieces' as const, definition })),
  ];
  const doorLocks = new Set(sources.flatMap(({ definition }) => templateLockIds(registry, definition)));
  const keyLocks = new Set([...registry.items.values()].flatMap((item) => (item.key ? [item.key.lock] : [])));
  for (const item of registry.items.values()) {
    if (item.key && !doorLocks.has(item.key.lock)) {
      report('items', item.id, '.key.lock', `no door has lock "${item.key.lock}"`);
    }
  }
  for (const { section, definition } of sources) {
    for (const lock of new Set(templateLockIds(registry, definition))) {
      if (!keyLocks.has(lock)) {
        report(section, definition.id, '.palette', `no key names lock "${lock}"`);
      }
    }
  }
};

const checkLayoutReferences = (layout: SiteLayoutDef, registry: Registry, report: Report): void => {
  if (layout.weatheringProfile && !registry.weathering.has(layout.weatheringProfile)) {
    report('layouts', layout.id, '.weatheringProfile', `no weathering profile "${layout.weatheringProfile}"`);
  }
  for (const [path, message] of authoredLayoutIssues(layout, registry)) {
    report('layouts', layout.id, path, message);
  }
  const keys = new Set<string>();
  for (const [index, vehicle] of (layout.vehicles ?? []).entries()) {
    if (!registry.vehicleBlueprints.has(vehicle.blueprint)) {
      report('layouts', layout.id, `.vehicles[${index}].blueprint`, `no vehicle blueprint "${vehicle.blueprint}"`);
    }
    if (keys.has(vehicle.placementKey)) {
      report('layouts', layout.id, `.vehicles[${index}].placementKey`, 'duplicate vehicle placement key');
    }
    keys.add(vehicle.placementKey);
  }
  const light = layout.practice?.light;
  if (light && registry.items.get(light.light)?.light?.power?.battery !== light.battery) {
    report('layouts', layout.id, '.practice.light', `"${light.light}" is not a light that takes "${light.battery}"`);
  }
};

const reportMissingCamoSettings = (block: BlockDef, report: Report): void => {
  if (!block.patternPalette) {
    report('blocks', block.id, '.patternPalette', 'camo blocks require a four-colour pattern palette');
  }
  if (block.patternWashout === undefined) {
    report('blocks', block.id, '.patternWashout', 'camo blocks require a pattern washout value');
  }
};

const reportCamoSettingMismatch = (first: BlockDef, block: BlockDef, report: Report): void => {
  if (
    !first.patternPalette ||
    first.patternWashout === undefined ||
    !block.patternPalette ||
    block.patternWashout === undefined
  ) {
    return;
  }
  const paletteDiffers = block.patternPalette.some((color, i) => color !== first.patternPalette?.[i]);
  const washoutDiffers = block.patternWashout !== first.patternWashout;
  if (!(paletteDiffers || washoutDiffers)) {
    return;
  }
  report(
    'blocks',
    block.id,
    paletteDiffers ? '.patternPalette' : '.patternWashout',
    `camo palette and washout must match the first camo block "${first.id}"`,
  );
};

const checkCamoBlocks = (registry: Registry, report: Report): void => {
  const [first, ...rest] = registry.blocks.filter((block) => block.pattern === 'camo');
  if (!first) {
    return;
  }

  reportMissingCamoSettings(first, report);
  for (const block of rest) {
    reportMissingCamoSettings(block, report);
    reportCamoSettingMismatch(first, block, report);
  }
};

// The saved firing record is keyed by rule id, so a duplicate id would let one rule's firing silence another.
const checkEventRules = (registry: Registry, scenario: ScenarioDef, report: Report): void => {
  const ids = new Set<string>();
  scenario.eventRules.forEach((rule, index) => {
    if (ids.has(rule.id)) {
      report('scenarios', scenario.id, `.eventRules[${index}].id`, `duplicate event rule "${rule.id}"`);
    }
    ids.add(rule.id);
    rule.effects.forEach((effect, effectIndex) => {
      if (!registry.zombies.has(effect.zombie)) {
        report(
          'scenarios',
          scenario.id,
          `.eventRules[${index}].effects[${effectIndex}].zombie`,
          `no zombie type "${effect.zombie}"`,
        );
      }
    });
  });
};

const checkScenarios = (registry: Registry, report: Report): void => {
  for (const scenario of registry.scenarios.values()) {
    for (const [path, message] of scenarioPlanIssues(registry, scenario)) {
      report('scenarios', scenario.id, path, message);
    }
    if (!registry.body.has(scenario.body)) {
      report('scenarios', scenario.id, '.body', `no body tuning "${scenario.body}"`);
    }
    if (!registry.compression.has(scenario.compression)) {
      report('scenarios', scenario.id, '.compression', `no compression tuning "${scenario.compression}"`);
    }
    checkEventRules(registry, scenario, report);
    if (registry.layouts.has(scenario.id) || ['city', 'forest', 'testHouse', 'weatheringTest'].includes(scenario.id)) {
      report('scenarios', scenario.id, '.id', 'scenario id collides with another site selector');
    }
  }
};

const checkBlockFootsteps = (registry: Registry, report: Report): void => {
  for (const { id, footsteps } of registry.blocks) {
    if (!footsteps) {
      continue;
    }
    for (const [family, event] of Object.entries(footsteps)) {
      if (!registry.sounds.has(event)) {
        report('blocks', id, `.footsteps.${family}`, `no sound event "${event}"`);
      }
    }
  }
};

const checkSkillAndUiReferences = (registry: Registry, report: Report): void => {
  for (const skill of registry.skills.values()) {
    skill.startingRecipes?.forEach((id, index) => {
      if (!registry.recipes.has(id)) {
        report('skills', skill.id, `.startingRecipes[${index}]`, `no recipe "${id}"`);
      }
    });
  }
  for (const tuning of registry.ui.values()) {
    if (!registry.sounds.has(tuning.refusalSound)) {
      report('ui', tuning.id, '.refusalSound', `no sound event "${tuning.refusalSound}"`);
    }
  }
};

// A heartbeat plays one recording per beat, so each of its sounds has exactly one variant.
const checkHeartbeatSounds = (registry: Registry, report: Report): void => {
  for (const tuning of registry.body.values()) {
    for (const [pace, event] of Object.entries(tuning.heartbeat.sounds)) {
      const sound = registry.sounds.get(event);
      if (!sound) {
        report('body', tuning.id, `.heartbeat.sounds.${pace}`, `no sound event "${event}"`);
      } else if (sound.variants.length !== 1) {
        report('body', tuning.id, `.heartbeat.sounds.${pace}`, `heartbeat sound "${event}" needs exactly one variant`);
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
  checkCamoBlocks(registry, report);
  checkBlockFootsteps(registry, report);
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
  checkMilitaryLoot(registry, report);
  checkFurniture(registry, report);
  checkTemplates(registry, report);
  checkSpawnWindows(registry, report);
  checkSiteGeneration(registry, report);
  checkHandlingRanges(registry, report);
  for (const issue of mapKitIssues(registry)) {
    report(issue.section, issue.id, issue.path, issue.message);
  }
  checkKeys(registry, report);
  checkZombies(registry, report);
  checkRecipes(registry, report);
  checkSkillAndUiReferences(registry, report);
  checkHeartbeatSounds(registry, report);
  for (const layout of registry.layouts.values()) {
    checkLayoutReferences(layout, registry, report);
  }
  checkScenarios(registry, report);
  for (const { section, id, path, message } of settlementCollectionIssues(registry)) {
    report(section, id, path, message);
  }
  for (const { section, id, path, message } of vehicleContentIssues(registry)) {
    report(section, id, path, message);
  }
  return issues;
};

// Recipe skill references already make `crafting` missing content invalid; it need not be a pack-level requirement.
export const REQUIRED_CORE_CONTENT = [
  { section: 'body', id: CORE_CONTENT_IDS.player },
  { section: 'compression', id: CORE_CONTENT_IDS.player },
  { section: 'figures', id: CORE_CONTENT_IDS.player },
  { section: 'handlingRange', id: CORE_CONTENT_IDS.testRange },
  { section: 'skillProgression', id: 'core' },
  { section: 'inventory', id: CORE_CONTENT_IDS.player },
  { section: 'meleeClasses', id: CORE_CONTENT_IDS.fistsMeleeClass },
  { section: 'saves', id: CORE_CONTENT_IDS.autosave },
  { section: 'senses', id: CORE_CONTENT_IDS.player },
  { section: 'player', id: CORE_CONTENT_IDS.player },
  { section: 'siteGeneration', id: CORE_CONTENT_IDS.authoredSite },
  { section: 'skills', id: CORE_CONTENT_IDS.firearmsCombat },
  { section: 'skills', id: CORE_CONTENT_IDS.meleeCombat },
  { section: 'skills', id: CORE_CONTENT_IDS.inventoryManagement },
  { section: 'ui', id: CORE_CONTENT_IDS.coreUi },
  { section: 'graphics', id: CORE_CONTENT_IDS.coreGraphics },
  { section: 'look', id: CORE_CONTENT_IDS.coreLook },
  ...SOUND_EVENT_IDS.map((id) => ({ section: 'sounds' as const, id })),
] as const satisfies readonly { section: Exclude<ContentSection, 'blocks'>; id: string }[];

export const requiredContentIssues = (registry: Registry): ContentIssue[] => {
  const issues: ContentIssue[] = REQUIRED_CORE_CONTENT.filter(({ section, id }) => !registry[section].has(id)).map(
    ({ section, id }) => {
      let message = `missing required content "${id}"`;
      if (section === 'sounds') {
        message = `missing required sound event "${id}"`;
      } else if (section === 'ui') {
        message = `missing required UI tuning "${id}"`;
      }
      return { source: 'core content', path: section, message };
    },
  );
  if ([...registry.items.values()].filter((item) => item.workInProgress).length !== 1) {
    issues.push({
      source: 'core content',
      path: 'items',
      message: 'expected exactly one work-in-progress item definition',
    });
  }
  if (registry.dayCycle === undefined) {
    issues.push({ source: 'core content', path: 'dayCycle', message: 'missing required day cycle' });
  }
  return issues;
};

/**
 * Merges content files in order into a registry. A file with a shape issue is
 * skipped. Unless a matching build stamp already proves this unmodified input,
 * references are checked; broken files are dropped and the rest merged again
 * until what's left is consistent.
 */
export const buildRegistry = (
  sources: readonly ContentSource[],
  { bundle, modsSelected = false }: { bundle?: BundleAdmission | undefined; modsSelected?: boolean } = {},
): {
  registry: Registry;
  issues: ContentIssue[];
  /** Winning origins, including ordered overrides and whole-file removal. */
  origins: ReadonlyMap<string, Origin>;
} => {
  const trusted = !modsSelected && bundle?.matches(sources) === true;
  const issues: ContentIssue[] = [];
  let files: { source: string; file: ContentFile }[] = [];
  for (const src of sources) {
    const parsed = parseContent(src);
    issues.push(...parsed.issues);
    if (parsed.issues.length === 0 && parsed.file) {
      files.push({ source: src.source, file: parsed.file });
    }
  }
  for (;;) {
    const { registry, origins } = merge(files);
    const broken = trusted ? [] : referenceIssues(registry, origins);
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
