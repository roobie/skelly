// The player figure's exported models, loaded from their files, behind the `ModelLibrary` calls the world figure
// and the first-person arms make. Tests spread it into their library fakes so the view arms rig the real arm model.
import { readFileSync } from 'node:fs';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Registry } from '../src/core/content.ts';
import { FIGURE_LIMBS } from '../src/core/schema.ts';
import type { ModelLibrary } from '../src/render/models.ts';

export type FigureModels = Pick<ModelLibrary, 'has' | 'part' | 'heldLook'>;

export const loadFigureModels = async (registry: Registry, figureId = 'player'): Promise<FigureModels> => {
  const figure = registry.figures.get(figureId)!;
  const loader = new GLTFLoader();
  const ids = [...new Set([figure.body.model, ...FIGURE_LIMBS.map((limb) => figure.limbs[limb].model)])];
  const parsed = await Promise.all(
    ids.map((id) => {
      const bytes = readFileSync(new URL(`../src/content/base/${registry.models.get(id)!.file}`, import.meta.url));
      return loader.parseAsync(Uint8Array.from(bytes).buffer, '');
    }),
  );
  const scenes = new Map<string, Object3D>(ids.map((id, index) => [id, parsed[index]!.scene]));
  return { has: (id) => scenes.has(id), part: (id) => scenes.get(id)?.clone(), heldLook: () => undefined };
};
