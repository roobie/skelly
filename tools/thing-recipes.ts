// biome-ignore-all lint/correctness/noNodejsModules: filesystem discovery shared by Node-only exporter commands.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..');

export const thingRecipeDirectories = (repositoryRoot = repository): string[] =>
  ['packages/deadvox/mods', 'packages/mods']
    .flatMap((root) => {
      const directory = resolve(repositoryRoot, root);
      return existsSync(directory)
        ? readdirSync(directory, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => resolve(directory, entry.name))
            .filter((base) => existsSync(resolve(base, 'exports/things.jsonnet')))
        : [];
    })
    .sort();

export const readThingRecipes = (repositoryRoot = repository): { base: string; value: unknown }[] =>
  thingRecipeDirectories(repositoryRoot).map((base) => ({
    base,
    value: JSON.parse(readFileSync(resolve(base, 'exports/things.json'), 'utf8')),
  }));
