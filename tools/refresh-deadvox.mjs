import { resolve } from 'node:path';
import { loadExportRecipe } from '../gungen/src/cli/exportRecipe.ts';
import { loadThingRecipe } from '../packages/thing-authoring-tool/src/exports.ts';
import { writeRecipeExports } from '../packages/thing-export/src/files.ts';
import { compileJsonnetSources } from './jsonnet/compile.mjs';
import { REPOSITORY_ROOT } from './jsonnet/index.mjs';

const jobs = [
  { directory: 'gungen', recipe: loadExportRecipe(), index: false },
  { directory: 'things', recipe: loadThingRecipe(), index: true },
];
const ids = jobs.flatMap(({ recipe }) => recipe.map(({ id }) => id));
if (new Set(ids).size !== ids.length) {
  throw new Error('Tool recipes cannot own the same model identity');
}
for (const { directory, recipe, index } of jobs) {
  writeRecipeExports(recipe, resolve(REPOSITORY_ROOT, 'packages/deadvox/src/content/base'), directory, { index });
}
compileJsonnetSources();
