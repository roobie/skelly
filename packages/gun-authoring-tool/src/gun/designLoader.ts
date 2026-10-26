import type { Design, DesignIssue, DesignLoadResult } from '@skelly/engine/assembly/design.ts';
import type { DesignLoadInputs } from '@skelly/engine/assembly/designLoader.ts';
import { loadDesignValue, readDeclaredStatus } from '@skelly/engine/assembly/designLoader.ts';
import { describeValue, parseAssemblyJson } from '@skelly/engine/assembly/parseAssembly.ts';
import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import type { Template } from '@skelly/engine/assembly/template.ts';
import { ATTACHMENT_IDS } from './attachments.ts';
import { boltCalibreIssue, isBoltAssembly, withBoltCalibre } from './boltCartridge.ts';
import { PART_CATALOGUE, type PartCatalogue } from './catalogue.ts';
import { gunDomain } from './domain.ts';
import { GUN_FINISH_SLOTS, GUN_PALETTE } from './palette.ts';
import type { PartItems } from './physical.ts';
import { GUN_PREFABS } from './prefabs.ts';
import { TEMPLATES } from './templates.ts';

interface GunDesignMetadata {
  readonly calibre?: string;
  readonly excludedAttachments?: readonly string[];
  /** The catalogue item each instance names; the loaded assembly holds the instance each item fixes. */
  readonly items?: PartItems;
}
export type GunDesign = Design & GunDesignMetadata;
type WithGunMetadata<T> = T extends { readonly ok: true; readonly design: infer D }
  ? Omit<T, 'design'> & { readonly design: D & GunDesignMetadata }
  : T;
export type GunDesignLoadResult = WithGunMetadata<DesignLoadResult>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const calibreShapeError = (raw: unknown): string | undefined => {
  if (!isRecord(raw) || raw.calibre === undefined) {
    return undefined;
  }
  if (typeof raw.calibre !== 'string') {
    return `expected a string, got ${describeValue(raw.calibre)}`;
  }
  return raw.calibre.trim() === '' ? 'expected a non-empty cartridge id' : undefined;
};

const calibreIssues = (
  calibre: string | undefined,
  design: Design,
  template: Template,
  resolved: Resolved,
): readonly DesignIssue[] => {
  if (calibre === undefined) {
    return [];
  }
  if (isBoltAssembly(design.assembly)) {
    const message = boltCalibreIssue(calibre);
    return message ? [{ code: 'template-choice', path: 'calibre', message }] : [];
  }
  const mappings = template.variantParams ?? [];
  if (mappings.length === 0) {
    return template.variant !== undefined && calibre !== template.variant
      ? [
          {
            code: 'template-choice',
            message: `the design calibre is "${calibre}", but template "${template.name}" specifies "${template.variant}"`,
            path: 'calibre',
          },
        ]
      : [];
  }
  return mappings.flatMap(({ slot, param, byVariant }) => {
    const expected = byVariant[calibre];
    if (expected === undefined) {
      return [
        {
          code: 'template-choice',
          message: `template "${template.name}" has no ${slot}.${param} choice for calibre "${calibre}"`,
          path: 'calibre',
        },
      ];
    }
    if (!design.assembly.parts[slot]) {
      return [];
    }
    const actual = resolved.params.get(slot)?.[param]?.value;
    return actual === undefined || actual === expected
      ? []
      : [
          {
            code: 'template-choice',
            message: `${slot}.${param} is "${actual}", but calibre "${calibre}" requires "${expected}"`,
            path: `assembly.parts.${slot}.params.${param}`,
            parts: [slot],
          },
        ];
  });
};

const finishError = (loaded: Extract<DesignLoadResult, { readonly ok: true }>): DesignLoadResult | undefined => {
  if (!loaded.design.finish) {
    return undefined;
  }
  const validSlots = new Set<string>(GUN_FINISH_SLOTS);
  const invalid = Object.entries(loaded.design.finish).find(
    ([slot, material]) => !(validSlots.has(slot) && Object.hasOwn(GUN_PALETTE.materials ?? {}, material)),
  );
  if (!invalid) {
    return undefined;
  }
  return {
    ok: false,
    declaredStatus: loaded.declaredStatus,
    error: {
      code: 'invalid-shape',
      path: `finish.${invalid[0]}`,
      message: validSlots.has(invalid[0])
        ? `unknown gun material ${JSON.stringify(invalid[1])}`
        : `unknown gun finish slot ${JSON.stringify(invalid[0])}`,
    },
  };
};

type ItemExpansion =
  | { readonly ok: true; readonly raw: unknown; readonly items?: PartItems }
  | { readonly ok: false; readonly path: string; readonly message: string };

const ITEM_PART_FIELDS = new Set(['item', 'params']);

type ItemPartExpansion =
  | { readonly ok: true; readonly item: string; readonly instance: unknown }
  | { readonly ok: false; readonly path: string; readonly message: string };

