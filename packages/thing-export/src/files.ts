import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import type { NeutralModel } from '@skelly/thing-core/schema';
import type { RecipeExport } from './recipe.ts';

const formatJson = (value: unknown, path: string): string => {
  const root = resolve(import.meta.dirname, '../../..');
  return execFileSync(
    process.execPath,
    [resolve(root, 'node_modules/@biomejs/biome/bin/biome'), 'format', `--stdin-file-path=${path}`],
    { cwd: root, encoding: 'utf8', input: JSON.stringify(value), maxBuffer: Number.POSITIVE_INFINITY },
  );
};
export const modelEntryJson = (entry: NeutralModel): string => formatJson(entry, `${entry.id}.model.json`);
export const writeRecipeExports = (
  recipe: readonly RecipeExport[],
  base: string,
  directory: string,
  options: { readonly modelIndex?: boolean } = {},
): void => {
  const outputs = recipe.map(({ generate }) => generate());
  mkdirSync(resolve(base, directory), { recursive: true });
  mkdirSync(resolve(base, 'assets/models'), { recursive: true });
  for (const { modelEntry, glb } of outputs) {
    writeFileSync(resolve(base, directory, `${modelEntry.id}.model.json`), modelEntryJson(modelEntry));
    writeFileSync(resolve(base, modelEntry.file), glb);
  }
  if (options.modelIndex) {
    writeFileSync(
      resolve(base, directory, 'models.json'),
      formatJson(
        outputs.map(({ modelEntry }) => modelEntry),
        'models.json',
      ),
    );
  }
};
