import type { Mesh, Object3D } from 'three';

/**
 * The layer of the player's world figure. The main camera sees it (engine.ts enables the layer), so
 * it is drawn and casts the sun's shadow; the flashlight's shadow pass looks through a camera
 * without it (render/shadows.ts), so the figure never blocks the player's own beam.
 */
export const PLAYER_FIGURE_LAYER = 1;
/** Own-head colour exclusion; external views and the sun still see these surfaces. */
export const PLAYER_SELF_MASK_LAYER = 2;

/**
 * Makes every node added anywhere under `root`, now or later, take its new parent's layers, so a mesh added late
 * to an actor never lands on the world layer (three.js layers do not inherit). Nodes already under `root` keep
 * their layers until a layer pass sets them.
 */
export const inheritLayersOnAdd = (root: Object3D): void => {
  const onAdded = ({ target, child }: { target: Object3D; child: Object3D }): void => {
    child.traverse((node) => {
      node.layers.mask = target.layers.mask;
      node.addEventListener('childadded', onAdded);
    });
  };
  root.traverse((node) => node.addEventListener('childadded', onAdded));
};

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
