import process from 'node:process';
import { type ActorFigureFiles, readActorFigureFiles } from '../src/core/actorFigureFiles.ts';
import type { Registry } from '../src/core/content.ts';
import { admitPacks } from '../src/core/packAdmission.ts';
import {
  declaredFileReader,
  readBundledPacks,
  readStackContentFiles,
  readStackContentSources,
} from '../tools/readBundledPacks.ts';

const DEFAULT_STACK = 'skelly.deadvox';

export const baseContentFiles = () => readStackContentFiles(process.cwd(), DEFAULT_STACK);

export const baseContentSources = () => readStackContentSources(process.cwd(), DEFAULT_STACK);

/** The stack in admission order, as production builds it: block indices follow this order. */
export const startupContentSources = () => admitPacks(readBundledPacks(process.cwd(), DEFAULT_STACK)).sources;

/** The figure files of a registry built from this stack, read as the Node digest reads them. */
export const stackActorFigureFiles = (registry: Registry): ActorFigureFiles => {
  const packs = readBundledPacks(process.cwd(), DEFAULT_STACK);
  const read = declaredFileReader(process.cwd(), admitPacks(packs).packs, packs);
  return readActorFigureFiles(registry, (contentFile, path) => JSON.parse(read(contentFile, path).toString('utf8')));
};
