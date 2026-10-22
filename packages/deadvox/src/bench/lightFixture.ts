import { type PerspectiveCamera, Vector3 } from 'three';
import { requireDayCycle } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Vec3 } from '../core/coords.ts';
import { HandlingQueue } from '../core/handling.ts';
import { Inventory } from '../core/inventory.ts';
import { toggleLight } from '../core/lights.ts';
import { bindReach } from '../core/reach.ts';
import { Simulation } from '../core/sim.ts';
import type { RenderedEngine } from '../game/engine.ts';
import { Survival } from '../game/survival.ts';
import type { HeldItems } from '../render/hands.ts';
import { LightPool, POINT_LIGHT_POOL_SIZE } from '../render/lightPool.ts';
import { PileMeshes } from '../render/piles.ts';

export const BENCH_LIGHT_COUNTS = Object.freeze({ carried: 4, dropped: 12, pointLights: POINT_LIGHT_POOL_SIZE });
const INNER_RING_COUNT = 4;

export const benchFlareSourcesFromUrl = (params: URLSearchParams): Vec3[] | undefined => {
  const value = params.get('flareSources');
  if (value === null) {
    return undefined;
  }
  const positions: unknown = JSON.parse(value);
  if (
    !Array.isArray(positions) ||
    positions.length > POINT_LIGHT_POOL_SIZE ||
    !positions.every(
      (pos) => Array.isArray(pos) && pos.length === 3 && pos.every((n) => typeof n === 'number' && Number.isFinite(n)),
    )
  ) {
    throw new Error('flareSources must be an array of camera-local metre triples within the point-light pool budget');
  }
  return positions as Vec3[];
};

const createFlareFixture = (engine: RenderedEngine, positions: readonly Vec3[]) => {
  const light = engine.registry.items.get('torch')?.light;
  if (!light) {
    throw new Error('Missing benchmark torch content');
  }
  const lightPool = new LightPool(engine.scene);
  const local = new Vector3();
  return {
    inventory: new Inventory(engine.registry),
    carried: 0,
    dropped: 0,
    lightPool,
    update: (camera: PerspectiveCamera, daylightScale: number) => {
      camera.updateMatrixWorld();
      for (const [index, slot] of lightPool.lights.entries()) {
        const pos = positions[index];
        slot.intensity = pos ? light.intensity * daylightScale : 0;
        slot.color.set(light.color);
        slot.distance = light.radius;
        if (pos) {
          slot.position.copy(local.fromArray(pos).applyMatrix4(camera.matrixWorld));
        }
      }
    },
    setSprinting: (_sprinting: boolean) => undefined,
    activeCount: () => positions.length,
    dispose: () => lightPool.group.removeFromParent(),
  };
};

export const createBenchLightFixture = (engine: RenderedEngine, calendar: number, positions?: readonly Vec3[]) => {
  if (positions) {
    return createFlareFixture(engine, positions);
  }
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
    bodyTuning: registry.body.get(CORE_CONTENT_IDS.player)!,
    compressionCaps: registry.compression.get(CORE_CONTENT_IDS.player)!.caps,
    clock: { ratio: requireDayCycle(registry).clockRatio, start: calendar },
  });
  const queue = new HandlingQueue(inventory);
  const survival = new Survival(simulation, inventory, queue, {
    reach: bindReach({ inventory, position: spawn.pos, blockSize, clock: simulation.clock }),
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: () => undefined,
    read: () => {
      throw new Error('Unexpected reading in light benchmark fixture');
    },
  });
  const lightPool = new LightPool(scene);
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
