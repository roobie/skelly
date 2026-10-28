import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import type { NightVision } from '../src/core/schema.ts';
import { realSeconds } from '../src/core/time.ts';
import { HeldItems } from '../src/render/hands.ts';
import { LightPool } from '../src/render/lightPool.ts';
import { type FlareSource, flareSources, nightVisionFlare } from '../src/render/nightVisionFlare.ts';
import { baseRegistry } from './baseRegistry.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const BLOCK = 0.5;
const VIEW: NightVision = {
  gain: 4,
  tint: '#00ff00',
  grain: 0,
  edge: { darkening: 1, inner: 0.2, outer: 0.4 },
  flare: {
    strength: 0.5,
    distanceMetres: 2,
    blastIntensity: 10,
    recoverRealSeconds: realSeconds(0.5),
    haloRadius: 0.1,
  },
};
const open: SolidAt = () => false;

/** A camera in the middle of block (5, 5, 5), looking down -z. */
const fixtureCamera = () => {
  const camera = new PerspectiveCamera(70, 1, 0.1, 100);
  camera.position.set(5.5 * BLOCK, 5.5 * BLOCK, 5.5 * BLOCK);
  camera.updateMatrixWorld();
  return camera;
};

const flareOf = (sources: FlareSource[], { isSolid = open, camera = fixtureCamera(), dt = 0, last = 0 } = {}) =>
  nightVisionFlare({ sources, camera, view: VIEW, isSolid, blockSize: BLOCK, dt, last });

const ahead = (camera: PerspectiveCamera, x: number, z: number): FlareSource => ({
  position: camera.position.clone().add(new Vector3(x, 0, z)),
  brightness: 5,
});

describe('night-vision flare', () => {
  it("a light in view in the open flares the goggles, and the same light behind a wall doesn't", () => {
    const camera = fixtureCamera();
    const light = ahead(camera, 0, -5);
    const wall: SolidAt = (_x, _y, z) => z === 0;

    const inOpen = flareOf([light], { camera });
    const walled = flareOf([light], { camera, isSolid: wall });

    expect(inOpen.washout).toBeGreaterThan(0);
    expect(inOpen.halos.length).toBeGreaterThan(0);
    expect(walled.washout).toBe(0);
    expect(walled.halos).toEqual([]);
  });

  it("a light behind the camera or outside the goggles' field doesn't flare", () => {
    const camera = fixtureCamera();
    // Still on the picture, but past the fixture's `edge.outer`.
    const atSide = ahead(camera, 3.3, -5);

    expect(flareOf([ahead(camera, 0, 5)], { camera }).washout).toBe(0);
    expect(flareOf([atSide], { camera }).washout).toBe(0);
  });

  it("the goggles' own light never flares, and a torch carried in hand does", () => {
    const registry = baseRegistry();
    const inventory = new Inventory(registry);
    const goggles = inventory.create('night_vision_goggles');
    expect(inventory.add(goggles, { kind: 'worn' })).toBe(true);
    expect(toggleLight(registry, goggles, 0)).toBeUndefined();
    const held = new HeldItems(inventory, undefined, registry.figures.get('player')!, {
      nearPlaneMetres: 0.01,
      playerViewFovDegrees: 75,
    });
    const camera = fixtureCamera();
    held.update(camera);
    const pool = new LightPool(new Scene(), TEST_SENSE_TUNING.light.renderedFixtureLimit);
    const flareNow = () => {
      pool.update(inventory, { held, camera, blockSize: BLOCK, daylightScale: 1 });
      return flareOf(flareSources(pool, [], VIEW.flare.blastIntensity), { camera }).washout;
    };

    expect(flareNow()).toBe(0);
    expect(pool.lights.some((light) => light.intensity > 0)).toBe(true);

    const torch = inventory.create('torch');
    expect(inventory.add(torch, { kind: 'hand', side: 'right' })).toBe(true);
    expect(toggleLight(registry, torch, 0)).toBeUndefined();
    held.update(camera);
    expect(flareNow()).toBeGreaterThan(0);
    held.dispose();
  });

  it('the flare fades back after the light goes out and never rises without a source', () => {
    const camera = fixtureCamera();
    const peak = flareOf([ahead(camera, 0, -2)], { camera }).washout;
    expect(peak).toBeGreaterThan(0);

    const step = VIEW.flare.recoverRealSeconds / 4;
    let shown = peak;
    for (let i = 0; i < 12; i++) {
      const next = flareOf([], { camera, dt: step, last: shown }).washout;
      expect(next).toBeLessThanOrEqual(shown);
      shown = next;
    }
    expect(shown).toBeLessThan(peak / 4);
  });
});
