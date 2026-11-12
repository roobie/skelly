// Static scene parts — the terrain batch, placed furniture, corpses, piles, vehicles, the actor crowd —
// never move between their owners' rebuilds, yet three.js recomposes every object's local matrix each
// frame while `matrixAutoUpdate` is on (`Object3D.updateMatrixWorld`). Freezing a subtree composes each
// local matrix once and stops that per-frame work; the world matrices still update when a change is
// flagged. Every frozen owner rebuilds fresh objects when its pieces change (furniture restage, pile
// records, corpse placement), so a frozen object never moves again: an owner that moves a node in
// place (doors swinging are restaged, tentacles and the selection marker are never frozen) must leave
// that node unfrozen.

import type { Object3D } from 'three';

/** Composes `object`'s subtree once and stops the per-frame recompose; see the module comment. */
export const freezeMatrices = (object: Object3D): void => {
  object.traverse((node) => {
    node.updateMatrix();
    node.matrixAutoUpdate = false;
  });
};
