import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { worldSolid } from '../src/core/collision.ts';
import type { Registry } from '../src/core/content.ts';
import { toChunk } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { stepBody } from '../src/core/physics.ts';
import { HandlingRange } from '../src/core/range.ts';
import { furnitureDistance, INVENTORY_REACH } from '../src/core/reach.ts';
import { World } from '../src/core/world.ts';
import { generateColumn, type Terrain } from '../src/core/worldgen.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { makeConfig } from '../src/game/config.ts';
import { ammoMatchesCalibre, firearmModelForType } from '../src/game/firearmHandling.ts';
import { INPUT_BINDINGS } from '../src/game/inputBindings.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from '../src/game/player.ts';
import { GARDEN_GATE, HOUSE_OFFSET } from '../src/game/testHouse.ts';
import { isTestHouseRangeStockItem, testHouseRangeStock } from '../src/game/testHouseRange.ts';
import { buildDebugTestHouseSite, DebugTestHouseSite, testHouseScene } from '../src/game/worldSetup.ts';
import { buildTestHouseRangeRoute, routeMovementInput } from './testHouseRangeRoute.ts';

const withRangeStockFixtures = (): { registry: Registry; firearm: string; ammo: string; box: string } => {
  const base = BUNDLED_CONTENT.registry;
  const items = new Map(base.items);
  const models = new Map(base.models);
  const sourceFirearm = [...items.values()].find((item) => item.firearm && item.model && models.has(item.model));
  const sourceAmmo = [...items.values()].find((item) => item.ammo);
  const sourceBox = [...items.values()].find((item) => item.unpack && items.get(item.unpack.item)?.ammo);
  if (!(sourceFirearm?.model && sourceAmmo?.ammo && sourceBox?.unpack)) {
    throw new Error('range-stock fixture needs firearm, ammunition and unpackable-ammunition content');
  }
  const sourceModel = models.get(sourceFirearm.model);
  if (!sourceModel) {
    throw new Error('range-stock fixture firearm model is missing');
  }

  const calibre = 'range-test-calibre';
  const firearm = 'range_test_firearm';
  const ammo = 'range_test_ammo';
  const box = 'range_test_ammo_box';
  const model = 'range_test_model';
  models.set(model, { ...sourceModel, id: model, calibre });
  items.set(firearm, { ...sourceFirearm, id: firearm, model });
  items.set(ammo, { ...sourceAmmo, id: ammo, ammo: { ...sourceAmmo.ammo, calibre } });
  items.set(box, { ...sourceBox, id: box, unpack: { ...sourceBox.unpack, item: ammo } });
  return { registry: { ...base, items, models }, firearm, ammo, box };
};

const stockedTypes = (registry: Registry, stock: ReturnType<typeof testHouseRangeStock>): Set<string> => {
  const furniture = registry.furniture.get('range_rack');
  if (!furniture) {
    throw new Error('range rack content is missing');
  }
  const inventory = new Inventory(registry);
  const rack = inventory.furnish({ type: 'range_rack', pos: [0, 0, 0], size: [...furniture.size], facing: 's' }, stock);
  if (!rack?.pockets) {
    throw new Error('range rack did not create a container');
  }
  return new Set(rack.pockets.flat().map(({ item }) => item.type));
};

const rangeFurnitureFor = (site: DebugTestHouseSite): ReturnType<DebugTestHouseSite['furnitureIn']> => {
  const { range } = site;
  const furniture: ReturnType<DebugTestHouseSite['furnitureIn']> = [];
  for (let cx = toChunk(range.rect.x0); cx <= toChunk(range.rect.x1 - 1); cx++) {
    for (let cz = toChunk(range.rect.z0); cz <= toChunk(range.rect.z1 - 1); cz++) {
      furniture.push(...site.furnitureIn(cx, cz));
    }
  }
  return furniture;
};

