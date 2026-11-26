import type { FallRecord } from '@skelly/engine/world';
import { FallDrops } from '@skelly/presentation/internal/render/fallDrops.ts';
import { expect, it, vi } from 'vitest';

const terrainFall = (x: number): FallRecord => ({ kind: 'terrain', from: [x, 1, 0], to: [x, 0, 0] });

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
