import { describe, expect, it } from 'vitest';
import { Compression } from '../src/core/compression.ts';
import { realSeconds, simSeconds } from '../src/core/time.ts';
import { advanceLiveFrame, planRealFrame } from '../src/game/frameDriver.ts';
import { BODY_TUNING_FIXTURE, Simulation } from './simulationFixture.ts';

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

  it('sizes a live frame after a between-frame interruption drops active compression', () => {
    const sim = new Simulation({ seed: 1, bodyTuning: BODY_TUNING_FIXTURE });
    sim.compression.active = true;
    sim.compression.c = 30;
    sim.emit({ kind: 'interrupt', reason: 'test interruption' });

    const advanced = advanceLiveFrame(sim, realSeconds(0.1));

    expect(advanced).toBeCloseTo(0.1, 12);
    expect(sim.time).toBeCloseTo(0.1, 12);
    expect(sim.compression.c).toBe(1);
  });
});
