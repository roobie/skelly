import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import type { FurnitureDef, Registry } from '../src/core/content.ts';

const shape = [{ position: [0, 0, 0] as [number, number, number], size: [2, 4, 1] as [number, number, number] }];
const door = { handlingSimSeconds: 0.3 };
const defs = [
  { id: 'shaped_leaf', size: [2, 4, 1], door, shape },
  { id: 'body_front', size: [2, 4, 1], door, shape, container: { pockets: [] } },
] as unknown as FurnitureDef[];
const entities = new BlockEntities({ furniture: new Map(defs.map((def) => [def.id, def])) } as unknown as Registry);

const opened = (type: string, z: number) => {
  const entity = entities.add({ type, pos: [0, 0, z], size: [2, 4, 1], facing: 'n' })!;
  expect(entities.isSolid(0, 0, z)).toBe(true);
  entities.setOpen(entity, true);
  return entity;
};

describe('opened doors', () => {
  it('lets a body through a shaped door leaf that is not a container front', () => {
    const leaf = opened('shaped_leaf', 0);
    expect(leaf.open).toBe(true);
    expect(entities.isSolid(0, 0, 0)).toBe(false);
    expect(entities.isSolid(1, 3, 0)).toBe(false);
  });

  it('keeps the body of a container front solid when it is open', () => {
    opened('body_front', 4);
    expect(entities.isSolid(0, 0, 4)).toBe(true);
  });
});
