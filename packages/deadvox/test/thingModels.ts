import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MOD_ROOTS } from './modFile.ts';

/**
 * Every thing-tool model with its file resolved in the mod that exports it, so a model contract follows the model
 * when a row moves between mods. Finds the mods by reading files, because deadvox imports no sibling source; the
 * exporter's rule is `tools/thing-recipes.ts`, `thingRecipeDirectories`.
 */
export const thingModels = (): { id: string; path: string }[] =>
  MOD_ROOTS.flatMap((root) => readdirSync(root, { withFileTypes: true }).map((entry) => resolve(root, entry.name)))
    .filter((base) => existsSync(resolve(base, 'exports/things.jsonnet')))
    .flatMap((base) =>
      (JSON.parse(readFileSync(resolve(base, 'things/index.json'), 'utf8')) as { id: string; file: string }[]).map(
        ({ id, file }) => ({ id, path: resolve(base, file) }),
      ),
    );
