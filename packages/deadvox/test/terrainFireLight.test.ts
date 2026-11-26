import { Inventory } from '@skelly/engine/inventory';
import { TerrainFire } from '@skelly/presentation/internal/render/terrainFire.ts';
import { LightPool } from '@skelly/presentation/render';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

const tuning = { heldLamps: 1, droppedLamps: 1, renderedFixtureLimit: 2 };

describe('terrain fire light pool', () => {
  it('keeps burning-cell light within the shared fixture partition', () => {
    const pool = new LightPool(new Scene(), tuning);
    const camera = new PerspectiveCamera();
    pool.update(new Inventory(baseRegistry()), {
      camera,
      held: { lightPositionOf: () => false },
      blockSize: 1,
      daylightScale: 1,
      fires: [
        { position: [1, 0, 0], color: '#ffffff', intensity: 1, radiusMetres: 1 },
        { position: [2, 0, 0], color: '#ffffff', intensity: 1, radiusMetres: 1 },
        { position: [3, 0, 0], color: '#ffffff', intensity: 1, radiusMetres: 1 },
      ],
    });
    const active = pool.lights.slice(pool.itemSlots).filter(({ intensity }) => intensity > 0);
    expect(active).toHaveLength(tuning.renderedFixtureLimit);
    expect(active.map(({ position }) => position.x)).toEqual([1, 2]);
    pool.dispose();
  });

  it('uses one pooled light at the centre of a connected burning cluster', () => {
    const fire = new TerrainFire();
    fire.sync(
      [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ],
      () => false,
      1,
      { color: '#ffffff', intensity: 1, radiusMetres: 1, flame: { heightMetres: 1, radiusMetres: 1 } },
    );
    const pool = new LightPool(new Scene(), tuning);
    pool.update(new Inventory(baseRegistry()), {
      camera: new PerspectiveCamera(),
      held: { lightPositionOf: () => false },
      blockSize: 1,
      daylightScale: 1,
      fires: fire.lights(),
    });
    const active = pool.lights.slice(pool.itemSlots).filter(({ intensity }) => intensity > 0);
    expect(active).toHaveLength(1);
    expect(active[0]!.position.x).toBe(1.5);
    pool.dispose();
    fire.dispose();
  });
});
