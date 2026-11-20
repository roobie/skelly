import { worldLightBlocking, worldOpaque } from '@skelly/engine/internal/core/collision.ts';
import { reaches } from '@skelly/engine/internal/core/illumination.ts';
import { LampReachCache } from '@skelly/engine/internal/core/lampReach.ts';
import { Inventory, toggleLight } from '@skelly/engine/inventory';
import { BlockEntities, Chunk, type PoweredLight, type Vec3, World } from '@skelly/engine/world';
import { ChunkMeshes, LightPool, Shadows } from '@skelly/presentation/render';
import { DirectionalLight, Group, PerspectiveCamera, PointLight, Scene, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const tuning = registry.senses.get('player')!.light;

function room(glass: boolean, rangeMetres = 3) {
  const world = new World();
  world.addChunk(new Chunk(0, 0, 0));
  const entities = new BlockEntities(registry);
  const brick = registry.blocks.findIndex((block) => block?.id === 'brick');
  if (brick <= 0) {
    throw new Error('Fixture needs a brick block');
  }
  // A wall spanning the entire test lamp's radius, with an optional glazed opening.
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      if (!(glass && x >= 3 && x < 6 && y >= 2 && y < 5)) {
        world.setBlock(x, y, 4, brick);
      }
    }
  }
  if (
    glass &&
    !entities.add({ type: 'clear_casement_window', pos: [3, 2, 4], size: [3, 3, 1], facing: 'n', fixed: true })
  ) {
    throw new Error('Fixture window placement refused');
  }
  const sight = vi.fn(worldOpaque(world, registry, entities));
  const cache = new LampReachCache(
    { world, entities, isSightBlocking: sight },
    worldLightBlocking(world, registry, entities),
    1,
    { cellBlocks: 1, rangeMetres },
  );
  const lamp: PoweredLight = { pos: [4.5, 3.5, 6.5], radius: 2, color: '#ffffff', intensity: 1 };
  const camera: Vec3 = [4.5, 3.5, 1.5];
  return { cache, lamp, camera, sight, world };
}

function shadowPass(visible: () => boolean) {
  const scene = new Scene();
  const lamp = new PointLight('#ffffff', 1, 2);
  scene.add(lamp);
  let draws = 0;
  const renderer = {
    shadowMap: {
      render: () => {
        draws += 1;
        lamp.shadow.map = {} as NonNullable<typeof lamp.shadow.map>;
      },
    },
  } as unknown as WebGLRenderer;
  const shadows = new Shadows(
    renderer,
    scene,
    { light: new DirectionalLight(), rig: new Group() },
    new ChunkMeshes(1, registry),
  );
  shadows.attachItems(
    [lamp],
    () => [],
    tuning.itemShadow,
    () => [visible()],
  );
  const traverse = vi.spyOn(scene, 'traverse');
  const frame = () => renderer.shadowMap.render([], scene, new PerspectiveCamera());
  return { frame, shadows, traverse, draws: () => draws };
}

