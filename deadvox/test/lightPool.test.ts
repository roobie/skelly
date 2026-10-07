import { readdirSync, readFileSync } from 'node:fs';
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { lightSenseSourceFor, sunExposedAt, toggleLight } from '../src/core/lights.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { HeldItems } from '../src/render/hands.ts';
import { LightPool, POINT_LIGHT_POOL_SIZE } from '../src/render/lightPool.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => read(`src/content/base/${file}`)),
);
const SHAMBLER = registry.zombies.get('shambler')!;
const SCALE = makeScale(0.5);
const TEST_LIGHTS = [
  { id: 'test_light_1', intensity: 11 },
  { id: 'test_light_2', intensity: 22 },
  { id: 'test_light_3', intensity: 33 },
  { id: 'test_light_4', intensity: 44 },
  { id: 'test_light_5', intensity: 55 },
] as const;
const registryWithTestLights = () => {
  const items = new Map(registry.items);
  const source = registry.items.get('glowstick')!;
  for (const { id, intensity } of TEST_LIGHTS) {
    items.set(id, { ...source, id, name: id, light: { ...source.light!, intensity } });
  }
  return { ...registry, items };
};

describe('made-light point pool', () => {
  it.each(['right', 'left'] as const)('places a carried fixture light at its held %s-hand position', (side) => {
    const fixtureRegistry = registryWithTestLights();
    const scene = new Scene();
    const pool = new LightPool(scene);
    const inventory = new Inventory(fixtureRegistry);
    const light = inventory.create(TEST_LIGHTS[0].id);
    expect(toggleLight(fixtureRegistry, light, 0)).toBeUndefined();
    expect(inventory.add(light, { kind: 'hand', side })).toBe(true);
    const held = new HeldItems(inventory, undefined, fixtureRegistry.figures.get('player')!.palette);
    const camera = new PerspectiveCamera();
    camera.position.set(2, 1, -3);
    held.update(camera);

    pool.update(inventory, { held, camera, blockSize: 1, daylightScale: 1 });

    const expected = new Vector3();
    expect(held.lightPositionOf(light, camera, expected)).toBe(true);
    expect(pool.lights[0]!.intensity).toBeGreaterThan(0);
    expect(pool.lights[0]!.position.distanceTo(expected)).toBeLessThan(1e-9);
    held.dispose();
  });

  it('keeps a dropped lit glowstick in both the renderer set and zombie sense', () => {
    const scene = new Scene();
    const pool = new LightPool(scene);
    const inventory = new Inventory(registry);
    const glowstick = inventory.create('glowstick');
    expect(inventory.add(glowstick, { kind: 'hand', side: 'right' })).toBe(true);
    expect(toggleLight(registry, glowstick, 0)).toBeUndefined();
    expect(inventory.move(glowstick, { kind: 'pile', pos: [3, 1, 0] }).ok).toBe(true);
    const entry = [...inventory.items()].find(({ item }) => item === glowstick)!;
    const source = lightSenseSourceFor({
      registry,
      item: glowstick,
      location: entry.location,
      path: entry.path,
      playerPosition: [50, 1, 50],
      eyeHeightMetres: 1.3,
    });
    expect(source?.carried).toBe(false);

    const camera = new PerspectiveCamera();
    camera.position.set(0, 1, 0);
    pool.update(inventory, {
      held: { lightPositionOf: () => false },
      camera,
      blockSize: SCALE.blockSize,
      daylightScale: 1,
    });
    expect(pool.lights[4]!.intensity).toBeGreaterThan(0);
    if (entry.location.kind !== 'pile') {
      throw new Error('Glowstick left its pile');
    }
    expect(pool.lights[4]!.position.x).toBeCloseTo((entry.location.pile.pos[0] + 0.5) * SCALE.blockSize);
    expect(pool.lights[4]!.position.z).toBeCloseTo((entry.location.pile.pos[2] + 0.5) * SCALE.blockSize);
    expect(pool.lights[4]!.position.x).toBeCloseTo(source!.pos[0] * SCALE.blockSize);
    expect(pool.lights[4]!.position.z).toBeCloseTo(source!.pos[2] * SCALE.blockSize);

    const floor = (_x: number, y: number) => y === 0;
    const zombies = new ZombieSystem({
      player: () => ({
        pos: [50, 1, 50],
        facing: [-1, 0, 0],
        movement: 'still',
        lit: false,
        lightSeenFrom: 40,
        lightSources: source ? [source] : [],
      }),
      isSolid: floor,
      isOpaque: floor,
      hour: () => 0,
      blockSize: SCALE.blockSize,
      physics: physicsFor(SCALE),
      jumpSpeed: PLAYER.jump,
      tuning: TEST_SENSE_TUNING,
      hurtPlayer: () => undefined,
    });
    const id = zombies.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    zombies.tick(1 / 60);
    expect(zombies.store.get(id)!.mode).toBe('investigate');
    expect(zombies.store.get(id)!.lastPerceived).toEqual(source?.pos);
  });

  it('shares exposure for carried pockets but excludes lights stored in furniture', () => {
    const inventory = new Inventory(registry);
    const backpack = inventory.create('school_backpack');
    expect(inventory.add(backpack, { kind: 'worn' })).toBe(true);
    const pocketLight = inventory.create('glowstick');
    expect(toggleLight(registry, pocketLight, 0)).toBeUndefined();
    expect(inventory.add(pocketLight, { kind: 'pocket', owner: backpack, pocket: 0 })).toBe(true);
    const pocketEntry = [...inventory.items()].find(({ item }) => item === pocketLight)!;
    const pocketSource = lightSenseSourceFor({
      registry,
      item: pocketLight,
      location: pocketEntry.location,
      path: pocketEntry.path,
      playerPosition: [4, 1, 0],
      eyeHeightMetres: 1.3,
    });
    expect(pocketSource?.carried).toBe(true);

    const heldGun = inventory.create('rifle_assault');
    expect(inventory.add(heldGun, { kind: 'hand', side: 'right' })).toBe(true);
    const mountedLight = inventory.create('flashlight');
    expect(toggleLight(registry, mountedLight, 0)).toBeUndefined();
    heldGun.slots = { ...heldGun.slots, 'device.light': mountedLight };
    const mountedEntry = [...inventory.items()].find(({ item }) => item === mountedLight)!;
    const mountedSource = lightSenseSourceFor({
      registry,
      item: mountedLight,
      location: mountedEntry.location,
      path: mountedEntry.path,
      playerPosition: [4, 1, 0],
      eyeHeightMetres: 1.3,
    });
    expect(mountedSource?.carried).toBe(true);
    mountedLight.slots!.battery!.charges = 0;
    expect(
      lightSenseSourceFor({
        registry,
        item: mountedLight,
        location: mountedEntry.location,
        path: mountedEntry.path,
        playerPosition: [4, 1, 0],
        eyeHeightMetres: 1.3,
      }),
    ).toBeUndefined();

    const cupboard = inventory.furnish({ type: 'kitchen_cupboard', pos: [0, 0, 0], size: [2, 2, 1], facing: 'n' }, [])!;
    const storedLight = inventory.create('glowstick');
    expect(toggleLight(registry, storedLight, 0)).toBeUndefined();
    expect(inventory.add(storedLight, { kind: 'furniture', entity: cupboard, pocket: 0 })).toBe(true);
    const storedEntry = [...inventory.items()].find(({ item }) => item === storedLight)!;
    expect(
      lightSenseSourceFor({
        registry,
        item: storedLight,
        location: storedEntry.location,
        path: storedEntry.path,
        playerPosition: [4, 1, 0],
        eyeHeightMetres: 1.3,
      }),
    ).toBeUndefined();

    const pool = new LightPool(new Scene());
    pool.update(inventory, {
      held: { lightPositionOf: () => false },
      camera: new PerspectiveCamera(),
      blockSize: SCALE.blockSize,
      daylightScale: 1,
    });
    expect(pool.lights[0]!.intensity).toBeGreaterThan(0);
    expect(pool.lights.filter((light) => light.intensity > 0)).toHaveLength(1);
  });

  it('uses daytime sky exposure for light gating, not direct sun angle', () => {
    const wallShadow: SolidAt = (_x, y, z) => y >= 2 && z === -1;
    const open = sunExposedAt([0.5, 1, 0.5], 12, 20, () => false);
    const roofed = sunExposedAt([0.5, 1, 0.5], 12, 20, (_x, y) => y === 2);
    const shadow = sunExposedAt([0.5, 1, 0.5], 12, 20, wallShadow);
    const night = sunExposedAt([0.5, 1, 0.5], 0, 20, () => false);

    expect(open).toBe(true);
    expect(roofed).toBe(false);
    expect(shadow).toBe(true);
    expect(night).toBe(false);
  });

  it('keeps all eight shader-light slots allocated as sources change', () => {
    const scene = new Scene();
    const pool = new LightPool(scene);
    const inventory = new Inventory(registry);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1, 0);
    const held = { lightPositionOf: () => false };
    const first = inventory.create('glowstick');
    expect(toggleLight(registry, first, 0)).toBeUndefined();
    inventory.add(first, { kind: 'pile', pos: [1, 0, 0] });

    pool.update(inventory, { held, camera, blockSize: 1, daylightScale: 1 });
    expect(pool.lights).toHaveLength(POINT_LIGHT_POOL_SIZE);
    expect(pool.lights.filter((light) => light.intensity > 0)).toHaveLength(1);

    inventory.consume(first);
    pool.update(inventory, { held, camera, blockSize: 1, daylightScale: 1 });
    expect(pool.lights).toHaveLength(POINT_LIGHT_POOL_SIZE);
    expect(pool.lights.every((light) => light.intensity === 0)).toBe(true);
  });

  it('assigns the carried partition to both hands and the first pockets, excluding a fifth source', () => {
    const fixtureRegistry = registryWithTestLights();
    const pool = new LightPool(new Scene());
    const inventory = new Inventory(fixtureRegistry);
    const camera = new PerspectiveCamera();
    const held = { lightPositionOf: () => false };
    const [rightId, leftId, ...pocketIds] = TEST_LIGHTS.map(({ id }) => id);
    const right = inventory.create(rightId!);
    const left = inventory.create(leftId!);
    const hoodie = inventory.create('hoodie');
    expect(inventory.add(right, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.add(left, { kind: 'hand', side: 'left' })).toBe(true);
    expect(inventory.add(hoodie, { kind: 'worn' })).toBe(true);
    const pocketed = pocketIds.map((id) => inventory.create(id));
    for (const item of pocketed) {
      expect(inventory.add(item, { kind: 'pocket', owner: hoodie, pocket: 0 })).toBe(true);
      expect(toggleLight(fixtureRegistry, item, 0)).toBeUndefined();
    }
    for (const item of [right, left]) {
      expect(toggleLight(fixtureRegistry, item, 0)).toBeUndefined();
    }

    pool.update(inventory, { held, camera, blockSize: 1, daylightScale: 1 });
    const pocketIntensities = [...inventory.items()]
      .filter(({ location }) => location.kind === 'pocket' && location.owner === hoodie)
      .map(({ item }) => fixtureRegistry.items.get(item.type)!.light!.intensity);
    const handIntensities = [right, left].map((item) => fixtureRegistry.items.get(item.type)!.light!.intensity);
    expect(pocketIntensities).toHaveLength(3);
    expect(pool.lights.map((light) => light.intensity)).toEqual([
      ...handIntensities,
      ...pocketIntensities.slice(0, 2),
      0,
      0,
      0,
      0,
    ]);
  });

  it('assigns the dropped partition to the nearest four stay-lit lights', () => {
    const fixtureRegistry = registryWithTestLights();
    const pool = new LightPool(new Scene());
    const inventory = new Inventory(fixtureRegistry);
    const camera = new PerspectiveCamera();
    const held = { lightPositionOf: () => false };
    const distances = [5, 2, 9, 1, 4];
    for (const [index, { id }] of TEST_LIGHTS.entries()) {
      const item = inventory.create(id);
      expect(toggleLight(fixtureRegistry, item, 0)).toBeUndefined();
      expect(inventory.add(item, { kind: 'pile', pos: [distances[index]!, 0, 0] })).toBe(true);
    }

    pool.update(inventory, { held, camera, blockSize: 1, daylightScale: 1 });
    const selectedIntensities = pool.lights.map((light) => light.intensity).filter((intensity) => intensity > 0);
    const farthestIndex = distances.indexOf(Math.max(...distances));
    const nearestIntensities = TEST_LIGHTS.filter((_, index) => index !== farthestIndex).map(
      ({ intensity }) => intensity,
    );
    expect(selectedIntensities).toHaveLength(4);
    expect(new Set(selectedIntensities)).toEqual(new Set(nearestIntensities));
    expect(selectedIntensities).not.toContain(TEST_LIGHTS[farthestIndex]!.intensity);
  });
});
