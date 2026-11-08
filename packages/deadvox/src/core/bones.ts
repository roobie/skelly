// The skeleton an actor is posed by: only the bone fields the runtime reads. Everything here is in rest-pose
// world coordinates; posing happens afterwards, in pose.ts.

import type { Vec3 } from './boneMath.ts';

/** A rigid segment, from head to tail, that forward kinematics poses. */
export interface Bone {
  readonly id: string;
  /** Bone id of the parent, or null for the root. */
  readonly parent: string | null;
  readonly head: Vec3;
  readonly tail: Vec3;
  readonly frame?: { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };
  readonly limits?: {
    readonly flex: readonly [number, number];
    readonly abduct: readonly [number, number];
    readonly twist: readonly [number, number];
  };
  readonly disposition?: 'fixed' | 'sever' | 'burst';
}

export interface BodyAnchor {
  readonly bone: string;
  /** Rest-pose world coordinates; apply the owning bone's posed transform. */
  readonly position: Vec3;
}

export interface ActorBody {
  readonly anchors?: Readonly<Record<string, BodyAnchor>>;
  /** Parents-first: every bone's parent appears earlier in the array (or is null). */
  readonly bones: readonly Bone[];
}
