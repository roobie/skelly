import process from 'node:process';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { ScenarioCitySite } from '@skelly/engine/internal/core/scenarioCity.ts';
import type { Site } from '@skelly/engine/internal/core/site.ts';
import { authoredSkyBoxes } from '@skelly/engine/internal/core/skyField.ts';
import type { SkyBounds } from '@skelly/engine/internal/core/skylight.ts';
import { captureSky, growSky, SKY_SHELL, skyDependencyBounds } from '@skelly/engine/internal/core/skySnapshot.ts';
import { layoutVehicleSkyBoxes } from '@skelly/engine/internal/game/layoutVehicles.ts';
import { Inventory } from '@skelly/engine/inventory';
import { buildSkyResult, SkyFields } from '@skelly/engine/sky';
import { VehicleOccupancy } from '@skelly/engine/vehicles';
import {
  BlockEntities,
  CHUNK,
  Chunk,
  generateColumn,
  registerLayoutVehicles,
  sitePalette,
  terrainShapeOf,
  toChunk,
  type Vec3,
  World,
} from '@skelly/engine/world';
import { describe, expect, it, vi } from 'vitest';
import { defaultStartOf } from './fixtures/scenario.ts';
import { fixtureBox, skyWorldFixture } from './fixtures/skyWorld.ts';
import { blockId, capture, createRuntime, fixtureZombieColumn, registry, scale, seed } from './snapshotTestSupport.ts';

// biome-ignore lint/style/noProcessEnv: the build is timed only under the bench script.
const benchmarking = process.env.SKELLY_BENCH === '1';
const BENCH_RUNS = 5;
// A hang guard, about fifteen times the bench's measured run; the bench reports timings and asserts none.
const BENCH_TIMEOUT_MS = 60_000;

// Lit and dark are read against half visibility; the cases are built so neither sits near it.
const LIT = 0.5;
const inside: Vec3 = [8.5, 4.5, 8.5];
const roofY = fixtureBox.max[1] - 1;

const fields = (fixture: ReturnType<typeof skyWorldFixture>, boxes: SkyBounds[] = [fixtureBox]) =>
  new SkyFields(fixture, { bottom: 0, top: 31 }, boxes);

it('turns a roofed room lit once its roof opens, through invalidation of the cached field', () => {
  const fixture = skyWorldFixture();
  const sky = fields(fixture);
  expect(sky.visibilityAt(inside)).toBe(0);
  for (let z = fixtureBox.min[2] + 1; z < fixtureBox.max[2] - 1; z++) {
    for (let x = fixtureBox.min[0] + 1; x < fixtureBox.max[0] - 1; x++) {
      fixture.world.setBlock(x, roofY, z, 0);
    }
  }
  expect(sky.visibilityAt(inside)).toBeGreaterThan(LIT);
});

it('darkens and relights a room as a door closes and opens over its only roof hole', () => {
  const fixture = skyWorldFixture();
  fixture.world.setBlock(8, roofY, 8, 0);
  const sky = fields(fixture);
  expect(sky.visibilityAt(inside)).toBeGreaterThan(LIT);
  const door = fixture.entities.add({ type: 'fixture_door', pos: [8, roofY, 8], size: [1, 1, 1], facing: 'n' })!;
  expect(sky.visibilityAt(inside)).toBe(0);
  fixture.entities.setOpen(door, true);
  expect(sky.visibilityAt(inside)).toBeGreaterThan(LIT);
});

it('drops a built field when a block or a standing piece changes at the edge of its dependency box', () => {
  const fixture = skyWorldFixture();
  const sky = fields(fixture);
  const edge = sky.fields[0]!.dependency.max[0] - 1;
  sky.visibilityAt(inside);
  fixture.world.setBlock(edge, 1, 8, fixture.wall);
  expect(sky.current(0)).toBeUndefined();
  sky.visibilityAt(inside);
  expect(fixture.entities.add({ type: 'fixture_door', pos: [edge, 2, 8], size: [1, 1, 1], facing: 'n' })).toBeDefined();
  expect(sky.current(0)).toBeUndefined();
});