const buildRangeWalkFixture = () => {
  const config = makeConfig(7, 64);
  config.site = 'testHouse';
  config.debug = true;
  const { registry } = BUNDLED_CONTENT;
  const house = testHouseScene(config, registry);
  const site = buildDebugTestHouseSite(config, registry, house);
  if (!site) {
    throw new Error('debug test-house site is missing');
  }
  const { spawn } = site;
  const rangeFurniture = rangeFurnitureFor(site);
  const rackSpec = rangeFurniture.find(({ spec }) => spec.type === 'range_rack')?.spec;
  if (!rackSpec) {
    throw new Error('debug range rack is missing');
  }
  const { scale } = config;
  const { blockSize } = scale;
  const startX = spawn.pos[0] / blockSize;
  const startZ = spawn.pos[2] / blockSize;
  const body = createPlayerBody(scale, startX, spawn.pos[1] / blockSize + 0.01, startZ);
  const route = buildTestHouseRangeRoute({
    blockSize,
    playerHalfWidth: body.halfWidth,
    rack: rackSpec,
    houseOffset: HOUSE_OFFSET,
    gardenGate: GARDEN_GATE,
  });
  const routeXs = route.waypoints.filter(({ axis }) => axis === 0).map(({ target }) => target);
  const routeZs = route.waypoints.filter(({ axis }) => axis === 2).map(({ target }) => target);
  const minX = Math.floor(Math.min(startX, ...routeXs) - 2);
  const maxX = Math.ceil(Math.max(startX, ...routeXs) + 2);
  const minZ = Math.floor(Math.min(startZ, ...routeZs) - 2);
  const maxZ = Math.ceil(Math.max(startZ, ...routeZs) + 2);
  const terrain: Terrain = {
    seed: config.seed,
    scale,
    blocks: {
      grass: registry.blockIds.get('grass')!,
      dirt: registry.blockIds.get('dirt')!,
      stone: registry.blockIds.get('stone')!,
      sand: registry.blockIds.get('sand')!,
    },
    surface: site.surface,
    stamp: (chunk) => site.stamp(chunk),
  };
  const world = new World();
  for (let cx = toChunk(minX); cx <= toChunk(maxX); cx++) {
    for (let cz = toChunk(minZ); cz <= toChunk(maxZ); cz++) {
      for (const chunk of generateColumn(terrain, cx, cz)) {
        world.addChunk(chunk);
      }
    }
  }
  const entities = new BlockEntities(registry);
  for (const { spec } of [...house.furniture, ...rangeFurniture]) {
    entities.add(spec);
  }
  const rack = [...entities.all].find((entity) => entity.type === 'range_rack');
  if (!rack) {
    throw new Error('debug range rack entity is missing');
  }
  const inventory = new Inventory(registry, undefined, entities);
  return {
    blockSize,
    scale,
    rack,
    inventory,
    body,
    isSolid: worldSolid(world, registry, entities),
    physics: physicsFor(scale),
    ...route,
  };
};

type RangeWalkFixture = ReturnType<typeof buildRangeWalkFixture>;

const crossedWaypoint = (position: number, target: number, direction: number): boolean =>
  direction > 0 ? position >= target : position <= target;

const movePlayerTo = (
  fixture: RangeWalkFixture,
  waypoint: RangeWalkFixture['waypoints'][number],
  yaw: number,
): { reached: boolean; action?: string; settled: boolean } => {
  const { body, blockSize, scale, isSolid, physics } = fixture;
  const { axis, target } = waypoint;
  const direction = Math.sign(target - body.pos[axis]);
  if (!direction) {
    return { reached: true, settled: Math.hypot(body.vel[0], body.vel[2]) <= 1e-9 };
  }
  const movement = routeMovementInput(axis, direction > 0 ? 1 : -1, yaw);
  const maxFrames = Math.ceil(((Math.abs(target - body.pos[axis]) * blockSize) / PLAYER.walk + 1) * 120);
  for (let frame = 0; frame < maxFrames && !crossedWaypoint(body.pos[axis], target, direction); frame++) {
    steer(body, scale, yaw, {
      forward: movement.forward,
      right: movement.right,
      jump: false,
      sprint: false,
      walk: true,
    });
    stepBody(body, 1 / 60, isSolid, physics);
  }
  const stopped = { forward: 0, right: 0, jump: false, sprint: false, walk: true };
  let settleFrames = 0;
  while (Math.hypot(body.vel[0], body.vel[2]) > 1e-9 && settleFrames < 120) {
    steer(body, scale, yaw, stopped);
    stepBody(body, 1 / 60, isSolid, physics);
    settleFrames += 1;
  }
  return {
    reached: crossedWaypoint(body.pos[axis], target, direction),
    action: movement.action,
    settled: Math.hypot(body.vel[0], body.vel[2]) <= 1e-9,
  };
};

