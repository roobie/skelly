import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { cpus, hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// One process per tier, so WASM memory (which only grows) is attributable to that tier's colliders.
const tierFlag = process.argv.indexOf('--tier');
if (tierFlag < 0) {
  for (const tier of ['boxes', 'hulls', 'mesh']) {
    execFileSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--tier', tier], {
      stdio: 'inherit',
    });
  }
  process.exit(0);
}
const tier = process.argv[tierFlag + 1];

let wasmMemory;
const { instantiate } = WebAssembly;
WebAssembly.instantiate = async (...args) => {
  const result = await instantiate.apply(WebAssembly, args);
  wasmMemory ??= (result.instance ?? result).exports.memory;
  return result;
};
const { default: RAPIER } = await import('@dimforge/rapier3d-deterministic-compat');
const { buildRegistry } = await import('../core/content.ts');
const { Inventory } = await import('../core/inventory.ts');
const { bodyOverlapsTerrain, stepBody } = await import('../core/physics.ts');
const { raycast } = await import('../core/raycast.ts');
const { VehicleOccupancy } = await import('../core/vehicleProjection.ts');
const { VehicleQuerySeam } = await import('./vehicleQuerySeam.ts');
const { VehicleRapierQueries, vehicleSnapshot } = await import('./vehicleRapier.ts');
const { convexPieces, parseConvexConfig, readGlbMesh } = await import('./vehicleShapes.ts');

await RAPIER.init();
const convexConfig = parseConvexConfig(
  JSON.parse(readFileSync(new URL('./vehicleShapes.config.json', import.meta.url), 'utf8')),
);
const wasmBytes = () => wasmMemory?.buffer.byteLength;
const base = resolve(dirname(fileURLToPath(import.meta.url)), '../content/base');
const { registry } = buildRegistry(
  readdirSync(base)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) })),
);
const blockSize = 0.5;
const bake = { models: 0, microseconds: 0 };
const baked = new Map();
/** Stands in for shapes an export would bake: only this tier's, read once per model, never inside a timed query or sync. */
const shapesOf = (model) => {
  let shapes = baked.get(model);
  if (!shapes) {
    const start = performance.now();
    const mesh = readGlbMesh(readFileSync(join(base, registry.models.get(model).file)));
    shapes = tier === 'hulls' ? { convex: convexPieces(mesh, convexConfig) } : { mesh };
    baked.set(model, shapes);
    bake.models += 1;
    bake.microseconds += (performance.now() - start) * 1000;
  }
  return shapes;
};
const shapeSource = tier === 'boxes' ? undefined : { tier, of: shapesOf };
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
const bodyOptions = { gravity: 19.6, stepHeight: 0.5 };
const fractions = [0.13, 0.37, 0.61, 0.83];
const contactFrames = 60;
const newBody = (slide) => ({
  pos: [...slide.pos],
  vel: [...slide.vel],
  halfWidth: 0.5,
  height: 3,
  onGround: true,
});
const boundsOfCar = (parts, id) => {
  const boxes = parts.filter((part) => part.key.startsWith(`${id}/`)).flatMap((part) => part.boxes);
  return {
    min: [0, 1, 2].map((a) => Math.min(...boxes.map((box) => box.min[a]))),
    max: [0, 1, 2].map((a) => Math.max(...boxes.map((box) => box.max[a]))),
  };
};
/**
 * Contact workload: world-space inputs (rays, points in metres; sliding bodies in cells) derived only from each car's
 * fitted-box bounds, so every tier receives the same inputs. Some rays and points hit and some miss; every body starts
 * beside a car's +x side and walks into it while drifting along its length.
 */
