import { requireDayCycle } from '@skelly/engine/content';
import { illuminationAt } from '@skelly/engine/internal/core/illumination.ts';
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

const tuning = { cellBlocks: 0.5, penumbraRays: 8 };
const setup = (mode: 'hard' | 'smooth' | 'penumbra' | 'both' = 'hard') => {
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
  const cache = new LampReachCache(
    { world: new World(), entities: inventory.entities },
    (x, _y, z) => x === 3 && z >= 0,
    1,
    tuning,
  );
  cache.previewShadowBlend(mode);
  const picture = new FixtureReach(cache, pool.size, 1, { ...tuning, smooth: mode === 'smooth' || mode === 'both' });
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
      holder: position,
      daylightScale: 1,
    });
    picture.update(pool.reachSlots);
  };
  return { inventory, lamp, pool, cache, picture, shader, position, update };
};

describe('item light picture reach', () => {
  it.each(['hard', 'smooth', 'penumbra', 'both'] as const)(
    'rules and picture share stored coverage at a shadow edge (%s)',
    (mode) => {
      const { inventory, lamp, pool, picture, cache, shader, update } = setup(mode);
      expect(inventory.move(lamp, { kind: 'pile', pos: [0, 2, 0] }).ok).toBe(true);
      expect(shader.fragmentShader).toContain('fixtureReach(UNROLLED_LOOP_INDEX,');
      update();
      const slot = pool.lights.findIndex((light) => light.intensity > 0);
      expect(slot).toBeGreaterThanOrEqual(0);
      const source = pool.reachSlots[slot]!;
      const reach = cache.reachOf(source)!;
      expect((shader.uniforms.uReachSize!.value as Float32Array)[slot]).toBe(reach.size);
      const box = (shader.uniforms.uReachBox!.value as Vector4[])[slot]!;
      const texture = shader.uniforms.uReachGrid!.value as Data3DTexture;
      const scene = {
        inventory,
        sky: { visibilityAt: () => 0 },
        gameHour: 0,
        cycle: requireDayCycle(inventory.registry),
        fixtures: [],
        reach: cache,
        blockSize: 1,
        holder: [0, 0, 0] as [number, number, number],
      };
      const open = new LampReachCache({ world: new World(), entities: inventory.entities }, () => false, 1, tuning);
      const answers = new Set<number>();
      for (let index = 0; index < reach.size ** 2; index++) {
        const cell = [
          index % reach.size,
          Math.floor(source.pos[1] / reach.cellBlocks) - reach.origin[1],
          Math.floor(index / reach.size),
        ];
        for (const offset of [0.01, 0.5, 0.99]) {
          const point = cell.map((value, axis) => (reach.origin[axis]! + value + offset) * reach.cellBlocks) as [
            number,
            number,
            number,
          ];
          if (Math.hypot(...point.map((value, axis) => value - source.pos[axis]!)) >= source.radius) {
            continue;
          }
          const texel = point.map((value, axis) =>
            Math.floor((value - [box.x, box.y, box.z][axis]!) / reach.cellBlocks),
          );
          const painted =
            texture.image.data![
              texel[0]! +
                texture.image.width * (texel[2]! + texture.image.height * (box.w * texture.image.width + texel[1]!))
            ]! / 255;
          const stored = reach.at(point);
          answers.add(stored);
          expect(painted).toBe(stored);
          expect(illuminationAt(scene, point)).toBeCloseTo(
            illuminationAt({ ...scene, reach: open }, point) * stored,
            12,
          );
        }
      }
      expect(answers.has(0)).toBe(true);
      expect(answers.has(1)).toBe(true);
      expect([...answers].some((value) => value > 0 && value < 1)).toBe(mode === 'penumbra' || mode === 'both');
      open.dispose();
      picture.dispose();
      cache.dispose();
    },
  );

  it('keeps a moving light’s last uploaded grid until its cell crossing gets the frame rebuild budget', () => {
    const { pool, cache, picture, shader, update } = setup();
    update();
    const source = pool.reachSlots.find((light) => light !== undefined)!;
    const first = { ...source, reachSource: {}, pos: [...source.pos] as [number, number, number] };
    const second = { ...source, reachSource: {}, pos: [...source.pos] as [number, number, number] };
    second.pos[2] += tuning.cellBlocks * 2;
    picture.update([first, second]);
    expect(cache.reachOf(second, false)).toBeUndefined();
    expect((shader.uniforms.uReachSize!.value as Float32Array)[1]).toBeLessThan(0);
    picture.update([first, second]);
    const before = cache.reachOf(second, false)!;
    expect(before).toBeDefined();
    const boxes = shader.uniforms.uReachBox!.value as Vector4[];
    const previousBox = boxes[1]!.clone();
    first.pos[0] += tuning.cellBlocks;
    second.pos[0] += tuning.cellBlocks;
    picture.update([first, second]);
    expect(cache.isCurrent(first)).toBe(true);
    expect(cache.isCurrent(second)).toBe(false);
    expect(cache.reachOf(second, false)).toBe(before);
    expect((shader.uniforms.uReachSize!.value as Float32Array)[1]).toBe(before.size);
    expect(boxes[1]).toEqual(previousBox);
    picture.update([first, second]);
    expect(cache.isCurrent(second)).toBe(true);
    expect(cache.reachOf(second, false)).not.toBe(before);
    expect(boxes[1]).not.toEqual(previousBox);
    picture.dispose();
    cache.dispose();
  });

  it('preserves each uploaded answer when shared sources separate and overwrite their former layer', () => {
    const { pool, cache, picture, shader, update } = setup();
    update();
    const source = pool.reachSlots.find((light) => light !== undefined)!;
    const first = { ...source, reachSource: {}, pos: [...source.pos] as [number, number, number] };
    const second = { ...source, reachSource: {}, pos: [...source.pos] as [number, number, number] };
    picture.update([first, second]);
    expect(cache.reachOf(first)).toBe(cache.reachOf(second));
    const boxes = shader.uniforms.uReachBox!.value as Vector4[];
    expect(boxes[0]!.w).toBe(boxes[1]!.w);
    for (const move of [
      () => {
        first.pos[0] += tuning.cellBlocks;
      },
      () => {
        first.pos[0] = second.pos[0];
      },
      () => {
        second.pos[0] += 2 * tuning.cellBlocks;
      },
    ]) {
      move();
      picture.update([first, second]);
      const texture = shader.uniforms.uReachGrid!.value as Data3DTexture;
      for (const [slot, lamp] of [first, second].entries()) {
        const reach = cache.reachOf(lamp)!;
        const box = boxes[slot]!;
        const y = Math.floor(lamp.pos[1] / reach.cellBlocks) - reach.origin[1];
        const z = Math.floor(lamp.pos[2] / reach.cellBlocks) - reach.origin[2];
        expect(reach.size).toBeGreaterThan(0);
        for (let x = 0; x < reach.size; x++) {
          const index = x + texture.image.width * (z + texture.image.height * (box.w * texture.image.width + y));
          const point = [x, y, z].map((value, axis) => (reach.origin[axis]! + value + 0.5) * reach.cellBlocks) as [
            number,
            number,
            number,
          ];
          expect(texture.image.data![index]! / 255).toBe(reach.at(point));
        }
      }
    }
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
