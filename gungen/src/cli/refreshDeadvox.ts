import { resolve } from 'node:path';
import { writeRecipeExports } from '@skelly/thing-export/files.ts';
import { loadExportRecipe } from './exportRecipe.ts';

writeRecipeExports(
  loadExportRecipe(),
  resolve(import.meta.dirname, '../../../packages/deadvox/src/content/base'),
  'gungen',
);
