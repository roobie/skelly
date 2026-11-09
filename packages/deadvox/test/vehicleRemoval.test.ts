import { expect, it } from 'vitest';
import { CanonicalTerrain, installColumn } from '../src/core/canonicalTerrain.ts';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { coreMessage } from '../src/core/coreText.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { dropSpots } from '../src/core/inventory.ts';
import { PILE_GRID } from '../src/core/inventoryScale.ts';
import type { Item } from '../src/core/items.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ColumnSource } from '../src/core/site.ts';
import { simSeconds } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import { generateColumn, type Terrain } from '../src/core/worldgen.ts';
import { handlingMoveCompleteCue } from '../src/game/audioPresentation.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';

const ids = { part: 'removal_part', load: 'removal_load', hand: 'removal_hand', host: 'removal_host' };
const fixture = ({
  floor = true,
  platform = true,
  height = 2,
  playerX = 3.5,
  obstacle,
}: {
  floor?: boolean;
  platform?: boolean;
  height?: number;
  playerX?: number;
  obstacle?: 'non-solid' | 'shape-hole';
} = {}) => {
  const base = baseRegistry();
  const scale = { ...makeScale(0.5), minCy: 0, maxCy: 5 };
  const donor = [...base.items.values()].find((item) => item.vehicle && item.model && !item.vehicle.addon)!;
  const model = base.models.get(donor.model!)!;
  const items = new Map(base.items);
  items.set(ids.part, {
    ...donor,
    id: ids.part,
    model: ids.part,
    size: [1, 1],
    vehicle: { ...donor.vehicle!, mount: 'removal_mount' },
  });
  for (const id of [ids.load, ids.hand]) {
    items.set(id, {
      id,
      name: id,
      category: 'misc',
      size: [1, 1],
      weight: 1,
      workInProgress: false,
    });
  }
  items.set('removal_filler', { ...items.get(ids.load)!, id: 'removal_filler', size: [PILE_GRID.w, PILE_GRID.h] });
  const registry = {
    ...base,
    items,
    models: new Map(base.models).set(ids.part, {
      ...model,
      id: ids.part,
      parts: {
        body: {
          massKg: 1,
          centreOfMass: [0, 0, 0],
          voxelGrain: scale.blockSize,
          collision: [{ min: [0, 0, 0], max: [scale.blockSize, scale.blockSize, scale.blockSize] }],
        },
      },
    }),
    vehicleBlueprints: new Map(base.vehicleBlueprints).set(ids.host, {
      id: ids.host,
      name: 'Removal fixture',
      fittings: [
        {
          id: 'part',
          part: ids.part,
          at: [0, 0, 0],
          supportedBy: [],
          service: { name: 'Remove', mount: 'removal_mount', durationSimSeconds: simSeconds(1), qualities: {} },
        },
      ],
    }),
  };
  const solid = registry.blocks.findIndex((block) => block.solid);
  const terrain: Terrain = {
    seed: 1,
    scale,
    blocks: { grass: 0, dirt: 0, rock: 0, sand: 0, water: 0 },
    shape: {
      minHeightMetres: 0,
      maxHeightMetres: 0,
      beachBelowMetres: 0,
      dirtDepthMetres: 0,
      featureSizeMetres: 1,
      octaves: 1,
    },
    stamp: (chunk) => {
      for (let x = 0; x < CHUNK; x++) {
        for (let z = 0; z < CHUNK; z++) {
          if (floor && chunk.cy === 0) {
            chunk.set(x, 0, z, solid);
          }
          if (platform && chunk.cx * CHUNK + x >= 3 && chunk.cy === Math.floor(height / CHUNK)) {
            chunk.set(x, height % CHUNK, z, solid);
          }
        }
      }
    },
  };
  const world = new World();
  installColumn(
    world,
    generateColumn(terrain, 0, 0).filter((chunk) => chunk.cy === Math.floor(height / CHUNK)),
  );
  const canonical = new CanonicalTerrain(world, terrain);
  const source: ColumnSource = {
    furnitureIn: () => [],
    lootPointsIn: () => [],
    supplySourcesIn: () => [],
    actorsIn: () => [],
  };
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    scale,
    seed: 1,
    start: 43_200,
    spawn: [playerX, height + 1, 1.5],
    terrainDestruction: { terrain: canonical, source },
    isSolid: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    isOpaque: () => false,
    ready: () => false,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  const { inventory } = session;
  if (obstacle) {
    const donorPiece = [...registry.furniture.values()].find((entry) => !(entry.door || entry.mount))!;
    const type = 'removal_obstacle';
    registry.furniture.set(type, {
      ...donorPiece,
      id: type,
      size: [2, 1, 1],
      solid: obstacle !== 'non-solid',
      solidFill: 0.1,
      shape: obstacle === 'shape-hole' ? [{ position: [1, 0, 0], size: [1, 1, 1] }] : undefined,
    });
    if (!inventory.furnish({ type, pos: [1, 1, 1], size: [2, 1, 1], facing: 'n' })) {
      throw new Error('Could not place fixture obstacle');
    }
  }
  const vehicleId = inventory.registerVehicle({
    blueprint: ids.host,
    placementKey: ids.host,
    origin: [1, height, 1],
    facing: 'n',
  });
  const fitting = inventory.vehicles.get(vehicleId)!.fittings[0]!;
  const top: Vec3 = [1, height + 1, 1];
  const load = inventory.create(ids.load);
  if (!inventory.add(load, { kind: 'pile', pos: top })) {
    throw new Error('Could not place the fixture load');
  }
  const remove = () => session.sim.actions.vehicleWork!.finish('remove', vehicleId, fitting, fitting.item.uid);
  const posOf = (item: Item): Vec3 => {
    const location = inventory.locate(item);
    if (location?.kind !== 'pile') {
      throw new Error('Fixture item is not piled');
    }
    return location.pile.pos;
  };
  const moveOntoLoad = (target = load) => {
    const hand = inventory.create(ids.hand);
    if (!inventory.add(hand, { kind: 'hand', side: 'right' })) {
      throw new Error('Could not hold the fixture item');
    }
    const events: string[] = [];
    const queue = new HandlingQueue(inventory, undefined, (move) => {
      const cue = handlingMoveCompleteCue(move, registry, {
        blockIdAt: (x, y, z) => world.getBlock(x, y, z),
        entities: inventory.entities,
        vehicles: inventory.vehicles,
        blockSize: scale.blockSize,
      });
      if (cue) {
        events.push(cue.event);
      }
    });
    const result = queue.enqueue(hand, { kind: 'pile', pos: posOf(target) });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    queue.tick(result.job.duration);
    return events;
  };
  return {
    inventory,
    session,
    world,
    canonical,
    load,
    fitting,
    vehicleId,
    top,
    remove,
    posOf,
    moveOntoLoad,
    solid,
    dropSound: registry.blocks[solid]!.drops!.default,
  };
};

