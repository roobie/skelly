// The asset manifest: where each file under a pack's `assets/` came from (DESIGN.md,
// "Item models"). A source is one download; the credits screen is drawn from it.
// Only licences we accept are allowed, and the ones that need credit need an author
// and a link.

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
import { type ContentIssue, schemaIssues } from './content.ts';

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
