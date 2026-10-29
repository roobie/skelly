import { readdirSync, readFileSync } from 'node:fs';
import { cpus, hostname } from 'node:os';
import process from 'node:process';
import { buildRegistry } from '../core/content.ts';
import { Inventory } from '../core/inventory.ts';
import { stepBody } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import { VehicleBoxes } from '../core/vehicleBoxes.ts';
import { projectVehicleParts, VehicleOccupancy } from '../core/vehicleProjection.ts';
import { probeHeading } from '../core/zombies.ts';

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
const scenario = {
  blockSize: 0.5,
  counts: [1, 10, 50],
  actors: 21,
  batches: 9,
  queriesPerBatch: 2000,
  framesPerBatch: 200,
  spacing: [16, 24],
  columns: 10,
  dt: 1 / 60,
  body: { halfWidth: 0.6, height: 3.4 },
  physics: { gravity: 20, stepHeight: 0.5 },
};
const terrain = (_x, y, _z) => y < 0;
let checksum = 0;
const summary = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { n: samples.length, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
};
const measure = (fn, count) => {
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    checksum += Number(fn(i) ?? 0);
  }
  return ((performance.now() - start) * 1000) / count;
};
const create = (count, mode) => {
  const inventory = new Inventory(registry);
  const ids = [];
  for (let i = 0; i < count; i++) {
    ids.push(
      inventory.registerVehicle({
        blueprint: 'hatchback',
        placementKey: `bench-${i}`,
        origin: [
          (i % scenario.columns) * scenario.spacing[0],
          0,
          Math.floor(i / scenario.columns) * scenario.spacing[1],
        ],
        facing: 'n',
      }),
    );
  }
  const cells = new VehicleOccupancy(registry, inventory.vehicles, scenario.blockSize);
  const boxes = new VehicleBoxes(registry, inventory.vehicles, scenario.blockSize);
  const coarse = (x, y, z) => terrain(x, y, z) || cells.isSolid(x, y, z);
  const solid = mode === 'cells' ? coarse : terrain;
  const point =
    mode === 'cells' ? (p) => coarse(...p.map(Math.floor)) : (p) => terrain(...p.map(Math.floor)) || boxes.contains(p);
  const ray =
    mode === 'cells' ? (o, d, range) => raycast(o, d, range, coarse) : (o, d, range) => boxes.ray(o, d, range, terrain);
  const shapeOf = mode === 'cells' ? undefined : (body) => boxes.shape(body, terrain);
  return { inventory, ids, solid, point, ray, shapeOf };
};
const pointsFor = ({ inventory }) =>
  [...inventory.vehicles.records].flatMap(([id, vehicle]) =>
    projectVehicleParts(registry, id, vehicle, scenario.blockSize).flatMap((part) =>
      part.boxes.flatMap((box) => {
        const centre = box.min.map((v, axis) => (v + box.max[axis]) / 2 / scenario.blockSize);
        return [centre, centre.map((v, axis) => v + (axis === 0 ? 0.6 : 0))];
      }),
    ),
  );
const runQueries = (q) => {
  const points = pointsFor(q);
  const at = (i) => points[i % points.length];
  const tests = {
    solid: (i) => q.point(at(i)),
    ray: (i) => {
      const p = at(i);
      return q.ray([p[0], p[1], p[2] - 8], [0, 0, 1], 16)?.distance;
    },
    throwSample: (i) => {
      const metres = at(i).map((v) => v * scenario.blockSize);
      return q.point(metres.map((v) => v / scenario.blockSize));
    },
  };
  const result = {};
  for (const [name, fn] of Object.entries(tests)) {
    measure(fn, scenario.queriesPerBatch);
    result[name] = summary(Array.from({ length: scenario.batches }, () => measure(fn, scenario.queriesPerBatch)));
  }
  const original = q.inventory.vehicles.get(q.ids[0]);
  const leaf = original.fittings.find((f) => !original.fittings.some((other) => other.supportedBy.includes(f.id)));
  const update = [];
  for (let i = 0; i < scenario.batches; i++) {
    q.inventory.vehicles.replace(registry, q.ids[0], original);
    q.point(at(0));
    q.inventory.vehicles.replace(registry, q.ids[0], {
      ...original,
      fittings: original.fittings.filter((f) => f !== leaf),
    });
    update.push(measure(() => q.point(at(0)), 1));
  }
  result.detachRebuild = summary(update);
  q.inventory.vehicles.replace(registry, q.ids[0], original);
  return result;
};
const runFrames = (q) => {
  const vehicles = [...q.inventory.vehicles.records].map(([, vehicle]) => vehicle);
  const frameBatches = [];
  for (let batch = -1; batch < scenario.batches; batch++) {
    const actors = Array.from({ length: scenario.actors }, (_, i) => {
      const { origin } = vehicles[i % vehicles.length];
      return {
        ...scenario.body,
        pos: [origin[0] + 4 + (i % 3), 0, origin[2] - 5 - Math.floor(i / vehicles.length) * 0.1],
        vel: [0, 0, 0],
        onGround: true,
      };
    });
    const perFrame = measure((frame) => {
      for (const actor of actors) {
        actor.vel[2] = frame % 100 < 50 ? 2 : -2;
        stepBody(actor, scenario.dt, q.solid, { ...scenario.physics, shapeOf: q.shapeOf });
        checksum += actor.pos[2];
        checksum += probeHeading(
          {
            body: actor,
            intent: [0, 0, 1],
            isSolid: q.solid,
            physics: { ...scenario.physics, shapeOf: q.shapeOf },
            blockSize: scenario.blockSize,
          },
          [0, 0, 1],
          0.75,
        )[2];
      }
      return 0;
    }, scenario.framesPerBatch);
    if (batch >= 0) {
      frameBatches.push(perFrame);
    }
  }
  return summary(frameBatches);
};
console.log(
  JSON.stringify({
    machine: hostname(),
    cpu: cpus()[0]?.model,
    node: process.version,
    units: 'microseconds; query/frame rows are per-operation batch means',
    scenario,
    scope:
      '21 box actors: player plus zombie movement envelopes and one heading probe each; no perception, rendering, streaming or actor-pair separation',
  }),
);
for (const count of scenario.counts) {
  for (const mode of ['cells', 'boxes']) {
    const build = [];
    for (let i = 0; i < scenario.batches; i++) {
      const cold = create(count, mode);
      build.push(measure(() => cold.point([0, 1, 0]), 1));
    }
    const q = create(count, mode);
    console.log(JSON.stringify({ count, mode, build: summary(build), queries: runQueries(q), frame: runFrames(q) }));
  }
}
console.log(JSON.stringify({ checksum }));
