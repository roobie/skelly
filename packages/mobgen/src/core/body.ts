// The body model: a skeleton (bones) plus a soft-tissue description (features)
// that the voxelizer turns into voxels. Everything here is in rest-pose world
// coordinates (see conventions.ts) — posing happens afterwards, in pose.ts.

import type { Vec3 } from './math.ts';
import type { Shape } from './sdf.ts';

/** A rigid segment, from head to tail, that features attach to and that FK poses. */
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
  /** Explicit material for forced marrow when a build omits this bone's flesh. */
  readonly marrowMaterial?: Material;
}

/** The hit regions a consumer resolves shots against; each body plan says which of its bones form them. */
export type BodyRegion = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

export type Material = string;
export interface MaterialDef {
  readonly color: Vec3;
  readonly emissive: number;
  /** The host scales this material's emission per actor (see mob/crowd.ts, packCharge), so one actor's
   * telegraph can brighten it without touching the shared mesh or the other glowing materials. */
  readonly charged?: boolean;
}

interface NoiseGate {
  /** noise3 is sampled at world position / scale (metres per noise cell). */
  readonly scale: number;
  /** The feature applies where noise3(...) < threshold. */
  readonly threshold: number;
}

export interface Feature {
  /** The bone this feature is anchored to. For 'paint', this is bookkeeping only:
   *  paint is tested against every filled voxel by world position, not by owner. */
  readonly bone: string;
  readonly op: 'add' | 'carve' | 'paint';
  readonly shape: Shape;
  readonly material: Material;
  /** Smooth-min blend radius (m) used to fold this feature into its bone's field. Add features only. Default 0.02. */
  readonly blend?: number;
  readonly noise?: NoiseGate;
  /** Paint or carve: target these materials. Carves preserve non-target add interiors. */
  readonly onto?: readonly Material[];
}

export interface BodyAnchor {
  readonly bone: string;
  /** Rest-pose world coordinates; apply the owning bone's posed transform. */
  readonly position: Vec3;
}

export interface Body {
  readonly anchors?: Readonly<Record<string, BodyAnchor>>;
  /** Parents-first: every bone's parent appears earlier in the array (or is null). */
  readonly bones: readonly Bone[];
  /** Add features first influence the field; paints are then applied in this array's order. */
  readonly features: readonly Feature[];
  /** Reserves repaired joint contacts for bodies assembled from overlapping modules. */
  readonly jointAdjacencyPolicy?: 'reserve-overlaps';
  readonly materials: Readonly<Record<Material, MaterialDef>>;
}
