import { CHUNK, chunkKey, type Vec3 } from './coords.ts';
import { SKY_LOSS, type SkyBounds, type SkyVolume, skyIndex } from './skylight.ts';
import {
  containsSky,
  growSky,
  SKY_HALO,
  SKY_SHELL,
  type SkyChunk,
  type SkySnapshot,
  skyChunkMap,
} from './skySnapshot.ts';

export interface SkyResult {
  complete: boolean;
  heights: Float32Array;
  volume: SkyVolume | undefined;
}
type Visit = (column: readonly [number, number], y: number, flags: number, highest: number) => void;
interface Column {
  point: [number, number];
  index: number;
  furniture: SkyBounds[];
  roof: boolean;
  /** Still inside the column's topmost run of furniture-only cells. */
  furnitureTop: boolean;
  highest: number;
}
const BLOCK = 1;
const FURNITURE = 2;
function cellAt(snapshot: SkySnapshot, column: Column, chunk: SkyChunk | undefined, y: number): number {
  if (y > snapshot.top) {
    return 0;
  }
  const id = chunk?.uniform ?? chunk?.raw?.[column.index + CHUNK * CHUNK * (y & (CHUNK - 1))];
  if (y < snapshot.bottom || id === undefined || snapshot.opacity[id]) {
    return BLOCK;
  }
  return column.furniture.some((box) => y >= box.min[1] && y < box.max[1]) ? FURNITURE : 0;
}
// The fallback roof sits below the column's topmost furniture: a receiver whose lookup lands in a coarse
// furniture cell beside a wall would otherwise read that cell as its own roof and go black in daylight.
function visitCell(
  column: Column,
  y: number,
  cell: number,
  { bounds, visit }: { bounds: SkyBounds; visit: Visit },
): void {
  const solid = cell !== 0;
  if (solid && !column.roof) {
    column.highest = y;
    column.furnitureTop = cell === FURNITURE;
  }
  column.furnitureTop &&= cell === FURNITURE;
  if (column.furnitureTop) {
    column.highest = y - 1;
  }
  column.roof ||= solid;
  if (y < bounds.max[1]) {
    visit(column.point, y, Number(solid) + Number(column.roof) * 2, column.highest);
  }
}
function scanColumn(
  snapshot: SkySnapshot,
  point: [number, number],
  context: { bounds: SkyBounds; visit: Visit; chunks: Map<string, SkyChunk> },
): void {
  const [x, z] = point;
  const { bounds, chunks } = context;
  const column: Column = {
    point,
    index: (x & (CHUNK - 1)) + CHUNK * (z & (CHUNK - 1)),
    furniture: snapshot.furniture.filter(
      (box) => x >= box.min[0] && x < box.max[0] && z >= box.min[2] && z < box.max[2],
    ),
    roof: false,
    furnitureTop: false,
    highest: snapshot.bottom - 1,
  };
  const start = Math.max(snapshot.top, bounds.max[1] - 1);
  for (let cy = Math.floor(start / CHUNK); cy >= Math.floor(bounds.min[1] / CHUNK); cy--) {
    const chunk = chunks.get(chunkKey(Math.floor(x / CHUNK), cy, Math.floor(z / CHUNK)));
    const hi = Math.min(start, (cy + 1) * CHUNK - 1);
    const lo = Math.max(bounds.min[1], cy * CHUNK);
    if (
      chunk?.uniform === 0 &&
      lo >= bounds.max[1] &&
      !column.furniture.some((box) => box.min[1] <= hi && box.max[1] > lo)
    ) {
      continue;
    }
    for (let y = hi; y >= lo; y--) {
      visitCell(column, y, cellAt(snapshot, column, chunk, y), context);
    }
  }
}
function scan(snapshot: SkySnapshot, bounds: SkyBounds, visit: Visit): void {
  const context = { bounds, visit, chunks: skyChunkMap(snapshot) };
  const [x0, , z0] = bounds.min;
  for (let z = z0; z < bounds.max[2]; z++) {
    for (let x = x0; x < bounds.max[0]; x++) {
      scanColumn(snapshot, [x, z], context);
    }
  }
}
interface Flood {
  volume: SkyVolume;
  blocked: Uint8Array;
  queue: Uint32Array;
  tail: number;
}
function offer(flood: Flood, index: number, value: number): void {
  if (!flood.blocked[index] && flood.volume.light[index] === 0) {
    flood.volume.light[index] = value;
    flood.queue[flood.tail] = index;
    flood.tail += 1;
  }
}
function floodAir(flood: Flood): void {
  const { volume } = flood;
  const [sx, sy, sz] = volume.size;
  for (let head = 0; head < flood.tail; head++) {
    const index = flood.queue[head]!;
    const value = volume.light[index]! - SKY_LOSS;
    if (value <= 0) {
      continue;
    }
    const x = index % sx;
    const z = Math.floor(index / sx) % sz;
    const y = Math.floor(index / (sx * sz));
    if (x > 0) {
      offer(flood, index - 1, value);
    }
    if (x + 1 < sx) {
      offer(flood, index + 1, value);
    }
    if (z > 0) {
      offer(flood, index - sx, value);
    }
    if (z + 1 < sz) {
      offer(flood, index + sx, value);
    }
    if (y > 0) {
      offer(flood, index - sx * sz, value);
    }
    if (y + 1 < sy) {
      offer(flood, index + sx * sz, value);
    }
  }
}
function transport(snapshot: SkySnapshot, bounds: SkyBounds): SkyVolume {
  const size = bounds.max.map((value, axis) => value - bounds.min[axis]!) as Vec3;
  const volume = { ...bounds, size, light: new Uint8Array(size[0] * size[1] * size[2]) };
  const flood: Flood = {
    volume,
    blocked: new Uint8Array(volume.light.length),
    queue: new Uint32Array(volume.light.length),
    tail: 0,
  };
  scan(snapshot, bounds, ([x, z], y, flags) => {
    const index = skyIndex(size, x - bounds.min[0], y - bounds.min[1], z - bounds.min[2]);
    flood.blocked[index] = flags & 1;
    if (flags === 0) {
      volume.light[index] = 255;
      flood.queue[flood.tail] = index;
      flood.tail += 1;
    }
  });
  floodAir(flood);
  return volume;
}
function crop(volume: SkyVolume, bounds: SkyBounds): SkyVolume {
  const size = bounds.max.map((value, axis) => value - bounds.min[axis]!) as Vec3;
  const light = new Uint8Array(size[0] * size[1] * size[2]);
  const offset = bounds.min.map((value, axis) => value - volume.min[axis]!) as Vec3;
  for (let y = 0; y < size[1]; y++) {
    for (let z = 0; z < size[2]; z++) {
      const start = skyIndex(volume.size, offset[0], y + offset[1], z + offset[2]);
      light.set(volume.light.subarray(start, start + size[0]), skyIndex(size, 0, y, z));
    }
  }
  return { ...bounds, size, light };
}
export function buildSkyResult(snapshot: SkySnapshot): SkyResult {
  const { bounds } = snapshot;
  const heightBounds = growSky(bounds, SKY_HALO);
  const width = heightBounds.max[0] - heightBounds.min[0];
  const heights = new Float32Array(width * (heightBounds.max[2] - heightBounds.min[2])).fill(snapshot.top + 1);
  if (!snapshot.complete) {
    return { complete: false, heights, volume: undefined };
  }
  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  scan(snapshot, heightBounds, ([x, z], y, flags, highest) => {
    heights[x - heightBounds.min[0] + width * (z - heightBounds.min[2])] = highest;
    if (flags === 2 && containsSky(bounds, [x, y, z])) {
      const point: Vec3 = [x, y, z];
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, point[axis]!);
        max[axis] = Math.max(max[axis]!, point[axis]! + 1);
      }
    }
  });
  if (!Number.isFinite(min[0])) {
    return { complete: true, heights, volume: undefined };
  }
  const core = { min, max };
  return {
    complete: true,
    heights,
    volume: crop(transport(snapshot, growSky(core, SKY_HALO)), growSky(core, SKY_SHELL)),
  };
}

/** Matches linear texture sampling at voxel centres, including the clamped interpolation shell. */
export function sampleSky(volume: SkyVolume, point: Vec3): number {
  if (!containsSky(volume, point)) {
    return 0;
  }
  const cell = point.map((value, axis) =>
    Math.max(0, Math.min(volume.size[axis]! - 1, value - volume.min[axis]! - 0.5)),
  ) as Vec3;
  let sum = 0;
  for (let dy = 0; dy < 2; dy++) {
    for (let dz = 0; dz < 2; dz++) {
      for (let dx = 0; dx < 2; dx++) {
        const steps = [dx, dy, dz];
        const index = cell.map((value, axis) =>
          Math.min(volume.size[axis]! - 1, Math.floor(value) + steps[axis]!),
        ) as Vec3;
        const weight = cell.reduce((product, value, axis) => product * (steps[axis] ? value % 1 : 1 - (value % 1)), 1);
        sum += volume.light[skyIndex(volume.size, ...index)]! * weight;
      }
    }
  }
  return sum / 255;
}
