import { TerrainFire } from '@skelly/presentation/internal/render/terrainFire.ts';
import { describe, expect, it } from 'vitest';

const tuning = {
  color: '#ff6a00',
  intensity: 1,
  radiusMetres: 1,
  flame: { heightMetres: 1, radiusMetres: 1 },
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
});
