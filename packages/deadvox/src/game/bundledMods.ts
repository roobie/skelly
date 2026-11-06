import bundledModList from '../config/bundled-mods.json' with { type: 'json' };
import { bundledModCatalogue } from '../core/bundledModCatalogue.ts';
import type { ContentIssue } from '../core/content.ts';
import { selectFolderClosure } from '../core/packAdmission.ts';
import type { SaveVersionComponents } from '../core/saveFormat.ts';
import { type BrowserMod, evaluateMods } from './browserMods.ts';
import { availablePackInputs, bundledPackInputs, optInPackIdentity, type StartupContent } from './bundledContent.ts';

interface BundledMod {
  id: string;
  data: Record<string, unknown>;
}

const bundledModFiles = import.meta.glob('../config/bundled/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Record<string, unknown>>;

const bundledModData = new Map(
  Object.values(bundledModFiles).map((data) => {
    if (typeof data.id !== 'string' || !data.id.trim()) {
      throw new Error('Compiled bundled mod has no id');
    }
    return [data.id, data];
  }),
);

// The list is content so the site launcher reads the same file; every listed mod needs compiled content.
const BUNDLED_MODS: readonly BundledMod[] = bundledModCatalogue(bundledModList).map(({ id }) => {
  const data = bundledModData.get(id);
  if (!data) {
    throw new Error(`Bundled mod "${id}" has no compiled content`);
  }
  return { id, data };
});

export const bundledModIdsFromUrl = (params: URLSearchParams): string[] => {
  const value = params.get('mods');
  if (value === null || value === '1') {
    return [];
  }
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
};

export interface BundledSelection {
  content: StartupContent;
  /** Data of each admitted bundled mod, for the save identity. */
  admitted: { id: string; version: string; data: unknown }[];
  /** Identity entries of the admitted opt-in folder packs, in admission order. */
  admittedFolderPacks: SaveVersionComponents['contentPacks'];
  issues: ContentIssue[];
}

const OPT_IN_IDS = availablePackInputs.filter(({ manifest }) => manifest.optIn).map(({ manifest }) => manifest.id);

/**
 * Admits the named bundled mods: an opt-in folder pack with its closure through pack admission, a single-file mod
 * through the same intake as player mods. Unknown ids are issues.
 */
export const selectBundledMods = (ids: readonly string[], additional: readonly BundledMod[] = []): BundledSelection => {
  const issues: ContentIssue[] = [];
  const mods: BrowserMod[] = [];
  const roots: string[] = [];
  for (const id of ids) {
    const found = BUNDLED_MODS.find((mod) => mod.id === id);
    const source = `mods=${id}`;
    if (OPT_IN_IDS.includes(id)) {
      roots.push(id);
      continue;
    }
    if (!found) {
      issues.push({
        source,
        path: 'id',
        message: `Unknown bundled mod "${id}"; available: ${[...OPT_IN_IDS, ...BUNDLED_MODS.map((mod) => mod.id)].join(', ')}`,
      });
      continue;
    }
    const { data } = found;
    mods.push({ source, text: JSON.stringify(data), enabled: true });
  }
  for (const { id, data } of additional) {
    mods.push({ source: id, text: JSON.stringify(data), enabled: true });
  }
  const result = evaluateMods(mods, selectFolderClosure(roots, availablePackInputs, bundledPackInputs));
  for (const list of result.issues.values()) {
    issues.push(...list);
  }
  return {
    content: result.content,
    admitted: result.admitted,
    admittedFolderPacks: result.admittedFolderPacks.map(optInPackIdentity),
    issues,
  };
};
