import { worldLightBlocking, worldMeleeBlocker, worldSoundBlocking } from '@skelly/engine/internal/core/collision.ts';
import { pileDropSound } from '@skelly/engine/internal/core/dropSounds.ts';
import { footstepEventAt } from '@skelly/engine/internal/core/footsteps.ts';
import { type Body, stepBody } from '@skelly/engine/internal/core/physics.ts';
import { SimulationTerrain } from '@skelly/engine/internal/core/simulationTerrain.ts';
import { NOT_LOADED } from '@skelly/engine/internal/core/terrainRead.ts';
import { VehicleInstances } from '@skelly/engine/internal/core/vehicleInstances.ts';
import {
  BlockEntities,
  CHUNK,
  Chunk,
  createTerrainEvaluator,
  worldBricks,
  worldOpaque,
  worldSolid,
} from '@skelly/engine/world';
import { expect, it, vi } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { workerPlanScale as scale, workerPlan } from './fixtures/terrainWorkerPlan.ts';

it('unknown publication blocks movement, sight, light, combat and sound without inventing footsteps', () => {
  const registry = baseRegistry();
  const floor = registry.blocks.length;
  registry.blocks.push({
    ...registry.blocks.find((block) => block.solid)!,
    id: 'fixture_surface',
    footsteps: { player: 'fixture_step' },
    drops: { default: 'fixture_drop' },
  });
  const evaluator = createTerrainEvaluator(workerPlan());
  const generateColumn = vi.fn((cx: number, cz: number) =>
    Array.from({ length: scale.maxCy - scale.minCy + 1 }, (_, at) => {
      const chunk = new Chunk(cx, scale.minCy + at, cz);
      if (chunk.cy === 0) {
        for (let z = 0; z < CHUNK; z++) {
          for (let x = 0; x < CHUNK; x++) {
            chunk.set(x, 0, z, floor);
          }
        }
      }
      return chunk;
    }),
  );
  const world = new SimulationTerrain({ ...evaluator, generateColumn });
  const entities = new BlockEntities(registry);
  const solid = worldSolid(world, registry, entities);
  const bricks = worldBricks(world, registry, entities);
  const opaque = worldOpaque(world, registry, entities);
  const light = worldLightBlocking(world, registry, entities);
  const sound = worldSoundBlocking(world, registry, { entities });
  const combat = worldMeleeBlocker(world, registry, { entities })({ kind: 'player', motion: 'thrust' });
  const support = (x: number) =>
    footstepEventAt([x, 1, 1], { halfWidth: 0.25 }, world.getBlock.bind(world), {
      blocks: registry.blocks,
      footstepSounds: registry.footstepSounds,
      family: 'player',
    });
  const dropContext = {
    blockIdAt: world.getBlock.bind(world),
    entities,
    vehicles: new VehicleInstances(),
    blockSize: scale.blockSize,
  };
  const itemType = registry.items.keys().next().value!;
  expect(pileDropSound(registry, itemType, [CHUNK + 0.5, 1, 1], dropContext)).toBeUndefined();
  const out = { lo: 0, hi: 0 };
  expect(world.getBlock(CHUNK, 1, 1)).toBe(NOT_LOADED);
  expect(world.getChunk(1, 0, 0)).toBe(NOT_LOADED);
  expect(generateColumn).not.toHaveBeenCalled();
  world.arrive(0, 0);
  expect(world.ready(1, 1)).toBe(false);
  expect(world.ready(CHUNK, 1)).toBe(false);
  expect([solid(CHUNK, 1, 1), opaque(CHUNK, 1, 1), sound(CHUNK, 1, 1), combat(CHUNK, 1, 1)]).toEqual([
    true,
    true,
    true,
    true,
  ]);
  expect(light(CHUNK, 1, 1)).toBe(true);
  expect(bricks.brick(CHUNK / 4, 0, 0, out)).toBe(true);
  expect([out.lo, out.hi]).toEqual([0xff_ff_ff_ff, 0xff_ff_ff_ff]);
  expect(support(CHUNK + 0.5)).toBeUndefined();
  expect(support(1)).toBe('fixture_step');
  const body: Body = { pos: [CHUNK - 0.5, 1, 1], vel: [4, 0, 0], halfWidth: 0.25, height: 1, onGround: true };
  const advance = () => {
    for (let frame = 0; frame < 20; frame++) {
      body.vel[0] = 4;
      stepBody(body, 1 / 60, solid, { gravity: 9.8, stepHeight: 0 });
    }
  };
  advance();
  expect(body.pos[0]).toBeLessThan(CHUNK);
  world.arrive(1, 0);
  expect([solid(CHUNK, 1, 1), opaque(CHUNK, 1, 1), sound(CHUNK, 1, 1), combat(CHUNK, 1, 1)]).toEqual([
    false,
    false,
    false,
    false,
  ]);
  expect(light(CHUNK, 1, 1)).toBe(false);
  advance();
  expect(body.pos[0]).toBeGreaterThan(CHUNK);
  expect(support(CHUNK + 0.5)).toBe('fixture_step');
  expect(pileDropSound(registry, itemType, [CHUNK + 0.5, 1, 1], dropContext)).toBe('fixture_drop');
  for (let z = -1; z <= 1; z++) {
    for (let x = -1; x <= 1; x++) {
      world.arrive(x, z);
    }
  }
  expect(world.ready(1, 1)).toBe(true);
  world.unload(1, 0);
  expect(world.getBlock(CHUNK, 1, 1)).toBe(NOT_LOADED);
  expect(support(CHUNK + 0.5)).toBeUndefined();
});
