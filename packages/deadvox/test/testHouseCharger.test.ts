import { batteryCapacityMicrojoules, batteryEnergy } from '@skelly/engine/inventory';
import { createSession, IDLE } from '@skelly/engine/session';
import {
  createWorldSetup,
  generateColumn,
  playerStartFromWorld,
  sitePalette,
  terrainShapeOf,
  toChunk,
} from '@skelly/engine/world';
import { ChunkMeshes } from '@skelly/presentation/render';
import { expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { quietMesherSource } from './fixtures/quietMesherSource.ts';
import { configOnSite } from './fixtures/startupContent.ts';

it('lets a player charge a nearby rechargeable cell from the test-house spawn', () => {
  const config = configOnSite('testHouse', { debug: true });
  const { registry } = config.content;
  const source = createWorldSetup(config, new ChunkMeshes(config.scale.blockSize, registry), quietMesherSource());
  const start = playerStartFromWorld(source, config.scale);
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world: source.world,
    entities: source.entities,
    isSolid: source.isSolid,
    isOpaque: source.isOpaque,
    scale: config.scale,
    seed: config.seed,
    start: config.start,
    spawn: start.position,
    powerDevices: source.powerDevices,
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => start.yaw,
      pitch: () => 0,
      walking: () => true,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  const charger = [...session.entities.records].find((entity) => registry.furniture.get(entity.type)?.charger);
  expect(charger, 'test-house power binds an ordinary charger endpoint').toBeDefined();
  const columns = new Set([
    `${toChunk(start.position[0])},${toChunk(start.position[2])}`,
    ...source.powerDevices.map(({ pos }) => `${toChunk(pos[0])},${toChunk(pos[2])}`),
  ]);
  for (const column of columns) {
    const [cx, cz] = column.split(',').map(Number) as [number, number];
    for (const chunk of generateColumn(
      {
        seed: config.seed,
        scale: config.scale,
        blocks: sitePalette(registry).terrain,
        shape: terrainShapeOf(registry),
        surface: source.site?.surface,
        stamp: source.site ? (generated) => source.site!.stamp(generated) : undefined,
      },
      cx,
      cz,
      [],
    )) {
      source.world.addChunk(chunk);
    }
    session.onColumn(cx, cz, source);
  }
  session.sim.paused = false;
  const finishHandling = () => {
    for (let frame = 0; session.queue.busy && frame < 3600; frame++) {
      session.frame(1 / 60);
    }
    expect(session.queue.busy).toBe(false);
  };
  expect(session.inventory.canReachEntity(charger!)).toBe(true);
  expect(session.search(charger!)).toBeUndefined();
  finishHandling();
  const nearby = session.reach().entries;
  const cell = nearby.find(({ item }) => registry.items.get(item.type)?.battery?.rechargeable)?.item;
  const lamp = nearby.find(({ item }) => registry.items.get(item.type)?.light)?.item;
  expect(cell, 'a rechargeable cell is available without travel or debug inventory edits').toBeDefined();
  expect(lamp, 'a light is beside the cell').toBeDefined();
  const before = batteryEnergy(registry, cell!);
  expect(before).toBeGreaterThan(0);
  expect(before).toBeLessThan(batteryCapacityMicrojoules(registry, cell!.type)!);
  expect(session.queue.enqueue(cell!, { kind: 'furniture', entity: charger!, pocket: 0 }).ok).toBe(true);
  finishHandling();
  expect(session.chargerControl(charger!.uid, 'start')).toBeUndefined();
  for (let frame = 0; frame < 120; frame++) {
    session.frame(1 / 60);
  }
  expect(batteryEnergy(registry, cell!)).toBeGreaterThan(before);
});
