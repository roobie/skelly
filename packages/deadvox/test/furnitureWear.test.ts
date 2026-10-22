import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { type FurnitureSpawn, fillFurnitureLoot } from '../src/core/site.ts';
import { buildFixtureRegistry as buildRegistry, fixtureBreach } from './economyFixtures.ts';

const WORN = 'fixture_worn';
const INTACT = 'fixture_intact';
const RANGE = { from: 0.2, to: 0.5 };
const DURABILITY = 100;

const fixture = (id: string, wear?: { from: number; to: number }) => ({
  id,
  name: id,
  size: [1, 1, 1],
  color: '#123456',
  breach: { ...fixtureBreach(), durability: DURABILITY },
  ...(wear ? { wear } : {}),
});

const built = buildRegistry([
  { source: 'wear-fixture.json', data: { furniture: [fixture(WORN, RANGE), fixture(INTACT)] } },
]);
if (built.issues.length > 0) {
  throw new Error(`wear fixture content is invalid: ${JSON.stringify(built.issues)}`);
}
const { registry } = built;

const spawnAt = (type: string, x: number): FurnitureSpawn => ({
  spec: { type, pos: [x, 1, 4], size: [1, 1, 1], facing: 'n' },
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
  const pieces = [...placed(7, WORN, 40).records];
  expect(pieces.length).toBe(40);
  for (const piece of pieces) {
    expect(piece.damage, 'every ranged piece is worn').toBeDefined();
    const share = piece.damage! / DURABILITY;
    expect(share).toBeGreaterThanOrEqual(RANGE.from);
    expect(share).toBeLessThanOrEqual(RANGE.to);
    expect(piece.damage).toBeLessThan(DURABILITY);
  }
});

it('rolls the same wear from the same seed', () => {
  const damages = (seed: number) => [...placed(seed, WORN, 12).records].map((piece) => piece.damage);
  const first = damages(21);
  expect(first.some((damage) => damage !== undefined && damage > 0)).toBe(true);
  expect(damages(21)).toEqual(first);
});

it('places a piece with no wear range intact', () => {
  const pieces = [...placed(7, INTACT, 5).records];
  expect(pieces.length).toBe(5);
  for (const piece of pieces) {
    expect(piece.damage).toBeUndefined();
  }
});

it('rejects authored wear ranges that reach 1, run backwards or go negative', () => {
  const piece = (wear: { from: number; to: number }) => ({ furniture: [fixture('fixture_bad', wear)] });
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
