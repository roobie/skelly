import { layoutVehiclePlacements } from '@skelly/engine/internal/game/layoutVehicles.ts';
import { BlockEntities, layoutVehicleQueries, makeScale, World, worldSolid } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
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

  it('rejects a body overlapping only a parked vehicle, which the vehicle-blind query accepts', () => {
    const world = new World();
    const entities = new BlockEntities(registry);
    const blockSize = 0.5;
    const blind = worldSolid(world, registry, entities);
    const aware = layoutVehicleQueries({ world, registry, entities, site: 'testHouse', blockSize }).isSolid;
    const { origin } = layoutVehiclePlacements(registry, 'testHouse', blockSize)[0]!;
    const cell = Array.from({ length: 41 * 41 * 9 }, (_, i): [number, number, number] => [
      Math.floor(origin[0]) + (i % 41) - 20,
      Math.floor(origin[1]) + (Math.floor(i / 1681) % 9) - 2,
      Math.floor(origin[2]) + (Math.floor(i / 41) % 41) - 20,
    ]).find(([x, y, z]) => aware(x, y, z))!;
    expect(cell).toBeDefined();
    const body = createPlayerBody(makeScale(blockSize), cell[0] + 0.5, cell[1], cell[2] + 0.5);
    body.halfWidth = 0.1;
    body.height = 0.1;

    expect(bodyIsClear(body, blind)).toBe(true);
    expect(bodyIsClear(body, aware)).toBe(false);
  });
});
