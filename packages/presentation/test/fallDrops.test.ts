import type { FallRecord } from '@skelly/engine/world';
import { FallDrops } from '@skelly/presentation/internal/render/fallDrops.ts';
import { Object3D } from 'three';
import { expect, it, vi } from 'vitest';

const terrainFall = (x: number): FallRecord => ({ kind: 'terrain', block: 1, from: [x, 1, 0], to: [x, 0, 0] });

it('hides landed pieces and piles until their moving copies arrive', () => {
  const piece = vi.fn(() => new Object3D());
  const pile = vi.fn(() => new Object3D());
  const terrain = vi.fn(() => new Object3D());
  const mask = vi.fn();
  const drops = new FallDrops(1, 10, { piece, pile, terrain }, { mask, unmask: vi.fn() });
  drops.read([
    { kind: 'piece', uid: 1, from: [0, 1, 0], to: [0, 0, 0] },
    { kind: 'pile', uid: 2, from: [1, 1, 0], to: [1, 0, 0] },
    terrainFall(2),
  ]);
  expect(piece).toHaveBeenCalledWith(1);
  expect(pile).toHaveBeenCalledWith(2);
  expect(terrain).toHaveBeenCalledWith(1);
  expect(mask).toHaveBeenCalledWith([[2, 0, 0]]);
  expect(drops.hiddenPieceUids.has(1)).toBe(true);
  expect(drops.hiddenItemUids.has(2)).toBe(true);
  const heights = drops.group.children.map((model) => model.position.y);
  drops.update(0.1);
  for (const [index, model] of drops.group.children.entries()) {
    expect(model.position.y).toBeLessThan(heights[index]!);
  }
  drops.update(1);
  expect(drops.hiddenPieceUids.size).toBe(0);
  expect(drops.hiddenItemUids.size).toBe(0);
  expect(drops.group.children).toHaveLength(0);
  drops.dispose();
});

it('batches terrain landings that finish in one frame into one unmask request', () => {
  const unmask = vi.fn();
  const drops = new FallDrops(
    1,
    10,
    { piece: () => undefined, pile: () => undefined, terrain: () => new Object3D() },
    { mask: vi.fn(), unmask },
  );
  drops.read([terrainFall(0), terrainFall(1)]);
  drops.update(1);
  expect(unmask).toHaveBeenCalledOnce();
  expect(unmask.mock.calls[0]![0]).toHaveLength(2);
  expect(unmask.mock.calls[0]![0]).toEqual(
    expect.arrayContaining([
      [0, 0, 0],
      [1, 0, 0],
    ]),
  );
  drops.dispose();
});
