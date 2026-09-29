import type { DesignLoadResult } from '../core/design.ts';
import { loadDesign } from '../core/designLoader.ts';
import { gunDomain } from './domain.ts';
import type { PrefabCatalogue } from './prefabs.ts';
import { TEMPLATES } from './templates.ts';

const GUN_PREFABS: PrefabCatalogue = [];

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
  return loadDesign(text, { domain: gunDomain, template, prefabs: GUN_PREFABS });
};
