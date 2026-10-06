import { describe, expect, it } from 'vitest';
import { generateValid } from '../src/core/generate.ts';
import { massProperties, voxelBounds } from '../src/core/massProperties.ts';
import { templatePartMassProperties } from '../src/core/templateMass.ts';
import type { Voxels } from '../src/core/voxelize.ts';
import { SEVERABLE_PARTS, severedBoneSet } from '../src/mob/dismember.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const grid = (dims: [number, number, number], size = 0.05, origin: [number, number, number] = [0, 0, 0]): Voxels => ({
  size,
  origin,
  dims,
  owner: new Uint8Array(dims[0] * dims[1] * dims[2]).fill(1),
  color: new Uint8Array(dims[0] * dims[1] * dims[2]),
});

interface AssignedPartProof {
  readonly seed: number;
  readonly part: string;
  readonly expectedMass: number;
  readonly density: ReturnType<typeof massProperties>;
  readonly assigned: ReturnType<typeof templatePartMassProperties>;
}
const shamblerPartProofs = (): AssignedPartProof[] => {
  const template = TEMPLATES.find((candidate) => candidate.name === 'shambler')!;
  const proofs: AssignedPartProof[] = [];
  for (let seed = 1; seed <= 5; seed++) {
    const generated = generateValid(template, seed)!;
    const { body, voxels } = generated.realized;
    const byId = new Map(body.bones.map((bone, index) => [bone.id, index]));
    const allIndices = body.bones.map((_, index) => index);
    for (const part of SEVERABLE_PARTS) {
      const partIndices = [...severedBoneSet(body.bones, [part])].map((id) => byId.get(id)!);
      proofs.push({
        seed,
        part,
        expectedMass: template.bodyMassKg * template.massFractions![part]!,
        density: massProperties(voxels, partIndices, generated.genome.voxelSize),
        assigned: templatePartMassProperties({
          voxels,
          partBoneIndices: partIndices,
          bodyBoneIndices: allIndices,
          voxelSize: generated.genome.voxelSize,
          template,
          part,
        }),
      });
    }
  }
  return proofs;
};

describe('massProperties', () => {
  it('computes a 10-cube mass, centre and inertia as solid cubes', () => {
    const p = massProperties(grid([10, 10, 10], 0.05, [-4.5, 0, -4.5]), [0], 0.05);
    expect(p.mass).toBeCloseTo(125, 10);
    for (const i of [0, 1, 2]) {
      expect(Math.abs(p.center[i]! - [0, 0.25, 0][i]!)).toBeLessThan(1e-9);
    }
    const analytic = (125 * (0.5 ** 2 + 0.5 ** 2)) / 12;
    for (const i of [0, 1, 2]) {
      expect(p.inertia[i]![i]).toBeCloseTo(analytic, 2);
    }
    expect(Math.abs(p.inertia[0][1])).toBeLessThan(1e-9);
    expect(Math.abs(p.inertia[0][2])).toBeLessThan(1e-9);
    expect(Math.abs(p.inertia[1][2])).toBeLessThan(1e-9);
  });

  it('computes the principal moments of a 2×10×2 rod', () => {
    const p = massProperties(grid([2, 10, 2]), [0], 0.05);
    const [a, b, c] = [0.1, 0.5, 0.1];
    const expected = [
      (p.mass * (b * b + c * c)) / 12,
      (p.mass * (a * a + c * c)) / 12,
      (p.mass * (a * a + b * b)) / 12,
    ];
    for (const axis of [0, 1, 2]) {
      expect(Math.abs(p.inertia[axis]![axis]! / expected[axis]! - 1)).toBeLessThan(0.01);
    }
    expect(p.inertia[1][1]).toBeLessThan(p.inertia[0][0]);
    expect(p.inertia[1][1]).toBeLessThan(p.inertia[2][2]);
  });

  it('assigns every shambler severable part its template mass for seeds 1–5', () => {
    const proofs = shamblerPartProofs();
    const expected = [0.42, 0.42, 1.54, 1.54, 3.5, 3.5, 5.67];
    for (let seed = 1; seed <= 5; seed++) {
      const masses = proofs.filter((proof) => proof.seed === seed).map((proof) => proof.assigned.mass);
      expect(masses).toHaveLength(expected.length);
      for (let index = 0; index < expected.length; index++) {
        expect(Math.abs(masses[index]! / expected[index]! - 1)).toBeLessThan(1e-9);
      }
    }
  });

  it('keeps template-assigned part COM equal to density-derived COM', () => {
    for (const { assigned, density } of shamblerPartProofs()) {
      for (const axis of [0, 1, 2]) {
        expect(Math.abs(assigned.center[axis]! - density.center[axis]!)).toBeLessThan(1e-9);
      }
    }
  });

  it('scales the density-derived part inertia by its assigned mass ratio', () => {
    for (const { assigned, density } of shamblerPartProofs()) {
      for (const row of [0, 1, 2]) {
        for (const column of [0, 1, 2]) {
          const expected = density.inertia[row]![column]! * (assigned.mass / density.mass);
          const error = Math.abs(assigned.inertia[row]![column]! - expected);
          expect(error).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(expected), 1e-30));
        }
      }
    }
  });

  it('keeps authored body mass and severing fractions physically usable', () => {
    for (const template of TEMPLATES) {
      expect(template.bodyMassKg).toBeGreaterThan(0);
      const fractions = Object.values(template.massFractions ?? {});
      expect(fractions.every((fraction) => Number.isFinite(fraction) && fraction > 0 && fraction < 1)).toBe(true);
      expect(fractions.reduce((total, fraction) => total + fraction, 0)).toBeLessThan(1);
    }
  });

  it('uses body voxel-volume shares when a template has no part overrides', () => {
    const toy = grid([3, 1, 1]);
    toy.owner.set([1, 1, 2]);
    const assignment = { bodyMassKg: 12 };
    const first = templatePartMassProperties({
      voxels: toy,
      partBoneIndices: [0],
      bodyBoneIndices: [0, 1],
      voxelSize: 0.05,
      template: assignment,
      part: 'first',
    });
    const second = templatePartMassProperties({
      voxels: toy,
      partBoneIndices: [1],
      bodyBoneIndices: [0, 1],
      voxelSize: 0.05,
      template: assignment,
      part: 'second',
    });
    expect(first.fraction).toBeCloseTo(2 / 3, 12);
    expect(second.fraction).toBeCloseTo(1 / 3, 12);
    expect(Math.abs(first.fraction + second.fraction - 1)).toBeLessThan(1e-9);
  });

  it('builds eight COM-relative corners around the selected voxel AABB', () => {
    const bounds = voxelBounds(grid([2, 10, 2]), [0], [0.025, 0.25, 0.025]);
    expect(bounds.halfExtents).toEqual([0.05, 0.25, 0.05]);
    expect(bounds.corners).toHaveLength(8);
    for (const corner of bounds.corners) {
      expect(Math.abs(Math.abs(corner[0]) - 0.05)).toBeLessThan(1e-12);
      expect(Math.abs(Math.abs(corner[1]) - 0.25)).toBeLessThan(1e-12);
      expect(Math.abs(Math.abs(corner[2]) - 0.05)).toBeLessThan(1e-12);
    }
  });
});
