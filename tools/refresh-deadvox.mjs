import { resolve } from 'node:path';
import { writeRecipeExports } from '../packages/thing-export/src/files.ts';
import { compileJsonnetSources } from './jsonnet/compile.mjs';
import { REPOSITORY_ROOT } from './jsonnet/index.mjs';

// The recipes and catalogues are static JSON imports, so the tools' own sources compile before their loaders are imported.
compileJsonnetSources({ within: ['packages/thing-core/src', 'packages/thing-authoring-tool', 'gungen'] });
const { loadExportRecipe } = await import('../gungen/src/cli/exportRecipe.ts');
const { loadThingRecipe } = await import('../packages/thing-authoring-tool/src/exports.ts');

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
// Content Jsonnet imports the model files written above, so the full compile runs last.
compileJsonnetSources();
