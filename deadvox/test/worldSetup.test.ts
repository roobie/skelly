import { describe, expect, it } from 'vitest';
import { makeScale } from '../src/core/scale.ts';
import { playerStartFromWorld } from '../src/game/worldSetup.ts';

describe('player start from world setup', () => {
  it('converts the generated metre-space spawn to a block-space body origin', () => {
    const start = playerStartFromWorld({ spawn: { pos: [12, 6, -3], yaw: 1.25 } }, makeScale(0.5));
    expect(start).toEqual({ position: [24, 12.01, -6], yaw: 1.25 });
  });
});
