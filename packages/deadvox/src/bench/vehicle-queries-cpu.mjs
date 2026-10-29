import { readdirSync, readFileSync } from 'node:fs';
import { cpus, hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { buildRegistry } from '../core/content.ts';
import { Inventory } from '../core/inventory.ts';
import { bodyOverlapsTerrain, stepBody } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import { VehicleOccupancy } from '../core/vehicleProjection.ts';
import { VehicleQuerySeam } from './vehicleQuerySeam.ts';
import { VehicleRapierQueries, vehicleSnapshot } from './vehicleRapier.ts';

await RAPIER.init();
const base = resolve(dirname(fileURLToPath(import.meta.url)), '../content/base');
const { registry } = buildRegistry(
  readdirSync(base)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) })),
);
const blockSize = 0.5;
const batches = 9;
const repetitions = 2000;
let sink = 0;
const stats = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
};
const measure = (fn, n = repetitions) => {
  for (let i = 0; i < n; i++) {
    fn(i);
  }
  const times = [];
  for (let batch = 0; batch < batches; batch++) {
    const start = performance.now();
    for (let i = 0; i < n; i++) {
      fn(i);
    }
    times.push(((performance.now() - start) * 1000) / n);
  }
  return stats(times);
};
const terrain = (_x, y) => y < 0;
const actor = (i, count) => ({
  pos: [(i % count) * 12 - 3, 0, -2],
  vel: [1, 0, 1],
  halfWidth: 0.5,
  height: 3,
  onGround: true,
});
console.log(
  JSON.stringify({
    machine: hostname(),
    cpu: cpus()[0]?.model,
    node: process.version,
    batches,
    repetitions,
    units: 'microseconds per operation; frames include 1 player + 20 box zombie/probe bodies, not AI',
    scenario: 'hatchbacks facing north, 12-block X spacing; 0.5m cells; floor y<0; 21 actors distributed beside cars',
  }),
);
for (const count of [1, 10, 50]) {
  const inventory = new Inventory(registry);
  const ids = [];
  for (let i = 0; i < count; i++) {
    ids.push(
      inventory.registerVehicle({
        blueprint: 'hatchback',
        placementKey: `bench-${i}`,
        origin: [i * 12, 0, 0],
        facing: 'n',
      }),
    );
  }
  const snapshot = () => vehicleSnapshot(registry, inventory.vehicles, blockSize);
  const rapier = new VehicleRapierQueries();
  const coarse = new VehicleOccupancy(registry, inventory.vehicles, blockSize);
  const solid = (x, y, z) => terrain(x, y, z) || coarse.isSolid(x, y, z);
  const seam = new VehicleQuerySeam(rapier, terrain, blockSize);
  const before = process.memoryUsage();
  const build = { rapier: [], cells: [] };
  for (let batch = 0; batch < batches; batch++) {
    const q = new VehicleRapierQueries();
    let start = performance.now();
    q.sync(snapshot());
    build.rapier.push((performance.now() - start) * 1000);
    q.free();
    const c = new VehicleOccupancy(registry, inventory.vehicles, blockSize);
    start = performance.now();
    c.isSolid(0, 0, 0);
    build.cells.push((performance.now() - start) * 1000);
  }
  rapier.sync(snapshot());
  coarse.isSolid(0, 0, 0);
  const after = process.memoryUsage();
  const queryPoint = (i) => [(i % count) * 6 + (i % 8) * 0.2 - 1, 0.5, (i % 7) * 0.2 - 1];
  const rows = {};
  for (const mode of ['cells', 'rapier']) {
    const point = mode === 'rapier' ? seam.point : (p) => solid(...p.map((v) => Math.floor(v / blockSize)));
    rows[mode] = {
      solidShape: measure((i) => {
        const b = actor(i, count);
        sink += Number(mode === 'rapier' ? seam.shapeOf(b).overlapsTerrain(b.pos) : bodyOverlapsTerrain(b, solid));
      }),
      ray: measure((i) => {
        const p = queryPoint(i);
        sink += Number(
          mode === 'rapier'
            ? seam.ray(p, [0, 0, 1], 5) !== undefined
            : raycast(
                p.map((v) => v / blockSize),
                [0, 0, 1],
                5 / blockSize,
                solid,
              ) !== undefined,
        );
      }),
      throwSample: measure((i) => {
        sink += Number(point(queryPoint(i)));
      }),
      frame: measure((i) => {
        for (let j = 0; j < 21; j++) {
          const b = actor(i + j, count);
          stepBody(b, 1 / 60, mode === 'rapier' ? terrain : solid, {
            gravity: 19.6,
            stepHeight: 0.5,
            ...(mode === 'rapier' ? { shapeOf: seam.shapeOf } : {}),
          });
          sink += b.pos[0];
        }
      }, 200),
    };
  }
  const [id] = ids;
  const original = inventory.vehicles.get(id);
  const removed = { ...original, fittings: original.fittings.slice(1) };
  const update = { rapier: [], cells: [] };
  for (let batch = 0; batch < batches; batch++) {
    inventory.vehicles.replace(registry, id, removed);
    let start = performance.now();
    rapier.sync(snapshot());
    update.rapier.push((performance.now() - start) * 1000);
    start = performance.now();
    coarse.isSolid(0, 0, 0);
    update.cells.push((performance.now() - start) * 1000);
    inventory.vehicles.replace(registry, id, original);
    rapier.sync(snapshot());
    coarse.isSolid(0, 0, 0);
  }
  console.log(
    JSON.stringify({
      count,
      rows,
      build: { rapier: stats(build.rapier), cells: stats(build.cells) },
      detach: { rapier: stats(update.rapier), cells: stats(update.cells) },
      memory: {
        serializedRapierBytes: rapier.snapshotBytes(),
        combinedProcessDelta: {
          heapUsed: after.heapUsed - before.heapUsed,
          external: after.external - before.external,
          rss: after.rss - before.rss,
        },
      },
      colliders: snapshot().parts.reduce((n, part) => n + part.boxes.length, 0),
    }),
  );
  rapier.free();
}
console.log(JSON.stringify({ sink }));
