import { describe, expect, it } from 'vitest';
import { Compression } from '../src/core/compression.ts';
import { realSeconds, simSeconds } from '../src/core/time.ts';
import { planRealFrame, planReplayFrame } from '../src/game/frameDriver.ts';

describe('outer frame time planning', () => {
  it('converts a Real frame duration using the compression state after its ramp update', () => {
    const compression = new Compression();
    compression.start(undefined);
    const elapsed = realSeconds(0.025);
    const planned = planRealFrame(compression, elapsed);

    expect(planned).toBeCloseTo(elapsed * compression.c, 12);
  });

  it('bounds a Real-driven Sim step by the configured Sim-time frame limit', () => {
    const compression = new Compression();
    compression.start(undefined, { cap: 2400, maxSimPerFrame: simSeconds(2), ramp: 'skip' });
    const planned = planRealFrame(compression, realSeconds(10));

    expect(planned).toBe(2);
  });

  it('builds replay steps from recorded compression without reading a Real clock', () => {
    const compression = new Compression();
    compression.c = 8;

    expect(planReplayFrame(compression, simSeconds(1 / 60))).toBeCloseTo(8 / 60, 12);
    expect(compression.c).toBe(8);
  });
});
