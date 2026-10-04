// A bounded voxel approximation to diffuse sky transport. Direct sun/torch light remains shadowed separately.
import type { Vec3 } from './coords.ts';
import type { SolidAt } from './raycast.ts';

export interface SkyBounds {
  min: Vec3;
  max: Vec3;
}
export interface SkyVolume extends SkyBounds {
  size: Vec3;
  light: Uint8Array;
}
/** Diffuse transport loses this much per half-metre air cell; never passes through an opaque voxel. */
export const SKY_LOSS = 24;
export const skyIndex = ([sx, , sz]: Vec3, x: number, y: number, z: number): number => x + sx * (z + sz * y);
interface Flood {
  volume: SkyVolume;
  blocked: Uint8Array;
  queue: number[];
}

const seedColumn = (
  { volume, blocked, queue }: Flood,
  { top, opaque, skyAbove }: { top: number; opaque: SolidAt; skyAbove: Map<string, boolean> | undefined },
  [x, z]: [number, number],
): void => {
  const wx = x + volume.min[0];
  const wz = z + volume.min[2];
  const key = `${wx},${wz}`;
  let open = skyAbove?.get(key);
  if (open === undefined) {
    open = true;
    for (let y = top; y >= volume.max[1]; y--) {
      if (opaque(wx, y, wz)) {
        open = false;
        break;
      }
    }
    skyAbove?.set(key, open);
  }
  let roof = open ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (let y = volume.max[1] - 1; y >= volume.min[1]; y--) {
    const solid = opaque(x + volume.min[0], y, z + volume.min[2]);
    if (solid && roof === Number.NEGATIVE_INFINITY) {
      roof = y;
    }
    const ly = y - volume.min[1];
    const index = skyIndex(volume.size, x, ly, z);
    blocked[index] = Number(solid);
    if (!solid && y > roof) {
      volume.light[index] = 255;
      queue.push(index);
    }
  }
};

const floodAir = ({ volume, blocked, queue }: Flood): void => {
  const [sx, sy, sz] = volume.size;
  for (const index of queue) {
    const value = Math.max(0, volume.light[index]! - SKY_LOSS);
    if (value === 0) {
      continue;
    }
    const x = index % sx;
    const z = Math.floor(index / sx) % sz;
    const y = Math.floor(index / (sx * sz));
    const visit = (next: number) => {
      if (!blocked[next] && volume.light[next] === 0) {
        volume.light[next] = value;
        queue.push(next);
      }
    };
    if (x > 0) {
      visit(index - 1);
    }
    if (x + 1 < sx) {
      visit(index + 1);
    }
    if (z > 0) {
      visit(index - sx);
    }
    if (z + 1 < sz) {
      visit(index + sx);
    }
    if (y > 0) {
      visit(index - sx * sz);
    }
    if (y + 1 < sy) {
      visit(index + sx * sz);
    }
  }
};

export const buildSkylight = (
  bounds: SkyBounds,
  top: number,
  opaque: SolidAt,
  skyAbove?: Map<string, boolean>,
): SkyVolume => {
  const size = bounds.max.map((value, i) => value - bounds.min[i]!) as Vec3;
  const volume = { ...bounds, size, light: new Uint8Array(size[0] * size[1] * size[2]) };
  const flood: Flood = { volume, blocked: new Uint8Array(volume.light.length), queue: [] };
  for (let z = 0; z < size[2]; z++) {
    for (let x = 0; x < size[0]; x++) {
      seedColumn(flood, { top, opaque, skyAbove }, [x, z]);
    }
  }
  // Equal-cost, multi-source flood: each air cell is queued once at its shortest sky distance.
  floodAir(flood);
  return volume;
};
