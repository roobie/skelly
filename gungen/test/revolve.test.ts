import { describe, expect, it } from 'vitest';
import { meshForRevolved } from '../src/core/revolve.ts';
import type { RevolvedSolid } from '../src/core/schema.ts';

const solid = (profile: RevolvedSolid['profile']): RevolvedSolid => ({ id: 't', kind: 'revolved', profile });

// A closed cylinder with a gently tapering nose: the base-to-side corner is a right angle, the side-to-nose
// bend is 6 degrees.
const bullet = solid([
  [0, 0],
  [0, 1],
  [2, 1],
  [3, 0.9],
  [3, 0],
]);

/** Normals of the vertices at one profile point (axial position) on the +X meridian, one per segment that owns it. */
const normalsAt = (mesh: ReturnType<typeof meshForRevolved>, axial: number): number[][] => {
  const found: number[][] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (
      Math.abs(mesh.positions[i + 2]! - axial) < 1e-6 &&
      Math.abs(mesh.positions[i + 1]!) < 1e-6 &&
      mesh.positions[i]! > 0
    ) {
      found.push([...mesh.normals.slice(i, i + 3)]);
    }
  }
  return found;
};

describe('revolved solid mesh', () => {
  // Odd and even counts, the low end the viewer uses at a distance and the close-up count.
  it.each([5, 6, 24])('winds every triangle outward and keeps normals unit length at %i facets', (facets) => {
    const mesh = meshForRevolved(bullet, facets);
    expect(mesh.triangleCount).toBeGreaterThan(0);
    for (let t = 0; t < mesh.triangleCount; t++) {
      const [a, b, c] = [0, 1, 2].map((k) => mesh.indices[t * 3 + k]! * 3) as [number, number, number];
      const p = (i: number) => [mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!] as const;
      const [pa, pb, pc] = [p(a), p(b), p(c)];
      const e1 = pb.map((v, k) => v - pa[k]!);
      const e2 = pc.map((v, k) => v - pa[k]!);
      const geometric = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const shading = [0, 1, 2].map((k) => mesh.normals[a + k]!);
      expect(geometric[0]! * shading[0]! + geometric[1]! * shading[1]! + geometric[2]! * shading[2]!).toBeGreaterThan(
        0,
      );
    }
    for (let i = 0; i < mesh.normals.length; i += 3) {
      expect(Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!)).toBeCloseTo(1, 5);
    }
  });

  it('keeps a sharp profile corner hard and smooths a gentle bend', () => {
    const mesh = meshForRevolved(bullet, 6);
    // At the rim edge (axial 0, radius 1) the base disc faces -Z and the side faces outward: two different normals.
    const hard = normalsAt(mesh, 0);
    expect(hard.some((n) => Math.abs(n[2]!) === 1)).toBe(true);
    expect(hard.some((n) => Math.abs(n[2]!) === 0)).toBe(true);
    // The 6 degree bend at axial 2 shares one averaged normal between the two segments that meet there.
    const gentle = normalsAt(mesh, 2);
    expect(gentle).toHaveLength(2);
    for (let k = 0; k < 3; k++) {
      expect(gentle[0]![k]).toBeCloseTo(gentle[1]![k]!, 6);
    }
  });
});
