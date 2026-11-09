import { baseRegistry } from './baseRegistry.ts';
import { packFile, shippedPacks } from './modFile.ts';

const THING_MODEL = /^things\/[^/]+\.model\.json$/;

/**
 * Only consumed exports belong to the drawing contract: a pinned release may also carry unused models.
 */
export const thingModels = (): { id: string; glb: Buffer }[] => {
  const { models } = baseRegistry();
  return shippedPacks().flatMap((pack) =>
    pack.manifest.files
      .filter(({ path, kind }) => kind === 'json' && THING_MODEL.test(path))
      .flatMap(({ path }) => {
        const { id, file } = JSON.parse(packFile(pack, path).toString('utf8')) as { id: string; file: string };
        return models.has(id) ? [{ id, glb: packFile(pack, file) }] : [];
      }),
  );
};
