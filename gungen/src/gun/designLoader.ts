import type { Design, DesignIssue, DesignLoadResult } from '@skelly/engine/core/design.ts';
import type { DesignLoadInputs } from '@skelly/engine/core/designLoader.ts';
import { loadDesign, loadDesignValue } from '@skelly/engine/core/designLoader.ts';
import { describeValue } from '@skelly/engine/core/parseAssembly.ts';
import type { Resolved } from '@skelly/engine/core/resolve.ts';
import type { Template } from '@skelly/engine/core/template.ts';
import { gunDomain } from './domain.ts';
import { GUN_FINISH_SLOTS, GUN_PALETTE } from './palette.ts';
import { GUN_PREFABS } from './prefabs.ts';
import { TEMPLATES } from './templates.ts';

export type GunDesign = Design & { readonly calibre?: string };
type WithGunCalibre<T> = T extends { readonly ok: true; readonly design: infer D }
  ? Omit<T, 'design'> & { readonly design: D & { readonly calibre?: string } }
  : T;
export type GunDesignLoadResult = WithGunCalibre<DesignLoadResult>;

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

/** Loads a persisted firearm design through the generic engine contracts and firearm-specific checks. */
export const loadGunDesignValue = (
  raw: unknown,
  inputs: DesignLoadInputs = {
    domain: gunDomain,
    template: TEMPLATES[0]!,
    prefabs: GUN_PREFABS,
  },
): GunDesignLoadResult => {
  const calibre = isRecord(raw) && typeof raw.calibre === 'string' ? raw.calibre : undefined;
  const loaded = loadDesignValue(raw, {
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
  const design: GunDesign = {
    ...loaded.design,
    ...(calibre === undefined ? {} : { calibre }),
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
  } catch {
    return loadDesign(text, {
      domain: gunDomain,
      template: TEMPLATES[0]!,
      prefabs: GUN_PREFABS,
    }) as GunDesignLoadResult;
  }
  const template =
    isRecord(raw) && typeof raw.template === 'string'
      ? (TEMPLATES.find((candidate) => candidate.name === raw.template) ?? TEMPLATES[0]!)
      : TEMPLATES[0]!;
  return loadGunDesignValue(raw, { domain: gunDomain, template, prefabs: GUN_PREFABS });
};
