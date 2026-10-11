import { describe, expect, it } from 'vitest';
import { Compression, longActionLimits } from '../src/core/compression.ts';
import { realSeconds, simSeconds } from '../src/core/time.ts';
import { advanceLiveFrame, planRealFrame, RAMP_DOWN_SIM_SECONDS } from '../src/game/frameDriver.ts';
import { BODY_TUNING_FIXTURE, COMPRESSION_CAPS_FIXTURE, Simulation } from './simulationFixture.ts';

describe('outer frame time planning', () => {
  it('converts a Real frame duration using the compression state after its ramp update', () => {
    const compression = new Compression(longActionLimits(COMPRESSION_CAPS_FIXTURE.wait));
    compression.start(undefined, 'debug');
    const elapsed = realSeconds(0.025);
    const planned = planRealFrame(compression, elapsed);

    expect(planned).toBeCloseTo(elapsed * compression.c, 12);
  });

  it('bounds a Real-driven Sim step by the configured Sim-time frame limit', () => {
    const compression = new Compression(longActionLimits(COMPRESSION_CAPS_FIXTURE.wait));
    compression.start(undefined, 'debug', { cap: 2400, maxSimPerFrame: simSeconds(2), ramp: 'skip' });
    const planned = planRealFrame(compression, realSeconds(10));

    expect(planned).toBe(2);
  });

  it('runs the world on for a bounded Sim time after a stop, however high the cap', () => {
    const compression = new Compression(longActionLimits(COMPRESSION_CAPS_FIXTURE.wait));
    compression.start(undefined, 'long-action');
    for (let frame = 0; frame < 600 && compression.c < compression.limits.cap; frame++) {
      planRealFrame(compression, realSeconds(1 / 60));
    }
    expect(compression.c).toBe(compression.limits.cap);
    compression.stop();
    let afterStop = 0;
    for (let frame = 0; frame < 600 && compression.c > 1; frame++) {
      afterStop += planRealFrame(compression, realSeconds(1 / 60));
    }

    expect(compression.c).toBe(1);
    expect(afterStop).toBeLessThanOrEqual(RAMP_DOWN_SIM_SECONDS);
  });

  it('sizes a live frame after a between-frame interruption drops active compression', () => {
    const sim = new Simulation({ seed: 1, bodyTuning: BODY_TUNING_FIXTURE });
    expect(sim.actions.startRest('sleep', -10, 1)).toBeUndefined();
    expect(sim.compression.active).toBe(true);
    advanceLiveFrame(sim, realSeconds(0.1));
    expect(sim.compression.c).toBeGreaterThan(1);

    sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    const before = sim.time;
    const advanced = advanceLiveFrame(sim, realSeconds(0.1));

    expect(advanced).toBeCloseTo(0.1, 12);
    expect(sim.time - before).toBeCloseTo(0.1, 12);
    expect(sim.compression.c).toBe(1);
  });
});
