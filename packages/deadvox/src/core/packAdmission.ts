import {
  array,
  boolean,
  type InferOutput,
  minLength,
  picklist,
  pipe,
  regex,
  safeParse,
  strictObject,
  string,
} from 'valibot';
import { isPlainRecord } from './canonicalJson.ts';
import type { ContentIssue, ContentSource } from './content.ts';
import { contentDigest, contentSourceKey } from './contentHash.ts';
import { CONTENT_SECTION_KEYS } from './schema.ts';

const name = pipe(string(), minLength(1));
const filePath = pipe(name, regex(/^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\\?#:]+$/));
export const PackManifestSchema = strictObject({
  id: name,
  version: name,
  tier: picklist(['core', 'theme', 'product', 'scenario']),
  product: boolean(),
  dependencies: array(name),
  overrides: array(strictObject({ pack: name, entry: name })),
  files: array(strictObject({ path: filePath, kind: picklist(['content', 'json', 'asset']) })),
});
export type PackManifest = InferOutput<typeof PackManifestSchema>;
export interface PackInput {
  source: string;
  manifest: PackManifest;
  files: ContentSource[];
}

export const packContentHash = (pack: PackInput): Promise<string> =>
  contentDigest(contentSourceKey([{ source: 'pack', data: pack.manifest }, ...pack.files]));

export const packSources = (pack: PackInput): ContentSource[] =>
  pack.manifest.files
    .filter(({ kind }) => kind === 'content')
    .map(({ path }) => ({
      source: `${pack.source}/${path}`,
      data: pack.files.find(({ source }) => source === path)!.data,
    }));

type Report = (pack: PackInput, path: string, message: string) => void;

const checkFiles = (pack: PackInput, fail: Report): void => {
  const listed = new Set<string>();
  for (const file of pack.manifest.files) {
    if (listed.has(file.path) || pack.files.filter(({ source }) => source === file.path).length !== 1) {
      fail(pack, 'files', `Pack ${pack.manifest.id}: missing or repeated file ${file.path}`);
    }
    listed.add(file.path);
  }
  for (const file of pack.files) {
    if (!listed.has(file.source)) {
      fail(pack, 'files', `Pack ${pack.manifest.id}: unlisted file ${file.source}`);
    }
  }
};

const indexPacks = (inputs: readonly PackInput[], fail: Report): Map<string, PackInput> => {
  const byId = new Map<string, PackInput>();
  for (const pack of inputs) {
    const parsed = safeParse(PackManifestSchema, pack.manifest);
    if (!parsed.success) {
      fail(pack, 'manifest', `Invalid pack manifest: ${parsed.issues.map(({ message }) => message).join('; ')}`);
      continue;
    }
    const { id } = pack.manifest;
    if (byId.has(id)) {
      fail(pack, 'id', `Duplicate pack ${id}`);
    }
    byId.set(id, pack);
    checkFiles(pack, fail);
  }
  return byId;
};

const dependencyOrder = (byId: ReadonlyMap<string, PackInput>, fail: Report) => {
  const packs: PackInput[] = [];
  const visiting = new Set<string>();
  const dependencies = new Map<string, Set<string>>();
  const visit = (pack: PackInput): Set<string> => {
    const { id } = pack.manifest;
    const found = dependencies.get(id);
    if (found) {
      return found;
    }
    if (visiting.has(id)) {
      fail(pack, 'dependencies', `Pack ${id}: dependency cycle ${[...visiting, id].join(' -> ')}`);
      return new Set();
    }
    visiting.add(id);
    const reachable = new Set<string>();
    for (const dependency of pack.manifest.dependencies) {
      const owner = byId.get(dependency);
      if (!owner) {
        fail(pack, 'dependencies', `Pack ${id}: missing dependency ${dependency}; enable that pack`);
        continue;
      }
      reachable.add(dependency);
      for (const transitive of visit(owner)) {
        reachable.add(transitive);
      }
    }
    visiting.delete(id);
    dependencies.set(id, reachable);
    packs.push(pack);
    return reachable;
  };
  byId.forEach(visit);
  return { packs, dependencies };
};

const contentEntries = (data: unknown): string[] => {
  if (!isPlainRecord(data)) {
    return [];
  }
  const entries = CONTENT_SECTION_KEYS.flatMap((section) => {
    const rows = data[section];
    return Array.isArray(rows)
      ? rows.filter((row) => isPlainRecord(row) && typeof row.id === 'string').map((row) => `${section}:${row.id}`)
      : [];
  });
  if (data.dayCycle !== undefined) {
    entries.push('dayCycle:dayCycle');
  }
  return entries;
};

const entrySetters = (packs: readonly PackInput[]): Map<string, PackInput[]> => {
  const setters = new Map<string, PackInput[]>();
  for (const pack of packs) {
    for (const { data } of packSources(pack)) {
      for (const entry of contentEntries(data)) {
        const history = setters.get(entry) ?? [];
        if (!history.includes(pack)) {
          history.push(pack);
        }
        setters.set(entry, history);
      }
    }
  }
  return setters;
};

const checkOverrides = (
  packs: readonly PackInput[],
  dependencies: ReadonlyMap<string, ReadonlySet<string>>,
  fail: Report,
): void => {
  for (const [entry, history] of entrySetters(packs)) {
    const winner = history.at(-1)!;
    for (const owner of history.slice(0, -1)) {
      const declared = winner.manifest.overrides.some(
        (override) => override.pack === owner.manifest.id && override.entry === entry,
      );
      if (!(dependencies.get(winner.manifest.id)!.has(owner.manifest.id) && declared)) {
        fail(
          winner,
          'overrides',
          `Pack ${winner.manifest.id}: entry ${entry} overrides pack ${owner.manifest.id}; declare the dependency and override`,
        );
      }
    }
  }
};

export const admitPacks = (
  inputs: readonly PackInput[],
): { packs: PackInput[]; sources: ContentSource[]; issues: ContentIssue[] } => {
  const issues: ContentIssue[] = [];
  const fail: Report = (pack, path, message) => issues.push({ source: pack.source, path, message });
  const byId = indexPacks(inputs, fail);
  if (issues.length > 0) {
    return { packs: [], sources: [], issues };
  }
  const { packs, dependencies } = dependencyOrder(byId, fail);
  if (issues.length === 0) {
    checkOverrides(packs, dependencies, fail);
  }
  return issues.length > 0
    ? { packs: [], sources: [], issues }
    : { packs, sources: packs.flatMap(packSources), issues };
};
