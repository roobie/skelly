import type { Mesh, Object3D } from 'three';

/**
 * The layer of the player's world figure. The main camera sees it (engine.ts enables the layer), so
 * it is drawn and casts the sun's shadow; the flashlight's shadow pass looks through a camera
 * without it (render/shadows.ts), so the figure never blocks the player's own beam.
 */
export const PLAYER_FIGURE_LAYER = 1;

/** Makes `object` and everything under it cast and receive shadows (a no-op while no light casts). Returns it. */
export const castsAndReceives = <T extends Object3D>(object: T): T => {
  object.traverse((part) => {
    if ((part as Mesh).isMesh) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });
  return object;
};
