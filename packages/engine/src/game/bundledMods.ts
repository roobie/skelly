import { bundledModCatalogue } from '../core/bundledModCatalogue.ts';
import { isPlainRecord } from '../core/canonicalJson.ts';
import type { ContentIssue } from '../core/content.ts';
import { type PackInput, selectFolderClosure } from '../core/packAdmission.ts';
import type { AdmittedBundledMod } from '../core/saveFormat.ts';
import { type BrowserMod, evaluateMods, isFolderPack, type ModEvaluation, type ModIntake } from './browserMods.ts';
import { optInPackIdentity, type StartupContent } from './bundledContent.ts';
import { isPracticeStart } from './startSelection.ts';

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

/**
 * The opt-in pack whose default start is a practice start, found from content so no code names the tutorial; when
 * none or several qualify there is no practice link.
 */
export const practiceModId = (intake: ModIntake, registry: StartupContent['registry']): string | undefined => {
  const ids = intake.content.availablePackInputs
    .filter(({ manifest: { optIn, defaultStart } }) => optIn && defaultStart && isPracticeStart(registry, defaultStart))
    .map(({ manifest }) => manifest.id);
  return ids.length === 1 ? ids[0] : undefined;
};

/**
 * The page's `start-mod`, told apart by its first character: `{` starts inline mod JSON, anything else is a bundled
 * mod id. Why one parameter takes both: `packages/deadvox/docs/url-mods.md`, "Start mod".
 */
type StartModRequest =
  | { readonly form: 'id'; readonly id: string }
  | { readonly form: 'inline'; readonly text: string };

export const startModFromUrl = (params: URLSearchParams): StartModRequest | undefined => {
  const value = params.get('start-mod');
  if (value === null) {
    return undefined;
  }
  return value.trimStart().startsWith('{') ? { form: 'inline', text: value } : { form: 'id', id: value.trim() };
};

/** The source an issue names, so a refusal says which form of `start-mod` it read. */
const startModSource = (request: StartModRequest): string =>
  request.form === 'inline' ? 'start-mod (inline mod)' : `start-mod (mod id "${request.id}")`;

type AdmittedMod = ModEvaluation['admitted'][number];

export interface BundledSelection {
  content: StartupContent;
  /** Each admitted bundled mod in admission order, for the save identity, which records that order. */
  admitted: AdmittedBundledMod[];
  /** Data of an admitted inline start mod, which the save identity records as an intake-admitted mod. */
  inlineAdmitted: { id: string; version: string; data: unknown }[];
  issues: ContentIssue[];
  /** The number of start rows an admitted start mod supplies when it is not exactly one, which refuses the run. */
  startModRows?: number;
}

const startRowIds = (content: unknown): string[] => {
  const starts = isPlainRecord(content) ? content.starts : undefined;
  return Array.isArray(starts) ? starts.map((row: { id: string }) => row.id) : [];
};

const identity = ({ id, version, data }: AdmittedMod) => ({ id, version, data });

/** The start rows the admitted start mod's own files supply, not those of its dependencies. */
const ownStartRows = (
  result: ModEvaluation,
  startMod: StartModRequest | undefined,
  startFile: AdmittedMod | undefined,
): string[] | undefined => {
  const startFolder =
    startMod?.form === 'id'
      ? result.admittedInOrder.filter(isFolderPack).find(({ manifest }) => manifest.id === startMod.id)
      : undefined;
  return startFolder
    ? startFolder.files.flatMap(({ data }) => startRowIds(data))
    : startFile && startRowIds((startFile.data as { content: unknown }).content);
};

/**
 * The start rows a start mod whose files set none inherits from its dependencies: each pack its dependency closure
 * reaches supplies the rows its own files set. The walk stops at the entry pack, whose closure is the base stack
 * every page loads, so it supplies the default start rather than the start mod's row. Why a start mod may supply
 * its row through a dependency: `packages/deadvox/docs/url-mods.md`, "Start mod".
 */
const inheritedStartRows = (
  result: ModEvaluation,
  startMod: StartModRequest | undefined,
  startFile: AdmittedMod | undefined,
  entryPack: string,
): string[] => {
  const startId = startMod?.form === 'id' ? startMod.id : startFile?.id;
  const root = startId === undefined ? undefined : result.admittedPacks.find(({ manifest }) => manifest.id === startId);
  const rows: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    const pack =
      id === entryPack || visited.has(id) ? undefined : result.admittedPacks.find(({ manifest }) => manifest.id === id);
    if (!pack) {
      return;
    }
    visited.add(id);
    rows.push(...pack.files.flatMap(({ data }) => startRowIds(data)));
    pack.manifest.dependencies.forEach(visit);
  };
  root?.manifest.dependencies.forEach(visit);
  return rows;
};

/**
 * Admits the named bundled mods in the order given: an opt-in folder pack with its closure through pack admission, a
 * single-file mod through the same intake as player mods. Unknown ids are issues. The start mod is admitted last,
 * inline data through the same intake and byte limit, and must supply exactly one start row, its own or one
 * reached through its dependencies, which begins the run.
 */
export const selectBundledMods = (
  intake: ModIntake,
  ids: readonly string[],
  additional: readonly BundledMod[] = [],
  startMod?: StartModRequest,
): BundledSelection => {
  const { availablePackInputs, bundledPackInputs } = intake.content;
  const optInIds = availablePackInputs.filter(({ manifest }) => manifest.optIn).map(({ manifest }) => manifest.id);
  const issues: ContentIssue[] = [];
  const mods: (BrowserMod | PackInput)[] = [];
  const folderPacks: PackInput[] = [];
  const select = (id: string, source: string) => {
    const found = intake.bundledMods.find((mod) => mod.id === id);
    if (optInIds.includes(id)) {
      const closure = selectFolderClosure([id], availablePackInputs, [...bundledPackInputs, ...folderPacks]);
      folderPacks.push(...closure);
      mods.push(...closure);
      return;
    }
    if (!found) {
      issues.push({
        source,
        path: 'id',
        message: `Unknown bundled mod "${id}"; available: ${[...optInIds, ...intake.bundledMods.map((mod) => mod.id)].join(', ')}`,
      });
      return;
    }
    mods.push({ source, text: JSON.stringify(found.data), enabled: true });
  };
  for (const id of ids) {
    select(id, `mods=${id}`);
  }
  for (const { id, data } of additional) {
    mods.push({ source: id, text: JSON.stringify(data), enabled: true });
  }
  const startSource = startMod && startModSource(startMod);
  if (startMod?.form === 'id') {
    select(startMod.id, startSource!);
  } else if (startMod?.form === 'inline') {
    mods.push({ source: startSource!, text: startMod.text, enabled: true });
  }
  const result = evaluateMods(intake, mods);
  for (const list of result.issues.values()) {
    issues.push(...list);
  }
  const startFile = result.admitted.find(({ source }) => source === startSource);
  const ownRows = ownStartRows(result, startMod, startFile);
  const startRows =
    ownRows?.length === 0 ? inheritedStartRows(result, startMod, startFile, intake.content.entryPack) : ownRows;
  const inline = startMod?.form === 'inline' ? startFile : undefined;
  return {
    content: startRows?.length === 1 ? { ...result.content, startModStart: startRows[0] } : result.content,
    admitted: result.admittedInOrder
      .filter((mod) => mod !== inline)
      .map((mod) => (isFolderPack(mod) ? optInPackIdentity(mod) : identity(mod))),
    inlineAdmitted: inline ? [identity(inline)] : [],
    issues,
    ...(startRows && startRows.length !== 1 ? { startModRows: startRows.length } : {}),
  };
};