it("settles a removed part's load on canonical floor deeper than the live furniture fall limit", () => {
  const f = fixture({ height: 130 });
  expect(f.world.getChunk(0, 0, 0)).toBeUndefined();
  expect(f.remove()).toBeUndefined();
  const landed = f.posOf(f.load);
  expect(landed[1]).toBeLessThan(f.top[1]);
  expect(f.canonical.getBlock(landed[0], landed[1] - 1, landed[2])).not.toBe(0);
  expect(f.posOf(f.fitting.item)).toEqual(f.session.feet());
});

it('gives a load with no floor below to the player feet pile with the removed part', () => {
  const f = fixture({ floor: false });
  expect(f.remove()).toBeUndefined();
  expect(f.posOf(f.load)).toEqual(f.session.feet());
  expect(f.posOf(f.fitting.item)).toEqual(f.session.feet());
  expect(f.moveOntoLoad()).toEqual([f.dropSound]);
});

it('settles a part removed from under the player before a hand move uses its receiver', () => {
  const f = fixture({ playerX: 1.5 });
  const feet = f.session.feet();
  expect(f.inventory.landing(feet)).toEqual(feet);
  expect(f.remove()).toBeUndefined();
  const [x, y, z] = f.posOf(f.fitting.item);
  expect(f.inventory.registry.blocks[f.world.getBlock(x, y - 1, z)]!.solid).toBe(true);
  expect(f.moveOntoLoad(f.fitting.item)).toEqual([f.dropSound]);
});

it('settles the part and no-floor load beside an empty feet column before a hand move uses their receiver', () => {
  const f = fixture({ floor: false, playerX: 2.5 });
  expect(f.inventory.landing(f.session.feet())).toBeUndefined();
  expect(f.remove()).toBeUndefined();
  const landed = f.posOf(f.fitting.item);
  const [x, y, z] = landed;
  expect(f.inventory.registry.blocks[f.world.getBlock(x, y - 1, z)]!.solid).toBe(true);
  expect(f.posOf(f.load)).toEqual(landed);
  expect(f.moveOntoLoad(f.fitting.item)).toEqual([f.dropSound]);
});

it.each([false, true])('uses the first supported candidate with room (feet landing full: %s)', (full) => {
  const f = fixture({ playerX: 2.5 });
  const first = f.inventory.landing(f.session.feet())!;
  expect(first[1]).toBeLessThan(f.session.feet()[1]);
  if (full) {
    expect(f.inventory.add(f.inventory.create('removal_filler'), { kind: 'pile', pos: first })).toBe(true);
  }
  expect(f.remove()).toBeUndefined();
  const landed = f.posOf(f.fitting.item);
  const [x, y, z] = landed;
  if (full) {
    expect(y).toBeGreaterThan(first[1]);
  } else {
    expect(landed).toEqual(first);
  }
  expect(f.inventory.registry.blocks[f.world.getBlock(x, y - 1, z)]!.solid).toBe(true);
  expect(f.moveOntoLoad(f.fitting.item)).toEqual([f.dropSound]);
});

it('can complete a hand move onto the resettled pile without throwing in its sound callback', () => {
  const f = fixture();
  expect(f.remove()).toBeUndefined();
  expect(f.moveOntoLoad()).toEqual([f.dropSound]);
});

