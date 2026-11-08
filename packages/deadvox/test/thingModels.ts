import { packFile, shippedPacks } from './modFile.ts';

const THING_MODEL = /^things\/[^/]+\.model\.json$/;

/**
 * Every thing-tool model with its GLB, read through the pack reader, so a model contract follows the model when a
 * row moves between packs or its file moves between roots.
 */
export const thingModels = (): { id: string; glb: Buffer }[] =>
  shippedPacks().flatMap((pack) =>
    pack.manifest.files
      .filter(({ path, kind }) => kind === 'json' && THING_MODEL.test(path))
      .map(({ path }) => {
        const { id, file } = JSON.parse(packFile(pack, path).toString('utf8')) as { id: string; file: string };
        return { id, glb: packFile(pack, file) };
      }),
  );
