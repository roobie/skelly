import { TerrainFire } from '@skelly/presentation/internal/render/terrainFire.ts';
import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';

const tuning = {
  color: '#ff6a00',
  intensity: 1,
  radiusMetres: 1,
  flame: { coreColor: '#fff', heightMetres: 1, opacity: 0.8, radiusMetres: 1, tipColor: '#f00' },
};

describe('terrain fire view', () => {
  it('draws each exposed face of burning cells and removes them after burn-out', () => {
    const fire = new TerrainFire();
    const cells = [[0, 0, 0] as const];
    fire.sync(cells, (_x, y, _z) => y < 0, 1, tuning);
    expect(fire.group.children).toHaveLength(5);
    expect(fire.lights()).toHaveLength(1);

    fire.sync([], () => false, 1, tuning);
    expect(fire.group.children).toHaveLength(0);
    expect(fire.lights()).toEqual([]);
    fire.dispose();
  });

  it('rests each flame base on its exposed face', () => {
    const fire = new TerrainFire();
    const cell = [4, 7, 2] as const;
    const exposedFaces: [number, number, number][] = [];
    const blockSize = 0.5;
    fire.sync(
      [cell],
      (x, y, z) => {
        exposedFaces.push([x - cell[0], y - cell[1], z - cell[2]]);
        return false;
      },
      blockSize,
      tuning,
    );

    for (const [index, flame] of fire.group.children.entries()) {
      const face = exposedFaces[index]!;
      const facePlane = (cell[1] + 0.5 + face[1]! * 0.5) * blockSize;
      expect(new Box3().setFromObject(flame).min.y).toBeCloseTo(facePlane);
    }
    fire.dispose();
  });
});
