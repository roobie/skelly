import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { worldSolid } from '../src/core/collision.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { World } from '../src/core/world.ts';
import { describeLookedAt, type LookedAtWorld } from '../src/debug/lookedAt.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);

const BLOCK_SIZE = 0.5;
/** In blocks; the block under the crosshair is 4 blocks (2 m) away along +x. */
const EYE: Vec3 = [1, 1.5, 0.5];
const EAST: Vec3 = [1, 0, 0];

const makeWorld = () => {
  const world = new World();
  const entities = new BlockEntities(registry);
  const looked: LookedAtWorld = {
    world,
    registry,
    entities,
    isSolid: worldSolid(world, registry, entities),
    blockSize: BLOCK_SIZE,
  };
  return { world, entities, looked };
};

describe('debug looked-at readout', () => {
  it('names a block by id, name, authored colour, block coordinates and distance in metres', () => {
    const { world, looked } = makeWorld();
    world.setBlock(5, 1, 0, registry.blockIds.get('siding_red')!);
    expect(describeLookedAt(looked, EYE, EAST)).toBe(
      'siding_red · Painted siding (faded red) · #8f4b4b · block 5,1,0 · 2.0 m',
    );
  });

  it('names a container and a door by their furniture definitions', () => {
    const crate = makeWorld();
    crate.entities.add({ type: 'crate', pos: [5, 1, 0], size: [2, 2, 2], facing: 'n' });
    expect(describeLookedAt(crate.looked, EYE, EAST)).toBe('crate · Crate · container · block 5,1,0 · 2.0 m');

    const door = makeWorld();
    door.entities.add({ type: 'wood_door', pos: [5, 1, 0], size: [1, 4, 2], facing: 'w' });
    expect(describeLookedAt(door.looked, EYE, EAST)).toBe(
      'wood_door · Wooden door · door (closed) · block 5,1,0 · 2.0 m',
    );
  });

  it('prefers whichever is nearer when furniture stands in front of a block', () => {
    const { world, entities, looked } = makeWorld();
    world.setBlock(9, 1, 0, registry.blockIds.get('brick')!);
    entities.add({ type: 'crate', pos: [5, 1, 0], size: [2, 2, 2], facing: 'n' });
    expect(describeLookedAt(looked, EYE, EAST)).toContain('crate · Crate');
    expect(describeLookedAt(looked, [8, 1.5, 0.5], EAST)).toContain('brick · Brick');
  });

  it('says nothing for open air or anything beyond 16 m', () => {
    const { world, looked } = makeWorld();
    expect(describeLookedAt(looked, EYE, EAST)).toBe('');
    world.setBlock(40, 1, 0, registry.blockIds.get('brick')!);
    expect(describeLookedAt(looked, EYE, EAST)).toBe('');
  });
});
