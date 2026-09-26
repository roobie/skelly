// The asset manifest: where each file under a pack's `assets/` came from (DESIGN.md,
// "Assets and credits"). A source is one download; the credits screen is drawn from
// it. Only licences we accept are allowed, and the ones that need credit need an
// author and a link. The checks against the files themselves take a list of them, so
// they stay pure; the validator reads the disk.

import {
  array,
  type InferOutput,
  nonEmpty,
  nullable,
  picklist,
  pipe,
  regex,
  safeParse,
  strictObject,
  string,
} from 'valibot';
import { type ContentIssue, type Registry, schemaIssues } from './content.ts';

export const LICENCES = {
  'CC0-1.0': { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', credit: false },
  'CC-BY-3.0': { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/', credit: true },
  'CC-BY-4.0': { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', credit: true },
} as const;

export type LicenceId = keyof typeof LICENCES;

const LICENCE_IDS = Object.keys(LICENCES) as LicenceId[];
const Text = pipe(string(), nonEmpty('must not be empty'));

const SourceSchema = strictObject({
  title: Text,
  /** The page it came from. */
  url: nullable(pipe(string(), regex(/^https:\/\/\S+$/, 'expected an https URL'))),
  author: nullable(Text),
  licence: picklist(LICENCE_IDS, `must be one of: ${LICENCE_IDS.join(', ')}`),
  /** The file downloaded from the page. */
  download: nullable(Text),
  /** The pack's files made from it, as paths within the pack. */
  files: pipe(
    array(pipe(string(), regex(/^assets\/[a-z0-9_./-]+$/, 'expected a path under assets/, in lowercase'))),
    nonEmpty('needs at least one file'),
  ),
  /** What we changed, which CC BY asks us to say. */
  changes: nullable(Text),
});

export const ManifestSchema = strictObject({ sources: array(SourceSchema) });

export type AssetSource = InferOutput<typeof SourceSchema>;
export type Manifest = InferOutput<typeof ManifestSchema>;

/** Checks a pack's manifest. An unusable manifest comes back empty, with its issues. */
export const validateManifest = (source: string, data: unknown): { manifest: Manifest; issues: ContentIssue[] } => {
  const result = safeParse(ManifestSchema, data);
  if (!result.success) {
    return { manifest: { sources: [] }, issues: schemaIssues(source, result.issues) };
  }
  const issues: ContentIssue[] = [];
  const claimed = new Map<string, number>();
  result.output.sources.forEach((asset, i) => {
    const path = `sources[${i}]`;
    if (LICENCES[asset.licence].credit) {
      if (asset.author === null) {
        issues.push({ source, path: `${path}.author`, message: `${asset.licence} needs an author` });
      }
      if (asset.url === null) {
        issues.push({ source, path: `${path}.url`, message: `${asset.licence} needs a link to the source` });
      }
    }
    asset.files.forEach((file, j) => {
      const first = claimed.get(file);
      if (first === undefined) {
        claimed.set(file, i);
      } else {
        issues.push({
          source,
          path: `${path}.files[${j}]`,
          message: `"${file}" is already listed by sources[${first}]`,
        });
      }
    });
  });
  return { manifest: result.output, issues };
};

/** The manifest's own path within its pack; it's the one file under `assets/` it doesn't list. */
export const MANIFEST_PATH = 'assets/manifest.json';

/**
 * Checks a pack's files against its manifest: every file under `assets/` comes from a
 * listed source, and every file a source lists exists. `files` are the pack's files
 * under `assets/`, as paths within the pack.
 */
export const assetFileIssues = (source: string, manifest: Manifest, files: readonly string[]): ContentIssue[] => {
  const present = new Set(files);
  const listed = new Set(manifest.sources.flatMap((s) => s.files));
  const issues: ContentIssue[] = [];
  manifest.sources.forEach((asset, i) => {
    asset.files.forEach((file, j) => {
      if (!present.has(file)) {
        issues.push({ source, path: `sources[${i}].files[${j}]`, message: `"${file}" is not in the pack` });
      }
    });
  });
  for (const file of [...present].sort()) {
    if (file !== MANIFEST_PATH && !listed.has(file)) {
      issues.push({ source, path: 'sources', message: `"${file}" is in the pack but no source lists it` });
    }
  }
  return issues;
};

/** Checks that every model's file exists; `exists` answers for a path within the pack of the content file. */
export const modelFileIssues = (
  registry: Registry,
  exists: (contentFile: string, file: string) => boolean,
): ContentIssue[] =>
  [...registry.models.values()].flatMap((model) => {
    const origin = registry.modelOrigins.get(model.id)!;
    return exists(origin.source, model.file)
      ? []
      : [{ source: origin.source, path: `${origin.path}.file`, message: `"${model.file}" is not in the pack` }];
  });
