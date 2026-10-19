import { expect, it } from 'vitest';
import type { Body } from '../src/core/body.ts';
import { evalShape } from '../src/core/sdf.ts';
import { rasterizeFeatures, voxelize, worldPosition } from '../src/core/voxelize.ts';

it.each(['in-place', 'reserve-overlaps'] as const)(
  'feature measurement omits forced marrow and joint ownership repair (%s)',
  (policy) => {
    const shape = { kind: 'ellipsoid', center: [0.2, 0.3, 0], radii: [0.06, 0.2, 0.06] } as const;
    const body: Body = {
      bones: [
        { id: 'parent', parent: null, head: [0, 0.2, 0], tail: [0, 0.3, 0] },
        { id: 'child', parent: 'parent', head: [0, 0.3, 0], tail: [0, 0.4, 0] },
      ],
      features: [
        { bone: 'parent', op: 'add', material: 'skin', shape, blend: 0 },
        {
          bone: 'parent',
          op: 'add',
          material: 'skin',
          shape: { ...shape, center: [-0.2, 0.3, 0] },
          blend: 0,
        },
        {
          bone: 'child',
          op: 'add',
          material: 'skin',
          shape: { ...shape, radii: [0.03, 0.1, 0.03] },
          blend: 0,
        },
      ],
      materials: {
        skin: { color: [0.5, 0.5, 0.5], emissive: 0 },
        bone: { color: [0.5, 0.5, 0.5], emissive: 0 },
      },
      ...(policy === 'reserve-overlaps' ? { jointAdjacencyPolicy: policy } : {}),
    };
    const size = 0.04;
    const measured = rasterizeFeatures(body, size / 4, 1);
    const game = voxelize(body, size / 4, 1);
    const [nx, ny] = measured.dims;
    expect(measured.owner.some((owner) => owner !== 0)).toBe(true);
    expect(measured.owner.some((owner) => owner === 2)).toBe(false);
    let skeletonOnlyCells = 0;
    for (let index = 0; index < measured.owner.length; index++) {
      const point = worldPosition(measured, index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny)));
      if (body.features.every((feature) => evalShape(feature.shape, point) > size)) {
        expect(measured.owner[index]).toBe(0);
        if (game.owner[index]) {
          skeletonOnlyCells += 1;
        }
      }
    }
    expect(skeletonOnlyCells).toBeGreaterThan(0);
  },
);
