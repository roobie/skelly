// Feasibility rules (PROJECT.md §2). Each checks a voxelized, rest-pose body
// and returns readable issues; none of them simulates anything. The
// generator never checks these itself — see generate.ts.

import type { Body } from './body.ts';
import type { Issue } from './issue.ts';
import type { BoneMesh } from './mesh.ts';
import { cellIndex, type Voxels, worldPosition } from './voxelize.ts';

/** Voxel-count range for a named group of bones (e.g. "head" = head + jaw). */
export interface BudgetRange {
  readonly min: number;
  readonly max: number;
}

export interface Budgets {
  readonly totalVoxels: BudgetRange;
  readonly totalTriangles: BudgetRange;
  readonly groups: Readonly<
    Record<string, { readonly bones: readonly string[]; readonly min: number; readonly max: number }>
  >;
}

export interface RuleContext {
  readonly body: Body;
  readonly voxels: Voxels;
  readonly meshes: ReadonlyMap<number, BoneMesh>;
  /** Bone ids the template counts as feet, for the `grounded` rule. */
  readonly feet: ReadonlySet<string>;
  readonly budgets: Budgets;
}

export interface Rule {
  readonly id: string;
  readonly check: (ctx: RuleContext) => Issue[];
}

const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const forEachFilled = (voxels: Voxels, fn: (i: number, j: number, k: number, idx: number) => void): void => {
  const [nx, ny, nz] = voxels.dims;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = cellIndex(voxels.dims, i, j, k);
        if (voxels.owner[idx] !== 0) {
          fn(i, j, k, idx);
        }
      }
    }
  }
};

/** First filled cell index (or -1) and the total number of filled cells. */
const countFilled = (voxels: Voxels): { readonly first: number; readonly filledCount: number } => {
  let first = -1;
  let filledCount = 0;
  for (let idx = 0; idx < voxels.owner.length; idx++) {
    if (voxels.owner[idx] !== 0) {
      filledCount += 1;
      if (first < 0) {
        first = idx;
      }
    }
  }
  return { first, filledCount };
};

/** How many filled cells are 6-neighbour-reachable from `first`. */
const floodFillCount = (voxels: Voxels, first: number): number => {
  const [nx, ny, nz] = voxels.dims;
  const visited = new Uint8Array(voxels.owner.length);
  const stack = [first];
  visited[first] = 1;
  let reached = 0;
  while (stack.length > 0) {
    const idx = stack.pop()!;
    reached += 1;
    const k = Math.floor(idx / (nx * ny));
    const j = Math.floor((idx - k * nx * ny) / nx);
    const i = idx - k * nx * ny - j * nx;
    for (const [di, dj, dk] of NEIGHBORS) {
      const ni = i + di;
      const nj = j + dj;
      const nk = k + dk;
      if (ni < 0 || ni >= nx || nj < 0 || nj >= ny || nk < 0 || nk >= nz) {
        continue;
      }
      const nidx = cellIndex(voxels.dims, ni, nj, nk);
      if (!visited[nidx] && voxels.owner[nidx] !== 0) {
        visited[nidx] = 1;
        stack.push(nidx);
      }
    }
  }
  return reached;
};

/** All filled voxels form one 6-neighbour-connected piece. */
export const floaters: Rule = {
  id: 'floaters',
  check({ voxels }) {
    const { first, filledCount } = countFilled(voxels);
    if (first < 0) {
      return [{ rule: 'floaters', message: 'The body has no filled voxels.' }];
    }
    const reached = floodFillCount(voxels, first);
    if (reached < filledCount) {
      return [{ rule: 'floaters', message: `${filledCount - reached} voxel(s) are disconnected from the main body.` }];
    }
    return [];
  },
};

/** Every bone owns at least one voxel, touching a voxel of its parent. */
export const attached: Rule = {
  id: 'attached',
  check({ body, voxels }) {
    const issues: Issue[] = [];
    const boneIndex = new Map(body.bones.map((b, i) => [b.id, i]));
    const counts = new Uint32Array(body.bones.length);
    const touchesParent = new Uint8Array(body.bones.length);
    forEachFilled(voxels, (i, j, k, idx) => {
      const owner = voxels.owner[idx]! - 1;
      counts[owner]! += 1;
      const bone = body.bones[owner]!;
      if (bone.parent === null) {
        return;
      }
      const parentIdx = boneIndex.get(bone.parent)!;
      for (const [di, dj, dk] of NEIGHBORS) {
        const ni = i + di;
        const nj = j + dj;
        const nk = k + dk;
        if (ni < 0 || ni >= voxels.dims[0] || nj < 0 || nj >= voxels.dims[1] || nk < 0 || nk >= voxels.dims[2]) {
          continue;
        }
        if (voxels.owner[cellIndex(voxels.dims, ni, nj, nk)]! - 1 === parentIdx) {
          touchesParent[owner] = 1;
          break;
        }
      }
    });
    for (const [bi, bone] of body.bones.entries()) {
      if (counts[bi] === 0) {
        issues.push({ rule: 'attached', message: `Bone "${bone.id}" owns no voxels.`, bones: [bone.id] });
      } else if (bone.parent !== null && !touchesParent[bi]) {
        issues.push({
          rule: 'attached',
          message: `Bone "${bone.id}" doesn't touch its parent "${bone.parent}".`,
          bones: [bone.id, bone.parent],
        });
      }
    }
    return issues;
  },
};

