import { describe, expect, it } from 'vitest';
import type { Bone } from '../src/core/body.ts';
import { lodCompatibilityIssues } from '../src/core/lodCompatibility.ts';

const bones: readonly Bone[] = [
  { id: 'root', parent: null, head: [0, 0, 0], tail: [0, 1, 0] },
  { id: 'limb', parent: 'root', head: [0, 1, 0], tail: [0, 2, 0] },
];
const mesh = (neighbour: number) => ({
  indices: new Uint32Array([0, 1, 2]),
  neighbourBone: new Int32Array([neighbour]),
});
const geometry = () => ({
  body: { bones },
  meshes: new Map([
    [0, mesh(1)],
    [1, mesh(0)],
  ]),
});

describe('shared-skeleton LOD admission', () => {
  it('rejects loss of an intact reference part', () => {
    const reference = geometry();
    const coarse = geometry();
    coarse.meshes.delete(1);
    expect(lodCompatibilityIssues(reference, coarse)).toContainEqual({ kind: 'missing-part', bone: 'limb' });
  });

  it('rejects loss of the reference joint face needed for a severing stump', () => {
    const reference = geometry();
    const coarse = geometry();
    coarse.meshes.set(0, mesh(-1));
    coarse.meshes.set(1, mesh(-1));
    expect(lodCompatibilityIssues(reference, coarse)).toEqual([{ kind: 'disconnected-joint', bone: 'limb' }]);
  });

  it('rejects a rest-space shift even with matching bone IDs and topology', () => {
    const reference = geometry();
    const coarse = { ...geometry(), body: { bones: bones.map((bone) => ({ ...bone, head: [1, 1, 1] as const })) } };
    expect(lodCompatibilityIssues(reference, coarse).every((issue) => issue.kind === 'skeleton')).toBe(true);
    expect(lodCompatibilityIssues(reference, coarse).length).toBeGreaterThan(0);
  });

  it('allows an already absent reference part without inventing tissue', () => {
    const reference = geometry();
    reference.meshes.delete(1);
    reference.meshes.set(0, mesh(-1));
    expect(lodCompatibilityIssues(reference, reference)).toEqual([]);
  });

  it('accepts unchanged part ownership and joint faces', () => {
    expect(lodCompatibilityIssues(geometry(), geometry())).toEqual([]);
  });
});
