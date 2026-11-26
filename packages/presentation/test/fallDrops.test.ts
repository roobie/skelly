import type { FallRecord } from '@skelly/engine/world';
import { FallDrops } from '@skelly/presentation/internal/render/fallDrops.ts';
import { expect, it, vi } from 'vitest';

const terrainFall = (x: number): FallRecord => ({ kind: 'terrain', from: [x, 1, 0], to: [x, 0, 0] });

it('draws records from piece, pile, and terrain fall emitters through one sink', () => {
  const piece = vi.fn(() => undefined);
  const pile = vi.fn(() => undefined);
  const mask = vi.fn();
  const drops = new FallDrops(1, 10, piece, pile, mask, vi.fn());
  drops.read(
    [
      { kind: 'piece', uid: 1, from: [0, 1, 0], to: [0, 0, 0] },
      { kind: 'pile', uid: 2, from: [1, 1, 0], to: [1, 0, 0] },
      terrainFall(2),
    ],
    {} as never,
  );
  expect(piece).toHaveBeenCalledWith(1);
  expect(pile).toHaveBeenCalledWith(2);
  expect(mask).toHaveBeenCalledWith([[2, 0, 0]]);
  drops.dispose();
});

it('batches terrain landings that finish in one frame into one unmask request', () => {
  const mask = vi.fn();
  const unmask = vi.fn();
  const drops = new FallDrops(1, 10, () => undefined, () => undefined, mask, unmask);
  drops.read([terrainFall(0), terrainFall(1)], {} as never);
  drops.update(1);
  expect(unmask).toHaveBeenCalledExactlyOnceWith([
    [1, 0, 0],
    [0, 0, 0],
  ]);
  drops.dispose();
});
