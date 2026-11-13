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

/**
 * A bone as a built body stores it, with the rest centres of the voxels it owns. Parsed content may hold an
 * absent optional field as undefined, so this is typed apart from the schema for readers that need no schema.
 */
export interface BuiltBone {
  readonly id: string;
  readonly parent: string | null;
  readonly head: Vec3;
  readonly tail: Vec3;
  readonly frame?: Bone['frame'] | undefined;
  readonly limits?: Bone['limits'] | undefined;
  readonly disposition?: Bone['disposition'] | undefined;
  readonly voxels?: readonly Vec3[] | undefined;
}

export interface BodyAnchor {
  readonly bone: string;
  /** Rest-pose world coordinates; apply the owning bone's posed transform. */
  readonly position: Vec3;
}

/** A built body's bones as the pose solver's skeleton, in body bone order. */
export const bodySkeleton = (body: { readonly bones: readonly BuiltBone[] }): Bone[] =>
  body.bones.map(({ id, parent, head, tail, frame, limits, disposition }) => ({
    id,
    parent,
    head,
    tail,
    ...(frame && { frame }),
    ...(limits && { limits }),
    ...(disposition && { disposition }),
  }));
