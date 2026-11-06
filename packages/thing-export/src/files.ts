import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import type { NeutralModel } from '@skelly/thing-core/schema';
import { cacheKey, type ExportCache } from './cache.ts';
import type { RecipeExport } from './recipe.ts';

const formattedJson = (value: unknown, file: string): string => {
  const root = resolve(import.meta.dirname, '../../..');
  return execFileSync(
    process.execPath,
    [resolve(root, 'node_modules/@biomejs/biome/bin/biome'), 'format', `--stdin-file-path=${file}`],
    { cwd: root, encoding: 'utf8', input: JSON.stringify(value), maxBuffer: Number.POSITIVE_INFINITY },
  );
};
export const modelEntryJson = (entry: NeutralModel): string => formattedJson(entry, `${entry.id}.model.json`);

/** A recipe row's written files, from the cache when its code and inputs are unchanged. */
const exported = (row: RecipeExport, cache?: { readonly store: ExportCache; readonly code: string }) => {
  const key = cache && row.inputs ? cacheKey(cache.code, row.inputs()) : undefined;
  const hit = key === undefined ? undefined : cache?.store.get(row.id, key);
  if (hit) {
    return { modelEntry: JSON.parse(hit.entryText) as NeutralModel, entryText: hit.entryText, glb: hit.glb };
  }
  const { modelEntry, glb } = row.generate();
  const entryText = modelEntryJson(modelEntry);
  if (key !== undefined) {
    cache?.store.put(row.id, key, { entryText, glb });
  }
  return { modelEntry, entryText, glb };
};

// Unchanged files are left alone so file watchers such as the dev server only see models that changed.
const writeChanged = (file: string, data: string | Uint8Array): void => {
  const bytes = typeof data === 'string' ? Buffer.from(data) : data;
  if (!(existsSync(file) && readFileSync(file).equals(bytes))) {
    writeFileSync(file, bytes);
  }
};

export const writeRecipeExports = (
  recipe: readonly RecipeExport[],
  base: string,
  directory: string,
  {
    index = false,
    cache,
  }: { readonly index?: boolean; readonly cache?: { readonly store: ExportCache; readonly code: string } } = {},
): void => {
  const outputs = recipe.map((row) => exported(row, cache));
  mkdirSync(resolve(base, directory), { recursive: true });
  mkdirSync(resolve(base, 'assets/models'), { recursive: true });
  if (index) {
    writeChanged(
      resolve(base, directory, 'index.json'),
      formattedJson(
        outputs.map(({ modelEntry }) => modelEntry),
        'index.json',
      ),
    );
  }
  for (const { modelEntry, entryText, glb } of outputs) {
    writeChanged(resolve(base, directory, `${modelEntry.id}.model.json`), entryText);
    writeChanged(resolve(base, modelEntry.file), glb);
  }
};
