// Summaries of timing samples. Pure, so the benchmark's arithmetic is tested.

/** The value below which a fraction p (0..1) of the samples fall (nearest rank). */
export const percentile = (samples: readonly number[], p: number): number => {
  if (samples.length === 0) {
    return Number.NaN;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank]!;
};

export const mean = (samples: readonly number[]): number =>
  samples.length === 0 ? Number.NaN : samples.reduce((a, b) => a + b, 0) / samples.length;

/** A frame slower than this missed 60 fps (16.7 ms plus scheduling slack). */
export const SLOW_FRAME_MS = 18;

export interface FrameStats {
  frames: number;
  fpsMean: number;
  msMedian: number;
  msP95: number;
  msP99: number;
  msMax: number;
  /** Fraction of frames slower than SLOW_FRAME_MS. */
  slowFraction: number;
}

export const frameStats = (frameMs: readonly number[]): FrameStats => ({
  frames: frameMs.length,
  fpsMean: frameMs.length === 0 ? Number.NaN : 1000 / mean(frameMs),
  msMedian: percentile(frameMs, 0.5),
  msP95: percentile(frameMs, 0.95),
  msP99: percentile(frameMs, 0.99),
  msMax: frameMs.length === 0 ? Number.NaN : Math.max(...frameMs),
  slowFraction: frameMs.length === 0 ? Number.NaN : frameMs.filter((ms) => ms > SLOW_FRAME_MS).length / frameMs.length,
});

export interface SampleStats {
  count: number;
  median: number;
  p95: number;
}

export const sampleStats = (samples: readonly number[]): SampleStats => ({
  count: samples.length,
  median: percentile(samples, 0.5),
  p95: percentile(samples, 0.95),
});
