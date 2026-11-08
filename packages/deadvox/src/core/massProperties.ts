import type { Vec3 } from './coords.ts';

type Tensor3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export interface MassProperties {
  readonly mass: number;
  readonly center: Vec3;
  /** Symmetric inertia tensor about `center`, row-major, kg·m². */
  readonly inertia: Tensor3;
}

export interface VoxelBounds {
  readonly center: Vec3;
  readonly halfExtents: Vec3;
  /** Eight corners relative to the supplied reference point, which a rigid body sets to its centre of mass. */
  readonly corners: readonly Vec3[];
}

const requirePositive = (value: number, name: string): void => {
  if (!(value > 0 && Number.isFinite(value))) {
    throw new RangeError(`${name} must be positive and finite`);
  }
};

const requireVoxels = (centres: readonly Vec3[]): void => {
  if (centres.length === 0) {
    throw new RangeError('selected bones contain no voxels');
  }
};

/** The axis-aligned box around solid voxel cubes given by their centres, as a built body stores them. */
export const voxelBounds = (centres: readonly Vec3[], voxelSize: number, reference: Vec3 = [0, 0, 0]): VoxelBounds => {
  requirePositive(voxelSize, 'voxelSize');
  requireVoxels(centres);
  const half = voxelSize / 2;
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const centre of centres) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, centre[axis]! - half);
      max[axis] = Math.max(max[axis]!, centre[axis]! + half);
    }
  }
  const center: Vec3 = [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2];
  const halfExtents: Vec3 = [(max[0]! - min[0]!) / 2, (max[1]! - min[1]!) / 2, (max[2]! - min[2]!) / 2];
  const corners: Vec3[] = [];
  for (const x of [-halfExtents[0], halfExtents[0]]) {
    for (const y of [-halfExtents[1], halfExtents[1]]) {
      for (const z of [-halfExtents[2], halfExtents[2]]) {
        corners.push([center[0] + x - reference[0], center[1] + y - reference[1], center[2] + z - reference[2]]);
      }
    }
  }
  return { center, halfExtents, corners };
};

/** Solid-voxel mass, centre and inertia of voxel cubes given by their rest centres, in metres and kilograms. */
export const massProperties = (centres: readonly Vec3[], voxelSize: number, density: number): MassProperties => {
  requirePositive(voxelSize, 'voxelSize');
  requirePositive(density, 'density');
  requireVoxels(centres);
  const voxelMass = density * voxelSize ** 3;
  const sum = [0, 0, 0];
  for (const centre of centres) {
    sum[0]! += centre[0];
    sum[1]! += centre[1];
    sum[2]! += centre[2];
  }
  const center: Vec3 = [sum[0]! / centres.length, sum[1]! / centres.length, sum[2]! / centres.length];
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  for (const centre of centres) {
    const x = centre[0] - center[0];
    const y = centre[1] - center[1];
    const z = centre[2] - center[2];
    xx += voxelMass * (y * y + z * z);
    yy += voxelMass * (x * x + z * z);
    zz += voxelMass * (x * x + y * y);
    xy -= voxelMass * x * y;
    xz -= voxelMass * x * z;
    yz -= voxelMass * y * z;
  }
  // Each cube's own inertia about its centre, m·s²/6 on every axis.
  const ownCubes = (voxelMass * voxelSize * voxelSize * centres.length) / 6;
  return {
    mass: centres.length * voxelMass,
    center,
    inertia: [
      [xx + ownCubes, xy, xz],
      [xy, yy + ownCubes, yz],
      [xz, yz, zz + ownCubes],
    ],
  };
};