/** The lowest filled layer is on the ground (y = 0) and belongs to feet. */
export const grounded: Rule = {
  id: 'grounded',
  check({ body, voxels, feet }) {
    let minJ = Number.POSITIVE_INFINITY;
    forEachFilled(voxels, (_i, j) => {
      minJ = Math.min(minJ, j);
    });
    if (!Number.isFinite(minJ)) {
      return [{ rule: 'grounded', message: 'The body has no filled voxels.' }];
    }
    const groundY = voxels.origin[1] + minJ;
    if (groundY !== 0) {
      return [{ rule: 'grounded', message: `The lowest voxel layer is at y-index ${groundY}, not on the ground (0).` }];
    }
    const badBones = new Set<string>();
    forEachFilled(voxels, (_i, j, _k, idx) => {
      if (j !== minJ) {
        return;
      }
      const bone = body.bones[voxels.owner[idx]! - 1]!;
      if (!feet.has(bone.id)) {
        badBones.add(bone.id);
      }
    });
    if (badBones.size > 0) {
      return [
        {
          rule: 'grounded',
          message: `Ground-layer voxels belong to non-foot bone(s): ${[...badBones].join(', ')}.`,
          bones: [...badBones],
        },
      ];
    }
    return [];
  },
};

/** The centre of mass, seen from above, falls within the ground footprint (+ 1 voxel). */
export const balance: Rule = {
  id: 'balance',
  check({ voxels }) {
    let minJ = Number.POSITIVE_INFINITY;
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    forEachFilled(voxels, (i, j, k) => {
      const p = worldPosition(voxels, i, j, k);
      sumX += p[0];
      sumZ += p[2];
      count += 1;
      minJ = Math.min(minJ, j);
    });
    if (count === 0) {
      return [{ rule: 'balance', message: 'The body has no filled voxels.' }];
    }
    const comX = sumX / count;
    const comZ = sumZ / count;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    forEachFilled(voxels, (i, j, k) => {
      if (j !== minJ) {
        return;
      }
      const p = worldPosition(voxels, i, j, k);
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[2]);
      maxZ = Math.max(maxZ, p[2]);
    });
    const v = voxels.size;
    if (comX < minX - v || comX > maxX + v || comZ < minZ - v || comZ > maxZ + v) {
      return [
        {
          rule: 'balance',
          message: `Centre of mass (${comX.toFixed(3)}, ${comZ.toFixed(3)}) falls outside the ground footprint.`,
        },
      ];
    }
    return [];
  },
};

/** Total voxels, total triangles and per-group voxel counts stay within the template's budgets. */
export const budget: Rule = {
  id: 'budget',
  check({ body, voxels, meshes, budgets }) {
    const issues: Issue[] = [];
    const perBone = new Map<string, number>(body.bones.map((b) => [b.id, 0]));
    let total = 0;
    for (const o of voxels.owner) {
      if (o !== 0) {
        const bone = body.bones[o - 1]!;
        perBone.set(bone.id, perBone.get(bone.id)! + 1);
        total += 1;
      }
    }
    if (total < budgets.totalVoxels.min || total > budgets.totalVoxels.max) {
      issues.push({
        rule: 'budget',
        message: `Total voxels ${total} is outside [${budgets.totalVoxels.min}, ${budgets.totalVoxels.max}].`,
      });
    }
    let triangles = 0;
    for (const m of meshes.values()) {
      triangles += m.triangles;
    }
    if (triangles < budgets.totalTriangles.min || triangles > budgets.totalTriangles.max) {
      issues.push({
        rule: 'budget',
        message: `Total triangles ${triangles} is outside [${budgets.totalTriangles.min}, ${budgets.totalTriangles.max}].`,
      });
    }
    for (const [name, group] of Object.entries(budgets.groups)) {
      const count = group.bones.reduce((sum, id) => sum + (perBone.get(id) ?? 0), 0);
      if (count < group.min || count > group.max) {
        issues.push({
          rule: 'budget',
          message: `Group "${name}" has ${count} voxels, outside [${group.min}, ${group.max}].`,
          bones: group.bones,
        });
      }
    }
    return issues;
  },
};

export const RULES: readonly Rule[] = [floaters, attached, grounded, balance, budget];
