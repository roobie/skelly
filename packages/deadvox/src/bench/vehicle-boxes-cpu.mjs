import { readdirSync, readFileSync } from 'node:fs';
import { cpus, hostname } from 'node:os';
import process from 'node:process';
import { buildRegistry, requireDayCycle } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { dayPhaseAt } from '../core/dayPhase.ts';
import { Inventory } from '../core/inventory.ts';
import { stepBody } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import { makeScale } from '../core/scale.ts';
import { siteGenerationOf } from '../core/sitePalette.ts';
import { VehicleBoxes } from '../core/vehicleBoxes.ts';
import { projectVehicleParts, VehicleOccupancy } from '../core/vehicleProjection.ts';
import { probeHeading, ZombieSystem } from '../core/zombies.ts';
import { physicsFor, playerTuning } from '../game/player.ts';

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
const scale = makeScale(0.5);
const tuning = playerTuning(registry);
const physics = physicsFor(scale, tuning);
const terrain = (_x, y, _z) => y < 0;
const batches = 31;
const queriesPerBatch = 2000;
const frameCount = 600;
let checksum = 0;
const summary = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: samples.length,
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
};
const measure = (fn, count = queriesPerBatch) => {
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    checksum += Number(fn(i) ?? 0);
  }
  return (performance.now() - start) / count;
};
const create = (count, mode) => {
  const inventory = new Inventory(registry);
  const ids = [];
  for (let i = 0; i < count; i++) {
    ids.push(
      inventory.registerVehicle({
        blueprint: 'hatchback',
        placementKey: `bench-${i}`,
        origin: [(i % 10) * 16, 0, Math.floor(i / 10) * 24],
        facing: 'n',
      }),
    );
  }
  const cells = new VehicleOccupancy(registry, inventory.vehicles, scale.blockSize);
  const boxes = new VehicleBoxes(registry, inventory.vehicles, scale.blockSize);
  const coarse = (x, y, z) => terrain(x, y, z) || cells.isSolid(x, y, z);
  const solid = mode === 'cells' ? coarse : terrain;
  const point =
    mode === 'cells' ? (p) => coarse(...p.map(Math.floor)) : (p) => terrain(...p.map(Math.floor)) || boxes.contains(p);
  const ray =
    mode === 'cells' ? (o, d, range) => raycast(o, d, range, coarse) : (o, d, range) => boxes.ray(o, d, range, terrain);
  const shapeOf = mode === 'cells' ? undefined : (body) => boxes.shape(body, terrain);
  return { inventory, ids, cells, boxes, solid, point, ray, shapeOf };
};
const samplesFor = ({ inventory }) =>
  [...inventory.vehicles.records].flatMap(([id, vehicle]) =>
    projectVehicleParts(registry, id, vehicle, scale.blockSize).flatMap((part) =>
      part.boxes.flatMap((box) => {
        const centre = box.min.map((v, axis) => (v + box.max[axis]) / 2 / scale.blockSize);
        return [centre, centre.map((v, axis) => v + (axis === 0 ? 0.6 : 0))];
      }),
    ),
  );
const runQueries = (count, mode) => {
  const query = create(count, mode);
  const points = samplesFor(query);
  const at = (i) => points[i % points.length];
  const tests = {
    solid: (i) => query.point(at(i)),
    ray: (i) => {
      const p = at(i);
      return query.ray([p[0], p[1], p[2] - 8], [0, 0, 1], 16)?.distance;
    },
    throwSample: (i) => {
      const metres = at(i).map((v) => v * scale.blockSize);
      return query.point(metres.map((v) => v / scale.blockSize));
    },
  };
  const result = {};
  for (const [name, fn] of Object.entries(tests)) {
    measure(fn, 10_000);
    result[name] = summary(Array.from({ length: batches }, () => measure(fn)));
  }
  const original = query.inventory.vehicles.get(query.ids[0]);
  const leaf = original.fittings.find((f) => !original.fittings.some((other) => other.supportedBy.includes(f.id)));
  const update = [];
  for (let i = 0; i < batches; i++) {
    query.inventory.vehicles.replace(registry, query.ids[0], original);
    query.point(at(0));
    query.inventory.vehicles.replace(registry, query.ids[0], {
      ...original,
      fittings: original.fittings.filter((f) => f !== leaf),
    });
    const start = performance.now();
    query.point(at(0));
    update.push(performance.now() - start);
  }
  result.detachRebuild = summary(update);
  return result;
};
const runFrames = (count, mode) => {
  const q = create(count, mode);
  const player = { pos: [4, 0, -6], vel: [0, 0, 0], halfWidth: 0.6, height: 3.4, onGround: true };
  const system = new ZombieSystem({
    activeZombieRadiusMetres: siteGenerationOf(registry).activeZombieRadiusMetres,
    seed: 1,
    isSolid: q.solid,
    isOpaque: terrain,
    blockSize: scale.blockSize,
    physics,
    vehicleBoxSpike: mode === 'boxes' ? q.boxes : undefined,
    jumpSpeed: tuning.jump,
    tuning: registry.senses.get(CORE_CONTENT_IDS.player),
    player: () => ({
      pos: player.pos,
      body: player,
      facing: [0, 0, 1],
      movement: 'still',
      lit: true,
      lightSeenFrom: 40,
      eyeHeightMetres: tuning.eye,
    }),
    dayPhase: () => dayPhaseAt(requireDayCycle(registry), 43_200),
    hurtPlayer: () => undefined,
  });
  const type = registry.zombies.get('shambler');
  for (let i = 0; i < 20; i++) {
    const angle = (i * 2 * Math.PI) / 20;
    system.add(type, [Math.cos(angle) * 8, 0, Math.sin(angle) * 8], [0, 0, 1]);
  }
  let frame = 0;
  const samples = [];
  for (; frame < frameCount + 120; frame++) {
    const start = performance.now();
    player.vel[0] = frame % 120 < 60 ? 1 : -1;
    stepBody(player, 1 / 60, q.solid, { ...physics, shapeOf: q.shapeOf });
    system.tickActive(1 / 60, frame / 60);
    for (const [, zombie] of system.store.entries()) {
      const probe = probeHeading(
        {
          body: zombie.body,
          intent: [0, 0, 1],
          isSolid: q.solid,
          physics: { ...physics, shapeOf: q.shapeOf },
          blockSize: scale.blockSize,
        },
        [0, 0, 1],
        0.75,
      );
      checksum += probe[0];
    }
    if (frame >= 120) {
      samples.push(performance.now() - start);
    }
  }
  return summary(samples);
};
console.log(
  JSON.stringify({
    machine: hostname(),
    cpu: cpus()[0]?.model,
    node: process.version,
    units: 'milliseconds',
    batches,
    queriesPerBatch,
    frameCount,
    warmFrames: 120,
    zombies: 20,
    scenario:
      'cardinal hatchback street; flat terrain; one moving player, 20 active shamblers and one explicit heading probe per zombie per frame; base content; seed 1',
  }),
);
for (const count of [1, 10, 50]) {
  for (const mode of ['cells', 'boxes']) {
    console.log(JSON.stringify({ count, mode, queries: runQueries(count, mode), frame: runFrames(count, mode) }));
  }
}
console.log(JSON.stringify({ checksum }));
