// Whether a posed body still holds together at a joint. One bone owns each voxel and moves rigidly, so a
// bend opens a crack on the joint's outer side unless other flesh swings in to fill it. Each pair of
// voxels that touch across the joint near its pivot at rest is checked after posing: a crack is open
// where no posed voxel of the body lies near the pair's new midpoint. Contacts farther from the pivot
// are limb against limb, like a shin folded along its thigh in the coil, and are meant to part.

import type { Bone } from '../../core/body.ts';
import type { Realized } from '../../core/generate.ts';
import { applyPoint, type Vec3 } from '../../core/math.ts';
import { boneTransforms, type Pose } from '../../core/pose.ts';
import { cellIndex, type Voxels, worldPosition } from '../../core/voxelize.ts';

/** The search reaches one voxel out, so any crack wider than this reads as this. */
const CRACK_CAP = 3;
/** About the trunk's half-thickness: the reach of a joint's own seam around its pivot. */
const JOINT_REACH = 0.16;
type Cell = readonly [number, number, number];
const FACES: readonly Cell[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
];
const AROUND: readonly Cell[] = [-1, 0, 1].flatMap((a) =>
  [-1, 0, 1].flatMap((b) => [-1, 0, 1].map((c) => [a, b, c] as const)),
);

interface Contact {
  readonly child: Vec3;
  readonly parent: Vec3;
}
type Body = Pick<Realized, 'body' | 'voxels'>;

/** Every filled cell with its owning bone and rest position. */
const forEachVoxel = ({ body, voxels }: Body, visit: (bone: Bone, position: Vec3, cell: Cell) => void): void => {
  const [nx, ny, nz] = voxels.dims;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]!;
        if (owner !== 0) {
          visit(body.bones[owner - 1]!, worldPosition(voxels, i, j, k), [i, j, k]);
        }
      }
    }
  }
};

const ownerAt = (voxels: Voxels, [i, j, k]: Cell): number => {
  const [nx, ny, nz] = voxels.dims;
  return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? 0 : voxels.owner[cellIndex(voxels.dims, i, j, k)]!;
};

const contactsByRealized = new WeakMap<object, ReadonlyMap<string, readonly Contact[]>>();

/** Rest voxel pairs touching face to face across each bone's joint with its parent, near its pivot. */
const jointContacts = (realized: Body): ReadonlyMap<string, readonly Contact[]> => {
  const cached = contactsByRealized.get(realized);
  if (cached) {
    return cached;
  }
  const { body, voxels } = realized;
  const contacts = new Map<string, Contact[]>();
  forEachVoxel(realized, (bone, child, [i, j, k]) => {
    const { head, parent, id } = bone;
    if (parent === null || Math.hypot(child[0] - head[0], child[1] - head[1], child[2] - head[2]) > JOINT_REACH) {
      return;
    }
    for (const [di, dj, dk] of FACES) {
      const neighbour = ownerAt(voxels, [i + di, j + dj, k + dk]);
      if (neighbour !== 0 && body.bones[neighbour - 1]!.id === parent) {
        contacts.set(id, [
          ...(contacts.get(id) ?? []),
          { child, parent: worldPosition(voxels, i + di, j + dj, k + dk) },
        ]);
      }
    }
  });
  contactsByRealized.set(realized, contacts);
  return contacts;
};

/** Posed voxel centres bucketed by cell, and the distance from a point to the nearest of them. */
const posedLookup = (realized: Body, pose: Pose, hidden: ReadonlySet<string>) => {
  const { size } = realized.voxels;
  const transforms = boneTransforms(realized.body.bones, pose);
  const bucketOf = (p: Vec3): Cell => [Math.floor(p[0] / size), Math.floor(p[1] / size), Math.floor(p[2] / size)];
  const buckets = new Map<string, Vec3[]>();
  forEachVoxel(realized, (bone, rest) => {
    if (!hidden.has(bone.id)) {
      const p = applyPoint(transforms.get(bone.id)!, rest);
      const key = bucketOf(p).join(',');
      const bucket = buckets.get(key) ?? [];
      bucket.push(p);
      buckets.set(key, bucket);
    }
  });
  const nearest = (m: Vec3): number => {
    const [ci, cj, ck] = bucketOf(m);
    let best = Number.POSITIVE_INFINITY;
    for (const [di, dj, dk] of AROUND) {
      for (const p of buckets.get(`${ci + di},${cj + dj},${ck + dk}`) ?? []) {
        best = Math.min(best, Math.hypot(p[0] - m[0], p[1] - m[1], p[2] - m[2]));
      }
    }
    return best;
  };
  return { transforms, nearest };
};

/** The widest crack, in voxel widths, that a pose opens at each listed joint (named by its child bone).
 * Zero means every rest contact near the pivot stays covered; one is a crack a whole voxel wide. Bones in
 * `hidden` neither crack nor cover. */
export const jointCracks = (
  realized: Body,
  pose: Pose,
  joints: readonly string[],
  hidden: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, number> => {
  const { size } = realized.voxels;
  const { transforms, nearest } = posedLookup(realized, pose, hidden);
  const contacts = jointContacts(realized);
  const cracks = new Map<string, number>();
  for (const joint of joints) {
    const bone = realized.body.bones.find((candidate) => candidate.id === joint);
    if (!bone || bone.parent === null || hidden.has(joint) || hidden.has(bone.parent)) {
      continue;
    }
    const childTransform = transforms.get(joint)!;
    const parentTransform = transforms.get(bone.parent)!;
    let widest = 0;
    for (const { child, parent } of contacts.get(joint) ?? []) {
      const a = applyPoint(childTransform, child);
      const b = applyPoint(parentTransform, parent);
      // At rest the midpoint lies half a voxel from both cells; a crack of width w puts it (1 + w) / 2 away.
      const gap = (2 * nearest([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])) / size - 1;
      widest = Math.max(widest, Math.min(CRACK_CAP, gap));
    }
    cracks.set(joint, widest);
  }
  return cracks;
};
