import { worldOpaque } from '../core/collision.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import type { Engine } from '../game/engine.ts';

type Field = ReturnType<NonNullable<Engine['skylight']>['inspect']>[number];
type Opaque = ReturnType<typeof worldOpaque>;
type Sample = (point: Vec3) => number;
interface Route {
  start: number;
  end: number;
  z: number;
}
interface RoomSample {
  point: Vec3;
  metres: Vec3;
  roof: number;
  cached: number;
  visible: number;
}

interface Probe {
  engine: Engine;
  rows: Field[];
  opaque: Opaque;
  top: number;
  sample: Sample;
  blockSize: number;
}
function columnTop(opaque: Opaque, x: number, z: number, { top, bottom }: { top: number; bottom: number }): number {
  for (let y = top; y >= bottom; y--) {
    if (opaque(x, y, z)) {
      return y;
    }
  }
  return Number.NEGATIVE_INFINITY;
}
function roomSample(row: Field, { opaque, blockSize, top, sample }: Probe): RoomSample | null {
  const b = row.bounds;
  let best: RoomSample | null = null;
  for (let z = b.min[2] + 1; z < b.max[2] - 1; z++) {
    for (let x = b.min[0] + 1; x < b.max[0] - 1; x++) {
      const roof = columnTop(opaque, x, z, { top, bottom: b.min[1] });
      for (let y = b.min[1] + 1; y < Math.min(b.max[1] - 1, roof); y++) {
        if (opaque(x, y, z)) {
          continue;
        }
        const point: Vec3 = [x + 0.5, y + 0.5, z + 0.5];
        const metres = point.map((v) => v * blockSize) as Vec3;
        const cached = row.volume!.sample(point);
        if (!best || cached > best.cached) {
          best = { point, metres, roof, cached, visible: sample(metres) };
        }
      }
    }
  }
  return best;
}
function canopyColumn({ engine, rows, opaque, top, sample, blockSize }: Probe, x: number, z: number) {
  for (let y = top; y > 0; y--) {
    const definition = engine.registry.blocks[engine.world.getBlock(x, y, z)];
    if (!definition || definition.solid || !definition.opaque || opaque(x, y - 1, z)) {
      continue;
    }
    const point: Vec3 = [x + 0.5, y - 0.5, z + 0.5];
    if (rows.some((row) => point.every((v, a) => v >= row.bounds.min[a]! && v < row.bounds.max[a]!))) {
      continue;
    }
    const metres = point.map((v) => v * blockSize) as Vec3;
    return { point, metres, opaqueAbove: definition.id, estimate: sample(metres) };
  }
  return null;
}
function canopyEvidence(probe: Probe) {
  const { blockSize } = probe;
  const center = [394.25 / blockSize, 547.75 / blockSize];
  for (let z = Math.floor(center[1]!) - 8; z <= center[1]! + 8; z++) {
    for (let x = Math.floor(center[0]!) - 8; x <= center[0]! + 8; x++) {
      const found = canopyColumn(probe, x, z);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function collectSkyGeometry(engine: Engine, route: Route, sample: Sample) {
  const opaque = worldOpaque(engine.world, engine.registry, engine.entities);
  const rows = engine.skylight!.inspect();
  const { blockSize, maxCy } = engine.config.scale;
  const top = (maxCy + 1) * CHUNK - 1;
  const probe: Probe = { engine, rows, opaque, top, sample, blockSize };
  const roomEvidence = rows.flatMap((row, index) => {
    const b = row.bounds;
    const nearRoute =
      b.max[0] * blockSize >= route.start - 16 &&
      b.min[0] * blockSize <= route.end + 16 &&
      b.max[2] * blockSize >= route.z - 16 &&
      b.min[2] * blockSize <= route.z + 16;
    return nearRoute && row.complete && row.volume
      ? [{ index, bounds: b, resident: row.resident, current: row.current, sample: roomSample(row, probe) }]
      : [];
  });
  return { roomEvidence, canopy: canopyEvidence(probe) };
}
