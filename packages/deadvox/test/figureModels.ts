// The player figure's exported models, loaded from their files, behind the `ModelLibrary` calls the world figure
// and the first-person arms make. Tests spread it into their library fakes so the view arms rig the real arm model.
import { readFileSync } from 'node:fs';
import { Group, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Registry } from '../src/core/content.ts';
import { FIGURE_LIMBS } from '../src/core/schema.ts';
import type { ItemLook } from '../src/render/itemLook.ts';
import { indexModelMaterials, type ModelLibrary } from '../src/render/models.ts';

export type FigureModels = Pick<ModelLibrary, 'has' | 'part' | 'partLook' | 'heldLook'>;

/** `worn` names further models to load beside the figure's, such as the head gear a test puts on. */
export const loadFigureModels = async (
  registry: Registry,
  figureId = 'player',
  worn: readonly string[] = [],
): Promise<FigureModels> => {
  const figure = registry.figures.get(figureId)!;
  const loader = new GLTFLoader();
  const ids = [...new Set([figure.body.model, ...FIGURE_LIMBS.map((limb) => figure.limbs[limb].model), ...worn])];
  const parsed = await Promise.all(
    ids.map((id) => {
      const bytes = readFileSync(new URL(`../src/content/base/${registry.models.get(id)!.file}`, import.meta.url));
      return loader.parseAsync(Uint8Array.from(bytes).buffer, '').then(indexModelMaterials);
    }),
  );
  const scenes = new Map<string, Object3D>(ids.map((id, index) => [id, parsed[index]!.scene]));
  // A look draws its own model, with an empty group standing in for each fitted part.
  const partLook = (look: ItemLook): Object3D | undefined => {
    const scene = scenes.get(look.model);
    if (!scene) {
      return undefined;
    }
    const root = new Group().add(scene.clone());
    for (const slot of look.slots) {
      if (slot.model !== undefined) {
        root.add(Object.assign(new Group(), { name: `fitted-${slot.slot}` }));
      }
    }
    return root;
  };
  return { has: (id) => scenes.has(id), part: (id) => scenes.get(id)?.clone(), partLook, heldLook: () => undefined };
};