const expandItemPart = (
  path: string,
  part: Readonly<Record<string, unknown>>,
  catalogue: PartCatalogue,
): ItemPartExpansion => {
  const item = typeof part.item === 'string' ? catalogue.items.get(part.item) : undefined;
  if (item === undefined) {
    return { ok: false, path: `${path}.item`, message: `unknown part item ${describeValue(part.item)}` };
  }
  const fixed = Object.keys(part).find((key) => !ITEM_PART_FIELDS.has(key));
  if (fixed !== undefined) {
    return { ok: false, path: `${path}.${fixed}`, message: `part item ${item.id} fixes everything but placement` };
  }
  const placement = part.params ?? {};
  if (!(isRecord(placement) && Object.values(placement).every((value) => typeof value === 'string'))) {
    return { ok: false, path: `${path}.params`, message: 'expected a map of placement values' };
  }
  const construction = Object.keys(placement).find((name) => !catalogue.placementParams.has(name));
  if (construction !== undefined) {
    return {
      ok: false,
      path: `${path}.params.${construction}`,
      message: `part item ${item.id} fixes ${construction}; an instance sets only pose and placement`,
    };
  }
  return {
    ok: true,
    item: item.id,
    instance: { family: item.family, params: { ...item.params, ...placement }, appearance: { finish: item.finish } },
  };
};

/**
 * Replaces each part that names a catalogue item with the engine instance the item fixes, so fit validation sees the
 * part as built. The item owns family, construction and finish; the instance keeps only pose and placement.
 */
const withCatalogueItems = (raw: unknown, catalogue: PartCatalogue): ItemExpansion => {
  if (!(isRecord(raw) && isRecord(raw.assembly) && isRecord(raw.assembly.parts))) {
    return { ok: true, raw };
  }
  const items: Record<string, string> = {};
  const parts: Record<string, unknown> = {};
  for (const [id, part] of Object.entries(raw.assembly.parts)) {
    if (!(isRecord(part) && Object.hasOwn(part, 'item'))) {
      parts[id] = part;
      continue;
    }
    const expanded = expandItemPart(`assembly.parts.${id}`, part, catalogue);
    if (!expanded.ok) {
      return expanded;
    }
    items[id] = expanded.item;
    parts[id] = expanded.instance;
  }
  return Object.keys(items).length === 0
    ? { ok: true, raw }
    : { ok: true, raw: { ...raw, assembly: { ...raw.assembly, parts } }, items };
};

const knownAttachmentIds = (value: unknown): value is readonly string[] | undefined =>
  value === undefined ||
  (Array.isArray(value) && value.every((id) => typeof id === 'string' && ATTACHMENT_IDS.some((known) => known === id)));

/** Loads a persisted firearm design through the generic engine contracts and firearm-specific checks. */
export const loadGunDesignValue = (
  authored: unknown,
  inputs: DesignLoadInputs = {
    domain: gunDomain,
    template: TEMPLATES[0]!,
    prefabs: GUN_PREFABS,
  },
  catalogue: PartCatalogue = PART_CATALOGUE,
): GunDesignLoadResult => {
  const expanded = withCatalogueItems(authored, catalogue);
  if (!expanded.ok) {
    return {
      ok: false,
      declaredStatus: readDeclaredStatus(authored),
      error: { code: 'invalid-shape', path: expanded.path, message: expanded.message },
    };
  }
  const { raw, items } = expanded;
  const calibre = isRecord(raw) && typeof raw.calibre === 'string' ? raw.calibre : undefined;
  const parsed = isRecord(raw) && isRecord(raw.assembly) ? parseAssemblyJson(JSON.stringify(raw.assembly)) : undefined;
  const calibrated =
    parsed?.ok && isRecord(raw) ? { ...raw, assembly: withBoltCalibre(parsed.assembly, calibre) } : raw;
  const loaded = loadDesignValue(calibrated, {
    ...inputs,
    validateDesign: (candidate, resolved) => calibreIssues(calibre, candidate, inputs.template, resolved),
  });
  if (!loaded.ok) {
    return loaded;
  }
  const shapeError = calibreShapeError(raw);
  if (shapeError) {
    return {
      ok: false,
      declaredStatus: loaded.declaredStatus,
      error: { code: 'invalid-shape', path: 'calibre', message: shapeError },
    };
  }
  const excludedAttachments = isRecord(raw) ? raw.excludedAttachments : undefined;
  if (!knownAttachmentIds(excludedAttachments)) {
    return {
      ok: false,
      declaredStatus: loaded.declaredStatus,
      error: {
        code: 'invalid-shape',
        path: 'excludedAttachments',
        message: 'expected an array of known attachment ids',
      },
    };
  }
  const design: GunDesign = {
    ...loaded.design,
    ...(calibre === undefined ? {} : { calibre }),
    ...(excludedAttachments === undefined ? {} : { excludedAttachments: [...excludedAttachments] }),
    ...(items === undefined ? {} : { items }),
  };
  const adapted = { ...loaded, design } as GunDesignLoadResult;
  const invalidFinish = finishError(loaded);
  return invalidFinish ?? adapted;
};

/** Loads a firearm design with its template and current prefab catalogue. */
export const loadGunDesign = (text: string): GunDesignLoadResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      declaredStatus: undefined,
      error: { code: 'invalid-json', message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` },
    };
  }
  // A non-string template reaches the engine loader, which refuses it as an invalid shape.
  let template = TEMPLATES[0]!;
  if (isRecord(raw) && typeof raw.template === 'string') {
    const found = TEMPLATES.find((candidate) => candidate.name === raw.template);
    if (!found) {
      return {
        ok: false,
        declaredStatus: readDeclaredStatus(raw),
        error: { code: 'invalid-shape', path: 'template', message: `unknown template ${JSON.stringify(raw.template)}` },
      };
    }
    template = found;
  }
  return loadGunDesignValue(raw, { domain: gunDomain, template, prefabs: GUN_PREFABS });
};
