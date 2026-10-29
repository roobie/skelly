import { readdirSync, readFileSync } from 'node:fs';
import { cpus, hostname } from 'node:os';
import process from 'node:process';
import { buildRegistry } from '../core/content.ts';
import { Inventory } from '../core/inventory.ts';
import { bodyOverlapsTerrain, stepBody } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import { VehicleBoxes } from '../core/vehicleBoxes.ts';
import { VehicleOccupancy } from '../core/vehicleProjection.ts';

const base = new URL('../content/base/', import.meta.url);
const { registry } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(new URL(file, base), 'utf8')),
    })),
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
    frameRepetitions: 200,
    buildSamples: batches,
    detachSamples: batches,
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
  const boxes = new VehicleBoxes(registry, inventory.vehicles, blockSize);
  const coarse = new VehicleOccupancy(registry, inventory.vehicles, blockSize);
  const solid = (x, y, z) => terrain(x, y, z) || coarse.isSolid(x, y, z);
  const shapeOf = (body) => boxes.shape(body, terrain);
  const build = { boxes: [], cells: [] };
  for (let batch = 0; batch < batches; batch++) {
    const q = new VehicleBoxes(registry, inventory.vehicles, blockSize);
    let start = performance.now();
    q.contains([0, 0, 0]);
    build.boxes.push((performance.now() - start) * 1000);
    const c = new VehicleOccupancy(registry, inventory.vehicles, blockSize);
    start = performance.now();
    c.isSolid(0, 0, 0);
    build.cells.push((performance.now() - start) * 1000);
  }
  boxes.contains([0, 0, 0]);
  coarse.isSolid(0, 0, 0);
  const queryPoint = (i) => [(i % count) * 6 + (i % 8) * 0.2 - 1, 0.5, (i % 7) * 0.2 - 1];
  const rows = {};
  for (const mode of ['cells', 'boxes']) {
    const point =
      mode === 'boxes'
        ? (p) => terrain(...p.map((v) => Math.floor(v / blockSize))) || boxes.contains(p.map((v) => v / blockSize))
        : (p) => solid(...p.map((v) => Math.floor(v / blockSize)));
    rows[mode] = {
      solidShape: measure((i) => {
        const b = actor(i, count);
        sink += Number(mode === 'boxes' ? shapeOf(b).overlapsTerrain(b.pos) : bodyOverlapsTerrain(b, solid));
      }),
      ray: measure((i) => {
        const p = queryPoint(i).map((v) => v / blockSize);
        sink += Number(
          mode === 'boxes'
            ? boxes.ray(p, [0, 0, 1], 5 / blockSize, terrain) !== undefined
            : raycast(p, [0, 0, 1], 5 / blockSize, solid) !== undefined,
        );
      }),
      throwSample: measure((i) => {
        sink += Number(point(queryPoint(i)));
      }),
      frame: measure((i) => {
        for (let j = 0; j < 21; j++) {
          const b = actor(i + j, count);
          stepBody(b, 1 / 60, mode === 'boxes' ? terrain : solid, {
            gravity: 19.6,
            stepHeight: 0.5,
            ...(mode === 'boxes' ? { shapeOf } : {}),
          });
          sink += b.pos[0];
        }
      }, 200),
    };
  }
  const [id] = ids;
  const original = inventory.vehicles.get(id);
  const leaf = original.fittings.find((f) => !original.fittings.some((other) => other.supportedBy.includes(f.id)));
  const removed = { ...original, fittings: original.fittings.filter((f) => f !== leaf) };
  const update = { boxes: [], cells: [] };
  for (let batch = 0; batch < batches; batch++) {
    inventory.vehicles.replace(registry, id, removed);
    let start = performance.now();
    boxes.contains([0, 0, 0]);
    update.boxes.push((performance.now() - start) * 1000);
    start = performance.now();
    coarse.isSolid(0, 0, 0);
    update.cells.push((performance.now() - start) * 1000);
    inventory.vehicles.replace(registry, id, original);
    boxes.contains([0, 0, 0]);
    coarse.isSolid(0, 0, 0);
  }
  console.log(
    JSON.stringify({
      count,
      rows,
      build: { boxes: stats(build.boxes), cells: stats(build.cells) },
      detach: { boxes: stats(update.boxes), cells: stats(update.cells) },
      removedFitting: leaf.id,
    }),
  );
}
console.log(JSON.stringify({ sink }));
