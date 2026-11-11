import { Inventory } from '@skelly/engine/inventory';
import { projectVehicleParts } from '@skelly/engine/vehicles';
import { BlockEntities, makeScale, registerLayoutVehicles, type Vec3, World, worldSolid } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { withLayoutVehicles } from '../src/bench/placementWorld.ts';
import {
  bodyIsClear,
  findShamblerBenchPlayer,
  placeShamblerRing,
  SHAMBLER_PROBE_BODY_METRES,
} from '../src/bench/shamblerPlacement.ts';
import { createHeadlessShamblerWorld } from '../src/bench/shamblerWorld.ts';
import { baseRegistry } from './baseRegistry.ts';
import { createPlayerBody } from './playerFixture.ts';

const registry = baseRegistry();

describe('shared shambler benchmark placement', () => {
  it('uses the browser placement path for seed 1 N=10 and clears forest terrain and foliage', () => {
    const engine = createHeadlessShamblerWorld(1, registry);
    const player = findShamblerBenchPlayer(engine);
    const ring = { minRadiusMetres: 8, maxRadiusMetres: 20 };
    const positions = placeShamblerRing({ count: 10, seed: 1, player, engine, ...ring });
    const s = engine.config.scale.blockSize;
    const halfWidth = SHAMBLER_PROBE_BODY_METRES.halfWidth / s;

    expect(positions).toHaveLength(10);
    expect(engine.loadedColumns).toBeGreaterThan(0);
    expect(engine.loadedChunks).toBeGreaterThanOrEqual(engine.loadedColumns);
    for (let i = 0; i < positions.length; i++) {
      const position = positions[i]!;
      const body = createPlayerBody(engine.config.scale, ...position);
      body.halfWidth = halfWidth;
      body.height = SHAMBLER_PROBE_BODY_METRES.height / s;
      body.onGround = true;
      expect(bodyIsClear(body, engine.isSolid)).toBe(true);
      const distance = Math.hypot((position[0] - player.pos[0]) * s, (position[2] - player.pos[2]) * s);
      expect(distance).toBeGreaterThanOrEqual(ring.minRadiusMetres);
      expect(distance).toBeLessThanOrEqual(ring.maxRadiusMetres);
      for (const other of positions.slice(0, i)) {
        expect(
          Math.abs(position[0] - other[0]) >= halfWidth * 2 || Math.abs(position[2] - other[2]) >= halfWidth * 2,
        ).toBe(true);
      }
    }
  });

  it('rejects a body overlapping only a parked vehicle through the benchmark wiring, where the engine query accepts it', () => {
    const blockSize = 0.5;
    const site = 'vehicleFixture';
    const fixture = {
      ...registry,
      layouts: new Map([
        ...registry.layouts,
        [
          site,
          {
            ...registry.layouts.get('testHouse')!,
            id: site,
            vehicles: [{ blueprint: 'hatchback', placementKey: 'fixture', position: [0, 0, 0], facing: 'n' as const }],
          },
        ],
      ]),
    };
    const world = new World();
    const entities = new BlockEntities(fixture);
    const inventory = new Inventory(fixture);
    registerLayoutVehicles(inventory, fixture, site, blockSize);
    const [id, vehicle] = [...inventory.vehicles.records][0]!;
    const { min, max } = projectVehicleParts(fixture, id, vehicle, blockSize).flatMap(({ boxes }) => boxes)[0]!;
    const [x, y, z] = min.map((low, axis) => Math.floor((low + max[axis]!) / 2 / blockSize));
    const body = createPlayerBody(makeScale(blockSize), x! + 0.5, y!, z! + 0.5);
    body.halfWidth = 0.1;
    body.height = 0.1;
    const engine = {
      registry: fixture,
      config: { scale: makeScale(blockSize), site },
      spawn: { pos: [0, 0, 0] as Vec3 },
      groundAt: () => 0,
      world,
      entities,
    };
    const blind = worldSolid(world, fixture, entities);

    expect(bodyIsClear(body, blind)).toBe(true);
    expect(bodyIsClear(body, withLayoutVehicles(engine).isSolid)).toBe(false);
  });
});