describe('item lamp reach meets the view', () => {
  it('keeps a hidden still lamp lit when its doorway spill reaches visible floor, within the sight budget', () => {
    const world = new World();
    for (const cx of [-1, 0]) {
      for (const cy of [-1, 0]) {
        for (const cz of [-1, 0]) {
          world.addChunk(new Chunk(cx, cy, cz));
        }
      }
    }
    const brick = registry.blocks.findIndex((block) => block?.id === 'brick');
    if (brick <= 0) {
      throw new Error('Fixture needs brick');
    }
    const paintColumn = (x: number) => {
      for (let z = -24; z < 24; z++) {
        world.setBlock(x, -1, z, brick);
      }
      for (let y = 0; y < 22; y++) {
        if (!(x >= 1 && x < 3 && y < 4)) {
          world.setBlock(x, y, 10, brick);
        }
      }
    };
    for (let x = -24; x < 24; x++) {
      paintColumn(x);
    }
    const entities = new BlockEntities(registry);
    const sight = worldOpaque(world, registry, entities);
    const cache = new LampReachCache(
      { world, entities, isSightBlocking: sight },
      worldLightBlocking(world, registry, entities),
      0.5,
      tuning.illumination.reach,
    );
    const lamp: PoweredLight = { pos: [-4.5, 2.5, 4.5], radius: 8, color: '#ffffff', intensity: 1, reachSource: {} };
    const camera: Vec3 = [6.5, 3.5, 18.5];
    expect(reaches(camera, lamp.pos, sight)).toBe(false);
    const budget = tuning.illumination.reach.viewRaysPerFrame;
    let receivers = 0;
    cache.beginViewFrame(budget);
    cache.meetsView(lamp, camera, () => {
      receivers += 1;
      return false;
    });
    expect(receivers).toBeGreaterThan(0);
    expect(receivers).toBeLessThanOrEqual(budget);
    cache.beginViewFrame(budget);
    expect(cache.meetsView(lamp, camera, (point) => point[2] > 10.5)).toBe(true);
    cache.dispose();
  });
  it.each([false, true])('skips the caster walk behind brick but draws through glass (%s)', (glass) => {
    const { cache, lamp, camera } = room(glass);
    cache.beginViewFrame(1000);
    const visible = cache.meetsView(lamp, camera, () => true);
    expect(visible).toBe(glass);
    const pass = shadowPass(() => visible);
    pass.frame();
    expect(pass.draws()).toBe(glass ? 1 : 0);
    expect(pass.traverse).toHaveBeenCalledTimes(glass ? 1 : 0);
    expect(pass.shadows.itemStats.culled).toBe(glass ? 0 : 1);
    cache.dispose();
  });

  it('bounds sight work across frames, reuses rays on rotation and invalidates on an intervening edit', () => {
    const { cache, lamp, camera, sight, world } = room(false);
    cache.beginViewFrame(1);
    expect(cache.meetsView(lamp, camera, () => false)).toBe(false);
    expect(sight).not.toHaveBeenCalled();
    cache.beginViewFrame(1);
    expect(cache.meetsView(lamp, camera, () => true)).toBe(false);
    const firstQueries = sight.mock.calls.length;
    expect(firstQueries).toBeGreaterThan(0);
    // No new budget in this frame, even if asked again.
    cache.meetsView(lamp, camera, () => true);
    expect(sight).toHaveBeenCalledTimes(firstQueries);
    cache.beginViewFrame(1000);
    expect(cache.meetsView(lamp, camera, () => true)).toBe(false);
    const settledQueries = sight.mock.calls.length;
    cache.beginViewFrame(1000);
    cache.meetsView(lamp, camera, () => true);
    expect(sight).toHaveBeenCalledTimes(settledQueries);
    // Open the wall through the world owner, not through cache internals.
    for (let y = 2; y < 5; y++) {
      for (let x = 3; x < 6; x++) {
        world.setBlock(x, y, 4, 0);
      }
    }
    // The opening alone is empty air; put a receiving surface below the lamp.
    world.setBlock(4, 2, 6, world.getBlock(0, 0, 4));
    cache.beginViewFrame(1000);
    expect(cache.meetsView(lamp, camera, () => true)).toBe(true);
    cache.dispose();
  });

  it('skips surface rebuilds while moving and reuses receiver storage while still', () => {
    const blocking = vi.fn((_x: number, y: number) => y === 0);
    const cache = new LampReachCache({ world: new World(), entities: new BlockEntities(registry) }, blocking, 0.5, {
      cellBlocks: 1,
      rangeMetres: 4,
    });
    const lamp: PoweredLight = {
      pos: [0.5, 3.5, 0.5],
      radius: 4,
      color: '#ffffff',
      intensity: 1,
      reachSource: {},
    };
    const positions = new Set<Vec3>();
    let visits = 0;
    const outside = (point: Vec3) => {
      positions.add(point);
      visits += 1;
      return false;
    };
    cache.beginViewFrame(1000);
    expect(cache.meetsView(lamp, [0, 3, -8], outside)).toBe(false);
    expect(visits).toBeGreaterThan(0);
    const queries = blocking.mock.calls.length;
    expect(queries).toBeGreaterThan(0);
    cache.beginViewFrame(1000);
    const moved: PoweredLight = { ...lamp, pos: [1.5, 3.5, 0.5] };
    expect(cache.meetsView(moved, [0, 3, -8], outside)).toBe(true);
    expect(blocking).toHaveBeenCalledTimes(queries + 1);
    cache.beginViewFrame(1000);
    expect(cache.meetsView(moved, [0, 3, -8], outside)).toBe(false);
    const rebuilt = blocking.mock.calls.length;
    expect(rebuilt).toBeGreaterThan(queries + 1);
    cache.beginViewFrame(1000);
    expect(cache.meetsView(moved, [0, 3, -8], outside)).toBe(false);
    expect(blocking).toHaveBeenCalledTimes(rebuilt);
    expect(positions.size).toBe(1);
    cache.dispose();
  });

  it('does not turn a still emitter in empty air into a surface receiver', () => {
    const { cache, lamp, camera } = room(true);
    const source = { ...lamp, radius: 4 };
    cache.beginViewFrame(1000);
    expect(cache.meetsView(source, camera, (point) => point.every((value, axis) => value === source.pos[axis]))).toBe(
      false,
    );
    cache.dispose();
  });

  it.each(['camera', 'rebuild', 'source'])('keeps the visible answer while %s work is pending', (change) => {
    const { cache, lamp, camera, world } = room(true);
    let source = { ...lamp, reachSource: {} };
    cache.beginViewFrame(1000);
    expect(cache.meetsView(source, camera, () => true)).toBe(true);
    cache.beginViewFrame(0);
    if (change === 'source') {
      source = { ...source, pos: [5.5, 3.5, 6.5] };
    }
    if (change === 'rebuild') {
      world.setBlock(0, 0, 4, 0);
      // Another source consumes the shared rebuild admission before this lamp is considered.
      cache.meetsView({ ...lamp, reachSource: {} }, camera, () => true);
    }
    expect(cache.meetsView(source, [camera[0] + 1, camera[1], camera[2]], () => true)).toBe(true);
    cache.beginViewFrame(1000);
    expect(cache.meetsView(source, camera, () => false)).toBe(false);
    cache.dispose();
  });

  it('uses free-cell visibility during motion and returns to surface culling when motion stops', () => {
    const { cache, lamp, camera } = room(false);
    const source = { ...lamp, radius: 2.8, reachSource: {} };
    cache.beginViewFrame(1000);
    expect(cache.meetsView(source, camera, () => true)).toBe(false);
    cache.beginViewFrame(1000);
    const moved: PoweredLight = { ...source, pos: [4.5, 3.5, 6.1] };
    expect(cache.meetsView(moved, camera, () => true)).toBe(true);
    cache.beginViewFrame(1000);
    expect(cache.meetsView(moved, camera, () => true)).toBe(false);
    cache.beginViewFrame(1000);
    expect(cache.meetsView({ ...moved, pos: [4.5, 3.5, 4.5] }, camera, () => true)).toBe(false);
    cache.dispose();
  });

  it('checks item receivers beyond the fixture grid upload cap', () => {
    const { cache, lamp, camera, world } = room(true, 0.5);
    world.setBlock(4, 2, 8, world.getBlock(0, 0, 4));
    cache.beginViewFrame(1000);
    expect(cache.meetsView(lamp, camera, (point) => point[2] > 7)).toBe(true);
    cache.dispose();
  });

  it('redraws an unchanged dropped lamp on return to view', () => {
    let visible = true;
    const pass = shadowPass(() => visible);
    pass.frame();
    expect(pass.draws()).toBe(1);
    pass.frame();
    expect(pass.draws()).toBe(1);
    visible = false;
    pass.frame();
    expect(pass.draws()).toBe(1);
    visible = true;
    pass.frame();
    expect(pass.draws()).toBe(2);
  });

  it('gives the sole dropped slot to a visible lamp rather than a nearer hidden lamp', () => {
    const inventory = new Inventory(registry);
    const hidden = inventory.create('oil_lamp');
    const visible = inventory.create('oil_lamp');
    for (const [lamp, x] of [
      [hidden, 1],
      [visible, 5],
    ] as const) {
      expect(inventory.add(lamp, { kind: 'pile', pos: [x, 0, 0] })).toBe(true);
      expect(toggleLight(registry, lamp, 0)).toBeUndefined();
    }
    const pool = new LightPool(new Scene(), { heldLamps: 0, droppedLamps: 1, renderedFixtureLimit: 0 });
    pool.update(inventory, {
      held: { lightPositionOf: () => false },
      camera: new PerspectiveCamera(),
      blockSize: 1,
      daylightScale: 1,
      meetsView: (source) => source.reachSource === visible,
    });
    expect(pool.lights[0]!.position.x).toBe(5.5);
    expect(pool.itemVisible).toEqual([true]);
    pool.update(inventory, {
      held: { lightPositionOf: () => false },
      camera: new PerspectiveCamera(),
      blockSize: 1,
      daylightScale: 1,
      meetsView: () => false,
    });
    expect(pool.itemVisible).toEqual([false]);
    expect(pool.lights[0]!.intensity).toBe(0);
    pool.dispose();
  });
});
