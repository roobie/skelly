import { Inventory, toggleLight } from '@skelly/engine/inventory';
import { LampReachCache, World } from '@skelly/engine/world';
import { FixtureReach } from '@skelly/presentation/internal/render/fixtureReach.ts';
import { LightPool } from '@skelly/presentation/render';
import {
  type Data3DTexture,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type Vector4,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

const tuning = { cellBlocks: 1, rangeMetres: 8 };
const setup = () => {
  const inventory = new Inventory(baseRegistry());
  const lamp = inventory.create('oil_lamp');
  if (!inventory.add(lamp, { kind: 'hand', side: 'right' })) {
    throw new Error('Hand placement refused');
  }
  const refusal = toggleLight(inventory.registry, lamp, 0);
  if (refusal !== undefined) {
    throw new Error(refusal);
  }
  const pool = new LightPool(new Scene(), 1);
  const cache = new LampReachCache({ world: new World(), entities: inventory.entities }, (x) => x === 3, 1, tuning);
  const picture = new FixtureReach(cache, pool.size, 1, tuning);
  const material = new MeshStandardMaterial();
  picture.patch.install(material);
  const shader = {
    uniforms: {},
    vertexShader: '',
    fragmentShader: '#include <common>\n#include <lights_fragment_begin>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  const position: [number, number, number] = [0.25, 2.25, 0.25];
  const update = () => {
    pool.update(inventory, {
      camera: new PerspectiveCamera(),
      held: {
        lightPositionOf: (_item, out) => {
          out.set(...position);
          return true;
        },
      },
      blockSize: 1,
      daylightScale: 1,
    });
    picture.update(pool.reachSlots);
  };
  return { inventory, lamp, pool, cache, picture, shader, position, update };
};

describe('item light picture reach', () => {
  it('uploads a dropped lit oil lantern’s wall check to its picture slot, leaving the next room dark', () => {
    const { inventory, lamp, pool, picture, cache, shader, update } = setup();
    expect(inventory.move(lamp, { kind: 'pile', pos: [0, 2, 0] }).ok).toBe(true);
    expect(shader.fragmentShader).toContain('fixtureReach(UNROLLED_LOOP_INDEX,');
    update();
    const slot = pool.lights.findIndex((light) => light.intensity > 0);
    expect(slot).toBeGreaterThanOrEqual(0);
    const size = (shader.uniforms.uReachSize!.value as Float32Array)[slot]!;
    expect(size).toBeGreaterThan(0);
    const box = (shader.uniforms.uReachBox!.value as Vector4[])[slot]!;
    const texture = shader.uniforms.uReachGrid!.value as Data3DTexture;
    const sample = (x: number) => {
      const cell = [x - box.x, 2.5 - box.y, 0.5 - box.z].map(Math.floor);
      return texture.image.data![
        cell[0]! + texture.image.width * (cell[2]! + texture.image.height * (box.w * texture.image.width + cell[1]!))
      ];
    };
    expect(sample(1.5)).toBeGreaterThan(0);
    expect(sample(4.5)).toBe(0);
    picture.dispose();
    cache.dispose();
  });

  it('reuses a moving light’s reach and upload within a source cell, rebuilding on a cell crossing', () => {
    const { pool, cache, picture, position, shader, update } = setup();
    update();
    const source = pool.reachSlots.find((light) => light !== undefined)!;
    const before = cache.reachOf(source)!;
    const texture = shader.uniforms.uReachGrid!.value as Data3DTexture;
    const { version } = texture;
    position[0] += tuning.cellBlocks / 4;
    update();
    expect(cache.reachOf(pool.reachSlots[0]!)!).toBe(before);
    expect(texture.version).toBe(version);
    position[0] += tuning.cellBlocks;
    update();
    expect(cache.reachOf(pool.reachSlots[0]!)!).not.toBe(before);
    expect(texture.version).toBeGreaterThan(version);
    picture.dispose();
    cache.dispose();
  });
});
