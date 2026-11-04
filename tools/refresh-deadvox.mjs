import { relative, resolve } from 'node:path';
import { writeRecipeExports } from '../packages/thing-export/src/files.ts';
import { compileJsonnetSources } from './jsonnet/compile.mjs';
import { REPOSITORY_ROOT } from './jsonnet/index.mjs';
import { readThingRecipes, thingRecipeDirectories } from './thing-recipes.ts';

// Recipe evaluation precedes exporter imports because their catalogues are static JSON imports.
compileJsonnetSources({
  within: [
    'packages/thing-core/src',
    'packages/thing-authoring-tool',
    'packages/gun-authoring-tool',
    'packages/deadvox/mods/skelly.deadvox.residual/presentation',
    ...thingRecipeDirectories().map((base) =>
      relative(REPOSITORY_ROOT, resolve(base, 'exports')).replaceAll('\\', '/'),
    ),
  ],
});
const { loadExportRecipe } = await import('../packages/gun-authoring-tool/src/cli/exportRecipe.ts');
const { loadThingRecipe } = await import('../packages/thing-authoring-tool/src/exports.ts');

const jobs = [
  {
    base: resolve(REPOSITORY_ROOT, 'packages/deadvox/mods/skelly.deadvox.residual'),
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
await import('./item-model-metadata.mjs');
// Content Jsonnet imports the model files written above, so the full compile runs last.
compileJsonnetSources();
