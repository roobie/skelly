import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import type { TracePoint } from './trace.ts';
import { uToMm } from './units.ts';

export interface TraceProjection {
  readonly view: 'left' | 'right';
  readonly modelDatum: Vec3;
  readonly photoDatum: TracePoint;
  readonly mmPerPixel: number;
}

export const projectPoint = (point: Vec3, projection: TraceProjection): TracePoint => {
  const { modelDatum, photoDatum, mmPerPixel, view } = projection;
  if (
    !(Number.isFinite(mmPerPixel) && mmPerPixel > 0 && [...point, ...modelDatum, ...photoDatum].every(Number.isFinite))
  ) {
    throw new RangeError('Projection needs finite datums and a positive mm/px scale');
  }
  const direction = view === 'right' ? 1 : -1;
  return [
    photoDatum[0] + (direction * uToMm(point[0] - modelDatum[0])) / mmPerPixel,
    photoDatum[1] - uToMm(point[1] - modelDatum[1]) / mmPerPixel,
  ];
};

export const projectionDepth = (point: Vec3, view: TraceProjection['view']): number =>
  point[2] * (view === 'right' ? 1 : -1);

export const overlayBounds = (width: number, height: number, points: Iterable<TracePoint>) => {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new RangeError('Overlay needs positive image dimensions');
  }
  let minX = 0;
  let minY = 0;
  let maxX = width;
  let maxY = height;
  for (const [x, y] of points) {
    if (!(Number.isFinite(x) && Number.isFinite(y))) {
      throw new RangeError('Overlay points must be finite');
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    minX: Math.floor(minX) - 20,
    minY: Math.floor(minY) - 20,
    maxX: Math.ceil(maxX) + 20,
    maxY: Math.ceil(maxY) + 20,
  };
};

export const scaleBarPixels = (lengthMm: number, mmPerPixel: number): number => {
  if (!(Number.isFinite(lengthMm) && lengthMm > 0 && Number.isFinite(mmPerPixel) && mmPerPixel > 0)) {
    throw new RangeError('Scale bar needs a positive length and scale');
  }
  return lengthMm / mmPerPixel;
};
