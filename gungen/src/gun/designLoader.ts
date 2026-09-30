import type { DesignLoadResult } from '../core/design.ts';
import { loadDesign } from '../core/designLoader.ts';
import { gunDomain } from './domain.ts';
import { GUN_PALETTE } from './palette.ts';
import { GUN_PREFABS } from './prefabs.ts';
import { TEMPLATES } from './templates.ts';

/** Loads a curated gun design with its template and current prefab catalogue. */
export const loadGunDesign = (text: string): DesignLoadResult => {
  let template = TEMPLATES[0]!;
  try {
    const raw: unknown = JSON.parse(text);
    if (raw && typeof raw === 'object' && 'template' in raw && typeof raw.template === 'string') {
      template = TEMPLATES.find((candidate) => candidate.name === raw.template) ?? template;
    }
  } catch {
    // Let the core loader return its structured invalid-json result.
  }
  const loaded = loadDesign(text, { domain: gunDomain, template, prefabs: GUN_PREFABS });
  if (!(loaded.ok && loaded.design.finish)) {
    return loaded;
  }
  const validSlots = new Set(Object.values(GUN_PALETTE.roleSlots ?? {}));
  const invalid = Object.entries(loaded.design.finish).find(
    ([slot, material]) => !(validSlots.has(slot) && Object.hasOwn(GUN_PALETTE.materials ?? {}, material)),
  );
  if (!invalid) {
    return loaded;
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
