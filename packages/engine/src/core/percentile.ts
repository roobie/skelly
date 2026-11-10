/** The value below which a fraction p (0..1) of the samples fall (nearest rank). */
export const percentile = (samples: readonly number[], p: number): number => {
  if (samples.length === 0) {
    return Number.NaN;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank]!;
};
