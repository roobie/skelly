import { COMPRESSION, type Compression } from '../core/compression.ts';
import type { Simulation } from '../core/sim.ts';
import {
  type RealSeconds,
  type RealTimestamp,
  realSeconds,
  realTimestamp,
  type SimSeconds,
  simSeconds,
} from '../core/time.ts';

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

type AdvanceStep = (simDt: SimSeconds, until?: number) => void;
const advanceStep = (sim: Simulation, simDt: SimSeconds, until: number | undefined, advance?: AdvanceStep): number => {
  if (advance) {
    advance(simDt, until);
    return 0;
  }
  return sim.frame(simDt, until);
};

/** Checks pending interruptions before either driver sizes and submits this frame's Sim step. */
export const advanceLiveFrame = (
  sim: Simulation,
  elapsed: RealSeconds,
  until?: number,
  advance?: AdvanceStep,
): number => {
  if (sim.paused || sim.dead) {
    return 0;
  }
  sim.beginFrame();
  return advanceStep(sim, planRealFrame(sim.compression, elapsed), until, advance);
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
