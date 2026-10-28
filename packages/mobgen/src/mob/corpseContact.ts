import type { Bone } from '../core/body.ts';
import {
  applyPoint,
  compose,
  cross,
  dot,
  IDENTITY_M,
  length,
  type Mat3,
  mulMM,
  mulMV,
  rotAxis,
  rotY,
  scale,
  sub,
  type Transform,
  transpose,
  type Vec3,
} from '../core/math.ts';
import { boneLocalTransform, boneTransforms } from '../core/pose.ts';
import { type Voxels, worldPosition } from '../core/voxelize.ts';
import deathContent from './deathPoses.json' with { type: 'json' };
import { corners, type Extent } from './gait.ts';

interface ContactActor {
  readonly bones: readonly Bone[];
  readonly bodyExtents: ReadonlyMap<string, Extent>;
  readonly voxels: Voxels;
}

const boneCells = (actor: ContactActor, id: string): readonly Vec3[] => {
  const owner = actor.bones.findIndex((bone) => bone.id === id) + 1;
  const { voxels } = actor;
  const result: Vec3[] = [];
  voxels.owner.forEach((cellOwner, index) => {
    if (cellOwner !== owner) {
      return;
    }
    const i = index % voxels.dims[0];
    const j = Math.floor(index / voxels.dims[0]) % voxels.dims[1];
    const k = Math.floor(index / (voxels.dims[0] * voxels.dims[1]));
    result.push(worldPosition(voxels, i, j, k));
  });
  return result;
};

const basis = (r: Mat3): readonly Vec3[] =>
  (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as const
  ).map((axis) => mulMV(r, axis));

const cellKey = (x: number, y: number, z: number): string => `${x}:${y}:${z}`;

const chestCollider = (points: readonly Vec3[], size: number) => {
  const index = new Map(
    points.map((point) => [
      cellKey(Math.round(point[0] / size), Math.floor(point[1] / size), Math.round(point[2] / size)),
      point,
    ]),
  );
  return (skull: readonly Vec3[], relative: Transform): boolean => {
    const a = basis(relative.r);
    const b = basis(IDENTITY_M);
    const axes = [...a, ...b, ...a.flatMap((axis) => b.map((other) => cross(axis, other)))].filter(
      (axis) => length(axis) > 1e-10,
    );
    const projections = axes.map((axis) => ({
      axis,
      radius: (size / 2) * [...a, ...b].reduce((sum, direction) => sum + Math.abs(dot(axis, direction)), 0),
    }));
    return skull.some((point) => {
      const centre = applyPoint(relative, point);
      const x = Math.round(centre[0] / size);
      const y = Math.round(centre[1] / size - 0.5);
      const z = Math.round(centre[2] / size);
      return neighbourOverlap(index, centre, [x, y, z], projections);
    });
  };
};

const neighbourOverlap = (
  index: ReadonlyMap<string, Vec3>,
  centre: Vec3,
  cell: Vec3,
  projections: readonly { axis: Vec3; radius: number }[],
): boolean => {
  // Two unit cubes can overlap only within the neighbouring grid cells, even after a rotation.
  for (let x = cell[0] - 1; x <= cell[0] + 1; x++) {
    for (let y = cell[1] - 1; y <= cell[1] + 1; y++) {
      for (let z = cell[2] - 1; z <= cell[2] + 1; z++) {
        const other = index.get(cellKey(x, y, z));
        if (!other) {
          continue;
        }
        const delta = sub(centre, other);
        if (projections.every(({ axis, radius }) => Math.abs(dot(delta, axis)) < radius - 1e-9)) {
          return true;
        }
      }
    }
  }
  return false;
};

const firstSupported = (range: readonly number[], accepts: (angle: number) => boolean): number | undefined => {
  const start = range[0]!;
  const end = range[1]!;
  const samples = 32;
  for (let sample = 0; sample <= samples; sample++) {
    const angle = start + ((end - start) * sample) / samples;
    if (!accepts(angle)) {
      continue;
    }
    let low = start + ((end - start) * Math.max(0, sample - 1)) / samples;
    let high = angle;
    for (let iteration = 0; iteration < 16; iteration++) {
      const middle = (low + high) / 2;
      if (accepts(middle)) {
        high = middle;
      } else {
        low = middle;
      }
    }
    accepts(high);
    return high;
  }
  return undefined;
};

export const fitSkullContact = (
  actor: ContactActor,
  rotations: Record<string, Mat3>,
  root: Vec3,
  headRolls: readonly number[],
): void => {
  const neck = actor.bones.find((bone) => bone.id === 'neck');
  const head = actor.bones.find((bone) => bone.id === 'head');
  if (!(neck && head)) {
    return;
  }
  const initial = boneTransforms(actor.bones, { root, rotations });
  const chest = initial.get('chest')!;
  const inverseR = transpose(chest.r);
  const inverse: Transform = { r: inverseR, t: scale(mulMV(inverseR, chest.t), -1) };
  const collision = chestCollider(boneCells(actor, 'chest'), actor.voxels.size);
  const skull = ['head', 'jaw'].map((id) => ({ id, cells: boneCells(actor, id) }));
  const overlaps = (world: Transform): boolean => skull.some(({ cells }) => collision(cells, compose(inverse, world)));
  if (!skull.some(({ id, cells }) => collision(cells, compose(inverse, initial.get(id)!)))) {
    return;
  }
  const axis = cross(mulMV(chest.r, sub(neck.tail, neck.head)), [0, 1, 0]);
  const aboveFloor = (id: string, world: Transform): boolean =>
    corners(actor.bodyExtents.get(id)!).every((point) => applyPoint(world, point)[1] >= 0);
  const original = { ...rotations };
  const atNeck = (angle: number): boolean => {
    rotations.neck = mulMM(inverseR, mulMM(rotAxis(axis, angle), chest.r));
    const neckWorld = compose(chest, boneLocalTransform(neck, { root, rotations }));
    if (!aboveFloor('neck', neckWorld)) {
      return false;
    }
    for (const roll of headRolls) {
      const atHead = (pitch: number): boolean => {
        const worldR = mulMM(rotAxis(axis, pitch), mulMM(chest.r, rotY(roll)));
        rotations.head = mulMM(transpose(neckWorld.r), worldR);
        const world = compose(neckWorld, boneLocalTransform(head, { root, rotations }));
        return aboveFloor('head', world) && aboveFloor('jaw', world) && !overlaps(world);
      };
      if (firstSupported(deathContent.contact.headPitch, atHead) !== undefined) {
        rotations.jaw = IDENTITY_M;
        return true;
      }
    }
    return false;
  };
  if (firstSupported(deathContent.contact.neckLift, atNeck) === undefined) {
    Object.assign(rotations, original);
    throw new Error('Death pose has no supported head/chest contact within its authored search range');
  }
};
