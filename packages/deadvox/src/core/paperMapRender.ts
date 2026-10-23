import { type ContourSegments, hillshade as calculateHillshade, marchingSquares } from '../render/siteMap.ts';
import { type PaperMapCoverage, paperMapBounds } from './paperMap.ts';
import { type Terrain, worldGroundAt } from './worldgen.ts';

export interface PaperMapRenderConfig {
  /** Metres between printed terrain samples. */
  readonly cellMetres: number;
  /** Metres between shared contour levels. */
  readonly contourIntervalMetres: number;
  /** Changes whenever presentation semantics change. */
  readonly revision: string;
}

/** Terrain-only presentation settings. Roads are an explicit later cartographic layer. */
export const PAPER_MAP_RENDER_CONFIG: PaperMapRenderConfig = {
  cellMetres: 4,
  contourIntervalMetres: 10,
  revision: 'terrain-v1',
};

export interface PaperMapContour {
  readonly level: number;
  /** World-space x/z segment endpoints, four numbers per segment. */
  readonly segments: ContourSegments;
}

export interface PaperMapTerrain {
  readonly coverage: PaperMapCoverage;
  readonly cellMetres: number;
  /** Exact sheet-boundary samples, in row-major order. */
  readonly heights: Float64Array;
  readonly hillshade: Float32Array;
  readonly width: number;
  readonly contours: readonly PaperMapContour[];
}

/** Clips one segment to the inclusive neatline, preserving a shared edge in both neighbouring sheets. */
interface Segment {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

const clipSegment = (
  { x0, z0, x1, z1 }: Segment,
  bounds: ReturnType<typeof paperMapBounds>,
): readonly number[] | undefined => {
  let start = 0;
  let end = 1;
  for (const [point, delta, low, high] of [
    [x0, x1 - x0, bounds.x0, bounds.x1],
    [z0, z1 - z0, bounds.z0, bounds.z1],
  ] as const) {
    if (delta === 0) {
      if (point < low || point > high) {
        return undefined;
      }
      continue;
    }
    const a = (low - point) / delta;
    const b = (high - point) / delta;
    start = Math.max(start, Math.min(a, b));
    end = Math.min(end, Math.max(a, b));
    if (start > end) {
      return undefined;
    }
  }
  return [x0 + (x1 - x0) * start, z0 + (z1 - z0) * start, x0 + (x1 - x0) * end, z0 + (z1 - z0) * end];
};

interface ContourInputs {
  readonly samples: Float64Array;
  readonly haloWidth: number;
  readonly bounds: ReturnType<typeof paperMapBounds>;
  readonly cellMetres: number;
  readonly interval: number;
}

const contoursFor = ({
  samples,
  haloWidth,
  bounds,
  cellMetres,
  interval,
}: ContourInputs): readonly PaperMapContour[] => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    min = Math.min(min, sample);
    max = Math.max(max, sample);
  }
  const contours: PaperMapContour[] = [];
  for (
    let level = Math.ceil(min / interval) * interval;
    level <= Math.floor(max / interval) * interval;
    level += interval
  ) {
    const source = marchingSquares(samples, haloWidth, haloWidth, level);
    const clipped: number[] = [];
    for (let i = 0; i < source.length; i += 4) {
      const segment = clipSegment(
        {
          x0: bounds.x0 - cellMetres + source[i]! * cellMetres,
          z0: bounds.z0 - cellMetres + source[i + 1]! * cellMetres,
          x1: bounds.x0 - cellMetres + source[i + 2]! * cellMetres,
          z1: bounds.z0 - cellMetres + source[i + 3]! * cellMetres,
        },
        bounds,
      );
      if (segment) {
        clipped.push(...segment);
      }
    }
    if (clipped.length > 0) {
      contours.push({ level, segments: new Float32Array(clipped) });
    }
  }
  return contours;
};

/**
 * Samples the immutable generation surface only. The surrounding one-cell halo supplies gradients and
 * contour cells, while the returned values and segments are clipped to the covered region.
 */
