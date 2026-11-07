import { relative, resolve } from 'node:path';
import { writeRecipeExports } from '../packages/thing-export/src/files.ts';
import { compileJsonnetSources } from './jsonnet/compile.mjs';
import { REPOSITORY_ROOT } from './jsonnet/index.mjs';
import { modDirectories, readThingRecipes, thingRecipeDirectories } from './thing-recipes.ts';

const within = (base, directory) => relative(REPOSITORY_ROOT, resolve(base, directory)).replaceAll('\\', '/');

// Recipe evaluation precedes exporter imports because their catalogues are static JSON imports.
compileJsonnetSources({
  within: [
    'packages/thing-core/src',
    'packages/thing-authoring-tool',
    'packages/gun-authoring-tool',
    ...modDirectories().map((base) => within(base, 'presentation')),
    ...thingRecipeDirectories().map((base) => within(base, 'exports')),
  ],
});
const { loadExportRecipe } = await import('../packages/gun-authoring-tool/src/cli/exportRecipe.ts');
const { loadThingRecipe } = await import('../packages/thing-authoring-tool/src/exports.ts');

const jobs = [
  {
    base: resolve(REPOSITORY_ROOT, 'packages/mods/skelly.firearms'),
    directory: 'gungen',
    recipe: loadExportRecipe(),
    index: false,
  },
  ...readThingRecipes().map(({ base, value }) => ({
    base,
    directory: 'things',
    recipe: loadThingRecipe(value),
    index: true,
  })),
];
for (const base of new Set(jobs.map((job) => job.base))) {
  const ids = jobs.filter((job) => job.base === base).flatMap(({ recipe }) => recipe.map(({ id }) => id));
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Tool recipes cannot own the same model identity in ${base}`);
  }
}
for (const { base, directory, recipe, index } of jobs) {
  writeRecipeExports(recipe, base, directory, { index });
}
await import('../packages/deadvox/tools/item-fuel-models.mjs');
const { syncItemModelMetadata } = await import('./item-model-metadata.mjs');
syncItemModelMetadata();
// Content Jsonnet imports the model files written above, so the full compile runs last.
compileJsonnetSources();
