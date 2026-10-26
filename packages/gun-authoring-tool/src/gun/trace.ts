export type TracePoint = readonly [x: number, y: number];

const finite = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new RangeError('Trace values must be finite');
  }
  return value;
};

const positive = (value: number): number => {
  if (finite(value) <= 0) {
    throw new RangeError('Trace lengths and scales must be positive');
  }
  return value;
};

const difference = (from: TracePoint, to: TracePoint): TracePoint => [
  finite(to[0]) - finite(from[0]),
  finite(to[1]) - finite(from[1]),
];

export const centreSpacingMm = (a: TracePoint, b: TracePoint, mmPerPixel: number): number => {
  const [dx, dy] = difference(a, b);
  return Math.hypot(dx, dy) * positive(mmPerPixel);
};

export const calibrateMmPerPixel = (a: TracePoint, b: TracePoint, sourcedLengthMm: number): number =>
  positive(sourcedLengthMm) / positive(centreSpacingMm(a, b, 1));

export const featureSpans = (points: readonly TracePoint[], mmPerPixel: number) => {
  if (points.length === 0) {
    throw new RangeError('A feature needs at least one point');
  }
  positive(mmPerPixel);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    minX = Math.min(minX, finite(x));
    minY = Math.min(minY, finite(y));
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { widthMm: (maxX - minX) * mmPerPixel, heightMm: (maxY - minY) * mmPerPixel };
};

export const compareScales = (baselineMmPerPixel: number, candidateMmPerPixel: number) => ({
  ratio: positive(candidateMmPerPixel) / positive(baselineMmPerPixel),
  deltaPercent: ((candidateMmPerPixel - baselineMmPerPixel) / baselineMmPerPixel) * 100,
});

export const allowanceBand = (value: number, allowancePercent: number) => {
  finite(value);
  if (finite(allowancePercent) < 0) {
    throw new RangeError('Allowance must be nonnegative');
  }
  const margin = (Math.abs(value) * allowancePercent) / 100;
  return { min: value - margin, max: value + margin };
};

/** Signed angle from +x toward +y, in the caller's coordinate frame (image y usually points down). */
export const angleDegrees = (from: TracePoint, to: TracePoint): number => {
  const [dx, dy] = difference(from, to);
  positive(Math.hypot(dx, dy));
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};