it('keeps a built field without reading the world after changes outside its dependency box', () => {
  const fixture = skyWorldFixture();
  const sky = fields(fixture);
  const { dependency } = sky.fields[0]!;
  sky.visibilityAt(inside);
  const built = sky.current(0);
  expect(built?.complete).toBe(true);
  const unreadChunkX = (Math.floor((dependency.max[0] - 1) / CHUNK) + 1) * CHUNK;
  fixture.world.setBlock(unreadChunkX, 1, 8, fixture.wall);
  expect(fixture.world.getBlock(unreadChunkX, 1, 8)).toBe(fixture.wall);
  const beside = {
    type: 'fixture_door',
    pos: [dependency.max[0], 2, 8] as Vec3,
    size: [1, 1, 1] as Vec3,
    facing: 'n' as const,
  };
  expect(fixture.entities.add(beside)).toBeDefined();
  const reads = vi.spyOn(fixture.world, 'getChunk');
  expect(sky.current(0)).toBe(built);
  expect(reads).not.toHaveBeenCalled();
});

describe('parked vehicles', () => {
  const near: SkyBounds = { min: [-12, 1, -12], max: [12, 8, 12] };
  const far: SkyBounds = { min: [100, 1, -12], max: [124, 8, 12] };
  const parked = () => {
    const world = new World();
    for (let cz = -2; cz <= 1; cz++) {
      for (let cx = -2; cx <= 8; cx++) {
        world.addChunk(new Chunk(cx, 0, cz));
      }
    }
    const floor = sitePalette(registry).paving;
    for (let z = -2 * CHUNK; z < 2 * CHUNK; z++) {
      for (let x = -2 * CHUNK; x < 9 * CHUNK; x++) {
        world.setBlock(x, 0, z, floor);
      }
    }
    const sky = new SkyFields({ world, entities: new BlockEntities(registry), registry }, { bottom: 0, top: 31 }, [
      near,
      far,
    ]);
    const inventory = new Inventory(registry);
    const light = new VehicleOccupancy(registry, inventory.vehicles, scale.blockSize, 'light');
    sky.setOccluders(light);
    const [blueprint] = [...registry.vehicleBlueprints.keys()];
    const id = inventory.registerVehicle({
      placementKey: 'sky.parked',
      blueprint: blueprint!,
      origin: [0, 1, 0],
      facing: 'n',
    });
    return { sky, inventory, light, id };
  };
  /** The footprint's middle column, just above the floor: under the body, wherever the content puts it. */
  const underneath = (light: VehicleOccupancy): Vec3 => {
    const boxes = light.boxes();
    const middle = (axis: 0 | 2) =>
      Math.floor((Math.min(...boxes.map((box) => box.min[axis])) + Math.max(...boxes.map((box) => box.max[axis]))) / 2);
    return [middle(0) + 0.5, 1.5, middle(2) + 0.5];
  };

  it('shades the ground under a parked vehicle that lets no light through its body', () => {
    const { sky, light } = parked();
    expect(sky.visibilityAt(underneath(light))).toBeLessThan(LIT);
    expect(sky.visibilityAt([-10.5, 1.5, -10.5])).toBeGreaterThan(LIT);
  });

  it('gives every layout-parked vehicle a field around all of its light-blocking cells', () => {
    const covered = [...registry.layouts.keys()].flatMap((site) => {
      const boxes = layoutVehicleSkyBoxes(registry, site, scale.blockSize);
      const inventory = new Inventory(registry);
      registerLayoutVehicles(inventory, registry, site, scale.blockSize);
      const cells = new VehicleOccupancy(registry, inventory.vehicles, scale.blockSize, 'light').boxes();
      return cells.map((cell) =>
        boxes.some((box) =>
          [0, 1, 2].every((axis) => cell.min[axis]! >= box.min[axis]! && cell.max[axis]! <= box.max[axis]!),
        ),
      );
    });
    expect(covered.length).toBeGreaterThan(0);
    expect(covered.every(Boolean)).toBe(true);
  });

  it('gives a layout vehicle with no parts no field', () => {
    const blueprint = registry.vehicleBlueprints.values().next().value!;
    const site = registry.layouts.keys().next().value!;
    const stripped = {
      ...registry,
      vehicleBlueprints: new Map([['stripped', { ...blueprint, id: 'stripped', fittings: [] }]]),
      layouts: new Map([
        [
          site,
          {
            ...registry.layouts.get(site)!,
            vehicles: [{ placementKey: 'stripped', blueprint: 'stripped', position: [0, 0, 0], facing: 'n' }],
          },
        ],
      ]),
    } as typeof registry;
    expect(layoutVehicleSkyBoxes(stripped, site, scale.blockSize)).toEqual([]);
  });

  it('relights the old spot once the vehicle moves, rebuilding only the fields it reaches', () => {
    const { sky, inventory, light, id } = parked();
    const spot = underneath(light);
    sky.visibilityAt(spot);
    sky.visibilityAt([112.5, 1.5, 0.5]);
    const farBuilt = sky.current(1);
    expect(farBuilt?.complete).toBe(true);
    const vehicle = inventory.vehicles.get(id)!;
    inventory.vehicles.replace(registry, id, { ...vehicle, origin: [vehicle.origin[0], 1, vehicle.origin[2] + 16] });
    expect(sky.current(0)).toBeUndefined();
    expect(sky.current(1)).toBe(farBuilt);
    expect(sky.visibilityAt(spot)).toBeGreaterThan(LIT);
  });
});