const contactInputs = (bounds) => {
  const inputs = { rays: [], points: [], slides: [] };
  for (const { min, max } of bounds) {
    const span = max.map((v, a) => v - min[a]);
    for (const u of fractions) {
      for (const v of fractions) {
        const toward = [-1, 0, 0];
        const length = span[0] + 2;
        inputs.rays.push({
          origin: [max[0] + 1, min[1] + span[1] * u, min[2] + span[2] * v],
          direction: toward,
          length,
        });
        inputs.rays.push({ origin: [max[0] + 1, max[1] + 0.5 + u, min[2] + span[2] * v], direction: toward, length });
        inputs.points.push([min[0] + span[0] * u, min[1] + span[1] * v, min[2] + span[2] * 0.5]);
        inputs.points.push([max[0] + 0.25 + u, min[1] + span[1] * v, min[2] + span[2] * u]);
      }
    }
    for (const v of fractions) {
      inputs.slides.push({
        pos: [(max[0] + 0.3) / blockSize, 0, (min[2] + span[2] * v) / blockSize],
        vel: [-3, 0, 1.5],
      });
    }
  }
  return inputs;
};
/** Hit and contact counts, taken outside timing; a workload that never touches a car is a bench defect. */
const coverageOf = (mode, inputs) => {
  const rayHits = inputs.rays.filter((r) => mode.ray(r.origin, r.direction, r.length)).length;
  const pointHits = inputs.points.filter((p) => mode.point(p)).length;
  let blockedFrames = 0;
  let slidingRuns = 0;
  for (const slide of inputs.slides) {
    const body = newBody(slide);
    const free = newBody(slide);
    for (let frame = 0; frame < contactFrames; frame++) {
      mode.step(body);
      stepBody(free, 1 / 60, terrain, bodyOptions);
      blockedFrames += body.pos.some((v, a) => v !== free.pos[a]) ? 1 : 0;
    }
    slidingRuns += body.pos[0] !== free.pos[0] && body.pos[2] !== slide.pos[2] ? 1 : 0;
  }
  const coverage = {
    rays: { total: inputs.rays.length, hits: rayHits },
    points: { total: inputs.points.length, hits: pointHits },
    slides: { total: inputs.slides.length, frames: contactFrames, blockedFrames, slidingRuns },
  };
  // Points are reported but not required to hit: a static triangle mesh has no interior, so it answers none.
  if (rayHits === 0 || rayHits === inputs.rays.length || blockedFrames === 0) {
    throw new Error(`Contact workload does not hit, miss and contact: ${JSON.stringify(coverage)}`);
  }
  return coverage;
};
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
    scenario:
      'hatchbacks facing north, origins 12 cells apart in X (6 m at 0.5 m cells); floor y<0. Bodies, floor and cells are in cells; Rapier rays and points are in metres',
    singleStepRows:
      'frame, solidShape, ray and throwSample: fresh actors and probes each repetition, one step, never sustained contact; hit counts are in singleStep.coverage',
    contactRows: `ray, throwSample and slide: shared world-space inputs derived from fitted-box bounds; slide is ${contactFrames} frames of one body walking into a car side`,
    convexConfig,
    tier,
    wasmMemoryBytesAfterInit: wasmBytes() ?? 'not measured',
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
  const snapshot = () => vehicleSnapshot(registry, inventory.vehicles, blockSize, shapeSource);
  snapshot();
  const wasmBefore = wasmBytes();
  const rapier = new VehicleRapierQueries(RAPIER, tier);
  const coarse = new VehicleOccupancy(registry, inventory.vehicles, blockSize);
  const solid = (x, y, z) => terrain(x, y, z) || coarse.isSolid(x, y, z);
  const seam = new VehicleQuerySeam(rapier, terrain, blockSize);
  const before = process.memoryUsage();
  const build = { rapier: [], cells: [] };
  for (let batch = 0; batch < batches; batch++) {
    const q = new VehicleRapierQueries(RAPIER, tier);
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
  const wasmAfter = wasmBytes();
  const after = process.memoryUsage();
  const queryPoint = (i) => [(i % count) * 6 + (i % 8) * 0.2 - 1, 0.5, (i % 7) * 0.2 - 1];
  const { parts } = snapshot();
  const inputs = contactInputs(ids.map((carId) => boundsOfCar(parts, carId)));
  const modes = {
    cells: {
      point: (p) => solid(...p.map((v) => Math.floor(v / blockSize))),
      ray: (origin, direction, length) =>
        raycast(
          origin.map((v) => v / blockSize),
          direction,
          length / blockSize,
          solid,
        ) !== undefined,
      step: (b) => stepBody(b, 1 / 60, solid, bodyOptions),
    },
    rapier: {
      point: seam.point,
      ray: (origin, direction, length) => seam.ray(origin, direction, length) !== undefined,
      step: (b) => stepBody(b, 1 / 60, terrain, { ...bodyOptions, shapeOf: seam.shapeOf }),
    },
  };
  const contact = {};
  const coverage = {};
  for (const [name, mode] of Object.entries(modes)) {
    coverage[name] = coverageOf(mode, inputs);
    contact[name] = {
      ray: measure((i) => {
        const r = inputs.rays[i % inputs.rays.length];
        sink += Number(mode.ray(r.origin, r.direction, r.length));
      }),
      throwSample: measure((i) => {
        sink += Number(mode.point(inputs.points[i % inputs.points.length]));
      }),
      slide: measure((i) => {
        const body = newBody(inputs.slides[i % inputs.slides.length]);
        for (let frame = 0; frame < contactFrames; frame++) {
          mode.step(body);
        }
        sink += body.pos[2];
      }, 200),
    };
  }
  const singleStepCoverage = {
    rayHits: Array.from({ length: 200 }, (_, i) => queryPoint(i)).filter((p) => seam.ray(p, [0, 0, 1], 5) !== undefined)
      .length,
    pointHits: Array.from({ length: 200 }, (_, i) => queryPoint(i)).filter((p) => seam.point(p)).length,
    bodiesOverlapping: Array.from({ length: 200 }, (_, i) => actor(i, count)).filter((b) =>
      seam.shapeOf(b).overlapsTerrain(b.pos),
    ).length,
    samples: 200,
  };
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
  const leaf = original.fittings.find((f) => !original.fittings.some((other) => other.supportedBy.includes(f.id)));
  if (!leaf) {
    throw new Error('Benchmark vehicle has no detachable support leaf');
  }
  const removed = { ...original, fittings: original.fittings.filter((f) => f !== leaf) };
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
      singleStep: { rows, coverage: singleStepCoverage },
      contact: {
        rows: contact,
        coverage,
        inputs: createHash('sha256').update(JSON.stringify(inputs)).digest('hex').slice(0, 16),
      },
      build: { rapier: stats(build.rapier), cells: stats(build.cells) },
      detach: { rapier: stats(update.rapier), cells: stats(update.cells) },
      removedFitting: leaf.id,
      memory: {
        serializedRapierBytes: rapier.snapshotBytes(),
        combinedProcessDelta: {
          heapUsed: after.heapUsed - before.heapUsed,
          external: after.external - before.external,
          rss: after.rss - before.rss,
        },
      },
      wasmMemory:
        wasmBefore === undefined
          ? 'not measured'
          : { before: wasmBefore, after: wasmAfter, growth: wasmAfter - wasmBefore },
      counts: rapier.counts(),
      perCar: Object.fromEntries(Object.entries(rapier.counts()).map(([k, v]) => [k, v / count])),
      bake: { ...bake },
    }),
  );
  rapier.free();
}
console.log(JSON.stringify({ sink }));
