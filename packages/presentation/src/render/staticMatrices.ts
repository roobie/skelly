// Static scene parts — the terrain batch, placed furniture, corpses, piles, vehicles, the actor crowd —
// never move between their owners' rebuilds, yet three.js recomposes every object's local matrix each
// frame while `matrixAutoUpdate` is on (`Object3D.updateMatrixWorld`). Freezing a subtree composes each
// local matrix once and stops that per-frame work; the world matrices still update when a change is
// flagged. The contract is the owner's: it rebuilds a node when its pieces change (furniture restage,
// pile records), or, when it changes a frozen node's local transform in place, calls `freezeMatrices`
// again to recompose it — `CorpseFigures.sync` does that for a settled corpse it reuses. Nodes moved
// every frame (tentacles, the selection marker) stay unfrozen.

import type { Object3D } from 'three';

/** Composes `object`'s subtree once and stops the per-frame recompose; see the module comment. */
export const freezeMatrices = (object: Object3D): void => {
  object.traverse((node) => {
    node.updateMatrix();
    node.matrixAutoUpdate = false;
  });
};