export const samplePaperMapTerrain = (
  terrain: Pick<Terrain, 'seed' | 'shape' | 'scale' | 'surface'>,
  coverage: PaperMapCoverage,
  config: PaperMapRenderConfig = PAPER_MAP_RENDER_CONFIG,
): PaperMapTerrain => {
  const bounds = paperMapBounds(coverage);
  const span = bounds.x1 - bounds.x0;
  if (
    span !== bounds.z1 - bounds.z0 ||
    span % config.cellMetres !== 0 ||
    config.cellMetres <= 0 ||
    config.contourIntervalMetres <= 0
  ) {
    throw new Error('Paper-map render configuration does not divide its region');
  }
  const visibleWidth = span / config.cellMetres + 1;
  const haloWidth = visibleWidth + 2;
  const halo = new Float64Array(haloWidth * haloWidth);
  for (let row = 0; row < haloWidth; row += 1) {
    for (let column = 0; column < haloWidth; column += 1) {
      halo[column + row * haloWidth] = worldGroundAt({
        ...terrain,
        surface: terrain.surface ?? undefined,
        xm: bounds.x0 + (column - 1) * config.cellMetres,
        zm: bounds.z0 + (row - 1) * config.cellMetres,
      });
    }
  }
  const shadedHalo = calculateHillshade(halo, haloWidth, haloWidth, config.cellMetres);
  const heights = new Float64Array(visibleWidth * visibleWidth);
  const shades = new Float32Array(visibleWidth * visibleWidth);
  for (let row = 0; row < visibleWidth; row += 1) {
    const source = 1 + (row + 1) * haloWidth;
    heights.set(halo.subarray(source, source + visibleWidth), row * visibleWidth);
    shades.set(shadedHalo.subarray(source, source + visibleWidth), row * visibleWidth);
  }
  return {
    coverage: { ...coverage },
    cellMetres: config.cellMetres,
    heights,
    hillshade: shades,
    width: visibleWidth,
    contours: contoursFor({
      samples: halo,
      haloWidth,
      bounds,
      cellMetres: config.cellMetres,
      interval: config.contourIntervalMetres,
    }),
  };
};

export interface PaperMapCacheRequest<T> {
  readonly result: Promise<T>;
  cancel: () => void;
}

export interface PaperMapCacheKey {
  readonly worldIdentity: string;
  readonly coverage: PaperMapCoverage;
  readonly renderRevision: string;
}

interface Pending<T> {
  controller: AbortController;
  users: number;
  result: Promise<T>;
}

/** A session-only LRU cache: subscribers may cancel independently while identical work is shared. */
export class PaperMapRenderCache<T> {
  private readonly ready = new Map<string, T>();
  private readonly pending = new Map<string, Pending<T>>();
  private readonly capacity: number;
  private readonly create: (key: PaperMapCacheKey, signal: AbortSignal) => Promise<T>;

  constructor(capacity: number, create: (key: PaperMapCacheKey, signal: AbortSignal) => Promise<T>) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error('Paper-map cache capacity must be positive');
    }
    this.capacity = capacity;
    this.create = create;
  }

  request(key: PaperMapCacheKey): PaperMapCacheRequest<T> {
    const encoded = JSON.stringify([key.worldIdentity, key.coverage.x, key.coverage.z, key.renderRevision]);
    const cached = this.ready.get(encoded);
    if (cached !== undefined) {
      this.ready.delete(encoded);
      this.ready.set(encoded, cached);
      return { result: Promise.resolve(cached), cancel: () => undefined };
    }
    let entry = this.pending.get(encoded);
    if (!entry || entry.controller.signal.aborted) {
      const controller = new AbortController();
      const result = this.create(key, controller.signal).then((value) => {
        if (!controller.signal.aborted) {
          this.remember(encoded, value);
        }
        return value;
      });
      entry = { controller, users: 0, result };
      this.pending.set(encoded, entry);
      result.then(
        () => {
          if (this.pending.get(encoded) === entry) {
            this.pending.delete(encoded);
          }
        },
        () => {
          if (this.pending.get(encoded) === entry) {
            this.pending.delete(encoded);
          }
        },
      );
    }
    entry.users += 1;
    let cancelled = false;
    return {
      result: entry.result,
      cancel: () => {
        if (cancelled) {
          return;
        }
        cancelled = true;
        entry!.users -= 1;
        if (entry!.users === 0) {
          entry!.controller.abort();
        }
      },
    };
  }

  private remember(key: string, value: T): void {
    this.ready.set(key, value);
    if (this.ready.size > this.capacity) {
      this.ready.delete(this.ready.keys().next().value!);
    }
  }
}
