// Dismemberment, first slice: which bones a "cut" at some part hides, for the humanoid rig. Pure
// bone-topology logic only — the crowd texture's severed mask (crowd.ts) and deadvox's own sim/renderer
// wiring are separate layers built on top of this.

import type { Bone } from '../core/body.ts';

/** The parts a humanoid can be cut at, first slice: hand/forearm/upperArm each side (severing higher up
 * takes everything below it too — see severedBoneSet) and the head (which takes the jaw with it). Matches
 * humanoid.ts's buildBones ids exactly; not generic over other body plans. */
export const SEVERABLE_PARTS = [
  'hand.L',
  'hand.R',
  'forearm.L',
  'forearm.R',
  'upperArm.L',
  'upperArm.R',
  'head',
] as const;

/**
 * The full set of bone ids hidden by cutting at each bone id in `cuts` — the cut bone itself plus every
 * descendant (a cut at upperArm.L takes forearm.L and hand.L with it; a cut at head takes jaw with it).
 * Generic over any parent-linked bone list, not just SEVERABLE_PARTS — a duplicate or already-covered cut
 * (e.g. cutting both upperArm.L and hand.L) is harmless, just redundant.
 */
export const severedBoneSet = (bones: readonly Bone[], cuts: readonly string[]): ReadonlySet<string> => {
  const childrenOf = new Map<string, string[]>();
  for (const bone of bones) {
    if (bone.parent !== null) {
      const siblings = childrenOf.get(bone.parent);
      if (siblings) {
        siblings.push(bone.id);
      } else {
        childrenOf.set(bone.parent, [bone.id]);
      }
    }
  }
  const hidden = new Set<string>();
  const visit = (id: string): void => {
    if (hidden.has(id)) {
      return;
    }
    hidden.add(id);
    for (const child of childrenOf.get(id) ?? []) {
      visit(child);
    }
  };
  for (const cut of cuts) {
    visit(cut);
  }
  return hidden;
};
