import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { type FurnitureSpawn, fillFurnitureLoot } from '../src/core/site.ts';
import { buildFixtureRegistry as buildRegistry, fixtureBreach } from './economyFixtures.ts';
import { registry } from './snapshotTestSupport.ts';

const WORN = 'crate';
const INTACT = 'rug';
const range = registry.furniture.get(WORN)!.wear!;
const { durability } = registry.furniture.get(WORN)!.breach;

const spawnAt = (type: string, x: number): FurnitureSpawn => ({
  spec: { type, pos: [x, 1, 4], size: [...registry.furniture.get(type)!.size], facing: 'n' },
  loot: [],
});

const placed = (seed: number, type: string, count: number): BlockEntities => {
  const entities = new BlockEntities(registry);
  const spawns = fillFurnitureLoot(
    registry,
    seed,
    Array.from({ length: count }, (_, k) => spawnAt(type, k * 8)),
    [],
  );
  for (const { spec, wear } of spawns) {
    const entity = entities.add(spec)!;
    if (wear !== undefined) {
      entities.wear(entity, wear);
    }
  }
  return entities;
};

it('places worn pieces inside the authored range and below their durability', () => {
  const entities = placed(7, WORN, 40);
  const pieces = [...entities.records];
  expect(pieces.length).toBe(40);
  for (const piece of pieces) {
    const share = (piece.damage ?? 0) / durability;
    expect(share).toBeGreaterThanOrEqual(range.from);
    expect(share).toBeLessThanOrEqual(range.to);
    expect(piece.damage).toBeLessThan(durability);
  }
});

it('rolls the same wear from the same seed', () => {
  const damages = (seed: number) => [...placed(seed, WORN, 12).records].map((piece) => piece.damage);
  expect(damages(21)).toEqual(damages(21));
});

it('places a piece with no wear range intact', () => {
  expect(registry.furniture.get(INTACT)!.wear).toBeUndefined();
  for (const piece of placed(7, INTACT, 5).records) {
    expect(piece.damage).toBeUndefined();
  }
});

it('rejects authored wear ranges that reach 1, run backwards or go negative', () => {
  const piece = (wear: { from: number; to: number }) => ({
    furniture: [{ id: 'fixture_worn', name: 'Worn', size: [1, 1, 1], color: '#123456', breach: fixtureBreach(), wear }],
  });
  expect(buildRegistry([{ source: 'ok.json', data: piece({ from: 0.2, to: 0.5 }) }]).issues).toEqual([]);
  for (const wear of [
    { from: 0.2, to: 1 },
    { from: 0.6, to: 0.3 },
    { from: -0.1, to: 0.3 },
  ]) {
    expect(
      buildRegistry([{ source: 'bad.json', data: piece(wear) }]).issues.length,
      JSON.stringify(wear),
    ).toBeGreaterThan(0);
  }
});

it('refuses a worn share that would ruin the piece', () => {
  const entities = new BlockEntities(registry);
  const piece = entities.add(spawnAt(WORN, 0).spec)!;
  for (const share of [1, 1.5, -0.1, Number.NaN]) {
    expect(() => entities.wear(piece, share), `share ${share}`).toThrow('Worn share');
  }
});
