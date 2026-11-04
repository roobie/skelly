import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MOD_ROOTS = ['mods', '../mods'];

/** Where a pack-relative asset file lives, for a test holding a row but not the pack that defined it. */
export const modFile = (file: string): string => {
  for (const root of MOD_ROOTS) {
    for (const mod of readdirSync(root)) {
      const path = join(root, mod, file);
      if (existsSync(path)) {
        return path;
      }
    }
  }
  throw new Error(`no mod holds ${file}`);
};
