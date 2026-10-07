import { describe, expect, it } from 'vitest';
import { makeScale } from '../src/core/scale.ts';
import { configFromUrl } from '../src/game/config.ts';
import { playerStartFromWorld } from '../src/game/worldSetup.ts';

describe('player start from world setup', () => {
  it('converts the generated metre-space spawn to a block-space body origin', () => {
    const start = playerStartFromWorld({ spawn: { pos: [12, 6, -3], yaw: 1.25 }, groundAt: () => 0 }, makeScale(0.5));
    expect(start).toEqual({ position: [24, 12.01, -6], yaw: 1.25 });
  });

  it('uses debug start only for new debug sessions and grounds it on the site', () => {
    const scale = makeScale(0.5);
    const setup = {
      spawn: { pos: [4, 7, 9] as [number, number, number], yaw: 0.25 },
      groundAt: (x: number, z: number) => x / 4 + z / 8,
    };
    const debugConfig = configFromUrl(new URLSearchParams('debug=1&at=12.5,-7.25,90'));
    const start = playerStartFromWorld(setup, scale, debugConfig.debugStart);
    expect(start.position).toEqual([
      12.5 / scale.blockSize,
      setup.groundAt(12.5, -7.25) / scale.blockSize + 0.01,
      -7.25 / scale.blockSize,
    ]);
    expect(start.yaw).toBeCloseTo(Math.PI / 2);

    const normalConfig = configFromUrl(new URLSearchParams('at=12.5,-7.25,90'));
    expect(normalConfig.debugStart).toBeUndefined();
    const worldSpawn = { position: [8, 14.01, 18], yaw: 0.25 };
    expect(playerStartFromWorld(setup, scale, normalConfig.debugStart)).toEqual(worldSpawn);
    expect(playerStartFromWorld(setup, scale, debugConfig.debugStart, true)).toEqual(worldSpawn);
  });
});
