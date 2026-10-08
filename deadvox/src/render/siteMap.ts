export type SiteMapView = 'topographic' | 'satellite';
export type ContourSegments = Float32Array;

const PAIRS: readonly (readonly number[] | undefined)[] = [
  undefined,
  [0, 3],
  [0, 1],
  [3, 1],
  [1, 2],
  undefined,
  [0, 2],
  [3, 2],
  [2, 3],
  [0, 2],
  undefined,
  [1, 2],
  [3, 1],
  [0, 1],
  [0, 3],
  undefined,
];
const SADDLE_PAIRS_A = [0, 1, 2, 3];
const SADDLE_PAIRS_B = [0, 3, 1, 2];

interface CellValues {
  x: number;
  y: number;
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

const edgePoint = (cell: CellValues, edge: number, level: number): [number, number] => {
  if (edge === 0) {
    return [cell.x + (level - cell.topLeft) / (cell.topRight - cell.topLeft), cell.y];
  }
  if (edge === 1) {
    return [cell.x + 1, cell.y + (level - cell.topRight) / (cell.bottomRight - cell.topRight)];
  }
  if (edge === 2) {
    return [cell.x + (level - cell.bottomLeft) / (cell.bottomRight - cell.bottomLeft), cell.y + 1];
  }
  return [cell.x, cell.y + (level - cell.topLeft) / (cell.bottomLeft - cell.topLeft)];
};

const appendCellSegments = (segments: number[], cell: CellValues, level: number) => {
  const mask =
    (cell.topLeft >= level ? 1 : 0) |
    (cell.topRight >= level ? 2 : 0) |
    (cell.bottomRight >= level ? 4 : 0) |
    (cell.bottomLeft >= level ? 8 : 0);
  if (mask === 0 || mask === 15) {
    return;
  }
  let pairs = PAIRS[mask]!;
  if (mask === 5 || mask === 10) {
    const centerHigh = (cell.topLeft + cell.topRight + cell.bottomRight + cell.bottomLeft) / 4 >= level;
    pairs = cell.topLeft >= level === centerHigh ? SADDLE_PAIRS_A : SADDLE_PAIRS_B;
  }
  for (let i = 0; i < pairs.length; i += 2) {
    const [x1, y1] = edgePoint(cell, pairs[i]!, level);
    const [x2, y2] = edgePoint(cell, pairs[i + 1]!, level);
    if (Math.abs(x1 - x2) + Math.abs(y1 - y2) > 1e-6) {
      segments.push(x1, y1, x2, y2);
    }
  }
};

interface ContourGrid {
  segments: number[];
  values: ArrayLike<number>;
  width: number;
  level: number;
}

const appendGridCell = (grid: ContourGrid, x: number, y: number) => {
  const { values, width, level } = grid;
  const topLeft = values[x + y * width]!;
  const topRight = values[x + 1 + y * width]!;
  const bottomRight = values[x + 1 + (y + 1) * width]!;
  const bottomLeft = values[x + (y + 1) * width]!;
  const mask =
    (topLeft >= level ? 1 : 0) |
    (topRight >= level ? 2 : 0) |
    (bottomRight >= level ? 4 : 0) |
    (bottomLeft >= level ? 8 : 0);
  if (mask !== 0 && mask !== 15) {
    appendCellSegments(grid.segments, { x, y, topLeft, topRight, bottomRight, bottomLeft }, level);
  }
};

/** Marching-squares line segments in grid-sample coordinates, four floats per segment. */
export const marchingSquares = (
  values: ArrayLike<number>,
  width: number,
  height: number,
  level: number,
): ContourSegments => {
  const grid: ContourGrid = { segments: [], values, width, level };
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      appendGridCell(grid, x, y);
    }
  }
  return new Float32Array(grid.segments);
};

export const hillshade = (
  heights: ArrayLike<number>,
  width: number,
  height: number,
  cellSize: number,
): Float32Array => {
  const shades = new Float32Array(width * height);
  const lightX = -Math.SQRT1_2 * 0.72;
  const lightY = 0.69;
  const lightZ = -Math.SQRT1_2 * 0.72;
  const lightLength = Math.hypot(lightX, lightY, lightZ);
  for (let y = 0; y < height; y += 1) {
    const above = Math.max(0, y - 1);
    const below = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      const dx = (heights[right + y * width]! - heights[left + y * width]!) / (Math.max(1, right - left) * cellSize);
      const dz = (heights[x + above * width]! - heights[x + below * width]!) / (Math.max(1, below - above) * cellSize);
      const normalLength = Math.hypot(dx, dz, 1);
      const dot = (-dx * lightX + lightY - dz * lightZ) / normalLength / lightLength;
      shades[x + y * width] = 0.62 + 0.42 * Math.max(0, dot);
    }
  }
  return shades;
};

export interface SiteMapRasterInput {
  heights: ArrayLike<number>;
  blockIds: ArrayLike<number>;
  blockColors: Uint8Array;
  shades: ArrayLike<number>;
  width: number;
  height: number;
  view: SiteMapView;
}

/** Build a shaded sRGB raster from the world's sampled heights and top-block ids. */
export const siteMapPixels = ({
  heights,
  blockIds,
  blockColors,
  shades,
  width,
  height,
  view,
}: SiteMapRasterInput): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  if (view === 'topographic') {
    for (let i = 0; i < width * height; i += 1) {
      min = Math.min(min, heights[i]!);
      max = Math.max(max, heights[i]!);
    }
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < width * height; i += 1) {
    let red: number;
    let green: number;
    let blue: number;
    if (view === 'topographic') {
      const t = Math.max(0, Math.min(1, (heights[i]! - min) / range));
      red = Math.round(72 + 142 * t);
      green = Math.round(117 + 57 * t);
      blue = Math.round(83 + 31 * t);
    } else {
      const block = blockIds[i]! * 3;
      red = blockColors[block] ?? 0;
      green = blockColors[block + 1] ?? 0;
      blue = blockColors[block + 2] ?? 0;
    }
    const shade = shades[i]!;
    const offset = i * 4;
    pixels[offset] = red * shade;
    pixels[offset + 1] = green * shade;
    pixels[offset + 2] = blue * shade;
    pixels[offset + 3] = 255;
  }
  return pixels;
};
