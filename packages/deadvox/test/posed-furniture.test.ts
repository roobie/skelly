import { describe, expect, it } from 'vitest';
import { rotationOf } from '../src/core/orientation.ts';
import { registry } from './snapshotTestSupport.ts';

describe('posed furniture', () => {
  it('keeps furniture definitions independent of fallen poses', () => {
    expect(
      [...registry.furniture.keys()].filter((id) => /(?:_fallen|_on_(?:back|side)|_overturned)$/.test(id)),
    ).toEqual([]);
  });

  it('keeps a fallen wardrobe’s cabinet doors on its posed front', () => {
    const wardrobe = registry.furniture.get('wardrobe')!;
    const [, , back] = rotationOf({ facing: 'n', tip: 'back' });

    expect(wardrobe.appearance?.kind).toBe('cabinet');
    expect(back.map((axis) => (axis === 0 ? 0 : -axis))).toEqual([0, 1, 0]);
  });
});
