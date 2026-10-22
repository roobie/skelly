import type { VoxelGrains } from '@skelly/thing-export/exportTypes.ts';
import { exportGlb } from '@skelly/thing-export/glb.ts';
import { assemblyProperties, modelParts } from '@skelly/thing-export/physical.ts';
import { loadRecipe, type RecipeRow, recipeAsset, recipeOptions, recipeVoxel } from '@skelly/thing-export/recipe.ts';
import { literal, optional, parse, picklist, strictObject } from 'valibot';
import recipe from '../exports/deadvox.json' with { type: 'json' };
import { buildItem, catalogue, palette, type ToolItem } from './catalogue.ts';

export const exportItem = (
  item: ToolItem,
  asset: ReturnType<typeof recipeAsset>,
  voxel: VoxelGrains,
  { collision = false }: { readonly collision?: boolean } = {},
) => {
  const { report, masses, handling, glow } = buildItem(item);
  const out = exportGlb({
    resolved: report.resolved,
    asset,
    palette,
    revolveFacets: catalogue.facets,
    ...voxel,
    generator: '@skelly/thing-authoring-tool',
    metadataNamespace: 'thing',
  });
  if (!out.ok) {
    throw new Error(JSON.stringify(out.error));
  }
  const parts = modelParts(
    report.resolved,
    (id, part) => {
      const massKg = masses[id];
      if (massKg === undefined) {
        throw new Error(`Missing authored mass for ${id}`);
      }
      return { part, massKg };
    },
    { collision },
  );
  if (collision && item.exportMass !== 'parts') {
    throw new Error(`${item.id}: baked collision travels with exported parts`);
  }
  return {
    glb: out.glb,
    modelEntry: {
      ...asset,
      ...(item.exportMass === 'parts' ? { parts } : {}),
      ...handling,
      ...(glow ? { emissiveMaterial: glow } : {}),
    },
    physical: assemblyProperties(parts),
  };
};
const exporters = {
  item: (row: RecipeRow) => {
    const options = parse(
      strictObject({
        mass: picklist(['parts', 'inventory-atom']),
        collision: optional(literal(true)),
      }),
      recipeOptions(row),
    );
    const item = catalogue.items.find(({ id }) => id === row.source);
    if (!item) {
      throw new Error(`Unknown tool item ${row.source}`);
    }
    if (options.mass !== item.exportMass) {
      throw new Error(`Recipe mass ownership differs from tool item ${row.source}`);
    }
    return () => exportItem(item, recipeAsset(row), recipeVoxel(row), { collision: options.collision === true });
  },
};
export const loadThingRecipe = (value: unknown = recipe) => loadRecipe(value, exporters);