it.each(['non-solid', 'shape-hole'] as const)(
  'vehicle removal piles fall past %s furniture to a real receiver',
  (obstacle) => {
    const f = fixture({ obstacle });
    expect(f.remove()).toBeUndefined();
    expect(f.moveOntoLoad()).toEqual([f.dropSound]);
  },
);

it('spreads a falling load beyond full adjacent piles instead of leaving it on the removed support', () => {
  const f = fixture();
  const blocked = dropSpots([f.top[0], 1, f.top[2]]);
  for (const pos of blocked) {
    expect(f.inventory.add(f.inventory.create('removal_filler'), { kind: 'pile', pos })).toBe(true);
  }
  expect(f.remove()).toBeUndefined();
  const landed = f.posOf(f.load);
  expect(blocked.some((pos) => pos.every((value, axis) => value === landed[axis]))).toBe(false);
  expect(f.world.getBlock(landed[0], landed[1] - 1, landed[2])).toBe(f.solid);
});

it('spreads the no-floor load and removed part together when the feet pile is full', () => {
  const f = fixture({ floor: false });
  expect(f.inventory.add(f.inventory.create('removal_filler'), { kind: 'pile', pos: f.session.feet() })).toBe(true);
  expect(f.remove()).toBeUndefined();
  expect(f.posOf(f.load)).not.toEqual(f.session.feet());
  expect(f.posOf(f.load)).toEqual(f.posOf(f.fitting.item));
});

it('checks no-ground removal only at completion and retains the fitted part, load and completed work', () => {
  const f = fixture({ floor: false, platform: false, playerX: 1.5 });
  const { session, inventory, vehicleId, fitting } = f;
  const before = inventory.snapshotState();
  const vehicles = inventory.vehicles.snapshotState();
  expect(session.vehicleWorkRefusal('remove', vehicleId, fitting, fitting.item.uid)).toBeUndefined();
  expect(session.beginVehicleWork('remove', vehicleId, fitting, fitting.item.uid)).toBeUndefined();
  const { job } = session.sim.actions;
  if (job?.jobType !== 'vehicleWork') {
    throw new Error('Fixture removal did not start');
  }
  session.sim.scheduler.advance(job.duration + 1);
  expect(session.sim.compression.interruption).toBe(coreMessage(inventory.registry, 'noLanding'));
  expect(session.sim.actions.job).toMatchObject({ jobType: 'vehicleWork', stopped: true, elapsed: job.duration });
  expect(inventory.snapshotState()).toEqual(before);
  expect(inventory.vehicles.snapshotState()).toEqual(vehicles);

  expect(session.beginVehicleWork('remove', vehicleId, fitting, fitting.item.uid)).toBeUndefined();
  expect(session.sim.actions.job).toMatchObject({ jobType: 'vehicleWork', elapsed: job.duration });
});

it('keeps the noRoom refusal when every supported part landing is full', () => {
  const f = fixture();
  for (const spot of dropSpots(f.session.feet())) {
    const landed = f.inventory.landing(spot);
    expect(landed).toBeDefined();
    expect(f.inventory.add(f.inventory.create('removal_filler'), { kind: 'pile', pos: landed! })).toBe(true);
  }
  const before = f.inventory.snapshotState();
  const vehicles = f.inventory.vehicles.snapshotState();
  expect(f.remove()).toBe(coreMessage(f.inventory.registry, 'noRoom'));
  expect(f.inventory.snapshotState()).toEqual(before);
  expect(f.inventory.vehicles.snapshotState()).toEqual(vehicles);
});

it.each([false, true])('classifies a blocked load independently of part landing room (part ground: %s)', (ground) => {
  const f = fixture({ floor: false, platform: false });
  f.canonical.ensureCell(1, 0, 1);
  f.world.setBlock(1, 0, 1, f.solid);
  expect(f.inventory.add(f.inventory.create('removal_filler'), { kind: 'pile', pos: [1, 1, 1] })).toBe(true);
  if (ground) {
    f.canonical.ensureCell(3, 0, 1);
    f.world.setBlock(3, 0, 1, f.solid);
  }
  const before = f.inventory.snapshotState();
  const vehicles = f.inventory.vehicles.snapshotState();
  expect(f.remove()).toBe(coreMessage(f.inventory.registry, ground ? 'noRoom' : 'noLanding'));
  expect(f.inventory.snapshotState()).toEqual(before);
  expect(f.inventory.vehicles.snapshotState()).toEqual(vehicles);
});

it('does not detach the part or move its load when canonical terrain rejects an incomplete touched column', () => {
  const f = fixture({ height: 130 });
  f.world.touchColumn(0, 0);
  const before = f.inventory.snapshotState();
  const vehicles = f.inventory.vehicles.snapshotState();
  expect(() => f.remove()).toThrow('Incomplete touched column');
  expect(f.inventory.snapshotState()).toEqual(before);
  expect(f.inventory.vehicles.snapshotState()).toEqual(vehicles);
});
