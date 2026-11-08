import process from 'node:process';
import { type ActorFigureFiles, readActorFigureFiles } from '../src/core/actorFigureFiles.ts';
import type { Registry } from '../src/core/content.ts';
import { admitPacks } from '../src/core/packAdmission.ts';
import { actorFigureKey, actorFigureKeyParts } from '../src/core/schema/actors.ts';
import {
  declaredFileReader,
  packFileBytes,
  readBundledPacks,
  readStackContentFiles,
  readStackContentSources,
} from '../tools/readBundledPacks.ts';

const DEFAULT_STACK = 'skelly.deadvox';

export const baseContentFiles = () => readStackContentFiles(process.cwd(), DEFAULT_STACK);

export const baseContentSources = () => readStackContentSources(process.cwd(), DEFAULT_STACK);

/** The stack in admission order, as production builds it: block indices follow this order. */
export const startupContentSources = () => admitPacks(readBundledPacks(process.cwd(), DEFAULT_STACK)).sources;

let stackReader: ((contentFile: string, path: string) => Buffer) | undefined;
const loadedFigures = new Map<string, ActorFigureFiles>();

/**
 * Reads a declared file of the pack that owns a content file. `baseContentSources` names content files relative to
 * their pack, so a name no admitted pack root holds resolves to the one pack that declares it.
 */
const readStackFile = (): ((contentFile: string, path: string) => Buffer) => {
  const packs = readBundledPacks(process.cwd(), DEFAULT_STACK);
  const admitted = declaredFileReader(process.cwd(), admitPacks(packs).packs, packs);
  return (contentFile, path) => {
    const declaring = packs.filter(({ manifest }) => manifest.files.some((file) => file.path === contentFile));
    if (declaring.length !== 1) {
      return admitted(contentFile, path);
    }
    return packFileBytes(process.cwd(), declaring[0]!, path);
  };
};

/**
 * The figure files of a registry built from this stack, read as the Node digest reads them. Sessions in one test
 * file share the decoded map of an equal figure row set, so each file decodes the stack's figures once.
 */
export const stackActorFigureFiles = (registry: Registry): ActorFigureFiles => {
  const key = JSON.stringify(
    [...registry.actorFigures.values()].map((row) => [
      row.id,
      row.body,
      row.clips,
      registry.contentOrigins.get(`actorFigures:${row.id}`)?.source,
    ]),
  );
  let files = loadedFigures.get(key);
  if (!files) {
    stackReader ??= readStackFile();
    const read = stackReader;
    files = readActorFigureFiles(registry, (contentFile, path) => JSON.parse(read(contentFile, path).toString('utf8')));
    loadedFigures.set(key, files);
  }
  return files;
};

/**
 * Figure files where each fixture type, a copy of a registered type under its own id, wears that type's figures.
 * Keys are fixture ids and values the registered type ids they copy.
 */
export const withFixtureFigures = (
  files: ActorFigureFiles,
  copies: Readonly<Record<string, string>>,
): ActorFigureFiles => {
  const aliased = new Map(files);
  for (const [fixture, type] of Object.entries(copies)) {
    for (const [key, figure] of files) {
      const parts = actorFigureKeyParts(key);
      if (parts?.type === type) {
        aliased.set(actorFigureKey(fixture, parts.seed), figure);
      }
    }
  }
  return aliased;
};
