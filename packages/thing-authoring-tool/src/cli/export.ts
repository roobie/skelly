import { resolve } from 'node:path';
import { writeRecipeExports } from '@skelly/thing-export/files.ts';
import { loadThingRecipe } from '../exports.ts';

writeRecipeExports(
  loadThingRecipe(),
  resolve(import.meta.dirname, '../../../../packages/deadvox/src/content/base'),
  'things',
  { index: true },
);
