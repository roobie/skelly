import { Inventory } from '@skelly/engine/inventory';
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
    expect(active.length).toBeLessThanOrEqual(tuning.renderedFixtureLimit);
    expect(active.every((light) => light.position.x < 3)).toBe(true);
    pool.dispose();
  });
});
