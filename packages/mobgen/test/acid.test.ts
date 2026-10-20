import { expect, it } from 'vitest';
import type { Body } from '../src/core/body.ts';
import { build, generate, generateValid } from '../src/core/generate.ts';
import { cross, dot, length } from '../src/core/math.ts';
import { aabbOf, evalShape, topOf, union } from '../src/core/sdf.ts';
import { type Genome, type ParamSpec, registerTemplate } from '../src/core/template.ts';
import { acidTemplate } from '../src/mob/acidTemplate.ts';
import { shambler } from '../src/mob/templates.ts';

const rangeOf = (spec: ParamSpec | undefined) => {
  if (spec === undefined || typeof spec === 'number' || !('min' in spec)) {
    throw new Error('covering-array factor must have an authored numeric range');
  }
  return spec;
};

const centered = (key: 'headPitch' | 'headRoll') => {
  const range = rangeOf(acidTemplate.params[key]);
  return (range.min + range.max) / 2;
};

// Binary linear columns cover endpoint pairs; upright extensions exercise the interior skeletal maximum.
const factors = ['height', 'breadth', 'legFrac', 'hunch', 'headRoll', 'headPitch', 'kneeBend', 'headH'] as const;
const endpointRows = Array.from({ length: 16 }, (_, row) =>
  Object.fromEntries(
    factors.map((key, index) => {
      const range = rangeOf(acidTemplate.params[key]);
      let bits = row & (index + 1);
      let parity = 0;
      while (bits !== 0) {
        parity ^= bits & 1;
        bits >>>= 1;
      }
      return [key, parity === 0 ? range.min : range.max];
    }),
  ),
);
const headHeightRange = rangeOf(acidTemplate.params.headH);
const rows = [
  ...endpointRows,
  ...[headHeightRange.min, headHeightRange.max].map((headH, index) => ({
    ...endpointRows[index === 0 ? 0 : endpointRows.length - 1]!,
    headH,
    headPitch: centered('headPitch'),
    headRoll: centered('headRoll'),
  })),
];
const standingTop = (body: Body) =>
  Math.max(
    ...body.features.filter((feature) => feature.op === 'add').map((feature) => topOf(feature.shape)),
    ...body.bones.flatMap((bone) => [bone.head[1], bone.tail[1]]),
  );
const breadthOf = (body: Body) => {
  const bounds = union(body.features.filter((feature) => feature.op === 'add').map((feature) => aabbOf(feature.shape)));
  return bounds.max[0] - bounds.min[0];
};

it('acid draws height and voxel size from the shambler content rather than a copied range', () => {
  expect(acidTemplate.params.height).toBe(shambler.params.height);
  expect(acidTemplate.voxelSize).toBe(shambler.voxelSize);
});

it('an upright head at minimum head height fits its skeletal tip inside the drawn standing height', () => {
  const source = generate(acidTemplate, 1);
  const genome: Genome = {
    ...source,
    params: {
      ...source.params,
      headPitch: centered('headPitch'),
      headRoll: centered('headRoll'),
      headH: rangeOf(acidTemplate.params.headH).min,
    },
  };
  expect(standingTop(build(genome))).toBeCloseTo(genome.params.height!, 10);
});

it.each(rows.map((params, index) => ({ params, index })))(
  'acid covering row $index preserves height, identity floors and an owned framed rig',
  ({ params, index }) => {
    const fixture = {
      ...acidTemplate,
      name: `acid-covering-fixture-${index}`,
      params: { ...acidTemplate.params, ...params },
    };
    registerTemplate(fixture);
    const result = generateValid(fixture, index + 1);
    expect(result).toBeDefined();
    const { genome, realized } = result!;
    expect(realized.report.issues).toEqual([]);
    const height = genome.params.height!;
    const referenceRange = rangeOf(shambler.params.height);
    expect(height).toBeGreaterThanOrEqual(referenceRange.min);
    expect(height).toBeLessThanOrEqual(referenceRange.max);
    expect(standingTop(realized.body)).toBeCloseTo(height, 10);
    const [nx, ny] = realized.voxels.dims;
    let voxelTop = Number.NEGATIVE_INFINITY;
    realized.voxels.owner.forEach((owner, cell) => {
      if (owner !== 0) {
        voxelTop = Math.max(
          voxelTop,
          ((Math.floor(cell / nx) % ny) + realized.voxels.origin[1] + 1) * realized.voxels.size,
        );
      }
    });
    expect(Math.abs(voxelTop - height)).toBeLessThanOrEqual(realized.voxels.size);
    for (const group of Object.values(fixture.budgets.groups)) {
      const amount = Object.entries(realized.report.stats.perBoneVoxels)
        .filter(([id]) =>
          group.bones.some((pattern) => (pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern)),
        )
        .reduce((sum, [, value]) => sum + value, 0);
      expect(amount).toBeGreaterThan(0);
      expect(amount).toBeGreaterThanOrEqual(group.min);
      if (group.minFraction !== undefined) {
        expect(amount / realized.report.stats.voxels).toBeGreaterThanOrEqual(group.minFraction);
      }
    }
    const breadthRange = rangeOf(acidTemplate.params.breadth);
    const narrow = build({ ...genome, params: { ...genome.params, breadth: breadthRange.min } });
    const wide = build({ ...genome, params: { ...genome.params, breadth: breadthRange.max } });
    expect(standingTop(narrow)).toBeCloseTo(height, 10);
    expect(standingTop(wide)).toBeCloseTo(height, 10);
    expect(breadthOf(wide)).toBeGreaterThan(breadthOf(narrow));
    for (const bone of realized.body.bones) {
      expect(realized.report.stats.perBoneVoxels[bone.id]).toBeGreaterThan(0);
      expect(bone.frame).toBeDefined();
      expect(bone.limits).toBeDefined();
      expect(bone.disposition).toBeDefined();
      const { x, y, z } = bone.frame!;
      for (const axis of [x, y, z]) {
        expect(length(axis)).toBeCloseTo(1);
      }
      expect(dot(x, y)).toBeCloseTo(0);
      expect(dot(x, z)).toBeCloseTo(0);
      expect(dot(y, z)).toBeCloseTo(0);
      expect(dot(cross(x, y), z)).toBeCloseTo(1);
    }
    const sacs = realized.body.features.filter((feature) => feature.op === 'add' && feature.bone.startsWith('sac.'));
    const drool = realized.body.bones.filter((bone) => bone.id.startsWith('drool.'));
    expect(sacs.length).toBeGreaterThan(0);
    expect(drool.length).toBeGreaterThan(0);
    for (const bone of drool) {
      for (const sac of sacs) {
        expect(evalShape(sac.shape, bone.head)).toBeGreaterThanOrEqual(-Number.EPSILON);
        expect(evalShape(sac.shape, bone.tail)).toBeGreaterThanOrEqual(-Number.EPSILON);
      }
    }
  },
);
