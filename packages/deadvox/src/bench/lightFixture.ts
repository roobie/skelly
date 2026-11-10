import { requireDayCycle } from '@skelly/engine/content';
import { claimed, HandlingQueue, Inventory, toggleLight } from '@skelly/engine/inventory';
import { bindReach, Simulation, Survival } from '@skelly/engine/sim';
import type { RenderedEngine } from '@skelly/presentation/play';
import { type HeldItems, LightPool, PileMeshes } from '@skelly/presentation/render';
import type { PerspectiveCamera } from 'three';

const BENCH_LIGHT_COUNTS = Object.freeze({ carried: 4, dropped: 12 });
const INNER_RING_COUNT = 4;

export const createBenchLightFixture = (engine: RenderedEngine, calendar: number) => {
  const { config, registry, scene, spawn } = engine;
  const { blockSize } = config.scale;
  const inventory = new Inventory(registry);
  const add = (type: string, target: Parameters<Inventory['add']>[1]) => {
    const item = inventory.create(type);
    if (!inventory.add(item, target)) {
      throw new Error(`Could not place benchmark light: ${type}`);
    }
    if (toggleLight(registry, item, calendar) !== undefined) {
      throw new Error(`Could not light benchmark item: ${type}`);
    }
    return item;
  };

  add('torch', { kind: 'hand', side: 'right' });
  add('candle', { kind: 'hand', side: 'left' });
  const hoodie = inventory.create('hoodie');
  if (!inventory.add(hoodie, { kind: 'worn' })) {
    throw new Error('Could not wear benchmark light container');
  }
  add('glowstick', { kind: 'pocket', owner: hoodie, pocket: 0 });
  add('glowstick', { kind: 'pocket', owner: hoodie, pocket: 0 });

  const [x, , z] = spawn.pos;
  const dropped = (ring: number, count: number, radius: number): void => {
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      const blockX = Math.round((x + Math.cos(angle) * radius) / blockSize);
      const blockZ = Math.round((z + Math.sin(angle) * radius) / blockSize);
      const ground = engine.groundAt((blockX + 0.5) * blockSize, (blockZ + 0.5) * blockSize);
      const pos: [number, number, number] = [blockX, Math.floor(ground / blockSize), blockZ];
      const item = inventory.create('glowstick');
      if (!inventory.add(item, { kind: 'pile', pos })) {
        throw new Error(`Could not place dropped benchmark glowstick on ring ${ring}`);
      }
      if (toggleLight(registry, item, calendar) !== undefined) {
        throw new Error('Could not light dropped benchmark glowstick');
      }
    }
  };
  dropped(0, INNER_RING_COUNT, 3);
  dropped(1, BENCH_LIGHT_COUNTS.dropped - INNER_RING_COUNT, 6);

  const simulation = new Simulation({
    seed: config.seed,
    registry,
    bodyTuning: claimed(registry.body, 'player')!,
    compressionCaps: claimed(registry.compression, 'player')!.caps,
    clock: { ratio: requireDayCycle(registry).clockRatio, start: calendar },
  });
  const queue = new HandlingQueue(inventory);
  const survival = new Survival(simulation, inventory, queue, {
    reach: bindReach({ inventory, position: spawn.pos, blockSize, clock: simulation.clock }),
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: () => undefined,
    readingLight: () => undefined,
    read: () => {
      throw new Error('Unexpected reading in light benchmark fixture');
    },
  });
  const lightPool = new LightPool(scene, claimed(registry.senses, 'player')!.light.renderedFixtureLimit);
  const piles = new PileMeshes(blockSize);
  piles.sync(inventory);
  scene.add(piles.group);
  const noHeldPose: Pick<HeldItems, 'lightPositionOf'> = { lightPositionOf: () => false };
  return {
    inventory,
    carried: BENCH_LIGHT_COUNTS.carried,
    dropped: BENCH_LIGHT_COUNTS.dropped,
    lightPool,
    update: (targetCamera: PerspectiveCamera, daylightScale: number) =>
      lightPool.update(inventory, { held: noHeldPose, camera: targetCamera, blockSize, daylightScale }),
    setSprinting: (sprinting: boolean) => survival.setSprinting(sprinting),
    activeCount: () => [...inventory.items()].filter(({ item }) => item.on).length,
    dispose: () => {
      piles.dispose();
      lightPool.group.removeFromParent();
    },
  };
};
