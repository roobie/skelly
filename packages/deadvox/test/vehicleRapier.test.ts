import { readFileSync } from 'node:fs';
import standard from '@dimforge/rapier3d-compat';
import deterministic from '@dimforge/rapier3d-deterministic-compat';
import { beforeAll, expect, it } from 'vitest';
import { VehicleQuerySeam } from '../src/bench/vehicleQuerySeam.ts';
import { VehicleRapierQueries, vehicleSnapshot } from '../src/bench/vehicleRapier.ts';
import { convexPieces, readGlbMesh } from '../src/bench/vehicleShapes.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { stepBody } from '../src/core/physics.ts';
import { VehicleOccupancy } from '../src/core/vehicleProjection.ts';
import { baseRegistry } from './baseRegistry.ts';
import {
  panelBody as body,
  panelCells as cells,
  encodeReplay,
  panelSnapshot as fixture,
  panelFlight as flight,
  replayVehicleQueries as replay,
} from './fixtures/vehicleRapierReplay.ts';

beforeAll(async () => {
  await deterministic.init();
  await standard.init();
});

it('keeps the thin-panel side gap open for body movement, aim rays and throw samples that cells block', () => {
  const queries = new VehicleRapierQueries();
  try {
    queries.sync(fixture);
    const seam = new VehicleQuerySeam(queries, () => false, 1);
    const fine = body();
    const coarse = body();
    for (let frame = 0; frame < 180; frame++) {
      stepBody(fine, 1 / 60, seam.terrain, { gravity: 0, stepHeight: 0, shapeOf: seam.shapeOf });
      stepBody(coarse, 1 / 60, cells, { gravity: 0, stepHeight: 0 });
    }
    expect(fine.pos[2]).toBeGreaterThan(coarse.pos[2]);
    expect(seam.ray([0.25, 1, -0.5], [0, 0, 1], 4)).toBeUndefined();
    expect(queries.ray([0.85, 1, -0.5], [0, 0, 1], 4)).toBeDefined();
    expect(flight(seam.point).points.length).toBeGreaterThan(flight().points.length);
    const blocked = body();
    blocked.pos = [0.5, 0, 1];
    blocked.vel = [1, 0, 0];
    stepBody(blocked, 0.4, seam.terrain, { gravity: 0, stepHeight: 0, shapeOf: seam.shapeOf });
    expect(blocked.pos[0] + blocked.halfWidth).toBeLessThanOrEqual(fixture.parts[0]!.boxes[0]!.min[0]);
  } finally {
    queries.free();
  }
});

it('combines terrain and vehicle queries at non-unit block size and refreshes changed and removed parts', () => {
  const queries = new VehicleRapierQueries();
  try {
    queries.sync(fixture);
    const seam = new VehicleQuerySeam(queries, (_x, y) => y < 0, 0.5);
    expect(seam.point([0.85, 1, 1])).toBe(true);
    expect(seam.point([2, -0.1, 1])).toBe(true);
    expect(seam.ray([2, 1, 1], [0, -1, 0], 3)).toBe(1);
    const changed = {
      version: 1,
      parts: [{ key: 'parked/panel', boxes: [{ min: [2, 0, 0] as Vec3, max: [2.1, 2, 3] as Vec3 }] }],
    };
    queries.sync(changed);
    expect(seam.point([0.85, 1, 1])).toBe(false);
    expect(seam.point([2.05, 1, 1])).toBe(true);
    queries.sync({ version: 2, parts: [] });
    expect(seam.point([2.05, 1, 1])).toBe(false);
    expect(seam.ray([2, 1, 1], [0, -1, 0], 3)).toBe(1);
  } finally {
    queries.free();
  }
});

