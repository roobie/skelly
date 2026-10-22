import { recipeAsset } from '@skelly/thing-export/recipe.ts';
import { createPreview } from '@skelly/tool-ui/preview';
import { buildLayers, disposeGroup } from '@skelly/tool-ui/scene';
import { threeRuntime } from '@skelly/tool-ui/three-runtime';
import type { Group } from 'three';
import { buildItem, catalogue, palette } from './catalogue.ts';
import { exportItem, loadThingRecipe } from './exports.ts';

const select = document.querySelector<HTMLSelectElement>('#item')!;
const preview = createPreview(document.querySelector<HTMLCanvasElement>('#view')!);
const rows = loadThingRecipe();
for (const row of rows) {
  const option = document.createElement('option');
  option.value = row.id;
  option.textContent = row.source;
  select.add(option);
}
let drawn: Group | undefined;
const show = () => {
  const error = document.querySelector<HTMLPreElement>('#error')!;
  try {
    const row = rows.find(({ id }) => id === select.value)!;
    const item = catalogue.items.find(({ id }) => id === row.source)!;
    const { report } = buildItem(item);
    const { physical } = exportItem(item, recipeAsset(row), row.voxel);
    const layers = buildLayers(
      report,
      [],
      palette,
      threeRuntime,
      { origin: [0, 0, 0], dir: [0, 1, 0] },
      'finish',
      {},
      catalogue.facets,
    );
    if (drawn) {
      preview.scene.remove(drawn);
      disposeGroup(drawn);
    }
    drawn = layers.solids;
    for (const unused of [layers.axes, layers.ports, layers.keepOuts]) {
      disposeGroup(unused);
    }
    preview.scene.add(drawn);
    preview.frame(drawn, physical.centreOfMass);
    error.hidden = true;
  } catch (failure) {
    error.textContent = failure instanceof Error ? failure.message : String(failure);
    error.hidden = false;
  }
};
select.addEventListener('change', show);
show();
