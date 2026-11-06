import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { thingRecipeDirectories } from '../../../tools/thing-recipes.ts';

/**
 * Every thing-tool model with its file resolved in the mod that exports it, so a model contract follows the model
 * when a row moves between mods.
 */
export const thingModels = (): { id: string; path: string }[] =>
  thingRecipeDirectories().flatMap((base) =>
    (JSON.parse(readFileSync(resolve(base, 'things/index.json'), 'utf8')) as { id: string; file: string }[]).map(
      ({ id, file }) => ({ id, path: resolve(base, file) }),
    ),
  );