it('rebuilds exported fitting geometry from the vehicle owner revision after detachment', () => {
  const registry = baseRegistry();
  const inventory = new Inventory(registry);
  const id = inventory.registerVehicle({
    blueprint: 'hatchback',
    placementKey: 'rapier-query',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const queries = new VehicleRapierQueries();
  try {
    const snapshot = vehicleSnapshot(registry, inventory.vehicles, 0.5);
    expect(snapshot.parts.length).toBeGreaterThan(0);
    queries.sync(snapshot);
    const box = snapshot.parts.flatMap((part) => part.boxes)[0]!;
    const center = box.min.map((v, a) => (v + box.max[a]!) / 2) as Vec3;
    expect(queries.point(center)).toBe(true);
    const coarse = new VehicleOccupancy(registry, inventory.vehicles, 0.5);
    expect(coarse.isSolid(...(center.map((v) => Math.floor(v / 0.5)) as Vec3))).toBe(true);
    inventory.vehicles.replace(registry, id, { ...inventory.vehicles.get(id)!, fittings: [] });
    queries.sync(vehicleSnapshot(registry, inventory.vehicles, 0.5));
    expect(queries.point(center)).toBe(false);
  } finally {
    queries.free();
  }
});

it('preserves signed zero and undefined output fields in the browser replay encoding', () => {
  expect(encodeReplay({ poses: [[0]], rays: [undefined] })).not.toEqual(
    encodeReplay({ poses: [[-0]], rays: [undefined] }),
  );
  expect(encodeReplay({ rays: [undefined] })).not.toEqual(encodeReplay({ rays: [null] }));
  expect(encodeReplay({ rays: undefined })).not.toEqual(encodeReplay({}));
});

it('replays movement, contact, oblique rays, edge probes and throws identically in repeated runs of every tier', () => {
  const first = replay(deterministic, shellBytes);
  for (const tier of ['boxes', 'hulls', 'mesh'] as const) {
    expect(first[tier]!.poses.length).toBeGreaterThan(0);
    expect(first[tier]!.panel.rapierFloats).toBeGreaterThan(0);
    expect(first[tier]!.part!.rapierFloats).toBeGreaterThan(0);
  }
  expect(encodeReplay(replay(deterministic, shellBytes))).toEqual(encodeReplay(first));
  expect(replay(standard as unknown as typeof deterministic).boxes).toEqual(replay(deterministic).boxes);
});

const modelDir = new URL('../src/content/base/assets/models/', import.meta.url);
const shellBytes = new Uint8Array(readFileSync(new URL('hatchback_shell.glb', modelDir)));

const tiersOf = (model: string) => {
  const registry = baseRegistry();
  const boxes = Object.values(registry.models.get(model)!.parts!).flatMap((part) => part.collision!);
  const mesh = readGlbMesh(new Uint8Array(readFileSync(new URL(`${model}.glb`, modelDir))));
  const shape = { signature: model, pieces: convexPieces(mesh).pieces, mesh };
  const snapshot = { version: 0, parts: [{ key: model, boxes, shape }] };
  const bounds = {
    min: [0, 1, 2].map((a) => Math.min(...boxes.map((b) => b.min[a]!))) as Vec3,
    max: [0, 1, 2].map((a) => Math.max(...boxes.map((b) => b.max[a]!))) as Vec3,
  };
  const queries = Object.fromEntries(
    (['boxes', 'hulls', 'mesh'] as const).map((tier) => {
      const q = new VehicleRapierQueries(deterministic, tier);
      q.sync(snapshot);
      return [tier, q];
    }),
  ) as Record<'boxes' | 'hulls' | 'mesh', VehicleRapierQueries>;
  const free = (): void => {
    for (const q of Object.values(queries)) {
      q.free();
    }
  };
  return { queries, bounds, free };
};

const downRays = (min: Vec3, max: Vec3): Vec3[] =>
  Array.from(
    { length: 17 * 17 },
    (_, n): Vec3 => [
      min[0] + ((max[0] - min[0]) * ((n % 17) + 0.37)) / 17,
      max[1] + 1,
      min[2] + ((max[2] - min[2]) * (Math.floor(n / 17) + 0.61)) / 17,
    ],
  );

it.each(['hatchback_windscreen', 'hatchback_shell'])(
  'lets rays from above through hollows of the fitted boxes of %s (a single-box part also never stops short)',
  (model) => {
    const { queries, bounds, free } = tiersOf(model);
    try {
      const miss = Number.POSITIVE_INFINITY;
      for (const tier of ['hulls', 'mesh'] as const) {
        let longer = 0;
        for (const origin of downRays(bounds.min, bounds.max)) {
          const fitted = queries.boxes.ray(origin, [0, -1, 0], 10) ?? miss;
          const drawn = queries[tier].ray(origin, [0, -1, 0], 10) ?? miss;
          if (model === 'hatchback_windscreen') {
            // Rapier's convex ray cast is approximate to a few millimetres, so "never short" allows a centimetre.
            expect(drawn).toBeGreaterThanOrEqual(fitted - 0.01);
          }
          longer += drawn > fitted + 1e-3 ? 1 : 0;
        }
        expect(longer, tier).toBeGreaterThan(0);
      }
    } finally {
      free();
    }
  },
);

it('keeps a body out of the empty corner of a sloped panel only when the collider follows the drawn panel', () => {
  const { queries, bounds, free } = tiersOf('hatchback_windscreen');
  try {
    const size = 0.04;
    const cornerBoxes = [0, 1, 2, 3, 4, 5, 6, 7].map((c): [Vec3, Vec3] => {
      const low: Vec3 = [0, 1, 2].map((a) => ((c >> a) & 1 ? bounds.max[a]! - size : bounds.min[a]!)) as Vec3;
      return [low, low.map((v) => v + size) as Vec3];
    });
    const touches = (tier: 'boxes' | 'hulls' | 'mesh') =>
      cornerBoxes.map(([lo, hi]) => queries[tier].overlapsBox(lo, hi));
    const fitted = touches('boxes');
    expect(fitted.every(Boolean)).toBe(true);
    expect(touches('hulls').some((hit) => !hit)).toBe(true);
    expect(touches('mesh').some((hit) => !hit)).toBe(true);
  } finally {
    free();
  }
});

it('answers a static triangle mesh only on its surface, while a convex piece also fills its inside', () => {
  const { queries, free } = tiersOf('hatchback_engine');
  try {
    const [piece] = convexPieces(
      readGlbMesh(new Uint8Array(readFileSync(new URL('hatchback_engine.glb', modelDir)))),
    ).pieces.toSorted((a, b) => b.length - a.length);
    const inside = [0, 1, 2].map((a) => {
      let sum = 0;
      for (let i = a; i < piece!.length; i += 3) {
        sum += piece![i]!;
      }
      return sum / (piece!.length / 3);
    }) as Vec3;
    const tiny = (centre: Vec3): [Vec3, Vec3] => [
      centre.map((v) => v - 1e-3) as Vec3,
      centre.map((v) => v + 1e-3) as Vec3,
    ];
    expect(queries.hulls.overlapsBox(...tiny(inside))).toBe(true);
    expect(queries.mesh.overlapsBox(...tiny(inside))).toBe(false);
  } finally {
    free();
  }
});
