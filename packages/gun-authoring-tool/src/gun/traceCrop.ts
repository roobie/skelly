import type { TracePoint } from './trace.ts';

export interface TraceCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly gridStep: number;
}

export const validateCrop = (crop: TraceCrop, imageWidth: number, imageHeight: number): void => {
  if (
    !Object.values(crop).every(Number.isSafeInteger) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.zoom < 1 ||
    crop.gridStep < 1
  ) {
    throw new RangeError(
      'Crop coordinates must be nonnegative integers; size, zoom and grid step must be positive integers',
    );
  }
  if (crop.x + crop.width > imageWidth || crop.y + crop.height > imageHeight) {
    throw new RangeError('Crop region must stay inside the source image; no automatic clipping');
  }
  if (!(Number.isSafeInteger(crop.width * crop.zoom) && Number.isSafeInteger(crop.height * crop.zoom))) {
    throw new RangeError('Zoomed crop dimensions must be safe integers');
  }
};

/** Crop-local display coordinates, excluding the label gutter. Source coordinates are pixel boundaries. */
export const sourceToCrop = ([x, y]: TracePoint, crop: TraceCrop): TracePoint => [
  (x - crop.x) * crop.zoom,
  (y - crop.y) * crop.zoom,
];

export const cropToSource = ([x, y]: TracePoint, crop: TraceCrop): TracePoint => [
  x / crop.zoom + crop.x,
  y / crop.zoom + crop.y,
];

const gridAxis = (start: number, length: number, zoom: number, step: number) => {
  const lines: { source: number; position: number }[] = [];
  for (let source = Math.ceil(start / step) * step; source <= start + length; source += step) {
    lines.push({ source, position: (source - start) * zoom });
  }
  return lines;
};

export const cropGrid = (crop: TraceCrop) => {
  validateCrop(crop, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  return {
    x: gridAxis(crop.x, crop.width, crop.zoom, crop.gridStep),
    y: gridAxis(crop.y, crop.height, crop.zoom, crop.gridStep),
  };
};
