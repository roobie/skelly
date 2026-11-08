// biome-ignore-all lint/correctness/noNodejsModules: filesystem discovery shared by Node-only exporter commands.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..');

export const modDirectories = (repositoryRoot = repository): string[] =>
  ['packages/deadvox/mods', 'packages/mods']
    .flatMap((root) => {
      const directory = resolve(repositoryRoot, root);
      return existsSync(directory)
        ? readdirSync(directory, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => resolve(directory, entry.name))
        : [];
    })
    .sort();
