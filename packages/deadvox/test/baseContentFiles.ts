import process from 'node:process';
import { readBundledPacks } from '../tools/readBundledPacks.ts';

/** The default stack's content files, following its packs so a test keeps seeing a row when its mod moves. */
export const baseContentFiles = () =>
  readBundledPacks(process.cwd(), 'skelly.deadvox').flatMap(({ source: pack, manifest, files }) =>
    manifest.files
      .filter(({ kind }) => kind === 'content')
      .map(({ path: file }) => ({ pack, file, data: files.find(({ source }) => source === file)!.data })),
  );

/** The default stack's content as sources labelled by file name, in a stable order. */
export const baseContentSources = () =>
  baseContentFiles()
    .map(({ file, data }) => ({ source: file, data }))
    .sort((left, right) => left.source.localeCompare(right.source));
