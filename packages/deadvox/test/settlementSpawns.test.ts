import { expect, it } from 'vitest';
import { settlementActorSpawns } from '../src/core/settlementSpawns.ts';
import { baseRegistry } from './baseRegistry.ts';

it('applies type rarity to settlement markers and excludes zero-weight wanderers', () => {
  const road = { x0: 0, z0: 0, x1: 64, z1: 12 };
  const marker = { actor: 'runner', chance: 1, pos: [8, 1, 8] as [number, number, number] };
  const spawn = (weight: number) =>
    settlementActorSpawns(baseRegistry(), 1, road, {
      markers: [marker],
      roadHeightAt: () => 10,
      spawnWeights: new Map([
        ['shambler', 1],
        ['runner', weight],
      ]),
    });
  expect(spawn(1).some(({ type }) => type === 'runner')).toBe(true);
  expect(spawn(0).length).toBeGreaterThan(0);
  expect(spawn(0).some(({ type }) => type === 'runner')).toBe(false);
  expect(spawn(1)).toEqual(spawn(1));
});
