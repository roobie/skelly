import deterministic from '@dimforge/rapier3d-deterministic-compat';
import { VehicleQuerySeam } from '../../src/bench/vehicleQuerySeam.ts';
import { type PartSnapshot, VehicleRapierQueries } from '../../src/bench/vehicleRapier.ts';
import type { Vec3 } from '../../src/core/coords.ts';
import { steppedItemFlight } from '../../src/core/itemThrow.ts';
import { type Body, stepBody } from '../../src/core/physics.ts';

export const panelSnapshot: PartSnapshot = {
  version: 0,
  parts: [{ key: 'parked/panel', boxes: [{ min: [0.8, 0, 0], max: [0.9, 2, 3] }] }],
};
export const panelCells = (x: number, y: number, z: number): boolean => x === 0 && y >= 0 && y < 2 && z >= 0 && z < 3;
export const panelBody = (): Body => ({
  pos: [0.25, 0, -0.5],
  vel: [0, 0, 1],
  halfWidth: 0.1,
  height: 1,
  onGround: false,
});
export const panelFlight = (hitsPoint?: (p: Vec3) => boolean) =>
  steppedItemFlight({
    from: [0.25, 1, -0.5],
    direction: [0, 0, 1],
    distanceMetres: 4,
    gravityMetresPerSimSecondSquared: 1,
    flightSimSeconds: 1,
    drag: 0,
    blockSize: 1,
    minY: -1,
    isSolid: panelCells,
    ...(hitsPoint ? { hitsPoint } : {}),
  });

let initialization: Promise<void> | undefined;
export const initializeVehicleReplay = (): Promise<void> => {
  initialization ??= deterministic.init();
  return initialization;
};

export const replayVehicleQueries = (rapier: typeof deterministic = deterministic) => {
  const queries = new VehicleRapierQueries(rapier);
  try {
    queries.sync(panelSnapshot);
    const seam = new VehicleQuerySeam(queries, (_x, y) => y < 0, 1);
    const actor = panelBody();
    const poses: Vec3[] = [];
    for (let frame = 0; frame < 180; frame++) {
      stepBody(actor, 1 / 60, seam.terrain, { gravity: 9.8, stepHeight: 0, shapeOf: seam.shapeOf });
      poses.push([...actor.pos]);
    }
    return {
      poses,
      flight: panelFlight(seam.point),
      rays: [0.25, 0.85].map((x) => seam.ray([x, 1, -1], [0, 0, 1], 5)),
    };
  } finally {
    queries.free();
  }
};

export interface ReplayValue {
  path: string;
  value: string;
}

/** Preserve IEEE-754 bits (including signed zero) and absent values across Playwright's JSON boundary. */
export const encodeReplay = (output: unknown): ReplayValue[] => {
  const result: ReplayValue[] = [];
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'number') {
      view.setFloat64(0, value, false);
      result.push({ path, value: `f64:${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}` });
    } else if (Array.isArray(value)) {
      result.push({ path, value: `array:${value.length}` });
      value.forEach((entry, index) => {
        visit(entry, `${path}[${index}]`);
      });
    } else if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value);
      result.push({ path, value: `object:${JSON.stringify(entries.map(([key]) => key))}` });
      for (const [key, entry] of entries) {
        visit(entry, `${path}.${key}`);
      }
    } else {
      result.push({ path, value: `${typeof value}:${String(value)}` });
    }
  };
  visit(output, '$');
  return result;
};
