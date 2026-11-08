import process from 'node:process';
import type { ActorFigureFiles } from '../src/core/actorFigureFiles.ts';
import type { Registry } from '../src/core/content.ts';
import { admitPacks } from '../src/core/packAdmission.ts';
import { actorFigureKey, actorFigureKeyParts } from '../src/core/schema/actors.ts';
import {
  readBundledPacks,
  readStackActorFigureFiles,
  readStackContentFiles,
  readStackContentSources,
} from '../tools/readBundledPacks.ts';

const DEFAULT_STACK = 'skelly.deadvox';

export const baseContentFiles = () => readStackContentFiles(process.cwd(), DEFAULT_STACK);

export const baseContentSources = () => readStackContentSources(process.cwd(), DEFAULT_STACK);

/** The stack in admission order, as production builds it: block indices follow this order. */
export const startupContentSources = () => admitPacks(readBundledPacks(process.cwd(), DEFAULT_STACK)).sources;

const loadedFigures = new Map<string, ActorFigureFiles>();

/**
 * The figure files a registry built from this stack declares, read from the packs that declare them by the
 * shared stack reader the simulation digest also uses. Sessions in one test file share the decoded map of an
 * equal figure row set, so each file decodes the stack's figures once.
 */
export const stackActorFigureFiles = (registry: Registry): ActorFigureFiles => {
  const key = JSON.stringify(
    [...registry.actorFigures.values()].map((row) => [
      row.id,
      row.body,
      row.clips,
      row.mesh,
      registry.contentOrigins.get(`actorFigures:${row.id}`)?.source,
    ]),
  );
  let files = loadedFigures.get(key);
  if (!files) {
    files = readStackActorFigureFiles(process.cwd(), DEFAULT_STACK, registry);
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
