// A rolling window of frame times for the debug readout: the median and 95th percentile of
// what the last couple of seconds took, which a single smoothed fps number hides.

import { percentile } from '../bench/stats.ts';

export interface FrameSummary {
  /** Milliseconds; NaN while the window is empty. */
  p50: number;
  p95: number;
}

/** The window the readout summarises, in milliseconds. */
export const FRAME_WINDOW_MS = 2000;

export class FrameTimes {
  private readonly samples: { at: number; ms: number }[] = [];
  private readonly windowMs: number;

  constructor(windowMs = FRAME_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  /** Adds a frame that took `ms`, seen at time `now` (both milliseconds), and drops what has aged out of the window. */
  record(now: number, ms: number): void {
    this.samples.push({ at: now, ms });
    let stale = 0;
    while (stale < this.samples.length && this.samples[stale]!.at < now - this.windowMs) {
      stale += 1;
    }
    if (stale > 0) {
      this.samples.splice(0, stale);
    }
  }

  summary(): FrameSummary {
    const times = this.samples.map((sample) => sample.ms);
    return { p50: percentile(times, 0.5), p95: percentile(times, 0.95) };
  }
}