it('fails open outside every field, even inside a sealed room', () => {
  const unlisted: SkyBounds = { min: [40, 1, 4], max: [49, 10, 13] };
  const fixture = skyWorldFixture([fixtureBox, unlisted]);
  const sky = fields(fixture);
  expect(sky.visibilityAt(inside)).toBe(0);
  expect(sky.visibilityAt([44.5, 4.5, 8.5])).toBe(1);
});

it('gives the same sky visibility at the same position after a save round trip', () => {
  const [cx, cz] = fixtureZombieColumn;
  const columns: [number, number][] = [-1, 0, 1].flatMap((dz) =>
    [-1, 0, 1].map((dx) => [cx + dx, cz + dz] as [number, number]),
  );
  const top = (scale.maxCy + 1) * CHUNK - 1;
  const origin: Vec3 = [cx * CHUNK + 3, top - 12, cz * CHUNK + 3];
  const box: SkyBounds = { min: origin, max: origin.map((value) => value + 9) as Vec3 };
  const runtime = createRuntime(undefined, false, columns, { skyBoxes: [box] });
  const wall = blockId('planks');
  const [x0, y0, z0] = box.min;
  const [x1, y1, z1] = box.max;
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const shell = [x, y, z].some((value, axis) => value === box.min[axis] || value === box.max[axis]! - 1);
        runtime.world.setBlock(x, y, z, shell ? wall : 0);
      }
    }
  }
  // One roof hole leaves the room partly lit, so the answers compared below are neither bound.
  runtime.world.setBlock(x0 + 2, y1 - 1, z0 + 2, 0);
  const points = [
    [origin[0] + 4.5, origin[1] + 3.5, origin[2] + 4.5],
    [origin[0] + 6.5, origin[1] + 2.5, origin[2] + 6.5],
  ] as Vec3[];
  const before = points.map((point) => runtime.session.skyFields.visibilityAt(point));
  expect(before.every((value) => value > 0 && value < 1)).toBe(true);
  const restored = createRuntime(structuredClone(capture(runtime)), false, columns, { skyBoxes: [box] });
  expect(points.map((point) => restored.session.skyFields.visibilityAt(point))).toEqual(before);
});

