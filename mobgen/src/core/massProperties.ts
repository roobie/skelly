import type { Vec3 } from './math.ts';
import { cellIndex, type Voxels, worldPosition } from './voxelize.ts';

export type Tensor3 = readonly [
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

const selectedOwners = (indices: Iterable<number>): Set<number> => {
  const owners = new Set<number>();
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= 255) {
      throw new RangeError(`invalid bone index ${index}`);
    }
    owners.add(index + 1);
  }
  return owners;
};

const voxelCenters = (voxels: Voxels, owners: ReadonlySet<number>): Vec3[] => {
  const points: Vec3[] = [];
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        if (owners.has(voxels.owner[cellIndex(voxels.dims, i, j, k)]!)) {
          points.push(worldPosition(voxels, i, j, k));
        }
      }
    }
  }
  return points;
};

const tensorAtCenter = (points: readonly Vec3[], center: Vec3, voxelMass: number, size: number): Tensor3 => {
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  for (const p of points) {
    const x = p[0] - center[0];
    const y = p[1] - center[1];
    const z = p[2] - center[2];
    xx += voxelMass * (y * y + z * z);
    yy += voxelMass * (x * x + z * z);
    zz += voxelMass * (x * x + y * y);
    xy -= voxelMass * x * y;
    xz -= voxelMass * x * z;
    yz -= voxelMass * y * z;
  }
  const ownCube = (voxelMass * size * size * points.length) / 6;
  return [
    [xx + ownCube, xy, xz],
    [xy, yy + ownCube, yz],
    [xz, yz, zz + ownCube],
  ];
};

/** Compute solid-voxel mass properties in the model's rest-pose frame (metres). Bone indices are
 * zero-based indices into the bone array; Voxels.owner stores those indices plus one. */
export const massProperties = (
  voxels: Voxels,
  boneIndices: Iterable<number>,
  voxelSize: number,
  density = 1000,
): MassProperties => {
  if (!(voxelSize > 0 && Number.isFinite(voxelSize))) {
    throw new RangeError('voxelSize must be positive and finite');
  }
  if (!(density > 0 && Number.isFinite(density))) {
    throw new RangeError('density must be positive and finite');
  }
  const points = voxelCenters(voxels, selectedOwners(boneIndices));
  if (points.length === 0) {
    throw new RangeError('selected bones contain no voxels');
  }
  const voxelMass = density * voxelSize ** 3;
  const mass = points.length * voxelMass;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of points) {
    sx += p[0];
    sy += p[1];
    sz += p[2];
  }
  const center: Vec3 = [sx / points.length, sy / points.length, sz / points.length];
  return { mass, center, inertia: tensorAtCenter(points, center, voxelMass, voxelSize) };
};
