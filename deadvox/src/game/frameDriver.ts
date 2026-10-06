import { COMPRESSION, type Compression } from '../core/compression.ts';
import type { Simulation } from '../core/sim.ts';
import { realSeconds, realTimestamp, simSeconds, type RealSeconds, type RealTimestamp, type SimSeconds } from '../core/time.ts';

const RAMP_PROFILES = {
  normal: { up: realSeconds(1.5), down: realSeconds(0.4) },
  skip: { up: realSeconds(0.4), down: realSeconds(0.4) },
} as const;
const NORMAL_DOWN_RATE = Math.log(COMPRESSION.cap) / RAMP_PROFILES.normal.down;

/** Turns an elapsed Real frame duration into the ready-to-consume Sim step. */
export const planRealFrame = (compression: Compression, elapsed: RealSeconds): SimSeconds => {
  const ramp = RAMP_PROFILES[compression.limits.ramp];
  compression.c = compression.active
    ? Math.min(compression.limits.cap, compression.c * Math.exp((Math.log(compression.limits.cap) / ramp.up) * elapsed))
    : Math.max(1, compression.c * Math.exp(-NORMAL_DOWN_RATE * elapsed));
  return simSeconds(Math.min(elapsed * compression.c, compression.limits.maxSimPerFrame));
};

/** Replay applies the recorded compression outside the simulation and supplies an explicit Sim step. */
export const planReplayFrame = (compression: Compression, nominalFrame: SimSeconds): SimSeconds =>
  simSeconds(Math.min(nominalFrame * compression.c, compression.limits.maxSimPerFrame));

/** The live frame adapter is the only place that converts Real frame duration to a simulation step. */
export const advanceLiveFrame = (sim: Simulation, elapsed: RealSeconds, until?: number): number => {
  if (sim.paused || sim.dead) {
    return 0;
  }
  return sim.frame(planRealFrame(sim.compression, elapsed), until);
};

/** Monotonic Real timestamp in milliseconds; only the outer frame/presentation adapter reads it. */
export const realNow = (): RealTimestamp => realTimestamp(performance.now());

/** Browser RAF wiring lives outside the simulation and forwards branded Real timestamps. */
export const startRealFrames = (
  frame: (now: RealTimestamp) => boolean,
  request: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
): void => {
  const tick: FrameRequestCallback = (now) => {
    if (frame(realTimestamp(now))) {
      request(tick);
    }
  };
  request(tick);
};
