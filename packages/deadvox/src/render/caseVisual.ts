// Presentation-only case model resolution and its one shared placeholder representation.

import { BoxGeometry, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { ModelLibrary } from './models.ts';
import { castsAndReceives } from './shadowFlags.ts';

export const CASE_PLACEHOLDER_GEOMETRY = new BoxGeometry(0.038, 0.009, 0.012);
export const CASE_PLACEHOLDER_MATERIAL = new MeshStandardMaterial({
  color: 0xb4_87_45,
  metalness: 0.72,
  roughness: 0.38,
});

/** Return a clone of the calibre's real Gungen case GLB when loaded. */
export const resolveCaseModel = (
  models: ModelLibrary | undefined,
  modelId: string | undefined,
): Object3D | undefined => {
  if (modelId === undefined || models === undefined) {
    return undefined;
  }
  const model = models.ground(modelId);
  return model === undefined ? undefined : castsAndReceives(model);
};

/** The fallback used by flying cases; piles instance the same shared geometry/material. */
export const placeholderCaseMesh = (): Mesh =>
  castsAndReceives(new Mesh(CASE_PLACEHOLDER_GEOMETRY, CASE_PLACEHOLDER_MATERIAL));