describe('the debug test-house range', () => {
  it('uses the shared lane geometry beside the house, with the spawn behind the firing line', () => {
    const config = makeConfig(13, 64);
    config.site = 'testHouse';
    config.debug = true;
    const { registry } = BUNDLED_CONTENT;
    const house = testHouseScene(config, registry);
    const site = buildDebugTestHouseSite(config, registry, house);
    expect(site).toBeInstanceOf(DebugTestHouseSite);

    const builtSite = site as DebugTestHouseSite;
    const { range, spawn } = builtSite;
    const spawnX = spawn.pos[0] / config.scale.blockSize;
    const padTop = Math.floor(spawn.pos[1] / config.scale.blockSize) - 1;
    expect(range).toBeInstanceOf(HandlingRange);
    expect(range.rect.x0).toBeGreaterThanOrEqual(range.beside.x1);
    expect(range.table.pos[0]).toBeGreaterThan(range.beside.x1);
    expect(range.firingLine.x0).toBeGreaterThan(range.beside.x1);
    expect(range.targetXs.every((x) => x > range.firingLine.x1)).toBe(true);
    expect(builtSite.surface.height(range.table.pos[0], range.table.pos[2], padTop + 5)).toBe(padTop);
    expect(spawnX).toBeLessThan(range.beside.x1);
    expect(spawnX).toBeLessThan(range.firingLine.x0);

    const target = rangeFurnitureFor(builtSite).find(({ spec }) => spec.type === 'range_target');
    expect(target).toBeDefined();
    expect(registry.furniture.get(target!.spec.type)?.shotTarget).toBe(true);
    expect(range.targetXs).toContain(target!.spec.pos[0]);

    const normal = makeConfig(13, 64);
    normal.site = 'testHouse';
    expect(buildDebugTestHouseSite(normal, registry, testHouseScene(normal, registry))).toBeUndefined();
    const nonTestHouse = makeConfig(13, 64);
    nonTestHouse.debug = true;
    expect(buildDebugTestHouseSite(nonTestHouse, registry, undefined)).toBeUndefined();
  });

  it('walks every shared route leg to a clear, reachable rack-facing stop', () => {
    const knownActions = new Set(INPUT_BINDINGS.map(({ id }) => id));
    for (const yaw of [0, Math.PI / 2]) {
      const fixture = buildRangeWalkFixture();
      expect(fixture.waypoints).not.toHaveLength(0);
      for (const waypoint of fixture.waypoints) {
        const result = movePlayerTo(fixture, waypoint, yaw);
        expect(result.action, `route leg ${waypoint.id} at yaw ${yaw} emits an action`).toBeDefined();
        if (!result.action) {
          throw new Error(`route leg ${waypoint.id} did not emit a movement action`);
        }
        expect(knownActions.has(result.action), `route leg ${waypoint.id} uses a bound action`).toBe(true);
        expect(result.settled, `route leg ${waypoint.id} settles at yaw ${yaw}`).toBe(true);
        expect(result.reached, `route leg ${waypoint.id} at yaw ${yaw}`).toBe(true);
        if (waypoint.id === 'centre-in-gate') {
          expect(Math.abs(fixture.body.pos[0] - fixture.gateCentreX)).toBeLessThanOrEqual(fixture.gateClearance);
        }
      }
      expect(fixture.body.pos[2] - fixture.body.halfWidth).toBeGreaterThan(fixture.rack.pos[2] + fixture.rack.size[2]);
      expect(
        furnitureDistance(
          { inventory: fixture.inventory, position: fixture.body.pos, blockSize: fixture.blockSize },
          fixture.rack,
        ),
      ).toBeLessThanOrEqual(INVENTORY_REACH);
    }
  });

  it('fits every registry firearm in the debug rack with direct or rotated placement', () => {
    const { registry } = BUNDLED_CONTENT;
    const pocket = registry.furniture.get('range_rack')?.container?.pockets[0];
    if (!pocket) {
      throw new Error('debug range rack has no inventory pocket');
    }
    const firearms = [...registry.items.values()].filter((item) => item.firearm);
    expect(firearms.length).toBeGreaterThan(0);
    for (const firearm of firearms) {
      const [width, height] = firearm.size;
      const fits =
        (width <= pocket.grid[0] && height <= pocket.grid[1]) || (height <= pocket.grid[0] && width <= pocket.grid[1]);
      expect(fits, firearm.id).toBe(true);
    }
  });

  it('stocks every firearm and compatible ammunition item discovered from registry data', () => {
    const { registry, firearm, ammo, box } = withRangeStockFixtures();
    const stock = testHouseRangeStock(registry);
    const stored = stockedTypes(registry, stock);
    expect(stored.has(firearm)).toBe(true);
    expect(stored.has(ammo)).toBe(true);
    expect(stored.has(box)).toBe(true);

    const calibres = new Set(
      [...registry.items.values()]
        .filter((item) => item.firearm)
        .map((item) => firearmModelForType(item.id, registry)?.calibre)
        .filter((calibre): calibre is string => calibre !== undefined),
    );
    for (const item of registry.items.values()) {
      if (isTestHouseRangeStockItem(item)) {
        expect(stored.has(item.id), item.id).toBe(true);
      }
      const payload = item.unpack && registry.items.get(item.unpack.item);
      if (
        [...calibres].some(
          (calibre) =>
            ammoMatchesCalibre(item.id, calibre, registry) ||
            (payload && ammoMatchesCalibre(payload.id, calibre, registry)),
        )
      ) {
        expect(stored.has(item.id), item.id).toBe(true);
      }
    }
  });

  it('installs the registry-derived rack in the debug site', () => {
    const config = makeConfig(13, 64);
    config.site = 'testHouse';
    config.debug = true;
    const { registry } = BUNDLED_CONTENT;
    const site = buildDebugTestHouseSite(config, registry, testHouseScene(config, registry)) as DebugTestHouseSite;
    const rack = rangeFurnitureFor(site).find(({ spec }) => spec.type === 'range_rack');
    expect(rack).toBeDefined();
    const stocked = new Set(rack!.loot.map(({ type }) => type));
    const firearms = [...registry.items.values()].filter((item) => item.firearm);
    for (const firearm of firearms) {
      expect(stocked.has(firearm.id), firearm.id).toBe(true);
    }
  });
});
