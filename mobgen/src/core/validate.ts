import type { Body } from './body.ts';
import type { Issue } from './issue.ts';
import type { BoneMesh } from './mesh.ts';
import { RULES, type RuleContext } from './rules.ts';
import type { Voxels } from './voxelize.ts';

export interface Stats {
  readonly voxels: number;
  readonly triangles: number;
  readonly perBoneVoxels: Readonly<Record<string, number>>;
}

export interface Report {
  readonly issues: readonly Issue[];
  readonly ok: boolean;
  readonly stats: Stats;
}

const statsOf = (body: Body, voxels: Voxels, meshes: ReadonlyMap<number, BoneMesh>): Stats => {
  const perBoneVoxels: Record<string, number> = {};
  for (const bone of body.bones) {
    perBoneVoxels[bone.id] = 0;
  }
  for (const o of voxels.owner) {
    if (o !== 0) {
      const { id } = body.bones[o - 1]!;
      perBoneVoxels[id] = (perBoneVoxels[id] ?? 0) + 1;
    }
  }
  let triangles = 0;
  for (const m of meshes.values()) {
    triangles += m.triangles;
  }
  const voxelCount = Object.values(perBoneVoxels).reduce((sum, n) => sum + n, 0);
  return { voxels: voxelCount, triangles, perBoneVoxels };
};

/** Takes a RuleContext directly (rather than its five fields separately) so the rules and the
 * report are built from exactly the same bundle — see rules.ts. */
export const validate = (ctx: RuleContext): Report => {
  const issues = RULES.flatMap((rule) => rule.check(ctx));
  return { issues, ok: issues.length === 0, stats: statsOf(ctx.body, ctx.voxels, ctx.meshes) };
};
