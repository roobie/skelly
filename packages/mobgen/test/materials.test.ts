import { expect, it } from 'vitest';
import type { Body } from '../src/core/body.ts';
import { evalShape } from '../src/core/sdf.ts';
import { materialOf, type Voxels, voxelize, worldPosition } from '../src/core/voxelize.ts';
import { vertexColors } from '../src/viewer/scene.ts';

const fixture: Body = {
  bones: [{ id: 'root', parent: null, head: [0, 0.1, 0], tail: [0, 0.4, 0] }],
  features: [
    {
      bone: 'root',
      op: 'add',
      material: 'new-material',
      shape: { kind: 'capsule', a: [0, 0.1, 0], b: [0, 0.4, 0], ra: 0.08, rb: 0.08 },
    },
  ],
  materials: {
    'new-material': { color: [0.3, 0.6, 0.9], emissive: 1 },
    bone: { color: [0.7, 0.7, 0.5], emissive: 0 },
  },
};

const filled = (voxels: Voxels): Set<string> => {
  const [nx, ny] = voxels.dims;
  return new Set(
    [...voxels.owner.entries()]
      .filter(([, owner]) => owner !== 0)
      .map(([index]) =>
        worldPosition(voxels, index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny))).join(','),
      ),
  );
};

it('content-declared materials round-trip independently of table order without a code whitelist', () => {
  const rendered: Float32Array[] = [];
  for (const materials of [fixture.materials, Object.fromEntries(Object.entries(fixture.materials).reverse())]) {
    const voxels = voxelize({ ...fixture, materials }, 0.03, 1);
    const cells = [...voxels.owner.entries()].filter(([, owner]) => owner !== 0);
    expect(cells.length).toBeGreaterThan(0);
    for (const [index] of cells) {
      expect(materialOf(voxels, voxels.color[index]!)).toBe('new-material');
    }
    rendered.push(vertexColors(Uint8Array.from(cells.map(([index]) => voxels.color[index]!)), materials, voxels));
  }
  expect(rendered[1]).toEqual(rendered[0]);
});

it.each(['root', 'inset'])(
  'material-scoped carves preserve another material inset owned by %s while removing targeted flesh',
  (insetBone) => {
    const inset = { kind: 'ellipsoid', center: [0.07, 0.25, 0], radii: [0.06, 0.06, 0.06] } as const;
    const body: Body = {
      ...fixture,
      bones:
        insetBone === 'root'
          ? fixture.bones
          : [...fixture.bones, { id: insetBone, parent: 'root', head: inset.center, tail: inset.center }],
      features: [
        ...fixture.features,
        { bone: insetBone, op: 'add', material: 'bone', shape: inset },
        {
          bone: 'root',
          op: 'carve',
          material: 'new-material',
          onto: ['new-material'],
          shape: { kind: 'box', center: [0.07, 0.25, 0], half: [0.15, 0.08, 0.1], round: 0 },
        },
      ],
    };
    const voxels = voxelize(body, 0.03, 1);
    const [nx, ny] = voxels.dims;
    let protectedCells = 0;
    let removedCells = 0;
    for (let index = 0; index < voxels.owner.length; index++) {
      const point = worldPosition(voxels, index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny)));
      if (evalShape(inset, point) <= 0) {
        protectedCells += 1;
        expect(voxels.owner[index]).not.toBe(0);
      } else if (
        evalShape(inset, point) > voxels.size &&
        evalShape(body.features[0]!.shape, point) <= 0 &&
        evalShape(body.features[2]!.shape, point) <= 0 &&
        Math.abs(point[0]) >= voxels.size
      ) {
        removedCells += 1;
        expect(voxels.owner[index]).toBe(0);
      }
    }
    expect(protectedCells).toBeGreaterThan(0);
    expect(removedCells).toBeGreaterThan(0);
  },
);

it('noise gates control carves before they can remove flesh', () => {
  const carve = {
    bone: 'root',
    op: 'carve',
    material: 'new-material',
    shape: { kind: 'box', center: [0, 0.25, 0], half: [0.5, 0.5, 0.5], round: 0 },
  } as const;
  const baseline = voxelize(fixture, 0.03, 1);
  const gated = (threshold: number) =>
    voxelize({ ...fixture, features: [...fixture.features, { ...carve, noise: { scale: 0.09, threshold } }] }, 0.03, 1);
  expect(filled(baseline).size).toBeGreaterThan(0);
  expect(filled(gated(0))).toEqual(filled(baseline));
  expect(filled(gated(1)).size).toBeLessThan(filled(baseline).size);
  const partial = filled(gated(0.5));
  expect(partial.size).toBeGreaterThan(filled(gated(1)).size);
  expect(partial.size).toBeLessThan(filled(baseline).size);
});

it('scoped carves preserve blended non-target fields rather than only isolated primitives', () => {
  const adds: Body['features'] = [-1, 1].map((sign) => ({
    bone: 'root',
    op: 'add',
    material: 'bone',
    blend: 0.08,
    shape: { kind: 'ellipsoid', center: [sign * 0.06, 0.25, 0], radii: [0.05, 0.05, 0.05] },
  }));
  const carve = {
    bone: 'root',
    op: 'carve',
    material: 'new-material',
    shape: { kind: 'box', center: [0, 0.25, 0], half: [0.5, 0.5, 0.5], round: 0 },
  } as const;
  const protectedField = voxelize({ ...fixture, features: adds }, 0.03, 1);
  expect(filled(protectedField).size).toBeGreaterThan(0);
  const preserved = voxelize(
    { ...fixture, features: [...fixture.features, ...adds, { ...carve, onto: ['new-material'] }] },
    0.03,
    1,
  );
  expect(filled(preserved)).toEqual(filled(protectedField));
  const removed = voxelize({ ...fixture, features: [...adds, { ...carve, onto: ['bone'] }] }, 0.03, 1);
  expect(filled(removed).size).toBeLessThan(filled(protectedField).size);
});

it('undeclared features, targets and marrow materials fail before voxelization', () => {
  expect(() => voxelize({ ...fixture, materials: { bone: fixture.materials.bone! } }, 0.03, 1)).toThrow(
    'undeclared material',
  );
  expect(() =>
    voxelize(
      {
        ...fixture,
        features: [...fixture.features, { ...fixture.features[0]!, op: 'paint', onto: ['missing-target'] }],
      },
      0.03,
      1,
    ),
  ).toThrow('undeclared material');
  expect(() => voxelize({ ...fixture, bones: [{ ...fixture.bones[0]!, marrowMaterial: 'missing' }] }, 0.03, 1)).toThrow(
    'undeclared material',
  );
});

it('forced marrow uses its explicit material when flesh is omitted, never a skin fallback', () => {
  const marrow = { id: 'marrow', parent: 'root', head: [0, 0.2, 0], tail: [0, 0.3, 0] } as const;
  expect(() => voxelize({ ...fixture, bones: [...fixture.bones, marrow] }, 0.03, 1)).toThrow(
    'no add or marrow material',
  );
  const voxels = voxelize(
    { ...fixture, bones: [...fixture.bones, { ...marrow, marrowMaterial: 'new-material' }] },
    0.03,
    1,
  );
  expect(voxels.owner.some(Boolean)).toBe(true);
  for (const [index, owner] of voxels.owner.entries()) {
    if (owner) {
      expect(materialOf(voxels, voxels.color[index]!)).toBe('new-material');
    }
  }
});
