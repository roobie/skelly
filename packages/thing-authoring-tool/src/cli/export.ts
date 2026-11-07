import { resolve } from 'node:path';
import process from 'node:process';
import { writeRecipeExports } from '@skelly/thing-export/files.ts';
import { readThingRecipes } from '../../../../tools/thing-recipes.ts';
import { loadThingRecipe } from '../exports.ts';

export const exportThingRecipes = (repositoryRoot = resolve(import.meta.dirname, '../../../..')): void => {
  for (const { base, value } of readThingRecipes(repositoryRoot)) {
    writeRecipeExports(loadThingRecipe(value), base, 'things', { index: true });
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  exportThingRecipes();
}
