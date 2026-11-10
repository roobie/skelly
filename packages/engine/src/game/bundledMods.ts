import { bundledModCatalogue } from '../core/bundledModCatalogue.ts';
import type { ContentIssue } from '../core/content.ts';
import { selectFolderClosure } from '../core/packAdmission.ts';
import type { SaveVersionComponents } from '../core/saveFormat.ts';
import { type BrowserMod, evaluateMods, type ModIntake } from './browserMods.ts';
import { optInPackIdentity, type StartupContent } from './bundledContent.ts';

export interface BundledMod {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Pairs each mod the product's catalogue lists with its compiled content, keyed by any name. The list is content so
 * the site launcher reads the same file; every listed mod needs compiled content.
 */
export const bundledModsFrom = (
  catalogue: unknown,
  compiled: Readonly<Record<string, Record<string, unknown>>>,
): readonly BundledMod[] => {
  const data = new Map(
    Object.values(compiled).map((mod) => {
      if (typeof mod.id !== 'string' || !mod.id.trim()) {
        throw new Error('Compiled bundled mod has no id');
      }
      return [mod.id, mod];
    }),
  );
  return bundledModCatalogue(catalogue).map(({ id }) => {
    const found = data.get(id);
    if (!found) {
      throw new Error(`Bundled mod "${id}" has no compiled content`);
    }
    return { id, data: found };
  });
};

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

/**
 * Admits the named bundled mods: an opt-in folder pack with its closure through pack admission, a single-file mod
 * through the same intake as player mods. Unknown ids are issues.
 */
export const selectBundledMods = (
  intake: ModIntake,
  ids: readonly string[],
  additional: readonly BundledMod[] = [],
): BundledSelection => {
  const { availablePackInputs, bundledPackInputs } = intake.content;
  const optInIds = availablePackInputs.filter(({ manifest }) => manifest.optIn).map(({ manifest }) => manifest.id);
  const issues: ContentIssue[] = [];
  const mods: BrowserMod[] = [];
  const roots: string[] = [];
  for (const id of ids) {
    const found = intake.bundledMods.find((mod) => mod.id === id);
    const source = `mods=${id}`;
    if (optInIds.includes(id)) {
      roots.push(id);
      continue;
    }
    if (!found) {
      issues.push({
        source,
        path: 'id',
        message: `Unknown bundled mod "${id}"; available: ${[...optInIds, ...intake.bundledMods.map((mod) => mod.id)].join(', ')}`,
      });
      continue;
    }
    const { data } = found;
    mods.push({ source, text: JSON.stringify(data), enabled: true });
  }
  for (const { id, data } of additional) {
    mods.push({ source: id, text: JSON.stringify(data), enabled: true });
  }
  const result = evaluateMods(intake, mods, selectFolderClosure(roots, availablePackInputs, bundledPackInputs));
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
