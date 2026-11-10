import { type RealTimestamp, realTimestamp } from '../engine/sim.ts';

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
