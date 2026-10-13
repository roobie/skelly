import type { Compression } from '../core/compression.ts';
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
  normal: { up: realSeconds(1.5) },
  skip: { up: realSeconds(0.4) },
} as const;
/**
 * At most this much Sim time passes while compression ramps back down after a stop. The bound is in
 * Sim time, so the decay quickens with the start's cap: a fixed Real-time ramp from ×360 would run
 * the world on for tens of Sim seconds after the player stops waiting.
 */
export const RAMP_DOWN_SIM_SECONDS = simSeconds(3);

/** Turns an elapsed Real frame duration into the ready-to-consume Sim step. */
export const planRealFrame = (compression: Compression, elapsed: RealSeconds): SimSeconds => {
  // Defend saved state from invalid elapsed values at the frame boundary.
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return simSeconds(0);
  }
  const { cap, maxSimPerFrame, ramp } = compression.limits;
  compression.c = compression.active
    ? Math.min(cap, compression.c * Math.exp((Math.log(cap) / RAMP_PROFILES[ramp].up) * elapsed))
    : Math.max(1, compression.c * Math.exp(-(cap / RAMP_DOWN_SIM_SECONDS) * elapsed));
  return simSeconds(Math.min(elapsed * compression.c, maxSimPerFrame));
};

type AdvanceStep = (simDt: SimSeconds, until?: number) => void;
const advanceStep = (sim: Simulation, simDt: SimSeconds, until: number | undefined, advance?: AdvanceStep): number => {
  if (advance) {
    advance(simDt, until);
    return 0;
  }
  return sim.frame(simDt, until);
};

/** Checks pending interruptions before the live driver sizes and submits this frame's Sim step. */
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

export interface RealFrameObserver {
  before: () => number | undefined;
  after: (startedRealMs: number) => void;
}
export const observeRealFrame =
  (frame: (now: RealTimestamp) => boolean, observer: () => RealFrameObserver | undefined) =>
  (now: RealTimestamp): boolean => {
    const watching = observer();
    const startedRealMs = watching?.before();
    const continuing = frame(now);
    if (startedRealMs !== undefined) {
      watching?.after(startedRealMs);
    }
    return continuing;
  };

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
