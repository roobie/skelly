import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadExportRecipe } from './exportRecipe.ts';
import { modelEntryJson } from './modelEntryJson.ts';

const base = resolve(import.meta.dirname, '../../../packages/deadvox/src/content/base');
const outputs = loadExportRecipe().map(({ generate }) => generate());
mkdirSync(resolve(base, 'gungen'), { recursive: true });
mkdirSync(resolve(base, 'assets/models'), { recursive: true });
for (const { modelEntry, glb } of outputs) {
  writeFileSync(resolve(base, 'gungen', `${modelEntry.id}.model.json`), modelEntryJson(modelEntry));
  writeFileSync(resolve(base, modelEntry.file), glb);
}
