import type { Body, Bone } from './body.ts';
import type { BoneMesh } from './mesh.ts';

interface LodGeometry {
  readonly body: Pick<Body, 'bones'>;
  readonly meshes: ReadonlyMap<number, Pick<BoneMesh, 'indices' | 'neighbourBone'>>;
}

export interface LodCompatibilityIssue {
  readonly kind: 'skeleton' | 'missing-part' | 'disconnected-joint';
  readonly bone: string;
}

const sameVector = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const sameRestBone = (a: Bone, b: Bone | undefined): boolean =>
  b !== undefined &&
  a.id === b.id &&
  a.parent === b.parent &&
  sameVector(a.head, b.head) &&
  sameVector(a.tail, b.tail) &&
  (a.frame === undefined
    ? b.frame === undefined
    : b.frame !== undefined &&
      sameVector(a.frame.x, b.frame.x) &&
      sameVector(a.frame.y, b.frame.y) &&
      sameVector(a.frame.z, b.frame.z));

const hasPart = (geometry: LodGeometry, index: number): boolean =>
  (geometry.meshes.get(index)?.indices.length ?? 0) > 0;

const touches = (geometry: LodGeometry, child: number, parent: number): boolean =>
  (geometry.meshes.get(child)?.neighbourBone.includes(parent) ?? false) ||
  (geometry.meshes.get(parent)?.neighbourBone.includes(child) ?? false);

/** Shared, unremapped pose rows require the same rest skeleton. Preserve reference-owned parts and
 * joint faces: a surviving part must still expose its stump when its neighbour is severed. */
export const lodCompatibilityIssues = (reference: LodGeometry, coarse: LodGeometry): LodCompatibilityIssue[] => {
  const issues: LodCompatibilityIssue[] = [];
  const { bones } = reference.body;
  if (bones.length !== coarse.body.bones.length) {
    issues.push({ kind: 'skeleton', bone: '<skeleton>' });
  }
  const indices = new Map(bones.map((bone, index) => [bone.id, index]));
  for (const [index, bone] of bones.entries()) {
    if (!sameRestBone(bone, coarse.body.bones[index])) {
      issues.push({ kind: 'skeleton', bone: bone.id });
    }
    if (hasPart(reference, index) && !hasPart(coarse, index)) {
      issues.push({ kind: 'missing-part', bone: bone.id });
    }
    const parent = bone.parent === null ? undefined : indices.get(bone.parent);
    if (parent !== undefined && touches(reference, index, parent) && !touches(coarse, index, parent)) {
      issues.push({ kind: 'disconnected-joint', bone: bone.id });
    }
  }
  return issues;
};
