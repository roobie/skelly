import { describe, expect, it } from 'vitest';
import { throwStanceHandOffset, throwStanceWorldOffset } from '../src/core/heldPose.ts';

describe('throw stance held pose', () => {
  it('raises and draws both held hands back, then restores their neutral offset on exit', () => {
    for (const side of ['right', 'left'] as const) {
      const normal = throwStanceHandOffset(side, false, 1);
      const ready = throwStanceHandOffset(side, true);
      const charged = throwStanceHandOffset(side, true, 1);

      expect(ready[1]).toBeGreaterThan(normal[1]);
      expect(ready[2]).toBeGreaterThan(normal[2]);
      expect(charged[1]).toBeGreaterThan(ready[1]);
      expect(charged[2]).toBeGreaterThan(ready[2]);
      expect(throwStanceHandOffset(side, false)).toEqual(normal);
    }
  });

  it('starts a thrown item above and behind the view along its held-hand pose', () => {
    for (const side of ['right', 'left'] as const) {
      const offset = throwStanceWorldOffset(side, 0, 0, 0);
      expect(offset[1]).toBeGreaterThan(0);
      expect(offset[2]).toBeGreaterThan(0);
    }
  });
});