const benchRange = { bottom: scale.minCy * CHUNK, top: (scale.maxCy + 1) * CHUNK - 1 };

/** The largest sky box across every base layout and scenario site, by cell count. */
const largestAuthoredField = (): { site: Site; box: SkyBounds } => {
  const sites: Site[] = [
    ...[...registry.layouts.values()].map((layout) => new AuthoredSite(seed, registry, scale, layout)),
    ...[...registry.scenarios.values()].map(
      (scenario) =>
        new ScenarioCitySite({ seed, registry, scale, scenario, start: defaultStartOf(registry, scenario) }),
    ),
  ];
  const cells = ({ min, max }: SkyBounds) => max.reduce((product, value, axis) => product * (value - min[axis]!), 1);
  const candidates = sites.flatMap((owner) =>
    authoredSkyBoxes(owner.authoredPlacements ?? []).map((bounds) => ({ site: owner, box: bounds })),
  );
  return candidates.reduce((best, candidate) => (cells(candidate.box) > cells(best.box) ? candidate : best));
};

/** The generated world and furniture under a field's whole dependency. */
const authoredWorld = (site: Site, box: SkyBounds) => {
  const dependency = skyDependencyBounds(box, benchRange.top);
  const world = new World();
  const entities = new BlockEntities(registry);
  const terrain = {
    seed,
    shape: terrainShapeOf(registry),
    blocks: sitePalette(registry).terrain,
    scale,
    surface: site.surface,
    stamp: (chunk: Parameters<Site['stamp']>[0]) => site.stamp(chunk),
  };
  for (let cz = toChunk(dependency.min[2]) - 1; cz <= toChunk(dependency.max[2]) + 1; cz++) {
    for (let cx = toChunk(dependency.min[0]) - 1; cx <= toChunk(dependency.max[0]) + 1; cx++) {
      for (const chunk of generateColumn(terrain, cx, cz)) {
        world.addChunk(chunk);
      }
      for (const { spec } of site.furnitureIn(cx, cz)) {
        entities.add(spec);
      }
    }
  }
  return { world, entities, registry };
};

const capturedNow = (owner: ReturnType<typeof authoredWorld>, box: SkyBounds) => {
  const iterator = captureSky(owner, growSky(box, SKY_SHELL), benchRange);
  let step = iterator.next();
  while (!step.done) {
    step = iterator.next();
  }
  return step.value;
};

describe.runIf(benchmarking)('sky field build benchmark', () => {
  it('times the synchronous build of the largest authored field', { timeout: BENCH_TIMEOUT_MS }, () => {
    const { site, box } = largestAuthoredField();
    const owner = authoredWorld(site, box);
    const centre = box.min.map((value, axis) => (value + box.max[axis]!) / 2) as Vec3;
    const timings = Array.from({ length: BENCH_RUNS }, () => {
      const sky = new SkyFields(owner, benchRange, [box]);
      const start = performance.now();
      sky.visibilityAt(centre);
      const elapsed = performance.now() - start;
      sky.dispose();
      return elapsed;
    }).sort((a, b) => a - b);
    const captureStart = performance.now();
    const captured = capturedNow(owner, box);
    const captureMs = performance.now() - captureStart;
    const transportStart = performance.now();
    expect(buildSkyResult(captured.input).complete).toBe(true);
    const transportMs = performance.now() - transportStart;
    process.stdout.write(
      `SKY_FIELD_BUILD ${JSON.stringify({
        captureMs,
        transportMs,
        box: box.max.map((value, axis) => value - box.min[axis]!),
        medianMs: timings[Math.floor(BENCH_RUNS / 2)],
        maxMs: timings.at(-1),
        runs: BENCH_RUNS,
      })}\n`,
    );
  });
});
