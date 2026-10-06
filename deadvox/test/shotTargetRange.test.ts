import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { crosshairTarget } from '../src/core/crosshairTarget.ts';
import type { Registry } from '../src/core/content.ts';
import type { World } from '../src/core/world.ts';

const fixtureRegistry = (): Registry =>
  ({
    blocks: [{ id: 'air' }, { id: 'stone' }],
    furniture: new Map([
      ['target', { id: 'target', name: 'Target', size: [4, 2, 2], solid: true }],
    ]),
  }) as unknown as Registry;

describe('debug crosshair target range', () => {
  it('measures to the selected furniture surface along the crosshair ray', () => {
    const registry = fixtureRegistry();
    const entities = new BlockEntities(registry);
    entities.add({ type: 'target', pos: [2, 0, 0], size: [4, 2, 2], facing: 'n' });
    const target = crosshairTarget(
      {
        world: { getBlock: () => 0 } as Pick<World, 'getBlock'>,
        registry,
        entities,
        isSolid: () => false,
        blockSize: 0.5,
      },
      [0.6, 1, 1],
      [1, 0, 0],
      10,
    );
    expect(target?.distanceBlocks).toBeCloseTo(1.4);
    expect(target?.distanceMetres).toBeCloseTo(0.7);
    expect(target?.point).toEqual([2, 1, 1]);
  });

  it('measures to a solid block when no furniture lies under the crosshair', () => {
    const registry = fixtureRegistry();
    const entities = new BlockEntities(registry);
    const target = crosshairTarget(
      {
        world: { getBlock: (x: number) => (x === 2 ? 1 : 0) } as Pick<World, 'getBlock'>,
        registry,
        entities,
        isSolid: (x: number) => x === 2,
        blockSize: 0.5,
      },
      [0.5, 0.5, 0.5],
      [1, 0, 0],
      10,
    );
    expect(target?.distanceBlocks).toBe(1.5);
    expect(target?.distanceMetres).toBeCloseTo(0.75);
    expect(target?.point).toEqual([2, 0.5, 0.5]);
  });

  it('has no target range when the crosshair ray hits no solid geometry', () => {
    const registry = fixtureRegistry();
    const target = crosshairTarget(
      {
        world: { getBlock: () => 0 } as Pick<World, 'getBlock'>,
        registry,
        entities: new BlockEntities(registry),
        isSolid: () => false,
        blockSize: 0.5,
      },
      [0, 1, 1],
      [1, 0, 0],
      10,
    );
    expect(target).toBeUndefined();
  });
});
