import { Inventory } from '@skelly/engine/inventory';
import { LampReachCache, type PoweredLight, World } from '@skelly/engine/world';
import { FixtureReach } from '@skelly/presentation/internal/render/fixtureReach.ts';
import { LightPool } from '@skelly/presentation/render';
import { MeshStandardMaterial, PerspectiveCamera, Scene, type Vector4, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { skyFixture } from './fixtures/sky.ts';

// A pool unlike either the content's size or the old fixed one, so a stale constant cannot agree by luck.
const SIZES = { heldLamps: 1, droppedLamps: 2, renderedFixtureLimit: 2 };
const FADE_GUARD = /UNROLLED_LOOP_INDEX >= (\d+)/;
const tuning = { cellBlocks: 1, rangeMetres: 8 };
const fixture: PoweredLight = { pos: [0.5, 2.5, 0.5], radius: 6, color: '#ffffff', intensity: 1 };

describe('light pool order', () => {
  it('addresses the first fixture at the first slot past the content-sized item slots, in the pool, the reach grid and the sky fade', () => {
    const inventory = new Inventory(baseRegistry());
    const pool = new LightPool(new Scene(), SIZES);
    pool.update(inventory, {
      camera: new PerspectiveCamera(),
      held: { lightPositionOf: () => false },
      blockSize: 1,
      daylightScale: 1,
      fixtures: [fixture],
    });
    const first = SIZES.heldLamps + SIZES.droppedLamps;
    expect(pool.itemSlots).toBe(first);
    expect(pool.size).toBe(first + SIZES.renderedFixtureLimit);
    expect(pool.reachSlots.findIndex((source) => source !== undefined)).toBe(first);

    const cache = new LampReachCache({ world: new World(), entities: inventory.entities }, () => false, 1, tuning);
    const picture = new FixtureReach(cache, pool.size, pool.itemSlots, 1, tuning);
    const material = new MeshStandardMaterial();
    picture.patch.install(material);
    const reachShader = {
      uniforms: {},
      vertexShader: '',
      fragmentShader: '#include <common>\n#include <lights_fragment_begin>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(reachShader, {} as WebGLRenderer);
    picture.update(pool.reachSlots);
    const sizes = (reachShader.uniforms.uReachSize as unknown as { value: Float32Array }).value;
    expect(Array.from(sizes).findIndex((size) => size > 0)).toBe(first);
    expect((reachShader.uniforms.uReachBox as unknown as { value: Vector4[] }).value).toHaveLength(pool.size);

    const sky = skyFixture(undefined, undefined, undefined, pool.itemSlots);
    const skyShader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <lights_fragment_begin>\n#include <lights_fragment_end>',
    };
    sky.update();
    sky.material.onBeforeCompile(skyShader as never, null as never);
    expect(Number(skyShader.fragmentShader.match(FADE_GUARD)?.[1])).toBe(first);
    picture.dispose();
    cache.dispose();
  });
});
